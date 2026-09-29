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
import { type CodeFacts, callArgs, codeFacts, SPAWN_API, WRITE_API } from "../eval-code";
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

/**
 * `sqlite3` dot-commands a ledger inspection may run: each only prints (sqlite.org/cli.html). Not
 * `.open` (it closes the read-only connection and reopens the file read-write: astra's control,
 * `sqlite3 -readonly /dev/null .databases '.open /dev/null' .databases` prints `r/o` then `r/w`),
 * nor `.shell`/`.system` (run a program), `.read` (more commands from a file), `.import`,
 * `.restore`, `.load` (an extension), or any other.
 */
const SQLITE_READ_DOT = /^\.(?:tables|schema|indexes|headers|mode|dump|databases)$/;
/** Pragmas that only report. */
const SQLITE_READ_PRAGMA = /^PRAGMA\s+(?:table_info|user_version|foreign_key_list|index_list|schema_version)\s*(?:\(\s*[\w"'`]+\s*\))?$/i;
/**
 * Everything that may stand before `(` in a modeled read statement: SQLite's core read functions and
 * the keywords that take a parenthesis. `writefile()`, `readfile()`, `edit()` and
 * `load_extension()` are not here: `sqlite3 -readonly` does not stop them (live, sqlite 3.50.6:
 * `sqlite3 -readonly :memory: "SELECT writefile('/tmp/…','x')"` wrote the file).
 */
const SQLITE_READ_CALL: Record<string, true> = Object.fromEntries(
	(
		"count sum total min max avg group_concat string_agg length octet_length lower upper substr substring trim ltrim rtrim " +
		"replace instr coalesce ifnull nullif iif typeof abs round printf format quote hex unicode char like glob datetime date " +
		"time julianday strftime unixepoch json json_extract json_array json_object json_array_length json_type json_valid " +
		"json_each json_tree json_group_array json_group_object in exists as over filter cast using on values from join and or not " +
		"select where when then else case by having distinct all union intersect except is between"
	)
		.split(" ")
		.map((n) => [n, true]),
);

/** The statements of one SQL argument, split at `;` outside quotes; null when it has a comment or an unclosed quote. */
function sqlStatements(sql: string): string[] | null {
	const out: string[] = [];
	let cur = "";
	let quote = "";
	for (let i = 0; i < sql.length; i++) {
		const c = sql[i]!;
		if (quote) {
			if (c === quote) quote = "";
		} else if (c === "'" || c === '"' || c === "`" || c === "[") quote = c === "[" ? "]" : c;
		else if ((c === "-" && sql[i + 1] === "-") || (c === "/" && sql[i + 1] === "*")) return null;
		else if (c === ";") {
			out.push(cur.trim());
			cur = "";
			continue;
		}
		cur += c;
	}
	if (quote) return null;
	out.push(cur.trim());
	return out.filter((s) => s !== "");
}

/** Why one SQL argument of a ledger inspection is not a modeled read, or null. */
function unreadSql(sql: string): string | null {
	const statements = sqlStatements(sql);
	if (statements === null) return `SQL with a comment or an unclosed quote (${sql.slice(0, 60)})`;
	if (statements.length === 0) return "an empty SQL argument";
	for (const s of statements) {
		const first = /^\w+/.exec(s)?.[0]?.toUpperCase();
		if (first === "PRAGMA") {
			if (!SQLITE_READ_PRAGMA.test(s)) return `a pragma outside the read set (${s.slice(0, 60)})`;
			continue;
		}
		if (first !== "SELECT" && first !== "WITH" && first !== "EXPLAIN") return `a statement that is not SELECT, WITH, EXPLAIN or a read pragma (${s.slice(0, 60)})`;
		// Names before `(` outside quotes: each a read function or keyword.
		const unquoted = s.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"|`[^`]*`|\[[^\]]*\]/g, "''");
		for (const m of unquoted.matchAll(/([A-Za-z_][\w$]*)\s*\(/g)) {
			if (!SQLITE_READ_CALL[m[1]!.toLowerCase()]) return `a call to ${m[1]}() in SQL, outside the read functions`;
		}
	}
	return null;
}

/**
 * Why a `sqlite3` command naming the ledger is not the one modeled inspection, or null (M4 fix
 * round 4, B4). Modeled exactly: `sqlite3 -readonly <literal ledger path>` and then one or more
 * literal arguments, each a dot-command from SQLITE_READ_DOT or SQL whose statements start with
 * SELECT, WITH, EXPLAIN or a read pragma and call only read functions. sqlite3 runs each argument
 * after the file as a command, in order, on the connection `-readonly` opened; with at least one it
 * reads nothing from stdin (live, sqlite 3.50.6: `echo .tables | sqlite3 /dev/null "SELECT 1"` printed
 * only `1`). A write statement that slips in (`WITH … DELETE`) meets that read-only connection,
 * which nothing in the modeled form can replace. Any other option (`-cmd`, `-init`, a second
 * `-readonly` after the file), a stdin redirect, a `file:` URI or a non-literal word refuses.
 */
function unmodeledSqlite(e: Exec, paths: LedgerPaths): string | null {
	const [, flag, db, ...commands] = e.argv;
	if (flag?.text !== "-readonly") return "sqlite3 on the ledger without `-readonly` as its first option";
	if (!db || db.opaque || db.expanded || db.glob || /^file:|\?/i.test(db.text)) return "sqlite3 -readonly with a database that is not the literal ledger path";
	const canon = canonicalPath(resolve(e.dir, db.text));
	if (!paths.files.includes(canon) && !paths.files.includes(resolve(e.dir, db.text))) return `sqlite3 -readonly on ${db.text}, which is not the ledger file itself`;
	if (e.redirects.some((r) => r.op.includes("<"))) return "sqlite3 -readonly reading commands from a redirect";
	if (commands.length === 0) return "sqlite3 -readonly with no command arguments (it would read commands from stdin)";
	for (const w of commands) {
		if (w.opaque || w.expanded || w.glob) return "sqlite3 -readonly with a command argument that is not literal text";
		const t = w.text.trim();
		if (t.startsWith(".")) {
			if (/[\n;]/.test(t) || !SQLITE_READ_DOT.test(t.split(/\s+/)[0]!)) return `the dot-command \`${t.slice(0, 40)}\`, outside the read set`;
			continue;
		}
		if (t.startsWith("-")) return `the sqlite3 option \`${t}\` after the database`;
		const why = unreadSql(t);
		if (why) return why;
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
	if (head === "sqlite3") {
		const why = unmodeledSqlite(e, paths);
		return why ? `${why} (${e.argv.map((w) => w.text).join(" ")})` : null;
	}
	const script = executedScript(e);
	if (script && canonicalPath(script).startsWith(`${LEDGER_SCRIPTS}/`)) return null;
	return `\`${head}\` on the ledger file outside the ledger module (${e.argv.map((w) => w.text).join(" ")})`;
}

/**
 * The open family, with its receiver chain: builtin `open`, `os.open`, `io.open`, `fs.open`,
 * `fs.openSync`, `fs.promises.open`, `Path(p).open`, `codecs.open`, `io.FileIO`, `os.fdopen`. Read on
 * the masked code, so a name inside a literal is not a match (it is caught as a literal instead).
 */
const OPEN_NAME = /(?<![\w$])((?:[\w$]+\s*\.\s*)*)(open\w*|fdopen|FileIO)(?![\w$])/g;
/** A literal naming an open-family API or the receiver/constant of the named read-only flag: the code reaches it by name (`fs["open"]`, `getattr(os, "open")`, `sys.modules["os"]`). */
const REFLECTED_NAME = /^(?:open\w*|fdopen|FileIO|os|O_RDONLY)$/;
/** Ways code rebinds or reaches a name through a string, which the gate cannot follow. */
const REFLECTION = /(?<![\w$.])(?:exec|eval|compile|setattr|delattr|globals|locals|vars|__builtins__|__dict__|Reflect|defineProperty|Function)\b|\bsys\s*\.\s*modules\b/;
/**
 * A mode argument that proves an open reads only (M4 fix round 4, B2): the string modes `r`, `rb`
 * and `rt`, bare or as `mode=`/`flags=`. Sources, fetched 2026-09-29:
 * - Node, https://nodejs.org/api/fs.html#file-system-flags: `'r'` "Open file for reading"; every
 *   other flag string writes, appends, creates or (`'rs'`, `'rs+'`) is outside this set — `'as'`,
 *   `'as+'` append and `'rs+'` opens "for reading and writing" (astra R4-B2, triad #3).
 * - Python, https://docs.python.org/3/library/functions.html#open: `'r'` reading (the default), `'b'`
 *   binary, `'t'` text; `'w'`, `'x'`, `'a'` and `'+'` write.
 * Numeric flags are over-approximated as writable on purpose (triad, Kimi): a number is O_* bits
 * the gate would have to decode per platform (1 is O_WRONLY on Linux and macOS), so every number
 * refuses, as does any computed value.
 */
const READ_ONLY_MODE = /^(?:(?:mode|flags)\s*=\s*)?(["'`])(?:r|rb|rt)\1$/;
/** Python's text options, which never change what an open may do to the file. */
const TEXT_OPTION = /^(?:encoding|errors|newline)\s*=/;

/** An assignment operator (`=`, `+=`, `:=`, …), not a comparison. */
const ASSIGN = /(?<![=!<>])(?:[-+*/%&|^@:]|<<|>>|\/\/|\*\*)?=(?!=)/;

/**
 * The statement of `code` around `at`: from the last top-level `;` or newline before it to the next
 * after it. Bracket depth is tracked, so a call spanning lines is one statement.
 */
function statementAt(code: string, at: number): { before: string; after: string } {
	let start = 0;
	let depth = 0;
	for (let i = 0; i < at; i++) {
		const c = code[i];
		if (c === "(" || c === "[" || c === "{") depth++;
		else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
		else if ((c === ";" || c === "\n") && depth === 0) start = i + 1;
	}
	let end = code.length;
	for (let i = at; i < code.length; i++) {
		const c = code[i];
		if (c === "(" || c === "[" || c === "{") depth++;
		else if (c === ")" || c === "]" || c === "}") depth = Math.max(0, depth - 1);
		else if ((c === ";" || c === "\n") && depth === 0) {
			end = i;
			break;
		}
	}
	return { before: code.slice(start, at), after: code.slice(at, end) };
}

/**
 * Is `os.O_RDONLY` in this code the read-only flag (M4 fix round 4, B3)? Modeled only for Python's
 * `os`, bound by a plain `import os`, in code that never rebinds it: every `os` is the target of an
 * `import` without `as`/`from`, or an attribute read `os.<name>` in a statement with no assignment
 * after it and no `del`/`for`/`as`/`global`/`nonlocal` before it; every `O_RDONLY` is spelled
 * `os.O_RDONLY`; no literal names `os` or `O_RDONLY`; no reflection (REFLECTION). That keeps
 * `import os; os.open(p, os.O_RDONLY)` and refuses `os.O_RDONLY = 1`, `import posix as os`,
 * `setattr(os, …)`, `del os.O_RDONLY`, `for os.O_RDONLY in …` and `(a, os.O_RDONLY) = …`. The rule
 * refuses some harmless code too (`print(os.O_RDONLY, sep="")`): it is fail-closed by design.
 */
function readOnlyConstant(facts: CodeFacts): boolean {
	const m = facts.masked;
	if (REFLECTION.test(m) || facts.literals.some((l) => l === "os" || l === "O_RDONLY")) return false;
	for (const o of m.matchAll(/(?<![\w$])O_RDONLY(?![\w$])/g)) {
		if (!/(?<![\w$.])os\s*\.\s*$/.test(m.slice(0, o.index))) return false;
	}
	for (const o of m.matchAll(/(?<![\w$.])os(?![\w$])/g)) {
		const { before, after } = statementAt(m, o.index!);
		if (/^\s*import\s+[\w.]+(?:\s*,\s*[\w.]+)*\s*$/.test(before + after) && !/\bas\b/.test(before + after)) continue;
		if (!/^os\s*\.\s*[\w$]+/.test(after)) return false;
		if (ASSIGN.test(after.slice(2)) || /\b(?:del|for|as|global|nonlocal|lambda|def|class)\b/.test(before)) return false;
	}
	return true;
}

/** A call's top-level arguments as spans of `folded`, split on `masked` (same positions); null if unbalanced. */
function argTexts(facts: CodeFacts, open: number): string[] | null {
	const inner = callArgs(facts.masked, open);
	if (inner === null) return null;
	const out: string[] = [];
	let depth = 0;
	let from = open + 1;
	for (let i = open + 1; i <= open + inner.length; i++) {
		const c = facts.masked[i];
		if (c === "(" || c === "[" || c === "{") depth++;
		else if (c === ")" || c === "]" || c === "}") depth--;
		else if (c === "," && depth === 0) {
			out.push(facts.folded.slice(from, i).trim());
			from = i + 1;
		}
	}
	out.push(facts.folded.slice(from, open + 1 + inner.length).trim());
	return out.filter((a) => a !== "");
}

/**
 * Why an open in the code could write, or null (M4 fix round 4, B2: typed argument capture replaces
 * erase-and-rescan). Every open-family name must be called where it is named (`f = os.open`,
 * `{ openSync: o } = fs` and `fs["open"]` hide which open runs and with what, so they refuse), and
 * each call's arguments after the path — or all of them for a method on a call result
 * (`Path(p).open("w")`) — must each be a READ_ONLY_MODE literal, a TEXT_OPTION, or `os.O_RDONLY`
 * where readOnlyConstant holds. No mode at all is a read (both defaults are `r`). `Ledger.open(…)`
 * is the module and passes.
 */
function writingOpen(facts: CodeFacts): string | null {
	const reflected = facts.literals.find((l) => REFLECTED_NAME.test(l) && l !== "os" && l !== "O_RDONLY");
	if (reflected !== undefined) return `a literal naming the open API "${reflected}" (an open reached by name)`;
	if (REFLECTION.test(facts.masked)) return "reflection (exec, eval, setattr, globals, …) that can rebind the open the code calls";
	for (const m of facts.masked.matchAll(OPEN_NAME)) {
		if (/^Ledger\s*\.\s*$/.test(m[1]!)) continue;
		const after = m.index! + m[0].length;
		const paren = /^\s*\(/.exec(facts.masked.slice(after));
		if (!paren) return `\`${m[0].trim()}\` named without being called (an alias hides which open runs and how)`;
		const args = argTexts(facts, after + paren[0].length - 1);
		if (args === null) return `an ${m[0].trim()}(…) the gate could not read to its end`;
		const method = m[1] === "" && facts.masked[m.index! - 1] === ".";
		for (const a of method ? args : args.slice(1)) {
			if (READ_ONLY_MODE.test(a) || TEXT_OPTION.test(a)) continue;
			if (/^(?:flags\s*=\s*)?os\s*\.\s*O_RDONLY$/.test(a) && readOnlyConstant(facts)) continue;
			return `an ${m[0].trim()}(…) whose mode or flags are not a literal read-only mode (${a.slice(0, 60)})`;
		}
	}
	return null;
}

/** SQLite (and other database) modules, as a module specifier: an import, `__import__`, `import()`, `require`. */
const DB_MODULE = /^(?:sqlite3|bun:sqlite|node:sqlite|better-sqlite3|sqlite|apsw|sqlalchemy|peewee|dataset|duckdb)$/;
/** Module acquisition the gate cannot resolve to a name: a computed `import()`, `require`, `__import__` or `importlib`. */
const COMPUTED_IMPORT = /\b(?:__import__|import_module|require|import)\s*\(\s*(?!["'`][^"'`]*["'`]\s*\))/;

/**
 * Why eval (or inline `bun -e`) code writes the ledger raw, or null. Code names the ledger when it
 * carries its path (constant concatenations folded), its file name, the env var, or any literal
 * path that canonicalizes (the direct-write realpath check) to the ledger or a sibling (R3-B5).
 * Such code may call the module (`Ledger.open(path)`) and read bytes with a literal read-only open
 * (writingOpen); any file-write, database module (typed before literal erasure, so
 * `__import__("sqlite3")` and `import("bun:sqlite")` count, R3-B4), computed import, process API,
 * or open that is not provably read-only refuses it. No database module is modeled on the ledger,
 * whatever its options: `readonly: true` is refused like any other handle (M4 fix round 4, B5,
 * Plumb's ruling; the constructor's options are not read at all).
 */
function rawWriteInCode(code: string, paths: LedgerPaths, dir: string): string | null {
	const facts = codeFacts(code);
	const file = basename(paths.files[0]!);
	const names =
		paths.needles.some((n) => facts.folded.includes(n)) ||
		facts.literals.some(
			(l) =>
				SIBLINGS.some((s) => l.endsWith(file + s)) ||
				paths.files.some((f) => l.startsWith(dirname(f)) && l.includes(file)) ||
				(l !== "" && !l.includes("\n") && l.length < 4096 && /^[~./\w]/.test(l) && isLedgerFile(l.replace(/^~(?=\/|$)/, process.env.HOME ?? "~"), dir, paths)),
		);
	if (!names) return null;
	const module = facts.literals.find((l) => DB_MODULE.test(l));
	if (module) return `eval code naming the ledger file and loading the database module "${module}" (no in-process database handle to the ledger is modeled, \`readonly: true\` included)`;
	const computed = COMPUTED_IMPORT.exec(facts.folded);
	if (computed) return `eval code naming the ledger file and loading a module the gate cannot name (${computed[0].trim()}…)`;
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
			`Write through the module (Ledger.open(...).recordInstruction / raiseQuestion / …) in code that does nothing else to the file. ` +
			`To read the ledger there are two ways: the ledger module (Ledger.open(path) and its readers: workload, entries, routings, instructions, provenance, …), ` +
			`or in bash \`sqlite3 -readonly <literal ledger path>\` followed only by read dot-commands (.tables .schema .indexes .headers .mode .dump .databases) and SELECT / WITH / EXPLAIN / read-pragma SQL. ` +
			`No in-process database handle to the ledger is modeled, \`readonly: true\` included. ` +
			`Raw bytes may be read in eval with a literal read-only open of the literal path: \`open(path, "rb")\`, or \`import os\` then \`os.open(path, os.O_RDONLY)\`.`,
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
			const why = rawWriteInCode(c.text, paths, c.dir);
			if (why) return refuse(`inline ${c.lang} code: ${why}`);
		}
		// What the gate cannot see may name the ledger: refuse only when the command text does (row 6 refuses the rest).
		if (x.blind.length > 0 && paths.needles.some((n) => cmd.includes(n) || cmd.includes(basename(paths.files[0]!)))) {
			return refuse(`a command naming the ledger that the gate cannot read to the end (${x.blind[0]})`);
		}
		return null;
	}
	if (call.toolName === "eval") {
		const why = rawWriteInCode(String(call.input.code ?? call.input.cell ?? ""), paths, ctx.cwd);
		return why ? refuse(why) : null;
	}
	for (const target of writeTargets(call, ctx.cwd)) {
		if (isLedgerFile(target, ctx.cwd, paths)) return refuse(`a ${call.toolName} to ${target}, the ledger file or its WAL/SHM/journal sibling`);
	}
	return null;
}
