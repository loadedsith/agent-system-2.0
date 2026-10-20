// Jo's words on a forgery hit (PLAN wl-mvfxw3c4zqfzls D5), interpreted by surface/src/input.ts like `approve en-…`:
//
// - `confirm <row id>`: the row was Jo's. Jo's instruction `confirm <row id>`, then the surface's `forgery-confirmed: <row id> by
//   <in-…>` naming it, on the flagged row's workload while it is open, else on the standing workload (`forgeryPlacement`). The
//   check never flags the row again, and the hold lifts once no hit on the workload is unanswered. When that was the last one,
//   the workload is open and the hold stopped an autonomous lane that has not come back (a `forgery-hold` stop request with no
//   `launch:` attempt after it), Jo's `launch-requested:` too, so the lane comes back as Jo's `go` brings it (N8).
// - `reverse <row id>`: the row was not Jo's. Jo's instruction `reverse <row id>`, then `forgery-reversed: <row id> by <in-…>`
//   (ledger/src/jo-channel.ts) in the same placement, then what D5's table undoes. A control entry and a `repo:` entry need no
//   write: `controlEntries` and `repoOf` skip a reversed id. An instruction of any kind leaves every decision read
//   (`Ledger.instructions`); a reversed answer or `replan` withdrawal is no resolution (`resolutions` reads the filtered rows), so
//   its question is re-asked on the same slice, same body and options, stamped as the original asker, while the slice is open
//   or paused. A reversed mode-flip gets Jo's compensating flip back to the mode before it. What cannot be undone is named in
//   the receipt: a `cancel` withdrawal (a cancelled slice is terminal; a deferred one still fires, ledger/schema.sql
//   `questions_resolution_settles_slice`), the launches and boardings the row led to (`consequences`: the lane's commits,
//   pushes and spend, the merge), and anything on a closed workload.
// A row id no recorded hit names, or a hit Jo already answered, is refused, never applied and never prose.
import { forgeryReversedBody } from "../../ledger/src/jo-channel";
import type { InstructionRow, Ledger, Mode } from "../../ledger/src/index";
import { consequences, deferredCancels, forgeryPlacement, hitWorkloads, holdStops, type RecordedHit, recordedHits, unansweredHits } from "./forgery-hold";
import { modeFlipControl } from "./input";
import { attempts, type ControlEntry, controlEntries, forgeryConfirmedBody, holdersOf, launchRequestedBody } from "./launch";
import { STANDING_WORKLOAD_ID, SURFACE_BY } from "./types";

/** The two words, first word of the line. */
export const FORGERY_WORDS = ["confirm", "reverse"] as const;
export type ForgeryWord = (typeof FORGERY_WORDS)[number];

/**
 * Jo's word on the recorded hit of `rowId`: `workloadId` is the flagged row's workload, `on` where the answer is written
 * (`workloadId` while it is open, else the standing workload).
 */
export type ForgeryWordCommand =
	| { kind: "forgery-confirm"; workloadId: string; on: string; rowId: string }
	| { kind: "forgery-reverse"; workloadId: string; on: string; rowId: string };

/** A row id the check can flag: an instruction or an entry. */
const ROW_ID = /^(in|en)-\S+$/i;

/** The recorded hit naming `rowId`, on whichever workload holds it, or null. */
export function hitFor(ledger: Ledger, rowId: string): RecordedHit | null {
	for (const wl of hitWorkloads(ledger)) {
		const h = recordedHits(ledger, wl).find((x) => x.rowId === rowId);
		if (h) return h;
	}
	return null;
}

/** Why `word <rowId>` cannot apply, or null: a recorded hit names the row and Jo has not answered it. `apply` checks it again. */
function refusalOf(word: ForgeryWord, rowId: string, hit: RecordedHit | null): string | null {
	if (hit === null) return `no recorded forgery hit names ${rowId}: \`${word} <row id>\` answers a flagged row on the needs-you list`;
	if (hit.answer !== null) return `${rowId} is already ${hit.answer.kind} (entry ${hit.answer.entryId}); a hit takes one answer`;
	return null;
}

/**
 * `confirm <row id>` / `reverse <row id>` after the word: the command, or `refused` with the reason; null when the line is not this
 * command (the word alone, or with an id that is no instruction or entry: `confirm q-…` still answers a question offering it).
 */
export function forgeryWordCommand(ledger: Ledger, word: string, rest: readonly string[]): ForgeryWordCommand | { kind: "refused"; why: string } | null {
	if (word !== "confirm" && word !== "reverse") return null;
	if (rest.length === 0 || !ROW_ID.test(rest[0]!)) return null;
	if (rest.length > 1) return { kind: "refused", why: `${word} names one flagged row: ${word} <row id>` };
	const rowId = rest[0]!;
	const hit = hitFor(ledger, rowId);
	const why = refusalOf(word, rowId, hit);
	if (why !== null) return { kind: "refused", why };
	const on = forgeryPlacement(ledger, hit!.workloadId);
	return { kind: word === "confirm" ? "forgery-confirm" : "forgery-reverse", workloadId: hit!.workloadId, on, rowId };
}

/** A workload's valid control entries, every holder counted. */
function controlOf(ledger: Ledger, wl: string): ControlEntry[] {
	const entries = ledger.entries(wl);
	return controlEntries(entries, holdersOf(entries, ledger.workload(wl)?.holder ?? null, ledger.holders(wl)));
}

/**
 * Apply Jo's `confirm` or `reverse` in one transaction: the hit and its answer checked again (a refusal throws, writing nothing),
 * Jo's instruction and the surface's answer entry naming it, then the confirm's relaunch or the reversal's compensations.
 * Returns the receipt.
 */
export function applyForgeryWord(ledger: Ledger, cmd: ForgeryWordCommand): string {
	const word: ForgeryWord = cmd.kind === "forgery-confirm" ? "confirm" : "reverse";
	return ledger.write(() => {
		const hit = hitFor(ledger, cmd.rowId);
		const why = refusalOf(word, cmd.rowId, hit);
		if (why !== null) throw new Error(why);
		const on = forgeryPlacement(ledger, hit!.workloadId);
		const stamp = { by: SURFACE_BY, author: "jo", channel: "surface" as const };
		const inId = ledger.recordInstruction({ ...stamp, workloadId: on, body: `${word} ${cmd.rowId}` });
		return word === "confirm" ? confirm(ledger, hit!, on, inId) : reverse(ledger, hit!, on, inId);
	});
}

/** The confirm's writes after Jo's instruction `inId`; returns the receipt. */
function confirm(ledger: Ledger, hit: RecordedHit, on: string, inId: string): string {
	const wl = hit.workloadId;
	const entryId = ledger.recordEntry({ by: SURFACE_BY, workloadId: on, kind: "assumption", body: forgeryConfirmedBody(hit.rowId, inId) });
	const head = `confirmed ${hit.rowId} on ${wl} as yours (instruction ${inId}, forgery-confirmed ${entryId})`;
	const left = unansweredHits(ledger, wl);
	if (left.length > 0) return `${head}; ${wl} stays held: ${left.length} flagged ${left.length === 1 ? "row" : "rows"} unanswered (${left.map((h) => h.rowId).join(", ")})`;
	if (on !== wl) return `${head}; ${wl} is closed: nothing held it but the boarding refusal, now lifted`;
	const control = controlOf(ledger, wl);
	const tried = attempts(control);
	const stopped = holdStops(control).filter((s) => !tried.some((a) => a.createdAt > s.createdAt));
	if (stopped.length === 0) return `${head}; the hold on ${wl} is lifted`;
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: launchRequestedBody("jo", ledger.now(), "forgery confirmed") });
	const lanes = [...new Set(stopped.map((s) => s.laneId).filter((l) => l !== null))].join(", ");
	return `${head}; the hold on ${wl} is lifted, and it had stopped ${lanes}, so a relaunch is requested`;
}

/** The mode `wl` had just before the raw instruction `flipId`: the effective mode-flip before it, else the mode it opened with. */
function modeBefore(ledger: Ledger, wl: string, flipId: string): Mode | null {
	const raw = ledger.instructions(wl, { withReversed: true });
	const kept = new Set(ledger.instructions(wl).map((i) => i.id));
	let prior: Mode | null = null;
	for (const i of raw) {
		if (i.id === flipId) break;
		if (i.kind === "mode-flip" && kept.has(i.id)) prior = i.body as Mode;
	}
	if (prior !== null) return prior;
	const opened = ledger.provenance(wl).find((p) => p.tbl === "workloads" && p.action === "insert");
	const m = opened ? / mode=(autonomous|user-driven)\b/.exec(opened.detail ?? "") : null;
	return m ? (m[1] as Mode) : null;
}

/** What reversing the instruction `ins` of open workload `wl` does beyond voiding it, as receipt parts; `undone` gathers what cannot be. */
function reverseInstruction(ledger: Ledger, wl: string, ins: InstructionRow, undone: string[]): string[] {
	if (ins.kind === "mode-flip") {
		// The reversal entry is already written, so `modeBefore`'s effective read leaves `ins` out; it reads only the rows before it.
		const prior = modeBefore(ledger, wl, ins.id);
		const now = ledger.workload(wl)!.mode;
		if (prior === null || prior === now) return [`mode-flip ${ins.id} voided; ${wl} is ${now} already, so no flip back`];
		const flip = ledger.flipMode(wl, { by: SURFACE_BY, author: "jo", channel: "surface", mode: prior });
		return [`mode on ${wl} flipped back ${now} → ${prior} (mode-flip ${flip})${modeFlipControl(ledger, wl, prior)}`];
	}
	if (ins.kind === "instruction") return [`instruction ${ins.id} voided for every decision reader`];
	const q = ins.question_id ? ledger.question(ins.question_id) : null;
	const slice = q ? ledger.slice(q.slice_id) : null;
	if (!q || !slice) return [`${ins.kind} ${ins.id} voided for every decision reader`];
	if (ins.kind === "withdrawal" && ins.disposition === "cancel") {
		const deferred = deferredCancels(ledger, wl).find((d) => d.rowId === ins.id);
		if (deferred) {
			undone.push(`the cancel of ${slice.id} is deferred and still fires: resolving ${deferred.questionIds.join(" or ")} cancels ${slice.id} (ledger/schema.sql questions_resolution_settles_slice); re-cut the slice to keep its work`);
		} else {
			undone.push(`withdrawal ${ins.id} cancelled ${slice.id}, and a cancelled slice stays cancelled; re-cut the slice to keep its work`);
		}
		return [`withdrawal ${ins.id} voided for every decision reader`];
	}
	if (slice.state !== "open" && slice.state !== "paused") {
		undone.push(`${q.id} cannot be re-asked: ${slice.id} is ${slice.state}`);
		return [`${ins.kind} ${ins.id} voided for every decision reader`];
	}
	const asked = ledger.raiseQuestion({ by: q.created_by, workloadId: wl, sliceId: slice.id, body: q.body, options: JSON.parse(q.options) as string[] });
	return [`${ins.kind} ${ins.id} to ${q.id} voided; re-asked as ${asked} on ${slice.id}, as ${q.created_by} asked it`];
}

/** The reversal's writes after Jo's instruction `inId`; returns the receipt. */
function reverse(ledger: Ledger, hit: RecordedHit, on: string, inId: string): string {
	const wl = hit.workloadId;
	const ins = ledger.instructions(wl, { withReversed: true }).find((i) => i.id === hit.rowId) ?? null;
	const entryId = ledger.recordEntry({ by: SURFACE_BY, workloadId: on, kind: "assumption", body: forgeryReversedBody(hit.rowId, inId) });
	const parts = [`reversed ${hit.rowId} on ${wl} as not yours (instruction ${inId}, forgery-reversed ${entryId})`];
	const undone: string[] = [];
	if (on !== wl) {
		parts.push(`${wl} is closed: the reversal is recorded on ${STANDING_WORKLOAD_ID} and nothing in the ledger is undone; boarding stays refused`);
		undone.push(`the close of ${wl}`);
	} else if (ins !== null) {
		parts.push(...reverseInstruction(ledger, wl, ins, undone));
	} else {
		const e = ledger.entry(hit.rowId);
		const prefix = e ? /^([a-z-]+):/.exec(e.body.trim())?.[1] : undefined;
		parts.push(`${prefix ? `${prefix}: ` : ""}entry ${hit.rowId} voided for every control reader${prefix === "repo" ? " and the decision log's repo read" : ""}`);
	}
	for (const c of consequences(ledger, hit)) {
		undone.push(c.startsWith("launched ") ? `${c}: that lane's commits, pushes and spend stay` : `${c}: its merge stays`);
	}
	const left = on === wl ? unansweredHits(ledger, wl) : [];
	const hold = left.length > 0 ? `; ${wl} stays held: ${left.length} flagged ${left.length === 1 ? "row" : "rows"} unanswered (${left.map((h) => h.rowId).join(", ")})` : "";
	return `${parts.join("; ")}${undone.length > 0 ? `; cannot be undone: ${undone.join("; ")}` : ""}${hold}`;
}
