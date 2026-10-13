// The plan file's path beneath every mention of an open plan question (PLAN wl-mv61a8dh4aeneo D1;
// MIGRATION.md item for that plan). A plan question is an open `question` row that
// `isPlanQuestionIn` (surface/src/launch.ts) names as its workload's plan question while `plan: first`
// stands; its body's first line is the plan file's absolute path (`planQuestionProblem` checks it
// when the question is raised). The path is always read from the question row, never from the text
// that mentions it, and never cut or shortened.
//
// A mention is a `q-…` id, or a `#N` that the session's Numbering (surface/src/numbering.ts) gives to
// a question row. `#N` is not a needs-you number after `PR`, `pull request`, `issue` or `item` (any
// case, one optional space), after a word character or after `/` (`PR #100`, `owner/repo#12`).
//
// `withPlanPaths` puts `  plan for <ref>: <absolute path>` beneath each line naming one, once per
// question per line, in the order the line names them. A question already annotated in the run
// beneath its line is not annotated again: a `plan for` line naming the same question (by its id or
// a number that resolves to it), or, right beneath the plan question's own header line, its bare
// path (surface/src/errors.ts and surface/src/render.ts start the plan body on that line). The key is
// the question, not the path, so two questions sharing one plan file both get their line. `plan for`
// lines are never scanned for mentions, so a second pass over decorated text changes nothing.
import type { Ledger } from "../../ledger/src/index";
import { controlEntries, holdersOf, isPlanQuestionIn } from "./launch";
import type { Numbering } from "./numbering";

/** One mention of an open plan question on a line: how the line names it, the row, its plan path, and where on the line. */
export interface PlanMention {
	ref: string;
	questionId: string;
	path: string;
	index: number;
}

/**
 * The plan file path of `questionId` when it is an open plan question: the row is open (not
 * answered, not withdrawn), `isPlanQuestionIn` holds on its workload, and its body's first line
 * starts with `/`, returned verbatim. Null otherwise.
 */
export function openPlanPath(ledger: Ledger, questionId: string): string | null {
	const q = ledger.question(questionId);
	if (!q || q.state !== "open") return null;
	const w = ledger.workload(q.workload_id);
	if (!w) return null;
	const entries = ledger.entries(q.workload_id);
	if (!isPlanQuestionIn(controlEntries(entries, holdersOf(entries, w.holder, ledger.holders(q.workload_id))), q)) return null;
	const first = q.body.split("\n")[0]!;
	return first.startsWith("/") ? first : null;
}

const QUESTION_ID = /(?<![\w/.-])q-[0-9a-z]+(?![\w-])/g;
const NUMBER = /(?<![\w/])#(\d+)(?!\w)/g;
/** What makes a `#N` something else's number: the text right before it. */
const NOT_NEEDS_YOU = /(?:\bPR|\bpull request|\bissue|\bitem) ?$/i;
/** A `plan for <ref>: …` annotation line; its ref is a question id or a number. */
const ANNOTATION = /^\s*plan for (q-[0-9a-z]+|#\d+): /;

type Resolve = (questionId: string) => string | null;

/** `openPlanPath` read once per question for one pass. */
function cachedResolver(ledger: Ledger): Resolve {
	const seen = new Map<string, string | null>();
	return (id) => {
		if (!seen.has(id)) seen.set(id, openPlanPath(ledger, id));
		return seen.get(id)!;
	};
}

/** The question row a ref names: the id itself, or the question row the session numbered N; null for anything else. */
function refQuestion(numbering: Numbering, ref: string): string | null {
	if (ref.startsWith("q-")) return ref;
	const t = numbering.target(Number(ref.slice(1)));
	return t?.kind === "question" ? t.rowId : null;
}

function mentionsWith(resolve: Resolve, numbering: Numbering, line: string): PlanMention[] {
	const found: { ref: string; questionId: string; index: number }[] = [];
	for (const m of line.matchAll(QUESTION_ID)) found.push({ ref: m[0], questionId: m[0], index: m.index! });
	for (const m of line.matchAll(NUMBER)) {
		if (NOT_NEEDS_YOU.test(line.slice(0, m.index))) continue;
		const q = refQuestion(numbering, m[0]);
		if (q) found.push({ ref: m[0], questionId: q, index: m.index! });
	}
	found.sort((a, b) => a.index - b.index);
	const out: PlanMention[] = [];
	for (const f of found) {
		if (out.some((o) => o.questionId === f.questionId)) continue;
		const path = resolve(f.questionId);
		if (path !== null) out.push({ ...f, path });
	}
	return out;
}

/** Every open plan question `line` names (`q-…`, or `#N` through `numbering`), one per question, in the order the line names them. */
export function planMentions(ledger: Ledger, numbering: Numbering, line: string): PlanMention[] {
	return mentionsWith(cachedResolver(ledger), numbering, line);
}

/** The annotation line for one mention. */
export const planLine = (m: Pick<PlanMention, "ref" | "path">): string => `plan for ${m.ref}: ${m.path}`;

/**
 * `text` with `  plan for <ref>: <absolute path>` beneath each line naming an open plan question
 * not already annotated in the run beneath it (see the header). Idempotent; never cuts. A ledger
 * read error throws: the call site keeps the text as it was and says so.
 */
export function withPlanPaths(ledger: Ledger, numbering: Numbering, text: string): string {
	const resolve = cachedResolver(ledger);
	const lines = text.split("\n");
	const out: string[] = [];
	let i = 0;
	while (i < lines.length) {
		const line = lines[i++]!;
		out.push(line);
		if (ANNOTATION.test(line)) continue;
		const mentions = mentionsWith(resolve, numbering, line);
		if (mentions.length === 0) continue;
		const done = new Set<string>();
		// The plan question's own header line: its bare path is the line beneath.
		const own = i < lines.length ? mentions.find((m) => m.path === lines[i]!.trim()) : undefined;
		if (own) {
			done.add(own.questionId);
			out.push(lines[i++]!);
		}
		for (let a = i < lines.length ? ANNOTATION.exec(lines[i]!) : null; a; a = i < lines.length ? ANNOTATION.exec(lines[i]!) : null) {
			const q = refQuestion(numbering, a[1]!);
			if (q) done.add(q);
			out.push(lines[i++]!);
		}
		for (const m of mentions) if (!done.has(m.questionId)) out.push(`  ${planLine(m)}`);
	}
	return out.join("\n");
}

/**
 * `withPlanPaths` where surface text is produced (PLAN wl-mv61a8dh4aeneo D2): a ledger that cannot be
 * opened or read leaves `text` as it was and `warn` names why.
 */
export function withPlanPathsOrWarn(ledger: () => Ledger, numbering: Numbering, text: string, warn: (message: string) => void): string {
	try {
		return withPlanPaths(ledger(), numbering, text);
	} catch (err) {
		warn(`the plan paths could not be read from the ledger: ${err instanceof Error ? err.message : String(err)}`);
		return text;
	}
}
