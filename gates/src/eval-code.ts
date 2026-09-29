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
	/**
	 * `masked` with the comments of the code's family blanked, same length (`COMMENT`): the code a reader
	 * runs. A literal whose opening quote is blank here sits in a comment (astra-8 S1: `// "constructor"`).
	 */
	uncommented: string;
	/** `literals` then `argvLists`, less those inside a comment of the code's family: the text the code can run (astra-9 R1). */
	codeLiterals: string[];
	/** The bodies of `Bun.$\`…\`` templates without `${…}` outside comments: the commands Bun's shell tag runs. */
	shellTags: string[];
}

/** Words after which `[` opens an array literal, not a member access (`return ["a"]`, Python `in ["a"]`). */
const NOT_RECEIVER = /^(?:return|typeof|instanceof|in|of|yield|await|case|else|do|void|delete|new|throw|not|and|or|is|if|elif|while|for|lambda|assert|print|with|from|import|export|default|extends)$/;
/** A receiver followed by `[`: the word, `)` or `]` before it (the word group is empty for `)`/`]`). */
const MEMBER_OPEN = /([\w$]*)([\w$)\]])(\s*)\[/g;

/**
 * `x["ident"]`, `x['ident']` and `` x[`ident`] `` rewritten to `x.ident`, so a method named in a
 * string is read as the method (`f["writer"]()["write"]("x")` is `f.writer().write("x")`, astra-6 B8).
 * Everything else downstream (literals, bare, masked) is computed from the rewritten code.
 */
function dotAccess(code: string): string {
	const key = /^\[\s*(["'`])([A-Za-z_$][\w$]*)\1\s*\]/;
	let out = "";
	let last = 0;
	for (const m of code.matchAll(MEMBER_OPEN)) {
		if (NOT_RECEIVER.test(m[1]! + m[2]!)) continue;
		const open = m.index! + m[0].length - 1;
		const k = key.exec(code.slice(open));
		if (!k) continue;
		out += `${code.slice(last, m.index! + m[1]!.length + m[2]!.length)}.${k[2]}`;
		last = open + k[0].length;
	}
	return out + code.slice(last);
}

/**
 * The first member access whose key is computed at run time (`f[k]`, `f[a + b]`), or null. Keys the
 * gate reads are allowed: a string literal, a number or slice (`b[0]`, `b[-4:]`), or empty (`T[]`).
 * Code naming the ledger refuses one (astra-6 B8): the method it reaches cannot be named.
 */
export function computedMember(facts: CodeFacts): string | null {
	return firstComputedMember(facts.masked, facts.folded);
}

function firstComputedMember(masked: string, folded: string): string | null {
	for (const m of masked.matchAll(MEMBER_OPEN)) {
		if (NOT_RECEIVER.test(m[1]! + m[2]!)) continue;
		const inner = callArgs(masked, m.index! + m[0].length - 1);
		if (inner === null) return `${m[0]}…`;
		if (/^\s*(?:(["'`])_*\1|[\d\s:+-]*)\s*$/.test(inner)) continue;
		return `${m[0]}${folded.slice(m.index! + m[0].length, m.index! + m[0].length + inner.length)}]`;
	}
	return null;
}

/**
 * Comment syntax per code family, read on `masked` (string bodies are `_`, so a marker inside a string
 * is not a comment). JS: `//…` and `/* … *\/` (JSDoc included); `#` is a private name, not a comment.
 * Python: `#…`; `//` is floor division (`n = a // 2; open(p, "w")` is code). A family with no entry,
 * or code whose family is not known, blanks nothing: the gate reads it all as code.
 */
const COMMENT: Partial<Record<CodeFamily, RegExp>> = {
	js: /\/\*[\s\S]*?\*\/|(?<![:\w$])\/\/[^\n]*/g,
	python: /#[^\n]*/g,
};

/**
 * Bun's shell tag, `Bun.$\`…\`` and `Bun.$(…)`. SPAWN_API's `Bun\.\$\b` needs a word character after
 * `$`, so it misses both; code whose only process start is this tag runs its tagged templates, not
 * every string it holds (astra-9 R1).
 */
export const BUN_SHELL_TAG = /\bBun\s*\.\s*\$(?![\w$])/;

export function codeFacts(code: string, family?: CodeFamily): CodeFacts {
	const folded = dotAccess(foldConcat(code));
	const bare = folded.replace(LITERAL, (s) => (s.startsWith("`") && s.includes("${") ? s : `${s[0]}${s[0]}`));
	const masked = folded.replace(LITERAL, (s) => (s.startsWith("`") && s.includes("${") ? s : `${s[0]}${"_".repeat(s.length - 2)}${s[0]}`));
	const comment = family && COMMENT[family];
	const uncommented = comment ? masked.replace(comment, (s) => s.replace(/[^\n]/g, " ")) : masked;
	// A literal (or argv list) whose opening character is blanked in `uncommented` sits in a comment.
	const literals: string[] = [];
	const codeLiterals: string[] = [];
	for (const m of folded.matchAll(LITERAL)) {
		if (m[3] !== undefined && m[3].includes("${")) continue;
		const v = unescape(m[1] ?? m[2] ?? m[3] ?? "");
		literals.push(v);
		if (uncommented[m.index!] === m[0][0]) codeLiterals.push(v);
	}
	const argvLists: string[] = [];
	const lit = String.raw`(?:"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`;
	for (const m of folded.matchAll(new RegExp(String.raw`\[\s*(${lit}(?:\s*,\s*${lit})*)\s*,?\s*\]`, "g"))) {
		const v = [...m[1]!.matchAll(LITERAL)].map((x) => unescape(x[1] ?? x[2] ?? "")).join(" ");
		argvLists.push(v);
		if (uncommented[m.index!] === "[") codeLiterals.push(v);
	}
	const shellTags: string[] = [];
	for (const m of uncommented.matchAll(/\bBun\s*\.\s*\$\s*`/g)) {
		const body = /^`((?:\\.|[^`\\])*)`/.exec(folded.slice(m.index! + m[0].length - 1))?.[1];
		if (body !== undefined && !body.includes("${")) shellTags.push(unescape(body));
	}
	return { folded, literals, argvLists, bare, masked, uncommented, codeLiterals, shellTags };
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
	const spawnApi = SPAWN_API.test(facts.folded);
	if (!spawnApi && !BUN_SHELL_TAG.test(facts.folded)) return null;
	if (/(?:\bBun\s*\.\s*\$|(?:^|[^\w.])\$)\s*`(?:\\.|[^`\\])*\$\{/.test(facts.folded)) return "a shell template (`$`…`) interpolating values the gate cannot read";
	// Code whose only process start is Bun's shell tag has no spawn calls to read (`re.exec(s)` is not one).
	if (!spawnApi) return null;
	for (const m of facts.bare.matchAll(SPAWN_CALL)) {
		const args = callArgs(facts.bare, m.index! + m[0].length - 1);
		if (args === null) return `a ${m[0].slice(0, -1).trim()}(…) call the gate could not read to its end`;
		// Drop option objects (`{ cwd: dir }`), empty literals and punctuation; anything left is a value the gate cannot read.
		const rest = args.replace(/\{[^{}]*\}/g, "").replace(/(["'`])\1/g, "").replace(/[\s,[\]()]/g, "");
		if (rest !== "") return `a ${m[0].slice(0, -1).trim()}(…) call whose arguments are computed (${args.trim().slice(0, 80)})`;
	}
	return null;
}

/** Constructors `new` may name in code that loads a database module: builtins that open no file. */
const SAFE_BUILTIN = /^(?:Map|Set|WeakMap|WeakSet|WeakRef|Array|Object|Date|RegExp|Promise|Error|TypeError|RangeError|SyntaxError|ReferenceError|EvalError|URIError|AggregateError|URL|URLSearchParams|TextEncoder|TextDecoder|ArrayBuffer|SharedArrayBuffer|DataView|(?:Big)?(?:Int|Uint|Float)(?:8|16|32|64)(?:Clamped)?Array|Blob|Headers|Request|Response|AbortController|FormData|Intl\s*\.\s*\w+)$/;

/** A string naming a member that reaches a constructor: read as a member, it is the database constructor. */
const ESCAPE_WORD = /^(?:constructor|__proto__|__class__|prototype|getPrototypeOf|setPrototypeOf|construct)$/;
/** Calls that read a member named by an argument: `getattr(mem, "__class__")`, `Reflect.get(mem, k)`. */
const ATTR_CALL = /\b(?:getattr|setattr|delattr|attrgetter|__getattribute__|__getattr__|Reflect\s*\.\s*(?:get|getOwnPropertyDescriptor|has)|Object\s*\.\s*getOwnPropertyDescriptors?)\s*\(/;

/**
 * Why code that loads a database module reaches a constructor the gate cannot tie to a checked open,
 * or null (astra-7 B4). A constructor read off an instance is the database constructor itself
 * (`const C = mem.constructor`, `const {constructor: C} = mem`, `Object.getPrototypeOf(mem).constructor`,
 * Python `mem.__class__` and `type(mem)(…)`), and it opens any path, statics included
 * (`mem.constructor.open(p)`): every spelling of `constructor` or a prototype in code is refused, and
 * so is `Reflect.construct`. Comments are not code, and a string naming one (`"constructor"`, folded
 * `'constr'+'uctor'` included) is data until it is used as a member: refused as an object or
 * destructuring key, or in code that also reads a member computed at run time (`mem[k]`, `mem[("…")]`)
 * or by name (`getattr`, `Reflect.get`) — `mem["constructor"]` is already `.constructor` (dotAccess).
 * A string in a log line or a comment is allowed (astra-8 S1). Every `new` must name a database export
 * in `dbNames` (whose target the caller checks), a builtin that opens no file, or a class or function
 * this code declares whose `extends` is one of those; anything else (`new C(…)`, `new (expr)(…)`,
 * `new x[k](…)`) is refused, fail-closed. A constructor's static opens (`D.open(p)`, `D.deserialize(b)`)
 * on a bound name are refused too.
 */
export function dbConstructorEscape(facts: CodeFacts, dbNames: readonly string[]): string | null {
	const code = facts.uncommented;
	for (const m of facts.folded.matchAll(LITERAL)) {
		if (code[m.index!] !== m[0][0] || !ESCAPE_WORD.test(unescape(m[1] ?? m[2] ?? m[3] ?? ""))) continue;
		const end = m.index! + m[0].length;
		const key = /[{,][\s([]*$/.test(code.slice(0, m.index!)) && /^[\s)\]]*:/.test(code.slice(end));
		const use = key ? "as an object or destructuring key" : firstComputedMember(code, facts.folded) !== null || ATTR_CALL.test(code) ? "in code that reads a member by a computed name" : null;
		if (use) return `naming \`${m[0].slice(1, -1)}\` in a string ${use} (a member reached by it is the database constructor)`;
	}
	const reach =
		/(?:\?\.|\.)\s*(?:constructor|__proto__|__class__|prototype)(?![\w$])|(?<![\w$.])constructor\s*(?=[:,}=]|\s*$)|\b(?:getPrototypeOf|setPrototypeOf|Reflect\s*\.\s*construct)\b|(?<![\w$.])type\s*\([^()]*\)\s*\(/.exec(code);
	if (reach) return `reaching a constructor through \`${reach[0].trim()}\` (a constructor read off a database instance is the database constructor, and it opens any path)`;
	const names = dbNames.map((n) => n.replace(/\$/g, "\\$")).join("|");
	const statics = new RegExp(String.raw`(?<![\w$.])(?:${names})\s*\??\.\s*(?:open|deserialize)(?![\w$])`).exec(code);
	if (statics) return `opening through the constructor's static \`${statics[0].trim()}\` (the gate does not check its target)`;
	const declared = new Set<string>();
	const safe = (name: string) => SAFE_BUILTIN.test(name) || declared.has(name);
	for (const m of code.matchAll(/\bclass(?:\s+([\w$]+))?(?:\s*<[^{]*?>)?\s*(?:extends\s+([^{]*?))?(?:\s+implements\s+[^{]*?)?\s*\{|\bfunction\s*\*?\s*([\w$]+)\s*\(/g)) {
		const base = m[2]?.trim();
		if (base !== undefined && !safe(base)) return `a class extending \`${base.slice(0, 60)}\`, which the gate cannot resolve to a class that opens no database`;
		const name = m[1] ?? m[3];
		if (name) declared.add(name);
	}
	for (const m of code.matchAll(/(?<![\w$.])new(?![\w$])(?!\s*\.\s*target\b)\s*/g)) {
		const at = m.index! + m[0].length;
		const chain = /^[\w$]+(?:\s*\??\.\s*[\w$]+)*/.exec(code.slice(at))?.[0];
		const next = chain === undefined ? code[at] : code.slice(at + chain.length).trimStart()[0];
		if (chain !== undefined && next !== "[") {
			const parts = chain.split(/\s*\??\.\s*/);
			if (parts.length === 1 && (safe(chain) || dbNames.includes(chain))) continue;
			if (parts.length > 1 && (SAFE_BUILTIN.test(chain) || dbNames.includes(parts.at(-1)!))) continue;
		}
		return `constructing with \`new ${facts.folded.slice(at, at + 40).split(/[(;\n]/)[0]!.trim()}\`, a constructor the gate cannot resolve to a checked database open or a class that opens no database`;
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
