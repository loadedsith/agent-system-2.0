/**
 * Jo's OpenAI-reviews-only rule (input in-mvro2xb4w0918v; classifier/src/lab.ts OPENAI_REVIEWS_ONLY_RULE) at the decision
 * function, classifier/src/headroom.ts `decisionFor(selector, comparators, use)`. Until 2026-11-02T18:03Z a `review` is not
 * refused for OpenAI week pace alone, and an `unnamed-lane` is refused every OpenAI model; from then on both uses decide
 * exactly as no use does. The spawn-level review path is in crosslab.test.ts; surface/scripts/lane.ts passes `unnamed-lane`.
 */
import { describe, expect, test } from "bun:test";
import { headroom } from "../src/headroom";
import type { Headroom } from "../src/headroom";
import { OPENAI_REVIEWS_ONLY_RULE } from "../src/lab";

const MIN = 60_000;
const HOUR = 60 * MIN;
const WEEK_MIN = 7 * 24 * 60;
const END = Date.parse("2026-11-02T18:03:00Z");
/** The live figures at 2026-10-28T05:22Z: openai-codex 7d 0.70 used, resetting at the rule's end, projected 3.34. */
const LIVE = END - (5 * 24 * 60 + 12 * 60 + 41) * MIN;
const OPUS = "anthropic/claude-opus-5-5";
const SOL = "openai-codex/gpt-6.1-sol";
const STRONG = [OPUS, SOL];
const RULE_NOTE = "OpenAI week pace does not hold back a review until 2026-11-02T18:03Z (Jo, in-mvro2xb4w0918v)";
const LANE_OUT = "OpenAI is for reviews only until 2026-11-02T18:03Z (Jo, in-mvro2xb4w0918v)";

type Lim = { provider: string; windowId: string; usedFraction: number; resetsAt: number; tier: null };
const lim = (provider: string, windowId: string, usedFraction: number, resetsAt: number): Lim => ({ provider, windowId, usedFraction, resetsAt, tier: null });
const line = (t: number, limits: Lim[]) => JSON.stringify({ t: t / 1000, rows: {}, limits });
/** One fresh poll at `now`. */
const at = (now: number, limits: Lim[]): Headroom => headroom({ lines: [line(now, limits)], now });
/** OpenAI's week, mature at `now` (2016 min gone) at `used`: 0.21 projects 1.05, week pace alone. */
const openaiWeek = (now: number, used: number) => lim("openai-codex", "7d", used, now + (WEEK_MIN - 2016) * MIN);
/** Two polls 26 min apart where hotter, still in-quota Claude would retain OpenAI's week-only source against `[OPUS]`. */
const retaining = (now: number): Headroom =>
	headroom({
		now,
		lines: [
			line(now - 27 * MIN, [openaiWeek(now, 0.2), lim("anthropic", "5h", 0.04, now + 2 * HOUR)]),
			line(now - MIN, [openaiWeek(now, 0.21), lim("anthropic", "5h", 0.34, now + 2 * HOUR)]),
		],
	});
/** surface/scripts/lane.ts moveOff's destination: the first strong-row entry an unnamed lane may move onto. */
const moveTarget = (room: Headroom) => STRONG.find(s => room.decisionFor(s, [], "unnamed-lane").out === null);

test("the rule ends at OpenAI's weekly reset and cites Jo's ruling", () => {
	expect(OPENAI_REVIEWS_ONLY_RULE).toEqual({ input: "in-mvro2xb4w0918v", lab: "openai", endsAt: END });
});

describe("review: OpenAI week pace alone does not skip a review hand before the rule ends", () => {
	test("the live figures: refused without a use, admitted as a review with the rule in its explanation", () => {
		const room = at(LIVE, [lim("openai-codex", "7d", 0.7, END), lim("anthropic", "7d", 0.4, LIVE + 3 * 24 * HOUR)]);
		const base = room.decisionFor(SOL);
		expect(base.out).toMatch(/^openai-codex 7d 0\.70 used, window pace \+[\d.]+ pts\/h, projected 3\.3\d at reset 2026-11-02T18:03Z$/);
		for (const comparators of [[], [OPUS]]) {
			const review = room.decisionFor(SOL, comparators, "review");
			expect(review.out).toBeNull();
			expect(review.retained).toBe(`admitted ${SOL} for review: ${base.out}; ${RULE_NOTE}`);
		}
	});

	test("hard limits still refuse a review: a used-up or exhausted week, the 5h ceiling, and a 5h pace projection", () => {
		const now = LIVE;
		const cases: Lim[][] = [
			[lim("openai-codex", "7d", 1, END)],
			[lim("openai-codex", "7d", 1, now + (WEEK_MIN - 59) * MIN)], // before warm-up: exhausted, not projected
			[lim("openai-codex", "7d", 0.7, END), lim("openai-codex", "5h", 0.85, now + 4.9 * HOUR)],
			[lim("openai-codex", "7d", 0.7, END), lim("openai-codex", "5h", 0.6, now + 2 * HOUR)],
		];
		for (const limits of cases) {
			const room = at(now, limits);
			const base = room.decisionFor(SOL);
			expect(base.out).not.toBeNull();
			expect(room.decisionFor(SOL, [OPUS], "review")).toEqual({ out: base.out, retained: null });
		}
	});

	test("an Anthropic review is decided exactly as without a use", () => {
		const room = at(LIVE, [lim("anthropic", "5h", 0.85, LIVE + 4.9 * HOUR)]);
		expect(room.decisionFor(OPUS, [SOL], "review")).toEqual(room.decisionFor(OPUS, [SOL]));
		expect(room.decisionFor(OPUS, [SOL], "review").out).toBe("anthropic 5h 0.85 used > 0.80");
	});

	test("budget retention still comes first and keeps its own explanation", () => {
		const room = retaining(LIVE);
		expect(room.decisionFor(SOL, [OPUS], "review")).toEqual(room.decisionFor(SOL, [OPUS]));
		expect(room.decisionFor(SOL, [OPUS], "review").retained).toStartWith(`retained ${SOL}: `);
	});
});

describe("unnamed-lane: an unnamed builder lane never runs on OpenAI before the rule ends", () => {
	test("an in-quota OpenAI model is refused; Anthropic is decided on its quota alone", () => {
		const room = at(LIVE, [openaiWeek(LIVE, 0.05), lim("anthropic", "7d", 0.4, LIVE + 3 * 24 * HOUR)]);
		expect(room.decisionFor(SOL)).toEqual({ out: null, retained: null });
		expect(room.decisionFor(SOL, [OPUS], "unnamed-lane")).toEqual({ out: LANE_OUT, retained: null });
		expect(room.decisionFor(OPUS, [SOL], "unnamed-lane")).toEqual({ out: null, retained: null });
		expect(moveTarget(room)).toBe(OPUS);
	});

	test("budget retention cannot keep an unnamed lane on OpenAI (the 10:14 PM merge-train lane)", () => {
		const room = retaining(LIVE);
		expect(room.decisionFor(SOL, [OPUS]).retained).toStartWith(`retained ${SOL}: `);
		expect(room.decisionFor(SOL, STRONG, "unnamed-lane")).toEqual({ out: LANE_OUT, retained: null });
		expect(moveTarget(room)).toBe(OPUS);
	});

	test("never moves onto OpenAI: with Opus hard-out there is no destination", () => {
		const room = at(LIVE, [lim("anthropic", "5h", 0.85, LIVE + 4.9 * HOUR), openaiWeek(LIVE, 0.05)]);
		expect(STRONG.find(s => room.decisionFor(s).out === null)).toBe(SOL);
		expect(moveTarget(room)).toBeUndefined();
	});

	test("unreadable, stale or empty polls still refuse OpenAI to an unnamed lane, and nothing else", () => {
		for (const room of [
			headroom({ path: "/nonexistent/as2-openai-reviews-only/polls.jsonl", now: LIVE }),
			headroom({ lines: [line(LIVE - 20 * MIN, [])], now: LIVE }),
			headroom({ lines: [], now: LIVE }),
		]) {
			expect(room.note).not.toBeNull();
			expect(room.decisionFor(SOL, STRONG, "unnamed-lane")).toEqual({ out: LANE_OUT, retained: null });
			expect(room.decisionFor(SOL, STRONG, "review")).toEqual({ out: null, retained: null });
			expect(room.decisionFor(OPUS, STRONG, "unnamed-lane")).toEqual({ out: null, retained: null });
		}
	});
});

describe("from 2026-11-02T18:03Z both uses decide exactly as no use does", () => {
	for (const now of [END, END + 1, END + 3 * 24 * HOUR]) {
		test(`at ${new Date(now).toISOString()}`, () => {
			const rooms = [
				at(now, [openaiWeek(now, 0.21)]), // week pace only
				at(now, [openaiWeek(now, 0.05)]), // in quota
				at(now, [lim("openai-codex", "7d", 1, now + 24 * HOUR)]), // exhausted
				retaining(now),
				headroom({ lines: [], now }),
			];
			for (const room of rooms) {
				for (const selector of STRONG) {
					for (const comparators of [[], STRONG]) {
						const base = room.decisionFor(selector, comparators);
						expect(room.decisionFor(selector, comparators, "review")).toEqual(base);
						expect(room.decisionFor(selector, comparators, "unnamed-lane")).toEqual(base);
					}
				}
			}
			expect(at(now, [openaiWeek(now, 0.21)]).decisionFor(SOL, [], "review").out).toContain("projected 1.05");
			expect(moveTarget(at(now, [lim("anthropic", "5h", 0.85, now + 4.9 * HOUR), openaiWeek(now, 0.05)]))).toBe(SOL);
		});
	}
});
