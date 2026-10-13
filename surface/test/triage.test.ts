// Routine or needs-Jo (PLAN wl-mv66ylg1op3wg0 D3, D4; surface/src/triage.ts) and the recommend tool
// with its stop nudge (surface/extensions/send-line.ts), driven by a recorded fake judge that answers
// from a script and counts its calls: the fixed rules with no judge call, the judge's verdicts and
// its fail-closed cases, the ledgered cache and what re-judges, the orchestrator's recommendation
// over pending.ts's, the tool's refusals and `#n`, and the advisory stop continuation.
import { describe, expect, test } from "bun:test";
import { LANE_RUNNER_BY, type Ledger } from "../../ledger/src/index";
import sendLineRow from "../extensions/send-line";
import { type ErrorKind, errorLines } from "../src/errors";
import { doneBody, planFirstBody } from "../src/launch";
import { Numbering } from "../src/numbering";
import { surfaceSession } from "../src/session";
import { promptWaitBody } from "../src/signals";
import {
	JUDGE_UNAVAILABLE, JUDGE_UNSURE, KIND_REASON, loadTriageQuestion, MULTIWORD_REASON, NO_RECOMMENDATION_REASON, PLAN_REASON, recommendBody,
	recordRecommendation, RESERVED_REASON, TRIAGE_CHOICES, type TriageChoice, type TriageJudge, triageItems,
} from "../src/triage";
import { ORCHESTRATOR_RECIPIENT, SURFACE_BY } from "../src/types";
import { clock, ctxOf, fakePi, tempLedger } from "./helpers";

const LONG_LEASE = 100 * 3_600_000;
const QUESTION = loadTriageQuestion();

/** An open workload held by `lane` under a lease that outlives the test clock, with one slice. */
function held(ledger: Ledger, lane: string, brief: string, stakes: "normal" | "production" = "normal"): { wl: string; sl: string } {
	const wl = ledger.openWorkload({ by: SURFACE_BY, brief, stakes, mode: "autonomous" });
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody(`${brief} is done`) });
	expect(ledger.claimWorkload(wl, { by: lane, holder: lane, leaseMs: LONG_LEASE }).won).toBe(true);
	const sl = ledger.addSlice({ by: lane, workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
	return { wl, sl };
}

type Answer = { choice?: unknown; confidence?: unknown; probabilities?: unknown };
/** A whole distribution: `confidence` on `choice`, the rest spread evenly over the other four. */
const dist = (choice: TriageChoice, confidence: number): Answer => ({
	choice, confidence, probabilities: Object.fromEntries(TRIAGE_CHOICES.map((c) => [c, c === choice ? confidence : (1 - confidence) / 4])),
});

/** The recorded fake judge: answers from `script` in order (the last repeats), throws an Error entry, counts calls, keeps each state. */
function fakeJudge(script: (Answer | Error)[]): TriageJudge & { calls: () => number; states: string[] } {
	let calls = 0;
	const states: string[] = [];
	return {
		calls: () => calls,
		states,
		primaryModel: () => ({ provider: "typesafe", id: "jev-1.13.0" }),
		async judge(request) {
			states.push(request.state);
			expect(request.questions).toEqual(QUESTION.question);
			const a = script[Math.min(calls, script.length - 1)]!;
			calls++;
			if (a instanceof Error) throw a;
			return { answers: { triage: a }, provider: "typesafe", model: "jev-1.13.0" };
		},
	};
}

/** One held workload with one question whose body marks `keep` recommended (pending.ts's recorded recommendation). */
function marked(stakes: "normal" | "production" = "normal") {
	const c = clock();
	const { ledger, path } = tempLedger(c.now);
	const a = held(ledger, "lane-a", "Fix the feed header", stakes);
	const q = ledger.raiseQuestion({ by: "lane-a", workloadId: a.wl, sliceId: a.sl, body: "Keep the `legacy` alias? `keep` (recommended), or drop it", options: ["drop", "keep"] });
	return { c, ledger, path, a, q };
}

const triageEntries = (ledger: Ledger, wl: string) => ledger.entries(wl, "assumption").filter((e) => e.created_by === SURFACE_BY && e.body.startsWith("triage: "));

describe("triage: the fixed rules (no judge call)", () => {
	test("every needs-you kind has a reason", () => {
		const kinds: ErrorKind[] = ["reserved", "held", "artifact", "test-run", "lane-died", "question", "due", "idle"];
		expect(Object.keys(KIND_REASON).sort()).toEqual([...kinds].sort());
		for (const k of kinds) expect(KIND_REASON[k].length).toBeGreaterThan(0);
	});

	test("reserved, plan, multiword, no recommendation, prompt wait, failed artifact, lane death, held, past due: each needs Jo with its reason, zero judge calls", async () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const a = held(ledger, "lane-a", "Fix the feed header");
		const en = ledger.recordEntry({ by: "lane-a", workloadId: a.wl, sliceId: a.sl, kind: "reserved-request", body: "push: git push origin main (P-11 row 6 refused tool call c1)" });
		const plain = ledger.raiseQuestion({ by: "lane-a", workloadId: a.wl, sliceId: a.sl, body: "Which token name?", options: ["left", "right"] });
		const multi = ledger.raiseQuestion({ by: "lane-a", workloadId: a.wl, sliceId: a.sl, body: "Which repo? `AS2_REPO` (recommended)", options: ["the script's checkout", "AS2_REPO"] });
		const wait = ledger.enqueue({ by: "lane-a", workloadId: a.wl, sliceId: a.sl, sender: "lane-a", recipient: ORCHESTRATOR_RECIPIENT, body: promptWaitBody("ask", "c7", "s1", "ask: which branch?") });
		for (const n of [1, 2]) ledger.enqueue({ by: "lane-a", workloadId: a.wl, sliceId: a.sl, sender: "lane-a", recipient: ORCHESTRATOR_RECIPIENT, body: `artifact-failed: bun test (exit 1, try ${n})` });
		// the plan question, approve recommended by its review verdict (pending.ts), still Jo's
		const p = ledger.openWorkload({ by: SURFACE_BY, brief: "Plan the word", stakes: "normal", mode: "autonomous" });
		ledger.recordEntry({ by: SURFACE_BY, workloadId: p, kind: "assumption", body: planFirstBody("your word") });
		expect(ledger.claimWorkload(p, { by: "lane-p", holder: "lane-p", leaseMs: LONG_LEASE }).won).toBe(true);
		const psl = ledger.addSlice({ by: "lane-p", workloadId: p, task: "plan", doneCondition: "plan approved", inputs: "brief" });
		const plan = ledger.write(() => {
			const id = ledger.raiseQuestion({ by: "lane-p", workloadId: p, sliceId: psl, body: "/tmp/plan.md\n- sl-1: one\nreview: approve, openai-codex/gpt-6-sol, /tmp/r1.md", options: ["approve", "revise", "cancel"] });
			ledger.recordEntry({ by: "lane-p", workloadId: p, sliceId: psl, kind: "assumption", body: `plan-question: ${id}` });
			return id;
		});
		// a lane death, a workload with no lane past the hold, a past-due scheduled row
		const d = held(ledger, "lane-d", "Dead lane work");
		const death = ledger.enqueue({ by: LANE_RUNNER_BY, workloadId: d.wl, sender: LANE_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: "lane-died: lane-d: died (signal SIGKILL)" });
		const idle = ledger.openWorkload({ by: SURFACE_BY, brief: "Nobody holds this", stakes: "normal", mode: "autonomous" });
		const due = ledger.openWorkload({ by: SURFACE_BY, brief: "due:2026-10-01 renew the cert", stakes: "normal", mode: "autonomous" });
		c.plusHours(5);
		const judge = fakeJudge([dist("routine", 0.99)]);
		const n = new Numbering();
		const t = await triageItems(ledger, n, judge, { question: QUESTION });
		expect(judge.calls()).toBe(0);
		expect(t.routine).toEqual([]);
		const by = Object.fromEntries(t.needsJo.map((i) => [i.rowId, i]));
		expect(by[en]).toMatchObject({ kind: "reserved", reason: RESERVED_REASON, n: n.numberOf(en) });
		expect(by[plain]).toMatchObject({ kind: "question", reason: NO_RECOMMENDATION_REASON, n: n.numberOf(plain) });
		expect(by[multi]).toMatchObject({ kind: "question", reason: MULTIWORD_REASON });
		expect(by[plan]).toMatchObject({ kind: "question", reason: PLAN_REASON });
		expect(by[wait]).toMatchObject({ kind: "question", reason: KIND_REASON.question, n: null });
		expect(by[a.sl]).toMatchObject({ kind: "artifact", reason: KIND_REASON.artifact, n: null });
		expect(by[death]).toMatchObject({ kind: "lane-died", reason: KIND_REASON["lane-died"], n: null });
		expect(by[idle]).toMatchObject({ kind: "held", reason: KIND_REASON.held, n: null });
		expect(by[due]).toMatchObject({ kind: "due", reason: KIND_REASON.due, n: null });
		// every needs-you line in exactly one list, in needs-you order
		const lines = errorLines(ledger, ledger.inFlight(), { now: c.now() });
		expect(t.needsJo.map((i) => i.rowId)).toEqual(lines.map((l) => l.rowId));
		expect(triageEntries(ledger, a.wl)).toEqual([]);
	});

	test("a turn whose only needs-you line is a lane death: needs Jo, routine empty", async () => {
		const { ledger } = tempLedger(clock().now);
		const d = held(ledger, "lane-d", "Dead lane work");
		const death = ledger.enqueue({ by: LANE_RUNNER_BY, workloadId: d.wl, sender: LANE_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: "lane-died: lane-d: died (signal SIGKILL)" });
		const judge = fakeJudge([dist("routine", 0.99)]);
		const t = await triageItems(ledger, new Numbering(), judge, { question: QUESTION });
		expect(t).toEqual({ routine: [], needsJo: [expect.objectContaining({ n: null, rowId: death, workloadId: d.wl, kind: "lane-died", reason: "lane died" })] });
		expect(judge.calls()).toBe(0);
	});
});

describe("triage: the judge", () => {
	test("routine at 0.85 → routine, with the recorded word and reason; one triage entry", async () => {
		const { ledger, a, q } = marked();
		const judge = fakeJudge([dist("routine", 0.85)]);
		const n = new Numbering();
		const t = await triageItems(ledger, n, judge, { question: QUESTION });
		expect(t).toEqual({ routine: [{ n: n.numberOf(q)!, rowId: q, workloadId: a.wl, word: "keep", reason: "recommended" }], needsJo: [] });
		expect(judge.calls()).toBe(1);
		expect(judge.states[0]).toContain("normal-stakes");
		expect(judge.states[0]).toContain("Recommended answer: keep");
		const entries = triageEntries(ledger, a.wl).map((e) => e.body);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatch(new RegExp(`^triage: ${q} routine 0\\.85 typesafe/jev-1\\.13\\.0 key [0-9a-f]{64}$`));
	});

	test("routine at 0.70 → needs Jo, judge unsure", async () => {
		const { ledger, q } = marked();
		const t = await triageItems(ledger, new Numbering(), fakeJudge([dist("routine", 0.7)]), { question: QUESTION });
		expect(t.routine).toEqual([]);
		expect(t.needsJo).toEqual([expect.objectContaining({ rowId: q, reason: JUDGE_UNSURE })]);
	});

	test("the judge throws → needs Jo, judge unavailable; nothing cached", async () => {
		const { ledger, a, q } = marked();
		const t = await triageItems(ledger, new Numbering(), fakeJudge([new Error("judgment: every judge candidate failed")]), { question: QUESTION });
		expect(t.needsJo).toEqual([expect.objectContaining({ rowId: q, reason: JUDGE_UNAVAILABLE })]);
		expect(triageEntries(ledger, a.wl)).toEqual([]);
	});

	test("no judge at all → needs Jo, judge unavailable", async () => {
		const { ledger, q } = marked();
		const t = await triageItems(ledger, new Numbering(), null, { question: QUESTION });
		expect(t.needsJo).toEqual([expect.objectContaining({ rowId: q, reason: JUDGE_UNAVAILABLE })]);
	});

	test("a malformed answer → needs Jo, never routine; nothing cached", async () => {
		const { ledger, a, q } = marked();
		const bad: Answer[] = [
			{ choice: "maybe", confidence: 0.9, probabilities: dist("routine", 0.9).probabilities },
			{ choice: "routine", confidence: 0.95 },
			{ choice: "routine", confidence: 1.5, probabilities: dist("routine", 0.9).probabilities },
			{ choice: "routine", confidence: 0.9, probabilities: { routine: 0.9, "needs-jo-cost": 0.05 } },
			{ choice: "routine", confidence: 0.9, probabilities: { ...(dist("routine", 0.9).probabilities as object), other: 0 } },
		];
		for (const answer of bad) {
			const t = await triageItems(ledger, new Numbering(), fakeJudge([answer]), { question: QUESTION });
			expect(t.routine).toEqual([]);
			expect(t.needsJo).toEqual([expect.objectContaining({ rowId: q, reason: JUDGE_UNAVAILABLE })]);
		}
		expect(triageEntries(ledger, a.wl)).toEqual([]);
	});

	test("needs-jo-cost → its criterion text is the reason", async () => {
		const { ledger, q } = marked();
		const t = await triageItems(ledger, new Numbering(), fakeJudge([dist("needs-jo-cost", 0.9)]), { question: QUESTION });
		expect(t.needsJo).toEqual([expect.objectContaining({ rowId: q, reason: QUESTION.question.triage.criteria["needs-jo-cost"] })]);
		expect(QUESTION.question.triage.criteria["needs-jo-cost"]).toStartWith("the answer spends money or time");
	});
});

describe("triage: the cache", () => {
	test("a second call reuses the entry; a stakes change and a new recommendation each re-judge", async () => {
		const { ledger, a, q } = marked();
		const judge = fakeJudge([dist("routine", 0.9)]);
		const n = new Numbering();
		await triageItems(ledger, n, judge, { question: QUESTION });
		expect(judge.calls()).toBe(1);
		const again = await triageItems(ledger, n, judge, { question: QUESTION });
		expect(judge.calls()).toBe(1);
		expect(again.routine.map((r) => r.rowId)).toEqual([q]);
		// stakes change → re-judged once, then cached again
		ledger.setStakes(a.wl, { by: "jo", stakes: "production" });
		await triageItems(ledger, n, judge, { question: QUESTION });
		expect(judge.calls()).toBe(2);
		expect(judge.states[1]).toContain("production-stakes");
		await triageItems(ledger, n, judge, { question: QUESTION });
		expect(judge.calls()).toBe(2);
		// a new recommendation from the orchestrator → re-judged
		expect(recordRecommendation(ledger, n, { item: q, word: "keep", reason: "the alias still has callers" }).ok).toBe(true);
		await triageItems(ledger, n, judge, { question: QUESTION });
		expect(judge.calls()).toBe(3);
		expect(judge.states[2]).toContain("Reason recorded for it: the alias still has callers");
		await triageItems(ledger, n, judge, { question: QUESTION });
		expect(judge.calls()).toBe(3);
		expect(triageEntries(ledger, a.wl)).toHaveLength(3);
	});

	test("a different judge model or question file misses the cache", async () => {
		const { ledger, q } = marked();
		const judge = fakeJudge([dist("routine", 0.9)]);
		await triageItems(ledger, new Numbering(), judge, { question: QUESTION });
		const other = { ...fakeJudge([dist("routine", 0.9)]), primaryModel: () => ({ provider: "typesafe", id: "jev-2.0.0" }) };
		await triageItems(ledger, new Numbering(), other, { question: QUESTION });
		expect(other.calls()).toBe(1);
		const edited = fakeJudge([dist("routine", 0.9)]);
		const t = await triageItems(ledger, new Numbering(), edited, { question: { ...QUESTION, sha256: "0".repeat(64) } });
		expect(edited.calls()).toBe(1);
		expect(t.routine.map((r) => r.rowId)).toEqual([q]);
	});
});

describe("triage: the orchestrator's recommendation", () => {
	test("Ilex's recommend entry overrides pending.ts's recorded recommendation", async () => {
		const { ledger, a, q } = marked();
		const n = new Numbering();
		const r = recordRecommendation(ledger, n, { item: q, word: "DROP", reason: "nothing imports the alias" });
		expect(r).toMatchObject({ ok: true, rowId: q, workloadId: a.wl, word: "drop" });
		const judge = fakeJudge([dist("routine", 0.9)]);
		const t = await triageItems(ledger, n, judge, { question: QUESTION });
		expect(t.routine).toEqual([{ n: n.numberOf(q)!, rowId: q, workloadId: a.wl, word: "drop", reason: "nothing imports the alias" }]);
		expect(judge.states[0]).toContain("Recommended answer: drop");
		expect(ledger.entries(a.wl, "assumption").find((e) => e.created_by === SURFACE_BY && e.body.startsWith("recommend: "))!.body).toBe(recommendBody(q, "drop", "nothing imports the alias"));
	});

	test("an orchestrator recommendation turns `no recommendation recorded` into a judged row", async () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const a = held(ledger, "lane-a", "Fix the feed header");
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: a.wl, sliceId: a.sl, body: "Which token name?", options: ["left", "right"] });
		const n = new Numbering();
		expect((await triageItems(ledger, n, fakeJudge([dist("routine", 0.9)]), { question: QUESTION })).needsJo).toEqual([expect.objectContaining({ rowId: q, reason: NO_RECOMMENDATION_REASON })]);
		recordRecommendation(ledger, n, { item: q, word: "left", reason: "keeps the old name" });
		expect((await triageItems(ledger, n, fakeJudge([dist("routine", 0.9)]), { question: QUESTION })).routine).toEqual([expect.objectContaining({ rowId: q, word: "left" })]);
	});
});

describe("orchestrator_recommend and the stop nudge (surface/extensions/send-line.ts)", () => {
	function surface() {
		const fx = marked();
		const other = fx.ledger.raiseQuestion({ by: "lane-a", workloadId: fx.a.wl, sliceId: fx.a.sl, body: "Which token name?", options: ["left", "right"] });
		const en = fx.ledger.recordEntry({ by: "lane-a", workloadId: fx.a.wl, sliceId: fx.a.sl, kind: "reserved-request", body: "push: git push origin main (P-11 row 6 refused tool call c1)" });
		const env = { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: fx.path, HOME: "/nonexistent-home" };
		const f = fakePi();
		sendLineRow(f.pi, env);
		const ctx = ctxOf();
		const s = surfaceSession(ctx as never, env);
		s.now = fx.c.now;
		s.numbering.assign(errorLines(fx.ledger, fx.ledger.inFlight(), { now: fx.c.now() }));
		const recommend = async (params: Record<string, unknown>) => (await f.tool("orchestrator_recommend").execute("1", params, undefined, undefined, ctx)).content[0]!.text;
		const recommends = () => fx.ledger.entries(fx.a.wl, "assumption").filter((e) => e.body.startsWith("recommend: "));
		return { ...fx, other, en, f, ctx, s, recommend, recommends };
	}

	test("refuses a word that is not one of the row's options and writes nothing", async () => {
		const { recommend, recommends, q, en, other } = surface();
		expect(await recommend({ item: q, word: "delete", reason: "x" })).toContain(`"delete" is not an answer to ${q}; it takes: drop / keep`);
		expect(await recommend({ item: en, word: "keep", reason: "x" })).toContain("it takes: approve / deny");
		expect(await recommend({ item: other, word: "left", reason: "  " })).toContain("one-line reason");
		expect(await recommend({ item: "#99", word: "left", reason: "x" })).toContain("#99 is not a number on the needs-you list");
		expect(await recommend({ item: "q-nothere", word: "left", reason: "x" })).toContain("no waiting question or reserved request q-nothere");
		expect(await recommend({ item: "the second one", word: "left", reason: "x" })).toContain("item is `#n`");
		expect(recommends()).toEqual([]);
	});

	test("resolves #n through the session numbering; a row no longer waiting is refused", async () => {
		const { recommend, recommends, s, ledger, other, a, en } = surface();
		const n = s.numbering.numberOf(other)!;
		expect(await recommend({ item: `#${n}`, word: "Right", reason: "matches the new token set" })).toContain(`Recorded: #${n} ${other} → right`);
		expect(recommends().map((e) => [e.body, e.workload_id])).toEqual([[recommendBody(other, "right", "matches the new token set"), a.wl]]);
		expect(await recommend({ item: `#${s.numbering.numberOf(en)}`, word: "deny", reason: "main is protected" })).toContain(`→ deny`);
		ledger.answerQuestion(other, { by: SURFACE_BY, answer: "right", author: "jo", channel: "surface" });
		expect(await recommend({ item: `#${n}`, word: "right", reason: "again" })).toContain("no longer waiting");
		expect(recommends()).toHaveLength(2);
	});

	test("session_stop: one advisory continuation naming the rows with no recommendation, never a block, not repeated until Jo types", async () => {
		const { f, ctx, s, recommend, q, other, en } = surface();
		await recommend({ item: other, word: "left", reason: "keeps the old name" });
		const stop = (await f.emit("session_stop", { last_assistant_message: { content: "**PMDW**\nDone." } }, ctx)) as { continue?: boolean; additionalContext?: string; decision?: string };
		expect(stop.decision).toBeUndefined();
		expect(stop.continue).toBe(true);
		expect(stop.additionalContext).toContain(`#${s.numbering.numberOf(q)} ${q}`);
		expect(stop.additionalContext).toContain(`#${s.numbering.numberOf(en)} ${en}`);
		expect(stop.additionalContext).not.toContain(other);
		expect(stop.additionalContext).toContain("orchestrator_recommend");
		// the continuation's own stop: nothing new, so no second continuation
		expect(await f.emit("session_stop", {}, ctx)).toBeUndefined();
		// Jo types: the next stop names them again
		await f.emit("input", { text: "go on", source: "interactive" }, ctx);
		expect(await f.emit("session_stop", {}, ctx)).toMatchObject({ continue: true });
		// every row recommended: no continuation
		await recommend({ item: q, word: "keep", reason: "callers remain" });
		await recommend({ item: en, word: "deny", reason: "main is protected" });
		await f.emit("input", { text: "go on", source: "interactive" }, ctx);
		expect(await f.emit("session_stop", {}, ctx)).toBeUndefined();
	});

	test("inert off the orchestrator surface", async () => {
		const fx = marked();
		const env = { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: fx.path, HOME: "/nonexistent-home" };
		const f = fakePi();
		sendLineRow(f.pi, env);
		const ctx = ctxOf();
		expect((await f.tool("orchestrator_recommend").execute("1", { item: fx.q, word: "keep", reason: "x" }, undefined, undefined, ctx)).content[0]!.text).toContain("not the orchestrator surface");
		expect(await f.emit("session_stop", {}, ctx)).toBeUndefined();
	});
});
