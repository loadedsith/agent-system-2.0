// M4 fix round 7, eval hand: astra-7 (review-astra-7/REVIEW.md) B4, a database constructor derived
// from an instance (`const C = mem.constructor`, `const {constructor: C} = mem`) after a safe first
// open. Every P16 probe from review-astra-7/PROBES.md is here verbatim with its verdict after this
// round, then class variants: every way to reach a constructor from a database instance, every `new`
// whose callee the gate cannot resolve once a database module is loaded, and the controls that stay
// allowed. Every probe is inert: the gate only reads the strings; the ledger sits under /not-real.
import { describe, expect, test } from "bun:test";
import { checkToolCall } from "../src/gates";
import type { CallContext, Refusal } from "../src/types";
import { tmp } from "./helpers";

const ctx: CallContext = { role: "lane", cwd: tmp("round7-eval"), env: { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: "/not-real/ledger.db" } };
type V = "ALLOW" | "REFUSE";
const verdict = (r: Refusal): V => (r === null ? "ALLOW" : "REFUSE");
const evalCode = (language: "py" | "js", code: string): V => verdict(checkToolCall({ toolName: "eval", input: { language, code } }, ctx));

describe("P16 verbatim (astra-7)", () => {
	const P16: [string, V][] = [
		// B4: the two ALLOWs the review found.
		["import {Database} from 'bun:sqlite'; const mem=new Database(':memory:'); const C=mem.constructor; const target=new C(process.env.DB)", "REFUSE"],
		["import {Database} from 'bun:sqlite'; const mem=new Database(':memory:'); const C=Database.bind(null,process.env.DB); const target=new C()", "REFUSE"],
		["import {Database} from 'bun:sqlite'; const mem=new Database(':memory:'); const {constructor:C}=mem; const target=new C(process.env.DB)", "REFUSE"],
		// An in-memory handle exported from eval code reaches no file.
		["import {Database} from 'bun:sqlite'; const mem=new Database(':memory:'); export {mem}", "ALLOW"],
		["export {Database as D} from 'bun:sqlite'", "REFUSE"],
		["export * from 'bun:sqlite'", "REFUSE"],
		["import {Database} from 'bun:sqlite'; new Database(':memory:'); const {'Database':D}=await import('bun:sqlite');new D(process.env.DB)", "REFUSE"],
	];
	for (const [code, want] of P16) test(`eval js ${code} → ${want}`, () => expect(evalCode("js", code)).toBe(want));
});

describe("B4: a constructor reached from a database instance is a database constructor", () => {
	const open = "import {Database} from 'bun:sqlite'; const mem=new Database(':memory:'); ";
	const B4: ["py" | "js", string][] = [
		["js", `${open}const C=Object.getPrototypeOf(mem).constructor; new C(process.env.DB)`],
		["js", `${open}new (mem.constructor)(process.env.DB)`],
		["js", `${open}new mem.constructor(process.env.DB)`],
		["js", `${open}new mem?.constructor(process.env.DB)`],
		["js", `${open}Reflect.construct(mem.constructor, [process.env.DB])`],
		["js", `${open}const C=mem.constructor; Reflect.construct(C, [process.env.DB])`],
		["js", `${open}console.log(mem.constructor.name)`],
		["js", `${open}const C=mem["constructor"]; new C(process.env.DB)`],
		["js", `${open}const {constructor} = mem; new constructor(process.env.DB)`],
		["js", `${open}const {constructor: C, close} = mem; new C(process.env.DB)`],
		["js", `${open}let C; ({constructor: C} = mem); new C(process.env.DB)`],
		["js", `${open}mem.constructor.open(process.env.DB)`],
		["js", `${open}mem.constructor.deserialize(bytes)`],
		["js", `${open}const p=Object.getPrototypeOf(mem); const k=Object.getOwnPropertyNames(p)[0]; new p[k](process.env.DB)`],
		["js", `${open}const P=mem.__proto__; new P.constructor(process.env.DB)`],
		["js", `${open}const k='constructor'; const C=mem[k]; new C(process.env.DB)`],
		["js", `${open}const C=mem['constr'+'uctor']; new C(process.env.DB)`],
		["js", `${open}class T extends mem.constructor {}; new T(process.env.DB)`],
		["js", `${open}const C=mem.constructor; class T extends C {}; new T(process.env.DB)`],
		["js", "import {Database as D} from 'bun:sqlite'; new D(':memory:'); D.open(process.env.DB)"],
		["js", "import {Database as D} from 'bun:sqlite'; new D(':memory:'); D?.deserialize(bytes)"],
		["js", `${open}const T = class extends Object.getPrototypeOf(mem).constructor {}; new T(process.env.DB)`],
		["js", "const Database = require('better-sqlite3'); const mem = new Database(':memory:'); const C = mem.constructor; new C(process.env.DB)"],
		["js", "import {DatabaseSync} from 'node:sqlite'; const mem=new DatabaseSync(':memory:'); const {constructor:C}=mem; new C(process.env.DB)"],
		["js", "import * as sqlite from 'node:sqlite'; const mem=new sqlite.DatabaseSync(':memory:'); new mem.constructor(process.env.DB)"],
		["py", "import os, sqlite3\nmem = sqlite3.connect(':memory:')\nC = mem.__class__\nC(os.environ['DB'])"],
		["py", "import os, sqlite3\nmem = sqlite3.connect(':memory:')\ntype(mem)(os.environ['DB'])"],
	];
	for (const [language, code] of B4) test(`eval ${language} ${code} → REFUSE`, () => expect(evalCode(language, code)).toBe("REFUSE"));
});

describe("B4: once a database module is loaded, a `new` the gate cannot resolve is refused", () => {
	const open = "import {Database} from 'bun:sqlite'; const mem=new Database(':memory:'); ";
	const unresolved: string[] = [
		`${open}const C = pick(); new C(process.env.DB)`,
		`${open}new (flag ? Map : Set)()`,
		`${open}new globalThis[name](process.env.DB)`,
		`${open}const C = handles.get('db'); new C`,
		`${open}new this.constructor(process.env.DB)`,
		`${open}new Proxy(mem, {})`,
		`${open}new Function('return 1')()`,
		`${open}class T extends Base {}; new T()`,
	];
	for (const code of unresolved) test(`eval js ${code} → REFUSE`, () => expect(evalCode("js", code)).toBe("REFUSE"));
});

describe("B4 controls: literal opens, builtins and local classes stay allowed", () => {
	const allowed: ["py" | "js", string][] = [
		["js", "import {Database} from 'bun:sqlite'; const mem=new Database(':memory:'); const m=new Map<string, number>(); const s=new Set([1]); const d=new Date(0); console.log(mem.query('select 1 as x').all(), m, s, d)"],
		["js", "import {Database} from 'bun:sqlite'; class Row { constructor(a) { this.a = a; } } const db=new Database(':memory:'); console.log(new Row(1), db)"],
		["js", "import {Database} from 'bun:sqlite'; class Oops extends Error {} class Worse extends Oops {} const db=new Database('/tmp/scratch.db'); throw new Worse('x')"],
		["js", "import {Database} from 'bun:sqlite'; function Pt(x) { this.x = x; } const db=new Database(':memory:'); new Pt(1)"],
		["js", "import {Database} from 'bun:sqlite';\n// open a new scratch database, then build a new row\nconst db = new Database(':memory:'); /* new comment */ db.close()"],
		["js", "import {Database} from 'bun:sqlite'; const db = new Database(':memory:', { readonly: true }); const u = new URL('file:///tmp/x'); console.log(new TextEncoder().encode(u.href))"],
		["js", "import * as sqlite from 'node:sqlite'; const db = new sqlite.DatabaseSync(':memory:'); db.close()"],
		["js", "import {Database} from 'bun:sqlite'; const db = new Database(':memory:'); console.log(new.target, db)"],
		["js", "const C = ({}).constructor; console.log(new C(), [].constructor.name)"],
		["py", "import sqlite3\ncon = sqlite3.connect(':memory:')\nprint(con.execute('select 1').fetchall())"],
		["py", "import sqlite3\ncon = sqlite3.connect(':memory:')\n# a new connection per call\nprint(page.type, con)"],
	];
	for (const [language, code] of allowed) test(`eval ${language} ${code} → ALLOW`, () => expect(evalCode(language, code)).toBe("ALLOW"));
});
