// What a shell command string runs, as the tool-call rows (6, 8, 10) judge it: every simple command
// with wrappers stripped (`env`, `sudo`, `command`, `nohup`, `time`, `timeout`, …, and `env -S`'s
// split string) and every command reached through another — `sh -c`, `eval`, a heredoc or
// herestring fed to a shell, `echo … | sh` and `printf … | sh` (the producer's output computed the
// way printf formats it), `xargs`, `find -exec`,
// a script run by path or `source`, `$(…)`. Inline interpreter code (`bun -e`, `python -c`,
// `perl -ne`, a heredoc or pipe into an interpreter, …) is returned as code for the eval checks.
// git aliases are not expanded: `-c alias.*` and a subcommand that is not git's own are refused as
// unmodeled by gitUnmodeled (M4 fix round 4, B1), so nothing here looks one up.
// What the gate cannot see (a shell reading a pipe from an unknown producer, `sh -c "$X"`, a command
// name that is a glob, a script the same command writes first, a parse failure) is returned as
// `blind`, and the rows fail closed on it (astra review B1, B2; round 2 R2-B1, R2-B2).
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { insideDotGit } from "./git-model";
import { type ParseOptions, parseShell, type Redirect, type SimpleCommand, type Word } from "./shell-parse";

export interface Exec {
	/** argv after wrappers, quote removal and expansion. `argv[0]` is the command. */
	argv: Word[];
	redirects: Redirect[];
	dir: string;
	dirKnown: boolean;
	/** The simple command this came from (for pipes). */
	source: SimpleCommand;
	/** What `unwrap` stripped: command-local `NAME=value` words (and `env`'s), and each wrapper with its flags. */
	mods: Mods;
}

/** What wraps a command: its command-local assignments and wrapper commands (`env -u X`, `sudo -u u`, `command -v`). */
export interface Mods {
	assigns: Word[];
	wrappers: string[];
}

export const noMods = (): Mods => ({ assigns: [], wrappers: [] });

/** Language families of inline interpreter code. */
export type CodeFamily = "js" | "python" | "perl" | "ruby" | "php" | "osascript";

export interface InlineCode {
	/** The interpreter (`bun`, `node`, `python3`, `perl`, …). */
	lang: string;
	family: CodeFamily;
	text: string;
	dir: string;
}

export interface Expansion {
	commands: Exec[];
	code: InlineCode[];
	/** Reasons some of what runs is invisible to the gate. Non-empty = fail closed. */
	blind: string[];
	/**
	 * Every variable the command string assigns anywhere (a prefix `NAME=v cmd`, a bare `NAME=v;`,
	 * `export`/`declare`/`local`/`readonly`/`typeset`, `env NAME=v`, `env -u NAME`), by name. An
	 * exported one reaches every later command's environment, so git overrides are judged on the
	 * whole string (M4 fix round 3, R3-B1).
	 */
	assigned: Map<string, Word>;
}

export const SHELLS: Record<string, true> = { bash: true, sh: true, zsh: true, ksh: true, dash: true, ash: true, fish: true };
/**
 * Wrappers that run their arguments as a command: how many leading operands they take after their
 * flags, and which of their flags take a separate value word. `env -S` is handled on its own: its
 * value is a command line env splits and runs (astra review round 2, R2-B1).
 */
const WRAPPERS: Record<string, { operands: number; valueFlags: RegExp }> = {
	command: { operands: 0, valueFlags: /^$/ },
	builtin: { operands: 0, valueFlags: /^$/ },
	exec: { operands: 0, valueFlags: /^-a$/ },
	nohup: { operands: 0, valueFlags: /^$/ },
	time: { operands: 0, valueFlags: /^-[fo]$/ },
	nice: { operands: 0, valueFlags: /^(-n|--adjustment)$/ },
	sudo: { operands: 0, valueFlags: /^(-[ugpCDhrtTUR]|--(user|group|prompt|close-from|chdir|host|role|type|command-timeout|other-user|chroot))$/ },
	doas: { operands: 0, valueFlags: /^-[uC]$/ },
	env: { operands: 0, valueFlags: /^(-[uCP]|--(unset|chdir))$/ },
	stdbuf: { operands: 0, valueFlags: /^-[ioe]$/ },
	caffeinate: { operands: 0, valueFlags: /^-[tw]$/ },
	timeout: { operands: 1, valueFlags: /^(-[sk]|--(signal|kill-after))$/ },
	ionice: { operands: 0, valueFlags: /^-[cnp]$/ },
	chronic: { operands: 0, valueFlags: /^$/ },
};

/** The code family an interpreter name runs, or null (`python3.12` → python, `nodejs` → js). */
export function interpreterFamily(name: string): CodeFamily | null {
	if (/^(node|nodejs|bun|deno)$/.test(name)) return "js";
	if (/^(python|pypy)[\d.]*$/.test(name)) return "python";
	if (/^perl[\d.]*$/.test(name)) return "perl";
	if (/^j?ruby[\d.]*$/.test(name)) return "ruby";
	if (/^php[\d.]*$/.test(name)) return "php";
	if (name === "osascript") return "osascript";
	return null;
}

/** Output-only commands: their arguments are text, never run, unless a consumer runs their output. */
export const OUTPUT_ONLY: Record<string, true> = { echo: true, printf: true };

/** Directories whose programs are the system's own: `/usr/bin/git` is `git` (astra review round 2 false positive). */
const SYSTEM_BIN = /^\/(?:usr\/(?:local\/)?)?s?bin\/[^/]+$|^\/opt\/homebrew\/bin\/[^/]+$/;

/**
 * git's own commands: an alias of the same name is ignored by git ("aliases that hide existing Git
 * commands are ignored", git-config(1) `alias.*`), so a subcommand in this set runs what it says. Any
 * other subcommand may be a configured alias or a `git-*` program on PATH, which the gate does not
 * read, so gitUnmodeled refuses it (M4 fix round 4, B1).
 * Source: `git --list-cmds=main` on git 2.50.1 (Apple Git-155), 170 names, plus `citool`, `gui` and
 * `instaweb`, which git ships but this install lacks (they need Tcl/Tk or a web server). Refresh: run
 * `git --list-cmds=main | sort` on the git a profile pins and replace the list; keep names git has
 * dropped, since an older git may still run them.
 */
const GIT_BUILTINS = new Set(
	(
		"add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore " +
		"check-mailmap check-ref-format checkout checkout--worker checkout-index cherry cherry-pick citool clean clone column " +
		"commit commit-graph commit-tree config count-objects credential credential-cache credential-cache--daemon " +
		"credential-osxkeychain credential-store daemon describe diagnose diff diff-files diff-index diff-pairs diff-tree " +
		"difftool difftool--helper fast-export fast-import fetch fetch-pack filter-branch fmt-merge-msg for-each-ref " +
		"for-each-repo format-patch fsck fsck-objects fsmonitor--daemon gc get-tar-commit-id grep gui gui--askpass hash-object " +
		"help hook http-backend http-fetch http-push imap-send index-pack init init-db instaweb interpret-trailers log ls-files " +
		"ls-remote ls-tree mailinfo mailsplit maintenance merge merge-base merge-file merge-index merge-octopus merge-one-file " +
		"merge-ours merge-recursive merge-recursive-ours merge-recursive-theirs merge-resolve merge-subtree merge-tree mergetool " +
		"mktag mktree multi-pack-index mv name-rev notes p4 pack-objects pack-redundant pack-refs patch-id pickaxe prune " +
		"prune-packed pull push quiltimport range-diff read-tree rebase receive-pack reflog refs remote remote-ext remote-fd " +
		"remote-ftp remote-ftps remote-http remote-https repack replace replay request-pull rerere reset restore rev-list " +
		"rev-parse revert rm send-email send-pack sh-i18n--envsubst shell shortlog show show-branch show-index show-ref " +
		"sparse-checkout stage stash status stripspace submodule submodule--helper subtree switch symbolic-ref tag unpack-file " +
		"unpack-objects update-index update-ref update-server-info upload-archive upload-archive--writer upload-pack var " +
		"verify-commit verify-pack verify-tag version web--browse whatchanged worktree write-tree"
	).split(" "),
);

const MAX_DEPTH = 4;
const MAX_SCRIPT_BYTES = 256 * 1024;

const OPAQUE_HEAD: Word[] = [{ text: "", opaque: true }];

/**
 * Strip leading `NAME=value` assignments and wrapper commands (with their flags). `split` turns an
 * `env -S` string into words (null when it cannot); without it an `env -S` makes the head opaque.
 */
export function unwrap(words: Word[], split: (s: string) => Word[] | null = () => null, mods: Mods = noMods()): Word[] {
	let w = words;
	for (let guard = 0; guard < 64; guard++) {
		let k = 0;
		while (k < w.length && !w[k]!.opaque && /^[A-Za-z_]\w*=/.test(w[k]!.text)) mods.assigns.push(w[k++]!);
		w = w.slice(k);
		const head = w[0];
		if (!head || head.opaque || head.glob) return w;
		const name = basename(head.text);
		const wrapper = WRAPPERS[name];
		if (!wrapper) return w;
		let i = 1;
		const flags: string[] = [];
		while (i < w.length && !w[i]!.opaque && w[i]!.text.startsWith("-") && w[i]!.text !== "-") {
			const flag = w[i]!.text;
			flags.push(flag);
			if (name === "env") {
				const s = envSplitString(flag);
				if (s) {
					const value = s.attached !== undefined ? { text: s.attached, opaque: false } : w[i + 1];
					if (!value || value.opaque) return OPAQUE_HEAD;
					const words2 = split(value.text);
					if (words2 === null) return OPAQUE_HEAD;
					// env splits the string into arguments in place, then keeps parsing options.
					w = [...w.slice(0, i), ...words2, ...w.slice(i + (s.attached !== undefined ? 1 : 2))];
					continue;
				}
			}
			i += wrapper.valueFlags.test(flag) ? 2 : 1;
			if (flag === "--") break;
		}
		// `env` takes assignments after its flags.
		if (name === "env") while (i < w.length && !w[i]!.opaque && /^[A-Za-z_]\w*=/.test(w[i]!.text)) mods.assigns.push(w[i++]!);
		mods.wrappers.push([name, ...flags].join(" "));
		w = w.slice(i + wrapper.operands);
	}
	return OPAQUE_HEAD;
}

/** An `env` flag that splits a string (`-S`, `-S'…'`, `-iS`, `--split-string[=…]`): its attached value, if any. */
function envSplitString(flag: string): { attached?: string } | null {
	if (flag === "--split-string") return {};
	if (flag.startsWith("--split-string=")) return { attached: flag.slice("--split-string=".length) };
	if (flag.startsWith("--") || !flag.startsWith("-")) return null;
	for (let k = 1; k < flag.length; k++) {
		const c = flag[k]!;
		if (c === "S") return k + 1 < flag.length ? { attached: flag.slice(k + 1) } : {};
		if ("uCP".includes(c)) return null; // takes the rest of the cluster (or the next word) as its value
	}
	return null;
}

function readScript(path: string): string | null {
	try {
		if (!existsSync(path)) return null;
		const st = statSync(path);
		if (!st.isFile() || st.size > MAX_SCRIPT_BYTES) return null;
		const body = readFileSync(path, "utf8");
		return body.includes("\0") ? null : body;
	} catch {
		return null;
	}
}

const joined = (words: Word[]): string => words.map((w) => w.text).join(" ");
const unknown = (w: Word | undefined): boolean => !w || w.opaque || w.glob === true;

/**
 * Backslash escapes as `echo -e` (and, with `bareOctal`, `printf %b`) read them; `\c` ends the
 * output. echo takes octal only as `\0NNN`; bash's `%b` also takes `\NNN`, one to three octal digits
 * starting 1-7 (astra-5 R5-B1; measured on /bin/bash 3.2.57: `\147it` → `git`, `\0147` → `g`,
 * `\1471` → `g1`, `\400` → a NUL byte, so a value keeps its low eight bits).
 */
function echoEscapes(s: string, bareOctal = false): { text: string; stop: boolean } {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const c = s[i]!;
		if (c !== "\\" || i + 1 >= s.length) {
			out += c;
			continue;
		}
		const n = s[i + 1]!;
		const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", a: "\x07", b: "\b", e: "\x1b", E: "\x1b", f: "\f", v: "\v" };
		if (n === "c") return { text: out, stop: true };
		if (simple[n] !== undefined) {
			out += simple[n];
			i++;
			continue;
		}
		const oct = /^0([0-7]{0,3})/.exec(s.slice(i + 1)) ?? (bareOctal ? /^()([1-7][0-7]{0,2})/.exec(s.slice(i + 1)) : null);
		const hex = /^x([0-9a-fA-F]{1,2})/.exec(s.slice(i + 1));
		if (oct) {
			const digits = oct[1] || oct[2] || "0";
			out += String.fromCharCode(parseInt(digits, 8) & 0xff);
			i += oct[0].length;
		} else if (hex) {
			out += String.fromCharCode(parseInt(hex[1]!, 16));
			i += hex[0].length;
		} else out += c;
	}
	return { text: out, stop: false };
}

/** Escapes in a printf format string (`\NNN` octal without the leading 0 as well). */
function formatEscapes(s: string): string {
	return s.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|.)/g, (m, e: string) => {
		if (/^[0-7]+$/.test(e)) return String.fromCharCode(parseInt(e, 8));
		if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
		if (e[0] === "u" && e.length > 1) return String.fromCodePoint(parseInt(e.slice(1), 16));
		const simple: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", a: "\x07", b: "\b", e: "\x1b", f: "\f", v: "\v", '"': '"', "'": "'" };
		return simple[e] ?? m;
	});
}

/**
 * What `printf FORMAT ARGS…` writes, as bash's printf computes it (the format reused while arguments
 * remain), or null for a conversion the gate does not evaluate: the caller fails closed.
 * Evaluated: `%s %b %c %d %i %o %u %x %X %%` with the `-` flag, `0` on integers, width (literal or
 * `*`), precision on `%s`/`%b`, and backslash escapes in the format. Not evaluated (null, fail
 * closed): `%q`, `%Q`, every float (`%f %e %g %a` and upper case), `%(…)T`, any other conversion
 * letter, the `+`, space and `#` flags, `0` on `%s %b %c`, precision on an integer conversion,
 * `%o %u %x %X` of a negative number, `%c` of a non-ASCII character, `\c` in the format, a width on
 * an empty or missing `%b` argument, and a format starting with `-` without `--`. Each was measured
 * against /bin/bash 3.2.57 in M4 fix round 4 printing something this function would not (`% d` 0 →
 * ` 0`, `%.3d` 5 → `005`, `%x` -1 → `ffffffffffffffff`, `%04s` 7 → `0007`, `a\cb` → `a\cb`,
 * `%4b` → nothing, `-Z` → an option error). One deviation remains: width counts UTF-16 units where
 * bash counts bytes, so a non-ASCII value gets more padding spaces here; the words are the same.
 * gates/test/printf-property.test.ts compares it against real `bash -c 'printf …'` over random
 * ASCII formats and arguments; it passed on five seeds.
 */
export function printfOutput(args: string[]): string | null {
	let a = args;
	if (a[0] === "--") a = a.slice(1);
	const fmt = a[0];
	// A format starting with `-` is read by printf as an option unless `--` came first.
	if (fmt === undefined || (a === args && fmt.startsWith("-"))) return null;
	const rest = a.slice(1);
	let idx = 0;
	let out = "";
	const next = (): string => rest[idx++] ?? "";
	const num = (s: string): number | null => {
		if (s === "") return 0;
		if (/^['"]/.test(s)) return s.codePointAt(1) ?? 0;
		const n = Number(s);
		return Number.isFinite(n) ? Math.trunc(n) : null;
	};
	for (let pass = 0; pass < 1000; pass++) {
		const before = idx;
		for (let i = 0; i < fmt.length; i++) {
			const c = fmt[i]!;
			if (c === "\\") {
				const m = /^\\([0-7]{1,3}|x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{1,4}|.)/.exec(fmt.slice(i));
				if (!m) {
					out += c;
					continue;
				}
				// `\c` in the format itself: bash 3.2 prints it literally; not evaluated.
				if (m[1] === "c") return null;
				out += formatEscapes(m[0]);
				i += m[0].length - 1;
				continue;
			}
			if (c !== "%") {
				out += c;
				continue;
			}
			const m = /^%([-+ #0]*)(\d+|\*)?(?:\.(\d+|\*)?)?([a-zA-Z%])/.exec(fmt.slice(i));
			if (!m) return null;
			// `+`, space and `#` change the printed text (`% d` 0 prints ` 0`, which can split a word);
			// the gate does not evaluate them.
			if (/[+ #]/.test(m[1]!)) return null;
			// `0` on a string conversion zero-pads it in bash 3.2 (`%04s` 7 → `0007`); not evaluated.
			if (m[1]!.includes("0") && "sbc".includes(m[4]!)) return null;
			i += m[0].length - 1;
			const conv = m[4]!;
			if (conv === "%") {
				out += "%";
				continue;
			}
			const width = m[2] === "*" ? num(next()) : m[2] ? Number(m[2]) : 0;
			const prec = m[3] === "*" ? num(next()) : m[3] !== undefined ? Number(m[3]) : null;
			if (width === null) return null;
			let v: string;
			if (conv === "s") v = next();
			else if (conv === "b") {
				// An empty or missing `%b` argument prints nothing in bash 3.2, width included; not evaluated.
				if ((rest[idx] ?? "") === "" && width !== 0) return null;
				const e = echoEscapes(next(), true);
				v = e.text;
				if (e.stop) return out + v;
			} else if (conv === "c") {
				v = next().slice(0, 1);
				if (v > "\u007f") return null;
			} else if ("diouxX".includes(conv)) {
				const n = num(next());
				if (n === null) return null;
				// Precision on an integer zero-pads, and unsigned conversions of a negative wrap to
				// 2^64; neither is evaluated.
				if (prec !== null || (n < 0 && conv !== "d" && conv !== "i")) return null;
				v = conv === "o" ? n.toString(8) : conv === "x" ? n.toString(16) : conv === "X" ? n.toString(16).toUpperCase() : String(n);
			} else return null;
			if (prec !== null && "sb".includes(conv)) v = v.slice(0, prec);
			const pad = Math.abs(width) - v.length;
			if (pad > 0) v = m[1]!.includes("-") || width < 0 ? v + " ".repeat(pad) : (m[1]!.includes("0") && !"sbc".includes(conv) ? "0" : " ").repeat(pad) + v;
			out += v;
		}
		if (idx === before || idx >= rest.length) break;
	}
	return out;
}

/**
 * What a short option letter does to the words after it, per interpreter family:
 * - `code`: its program text is the rest of the cluster, or else the next word;
 * - `valueNext`: it takes a value, the rest of the cluster or else the next word (not code);
 * - `valueAttached`: it takes a value only from the rest of its cluster, so the next word is free;
 * - `module`: a module runs (python `-m`), so the program is not read from stdin.
 * A letter not listed is a flag with no value. Sources: `node --help`, `bun --help`, `python3
 * --help`, perlrun(1), `ruby --help`, `php --help`, osascript(1).
 */
type OptRole = "code" | "valueNext" | "valueAttached" | "module";
const INTERPRETER_SHORT_OPTS: Record<CodeFamily, Record<string, OptRole>> = {
	js: {
		e: "code", // node/bun -e <script>
		p: "code", // -p <script>: evaluate and print
		r: "valueNext", // -r <module>: preload
		C: "valueNext", // -C <condition>: export conditions
	},
	python: {
		c: "code", // -c <command>
		W: "valueNext", // -W <warning filter>
		X: "valueNext", // -X <implementation option>
		Q: "valueNext", // -Q <division> (Python 2)
		m: "module", // -m <module>
	},
	perl: {
		e: "code", // -e <line>
		E: "code", // -E <line>, with optional features on
		I: "valueAttached", // -I<dir>: include path
		M: "valueAttached", // -M<module>: use module
		m: "valueAttached", // -m<module>: use module, no import
		i: "valueAttached", // -i[ext]: edit in place
		0: "valueAttached", // -0[octal]: record separator
		l: "valueAttached", // -l[octal]: line ending
		x: "valueAttached", // -x[dir]: skip leading garbage
		C: "valueAttached", // -C[number/list]: Unicode features
		d: "valueAttached", // -d[:mod]: debugger
		D: "valueAttached", // -D[number/list]: debugging flags
		V: "valueAttached", // -V[:configvar]: print config
	},
	ruby: {
		e: "code", // -e <line>
		r: "valueNext", // -r <library>
		I: "valueNext", // -I <directory>
		C: "valueNext", // -C <directory>: cd first
		E: "valueNext", // -E <ext:int>: encodings
		F: "valueNext", // -F <pattern>: split separator
		K: "valueAttached", // -K<kcode>
		W: "valueAttached", // -W[level]: warning level
		T: "valueAttached", // -T[level]: taint (old rubies)
		x: "valueAttached", // -x[directory]
		0: "valueAttached", // -0[octal]: record separator
		l: "valueAttached", // -l: line ending processing
		i: "valueAttached", // -i[extension]: edit in place
	},
	php: {
		r: "code", // -r <code>
		R: "code", // -R <code>: per input line
		B: "code", // -B <begin_code>
		E: "code", // -E <end_code>
		d: "valueNext", // -d foo[=bar]: ini entry
		c: "valueNext", // -c <path>: php.ini
		f: "valueNext", // -f <file>
		z: "valueNext", // -z <file>: Zend extension
	},
	osascript: {
		e: "code", // -e <statement>
		l: "valueNext", // -l <language>
		s: "valueNext", // -s <flags>: output style
	},
};

/** What an interpreter's argv runs as program text: inline code words, and whether it reads its program from stdin. */
interface InterpreterArgs {
	code: Word[];
	stdin: boolean;
	/** An argument the gate cannot read where it could be a code flag. */
	unknown: boolean;
}

function interpreterArgs(family: CodeFamily, name: string, args: Word[]): InterpreterArgs {
	const out: InterpreterArgs = { code: [], stdin: false, unknown: false };
	if (name === "deno") {
		if (args[0]?.text === "eval") {
			const code = args.slice(1).find((w) => unknown(w) || !w.text.startsWith("-"));
			if (!code || unknown(code)) out.unknown = true;
			else out.code.push(code);
		} else if (args[0]?.text === "run" && args.some((w) => w.text === "-")) out.stdin = true;
		return out;
	}
	const s = INTERPRETER_SHORT_OPTS[family];
	const longCode = family === "js" ? /^--(eval|print)$/ : /^$/;
	const longValue = /^--(require|import|loader|experimental-loader|conditions|preload|config|cwd|env-file|input-type|check-hash-based-pycs)$/;
	for (let i = 0; i < args.length; i++) {
		const w = args[i]!;
		if (unknown(w)) {
			out.unknown = true;
			return out;
		}
		const t = w.text;
		if (t === "-") {
			out.stdin = out.code.length === 0;
			return out;
		}
		if (t === "--") {
			if (out.code.length === 0 && i + 1 >= args.length) out.stdin = true;
			return out;
		}
		if (longCode.test(t)) {
			const code = args[++i];
			if (unknown(code)) out.unknown = true;
			else out.code.push(code!);
			continue;
		}
		if (family === "js" && /^--(eval|print)=/.test(t)) {
			out.code.push({ text: t.slice(t.indexOf("=") + 1), opaque: false });
			continue;
		}
		if (t.startsWith("--")) {
			if (longValue.test(t)) i++;
			continue;
		}
		if (t.startsWith("-")) {
			for (let k = 1; k < t.length; k++) {
				const c = t[k]!;
				const role = s[c];
				if (role === "code") {
					const attached = t.slice(k + 1);
					if (attached !== "") out.code.push({ text: attached, opaque: false });
					else {
						const code = args[++i];
						if (unknown(code)) out.unknown = true;
						else out.code.push(code!);
					}
					break;
				}
				if (role === "module") return out; // python -m: a module runs, not stdin
				if (role === "valueNext") {
					if (k + 1 >= t.length) i++;
					break;
				}
				if (role === "valueAttached") break;
			}
			// python's -c ends option parsing: what follows is the program's argv.
			if (family === "python" && out.code.length > 0) return out;
			continue;
		}
		// The first operand: a script (or bun subcommand) when there is no inline code, else the code's argv.
		return out;
	}
	if (out.code.length === 0) out.stdin = true;
	return out;
}

class Expander {
	readonly out: Expansion = { commands: [], code: [], blind: [], assigned: new Map() };
	/** Files the command writes (redirects, tee, cp/mv/ln/install destinations) before it runs a later script. */
	private readonly written = new Set<string>();
	private unknownWrite = false;

	constructor(readonly env: Record<string, string | undefined>) {}

	shell(src: string, dir: string, depth: number, vars?: Map<string, string | null>): void {
		if (depth > MAX_DEPTH) {
			this.out.blind.push(`commands nested more than ${MAX_DEPTH} levels deep`);
			return;
		}
		const opts: ParseOptions = { cwd: dir, env: this.env };
		const r = parseShell(src, opts, vars);
		for (const f of r.failures) this.out.blind.push(`the command could not be parsed (${f})`);
		for (const cmd of r.commands) {
			this.recordAssigns(cmd.words);
			const mods = noMods();
			this.command(cmd, this.unwrapAt(cmd.words, cmd.dir, mods), depth, mods);
		}
	}

	private unwrapAt(words: Word[], dir: string, mods: Mods = noMods()): Word[] {
		return unwrap(words, (s) => this.splitWords(s, dir), mods);
	}

	/** Statement-level assignments: `NAME=v;` and `export`/`declare`/`local`/`readonly`/`typeset NAME[=v]`. */
	private recordAssigns(words: Word[]): void {
		let k = 0;
		while (k < words.length && /^[A-Za-z_]\w*=/.test(words[k]!.text)) this.assign(words[k++]!);
		const head = words[k];
		if (!head || head.opaque || !/^(export|declare|local|readonly|typeset)$/.test(head.text)) return;
		for (const w of words.slice(k + 1)) if (/^[A-Za-z_]\w*(=|$)/.test(w.text)) this.assign(w);
	}

	private assign(w: Word): void {
		const eq = w.text.indexOf("=");
		this.out.assigned.set(eq < 0 ? w.text : w.text.slice(0, eq), w);
	}

	/** One command line's words, with no operators or redirects (an `env -S` string); null when it has any. */
	private splitWords(text: string, dir: string): Word[] | null {
		const r = parseShell(text, { cwd: dir, env: this.env });
		if (r.failures.length > 0 || r.commands.length > 1 || r.ops.length > 0 || r.keywords.length > 0) return null;
		const c = r.commands[0];
		if (!c) return [];
		return c.redirects.length > 0 ? null : c.words;
	}

	private script(path: string, via: string, depth: number): void {
		if (this.written.has(path) || this.unknownWrite) {
			this.out.blind.push(`${via} runs ${path}, which this same command may write before it runs`);
			return;
		}
		if (!existsSync(path)) {
			this.out.blind.push(`${via} runs ${path}, which does not exist when the gate reads it`);
			return;
		}
		const body = readScript(path);
		if (body !== null) this.shell(body, resolve(path, ".."), depth + 1);
		else this.out.blind.push(`${via} runs ${path}, which could not be read as a script`);
	}

	/** A file read as program text for an interpreter; null (and blind) when it cannot be read. */
	private codeFile(path: string, via: string): string | null {
		if (this.written.has(path) || this.unknownWrite) {
			this.out.blind.push(`${via} reads ${path}, which this same command may write before it runs`);
			return null;
		}
		const body = readScript(path);
		if (body === null) this.out.blind.push(`${via} reads program text from ${path}, which could not be read`);
		return body;
	}

	/** Record what this command writes, for a later script run in the same command string. */
	private recordWrites(src: SimpleCommand, argv: Word[], dir: string): void {
		const add = (w: Word | undefined): void => {
			if (!w) return;
			if (unknown(w)) {
				this.unknownWrite = true;
				return;
			}
			const p = resolve(dir, w.text);
			this.written.add(p);
		};
		for (const r of src.redirects) if (r.op.includes(">") && r.op !== ">&" && r.target) add(r.target);
		const head = argv[0];
		if (!head || unknown(head)) return;
		const name = basename(head.text);
		const operands = argv.slice(1).filter((w) => unknown(w) || !w.text.startsWith("-"));
		if (name === "tee") for (const w of operands) add(w);
		if (name === "cp" || name === "mv" || name === "ln" || name === "install") add(operands.at(-1));
		if (name === "curl" || name === "wget") {
			const i = argv.findIndex((w) => /^(-o|--output|-O|--output-document)$/.test(w.text));
			if (i > 0) add(argv[i + 1]);
		}
	}

	/** One command (already unwrapped) and everything it runs. */
	command(src: SimpleCommand, argv: Word[], depth: number, mods: Mods = noMods()): void {
		if (argv.length === 0) return;
		const dir = src.dir;
		for (const a of mods.assigns) this.assign(a);
		this.out.commands.push({ argv, redirects: src.redirects, dir, dirKnown: src.dirKnown, source: src, mods });
		this.recordWrites(src, argv, dir);
		const head = argv[0]!;
		if (head.opaque) {
			this.out.blind.push("the command name is not known until it runs (a substitution or unset variable)");
			return;
		}
		if (head.glob) {
			this.out.blind.push(`the command name \`${head.text}\` is a glob pattern the shell expands when it runs`);
			return;
		}
		if (depth > MAX_DEPTH) {
			this.out.blind.push(`commands nested more than ${MAX_DEPTH} levels deep`);
			return;
		}
		const name = basename(head.text);
		const args = argv.slice(1);

		if (SHELLS[name]) return this.shellCommand(src, name, args, dir, depth);
		if (name === "source" || name === ".") {
			const target = args[0];
			if (unknown(target)) this.out.blind.push(`\`${name}\` of a path not known until it runs`);
			else this.script(resolve(dir, target!.text), name, depth);
			return;
		}
		if (name === "eval") {
			if (args.some((a) => unknown(a))) this.out.blind.push("`eval` of text not known until it runs");
			this.shell(joined(args), dir, depth + 1);
			return;
		}
		if (name === "xargs") return this.xargs(src, args, depth);
		if (name === "find") return this.findExec(src, args, depth);
		// git runs nothing the expander follows: an alias (`-c alias.*`, or a subcommand that is not
		// git's own) is refused by gitUnmodeled rather than expanded (M4 fix round 4, B1).
		if (name === "git") return;
		const family = interpreterFamily(name);
		if (family) return this.interpreter(src, name, family, args, dir);
		if (head.text.includes("/") && !SYSTEM_BIN.test(resolve(dir, head.text))) this.script(resolve(dir, head.text), head.text, depth);
	}

	private interpreter(src: SimpleCommand, name: string, family: CodeFamily, args: Word[], dir: string): void {
		const a = interpreterArgs(family, name, args);
		if (a.unknown) this.out.blind.push(`\`${name}\` with code or an argument not known until it runs`);
		for (const c of a.code) this.out.code.push({ lang: name, family, text: c.text, dir });
		if (!a.stdin) return;
		// The program comes from stdin: a heredoc, a file, or a pipe (astra review round 2: a produced-then-piped program).
		for (const s of this.stdinSources(src, name, dir)) {
			if ("text" in s) this.out.code.push({ lang: name, family, text: s.text, dir });
			else {
				const body = this.codeFile(s.path, s.via);
				if (body !== null) this.out.code.push({ lang: name, family, text: body, dir });
			}
		}
	}

	/**
	 * What a command reads on stdin as program text: heredoc/herestring bodies, `<` files, and a pipe
	 * from a producer whose output the gate can compute. Unknown input is pushed as blind. `required`
	 * (a shell) also treats no stdin at all as blind.
	 */
	private stdinSources(src: SimpleCommand, name: string, dir: string, required = false): Array<{ text: string } | { path: string; via: string }> {
		const out: Array<{ text: string } | { path: string; via: string }> = [];
		const stdin = src.redirects.filter((r) => r.op === "<<" || r.op === "<<-" || r.op === "<<<" || r.op === "<");
		for (const r of stdin) {
			if (r.op === "<") {
				if (unknown(r.target ?? undefined)) this.out.blind.push(`\`${name}\` reads its program from a path not known until it runs`);
				else out.push({ path: resolve(dir, r.target!.text), via: name });
			} else {
				if (r.bodyOpaque) this.out.blind.push(`\`${name}\` reads a heredoc whose text is not known until it runs`);
				out.push({ text: r.body ?? "" });
			}
		}
		if (stdin.length > 0) return out;
		const producer = src.stdinFrom;
		if (!producer) {
			if (required) this.out.blind.push(`\`${name}\` reads commands from stdin the gate cannot see`);
			return out;
		}
		const p = this.unwrapAt(producer.words, producer.dir);
		const pName = p[0] && !unknown(p[0]) ? basename(p[0].text) : "";
		const words = p.slice(1);
		if (pName === "echo") {
			let k = 0;
			while (k < words.length && /^-[neE]+$/.test(words[k]!.text)) k++;
			const rest = words.slice(k);
			if (rest.some((w) => unknown(w))) this.out.blind.push(`\`echo … | ${name}\` pipes text not known until it runs`);
			const plain = joined(rest);
			// echo interprets backslash escapes in some shells and with -e: read both spellings.
			out.push({ text: plain });
			if (plain.includes("\\")) out.push({ text: echoEscapes(plain).text });
		} else if (pName === "printf") {
			const text = words.some((w) => unknown(w)) ? null : printfOutput(words.map((w) => w.text));
			if (text === null) this.out.blind.push(`\`printf … | ${name}\` pipes output the gate cannot compute`);
			else out.push({ text });
		} else if (pName === "cat" && p.length > 1) {
			for (const w of words) {
				if (unknown(w)) this.out.blind.push(`\`cat … | ${name}\` pipes a path not known until it runs`);
				else if (!w.text.startsWith("-")) out.push({ path: resolve(producer.dir, w.text), via: `cat | ${name}` });
			}
		} else if (pName === "cat" && producer.redirects.some((r) => r.body !== null)) {
			for (const r of producer.redirects) if (r.body !== null) out.push({ text: r.body });
		} else {
			this.out.blind.push(`\`${name}\` runs commands piped from \`${pName || "an unknown command"}\`, which the gate cannot see`);
		}
		return out;
	}

	private shellCommand(src: SimpleCommand, name: string, args: Word[], dir: string, depth: number): void {
		let cMode = false;
		let i = 0;
		for (; i < args.length; i++) {
			const a = args[i]!;
			if (unknown(a)) break;
			if (a.text === "--") {
				i++;
				break;
			}
			if (!a.text.startsWith("-") && !a.text.startsWith("+")) break;
			if (/^-[A-Za-z]*c[A-Za-z]*$/.test(a.text)) cMode = true;
			if (a.text === "-o" || a.text === "+o" || a.text === "-O" || a.text === "+O" || a.text === "--rcfile" || a.text === "--init-file") i++;
		}
		const first = args[i];
		if (cMode) {
			if (unknown(first)) this.out.blind.push(`\`${name} -c\` with a script not known until it runs`);
			else this.shell(first!.text, dir, depth + 1);
			return;
		}
		if (first) {
			if (unknown(first)) this.out.blind.push(`\`${name}\` runs a script path not known until it runs`);
			else this.script(resolve(dir, first.text), name, depth);
			return;
		}
		// No script argument: the shell reads commands from stdin.
		for (const s of this.stdinSources(src, name, dir, true)) {
			if ("text" in s) this.shell(s.text, dir, depth + 1);
			else this.script(s.path, s.via, depth);
		}
	}

	/** `xargs [flags] cmd args…`: cmd runs with extra arguments from stdin, unknown here. */
	private xargs(src: SimpleCommand, args: Word[], depth: number): void {
		let i = 0;
		while (i < args.length && !args[i]!.opaque && args[i]!.text.startsWith("-")) {
			const f = args[i]!.text;
			i += /^-[IELnPsda]$/.test(f) || /^--(?:replace|eof|max-lines|max-args|max-procs|max-chars|delimiter|arg-file)$/.test(f) ? 2 : 1;
		}
		const inner = args.slice(i);
		if (inner.length === 0) inner.push({ text: "echo", opaque: false });
		const mods = noMods();
		this.command(src, this.unwrapAt([...inner, { text: "", opaque: true }], src.dir, mods), depth + 1, { ...mods, wrappers: ["xargs", ...mods.wrappers] });
	}

	/** `find … -exec cmd … ;` (and -execdir, -ok, -okdir). */
	private findExec(src: SimpleCommand, args: Word[], depth: number): void {
		for (let i = 0; i < args.length; i++) {
			if (!/^-(exec|execdir|ok|okdir)$/.test(args[i]!.text)) continue;
			const end = args.findIndex((a, k) => k > i && (a.text === ";" || a.text === "+"));
			const inner = args.slice(i + 1, end < 0 ? undefined : end).map((w) => (w.text === "{}" ? { text: "", opaque: true } : w));
			const mods = noMods();
			this.command(src, this.unwrapAt(inner, src.dir, mods), depth + 1, { ...mods, wrappers: [`find ${args[i]!.text}`, ...mods.wrappers] });
			if (end < 0) break;
			i = end;
		}
	}
}

/** Everything `command` runs, from `cwd`, as far as the gate can see. */
export function expandShell(command: string, cwd: string, env: Record<string, string | undefined>): Expansion {
	const e = new Expander(env);
	e.shell(command, cwd, 0);
	return e.out;
}

/** Text of an Exec for the regex rules: argv joined by single spaces. */
export function execText(e: Exec): string {
	return joined(e.argv);
}

/** xxd's options that take a value (`-c 8`, `-c8`, `-cols 8`), by letter, with their long spelling (xxd -h, xxd.c). */
const XXD_VALUE: Record<string, string> = { c: "cols", g: "groupsize", l: "len", n: "name", o: "offset", s: "seek", R: "R" };
/** xxd's options that take none (xxd -h: -a -b -C -d -E -e -h -i -ps -r -u -v, and their long spellings). */
const XXD_FLAG = /^-(?:a(?:utoskip)?|b(?:its)?|C|capitalize|d(?:ecimal)?|e|E(?:BCDIC)?|h(?:elp)?|i(?:nclude)?|p(?:s|lain|ostscript)?|r(?:evert)?|u(?:ppercase)?|v(?:ersion)?)$/;

/**
 * xxd's operands, `xxd [options] [infile [outfile]]` (xxd -h), or null when a word is not one of its
 * options or there are more than two: its second operand is a file it writes, with or without -r
 * (astra-6 B6: `xxd /dev/null <ledger>` truncates the ledger).
 */
function xxdOperands(argv: Word[]): Word[] | null {
	const operands: Word[] = [];
	for (let i = 1; i < argv.length; i++) {
		const w = argv[i]!.text;
		if (w === "--") {
			operands.push(...argv.slice(i + 1));
			break;
		}
		if (!w.startsWith("-") || w === "-") {
			operands.push(argv[i]!);
			continue;
		}
		if (XXD_FLAG.test(w)) continue;
		const long = XXD_VALUE[w[1]!];
		if (long === undefined) return null;
		if (w.length === 2 || w === `-${long}`) {
			if (++i >= argv.length) return null;
			continue;
		}
		if (!/^[-+]?\d/.test(w.slice(2)) && w[1] !== "R" && w[1] !== "n") return null; // `-c8`, `-s+16`: an attached number
	}
	return operands.length <= 2 ? operands : null;
}

/**
 * Where a command writes files: redirect targets, `tee` operands, the destination of
 * cp/mv/ln/install/rsync, `dd of=`, `sort -o`, and xxd's second operand (every operand when its words
 * are not ones xxd documents). Rows 6 (a write inside .git) and 10 (a write to the ledger) both read
 * this, before any read-only allowance (M4 fix round 6, astra-6 B6).
 */
export function writeDestinations(e: Exec): Word[] {
	const out = e.redirects.flatMap((r) => (r.op.includes(">") && r.op !== ">&" && r.target ? [r.target] : []));
	const name = basename(e.argv[0]!.text);
	const operands = e.argv.slice(1).filter((w) => !w.text.startsWith("-"));
	if (name === "tee") out.push(...operands);
	if (name === "cp" || name === "mv" || name === "ln" || name === "install" || name === "rsync") {
		const t = e.argv.findIndex((w) => w.text === "-t" || w.text.startsWith("--target-directory"));
		const dest = t > 0 ? (e.argv[t]!.text.includes("=") ? { ...e.argv[t]!, text: e.argv[t]!.text.split("=")[1]! } : e.argv[t + 1]) : operands.at(-1);
		if (dest) out.push(dest);
	}
	if (name === "dd") for (const w of e.argv) if (w.text.startsWith("of=")) out.push({ ...w, text: w.text.slice(3) });
	if (name === "sort") {
		for (let i = 1; i < e.argv.length; i++) {
			const w = e.argv[i]!;
			if (w.text === "--output") {
				if (e.argv[i + 1]) out.push(e.argv[i + 1]!);
			} else if (w.text.startsWith("--output=")) out.push({ ...w, text: w.text.slice(9) });
			else if (/^-[^-]*o/.test(w.text)) {
				// `-o F`, `-oF`, `-uo F`: the rest of the word after `o`, else the next word.
				const rest = w.text.slice(w.text.indexOf("o") + 1);
				const f = rest === "" ? e.argv[i + 1] : { ...w, text: rest };
				if (f) out.push(f);
			}
		}
	}
	if (name === "xxd") {
		const ops = xxdOperands(e.argv);
		if (ops === null) out.push(...operands);
		else if (ops[1]) out.push(ops[1]);
	}
	return out;
}

/** `git` global options that take a value word. */
const GIT_VALUE_OPTS: Record<string, true> = { "-C": true, "-c": true, "--git-dir": true, "--work-tree": true, "--namespace": true, "--exec-path": true, "--config-env": true, "--super-prefix": true };

export interface GitCall {
	/** Directory git runs in after its `-C` hops (gitDir); "" when a hop is unknown or does not resolve. */
	dir: string;
	/** The subcommand, or null when it is opaque or a glob. */
	sub: string | null;
	/** Words after the subcommand. */
	args: Word[];
	/** The global options before the subcommand. */
	globals: Word[];
}

/** `p` resolved from `base` (already physical) one component at a time; null when a component does not exist. */
function physical(base: string, p: string): string | null {
	let cur = p.startsWith("/") ? "/" : base;
	for (const part of p.split("/")) {
		if (part === "" || part === ".") continue;
		// `cur` is already free of symlinks, so its parent is what `..` reaches, as chdir(2) does.
		// (Bun's realpathSync.native collapses a `..` in its input before resolving the symlink in
		// front of it, so the path is never handed over whole: measured on Bun 1.3.14, M4 fix round 4.)
		// chdir(2) walks through every component, so each one before a `..` must be a directory:
		// `-C file/..` fails in git (ENOTDIR), and so does it here (astra-5 S4).
		if (part === "..") {
			try {
				if (!statSync(cur).isDirectory()) return null;
			} catch {
				return null;
			}
			cur = dirname(cur);
			continue;
		}
		try {
			cur = realpathSync.native(cur === "/" ? `/${part}` : `${cur}/${part}`);
		} catch {
			return null;
		}
	}
	try {
		return statSync(cur).isDirectory() ? cur : null;
	} catch {
		return null;
	}
}

/**
 * The directory git runs in from `start` after the `-C` paths `hops`, the way git takes them (M4 fix
 * round 4, S1; git(1) `-C`: "each subsequent non-absolute -C <path> is interpreted relative to the
 * preceding -C <path>. If <path> is present but empty, e.g. -C "", then the current working
 * directory is left unchanged"). git changes into each directory in turn, so a hop's `..` leaves the
 * directory a symlink reached, not the one the text names: each hop is canonicalized before the
 * next applies (`-C /var -C ..` is `/private` on macOS). Null when a hop does not resolve to an
 * existing directory: git would stop there, and the gate does not guess past it. With no non-empty
 * hop, the start directory as given, canonical when it exists. One resolver for the danger
 * analysis (gitCall, gitUnmodeled) and rebase evidence (r08 plainGit).
 */
export function gitDir(start: string, hops: string[]): string | null {
	let cur = physical("/", resolve(start));
	for (const hop of hops) {
		if (hop === "") continue;
		if (cur === null && !hop.startsWith("/")) return null;
		cur = physical(cur ?? "/", hop);
		if (cur === null) return null;
	}
	return cur ?? resolve(start);
}

/** A `git` Exec, split into its directory, subcommand and arguments. */
export function gitCall(e: Exec): GitCall | null {
	if (unknown(e.argv[0]) || basename(e.argv[0]!.text) !== "git") return null;
	const hops: string[] = [];
	let unknownHop = false;
	let i = 1;
	while (i < e.argv.length) {
		const w = e.argv[i]!;
		if (unknown(w) || !w.text.startsWith("-")) break;
		if (w.text === "-C") {
			const d = e.argv[i + 1];
			if (d && unknown(d)) unknownHop = true;
			else if (d) hops.push(d.text);
		}
		i += GIT_VALUE_OPTS[w.text] ? 2 : 1;
	}
	const dir = unknownHop ? "" : (gitDir(e.dir, hops) ?? "");
	const sub = e.argv[i];
	const globals = e.argv.slice(1, i);
	if (!sub) return { dir, sub: "", args: [], globals };
	return { dir, sub: unknown(sub) ? null : sub.text, args: e.argv.slice(i + 1), globals };
}

// The closed sets below are what `gitUnmodeled` lets through. Each was chosen by hand from
// git-config(1), git(1) and git's environment variables at git 2.50.1 (Apple Git-155), M4 fix
// rounds 3-4: a member is in only because it neither runs a program, reads another config file,
// nor moves the repository. Refresh: read the current git(1) OPTIONS and ENVIRONMENT VARIABLES
// sections and git-config(1) for each member; add a member only with that reading recorded.
/** `-c` keys the gate models. `alias.*` is not one (M4 fix round 4, B1: an alias runs what it names). */
const MODELED_GIT_CONFIG = /^(?:user\.(?:name|email)|color\.[\w.-]+|advice\.[\w-]+|core\.quotepath|init\.defaultbranch|(?:commit|tag)\.gpgsign|gc\.auto)$/i;

/** Global options that neither select a repository nor read other configuration. */
const MODELED_GIT_FLAG = /^(?:--no-pager|-P|-p|--paginate|--no-replace-objects|--no-lazy-fetch|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs|--no-optional-locks|--no-advice|--version|-v|--help|-h|--html-path|--man-path|--info-path)$/;
/** Environment a command may set for git: identity, prompts, tracing. Everything else `GIT_*`, and PATH/HOME/XDG_CONFIG_HOME, is an override. */
const MODELED_GIT_ENV = /^(?:GIT_TERMINAL_PROMPT|GIT_(?:AUTHOR|COMMITTER)_(?:NAME|EMAIL|DATE)|GIT_OPTIONAL_LOCKS|GIT_FLUSH|GIT_MERGE_AUTOEDIT|GIT_ADVICE|GIT_PROGRESS_DELAY)$/;
/**
 * git's trace variables, each named in git(1) on git 2.50.1 (`man git`: GIT_TRACE, GIT_TRACE2,
 * GIT_TRACE2_EVENT, GIT_TRACE2_PERF, GIT_TRACE_CURL, GIT_TRACE_CURL_NO_DATA, GIT_TRACE_FSMONITOR,
 * GIT_TRACE_PACKET, GIT_TRACE_PACKFILE, GIT_TRACE_PACK_ACCESS, GIT_TRACE_PERFORMANCE,
 * GIT_TRACE_REDACT, GIT_TRACE_REFS, GIT_TRACE_SETUP, GIT_TRACE_SHALLOW). Any other `GIT_TRACE…` name
 * is an unmodeled GIT_* variable (M4 fix round 6, astra-6 B7: `GIT_TRACE\w*` admitted names git may
 * add later).
 */
const GIT_TRACE_ENV = /^GIT_TRACE(?:|2|2_EVENT|2_PERF|_CURL|_CURL_NO_DATA|_FSMONITOR|_PACKET|_PACKFILE|_PACK_ACCESS|_PERFORMANCE|_REDACT|_REFS|_SETUP|_SHALLOW)$/;
/**
 * A trace value that names no file. git(1), GIT_TRACE: "1", "2" or "true" (case insensitive) print to
 * stderr; an integer from 3 to 9 is an open file descriptor; "if the variable is set to an absolute
 * path … the trace messages will be written to this file"; empty, "0" or "false" disable it.
 */
const TRACE_NO_FILE = /^(?:|0|1|2|[3-9]|true|false)$/i;

/**
 * The files git's trace variables write, for a git command: each assignment (prefix, `env NAME=v`,
 * or exported earlier in the string) of a GIT_TRACE_ENV name whose value is not TRACE_NO_FILE, the
 * word's text cut to the value. Row 6 refuses one that is not a literal absolute path or is inside
 * .git (gitUnmodeled); row 10 one that names the ledger (astra-6 B7:
 * `GIT_TRACE=<ledger> git status` appends to the ledger).
 */
export function gitTraceFiles(assigned: Map<string, Word>): Word[] {
	const out: Word[] = [];
	for (const [name, w] of assigned) {
		if (!GIT_TRACE_ENV.test(name)) continue;
		const value = w.text.slice(name.length + 1);
		if (!w.opaque && TRACE_NO_FILE.test(value)) continue;
		out.push({ ...w, text: value });
	}
	return out;
}

/** Pager/editor variables git runs as a command: modeled only with a value that runs nothing. */
const GIT_COMMAND_ENV = /^(?:GIT_PAGER|PAGER|GIT_EDITOR|GIT_SEQUENCE_EDITOR|EDITOR|VISUAL)$/;
const INERT_COMMAND = /^(?:cat|true|:|less|)$/;
/** `env` flags that clear, unset or change directory: git would then read a different repository or config. */
const ENV_UNMODELED_FLAG = /^(?:-[A-Za-z]*[iuCP]|--(?:ignore-environment|unset|chdir|block-signal|default-signal|ignore-signal)\b)/;

/**
 * Why a `git` Exec is a form the gate does not model, or null (M4 fix round 3, Jo 2026-09-29:
 * "go ahead with the invert"). Modeled: every word literal; global options only from
 * MODELED_GIT_FLAG, `-c` with a MODELED_GIT_CONFIG key, and `-C` with a literal path that resolves
 * to an existing directory (Jo 2026-09-29, "carve it out"; gitDir), but never `-C` together with
 * `-c`; a subcommand from GIT_BUILTINS (anything else may be an alias or a `git-*` program: fix
 * round 4, B1); no command-local or exported `GIT_*`/PATH/HOME/XDG_CONFIG_HOME outside
 * MODELED_GIT_ENV; no `env` that clears, unsets or moves, and no `sudo`/`doas` (another HOME).
 * Anything else — `-c alias.*`, `--git-dir`, `--work-tree`, `--config-env`, `--exec-path`,
 * `GIT_CONFIG_*`, `GIT_DIR` — is refused (R3-B1, R3-B6, R4-B1).
 *
 * Arguments follow command names (fix round 4, S4, Plumb's ruling): a word spelled through an
 * expansion (`$X`, `$'…'`, braces, a substitution) is refused as a command name, so it is refused
 * as a git argument too, even when the gate knows the value. `git checkout $'master'` is refused;
 * `git checkout master` is the spelling.
 */
export function gitUnmodeled(e: Exec, assigned: Map<string, Word>): string | null {
	if (!gitCall(e)) return null;
	for (const w of e.mods.wrappers) {
		const [name, ...flags] = w.split(" ");
		if (name === "sudo" || name === "doas") return `git run through ${name}, which gives it another user's HOME and config`;
		if (name === "env" && flags.some((f) => ENV_UNMODELED_FLAG.test(f))) return `git under \`${w}\`, which changes its environment or directory`;
	}
	for (const [name, w] of assigned) {
		const value = w.text.slice(name.length + 1);
		if (GIT_COMMAND_ENV.test(name)) {
			if (w.opaque || !INERT_COMMAND.test(value)) return `git with ${name} set to a command (${w.text})`;
		} else if (GIT_TRACE_ENV.test(name)) {
			if (w.opaque) return `git with ${name} set to a value not typed out as literal text (${w.text}), a file git would write`;
			if (TRACE_NO_FILE.test(value)) continue;
			if (!value.startsWith("/")) return `git with ${name}=${value}, a trace target the gate does not model (only off, 1, 2, true, a descriptor 3-9, or an absolute file path)`;
			if (insideDotGit(resolve(e.dir, value))) return `git with ${name} writing its trace into ${value}, inside .git (git's own hooks, config and refs)`;
		} else if ((/^GIT_/.test(name) && !MODELED_GIT_ENV.test(name)) || /^(?:PATH|HOME|XDG_CONFIG_HOME)$/.test(name)) {
			return `git with ${name} set in the same command (${w.text})`;
		}
	}
	let config = false;
	const hops: string[] = [];
	let i = 1;
	for (; i < e.argv.length; i++) {
		const w = e.argv[i]!;
		if (unknown(w) || w.expanded) return `git with a word not typed out as literal text (\`${w.text}\`)`;
		const t = w.text;
		if (!t.startsWith("-")) break;
		if (t === "-C") {
			const p = e.argv[++i];
			if (!p || unknown(p) || p.expanded) return "git -C with a path that is not literal text";
			hops.push(p.text);
		} else if (t === "-c") {
			const kv = e.argv[++i];
			if (!kv || unknown(kv) || kv.expanded) return "git -c with a value not typed out as literal text";
			const key = kv.text.includes("=") ? kv.text.slice(0, kv.text.indexOf("=")) : kv.text;
			if (!MODELED_GIT_CONFIG.test(key)) return `git -c ${key}, a config override the gate does not model`;
			config = true;
		} else if (!MODELED_GIT_FLAG.test(t)) return `git ${t}, an option the gate does not model`;
	}
	if (hops.length > 0 && config) return "git -C together with -c";
	if (gitDir(e.dir, hops) === null) return `git -C ${hops.map((h) => JSON.stringify(h)).join(" -C ")}, which does not resolve to an existing directory`;
	const sub = e.argv[i];
	if (sub && !unknown(sub) && !sub.expanded && !GIT_BUILTINS.has(sub.text)) {
		return `git ${sub.text}, which is not one of git's own commands (it may be a configured alias or a git-${sub.text} program the gate does not read)`;
	}
	if (e.argv.slice(i).some((w) => unknown(w) || w.expanded)) return "git with an argument not typed out as literal text (a variable, `$'…'`, braces, a substitution or a glob)";
	return null;
}
