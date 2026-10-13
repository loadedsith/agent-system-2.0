// The orchestrator's own messages and the plan path (PLAN wl-mv61a8dh4aeneo D3; MIGRATION.md item for
// that plan). When an orchestrator message names an open plan question by its `q-…` id or its
// needs-you `#N`, Jo sees that question's plan file path, uncut, from the question row
// (surface/src/plan-paths.ts). The model's text is never changed: an `assistant_message` rewrite would
// change history, persistence and the next request. So `message_end` on an assistant message (which
// OMP fires after any `assistant_message` rewrite, so P-11 row 1's held-reply marker names nothing and
// the corrected reply is what is read) queues one `plan for <ref>: <absolute path>` line per mention
// site, in message order, and the queue goes out as one display-only `surface-plan-path` custom
// message once the session is idle: `agent_end` arms a `ctx.setTimeout` that checks `ctx.isIdle()`
// right before sending and re-arms while busy, PUSH_TRIES checks in all (as wake.ts bounds its push);
// a queue still unsent then waits for the next `agent_end`. `pi.sendMessage` with no `deliverAs` on an
// idle session appends and paints the message and starts no turn (OMP 18.8.6). A mid-turn message
// (text before its tool calls) gets its lines when the turn goes idle, below the tool output (the
// plan's tradeoff 2). OMP renders the message content as Markdown, so each line's path has its
// Markdown-special characters backslash-escaped (markdownEscape) or a path like `/a/*x*/` would lose
// characters on screen; planLine and every other route stay plain text.
//
// The lines never reach a model: the `context` hook drops every `surface-plan-path` message from each
// request, and `session_before_compact` removes them from the preparation's `messagesToSummarize`,
// `turnPrefixMessages` and `recentMessages`, dropping the matching `recentEntryIds` element in
// lockstep so the keep-tail alignment holds (pi-agent-core compaction/compaction.ts
// CompactionPreparation; arrays replaced by reference as gates/src/fence.ts does). P-11 rows 1 and 15
// read only assistant messages, so the custom message never trips them or counts as the model's.
import { type AgentMessageLike, messageText } from "../../gates/src/session";
import { planLine, planMentions } from "../src/plan-paths";
import { type SurfaceSession, surfaceSession } from "../src/session";
import { type CompactionPreparation, type Ctx, type HostMessage, PUSH_TRIES, type SurfaceAPI } from "../src/types";

/** The custom message type the plan path lines go out as. */
export const PLAN_PATH_TYPE = "surface-plan-path";
/** How long after `agent_end`, and between busy re-checks, the queue is tried (ms). */
export const PLAN_PATH_FLUSH_MS = 100;

/**
 * `text` with each Markdown-special character (\ ` * _ [ < > ~ & $) backslash-escaped, so OMP's Markdown
 * shows it as written. `]` stays bare: an escaped `[` already stops a link, and `\[…\]` is pi-tui's math.
 */
const markdownEscape = (text: string): string => text.replace(/[\\`*_[<>~&$]/g, "\\$&");

const isPlanPath = (m: HostMessage): boolean => m.customType === PLAN_PATH_TYPE;

export default function planPathRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	/** Per surface session: the lines queued since the last send, and whether a flush timer is armed. */
	const queues = new WeakMap<SurfaceSession, { lines: string[]; armed: boolean }>();
	const queueOf = (s: SurfaceSession): { lines: string[]; armed: boolean } => {
		let q = queues.get(s);
		if (!q) {
			q = { lines: [], armed: false };
			queues.set(s, q);
		}
		return q;
	};

	/** Send the queue as one message if the session is idle; re-arm while busy, `tries` checks so far. */
	const flush = (s: SurfaceSession, ctx: Ctx, tries: number): void => {
		const q = queueOf(s);
		if (q.lines.length === 0 || !pi.sendMessage) {
			q.armed = false;
			return;
		}
		if (ctx.isIdle?.() === false) {
			if (tries < PUSH_TRIES) ctx.setTimeout(() => flush(s, ctx, tries + 1), PLAN_PATH_FLUSH_MS);
			else q.armed = false;
			return;
		}
		const content = q.lines.join("\n");
		q.lines.length = 0;
		q.armed = false;
		pi.sendMessage({ customType: PLAN_PATH_TYPE, content, display: true });
	};

	pi.on("message_end", (event, ctx) => {
		if (event.message.role !== "assistant") return undefined;
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const text = messageText(event.message as AgentMessageLike);
		if (!text) return undefined;
		try {
			const ledger = s.ledger();
			const q = queueOf(s);
			for (const line of text.split("\n")) for (const m of planMentions(ledger, s.numbering, line)) q.lines.push(planLine({ ref: m.ref, path: markdownEscape(m.path) }));
		} catch (err) {
			ctx.ui.notify(`the plan paths could not be read from the ledger: ${err instanceof Error ? err.message : String(err)}`, "warning");
		}
		return undefined;
	});

	pi.on("agent_end", (_event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const q = queueOf(s);
		if (q.lines.length === 0 || q.armed) return undefined;
		q.armed = true;
		ctx.setTimeout(() => flush(s, ctx, 1), PLAN_PATH_FLUSH_MS);
		return undefined;
	});

	pi.on("context", (event, ctx) => {
		if (!surfaceSession(ctx, env).active || !event.messages.some(isPlanPath)) return undefined;
		return { messages: event.messages.filter((m) => !isPlanPath(m)) };
	});

	pi.on("session_before_compact", (event, ctx) => {
		if (!surfaceSession(ctx, env).active) return undefined;
		const p = event.preparation as CompactionPreparation;
		if (p.messagesToSummarize.some(isPlanPath)) p.messagesToSummarize = p.messagesToSummarize.filter((m) => !isPlanPath(m));
		if (p.turnPrefixMessages.some(isPlanPath)) p.turnPrefixMessages = p.turnPrefixMessages.filter((m) => !isPlanPath(m));
		const recent = p.recentMessages;
		if (recent?.some(isPlanPath)) {
			if (p.recentEntryIds) p.recentEntryIds = p.recentEntryIds.filter((_, i) => !(recent[i] && isPlanPath(recent[i])));
			p.recentMessages = recent.filter((m) => !isPlanPath(m));
		}
		return undefined;
	});
}
