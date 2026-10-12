// The ps stand-in (surface/scripts/ps-shim/ps; Jo's "shim", in-mv4rsupda3wf7k): the three invocations this
// repository makes, in the macOS ps shape, read from the kernel through sysctl. It is executed the way
// lane.ts and chaos.ts execute it (its own `#!/usr/bin/env bun`), never through a shell. Where the real
// /bin/ps can be executed (outside a lane's fence: its setuid exec fails inside), the stand-in's output is
// compared with the real one byte for byte; inside the fence those cases skip.
import { afterAll, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "bun";
import { dirname, join } from "node:path";

const SHIM = join(import.meta.dir, "..", "scripts", "ps-shim", "ps");
/**
 * bun's dir first, as on a chaos scratch PATH, so the shebang resolves; the en_US locale, whose %c the stand-in knows; and
 * an explicit TZ, because bun test runs its own clock in UTC without exporting TZ, so a child would otherwise print the
 * machine's zone while this file parses in UTC.
 */
const ENV = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH ?? ""}`, LC_ALL: "en_US.UTF-8", TZ: "UTC" };

function shim(args: string[], env: Record<string, string | undefined> = ENV): { code: number | null; out: string; err: string } {
	const r = spawnSync([SHIM, ...args], { env, stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

function realPs(args: string[]): { code: number | null; out: string } | null {
	try {
		const r = spawnSync(["/bin/ps", ...args], { env: ENV, stdout: "pipe", stderr: "pipe" });
		return { code: r.exitCode, out: r.stdout.toString() };
	} catch {
		return null; // EPERM posix_spawn: a setuid binary under the fence
	}
}
const REAL_PS = realPs(["-p", String(process.pid), "-o", "pid="])?.code === 0;

/** Polls `probe`: a kernel process state (a SIGKILLed child turning zombie) has no event to await, so this re-reads it every 50 ms. */
async function until<T>(what: string, probe: () => T | null | undefined | false, ms = 5_000): Promise<T> {
	const deadline = Date.now() + ms;
	for (;;) {
		const v = probe();
		if (v) return v;
		if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
		await Bun.sleep(50);
	}
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LSTART = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ \d]\d) (\d\d):(\d\d):(\d\d) (\d{4})$/;

const t0 = Date.now();
const sleeper = spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore" });
const pid = String(sleeper.pid);
// A parent that never waits: sh forks `sleep 30`, prints its pid and execs into `sleep 30`; the test then kills the
// forked child, which stays a zombie (killed, not reaped) of the live parent.
const parent = spawn(["sh", "-c", "sleep 30 & echo $!; exec sleep 30"], { stdout: "pipe", stderr: "ignore" });
afterAll(() => {
	sleeper.kill("SIGKILL");
	parent.kill("SIGKILL");
});

describe("ps stand-in: a live child (sleep 30)", () => {
	test("-p PID -o pid= (chaos psProbe): the pid, right-aligned in ps's width 5", () => {
		const r = shim(["-p", pid, "-o", "pid="]);
		expect(r).toEqual({ code: 0, out: `${pid.padStart(5)}\n`, err: "" });
	});

	test("-p PID -o stat=,lstart= (lane.ts startTime): S or R, then lstart within 5 s of the spawn, in ps's widths", () => {
		const r = shim(["-p", pid, "-o", "stat=,lstart="]);
		expect(r.code).toBe(0);
		const m = /^(\S+) +(.{24}) {4}\n$/.exec(r.out);
		expect(m).not.toBeNull();
		const [, stat, lstart] = m!;
		expect(stat).toMatch(/^[SR]/);
		expect(r.out.startsWith(stat!.padEnd(4))).toBe(true);
		const l = LSTART.exec(lstart!);
		expect(l).not.toBeNull();
		const at = Date.UTC(Number(l![7]), MONTHS.indexOf(l![2]!), Number(l![3]), Number(l![4]), Number(l![5]), Number(l![6]));
		expect(Math.abs(at - t0)).toBeLessThanOrEqual(5_000);
		expect(new Date(at).toUTCString().slice(0, 3)).toBe(l![1]!);
	});

	test("lstart is local time: TZ=Asia/Kolkata (UTC+05:30) prints the same instant 5 h 30 min later on the wall clock", () => {
		const utc = LSTART.exec(shim(["-p", pid, "-o", "lstart="]).out.trimEnd())!;
		const ist = LSTART.exec(shim(["-p", pid, "-o", "lstart="], { ...ENV, TZ: "Asia/Kolkata" }).out.trimEnd())!;
		const wall = (l: RegExpExecArray) => Date.UTC(Number(l[7]), MONTHS.indexOf(l[2]!), Number(l[3]), Number(l[4]), Number(l[5]), Number(l[6]));
		expect(wall(ist) - wall(utc)).toBe(5.5 * 3600 * 1000);
	});

	test("-o lstart=,command= -p PID (chaos psInfo): the same lstart, then the argv joined by spaces", () => {
		const a = shim(["-o", "lstart=,command=", "-p", pid]);
		const b = shim(["-p", pid, "-o", "stat=,lstart="]);
		expect(a.code).toBe(0);
		expect(a.out.slice(0, 28)).toBe(b.out.slice(5, 33));
		expect(a.out.slice(28)).toBe(" sleep 30\n");
	});

	test("ppid, comm, ucomm and a non-last command field", () => {
		expect(shim(["-p", pid, "-o", "ppid="]).out).toBe(`${String(process.pid).padStart(5)}\n`);
		expect(shim(["-p", pid, "-o", "comm="]).out).toBe("sleep\n");
		expect(shim(["-p", pid, "-o", "ucomm="]).out).toBe(`${"sleep".padEnd(16)}\n`);
		expect(shim([`-p${pid}`, "-ocommand=,pid="]).out).toBe(`sleep 30 ${pid.padStart(5)}\n`);
	});
});

describe("ps stand-in: a killed child its parent never reaps", () => {
	test("shows Z, and its command as <defunct>", async () => {
		const reader = parent.stdout.getReader();
		const { value } = await reader.read();
		reader.releaseLock();
		const child = Number(new TextDecoder().decode(value).trim().split("\n")[0]);
		expect(child).toBeGreaterThan(0);
		process.kill(child, "SIGKILL");
		const stat = await until("the child to be a zombie", () => {
			const r = shim(["-p", String(child), "-o", "stat="]);
			return r.code === 0 && r.out.startsWith("Z") && r.out;
		});
		expect(stat).toMatch(/^Z\S* *\n$/);
		expect(shim(["-p", String(child), "-o", "command="]).out).toBe("<defunct>\n");
		if (REAL_PS) {
			for (const o of ["stat=", "stat=,lstart=", "lstart=,command=", "pid=,ppid=,comm=,ucomm="]) {
				expect(shim(["-p", String(child), "-o", o]).out).toBe(realPs(["-p", String(child), "-o", o])!.out);
			}
		}
	});
});

describe("ps stand-in: refusals", () => {
	test("a missing pid exits 1 with no output (a reaped child's pid)", async () => {
		const gone = spawn(["true"]);
		await gone.exited;
		expect(shim(["-p", String(gone.pid), "-o", "stat=,lstart="])).toEqual({ code: 1, out: "", err: "" });
	});

	test("an unsupported flag, field, header or locale exits 2 with a message and no output", () => {
		for (const [args, env] of [
			[["-A"], ENV],
			[["-p", pid, "-o", "pid=", "-x"], ENV],
			[["-p", pid, "-o", "rss="], ENV],
			[["-p", pid, "-o", "pid"], ENV],
			[["-p", pid, "-o", "pid=PID"], ENV],
			[["-p", `${pid},1`, "-o", "pid="], ENV],
			[["-p", pid], ENV],
			[["-p", pid, "-o", "lstart="], { ...ENV, LC_ALL: "de_DE.UTF-8" }],
		] as [string[], Record<string, string | undefined>][]) {
			const r = shim(args, env);
			expect({ args, code: r.code, out: r.out }).toEqual({ args, code: 2, out: "" });
			expect(r.err).toStartWith("ps (stand-in surface/scripts/ps-shim/ps): ");
		}
	});
});

describe.skipIf(!REAL_PS)("ps stand-in against the real /bin/ps (outside the fence only)", () => {
	test("byte for byte on the live child, for the three invocations and every supported field", () => {
		for (const args of [
			["-p", pid, "-o", "stat=,lstart="],
			["-o", "lstart=,command=", "-p", pid],
			["-p", pid, "-o", "pid="],
			["-p", pid, "-o", "pid=,ppid=,stat=,lstart=,ucomm=,comm=,command=,args="],
			["-p", pid, "-o", "command=,pid="],
		]) {
			expect({ args, out: shim(args).out }).toEqual({ args, out: realPs(args)!.out });
		}
	});

	test("the same exit and empty output for a missing pid", async () => {
		const gone = spawn(["true"]);
		await gone.exited;
		const real = realPs(["-p", String(gone.pid), "-o", "pid="])!;
		expect(shim(["-p", String(gone.pid), "-o", "pid="])).toEqual({ code: real.code, out: real.out, err: "" });
	});
});
