#!/usr/bin/env bun
// The fixture ledger for surface/scripts/invariants.ts, built through the ledger module with a
// settable clock so every row carries the time the scenario needs. `bun surface/test/fixtures/invariants/build.ts [out]`
// rewrites ledger.db beside this file (the checked-in copy the acceptance command runs against);
// the test builds a fresh one in a temp directory and asserts on the ids this returns.
//
// Reproducible as a scenario, not byte for byte: row ids come from the ledger's `newId` (a
// `Date.now()` prefix plus random characters, ledger/src/index.ts), so two builds carry different ids
// and the checked-in ledger.db differs from a rebuild even though every timestamp, body and
// relationship is the same. The test asserts on the invariants and keys a build produces, never on
// ids. Rebuild and commit it when this file changes.
//
// Timeline (as-of is AS_OF, 2026-10-11T21:00:00Z):
//   wl-orchestrator          one entry at 18:00: silent 3 h (silent-orchestrator fires when a lane is alive)
//   wl-fixture-deadlane      lane-fixture-deadlane-1 started 18:06, spawned a review hand 18:30, no exit,
//                            no process, nothing since: dead-lane AND orphan-hand (the dead-lane case)
//   wl-fixture-stopped       lane-fixture-stopped-1 raised a reserved-request 18:20, released 18:25 and
//                            exited: reservedStates says lane-stopped, so stale-reserved must NOT fire
//   wl-fixture-waiting       lane-fixture-waiting-1 still holds it; a reserved-request 19:00 (stale-reserved
//                            fires), a question 19:30 still open (stuck-question fires), a question 18:40
//                            answered 18:45 (does not), a note at 20:50 so the workload is not silent
//   wl-fixture-refusal       two lanes exited outcome error 18:41 and 19:06, each beside a non-retryable
//                            usage-policy note: provider-refusal-loop fires once
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Ledger } from "../../../../ledger/src/index";
import { laneExitBody, laneStartedBody } from "../../../src/launch";
import { STANDING_BRIEF, STANDING_WORKLOAD_ID } from "../../../src/types";

export const AS_OF = "2026-10-11T21:00:00.000Z";
export const LANE_RUNNER = "lane-runner";

export interface Fixture {
	path: string;
	asOf: string;
	deadLane: { wl: string; lane: string; token: string };
	stopped: { wl: string; lane: string; request: string };
	waiting: { wl: string; lane: string; request: string; question: string; answered: string };
	refusal: { wl: string; lanes: [string, string] };
}

const started = (laneId: string, at: string) => laneStartedBody(laneId, { pid: 4242, start: at, session: null, argv: [], runnerPid: 4241 });

export function buildFixture(path: string): Fixture {
	for (const f of [path, `${path}-wal`, `${path}-shm`]) if (existsSync(f)) rmSync(f);
	let now = "2026-10-11T18:00:00.000Z";
	const at = (hhmm: string) => {
		now = `2026-10-11T${hhmm}:00.000Z`;
	};
	const ledger = Ledger.open(path, { create: true, backup: false, backupOnOpen: false, clock: () => now, skipLocalityCheck: true });
	const note = (by: string, workloadId: string, body: string) => ledger.recordEntry({ by, workloadId, kind: "assumption", body });
	const lane = (wl: string, laneId: string, hhmm: string) => {
		at(hhmm);
		ledger.claimWorkload(wl, { by: laneId, holder: laneId, leaseMs: null });
		note(LANE_RUNNER, wl, started(laneId, now));
		note(laneId, wl, `builder-lab: anthropic lane ${laneId} model anthropic/claude-opus-5-5`);
	};
	const open = (id: string, brief: string, hhmm: string) => {
		at(hhmm);
		const wl = ledger.openWorkload({ by: "orchestrator", brief, stakes: "normal", mode: "autonomous", id });
		const sl = ledger.addSlice({ by: "orchestrator", workloadId: wl, task: `${brief}: the slice`, doneCondition: "bun test passes", inputs: "surface/" });
		return { wl, sl };
	};

	// wl-orchestrator: the standing workload, one entry, then silence.
	at("18:00");
	ledger.openWorkload({ by: "orchestrator-surface", brief: STANDING_BRIEF, stakes: "normal", mode: "autonomous", id: STANDING_WORKLOAD_ID });
	note("orchestrator-surface", STANDING_WORKLOAD_ID, "identity: Ilex (they/them)");

	// wl-fixture-deadlane: a lane that spawned a review hand and died.
	const dead = open("wl-fixture-deadlane", "Port the watcher", "18:05");
	lane(dead.wl, "lane-fixture-deadlane-1", "18:06");
	at("18:30");
	const token = "dt-fixture-review-1";
	note("lane-fixture-deadlane-1", dead.wl, `hand-spawn: ${token} session /Users/as2/.agent-system-2/lanes/${dead.wl}/sessions/s1 spawn ${dead.sl} review yes group dg-fixture-1 row openai/gpt-6-astra`);

	// wl-fixture-stopped: a reserved request whose lane released and exited.
	const stopped = open("wl-fixture-stopped", "Rebase the launcher branch", "18:10");
	lane(stopped.wl, "lane-fixture-stopped-1", "18:11");
	at("18:20");
	const stoppedRequest = ledger.recordEntry({ by: "lane-fixture-stopped-1", workloadId: stopped.wl, kind: "reserved-request", body: "git push --force origin main: the rebase (P-11 row 6 refused tool call bash)" });
	at("18:25");
	ledger.releaseWorkload(stopped.wl, { by: "lane-fixture-stopped-1", holder: "lane-fixture-stopped-1" });
	note(LANE_RUNNER, stopped.wl, laneExitBody("lane-fixture-stopped-1", { code: 0, signal: null, outcome: "released" }));

	// wl-fixture-waiting: a lane still holding, a waiting request and an open question.
	const waiting = open("wl-fixture-waiting", "Add the invariants test", "18:15");
	lane(waiting.wl, "lane-fixture-waiting-1", "18:16");
	at("18:40");
	const answered = ledger.raiseQuestion({ by: "lane-fixture-waiting-1", workloadId: waiting.wl, sliceId: waiting.sl, body: "Keep the fixture binary?", options: ["yes", "no"] });
	at("18:45");
	ledger.answerQuestion(answered, { by: "orchestrator-surface", answer: "yes", author: "jo", channel: "surface" });
	at("19:00");
	const waitingRequest = ledger.recordEntry({ by: "lane-fixture-waiting-1", workloadId: waiting.wl, kind: "reserved-request", body: "git checkout surface/src/errors.ts (a path: discards working changes) (P-11 row 6 refused tool call bash)" });
	at("19:30");
	const question = ledger.raiseQuestion({ by: "lane-fixture-waiting-1", workloadId: waiting.wl, sliceId: waiting.sl, body: "Which repo does the git invariant read by default?", options: ["the script's checkout", "AS2_REPO"] });
	at("20:50");
	note("lane-fixture-waiting-1", waiting.wl, "still working: the question is parked, the slice continues");

	// wl-fixture-refusal: two lanes dead on the same provider refusal within 30 min.
	const refusal = open("wl-fixture-refusal", "Replay the guard corpus", "18:20");
	lane(refusal.wl, "lane-fixture-refusal-1", "18:21");
	at("18:40");
	note("lane-fixture-refusal-1", refusal.wl, "prompt error: non-retryable: the request violates the usage policy");
	at("18:41");
	ledger.releaseWorkload(refusal.wl, { by: "lane-fixture-refusal-1", holder: "lane-fixture-refusal-1" });
	note(LANE_RUNNER, refusal.wl, laneExitBody("lane-fixture-refusal-1", { code: 1, signal: null, outcome: "error" }));
	lane(refusal.wl, "lane-fixture-refusal-2", "18:50");
	at("19:05");
	note("lane-fixture-refusal-2", refusal.wl, "prompt error: non-retryable: the request violates the usage policy");
	at("19:06");
	ledger.releaseWorkload(refusal.wl, { by: "lane-fixture-refusal-2", holder: "lane-fixture-refusal-2" });
	note(LANE_RUNNER, refusal.wl, laneExitBody("lane-fixture-refusal-2", { code: 1, signal: null, outcome: "error" }));

	// The checked-in copy is read with { readonly: true } from wherever the checkout sits: rollback journal mode
	// needs no -wal/-shm beside it, so a read-only directory works too (Ledger.open switches back to WAL on open).
	ledger.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	ledger.db.exec("PRAGMA journal_mode = DELETE");
	ledger.db.exec("VACUUM");
	ledger.close();
	for (const f of [`${path}-wal`, `${path}-shm`]) if (existsSync(f)) rmSync(f);
	return {
		path, asOf: AS_OF,
		deadLane: { wl: dead.wl, lane: "lane-fixture-deadlane-1", token },
		stopped: { wl: stopped.wl, lane: "lane-fixture-stopped-1", request: stoppedRequest },
		waiting: { wl: waiting.wl, lane: "lane-fixture-waiting-1", request: waitingRequest, question, answered },
		refusal: { wl: refusal.wl, lanes: ["lane-fixture-refusal-1", "lane-fixture-refusal-2"] },
	};
}

if (import.meta.main) {
	const out = process.argv[2] ?? join(dirname(new URL(import.meta.url).pathname), "ledger.db");
	const f = buildFixture(out);
	console.log(`${f.path} as-of ${f.asOf}`);
}
