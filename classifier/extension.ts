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
 *      (omp://extensions.md:378: "an optional stable `spawnKey`") is the item's `name` as written
 *      for a blocking spawn, or the allocated agent id — the name with an optional `<parent>.` prefix
 *      and `-N` collision suffix — for an async one (task/index.ts:854 and :1501,
 *      task/output-manager.ts #allocateUnique, task/structured-subagent.ts applySpawnHook); it finds
 *      the classification for the ledger record only. The event carries no per-dispatch identity,
 *      so step 1 refuses a dispatch whose slice id OMP would rewrite as an agent id, or whose spawn
 *      keys could coincide with a slice still waiting to spawn: every key then names one slice.
 *      The returned list is the row's candidates that are in the registry, on an enabled provider,
 *      and credentialed both session-free and for the spawn key, in row order: OMP's final
 *      selection (config/model-resolver.ts resolveModelOverrideWithAuthFallback, asked with the
 *      agent id) then meets a usable primary and has no reason to fall back to the parent's model.
 *      No usable candidate refuses.
 *   3. `tool_result` on `task`: the precheck cannot see credentials change, nor a blocking spawn's
 *      final agent id, so each tier hand's reported model (`resolvedModelIdentity`) is checked
 *      against its tier row; a hand that ran outside it turns the task result into a refusal.
 *   4. The routing is written to the ledger's `routings` table (ledger/src/index.ts recordRouting)
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
	/** `sessionId` selects a session-sticky account, as OMP's final selection passes the agent id. */
	getApiKey(model: { provider: string; id: string }, sessionId?: string): Promise<string | undefined>;
}

export interface ClassifierDeps {
	/** The judge for this session: OMP's `judge` role in production. */
	judge(ctx: ExtensionContext): Promise<KindJudge>;
	/** The profile's tier→model table; throws when the profile's table is invalid. */
	tierTable(): TierTable;
	/** OMP's `disabledProviders` setting: final selection drops these providers before matching. */
	disabledProviders(ctx: ExtensionContext): Promise<readonly string[]>;
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

/**
 * The names OMP keeps as agent ids unchanged: task/structured-subagent.ts sanitizeAgentId strips
 * everything outside `[A-Za-z0-9_-]` and cuts at 48 characters. With no dot in the name, the
 * `<parent>.` prefix in a spawn key is unambiguous.
 */
const OMP_AGENT_ID = /^[A-Za-z0-9_-]{1,48}$/;

/**
 * Could one spawn key name both slices? For valid agent ids the key sets are `[p.]a[-N]` and
 * `[p.]b[-N]`; they meet exactly when one name is the other or the other plus `-N`.
 */
function spawnKeysOverlap(a: string, b: string): boolean {
	return spawnKeyNames(a, b) || spawnKeyNames(b, a);
}

/** The first earlier slice whose spawn keys could coincide with `sliceId`'s, and how to say so. */
function spawnKeyConflict(sliceId: string, earlier: readonly { sliceId: string; where: string }[], pendingWord: string): string | null {
	for (const other of earlier) {
		if (other.sliceId === sliceId) {
			return pendingWord
				? `slice ${sliceId} already has a classified dispatch waiting to spawn (${other.where}); dispatch it again after that spawn, or after that call fails`
				: `slice ${sliceId} is named twice in this call (${other.where})`;
		}
		if (spawnKeysOverlap(sliceId, other.sliceId)) {
			return `slice ${sliceId} could share a spawn key with ${pendingWord}slice ${other.sliceId} (${other.where}); OMP suffixes a reused name with -N, so the spawn could not be told apart`;
		}
	}
	return null;
}

/** The model a settled task result reports, as a `provider/id` identity (`@upstream` route dropped). */
function reportedModel(result: { resolvedModelIdentity?: string; resolvedModel?: string }): string | null {
	const reported = result.resolvedModelIdentity ?? result.resolvedModel;
	return reported ? modelIdentity(reported.replace(/@.*$/, "")) : null;
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
					if (!OMP_AGENT_ID.test(sliceId) || item.name !== sliceId) {
						problems.push(
							`${at}: \`${sliceId}\` is not usable as an OMP agent id (letters, digits, _ and - only, at most 48 characters); OMP would rename the spawn and its routing could not be matched`,
						);
						continue;
					}
					if (ledger.slice(sliceId)?.workload_id !== workloadId) {
						problems.push(`${at}: \`${sliceId}\` is not a slice of workload ${workloadId} in the ledger`);
						continue;
					}
					// R2-B2: the spawn event carries no per-dispatch identity, only a key derived from the name.
					const conflict =
						spawnKeyConflict(sliceId, targets.map(t => ({ sliceId: t.sliceId, where: `task ${t.index + 1}` })), "") ??
						spawnKeyConflict(sliceId, pending.map(p => ({ sliceId: p.sliceId, where: `call ${p.toolCallId}` })), "pending ");
					if (conflict) {
						problems.push(`${at}: ${conflict}`);
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
						// S4 / R2-S1: a threshold measured on one judge says nothing about another's confidences.
						if (classification.judgeModel !== deps.calibration.judgeModel) {
							throw new Error(
								`judge drift: requested ${deps.calibration.judgeModel}, reported ${classification.judgeModel}; the 0.55 threshold holds only for the judge it was measured on, so re-sample the classifier on the reported model (research/classifier-sample.md) and update classifier/calibration.json before routing on it`,
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

			// Publish the whole call at once. A call that overlapped this one while both were being
			// classified is refused here rather than overwriting it (R2-B2): the first dispatch keeps its record.
			const late = classified.flatMap((entry, i) => {
				const conflict = spawnKeyConflict(
					entry.sliceId,
					pending.map(p => ({ sliceId: p.sliceId, where: `call ${p.toolCallId}` })),
					"pending ",
				);
				return conflict ? [`task ${targets[i]!.index + 1}: ${conflict}`] : [];
			});
			if (late.length > 0) return fail(late.join("; "));
			pending.push(...classified);
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

				// DESIGN-2.0.md P-11 row 15 / SPEC-2.0.md § B11: only this tier's row, only entries OMP's final
				// selection will keep: enabled provider, credentials session-free and for this spawn's key.
				const registry = ctx.modelRegistry as unknown as ModelAvailability;
				const available = registry.getAvailable();
				const disabled = new Set(await deps.disabledProviders(ctx));
				const models: string[] = [];
				const skipped: string[] = [];
				for (const selector of table[tier]) {
					const model = available.find(m => `${m.provider}/${m.id}` === modelIdentity(selector));
					if (!model) skipped.push(`${selector} (not in the model registry)`);
					else if (disabled.has(model.provider)) skipped.push(`${selector} (provider disabled)`);
					else if (!(await registry.getApiKey(model))) skipped.push(`${selector} (no credentials)`);
					else if (event.spawnKey && !(await registry.getApiKey(model, event.spawnKey))) {
						skipped.push(`${selector} (no credentials for spawn ${event.spawnKey})`);
					} else models.push(selector);
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
			if (event.toolName !== "task") return undefined;
			const details = (event.details ?? undefined) as
				| { async?: unknown; results?: { id?: string; agent?: string; resolvedModelIdentity?: string; resolvedModel?: string }[] }
				| undefined;
			// A failed or refused call spawns nothing more, and a finished blocking call has spawned all it
			// will: drop what it classified. A returned async call keeps its entries — they spawn later.
			if (event.isError || (details && details.async === undefined)) {
				for (let i = pending.length - 1; i >= 0; i--) {
					if (pending[i]!.toolCallId === event.toolCallId) pending.splice(i, 1);
				}
			}

			// R2-B1: the tier row is the allowlist for the model that actually ran, whatever the final
			// selection or a retry fallback did after the spawn check.
			const hands = (details?.results ?? []).filter(result => isTier(result.agent) && reportedModel(result));
			if (hands.length === 0) return undefined;
			let drift: string[];
			try {
				const table = deps.tierTable();
				drift = hands.flatMap(result => {
					const tier = result.agent as Tier;
					const ran = reportedModel(result)!;
					if (table[tier].some(selector => modelIdentity(selector) === ran)) return [];
					return [`${result.id ?? "a hand"} ran on ${ran}, outside the ${tier} row (${table[tier].join(", ")})`];
				});
			} catch (error) {
				drift = [`its tier hands could not be checked against the tier table (${message(error)})`];
			}
			if (drift.length === 0) return undefined;
			return {
				isError: true,
				content: [
					{
						type: "text" as const,
						text: `agent-system-2 classifier refused this task result: ${drift.join("; ")}. The output is withheld: a tier hand runs only on its tier's row (DESIGN-2.0.md P-11 row 15). Re-dispatch the slice once a row model is usable.`,
					},
				],
			};
		});
	};
}

/** Production wiring: the host's `judge` role, the active profile's config.yml, and the ledger. */
export default function agentSystemClassifier(pi: ExtensionAPI): void {
	let configPath: string | undefined;
	let ledger: Ledger | undefined;
	// Host-package imports resolve to the running OMP (extensibility/plugins/legacy-pi-compat.ts);
	// they are dynamic because this checkout carries no OMP install to import from statically.
	const settingsFor = async (ctx: ExtensionContext) => {
		const { Settings } = await import("@oh-my-pi/pi-coding-agent/config/settings");
		return Settings.current ?? Settings.loadReadOnly({ cwd: ctx.cwd });
	};
	createClassifierExtension({
		question: loadKindQuestion(),
		calibration: loadCalibration(),
		laneId: process.env[LANE_ENV] || `lane-${process.pid}`,
		ledger: () => (ledger ??= Ledger.open(defaultLedgerPath(process.env))),
		async judge(ctx) {
			const [settings, { resolveJudge }] = await Promise.all([
				settingsFor(ctx),
				import("@oh-my-pi/pi-coding-agent/judgment/index"),
			]);
			return resolveJudge({ settings, registry: ctx.modelRegistry }) as unknown as KindJudge;
		},
		async disabledProviders(ctx) {
			// The same read OMP's final selection makes (config/model-resolver.ts resolveModelOverrideWithAuthFallback).
			return [...new Set((await settingsFor(ctx)).get("disabledProviders"))];
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
