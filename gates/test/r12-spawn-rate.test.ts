// P-11 row 12, the spawn-rate breaker: burst (8 hands / 60 s) and flood (25 / 600 s) per session,
// judged through the composed gate with a fake clock, plus the extension reading the env override.
import { describe, expect, test } from "bun:test";
import spawnRateRow from "../extensions/r12-spawn-rate";
import { checkToolCall } from "../src/gates";
import { SPAWN_LIMITS, SpawnRate, spawnLimitsFrom } from "../src/rows/r12-spawn-rate";
import type { GatesAPI } from "../src/session";
import type { CallContext, Refusal } from "../src/types";
import { brief } from "./helpers";

const ctx: CallContext = { role: "lane", cwd: "/", env: {} };
const dispatch = (hands = 1) => ({ toolName: "task", input: { tasks: Array.from({ length: hands }, () => ({ agent: "standard", task: brief() })) } });

/** A counter on a clock the test moves; `call` runs the whole composed gate, as a lane's dispatch would. */
function rig() {
	let t = 1_000_000;
	const rate = new SpawnRate(SPAWN_LIMITS, () => t);
	return {
		advance: (seconds: number) => {
			t += seconds * 1000;
		},
		call: (hands = 1, input = dispatch(hands)): Refusal => checkToolCall(input, ctx, { spawnRate: rate }),
	};
}

describe("row 12 burst", () => {
	test("8 spawns in a minute pass, the 9th is refused naming count, window and wait, and the window clears it", () => {
		const r = rig();
		for (let i = 0; i < 8; i++) {
			expect(r.call()).toBeNull();
			r.advance(5); // 8 spawns across 40 s
		}
		const refused = r.call();
		expect(refused?.block).toBe(true);
		expect(refused?.reason).toContain("P-11 row 12");
		expect(refused?.reason).toContain("spawn burst");
		expect(refused?.reason).toContain("spawned 8 hands in the last 60s");
		expect(refused?.reason).toContain("the limit is 8 per 60s");
		// The first spawn was 40 s ago, so it ages out in 20 s.
		expect(refused?.reason).toContain("Wait 20 seconds");
		r.advance(19);
		expect(r.call()?.reason).toContain("Wait 1 second,");
		r.advance(1);
		expect(r.call()).toBeNull();
	});
	test("a batch counts every hand it carries", () => {
		const r = rig();
		expect(r.call(5)).toBeNull();
		expect(r.call(4)?.reason).toContain("this call adds 4");
		expect(r.call(3)).toBeNull();
	});
	test("one call carrying more hands than the cap is told to split, not to wait", () => {
		const reason = rig().call(9)?.reason ?? "";
		expect(reason).toContain("dispatch at most 8 per call");
		expect(reason).not.toContain("Wait ");
	});
});

describe("row 12 flood", () => {
	test("25 spawns over 10 minutes pass, the 26th is refused", () => {
		const r = rig();
		for (let i = 0; i < 25; i++) {
			expect(r.call()).toBeNull();
			r.advance(20); // 25 spawns across 500 s: never more than 3 in any 60 s
		}
		const refused = r.call();
		expect(refused?.reason).toContain("spawn flood");
		expect(refused?.reason).toContain("spawned 25 hands in the last 600s");
		// The first spawn was 500 s ago: it ages out in 100 s.
		expect(refused?.reason).toContain("Wait 100 seconds");
		r.advance(100);
		expect(r.call()).toBeNull();
	});
});

describe("row 12 counts only spawns that happened", () => {
	test("a refusal from this row does not count as a spawn", () => {
		const r = rig();
		for (let i = 0; i < 8; i++) expect(r.call()).toBeNull();
		for (let i = 0; i < 20; i++) expect(r.call()).not.toBeNull(); // twenty refused attempts
		r.advance(60);
		for (let i = 0; i < 8; i++) expect(r.call()).toBeNull();
	});
	test("a dispatch another row refuses never reaches the counter", () => {
		const r = rig();
		const builder = { toolName: "task", input: { tasks: [{ agent: "builder", task: brief() }] } };
		for (let i = 0; i < 10; i++) expect(r.call(1, builder)?.reason).toContain("row 4");
		for (let i = 0; i < 8; i++) expect(r.call()).toBeNull();
	});
	test("other tools are not counted", () => {
		const r = rig();
		for (let i = 0; i < 20; i++) expect(r.call(1, { toolName: "read", input: { path: "/tmp/x" } })).toBeNull();
		for (let i = 0; i < 8; i++) expect(r.call()).toBeNull();
	});
});

describe("row 12 limits", () => {
	test("defaults: burst 8/60, flood 25/600", () => {
		expect(SPAWN_LIMITS).toEqual({ burst: { cap: 8, windowSeconds: 60 }, flood: { cap: 25, windowSeconds: 600 } });
		expect(spawnLimitsFrom({})).toBe(SPAWN_LIMITS);
	});
	test("GATE_SPAWN_LIMITS parses as burst/window,flood/window; anything else keeps the defaults", () => {
		expect(spawnLimitsFrom({ GATE_SPAWN_LIMITS: "2/5,4/20" })).toEqual({ burst: { cap: 2, windowSeconds: 5 }, flood: { cap: 4, windowSeconds: 20 } });
		for (const bad of ["", "2/5", "2/5,4", "0/5,4/20", "a/b,c/d", "2/5;4/20", "-1/5,4/20"]) expect(spawnLimitsFrom({ GATE_SPAWN_LIMITS: bad })).toBe(SPAWN_LIMITS);
	});
	test("the extension reads the override from the session's env and keeps one counter per session", async () => {
		const handlers: ((event: unknown, ctx: unknown) => unknown)[] = [];
		spawnRateRow({ on: (_: string, h: (event: unknown, ctx: unknown) => unknown) => handlers.push(h) } as unknown as GatesAPI, { GATE_SPAWN_LIMITS: "2/60,4/600" });
		const session = () => ({ hasUI: true, cwd: "/", sessionManager: { getHeader: () => ({}), getEntries: () => [] }, ui: { notify: () => {} } });
		const a = session();
		const b = session();
		const emit = (c: unknown) => handlers[0]!({ toolName: "task", input: { agent: "standard", task: brief() } }, c) as Refusal | undefined;
		expect(emit(a)).toBeUndefined();
		expect(emit(a)).toBeUndefined();
		expect(emit(a)?.reason).toContain("the limit is 2 per 60s");
		expect(emit(b)).toBeUndefined(); // another session's counter is its own
		expect(handlers[0]!({ toolName: "bash", input: { command: "ls" } }, a)).toBeUndefined();
	});
});
