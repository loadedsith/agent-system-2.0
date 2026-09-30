// Constants the orchestrator surface shares across its rows (MIGRATION.md M5; SPEC-2.0.md § A1.2,
// § A3, § B3, § B7, § B13.1). The surface reuses the gates' structural slice of OMP's extension API
// (gates/src/session.ts) so it loads and tests without the OMP package on the module path.
export type { Ctx, GatesAPI as SurfaceAPI, ToolResult } from "../../gates/src/session";
export { ROLE_ENV } from "../../gates/src/types";

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
/** How many artifact failures on one slice reach the surface (§ B3 item 3: "twice", Jo's to change). */
export const ARTIFACT_FAILURES_SURFACED = 2;
/** § A3: a held thing older than this surfaces unsolicited. */
export const HOLD_HOURS = 4;
/** § B7: the last N ledger entries rendered per workload. */
export const LAST_N = 8;

/** Environment overrides. */
export const VOICE_ENV = "AGENT_SYSTEM_VOICE";
export const DECISION_LOG_ENV = "AGENT_SYSTEM_DECISION_LOG";

/** Tools the surface registers on the orchestrator session. */
export const WAKE_READ_TOOL = "orchestrator_wake_read";
export const IDENTITY_TOOL = "orchestrator_identity";
export const OPEN_WORKLOAD_TOOL = "orchestrator_open_workload";
export const CLOSE_WORKLOAD_TOOL = "orchestrator_close_workload";
export const SCHEDULE_TOOL = "orchestrator_schedule";
export const SURFACE_TOOLS = [WAKE_READ_TOOL, IDENTITY_TOOL, OPEN_WORKLOAD_TOOL, CLOSE_WORKLOAD_TOOL, SCHEDULE_TOOL] as const;

/** The one-word flips Jo can type at the surface (§ A1.2, § B13.1). */
export const STAKES_WORDS = ["throwaway", "normal", "production"] as const;
export const MODE_WORDS = ["autonomous", "user-driven"] as const;
