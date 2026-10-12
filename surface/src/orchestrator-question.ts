// The orchestrator's questions to Jo as ledger rows (MIGRATION.md item 105). Every QUESTION the
// orchestrator puts to Jo is first a `questions` row on the standing slice (surface/src/identity.ts
// `standingSlice`), raised by `orchestrator_raise_question` (surface/extensions/question.ts), so the
// row exists before Jo sees the ask, the needs-you render (surface/src/errors.ts) and the invariant
// report's `stuck-question` (surface/scripts/invariants.ts) see it, and a restart re-renders it.
// P-11 row 15 (gates/src/rows/r15-orchestrator-role.ts) refuses the orchestrator's next working
// call while its newest QUESTION block names no such row, or names one still open.
//
// An ask is usually *about* another workload, whose lanes read decisions from their own workload.
// The `questions` table has no spare column (ledger/schema.sql), so the subject rides in the body
// as the prefix `about <wl-…>: `; Jo's answer resolves the row and, in the same transaction, writes
// a plain `instruction` row by Jo on the subject workload (`Ledger.answerQuestionMirrored`), which is
// what the subject's lanes and row 15's old answer-first reading see. Both answer paths — Jo's
// `<option> q-…` word at the surface (surface/src/input.ts `apply`) and the recorder for an answer
// in prose (`orchestrator_record_instruction` with `questionId`) — go through `answerOrchestratorQuestion`.
// A withdrawal on the standing slice always replans (`apply`): a `cancel` would cancel the slice
// (schema.sql questions_resolution_settles_slice) and no orchestrator question could be raised again.
import type { Ledger } from "../../ledger/src/index";
import { SURFACE_BY } from "./types";

/** `about <wl-…>: <the question>`; a question with no subject workload is its text alone. A question on the standing workload (`workload_id === STANDING_WORKLOAD_ID`) is the orchestrator's own. */
const ABOUT = /^about (wl-[a-z0-9]+): ([\s\S]+)$/;

/** The row body for an ask: the subject workload's id as the `about` prefix, then the text. */
export function orchestratorQuestionBody(about: string | null, text: string): string {
	return about ? `about ${about}: ${text}` : text;
}

/** The subject workload (null for none) and the text of an orchestrator question's body. */
export function parseOrchestratorQuestion(body: string): { about: string | null; text: string } {
	const m = ABOUT.exec(body);
	return m ? { about: m[1]!, text: m[2]! } : { about: null, text: body };
}

export interface OrchestratorAnswer {
	/** The `answer` instruction resolving the row, on the standing workload. */
	answerId: string;
	/** The subject workload the mirror instruction went on, or null (no subject, or the subject is closed). */
	about: string | null;
	/** The mirror `instruction` row by Jo on the subject workload, or null when none was written. */
	mirrorId: string | null;
}

/**
 * Jo's answer on an orchestrator question: the row resolved by an answer instruction (author jo,
 * channel surface) and, when the ask names a subject workload that is still open, the mirror
 * instruction `mirrorBody` on it, both in one transaction. `about` overrides the body's subject
 * for an ask that named none; a subject that closed meanwhile gets no mirror and the answer still lands.
 */
export function answerOrchestratorQuestion(
	ledger: Ledger, q: { id: string; body: string }, input: { answer: string; mirrorBody: string; about?: string | null },
): OrchestratorAnswer {
	const stamp = { by: SURFACE_BY, author: "jo", channel: "surface" as const };
	const subject = parseOrchestratorQuestion(q.body).about ?? input.about ?? null;
	const open = subject !== null && ledger.workload(subject)?.status === "open";
	if (!open) return { answerId: ledger.answerQuestion(q.id, { ...stamp, answer: input.answer }), about: null, mirrorId: null };
	const r = ledger.answerQuestionMirrored(q.id, { ...stamp, answer: input.answer, mirror: { workloadId: subject, body: input.mirrorBody } });
	return { answerId: r.answerId, about: subject, mirrorId: r.mirrorId };
}
