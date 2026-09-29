// What a shell command string runs, as the tool-call rows (6, 8, 10) judge it: every simple command
// with wrappers stripped (`env`, `sudo`, `command`, `nohup`, `time`, `timeout`, …, and `env -S`'s
// split string) and every command reached through another — `sh -c`, `eval`, a heredoc or
// herestring fed to a shell, `echo … | sh` and `printf … | sh` (the producer's output computed the
// way printf formats it), `xargs`, `find -exec`, a script run by path or `source`, a git alias
// (`-c alias.x=…` or the config's), `$(…)`. Inline interpreter code (`bun -e`, `python -c`,
// `perl -ne`, a heredoc or pipe into an interpreter, …) is returned as code for the eval checks.
// What the gate cannot see (a shell reading a pipe from an unknown producer, `sh -c "$X"`, a command
// name that is a glob, a script the same command writes first, a parse failure) is returned as
// `blind`, and the rows fail closed on it (astra review B1, B2; round 2 R2-B1, R2-B2).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { type ParseOptions, parseShell, type Redirect, type SimpleCommand, shellQuote, type Word } from "./shell-parse";

export interface Exec {
	/** argv after wrappers, quote removal and expansion. `argv[0]` is the command. */
	argv: Word[];
	redirects: Redirect[];
	dir: string;
	dirKnown: boolean;
	/** The simple command this came from (for pipes). */
	source: SimpleCommand;
}

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
}

const SHELLS: Record<string, true> = { bash: true, sh: true, zsh: true, ksh: true, dash: true, ash: true, fish: true };
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

/** git subcommands that are git's own: an alias of the same name is ignored by git, so no alias lookup. */
const GIT_BUILTINS = new Set(
	(
		"add am annotate apply archive backfill bisect blame branch bugreport bundle cat-file check-attr check-ignore check-mailmap " +
		"check-ref-format checkout checkout-index cherry cherry-pick citool clean clone column commit commit-graph commit-tree config " +
		"count-objects credential describe diagnose diff diff-files diff-index diff-tree difftool fast-export fast-import fetch fetch-pack " +
		"filter-branch fmt-merge-msg for-each-ref for-each-repo format-patch fsck fsmonitor--daemon gc get-tar-commit-id grep gui " +
		"hash-object help hook index-pack init instaweb interpret-trailers log ls-files ls-remote ls-tree mailinfo mailsplit maintenance " +
		"merge merge-base merge-file merge-index merge-tree mergetool mktag mktree multi-pack-index mv name-rev notes pack-objects " +
		"pack-refs patch-id prune prune-packed pull push range-diff read-tree rebase receive-pack reflog refs remote repack replace " +
		"request-pull rerere reset restore rev-list rev-parse revert rm send-email send-pack shortlog show show-branch show-index " +
		"show-ref sparse-checkout stage stash status stripspace submodule switch symbolic-ref tag unpack-file unpack-objects " +
		"update-index update-ref update-server-info upload-archive upload-pack var verify-commit verify-pack verify-tag version " +
		"whatchanged worktree write-tree"
	).split(" "),
);

const MAX_DEPTH = 4;
const MAX_SCRIPT_BYTES = 256 * 1024;
/** A variable name no environment sets: stands in for an argument whose value is unknown when text is re-parsed. */
const UNKNOWN_ARG = '"$__GATE_UNKNOWN_ARGUMENT__"';

const OPAQUE_HEAD: Word[] = [{ text: "", opaque: true }];

/**
 * Strip leading `NAME=value` assignments and wrapper commands (with their flags). `split` turns an
 * `env -S` string into words (null when it cannot); without it an `env -S` makes the head opaque.
 */
export function unwrap(words: Word[], split: (s: string) => Word[] | null = () => null): Word[] {
	let w = words;
	for (let guard = 0; guard < 64; guard++) {
		let k = 0;
		while (k < w.length && !w[k]!.opaque && /^[A-Za-z_]\w*=/.test(w[k]!.text)) k++;
		w = w.slice(k);
		const head = w[0];
		if (!head || head.opaque || head.glob) return w;
		const name = basename(head.text);
		const wrapper = WRAPPERS[name];
		if (!wrapper) return w;
		let i = 1;
		while (i < w.length && !w[i]!.opaque && w[i]!.text.startsWith("-") && w[i]!.text !== "-") {
			const flag = w[i]!.text;
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
		if (name === "env") while (i < w.length && !w[i]!.opaque && /^[A-Za-z_]\w*=/.test(w[i]!.text)) i++;
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

/** Backslash escapes as `echo -e` and `printf %b` read them; `\c` ends the output. */
function echoEscapes(s: string): { text: string; stop: boolean } {
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
		const oct = /^0([0-7]{0,3})/.exec(s.slice(i + 1));
		const hex = /^x([0-9a-fA-F]{1,2})/.exec(s.slice(i + 1));
		if (oct) {
			out += String.fromCharCode(parseInt(oct[1] || "0", 8));
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
 * remain), or null for a conversion the gate does not evaluate (`%q`, floats): the caller fails closed.
 */
export function printfOutput(args: string[]): string | null {
	let a = args;
	if (a[0] === "--") a = a.slice(1);
	const fmt = a[0];
	if (fmt === undefined) return null;
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
				if (m[1] === "c") return out;
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
				const e = echoEscapes(next());
				v = e.text;
				if (e.stop) return out + v;
			} else if (conv === "c") v = next().slice(0, 1);
			else if ("diouxX".includes(conv)) {
				const n = num(next());
				if (n === null) return null;
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
	/** Per family: short-option letters whose code is the rest of the cluster or the next word, and letters taking a value. */
	const spec: Record<CodeFamily, { code: string; valueNext: string; valueAttached: string; module?: string }> = {
		js: { code: "ep", valueNext: "rC", valueAttached: "" },
		python: { code: "c", valueNext: "WXQ", valueAttached: "", module: "m" },
		perl: { code: "eE", valueNext: "", valueAttached: "IMmi0lxCdDV" },
		ruby: { code: "e", valueNext: "rICEF", valueAttached: "KWTx0li" },
		php: { code: "rRBE", valueNext: "dcfz", valueAttached: "" },
		osascript: { code: "e", valueNext: "ls", valueAttached: "" },
	};
	const s = spec[family];
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
				if (s.code.includes(c)) {
					const attached = t.slice(k + 1);
					if (attached !== "") out.code.push({ text: attached, opaque: false });
					else {
						const code = args[++i];
						if (unknown(code)) out.unknown = true;
						else out.code.push(code!);
					}
					break;
				}
				if (s.module?.includes(c)) return out; // python -m: a module runs, not stdin
				if (s.valueNext.includes(c)) {
					if (k + 1 >= t.length) i++;
					break;
				}
				if (s.valueAttached.includes(c)) break;
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
	readonly out: Expansion = { commands: [], code: [], blind: [] };
	/** Files the command writes (redirects, tee, cp/mv/ln/install destinations) before it runs a later script. */
	private readonly written = new Set<string>();
	private unknownWrite = false;
	/** An earlier command may have changed git config (so an alias lookup at gate time is stale). */
	private gitConfigWritten = false;

	constructor(readonly env: Record<string, string | undefined>) {}

	shell(src: string, dir: string, depth: number, vars?: Map<string, string | null>): void {
		if (depth > MAX_DEPTH) {
			this.out.blind.push(`commands nested more than ${MAX_DEPTH} levels deep`);
			return;
		}
		const opts: ParseOptions = { cwd: dir, env: this.env };
		const r = parseShell(src, opts, vars);
		for (const f of r.failures) this.out.blind.push(`the command could not be parsed (${f})`);
		for (const cmd of r.commands) this.command(cmd, this.unwrapAt(cmd.words, cmd.dir), depth);
	}

	private unwrapAt(words: Word[], dir: string): Word[] {
		return unwrap(words, (s) => this.splitWords(s, dir));
	}

	/** One command line's words, with no operators or redirects (an `env -S` string, a git alias); null when it has any. */
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
			if (/(?:^|\/)(?:\.git\/config|\.gitconfig|git\/config)$/.test(p)) this.gitConfigWritten = true;
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
	command(src: SimpleCommand, argv: Word[], depth: number): void {
		if (argv.length === 0) return;
		const dir = src.dir;
		this.out.commands.push({ argv, redirects: src.redirects, dir, dirKnown: src.dirKnown, source: src });
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
		if (name === "git") return this.gitAlias(src, argv, dir, depth);
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

	/**
	 * A git subcommand that is an alias: `-c alias.x=…` / `--config-env alias.x=VAR` on the command
	 * line, else (for a name that is not git's own) the configured alias. A plain alias is analyzed
	 * as the git command it expands to, a `!` alias as shell; one the gate cannot resolve is blind
	 * (astra review round 2, R2-B2).
	 */
	private gitAlias(src: SimpleCommand, argv: Word[], dir: string, depth: number): void {
		const configs = new Map<string, Word | null>();
		let unknownConfig = false;
		let gdir = dir;
		let i = 1;
		while (i < argv.length) {
			const w = argv[i]!;
			if (unknown(w) || !w.text.startsWith("-")) break;
			const t = w.text;
			if (t === "-c") {
				const kv = argv[i + 1];
				if (unknown(kv)) unknownConfig = true;
				else {
					const eq = kv!.text.indexOf("=");
					configs.set((eq < 0 ? kv!.text : kv!.text.slice(0, eq)).toLowerCase(), { text: eq < 0 ? "true" : kv!.text.slice(eq + 1), opaque: false });
				}
			} else if (t === "--config-env" || t.startsWith("--config-env=")) {
				const specWord = t === "--config-env" ? argv[i + 1] : { text: t.slice("--config-env=".length), opaque: false };
				if (unknown(specWord)) unknownConfig = true;
				else {
					const eq = specWord!.text.indexOf("=");
					const v = eq < 0 ? undefined : this.env[specWord!.text.slice(eq + 1)];
					configs.set((eq < 0 ? specWord!.text : specWord!.text.slice(0, eq)).toLowerCase(), v === undefined ? null : { text: v, opaque: false });
				}
			} else if (t === "-C") {
				const d = argv[i + 1];
				gdir = unknown(d) ? "" : resolve(gdir, d!.text);
			}
			i += GIT_VALUE_OPTS[t] ? 2 : 1;
		}
		const sub = argv[i];
		if (!sub || unknown(sub)) return;
		const rest = argv.slice(i + 1);
		if (sub.text === "config") {
			if (!readOnlyGitConfig(rest)) this.gitConfigWritten = true;
			return;
		}
		const key = `alias.${sub.text.toLowerCase()}`;
		let value: Word | null | undefined = configs.has(key) ? configs.get(key) : undefined;
		const builtin = GIT_BUILTINS.has(sub.text);
		if (value === undefined && !builtin) {
			if (unknownConfig) value = null;
			else if (this.gitConfigWritten || this.unknownWrite) {
				this.out.blind.push(`\`git ${sub.text}\` may be an alias this same command defines before it runs`);
				return;
			} else value = this.configAlias(sub.text, gdir);
		}
		if (value === undefined) return;
		if (value === null || value.opaque) {
			this.out.blind.push(`\`git ${sub.text}\` is an alias whose value is not known until it runs`);
			return;
		}
		if (value.text.startsWith("!")) {
			// git runs `sh -c '<alias> "$@"' <alias> args…` from the repository's top level.
			const argsText = rest.map((w) => (unknown(w) ? UNKNOWN_ARG : shellQuote(w.text))).join(" ");
			this.shell(`${value.text.slice(1)} ${argsText}`, gdir || dir, depth + 1);
			return;
		}
		const words = this.splitWords(value.text, dir);
		if (words === null || words.length === 0) {
			this.out.blind.push(`\`git ${sub.text}\` is an alias the gate cannot read (${value.text})`);
			return;
		}
		this.command(src, [argv[0]!, ...argv.slice(1, i), ...words, ...rest], depth + 1);
	}

	/** `git config --get alias.<name>` where git would run: the alias text, undefined for none, null when git could not answer. */
	private configAlias(name: string, dir: string): Word | null | undefined {
		const env: Record<string, string> = {};
		for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "XDG_CONFIG_HOME" && k !== "HOME") env[k] = v;
		for (const k of ["HOME", "XDG_CONFIG_HOME", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_NOSYSTEM"]) {
			const v = this.env[k];
			if (v !== undefined) env[k] = v;
		}
		env.GIT_TERMINAL_PROMPT = "0";
		const cwd = dir && existsSync(dir) ? dir : "/";
		const r = spawnSync("git", ["config", "--get", `alias.${name}`], { cwd, encoding: "utf8", timeout: 3000, env });
		if (r.error) return null;
		if (r.status === 0) return { text: r.stdout.replace(/\n$/, ""), opaque: false };
		return r.status === 1 ? undefined : null;
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
		this.command(src, this.unwrapAt([...inner, { text: "", opaque: true }], src.dir), depth + 1);
	}

	/** `find … -exec cmd … ;` (and -execdir, -ok, -okdir). */
	private findExec(src: SimpleCommand, args: Word[], depth: number): void {
		for (let i = 0; i < args.length; i++) {
			if (!/^-(exec|execdir|ok|okdir)$/.test(args[i]!.text)) continue;
			const end = args.findIndex((a, k) => k > i && (a.text === ";" || a.text === "+"));
			const inner = args.slice(i + 1, end < 0 ? undefined : end).map((w) => (w.text === "{}" ? { text: "", opaque: true } : w));
			this.command(src, this.unwrapAt(inner, src.dir), depth + 1);
			if (end < 0) break;
			i = end;
		}
	}
}

/** A `git config` invocation that only reads (`--get…`, `--list`, `get`, `list`, or one key and nothing to set). */
function readOnlyGitConfig(rest: Word[]): boolean {
	if (rest.some((w) => unknown(w))) return false;
	const t = rest.map((w) => w.text);
	if (t.some((x) => /^(--get(-all|-regexp|-urlmatch|-color|colorbool)?|--list|-l|get|list)$/.test(x))) return true;
	if (t.some((x) => /^(--add|--replace-all|--unset(-all)?|--rename-section|--remove-section|-e|--edit|set|unset|rename-section|remove-section|edit)$/.test(x))) return false;
	return t.filter((x) => !x.startsWith("-")).length === 1;
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

/** `git` global options that take a value word. */
const GIT_VALUE_OPTS: Record<string, true> = { "-C": true, "-c": true, "--git-dir": true, "--work-tree": true, "--namespace": true, "--exec-path": true, "--config-env": true, "--super-prefix": true };

export interface GitCall {
	/** Directory git runs in, after `-C`. */
	dir: string;
	/** The subcommand, or null when it is opaque or a glob. */
	sub: string | null;
	/** Words after the subcommand. */
	args: Word[];
	/** The global options before the subcommand. */
	globals: Word[];
}

/** A `git` Exec, split into its directory, subcommand and arguments. */
export function gitCall(e: Exec): GitCall | null {
	if (unknown(e.argv[0]) || basename(e.argv[0]!.text) !== "git") return null;
	let dir = e.dir;
	let i = 1;
	while (i < e.argv.length) {
		const w = e.argv[i]!;
		if (unknown(w) || !w.text.startsWith("-")) break;
		if (w.text === "-C") {
			const d = e.argv[i + 1];
			if (d) dir = unknown(d) ? "" : resolve(dir, d.text);
		}
		i += GIT_VALUE_OPTS[w.text] ? 2 : 1;
	}
	const sub = e.argv[i];
	const globals = e.argv.slice(1, i);
	if (!sub) return { dir, sub: "", args: [], globals };
	return { dir, sub: unknown(sub) ? null : sub.text, args: e.argv.slice(i + 1), globals };
}
