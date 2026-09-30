// The orchestrator's ledger writes, each a tool through the ledger module (P-11 row 10: the module
// is the only writer): identity (first wake), open a workload with stakes and mode inferred and the
// repository's decision log rendered into the lane brief (§ A1.2, § B13.1, § B2.1, C7.5), close a
// workload with a decision-log entry rendered from the ledger, and schedule a row that surfaces
// under *needs you* once past due (M11).
//
// Lane launcher (DESIGN-lane-launcher.md): open writes the `done:` line (decision 16) and, when the
// trigger fires, `plan: first <trigger>` (decision 15), then runs the launch trigger
// (surface/extensions/launch.ts) and carries its one line; close (`closeWorkloadWithEntry`, shared
// by the close tool and the wake tick's auto-close of a workload awaiting close) refuses a workload
// held under a live lease or without the holder's `done-because:` receipt, and commits the rendered
// entry (decision 13) through the extension API's exec, never the bash tool.
import { join } from "node:path";
import type { Ledger } from "../../ledger/src/index";
import { classify, type KindJudge, loadKindQuestion } from "../../classifier/src/classify";
import { LOW_CONFIDENCE_THRESHOLD } from "../../classifier/src/route";
import { decisionLogContext, lastWorkloadOn, recordRepo, renderClose, repoOf } from "../src/decision-log";
import { identityOf, recordIdentity } from "../src/identity";
import { controlEntries, doneBecause, doneBody, doneLine, holdersOf, planFirstBody } from "../src/launch";
import { oneLiner } from "../src/render";
import { surfaceSession } from "../src/session";
import { inferMode, inferStakes, saidPlanIt } from "../src/stakes";
import {
	CLOSE_WORKLOAD_TOOL, type Ctx, DECISION_LOG_ENV, DUE_PREFIX, IDENTITY_TOOL, MODE_WORDS, OPEN_WORKLOAD_TOOL, RECORD_INSTRUCTION_TOOL, SCHEDULE_TOOL,
	STAKES_WORDS, STANDING_WORKLOAD_ID, type SurfaceAPI, SURFACE_BY, type ToolResult,
} from "../src/types";
import { triggerLaunch } from "./launch";

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });
const inactive = text("This session is not the orchestrator surface; nothing was written.");

export interface WorkloadDeps {
	/** The judge that sizes a workload brief for plan-first (decision 15): OMP's `judge` role, wired in surface/index.ts. Absent in tests that do not size. */
	judge?(ctx: Ctx): Promise<KindJudge>;
}

/** Commit one rendered decision-log entry on the checkout's current branch; null on success, else the reason. */
async function commitEntry(pi: SurfaceAPI, repo: string, path: string, workloadId: string): Promise<string | null> {
	if (!pi.exec) return "the host has no exec for extensions";
	const slug = path.replace(/^.*\//, "").replace(/\.md$/, "");
	try {
		const add = await pi.exec("git", ["-C", repo, "add", "--", path], { timeout: 15_000 });
		if (add.code !== 0) return `git add exited ${add.code}: ${(add.stderr || add.stdout).trim()}`;
		const commit = await pi.exec("git", ["-C", repo, "commit", "-q", "-m", `docs: decision-log entry ${slug} (workload ${workloadId})`, "--", path], { timeout: 30_000 });
		if (commit.code !== 0) return `git commit exited ${commit.code}: ${(commit.stderr || commit.stdout).trim()}`;
		return null;
	} catch (err) {
		return String(err);
	}
}

/** The directory decision-log entries are rendered into for `repo`. */
const logDirOf = (env: Record<string, string | undefined>, repo: string) => env[DECISION_LOG_ENV] || join(repo, ".ai", "decision-log");

export interface CloseOutcome {
	closed: boolean;
	/** The one line for the tool result or the tick's notice. */
	text: string;
	details?: unknown;
	/** The holder's standing `done-because:` receipt, or null (a scheduled row, a workload with no done: line). */
	receipt: string | null;
}

/**
 * Close one workload (decision 13): the close tool's body, shared with the wake tick's auto-close
 * of a workload awaiting close. Refused — nothing written — for the standing workload, a closed
 * one, a holder under a live lease, open or paused slices, open questions, or a done: line with no
 * standing `done-because:` from its holder. Otherwise the decision-log entry is rendered from the
 * ledger and committed on the checkout's current branch through `pi.exec`, then the row closes,
 * stamped `orchestrator-surface`, in one transaction with the ledger's own live-holder check.
 * `cwd` is the repository when the workload has no `repo:` entry. Never throws for a refusal.
 */
export async function closeWorkloadWithEntry(
	pi: SurfaceAPI, ledger: Ledger, env: Record<string, string | undefined>, id: string, o: { now: string; cwd: string; receipt: string | null },
): Promise<CloseOutcome> {
	const refused = (t: string): CloseOutcome => ({ closed: false, text: t, receipt: null });
	if (id === STANDING_WORKLOAD_ID) return refused("The standing orchestrator workload is never closed.");
	const w = ledger.workload(id);
	if (!w) return refused(`No workload ${id}.`);
	if (w.status === "closed") return refused(`${id} is already closed (${w.closed_at}).`);
	if (w.holder !== null && (w.holder_lease_until === null || w.holder_lease_until >= o.now)) {
		return refused(`${id} cannot close: held by ${w.holder} under a live lease; stop it first: \`as2 lane stop ${id}\``);
	}
	if (w.open_slices > 0 || w.paused_slices > 0 || w.open_questions > 0) {
		return refused(`${id} cannot close: ${w.open_slices} open slice(s), ${w.paused_slices} paused, ${w.open_questions} open question(s). Settle them first.`);
	}
	const scheduled = w.brief.startsWith(DUE_PREFIX);
	let done: string | null = null;
	if (!scheduled) {
		const entries = ledger.entries(id, "assumption");
		const holders = holdersOf(entries, w.holder, ledger.holders(id));
		const line = doneLine(controlEntries(entries, holders));
		done = doneBecause(entries, holders);
		if (line !== null && done === null) {
			return refused(`${id} cannot close: no \`done-because:\` receipt from its holder against the done: line (${line}), or a later note by the lane or the surface supersedes it. The lane writes it with lane_record_entry before it releases.`);
		}
	}
	if (o.receipt) ledger.recordInstruction({ by: SURFACE_BY, workloadId: id, body: `close receipt: ${o.receipt}`, author: "orchestrator", channel: "surface" });
	const repo = repoOf(ledger, id) ?? o.cwd;
	const rendered = scheduled ? null : renderClose(ledger, id, logDirOf(env, repo), identityOf(ledger));
	// Decision 13: the entry is committed on the checkout's current branch, this path only; a failed commit never blocks the close.
	let commit: string | null = null;
	if (rendered) commit = await commitEntry(pi, repo, rendered.path, id);
	// The close is one transaction with its checks (Codex review S2): a lane that reserved the workload while git ran keeps it.
	try {
		ledger.closeWorkload(id, { by: SURFACE_BY });
	} catch (err) {
		const entry = rendered ? ` The decision-log entry at ${rendered.path} is rendered${commit === null ? " and committed" : ""}; it is re-rendered at the next close.` : "";
		return { closed: false, text: `${id} stays open: ${String(err instanceof Error ? err.message : err)}.${entry}`, details: { id, path: rendered?.path ?? null, commit, closed: false }, receipt: done };
	}
	pi.appendEntry("surface-close", { id, path: rendered?.path ?? null, commit });
	const tail = rendered
		? ` Decision-log entry rendered at ${rendered.path}${commit === null ? " and committed." : `; not committed: ${commit} (the file is untracked; commit it by hand).`}`
		: " (scheduled row: no decision-log entry)";
	return { closed: true, text: `Closed ${id}.${tail}`, details: { id, path: rendered?.path ?? null, commit }, receipt: done };
}

export default function workloadRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env, deps: WorkloadDeps = {}): void {
	const z = pi.zod;
	/**
	 * Is the brief a large change? The classifier's judge and question over the brief as one item;
	 * unavailable or at/below the threshold reads as not large, loudly. `judged` is the entry body
	 * recording the answer (the routings table needs a slice, which a workload brief has none of).
	 */
	const judgeSize = async (brief: string, ctx: Ctx): Promise<{ large: boolean; note: string | null; judged: string | null }> => {
		if (!deps.judge) return { large: false, note: "plan-first size check skipped: no judge is wired into this surface.", judged: null };
		try {
			const c = await classify(brief, await deps.judge(ctx), loadKindQuestion());
			const large = c.choice === "change-large" && c.confidence > LOW_CONFIDENCE_THRESHOLD;
			return {
				large,
				note: `brief judged ${c.choice} (confidence ${c.confidence.toFixed(2)}, ${c.judgeModel})${large ? "" : ": not a large change, no plan-first"}.`,
				judged: `brief-judged: ${c.choice} confidence ${c.confidence.toFixed(2)} judge ${c.judgeModel}`,
			};
		} catch (err) {
			return { large: false, note: `plan-first size check skipped: the judge was unavailable (${String(err).split("\n")[0]}); the brief was not sized.`, judged: null };
		}
	};

	pi.registerTool({
		name: IDENTITY_TOOL,
		loadMode: "essential",
		label: "Record Orchestrator Identity",
		description: "First wake only (or a rename): record your chosen name and pronouns as one ledger entry. Hands and lanes do not name themselves.",
		parameters: z.object({
			name: z.string().describe("Your name."),
			pronouns: z.string().describe("Your pronouns, e.g. they/them."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const before = identityOf(s.ledger());
			const id = recordIdentity(s.ledger(), String(params.name ?? ""), String(params.pronouns ?? ""));
			return text(`${before ? `Renamed from ${before.name} (${before.pronouns}) to` : "You are now"} ${id.name} (${id.pronouns}); entry ${id.entryId} on ${STANDING_WORKLOAD_ID}.`, id);
		},
	});

	pi.registerTool({
		name: OPEN_WORKLOAD_TOOL,
		loadMode: "essential",
		label: "Open Workload",
		description:
			"Open a workload from what Jo said. Stakes (throwaway/normal/production) and mode (autonomous/user-driven) are inferred and shown; pass them only to override. " +
			"`done` is required: one sentence, what is true when this workload is over, inferred from Jo's words — when you cannot infer it, ask Jo first (a plain reply, no workload) and open afterwards. " +
			"Plan-first is set for production stakes, when Jo says 'plan it' (or `plan: \"first\"`), or when the brief is judged a large change; then the lane's first slice is the plan. " +
			"An autonomous workload's lane is launched here; a user-driven one gets its by-hand command. " +
			"Returns the id, the one-liner, the launch line, and the repository's decision-log entries newer than the last 2.0 workload on it.",
		parameters: z.object({
			brief: z.string().describe("What Jo said, as the workload brief."),
			done: z.string().optional().describe("One sentence: what is true when this workload is over. Required; ask Jo when you cannot infer it."),
			repo: z.string().optional().describe("Absolute path of the target repository. Default: the session's cwd."),
			branch: z.string().optional().describe("Target branch, when known."),
			reservedTarget: z.string().optional().describe("'yes' when the work names a reserved target (protected-branch push, deploy, spend)."),
			stakes: z.string().optional().describe("Override: throwaway | normal | production."),
			mode: z.string().optional().describe("Override: autonomous | user-driven."),
			plan: z.string().optional().describe("'first' to require a plan slice before any change slice (Jo's word)."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const brief = String(params.brief ?? "").trim();
			if (!brief) return text("A workload needs a brief; nothing was opened.");
			const done = String(params.done ?? "").trim().replace(/\s*\n\s*/g, " ");
			if (!done) {
				return text("A workload states its outcome: pass `done` — one sentence, what is true when this workload is over. When Jo's words do not say, ask Jo first (a plain reply) and open once they answer. Nothing was opened.");
			}
			const repo = typeof params.repo === "string" && params.repo ? params.repo : ctx.cwd;
			const stakes = inferStakes({ said: brief, repo, branch: typeof params.branch === "string" ? params.branch : null, reservedTarget: /^(yes|true|1)$/i.test(String(params.reservedTarget ?? "")) });
			const mode = inferMode(brief);
			const stakesOverride = (STAKES_WORDS as readonly string[]).includes(String(params.stakes)) ? (String(params.stakes) as (typeof STAKES_WORDS)[number]) : null;
			const modeOverride = (MODE_WORDS as readonly string[]).includes(String(params.mode)) ? (String(params.mode) as (typeof MODE_WORDS)[number]) : null;
			const finalStakes = stakesOverride ?? stakes.value;
			// Plan-first trigger (decision 15): production always; Jo's word; else the brief judged change-large.
			let planTrigger: string | null = null;
			let judgeNote: string | null = null;
			let judged: string | null = null;
			if (finalStakes === "production") planTrigger = "production";
			else if (saidPlanIt(brief) || String(params.plan ?? "").trim().toLowerCase() === "first") planTrigger = "your word";
			else {
				const sized = await judgeSize(brief, ctx);
				if (sized.large) planTrigger = "large change";
				judgeNote = sized.note;
				judged = sized.judged;
			}
			const ledger = s.ledger();
			const id = ledger.write(() => {
				const wl = ledger.openWorkload({ by: SURFACE_BY, brief, stakes: finalStakes, mode: modeOverride ?? mode.value });
				recordRepo(ledger, wl, repo);
				ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody(done) });
				if (planTrigger !== null) ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: planFirstBody(planTrigger) });
				if (judged !== null) ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: judged });
				return wl;
			});
			const since = lastWorkloadOn(ledger, repo);
			const context = decisionLogContext(logDirOf(env, repo), { since });
			const row = ledger.workload(id)!;
			const launch = await triggerLaunch(pi, ledger, env, id, "open");
			const lines = [
				`Opened ${id} on ${repo}.`,
				`done: ${done}`,
				oneLiner(ledger, row),
				`stakes ${stakesOverride ? `overridden to ${stakesOverride}` : `inferred ${stakes.value}: ${stakes.reason}`}; mode ${modeOverride ? `overridden to ${modeOverride}` : `inferred ${mode.value}: ${mode.reason}`}.`,
				...(judgeNote ? [judgeNote] : []),
				...(launch.line ? [launch.line] : []),
				"",
				context || `No decision-log entries to carry (${since ? `none newer than ${since}` : `none in ${logDirOf(env, repo)} from the last 14 days`}).`,
			];
			pi.appendEntry("surface-open", { id, repo, stakes: row.stakes, mode: row.mode, planFirst: planTrigger, launch: launch.line });
			return text(lines.join("\n"), { id, stakes: row.stakes, mode: row.mode, since, context, planFirst: planTrigger, launch });
		},
	});

	pi.registerTool({
		name: CLOSE_WORKLOAD_TOOL,
		loadMode: "essential",
		label: "Close Workload",
		description:
			"Close a workload: one decision-log entry is rendered from the ledger into the repository's .ai/decision-log/ (filename YYYY-MM-DD--HHMM--<your name>--<slug>.md) and committed on the checkout's current branch, then the row closes. " +
			"Refused while slices are open or paused, a question is open, a lane holds it under a live lease, or the holder has not written its `done-because:` receipt. For a scheduled row, `receipt` is the receipt it closes with.",
		parameters: z.object({
			workloadId: z.string().describe("The workload id (wl-…)."),
			receipt: z.string().optional().describe("What closes it (a scheduled row's receipt, or a one-line summary); recorded as an instruction."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const receipt = typeof params.receipt === "string" && params.receipt.trim() ? params.receipt.trim() : null;
			const r = await closeWorkloadWithEntry(pi, s.ledger(), env, String(params.workloadId ?? ""), { now: s.now(), cwd: ctx.cwd, receipt });
			return text(r.text, r.details);
		},
	});

	pi.registerTool({
		name: SCHEDULE_TOOL,
		loadMode: "essential",
		label: "Schedule A Row",
		description: "Schedule something for a date: a workload of its own whose brief starts `due:<date>`; it is listed under needs-you at every wake once past due, until closed with a receipt.",
		parameters: z.object({
			due: z.string().describe("ISO date or datetime (e.g. 2026-11-01)."),
			text: z.string().describe("What to do when due, including the method pointer."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const due = String(params.due ?? "").trim();
			const what = String(params.text ?? "").trim();
			if (Number.isNaN(Date.parse(due)) || !what) return text("A scheduled row needs a parseable due date and a text; nothing was opened.");
			const id = s.ledger().openWorkload({ by: SURFACE_BY, brief: `${DUE_PREFIX}${due} ${what}`, stakes: "throwaway", mode: "autonomous" });
			return text(`Scheduled ${id}, due ${due}: ${what}`, { id, due });
		},
	});

	pi.registerTool({
		name: RECORD_INSTRUCTION_TOOL,
		loadMode: "essential",
		label: "Record Jo's Instruction",
		description:
			"When Jo's message answers a QUESTION you asked about an open workload, or instructs you about one, record it here before anything else: Jo's words verbatim plus your one-line reading, as an instruction row on that workload (author jo, channel surface), so a lane picking the workload up reads the decision from the ledger. " +
			"A message that does not answer (a question about your question, something unrelated) records nothing. Until the row exists, your next working call on the workload is refused (P-11 row 15).",
		parameters: z.object({
			workloadId: z.string().describe("The open workload the answer or instruction is about (wl-…)."),
			words: z.string().describe("Jo's words, verbatim, exactly as typed."),
			reading: z.string().describe("Your one-line reading of what Jo decided, with the referent restored (e.g. \"use the draft README line: <the line>\")."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const id = String(params.workloadId ?? "").trim();
			const words = String(params.words ?? "").trim();
			const reading = String(params.reading ?? "").trim().replace(/\s*\n\s*/g, " ");
			if (!words || !reading) return text("An instruction needs Jo's words and your one-line reading; nothing was recorded.");
			if (id === STANDING_WORKLOAD_ID) return text("Jo's instructions are recorded on the workload they are about, not the standing one; nothing was recorded.");
			const ledger = s.ledger();
			const w = ledger.workload(id);
			if (!w) return text(`No workload ${id}; nothing was recorded.`);
			if (w.status === "closed") return text(`${id} is closed (${w.closed_at}); nothing was recorded.`);
			const row = ledger.recordInstruction({ by: SURFACE_BY, workloadId: id, body: `Jo: "${words}" — reading: ${reading}`, author: "jo", channel: "surface" });
			pi.appendEntry("surface-instruction", { id: row, workloadId: id });
			return text(`Recorded instruction ${row} on ${id} (author jo, channel surface): "${words}" — ${reading}`, { id: row, workloadId: id });
		},
	});
}
