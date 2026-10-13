// The clean-shell switch (gates/src/clean-shell.ts; workload wl-mv5lrh0drbg0zk, PLAN.md revision 8):
// its values, the per-call file read and its stat cache, the template's default, and
// `as2 clean-shell` (bin/as2) writing values the gates read back.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanShellOfConfig, cleanShellOffReason, cleanShellOn, parseCleanShell, readCleanShell } from "../src/clean-shell";
import { tmp } from "./helpers";

const REPO = resolve(import.meta.dir, "..", "..");

describe("the switch's values", () => {
	test("off, absent, all, a list (an empty one too)", () => {
		expect(parseCleanShell(undefined)).toEqual({ ok: true, value: "off" });
		expect(parseCleanShell("off")).toEqual({ ok: true, value: "off" });
		expect(parseCleanShell("all")).toEqual({ ok: true, value: "all" });
		expect(parseCleanShell(["wl-a1", "wl-b2"])).toEqual({ ok: true, value: ["wl-a1", "wl-b2"] });
		expect(parseCleanShell([])).toEqual({ ok: true, value: [] });
		expect(cleanShellOfConfig({ gates: { fence: { enabled: true } } })).toEqual({ ok: true, value: "off" });
		expect(cleanShellOfConfig(null)).toEqual({ ok: true, value: "off" });
		expect(cleanShellOfConfig({ gates: { cleanShell: "all" } })).toEqual({ ok: true, value: "all" });
	});

	test("anything else is malformed: a boolean (bare YAML off), null, a number, another word, a list with a non-workload entry", () => {
		for (const v of [false, true, null, 1, "on", "ALL", ["wl-a", "lane-b"], ["wl-A"], [1]]) {
			const r = parseCleanShell(v);
			expect(r.ok).toBe(false);
			if (!r.ok) expect(r.error).toBe(`gates.cleanShell is ${JSON.stringify(v)}, not "off", "all" or a list of workload ids (wl-…)`);
		}
	});

	test("who it is on for", () => {
		const list = parseCleanShell(["wl-a"]);
		expect([cleanShellOn(list, "wl-a"), cleanShellOn(list, "wl-b"), cleanShellOn(list, undefined)]).toEqual([true, false, false]);
		expect([cleanShellOn({ ok: true, value: "all" }, undefined), cleanShellOn({ ok: true, value: "off" }, "wl-a")]).toEqual([true, false]);
		expect(cleanShellOn({ ok: false, error: "x" }, "wl-a")).toBe(false);
		expect(cleanShellOffReason({ ok: false, error: "x" }, "wl-a")).toBe("the clean shell is off for this session because gates.cleanShell could not be read (x): fix it, or turn it on with `as2 clean-shell wl-a` (or `as2 clean-shell all`)");
	});

	test("the template profile/config.yml ships it off", () => {
		expect(cleanShellOfConfig(Bun.YAML.parse(readFileSync(join(REPO, "profile", "config.yml"), "utf8")))).toEqual({ ok: true, value: "off" });
	});
});

describe("readCleanShell reads the profile config at every call", () => {
	test("no config file is off; config.yaml is read when config.yml is absent", () => {
		const dir = tmp("cs-none");
		expect(readCleanShell(dir)).toEqual({ ok: true, value: "off" });
		writeFileSync(join(dir, "config.yaml"), "gates:\n  cleanShell: all\n");
		expect(readCleanShell(dir)).toEqual({ ok: true, value: "all" });
	});

	test("a rewrite is seen on the next read, a same-size rewrite and a rename over it included", () => {
		const dir = tmp("cs-flip");
		const file = join(dir, "config.yml");
		writeFileSync(file, 'gates:\n  cleanShell: "all"\n');
		expect(readCleanShell(dir)).toEqual({ ok: true, value: "all" });
		expect(readCleanShell(dir)).toEqual({ ok: true, value: "all" });
		writeFileSync(file, 'gates:\n  cleanShell: "off"\n');
		expect(readCleanShell(dir)).toEqual({ ok: true, value: "off" });
		writeFileSync(`${file}.tmp`, "gates:\n  cleanShell:\n    - wl-x\n");
		renameSync(`${file}.tmp`, file);
		expect(readCleanShell(dir)).toEqual({ ok: true, value: ["wl-x"] });
	});

	test("a config that does not parse is an error, not a throw", () => {
		const dir = tmp("cs-bad");
		writeFileSync(join(dir, "config.yml"), "gates: [\n");
		const r = readCleanShell(dir);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("could not be read or parsed");
	});
});

describe("as2 clean-shell writes what the gates read", () => {
	const home = (config: string): { env: Record<string, string>; agentDir: string } => {
		const h = tmp("cs-home");
		const agentDir = join(h, ".omp", "profiles", "agent-system-2", "agent");
		mkdirSync(agentDir, { recursive: true });
		writeFileSync(join(agentDir, "config.yml"), config);
		return { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: h }, agentDir };
	};
	const as2 = (env: Record<string, string>, ...args: string[]) => spawnSync("/bin/sh", [join(REPO, "bin", "as2"), "clean-shell", ...args], { encoding: "utf8", env });

	test("from the template: add, add again, add another, all, a workload under all, off; the file ends as it began", () => {
		const template = readFileSync(join(REPO, "profile", "config.yml"), "utf8");
		const { env, agentDir } = home(template);
		const file = join(agentDir, "config.yml");
		const steps: [string, string, unknown][] = [
			["wl-abc1", "off -> [wl-abc1]", ["wl-abc1"]],
			["wl-abc1", "[wl-abc1] -> [wl-abc1]", ["wl-abc1"]],
			["wl-def2", "[wl-abc1] -> [wl-abc1, wl-def2]", ["wl-abc1", "wl-def2"]],
			["all", "[wl-abc1, wl-def2] -> all", "all"],
			["wl-abc1", "all -> all", "all"],
			["off", "all -> off", "off"],
		];
		for (const [arg, printed, value] of steps) {
			const r = as2(env, arg);
			expect({ arg, status: r.status, stdout: r.stdout, stderr: r.stderr }).toEqual({ arg, status: 0, stdout: `gates.cleanShell: ${printed} (${file})\n`, stderr: "" });
			expect(readCleanShell(agentDir)).toEqual({ ok: true, value });
			// Nothing else in the file moves.
			expect(Bun.YAML.parse(readFileSync(file, "utf8")).gates.fence).toEqual({ enabled: true });
		}
		expect(readFileSync(file, "utf8")).toBe(template);
	});

	test("a key that is absent is added under gates:, and with no gates: mapping one is appended", () => {
		const a = home("gates:\n  fence:\n    enabled: true\nbash:\n  direnv: \"off\"\n");
		expect(as2(a.env, "wl-q1").stdout).toContain("gates.cleanShell: absent -> [wl-q1]");
		expect(readCleanShell(a.agentDir)).toEqual({ ok: true, value: ["wl-q1"] });
		expect(Bun.YAML.parse(readFileSync(join(a.agentDir, "config.yml"), "utf8"))).toEqual({ gates: { cleanShell: ["wl-q1"], fence: { enabled: true } }, bash: { direnv: "off" } });
		const b = home("bash:\n  direnv: \"off\"\n");
		expect(as2(b.env, "all").stdout).toContain("gates.cleanShell: absent -> all");
		expect(readCleanShell(b.agentDir)).toEqual({ ok: true, value: "all" });
	});

	test("a hand-written flow list is read and rewritten as a block list", () => {
		const { env, agentDir } = home("gates:\n  cleanShell: [wl-a1, 'wl-b2']\n  fence:\n    enabled: true\n");
		expect(as2(env, "wl-c3").stdout).toContain("gates.cleanShell: [wl-a1, wl-b2] -> [wl-a1, wl-b2, wl-c3]");
		expect(readCleanShell(agentDir)).toEqual({ ok: true, value: ["wl-a1", "wl-b2", "wl-c3"] });
	});

	test("a bad argument, no argument, or no installed profile exits 1 and writes nothing", () => {
		const template = 'gates:\n  cleanShell: "off"\n';
		const { env, agentDir } = home(template);
		for (const args of [["WL-abc"], ["wl-"], ["wl-a_b"], ["on"], [], ["all", "off"]]) {
			const r = as2(env, ...args);
			expect({ args, status: r.status, stdout: r.stdout }).toEqual({ args, status: 1, stdout: "" });
			expect(r.stderr).toStartWith("as2 clean-shell");
		}
		expect(readFileSync(join(agentDir, "config.yml"), "utf8")).toBe(template);
		const r = as2({ PATH: env.PATH!, HOME: tmp("cs-empty") }, "all");
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("no installed profile config");
	});
});
