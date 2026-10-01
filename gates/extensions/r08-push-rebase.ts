// P-11 row 8 as its own extension (astra review S4): a push waits on containing the push target's
// freshly fetched upstream and on a passing test record for its tree on the session's workload,
// read from the ledger (`artifact-tree:`, written by surface/extensions/lane.ts). Refusals in a row
// on one slice become lane→orchestrator `artifact-failed:` messages (§ B3 item 3, PushFailures); the
// let-through push that then succeeds ends the run with one `artifact-passed:` (M5 fix round 1,
// Codex S3: decided on the result, since a let-through push the remote rejects is not a pass).
import { artifactTrees } from "../../surface/src/signals";
import { blockingSuccess, checkPushRebase, pushChecked } from "../src/rows/r08-push-rebase";
import { type GatesAPI, gateSession } from "../src/session";

/** The recipient of lane→orchestrator messages (surface/src/signals.ts reads them by body prefix and slice). */
const ORCHESTRATOR = "orchestrator";

export default function pushRebaseRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const s = gateSession(ctx, env);
		const original = String(s.originalInput(event).command ?? "");
		const ok = blockingSuccess(event.details, event.isError);
		const callCtx = { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode };
		if (ok && pushChecked({ toolName: "bash", input: { ...event.input, command: original } }, callCtx)) {
			const slice = s.workloadId ? s.currentSlice() : null;
			const body = s.pushFailures.passed(slice, event.toolCallId ?? "unknown");
			if (body && s.workloadId && slice) {
				try {
					s.ledger().enqueue({ by: s.laneId, workloadId: s.workloadId, sliceId: slice, sender: s.laneId, recipient: ORCHESTRATOR, body });
				} catch (err) {
					ctx.ui.notify(`P-11 row 8 let a push through and the artifact-passed message to the orchestrator could not be written: ${String(err)}`, "warning");
				}
			}
		}
		return undefined;
	});

	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		const callCtx = { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode };
		const workloadId = s.workloadId;
		const refusal = checkPushRebase(event, callCtx, workloadId ? () => artifactTrees(s.ledger(), workloadId) : null);
		if (!refusal) return undefined;
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
