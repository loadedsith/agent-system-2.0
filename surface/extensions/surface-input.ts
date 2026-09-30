// Jo's one-word inputs at the surface (SPEC-2.0.md § A1.2, § B3 item 5, § B13.1): a stakes or mode
// word, an option name, `withdraw`, `approve <id>` / `deny <id>`. Read from the turn's prompt in
// `before_agent_start` rather than from the `input` event, because OMP emits `input` only from the
// interactive TUI (modes/controllers/input-controller.ts:966) and the surface has to behave the same
// from the TUI, an rpc front-end and `omp -p`. The word is applied through the ledger module as
// author "jo", channel "surface" (§ B5), Jo is notified at once, and the receipt is queued for the
// wake row (registered after this one) to put in the turn's context, so the model's reply reflects
// the new state. Anything not recognised passes through untouched.
import { apply, interpret } from "../src/input";
import { surfaceSession } from "../src/session";
import type { SurfaceAPI } from "../src/types";

export default function surfaceInputRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("before_agent_start", (event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const text = event.prompt.trim();
		if (!text || text.split(/\s+/).length > 2) return undefined;
		let receipt: string;
		try {
			const cmd = interpret(s.ledger(), text);
			if (!cmd) return undefined;
			receipt = apply(s.ledger(), cmd);
		} catch (err) {
			receipt = `could not apply "${text}": ${String(err)}`;
		}
		s.notices.push(receipt);
		pi.appendEntry("surface-input", { text, receipt });
		ctx.ui.notify(receipt, receipt.startsWith("could not") ? "warning" : "info");
		return undefined;
	});
}
