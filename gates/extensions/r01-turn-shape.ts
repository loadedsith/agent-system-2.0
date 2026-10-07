// P-11 row 1 as its own extension (astra review S4): the turn shape of a message to Jo, refused at a
// top-level session's stop. Hands never talk to Jo (and OMP fires no session_stop for them). The
// orchestrator is held to its own rule: it hands Jo no command at all.
//
// On the orchestrator a refused reply is withheld (MIGRATION.md item 37, Jo's "withhold"):
// `assistant_message` checks the turn's final reply (no toolCall block) before OMP
// shows, persists or sends it on (types.ts:873-887), replaces its text with one marker line and
// keeps the original here. The `session_stop` that follows decides from that stored refusal, never
// from the marker (which itself passes the check), and its hidden continuation carries the original
// so the rewrite starts from the draft. Jo sees the marker and the corrected reply, once each. A
// lane's reply is never rewritten: its refusal and rewrite both stay on screen, as before.
import { checkTurnShape } from "../src/rows/r01-turn-shape";
import { type GatesAPI, type GateSession, gateSession, messageText } from "../src/session";

/** The orchestrator's reply withheld this turn, until its `session_stop`. Kept here: no other row reads it. */
const held = new WeakMap<GateSession, { original: string; reason: string }>();

/** The defect list out of a row 1 refusal reason, on one line, for the marker Jo sees. */
const defectOf = (reason: string): string =>
	reason
		.replace(/^P-11 row 1 refused this turn to Jo: /, "")
		.replace(/\. Shape: [\s\S]*$/, "")
		.replace(/\s+/g, " ");

export default function turnShapeRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("assistant_message", (event, ctx) => {
		const s = gateSession(ctx, env);
		const content = event.message.content;
		if (s.role !== "orchestrator" || !Array.isArray(content) || content.some((p) => p.type === "toolCall")) return undefined;
		const original = messageText(event.message);
		const refusal = checkTurnShape(original, "orchestrator");
		if (!refusal) {
			held.delete(s);
			return undefined;
		}
		held.set(s, { original, reason: refusal.reason });
		const marker = `(Reply held by P-11 row 1: ${defectOf(refusal.reason)}. The corrected reply follows.)`;
		const first = content.findIndex((p) => p.type === "text");
		return { content: content.map((p, i) => (p.type !== "text" ? p : { ...p, text: i === first ? marker : "" })) };
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
