// The Jo-only boundary, accident grade (PLAN wl-mv654hoqwpfhmo § 6, migration/items/jo-only-boundary.md).
//
// One table of the rows only Jo (through the surface) may write, with the reader that trusts each; the one
// predicate every reader of Jo's authority uses; which processes are agents; and the per-connection TEMP
// triggers `Ledger.open` installs on an agent's connection to a live ledger (layer 1). The gate's half
// (layer 2: eval and bash may not import the ledger module, open the ledger raw or touch the names below) is
// gates/src/rows/r10-raw-ledger.ts and gates/src/eval-code.ts.
//
// Threat model: an agent that by mistake, confusion or a bad instruction writes a row only Jo or the surface
// may write. Not a deliberate same-uid attack (one that rewrites its env, drops a temp trigger it knows of, or
// brings its own SQLite build).
import type { Database } from "bun:sqlite";
import { SURFACE_BY } from "../../surface/src/types";
import { LEDGER_DB_ENV } from "./locality";
import type { InstructionRow } from "./index";

export interface AuthorityRow {
	/** An `instructions.kind`, a control prefix (an `entries` body's `<prefix>:`), or row 11's direct channel. */
	kind: "instruction-kind" | "control-prefix" | "direct-channel";
	/** The kind ("answer"), the prefix without its colon ("plan"), or "direct". */
	name: string;
	/** The one stamp (`created_by`) the reader trusts. */
	writer: string;
	/** Where the reader that trusts the row lives. */
	reader: string;
	authority: "jo-only" | "words, not authority";
}

const jo = (kind: AuthorityRow["kind"], name: string, reader: string): AuthorityRow => ({ kind, name, writer: SURFACE_BY, reader, authority: "jo-only" });

/**
 * Every row only the surface writes for Jo. A control prefix whose WRITERS entry (surface/src/launch.ts)
 * names the surface, and every instructions kind, must be here: ledger/test/authority.test.ts fails on a new
 * one without an entry. `cap:` and `switch:` are listed ahead of their readers (PR-B), which call `joAuthority`.
 */
export const AUTHORITY: readonly AuthorityRow[] = [
	jo("instruction-kind", "instruction", "surface/src/ceiling.ts effectiveCeiling; classifier/src/rounds.ts effectiveRoundLimit; classifier/src/review-stop.ts reviewStopOn; surface/src/launch.ts supersededBy, boundPrs"),
	jo("instruction-kind", "answer", "the question row (Ledger.answerQuestion); surface/src/launch.ts resolutions; classifier/src/lab.ts unspentGrant"),
	jo("instruction-kind", "withdrawal", "the question row (Ledger.withdrawQuestion); surface/src/launch.ts resolutions"),
	jo("instruction-kind", "mode-flip", "the workload row (Ledger.flipMode; schema trigger workloads_mode_needs_instruction)"),
	jo("control-prefix", "launch-requested", "surface/src/launch.ts controlEntries, launchable; surface/src/rank-launch.ts"),
	jo("control-prefix", "plan", "surface/src/launch.ts controlEntries, planFirst"),
	jo("control-prefix", "done", "surface/src/launch.ts controlEntries, doneLine"),
	jo("control-prefix", "repo", "surface/src/decision-log.ts; surface/src/merge-train.ts"),
	jo("control-prefix", "lane-stop", "surface/src/launch.ts validWriter (a `requested` line); surface/src/errors.ts"),
	jo("control-prefix", "ceiling", "surface/src/ceiling.ts effectiveCeiling"),
	jo("control-prefix", "lane-model", "surface/src/launch.ts laneModel"),
	jo("control-prefix", "superseded", "surface/src/launch.ts supersededBy"),
	jo("control-prefix", "pair-taken", "surface/src/errors.ts; surface/src/pair-suggest.ts pairTakenQuestion"),
	jo("control-prefix", "test-pr", "surface/src/launch.ts boundPrs"),
	jo("control-prefix", "train", "surface/src/launch.ts boundPrs; surface/src/merge-train.ts trainPrs"),
	jo("control-prefix", "scratch-removed", "gates/src/scratch.ts SCRATCH_ENTRY"),
	jo("control-prefix", "scratch-remove-failed", "gates/src/scratch.ts SCRATCH_ENTRY"),
	jo("control-prefix", "rank-goals", "surface/src/rank.ts currentGoals"),
	jo("control-prefix", "rank-override", "surface/src/rank.ts; surface/src/rank-audit.ts"),
	jo("control-prefix", "rank-unpin", "surface/src/rank.ts"),
	jo("control-prefix", "rank-audit", "surface/src/rank-audit.ts; surface/src/render.ts"),
	jo("control-prefix", "cap", "PR-B's cap reader, through joAuthority"),
	jo("control-prefix", "switch", "PR-B's switch reader, through joAuthority"),
	{
		kind: "direct-channel",
		name: "direct",
		writer: "the lane's own id (gates/src/rows/r11-jo-instruction.ts recordJoInstruction)",
		reader: "none: no reader takes it as Jo's authority (joAuthority is false for it)",
		authority: "words, not authority",
	},
];

/**
 * Jo's authority: an instruction authored `jo` and written by the surface. Row 11's direct channel (author
 * `jo`, the lane's stamp) is Jo's words, not Jo's authority, and is false here.
 */
export function joAuthority(i: Pick<InstructionRow, "author" | "created_by">): boolean {
	return i.author === "jo" && i.created_by === SURFACE_BY;
}

/** The variables that make a process an agent (gates/src/types.ts ROLE_ENV, LANE_ENV, WORKLOAD_ENV). */
export const AGENT_CONTEXT_ENV = ["AGENT_SYSTEM_ROLE", "AGENT_SYSTEM_LANE_ID", "AGENT_SYSTEM_WORKLOAD_ID"] as const;

/**
 * An agent context: a role other than `orchestrator`, or a lane or workload id. The top-level orchestrator
 * (role `orchestrator`, no ids) and Jo's terminal (no role) are not; a process a lane starts inherits the tags.
 */
export function agentContext(env: Record<string, string | undefined> = process.env): boolean {
	const role = env.AGENT_SYSTEM_ROLE;
	return (!!role && role !== "orchestrator") || !!env.AGENT_SYSTEM_LANE_ID || !!env.AGENT_SYSTEM_WORKLOAD_ID;
}

/**
 * The names an agent may not set, unset or override (layer 2): the agent-context tags, and the only inputs
 * that change the live-root set (AGENT_SYSTEM_LEDGER_DB and the test preload's AS2_TEST_* names).
 */
export function boundaryEnvName(name: string): boolean {
	return (AGENT_CONTEXT_ENV as readonly string[]).includes(name) || name === LEDGER_DB_ENV || name.startsWith("AS2_TEST_");
}

/** The words every refusal carries, the gate's and the triggers'. */
export const BOUNDARY = "Jo-only boundary";

const sql = (s: string) => `'${s.replaceAll("'", "''")}'`;
const SURFACE = sql(SURFACE_BY);
const STAMP_REFUSED = sql(`${BOUNDARY}: an agent process may not write a row stamped ${SURFACE_BY}; only the surface writes it, for Jo (ledger/src/authority.ts)`);
const JO_REFUSED = sql(`${BOUNDARY}: an agent process may write author jo only as row 11's direct channel (kind instruction, channel direct, no question, its own stamp)`);

/** Tables the triggers guard, and whether a row carries `changed_by` (updated rows) or only `created_by` (append-only). */
const GUARDED: readonly [table: string, updatable: boolean][] = [
	["workloads", true],
	["slices", true],
	["messages", true],
	["questions", true],
	["instructions", false],
	["entries", false],
];

/**
 * The boundary's triggers: TEMP, so they live on this connection only and write nothing to the file (no
 * `sqlite_master` row, no schema_version change), on `main.<table>` so they bind to the file's tables
 * (https://sqlite.org/lang_createtrigger.html § 7). There is no way to turn them off on the connection
 * short of dropping them by name in raw SQL, which the gate refuses an agent.
 */
function triggerSql(): string {
	const out: string[] = [];
	const trigger = (name: string, event: string, table: string, when: string, message: string) =>
		out.push(`CREATE TEMP TRIGGER IF NOT EXISTS jo_only_${name} BEFORE ${event} ON main.${table} WHEN ${when} BEGIN SELECT RAISE(ABORT, ${message}); END;`);
	for (const [t, updatable] of GUARDED) {
		trigger(`${t}_insert_stamp`, "INSERT", t, `NEW.created_by = ${SURFACE}`, STAMP_REFUSED);
		trigger(`${t}_update_stamp`, "UPDATE", t, updatable ? `NEW.changed_by = ${SURFACE}` : `NEW.created_by = ${SURFACE}`, STAMP_REFUSED);
	}
	const notRow11 = "NEW.author = 'jo' AND NOT (NEW.kind = 'instruction' AND NEW.channel = 'direct' AND NEW.question_id IS NULL)";
	trigger("instructions_insert_jo", "INSERT", "instructions", notRow11, JO_REFUSED);
	trigger("instructions_update_jo", "UPDATE", "instructions", notRow11, JO_REFUSED);
	return out.join("\n");
}

const TRIGGERS = triggerSql();

/** Install the boundary's triggers on `db` (an agent's connection to a live ledger). Idempotent. */
export function installBoundary(db: Database): void {
	db.exec(TRIGGERS);
}
