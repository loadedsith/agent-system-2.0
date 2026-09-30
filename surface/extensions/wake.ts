// Wake = the ledger rendered (SPEC-2.0.md § B7) for the orchestrator: at session start (fresh or
// resumed) and after every compaction the first context is `renderWake` — never a hand's prose —
// delivered as the turn's message. The voice document (voice/VOICE.md, DESIGN-2.0.md C2.1) rides in
// the system prompt of every turn. Resume is enforced the way P-11 row 7 enforces it for lanes:
// after a wake the first turn owes one wake-read entry on the standing workload; every other tool
// call is refused until it exists, and the turn's stop is blocked too.
import { ensureStandingWorkload } from "../src/identity";
import { renderWake } from "../src/render";
import { surfaceSession } from "../src/session";
import { HOLD_HOURS, STANDING_WORKLOAD_ID, type SurfaceAPI, SURFACE_BY, WAKE_READ_TOOL } from "../src/types";

export default function wakeRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;
	pi.registerTool({
		name: WAKE_READ_TOOL,
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

	pi.on("session_start", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const resumed = ctx.sessionManager.getEntries().some((e) => e.type === "message");
		s.pending = resumed ? "restart" : "session-start";
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
				text = renderWake(ledger, { trigger, holdHours: HOLD_HOURS }).text;
			} catch (err) {
				text = `# Ledger could not be rendered (wake: ${trigger})\n\n${String(err)}\n\nSay so; do not reconstruct state from memory.`;
			}
			s.owed = { trigger, since: new Date().toISOString() };
			parts.push(text, "", `This turn owes one wake-read entry: call ${WAKE_READ_TOOL} with what you resume before any other tool call. Your first message restates what is in flight from this render, needs-you first.`);
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

	pi.on("session_stop", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active || !s.owed) return undefined;
		return { decision: "block", reason: `wake (${s.owed.trigger}): the wake-read entry is still owed; call ${WAKE_READ_TOOL} with what you resume.` };
	});
}
