// P-11 row 10 (DESIGN-2.0.md:347; SPEC-2.0.md:322-324 § B2): raw writes to the ledger database
// outside the ledger module are refused — a `sqlite3` (or any other raw CLI) command naming the
// ledger file, a shell redirect into it, eval code opening or writing it, or a file-tool write to it
// or to its `-wal`/`-shm`/`-journal` siblings. The path is the module's own: LEDGER_DB_ENV,
// defaultLedgerPath and canonicalPath from ledger/src/locality.ts; the siblings are derived by suffix.
//
// No text grants authority (astra review B2): a comment naming `ledger/src/index` or a trailing
// argument shaped like `ledger/scripts/x.ts` authorises nothing. The one exemption is running a
// script that canonically resolves inside this repository's `ledger/scripts/`, as the script bun
// or node executes, with no inline code.
import { basename, dirname, resolve } from "node:path";
import { canonicalPath, defaultLedgerPath, LEDGER_DB_ENV } from "../../../ledger/src/locality";
import { type CodeFacts, callArgs, codeFacts, SPAWN_API, topLevelArgs, WRITE_API } from "../eval-code";
import { type Exec, expandShell } from "../exec";
import type { Word } from "../shell-parse";
import { writeTargets } from "../targets";
import type { CallContext, Refusal, ToolCall } from "../types";

const SIBLINGS = ["", "-wal", "-shm", "-journal"];

/** The module's own scripts: the only commands that may open the ledger file by path. */
const LEDGER_SCRIPTS = canonicalPath(resolve(import.meta.dir, "../../../ledger/scripts"));

/** Read-only commands that may name the ledger file (no redirect into it). */
const READ_ONLY_HEADS: Record<string, true> = {
	ls: true, stat: true, file: true, du: true, test: true, "[": true, wc: true, shasum: true, sha256sum: true, md5: true, realpath: true, readlink: true,
};

export interface LedgerPaths {
	/** Absolute spellings of the ledger file (as configured, and canonical). */
	files: string[];
	/** Every string that names the ledger in a command: the files, `~`/`$HOME` spellings, the env var. */
	needles: string[];
}

export function ledgerPaths(env: Record<string, string | undefined>): LedgerPaths {
	const configured = defaultLedgerPath(env);
	const files = [...new Set([configured, canonicalPath(configured)])];
	const needles = new Set<string>(files);
	const home = env.HOME;
	for (const f of files) {
		if (home && f.startsWith(`${home}/`)) {
			const rel = f.slice(home.length);
			for (const h of ["~", "$HOME", "${HOME}"]) needles.add(h + rel);
		}
	}
	needles.add(LEDGER_DB_ENV);
	return { files, needles: [...needles] };
}

/**
 * A file-resource path with any SQLite selector stripped (`ledger.db:workloads:wl-x` → `ledger.db`):
 * the underlying file is what a write reaches (astra review B2).
 */
function withoutSelector(path: string): string {
	const slash = path.lastIndexOf("/");
	const colon = path.indexOf(":", slash + 1);
	return colon > 0 ? path.slice(0, colon) : path;
}

/** Is `path` (resolved against `dir`) the ledger file or a sibling? */
function isLedgerFile(path: string, dir: string, paths: LedgerPaths): boolean {
	for (const p of new Set([path, withoutSelector(path)])) {
		const abs = resolve(dir, p);
		const canon = canonicalPath(abs);
		if (paths.files.some((f) => SIBLINGS.some((s) => abs === f + s || canon === f + s))) return true;
	}
	return false;
}

/** Does a word name the ledger: a needle anywhere in it, or a path to the file or a sibling? */
function wordNamesLedger(w: Word, dir: string, paths: LedgerPaths): boolean {
	if (paths.needles.some((n) => w.text.includes(n))) return true;
	return !w.opaque && w.text !== "" && isLedgerFile(w.text, dir, paths);
}

/** The script bun or node executes (`bun x.ts`, `bun run x.ts`, `node x.js`); null with inline code or none. */
function executedScript(e: Exec): string | null {
	const name = basename(e.argv[0]!.text);
	if (name !== "bun" && name !== "node") return null;
	let args = e.argv.slice(1);
	if (name === "bun" && args[0]?.text === "run") args = args.slice(1);
	for (const w of args) {
		if (w.opaque) return null;
		if (/^(-e|--eval|-p|--print)$/.test(w.text)) return null;
		if (w.text.startsWith("-")) continue;
		return resolve(e.dir, w.text);
	}
	return null;
}

/** Why one parsed command writes the ledger raw, or null. */
function rawWriteInExec(e: Exec, paths: LedgerPaths): string | null {
	for (const r of e.redirects) {
		if (r.op.includes(">") && r.target && (r.target.opaque ? paths.needles.some((n) => r.target!.text.includes(n)) : wordNamesLedger(r.target, e.dir, paths))) {
			return `a shell redirect into the ledger file (${r.op} ${r.target.text})`;
		}
	}
	if (!e.argv.some((w) => wordNamesLedger(w, e.dir, paths))) return null;
	const head = basename(e.argv[0]!.text);
	if (READ_ONLY_HEADS[head]) return null;
	if (head === "sqlite3" && e.argv.some((w) => w.text === "-readonly")) return null;
	const script = executedScript(e);
	if (script && canonicalPath(script).startsWith(`${LEDGER_SCRIPTS}/`)) return null;
	return `\`${head}\` on the ledger file outside the ledger module (${e.argv.map((w) => w.text).join(" ")})`;
}

/** An `open…(` call and its receiver chain (`open(`, `fs.openSync(`, `fs.promises.open(`). */
const OPEN_CALL = /(?<![\w$])((?:[\w$]+\s*\.\s*)*)open\w*\s*\(/g;

/** A second-or-later `open` argument that cannot make it write: an empty (erased) literal, a number, or a text option. */
const HARMLESS_OPEN_ARG = /^(?:(?:encoding|errors|newline|buffering)\s*=\s*.*|(?:mode\s*=\s*)?(?:(["'`])\1|\d+))$/;

/**
 * Why an `open` call in the code could write, or null: a literal write mode (`"wb"`, `"a"`, `"r+"`),
 * a mode or flag argument that is not a literal, or write flags (`os.O_WRONLY`). The mode is a
 * literal, so it is read on the code with its literals intact (astra review round 2, R2-B4: the
 * check ran on the code with literals erased, so `open(p, "wb")` read as `open(p, "")`).
 * `Ledger.open(…)` is the module and passes.
 */
function writingOpen(facts: CodeFacts): string | null {
	if (/\bO_(?:WRONLY|RDWR|CREAT|TRUNC|APPEND)\b/.test(facts.folded)) return "an open with write flags";
	for (const m of facts.folded.matchAll(/\bopen\w*\s*\([^()]*?["'`]([rwxabtU+]{1,4})["'`]/g)) {
		if (/[wax+]/.test(m[1]!)) return `an open in write mode "${m[1]}"`;
	}
	for (const m of facts.bare.matchAll(OPEN_CALL)) {
		if (/^Ledger\s*\.\s*$/.test(m[1]!)) continue;
		const args = callArgs(facts.bare, m.index! + m[0].length - 1);
		if (args === null) return `an ${m[0].trim()}…) the gate could not read to its end`;
		const extra = topLevelArgs(args).slice(1).find((a) => !HARMLESS_OPEN_ARG.test(a));
		if (extra !== undefined) return `an ${m[0].trim()}…) whose mode the gate cannot read (${extra.slice(0, 60)})`;
	}
	return null;
}

/**
 * Why eval (or inline `bun -e`) code writes the ledger raw, or null. Code that names the ledger — its
 * path (constant concatenations folded), its file name, or the env var — may call the module
 * (`Ledger.open(path)`) and nothing else: any file-write, SQLite or process API, or an `open` in a
 * write mode or a mode the gate cannot read, refuses it.
 */
function rawWriteInCode(code: string, paths: LedgerPaths): string | null {
	const facts = codeFacts(code);
	const file = basename(paths.files[0]!);
	const names =
		paths.needles.some((n) => facts.folded.includes(n)) ||
		facts.literals.some((l) => SIBLINGS.some((s) => l.endsWith(file + s)) || paths.files.some((f) => l.startsWith(dirname(f)) && l.includes(file)));
	if (!names) return null;
	const api = WRITE_API.exec(facts.bare) ?? SPAWN_API.exec(facts.bare) ?? /\.\s*write_(?:text|bytes)\s*\(/.exec(facts.bare);
	if (api) return `eval code naming the ledger file and calling ${api[0].trim()} (only ledger/src/index.ts writes it)`;
	const open = writingOpen(facts);
	return open ? `eval code naming the ledger file with ${open} (only ledger/src/index.ts writes it)` : null;
}

function refuse(what: string): Refusal {
	return {
		block: true,
		reason:
			`P-11 row 10 refused this: ${what}. The ledger's rules live in the file and its writer is the ledger module ` +
			`(ledger/src/index.ts, SPEC-2.0.md § B2); a raw write bypasses its provenance and would be refused by the file's triggers or corrupt WAL state. ` +
			`Write through the module (Ledger.open(...).recordInstruction / raiseQuestion / …) in code that does nothing else to the file. To inspect, use \`sqlite3 -readonly <ledger>\`.`,
	};
}

/** Row 10 over one tool call. */
export function checkRawLedgerWrite(call: ToolCall, ctx: CallContext): Refusal {
	const paths = ledgerPaths(ctx.env);
	if (call.toolName === "bash") {
		const cmd = String(call.input.command ?? "");
		const x = expandShell(cmd, typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd, ctx.env);
		for (const e of x.commands) {
			const why = rawWriteInExec(e, paths);
			if (why) return refuse(why);
		}
		for (const c of x.code) {
			const why = rawWriteInCode(c.text, paths);
			if (why) return refuse(`inline ${c.lang} code: ${why}`);
		}
		// What the gate cannot see may name the ledger: refuse only when the command text does (row 6 refuses the rest).
		if (x.blind.length > 0 && paths.needles.some((n) => cmd.includes(n) || cmd.includes(basename(paths.files[0]!)))) {
			return refuse(`a command naming the ledger that the gate cannot read to the end (${x.blind[0]})`);
		}
		return null;
	}
	if (call.toolName === "eval") {
		const why = rawWriteInCode(String(call.input.code ?? call.input.cell ?? ""), paths);
		return why ? refuse(why) : null;
	}
	for (const target of writeTargets(call, ctx.cwd)) {
		if (isLedgerFile(target, ctx.cwd, paths)) return refuse(`a ${call.toolName} to ${target}, the ledger file or its WAL/SHM/journal sibling`);
	}
	return null;
}
