// The forgery hold (PLAN wl-mvfxw3c4zqfzls D3, D4; R11-R14): a workload with a recorded `forgery:` hit Jo has answered
// neither way is not launched autonomously (`launchable` → forgery-hold), its live autonomous lane gets the check's stop
// request (a by-hand lane gets none), the merge train refuses to board it (`landingReady`, `boardLanding`), and the close is
// refused; Jo's `forgery-confirmed:` lifts each. The launch reserve (surface/scripts/lane.ts `reserve`) runs the check itself
// and refuses on a hit no pass recorded yet, writing the hit rows and raising one alarm; the needs-you line is LOUD until Jo
// answers; `merge-train.ts stakes --hold-ok` (the real script, a fake gh on PATH) answers `hold: forgery <row id>` for a hit
// recorded or not. Every forged row is a real ledger row: a lane-written jo-only prefix (F5), a lane-stamped answer (F3).
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LANE_STARTER_BY, type Ledger } from "../../ledger/src/index";
import { forgeryReversedBody } from "../../ledger/src/jo-channel";
import { LEDGER_DB_ENV } from "../../ledger/src/locality";
import { closeWorkloadWithEntry } from "../extensions/workload";
import * as laneScript from "../scripts/lane";
import { errorLines } from "../src/errors";
import { forgeryHoldLine, forgeryPass, forgeryStakesHold, unansweredHits } from "../src/forgery-hold";
import { ensureStandingWorkload } from "../src/identity";
import { controlEntries, forgeryConfirmedBody, holdersOf, launchable, pendingStop, planApprovedBody } from "../src/launch";
import { AUTOBOARD_WINDOW_MS, boardLanding, landingReady } from "../src/merge-train";
import type { RankConfig } from "../src/rank-launch";
import { FORGERY_CHECK_BY, STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import { clock, fakePi, tempLedger, tmp } from "./helpers";
import { boardWorld, SERVED } from "./train-world";

const JO = { by: SURFACE_BY, author: "jo", channel: "surface" as const };
const SHOW: RankConfig = { mode: "show", parallelBudgetUsd: 0 };
const CLI = resolve(import.meta.dir, "..", "scripts", "merge-train.ts");

function world() {
	const c = clock();
	const { ledger, path } = tempLedger(c.now);
	ensureStandingWorkload(ledger);
	return { c, ledger, path };
}

/** A lane-written `plan: approved …` on `wl`: a jo-only prefix whose writer the prefix refuses (F5). Its entry id. */
const forgedPlan = (ledger: Ledger, wl: string, lane = "lane-forger-1") =>
	ledger.recordEntry({ by: lane, workloadId: wl, kind: "assumption", body: planApprovedBody("in-nothing") });

/** Jo's `confirm <row id>` as the surface records it: his words, then `forgery-confirmed:` on `on` (the workload, or the standing one once closed). */
function confirm(ledger: Ledger, on: string, rowId: string): string {
	const words = ledger.recordInstruction({ ...JO, workloadId: on, body: `confirm ${rowId}` });
	return ledger.recordEntry({ by: SURFACE_BY, workloadId: on, kind: "assumption", body: forgeryConfirmedBody(rowId, words) });
}
/** Jo's `reverse <row id>`, the same way. */
function reverse(ledger: Ledger, on: string, rowId: string): string {
	const words = ledger.recordInstruction({ ...JO, workloadId: on, body: `reverse ${rowId}` });
	return ledger.recordEntry({ by: SURFACE_BY, workloadId: on, kind: "assumption", body: forgeryReversedBody(rowId, words) });
}

/** `launchable` over `wl` as the ledger stands. */
function verdict(ledger: Ledger, wl: string) {
	const w = ledger.workload(wl)!;
	const entries = ledger.entries(wl);
	return launchable(w, controlEntries(entries, holdersOf(entries, w.holder, ledger.holders(wl))), null, [], ledger.now(), 0, 10);
}

describe("R11: an unanswered hit holds the workload", () => {
	test("launchable answers forgery-hold; the live autonomous lane gets the check's stop request, a by-hand lane none; confirm lifts it", () => {
		const { c, ledger } = world();
		const auto = ledger.openWorkload({ by: SURFACE_BY, brief: "an autonomous workload", stakes: "normal", mode: "autonomous" });
		c.plusHours(0.01);
		const byHand = ledger.openWorkload({ by: SURFACE_BY, brief: "Jo's own workload", stakes: "normal", mode: "user-driven" });
		const autoLane = "lane-auto-1";
		const handLane = "lane-hand-1";
		expect(ledger.claimWorkload(auto, { by: LANE_STARTER_BY, holder: autoLane, leaseMs: 600_000 }).won).toBe(true);
		expect(ledger.claimWorkload(byHand, { by: LANE_STARTER_BY, holder: handLane, leaseMs: 600_000 }).won).toBe(true);
		// F3: the lane answers its own question
		const sl = ledger.addSlice({ by: autoLane, workloadId: auto, task: "t", doneCondition: "d", inputs: "i" });
		const q = ledger.raiseQuestion({ by: autoLane, workloadId: auto, sliceId: sl, body: "Ship it?", options: ["yes", "no"] });
		const answer = ledger.answerQuestion(q, { by: autoLane, answer: "yes", author: "jo", channel: "surface" });
		const handRow = forgedPlan(ledger, byHand, handLane);
		c.plusHours(0.1);

		const pass = forgeryPass(ledger, AUTOBOARD_WINDOW_MS);
		expect(pass.hits.map((h) => [h.workloadId, h.rowId])).toEqual([[auto, answer], [byHand, handRow]]);
		expect(pass.hits.find((h) => h.rowId === answer)!.rule).toMatch(/^F[23]$/);
		expect(pass.stops.map((s) => [s.workloadId, s.laneId])).toEqual([[auto, autoLane]]);
		const control = (wl: string) => {
			const es = ledger.entries(wl);
			return controlEntries(es, holdersOf(es, ledger.workload(wl)!.holder, ledger.holders(wl)));
		};
		// the runner honours it as it honours `as2 lane stop`
		expect(pendingStop(control(auto), autoLane)).toMatchObject({ reason: "forgery-hold", by: FORGERY_CHECK_BY });
		expect(pendingStop(control(byHand), handLane)).toBeNull();
		// a second pass asks no second stop
		expect(forgeryPass(ledger, AUTOBOARD_WINDOW_MS)).toEqual({ hits: [], stops: [] });

		// once the lanes are gone: no autonomous launch while held
		ledger.releaseWorkload(auto, { by: LANE_STARTER_BY, holder: autoLane });
		ledger.releaseWorkload(byHand, { by: LANE_STARTER_BY, holder: handLane });
		expect(verdict(ledger, auto)).toEqual({ launch: false, reason: "forgery-hold" });
		const refused = laneScript.reserve(ledger, auto, "test", false, SHOW);
		expect(refused).toEqual({ ok: false, reason: "forgery-hold" });
		// by hand is not refused: Jo's own terminal, told by the hold line
		expect(forgeryHoldLine(ledger, byHand)).toContain(`forgery hold on ${byHand}: 1 flagged row Jo has not answered (${handRow} F5)`);
		const hand = laneScript.reserve(ledger, byHand, "jo", true, SHOW);
		expect(hand.ok).toBe(true);

		confirm(ledger, auto, answer);
		expect(unansweredHits(ledger, auto)).toEqual([]);
		expect(forgeryHoldLine(ledger, auto)).toBeNull();
		expect(verdict(ledger, auto)).toMatchObject({ launch: true });
		expect(laneScript.reserve(ledger, auto, "test", false, SHOW).ok).toBe(true);
	});

	test("landingReady and boardLanding refuse a closed workload whose hit sits on the standing workload; confirm there lifts both", () => {
		const w = boardWorld();
		// The landing's lane forges a jo-only row just before the close.
		let forged = "";
		const close = w.ledger.closeWorkload.bind(w.ledger);
		w.ledger.closeWorkload = ((id: string, s: { by: string }) => {
			forged = forgedPlan(w.ledger, id);
			return close(id, s);
		}) as typeof w.ledger.closeWorkload;
		const wl = w.landing(117);
		w.ledger.closeWorkload = close;
		const CTX = { config: SERVED };
		const before = landingReady(w.ledger, wl, CTX);
		expect(before.ready).toBe(true);
		if (!before.ready) return;

		const pass = forgeryPass(w.ledger, AUTOBOARD_WINDOW_MS);
		expect(pass.hits.map((h) => [h.workloadId, h.rowId, h.rule])).toEqual([[wl, forged, "F5"]]);
		expect(w.ledger.entry(pass.hits[0]!.entryId)!.workload_id).toBe(STANDING_WORKLOAD_ID);
		expect(unansweredHits(w.ledger, wl).map((h) => [h.rowId, h.on])).toEqual([[forged, STANDING_WORKLOAD_ID]]);
		expect(landingReady(w.ledger, wl, CTX)).toMatchObject({ ready: false, reason: `forgery hold: ${forged} F5 unanswered` });
		expect(boardLanding(w.ledger, before)).toEqual({ boarded: false, reason: `forgery hold on ${wl}: ${forged} unanswered` });

		// Jo's answer to a closed workload's row sits on the standing workload
		confirm(w.ledger, STANDING_WORKLOAD_ID, forged);
		const after = landingReady(w.ledger, wl, CTX);
		expect(after.ready).toBe(true);
		if (!after.ready) return;
		expect(boardLanding(w.ledger, after)).toMatchObject({ boarded: true });
	});

	test("the close is refused while a recorded hit is unanswered, and not for that once Jo confirms", async () => {
		const { c, ledger } = world();
		const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "a workload to close", stakes: "normal", mode: "autonomous" });
		const row = forgedPlan(ledger, wl);
		c.plusHours(0.1);
		forgeryPass(ledger, AUTOBOARD_WINDOW_MS);
		const cwd = tmp("forgery-close");
		const pi = fakePi().pi;
		const held = await closeWorkloadWithEntry(pi, ledger, {}, wl, { now: c.now(), cwd, receipt: null });
		expect(held.closed).toBe(false);
		expect(held.text).toBe(`${wl} cannot close: forgery hold on ${wl}: 1 flagged row Jo has not answered (${row} F5); at the surface: confirm ${row} (it was Jo's) / reverse ${row} (it was not)`);
		confirm(ledger, wl, row);
		const lifted = await closeWorkloadWithEntry(pi, ledger, {}, wl, { now: c.now(), cwd, receipt: null });
		expect(lifted.text).not.toContain("forgery hold");
	});
});

describe("R12: the launch reserve runs the check", () => {
	test("a hit no pass recorded yet refuses the autonomous launch, writes the hit row and raises one alarm; a clean workload launches", () => {
		const { c, ledger } = world();
		const forgedWl = ledger.openWorkload({ by: SURFACE_BY, brief: "forged between ticks", stakes: "normal", mode: "autonomous" });
		const clean = ledger.openWorkload({ by: SURFACE_BY, brief: "clean", stakes: "normal", mode: "autonomous" });
		const row = forgedPlan(ledger, forgedWl);
		c.plusHours(0.1);
		expect(unansweredHits(ledger, forgedWl)).toEqual([]);
		const notes: string[] = [];
		const spoken: string[] = [];
		const alarm = { notify: (_t: string, text: string) => { notes.push(text); return true; }, speak: (l: string) => { spoken.push(l); return true; } };

		expect(laneScript.reserve(ledger, forgedWl, "test", false, SHOW, alarm)).toEqual({ ok: false, reason: "forgery-hold" });
		const hits = ledger.entries(forgedWl).filter((e) => e.body.startsWith("forgery:"));
		expect(hits.map((e) => [e.created_by, e.body])).toEqual([[FORGERY_CHECK_BY, `forgery: hit ${row} F5`]]);
		expect(spoken).toEqual([`as2 forgery alert. 1 row on ${forgedWl}`]);
		expect(notes).toHaveLength(1);
		// no lane was reserved: no holder, no launch: attempt
		expect(ledger.workload(forgedWl)!.holder).toBeNull();
		expect(ledger.entries(forgedWl).some((e) => e.body.startsWith("launch:"))).toBe(false);

		// again: refused by the recorded hit, no second row, no second alarm
		expect(laneScript.reserve(ledger, forgedWl, "test", false, SHOW, alarm)).toEqual({ ok: false, reason: "forgery-hold" });
		expect(ledger.entries(forgedWl).filter((e) => e.body.startsWith("forgery:"))).toHaveLength(1);
		expect(spoken).toHaveLength(1);

		const ok = laneScript.reserve(ledger, clean, "test", false, SHOW, alarm);
		expect(ok.ok).toBe(true);
		expect(spoken).toHaveLength(1);
	});
});

describe("R13: the LOUD needs-you line", () => {
	test("each unanswered hit has a LOUD line with its row, rule, consequences and the two words; it goes once Jo confirms or reverses", () => {
		const { c, ledger } = world();
		const a = ledger.openWorkload({ by: SURFACE_BY, brief: "a", stakes: "normal", mode: "autonomous" });
		c.plusHours(0.01);
		const b = ledger.openWorkload({ by: SURFACE_BY, brief: "b", stakes: "normal", mode: "autonomous" });
		const rowA = forgedPlan(ledger, a);
		const rowB = forgedPlan(ledger, b);
		c.plusHours(0.1);
		expect(errorLines(ledger).filter((l) => l.kind === "forgery")).toEqual([]);
		forgeryPass(ledger, AUTOBOARD_WINDOW_MS);
		const loud = () => errorLines(ledger).filter((l) => l.kind === "forgery");
		expect(loud().map((l) => [l.workloadId, l.rowId])).toEqual([[a, rowA], [b, rowB]]);
		const lineA = loud()[0]!.line;
		expect(lineA.startsWith(`LOUD: forgery check flagged ${rowA} on ${a} (F5, `)).toBe(true);
		expect(lineA).toContain("nothing cites it yet");
		expect(lineA).toContain(`answer confirm ${rowA} (it was Jo's) / reverse ${rowA} (it was not)`);
		// the forgery lines come first
		expect(errorLines(ledger)[0]!.kind).toBe("forgery");

		confirm(ledger, a, rowA);
		expect(loud().map((l) => l.rowId)).toEqual([rowB]);
		reverse(ledger, b, rowB);
		expect(loud()).toEqual([]);
	});
});

describe("R14: merge-train.ts stakes --hold-ok", () => {
	const GH = `#!/bin/sh
dir="$(cd "$(dirname "$0")/.." && pwd)"
if [ "$1 $2" = "pr view" ] && [ -f "$dir/prs/$3.json" ]; then cat "$dir/prs/$3.json"; exit 0; fi
echo "gh: not found" >&2
exit 1
`;
	function script(dbPath: string) {
		const root = tmp("forgery-stakes");
		mkdirSync(join(root, "bin"));
		mkdirSync(join(root, "prs"));
		writeFileSync(join(root, "bin", "gh"), GH);
		chmodSync(join(root, "bin", "gh"), 0o755);
		const pr = (n: number, branch: string) => writeFileSync(join(root, "prs", `${n}.json`), JSON.stringify({
			number: n, headRefName: branch, isCrossRepository: false, headRepository: { name: "product" }, headRepositoryOwner: { login: "thewolff" },
		}));
		const run = (n: number, o: { holdOk?: boolean; own?: string } = {}) => {
			const env: Record<string, string | undefined> = { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`, [LEDGER_DB_ENV]: dbPath };
			delete env.AGENT_SYSTEM_WORKLOAD_ID;
			if (o.own !== undefined) env.AGENT_SYSTEM_WORKLOAD_ID = o.own;
			const args = ["stakes", ...(o.holdOk === false ? [] : ["--hold-ok"]), "--repo", "thewolff/product", "--pr", String(n)];
			const r = Bun.spawnSync([process.execPath, CLI, ...args], { cwd: root, stdout: "pipe", stderr: "pipe", env });
			return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
		};
		return { pr, run };
	}

	test("a hit not yet recorded, then recorded, answers hold: forgery <row id>; confirmed, it does not; without --hold-ok no check runs", () => {
		const { c, ledger, path } = world();
		const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "a PR's workload", stakes: "normal", mode: "autonomous" });
		const row = forgedPlan(ledger, wl);
		c.plusHours(0.1);
		const s = script(path);
		s.pr(7, `wl/${wl}`);
		expect(forgeryStakesHold(ledger, [wl])).toBe(`hold: forgery ${row} F5 on ${wl}`);
		expect(s.run(7)).toEqual({ code: 0, out: `hold: forgery ${row} F5 on ${wl}`, err: "" });
		expect(s.run(7, { holdOk: false }).out).not.toContain("forgery");
		forgeryPass(ledger, AUTOBOARD_WINDOW_MS);
		expect(unansweredHits(ledger, wl)).toHaveLength(1);
		expect(s.run(7).out).toBe(`hold: forgery ${row} F5 on ${wl}`);
		confirm(ledger, wl, row);
		expect(forgeryStakesHold(ledger, [wl])).toBeNull();
		const after = s.run(7);
		expect(after.out).not.toContain("hold: forgery");
		expect(after.out.length).toBeGreaterThan(0);
	});

	test("the train's own workload (AGENT_SYSTEM_WORKLOAD_ID) is checked too; a clean PR workload alone holds nothing", () => {
		const { c, ledger, path } = world();
		const prWl = ledger.openWorkload({ by: SURFACE_BY, brief: "a clean PR workload", stakes: "normal", mode: "autonomous" });
		const train = ledger.openWorkload({ by: SURFACE_BY, brief: "merge train", stakes: "normal", mode: "autonomous" });
		const row = forgedPlan(ledger, train, "lane-train-1");
		c.plusHours(0.1);
		const s = script(path);
		s.pr(8, `wl/${prWl}`);
		expect(s.run(8, { own: train }).out).toBe(`hold: forgery ${row} F5 on ${train}`);
		expect(s.run(8).out).not.toContain("hold: forgery");
	});
});
