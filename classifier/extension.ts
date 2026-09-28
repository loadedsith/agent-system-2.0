/**
 * agent-system 2.0 pre-dispatch classifier (SPEC-2.0.md § A1.3; build question 1, DESIGN-2.0.md § D6).
 *
 * Per lane `task` call: brief → classifier → kind → tier → cap, then at spawn → model.
 *   1. `tool_call` on `task`: for each item whose `agent` names a dispatchable tier file, check the
 *      item names its ledger slice (`name: sl-…`, a slice of the brief's `workload:`), classify it,
 *      compute the tier (0.55 higher-of-top-two rule, stakes cap), and revise the call's input so the
 *      item's `agent` is the computed tier file (omp://extensions.md § Tool lifecycle). Every
 *      classification of the call is published at once, only after all of them succeed.
 *   2. `before_subagent_spawn`: the model row comes from the tier the event carries (`agent`, the
 *      rewritten name) — never from which classification arrived first. The event's `spawnKey`
 *      (omp://extensions.md:378: "an optional stable `spawnKey`") is the allocated agent id, i.e. the
 *      item's `name` with an optional `<parent>.` prefix and `-N` collision suffix
 *      (task/index.ts:854, task/output-manager.ts:84-91, task/structured-subagent.ts:370-373); it
 *      finds the classification for the ledger record only. The returned list is the row's
 *      candidates that are in the registry and credentialed, in row order: OMP resolves the first
 *      one and never meets an uncredentialed primary, so it never falls back to the parent's model
 *      (config/model-resolver.ts resolveModelOverrideWithAuthFallback). No usable candidate refuses.
 *   3. The routing is written to the ledger's `routings` table (ledger/src/index.ts recordRouting)
 *      on the item's slice, and shown as the spawn's routing note.
 *
 * Items naming anything other than a tier file are left untouched for M4's refusal (P-11 row 4);
 * this extension never repairs a bad agent name.
 */
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { join } from "node:path";
import { LANE_ENV } from "../gates/src/types";
import { Ledger } from "../ledger/src/index";
import { defaultLedgerPath } from "../ledger/src/locality";
import { briefField, briefStakes } from "./src/brief";
import {
	type Calibration,
	classify,
	type KindJudge,
	type KindQuestion,
	loadCalibration,
	loadKindQuestion,
	questionSha256,
} from "./src/classify";
import type { RoutingLedger } from "./src/ledger-port";
import { isTier, route, type Routing, type Tier } from "./src/route";
import { loadTierTable, modelIdentity, type TierTable } from "./src/tier-table";

/** The slice of OMP's model registry the spawn check reads (config/model-registry.ts). */
export interface ModelAvailability {
	getAvailable(): readonly { provider: string; id: string }[];
	getApiKey(model: { provider: string; id: string }): Promise<string | undefined>;
}

export interface ClassifierDeps {
	/** The judge for this session: OMP's `judge` role in production. */
	judge(ctx: ExtensionContext): Promise<KindJudge>;
	/** The profile's tier→model table; throws when the profile's table is invalid. */
	tierTable(): TierTable;
	question: KindQuestion;
	/** The question and judge the 0.55 threshold was measured with (classifier/calibration.json). */
	calibration: Calibration;
	/** The ledger the routing rows land in; opened lazily in production. */
	ledger(): RoutingLedger;
	/** `created_by` on routing rows: this lane's id. */
	laneId: string;
}

/** One classified tier item, waiting for its spawn. */
interface Pending {
	toolCallId: string;
	/** The item's `name`: its ledger slice id, and the base of its spawn key. */
	sliceId: string;
	workloadId: string;
	routing: Routing & { probabilities: Record<string, number>; judgeModel: string };
}

type TaskItem = { agent?: string; name?: string; task?: string; [key: string]: unknown };
type TaskInput = TaskItem & { tasks?: TaskItem[]; context?: string };

const refuse = (reason: string) => ({ block: true as const, reason });
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Does `spawnKey` name the agent OMP allocated for `name`: `[<parent>.]name[-N]`? */
function spawnKeyNames(spawnKey: string, name: string): boolean {
	return new RegExp(`^(?:.+\\.)?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:-\\d+)?$`).test(spawnKey);
}

function routingNote(routing: Pending["routing"] | null, tier: Tier, models: string[], skipped: string[]): string {
	const parts = routing ? [`${routing.kind} ${routing.confidence.toFixed(2)} → ${routing.classifiedTier}`] : [`tier ${tier} (unclassified)`];
	if (routing?.pullUp) parts.push(`pulled up to ${routing.pullUp.to} (below 0.55; top two ${routing.topTwo.join("/")})`);
	if (routing?.pullDown) parts.push(`capped to ${routing.pullDown.to} (stakes ${routing.stakes})`);
	parts.push(`${models[0]}${models.length > 1 ? ` (+${models.length - 1} same-tier fallback)` : ""}`);
	if (skipped.length > 0) parts.push(`skipped ${skipped.join(", ")}`);
	return parts.join("; ");
}

export function createClassifierExtension(deps: ClassifierDeps) {
	// SPEC-2.0.md § A1.3 "Measured 2026-09-23": the threshold holds for one question text only.
	const questionProblem =
		questionSha256(deps.question) === deps.calibration.questionSha256
			? null
			: `the classifier question (sha256 ${questionSha256(deps.question).slice(0, 12)}…) is not the question the 0.55 threshold was measured with (${deps.calibration.questionSha256.slice(0, 12)}…); record a new sample and update classifier/calibration.json`;

	return function classifierExtension(pi: ExtensionAPI): void {
		// Per-session state in the factory closure: OMP re-invokes the factory per agent session
		// without re-importing the module (measured in ctx-first-search.ts, 2026-09-11).
		const pending: Pending[] = [];

		pi.on("tool_call", async (event, ctx) => {
			if (event.toolName !== "task") return undefined;
			const input = (event.input ?? {}) as TaskInput;
			const batch = Array.isArray(input.tasks) && input.tasks.length > 0;
			const items: TaskItem[] = batch ? input.tasks! : [input];
			const context = batch ? input.context : undefined;
			const tierItems = items.flatMap((item, index) => (isTier(item.agent?.trim()) ? [{ item, index }] : []));
			if (tierItems.length === 0) return undefined;
			const fail = (reason: string) => refuse(`agent-system-2 classifier could not route this dispatch: ${reason}`);
			if (questionProblem) return fail(questionProblem);

			// Every routing lands on its slice's ledger row (ruling 2026-09-28), so each tier item
			// names its slice; check that before spending a judge call.
			const problems: string[] = [];
			const targets: { item: TaskItem; index: number; sliceId: string; workloadId: string }[] = [];
			try {
				const ledger = deps.ledger();
				for (const { item, index } of tierItems) {
					const at = `task ${index + 1}`;
					const sliceId = typeof item.name === "string" ? item.name.trim() : "";
					const workloadId = briefField("workload", item.task, context);
					if (!sliceId) problems.push(`${at}: no \`name\`; a tier dispatch is named after its ledger slice id`);
					if (!workloadId) problems.push(`${at}: the brief has no \`workload:\` field`);
					if (!sliceId || !workloadId) continue;
					if (ledger.slice(sliceId)?.workload_id !== workloadId) {
						problems.push(`${at}: \`${sliceId}\` is not a slice of workload ${workloadId} in the ledger`);
						continue;
					}
					targets.push({ item, index, sliceId, workloadId });
				}
			} catch (error) {
				return fail(`the ledger could not be read (${message(error)})`);
			}
			if (problems.length > 0) return fail(problems.join("; "));

			const abort = new AbortController();
			let classified: Pending[];
			try {
				const judge = await deps.judge(ctx);
				classified = await Promise.all(
					targets.map(async ({ item, sliceId, workloadId }): Promise<Pending> => {
						const classification = await classify(item.task ?? "", judge, deps.question, abort.signal);
						// S4: a threshold measured on one judge says nothing about another's confidences.
						if (classification.judgeModel !== deps.calibration.judgeModel) {
							throw new Error(
								`the brief was answered by ${classification.judgeModel}, not the calibrated judge ${deps.calibration.judgeModel}`,
							);
						}
						// SPEC-2.0.md § B9 field 5 feeds the § B4 cap; read task text first, then context.
						const routing = route(classification, briefStakes(item.task, context));
						return {
							toolCallId: event.toolCallId,
							sliceId,
							workloadId,
							routing: {
								...routing,
								probabilities: classification.probabilities as Record<string, number>,
								judgeModel: classification.judgeModel,
							},
						};
					}),
				);
			} catch (error) {
				// SPEC-2.0.md § A1.3: a dispatch the classifier could not route is refused, not sent on
				// an unclassified guess. Nothing was published, so late answers have nowhere to land.
				abort.abort();
				return fail(message(error));
			}

			// Publish the whole call at once. A slice re-dispatched replaces its older classification.
			for (const entry of classified) {
				const older = pending.findIndex(p => p.sliceId === entry.sliceId);
				if (older >= 0) pending.splice(older, 1);
				pending.push(entry);
			}
			const tierAt = new Map(classified.map((entry, i) => [targets[i]!.index, entry.routing.tier]));
			const revised = items.map((item, index) => (tierAt.has(index) ? { ...item, agent: tierAt.get(index)! } : item));
			return { input: batch ? { ...input, tasks: revised } : revised[0]! };
		});

		pi.on("before_subagent_spawn", async (event, ctx) => {
			if (!isTier(event.agent)) return undefined;
			const tier = event.agent;
			// A throwing handler must not let the spawn through on the native row: every failure refuses.
			try {
				const table = deps.tierTable();

				let found: Pending | null = null;
				if (event.invocationKind === "task") {
					const matches = event.spawnKey ? pending.filter(p => spawnKeyNames(event.spawnKey!, p.sliceId)) : [];
					if (matches.length === 0) {
						return refuse(`agent-system-2 classifier: no classification for task spawn ${event.spawnKey ?? "(no spawn key)"}; a tier hand is dispatched only through a classified lane task call`);
					}
					if (matches.length > 1) {
						return refuse(`agent-system-2 classifier: spawn ${event.spawnKey} matches ${matches.length} classified slices (${matches.map(m => m.sliceId).join(", ")}); refusing rather than guess`);
					}
					found = matches[0]!;
					if (found.routing.tier !== tier) {
						return refuse(`agent-system-2 classifier: spawn ${event.spawnKey} is on ${tier} but its slice ${found.sliceId} was classified ${found.routing.tier}`);
					}
					pending.splice(pending.indexOf(found), 1);
				}

				// DESIGN-2.0.md P-11 row 15 / SPEC-2.0.md § B11: only this tier's row, only usable entries.
				const registry = ctx.modelRegistry as unknown as ModelAvailability;
				const available = registry.getAvailable();
				const models: string[] = [];
				const skipped: string[] = [];
				for (const selector of table[tier]) {
					const model = available.find(m => `${m.provider}/${m.id}` === modelIdentity(selector));
					if (!model) skipped.push(`${selector} (not in the model registry)`);
					else if (!(await registry.getApiKey(model))) skipped.push(`${selector} (no credentials)`);
					else models.push(selector);
				}
				if (models.length === 0) {
					return refuse(`agent-system-2 classifier: no usable ${tier} model: ${skipped.join(", ")}`);
				}

				if (found) {
					const r = found.routing;
					// SPEC-2.0.md § A1.3 step 4 and "record the pull-up on the slice's ledger row".
					deps.ledger().recordRouting({
						by: deps.laneId,
						workloadId: found.workloadId,
						sliceId: found.sliceId,
						spawnKey: event.spawnKey ?? null,
						kind: r.kind,
						confidence: r.confidence,
						probabilities: r.probabilities,
						classifiedTier: r.classifiedTier,
						pullUpTo: (r.pullUp?.to ?? null) as Exclude<Tier, "fast"> | null,
						stakes: r.stakes,
						pullDownTo: (r.pullDown?.to ?? null) as Exclude<Tier, "deep"> | null,
						tier,
						models,
						judgeModel: r.judgeModel,
					});
				}
				return { model: models, note: routingNote(found?.routing ?? null, tier, models, skipped) };
			} catch (error) {
				return refuse(`agent-system-2 classifier could not route this spawn: ${message(error)}`);
			}
		});

		pi.on("tool_result", event => {
			// A failed or refused call spawns nothing more: drop what it classified. A successful call
			// keeps its entries — async items spawn after the call has returned.
			if (event.toolName !== "task" || !event.isError) return undefined;
			for (let i = pending.length - 1; i >= 0; i--) {
				if (pending[i]!.toolCallId === event.toolCallId) pending.splice(i, 1);
			}
			return undefined;
		});
	};
}

/** Production wiring: the host's `judge` role, the active profile's config.yml, and the ledger. */
export default function agentSystemClassifier(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	let ledger: Ledger | undefined;
	createClassifierExtension({
		question: loadKindQuestion(),
		calibration: loadCalibration(),
		laneId: process.env[LANE_ENV] || `lane-${process.pid}`,
		ledger: () => (ledger ??= Ledger.open(defaultLedgerPath(process.env))),
		async judge(ctx) {
			// Host-package imports resolve to the running OMP (extensibility/plugins/legacy-pi-compat.ts);
			// they are dynamic because this checkout carries no OMP install to import from statically.
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
