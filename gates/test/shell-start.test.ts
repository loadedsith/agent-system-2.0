// The certified initial shell state (gates/src/shell-start.ts; workload wl-mv5lrh0drbg0zk, PLAN.md
// revision 7 § 2.2, § 2.4): the C environ reader (a real read in a child process with a `__proto__`
// entry and a bash exported-function name), every condition of `shellStart` and its refusal reason
// over a fake host, ACP read through OMP's own CLI parsers when this machine has them, and the
// launchers (bin/as2, surface/src/launch.ts laneEnv) pinned to SHELL_START_HOOK_NAMES and PI_NO_PTY=1.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { laneEnv } from "../../surface/src/launch";
import type { Ctx } from "../src/session";
import {
	captureGateLoadEnviron,
	type EnvironRead,
	NAMED_CALL_REASON,
	parseEnviron,
	readCEnviron,
	SHELL_START_HOOK_NAMES,
	type ShellStart,
	type ShellStartHost,
	shellStart,
} from "../src/shell-start";
import { environOf, type ShellStartOver, shellStartFixture } from "./helpers";

const REPO = resolve(import.meta.dir, "..", "..");
const OMP = "/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi";
const HAS_OMP = existsSync(`${OMP}/pi-coding-agent/src/cli-commands.ts`);
const CTX = { cwd: "/repo" } as unknown as Ctx;

const start = (o: ShellStartOver = {}, input: Record<string, unknown> = { command: "true" }): Promise<ShellStart> => {
	const { host, proc } = shellStartFixture(o);
	return shellStart(host, CTX, input, "/repo", proc);
};

/** The one reason of a fixture that differs from the certified one in a single way. */
async function only(o: ShellStartOver, input?: Record<string, unknown>): Promise<string> {
	const r = await start(o, input);
	expect(r.certified).toBe(false);
	expect(r.env).toBeUndefined();
	expect(r.reasons.length).toBe(1);
	return r.reasons[0]!;
}

describe("the C environ reader", () => {
	test("parseEnviron keeps every entry by name, a `__proto__` name included, and an empty value", () => {
		const r = parseEnviron(["A=1", "__proto__=p", "E=", "X=a=b"]);
		expect(r.ok).toBe(true);
		if (!r.ok) return;
		expect([...r.env]).toEqual([["A", "1"], ["__proto__", "p"], ["E", ""], ["X", "a=b"]]);
	});

	test("an entry without '=' fails the read, naming its index and not its text", () => {
		expect(parseEnviron(["A=1", "SECRETVALUE"])).toEqual({ ok: false, error: "environ entry 1 has no '='" });
	});

	test("a name that appears twice fails the read", () => {
		expect(parseEnviron(["A=1", "A=2"])).toEqual({ ok: false, error: 'the name "A" appears twice' });
	});

	test("a real read in a child: every entry of the environ it was started with, `__proto__` and a BASH_FUNC_ name included", () => {
		const script = `const { readCEnviron } = await import(${JSON.stringify(join(REPO, "gates", "src", "shell-start.ts"))}); const r = readCEnviron(); console.log(JSON.stringify(r.ok ? { ok: true, env: [...r.env] } : r));`;
		const r = spawnSync("/usr/bin/env", ["-i", "__proto__=p", "BASH_FUNC_f%%=() { echo hi; }", "PLAIN=1", process.execPath, "-e", script], { encoding: "utf8" });
		expect(r.status).toBe(0);
		const got = JSON.parse(r.stdout) as { ok: boolean; env: [string, string][] };
		expect(got.ok).toBe(true);
		const env = new Map(got.env);
		expect({ proto: env.get("__proto__"), func: env.get("BASH_FUNC_f%%"), plain: env.get("PLAIN") }).toEqual({ proto: "p", func: "() { echo hi; }", plain: "1" });
	});

	test("this process's read is complete, and E0 is taken once", () => {
		expect(readCEnviron().ok).toBe(true);
		const first = captureGateLoadEnviron();
		expect(captureGateLoadEnviron()).toBe(first);
	});
});

describe("shellStart certifies a call only when every condition of PLAN.md § 2.2 holds", () => {
	test("the certified state: no reasons, and cert.env is E ⊕ shell.env ⊕ the non-interactive env, later sources winning", async () => {
		const r = await start({
			// A computed key: a literal `__proto__:` would set the prototype, not an entry.
			environ: environOf({ A: "e", B: "e", ["__proto__"]: "kept" }),
			shellEnv: { B: "s", C: "s" },
			nonInteractive: { C: "n" },
		});
		expect({ certified: r.certified, reasons: r.reasons }).toEqual({ certified: true, reasons: [] });
		expect([...(r.env ?? [])].sort()).toEqual([["A", "e"], ["B", "s"], ["C", "n"], ["__proto__", "kept"]].sort());
	});

	test("1. a host OMP whose major.minor is not the verified one", async () => {
		expect(await only({ version: "18.5.0" })).toContain("the running OMP is 18.5.0");
	});

	test("1. the fence flag set to anything but true", async () => {
		expect(await only({ raw: { gates: { fence: { enabled: "yes" } } } })).toContain('gates.fence.enabled is "yes"');
	});

	test("2. auto-background off, direnv not off, a bash-named shell, a command prefix", async () => {
		expect(await only({ settings: { "bash.autoBackground.enabled": false } })).toContain("bash.autoBackground.enabled is false");
		expect(await only({ settings: { "bash.direnv": "auto" } })).toContain('bash.direnv is "auto", not "off"');
		const bash = await only({ shell: "/bin/bash" });
		expect(bash).toContain('"/bin/bash", not /bin/sh');
		expect(bash).toContain("set shellPath: /bin/sh");
		expect(await only({ prefix: "nice" })).toContain("PI_SHELL_PREFIX or CLAUDE_CODE_SHELL_PREFIX");
		expect(await only({ shell: "/bin/zsh" })).toContain('"/bin/zsh"');
	});

	test("2. PI_NO_PTY not 1 in the process", async () => {
		expect(await only({ env: {} })).toContain("PI_NO_PTY is not 1");
		expect(await only({ env: { PI_NO_PTY: "true" } })).toContain("PI_NO_PTY is not 1");
	});

	test("3. ACP: `omp acp` and `--mode acp` (the fixture's stand-in parsers)", async () => {
		expect(await only({ argv: ["acp"] })).toContain("`omp acp`");
		expect(await only({ argv: ["--mode", "acp"] })).toContain("`--mode acp`");
	});

	test("3. a CLI that cannot resolve the argv, runs another command, or throws is not certified", async () => {
		expect(await only({ host: { resolveCliArgv: () => ({ error: "nope" }) } })).toContain("OMP's CLI refuses this process's arguments (nope)");
		expect(await only({ host: { resolveCliArgv: (a: string[]) => ({ argv: ["grep", ...a] }) } })).toContain('runs OMP\'s "grep" command, not launch');
		expect(await only({
			host: {
				parseArgs: () => {
					throw new Error("bad flag");
				},
			},
		})).toContain("could not be parsed the way OMP's CLI parses them (bad flag)");
		expect(await only({ host: { parseArgs: undefined } })).toContain("parseArgs is missing from @oh-my-pi/pi-coding-agent/cli/args");
	});

	test("4. a named call, whatever the name, is refused with the fix", async () => {
		expect(await only({}, { command: "sleep 9", name: "svc" })).toBe(NAMED_CALL_REASON);
		expect(await only({}, { command: "sleep 9", name: "" })).toBe(NAMED_CALL_REASON);
		expect(NAMED_CALL_REASON).toMatch(/named/);
		expect(NAMED_CALL_REASON).toContain("`async: true` (and `timeout: 0` for no deadline) and poll readiness with a command");
	});

	test("5. an environ changed since the gates loaded names the names, never a value", async () => {
		const reason = await only({ gateLoad: environOf({ PATH: "/bin", TOKEN: "old-secret" }), environ: environOf({ PATH: "/bin", TOKEN: "new-secret", ADDED: "x" }) });
		expect(reason).toContain('the C environ changed since the gates loaded ("ADDED", "TOKEN")');
		expect(reason).toContain("restart the session");
		expect(reason).not.toContain("secret");
	});

	test("5. an environ that was not captured or cannot be read", async () => {
		expect(await only({ gateLoad: null })).toContain("was not captured when the gates loaded");
		expect(await only({ gateLoad: { ok: false, error: "x" } })).toContain("could not be read when the gates loaded (x)");
		const unread: EnvironRead = { ok: false, error: "y" };
		const r = await start({ environ: unread, gateLoad: environOf({ PATH: "/bin" }) });
		expect(r.reasons).toEqual([expect.stringContaining("could not be read at this call (y)")]);
	});

	test("5. a newline in a shell.env value names the name and not the value", async () => {
		const reason = await only({ shellEnv: { PATH: "/bin", MULTI: "line1\nline2" } });
		expect(reason).toContain("newline");
		expect(reason).toContain('"MULTI"');
		expect(reason).not.toContain("line1");
	});

	test("5. every shell start hook name is refused, naming where it came from", async () => {
		for (const name of SHELL_START_HOOK_NAMES) {
			const launch = await only({ environ: environOf({ PATH: "/bin", [name]: "v-launch" }) });
			expect(launch).toContain(name);
			expect(launch).toContain("relaunch as2 from a shell that does not export it");
			expect(launch).not.toContain("v-launch");
			const dotenv = await only({ shellEnv: { PATH: "/bin", [name]: "v-dotenv" } });
			expect(dotenv).toContain("remove it from `~/.env`, `<configRoot>/.env` or `<agentDir>/.env`");
			expect(dotenv).not.toContain("v-dotenv");
		}
	});

	test("5. an exported function name, a name that is not an identifier, and a function-shaped value", async () => {
		expect(await only({ environ: environOf({ PATH: "/bin", "BASH_FUNC_f%%": "() { :; }" }) })).toContain('"BASH_FUNC_f%%", a BASH_FUNC_ exported function');
		expect(await only({ environ: environOf({ PATH: "/bin", "A-B": "1" }) })).toContain('the name "A-B", which is not a shell identifier');
		expect(await only({ environ: environOf({ PATH: "/bin", "": "1" }) })).toContain('the name "", which is not a shell identifier');
		expect(await only({ shellEnv: { PATH: "/bin", FN: "() { evil; }" } })).toContain("the env's FN holds a value starting `() {`");
		// `__proto__` is an identifier: kept, and certified.
		expect((await start({ environ: environOf({ PATH: "/bin", ["__proto__"]: "x" }) })).certified).toBe(true);
	});

	test("the host's shell config and non-interactive env are checked for shape", async () => {
		expect(await only({ getShellConfig: 1 })).toContain("Settings#getShellConfig is missing");
		expect(await only({ getShellConfig: () => ({ shell: "/bin/sh" }) })).toContain("returned no { shell, env, prefix } of the verified shape");
		expect(await only({ getShellConfig: () => ({ shell: "/bin/sh", env: { N: 1 } }) })).toContain('shell.env holds "N" with a number value');
		expect(await only({ host: { buildNonInteractiveEnv: undefined } })).toContain("buildNonInteractiveEnv is missing");
		expect(await only({
			host: {
				buildNonInteractiveEnv: () => {
					throw new Error("nie");
				},
			},
		})).toContain("OMP's non-interactive env could not be built (nie)");
	});

	test("every failing condition is reported at once, and a settings read that throws is a reason, not a throw", async () => {
		const r = await start({ env: {}, argv: ["acp"] }, { command: "x", name: "n" });
		expect(r.reasons.length).toBe(3);
		const { host, proc } = shellStartFixture();
		const broken: ShellStartHost = { ...host, Settings: { current: Promise.reject(new Error("settings down")), loadReadOnly: async () => ({ getGlobalSettings: () => ({}) }) } };
		const b = await shellStart(broken, CTX, { command: "true" }, "/repo", proc);
		expect(b.reasons).toEqual([expect.stringContaining("the settings could not be read (settings down)")]);
	});
});

describe.skipIf(!HAS_OMP)("ACP is read the way OMP's own CLI reads its argv", () => {
	// By absolute path, dynamically: the global OMP install is absent on a fresh clone (host.test.ts, same reason).
	const real = async (): Promise<Partial<ShellStartHost>> => {
		const [{ parseArgs }, { resolveCliArgv }, { extractProfileFlags }] = await Promise.all([
			import(`${OMP}/pi-coding-agent/src/cli/args.ts`),
			import(`${OMP}/pi-coding-agent/src/cli-commands.ts`),
			import(`${OMP}/pi-coding-agent/src/cli/profile-bootstrap.ts`),
		]);
		return { parseArgs, resolveCliArgv, extractProfileFlags };
	};

	for (const argv of [["--mode", "acp"], ["--mode=acp"], ["acp"], ["--approval-mode=yolo", "acp"], ["--profile", "x", "acp"]]) {
		test(`refused: ${argv.join(" ")}`, async () => {
			const r = await start({ argv, host: await real() });
			expect(r.certified).toBe(false);
			expect(r.reasons).toEqual([expect.stringMatching(/ACP/)]);
		});
	}

	for (const argv of [[], ["--cwd", "/repo"], ["--mode", "rpc", "--no-pty"], ["--approval-mode", "yolo", "--cwd", "/x"], ["launch", "--cwd", "/x"]]) {
		test(`certified: ${argv.join(" ") || "(no arguments)"}`, async () => {
			expect((await start({ argv, host: await real() })).reasons).toEqual([]);
		});
	}
});

describe("the launchers drop exactly SHELL_START_HOOK_NAMES and set PI_NO_PTY=1", () => {
	test("bin/as2: every `env -u` line (the usage text, both lane launches, --print, the orchestrator launch)", () => {
		const lines = readFileSync(join(REPO, "bin", "as2"), "utf8").split("\n").filter((l) => l.includes("env -u "));
		expect(lines.length).toBe(5);
		for (const line of lines) {
			expect([...line.matchAll(/-u (\S+)/g)].map((m) => m[1])).toEqual([...SHELL_START_HOOK_NAMES]);
			expect(line).toMatch(new RegExp(`-u ${SHELL_START_HOOK_NAMES.at(-1)} PI_NO_PTY=1( |$)`));
		}
	});

	test("bin/as2 --print prints the dropping launch line", () => {
		const r = spawnSync("/bin/sh", [join(REPO, "bin", "as2"), "--print"], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: "/nonexistent-home" } });
		expect(r.status).toBe(0);
		expect(r.stdout).toStartWith(`env ${SHELL_START_HOOK_NAMES.map((n) => `-u ${n}`).join(" ")} PI_NO_PTY=1 OMP_PROFILE=agent-system-2 AGENT_SYSTEM_ROLE=orchestrator omp --cwd `);
	});

	test("surface/src/launch.ts laneEnv", () => {
		const base: Record<string, string> = { HOME: "/h", PATH: "/bin", PI_NO_PTY: "0" };
		for (const name of SHELL_START_HOOK_NAMES) base[name] = "x";
		const env = laneEnv(base, { workloadId: "wl-a", laneId: "lane-a" });
		for (const name of SHELL_START_HOOK_NAMES) expect(Object.hasOwn(env, name)).toBe(false);
		expect({ HOME: env.HOME, PATH: env.PATH, PI_NO_PTY: env.PI_NO_PTY }).toEqual({ HOME: "/h", PATH: "/bin", PI_NO_PTY: "1" });
	});
});
