// Wake = the ledger rendered (SPEC-2.0.md § B7) for the orchestrator: at session start (fresh or
// resumed) and after every compaction the first context is `renderWake` — never a hand's prose —
// delivered as the turn's message. The voice document (voice/VOICE.md, DESIGN-2.0.md C2.1) rides in
// the system prompt of every turn. Resume is enforced the way P-11 row 7 enforces it for lanes:
// after a wake the first turn owes one wake-read entry on the standing workload; every other tool
// call is refused until it exists, and the turn's stop is blocked too.
//
// Between wakes (Codex B1) the § B3 lines still reach the running surface: every ordinary turn's
// context carries the lines that are new since this session last delivered them, and a poll on
// the session context's timer (OMP ExtensionContext.setInterval, cleared at session_shutdown)
// re-reads the ledger so a question written by a lane, a lane's death, or a hold crossing four
// hours with nobody typing is pushed as an aside — an idle session starts a turn on it
// (ExtensionAPI.sendMessage, deliverAs "aside"). Each read first records lapsed leases as
// lane-died rows (surface/src/signals.ts) and each delivery consumes the held orchestrator-bound
// messages behind its lines (surface/src/delivery.ts), so a line is delivered once until its
// state changes.
import { consumeAllToOrchestrator, consumeLines, needsYouBlock } from "../src/delivery";
import { type ErrorLine, errorLines } from "../src/errors";
import { ensureStandingWorkload } from "../src/identity";
import { renderWake } from "../src/render";
import { type SurfaceSession, surfaceSession } from "../src/session";
import { recordLapsedLeases } from "../src/signals";
import { HOLD_HOURS, LEDGER_TOOL, STANDING_WORKLOAD_ID, type SurfaceAPI, SURFACE_BY, WAKE_READ_TOOL } from "../src/types";
import { launchVerdict, triggerLaunch } from "./launch";
import { closeWorkloadWithEntry } from "./workload";

/** The lines owed now, after this read's own writes (lapsed leases persisted as lane-died rows), numbered with the session's numbering. */
function readLines(s: SurfaceSession): ErrorLine[] {
	const ledger = s.ledger();
	const now = s.now();
	recordLapsedLeases(ledger, SURFACE_BY, now);
	return s.numbering.assign(errorLines(ledger, ledger.inFlight(), { now, holdHours: HOLD_HOURS }));
}

/** The lines new since the session's last delivery, recorded as delivered and their messages consumed; each carries its `#n` (the full list is numbered before the take). */
function takeFresh(s: SurfaceSession): ErrorLine[] {
	const fresh = s.delivered.take(readLines(s));
	if (fresh.length > 0) consumeLines(s.ledger(), fresh);
	return fresh;
}

export default function wakeRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;
	pi.registerTool({
		name: WAKE_READ_TOOL,
		loadMode: "essential",
		label: "Record Orchestrator Wake Read",
		description:
			"After a session start or a compaction, record the one wake-read ledger entry stating what you resume, read from the rendered ledger. " +
			"Until it exists every other tool call and the turn's stop are refused (§ B7 verified read).",
		parameters: z.object({
			body: z.string().describe("What you resume: the open workloads and the needs-you lines as read from the render, and your next step."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return { content: [{ type: "text", text: "This session is not the orchestrator surface; no wake read is owed and nothing was recorded." }] };
			const ledger = s.ledger();
			ensureStandingWorkload(ledger);
			const body = String(params.body ?? "").trim();
			if (!body) return { content: [{ type: "text", text: "A wake read needs a body saying what you resume; nothing was recorded." }] };
			const id = ledger.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "wake-read", body });
			s.owed = null;
			return { content: [{ type: "text", text: `Recorded wake-read entry ${id} on ${STANDING_WORKLOAD_ID}.` }], details: { id } };
		},
	});

	// Queryable on demand (M7 fix round 2, finding C): Jo typed `status` and the reply repeated a
	// state the ledger had moved past (a slice done, the lane released, a held message), because the
	// render reached the model only at a wake. This is the same render, on request, with the same
	// consumption: the § B3 lines it shows are recorded as delivered and the held orchestrator-bound
	// messages it shows move to `delivered`. Quiet by default still holds: nothing is pushed.
	pi.registerTool({
		name: LEDGER_TOOL,
		loadMode: "essential",
		label: "Read The Ledger",
		description:
			"The ledger rendered now, the same render a wake gives: needs-you first, then every open workload (or the one you name) with its slices, questions, messages and recent entries. " +
			"Call it first for any ask about state (status, what's open, is X done) and answer from it; a CLAIM about a workload cites this render.",
		parameters: z.object({
			workload: z.string().optional().describe("One workload id (wl-…) to render; omit for every open workload."),
		}),
		approval: "read",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return { content: [{ type: "text", text: "This session is not the orchestrator surface; nothing was read." }] };
			const ledger = s.ledger();
			ensureStandingWorkload(ledger);
			const wl = typeof params.workload === "string" && params.workload.trim() ? params.workload.trim() : undefined;
			if (wl && !ledger.inFlight().some((w) => w.workload.id === wl)) {
				const w = ledger.workload(wl);
				return { content: [{ type: "text", text: w ? `${wl} is ${w.status}${w.closed_at ? ` (closed ${w.closed_at})` : ""}; only open workloads are rendered.` : `No workload ${wl}.` }] };
			}
			const now = s.now();
			recordLapsedLeases(ledger, SURFACE_BY, now);
			const rendered = renderWake(ledger, { heading: `read on demand${wl ? `: ${wl}` : ""}`, holdHours: HOLD_HOURS, now, workloadId: wl, numbering: s.numbering });
			s.delivered.take(rendered.lines);
			if (wl) consumeLines(ledger, rendered.lines);
			consumeAllToOrchestrator(ledger, wl);
			return { content: [{ type: "text", text: rendered.text }] };
		},
	});

	/** One poll: push the lines new since the last delivery. Skipped while a wake is pending (the wake carries everything). */
	const poll = (s: SurfaceSession): void => {
		if (s.pending || !pi.sendMessage) return;
		let fresh: ErrorLine[];
		try {
			fresh = takeFresh(s);
		} catch (err) {
			pi.sendMessage({ customType: "surface-needs-you", content: `## needs you\n- the ledger could not be read between wakes: ${String(err)}`, display: true }, { deliverAs: "aside", triggerTurn: true });
			return;
		}
		if (fresh.length === 0) return;
		pi.sendMessage({ customType: "surface-needs-you", content: needsYouBlock(fresh, "needs you (new since your last turn)"), display: true }, { deliverAs: "aside", triggerTurn: true });
	};

	/**
	 * The tick catch-up (DESIGN-lane-launcher.md decision 7): every open workload the predicate says
	 * to launch now gets one starter run, so a resolution or a cap slot that arrived with nobody
	 * typing does not wait for Jo's next turn. A workload the predicate refuses as `awaiting-close`
	 * (its holder's `done-because:` stands, nobody holds it) with no open or paused slice and no open
	 * question is closed through the close tool's own path (`closeWorkloadWithEntry`, decision 13:
	 * the entry committed, the close stamped as the surface); one that still has an open or paused
	 * slice or an open question is told once as "finished but cannot close", again only when its
	 * counts change (`s.stuckFinished`). Runs after the poll persisted lapsed leases; one catch-up at
	 * a time; a line per attempt goes to the notices for the next turn's context. `cwd` is the
	 * session's, the close tool's fallback repository.
	 */
	const catchUp = async (s: SurfaceSession, cwd: string): Promise<void> => {
		if (s.launching || !pi.exec) return;
		s.launching = true;
		try {
			const ledger = s.ledger();
			for (const w of ledger.inFlight()) {
				const id = w.workload.id;
				if (id === STANDING_WORKLOAD_ID) continue;
				const verdict = launchVerdict(ledger, env, id);
				if (verdict?.launch === false && verdict.reason === "awaiting-close") {
					const { open_slices: open, paused_slices: paused, open_questions: questions } = w.workload;
					if (open > 0 || paused > 0 || questions > 0) {
						// Finished but not closable: told once per session until the counts change, never a close or a launch.
						const told = `${open}:${paused}:${questions}`;
						if (s.stuckFinished.get(id) !== told) {
							s.stuckFinished.set(id, told);
							s.notices.push(`tick: ${id} is finished but cannot close: ${open} open slice(s), ${paused} paused, ${questions} open question(s) — resolve them or close by hand`);
						}
						continue;
					}
					s.stuckFinished.delete(id);
					try {
						const r = await closeWorkloadWithEntry(pi, ledger, env, id, { now: s.now(), cwd, receipt: null });
						s.notices.push(r.closed ? `tick: closed ${id}: ${(r.receipt ?? "").split("\n")[0]}` : `tick: ${r.text}`);
					} catch (err) {
						s.notices.push(`tick: closing ${id} failed: ${String(err)}`);
					}
					continue;
				}
				s.stuckFinished.delete(id);
				if (!verdict?.launch) continue;
				const r = await triggerLaunch(pi, ledger, env, id, "tick");
				if (r.line) s.notices.push(`tick: ${r.line}`);
			}
		} catch (err) {
			s.notices.push(`tick: the launch catch-up failed: ${String(err)}`);
		} finally {
			s.launching = false;
		}
	};

	pi.on("session_start", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const resumed = ctx.sessionManager.getEntries().some((e) => e.type === "message");
		s.pending = resumed ? "restart" : "session-start";
		if (!s.polling) {
			s.polling = true;
			ctx.setInterval(() => {
				poll(s);
				void catchUp(s, ctx.cwd);
			}, s.pollMs);
		}
		return undefined;
	});

	pi.on("session_compact", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (s.active) s.pending = "compaction";
		return undefined;
	});

	pi.on("before_agent_start", (event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const voice = s.voice();
		const systemPrompt = voice.text === null
			? [...event.systemPrompt, `The voice document was not found at ${voice.path}; the orchestrator surface is running without it. Say so in your first message.`]
			: [...event.systemPrompt, `# Voice document (${voice.path})\n\n${voice.text}`];
		s.voiceInjected = voice.text !== null;
		const parts: string[] = [];
		if (s.pending) {
			const trigger = s.pending;
			s.pending = null;
			let text: string;
			try {
				const ledger = s.ledger();
				ensureStandingWorkload(ledger);
				const now = s.now();
				recordLapsedLeases(ledger, SURFACE_BY, now);
				const rendered = renderWake(ledger, { trigger, holdHours: HOLD_HOURS, now, numbering: s.numbering });
				text = rendered.text;
				s.delivered.take(rendered.lines);
				consumeAllToOrchestrator(ledger);
			} catch (err) {
				text = `# Ledger could not be rendered (wake: ${trigger})\n\n${String(err)}\n\nSay so; do not reconstruct state from memory.`;
			}
			s.owed = { trigger, since: new Date().toISOString() };
			parts.push(text, "", `This turn owes one wake-read entry: call ${WAKE_READ_TOOL} with what you resume before any other tool call. Your first message restates what is in flight from this render, needs-you first.`);
		} else {
			try {
				const fresh = takeFresh(s);
				if (fresh.length > 0) parts.push(needsYouBlock(fresh, "needs you (new since your last turn)"));
			} catch (err) {
				parts.push(`## needs you\n- the ledger could not be read for this turn: ${String(err)}`);
			}
		}
		if (s.notices.length > 0) {
			parts.push("", "## Applied from the surface since your last turn", ...s.notices.map((n) => `- ${n}`));
			s.notices.length = 0;
		}
		return parts.length > 0
			? { systemPrompt, message: { customType: "surface-wake", content: parts.join("\n"), display: true } }
			: { systemPrompt };
	});

	pi.on("tool_call", (event, ctx) => {
		const s = surfaceSession(ctx, env);
		return s.active ? (s.check(event.toolName) ?? undefined) : undefined;
	});

	// A `decision: "block"` here schedules a hidden continuation turn and is exempt from OMP's
	// continuation cap (pi-coding-agent/src/session/agent-session.ts:4323, OMP 18.3.0:
	// `if (result?.decision !== "block" && this.#sessionStopContinuationCount >= SESSION_STOP_CONTINUATION_CAP)`),
	// so this block has no ceiling: a model that never calls the wake-read tool is re-prompted until it
	// does. Relied on deliberately — the verified read is the one thing a wake may not skip (§ B7).
	pi.on("session_stop", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active || !s.owed) return undefined;
		return { decision: "block", reason: `wake (${s.owed.trigger}): the wake-read entry is still owed; call ${WAKE_READ_TOOL} with what you resume.` };
	});
}
