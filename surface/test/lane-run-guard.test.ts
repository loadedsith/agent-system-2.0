// The run guard (MIGRATION.md item 108, fault 5 `duplicate-lane-runner`; Jo's "fix", in-mv4sw21wvysh6o): `liveRunnerOf`
// decides, from the ledger's lane-started:/lane-exit: entries and a fake probe, whether a second `lane.ts run` on a lane
// id must refuse; `runnerProbe` reads ps strictly through a fake `PsRun` (a failure is never gone); `isRunnerCommand` is
// the runner's identity check on a ps command line. The last block runs `lane.ts run` itself on a temp ledger with a ps
// that cannot answer (review r1: openai #4): exit 7, one stderr line, nothing written.
import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type EntryRow, LANE_RUNNER_BY, LANE_STARTER_BY, Ledger } from "../../ledger/src/index";
import { controlEntries, laneExitBody, laneStartedBody, STARTER_EXIT } from "../src/launch";
import { SURFACE_BY } from "../src/types";
import { isRunnerCommand, liveRunnerOf, type PidState, type PsResult, type PsRun, type RunnerProbe, runnerProbe } from "../scripts/lane";
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

	test("no recorded start time (unknown) never refuses on the omp alone; the runner is still checked, and a dead one proceeds", () => {
		const p = probe({ 101: "unknown" }, { 201: "gone" });
		expect(decide([started(LANE, 101, 201, "")], p)).toBeNull();
		expect(p.calls).toEqual(["omp 101 ", "runner 201"]);
	});

	test("no recorded start time with a live runner of this lane still refuses on the runner", () => {
		expect(decide([started(LANE, 101, 201, "")], probe({ 101: "unknown" }, { 201: "same" }))).toEqual({ what: "runner", pid: 201 });
	});

	test("an omp ps could not inspect refuses as uninspected, before the runner is probed", () => {
		const p = probe({ 101: "failed" }, { 201: "gone" });
		expect(decide([started(LANE, 101, 201)], p)).toEqual({ what: "omp", pid: 101, uninspected: true });
		expect(p.calls).toEqual([`omp 101 ${START}`]);
	});

	test("a runner ps could not inspect refuses as uninspected, also when no start time was recorded", () => {
		expect(decide([started(LANE, 101, 201)], probe({ 101: "gone" }, { 201: "failed" }))).toEqual({ what: "runner", pid: 201, uninspected: true });
		expect(decide([started(LANE, 101, 201, "")], probe({ 101: "unknown" }, { 201: "failed" }))).toEqual({ what: "runner", pid: 201, uninspected: true });
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

	test("the omp with no recorded start time is unknown without asking ps", () => {
		const run = ps(new Error("ps must not be asked"));
		const p = runnerProbe(WL, LANE, run);
		expect(p.omp(101, "")).toBe("unknown");
		expect(run.calls).toEqual([]);
		expect(p.failure).toBeNull();
	});

	test("the runner: this lane's command line is same, any other is other; the ps shape is `-p <pid> -o command=`", () => {
		const run = ps(answer(0, RUNNER_CMD));
		expect(runnerProbe(WL, LANE, run).runner(201)).toBe("same");
		expect(run.calls).toEqual([["-p", "201", "-o", "command="]]);
		expect(runnerProbe(WL, LANE, ps(answer(0, "/usr/bin/vim notes.txt\n"))).runner(201)).toBe("other");
	});
});

describe("lane.ts run: a recorded owner ps cannot inspect refuses, retryable, before any write", () => {
	const roots: string[] = [];
	afterAll(() => {
		for (const r of roots) rmSync(r, { recursive: true, force: true });
	});

	interface Fixture {
		wl: string;
		laneId: string;
		ledgerPath: string;
		bin: string;
		env: Record<string, string>;
	}
	/** A temp ledger with a workload `launch` reserved for `lane-<wl>-1`, a lane-started: for it (no lane-exit:), and a bin dir. */
	function fixture(start: string): Fixture {
		const root = tmp("run-guard");
		roots.push(root);
		const home = join(root, "home");
		const bin = join(root, "bin");
		mkdirSync(join(home, ".agent-system-2"), { recursive: true });
		mkdirSync(bin);
		// PATH is this dir alone, so ps is only ever the one a test writes here; df is the ledger's locality check (ledger/src/locality.ts).
		symlinkSync(Bun.which("df")!, join(bin, "df"));
		const ledgerPath = join(home, ".agent-system-2", "ledger.db");
		const l = Ledger.open(ledgerPath, { create: true, backup: false, backupOnOpen: false });
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "run guard probe", stakes: "normal", mode: "autonomous" });
		const res = l.reserveLane(wl, { by: LANE_STARTER_BY, cap: 3, leaseMs: 60_000, requestedBy: "test", decide: () => ({ launch: true, cause: "first" }) });
		if (!res.ok) throw new Error(res.reason);
		l.recordEntry({ by: LANE_RUNNER_BY, workloadId: wl, kind: "assumption", body: laneStartedBody(res.laneId, { pid: 101, start, session: null, argv: ["--mode", "rpc"], runnerPid: 201 }) });
		l.close();
		return { wl, laneId: res.laneId, ledgerPath, bin, env: { PATH: bin, HOME: home, AGENT_SYSTEM_LEDGER_DB: ledgerPath } };
	}
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

	test("ps answering with an error (exit 2) on the recorded omp: exit 7 (held), one stderr line naming the failure, the ledger untouched", () => {
		const f = fixture(START);
		writeFileSync(join(f.bin, "ps"), "#!/bin/sh\necho 'ps (stand-in): kinfo_proc layout moved' >&2\nexit 2\n");
		chmodSync(join(f.bin, "ps"), 0o755);
		const before = state(f.ledgerPath, f.wl);
		const r = run(f);
		expect(r.code).toBe(STARTER_EXIT.held!);
		expect(r.out).toBe("");
		expect(r.err).toBe(`lane run: ${f.laneId} not started: inspecting the recorded omp pid 101 failed (ps -p 101 -o stat=,lstart= exited 2: ps (stand-in): kinfo_proc layout moved); nothing was written, retryable once ps can answer\n`);
		// no lane-exit:, no launch-failed:, no release: the reservation and the entries are exactly as before
		expect(state(f.ledgerPath, f.wl)).toEqual(before);
		expect(before.workload!.holder).toBe(f.laneId);
	});

	test("no ps on PATH (it cannot be spawned), and no start time recorded for the omp: the runner check fails the same way", () => {
		const f = fixture("");
		const before = state(f.ledgerPath, f.wl);
		const r = run(f);
		expect(r.code).toBe(STARTER_EXIT.held!);
		expect(r.err).toMatch(new RegExp(`^lane run: ${f.laneId} not started: inspecting the recorded runner pid 201 failed \\(.+\\); nothing was written, retryable once ps can answer\\n$`));
		expect(state(f.ledgerPath, f.wl)).toEqual(before);
	});
});
