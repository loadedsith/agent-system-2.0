// The shell facts the certified shell start rests on (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7
// § 1.4, § 1.7, § 2.5; contract C3-C5), made permanent so a macOS or OMP update that moves one fails
// here, before a rule relies on it. Each /bin/bash and /bin/sh case runs argv with an explicit env
// (nothing inherited), so no shell text names a hook. The brush cases drive OMP's embedded Shell
// (pi-natives) in a child bun with synthetic AS2_PRB* names only; they skip where OMP is not installed.
// When a case here fails: re-measure, then update gates/src/shell-start.ts (SHELL_START_HOOK_NAMES,
// MEASURED_HOST) and the plan's contract before changing the expectation.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmp } from "./helpers";

const P = "/usr/bin:/bin";
const FN = "() {  echo FN_IMPORTED; }";

/** The command's stdout and stderr, whitespace runs collapsed. */
function run(argv: string[], extra: Record<string, string> = {}): string {
	const r = Bun.spawnSync(argv, { env: { PATH: P, ...extra }, stdout: "pipe", stderr: "pipe" });
	return `${r.stdout.toString()}${r.stderr.toString()}`.replace(/\s+/g, " ").trim();
}
const bash = (c: string, extra?: Record<string, string>): string => run(["/bin/bash", "-c", c], extra);
const sh = (c: string, extra?: Record<string, string>): string => run(["/bin/sh", "-c", c], extra);

describe("/bin/bash -c and /bin/sh -c at start (PLAN.md § 1.4; contract C3)", () => {
	const d = tmp("shell-start-bash");
	const home = join(d, "home");
	mkdirSync(home, { recursive: true });
	const benv = join(d, "benv.sh");
	const envf = join(d, "envf.sh");
	writeFileSync(benv, "echo BASH_ENV_FILE_READ\n");
	writeFileSync(envf, "echo ENV_FILE_READ\n");
	for (const f of [".profile", ".bashrc", ".bash_profile", ".bash_login"]) writeFileSync(join(home, f), `echo RC_READ_${f}\n`);

	test("/bin/bash is 3.2.57 and /bin/sh is bash", () => {
		expect(bash('echo "$BASH_VERSION"')).toStartWith("3.2.57");
		expect(sh('echo "$BASH_VERSION"')).toStartWith("3.2.57");
	});

	test("bash -c reads BASH_ENV, not ENV; sh -c reads neither; BASH_ENV reaches a bash -c nested under sh -c", () => {
		expect(bash("echo body", { BASH_ENV: benv })).toBe("BASH_ENV_FILE_READ body");
		expect(bash("echo body", { ENV: envf })).toBe("body");
		expect(sh("echo body", { BASH_ENV: benv })).toBe("body");
		expect(sh("echo body", { ENV: envf })).toBe("body");
		expect(sh('/bin/bash -c "echo body"', { BASH_ENV: benv })).toBe("BASH_ENV_FILE_READ body");
	});

	test("a function is imported from the BASH_FUNC_<f>%% form only, by bash -c and sh -c", () => {
		expect(bash("f 2>/dev/null || echo no-f", { "BASH_FUNC_f%%": FN })).toBe("FN_IMPORTED");
		expect(sh("f 2>/dev/null || echo no-f", { "BASH_FUNC_f%%": FN })).toBe("FN_IMPORTED");
		expect(bash("f 2>/dev/null || echo no-f", { f: FN })).toBe("no-f");
		expect(bash("f 2>/dev/null || echo no-f", { "__BASH_FUNC<f>()": FN })).toBe("no-f");
	});

	test("an imported `trap` shadows bash -c's builtin; sh -c keeps the builtin", () => {
		const trapFn = { "BASH_FUNC_trap%%": "() {  echo FN; }" };
		expect(bash('trap -p; echo "argc=$# end"', trapFn)).toBe("FN argc=0 end");
		expect(sh('trap -p; echo "argc=$# end"', trapFn)).toBe("argc=0 end");
	});

	test("SHELLOPTS and POSIXLY_CORRECT are imported; BASHOPTS is not", () => {
		const allexport = { ["SHELLOPTS"]: "allexport" };
		expect(bash('x=1; env | grep -c "^x=1$"', allexport)).toBe("1");
		expect(sh('echo "$-"', allexport)).toContain("a");
		expect(bash("true", { ["SHELLOPTS"]: "xtrace", PS4: "+PS4HOOK " })).toBe("+PS4HOOK true");
		expect(bash("set -o | grep -w posix", { ["POSIXLY_CORRECT"]: "1" })).toBe("posix on");
		expect(bash("shopt extglob", { ["BASHOPTS"]: "extglob" })).toBe("extglob off");
	});

	test("CDPATH is honoured by cd", () => {
		expect(bash("cd / && cd tmp >/dev/null 2>&1; pwd", { CDPATH: "/private" })).toBe("/private/tmp");
	});

	test("a clean start: exported names PATH PWD SHLVL _, `$-` = hBc, posix off, no traps, `$#` = 0; sh -c runs posix on", () => {
		expect(bash('env | cut -d= -f1 | sort | tr "\\n" " "')).toBe("PATH PWD SHLVL _");
		expect(bash('echo "$-"')).toBe("hBc");
		expect(bash("set -o | grep -w posix")).toBe("posix off");
		expect(bash('trap -p; echo "argc=$# end"')).toBe("argc=0 end");
		expect(sh('trap -p; echo "argc=$# end"')).toBe("argc=0 end");
		expect(sh("set -o | grep -w posix")).toBe("posix on");
	});

	test("no rc file under HOME is read by bash -c or sh -c", () => {
		expect(bash("echo body", { HOME: home })).toBe("body");
		expect(sh("echo body", { HOME: home })).toBe("body");
	});
});

const NATIVE = "/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-natives/native/index.js";

/** Run `script` in a child bun with exactly `env`, returning its last stdout line parsed. */
async function child(script: string, env: Record<string, string>): Promise<Record<string, unknown>> {
	const proc = Bun.spawn([process.execPath, "-e", script], { env, stdout: "pipe", stderr: "pipe" });
	const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
	if ((await proc.exited) !== 0) throw new Error(`child exited ${proc.exitCode}: ${err.slice(0, 2000)}`);
	return JSON.parse(out.trim().split("\n").at(-1)!) as Record<string, unknown>;
}

/** Child-side helpers: the C environ through `_NSGetEnviron`, libc setenv, and a run's exported env. */
const PRELUDE = `
import { Shell } from ${JSON.stringify(NATIVE)};
import { CString, dlopen, ptr, read } from "bun:ffi";
const lib = dlopen("/usr/lib/libSystem.B.dylib", {
  _NSGetEnviron: { args: [], returns: "ptr" },
  setenv: { args: ["ptr", "ptr", "i32"], returns: "i32" },
});
const cstr = s => ptr(Buffer.from(s + "\\0"));
function environ() {
  const envp = read.ptr(lib.symbols._NSGetEnviron(), 0);
  const out = {};
  for (let i = 0; ; i++) { const p = read.ptr(envp, i * 8); if (!p) break; const s = new CString(p).toString(); out[s.slice(0, s.indexOf("="))] = s.slice(s.indexOf("=") + 1); }
  return out;
}
async function exported(shell, env) {
  let out = "";
  await shell.run({ command: "/bin/bash -c '/usr/bin/env -0'", env, cwd: "/tmp" }, (_e, c) => { out += c ?? ""; });
  // Output chunks can trail run() resolution; the native API exposes no flush signal.
  await Bun.sleep(100);
  const o = {};
  for (const e of out.split("\\0")) { if (!e) continue; const at = e.indexOf("="); o[e.slice(0, at)] = e.slice(at + 1); }
  return o;
}
const prb = o => Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith("AS2_PRB")).sort());
`;

describe.skipIf(!existsSync(NATIVE))("OMP's embedded brush Shell (PLAN.md § 1.7; contract C4)", () => {
	test("the child's env is the C environ, overlaid by sessionEnv, overlaid by the run env; Bun.env edits never reach it", async () => {
		const r = await child(
			`${PRELUDE}
delete Bun.env.AS2_PRB_DEL;
Bun.env.AS2_PRB_SET = "set-by-bun";
const shell = new Shell({ sessionEnv: { PATH: "/usr/bin:/bin", AS2_PRB_SESS: "sess", AS2_PRB_OVR: "sess" } });
const first = prb(await exported(shell, { AS2_PRB_CMD: "cmd", AS2_PRB_OVR2: "cmd" }));
const second = prb(await exported(shell, undefined));
console.log(JSON.stringify({ environ: prb(environ()), first, second }));`,
			{ PATH: P, HOME: "/tmp", AS2_PRB_LAUNCH: "launch", AS2_PRB_DEL: "launch-deleted", AS2_PRB_OVR: "launch", AS2_PRB_OVR2: "launch", "AS2_PRB-DASH": "launch-dash" },
		);
		const launch = { "AS2_PRB-DASH": "launch-dash", AS2_PRB_DEL: "launch-deleted", AS2_PRB_LAUNCH: "launch", AS2_PRB_OVR: "launch", AS2_PRB_OVR2: "launch" };
		expect(r.environ).toEqual(launch);
		expect(r.first).toEqual({ ...launch, AS2_PRB_OVR: "sess", AS2_PRB_SESS: "sess", AS2_PRB_CMD: "cmd", AS2_PRB_OVR2: "cmd" });
		expect(r.second).toEqual({ ...launch, AS2_PRB_OVR: "sess", AS2_PRB_SESS: "sess" });
	});

	test("the C environ is read when the Shell is constructed: a later setenv reaches only a new Shell", async () => {
		const r = await child(
			`${PRELUDE}
const shell = new Shell({ sessionEnv: { PATH: "/usr/bin:/bin" } });
const before = prb(await exported(shell));
lib.symbols.setenv(cstr("AS2_PRB_ADDED"), cstr("added"), 1);
const same = prb(await exported(shell));
const fresh = prb(await exported(new Shell({ sessionEnv: { PATH: "/usr/bin:/bin" } })));
console.log(JSON.stringify({ before, same, fresh }));`,
			{ PATH: P, HOME: "/tmp" },
		);
		expect(r).toEqual({ before: {}, same: {}, fresh: { AS2_PRB_ADDED: "added" } });
	});

	test("the Shell reads no rc file under HOME", async () => {
		const home = tmp("shell-start-brush-home");
		const rc = [".brushrc", ".brush_profile", ".bashrc", ".bash_profile", ".bash_login", ".profile", ".zshenv", ".config/brush/brushrc"];
		mkdirSync(join(home, ".config", "brush"), { recursive: true });
		for (const f of rc) writeFileSync(join(home, f), `: > '${home}/marker-${f.replaceAll("/", "_")}'\n`);
		const r = await child(
			`${PRELUDE}
const shell = new Shell({ sessionEnv: { PATH: "/usr/bin:/bin", HOME: ${JSON.stringify(home)} } });
const done = await shell.run({ command: "true" }, () => {});
console.log(JSON.stringify({ exitCode: done.exitCode }));`,
			{ PATH: P, HOME: home },
		);
		expect(r).toEqual({ exitCode: 0 });
		expect(rc.filter((f) => existsSync(join(home, `marker-${f.replaceAll("/", "_")}`)))).toEqual([]);
	});

	test("names bash or brush reserve are withheld from the child even when sessionEnv supplies them; an ordinary name is not", async () => {
		const special = ["IFS", "UID", "EUID", "PPID", "BASH_VERSION", "OPTIND", "PS1"];
		const r = await child(
			`${PRELUDE}
const special = ${JSON.stringify(special)};
const sessionEnv = { PATH: "/usr/bin:/bin", AS2_PRB_CTRL: "ctrl" };
for (const n of special) sessionEnv[n] = "as2-prb-marker";
const env = await exported(new Shell({ sessionEnv }));
console.log(JSON.stringify({ marked: special.filter(n => env[n] === "as2-prb-marker"), ctrl: env.AS2_PRB_CTRL }));`,
			{ PATH: P, HOME: "/tmp" },
		);
		expect(r).toEqual({ marked: [], ctrl: "ctrl" });
	});

	test("GIT_ALTERNATE_OBJECT_DIRECTORIES in the C environ does not reach the child (the session harness's WITHHELD)", async () => {
		const r = await child(
			`${PRELUDE}
const env = await exported(new Shell({ sessionEnv: { PATH: "/usr/bin:/bin" } }));
console.log(JSON.stringify({ environ: environ().GIT_ALTERNATE_OBJECT_DIRECTORIES ?? null, child: env.GIT_ALTERNATE_OBJECT_DIRECTORIES ?? null, ctrl: env.AS2_PRB_CTRL ?? null }));`,
			{ PATH: P, HOME: "/tmp", GIT_ALTERNATE_OBJECT_DIRECTORIES: "/nonexistent/as2-prb-alt", AS2_PRB_CTRL: "ctrl" },
		);
		expect(r).toEqual({ environ: "/nonexistent/as2-prb-alt", child: null, ctrl: "ctrl" });
	});
});
