// The P-11 question row as its own extension (astra review S4): a change dispatch waits on an open question of its slice.
import { checkQuestionRow } from "../src/gates";
import { type GatesAPI, gateSession } from "../src/session";

export default function questionRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (event.toolName !== "task" || !s.bound) return undefined;
		return checkQuestionRow(event.input, { id: s.workloadId!, ledger: () => s.ledger() }) ?? undefined;
	});
}
