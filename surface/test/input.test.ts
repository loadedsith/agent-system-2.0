// Stakes/mode inference (§ A1.2, § B13.1) and Jo's short inputs (§ B5, § B3 item 5): every
// applied word is a ledger row with author jo, channel surface; unrecognised text is left alone; a
// bare answer word with more than one target is ambiguous; a numbered batch is checked whole
// against the session numbering (MIGRATION.md § M7 follow-ups item 1); the review round limit's
// words and answers (PLAN wl-mupu0sx2o046io D9, D10).
import { describe, expect, test } from "bun:test";
import { handSpawnBody, reviewParkBody } from "../../classifier/src/lab";
import { reviewStopOn } from "../../classifier/src/review-stop";
import { countRounds, effectiveRoundLimit, type Findings, reviewLimitBody, reviewRoundBody, ROUND_LIMIT_OPTIONS } from "../../classifier/src/rounds";
import { LANE_RUNNER_BY, type Ledger } from "../../ledger/src/index";
import { CEILING_OPTIONS } from "../src/ceiling";
import { errorLines } from "../src/errors";
import { apply, type BatchResult, commandShaped, interpret, interpretBatch, interpretPaste, parseBatch, type PasteResult } from "../src/input";
import { controlEntries, holdersOf, planFirst, planFirstBody } from "../src/launch";
import { Numbering } from "../src/numbering";
import { inferMode, inferStakes, saidPlanIt } from "../src/stakes";
import { SURFACE_BY } from "../src/types";
import { clock, tempLedger, workloadWithSlice } from "./helpers";

/**
 * A plan-first workload held by lane-a whose plan slice raised the plan question (decision 15), with
 * lane-a's `plan-question:` entry written in the same transaction, as lane_raise_question writes it
 * (PLAN wl-muq22rnjcfrrpc D9 part two): the entry counts only from a holder of the workload.
 */
function planQuestion(ledger: Ledger): { wl: string; sl: string; q: string } {
	const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "Plan the cut", stakes: "normal", mode: "autonomous" });
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: planFirstBody("your word") });
	expect(ledger.claimWorkload(wl, { by: "lane-a", holder: "lane-a", leaseMs: null }).won).toBe(true);
	const sl = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "plan", doneCondition: "plan approved", inputs: "brief" });
	const q = ledger.write(() => {
		const id = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "/tmp/plan.md", options: ["approve", "revise", "cancel"] });
		ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "assumption", body: `plan-question: ${id}` });
		return id;
	});
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

	test("with two workloads in view a bare stakes or mode word is ambiguous, the workloads as candidates; a second word picks the workload", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const a = workloadWithSlice(ledger).wl;
		c.plusHours(0.01); // b opens after a, so the view order (oldest first) is fixed
		const b = workloadWithSlice(ledger, { brief: "second" }).wl;
		const candidates = [{ kind: "workload", workloadId: a }, { kind: "workload", workloadId: b }];
		expect(interpret(ledger, "throwaway")).toEqual({ kind: "ambiguous", word: "throwaway", candidates });
		expect(interpret(ledger, "User-Driven")).toEqual({ kind: "ambiguous", word: "user-driven", candidates });
		expect(interpret(ledger, `throwaway ${b}`)).toEqual({ kind: "stakes", workloadId: b, stakes: "throwaway" });
		expect(interpret(ledger, `user-driven ${a}`)).toEqual({ kind: "mode", workloadId: a, mode: "user-driven" });
		expect(interpret(ledger, "throwaway wl-nope")).toBeNull();
		expect(() => apply(ledger, interpret(ledger, "throwaway")!)).toThrow("refused, never applied");
		expect(ledger.instructions(a)).toEqual([]);
		expect(ledger.instructions(b)).toEqual([]);
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
			expect(cmd.candidates.map((t) => [t.kind, t.workloadId, t.kind === "workload" ? null : t.rowId]).sort()).toEqual([["question", wl, q1], ["question", wl, q2]].sort());
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

	test("`ceiling 60 8` is the ceiling command, never a batch, even with numbered rows waiting", () => {
		const { ledger, wl, numbering } = reservedPair();
		expect(parseBatch("ceiling 60 8")).toBeNull();
		expect(interpretBatch(ledger, numbering, "ceiling 60 8")).toBeNull();
		expect(interpret(ledger, "ceiling 60 8")).toEqual({ kind: "ceiling", workloadId: wl, usd: 60, wallMin: 480 });
	});
});

describe("a paste of several lines (MIGRATION.md item 48)", () => {
	/** Two reserved requests (#1, #2) and a question (#3) on one workload, numbered. */
	function rows() {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const e1 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push main" });
		const e2 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "deploy" });
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Which?", options: ["left", "right"] });
		return { ledger, wl, sl, e1, e2, q, numbering: numbered(ledger) };
	}
	/** Apply an accepted paste the way the surface does: one transaction, in order, one row per command. */
	function applyPaste(ledger: Ledger, r: PasteResult | null): string[] {
		if (!r?.ok) throw new Error(`not an accepted paste: ${JSON.stringify(r)}`);
		return ledger.write(() => r.items.flatMap((i) => (i.kind === "instruction" ? [] : i.kind === "batch" ? i.items.map((b) => apply(ledger, b.cmd)) : [apply(ledger, i.cmd)])));
	}

	test("commandShaped: a numbered piece or a line short enough for its word; `ceiling` runs to four words, `rounds` to three", () => {
		expect(commandShaped("approve")).toBe(true);
		expect(commandShaped("production wl-x")).toBe(true);
		expect(commandShaped("1 approve, 2 deny")).toBe(true);
		expect(commandShaped("ceiling $120 8h wl-x")).toBe(true);
		expect(commandShaped("rounds 5 wl-x")).toBe(true);
		expect(commandShaped("rounds 5 wl-x please")).toBe(false);
		expect(commandShaped("relaunch the classifier fix now")).toBe(false);
		expect(commandShaped("")).toBe(false);
	});

	test("two commands on two lines are both read and applied in order: stakes then an exact ceiling on the same workload", () => {
		const { ledger, wl, numbering } = rows();
		const r = interpretPaste(ledger, numbering, `production ${wl}\nceiling 120 ${wl}`);
		expect(r).toEqual({
			ok: true,
			items: [
				{ line: 1, text: `production ${wl}`, kind: "command", cmd: { kind: "stakes", workloadId: wl, stakes: "production" } },
				{ line: 2, text: `ceiling 120 ${wl}`, kind: "command", cmd: { kind: "ceiling", workloadId: wl, usd: 120, wallMin: null } },
			],
		});
		const receipts = applyPaste(ledger, r);
		expect(receipts[0]).toMatch(/^stakes on wl-.* → production/);
		expect(receipts[1]).toContain(`ceiling on ${wl} → $120 / 12h`); // the stakes word's 12 h wall, then Jo's exact figure
		expect(ledger.workload(wl)!.stakes).toBe("production");
		expect(ledger.instructions(wl).map((i) => i.body)).toEqual(["stakes: production", "ceiling: 120 12"]);
	});

	test("a numbered batch line keeps its comma form; a trailing plain-words line is one instruction for the orchestrator (item 48's example)", () => {
		const { ledger, wl, e1, e2, numbering } = rows();
		const r = interpretPaste(ledger, numbering, "1 approve, 2 deny\nRelaunch the classifier fix now");
		expect(r).toEqual({
			ok: true,
			items: [
				{
					line: 1, text: "1 approve, 2 deny", kind: "batch",
					items: [
						{ n: 1, cmd: { kind: "reserved", workloadId: wl, entryId: e1, verdict: "approve" } },
						{ n: 2, cmd: { kind: "reserved", workloadId: wl, entryId: e2, verdict: "deny" } },
					],
				},
				{ kind: "instruction", from: 2, to: 2, text: "Relaunch the classifier fix now" },
			],
		});
		applyPaste(ledger, r);
		expect(ledger.instructions(wl).map((i) => i.body)).toEqual([`approve ${e1}`, `deny ${e2}`]);
	});

	test("consecutive plain-words lines are one instruction, blank lines included; a command line between two runs separates two; a short line that is no command is plain words", () => {
		const { ledger, wl, numbering } = rows();
		const text = ["3 left", "Relaunch the classifier fix now.", "", "Use the same plan, and tell me when the review is back.", `production ${wl}`, "fix it", "approve please"].join("\n");
		const r = interpretPaste(ledger, numbering, text);
		if (!r?.ok) throw new Error(`not an accepted paste: ${JSON.stringify(r)}`);
		expect(r.items.map((i) => (i.kind === "instruction" ? [i.from, i.to, i.text] : [i.line, i.kind]))).toEqual([
			[1, "batch"],
			[2, 4, "Relaunch the classifier fix now.\n\nUse the same plan, and tell me when the review is back."],
			[5, "command"],
			[6, 7, "fix it\napprove please"],
		]);
	});

	test("a command naming an id that does not resolve refuses the whole paste on its line, never as prose (Codex review of PR #30, B1)", () => {
		const { ledger, wl, sl, q, numbering } = rows();
		const c = ledger.openWorkload({ by: SURFACE_BY, brief: "Closed", stakes: "normal", mode: "autonomous" });
		ledger.closeWorkload(c, { by: SURFACE_BY });
		const cases: [string, string][] = [
			["approve en-nope", "no entry en-nope on the needs-you list"],
			["deny en-nope", "no entry en-nope on the needs-you list"],
			["left q-nope", "q-nope is not an open question"],
			["withdraw q-nope", "q-nope is not an open question"],
			["production wl-nope", "wl-nope is not an open workload"],
			["user-driven wl-nope", "wl-nope is not an open workload"],
			[`autonomous ${c}`, `${c} is not an open workload`],
			["ceiling 120 wl-nope", "wl-nope is not an open workload"],
			["rounds 5 wl-nope", "wl-nope is not an open workload"],
			["stop-reviews sl-nope", "sl-nope is not a slice of an open workload"],
			["left sl-nope", "sl-nope is not a slice of an open workload"],
			// the id resolves, the line still is no command: named with what the row takes
			[`approve ${q}`, `"approve ${q}" is not a command the surface knows (${q} takes: left / right / withdraw)`],
			[`approve ${wl}`, `"approve ${wl}" is not a command the surface knows`],
			[`left ${sl}`, `"left ${sl}" is not a command the surface knows`],
		];
		for (const [line, why] of cases) {
			const r = interpretPaste(ledger, numbering, `production ${wl}\n${line}`);
			expect(r).toEqual({ ok: false, refused: [{ line: 1, text: `production ${wl}`, why: null }, { line: 2, text: line, why: [why] }], held: [] });
		}
		// a word no open question offers is no command word: with an id it is still prose, as `cancel` is here
		expect(interpretPaste(ledger, numbering, `production ${wl}\ncancel sl-nope`)).toMatchObject({ ok: true, items: [{ line: 1 }, { kind: "instruction", from: 2, to: 2, text: "cancel sl-nope" }] });
		// an answered line before the bad one is refused with it (Probe A `answer-then-invalid`)
		expect(interpretPaste(ledger, numbering, `left ${q}\napprove en-nope`)).toEqual({
			ok: false,
			refused: [{ line: 1, text: `left ${q}`, why: null }, { line: 2, text: "approve en-nope", why: ["no entry en-nope on the needs-you list"] }],
			held: [],
		});
		// the single-line path is untouched: alone, the same line passes through
		expect(interpret(ledger, "approve en-nope")).toBeNull();
		expect(ledger.workload(wl)!.stakes).toBe("normal");
		expect(ledger.question(q)!.state).toBe("open");
		expect(allInstructions(ledger)).toHaveLength(0);
	});

	test("in a paste a stakes or mode word takes only a wl- id: `production ready` and `autonomous now` are prose (Codex review of PR #30, B2)", () => {
		const { ledger, wl, numbering } = rows();
		expect(interpretPaste(ledger, numbering, "The build is\nproduction ready")).toBeNull();
		expect(interpretPaste(ledger, numbering, "go\nautonomous now\nuser-driven please")).toBeNull();
		const r = interpretPaste(ledger, numbering, `normal ${wl}\nproduction ready`);
		expect(r).toEqual({
			ok: true,
			items: [{ line: 1, text: `normal ${wl}`, kind: "command", cmd: { kind: "stakes", workloadId: wl, stakes: "normal" } }, { kind: "instruction", from: 2, to: 2, text: "production ready" }],
		});
		// bare, and with the id, the word is the command
		expect(interpretPaste(ledger, numbering, "production\nthen go")).toMatchObject({ ok: true, items: [{ line: 1, cmd: { kind: "stakes", workloadId: wl } }, { kind: "instruction" }] });
		expect(interpretPaste(ledger, numbering, `production ${wl}\nthen go`)).toMatchObject({ ok: true, items: [{ line: 1, cmd: { kind: "stakes", workloadId: wl } }, { kind: "instruction" }] });
		// the single-line path is untouched (its permissive second word is flagged to Jo separately)
		expect(interpret(ledger, "production ready")).toEqual({ kind: "stakes", workloadId: wl, stakes: "production" });
		expect(ledger.workload(wl)!.stakes).toBe("normal");
	});

	test("a question or reserved request answered twice across lines, in any form, is refused on the later line (Codex review of PR #30, S1)", () => {
		const { ledger, wl, e1, q, numbering } = rows();
		expect(numbering.numberOf(q)).toBe(3);
		expect(interpretPaste(ledger, numbering, `left ${q}\nright ${q}`)).toEqual({
			ok: false,
			refused: [{ line: 1, text: `left ${q}`, why: null }, { line: 2, text: `right ${q}`, why: [`${q} is already answered on line 1; once per row`] }],
			held: [],
		});
		expect(interpretPaste(ledger, numbering, `3 left\nright ${q}`)).toEqual({
			ok: false,
			refused: [{ line: 1, text: "3 left", why: null }, { line: 2, text: `right ${q}`, why: [`${q} is already answered on line 1 (#3); once per row`] }],
			held: [],
		});
		expect(interpretPaste(ledger, numbering, `withdraw ${q}\n1 approve, 3 left`)).toEqual({
			ok: false,
			refused: [{ line: 1, text: `withdraw ${q}`, why: null }, { line: 2, text: "1 approve, 3 left", why: [`#3: ${q} is already answered on line 1; once per row`] }],
			held: [],
		});
		expect(interpretPaste(ledger, numbering, `approve ${e1}\ndeny ${e1}`)).toMatchObject({
			ok: false,
			refused: [{ line: 1, why: null }, { line: 2, why: [`${e1} is already decided on line 1; once per row`] }],
		});
		// two stakes words on one workload are not a duplicate: the later wins, as two messages would
		expect(interpretPaste(ledger, numbering, `production ${wl}\nnormal ${wl}`)).toMatchObject({ ok: true });
		expect(ledger.question(q)!.state).toBe("open");
		expect(allInstructions(ledger)).toHaveLength(0);
	});

	test("a paste with no command line is prose: null, nothing read as a command", () => {
		const { ledger, numbering } = rows();
		expect(interpretPaste(ledger, numbering, "new workload, normal stakes:\nmove the header offset into a token\nthen drop the old class")).toBeNull();
		expect(interpretPaste(ledger, numbering, "fix it\nplease")).toBeNull();
	});

	test("one bad line refuses the whole paste: the verdict names each command line by number and text, nothing is applied", () => {
		const { ledger, wl, e1, numbering } = rows();
		const bad = interpretPaste(ledger, numbering, `production ${wl}\n9 deny\nthen relaunch it`);
		expect(bad).toEqual({
			ok: false,
			refused: [
				{ line: 1, text: `production ${wl}`, why: null },
				{ line: 2, text: "9 deny", why: ["#9 is not on the needs-you list"] },
			],
			held: [{ kind: "instruction", from: 3, to: 3, text: "then relaunch it" }],
		});
		// a bare word fitting several rows: the ambiguous command is the verdict, for the caller's "which one?"
		const which = interpretPaste(ledger, numbering, `approve\nproduction ${wl}`);
		expect(which).toMatchObject({ ok: false, refused: [{ line: 1, text: "approve", why: { kind: "ambiguous", word: "approve" } }, { line: 2, why: null }], held: [] });
		// a number given on two lines is caught across the paste, as in one batch
		expect(interpretPaste(ledger, numbering, `1 approve\nproduction ${wl}\n1 deny`)).toMatchObject({
			ok: false,
			refused: [{ line: 1, why: ["#1 appears more than once in this batch"] }, { line: 2, why: null }, { line: 3, why: ["#1 appears more than once in this batch"] }],
		});
		expect(ledger.workload(wl)!.stakes).toBe("normal");
		expect(allInstructions(ledger)).toHaveLength(0);
		expect(errorLines(ledger).some((l) => l.rowId === e1)).toBe(true);
	});
});

describe("review round limit (D9) and stop-reviews (D10)", () => {
	const LANE = "lane-r-1";
	const findings = (blocking: number): Findings => ({
		counts: { blocking: blocking > 0 ? { correctness: blocking } : {}, major: { tests: 2 }, minor: {} },
		titles: [],
	});
	/** A review hand of round `n` on `sl` spawned (the classifier's `hand-spawn:`), and settled with `blocking` findings unless `running`. */
	function round(ledger: Ledger, wl: string, sl: string, n: number, o: { blocking?: number; running?: boolean; unknown?: boolean } = {}): void {
		const token = `dt-${sl}-${n}`;
		const group = `dg-${sl}-${n}`;
		const entry = (body: string) => ledger.recordEntry({ by: LANE, workloadId: wl, sliceId: sl, kind: "assumption", body });
		entry(handSpawnBody({ token, root: "/s/lane.jsonl", spawnKey: null, review: true, group, row: ["openai/gpt-6"] }));
		if (!o.running) entry(reviewRoundBody({ slice: sl, round: n, token, group, verdict: "accepted", findings: o.unknown ? "unknown" : findings(o.blocking ?? 1) }));
	}
	/** The classifier's round-limit question on `sl` and its `review-limit:` entry. */
	function limitQuestion(ledger: Ledger, wl: string, sl: string): string {
		const q = ledger.raiseQuestion({ by: LANE, workloadId: wl, sliceId: sl, body: "The review reached its round limit", options: [...ROUND_LIMIT_OPTIONS] });
		ledger.recordEntry({ by: LANE, workloadId: wl, sliceId: sl, kind: "assumption", body: reviewLimitBody(q, sl) });
		return q;
	}
	/** The classifier's park question on `sl` and its `review-park:` entry. */
	function parkQuestion(ledger: Ledger, wl: string, sl: string): string {
		const q = ledger.raiseQuestion({ by: LANE, workloadId: wl, sliceId: sl, body: "No other lab can review", options: ["same-lab", "wait"] });
		ledger.recordEntry({ by: LANE, workloadId: wl, sliceId: sl, kind: "assumption", body: reviewParkBody(q, sl) });
		return q;
	}
	/** A workload at its limit on `sl`: three failed rounds and the open limit question. */
	function atLimit(ledger: Ledger) {
		const { wl, sl } = workloadWithSlice(ledger);
		for (const n of [1, 2, 3]) round(ledger, wl, sl, n, { blocking: 4 - n });
		return { wl, sl, q: limitQuestion(ledger, wl, sl) };
	}
	const bodies = (ledger: Ledger, wl: string, prefix: string) => ledger.entries(wl, "assumption").map((e) => e.body).filter((b) => b.startsWith(prefix));
	const limitOf = (ledger: Ledger, wl: string, sl: string) => effectiveRoundLimit(ledger.entries(wl), ledger.instructions(wl), ledger.workload(wl)!.stakes, sl);

	test("`rounds 5` with one workload in view writes the instruction, then the review-rounds: entry naming it, and the limit is 5", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		expect(limitOf(ledger, wl, sl).workload).toBe(3);
		const cmd = interpret(ledger, "rounds 5");
		expect(cmd).toEqual({ kind: "rounds", workloadId: wl, rounds: 5 });
		expect(apply(ledger, cmd!)).toMatch(new RegExp(`^review round limit on ${wl} → 5 failed rounds per review loop \\(instruction in-\\S+\\)$`));
		const [i] = ledger.instructions(wl);
		expect(i).toMatchObject({ kind: "instruction", body: "rounds: 5", author: "jo", channel: "surface" });
		expect(bodies(ledger, wl, "review-rounds:")).toEqual([`review-rounds: 5 source your word by ${i!.id}`]);
		expect(limitOf(ledger, wl, sl)).toEqual({ workload: 5, extend: 0, total: 5 });
		// not the command: no number, zero, a non-workload third word, a workload not in view; never a numbered batch
		for (const text of ["rounds", "rounds five", "rounds 0", `rounds 5 ${sl}`, "rounds 5 wl-nope"]) expect(interpret(ledger, text)).toBeNull();
		expect(parseBatch("rounds 5")).toBeNull();
	});

	test("`rounds 5` bare with two workloads in view asks which one and writes nothing; `rounds 5 wl-…` picks", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const a = workloadWithSlice(ledger).wl;
		c.plusHours(0.01);
		const b = workloadWithSlice(ledger, { brief: "second" }).wl;
		const cmd = interpret(ledger, "rounds 5")!;
		expect(cmd).toEqual({ kind: "ambiguous", word: "rounds 5", candidates: [{ kind: "workload", workloadId: a }, { kind: "workload", workloadId: b }] });
		expect(() => apply(ledger, cmd)).toThrow("refused, never applied");
		expect(allInstructions(ledger)).toEqual([]);
		expect([...bodies(ledger, a, "review-rounds"), ...bodies(ledger, b, "review-rounds")]).toEqual([]);
		apply(ledger, interpret(ledger, `rounds 5 ${b}`)!);
		expect(ledger.instructions(a)).toEqual([]);
		expect(ledger.instructions(b).map((i) => i.body)).toEqual(["rounds: 5"]);
	});

	test("`extend` on a review-limit: question adds one block to that slice only and reopens it", () => {
		const { ledger } = tempLedger();
		const { wl, sl, q } = atLimit(ledger);
		const other = ledger.addSlice({ by: LANE, workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		expect(ledger.slice(sl)!.state).not.toBe("open");
		const cmd = interpret(ledger, "extend")!;
		expect(cmd).toMatchObject({ kind: "answer", questionId: q, answer: "extend" });
		const receipt = apply(ledger, cmd);
		const answer = ledger.instructions(wl).find((i) => i.kind === "answer")!;
		expect(receipt).toContain(`slice ${sl} is open; 3 more review rounds for ${sl} (its limit is now 6 failed rounds)`);
		expect(bodies(ledger, wl, "review-rounds-extend:")).toEqual([`review-rounds-extend: ${sl} +3 by ${answer.id}`]);
		expect(ledger.slice(sl)!.state).toBe("open");
		expect(limitOf(ledger, wl, sl)).toEqual({ workload: 3, extend: 3, total: 6 });
		expect(limitOf(ledger, wl, other).total).toBe(3);
		expect(bodies(ledger, wl, "review-loop-end:")).toEqual([]);
	});

	test("`accept` ends the loop as accepted and reopens the slice, completing nothing; `stop` ends the loop", () => {
		for (const word of ["accept", "stop"] as const) {
			const { ledger } = tempLedger();
			const { wl, sl } = atLimit(ledger);
			const receipt = apply(ledger, interpret(ledger, word)!);
			expect(bodies(ledger, wl, "review-loop-end:")).toEqual([`review-loop-end: ${sl} reason ${word}`]);
			expect(bodies(ledger, wl, "review-rounds")).toEqual([]);
			expect(ledger.slice(sl)!.state).toBe("open");
			expect(ledger.slices(wl).filter((s) => s.state === "done")).toEqual([]);
			expect(countRounds(ledger.entries(wl), sl).rounds).toEqual([]); // the next review starts a fresh loop
			expect(receipt).toContain(word === "accept" ? `the review of ${sl} counts as passed with its findings left` : `no further review round on ${sl}`);
		}
	});

	test("a question offering extend / accept / stop with no review-limit: entry naming it is an ordinary question", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q = ledger.raiseQuestion({ by: LANE, workloadId: wl, sliceId: sl, body: "Go on?", options: [...ROUND_LIMIT_OPTIONS] });
		// an entry naming the question on another slice, or written by someone other than the asker, does not make it one
		ledger.recordEntry({ by: LANE, workloadId: wl, sliceId: sl, kind: "assumption", body: reviewLimitBody(q, "sl-other") });
		ledger.recordEntry({ by: "lane-x-1", workloadId: wl, sliceId: sl, kind: "assumption", body: reviewLimitBody(q, sl) });
		apply(ledger, interpret(ledger, "extend")!);
		expect(ledger.question(q)!.state).toBe("answered");
		expect(bodies(ledger, wl, "review-rounds-extend:")).toEqual([]);
		expect(bodies(ledger, wl, "review-loop-end:")).toEqual([]);
	});

	test("bare `stop-reviews`: instruction + review-stop:, the open limit question withdrawn then cancel, idle loops ended, the echo per loop", () => {
		const { ledger } = tempLedger();
		const { wl, sl, q } = atLimit(ledger); // round 3 left blocking 1
		const busy = ledger.addSlice({ by: LANE, workloadId: wl, task: "t2", doneCondition: "d", inputs: "i" });
		round(ledger, wl, busy, 1, { blocking: 2 });
		round(ledger, wl, busy, 2, { running: true });
		const quiet = ledger.addSlice({ by: LANE, workloadId: wl, task: "t3", doneCondition: "d", inputs: "i" });
		const cmd = interpret(ledger, "stop-reviews")!;
		expect(cmd).toEqual({ kind: "stop-reviews", workloadId: wl, target: wl });
		const receipt = apply(ledger, cmd);
		const [i] = ledger.instructions(wl).filter((x) => x.kind === "instruction");
		expect(i).toMatchObject({ body: `stop-reviews: ${wl}`, author: "jo", channel: "surface" });
		expect(bodies(ledger, wl, "review-stop:")).toEqual([`review-stop: ${wl} by ${i!.id}`]);
		expect(ledger.question(q)!.state).toBe("withdrawn");
		expect(ledger.instructions(wl).find((x) => x.kind === "withdrawal")).toMatchObject({ question_id: q, disposition: "cancel", author: "jo" });
		expect(ledger.slice(sl)!.state).toBe("cancelled");
		// the idle loop ends here; the running round's settle ends the busy one (the classifier)
		expect(bodies(ledger, wl, "review-loop-end:")).toEqual([`review-loop-end: ${sl} reason stop-reviews`]);
		expect(receipt).toContain(`stopped every review loop on ${wl} (instruction ${i!.id})`);
		expect(receipt).toContain(`${sl}: round 3 left blocking 1 (correctness 1) · major 2 (tests 2) · minor 0; withdrew ${q}`);
		expect(receipt).toContain(`${busy}: round 2 still running`);
		expect(receipt).not.toContain(quiet);
		// the classifier reads the stop back on every slice of the workload
		for (const s of [sl, busy, quiet]) expect(reviewStopOn(ledger.entries(wl), ledger.instructions(wl), wl, s)).toBe(i!.id);
	});

	test("`stop-reviews sl-…` stops that loop only: its open park question withdrawn then cancel, another slice's left open", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const other = ledger.addSlice({ by: LANE, workloadId: wl, task: "t2", doneCondition: "d", inputs: "i" });
		const p1 = parkQuestion(ledger, wl, sl);
		const p2 = parkQuestion(ledger, wl, other);
		const cmd = interpret(ledger, `stop-reviews ${sl}`)!;
		expect(cmd).toEqual({ kind: "stop-reviews", workloadId: wl, target: sl });
		const receipt = apply(ledger, cmd);
		const i = ledger.instructions(wl).find((x) => x.kind === "instruction")!;
		expect(i).toMatchObject({ body: `stop-reviews: ${sl}`, slice_id: sl });
		expect(bodies(ledger, wl, "review-stop:")).toEqual([`review-stop: ${sl} by ${i.id}`]);
		expect(ledger.question(p1)!.state).toBe("withdrawn");
		expect(ledger.question(p2)!.state).toBe("open");
		expect(bodies(ledger, wl, "review-loop-end:")).toEqual([`review-loop-end: ${sl} reason stop-reviews`]);
		const withdrawal = ledger.instructions(wl).find((x) => x.kind === "withdrawal")!;
		expect(withdrawal).toMatchObject({ question_id: p1, disposition: "cancel" });
		expect(receipt).toBe(`stopped the review loop on ${sl} (instruction ${i.id}); ${sl}: no review round settled in this loop; withdrew ${p1} (withdrawal ${withdrawal.id}, then cancel)`);
		expect(reviewStopOn(ledger.entries(wl), ledger.instructions(wl), wl, sl)).toBe(i.id);
		expect(reviewStopOn(ledger.entries(wl), ledger.instructions(wl), wl, other)).toBeNull();
	});

	test("bare `stop-reviews` with two workloads in view asks which one and writes nothing; `wl-…` and `sl-…` pick", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const a = workloadWithSlice(ledger);
		c.plusHours(0.01);
		const b = workloadWithSlice(ledger, { brief: "second" });
		const cmd = interpret(ledger, "stop-reviews")!;
		expect(cmd).toEqual({ kind: "ambiguous", word: "stop-reviews", candidates: [{ kind: "workload", workloadId: a.wl }, { kind: "workload", workloadId: b.wl }] });
		expect(() => apply(ledger, cmd)).toThrow("refused, never applied");
		expect(allInstructions(ledger)).toEqual([]);
		expect(interpret(ledger, `stop-reviews ${b.wl}`)).toEqual({ kind: "stop-reviews", workloadId: b.wl, target: b.wl });
		expect(interpret(ledger, `stop-reviews ${a.sl}`)).toEqual({ kind: "stop-reviews", workloadId: a.wl, target: a.sl });
		for (const text of ["stop-reviews wl-nope", "stop-reviews sl-nope", "stop-reviews q-1"]) expect(interpret(ledger, text)).toBeNull();
		apply(ledger, interpret(ledger, `stop-reviews ${b.wl}`)!);
		expect(ledger.instructions(a.wl)).toEqual([]);
		expect(bodies(ledger, b.wl, "review-stop:")).toHaveLength(1);
	});

	test("the echo names a settled round's unreadable findings", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		round(ledger, wl, sl, 1, { unknown: true });
		expect(apply(ledger, interpret(ledger, "stop-reviews")!)).toContain(`${sl}: round 1 left unknown`);
	});

	test("the ceiling question's bare `stop` still answers the ceiling question, untouched by `stop-reviews`", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const park = parkQuestion(ledger, wl, sl);
		const ceilingSlice = ledger.addSlice({ by: LANE_RUNNER_BY, workloadId: wl, id: "sl-ceiling-1", task: "Jo decides the ceiling overrun", doneCondition: "Jo answered", inputs: "spend" });
		const cq = ledger.raiseQuestion({ by: LANE_RUNNER_BY, workloadId: wl, sliceId: ceilingSlice, body: "80 % of the ceiling", options: [...CEILING_OPTIONS] });
		expect(CEILING_OPTIONS).toContain("stop");
		apply(ledger, interpret(ledger, "stop-reviews")!);
		expect(ledger.question(park)!.state).toBe("withdrawn");
		expect(ledger.question(cq)!.state).toBe("open");
		const stop = interpret(ledger, "stop")!;
		expect(stop).toEqual({ kind: "answer", workloadId: wl, questionId: cq, answer: "stop" });
		apply(ledger, stop);
		expect(ledger.question(cq)!.state).toBe("answered");
		expect(ledger.slice(ceilingSlice)!.state).toBe("done");
		expect(bodies(ledger, wl, "review-loop-end:")).toEqual([`review-loop-end: ${sl} reason stop-reviews`]);
	});
});
