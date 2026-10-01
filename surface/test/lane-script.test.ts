// The lane script against the fake omp (DESIGN-lane-launcher.md § 8 "Fake-omp shim unit tests",
// "the runner against the shim"): surface/test/fake-omp.ts sits on PATH as `omp` ahead of the real
// binary, speaks the 18.4.4 rpc frames and runs the real lane rows in-process, so every subcommand
// of surface/scripts/lane.ts (launch, run, stop, cleanup, log) is exercised as the processes it
// really is, on a temp HOME, a temp ledger and a temp git repo. The Codex-review regressions the
// runner owns are here: readiness is the lane's own claim (B1), the runner finalizes once on any
// exit including a thrown exception after the reservation (B3), a stop persists its acceptance
// then abort → stdin EOF → bounded SIGKILL (B4), and every exit is classified with a requested stop
// never writing lane-died:.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANE_RUNNER_BY, LANE_STARTER_BY, Ledger, type QuestionRow } from "../../ledger/src/index";
import { ceilingBody, CEILING_OPTIONS, parseSpend } from "../src/ceiling";
import { recordRepo } from "../src/decision-log";
import { branchName, type ControlEntry, doneBody, laneDir, laneExit, laneExitBody, laneStarted, laneStopAcceptedBody, laneStopRequestBody, STARTER_EXIT, worktreePath } from "../src/launch";
import { SURFACE_BY } from "../src/types";
import { alive, type FakeScript, fakeRecords, git, LANE_SCRIPT, laneIdOf, laneRoot, type LaneRoot, laneSnapshot, setScript, sh, until } from "./helpers";

const roots: LaneRoot[] = [];
const makeRoot = (over: Record<string, string> = {}): LaneRoot => {
	const r = laneRoot(over);
	roots.push(r);
	return r;
};
afterAll(() => {
	for (const r of roots) rmSync(r.root, { recursive: true, force: true });
});

const ledgerOf = (r: LaneRoot) => Ledger.open(r.ledgerPath, { backup: false, backupOnOpen: false });
/** An autonomous workload on the root's repo with its done: line and, when asked, one open slice. */
function openWorkload(r: LaneRoot, o: { slice?: boolean; brief?: string } = {}): { wl: string; sl: string | null } {
	const l = ledgerOf(r);
	try {
		const wl = l.openWorkload({ by: SURFACE_BY, brief: o.brief ?? "lane script probe", stakes: "normal", mode: "autonomous" });
		recordRepo(l, wl, r.repo);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the probe is done") });
		const sl = o.slice ? l.addSlice({ by: SURFACE_BY, workloadId: wl, task: "probe", doneCondition: "probed", inputs: "README.md" }) : null;
		return { wl, sl };
	} finally {
		l.close();
	}
}
const lane = (r: LaneRoot, args: string[], over: Record<string, string> = {}) => sh(["bun", LANE_SCRIPT, ...args], r.repo, { ...r.env, ...over });
const eventsOf = (r: LaneRoot, pid: number) => fakeRecords(r).filter((x) => x.pid === pid && x.event).map((x) => x.event!);
const exitOf = (r: LaneRoot, wl: string, laneId: string) => until(`lane-exit: of ${laneId}`, () => laneExit(laneSnapshot(r, wl).control, laneId));
const startedOf = (r: LaneRoot, wl: string, laneId: string) => until(`lane-started: of ${laneId}`, () => laneStarted(laneSnapshot(r, wl).control, laneId));
const readyOf = (r: LaneRoot, wl: string, laneId: string) => until(`lane-ready: of ${laneId}`, () => laneSnapshot(r, wl).control.find((c) => c.prefix === "lane-ready" && c.laneId === laneId));
/** Fault injection on the temp ledger only: a trigger that aborts the insert of an entry whose body starts with `prefix`. */
function failEntryInsert(r: LaneRoot, prefix: string, message: string): void {
	const db = new Database(r.ledgerPath);
	try {
		db.exec(`CREATE TRIGGER inject_failure BEFORE INSERT ON entries WHEN NEW.body LIKE '${prefix}%' BEGIN SELECT RAISE(ABORT, '${message}'); END;`);
	} finally {
		db.close();
	}
}

describe("lane script: launch, run, log, cleanup against the fake omp", () => {
	test("launch reserves and prints the lane and runner; the runner records start (twice: null then the session), ready after the lane's own claim, the prompt, completion, release and lane-exit: completed; a second launch while held is refused with nothing written", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r);
		setScript(r, { steps: [{ tool: "lane_record_entry", args: { body: "done-because: the probe is done" } }] });
		const launch = lane(r, ["launch", wl, "--requested-by", "test"]);
		expect(launch.code).toBe(STARTER_EXIT.ok);
		const m = /^lane (\S+) runner (\d+)$/.exec(launch.out);
		expect(m).not.toBeNull();
		const laneId = laneIdOf(wl, 1);
		expect(m![1]).toBe(laneId);
		const runnerPid = Number(m![2]);
		// held under the pre-claim: a second starter is refused `held` and writes nothing. Only the starter's rows are counted:
		// the runner is live and writes its own lane-started: whenever its omp spawns, which can land inside this window.
		const starterRows = () => laneSnapshot(r, wl).bodies.filter((b) => b.startsWith(`${LANE_STARTER_BY} `)).length;
		const before = starterRows();
		const again = lane(r, ["launch", wl, "--requested-by", "test"]);
		expect(again.code).toBe(STARTER_EXIT.held);
		expect(again.err).toContain("not launched: held");
		expect(starterRows()).toBe(before);

		const exit = await exitOf(r, wl, laneId);
		expect(exit).toMatchObject({ code: "0", signal: "-", outcome: "completed" });
		const snap = laneSnapshot(r, wl);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toEqual([]);
		// the runner's two start records: the first with session null, the second with the session get_state returned
		const starts = snap.control.filter((c) => c.prefix === "lane-started" && c.laneId === laneId);
		expect(starts.map((s) => s.createdBy)).toEqual([LANE_RUNNER_BY, LANE_RUNNER_BY]);
		const parsed = starts.map((s) => JSON.parse(s.rest) as { pid: number; session: string | null; argv: string[]; runnerPid: number; start: string });
		expect(parsed[0]!.session).toBeNull();
		expect(parsed[1]!.session).not.toBeNull();
		expect(parsed[1]!.runnerPid).toBe(runnerPid);
		expect(parsed[1]!.start).not.toBe("");
		const [rec] = fakeRecords(r);
		expect(rec!.pid).toBe(parsed[1]!.pid);
		expect(rec!.session).toBe(parsed[1]!.session!);
		// argv exactly as laneArgv renders it (--max-time: the normal stakes ceiling's 360 min, none used yet, plus the 10 min margin);
		// env carries the binding with the profile, never the orchestrator role
		const worktree = worktreePath(r.repo, wl);
		expect(rec!.argv).toEqual(["--mode", "rpc", "--no-ui", "--cwd", worktree, "--session-dir", join(laneDir(wl, r.home), "sessions"), "--append-system-prompt", join(laneDir(wl, r.home), "system.md"), "--max-time", "370m"]);
		expect(rec!.cwd).toBe(worktree);
		expect(rec!.env).toMatchObject({ AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: laneId, OMP_PROFILE: "agent-system-2" });
		// readiness (B1): the ready line lands after the lane's claim (changed_by = the lane), then the one prompt; the final spend: before the exit
		const order = snap.control.filter((c) => c.laneId === laneId).map((c) => c.prefix);
		expect(order).toEqual(["launch", "lane-started", "lane-started", "lane-ready", "spend", "lane-exit"]);
		expect(eventsOf(r, rec!.pid)).toEqual(["prompt", "eof"]);
		expect(readFileSync(rec!.session!, "utf8")).toContain(`You are lane ${laneId} on workload ${wl}.`);
		expect(snap.bodies).toContain(`${laneId} done-because: the probe is done`);
		// the worktree and branch the starter recorded exist
		expect(snap.bodies).toContain(`${LANE_STARTER_BY} worktree: ${worktree}`);
		expect(snap.bodies).toContain(`${LANE_STARTER_BY} branch: ${branchName(wl)} base origin/main ${git(r.repo, ["rev-parse", "origin/main"]).out}`);
		expect(git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"]).out).toBe(branchName(wl));
		await until("runner gone", () => !alive(runnerPid), 10_000);

		// log prints the runner log path and its tail
		const log = lane(r, ["log", wl]);
		expect(log.code).toBe(0);
		expect(log.out.split("\n")[0]).toBe(join(laneDir(wl, r.home), "runner.log"));

		// cleanup: refused with no upstream, then with unpushed commits; removes the worktree once pushed; the branch stays
		const noUpstream = lane(r, ["cleanup", wl]);
		expect(noUpstream.code).toBe(1);
		expect(noUpstream.err).toContain("no upstream; push it first");
		expect(git(worktree, ["push", "-q", "-u", "origin", branchName(wl)]).code).toBe(0);
		writeFileSync(join(worktree, "x.txt"), "x\n");
		git(worktree, ["add", "x.txt"]);
		git(worktree, ["commit", "-q", "-m", "x"]);
		const unpushed = lane(r, ["cleanup", wl]);
		expect(unpushed.code).toBe(1);
		expect(unpushed.err).toContain("unpushed commits");
		expect(git(worktree, ["push", "-q"]).code).toBe(0);
		const clean = lane(r, ["cleanup", wl]);
		expect(clean.code).toBe(0);
		expect(clean.out).toContain(`removed worktree ${worktree}`);
		expect(existsSync(worktree)).toBe(false);
		expect(git(r.repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branchName(wl)}`]).code).toBe(0);
		const none = lane(r, ["cleanup", wl]);
		expect(none.code).toBe(0);
		expect(none.out).toContain("no worktree at");
	}, 60_000);

	test("parked: an open question parks the lane (lane-parked: with the session), the shutdown writes no lane-died:; the answer relaunches with --resume of that session and the fake continues the recorded conversation; the stale request after the park is refused (predicate: resume consumed once)", async () => {
		const r = makeRoot();
		const { wl, sl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ tool: "lane_raise_question", args: { slice: sl, body: "push now?", options: ["yes", "no"] } }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const lane1 = laneIdOf(wl, 1);
		const exit1 = await exitOf(r, wl, lane1);
		expect(exit1).toMatchObject({ code: "0", signal: "-", outcome: "parked" });
		const snap1 = laneSnapshot(r, wl);
		expect(snap1.workload!.holder).toBeNull();
		expect(snap1.deaths).toEqual([]);
		const parked = snap1.control.find((c) => c.prefix === "lane-parked" && c.laneId === lane1)!;
		const session1 = fakeRecords(r)[0]!.session!;
		expect(parked.rest).toBe(`questions ${snap1.questions[0]!.id} session ${session1}`);
		// no new cause: a launch by hand is refused (died-not-relaunched) with nothing written
		const stale = lane(r, ["launch", wl, "--requested-by", "test"]);
		expect(stale.code).toBe(STARTER_EXIT["not-launchable"]);
		expect(stale.err).toContain("died-not-relaunched");

		const l = ledgerOf(r);
		l.answerQuestion(snap1.questions[0]!.id, { by: SURFACE_BY, answer: "yes", author: "jo", channel: "surface" });
		l.close();
		setScript(r, { steps: [{ tool: "lane_complete_slice", args: { slice: sl, artifact: "done" } }, { tool: "lane_record_entry", args: { body: "done-because: the probe is done" } }] });
		const relaunch = lane(r, ["launch", wl, "--requested-by", "test"]);
		expect(relaunch.code).toBe(0);
		const lane2 = laneIdOf(wl, 2);
		const exit2 = await exitOf(r, wl, lane2);
		expect(exit2.outcome).toBe("completed");
		const snap2 = laneSnapshot(r, wl);
		expect(snap2.bodies.some((b) => b.startsWith(`${LANE_STARTER_BY} launch: ${lane2} cause resume `))).toBe(true);
		const rec2 = fakeRecords(r).filter((x) => x.argv)[1]!;
		expect(rec2.argv!.slice(-2)).toEqual(["--resume", session1]);
		expect(rec2.resumed).toBe(session1);
		const conversation = readFileSync(rec2.session!, "utf8");
		expect(conversation).toContain(`You are lane ${lane1} on workload ${wl}.`);
		expect(conversation).toContain(`"from":${JSON.stringify(session1)}`);
		// the resume prompt leads with the answer
		expect(conversation).toMatch(/"type":"message","role":"user","text":"[^"]*yes/);
		expect(snap2.slices[0]!.state).toBe("done");
		expect(snap2.workload!.holder).toBeNull();
		expect(snap2.deaths).toEqual([]);
	}, 60_000);

	test("resume-pending: the answer lands before the park, so the runner's outcome is resume-pending and the tick relaunches once with cause resume", async () => {
		const r = makeRoot();
		const { wl, sl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ tool: "lane_raise_question", args: { slice: sl, body: "q?", options: ["a", "b"] } }, { sleepMs: 2500 }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const lane1 = laneIdOf(wl, 1);
		const q = await until("question", () => laneSnapshot(r, wl).questions[0]);
		const l = ledgerOf(r);
		l.answerQuestion(q.id, { by: SURFACE_BY, answer: "a", author: "jo", channel: "surface" });
		l.close();
		const exit1 = await exitOf(r, wl, lane1);
		expect(exit1.outcome).toBe("resume-pending");
		expect(laneSnapshot(r, wl).deaths).toEqual([]);
		setScript(r, { steps: [{ tool: "lane_complete_slice", args: { slice: sl, artifact: "done" } }] });
		expect(lane(r, ["launch", wl, "--requested-by", "tick"]).code).toBe(0);
		const lane2 = laneIdOf(wl, 2);
		await exitOf(r, wl, lane2);
		const snap = laneSnapshot(r, wl);
		expect(snap.bodies.filter((b) => b.startsWith(`${LANE_STARTER_BY} launch: `)).map((b) => b.split(" ")[4])).toEqual(["first", "resume"]);
		expect(fakeRecords(r).filter((x) => x.argv)[1]!.resumed).toBe(fakeRecords(r)[0]!.session!);
		expect(lane(r, ["launch", wl, "--requested-by", "tick"]).code).toBe(STARTER_EXIT["not-launchable"]);
	}, 60_000);
});

describe("lane script: every exit is classified (decision 14; Codex review B1, B2, B3, B4)", () => {
	test("B1 never-claims: valid rpc frames without the lane's claim → SIGKILL at the readiness window, launch-failed: + lane-died:, lease released, no prompt sent", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r);
		setScript(r, { claim: false, steps: [] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		const t0 = Date.now();
		const exit = await exitOf(r, wl, laneId);
		expect(Date.now() - t0).toBeLessThan(20_000);
		expect(exit).toMatchObject({ signal: "SIGKILL", outcome: "never-ready" });
		const snap = laneSnapshot(r, wl);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toEqual([`lane-died: ${laneId}: launch failed at readiness: no claim in 4s`]);
		expect(snap.bodies.some((b) => b.startsWith(`${LANE_RUNNER_BY} launch-failed: ${laneId} readiness: never ready in 4s`))).toBe(true);
		// Codex review 2 R4: the runner's readiness failure is a valid control entry, not only a raw body
		expect(snap.control.filter((c) => c.prefix === "launch-failed" && c.laneId === laneId).map((c) => c.createdBy)).toEqual([LANE_RUNNER_BY]);
		expect(snap.control.some((c) => c.prefix === "lane-ready")).toBe(false);
		const [rec] = fakeRecords(r);
		expect(eventsOf(r, rec!.pid)).toEqual([]);
		expect(readFileSync(rec!.session!, "utf8")).not.toContain("You are lane");
		// the pre-claim was never renewed: the lease the starter set is the one the row still shows (lapsed or cleared), and changed_by never became the lane
		expect(snap.workload!.changed_by).not.toBe(laneId);
	}, 30_000);

	test("B3 before the spawn: the runner fails in prepare (no repo: entry) → launch-failed: + lane-died: from the starter path, released, exit repo-or-fence", async () => {
		const r = makeRoot();
		const l = ledgerOf(r);
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "no repo", stakes: "normal", mode: "autonomous" });
		const res = l.reserveLane(wl, { by: LANE_STARTER_BY, cap: 3, leaseMs: 60_000, requestedBy: "test", decide: () => ({ launch: true, cause: "first" }) });
		l.close();
		if (!res.ok) throw new Error(res.reason);
		const run = lane(r, ["run", wl, res.laneId]);
		expect(run.code).toBe(STARTER_EXIT["repo-or-fence"]);
		const snap = laneSnapshot(r, wl);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toEqual([`lane-died: ${res.laneId}: launch failed at preflight: workload ${wl} records no repository`]);
		expect(snap.bodies).toContain(`${LANE_STARTER_BY} launch-failed: ${res.laneId} preflight: workload ${wl} records no repository`);
		expect(fakeRecords(r)).toEqual([]);
	}, 30_000);

	test("B3 after the spawn: a thrown exception in the read loop (the lane dir removed under the runner) kills omp and finalizes once: lane-died:, released, one lane-exit:", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ sleepMs: 2000 }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		await readyOf(r, wl, laneId);
		const started = (await startedOf(r, wl, laneId))!;
		rmSync(laneDir(wl, r.home), { recursive: true, force: true });
		const exit = await exitOf(r, wl, laneId);
		expect(exit).toMatchObject({ signal: "SIGKILL", outcome: "died" });
		const snap = laneSnapshot(r, wl);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toEqual([`lane-died: ${laneId}: died (signal SIGKILL)`]);
		expect(snap.control.filter((c) => c.prefix === "lane-exit" && c.laneId === laneId)).toHaveLength(1);
		await until("runner gone", () => !alive(started.runnerPid), 10_000);
		expect(alive(started.pid)).toBe(false);
	}, 30_000);

	test("R2 (review 2): the lane claims but the runner's lane-ready: write fails → no prompt, no renewal: omp is killed and the runner finalizes once (launch-failed: naming the failure, lane-died:, released, lane-exit: never-ready)", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		failEntryInsert(r, "lane-ready:", "injected ready write failure");
		setScript(r, { steps: [{ hang: true }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		const started = (await startedOf(r, wl, laneId))!;
		const exit = await until(`lane-exit: of ${laneId}`, () => laneExit(laneSnapshot(r, wl).control, laneId), 15_000);
		expect(exit).toMatchObject({ signal: "SIGKILL", outcome: "never-ready" });
		const snap = laneSnapshot(r, wl);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toHaveLength(1);
		expect(snap.deaths[0]).toMatch(new RegExp(`^lane-died: ${laneId}: launch failed at readiness: .*injected ready write failure`));
		const failed = snap.control.filter((c) => c.prefix === "launch-failed" && c.laneId === laneId);
		expect(failed).toHaveLength(1);
		expect(failed[0]!.rest).toMatch(/^readiness: .*injected ready write failure/);
		expect(snap.control.filter((c) => c.prefix === "lane-exit" && c.laneId === laneId)).toHaveLength(1);
		expect(eventsOf(r, started.pid)).toEqual([]);
		await until("runner gone", () => !alive(started.runnerPid), 10_000);
		expect(alive(started.pid)).toBe(false);
	}, 40_000);

	test("died: omp exits mid-prompt with no prompt_result → lane-died: (exit code kept), released; SIGKILLed from outside → lane-died: within 5 s", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ exit: 3 }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const lane1 = laneIdOf(wl, 1);
		const exit1 = await exitOf(r, wl, lane1);
		expect(exit1).toMatchObject({ code: "3", signal: "-", outcome: "died" });
		expect(laneSnapshot(r, wl).deaths).toEqual([`lane-died: ${lane1}: died (exit 3)`]);
		expect(laneSnapshot(r, wl).workload!.holder).toBeNull();

		// a relaunch needs a cause: the request
		const l = ledgerOf(r);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: `launch-requested: by jo at ${l.now()}` });
		l.close();
		setScript(r, { steps: [{ hang: true }] });
		expect(lane(r, ["launch", wl, "--requested-by", "jo"]).code).toBe(0);
		const lane2 = laneIdOf(wl, 2);
		await readyOf(r, wl, lane2);
		const started = (await startedOf(r, wl, lane2))!;
		const t0 = Date.now();
		process.kill(started.pid, "SIGKILL");
		const exit2 = await exitOf(r, wl, lane2);
		expect(Date.now() - t0).toBeLessThan(5_000);
		expect(exit2).toMatchObject({ signal: "SIGKILL", outcome: "died" });
		const snap = laneSnapshot(r, wl);
		expect(snap.deaths).toEqual([`lane-died: ${lane1}: died (exit 3)`, `lane-died: ${lane2}: died (signal SIGKILL)`]);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.bodies.filter((b) => b.startsWith(`${LANE_STARTER_BY} launch: `)).map((b) => b.split(" ")[4])).toEqual(["first", "request"]);
	}, 40_000);

	test("B4 stop from the ledger: acceptance persisted, then abort → stdin EOF → SIGKILL after the grace when omp ignores both; outcome stop, no lane-died:, released", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ hang: true }], ignoreAbort: true, ignoreEof: true });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		await readyOf(r, wl, laneId);
		const started = (await startedOf(r, wl, laneId))!;
		const t0 = Date.now();
		const stop = lane(r, ["stop", wl]);
		const ms = Date.now() - t0;
		expect(stop.code).toBe(0);
		expect(stop.out).toContain(`stop requested of ${laneId}`);
		expect(stop.out).toContain(`${laneId} exited`);
		const snap = laneSnapshot(r, wl);
		const exit = laneExit(snap.control, laneId)!;
		// Codex review 2 R6: the exit carries the accepted request's reason
		expect(exit).toMatchObject({ signal: "SIGKILL", outcome: "stop", reason: "as2-lane-stop" });
		expect(snap.deaths).toEqual([]);
		expect(snap.workload!.holder).toBeNull();
		// the request (starter) then the acceptance (runner) naming it, both before the final spend: and the exit
		const stops = snap.control.filter((c) => c.prefix === "lane-stop" && c.laneId === laneId);
		expect(stops.map((s) => s.createdBy)).toEqual([LANE_STARTER_BY, LANE_RUNNER_BY]);
		expect(stops[1]!.rest).toBe(`accepted ${stops[0]!.id}`);
		expect(snap.control.map((c) => c.prefix).slice(-4)).toEqual(["lane-stop", "lane-stop", "spend", "lane-exit"]);
		// abort, then EOF, then the kill: omp saw both frames and outlived them until the grace ran out
		expect(eventsOf(r, started.pid)).toEqual(["prompt", "abort", "eof"]);
		expect(ms).toBeGreaterThanOrEqual(1500);
		expect(ms).toBeLessThan(20_000);
		expect(alive(started.pid)).toBe(false);
	}, 40_000);

	test("B4 stop from a signal: SIGTERM to the runner persists `accepted signal`, abort ends the prompt, outcome stop, no lane-died:", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ hang: true }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		await readyOf(r, wl, laneId);
		const started = (await startedOf(r, wl, laneId))!;
		process.kill(started.runnerPid, "SIGTERM");
		const exit = await exitOf(r, wl, laneId);
		expect(exit).toMatchObject({ code: "0", signal: "-", outcome: "stop", reason: "signal" });
		const snap = laneSnapshot(r, wl);
		expect(snap.deaths).toEqual([]);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.bodies).toContain(`${LANE_RUNNER_BY} lane-stop: ${laneId} accepted signal`);
		expect(eventsOf(r, started.pid)).toEqual(["prompt", "abort", "eof"]);
	}, 30_000);

	test("R5 (review 2): the session record that lands after an accepted stop keeps the stop intended — the shutdown with a slice open writes no lane-died:", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		// get_state answers only when the abort arrives and the shutdown waits after EOF: the runner's lane-started: with the
		// session follows its acceptance and lands before the lane row's shutdown classifies the exit
		setScript(r, { steps: [{ hang: true }], stateOnAbort: true, eofDelayMs: 700 });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		await readyOf(r, wl, laneId);
		const l = ledgerOf(r);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: laneStopRequestBody(laneId, "mode-flip", "jo") });
		l.close();
		const exit = await exitOf(r, wl, laneId);
		// Codex review 2 R6: decision 6's receipt, `outcome stop reason mode-flip`
		expect(exit).toMatchObject({ outcome: "stop", reason: "mode-flip" });
		const snap = laneSnapshot(r, wl);
		const mine = snap.control.filter((c) => c.laneId === laneId);
		const accepted = mine.findIndex((c) => c.prefix === "lane-stop" && c.rest.startsWith("accepted"));
		const withSession = mine.findIndex((c) => c.prefix === "lane-started" && !c.rest.includes('"session":null'));
		expect(accepted).toBeGreaterThanOrEqual(0);
		expect(withSession).toBeGreaterThan(accepted);
		expect(snap.deaths).toEqual([]);
		expect(snap.workload!.holder).toBeNull();
	}, 30_000);

	test("stop with no runner alive: the starter accepts the request itself, signals omp only when the pid's start time matches, releases, writes lane-exit: stop reason by-hand", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ hang: true }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		await readyOf(r, wl, laneId);
		const started = (await startedOf(r, wl, laneId))!;
		process.kill(started.runnerPid, "SIGKILL");
		await until("runner gone", () => !alive(started.runnerPid), 10_000);
		// omp lives on with EOF on its stdin: the fake shuts down at EOF, releasing through the lane row
		await until("omp gone", () => !alive(started.pid), 10_000);
		const stop = lane(r, ["stop", wl]);
		expect(stop.code).toBe(0);
		expect(stop.out).toContain(`omp pid ${started.pid} is gone`);
		const snap = laneSnapshot(r, wl);
		expect(laneExit(snap.control, laneId)).toMatchObject({ code: "-", signal: "-", outcome: "stop", reason: "by-hand" });
		expect(snap.workload!.holder).toBeNull();
		expect(snap.bodies).toContain(`${LANE_STARTER_BY} lane-stop: ${laneId} requested as2-lane-stop by jo`);
	}, 30_000);

	test("R1 (review 2): stop with no runner and an omp that survives SIGTERM → the stop escalates to SIGKILL on the same verified process and releases only after it is gone", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ hang: true }], ignoreEof: true, ignoreTerm: true });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		await readyOf(r, wl, laneId);
		const started = (await startedOf(r, wl, laneId))!;
		process.kill(started.runnerPid, "SIGKILL");
		await until("runner gone", () => !alive(started.runnerPid), 10_000);
		expect(alive(started.pid)).toBe(true);
		const stop = lane(r, ["stop", wl]);
		// the moment the stop returns (its release and exit already written), the omp it stopped is gone
		const ompAlive = alive(started.pid);
		if (ompAlive) process.kill(started.pid, "SIGKILL");
		expect(ompAlive).toBe(false);
		expect(stop.code).toBe(0);
		expect(eventsOf(r, started.pid)).toContain("sigterm");
		const snap = laneSnapshot(r, wl);
		expect(laneExit(snap.control, laneId)).toMatchObject({ outcome: "stop", reason: "by-hand" });
		expect(snap.control.filter((c) => c.prefix === "lane-exit" && c.laneId === laneId)).toHaveLength(1);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toEqual([]);
	}, 30_000);

	test("interactive (B5): the wrapper records omp's pid; a stop accepted by hand while the TUI runs (its exit and release written, omp signalled) leaves one lane-exit: for the lane, the by-hand one, not a second from the wrapper", async () => {
		const r = makeRoot();
		const l = ledgerOf(r);
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "interactive by-hand stop probe", stakes: "normal", mode: "user-driven" });
		recordRepo(l, wl, r.repo);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the probe is done") });
		l.close();
		setScript(r, { steps: [{ hang: true }] });
		// The TUI's stdio is inherited from the wrapper: a pipe held open stands in for Jo's terminal.
		const tui = Bun.spawn(["bun", LANE_SCRIPT, "interactive", wl], { cwd: r.repo, env: r.env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
		const laneId = laneIdOf(wl, 1);
		const started = (await startedOf(r, wl, laneId))!;
		expect(started.pid).not.toBe(tui.pid);
		expect(started.runnerPid).toBe(tui.pid);
		await until("the lane's own claim", () => laneSnapshot(r, wl).workload?.changed_by === laneId);
		// What `lane.ts stop` leaves after its wait for a runner that is not there: acceptance, release, the by-hand exit, SIGTERM to omp.
		const l2 = ledgerOf(r);
		const req = l2.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStopRequestBody(laneId, "as2-lane-stop", "jo") });
		l2.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStopAcceptedBody(laneId, req) });
		expect(l2.releaseWorkload(wl, { by: LANE_STARTER_BY, holder: laneId }).released).toBe(true);
		l2.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneExitBody(laneId, { code: null, signal: null, outcome: "stop", reason: "by-hand" }) });
		l2.close();
		process.kill(started.pid, "SIGTERM");
		const code = await tui.exited;
		tui.stdin.end();
		expect(code).toBe(0);
		const snap = laneSnapshot(r, wl);
		expect(snap.bodies.filter((b) => b.includes(`lane-exit: ${laneId} `))).toEqual([`${LANE_STARTER_BY} ${laneExitBody(laneId, { code: null, signal: null, outcome: "stop", reason: "by-hand" })}`]);
		expect(laneExit(snap.control, laneId)).toMatchObject({ outcome: "stop", reason: "by-hand" });
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toEqual([]);
	}, 30_000);

	test("R1 (review 2), interactive: a by-hand stop accepted but not yet finalized (it waits to see omp gone) → the wrapper writes the one exit as outcome stop reason by-hand with omp's real code, and releases", async () => {
		const r = makeRoot();
		const l = ledgerOf(r);
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "interactive accepted stop probe", stakes: "normal", mode: "user-driven" });
		recordRepo(l, wl, r.repo);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the probe is done") });
		l.close();
		setScript(r, { steps: [{ hang: true }] });
		const tui = Bun.spawn(["bun", LANE_SCRIPT, "interactive", wl], { cwd: r.repo, env: r.env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
		const laneId = laneIdOf(wl, 1);
		const started = (await startedOf(r, wl, laneId))!;
		await until("the lane's own claim", () => laneSnapshot(r, wl).workload?.changed_by === laneId);
		// `lane.ts stop` state at the moment it signals: request and acceptance written, no release, no exit yet.
		const l2 = ledgerOf(r);
		const req = l2.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStopRequestBody(laneId, "as2-lane-stop", "jo") });
		l2.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStopAcceptedBody(laneId, req) });
		l2.close();
		process.kill(started.pid, "SIGTERM");
		await tui.exited;
		tui.stdin.end();
		const snap = laneSnapshot(r, wl);
		expect(snap.control.filter((c) => c.prefix === "lane-exit" && c.laneId === laneId)).toHaveLength(1);
		expect(laneExit(snap.control, laneId)).toMatchObject({ code: "0", outcome: "stop", reason: "by-hand" });
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toEqual([]);
	}, 30_000);

	test("R3 (review 2): interactive, the first lane-started: write fails after the spawn → the wrapper terminates and reaps omp before it records the failure and releases; no omp outlives it", async () => {
		const r = makeRoot();
		const l = ledgerOf(r);
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "interactive post-spawn failure probe", stakes: "normal", mode: "user-driven" });
		recordRepo(l, wl, r.repo);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the probe is done") });
		l.close();
		failEntryInsert(r, "lane-started:", "injected start write failure");
		setScript(r, { steps: [{ hang: true }] });
		// A pipe held open stands in for Jo's terminal: omp's stdin never reaches EOF while the test holds it.
		const tui = Bun.spawn(["bun", LANE_SCRIPT, "interactive", wl], { cwd: r.repo, env: r.env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
		const laneId = laneIdOf(wl, 1);
		const code = await tui.exited;
		// anything still running with this root on its command line is an omp the wrapper left behind
		const leftover = sh(["pgrep", "-f", r.root], r.root).out;
		sh(["pkill", "-f", r.root], r.root);
		tui.stdin.end();
		expect(code).toBe(STARTER_EXIT.unknown!);
		expect(leftover).toBe("");
		const snap = laneSnapshot(r, wl);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.bodies.some((b) => b.startsWith(`${LANE_STARTER_BY} launch-failed: ${laneId} interactive: `) && b.includes("injected start write failure"))).toBe(true);
		expect(snap.deaths).toHaveLength(1);
	}, 40_000);

	test("deadline: --max-time from AGENT_SYSTEM_LANE_MAX_TIME reaches omp's argv; the aborted prompt_result past it is outcome deadline; the open slice makes it a death (one lane-died:), released", async () => {
		const r = makeRoot({ AGENT_SYSTEM_LANE_MAX_TIME: "2s" });
		const { wl } = openWorkload(r, { slice: true });
		setScript(r, { steps: [{ hang: true }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		const exit = await exitOf(r, wl, laneId);
		expect(exit).toMatchObject({ code: "0", signal: "-", outcome: "deadline" });
		const snap = laneSnapshot(r, wl);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.deaths).toHaveLength(1);
		expect(snap.deaths[0]).toMatch(new RegExp(`^lane-died: ${laneId}: (deadline 2s with 1 open slice\\(s\\)|session shutdown at .* with 1 open slice\\(s\\))$`));
		const [rec] = fakeRecords(r);
		expect(rec!.argv!.slice(-2)).toEqual(["--max-time", "2s"]);
	}, 30_000);

	for (const status of ["aborted", "error"]) {
		test(`${status}: a prompt_result with that status before the deadline keeps it as the outcome; with a slice open it is a death (the lane row's, once), released`, async () => {
			const r = makeRoot();
			const { wl } = openWorkload(r, { slice: true });
			setScript(r, { steps: [{ result: status }] });
			expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
			const laneId = laneIdOf(wl, 1);
			const exit = await exitOf(r, wl, laneId);
			expect(exit).toMatchObject({ code: "0", signal: "-", outcome: status });
			const snap = laneSnapshot(r, wl);
			expect(snap.workload!.holder).toBeNull();
			expect(snap.deaths).toHaveLength(1);
			expect(snap.deaths[0]).toMatch(new RegExp(`^lane-died: ${laneId}: session shutdown at .* with 1 open slice\\(s\\)$`));
		}, 30_000);
	}

	test("a runner's finalization is idempotent across the two writers: the lane row's shutdown death lands first and the runner writes no second lane-died:", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		// the fake shuts down on SIGTERM without the runner: shutdown → lane row's lane-died: (slice open, no intended entry) → release; then the runner sees the exit
		setScript(r, { steps: [{ hang: true }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		await readyOf(r, wl, laneId);
		const started = (await startedOf(r, wl, laneId))!;
		process.kill(started.pid, "SIGTERM");
		const exit = await exitOf(r, wl, laneId);
		expect(exit.outcome).toBe("released");
		const snap = laneSnapshot(r, wl);
		expect(snap.deaths).toHaveLength(1);
		expect(snap.deaths[0]).toMatch(new RegExp(`^lane-died: ${laneId}: session shutdown at .* with 1 open slice\\(s\\)$`));
		expect(snap.workload!.holder).toBeNull();
	}, 30_000);
});

describe("lane script: the worktree base is origin/<default>, local <default> only with no origin (Jo's unpushed commits never enter a lane branch)", () => {
	const commitIn = (repo: string, file: string): string => {
		writeFileSync(join(repo, file), `${file}\n`);
		for (const args of [["add", file], ["commit", "-q", "-m", file]]) expect(git(repo, args).code).toBe(0);
		return git(repo, ["rev-parse", "HEAD"]).out;
	};
	/** A commit on the remote the checkout has not fetched yet: made in a second clone and pushed from there. */
	const pushFromElsewhere = (r: LaneRoot): string => {
		const other = join(r.root, "other");
		expect(sh(["git", "clone", "-q", r.remote, other], r.root).code).toBe(0);
		for (const args of [["config", "user.email", "o@example.invalid"], ["config", "user.name", "o"]]) git(other, args);
		const sha = commitIn(other, "remote.txt");
		expect(git(other, ["push", "-q", "origin", "main"]).code).toBe(0);
		return sha;
	};
	/** Launch a lane that finishes at once; the starter's branch entry and the worktree's HEAD. */
	const launchAndRead = async (r: LaneRoot) => {
		const { wl } = openWorkload(r);
		setScript(r, { steps: [{ tool: "lane_record_entry", args: { body: "done-because: the probe is done" } }] });
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(STARTER_EXIT.ok);
		await exitOf(r, wl, laneIdOf(wl, 1));
		const branch = laneSnapshot(r, wl).bodies.find((b) => b.startsWith(`${LANE_STARTER_BY} branch: `))!;
		return { branch, head: git(worktreePath(r.repo, wl), ["rev-parse", "HEAD"]).out, wl };
	};

	/** Exit code of `git merge-base --is-ancestor`: 0 when `older` is in `newer`'s history, 1 when it is not. */
	const isAncestor = (repo: string, older: string, newer: string): number => git(repo, ["merge-base", "--is-ancestor", older, newer]).code;

	test("local ahead of origin (an unpushed commit): the branch is cut from origin/main, local main is untouched and its commit is not in the lane branch", async () => {
		const r = makeRoot();
		const remote = git(r.repo, ["rev-parse", "origin/main"]).out;
		const local = commitIn(r.repo, "local.txt");
		const { branch, head, wl } = await launchAndRead(r);
		expect(branch).toBe(`${LANE_STARTER_BY} branch: ${branchName(wl)} base origin/main ${remote}`);
		expect(head).toBe(remote);
		expect(git(r.repo, ["rev-parse", "main"]).out).toBe(local);
		expect(isAncestor(r.repo, local, branchName(wl))).toBe(1);
	}, 60_000);

	test("origin ahead of local (pushed from elsewhere): the starter fetches and cuts from origin/main; local main is untouched and the lane branch has no upstream", async () => {
		const r = makeRoot();
		const before = git(r.repo, ["rev-parse", "main"]).out;
		const remote = pushFromElsewhere(r);
		const { branch, head, wl } = await launchAndRead(r);
		expect(branch).toBe(`${LANE_STARTER_BY} branch: ${branchName(wl)} base origin/main ${remote}`);
		expect(head).toBe(remote);
		expect(git(r.repo, ["rev-parse", "main"]).out).toBe(before);
		expect(git(r.repo, ["rev-parse", "--abbrev-ref", `${branchName(wl)}@{upstream}`]).code).not.toBe(0);
	}, 60_000);

	test("origin advanced elsewhere and local main has an unpushed commit: the launch succeeds from origin/main, without the local commit", async () => {
		const r = makeRoot();
		const remote = pushFromElsewhere(r);
		const local = commitIn(r.repo, "local.txt");
		const { branch, head, wl } = await launchAndRead(r);
		expect(branch).toBe(`${LANE_STARTER_BY} branch: ${branchName(wl)} base origin/main ${remote}`);
		expect(head).toBe(remote);
		expect(git(r.repo, ["rev-parse", "main"]).out).toBe(local);
		expect(isAncestor(r.repo, local, branchName(wl))).toBe(1);
	}, 60_000);

	test("the fetch fails: the branch is cut from the origin/main already fetched, not local main, and the branch entry records the failure", async () => {
		const r = makeRoot();
		const remote = git(r.repo, ["rev-parse", "origin/main"]).out;
		const local = commitIn(r.repo, "local.txt");
		git(r.repo, ["remote", "set-url", "origin", join(r.root, "no-such-remote.git")]);
		const { branch, head, wl } = await launchAndRead(r);
		const [first, second] = branch.split("\n");
		expect(first).toBe(`${LANE_STARTER_BY} branch: ${branchName(wl)} base origin/main ${remote}`);
		expect(second).toMatch(/^fetch: failed \S/);
		expect(head).toBe(remote);
		expect(isAncestor(r.repo, local, branchName(wl))).toBe(1);
	}, 60_000);

	test("no origin at all: the branch is cut from local main, unpushed commit included, with no fetch line", async () => {
		const r = makeRoot();
		git(r.repo, ["remote", "remove", "origin"]);
		const local = commitIn(r.repo, "local.txt");
		const { branch, head, wl } = await launchAndRead(r);
		expect(branch).toBe(`${LANE_STARTER_BY} branch: ${branchName(wl)} base main ${local}`);
		expect(head).toBe(local);
	}, 60_000);
});

/** The fake's usage step (surface/test/fake-omp.ts header): one assistant message with this usage, in the session file or a hand's file under it. */
type MeterScriptStep = NonNullable<FakeScript["steps"]>[number] | { usage: { usd: number; tokens: number }; hand?: string };
const setMeterScript = (r: LaneRoot, steps: MeterScriptStep[]) => writeFileSync(r.script, JSON.stringify({ steps }));
/** A tiny ceiling, the way the open tool writes one: a `ceiling:` entry stamped orchestrator-surface. */
function tinyCeiling(r: LaneRoot, wl: string, usd: number): void {
	const l = ledgerOf(r);
	try {
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: ceilingBody({ usd, wallMin: 60 }, "test tiny ceiling") });
	} finally {
		l.close();
	}
}
const spendsOf = (control: readonly ControlEntry[], laneId: string) => control.filter((c) => c.prefix === "spend" && c.laneId === laneId).map((c) => parseSpend(c.rest)!);
const ceilingQuestionsOf = (questions: readonly QuestionRow[]) => questions.filter((q) => q.slice_id.startsWith("sl-ceiling-") && q.created_by === LANE_RUNNER_BY);

describe("lane script: the ceiling meter (DESIGN-workload-ceiling.md § 2 item 4)", () => {
	test("80 %: one question over two polls, the lane goes on and completes; finishing under the ceiling withdraws it (then cancel); the prompt carries the ceiling; the final spend: counts everything", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r);
		tinyCeiling(r, wl, 1);
		// two stop polls (STOP_POLL_MS 5 s) land inside the 11 s at 85 %
		setMeterScript(r, [
			{ usage: { usd: 0.85, tokens: 1000 } }, { sleepMs: 11_000 }, { usage: { usd: 0.05, tokens: 100 } },
			{ tool: "lane_record_entry", args: { body: "done-because: the probe is done" } },
		]);
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		const exit = await exitOf(r, wl, laneId);
		expect(exit).toMatchObject({ outcome: "completed" });
		const snap = laneSnapshot(r, wl);
		expect(snap.deaths).toEqual([]);
		const qs = ceilingQuestionsOf(snap.questions);
		expect(qs).toHaveLength(1);
		expect(JSON.parse(qs[0]!.options)).toEqual([...CEILING_OPTIONS]);
		expect(qs[0]!.state).toBe("withdrawn");
		expect(snap.slices.find((s) => s.id === qs[0]!.slice_id)!.state).toBe("cancelled");
		const spends = spendsOf(snap.control, laneId);
		expect(spends).toHaveLength(2);
		expect(spends[0]!.usd).toBeCloseTo(0.85, 4);
		expect(spends[1]).toMatchObject({ tokens: 1100 });
		expect(spends[1]!.usd).toBeCloseTo(0.9, 4);
		const [rec] = fakeRecords(r);
		expect(eventsOf(r, rec!.pid)).toEqual(["prompt", "eof"]);
		expect(readFileSync(rec!.session!, "utf8")).toContain("ceiling: $1 / 60 min for the workload; spent so far $0.00");
	}, 60_000);

	test("100 % unanswered (a jump past 80 % between polls): the question is raised with the stop, lane-stop: accepted ceiling, outcome stop reason ceiling, no lane-died: though a slice is open, released", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		tinyCeiling(r, wl, 1);
		setMeterScript(r, [{ usage: { usd: 1.2, tokens: 5000 } }, { hang: true }]);
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		const exit = await exitOf(r, wl, laneId);
		expect(exit).toMatchObject({ outcome: "stop", reason: "ceiling" });
		const snap = laneSnapshot(r, wl);
		expect(snap.deaths).toEqual([]);
		expect(snap.workload!.holder).toBeNull();
		const stops = snap.control.filter((c) => c.prefix === "lane-stop" && c.laneId === laneId);
		expect(stops.map((s) => [s.createdBy, s.rest])).toEqual([[LANE_RUNNER_BY, "accepted ceiling"]]);
		const qs = ceilingQuestionsOf(snap.questions);
		expect(qs.map((q) => q.state)).toEqual(["open"]);
		expect(spendsOf(snap.control, laneId).at(-1)).toMatchObject({ usd: 1.2, tokens: 5000 });
		const [rec] = fakeRecords(r);
		expect(eventsOf(r, rec!.pid)).toEqual(["prompt", "abort", "eof"]);
	}, 60_000);

	test("a hand's session file nested under the lane's session dir counts: 0.5 in the lane's file and 0.6 in the hand's cross the $1 ceiling together", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		tinyCeiling(r, wl, 1);
		setMeterScript(r, [{ usage: { usd: 0.5, tokens: 10 } }, { usage: { usd: 0.6, tokens: 20 }, hand: "0-Hand" }, { hang: true }]);
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const laneId = laneIdOf(wl, 1);
		const exit = await exitOf(r, wl, laneId);
		expect(exit).toMatchObject({ outcome: "stop", reason: "ceiling" });
		const [rec] = fakeRecords(r);
		expect(existsSync(join(rec!.session!.replace(/\.jsonl$/, ""), "0-Hand.jsonl"))).toBe(true);
		const snap = laneSnapshot(r, wl);
		expect(snap.deaths).toEqual([]);
		const last = spendsOf(snap.control, laneId).at(-1)!;
		expect(last.usd).toBeCloseTo(1.1, 4);
		expect(last.tokens).toBe(30);
	}, 60_000);

	test("a relaunch already past 100 % (Jo answered stop, then a relaunch is requested): the runner meters before the first prompt and stops without sending it, no second question, no lane-died:", async () => {
		const r = makeRoot();
		const { wl } = openWorkload(r, { slice: true });
		tinyCeiling(r, wl, 1);
		setMeterScript(r, [{ usage: { usd: 1.2, tokens: 5000 } }, { hang: true }]);
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		expect(await exitOf(r, wl, laneIdOf(wl, 1))).toMatchObject({ outcome: "stop", reason: "ceiling" });
		const l = ledgerOf(r);
		const [q] = ceilingQuestionsOf(l.questions(wl));
		const answer = l.answerQuestion(q!.id, { by: SURFACE_BY, answer: "stop", author: "jo", channel: "surface" });
		l.completeSlice(q!.slice_id, { by: SURFACE_BY, artifact: `answered stop ${answer}` });
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: `launch-requested: by jo at ${l.now()}` });
		l.close();
		setMeterScript(r, [{ usage: { usd: 0.1, tokens: 10 } }, { hang: true }]);
		expect(lane(r, ["launch", wl, "--requested-by", "test"]).code).toBe(0);
		const lane2 = laneIdOf(wl, 2);
		expect(await exitOf(r, wl, lane2)).toMatchObject({ outcome: "stop", reason: "ceiling" });
		const snap = laneSnapshot(r, wl);
		expect(snap.deaths).toEqual([]);
		expect(snap.workload!.holder).toBeNull();
		expect(snap.control.filter((c) => c.prefix === "lane-stop" && c.laneId === lane2).map((c) => c.rest)).toEqual(["accepted ceiling"]);
		expect(ceilingQuestionsOf(snap.questions)).toHaveLength(1);
		expect(spendsOf(snap.control, lane2).at(-1)).toMatchObject({ usd: 1.2, tokens: 5000 });
		const starts = fakeRecords(r).filter((x) => x.argv !== undefined);
		expect(starts).toHaveLength(2);
		expect(eventsOf(r, starts[1]!.pid)).toEqual(["abort", "eof"]);
	}, 60_000);
});
