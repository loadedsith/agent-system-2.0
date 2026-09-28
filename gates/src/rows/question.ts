// P-11 lane-raised question row (DESIGN-2.0.md:354; SPEC-2.0.md:415-433 § B3 item 5, gaslight G3):
// an autonomous lane's material non-reserved choice becomes a `question` ledger row with a stable id
// that pauses only its slice (the ledger does the pause, ledger/src/index.ts:551). The gate here:
// a dispatch that names an open question, or the slice it pauses, is refused until Jo answers — a
// second `change` slice on the same question; a withdrawn question is refused the same way, since a
// withdrawal cancels or replans and never approves the unanswered choice. No four-hour timer: an
// open question stays open and rendered at wake (every unresolved one, not a last-N window).
import type { GateLedger } from "../ledger-port";
import type { Refusal } from "../types";
import { dispatchItems } from "./r04-tier-name";

type QuestionLedger = Pick<GateLedger, "inFlight" | "question">;

/** Every question id (`q-…`) a brief text names. */
function questionIds(text: string): string[] {
	return [...text.matchAll(/\bq-[0-9a-z]{6,}\b/g)].map((m) => m[0]);
}

/** Refuses a `task` dispatch that acts on an open or withdrawn question of this workload. */
export function checkQuestionDispatch(input: Record<string, unknown>, ledger: QuestionLedger, workloadId: string): Refusal {
	const wl = ledger.inFlight().find((w) => w.workload.id === workloadId);
	const open = wl?.openQuestions ?? [];
	const texts = dispatchItems(input).map((item) => `${typeof item.task === "string" ? item.task : ""}\n${typeof input.context === "string" ? input.context : ""}`);
	for (const text of texts) {
		for (const q of open) {
			if (text.includes(q.id) || text.includes(q.slice_id)) {
				return {
					block: true,
					reason:
						`P-11 question row refused this dispatch: it acts on ${q.id} ("${q.body}"), which is open and pauses slice ${q.slice_id}. ` +
						`A second change slice on the same question waits for Jo's answer. Dispatch slices that do not depend on it; this one resumes when the answer instruction lands.`,
				};
			}
		}
		for (const id of questionIds(text)) {
			const q = ledger.question(id);
			if (q && q.workload_id === workloadId && q.state === "withdrawn") {
				return {
					block: true,
					reason:
						`P-11 question row refused this dispatch: ${id} was withdrawn. A withdrawal cancels or replans the affected slice and never counts as approval ` +
						`of the unanswered choice. Replan without assuming either option, or raise a new question.`,
				};
			}
		}
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
