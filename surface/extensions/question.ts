// The orchestrator's question to Jo as a ledger row (MIGRATION.md item 105; surface/src/orchestrator-question.ts).
// The tool writes the `questions` row on the standing slice before the QUESTION block is rendered,
// and returns the id the block must name: P-11 row 15 (gates/src/rows/r15-orchestrator-role.ts)
// refuses the orchestrator's next working call while its newest QUESTION names no such row. The
// subject workload (the one the ask is about, which Jo's answer is mirrored onto) rides in the body.
// Jo answers by id at the surface (`<option> q-…`, `withdraw q-…`) or in prose, which the orchestrator
// records with orchestrator_record_instruction naming the question (surface/extensions/workload.ts).
import { ensureStandingWorkload, standingSlice } from "../src/identity";
import { orchestratorQuestionBody } from "../src/orchestrator-question";
import { surfaceSession } from "../src/session";
import { RAISE_QUESTION_TOOL, STANDING_WORKLOAD_ID, type SurfaceAPI, SURFACE_BY, type ToolResult } from "../src/types";

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });
const inactive = text("This session is not the orchestrator surface; nothing was written.");

export default function questionRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;
	pi.registerTool({
		name: RAISE_QUESTION_TOOL,
		loadMode: "essential",
		label: "Ask Jo",
		description:
			"Before any **QUESTION** block to Jo, raise the question here: it becomes a ledger row on your standing slice, so Jo can answer it by id, the needs-you lines show it, and a restart re-renders it. " +
			"Put the returned q-… id in the QUESTION block (e.g. `**QUESTION**\\n(q-…) Should …? Options: a / b`). A QUESTION block naming no such row leaves your next working call refused (P-11 row 15). " +
			"Name the open workload the ask is about: Jo's answer is mirrored there as an instruction row, where its lanes read it.",
		parameters: z.object({
			body: z.string().describe("The question, in plain words, with the referent restored (no `this`/`that`)."),
			options: z.array(z.string()).describe("At least two answers Jo can give in one word each; recommend one in the body."),
			about: z.string().optional().describe("The open workload the ask is about (wl-…), when there is one; Jo's answer is mirrored onto it."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const body = String(params.body ?? "").trim().replace(/\s*\n\s*/g, " ");
			const options = Array.isArray(params.options) ? params.options.map((x) => String(x).trim()).filter((x) => x.length > 0) : [];
			const about = typeof params.about === "string" && params.about.trim() ? params.about.trim() : null;
			if (!body) return text("A question needs a body; nothing was asked.");
			if (new Set(options.map((x) => x.toLowerCase())).size < 2) return text("A question offers at least two distinct options Jo can answer with; nothing was asked.");
			if (options.some((x) => /\s/.test(x))) return text("Each option is one word (Jo answers with it alone or as `<option> q-…`); nothing was asked.");
			const ledger = s.ledger();
			if (about !== null) {
				if (about === STANDING_WORKLOAD_ID) return text("The standing workload is never a question's subject; name the workload the ask is about, or none. Nothing was asked.");
				if (!/^wl-[a-z0-9]+$/.test(about)) return text(`${about} is not a workload id (wl-…); nothing was asked.`);
				const w = ledger.workload(about);
				if (!w) return text(`No workload ${about}; nothing was asked.`);
				if (w.status === "closed") return text(`${about} is closed (${w.closed_at}); a question is about an open workload, or none. Nothing was asked.`);
			}
			ensureStandingWorkload(ledger);
			const slice = standingSlice(ledger)!;
			const id = ledger.raiseQuestion({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, sliceId: slice.id, body: orchestratorQuestionBody(about, body), options });
			pi.appendEntry("surface-question", { id, about });
			return text(`Raised question ${id}${about ? ` about ${about}` : ""} (${options.join(" / ")}); name ${id} in your QUESTION block. Jo answers with \`<option> ${id}\` or \`withdraw ${id}\`, or in prose you record with orchestrator_record_instruction naming questionId ${id}.`, { id, about, options });
		},
	});
}
