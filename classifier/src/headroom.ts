/**
 * Headroom signal (PLAN wl-mv71x5rwdu7eo0 § 2.2): is a `provider/model[:level]` selector projected out of quota?
 * Pure except one read of the quota watcher's poll file (§ 2.1); it only removes candidates and never changes a
 * dispatch's kind, tier or effort.
 *
 * - One clock unit, milliseconds: a poll's `t` is epoch seconds (watch.py) and is converted on read; `resetsAt`
 *   (`omp usage --json`) and `now` are epoch ms.
 * - A limit is `(provider, windowId, tier|null)`, read from the newest poll: use `u` and `resetsAt`.
 * - Projection is the window's own pace (Jo, in-mv8spn0cssasjk, answering q-mv8sl9vnex4zr4 "pace"): the window's
 *   length comes from `windowId` (`5h`, `7d`, …), elapsed = length − (resetsAt − now), and the projected use at reset
 *   is `u / elapsed · length`. No projection before `PACE_MIN` of the window has elapsed, or when the length or reset
 *   is unknown. (A last-hour burn carried days ahead marked every lab out on live polls: SMOKE.log, 2026-10-15.)
 * - A limit binds a selector when the provider matches and its tier is null or the model id contains the tier
 *   (`fable` binds `anthropic/claude-fable-*` only; Fable's meter never takes Opus out).
 * - Out: a binding limit with a pace projection ≥ 1.0, or a binding 5h limit with `u > FIVE_HOUR_CEILING`.
 *   A limit whose `resetsAt` has already passed has reset and binds nothing.
 * - Old poll lines (no `limits`) read their `rows` keys as limits with no reset time, so only the 5h rule applies.
 *   A third key segment is a tier unless it is a meter name in `METERS` (`openai-codex/7d/chat` is the shared meter).
 *   An unknown third segment read as a tier binds only models whose id contains it, so a misread fails open.
 * - Stale (newest poll older than `STALE_MIN`), missing, unreadable or empty polls: nothing is out, and `note` says why.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const STALE_MIN = 15;
/** Minutes of a window that must have elapsed before its pace projects anything. */
export const PACE_MIN = 60;
export const FIVE_HOUR_CEILING = 0.8;
/** `windowId` unit → ms. */
const UNIT_MS: Readonly<Record<string, number>> = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
/** Third `rows` key segments that name a meter, not a model tier (old poll lines only). */
const METERS: Readonly<Record<string, true>> = { chat: true };
const MIN_MS = 60_000;

/** Length in ms of a window named like `5h` or `7d`; null when the id is not of that shape. */
function windowMs(windowId: string): number | null {
	const m = /^(\d+)([mhdw])$/.exec(windowId);
	return m ? Number(m[1]) * UNIT_MS[m[2]!]! : null;
}

export const DEFAULT_POLLS = join(homedir(), "agent-scratch", "agent-system-2.0", "quota-watch", "polls.jsonl");

interface Limit {
	provider: string;
	windowId: string;
	tier: string | null;
	used: number;
	resetsAt: number | null;
}

interface Poll {
	t: number; // ms
	limits: Limit[];
}

export interface Headroom {
	/** The reason `selector` is projected out, or null. */
	outFor(selector: string): string | null;
	/** Why nothing can be out (fail-open), or null when the polls were read. */
	note: string | null;
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function parsePoll(line: string): Poll | null {
	let raw: unknown;
	try {
		raw = JSON.parse(line);
	} catch {
		return null;
	}
	if (!raw || typeof raw !== "object") return null;
	const { t, rows, limits } = raw as { t?: unknown; rows?: unknown; limits?: unknown };
	if (!isNum(t)) return null;
	const found: Limit[] = [];
	if (Array.isArray(limits)) {
		for (const l of limits) {
			if (!l || typeof l !== "object") continue;
			const { provider, windowId, tier, resetsAt, usedFraction } = l as Record<string, unknown>;
			if (typeof provider !== "string" || typeof windowId !== "string" || !isNum(usedFraction)) continue;
			found.push({ provider, windowId, tier: typeof tier === "string" && tier ? tier : null, used: usedFraction, resetsAt: isNum(resetsAt) ? resetsAt : null });
		}
	} else if (rows && typeof rows === "object") {
		for (const [key, used] of Object.entries(rows as Record<string, unknown>)) {
			const [provider, windowId, third] = key.split("/");
			if (!provider || !windowId || !isNum(used)) continue;
			found.push({ provider, windowId, tier: third && !METERS[third] ? third : null, used, resetsAt: null });
		}
	} else return null;
	return { t: t * 1000, limits: found };
}

const pct = (n: number) => n.toFixed(2);

/** Read the polls once and answer `outFor` from them. `lines` replaces the file read (tests). */
export function headroom(opts: { path?: string; now?: number; lines?: string[] } = {}): Headroom {
	const now = opts.now ?? Date.now();
	const path = opts.path ?? (process.env.AS2_HEADROOM_POLLS || DEFAULT_POLLS);
	const open = (note: string): Headroom => ({ outFor: () => null, note });

	let lines = opts.lines;
	if (!lines) {
		try {
			lines = readFileSync(path, "utf8").split("\n");
		} catch (e) {
			return open(`headroom polls unreadable: ${path} (${(e as NodeJS.ErrnoException).code ?? String(e)})`);
		}
	}
	const source = opts.lines ? "inline lines" : path;
	const polls = lines.flatMap(l => (l.trim() ? (parsePoll(l) ?? []) : [])).sort((a, b) => a.t - b.t);
	const newest = polls.at(-1);
	if (!newest) return open(`headroom polls empty: ${source}`);
	const age = now - newest.t;
	if (age > STALE_MIN * MIN_MS) return open(`headroom polls stale: newest ${Math.round(age / MIN_MS)} min old in ${source}`);

	/** Use projected at reset from the window's pace so far; null when it cannot be projected yet. */
	const paceAtReset = (l: Limit): { projected: number; perHour: number } | null => {
		const length = l.resetsAt === null ? null : windowMs(l.windowId);
		if (length === null || l.resetsAt === null) return null;
		const elapsed = length - (l.resetsAt - now);
		if (elapsed < PACE_MIN * MIN_MS || elapsed > length) return null;
		const perMs = l.used / elapsed;
		return { projected: perMs * length, perHour: perMs * 3_600_000 };
	};

	const reasonOf = (l: Limit): string | null => {
		if (l.resetsAt !== null && l.resetsAt <= now) return null;
		const name = `${l.provider} ${l.windowId}${l.tier ? ` ${l.tier}` : ""} ${pct(l.used)} used`;
		const pace = paceAtReset(l);
		if (pace && pace.projected >= 1.0) {
			const reset = `${new Date(l.resetsAt!).toISOString().slice(0, 16)}Z`;
			return `${name}, window pace +${(pace.perHour * 100).toFixed(1)} pts/h, projected ${pct(pace.projected)} at reset ${reset}`;
		}
		if (l.windowId === "5h" && l.used > FIVE_HOUR_CEILING) return `${name} > ${pct(FIVE_HOUR_CEILING)}${l.resetsAt === null ? " (no reset time)" : ""}`;
		return null;
	};

	return {
		note: null,
		outFor(selector: string): string | null {
			const bare = selector.trim().replace(/:[^/]*$/, "");
			const slash = bare.indexOf("/");
			if (slash < 0) return null;
			const provider = bare.slice(0, slash);
			const model = bare.slice(slash + 1).toLowerCase();
			for (const l of newest.limits) {
				if (l.provider !== provider || (l.tier !== null && !model.includes(l.tier.toLowerCase()))) continue;
				const reason = reasonOf(l);
				if (reason) return reason;
			}
			return null;
		},
	};
}
