// The run guard (MIGRATION.md item 105, fault 5 `duplicate-lane-runner`; Jo's "fix", in-mv4sw21wvysh6o): `liveRunnerOf`
// decides, from the ledger's lane-started:/lane-exit: entries and a fake probe, whether a second `lane.ts run` on a lane
// id must refuse; `isRunnerCommand` is the runner's identity check on a ps command line. Pure: no ledger, no ps.
import { describe, expect, test } from "bun:test";
import { type EntryRow, LANE_RUNNER_BY, LANE_STARTER_BY } from "../../ledger/src/index";
import { controlEntries, laneExitBody, laneStartedBody } from "../src/launch";
import { isRunnerCommand, liveRunnerOf, type PidState, type RunnerProbe } from "../scripts/lane";

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

	test("no recorded start time (unknown) never refuses on the omp alone", () => {
		expect(decide([started(LANE, 101, 201, "")], probe({ 101: "unknown" }))).toBeNull();
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
