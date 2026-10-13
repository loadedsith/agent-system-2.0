// The child side of ledger/test/live-ledger-guard.test.ts (Guard A, PLAN wl-mv4yf3zgf9lm2o § 2).
// Run only by that test, as `bun test <this file>`, with HOME set to a temp "live" home holding a
// sentinel ledger; it is not a *.test.ts file, so a plain `bun test` never collects it. The HOME
// this process started with is the sentinel's, and os.homedir() stays on it even after the preload
// moves process.env.HOME, so every case below aims at the sentinel the way the incident did.
// Two modes: isolated (a bunfig.toml preloaded ledger/test/isolate-preload.ts) and fail-closed (no
// preload: the run's own HOME then counts as a live root). Only the documented exports are imported,
// so the file also loads, and fails on its assertions, where the guard does not exist.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { refreeze } from "../../../../classifier/scripts/ledger-replay";
import { defaultLedgerPath, Ledger } from "../../../src/index";

const SENTINEL_HOME = homedir();
const SENTINEL_DB = join(SENTINEL_HOME, ".agent-system-2", "ledger.db");
const LOCALITY = join(import.meta.dir, "..", "..", "..", "src", "locality.ts");
const ISOLATED = process.env.AS2_TEST_ISOLATED === "1";
console.log(`live-guard mode=${ISOLATED ? "isolated" : "fail-closed"} sentinel=${SENTINEL_HOME}`);

/** The error `fn` throws, or null; the class is checked by name so this file loads without the guard's exports. */
function thrown(fn: () => unknown): Error | null {
	try {
		fn();
	} catch (e) {
		return e instanceof Error ? e : new Error(String(e));
	}
	return null;
}

function expectLiveRefusal(label: string, fn: () => unknown): void {
	const err = thrown(fn);
	expect(err?.name).toBe("LiveLedgerUnderTestError");
	expect(err?.message).toContain(join(SENTINEL_HOME, ".agent-system-2"));
	console.log(`${label} refused: ${err?.name}: ${err?.message}`);
}

/** Runs `defaultLedgerPath()` in a grandchild bun with `env` (undefined: the default env, which is this process's original one). */
function grandchild(env?: Record<string, string>): { exitCode: number; out: string } {
	const r = Bun.spawnSync([process.execPath, "-e", `import { defaultLedgerPath } from ${JSON.stringify(LOCALITY)}; console.log(defaultLedgerPath());`], {
		stdout: "pipe", stderr: "pipe", ...(env ? { env } : {}),
	});
	return { exitCode: r.exitCode, out: `${r.stdout.toString()}${r.stderr.toString()}` };
}

describe(`live-guard fixture (${ISOLATED ? "isolated" : "fail-closed"})`, () => {
	test("(a) the default ledger of a HOME-less env is the temp one when isolated, and refused when not", () => {
		const open = () => Ledger.open(defaultLedgerPath({ AGENT_SYSTEM_ROLE: "lane" }), { create: true });
		if (!ISOLATED) {
			expectLiveRefusal("(a)", open);
			return;
		}
		const ledger = open();
		try {
			expect(ledger.path).toBe(join(realpathSync(process.env.HOME!), ".agent-system-2", "ledger.db"));
			expect(ledger.path.startsWith(`${realpathSync(SENTINEL_HOME)}/`)).toBe(false);
			const wl = ledger.openWorkload({ brief: "written by the live-guard fixture", stakes: "throwaway", mode: "autonomous", by: "live-guard" });
			expect(ledger.workload(wl)?.brief).toBe("written by the live-guard fixture");
			console.log(`(a) wrote ${wl} into ${ledger.path}`);
		} finally {
			ledger.close();
		}
	});

	test("(b) the incident shape: defaultLedgerPath({}) resolves under the temp HOME, or is refused when not isolated", () => {
		if (!ISOLATED) {
			expectLiveRefusal("(b)", () => defaultLedgerPath({}));
			return;
		}
		const home = process.env.HOME!;
		expect(home).not.toBe(SENTINEL_HOME);
		expect(defaultLedgerPath({})).toBe(join(home, ".agent-system-2", "ledger.db"));
	});

	test("(c) Ledger.open of homedir()'s ledger is refused", () => {
		expectLiveRefusal("(c)", () => Ledger.open(SENTINEL_DB));
	});

	test("(d) refreeze with the sentinel as an explicit path is refused", () => {
		const scratch = mkdtempSync(join(tmpdir(), "live-guard-refreeze-"));
		try {
			expectLiveRefusal("(d)", () => refreeze(SENTINEL_DB, join(scratch, "fixture")));
		} finally {
			rmSync(scratch, { recursive: true, force: true });
		}
	});

	test("(e) a default-env grandchild resolving the default ledger exits non-zero naming LiveLedgerUnderTestError", () => {
		const r = grandchild();
		expect(r.out).toContain("LiveLedgerUnderTestError");
		expect(r.exitCode).not.toBe(0);
		console.log(`(e) refused: exit ${r.exitCode}, LiveLedgerUnderTestError`);
	});

	test("(f) a scratch-env grandchild (no HOME) exits non-zero naming HOME is not set", () => {
		const r = grandchild({ PATH: process.env.PATH ?? "/usr/bin:/bin" });
		expect(r.out).toContain("HOME is not set");
		expect(r.exitCode).not.toBe(0);
		console.log(`(f) refused: exit ${r.exitCode}, HOME is not set`);
	});

	test("an explicit temp path still opens", () => {
		const dir = mkdtempSync(join(tmpdir(), "live-guard-temp-"));
		try {
			const ledger = Ledger.open(join(dir, "ledger.db"), { create: true });
			expect(ledger.openWorkload({ brief: "temp", stakes: "throwaway", mode: "autonomous", by: "live-guard" })).toMatch(/^wl-/);
			ledger.close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
