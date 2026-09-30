// Jo's one-word inputs at the surface (SPEC-2.0.md § A1.2, § B3 item 5, § B5, § B13.1): a stakes
// word or a mode word flips the workload in view; an option name answers the oldest open question;
// `withdraw` withdraws it (then replan); `approve <id>` / `deny <id>` answers a reserved request.
// Every applied word is a ledger row (§ B5: the flip is a ledgered instruction), author "jo",
// channel "surface". Anything else is ordinary conversation for the orchestrator model.
import type { Ledger, Mode, Stakes } from "../../ledger/src/index";
import { waitingReserved } from "./errors";
import { controlEntries, holdersOf, planApprovedBody, planFirst, planSlice } from "./launch";
import { MODE_WORDS, STAKES_WORDS, STANDING_WORKLOAD_ID, SURFACE_BY } from "./types";

export type Command =
	| { kind: "stakes"; workloadId: string; stakes: Stakes }
	| { kind: "mode"; workloadId: string; mode: Mode }
	| { kind: "answer"; workloadId: string; questionId: string; answer: string }
	| { kind: "withdraw"; workloadId: string; questionId: string; then: "replan" | "cancel" }
	| { kind: "reserved"; workloadId: string; entryId: string; verdict: "approve" | "deny" };

/** Workloads Jo's words apply to: the open workloads other than the standing one, oldest first. */
export function workloadsInView(ledger: Ledger): string[] {
	return ledger.inFlight().map((w) => w.workload.id).filter((id) => id !== STANDING_WORKLOAD_ID);
}

/**
 * Interpret `text`. A stakes/mode word alone targets the only workload in view (or the one given
 * as a second word: `production wl-…`). An option word targets the oldest open question; when
 * several questions share the option, the second word picks the question id.
 */
export function interpret(ledger: Ledger, text: string): Command | null {
	const words = text.trim().split(/\s+/);
	if (words.length === 0 || words.length > 2) return null;
	const word = words[0]!.toLowerCase();
	const arg = words[1];
	const view = workloadsInView(ledger);
	const target = (): string | null => (arg && view.includes(arg) ? arg : view.length === 1 ? view[0]! : null);

	if ((STAKES_WORDS as readonly string[]).includes(word)) {
		const wl = target();
		return wl ? { kind: "stakes", workloadId: wl, stakes: word as Stakes } : null;
	}
	if ((MODE_WORDS as readonly string[]).includes(word) || word === "user driven") {
		const wl = target();
		return wl ? { kind: "mode", workloadId: wl, mode: (word === "user driven" ? "user-driven" : word) as Mode } : null;
	}
	if (word === "approve" || word === "deny") {
		// The orchestrator's own reserved refusals sit on the standing workload (gates/extensions/r06-reserved.ts): searched last.
		for (const wl of [...view, STANDING_WORKLOAD_ID]) {
			const waiting = waitingReserved(ledger, wl);
			const hit = arg ? waiting.find((r) => r.id === arg) : waiting[0];
			if (hit) return { kind: "reserved", workloadId: wl, entryId: hit.id, verdict: word };
		}
		// No reserved request waits: *approve* is then an ordinary option word (the plan question's, decision 15).
	}
	const questions = ledger.inFlight().flatMap((w) => w.openQuestions);
	if (word === "withdraw") {
		const q = arg ? questions.find((x) => x.id === arg) : questions[0];
		return q ? { kind: "withdraw", workloadId: q.workload_id, questionId: q.id, then: "replan" } : null;
	}
	const matches = questions.filter((q) => q.options.some((o) => o.toLowerCase() === word));
	const q = arg ? matches.find((x) => x.id === arg) : matches[0];
	if (!q) return null;
	const answer = q.options.find((o) => o.toLowerCase() === word)!;
	return { kind: "answer", workloadId: q.workload_id, questionId: q.id, answer };
}

/** Is `q` the plan slice's question: `plan: first` stands on its workload and its slice is the plan slice (decision 15). */
export function isPlanQuestion(ledger: Ledger, q: { workload_id: string; slice_id: string }): boolean {
	const w = ledger.workload(q.workload_id);
	if (!w) return false;
	const entries = ledger.entries(q.workload_id);
	if (planFirst(controlEntries(entries, holdersOf(entries, w.holder))) === null) return false;
	return planSlice(ledger.slices(q.workload_id))?.id === q.slice_id;
}

/** Apply a command through the ledger module as Jo via the surface. Returns the one-line receipt. */
export function apply(ledger: Ledger, cmd: Command): string {
	const stamp = { by: SURFACE_BY, author: "jo", channel: "surface" as const };
	switch (cmd.kind) {
		case "stakes": {
			ledger.setStakes(cmd.workloadId, { by: SURFACE_BY, stakes: cmd.stakes });
			const id = ledger.recordInstruction({ ...stamp, workloadId: cmd.workloadId, body: `stakes: ${cmd.stakes}` });
			return `stakes on ${cmd.workloadId} → ${cmd.stakes} (instruction ${id})`;
		}
		case "mode": {
			const id = ledger.flipMode(cmd.workloadId, { ...stamp, mode: cmd.mode });
			return `mode on ${cmd.workloadId} → ${cmd.mode} (mode-flip ${id}; effective before the lane's next turn)`;
		}
		case "answer": {
			// Decision 15: on the plan slice's question, *approve* also writes `plan: approved <instruction>` (surface-stamped, same
			// transaction) and *cancel* is a withdrawal that cancels the slice; *revise* is an ordinary answer that reopens it.
			const q0 = ledger.question(cmd.questionId)!;
			const plan = isPlanQuestion(ledger, q0);
			const word = cmd.answer.toLowerCase();
			if (plan && word === "cancel") {
				const id = ledger.withdrawQuestion(cmd.questionId, { ...stamp, reason: "plan cancelled from the surface", then: "cancel" });
				return `cancelled the plan: withdrew ${cmd.questionId} (withdrawal ${id}); slice ${q0.slice_id} is ${ledger.slice(q0.slice_id)?.state ?? "unknown"}`;
			}
			const id = ledger.write(() => {
				const answerId = ledger.answerQuestion(cmd.questionId, { ...stamp, answer: cmd.answer });
				if (plan && word === "approve") ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: planApprovedBody(answerId) });
				return answerId;
			});
			const slice = ledger.slice(q0.slice_id);
			const approved = plan && word === "approve" ? "; plan approved: change slices may now be added" : "";
			return `answered ${cmd.questionId} with "${cmd.answer}" (answer ${id}); slice ${q0.slice_id} is ${slice?.state ?? "unknown"}${approved}`;
		}
		case "withdraw": {
			const id = ledger.withdrawQuestion(cmd.questionId, { ...stamp, reason: "withdrawn from the surface", then: cmd.then });
			const q = ledger.question(cmd.questionId)!;
			const slice = ledger.slice(q.slice_id);
			return `withdrew ${cmd.questionId} (withdrawal ${id}, then ${cmd.then}); slice ${q.slice_id} is ${slice?.state ?? "unknown"}: replanned, not executed`;
		}
		case "reserved": {
			const id = ledger.recordInstruction({ ...stamp, workloadId: cmd.workloadId, body: `${cmd.verdict} ${cmd.entryId}` });
			return `${cmd.verdict === "approve" ? "approved" : "denied"} reserved request ${cmd.entryId} (instruction ${id})`;
		}
	}
}
