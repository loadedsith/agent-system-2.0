// The lane's ledger tools (DESIGN-lane-launcher.md decision 4, § 4 row "Lane ledger tools"): the
// eight writes a lane makes to its own workload, each through the ledger module as the lane
// (P-11 row 10), registered on every session and inert on the orchestrator. A bash CLI cannot do
// this from inside a lane — the M4b fence denies the SQLite write at the OS level — and the by-hand
// script did it from outside OMP; these tools are that script's writes, with the checks the file
// cannot make: the caller is the bound lane, it holds the workload under a live lease, and it has
// not released. Bodies opening with a reserved control prefix (surface/src/launch.ts § 5) are
// refused rather than interpreted, so a model-authored line can never read as machinery; the one
// exception is `done-because:` through `lane_record_entry` (decision 16, the holder's receipt).
// `lane_message` also refuses the pushed signal prefixes (surface/src/signals.ts): a false death or
// a false pass must not reach Jo. `lane_release` and `lane_handoff` are terminal: they set the lane
// row's released flag (surface/extensions/lane.ts markReleased), refuse every later lane tool, and
// end the session through `ctx.shutdown` (§ 7 item 6; host contract pinned in gates/src/host.ts).
// `lane_withdraw_reserved` closes a held `reserved-request` the lane has gone past (MIGRATION.md
// item 31): row 6 holds a reserved action on every run, so an approval admits no re-run.
// `lane_raise_question` also holds a plan question offering `approve` until another lab has reviewed
// the plan (PLAN wl-mupu0sx2o046io D8), read from the ledger with the classifier's own rule.
import { builderLabs, isBuilder, isReviewRouting, labOf, parkQuestions, settledTokens, spentGrants, withheldTokens } from "../../classifier/src/lab";
import { countRounds, parseReviewLimit } from "../../classifier/src/rounds";
import { gateSession } from "../../gates/src/session";
import type { Ledger, QuestionRow, RoutingRow, WorkloadStatusRow } from "../../ledger/src/index";
import { reservedStates } from "../src/errors";
import { controlEntries, heldLive, holdersOf, JO_HOLDER, planFirst, planSlice, reservedPrefix } from "../src/launch";
import {
	ARTIFACT_COMMAND_PREFIX, ARTIFACT_FAILED_PREFIX, ARTIFACT_PASSED_PREFIX, type Ctx, LANE_ADD_SLICE_TOOL, LANE_COMPLETE_SLICE_TOOL,
	LANE_DIED_PREFIX, LANE_HANDOFF_TOOL, LANE_MESSAGE_TOOL, LANE_RAISE_QUESTION_TOOL, LANE_RECORD_ENTRY_TOOL, LANE_RELEASE_TOOL,
	LANE_WITHDRAW_RESERVED_TOOL, ORCHESTRATOR_RECIPIENT, PROMPT_RESOLVED_PREFIX, PROMPT_WAIT_PREFIX, type SurfaceAPI, type ToolResult,
} from "../src/types";
import { isReleased, markReleased } from "./lane";

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });

/** Message bodies the machinery writes and the surface reads as signals; a lane's own message must not open with one. */
const PUSHED_SIGNAL_PREFIXES = [LANE_DIED_PREFIX, PROMPT_WAIT_PREFIX, PROMPT_RESOLVED_PREFIX, ARTIFACT_FAILED_PREFIX, ARTIFACT_PASSED_PREFIX];

/** The slice kinds `lane_add_slice` takes; the routing kinds, so the plan slice is `judge` (SPEC § B6). */
const SLICE_KINDS = ["locate", "understand", "change-small", "change-large", "judge"] as const;

interface Owned {
	ledger: Ledger;
	workload: WorkloadStatusRow;
	laneId: string;
	workloadId: string;
}
type Ownership = { ok: true; own: Owned } | { ok: false; result: ToolResult };

/** D8's refusal: what the lane does instead. */
export const planReviewRefusal = (planId: string) =>
	`a plan goes to Jo only after a review by another lab: dispatch a review hand named ${planId} on the plan, then raise the question naming its verdict`;

/**
 * PLAN wl-mupu0sx2o046io D8: has the plan slice `planId` a review that clears a question offering
 * `approve`? A `routings` row that (1) is on the plan slice and is a review (D2 read-back); (2) ran,
 * its `hand-settled:` token has no `review-withheld:`, and every model that answered is on a lab
 * outside `builderLabs` computed now (no live set: an in-flight hand counts every lab of its row), or
 * its token spent a `review-same-lab:` grant that is Jo's `same-lab` answer to a `review-park:`
 * question of this slice; (3) was created after the newest earlier question on the plan slice was
 * raised and resolved (an open one clears nothing). A `review-limit:` question Jo answered `accept`
 * does not reset (3) to its own resolution; when the newest one raised since that resolution
 * exists, the plan clears only on the rows of the round that hit its limit (check 2 still applying)
 * or on a review created after Jo's accept: an older round of that loop does not stand in for it.
 * A row with no `hand-settled:` token is not cleared: nothing proves it was not withheld.
 */
export function planReviewed(ledger: Ledger, workloadId: string, planId: string): boolean {
	const entries = ledger.entries(workloadId);
	const instructions = new Map(ledger.instructions(workloadId).map((i) => [i.id, i]));
	const limitAt = new Map<string, number>();
	entries.forEach((e, at) => {
		const limit = e.kind === "assumption" ? parseReviewLimit(e.body) : null;
		if (limit && limit.slice === planId && !limitAt.has(limit.questionId)) limitAt.set(limit.questionId, at);
	});
	const acceptedLimit = (q: QuestionRow) => {
		const a = q.state === "answered" && q.resolved_by !== null ? instructions.get(q.resolved_by) : undefined;
		return limitAt.has(q.id) && a?.kind === "answer" && a.author === JO_HOLDER && a.body.trim().toLowerCase() === "accept";
	};
	const questions = ledger.questions(workloadId).filter((q) => q.slice_id === planId);
	const last = questions.filter((q) => !acceptedLimit(q)).at(-1);
	if (last?.state === "open") return false;
	const since = last?.changed_at ?? "";
	const settled = settledTokens(entries);
	const tokenOf = new Map([...settled].map(([token, routing]) => [routing, token]));
	// D8 × D9: the rows of the round Jo accepted at its limit, the newest such question since `since`.
	const accepted = questions.filter((q) => acceptedLimit(q) && q.created_at > since).at(-1);
	const acceptedRows = new Set<string>();
	for (const m of accepted ? countRounds(entries.slice(0, limitAt.get(accepted.id)), planId).rounds.at(-1)?.members ?? [] : []) {
		const routing = settled.get(m.token);
		if (routing) acceptedRows.add(routing);
	}
	const fresh = accepted?.changed_at ?? since;
	const parks = parkQuestions(entries, planId);
	const granted = new Set<string>();
	for (const [grant, token] of spentGrants(entries)) {
		const i = instructions.get(grant);
		if (i?.kind === "answer" && i.author === JO_HOLDER && i.question_id !== null && parks.has(i.question_id) && i.body === "same-lab") granted.add(token);
	}
	const withheld = withheldTokens(entries);
	const builders = builderLabs(ledger, workloadId);
	return ledger.routings(workloadId).some((row) => {
		if (row.slice_id !== planId || !isReviewRouting(row) || row.outcome !== "ran") return false;
		const token = tokenOf.get(row.id);
		if (token === undefined || withheld.has(token)) return false;
		const ran = ranModels(row);
		const crossLab = ran.length > 0 && ran.every((m) => {
			const lab = labOf(m);
			return lab !== null && !isBuilder(builders, lab);
		});
		if (!crossLab && !granted.has(token)) return false;
		return row.created_at > fresh || acceptedRows.has(row.id);
	});
}

function ranModels(row: Pick<RoutingRow, "ran_models">): string[] {
	if (row.ran_models === null) return [];
	try {
		const list: unknown = JSON.parse(row.ran_models);
		return Array.isArray(list) ? list.filter((m): m is string => typeof m === "string") : [];
	} catch {
		return [];
	}
}

export default function laneToolsRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;

	/** Every lane tool's gate: a bound lane, not released, whose workload is open and held by it under a live lease. */
	const owned = (ctx: Ctx, verb: string): Ownership => {
		const s = gateSession(ctx, env);
		if (!s.bound) return { ok: false, result: text(`This session is not a lane bound to a workload; nothing was ${verb}.`) };
		if (isReleased(ctx)) return { ok: false, result: text(`This lane released ${s.workloadId} (or handed it to Jo); its work is over and nothing was ${verb}.`) };
		const ledger = s.ledger();
		const w = ledger.workload(s.workloadId!);
		if (!w) return { ok: false, result: text(`No workload ${s.workloadId}; nothing was ${verb}.`) };
		if (w.status !== "open") return { ok: false, result: text(`Workload ${w.id} is ${w.status}; nothing was ${verb}.`) };
		if (w.holder !== s.laneId || !heldLive(w, ledger.now())) {
			const who = w.holder === null ? "nobody" : w.holder === s.laneId ? `${s.laneId} under a lapsed lease` : w.holder;
			return { ok: false, result: text(`Workload ${w.id} is held by ${who}, not by this lane (${s.laneId}) under a live lease; nothing was ${verb}.`) };
		}
		return { ok: true, own: { ledger, workload: w, laneId: s.laneId, workloadId: w.id } };
	};

	/** A slice on this lane's workload that is still open or paused, or the refusal. */
	const sliceOn = (own: Owned, slice: string, verb: string): { ok: true; state: string } | { ok: false; result: ToolResult } => {
		const row = own.ledger.slice(slice);
		if (!row || row.workload_id !== own.workloadId) return { ok: false, result: text(`Slice ${slice} is not on workload ${own.workloadId}; nothing was ${verb}.`) };
		if (row.state === "done" || row.state === "cancelled") return { ok: false, result: text(`Slice ${slice} is ${row.state}; nothing was ${verb}.`) };
		return { ok: true, state: row.state };
	};

	const reserved = (body: string, verb: string): ToolResult | null => {
		const p = reservedPrefix(body);
		return p === null ? null : text(`A body opening with \`${p}:\` is a reserved control line the machinery writes; nothing was ${verb}. Say it in plain words.`);
	};

	/** The terminal pair's shared ending: mark released, stop the renewal timer, end the session (ctx.shutdown is host contract, gates/src/host.ts HOST_MEMBERS). */
	const endSession = (ctx: Ctx): string => {
		markReleased(ctx);
		ctx.shutdown();
		return "This session is ending.";
	};

	pi.registerTool({
		name: LANE_ADD_SLICE_TOOL,
		loadMode: "essential",
		label: "Add Slice",
		description:
			"Add a slice to this lane's workload: what to do, the done condition (what is true when it is done), and the inputs it needs. " +
			"`kind` is the routing kind of the work; while the workload is plan-first (a `plan:` line in the brief) only a `judge` slice — the plan slice — is accepted until Jo approves the plan.",
		parameters: z.object({
			task: z.string().describe("What the slice does, one line."),
			doneCondition: z.string().describe("What is true when the slice is done; its runtime artifact proves it."),
			inputs: z.string().describe("What the slice needs to start (files, decisions, prior slices)."),
			kind: z.enum(SLICE_KINDS).optional().describe("The routing kind of the work: locate, understand, change-small, change-large, or judge (the plan slice)."),
			id: z.string().optional().describe("A slice id to use (sl-…); generated when omitted."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "added");
			if (!o.ok) return o.result;
			const task = String(params.task ?? "").trim();
			const doneCondition = String(params.doneCondition ?? "").trim();
			const inputs = String(params.inputs ?? "").trim();
			if (!task || !doneCondition || !inputs) return text("A slice names its task, its done condition and its inputs; nothing was added.");
			const kind = typeof params.kind === "string" ? params.kind : null;
			const { ledger, workloadId } = o.own;
			// Decision 15: while `plan: first` stands with no `plan: approved`, only the judge-kind plan slice may be added.
			const entries = ledger.entries(workloadId);
			const flag = planFirst(controlEntries(entries, holdersOf(entries, o.own.workload.holder)));
			if (flag !== null && kind !== "judge") {
				const plan = planSlice(ledger.slices(workloadId));
				const where = plan
					? `the plan slice is ${plan.id} (${plan.state}); close it by raising its question (lane_raise_question, options approve / revise / cancel) and wait for Jo's approve`
					: "add the plan slice first: a `judge` kind slice whose artifact is the plan, closed by lane_raise_question with options approve / revise / cancel";
				return text(`Workload ${workloadId} is plan-first (${flag.trigger}) and the plan is not approved: ${kind === null ? "a slice without `kind: \"judge\"`" : `a ${kind} slice`} is refused; ${where}. Nothing was added.`);
			}
			const id = typeof params.id === "string" && params.id.trim() ? params.id.trim() : undefined;
			const sliceId = ledger.addSlice({ by: o.own.laneId, workloadId, task, doneCondition, inputs, id });
			return text(`Added slice ${sliceId} to ${workloadId}${kind ? ` (${kind})` : ""}: ${task}`, { id: sliceId });
		},
	});

	pi.registerTool({
		name: LANE_COMPLETE_SLICE_TOOL,
		loadMode: "essential",
		label: "Complete Slice",
		description: "Close a slice of this lane's workload on its runtime artifact: the command output, file, or PR that proves the done condition.",
		parameters: z.object({
			slice: z.string().describe("The slice id (sl-…) on this lane's workload."),
			artifact: z.string().describe("The runtime artifact proving the done condition (a path, a URL, a command and its result)."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "completed");
			if (!o.ok) return o.result;
			const slice = String(params.slice ?? "").trim();
			const artifact = String(params.artifact ?? "").trim();
			if (!slice || !artifact) return text("Completion names a slice id and its artifact; nothing was completed.");
			const on = sliceOn(o.own, slice, "completed");
			if (!on.ok) return on.result;
			o.own.ledger.completeSlice(slice, { by: o.own.laneId, artifact });
			return text(`Completed slice ${slice} on ${artifact}.`, { id: slice });
		},
	});

	pi.registerTool({
		name: LANE_RAISE_QUESTION_TOOL,
		loadMode: "essential",
		label: "Raise Question",
		description:
			"Ask Jo a question on a slice of this lane's workload; the slice pauses until Jo answers with one of the options (or withdraws). " +
			"The plan slice closes this way: body = the plan artifact path, options approve / revise / cancel. " +
			"A plan question offering approve is refused until a review hand named after the plan slice has reviewed the plan on another lab since the last question; name its verdict in the body.",
		parameters: z.object({
			slice: z.string().describe("The slice id (sl-…) the question is about."),
			body: z.string().describe("The question, in plain words (a plan slice: the path of the plan)."),
			options: z.array(z.string()).describe("At least two answers Jo can give in one word each."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "asked");
			if (!o.ok) return o.result;
			const slice = String(params.slice ?? "").trim();
			const body = String(params.body ?? "").trim();
			const options = Array.isArray(params.options) ? params.options.map((x) => String(x).trim()).filter((x) => x.length > 0) : [];
			if (!slice || !body) return text("A question names a slice id and a body; nothing was asked.");
			if (new Set(options.map((x) => x.toLowerCase())).size < 2) return text("A question offers at least two distinct options Jo can answer with; nothing was asked.");
			const refused = reserved(body, "asked");
			if (refused) return refused;
			const on = sliceOn(o.own, slice, "asked");
			if (!on.ok) return on.result;
			const { ledger, workloadId } = o.own;
			if (options.some((x) => x.toLowerCase() === "approve")) {
				const entries = ledger.entries(workloadId);
				const plan = planFirst(controlEntries(entries, holdersOf(entries, o.own.workload.holder))) !== null ? planSlice(ledger.slices(workloadId)) : null;
				if (plan?.id === slice && !planReviewed(ledger, workloadId, slice)) return text(`${planReviewRefusal(slice)}. Nothing was asked.`);
			}
			const id = ledger.raiseQuestion({ by: o.own.laneId, workloadId, sliceId: slice, body, options });
			return text(`Raised question ${id} on ${slice} (${options.join(" / ")}); the slice is paused until Jo answers.`, { id });
		},
	});

	pi.registerTool({
		name: LANE_RECORD_ENTRY_TOOL,
		loadMode: "essential",
		label: "Record Entry",
		description:
			"Record an assumption or a decision on this lane's workload as a ledger entry, optionally on a slice. " +
			"When the workload is done, record its receipt as `done-because: <what is true now, against the workload's done: line>`; the orchestrator's close needs it.",
		parameters: z.object({
			body: z.string().describe("The entry, one paragraph; `done-because: …` for the workload's completion receipt."),
			slice: z.string().optional().describe("The slice id (sl-…) the entry is about, when it is about one."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "recorded");
			if (!o.ok) return o.result;
			const body = String(params.body ?? "").trim();
			if (!body) return text("An entry has a body; nothing was recorded.");
			const prefix = reservedPrefix(body);
			if (prefix !== null && prefix !== "done-because") return reserved(body, "recorded")!;
			if (body.startsWith(ARTIFACT_COMMAND_PREFIX)) return text(`A slice's artifact command is declared with slice_artifact, not written as an entry; nothing was recorded.`);
			const slice = typeof params.slice === "string" && params.slice.trim() ? params.slice.trim() : null;
			if (slice !== null) {
				const row = o.own.ledger.slice(slice);
				if (!row || row.workload_id !== o.own.workloadId) return text(`Slice ${slice} is not on workload ${o.own.workloadId}; nothing was recorded.`);
			}
			const id = o.own.ledger.recordEntry({ by: o.own.laneId, workloadId: o.own.workloadId, sliceId: slice, kind: "assumption", body });
			const receipt = prefix === "done-because" ? " This is the workload's completion receipt; the orchestrator can close it once you release." : "";
			return text(`Recorded entry ${id} on ${o.own.workloadId}${slice ? ` (${slice})` : ""}.${receipt}`, { id });
		},
	});

	pi.registerTool({
		name: LANE_MESSAGE_TOOL,
		loadMode: "essential",
		label: "Message Orchestrator",
		description: "Send one message to the orchestrator about this lane's workload (a finding, a blocker, a QUESTION that needs Jo). It reaches Jo's surface at its next read.",
		parameters: z.object({
			body: z.string().describe("The message, in plain words."),
			slice: z.string().optional().describe("The slice id (sl-…) it is about, when it is about one."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "sent");
			if (!o.ok) return o.result;
			const body = String(params.body ?? "").trim();
			if (!body) return text("A message has a body; nothing was sent.");
			const refused = reserved(body, "sent");
			if (refused) return refused;
			const signal = PUSHED_SIGNAL_PREFIXES.find((p) => body.startsWith(p));
			if (signal) return text(`A message opening with \`${signal}\` is a signal the machinery pushes to Jo; a lane's words must not read as one. Nothing was sent.`);
			const slice = typeof params.slice === "string" && params.slice.trim() ? params.slice.trim() : null;
			if (slice !== null) {
				const row = o.own.ledger.slice(slice);
				if (!row || row.workload_id !== o.own.workloadId) return text(`Slice ${slice} is not on workload ${o.own.workloadId}; nothing was sent.`);
			}
			const id = o.own.ledger.enqueue({ by: o.own.laneId, workloadId: o.own.workloadId, sliceId: slice, sender: o.own.laneId, recipient: ORCHESTRATOR_RECIPIENT, body });
			return text(`Sent message ${id} to the orchestrator.`, { id });
		},
	});

	pi.registerTool({
		name: LANE_WITHDRAW_RESERVED_TOOL,
		loadMode: "essential",
		label: "Withdraw Reserved Request",
		description:
			"Withdraw a reserved request (P-11 row 6's `reserved-request` entry) on this lane's workload that is still waiting on Jo, once this lane has gone past it. " +
			"Approval never admits a re-run (row 6 holds a reserved action every time), so this is how the lane says it no longer needs it.",
		parameters: z.object({
			id: z.string().describe("The reserved-request entry id (en-…) on this lane's workload."),
			reason: z.string().optional().describe("Why, in a few words (e.g. 'went another way'); shown in the decision log."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "withdrawn");
			if (!o.ok) return o.result;
			const id = String(params.id ?? "").trim();
			if (!id) return text("A withdrawal names the reserved-request entry id; nothing was withdrawn.");
			const reason = typeof params.reason === "string" ? params.reason.replace(/\s+/g, " ").trim() : "";
			const r = reservedStates(o.own.ledger, o.own.workloadId).find((x) => x.id === id);
			if (!r) return text(`${id} is not a reserved request on workload ${o.own.workloadId}; nothing was withdrawn.`);
			if (r.state.kind !== "waiting") return text(`Reserved request ${id} is not waiting on Jo (it is ${r.state.kind}); nothing was withdrawn.`);
			const entry = o.own.ledger.recordEntry({ by: o.own.laneId, workloadId: o.own.workloadId, kind: "assumption", body: `reserved-withdrawn: ${id}${reason ? ` ${reason}` : ""}` });
			return text(`Withdrew reserved request ${id} (entry ${entry}); it no longer waits on Jo.`, { id: entry });
		},
	});

	pi.registerTool({
		name: LANE_RELEASE_TOOL,
		loadMode: "essential",
		label: "Release Workload",
		description:
			"Release this lane's workload and end the lane: the work is done (record `done-because:` first) or this lane can do no more. " +
			"Terminal: after it every lane tool refuses and the session ends.",
		parameters: z.object({}),
		approval: "write",
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "released");
			if (!o.ok) return o.result;
			const r = o.own.ledger.releaseWorkload(o.own.workloadId, { by: o.own.laneId, holder: o.own.laneId });
			if (!r.released) return text(`Workload ${o.own.workloadId} is held by ${r.holder ?? "nobody"}, not by this lane; nothing was released.`);
			return text(`Released ${o.own.workloadId}. ${endSession(ctx)}`, { released: true });
		},
	});

	pi.registerTool({
		name: LANE_HANDOFF_TOOL,
		loadMode: "essential",
		label: "Hand Off to Jo",
		description:
			"Hand this lane's workload to Jo (\"I've got X\"): Jo becomes the holder with no lease, and this lane ends. " +
			"Terminal: after it every lane tool refuses and the session ends.",
		parameters: z.object({}),
		approval: "write",
		async execute(_id, _params, _signal, _onUpdate, ctx) {
			const o = owned(ctx, "handed off");
			if (!o.ok) return o.result;
			const r = o.own.ledger.handoffWorkload(o.own.workloadId, { by: o.own.laneId, holder: o.own.laneId, to: JO_HOLDER });
			if (!r.ok) return text(`Workload ${o.own.workloadId} is held by ${r.holder ?? "nobody"}, not by this lane; nothing was handed off.`);
			return text(`Handed ${o.own.workloadId} to Jo (holder ${JO_HOLDER}, no lease). ${endSession(ctx)}`, { handedOff: true });
		},
	});
}
