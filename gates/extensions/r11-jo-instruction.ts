// P-11 row 11 as its own extension (astra review S4): Jo's direct instruction to a bound lane is
// recorded in the ledger before the turn it starts. A failed write consumes the input (`handled`),
// so no turn runs on an unrecorded instruction, and says so; the recorder holds the text and the
// next input retries it first (astra review B6).
import { type GatesAPI, gateSession } from "../src/session";

export default function joInstructionRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("input", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (!s.bound || !s.instructions) return undefined;
		const outcome = s.instructions.onInput(event.text, event.source);
		if (outcome.ok) return undefined;
		ctx.ui.notify(
			`P-11 row 11: Jo's instruction was NOT recorded in the ledger (${outcome.error}), so no turn was started. ` +
				`${outcome.held.length} instruction(s) are held and will be recorded before the next input runs; send the next message once the ledger is writable.`,
			"error",
		);
		return { handled: true };
	});
}
