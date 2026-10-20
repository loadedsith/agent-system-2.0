// The forgery hold (PLAN wl-mvfxw3c4zqfzls D3, D4): where the pure check (surface/src/forgery.ts `checkForgery`) runs
// against the ledger, where its hits are recorded, and what a recorded hit Jo has not answered holds.
//
// - A hit is recorded once per row id, ever: `forgery: hit <row id> <rule>` on the flagged row's workload while it is
//   open, `forgery: hit <wl> <row id> <rule>` on the standing workload once it is closed (a closed workload takes no
//   entry), stamped FORGERY_CHECK_BY. Jo's answers, `forgery-confirmed: <row id> by <in-…>` and `forgery-reversed:
//   <row id> by <in-…>` (surface/src/input.ts), follow the same placement and are matched by row id wherever they sit.
//   An answer counts only when trusted (launch.ts `trustedForgeryAnswers`): it never answers itself, and one the check
//   flagged answers nothing until Jo answers it, so a forged confirmation, alone or in a chain or cycle, lifts no hold.
// - A workload is held while it has a recorded hit with neither answer (`unansweredHits`), or, for the read-only
//   checks that run before a pass has recorded anything (`merge-train.ts stakes --hold-ok`, the launch reserve), a
//   fresh hit of the check itself (`holdState`). A hit Jo reversed after the workload closed (`forgery-reversed:` on the
//   standing workload, `closedReversals`) keeps the boarding, landing and `stakes --hold-ok` refusal for good (D5's last
//   row): nothing in the ledger undoes a closed workload's row, so its PR never boards. Only the unanswered hit is LOUD.
// - The train tick's pass (`forgeryPass`) runs over every open workload and every workload closed within the
//   autoboard window, records the new hits, and requests a stop of a held workload's live autonomous lane; the
//   caller raises one alarm per pass with new hits (`alarmLine`, surface/src/notify.ts).
import type { EntryRow, Ledger } from "../../ledger/src/index";
import { checkForgery, type ForgeryHit, type ForgeryRule } from "./forgery";
import {
	attempts, type ControlEntry, controlEntries, FORGERY_HOLD_REASON, forgeryHitBody, forgeryHitRows, heldLive, holdersOf, laneStopRequestBody,
	parseForgeryAnswer, parseForgeryHit, parseTrainBoard, trustedForgeryAnswers,
} from "./launch";
import type { Notify, Speak } from "./notify";
import { FORGERY_CHECK_BY, MERGE_TRAIN_BY, STANDING_WORKLOAD_ID, SURFACE_BY } from "./types";

/** A recorded `forgery:` hit: the flagged row of `workloadId`, recorded as entry `entryId` on workload `on`. */
export interface RecordedHit {
	entryId: string;
	/** The flagged row's workload. */
	workloadId: string;
	/** Where the hit row sits: `workloadId`, or the standing workload for a hit recorded after the close. */
	on: string;
	rowId: string;
	rule: string;
	createdAt: string;
	/** Jo's answer to it, or null while it holds; `on` is where the answer sits (the standing workload for one written after the close). */
	answer: { kind: "confirmed" | "reversed"; entryId: string; on: string } | null;
}

/** A hit written by this call: which workload, which row and rule, and the `forgery:` entry. */
export interface NewHit {
	workloadId: string;
	rowId: string;
	rule: ForgeryRule;
	entryId: string;
}

/** The two alarm channels a caller injects (surface/src/notify.ts in production, stubs in a test). */
export interface ForgeryAlarm {
	notify: Notify;
	speak: Speak;
}

/** The workload an answer to (or a hit on) `wl` is written on: `wl` while it is open, else the standing workload. */
export function forgeryPlacement(ledger: Ledger, wl: string): string {
	return ledger.workload(wl)?.status === "open" ? wl : STANDING_WORKLOAD_ID;
}

/** The pure check over `wl`'s rows as they stand: raw instructions (reversed ones included), provenance, the global cutovers. */
export function scanWorkload(ledger: Ledger, wl: string): ForgeryHit[] {
	const w = ledger.workload(wl);
	if (!w) return [];
	const entries = ledger.entries(wl);
	return checkForgery({
		workloadId: wl,
		instructions: ledger.instructions(wl, { withReversed: true }),
		questions: ledger.questions(wl),
		entries,
		provenance: ledger.provenance(wl),
		cutovers: ledger.joChannelCutovers(),
		holders: holdersOf(entries, w.holder, ledger.holders(wl)),
	});
}

/** A workload's valid control entries, every holder counted. */
function controlOf(ledger: Ledger, wl: string, entries: readonly EntryRow[] = ledger.entries(wl)): ControlEntry[] {
	const w = ledger.workload(wl);
	return controlEntries(entries, holdersOf(entries, w?.holder ?? null, ledger.holders(wl)));
}

/** A hit's answer: which word, its entry, and the workload the entry sits on. */
type Answer = NonNullable<RecordedHit["answer"]>;

/**
 * Jo's answers to hits on `wl`'s rows, by row id: the first trusted `forgery-confirmed:` or `forgery-reversed:` naming it among
 * `own` (on `wl`), then `standing` (on the standing workload). Trust is `trustedForgeryAnswers` over both lists, every row a
 * recorded hit among them or `fresh` names flagged: an answer the check flagged answers nothing until Jo answers it.
 */
function answersOf(own: readonly ControlEntry[], wl: string, standing: readonly ControlEntry[], fresh: readonly string[]): Map<string, Answer> {
	const both = [...own, ...standing];
	const flagged = forgeryHitRows(both);
	for (const id of fresh) flagged.add(id);
	const ownIds = new Set(own.map((c) => c.id));
	const out = new Map<string, Answer>();
	for (const { entry, rowId } of trustedForgeryAnswers(both, flagged)) {
		if (!out.has(rowId)) out.set(rowId, { kind: entry.prefix === "forgery-confirmed" ? "confirmed" : "reversed", entryId: entry.id, on: ownIds.has(entry.id) ? wl : STANDING_WORKLOAD_ID });
	}
	return out;
}

/** `recordedHits`, with the check's fresh hits (`fresh`, row ids) flagged too when trusting answers. */
function recordedWith(ledger: Ledger, wl: string, fresh: readonly string[]): { hits: RecordedHit[]; answers: Map<string, Answer> } {
	const own = wl === STANDING_WORKLOAD_ID ? [] : controlOf(ledger, wl);
	const standing = controlOf(ledger, STANDING_WORKLOAD_ID);
	const answers = answersOf(own, wl, standing, fresh);
	const out: RecordedHit[] = [];
	const add = (c: ControlEntry, on: string, form: "own" | "closed") => {
		if (c.prefix !== "forgery" || c.createdBy !== FORGERY_CHECK_BY) return;
		const h = parseForgeryHit(c.rest);
		if (h === null || (form === "own" ? h.workloadId !== null : h.workloadId !== wl)) return;
		if (out.some((x) => x.rowId === h.rowId)) return;
		out.push({ entryId: c.id, workloadId: wl, on, rowId: h.rowId, rule: h.rule, createdAt: c.createdAt, answer: answers.get(h.rowId) ?? null });
	};
	for (const c of own) add(c, wl, "own");
	for (const c of standing) add(c, STANDING_WORKLOAD_ID, wl === STANDING_WORKLOAD_ID ? "own" : "closed");
	return { hits: out.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0)), answers };
}

/**
 * Every recorded hit on `wl`'s rows, one per row id, oldest first: the own-workload form on `wl`, the closed form naming `wl`
 * on the standing workload, each with Jo's trusted answer from either place (`answersOf`).
 */
export function recordedHits(ledger: Ledger, wl: string): RecordedHit[] {
	return recordedWith(ledger, wl, []).hits;
}

/** The recorded hits on `wl` Jo has answered neither way: what holds it. */
export function unansweredHits(ledger: Ledger, wl: string): RecordedHit[] {
	return recordedHits(ledger, wl).filter((h) => h.answer === null);
}

/**
 * The recorded hits on `wl` Jo reversed after its close (the `forgery-reversed:` on the standing workload, D5's last row): no longer
 * unanswered, so no LOUD line, but the merge train's refusal stays (`landingReady`, `boardLanding`, `stakes --hold-ok`).
 */
export function closedReversals(ledger: Ledger, wl: string): RecordedHit[] {
	return recordedHits(ledger, wl).filter((h) => h.answer?.kind === "reversed" && h.answer.on !== wl);
}

/**
 * The hold as the read-only checks see it: the recorded hits Jo has not answered, and the check's own hits no pass has
 * recorded yet and Jo has not answered (one per row id, its first rule). Every row the check flags now is flagged when
 * trusting answers, so a confirmation no pass has recorded a hit on yet answers nothing either.
 */
export function holdState(ledger: Ledger, wl: string): { unanswered: RecordedHit[]; fresh: ForgeryHit[] } {
	const scan = scanWorkload(ledger, wl);
	const { hits: recorded, answers } = recordedWith(ledger, wl, scan.map((h) => h.rowId));
	const known = new Set(recorded.map((h) => h.rowId));
	const fresh: ForgeryHit[] = [];
	for (const h of scan) {
		if (known.has(h.rowId) || answers.has(h.rowId) || fresh.some((x) => x.rowId === h.rowId)) continue;
		fresh.push(h);
	}
	return { unanswered: recorded.filter((h) => h.answer === null), fresh };
}

/** Write a `forgery:` hit row for each of `hits` no hit row names yet, on the flagged workload while open, else on the standing one. */
export function recordHits(ledger: Ledger, wl: string, hits: readonly ForgeryHit[]): NewHit[] {
	return ledger.write(() => {
		const known = new Set(recordedHits(ledger, wl).map((h) => h.rowId));
		const on = forgeryPlacement(ledger, wl);
		const out: NewHit[] = [];
		for (const h of hits) {
			if (known.has(h.rowId)) continue;
			known.add(h.rowId);
			const body = forgeryHitBody(h.rowId, h.rule, on === wl ? null : wl);
			out.push({ workloadId: wl, rowId: h.rowId, rule: h.rule, entryId: ledger.recordEntry({ by: FORGERY_CHECK_BY, workloadId: on, kind: "assumption", body }) });
		}
		return out;
	});
}

/** Every open workload and every workload closed within `windowMs`, oldest first. */
function passWorkloads(ledger: Ledger, windowMs: number): string[] {
	const since = new Date(Date.parse(ledger.now()) - windowMs).toISOString();
	return ledger.db.query<{ id: string }, [string]>(
		"SELECT id FROM workloads WHERE status = 'open' OR (status = 'closed' AND closed_at >= ?1) ORDER BY created_at, id",
	).all(since).map((r) => r.id);
}

/**
 * Request a stop of `wl`'s live autonomous lane while it is held: `lane-stop: <lane> requested forgery-hold by forgery-check`,
 * once per lane. A by-hand lane (on a user-driven workload) gets none. Returns the entry written, or null.
 */
export function requestHoldStop(ledger: Ledger, wl: string): { laneId: string; entryId: string } | null {
	const w = ledger.workload(wl);
	if (!w || w.status !== "open" || w.mode !== "autonomous" || !w.holder?.startsWith("lane-") || !heldLive(w, ledger.now())) return null;
	if (unansweredHits(ledger, wl).length === 0) return null;
	const laneId = w.holder;
	const asked = controlOf(ledger, wl).some((c) => c.prefix === "lane-stop" && c.laneId === laneId && c.createdBy === FORGERY_CHECK_BY && c.rest.startsWith(`requested ${FORGERY_HOLD_REASON} `));
	if (asked) return null;
	const entryId = ledger.recordEntry({ by: FORGERY_CHECK_BY, workloadId: wl, kind: "assumption", body: laneStopRequestBody(laneId, FORGERY_HOLD_REASON, FORGERY_CHECK_BY) });
	return { laneId, entryId };
}

/** The forgery hold's stop requests on `wl` (valid, the check's), oldest first. */
export function holdStops(control: readonly ControlEntry[]): ControlEntry[] {
	return control.filter((c) => c.prefix === "lane-stop" && c.createdBy === FORGERY_CHECK_BY && c.rest.startsWith(`requested ${FORGERY_HOLD_REASON} `));
}

/**
 * The tick's pass (D3): the check over every open workload and every workload closed within `windowMs`, the new hits
 * recorded, then a stop request for each held workload's live autonomous lane. Returns what it wrote.
 */
export function forgeryPass(ledger: Ledger, windowMs: number): { hits: NewHit[]; stops: { workloadId: string; laneId: string; entryId: string }[] } {
	const hits: NewHit[] = [];
	const stops: { workloadId: string; laneId: string; entryId: string }[] = [];
	for (const wl of passWorkloads(ledger, windowMs)) {
		hits.push(...recordHits(ledger, wl, scanWorkload(ledger, wl)));
		const stop = requestHoldStop(ledger, wl);
		if (stop) stops.push({ workloadId: wl, ...stop });
	}
	return { hits, stops };
}

/** The alarm's one line for a pass with new hits: `as2 forgery alert. <n> rows on <wl>, <wl>`. */
export function alarmLine(hits: readonly Pick<NewHit, "workloadId">[]): string {
	const workloads = [...new Set(hits.map((h) => h.workloadId))];
	return `as2 forgery alert. ${hits.length} ${hits.length === 1 ? "row" : "rows"} on ${workloads.join(", ")}`;
}

/** One notification and one spoken line for a batch of new hits; nothing for none. Returns what could not be raised. */
export function raiseAlarm(alarm: ForgeryAlarm, hits: readonly Pick<NewHit, "workloadId">[]): string[] {
	if (hits.length === 0) return [];
	const line = alarmLine(hits);
	const failed: string[] = [];
	if (!alarm.notify("as2 forgery alert", `${line}: answer at the surface (confirm or reverse)`)) failed.push("the notification could not be shown");
	if (!alarm.speak(line)) failed.push("the spoken line could not be said");
	return failed;
}

/** The workloads any `forgery:` hit row names (own form: its workload; closed form: the workload in the body), oldest first. */
export function hitWorkloads(ledger: Ledger): string[] {
	const rows = ledger.db.query<{ workload_id: string; body: string }, [string]>(
		"SELECT workload_id, body FROM entries WHERE kind = 'assumption' AND created_by = ?1 AND substr(body, 1, 13) = 'forgery: hit ' ORDER BY created_at, rowid",
	).all(FORGERY_CHECK_BY);
	const out: string[] = [];
	for (const r of rows) {
		const h = parseForgeryHit(r.body.slice("forgery: ".length).trim());
		const wl = h?.workloadId ?? r.workload_id;
		if (h && !out.includes(wl)) out.push(wl);
	}
	return out;
}

/** Every unanswered recorded hit in the ledger, by workload then age. */
export function allUnansweredHits(ledger: Ledger): RecordedHit[] {
	return hitWorkloads(ledger).flatMap((wl) => unansweredHits(ledger, wl));
}

/**
 * What a flagged row led to, from the rows that cite its id: each `launch:` attempt whose cause names it, and each
 * `train-board:` whose review names it or that boarded the flagged workload after the row.
 */
export function consequences(ledger: Ledger, hit: Pick<RecordedHit, "workloadId" | "rowId">): string[] {
	const out: string[] = [];
	for (const a of attempts(controlOf(ledger, hit.workloadId))) {
		const ids = a.cause?.kind === "request" ? [a.cause.id] : a.cause?.kind === "resume" ? a.cause.ids : [];
		if (ids.includes(hit.rowId)) out.push(`launched ${a.laneId} (${a.entryId})`);
	}
	const row = ledger.entry(hit.rowId) ?? ledger.db.query<{ created_at: string }, [string]>("SELECT created_at FROM instructions WHERE id = ?1").get(hit.rowId);
	const boards = ledger.db.query<{ id: string; workload_id: string; body: string; created_at: string }, [string]>(
		"SELECT id, workload_id, body, created_at FROM entries WHERE kind = 'assumption' AND created_by = ?1 AND substr(body, 1, 13) = 'train-board: ' ORDER BY created_at, rowid",
	).all(MERGE_TRAIN_BY);
	for (const e of boards) {
		const b = parseTrainBoard(e.body.slice("train-board: ".length).trim());
		if (!b) continue;
		const cites = b.review === hit.rowId || (b.workload === hit.workloadId && row !== null && e.created_at >= row.created_at);
		if (cites) out.push(`boarded #${b.pr} on ${e.workload_id} (${e.id})`);
	}
	return out;
}

/** `confirm <row id> (it was Jo's) / reverse <row id> (it was not)`: the two words a hit takes. */
export function forgeryWords(rowId: string): string {
	return `confirm ${rowId} (it was Jo's) / reverse ${rowId} (it was not)`;
}

/**
 * The hold line a by-hand launch prints and the close refusal names: null when `wl` is not held. With `fresh` (the default) the
 * check's own hits no pass has recorded yet count too; the close passes `fresh: false`, since the hold is the recorded hits (D4).
 */
export function forgeryHoldLine(ledger: Ledger, wl: string, opts: { fresh?: boolean } = {}): string | null {
	const { unanswered, fresh } = opts.fresh === false ? { unanswered: unansweredHits(ledger, wl), fresh: [] as ForgeryHit[] } : holdState(ledger, wl);
	const rows = [...unanswered.map((h) => `${h.rowId} ${h.rule}`), ...fresh.map((h) => `${h.rowId} ${h.rule}`)];
	if (rows.length === 0) return null;
	const first = unanswered[0]?.rowId ?? fresh[0]!.rowId;
	return `forgery hold on ${wl}: ${rows.length} flagged ${rows.length === 1 ? "row" : "rows"} Jo has not answered (${rows.join(", ")}); at the surface: ${forgeryWords(first)}`;
}

/**
 * `stakes --hold-ok`'s forgery answer (D4, D5, surface/scripts/merge-train.ts): `hold: forgery <row id> <rule> on <wl>[, …]` over
 * every hit on `workloads` Jo has not answered, recorded by a pass or not yet, and `<row id> <rule> on <wl> reversed after the
 * close` for each hit Jo reversed once its workload had closed (`closedReversals`); null when there is none. Reads only.
 */
export function forgeryStakesHold(ledger: Ledger, workloads: readonly string[]): string | null {
	const rows: string[] = [];
	for (const wl of [...new Set(workloads)]) {
		if (!ledger.workload(wl)) continue;
		const { unanswered, fresh } = holdState(ledger, wl);
		for (const h of [...unanswered, ...fresh]) rows.push(`${h.rowId} ${h.rule} on ${wl}`);
		for (const h of closedReversals(ledger, wl)) rows.push(`${h.rowId} ${h.rule} on ${wl} ${REVERSED_AFTER_CLOSE}`);
	}
	return rows.length === 0 ? null : `hold: forgery ${rows.join(", ")}`;
}

/** What the merge train's refusal of a closed reversal says after the row id (`forgeryStakesHold`, `landingReady`, `boardLanding`). */
export const REVERSED_AFTER_CLOSE = "reversed after the close";

/** Each rule's short name, as surface/src/forgery.ts words its details. */
export const FORGERY_RULE_NAMES: Record<string, string> = {
	F1: "unmarked: a Jo-authority row with no Jo-channel mark",
	F2: "wrong channel: a Jo row no Jo channel writes",
	F3: "lane resolves its own question",
	F4: "machinery resolves a question",
	F5: "a Jo-only prefix from a writer that may not write it",
};

/**
 * The reversed cancel withdrawals the schema will still apply (D5, Q2): a `withdrawal` with disposition `cancel` that an effective
 * surface `forgery-reversed:` on its open workload names (it is out of `Ledger.instructions`: a reversed reversal restores it), whose
 * slice is still paused with another question open. Resolving the last of those questions fires `questions_resolution_settles_slice`
 * (ledger/schema.sql), which reads raw instructions and cancels the slice.
 */
export function deferredCancels(ledger: Ledger, wl?: string): { workloadId: string; rowId: string; sliceId: string; questionIds: string[] }[] {
	const rows = ledger.db.query<{ workload_id: string; body: string }, [string]>(
		`SELECT e.workload_id AS workload_id, e.body AS body FROM entries e JOIN workloads w ON w.id = e.workload_id
		 WHERE w.status = 'open' AND e.kind = 'assumption' AND e.created_by = ?1 AND substr(e.body, 1, 18) = 'forgery-reversed: ' ORDER BY e.created_at, e.rowid`,
	).all(SURFACE_BY);
	const out: { workloadId: string; rowId: string; sliceId: string; questionIds: string[] }[] = [];
	for (const r of rows) {
		if (wl !== undefined && r.workload_id !== wl) continue;
		const a = parseForgeryAnswer(r.body.slice("forgery-reversed: ".length).trim());
		if (!a) continue;
		if (ledger.instructions(r.workload_id).some((i) => i.id === a.rowId)) continue;
		const ins = ledger.instructions(r.workload_id, { withReversed: true }).find((i) => i.id === a.rowId);
		if (!ins || ins.kind !== "withdrawal" || ins.disposition !== "cancel" || ins.question_id === null) continue;
		const q = ledger.question(ins.question_id);
		const slice = q ? ledger.slice(q.slice_id) : null;
		if (!slice || slice.state !== "paused") continue;
		const open = ledger.questions(r.workload_id).filter((x) => x.slice_id === slice.id && x.state === "open").map((x) => x.id);
		if (open.length > 0 && !out.some((x) => x.rowId === a.rowId)) out.push({ workloadId: r.workload_id, rowId: a.rowId, sliceId: slice.id, questionIds: open });
	}
	return out;
}
