/**
 * Regressions for the M3 astra review, round 2
 * (/Users/jowolff/agent-scratch/agent-system-2.0/migration/M3/review-astra-2/REVIEW.md). Each
 * describe block is one finding; each test reproduces that finding's probe offline against a fake
 * OMP host, a fake model registry, a real schema-v4 ledger in a scratch directory, and — where the
 * probe drove OMP itself — the installed OMP modules, imported read-only.
 *
 * The R3 blocks at the end are M3 fix round 3
 * (/Users/jowolff/agent-scratch/agent-system-2.0/migration/M3/fix-3/BRIEF.md), which carries R2-B1's
 * row check to async hands and to every model that answered on a hand. They run on a lane session
 * and a hand session bound to one extension instance (helpers.ts extensionHost). They live in this
 * file, not a new one, because install/manifest.tsv lists every file under classifier/.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadCalibration } from "../src/classify";
import { loadTierTable, tierTableFromConfig } from "../src/tier-table";
import { asyncDelivery, dist, extensionHost, type FakeRegistry, fakeRegistry } from "./helpers";

const REPO = join(import.meta.dir, "..", "..");
// Imported dynamically: this machine's global OMP install is absent on a fresh clone, where these tests skip.
const OMP = "/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi";
const RESOLVER = `${OMP}/pi-coding-agent/src/config/model-resolver.ts`;
const HAS_OMP = existsSync(RESOLVER);

const FAST = ["anthropic/claude-haiku-4-5", "openai-codex/gpt-5.6-luna"];
const DEEP = ["anthropic/claude-fable-5-1", "openai-codex/gpt-6-astra"];
const TABLE = tierTableFromConfig({
	task: {
		agentModelOverrides: {
			fast: FAST,
			standard: ["anthropic/claude-sonnet-5-5"],
			strong: ["anthropic/claude-opus-5-5"],
			deep: DEEP,
		},
	},
});
const ALL_MODELS = [...new Set(Object.values(TABLE).flat())];
const PARENT = "openai-codex/gpt-6-astra"; // the lane runs on deep's row
const brief = (workloadId: string, text: string) => `workload: ${workloadId}\ntask: ${text}\nstakes: normal`;
/** A blocking task call's result: tier hand `id` on fast, reporting a fast-row model. */
const settled = (id: string) => ({ results: [{ id, agent: "fast", resolvedModelIdentity: "anthropic/claude-haiku-4-5" }] });
const locate = (confidence: number) => ({ choice: "locate", confidence, probabilities: dist({ locate: confidence }) });
/** Answers locate at .9 for a brief mentioning "first", at .8 otherwise. */
const JUDGE = {
	judge: async ({ state }: { state: string }) => ({
		answers: { kind: locate(state.includes("first") ? 0.9 : 0.8) },
		provider: "typesafe",
		model: "jev-1.13.0",
	}),
};

describe("R2-B1: the tier row holds at OMP's final selection, not only at the hook's precheck", () => {
	/** What OMP's executor does with the hook's list: task/executor.ts runSubprocess → this resolver. */
	async function finalSelection(patterns: string[], registry: FakeRegistry, agentId: string, settings?: unknown) {
		const { resolveModelOverrideWithAuthFallback } = await import(RESOLVER);
		const out = await resolveModelOverrideWithAuthFallback(patterns, PARENT, registry, settings, agentId);
		return { actual: out.model ? `${out.model.provider}/${out.model.id}` : null, fallback: out.authFallbackUsed as boolean };
	}

	test.skipIf(!HAS_OMP)(
		"row models credentialed only outside the child's session are refused, so the parent fallback never runs (review AUTH probe)",
		async () => {
			// Review probe: fast credentialed in preflight, not for the child session; deep (the parent) credentialed.
			const registry = fakeRegistry(ALL_MODELS, DEEP, FAST);
			const h = extensionHost({ judge: JUDGE, table: TABLE, registry });
			await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") });
			// Async spawns carry the allocated agent id as spawn key, the id the executor resolves with.
			const spawn = await h.spawn("fast", "Lane.sl-one");
			if (spawn?.model) {
				const final = await finalSelection(spawn.model, registry, "Lane.sl-one");
				// Before the fix: {"returned":["anthropic/claude-haiku-4-5",…],"actual":"openai-codex/gpt-6-astra","fallback":true}.
				expect({ returned: spawn.model, ...final }).toEqual({ returned: spawn.model, actual: spawn.model[0]!, fallback: false });
			}
			expect(spawn?.block).toBe(true);
			expect(spawn?.reason).toContain("anthropic/claude-haiku-4-5 (no credentials for spawn Lane.sl-one)");
			// The refused spawn is its dispatch's one routings row: no usable model, nothing ran.
			expect(h.routings()).toMatchObject([{ slice_id: "sl-one", models: "[]", model: null, outcome: "refused-no-usable-model", ran_models: null }]);
		},
	);

	test.skipIf(!HAS_OMP)("a row model credentialed for the child's session is returned and is what OMP selects", async () => {
		const registry = fakeRegistry(ALL_MODELS, [...DEEP, "openai-codex/gpt-5.6-luna"], ["anthropic/claude-haiku-4-5"]);
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") });
		const spawn = await h.spawn("fast", "Lane.sl-one");
		expect(spawn?.model).toEqual(["openai-codex/gpt-5.6-luna"]);
		expect(await finalSelection(spawn!.model!, registry, "Lane.sl-one")).toEqual({
			actual: "openai-codex/gpt-5.6-luna",
			fallback: false,
		});
		h.handMessage("Lane.sl-one", "openai-codex", "gpt-5.6-luna");
		h.deliver(["Lane.sl-one"]);
		expect(h.routings()).toMatchObject([{ models: '["openai-codex/gpt-5.6-luna"]', outcome: "ran", ran_models: '["openai-codex/gpt-5.6-luna"]' }]);
	});

	test.skipIf(!HAS_OMP)("a row model on a disabled provider is skipped the way OMP's final selection skips it", async () => {
		const { Settings } = await import(`${OMP}/pi-coding-agent/src/config/settings.ts`);
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS), disabledProviders: ["anthropic"] });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") });
		const spawn = await h.spawn("fast", "sl-one");
		expect(spawn?.model).toEqual(["openai-codex/gpt-5.6-luna"]);
		expect(spawn?.note).toContain("anthropic/claude-haiku-4-5 (provider disabled)");
		const settings = Settings.isolated({ disabledProviders: ["anthropic"] });
		expect(await finalSelection(spawn!.model!, fakeRegistry(ALL_MODELS), "sl-one", settings)).toEqual({
			actual: "openai-codex/gpt-5.6-luna",
			fallback: false,
		});
	});

	test("every row provider disabled refuses the spawn instead of handing OMP an empty resolution", async () => {
		const h = extensionHost({
			judge: JUDGE,
			table: TABLE,
			registry: fakeRegistry(ALL_MODELS),
			disabledProviders: ["anthropic", "openai-codex"],
		});
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") });
		const spawn = await h.spawn("fast", "sl-one");
		expect(spawn?.block).toBe(true);
		expect(spawn?.reason).toContain("no usable fast model");
	});

	describe("the task result is checked against the row it was routed to", () => {
		const result = (id: string, agent: string, resolvedModelIdentity?: string) => ({
			id,
			agent,
			exitCode: 0,
			resolvedModelIdentity,
			resolvedModel: resolvedModelIdentity,
		});

		test("a tier hand that ran outside its row turns the task result into a refusal naming the drift", () => {
			const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
			const out = h.toolResult("c1", false, {
				results: [result("sl-one", "fast", "openai-codex/gpt-6-astra"), result("sl-two", "fast", "openai-codex/gpt-5.6-luna")],
			});
			expect(out?.isError).toBe(true);
			const text = out!.content!.map(c => c.text).join("\n");
			expect(text).toContain("sl-one ran on openai-codex/gpt-6-astra, outside the fast row");
			expect(text).not.toContain("sl-two ran on");
		});

		test("in-row results, routed suffixes, non-tier agents and unresolved spawns pass untouched", () => {
			const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
			const out = h.toolResult("c1", false, {
				results: [
					result("sl-one", "fast", "anthropic/claude-haiku-4-5"),
					result("sl-two", "deep", "openai-codex/gpt-6-astra@some-upstream"),
					result("Reviewer", "reviewer", "anthropic/claude-opus-5-5"),
					result("sl-three", "strong"),
				],
			});
			expect(out).toBeUndefined();
		});
	});
});

describe("R2-B2: one pending classification per slice; spawn keys cannot collide", () => {
	test("the same slice dispatched again before its spawn is refused; the first spawn keeps the first classification (review SAME_SLICE probe)", async () => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
		expect((await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") }, "c1")).block).toBeUndefined();
		const second = await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "second") }, "c2");
		expect(second.block).toBe(true);
		expect(second.reason).toContain("task 1: slice sl-one already has a classified dispatch waiting to spawn (call c1)");
		const spawn = await h.spawn("fast", "sl-one");
		expect(spawn?.block).toBeUndefined();
		h.toolResult("c1", false, settled("sl-one"));
		expect(h.routings().map(r => r.confidence)).toEqual([0.9]);
	});

	test("two calls for one slice classified at the same time: the first to publish keeps it, the other is refused", async () => {
		let releaseFirst!: () => void;
		const held = new Promise<void>(r => (releaseFirst = r));
		const judge = {
			judge: async (req: { state: string }) => {
				if (req.state.includes("first")) await held;
				return JUDGE.judge(req);
			},
		};
		const h = extensionHost({ judge, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
		const first = h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") }, "c1");
		const second = await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "second") }, "c2");
		expect(second.block).toBeUndefined();
		releaseFirst();
		const late = await first;
		expect(late.block).toBe(true);
		expect(late.reason).toContain("slice sl-one already has a classified dispatch waiting to spawn (call c2)");
		await h.spawn("fast", "sl-one");
		h.toolResult("c2", false, settled("sl-one"));
		expect(h.routings().map(r => r.confidence)).toEqual([0.8]);
	});

	test("once its spawn has consumed the classification, the slice can be dispatched again", async () => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") }, "c1");
		await h.spawn("fast", "sl-one");
		expect((await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "second") }, "c2")).block).toBeUndefined();
		await h.spawn("fast", "sl-one-2");
		h.toolResult("c1", false, settled("sl-one"));
		h.toolResult("c2", false, settled("sl-one-2"));
		expect(h.routings().map(r => [r.spawn_key, r.confidence])).toEqual([
			["sl-one", 0.9],
			["sl-one-2", 0.8],
		]);
	});

	test("a finished blocking call releases what it never spawned; a returned async call keeps it", async () => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS), slices: ["sl-one", "sl-two"] });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") }, "sync");
		h.toolResult("sync", false, { results: [] });
		expect((await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "second") }, "again")).block).toBeUndefined();

		await h.toolCall({ agent: "fast", name: "sl-two", task: brief(h.workloadId, "first") }, "async");
		h.toolResult("async", false, { results: [], async: { state: "running", jobId: "j", type: "task" } });
		expect((await h.toolCall({ agent: "fast", name: "sl-two", task: brief(h.workloadId, "second") }, "later")).block).toBe(true);
	});

	test.each([
		["a pending slice, then its -N name", ["sl-one"], ["sl-one-2"]],
		["a pending -N name, then its base", ["sl-one-2"], ["sl-one"]],
	])("suffix collision (%s) is refused at dispatch, before any spawn key could match both (review probe)", async (_, first, second) => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS), slices: ["sl-one", "sl-one-2"] });
		expect((await h.toolCall({ agent: "fast", name: first[0], task: brief(h.workloadId, "first") }, "c1")).block).toBeUndefined();
		const out = await h.toolCall({ agent: "fast", name: second[0], task: brief(h.workloadId, "second") }, "c2");
		expect(out.block).toBe(true);
		expect(out.reason).toContain(`slice ${second[0]} could share a spawn key with pending slice ${first[0]}`);
		// The first dispatch still spawns and records under its own slice.
		await h.spawn("fast", first[0]);
		h.toolResult("c1", false, settled(first[0]!));
		expect(h.routings().map(r => [r.slice_id, r.confidence])).toEqual([[first[0], 0.9]]);
	});

	test("two items of one call that could share a spawn key are refused before any judge call", async () => {
		let calls = 0;
		const judge = { judge: async (req: { state: string }) => (calls++, JUDGE.judge(req)) };
		const h = extensionHost({ judge, table: TABLE, registry: fakeRegistry(ALL_MODELS), slices: ["sl-one", "sl-one-2"] });
		const out = await h.toolCall({
			tasks: [
				{ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") },
				{ agent: "fast", name: "sl-one-2", task: brief(h.workloadId, "second") },
				{ agent: "fast", name: "sl-one", task: brief(h.workloadId, "third") },
			],
		});
		expect(out.block).toBe(true);
		expect(out.reason).toContain("task 2: slice sl-one-2 could share a spawn key with slice sl-one (task 1)");
		expect(out.reason).toContain("task 3: slice sl-one is named twice in this call (task 1)");
		expect(calls).toBe(0);
	});

	test.each([
		["punctuation OMP strips (sl-one.dot → sl-onedot)", "sl-one.dot"],
		["a name longer than OMP's 48-character id", `sl-${"x".repeat(46)}`],
	])("a slice id OMP would rewrite as an agent id is refused at dispatch: %s", async (_, slice) => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS), slices: [slice] });
		const out = await h.toolCall({ agent: "fast", name: slice, task: brief(h.workloadId, "first") });
		expect(out.block).toBe(true);
		expect(out.reason).toContain(`\`${slice}\` is not usable as an OMP agent id`);
	});
});

describe("R2-S1: the judge is pinned to the calibrated version, with no alias behind it", () => {
	const profile = () =>
		Bun.YAML.parse(readFileSync(join(REPO, "profile", "config.yml"), "utf8")) as {
			modelRoles?: Record<string, string>;
			retry?: { fallbackChains?: Record<string, string[]> };
		};
	const MODELS_YML = join(REPO, "profile", "models.yml");

	test.skipIf(!HAS_OMP)("profile/models.yml passes OMP's own models.yml validation and declares the calibrated judge", async () => {
		const { ModelsConfigFile } = await import(`${OMP}/pi-coding-agent/src/config/models-config.ts`);
		const loaded = ModelsConfigFile.relocate(MODELS_YML).tryLoad();
		expect(loaded.status).toBe("ok");
		const typesafe = loaded.value.providers.typesafe;
		expect(typesafe.api ?? typesafe.models[0].api).toBe("typesafe");
		expect(typesafe.models.map((m: { id: string }) => `typesafe/${m.id}`)).toEqual([loadCalibration().judgeModel]);
	});

	test.skipIf(!HAS_OMP)(
		"with the entry, OMP's judge role chain is the pin alone; without it the chain is empty, never jev-latest (review CHAIN probes)",
		async () => {
			const { Settings } = await import(`${OMP}/pi-coding-agent/src/config/settings.ts`);
			const { resolveRoleChain } = await import(RESOLVER);
			const { roleCandidatePool } = await import(`${OMP}/pi-coding-agent/src/config/model-roles.ts`);
			const { getBundledModels } = await import(`${OMP}/pi-catalog/src/models.ts`);
			const config = profile();
			const settings = Settings.isolated({
				modelRoles: config.modelRoles ?? {},
				...(config.retry?.fallbackChains ? { "retry.fallbackChains": config.retry.fallbackChains } : {}),
			});
			const catalog = getBundledModels("typesafe"); // today: jev-latest only
			const entry = Bun.YAML.parse(readFileSync(MODELS_YML, "utf8")).providers.typesafe;
			const pin = { ...catalog[0], id: entry.models[0].id, name: entry.models[0].name, api: entry.api, baseUrl: entry.baseUrl };
			const chain = (models: unknown[]) =>
				resolveRoleChain("judge", settings, roleCandidatePool("judge", settings, { getAvailable: () => models })).map(
					(c: { model: { provider: string; id: string } }) => `${c.model.provider}/${c.model.id}`,
				);
			// Before the fix: ["typesafe/jev-1.13.0", "typesafe/jev-latest"] and ["typesafe/jev-latest"].
			expect(chain([pin, ...catalog])).toEqual([loadCalibration().judgeModel]);
			expect(chain(catalog)).toEqual([]);
		},
	);

	test("the profile's judge fallback chain is allowed by the tier-table checks", () => {
		expect(() => loadTierTable(join(REPO, "profile", "config.yml"))).not.toThrow();
	});

	test("a response reporting a moved version is refused with one line naming requested vs reported and the re-sample (review WIRE_RESPONSE probe)", async () => {
		const moved = { judge: async () => ({ answers: { kind: locate(0.9) }, provider: "typesafe", model: "jev-1.14.0" }) };
		const h = extensionHost({ judge: moved, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
		const out = await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "first") });
		expect(out.block).toBe(true);
		expect(out.reason).not.toContain("\n");
		expect(out.reason).toContain("judge drift: requested typesafe/jev-1.13.0, reported typesafe/jev-1.14.0");
		expect(out.reason).toContain("re-sample");
	});
});

/** A lane that dispatched sl-one to fast asynchronously; OMP allocated agent id `Lane.sl-one`. */
async function asyncHand(registry = fakeRegistry(ALL_MODELS)) {
	const h = extensionHost({ judge: JUDGE, table: TABLE, registry });
	await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "find it") }, "call-a");
	const reply = await h.spawn("fast", "Lane.sl-one");
	// The async call returns at once: no settled results, the job still running.
	const returned = h.toolResult("call-a", false, { results: [], async: { state: "running", jobId: "Lane.sl-one", type: "task" } });
	return { h, reply, returned };
}

/** The text content of a context message; throws when the message carries none. */
function text(message: unknown): string {
	if (message && typeof message === "object" && "content" in message && typeof message.content === "string") return message.content;
	throw new Error(`no text content on ${JSON.stringify(message)}`);
}

describe("R3-1: an async tier hand that ran off its row is refused where its output reaches the lane", () => {
	test("the regression: an off-row model on an async hand is withheld from the lane's model", async () => {
		const { h, reply, returned } = await asyncHand();
		expect(reply?.model).toEqual(FAST);
		expect(returned).toBeUndefined(); // nothing to check yet: the async call carries no hand output
		// A retry fallback, or anything after the spawn check, answered on the hand with a deep model.
		h.handMessage("Lane.sl-one", "anthropic", "claude-haiku-4-5");
		h.handMessage("Lane.sl-one", "openai-codex", "gpt-6-astra");
		const [sent] = h.context([asyncDelivery(["Lane.sl-one"], "the off-row hand's findings")]);
		expect(text(sent)).not.toContain("the off-row hand's findings");
		expect(text(sent)).toContain(
			"agent-system-2 classifier refused this async task result: Lane.sl-one ran on openai-codex/gpt-6-astra, outside the fast row (anthropic/claude-haiku-4-5, openai-codex/gpt-5.6-luna)",
		);
		const [row] = h.routings();
		expect(row).toMatchObject({ slice_id: "sl-one", spawn_key: "Lane.sl-one", tier: "fast", outcome: "refused-out-of-row" });
		expect(JSON.parse(row!.ran_models!)).toEqual(["anthropic/claude-haiku-4-5", "openai-codex/gpt-6-astra"]);
		expect(JSON.parse(row!.models)).toEqual(FAST);
		expect(row!.model).toBe(FAST[0]!);
	});

	test("the refusal holds on every later request, with one routings row", async () => {
		const { h } = await asyncHand();
		h.handMessage("Lane.sl-one", "openai-codex", "gpt-6-astra");
		const delivery = asyncDelivery(["Lane.sl-one"], "the off-row hand's findings");
		for (let i = 0; i < 3; i++) {
			const [sent] = h.context([{ role: "user", content: "go" }, delivery]).slice(1);
			expect(text(sent)).toContain("refused this async task result");
		}
		expect(h.routings().map(r => r.outcome)).toEqual(["refused-out-of-row"]);
	});

	test("an async hand that stayed on its row is delivered untouched and recorded as ran", async () => {
		const { h } = await asyncHand();
		h.handMessage("Lane.sl-one", "anthropic", "claude-haiku-4-5");
		h.handMessage("Lane.sl-one", "openai-codex", "gpt-5.6-luna"); // a same-tier fallback
		const delivery = asyncDelivery(["Lane.sl-one"], "the hand's findings");
		expect(h.context([delivery])).toEqual([delivery]);
		const [row] = h.routings();
		expect(row!.outcome).toBe("ran");
		expect(JSON.parse(row!.ran_models!)).toEqual(FAST);
	});

	test("an async hand with no readable answering model fails closed", async () => {
		const { h } = await asyncHand();
		const [sent] = h.context([asyncDelivery(["Lane.sl-one"])]);
		expect(text(sent)).toContain("Lane.sl-one: no model that answered on it could be read");
		expect(h.routings()).toMatchObject([{ outcome: "refused-model-unknown", ran_models: null }]);
	});

	test("a batched delivery naming a refused hand is withheld whole", async () => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
		await h.toolCall(
			{
				tasks: [
					{ agent: "fast", name: "sl-one", task: brief(h.workloadId, "one") },
					{ agent: "fast", name: "sl-two", task: brief(h.workloadId, "two") },
				],
			},
			"call-b",
		);
		await h.spawn("fast", "Lane.sl-one");
		await h.spawn("fast", "Lane.sl-two");
		h.handMessage("Lane.sl-one", "anthropic", "claude-haiku-4-5");
		h.handMessage("Lane.sl-two", "anthropic", "claude-opus-5-5");
		const [sent] = h.context([asyncDelivery(["Lane.sl-one", "Lane.sl-two"], "both outputs")]);
		expect(text(sent)).toContain("async task delivery (jobs Lane.sl-one, Lane.sl-two, delivered together)");
		expect(text(sent)).toContain("Lane.sl-two ran on anthropic/claude-opus-5-5, outside the fast row");
		expect(text(sent)).not.toContain("both outputs");
		expect(h.routings().map(r => [r.slice_id, r.outcome])).toEqual([
			["sl-one", "ran"],
			["sl-two", "refused-out-of-row"],
		]);
	});

	test("a delivery for a job this extension did not spawn is left alone", async () => {
		const { h } = await asyncHand();
		const other = asyncDelivery(["bash-job-7"], "a background shell job");
		expect(h.context([other])).toEqual([other]);
		expect(h.routings()).toEqual([]);
	});
});

describe("R3-2: blocking hands are checked on every model that answered, not only the reported one", () => {
	test("a blocking hand whose result reports a row model but that answered off-row is refused", async () => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "find it") }, "call-c");
		await h.spawn("fast", "sl-one"); // a blocking spawn is keyed by the item name
		h.handMessage("Lane.sl-one", "openai-codex", "gpt-6-astra");
		h.handMessage("Lane.sl-one", "anthropic", "claude-haiku-4-5");
		const result = h.toolResult("call-c", false, {
			results: [{ id: "Lane.sl-one", agent: "fast", resolvedModelIdentity: "anthropic/claude-haiku-4-5" }],
		});
		expect(result?.isError).toBe(true);
		expect(result?.content?.[0]?.text).toContain("Lane.sl-one ran on openai-codex/gpt-6-astra, outside the fast row");
		const [row] = h.routings();
		expect(row).toMatchObject({ spawn_key: "sl-one", outcome: "refused-out-of-row" });
		expect(JSON.parse(row!.ran_models!)).toEqual(["openai-codex/gpt-6-astra", "anthropic/claude-haiku-4-5"]);
	});

	test("a blocking hand on its row passes and is recorded once", async () => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS) });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "find it") }, "call-d");
		await h.spawn("fast", "sl-one");
		h.handMessage("sl-one", "anthropic", "claude-haiku-4-5");
		const details = { results: [{ id: "sl-one", agent: "fast", resolvedModelIdentity: "anthropic/claude-haiku-4-5" }] };
		expect(h.toolResult("call-d", false, details)).toBeUndefined();
		expect(h.toolResult("call-d", false, details)).toBeUndefined();
		expect(h.routings()).toMatchObject([{ outcome: "ran", ran_models: '["anthropic/claude-haiku-4-5"]' }]);
	});
});

describe("R3-3: a spawn refused for no usable model is a routings row", () => {
	test("the refusal writes outcome refused-no-usable-model with no models", async () => {
		const h = extensionHost({ judge: JUDGE, table: TABLE, registry: fakeRegistry(ALL_MODELS, []) });
		await h.toolCall({ agent: "fast", name: "sl-one", task: brief(h.workloadId, "find it") }, "call-e");
		const reply = await h.spawn("fast", "Lane.sl-one");
		expect(reply?.block).toBe(true);
		expect(h.routings()).toMatchObject([
			{ slice_id: "sl-one", spawn_key: "Lane.sl-one", models: "[]", model: null, outcome: "refused-no-usable-model", ran_models: null },
		]);
	});
});
