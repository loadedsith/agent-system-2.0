// P-11 row 10 (DESIGN-2.0.md:347; SPEC-2.0.md:322-324 § B2): raw writes to the ledger database
// outside the ledger module are refused — a `sqlite3` (or any other raw CLI) command naming the
// ledger file, a shell redirect into it, eval code opening it, or a file-tool write to it or to its
// `-wal`/`-shm`/`-journal` siblings. The path is the module's own: LEDGER_DB_ENV, defaultLedgerPath
// and canonicalPath from ledger/src/locality.ts; the siblings are derived by suffix.
import { basename, resolve } from "node:path";
import { canonicalPath, defaultLedgerPath, LEDGER_DB_ENV } from "../../../ledger/src/locality";
import { segmentsWithDir, tokens } from "../shell";
import { writeTargets } from "../targets";
import type { CallContext, Refusal, ToolCall } from "../types";

const SIBLINGS = ["", "-wal", "-shm", "-journal"];

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
	needles.add(`$${LEDGER_DB_ENV}`);
	needles.add(`\${${LEDGER_DB_ENV}}`);
	return { files, needles: [...needles] };
}

/** Does `seg`, run in `dir`, name the ledger file or a sibling? */
function namesLedger(seg: string, dir: string, paths: LedgerPaths): boolean {
	if (paths.needles.some((n) => seg.includes(n))) return true;
	// A relative spelling: any token that resolves (against the segment's directory) to the file or a sibling.
	return tokens(seg).some((t) => {
		const bare = t.replace(/^[<>]+/, "");
		if (!bare || !SIBLINGS.some((s) => bare.endsWith(basename(paths.files[0]!) + s))) return false;
		const canon = canonicalPath(resolve(dir, bare));
		return paths.files.some((f) => SIBLINGS.some((s) => canon === f + s));
	});
}

function refuse(what: string): Refusal {
	return {
		block: true,
		reason:
			`P-11 row 10 refused this: ${what}. The ledger's rules live in the file and its writer is the ledger module ` +
			`(ledger/src/index.ts, SPEC-2.0.md § B2); a raw write bypasses its provenance and would be refused by the file's triggers or corrupt WAL state. ` +
			`Write through the module (Ledger.open(...).recordInstruction / raiseQuestion / …). To inspect, use \`sqlite3 -readonly <ledger>\`.`,
	};
}

/** Row 10 over one tool call. */
export function checkRawLedgerWrite(call: ToolCall, ctx: CallContext): Refusal {
	const paths = ledgerPaths(ctx.env);
	if (call.toolName === "bash") {
		const cmd = String(call.input.command ?? "");
		const base = typeof call.input.cwd === "string" ? resolve(ctx.cwd, call.input.cwd) : ctx.cwd;
		for (const { seg, dir } of segmentsWithDir(cmd, base)) {
			if (!namesLedger(seg, dir, paths)) continue;
			if (/>{1,2}\s*\S/.test(seg) && namesLedger(seg.slice(seg.search(/>/)), dir, paths)) return refuse(`a shell redirect into the ledger file (${seg})`);
			const toks = tokens(seg).filter((t) => !/^[A-Za-z_]\w*=/.test(t));
			const head = basename(toks[0] ?? "");
			if (READ_ONLY_HEADS[head]) continue;
			if (head === "sqlite3" && toks.includes("-readonly")) continue;
			if ((head === "bun" || head === "node") && toks.slice(1).some((t) => /(^|\/)ledger\/scripts\/[\w-]+\.ts$/.test(t))) continue;
			return refuse(`\`${head}\` on the ledger file outside the ledger module (${seg})`);
		}
		return null;
	}
	if (call.toolName === "eval") {
		const code = String(call.input.code ?? "");
		if (!paths.needles.some((n) => code.includes(n)) && !code.includes(LEDGER_DB_ENV)) return null;
		if (/ledger\/src\/index/.test(code) && !/bun:sqlite|better-sqlite3|sqlite3|node:sqlite/.test(code)) return null;
		return refuse("eval code naming the ledger file without going through ledger/src/index.ts");
	}
	for (const target of writeTargets(call, ctx.cwd)) {
		const canon = canonicalPath(target);
		if (paths.files.some((f) => SIBLINGS.some((s) => target === f + s || canon === f + s))) {
			return refuse(`a ${call.toolName} to ${target}, the ledger file or its WAL/SHM/journal sibling`);
		}
	}
	return null;
}
