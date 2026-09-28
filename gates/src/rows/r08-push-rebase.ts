// P-11 row 8 (DESIGN-2.0.md:345; C5.6b): a push is refused unless a fetch+rebase onto the target's
// upstream ran after the last commit. Ported from 1.x `rebase-before-push.mjs` (newdle 0.2.172):
// the gate fetches, then asks `git merge-base --is-ancestor <mainline> <pushed rev>`; a chain that
// fetches and rebases onto the mainline before its own push is the rule being followed. Changes
// from 1.x: no AGENTS.md scope marker (2.0 applies it everywhere), and `cd` segments are followed
// instead of passed through.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { gitInvocation, parsePush, segmentsWithDir, tokens } from "../shell";
import type { CallContext, Refusal, ToolCall } from "../types";

function git(args: string[], cwd: string, timeout = 5000): { status: number | null; out: string } {
	const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
	return { status: r.status, out: (r.stdout ?? "").trim() };
}

/** origin/HEAD if the clone recorded it, else origin/main, else origin/master. Local refs only. */
function mainline(repo: string): string | null {
	const sym = git(["symbolic-ref", "-q", "refs/remotes/origin/HEAD"], repo);
	if (sym.status === 0 && sym.out.startsWith("refs/remotes/")) return sym.out.slice("refs/remotes/".length);
	for (const m of ["origin/main", "origin/master"]) if (git(["rev-parse", "--verify", "-q", m], repo).status === 0) return m;
	return null;
}

/** The local revs a push moves onto the mainline's history: `HEAD` for the checked-out branch, else the refspec source. */
function pushedRevs(refspecs: string[], flags: string[], branch: string): string[] {
	if (flags.some((f) => f === "--tags") && refspecs.length === 0) return [];
	if (refspecs.length === 0) return ["HEAD"];
	const revs: string[] = [];
	for (const spec of refspecs) {
		const plain = spec.replace(/^\+/, "");
		const src = plain.includes(":") ? plain.slice(0, plain.indexOf(":")) : plain;
		if (src === "" || src.startsWith("refs/tags/")) continue;
		revs.push(src === "HEAD" || src === "@" || src === branch ? "HEAD" : src);
	}
	return revs;
}

/** Refuses a `git push` to origin whose pushed rev does not contain the freshly fetched mainline tip. */
export function checkPushRebase(call: ToolCall, ctx: CallContext): Refusal {
	if (call.toolName !== "bash") return null;
	const cmd = String(call.input.command ?? "");
	const base = typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd;
	const segs = segmentsWithDir(cmd, base);
	for (let i = 0; i < segs.length; i++) {
		const push = parsePush(segs[i]!.seg);
		if (!push || (push.remote && push.remote !== "origin")) continue;
		const repo = push.dirs.reduce((d, x) => resolve(d, x), segs[i]!.dir);
		if (!existsSync(repo) || git(["rev-parse", "--is-inside-work-tree"], repo).out !== "true") continue;

		// The chain's own remedy: a fetch, then a rebase (or pull --rebase) onto the mainline, before this push.
		let sawFetch = false;
		const remedies: string[] = [];
		for (let j = 0; j < i; j++) {
			const g = gitInvocation(segs[j]!.seg);
			if (!g) continue;
			if (g.sub === "fetch") sawFetch = true;
			else if (g.sub === "rebase" && sawFetch) remedies.push(tokens(g.rest).find((t) => !t.startsWith("-")) ?? "");
			else if (g.sub === "pull" && /(^|\s)--rebase\b/.test(g.rest)) {
				const pos = tokens(g.rest).filter((t) => !t.startsWith("-"));
				remedies.push(pos.length >= 2 ? `${pos[0]}/${pos[1]}` : "origin/main");
			}
		}
		const localMain = mainline(repo);
		if (remedies.length > 0 && localMain && remedies.includes(localMain)) continue;

		const branch = git(["symbolic-ref", "--short", "-q", "HEAD"], repo).out;
		if (!branch) continue; // detached HEAD: no branch to rebase
		// Fetch failure passes: the push being checked would fail against the same remote.
		if (git(["fetch", "origin", "--prune", "--quiet"], repo, 10000).status !== 0) continue;
		const main = mainline(repo);
		if (!main) continue;
		for (const rev of pushedRevs(push.refspecs, push.flags, branch)) {
			const anc = git(["merge-base", "--is-ancestor", main, rev], repo);
			if (anc.status !== 1) continue; // 0 = contains the mainline tip; 128 = unknown rev, not ours to judge
			return {
				block: true,
				reason:
					`P-11 row 8 refused this push: '${rev === "HEAD" ? branch : rev}' does not contain ${main} after a fresh fetch ` +
					`(git merge-base --is-ancestor ${main} ${rev} exits 1), so no fetch+rebase onto the target's upstream ran after the last commit. ` +
					`Run \`git fetch origin --prune && git rebase ${main}\`, re-run the tests, then push. ` +
					`If the rebase would rewrite commits already on origin/${branch}, stop and report the divergence; that force-push is § A4 reserved. Command: ${cmd}`,
			};
		}
	}
	return null;
}
