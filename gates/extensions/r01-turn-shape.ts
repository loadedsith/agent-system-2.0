// P-11 row 1 as its own extension (astra review S4): the turn shape of a message to Jo, refused at a
// top-level session's stop. Hands never talk to Jo (and OMP fires no session_stop for them). The
// orchestrator is held to its own rule: it hands Jo no command at all.
import { checkTurnShape } from "../src/rows/r01-turn-shape";
import { type GatesAPI, gateSession, messageText } from "../src/session";

export default function turnShapeRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("session_stop", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role === "hand") return undefined;
		const refusal = checkTurnShape(messageText(event.last_assistant_message), s.role === "orchestrator" ? "orchestrator" : "lane");
		return refusal ? { decision: "block", reason: refusal.reason } : undefined;
	});
}
