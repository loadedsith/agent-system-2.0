// The files a write-class tool call targets, for row 9 (protected-branch edit) and row 10 (raw
// ledger write). OMP normalises edit input before extension events see it: hashline mode's
// `[PATH#TAG]` headers arrive as `path` (one file) or `paths` (several)
// (pi-coding-agent src/extensibility/tool-event-input.ts:70-83, OMP 18.3.0).
import { isAbsolute, resolve } from "node:path";
import type { ToolCall } from "./types";

/** Tools that write files by path. `ast_edit.paths` may be globs or directories. */
export const WRITE_TOOLS: Record<string, true> = { write: true, edit: true, ast_edit: true };

/** Absolute target paths of a write-class call; [] for any other tool. A glob keeps its static prefix. */
export function writeTargets(call: ToolCall, cwd: string): string[] {
	if (!WRITE_TOOLS[call.toolName]) return [];
	const raw = [call.input.path, ...(Array.isArray(call.input.paths) ? call.input.paths : [])];
	const out: string[] = [];
	for (const p of raw) {
		if (typeof p !== "string" || p.length === 0 || /^[a-z][a-z0-9+.-]*:\/\//i.test(p)) continue;
		const expanded = p.replace(/^~(?=\/|$)/, process.env.HOME ?? "~");
		const glob = expanded.search(/[*?[{]/);
		const staticPart = glob < 0 ? expanded : expanded.slice(0, glob).replace(/[^/]*$/, "") || ".";
		const abs = isAbsolute(staticPart) ? staticPart : resolve(cwd, staticPart);
		if (!out.includes(abs)) out.push(abs);
	}
	return out;
}
