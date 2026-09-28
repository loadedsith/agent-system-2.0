// P-11 row 11 (DESIGN-2.0.md:348; SPEC-2.0.md:428-429 § B5): Jo's direct instruction to a lane is
// recorded as a ledger entry, same as a surface message — written by machinery before the lane's
// turn, through the ledger module. Nothing to refuse. Trigger: OMP's `input` event with source
// "interactive" (a person typed it; omp types.ts:913-918) in a lane bound to a workload.
import type { GateLedger } from "../ledger-port";

export interface InstructionInput {
	text: string;
	source: "interactive" | "rpc" | "extension";
	workloadId: string;
	laneId: string;
}

/**
 * Records the instruction; returns its id, or null when the input is not Jo's instruction
 * (non-interactive source, empty, or a harness slash command). Throws when the ledger write fails:
 * the adapter surfaces that loudly rather than letting the turn start on an unrecorded instruction.
 */
export function recordJoInstruction(ledger: Pick<GateLedger, "recordInstruction">, input: InstructionInput): string | null {
	const body = input.text.trim();
	if (input.source !== "interactive" || body === "" || /^\/[\w:-]+(\s|$)/.test(body)) return null;
	return ledger.recordInstruction({ by: input.laneId, workloadId: input.workloadId, body, author: "jo", channel: "direct" });
}
