// The OMP adapter (gates/index.ts) driven by a fake extension API: role detection, row 2 injection
// in hands, row 3 flagging a hand's yield without blocking it, row 1 at session_stop, row 11 on
// input, row 7's wake cycle, and `ask` removed for an autonomous lane.
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import p11Gates, { type GatesAPI } from "../index";
import { CONTRACT_MARKER } from "../src/rows/r02-contract";
import { brief, tempLedger, tmp } from "./helpers";

type AnyHandler = (event: unknown, ctx: unknown) => unknown;

function fakePi(tools = ["read", "bash", "ask", "task", "yield"]) {
	const handlers = new Map<string, AnyHandler[]>();
	const entries: { type: string; data: unknown }[] = [];
	let active = [...tools];
	const pi = {
		on: (name: string, h: AnyHandler) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		getActiveTools: () => [...active],
		getAllTools: () => tools.map((name) => ({ name })),
		setActiveTools: async (names: string[]) => {
			active = names;
		},
		appendEntry: (type: string, data?: unknown) => entries.push({ type, data }),
	};
	const emit = async (name: string, event: unknown, ctx: unknown) => {
		let last: unknown;
		for (const h of handlers.get(name) ?? []) last = await h(event, ctx);
		return last;
	};
	return { pi: pi as unknown as GatesAPI, emit, entries, active: () => active };
}

const notices: string[] = [];
const ctxOf = (o: { hasUI: boolean; parent?: string; cwd?: string; resumed?: boolean }) => ({
	hasUI: o.hasUI,
	cwd: o.cwd ?? tmp("ext-cwd"),
	sessionManager: { getHeader: () => ({ parentSession: o.parent }), getEntries: () => (o.resumed ? [{ type: "message" }] : []) },
	ui: { notify: (m: string) => notices.push(m) },
});

describe("gates extension adapter", () => {
	test("a hand: contract injected, `ask` removed, yield flagged not blocked, no turn-shape gate", async () => {
		const contract = join(tmp("contract"), "c.md");
		writeFileSync(contract, "OWNED CONTRACT");
		const f = fakePi();
		p11Gates(f.pi, { AGENT_SYSTEM_CONTRACT: contract, HOME: "/nonexistent-home" });
		const ctx = ctxOf({ hasUI: false, parent: "/sessions/lane.jsonl" });
		await f.emit("session_start", { type: "session_start" }, ctx);
		const started = (await f.emit("before_agent_start", { prompt: "go", systemPrompt: ["base"] }, ctx)) as { systemPrompt: string[] };
		expect(started.systemPrompt.join("\n")).toContain(CONTRACT_MARKER);
		expect(started.systemPrompt.join("\n")).toContain("OWNED CONTRACT");
		expect(f.active()).not.toContain("ask");
		expect(((await f.emit("tool_call", { toolName: "ask", input: {} }, ctx)) as { block: boolean }).block).toBe(true);

		const report = "**ACTION**\n`bun test` → exit 0\nAll tests pass.";
		const res = (await f.emit("tool_call", { toolName: "yield", input: { data: { report, files: [] } } }, ctx)) as { block?: boolean; input: { data: { report: string } } };
		expect(res.block).toBeUndefined();
		expect(res.input.data.report).toContain("P-11 row 3 receipt check (informational");
		expect(res.input.data.report).toContain("no such run recorded");
		expect(await f.emit("session_stop", { last_assistant_message: { content: "**QUESTION**\na?\n**QUESTION**\nb?" } }, ctx)).toBeUndefined();
	});

	test("an orchestrator: `ask` kept, turn shape refused at session_stop, receipts flagged into the session", async () => {
		const f = fakePi();
		p11Gates(f.pi, { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_CONTRACT: "/nonexistent", HOME: "/nonexistent-home" });
		const ctx = ctxOf({ hasUI: true });
		await f.emit("session_start", { type: "session_start" }, ctx);
		await f.emit("before_agent_start", { prompt: "hi", systemPrompt: [] }, ctx);
		expect(f.active()).toContain("ask");
		const stop = (await f.emit("session_stop", { last_assistant_message: { content: [{ type: "text", text: "**QUESTION**\na?\n\n**QUESTION**\nb?\n**CITE**\nhttps://nowhere.example" }] } }, ctx)) as { decision: string; reason: string };
		expect(stop.decision).toBe("block");
		expect(stop.reason).toContain("P-11 row 1");
		expect(f.entries.find((e) => e.type === "p11-receipts")).toBeTruthy();
		expect(await f.emit("session_stop", { last_assistant_message: { content: "**PMDW**\nAll quiet." } }, ctx)).toBeUndefined();
	});

	test("a lane bound to an autonomous workload: instruction recorded, `ask` removed, wake cycle enforced", async () => {
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "b", stakes: "normal", mode: "autonomous" });
		ledger.addSlice({ by: "orch", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		const f = fakePi();
		p11Gates(f.pi, { AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-1", AGENT_SYSTEM_CONTRACT: "/nonexistent", HOME: "/nonexistent-home" });
		const ctx = ctxOf({ hasUI: true });
		await f.emit("session_start", { type: "session_start" }, ctx);

		await f.emit("input", { text: "prefer the v3 schema", source: "interactive" }, ctx);
		expect(ledger.instructions(wl).map((r) => [r.author, r.channel, r.body])).toEqual([["jo", "direct", "prefer the v3 schema"]]);

		const start = (await f.emit("before_agent_start", { prompt: "go", systemPrompt: [] }, ctx)) as { message?: { content: string } };
		expect(f.active()).not.toContain("ask");
		// The workload has history (open + slice), so this fresh lane owes a wake read.
		expect(start.message?.content).toContain("wake-read");
		const read = { toolName: "read", input: { path: "x" } };
		expect(await f.emit("tool_call", read, ctx)).toBeUndefined();
		await f.emit("agent_end", { willContinue: false }, ctx);
		// Second turn: the real module has no entries API yet, so the gate fails closed.
		expect(((await f.emit("tool_call", read, ctx)) as { reason: string }).reason).toContain("P-11 row 7");

		const dispatch = { toolName: "task", input: { tasks: [{ agent: "builder", task: brief() }] } };
		expect(((await f.emit("tool_call", dispatch, ctx)) as { block: boolean }).block).toBe(true);
	});
});
