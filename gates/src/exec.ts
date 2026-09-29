// What a shell command string runs, as the tool-call rows (6, 8, 10) judge it: every simple command
// with wrappers stripped (`env`, `sudo`, `command`, `nohup`, `time`, `timeout`, …) and every command
// reached through another — `sh -c`, `eval`, a heredoc or herestring fed to a shell, `echo … | sh`,
// `xargs`, `find -exec`, a script run by path or `source`, `$(…)`. Inline interpreter code
// (`bun -e`, `node -e`, `python -c`, …) is returned as code for the eval checks. What the gate cannot
// see (a shell reading a pipe from an unknown producer, `sh -c "$X"`, a parse failure) is returned as
// `blind`, and the rows fail closed on it (astra review B1, B2).
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { type ParseOptions, parseShell, type Redirect, type SimpleCommand, type Word } from "./shell-parse";

export interface Exec {
	/** argv after wrappers, quote removal and expansion. `argv[0]` is the command. */
	argv: Word[];
	redirects: Redirect[];
	dir: string;
	dirKnown: boolean;
	/** The simple command this came from (for pipes). */
	source: SimpleCommand;
}

export interface InlineCode {
	/** The interpreter (`bun`, `node`, `python3`, …). */
	lang: string;
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
 * flags, and which of their flags take a separate value word.
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
	env: { operands: 0, valueFlags: /^(-[uCS]|--(unset|chdir|split-string))$/ },
	stdbuf: { operands: 0, valueFlags: /^-[ioe]$/ },
	caffeinate: { operands: 0, valueFlags: /^-[tw]$/ },
	timeout: { operands: 1, valueFlags: /^(-[sk]|--(signal|kill-after))$/ },
	ionice: { operands: 0, valueFlags: /^-[cnp]$/ },
	chronic: { operands: 0, valueFlags: /^$/ },
};
/** Interpreters whose `-e`/`-c` flag takes inline code. */
const INTERPRETERS: Record<string, string> = { bun: "-e", node: "-e", deno: "eval", python: "-c", python3: "-c", perl: "-e", ruby: "-e", osascript: "-e", php: "-r" };
/** Producers whose output, piped into a shell, is known from their own argv. */
const LITERAL_PRODUCERS: Record<string, true> = { echo: true, printf: true };

const MAX_DEPTH = 4;
const MAX_SCRIPT_BYTES = 256 * 1024;

/** Strip leading `NAME=value` assignments and wrapper commands (with their flags). */
export function unwrap(words: Word[]): Word[] {
	let w = words;
	for (;;) {
		let k = 0;
		while (k < w.length && !w[k]!.opaque && /^[A-Za-z_]\w*=/.test(w[k]!.text)) k++;
		w = w.slice(k);
		const head = w[0];
		if (!head || head.opaque) return w;
		const name = basename(head.text);
		const wrapper = WRAPPERS[name];
		if (!wrapper) return w;
		let i = 1;
		while (i < w.length && !w[i]!.opaque && w[i]!.text.startsWith("-") && w[i]!.text !== "-") {
			const flag = w[i]!.text;
			i += wrapper.valueFlags.test(flag) ? 2 : 1;
			if (flag === "--") break;
		}
		// `env` takes assignments after its flags.
		if (name === "env") while (i < w.length && !w[i]!.opaque && /^[A-Za-z_]\w*=/.test(w[i]!.text)) i++;
		w = w.slice(i + wrapper.operands);
	}
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

class Expander {
	readonly out: Expansion = { commands: [], code: [], blind: [] };
	constructor(readonly env: Record<string, string | undefined>) {}

	shell(src: string, dir: string, depth: number, vars?: Map<string, string | null>): void {
		if (depth > MAX_DEPTH) {
			this.out.blind.push(`commands nested more than ${MAX_DEPTH} levels deep`);
			return;
		}
		const opts: ParseOptions = { cwd: dir, env: this.env };
		const r = parseShell(src, opts, vars);
		for (const f of r.failures) this.out.blind.push(`the command could not be parsed (${f})`);
		for (const cmd of r.commands) this.command(cmd, unwrap(cmd.words), depth);
	}

	private script(path: string, via: string, depth: number): void {
		const body = readScript(path);
		if (body !== null) this.shell(body, resolve(path, ".."), depth + 1);
		else if (existsSync(path)) this.out.blind.push(`${via} runs ${path}, which could not be read as a script`);
	}

	/** One command (already unwrapped) and everything it runs. */
	command(src: SimpleCommand, argv: Word[], depth: number): void {
		if (argv.length === 0) return;
		const dir = src.dir;
		this.out.commands.push({ argv, redirects: src.redirects, dir, dirKnown: src.dirKnown, source: src });
		const head = argv[0]!;
		if (head.opaque) {
			this.out.blind.push("the command name is not known until it runs (a substitution or unset variable)");
			return;
		}
		const name = basename(head.text);
		const args = argv.slice(1);

		if (SHELLS[name]) return this.shellCommand(src, name, args, dir, depth);
		if (name === "source" || name === ".") {
			const target = args[0];
			if (!target || target.opaque) this.out.blind.push(`\`${name}\` of a path not known until it runs`);
			else this.script(resolve(dir, target.text), name, depth);
			return;
		}
		if (name === "eval") {
			if (args.some((a) => a.opaque)) this.out.blind.push("`eval` of text not known until it runs");
			this.shell(joined(args), dir, depth + 1);
			return;
		}
		if (name === "xargs") return this.xargs(src, args, depth);
		if (name === "find") return this.findExec(src, args, depth);
		const flag = INTERPRETERS[name];
		if (flag) {
			const i = args.findIndex((a) => a.text === flag || a.text === "--eval" || a.text === "--print" || a.text === "-p");
			if (i >= 0) {
				const code = args[i + 1];
				if (!code || code.opaque) this.out.blind.push(`\`${name} ${flag}\` with code not known until it runs`);
				else this.out.code.push({ lang: name, text: code.text, dir });
			}
			return;
		}
		if (head.text.includes("/")) this.script(resolve(dir, head.text), head.text, depth);
	}

	private shellCommand(src: SimpleCommand, name: string, args: Word[], dir: string, depth: number): void {
		let cMode = false;
		let i = 0;
		for (; i < args.length; i++) {
			const a = args[i]!;
			if (a.opaque) break;
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
			if (!first || first.opaque) this.out.blind.push(`\`${name} -c\` with a script not known until it runs`);
			else this.shell(first.text, dir, depth + 1);
			return;
		}
		if (first) {
			if (first.opaque) this.out.blind.push(`\`${name}\` runs a script path not known until it runs`);
			else this.script(resolve(dir, first.text), name, depth);
			return;
		}
		// No script argument: the shell reads commands from stdin.
		const stdin = src.redirects.filter((r) => r.op === "<<" || r.op === "<<-" || r.op === "<<<" || r.op === "<");
		for (const r of stdin) {
			if (r.op === "<") {
				if (!r.target || r.target.opaque) this.out.blind.push(`\`${name}\` reads a script from a path not known until it runs`);
				else this.script(resolve(dir, r.target.text), name, depth);
			} else {
				if (r.bodyOpaque) this.out.blind.push(`\`${name}\` reads a heredoc whose text is not known until it runs`);
				this.shell(r.body ?? "", dir, depth + 1);
			}
		}
		if (stdin.length > 0) return;
		const producer = src.stdinFrom;
		if (!producer) {
			this.out.blind.push(`\`${name}\` reads commands from stdin the gate cannot see`);
			return;
		}
		const p = unwrap(producer.words);
		const pName = p[0] && !p[0].opaque ? basename(p[0].text) : "";
		if (LITERAL_PRODUCERS[pName]) {
			const words = p.slice(1).filter((w, k) => !(k === 0 && /^-[neE]+$/.test(w.text)));
			if (words.some((w) => w.opaque)) this.out.blind.push(`\`${pName} … | ${name}\` pipes text not known until it runs`);
			this.shell(joined(words).replace(/\\n/g, "\n"), dir, depth + 1);
		} else if (pName === "cat" && p.length > 1) {
			for (const w of p.slice(1)) {
				if (w.opaque) this.out.blind.push(`\`cat … | ${name}\` pipes a path not known until it runs`);
				else if (!w.text.startsWith("-")) this.script(resolve(dir, w.text), `cat | ${name}`, depth);
			}
		} else if (pName === "cat" && producer.redirects.some((r) => r.body !== null)) {
			for (const r of producer.redirects) if (r.body !== null) this.shell(r.body, dir, depth + 1);
		} else {
			this.out.blind.push(`\`${name}\` runs commands piped from \`${pName || "an unknown command"}\`, which the gate cannot see`);
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
		this.command(src, unwrap([...inner, { text: "", opaque: true }]), depth + 1);
	}

	/** `find … -exec cmd … ;` (and -execdir, -ok, -okdir). */
	private findExec(src: SimpleCommand, args: Word[], depth: number): void {
		for (let i = 0; i < args.length; i++) {
			if (!/^-(exec|execdir|ok|okdir)$/.test(args[i]!.text)) continue;
			const end = args.findIndex((a, k) => k > i && (a.text === ";" || a.text === "+"));
			const inner = args.slice(i + 1, end < 0 ? undefined : end).map((w) => (w.text === "{}" ? { text: "", opaque: true } : w));
			this.command(src, unwrap(inner), depth + 1);
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

/** `git` global options that take a value word. */
const GIT_VALUE_OPTS: Record<string, true> = { "-C": true, "-c": true, "--git-dir": true, "--work-tree": true, "--namespace": true, "--exec-path": true, "--config-env": true, "--super-prefix": true };

export interface GitCall {
	/** Directory git runs in, after `-C`. */
	dir: string;
	/** The subcommand, or null when it is opaque. */
	sub: string | null;
	/** Words after the subcommand. */
	args: Word[];
}

/** A `git` Exec, split into its directory, subcommand and arguments. */
export function gitCall(e: Exec): GitCall | null {
	if (e.argv[0]?.opaque || basename(e.argv[0]?.text ?? "") !== "git") return null;
	let dir = e.dir;
	let i = 1;
	while (i < e.argv.length) {
		const w = e.argv[i]!;
		if (w.opaque || !w.text.startsWith("-")) break;
		if (w.text === "-C") {
			const d = e.argv[i + 1];
			if (d) dir = d.opaque ? "" : resolve(dir, d.text);
		}
		i += GIT_VALUE_OPTS[w.text] ? 2 : 1;
	}
	const sub = e.argv[i];
	if (!sub) return { dir, sub: "", args: [] };
	return { dir, sub: sub.opaque ? null : sub.text, args: e.argv.slice(i + 1) };
}
