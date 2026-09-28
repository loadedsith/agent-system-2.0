/**
 * Regressions for the M3 astra review, round 1
 * (/Users/jowolff/agent-scratch/agent-system-2.0/migration/M3/review-astra/REVIEW.md). Each
 * describe block is one finding; each test is that finding's probe, reproduced offline against a
 * fake OMP host, a fake model registry, and a real schema-v3 ledger in a scratch directory.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClassifierExtension } from "../extension";
import { classify, loadCalibration, loadKindQuestion } from "../src/classify";
import { KINDS, route, STAKES, TIERS, type Kind, type Tier } from "../src/route";
import { tierTableFromConfig } from "../src/tier-table";
import { dist, type FakeRegistry, fakeRegistry, loadSample, recordedJudge, recordedQuestion, scratchLedger } from "./helpers";

const REPO = join(import.meta.dir, "..", "..");
const FAST = ["anthropic/claude-haiku-4-5", "openai-codex/gpt-5.6-luna"];
const TABLE = tierTableFromConfig({
	task: {
		agentModelOverrides: {
			fast: FAST,
			standard: ["anthropic/claude-opus-5"],
			strong: ["anthropic/claude-opus-5-5"],
			deep: ["anthropic/claude-fable-5-1", "openai-codex/gpt-6-astra"],
		},
	},
});
const ALL_MODELS = [...new Set(Object.values(TABLE).flat())];
const OK = { choice: "locate", confidence: 0.9, probabilities: dist({ locate: 0.9 }) };
const LOCATE_JUDGE = { judge: async () => ({ answers: { kind: OK }, provider: "typesafe", model: "jev-1.13.0" }) };
const brief = (workloadId: string, text: string) => `workload: ${workloadId}\ntask: ${text}\nstakes: normal`;

type Judge = { judge(req: { state: string }): Promise<unknown> };
type Handler = (event: unknown, ctx?: unknown) => unknown;

function host(opts: { judge: Judge; registry?: FakeRegistry; slices?: string[]; table?: typeof TABLE }) {
	const handlers: Record<string, Handler> = {};
	const { ledger, workloadId } = scratchLedger(opts.slices);
	createClassifierExtension({
		judge: async () => opts.judge as never,
		tierTable: () => opts.table ?? TABLE,
		question: recordedQuestion(),
		calibration: loadCalibration(),
		ledger: () => ledger,
		laneId: "lane-test",
	})({ on: (name: string, h: Handler) => (handlers[name] = h) } as never);
	const ctx = { cwd: "/tmp", modelRegistry: opts.registry ?? fakeRegistry(ALL_MODELS) };
	return {
		ledger,
		workloadId,
		toolCall: (input: unknown, toolCallId = "call-1") =>
			handlers.tool_call!({ type: "tool_call", toolName: "task", toolCallId, input }, ctx) as Promise<any>,
		toolResult: (toolCallId: string, isError: boolean) =>
			handlers.tool_result!({ type: "tool_result", toolName: "task", toolCallId, isError, input: {}, content: [] }, ctx),
		spawn: (agent: string, spawnKey?: string, invocationKind = "task") =>
			handlers.before_subagent_spawn!(
				{ type: "before_subagent_spawn", agent, invocationKind, patterns: [], spawnKey },
				ctx,
			) as Promise<{ model?: string[]; note?: string; block?: boolean; reason?: string } | undefined>,
		routings: () => ledger.routings(workloadId),
	};
}

const tick = async (n = 5) => {
	for (let i = 0; i < n; i++) await Promise.resolve();
};

describe("B1: the returned row is the final-selection allowlist", () => {
	const RESOLVER = "/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/config/model-resolver.ts";

	test.skipIf(!existsSync(RESOLVER))(
		"an uncredentialed first candidate is dropped, so OMP's own resolver picks the credentialed same-tier one, not the parent",
		async () => {
			// Appendix A probe: Haiku listed but uncredentialed, Luna and Astra credentialed, parent is deep's Astra.
			const registry = fakeRegistry([...FAST, "openai-codex/gpt-6-astra"], ["openai-codex/gpt-5.6-luna", "openai-codex/gpt-6-astra"]);
			const h = host({ judge: recordedJudge([]), registry });
			const spawn = await h.spawn("fast", undefined, "eval");
			expect(spawn?.model).toEqual(["openai-codex/gpt-5.6-luna"]);

			// Dynamic: the resolver lives in this machine's global OMP install, absent on a fresh clone.
			const { resolveModelOverrideWithAuthFallback } = await import(RESOLVER);
			const out = await resolveModelOverrideWithAuthFallback(spawn!.model, "openai-codex/gpt-6-astra", registry);
			expect(out.model.id).toBe("gpt-5.6-luna");
			expect(out.authFallbackUsed).toBe(false);
		},
	);

	test("no usable row candidate refuses the spawn instead of letting OMP fall back to the parent", async () => {
		const h = host({ judge: recordedJudge([]), registry: fakeRegistry(ALL_MODELS, ["openai-codex/gpt-6-astra"]) });
		const spawn = await h.spawn("fast", undefined, "eval");
		expect(spawn?.block).toBe(true);
		expect(spawn?.reason).toContain("no usable fast model");
		expect(spawn?.reason).toContain("anthropic/claude-haiku-4-5 (no credentials)");
		expect(spawn?.reason).toContain("openai-codex/gpt-5.6-luna (no credentials)");
	});

	test("a one-model row with an out-of-tier retry.fallbackChains.default is refused (Appendix B)", () => {
		const config = {
			task: { agentModelOverrides: { fast: "p/fast", standard: "p/standard", strong: "p/strong", deep: "p/deep" } },
			retry: { fallbackChains: { default: ["p/deep"] } },
		};
		expect(() => tierTableFromConfig(config)).toThrow("retry.fallbackChains.default");
	});
});

describe("B2: a spawn's routing is found by its spawn key and tier, never by arrival order", () => {
	test("out-of-order judges and parent-prefixed spawn keys keep each record on its own slice (Appendix C)", async () => {
		let release!: () => void;
		const held = new Promise<void>(r => (release = r));
		const judge = {
			async judge({ state }: { state: string }) {
				if (state.includes("workload one")) await held;
				return { answers: { kind: OK }, provider: "typesafe", model: "jev-1.13.0" };
			},
		};
		const h = host({ judge });
		const input = {
			context: "shared",
			tasks: [
				{ agent: "fast", name: "sl-one", task: brief(h.workloadId, "workload one") },
				{ agent: "fast", name: "sl-two", task: brief(h.workloadId, "workload two") },
			],
		};
		const routed = h.toolCall(input, "batch");
		await tick();
		release();
		await routed;
		await h.spawn("fast", "Lane.sl-one");
		await h.spawn("fast", "Lane.sl-two");
		expect(h.routings().map(r => [r.slice_id, r.spawn_key])).toEqual([
			["sl-one", "Lane.sl-one"],
			["sl-two", "Lane.sl-two"],
		]);
	});

	test("a failed batch publishes nothing, a late answer cannot leak, and an unmatched task spawn is refused", async () => {
		let releaseLate!: () => void;
		const late = new Promise<void>(r => (releaseLate = r));
		const judge = {
			async judge({ state }: { state: string }) {
				if (state.includes("fail")) throw new Error("unavailable");
				await late;
				return { answers: { kind: OK }, provider: "typesafe", model: "jev-1.13.0" };
			},
		};
		const h = host({ judge });
		const blocked = await h.toolCall(
			{
				context: "shared",
				tasks: [
					{ agent: "fast", name: "sl-one", task: brief(h.workloadId, "fail") },
					{ agent: "fast", name: "sl-two", task: brief(h.workloadId, "late") },
				],
			},
			"failed",
		);
		expect(blocked).toEqual({ block: true, reason: "agent-system-2 classifier could not route this dispatch: unavailable" });
		h.toolResult("failed", true);
		releaseLate();
		await tick();
		for (const key of ["Unrelated", "sl-two"]) {
			const spawn = await h.spawn("fast", key);
			expect(spawn?.block).toBe(true);
			expect(spawn?.reason).toContain("no classification");
		}
		expect(h.routings()).toHaveLength(0);
	});

	test("a collision-suffixed spawn key matches its item; a deferred spawn after the call returned still matches", async () => {
		const h = host({ judge: LOCATE_JUDGE });
		await h.toolCall({ agent: "standard", name: "sl-one", task: brief(h.workloadId, "find it") }, "c1");
		h.toolResult("c1", false); // async task: the call returns before its job spawns
		const spawn = await h.spawn("fast", "Lane.sl-one-2");
		expect(spawn?.block).toBeUndefined();
		expect(h.routings().map(r => [r.slice_id, r.spawn_key, r.tier])).toEqual([["sl-one", "Lane.sl-one-2", "fast"]]);
	});

	test("concurrent same-tier calls never cross-attribute; a spawn whose tier differs from its classification is refused", async () => {
		const h = host({ judge: LOCATE_JUDGE });
		await Promise.all([
			h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "a") }, "c1"),
			h.toolCall({ agent: "fast", name: "sl-two", task: brief(h.workloadId, "b") }, "c2"),
		]);
		const wrongTier = await h.spawn("deep", "sl-two");
		expect(wrongTier?.block).toBe(true);
		expect(wrongTier?.reason).toContain("classified fast");
		await h.spawn("fast", "sl-two");
		await h.spawn("fast", "sl-one");
		expect(h.routings().map(r => r.slice_id)).toEqual(["sl-two", "sl-one"]);
	});

	test("a tier item whose name is not a slice of its brief's workload is refused before any judge call", async () => {
		const judge = recordedJudge([]);
		const h = host({ judge });
		const result = await h.toolCall({
			context: "shared",
			tasks: [
				{ agent: "fast", task: brief(h.workloadId, "no name") },
				{ agent: "fast", name: "sl-missing", task: brief(h.workloadId, "unknown slice") },
				{ agent: "fast", name: "sl-one", task: "task: no workload line" },
			],
		});
		expect(result.block).toBe(true);
		expect(result.reason).toContain("task 1: no `name`");
		expect(result.reason).toContain("task 2: `sl-missing` is not a slice of workload");
		expect(result.reason).toContain("task 3: the brief has no `workload:` field");
		expect(judge.calls).toHaveLength(0);
	});
});

describe("B3: every kind that can land on a tier gets guidance in that tier's prompt", () => {
	/** Every (kind, confidence band, top-two partner, stakes) the router can produce, and where it lands. */
	function reachable(): Record<Tier, Set<Kind>> {
		const out = Object.fromEntries(TIERS.map(t => [t, new Set<Kind>()])) as Record<Tier, Set<Kind>>;
		for (const kind of KINDS)
			for (const partner of KINDS)
				for (const confidence of [0.4, 0.9])
					for (const stakes of [null, ...STAKES]) {
						const probabilities = partner === kind ? dist({ [kind]: 0.9 }) : dist({ [kind]: 0.5, [partner]: 0.45 });
						out[route({ choice: kind, confidence, probabilities }, stakes).tier].add(kind);
					}
		return out;
	}

	test("the review's two routes exist: a capped judge lands on fast, an uncertain change on deep", () => {
		expect(route({ choice: "judge", confidence: 0.9, probabilities: dist({ judge: 0.9 }) }, "throwaway").tier).toBe("fast");
		expect(
			route({ choice: "change-small", confidence: 0.45, probabilities: dist({ "change-small": 0.5, judge: 0.45 }) }, null).tier,
		).toBe("deep");
	});

	test.each([...TIERS])("%s.md carries kind guidance for every kind the router can send it", tier => {
		const text = readFileSync(join(REPO, "tiers", `${tier}.md`), "utf8");
		const section = /^## Kind guidance\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(text);
		expect(section).not.toBeNull();
		const guided = [...section![1]!.matchAll(/^- \*\*([a-z-]+)\*\*/gm)].map(m => m[1]);
		expect(guided.sort()).toEqual([...reachable()[tier]].sort());
	});
});

describe("S1: the replay replays what was measured; an uncalibrated question refuses dispatch", () => {
	test("the calibration record names the question the sample was recorded with", () => {
		expect(loadCalibration().questionSha256).toBe(loadSample().questionSha256);
	});

	test("a question whose hash is not the calibrated one blocks every tier dispatch", async () => {
		const { ledger, workloadId } = scratchLedger();
		const handlers: Record<string, Handler> = {};
		const judge = recordedJudge([]);
		createClassifierExtension({
			judge: async () => judge as never,
			tierTable: () => TABLE,
			question: loadKindQuestion(), // the S1-aligned question, not yet re-measured
			calibration: { ...loadCalibration(), questionSha256: "0".repeat(64) },
			ledger: () => ledger,
			laneId: "lane-test",
		})({ on: (name: string, h: Handler) => (handlers[name] = h) } as never);
		const result = (await handlers.tool_call!(
			{ type: "tool_call", toolName: "task", toolCallId: "c", input: { agent: "fast", name: "sl-one", task: brief(workloadId, "x") } },
			{},
		)) as { block: boolean; reason: string };
		expect(result.block).toBe(true);
		expect(result.reason).toContain("not the question the 0.55 threshold was measured with");
		expect(judge.calls).toHaveLength(0);
	});
});

describe("S2: a malformed judge answer is refused, never routed", () => {
	const question = recordedQuestion();
	const answer = (kind: object) => ({ judge: async () => ({ answers: { kind }, provider: "typesafe", model: "jev-1.13.0" }) });

	test.each([
		["missing probabilities (Appendix B)", { choice: "locate", confidence: 0.4 }, "probabilities"],
		["confidence above 1 (Appendix B)", { choice: "locate", confidence: 2, probabilities: dist({ locate: 0.9 }) }, "confidence"],
		["negative confidence", { choice: "locate", confidence: -0.1, probabilities: dist({ locate: 0.9 }) }, "confidence"],
		["NaN confidence", { choice: "locate", confidence: Number.NaN, probabilities: dist({ locate: 0.9 }) }, "confidence"],
		["infinite probability", { choice: "locate", confidence: 0.9, probabilities: { ...dist({ locate: 0.9 }), judge: Infinity } }, "probabilities"],
		["a kind missing from the distribution", { choice: "locate", confidence: 0.9, probabilities: { locate: 0.9, understand: 0.1 } }, "probabilities"],
		["an unknown kind in the distribution", { choice: "locate", confidence: 0.9, probabilities: { ...dist({ locate: 0.9 }), build: 0 } }, "probabilities"],
		["an all-zero distribution", { choice: "locate", confidence: 0.4, probabilities: dist({ locate: 0, understand: 0, "change-small": 0, "change-large": 0, judge: 0 }) }, "probabilities"],
		["a distribution summing far from 1", { choice: "locate", confidence: 0.4, probabilities: dist({ locate: 0.9, judge: 0.9 }) }, "probabilities"],
	])("%s", async (_, kind, word) => {
		await expect(classify("x", answer(kind) as never, question)).rejects.toThrow(word);
	});
});

describe("S3: the ledger row carries the spawn-time selection, not the row's first preference", () => {
	test("with the first candidate unavailable, models and model name the candidate OMP will actually pick", async () => {
		const registry = fakeRegistry(["openai-codex/gpt-5.6-luna", ...ALL_MODELS.filter(m => !FAST.includes(m))]);
		const h = host({ judge: LOCATE_JUDGE, registry });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "find it") });
		const spawn = await h.spawn("fast", "sl-one");
		expect(spawn?.model).toEqual(["openai-codex/gpt-5.6-luna"]);
		expect(spawn?.note).toContain("skipped anthropic/claude-haiku-4-5 (not in the model registry)");
		const [row] = h.routings();
		expect(JSON.parse(row!.models)).toEqual(["openai-codex/gpt-5.6-luna"]);
		expect(row!.model).toBe("openai-codex/gpt-5.6-luna");
	});
});

describe("S4: only the pinned judge's answers route", () => {
	test("an answer from any other judge (the session-model fallback when TypeSafe is uncredentialed) refuses the dispatch", async () => {
		const h = host({ judge: { judge: async () => ({ answers: { kind: OK }, provider: "anthropic", model: "claude-opus-5" }) } });
		const result = await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "x") });
		expect(result.block).toBe(true);
		expect(result.reason).toContain("answered by anthropic/claude-opus-5, not the calibrated judge typesafe/jev-1.13.0");
	});

	test("the profile template pins modelRoles.judge to the calibrated judge", () => {
		const profile = Bun.YAML.parse(readFileSync(join(REPO, "profile", "config.yml"), "utf8")) as {
			modelRoles?: { judge?: string };
		};
		expect(profile.modelRoles?.judge).toBe(loadCalibration().judgeModel);
	});
});
