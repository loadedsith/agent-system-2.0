// P-11 row 9 (DESIGN-2.0.md:346; C5.4, C6.1): an edit on a protected branch is refused. 1.x only
// nudged, once per repo (branch-first-nudge.mjs); 2.0 refuses every file write whose target sits in
// a git checkout whose current branch is protected. The fix is a feature branch or a worktree.
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { writeTargets } from "../targets";
import { type CallContext, PROTECTED_BRANCH, type Refusal, type ToolCall } from "../types";

/** The nearest existing directory at or above `path` (a new file's parent may not exist yet). */
function existingDir(path: string): string {
	let p = path;
	while (!existsSync(p)) {
		const up = dirname(p);
		if (up === p) return p;
		p = up;
	}
	return statSync(p).isDirectory() ? p : dirname(p);
}

/** Current branch of the checkout containing `path`; null outside a checkout or on a detached HEAD. */
export function currentBranch(path: string): string | null {
	const r = spawnSync("git", ["-C", existingDir(path), "symbolic-ref", "--short", "-q", "HEAD"], {
		encoding: "utf8",
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
	});
	return r.status === 0 ? r.stdout.trim() || null : null;
}

/** Refuses a file write into a checkout that is on main, master, production, prod or release. */
export function checkProtectedEdit(call: ToolCall, ctx: CallContext): Refusal {
	for (const target of writeTargets(call, ctx.cwd)) {
		const branch = currentBranch(target);
		if (branch && PROTECTED_BRANCH.test(branch)) {
			return {
				block: true,
				reason:
					`P-11 row 9 refused this ${call.toolName}: ${target} is in a checkout on the protected branch "${branch}". ` +
					`Edits land on a feature branch and reach ${branch} by PR. Switch first ` +
					`(git switch -c <feature-branch>) or work in a worktree, then retry the same edit.`,
			};
		}
	}
	return null;
}
