// The tool-call rows of P-11 (DESIGN-2.0.md:334-354) composed in one pass. OMP-free: the extension
// entry files under gates/extensions/ feed each row OMP's `tool_call` events, and the tests feed this
// composition plain objects. First refusal wins; the order puts the cheap, local checks first and
// row 8 (which fetches) last.
import { checkQuestionDispatch } from "./rows/question";
import { checkTierName } from "./rows/r04-tier-name";
import { checkBriefFields } from "./rows/r05-brief-fields";
import { checkReserved } from "./rows/r06-reserved";
import type { WakeRead } from "./rows/r07-wake-read";
import { checkPushRebase, type TestRecords } from "./rows/r08-push-rebase";
import { checkProtectedEdit } from "./rows/r09-protected-edit";
import { checkRawLedgerWrite } from "./rows/r10-raw-ledger";
import type { SpawnRate } from "./rows/r12-spawn-rate";
import { checkAsk } from "./rows/r14-ask-policy";
import type { CallContext, GateLedger, Refusal, ToolCall } from "./types";

export interface GateDeps {
	/** The lane's workload and ledger, when the session is bound to one. */
	workload?: { id: string; ledger: () => GateLedger } | null;
	wake?: WakeRead | null;
	/** The workload's artifact-tree records (row 8), read when a push is judged; none = every push refused. */
	testRecords?: TestRecords;
	/** This session's spawn counter (row 12); none = the row does not apply. */
	spawnRate?: SpawnRate | null;
}

/** The question row over a `task` call, failing closed when the ledger cannot be read. */
export function checkQuestionRow(input: Record<string, unknown>, workload: GateDeps["workload"]): Refusal {
	if (!workload) return null;
	try {
		return checkQuestionDispatch(input, workload.ledger(), workload.id);
	} catch (err) {
		return { block: true, reason: `P-11 question row could not read the ledger to check this dispatch against open questions (${String(err)}); refusing rather than pass unchecked.` };
	}
}

export function checkToolCall(call: ToolCall, ctx: CallContext, deps: GateDeps = {}): Refusal {
	const ask = checkAsk(call.toolName, ctx.role, ctx.mode);
	if (ask) return ask;
	const wake = deps.wake?.check(call);
	if (wake) return wake;
	if (call.toolName === "task") return checkTierName(call.input) ?? checkBriefFields(call.input, deps.workload?.id ?? null) ?? checkQuestionRow(call.input, deps.workload) ?? deps.spawnRate?.admit(call.input) ?? null;
	return (
		checkRawLedgerWrite(call, ctx) ??
		checkReserved(call, ctx) ??
		checkProtectedEdit(call, ctx) ??
		checkPushRebase(call, ctx, deps.testRecords ?? null)
	);
}
