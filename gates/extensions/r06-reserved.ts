// P-11 row 6 as its own extension (astra review S4): the § A4 reserved actions, refused from any agent.
// Each refusal naming a reserved action is recorded as a `reserved-request` entry on the session's
// workload, which the orchestrator surface shows as § B3 item 1 until Jo approves or denies it
// (surface/src/errors.ts waitingReserved); a session with no workload records a session entry
// instead, as the fence does for its off-row (src/fence.ts).
import { checkReserved, reservedAction, reservedRequestBody } from "../src/rows/r06-reserved";
import { type GatesAPI, gateSession } from "../src/session";

export default function reservedRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		const refusal = checkReserved(event, { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode });
		const action = reservedAction(refusal);
		if (action) {
			const body = reservedRequestBody(event, action, event.toolCallId);
			try {
				if (s.workloadId) s.ledger().recordEntry({ workloadId: s.workloadId, sliceId: s.currentSlice(), kind: "reserved-request", body, by: s.laneId });
				else pi.appendEntry("p11-reserved-request", { body });
			} catch (err) {
				ctx.ui.notify(`P-11 row 6 refused a reserved action and the reserved-request entry could not be written: ${String(err)}`, "warning");
			}
		}
		return refusal ?? undefined;
	});
}
