#!/usr/bin/env bun
// guard-replay: the gates' regression tool over recorded real traffic (MIGRATION.md item 83's corpus
// replay; the idea is rootstock-os `reference tools/guard_replay.py`, research/rootstock-os REPORT § 3.1).
// Every tool call a lane or hand actually made — read out of OMP session transcripts — is rebuilt as
// the `ToolCall` object gates/src/gates.ts checkToolCall takes and judged again by the rows as they
// are now, in a fresh sandboxed context: nothing in the call runs, no ledger is opened, the deps are
// in-memory stubs (no workload binding beyond the id, no wake obligation, no test records). The
// verdict now is compared with the verdict the live session recorded and the result is printed per
// row as NEW-CATCH (refused now, let through live), LOST (refused live, let through now), UNCHANGED
// (refused by the same row both times), STATE-BOUND and UNREACHED-LIVE (below). `--json` emits one
// object per call for other tools; `--show <row>` prints examples with the transcript path:line.
// Exit 1 when any replayable row has a LOST; exit 2 when a call could not be judged (the report is
// incomplete) or on a bad argument; so a gate PR can run it in CI over gates/test/fixtures/guard-replay/.
//
//   bun gates/scripts/guard-replay.ts [--root <dir>]... [--days N] [--show <row>|errors|ambiguous] [--json]
//                                    [--role lane|hand|orchestrator] [--home <dir>]
//
// Roots default to ~/.agent-system-2/lanes/*/sessions (lanes, and their hands one directory down)
// and ~/.omp/agent/seat-sessions/* (the 1.x seats; nothing was refused live there, so every refusal
// is a NEW-CATCH — what the rows would say about a seat's real commands). `--days N` keeps files whose
// mtime is within N days (default 30; 0 = every file). The replay reads the gate rows from this
// checkout, so run it from the branch under review.
//
// What "refused live" is read from. A refused call's tool result is the row's own reason text and
// OMP marks it `isError: true` (every live refusal in the lane corpus carries the flag; a successful
// `read` of a file quoting a refusal does not). So: a result flagged as an error whose text starts
// with a row's reason prefix is a live refusal; a result not flagged as an error is never one,
// whatever it quotes; a result with refusal text and no flag at all (a transcript written without
// `isError`) is AMBIGUOUS, counted on its own line and compared with nothing.
//
// What the replay can and cannot reproduce, stated once here and marked in the table:
// - Replayable rows judge the call's text, the session's cwd, its home and its workload id, all of
//   which the transcript carries: rows 4, 5, 10 and 6. Their NEW-CATCH and LOST counts are the
//   regression evidence, and LOST drives the exit code.
// - State-bound rows judge live state the transcript does not carry — the lane's mode (row 14: a
//   lane's `ask` is allowed in user-driven mode only, and the replay does not know the mode), the
//   wake obligation (row 7), the workload's open questions (question row), the branch a checkout is
//   on now (row 9), the remote's upstream and the test records (row 8), the host and its sandbox
//   (the M4b fence), the orchestrator's recorded answers (row 15). They still run here, on stubs and
//   on this machine's filesystem, but their verdicts are excluded from the comparison: a live
//   refusal from one is counted under STATE-BOUND and never as LOST; a refusal the replay produces
//   from one (row 8 with no records refuses every push, for instance) is counted there too, never as
//   a NEW-CATCH.
// - First refusal wins (gates/index.ts registers the rows in checkToolCall's order, row 15 after ask
//   and the fence last), so a call refused live at row X was let through by every row before X and
//   never reached the rows after it. A refusal now from a row after X is UNREACHED-LIVE: nothing is
//   known about what that row said live, so it is neither a NEW-CATCH nor in the exit code. A
//   refusal now from a row before X is a NEW-CATCH for that row (live, it let the call through), and
//   X is "shadowed" (still refused, by an earlier row), not LOST.
// - The environment is not the live one: HOME is the transcript's, PATH is this process's, nothing
//   else is set, so a `$VAR` the live shell knew is opaque here and a row may refuse it as unreadable.
//   A command naming a script by path reads that file as it is on this machine now.
// - Row 10 canonicalises every path it finds with lstat; a home under /home on macOS hits the
//   automounter and costs about a second per path, so a synthetic transcript's cwd belongs under
//   /Users (the fixture uses /Users/as2).
// - Every tool call is replayed, whatever the tool: the rows judge bash, eval, write, edit, ast_edit,
//   task, ask and the browser tools and let the rest through, so a tool that gains a row later shows
//   up here without a change to this script.
import { existsSync, readdirSync, readFileSync, type Stats, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { checkToolCall, type GateDeps } from "../src/gates";
import { ORCHESTRATOR_ROLE_REFUSAL } from "../src/rows/r15-orchestrator-role";
import type { CallContext, GateLedger, Refusal, Role, ToolCall } from "../src/types";

/** `--show` prints at most this many calls per outcome. */
export const EXAMPLE_CAP = 10;

export interface RowSpec {
	id: string;
	/** How the row's reason text starts, in a `Refusal` now and in a live tool result (every variant: refused and could-not-read alike). */
	prefixes: readonly string[];
	/** Whether the replay reproduces this row's verdict from what the transcript carries (see the header). */
	replayable: boolean;
}

/**
 * The rows in the order they run live (gates/index.ts p11Gates: ask, row 15, wake, the dispatch rows,
 * the raw ledger, reserved, protected-edit and push rows, the fence last; the checkToolCall order of
 * gates/src/gates.ts:34-46 with the two extension-only refusals placed where they register). The
 * order is what makes "shadowed" and "unreached-live" decidable: a refusal at index i means every
 * row before i let the call pass and no row after i saw it.
 */
export const ROWS: readonly RowSpec[] = [
	{ id: "r14-ask", prefixes: ["P-11 row 14 "], replayable: false },
	{ id: "r15-orchestrator-role", prefixes: ["P-11 row 15 ", ORCHESTRATOR_ROLE_REFUSAL, "your QUESTION to Jo about"], replayable: false },
	{ id: "r07-wake-read", prefixes: ["P-11 row 7 "], replayable: false },
	{ id: "r04-tier-name", prefixes: ["P-11 row 4 "], replayable: true },
	{ id: "r05-brief-fields", prefixes: ["P-11 row 5 "], replayable: true },
	{ id: "question", prefixes: ["P-11 question row "], replayable: false },
	{ id: "r10-raw-ledger", prefixes: ["P-11 row 10 "], replayable: true },
	{ id: "r06-reserved", prefixes: ["P-11 row 6 "], replayable: true },
	{ id: "r09-protected-edit", prefixes: ["P-11 row 9 "], replayable: false },
	{ id: "r08-push-rebase", prefixes: ["P-11 row 8 "], replayable: false },
	{ id: "fence", prefixes: ["M4b OS fence"], replayable: false },
];

/** Each row's position in ROWS: the order the rows run in. */
const ROW_INDEX: Record<string, number> = Object.fromEntries(ROWS.map((r, i) => [r.id, i]));

/** The row whose reason `text` is, by its prefix; null when the text is no gate refusal. */
export function rowOf(text: string | null | undefined): string | null {
	if (!text) return null;
	const head = text.trimStart();
	for (const row of ROWS) if (row.prefixes.some((p) => head.startsWith(p))) return row.id;
	return null;
}

export const isReplayable = (row: string): boolean => ROWS[ROW_INDEX[row]!]!.replayable;

/** One recorded tool call, with what the transcript says happened to it. */
export interface ReplayCall {
	/** Transcript file and 1-based line of the assistant message carrying the call. */
	path: string;
	line: number;
	toolCallId: string;
	tool: string;
	input: Record<string, unknown>;
	/**
	 * The session's working directory, role, home and workload id, as the rows read them live; cwd
	 * is null when no session header precedes the call in its transcript (the call is then not judged:
	 * guessing this process's cwd would judge it in a place it never ran).
	 */
	cwd: string | null;
	role: Role;
	home: string;
	workload: string | null;
	/** The live tool result's text (its first text block). */
	result: string;
	/** The result's `isError` flag; null when the transcript line carries none. */
	isError: boolean | null;
}

/** What the transcript says the gates did live (the header's rule). */
export type LiveEvidence = "refused" | "passed" | "ambiguous";

export function liveEvidence(call: Pick<ReplayCall, "result" | "isError">): { live: LiveEvidence; liveRow: string | null } {
	const row = rowOf(call.result);
	if (!row || call.isError === false) return { live: "passed", liveRow: null };
	return call.isError === true ? { live: "refused", liveRow: row } : { live: "ambiguous", liveRow: row };
}

export type Outcome = "pass" | "unchanged" | "new-catch" | "lost" | "state-bound" | "shadowed" | "unreached-live" | "ambiguous" | "error";

export interface Judged extends ReplayCall {
	/** The row refusing now and its reason; null = let through. */
	nowRow: string | null;
	nowReason: string | null;
	live: LiveEvidence;
	/** The row that refused live, read off the tool result; null = let through. */
	liveRow: string | null;
	/** `error` when the call could not be judged (checkToolCall threw, or no session header); the cause is in nowReason. */
	outcomes: { row: string | null; kind: Outcome }[];
}

export interface RowCounts {
	newCatch: number;
	lost: number;
	unchanged: number;
	stateBound: number;
	/** Refused now, but live an earlier row refused the call first, so this row never saw it. */
	unreachedLive: number;
}

export interface Report {
	calls: Judged[];
	rows: Record<string, RowCounts>;
	/** Let through both live and now. */
	passed: number;
	/** Refused live at a row that a row before it refuses now (not counted LOST, see the header). */
	shadowed: number;
	/** Refusal text in a result the transcript does not flag either way: compared with nothing. */
	ambiguous: number;
	/** Calls not judged: the report is incomplete and the exit code says so. */
	errors: number;
	/** Sum of LOST over replayable rows: the exit-code signal. */
	lost: number;
}

/** The transcript header fields the context is built from; `cwd` null = no header seen yet. */
interface SessionHeader {
	cwd: string | null;
	role: Role;
	home: string;
	workload: string | null;
}

interface ParseOptions {
	/** Overrides the role read from the transcript's place (see isHandTranscript). */
	role?: Role;
	/** Overrides the home derived from the session's cwd. */
	home?: string;
}

const LANE_PATH = /\/lanes\/(wl-[A-Za-z0-9_-]+)\//;
const HOME_PREFIX = /^\/(?:Users|home)\/[^/]+/;

/**
 * OMP writes a subagent's transcript into a directory named after its parent session, beside the
 * parent's own `<id>.jsonl`. A resumed top-level session also carries `parentSession` in its header
 * (the id it resumed), so the header cannot tell a hand from a resumed lane; the place can.
 */
export function isHandTranscript(path: string): boolean {
	return existsSync(`${dirname(path)}.jsonl`);
}

function headerFrom(path: string, line: Record<string, unknown> | null, opts: ParseOptions): SessionHeader {
	const cwd = typeof line?.cwd === "string" && line.cwd !== "" ? line.cwd : null;
	const fromPath = LANE_PATH.exec(path)?.[1] ?? null;
	const base = cwd ? basename(cwd) : "";
	const workload = fromPath ?? (base.startsWith("wl-") ? base : null);
	const home = opts.home ?? (cwd ? HOME_PREFIX.exec(cwd)?.[0] : undefined) ?? homedir();
	const role = opts.role ?? (isHandTranscript(path) ? "hand" : "lane");
	return { cwd, role, home, workload };
}

interface ContentBlock {
	type?: string;
	id?: string;
	name?: string;
	arguments?: unknown;
	text?: string;
}

/** A hashline block header, `[PATH#TAG]` alone on its line, as the edit tool's `input` carries one file's edits. */
const HASHLINE_HEADER = /^\[(.+?)#[0-9A-Fa-f]{4}\]\s*$/gm;

/**
 * The call's input as the rows see it on the OMP event: the model's arguments, with an edit call's
 * `[PATH#TAG]` headers lifted into `path` (one file) or `paths` (several), which OMP does before
 * any extension event (gates/src/targets.ts:2-4; pi-coding-agent tool-event-input.ts:70-83). The
 * transcript keeps the arguments as sent, so the replay lifts them the same way.
 */
export function toolEventInput(tool: string, args: Record<string, unknown>): Record<string, unknown> {
	if (tool !== "edit" || typeof args.input !== "string" || args.path !== undefined || args.paths !== undefined) return args;
	const paths = [...new Set([...args.input.matchAll(HASHLINE_HEADER)].map((m) => m[1]!))];
	if (paths.length === 0) return args;
	return paths.length === 1 ? { ...args, path: paths[0] } : { ...args, paths };
}

/**
 * The calls of one OMP session transcript (one JSON object per line: a `session` header, then
 * `message` lines whose `message.role` is `assistant` with `toolCall` blocks or `toolResult` with
 * the result's text blocks and `isError`). Every tool is kept (the rows decide what they judge). A
 * call with no result line is dropped: there is no live verdict. A call before any header is kept
 * with `cwd: null`, which the judge reports as an error rather than guessing where it ran.
 */
export function parseSession(path: string, text: string, opts: ParseOptions = {}): ReplayCall[] {
	const lines = text.split("\n");
	let header: SessionHeader | null = null;
	const pending = new Map<string, ReplayCall>();
	const out: ReplayCall[] = [];
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i]!;
		if (raw === "") continue;
		const maybeHeader = header === null && raw.includes('"session"');
		if (!maybeHeader && !raw.includes('"toolCall"') && !raw.includes('"toolResult"')) continue;
		let line: Record<string, unknown>;
		try {
			line = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (maybeHeader && line.type === "session") {
			header = headerFrom(path, line, opts);
			continue;
		}
		if (line.type !== "message") continue;
		const message = line.message as { role?: string; content?: unknown; toolCallId?: string; toolName?: string; isError?: unknown } | undefined;
		if (!message) continue;
		if (message.role === "assistant" && Array.isArray(message.content)) {
			for (const block of message.content as ContentBlock[]) {
				if (block.type !== "toolCall" || typeof block.name !== "string" || typeof block.id !== "string") continue;
				const h = header ?? headerFrom(path, null, opts);
				const input = toolEventInput(block.name, block.arguments && typeof block.arguments === "object" ? (block.arguments as Record<string, unknown>) : {});
				pending.set(block.id, { path, line: i + 1, toolCallId: block.id, tool: block.name, input, cwd: h.cwd, role: h.role, home: h.home, workload: h.workload, result: "", isError: null });
			}
		} else if (message.role === "toolResult" && typeof message.toolCallId === "string") {
			const call = pending.get(message.toolCallId);
			if (!call) continue;
			pending.delete(message.toolCallId);
			const blocks = Array.isArray(message.content) ? (message.content as ContentBlock[]) : [];
			const first = blocks.find((b) => b.type === "text" && typeof b.text === "string");
			call.result = first?.text ?? (typeof message.content === "string" ? message.content : "");
			call.isError = typeof message.isError === "boolean" ? message.isError : null;
			out.push(call);
		}
	}
	return out;
}

/** Every `*.jsonl` under `root`, recursively, whose mtime is within `days` (0 = all). */
export function transcriptFiles(root: string, days: number): string[] {
	const cutoff = days > 0 ? Date.now() - days * 86_400_000 : Number.NEGATIVE_INFINITY;
	const out: string[] = [];
	const walk = (dir: string): void => {
		let entries: string[];
		try {
			entries = readdirSync(dir);
		} catch {
			return;
		}
		for (const name of entries.sort()) {
			const p = join(dir, name);
			let st: Stats;
			try {
				st = statSync(p);
			} catch {
				continue;
			}
			if (st.isDirectory()) walk(p);
			else if (name.endsWith(".jsonl") && st.mtimeMs >= cutoff) out.push(p);
		}
	};
	walk(root);
	return out;
}

/** The default roots: lane sessions (hands one directory down) and the 1.x seat sessions. */
export function defaultRoots(home = homedir()): string[] {
	const roots: string[] = [];
	const lanes = join(home, ".agent-system-2", "lanes");
	if (existsSync(lanes)) for (const wl of readdirSync(lanes).sort()) roots.push(join(lanes, wl, "sessions"));
	const seats = join(home, ".omp", "agent", "seat-sessions");
	if (existsSync(seats)) for (const seat of readdirSync(seats).sort()) roots.push(join(seats, seat));
	return roots.filter((r) => existsSync(r));
}

/**
 * Every call under `roots`, once: a resumed session's transcript repeats the entries of the one it
 * resumed, so a tool call id seen in an earlier file (files are visited in sorted order) is skipped.
 */
export function collectCalls(roots: string[], days: number, opts: ParseOptions = {}): ReplayCall[] {
	const calls: ReplayCall[] = [];
	const seen = new Set<string>();
	for (const root of roots) {
		for (const file of transcriptFiles(root, days)) {
			for (const call of parseSession(file, readFileSync(file, "utf8"), opts)) {
				if (seen.has(call.toolCallId)) continue;
				seen.add(call.toolCallId);
				calls.push(call);
			}
		}
	}
	return calls;
}

/** A ledger with nothing in it: the question row reads it and finds no open questions. */
const EMPTY_LEDGER = {
	inFlight: () => [],
	question: () => null,
	slice: () => null,
} as unknown as GateLedger;

/** The sandboxed context and deps a call is judged in: the transcript's cwd, home and workload id, nothing live. */
export function sandbox(call: ReplayCall & { cwd: string }): { ctx: CallContext; deps: GateDeps } {
	return {
		ctx: { role: call.role, cwd: call.cwd, env: { HOME: call.home, PATH: process.env.PATH }, mode: null },
		deps: { workload: call.workload ? { id: call.workload, ledger: () => EMPTY_LEDGER } : null, wake: null, testRecords: null },
	};
}

export type Check = (call: ToolCall, ctx: CallContext, deps: GateDeps) => Refusal;

/**
 * The outcomes of one call from its two verdicts (the header's rules). The live row is the first
 * row that refused live, so every row before it let the call through live and no row after it saw
 * the call; the row refusing now is read against that.
 */
export function classify(nowRow: string | null, liveRow: string | null): { row: string | null; kind: Outcome }[] {
	if (nowRow === liveRow) return [{ row: nowRow, kind: !nowRow ? "pass" : isReplayable(nowRow) ? "unchanged" : "state-bound" }];
	const out: { row: string | null; kind: Outcome }[] = [];
	if (nowRow) {
		const after = liveRow !== null && ROW_INDEX[nowRow]! > ROW_INDEX[liveRow]!;
		out.push({ row: nowRow, kind: after ? "unreached-live" : isReplayable(nowRow) ? "new-catch" : "state-bound" });
	}
	if (liveRow) {
		const before = nowRow !== null && ROW_INDEX[nowRow]! < ROW_INDEX[liveRow]!;
		out.push({ row: liveRow, kind: !isReplayable(liveRow) ? "state-bound" : before ? "shadowed" : "lost" });
	}
	return out;
}

/** Judges one call now and classifies it against its live result. */
export function judge(call: ReplayCall, check: Check = checkToolCall): Judged {
	const { live, liveRow } = liveEvidence(call);
	if (call.cwd === null) {
		return { ...call, nowRow: null, nowReason: `no session header before this call in ${call.path}: the cwd it ran in is unknown`, live, liveRow, outcomes: [{ row: null, kind: "error" }] };
	}
	const { ctx, deps } = sandbox({ ...call, cwd: call.cwd });
	let refusal: Refusal;
	try {
		refusal = check({ toolName: call.tool, input: call.input }, ctx, deps);
	} catch (err) {
		return { ...call, nowRow: null, nowReason: String(err), live, liveRow, outcomes: [{ row: null, kind: "error" }] };
	}
	const nowReason = refusal?.block ? refusal.reason : null;
	const nowRow = rowOf(nowReason);
	const outcomes = live === "ambiguous" ? [{ row: liveRow, kind: "ambiguous" as const }] : classify(nowRow, liveRow);
	return { ...call, nowRow, nowReason, live, liveRow, outcomes };
}

export function replay(calls: ReplayCall[], check: Check = checkToolCall): Report {
	const rows: Record<string, RowCounts> = Object.fromEntries(ROWS.map((r) => [r.id, { newCatch: 0, lost: 0, unchanged: 0, stateBound: 0, unreachedLive: 0 }]));
	const report: Report = { calls: [], rows, passed: 0, shadowed: 0, ambiguous: 0, errors: 0, lost: 0 };
	for (const call of calls) {
		const j = judge(call, check);
		report.calls.push(j);
		for (const o of j.outcomes) {
			const counts = o.row ? rows[o.row]! : null;
			switch (o.kind) {
				case "pass":
					report.passed++;
					break;
				case "error":
					report.errors++;
					break;
				case "ambiguous":
					report.ambiguous++;
					break;
				case "shadowed":
					report.shadowed++;
					break;
				case "new-catch":
					counts!.newCatch++;
					break;
				case "lost":
					counts!.lost++;
					report.lost++;
					break;
				case "unchanged":
					counts!.unchanged++;
					break;
				case "state-bound":
					counts!.stateBound++;
					break;
				case "unreached-live":
					counts!.unreachedLive++;
					break;
			}
		}
	}
	return report;
}

const RENDER_CHARS = 100;

/** One line of a call's input: the command, the code's first line, the path, or the dispatch's tier and task head. Never a file's contents. */
export function renderCall(call: ReplayCall): string {
	const i = call.input;
	const clip = (s: string): string => {
		const one = s.replace(/\s+/g, " ").trim();
		return one.length > RENDER_CHARS ? `${one.slice(0, RENDER_CHARS - 1)}…` : one;
	};
	switch (call.tool) {
		case "bash":
			return clip(String(i.command ?? ""));
		case "eval":
			return clip(`${String(i.language ?? "")}: ${String(i.code ?? "")}`);
		case "task": {
			const items = Array.isArray(i.tasks) ? (i.tasks as Record<string, unknown>[]) : [i];
			const first = items[0] ?? {};
			return clip(`${items.length} item(s); agent=${String(first.agent ?? "?")} task=${String(first.task ?? "")}`);
		}
		default: {
			const paths = [i.path, ...(Array.isArray(i.paths) ? i.paths : [])].filter((p) => typeof p === "string");
			return clip(paths.join(" "));
		}
	}
}

const pad = (s: string, n: number): string => (s.length >= n ? s : s + " ".repeat(n - s.length));
const num = (n: number, w = 9): string => String(n).padStart(w);

export function renderTable(report: Report): string {
	const lines: string[] = [];
	lines.push(`GUARD REPLAY (${report.calls.length} calls)`);
	lines.push(`${pad("row", 24)} ${"NEW-CATCH".padStart(9)} ${"LOST".padStart(9)} ${"UNCHANGED".padStart(9)} ${"STATE-BOUND".padStart(11)} ${"UNREACHED-LIVE".padStart(14)}`);
	for (const row of ROWS) {
		const c = report.rows[row.id]!;
		const mark = row.replayable ? "" : "  (state-bound: not compared)";
		lines.push(`${pad(row.id, 24)} ${num(c.newCatch)} ${num(c.lost)} ${num(c.unchanged)} ${num(c.stateBound, 11)} ${num(c.unreachedLive, 14)}${mark}`);
	}
	lines.push(`let through live and now: ${report.passed}; shadowed (refused live, refused now by an earlier row): ${report.shadowed}`);
	if (report.ambiguous > 0) lines.push(`ambiguous ${report.ambiguous}: refusal text in a result the transcript does not flag as an error, compared with nothing (see --show ambiguous)`);
	if (report.errors > 0) lines.push(`incomplete: ${report.errors} call(s) not judged (see --show errors)`);
	if (report.lost > 0) lines.push(`LOST ${report.lost}: a call refused live is let through now (see --show <row>)`);
	else lines.push(report.errors > 0 ? "no LOST among the calls judged; the report is incomplete" : "ok: no LOST on any replayable row");
	return lines.join("\n");
}

const head = (s: string | null, n = 160): string => (s ?? "").replace(/\s+/g, " ").slice(0, n);

/** Up to EXAMPLE_CAP calls per outcome for one row (or every unjudged call for `errors`, every ambiguous one for `ambiguous`). */
export function renderExamples(report: Report, row: string): string {
	const lines: string[] = [];
	if (row === "errors" || row === "ambiguous") {
		const hits = report.calls.filter((c) => c.outcomes.some((o) => o.kind === (row === "errors" ? "error" : "ambiguous")));
		lines.push(`${row === "errors" ? "not judged" : "ambiguous"} (${hits.length}${hits.length > EXAMPLE_CAP ? `, first ${EXAMPLE_CAP}` : ""})`);
		for (const c of hits.slice(0, EXAMPLE_CAP)) {
			lines.push(`  ${c.path}:${c.line}  ${c.tool}  ${renderCall(c)}`);
			lines.push(row === "errors" ? `    cause: ${head(c.nowReason)}` : `    result: ${head(c.result)}`);
		}
		return lines.join("\n");
	}
	if (!(row in ROW_INDEX)) return `no such row: ${row} (rows: ${ROWS.map((r) => r.id).join(", ")}, or errors, or ambiguous)`;
	for (const kind of ["new-catch", "lost", "unchanged", "state-bound", "shadowed", "unreached-live"] as const) {
		const hits = report.calls.filter((c) => c.outcomes.some((o) => o.row === row && o.kind === kind));
		lines.push(`${row} ${kind.toUpperCase()} (${hits.length}${hits.length > EXAMPLE_CAP ? `, first ${EXAMPLE_CAP}` : ""})`);
		if (hits.length === 0) lines.push("  (none)");
		for (const c of hits.slice(0, EXAMPLE_CAP)) {
			lines.push(`  ${c.path}:${c.line}  ${c.tool}  ${renderCall(c)}`);
			if (kind !== "unchanged") {
				if (c.nowReason && c.nowRow === row) lines.push(`    now:  ${head(c.nowReason)}`);
				if (c.liveRow === row) lines.push(`    live: ${head(c.result)}`);
			}
		}
	}
	return lines.join("\n");
}

/** `--json`: one object per call, the fields another tool would key on. */
export function jsonLines(report: Report): string {
	return report.calls
		.map((c) =>
			JSON.stringify({
				path: c.path,
				line: c.line,
				toolCallId: c.toolCallId,
				tool: c.tool,
				command: renderCall(c),
				cwd: c.cwd,
				role: c.role,
				workload: c.workload,
				nowRow: c.nowRow,
				nowReason: c.nowReason,
				live: c.live,
				liveRow: c.liveRow,
				isError: c.isError,
				outcomes: c.outcomes,
			}),
		)
		.join("\n");
}

export interface Args {
	roots: string[];
	days: number;
	show: string | null;
	json: boolean;
	role?: Role;
	home?: string;
}

export function parseArgs(argv: string[]): Args {
	const args: Args = { roots: [], days: 30, show: null, json: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		const value = (): string => {
			const v = argv[++i];
			if (v === undefined) throw new Error(`${a} needs a value`);
			return v;
		};
		if (a === "--root") args.roots.push(resolve(value()));
		else if (a === "--days") {
			const n = Number(value());
			if (!Number.isFinite(n) || n < 0) throw new Error("--days takes a number of days (0 = every file)");
			args.days = n;
		} else if (a === "--show") args.show = value();
		else if (a === "--json") args.json = true;
		else if (a === "--role") {
			const r = value();
			if (r !== "lane" && r !== "hand" && r !== "orchestrator") throw new Error("--role is lane, hand or orchestrator");
			args.role = r;
		} else if (a === "--home") args.home = resolve(value());
		else throw new Error(`unknown argument ${a}`);
	}
	if (args.roots.length === 0) args.roots = defaultRoots();
	return args;
}

/** The exit code a report earns: 1 for a LOST (the regression), else 2 when any call went unjudged (the report cannot say), else 0. */
export function exitCode(report: Report): number {
	return report.lost > 0 ? 1 : report.errors > 0 ? 2 : 0;
}

export function main(argv: string[], check: Check = checkToolCall): number {
	const args = parseArgs(argv);
	const calls = collectCalls(args.roots, args.days, { role: args.role, home: args.home });
	const report = replay(calls, check);
	if (args.json) console.log(jsonLines(report));
	else {
		console.log(renderTable(report));
		if (args.show) console.log(`\n${renderExamples(report, args.show)}`);
	}
	return exitCode(report);
}

if (import.meta.main) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(2);
	}
}
