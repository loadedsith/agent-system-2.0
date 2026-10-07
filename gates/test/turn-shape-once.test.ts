// Row 1 on the orchestrator under "withhold" (MIGRATION.md item 37): a reply row 1
// refuses is replaced by a one-line marker at `assistant_message`, and the `session_stop` that
// follows blocks from the stored refusal, carrying the original, so Jo sees the marker and the
// corrected reply once each. Lanes, tool-call messages and well-formed replies are left alone.
import { describe, expect, test } from "bun:test";
import turnShapeRow from "../extensions/r01-turn-shape";
import type { GatesAPI } from "../src/session";
import { tmp } from "./helpers";

type AnyHandler = (event: unknown, ctx: unknown) => unknown;
type Block = { type: string; text?: string; [k: string]: unknown };

/**
 * A fake OMP extension API (the pattern of extension.test.ts), with `assistant_message` chained as
 * runner.ts emitAssistantMessage does: each handler sees the previous replacement, and the result is
 * the final content, or undefined when no handler replaced anything.
 */
function fakePi() {
	const handlers = new Map<string, AnyHandler[]>();
	const pi = {
		on: (name: string, h: AnyHandler) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		appendEntry: () => undefined,
	};
	const emit = async (name: string, event: Record<string, unknown>, ctx: unknown): Promise<unknown> => {
		let last: unknown;
		for (const h of handlers.get(name) ?? []) {
			const r = (await h(event, ctx)) as { decision?: string } | undefined;
			if (!r) continue;
			last = r;
			if (r.decision === "block") return r;
		}
		return last;
	};
	const emitAssistantMessage = async (message: { role: string; content: Block[] }, ctx: unknown): Promise<Block[] | undefined> => {
		let content = message.content;
		let replaced = false;
		for (const h of handlers.get("assistant_message") ?? []) {
			const r = (await h({ type: "assistant_message", message: structuredClone({ ...message, content }) }, ctx)) as { content?: Block[] } | undefined;
			if (r?.content === undefined) continue;
			expect(r.content.map((b) => b.type)).toEqual(content.map((b) => b.type));
			content = r.content;
			replaced = true;
		}
		return replaced ? content : undefined;
	};
	return { pi: pi as unknown as GatesAPI, emit, emitAssistantMessage };
}

const ctxOf = () => ({
	hasUI: true,
	cwd: tmp("turn-shape-once"),
	sessionManager: { getHeader: () => ({}), getEntries: () => [] },
	ui: { notify: () => undefined },
});

const MALFORMED = "**PMDW**\nDone. Do you want the PR now, or should I wait for the proof?\nZEBRA-7Q";
const WELL_FORMED = "**PMDW**\nAll quiet.";
const assistant = (...content: Block[]) => ({ role: "assistant", content });
const text = (t: string): Block => ({ type: "text", text: t });

describe("row 1 withholds a refused orchestrator reply", () => {
	test("R1: the malformed reply becomes the marker; session_stop blocks once with the original", async () => {
		const f = fakePi();
		turnShapeRow(f.pi, { AGENT_SYSTEM_ROLE: "orchestrator" });
		const ctx = ctxOf();
		const msg = assistant(text(MALFORMED), { type: "thinking", thinking: "t" }, text("second block"));
		const content = await f.emitAssistantMessage(msg, ctx);
		expect(content).toBeDefined();
		const texts = content!.filter((b) => b.type === "text" && b.text).map((b) => b.text);
		expect(texts).toHaveLength(1);
		expect(texts[0]).toStartWith("(Reply held by P-11 row 1: ");
		expect(texts[0]).toEndWith(". The corrected reply follows.)");
		expect(texts[0]).not.toContain("\n");
		expect(texts[0]).not.toContain("ZEBRA-7Q");
		expect(content![1]).toEqual({ type: "thinking", thinking: "t" });
		expect(content![2]).toEqual({ type: "text", text: "" });

		// OMP hands session_stop the rewritten message, the marker, which itself passes the shape check.
		const stop = (await f.emit("session_stop", { last_assistant_message: { role: "assistant", content } }, ctx)) as { decision: string; reason: string };
		expect(stop?.decision).toBe("block");
		expect(stop.reason).toStartWith("P-11 row 1 refused this turn to Jo: ");
		expect(stop.reason).toContain(`Your held reply was:\n\n${MALFORMED}`);

		// The correction turn's reply is checked afresh; the stored refusal is gone.
		expect(await f.emitAssistantMessage(assistant(text(WELL_FORMED)), ctx)).toBeUndefined();
		expect(await f.emit("session_stop", { last_assistant_message: assistant(text(WELL_FORMED)) }, ctx)).toBeUndefined();
		expect(await f.emit("session_stop", { last_assistant_message: assistant(text(WELL_FORMED)) }, ctx)).toBeUndefined();
	});
});

describe("row 1 guards (unchanged before and after withhold)", () => {
	test("R2: an orchestrator message carrying a toolCall block is never replaced", async () => {
		const f = fakePi();
		turnShapeRow(f.pi, { AGENT_SYSTEM_ROLE: "orchestrator" });
		const msg = assistant(text(MALFORMED), { type: "toolCall", id: "c1", name: "read", arguments: { path: "x" } });
		expect(await f.emitAssistantMessage(msg, ctxOf())).toBeUndefined();
	});

	test("R2: a lane reply is never replaced, and its session_stop still blocks", async () => {
		const f = fakePi();
		turnShapeRow(f.pi, {});
		const ctx = ctxOf();
		const msg = assistant(text(MALFORMED));
		expect(await f.emitAssistantMessage(msg, ctx)).toBeUndefined();
		const stop = (await f.emit("session_stop", { last_assistant_message: msg }, ctx)) as { decision: string; reason: string };
		expect(stop?.decision).toBe("block");
		expect(stop.reason).toContain("P-11 row 1");
		expect(stop.reason).not.toContain("Your held reply was");
	});

	test("R2: a well-formed orchestrator reply is returned unchanged", async () => {
		const f = fakePi();
		turnShapeRow(f.pi, { AGENT_SYSTEM_ROLE: "orchestrator" });
		const ctx = ctxOf();
		expect(await f.emitAssistantMessage(assistant(text(WELL_FORMED)), ctx)).toBeUndefined();
		expect(await f.emit("session_stop", { last_assistant_message: assistant(text(WELL_FORMED)) }, ctx)).toBeUndefined();
	});
});
