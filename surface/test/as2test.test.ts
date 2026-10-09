// The `_as2test` wrapper, test-exec, the preflight and the setup script (MIGRATION.md item 24; the
// approved plan of workload wl-muraerdsgw7gn4, revision 12, § 2.3 steps 1 and 3, § 3.1, § 6 S4b).
//
// Everything runs in the fence as the current user: a fake `sudo` on PATH strips `-n -u _as2test`
// and execs a wrapper rendered into a tmp root with `sweepScope: groups`, so a sweep reaches only
// the process groups that wrapper started. The setup script runs with fake dscl, sudo and visudo
// under AS2TEST_SETUP_TEST_PREFIX; real sudo is never called.
import { Database } from "bun:sqlite";
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import {
	CREDENTIAL_PATHS, execArgv, execConfigOf, installDecision, installLayout, parseSource, preflightDecision, preflightProbes, probeCall, probeDecision,
	readInstall, renderExecWrapper, type SweepScope, UID_SWEEP, WrapperRenderError,
} from "../src/as2test";
import { AS2TEST_USER, CHILD_ENV_ALLOWLIST, childEnv, WRAPPER_EXIT, type WrapperCall } from "../src/test-run";
import { tmp } from "./helpers";

const REPO = realpathSync(join(import.meta.dir, "..", ".."));
const SCRIPT = join(REPO, "surface", "scripts", "test-exec.ts");
const SETUP = join(REPO, "install", "as2test-setup.sh");
const BUN = process.execPath;
const SYS_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";

const made: string[] = [];
/** chmod u+rwx every directory beneath, so rmSync can delete what a test sealed. */
function unseal(p: string): void {
	let st;
	try {
		st = lstatSync(p);
	} catch {
		return;
	}
	if (!st.isDirectory()) return;
	chmodSync(p, 0o755);
	for (const n of readdirSync(p)) unseal(join(p, n));
}
const pids: number[] = [];
afterAll(() => {
	for (const pid of pids) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {
			// already gone
		}
	}
	for (const r of made) {
		unseal(r);
		rmSync(r, { recursive: true, force: true });
	}
});
const dir = (tag: string): string => {
	const d = realpathSync(tmp(`as2test-${tag}`));
	made.push(d);
	return d;
};

const FAKE_SUDO = `#!/bin/sh
# fake sudo for the fence: the runner's argv is exactly sudo -n -u _as2test <exec> ...; run <exec> as the current user.
[ "$1" = -n ] && [ "$2" = -u ] && [ "$3" = ${AS2TEST_USER} ] || { echo "fake sudo: unexpected argv: $*" >&2; exit 1; }
shift 3
exec "$@"
`;

const alive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};
// These tests drive real processes, signals and file locks, so they poll the condition they await;
// fake timers cannot move another process's clock.
async function until(cond: () => boolean, ms: number): Promise<boolean> {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (cond()) return true;
		await Bun.sleep(25);
	}
	return cond();
}

function git(cwd: string, ...args: string[]): string {
	const r = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@localhost", "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], {
		cwd, env: { PATH: SYS_PATH, HOME: cwd, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" }, stdout: "pipe", stderr: "pipe",
	});
	if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
	return r.stdout.toString().trim();
}

interface Box {
	root: string;
	exec: string;
	bin: string;
	hooks: string;
}

/** A tmp as2test root with a groups-scope wrapper and a fake sudo on PATH (§ 6 S4b). */
function box(tag: string, opts: { killGraceMs?: number; sweepLockWaitMs?: number; script?: string } = {}): Box {
	const base = dir(tag);
	const root = join(base, "root");
	for (const d of ["stage", "runs", "locks"]) mkdirSync(join(root, d), { recursive: true });
	writeFileSync(join(root, "locks", "sweep.db"), "", { mode: 0o600 });
	const hooks = join(base, "hooks");
	mkdirSync(hooks);
	const bin = join(base, "bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "sudo"), FAKE_SUDO, { mode: 0o755 });
	const exec = join(base, "exec");
	writeFileSync(exec, renderExecWrapper({ root, bun: BUN, script: opts.script ?? SCRIPT, sweepScope: "groups", hooks, killGraceMs: opts.killGraceMs ?? 500, sweepLockWaitMs: opts.sweepLockWaitMs }), { mode: 0o755 });
	return { root, exec, bin, hooks };
}

/** A second wrapper over the same root with other test limits. */
function wrapperFor(b: Box, name: string, opts: { sweepLockWaitMs?: number }): string {
	const exec = join(b.root, "..", name);
	writeFileSync(exec, renderExecWrapper({ root: b.root, bun: BUN, script: SCRIPT, sweepScope: "groups", hooks: b.hooks, killGraceMs: 500, ...opts }), { mode: 0o755 });
	return exec;
}

/** The caller's env carries credentials; the wrapper's `env -i` must drop them. */
const callerEnv = (b: Box) => ({
	PATH: `${b.bin}:${SYS_PATH}`, HOME: "/nonexistent-home", GH_TOKEN: "ghp_secret", ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-oai", MOONSHOT_API_KEY: "ms",
	SSH_AUTH_SOCK: "/tmp/agent.sock", OMP_TOKEN: "omp", AGENT_SYSTEM_TEST_RUNS: "/tmp/runs", AGENT_SYSTEM_LEDGER_DB: "/tmp/ledger.db", LANG: "C",
});

interface Ran {
	exit: number | null;
	stdout: string;
	stderr: string;
}
function raw(b: Box, args: string[], exec = b.exec): Ran {
	const r = Bun.spawnSync(["sudo", "-n", "-u", AS2TEST_USER, exec, ...args], { env: callerEnv(b), stdout: "pipe", stderr: "pipe" });
	return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}
function call(b: Box, c: WrapperCall): Ran {
	const r = Bun.spawnSync(execArgv(c, b.exec), { env: callerEnv(b), stdout: "pipe", stderr: "pipe" });
	return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}
function spawnCall(b: Box, c: WrapperCall, exec = b.exec) {
	const p = Bun.spawn(execArgv(c, exec), { env: callerEnv(b), stdout: "pipe", stderr: "pipe" });
	pids.push(p.pid);
	return p;
}

const setCurrent = (b: Box, runId: string) => writeFileSync(join(b.root, "stage", "current"), `${runId}\n`);
const workOf = (b: Box, runId: string) => join(b.root, "runs", runId);

/** A fixture repo bundled into `<stage>/<run id>/repo.bundle`, with caps; returns the head sha. */
function stageRepo(b: Box, runId: string, files: Record<string, string>, caps = { fullCapMin: 1, soloCapMin: 1 }): string {
	const src = join(b.root, "..", `src-${runId}`);
	mkdirSync(src, { recursive: true });
	git(src, "init", "-q", "-b", "main");
	for (const [p, text] of Object.entries(files)) {
		mkdirSync(join(src, p, ".."), { recursive: true });
		writeFileSync(join(src, p), text);
	}
	git(src, "add", "-A");
	git(src, "commit", "-q", "-m", "fixture");
	const sha = git(src, "rev-parse", "HEAD");
	const stage = join(b.root, "stage", runId);
	mkdirSync(stage, { recursive: true });
	git(src, "bundle", "create", "-q", join(stage, "repo.bundle"), "--all");
	writeFileSync(join(stage, "caps.json"), JSON.stringify(caps));
	return sha;
}

const OK_TEST = `import { expect, test } from "bun:test";\ntest("ok", () => { expect(1).toBe(1); });\n`;
const ENV_TEST = `import { test } from "bun:test";\nimport { writeFileSync } from "node:fs";\ntest("env", () => { writeFileSync("../env.json", JSON.stringify(process.env)); });\n`;
const SLOW_TEST = `import { test } from "bun:test";\nimport { writeFileSync } from "node:fs";\ntest("slow", async () => {\n\tconst c = Bun.spawn(["/bin/sleep", "300"]);\n\twriteFileSync("../slow.pid", String(c.pid));\n\tawait new Promise(() => {});\n}, 600_000);\n`;
const ORPHAN_TEST = `import { test } from "bun:test";\ntest("orphan", () => {\n\tBun.spawnSync(["/bin/sh", "-c", "/bin/sleep 300 >/dev/null 2>&1 & echo $! > ../orphan.pid"]);\n});\n`;
/** The same, but the grandchild ignores SIGTERM: only a SIGKILL ends it. */
const STUBBORN_TEST = `import { test } from "bun:test";\ntest("stubborn", () => {\n\tBun.spawnSync(["/bin/sh", "-c", "(trap '' TERM; exec /bin/sleep 300) >/dev/null 2>&1 & echo $! > ../orphan.pid"]);\n});\n`;

/** prepare a fresh run: stage the repo, publish current, clone. */
function prepared(b: Box, runId: string, files: Record<string, string>, caps?: { fullCapMin: number; soloCapMin: number }): string {
	const sha = stageRepo(b, runId, files, caps);
	setCurrent(b, runId);
	const r = call(b, { sub: "prepare", runId, sha });
	expect(r.stderr).toBe("");
	expect(r.exit).toBe(WRAPPER_EXIT.ok);
	return sha;
}

// ---- the wrapper's argv checks ---------------------------------------------------------------------------

describe("the wrapper refuses bad argv", () => {
	const b = box("argv");
	setCurrent(b, "tr-a1");

	test("a run id outside ^tr-[a-z0-9]+$ is refused, by the sh wrapper and by test-exec itself", () => {
		for (const id of ["tr-", "tr-A1", "tr-a_1", "x-a1", "tr-a1/../b", "tr-a1 ", "../tr-a1"]) {
			const r = raw(b, ["full", id]);
			expect(r.exit).toBe(WRAPPER_EXIT.refused);
			expect(r.stderr).toContain("run id");
		}
		const direct = Bun.spawnSync([BUN, SCRIPT, "full", "tr-A1"], {
			env: { PATH: SYS_PATH, AS2TEST_EXEC_CONFIG: JSON.stringify(execConfigOf({ root: b.root, bun: BUN, script: SCRIPT, sweepScope: "groups" })) }, stderr: "pipe",
		});
		expect(direct.exitCode).toBe(WRAPPER_EXIT.refused);
		expect(() => execArgv({ sub: "full", runId: "tr-A1" })).toThrow();
	});

	test("wrong arity is refused for every subcommand", () => {
		for (const args of [["full"], ["full", "tr-a1", "x"], ["sweep", "tr-a1", "x"], ["prepare", "tr-a1"], ["prepare", "tr-a1", "a".repeat(40), "x"], ["solo", "tr-a1"],
			["solo", "tr-a1", "./a.test.ts", "./b.test.ts"], ["cleanup", "tr-a1"], ["cleanup", "tr-a1", "tr-b", "tr-c"], ["probe", "tr-a1"], ["bogus", "tr-a1"]]) {
			const r = raw(b, args);
			expect({ args, exit: r.exit }).toEqual({ args, exit: WRAPPER_EXIT.refused });
		}
	});

	test("prepare refuses a sha that is not 40 hex", () => {
		const r = raw(b, ["prepare", "tr-a1", "abc123"]);
		expect(r.exit).toBe(WRAPPER_EXIT.refused);
		expect(r.stderr).toContain("not a full sha");
	});

	test("without the wrapper's config test-exec refuses", () => {
		const r = Bun.spawnSync([BUN, SCRIPT, "full", "tr-a1"], { env: { PATH: SYS_PATH }, stderr: "pipe" });
		expect(r.exitCode).toBe(WRAPPER_EXIT.refused);
	});
});

describe("fencing on <stage>/current", () => {
	test("every subcommand is refused when current names another run", () => {
		const b = box("fence");
		const sha = prepared(b, "tr-mine", { "a.test.ts": OK_TEST });
		setCurrent(b, "tr-other");
		const calls: WrapperCall[] = [
			{ sub: "prepare", runId: "tr-mine", sha }, { sub: "full", runId: "tr-mine" }, { sub: "solo", runId: "tr-mine", file: "./a.test.ts" },
			{ sub: "sweep", runId: "tr-mine" }, { sub: "cleanup", runId: "tr-mine", oldRunId: "tr-old" }, { sub: "probe", runId: "tr-mine", paths: ["/tmp"] },
		];
		for (const c of calls) {
			const r = call(b, c);
			expect({ sub: c.sub, exit: r.exit }).toEqual({ sub: c.sub, exit: WRAPPER_EXIT.fenced });
			expect(r.stderr).toContain("fenced");
		}
		rmSync(join(b.root, "stage", "current"));
		expect(call(b, { sub: "full", runId: "tr-mine" }).exit).toBe(WRAPPER_EXIT.fenced);
	});
});

// ---- prepare, full, solo -------------------------------------------------------------------------------------

describe("prepare, full and solo", () => {
	test("prepare clones the bundle detached at the sha, removes origin, and leaves everything readable", () => {
		const b = box("prepare");
		const sha = prepared(b, "tr-p1", { "a.test.ts": OK_TEST, "dir/b.ts": "export const b = 1;\n" });
		const repo = join(workOf(b, "tr-p1"), "repo");
		expect(git(repo, "rev-parse", "HEAD")).toBe(sha);
		expect(git(repo, "remote")).toBe("");
		expect(lstatSync(join(repo, "dir", "b.ts")).mode & 0o777).toBe(0o644);
		expect(lstatSync(join(repo, "dir")).mode & 0o777).toBe(0o755);
		expect(readFileSync(join(workOf(b, "tr-p1"), "shim", "git"), "utf8")).toContain("credential.helper=");
		// A second prepare of the same run is refused: the work dir is fresh or nothing.
		expect(call(b, { sub: "prepare", runId: "tr-p1", sha }).exit).toBe(WRAPPER_EXIT.refused);
	});

	test("full writes full.xml and full.log and passes bun's exit through; solo claims solo-1, then solo-2", () => {
		const b = box("full");
		prepared(b, "tr-f1", { "a.test.ts": OK_TEST, "b_spec.ts": `import { expect, test } from "bun:test";\ntest("bad", () => { expect(1).toBe(2); });\n` });
		const full = call(b, { sub: "full", runId: "tr-f1" });
		expect(full.exit).toBe(1);
		const work = workOf(b, "tr-f1");
		expect(readFileSync(join(work, "full.xml"), "utf8")).toContain("<testsuites");
		expect(readFileSync(join(work, "full.log"), "utf8")).toContain("bad");
		const s1 = call(b, { sub: "solo", runId: "tr-f1", file: "./a.test.ts" });
		expect(s1.exit).toBe(0);
		expect(s1.stdout).toStartWith("part solo-1\n");
		const s2 = call(b, { sub: "solo", runId: "tr-f1", file: "./b_spec.ts" });
		expect(s2.exit).toBe(1);
		expect(s2.stdout).toStartWith("part solo-2\n");
		expect(readFileSync(join(work, "solo-1.xml"), "utf8")).toContain('name="ok"');
		expect(readFileSync(join(work, "solo-2.xml"), "utf8")).toContain('name="bad"');
	});

	test("solo ../x and a path outside runs/<id>, including through a symlink, are refused", () => {
		const b = box("paths");
		const outside = dir("outside");
		writeFileSync(join(outside, "evil.test.ts"), OK_TEST);
		prepared(b, "tr-s1", { "a.test.ts": OK_TEST });
		const repo = join(workOf(b, "tr-s1"), "repo");
		symlinkSync(join(outside, "evil.test.ts"), join(repo, "link.test.ts"));
		symlinkSync(outside, join(repo, "out"));
		for (const file of ["../x.test.ts", "./../x.test.ts", "./a/../../x.test.ts", "/etc/x.test.ts", "a.test.ts", "./link.test.ts", "./out/evil.test.ts", "./a.ts"]) {
			const r = raw(b, ["solo", "tr-s1", file]);
			expect({ file, exit: r.exit }).toEqual({ file, exit: WRAPPER_EXIT.refused });
		}
		expect(existsSync(join(workOf(b, "tr-s1"), "solo-1.log"))).toBe(false);

		// runs/<id> itself swapped for a symlink to elsewhere: every part is refused.
		const b2 = box("paths2");
		const sha = stageRepo(b2, "tr-s2", { "a.test.ts": OK_TEST });
		setCurrent(b2, "tr-s2");
		mkdirSync(join(outside, "w"));
		symlinkSync(join(outside, "w"), workOf(b2, "tr-s2"));
		expect(call(b2, { sub: "prepare", runId: "tr-s2", sha }).exit).toBe(WRAPPER_EXIT.refused);
		expect(call(b2, { sub: "full", runId: "tr-s2" }).exit).toBe(WRAPPER_EXIT.refused);
		expect(call(b2, { sub: "solo", runId: "tr-s2", file: "./a.test.ts" }).exit).toBe(WRAPPER_EXIT.refused);
		expect(readdirSync(join(outside, "w"))).toEqual([]);
	});

	test("the child env holds only the allowlist and the throwaway home", () => {
		const b = box("env");
		prepared(b, "tr-e1", { "env.test.ts": ENV_TEST });
		expect(call(b, { sub: "full", runId: "tr-e1" }).exit).toBe(0);
		const work = workOf(b, "tr-e1");
		const env = JSON.parse(readFileSync(join(work, "env.json"), "utf8")) as Record<string, string>;
		// The wrapper fixes PATH, LANG, TERM and SHELL, and takes USER and LOGNAME from `id -un`, never from the caller.
		const me = userInfo().username;
		const expected = childEnv({ PATH: SYS_PATH, LANG: "en_US.UTF-8", USER: me, LOGNAME: me, SHELL: "/bin/sh", TERM: "dumb" }, work);
		// bun test sets NODE_ENV for its own tests; everything else is ours.
		expect(Object.keys(env).filter((k) => !(k in expected)).sort()).toEqual(Object.keys(env).filter((k) => k === "NODE_ENV"));
		for (const k of ["GH_TOKEN", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "MOONSHOT_API_KEY", "SSH_AUTH_SOCK", "OMP_TOKEN", "AGENT_SYSTEM_TEST_RUNS"]) expect(env[k]).toBeUndefined();
		for (const k of CHILD_ENV_ALLOWLIST) expect(env[k]).toBe(expected[k]!);
		expect(env.PATH).toBe(expected.PATH);
		expect(env.HOME).toBe(join(work, "home"));
		expect(env.AGENT_SYSTEM_LEDGER_DB).toBe(join(work, "home", ".agent-system-2", "ledger.db"));
		expect(env.GIT_CONFIG_NOSYSTEM).toBe("1");
	});

	test("the cap kills the part's whole group and exits timeout", async () => {
		const b = box("cap");
		prepared(b, "tr-c1", { "slow.test.ts": SLOW_TEST }, { fullCapMin: 0.04, soloCapMin: 0.04 });
		const t0 = Date.now();
		const r = call(b, { sub: "full", runId: "tr-c1" });
		expect(r.exit).toBe(WRAPPER_EXIT.timeout);
		expect(r.stderr).toContain("timeout");
		expect(Date.now() - t0).toBeLessThan(15_000);
		const pid = Number(readFileSync(join(workOf(b, "tr-c1"), "slow.pid"), "utf8"));
		pids.push(pid);
		expect(await until(() => !alive(pid), 3_000)).toBe(true);
	}, 30_000);

	test("full and solo refuse without the runner's caps file", () => {
		const b = box("caps");
		prepared(b, "tr-k1", { "a.test.ts": OK_TEST });
		rmSync(join(b.root, "stage", "tr-k1", "caps.json"));
		expect(call(b, { sub: "full", runId: "tr-k1" }).exit).toBe(WRAPPER_EXIT.refused);
		expect(call(b, { sub: "solo", runId: "tr-k1", file: "./a.test.ts" }).exit).toBe(WRAPPER_EXIT.refused);
	});
});

// ---- sweep --------------------------------------------------------------------------------------------------

describe("sweep", () => {
	test("a groups sweep kills a detached grandchild of its own part and leaves a sibling fixture's process alive", async () => {
		const b = box("sweep");
		prepared(b, "tr-w1", { "orphan.test.ts": ORPHAN_TEST });
		expect(call(b, { sub: "full", runId: "tr-w1" }).exit).toBe(0);
		const orphan = Number(readFileSync(join(workOf(b, "tr-w1"), "orphan.pid"), "utf8"));
		pids.push(orphan);
		expect(alive(orphan)).toBe(true);
		const sibling = Bun.spawn(["/bin/sleep", "300"]);
		pids.push(sibling.pid);
		const r = call(b, { sub: "sweep", runId: "tr-w1" });
		expect(r.stderr).toBe("");
		expect(r.exit).toBe(WRAPPER_EXIT.ok);
		expect(await until(() => !alive(orphan), 3_000)).toBe(true);
		expect(alive(sibling.pid)).toBe(true);
		sibling.kill("SIGKILL");
	}, 30_000);

	test("a sweep before prepare (no work dir yet) is a no-op", () => {
		const b = box("sweep0");
		setCurrent(b, "tr-z1");
		expect(call(b, { sub: "sweep", runId: "tr-z1" }).exit).toBe(WRAPPER_EXIT.ok);
	});

	test("a second sweep waits on sweep.db while the first holds it, with locks/ read-only, and gets it once the first is SIGKILLed", async () => {
		const b = box("lock");
		setCurrent(b, "tr-l1");
		chmodSync(join(b.root, "locks"), 0o555);
		writeFileSync(join(b.hooks, "tr-l1.sweep-read1.pause"), "");
		const first = spawnCall(b, { sub: "sweep", runId: "tr-l1" });
		expect(await until(() => existsSync(join(b.hooks, "tr-l1.sweep-read1.reached")), 10_000)).toBe(true);
		rmSync(join(b.hooks, "tr-l1.sweep-read1.pause"));
		const second = spawnCall(b, { sub: "sweep", runId: "tr-l1" });
		// A real delay: the claim is that the second sweep is still blocked on the lock after it.
		await Bun.sleep(1_500);
		expect(second.exitCode).toBeNull();
		first.kill("SIGKILL");
		expect(await first.exited).not.toBe(0);
		const t0 = Date.now();
		expect(await second.exited).toBe(WRAPPER_EXIT.ok);
		expect(Date.now() - t0).toBeLessThan(3_000);
		expect(readdirSync(join(b.root, "locks"))).toEqual(["sweep.db"]);
	}, 30_000);

	test("a sweep that waits past its limit ends `error sweep lock held`", async () => {
		const b = box("held");
		const quick = wrapperFor(b, "exec-quick", { sweepLockWaitMs: 1_000 });
		setCurrent(b, "tr-h1");
		writeFileSync(join(b.hooks, "tr-h1.sweep-read1.pause"), "");
		const holder = spawnCall(b, { sub: "sweep", runId: "tr-h1" });
		expect(await until(() => existsSync(join(b.hooks, "tr-h1.sweep-read1.reached")), 10_000)).toBe(true);
		rmSync(join(b.hooks, "tr-h1.sweep-read1.pause"));
		const t0 = Date.now();
		const waiter = spawnCall(b, { sub: "sweep", runId: "tr-h1" }, quick);
		expect(await waiter.exited).toBe(WRAPPER_EXIT.sweepLockHeld);
		expect(await new Response(waiter.stderr).text()).toContain("error sweep lock held");
		expect(Date.now() - t0).toBeGreaterThanOrEqual(1_000);
		holder.kill("SIGKILL");
		await holder.exited;
	}, 30_000);

	test("a sweep whose current changed during the grace aborts before SIGKILL", async () => {
		const b = box("abort");
		prepared(b, "tr-g1", { "stubborn.test.ts": STUBBORN_TEST });
		expect(call(b, { sub: "full", runId: "tr-g1" }).exit).toBe(0);
		const orphan = Number(readFileSync(join(workOf(b, "tr-g1"), "orphan.pid"), "utf8"));
		pids.push(orphan);
		writeFileSync(join(b.hooks, "tr-g1.sweep-read1.pause"), "");
		const sweep = spawnCall(b, { sub: "sweep", runId: "tr-g1" });
		expect(await until(() => existsSync(join(b.hooks, "tr-g1.sweep-read1.reached")), 10_000)).toBe(true);
		setCurrent(b, "tr-g2");
		writeFileSync(join(b.hooks, "tr-g1.sweep-read1.go"), "");
		expect(await sweep.exited).toBe(WRAPPER_EXIT.fenced);
		expect(await new Response(sweep.stderr).text()).toContain("aborted before SIGKILL");
		expect(alive(orphan)).toBe(true);
		process.kill(orphan, "SIGKILL");
	}, 30_000);

	test("the rendered uid wrapper names pkill -U _as2test and no argv-supplied target; test-only options are refused for it", () => {
		const text = renderExecWrapper({ root: "/Users/Shared/as2test", bun: "/usr/local/libexec/as2test/bun", script: "/usr/local/libexec/as2test/test-exec.js", sweepScope: "uid" });
		expect(UID_SWEEP).toBe("/usr/bin/pkill -U _as2test");
		expect(text).toContain("pkill -U _as2test");
		expect(text).not.toContain('"sweep":"groups"');
		// argv reaches only the final exec, after the fixed bun and script; nothing else expands $1..$9 into a command.
		const execLine = text.split("\n").findIndex((l) => l.startsWith("exec /usr/bin/env -i"));
		const argvUses = text.split("\n").flatMap((l, i) => (/"\$@"/.test(l) ? [i] : []));
		expect(argvUses).toEqual([execLine + 2]);
		expect(text).toContain(`'/usr/local/libexec/as2test/bun' '/usr/local/libexec/as2test/test-exec.js' "$@"`);
		for (const extra of [{ hooks: "/tmp/h" }, { killGraceMs: 1 }, { sweepLockWaitMs: 1 }]) {
			expect(() => renderExecWrapper({ root: "/r", bun: "/b", script: "/s", sweepScope: "uid", ...extra })).toThrow(WrapperRenderError);
		}
		expect(() => renderExecWrapper({ root: "r", bun: "/b", script: "/s", sweepScope: "uid" })).toThrow(WrapperRenderError);
		expect(() => renderExecWrapper({ root: "/r", bun: "/b", script: "/s", sweepScope: "all" as SweepScope })).toThrow(WrapperRenderError);
		expect(execConfigOf({ root: "/r", bun: "/b", script: "/s", sweepScope: "uid" })).toMatchObject({ killGraceMs: 10_000, sweepLockWaitMs: 60_000, hooks: null });
	});
});

// ---- cleanup -------------------------------------------------------------------------------------------------

describe("cleanup", () => {
	test("refuses its own run id, a malformed old id and a symlinked old run dir, and deletes nothing else", () => {
		const b = box("cleanup");
		setCurrent(b, "tr-n1");
		const runs = join(b.root, "runs");
		const outside = dir("cleanup-outside");
		writeFileSync(join(outside, "keep"), "x");
		mkdirSync(join(runs, "tr-n1"));
		mkdirSync(join(runs, "tr-sib"));
		writeFileSync(join(runs, "tr-sib", "keep"), "x");
		symlinkSync(outside, join(runs, "tr-link"));
		expect(call(b, { sub: "cleanup", runId: "tr-n1", oldRunId: "tr-other" }).exit).toBe(WRAPPER_EXIT.ok);
		expect(raw(b, ["cleanup", "tr-n1", "tr-n1"]).exit).toBe(WRAPPER_EXIT.refused);
		for (const bad of ["../tr-sib", "tr-SIB", "x", "tr-sib/keep"]) expect(raw(b, ["cleanup", "tr-n1", bad]).exit).toBe(WRAPPER_EXIT.refused);
		expect(raw(b, ["cleanup", "tr-n1", "tr-link"]).exit).toBe(WRAPPER_EXIT.refused);
		expect(readFileSync(join(outside, "keep"), "utf8")).toBe("x");

		// A real old run dir goes, read-only subdirs and a symlink inside it included; its target and siblings stay.
		mkdirSync(join(runs, "tr-old", "repo", "ro"), { recursive: true });
		writeFileSync(join(runs, "tr-old", "repo", "ro", "f"), "x");
		symlinkSync(outside, join(runs, "tr-old", "repo", "out"));
		chmodSync(join(runs, "tr-old", "repo", "ro"), 0o555);
		const r = call(b, { sub: "cleanup", runId: "tr-n1", oldRunId: "tr-old" });
		expect(r.exit).toBe(WRAPPER_EXIT.ok);
		expect(readdirSync(runs).sort()).toEqual(["tr-link", "tr-n1", "tr-sib"]);
		expect(readFileSync(join(outside, "keep"), "utf8")).toBe("x");
		expect(readFileSync(join(runs, "tr-sib", "keep"), "utf8")).toBe("x");
	});
});

// ---- the preflight --------------------------------------------------------------------------------------------

describe("preflight: the probe", () => {
	/** A home, ledger, runs root, checkout and lanes root this user cannot reach, then one thing opened up. */
	function sealed(tag: string) {
		const b = box(tag);
		setCurrent(b, "tr-q1");
		const base = dir(`${tag}-paths`);
		const home = join(base, "home");
		const ledgerDir = join(base, "ledger");
		const runsRoot = join(base, "runs");
		const main = join(base, "main");
		const lanes = join(base, "lanes");
		for (const d of [home, ledgerDir, runsRoot, main, lanes]) mkdirSync(d);
		const env = { HOME: home, AGENT_SYSTEM_LEDGER_DB: join(ledgerDir, "ledger.db") };
		chmodSync(join(b.root, "stage", "current"), 0o444);
		const seal = () => {
			for (const d of [home, main, lanes]) chmodSync(d, 0o555);
			for (const d of [ledgerDir, runsRoot]) chmodSync(d, 0o000);
		};
		const run = () => {
			const items = preflightProbes({ env, runsRoot, mainCheckout: main, lanesRoot: lanes, root: b.root });
			const r = call(b, probeCall("tr-q1", items));
			return probeDecision(items, r.exit, r.stdout);
		};
		return { b, home, ledgerDir, runsRoot, seal, run };
	}

	test("passes when nothing is reachable, and lists every credential path", () => {
		const s = sealed("probe-ok");
		s.seal();
		const v = s.run();
		expect(v).toMatchObject({ ok: true });
		const items = preflightProbes({ env: { HOME: "/h" }, runsRoot: "/r", mainCheckout: "/m", lanesRoot: "/l" });
		for (const p of CREDENTIAL_PATHS) expect(items).toContainEqual({ path: join("/h", p), forbid: "any", why: "credential" });
		expect(items.find((i) => i.path === "/h/.agent-system-2")).toMatchObject({ forbid: "any" });
		expect(items.map((i) => i.path)).toEqual(expect.arrayContaining(["/h/.agent-system-2/ledger.db-wal", "/h/.agent-system-2/ledger.db-shm", "/r", "/r/runs.db", "/Users/Shared/as2test/stage/current", "/h", "/m", "/l"]));
	});

	test("refuses a readable .ssh", () => {
		const s = sealed("probe-ssh");
		mkdirSync(join(s.home, ".ssh"));
		s.seal();
		const v = s.run();
		expect(v.ok).toBe(false);
		expect(!v.ok && v.reason).toContain(`can read ${join(s.home, ".ssh")}`);
	});

	test("refuses a readable .codex/auth.json", () => {
		const s = sealed("probe-codex");
		mkdirSync(join(s.home, ".codex"));
		writeFileSync(join(s.home, ".codex", "auth.json"), "{}");
		s.seal();
		const v = s.run();
		expect(!v.ok && v.reason).toContain(`can read ${join(s.home, ".codex", "auth.json")}`);
	});

	test("refuses a writable ledger dir at an overridden AGENT_SYSTEM_LEDGER_DB", () => {
		const s = sealed("probe-ledger");
		s.seal();
		chmodSync(s.ledgerDir, 0o755);
		const v = s.run();
		expect(!v.ok && v.reason).toContain(`can write ${s.ledgerDir} (ledger directory)`);
	});

	test("refuses a writable runs root", () => {
		const s = sealed("probe-runs");
		s.seal();
		chmodSync(s.runsRoot, 0o755);
		const v = s.run();
		expect(!v.ok && v.reason).toContain(`can write ${s.runsRoot} (runs root)`);
	});

	test("refuses a probe that did not answer, or answered for too few paths", () => {
		const items = preflightProbes({ env: { HOME: "/h" }, runsRoot: "/r", mainCheckout: "/m", lanesRoot: "/l" });
		expect(probeDecision(items, WRAPPER_EXIT.fenced, "")).toMatchObject({ ok: false });
		expect(probeDecision(items, 0, '{"path":"/h","read":false,"write":false}\n')).toMatchObject({ ok: false });
		expect(probeDecision(items, 0, "garbage\n")).toMatchObject({ ok: false });
	});
});

describe("preflight: the install", () => {
	const me = { uid: process.getuid!(), gid: process.getgid!() };
	const ids = { root: me.uid, wheel: me.gid, jo: me.uid };
	const sha = (s: string) => new Bun.CryptoHasher("sha256").update(s).digest("hex");

	/** A tmp install laid out as setup leaves it, every owner the current user. */
	function install(tag: string) {
		const base = dir(tag);
		const libexec = join(base, "libexec");
		const root = join(base, "root");
		const sudoers = join(base, "sudoers.d", "as2test");
		mkdirSync(libexec);
		mkdirSync(join(base, "sudoers.d"));
		for (const d of ["stage", "runs", "locks"]) mkdirSync(join(root, d), { recursive: true });
		const files = { exec: "#!/bin/sh\n", bun: "bun", "test-exec.js": "js" };
		for (const [f, t] of Object.entries(files)) writeFileSync(join(libexec, f), t);
		writeFileSync(join(root, "locks", "sweep.db"), "");
		writeFileSync(sudoers, "x");
		const input = readFileSync(SCRIPT, "utf8");
		writeFileSync(join(libexec, "SOURCE"), [
			"# test", "version 1", `source ${REPO}`, `source-sha ${"a".repeat(40)}`, "bun-version 1.3.14", `user ${AS2TEST_USER}`, `uid ${me.uid}`, `gid ${me.gid}`, "jo me",
			`jo-uid ${me.uid}`, "created user", "created group", ...Object.entries(files).map(([f, t]) => `file ${f} ${sha(t)}`), `input surface/scripts/test-exec.ts ${sha(input)}`, "",
		].join("\n"));
		for (const l of installLayout({ libexec, root, sudoers })) chmodSync(l.path, l.mode);
		const dscl = (account: { uid: number; gid: number } | null) => (record: string, key: string) =>
			account === null ? null : record.startsWith("/Users/") ? (key === "UniqueID" ? account.uid : account.gid) : account.gid;
		const read = (account: { uid: number; gid: number } | null = me) => readInstall({ checkout: REPO, libexec, root, sudoers, dscl: dscl(account) });
		return { libexec, root, sudoers, read };
	}

	test("passes on an install as setup left it", () => {
		const i = install("inst-ok");
		const v = installDecision(i.read(), ids);
		expect(v).toMatchObject({ ok: true });
		expect(preflightDecision(v, { ok: true, summary: "probe" })).toMatchObject({ ok: true });
	});

	test("refuses a missing account", () => {
		const i = install("inst-acct");
		const v = installDecision(i.read(null), ids);
		expect(!v.ok && v.reason).toContain("account is missing");
		expect(preflightDecision(v, { ok: true, summary: "probe" })).toMatchObject({ ok: false });
	});

	test("refuses a hash mismatch, of an installed file or of a bundle input in the checkout", () => {
		const i = install("inst-hash");
		chmodSync(join(i.libexec, "test-exec.js"), 0o644);
		writeFileSync(join(i.libexec, "test-exec.js"), "tampered");
		chmodSync(join(i.libexec, "test-exec.js"), 0o755);
		const v = installDecision(i.read(), ids);
		expect(!v.ok && v.reason).toContain("installed test-exec.js does not match its sha-256 in SOURCE; re-run install/as2test-setup.sh");

		const j = install("inst-input");
		const src = readFileSync(join(j.libexec, "SOURCE"), "utf8").replace(/^input (\S+) [0-9a-f]+$/m, `input $1 ${"0".repeat(64)}`);
		writeFileSync(join(j.libexec, "SOURCE"), src);
		const w = installDecision(j.read(), ids);
		expect(!w.ok && w.reason).toContain("surface/scripts/test-exec.ts in this checkout differs from the installed test-exec bundle");
	});

	test("refuses a mode mismatch, and an owner mismatch", () => {
		const i = install("inst-mode");
		chmodSync(join(i.root, "locks", "sweep.db"), 0o644);
		const v = installDecision(i.read(), ids);
		expect(!v.ok && v.reason).toContain("has mode 644, expected 600");
		const j = install("inst-mode2");
		chmodSync(join(j.libexec, "exec"), 0o775);
		expect(installDecision(j.read(), ids)).toMatchObject({ ok: false });
		const k = install("inst-owner");
		expect(installDecision(k.read(), { ...ids, root: 0 })).toMatchObject({ ok: false });
	});

	test("SOURCE parses strictly", () => {
		expect(parseSource("version 1\n")).toMatchObject({ ok: false });
		expect(parseSource("version 2\n")).toMatchObject({ ok: false });
		expect(parseSource("version 1\nbogus x\n")).toMatchObject({ ok: false });
		expect(parseSource("version 1\ncreated relative/path\n")).toMatchObject({ ok: false });
	});
});

// ---- the bundle ----------------------------------------------------------------------------------------------

describe("the installed form", () => {
	test("test-exec bundles into one file with bun build --target=bun, and the bundle runs behind the wrapper", () => {
		const out = dir("bundle");
		const r = Bun.spawnSync([BUN, "build", "--target=bun", `--outfile=${join(out, "test-exec.js")}`, `--metafile=${join(out, "meta.json")}`, "surface/scripts/test-exec.ts"], {
			cwd: REPO, stdout: "pipe", stderr: "pipe",
		});
		expect(r.exitCode).toBe(0);
		const inputs = Bun.spawnSync([BUN, "surface/src/as2test.ts", "bundle-inputs", join(out, "meta.json"), REPO], { cwd: REPO, stdout: "pipe", stderr: "pipe" });
		expect(inputs.exitCode).toBe(0);
		const list = inputs.stdout.toString().trim().split("\n");
		expect(list).toContain("surface/scripts/test-exec.ts");
		expect(list).toContain("surface/src/test-run.ts");
		const b = box("bundled", { script: join(out, "test-exec.js") });
		setCurrent(b, "tr-b1");
		const p = call(b, { sub: "probe", runId: "tr-b1", paths: [join(out, "nope")] });
		expect(p.exit).toBe(WRAPPER_EXIT.probeReachable);
		expect(JSON.parse(p.stdout.trim())).toEqual({ path: join(out, "nope"), read: false, write: true });
	});
});

// ---- setup -----------------------------------------------------------------------------------------------------

describe("install/as2test-setup.sh", () => {
	/** A prefix, fake dscl/visudo/sudo on PATH, and a log of every fake sudo call. */
	function rig(tag: string, o: { userUid?: number; groupGid?: number; visudoCf?: number } = {}) {
		const base = dir(tag);
		const prefix = join(base, "prefix");
		const bin = join(base, "bin");
		mkdirSync(prefix);
		mkdirSync(bin);
		const log = join(base, "sudo.log");
		writeFileSync(join(bin, "sudo"), `#!/bin/sh\necho "$*" >> '${log}'\nexec "$@"\n`, { mode: 0o755 });
		writeFileSync(join(bin, "dscl"), `#!/bin/sh
case "$*" in
". -read /Users/_as2test UniqueID") ${o.userUid ? `echo "UniqueID: ${o.userUid}"` : "exit 56"} ;;
". -read /Groups/_as2test PrimaryGroupID") ${o.groupGid ? `echo "PrimaryGroupID: ${o.groupGid}"` : "exit 56"} ;;
". -list /Users UniqueID") printf 'root 0\\n_www 70\\n_taken 600\\njo 501\\n' ;;
". -list /Groups PrimaryGroupID") printf 'wheel 0\\nstaff 20\\n_gtaken 601\\n' ;;
*) echo "fake dscl: unexpected $*" >&2; exit 1 ;;
esac
`, { mode: 0o755 });
		writeFileSync(join(bin, "visudo"), `#!/bin/sh\ncase "$1" in -c) echo "/etc/sudoers: parsed OK" ;; -cf) exit ${o.visudoCf ?? 0} ;; esac\n`, { mode: 0o755 });
		mkdirSync(join(prefix, "etc", "sudoers.d"), { recursive: true });
		writeFileSync(join(prefix, "etc", "sudoers"), "root ALL = (ALL) ALL\n#includedir /private/etc/sudoers.d\n");
		const run = (args: string[], stdin = "", env: Record<string, string> = {}) => {
			const r = Bun.spawnSync(["bash", SETUP, ...args], {
				env: { PATH: `${bin}:${join(BUN, "..")}:${SYS_PATH}`, HOME: base, TMPDIR: base, AS2TEST_SETUP_TEST_PREFIX: prefix, ...env },
				stdin: new TextEncoder().encode(stdin), stdout: "pipe", stderr: "pipe",
			});
			return { exit: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
		};
		const tree = (): string[] => {
			const out: string[] = [];
			const walk = (p: string) => {
				for (const n of readdirSync(p)) {
					out.push(join(p, n));
					if (lstatSync(join(p, n)).isDirectory()) walk(join(p, n));
				}
			};
			walk(prefix);
			return out.sort();
		};
		const sudoCalls = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
		return { prefix, run, tree, sudoCalls };
	}

	test("--dry-run prints the dscl and sudoers plan with a free id >= 600 and changes nothing", () => {
		const r = rig("setup-dry");
		const before = r.tree();
		const out = r.run(["--dry-run"]);
		expect(out.stderr).toBe("");
		expect(out.exit).toBe(0);
		// 600 is a taken uid and 601 a taken gid: the first id free as both is 602.
		expect(out.stdout).toContain("sudo dscl . -create /Groups/_as2test PrimaryGroupID 602");
		expect(out.stdout).toContain("sudo dscl . -create /Users/_as2test UniqueID 602");
		expect(out.stdout).toContain("sudo dscl . -create /Users/_as2test UserShell /usr/bin/false");
		expect(out.stdout).toContain("sudo dscl . -create /Users/_as2test NFSHomeDirectory /var/empty");
		expect(out.stdout).toContain("sudo dscl . -create /Users/_as2test IsHidden 1");
		const me = Bun.spawnSync(["id", "-un"]).stdout.toString().trim();
		expect(out.stdout).toContain(`${join(r.prefix, "etc", "sudoers.d", "as2test")} (root:wheel 0440): ${me} ALL=(_as2test) NOPASSWD: ${join(r.prefix, "usr", "local", "libexec", "as2test", "exec")}`);
		expect(out.stdout).toContain("dry run: nothing changed");
		expect(r.tree()).toEqual(before);
		expect(r.sudoCalls()).toBe("");
	}, 30_000);

	test("refuses an existing _as2test user or group that SOURCE does not record", () => {
		const u = rig("setup-user", { userUid: 777 });
		const out = u.run(["--dry-run"]);
		expect(out.exit).toBe(1);
		expect(out.stderr).toContain("a user _as2test (uid 777) exists that setup did not record");
		const g = rig("setup-group", { groupGid: 778 });
		expect(g.run([]).stderr).toContain("a group _as2test (gid 778) exists that setup did not record");
		expect(g.sudoCalls()).toBe("");
	}, 30_000);

	test("a visudo check failure aborts before anything is created or moved", () => {
		const r = rig("setup-visudo", { visudoCf: 1 });
		const before = r.tree();
		const out = r.run([], "y\n");
		expect(out.exit).toBe(1);
		expect(out.stderr).toContain("visudo -cf rejects the drop-in; nothing changed");
		expect(r.tree()).toEqual(before);
		// The only privileged calls were the checks; no dscl, install or mv ran.
		expect(r.sudoCalls().trim().split("\n").map((l) => l.split(" ")[0])).toEqual(["visudo", "grep", "visudo"]);
	}, 30_000);

	test("--undo refuses while a run holds the runs lock, and plans only what SOURCE recorded once it is free", () => {
		const r = rig("setup-undo");
		const libexec = join(r.prefix, "usr", "local", "libexec", "as2test");
		mkdirSync(libexec, { recursive: true });
		writeFileSync(join(libexec, "SOURCE"), `version 1\nuid 602\ngid 602\ncreated user\ncreated ${libexec}\n`);
		const runs = join(r.prefix, "..", "runs");
		mkdirSync(runs);
		const db = new Database(join(runs, "runs.db"));
		db.run("CREATE TABLE lock (id INTEGER PRIMARY KEY CHECK (id = 1), runId TEXT NOT NULL, pid INTEGER NOT NULL, pgid INTEGER NOT NULL, runDir TEXT NOT NULL, heartbeatAt INTEGER NOT NULL)");
		db.query("INSERT INTO lock VALUES (1, 'tr-live', 1, 1, '/x', ?)").run(Date.now());
		const env = { AGENT_SYSTEM_TEST_RUNS: runs };
		const held = r.run(["--undo"], "y\n", env);
		expect(held.exit).toBe(1);
		expect(held.stderr).toContain("run tr-live holds the runs lock");
		expect(r.sudoCalls()).toBe("");
		expect(existsSync(libexec)).toBe(true);

		db.query("UPDATE lock SET heartbeatAt = ?").run(Date.now() - 120_000);
		db.close();
		const free = r.run(["--undo", "--dry-run"], "", env);
		expect(free.exit).toBe(0);
		expect(free.stdout).toContain(`sudo rm -rf ${libexec}`);
		expect(free.stdout).toContain("sudo dscl . -delete /Users/_as2test");
		expect(free.stdout).not.toContain("/Groups/_as2test");
		expect(free.stdout).not.toContain("sudoers.d");
		expect(r.sudoCalls()).toBe("");
	}, 30_000);

	test("--help says a corrupt sweep.db is repaired by re-running setup", () => {
		const r = rig("setup-help");
		const out = r.run(["--help"]);
		expect(out.exit).toBe(0);
		expect(out.stdout).toContain("repairs a corrupt or missing locks/sweep.db");
	});
});
