/**
 * A read-only fingerprint of a git worktree (PLAN wl-mupu0sx2o046io D2 check 2): taken at a review
 * hand's spawn and again at its settle, so a review that changed the work through `bash` is caught.
 *
 * It covers the lane's own work only: HEAD (the commit and the branch it names, so a commit on the
 * lane's branch or a branch switch shows), the index (`git ls-files -s`: mode, object, stage and path,
 * so a staged-only change shows), and the content of every tracked and every untracked-not-ignored
 * file in the worktree, with its executable bit, and a symlink's target. Refs other than HEAD's are
 * out (PLAN wl-muq13bkdghblmo step 7): every worktree of a repository shares them, so a commit in
 * another lane's worktree, a `git fetch` or a stash elsewhere would withhold a review that changed
 * nothing. A stash in this worktree still shows, through the worktree change it takes away. No part
 * carries stat data, so an index refresh (`git status`, `git update-index --refresh`) leaves it
 * unchanged. Only git read commands run, with `GIT_OPTIONAL_LOCKS=0` so none of them refreshes the
 * index; files are hashed here. Any failure throws, so a caller fails closed.
 */
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync, type Stats } from "node:fs";
import { join } from "node:path";

/** Run one git read command in `cwd`; `allow` lists exit codes that mean "absent" rather than failure. */
function git(cwd: string, args: string[], allow: readonly number[] = []): { code: number; out: string } {
	const result = Bun.spawnSync(["git", ...args], {
		cwd,
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" },
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const code = result.exitCode ?? -1;
	if (code !== 0 && !allow.includes(code)) {
		throw new Error(`git ${args.join(" ")} in ${cwd} exited ${code}: ${result.stderr.toString().trim()}`);
	}
	return { code, out: result.stdout.toString() };
}

/** The repository's state as one sha256 hex digest. Throws when any part cannot be read. */
export function repoFingerprint(cwd: string): string {
	const top = git(cwd, ["rev-parse", "--show-toplevel"]).out.trim();
	if (!top) throw new Error(`${cwd} is not inside a git worktree`);
	const hash = createHash("sha256");
	const part = (label: string, value: string) => hash.update(`${label}\0${value}\0`);
	// Exit 1: an unborn HEAD (no commit yet) or a detached HEAD (no branch); both are states, not errors.
	const head = git(top, ["rev-parse", "-q", "--verify", "HEAD"], [1]);
	part("head", head.code === 0 ? head.out.trim() : "unborn");
	const branch = git(top, ["symbolic-ref", "-q", "HEAD"], [1]);
	part("branch", branch.code === 0 ? branch.out.trim() : "detached");
	part("index", git(top, ["ls-files", "-s", "-z"]).out);
	const paths = [
		...new Set(
			git(top, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
				.out.split("\0")
				.filter(Boolean),
		),
	].sort();
	for (const path of paths) {
		const file = join(top, path);
		let stat: Stats;
		try {
			stat = lstatSync(file);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				part(path, "missing");
				continue;
			}
			throw error;
		}
		if (stat.isSymbolicLink()) part(path, `link ${readlinkSync(file)}`);
		else if (stat.isDirectory()) part(path, "dir"); // a submodule's gitlink: its commit is in the index part
		else if (stat.isFile()) {
			const content = createHash("sha256").update(readFileSync(file)).digest("hex");
			part(path, `${stat.mode & 0o111 ? "x" : "-"} ${content}`);
		} else part(path, `other ${stat.mode.toString(8)}`);
	}
	return hash.digest("hex");
}
