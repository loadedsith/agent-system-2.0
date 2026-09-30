// The lane-side writers behind § B3 lines 3, 4 and 5 (M5 fix round 1). The surface renders these
// lines; the events they are about happen in the lane's session, so the rows that write them live
// here, in the surface's own extension, and are inert on the orchestrator. Every write goes through
// the ledger module as the lane (P-11 row 10). Session identity comes from the gates' session
// (gates/src/session.ts: role, workload id, lane id, the original bash command under the M4b fence).
//
// - Claim and lease (§ B3 item 4; SPEC-2.0.md:411-412): a lane bound to a workload claims it at
//   session_start with a lease of LEASE_MS and renews at a third of that on the session context's
//   timer and at every turn end. A lapsed lease of a previous holder is recorded as a `lane-died:`
//   row *before* the claim replaces it (surface/src/signals.ts recordLapsedLease), so a takeover
//   never erases the death. Where OMP exposes the session's end — `session_shutdown`, fired on
//   process exit (pi-coding-agent/src/extensibility/shared-events.ts:92-95, "Fired on process exit
//   (SIGINT/SIGTERM)") — the lane records its own death if work is still open and releases the
//   workload; a process killed outright never reaches that handler, and its lease lapsing is the
//   fallback signal the surface reads.
// - Leaked prompt (§ B3 item 5, first trigger; SPEC-2.0.md:424-449): `tool_approval_requested` /
//   `tool_approval_resolved` (extensibility/extensions/types.ts:924-940, emitted at
//   extensions/wrapper.ts:284-303 with sessionId, toolCallId, toolName, reason) and an `ask`
//   execution (`tool_execution_start` / `tool_execution_end` with toolName "ask", types.ts:807-831)
//   become `prompt-wait:` / `prompt-resolved:` rows keyed by lane and tool-call id; a wait still
//   open at session_shutdown is resolved as ended.
// - Runtime artifact (§ B3 item 3; SPEC-2.0.md:409-410): the lane declares each slice's artifact
//   command with the `slice_artifact` tool (an `assumption` entry, `artifact-command: …`); every
//   bash result whose command is a declared one writes that slice's `artifact-failed:` or
//   `artifact-passed:` outcome. A refused push is P-11 row 8's own writer, unchanged.
import { gateSession } from "../../gates/src/session";
import { controlEntries, exitClass, heldLive, holdersOf } from "../src/launch";
import {
	artifactCommandBody, artifactCommands, artifactFailedBody, artifactFailures, artifactPassedBody, laneDiedShutdownBody,
	promptResolvedBody, promptWaitBody, recordLapsedLease,
} from "../src/signals";
import { ARTIFACT_TOOL, type Ctx, LEASE_MS, LEASE_MS_ENV, ORCHESTRATOR_RECIPIENT, type SurfaceAPI, type ToolResult } from "../src/types";

interface LaneState {
	/** Open leaked-prompt waits this session observed, by tool-call id. */
	readonly waits: Map<string, { toolName: string; sessionId: string }>;
	renewing: boolean;
	/** Set by lane_release / lane_handoff: the lane no longer claims, renews, or reports its own death. */
	released: boolean;
	/** The renewal timer's handle from ctx.setInterval, for clearTimer on release. */
	timer: unknown;
}
const STORE = Symbol.for("agent-system-2.0/surface/lane-state");
type Store = WeakMap<object, LaneState>;
function laneState(ctx: Ctx): LaneState {
	const g = globalThis as unknown as Record<symbol, Store | undefined>;
	const store = (g[STORE] ??= new WeakMap());
	let st = store.get(ctx.sessionManager);
	if (!st) {
		st = { waits: new Map(), renewing: false, released: false, timer: null };
		store.set(ctx.sessionManager, st);
	}
	return st;
}

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });

/**
 * The lane gave the workload up on purpose (lane_release / lane_handoff, DESIGN-lane-launcher.md
 * decision 10): no further claim or renewal, the renewal timer stops (ctx.clearTimer is host
 * contract, gates/src/host.ts HOST_MEMBERS), and session_shutdown writes no lane-died:.
 */
export function markReleased(ctx: Ctx): void {
	const st = laneState(ctx);
	st.released = true;
	if (st.timer !== null) {
		ctx.clearTimer(st.timer);
		st.timer = null;
	}
}

/** Has this session released (lane_release / lane_handoff)? Every lane tool refuses afterwards. */
export function isReleased(ctx: Ctx): boolean {
	return laneState(ctx).released;
}

export default function laneRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const leaseMs = (): number => {
		const n = Number(env[LEASE_MS_ENV]);
		return Number.isFinite(n) && n > 0 ? n : LEASE_MS;
	};
	/** A bound lane or a hand of one: its workload's signal rows are written as this session. */
	const laneSide = (ctx: Ctx) => {
		const s = gateSession(ctx, env);
		return s.workloadId !== null && s.role !== "orchestrator" ? s : null;
	};
	const warn = (ctx: Ctx, what: string, err: unknown) => ctx.ui.notify(`${what} could not be written to the ledger: ${String(err)}`, "warning");

	/** Claim (or renew) the workload for this lane; a previous holder's lapsed lease is persisted first. */
	const claim = (ctx: Ctx, what: string): void => {
		const s = gateSession(ctx, env);
		if (!s.bound || laneState(ctx).released) return;
		try {
			const ledger = s.ledger();
			const w = ledger.workload(s.workloadId!);
			if (!w || w.status !== "open") return;
			if (w.holder && w.holder !== s.laneId) recordLapsedLease(ledger, w, s.laneId);
			const r = ledger.claimWorkload(w.id, { by: s.laneId, holder: s.laneId, leaseMs: leaseMs() });
			if (!r.won) ctx.ui.notify(`${what}: workload ${w.id} is held by ${r.holder ?? "nobody"} under a live lease; this lane (${s.laneId}) does not hold it.`, "warning");
		} catch (err) {
			warn(ctx, `${what}: the workload claim`, err);
		}
	};

	const z = pi.zod;
	pi.registerTool({
		name: ARTIFACT_TOOL,
		loadMode: "essential",
		label: "Declare Slice Artifact",
		description:
			"Declare the runtime-artifact command of a slice of this lane's workload (the command that proves its done-condition, e.g. `bun test x.test.ts`). " +
			"From then on every bash result running exactly that command records the slice's artifact outcome; two failures since the last pass surface to Jo (§ B3 item 3).",
		parameters: z.object({
			slice: z.string().describe("The slice id (sl-…) on this lane's workload."),
			command: z.string().describe("The exact bash command line that is the slice's runtime artifact."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = gateSession(ctx, env);
			if (!s.bound) return text("This session is not a lane bound to a workload; nothing was declared.");
			// The same gate as the lane tools (lane-tools.ts `owned`, Codex review S4): released, or not the live holder, writes nothing.
			if (laneState(ctx).released) return text(`This lane released ${s.workloadId} (or handed it to Jo); its work is over and nothing was declared.`);
			const slice = String(params.slice ?? "").trim();
			const command = String(params.command ?? "").trim();
			if (!slice || !command) return text("A declaration names a slice id and a command; nothing was declared.");
			const ledger = s.ledger();
			const w = ledger.workload(s.workloadId!);
			if (!w || w.status !== "open") return text(`Workload ${s.workloadId} is ${w?.status ?? "missing"}; nothing was declared.`);
			if (w.holder !== s.laneId || !heldLive(w, ledger.now())) {
				const who = w.holder === null ? "nobody" : w.holder === s.laneId ? `${s.laneId} under a lapsed lease` : w.holder;
				return text(`Workload ${w.id} is held by ${who}, not by this lane (${s.laneId}) under a live lease; nothing was declared.`);
			}
			const row = ledger.slice(slice);
			if (!row || row.workload_id !== s.workloadId) return text(`Slice ${slice} is not on workload ${s.workloadId}; nothing was declared.`);
			if (row.state === "done" || row.state === "cancelled") return text(`Slice ${slice} is ${row.state}; nothing was declared.`);
			const id = ledger.recordEntry({ by: s.laneId, workloadId: s.workloadId!, sliceId: slice, kind: "assumption", body: artifactCommandBody(command) });
			return text(`Declared the runtime artifact of ${slice}: \`${command}\` (entry ${id}). Its bash results now record the slice's artifact outcomes.`, { id });
		},
	});

	pi.on("session_start", (_e, ctx) => {
		const s = gateSession(ctx, env);
		if (!s.bound) return undefined;
		claim(ctx, "lane start");
		const st = laneState(ctx);
		if (!st.renewing) {
			st.renewing = true;
			st.timer = ctx.setInterval(() => claim(ctx, "lease renewal"), Math.max(1, Math.floor(leaseMs() / 3)));
		}
		return undefined;
	});

	pi.on("agent_end", (event, ctx) => {
		if (!event.willContinue) claim(ctx, "turn end");
		return undefined;
	});

	pi.on("session_shutdown", (_e, ctx) => {
		const s = laneSide(ctx);
		if (!s) return undefined;
		const st = laneState(ctx);
		try {
			const ledger = s.ledger();
			for (const [callId, w] of st.waits) {
				ledger.enqueue({ by: s.laneId, workloadId: s.workloadId!, sliceId: s.currentSlice(), sender: s.laneId, recipient: ORCHESTRATOR_RECIPIENT, body: promptResolvedBody(w.toolName, callId, w.sessionId, "ended: the session shut down") });
			}
			st.waits.clear();
			if (!s.bound || st.released) return undefined;
			const w = ledger.workload(s.workloadId!);
			if (!w || w.status !== "open" || w.holder !== s.laneId) return undefined;
			const inFlight = w.open_slices + w.paused_slices;
			// One shared exit classification (DESIGN-lane-launcher.md decision 10): a stop the lane accepted, a park, or its own
			// release is intended and writes no lane-died:; anything else with work open is the death signal, Jo's own terminal
			// (`as2 lane <wl>`) included: quitting with a slice open is a death the wake render names, not a silent end.
			const entries = ledger.entries(w.id);
			const intended = exitClass(controlEntries(entries, holdersOf(entries, w.holder)), s.laneId) === "intended";
			if (inFlight > 0 && !intended) {
				ledger.enqueue({ by: s.laneId, workloadId: w.id, sender: s.laneId, recipient: ORCHESTRATOR_RECIPIENT, body: laneDiedShutdownBody(s.laneId, ledger.now(), inFlight) });
			}
			ledger.releaseWorkload(w.id, { by: s.laneId, holder: s.laneId });
		} catch (err) {
			warn(ctx, "session shutdown: the lane's release", err);
		}
		return undefined;
	});

	const waitBegan = (ctx: Ctx, toolName: string, toolCallId: string, sessionId: string, reason: string): void => {
		const s = laneSide(ctx);
		if (!s) return;
		try {
			laneState(ctx).waits.set(toolCallId, { toolName, sessionId });
			s.ledger().enqueue({ by: s.laneId, workloadId: s.workloadId!, sliceId: s.currentSlice(), sender: s.laneId, recipient: ORCHESTRATOR_RECIPIENT, body: promptWaitBody(toolName, toolCallId, sessionId, reason) });
		} catch (err) {
			warn(ctx, `the prompt-wait row for ${toolName} (${toolCallId})`, err);
		}
	};
	const waitEnded = (ctx: Ctx, toolName: string, toolCallId: string, sessionId: string, outcome: string): void => {
		const s = laneSide(ctx);
		if (!s) return;
		const st = laneState(ctx);
		if (!st.waits.delete(toolCallId)) return;
		try {
			s.ledger().enqueue({ by: s.laneId, workloadId: s.workloadId!, sliceId: s.currentSlice(), sender: s.laneId, recipient: ORCHESTRATOR_RECIPIENT, body: promptResolvedBody(toolName, toolCallId, sessionId, outcome) });
		} catch (err) {
			warn(ctx, `the prompt-resolved row for ${toolName} (${toolCallId})`, err);
		}
	};

	pi.on("tool_approval_requested", (event, ctx) => {
		waitBegan(ctx, event.toolName, event.toolCallId, event.sessionId, event.reason ?? "tool approval requested");
		return undefined;
	});
	pi.on("tool_approval_resolved", (event, ctx) => {
		waitEnded(ctx, event.toolName, event.toolCallId, event.sessionId, `${event.approved ? "approved" : "denied"}${event.reason ? `: ${event.reason}` : ""}`);
		return undefined;
	});
	pi.on("tool_execution_start", (event, ctx) => {
		if (event.toolName !== "ask") return undefined;
		const args = (event.args && typeof event.args === "object" ? event.args : {}) as Record<string, unknown>;
		const asked = typeof args.question === "string" ? args.question : typeof args.prompt === "string" ? args.prompt : JSON.stringify(args);
		waitBegan(ctx, "ask", event.toolCallId, "", `ask: ${asked}`);
		return undefined;
	});
	pi.on("tool_execution_end", (event, ctx) => {
		if (event.toolName === "ask") waitEnded(ctx, "ask", event.toolCallId, "", event.isError ? "ended with an error" : "answered");
		return undefined;
	});

	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const s = laneSide(ctx);
		if (!s) return undefined;
		const d = (event.details && typeof event.details === "object" ? event.details : {}) as Record<string, unknown>;
		if ("async" in d && d.async !== undefined && d.async !== null) return undefined; // backgrounded: no outcome yet
		try {
			const ledger = s.ledger();
			const command = String(s.originalInput(event).command ?? "").trim();
			if (!command) return undefined;
			const declared = artifactCommands(ledger, s.workloadId!);
			for (const [sliceId, artifact] of declared) {
				if (artifact !== command) continue;
				// BashToolDetails.exitCode is set only for a completed non-zero exit (pi-tui src/tools/bash.ts:38-39), as row 3 reads it.
				const code = typeof d.exitCode === "number" ? d.exitCode : event.isError ? 1 : 0;
				const call = event.toolCallId ?? "unknown";
				if (code !== 0) {
					ledger.enqueue({ by: s.laneId, workloadId: s.workloadId!, sliceId, sender: s.laneId, recipient: ORCHESTRATOR_RECIPIENT, body: artifactFailedBody(`\`${command}\` exited ${code} (tool call ${call})`) });
				} else if ((artifactFailures(ledger, s.workloadId!).get(sliceId)?.n ?? 0) > 0) {
					ledger.enqueue({ by: s.laneId, workloadId: s.workloadId!, sliceId, sender: s.laneId, recipient: ORCHESTRATOR_RECIPIENT, body: artifactPassedBody(`\`${command}\` exited 0 (tool call ${call})`) });
				}
			}
		} catch (err) {
			warn(ctx, "the slice's artifact outcome", err);
		}
		return undefined;
	});
}
