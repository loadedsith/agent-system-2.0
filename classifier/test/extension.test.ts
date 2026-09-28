/**
 * (e) The extension end to end against a fake OMP host: a lane `task` call is rewritten to the
 * classified tier, the spawn gets the tier's ordered model row, and the dispatch carries the
 * routing record M4 and M5 read (`agent-system-2.routing` session entry + spawn note).
 */
import { describe, expect, test } from "bun:test";
import { createClassifierExtension, ROUTING_ENTRY, type RoutingRecord } from "../extension";
import { loadKindQuestion } from "../src/classify";
import { tierTableFromConfig } from "../src/tier-table";
import { recordedJudge } from "./helpers";

const TABLE = tierTableFromConfig({
	task: {
		agentModelOverrides: {
			fast: ["anthropic/claude-haiku-4-5", "openai-codex/gpt-5.6-luna"],
			standard: ["anthropic/claude-opus-5", "kimi-code/kimi-k2.5"],
			strong: ["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "kimi-code/kimi-for-coding"],
			deep: ["anthropic/claude-fable-5-1", "openai-codex/gpt-6-astra"],
		},
	},
});

const REVIEW_BRIEF = "workload: wl-abc123\ntask: review the ledger design and rule on it\nstakes: normal";
const FIND_BRIEF = "workload: wl-abc123\ntask: find where the loader registers hooks";
const judge = recordedJudge([
	{ text: REVIEW_BRIEF, response: { choice: "understand", confidence: 0.42, probabilities: { understand: 0.54, judge: 0.46 } } },
	{ text: FIND_BRIEF, response: { choice: "locate", confidence: 0.93, probabilities: { locate: 0.94, understand: 0.06 } } },
]);

type Handler = (event: unknown, ctx?: unknown) => unknown;
/** What the tests read off a `tool_call` result: the revised task input, or a refusal. */
interface ToolCallResult {
	input: { tasks: { agent: string; name?: string }[]; context?: string } & Record<string, unknown>;
	block?: boolean;
	reason?: string;
}
/** What the tests read off a `before_subagent_spawn` result. */
interface SpawnResult {
	model?: string[];
	note?: string;
	block?: boolean;
	reason?: string;
}
function host(overrides: Partial<Parameters<typeof createClassifierExtension>[0]> = {}) {
	const handlers: Record<string, Handler> = {};
	const entries: { type: string; data: RoutingRecord }[] = [];
	const pi = {
		on(event: string, handler: Handler) {
			handlers[event] = handler;
		},
		appendEntry(type: string, data: RoutingRecord) {
			entries.push({ type, data });
		},
	};
	createClassifierExtension({
		judge: async () => judge,
		tierTable: () => TABLE,
		question: loadKindQuestion(),
		now: () => "2026-09-28T20:00:00.000Z",
		...overrides,
	})(pi as never);
	const ctx = { cwd: "/tmp" };
	return {
		entries,
		toolCall: async (input: unknown, toolCallId = "call-1") =>
			(await handlers.tool_call!({ type: "tool_call", toolName: "task", toolCallId, input }, ctx)) as ToolCallResult,
		spawn: (agent: string, spawnKey?: string, invocationKind = "task") =>
			handlers.before_subagent_spawn!({ type: "before_subagent_spawn", agent, invocationKind, patterns: [], spawnKey }) as SpawnResult,
		toolResult: (toolCallId: string) => handlers.tool_result!({ type: "tool_result", toolName: "task", toolCallId }),
	};
}

describe("classifier extension on a lane task call", () => {
	test("rewrites each tier item to its computed tier and leaves non-tier names for M4", async () => {
		const h = host();
		const result = await h.toolCall({
			context: "shared",
			tasks: [
				{ agent: "fast", name: "Review", task: REVIEW_BRIEF },
				{ agent: "deep", task: FIND_BRIEF },
				{ agent: "reviewer", task: "anything" },
			],
		});
		expect(result.input.tasks.map((t: { agent: string }) => t.agent)).toEqual(["strong", "fast", "reviewer"]);
		expect(result.input.context).toBe("shared");
		expect(result.input.tasks[0].name).toBe("Review");
		// The bundled/role name was never classified.
		expect(judge.calls.filter(c => c === "anything")).toHaveLength(0);
	});

	test("the spawn gets the tier's row in provider order and the dispatch carries the full record", async () => {
		const h = host();
		await h.toolCall({ tasks: [{ agent: "fast", task: REVIEW_BRIEF }] }, "call-7");
		const spawn = h.spawn("strong", "call-7:0");

		expect(spawn.model).toEqual(["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "kimi-code/kimi-for-coding"]);
		expect(spawn.note).toBe(
			"understand 0.42 → standard; pulled up to deep (below 0.55; top two understand/judge); capped to strong (stakes normal); anthropic/claude-opus-5-5 (+2 same-tier fallback)",
		);
		expect(h.entries).toHaveLength(1);
		expect(h.entries[0]!.type).toBe(ROUTING_ENTRY);
		expect(h.entries[0]!.data).toMatchObject({
			v: 1,
			at: "2026-09-28T20:00:00.000Z",
			toolCallId: "call-7",
			index: 0,
			workloadId: "wl-abc123",
			requestedAgent: "fast",
			tier: "strong",
			model: "anthropic/claude-opus-5-5",
			match: "spawn-key",
			routing: {
				kind: "understand",
				confidence: 0.42,
				lowConfidence: true,
				classifiedTier: "standard",
				pullUp: { from: "standard", to: "deep" },
				stakes: "normal",
				cap: "strong",
				pullDown: { from: "deep", to: "strong" },
				tier: "strong",
				judgeModel: "typesafe/jev-1.13.0",
			},
		});
	});

	test("a named spawn matches by its handle; the flat call form is rewritten too", async () => {
		const h = host();
		const result = await h.toolCall({ agent: "standard", name: "Finder", task: FIND_BRIEF }, "call-9");
		expect(result.input).toEqual({ agent: "fast", name: "Finder", task: FIND_BRIEF });
		h.spawn("fast", "Finder");
		expect(h.entries[0]!.data).toMatchObject({ name: "Finder", match: "name", tier: "fast", model: "anthropic/claude-haiku-4-5" });
	});

	test("a spawn the classifier never saw still routes on its tier row, recorded as unclassified", () => {
		const h = host();
		const spawn = h.spawn("deep", undefined, "eval");
		expect(spawn.model).toEqual(["anthropic/claude-fable-5-1", "openai-codex/gpt-6-astra"]);
		expect(h.entries[0]!.data).toMatchObject({ routing: null, match: "none", tier: "deep" });
	});

	test("a non-tier spawn and a non-task tool are none of the classifier's business", async () => {
		const h = host();
		expect(h.spawn("reviewer")).toBeUndefined();
		expect(await h.toolCall({ tasks: [{ agent: "task", task: "x" }] })).toBeUndefined();
		expect(h.entries).toHaveLength(0);
	});

	test("a classification whose spawn never happened is dropped at the tool result", async () => {
		const h = host();
		await h.toolCall({ tasks: [{ agent: "fast", task: FIND_BRIEF }] }, "call-2");
		h.toolResult("call-2");
		h.spawn("fast", "call-2:0");
		expect(h.entries[0]!.data.routing).toBeNull();
	});
});

describe("fail closed", () => {
	test("a judge failure refuses the dispatch instead of routing on a guess", async () => {
		const h = host({
			judge: async () => ({
				judge: async () => {
					throw new Error("typesafe 503");
				},
			}),
		});
		const result = await h.toolCall({ tasks: [{ agent: "fast", task: FIND_BRIEF }] });
		expect(result).toEqual({ block: true, reason: "agent-system-2 classifier could not route this dispatch: typesafe 503" });
	});

	test("an invalid profile table refuses the spawn", () => {
		const h = host({
			tierTable: () => tierTableFromConfig({ task: { agentModelOverrides: { fast: ["anthropic/claude-haiku-4-5"] } } }),
		});
		const spawn = h.spawn("standard", "call-1:0");
		expect(spawn.block).toBe(true);
		expect(spawn.reason).toContain("task.agentModelOverrides.standard: missing or empty");
		expect(h.entries).toHaveLength(0);
	});
});
