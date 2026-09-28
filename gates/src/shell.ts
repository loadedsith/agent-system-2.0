// Shell-string helpers shared by the tool-call rows (6 reserved actions, 8 push, 10 raw ledger write).
// Ported from the 1.x reference `hooks/lib/git-cmd.mjs` (newdle plugin 0.2.172, read-only): the GIT/GH
// invocation prefixes, the segment splitter and the quote-aware surface. Matching stays quote-blind
// where the 1.x guard was quote-blind on purpose (careful-guard.mjs header: a quote-aware matcher has
// to model shell quoting, `$(...)` and heredocs, and every gap in that model is a bypass).

import { resolve as resolvePath } from "node:path";

/** `git` plus any global flags (`-C <dir>`, `-c k=v`, `--no-pager`) up to the subcommand. */
export const GIT = String.raw`\bgit(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*\s+`;
/** `gh` plus any global flags up to the subcommand. */
export const GH = String.raw`\bgh(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*\s+`;

/** Split a command on `;`, `&`, `|` and newlines. Quote-blind, like the 1.x splitter. */
export function segments(str: string): string[] {
	return str.split(/[;&|\n]+/).map((s) => s.trim()).filter(Boolean);
}

/** Collapse runs of blanks, keep newlines (so `[^\n]*` line scoping still means one line). */
export function normalizeCommand(cmd: string): string {
	return cmd.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
}

/**
 * The executable surface of one segment: quoted spans replaced by `_`, an unquoted comment cut.
 * Same length as the input up to the cut, so indices map back. null when a quote is unbalanced.
 */
export function shellSurface(segment: string): string | null {
	let out = "";
	let mode: null | "'" | '"' = null;
	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i]!;
		if (mode === "'") {
			if (ch === "'") mode = null;
			out += "_";
		} else if (mode === '"') {
			if (ch === "\\" && i + 1 < segment.length) {
				out += "__";
				i++;
			} else {
				if (ch === '"') mode = null;
				out += "_";
			}
		} else if (ch === "\\" && i + 1 < segment.length) {
			out += "__";
			i++;
		} else if (ch === "'" || ch === '"') {
			mode = ch;
			out += "_";
		} else if (ch === "#" && (i === 0 || /\s/.test(segment[i - 1]!))) {
			break;
		} else {
			out += ch;
		}
	}
	return mode === null ? out : null;
}

const GIT_CMD_RE = new RegExp(
	String.raw`^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*(?:(?:command|sudo|env)\s+)*(git(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*\s+)([A-Za-z][A-Za-z-]*)\b`,
	"di",
);

export interface GitInvocation {
	/** `git -C x` prefix as written. */
	prefix: string;
	/** Lower-cased subcommand. */
	sub: string;
	/** Everything after the subcommand, as written. */
	rest: string;
}

/** The git invocation at the command position of `segment`, or null. */
export function gitInvocation(segment: string): GitInvocation | null {
	const surface = shellSurface(segment);
	if (surface === null) return null;
	const m = GIT_CMD_RE.exec(surface);
	if (!m || !m.indices) return null;
	const [ps, pe] = m.indices[1]!;
	const [, se] = m.indices[2]!;
	return { prefix: segment.slice(ps, pe), sub: m[2]!.toLowerCase(), rest: segment.slice(se, surface.length) };
}

export const unquote = (t: string): string => t.replace(/^['"]|['"]$/g, "");

/** Whitespace tokens with surrounding quotes stripped. */
export function tokens(s: string): string[] {
	return s.trim().split(/\s+/).filter(Boolean).map(unquote);
}

/** Positional (non-flag) tokens, stopping at `--`. */
export function positionals(toks: string[], flagsWithValue: RegExp = /^$/): string[] {
	const out: string[] = [];
	for (let i = 0; i < toks.length; i++) {
		const t = toks[i]!;
		if (t === "--") break;
		if (t.startsWith("-")) {
			if (flagsWithValue.test(t)) i++;
			continue;
		}
		out.push(t);
	}
	return out;
}

export interface ParsedPush {
	/** `-C` directories in order, as written. */
	dirs: string[];
	remote: string | null;
	refspecs: string[];
	flags: string[];
}

/** A `git push` in `segment`, or null. */
export function parsePush(segment: string): ParsedPush | null {
	const g = gitInvocation(segment);
	if (!g || g.sub !== "push") return null;
	const dirs: string[] = [];
	const dashC = /(?:^|\s)-C\s+(\S+)/g;
	let m: RegExpExecArray | null;
	while ((m = dashC.exec(g.prefix))) dirs.push(unquote(m[1]!));
	const toks = tokens(g.rest);
	const pos = positionals(toks, /^(--repo|--receive-pack|--exec|--push-option|-o)$/);
	return { dirs, remote: pos[0] ?? null, refspecs: pos.slice(1), flags: toks.filter((t) => t.startsWith("-")) };
}

/**
 * Segments paired with the directory each runs in, following `cd <dir>` / `pushd <dir>` segments
 * (`cd repo && git push` pushes from repo). `cd` alone or `cd -` leaves the directory unknown-but-kept.
 */
export function segmentsWithDir(cmd: string, cwd: string): { seg: string; dir: string }[] {
	const out: { seg: string; dir: string }[] = [];
	let dir = cwd;
	for (const raw of segments(normalizeCommand(cmd))) {
		const seg = raw.replace(/^(?:[({]\s*)+/, "").replace(/(?:\s*[)}])+$/, "");
		const cd = /^(?:cd|pushd)\s+(\S+)\s*$/.exec(seg);
		if (cd && cd[1] !== "-") {
			const target = unquote(cd[1]!).replace(/^~(?=\/|$)/, process.env.HOME ?? "~");
			dir = resolvePath(dir, target);
			continue;
		}
		out.push({ seg, dir });
	}
	return out;
}
