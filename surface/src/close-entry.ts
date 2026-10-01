// The close tool's git path (decision 13; MIGRATION.md § "M7 follow-ups" items 11 and 12): the
// decision-log entry a close renders is committed on the workload's lane branch `wl/<id>`, never
// on the checkout's current branch, so local main moves only through Jo's merges. The branch is
// reached through the lane worktree that has it checked out, through a temporary worktree when no
// worktree has it, or cut from `origin/<default>` (local `<default>` only when the repo has no
// origin) when no local branch exists, so local unpushed commits never ride along. After the
// ledger close the branch is pushed (plain, no force) and an open PR is made sure of through `gh`.
// Every git and gh call goes through the extension API's exec with a timeout, never the bash tool;
// a failure is named in the result and never blocks the close.
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import type { Ledger } from "../../ledger/src/index";
import { renderClose } from "./decision-log";
import { identityOf } from "./identity";
import { branchName } from "./launch";
import { DECISION_LOG_ENV, type SurfaceAPI } from "./types";

const LOCAL_MS = 15_000;
const COMMIT_MS = 30_000;
const NETWORK_MS = 60_000;

/**
 * The directory decision-log entries are read from for `repo` (the open tool's context) and the
 * close renders into when no lane branch can take the entry. `AGENT_SYSTEM_DECISION_LOG` overrides
 * it; an entry committed on the lane branch always lives under that worktree's `.ai/decision-log/`.
 */
export const logDirOf = (env: Record<string, string | undefined>, repo: string) => env[DECISION_LOG_ENV] || join(repo, ".ai", "decision-log");

type Exec = NonNullable<SurfaceAPI["exec"]>;
interface Run {
	code: number;
	out: string;
	err: string;
	killed: boolean;
}

async function run(exec: Exec, command: string, args: string[], timeout: number, cwd?: string): Promise<Run> {
	try {
		const r = await exec(command, args, cwd === undefined ? { timeout } : { timeout, cwd });
		return { code: r.code, out: r.stdout.trim(), err: r.stderr.trim(), killed: r.killed };
	} catch (err) {
		return { code: -1, out: "", err: String(err instanceof Error ? err.message : err), killed: false };
	}
}
const git = (exec: Exec, dir: string, args: string[], timeout = LOCAL_MS) => run(exec, "git", ["-C", dir, ...args], timeout);
/** One line naming a failed command: `git push exited 1: <first line of its output>`. */
const failed = (what: string, r: Run) => `${what} ${r.killed ? "timed out" : `exited ${r.code}`}: ${(r.err || r.out || "no output").split("\n")[0]}`;
const canonical = (p: string): string => {
	try {
		return realpathSync(p);
	} catch {
		return p;
	}
};

/** Where the entry is committed: the repo top, the lane branch, the worktree that has it checked out. */
interface Target {
	top: string;
	branch: string;
	worktree: string;
	/** The temporary worktree's parent directory, removed with it; null for the lane worktree. */
	tempDir: string | null;
	/** `refs/remotes/origin/HEAD`'s branch, else the checkout's current branch; null when neither resolves. */
	defaultBranch: string | null;
	origin: boolean;
	/** A failed `git fetch origin` before the branch was cut (recorded, not fatal). */
	fetch: string | null;
}

/** The worktree that has `refs/heads/<branch>` checked out, from `git worktree list --porcelain`. */
function worktreeOf(porcelain: string, branch: string): string | null {
	let path: string | null = null;
	for (const line of porcelain.split("\n")) {
		if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
		else if (line === `branch refs/heads/${branch}`) return path;
		else if (line === "") path = null;
	}
	return null;
}

/** Find, or create, the lane branch and a worktree on it; the reason when neither can be had. */
async function prepare(exec: Exec, repo: string, id: string): Promise<Target | string> {
	const topR = await git(exec, repo, ["rev-parse", "--show-toplevel"]);
	if (topR.code !== 0 || !topR.out) return `${repo} is not a git checkout (${failed("git rev-parse", topR)})`;
	const top = topR.out;
	const branch = branchName(id);
	const origin = (await git(exec, top, ["remote", "get-url", "origin"])).code === 0;
	const head = await git(exec, top, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
	let defaultBranch: string | null = head.code === 0 && head.out ? head.out.replace(/^origin\//, "") : null;
	if (defaultBranch === null) {
		const cur = await git(exec, top, ["rev-parse", "--abbrev-ref", "HEAD"]);
		defaultBranch = cur.code === 0 && cur.out && cur.out !== "HEAD" ? cur.out : null;
	}
	const target = { top, branch, defaultBranch, origin, fetch: null as string | null };
	const has = (await git(exec, top, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).code === 0;
	if (has) {
		const list = await git(exec, top, ["worktree", "list", "--porcelain"]);
		if (list.code !== 0) return failed("git worktree list", list);
		const wt = worktreeOf(list.out, branch);
		if (wt !== null) {
			if (canonical(wt) === canonical(top)) return `${branch} is checked out in the checkout ${top} itself, and the close never commits in the checkout`;
			return { ...target, worktree: wt, tempDir: null };
		}
	} else {
		if (origin) {
			const f = await git(exec, top, ["fetch", "--quiet", "origin"], NETWORK_MS);
			if (f.code !== 0) target.fetch = failed("git fetch origin", f);
		}
		const commit = async (ref: string): Promise<string | null> => {
			const r = await git(exec, top, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
			return r.code === 0 && r.out ? r.out : null;
		};
		let sha = origin ? await commit(`refs/remotes/origin/${branch}`) : null;
		if (sha === null) {
			if (defaultBranch === null) return `cannot cut ${branch}: the default branch of ${top} cannot be resolved`;
			// The remote default, never local main: Jo's local unpushed commits stay out of the lane branch.
			const base = origin ? `refs/remotes/origin/${defaultBranch}` : `refs/heads/${defaultBranch}`;
			sha = await commit(base);
			if (sha === null) return `cannot cut ${branch}: ${base} does not resolve${target.fetch ? ` (${target.fetch})` : ""}`;
		}
		// The sha, not the ref: no upstream is set from origin/<default>.
		const cut = await git(exec, top, ["branch", branch, sha]);
		if (cut.code !== 0) return failed(`git branch ${branch}`, cut);
	}
	const tempDir = mkdtempSync(join(tmpdir(), "as2-close-"));
	const worktree = join(tempDir, "wt");
	const add = await git(exec, top, ["worktree", "add", "--quiet", worktree, branch]);
	if (add.code !== 0) {
		rmSync(tempDir, { recursive: true, force: true });
		return failed("git worktree add", add);
	}
	return { ...target, worktree, tempDir };
}

/** Remove the temporary worktree; null when gone, else what was left. */
async function removeTemp(exec: Exec, t: Target): Promise<string | null> {
	if (t.tempDir === null) return null;
	const r = await git(exec, t.top, ["worktree", "remove", "--force", t.worktree]);
	rmSync(t.tempDir, { recursive: true, force: true });
	if (r.code === 0) return null;
	const prune = await git(exec, t.top, ["worktree", "prune"]);
	return prune.code === 0 ? null : `the temporary worktree ${t.worktree} was not removed (${failed("git worktree remove", r)})`;
}

/** Commit exactly `path` in the worktree; an entry identical to the branch's (a re-close) is not committed twice. */
async function commitPath(exec: Exec, wt: string, path: string, id: string): Promise<{ error: string | null; already: boolean }> {
	const slug = basename(path).replace(/\.md$/, "");
	const add = await git(exec, wt, ["add", "--", path]);
	if (add.code !== 0) return { error: failed("git add", add), already: false };
	const diff = await git(exec, wt, ["diff", "--cached", "--quiet", "HEAD", "--", path]);
	if (diff.code === 0) return { error: null, already: true };
	if (diff.code !== 1) return { error: failed("git diff --cached", diff), already: false };
	const commit = await git(exec, wt, ["commit", "-q", "-m", `docs: decision-log entry ${slug} (workload ${id})`, "--", path], COMMIT_MS);
	return { error: commit.code === 0 ? null : failed("git commit", commit), already: false };
}

export interface EntryCommit {
	/** Where the entry is: an absolute path when the file is on disk, else `<branch>:.ai/decision-log/<file>`. */
	path: string;
	/** The workload's lane branch `wl/<id>`: where the entry is committed, or is to be committed by hand when `commit` names a reason. */
	branch: string;
	/** Null when the entry is committed on `branch` (now or already); else why it was not (the file is untracked). */
	commit: string | null;
	/** The identical entry was already committed on the branch (a re-close after `stays open`). */
	already: boolean;
	/** Recorded failures that did not stop the commit: a failed fetch, a temporary worktree left behind. */
	notes: string[];
	/** For `publishEntry`: the repo top, its default branch, whether it has an origin; null when nothing was committed. */
	publish: { top: string; defaultBranch: string | null; origin: boolean } | null;
}

/**
 * Render the workload's decision-log entry and commit it on `wl/<id>`: in the lane worktree, in a
 * temporary worktree (removed on every path), or on a branch cut from origin's default. When no
 * branch or worktree can be had, or the commit fails in a temporary worktree, the entry is rendered
 * untracked into `logDirOf(env, repo)` with the reason; `git commit` never runs in the checkout.
 */
export async function commitCloseEntry(pi: SurfaceAPI, ledger: Ledger, env: Record<string, string | undefined>, id: string, repo: string): Promise<EntryCommit> {
	const branch = branchName(id);
	const untracked = (reason: string, notes: string[] = []): EntryCommit => ({
		path: renderClose(ledger, id, logDirOf(env, repo), identityOf(ledger)).path, branch, commit: reason, already: false, notes, publish: null,
	});
	if (!pi.exec) return untracked("the host has no exec for extensions");
	const exec = pi.exec.bind(pi);
	const t = await prepare(exec, repo, id);
	if (typeof t === "string") return untracked(t);
	const notes = t.fetch ? [t.fetch] : [];
	let rendered: string;
	let c: { error: string | null; already: boolean };
	try {
		rendered = renderClose(ledger, id, join(t.worktree, ".ai", "decision-log"), identityOf(ledger)).path;
		c = await commitPath(exec, t.worktree, rendered, id);
	} catch (err) {
		rendered = "";
		c = { error: String(err instanceof Error ? err.message : err), already: false };
	} finally {
		const left = await removeTemp(exec, t);
		if (left) notes.push(left);
	}
	if (c.error !== null) {
		// The lane worktree keeps the file; a temporary worktree took it with it, so render it where it can be committed by hand.
		if (t.tempDir === null && rendered) return { path: rendered, branch, commit: c.error, already: false, notes, publish: null };
		return untracked(c.error, notes);
	}
	const path = t.tempDir === null ? rendered : `${branch}:.ai/decision-log/${basename(rendered)}`;
	return { path, branch, commit: null, already: c.already, notes, publish: { top: t.top, defaultBranch: t.defaultBranch, origin: t.origin } };
}

export interface EntryPublish {
	/** Null when `git push -u origin wl/<id>` succeeded; else why it was not pushed. */
	push: string | null;
	/** The open PR's url, or null. */
	pr: string | null;
	/** True when this close opened the PR. */
	prCreated: boolean;
	/** Why there is no PR url, ending in what to do by hand; null when `pr` is set. */
	prReason: string | null;
}

/**
 * Push the lane branch (plain, no force) and make sure an open PR exists from it: `gh pr list`
 * finds one, else `gh pr create` opens one against the default branch. That covers a lane PR
 * merged before the close and a workload that never had one. Failures are named, never thrown.
 */
export async function publishEntry(pi: SurfaceAPI, e: EntryCommit, id: string): Promise<EntryPublish> {
	const byHand = `open one from ${e.branch}`;
	if (e.publish === null) return { push: "nothing was committed", pr: null, prCreated: false, prReason: `nothing was committed; ${byHand}` };
	if (!pi.exec) return { push: "the host has no exec for extensions", pr: null, prCreated: false, prReason: `the host has no exec; ${byHand}` };
	const exec = pi.exec.bind(pi);
	const { top, defaultBranch, origin } = e.publish;
	if (!origin) return { push: `${top} has no origin remote`, pr: null, prCreated: false, prReason: `no origin remote; push ${e.branch} and ${byHand}` };
	const p = await git(exec, top, ["push", "--quiet", "-u", "origin", e.branch], NETWORK_MS);
	const push = p.code === 0 ? null : failed("git push", p);
	const list = await run(exec, "gh", ["pr", "list", "--head", e.branch, "--state", "open", "--json", "url"], NETWORK_MS, top);
	if (list.code !== 0) return { push, pr: null, prCreated: false, prReason: `${failed("gh pr list", list)}; ${byHand}` };
	let open: { url?: string }[];
	try {
		open = JSON.parse(list.out || "[]") as { url?: string }[];
	} catch {
		return { push, pr: null, prCreated: false, prReason: `gh pr list printed no JSON (${list.out.split("\n")[0]}); ${byHand}` };
	}
	const url = Array.isArray(open) ? open.find((x) => typeof x?.url === "string")?.url : undefined;
	if (url) return { push, pr: url, prCreated: false, prReason: null };
	if (push !== null) return { push, pr: null, prCreated: false, prReason: `not pushed; ${byHand}` };
	if (defaultBranch === null) return { push, pr: null, prCreated: false, prReason: `the default branch of ${top} cannot be resolved; ${byHand}` };
	const title = `docs: decision-log entry ${basename(e.path).replace(/\.md$/, "")} (workload ${id})`;
	const body = `The decision-log entry rendered when workload ${id} closed, committed on its lane branch ${e.branch} by the orchestrator surface's close.`;
	const create = await run(exec, "gh", ["pr", "create", "--head", e.branch, "--base", defaultBranch, "--title", title, "--body", body], NETWORK_MS, top);
	if (create.code !== 0) return { push, pr: null, prCreated: false, prReason: `${failed("gh pr create", create)}; ${byHand}` };
	const created = create.out.split("\n").filter(Boolean).at(-1) ?? "";
	return created ? { push, pr: created, prCreated: true, prReason: null } : { push, pr: null, prCreated: false, prReason: `gh pr create printed no url; ${byHand}` };
}
