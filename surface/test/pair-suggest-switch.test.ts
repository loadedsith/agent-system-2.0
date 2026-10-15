// PR 1 of wl-mv67564rdkfvnk (PLAN rev 5 § 2 D2; § 5 `sl-trig-tests`: "`as2 pair-suggest all` sets the key"): the
// switch is `pairSuggest` in the installed profile config (`off` | `all` | a list of workload ids), the template ships
// it `all` (Jo, 2026-10-14, wl-mv8sbss67lwtts), and `as2 pair-suggest off|all|<wl-id>` edits that one key the way
// `as2 on|off` edits gates.fence.enabled (bin/as2 `fence()`), printing the old and the new value.
//
// bin/as2 runs under bash with HOME at a temp directory, so the config it edits is
// `<tmp>/.omp/profiles/agent-system-2/agent/config.yml` (bin/as2 `CONFIG`). An unknown word falls through to `omp`
// today; PATH puts a fake `omp` first that exits 97, so a word the launcher does not know is an assertion failure here,
// never a real session.
//
// GUESS(design): `as2 pair-suggest <wl-id>` adds the workload to the list (the Phoenix convention the plan's D2 names);
// `off` and `all` replace the value outright. A workload id while `all` is in force leaves `all` (review round 2).
//
// Regression: fails on 946c016 by assertion (the template has no `pairSuggest` key and the word execs the fake omp).
import { beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmp } from "./helpers";

const REPO = resolve(import.meta.dir, "..", "..");
const TEMPLATE = join(REPO, "profile", "config.yml");

let home = "";
let fakeBin = "";
let config = "";

beforeEach(() => {
	home = tmp("pair-switch-home");
	fakeBin = tmp("pair-switch-bin");
	writeFileSync(join(fakeBin, "omp"), "#!/bin/sh\necho \"fake omp ran: $*\"\nexit 97\n");
	chmodSync(join(fakeBin, "omp"), 0o755);
	config = join(home, ".omp", "profiles", "agent-system-2", "agent", "config.yml");
});

/** `as2 <args>` under bash with the temp HOME; the fake omp shadows the real one. */
function as2(...args: string[]): { code: number; stdout: string; stderr: string } {
	const r = Bun.spawnSync(["bash", join(REPO, "bin", "as2"), ...args], {
		env: { HOME: home, AGENT_SYSTEM_PROFILE: "agent-system-2", PATH: `${fakeBin}:${dirname(process.execPath)}:/usr/bin:/bin` },
		stdout: "pipe",
		stderr: "pipe",
	});
	return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

function installConfig(text: string): void {
	mkdirSync(dirname(config), { recursive: true });
	writeFileSync(config, text);
}

const parsed = (): Record<string, unknown> => Bun.YAML.parse(readFileSync(config, "utf8")) as Record<string, unknown>;

/** The installed config without the switch's key, for "every other key unchanged". */
function withoutSwitch(doc: Record<string, unknown>): Record<string, unknown> {
	const { pairSuggest: _, ...rest } = doc;
	return rest;
}

describe("D2: the pair-suggest switch in the profile config", () => {
	test("the profile template ships pairSuggest: all", () => {
		const doc = Bun.YAML.parse(readFileSync(TEMPLATE, "utf8")) as Record<string, unknown>;
		expect(doc.pairSuggest).toBe("all");
	});

	test("as2 pair-suggest off, then all, on the installed template: exit 0, prints old -> new, sets only that key, never runs omp", () => {
		mkdirSync(dirname(config), { recursive: true });
		copyFileSync(TEMPLATE, config);
		const before = parsed();
		const off = as2("pair-suggest", "off");
		expect({ code: off.code, ranOmp: off.stdout.includes("fake omp ran") }).toEqual({ code: 0, ranOmp: false });
		expect(off.stdout).toMatch(/pairSuggest: all -> off/);
		expect(parsed().pairSuggest).toBe("off");
		expect(withoutSwitch(parsed())).toEqual(withoutSwitch(before));

		const all = as2("pair-suggest", "all");
		expect(all.code).toBe(0);
		expect(all.stdout).toMatch(/pairSuggest: off -> all/);
		expect(parsed().pairSuggest).toBe("all");
		expect(withoutSwitch(parsed())).toEqual(withoutSwitch(before));
	});

	test("a workload id adds that workload to the list, once; all and off replace the list", () => {
		installConfig("setupVersion: 2\npairSuggest: off\n");
		expect(as2("pair-suggest", "wl-abc").code).toBe(0);
		expect(parsed().pairSuggest).toEqual(["wl-abc"]);
		expect(as2("pair-suggest", "wl-def").code).toBe(0);
		expect(parsed().pairSuggest).toEqual(["wl-abc", "wl-def"]);
		expect(as2("pair-suggest", "wl-abc").code).toBe(0);
		expect(parsed().pairSuggest).toEqual(["wl-abc", "wl-def"]);
		expect(as2("pair-suggest", "all").code).toBe(0);
		expect(parsed().pairSuggest).toBe("all");
		expect(as2("pair-suggest", "off").code).toBe(0);
		expect(parsed()).toEqual({ setupVersion: 2, pairSuggest: "off" });
	});

	test("an installed config with no pairSuggest key gets the key", () => {
		installConfig("setupVersion: 2\n");
		const r = as2("pair-suggest", "all");
		expect(r.code).toBe(0);
		expect(parsed()).toEqual({ setupVersion: 2, pairSuggest: "all" });
	});

	// Review round 2: a workload id while `all` is in force used to write `[wl-id]`, narrowing coverage to one workload.
	test("a workload id while all is in force: all unchanged, prints all -> all with a note that all covers it, exit 0", () => {
		const text = "setupVersion: 2\npairSuggest: all\n";
		installConfig(text);
		const r = as2("pair-suggest", "wl-abc");
		expect({ code: r.code, ranOmp: r.stdout.includes("fake omp ran") }).toEqual({ code: 0, ranOmp: false });
		expect(r.stdout).toMatch(/pairSuggest: all -> all/);
		expect(r.stdout).toContain("all already covers wl-abc");
		expect(parsed().pairSuggest).toBe("all");
		expect(readFileSync(config, "utf8")).toBe(text);
	});

	test("an unknown value or no value: exit 1, config byte-identical, omp never run", () => {
		const text = "setupVersion: 2\npairSuggest: off\n";
		installConfig(text);
		for (const args of [["pair-suggest", "bogus"], ["pair-suggest"], ["pair-suggest", "on"]]) {
			const r = as2(...args);
			expect({ args, code: r.code, ranOmp: r.stdout.includes("fake omp ran") }).toEqual({ args, code: 1, ranOmp: false });
			expect(readFileSync(config, "utf8")).toBe(text);
		}
	});

	test("no installed config: exit 1, nothing created, omp never run", () => {
		const r = as2("pair-suggest", "all");
		expect({ code: r.code, ranOmp: r.stdout.includes("fake omp ran"), created: existsSync(config) }).toEqual({ code: 1, ranOmp: false, created: false });
	});
});
