// P-11 row 12: the spawn-rate breaker. A session that dispatches more than BURST hands inside the
// burst window, or more than FLOOD inside the flood window, is refused until enough of its earlier
// spawns age out. Catastrophe-only: it bounds a looping session's call count, which the dollar
// ceiling does not (a loop can outrun the meter). Taken from rootstock-os hooks/fanout_guard.py
// DEFAULTS burst_cap/flood_cap (research/rootstock-os/REPORT.md § 3); the counter here is per gate
// session, in memory, and self-clearing: nothing to lift, no state on disk.
import type { Refusal } from "../types";
import { dispatchItems } from "./r04-tier-name";

export interface SpawnLimit {
	/** Hands allowed inside the window; one more is refused. */
	cap: number;
	/** Seconds the counter looks back. */
	windowSeconds: number;
}

export interface SpawnLimits {
	burst: SpawnLimit;
	flood: SpawnLimit;
}

export const SPAWN_LIMITS: SpawnLimits = {
	burst: { cap: 8, windowSeconds: 60 },
	flood: { cap: 25, windowSeconds: 600 },
};

/** Test override, `burst/window,flood/window` in seconds (e.g. `2/5,4/20`). Anything else is ignored. */
export const SPAWN_LIMITS_ENV = "GATE_SPAWN_LIMITS";

/** The limits in force: the env override when it parses as two positive `cap/window` pairs, else the defaults. */
export function spawnLimitsFrom(env: Record<string, string | undefined>): SpawnLimits {
	const m = /^(\d+)\/(\d+),(\d+)\/(\d+)$/.exec(env[SPAWN_LIMITS_ENV]?.trim() ?? "");
	if (!m) return SPAWN_LIMITS;
	const [burstCap, burstWindow, floodCap, floodWindow] = m.slice(1).map(Number) as [number, number, number, number];
	if ([burstCap, burstWindow, floodCap, floodWindow].some((n) => n <= 0)) return SPAWN_LIMITS;
	return { burst: { cap: burstCap, windowSeconds: burstWindow }, flood: { cap: floodCap, windowSeconds: floodWindow } };
}

/**
 * One session's spawn counter: a timestamp per hand dispatched, pruned past the longest window.
 * `admit` judges a `task` call and records its hands only when it lets the call through, so a
 * refused call never counts. It runs last among the dispatch rows, so a call another row refused
 * never reaches it.
 */
export class SpawnRate {
	#spawns: number[] = [];

	constructor(
		readonly limits: SpawnLimits = SPAWN_LIMITS,
		readonly now: () => number = Date.now,
	) {}

	admit(input: Record<string, unknown>): Refusal {
		const t = this.now();
		const hands = dispatchItems(input).length;
		const longest = Math.max(this.limits.burst.windowSeconds, this.limits.flood.windowSeconds) * 1000;
		this.#spawns = this.#spawns.filter((s) => t - s < longest);
		const refusal = this.#judge("burst", this.limits.burst, t, hands) ?? this.#judge("flood", this.limits.flood, t, hands);
		if (refusal) return refusal;
		for (let i = 0; i < hands; i++) this.#spawns.push(t);
		return null;
	}

	#judge(name: "burst" | "flood", limit: SpawnLimit, t: number, hands: number): Refusal {
		const windowMs = limit.windowSeconds * 1000;
		const inWindow = this.#spawns.filter((s) => t - s < windowMs);
		if (inWindow.length + hands <= limit.cap) return null;
		const head = `P-11 row 12 refused this dispatch (spawn ${name}): this session has spawned ${inWindow.length} hand${inWindow.length === 1 ? "" : "s"} in the last ${limit.windowSeconds}s and this call adds ${hands}; the limit is ${limit.cap} per ${limit.windowSeconds}s.`;
		if (hands > limit.cap) {
			return { block: true, reason: `${head} One call carries more hands than the limit, so waiting never clears it: dispatch at most ${limit.cap} per call.` };
		}
		// The oldest spawns in the window that must age out before this call fits; timestamps are pushed in order.
		const mustExpire = inWindow[inWindow.length + hands - limit.cap - 1]!;
		const wait = Math.max(1, Math.ceil((mustExpire + windowMs - t) / 1000));
		return {
			block: true,
			reason: `${head} Wait ${wait} second${wait === 1 ? "" : "s"}, then dispatch again; nothing needs lifting. A session spawning this fast is usually a loop: if it is not, batch fewer hands per call.`,
		};
	}
}
