// P-11 row 15 (tiers/orchestrator.md: "You open workloads and hand them to lanes"; "What you never
// do"): the orchestrator session does no lane work. In Jo's first 2.0 session (M7, 2026-09-30) the
// orchestrator, finding no lane, made a worktree, edited, committed, rebased, pushed and opened
// thewolff/agent-system-2.0 PR #1 itself; every lane row fired correctly and none said "not your
// role". On a session whose role is `orchestrator` this row refuses the lane's tools: the file
// writers (targets.ts WRITE_TOOLS), `write` to anything but one of the surface's ledger-tool
// `xd://` devices, `task` dispatch, `eval`, and any `bash` command that is not read-only.
//
// Read-only is decided by the tables rows 6 and 10 already read (exec.ts, git-model.ts): every
// command the shell would run (expandShell, substitutions and pipes included) is typed as literal
// text with no wrapper and no variable assignment, and is one of: a READ_ONLY_HEADS or OUTPUT_ONLY
// name with no output option (readHeadUnmodeled); a git history read (gitReads: status, log, diff,
// show, rev-parse, branch in list mode, remote with options only, worktree list, each with the
// options git-model allows, so an option that runs a program or writes a file is refused; global
// options per gitUnmodeled); or a `cd` to a literal directory. The only write destination allowed
// is a literal `/dev/null` (writeDestinations lists every redirect target; discarding output writes
// nothing). No inline code and nothing blind. Anything else is refused, an unmodeled form included:
// loud over silent. Lanes and hands are untouched.
//
// Intended ordering (Main, 2026-09-30): row 15 registers before row 6, so a reserved bash action on
// the orchestrator gets this refusal and records no `reserved-request`; the orchestrator never runs
// the command at all, so there is nothing for Jo to approve. Row 6 still records browser writes,
// which row 15 does not refuse.
import { basename, resolve } from "node:path";
import { SURFACE_TOOLS } from "../../../surface/src/types";
import { type Exec, type Expansion, expandShell, gitCall, gitUnmodeled, OUTPUT_ONLY, READ_ONLY_HEADS, readHeadUnmodeled, writeDestinations } from "../exec";
import { gitReads } from "../git-model";
import { WRITE_TOOLS } from "../targets";
import type { CallContext, Refusal, ToolCall } from "../types";

export const ORCHESTRATOR_ROLE_REFUSAL = "the orchestrator opens workloads; a lane does this — open one with orchestrator_open_workload";

/** Tools that do a lane's work outright on the orchestrator: dispatch and code execution. */
const LANE_TOOLS: Record<string, true> = { task: true, eval: true };

/** The `xd://` devices the orchestrator may write: the surface's own ledger tools, mounted as devices. */
const LEDGER_DEVICES: Record<string, true> = Object.fromEntries(SURFACE_TOOLS.map((t) => [`xd://${t}`, true]));

/** A `cd` to one literal directory (or none): it moves the shell, and expandShell tracks where. */
const literalCd = (e: Exec): boolean => e.argv.length <= 2 && e.argv.every((w) => !w.opaque && !w.expanded && !w.glob);

/** Is `e` a read by the exec.ts and git-model.ts tables (see the header)? */
function readOnlyExec(e: Exec, assigned: Expansion["assigned"]): boolean {
	const head = e.argv[0]!;
	const name = basename(head.text);
	if (head.opaque || head.expanded || head.glob || name !== head.text) return false;
	if (e.mods.wrappers.length > 0 || e.mods.assigns.length > 0) return false;
	if (writeDestinations(e).some((w) => w.opaque || w.expanded || w.text !== "/dev/null")) return false;
	if (READ_ONLY_HEADS[name] || OUTPUT_ONLY[name]) return readHeadUnmodeled(e) === null;
	if (name === "cd") return literalCd(e);
	if (name !== "git") return false;
	const g = gitCall(e);
	return g !== null && gitUnmodeled(e, assigned) === null && gitReads(g);
}

/** True when every command `command` runs only reads, by the exec.ts and git-model.ts tables. */
export function readOnlyBash(command: string, cwd: string, env: Record<string, string | undefined>, toolEnv?: unknown): boolean {
	const x = expandShell(command, cwd, env, toolEnv);
	if (x.blind.length > 0 || x.code.length > 0 || x.assigned.size > 0 || x.commands.length === 0) return false;
	return x.commands.every((e) => readOnlyExec(e, x.assigned));
}

/** Row 15 over one tool call: null off the orchestrator, and for every tool the orchestrator keeps. */
export function checkOrchestratorRole(call: ToolCall, ctx: CallContext): Refusal {
	if (ctx.role !== "orchestrator") return null;
	const { toolName, input } = call;
	const refuse: Refusal = { block: true, reason: ORCHESTRATOR_ROLE_REFUSAL };
	if (LANE_TOOLS[toolName]) return refuse;
	if (toolName === "write") return typeof input.path === "string" && LEDGER_DEVICES[input.path] ? null : refuse;
	if (WRITE_TOOLS[toolName]) return refuse;
	if (toolName === "bash") {
		const cwd = typeof input.cwd === "string" ? resolve(ctx.cwd, input.cwd) : ctx.cwd;
		return readOnlyBash(String(input.command ?? ""), cwd, ctx.env, input.env) ? null : refuse;
	}
	return null;
}
