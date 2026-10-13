// The per-workload tracing switch (wl-mv65t5d34lts00 PLAN.md § 2, § 5 "Tests (slice 1)"): the reader
// (surface/src/tracing.ts), the lane spawn env both spawn sites build (surface/scripts/lane.ts
// laneSpawnEnv), the orchestrator launcher's env words (bin/as2, including a failing reader) and the
// `as2 phoenix` word's edit of the installed profile's config.yml.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
// A namespace import, not named ones: a name lane.ts stops exporting fails only the test that calls it, not the module load.
import * as laneScript from "../scripts/lane";
import { parseObservability, readTracingSetting, type TracingSetting, tracingEnv } from "../src/tracing";
import { tmp } from "./helpers";

const REPO = resolve(import.meta.dir, "..", "..");
const AS2 = join(REPO, "bin", "as2");
const TEMPLATE = readFileSync(join(REPO, "profile", "config.yml"), "utf8");

/** The otel map of PLAN § 2, as profile/config.yml ships it. */
const OTEL = {
	OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://127.0.0.1:6006/v1/traces",
	OTEL_EXPORTER_OTLP_TRACES_PROTOCOL: "http/protobuf",
	OTEL_EXPORTER_OTLP_TRACES_TIMEOUT: "2000",
	OTEL_TRACES_EXPORTER: "otlp",
	OTEL_LOGS_EXPORTER: "none",
	OTEL_METRICS_EXPORTER: "none",
	OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT: "none",
};
const BASE = { HOME: "/h", PATH: "/bin", OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://evil:1/v1/traces", OTEL_EXPORTER_OTLP_ENDPOINT: "http://evil:2", OTEL_SDK_DISABLED: "false" };
const LANE = { role: "lane" as const, workloadId: "wl-a", laneId: "lane-a-1" };
const ORCH = { role: "orchestrator" as const };

const otelOf = (env: Record<string, string>) => Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith("OTEL_")));
const OFF = { OTEL_SDK_DISABLED: "true" };
const onFor = (role: string, attrs: string) => ({ ...OTEL, OTEL_SDK_DISABLED: "false", OTEL_SERVICE_NAME: `as2-${role}`, OTEL_RESOURCE_ATTRIBUTES: attrs });
const LANE_ON = onFor("lane", "as2.role=lane,as2.workload=wl-a,as2.lane=lane-a-1");
const ORCH_ON = onFor("orchestrator", "as2.role=orchestrator");

/** profile/config.yml as shipped, with observability.phoenix set to `value` (the template's own text otherwise). */
const templateWith = (value: string) => TEMPLATE.replace(/^ {2}phoenix: off/m, `  phoenix: ${value}`);
const setting = (block: unknown): TracingSetting | null => parseObservability(block).setting;

const roots: string[] = [];
const root = (tag: string) => {
	const r = tmp(`tracing-${tag}`);
	roots.push(r);
	return r;
};
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("the reader: tracingEnv(base, setting, scope)", () => {
	test("off, absent or malformed: the env has no OTEL_* name but OTEL_SDK_DISABLED=true, even when the base carried an endpoint", () => {
		const blocks: unknown[] = [
			undefined,
			null,
			{ phoenix: "off", otel: OTEL },
			{ otel: OTEL },
			"on",
			["wl-a"],
			{ phoenix: "yes", otel: OTEL },
			{ phoenix: true, otel: OTEL },
			{ phoenix: ["wl-a", 7], otel: OTEL },
			{ phoenix: "all", otel: "http://127.0.0.1:6006" },
			{ phoenix: "all", otel: [OTEL] },
		];
		for (const block of blocks) {
			const s = setting(block);
			for (const scope of [LANE, ORCH]) {
				const env = tracingEnv(BASE, s, scope);
				expect(otelOf(env)).toEqual(OFF);
				expect(env).toMatchObject({ HOME: "/h", PATH: "/bin" });
			}
		}
		// Malformed (not absent, not off) says why; absent and off say nothing.
		expect(parseObservability(undefined).notes).toEqual([]);
		expect(parseObservability({ phoenix: "off" }).notes).toEqual([]);
		expect(parseObservability({ phoenix: "yes" }).notes).toEqual([expect.stringContaining("observability.phoenix")]);
		expect(parseObservability({ phoenix: "all", otel: "x" }).notes).toEqual([expect.stringContaining("observability.otel is not a mapping")]);
	});

	test("an absent, unreadable or unparseable config file is off and never throws", () => {
		const r = root("files");
		const files = { missing: join(r, "missing.yml"), bad: join(r, "bad.yml"), none: join(r, "none.yml"), scalar: join(r, "scalar.yml") };
		writeFileSync(files.bad, "observability: [unclosed\n  phoenix: all\n");
		writeFileSync(files.none, "setupVersion: 2\n");
		writeFileSync(files.scalar, "just a string\n");
		for (const path of Object.values(files)) {
			const read = readTracingSetting(path);
			expect(otelOf(tracingEnv(BASE, read.setting, LANE))).toEqual(OFF);
		}
		expect(readTracingSetting(files.missing).notes).toEqual([expect.stringContaining("could not be read")]);
		expect(readTracingSetting(files.none).notes).toEqual([]);
	});

	test("a list containing the workload: the whole otel map, SDK on, service name and resource attributes with the workload and lane ids", () => {
		const env = tracingEnv(BASE, setting({ phoenix: ["wl-b", "wl-a"], otel: OTEL }), LANE);
		expect(otelOf(env)).toEqual(LANE_ON);
		expect(env).toMatchObject({ HOME: "/h", PATH: "/bin" });
	});

	test("a list without the workload is off for it; a list is off for the orchestrator", () => {
		const s = setting({ phoenix: ["wl-b"], otel: OTEL });
		expect(otelOf(tracingEnv(BASE, s, LANE))).toEqual(OFF);
		expect(otelOf(tracingEnv(BASE, setting({ phoenix: ["wl-a"], otel: OTEL }), ORCH))).toEqual(OFF);
	});

	test("all: on for every lane and for the orchestrator", () => {
		const s = setting({ phoenix: "all", otel: OTEL });
		expect(otelOf(tracingEnv(BASE, s, LANE))).toEqual(LANE_ON);
		expect(otelOf(tracingEnv(BASE, s, { role: "lane", workloadId: "wl-zz", laneId: "lane-zz-3" }))).toEqual(
			onFor("lane", "as2.role=lane,as2.workload=wl-zz,as2.lane=lane-zz-3"),
		);
		expect(otelOf(tracingEnv(BASE, s, ORCH))).toEqual(ORCH_ON);
	});

	test("a name or value outside the allowed shape is dropped with a note; the rest still applies", () => {
		const read = parseObservability({
			phoenix: "all",
			otel: {
				...OTEL,
				OTEL_BAD_VALUE: "a b",
				OTEL_SHELL: "$(touch /tmp/x)",
				OTEL_QUOTE: "it's",
				NOT_OTEL: "x",
				otel_lower: "x",
				"OTEL_SPACE NAME": "x",
				OTEL_NESTED: { a: 1 },
				OTEL_NUMBER: 3000,
			},
		});
		expect(read.notes.length).toBe(7);
		expect(otelOf(tracingEnv({}, read.setting, ORCH))).toEqual({ ...ORCH_ON, OTEL_NUMBER: "3000" });
		// A setting built by hand is checked too: tracingEnv never sets a value outside the shape.
		const hand: TracingSetting = { phoenix: "all", otel: { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://x/;rm -rf", OTEL_TRACES_EXPORTER: "otlp" } };
		expect(otelOf(tracingEnv({}, hand, ORCH))).toEqual({ OTEL_TRACES_EXPORTER: "otlp", OTEL_SDK_DISABLED: "false", OTEL_SERVICE_NAME: "as2-orchestrator", OTEL_RESOURCE_ATTRIBUTES: "as2.role=orchestrator" });
	});

	test("profile/config.yml ships the switch off with exactly PLAN § 2's otel map", () => {
		const doc = Bun.YAML.parse(TEMPLATE) as { observability: unknown };
		expect(doc.observability).toEqual({ phoenix: "off", otel: OTEL });
		expect(parseObservability(doc.observability)).toEqual({ setting: { phoenix: "off", otel: OTEL }, notes: [] });
	});
});

describe("the lane spawn env: lane.ts laneSpawnEnv(process env, config path, binding), the builder both spawn sites call", () => {
	test("a listed workload's lane carries the otel vars and the binding; another workload's lane gets the off env; the base's OTEL_* never pass", () => {
		const r = root("lane");
		const config = join(r, "config.yml");
		writeFileSync(config, templateWith("[wl-a, wl-c]"));
		const listed = laneScript.laneSpawnEnv(BASE, config, { workloadId: "wl-a", laneId: "lane-a-1" });
		expect(listed.notes).toEqual([]);
		expect(otelOf(listed.env)).toEqual(LANE_ON);
		expect(listed.env).toMatchObject({ HOME: "/h", PATH: "/bin", AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_WORKLOAD_ID: "wl-a", AGENT_SYSTEM_LANE_ID: "lane-a-1" });
		const other = laneScript.laneSpawnEnv(BASE, config, { workloadId: "wl-b", laneId: "lane-b-1" });
		expect(otelOf(other.env)).toEqual(OFF);
		expect(other.env).toMatchObject({ AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_WORKLOAD_ID: "wl-b", AGENT_SYSTEM_LANE_ID: "lane-b-1" });
	});

	test("the template as shipped (off), a malformed block and a missing file are the off env; malformed and missing say why", () => {
		const r = root("lane-off");
		const shipped = join(r, "shipped.yml");
		const malformed = join(r, "malformed.yml");
		writeFileSync(shipped, TEMPLATE);
		writeFileSync(malformed, templateWith("everything"));
		const b = { workloadId: "wl-a", laneId: "lane-a-1" };
		expect(otelOf(laneScript.laneSpawnEnv(BASE, shipped, b).env)).toEqual(OFF);
		expect(laneScript.laneSpawnEnv(BASE, shipped, b).notes).toEqual([]);
		const bad = laneScript.laneSpawnEnv(BASE, malformed, b);
		expect(otelOf(bad.env)).toEqual(OFF);
		expect(bad.notes).toEqual([expect.stringContaining("observability.phoenix")]);
		const missing = laneScript.laneSpawnEnv(BASE, join(r, "missing.yml"), b);
		expect(otelOf(missing.env)).toEqual(OFF);
		expect(missing.notes).toEqual([expect.stringContaining("could not be read")]);
	});
});

// ---- bin/as2 -------------------------------------------------------------------------------------

/** A temp HOME whose installed profile config.yml is `text` (null: none); returns the home and the config path. */
function profileHome(tag: string, text: string | null): { home: string; config: string } {
	const home = root(tag);
	const dir = join(home, ".omp", "profiles", "agent-system-2", "agent");
	mkdirSync(dir, { recursive: true });
	const config = join(dir, "config.yml");
	if (text !== null) writeFileSync(config, text);
	return { home, config };
}

/** The test process's env without any OTEL_* name or profile override, plus `over`. */
function shellEnv(over: Record<string, string>): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("OTEL_") && k !== "AGENT_SYSTEM_PROFILE") env[k] = v;
	return { ...env, ...over };
}

function as2(shell: "sh" | "zsh" | "bash", script: string, args: string[], env: Record<string, string>) {
	const r = Bun.spawnSync([shell, script, ...args], { cwd: REPO, env, stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

/** A PATH whose `omp` prints its OTEL_* env (sorted) and its arguments, ahead of the real one. */
function fakeOmpPath(): string {
	const bin = root("fake-omp");
	writeFileSync(join(bin, "omp"), "#!/bin/sh\nenv | grep '^OTEL_' | sort\nprintf 'args:'\nfor a in \"$@\"; do printf ' [%s]' \"$a\"; done\nprintf '\\n'\n");
	chmodSync(join(bin, "omp"), 0o755);
	return `${bin}:${process.env.PATH}`;
}

/** `env`'s words from an --print line (no word in these tests needs quoting). */
const words = (line: string) => line.trim().split(" ");

describe("bin/as2: the orchestrator's tracing env", () => {
	const SHELLS = ["sh", "zsh", "bash"] as const;

	test("--print, switch off: every inherited OTEL_* name is unset and OTEL_SDK_DISABLED=true is set, before the profile and role", () => {
		const { home } = profileHome("print-off", TEMPLATE);
		for (const shell of SHELLS) {
			const r = as2(shell, AS2, ["--print", "--resume", "x"], shellEnv({ HOME: home, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://evil:1/v1/traces", OTEL_FOO: "1" }));
			expect({ shell, code: r.code, err: r.err }).toEqual({ shell, code: 0, err: "" });
			const w = words(r.out);
			const unset = w.slice(1, 5);
			expect(w[0]).toBe("env");
			expect(unset.filter((x) => x === "-u").length).toBe(2);
			expect(unset.filter((x) => x !== "-u").sort()).toEqual(["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "OTEL_FOO"]);
			expect(w.slice(5)).toEqual(["OTEL_SDK_DISABLED=true", "OMP_PROFILE=agent-system-2", "AGENT_SYSTEM_ROLE=orchestrator", "omp", "--cwd", REPO, "--resume", "x"]);
		}
		// Nothing inherited: no -u at all.
		expect(as2("sh", AS2, ["--print"], shellEnv({ HOME: home })).out).toBe(`env OTEL_SDK_DISABLED=true OMP_PROFILE=agent-system-2 AGENT_SYSTEM_ROLE=orchestrator omp --cwd ${REPO}\n`);
	});

	test("--print and launch, switch all: the orchestrator gets the otel map; a list leaves it off", () => {
		const all = profileHome("print-all", templateWith("all"));
		const r = as2("zsh", AS2, ["--print"], shellEnv({ HOME: all.home }));
		expect(r.code).toBe(0);
		const w = words(r.out);
		expect(w.slice(0, 1 + Object.keys(ORCH_ON).length).slice(1).sort()).toEqual(Object.entries(ORCH_ON).map(([k, v]) => `${k}=${v}`).sort());
		// The launch itself: the env omp really starts with.
		const launched = as2("sh", AS2, ["--resume", "x y"], shellEnv({ HOME: all.home, PATH: fakeOmpPath(), OTEL_EXPORTER_OTLP_ENDPOINT: "http://evil:2" }));
		expect(launched.code).toBe(0);
		expect(launched.out).toBe(`${Object.entries(ORCH_ON).map(([k, v]) => `${k}=${v}`).sort().join("\n")}\nargs: [--cwd] [${REPO}] [--resume] [x y]\n`);
		const list = profileHome("print-list", templateWith("[wl-a]"));
		expect(as2("sh", AS2, ["--print"], shellEnv({ HOME: list.home })).out).toBe(`env OTEL_SDK_DISABLED=true OMP_PROFILE=agent-system-2 AGENT_SYSTEM_ROLE=orchestrator omp --cwd ${REPO}\n`);
	});

	test("a failing reader (bun pointed at a missing script): inherited OTEL_* unset, OTEL_SDK_DISABLED=true, and one line saying so", () => {
		// bin/as2 copied into a tree with no surface/scripts/tracing.ts: <repo> is its parent, so the reader is missing.
		const tree = realpathSync(root("no-reader"));
		mkdirSync(join(tree, "bin"));
		copyFileSync(AS2, join(tree, "bin", "as2"));
		const { home } = profileHome("no-reader-home", templateWith("all"));
		for (const shell of SHELLS) {
			const r = as2(shell, join(tree, "bin", "as2"), ["--print"], shellEnv({ HOME: home, OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://evil:1/v1/traces" }));
			expect({ shell, code: r.code }).toEqual({ shell, code: 0 });
			expect(r.out).toBe(`env -u OTEL_EXPORTER_OTLP_TRACES_ENDPOINT OTEL_SDK_DISABLED=true OMP_PROFILE=agent-system-2 AGENT_SYSTEM_ROLE=orchestrator omp --cwd ${tree}\n`);
			expect(r.err.split("\n").filter(Boolean)).toEqual([expect.stringMatching(/^as2: the tracing switch could not be read \(exit \d+\); omp starts with tracing off \(OTEL_SDK_DISABLED=true\)$/)]);
		}
		// And the launch: omp really starts with the inherited endpoint gone and the SDK disabled.
		const launched = as2("bash", join(tree, "bin", "as2"), [], shellEnv({ HOME: home, PATH: fakeOmpPath(), OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://evil:1/v1/traces" }));
		expect(launched.code).toBe(0);
		expect(launched.out).toBe(`OTEL_SDK_DISABLED=true\nargs: [--cwd] [${tree}]\n`);
		expect(launched.err.split("\n").filter(Boolean).length).toBe(1);
	});

	test("a malformed setting: off, with the reader's note relayed on stderr", () => {
		const { home } = profileHome("print-malformed", templateWith("sometimes"));
		const r = as2("sh", AS2, ["--print"], shellEnv({ HOME: home }));
		expect(r.code).toBe(0);
		expect(r.out).toBe(`env OTEL_SDK_DISABLED=true OMP_PROFILE=agent-system-2 AGENT_SYSTEM_ROLE=orchestrator omp --cwd ${REPO}\n`);
		expect(r.err).toMatch(/^as2: tracing: observability\.phoenix is "sometimes"/);
	});
});

describe("as2 phoenix off|all|<wl-id>: only observability.phoenix changes", () => {
	const OLD_PROFILE = "setupVersion: 2\n# a comment Jo wrote\ngates:\n  fence:\n    enabled: true   # keep me\ntestRunner:\n  repos: []\n";

	test("on a profile without the block: the template block is appended; the file before it is byte-identical", () => {
		const { home, config } = profileHome("set-append", OLD_PROFILE);
		const r = as2("sh", AS2, ["phoenix", "wl-a"], shellEnv({ HOME: home }));
		expect(r).toEqual({ code: 0, out: `observability.phoenix: absent -> [wl-a] (${config})\n`, err: "" });
		const text = readFileSync(config, "utf8");
		expect(text.startsWith(OLD_PROFILE)).toBe(true);
		const doc = Bun.YAML.parse(text) as Record<string, unknown>;
		expect(doc.observability).toEqual({ phoenix: ["wl-a"], otel: OTEL });
		expect(doc.gates).toEqual({ fence: { enabled: true } });
		// The appended part is the template's own block (its comment header included), with the value set.
		const block = TEMPLATE.slice(TEMPLATE.indexOf("# ── Tracing switch"));
		expect(text).toBe(`${OLD_PROFILE}\n${block.replace("  phoenix: off", "  phoenix: [wl-a]")}`);
	});

	test("on a profile with the block: an id joins the list, all and off set the value, and every other byte is kept", () => {
		const { home, config } = profileHome("set-edit", TEMPLATE);
		const env = shellEnv({ HOME: home });
		const steps: [string, string, string][] = [
			["wl-a", "off", "[wl-a]"],
			["wl-b", "[wl-a]", "[wl-a, wl-b]"],
			["wl-a", "[wl-a, wl-b]", "[wl-a, wl-b]"],
			["all", "[wl-a, wl-b]", "all"],
			["off", "all", "off"],
		];
		const without = (t: string) => t.split("\n").filter((l) => !l.startsWith("  phoenix:")).join("\n");
		for (const [word, from, to] of steps) {
			const r = as2("bash", AS2, ["phoenix", word], env);
			expect(r).toEqual({ code: 0, out: `observability.phoenix: ${from} -> ${to} (${config})\n`, err: "" });
			const text = readFileSync(config, "utf8");
			expect(without(text)).toBe(without(TEMPLATE));
			expect(text.split("\n").find((l) => l.startsWith("  phoenix:"))).toBe(`  phoenix: ${to}${TEMPLATE.split("\n").find((l) => l.startsWith("  phoenix:"))!.slice("  phoenix: off".length)}`);
		}
		// `off` after the round trip: the file is the template again, byte for byte.
		expect(readFileSync(config, "utf8")).toBe(TEMPLATE);
	});

	test("a block-style list is replaced by the one-line value; a word that is no value is refused and nothing is written", () => {
		const text = `${OLD_PROFILE}observability:\n  phoenix:\n    - wl-a\n    - wl-b\n  otel:\n    OTEL_TRACES_EXPORTER: otlp\n# trailer\n`;
		const { home, config } = profileHome("set-block-list", text);
		const env = shellEnv({ HOME: home });
		expect(as2("zsh", AS2, ["phoenix", "wl-c"], env)).toEqual({ code: 0, out: `observability.phoenix: [wl-a, wl-b] -> [wl-a, wl-b, wl-c] (${config})\n`, err: "" });
		expect(readFileSync(config, "utf8")).toBe(`${OLD_PROFILE}observability:\n  phoenix: [wl-a, wl-b, wl-c]\n  otel:\n    OTEL_TRACES_EXPORTER: otlp\n# trailer\n`);
		const before = readFileSync(config, "utf8");
		for (const bad of [["phoenix", "on"], ["phoenix", "WL-A"], ["phoenix"], ["phoenix", "all", "off"]]) {
			const r = as2("sh", AS2, bad, env);
			expect(r.code).not.toBe(0);
			expect(readFileSync(config, "utf8")).toBe(before);
		}
		// No installed profile: refused, nothing created.
		const none = profileHome("set-none", null);
		const r = as2("sh", AS2, ["phoenix", "all"], shellEnv({ HOME: none.home }));
		expect(r.code).toBe(1);
		expect(r.err).toContain("no installed profile config");
	});
});
