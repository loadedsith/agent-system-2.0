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
// name with no output option (readHeadUnmodeled); a SEARCH_HEADS name (grep, rg, find, sort, uniq,
// cut, awk) with none of its write or run forms (searchHeadUnmodeled); a git history read (gitReads:
// status, log, diff, show, rev-parse, ls-files, blame, describe, branch in list mode, remote with
// options only, worktree list, stash list, each with the options git-model allows, so an option
// that runs a program or writes a file is refused; global options per gitUnmodeled); or a `cd` to
// a literal directory. The only write destination allowed
// is a literal `/dev/null` (writeDestinations lists every redirect target; discarding output writes
// nothing). No inline code and nothing blind. Anything else is refused, an unmodeled form included:
// loud over silent. Lanes and hands are untouched.
//
// Intended ordering (Main, 2026-09-30): row 15 registers before row 6, so a reserved bash action on
// the orchestrator gets this refusal and records no `reserved-request`; the orchestrator never runs
// the command at all, so there is nothing for Jo to approve. Row 6 still records browser writes,
// which row 15 does not refuse.
//
// Answer first (M7 fix round 2, finding B; Jo's design via Main, 2026-09-30): Ilex asked Jo a
// QUESTION about an open workload, Jo answered "use your draft", and nothing reached the ledger, so
// the lane that picked the workload up had to reconstruct the decision from chat. Row 11 records
// Jo's input only on a lane bound to a workload; the orchestrator is bound to none, so it never
// fired here, and it records every input, which is wrong at the surface: Jo's next message may be a
// question about the question. So the orchestrator judges, and records the answer itself with
// orchestrator_record_instruction; this row refuses its next working call until it has. The
// question is the latest assistant message carrying a real **QUESTION** block (row 1's reading,
// questionBlocks); its workloads are the open ones whose `wl-…` id the QUESTION block names, else
// the ones the whole message names, else the single open workload in view, else none (no gate).
// It is unanswered while no `instructions` row by Jo (author `jo`: the recorder's rows, a stakes
// flip, an approve/deny) on that workload is newer than the message. A
// working call is one this row refuses anyway (the answer-first line is the one Jo's words need, so
// it is said first) or a HAND_ON_TOOLS call (open, close, schedule). Reads, the wake read, the
// ledger read and the recorder stay allowed, and a reply in words is never refused.
import { basename, resolve } from "node:path";
import { workloadsInView } from "../../../surface/src/input";
import { HAND_ON_TOOLS, RECORD_INSTRUCTION_TOOL, SURFACE_TOOLS } from "../../../surface/src/types";
import type { Ledger } from "../../../ledger/src/index";
import { type Exec, type Expansion, expandShell, gitCall, gitUnmodeled, OUTPUT_ONLY, READ_ONLY_HEADS, readHeadUnmodeled, SEARCH_HEADS, searchHeadUnmodeled, writeDestinations } from "../exec";
import { gitReads } from "../git-model";
import { type AgentMessageLike, messageText } from "../session";
import { WRITE_TOOLS } from "../targets";
import type { CallContext, Refusal, ToolCall } from "../types";
import { questionBlocks } from "./r01-turn-shape";

export const ORCHESTRATOR_ROLE_REFUSAL = "the orchestrator opens workloads; a lane does this — open one with orchestrator_open_workload";

/** Tools that do a lane's work outright on the orchestrator: dispatch and code execution. */
const LANE_TOOLS: Record<string, true> = { task: true, eval: true };

/** The `xd://` devices the orchestrator may write: the surface's own ledger tools, mounted as devices. */
const LEDGER_DEVICES: Record<string, true> = Object.fromEntries(SURFACE_TOOLS.map((t) => [`xd://${t}`, true]));

/** The surface tools that move a workload on, by name and as their `xd://` devices. */
const HAND_ON: Record<string, true> = Object.fromEntries(HAND_ON_TOOLS.flatMap((t) => [[t, true], [`xd://${t}`, true]]));

/** A QUESTION the orchestrator sent Jo about open workloads, with no instruction row on them newer than it. */
export interface Unanswered {
	workloadIds: string[];
	/** The asking message's timestamp. */
	at: string;
}

/** One session entry as the answer-first check reads it (OMP session JSONL: `type`, `timestamp`, `message`). */
export interface EntryLike {
	type: string;
	timestamp?: string;
	message?: AgentMessageLike;
}

const WL_ID = /\bwl-[a-z0-9]+\b/g;

/** The latest QUESTION the orchestrator sent Jo, when it is about open workloads none of which has an instruction row newer than it. The ledger is opened only when there is a question. */
export function unansweredQuestion(entries: readonly EntryLike[], openLedger: () => Ledger): Unanswered | null {
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i]!;
		if (e.type !== "message" || e.message?.role !== "assistant") continue;
		const text = messageText(e.message);
		const blocks = questionBlocks(text);
		if (blocks.length === 0) continue;
		// No timestamp to compare: any instruction row on the workload counts as newer (loud, never silent).
		const at = e.timestamp ?? "";
		const ledger = openLedger();
		const view = workloadsInView(ledger);
		const named = (s: string): string[] => [...new Set(s.match(WL_ID) ?? [])].filter((id) => view.includes(id));
		let ids = named(blocks.join("\n"));
		if (ids.length === 0) ids = named(text);
		if (ids.length === 0 && view.length === 1) ids = [view[0]!];
		const open = ids.filter((id) => !ledger.instructions(id).some((r) => r.author === "jo" && r.created_at > at));
		return open.length > 0 ? { workloadIds: open, at } : null;
	}
	return null;
}

/** The one line refusing a working call while Jo's answer is unrecorded. */
export const answerFirstRefusal = (ids: readonly string[]): string =>
	`your QUESTION to Jo about ${ids.join(", ")} has no answer in the ledger: if Jo's reply answers it or instructs you, record it with ${RECORD_INSTRUCTION_TOOL} before any working call; a reply that does not answer it gets words, not work`;

/** A `cd` to one literal directory (or none): it moves the shell, and expandShell tracks where. */
const literalCd = (e: Exec): boolean => e.argv.length <= 2 && e.argv.every((w) => !w.opaque && !w.expanded && !w.glob);

/** Is `e` a read by the exec.ts and git-model.ts tables (see the header)? */
function readOnlyExec(e: Exec, assigned: Expansion["assigned"], env: Record<string, string | undefined>): boolean {
	const head = e.argv[0]!;
	const name = basename(head.text);
	if (head.opaque || head.expanded || head.glob || name !== head.text) return false;
	if (e.mods.wrappers.length > 0 || e.mods.assigns.length > 0) return false;
	if (writeDestinations(e).some((w) => w.opaque || w.expanded || w.text !== "/dev/null")) return false;
	if (READ_ONLY_HEADS[name] || OUTPUT_ONLY[name]) return readHeadUnmodeled(e) === null;
	if (SEARCH_HEADS[name]) return searchHeadUnmodeled(e, env) === null;
	if (name === "cd") return literalCd(e);
	if (name !== "git") return false;
	const g = gitCall(e);
	return g !== null && gitUnmodeled(e, assigned) === null && gitReads(g);
}

/** True when every command `command` runs only reads, by the exec.ts and git-model.ts tables. */
export function readOnlyBash(command: string, cwd: string, env: Record<string, string | undefined>, toolEnv?: unknown): boolean {
	const x = expandShell(command, cwd, env, toolEnv);
	if (x.blind.length > 0 || x.code.length > 0 || x.assigned.size > 0 || x.commands.length === 0) return false;
	return x.commands.every((e) => readOnlyExec(e, x.assigned, env));
}

/** Row 15's role check alone: the lane's tools refused on the orchestrator. */
function roleRefusal(call: ToolCall, ctx: CallContext): Refusal {
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

/**
 * Row 15 over one tool call: null off the orchestrator, and for every tool the orchestrator keeps.
 * `unanswered` is read only for a working call (see the header); it may throw, and the caller
 * refuses on that rather than guessing.
 */
export function checkOrchestratorRole(call: ToolCall, ctx: CallContext, unanswered: () => Unanswered | null = () => null): Refusal {
	if (ctx.role !== "orchestrator") return null;
	const role = roleRefusal(call, ctx);
	const handsOn = HAND_ON[call.toolName] || (call.toolName === "write" && typeof call.input.path === "string" && HAND_ON[call.input.path]);
	if (!role && !handsOn) return null;
	const q = unanswered();
	return q ? { block: true, reason: answerFirstRefusal(q.workloadIds) } : role;
}
