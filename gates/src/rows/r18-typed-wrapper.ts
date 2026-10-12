// P-11 row 18 (MIGRATION.md item 99; plan: wl-mv4enu3823jb7k PLAN.md revision 4 § 2): a bash call whose
// typed command starts with the M4b fence's own wrapper (fence.ts wrapCommand: `'<sandbox-exec>' -p
// '<profile>' /bin/bash -c '<command>'`) is refused, and the refusal says to resend the bare command.
// OMP persists the fence's revision as the call's own arguments (agent-session.ts "schedules,
// displays, persists, and executes"), so a session's earlier bash calls show the wrapper and the
// model copies it. Item 77's strip (the fence taking a copy apart and running the inner command) is
// gone: the copy is refused here, at the layer that sees what was typed.
//
// What this row reads: `input.command` as the model typed it, raw. Every `tool_call` handler gets the
// same original event and the fence registers last and builds a new object for its revision
// (gates/index.ts, fence.ts), so a row registered before the fence never sees that revision. It
// never reads through exec.ts bashCommand, which takes a copied wrapper off before judging. Bash
// calls only, every role, fence on or off, no ledger read.
//
// One matcher, no fallback: a small quote-aware lexer over the leading words of the command.
// - Start: blanks (space, tab, newline), unquoted backslash-newlines and whole comment lines are
//   skipped, repeatedly.
// - Words end at an unquoted space or tab. `'…'` is literal; `"…"` honours \" \\ \$ \` and
//   backslash-newline; an unquoted backslash escapes the next character. An unquoted backslash-newline
//   vanishes as bash removes it: it makes no word of its own (a genuinely empty `''` or `""` is still
//   a word) and it does not end an assignment name (`X\⏎=1` is an assignment). An unterminated quote
//   runs to the end (a broken copy is still lexed). A word holding an unquoted or double-quoted `$` or
//   backquote is expanded and never matches (row 6 judges expansion heads); the expansion is read to
//   its end so its spaces stay inside the word. A carriage return is an ordinary character, as it is
//   to bash.
// - The leading command ends at the first unquoted newline, `;`, `&`, `|`, `<`, `>`, `(`, `)`, or a
//   `#` at a word start; nothing past it is read.
// - A word whose source text begins with an unquoted `NAME=`, `NAME+=` or `NAME[subscript]=` (or
//   `NAME[subscript]+=`) is an assignment and is skipped (`'X=1'` is a head word). This goes past
//   shell-parse.ts on purpose, for this row only: shell-parse.ts knows `NAME=` alone, and the append
//   and array forms bash defines would otherwise hide a following `sandbox-exec` from row 18. Inside
//   the subscript, quotes and expansions do not end the name (`a[$i]=1` is an assignment).
// Refused when: W1 the head word's basename is exactly `sandbox-exec`; W2 the text after the start
// skip begins `-p`, blanks, an optional quote and `(version 1)`, or an optional quote and `(version 1)`
// (a raw prefix test: the shape is fixed text); W3 the head word's basename is exactly `bash` (under
// any path) and the next word, inside the leading command, is exactly `-c`.
//
// The message is chosen by shape, not authorship: when exec.ts copiedWrapper takes the command apart
// (the six-word wrapper, whatever its profile says) the refusal names the inner command to resend;
// any other match gets the general form. Row 6 refuses most W1 and W3 shapes too (a second shell
// with `-c`, `sandbox-exec` by name), but not W2 (`-p '(version 1)…' …` alone) nor a head behind an
// append or array assignment; this row runs first so the model reads "resend the bare command".
import { basename } from "node:path";
import { copiedWrapper } from "../exec";
import type { Refusal, ToolCall } from "../types";

/** A leading word: its text after quote removal, and whether an expansion makes that text unknown. */
interface LeadWord {
	text: string;
	expanded: boolean;
}

/** The blanks that end a word (a newline ends the whole leading command). */
const BLANK = " \t";
/** Unquoted, these end the leading command. */
const ENDS_COMMAND = "\n;&|<>()";
/** Inside "…", a backslash escapes only these (backslash-newline is removed). */
const DQ_ESCAPES = '"\\$`\n';

/** Past the blanks, backslash-newlines and whole comment lines at the start of `t`. */
function startSkip(t: string): number {
	let i = 0;
	for (;;) {
		for (;;) {
			if (t[i] === " " || t[i] === "\t" || t[i] === "\n") i++;
			else if (t[i] === "\\" && t[i + 1] === "\n") i += 2;
			else break;
		}
		if (t[i] !== "#") return i;
		const nl = t.indexOf("\n", i);
		if (nl < 0) return t.length;
		i = nl + 1;
	}
}

/** Past the closing quote of "…" opened before `i`, or the end of `t` when it is unterminated. */
function pastDoubleQuoted(t: string, i: number): number {
	while (i < t.length) {
		const c = t[i]!;
		if (c === '"') return i + 1;
		if (c === "\\") i += 2;
		else if (c === "$" || c === "`") i = pastExpansion(t, i, true);
		else i++;
	}
	return t.length;
}

/**
 * Past the expansion starting at `i` (`$…` or a backquote), reading its nested quotes and parens, so
 * the spaces inside `$(…)` stay inside the word. Only its extent matters: an expanded word never matches.
 */
function pastExpansion(t: string, i: number, inDouble: boolean): number {
	if (t[i] === "`") {
		for (let j = i + 1; j < t.length; j++) {
			if (t[j] === "\\") j++;
			else if (t[j] === "`") return j + 1;
		}
		return t.length;
	}
	const open = t[i + 1];
	if (open === "'" && !inDouble) {
		for (let j = i + 2; j < t.length; j++) {
			if (t[j] === "\\") j++;
			else if (t[j] === "'") return j + 1;
		}
		return t.length;
	}
	if (open !== "(" && open !== "{") return i + 1;
	const close = open === "(" ? ")" : "}";
	let depth = 0;
	for (let j = i + 1; j < t.length; j++) {
		const c = t[j]!;
		if (c === "\\") j++;
		else if (c === "'") {
			const end = t.indexOf("'", j + 1);
			if (end < 0) return t.length;
			j = end;
		} else if (c === '"') j = pastDoubleQuoted(t, j + 1) - 1;
		else if (c === "`") j = pastExpansion(t, j, false) - 1;
		else if (c === open) depth++;
		else if (c === close && --depth === 0) return j + 1;
	}
	return t.length;
}

/** An unquoted assignment prefix: `NAME=`, `NAME+=`, `NAME[subscript]=` or `NAME[subscript]+=`. */
const ASSIGNMENT = /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=/;
/** An unquoted name followed by an array subscript not yet closed: quotes and expansions here do not end the prefix. */
const OPEN_SUBSCRIPT = /^[A-Za-z_]\w*\[[^\]]*$/;

/**
 * One word from `i` (not at a blank or a command end): the word, whether it is an assignment, whether it
 * is empty (nothing but backslash-newlines, which bash removes, so no word at all), and where it ends.
 */
function readWord(t: string, i: number): { word: LeadWord; assignment: boolean; empty: boolean; end: number } {
	let text = "";
	let expanded = false;
	/** Anything but a backslash-newline was read (an empty quoted word '' or "" counts). */
	let content = false;
	/** The unquoted literal text the word starts with, which decides an assignment. */
	let lead = "";
	let leading = true;
	/** A quote, an escape or an expansion: it ends the prefix, except inside an array subscript. */
	const quoted = () => {
		if (leading && OPEN_SUBSCRIPT.test(lead)) lead += "_";
		else leading = false;
	};
	while (i < t.length) {
		const c = t[i]!;
		if (BLANK.includes(c) || ENDS_COMMAND.includes(c)) break;
		if (c === "\\" && t[i + 1] === "\n") {
			i += 2;
			continue;
		}
		content = true;
		if (c === "\\") {
			quoted();
			if (i + 1 < t.length) {
				text += t[i + 1];
				i += 2;
			} else {
				text += c;
				i++;
			}
			continue;
		}
		if (c === "'") {
			quoted();
			const end = t.indexOf("'", i + 1);
			if (end < 0) {
				text += t.slice(i + 1);
				i = t.length;
				break;
			}
			text += t.slice(i + 1, end);
			i = end + 1;
			continue;
		}
		if (c === '"') {
			quoted();
			i++;
			while (i < t.length) {
				const d = t[i]!;
				if (d === '"') {
					i++;
					break;
				}
				if (d === "\\" && i + 1 < t.length && DQ_ESCAPES.includes(t[i + 1]!)) {
					if (t[i + 1] !== "\n") text += t[i + 1];
					i += 2;
					continue;
				}
				if (d === "$" || d === "`") {
					expanded = true;
					i = pastExpansion(t, i, true);
					continue;
				}
				text += d;
				i++;
			}
			continue;
		}
		if (c === "$" || c === "`") {
			quoted();
			expanded = true;
			i = pastExpansion(t, i, false);
			continue;
		}
		text += c;
		if (leading) lead += c;
		i++;
	}
	return { word: { text, expanded }, assignment: ASSIGNMENT.test(lead), empty: !content, end: i };
}

/** The head word of the leading command and the word after it (null where the command has none). */
function leadingWords(t: string): { head: LeadWord | null; next: LeadWord | null } {
	const words: LeadWord[] = [];
	let i = startSkip(t);
	while (words.length < 2) {
		while (i < t.length && BLANK.includes(t[i]!)) i++;
		if (i >= t.length || ENDS_COMMAND.includes(t[i]!) || t[i] === "#") break;
		const w = readWord(t, i);
		i = w.end;
		if (w.empty || (w.assignment && words.length === 0)) continue;
		words.push(w.word);
	}
	return { head: words[0] ?? null, next: words[1] ?? null };
}

/** W2: the fixed text of a Seatbelt profile option, with or without the `-p` before it. */
const PROFILE_PREFIX = /^(?:-p[ \t]+)?['"]?\(version 1\)/;

/** Which of W1-W3 the typed command `t` matches, or null. */
function typedWrapperMatch(t: string): "W1" | "W2" | "W3" | null {
	const { head, next } = leadingWords(t);
	const literal = head && !head.expanded ? basename(head.text) : null;
	if (literal === "sandbox-exec") return "W1";
	if (PROFILE_PREFIX.test(t.slice(startSkip(t)))) return "W2";
	if (literal === "bash" && next && !next.expanded && next.text === "-c") return "W3";
	return null;
}

const WHAT: Record<"W1" | "W2" | "W3", string> = { W1: "sandbox-exec", W2: "a Seatbelt -p profile", W3: "/bin/bash -c" };

/** Form 1: the command is the fence's six-word wrapper shape; `inner` is what it runs. */
export const copiedWrapperReason = (inner: string) =>
	`P-11 row 18 refused this: the command you typed starts with the M4b OS fence's own wrapper (sandbox-exec, its -p profile and /bin/bash -c). The fence adds that wrapper itself; your earlier bash calls show it only because OMP records the fence's revision as the call's arguments. Resend the bare command: ${inner}`;

/** Form 2: every other W1-W3 match. */
export const typedWrapperReason = (match: "W1" | "W2" | "W3") =>
	`P-11 row 18 refused this: the command you typed starts with ${WHAT[match]}. The fence runs every bash call under its own Seatbelt profile, and a wrapper or profile of your own is not accepted. Resend the bare command, without sandbox-exec, a -p profile or /bin/bash -c.`;

/** Row 18 at the tool call. */
export function checkTypedWrapper(call: ToolCall): Refusal {
	if (call.toolName !== "bash") return null;
	const t = String(call.input.command ?? "");
	const match = typedWrapperMatch(t);
	if (!match) return null;
	const copied = copiedWrapper(t);
	return { block: true, reason: copied ? copiedWrapperReason(copied.command) : typedWrapperReason(match) };
}
