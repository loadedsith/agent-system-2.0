// Shared shapes for the P-11 gates (DESIGN-2.0.md:334-354). No OMP import: the gates are pure
// functions over these shapes, and gates/index.ts adapts OMP's extension events to them, so the
// tests run offline from a fresh clone without the OMP package.
import type { Ledger, Mode } from "../../ledger/src/index";

/** The subset of the ledger module (schema v3) the gates call. `Ledger` satisfies it. */
export type GateLedger = Pick<
	Ledger,
	"workload" | "slice" | "question" | "recordInstruction" | "instructions" | "raiseQuestion" | "provenance" | "inFlight" | "recordEntry" | "entries"
>;

/** The four dispatchable tier files. Contract with M3 (tiers/): hard-coded here, not read. */
export const DISPATCHABLE_TIERS = ["fast", "standard", "strong", "deep"] as const;

/** Branch names protected from edits (row 9), pushes (row 6) and ref moves. From careful-guard.mjs PROTECTED_REF. */
export const PROTECTED_BRANCH = /^(?:main|master|production|prod|release)$/i;

/** Who this session is. `hand` = any subagent session; `lane`/`orchestrator` = a top-level session. */
export type Role = "orchestrator" | "lane" | "hand";

/**
 * Lane binding, set by whatever launches a 2.0 top-level session (M5's surface). Hands share the
 * process env, so role detection reads the session first (see gates/index.ts) and these second.
 */
export const ROLE_ENV = "AGENT_SYSTEM_ROLE";
export const WORKLOAD_ENV = "AGENT_SYSTEM_WORKLOAD_ID";
export const LANE_ENV = "AGENT_SYSTEM_LANE_ID";

/** A gate's verdict on a tool call. `null` = no objection. */
export type Refusal = { block: true; reason: string } | null;

export interface ToolCall {
	toolName: string;
	input: Record<string, unknown>;
}

/** What the tool-call rows need to know about the session they run in. */
export interface CallContext {
	role: Role;
	cwd: string;
	env: Record<string, string | undefined>;
	/** The lane's workload mode, when the session is a lane bound to a workload. */
	mode?: Mode | null;
}
