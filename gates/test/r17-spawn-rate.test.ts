// P-11 row 17, the spawn-rate breaker: a hands-per-lane-per-window limiter (burst 8 / 60 s, flood
// 25 / 600 s) counting the classifier's `hand-spawn:` entries in a real temp ledger, judged through
// the composed gate with one clock shared by the ledger and the row. Each test plays the classifier's
// part by writing (or not writing) the entries a dispatch would have produced.
import { describe, expect, test } from "bun:test";
import { handSpawnBody } from "../../classifier/src/lab";
import spawnRateRow from "../extensions/r17-spawn-rate";
import { checkToolCall } from "../src/gates";
import { SPAWN_LIMITS, type SpawnLimits, spawnLimitsFrom } from "../src/rows/r17-spawn-rate";
import type { GatesAPI } from "../src/session";
import type { CallContext, Refusal } from "../src/types";
import { brief, tempLedger } from "./helpers";

const LANE = "lane-r17";
const ctx: CallContext = { role: "lane", cwd: "/", env: {} };

function rig(limits: SpawnLimits = SPAWN_LIMITS) {
	let now = Date.parse("2026-10-11T12:00:00.000Z");
	const { ledger, path } = tempLedger(() => new Date(now).toISOString());
	const wl = ledger.openWorkload({ by: LANE, brief: "b", stakes: "normal", mode: "autonomous" });
	let n = 0;
	/** What the classifier writes when it admits one hand: a `hand-spawn:` entry stamped with the lane id. */
	const spawned = (hands = 1, by = LANE, review = false) => {
		const group = `dg-${n}`;
		for (let i = 0; i < hands; i++) {
			n++;
			ledger.recordEntry({ by, workloadId: wl, kind: "assumption", body: handSpawnBody({ token: `dt-${n}`, root: "/s/lane.jsonl", spawnKey: null, review, group, row: ["openai/gpt-6"] }) });
		}
	};
	const dispatch = (input: Record<string, unknown> = { tasks: [{ agent: "standard", task: brief({ workload: wl }) }] }): Refusal =>
		checkToolCall({ toolName: "task", input }, ctx, { workload: { id: wl, ledger: () => ledger }, spawnRate: { laneId: LANE, limits, now: () => now } });
	return {
		ledger,
		path,
		wl,
		spawned,
		dispatch,
		advance: (seconds: number) => {
			now += seconds * 1000;
		},
	};
}

describe("row 17 burst", () => {
	test("8 hands spawned in a minute pass, the 9th dispatch is refused naming count, window and wait, and the window clears it", () => {
		const r = rig();
		for (let i = 0; i < 8; i++) {
			expect(r.dispatch()).toBeNull();
			r.spawned();
			r.advance(5); // 8 spawns across 40 s
		}
		const refused = r.dispatch();
		expect(refused?.block).toBe(true);
		expect(refused?.reason).toContain("P-11 row 17");
		expect(refused?.reason).toContain("spawn burst");
		expect(refused?.reason).toContain("this lane has spawned 8 hands in the last 60s");
		expect(refused?.reason).toContain("the limit is 8 per 60s");
		// The first spawn was 40 s ago, so it ages out in 20 s.
		expect(refused?.reason).toContain("Wait 20 seconds");
		r.advance(19);
		expect(r.dispatch()?.reason).toContain("Wait 1 second,");
		r.advance(1);
		expect(r.dispatch()).toBeNull();
	});
});

describe("row 17 flood", () => {
	test("25 hands over 10 minutes pass, the 26th dispatch is refused", () => {
		const r = rig();
		for (let i = 0; i < 25; i++) {
			expect(r.dispatch()).toBeNull();
			r.spawned();
			r.advance(20); // 25 spawns across 500 s: never more than 3 in any 60 s
		}
		const refused = r.dispatch();
		expect(refused?.reason).toContain("spawn flood");
		expect(refused?.reason).toContain("this lane has spawned 25 hands in the last 600s");
		// The first spawn was 500 s ago: it ages out in 100 s.
		expect(refused?.reason).toContain("Wait 100 seconds");
		r.advance(100);
		expect(r.dispatch()).toBeNull();
	});
});

describe("row 17 counts the hands that actually spawned", () => {
	test("a review the classifier fans out into 3 reviewer hands counts 3, not 1", () => {
		const r = rig();
		for (let i = 0; i < 5; i++) {
			expect(r.dispatch()).toBeNull();
			r.spawned();
		}
		expect(r.dispatch()).toBeNull(); // one review call…
		r.spawned(3, LANE, true); // …that the classifier expands into three members of one group
		// Six calls, eight hands: the seventh call is refused.
		expect(r.dispatch()?.reason).toContain("spawned 8 hands in the last 60s");
	});
	test("a dispatch the classifier refused (no hand-spawn written) counts 0", () => {
		const r = rig();
		for (let i = 0; i < 20; i++) expect(r.dispatch()).toBeNull(); // twenty calls the classifier refused
		for (let i = 0; i < 8; i++) {
			expect(r.dispatch()).toBeNull();
			r.spawned();
		}
		expect(r.dispatch()?.reason).toContain("spawned 8 hands");
	});
	test("this row's own refusals count 0", () => {
		const r = rig();
		r.spawned(8);
		for (let i = 0; i < 20; i++) expect(r.dispatch()).not.toBeNull();
		r.advance(60);
		expect(r.dispatch()).toBeNull();
	});
	test("an empty `tasks: []` beside a flat dispatch counts whatever the classifier spawned from it", () => {
		const r = rig({ burst: { cap: 4, windowSeconds: 60 }, flood: { cap: 25, windowSeconds: 600 } });
		const mixed = { tasks: [], agent: "deep", name: "slice", task: brief({ workload: r.wl }) };
		expect(r.dispatch(mixed)).toBeNull();
		r.spawned(4, LANE, true); // the classifier rewrote it into a four-member batch
		expect(r.dispatch(mixed)?.reason).toContain("spawned 4 hands in the last 60s");
	});
	test("another lane's spawns and other entries are not this lane's count", () => {
		const r = rig();
		r.spawned(20, "lane-other");
		r.ledger.recordEntry({ by: LANE, workloadId: r.wl, kind: "assumption", body: "hand-settled: dt-1 routing rt-1" });
		r.spawned(7);
		expect(r.dispatch()).toBeNull();
		r.spawned();
		expect(r.dispatch()?.reason).toContain("spawned 8 hands");
	});
	test("a ledger that cannot be read refuses rather than passing unchecked", () => {
		const r = rig();
		const broken = checkToolCall({ toolName: "task", input: { tasks: [{ agent: "standard", task: brief({ workload: r.wl }) }] } }, ctx, {
			workload: {
				id: r.wl,
				ledger: () => {
					throw new Error("disk gone");
				},
			} as never,
			spawnRate: { laneId: LANE },
		});
		expect(broken?.reason).toContain("could not read the ledger");
	});
});

describe("row 17 limits", () => {
	test("defaults: burst 8/60, flood 25/600", () => {
		expect(SPAWN_LIMITS).toEqual({ burst: { cap: 8, windowSeconds: 60 }, flood: { cap: 25, windowSeconds: 600 } });
		expect(spawnLimitsFrom({})).toBe(SPAWN_LIMITS);
	});
	test("GATE_SPAWN_LIMITS parses burst/window,flood/window within cap 1-1000 and window 1-86400 s", () => {
		expect(spawnLimitsFrom({ GATE_SPAWN_LIMITS: "2/5,4/20" })).toEqual({ burst: { cap: 2, windowSeconds: 5 }, flood: { cap: 4, windowSeconds: 20 } });
		expect(spawnLimitsFrom({ GATE_SPAWN_LIMITS: "1000/86400,1/1" })).toEqual({ burst: { cap: 1000, windowSeconds: 86400 }, flood: { cap: 1, windowSeconds: 1 } });
	});
	test("a malformed, zero, out-of-bound or overflowing override keeps the defaults and says so in one line", () => {
		const nines = "9".repeat(400);
		const bad = ["2/5", "2/5,4", "0/5,4/20", "a/b,c/d", "2/5;4/20", "-1/5,4/20", "1001/60,25/600", "8/86401,25/600", `${nines}/60,${nines}/600`, "8/60,25/1e9", "8.5/60,25/600"];
		for (const value of bad) {
			const lines: string[] = [];
			expect(spawnLimitsFrom({ GATE_SPAWN_LIMITS: value }, (l) => lines.push(l))).toBe(SPAWN_LIMITS);
			expect(lines).toHaveLength(1);
			expect(lines[0]).toContain("using 8/60,25/600");
		}
	});
	test("the extension reads the override once and counts this lane's entries in the session's ledger", () => {
		// The extension runs on the real clock, so this ledger stamps entries with it too.
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: LANE, brief: "b", stakes: "normal", mode: "autonomous" });
		const handlers: ((event: unknown, c: unknown) => unknown)[] = [];
		const env = { GATE_SPAWN_LIMITS: "2/60,4/600", AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: LANE, AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_ROLE: "lane" };
		spawnRateRow({ on: (_: string, h: (event: unknown, c: unknown) => unknown) => handlers.push(h) } as unknown as GatesAPI, env);
		const session = () => ({ hasUI: true, cwd: "/", sessionManager: { getHeader: () => ({}), getEntries: () => [] }, ui: { notify: () => {} } });
		const call = { toolName: "task", input: { agent: "standard", task: brief({ workload: wl }) } };
		const lane = session();
		expect(handlers[0]!(call, lane)).toBeUndefined();
		for (const token of ["dt-a", "dt-b"]) {
			ledger.recordEntry({ by: LANE, workloadId: wl, kind: "assumption", body: handSpawnBody({ token, root: "/s", spawnKey: null, review: false, group: `dg-${token}`, row: [] }) });
		}
		expect((handlers[0]!(call, lane) as Refusal)?.reason).toContain("the limit is 2 per 60s");
		expect(handlers[0]!({ toolName: "bash", input: { command: "ls" } }, lane)).toBeUndefined();
		// A session with no workload is not judged.
		const unbound: unknown[] = [];
		spawnRateRow({ on: (_: string, h: (event: unknown, c: unknown) => unknown) => unbound.push(h) } as unknown as GatesAPI, { AGENT_SYSTEM_LEDGER_DB: path });
		expect((unbound[0] as (e: unknown, c: unknown) => unknown)(call, session())).toBeUndefined();
	});
});
