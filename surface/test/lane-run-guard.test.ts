// The run guard (MIGRATION.md item 108, fault 5 `duplicate-lane-runner`; Jo's "fix", in-mv4sw21wvysh6o): `takeRunnerLock`
// gives one `lane.ts run` the lane id (openai review r2 #1) and `writeAsOwner` keeps a non-owner from finalizing;
// `liveRunnerOf` decides, from the ledger's lane-started:/lane-exit: entries and a fake probe, whether a lane id still has
// a live omp or runner; `runnerProbe` reads ps strictly through a fake `PsRun` (a failure is never gone); `isRunnerCommand`
// is the runner's identity check on a ps command line. The last block runs `lane.ts run` itself on a temp ledger and a
// temp HOME with a scripted ps: refusals exit 7 with nothing written, two concurrent runs leave exactly one running, and
// a dead owner's lock is taken over.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type EntryRow, LANE_RUNNER_BY, LANE_STARTER_BY, Ledger } from "../../ledger/src/index";
import { controlEntries, laneExitBody, laneStartedBody, STARTER_EXIT } from "../src/launch";
import { SURFACE_BY } from "../src/types";
import {
	isRunnerCommand, liveRunnerOf, type LockRefusal, type PidState, type PsResult, type PsRun, type RunnerLock, type RunnerProbe, runnerLockPath, runnerProbe, selfIdentity,
	takeRunnerLock, writeAsOwner,
} from "../scripts/lane";
import { LANE_SCRIPT, tmp } from "./helpers";

const WL = "wl-guard";
const LANE = "lane-guard-1";
const SELF = 9000;
const START = "Sun Oct 11 10:00:00 2026";

let seq = 0;
const entry = (body: string, by = LANE_RUNNER_BY): EntryRow => {
	seq += 1;
	return { id: `e-${seq}`, workload_id: WL, slice_id: null, kind: "assumption", body, created_by: by, created_at: `2026-10-11T10:00:${String(seq % 60).padStart(2, "0")}.000Z` } as EntryRow;
};
const started = (laneId: string, pid: number, runnerPid: number, start = START): EntryRow =>
	entry(laneStartedBody(laneId, { pid, start, session: null, argv: ["--mode", "rpc"], runnerPid }));
const exited = (laneId: string): EntryRow => entry(laneExitBody(laneId, { code: 0, signal: null, outcome: "done" }));

/** A probe answering from fixed tables (anything unlisted is gone), recording every call. */
function probe(omp: Record<number, PidState>, runner: Record<number, PidState> = {}): RunnerProbe & { calls: string[] } {
	const calls: string[] = [];
	return {
		calls,
		omp: (pid, start) => {
			calls.push(`omp ${pid} ${start}`);
			return omp[pid] ?? "gone";
		},
		runner: (pid) => {
			calls.push(`runner ${pid}`);
			return runner[pid] ?? "gone";
		},
	};
}
const decide = (entries: EntryRow[], p: RunnerProbe, laneId = LANE) => liveRunnerOf(controlEntries(entries), laneId, SELF, p);

describe("liveRunnerOf", () => {
	test("a live omp whose start time matches refuses, naming its pid", () => {
		const p = probe({ 101: "same" });
		expect(decide([started(LANE, 101, 201)], p)).toEqual({ what: "omp", pid: 101 });
		expect(p.calls).toEqual([`omp 101 ${START}`]);
	});

	test("omp gone and runner gone: proceeds", () => {
		expect(decide([started(LANE, 101, 201)], probe({ 101: "gone" }, { 201: "gone" }))).toBeNull();
	});

	test("both pids reused by other processes (start time, command differ): proceeds", () => {
		expect(decide([started(LANE, 101, 201)], probe({ 101: "other" }, { 201: "other" }))).toBeNull();
	});

	test("no recorded start time and the omp pid gone: the runner is still checked, and a dead one proceeds", () => {
		const p = probe({ 101: "gone" }, { 201: "gone" });
		expect(decide([started(LANE, 101, 201, "")], p)).toBeNull();
		expect(p.calls).toEqual(["omp 101 ", "runner 201"]);
	});

	test("an unverifiable live omp (alive, no recorded start time) refuses as unverified, before the runner is probed", () => {
		const p = probe({ 101: "unknown" }, { 201: "gone" });
		expect(decide([started(LANE, 101, 201, "")], p)).toEqual({ what: "omp", pid: 101, unverified: true });
		expect(p.calls).toEqual(["omp 101 "]);
	});

	test("an unverifiable live omp on a superseded lane-started: refuses too", () => {
		expect(decide([started(LANE, 101, 201, ""), started(LANE, 102, 202)], probe({ 101: "unknown", 102: "gone" }, { 202: "gone" }))).toEqual({ what: "omp", pid: 101, unverified: true });
	});

	test("no recorded start time with a live runner of this lane still refuses on the runner", () => {
		expect(decide([started(LANE, 101, 201, "")], probe({ 101: "gone" }, { 201: "same" }))).toEqual({ what: "runner", pid: 201 });
	});

	test("an omp ps could not inspect refuses as uninspected, before the runner is probed", () => {
		const p = probe({ 101: "failed" }, { 201: "gone" });
		expect(decide([started(LANE, 101, 201)], p)).toEqual({ what: "omp", pid: 101, uninspected: true });
		expect(p.calls).toEqual([`omp 101 ${START}`]);
	});

	test("a runner ps could not inspect refuses as uninspected, also when no start time was recorded", () => {
		expect(decide([started(LANE, 101, 201)], probe({ 101: "gone" }, { 201: "failed" }))).toEqual({ what: "runner", pid: 201, uninspected: true });
		expect(decide([started(LANE, 101, 201, "")], probe({ 101: "gone" }, { 201: "failed" }))).toEqual({ what: "runner", pid: 201, uninspected: true });
	});

	test("an inspection failure on a superseded lane-started: refuses too", () => {
		expect(decide([started(LANE, 101, 201), started(LANE, 102, 202)], probe({ 101: "failed", 102: "gone" }, { 202: "gone" }))).toEqual({ what: "omp", pid: 101, uninspected: true });
	});

	test("an inspection failure before the lane-exit: is not probed", () => {
		const p = probe({ 101: "failed" }, { 201: "failed" });
		expect(decide([started(LANE, 101, 201), exited(LANE)], p)).toBeNull();
		expect(p.calls).toEqual([]);
	});

	test("a live runner of this lane refuses even when its omp is gone", () => {
		expect(decide([started(LANE, 101, 201)], probe({ 101: "gone" }, { 201: "same" }))).toEqual({ what: "runner", pid: 201 });
	});

	test("a lane-exit: after the lane-started: proceeds without probing", () => {
		const p = probe({ 101: "same" }, { 201: "same" });
		expect(decide([started(LANE, 101, 201), exited(LANE)], p)).toBeNull();
		expect(p.calls).toEqual([]);
	});

	test("a lane-started: after an earlier lane-exit: (a relaunch on the same id) still counts", () => {
		expect(decide([started(LANE, 101, 201), exited(LANE), started(LANE, 102, 202)], probe({ 101: "same", 102: "same" }))).toEqual({ what: "omp", pid: 102 });
	});

	test("an entry whose runner pid is this process: its runner check is skipped and it proceeds", () => {
		const p = probe({ 101: "gone" }, { [SELF]: "same" });
		expect(decide([started(LANE, 101, SELF)], p)).toBeNull();
		expect(p.calls).toEqual([`omp 101 ${START}`]);
	});

	test("an entry whose runner pid is this process still refuses on a live omp", () => {
		expect(decide([started(LANE, 101, SELF)], probe({ 101: "same" }))).toEqual({ what: "omp", pid: 101 });
	});

	test("of two lane-started: entries the latest is probed first and is the one named", () => {
		const p = probe({ 101: "same", 102: "same" });
		expect(decide([started(LANE, 101, 201), started(LANE, 102, 202)], p)).toEqual({ what: "omp", pid: 102 });
		expect(p.calls).toEqual([`omp 102 ${START}`]);
	});

	test("a superseded lane-started: whose omp is still alive refuses too: the lane id has a live omp", () => {
		expect(decide([started(LANE, 101, 201), started(LANE, 102, 202)], probe({ 101: "same", 102: "gone" }))).toEqual({ what: "omp", pid: 101 });
	});

	test("the runner's re-records with the same pids are probed once", () => {
		const p = probe({});
		expect(decide([started(LANE, 101, 201), started(LANE, 101, 201), started(LANE, 101, 201)], p)).toBeNull();
		expect(p.calls).toEqual([`omp 101 ${START}`, "runner 201"]);
	});

	test("a different lane id proceeds without probing", () => {
		const p = probe({ 101: "same" }, { 201: "same" });
		expect(decide([started("lane-guard-2", 101, 201)], p)).toBeNull();
		expect(p.calls).toEqual([]);
	});

	test("another lane's lane-exit: does not end this lane's start", () => {
		expect(decide([started(LANE, 101, 201), exited("lane-guard-2")], probe({ 101: "same" }))).toEqual({ what: "omp", pid: 101 });
	});

	test("a lane-started: from a writer the control filter drops, or an unparsable one, is not a start", () => {
		const forged = entry(laneStartedBody(LANE, { pid: 101, start: START, session: null, argv: [], runnerPid: 201 }), "lane-guard-1");
		const garbled = entry(`lane-started: ${LANE} {not json`, LANE_STARTER_BY);
		const p = probe({ 101: "same" }, { 201: "same" });
		expect(decide([forged, garbled], p)).toBeNull();
		expect(p.calls).toEqual([]);
	});

	test("no entries: proceeds", () => {
		expect(decide([], probe({}))).toBeNull();
	});
});

describe("isRunnerCommand", () => {
	test("the command line cmdLaunch and chaos spawn, whatever the path to lane.ts", () => {
		expect(isRunnerCommand(`bun /Users/x/repo/surface/scripts/lane.ts run ${WL} ${LANE}`, WL, LANE)).toBe(true);
		expect(isRunnerCommand(`bun surface/scripts/lane.ts run ${WL} ${LANE}`, WL, LANE)).toBe(true);
		expect(isRunnerCommand(`bun lane.ts run ${WL} ${LANE} extra`, WL, LANE)).toBe(true);
	});

	test("another workload, lane id, subcommand or script is not this runner", () => {
		expect(isRunnerCommand(`bun surface/scripts/lane.ts run wl-other ${LANE}`, WL, LANE)).toBe(false);
		expect(isRunnerCommand(`bun surface/scripts/lane.ts run ${WL} ${LANE}0`, WL, LANE)).toBe(false);
		expect(isRunnerCommand(`bun surface/scripts/lane.ts run ${WL} lane-guard-2`, WL, LANE)).toBe(false);
		expect(isRunnerCommand(`bun surface/scripts/lane.ts interactive ${WL}`, WL, LANE)).toBe(false);
		expect(isRunnerCommand(`bun surface/scripts/notlane.ts run ${WL} ${LANE}`, WL, LANE)).toBe(false);
		expect(isRunnerCommand("<defunct>", WL, LANE)).toBe(false);
	});
});

/** A fake ps: answers each call from `answer`, or throws (as spawnSync does when ps cannot be spawned), recording the args. */
function ps(answer: ((args: string[]) => PsResult) | Error): PsRun & { calls: string[][] } {
	const calls: string[][] = [];
	const run = (args: string[]) => {
		calls.push(args);
		if (answer instanceof Error) throw answer;
		return answer(args);
	};
	return Object.assign(run, { calls });
}
const answer = (exitCode: number, stdout = "", stderr = "") => () => ({ exitCode, stdout, stderr });
const RUNNER_CMD = `bun /repo/surface/scripts/lane.ts run ${WL} ${LANE}\n`;

describe("runnerProbe: ps read strictly, a failure is never gone", () => {
	test("a clean `no such process` (exit 1, nothing on either stream) is gone, for the omp and the runner", () => {
		const p = runnerProbe(WL, LANE, ps(answer(1)));
		expect(p.omp(101, START)).toBe("gone");
		expect(p.runner(201)).toBe("gone");
		expect(p.failure).toBeNull();
	});

	test("ps that cannot be spawned is failed, with its error kept for the refusal", () => {
		const run = ps(new Error("EPERM: posix_spawn '/bin/ps'"));
		const p = runnerProbe(WL, LANE, run);
		expect(p.omp(101, START)).toBe("failed");
		expect(p.failure).toContain("EPERM");
		expect(runnerProbe(WL, LANE, run).runner(201)).toBe("failed");
	});

	test("any other answer is failed: exit 1 with an error message, exit 2, exit 126, exit 0 with no output, killed by a signal", () => {
		for (const run of [ps(answer(1, "", "ps: sysctl failed")), ps(answer(2, "", "ps (stand-in): unsupported")), ps(answer(126)), ps(answer(0)), ps(() => ({ exitCode: null, stdout: "", stderr: "" }))]) {
			const p = runnerProbe(WL, LANE, run);
			expect(p.omp(101, START)).toBe("failed");
			expect(p.runner(201)).toBe("failed");
			expect(p.failure).toMatch(/^ps -p 201 -o command= exited /);
		}
		const p = runnerProbe(WL, LANE, ps(answer(1, "", "ps: sysctl failed")));
		p.omp(101, START);
		expect(p.failure).toBe("ps -p 101 -o stat=,lstart= exited 1: ps: sysctl failed");
	});

	test("the omp: its recorded start time is same, another is other, a zombie is gone, a missing start time is failed", () => {
		expect(runnerProbe(WL, LANE, ps(answer(0, `S    ${START}    \n`))).omp(101, START)).toBe("same");
		expect(runnerProbe(WL, LANE, ps(answer(0, "Ss   Sun Oct 11 09:59:59 2026\n"))).omp(101, START)).toBe("other");
		expect(runnerProbe(WL, LANE, ps(answer(0, `Z    ${START}\n`))).omp(101, START)).toBe("gone");
		expect(runnerProbe(WL, LANE, ps(answer(0, "S\n"))).omp(101, START)).toBe("failed");
	});

	test("the omp with no recorded start time: ps -o stat= only; alive is unknown, absent or a zombie is gone, a failure is failed", () => {
		const run = ps(answer(0, "S\n"));
		expect(runnerProbe(WL, LANE, run).omp(101, "")).toBe("unknown");
		expect(run.calls).toEqual([["-p", "101", "-o", "stat="]]);
		expect(runnerProbe(WL, LANE, ps(answer(1))).omp(101, "")).toBe("gone");
		expect(runnerProbe(WL, LANE, ps(answer(0, "Z\n"))).omp(101, "")).toBe("gone");
		const p = runnerProbe(WL, LANE, ps(new Error("EPERM: posix_spawn '/bin/ps'")));
		expect(p.omp(101, "")).toBe("failed");
		expect(p.failure).toContain("EPERM");
	});

	test("the runner: this lane's command line is same, any other is other; the ps shape is `-p <pid> -o command=`", () => {
		const run = ps(answer(0, RUNNER_CMD));
		expect(runnerProbe(WL, LANE, run).runner(201)).toBe("same");
		expect(run.calls).toEqual([["-p", "201", "-o", "command="]]);
		expect(runnerProbe(WL, LANE, ps(answer(0, "/usr/bin/vim notes.txt\n"))).runner(201)).toBe("other");
	});
});

describe("takeRunnerLock and writeAsOwner: one owner per lane id, and only the owner finalizes", () => {
	const roots: string[] = [];
	afterAll(() => {
		for (const r of roots) rmSync(r, { recursive: true, force: true });
	});
	/** The ledger's write, run inline: these tests are one process, so the cross-process mutex is not what they exercise. */
	const inline: Pick<Ledger, "write"> = { write: (fn) => fn() };
	const A = { pid: 301, start: "Mon Oct 12 10:00:00 2026" };
	const B = { pid: 302, start: "Mon Oct 12 10:00:01 2026" };
	const lockAt = (): string => {
		const root = tmp("run-lock");
		roots.push(root);
		return runnerLockPath(WL, LANE, root);
	};
	const named = (path: string) => JSON.parse(readFileSync(path, "utf8")) as unknown;
	/** A check from a fixed table (anything unlisted is gone), recording every call. */
	const check = (states: Record<number, PidState>) => {
		const calls: string[] = [];
		return Object.assign((pid: number, start: string): PidState => {
			calls.push(`${pid} ${start}`);
			return states[pid] ?? "gone";
		}, { calls });
	};
	const isLock = (r: RunnerLock | LockRefusal): r is RunnerLock => "held" in r;

	test("a free lane id: the lock is created under the lanes root naming the pid and start time; held, then released", () => {
		const path = lockAt();
		expect(path).toEndWith(join(".agent-system-2", "lanes", WL, `${LANE}.run.lock`));
		const c = check({});
		const r = takeRunnerLock(inline, path, A, c);
		if (!isLock(r)) throw new Error(`refused: ${r.state}`);
		expect(r.tookOver).toBeNull();
		expect(c.calls).toEqual([]);
		expect(named(path)).toEqual(A);
		expect(r.held()).toBe(true);
		r.release();
		expect(existsSync(path)).toBe(false);
		// gone and taken by nobody: still this runner's to finalize; once another runner takes it, not
		expect(r.held()).toBe(true);
		expect(isLock(takeRunnerLock(inline, path, B, check({})))).toBe(true);
		expect(r.held()).toBe(false);
		r.release();
		expect(named(path)).toEqual(B);
	});

	test("a live owner (same) refuses the second runner and its lock is untouched", () => {
		const path = lockAt();
		const first = takeRunnerLock(inline, path, A, check({}));
		expect(isLock(first)).toBe(true);
		const c = check({ [A.pid]: "same" });
		expect(takeRunnerLock(inline, path, B, c)).toEqual({ owner: A, state: "same" });
		expect(c.calls).toEqual([`${A.pid} ${A.start}`]);
		expect(named(path)).toEqual(A);
	});

	test("an owner ps could not inspect (failed), or alive with no start time (unknown), refuses: never a takeover", () => {
		for (const state of ["failed", "unknown"] as const) {
			const path = lockAt();
			takeRunnerLock(inline, path, A, check({}));
			expect(takeRunnerLock(inline, path, B, check({ [A.pid]: state }))).toEqual({ owner: A, state });
			expect(named(path)).toEqual(A);
		}
	});

	test("a stale reservation from a dead pid (gone), or a pid now running another process (other), is taken over", () => {
		for (const state of ["gone", "other"] as const) {
			const path = lockAt();
			takeRunnerLock(inline, path, A, check({}));
			const r = takeRunnerLock(inline, path, B, check({ [A.pid]: state }));
			if (!isLock(r)) throw new Error(`refused: ${r.state}`);
			expect(r.tookOver).toEqual({ owner: A, state });
			expect(named(path)).toEqual(B);
			expect(r.held()).toBe(true);
		}
	});

	test("a lock file that names no runner refuses, and is left for a person to remove", () => {
		const path = lockAt();
		mkdirSync(join(path, ".."), { recursive: true });
		writeFileSync(path, "");
		expect(takeRunnerLock(inline, path, A, check({}))).toEqual({ owner: null, state: "unreadable" });
		expect(readFileSync(path, "utf8")).toBe("");
	});

	test("a lock that already names this runner (a busy-retried transaction) is held, not refused", () => {
		const path = lockAt();
		takeRunnerLock(inline, path, A, check({}));
		const c = check({ [A.pid]: "same" });
		expect(isLock(takeRunnerLock(inline, path, A, c))).toBe(true);
		expect(c.calls).toEqual([]);
	});

	test("a non-owner never releases: writeAsOwner skips the finalization once the lock names another runner, and release leaves that lock", () => {
		const path = lockAt();
		const a = takeRunnerLock(inline, path, A, check({}));
		if (!isLock(a)) throw new Error("refused");
		const ran: string[] = [];
		expect(writeAsOwner(inline, a, () => ran.push("owner"))).toBe(true);
		// B took the lane id over (A's pid read as gone): A's finalizer must neither release the workload nor write lane-exit:.
		const b = takeRunnerLock(inline, path, B, check({ [A.pid]: "gone" }));
		expect(isLock(b)).toBe(true);
		expect(writeAsOwner(inline, a, () => ran.push("non-owner"))).toBe(false);
		expect(ran).toEqual(["owner"]);
		a.release();
		expect(named(path)).toEqual(B);
	});

	test("writeAsOwner reads the lock inside the ledger write", () => {
		const path = lockAt();
		const a = takeRunnerLock(inline, path, A, check({}));
		if (!isLock(a)) throw new Error("refused");
		const order: string[] = [];
		const traced: Pick<Ledger, "write"> = {
			write: (fn) => {
				order.push("begin");
				const out = fn();
				order.push("commit");
				return out;
			},
		};
		writeAsOwner(traced, { held: () => (order.push("held"), true) }, () => order.push("fn"));
		expect(order).toEqual(["begin", "held", "fn", "commit"]);
	});

	test("selfIdentity reads this pid's start time strictly", () => {
		expect(selfIdentity(ps(answer(0, "Ss   Mon Oct 12 10:00:00 2026\n")), 77)).toEqual({ pid: 77, start: "Mon Oct 12 10:00:00 2026" });
		expect(() => selfIdentity(ps(answer(0, "S\n")), 77)).toThrow("no start time");
		expect(() => selfIdentity(ps(answer(1)), 77)).toThrow("no such process");
		expect(() => selfIdentity(ps(new Error("EPERM")), 77)).toThrow("EPERM");
	});
});

describe("lane.ts run: the lock and the guard, end to end on a temp ledger with a scripted ps", () => {
	const roots: string[] = [];
	afterAll(() => {
		for (const r of roots) rmSync(r, { recursive: true, force: true });
	});
	/** The start time the scripted ps gives every pid no arm names: the runners' own, and any live lock owner's. */
	const RUN_START = "Mon Oct 12 10:00:00 2026";

	interface Fixture {
		wl: string;
		laneId: string;
		ledgerPath: string;
		home: string;
		bin: string;
		lock: string;
		env: Record<string, string>;
	}
	/** A temp ledger with a workload `launch` reserved for `lane-<wl>-1`, a lane-started: for it (omp 101, runner 201, no lane-exit:), and a bin dir. */
	function fixture(start: string): Fixture {
		const root = tmp("run-guard");
		roots.push(root);
		const home = join(root, "home");
		const bin = join(root, "bin");
		mkdirSync(join(home, ".agent-system-2"), { recursive: true });
		mkdirSync(bin);
		// PATH is this dir alone, so ps is only ever the one a test writes here, and there is no omp (prepare stops at preflight);
		// df is the ledger's locality check (ledger/src/locality.ts).
		symlinkSync(Bun.which("df")!, join(bin, "df"));
		const ledgerPath = join(home, ".agent-system-2", "ledger.db");
		const l = Ledger.open(ledgerPath, { create: true, backup: false, backupOnOpen: false });
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "run guard probe", stakes: "normal", mode: "autonomous" });
		const res = l.reserveLane(wl, { by: LANE_STARTER_BY, cap: 3, leaseMs: 60_000, requestedBy: "test", decide: () => ({ launch: true, cause: "first" }) });
		if (!res.ok) throw new Error(res.reason);
		l.recordEntry({ by: LANE_RUNNER_BY, workloadId: wl, kind: "assumption", body: laneStartedBody(res.laneId, { pid: 101, start, session: null, argv: ["--mode", "rpc"], runnerPid: 201 }) });
		l.close();
		return { wl, laneId: res.laneId, ledgerPath, home, bin, lock: runnerLockPath(wl, res.laneId, home), env: { PATH: bin, HOME: home, AGENT_SYSTEM_LEDGER_DB: ledgerPath } };
	}
	/** bin/ps as a sh script: `arms` are `case` arms on the pid (`ps -p PID -o …` puts it in $2); any other pid is alive since RUN_START. */
	function writePs(f: Fixture, arms: string): void {
		writeFileSync(join(f.bin, "ps"), `#!/bin/sh\ncase "$2" in\n${arms}\n*) echo 'S    ${RUN_START}'; exit 0;;\nesac\n`);
		chmodSync(join(f.bin, "ps"), 0o755);
	}
	const GONE = "101|201) exit 1;;";
	const state = (ledgerPath: string, wl: string) => {
		const l = Ledger.open(ledgerPath, { backup: false, backupOnOpen: false });
		try {
			return { entries: l.entries(wl).map((e) => e.body), workload: l.workload(wl) };
		} finally {
			l.close();
		}
	};
	const run = (f: Fixture) => {
		const r = Bun.spawnSync([process.execPath, LANE_SCRIPT, "run", f.wl, f.laneId], { env: f.env, stdout: "pipe", stderr: "pipe" });
		return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
	};
	const writeLock = (f: Fixture, owner: { pid: number; start: string }): void => {
		mkdirSync(join(f.lock, ".."), { recursive: true });
		writeFileSync(f.lock, `${JSON.stringify(owner)}\n`);
	};

	test("ps answering with an error (exit 2) on the recorded omp: exit 7 (held), one stderr line naming the failure, the ledger untouched, the lock freed", () => {
		const f = fixture(START);
		writePs(f, "101) echo 'ps (stand-in): kinfo_proc layout moved' >&2; exit 2;;");
		const before = state(f.ledgerPath, f.wl);
		const r = run(f);
		expect(r.code).toBe(STARTER_EXIT.held!);
		expect(r.out).toBe("");
		expect(r.err).toBe(`lane run: ${f.laneId} not started: inspecting the recorded omp pid 101 failed (ps -p 101 -o stat=,lstart= exited 2: ps (stand-in): kinfo_proc layout moved); nothing was written, retryable once ps can answer\n`);
		// no lane-exit:, no launch-failed:, no release: the reservation and the entries are exactly as before
		expect(state(f.ledgerPath, f.wl)).toEqual(before);
		expect(before.workload!.holder).toBe(f.laneId);
		expect(existsSync(f.lock)).toBe(false);
	});

	test("ps failing on the recorded runner (no start time recorded for a gone omp): exit 7 the same way", () => {
		const f = fixture("");
		writePs(f, "101) exit 1;;\n201) echo 'ps: sysctl failed' >&2; exit 1;;");
		const before = state(f.ledgerPath, f.wl);
		const r = run(f);
		expect(r.code).toBe(STARTER_EXIT.held!);
		expect(r.err).toBe(`lane run: ${f.laneId} not started: inspecting the recorded runner pid 201 failed (ps -p 201 -o command= exited 1: ps: sysctl failed); nothing was written, retryable once ps can answer\n`);
		expect(state(f.ledgerPath, f.wl)).toEqual(before);
		expect(existsSync(f.lock)).toBe(false);
	});

	test("no ps on PATH: the runner's own start time cannot be read, exit 7 before any lock or ledger write", () => {
		const f = fixture(START);
		const before = state(f.ledgerPath, f.wl);
		const r = run(f);
		expect(r.code).toBe(STARTER_EXIT.held!);
		expect(r.err).toMatch(new RegExp(`^lane run: ${f.laneId} not started: this runner's own start time, which its run lock .+ records, could not be read \\(.+\\); nothing was written, retryable once ps can answer\\n$`));
		expect(state(f.ledgerPath, f.wl)).toEqual(before);
		expect(existsSync(f.lock)).toBe(false);
	});

	test("an unverifiable live omp (alive, no recorded start time): exit 7, retryable, the ledger untouched, the lock freed", () => {
		const f = fixture("");
		writePs(f, "101) echo 'S'; exit 0;;\n201) exit 1;;");
		const before = state(f.ledgerPath, f.wl);
		const r = run(f);
		expect(r.code).toBe(STARTER_EXIT.held!);
		expect(r.err).toBe(`lane run: ${f.laneId} not started: the recorded omp pid 101 is alive and no start time was recorded for it, so it cannot be told from this lane's omp; nothing was written, retryable once it exits\n`);
		expect(state(f.ledgerPath, f.wl)).toEqual(before);
		expect(existsSync(f.lock)).toBe(false);
	});

	test("a live lock owner: the non-owner exits 7 `already running`, releases nothing, and leaves the owner's lock as it was", () => {
		const f = fixture(START);
		writePs(f, GONE);
		const owner = { pid: 99990, start: RUN_START };
		writeLock(f, owner);
		const before = state(f.ledgerPath, f.wl);
		const r = run(f);
		expect(r.code).toBe(STARTER_EXIT.held!);
		expect(r.err).toBe(`lane run: ${f.laneId} already running: runner pid 99990 holds ${f.lock}\n`);
		expect(state(f.ledgerPath, f.wl)).toEqual(before);
		expect(before.workload!.holder).toBe(f.laneId);
		expect(JSON.parse(readFileSync(f.lock, "utf8"))).toEqual(owner);
	});

	test("a stale reservation from a dead pid, or from a pid now running another process, is taken over: the runner proceeds as owner", () => {
		for (const [arm, why] of [["99990) exit 1;;", "no such process"], ["99990) echo 'S    Sun Oct 11 08:00:00 2026'; exit 0;;", "the pid now runs another process"]] as const) {
			const f = fixture(START);
			writePs(f, `${GONE}\n${arm}`);
			writeLock(f, { pid: 99990, start: "Sun Oct 11 09:00:00 2026" });
			const r = run(f);
			// The owner went on to prepare, which stops at preflight (no omp on PATH): its failure is recorded and the pre-claim released.
			expect(r.code).toBe(STARTER_EXIT["no-omp"]!);
			expect(r.err).toContain(`runner: ${f.laneId} took over ${f.lock} from runner pid 99990 (${why})\n`);
			const after = state(f.ledgerPath, f.wl);
			expect(after.entries.filter((b) => b.startsWith(`launch-failed: ${f.laneId}`))).toHaveLength(1);
			expect(after.workload!.holder).not.toBe(f.laneId);
			expect(existsSync(f.lock)).toBe(false);
		}
	});

	test("two concurrent run attempts on one lane id: exactly one proceeds, the other exits 7 `already running` naming it", async () => {
		const f = fixture(START);
		const mark = join(f.home, "release-101");
		// The owner parks on its omp-101 check until the test writes the mark, so it holds the lock while the other one tries.
		writePs(f, `101) i=0; while [ ! -f '${mark}' ] && [ $i -lt 300 ]; do /bin/sleep 0.1; i=$((i+1)); done; exit 1;;\n201) exit 1;;`);
		const spawnRun = () => Bun.spawn([process.execPath, LANE_SCRIPT, "run", f.wl, f.laneId], { env: f.env, stdout: "pipe", stderr: "pipe" });
		const a = spawnRun();
		const b = spawnRun();
		const first = await Promise.race([a.exited.then(() => a), b.exited.then(() => b)]);
		const other = first === a ? b : a;
		expect(first.exitCode).toBe(STARTER_EXIT.held!);
		expect(await new Response(first.stderr).text()).toBe(`lane run: ${f.laneId} already running: runner pid ${other.pid} holds ${f.lock}\n`);
		expect(other.exitCode).toBeNull();
		expect(JSON.parse(readFileSync(f.lock, "utf8"))).toEqual({ pid: other.pid, start: RUN_START });
		writeFileSync(mark, "");
		expect(await other.exited).toBe(STARTER_EXIT["no-omp"]!);
		const after = state(f.ledgerPath, f.wl);
		// one owner's failure, written once; the refused runner wrote nothing
		expect(after.entries.filter((b) => b.startsWith(`launch-failed: ${f.laneId}`))).toHaveLength(1);
		expect(existsSync(f.lock)).toBe(false);
	}, 30_000);
});
