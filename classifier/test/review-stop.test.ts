/**
 * The `stop-reviews` entry (PLAN wl-mupu0sx2o046io D10): the body round-trips, and a stop holds
 * only when it names a Jo instruction the surface wrote for the same target, on the workload or
 * the slice. Rows are built in memory in the ledger's shapes; nothing opens a ledger.
 */
import { describe, expect, test } from "bun:test";
import { parseReviewStop, reviewStopBody, reviewStopOn, stopReviewsInstructionBody } from "../src/review-stop";

const WL = "wl-a";
const SURFACE = "orchestrator-surface";
const entry = (body: string) => ({ kind: "assumption" as const, body });
const instr = (id: string, body: string, over: Partial<{ author: string; created_by: string }> = {}) => ({ id, body, author: "jo", created_by: SURFACE, ...over });

describe("review-stop", () => {
	test("the body round-trips; a target that is not a workload or a slice, or a by that is not an instruction, is not one", () => {
		expect(parseReviewStop(reviewStopBody(WL, "in-1"))).toEqual({ target: WL, by: "in-1" });
		expect(parseReviewStop(reviewStopBody("sl-x", "in-2"))).toEqual({ target: "sl-x", by: "in-2" });
		expect(parseReviewStop("review-stop: q-1 by in-1")).toBeNull();
		expect(parseReviewStop("review-stop: wl-a by en-1")).toBeNull();
	});

	test("a workload stop covers every slice; a slice stop only its slice", () => {
		const onWl = [entry(reviewStopBody(WL, "in-1"))];
		const ins = [instr("in-1", stopReviewsInstructionBody(WL)), instr("in-2", stopReviewsInstructionBody("sl-x"))];
		expect(reviewStopOn(onWl, ins, WL, "sl-x")).toBe("in-1");
		expect(reviewStopOn(onWl, ins, WL, "sl-y")).toBe("in-1");
		expect(reviewStopOn(onWl, ins, "wl-b", "sl-x")).toBeNull();
		const onSl = [entry(reviewStopBody("sl-x", "in-2"))];
		expect(reviewStopOn(onSl, ins, WL, "sl-x")).toBe("in-2");
		expect(reviewStopOn(onSl, ins, WL, "sl-y")).toBeNull();
	});

	test("an entry naming an instruction that is not Jo's surface word for that target stops nothing", () => {
		const e = [entry(reviewStopBody(WL, "in-1"))];
		expect(reviewStopOn(e, [], WL, "sl-x")).toBeNull();
		expect(reviewStopOn(e, [instr("in-1", stopReviewsInstructionBody(WL), { author: "lane-a-1" })], WL, "sl-x")).toBeNull();
		expect(reviewStopOn(e, [instr("in-1", stopReviewsInstructionBody(WL), { created_by: "lane-a-1" })], WL, "sl-x")).toBeNull();
		expect(reviewStopOn(e, [instr("in-1", stopReviewsInstructionBody("sl-x"))], WL, "sl-x")).toBeNull();
		expect(reviewStopOn(e, [instr("in-1", "rounds: 5")], WL, "sl-x")).toBeNull();
		expect(reviewStopOn([{ kind: "instruction" as never, body: reviewStopBody(WL, "in-1") }], [instr("in-1", stopReviewsInstructionBody(WL))], WL, "sl-x")).toBeNull();
	});
});
