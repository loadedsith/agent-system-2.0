// The five things that surface unsolicited (SPEC-2.0.md § B3), the four-hour hold (§ A3) and the
// scheduled rows M11 lists under *needs you*, computed from ledger state. Pure: reads only.
//
// Sources, one per line:
// 1. reserved action waiting: a `reserved-request` entry (P-11 row 6 writes it) with no later
//    `instruction` on its workload naming the entry id — Jo's `approve <id>` / `deny <id>` is that
//    instruction (surface-input.ts).
// 2. held past § A3: the oldest `held` message per open workload older than HOLD_HOURS, or an open
//    workload with no holder, open slices and no activity for HOLD_HOURS.
// 3. a slice that failed its runtime artifact twice: ARTIFACT_FAILURES_SURFACED lane→orchestrator
//    messages on one slice whose body starts `artifact-failed:` (§ B2: lane↔orchestrator talk is
//    ledger messages).
// 4. a lane died: an open workload whose holder lease has lapsed.
// 5. a lane waiting on a human: every open `question`, with its options.
// Due: an open workload whose brief starts `due:<date> ` with date <= now (M11 scheduled re-measure;
//    a workload of its own, closed with a receipt by the orchestrator).
import type { InFlightWorkload, Ledger } from "../../ledger/src/index";
import { ARTIFACT_FAILED_PREFIX, ARTIFACT_FAILURES_SURFACED, DUE_PREFIX, HOLD_HOURS, STANDING_WORKLOAD_ID } from "./types";

export type ErrorKind = "reserved" | "held" | "artifact" | "lane-died" | "question" | "due";

export interface ErrorLine {
	kind: ErrorKind;
	workloadId: string;
	/** The row the line is about: entry id, message id, slice id, workload id, question id. */
	rowId: string;
	line: string;
	/** For a question: the options Jo answers with one word. */
	options?: string[];
}

export interface ErrorOptions {
	now?: string;
	holdHours?: number;
}

const short = (s: string, n = 90): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Hours between two ISO timestamps, one decimal. */
export function hoursBetween(from: string, to: string): number {
	return Math.round(((Date.parse(to) - Date.parse(from)) / 3_600_000) * 10) / 10;
}

/** Parse `due:<date> <text>`; null when the brief is not a scheduled row. */
export function parseDue(brief: string): { due: string; text: string } | null {
	if (!brief.startsWith(DUE_PREFIX)) return null;
	const rest = brief.slice(DUE_PREFIX.length);
	const m = /^(\S+)\s+(.+)$/s.exec(rest);
	if (!m || Number.isNaN(Date.parse(m[1]!))) return null;
	return { due: m[1]!, text: m[2]!.trim() };
}

/** The reserved-request entries on a workload that no later instruction has named. */
export function waitingReserved(ledger: Ledger, workloadId: string): { id: string; body: string; created_at: string }[] {
	const requests = ledger.entries(workloadId, "reserved-request");
	if (requests.length === 0) return [];
	const instructions = ledger.instructions(workloadId).filter((i) => i.kind === "instruction");
	return requests.filter((r) => !instructions.some((i) => i.created_at >= r.created_at && i.body.includes(r.id)));
}

/** The artifact-failure count per slice of one workload, from lane→orchestrator messages. */
export function artifactFailures(ledger: Ledger, workloadId: string): Map<string, number> {
	const rows = ledger.db.query<{ slice_id: string | null; n: number }, [string, string]>(
		"SELECT slice_id, count(*) AS n FROM messages WHERE workload_id = ? AND slice_id IS NOT NULL AND body LIKE ? GROUP BY slice_id",
	).all(workloadId, `${ARTIFACT_FAILED_PREFIX}%`);
	return new Map(rows.filter((r) => r.slice_id !== null).map((r) => [r.slice_id!, r.n]));
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
	for (const { workload, slices, openQuestions } of inFlight) {
		const wl = workload.id;
		const label = wl === STANDING_WORKLOAD_ID ? "orchestrator" : wl;
		for (const r of waitingReserved(ledger, wl)) {
			reserved.push({ kind: "reserved", workloadId: wl, rowId: r.id, line: `reserved action waiting on you (${label}): ${short(r.body)} — \`approve ${r.id}\` or \`deny ${r.id}\`` });
		}
		const oldest = ledger.oldestHeld(now, wl);
		if (oldest && oldest.age_seconds >= holdHours * 3600) {
			held.push({ kind: "held", workloadId: wl, rowId: oldest.id, line: `held ${hoursBetween(oldest.enqueued_at, now)}h on ${label}: message ${oldest.id} has had no live lane since ${oldest.enqueued_at}` });
		} else if (!workload.holder && workload.open_slices > 0 && hoursBetween(workload.last_activity_at, now) >= holdHours) {
			held.push({ kind: "held", workloadId: wl, rowId: wl, line: `held ${hoursBetween(workload.last_activity_at, now)}h on ${label}: ${workload.open_slices} open slice(s), no lane, no activity since ${workload.last_activity_at}` });
		}
		for (const [sliceId, n] of artifactFailures(ledger, wl)) {
			if (n < ARTIFACT_FAILURES_SURFACED) continue;
			const slice = slices.find((s) => s.id === sliceId) ?? ledger.slice(sliceId);
			if (!slice || slice.state === "done" || slice.state === "cancelled") continue;
			artifact.push({ kind: "artifact", workloadId: wl, rowId: sliceId, line: `slice ${sliceId} (${label}) failed its runtime artifact ${n} times: ${short(slice.task, 70)}` });
		}
		if (workload.holder && workload.holder_lease_until && workload.holder_lease_until < now) {
			died.push({ kind: "lane-died", workloadId: wl, rowId: wl, line: `lane ${workload.holder} on ${label} died: lease lapsed ${workload.holder_lease_until}, ${workload.open_slices} open slice(s)` });
		}
		for (const q of openQuestions) {
			questions.push({ kind: "question", workloadId: wl, rowId: q.id, options: q.options, line: `lane on ${label} is waiting on you (${q.id}, slice ${q.slice_id}): ${short(q.body, 120)} — answer with one word: ${q.options.join(" / ")} (or \`withdraw\`)` });
		}
		const d = parseDue(workload.brief);
		if (d && d.due <= now) {
			due.push({ kind: "due", workloadId: wl, rowId: wl, line: `scheduled and past due (${d.due}): ${short(d.text, 120)} — close ${wl} with a receipt when done` });
		}
	}
	return [...reserved, ...held, ...artifact, ...died, ...questions, ...due];
}
