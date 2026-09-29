// P-11 row 6 as its own extension (astra review S4): the § A4 reserved actions, refused from any agent.
import { checkReserved } from "../src/rows/r06-reserved";
import { type GatesAPI, gateSession } from "../src/session";

export default function reservedRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		return checkReserved(event, { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode }) ?? undefined;
	});
}
