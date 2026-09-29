// P-11 row 14 and the mode rows as their own extension (astra review S4): before each turn the
// active tool set is switched to the workload's mode (a lane has `ask` only in user-driven mode, a
// hand never), the effective mode is recorded in the ledger, and `ask` is refused at the call as the
// backstop. The profile's `approvalMode: yolo` stands (Plumb's call); `ask` is removed here per role
// and mode instead of by approval prompts.
import { checkAsk, ModeController } from "../src/rows/r14-ask-policy";
import { type GatesAPI, gateSession } from "../src/session";

export default function askPolicyRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("before_agent_start", async (_e, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role === "hand") {
			await new ModeController("hand", pi, () => null).beforeTurn();
			return undefined;
		}
		if (s.role !== "lane") return undefined;
		const workloadId = s.workloadId;
		s.modes ??= new ModeController(
			"lane",
			pi,
			() => (workloadId ? (s.ledger().workload(workloadId)?.mode ?? null) : null),
			workloadId ? { workloadId, laneId: s.laneId, ledger: () => s.ledger() } : undefined,
		);
		try {
			s.mode = await s.modes.beforeTurn();
			if (s.mode.note) pi.appendEntry("p11-mode", s.mode);
		} catch (err) {
			s.mode = { mode: null, askActive: false, effective: false, note: String(err) };
		}
		return undefined;
	});

	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		return checkAsk(event.toolName, s.role, s.mode?.mode) ?? undefined;
	});
}
