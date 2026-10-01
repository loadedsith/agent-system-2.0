// P-11 row 8 (DESIGN-2.0.md P-11 table, the push row; C5.6b): a push is let through only when the
// pushed commit contains the target's freshly fetched upstream and its tree carries a passing test
// record on the session's workload. Ported from 1.x `rebase-before-push.mjs` (newdle 0.2.172),
// rebuilt on evidence after the astra review (B4), and bound to content rather than to a rebase
// command (MIGRATION.md § M7 follow-ups item 13; wl-muptjioqjtvthc PLAN.md § 2):
//
// - The push's own destination. The remote is the one named, else the branch's pushRemote /
//   remote.pushDefault / branch remote, else origin; the upstream is that remote's default branch
//   and, when the branch tracks a branch on that remote, the tracked branch too.
// - Fresh. The gate fetches that remote and requires `git merge-base --is-ancestor <upstream> <rev>`
//   to exit 0 for each upstream. A rebase onto the upstream and a `git merge <upstream>` both pass.
// - Tested. The workload's ledger holds an `artifact-tree:` record (surface/src/signals.ts
//   artifactTrees; written by surface/extensions/lane.ts when a declared slice artifact exits 0 on
//   an unchanged working tree) whose repo is the push's top level, whose whole command is one bare
//   test-runner invocation (gates/src/test-run.ts isTestRunCommand: a runner first, no pipe, chain,
//   redirection, quote or `--help`; the recorder judges the whole shell line's exit status), and whose tree is
//   `git rev-parse <rev>^{tree}` or differs from it only in paths under `.ai/decision-log/` (the
//   close entries no test reads). A record from any slice of the workload counts, done ones too. A
//   commit after the test run changes the tree, so the record no longer matches.
// - Fail closed. A session with no workload, a ledger that cannot be read, detached HEAD, a failed
//   fetch, no resolvable upstream, a directory or argument the gate cannot read, any ancestor status
//   other than 0, or a git error reading the pushed tree refuses the push. A push written into the
//   same command as the test run is judged before that run, so it has no record yet.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Exec, expandShell, gitCall } from "../exec";
import type { ArtifactTree } from "../../../surface/src/signals";
import { ARTIFACT_FAILED_PREFIX, ARTIFACT_FAILURES_SURFACED, ARTIFACT_PASSED_PREFIX } from "../../../surface/src/types";
import { isTestRunCommand } from "../test-run";
import type { CallContext, Refusal, ToolCall } from "../types";

function git(args: string[], cwd: string, timeout = 5000, trim = true): { status: number | null; out: string } {
	const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
	const out = r.stdout ?? "";
	return { status: r.status, out: trim ? out.trim() : out };
}

/** The repository's top-level directory, or null outside a work tree. */
function topLevel(dir: string): string | null {
	if (!dir || !existsSync(dir)) return null;
	const r = git(["rev-parse", "--show-toplevel"], dir);
	return r.status === 0 && r.out ? r.out : null;
}

/**
 * Whether a bash `tool_result` is a finished, blocking call that succeeded: the only result a push's
 * success can be read from (PushFailures.passed). OMP returns a background start at once with
 * `details.async` set to an object (`{ state: "running", jobId, type: "bash" }`,
 * @oh-my-pi/pi-coding-agent v18.3.0 src/tools/bash.ts #buildBackgroundStartResult), before the
 * command has finished, and `isError` false; any result carrying `details.async` is no success
 * (fable, M4 fix round 5; the classifier reads async the same way, classifier/extension.ts).
 */
export function blockingSuccess(details: unknown, isError: boolean): boolean {
	if (isError) return false;
	if (details && typeof details === "object" && "async" in details) return details.async === undefined || details.async === null;
	return true;
}

/** git push flags that take a separate value word. */
const PUSH_VALUE_FLAGS = /^(--repo|--receive-pack|--exec|--push-option|-o|--signed)$/;

interface Push {
	repo: string;
	remote: string | null;
	refspecs: string[];
	flags: string[];
}

function parsePush(e: Exec): Push | { blind: string } | null {
	const g = gitCall(e);
	if (!g || g.sub !== "push") return null;
	if (!g.dir || !e.dirKnown) return { blind: "the directory it pushes from is not known until it runs" };
	if (g.args.some((w) => w.opaque)) return { blind: "an argument is not known until it runs" };
	const pos: string[] = [];
	const flags: string[] = [];
	for (let i = 0; i < g.args.length; i++) {
		const t = g.args[i]!.text;
		if (t === "--") {
			pos.push(...g.args.slice(i + 1).map((w) => w.text));
			break;
		}
		if (t.startsWith("-")) {
			flags.push(t);
			if (PUSH_VALUE_FLAGS.test(t)) i++;
			continue;
		}
		pos.push(t);
	}
	const repo = topLevel(g.dir);
	if (!repo) return null; // not a repository: the push fails on its own
	return { repo, remote: pos[0] ?? null, refspecs: pos.slice(1), flags };
}

/** The commits a push moves, as local revs: HEAD for a bare push, else each refspec's source. */
function pushedRevs(p: Push, branch: string | null): string[] {
	if (p.refspecs.length === 0) return p.flags.includes("--tags") ? [] : ["HEAD"];
	const revs: string[] = [];
	for (const spec of p.refspecs) {
		const plain = spec.replace(/^\+/, "");
		const src = plain.includes(":") ? plain.slice(0, plain.indexOf(":")) : plain;
		if (src === "" || src.startsWith("refs/tags/")) continue;
		revs.push(src === "@" || src === branch ? "HEAD" : src);
	}
	return revs;
}

/** The push's remote: named, else pushRemote / remote.pushDefault / branch remote, else origin. */
function pushRemote(p: Push, branch: string): string | null {
	if (p.remote) return p.remote;
	for (const key of [`branch.${branch}.pushRemote`, "remote.pushDefault", `branch.${branch}.remote`]) {
		const v = git(["config", "--get", key], p.repo).out;
		if (v) return v;
	}
	return git(["config", "--get", "remote.origin.url"], p.repo).out ? "origin" : null;
}

/** The upstreams on `remote` a push must contain: its default branch, and the branch's tracked branch there. */
function upstreams(repo: string, remote: string, branch: string): string[] {
	const out: string[] = [];
	const sym = git(["symbolic-ref", "-q", `refs/remotes/${remote}/HEAD`], repo);
	if (sym.status === 0 && sym.out.startsWith("refs/remotes/")) out.push(sym.out.slice("refs/remotes/".length));
	else for (const m of ["main", "master"]) if (git(["rev-parse", "--verify", "-q", `refs/remotes/${remote}/${m}`], repo).status === 0) {
		out.push(`${remote}/${m}`);
		break;
	}
	const trackedRemote = git(["config", "--get", `branch.${branch}.remote`], repo).out;
	const merge = git(["config", "--get", `branch.${branch}.merge`], repo).out;
	if (trackedRemote === remote && merge.startsWith("refs/heads/")) {
		const tracked = `${remote}/${merge.slice("refs/heads/".length)}`;
		if (!out.includes(tracked) && git(["rev-parse", "--verify", "-q", `refs/remotes/${tracked}`], repo).status === 0) out.push(tracked);
	}
	return out;
}

function refuse(why: string, remedy: string, cmd: string): Refusal {
	return {
		block: true,
		reason: `P-11 row 8 refused this push: ${why}. ${remedy} Then push in its own command. Command: ${cmd}`,
	};
}

/** The one directory a push may change after its test run: the close entries, which no test reads. */
const UNTESTED_PREFIX = ".ai/decision-log/";

/** The paths two trees differ in (renames as a delete plus an add), or null on a git error. */
function changedPaths(repo: string, from: string, to: string): string[] | null {
	const r = git(["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", from, to, "--"], repo, 5000, false);
	return r.status === 0 ? r.out.split("\0").filter((s) => s !== "") : null;
}

/**
 * The session workload's `artifact-tree:` records (surface/src/signals.ts artifactTrees), read only
 * when a push is judged; null when the session has no workload. A throw is a ledger that cannot be read.
 */
export type TestRecords = (() => ArtifactTree[]) | null;

/** Row 8 over one tool call. */
export function checkPushRebase(call: ToolCall, ctx: CallContext, records: TestRecords = null): Refusal {
	if (call.toolName !== "bash") return null;
	const cmd = String(call.input.command ?? "");
	const base = typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd;
	/** The workload's records, and those whose command is a bare test-runner invocation; read once per call. */
	let all: ArtifactTree[] | undefined;
	let tests: ArtifactTree[] = [];
	for (const e of expandShell(cmd, base, ctx.env).commands) {
		const p = parsePush(e);
		if (!p) continue;
		if ("blind" in p) return refuse(`${p.blind}, so the gate cannot tell what it pushes or where`, "Spell the push out literally.", cmd);
		if (p.flags.includes("--delete") || p.flags.includes("-d")) continue; // row 6 refuses ref deletion
		const branch = git(["symbolic-ref", "--short", "-q", "HEAD"], p.repo).out || null;
		const revs = pushedRevs(p, branch);
		if (revs.length === 0) continue; // tags only
		if (records === null) return refuse("this session has no workload, so the ledger holds no test record for it", "Push from the lane that holds the workload.", cmd);
		if (!branch && revs.includes("HEAD")) return refuse(`${p.repo} is on a detached HEAD, so there is no branch whose upstream the push can be checked against`, "Check out the branch to push.", cmd);
		const remote = pushRemote(p, branch ?? "");
		if (!remote) return refuse(`no remote to push to could be resolved in ${p.repo}`, "Name the remote.", cmd);
		const fetch = git(["fetch", remote, "--prune", "--quiet"], p.repo, 15000);
		if (fetch.status !== 0) return refuse(`\`git fetch ${remote}\` failed in ${p.repo} (exit ${fetch.status ?? "timeout"}), so the target's upstream cannot be checked`, "Fix the remote, then fetch.", cmd);
		const ups = upstreams(p.repo, remote, branch ?? "");
		if (ups.length === 0) return refuse(`${remote} has no default branch the gate can find (no ${remote}/HEAD, ${remote}/main or ${remote}/master)`, `Run \`git remote set-head ${remote} --auto\`.`, cmd);
		const remedy =
			`Bring ${ups[0]} in (\`git fetch ${remote} && git merge ${ups[0]}\`, or a rebase that rewrites nothing already pushed), then run the slice's declared test artifact (slice_artifact) on that tree with nothing left uncommitted. ` +
			"The artifact must be a bare test-runner command (no pipe, `cd`, `||`, `;` or redirection), and it must finish in the foreground: OMP backgrounds a bash call after its auto-background threshold (60 s by default) and a backgrounded run records nothing, so split a long suite into several declared artifacts. " +
			`If bringing ${ups[0]} in would rewrite commits already on the remote, stop and report; that force-push is § A4 reserved.`;
		for (const rev of revs) {
			const name = rev === "HEAD" ? branch : rev;
			const sha = git(["rev-parse", "--verify", "-q", `${rev}^{commit}`], p.repo);
			if (sha.status !== 0) return refuse(`'${rev}' is not a commit in ${p.repo}`, "Push an existing branch.", cmd);
			for (const up of ups) {
				const anc = git(["merge-base", "--is-ancestor", up, sha.out], p.repo);
				if (anc.status !== 0) {
					return refuse(`'${name}' does not contain ${up} after a fresh fetch (git merge-base --is-ancestor ${up} ${rev} exits ${anc.status ?? "timeout"})`, remedy, cmd);
				}
			}
			if (all === undefined) {
				try {
					all = records();
				} catch (err) {
					return refuse(`the ledger could not be read for this workload's test records (${String(err)})`, "Make the ledger readable.", cmd);
				}
				tests = all.filter((r) => isTestRunCommand(r.command));
			}
			const tree = git(["rev-parse", "--verify", "-q", `${sha.out}^{tree}`], p.repo);
			if (tree.status !== 0 || !tree.out) return refuse(`the tree of '${name}' could not be read in ${p.repo}`, "Push an existing branch.", cmd);
			const mine = tests.filter((r) => r.repo === p.repo);
			// The record's tree is the pushed tree, or differs from it only under UNTESTED_PREFIX.
			const covered = mine.some((r) => {
				if (r.tree === tree.out) return true;
				const paths = changedPaths(p.repo, r.tree, tree.out);
				return paths !== null && paths.length > 0 && paths.every((f) => f.startsWith(UNTESTED_PREFIX));
			});
			if (covered) continue;
			let why = `no passing test record on this workload is for the pushed tree ${tree.out.slice(0, 12)} ('${name}'); the workload has ${mine.length} test record${mine.length === 1 ? "" : "s"} for ${p.repo}`;
			const shaped = all.filter((r) => r.repo === p.repo && !isTestRunCommand(r.command));
			const newestShaped = shaped.at(-1);
			if (mine.length === 0 && newestShaped) {
				why = `no passing test record on this workload is for the pushed tree ${tree.out.slice(0, 12)} ('${name}'); the workload has ${shaped.length} test record${shaped.length === 1 ? "" : "s"} for ${p.repo}, none from a bare test-runner command (the newest: \`${newestShaped.command}\`)`;
			}
			const newest = mine.at(-1);
			if (newest) {
				const diff = changedPaths(p.repo, newest.tree, tree.out);
				const shown = diff === null ? "paths git could not list" : diff.slice(0, 5).join(", ") + (diff.length > 5 ? ` and ${diff.length - 5} more` : "");
				why += `, the newest on tree ${newest.tree.slice(0, 12)} (\`${newest.command}\`), which differs from it in ${shown}`;
			}
			return refuse(why, remedy, cmd);
		}
	}
	return null;
}

/** Whether a bash call pushes a branch row 8 judges (a push that is neither blind nor a deletion). */
export function pushChecked(call: ToolCall, ctx: CallContext): boolean {
	if (call.toolName !== "bash") return false;
	const cwd = typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd;
	return expandShell(String(call.input.command ?? ""), cwd, ctx.env).commands.some((e) => {
		const p = parsePush(e);
		return p !== null && !("blind" in p) && !p.flags.includes("--delete") && !p.flags.includes("-d");
	});
}

/**
 * Row 8 refusals in a row on one slice: the slice's close artifact (a pushed branch) failing its gate,
 * § B3 item 3. A push that row 8 let through *and that succeeded* ends the run (decided on the push's
 * tool result, not at tool_call: a let-through push the remote rejects is not a pass; Codex S3); so
 * does the session moving to another slice. The surface counts `artifact-failed:` messages per slice
 * since the last `artifact-passed:` (surface/src/signals.ts artifactFailures) and shows the line at
 * ARTIFACT_FAILURES_SURFACED, so nothing is sent for a run shorter than that; the run reaching it
 * sends one message per refusal in it, each later refusal one more, and the pass that ends a surfaced
 * run sends the one `artifact-passed:` that clears the line.
 */
export class PushFailures {
	#slice: string | null = null;
	#run: { callId: string; reason: string }[] = [];

	/** A refused push on `slice`: the `artifact-failed:` message bodies owed now, oldest first. */
	refused(slice: string, callId: string, reason: string): string[] {
		if (slice !== this.#slice) {
			this.#slice = slice;
			this.#run = [];
		}
		this.#run.push({ callId, reason });
		const n = this.#run.length;
		if (n < ARTIFACT_FAILURES_SURFACED) return [];
		const owed = n === ARTIFACT_FAILURES_SURFACED ? this.#run : this.#run.slice(-1);
		const first = n - owed.length + 1;
		return owed.map((f, i) => `${ARTIFACT_FAILED_PREFIX} P-11 row 8 refused push ${first + i} in a row on this slice (tool call ${f.callId}): ${f.reason}`);
	}

	/**
	 * A push row 8 let through succeeded on `slice`: the run is over. Returns the `artifact-passed:`
	 * body owed when the run had reached the surface, else null.
	 */
	passed(slice: string | null, callId: string): string | null {
		const surfaced = slice !== null && slice === this.#slice && this.#run.length >= ARTIFACT_FAILURES_SURFACED;
		this.#slice = null;
		this.#run = [];
		return surfaced ? `${ARTIFACT_PASSED_PREFIX} push let through by P-11 row 8 succeeded (tool call ${callId})` : null;
	}
}
