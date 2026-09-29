// The P-11 gates (DESIGN-2.0.md:334-354; MIGRATION.md:49, M4), every row loaded as one OMP
// extension. Each row is also its own extension file under extensions/ (astra review S4), so a
// profile lists either this file (all rows) or the row files it wants, never both: a row loaded
// twice registers its handlers twice. Rows that share state find it through src/session.ts.
// Children re-bind extensions (task/executor.ts:3795-3796), so one registration covers the
// orchestrator, lanes and hands; each row reads the role per session.
//
// Registration order is behaviour, because OMP runs handlers in order and stops at the first
// refusal (runner.ts emitToolCall; emit() for session_stop):
// - tool_call mirrors checkToolCall in src/gates.ts: ask, wake, the dispatch rows, then the raw
//   ledger, reserved, protected-edit and push rows (row 8 fetches, so it is last). Row 3's hand
//   yield flagging registers earlier; it only revises input, and any later refusal still wins.
// - session_stop runs row 3's receipt flags before row 7 or row 1 can block the stop.
// - before_agent_start sets the mode before row 7 renders its wake message.
import askPolicyRow from "./extensions/r14-ask-policy";
import briefFieldsRow from "./extensions/r05-brief-fields";
import contractRow from "./extensions/r02-contract";
import joInstructionRow from "./extensions/r11-jo-instruction";
import protectedEditRow from "./extensions/r09-protected-edit";
import pushRebaseRow from "./extensions/r08-push-rebase";
import questionRow from "./extensions/question";
import rawLedgerRow from "./extensions/r10-raw-ledger";
import receiptsRow from "./extensions/r03-receipts";
import reservedRow from "./extensions/r06-reserved";
import tierNameRow from "./extensions/r04-tier-name";
import turnShapeRow from "./extensions/r01-turn-shape";
import wakeReadRow from "./extensions/r07-wake-read";
import type { GatesAPI } from "./src/session";

export type { GatesAPI } from "./src/session";

export default function p11Gates(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	contractRow(pi, env);
	receiptsRow(pi, env);
	askPolicyRow(pi, env);
	wakeReadRow(pi, env);
	tierNameRow(pi);
	briefFieldsRow(pi, env);
	questionRow(pi, env);
	rawLedgerRow(pi, env);
	reservedRow(pi, env);
	protectedEditRow(pi, env);
	pushRebaseRow(pi, env);
	turnShapeRow(pi, env);
	joInstructionRow(pi, env);
}
