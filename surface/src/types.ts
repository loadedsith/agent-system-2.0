// Constants the orchestrator surface shares across its rows (MIGRATION.md M5; SPEC-2.0.md § A1.2,
// § A3, § B3, § B7, § B13.1). The surface reuses the gates' structural slice of OMP's extension API
// (gates/src/session.ts) so it loads and tests without the OMP package on the module path, and adds
// here the events and actions its own rows use beyond the gates' slice (measured on OMP 18.3.0,
// pi-coding-agent/src/extensibility/extensions/types.ts: ExtensionAPI.on for tool_approval_requested
// / tool_approval_resolved :1294-1295, tool_execution_end :1282, session_shutdown :1258;
// ExtensionAPI.sendMessage :1438-1441; ExtensionContext.setInterval :491, isIdle :455).
import type { Ctx as GatesCtx, GatesAPI, ToolResult } from "../../gates/src/session";

export type { ToolResult } from "../../gates/src/session";
export { ROLE_ENV } from "../../gates/src/types";

/** The session context as the surface rows see it: the gates' slice plus the timer and idle query. */
export type Ctx = GatesCtx & {
	setInterval?(callback: () => void, ms: number): unknown;
	isIdle?(): boolean;
};
type Handler<E, R = unknown> = (event: E, ctx: Ctx) => R | Promise<R>;

/** The extension API as the surface rows see it: the gates' slice plus the lane-boundary events and the push action. */
export type SurfaceAPI = GatesAPI & {
	on(event: "tool_approval_requested", h: Handler<{ sessionId: string; toolCallId: string; toolName: string; reason?: string }>): void;
	on(event: "tool_approval_resolved", h: Handler<{ sessionId: string; toolCallId: string; toolName: string; approved: boolean; reason?: string }>): void;
	on(event: "tool_execution_end", h: Handler<{ toolCallId: string; toolName: string; result: unknown; isError: boolean }>): void;
	on(event: "session_shutdown", h: Handler<{ type: "session_shutdown" }>): void;
	/** OMP 18.3.0: `deliverAs: "aside"` injects at the next step boundary; an idle session starts a turn regardless of `triggerTurn`. */
	sendMessage?(message: { customType: string; content: string; display: boolean }, options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" | "aside" }): void;
};

/** The provenance stamp on every write the surface makes. */
export const SURFACE_BY = "orchestrator-surface";

/**
 * The orchestrator's standing workload: the one open workload that carries rows belonging to no
 * piece of work — the identity entry and scheduled rows. Opened on first wake, never closed.
 * The ledger's `entries` need an open workload (schema.sql entries_insert_workload), so the identity
 * row lives here rather than on whichever workload happens to be open.
 */
export const STANDING_WORKLOAD_ID = "wl-orchestrator";
export const STANDING_BRIEF = "orchestrator standing workload: identity and scheduled rows (never closed)";

/** Body prefix of the identity entry (kind `assumption`): `identity: <name> (<pronouns>)`. */
export const IDENTITY_PREFIX = "identity:";
/** Brief prefix of a scheduled row (M11): `due:<ISO date> <what to do>`; a workload of its own. */
export const DUE_PREFIX = "due:";
/** Body prefix of a lane→orchestrator message reporting a failed runtime artifact (§ B3 item 3). */
export const ARTIFACT_FAILED_PREFIX = "artifact-failed:";
/** Body prefix of a lane→orchestrator message reporting the same artifact passing: recovery clears the count (Codex S3). */
export const ARTIFACT_PASSED_PREFIX = "artifact-passed:";
/** How many artifact failures on one slice, since the last pass, reach the surface (§ B3 item 3: "twice", Jo's to change). */
export const ARTIFACT_FAILURES_SURFACED = 2;
/** Body prefix of the `assumption` entry a lane writes to declare a slice's runtime-artifact command (surface/src/signals.ts). */
export const ARTIFACT_COMMAND_PREFIX = "artifact-command:";
/** Body prefix of a message recording that a lane's session is gone with the workload still open (§ B3 item 4). */
export const LANE_DIED_PREFIX = "lane-died:";
/** Body prefixes of the leaked-prompt safety net (§ B3 item 5, first trigger): a wait began / it ended. */
export const PROMPT_WAIT_PREFIX = "prompt-wait:";
export const PROMPT_RESOLVED_PREFIX = "prompt-resolved:";
/** The recipient of every lane→orchestrator signal message; the surface consumes them at read. */
export const ORCHESTRATOR_RECIPIENT = "orchestrator";
/** § A3: a held thing older than this surfaces unsolicited. */
export const HOLD_HOURS = 4;
/** § B7: the last N ledger entries rendered per workload. */
export const LAST_N = 8;

/** Environment overrides. */
export const VOICE_ENV = "AGENT_SYSTEM_VOICE";
export const DECISION_LOG_ENV = "AGENT_SYSTEM_DECISION_LOG";
/** A lane's workload lease in ms (renewed at a third of it); default LEASE_MS. */
export const LEASE_MS_ENV = "AGENT_SYSTEM_LEASE_MS";
export const LEASE_MS = 15 * 60_000;
/** How often the surface re-reads the ledger between wakes for the § B3 lines (ms); default POLL_MS. */
export const POLL_MS_ENV = "AGENT_SYSTEM_SURFACE_POLL_MS";
export const POLL_MS = 60_000;

/** Tools the surface registers on the orchestrator session. */
export const WAKE_READ_TOOL = "orchestrator_wake_read";
export const IDENTITY_TOOL = "orchestrator_identity";
export const OPEN_WORKLOAD_TOOL = "orchestrator_open_workload";
export const CLOSE_WORKLOAD_TOOL = "orchestrator_close_workload";
export const SCHEDULE_TOOL = "orchestrator_schedule";
/** Record Jo's answer or instruction on an open workload as an `instructions` row (M7 fix round 2, finding B). */
export const RECORD_INSTRUCTION_TOOL = "orchestrator_record_instruction";
/** Read the ledger between wakes: the wake render on demand (M7 fix round 2, finding C). */
export const LEDGER_TOOL = "orchestrator_ledger";
export const SURFACE_TOOLS = [WAKE_READ_TOOL, IDENTITY_TOOL, OPEN_WORKLOAD_TOOL, CLOSE_WORKLOAD_TOOL, SCHEDULE_TOOL, RECORD_INSTRUCTION_TOOL, LEDGER_TOOL] as const;
/** Surface tools that read rather than work (P-11 row 3's working-call test): the wake read records only that it read. */
export const SURFACE_READ_TOOLS = [WAKE_READ_TOOL, LEDGER_TOOL] as const;
/**
 * Surface tools that move a workload on — open, close, schedule — refused on the orchestrator while
 * a QUESTION it sent Jo about an open workload has no instruction row newer than it (P-11 row 15,
 * M7 fix round 2, finding B).
 */
export const HAND_ON_TOOLS = [OPEN_WORKLOAD_TOOL, CLOSE_WORKLOAD_TOOL, SCHEDULE_TOOL] as const;
/** The one tool the surface registers on a lane session: declare a slice's runtime-artifact command (surface/extensions/lane.ts). */
export const ARTIFACT_TOOL = "slice_artifact";

/** The one-word flips Jo can type at the surface (§ A1.2, § B13.1). */
export const STAKES_WORDS = ["throwaway", "normal", "production"] as const;
export const MODE_WORDS = ["autonomous", "user-driven"] as const;
