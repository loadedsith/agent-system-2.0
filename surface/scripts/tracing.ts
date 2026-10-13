#!/usr/bin/env bun
// The tracing switch's command line (wl-mv65t5d34lts00 PLAN.md § 2; the reader is surface/src/tracing.ts).
//
//   bun surface/scripts/tracing.ts env orchestrator [--config <path>]
//       the orchestrator's OTEL_* env, one NAME=value line each (bin/as2 passes them to env(1) and unsets
//       every other inherited OTEL_* name); a note on stderr when the setting is unreadable or malformed
//   bun surface/scripts/tracing.ts set off|all|<wl-id> [--config <path>]     (`as2 phoenix …`)
//       sets observability.phoenix: `off` and `all` replace the value, a workload id joins the list (a
//       one-line flow list; under `all` it is already covered and the value stays). Only that value
//       changes: every other byte of the file is kept. A profile rendered before the switch existed gets
//       the checkout's template block appended first. Prints `observability.phoenix: <old> -> <new> (<path>)`.
//
// <path> defaults to the installed profile's config.yml, as bin/as2 names it:
// $HOME/.omp/profiles/${AGENT_SYSTEM_PROFILE:-agent-system-2}/agent/config.yml. A re-install renders the
// template again, which resets the value to `off`.
// Exit: 0 ok · 1 the file cannot be read, parsed or edited (nothing written) · 2 usage.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseObservability, phoenixText, readTracingSetting, type TracingSetting, tracingEnv, WORKLOAD_ID } from "../src/tracing";

const REPO = resolve(import.meta.dir, "..", "..");
const TEMPLATE = join(REPO, "profile", "config.yml");

const USAGE = "usage: tracing.ts env orchestrator [--config <path>] | tracing.ts set off|all|<wl-id> [--config <path>]";

class Fail extends Error {
	constructor(message: string, readonly code: number) {
		super(message);
	}
}

const isMap = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** The installed profile's config.yml, as bin/as2 names it. */
export function defaultConfigPath(env: Record<string, string | undefined> = process.env): string {
	if (!env.HOME) throw new Fail("HOME is not set", 1);
	return join(env.HOME, ".omp", "profiles", env.AGENT_SYSTEM_PROFILE || "agent-system-2", "agent", "config.yml");
}

/** The top-level `observability:` block's lines in `lines`: its key line through its last indented line. Null when absent. */
function blockRange(lines: string[]): { start: number; end: number } | null {
	const start = lines.findIndex((l) => /^observability:/.test(l));
	if (start < 0) return null;
	if (!/^observability:[ \t]*(#.*)?$/.test(lines[start]!)) throw new Fail("observability: is not a block mapping (an inline value); edit it by hand", 1);
	let end = start;
	for (let i = start + 1; i < lines.length; i++) {
		const l = lines[i]!;
		if (/^[ \t]+\S/.test(l)) end = i;
		else if (l.trim() !== "" && !l.startsWith("#")) break;
	}
	return { start, end };
}

/** The value the word sets, from the value now in force. */
export function nextValue(old: TracingSetting["phoenix"] | null, word: string): TracingSetting["phoenix"] {
	if (word === "off" || word === "all") return word;
	if (old === "all") return "all";
	const list = Array.isArray(old) ? old : [];
	return list.includes(word) ? list : [...list, word];
}

/**
 * `text` with observability.phoenix set to `value`. The block is appended from `template` (the checkout's
 * profile/config.yml) when absent; then only the phoenix line (and a block-style list under it) is replaced, its
 * trailing comment kept, every other line byte-identical.
 */
export function setPhoenix(text: string, template: string, value: string): string {
	let lines = text.split("\n");
	if (blockRange(lines) === null) {
		const t = template.split("\n");
		const r = blockRange(t);
		if (r === null) throw new Fail("the checkout's profile/config.yml has no observability block to append", 1);
		let from = r.start;
		while (from > 0 && t[from - 1]!.startsWith("#")) from--;
		const body = t.slice(from, r.end + 1);
		const head = text === "" || text.endsWith("\n") ? text : `${text}\n`;
		lines = `${head}${head === "" ? "" : "\n"}${body.join("\n")}\n`.split("\n");
	}
	const r = blockRange(lines)!;
	const child = lines.slice(r.start + 1, r.end + 1).find((l) => /^[ \t]+[^\s#]/.test(l));
	const indent = child ? /^[ \t]+/.exec(child)![0] : "  ";
	const at = lines.findIndex((l, i) => i > r.start && i <= r.end && l.startsWith(`${indent}phoenix:`));
	if (at < 0) {
		lines.splice(r.start + 1, 0, `${indent}phoenix: ${value}`);
		return lines.join("\n");
	}
	// A block-style list under the key: the lines indented deeper than the key, up to the last of them.
	let last = at;
	for (let i = at + 1; i <= r.end; i++) {
		const l = lines[i]!;
		const lead = /^[ \t]*/.exec(l)![0];
		if (l.trim() === "" || l.trimStart().startsWith("#")) continue;
		if (lead.length > indent.length) last = i;
		else break;
	}
	const rest = lines[at]!.slice(`${indent}phoenix:`.length);
	const comment = /(\s+#.*)$/.exec(rest)?.[1] ?? "";
	lines.splice(at, last - at + 1, `${indent}phoenix: ${value}${comment}`);
	return lines.join("\n");
}

/** `set`: edit, check that the parsed file differs only in observability.phoenix, write by rename, report. */
function set(word: string, path: string): string {
	if (word !== "off" && word !== "all" && !WORKLOAD_ID.test(word)) throw new Fail(`'${word}' is not off, all or a workload id (wl-…)`, 2);
	if (!existsSync(path)) throw new Fail(`no installed profile config at ${path}; run: as2 install`, 1);
	const text = readFileSync(path, "utf8");
	let doc: unknown;
	try {
		doc = Bun.YAML.parse(text);
	} catch (err) {
		throw new Fail(`${path} does not parse: ${String(err instanceof Error ? err.message : err).split("\n")[0]}`, 1);
	}
	if (!isMap(doc)) throw new Fail(`${path} is not a mapping`, 1);
	const before = parseObservability(doc.observability);
	const raw = isMap(doc.observability) ? doc.observability.phoenix : undefined;
	// The word edits the value as written, not the value in force: an enabled block that reads as off (an otel map
	// missing a required name) still has its list extended, never replaced.
	const written: TracingSetting["phoenix"] | null =
		raw === "all" ? "all" : Array.isArray(raw) && raw.every((id) => typeof id === "string" && WORKLOAD_ID.test(id)) ? [...new Set(raw as string[])] : null;
	const oldText = doc.observability === undefined ? "absent" : written ? phoenixText(written) : before.setting ? phoenixText(before.setting.phoenix) : JSON.stringify(raw ?? null);
	const value = phoenixText(nextValue(written, word));
	const out = setPhoenix(text, readFileSync(TEMPLATE, "utf8"), value);
	// The edit is checked against the parse: the new value reads back, and nothing else in the document moved.
	const after: unknown = Bun.YAML.parse(out);
	if (!isMap(after)) throw new Fail(`the edit of ${path} does not parse as a mapping; nothing written`, 1);
	const { observability: oldBlock, ...oldRest } = doc;
	const { observability: newBlock, ...newRest } = after;
	const blockRest = (b: unknown) => {
		if (!isMap(b)) return {};
		const { phoenix: _p, ...rest } = b;
		return rest;
	};
	const got = isMap(newBlock) ? newBlock.phoenix : undefined;
	const gotText = Array.isArray(got) ? `[${got.join(", ")}]` : String(got);
	const sameRest = Bun.deepEquals(oldRest, newRest) && (oldBlock === undefined || Bun.deepEquals(blockRest(oldBlock), blockRest(newBlock)));
	if (gotText !== value || !sameRest) throw new Fail(`the edit of ${path} did not read back as observability.phoenix: ${value} alone; nothing written`, 1);
	const tmp = `${path}.tmp.${process.pid}`;
	writeFileSync(tmp, out);
	renameSync(tmp, path);
	return `observability.phoenix: ${oldText} -> ${value}${word !== "off" && word !== "all" && value === "all" ? ` (${word} is covered by all)` : ""} (${path})`;
}

function main(argv: string[]): number {
	const args = [...argv];
	let config: string | null = null;
	const ci = args.indexOf("--config");
	if (ci >= 0) {
		config = args[ci + 1] ?? null;
		if (!config) throw new Fail(USAGE, 2);
		args.splice(ci, 2);
	}
	const path = config ?? defaultConfigPath();
	if (args.length === 2 && args[0] === "env" && args[1] === "orchestrator") {
		const r = readTracingSetting(path);
		if (r.notes.length) process.stderr.write(`as2: tracing: ${r.notes.join("; ")}\n`);
		const env = tracingEnv({}, r.setting, { role: "orchestrator" });
		process.stdout.write(Object.entries(env).map(([k, v]) => `${k}=${v}\n`).join(""));
		return 0;
	}
	if (args.length === 2 && args[0] === "set") {
		process.stdout.write(`${set(args[1]!, path)}\n`);
		return 0;
	}
	throw new Fail(USAGE, 2);
}

if (import.meta.main) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (err) {
		process.stderr.write(`tracing: ${err instanceof Error ? err.message : String(err)}\n`);
		process.exit(err instanceof Fail ? err.code : 1);
	}
}
