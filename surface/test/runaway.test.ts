// MIGRATION.md item 111: the runaway trips' pure parts (surface/src/runaway.ts), on synthetic samples and rows.
import { describe, expect, test } from "bun:test";
import { BURN_WATCH_START, type BurnWatch, burnStep, isProgress, lastProgress } from "../src/runaway";

const MIN = 60_000;

describe("lastProgress (no-progress)", () => {
	const at = (m: number) => new Date(Date.UTC(2026, 9, 12, 1, m)).toISOString();
	const floor = Date.parse(at(0));
	test("wake-read entries and spend: lines are not progress; other writes by the lane are; other writers are ignored", () => {
		expect(isProgress({ created_by: "l-1", created_at: at(1), kind: "wake-read", body: "I resume" })).toBe(false);
		expect(isProgress({ created_by: "l-1", created_at: at(1), kind: "assumption", body: "spend: l-1 usd 1 tokens 2 wall 3" })).toBe(false);
		expect(isProgress({ created_by: "l-1", created_at: at(1), kind: "assumption", body: "hand-spawn: dt-1" })).toBe(true);
		expect(isProgress({ created_by: "l-1", created_at: at(1) })).toBe(true); // a slice or a question
		const rows = [
			{ created_by: "l-1", created_at: at(3), kind: "assumption", body: "builder-lab: openai" },
			...Array.from({ length: 20 }, (_, i) => ({ created_by: "l-1", created_at: at(4 + i), kind: "wake-read", body: "I resume" })),
			{ created_by: "lane-runner", created_at: at(30), kind: "assumption", body: "lane-started: l-1" },
		];
		expect(lastProgress(rows, "l-1", floor)).toBe(Date.parse(at(3)));
		expect(lastProgress(rows, "l-2", floor)).toBe(floor);
		// a write before the floor (before ready, or before a hold ended) does not move the clock back
		expect(lastProgress(rows, "l-1", Date.parse(at(10)))).toBe(Date.parse(at(10)));
	});
});

describe("burnStep (token-burn and token-total)", () => {
	/** Samples every 5 min from a 1M baseline (tokens already counted before this run), `perStep` tokens each. */
	const run = (steps: number, perStep: number, windowMs = 30 * MIN) => {
		let w: BurnWatch = BURN_WATCH_START;
		let last = burnStep(w, 0, 1e6, windowMs);
		w = last.watch;
		for (let i = 1; i <= steps; i++) {
			last = burnStep(w, i * 5 * MIN, 1e6 + i * perStep, windowMs);
			w = last.watch;
		}
		return last;
	};
	test("the total is since the run's baseline, not the workload's tally", () => {
		expect(run(3, 100).total).toBe(300);
	});
	test("the window covers the newest sample at least a window old: a steady rate reads the same after an hour as after half of one", () => {
		const half = run(6, 1_000);
		expect(half).toMatchObject({ window: 6_000, total: 6_000, windowMin: 30 });
		const hour = run(12, 1_000);
		expect(hour).toMatchObject({ window: 6_000, total: 12_000, windowMin: 30 });
		// the watch keeps the baseline and the window, not every sample
		expect(hour.watch.samples.length).toBeLessThanOrEqual(8);
	});
	test("before a window has passed, the window is everything since the baseline (a burst trips early)", () => {
		expect(run(2, 5_000)).toMatchObject({ window: 10_000, windowMin: 10 });
	});
});
