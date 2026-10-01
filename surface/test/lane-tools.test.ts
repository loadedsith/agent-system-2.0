// The lane's ledger tools and the plan-first / outcome machinery (DESIGN-lane-launcher.md § 8:
// lifecycle transition and plan-first tests), driven through the fake extension API: ownership
// refusals, reserved and pushed prefixes refused with nothing written, plan-first enforcement
// through Jo's answer at the surface, the plan question held until another lab reviewed the plan
// (PLAN wl-mupu0sx2o046io D8, and its D9 round-limit exception), and the terminal pair ending the
// lane without a death.
import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import {
	handSettledBody, handSpawnBody, laneBuilderBody, PARK_OPTIONS, reviewParkBody, reviewSameLabBody, reviewWithheldBody,
} from "../../classifier/src/lab";
import {
	countRounds, effectiveRoundLimit, ROUND_LIMIT_OPTIONS, reviewLimitBody, reviewLoopEndBody, reviewRoundBody, reviewRoundsExtendBody, roundLimitQuestionBody,
} from "../../classifier/src/rounds";
import { Ledger, type RoutingOutcome } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { reservedStates, waitingReserved } from "../src/errors";
import { planReviewRefusal } from "../extensions/lane-tools";
import { apply, interpret } from "../src/input";
import { controlEntries, holdersOf, PLAN_OPTIONS, planApprovedBody, planFirst, planFirstBody, doneBody } from "../src/launch";
import { LANE_TOOLS, SURFACE_BY } from "../src/types";
import { ctxOf, fakePi, notices, tempLedger } from "./helpers";

const LANE_MODEL = "anthropic/claude-opus-5-5";
const OTHER_LAB = "openai-codex/gpt-6-astra";

function laneFixture(over: { planFirst?: boolean; mode?: "autonomous" | "user-driven" } = {}) {
	const { ledger, path } = tempLedger();
	const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "Move the header offset into a token", stakes: "normal", mode: over.mode ?? "autonomous" });
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the header offset lives in one token") });
	if (over.planFirst) {
		ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: planFirstBody("your word") });
		// The classifier's record of the lab the planning lane answered on (D3 item 1): the plan's builder.
		ledger.recordEntry({ by: "lane-t-1", workloadId: wl, kind: "assumption", body: laneBuilderBody("anthropic", "lane-t-1", LANE_MODEL) });
	}
	ledger.recordEntry({ by: "lane-starter", workloadId: wl, kind: "assumption", body: `launch: lane-t-1 cause first requested-by test` });
	expect(ledger.claimWorkload(wl, { by: "lane-starter", holder: "lane-t-1", leaseMs: 60_000 }).won).toBe(true);
	const env = { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-t-1", HOME: "/nonexistent-home" };
	const f = fakePi();
	orchestratorSurface(f.pi, env, {});
	const ctx = ctxOf();
	const call = async (tool: string, params: Record<string, unknown>) => (await f.tool(tool).execute("1", params, undefined, undefined, ctx)).content[0]!.text;
	return { ledger, path, wl, env, f, ctx, call };
}

// The tool opens its own ledger on the real clock (gates/src/session.ts), so the D8 tests order
// their rows by moving the system clock: `tick()` freezes it 5 ms later; each test ends on real time.
const tick = () => setSystemTime(new Date(Date.now() + 5));
afterEach(() => setSystemTime());

let handSeq = 0;

/**
 * One settled review hand on `slice`, written as the classifier writes it (PLAN D2–D6, D9): an
 * optional spent `review-same-lab:` grant, `hand-spawn:`, the judge routing row, `review-withheld:`
 * when asked, `hand-settled:`, and a `review-round:` when `round` is given. Ticks the clock on both
 * sides so its rows sort strictly between the questions before and after it.
 */
function seedReview(
	ledger: Ledger, wl: string, slice: string,
	over: { ran?: string[]; outcome?: RoutingOutcome; withheld?: boolean; grant?: string; group?: string; round?: number; blocking?: number } = {},
): { token: string; routing: string } {
	tick();
	const n = ++handSeq;
	const token = `dt-t${n}`;
	const group = over.group ?? `dg-t${n}`;
	const ran = over.ran ?? [OTHER_LAB];
	const outcome = over.outcome ?? "ran";
	const entry = (body: string) => ledger.recordEntry({ by: "lane-t-1", workloadId: wl, sliceId: slice, kind: "assumption", body });
	if (over.grant) entry(reviewSameLabBody(over.grant, token));
	entry(handSpawnBody({ token, root: "/tmp/lane-t-1", spawnKey: slice, review: true, group, row: ran }));
	const routing = ledger.recordRouting({
		by: "lane-t-1", workloadId: wl, sliceId: slice, spawnKey: slice, sessionRoot: "/tmp/lane-t-1", agentId: `${slice}-${n}`,
		kind: "judge", confidence: 0.9, probabilities: { judge: 0.9 }, classifiedTier: "strong", tier: "strong",
		models: ran, judgeModel: "typesafe/jev-1.13.0", outcome, ranModels: outcome === "refused-model-unknown" ? null : ran,
	});
	if (over.withheld) entry(reviewWithheldBody(token));
	entry(handSettledBody(token, routing));
	if (over.round !== undefined) {
		const blocking = over.blocking ?? 0;
		entry(reviewRoundBody({
			slice, round: over.round, token, group, verdict: over.withheld || outcome !== "ran" ? "withheld" : "accepted",
			findings: { counts: { blocking: blocking > 0 ? { correctness: blocking } : {}, major: {}, minor: {} }, titles: [] },
		}));
	}
	tick();
	return { token, routing };
}

/** Jo's answer at the surface, through the ledger module, a tick after what came before. */
function jo(ledger: Ledger, questionId: string, answer: string): string {
	tick();
	return ledger.answerQuestion(questionId, { by: SURFACE_BY, answer, author: "jo", channel: "surface" });
}

describe("lane tools: ownership", () => {
	test("all eight register; an orchestrator session and an unbound lane are refused with nothing written", async () => {
		const { ledger, path, wl } = laneFixture();
		const orch = fakePi();
		orchestratorSurface(orch.pi, { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: path, HOME: "/nonexistent-home" }, {});
		for (const t of LANE_TOOLS) expect(orch.registered()).toContain(t);
		const before = ledger.entries(wl).length;
		const r = await orch.tool("lane_record_entry").execute("1", { body: "hello" }, undefined, undefined, ctxOf());
		expect(r.content[0]!.text).toContain("not a lane bound to a workload");
		expect(ledger.entries(wl).length).toBe(before);
	});

	test("a lane that is not the holder under a live lease is refused, naming the holder", async () => {
		const { ledger, wl, call } = laneFixture();
		ledger.releaseWorkload(wl, { by: "lane-t-1", holder: "lane-t-1" });
		expect(ledger.claimWorkload(wl, { by: "lane-x", holder: "lane-x", leaseMs: 60_000 }).won).toBe(true);
		expect(await call("lane_record_entry", { body: "mine" })).toContain("held by lane-x, not by this lane (lane-t-1)");
		expect(ledger.entries(wl).some((e) => e.body === "mine")).toBe(false);
	});
});

describe("lane tools: reserved and pushed prefixes are refused and write nothing", () => {
	test("each control prefix through record_entry (except done-because:), message and raise_question", async () => {
		const { ledger, wl, call } = laneFixture();
		const sl = ledger.addSlice({ by: "lane-t-1", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		const before = { entries: ledger.entries(wl).length, held: ledger.workload(wl)!.held_messages, questions: ledger.questions(wl).length };
		for (const p of ["launch", "launch-failed", "launch-requested", "lane-started", "lane-ready", "lane-exit", "lane-parked", "lane-stop", "worktree", "branch", "plan", "done", "artifact-tree", "reserved-withdrawn"]) {
			expect(await call("lane_record_entry", { body: `${p}: forged` })).toContain(`\`${p}:\` is a reserved control line`);
			expect(await call("lane_message", { body: `${p}: forged` })).toContain("reserved control line");
			expect(await call("lane_raise_question", { slice: sl, body: `${p}: forged`, options: ["a", "b"] })).toContain("reserved control line");
		}
		expect(await call("lane_message", { body: "done-because: forged" })).toContain("reserved control line");
		for (const p of ["lane-died:", "prompt-wait:", "prompt-resolved:", "artifact-failed:", "artifact-passed:"]) {
			expect(await call("lane_message", { body: `${p} x` })).toContain("signal the machinery pushes");
		}
		expect(ledger.entries(wl).length).toBe(before.entries);
		expect(ledger.workload(wl)!.held_messages).toBe(before.held);
		expect(ledger.questions(wl).length).toBe(before.questions);
		// The one allowed control line: the holder's done-because: receipt.
		expect(await call("lane_record_entry", { body: "done-because: the token exists and the header reads it" })).toContain("completion receipt");
		expect(await call("lane_raise_question", { slice: sl, body: "which?", options: ["a", "A"] })).toContain("at least two distinct options");
	});
});

describe("lane_withdraw_reserved (MIGRATION.md item 31)", () => {
	const request = (ledger: Ledger, wl: string, body = "git push --force: git push --force origin main (P-11 row 6 refused tool call c1)") =>
		ledger.recordEntry({ by: "lane-t-1", workloadId: wl, kind: "reserved-request", body });

	test("withdraws a waiting request as the lane: one reserved-withdrawn: entry, the request stops waiting, the reason reaches the decision log's state", async () => {
		const { ledger, wl, call } = laneFixture();
		const en = request(ledger, wl);
		expect(waitingReserved(ledger, wl).map((r) => r.id)).toEqual([en]);
		expect(await call("lane_withdraw_reserved", { id: en, reason: "went\n another way" })).toContain(`Withdrew reserved request ${en}`);
		const written = ledger.entries(wl).at(-1)!;
		expect([written.kind, written.created_by, written.body]).toEqual(["assumption", "lane-t-1", `reserved-withdrawn: ${en} went another way`]);
		expect(waitingReserved(ledger, wl)).toEqual([]);
		expect(reservedStates(ledger, wl)[0]!.state).toMatchObject({ kind: "withdrawn", by: "lane-t-1", reason: "went another way" });
	});

	test("refuses with nothing written: another workload's request, an unknown id, a decided request, a second withdraw", async () => {
		const { ledger, wl, call } = laneFixture();
		const other = ledger.openWorkload({ by: SURFACE_BY, brief: "another", stakes: "normal", mode: "autonomous" });
		const foreign = request(ledger, other);
		const decided = request(ledger, wl, "deploy: fly deploy (P-11 row 6 refused tool call c2)");
		ledger.recordInstruction({ by: SURFACE_BY, workloadId: wl, body: `deny ${decided}`, author: "jo", channel: "surface" });
		const en = request(ledger, wl);
		expect(await call("lane_withdraw_reserved", { id: en })).toContain("Withdrew");
		const before = ledger.entries(wl).length;
		expect(await call("lane_withdraw_reserved", { id: foreign })).toContain(`${foreign} is not a reserved request on workload ${wl}`);
		expect(await call("lane_withdraw_reserved", { id: "en-nope" })).toContain("is not a reserved request");
		expect(await call("lane_withdraw_reserved", { id: decided })).toContain("not waiting on Jo (it is denied)");
		expect(await call("lane_withdraw_reserved", { id: en })).toContain("not waiting on Jo (it is withdrawn)");
		expect(ledger.entries(wl).length).toBe(before);
		expect(ledger.entries(other).filter((e) => e.kind === "assumption")).toEqual([]);
	});
});

describe("plan-first (decision 15) through the lane tools and Jo's answer", () => {
	test("change-kind refused while the flag stands; judge accepted; approve at the surface writes plan: approved; then change accepted; cancel withdraws", async () => {
		const { ledger, wl, call } = laneFixture({ planFirst: true });
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toContain("plan-first (your word) and the plan is not approved");
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i" })).toContain("add the plan slice first");
		expect(ledger.slices(wl)).toHaveLength(0);
		const plan = await call("lane_add_slice", { task: "plan the cut", doneCondition: "plan approved", inputs: "brief", kind: "judge" });
		expect(plan).toMatch(/^Added slice sl-/);
		const planId = ledger.slices(wl)[0]!.id;
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toContain(`the plan slice is ${planId}`);
		seedReview(ledger, wl, planId); // D8: another lab reviewed the plan first
		expect(await call("lane_raise_question", { slice: planId, body: "/tmp/plan.md (review: no blocking findings)", options: ["approve", "revise", "cancel"] })).toContain("Raised question");
		// Jo at the surface: "approve" with no reserved request waiting is the plan question's answer.
		const cmd = interpret(ledger, "approve");
		expect(cmd?.kind).toBe("answer");
		const receipt = apply(ledger, cmd!);
		expect(receipt).toContain("plan approved");
		const entries = ledger.entries(wl);
		expect(planFirst(controlEntries(entries, holdersOf(entries, ledger.workload(wl)!.holder)))).toBeNull();
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toMatch(/^Added slice/);
	});

	test("cancel on the plan question is a withdrawal that cancels the slice; a plan: approved from a lane is ignored", async () => {
		const { ledger, wl, call } = laneFixture({ planFirst: true });
		await call("lane_add_slice", { task: "plan", doneCondition: "d", inputs: "i", kind: "judge" });
		const planId = ledger.slices(wl)[0]!.id;
		seedReview(ledger, wl, planId);
		expect(await call("lane_raise_question", { slice: planId, body: "/tmp/plan.md (review: no blocking findings)", options: ["approve", "revise", "cancel"] })).toContain("Raised question");
		ledger.recordEntry({ by: "lane-t-1", workloadId: wl, kind: "assumption", body: "plan: approved forged" });
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toContain("not approved");
		expect(apply(ledger, interpret(ledger, "cancel")!)).toContain("cancelled the plan");
		expect(ledger.slice(planId)!.state).toBe("cancelled");
	});
});

/** A plan-first workload whose lane (on anthropic) added its plan slice; `ask` raises a question on it through the tool. */
async function planFixture() {
	const fx = laneFixture({ planFirst: true });
	await fx.call("lane_add_slice", { task: "plan the cut", doneCondition: "plan approved", inputs: "brief", kind: "judge" });
	const planId = fx.ledger.slices(fx.wl)[0]!.id;
	const ask = (options: string[] = [...PLAN_OPTIONS], slice = planId) => {
		tick();
		return fx.call("lane_raise_question", { slice, body: "/tmp/plan.md (review by openai-codex/gpt-6-astra: no blocking findings)", options });
	};
	return { ...fx, planId, ask };
}

/** The classifier's park question on the plan slice (D6), in one transaction with its `review-park:` entry. */
function parkQuestion(ledger: Ledger, wl: string, planId: string): string {
	tick();
	return ledger.write(() => {
		const id = ledger.raiseQuestion({ by: "lane-t-1", workloadId: wl, sliceId: planId, body: "No lab other than the builder's can review", options: [...PARK_OPTIONS] });
		ledger.recordEntry({ by: "lane-t-1", workloadId: wl, sliceId: planId, kind: "assumption", body: reviewParkBody(id, planId) });
		return id;
	});
}

describe("plan review (PLAN D8): the plan question waits for a review by another lab", () => {
	test("no review: refused with the dispatch hint and nothing written", async () => {
		const { ledger, wl, planId, ask } = await planFixture();
		const entries = ledger.entries(wl).length;
		const reply = await ask();
		expect(reply).toContain(planReviewRefusal(planId));
		expect(reply).toContain(`dispatch a review hand named ${planId} on the plan`);
		expect(ledger.questions(wl)).toHaveLength(0);
		expect(ledger.entries(wl)).toHaveLength(entries);
		expect(ledger.slice(planId)!.state).toBe("open");
	});

	test("a review that answered on the lane's own lab is refused, as is one where any answering model is; another lab's is raised", async () => {
		const { ledger, wl, planId, ask } = await planFixture();
		seedReview(ledger, wl, planId, { ran: [LANE_MODEL] });
		expect(await ask()).toContain(planReviewRefusal(planId));
		seedReview(ledger, wl, planId, { ran: [OTHER_LAB, LANE_MODEL] });
		expect(await ask()).toContain(planReviewRefusal(planId));
		seedReview(ledger, wl, planId);
		expect(await ask()).toContain("Raised question");
	});

	test("a review withheld (review-withheld:) does not clear the plan", async () => {
		const { ledger, wl, planId, ask } = await planFixture();
		seedReview(ledger, wl, planId, { withheld: true });
		expect(await ask()).toContain(planReviewRefusal(planId));
		expect(ledger.questions(wl)).toHaveLength(0);
	});

	test("a review older than the previous plan question does not clear the next one", async () => {
		const { ledger, wl, planId, ask } = await planFixture();
		seedReview(ledger, wl, planId);
		expect(await ask()).toContain("Raised question");
		jo(ledger, ledger.questions(wl)[0]!.id, "revise");
		expect(await ask()).toContain(planReviewRefusal(planId));
		expect(ledger.questions(wl)).toHaveLength(1);
	});

	test("a review that ran while the previous question was open, before Jo's revise resolved it, is refused; one after the revise clears", async () => {
		const { ledger, wl, planId, ask } = await planFixture();
		seedReview(ledger, wl, planId);
		expect(await ask()).toContain("Raised question");
		const first = ledger.questions(wl)[0]!.id;
		seedReview(ledger, wl, planId);
		expect(await ask()).toContain(planReviewRefusal(planId)); // the previous question is still open
		jo(ledger, first, "revise");
		expect(await ask()).toContain(planReviewRefusal(planId));
		seedReview(ledger, wl, planId);
		expect(await ask()).toContain("Raised question");
		expect(ledger.questions(wl)).toHaveLength(2);
	});

	test("a same-lab review whose token spent Jo's same-lab grant clears the plan", async () => {
		const { ledger, wl, planId, ask } = await planFixture();
		const grant = jo(ledger, parkQuestion(ledger, wl, planId), "same-lab");
		seedReview(ledger, wl, planId, { ran: [LANE_MODEL], grant });
		expect(await ask()).toContain("Raised question");
	});

	test("the grant does not clear a withheld or unsuccessful review, and a `wait` answer is no grant", async () => {
		const { ledger, wl, planId, ask } = await planFixture();
		const grant = jo(ledger, parkQuestion(ledger, wl, planId), "same-lab");
		seedReview(ledger, wl, planId, { ran: [LANE_MODEL], grant, withheld: true });
		expect(await ask()).toContain(planReviewRefusal(planId));
		seedReview(ledger, wl, planId, { ran: [LANE_MODEL], grant, outcome: "refused-model-unknown" });
		expect(await ask()).toContain(planReviewRefusal(planId));
		const wait = jo(ledger, parkQuestion(ledger, wl, planId), "wait");
		seedReview(ledger, wl, planId, { ran: [LANE_MODEL], grant: wait });
		expect(await ask()).toContain(planReviewRefusal(planId));
		expect(ledger.questions(wl).filter((q) => q.options.includes("approve"))).toHaveLength(0);
	});

	test("`Approve` in mixed case is checked like approve", async () => {
		const { planId, ask } = await planFixture();
		expect(await ask(["Approve", "Revise", "Cancel"])).toContain(planReviewRefusal(planId));
		expect(await ask(["APPROVE", "no"])).toContain(planReviewRefusal(planId));
	});

	test("unaffected: a question on another slice, a plan-slice question without approve, and any question once the plan is approved", async () => {
		const { ledger, wl, planId, call, ask } = await planFixture();
		tick(); // the plan slice is the oldest (surface/src/launch.ts planSlice): no tie on the stamp
		await call("lane_add_slice", { task: "second judge slice", doneCondition: "d", inputs: "i", kind: "judge" });
		const other = ledger.slices(wl).find((s) => s.id !== planId)!.id;
		expect(await ask([...PLAN_OPTIONS], other)).toContain("Raised question");
		expect(await ask(["yes", "no"])).toContain("Raised question");
		const approved = await planFixture();
		approved.ledger.recordEntry({ by: SURFACE_BY, workloadId: approved.wl, kind: "assumption", body: planApprovedBody("in-test") });
		expect(await approved.ask()).toContain("Raised question");
	});
});

/**
 * D8 × D9: three failed cross-lab rounds on the plan slice. The lane raised the plan after round 2
 * (with `staggered`, after round 3's first leg) and Jo answered revise; round 3 (its second leg)
 * then settled and the classifier raised the round-limit question with its `review-limit:` entry.
 */
async function limitLoop(over: { lastWithheld?: boolean; staggered?: boolean } = {}) {
	const fx = await planFixture();
	const { ledger, wl, planId } = fx;
	seedReview(ledger, wl, planId, { round: 1, blocking: 3 });
	seedReview(ledger, wl, planId, { round: 2, blocking: 2 });
	if (over.staggered) seedReview(ledger, wl, planId, { round: 3, blocking: 1, group: "dg-round3" });
	expect(await fx.ask()).toContain("Raised question");
	jo(ledger, ledger.questions(wl).at(-1)!.id, "revise");
	seedReview(ledger, wl, planId, { round: 3, blocking: 1, group: "dg-round3", withheld: over.lastWithheld || over.staggered });
	tick();
	const limit = ledger.write(() => {
		const entries = ledger.entries(wl);
		const body = roundLimitQuestionBody(planId, countRounds(entries, planId), effectiveRoundLimit(entries, ledger.instructions(wl), "normal", planId), "normal");
		const id = ledger.raiseQuestion({ by: "lane-t-1", workloadId: wl, sliceId: planId, body, options: [...ROUND_LIMIT_OPTIONS] });
		ledger.recordEntry({ by: "lane-t-1", workloadId: wl, sliceId: planId, kind: "assumption", body: reviewLimitBody(id, planId) });
		return id;
	});
	/** Jo's answer to the limit question and the surface's entry for it. */
	const answer = (word: "extend" | "accept" | "stop") => {
		const id = jo(ledger, limit, word);
		const body = word === "extend" ? reviewRoundsExtendBody(planId, 3, id) : reviewLoopEndBody(planId, word);
		ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, sliceId: planId, kind: "assumption", body });
	};
	return { ...fx, answer };
}

describe("plan review × round limit (PLAN D8 × D9)", () => {
	test("Jo accepts the review at its limit: the approve-question is raised with no further review", async () => {
		const { ledger, wl, answer, ask } = await limitLoop();
		answer("accept");
		expect(await ask()).toContain("Raised question");
		expect(ledger.routings(wl)).toHaveLength(3);
	});

	for (const word of ["extend", "stop"] as const) {
		test(`Jo answers ${word} at the limit: the approve-question is still refused`, async () => {
			const { planId, answer, ask } = await limitLoop();
			answer(word);
			expect(await ask()).toContain(planReviewRefusal(planId));
		});
	}

	test("accept does not clear a plan whose limit-reaching round was withheld", async () => {
		const { planId, answer, ask } = await limitLoop({ lastWithheld: true });
		answer("accept");
		expect(await ask()).toContain(planReviewRefusal(planId));
	});

	test("accept counts every leg of the limit-reaching round, one that settled before Jo's revise included", async () => {
		const { planId, answer, ask } = await limitLoop({ staggered: true });
		expect(await ask()).toContain(planReviewRefusal(planId)); // the limit question is open
		answer("accept");
		expect(await ask()).toContain("Raised question");
	});
});

describe("lane_release and lane_handoff end the lane on purpose (decision 10)", () => {
	test("release: holder-checked, ctx.shutdown called, later tools refuse, the renewal claim and shutdown write nothing", async () => {
		const { ledger, wl, f, ctx, call } = laneFixture();
		await f.emit("session_start", { type: "session_start" }, ctx);
		ledger.addSlice({ by: "lane-t-1", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		expect(await call("lane_release", {})).toContain("Released");
		expect(ctx.shutdowns).toHaveLength(1);
		expect(ledger.workload(wl)!.holder).toBeNull();
		expect(await call("lane_record_entry", { body: "after" })).toContain("released");
		await f.emit("agent_end", { willContinue: false }, ctx);
		expect(ledger.workload(wl)!.holder).toBeNull();
		notices.length = 0;
		await f.emit("session_shutdown", { type: "session_shutdown" }, ctx);
		expect(ledger.workload(wl)!.held_messages).toBe(0);
	});

	test("handoff: Jo holds with no lease; a second handoff refuses", async () => {
		const { ledger, wl, call } = laneFixture();
		expect(await call("lane_handoff", {})).toContain("Handed");
		const w = ledger.workload(wl)!;
		expect(w.holder).toBe("jo");
		expect(w.holder_lease_until).toBeNull();
		expect(await call("lane_handoff", {})).toContain("released");
	});
});

describe("mode flip at the surface", () => {
	test("to user-driven while a lane holds writes the lane-stop: request the runner accepts", async () => {
		const { ledger, path, wl } = laneFixture();
		const f = fakePi();
		const env = { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: path, HOME: "/nonexistent-home" };
		orchestratorSurface(f.pi, env, {});
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		await f.emit("before_agent_start", { prompt: "user-driven", systemPrompt: [] }, ctx);
		const stop = ledger.entries(wl).find((e) => e.body.startsWith("lane-stop:"));
		expect(stop?.body).toBe("lane-stop: lane-t-1 requested mode-flip by jo");
		expect(stop?.created_by).toBe(SURFACE_BY);
		expect(ledger.workload(wl)!.mode).toBe("user-driven");
		ledger.close();
		Ledger.open(path).close();
	});
});
