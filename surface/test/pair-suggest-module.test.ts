// new guard: no fail-before
//
// PR 1 of wl-mv67564rdkfvnk (PLAN rev 5 § 2 D2, D3, D5, D6, D8; § 5 `sl-trig-tests`): guards over the new module
// surface/src/pair-suggest.ts, which does not exist before PR 1, so this file fails on its import until the build.
//
// The module's API as these tests pin it (GUESS(design), from the plan's named functions):
//   pairSuggestOn(config: unknown, workloadId: string): boolean
//       `config` is the parsed installed profile config; its `pairSuggest` key is `off` | `all` | a list of workload
//       ids. Missing or malformed reads as off (D2).
//   mechanicalEligibility(ledger: Ledger, workloadId: string, at: string): { eligible: boolean; signals: string[] }
//       Ungated, no jev, no switch: A (from the workload's review rounds), B (with D2's +1), C only with another, over
//       the rows written at or before `at` (D8).
//   pairOffer(ledger: Ledger, workloadId: string, site: "round-limit" | "ceiling", ctx: { config: unknown; count?: RoundCount }):
//       { line: string; signals: string[] } | null
//       Gated by the switch, throwaway stakes and the autonomous mode; A from `ctx.count` at the round-limit site only;
//       E / D1 from classifier-stamped `pair-signal:` entries at 0.70; D5's caps over `pair-offer:` entries; the D6 line.
//   pairSuggestHealth(ledger: Ledger, laneId: string): number
//       D8's `post-signal-failed-rounds`: failed review rounds plus ceiling `extend` answers on the lane's workload
//       between its `lane-started:` and `lane-exit:`, after the lane's first mechanical eligibility moment; 0 with none.
// Signal ids are lower-case `a`, `b`, `c`, `d1`, `d2`, `e`, compared sorted.
import { describe, expect, test } from "bun:test";
import { countRounds, type FindingsOrUnknown, type ReviewVerdict, reviewRoundBody, ROUND_LIMIT_OPTIONS } from "../../classifier/src/rounds";
import { CLASSIFIER_BY, LANE_RUNNER_BY, LANE_STARTER_BY, type Ledger } from "../../ledger/src/index";
import { CEILING_OPTIONS } from "../src/ceiling";
import { laneExitBody, laneStartedBody, PLAN_OPTIONS, planFirstBody, planQuestionBody } from "../src/launch";
import { mechanicalEligibility, pairOffer, pairSuggestHealth, pairSuggestOn } from "../src/pair-suggest";
import { SURFACE_BY } from "../src/types";
import { clock, tempLedger, workloadWithSlice } from "./helpers";

const ON = { setupVersion: 2, pairSuggest: "all" };
const LANE = "lane-t-1";

/** Quoted words over 80 characters: a long steer (signal B). */
const LONG = "Use the existing token scale rather than new pixel values, and keep the header aligned with the sidebar grid.";

/** Jo's words as the orchestrator relays them (`Jo: "<words>" — reading: …`), recorded by the surface as Jo. */
function steer(ledger: Ledger, wl: string, words = LONG, over: { author?: string; channel?: "surface" | "direct" } = {}): void {
	ledger.recordInstruction({ by: SURFACE_BY, workloadId: wl, body: `Jo: "${words}" — reading: steer the lane`, author: over.author ?? "jo", channel: over.channel ?? "surface" });
}

function entry(ledger: Ledger, wl: string, by: string, body: string, sliceId?: string): void {
	ledger.recordEntry({ by, workloadId: wl, kind: "assumption", body, ...(sliceId ? { sliceId } : {}) });
}

const TASTE = (conf: string, by = CLASSIFIER_BY) => (ledger: Ledger, wl: string) =>
	entry(ledger, wl, by, `pair-signal: taste yes ${conf} ambiguous no 0.85 judge typesafe/jev-1.13.0 cost 0.0001`);

/** One single-hand review round of `sl` with `blocking` blocking findings; withheld (a failed round) when blocking is 0. */
function round(ledger: Ledger, wl: string, sl: string, n: number, blocking: number): void {
	const findings: FindingsOrUnknown = { counts: { blocking: blocking ? { correctness: blocking } : {}, major: {}, minor: {} }, titles: [] };
	const verdict: ReviewVerdict = blocking ? "accepted" : "withheld";
	entry(ledger, wl, LANE, reviewRoundBody({ slice: sl, round: n, token: `dt-${sl}-${n}`, group: `dg-${sl}-${n}`, verdict, findings }), sl);
}

const sorted = (o: { signals: string[] } | null) => (o ? [...o.signals].map((s) => s.toLowerCase()).sort() : null);

const ROUND_LIMIT_TAIL = (wl: string) =>
	`Answering pair stops this review loop like stop and switches this workload to user-driven, so you steer the lane yourself (as2 lane ${wl}).`;
const CEILING_TAIL = (wl: string) =>
	`Answering pair is stop plus a switch to user-driven: the autonomous lane stops at the ceiling, and you continue it yourself (as2 lane ${wl}).`;

describe("pairSuggestOn: the switch's one reader (D2)", () => {
	test("off, all and a list", () => {
		expect(pairSuggestOn({ pairSuggest: "off" }, "wl-a")).toBe(false);
		expect(pairSuggestOn({ pairSuggest: "all" }, "wl-a")).toBe(true);
		expect(pairSuggestOn({ pairSuggest: ["wl-a", "wl-b"] }, "wl-a")).toBe(true);
		expect(pairSuggestOn({ pairSuggest: ["wl-b"] }, "wl-a")).toBe(false);
		expect(pairSuggestOn({ pairSuggest: [] }, "wl-a")).toBe(false);
	});

	test("missing or malformed reads as off", () => {
		for (const config of [undefined, null, "all", 7, {}, { setupVersion: 2 }, { pairSuggest: null }, { pairSuggest: 1 }, { pairSuggest: true }, { pairSuggest: "on" }, { pairSuggest: "ALL" }, { pairSuggest: { all: true } }, { pairSuggest: [1, 2] }]) {
			expect({ config, on: pairSuggestOn(config, "wl-a") }).toEqual({ config, on: false });
		}
	});
});

describe("mechanicalEligibility: ungated A, B (+D2), C-with-another (D3, D8)", () => {
	test("B: three long steers from Jo at the surface; two are not enough; short quotes, other authors and direct channel never count", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		steer(ledger, wl);
		steer(ledger, wl);
		steer(ledger, wl, "ok go");
		ledger.recordInstruction({ by: SURFACE_BY, workloadId: wl, body: `Jo: "short" — reading: ${"a long reading that is not Jo's own words ".repeat(3)}`, author: "jo", channel: "surface" });
		steer(ledger, wl, LONG, { channel: "direct" });
		steer(ledger, wl, LONG, { author: "ilex" });
		expect(mechanicalEligibility(ledger, wl, ledger.now())).toEqual({ eligible: false, signals: [] });
		ledger.recordInstruction({ by: SURFACE_BY, workloadId: wl, body: `please ${LONG}`, author: "jo", channel: "surface" });
		const e = mechanicalEligibility(ledger, wl, ledger.now());
		expect(e.eligible).toBe(true);
		expect(sorted(e)).toContain("b");
	});

	test("D2: two revise answers on the plan question add one to B's count", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		entry(ledger, wl, LANE_STARTER_BY, `launch: ${LANE} cause first requested-by test`);
		expect(ledger.claimWorkload(wl, { by: LANE_STARTER_BY, holder: LANE, leaseMs: 60_000 }).won).toBe(true);
		entry(ledger, wl, SURFACE_BY, planFirstBody("stakes production"));
		steer(ledger, wl);
		steer(ledger, wl);
		for (let i = 1; i <= 2; i++) {
			const plan = ledger.addSlice({ by: LANE, workloadId: wl, task: `plan ${i}`, doneCondition: "Jo approves", inputs: "brief" });
			const q = ledger.raiseQuestion({ by: LANE, workloadId: wl, sliceId: plan, body: `/tmp/PLAN.md\n- sl-a: a\ntradeoff: t\nreview: approve, m, /tmp/R.md`, options: [...PLAN_OPTIONS] });
			entry(ledger, wl, LANE, planQuestionBody(q), plan);
			if (i === 1) expect(mechanicalEligibility(ledger, wl, ledger.now()).eligible).toBe(false);
			ledger.answerQuestion(q, { by: SURFACE_BY, answer: "revise", author: "jo", channel: "surface" });
		}
		const e = mechanicalEligibility(ledger, wl, ledger.now());
		expect(e.eligible).toBe(true);
		expect(sorted(e)).toContain("b");
	});

	test("A: two or more rounds with known blocking counts and the last at least the first; a falling count is not A", () => {
		const { ledger } = tempLedger();
		const stalled = workloadWithSlice(ledger);
		round(ledger, stalled.wl, stalled.sl, 1, 2);
		expect(mechanicalEligibility(ledger, stalled.wl, ledger.now()).eligible).toBe(false);
		round(ledger, stalled.wl, stalled.sl, 2, 2);
		const e = mechanicalEligibility(ledger, stalled.wl, ledger.now());
		expect(e.eligible).toBe(true);
		expect(sorted(e)).toContain("a");

		const falling = workloadWithSlice(ledger);
		round(ledger, falling.wl, falling.sl, 1, 2);
		round(ledger, falling.wl, falling.sl, 2, 1);
		expect(mechanicalEligibility(ledger, falling.wl, ledger.now())).toEqual({ eligible: false, signals: [] });
	});

	test("C (no done slice) never alone; jev signals never count here", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		TASTE("0.99")(ledger, wl);
		entry(ledger, wl, CLASSIFIER_BY, "pair-signal: taste no 0.99 ambiguous yes 0.99 judge typesafe/jev-1.13.0 cost 0.0001");
		expect(mechanicalEligibility(ledger, wl, ledger.now())).toEqual({ eligible: false, signals: [] });
	});

	test("only rows written at or before `at` count", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl } = workloadWithSlice(ledger);
		steer(ledger, wl);
		c.plusHours(1);
		steer(ledger, wl);
		c.plusHours(1);
		const before = ledger.now();
		c.plusHours(1);
		steer(ledger, wl);
		expect(mechanicalEligibility(ledger, wl, before).eligible).toBe(false);
		expect(mechanicalEligibility(ledger, wl, ledger.now()).eligible).toBe(true);
	});
});

describe("pairOffer: gates, signals and the D6 line", () => {
	test("gates: switch off or not naming the workload, throwaway stakes, user-driven mode → no offer", () => {
		const { ledger } = tempLedger();
		const mk = (over: { stakes?: "throwaway" | "normal"; mode?: "autonomous" | "user-driven" } = {}) => {
			const { wl } = workloadWithSlice(ledger, over);
			for (let i = 0; i < 3; i++) steer(ledger, wl);
			TASTE("0.95")(ledger, wl);
			return wl;
		};
		const wl = mk();
		expect(pairOffer(ledger, wl, "ceiling", { config: ON })).not.toBeNull();
		expect(pairOffer(ledger, wl, "ceiling", { config: { pairSuggest: "off" } })).toBeNull();
		expect(pairOffer(ledger, wl, "ceiling", { config: { pairSuggest: ["wl-other"] } })).toBeNull();
		expect(pairOffer(ledger, wl, "ceiling", { config: { pairSuggest: [wl] } })).not.toBeNull();
		expect(pairOffer(ledger, wl, "ceiling", { config: null })).toBeNull();
		expect(pairOffer(ledger, mk({ stakes: "throwaway" }), "ceiling", { config: ON })).toBeNull();
		expect(pairOffer(ledger, mk({ mode: "user-driven" }), "ceiling", { config: ON })).toBeNull();
	});

	test("E: taste yes at 0.70 fires and 0.69 does not; taste no, a lane-stamped signal and a failed attempt never fire", () => {
		const { ledger } = tempLedger();
		const at = (f: (l: Ledger, wl: string) => void) => {
			const { wl, sl } = workloadWithSlice(ledger);
			ledger.completeSlice(sl, { by: "lane-a", artifact: "bun test → exit 0" });
			f(ledger, wl);
			return pairOffer(ledger, wl, "ceiling", { config: ON });
		};
		expect(sorted(at(TASTE("0.70")))).toEqual(["e"]);
		expect(at(TASTE("0.69"))).toBeNull();
		expect(at((l, wl) => entry(l, wl, CLASSIFIER_BY, "pair-signal: taste no 0.99 ambiguous no 0.99 judge typesafe/jev-1.13.0 cost 0.0001"))).toBeNull();
		expect(at(TASTE("0.95", LANE))).toBeNull();
		expect(at(TASTE("0.95", SURFACE_BY))).toBeNull();
		expect(at((l, wl) => entry(l, wl, CLASSIFIER_BY, "pair-signal-failed: attempt 1 timeout cost unknown"))).toBeNull();
	});

	test("D1: ambiguous yes at 0.70 or above fires on its own", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		ledger.completeSlice(sl, { by: "lane-a", artifact: "bun test → exit 0" });
		entry(ledger, wl, CLASSIFIER_BY, "pair-signal: taste no 0.90 ambiguous yes 0.85 judge typesafe/jev-1.13.0 cost 0.0001");
		const o = pairOffer(ledger, wl, "ceiling", { config: ON });
		expect(sorted(o)).toEqual(["d1"]);
		expect(o!.line).toStartWith("pair: ");
		expect(o!.line).toEndWith(`. ${CEILING_TAIL(wl)}`);
	});

	test("D6 exact lines: E at the ceiling, B at the ceiling, A at the round limit", () => {
		const { ledger } = tempLedger();
		const e = workloadWithSlice(ledger);
		ledger.completeSlice(e.sl, { by: "lane-a", artifact: "bun test → exit 0" });
		TASTE("0.91")(ledger, e.wl);
		expect(pairOffer(ledger, e.wl, "ceiling", { config: ON })).toEqual({ line: `pair: jev: UI/taste work (0.91). ${CEILING_TAIL(e.wl)}`, signals: ["e"] });

		const b = workloadWithSlice(ledger);
		ledger.completeSlice(b.sl, { by: "lane-a", artifact: "bun test → exit 0" });
		for (let i = 0; i < 4; i++) steer(ledger, b.wl);
		expect(pairOffer(ledger, b.wl, "ceiling", { config: ON })).toEqual({ line: `pair: 4 long steers from you since open. ${CEILING_TAIL(b.wl)}`, signals: ["b"] });

		const a = workloadWithSlice(ledger);
		for (let n = 1; n <= 3; n++) round(ledger, a.wl, a.sl, n, 2);
		const count = countRounds(ledger.entries(a.wl), a.sl);
		const o = pairOffer(ledger, a.wl, "round-limit", { config: ON, count });
		expect(o).toEqual({ line: `pair: blocking 2 → 2 → 2 over rounds 1–3. ${ROUND_LIMIT_TAIL(a.wl)}`, signals: ["a"] });
	});

	test("A only at the round-limit site and only from a stalled count; a falling count offers nothing", () => {
		const { ledger } = tempLedger();
		const stalled = workloadWithSlice(ledger);
		ledger.addSlice({ by: "lane-a", workloadId: stalled.wl, task: "t", doneCondition: "d", inputs: "i" });
		ledger.completeSlice(stalled.sl, { by: "lane-a", artifact: "bun test → exit 0" });
		round(ledger, stalled.wl, stalled.sl, 1, 1);
		round(ledger, stalled.wl, stalled.sl, 2, 1);
		expect(pairOffer(ledger, stalled.wl, "ceiling", { config: ON })).toBeNull();

		const falling = workloadWithSlice(ledger);
		round(ledger, falling.wl, falling.sl, 1, 3);
		round(ledger, falling.wl, falling.sl, 2, 1);
		expect(pairOffer(ledger, falling.wl, "round-limit", { config: ON, count: countRounds(ledger.entries(falling.wl), falling.sl) })).toBeNull();
	});

	test("C: never alone; with B at the ceiling; a done slice removes it; never at the round-limit site", () => {
		const { ledger } = tempLedger();
		const alone = workloadWithSlice(ledger);
		steer(ledger, alone.wl);
		steer(ledger, alone.wl);
		expect(pairOffer(ledger, alone.wl, "ceiling", { config: ON })).toBeNull();

		const withB = workloadWithSlice(ledger);
		for (let i = 0; i < 3; i++) steer(ledger, withB.wl);
		const o = pairOffer(ledger, withB.wl, "ceiling", { config: ON });
		expect(sorted(o)).toEqual(["b", "c"]);
		expect(o!.line).toContain("3 long steers from you since open");
		expect(o!.line).toEndWith(`. ${CEILING_TAIL(withB.wl)}`);
		expect(sorted(pairOffer(ledger, withB.wl, "round-limit", { config: ON, count: countRounds(ledger.entries(withB.wl), withB.sl) }))).toEqual(["b"]);
		ledger.completeSlice(withB.sl, { by: "lane-a", artifact: "bun test → exit 0" });
		expect(sorted(pairOffer(ledger, withB.wl, "ceiling", { config: ON }))).toEqual(["b"]);
	});
});

describe("pairOffer: D5 caps", () => {
	/** A ceiling question the runner raised earlier with an offer on `signals`, as the ceiling site writes it. */
	function priorOffer(ledger: Ledger, wl: string, n: number, signals: string[]): string {
		const sl = ledger.addSlice({ by: LANE_RUNNER_BY, workloadId: wl, id: `sl-ceiling-${wl.slice(3)}-${n}`, task: "ceiling", doneCondition: "Jo answers stop, extend or split", inputs: "spend" });
		const q = ledger.raiseQuestion({ by: LANE_RUNNER_BY, workloadId: wl, sliceId: sl, body: "Ceiling.\npair: reasons.", options: [...CEILING_OPTIONS, "pair"] });
		entry(ledger, wl, LANE_RUNNER_BY, `pair-offer: ${q} site ceiling signals ${signals.join(",")}`);
		return q;
	}

	function bWorkload(ledger: Ledger): string {
		const { wl, sl } = workloadWithSlice(ledger);
		ledger.completeSlice(sl, { by: "lane-a", artifact: "bun test → exit 0" });
		for (let i = 0; i < 3; i++) steer(ledger, wl);
		return wl;
	}

	test("at most two offers per workload", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const wl = bWorkload(ledger);
		priorOffer(ledger, wl, 1, ["b"]);
		c.plusHours(2);
		expect(pairOffer(ledger, wl, "ceiling", { config: ON })).not.toBeNull();
		priorOffer(ledger, wl, 2, ["b"]);
		c.plusHours(2);
		TASTE("0.95")(ledger, wl);
		expect(pairOffer(ledger, wl, "ceiling", { config: ON })).toBeNull();
	});

	test("none within 60 minutes of the last offer", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const wl = bWorkload(ledger);
		priorOffer(ledger, wl, 1, ["b"]);
		c.plusHours(0.5);
		expect(pairOffer(ledger, wl, "ceiling", { config: ON })).toBeNull();
		c.plusHours(0.55);
		expect(sorted(pairOffer(ledger, wl, "ceiling", { config: ON }))).toEqual(["b"]);
	});

	test("after Jo answers a non-pair option on an offered question: none, until a signal not in that offer fires", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const wl = bWorkload(ledger);
		const q = priorOffer(ledger, wl, 1, ["b"]);
		ledger.answerQuestion(q, { by: SURFACE_BY, answer: "extend", author: "jo", channel: "surface" });
		c.plusHours(2);
		steer(ledger, wl);
		expect(pairOffer(ledger, wl, "ceiling", { config: ON })).toBeNull();
		TASTE("0.91")(ledger, wl);
		expect(sorted(pairOffer(ledger, wl, "ceiling", { config: ON }))).toContain("e");
	});
});

describe("pairSuggestHealth: D8's per-lane number, in both groups", () => {
	/**
	 * One lane's span on a fresh workload: `lane-started:`, then (when `eligible`) three long steers, then rounds falling
	 * 5 → 3 → 1 → 0-withheld (all failed, never stalled, so A never fires), one ceiling `extend`, `lane-exit:`, and one
	 * more failed round after the exit. Rounds and the extend all land after the eligibility moment, except round 1.
	 */
	function laneSpan(ledger: Ledger, c: { plusHours: (h: number) => void }, opts: { eligible: boolean; switchOn: boolean }): string {
		const { wl, sl } = workloadWithSlice(ledger);
		const lane = `lane-${wl.slice(3)}-1`;
		if (opts.switchOn) TASTE("0.95")(ledger, wl);
		entry(ledger, wl, LANE_RUNNER_BY, laneStartedBody(lane, { pid: 1, start: "x", session: null, argv: [], runnerPid: 2 }));
		c.plusHours(0.1);
		round(ledger, wl, sl, 1, 5);
		c.plusHours(0.1);
		if (opts.eligible) for (let i = 0; i < 3; i++) steer(ledger, wl);
		c.plusHours(0.1);
		round(ledger, wl, sl, 2, 3);
		c.plusHours(0.1);
		round(ledger, wl, sl, 3, 1);
		c.plusHours(0.1);
		const csl = ledger.addSlice({ by: LANE_RUNNER_BY, workloadId: wl, id: `sl-ceiling-${wl.slice(3)}-1`, task: "ceiling", doneCondition: "Jo answers stop, extend or split", inputs: "spend" });
		const q = ledger.raiseQuestion({ by: LANE_RUNNER_BY, workloadId: wl, sliceId: csl, body: "Ceiling.", options: [...CEILING_OPTIONS] });
		ledger.answerQuestion(q, { by: SURFACE_BY, answer: "extend", author: "jo", channel: "surface" });
		c.plusHours(0.1);
		entry(ledger, wl, LANE_RUNNER_BY, laneExitBody(lane, { code: 0, signal: null, outcome: "completed" }));
		c.plusHours(0.1);
		round(ledger, wl, sl, 4, 0);
		return lane;
	}

	test("on-lane and off-lane with an eligibility moment: failed rounds after it plus extend answers, within the lane's span", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		expect(pairSuggestHealth(ledger, laneSpan(ledger, c, { eligible: true, switchOn: true }))).toBe(3);
		expect(pairSuggestHealth(ledger, laneSpan(ledger, c, { eligible: true, switchOn: false }))).toBe(3);
	});

	test("on-lane and off-lane with no eligibility moment score 0; a jev signal alone is no moment", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		expect(pairSuggestHealth(ledger, laneSpan(ledger, c, { eligible: false, switchOn: true }))).toBe(0);
		expect(pairSuggestHealth(ledger, laneSpan(ledger, c, { eligible: false, switchOn: false }))).toBe(0);
	});
});

describe("D1: pair is appended per question, never to the option constants", () => {
	test("ROUND_LIMIT_OPTIONS and CEILING_OPTIONS are unchanged", () => {
		expect([...ROUND_LIMIT_OPTIONS]).toEqual(["extend", "accept", "stop"]);
		expect([...CEILING_OPTIONS]).toEqual(["stop", "extend", "split"]);
	});
});
