// P-11 row 8 as its own extension (astra review S4): a push waits on a successful rebase, recorded
// here from bash results, onto the push target's freshly fetched upstream.
import { resolve } from "node:path";
import { blockingSuccess, checkPushRebase } from "../src/rows/r08-push-rebase";
import { type GatesAPI, gateSession } from "../src/session";

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
		return checkPushRebase(event, { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode }, s.rebases) ?? undefined;
	});
}
