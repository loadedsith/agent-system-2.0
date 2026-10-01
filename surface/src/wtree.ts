// The working tree as one git tree id, without touching the real index (a port of gstack's
// `gstack-wtree`; wl-muptjioqjtvthc PLAN.md § 1). The real index is copied to a temp file with its
// mtime kept (as `touch -r` would: the stat cache stays valid, so unchanged files are not re-hashed),
// or, when the repository has no index yet, HEAD is read into the temp index; then `git add -A` and
// `git write-tree` run against the temp index only. The id covers tracked edits and untracked files
// that are not ignored, and leaves gitignored output out. `git add -A` writes blobs into the object
// store, as any add does; the index, HEAD and refs are never written.
//
// The lane's artifact observer (surface/extensions/lane.ts) takes it before and after a declared
// artifact run and records the run's `artifact-tree:` only when the two agree.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, rmSync, statSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/** The same call shape as gates/src/rows/r08-push-rebase.ts `git()`: no prompt, no optional locks. */
function git(args: string[], cwd: string, extra: Record<string, string> = {}, timeout = 5000): { status: number | null; out: string } {
	const r = spawnSync("git", args, { cwd, encoding: "utf8", timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", ...extra } });
	return { status: r.status, out: (r.stdout ?? "").trim() };
}

const TREE_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/** The repository top level and the tree id of `dir`'s working tree, or null on any git failure. */
export function workingTree(dir: string): { repo: string; tree: string } | null {
	let tmp: string | null = null;
	try {
		const top = git(["rev-parse", "--show-toplevel"], dir);
		if (top.status !== 0 || !top.out) return null;
		const repo = top.out;
		const indexPath = git(["rev-parse", "--git-path", "index"], repo);
		if (indexPath.status !== 0 || !indexPath.out) return null;
		const real = resolve(repo, indexPath.out);
		tmp = mkdtempSync(join(tmpdir(), "as2-wtree-"));
		const index = join(tmp, "index");
		const withIndex = { GIT_INDEX_FILE: index };
		if (existsSync(real)) {
			copyFileSync(real, index);
			const st = statSync(real);
			utimesSync(index, st.atime, st.mtime);
		} else if (git(["read-tree", "HEAD"], repo, withIndex).status !== 0) {
			return null;
		}
		if (git(["add", "-A"], repo, withIndex, 30_000).status !== 0) return null;
		const tree = git(["write-tree"], repo, withIndex, 30_000);
		return tree.status === 0 && TREE_ID.test(tree.out) ? { repo, tree: tree.out } : null;
	} catch {
		return null;
	} finally {
		if (tmp !== null) rmSync(tmp, { recursive: true, force: true });
	}
}
