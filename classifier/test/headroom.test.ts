/**
 * The headroom signal (classifier/src/headroom.ts; PLAN wl-mv71x5rwdu7eo0 § 2.2): projected-out at reset, the absorbed
 * 5h 80 % rule, tier binding (Fable's meter never takes Opus out), the old-line `rows` fallback, the seconds/ms clock
 * units of a real-shaped poll, and fail-open on stale or missing polls.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BURN_MIN, FIVE_HOUR_CEILING, headroom, STALE_MIN } from "../src/headroom";

const NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const MIN = 60_000;
const OPUS = "anthropic/claude-opus-5-5";
const FABLE = "anthropic/claude-fable-5-1";
const SOL = "openai-codex/gpt-6.1-sol";
const KIMI = "moonshot/kimi-k2.7-code";

interface Lim {
	provider: string;
	windowId: string;
	tier: string | null;
	resetsAt: number;
	usedFraction: number;
}
/** A `limits` entry as watch.py copies it from `omp usage --json`: `resetsAt` in epoch ms. */
const lim = (provider: string, windowId: string, usedFraction: number, resetInMin: number, tier: string | null = null): Lim => ({
	provider,
	windowId,
	tier,
	resetsAt: NOW + resetInMin * MIN,
	usedFraction,
});
/** A poll line `minAgo` minutes before NOW: `t` in epoch seconds, as watch.py writes it. */
const poll = (minAgo: number, limits: Lim[]) => JSON.stringify({ t: (NOW - minAgo * MIN) / 1000, rows: {}, limits });
/** An old poll line (before `limits`): `rows` only. */
const oldPoll = (minAgo: number, rows: Record<string, number>) => JSON.stringify({ t: (NOW - minAgo * MIN) / 1000, rows });
const at = (lines: string[], now = NOW) => headroom({ lines, now });

describe("constants", () => {
	test("PLAN § 2.2 values", () => {
		expect([STALE_MIN, BURN_MIN, FIVE_HOUR_CEILING]).toEqual([15, 60, 0.8]);
	});
});

describe("projected at reset", () => {
	test("exactly 1.0 is out, burn read against the newest poll at least BURN_MIN older", () => {
		// 90 and 30 min ago would give other rates (0.17/h and 0.02/h); only the 60-min poll projects exactly 1.0.
		const h = at([
			poll(90, [lim("anthropic", "7d", 0.5, 60)]),
			poll(60, [lim("anthropic", "7d", 0.5, 60)]),
			poll(30, [lim("anthropic", "7d", 0.74, 60)]),
			poll(0, [lim("anthropic", "7d", 0.75, 60)]),
		]);
		expect(h.note).toBeNull();
		expect(h.outFor(OPUS)).toBe("anthropic 7d 0.75 used, +25.0 pts/h, projected 1.00 at reset 2026-10-14T13:00Z");
	});

	test("1.0 used with no burn is out; 0.999 is not", () => {
		expect(at([poll(0, [lim("anthropic", "7d", 1.0, 600)])]).outFor(OPUS)).toContain("projected 1.00");
		expect(at([poll(0, [lim("anthropic", "7d", 0.999, 600)])]).outFor(OPUS)).toBeNull();
	});

	test("a drop of more than 0.2 is a reset: rate 0, where the same rise would be out", () => {
		const reset = at([poll(60, [lim("anthropic", "7d", 0.95, 6 * 24 * 60)]), poll(0, [lim("anthropic", "7d", 0.7, 6 * 24 * 60)])]);
		expect(reset.outFor(OPUS)).toBeNull();
		const rise = at([poll(60, [lim("anthropic", "7d", 0.45, 6 * 24 * 60)]), poll(0, [lim("anthropic", "7d", 0.7, 6 * 24 * 60)])]);
		expect(rise.outFor(OPUS)).toContain("projected");
	});

	test("a limit whose reset has passed binds nothing", () => {
		expect(at([poll(0, [lim("anthropic", "7d", 1.0, -1)])]).outFor(OPUS)).toBeNull();
	});
});

describe("the 5h 80 % rule (strict)", () => {
	test("0.80 is not out, 0.81 is", () => {
		expect(at([poll(0, [lim("anthropic", "5h", 0.8, 120)])]).outFor(OPUS)).toBeNull();
		expect(at([poll(0, [lim("anthropic", "5h", 0.81, 120)])]).outFor(OPUS)).toBe("anthropic 5h 0.81 used > 0.80");
	});

	test("the same rule for every provider; a 7d window at 0.85 is not under it", () => {
		expect(at([poll(0, [lim("openai-codex", "5h", 0.85, 120)])]).outFor(SOL)).toBe("openai-codex 5h 0.85 used > 0.80");
		expect(at([poll(0, [lim("openai-codex", "7d", 0.85, 6 * 24 * 60)])]).outFor(SOL)).toBeNull();
	});
});

describe("tier binding", () => {
	const lines = [
		poll(60, [lim("anthropic", "5h", 0.17, 120), lim("anthropic", "7d", 0.41, 3 * 24 * 60), lim("anthropic", "7d", 0.95, 3 * 24 * 60, "fable")]),
		poll(0, [lim("anthropic", "5h", 0.19, 120), lim("anthropic", "7d", 0.41, 3 * 24 * 60), lim("anthropic", "7d", 0.99, 3 * 24 * 60, "fable")]),
	];

	test("Fable's 7d at 0.99 takes claude-fable out but not claude-opus", () => {
		const h = at(lines);
		expect(h.outFor(FABLE)).toMatch(/^anthropic 7d fable 0\.99 used, \+4\.0 pts\/h, projected /);
		expect(h.outFor(OPUS)).toBeNull();
	});

	test("a `:level` suffix is stripped", () => {
		const h = at(lines);
		expect(h.outFor(`${FABLE}:high`)).toBe(h.outFor(FABLE));
		expect(h.outFor(`${OPUS}:xhigh`)).toBeNull();
	});

	test("a provider with no limits (moonshot) is never out", () => {
		const h = at([poll(0, [lim("anthropic", "5h", 0.99, 120), lim("openai-codex", "7d", 1.0, 60), lim("zai", "5h", 0.99, 60)])]);
		expect(h.outFor(OPUS)).not.toBeNull();
		expect(h.outFor(KIMI)).toBeNull();
		expect(h.outFor(`${KIMI}:high`)).toBeNull();
	});
});

describe("old poll lines (no `limits`)", () => {
	test("rows read as limits with no reset time: only the 5h rule, and the reason says so", () => {
		const h = at([oldPoll(0, { "anthropic/5h": 0.85, "anthropic/7d": 0.99, "anthropic/7d/fable": 0.99, "openai-codex/7d/chat": 0.99 })]);
		expect(h.note).toBeNull();
		expect(h.outFor(OPUS)).toBe("anthropic 5h 0.85 used > 0.80 (no reset time)");
		expect(h.outFor(SOL)).toBeNull();
	});

	test("`chat` is the shared meter and `fable` a tier: an old line's rows give the burn for a new line's limits", () => {
		const h = at([
			oldPoll(60, { "openai-codex/7d/chat": 0.5, "anthropic/7d": 0.5, "anthropic/7d/fable": 0.95 }),
			poll(0, [lim("openai-codex", "7d", 0.75, 60), lim("anthropic", "7d", 0.5, 3 * 24 * 60), lim("anthropic", "7d", 0.99, 3 * 24 * 60, "fable")]),
		]);
		expect(h.outFor(SOL)).toBe("openai-codex 7d 0.75 used, +25.0 pts/h, projected 1.00 at reset 2026-10-14T13:00Z");
		expect(h.outFor(FABLE)).toContain("anthropic 7d fable 0.99 used, +4.0 pts/h");
		expect(h.outFor(OPUS)).toBeNull();
	});

	test("an old 5h row with a third segment other than `chat` is a tier", () => {
		const h = at([oldPoll(0, { "anthropic/5h/fable": 0.9 })]);
		expect(h.outFor(FABLE)).toBe("anthropic 5h fable 0.90 used > 0.80 (no reset time)");
		expect(h.outFor(OPUS)).toBeNull();
	});
});

describe("a real-shaped poll: `t` in seconds, `resetsAt` in ms", () => {
	test("anthropic 5h at 0.19 with a slow burn is not out, and nothing is stale", () => {
		const t = 1792021768.179596;
		const old = (t - 3600.4) * 1000;
		const now = Math.round(t * 1000) + 2 * MIN;
		const line = (tSec: number, a5: number, a7: number, fable: number, oc: number) =>
			JSON.stringify({
				t: tSec,
				rows: { "openai-codex/7d/chat": oc, "zai/5h": 0, "zai/7d": 0, "anthropic/5h": a5, "anthropic/7d": a7, "anthropic/7d/fable": fable },
				limits: [
					{ provider: "anthropic", windowId: "5h", tier: null, resetsAt: 1792030800000, usedFraction: a5 },
					{ provider: "anthropic", windowId: "7d", tier: null, resetsAt: 1792303200000, usedFraction: a7 },
					{ provider: "anthropic", windowId: "7d", tier: "fable", resetsAt: 1792303200000, usedFraction: fable },
					{ provider: "openai-codex", windowId: "7d", tier: null, resetsAt: 1792389600000, usedFraction: oc },
				],
			});
		const h = headroom({ lines: [line(old / 1000, 0.17, 0.405, 0.03, 0.538), line(t, 0.19, 0.41, 0.03, 0.54)], now });
		expect(h.note).toBeNull();
		for (const s of [OPUS, FABLE, SOL, "zai/glm-5", KIMI]) expect(h.outFor(s)).toBeNull();
	});
});

describe("fail-open", () => {
	test(`newest poll older than ${STALE_MIN} min: nothing is out, with a note`, () => {
		const h = at([poll(16, [lim("anthropic", "5h", 0.99, 120)])]);
		expect(h.outFor(OPUS)).toBeNull();
		expect(h.note).toBe("headroom polls stale: newest 16 min old in inline lines");
		expect(at([poll(15, [lim("anthropic", "5h", 0.99, 120)])]).note).toBeNull();
	});

	test("malformed lines are skipped; no good line reads as empty", () => {
		const junk = ["not json", "{}", '{"t":"x","rows":{}}', "[1,2]", '{"t":1}', ""];
		expect(at(junk).note).toBe("headroom polls empty: inline lines");
		expect(at([...junk, poll(0, [lim("anthropic", "5h", 0.85, 120)])]).outFor(OPUS)).toBe("anthropic 5h 0.85 used > 0.80");
	});

	test("a missing file (env override): nothing is out, the note names the path", () => {
		const missing = join(tmpdir(), "as2-headroom-missing", "polls.jsonl");
		const prev = process.env.AS2_HEADROOM_POLLS;
		process.env.AS2_HEADROOM_POLLS = missing;
		try {
			const h = headroom({ now: NOW });
			expect(h.outFor(OPUS)).toBeNull();
			expect(h.note).toBe(`headroom polls unreadable: ${missing} (ENOENT)`);
		} finally {
			if (prev === undefined) delete process.env.AS2_HEADROOM_POLLS;
			else process.env.AS2_HEADROOM_POLLS = prev;
		}
	});
});

describe("the file read", () => {
	const dir = mkdtempSync(join(tmpdir(), "as2-headroom-"));
	afterAll(() => rmSync(dir, { recursive: true, force: true }));

	test("opts.path is read once per call", () => {
		const path = join(dir, "polls.jsonl");
		writeFileSync(path, `${poll(0, [lim("anthropic", "5h", 0.85, 120)])}\n`);
		const h = headroom({ path, now: NOW });
		writeFileSync(path, `${poll(0, [lim("anthropic", "5h", 0.1, 120)])}\n`);
		expect(h.outFor(OPUS)).toBe("anthropic 5h 0.85 used > 0.80");
		expect(headroom({ path, now: NOW }).outFor(OPUS)).toBeNull();
	});
});
