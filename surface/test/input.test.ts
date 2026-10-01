// Stakes/mode inference (§ A1.2, § B13.1) and Jo's short inputs (§ B5, § B3 item 5): every
// applied word is a ledger row with author jo, channel surface; unrecognised text is left alone; a
// bare answer word with more than one target is ambiguous; a numbered batch is checked whole
// against the session numbering (MIGRATION.md § M7 follow-ups item 1).
import { describe, expect, test } from "bun:test";
import type { Ledger } from "../../ledger/src/index";
import { errorLines } from "../src/errors";
import { apply, type BatchResult, interpret, interpretBatch } from "../src/input";
import { controlEntries, holdersOf, planFirst, planFirstBody } from "../src/launch";
import { Numbering } from "../src/numbering";
import { inferMode, inferStakes, saidPlanIt } from "../src/stakes";
import { SURFACE_BY } from "../src/types";
import { tempLedger, workloadWithSlice } from "./helpers";

/** A plan-first workload whose plan slice raised the plan question (decision 15). */
function planQuestion(ledger: Ledger): { wl: string; sl: string; q: string } {
	const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "Plan the cut", stakes: "normal", mode: "autonomous" });
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: planFirstBody("your word") });
	const sl = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "plan", doneCondition: "plan approved", inputs: "brief" });
	const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "/tmp/plan.md", options: ["approve", "revise", "cancel"] });
	return { wl, sl, q };
}

/** The session numbering as the surface holds it: every current answerable line numbered. */
function numbered(ledger: Ledger, numbering = new Numbering()): Numbering {
	numbering.assign(errorLines(ledger));
	return numbering;
}

/** Apply an accepted batch the way the surface does: one transaction, one row per answer. */
function applyBatch(ledger: Ledger, r: BatchResult | null): string[] {
	if (!r?.ok) throw new Error(`not an accepted batch: ${JSON.stringify(r)}`);
	return ledger.write(() => r.items.map((i) => apply(ledger, i.cmd)));
}

const allInstructions = (ledger: Ledger) => ledger.inFlight().flatMap((w) => ledger.instructions(w.workload.id));

describe("stakes and mode inference", () => {
	test("default normal; production from words, protected branch or a reserved target; throwaway from words or a scratch repo", () => {
		expect(inferStakes({ said: "fix the header offset" })).toMatchObject({ value: "normal" });
		expect(inferStakes({ said: "hotfix the checkout page" })).toMatchObject({ value: "production", reason: 'you said "hotfix"' });
		expect(inferStakes({ said: "tidy", branch: "main" })).toMatchObject({ value: "production", reason: "target branch main is protected" });
		expect(inferStakes({ said: "tidy", reservedTarget: true }).value).toBe("production");
		expect(inferStakes({ said: "spike a prototype of the parser" }).value).toBe("throwaway");
		expect(inferStakes({ said: "measure it", repo: "/Users/jo/agent-scratch/x" })).toMatchObject({ value: "throwaway" });
		// production wins over throwaway when both match
		expect(inferStakes({ said: "throwaway experiment against production" }).value).toBe("production");
	});

	test("mode is autonomous unless Jo asked to steer; 'plan it' alone is plan-first, not steering (decision 15)", () => {
		expect(inferMode("fix the feed")).toMatchObject({ value: "autonomous" });
		expect(inferMode("plan it with me")).toMatchObject({ value: "user-driven", reason: 'you said "with me"' });
		expect(inferMode("plan it")).toMatchObject({ value: "autonomous" });
		expect(saidPlanIt("plan it")).toBe(true);
		expect(saidPlanIt("fix the feed")).toBe(false);
		expect(inferMode("walk me through the migration").value).toBe("user-driven");
	});
});

describe("one-word inputs", () => {
	test("a stakes word flips the only workload in view and records the instruction; a mode word flips mode", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const s = interpret(ledger, "production")!;
		expect(s).toMatchObject({ kind: "stakes", workloadId: wl, stakes: "production" });
		expect(apply(ledger, s)).toMatch(/^stakes on wl-.* → production/);
		expect(ledger.workload(wl)!.stakes).toBe("production");
		const m = interpret(ledger, "user-driven")!;
		expect(apply(ledger, m)).toContain("→ user-driven");
		expect(ledger.workload(wl)!.mode).toBe("user-driven");
		const rows = ledger.instructions(wl);
		expect(rows.map((r) => [r.kind, r.body, r.author, r.channel])).toEqual([
			["instruction", "stakes: production", "jo", "surface"],
			["mode-flip", "user-driven", "jo", "surface"],
		]);
	});

	test("with two workloads in view a bare stakes word is ambiguous; a second word picks the workload", () => {
		const { ledger } = tempLedger();
		const a = workloadWithSlice(ledger).wl;
		const b = workloadWithSlice(ledger, { brief: "second" }).wl;
		expect(interpret(ledger, "throwaway")).toBeNull();
		expect(interpret(ledger, `throwaway ${b}`)).toMatchObject({ kind: "stakes", workloadId: b });
		expect(interpret(ledger, `throwaway ${a}`)).toMatchObject({ workloadId: a });
	});

	test("an option word answers the oldest open question (case-insensitive) and the slice resumes; withdraw replans", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Token name?", options: ["Header-Offset", "nav-offset"] });
		expect(interpret(ledger, "nope")).toBeNull();
		const a = interpret(ledger, "header-offset")!;
		expect(a).toMatchObject({ kind: "answer", questionId: q, answer: "Header-Offset" });
		const receipt = apply(ledger, a);
		expect(receipt).toContain(`slice ${sl} is open`);
		expect(ledger.question(q)!.state).toBe("answered");
		expect(ledger.slice(sl)!.state).toBe("open");
		const q2 = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Really?", options: ["yes", "no"] });
		const w = interpret(ledger, "withdraw")!;
		expect(w).toMatchObject({ kind: "withdraw", questionId: q2, then: "replan" });
		expect(apply(ledger, w)).toContain("replanned, not executed");
		expect(ledger.question(q2)!.state).toBe("withdrawn");
		expect(ledger.slice(sl)!.state).toBe("open");
		const last = ledger.instructions(wl).at(-1)!;
		expect(last).toMatchObject({ kind: "withdrawal", disposition: "replan", author: "jo", channel: "surface" });
	});

	test("approve / deny with one reserved request waiting name it; with two the bare word is ambiguous and the id picks", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		expect(interpret(ledger, "approve")).toBeNull();
		const e1 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push main" });
		expect(interpret(ledger, "approve")).toMatchObject({ kind: "reserved", entryId: e1, verdict: "approve" });
		const e2 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "deploy" });
		expect(interpret(ledger, "deny")).toEqual({
			kind: "ambiguous",
			word: "deny",
			candidates: [
				{ kind: "reserved", workloadId: wl, rowId: e1 },
				{ kind: "reserved", workloadId: wl, rowId: e2 },
			],
		});
		const d = interpret(ledger, `deny ${e2}`)!;
		expect(apply(ledger, d)).toContain(`denied reserved request ${e2}`);
		expect(ledger.instructions(wl).at(-1)!.body).toBe(`deny ${e2}`);
		// one left waiting: the bare word names it again
		expect(interpret(ledger, "deny")).toMatchObject({ kind: "reserved", entryId: e1 });
	});

	test("the 21:34Z incident: bare approve with a reserved request and a plan question waiting is ambiguous, never the reserved request", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const e1 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push main" });
		const p = planQuestion(ledger);
		const cmd = interpret(ledger, "approve")!;
		expect(cmd).toEqual({
			kind: "ambiguous",
			word: "approve",
			candidates: [
				{ kind: "reserved", workloadId: wl, rowId: e1 },
				{ kind: "question", workloadId: p.wl, rowId: p.q },
			],
		});
		expect(() => apply(ledger, cmd)).toThrow("refused, never applied");
		expect(allInstructions(ledger)).toHaveLength(0);
		// the two-word forms still pick
		expect(interpret(ledger, `approve ${e1}`)).toMatchObject({ kind: "reserved", entryId: e1 });
		expect(interpret(ledger, `approve ${p.q}`)).toMatchObject({ kind: "answer", questionId: p.q, answer: "approve" });
	});

	test("an option word or withdraw that fits two open questions is ambiguous; the question id picks", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q1 = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Use the token?", options: ["accept", "reject"] });
		const q2 = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Rename it?", options: ["Accept", "skip"] });
		// both raised in the same millisecond: the open-question order between them is the ledger's, not the test's
		for (const word of ["accept", "withdraw"]) {
			const cmd = interpret(ledger, word);
			if (cmd?.kind !== "ambiguous") throw new Error(`${word}: expected ambiguous, got ${JSON.stringify(cmd)}`);
			expect(cmd.word).toBe(word);
			expect(cmd.candidates.map((t) => [t.kind, t.workloadId, t.rowId]).sort()).toEqual([["question", wl, q1], ["question", wl, q2]].sort());
		}
		expect(interpret(ledger, `accept ${q2}`)).toMatchObject({ kind: "answer", questionId: q2, answer: "Accept" });
		// a word only one question offers has one target and applies
		expect(interpret(ledger, "skip")).toMatchObject({ kind: "answer", questionId: q2, answer: "skip" });
		expect(interpret(ledger, `withdraw ${q1}`)).toMatchObject({ kind: "withdraw", questionId: q1 });
	});

	test("ordinary sentences are not commands", () => {
		const { ledger } = tempLedger();
		workloadWithSlice(ledger);
		expect(interpret(ledger, "please make it production grade")).toBeNull();
		expect(interpret(ledger, "")).toBeNull();
	});
});

describe("numbered batches", () => {
	/** Two reserved requests waiting on one workload, numbered #1 and #2. */
	function reservedPair() {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const e1 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push main" });
		const e2 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "deploy" });
		return { ledger, wl, sl, e1, e2, numbering: numbered(ledger) };
	}

	test("`1 approve, 2 deny`, one per line, `#1`/`q2:`/`1)` forms: each answer is its own instruction row", () => {
		for (const text of ["1 approve, 2 deny", "1 approve\n2 deny", "#1 approve\nq2: deny", " 1) Approve,\n\n Q2. DENY ,"]) {
			const { ledger, wl, e1, e2, numbering } = reservedPair();
			const r = interpretBatch(ledger, numbering, text);
			expect(r).toMatchObject({ ok: true, items: [{ n: 1 }, { n: 2 }] });
			const receipts = applyBatch(ledger, r);
			expect(receipts).toEqual([expect.stringContaining(`approved reserved request ${e1}`), expect.stringContaining(`denied reserved request ${e2}`)]);
			expect(ledger.instructions(wl).map((i) => [i.kind, i.body, i.author, i.channel])).toEqual([
				["instruction", `approve ${e1}`, "jo", "surface"],
				["instruction", `deny ${e2}`, "jo", "surface"],
			]);
			expect(errorLines(ledger).filter((l) => l.kind === "reserved")).toEqual([]);
		}
	});

	test("a mixed batch: a reserved request and the plan question; plan approve writes plan: approved", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const e1 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push main" });
		const p = planQuestion(ledger);
		const numbering = numbered(ledger);
		expect(numbering.numberOf(e1)).toBe(1);
		expect(numbering.numberOf(p.q)).toBe(2);
		const r = interpretBatch(ledger, numbering, "1 deny, 2 APPROVE");
		expect(r).toEqual({
			ok: true,
			items: [
				{ n: 1, cmd: { kind: "reserved", workloadId: wl, entryId: e1, verdict: "deny" } },
				{ n: 2, cmd: { kind: "answer", workloadId: p.wl, questionId: p.q, answer: "approve" } },
			],
		});
		expect(applyBatch(ledger, r)[1]).toContain("plan approved");
		expect(ledger.instructions(wl).map((i) => i.body)).toEqual([`deny ${e1}`]);
		expect(ledger.question(p.q)!.state).toBe("answered");
		const entries = ledger.entries(p.wl);
		expect(entries.some((e) => e.body.startsWith("plan: approved"))).toBe(true);
		expect(planFirst(controlEntries(entries, holdersOf(entries, ledger.workload(p.wl)!.holder)))).toBeNull();
	});

	test("withdraw on a numbered question withdraws it, then replan", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Which?", options: ["left", "right"] });
		const r = interpretBatch(ledger, numbered(ledger), "1 withdraw");
		expect(r).toEqual({ ok: true, items: [{ n: 1, cmd: { kind: "withdraw", workloadId: wl, questionId: q, then: "replan" } }] });
		applyBatch(ledger, r);
		expect(ledger.question(q)!.state).toBe("withdrawn");
	});

	test("one bad piece refuses the whole batch with one line per piece: unknown number, wrong word, duplicate", () => {
		const { ledger, numbering } = reservedPair();
		expect(interpretBatch(ledger, numbering, "1 approve, 2 maybe, 7 deny")).toEqual({
			ok: false,
			lines: ["#1 ok, not applied", "#2 takes: approve / deny", "#7 is not on the needs-you list"],
		});
		expect(interpretBatch(ledger, numbering, "1 approve\n2 deny\n1 deny")).toEqual({
			ok: false,
			lines: ["#1 appears more than once in this batch", "#2 ok, not applied", "#1 appears more than once in this batch"],
		});
		expect(allInstructions(ledger)).toHaveLength(0);
	});

	test("a stale number is refused: its row was answered since it was numbered; a question takes its options or withdraw", () => {
		const { ledger, wl, sl, e1, numbering } = reservedPair();
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Which?", options: ["Left", "right"] });
		numbered(ledger, numbering);
		expect(numbering.numberOf(q)).toBe(3);
		apply(ledger, interpret(ledger, `approve ${e1}`)!);
		expect(interpretBatch(ledger, numbering, "1 deny, 3 up")).toEqual({
			ok: false,
			lines: [`#1 (${e1}) is no longer waiting`, "#3 takes: Left / right / withdraw"],
		});
		apply(ledger, interpret(ledger, `right ${q}`)!);
		expect(interpretBatch(ledger, numbering, "3 left")).toEqual({ ok: false, lines: [`#3 (${q}) is no longer waiting`] });
		// a fresh assign does not hand #1 or #3 to another row
		const e3 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "tag" });
		numbered(ledger, numbering);
		expect(numbering.numberOf(e3)).toBe(4);
		expect(interpretBatch(ledger, numbering, "1 approve")).toEqual({ ok: false, lines: [`#1 (${e1}) is no longer waiting`] });
	});

	test("prose is not a batch: every piece must be `<n> <word>`", () => {
		const { ledger, numbering } = reservedPair();
		expect(interpretBatch(ledger, numbering, "2 things to fix")).toBeNull();
		expect(interpretBatch(ledger, numbering, "1 approve, and then 2 deny")).toBeNull();
		expect(interpretBatch(ledger, numbering, "approve")).toBeNull();
		expect(interpretBatch(ledger, numbering, " , \n")).toBeNull();
		expect(interpretBatch(ledger, numbering, "1 approve")).toMatchObject({ ok: true, items: [{ n: 1 }] });
	});
});
