// The workload's scratch root on disk (PLAN wl-mv5oikd5jtquww § 1.1, § 1.5), shared by the launcher's prepare
// (surface/scripts/lane.ts) and the lane extension's won claim (surface/extensions/lane.ts).
import { chmodSync, lstatSync, mkdirSync } from "node:fs";
import { scratchRootFor } from "../../gates/src/scratch";

/**
 * `mkdir -p` the workload's scratch root with mode 0700; an existing root is kept with what it holds (a relaunch gets the
 * same root, never emptied). A root that is not a real directory (a symlink, a file) throws: the gates would never treat it
 * as the lane's own root.
 */
export function ensureScratchRoot(home: string, workloadId: string): string {
	const root = scratchRootFor(home, workloadId);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const st = lstatSync(root);
	if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`scratch root ${root} is not a directory`);
	chmodSync(root, 0o700);
	return root;
}
