// P-11 row 8 (DESIGN-2.0.md:345; C5.6b): a push is refused unless a fetch+rebase onto the target's
// upstream ran after the last commit. Ported from 1.x `rebase-before-push.mjs` (newdle 0.2.172),
// rebuilt on evidence after the astra review (B4):
//
// - Evidence, not text. A rebase counts only when a blocking bash call (never a background job: its
//   result arrives before the rebase ends; M4 fix round 5) whose whole command is exactly one of
//   two literal forms finished with exit 0 and left no rebase in progress: `git rebase <ref>`, or
//   `git fetch [<remote> [<ref>]] && git rebase <ref>` (one fetch, one rebase, no option on either,
//   joined by `&&` only; a trailing bare `;` or comment is tolerated), where every git takes no
//   global option but `-C <literal path>` (M4 fix round 3, Jo 2026-09-29: "go ahead with the
//   invert" and "carve it out"; round 4, S2: a `;` or newline join, a second fetch, or a `cd` prefix
//   records nothing, since `git fetch nowhere; git rebase main` succeeds without the fetch). The ref
//   must resolve, to a commit other than HEAD afterwards (a rebase onto HEAD moves nothing).
//   Everything else records nothing: a wrapper (`command -v git rebase`), an assignment,
//   `--git-dir`/`--work-tree`, a masked failure. The
//   evidence is the commit HEAD was on afterwards in the repository the rebase ran in, keyed by
//   that repository's top level (RebaseEvidence.observe, fed from `tool_result`). A later commit
//   moves HEAD off that commit, so the evidence no longer matches.
//   A fetch-and-rebase written into the same command as the push has not run yet when the gate
//   decides, so it is not evidence: run it first, then push.
// - The push's own destination. The remote is the one named, else the branch's pushRemote /
//   remote.pushDefault / branch remote, else origin; the upstream is that remote's default branch
//   and, when the branch tracks a branch on that remote, the tracked branch too.
// - Fresh. The gate fetches that remote and requires `git merge-base --is-ancestor <upstream> <rev>`
//   to exit 0 for each upstream: the rebase landed on what the remote has now.
// - Fail closed. Detached HEAD, a failed fetch, no resolvable upstream, a directory or argument the
//   gate cannot read, or any ancestor status other than 0 refuses the push.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { type Exec, expandShell, gitCall, gitDir } from "../exec";
import { parseShell, type Word } from "../shell-parse";
import { ARTIFACT_FAILED_PREFIX, ARTIFACT_FAILURES_SURFACED, ARTIFACT_PASSED_PREFIX } from "../../../surface/src/types";
import type { CallContext, Refusal, ToolCall } from "../types";

function git(args: string[], cwd: string, timeout = 5000): { status: number | null; out: string } {
	const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" } });
	return { status: r.status, out: (r.stdout ?? "").trim() };
}

/** The repository's top-level directory, or null outside a work tree. */
function topLevel(dir: string): string | null {
	if (!dir || !existsSync(dir)) return null;
	const r = git(["rev-parse", "--show-toplevel"], dir);
	return r.status === 0 && r.out ? r.out : null;
}

/**
 * Whether a bash `tool_result` is a finished, blocking call that succeeded: the only result a rebase
 * can be read from. OMP returns a background start at once with `details.async` set to an object
 * (`{ state: "running", jobId, type: "bash" }`, @oh-my-pi/pi-coding-agent v18.3.0
 * src/tools/bash.ts #buildBackgroundStartResult), before the command has finished, and `isError`
 * false; any result carrying `details.async` is no evidence (fable, M4 fix round 5; the classifier
 * reads async the same way, classifier/extension.ts).
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

/** A word typed out as literal text: no expansion, glob or unknown part. */
const literal = (w: Word): boolean => !w.opaque && !w.glob && !w.expanded;

/**
 * One `git [-C <literal>]… <sub> …` command in a rebase-evidence sequence: its directory (every
 * `-C` composed left to right from `dir` by gitDir, as git does), subcommand and arguments; null
 * when any word is not literal, the head is not the bare word `git`, a global option other than
 * `-C` appears, or a `-C` path does not resolve.
 */
function plainGit(words: Word[], dir: string): { dir: string; sub: string; args: string[] } | null {
	if (words.length === 0 || !words.every(literal) || words[0]!.text !== "git") return null;
	const hops: string[] = [];
	let i = 1;
	while (i < words.length && words[i]!.text.startsWith("-")) {
		if (words[i]!.text !== "-C" || i + 1 >= words.length) return null;
		hops.push(words[i + 1]!.text);
		i += 2;
	}
	const d = gitDir(dir, hops);
	const sub = words[i];
	return sub && d !== null ? { dir: d, sub: sub.text, args: words.slice(i + 1).map((w) => w.text) } : null;
}

/** Successful rebases this session: repository top level → commits HEAD was on after them. */
export class RebaseEvidence {
	readonly #commits = new Map<string, Set<string>>();

	/**
	 * A bash call finished: record the post-rebase HEAD of the repository it rebased, when it
	 * succeeded and the whole command is a modeled form (see the header). A success status proves
	 * the rebase ran and succeeded only in that shape (astra review round 2, R2-B3; round 3, R3-B2,
	 * R3-B6).
	 */
	observe(command: string, cwd: string, env: Record<string, string | undefined>, ok: boolean): void {
		if (!ok) return;
		// A session-wide repository selector would move the rebase somewhere the command does not name.
		if (env.GIT_DIR !== undefined || env.GIT_WORK_TREE !== undefined) return;
		const r = parseShell(command, { cwd, env });
		if (r.failures.length > 0 || r.keywords.length > 0) return;
		const cmds = r.commands;
		if (cmds.length === 0 || cmds.length > 2 || cmds.some((c) => !c.top || c.redirects.length > 0 || !c.dirKnown)) return;
		// Joins between the commands: `&&` only. One more operator after the last command is a
		// trailing `;` (or newline) with nothing after it, tolerated.
		const joins = r.ops.slice(0, cmds.length - 1);
		const trailing = r.ops.slice(cmds.length - 1);
		if (joins.some((op) => op !== "&&") || trailing.length > 1 || trailing.some((op) => op !== ";" && op !== "\n")) return;
		// The fetch half is the modeled `git fetch [<remote> [<ref>]]`: no option (fable: `--dry-run`
		// fetches nothing, M4 fix round 5).
		if (cmds.length === 2) {
			const f = plainGit(cmds[0]!.words, cmds[0]!.dir);
			if (f?.sub !== "fetch" || f.args.length > 2 || f.args.some((a) => a.startsWith("-"))) return;
		}
		const last = cmds.at(-1)!;
		const g = plainGit(last.words, last.dir);
		// Exactly `git rebase <ref>`: no option at all (astra-5 S5; `--autostash`, `--stat` and the rest
		// are not the recorded form).
		if (!g || g.sub !== "rebase" || g.args.length !== 1 || g.args[0]!.startsWith("-")) return;
		const ref = g.args[0]!;
		const repo = topLevel(g.dir);
		if (!repo) return;
		const inProgress = ["rebase-merge", "rebase-apply"].some((d) => {
			const p = git(["rev-parse", "--git-path", d], repo).out;
			return p !== "" && existsSync(resolve(repo, p));
		});
		if (inProgress) return;
		const head = git(["rev-parse", "--verify", "-q", "HEAD"], repo);
		if (head.status !== 0) return;
		// A rebase onto HEAD itself (`HEAD`, `@`, the branch's own name) moves nothing, and a ref that
		// does not resolve could not have been rebased onto: neither is evidence (fable, M4 fix round 5).
		// Only the state after the call is visible, so a ref at the same commit as HEAD afterwards counts
		// as onto-self too; a branch with no commits of its own has nothing to push anyway.
		const onto = git(["rev-parse", "--verify", "-q", "--end-of-options", `${ref}^{commit}`], repo);
		if (onto.status !== 0 || onto.out === head.out) return;
		const set = this.#commits.get(repo) ?? new Set<string>();
		set.add(head.out);
		this.#commits.set(repo, set);
	}

	has(repo: string, commit: string): boolean {
		return this.#commits.get(repo)?.has(commit) ?? false;
	}
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

/** Row 8 over one tool call. */
export function checkPushRebase(call: ToolCall, ctx: CallContext, evidence: RebaseEvidence | null = null): Refusal {
	if (call.toolName !== "bash") return null;
	const cmd = String(call.input.command ?? "");
	const base = typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd;
	for (const e of expandShell(cmd, base, ctx.env).commands) {
		const p = parsePush(e);
		if (!p) continue;
		if ("blind" in p) return refuse(`${p.blind}, so the gate cannot tell what it pushes or where`, "Spell the push out literally.", cmd);
		if (p.flags.includes("--delete") || p.flags.includes("-d")) continue; // row 6 refuses ref deletion
		const branch = git(["symbolic-ref", "--short", "-q", "HEAD"], p.repo).out || null;
		const revs = pushedRevs(p, branch);
		if (revs.length === 0) continue; // tags only
		if (!branch && revs.includes("HEAD")) return refuse(`${p.repo} is on a detached HEAD, so there is no branch whose upstream the push can be checked against`, "Check out the branch to push.", cmd);
		const remote = pushRemote(p, branch ?? "");
		if (!remote) return refuse(`no remote to push to could be resolved in ${p.repo}`, "Name the remote.", cmd);
		const fetch = git(["fetch", remote, "--prune", "--quiet"], p.repo, 15000);
		if (fetch.status !== 0) return refuse(`\`git fetch ${remote}\` failed in ${p.repo} (exit ${fetch.status ?? "timeout"}), so the target's upstream cannot be checked`, "Fix the remote, fetch, rebase.", cmd);
		const ups = upstreams(p.repo, remote, branch ?? "");
		if (ups.length === 0) return refuse(`${remote} has no default branch the gate can find (no ${remote}/HEAD, ${remote}/main or ${remote}/master)`, `Run \`git remote set-head ${remote} --auto\`.`, cmd);
		for (const rev of revs) {
			const sha = git(["rev-parse", "--verify", "-q", `${rev}^{commit}`], p.repo);
			if (sha.status !== 0) return refuse(`'${rev}' is not a commit in ${p.repo}`, "Push an existing branch.", cmd);
			const remedy =
				`Run \`git fetch ${remote} && git rebase ${ups[0]}\` as its own command (or \`git rebase ${ups[0]}\` alone), re-run the tests, then push. ` +
				`Evidence is taken only from exactly that spelling, joined by \`&&\` (optionally \`git -C <literal path>\` on each git), never after \`;\`, a newline, \`cd\` or a second fetch, and never through a wrapper, an alias, an assignment, GIT_* variables, --git-dir or --work-tree, or \`git pull --rebase\`. ` +
				`If the rebase would rewrite commits already on the remote, stop and report the divergence; that force-push is § A4 reserved.`;
			for (const up of ups) {
				const anc = git(["merge-base", "--is-ancestor", up, sha.out], p.repo);
				if (anc.status !== 0) {
					return refuse(
						`'${rev === "HEAD" ? branch : rev}' does not contain ${up} after a fresh fetch (git merge-base --is-ancestor ${up} ${rev} exits ${anc.status ?? "timeout"})`,
						remedy,
						cmd,
					);
				}
			}
			if (!evidence?.has(p.repo, sha.out)) {
				return refuse(
					`no successful rebase in ${p.repo} this session left HEAD on ${sha.out.slice(0, 12)} ('${rev === "HEAD" ? branch : rev}'): a commit made after the last rebase, or no rebase at all`,
					remedy,
					cmd,
				);
			}
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
