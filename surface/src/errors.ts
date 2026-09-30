// The five things that surface unsolicited (SPEC-2.0.md § B3), the four-hour hold (§ A3) and the
// scheduled rows M11 lists under *needs you*, computed from ledger state. Pure: reads only; the
// writers are named per line, and the delivery that carries a line to a running surface once until
// its state changes is surface/src/delivery.ts.
//
// Sources, one per line:
// 1. reserved action waiting: a `reserved-request` entry (P-11 row 6 writes it; an unbound session's
//    lands on the standing workload) with no later `instruction` on its workload whose body is
//    exactly `approve <id>` / `deny <id>` — Jo's word at the surface (surface-input.ts). A
//    clarification that merely mentions the id is not a decision (Codex S1).
// 2. held past § A3: the oldest `held` message per open workload that is addressed to a lane (a
//    message to the orchestrator is consumed by the surface at read, so it is never "held with no
//    live lane"), older than HOLD_HOURS; or an open workload — sliced or not (§ A3: "the workload
//    itself open with no lane and no activity"; the standing workload excepted) — with no holder and
//    no activity for HOLD_HOURS, compared unrounded (Codex S2).
// 3. a slice that failed its runtime artifact twice: ARTIFACT_FAILURES_SURFACED `artifact-failed:`
//    messages on one slice since its last `artifact-passed:` (surface/src/signals.ts; writers: the
//    lane's artifact observer in surface/extensions/lane.ts and P-11 row 8 for a refused push).
// 4. a lane died: a `lane-died:` message still `held` (not yet surfaced once), or a lapsed lease no
//    such row records yet (the surface records it before rendering).
// 5. a lane waiting on a human: every open `question`, with its options; and every unresolved
//    `prompt-wait:` (a leaked blocking prompt, § B3 item 5 first trigger).
// Due: an open workload whose brief starts `due:<date> ` with date <= now by instant (Codex S4).
import type { InFlightWorkload, Ledger } from "../../ledger/src/index";
import { artifactFailures, laneDeaths, openPromptWaits, unrecordedLapse } from "./signals";
import { ARTIFACT_FAILURES_SURFACED, DUE_PREFIX, HOLD_HOURS, ORCHESTRATOR_RECIPIENT, STANDING_WORKLOAD_ID } from "./types";

export type ErrorKind = "reserved" | "held" | "artifact" | "lane-died" | "question" | "due";

export interface ErrorLine {
	kind: ErrorKind;
	workloadId: string;
	/** The row the line is about: entry id, message id, slice id, workload id, question id. */
	rowId: string;
	line: string;
	/** For a question: the options Jo answers with one word. */
	options?: string[];
	/**
	 * What makes this line's state: it is delivered again only when this changes (the artifact
	 * count, the prompt wait's id). Ages and clocks are not state.
	 */
	state?: string;
	/** Held orchestrator-bound messages behind the line; a delivery consumes them (P-7c). */
	messageIds?: string[];
}

export interface ErrorOptions {
	now?: string;
	holdHours?: number;
}

const short = (s: string, n = 90): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Hours between two ISO timestamps, unrounded. */
export function hoursElapsed(from: string, to: string): number {
	return (Date.parse(to) - Date.parse(from)) / 3_600_000;
}

/** Hours between two ISO timestamps, one decimal, for display only. */
export function hoursBetween(from: string, to: string): number {
	return Math.round(hoursElapsed(from, to) * 10) / 10;
}

/** Parse `due:<date> <text>`; null when the brief is not a scheduled row. */
export function parseDue(brief: string): { due: string; text: string } | null {
	if (!brief.startsWith(DUE_PREFIX)) return null;
	const rest = brief.slice(DUE_PREFIX.length);
	const m = /^(\S+)\s+(.+)$/s.exec(rest);
	if (!m || Number.isNaN(Date.parse(m[1]!))) return null;
	return { due: m[1]!, text: m[2]!.trim() };
}

/** `approve <id>` / `deny <id>`, the whole instruction; null for anything else (a clarification mentioning the id decides nothing). */
export function reservedDecision(body: string): { verdict: "approve" | "deny"; entryId: string } | null {
	const m = /^\s*(approve|deny)\s+(\S+)\s*$/i.exec(body);
	return m ? { verdict: m[1]!.toLowerCase() as "approve" | "deny", entryId: m[2]! } : null;
}

/** The reserved-request entries on a workload that no later instruction has decided. */
export function waitingReserved(ledger: Ledger, workloadId: string): { id: string; body: string; created_at: string }[] {
	const requests = ledger.entries(workloadId, "reserved-request");
	if (requests.length === 0) return [];
	const decisions: { entryId: string; at: string }[] = [];
	for (const i of ledger.instructions(workloadId)) {
		const d = i.kind === "instruction" ? reservedDecision(i.body) : null;
		if (d) decisions.push({ entryId: d.entryId, at: i.created_at });
	}
	return requests.filter((r) => !decisions.some((d) => d.entryId === r.id && d.at >= r.created_at));
}

/** Every line owed right now, in § B3 order (1–5), then the due rows. */
export function errorLines(ledger: Ledger, inFlight: InFlightWorkload[] = ledger.inFlight(), opts: ErrorOptions = {}): ErrorLine[] {
	const now = opts.now ?? ledger.now();
	const holdHours = opts.holdHours ?? HOLD_HOURS;
	const reserved: ErrorLine[] = [];
	const held: ErrorLine[] = [];
	const artifact: ErrorLine[] = [];
	const died: ErrorLine[] = [];
	const questions: ErrorLine[] = [];
	const due: ErrorLine[] = [];
	for (const { workload, slices, openQuestions, pendingMessages } of inFlight) {
		const wl = workload.id;
		const label = wl === STANDING_WORKLOAD_ID ? "orchestrator" : wl;
		const scheduled = parseDue(workload.brief);
		for (const r of waitingReserved(ledger, wl)) {
			reserved.push({ kind: "reserved", workloadId: wl, rowId: r.id, line: `reserved action waiting on you (${label}): ${short(r.body)} — \`approve ${r.id}\` or \`deny ${r.id}\`` });
		}
		const oldest = pendingMessages.find((m) => m.state === "held" && m.recipient !== ORCHESTRATOR_RECIPIENT);
		if (oldest && hoursElapsed(oldest.created_at, now) >= holdHours) {
			held.push({ kind: "held", workloadId: wl, rowId: oldest.id, line: `held ${hoursBetween(oldest.created_at, now)}h on ${label}: message ${oldest.id} (${oldest.sender} → ${oldest.recipient}) has had no live lane since ${oldest.created_at}` });
		} else if (wl !== STANDING_WORKLOAD_ID && !scheduled && !workload.holder && hoursElapsed(workload.last_activity_at, now) >= holdHours) {
			// Fable F2d: an open workload with no slices yet and no lane is held too. The standing workload and a
			// scheduled row (M11 `due:` brief) are not a lane's work: neither ever has a lane, both are excluded.
			held.push({ kind: "held", workloadId: wl, rowId: wl, line: `held ${hoursBetween(workload.last_activity_at, now)}h on ${label}: ${workload.open_slices} open slice(s), no lane, no activity since ${workload.last_activity_at}` });
		}
		for (const [sliceId, { n, heldIds }] of artifactFailures(ledger, wl)) {
			if (n < ARTIFACT_FAILURES_SURFACED) continue;
			const slice = slices.find((s) => s.id === sliceId) ?? ledger.slice(sliceId);
			if (!slice || slice.state === "done" || slice.state === "cancelled") continue;
			artifact.push({ kind: "artifact", workloadId: wl, rowId: sliceId, state: String(n), messageIds: heldIds, line: `slice ${sliceId} (${label}) failed its runtime artifact ${n} times: ${short(slice.task, 70)}` });
		}
		for (const d of laneDeaths(ledger, wl)) {
			if (d.state !== "held") continue;
			died.push({ kind: "lane-died", workloadId: wl, rowId: d.id, messageIds: [d.id], line: `lane ${d.holder} on ${label} died: ${d.body.slice(d.body.indexOf(":", 11) + 1).trim()}, ${workload.open_slices} open slice(s)${workload.holder && workload.holder !== d.holder ? `; ${workload.holder} holds it now` : ""}` });
		}
		if (unrecordedLapse(ledger, workload, now)) {
			died.push({ kind: "lane-died", workloadId: wl, rowId: wl, state: `${workload.holder}@${workload.holder_lease_until}`, line: `lane ${workload.holder} on ${label} died: lease lapsed ${workload.holder_lease_until}, ${workload.open_slices} open slice(s)` });
		}
		for (const q of openQuestions) {
			questions.push({ kind: "question", workloadId: wl, rowId: q.id, options: q.options, line: `lane on ${label} is waiting on you (${q.id}, slice ${q.slice_id}): ${short(q.body, 120)} — answer with one word: ${q.options.join(" / ")} (or \`withdraw\`)` });
		}
		for (const w of openPromptWaits(ledger, wl)) {
			questions.push({ kind: "question", workloadId: wl, rowId: w.id, messageIds: [w.id], line: `lane ${w.lane} on ${label} is blocked on a human prompt it should never open (${w.toolName}, tool call ${w.toolCallId}, since ${w.created_at}): ${short(w.reason, 100)} — answer it in that session or end the session` });
		}
		if (scheduled && Date.parse(scheduled.due) <= Date.parse(now)) {
			due.push({ kind: "due", workloadId: wl, rowId: wl, line: `scheduled and past due (${scheduled.due}): ${short(scheduled.text, 120)} — close ${wl} with a receipt when done` });
		}
	}
	return [...reserved, ...held, ...artifact, ...died, ...questions, ...due];
}
