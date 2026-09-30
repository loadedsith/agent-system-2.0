// P-11 row 8 as its own extension (astra review S4): a push waits on a successful rebase, recorded
// here from bash results, onto the push target's freshly fetched upstream. Refusals in a row on one
// slice become lane→orchestrator `artifact-failed:` messages (§ B3 item 3, PushFailures).
import { resolve } from "node:path";
import { blockingSuccess, checkPushRebase, pushChecked } from "../src/rows/r08-push-rebase";
import { type GatesAPI, gateSession } from "../src/session";

/** The recipient of lane→orchestrator messages (surface/src/errors.ts reads them by body prefix and slice). */
const ORCHESTRATOR = "orchestrator";

export default function pushRebaseRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const cwd = typeof event.input.cwd === "string" ? resolve(ctx.cwd, event.input.cwd) : ctx.cwd;
		const s = gateSession(ctx, env);
		s.rebases.observe(String(s.originalInput(event).command ?? ""), cwd, env, blockingSuccess(event.details, event.isError));
		return undefined;
	});

	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		const callCtx = { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode };
		const refusal = checkPushRebase(event, callCtx, s.rebases);
		if (!refusal) {
			if (pushChecked(event, callCtx)) s.pushFailures.passed();
			return undefined;
		}
		// A session with no workload has no slice the surface could name, so no message is owed.
		if (s.workloadId) {
			try {
				const slice = s.currentSlice();
				if (slice) {
					for (const body of s.pushFailures.refused(slice, event.toolCallId ?? "unknown", refusal.reason)) {
						s.ledger().enqueue({ by: s.laneId, workloadId: s.workloadId, sliceId: slice, sender: s.laneId, recipient: ORCHESTRATOR, body });
					}
				}
			} catch (err) {
				ctx.ui.notify(`P-11 row 8 refused a push and the artifact-failed message to the orchestrator could not be written: ${String(err)}`, "warning");
			}
		}
		return refusal;
	});
}
