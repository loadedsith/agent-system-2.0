// P-11 row 15 as its own extension (astra review S4): the orchestrator opens workloads and does no
// lane work, and records Jo's answer before it works on (M7 fix round 2, finding B). The answer is
// the question row's state (MIGRATION.md item 105: no session result and no clock is read), a
// launch or close naming one workload waits only on the rows about that workload (item 72), and a
// reply the gates withheld refuses work until one passes. Off the orchestrator (a lane or a hand)
// the handler returns undefined.
import { checkOrchestratorRole, type EntryLike, unansweredQuestion } from "../src/rows/r15-orchestrator-role";
import { type GatesAPI, gateSession } from "../src/session";

export default function orchestratorRoleRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role !== "orchestrator") return undefined;
		try {
			const unanswered = () => (s.heldReply ? { kind: "held" as const, reason: s.heldReply.reason } : unansweredQuestion(ctx.sessionManager.getEntries() as EntryLike[], () => s.ledger()));
			return checkOrchestratorRole(event, { role: s.role, cwd: ctx.cwd, env }, unanswered) ?? undefined;
		} catch (err) {
			// Cannot tell (typically the ledger could not be read for Jo's recorded answer): refuse rather than let the call pass unchecked.
			return { block: true, reason: `P-11 row 15 could not check this call (${String(err)}); nothing was run` };
		}
	});
}
