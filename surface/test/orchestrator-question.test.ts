// The orchestrator's questions to Jo as ledger rows (MIGRATION.md item 105): the standing slice is
// ensured once on any ledger (fresh, or one from before the item with the workload and no slice);
// orchestrator_raise_question writes the row on it, the needs-you render and the wake show it, and
// the invariant report's stuck-question counts it with no change to its SQL; Jo's `<option> q-…`
// at the surface resolves the row and mirrors the decision on the subject workload in one
// transaction (a mirror that cannot be written rolls the answer back); a withdrawal with `cancel`
// never cancels the standing slice, so a second question can always be raised; a restarted
// surface re-renders the open ones at its wake.
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { check, type Probe } from "../scripts/invariants";
import { errorLines } from "../src/errors";
import { ensureStandingWorkload, standingSlice } from "../src/identity";
import { apply, interpret } from "../src/input";
import { answerOrchestratorQuestion, orchestratorQuestionBody, parseOrchestratorQuestion } from "../src/orchestrator-question";
import { STANDING_BRIEF, STANDING_SLICE_ID, STANDING_SLICE_TASK, STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import { ctxOf, fakePi, notices, tempLedger, tmp } from "./helpers";

type Started = { systemPrompt: string[]; messages: { customType: string; content: string }[] };

/** A surface over `db`, as a fresh process would load it. */
function surface(db: string) {
	const voice = join(tmp("voice"), "VOICE.md");
	writeFileSync(voice, "VOICE DOC BODY");
	const env = { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: db, AGENT_SYSTEM_VOICE: voice, HOME: "/nonexistent-home" };
	const f = fakePi();
	orchestratorSurface(f.pi, env);
	const ctx = ctxOf();
	const raise = async (params: Record<string, unknown>) => (await f.tool("orchestrator_raise_question").execute("1", params, undefined, undefined, ctx)).content[0]!.text;
	const idOf = (text: string): string => {
		const m = /^Raised question (q-\S+)/.exec(text);
		if (!m) throw new Error(`not raised: ${text}`);
		return m[1]!;
	};
	const wake = async (): Promise<string> => {
		await f.emit("session_start", { type: "session_start" }, ctx);
		const started = (await f.emit("before_agent_start", { prompt: "hi", systemPrompt: ["base"] }, ctx)) as Started;
		return started.messages[0]?.content ?? "";
	};
	const say = async (prompt: string): Promise<string[]> => {
		notices.length = 0;
		await f.emit("before_agent_start", { prompt, systemPrompt: [] }, ctx);
		return [...notices];
	};
	return { f, ctx, raise, idOf, wake, say };
}

describe("the standing slice", () => {
	test("a fresh ledger gets the standing workload and its slice together; a ledger from before item 105 (workload, no slice) gets the slice alone; each call after the first adds nothing", () => {
		const fresh = tempLedger().ledger;
		expect(ensureStandingWorkload(fresh)).toBe(STANDING_WORKLOAD_ID);
		expect(fresh.slices(STANDING_WORKLOAD_ID)).toMatchObject([{ id: STANDING_SLICE_ID, task: STANDING_SLICE_TASK, state: "open", created_by: SURFACE_BY }]);
		ensureStandingWorkload(fresh);
		ensureStandingWorkload(fresh);
		expect(fresh.slices(STANDING_WORKLOAD_ID)).toHaveLength(1);
		expect(standingSlice(fresh)?.id).toBe(STANDING_SLICE_ID);

		const old = tempLedger().ledger;
		old.openWorkload({ by: SURFACE_BY, id: STANDING_WORKLOAD_ID, brief: STANDING_BRIEF, stakes: "throwaway", mode: "autonomous" });
		old.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: "identity: Ilex (they/them)" });
		expect(standingSlice(old)).toBeNull();
		ensureStandingWorkload(old);
		ensureStandingWorkload(old);
		expect(old.slices(STANDING_WORKLOAD_ID).map((s) => [s.id, s.state])).toEqual([[STANDING_SLICE_ID, "open"]]);
		expect(old.entries(STANDING_WORKLOAD_ID, "assumption")).toHaveLength(1);
	});

	test("a standing slice cancelled by a direct write is replaced by a live one under a fresh id, so a question can still be raised", () => {
		const { ledger } = tempLedger();
		ensureStandingWorkload(ledger);
		ledger.cancelSlice(STANDING_SLICE_ID, { by: "someone" });
		expect(standingSlice(ledger)).toBeNull();
		ensureStandingWorkload(ledger);
		const live = standingSlice(ledger)!;
		expect(live.id).not.toBe(STANDING_SLICE_ID);
		expect(live).toMatchObject({ task: STANDING_SLICE_TASK, state: "open" });
		expect(() => ledger.raiseQuestion({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, sliceId: live.id, body: "x?", options: ["a", "b"] })).not.toThrow();
	});
});

describe("the question row", () => {
	test("the body carries the subject workload as `about <wl>: ` and parses back; no subject is the text alone", () => {
		expect(orchestratorQuestionBody("wl-abc123", "Ship it?")).toBe("about wl-abc123: Ship it?");
		expect(parseOrchestratorQuestion("about wl-abc123: Ship it?")).toEqual({ about: "wl-abc123", text: "Ship it?" });
		expect(parseOrchestratorQuestion("Ship it?")).toEqual({ about: null, text: "Ship it?" });
		expect(orchestratorQuestionBody(null, "Ship it?")).toBe("Ship it?");
	});

	test("orchestrator_raise_question writes the row on the standing slice (pausing it), refuses a bad shape, and the row shows under needs-you, in the wake, and in stuck-question after 30 min", async () => {
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "lane-a", brief: "Fix the wake read", stakes: "normal", mode: "autonomous" });
		const done = ledger.openWorkload({ by: "lane-a", brief: "Done already", stakes: "normal", mode: "autonomous" });
		ledger.closeWorkload(done, { by: "lane-a" });
		const s = surface(path);
		expect(await s.raise({ body: "", options: ["a", "b"] })).toContain("nothing was asked");
		expect(await s.raise({ body: "x?", options: ["a", "A"] })).toContain("at least two distinct options");
		expect(await s.raise({ body: "x?", options: ["a", "two words"] })).toContain("one word");
		expect(await s.raise({ body: "x?", options: ["a", "b"], about: STANDING_WORKLOAD_ID })).toContain("never a question's subject");
		expect(await s.raise({ body: "x?", options: ["a", "b"], about: "nope" })).toContain("not a workload id");
		expect(await s.raise({ body: "x?", options: ["a", "b"], about: "wl-nope" })).toContain("No workload wl-nope");
		expect(await s.raise({ body: "x?", options: ["a", "b"], about: done })).toContain("is closed");
		expect(ledger.questions(STANDING_WORKLOAD_ID)).toEqual([]);
		const text = await s.raise({ body: "Open a production workload for the empty-slice\n  wake-read fix now, or later?", options: ["now", "later"], about: wl });
		const q = s.idOf(text);
		expect(text).toContain(`about ${wl} (now / later); name ${q} in your QUESTION block`);
		expect(ledger.question(q)).toMatchObject({
			workload_id: STANDING_WORKLOAD_ID, slice_id: STANDING_SLICE_ID, state: "open", created_by: SURFACE_BY,
			body: `about ${wl}: Open a production workload for the empty-slice wake-read fix now, or later?`, options: '["now","later"]',
		});
		expect(ledger.slice(STANDING_SLICE_ID)!.state).toBe("paused");
		expect(s.f.entries.filter((e) => e.type === "surface-question")).toEqual([{ type: "surface-question", data: { id: q, about: wl } }]);

		// needs-you: the orchestrator's own line, numbered like any question, its subject named.
		const lines = errorLines(ledger).filter((l) => l.kind === "question");
		expect(lines).toMatchObject([{ workloadId: STANDING_WORKLOAD_ID, rowId: q, options: ["now", "later"] }]);
		expect(lines[0]!.line).toBe(`the orchestrator asked you (${q}, about ${wl}): Open a production workload for the empty-slice wake-read fix now, or later? — answer with one word: now / later (or \`withdraw\`)`);
		expect(await s.wake()).toContain(lines[0]!.line);

		// stuck-question, over the same SQL, 30 min on: the finding names the row on the standing workload. (The surface's own
		// connection stamps real time, so as-of is taken from the row.)
		const db = new Database(path, { readonly: true });
		const noProbe: Probe<never> = { skipped: "not run" };
		const at = Date.parse(ledger.question(q)!.created_at);
		const run = (minutes: number) => check({ db, asOf: new Date(at + minutes * 60_000).toISOString(), replay: true, liveLanes: { found: new Set<string>() }, lanesDirOf: () => "/nonexistent", repo: "/nonexistent", git: null, orchestrators: () => noProbe });
		expect(run(20).findings.filter((f) => f.invariant === "stuck-question")).toEqual([]);
		const stuck = run(31).findings.filter((f) => f.invariant === "stuck-question");
		expect(stuck).toMatchObject([{ key: `stuck-question:${q}`, workload: STANDING_WORKLOAD_ID, since: ledger.question(q)!.created_at }]);
		expect(stuck[0]!.text).toContain("has been open 31 min");
		db.close();
	});
});

describe("Jo's answer", () => {
	test("`<option> q-…` resolves the row and writes Jo's instruction on the subject workload in one transaction; the lane on that workload reads it there; the standing slice is open again", async () => {
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "lane-a", brief: "Fix the wake read", stakes: "normal", mode: "autonomous" });
		const s = surface(path);
		const q = s.idOf(await s.raise({ body: "Open the fix workload now, or later?", options: ["now", "later"], about: wl }));
		const cmd = interpret(ledger, `later ${q}`);
		expect(cmd).toEqual({ kind: "answer", workloadId: STANDING_WORKLOAD_ID, questionId: q, answer: "later" });
		const lines = await s.say(`later ${q}`);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatch(new RegExp(`^answered the orchestrator's ${q} with "later" \\(answer in-\\S+\\); recorded on ${wl} as instruction in-\\S+$`));
		const row = ledger.question(q)!;
		expect(row.state).toBe("answered");
		const answer = ledger.instructions(STANDING_WORKLOAD_ID).find((i) => i.id === row.resolved_by)!;
		expect(answer).toMatchObject({ kind: "answer", question_id: q, author: "jo", channel: "surface", body: "later" });
		expect(ledger.instructions(wl)).toMatchObject([{ kind: "instruction", question_id: null, author: "jo", channel: "surface", body: `Jo: "later" — answers ${q}: Open the fix workload now, or later?` }]);
		expect(ledger.slice(STANDING_SLICE_ID)!.state).toBe("open");
	});

	test("a bare option word fits the orchestrator's question like any other; the numbered batch form answers it too", async () => {
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "lane-a", brief: "Fix", stakes: "normal", mode: "autonomous" });
		const s = surface(path);
		const q = s.idOf(await s.raise({ body: "Now or later?", options: ["now", "later"], about: wl }));
		expect(interpret(ledger, "now")).toEqual({ kind: "answer", workloadId: STANDING_WORKLOAD_ID, questionId: q, answer: "now" });
		await s.wake(); // numbers the needs-you lines
		const lines = await s.say("1 now");
		expect(lines[0]).toContain(`#1 → answered the orchestrator's ${q} with "now"`);
		expect(ledger.instructions(wl).map((i) => i.body)).toEqual([`Jo: "now" — answers ${q}: Now or later?`]);
	});

	test("the mirror and the answer are one transaction: a mirror the file refuses leaves the question open", () => {
		const { ledger } = tempLedger();
		ensureStandingWorkload(ledger);
		const q = ledger.raiseQuestion({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, sliceId: STANDING_SLICE_ID, body: orchestratorQuestionBody("wl-gone000000000", "x?"), options: ["a", "b"] });
		expect(() => ledger.answerQuestionMirrored(q, { by: SURFACE_BY, author: "jo", channel: "surface", answer: "a", mirror: { workloadId: "wl-gone000000000", body: "x" } })).toThrow();
		expect(ledger.question(q)!.state).toBe("open");
		expect(ledger.instructions(STANDING_WORKLOAD_ID)).toEqual([]);
		// The surface path skips the mirror for a subject that is gone or closed, and the answer still lands.
		const r = answerOrchestratorQuestion(ledger, ledger.question(q)!, { answer: "a", mirrorBody: "x" });
		expect(r).toMatchObject({ about: null, mirrorId: null });
		expect(ledger.question(q)!.state).toBe("answered");
	});

	test("a withdrawal with `cancel` never cancels the standing slice: it replans, the slice is open, and a second question is raised", async () => {
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "lane-a", brief: "Fix", stakes: "normal", mode: "autonomous" });
		const s = surface(path);
		const q = s.idOf(await s.raise({ body: "Now or later?", options: ["now", "later"], about: wl }));
		expect(interpret(ledger, `withdraw ${q}`)).toEqual({ kind: "withdraw", workloadId: STANDING_WORKLOAD_ID, questionId: q, then: "replan" });
		const receipt = apply(ledger, { kind: "withdraw", workloadId: STANDING_WORKLOAD_ID, questionId: q, then: "cancel" });
		expect(receipt).toMatch(new RegExp(`^withdrew the orchestrator's ${q} \\(withdrawal in-\\S+, then replan\\); the standing slice stays open$`));
		const row = ledger.question(q)!;
		expect(row.state).toBe("withdrawn");
		expect(ledger.instructions(STANDING_WORKLOAD_ID).find((i) => i.id === row.resolved_by)).toMatchObject({ kind: "withdrawal", disposition: "replan" });
		expect(ledger.slice(STANDING_SLICE_ID)!.state).toBe("open");
		expect(ledger.instructions(wl)).toEqual([]);
		const q2 = s.idOf(await s.raise({ body: "Again?", options: ["yes", "no"], about: wl }));
		expect(ledger.question(q2)).toMatchObject({ state: "open", slice_id: STANDING_SLICE_ID });
		expect((await s.say(`withdraw ${q2}`))[0]).toContain("the standing slice stays open");
		expect(ledger.slice(STANDING_SLICE_ID)!.state).toBe("open");
	});
});

describe("restart", () => {
	test("a surface started over a ledger with open orchestrator questions renders each at its wake, with id and options", async () => {
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "lane-a", brief: "Fix", stakes: "normal", mode: "autonomous" });
		const first = surface(path);
		const q1 = first.idOf(await first.raise({ body: "Now or later?", options: ["now", "later"], about: wl }));
		const q2 = first.idOf(await first.raise({ body: "Rename me?", options: ["yes", "no"] }));
		ledger.close();
		const again = surface(path);
		const wake = await again.wake();
		expect(wake).toContain(`the orchestrator asked you (${q1}, about ${wl}): Now or later? — answer with one word: now / later (or \`withdraw\`)`);
		expect(wake).toContain(`the orchestrator asked you (${q2}): Rename me? — answer with one word: yes / no (or \`withdraw\`)`);
		const check = Ledger.open(path, { create: false, backup: false, backupOnOpen: false });
		expect(check.slices(STANDING_WORKLOAD_ID).map((s) => [s.id, s.state])).toEqual([[STANDING_SLICE_ID, "paused"]]);
		check.close();
	});
});
