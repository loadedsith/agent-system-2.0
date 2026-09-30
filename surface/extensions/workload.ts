// The orchestrator's ledger writes, each a tool through the ledger module (P-11 row 10: the module
// is the only writer): identity (first wake), open a workload with stakes and mode inferred and the
// repository's decision log rendered into the lane brief (§ A1.2, § B13.1, § B2.1, C7.5), close a
// workload with a decision-log entry rendered from the ledger, and schedule a row that surfaces
// under *needs you* once past due (M11).
import { join } from "node:path";
import { decisionLogContext, lastWorkloadOn, recordRepo, renderClose, repoOf } from "../src/decision-log";
import { identityOf, recordIdentity } from "../src/identity";
import { oneLiner } from "../src/render";
import { surfaceSession } from "../src/session";
import { inferMode, inferStakes } from "../src/stakes";
import {
	CLOSE_WORKLOAD_TOOL, DECISION_LOG_ENV, DUE_PREFIX, IDENTITY_TOOL, MODE_WORDS, OPEN_WORKLOAD_TOOL, SCHEDULE_TOOL,
	STAKES_WORDS, STANDING_WORKLOAD_ID, type SurfaceAPI, SURFACE_BY, type ToolResult,
} from "../src/types";

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });
const inactive = text("This session is not the orchestrator surface; nothing was written.");

export default function workloadRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;
	const logDir = (repo: string) => env[DECISION_LOG_ENV] || join(repo, ".ai", "decision-log");

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
			"Returns the id, the one-liner, and the repository's decision-log entries newer than the last 2.0 workload on it, to put in the lane brief.",
		parameters: z.object({
			brief: z.string().describe("What Jo said, as the workload brief."),
			repo: z.string().optional().describe("Absolute path of the target repository. Default: the session's cwd."),
			branch: z.string().optional().describe("Target branch, when known."),
			reservedTarget: z.string().optional().describe("'yes' when the work names a reserved target (protected-branch push, deploy, spend)."),
			stakes: z.string().optional().describe("Override: throwaway | normal | production."),
			mode: z.string().optional().describe("Override: autonomous | user-driven."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const brief = String(params.brief ?? "").trim();
			if (!brief) return text("A workload needs a brief; nothing was opened.");
			const repo = typeof params.repo === "string" && params.repo ? params.repo : ctx.cwd;
			const stakes = inferStakes({ said: brief, repo, branch: typeof params.branch === "string" ? params.branch : null, reservedTarget: /^(yes|true|1)$/i.test(String(params.reservedTarget ?? "")) });
			const mode = inferMode(brief);
			const stakesOverride = (STAKES_WORDS as readonly string[]).includes(String(params.stakes)) ? (String(params.stakes) as (typeof STAKES_WORDS)[number]) : null;
			const modeOverride = (MODE_WORDS as readonly string[]).includes(String(params.mode)) ? (String(params.mode) as (typeof MODE_WORDS)[number]) : null;
			const ledger = s.ledger();
			const id = ledger.openWorkload({ by: SURFACE_BY, brief, stakes: stakesOverride ?? stakes.value, mode: modeOverride ?? mode.value });
			recordRepo(ledger, id, repo);
			const since = lastWorkloadOn(ledger, repo);
			const context = decisionLogContext(logDir(repo), { since });
			const row = ledger.workload(id)!;
			const lines = [
				`Opened ${id} on ${repo}.`,
				oneLiner(ledger, row),
				`stakes ${stakesOverride ? `overridden to ${stakesOverride}` : `inferred ${stakes.value}: ${stakes.reason}`}; mode ${modeOverride ? `overridden to ${modeOverride}` : `inferred ${mode.value}: ${mode.reason}`}.`,
				"",
				context || `No decision-log entries to carry (${since ? `none newer than ${since}` : `none in ${logDir(repo)} from the last 14 days`}).`,
			];
			pi.appendEntry("surface-open", { id, repo, stakes: row.stakes, mode: row.mode });
			return text(lines.join("\n"), { id, stakes: row.stakes, mode: row.mode, since, context });
		},
	});

	pi.registerTool({
		name: CLOSE_WORKLOAD_TOOL,
		loadMode: "essential",
		label: "Close Workload",
		description:
			"Close a workload: one decision-log entry is rendered from the ledger into the repository's .ai/decision-log/ (filename YYYY-MM-DD--HHMM--<your name>--<slug>.md), then the row closes. " +
			"Refused while slices are open or paused or a question is open. For a scheduled row, `receipt` is the receipt it closes with.",
		parameters: z.object({
			workloadId: z.string().describe("The workload id (wl-…)."),
			receipt: z.string().optional().describe("What closes it (a scheduled row's receipt, or a one-line summary); recorded as an instruction."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const id = String(params.workloadId ?? "");
			if (id === STANDING_WORKLOAD_ID) return text("The standing orchestrator workload is never closed.");
			const ledger = s.ledger();
			const w = ledger.workload(id);
			if (!w) return text(`No workload ${id}.`);
			if (w.status === "closed") return text(`${id} is already closed (${w.closed_at}).`);
			if (w.open_slices > 0 || w.paused_slices > 0 || w.open_questions > 0) {
				return text(`${id} cannot close: ${w.open_slices} open slice(s), ${w.paused_slices} paused, ${w.open_questions} open question(s). Settle them first.`);
			}
			const receipt = typeof params.receipt === "string" && params.receipt.trim() ? params.receipt.trim() : null;
			if (receipt) ledger.recordInstruction({ by: SURFACE_BY, workloadId: id, body: `close receipt: ${receipt}`, author: "orchestrator", channel: "surface" });
			const repo = repoOf(ledger, id) ?? ctx.cwd;
			const rendered = w.brief.startsWith(DUE_PREFIX) ? null : renderClose(ledger, id, logDir(repo), identityOf(ledger));
			ledger.closeWorkload(id, { by: SURFACE_BY });
			pi.appendEntry("surface-close", { id, path: rendered?.path ?? null });
			return text(`Closed ${id}.${rendered ? ` Decision-log entry rendered at ${rendered.path}.` : " (scheduled row: no decision-log entry)"}`, { id, path: rendered?.path ?? null });
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
}
