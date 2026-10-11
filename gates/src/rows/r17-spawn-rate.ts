// P-11 row 17: the spawn-rate breaker. A hands-per-lane-per-window limiter, not a call counter: a
// `task` call is refused while this lane already has BURST hands spawned inside the burst window, or
// FLOOD inside the flood window, and admitted again once enough of them age out (self-clearing,
// nothing to lift). It bounds a looping lane's spawn count, which the dollar ceiling does not (a loop
// can outrun the meter). Numbers from rootstock-os hooks/fanout_guard.py DEFAULTS burst_cap/flood_cap
// (research/rootstock-os/REPORT.md § 3).
//
// What it counts is what actually spawned: the `hand-spawn:` entries the classifier writes, one per
// hand, in the transaction that admits the spawn (classifier/extension.ts recordSpawn). So a review
// the classifier fans out into N reviewer hands counts N, a dispatch the classifier refuses counts 0,
// and an input shape the classifier rewrites counts whatever it became. The row only reads: entries
// of the session's workload written by this lane instance (`created_by`, the same LANE_ENV id the
// classifier stamps), inside the window by `created_at`. The call being judged is not counted, since
// its hand count is the classifier's to decide; a lane under the cap may therefore overshoot it by one
// call's batch, and the next call is refused.
import { parseHandSpawn } from "../../../classifier/src/lab";
import type { GateLedger, Refusal } from "../types";

export interface SpawnLimit {
	/** Hands this lane may have spawned inside the window; at the cap, the next dispatch is refused. */
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

/** Test override, `burst/window,flood/window` in seconds (e.g. `2/5,4/20`). */
export const SPAWN_LIMITS_ENV = "GATE_SPAWN_LIMITS";
const MAX_CAP = 1000;
const MAX_WINDOW_SECONDS = 86_400;

/**
 * The limits in force: the env override when every number is a whole number with cap 1–1000 and
 * window 1–86400 s, else the defaults. A set but rejected override is said once through `warn`.
 */
export function spawnLimitsFrom(env: Record<string, string | undefined>, warn: (line: string) => void = console.warn): SpawnLimits {
	const raw = env[SPAWN_LIMITS_ENV];
	if (raw === undefined || raw === "") return SPAWN_LIMITS;
	const m = /^(\d{1,7})\/(\d{1,7}),(\d{1,7})\/(\d{1,7})$/.exec(raw.trim());
	const n = m ? m.slice(1).map(Number) : [];
	const ok = (cap: number | undefined, window: number | undefined) =>
		Number.isSafeInteger(cap) && Number.isSafeInteger(window) && cap! >= 1 && cap! <= MAX_CAP && window! >= 1 && window! <= MAX_WINDOW_SECONDS;
	if (!ok(n[0], n[1]) || !ok(n[2], n[3])) {
		warn(`P-11 row 17: ${SPAWN_LIMITS_ENV}=${JSON.stringify(raw)} is not burst/window,flood/window (cap 1-${MAX_CAP}, window 1-${MAX_WINDOW_SECONDS}s); using ${SPAWN_LIMITS.burst.cap}/${SPAWN_LIMITS.burst.windowSeconds},${SPAWN_LIMITS.flood.cap}/${SPAWN_LIMITS.flood.windowSeconds}.`);
		return SPAWN_LIMITS;
	}
	return { burst: { cap: n[0]!, windowSeconds: n[1]! }, flood: { cap: n[2]!, windowSeconds: n[3]! } };
}

/** What the row needs beyond the workload: whose spawns count, the limits, and the clock (ms). */
export interface SpawnRateDeps {
	laneId: string;
	limits?: SpawnLimits;
	now?: () => number;
}

function judge(name: "burst" | "flood", limit: SpawnLimit, spawns: number[], t: number): Refusal {
	const windowMs = limit.windowSeconds * 1000;
	const inWindow = spawns.filter((s) => t - s < windowMs);
	if (inWindow.length < limit.cap) return null;
	// The oldest spawns that must age out before the lane is under the cap again.
	const wait = Math.max(1, Math.ceil((inWindow[inWindow.length - limit.cap]! + windowMs - t) / 1000));
	return {
		block: true,
		reason:
			`P-11 row 17 refused this dispatch (spawn ${name}): this lane has spawned ${inWindow.length} hands in the last ${limit.windowSeconds}s; the limit is ${limit.cap} per ${limit.windowSeconds}s. ` +
			`Wait ${wait} second${wait === 1 ? "" : "s"}, then dispatch again; nothing needs lifting. A lane spawning this fast is usually a loop: if it is not, dispatch fewer hands per call.`,
	};
}

/** Row 17 over a `task` call. Fails closed, like the question row, when the ledger cannot be read. */
export function checkSpawnRate(workload: { id: string; ledger: () => Pick<GateLedger, "entries"> }, deps: SpawnRateDeps): Refusal {
	const limits = deps.limits ?? SPAWN_LIMITS;
	const t = (deps.now ?? Date.now)();
	let spawns: number[];
	try {
		// The `created_at` times of this lane's `hand-spawn:` entries on the workload, oldest first.
		spawns = workload
			.ledger()
			.entries(workload.id, "assumption")
			.filter((e) => e.created_by === deps.laneId && parseHandSpawn(e.body) !== null)
			.map((e) => Date.parse(e.created_at));
	} catch (err) {
		return { block: true, reason: `P-11 row 17 could not read the ledger to count this lane's recent hand spawns (${String(err)}); refusing rather than pass unchecked.` };
	}
	return judge("burst", limits.burst, spawns, t) ?? judge("flood", limits.flood, spawns, t);
}
