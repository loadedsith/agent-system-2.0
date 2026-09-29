// P-11 row 9 as its own extension (astra review S4): no file write on a protected branch.
import { checkProtectedEdit } from "../src/rows/r09-protected-edit";
import { type GatesAPI, gateSession } from "../src/session";

export default function protectedEditRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		return checkProtectedEdit(event, { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode }) ?? undefined;
	});
}
