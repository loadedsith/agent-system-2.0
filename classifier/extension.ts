/**
 * agent-system 2.0 pre-dispatch classifier (SPEC-2.0.md § A1.3; build question 1, DESIGN-2.0.md § D6).
 *
 * Per lane `task` call: brief → classifier → kind → tier → cap, then at spawn → model.
 *   1. `tool_call` on `task`: for each item whose `agent` names a dispatchable tier file, check the
 *      item names its ledger slice (`name: sl-…`, a slice of the brief's `workload:`; a `slice:` line
 *      and the session's bound workload, when present, must agree — SPEC-2.0.md § B9), reserve the
 *      slice, classify it, compute the tier (0.55 higher-of-top-two rule, stakes cap), and revise the
 *      call's input so the item's `agent` is the computed tier file (omp://extensions.md § Tool
 *      lifecycle). The slices are reserved before the judge is asked, so a second call on one of
 *      them is refused without a judge call; every classification of the call is published at
 *      once, only after all of them succeed.
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
 *      `provider/model` that answered on the hand, under the hand's session file path. Not
 *      `agent_end`: OMP fires the extension `agent_end` fire-and-forget
 *      (`void this.#emitAgentEndNotification`), so it is not ordered before the result, and it
 *      cannot withhold anything.
 *   4. Where the hand's output reaches the lane, every model that answered is checked against the
 *      tier row (one verdict per hand, `settle`): a blocking hand's `task` `tool_result` (plus the
 *      model the result reports), and an async hand's `async-result` delivery, which reaches the
 *      lane's model only through the per-request `context` event (sdk.ts transformContext). A hand
 *      that ran off its row, or whose models could not be read, has its output replaced by a
 *      refusal there. The verdict is the one `routings` row for the dispatch (ledger/src/index.ts
 *      recordRouting, schema v5: `outcome`, `ran_models`, and the hand's `session_root` + final
 *      `agent_id`); a spawn refused for no usable model writes its row at the refusal. The row is also
 *      shown as the spawn's routing note. A delivery this instance cannot correlate is checked against
 *      the one row for exactly its session root and agent id; a tier hand's output with no such row is
 *      withheld (fail closed).
 *
 * Hand identity (the contract every step above relies on). A hand's agent session file is
 * `<artifactsDir>/<agentId>.jsonl` (task/executor.ts:3366-3367), and its `artifactsDir` is the lane's
 * session file without `.jsonl` (task/structured-subagent.ts:416-418 leaseArtifacts). So a hand is
 * keyed by that full path: the lane's session root plus the agent id. Two lanes whose OMP output
 * managers each allocate `sl-one` (per-root allocation, astra review 3 B2) key two hands. The ledger
 * row carries the same two facts (`session_root`, `agent_id`: the id OMP finally allocated, which a
 * blocking spawn's key does not carry, task/structured-subagent.ts:658-671 then
 * task/output-manager.ts:84-90), so recovery after a restart matches exactly the hand it settled
 * (astra review 4 B1/S1). OMP never allocates one id twice under one root: its output manager seeds
 * the taken ids from the root's files on resume (task/output-manager.ts:20-22, :55-79).
 *
 * Items naming anything other than a tier file are left untouched for M4's refusal (P-11 row 4);
 * this extension never repairs a bad agent name.
 */
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { basename, dirname, join } from "node:path";
import { LANE_ENV, WORKLOAD_ENV } from "../gates/src/types";
import { type HostModules, hostSettings, readSetting } from "../gates/src/host";
import { Ledger, type RoutingOutcome } from "../ledger/src/index";
import { defaultLedgerPath } from "../ledger/src/locality";
import { briefField, briefSlice, briefStakes } from "./src/brief";
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
	/** The workload this session is bound to (`AGENT_SYSTEM_WORKLOAD_ID`, gates/src/types.ts), if any. */
	boundWorkload(): string | undefined;
	/** One-line diagnostics; the session's extension logger when absent. */
	log?(line: string): void;
}

/** One classified tier item, waiting for its spawn. */
interface Pending {
	toolCallId: string;
	/** The item's position in the call: `index` on OMP's per-member progress (task/index.ts:850-862). */
	index: number;
	/** The item's `name`: its ledger slice id, and the base of its spawn key. */
	sliceId: string;
	workloadId: string;
	routing: Routing & { probabilities: Record<string, number>; judgeModel: string };
	/** The agent id OMP allocated to an async member, once its call's result reports it (`progress[].id`). */
	agentId?: string;
}

/** A classification in flight: its reservations, and whether its answer may still be published. */
interface Attempt {
	toolCallId: string;
	/** Cleared when the turn ends with the attempt still awaiting (the runner stopped waiting for it). */
	live: boolean;
	abort: AbortController;
	reservations: { sliceId: string; toolCallId: string }[];
}

/** One member of a `task` call's `details.progress` (task/index.ts:858-877): its item, its allocated id, its state. */
type MemberProgress = { index?: number; id?: string; status?: string };

/**
 * A background job as a job-control snapshot reports it (async/job-control.ts:198-203): the `wait`
 * tool's `details.jobs` (tools/wait.ts:153) and a `proc://<id>/kill` write's `details.proc.jobs`
 * (internal-urls/proc-protocol.ts:177-184, tools/write.ts:1317). A task job's label is its agent id.
 */
type JobSnapshot = { type?: string; status?: string; label?: string };

/** A tier hand past its spawn check, waiting for the verdict on the models that answered on it. */
interface Hand extends Pending {
	/** The lane's artifacts directory: the hand's session file is `<root>/<agentId>.jsonl`. */
	root: string;
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

/**
 * A `task` tool result's `details` (TaskToolDetails, pi-tui/src/tools/task.ts:2012-2025): `async`
 * is present only on a call that returned with background jobs, and then it is an object
 * `{ state, jobId, type: "task" }` (task/index.ts:905-908), never a boolean.
 */
type TaskDetails = { async?: unknown; results?: TaskResult[]; progress?: MemberProgress[] };

/**
 * One job of an `async-result` delivery (session/async-job-delivery.ts:119-126). `jobId` is the job
 * manager's id, which it suffixes on a collision (async/job-manager.ts:338 #resolveJobId), so it is
 * not the hand's agent id. `label` is: a task job is registered with the agent id as its label
 * (task/index.ts:1110-1112 `manager.register("task", agentId, …)`; async/job-manager.ts:351).
 */
type DeliveredJob = { jobId?: string; type?: string; label?: string };

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
 * The lane's artifacts directory, where OMP writes its hands' session files (session/session-manager.ts
 * artifactsDirectoryFor: the session file without `.jsonl`). `null` for a session with no file.
 */
function laneRoot(ctx: ExtensionContext): string | null {
	const file = ctx.sessionManager.getSessionFile();
	return file?.endsWith(".jsonl") ? file.slice(0, -".jsonl".length) : null;
}

/** A hand's key: its own session file (task/executor.ts:3366-3367 `<artifactsDir>/<id>.jsonl`). */
const handKey = (root: string, agentId: string) => join(root, `${agentId}.jsonl`);

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
	// Every key carries the lane's session root (header, "Hand identity").
	const hands: Hand[] = [];
	/** Every `provider/id` that answered on a hand, first-seen order, by the hand's session file. */
	const answered = new Map<string, string[]>();
	/** One verdict per hand, by its session file: an async delivery is re-read on every model request. */
	const verdicts = new Map<string, Verdict>();

	/** Could `agentId` be the agent OMP allocated for this hand's spawn? */
	const couldBe = (hand: Hand, agentId: string) => hand.spawnKey === agentId || spawnKeyNames(agentId, hand.sliceId);

	/**
	 * The one verdict on `agentId`'s hand: every model that answered on it (plus the model its task
	 * result reports, when there is one) against its tier row. Writes the dispatch's `routings` row.
	 * No assistant turn seen in the hand's session means its models are unknown, whatever the result
	 * reports: the output is withheld (triad row 8).
	 */
	function settle(hand: Hand, agentId: string, reported: string | null, log: (line: string) => void): Verdict {
		hands.splice(hands.indexOf(hand), 1);
		const key = handKey(hand.root, agentId);
		const seen = answered.get(key) ?? [];
		answered.delete(key);
		const ran = seen.length === 0 ? [] : [...new Set([...seen, ...(reported ? [reported] : [])])];
		const off = ran.filter(model => !hand.row.includes(model));
		const outcome: RoutingOutcome = ran.length === 0 ? "refused-model-unknown" : off.length > 0 ? "refused-out-of-row" : "ran";
		if (seen.length === 0) {
			log(`agent-system-2 classifier: no assistant message_end was seen in session ${key} for hand ${agentId}; its output is withheld as refused-model-unknown`);
		}
		let refusal =
			outcome === "ran"
				? null
				: outcome === "refused-out-of-row"
					? `${agentId} ran on ${off.join(", ")}, outside the ${hand.tier} row (${hand.row.join(", ")})`
					: `${agentId}: no model that answered on it could be read${reported ? ` (its result reports ${reported}, but no turn was seen in ${key})` : ""}, so it cannot be checked against the ${hand.tier} row (${hand.row.join(", ")})`;
		try {
			recordRouting(hand, hand.models, outcome, ran.length > 0 ? ran : null, agentId);
		} catch (error) {
			// The row is the record of what ran (SPEC-2.0.md § A1.3); output with no record is refused.
			refusal = `${refusal ? `${refusal}; ` : ""}${agentId}: its routing row could not be written (${message(error)})`;
		}
		const verdict = { outcome, refusal };
		verdicts.set(key, verdict);
		return verdict;
	}

	/**
	 * The verdict for a hand this instance holds no state on — a delivery replayed after the process
	 * or the factory was recreated, or one it cannot match: the one ledger row this lane wrote for
	 * exactly this session root and this allocated agent id (astra review 4 B1/S1). Its slice comes
	 * from that row; nothing is inferred from the id's shape. `null` when the agent id is not
	 * `[<parent>.]sl-…` — tier dispatches are named after their slice and slice ids are `sl-…`
	 * (ledger/schema.sql slices.id GLOB 'sl-?*') — so the job is not a tier hand. A tier hand with no
	 * row, more than one, or a ledger that cannot be read, is refused.
	 */
	function recover(root: string, agentId: string): Verdict | null {
		const key = handKey(root, agentId);
		const known = verdicts.get(key);
		if (known) return known;
		if (!agentId.slice(agentId.lastIndexOf(".") + 1).startsWith("sl-")) return null;
		let verdict: Verdict;
		try {
			const rows = deps.ledger().routingsForHand(root, agentId).filter(r => r.created_by === deps.laneId);
			const row = rows[0];
			verdict = !row
				? {
						outcome: "refused-model-unknown",
						refusal: `${agentId}: no settled routing row from lane ${deps.laneId} names session root ${root} and agent id ${agentId}, so the models that answered on it are unknown`,
					}
				: rows.length > 1
					? { outcome: "refused-model-unknown", refusal: `${agentId}: ${rows.length} routing rows (${rows.map(r => r.id).join(", ")}) name session root ${root} and this agent id, so which one is its verdict is unknown` }
					: row.outcome !== "ran"
						? { outcome: row.outcome, refusal: `${agentId}: its routing row ${row.id} (slice ${row.slice_id}) records ${row.outcome}${row.ran_models ? ` on ${JSON.parse(row.ran_models).join(", ")}` : ""}` }
						: { outcome: "ran", refusal: null };
		} catch (error) {
			return { outcome: "refused-model-unknown", refusal: `${agentId}: the ledger could not be read to check it (${message(error)})` };
		}
		verdicts.set(key, verdict);
		return verdict;
	}

	/** `agentId`: the id OMP finally allocated to the hand; null for a spawn refused before any hand ran. */
	function recordRouting(
		hand: Pending & { tier: Tier; spawnKey: string | null; root: string },
		models: string[],
		outcome: RoutingOutcome,
		ranModels: string[] | null,
		agentId: string | null,
	) {
		const r = hand.routing;
		// SPEC-2.0.md § A1.3 step 4 and "record the pull-up on the slice's ledger row".
		deps.ledger().recordRouting({
			by: deps.laneId,
			workloadId: hand.workloadId,
			sliceId: hand.sliceId,
			spawnKey: hand.spawnKey,
			sessionRoot: hand.root,
			agentId,
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
		/** Slices of calls still being classified: held before the judge is asked (triad row 5). */
		const reserved: { sliceId: string; toolCallId: string }[] = [];
		/** Classifications in flight, each owning its reservations (astra review 4 S3). */
		const attempts = new Set<Attempt>();
		/** Calls whose `tool_result` arrived: only these may keep pending entries past the turn. */
		const returned = new Set<string>();
		const log = (line: string) => (deps.log ? deps.log(line) : pi.logger?.warn(line));
		/**
		 * Drop an attempt's own reservations. By identity: a retired attempt's `finally` runs after the
		 * turn already released its reservations, and must not remove a newer attempt's.
		 */
		const release = (attempt: Attempt) => {
			for (const r of attempt.reservations) {
				const at = reserved.indexOf(r);
				if (at >= 0) reserved.splice(at, 1);
			}
		};
		/**
		 * An async member whose job ended before its hand spawned: nothing will spawn for its entry, so
		 * release its slice. Matched by the exact agent id OMP allocated (from its call's progress).
		 */
		const dropUnspawned = (agentId: string, why: string) => {
			for (let i = pending.length - 1; i >= 0; i--) {
				if (pending[i]!.agentId !== agentId) continue;
				log(`agent-system-2 classifier: ${agentId} (slice ${pending[i]!.sliceId}, call ${pending[i]!.toolCallId}) ${why} before its hand spawned; its slice is released`);
				pending.splice(i, 1);
			}
		};

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
			if (!laneRoot(ctx)) {
				return fail("this session has no session file, so its hands' sessions (<lane session>/<agent id>.jsonl) cannot be found and the models that answer on them cannot be checked");
			}

			// Every routing lands on its slice's ledger row (ruling 2026-09-28), so each tier item
			// names its slice; check that before spending a judge call.
			const problems: string[] = [];
			const targets: { item: TaskItem; index: number; sliceId: string; workloadId: string }[] = [];
			const bound = deps.boundWorkload();
			const waiting = () => [
				...pending.map(p => ({ sliceId: p.sliceId, where: `call ${p.toolCallId}` })),
				...reserved.map(r => ({ sliceId: r.sliceId, where: `call ${r.toolCallId}, still being classified` })),
			];
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
					// Triad row 7: one identity fact, one value. The dispatch's `name` is the slice; a `slice:`
					// line the gates read says the same, and the brief names the workload this session is bound to.
					const declaredSlice = briefSlice(item.task, context);
					if (declaredSlice !== null && declaredSlice !== sliceId) {
						problems.push(`${at}: the brief's \`slice: ${declaredSlice}\` is not the dispatch's \`name\` (${sliceId}); the name is the slice id (SPEC-2.0.md § B9)`);
						continue;
					}
					if (bound && workloadId !== bound) {
						problems.push(`${at}: the brief's \`workload: ${workloadId}\` is not the workload this session is bound to (${WORKLOAD_ENV}=${bound})`);
						continue;
					}
					if (ledger.slice(sliceId)?.workload_id !== workloadId) {
						problems.push(`${at}: \`${sliceId}\` is not a slice of workload ${workloadId} in the ledger`);
						continue;
					}
					// R2-B2: the spawn event carries no per-dispatch identity, only a key derived from the name.
					const conflict =
						spawnKeyConflict(sliceId, targets.map(t => ({ sliceId: t.sliceId, where: `task ${t.index + 1}` })), "") ??
						spawnKeyConflict(sliceId, waiting(), "pending ");
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

			// Reserve before the first await: nothing else runs between the check above and this push,
			// so an overlapping call on one of these slices is refused by that check, not by a late one.
			const attempt: Attempt = {
				toolCallId: event.toolCallId,
				live: true,
				abort: new AbortController(),
				reservations: targets.map(t => ({ sliceId: t.sliceId, toolCallId: event.toolCallId })),
			};
			reserved.push(...attempt.reservations);
			attempts.add(attempt);
			// OMP's runner races a handler against its timeout and stops waiting, but the handler runs on
			// (extensibility/extensions/runner.ts:224-235, :250-325): after every await, a retired attempt
			// stops before it publishes anything.
			const retired = () =>
				new Error(`call ${event.toolCallId} was retired at the end of its turn while still being classified; its late classification is discarded`);
			try {
				const judge = await deps.judge(ctx);
				if (!attempt.live) throw retired();
				const classified = await Promise.all(
					targets.map(async ({ item, index, sliceId, workloadId }): Promise<Pending> => {
						const classification = await classify(item.task ?? "", judge, deps.question, attempt.abort.signal);
						if (!attempt.live) throw retired();
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
							index,
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
				if (!attempt.live) throw retired();
				// Publish the whole call at once; its reservations become pending entries.
				pending.push(...classified);
				const tierAt = new Map(classified.map((entry, i) => [targets[i]!.index, entry.routing.tier]));
				const revised = items.map((item, index) => (tierAt.has(index) ? { ...item, agent: tierAt.get(index)! } : item));
				return { input: batch ? { ...input, tasks: revised } : revised[0]! };
			} catch (error) {
				// SPEC-2.0.md § A1.3: a dispatch the classifier could not route is refused, not sent on
				// an unclassified guess. Nothing was published, so late answers have nowhere to land.
				attempt.abort.abort();
				if (!attempt.live) log(`agent-system-2 classifier: ${message(error)}`);
				return fail(message(error));
			} finally {
				attempts.delete(attempt);
				release(attempt);
			}
		});

		pi.on("before_subagent_spawn", async (event, ctx) => {
			if (!isTier(event.agent)) return undefined;
			const tier = event.agent;
			// A throwing handler must not let the spawn through on the native row: every failure refuses.
			try {
				const table = deps.tierTable();

				let found: Pending | null = null;
				const root = laneRoot(ctx);
				if (event.invocationKind === "task") {
					// A member whose allocated id its call's result already reported matches on that id alone.
					const matches = event.spawnKey
						? pending.filter(p => (p.agentId !== undefined ? p.agentId === event.spawnKey : spawnKeyNames(event.spawnKey!, p.sliceId)))
						: [];
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
					if (!root) return refuse(`agent-system-2 classifier: spawn ${event.spawnKey}: the lane has no session file, so the hand's models could not be checked`);
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
						if (found && root) recordRouting({ ...found, tier, spawnKey, root }, [], "refused-no-usable-model", null, null);
					} catch (error) {
						reason += `; its routing row could not be written (${message(error)})`;
					}
					return refuse(reason);
				}
				// The row is written at the verdict, once what answered on the hand is known (settle).
				if (found && root) hands.push({ ...found, root, spawnKey, tier, models, row: table[tier].map(modelIdentity) });
				return { model: models, note: routingNote(found?.routing ?? null, tier, models, skipped) };
			} catch (error) {
				return refuse(`agent-system-2 classifier could not route this spawn: ${message(error)}`);
			}
		});

		// The hand's own session: record every model that answers on it (step 3 in the header). The
		// agent id is the session file's base name and the lane's root its directory ("Hand identity").
		pi.on("message_end", (event, ctx) => {
			const msg = event.message as { role?: string; provider?: string; model?: string };
			if (msg.role !== "assistant" || !msg.provider || !msg.model) return;
			const file = ctx.sessionManager.getSessionFile();
			if (!file?.endsWith(".jsonl")) return;
			const root = dirname(file);
			const agentId = basename(file, ".jsonl");
			if (!hands.some(hand => hand.root === root && couldBe(hand, agentId))) return;
			const models = answered.get(file) ?? [];
			const model = identity(`${msg.provider}/${msg.model}`);
			if (!models.includes(model)) models.push(model);
			answered.set(file, models);
		});

		pi.on("tool_result", (event, ctx) => {
			if (event.toolName !== "task") {
				// A queued task job can end before its hand spawns: cancelled (async/job-manager.ts:417-424,
				// no delivery follows) or aborted before execution (task/index.ts:1129-1142). A job snapshot
				// in any tool's result — `wait`, or a `proc://<id>/kill` write — reports it (JobSnapshot).
				const snapshot = (event.details ?? undefined) as { jobs?: unknown; proc?: { jobs?: unknown } } | undefined;
				for (const job of [snapshot?.jobs, snapshot?.proc?.jobs].flatMap(list => (Array.isArray(list) ? (list as JobSnapshot[]) : []))) {
					if (job?.type === "task" && job.status !== "running" && typeof job.label === "string") dropUnspawned(job.label, `ended ${job.status}`);
				}
				return undefined;
			}
			returned.add(event.toolCallId);
			const details = (event.details ?? undefined) as TaskDetails | undefined;
			// A failed or refused call spawns nothing more, and a finished blocking call has spawned all it
			// will: drop what it classified. Only a call that returned background jobs (`details.async` is
			// OMP's job object) keeps its entries — they spawn later. Anything else, `async: false` included,
			// is finished (triad row 9).
			const asyncCall = typeof details?.async === "object" && details.async !== null;
			if (event.isError || !asyncCall) {
				for (let i = pending.length - 1; i >= 0; i--) {
					if (pending[i]!.toolCallId === event.toolCallId) pending.splice(i, 1);
				}
			} else {
				// Astra review 4 S2: an async call reports each member (task/index.ts:896-910). A member whose
				// job could not be scheduled is `failed` and never spawns (:914-938); release it. Every other
				// member keeps its entry, now bound to the agent id OMP allocated for it.
				const members = Array.isArray(details?.progress) ? details.progress : [];
				for (let i = pending.length - 1; i >= 0; i--) {
					const entry = pending[i]!;
					if (entry.toolCallId !== event.toolCallId) continue;
					const member = members.find(m =>
						typeof m?.index === "number" ? m.index === entry.index : typeof m?.id === "string" && spawnKeyNames(m.id, entry.sliceId),
					);
					if (typeof member?.id !== "string") continue;
					entry.agentId = member.id;
					if (member.status === "failed" || member.status === "aborted") {
						log(`agent-system-2 classifier: ${member.id} (slice ${entry.sliceId}, call ${event.toolCallId}) was not scheduled (${member.status}); its slice is released`);
						pending.splice(i, 1);
					}
				}
			}

			// R2-B1 / R3: the tier row is the allowlist for every model that answered on a blocking hand,
			// whatever the final selection or a retry fallback did after the spawn check.
			const root = laneRoot(ctx);
			const drift: string[] = [];
			for (const result of details?.results ?? []) {
				if (!isTier(result.agent) || !result.id) continue;
				const id = result.id;
				if (!root) {
					drift.push(`${id}: the lane has no session file, so the models that answered on it cannot be read`);
					continue;
				}
				const hand =
					hands.find(h => h.root === root && h.spawnKey === id) ??
					hands.find(h => h.root === root && h.toolCallId === event.toolCallId && spawnKeyNames(id, h.sliceId));
				const verdict = hand ? settle(hand, id, reportedModel(result), log) : recover(root, id);
				// A tier result this extension cannot place is refused, never passed (triad row 8).
				const refusal = verdict ? verdict.refusal : `${id}: no classified hand or routing row matches this ${result.agent} result`;
				if (!verdict) log(`agent-system-2 classifier: tier result ${id} matches no hand or routing row; withheld`);
				if (refusal) drift.push(refusal);
			}
			if (drift.length === 0) return undefined;
			return { isError: true, content: [{ type: "text" as const, text: withheld("task result", drift) }] };
		});

		// Triad row 4: a `task` call blocked by a later extension's `tool_call` handler never executes, so it
		// never gets a `tool_result` (extensibility/extensions/runner.ts emitToolCall returns at the first
		// block; pi-agent-core agent-loop.ts prepareToolCallDispatch marks it blocked and the run throws
		// before `tool.execute`, which is where extensions/wrapper.ts emits `tool_result`). A turn ends only
		// after its tool calls ran (agent-loop.ts emitTurnEnd after executeToolCalls; the session awaits
		// the extension `turn_end`, session/agent-session.ts #emitSessionEvent), so a pending entry whose
		// call has no result by then was never dispatched: release its slice. For the same reason a
		// classification still in flight belongs to a call the runner stopped waiting for (its handler
		// timed out, runner.ts:1310-1369): retire it, so a late judge answer publishes nothing, and
		// release its reservations now (astra review 4 S3).
		pi.on("turn_end", () => {
			for (const attempt of attempts) {
				attempt.live = false;
				attempt.abort.abort();
				release(attempt);
				log(`agent-system-2 classifier: call ${attempt.toolCallId} was still being classified at the end of its turn; it is retired and its slices are released`);
			}
			attempts.clear();
			for (let i = pending.length - 1; i >= 0; i--) {
				if (!returned.has(pending[i]!.toolCallId)) pending.splice(i, 1);
			}
			for (const id of returned) if (!pending.some(p => p.toolCallId === id)) returned.delete(id);
		});

		// An async hand's output reaches the lane's model only as an `async-result` custom message in
		// the per-request context (session/async-job-delivery.ts; sdk.ts transformContext). The session
		// history keeps the original, so a refused delivery is replaced on every request — by this
		// instance from memory, by a recreated one from the ledger rows (`recover`).
		pi.on("context", (event, ctx) => {
			const root = laneRoot(ctx);
			let changed = false;
			const messages = event.messages.map(msg => {
				const delivery = msg as { role?: string; customType?: string; details?: { jobs?: DeliveredJob[] } };
				if (delivery.role !== "custom" || delivery.customType !== "async-result") return msg;
				const jobs = (delivery.details?.jobs ?? []).filter(job => job.type === "task");
				const drift = jobs.flatMap(job => {
					// The agent id is the job's label; `jobId` may carry a collision suffix (astra review 3 B1).
					const agentId = job.label;
					if (!agentId) return [`job ${job.jobId ?? "(no id)"}: the delivery names no agent id, so its models cannot be checked`];
					if (!root) return [`${agentId}: the lane has no session file, so the models that answered on it cannot be read`];
					const hand = hands.find(h => h.root === root && h.spawnKey === agentId);
					if (!hand && pending.some(p => p.agentId === agentId)) {
						// Its job ended before its hand spawned (a failed job is delivered, async/job-manager.ts:396-400):
						// no model ran on it. Release the slice; the job's text is withheld like any unrecorded hand's.
						dropUnspawned(agentId, "ended");
						verdicts.set(handKey(root, agentId), {
							outcome: "refused-model-unknown",
							refusal: `${agentId}: its job ended before its hand spawned, so no model ran on it and there is no routing row for it`,
						});
					}
					const refusal = (hand ? settle(hand, agentId, null, log) : recover(root, agentId))?.refusal;
					return refusal ? [refusal] : [];
				});
				if (drift.length === 0) return msg;
				changed = true;
				const ids = jobs.map(job => job.label ?? job.jobId ?? "(no id)");
				const what = jobs.length > 1 ? `async task delivery (agents ${ids.join(", ")}, delivered together)` : "async task result";
				return { ...msg, content: withheld(what, drift) } as typeof msg;
			});
			return changed ? { messages } : undefined;
		});
	};
}

/** Production wiring: the host's `judge` role, the active profile's config.yml, and the ledger. */
function productionExtension(): (pi: ExtensionAPI) => void {
	let agentDir: string | undefined;
	let ledger: Ledger | undefined;
	// Host-package imports are dynamic because this checkout carries no OMP install to import from
	// statically. OMP's legacy-pi-compat (extensibility/plugins/legacy-pi-compat.ts) serves a
	// bare `@oh-my-pi/*` specifier the running host's own in-process module, but only in modules it
	// reaches from the extension entry through relative imports; a module reached by an absolute-path
	// import resolves the specifier through bun instead, which picks its auto-install cache
	// (2026-09-29: pi-coding-agent@18.4.4, native addon missing, so the load fails). Measured live in
	// `omp -e` with that cache present: entry, `./x` and `../dir/x` got the host module
	// (`Settings.current` set), the absolute-path twin failed (M4b classifier-host probe). So these
	// imports stay in this entry file: moved to a module an absolute path reaches, or resolved to an
	// absolute `src/` path, they load a second copy of OMP (no `Settings.current`) or fail outright.
	// The reads themselves go through gates/src/host.ts (M4b fix 4): OMP 18.4.4 has no `Settings.get`,
	// a setting is read through its registered handle, and a host off the verified major.minor throws.
	const host = async (): Promise<HostModules> => {
		const [{ VERSION }, { Settings }, { lookup }] = await Promise.all([
			import("@oh-my-pi/pi-utils/dirs"),
			import("@oh-my-pi/pi-coding-agent/config/settings"),
			import("@oh-my-pi/pi-coding-agent/config/registry"),
		]);
		return { version: VERSION, Settings, lookup };
	};
	const settingsFor = async (ctx: ExtensionContext) => {
		const h = await host();
		return { host: h, settings: await hostSettings(h, ctx.cwd) };
	};
	const classifier = createClassifierExtension({
		question: loadKindQuestion(),
		calibration: loadCalibration(),
		laneId: process.env[LANE_ENV] || `lane-${process.pid}`,
		boundWorkload: () => process.env[WORKLOAD_ENV] || undefined,
		ledger: () => (ledger ??= Ledger.open(defaultLedgerPath(process.env))),
		async judge(ctx) {
			// Same entry-module rule as settingsFor above.
			const [{ settings }, { resolveJudge }] = await Promise.all([
				settingsFor(ctx),
				import("@oh-my-pi/pi-coding-agent/judgment/index"),
			]);
			return resolveJudge({ settings: settings as never, registry: ctx.modelRegistry }) as unknown as KindJudge;
		},
		async disabledProviders(ctx) {
			// The same read OMP's final selection makes (config/model-resolver.ts resolveModelOverrideWithAuthFallback).
			const { host: h, settings } = await settingsFor(ctx);
			const disabled = readSetting(h, settings, "disabledProviders");
			if (!Array.isArray(disabled)) throw new Error(`disabledProviders read as ${JSON.stringify(disabled)}, not an array`);
			return [...new Set(disabled.filter((p): p is string => typeof p === "string"))];
		},
		tierTable() {
			if (!agentDir) {
				throw new Error("the profile's agent directory was not read at session start, so its config.yml tier table cannot be found");
			}
			return loadTierTable(join(agentDir, "config.yml"));
		},
	});
	return pi => {
		// The host serves `@oh-my-pi/pi-utils` as an async module, which `require()` cannot load
		// (live: `require() async module "omp-legacy-pi-bundled:@oh-my-pi/pi-utils" is unsupported`),
		// so the agent dir is read once here, awaited before any tool call (modes/runtime-init.ts,
		// task/executor.ts `await … emit({ type: "session_start" })`), and the spawn check stays synchronous.
		pi.on("session_start", async () => {
			agentDir ??= (await import("@oh-my-pi/pi-utils")).getAgentDir();
		});
		classifier(pi);
	};
}

/**
 * One instance per process: the lane's session and its hands' sessions share the hand state. That
 * holds because OMP runs a hand's session in the lane's process and binds the lane's already-prepared
 * extension factories into it rather than re-importing them: task/executor.ts:3796 passes
 * `preloadedPreparedExtensions` into the child's session options and :3875-3878 creates the child
 * with `createAgentSession` in-process; sdk.ts:2250-2261 binds those prepared factories
 * (`bindPreparedExtensions`) instead of loading the module again (verified in astra review 3).
 */
let production: ((pi: ExtensionAPI) => void) | undefined;

export default function agentSystemClassifier(pi: ExtensionAPI): void {
	(production ??= productionExtension())(pi);
}
