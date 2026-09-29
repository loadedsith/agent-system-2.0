// P-11 row 10 as its own extension (astra review S4): no raw write to the ledger file outside the module.
import { checkRawLedgerWrite } from "../src/rows/r10-raw-ledger";
import { type GatesAPI, gateSession } from "../src/session";

export default function rawLedgerRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		return checkRawLedgerWrite(event, { role: s.role, cwd: ctx.cwd, env, mode: s.mode?.mode }) ?? undefined;
	});
}
