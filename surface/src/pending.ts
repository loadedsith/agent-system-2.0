// `pending` (PLAN wl-mv5msri070p0qo D1): everything waiting on Jo's word as one block of answer
// lines, built from ledger state with no model turn. Pure: reads only; the surface shows the block
// (surface/extensions/surface-input.ts) and Jo's paste of it is read by surface/src/input.ts.
//
// What it covers, in errorLines' order (surface/src/errors.ts): every waiting reserved request
// (`waitingReserved`, the standing workload's included), then every open question on an open
// workload: lanes' questions, the runner's ceiling and round-limit questions, the classifier's
// park questions, and the orchestrator's own questions on the standing workload.
//
// Each answerable row is one line inside the fence, a whole exact answer:
//   <word> <id>  # <subject> — on <workload words> · <recommended (where) | no recommendation recorded> · also: <others>[ / withdraw]
// The word is the recorded recommendation, else the row's first option (`approve` for a reserved
// request). `withdraw` is offered in a question's tail only: it does not apply to reserved requests.
// A question with an option of more than one word has no answer line (`interpret` reads two words
// at most); it is a sentence under the fence and is counted. Prompt waits (`openPromptWaits`) cannot
// be answered at the surface: a sentence each under the fence, never counted.
import type { Ledger } from "../../ledger/src/index";
import { sameCall, waitingReserved } from "./errors";
import { isCeilingQuestion } from "./input";
import { type ControlEntry, controlEntries, doneLine, holdersOf, isPlanQuestionIn } from "./launch";
import { questionSubject } from "./orchestrator-question";
import { openPromptWaits } from "./signals";
import { STANDING_WORKLOAD_ID } from "./types";

export interface PendingItem {
	kind: "question" | "reserved";
	/** q-… or en-… */
	id: string;
	workloadId: string;
	/** The question's options as stored; a reserved request's are ["approve", "deny"]. */
	options: string[];
	/** The line's answer word: the recorded recommendation, else the first option; null when an option is multiword. */
	answer: string | null;
	/** The recorded recommendation (D1 precedence), else null. */
	recommended: string | null;
	/** Where the recommendation is recorded: `review: approve-with-changes`, `the default`, `recommended`; null with none. */
	recordedWhere: string | null;
	/** Plain words, clipped. */
	subject: string;
	/** The workload's newest `done:` line, else its brief's first line, clipped. */
	workloadWords: string;
}

/** The longest line inside the fence (D1 formatting). */
export const PENDING_LINE_MAX = 240;
/** The block's empty case. */
export const PENDING_EMPTY = "## pending: nothing is waiting on you";
const PASTE_HINT = "(paste the block back as is, or any of its lines; change a line's first word to pick another option)";
const SUBJECT_MAX = 80;
const RESERVED_MAX = 60;
const WORDS_MAX = 60;
const RESERVED_OPTIONS = ["approve", "deny"];
/** `<option> (recommended)`, `<option> (the default)`, `<option> (default)`: the marks a question body records a recommendation with (rule 3). */
const MARK = /([^\s`*(]+)[`*]*\s*\((recommended|the default|default)\)/gi;

/** One line of plain text: no backticks, whitespace collapsed, no trailing punctuation. */
function plain(s: string): string {
	return s.replace(/`/g, "").replace(/\s+/g, " ").trim().replace(/[\s.,;:!?]+$/, "");
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, Math.max(0, n - 1)).trimEnd()}…` : s);

/** A workload's control entries as the plan-question and done readers want them (holders included). */
function controlOf(ledger: Ledger, workloadId: string, holder: string | null): ControlEntry[] {
	const entries = ledger.entries(workloadId);
	return controlEntries(entries, holdersOf(entries, holder, ledger.holders(workloadId)));
}

/** The newest `done:` line, else the brief's first line, else the id; plain and clipped. */
function wordsOf(ledger: Ledger, workloadId: string, control: readonly ControlEntry[] | null = null): string {
	const w = ledger.workload(workloadId);
	if (!w) return workloadId;
	const done = doneLine(control ?? controlOf(ledger, workloadId, w.holder));
	return clip(plain(done ?? w.brief.split("\n")[0] ?? "") || workloadId, WORDS_MAX);
}

/** The verdict of a plan question body's `review: <verdict>, <model>, <path>` line, or null. */
function reviewVerdict(body: string): string | null {
	const line = body.split("\n").map((l) => l.trim()).find((l) => /^review:/i.test(l));
	const verdict = line?.slice("review:".length).split(",")[0]?.trim();
	return verdict ? verdict : null;
}

/** The stored option equal to `word`, case-insensitively, or null. */
const optionOf = (options: readonly string[], word: string): string | null => options.find((o) => o.toLowerCase() === word.toLowerCase()) ?? null;

/** Rule 3: the first `<option> (recommended|the default|default)` mark in the body naming one of the options. */
function marked(body: string, options: readonly string[]): { option: string; where: string } | null {
	for (const m of body.matchAll(MARK)) {
		const option = optionOf(options, m[1]!.replace(/^["'“]+|["'”]+$/g, ""));
		if (!option) continue;
		const mark = m[2]!.toLowerCase();
		return { option, where: mark === "default" ? "the default" : mark };
	}
	return null;
}

/**
 * The recorded recommendation (D1), in order: the plan question recommends `approve` only when its
 * `review:` verdict starts with approve or accept (any other verdict: none, nothing else consulted);
 * the runner's ceiling question recommends `stop`, which its body records as the default; a mark in
 * the body; otherwise none. Never inferred from the question's type alone.
 */
function recommendation(q: { body: string; options: string[] }, plan: boolean, ceiling: boolean): { option: string; where: string } | null {
	if (plan) {
		const verdict = reviewVerdict(q.body);
		const approve = optionOf(q.options, "approve");
		return verdict && approve && /^(approve|accept)/i.test(verdict) ? { option: approve, where: `review: ${verdict}` } : null;
	}
	if (ceiling) {
		const stop = optionOf(q.options, "stop");
		if (stop) return { option: stop, where: "the default" };
	}
	return marked(q.body, q.options);
}

/** Every waiting reserved request, then every open question, on the open workloads (errorLines' order). */
export function pendingItems(ledger: Ledger): PendingItem[] {
	const reserved: PendingItem[] = [];
	const questions: PendingItem[] = [];
	for (const { workload, openQuestions } of ledger.inFlight()) {
		const wl = workload.id;
		const standing = wl === STANDING_WORKLOAD_ID;
		const control = controlOf(ledger, wl, workload.holder);
		const words = standing ? "a session bound to no workload" : wordsOf(ledger, wl, control);
		for (const r of waitingReserved(ledger, wl)) {
			reserved.push({
				kind: "reserved", id: r.id, workloadId: wl, options: [...RESERVED_OPTIONS], answer: RESERVED_OPTIONS[0]!, recommended: null, recordedWhere: null,
				subject: `reserved action: ${clip(plain(sameCall(r.body)), RESERVED_MAX)}`, workloadWords: words,
			});
		}
		for (const q of openQuestions) {
			const plan = !standing && isPlanQuestionIn(control, q);
			const ceiling = !standing && isCeilingQuestion(q, ledger.slice(q.slice_id));
			const rec = recommendation(q, plan, ceiling);
			const oneWord = q.options.length > 0 && q.options.every((o) => !/\s/.test(o));
			const firstLine = clip(plain(q.body.split("\n")[0] ?? ""), SUBJECT_MAX) || "a question";
			let workloadWords = words;
			if (standing) {
				const about = questionSubject(ledger, q.id);
				workloadWords = about ? `your orchestrator's question about ${wordsOf(ledger, about)}` : "your orchestrator's question";
			}
			questions.push({
				kind: "question", id: q.id, workloadId: wl, options: [...q.options],
				answer: oneWord ? (rec?.option ?? q.options[0]!) : null,
				recommended: rec?.option ?? null, recordedWhere: rec?.where ?? null,
				subject: plan ? clip(`plan for ${words}`, SUBJECT_MAX) : firstLine, workloadWords,
			});
		}
	}
	return [...reserved, ...questions];
}

/** One sentence per unresolved prompt wait on an open workload: shown under the block, never counted. */
export function pendingWaits(ledger: Ledger): string[] {
	const out: string[] = [];
	for (const { workload } of ledger.inFlight()) {
		const words = workload.id === STANDING_WORKLOAD_ID ? "a session bound to no workload" : wordsOf(ledger, workload.id);
		for (const w of openPromptWaits(ledger, workload.id)) {
			out.push(`${w.lane} on ${words} is blocked on a ${w.toolName} prompt it should never open (since ${w.created_at}): ${clip(plain(w.reason), 100)}; answer it in that session or end the session.`);
		}
	}
	return out;
}

const noteOf = (item: PendingItem): string =>
	item.recommended === null ? "no recommendation recorded" : item.recordedWhere && item.recordedWhere !== "recommended" ? `recommended (${item.recordedWhere})` : "recommended";

/**
 * The answer line of an item with a one-word answer; the subject gives way so the line fits
 * PENDING_LINE_MAX, and when the subject at its shortest is not enough the `also:` list drops
 * options from its end behind `…`. The answer word and the id are never cut.
 */
function answerLine(item: PendingItem, answer: string): string {
	const others = [...item.options.filter((o) => o !== answer), ...(item.kind === "question" ? ["withdraw"] : [])];
	const head = `${answer} ${item.id}  # `;
	const lead = ` — on ${item.workloadWords} · ${noteOf(item)} · also: `;
	const shortest = Math.min(item.subject.length, 1);
	let kept = others.length;
	let rest = lead + others.join(" / ");
	while (kept > 0 && head.length + shortest + rest.length > PENDING_LINE_MAX) rest = lead + [...others.slice(0, --kept), "…"].join(" / ");
	return `${head}${clip(item.subject, PENDING_LINE_MAX - head.length - rest.length)}${rest}`;
}

/** Why a question has no answer line: its options are not one word each, or its answer word and id alone overrun PENDING_LINE_MAX. */
const NOT_ONE_WORD = "are not one word each";
const TOO_LONG = "are too long for an answer line";

/** The sentence for a question with no answer line that would read back (`why`: NOT_ONE_WORD or TOO_LONG). */
function wordsSentence(item: PendingItem, why: string): string {
	const rec = item.recommended === null ? "no recommendation recorded" : `${item.recommended} ${noteOf(item)}`;
	return `${item.id} on ${item.workloadWords} asks: ${item.subject}; its options (${item.options.join(" / ")}) ${why}, so it has no answer line (${rec}); answer it in words.`;
}

/**
 * The block Jo reads: a header with the count, one fenced `text` block of answer lines, then the
 * sentences for questions with no answer line (counted) and for `waits` (not counted). `count` is the items.
 */
export function pendingBlock(items: PendingItem[], waits: string[] = []): { text: string; count: number } {
	const count = items.length;
	const fenced: string[] = [];
	const below: string[] = [];
	for (const item of items) {
		if (item.answer === null) {
			below.push(wordsSentence(item, NOT_ONE_WORD));
			continue;
		}
		const line = answerLine(item, item.answer);
		if (line.length <= PENDING_LINE_MAX) fenced.push(line);
		else below.push(wordsSentence(item, TOO_LONG));
	}
	const header = count === 0 ? PENDING_EMPTY : `## pending: ${count} ${count === 1 ? "thing waits" : "things wait"} on you${fenced.length > 0 ? ` ${PASTE_HINT}` : ""}`;
	const out = [header];
	if (fenced.length > 0) out.push("```text", ...fenced, "```");
	out.push(...below, ...waits);
	return { text: out.join("\n"), count };
}

/** The heading `pendingBlock` writes when something waits, less the paste hint it carries when there are answer lines. */
const PENDING_COUNT = /^## pending: \d+ (?:thing waits|things wait) on you$/;
/** The two generated sentences `pendingBlock` writes under its fence: `wordsSentence` and a `pendingWaits` line. */
const GENERATED_BELOW = [
	new RegExp(`^(?:q|en)-[a-z0-9]+ on .+ asks: .*; its options \\(.*\\) (?:${NOT_ONE_WORD}|${TOO_LONG}), so it has no answer line \\(.*\\); answer it in words\\.$`),
	/^\S+ on .+ is blocked on a \S+ prompt it should never open \(since [^)]*\): .*; answer it in that session or end the session\.$/,
];

const isHeading = (line: string): boolean =>
	line === PENDING_EMPTY || PENDING_COUNT.test(line.endsWith(` ${PASTE_HINT}`) ? line.slice(0, -PASTE_HINT.length - 1) : line);

/**
 * The indexes of `lines` that are the wrapper of a `pending` block pasted back: a generated heading,
 * the ```` ```text ```` fence right under it and the ```` ``` ```` that closes it, and the generated
 * sentences directly under the block. The answer lines inside the fence are not wrapper. A fence or
 * a heading-like line that is not part of such a block is Jo's and is kept (surface/src/input.ts
 * interpretPaste).
 */
export function pendingWrapperLines(lines: string[]): Set<number> {
	const out = new Set<number>();
	const t = lines.map((l) => l.trim());
	for (let i = 0; i < t.length; i++) {
		if (!isHeading(t[i]!)) continue;
		out.add(i);
		let j = i + 1;
		if (t[j] === "```text") {
			const close = t.indexOf("```", j + 1);
			if (close !== -1) {
				out.add(j).add(close);
				j = close + 1;
			}
		}
		while (j < t.length && GENERATED_BELOW.some((re) => re.test(t[j]!))) out.add(j++);
		i = j - 1;
	}
	return out;
}
