// The OMP adapter (gates/index.ts, registering every gates/extensions/ row) driven by a fake
// extension API: role detection, row 2 injection in hands, row 3 flagging a hand's yield without
// blocking it, row 1 at session_stop, row 11 on input (including a failed write), row 7's wake cycle
// with its recovery tool and its stop check, and `ask` removed for an autonomous lane.
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import reservedRow from "../extensions/r06-reserved";
import p11Gates, { type GatesAPI } from "../index";
import { CONTRACT_MARKER } from "../src/rows/r02-contract";
import { brief, tempLedger, tmp } from "./helpers";

type AnyHandler = (event: unknown, ctx: unknown) => unknown;
interface FakeTool {
	name: string;
	execute(id: string, params: Record<string, unknown>, signal: undefined, onUpdate: undefined, ctx: unknown): Promise<{ content: { text: string }[] }>;
}

/** A describe-able schema stub standing in for pi.zod; the tests call execute with plain params. */
const schema = (): unknown => ({ describe: () => schema(), optional: () => schema() });

/**
 * A fake OMP extension API whose emit follows the runner's chaining (runner.ts emitToolCall,
 * emitBeforeAgentStart, emit for session_stop, input): tool_call stops at the first block and
 * otherwise returns the last result; before_agent_start threads the system prompt and collects
 * messages; session_stop stops at the first block; input stops at the first `handled`.
 */
function fakePi(tools = ["read", "bash", "ask", "task", "yield"]) {
	const handlers = new Map<string, AnyHandler[]>();
	const entries: { type: string; data: unknown }[] = [];
	const registered = new Map<string, FakeTool>();
	let active = [...tools];
	const pi = {
		on: (name: string, h: AnyHandler) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		getActiveTools: () => [...active],
		getAllTools: () => tools.map((name) => ({ name })),
		setActiveTools: async (names: string[]) => {
			active = names;
		},
		appendEntry: (type: string, data?: unknown) => entries.push({ type, data }),
		registerTool: (t: FakeTool) => registered.set(t.name, t),
		zod: { object: schema, string: schema },
	};
	const emit = async (name: string, event: Record<string, unknown>, ctx: unknown): Promise<unknown> => {
		const hs = handlers.get(name) ?? [];
		if (name === "before_agent_start") {
			let systemPrompt = event.systemPrompt as string[];
			const messages: unknown[] = [];
			for (const h of hs) {
				const r = (await h({ ...event, systemPrompt }, ctx)) as { systemPrompt?: string[]; message?: unknown } | undefined;
				if (r?.message) messages.push(r.message);
				if (r?.systemPrompt) systemPrompt = r.systemPrompt;
			}
			return { systemPrompt, messages };
		}
		let last: unknown;
		for (const h of hs) {
			const r = (await h(event, ctx)) as { block?: boolean; decision?: string; handled?: boolean } | undefined;
			if (!r) continue;
			last = r;
			if (r.block || r.decision === "block" || r.handled) return r;
		}
		return last;
	};
	const tool = (name: string): FakeTool => {
		const t = registered.get(name);
		if (!t) throw new Error(`tool ${name} not registered`);
		return t;
	};
	return { pi: pi as unknown as GatesAPI, emit, entries, active: () => active, tool };
}

const notices: string[] = [];
/** A session context; its sessionManager is the key the rows share state on, one per session. */
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

	/** A lane bound to a fresh autonomous workload with history, started through the adapter. */
	async function boundLane() {
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "b", stakes: "normal", mode: "autonomous" });
		ledger.addSlice({ by: "orch", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		const f = fakePi();
		p11Gates(f.pi, { AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-1", AGENT_SYSTEM_CONTRACT: "/nonexistent", HOME: "/nonexistent-home" });
		const ctx = ctxOf({ hasUI: true });
		await f.emit("session_start", { type: "session_start" }, ctx);
		return { ledger, path, wl, f, ctx };
	}
	const read = { toolName: "read", input: { path: "x" } };

	test("a lane bound to an autonomous workload: instruction recorded, `ask` removed, wake cycle discharged by the recovery tool", async () => {
		const { ledger, wl, f, ctx } = await boundLane();
		expect(await f.emit("input", { text: "prefer the v3 schema", source: "interactive" }, ctx)).toBeUndefined();
		expect(ledger.instructions(wl).map((r) => [r.author, r.channel, r.body])).toEqual([["jo", "direct", "prefer the v3 schema"]]);

		const start = (await f.emit("before_agent_start", { prompt: "go", systemPrompt: [] }, ctx)) as { messages: { content: string }[] };
		expect(f.active()).not.toContain("ask");
		// The workload has history (open + slice), so this fresh lane owes a wake read.
		expect(start.messages.map((m) => m.content).join("\n")).toContain("ledger_wake_read");
		expect(await f.emit("tool_call", read, ctx)).toBeUndefined();
		await f.emit("agent_end", { willContinue: false }, ctx);
		await Bun.sleep(5); // the entry must postdate the trigger's timestamp

		// Second turn: refused until this lane's entry exists, except the recovery tool itself.
		expect(((await f.emit("tool_call", read, ctx)) as { reason: string }).reason).toContain("P-11 row 7");
		expect(await f.emit("tool_call", { toolName: "ledger_wake_read", input: { body: "resuming slice t" } }, ctx)).toBeUndefined();
		const out = await f.tool("ledger_wake_read").execute("c1", { body: "resuming slice t from the ledger" }, undefined, undefined, ctx);
		expect(out.content[0]!.text).toContain("as lane-1");
		expect(ledger.entries(wl, "wake-read")).toMatchObject([{ created_by: "lane-1", body: "resuming slice t from the ledger" }]);
		expect(await f.emit("tool_call", read, ctx)).toBeUndefined();
		expect(await f.emit("session_stop", { last_assistant_message: { content: "**PMDW**\nResumed." } }, ctx)).toBeUndefined();

		const dispatch = { toolName: "task", input: { tasks: [{ agent: "builder", task: brief() }] } };
		expect(((await f.emit("tool_call", dispatch, ctx)) as { block: boolean }).block).toBe(true);
	});

	test("row 7: a second turn with no tool calls is refused at its stop (astra review B3)", async () => {
		const { f, ctx } = await boundLane();
		await f.emit("before_agent_start", { prompt: "go", systemPrompt: [] }, ctx);
		await f.emit("agent_end", { willContinue: false }, ctx);
		await f.emit("before_agent_start", { prompt: "again", systemPrompt: [] }, ctx);
		const stop = (await f.emit("session_stop", { last_assistant_message: { content: "**PMDW**\nDone, no tools." } }, ctx)) as { decision: string; reason: string };
		expect(stop.decision).toBe("block");
		expect(stop.reason).toContain("P-11 row 7");
	});

	test("row 11: a failed instruction write consumes the input so no turn runs, and says so (astra review B6)", async () => {
		// The ledger refuses the insert: the lane is bound to a workload id the ledger has no open row for.
		const { ledger, path } = tempLedger();
		const f = fakePi();
		p11Gates(f.pi, { AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: "wl-missing1", AGENT_SYSTEM_LANE_ID: "lane-1", AGENT_SYSTEM_CONTRACT: "/nonexistent", HOME: "/nonexistent-home" });
		const ctx = ctxOf({ hasUI: true });
		await f.emit("session_start", { type: "session_start" }, ctx);
		notices.length = 0;
		expect(await f.emit("input", { text: "use v3", source: "interactive" }, ctx)).toEqual({ handled: true });
		expect(notices.join("\n")).toContain("NOT recorded");
		expect(notices.join("\n")).toContain("no turn was started");
		// Slash commands are not instructions, but the held one is retried first and still fails.
		expect(await f.emit("input", { text: "/compact", source: "interactive" }, ctx)).toEqual({ handled: true });
		expect(ledger.instructions("wl-missing1")).toHaveLength(0);
	});

	test("one row file loads on its own and enforces only its row (astra review S4)", async () => {
		const f = fakePi();
		reservedRow(f.pi, { HOME: "/nonexistent-home" });
		const ctx = ctxOf({ hasUI: true });
		expect(((await f.emit("tool_call", { toolName: "bash", input: { command: "rm '-rf' /tmp/review-not-executed" } }, ctx)) as { reason: string }).reason).toContain("§ A4");
		expect(await f.emit("tool_call", { toolName: "ask", input: {} }, ctx)).toBeUndefined(); // row 14 not loaded
		expect(() => f.tool("ledger_wake_read")).toThrow("not registered"); // row 7 not loaded
	});
});
