// P-11 row 8 (DESIGN-2.0.md:345; C5.6b): a push is refused unless a fetch+rebase onto the target's
// upstream ran after the last commit. Ported from 1.x `rebase-before-push.mjs` (newdle 0.2.172),
// rebuilt on evidence after the astra review (B4):
//
// - Evidence, not text. A rebase counts only when a bash call that ran `git rebase` or
//   `git pull --rebase` in that repository finished with exit 0 and left no rebase in progress;
//   the evidence is the commit HEAD was on afterwards (RebaseEvidence.observe, fed from
//   `tool_result`). A later commit moves HEAD off that commit, so the evidence no longer matches.
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
import { type Exec, expandShell, gitCall } from "../exec";
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

/** Successful rebases this session: repository top level → commits HEAD was on after them. */
export class RebaseEvidence {
	readonly #commits = new Map<string, Set<string>>();

	/** A bash call finished: record the post-rebase HEAD of every repository it rebased, when it succeeded. */
	observe(command: string, cwd: string, env: Record<string, string | undefined>, ok: boolean): void {
		if (!ok) return;
		for (const e of expandShell(command, cwd, env).commands) {
			const g = gitCall(e);
			if (!g || !g.dir || !e.dirKnown) continue;
			const rebased = g.sub === "rebase" || (g.sub === "pull" && g.args.some((w) => w.text === "--rebase" || w.text === "-r" || w.text.startsWith("--rebase=")));
			if (!rebased || g.args.some((w) => /^--(abort|quit|skip|edit-todo|show-current-patch)$/.test(w.text))) continue;
			const repo = topLevel(g.dir);
			if (!repo) continue;
			const inProgress = ["rebase-merge", "rebase-apply"].some((d) => {
				const p = git(["rev-parse", "--git-path", d], repo).out;
				return p !== "" && existsSync(resolve(repo, p));
			});
			if (inProgress) continue;
			const head = git(["rev-parse", "--verify", "-q", "HEAD"], repo);
			if (head.status !== 0) continue;
			const set = this.#commits.get(repo) ?? new Set<string>();
			set.add(head.out);
			this.#commits.set(repo, set);
		}
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
			const remedy = `Run \`git fetch ${remote} --prune\` and \`git rebase ${ups[0]}\` as their own command, re-run the tests, then push. If the rebase would rewrite commits already on the remote, stop and report the divergence; that force-push is § A4 reserved.`;
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
