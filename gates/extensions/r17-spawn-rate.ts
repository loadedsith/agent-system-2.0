// P-11 row 17 as its own extension (astra review S4): a lane whose recent `hand-spawn:` entries reach
// the burst or flood limit is refused until they age out. Applies to any session with a workload
// (a hand inherits its lane's workload and lane id, so its dispatches count against its lane). The
// limits are read once, at registration, so a rejected GATE_SPAWN_LIMITS is said once.
import { checkSpawnRate, spawnLimitsFrom } from "../src/rows/r17-spawn-rate";
import { type GatesAPI, gateSession } from "../src/session";

export default function spawnRateRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	const limits = spawnLimitsFrom(env);
	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "task") return undefined;
		const s = gateSession(ctx, env);
		if (!s.workloadId) return undefined;
		return checkSpawnRate({ id: s.workloadId, ledger: () => s.ledger() }, { laneId: s.laneId, limits }) ?? undefined;
	});
}
