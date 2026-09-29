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
 *   3. The hand's own session: this factory's instance there sees every assistant `message_end`
 *      (awaited, and drained by the session's `waitForIdle` before the hand's result exists:
 *      session/agent-session.ts #processAgentEvent, #emitSessionEvent, waitForIdle) and records the
 *      `provider/model` that answered on the hand. The hand is found by its agent id, the base
 *      name of its session file (task/executor.ts: `<artifactsDir>/<id>.jsonl`). Not `agent_end`:
 *      OMP fires the extension `agent_end` fire-and-forget (`void this.#emitAgentEndNotification`),
 *      so it is not ordered before the result, and it cannot withhold anything.
 *   4. Where the hand's output reaches the lane, every model that answered is checked against the
 *      tier row (one verdict per hand, `settle`): a blocking hand's `task` `tool_result` (plus the
 *      model the result reports), and an async hand's `async-result` delivery, which reaches the
 *      lane's model only through the per-request `context` event (sdk.ts transformContext). A hand
 *      that ran off its row, or whose models could not be read, has its output replaced by a
 *      refusal there. The verdict is the one `routings` row for the dispatch (ledger/src/index.ts
 *      recordRouting, schema v4: `outcome`, `ran_models`); a spawn refused for no usable model
 *      writes its row at the refusal. The row is also shown as the spawn's routing note.
 *
 * Items naming anything other than a tier file are left untouched for M4's refusal (P-11 row 4);
 * this extension never repairs a bad agent name.
 */
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { basename, join } from "node:path";
import { LANE_ENV } from "../gates/src/types";
import { Ledger, type RoutingOutcome } from "../ledger/src/index";
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

/** A tier hand past its spawn check, waiting for the verdict on the models that answered on it. */
interface Hand extends Pending {
	/** The spawn event's key: the agent id for an async spawn, the item name for a blocking one. */
	spawnKey: string | null;
	tier: Tier;
	/** The row's candidates usable at spawn, row order: what the spawn was constrained to. */
	models: string[];
	/** The tier row at spawn, as `provider/id` identities: the allowlist for what answered. */
	row: string[];
}

/** A settled hand: its `routings` outcome, and why its output is withheld when it is. */
interface Verdict {
	outcome: RoutingOutcome;
	refusal: string | null;
}

/** A task tool result entry, as task/index.ts and task/executor.ts report it. */
type TaskResult = { id?: string; agent?: string; resolvedModelIdentity?: string; resolvedModel?: string };

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

/** A reported model as a `provider/id` identity (`@upstream` route and thinking suffix dropped). */
function identity(reported: string): string {
	return modelIdentity(reported.replace(/@.*$/, ""));
}

/** The model a settled task result reports, as a `provider/id` identity. */
function reportedModel(result: TaskResult): string | null {
	const reported = result.resolvedModelIdentity ?? result.resolvedModel;
	return reported ? identity(reported) : null;
}

function withheld(what: string, drift: readonly string[]): string {
	return `agent-system-2 classifier refused this ${what}: ${drift.join("; ")}. The output is withheld: a tier hand runs only on its tier's row (DESIGN-2.0.md P-11 row 15). Re-dispatch the slice once a row model is usable.`;
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

	// Shared by every session this extension is bound to: the hand's own session records what
	// answered on it, and the lane's session reads that when the hand's output arrives. OMP binds
	// the parent's prepared factories into the child session in the same process
	// (task/executor.ts, preloadedPreparedExtensions), so the child's instance reaches this closure.
	const hands: Hand[] = [];
	/** Every `provider/id` that answered on a hand, first-seen order, by the hand's agent id. */
	const answered = new Map<string, string[]>();
	/** One verdict per hand, by agent id: an async delivery is re-read on every model request. */
	const verdicts = new Map<string, Verdict>();

	/** Could `agentId` be the agent OMP allocated for this hand's spawn? */
	const couldBe = (hand: Hand, agentId: string) => hand.spawnKey === agentId || spawnKeyNames(agentId, hand.sliceId);

	/**
	 * The one verdict on `agentId`'s hand: every model that answered on it (plus the model its task
	 * result reports, when there is one) against its tier row. Writes the dispatch's `routings` row.
	 */
	function settle(hand: Hand, agentId: string, reported: string | null): Verdict {
		hands.splice(hands.indexOf(hand), 1);
		const ran = [...new Set([...(answered.get(agentId) ?? []), ...(reported ? [reported] : [])])];
		answered.delete(agentId);
		const off = ran.filter(model => !hand.row.includes(model));
		const outcome: RoutingOutcome = ran.length === 0 ? "refused-model-unknown" : off.length > 0 ? "refused-out-of-row" : "ran";
		let refusal =
			outcome === "ran"
				? null
				: outcome === "refused-out-of-row"
					? `${agentId} ran on ${off.join(", ")}, outside the ${hand.tier} row (${hand.row.join(", ")})`
					: `${agentId}: no model that answered on it could be read, so it cannot be checked against the ${hand.tier} row (${hand.row.join(", ")})`;
		try {
			recordRouting(hand, hand.models, outcome, ran.length > 0 ? ran : null);
		} catch (error) {
			// The row is the record of what ran (SPEC-2.0.md § A1.3); output with no record is refused.
			refusal = `${refusal ? `${refusal}; ` : ""}${agentId}: its routing row could not be written (${message(error)})`;
		}
		const verdict = { outcome, refusal };
		verdicts.set(agentId, verdict);
		return verdict;
	}

	function recordRouting(hand: Pending & { tier: Tier; spawnKey: string | null }, models: string[], outcome: RoutingOutcome, ranModels: string[] | null) {
		const r = hand.routing;
		// SPEC-2.0.md § A1.3 step 4 and "record the pull-up on the slice's ledger row".
		deps.ledger().recordRouting({
			by: deps.laneId,
			workloadId: hand.workloadId,
			sliceId: hand.sliceId,
			spawnKey: hand.spawnKey,
			kind: r.kind,
			confidence: r.confidence,
			probabilities: r.probabilities,
			classifiedTier: r.classifiedTier,
			pullUpTo: (r.pullUp?.to ?? null) as Exclude<Tier, "fast"> | null,
			stakes: r.stakes,
			pullDownTo: (r.pullDown?.to ?? null) as Exclude<Tier, "deep"> | null,
			tier: hand.tier,
			models,
			outcome,
			ranModels,
			judgeModel: r.judgeModel,
		});
	}

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
				const spawnKey = event.spawnKey ?? null;
				if (models.length === 0) {
					let reason = `agent-system-2 classifier: no usable ${tier} model: ${skipped.join(", ")}`;
					try {
						if (found) recordRouting({ ...found, tier, spawnKey }, [], "refused-no-usable-model", null);
					} catch (error) {
						reason += `; its routing row could not be written (${message(error)})`;
					}
					return refuse(reason);
				}
				// The row is written at the verdict, once what answered on the hand is known (settle).
				if (found) hands.push({ ...found, spawnKey, tier, models, row: table[tier].map(modelIdentity) });
				return { model: models, note: routingNote(found?.routing ?? null, tier, models, skipped) };
			} catch (error) {
				return refuse(`agent-system-2 classifier could not route this spawn: ${message(error)}`);
			}
		});

		// The hand's own session: record every model that answers on it (step 3 in the header).
		pi.on("message_end", (event, ctx) => {
			const msg = event.message as { role?: string; provider?: string; model?: string };
			if (msg.role !== "assistant" || !msg.provider || !msg.model) return;
			const file = ctx.sessionManager.getSessionFile();
			if (!file) return;
			const agentId = basename(file, ".jsonl");
			if (!hands.some(hand => couldBe(hand, agentId))) return;
			const models = answered.get(agentId) ?? [];
			const model = identity(`${msg.provider}/${msg.model}`);
			if (!models.includes(model)) models.push(model);
			answered.set(agentId, models);
		});

		pi.on("tool_result", event => {
			if (event.toolName !== "task") return undefined;
			const details = (event.details ?? undefined) as { async?: unknown; results?: TaskResult[] } | undefined;
			// A failed or refused call spawns nothing more, and a finished blocking call has spawned all it
			// will: drop what it classified. A returned async call keeps its entries — they spawn later.
			const finished = event.isError || (details !== undefined && details.async === undefined);
			if (finished) {
				for (let i = pending.length - 1; i >= 0; i--) {
					if (pending[i]!.toolCallId === event.toolCallId) pending.splice(i, 1);
				}
			}

			// R2-B1 / R3: the tier row is the allowlist for every model that answered on a blocking hand,
			// whatever the final selection or a retry fallback did after the spawn check.
			const drift: string[] = [];
			for (const result of details?.results ?? []) {
				if (!isTier(result.agent) || !result.id) continue;
				const id = result.id;
				const hand =
					hands.find(h => h.spawnKey === id) ??
					hands.find(h => h.toolCallId === event.toolCallId && spawnKeyNames(id, h.sliceId));
				const verdict = hand ? settle(hand, id, reportedModel(result)) : verdicts.get(id);
				if (verdict) {
					if (verdict.refusal) drift.push(verdict.refusal);
					continue;
				}
				// A hand this extension did not spawn: check what the result reports, as round 2 did.
				const ran = reportedModel(result);
				if (!ran) continue;
				try {
					const row = deps.tierTable()[result.agent];
					if (!row.some(selector => modelIdentity(selector) === ran)) {
						drift.push(`${id} ran on ${ran}, outside the ${result.agent} row (${row.join(", ")})`);
					}
				} catch (error) {
					drift.push(`${id} could not be checked against the tier table (${message(error)})`);
				}
			}
			if (drift.length === 0) return undefined;
			return { isError: true, content: [{ type: "text" as const, text: withheld("task result", drift) }] };
		});

		// An async hand's output reaches the lane's model only as an `async-result` custom message in
		// the per-request context (session/async-job-delivery.ts; sdk.ts transformContext). The session
		// history keeps the original, so a refused delivery is replaced on every request.
		pi.on("context", event => {
			let changed = false;
			const messages = event.messages.map(msg => {
				const delivery = msg as { role?: string; customType?: string; details?: { jobs?: { jobId?: string }[] } };
				if (delivery.role !== "custom" || delivery.customType !== "async-result") return msg;
				const jobs = (delivery.details?.jobs ?? []).flatMap(job => (job.jobId ? [job.jobId] : []));
				const drift = jobs.flatMap(jobId => {
					const hand = hands.find(h => h.spawnKey === jobId);
					const refusal = (hand ? settle(hand, jobId, null) : verdicts.get(jobId))?.refusal;
					return refusal ? [refusal] : [];
				});
				if (drift.length === 0) return msg;
				changed = true;
				const what = jobs.length > 1 ? `async task delivery (jobs ${jobs.join(", ")}, delivered together)` : "async task result";
				return { ...msg, content: withheld(what, drift) } as typeof msg;
			});
			return changed ? { messages } : undefined;
		});
	};
}

/** Production wiring: the host's `judge` role, the active profile's config.yml, and the ledger. */
function productionExtension(): (pi: ExtensionAPI) => void {
	let configPath: string | undefined;
	let ledger: Ledger | undefined;
	// Host-package imports resolve to the running OMP (extensibility/plugins/legacy-pi-compat.ts);
	// they are dynamic because this checkout carries no OMP install to import from statically.
	const settingsFor = async (ctx: ExtensionContext) => {
		const { Settings } = await import("@oh-my-pi/pi-coding-agent/config/settings");
		return Settings.current ?? Settings.loadReadOnly({ cwd: ctx.cwd });
	};
	return createClassifierExtension({
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
	});
}

// One instance per process: the lane's session and its hands' sessions share the hand state.
let production: ((pi: ExtensionAPI) => void) | undefined;

export default function agentSystemClassifier(pi: ExtensionAPI): void {
	(production ??= productionExtension())(pi);
}
