// A POSIX-shell parser for the tool-call rows (6 reserved, 8 push, 10 raw ledger). It turns a
// command string into simple commands whose words have quoting removed and expansions applied,
// so a gate matches what the shell would run, not how it was spelled (astra review B1: `rm '-rf'`
// and `git "reset" --hard` were read as different commands from `rm -rf` and `git reset --hard`).
//
// What it models: single, double and ANSI-C quoting; backslash escapes and line continuations;
// `;` `&` `&&` `||` `|` `|&` and newlines; `( … )` subshells and `{ … }` groups; `case … esac`
// (every arm's commands, since which pattern matches is not known); `$(…)`, backticks
// and `<(…)`/`>(…)` (parsed as commands in their own right, their value unknown); `$VAR`/`${VAR}`
// from assignments earlier in the same command, then the session environment; `~`; brace
// expansion; redirections, heredocs (with their bodies) and herestrings; `cd` for the directory
// later commands run in. A word whose value cannot be known (a substitution, an unknown variable)
// is marked `opaque`; the rows decide what an opaque word means for them (usually: refuse).
// Anything the parser cannot read (an unterminated quote or substitution) is a `failure`, and the
// rows fail closed on failures.
import { resolve as resolvePath } from "node:path";

export interface Word {
	/** The value after quote removal and expansion; opaque parts contribute nothing. */
	text: string;
	/** Part of the value is unknown at gate time (substitution, unknown variable, `$@`, …). */
	opaque: boolean;
	/**
	 * An unquoted glob character (`*`, `?`, `[…]`) the shell expands against the filesystem when the
	 * command runs, so `text` is a pattern, not the value (astra review round 2, R2-B1: `/bin/r[m]`).
	 */
	glob?: boolean;
	/**
	 * The word's spelling carries an expansion (`$VAR`, `${…}`, `$(…)`, backticks, `$'…'`, brace
	 * expansion), known or not: it is not fully literal. The inverted default (M4 fix round 3) models
	 * only literal spellings for a command name and a `git -C` path.
	 */
	expanded?: boolean;
	/**
	 * Where the word sits in the source, `[start, end)`, for a caller that masks a word in the raw
	 * text (row 6's data words, PLAN wl-mupzpidbb3ksg0 § 1). Set only when `parseShell` is called with
	 * `spans: true`, on words of that string and of `( … )`/`$( … )` inside it; never on a backtick or
	 * heredoc body, never on a word brace expansion or field splitting produced, never on an opaque
	 * word. Offsets index the source after `\r\n`/`\r` became `\n`: they index the caller's string
	 * only when it has no CR.
	 */
	span?: [number, number];
}

export interface Redirect {
	/** `>`, `>>`, `>|`, `&>`, `&>>`, `<`, `<>`, `<<`, `<<-`, `<<<`, `>&`, `<&`. */
	op: string;
	/** The file (or fd) word; null for a heredoc. */
	target: Word | null;
	/** Heredoc or herestring text. */
	body: string | null;
	/** The body contains expansions whose value is unknown. */
	bodyOpaque: boolean;
}

export interface SimpleCommand {
	words: Word[];
	redirects: Redirect[];
	/** Directory the command runs in (after earlier `cd`s). */
	dir: string;
	/** False once a `cd` to an unknown directory ran before this command. */
	dirKnown: boolean;
	/** The command whose stdout feeds this one's stdin, in a pipeline. */
	stdinFrom: SimpleCommand | null;
	/** Parsed at the top level of the source string (not inside `( … )`, `$( … )`, backticks or a heredoc). */
	top: boolean;
}

export interface ParseResult {
	commands: SimpleCommand[];
	failures: string[];
	/** List operators at the top level, in order (`;` `&&` `||` `|` `&` newline, and `(` for a subshell). */
	ops: string[];
	/** Keywords dropped from command position at the top level (`!`, `if`, `{`, …). */
	keywords: string[];
}

export interface ParseOptions {
	cwd: string;
	env: Record<string, string | undefined>;
	/** Record each word's `span` (see Word.span). Only the top-level parse of a command string the caller holds opts in. */
	spans?: boolean;
}

const OPAQUE = Symbol("opaque");
/** A piece of a word: `q` 0 = unquoted literal, 1 = quoted or escaped, 2 = unquoted expansion result. */
interface Seg {
	s: string;
	q: 0 | 1 | 2;
}
type Part = Seg | typeof OPAQUE;
/** One character of a word: `active` = unquoted (glob characters work), `split` = from an unquoted expansion (IFS splits it). */
interface Ch {
	c: string;
	active: boolean;
	split?: boolean;
}

/**
 * Does the word carry an unquoted glob: `*`, `?`, or a `[` closed by a later `]`?
 * Sources, fetched in M4 fix round 4: POSIX § 2.14 Pattern Matching Notation
 * (https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html) and the bash manual,
 * Pattern Matching (https://www.gnu.org/software/bash/manual/bash.html: "If the first character
 * following the [ is a ‘!’ or a ‘^’ then any character not within the range matches").
 * The gate never evaluates a match; it only flags the word, and every caller treats a flagged word
 * as unknown. Deviations, each toward flagging more: a `[` counts whatever sits inside it, so `[!x]`,
 * `[^x]` and character classes are all flagged alike, and `[ab` with no `]` is not a glob (as in
 * bash). Not modeled here: extglob `@( ) !( ) ?( ) *( ) +( )`, refused as unreadable by the parser
 * instead; `dotglob`, `nullglob`, `failglob`, `nocaseglob` and `globstar`, which change only what a
 * flagged word would match.
 */
function hasGlob(chars: Ch[]): boolean {
	for (let k = 0; k < chars.length; k++) {
		const ch = chars[k]!;
		if (!ch.active) continue;
		if (ch.c === "*" || ch.c === "?") return true;
		if (ch.c === "[" && chars.slice(k + 2).some((x) => x.c === "]")) return true;
	}
	return false;
}

/**
 * POSIX field splitting of one word's characters on IFS (only characters from an unquoted expansion
 * split). IFS whitespace runs collapse and trim; each other IFS character ends a field, empty or not.
 * Sources, fetched in M4 fix round 4: POSIX § 2.6.5 Field Splitting ("If the IFS variable is set and
 * has an empty string as its value, no field splitting shall occur"; unset IFS splits as
 * <space><tab><newline>) and the bash manual, Word Splitting ("If IFS is unset, word splitting
 * behaves as if its value were <space><tab><newline>"; "Space, tab, and newline are always
 * considered IFS whitespace"). The caller handles unset, empty and unknown IFS (an IFS the gate
 * cannot read makes the word opaque). Deviation: "IFS whitespace" here is JavaScript `\s`, which also
 * covers `\v`, `\f` and Unicode spaces; bash counts space, tab, newline and the locale's space class.
 * The two differ only for an IFS that contains one of those extra characters.
 */
function splitFields(chars: Ch[], ifs: string, emptyQuoted: boolean): Word[] {
	const fields: Ch[][] = [];
	let cur: Ch[] = [];
	let has = false;
	let afterWs = false;
	for (const ch of chars) {
		if (ch.split && ifs.includes(ch.c)) {
			if (/\s/.test(ch.c)) {
				if (has) fields.push(cur);
				cur = [];
				has = false;
				afterWs = true;
			} else {
				if (has || !afterWs) fields.push(cur);
				cur = [];
				has = false;
				afterWs = false;
			}
			continue;
		}
		cur.push(ch);
		has = true;
		afterWs = false;
	}
	if (has) fields.push(cur);
	if (fields.length === 0 && emptyQuoted) fields.push([]);
	return fields.map((f) => ({ text: f.map((x) => x.c).join(""), opaque: false, glob: hasGlob(f) }));
}

const DEFAULT_IFS = " \t\n";

const IS_BLANK = (c: string | undefined): boolean => c === " " || c === "\t" || c === "\r";
const ENDS_WORD = (c: string | undefined): boolean => c === undefined || IS_BLANK(c) || c === "\n" || ";&|<>()".includes(c);
/** The terminator of a `case` arm at `i`: `;;`, `;&` or `;;&` (bash; the last two fall through), else null. */
const ARM_END = (src: string, i: number): string | null => (src.startsWith(";;&", i) ? ";;&" : src.startsWith(";;", i) || src.startsWith(";&", i) ? src.slice(i, i + 2) : null);

/** Shell keywords that are not commands: dropped from command position. */
const KEYWORDS: Record<string, true> = { if: true, then: true, else: true, elif: true, fi: true, do: true, done: true, while: true, until: true, "!": true, "{": true, "}": true, "[[": true, time: true };

interface PendingHeredoc {
	redirect: Redirect;
	delim: string;
	expand: boolean;
	stripTabs: boolean;
}

class Parser {
	i = 0;
	readonly commands: SimpleCommand[];
	readonly failures: string[];
	readonly ops: string[] = [];
	readonly keywords: string[] = [];
	/** This parser reads the top level of the source (no sink: not a nested or sub parse). */
	readonly top: boolean;
	dir: string;
	dirKnown = true;
	private pending: PendingHeredoc[] = [];

	constructor(
		readonly src: string,
		readonly opts: ParseOptions,
		readonly vars: Map<string, string | null>,
		sink?: { commands: SimpleCommand[]; failures: string[] },
		dir?: { dir: string; known: boolean },
		/** Record word spans: set by parseShell from `opts.spans`, kept by `nested`, never by a `sub` or heredoc parser. */
		readonly spans = false,
	) {
		this.top = sink === undefined;
		this.commands = sink?.commands ?? [];
		this.failures = sink?.failures ?? [];
		this.dir = dir?.dir ?? opts.cwd;
		this.dirKnown = dir?.known ?? true;
	}

	private op(token: string): void {
		if (this.top) this.ops.push(token);
	}

	private get ch(): string | undefined {
		return this.src[this.i];
	}

	private skipBlanks(): void {
		for (;;) {
			if (IS_BLANK(this.ch)) this.i++;
			else if (this.ch === "\\" && this.src[this.i + 1] === "\n") this.i += 2;
			else return;
		}
	}

	/** Blanks, newlines and comments: where a `case` allows a line break (before `in`, before a pattern). */
	private skipLines(): void {
		for (;;) {
			this.skipBlanks();
			if (this.ch === "\n") this.i++;
			else if (this.ch === "#") while (this.ch !== undefined && this.ch !== "\n") this.i++;
			else return;
		}
	}

	/** An unquoted `kw` starts at `i` and ends there as a word (`esac;` yes, `esacx` and `"esac"` no). */
	private atKeyword(kw: string): boolean {
		return this.src.startsWith(kw, this.i) && ENDS_WORD(this.src[this.i + kw.length]);
	}

	/** A nested parser over the same source (subshell, `$(…)`), sharing output, with its own directory scope. */
	private nested(stop: ")" | null): void {
		const p = new Parser(this.src, this.opts, this.vars, this, { dir: this.dir, known: this.dirKnown }, this.spans);
		p.i = this.i;
		p.list(stop);
		this.i = p.i;
	}

	/** Parse a separate string (backtick body, heredoc, `eval`) into the same output. */
	private sub(text: string): void {
		const p = new Parser(text, this.opts, this.vars, this, { dir: this.dir, known: this.dirKnown });
		p.list(null);
	}

	/** `stop`: `)` closes a subshell or `$( … )` (consumed); `;;` ends a `case` arm at its terminator or at `esac` (left for caseCompound). */
	list(stop: ")" | ";;" | null): void {
		let prev: SimpleCommand | null = null;
		let piped = false;
		for (;;) {
			this.skipBlanks();
			const c = this.ch;
			if (c === undefined) {
				if (stop) this.failures.push(`unterminated ${stop === ")" ? "( … ) or $( … )" : "case … esac"}`);
				this.readHeredocs();
				return;
			}
			if (stop === ")" && c === stop) {
				this.i++;
				return;
			}
			if (stop === ";;" && (ARM_END(this.src, this.i) !== null || this.atKeyword("esac"))) return;
			if (c === "#") {
				while (this.ch !== undefined && this.ch !== "\n") this.i++;
				continue;
			}
			if (c === "\n") {
				this.i++;
				this.op("\n");
				this.readHeredocs();
				prev = null;
				piped = false;
				continue;
			}
			if (c === "|") {
				const orOp = this.src[this.i + 1] === "|";
				const n = orOp || this.src[this.i + 1] === "&" ? 2 : 1;
				this.op(this.src.slice(this.i, this.i + n));
				this.i += n;
				piped = !orOp;
				continue;
			}
			if (c === "&" && this.src[this.i + 1] !== ">") {
				const n = this.src[this.i + 1] === "&" ? 2 : 1;
				this.op(this.src.slice(this.i, this.i + n));
				this.i += n;
				piped = false;
				continue;
			}
			if (c === ";") {
				const n = this.src[this.i + 1] === ";" || this.src[this.i + 1] === "&" ? 2 : 1;
				this.op(this.src.slice(this.i, this.i + n));
				this.i += n;
				piped = false;
				continue;
			}
			if (c === "(") {
				this.i++;
				this.op("(");
				this.nested(")");
				prev = null;
				piped = false;
				continue;
			}
			if (c === ")") {
				this.failures.push("unbalanced )");
				this.i++;
				continue;
			}
			const cmd = this.simple();
			if (cmd) {
				cmd.stdinFrom = piped ? prev : null;
				prev = cmd;
			}
			piped = false;
		}
	}

	/**
	 * `case WORD in [(]PATTERN[|PATTERN…]) LIST ;; … esac` (POSIX § 2.9.4.3, with bash's `;&` and `;;&`
	 * terminators), the `case` keyword consumed. The subject and the patterns are read and dropped:
	 * the gate does not know which arm the shell takes, so every arm's list is parsed as commands of
	 * this string and judged like any other. A `case` the tokenizer cannot read to `esac` (no `in`, a
	 * pattern with `(` in it such as an extglob, a pattern not closed by `)`, no `esac`) is a failure,
	 * so the rows refuse it (guard-replay drift triage, 2026-10-11: the `case` gap was the largest
	 * wrong NEW-CATCH group).
	 */
	private caseCompound(): void {
		this.skipBlanks();
		this.word();
		this.skipLines();
		if (!this.atKeyword("in")) {
			this.failures.push("case without `in`");
			return;
		}
		this.i += 2;
		for (;;) {
			this.skipLines();
			if (this.ch === undefined) {
				this.failures.push("unterminated case … esac");
				return;
			}
			if (this.atKeyword("esac")) {
				this.i += 4;
				if (this.top) this.keywords.push("esac");
				return;
			}
			if (this.ch === "(") this.i++;
			for (;;) {
				this.skipBlanks();
				const start = this.i;
				this.word();
				if (this.i === start) {
					this.failures.push("case pattern the gate cannot read");
					return;
				}
				this.skipBlanks();
				if (this.ch === "|") {
					this.i++;
					continue;
				}
				if (this.ch === ")") {
					this.i++;
					break;
				}
				this.failures.push("case pattern not closed by )");
				return;
			}
			this.list(";;");
			if (this.ch === undefined) return; // the list recorded the missing esac
			const end = ARM_END(this.src, this.i);
			if (end !== null) {
				this.op(end);
				this.i += end.length;
			}
		}
	}

	private simple(): SimpleCommand | null {
		const words: Word[] = [];
		const redirects: Redirect[] = [];
		for (;;) {
			this.skipBlanks();
			const c = this.ch;
			if (c === undefined || c === "\n" || c === ";" || c === "|" || c === ")" || (c === "&" && this.src[this.i + 1] !== ">")) break;
			// `case` in command position, after any keywords (`do case …`, `then case …`, `{ case …`).
			if (redirects.length === 0 && this.atKeyword("case") && words.every((w) => !w.opaque && !w.glob && KEYWORDS[w.text])) {
				if (this.top) this.keywords.push(...words.map((w) => w.text), "case");
				this.i += 4;
				this.caseCompound();
				return null;
			}
			if (c === "#") {
				// a `#` at the start of a word begins a comment to end of line
				while (this.ch !== undefined && this.ch !== "\n") this.i++;
				break;
			}
			if (c === "(") {
				// `@(…)`, `!(…)`, `?(…)`, `*(…)`, `+(…)` directly after a word character are extglob
				// patterns once an earlier line ran `shopt -s extglob` (live-tested, bash 3.2.57: the
				// same-line form is a syntax error, the next-line form matches files). The gate does
				// not evaluate extended patterns, so the command is unreadable.
				if ("@!?*+".includes(this.src[this.i - 1] ?? " ")) this.failures.push(`extended glob pattern ${this.src[this.i - 1]}( … )`);
				// `f() { … }`, `a=(1 2)`: the parenthesised part is parsed as commands, never as words.
				this.i++;
				this.op("(");
				this.nested(")");
				continue;
			}
			if ((c === "<" || c === ">") && this.src[this.i + 1] === "(") {
				// process substitution: a command whose value (a /dev/fd path) is unknown
				this.i += 2;
				this.nested(")");
				words.push({ text: "", opaque: true });
				continue;
			}
			const redir = /^(\d*)(&>>|&>|<<<|<<-|<<|<>|>>|>\||>&|<&|>|<)/.exec(this.src.slice(this.i));
			if (redir) {
				this.i += redir[0].length;
				this.redirect(redir[2]!, redirects);
				continue;
			}
			words.push(...this.word());
		}
		// Drop keywords in command position (`if git reset --hard; then`, `{ … }`).
		while (words.length && !words[0]!.opaque && !words[0]!.glob && KEYWORDS[words[0]!.text]) {
			if (this.top) this.keywords.push(words[0]!.text);
			words.shift();
		}
		if (words.length === 0 && redirects.length === 0) return null;
		const cmd: SimpleCommand = { words, redirects, dir: this.dir, dirKnown: this.dirKnown, stdinFrom: null, top: this.top };
		this.effects(cmd);
		this.commands.push(cmd);
		return cmd;
	}

	/** Variable assignments and `cd`: state later commands in the same string see. */
	private effects(cmd: SimpleCommand): void {
		const w = cmd.words;
		const assign = (word: Word): void => {
			const m = /^([A-Za-z_]\w*)=/.exec(word.text);
			if (m) this.vars.set(m[1]!, word.opaque ? null : word.text.slice(m[0].length));
		};
		let k = 0;
		while (k < w.length && /^[A-Za-z_]\w*=/.test(w[k]!.text)) k++;
		if (k === w.length) {
			for (const word of w) assign(word);
			return;
		}
		const head = w[k]!;
		if (head.opaque) return;
		const rest = w.slice(k + 1);
		switch (head.text) {
			case "export":
			case "declare":
			case "local":
			case "readonly":
			case "typeset":
				for (const word of rest) assign(word);
				return;
			case "unset":
				for (const word of rest) this.vars.set(word.text, null);
				return;
			case "read":
			case "mapfile":
			case "readarray":
				for (const word of rest) if (!word.text.startsWith("-")) this.vars.set(word.text, null);
				return;
			case "printf":
				// `printf -v NAME fmt …` assigns NAME a value the gate does not compute.
				for (let j = 0; j < rest.length; j++) {
					const t = rest[j]!.text;
					if (t === "-v" && rest[j + 1]) this.vars.set(rest[j + 1]!.text, null);
					else if (/^-v[A-Za-z_]/.test(t)) this.vars.set(t.slice(2), null);
				}
				return;
			case "cd":
			case "pushd": {
				const arg = rest.find((x) => x.opaque || !x.text.startsWith("-"));
				if (!arg) {
					const home = this.opts.env.HOME;
					if (home) this.dir = home;
					else this.dirKnown = false;
				} else if (arg.opaque || arg.glob || arg.text === "-") this.dirKnown = false;
				else this.dir = resolvePath(this.dir, arg.text);
			}
		}
	}

	private redirect(op: string, into: Redirect[]): void {
		this.skipBlanks();
		if (op === "<<" || op === "<<-") {
			const start = this.i;
			const [delimWord] = this.word();
			const raw = this.src.slice(start, this.i);
			const r: Redirect = { op, target: null, body: null, bodyOpaque: false };
			into.push(r);
			this.pending.push({ redirect: r, delim: delimWord?.text ?? "", expand: !/['"\\]/.test(raw), stripTabs: op === "<<-" });
			return;
		}
		const words = this.word();
		const target = words[0] ?? { text: "", opaque: true };
		if (op === "<<<") {
			into.push({ op, target: null, body: target.text, bodyOpaque: target.opaque });
			return;
		}
		into.push({ op, target, body: null, bodyOpaque: false });
	}

	/** Heredoc bodies start on the line after the operator (called at each newline). */
	private readHeredocs(): void {
		const pending = this.pending;
		this.pending = [];
		for (const h of pending) {
			const lines: string[] = [];
			let found = false;
			while (this.i < this.src.length) {
				const nl = this.src.indexOf("\n", this.i);
				const end = nl < 0 ? this.src.length : nl;
				let line = this.src.slice(this.i, end);
				this.i = nl < 0 ? end : end + 1;
				if (h.stripTabs) line = line.replace(/^\t+/, "");
				if (line === h.delim) {
					found = true;
					break;
				}
				lines.push(line);
			}
			// bash runs an unterminated heredoc to end of input (with a warning): so does the analysis.
			void found;
			const body = lines.join("\n");
			h.redirect.body = body;
			if (h.expand) {
				const p = new Parser(body, this.opts, this.vars, this, { dir: this.dir, known: this.dirKnown });
				h.redirect.bodyOpaque = p.expansionsOnly();
			}
		}
	}

	/** Walk text as the inside of an unterminated double-quoted string; true if any expansion is unknown. */
	expansionsOnly(): boolean {
		const parts: Part[] = [];
		this.doubleQuoted(parts, false);
		return parts.includes(OPAQUE);
	}

	/** One shell word, brace-expanded and field-split (may yield several words, or none for an empty unquoted expansion). */
	private word(): Word[] {
		const before = this.sawExpansion;
		this.sawExpansion = false;
		const out = this.wordParts();
		if (this.sawExpansion) for (const w of out) w.expanded = true;
		this.sawExpansion = before;
		return out;
	}

	/** Set while reading one word when its spelling carries an expansion or ANSI-C quoting. */
	private sawExpansion = false;

	private wordParts(): Word[] {
		const parts: Part[] = [];
		let quoted = false;
		let braceable = true;
		const startLen = this.i;
		for (;;) {
			const c = this.ch;
			if (ENDS_WORD(c)) break;
			if (c === "\\") {
				if (this.src[this.i + 1] === "\n") {
					this.i += 2;
					continue;
				}
				if (this.i + 1 < this.src.length) parts.push({ s: this.src[this.i + 1]!, q: 1 });
				this.i += 2;
				braceable = false;
				continue;
			}
			if (c === "'") {
				const end = this.src.indexOf("'", this.i + 1);
				if (end < 0) {
					this.failures.push("unterminated ' quote");
					this.i = this.src.length;
					parts.push(OPAQUE);
					break;
				}
				parts.push({ s: this.src.slice(this.i + 1, end), q: 1 });
				this.i = end + 1;
				quoted = true;
				braceable = false;
				continue;
			}
			if (c === '"') {
				this.i++;
				parts.push({ s: "", q: 1 });
				if (!this.doubleQuoted(parts, true)) {
					this.failures.push('unterminated " quote');
					parts.push(OPAQUE);
					break;
				}
				quoted = true;
				braceable = false;
				continue;
			}
			if (c === "$" && this.src[this.i + 1] === "'") {
				this.sawExpansion = true;
				this.i += 2;
				parts.push({ s: this.ansiC(), q: 1 });
				quoted = true;
				braceable = false;
				continue;
			}
			if (c === "$" || c === "`") {
				const v = this.expansion();
				parts.push(v === OPAQUE ? OPAQUE : { s: v, q: 2 });
				braceable = false;
				continue;
			}
			if (c === "~" && this.i === startLen && (ENDS_WORD(this.src[this.i + 1]) || this.src[this.i + 1] === "/")) {
				const home = this.opts.env.HOME;
				parts.push(home === undefined ? OPAQUE : { s: home, q: 1 });
				this.i++;
				continue;
			}
			parts.push({ s: c!, q: 0 });
			this.i++;
		}
		const opaque = parts.includes(OPAQUE);
		const segs = parts.filter((p): p is Seg => p !== OPAQUE);
		const text = segs.map((p) => p.s).join("");
		if (!quoted && !opaque && text === "" && parts.length > 0) return [];
		if (braceable && !quoted && !opaque && /\{[^{}]*,[^{}]*\}/.test(text)) {
			return braceExpand(text).map((t) => ({ text: t, opaque: false, expanded: true, glob: hasGlob([...t].map((ch) => ({ c: ch, active: true }))) }));
		}
		// An assignment word (`x=$y`) is neither field-split nor globbed.
		let lead = "";
		for (const p of segs) {
			if (p.q !== 0) break;
			lead += p.s;
		}
		const assignment = /^[A-Za-z_]\w*=/.test(lead);
		const chars: Ch[] = [];
		let emptyQuoted = false;
		for (const p of segs) {
			if (p.q === 1 && p.s === "") emptyQuoted = true;
			for (const ch of p.s) chars.push({ c: ch, active: p.q !== 1 && !assignment, split: p.q === 2 && !assignment });
		}
		if (opaque) return [{ text, opaque: true, glob: hasGlob(chars) }];
		const ifs: string | null = this.vars.has("IFS") ? (this.vars.get("IFS") ?? null) : DEFAULT_IFS;
		const splittable = chars.some((ch) => ch.split);
		// IFS set to a value the gate does not know: an unquoted expansion splits in unknown places.
		if (splittable && ifs === null) return [{ text, opaque: true, glob: hasGlob(chars) }];
		if (ifs === null || ifs === "" || !chars.some((ch) => ch.split && ifs.includes(ch.c))) {
			const w: Word = { text, opaque: false, glob: hasGlob(chars) };
			if (this.spans) w.span = [startLen, this.i];
			return [w];
		}
		return splitFields(chars, ifs, emptyQuoted);
	}

	/** Inside "…" (opening quote consumed). Returns false when the closing quote is missing (and `closing`). */
	private doubleQuoted(parts: Part[], closing: boolean): boolean {
		for (;;) {
			const c = this.ch;
			if (c === undefined) return !closing;
			if (closing && c === '"') {
				this.i++;
				return true;
			}
			if (c === "\\") {
				const n = this.src[this.i + 1];
				if (n === "\n") this.i += 2;
				else if (n !== undefined && "$`\"\\".includes(n)) {
					parts.push({ s: n, q: 1 });
					this.i += 2;
				} else {
					parts.push({ s: "\\", q: 1 });
					this.i++;
				}
				continue;
			}
			if (c === "$" || c === "`") {
				const v = this.expansion();
				parts.push(v === OPAQUE ? OPAQUE : { s: v, q: 1 });
				continue;
			}
			parts.push({ s: c, q: 1 });
			this.i++;
		}
	}

	/** `$…` or a backtick substitution at this.i. Returns the value, or OPAQUE. */
	private expansion(): string | typeof OPAQUE {
		const prevExpansion = this.sawExpansion;
		this.sawExpansion = true;
		const c = this.ch;
		if (c === "`") {
			let j = this.i + 1;
			let body = "";
			while (j < this.src.length && this.src[j] !== "`") {
				if (this.src[j] === "\\" && j + 1 < this.src.length && "`$\\".includes(this.src[j + 1]!)) {
					body += this.src[j + 1];
					j += 2;
				} else body += this.src[j++];
			}
			if (j >= this.src.length) this.failures.push("unterminated ` substitution");
			this.i = Math.min(j + 1, this.src.length);
			this.sub(body);
			return OPAQUE;
		}
		const n = this.src[this.i + 1];
		if (n === "(" && this.src[this.i + 2] === "(") {
			// arithmetic: skip to the matching `))`
			let depth = 0;
			let j = this.i + 1;
			for (; j < this.src.length; j++) {
				if (this.src[j] === "(") depth++;
				else if (this.src[j] === ")" && --depth === 0) break;
			}
			if (j >= this.src.length) this.failures.push("unterminated $(( … ))");
			this.i = Math.min(j + 1, this.src.length);
			return OPAQUE;
		}
		if (n === "(") {
			this.i += 2;
			this.nested(")");
			return OPAQUE;
		}
		if (n === "{") {
			let depth = 0;
			let j = this.i + 1;
			for (; j < this.src.length; j++) {
				if (this.src[j] === "{") depth++;
				else if (this.src[j] === "}" && --depth === 0) break;
			}
			if (j >= this.src.length) {
				this.failures.push("unterminated ${ … }");
				this.i = this.src.length;
				return OPAQUE;
			}
			const inner = this.src.slice(this.i + 2, j);
			this.i = j + 1;
			return /^[A-Za-z_]\w*$/.test(inner) ? this.lookup(inner) : OPAQUE;
		}
		if (n !== undefined && /[A-Za-z_]/.test(n)) {
			const m = /^[A-Za-z_]\w*/.exec(this.src.slice(this.i + 1))!;
			this.i += 1 + m[0].length;
			return this.lookup(m[0]);
		}
		if (n !== undefined && /[0-9@*#?$!-]/.test(n)) {
			this.i += 2;
			return OPAQUE;
		}
		this.i++;
		this.sawExpansion = prevExpansion; // a lone `$` is a literal dollar sign
		return "$";
	}

	private lookup(name: string): string | typeof OPAQUE {
		if (this.vars.has(name)) return this.vars.get(name) ?? OPAQUE;
		const v = this.opts.env[name];
		return v === undefined ? OPAQUE : v;
	}

	/** Body of $'…' (opening consumed). */
	private ansiC(): string {
		let out = "";
		while (this.i < this.src.length && this.ch !== "'") {
			const c = this.ch!;
			if (c !== "\\") {
				out += c;
				this.i++;
				continue;
			}
			const n = this.src[this.i + 1] ?? "";
			const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", "'": "'", '"': '"', a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v" };
			if (simple[n] !== undefined) {
				out += simple[n];
				this.i += 2;
				continue;
			}
			const hex = /^x([0-9a-fA-F]{1,2})/.exec(this.src.slice(this.i + 1));
			const oct = /^([0-7]{1,3})/.exec(this.src.slice(this.i + 1));
			const uni = /^[uU]([0-9a-fA-F]{1,8})/.exec(this.src.slice(this.i + 1));
			if (hex) {
				out += String.fromCharCode(parseInt(hex[1]!, 16));
				this.i += 1 + hex[0].length;
			} else if (uni) {
				out += String.fromCodePoint(parseInt(uni[1]!, 16));
				this.i += 1 + uni[0].length;
			} else if (oct) {
				out += String.fromCharCode(parseInt(oct[1]!, 8));
				this.i += 1 + oct[0].length;
			} else {
				out += `\\${n}`;
				this.i += 2;
			}
		}
		if (this.ch !== "'") this.failures.push("unterminated $' quote");
		this.i++;
		return out;
	}
}

/** Bash brace expansion of one unquoted word (`-{r,f}` → `-r -f`, `a{1,2}b` → `a1b a2b`). */
export function braceExpand(text: string): string[] {
	const m = /\{([^{}]*,[^{}]*)\}/.exec(text);
	if (!m) return [text];
	const pre = text.slice(0, m.index);
	const post = text.slice(m.index + m[0].length);
	return m[1]!.split(",").flatMap((alt) => braceExpand(pre + alt + post));
}

/** Parse `src` into simple commands. `vars` carries assignments across nested parses of one command. */
export function parseShell(src: string, opts: ParseOptions, vars: Map<string, string | null> = new Map()): ParseResult {
	const p = new Parser(src.replace(/\r\n?/g, "\n"), opts, vars, undefined, undefined, opts.spans === true);
	p.list(null);
	return { commands: p.commands, failures: p.failures, ops: p.ops, keywords: p.keywords };
}

/** Single-quote a value for re-parsing (`'it'\''s'`). */
export function shellQuote(s: string): string {
	return /^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}
