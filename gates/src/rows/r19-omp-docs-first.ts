// P-11 row 19, "OMP questions read OMP first" (PLAN wl-mv8k0fby51uakg D9, in-mv90pa1iolasjk; jo-issues#55):
// a question about OMP, the harness these sessions run in, is answered from OMP's own docs or source, not
// from memory. Pure: no OMP import. The adapter (gates/extensions/r19-omp-docs-first.ts) feeds it OMP's events.
//
// - A question starts at an input: Ilex's or a lane's `input` (interactive or rpc), a hand's task prompt.
//   Nothing else starts one, so a hidden continuation or an aside keeps the question it follows.
// - It triggers at once on a keyword (KEYWORDS, whole words, case-insensitive), else on one judge call
//   started at the input and awaited at the first answer boundary. The judge is OMP's `judge` role through
//   classifier/src/judge-ask.ts askJudgment; an error, a timeout or no judge at all counts as triggered.
// - It is consulted once a successful `read`, `grep`, `find` or `search` (grep's legacy name) since the input
//   named an `omp://` doc, a file under an `@oh-my-pi/` package, or OMP-HARNESS.md / OMP-RUNTIME.md.
// - While triggered and unconsulted, every answer attempt is held; after HOLD_LIMIT holds the next attempt
//   goes through carrying RELEASE_LINE, so a model that cannot read the docs does not loop forever.
import { askJudgment, type BoolQuestion, type JudgmentJudge } from "../../../classifier/src/judge-ask";
import { CHANNEL_REPLY_TOOL, LANE_MESSAGE_TOOL, LANE_RAISE_QUESTION_TOOL, RAISE_QUESTION_TOOL } from "../../../surface/src/types";

/** The words that make an input a question about OMP without asking the judge. */
export const KEYWORDS = ["omp", "oh-my-pi", "pi-coding-agent", "harness", "slash command", "/add-dir", "/collab", "/settings", "/login"] as const;

/**
 * Each keyword as a whole word: no letter, digit or underscore on either side (so `omp` is not found in
 * `compact`), a word may take a plural `s`/`es`, a space may be any run of spaces or hyphens, and a slash
 * command may not follow another `/` (`a/settings` is a path, not the command).
 */
const KEYWORD_PATTERNS: readonly (readonly [string, RegExp])[] = KEYWORDS.map((k) => {
	const body = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "[\\s-]+");
	const slash = k.startsWith("/");
	return [k, new RegExp(`(?<![\\w${slash ? "/" : ""}])${body}${slash ? "" : "(?:e?s)?"}(?!\\w)`, "i")] as const;
});

/** The first keyword `text` names, or null. */
export function keywordHit(text: string): string | null {
	return KEYWORD_PATTERNS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** The longest part of an input the judge is shown: the question is at its start, and a long paste costs tokens for nothing. */
export const QUESTION_CAP = 4000;
/** How long the judge has, from the input to an answer: classifier/extension.ts gives its pair-signal ask the same 10 s. */
export const JUDGE_TIMEOUT_MS = 10_000;
/** Holds before an attempt is let through with RELEASE_LINE. */
export const HOLD_LIMIT = 5;

/** The one judge question, keyed as askJudgment sends it. */
export const OMP_QUESTION: Record<"omp_question", BoolQuestion> = {
	omp_question: {
		type: "bool",
		instructions:
			"Is this message a direct question about OMP (oh-my-pi, the coding-agent harness), or a question about how to do something in a coding-agent harness?",
		criteria: {
			true: "It asks about OMP itself (its commands, flags, settings, tools, extensions, sessions, models) or how to do something in a coding-agent harness.",
			false: "Anything else: a task to carry out, machinery output, a status report, or a question about other software or about the work itself.",
		},
	},
};

/** Why a question is or is not one this row holds. */
export interface Trigger {
	triggered: boolean;
	why: string;
}

/** How the row reaches a judge: OMP's `judge` role in production, a fake in tests. A rejection counts as no judge. */
export type JudgeSource = () => Promise<JudgmentJudge>;

/**
 * The judge's reading of `text`, never rejecting: yes (probability at least one half) triggers, no does not,
 * and anything else triggers (fail closed). `timeoutMs` bounds the whole ask, the judge's own resolution
 * included, and the call is aborted when it runs out.
 */
export async function judgeQuestion(text: string, judge: JudgeSource | undefined, timeoutMs: number = JUDGE_TIMEOUT_MS): Promise<Trigger> {
	if (!judge) return { triggered: true, why: "no judge is wired into this session, so every input counts" };
	const abort = new AbortController();
	const late = Promise.withResolvers<Trigger>();
	const timer = setTimeout(() => {
		abort.abort();
		late.resolve({ triggered: true, why: `the judge did not answer within ${timeoutMs} ms, so the input counts` });
	}, timeoutMs);
	const asked = (async (): Promise<Trigger> => {
		try {
			const r = await askJudgment(await judge(), text.slice(0, QUESTION_CAP), OMP_QUESTION, { timeoutMs, signal: abort.signal });
			if (!r.ok) return { triggered: true, why: `the judge failed (${r.reason}), so the input counts` };
			const a = r.answers.omp_question;
			const yes = a?.type === "bool" ? a.bool : 1;
			return { triggered: yes >= 0.5, why: `the judge read it as a question about OMP (p=${yes.toFixed(2)})` };
		} catch (err) {
			return { triggered: true, why: `the judge was unavailable (${String(err).split("\n")[0]}), so the input counts` };
		}
	})();
	try {
		return await Promise.race([asked, late.promise]);
	} finally {
		clearTimeout(timer);
	}
}

/** The tools whose successful result can be a consult. `search` is grep's legacy name (OMP tools/builtin-names.ts). */
const CONSULT_TOOLS: Record<string, true> = { read: true, grep: true, find: true, search: true };

/** One path or URL is OMP's own: an `omp://` doc, a file under an `@oh-my-pi/` package, or one of the two guides (a selector suffix allowed). */
export function ompDoc(path: string): boolean {
	const p = path.trim();
	return p.startsWith("omp://") || p.includes("/@oh-my-pi/") || /(?:^|[\\/])OMP-(?:HARNESS|RUNTIME)\.md(?::[^/\\]*)?$/.test(p);
}

/** Whether a `tool_result` consulted OMP: a successful read, grep, find or search whose path, paths, URL or resolved path is OMP's own. */
export function consultsOmp(toolName: string, input: Record<string, unknown>, details: unknown, isError: boolean): boolean {
	if (isError || !CONSULT_TOOLS[toolName]) return false;
	const d = details && typeof details === "object" ? (details as Record<string, unknown>) : {};
	const named = [input.path, input.url, d.resolvedPath, ...(Array.isArray(input.paths) ? input.paths : [])];
	// grep and find take several targets in one `;`-separated path.
	return named.some((p) => typeof p === "string" && p.split(";").some(ompDoc));
}

/** Ilex's and lanes' tools that carry an answer out of the session. */
const OUTWARD_TOOLS: Record<string, true> = { [CHANNEL_REPLY_TOOL]: true, [RAISE_QUESTION_TOOL]: true, [LANE_MESSAGE_TOOL]: true, [LANE_RAISE_QUESTION_TOOL]: true };

/** The outward tool a call reaches, by name or as its `xd://` device (session.ts registerTool loadMode), or null. */
export function outwardTool(toolName: string, input: Record<string, unknown>): string | null {
	if (OUTWARD_TOOLS[toolName]) return toolName;
	if (toolName !== "write" || typeof input.path !== "string" || !input.path.startsWith("xd://")) return null;
	const device = input.path.slice("xd://".length);
	return OUTWARD_TOOLS[device] ? device : null;
}

/** What replaces a held final reply, once per question; it passes row 1 (gates/test/r19-omp-docs-first.test.ts). */
export const HELD_MARKER = "(Answer held by P-11 row 19 until an OMP doc is read. The answer follows.)";
/** Every text block of a later hold for the same question. Non-empty: an empty reply is an empty stop, which skips session_stop. */
export const LATER_HOLD = "…";
/** The line a released answer carries. */
export const RELEASE_LINE = `row 19: released after ${HOLD_LIMIT} holds without an OMP read`;

/** The refusal or stop-block reason for hold number `hold`, naming what to read. */
export function holdReason(why: string, hold: number): string {
	return (
		`P-11 row 19 held this answer: the input it answers is a question about OMP, the harness this session runs in (${why}), ` +
		"and nothing of OMP's own has been read since. Read it first with `read`, `grep` or `find`: the profile's OMP-HARNESS.md or " +
		"OMP-RUNTIME.md (in the profile's agent dir, or profile/ in the agent-system checkout), an omp:// doc (`read omp://` lists them), " +
		"or the OMP source, a file under the `@oh-my-pi/` packages (pi-coding-agent/src). A read that errors does not count. Then answer " +
		`from what it says. (hold ${hold} of ${HOLD_LIMIT}; after ${HOLD_LIMIT} the answer goes through carrying "${RELEASE_LINE}")`
	);
}

/** One answer attempt's outcome. */
export type Attempt = { kind: "pass" } | { kind: "hold"; reason: string } | { kind: "release"; why: string };

/** One question: from its input to the next, what it takes to answer it. */
export class OmpQuestion {
	readonly trigger: Promise<Trigger>;
	consulted = false;
	/** Holds so far; a consult ends the question's holds. */
	holds = 0;
	released = false;
	/** RELEASE_LINE reached an answer (a release at an outward tool shows it on the next reply). */
	releaseShown = false;
	/** HELD_MARKER showed for this question; later holds show LATER_HOLD. */
	markerShown = false;
	/** The reply held at `assistant_message`, until its `session_stop` hands it back to the model. */
	draft: string | null = null;
	/** The reason of the last hold. */
	reason = "";

	constructor(text: string, judge: JudgeSource | undefined, timeoutMs?: number) {
		const hit = keywordHit(text);
		this.trigger = hit ? Promise.resolve({ triggered: true, why: `it names \`${hit}\`` }) : judgeQuestion(text, judge, timeoutMs);
	}

	/** The trigger while an answer would be held now (triggered, unconsulted, not released), else null. Counts nothing. */
	async holding(): Promise<Trigger | null> {
		if (this.consulted || this.released) return null;
		const t = await this.trigger;
		return t.triggered && !this.consulted && !this.released ? t : null;
	}

	/** One answer attempt: passed, held (counted), or released once HOLD_LIMIT holds have gone by. */
	async attempt(): Promise<Attempt> {
		const t = await this.holding();
		if (!t) return { kind: "pass" };
		if (this.holds >= HOLD_LIMIT) {
			this.released = true;
			return { kind: "release", why: t.why };
		}
		this.holds++;
		this.reason = holdReason(t.why, this.holds);
		return { kind: "hold", reason: this.reason };
	}
}
