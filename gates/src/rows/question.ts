// P-11 lane-raised question row (DESIGN-2.0.md:354; SPEC-2.0.md:415-433 § B3 item 5, gaslight G3):
// an autonomous lane's material non-reserved choice becomes a `question` ledger row with a stable id
// that pauses only its slice (the ledger does the pause, ledger/src/index.ts:586). The gate here
// refuses a second *change* on the unanswered choice until Jo answers; research that assumes no
// answer is allowed. No four-hour timer: an open question stays open and rendered at wake.
//
// Judged on ledger state, not on which ids the prose mentions (astra review B5). While the workload
// has an open question, a dispatch declares its kind and, for a change, the ledger slice it works;
// with no open question the gate ignores both (SPEC-2.0.md § B9 as amended 2026-09-28; astra review
// round 2, R2-S1):
//
//   kind: research | change      (research = reads and reports, changes nothing)
//   slice: sl-…                  (required for a change)
//
// While a question is open, a dispatch is refused when it declares no kind or an unknown one, and a
// change is refused when it declares no slice, when its slice is paused on an open question or
// cancelled, or when it names an open question or its slice. `kind: research` passes.
// Independently of open state, a dispatch naming a withdrawn question of the workload is refused
// unless it declares `kind: research`, since a withdrawal cancels or replans and never approves either option.
import type { GateLedger, Refusal } from "../types";
import { dispatchItems } from "./r04-tier-name";

type QuestionLedger = Pick<GateLedger, "inFlight" | "question" | "slice">;

const DECLARED = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?(slice|kind)(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(\S.*?)[ \t]*$/gim;

/** `slice:` and `kind:` from the item's task, then the batch context (the row-5 lookup order). */
function declared(task: string, context: string): { slice?: string; kind?: string } {
	const out: { slice?: string; kind?: string } = {};
	for (const text of [task, context]) {
		for (const m of text.matchAll(DECLARED)) {
			const key = m[1]!.toLowerCase() as "slice" | "kind";
			out[key] ??= m[2]!.toLowerCase();
		}
	}
	return out;
}

function refuse(why: string): Refusal {
	return {
		block: true,
		reason:
			`P-11 question row refused this dispatch: ${why} ` +
			`A second change on an unanswered question waits for Jo's answer; dispatch changes on slices that do not depend on it ` +
			`(declare \`slice: sl-…\` and \`kind: change\`), or research that assumes no answer (\`kind: research\`).`,
	};
}

/** Refuses a `task` dispatch that changes work paused on, or cancelled by, a question of this workload. */
export function checkQuestionDispatch(input: Record<string, unknown>, ledger: QuestionLedger, workloadId: string): Refusal {
	const wl = ledger.inFlight().find((w) => w.workload.id === workloadId);
	const open = wl?.openQuestions ?? [];
	const context = typeof input.context === "string" ? input.context : "";
	for (const item of dispatchItems(input)) {
		const task = typeof item.task === "string" ? item.task : "";
		const d = declared(task, context);
		const text = `${task}\n${context}`;
		if (d.kind !== "research") {
			for (const id of new Set([...text.matchAll(/\bq-[0-9a-z]{6,}\b/g)].map((m) => m[0]))) {
				const q = ledger.question(id);
				if (q && q.workload_id === workloadId && q.state === "withdrawn") {
					return refuse(`${id} was withdrawn; a withdrawal cancels or replans the affected slice and never approves the unanswered choice. Replan without assuming either option, or raise a new question.`);
				}
			}
		}
		if (open.length === 0) continue;
		if (d.kind !== undefined && d.kind !== "research" && d.kind !== "change") return refuse(`\`kind: ${d.kind}\` is neither research nor change.`);
		if (d.kind === "research") continue;
		// A change, or a dispatch that does not say: naming an open question or its slice is a change on it.
		for (const q of open) {
			if (text.includes(q.id) || text.includes(q.slice_id)) return refuse(`it changes work on ${q.id} ("${q.body}"), which is open and pauses slice ${q.slice_id}.`);
		}
		const pending = `${workloadId} has ${open.length} open question(s) (${open.map((q) => `${q.id} on ${q.slice_id}`).join(", ")})`;
		if (d.kind === undefined) return refuse(`${pending} and this dispatch declares no \`kind:\` (research or change), so the gate cannot tell whether it changes work that depends on one.`);
		if (d.slice === undefined) return refuse(`${pending} and this change declares no slice, so the gate cannot tell it does not depend on one.`);
		const slice = ledger.slice(d.slice);
		if (!slice || slice.workload_id !== workloadId) return refuse(`\`slice: ${d.slice}\` is not a slice of ${workloadId} in the ledger.`);
		if (slice.state === "paused") return refuse(`slice ${slice.id} is paused on an open question.`);
		if (slice.state === "cancelled") return refuse(`slice ${slice.id} was cancelled (a withdrawn question's disposition, or by the lane).`);
	}
	return null;
}

/** Every unresolved question on the workload, for the wake render and the workload row. Empty string when none. */
export function renderOpenQuestions(ledger: Pick<GateLedger, "inFlight">, workloadId: string): string {
	const wl = ledger.inFlight().find((w) => w.workload.id === workloadId);
	if (!wl || wl.openQuestions.length === 0) return "";
	const lines = wl.openQuestions.map(
		(q) => `- ${q.id} (slice ${q.slice_id}, paused, raised ${q.created_at}): ${q.body}\n  options: ${q.options.join(" | ")}`,
	);
	return `Unresolved questions on ${workloadId} (${lines.length}; each pauses only its slice, no timer; waits for Jo's answer or withdrawal):\n${lines.join("\n")}`;
}
