// The launch predicate and its helpers over plain rows (DESIGN-lane-launcher.md § 8 "Predicate unit
// tests"): every § 3 / § 6 state as a row of the matrix, then the Codex-review regressions that
// live in surface/src/launch.ts (B6 null-start resume, S1 superseded done-because:, S7 merge line).
import { describe, expect, test } from "bun:test";
import { LANE_RUNNER_BY, LANE_STARTER_BY, type EntryRow, type ReserveRows, type WorkloadRow } from "../../ledger/src/index";
import {
	controlEntries, decideLaunch, doneBecause, exitClass, fencedBy, firstPrompt, holdersOf, INTENDED_OUTCOMES, LANE_OUTCOMES, laneArgv, launchable, maxTimeMs,
	reservedPrefix,
	type Resolution, resumeFor, resumeSession, verdictOf,
} from "../src/launch";
import { STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";

const NOW = "2026-10-01T10:00:00.000Z";
const workload = (over: Partial<WorkloadRow> = {}): WorkloadRow => ({
	id: "wl-m", brief: "do the thing", stakes: "normal", mode: "autonomous", status: "open", holder: null, holder_lease_until: null,
	open_slices: 0, paused_slices: 0, open_questions: 0, held_messages: 0, closed_at: null, created_by: "o", created_at: NOW,
	changed_by: "o", changed_at: NOW, rev: 0, ...over,
} as WorkloadRow);
let seq = 0;
const entry = (by: string, body: string): EntryRow => ({
	id: `e-${++seq}`, workload_id: "wl-m", slice_id: null, kind: "assumption", body, created_by: by, created_at: `2026-10-01T09:${String(seq).padStart(2, "0")}:00.000Z`,
} as EntryRow);
const control = (rows: EntryRow[], holder: string | null = null) => controlEntries(rows, holdersOf(rows, holder));
const launch = (lane: string, cause: string) => entry(LANE_STARTER_BY, `launch: ${lane} cause ${cause} requested-by jo`);
const started = (lane: string, session: string | null, by = LANE_RUNNER_BY) => entry(by, `lane-started: ${lane} ${JSON.stringify({ pid: 1, start: "x", session, argv: [], runnerPid: 2 })}`);
const resolution = (instructionId: string, laneId: string): Resolution => ({ instructionId, questionId: "q1", laneId, kind: "answer", body: "yes", createdAt: NOW });

describe("launch predicate matrix (§ 3 states)", () => {
	const rows: [string, WorkloadRow, EntryRow[], Resolution[], number, unknown][] = [
		["first launch", workload(), [], [], 0, { launch: true, cause: { kind: "first" } }],
		["closed", workload({ status: "closed" }), [], [], 0, { launch: false, reason: "closed" }],
		["standing", workload({ id: STANDING_WORKLOAD_ID }), [], [], 0, { launch: false, reason: "standing" }],
		["due row", workload({ brief: "due: remind me" }), [], [], 0, { launch: false, reason: "due" }],
		["user-driven", workload({ mode: "user-driven" }), [], [], 0, { launch: false, reason: "user-driven" }],
		["held under a live lease", workload({ holder: "lane-m-1", holder_lease_until: "2026-10-01T10:05:00.000Z" }), [], [], 0, { launch: false, reason: "held" }],
		["held with no lease (Jo after a handoff)", workload({ holder: "jo" }), [], [], 0, { launch: false, reason: "held" }],
		["lapsed lease is not held", workload({ holder: "lane-m-1", holder_lease_until: "2026-10-01T09:00:00.000Z" }), [], [], 0, { launch: true, cause: { kind: "first" } }],
		["cap reached", workload(), [], [], 3, { launch: false, reason: "cap" }],
		["died, not relaunched", workload(), [launch("lane-m-1", "first")], [], 0, { launch: false, reason: "died-not-relaunched" }],
		["resume after an answer", workload(), [launch("lane-m-1", "first")], [resolution("in-1", "lane-m-1")], 0, { launch: true, cause: { kind: "resume", ids: ["in-1"] } }],
		["resume already consumed (tick catch-up idempotence)", workload(), [launch("lane-m-1", "first"), launch("lane-m-2", "resume in-1")], [resolution("in-1", "lane-m-1")], 0, { launch: false, reason: "died-not-relaunched" }],
		["a launch: stamped by a lane is not an attempt", workload(), [entry("lane-m-9", "launch: lane-m-9 cause first requested-by me")], [], 0, { launch: true, cause: { kind: "first" } }],
	];
	for (const [name, w, entries, resolved, live, want] of rows) {
		test(name, () => {
			const c = control(entries, w.holder);
			const v = launchable(w, c, null, resolved, NOW, live, 3);
			if (typeof want === "object" && want !== null && "cause" in want && (want as { cause: { kind: string; id?: string } }).cause.kind === "request") {
				expect(v).toMatchObject({ launch: true, cause: { kind: "request" } });
				expect((v as { cause: { id: string } }).cause.id).toMatch(/^e-\d+$/);
			} else expect(v).toEqual(want);
		});
	}
	test("the request-consumed row consumes by the request entry's real id", () => {
		const req = entry(SURFACE_BY, `launch-requested: by jo at ${NOW}`);
		const c = control([launch("lane-m-1", "first"), req, launch("lane-m-2", `request ${req.id}`)]);
		expect(launchable(workload(), c, null, [], NOW, 0, 3)).toEqual({ launch: false, reason: "died-not-relaunched" });
	});
});

describe("awaiting close: the holder's done-because: stands (L1, the by-hand wasted launch)", () => {
	const rows = (w: WorkloadRow, entries: EntryRow[], holders: string[] = []): ReserveRows => ({
		workload: w, entries, questions: [], instructions: [], slices: [], holders, liveLanes: 0, cap: 3, now: NOW,
	});
	const done = (by: string) => entry(by, "done-because: all five slices done");
	test("a by-hand holder's receipt, no launch: history: the ledger's recorded holder makes it the holder's; nothing launches", () => {
		expect(verdictOf(rows(workload(), [done("lane-plumb-by-hand")], ["lane-plumb-by-hand"]))).toEqual({ launch: false, reason: "awaiting-close" });
		expect(decideLaunch(rows(workload(), [done("lane-plumb-by-hand")], ["lane-plumb-by-hand"]))).toEqual({ launch: false, reason: "awaiting-close" });
	});
	test("a launched lane's receipt after its launch: attempt: awaiting close, not died-not-relaunched", () => {
		expect(verdictOf(rows(workload(), [launch("lane-m-1", "first"), done("lane-m-1")]))).toEqual({ launch: false, reason: "awaiting-close" });
	});
	test("a receipt by someone who never held the workload is not a receipt: launchable as before", () => {
		expect(verdictOf(rows(workload(), [done("hand-x")], ["lane-plumb-by-hand"]))).toEqual({ launch: true, cause: { kind: "first" } });
	});
	test("a later ordinary note by the holder supersedes the receipt (doneBecause): the cause logic decides as before", () => {
		const note = () => entry("lane-plumb-by-hand", "acceptance is no longer met");
		expect(verdictOf(rows(workload(), [done("lane-plumb-by-hand"), note()], ["lane-plumb-by-hand"]))).toEqual({ launch: true, cause: { kind: "first" } });
		expect(verdictOf(rows(workload(), [launch("lane-m-1", "first"), done("lane-m-1"), entry("lane-m-1", "the line went to the wrong README")]))).toEqual({ launch: false, reason: "died-not-relaunched" });
	});
	test("held under a live lease with a receipt: held, not awaiting close", () => {
		const w = workload({ holder: "lane-m-1", holder_lease_until: "2026-10-01T10:05:00.000Z" });
		expect(verdictOf(rows(w, [launch("lane-m-1", "first"), done("lane-m-1")]))).toEqual({ launch: false, reason: "held" });
	});
	test("Jo's unconsumed launch-requested: wins over the receipt: the request launches, so the tick never closes it", () => {
		const req = entry(SURFACE_BY, `launch-requested: by jo at ${NOW}`);
		expect(verdictOf(rows(workload(), [launch("lane-m-1", "first"), done("lane-m-1"), req]))).toEqual({ launch: true, cause: { kind: "request", id: req.id } });
		// once a lane consumed it, the next receipt stands again
		expect(verdictOf(rows(workload(), [launch("lane-m-1", "first"), req, launch("lane-m-2", `request ${req.id}`), done("lane-m-2")]))).toEqual({ launch: false, reason: "awaiting-close" });
	});
	test("user-driven and closed keep their reasons: awaiting-close is only for an autonomous workload the tick would launch", () => {
		expect(verdictOf(rows(workload({ mode: "user-driven" }), [done("lane-m-1")], ["lane-m-1"]))).toEqual({ launch: false, reason: "user-driven" });
		expect(verdictOf(rows(workload({ status: "closed" }), [done("lane-m-1")], ["lane-m-1"]))).toEqual({ launch: false, reason: "closed" });
	});
});

describe("exit classification (decision 14)", () => {
	test("parked and accepted stop are intended; a request alone, a start, or nothing is not", () => {
		const lane = "lane-m-1";
		expect(exitClass(control([started(lane, "/s")]), lane)).toBe("unintended");
		expect(exitClass(control([started(lane, "/s"), entry(LANE_RUNNER_BY, `lane-parked: ${lane} questions q1 session /s`)]), lane)).toBe("intended");
		expect(exitClass(control([entry(SURFACE_BY, `lane-stop: ${lane} requested mode-flip by jo`)]), lane)).toBe("unintended");
		expect(exitClass(control([entry(SURFACE_BY, `lane-stop: ${lane} requested mode-flip by jo`), entry(LANE_RUNNER_BY, `lane-stop: ${lane} accepted e-1`)]), lane)).toBe("intended");
		expect(exitClass([], lane)).toBe("unintended");
	});
	test("R5 (Codex review 2): a later lane-started:/lane-ready: (session metadata) does not turn an accepted stop or a park back into unintended", () => {
		const lane = "lane-m-1";
		const req = entry(SURFACE_BY, `lane-stop: ${lane} requested mode-flip by jo`);
		expect(exitClass(control([started(lane, null), req, entry(LANE_RUNNER_BY, `lane-stop: ${lane} accepted ${req.id}`), started(lane, "/s")]), lane)).toBe("intended");
		expect(exitClass(control([started(lane, null), entry(LANE_RUNNER_BY, `lane-parked: ${lane} questions q1 session /s`), started(lane, "/s"), entry(LANE_RUNNER_BY, `lane-ready: ${lane} at ${NOW}`)]), lane)).toBe("intended");
		// metadata alone is still no intent
		expect(exitClass(control([started(lane, null), started(lane, "/s")]), lane)).toBe("unintended");
	});
	test("every runner outcome is classified; the intended ones are the design's four plus released and interactive", () => {
		expect(Object.keys(INTENDED_OUTCOMES).sort()).toEqual([...LANE_OUTCOMES].sort());
		expect(LANE_OUTCOMES.filter((o) => INTENDED_OUTCOMES[o])).toEqual(["completed", "parked", "resume-pending", "stop", "released", "interactive"]);
	});
});

describe("control writers (Codex review 2, R4)", () => {
	test("launch-failed: is accepted from the starter and from the runner (its readiness failure), never from a lane", () => {
		const lane = "lane-m-1";
		const body = `launch-failed: ${lane} readiness: never ready in 3m`;
		expect(control([entry(LANE_STARTER_BY, body)]).map((c) => c.prefix)).toEqual(["launch-failed"]);
		expect(control([entry(LANE_RUNNER_BY, body)]).map((c) => [c.prefix, c.laneId, c.createdBy])).toEqual([["launch-failed", lane, LANE_RUNNER_BY]]);
		expect(control([entry(lane, body)], lane)).toEqual([]);
	});
	test("ceiling: is the surface's alone and spend: the runner's alone; the lane tools' refusal sees both as reserved", () => {
		const ceiling = "ceiling: usd 50 wall 360 source stakes normal";
		const spend = "spend: lane-m-1 usd 1 tokens 10 wall 2";
		expect(control([entry(SURFACE_BY, ceiling), entry(LANE_RUNNER_BY, spend)]).map((c) => [c.prefix, c.laneId])).toEqual([["ceiling", null], ["spend", "lane-m-1"]]);
		expect(control([entry(LANE_RUNNER_BY, ceiling), entry("lane-m-1", ceiling), entry(SURFACE_BY, spend), entry("lane-m-1", spend)], "lane-m-1")).toEqual([]);
		expect([reservedPrefix(ceiling), reservedPrefix(spend)]).toEqual(["ceiling", "spend"]);
	});
});

describe("resume session (Codex review B6)", () => {
	test("a later start record with a null session does not hide the earlier session; a parked session counts; none recorded is null", () => {
		const lane = "lane-m-1";
		expect(resumeSession(control([started(lane, "/one.jsonl"), started("lane-m-2", null)]))).toBe("/one.jsonl");
		expect(resumeSession(control([started(lane, null)]))).toBeNull();
		expect(resumeSession(control([started(lane, "/one.jsonl"), entry(LANE_RUNNER_BY, `lane-parked: ${lane} questions q1 session /two.jsonl`)]))).toBe("/two.jsonl");
		expect(resumeSession(control([started(lane, "/one.jsonl", LANE_STARTER_BY)]))).toBe("/one.jsonl");
		expect(resumeSession(control([started(lane, "/one.jsonl", "lane-m-1")]))).toBeNull();
	});
	test("resumeFor picks the raising lane's session for a resume cause, else the newest on the workload", () => {
		const c = control([launch("lane-m-1", "first"), started("lane-m-1", "/one.jsonl"), launch("lane-m-2", "request e-9"), started("lane-m-2", "/two.jsonl"), launch("lane-m-3", "resume in-1")]);
		expect(resumeFor(c, "lane-m-3", [resolution("in-1", "lane-m-1")])).toBe("/one.jsonl");
		expect(resumeFor(c, "lane-m-2", [])).toBe("/two.jsonl");
		expect(resumeFor(c, "lane-m-3", [resolution("in-1", "lane-m-7")])).toBe("/two.jsonl");
	});
});

describe("done-because: receipt (decision 16, Codex review S1)", () => {
	test("the holder's newest lane/surface assumption must be the receipt; a later plain note supersedes it; machinery lines and artifact records are skipped", () => {
		const holders = ["lane-m-1"];
		expect(doneBecause([entry("lane-m-1", "done-because: tests pass")], holders)).toBe("tests pass");
		expect(doneBecause([entry("lane-m-1", "done-because: tests pass"), entry("lane-m-1", "acceptance is no longer met")], holders)).toBeNull();
		expect(doneBecause([entry("lane-m-1", "done-because: tests pass"), entry(SURFACE_BY, "Jo says not yet")], holders)).toBeNull();
		expect(doneBecause([entry("lane-m-1", "done-because: tests pass"), entry(LANE_RUNNER_BY, "lane-exit: lane-m-1 code 0 signal - outcome completed"), entry(SURFACE_BY, "repo: /r")], holders)).toBe("tests pass");
		expect(doneBecause([entry("lane-m-1", "done-because: tests pass"), entry("lane-m-1", "artifact-command: bun test")], holders)).toBe("tests pass");
		expect(doneBecause([entry("hand-x", "done-because: I say so")], holders)).toBeNull();
		expect(doneBecause([entry(SURFACE_BY, "done-because: the surface says so")], holders)).toBeNull();
	});
});

describe("max-time and the fence check", () => {
	test("maxTimeMs parses OMP's forms; the fence covers subpaths and literals", () => {
		expect(maxTimeMs("2h")).toBe(7_200_000);
		expect(maxTimeMs("90")).toBe(90_000);
		expect(maxTimeMs("1.5m")).toBe(90_000);
		expect(maxTimeMs("2d")).toBeNull();
		expect(fencedBy("/home/j/.agent-system-2/lanes/x", [{ kind: "subpath", path: "/home/j/.agent-system-2" }])).toBe("/home/j/.agent-system-2");
		expect(fencedBy("/home/j/.agent-system-2-lanes/x", [{ kind: "subpath", path: "/home/j/.agent-system-2" }])).toBeNull();
		expect(fencedBy("/home/j/ledger.db", [{ kind: "literal", path: "/home/j/ledger.db" }])).toBe("/home/j/ledger.db");
		expect(fencedBy("/home/j/ledger.db/x", [{ kind: "literal", path: "/home/j/ledger.db" }])).toBeNull();
	});
	test("laneArgv renders --max-time as the ceiling's remaining wall plus 10 minutes when given, else the configured value", () => {
		const spec = { worktree: "/w", sessionDir: "/s", systemPromptPath: "/p", maxTime: "2h", resume: null };
		const maxTimeOf = (argv: string[]) => argv[argv.indexOf("--max-time") + 1];
		expect(maxTimeOf(laneArgv(spec))).toBe("2h");
		expect(maxTimeOf(laneArgv({ ...spec, remainingWallMin: null }))).toBe("2h");
		expect(maxTimeOf(laneArgv({ ...spec, remainingWallMin: 14.2 }))).toBe("25m");
		expect(maxTimeOf(laneArgv({ ...spec, remainingWallMin: -3 }))).toBe("10m");
		expect(maxTimeMs(maxTimeOf(laneArgv({ ...spec, remainingWallMin: 350 }))!)).toBe(360 * 60_000);
	});
});

describe("first prompt merge line (decision 11, Codex review S7)", () => {
	const prompt = (machinery: boolean, stakes: WorkloadRow["stakes"]) => firstPrompt({
		workload: workload({ stakes }), laneId: "lane-m-1", repo: "/r", worktree: "/r-lanes/wl-m", branch: "wl/wl-m", done: "it works", planFirst: null,
		decisionLog: "", resolved: [], machinery, tools: ["lane_release"],
	});
	test("the machinery repo never merges; a product repo follows the stakes table", () => {
		expect(prompt(true, "production")).toContain("never merge on this repo: Jo integrates it.");
		expect(prompt(false, "production")).toContain("the merge is Jo's");
		expect(prompt(false, "normal")).toContain("merge proceeds on a judge slice's pass");
		expect(prompt(false, "throwaway")).toContain("merge when green");
	});
});
