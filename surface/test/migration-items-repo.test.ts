// Migration items one file each (workload wl-mv5mvvs64ahq0w, PLAN § 2 `check`): the tree under test
// passes `check`, so every PR's full suite enforces the item and index rules before merge. It spawns
// `bun <repo root>/surface/scripts/migration-items.ts check --repo <repo root>` and imports nothing
// from the change. The base is origin/main, else main, else the tag as2-trusted-main, which the
// full-suite runner writes at origin/main's sha because its clone keeps no main ref; with one of
// them the check runs strict. With none, `check` fails closed, so this test passes --trust-head and
// expects the HEAD-history warning on stderr; that degraded path exists only for runners that
// predate the tag.
import { expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");
const CLI = join(ROOT, "surface", "scripts", "migration-items.ts");
const BASE_REFS = ["refs/remotes/origin/main", "refs/heads/main", "refs/tags/as2-trusted-main"];

const resolves = (ref: string): boolean =>
	Bun.spawnSync(["git", "rev-parse", "--verify", "-q", `${ref}^{commit}`], { cwd: ROOT, stdout: "pipe", stderr: "pipe" }).exitCode === 0;

test("the repository tree passes migration-items check", () => {
	const strict = BASE_REFS.some(resolves);
	const r = Bun.spawnSync(["bun", CLI, "check", "--repo", ROOT, ...(strict ? [] : ["--trust-head"])], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
	const err = r.stderr.toString();
	const out = `stdout:\n${r.stdout.toString()}\nstderr:\n${err}`;
	expect({ exit: r.exitCode, out }).toEqual({ exit: 0, out: expect.stringContaining("check: ok") });
	if (!strict) expect(err).toContain("check: --trust-head and no base; published read from HEAD history");
}, 30_000);
