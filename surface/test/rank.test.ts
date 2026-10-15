// new guard: no fail-before
//
// sl-rank-core of wl-mv8k039gvogt8g (PLAN rev 5 § 2 D1–D4, § 3 T1–T6): the ranking core surface/src/rank.ts, which does
// not exist before this slice, so this file fails on its import until the build. T5's askJudgment half lives in
// classifier/test/judge-ask.test.ts. Ledgers are real temp ledgers (helpers.ts `tempLedger` with a settable clock);
// the lane tool is driven through the fake extension API as lane-tools.test.ts drives it.
//
// Days: the rank day is the local calendar day (`rankDay`, the decision log's `stamp`), so every instant here is a local
// wall-clock time and the tests hold in any time zone. D is 2026-10-14, a Wednesday.
import { describe, expect, test } from "bun:test";
import { CLASSIFIER_BY, LANE_RUNNER_BY, LANE_STARTER_BY, type Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { ensureStandingWorkload } from "../src/identity";
import { controlEntries } from "../src/launch";
import {
	briefHash, currentGoals, formatAudit, formatGoals, formatOverride, formatShown, formatSignal, formatSignalFailed, formatUnpin, goalsHash,
	livePins, parseAudit, parseGoals, parseOverride, parseShown, parseSignal, parseSignalFailed, parseUnpin, RANK_WEIGHTS, rankOpen, rankPick,
	rankQuestions, readSignal, scoreSignal, type SignalAnswer, type SignalAnswers, signalCurrent,
} from "../src/rank";
import { RANK_BY, STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import { clock, ctxOf, fakePi, tempLedger } from "./helpers";

/** Local noon on D + `d` (or the given hour), as the ISO instant the ledger stamps. */
const at = (d: number, hour = 12): string => new Date(2026, 9, 14 + d, hour).toISOString();
const DAY = (d: number): string => {
	const t = new Date(2026, 9, 14 + d);
	return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
const D = DAY(0);

const bool = (x: number): SignalAnswer => ({ type: "bool", bool: x });
const goal = (score: number, confidence = 0.9): SignalAnswer => ({ type: "score", score, confidence });
const when = (choice: string, confidence = 0.9): SignalAnswer => ({ type: "choice", choice, confidence });
/** A whole answer set: every bool low (counts as itself), no deadline; `over` replaces answers. */
const answers = (over: SignalAnswers = {}): SignalAnswers => ({
	unblocks_jo: bool(0.1), cuts_spend: bool(0.1), fixes_breakage: bool(0.1), states_deadline: bool(0.05), irreversible: bool(0.05),
	deadline_when: when("none"), ...over,
});

function world(start = at(0)) {
	const c = clock(start);
	const { ledger, path } = tempLedger(c.now);
	ensureStandingWorkload(ledger);
	return { ledger, path, c };
}
const open = (ledger: Ledger, brief: string, mode: "autonomous" | "user-driven" = "autonomous") =>
	ledger.openWorkload({ by: SURFACE_BY, brief, stakes: "normal", mode });
/** A `priority-signal:` on `wl` as the ranking machinery writes it, asked on the workload's brief and `goals`. */
function signal(ledger: Ledger, wl: string, a: SignalAnswers, o: { askedOn?: string; goals?: string[]; brief?: string; by?: string } = {}): void {
	const body = formatSignal({
		brief: briefHash(o.brief ?? ledger.workload(wl)!.brief), goals: goalsHash(o.goals ?? []), askedOn: o.askedOn ?? D,
		judge: "typesafe/jev-1.13.0", tokens: 812, cost: 0.0000341, answers: a,
	});
	ledger.recordEntry({ by: o.by ?? RANK_BY, workloadId: wl, kind: "assumption", body });
}
function setGoals(ledger: Ledger, goals: string[], by = SURFACE_BY): void {
	ledger.recordEntry({ by, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: formatGoals({ input: "in-goals", goals }) });
}
const order = (ledger: Ledger, now: string) => rankOpen(ledger, now).map((i) => i.workloadId);

describe("T1 score (D2)", () => {
	test("fixture answers give the documented score: weights × terms, a low-confidence goal and a noul in the band count 0.5 with ?", () => {
		const s = scoreSignal(answers({
			goal_0: goal(1), goal_1: goal(3, 0.3), unblocks_jo: bool(0.9), fixes_breakage: bool(0.6), cuts_spend: bool(0.2),
		}), D, at(0));
		// goal_max: goal 1 is 1/3; goal 2's level 3 has confidence 0.3, so it counts 0.5 and wins with a ?.
		expect(s.terms.goal_max).toEqual({ value: 0.5, mark: "?", detail: "goal 2" });
		expect(s.terms.fixes_breakage).toMatchObject({ value: 0.5, mark: "?" });
		expect(s.terms.unblocks_jo).toMatchObject({ value: 0.9, mark: "" });
		expect(s.terms.cuts_spend).toMatchObject({ value: 0.2, mark: "" });
		expect(s.terms.urgency.value).toBe(0);
		// 0.30·0.5 + 0.20·0.9 + 0.15·0.5 + 0.20·0 + 0.15·0.2
		expect(s.score).toBe(0.435);
		expect(RANK_WEIGHTS).toEqual({ goal_max: 0.3, unblocks_jo: 0.2, fixes_breakage: 0.15, urgency: 0.2, cuts_spend: 0.15 });
	});

	test("the noul band is [0.35, 0.65] inclusive; a confident goal counts its level / 3", () => {
		const term = (x: number) => scoreSignal(answers({ unblocks_jo: bool(x) }), D, at(0)).terms.unblocks_jo;
		expect([0.34, 0.35, 0.5, 0.65, 0.66].map(term).map((t) => [t.value, t.mark])).toEqual([[0.34, ""], [0.5, "?"], [0.5, "?"], [0.5, "?"], [0.66, ""]]);
		expect(scoreSignal(answers({ goal_0: goal(2, 0.5), goal_1: goal(1) }), D, at(0)).terms.goal_max).toEqual({ value: 2 / 3, mark: "", detail: "goal 1" });
	});

	test("irreversible above 0.65 flags the item and never changes its score; in the band it does not flag", () => {
		const base = scoreSignal(answers({ unblocks_jo: bool(0.9) }), D, at(0));
		const irr = scoreSignal(answers({ unblocks_jo: bool(0.9), irreversible: bool(0.9) }), D, at(0));
		expect(base.flags).toEqual([]);
		expect(irr.flags).toEqual(["irreversible: needs Jo"]);
		expect(irr.score).toBe(base.score);
		expect(scoreSignal(answers({ irreversible: bool(0.6) }), D, at(0)).flags).toEqual([]);
	});

	test("rankOpen orders scored items by score; a tie goes to the older workload", () => {
		const { ledger, c } = world();
		const old = open(ledger, "Older work");
		c.at(at(0, 13));
		const high = open(ledger, "High work");
		c.at(at(0, 14));
		const newer = open(ledger, "Newer work");
		const same = answers({ unblocks_jo: bool(0.9) });
		signal(ledger, newer, same);
		signal(ledger, old, same);
		signal(ledger, high, answers({ unblocks_jo: bool(0.9), fixes_breakage: bool(0.9) }));
		expect(order(ledger, at(0, 15))).toEqual([high, old, newer]);
		const [first] = rankOpen(ledger, at(0, 15));
		// 0.30·0.5 (no goals) + 0.20·0.9 + 0.15·0.9 + 0.20·0 + 0.15·0.1
		expect(first).toMatchObject({ workloadId: high, title: "High work", mode: "autonomous", state: "waiting", score: 0.48 });
	});
});

describe("T2 currency (D3)", () => {
	test("a signal asked on another brief, or before a new rank-goals:, is stale; on the same brief and goals it is current", () => {
		const s = parseSignal(formatSignal({ brief: briefHash("Fix the header"), goals: goalsHash(["ship as2"]), askedOn: D, judge: "typesafe/jev-1.13.0", tokens: null, cost: null, answers: answers() }))!;
		expect(signalCurrent(s, "Fix the header", goalsHash(["ship as2"]), at(5))).toBe(true);
		expect(signalCurrent(s, "Fix the header and the footer", goalsHash(["ship as2"]), at(0))).toBe(false);
		expect(signalCurrent(s, "Fix the header", goalsHash(["ship as2", "cut spend"]), at(0))).toBe(false);
	});

	test("a new rank-goals: unscores every item asked before it; stale and missing items rank after scored ones, oldest first", () => {
		const { ledger, c } = world();
		setGoals(ledger, ["ship as2"]);
		const a = open(ledger, "A: oldest, signal on the old goals");
		c.at(at(0, 13));
		const b = open(ledger, "B: no signal");
		c.at(at(0, 14));
		const cWl = open(ledger, "C: signal on a different brief");
		c.at(at(0, 15));
		const d = open(ledger, "D: newest, current signal");
		signal(ledger, a, answers({ goal_0: goal(3) }), { goals: ["ship as2"] });
		signal(ledger, cWl, answers({ goal_0: goal(3) }), { goals: ["ship as2"], brief: "C as it was first worded" });
		signal(ledger, d, answers({ goal_0: goal(0) }), { goals: ["ship as2"] });
		const before = rankOpen(ledger, at(0, 16));
		// A: 0.30·1 + 0.20·0.1 + 0.15·0.1 + 0.15·0.1; D: the same with goal 0
		expect(before.map((i) => [i.workloadId, i.score ?? i.unscored])).toEqual([[a, 0.35], [d, 0.05], [b, "no signal"], [cWl, "stale signal"]]);

		c.at(at(0, 17));
		setGoals(ledger, ["cut spend"]);
		expect(rankOpen(ledger, at(0, 18)).map((i) => [i.workloadId, i.unscored])).toEqual([[a, "stale signal"], [b, "no signal"], [cWl, "stale signal"], [d, "stale signal"]]);
		signal(ledger, d, answers({ goal_0: goal(0) }), { goals: ["cut spend"] });
		expect(order(ledger, at(0, 18))).toEqual([d, a, b, cWl]);
	});

	test("three failed asks on the (brief, goals) pair read `jev failed`; a success resets the count; failures on another pair do not count", () => {
		const { ledger } = world();
		const wl = open(ledger, "Flaky");
		const brief = ledger.workload(wl)!.brief;
		const fail = (goals: string[]) => ledger.recordEntry({
			by: RANK_BY, workloadId: wl, kind: "assumption",
			body: formatSignalFailed({ brief: briefHash(brief), goals: goalsHash(goals), attempt: 1, failure: "timeout", tokens: null, cost: null }),
		});
		fail(["other goals"]);
		fail([]);
		fail([]);
		expect(readSignal(ledger.entries(wl), brief, goalsHash([]), at(0))).toMatchObject({ failed: 2, unscored: "no signal" });
		fail([]);
		expect(readSignal(ledger.entries(wl), brief, goalsHash([]), at(0))).toMatchObject({ failed: 3, unscored: "jev failed" });
		expect(rankOpen(ledger, at(0)).find((i) => i.workloadId === wl)!.unscored).toBe("jev failed");
		signal(ledger, wl, answers());
		expect(readSignal(ledger.entries(wl), brief, goalsHash([]), at(0))).toMatchObject({ failed: 0, unscored: null });
	});
});

describe("T3 dates (D2 date safety)", () => {
	const dated = (choice: string) => answers({ states_deadline: bool(0.9), deadline_when: when(choice) });
	const urgency = (choice: string, d: number) => scoreSignal(dated(choice), D, at(d)).terms.urgency.value;
	const current = (a: SignalAnswers, d: number) =>
		signalCurrent({ brief: briefHash("b"), goals: goalsHash([]), askedOn: D, judge: "j", tokens: null, cost: null, answers: a }, "b", goalsHash([]), at(d));

	test("`tomorrow` asked on D has urgency 1 on D and D+1, and the signal is stale on D+1", () => {
		expect([urgency("tomorrow", 0), urgency("tomorrow", 1)]).toEqual([1, 1]);
		expect([current(dated("tomorrow"), 0), current(dated("tomorrow"), 1)]).toEqual([true, false]);
		// late on D is still D: the rank day is the local calendar day.
		expect(signalCurrent({ brief: briefHash("b"), goals: goalsHash([]), askedOn: D, judge: "j", tokens: null, cost: null, answers: dated("tomorrow") }, "b", goalsHash([]), at(0, 23))).toBe(true);
	});

	test("`4-7-days` asked on D: 0 on D, 0.5 on D+2, 1 on D+3, and a past window stays 1", () => {
		expect([0, 1, 2, 3, 9].map((d) => urgency("4-7-days", d))).toEqual([0, 0.5, 0.5, 1, 1]);
		expect(scoreSignal(dated("4-7-days"), D, at(0)).terms.urgency.detail).toBe(`due ${DAY(4)}..${DAY(7)}`);
	});

	test("a `later` answer is re-asked on D+1; undated signals never go stale by date", () => {
		expect([current(dated("later"), 0), current(dated("later"), 1)]).toEqual([true, false]);
		expect(urgency("later", 0)).toBe(0);
		expect(current(answers(), 30)).toBe(true);
		// a deadline window with no deadline stated (states_deadline low) is no urgency and no date currency
		const undatedWindow = answers({ deadline_when: when("today") });
		expect([scoreSignal(undatedWindow, D, at(0)).terms.urgency.value, current(undatedWindow, 30)]).toEqual([0, true]);
	});

	test("an uncertain states_deadline counts as dated, marks urgency ?, and stales by date", () => {
		const a = answers({ states_deadline: bool(0.5), deadline_when: when("today") });
		expect(scoreSignal(a, D, at(0)).terms.urgency).toMatchObject({ value: 1, mark: "?" });
		expect(current(a, 1)).toBe(false);
	});

	test("the deadline labels are written out as dates from today; Jev is never asked to do date arithmetic", () => {
		const q = rankQuestions(["ship as2", "cut spend"], "2026-10-14").deadline_when;
		if (q?.type !== "choice") throw new Error("deadline_when is not a choice question");
		const criteria = q.criteria;
		expect(Object.keys(criteria)).toEqual(["none", "today", "tomorrow", "2-3-days", "4-7-days", "later"]);
		expect(criteria.tomorrow).toContain("Thursday 2026-10-15");
		expect(criteria["2-3-days"]).toContain("Friday 2026-10-16");
		expect(criteria["2-3-days"]).toContain("Saturday 2026-10-17");
		expect(criteria["4-7-days"]).toContain("Sunday 2026-10-18");
		expect(criteria["4-7-days"]).toContain("Wednesday 2026-10-21");
		expect(criteria.later).toContain("after Wednesday 2026-10-21");
	});
});

describe("T4 goals (D3)", () => {
	test("no goals: the goal term is 0.5 for every item, and the goals line says none with the words to set them", () => {
		const { ledger } = world();
		const a = open(ledger, "A");
		const b = open(ledger, "B");
		signal(ledger, a, answers());
		signal(ledger, b, answers({ unblocks_jo: bool(0.9) }));
		expect(rankOpen(ledger, at(0)).map((i) => i.terms!.goal_max.value)).toEqual([0.5, 0.5]);
		const g = currentGoals(ledger, at(0));
		expect(g).toMatchObject({ state: "none", lines: [], hash: goalsHash([]) });
		expect(g.line).toStartWith("goals: none");
		expect(g.line).toContain("as2_rank { goals, inputId }");
	});

	test("goals older than 7 days: the goal term is 0.5 for every item and the line says stale since the day they lapsed", () => {
		const { ledger, c } = world();
		setGoals(ledger, ["ship as2"]);
		const hit = open(ledger, "Delivers the goal");
		c.at(at(0, 13));
		const miss = open(ledger, "Unrelated");
		signal(ledger, hit, answers({ goal_0: goal(3) }), { goals: ["ship as2"] });
		signal(ledger, miss, answers({ goal_0: goal(0) }), { goals: ["ship as2"] });
		c.at(at(6, 23));
		expect(currentGoals(ledger, at(6, 23))).toMatchObject({ state: "set", lines: ["ship as2"], line: `goals: set ${D}` });
		expect(rankOpen(ledger, at(6, 23)).map((i) => [i.workloadId, i.terms!.goal_max.value])).toEqual([[hit, 1], [miss, 0]]);
		const stale = currentGoals(ledger, at(7, 13));
		expect(stale).toMatchObject({ state: "stale", lines: ["ship as2"], hash: goalsHash(["ship as2"]) });
		expect(stale.line).toStartWith(`goals: stale since ${DAY(7)}`);
		expect(stale.line).toContain("as2_rank { goals, inputId }");
		// the signals stay current (same goals hash) and both read 0.5: the oldest wins the tie
		expect(rankOpen(ledger, at(7, 13)).map((i) => [i.workloadId, i.terms!.goal_max.value, i.score])).toEqual([[hit, 0.5, 0.2], [miss, 0.5, 0.2]]);
	});

	test("the newest rank-goals: is the one in force; the questions carry one goal_<i> Score 0–3 per line and none without goals", () => {
		const { ledger, c } = world();
		setGoals(ledger, ["old goal"]);
		c.at(at(0, 13));
		setGoals(ledger, ["ship as2", "cut spend"]);
		expect(currentGoals(ledger, at(0, 14)).lines).toEqual(["ship as2", "cut spend"]);
		const q = rankQuestions(["ship as2", "cut spend"], D);
		expect(Object.keys(q).sort()).toEqual(["cuts_spend", "deadline_when", "fixes_breakage", "goal_0", "goal_1", "irreversible", "states_deadline", "unblocks_jo"]);
		const g1 = q.goal_1;
		if (g1?.type !== "score") throw new Error("goal_1 is not a score question");
		expect(g1.criteria).toHaveLength(4);
		expect(g1.instructions).toContain("cut spend");
		for (const name of ["unblocks_jo", "cuts_spend", "fixes_breakage", "states_deadline", "irreversible"]) expect(q[name]!.type).toBe("bool");
		expect(Object.keys(rankQuestions([], D)).filter((k) => k.startsWith("goal_"))).toEqual([]);
	});
});

describe("T5 scope and state (D1)", () => {
	test("the standing workload, due: rows and closed workloads are never ranked; user-driven ones are", () => {
		const { ledger, c } = world();
		const due = ledger.openWorkload({ by: SURFACE_BY, brief: "due:2026-11-01 renew the cert", stakes: "normal", mode: "autonomous" });
		const closed = open(ledger, "Closed work");
		signal(ledger, closed, answers({ unblocks_jo: bool(0.99) }));
		ledger.closeWorkload(closed, { by: SURFACE_BY });
		const auto = open(ledger, "Autonomous work");
		c.at(at(0, 13));
		const byHand = open(ledger, "User-driven work", "user-driven");
		const ranked = rankOpen(ledger, at(0, 14)).map((i) => [i.workloadId, i.mode]);
		expect(ranked).toEqual([[auto, "autonomous"], [byHand, "user-driven"]]);
		for (const gone of [STANDING_WORKLOAD_ID, due, closed]) expect(ranked.map(([id]) => id)).not.toContain(gone);
	});

	test("running: a lane-* holder under a live lease, an interactive lane on a user-driven workload too; a lapsed lease or Jo's hold is waiting", () => {
		const { ledger, c } = world();
		const auto = open(ledger, "Autonomous, lane running");
		const inter = open(ledger, "User-driven, interactive lane", "user-driven");
		const lapsed = open(ledger, "Lease lapsed");
		c.at(at(0, 13));
		const jo = open(ledger, "Handed to Jo");
		expect(ledger.claimWorkload(auto, { by: LANE_STARTER_BY, holder: "lane-a-1", leaseMs: 2 * 60 * 60_000 }).won).toBe(true);
		expect(ledger.claimWorkload(inter, { by: LANE_STARTER_BY, holder: "lane-i-1", leaseMs: 2 * 60 * 60_000 }).won).toBe(true);
		expect(ledger.claimWorkload(lapsed, { by: LANE_STARTER_BY, holder: "lane-l-1", leaseMs: 60_000 }).won).toBe(true);
		expect(ledger.claimWorkload(jo, { by: LANE_STARTER_BY, holder: "lane-j-1", leaseMs: 2 * 60 * 60_000 }).won).toBe(true);
		expect(ledger.handoffWorkload(jo, { by: "lane-j-1", holder: "lane-j-1", to: "jo" }).ok).toBe(true);
		c.at(at(0, 14));
		const state = Object.fromEntries(rankOpen(ledger, at(0, 14)).map((i) => [i.workloadId, i.state]));
		expect(state).toEqual({ [auto]: "running", [inter]: "running", [lapsed]: "waiting", [jo]: "waiting" });
		expect(rankPick(ledger, at(0, 14)).map((i) => i.workloadId)).toEqual([lapsed, jo]);
	});

	test("rankOpen and rankPick write nothing", () => {
		const { ledger } = world();
		const wl = open(ledger, "Read only");
		signal(ledger, wl, answers());
		const count = () => ledger.db.query<{ n: number }, []>("SELECT (SELECT count(*) FROM entries) + (SELECT count(*) FROM provenance) AS n").get()!.n;
		const before = count();
		rankOpen(ledger, at(0));
		rankPick(ledger, at(0));
		currentGoals(ledger, at(0));
		livePins(ledger);
		expect(count()).toBe(before);
	});
});

describe("pins (D4): rankOpen honours them, rankPick ignores them", () => {
	test("pinned items rank first, newest pin first, with their Jev score; unpin and closing end a pin; rankPick keeps Jev's waiting order", () => {
		const { ledger, c } = world();
		const top = open(ledger, "Jev's top");
		const mid = open(ledger, "Jev's middle");
		const low = open(ledger, "Jev's last");
		signal(ledger, top, answers({ unblocks_jo: bool(0.9), fixes_breakage: bool(0.9) }));
		signal(ledger, mid, answers({ unblocks_jo: bool(0.9) }));
		signal(ledger, low, answers());
		const pin = (wl: string, input: string) => ledger.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: formatOverride({ workloadId: wl, input, shown: "en-shown" }) });
		pin(low, "in-1");
		c.at(at(0, 13));
		pin(mid, "in-2");
		const ranked = rankOpen(ledger, at(0, 14));
		expect(ranked.map((i) => [i.workloadId, i.pinned?.input ?? null])).toEqual([[mid, "in-2"], [low, "in-1"], [top, null]]);
		expect(ranked[1]!.score).toBe(0.2);
		expect(rankPick(ledger, at(0, 14)).map((i) => [i.workloadId, i.pinned])).toEqual([[top, undefined], [mid, undefined], [low, undefined]]);

		c.at(at(0, 15));
		ledger.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: formatUnpin({ workloadId: mid, input: "in-3" }) });
		ledger.closeWorkload(low, { by: SURFACE_BY });
		expect(livePins(ledger)).toEqual([]);
		expect(order(ledger, at(0, 16))).toEqual([top, mid]);
		c.at(at(0, 17));
		pin(mid, "in-4");
		expect(livePins(ledger).map((p) => [p.workloadId, p.input])).toEqual([[mid, "in-4"]]);
	});
});

describe("T6 writers (D3)", () => {
	const ROWS: [string, string, string][] = [
		["priority-signal", RANK_BY, formatSignal({ brief: briefHash("b"), goals: goalsHash([]), askedOn: D, judge: "typesafe/jev-1.13.0", tokens: 812, cost: 0.0000341, answers: answers() })],
		["priority-signal-failed", RANK_BY, formatSignalFailed({ brief: briefHash("b"), goals: goalsHash([]), attempt: 2, failure: "malformed", tokens: 900, cost: null })],
		["rank-shown", RANK_BY, formatShown({ by: "pick", goals: goalsHash([]), items: [{ workloadId: "wl-a", score: 0.435, state: "waiting" }, { workloadId: "wl-b", state: "running", pinned: true }] })],
		["rank-goals", SURFACE_BY, formatGoals({ input: "in-1", goals: ["ship as2", "cut spend"] })],
		["rank-override", SURFACE_BY, formatOverride({ workloadId: "wl-a", input: "in-2", shown: "en-3" })],
		["rank-unpin", SURFACE_BY, formatUnpin({ workloadId: "wl-a", input: "in-4" })],
		["rank-audit", SURFACE_BY, formatAudit({ from: "2026-10-07", to: "2026-10-14", picks: 4, scorable: 3, top1: 1, top3: 2, meanpct: 0.75, report: "/Users/x/rank-audit/2026-10-14.md" })],
	];

	test("each new prefix is honoured from its own stamp and dropped from every other (validWriter through controlEntries)", () => {
		const { ledger } = world();
		const wl = open(ledger, "Writers");
		const stamps = [RANK_BY, SURFACE_BY, "lane-w-1", LANE_RUNNER_BY, LANE_STARTER_BY, CLASSIFIER_BY];
		for (const [, , body] of ROWS) for (const by of stamps) ledger.recordEntry({ by, workloadId: wl, kind: "assumption", body });
		const read = controlEntries(ledger.entries(wl)).map((c) => [c.prefix, c.createdBy]);
		expect(read).toEqual(ROWS.map(([p, by]) => [p, by]));
	});

	test("a forged row changes nothing: a lane's signal does not score, its goals are not in force, its override is not a pin", () => {
		const { ledger } = world();
		const wl = open(ledger, "Forged");
		signal(ledger, wl, answers({ unblocks_jo: bool(0.99) }), { by: "lane-w-1" });
		setGoals(ledger, ["the lane's goal"], "lane-w-1");
		ledger.recordEntry({ by: RANK_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: formatOverride({ workloadId: wl, input: "in-x", shown: "en-x" }) });
		expect(rankOpen(ledger, at(0))).toEqual([expect.objectContaining({ workloadId: wl, unscored: "no signal" })]);
		expect(rankOpen(ledger, at(0))[0]!.pinned).toBeUndefined();
		expect(currentGoals(ledger, at(0)).state).toBe("none");
	});

	test("lane_record_entry refuses each new prefix, bare and on a slice, with nothing recorded", async () => {
		const { ledger, path } = tempLedger();
		const wl = open(ledger, "Lane forging rank rows");
		ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: "launch: lane-t-1 cause first requested-by test" });
		expect(ledger.claimWorkload(wl, { by: LANE_STARTER_BY, holder: "lane-t-1", leaseMs: 60_000 }).won).toBe(true);
		const f = fakePi(undefined, { exec: false });
		orchestratorSurface(f.pi, { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-t-1", HOME: "/nonexistent-home" }, {});
		const ctx = ctxOf();
		const call = async (params: Record<string, unknown>) => (await f.tool("lane_record_entry").execute("1", params, undefined, undefined, ctx)).content[0]!.text;
		const sl = ledger.addSlice({ by: "lane-t-1", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		const before = ledger.entries(wl).length;
		for (const [p, , body] of ROWS) {
			expect({ p, reply: await call({ body }) }).toEqual({ p, reply: expect.stringContaining(`\`${p}:\` is a reserved control line`) });
			expect({ p, reply: await call({ body: `  ${body}`, slice: sl }) }).toEqual({ p, reply: expect.stringContaining(`\`${p}:\` is a reserved control line`) });
		}
		expect(ledger.entries(wl).length).toBe(before);
	});

	test("every row body reads back as written; malformed bodies read as nothing", () => {
		const [sig, failed, shown, goals, override, unpin, audit] = ROWS.map(([, , body]) => body);
		expect(parseSignal(sig!)).toEqual({ brief: briefHash("b"), goals: goalsHash([]), askedOn: D, judge: "typesafe/jev-1.13.0", tokens: 812, cost: 0.0000341, answers: answers() });
		expect(parseSignalFailed(failed!)).toEqual({ brief: briefHash("b"), goals: goalsHash([]), attempt: 2, failure: "malformed", tokens: 900, cost: null });
		expect(parseShown(shown!)).toMatchObject({ by: "pick", goals: goalsHash([]), items: [{ workloadId: "wl-a", score: 0.435, state: "waiting", pinned: false }, { workloadId: "wl-b", score: null, state: "running", pinned: true }] });
		expect(parseGoals(goals!)).toEqual({ input: "in-1", goals: ["ship as2", "cut spend"] });
		expect(parseOverride(override!)).toEqual({ workloadId: "wl-a", input: "in-2", shown: "en-3" });
		expect(parseUnpin(unpin!)).toEqual({ workloadId: "wl-a", input: "in-4" });
		expect(parseAudit(audit!)).toEqual({ from: "2026-10-07", to: "2026-10-14", picks: 4, scorable: 3, top1: 1, top3: 2, meanpct: 0.75, report: "/Users/x/rank-audit/2026-10-14.md" });
		// a signal missing an answer, a goal level out of range, an unknown deadline label; seven goal lines; a relative report path
		const { irreversible: _, ...partial } = answers();
		const bad = (a: SignalAnswers) => formatSignal({ brief: briefHash("b"), goals: goalsHash([]), askedOn: D, judge: "j", tokens: null, cost: null, answers: a });
		expect(parseSignal(bad(partial))).toBeNull();
		expect(parseSignal(bad(answers({ goal_0: goal(4) })))).toBeNull();
		expect(parseSignal(bad(answers({ deadline_when: when("next-week") })))).toBeNull();
		expect(parseGoals(formatGoals({ input: "in-1", goals: ["1", "2", "3", "4", "5", "6", "7"] }))).toBeNull();
		expect(parseAudit(audit!.replace("report /Users", "report Users"))).toBeNull();
	});
});
