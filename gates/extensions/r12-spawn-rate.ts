// P-11 row 12 as its own extension (astra review S4): a session spawning hands faster than the burst
// or flood limit is refused until its earlier spawns age out. Registered after the other dispatch
// rows, so a call they refuse never reaches this handler and never counts as a spawn.
import { type GatesAPI, gateSession } from "../src/session";

export default function spawnRateRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => (event.toolName === "task" ? (gateSession(ctx, env).spawnRate.admit(event.input) ?? undefined) : undefined));
}
