/**
 * (b) higher-of-top-two below the threshold, never lower; (c) the stakes cap pulls down and
 * records; plus the brief-field reading the cap depends on.
 */
import { describe, expect, test } from "bun:test";
import { briefStakes } from "../src/brief";
import { type KindAnswer, route } from "../src/route";

const answer = (choice: KindAnswer["choice"], confidence: number, probabilities: KindAnswer["probabilities"]) => ({
	choice,
	confidence,
	probabilities,
});

describe("low-confidence rule (SPEC-2.0.md § A1.3)", () => {
	test("below 0.55 dispatches at the higher tier of the top two kinds and records the pull-up", () => {
		const r = route(answer("understand", 0.42, { understand: 0.54, judge: 0.46 }), null);
		expect(r.lowConfidence).toBe(true);
		expect(r.topTwo).toEqual(["understand", "judge"]);
		expect(r.classifiedTier).toBe("standard");
		expect(r.tier).toBe("deep");
		expect(r.pullUp).toEqual({ from: "standard", to: "deep" });
	});

	test("never lower: a low-confidence judge whose runner-up is locate stays on deep", () => {
		const r = route(answer("judge", 0.4, { judge: 0.5, locate: 0.45, understand: 0.05 }), null);
		expect(r.tier).toBe("deep");
		expect(r.pullUp).toBeNull();
	});

	test("the third kind does not count, only the top two", () => {
		const r = route(answer("locate", 0.3, { locate: 0.4, understand: 0.35, judge: 0.25 }), null);
		expect(r.topTwo).toEqual(["locate", "understand"]);
		expect(r.tier).toBe("standard");
	});

	test("a tie for second place breaks toward the higher tier", () => {
		const r = route(answer("understand", 0.3, { understand: 0.5, locate: 0.25, "change-large": 0.25 }), null);
		expect(r.topTwo).toEqual(["understand", "change-large"]);
		expect(r.tier).toBe("strong");
	});

	test("the threshold is strict: 0.55 routes as classified, just under it is flagged", () => {
		const probabilities = { understand: 0.6, judge: 0.4 };
		expect(route(answer("understand", 0.55, probabilities), null)).toMatchObject({ lowConfidence: false, tier: "standard" });
		expect(route(answer("understand", 0.5499, probabilities), null)).toMatchObject({ lowConfidence: true, tier: "deep" });
	});

	test("above the threshold a strong runner-up changes nothing", () => {
		const r = route(answer("locate", 0.82, { locate: 0.5, judge: 0.5 }), null);
		expect(r).toMatchObject({ lowConfidence: false, tier: "fast", pullUp: null });
	});
});

describe("stakes cap (SPEC-2.0.md § B4)", () => {
	test("normal caps a judge at strong and records the pull-down", () => {
		const r = route(answer("judge", 0.98, { judge: 0.98, understand: 0.02 }), "normal");
		expect(r).toMatchObject({ cap: "strong", tier: "strong", pullDown: { from: "deep", to: "strong" } });
	});

	test("throwaway caps everything at fast; production leaves deep alone", () => {
		expect(route(answer("change-large", 0.9, { "change-large": 0.9 }), "throwaway")).toMatchObject({
			tier: "fast",
			pullDown: { from: "strong", to: "fast" },
		});
		expect(route(answer("judge", 0.9, { judge: 0.9 }), "production")).toMatchObject({ tier: "deep", pullDown: null });
	});

	test("a cap at or above the tier records nothing", () => {
		expect(route(answer("locate", 0.9, { locate: 0.9 }), "normal")).toMatchObject({ tier: "fast", pullDown: null });
	});

	test("the cap applies after the pull-up, and both are recorded", () => {
		const r = route(answer("understand", 0.42, { understand: 0.54, judge: 0.46 }), "normal");
		expect(r.pullUp).toEqual({ from: "standard", to: "deep" });
		expect(r.pullDown).toEqual({ from: "deep", to: "strong" });
		expect(r.tier).toBe("strong");
	});

	test("no stakes on the brief applies no cap and says so", () => {
		expect(route(answer("judge", 0.9, { judge: 0.9 }), null)).toMatchObject({ stakes: null, cap: null, tier: "deep" });
	});
});

describe("stakes field on the brief (SPEC-2.0.md § B9 field 5)", () => {
	test("reads bulleted and bold field lines, case-insensitively", () => {
		expect(briefStakes("# Task\n- **stakes**: Production\n", undefined)).toBe("production");
		expect(briefStakes("stakes: throwaway", undefined)).toBe("throwaway");
	});

	test("task text wins over the shared context; context fills in when the task has none", () => {
		expect(briefStakes("stakes: normal", "stakes: production")).toBe("normal");
		expect(briefStakes("task: do it", "stakes: production")).toBe("production");
	});

	test("an unknown value or a mid-line mention is not a stakes field", () => {
		expect(briefStakes("stakes: high", undefined)).toBeNull();
		expect(briefStakes("the stakes: production are high", undefined)).toBeNull();
	});
});
