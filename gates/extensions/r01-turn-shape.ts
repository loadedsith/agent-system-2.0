// P-11 row 1 as its own extension (astra review S4): the turn shape of a message to Jo, refused at a
// top-level session's stop. Hands never talk to Jo (and OMP fires no session_stop for them). The
// orchestrator is held to its own rule: it hands Jo no command at all.
//
// On the orchestrator a refused reply is withheld (MIGRATION.md item 37, Jo's "withhold"):
// `assistant_message` checks the turn's final reply (no toolCall block) before OMP
// persists or sends it on (types.ts:873-887), replaces its text with one fixed marker line and
// keeps the original here. The marker quotes nothing from the draft or the refusal, since the
// refusal names the defect (a refused command among them) and Jo must not see it republished.
// Text already streamed is not retracted, so a stream-rendering client may show the draft while
// it streams; the finalized reply is the marker. The `session_stop` that follows decides from that
// stored refusal, never from the marker (which itself passes the check), and its hidden
// continuation carries the full reason and the original so the rewrite starts from the draft.
// Jo's history holds the marker and the corrected reply, once each. One marker shows per prompt:
// a later hold in the same prompt (a refused rewrite) has each text block replaced by "…" instead,
// with the same block shape, and still blocks at `session_stop` with its full reason and original.
// The marker shows again after Jo's `input` or a reply that passes row 1. A lane's reply is never
// rewritten: its refusal and rewrite both stay on screen, as before.
import { checkTurnShape } from "../src/rows/r01-turn-shape";
import { type GatesAPI, type GateSession, gateSession, messageText } from "../src/session";

/** The orchestrator's reply withheld this turn, until its `session_stop`. Kept here: no other row reads it. */
const held = new WeakMap<GateSession, { original: string; reason: string }>();

/**
 * Sessions that have shown WITHHELD_MARKER in the current prompt. Cleared by Jo's `input` and by a
 * reply that passes row 1 (so an aside-started turn, which has no `input`, shows it again); never by
 * `before_agent_start`, which also fires on the session_stop continuation that carries the rewrite.
 */
const markerShown = new WeakSet<GateSession>();

/** What Jo sees in place of a withheld reply: fixed, so nothing refused reaches Jo's screen. Passes row 1. */
const WITHHELD_MARKER = "(Reply held by P-11 row 1. The corrected reply follows.)";

/** Every text block of a later hold in the same prompt. Non-empty after trim: an empty reply is an empty stop to OMP, which skips session_stop. */
const LATER_HOLD = "…";

export default function turnShapeRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("input", (_event, ctx) => {
		markerShown.delete(gateSession(ctx, env));
		return undefined;
	});

	pi.on("assistant_message", (event, ctx) => {
		const s = gateSession(ctx, env);
		const content = event.message.content;
		if (s.role !== "orchestrator" || !Array.isArray(content) || content.some((p) => p.type === "toolCall")) return undefined;
		const original = messageText(event.message);
		const refusal = checkTurnShape(original, "orchestrator");
		if (!refusal) {
			held.delete(s);
			markerShown.delete(s);
			return undefined;
		}
		held.set(s, { original, reason: refusal.reason });
		if (markerShown.has(s)) return { content: content.map((p) => (p.type !== "text" ? p : { ...p, text: LATER_HOLD })) };
		markerShown.add(s);
		const first = content.findIndex((p) => p.type === "text");
		return { content: content.map((p, i) => (p.type !== "text" ? p : { ...p, text: i === first ? WITHHELD_MARKER : "" })) };
	});

	pi.on("session_stop", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role === "hand") return undefined;
		const withheld = held.get(s);
		if (withheld) {
			held.delete(s);
			return { decision: "block", reason: `${withheld.reason}\n\nYour held reply was:\n\n${withheld.original}` };
		}
		const refusal = checkTurnShape(messageText(event.last_assistant_message), s.role === "orchestrator" ? "orchestrator" : "lane");
		return refusal ? { decision: "block", reason: refusal.reason } : undefined;
	});
}
