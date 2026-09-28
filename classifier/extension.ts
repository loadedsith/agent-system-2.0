/**
 * agent-system 2.0 pre-dispatch classifier (SPEC-2.0.md § A1.3; build question 1, DESIGN-2.0.md § D6).
 *
 * Per lane `task` call: brief → classifier → kind → tier → cap, then at spawn → model.
 *   1. `tool_call` on `task`: classify each item whose `agent` names a dispatchable tier file,
 *      compute the tier (0.55 higher-of-top-two rule, stakes cap), and revise the call's input so
 *      the item's `agent` is the computed tier file (omp://extensions.md § Tool lifecycle: a
 *      `tool_call` handler may revise the tool's execution input). The lane's own tier choice is
 *      replaced: work-kind and tier are not brief fields (SPEC-2.0.md § B9).
 *   2. `before_subagent_spawn`: return the profile's ordered model row for that tier as the spawn's
 *      model list; OMP tries them in order and uses the rest as the retry fallback chain
 *      (omp://extensions.md § Subagent lifecycle), so a rate-limited provider falls sideways to the
 *      same tier on another provider, never up (DESIGN-2.0.md P-11 row 15).
 *   3. The complete routing record is written on the dispatch as a custom session entry
 *      (`agent-system-2.routing`) and as the spawn's routing note. The ledger has no table for it
 *      yet (M3 REPORT, QUESTION on the ledger schema).
 *
 * Items naming anything other than a tier file are left untouched for M4's refusal (P-11 row 4);
 * this extension never repairs a bad agent name.
 */
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { join } from "node:path";
import { briefField, briefStakes } from "./src/brief";
import { classify, type KindJudge, type KindQuestion, loadKindQuestion } from "./src/classify";
import { isTier, route, type Routing, type Tier } from "./src/route";
import { loadTierTable, type TierTable } from "./src/tier-table";

/** Custom session-entry type carrying one RoutingRecord per spawned hand. */
export const ROUTING_ENTRY = "agent-system-2.routing";

/**
 * The dispatch annotation M4 and M5 read. One per spawned hand, written at spawn time, when the
 * model is known. `routing` is null only for a spawn the classifier never saw (e.g. eval `agent()`).
 */
export interface RoutingRecord {
	v: 1;
	at: string;
	/** The lane's `task` tool call and the item's position in it. */
	toolCallId: string | null;
	index: number | null;
	/** The item's `name` (spawn handle), when the lane gave one. */
	name: string | null;
	/** The brief's `workload` field (§ B9 field 1), when present. */
	workloadId: string | null;
	/** The agent the lane named before the rewrite. */
	requestedAgent: string | null;
	routing: (Routing & { probabilities: Record<string, number>; judgeModel: string; judgeCost: number | null }) | null;
	/** The tier file actually spawned. */
	tier: Tier;
	/** The profile row for that tier, in attempt order; models[0] is the chosen model. */
	models: string[];
	model: string;
	/** How the spawn was matched to its classification: OMP's spawn key, the item name, or arrival order. */
	match: "spawn-key" | "name" | "arrival" | "none";
}

export interface ClassifierDeps {
	/** The judge for this session: OMP's `judge` role in production. */
	judge(ctx: ExtensionContext): Promise<KindJudge>;
	/** The profile's tier→model table; throws when the profile's table is invalid. */
	tierTable(): TierTable;
	question: KindQuestion;
	now(): string;
}

interface Pending {
	record: Omit<RoutingRecord, "at" | "models" | "model" | "match" | "tier">;
	tier: Tier;
	key: string;
}

type TaskItem = { agent?: string; name?: string; task?: string; [key: string]: unknown };
type TaskInput = TaskItem & { tasks?: TaskItem[]; context?: string };

function routingNote(record: Omit<RoutingRecord, "at" | "match">): string {
	const r = record.routing;
	if (!r) return `tier ${record.tier} (unclassified) → ${record.model}`;
	const parts = [`${r.kind} ${r.confidence.toFixed(2)} → ${r.classifiedTier}`];
	if (r.pullUp) parts.push(`pulled up to ${r.pullUp.to} (below 0.55; top two ${r.topTwo.join("/")})`);
	if (r.pullDown) parts.push(`capped to ${r.pullDown.to} (stakes ${r.stakes})`);
	parts.push(`${record.model}${record.models.length > 1 ? ` (+${record.models.length - 1} same-tier fallback)` : ""}`);
	return parts.join("; ");
}

export function createClassifierExtension(deps: ClassifierDeps) {
	return function classifierExtension(pi: ExtensionAPI): void {
		// Per-session state in the factory closure: OMP re-invokes the factory per agent session
		// without re-importing the module (measured in ctx-first-search.ts, 2026-09-11).
		const pending: Pending[] = [];

		pi.on("tool_call", async (event, ctx) => {
			if (event.toolName !== "task") return undefined;
			const input = (event.input ?? {}) as TaskInput;
			const batch = Array.isArray(input.tasks) && input.tasks.length > 0;
			const items: TaskItem[] = batch ? input.tasks! : [input];
			if (!items.some(item => isTier(item.agent?.trim()))) return undefined;

			try {
				const judge = await deps.judge(ctx);
				const tiers = await Promise.all(
					items.map(async (item, index): Promise<Tier | null> => {
						const requested = item.agent?.trim();
						// P-11 row 4 (M4) refuses non-tier names; this extension leaves them untouched.
						if (!isTier(requested)) return null;
						const classification = await classify(item.task ?? "", judge, deps.question);
						// SPEC-2.0.md § B9 field 5 feeds the § B4 cap; read task text first, then context.
						const stakes = briefStakes(item.task, batch ? input.context : undefined);
						const routing = route(classification, stakes);
						pending.push({
							key: `${event.toolCallId}:${index}`,
							tier: routing.tier,
							record: {
								v: 1,
								toolCallId: event.toolCallId,
								index,
								name: typeof item.name === "string" ? item.name : null,
								workloadId: briefField("workload", item.task, batch ? input.context : undefined),
								requestedAgent: requested,
								routing: {
									...routing,
									probabilities: classification.probabilities as Record<string, number>,
									judgeModel: classification.judgeModel,
									judgeCost: classification.cost,
								},
							},
						});
						return routing.tier;
					}),
				);
				const revised = items.map((item, index) => (tiers[index] ? { ...item, agent: tiers[index]! } : item));
				return { input: batch ? { ...input, tasks: revised } : revised[0]! };
			} catch (error) {
				// SPEC-2.0.md § A1.3: the routing chain runs on every dispatch; a dispatch the
				// classifier could not route is refused, not sent on an unclassified guess.
				const message = error instanceof Error ? error.message : String(error);
				return { block: true, reason: `agent-system-2 classifier could not route this dispatch: ${message}` };
			}
		});

		pi.on("before_subagent_spawn", event => {
			if (!isTier(event.agent)) return undefined;
			const tier = event.agent;
			let table: TierTable;
			try {
				table = deps.tierTable();
			} catch (error) {
				return { block: true, reason: error instanceof Error ? error.message : String(error) };
			}

			// Match this spawn to its classification: OMP's spawn key is `<toolCallId>:<index>` when
			// the call names no handle (src/task/structured-subagent.ts:370-373), else the handle.
			let match: RoutingRecord["match"] = "none";
			let at = event.spawnKey ? pending.findIndex(p => p.key === event.spawnKey) : -1;
			if (at >= 0) match = "spawn-key";
			if (at < 0 && event.spawnKey) {
				at = pending.findIndex(p => p.record.name !== null && p.record.name === event.spawnKey);
				if (at >= 0) match = "name";
			}
			if (at < 0 && event.invocationKind === "task") {
				at = pending.findIndex(p => p.tier === tier);
				if (at >= 0) match = "arrival";
			}
			const found = at >= 0 ? pending.splice(at, 1)[0]! : null;

			// DESIGN-2.0.md P-11 row 15 / SPEC-2.0.md § B11: the tier's own row, in provider order —
			// the fallback chain OMP builds from it never leaves the tier.
			const models = [...table[tier]];
			const base = found?.record ?? {
				v: 1 as const,
				toolCallId: null,
				index: null,
				name: null,
				workloadId: null,
				requestedAgent: null,
				routing: null,
			};
			const record: RoutingRecord = { ...base, at: deps.now(), tier, models, model: models[0]!, match };
			// SPEC-2.0.md § A1.3 step 4 and "record the pull-up": the chosen tier/model and any
			// pull-up/pull-down land on the dispatch as a structured session entry.
			pi.appendEntry(ROUTING_ENTRY, record);
			return { model: models, note: routingNote(record) };
		});

		pi.on("tool_result", event => {
			if (event.toolName !== "task") return undefined;
			// Drop classifications whose spawn never happened (refused by another gate, cancelled).
			for (let i = pending.length - 1; i >= 0; i--) {
				if (pending[i]!.record.toolCallId === event.toolCallId) pending.splice(i, 1);
			}
			return undefined;
		});
	};
}

/** Production wiring: the host's `judge` role and the active profile's config.yml. */
export default function agentSystemClassifier(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	createClassifierExtension({
		question: loadKindQuestion(),
		now: () => new Date().toISOString(),
		async judge(ctx) {
			// Host-package imports resolve to the running OMP (extensibility/plugins/legacy-pi-compat.ts).
			const [{ Settings }, { resolveJudge }] = await Promise.all([
				import("@oh-my-pi/pi-coding-agent/config/settings"),
				import("@oh-my-pi/pi-coding-agent/judgment/index"),
			]);
			const settings = await (Settings.current ?? Settings.loadReadOnly({ cwd: ctx.cwd }));
			return resolveJudge({ settings, registry: ctx.modelRegistry }) as unknown as KindJudge;
		},
		tierTable() {
			if (!configPath) {
				const { getAgentDir } = require("@oh-my-pi/pi-utils") as { getAgentDir(): string };
				configPath = join(getAgentDir(), "config.yml");
			}
			return loadTierTable(configPath);
		},
	})(pi);
}
