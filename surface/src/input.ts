// Jo's short inputs at the surface (SPEC-2.0.md § A1.2, § B3 item 5, § B5, § B13.1): a stakes
// word or a mode word flips the workload in view; an option name answers the open question that
// offers it; `withdraw` withdraws it (then replan; then cancel on the runner's ceiling question, whose
// default is the stop); `approve` / `deny` answers a reserved request.
// A bare answer word with more than one possible target is refused as ambiguous ("which one?");
// `approve <id>`, `<option> <q-id>`, `withdraw <q-id>` name the target. A numbered batch
// ("1 approve, 2 deny", or one per line) answers needs-you lines by their session number
// (surface/src/numbering.ts): validated whole, applied all-or-nothing (MIGRATION.md § M7 follow-ups
// item 1). Every applied word is a ledger row (§ B5: the flip is a ledgered instruction), author
// "jo", channel "surface". Anything else is ordinary conversation for the orchestrator model.
//
// The workload ceiling (DESIGN-workload-ceiling.md § 1 B and D, § 2 items 2 and 5): the stakes word
// re-sizes the ceiling, `ceiling <usd> [<hours>] [wl-…]` sets Jo's exact figure, and an answer to the
// runner's ceiling question settles it (*extend* raises by one block and requests the relaunch). Each
// raise names the Jo instruction written first, which is what `effectiveCeiling` checks. The
// `ceiling` word is never a numbered batch.
import { LOW_CONFIDENCE_THRESHOLD } from "../../classifier/src/route";
import { LANE_RUNNER_BY, type Ledger, type Mode, type QuestionRow, type RoutingKind, type SliceRow, type Stakes } from "../../ledger/src/index";
import { type Ceiling, CEILING_OPTIONS, ceilingBody, effectiveCeiling, sizeFor } from "./ceiling";
import { waitingReserved } from "./errors";
import { controlEntries, heldLive, holdersOf, launchRequestedBody, planApprovedBody, planFirst, planSlice } from "./launch";
import type { Numbering, Target } from "./numbering";
import { MODE_WORDS, STAKES_WORDS, STANDING_WORKLOAD_ID, SURFACE_BY } from "./types";

export type Command =
	| { kind: "stakes"; workloadId: string; stakes: Stakes }
	| { kind: "mode"; workloadId: string; mode: Mode }
	| { kind: "answer"; workloadId: string; questionId: string; answer: string }
	| { kind: "withdraw"; workloadId: string; questionId: string; then: "replan" | "cancel" }
	| { kind: "reserved"; workloadId: string; entryId: string; verdict: "approve" | "deny" }
	| { kind: "ceiling"; workloadId: string; usd: number; wallMin: number | null }
	/** A bare answer word that fits more than one row: refused, never applied. */
	| { kind: "ambiguous"; word: string; candidates: Target[] };

/** Workloads Jo's words apply to: the open workloads other than the standing one, oldest first. */
export function workloadsInView(ledger: Ledger): string[] {
	return ledger.inFlight().map((w) => w.workload.id).filter((id) => id !== STANDING_WORKLOAD_ID);
}

/**
 * Interpret `text`. A stakes/mode word alone targets the only workload in view (or the one given
 * as a second word: `production wl-…`). An answer word (`approve`/`deny`, `withdraw`, an option)
 * alone applies only when it fits exactly one row; fitting several it is `ambiguous`, and the
 * second word (an entry or question id) picks the row.
 */
export function interpret(ledger: Ledger, text: string): Command | null {
	const words = text.trim().split(/\s+/);
	const word = words[0]!.toLowerCase();
	const view = workloadsInView(ledger);
	// The one command longer than two words; a `ceiling` that does not parse falls through, so an option named "ceiling" still answers.
	if (word === "ceiling") {
		const c = ceilingCommand(words.slice(1), view);
		if (c) return c;
	}
	if (words.length === 0 || words.length > 2) return null;
	const arg = words[1];
	const target = (): string | null => (arg && view.includes(arg) ? arg : view.length === 1 ? view[0]! : null);

	if ((STAKES_WORDS as readonly string[]).includes(word)) {
		const wl = target();
		return wl ? { kind: "stakes", workloadId: wl, stakes: word as Stakes } : null;
	}
	if ((MODE_WORDS as readonly string[]).includes(word) || word === "user driven") {
		const wl = target();
		return wl ? { kind: "mode", workloadId: wl, mode: (word === "user driven" ? "user-driven" : word) as Mode } : null;
	}
	if (!arg) {
		const candidates = bareTargets(ledger, view, word);
		if (candidates.length > 1) return { kind: "ambiguous", word, candidates };
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
		if (!q) return null;
		// The ceiling question has nothing to replan: withdrawing it cancels its slice, so the close is not blocked, and the lane stops at the ceiling (the default).
		const then = isCeilingQuestion(q, ledger.slice(q.slice_id)) ? "cancel" : "replan";
		return { kind: "withdraw", workloadId: q.workload_id, questionId: q.id, then };
	}
	const matches = questions.filter((q) => q.options.some((o) => o.toLowerCase() === word));
	const q = arg ? matches.find((x) => x.id === arg) : matches[0];
	if (!q) return null;
	const answer = q.options.find((o) => o.toLowerCase() === word)!;
	return { kind: "answer", workloadId: q.workload_id, questionId: q.id, answer };
}

/**
 * Every row a bare answer word could answer, reserved requests first (the needs-you order):
 * `approve` / `deny` fit every waiting reserved request (the standing workload's included) and every
 * open question offering the word; `withdraw` fits every open question; another word fits every
 * open question offering it.
 */
function bareTargets(ledger: Ledger, view: string[], word: string): Target[] {
	const out: Target[] = [];
	if (word === "approve" || word === "deny") {
		for (const wl of [...view, STANDING_WORKLOAD_ID]) {
			for (const r of waitingReserved(ledger, wl)) out.push({ kind: "reserved", workloadId: wl, rowId: r.id });
		}
	}
	for (const q of ledger.inFlight().flatMap((w) => w.openQuestions)) {
		if (word === "withdraw" || q.options.some((o) => o.toLowerCase() === word)) out.push({ kind: "question", workloadId: q.workload_id, rowId: q.id });
	}
	return out;
}

/** One piece of a numbered batch: `1 approve`, `#1 approve`, `1: approve`, `q1: approve`, `1) deny`. */
const BATCH_PIECE = /^(?:#|q)?(\d+)\s*[:.)]?\s+(\S+)$/i;

export interface BatchItem {
	n: number;
	cmd: Command;
}
export type BatchResult = { ok: true; items: BatchItem[] } | { ok: false; lines: string[] };

/** The pieces of a numbered batch (split on newlines and commas, trimmed, empties dropped), or null when any piece is not `<n> <word>`. */
export function parseBatch(text: string): { n: number; word: string }[] | null {
	const pieces = text.split(/[\n,]/).map((p) => p.trim()).filter((p) => p.length > 0);
	if (pieces.length === 0) return null;
	const parsed: { n: number; word: string }[] = [];
	for (const p of pieces) {
		const m = BATCH_PIECE.exec(p);
		if (!m) return null;
		parsed.push({ n: Number(m[1]), word: m[2]! });
	}
	return parsed;
}

/**
 * Interpret `text` as a numbered batch (`parseBatch`); null when it is not one, so prose passes
 * through. Each piece is checked against the session numbering: the number was given, its row
 * still waits, the word fits the row, the number appears once. All pass → the commands in order;
 * any fails → one line per piece, nothing to apply.
 */
export function interpretBatch(ledger: Ledger, numbering: Numbering, text: string): BatchResult | null {
	const parsed = parseBatch(text);
	if (!parsed) return null;
	const inFlight = ledger.inFlight();
	const open = new Set(inFlight.map((w) => w.workload.id));
	const questions = new Map(inFlight.flatMap((w) => w.openQuestions).map((q) => [q.id, q]));
	const checked = parsed.map(({ n, word }): BatchItem | string => {
		if (parsed.filter((x) => x.n === n).length > 1) return `#${n} appears more than once in this batch`;
		const t = numbering.target(n);
		if (!t) return `#${n} is not on the needs-you list`;
		const stale = `#${n} (${t.rowId}) is no longer waiting`;
		const w = word.toLowerCase();
		if (t.kind === "reserved") {
			if (!open.has(t.workloadId) || !waitingReserved(ledger, t.workloadId).some((r) => r.id === t.rowId)) return stale;
			if (w !== "approve" && w !== "deny") return `#${n} takes: approve / deny`;
			return { n, cmd: { kind: "reserved", workloadId: t.workloadId, entryId: t.rowId, verdict: w } };
		}
		const q = questions.get(t.rowId);
		if (!q) return stale;
		if (w === "withdraw") {
			// The same rule as a bare `withdraw`: the runner's ceiling question cancels, every other question replans.
			const then = isCeilingQuestion(q, ledger.slice(q.slice_id)) ? "cancel" : "replan";
			return { n, cmd: { kind: "withdraw", workloadId: q.workload_id, questionId: q.id, then } };
		}
		const answer = q.options.find((o) => o.toLowerCase() === w);
		if (answer === undefined) return `#${n} takes: ${[...q.options, "withdraw"].join(" / ")}`;
		return { n, cmd: { kind: "answer", workloadId: q.workload_id, questionId: q.id, answer } };
	});
	const items = checked.filter((c): c is BatchItem => typeof c !== "string");
	if (items.length === checked.length) return { ok: true, items };
	return { ok: false, lines: checked.map((c) => (typeof c === "string" ? c : `#${c.n} ok, not applied`)) };
}

/**
 * `ceiling <usd> [<hours>] [wl-…]` after the word: dollars (a leading `$` allowed), then hours (a
 * trailing `h` allowed) and the workload in either order; the workload defaults to the only one in view.
 */
function ceilingCommand(rest: readonly string[], view: readonly string[]): Command | null {
	if (rest.length < 1 || rest.length > 3) return null;
	const usd = /^\$?(\d+(?:\.\d+)?)$/.exec(rest[0]!);
	if (!usd || Number(usd[1]) <= 0) return null;
	let wallMin: number | null = null;
	let named: string | null = null;
	for (const w of rest.slice(1)) {
		const h = /^(\d+(?:\.\d+)?)h?$/i.exec(w);
		if (h && wallMin === null) wallMin = Math.round(Number(h[1]) * 60);
		else if (w.startsWith("wl-") && named === null) named = w;
		else return null;
	}
	if (wallMin === 0) return null;
	const wl = named !== null ? (view.includes(named) ? named : null) : view.length === 1 ? view[0]! : null;
	return wl ? { kind: "ceiling", workloadId: wl, usd: Number(usd[1]), wallMin } : null;
}

/**
 * Is `q` the runner's ceiling question (DESIGN-workload-ceiling.md § 2 item 4): raised by the lane
 * runner on a slice of its own, `sl-ceiling-<n>`. The runner (surface/scripts/lane.ts) uses the same test.
 */
export function isCeilingQuestion(q: Pick<QuestionRow, "slice_id" | "created_by">, slice: Pick<SliceRow, "id"> | null): boolean {
	return slice !== null && slice.id === q.slice_id && slice.id.startsWith("sl-ceiling-") && q.created_by === LANE_RUNNER_BY;
}

/**
 * The open-time classifier's verdict on the brief, read back from the `brief-judged:` entry the open
 * tool wrote, with the open tool's rule: change-large above the low-confidence threshold, else null.
 */
export function judgedKindOf(ledger: Ledger, workloadId: string): RoutingKind | null {
	const e = ledger.entries(workloadId, "assumption").find((x) => x.created_by === SURFACE_BY && x.body.startsWith("brief-judged: "));
	const m = e ? /^brief-judged: (\S+) confidence (\S+)/.exec(e.body) : null;
	return m && m[1] === "change-large" && Number(m[2]) > LOW_CONFIDENCE_THRESHOLD ? "change-large" : null;
}

/** The `source` of a stakes-sized `ceiling:` entry: `stakes <s>`, or `stakes <s> x3 change-large`. */
export function stakesSource(stakes: Stakes, judged: RoutingKind | null): string {
	return `stakes ${stakes}${judged === "change-large" ? " x3 change-large" : ""}`;
}

/** The workload's effective ceiling now (`effectiveCeiling` over its surface-written entries and its instructions). */
export function ceilingOf(ledger: Ledger, workloadId: string): Ceiling {
	const w = ledger.workload(workloadId);
	if (!w) throw new Error(`no workload ${workloadId}`);
	return effectiveCeiling(controlEntries(ledger.entries(workloadId, "assumption")), ledger.instructions(workloadId), w.stakes);
}

/** `$50 / 6h`: hours to two places at most. */
export function ceilingText(c: Ceiling): string {
	return `$${Number(c.usd.toFixed(2))} / ${Number((c.wallMin / 60).toFixed(2))}h`;
}

/**
 * Settle the ceiling question after Jo's answer `answerId` (§ 2 item 5), inside the answer's
 * transaction. *extend* writes the ceiling plus one block of the workload's own size, naming the
 * answer; every answer completes the ceiling slice; *extend* then writes Jo's `launch-requested:`
 * (the body the launch tool writes), so a lane the runner stopped at the ceiling relaunches: when no
 * lane holds the workload under a live lease, or when the holder's newest valid `lane-stop:` is
 * `accepted ceiling` (it is stopping at the ceiling and will not read the raise). A live holder that
 * is still running reads the raised ceiling at its next poll and goes on: a request written then would
 * outlive it and relaunch a finished workload. Returns the receipt tail, naming which case it was.
 */
function settleCeiling(ledger: Ledger, q: QuestionRow, word: string, answerId: string): string {
	const wl = q.workload_id;
	if (word !== "extend") {
		ledger.completeSlice(q.slice_id, { by: SURFACE_BY, artifact: `answered ${word} ${answerId}` });
		return "";
	}
	const w = ledger.workload(wl)!;
	const block = sizeFor(w.stakes, judgedKindOf(ledger, wl));
	const cur = ceilingOf(ledger, wl);
	const next = { usd: cur.usd + block.usd, wallMin: cur.wallMin + block.wallMin };
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: ceilingBody(next, "extend one block", answerId) });
	ledger.completeSlice(q.slice_id, { by: SURFACE_BY, artifact: `answered extend ${answerId}` });
	const raised = `; ceiling raised to ${ceilingText(next)}`;
	let why = "no lane holds it live";
	if (w.holder?.startsWith("lane-") && heldLive(w, ledger.now())) {
		const entries = ledger.entries(wl);
		const stops = controlEntries(entries, holdersOf(entries, w.holder)).filter((c) => c.prefix === "lane-stop" && c.laneId === w.holder);
		if (!/^accepted ceiling\b/.test(stops.at(-1)?.rest ?? "")) return `${raised}; ${w.holder} still holds it and goes on under it`;
		why = `${w.holder} is stopping at the ceiling`;
	}
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: launchRequestedBody("jo", ledger.now(), "ceiling extend") });
	return `${raised}; ${why}, so a relaunch is requested`;
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
			// The instruction goes first, so the re-sized `ceiling:` entry can name it when it raises (§ 2 item 2).
			return ledger.write(() => {
				const id = ledger.recordInstruction({ ...stamp, workloadId: cmd.workloadId, body: `stakes: ${cmd.stakes}` });
				ledger.setStakes(cmd.workloadId, { by: SURFACE_BY, stakes: cmd.stakes });
				const judged = judgedKindOf(ledger, cmd.workloadId);
				const size = sizeFor(cmd.stakes, judged);
				ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: ceilingBody(size, stakesSource(cmd.stakes, judged), id) });
				return `stakes on ${cmd.workloadId} → ${cmd.stakes} (instruction ${id}); ceiling ${ceilingText(size)}`;
			});
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
			const ceiling = isCeilingQuestion(q0, ledger.slice(q0.slice_id)) && (CEILING_OPTIONS as readonly string[]).includes(word);
			if (plan && word === "cancel") {
				const id = ledger.withdrawQuestion(cmd.questionId, { ...stamp, reason: "plan cancelled from the surface", then: "cancel" });
				return `cancelled the plan: withdrew ${cmd.questionId} (withdrawal ${id}); slice ${q0.slice_id} is ${ledger.slice(q0.slice_id)?.state ?? "unknown"}`;
			}
			let tail = "";
			const id = ledger.write(() => {
				const answerId = ledger.answerQuestion(cmd.questionId, { ...stamp, answer: cmd.answer });
				if (plan && word === "approve") ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: planApprovedBody(answerId) });
				if (ceiling) tail = settleCeiling(ledger, q0, word, answerId);
				return answerId;
			});
			const slice = ledger.slice(q0.slice_id);
			const approved = plan && word === "approve" ? "; plan approved: change slices may now be added" : "";
			return `answered ${cmd.questionId} with "${cmd.answer}" (answer ${id}); slice ${q0.slice_id} is ${slice?.state ?? "unknown"}${approved}${tail}`;
		}
		case "withdraw": {
			const id = ledger.withdrawQuestion(cmd.questionId, { ...stamp, reason: "withdrawn from the surface", then: cmd.then });
			const q = ledger.question(cmd.questionId)!;
			const slice = ledger.slice(q.slice_id);
			const what = cmd.then === "replan" ? "replanned, not executed"
				: isCeilingQuestion(q, slice) ? "cancelled; the lane stops at the ceiling as the default" : "cancelled";
			return `withdrew ${cmd.questionId} (withdrawal ${id}, then ${cmd.then}); slice ${q.slice_id} is ${slice?.state ?? "unknown"}: ${what}`;
		}
		case "reserved": {
			const id = ledger.recordInstruction({ ...stamp, workloadId: cmd.workloadId, body: `${cmd.verdict} ${cmd.entryId}` });
			return `${cmd.verdict === "approve" ? "approved" : "denied"} reserved request ${cmd.entryId} (instruction ${id})`;
		}
		case "ceiling": {
			// Jo's exact figure (§ 1 D): the instruction, then the entry naming it; omitted hours keep the wall in force.
			return ledger.write(() => {
				const next = { usd: cmd.usd, wallMin: cmd.wallMin ?? ceilingOf(ledger, cmd.workloadId).wallMin };
				const hours = Number((next.wallMin / 60).toFixed(2));
				const id = ledger.recordInstruction({ ...stamp, workloadId: cmd.workloadId, body: `ceiling: ${next.usd} ${hours}` });
				ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: ceilingBody(next, "your word", id) });
				return `ceiling on ${cmd.workloadId} → ${ceilingText(next)} (instruction ${id})`;
			});
		}
		case "ambiguous":
			throw new Error(`"${cmd.word}" fits ${cmd.candidates.length} rows; an ambiguous word is refused, never applied`);
	}
}
