// Migration items one file each (workload wl-mv5mvvs64ahq0w, PLAN § 2 `check`): the tree under test
// passes `check`, so every PR's full suite enforces the item and index rules before merge. It spawns
// `bun <repo root>/surface/scripts/migration-items.ts check --repo <repo root>`, with no flag, and
// imports nothing from the change. The base is origin/main, else main, else the tag
// as2-trusted-main, which the full-suite runner writes at origin/main's sha because its clone keeps
// no main ref; the tag gives the runner's clone a base. Without any of them, `check` passes only a
// tree with no numbered item file and no index row, and fails closed on anything else.
import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "surface", "scripts", "migration-items.ts");

test("the repository tree passes migration-items check", () => {
	const r = Bun.spawnSync(["bun", CLI, "check", "--repo", ROOT], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
	const out = `stdout:\n${r.stdout.toString()}\nstderr:\n${r.stderr.toString()}`;
	expect({ exit: r.exitCode, out }).toEqual({ exit: 0, out: expect.stringContaining("check: ok") });
}, 30_000);
