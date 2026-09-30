// Jo's one-word inputs at the surface (SPEC-2.0.md § A1.2, § B3 item 5, § B13.1): a stakes or mode
// word, an option name, `withdraw`, `approve <id>` / `deny <id>`. Read from the turn's prompt in
// `before_agent_start` rather than from the `input` event, because OMP emits `input` only from the
// interactive TUI (modes/controllers/input-controller.ts:966) and the surface has to behave the same
// from the TUI, an rpc front-end and `omp -p`. The word is applied through the ledger module as
// author "jo", channel "surface" (§ B5), Jo is notified at once, and the receipt is queued for the
// wake row (registered after this one) to put in the turn's context, so the model's reply reflects
// the new state. Anything not recognised passes through untouched.
//
// Lane launcher (DESIGN-lane-launcher.md decisions 7 and 9): an answer or a withdrawal is a
// resolution a parked lane resumes on, so the launch trigger runs after it; a flip to autonomous
// writes Jo's `launch-requested:` cause and runs the trigger; a flip to user-driven while an
// autonomous lane holds the workload writes the `lane-stop:` request the runner accepts.
import { apply, interpret } from "../src/input";
import { heldLive, laneStopRequestBody, launchRequestedBody } from "../src/launch";
import { surfaceSession } from "../src/session";
import { type SurfaceAPI, SURFACE_BY } from "../src/types";
import { triggerLaunch } from "./launch";

export default function surfaceInputRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("before_agent_start", async (event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const text = event.prompt.trim();
		if (!text || text.split(/\s+/).length > 2) return undefined;
		let receipt: string;
		try {
			const ledger = s.ledger();
			const cmd = interpret(ledger, text);
			if (!cmd) return undefined;
			receipt = apply(ledger, cmd);
			if (cmd.kind === "mode") {
				const w = ledger.workload(cmd.workloadId);
				if (cmd.mode === "user-driven" && w && w.holder?.startsWith("lane-") && heldLive(w, ledger.now())) {
					ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: laneStopRequestBody(w.holder, "mode-flip", "jo") });
					receipt += `; stop requested of ${w.holder} (it accepts at its next poll)`;
				} else if (cmd.mode === "autonomous") {
					ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: launchRequestedBody("jo", ledger.now(), "mode-flip") });
				}
			}
			if (cmd.kind === "answer" || cmd.kind === "withdraw" || (cmd.kind === "mode" && cmd.mode === "autonomous")) {
				const launched = await triggerLaunch(pi, ledger, env, cmd.workloadId, "jo");
				if (launched.line) receipt += `; ${launched.line}`;
			}
		} catch (err) {
			receipt = `could not apply "${text}": ${String(err)}`;
		}
		s.notices.push(receipt);
		pi.appendEntry("surface-input", { text, receipt });
		ctx.ui.notify(receipt, receipt.startsWith("could not") ? "warning" : "info");
		return undefined;
	});
}
