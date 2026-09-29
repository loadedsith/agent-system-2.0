// Rows that read or write the ledger: 7 wake verified read, 11 Jo's instruction, the mode row, the
// lane-raised question row, and the gaslight fixtures G1-G3 (MIGRATION.md:49; SPEC-2.0.md § B3
// item 5, § B13.1). Real temp ledgers through ledger/src/index.ts, lane entries included (schema v3).
import { describe, expect, test } from "bun:test";
import type { Ledger } from "../../ledger/src/index";
import { checkToolCall } from "../src/gates";
import { checkQuestionDispatch, renderOpenQuestions } from "../src/rows/question";
import { WakeRead } from "../src/rows/r07-wake-read";
import { InstructionRecorder, recordJoInstruction } from "../src/rows/r11-jo-instruction";
import { ASK_TOOL, ModeController, type ToolSwitch } from "../src/rows/r14-ask-policy";
import type { CallContext } from "../src/types";
import { brief, tempLedger } from "./helpers";

const BY = "lane-test";

function workloadWithSlices(mode: "autonomous" | "user-driven" = "autonomous") {
	const { ledger } = tempLedger();
	const wl = ledger.openWorkload({ by: BY, brief: "build the gates", stakes: "normal", mode });
	const s1 = ledger.addSlice({ by: BY, workloadId: wl, task: "pick the schema", doneCondition: "migration merged", inputs: "ledger/" });
	const s2 = ledger.addSlice({ by: BY, workloadId: wl, task: "write docs", doneCondition: "README merged", inputs: "docs/" });
	return { ledger, wl, s1, s2 };
}

/** A fake OMP session tool set: `ask` registered (a UI session) and initially active. */
function toolSet(registered = true): ToolSwitch & { active: string[] } {
	const all = ["read", "bash", ...(registered ? [ASK_TOOL] : [])];
	const t = {
		active: [...all],
		getActiveTools: () => [...t.active],
		getAllTools: () => all.map((name) => ({ name })),
		setActiveTools: async (names: string[]) => {
			t.active = names.filter((n) => all.includes(n));
		},
	};
	return t;
}

describe("row 7: wake verified read", () => {
	/** A clock the test advances, shared by the ledger and the gate, so "since the trigger" is exact. */
	function clocked() {
		let now = Date.parse("2026-09-28T10:00:00.000Z");
		const clock = () => new Date(now).toISOString();
		const { ledger } = tempLedger(clock);
		const wl = ledger.openWorkload({ by: BY, brief: "b", stakes: "normal", mode: "autonomous" });
		return { ledger, wl, clock, tick: () => (now += 1000) };
	}
	const read = { toolName: "read", input: { path: "x" } };

	test("first turn after a trigger is free; the second is refused until this lane's entry exists in the real ledger", () => {
		const { ledger, wl, clock, tick } = clocked();
		const wake = new WakeRead(wl, BY, () => ledger, clock);
		wake.trigger("compaction");
		expect(wake.check(read)).toBeNull();
		wake.turnEnded();
		tick();
		expect(wake.check(read)?.reason).toContain("owes one ledger entry (kind wake-read, by lane-test)");
		expect(wake.owed()?.block).toBe(true); // the same refusal at the turn's stop: a tool-less turn is refused too
		expect(wake.check({ toolName: "bash", input: { command: "bun ledger/scripts/entry.ts wake-read" } })?.block).toBe(true); // no text exempts
		ledger.recordEntry({ by: BY, workloadId: wl, kind: "wake-read", body: "resuming slice sl-2 from the ledger" });
		expect(wake.check(read)).toBeNull();
		expect(wake.pending).toBeNull();
	});
	test("the recovery tool writes the entry through the module and discharges the obligation", () => {
		const { ledger, wl, clock, tick } = clocked();
		const wake = new WakeRead(wl, BY, () => ledger, clock);
		wake.trigger("restart");
		wake.turnEnded();
		tick();
		expect(wake.check({ toolName: "ledger_wake_read", input: { body: "x" } })).toBeNull();
		const id = wake.record("resuming the schema slice");
		expect(ledger.entries(wl, "wake-read")).toMatchObject([{ id, created_by: BY, body: "resuming the schema slice" }]);
		expect(wake.check(read)).toBeNull();
		expect(() => wake.record("   ")).toThrow("body was empty");
	});
	test("an entry from before the trigger does not count", () => {
		const { ledger, wl, clock, tick } = clocked();
		ledger.recordEntry({ by: BY, workloadId: wl, kind: "wake-read", body: "old wake" });
		tick();
		const wake = new WakeRead(wl, BY, () => ledger, clock);
		wake.trigger("restart");
		wake.turnEnded();
		expect(wake.check(read)?.block).toBe(true);
	});
	test("another lane's entry does not discharge this lane's obligation (astra review B3)", () => {
		const { ledger, wl, clock, tick } = clocked();
		const wake = new WakeRead(wl, BY, () => ledger, clock);
		wake.trigger("compaction");
		wake.turnEnded();
		tick();
		ledger.recordEntry({ by: "lane-other", workloadId: wl, kind: "wake-read", body: "their wake" });
		expect(wake.check(read)?.block).toBe(true);
	});
	test("no trigger, no gate", () => {
		const { ledger, wl } = clocked();
		const wake = new WakeRead(wl, BY, () => ledger);
		wake.turnEnded();
		expect(wake.check(read)).toBeNull();
	});
	test("fails closed when the ledger cannot be read", () => {
		const wake = new WakeRead("wl-1", BY, () => {
			throw new Error("ledger file missing");
		});
		wake.trigger("compaction");
		wake.turnEnded();
		expect(wake.check(read)?.reason).toContain("could not be read (Error: ledger file missing)");
	});
});

describe("row 11: Jo's direct instruction becomes a ledger entry before the turn", () => {
	test("an interactive message is recorded as a direct-channel instruction from jo", () => {
		const { ledger, wl } = workloadWithSlices();
		const id = recordJoInstruction(ledger, { text: "  use the v3 schema  ", source: "interactive", workloadId: wl, laneId: BY });
		expect(id).toMatch(/^in-/);
		const rows = ledger.instructions(wl);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ kind: "instruction", channel: "direct", author: "jo", body: "use the v3 schema", created_by: BY });
	});
	test("rpc/extension input, empty input and slash commands are not instructions", () => {
		const { ledger, wl } = workloadWithSlices();
		expect(recordJoInstruction(ledger, { text: "x", source: "rpc", workloadId: wl, laneId: BY })).toBeNull();
		expect(recordJoInstruction(ledger, { text: "x", source: "extension", workloadId: wl, laneId: BY })).toBeNull();
		expect(recordJoInstruction(ledger, { text: "   ", source: "interactive", workloadId: wl, laneId: BY })).toBeNull();
		expect(recordJoInstruction(ledger, { text: "/compact", source: "interactive", workloadId: wl, laneId: BY })).toBeNull();
		expect(ledger.instructions(wl)).toHaveLength(0);
	});
	test("a failed write is held, reported, and recorded once on the next input (astra review B6)", () => {
		const { ledger, wl } = workloadWithSlices();
		let broken = true;
		const flaky: Pick<Ledger, "recordInstruction" | "instructions"> = {
			recordInstruction: (i) => {
				if (broken) throw new Error("database is locked");
				return ledger.recordInstruction(i);
			},
			instructions: (id) => ledger.instructions(id),
		};
		const rec = new InstructionRecorder(() => flaky, wl, BY);
		expect(rec.onInput("use v3", "interactive")).toMatchObject({ ok: false, held: ["use v3"] });
		expect(ledger.instructions(wl)).toHaveLength(0);
		broken = false;
		expect(rec.onInput("and add docs", "interactive")).toMatchObject({ ok: true });
		expect(ledger.instructions(wl).map((r) => r.body)).toEqual(["use v3", "and add docs"]);
		expect(rec.held).toEqual([]);
	});
	test("a held instruction that did land before the error is not written twice", () => {
		const { ledger, wl } = workloadWithSlices();
		let landThenThrow = true;
		const flaky: Pick<Ledger, "recordInstruction" | "instructions"> = {
			recordInstruction: (i) => {
				const id = ledger.recordInstruction(i);
				if (landThenThrow) throw new Error("connection dropped after commit");
				return id;
			},
			instructions: (id) => ledger.instructions(id),
		};
		const rec = new InstructionRecorder(() => flaky, wl, BY);
		expect(rec.onInput("use v3", "interactive").ok).toBe(false);
		landThenThrow = false;
		expect(rec.onInput("/compact", "interactive").ok).toBe(true);
		expect(ledger.instructions(wl).map((r) => r.body)).toEqual(["use v3"]);
	});
});

describe("question row: pauses only its slice; a second change slice waits for the answer", () => {
	test("a dispatch naming the open question or its paused slice is refused; unrelated work is allowed", () => {
		const { ledger, wl, s1, s2 } = workloadWithSlices();
		const q = ledger.raiseQuestion({ by: BY, workloadId: wl, sliceId: s1, body: "v2 or v3 schema?", options: ["v2: no migration", "v3: migration, faster reads"] });
		expect(ledger.slice(s1)?.state).toBe("paused");
		expect(ledger.slice(s2)?.state).toBe("open");
		const byQuestion = { tasks: [{ agent: "standard", task: brief({ task: `Take v3 for ${q} and migrate.` }) }] };
		const bySlice = { tasks: [{ agent: "standard", task: brief({ task: `Finish ${s1} with v3.` }) }] };
		const unrelated = { tasks: [{ agent: "standard", task: brief({ task: "Write the docs.", kind: "change", slice: s2 }) }] };
		expect(checkQuestionDispatch(byQuestion, ledger, wl)?.reason).toContain(`changes work on ${q}`);
		expect(checkQuestionDispatch(bySlice, ledger, wl)?.reason).toContain(`pauses slice ${s1}`);
		expect(checkQuestionDispatch(unrelated, ledger, wl)).toBeNull();
		ledger.answerQuestion(q, { by: BY, answer: "v3", author: "jo", channel: "surface" });
		expect(checkQuestionDispatch(byQuestion, ledger, wl)).toBeNull();
	});
	test("a withdrawal replans and never approves: acting on the withdrawn question stays refused", () => {
		const { ledger, wl, s1 } = workloadWithSlices();
		const q = ledger.raiseQuestion({ by: BY, workloadId: wl, sliceId: s1, body: "ship Friday?", options: ["yes", "no"] });
		ledger.withdrawQuestion(q, { by: BY, reason: "moot", author: "jo", channel: "surface", then: "replan" });
		expect(ledger.question(q)?.state).toBe("withdrawn");
		const r = checkQuestionDispatch({ tasks: [{ agent: "fast", task: brief({ task: `Go with yes on ${q}.` }) }] }, ledger, wl);
		expect(r?.reason).toContain("never approves the unanswered choice");
	});
	test("wired into checkToolCall for a bound lane", () => {
		const { ledger, wl, s1 } = workloadWithSlices();
		const q = ledger.raiseQuestion({ by: BY, workloadId: wl, sliceId: s1, body: "a or b?", options: ["a", "b"] });
		const ctx: CallContext = { role: "lane", cwd: "/", env: {}, mode: "autonomous" };
		const call = { toolName: "task", input: { tasks: [{ agent: "fast", task: brief({ task: `do a for ${q}` }) }] } };
		expect(checkToolCall(call, ctx, { workload: { id: wl, ledger: () => ledger } })?.reason).toContain("question row");
	});
});

describe("G3: question lifecycle — stable id, no four-hour clock, rendered at wake regardless of last-N", () => {
	test("an unanswered question stays open and rendered past four hours; every open one is rendered", () => {
		let now = Date.parse("2026-09-28T09:00:00.000Z");
		const { ledger } = tempLedger(() => new Date(now).toISOString());
		const wl = ledger.openWorkload({ by: BY, brief: "b", stakes: "normal", mode: "autonomous" });
		const ids: string[] = [];
		for (let i = 0; i < 12; i++) {
			const s = ledger.addSlice({ by: BY, workloadId: wl, task: `slice ${i}`, doneCondition: "d", inputs: "i" });
			ids.push(ledger.raiseQuestion({ by: BY, workloadId: wl, sliceId: s, body: `choice ${i}?`, options: ["x", "y"] }));
		}
		now += 5 * 3600 * 1000;
		ledger.addSlice({ by: BY, workloadId: wl, task: "unrelated", doneCondition: "d", inputs: "i" });
		for (const id of ids) expect(ledger.question(id)?.state).toBe("open");
		const render = renderOpenQuestions(ledger, wl);
		for (const id of ids) expect(render).toContain(id);
		expect(render).toContain("(12;");
	});
	test("the answer instruction links back to the question by its id", () => {
		const { ledger, wl, s1 } = workloadWithSlices();
		const q = ledger.raiseQuestion({ by: BY, workloadId: wl, sliceId: s1, body: "a or b?", options: ["a", "b"] });
		const ans = ledger.answerQuestion(q, { by: BY, answer: "a", author: "jo", channel: "surface" });
		expect(ledger.instructions(wl).find((r) => r.id === ans)?.question_id).toBe(q);
		expect(ledger.question(q)?.resolved_by).toBe(ans);
		expect(ledger.slice(s1)?.state).toBe("open");
	});
});

describe("G2: mode flip in each direction; `ask` availability after the boundary; questions survive", () => {
	test("autonomous → user-driven → autonomous toggles actual `ask` availability before the next turn", async () => {
		const { ledger, wl } = workloadWithSlices("autonomous");
		const tools = toolSet();
		const modes = new ModeController("lane", tools, () => ledger.workload(wl)?.mode ?? null, { workloadId: wl, laneId: BY, ledger: () => ledger });
		const ctxFor = (mode: "autonomous" | "user-driven" | null): CallContext => ({ role: "lane", cwd: "/", env: {}, mode });

		let s = await modes.beforeTurn();
		expect(s).toMatchObject({ mode: "autonomous", askActive: false, effective: true });
		expect(tools.active).not.toContain(ASK_TOOL);
		expect(checkToolCall({ toolName: ASK_TOOL, input: {} }, ctxFor(s.mode))?.block).toBe(true);

		ledger.flipMode(wl, { by: BY, mode: "user-driven", author: "jo", channel: "surface" });
		expect(tools.active).not.toContain(ASK_TOOL); // not effective until the boundary
		s = await modes.beforeTurn();
		expect(s).toMatchObject({ mode: "user-driven", askActive: true, effective: true });
		expect(tools.active).toContain(ASK_TOOL);
		expect(checkToolCall({ toolName: ASK_TOOL, input: {} }, ctxFor(s.mode))).toBeNull();

		ledger.flipMode(wl, { by: BY, mode: "autonomous", author: "jo", channel: "surface" });
		s = await modes.beforeTurn();
		expect(s).toMatchObject({ mode: "autonomous", askActive: false, effective: true });
		expect(tools.active).not.toContain(ASK_TOOL);
		expect(checkToolCall({ toolName: ASK_TOOL, input: {} }, ctxFor(s.mode))?.block).toBe(true);

		// The surface may show a mode only once it is effective: one mode-effective entry per change.
		expect(ledger.entries(wl, "mode-effective").map((e) => e.body)).toEqual(["autonomous: ask unavailable", "user-driven: ask available", "autonomous: ask unavailable"]);
		expect(ledger.instructions(wl).filter((r) => r.kind === "mode-flip")).toHaveLength(2);
	});
	test("user-driven in a session with no UI (ask never registered) is not reported effective", async () => {
		const { ledger, wl } = workloadWithSlices("user-driven");
		const modes = new ModeController("lane", toolSet(false), () => ledger.workload(wl)?.mode ?? null, { workloadId: wl, laneId: BY, ledger: () => ledger });
		expect(await modes.beforeTurn()).toMatchObject({ mode: "user-driven", askActive: false, effective: false });
		expect(ledger.entries(wl)).toHaveLength(0);
	});
	test("a hand never gets `ask`, whatever the workload mode", async () => {
		const tools = toolSet();
		const s = await new ModeController("hand", tools, () => "user-driven").beforeTurn();
		expect(s.askActive).toBe(false);
		expect(tools.active).not.toContain(ASK_TOOL);
	});
	test("a pending question survives a flip in either direction", async () => {
		const { ledger, wl, s1, s2 } = workloadWithSlices("autonomous");
		const q = ledger.raiseQuestion({ by: BY, workloadId: wl, sliceId: s1, body: "a or b?", options: ["a", "b"] });
		ledger.flipMode(wl, { by: BY, mode: "user-driven", author: "jo", channel: "surface" });
		expect(ledger.question(q)?.state).toBe("open");
		expect(ledger.slice(s1)?.state).toBe("paused");
		expect(renderOpenQuestions(ledger, wl)).toContain(q);
		ledger.flipMode(wl, { by: BY, mode: "autonomous", author: "jo", channel: "surface" });
		expect(ledger.question(q)?.state).toBe("open");
		expect(ledger.slice(s1)?.state).toBe("paused");
		expect(ledger.slice(s2)?.state).toBe("open");
		expect(ledger.workload(wl)?.open_questions).toBe(1);
	});
	test("mode-effective is recorded in the real ledger as this lane's entry", async () => {
		const { ledger, wl } = workloadWithSlices("autonomous");
		const s = await new ModeController("lane", toolSet(), () => ledger.workload(wl)?.mode ?? null, { workloadId: wl, laneId: BY, ledger: () => ledger }).beforeTurn();
		expect(s.effective).toBe(true);
		expect(s.note).toBeUndefined();
		expect(ledger.entries(wl, "mode-effective")).toMatchObject([{ created_by: BY, body: "autonomous: ask unavailable" }]);
	});
});

describe("G1: the lane tier's no-wait sentence and the question row agree", () => {
	test("an autonomous lane has no blocking prompt; its only escalation pauses one slice and leaves the rest running", async () => {
		const { ledger, wl, s1, s2 } = workloadWithSlices("autonomous");
		const tools = toolSet();
		const s = await new ModeController("lane", tools, () => ledger.workload(wl)?.mode ?? null).beforeTurn();
		expect(tools.active).not.toContain(ASK_TOOL);
		const ctx: CallContext = { role: "lane", cwd: "/", env: {}, mode: s.mode };
		expect(checkToolCall({ toolName: ASK_TOOL, input: {} }, ctx)?.reason).toContain("`question` ledger row");
		ledger.raiseQuestion({ by: BY, workloadId: wl, sliceId: s1, body: "a or b?", options: ["a", "b"] });
		expect(ledger.slice(s1)?.state).toBe("paused");
		expect(ledger.slice(s2)?.state).toBe("open");
		const other = { tasks: [{ agent: "fast", task: brief({ task: "write docs", kind: "change", slice: s2 }) }] };
		expect(checkToolCall({ toolName: "task", input: other }, ctx, { workload: { id: wl, ledger: () => ledger } })).toBeNull();
	});
	test("the lane tier file (M3's) carries the reconciled sentence, when present", async () => {
		const file = Bun.file(new URL("../../tiers/lane.md", import.meta.url));
		if (!(await file.exists())) return;
		expect(await file.text()).toContain("a lane opens no blocking human prompt; reserved actions go through the § A4 gate; a material non-reserved choice goes through a `question` row that suspends only dependent work");
	});
});
