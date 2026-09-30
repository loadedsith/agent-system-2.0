// The runner's ceiling meter (DESIGN-workload-ceiling.md § 2 item 4) without spawning anything:
// the pure step over the 80 / 100 thresholds and the ceiling question's state, and the ledger side
// of a raise (slice, question and spend: in one write), of the question's state per ceiling value,
// and of the withdrawal at a clean finish, on a temp ledger.
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { LANE_RUNNER_BY } from "../../ledger/src/index";
import { type Ceiling, CEILING_OPTIONS, ceilingQuestionBody, parseSpend, type Spend } from "../src/ceiling";
import { controlEntries } from "../src/launch";
import { SURFACE_BY } from "../src/types";
import { ceilingKey, ceilingQuestionState, type CeilingQuestionState, type MeterState, meterStep, raiseCeilingQuestion, withdrawCeilingQuestions } from "../scripts/lane";
import { clock, tempLedger, workloadWithSlice } from "./helpers";

const NORMAL: Ceiling = { usd: 50, wallMin: 360 };
const EXTENDED: Ceiling = { usd: 100, wallMin: 720 };
const spent = (usd: number, wallMin = 0): Spend => ({ usd, tokens: 1000, wallMin });
const fresh: MeterState = { raised: [] };
const step = (state: MeterState, ceiling: Ceiling, spend: Spend, question: CeilingQuestionState) => meterStep(state, { ceiling, spend, question });

describe("meterStep: the step matrix", () => {
	test("below 80 % of both halves: nothing", () => {
		expect(step(fresh, NORMAL, spent(39.99, 287), "none")).toEqual({ state: fresh, level: 0, raise: false, stop: false });
	});

	test("exactly 80 % raises once and the lane keeps working; a second poll at 85 % does not raise again, from the ledger's open question or from the runner's own memory", () => {
		const first = step(fresh, NORMAL, spent(40), "none");
		expect(first).toMatchObject({ level: 80, raise: true, stop: false });
		expect(first.state.raised).toEqual([ceilingKey(NORMAL)]);
		expect(step(first.state, NORMAL, spent(42.5), "open")).toMatchObject({ level: 80, raise: false, stop: false });
		// the raise this runner wrote is not in the rows it read (or they were read before the write): memory holds
		expect(step(first.state, NORMAL, spent(42.5), "none")).toMatchObject({ raise: false, stop: false });
		// a relaunched runner has no memory; the ledger's question is enough
		expect(step(fresh, NORMAL, spent(42.5), "open")).toMatchObject({ raise: false, stop: false });
	});

	test("the wall half alone crosses 80 % and 100 %", () => {
		expect(step(fresh, NORMAL, spent(1, 288), "none")).toMatchObject({ level: 80, raise: true, stop: false });
		expect(step(fresh, NORMAL, spent(1, 360), "open")).toMatchObject({ level: 100, raise: false, stop: true });
	});

	test("100 % with the question open stops, without a second question", () => {
		const raised = step(fresh, NORMAL, spent(40), "none").state;
		expect(step(raised, NORMAL, spent(50), "open")).toMatchObject({ level: 100, raise: false, stop: true });
	});

	test("100 % answered stop or split stops; withdrawn stops (stop is the default)", () => {
		for (const q of ["stop", "split", "withdrawn"] as const) expect(step(fresh, NORMAL, spent(51), q)).toMatchObject({ level: 100, raise: false, stop: true });
	});

	test("answered extend: the raised ceiling is the new value, so the lane at the old 100 % continues; an extend whose raise has not landed still stops at the old value", () => {
		const raised = step(fresh, NORMAL, spent(40), "none").state;
		expect(step(raised, EXTENDED, spent(50, 100), "none")).toMatchObject({ level: 0, raise: false, stop: false });
		expect(step(raised, NORMAL, spent(50), "extend")).toMatchObject({ level: 100, raise: false, stop: true });
	});

	test("a jump from 50 % to 100 % between polls stops, and raises the question with the stop so Jo has the answers", () => {
		expect(step(fresh, NORMAL, spent(25), "none")).toMatchObject({ level: 0, raise: false, stop: false });
		const jumped = step(fresh, NORMAL, spent(50), "none");
		expect(jumped).toMatchObject({ level: 100, raise: true, stop: true });
		expect(jumped.state.raised).toEqual([ceilingKey(NORMAL)]);
	});

	test("a new ceiling after extend raises again at its own 80 %, once", () => {
		const raised = step(fresh, NORMAL, spent(40), "none").state;
		expect(step(raised, EXTENDED, spent(79.99), "none")).toMatchObject({ raise: false, stop: false });
		const again = step(raised, EXTENDED, spent(80), "none");
		expect(again).toMatchObject({ level: 80, raise: true, stop: false });
		expect(again.state.raised).toEqual([ceilingKey(NORMAL), ceilingKey(EXTENDED)]);
		expect(step(again.state, EXTENDED, spent(90), "none")).toMatchObject({ raise: false, stop: false });
	});
});

describe("the ledger side of the meter", () => {
	test("a raise is one write stamped lane-runner: the ceiling slice (paused by its question), the question with stop / extend / split, the spend: entry", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl } = workloadWithSlice(ledger);
		const laneId = `lane-${wl.slice(3)}-1`;
		const spend: Spend = { usd: 40.5, tokens: 123456, wallMin: 12.34 };
		const { sliceId, questionId } = raiseCeilingQuestion(ledger, { workloadId: wl, laneId, spend, ceiling: NORMAL, stakes: "normal" });
		expect(sliceId).toBe(`sl-ceiling-${wl.slice(3)}-1`);
		const slice = ledger.slice(sliceId)!;
		expect(slice).toMatchObject({ workload_id: wl, task: "Jo decides the ceiling overrun", inputs: "ceiling", state: "paused", created_by: LANE_RUNNER_BY });
		const q = ledger.question(questionId)!;
		expect(q).toMatchObject({ slice_id: sliceId, state: "open", created_by: LANE_RUNNER_BY, body: ceilingQuestionBody(wl, spend, NORMAL, "normal") });
		expect(JSON.parse(q.options)).toEqual([...CEILING_OPTIONS]);
		const spends = controlEntries(ledger.entries(wl)).filter((e) => e.prefix === "spend");
		expect(spends).toHaveLength(1);
		expect(spends[0]).toMatchObject({ laneId, createdBy: LANE_RUNNER_BY });
		expect(parseSpend(spends[0]!.rest)).toEqual({ usd: 40.5, tokens: 123456, wallMin: 12.3 });
		expect(ceilingQuestionState(ledger.questions(wl), ledger.slices(wl), ledger.instructions(wl), NORMAL)).toBe("open");
		// a second ceiling question on the workload gets the next id
		expect(raiseCeilingQuestion(ledger, { workloadId: wl, laneId, spend, ceiling: EXTENDED, stakes: "normal" }).sliceId).toBe(`sl-ceiling-${wl.slice(3)}-2`);
	});

	test("a raise whose spend: write fails leaves neither the slice nor the question", () => {
		const { ledger, path } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const db = new Database(path);
		db.exec("CREATE TRIGGER fail_spend BEFORE INSERT ON entries WHEN NEW.body LIKE 'spend:%' BEGIN SELECT RAISE(ABORT, 'injected spend failure'); END;");
		db.close();
		expect(() => raiseCeilingQuestion(ledger, { workloadId: wl, laneId: `lane-${wl.slice(3)}-1`, spend: spent(40), ceiling: NORMAL, stakes: "normal" })).toThrow(/injected spend failure/);
		expect(ledger.slices(wl).filter((s) => s.id.startsWith("sl-ceiling-"))).toEqual([]);
		expect(ledger.questions(wl)).toEqual([]);
	});

	test("the question's state is per ceiling value: another value reads none; Jo's answer reads as its option; a lane's own sl-ceiling- slice is not the runner's", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl } = workloadWithSlice(ledger);
		const lane = ledger.addSlice({ by: "lane-a", workloadId: wl, id: `sl-ceiling-plan-${wl.slice(3)}`, task: "plan the ceiling", doneCondition: `the ceiling ${ceilingKey(NORMAL)}`, inputs: "x" });
		ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: lane, body: "approve?", options: ["approve", "revise"] });
		const state = () => ceilingQuestionState(ledger.questions(wl), ledger.slices(wl), ledger.instructions(wl), NORMAL);
		expect(state()).toBe("none");
		c.plusHours(1);
		const { questionId } = raiseCeilingQuestion(ledger, { workloadId: wl, laneId: "lane-x-1", spend: spent(40), ceiling: NORMAL, stakes: "normal" });
		expect(state()).toBe("open");
		expect(ceilingQuestionState(ledger.questions(wl), ledger.slices(wl), ledger.instructions(wl), EXTENDED)).toBe("none");
		c.plusHours(1);
		ledger.answerQuestion(questionId, { by: SURFACE_BY, answer: "extend", author: "jo", channel: "surface" });
		expect(state()).toBe("extend");
	});

	test("a clean finish withdraws the open ceiling question (then cancel: the slice is cancelled), and nothing else", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl } = workloadWithSlice(ledger);
		const own = ledger.addSlice({ by: "lane-a", workloadId: wl, id: `sl-ceiling-own-${wl.slice(3)}`, task: "t", doneCondition: "d", inputs: "i" });
		const ownQ = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: own, body: "b", options: ["a", "b"] });
		c.plusHours(1);
		const { sliceId, questionId } = raiseCeilingQuestion(ledger, { workloadId: wl, laneId: "lane-x-1", spend: spent(40), ceiling: NORMAL, stakes: "normal" });
		c.plusHours(1);
		expect(withdrawCeilingQuestions(ledger, wl)).toEqual([questionId]);
		expect(ledger.question(questionId)!.state).toBe("withdrawn");
		const withdrawal = ledger.instructions(wl).find((i) => i.id === ledger.question(questionId)!.resolved_by)!;
		expect(withdrawal).toMatchObject({ kind: "withdrawal", disposition: "cancel", author: LANE_RUNNER_BY, channel: "direct", created_by: LANE_RUNNER_BY, body: "finished under the ceiling" });
		expect(ledger.slice(sliceId)!.state).toBe("cancelled");
		expect(ledger.question(ownQ)!.state).toBe("open");
		expect(withdrawCeilingQuestions(ledger, wl)).toEqual([]);
		expect(ceilingQuestionState(ledger.questions(wl), ledger.slices(wl), ledger.instructions(wl), NORMAL)).toBe("withdrawn");
	});
});
