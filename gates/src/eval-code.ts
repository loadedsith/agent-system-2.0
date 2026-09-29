// Lexical analysis of `eval` code (and inline `bun -e`/`python -c` code) for rows 6 and 10. The gate
// cannot run or type-check arbitrary code, so it reads what it can soundly read — string literals,
// constant concatenations, literal argv arrays — and fails closed where the code spawns a process
// or writes a file with arguments it cannot read (astra review B1, B2).

import type { CodeFamily } from "./exec";

/** One string literal's value per match; template literals only when they have no `${…}`. */
const LITERAL = /"((?:\\.|[^"\\\n])*)"|'((?:\\.|[^'\\\n])*)'|`((?:\\.|[^`\\])*)`/g;

const unescape = (s: string): string => s.replace(/\\(.)/g, (_, c: string) => ({ n: "\n", t: "\t", r: "\r" })[c] ?? c);

/** Fold `"a" + "b"` into `"ab"` until nothing folds (quotes normalised to `"`). */
export function foldConcat(code: string): string {
	const pair = /(["'])((?:\\.|(?!\1)[^\\\n])*)\1\s*\+\s*(["'])((?:\\.|(?!\3)[^\\\n])*)\3/;
	let out = code;
	for (let n = 0; n < 1000; n++) {
		const m = pair.exec(out);
		if (!m) break;
		const joined = unescape(m[2]!) + unescape(m[4]!);
		out = out.slice(0, m.index) + JSON.stringify(joined) + out.slice(m.index + m[0].length);
	}
	return out;
}

export interface CodeFacts {
	/** The code with constant concatenations folded. */
	folded: string;
	/** Every string literal value (after folding). */
	literals: string[];
	/** Literal-only arrays joined with spaces: `["git","push","-f"]` → `git push -f`. */
	argvLists: string[];
	/** The folded code with every literal emptied: what is left is code, not text. */
	bare: string;
	/**
	 * The folded code with each literal's body blanked to `_` but its length kept, so a position in
	 * `masked` is the same position in `folded`: the call structure is read here, the argument text
	 * there (M4 fix round 4, B2: arguments are captured before erasure, never re-scanned after it).
	 */
	masked: string;
}

export function codeFacts(code: string): CodeFacts {
	const folded = foldConcat(code);
	const literals: string[] = [];
	for (const m of folded.matchAll(LITERAL)) {
		if (m[3] !== undefined && m[3].includes("${")) continue;
		literals.push(unescape(m[1] ?? m[2] ?? m[3] ?? ""));
	}
	const argvLists: string[] = [];
	const lit = String.raw`(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`;
	for (const m of folded.matchAll(new RegExp(String.raw`\[\s*(${lit}(?:\s*,\s*${lit})*)\s*,?\s*\]`, "g"))) {
		argvLists.push([...m[1]!.matchAll(LITERAL)].map((x) => unescape(x[1] ?? x[2] ?? "")).join(" "));
	}
	const bare = folded.replace(LITERAL, (s) => (s.startsWith("`") && s.includes("${") ? s : `${s[0]}${s[0]}`));
	const masked = folded.replace(LITERAL, (s) => (s.startsWith("`") && s.includes("${") ? s : `${s[0]}${"_".repeat(s.length - 2)}${s[0]}`));
	return { folded, literals, argvLists, bare, masked };
}

/** APIs that start a process (JS/TS and Python spellings). */
export const SPAWN_API =
	/\bBun\s*\.\s*(?:\$|spawn|spawnSync)\b|(?:^|[^\w.])\$\s*`|\bchild_process\b|\b(?:execSync|execFileSync|spawnSync|execFile|execa|execaSync)\b|\bsubprocess\s*\.|\bos\s*\.\s*(?:system|popen|exec\w*|spawn\w*|posix_spawn\w*)\b|\bDeno\s*\.\s*(?:Command|run)\b|\bshelljs\b|\bpty\s*\.\s*spawn\b/;

/** Call names that take a command or argv, inside code that uses a spawn API. */
const SPAWN_CALL = /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|execa|execaSync|system|popen|Popen|run|call|check_call|check_output|getoutput|getstatusoutput|Command)\s*\(/g;

/** The argument text of the call whose `(` is at `open`, with nested brackets kept; null if unbalanced. */
export function callArgs(bare: string, open: number): string | null {
	let depth = 0;
	for (let i = open; i < bare.length; i++) {
		const c = bare[i];
		if (c === "(" || c === "[" || c === "{") depth++;
		else if ((c === ")" || c === "]" || c === "}") && --depth === 0) return bare.slice(open + 1, i);
	}
	return null;
}

/** A call's argument text split at its top-level commas, each trimmed. */
export function topLevelArgs(args: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = "";
	for (const c of args) {
		if (c === "(" || c === "[" || c === "{") depth++;
		else if (c === ")" || c === "]" || c === "}") depth--;
		if (c === "," && depth === 0) {
			out.push(cur.trim());
			cur = "";
		} else cur += c;
	}
	out.push(cur.trim());
	return out;
}

/** Process-starting spellings in Perl and Ruby: `system`, `exec`, `spawn`, `qx`, `%x`, backticks, `IO.popen`, `Open3`, a pipe `open`. */
export const SCRIPT_SPAWN_API =
	/(?<![\w$@%:.>-])(?:system|exec|spawn|readpipe|qx)\b|%x|`|\bIO\s*\.\s*popen\b|\bOpen3\b|\bProcess\s*\.\s*spawn\b|\bKernel\s*\.\s*(?:system|exec|spawn)\b|(?<![\w$])open\s*\(?[^;\n]*["'](?:[^"'\n]*\||-\|)/;

/** A Perl or Ruby spawn word whose arguments run to the end of the statement (`system join(…)`, `exec $cmd`). */
const SCRIPT_SPAWN_CALL = /(?<![\w$@%:.>-])(?:system|exec|spawn|readpipe)\b|\bIO\s*\.\s*popen\b|\bProcess\s*\.\s*spawn\b/g;

/**
 * Why the code starts a process with arguments the gate cannot read, or null. A tagged template
 * with `${…}` (`Bun.$\`${argv}\``) or a spawn call with a non-literal argument is unreadable. For
 * Perl and Ruby (astra review round 2, R2-B2: `perl -e 'system join("","r","m -r","f …")'`) a spawn
 * whose arguments are not plain literals, `qx`/`%x`, or an interpolating backtick or string is unreadable.
 */
export function opaqueSpawn(facts: CodeFacts, family?: CodeFamily): string | null {
	if (family === "perl" || family === "ruby") {
		if (!SCRIPT_SPAWN_API.test(facts.folded)) return null;
		if (/(?<![\w$@%:.>-])qx\b|%x/.test(facts.bare)) return "a qx/%x command the gate does not read";
		// Perl and Ruby strings interpolate (`"rm $x"`, `"r#{m}"`): a literal that does is not text the gate can read.
		for (const m of facts.folded.matchAll(LITERAL)) {
			const body = m[1] ?? m[3];
			if (body !== undefined && /[$@][\w{]|#\{/.test(body)) return `a string that interpolates values (${m[0].slice(0, 80)}) in code that starts processes`;
		}
		for (const m of facts.bare.matchAll(SCRIPT_SPAWN_CALL)) {
			const after = m.index! + m[0].length;
			const open = /^\s*\(/.exec(facts.bare.slice(after));
			const args = open ? callArgs(facts.bare, after + open[0].length - 1) : (/^[^;\n}]*/.exec(facts.bare.slice(after))?.[0] ?? "");
			if (args === null) return `a ${m[0]} call the gate could not read to its end`;
			const rest = args.replace(/(["'`])\1/g, "").replace(/[\s,[\]()]/g, "");
			if (rest !== "") return `a ${m[0]} call whose arguments are computed (${args.trim().slice(0, 80)})`;
		}
		return null;
	}
	if (!SPAWN_API.test(facts.folded)) return null;
	if (/(?:\bBun\s*\.\s*\$|(?:^|[^\w.])\$)\s*`(?:\\.|[^`\\])*\$\{/.test(facts.folded)) return "a shell template (`$`…`) interpolating values the gate cannot read";
	for (const m of facts.bare.matchAll(SPAWN_CALL)) {
		const args = callArgs(facts.bare, m.index! + m[0].length - 1);
		if (args === null) return `a ${m[0].slice(0, -1).trim()}(…) call the gate could not read to its end`;
		// Drop option objects (`{ cwd: dir }`), empty literals and punctuation; anything left is a value the gate cannot read.
		const rest = args.replace(/\{[^{}]*\}/g, "").replace(/(["'`])\1/g, "").replace(/[\s,[\]()]/g, "");
		if (rest !== "") return `a ${m[0].slice(0, -1).trim()}(…) call whose arguments are computed (${args.trim().slice(0, 80)})`;
	}
	return null;
}

/**
 * File-writing APIs (JS/TS and Python spellings), and SQLite handles. `openSync` is not here: the
 * open family gets the typed read-only proof in r10 writingOpen (astra-5 R5-S3). A `Bun.file()`
 * handle is judged there too, where its every use is read (R5-B3); the direct `.write`/`.writer`
 * spelling stays here.
 */
export const WRITE_API =
	/\bBun\s*\.\s*(?:write|file\s*\([^)]*\)\s*\.\s*write\w*)\b|\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|truncate|truncateSync|unlink|unlinkSync|rm|rmSync|rename|renameSync|copyFile|copyFileSync|cp|cpSync|symlink|symlinkSync|link|linkSync)\s*\(|(?<![\w.])open\s*\([^)]*,\s*["'][^"']*[wax+]|\bbun:sqlite\b|\bbetter-sqlite3\b|\bnode:sqlite\b|\bsqlite3\b|\bapsw\b|\bnew\s+Database\s*\(|\bshutil\s*\.|\bos\s*\.\s*(?:remove|unlink|rename|replace)\b|\bPath\s*\([^)]*\)\s*\.\s*(?:write_\w+|unlink|rename|replace|touch)\b/;

/**
 * Browser mutations called on any receiver (`t.click(`, `page.fill("#q", …)`, `(await x).press(`).
 * `fill` counts only with a selector string first, so `Array(3).fill(0)` is not a browser write.
 */
export const BROWSER_WRITE_CALL =
	/\.\s*(click|dblclick|press|pressSequentially|uncheck|setChecked|selectOption|setInputFiles|dragTo|dragAndDrop|submit|tap|typeText|uploadFile|handleDialog|fill(?=\s*\(\s*["'`]))\s*\(/;
