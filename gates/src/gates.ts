// The tool-call rows of P-11 (DESIGN-2.0.md:334-354) composed in one pass. OMP-free: gates/index.ts
// feeds it OMP's `tool_call` events; the tests feed it plain objects. First refusal wins, and the
// order puts the cheap, local checks first and row 8 (which fetches) last.
import type { GateLedger } from "./ledger-port";
import { checkQuestionDispatch } from "./rows/question";
import { checkTierName } from "./rows/r04-tier-name";
import { checkBriefFields } from "./rows/r05-brief-fields";
import { checkReserved } from "./rows/r06-reserved";
import type { WakeRead } from "./rows/r07-wake-read";
import { checkPushRebase } from "./rows/r08-push-rebase";
import { checkProtectedEdit } from "./rows/r09-protected-edit";
import { checkRawLedgerWrite } from "./rows/r10-raw-ledger";
import { checkAsk } from "./rows/r14-ask-policy";
import type { CallContext, Refusal, ToolCall } from "./types";

export interface GateDeps {
	/** The lane's workload and ledger, when the session is bound to one. */
	workload?: { id: string; ledger: () => GateLedger } | null;
	wake?: WakeRead | null;
}

export function checkToolCall(call: ToolCall, ctx: CallContext, deps: GateDeps = {}): Refusal {
	const ask = checkAsk(call.toolName, ctx.role, ctx.mode);
	if (ask) return ask;
	const wake = deps.wake?.check(call);
	if (wake) return wake;
	if (call.toolName === "task") {
		const r = checkTierName(call.input) ?? checkBriefFields(call.input);
		if (r) return r;
		if (deps.workload) {
			try {
				const q = checkQuestionDispatch(call.input, deps.workload.ledger(), deps.workload.id);
				if (q) return q;
			} catch (err) {
				return { block: true, reason: `P-11 question row could not read the ledger to check this dispatch against open questions (${String(err)}); refusing rather than pass unchecked.` };
			}
		}
		return null;
	}
	return checkRawLedgerWrite(call, ctx) ?? checkReserved(call, ctx) ?? checkProtectedEdit(call, ctx) ?? checkPushRebase(call, ctx);
}
