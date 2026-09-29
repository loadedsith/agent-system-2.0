/**
 * (e) The extension end to end against a fake OMP host: a lane `task` call is rewritten to the
 * classified tier, the spawn gets the tier's usable model row, and once the hand's result settles
 * the routing lands on the slice's row in a real schema-v4 ledger (ledger/src/index.ts `routings`)
 * plus the spawn note. The review and fix-round regressions are in review-round{1,2}.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { createClassifierExtension } from "../extension";
import { loadCalibration } from "../src/classify";
import { tierTableFromConfig } from "../src/tier-table";
import { dist, fakeRegistry, recordedJudge, recordedQuestion, scratchLedger } from "./helpers";

const TABLE = tierTableFromConfig({
	task: {
		agentModelOverrides: {
			fast: ["anthropic/claude-haiku-4-5", "openai-codex/gpt-5.6-luna"],
			standard: ["anthropic/claude-sonnet-5-5", "kimi-code/kimi-k2.5"],
			strong: ["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "kimi-code/kimi-for-coding"],
			deep: ["anthropic/claude-fable-5-1", "openai-codex/gpt-6-astra"],
		},
	},
});

const REVIEW_BRIEF = "workload: wl-abc123\ntask: review the ledger design and rule on it\nstakes: normal";
const FIND_BRIEF = "workload: wl-abc123\ntask: find where the loader registers hooks";
const judge = recordedJudge([
	{ text: REVIEW_BRIEF, response: { choice: "understand", confidence: 0.42, probabilities: dist({ understand: 0.54, judge: 0.46 }) } },
	{ text: FIND_BRIEF, response: { choice: "locate", confidence: 0.93, probabilities: dist({ locate: 0.94, understand: 0.06 }) } },
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
	const { ledger, workloadId } = scratchLedger(["sl-review", "sl-find"]);
	createClassifierExtension({
		judge: async () => judge,
		tierTable: () => TABLE,
		disabledProviders: async () => [],
		question: recordedQuestion(),
		calibration: loadCalibration(),
		ledger: () => ledger,
		laneId: "lane-test",
		...overrides,
	})({ on: (event: string, handler: Handler) => (handlers[event] = handler) } as never);
	const ctx = { cwd: "/tmp", modelRegistry: fakeRegistry(Object.values(TABLE).flat()) };
	return {
		routings: () => ledger.routings(workloadId),
		toolCall: async (input: unknown, toolCallId = "call-1") =>
			(await handlers.tool_call!({ type: "tool_call", toolName: "task", toolCallId, input }, ctx)) as ToolCallResult,
		spawn: async (agent: string, spawnKey?: string, invocationKind = "task") =>
			(await handlers.before_subagent_spawn!(
				{ type: "before_subagent_spawn", agent, invocationKind, patterns: [], spawnKey },
				ctx,
			)) as SpawnResult | undefined,
		/** A blocking task call returns one tier hand's result, reporting the model it ran on. */
		settle: (toolCallId: string, id: string, agent: string, resolvedModelIdentity: string) =>
			handlers.tool_result!(
				{ type: "tool_result", toolName: "task", toolCallId, isError: false, input: {}, content: [], details: { results: [{ id, agent, resolvedModelIdentity }] } },
				ctx,
			),
	};
}

describe("classifier extension on a lane task call", () => {
	test("rewrites each tier item to its computed tier and leaves non-tier names for M4", async () => {
		const h = host();
		const result = await h.toolCall({
			context: "shared",
			tasks: [
				{ agent: "fast", name: "sl-review", task: REVIEW_BRIEF },
				{ agent: "deep", name: "sl-find", task: FIND_BRIEF },
				{ agent: "reviewer", task: "anything" },
			],
		});
		expect(result.input.tasks.map(t => t.agent)).toEqual(["strong", "fast", "reviewer"]);
		expect(result.input.context).toBe("shared");
		expect(result.input.tasks[0]!.name).toBe("sl-review");
		// The bundled/role name was never classified.
		expect(judge.calls.filter(c => c === "anything")).toHaveLength(0);
	});

	test("the spawn gets the tier's row in provider order and the routing lands on the slice's ledger row", async () => {
		const h = host();
		await h.toolCall({ tasks: [{ agent: "fast", name: "sl-review", task: REVIEW_BRIEF }], context: "shared" }, "call-7");
		const spawn = await h.spawn("strong", "sl-review");

		expect(spawn?.model).toEqual(["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "kimi-code/kimi-for-coding"]);
		expect(spawn?.note).toBe(
			"understand 0.42 → standard; pulled up to deep (below 0.55; top two understand/judge); capped to strong (stakes normal); anthropic/claude-opus-5-5 (+2 same-tier fallback)",
		);
		expect(h.routings()).toHaveLength(0); // written at the verdict, not at the spawn
		expect(h.settle("call-7", "sl-review", "strong", "anthropic/claude-opus-5-5")).toBeUndefined();
		const rows = h.routings();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			workload_id: "wl-abc123",
			slice_id: "sl-review",
			spawn_key: "sl-review",
			kind: "understand",
			confidence: 0.42,
			classified_tier: "standard",
			pull_up_to: "deep",
			stakes: "normal",
			pull_down_to: "strong",
			tier: "strong",
			model: "anthropic/claude-opus-5-5",
			outcome: "ran",
			ran_models: '["anthropic/claude-opus-5-5"]',
			judge_model: "typesafe/jev-1.13.0",
			created_by: "lane-test",
		});
	});

	test("the flat call form is rewritten and routed too", async () => {
		const h = host();
		const result = await h.toolCall({ agent: "standard", name: "sl-find", task: FIND_BRIEF }, "call-9");
		expect(result.input).toEqual({ agent: "fast", name: "sl-find", task: FIND_BRIEF });
		await h.spawn("fast", "sl-find");
		h.settle("call-9", "sl-find", "fast", "anthropic/claude-haiku-4-5");
		expect(h.routings()).toMatchObject([{ slice_id: "sl-find", tier: "fast", model: "anthropic/claude-haiku-4-5", outcome: "ran" }]);
	});

	test("an eval agent() spawn routes on its tier row and writes no routing row", async () => {
		const h = host();
		const spawn = await h.spawn("deep", undefined, "eval");
		expect(spawn?.model).toEqual(["anthropic/claude-fable-5-1", "openai-codex/gpt-6-astra"]);
		expect(spawn?.note).toContain("tier deep (unclassified)");
		expect(h.routings()).toHaveLength(0);
	});

	test("a non-tier spawn and a non-tier task call are none of the classifier's business", async () => {
		const h = host();
		expect(await h.spawn("reviewer")).toBeUndefined();
		expect(await h.toolCall({ tasks: [{ agent: "task", task: "x" }] })).toBeUndefined();
		expect(h.routings()).toHaveLength(0);
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
		const result = await h.toolCall({ tasks: [{ agent: "fast", name: "sl-find", task: FIND_BRIEF }], context: "shared" });
		expect(result).toEqual({ block: true, reason: "agent-system-2 classifier could not route this dispatch: typesafe 503" });
	});

	test("an invalid profile table refuses the spawn", async () => {
		const h = host({
			tierTable: () => tierTableFromConfig({ task: { agentModelOverrides: { fast: ["anthropic/claude-haiku-4-5"] } } }),
		});
		const spawn = await h.spawn("standard", undefined, "eval");
		expect(spawn?.block).toBe(true);
		expect(spawn?.reason).toContain("task.agentModelOverrides.standard: missing or empty");
		expect(h.routings()).toHaveLength(0);
	});
});
