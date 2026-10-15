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
//   close entries no test reads). A record from any slice of the workload counts, done ones too,
//   and the recorder writes one for a done slice's declared command re-run on a new tree
//   (surface/src/signals.ts recordableArtifactCommands: open, paused and done slices, never
//   cancelled; wl-mupzpidbb3ksg0 PLAN.md § 2), so a rebase after a slice closed needs no fresh
//   declaration. A commit after the test run changes the tree, so the record no longer matches.
// - Fail closed. A session with no workload, a ledger that cannot be read, detached HEAD, a failed
//   fetch, no resolvable upstream, a directory or argument the gate cannot read, any ancestor status
//   other than 0, or a git error reading the pushed tree refuses the push. A push written into the
//   same command as the test run is refused as a compound command (below), and would have no record yet.
// - Destination (MIGRATION.md item 24; wl-muraerdsgw7gn4 PLAN.md § 2.2 step 2). Row 8 resolves where a
//   let-through push lands, statically, and gates/extensions/r08-push-rebase.ts records each branch
//   as a `push-dest: <remote> <branch> <sha>` entry before the push runs. `src:dst` gives dst (never
//   remapped by remote.<name>.push); a lone branch gives its own name; a bare push gives the current
//   branch under push.default simple or current, and branch.<b>.merge under upstream. Options take
//   their last spelling, as git's parse-options does: `--tags --no-tags` is a branch push. A push of
//   tags alone, a lone tag, a
//   tag pushed to `refs/tags/<name>` and any other ref outside refs/heads/ is no branch and records
//   nothing. Refused: a push option row 8 does not resolve (PUSH_FLAGS lists the ones it does;
//   `--push-option`, `--atomic`, `--recurse-submodules`, `--signed`, `--exec` and an abbreviation
//   are refused, "push with plain options"); a remote with
//   remote.<name>.mirror (even with explicit refspecs), `--mirror`, `--all`/`--branches`, a wildcard
//   or `:` refspec; a bare push or lone src to a remote with a remote.<name>.push mapping, a bare
//   push under push.default matching or nothing, a lone src that is no local branch, a lone src
//   branch whose one branch.<b>.merge (with branch.<b>.remote set) is not refs/heads/<b> under
//   push.default upstream or tracking (git pushes it to that upstream instead, builtin/push.c
//   refspec_append_mapped), a tag source
//   with an unqualified or refs/heads/ destination (git-push(1) expands an unqualified dst to a ref
//   the remote already has, so `v1:wl/x` can move branch wl/x), and an unqualified destination whose
//   first component is heads, tags or remotes (refs.c ref_rev_parse_rules try `refs/%s` first, so
//   `HEAD:heads/wl/x` can move branch wl/x) ("push with an explicit `<src>:<dst>` refspec"); and a
//   push sharing its bash call with any command but `cd`
//   ("push in its own command"): a `git switch` before it would move the branch after resolution.
// - Scratch (PLAN wl-mv5oikd5jtquww § 1.2): a push whose destination is a path inside the lane's own
//   scratch root (r06-reserved.ts scratchFor, pushToScratch) is not row 8's: no fetch, no test
//   record, and it may share its call. The call is marked confined, so the fence runs it with writes
//   only inside the root and no network.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { bashCommand, type Exec, execText, expandShell, gitCall } from "../exec";
import type { ArtifactTree } from "../../../surface/src/signals";
import type { PushDest } from "../../../surface/src/test-run";
import { ARTIFACT_FAILED_PREFIX, ARTIFACT_FAILURES_SURFACED, ARTIFACT_PASSED_PREFIX } from "../../../surface/src/types";
import { markConfined } from "../session";
import { isTestRunCommand } from "../test-run";
import type { CallContext, Refusal, ToolCall } from "../types";
import { pushToScratch, type Scratch, scratchFor } from "./r06-reserved";

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

/**
 * The push options row 8 resolves, by exact spelling, each with the boolean it sets: `[name, state]`
 * (git 2.50.1 builtin/push.c cmd_push). parse-options gives a boolean its last spelling, so
 * `--tags --no-tags` pushes no tags and takes git's default push (code review r3 B6); `--verify`
 * is git's `--no-verify` negated. The force family, `--prune` and `-d`/`--delete` are row 6's
 * reserved actions and pass here so row 6's refusal stands; `--all`, `--branches` and `--mirror`
 * keep row 8's own refusal (EVERY_REF_FLAGS). `--repo` (with its value) is read by parsePush, and
 * `--force-with-lease=<…>` is matched by prefix. Any other option, an abbreviation included
 * (`--ta` is `--tags` to git), is refused: row 8 does not follow what it does to the push.
 */
const PUSH_FLAGS: Record<string, readonly [name: string, state: boolean]> = {
	"-u": ["set-upstream", true],
	"--set-upstream": ["set-upstream", true],
	"-q": ["quiet", true],
	"--quiet": ["quiet", true],
	"-v": ["verbose", true],
	"--verbose": ["verbose", true],
	"--progress": ["progress", true],
	"--no-progress": ["progress", false],
	"--porcelain": ["porcelain", true],
	"-n": ["dry-run", true],
	"--dry-run": ["dry-run", true],
	"--tags": ["tags", true],
	"--no-tags": ["tags", false],
	"--follow-tags": ["follow-tags", true],
	"--no-follow-tags": ["follow-tags", false],
	"--verify": ["no-verify", false],
	"--no-verify": ["no-verify", true],
	"-d": ["delete", true],
	"--delete": ["delete", true],
	"--no-delete": ["delete", false],
	"-f": ["force", true],
	"--force": ["force", true],
	"--force-with-lease": ["force-with-lease", true],
	"--force-if-includes": ["force-if-includes", true],
	"--prune": ["prune", true],
};

/** The options a refusal names as the ones to use instead. */
const PLAIN_OPTIONS = "-u/--set-upstream, -q/--quiet, -v/--verbose, -n/--dry-run, --porcelain, --[no-]progress, --[no-]tags, --[no-]follow-tags, --[no-]verify, --repo <remote>";

/** Flags that push every branch or every ref rather than named ones. */
const EVERY_REF_FLAGS: Record<string, true> = { "--all": true, "--branches": true, "--mirror": true };

interface Push {
	repo: string;
	/** The remote named on the command line: the first operand, else the last `--repo` (git-push(1): the operand takes precedence). */
	remote: string | null;
	refspecs: string[];
	/** Each PUSH_FLAGS boolean the push sets, at its last spelling. */
	on: Record<string, boolean>;
	/** The first of `--all`, `--branches` and `--mirror` it gives, or null (refused on presence). */
	every: string | null;
	/** The first option word row 8 does not resolve, or null; parsing stops there, since it may take the next word. */
	unknown: string | null;
}

function parsePush(e: Exec): Push | { blind: string } | null {
	const g = gitCall(e);
	if (!g || g.sub !== "push") return null;
	if (!g.dir || !e.dirKnown) return { blind: "the directory it pushes from is not known until it runs" };
	if (g.args.some((w) => w.opaque)) return { blind: "an argument is not known until it runs" };
	const pos: string[] = [];
	const on: Record<string, boolean> = {};
	let every: string | null = null;
	let unknown: string | null = null;
	let repoOpt: string | null = null;
	const words = g.args.map((w) => w.text);
	for (let i = 0; i < words.length; i++) {
		const t = words[i]!;
		if (t === "--" || t === "--end-of-options") {
			pos.push(...words.slice(i + 1));
			break;
		}
		if (!t.startsWith("-")) {
			pos.push(t);
			continue;
		}
		// A bundle of short flags (`-uq`) is each of its letters (parse-options).
		const spellings = /^-[^-]{2,}$/.test(t) ? [...t.slice(1)].map((c) => `-${c}`) : [t];
		if (spellings.every((s) => PUSH_FLAGS[s])) {
			for (const s of spellings) on[PUSH_FLAGS[s]![0]] = PUSH_FLAGS[s]![1];
		} else if (EVERY_REF_FLAGS[t]) every ??= t;
		else if (t === "--repo" && i + 1 < words.length) repoOpt = words[++i]!;
		else if (t.startsWith("--repo=") && t !== "--repo=") repoOpt = t.slice("--repo=".length);
		else if (t.startsWith("--force-with-lease=")) on["force-with-lease"] = true;
		else {
			unknown = t;
			break;
		}
	}
	const repo = topLevel(g.dir);
	if (!repo) return null; // not a repository: the push fails on its own
	return { repo, remote: pos[0] ?? repoOpt, refspecs: pos.slice(1), on, every, unknown };
}

/** The commits a push moves, as local revs: HEAD for a bare push, none for a bare push of tags, else each refspec's source. */
function pushedRevs(p: Push, branch: string | null): string[] {
	if (p.refspecs.length === 0) return p.on.tags ? [] : ["HEAD"];
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

/** The remedy for a destination row 8 cannot follow (PLAN.md § 2.2 step 2). */
const EXPLICIT = "Instead, push with an explicit `<src>:<dst>` refspec, e.g. `git push origin HEAD:<branch>`.";

/**
 * An unqualified destination git can expand to a ref under refs/ named by its own first component:
 * refs.c ref_rev_parse_rules try `refs/%s` before `refs/heads/%s`, so on a remote that has
 * refs/heads/wl/x the destination `heads/wl/x` updates wl/x, and on one that does not, a new branch
 * heads/wl/x. Which one depends on the remote's refs at push time, so row 8 cannot name the branch.
 */
const ABBREVIATED = /^(heads|tags|remotes)(\/|$)/;

/** A branch on the remote a push updates, and the local rev whose commit lands there. */
interface Dest {
	branch: string;
	src: string;
}

/** Whether an unqualified name is a local branch, only a local tag, or neither. */
function localKind(repo: string, name: string): "branch" | "tag" | null {
	if (git(["rev-parse", "--verify", "-q", `refs/heads/${name}`], repo).status === 0) return "branch";
	if (git(["rev-parse", "--verify", "-q", `refs/tags/${name}`], repo).status === 0) return "tag";
	return null;
}

/**
 * Why a lone src naming local branch `b` may not land on `b`, or null. Under push.default upstream
 * (or its deprecated alias tracking) git rewrites such a src to `<src>:<branch.<b>.merge>`
 * (builtin/push.c refspec_append_mapped) when the branch has exactly one merge value, and it has
 * one only while branch.<b>.remote is set (remote.c set_merge clears merge_nr without a remote).
 * Row 8 does not follow that rewrite, so it refuses when git would make it to any ref but
 * `refs/heads/<b>` itself: the repeat of `git push -u origin wl/<wl>` lands on wl/<wl> (code review
 * r3, Kimi minors 1-2). A config git cannot read refuses too.
 */
function upstreamRewrite(repo: string, b: string): string | null {
	const mode = git(["config", "--get", "push.default"], repo).out;
	if (mode !== "upstream" && mode !== "tracking") return null;
	if (git(["config", "--get", `branch.${b}.remote`], repo).status === 1) return null; // unset: git keeps no merge value
	const r = git(["config", "-z", "--get-all", `branch.${b}.merge`], repo, 5000, false);
	if (r.status === 1) return null;
	if (r.status !== 0) return `push.default is ${mode} and branch.${b}.merge could not be read (git config exits ${r.status ?? "timeout"}), so where git pushes the lone src '${b}' is not known`;
	const merges = r.out.split("\0").slice(0, -1);
	if (merges.length !== 1 || merges[0] === `refs/heads/${b}`) return null;
	return `push.default is ${mode} and ${b} has branch.${b}.merge '${merges[0]}', so git pushes the lone src '${b}' to that upstream branch rather than to '${b}'`;
}

/**
 * The branches a push updates on `remote`, resolved statically (PLAN.md § 2.2 step 2), or why
 * resolution cannot follow it. Deletions are row 6's and resolve to nothing; so does a tag pushed
 * to a tag (a lone tag, or any destination under refs/tags/) or any other destination outside
 * refs/heads/, since only a branch is ever a PR head. A tag source with an unqualified or
 * refs/heads/ destination cannot be followed: git expands an unqualified destination to a ref the
 * remote already has (git-push(1)), so it can land on a branch, and a refs/tags/ source never gets
 * the fresh-and-tested check (pushedRevs). Nor can an unqualified destination whose first component
 * is heads, tags or remotes (ABBREVIATED). A bare push and a lone src need no such check: git gives
 * them a full refname as destination (builtin/push.c setup_default_push_refspecs; remote.c
 * match_explicit). A detached HEAD resolves to nothing here: the rev check refuses it.
 */
function destinations(p: Push, remote: string, branch: string | null): { dests: Dest[] } | { cannot: string } {
	const mapped = git(["config", "--get-all", `remote.${remote}.push`], p.repo).out !== "";
	const mapping = `${remote} has a remote.${remote}.push mapping, which git applies to`;
	if (p.refspecs.length === 0) {
		if (mapped) return { cannot: `${mapping} a push that names no refspec` };
		if (p.on.tags) return { dests: [] };
		const mode = git(["config", "--get", "push.default"], p.repo).out || "simple"; // git-config(1): simple is the default since Git 2.0
		if (mode === "simple" || mode === "current") return { dests: branch ? [{ branch, src: "HEAD" }] : [] };
		if (mode === "upstream" || mode === "tracking") {
			if (!branch) return { dests: [] };
			const merge = git(["config", "--get", `branch.${branch}.merge`], p.repo).out;
			if (!merge.startsWith("refs/heads/") || merge === "refs/heads/") {
				return { cannot: `push.default is ${mode} and ${branch} has no upstream branch (branch.${branch}.merge is ${merge ? `'${merge}'` : "unset"})` };
			}
			return { dests: [{ branch: merge.slice("refs/heads/".length), src: "HEAD" }] };
		}
		return { cannot: `push.default is '${mode}', so a bare push does not name the branch it updates` };
	}
	const dests: Dest[] = [];
	for (const spec of p.refspecs) {
		const plain = spec.replace(/^\+/, "");
		const colon = plain.indexOf(":");
		const src = colon < 0 ? plain : plain.slice(0, colon);
		if (colon === 0) continue; // `:dst` deletes: row 6's
		const head = src === "HEAD" || src === "@";
		if (colon < 0) {
			if (mapped) return { cannot: `${mapping} a refspec with no \`:<dst>\` ('${spec}')` };
			if (head) {
				if (branch) dests.push({ branch, src: "HEAD" });
			} else if (src.startsWith("refs/heads/") || !src.startsWith("refs/")) {
				const qualified = src.startsWith("refs/heads/");
				const kind = qualified ? "branch" : localKind(p.repo, src);
				if (kind === null) return { cannot: `'${src}' is not a local branch, so git gives it no destination of its own` };
				if (kind === "branch") {
					const b = qualified ? src.slice("refs/heads/".length) : src;
					const rewrite = upstreamRewrite(p.repo, b);
					if (rewrite) return { cannot: rewrite };
					dests.push({ branch: b, src });
				}
			}
			continue;
		}
		const dst = plain.slice(colon + 1);
		if (dst === "" || dst === "refs/heads/") return { cannot: `the refspec '${spec}' names no destination` };
		if (dst.startsWith("refs/tags/")) continue;
		if (ABBREVIATED.test(dst)) {
			return {
				cannot: `the refspec '${spec}' gives the unqualified destination '${dst}', which git expands to \`refs/${dst}\` when the remote has that ref and otherwise to a ref it guesses from the source, so the ref it updates depends on the remote; name a branch in full as \`refs/heads/<branch>\``,
			};
		}
		const tagSrc = src.startsWith("refs/tags/") || (!head && !src.startsWith("refs/") && localKind(p.repo, src) === "tag");
		const toBranch = dst.startsWith("refs/heads/") || !dst.startsWith("refs/");
		if (tagSrc && toBranch) {
			return {
				cannot: `the refspec '${spec}' pushes the tag '${src}' to '${dst}', which ${dst.startsWith("refs/") ? "is a branch" : "git expands to a branch when the remote has one of that name"}; row 8 lets a tag through only to a tag (\`refs/tags/<name>\`), and pushes a branch only from a branch or a commit`,
			};
		}
		if (dst.startsWith("refs/heads/")) dests.push({ branch: dst.slice("refs/heads/".length), src: head ? "HEAD" : src });
		else if (dst.startsWith("refs/")) continue;
		else dests.push({ branch: dst, src: head ? "HEAD" : src });
	}
	return { dests };
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

/** What row 8 decided about one tool call: its refusal, or the branch destinations of the push it lets through. */
export interface PushJudgment {
	refusal: Refusal;
	/** One per resolved branch destination of a let-through push (PLAN.md § 2.2 step 2); empty on a refusal. */
	dests: PushDest[];
}

/** Row 8 over one tool call. */
export function checkPushRebase(call: ToolCall, ctx: CallContext, records: TestRecords = null): Refusal {
	return judgePush(call, ctx, records).refusal;
}

/** Row 8 over one tool call, with the destinations the extension records when it lets the push through. */
export function judgePush(call: ToolCall, ctx: CallContext, records: TestRecords = null): PushJudgment {
	if (call.toolName !== "bash") return { refusal: null, dests: [] };
	const cmd = bashCommand(call.input);
	const base = typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd;
	const refused = (why: string, remedy: string): PushJudgment => ({ refusal: refuse(why, remedy, cmd), dests: [] });
	const x = expandShell(cmd, base, ctx.env);
	const commands = x.commands;
	const scratch = scratchFor(ctx, cmd, x, call.input.env);
	const dests: PushDest[] = [];
	for (const e of commands) {
		if (scratch && intoScratch(e, scratch)) continue;
		const p = parsePush(e);
		if (!p) continue;
		if ("blind" in p) return refused(`${p.blind}, so the gate cannot tell what it pushes or where`, "Spell the push out literally.");
		const other = commands.find((o) => o !== e && o.argv[0]?.text !== "cd");
		if (other) {
			return refused(
				`it shares its bash call with \`${execText(other)}\`, and row 8 resolves where a push goes before anything in the call runs (a \`git switch\` or \`checkout\` there would move the branch it pushes)`,
				"Run the other commands in a call of their own.",
			);
		}
		if (p.unknown) return refused(`\`${p.unknown}\` is not one row 8 resolves, so the gate cannot tell what it does to where the push lands`, `Instead, push with plain options: ${PLAIN_OPTIONS}.`);
		if (p.on.delete) continue; // row 6 refuses ref deletion
		const every = p.every;
		if (every) return refused(`\`${every}\` pushes every ${every === "--mirror" ? "ref" : "branch"}, not branches it names`, EXPLICIT);
		const wild = p.refspecs.find((s) => s.includes("*") || s.replace(/^\+/, "") === ":");
		if (wild) return refused(`the refspec '${wild}' ${wild.includes("*") ? "is a wildcard" : "pushes every matching branch"}, so the branches it updates are not named`, EXPLICIT);
		const branch = git(["symbolic-ref", "--short", "-q", "HEAD"], p.repo).out || null;
		const remote = pushRemote(p, branch ?? "");
		let resolved: Dest[] = [];
		if (remote) {
			if (git(["config", "--bool", "--get", `remote.${remote}.mirror`], p.repo).out === "true") {
				return refused(`${remote} has remote.${remote}.mirror set, so a push there updates every ref, whatever it names`, "Push to a remote that does not mirror.");
			}
			const r = destinations(p, remote, branch);
			if ("cannot" in r) return refused(r.cannot, EXPLICIT);
			resolved = r.dests;
		}
		const revs = pushedRevs(p, branch);
		if (revs.length > 0) {
			const why = judgeRevs(p, revs, branch, remote, records, cmd);
			if (why) return { refusal: why, dests: [] };
		}
		for (const d of resolved) {
			const sha = git(["rev-parse", "--verify", "-q", `${d.src}^{commit}`], p.repo);
			if (sha.status !== 0 || !sha.out) return refused(`'${d.src}' is not a commit in ${p.repo}`, "Push an existing branch.");
			if (!dests.some((x) => x.remote === remote && x.branch === d.branch && x.sha === sha.out)) dests.push({ remote: remote!, branch: d.branch, sha: sha.out });
		}
	}
	if (scratch && scratch.used.size > 0) markConfined(call);
	return { refusal: null, dests };
}

/** The freshness and tested-tree checks over the revs a push moves (tags only moves none). */
function judgeRevs(p: Push, revs: string[], branch: string | null, remote: string | null, records: TestRecords, cmd: string): Refusal {
	if (records === null) return refuse("this session has no workload, so the ledger holds no test record for it", "Push from the lane that holds the workload.", cmd);
	if (!branch && revs.includes("HEAD")) return refuse(`${p.repo} is on a detached HEAD, so there is no branch whose upstream the push can be checked against`, "Check out the branch to push.", cmd);
	if (!remote) return refuse(`no remote to push to could be resolved in ${p.repo}`, "Name the remote.", cmd);
	const fetch = git(["fetch", remote, "--prune", "--quiet"], p.repo, 15000);
	if (fetch.status !== 0) return refuse(`\`git fetch ${remote}\` failed in ${p.repo} (exit ${fetch.status ?? "timeout"}), so the target's upstream cannot be checked`, "Fix the remote, then fetch.", cmd);
	const ups = upstreams(p.repo, remote, branch ?? "");
	if (ups.length === 0) return refuse(`${remote} has no default branch the gate can find (no ${remote}/HEAD, ${remote}/main or ${remote}/master)`, `Run \`git remote set-head ${remote} --auto\`.`, cmd);
	const remedy =
		`Bring ${ups[0]} in (\`git fetch ${remote} && git merge ${ups[0]}\`, or a rebase that rewrites nothing already pushed), then run the slice's declared test artifact (slice_artifact) on that tree with nothing left uncommitted. ` +
		"The artifact must be a bare test-runner command (no pipe, `cd`, `||`, `;` or redirection), and it must finish in the foreground: OMP backgrounds a bash call after its auto-background threshold (60 s by default) and a backgrounded run records nothing, so split a long suite into several declared artifacts. " +
		`If bringing ${ups[0]} in would rewrite commits already on the remote, stop and report; that force-push is § A4 reserved.`;
	/** The workload's records, and those whose command is a bare test-runner invocation; read once per push. */
	let all: ArtifactTree[] | undefined;
	let tests: ArtifactTree[] = [];
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
	return null;
}

/**
 * A push into the own scratch root (§ 1.2, row 8's skip), recorded on `scratch`. Its source directory
 * need not exist yet (made earlier in the same call): the destination is all the skip reads.
 */
function intoScratch(e: Exec, scratch: Scratch): boolean {
	const g = gitCall(e);
	if (g?.sub !== "push" || !pushToScratch(g, scratch)) return false;
	scratch.used.add("row 8: push into the scratch root");
	return true;
}

/** Whether a bash call pushes a branch row 8 judges (a push that is neither blind nor a deletion, nor into the own scratch root). */
export function pushChecked(call: ToolCall, ctx: CallContext): boolean {
	if (call.toolName !== "bash") return false;
	const cwd = typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd;
	const cmd = bashCommand(call.input);
	const x = expandShell(cmd, cwd, ctx.env);
	const scratch = scratchFor(ctx, cmd, x, call.input.env);
	return x.commands.some((e) => {
		if (scratch && intoScratch(e, scratch)) return false;
		const p = parsePush(e);
		return p !== null && !("blind" in p) && (p.unknown !== null || !p.on.delete);
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
