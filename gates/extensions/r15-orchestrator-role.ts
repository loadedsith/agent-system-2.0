// P-11 row 15 as its own extension (astra review S4): the orchestrator opens workloads and does no
// lane work. Off the orchestrator (a lane or a hand) the handler returns undefined.
import { checkOrchestratorRole } from "../src/rows/r15-orchestrator-role";
import { type GatesAPI, gateSession } from "../src/session";

export default function orchestratorRoleRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role !== "orchestrator") return undefined;
		return checkOrchestratorRole(event, { role: s.role, cwd: ctx.cwd, env }) ?? undefined;
	});
}
