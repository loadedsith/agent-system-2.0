/**
 * The models a dead hand answered on, read from its session file (PLAN wl-mv45jcsi4h3nr4 D2).
 * `builderLabs` (classifier/src/lab.ts) calls this for a `hand-spawn:` token that never settled and
 * whose lane has since exited or been replaced; a live caller gets this reader by default, a caller
 * that must stay ledger-only passes its own resolver.
 *
 * A hand's file is `<root>/<agentId>.jsonl` (classifier/extension.ts header, "Hand identity"). The
 * spawn entry records the key the spawn asked for; OMP may have allocated `<key>-<N>` on a name
 * collision, and the ledger does not record which, so every candidate is read unless:
 * - a `routings` row claims it (`claimed`: the agent ids routings rows record under `root`), so it is
 *   another, settled hand's file; or
 * - its session header (the first line whose `type` is `"session"`) is before `from` (the spawn
 *   entry's `created_at`) or at or after `until` (the first spawn of a successor lane instance, null
 *   for no bound). Both stamps are `toISOString()` output, so they compare as strings. A file with no
 *   readable header is not read.
 * Every answering assistant turn in a kept file counts, whenever it was written; an error turn is no
 * answer. Missing or unreadable files and malformed lines count nothing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { identity } from "./tier-table";

export interface HandSessionQuery {
	/** The spawn entry's session root: the directory the lane's hand files are in. */
	root: string;
	/** The spawn entry's key (`spawn <key>`); null when the entry recorded none. */
	key: string | null;
	/** Agent ids a `routings` row of the workload records under `root`. */
	claimed: ReadonlySet<string>;
	/** The spawn entry's `created_at`: a file opened before it is not this hand's. */
	from: string;
	/** The earliest `hand-spawn:` of a successor lane instance; a file opened at or after it is not read. */
	until: string | null;
}

/** Resolves a dead hand to the `provider/model` identities that answered on it. */
export type HandSessionModels = (query: HandSessionQuery) => string[];

const DIGITS = /^\d+$/;

export const handSessionModels: HandSessionModels = ({ root, key, claimed, from, until }) => {
	if (key === null) return [];
	let names: string[];
	try {
		names = readdirSync(root);
	} catch {
		return [];
	}
	const models = new Set<string>();
	for (const name of names) {
		if (!name.endsWith(".jsonl")) continue;
		const agentId = name.slice(0, -".jsonl".length);
		if (agentId !== key && !(agentId.startsWith(`${key}-`) && DIGITS.test(agentId.slice(key.length + 1)))) continue;
		if (claimed.has(agentId)) continue;
		let text: string;
		try {
			text = readFileSync(join(root, name), "utf8");
		} catch {
			continue;
		}
		let opened: string | null = null;
		const answered: string[] = [];
		for (const line of text.split("\n")) {
			let record: unknown;
			try {
				record = JSON.parse(line);
			} catch {
				continue;
			}
			if (typeof record !== "object" || record === null) continue;
			const { type, timestamp, message } = record as { type?: unknown; timestamp?: unknown; message?: unknown };
			if (type === "session" && opened === null) {
				if (typeof timestamp !== "string") break;
				opened = timestamp;
				continue;
			}
			if (type !== "message" || typeof message !== "object" || message === null) continue;
			const { role, provider, model, stopReason } = message as { role?: unknown; provider?: unknown; model?: unknown; stopReason?: unknown };
			if (role !== "assistant" || typeof provider !== "string" || typeof model !== "string" || !provider || !model || stopReason === "error") continue;
			answered.push(identity(`${provider}/${model}`));
		}
		if (opened === null || opened < from || (until !== null && opened >= until)) continue;
		for (const model of answered) models.add(model);
	}
	return [...models];
};
