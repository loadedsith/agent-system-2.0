// The per-workload ctx index (MIGRATION.md item 43; surface/src/ctx-index.ts) with a fake exec and
// fixture files in a temp dir: no test here reaches a real ctx. Every case injects `exec`,
// `passwdHome` and `which`; the guard cases assert the fake exec was never called.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type EntryRow, LANE_RUNNER_BY, LANE_STARTER_BY, type Ledger } from "../../ledger/src/index";
import {
	claimCtxIndex, type CtxExec, type CtxExecResult, CTX_CHECK_ATTEMPTS, indexLaneSessions, type IndexLaneSessions, laneSession, newLaneSession, runCtxIndex,
	sessionHeaderId, topLevelSessions,
} from "../src/ctx-index";
import { controlEntries, laneStartedBody, reservedPrefix } from "../src/launch";
import { SURFACE_BY } from "../src/types";
import { tempLedger, tmp, workloadWithSlice } from "./helpers";

const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const scratch = (tag: string): string => {
	const d = tmp(`ctx-index-${tag}`);
	dirs.push(d);
	return d;
};

const HOME = "/Users/someone";
const CTX = "/fake/bin/ctx";
const SESSION_ID = "01a0f978-4e76-7000-8409-d4b8b3a0c360";
const title = JSON.stringify({ type: "title", v: 1, title: "", updatedAt: "2026-10-01T21:56:46.326Z", pad: " ".repeat(180) });
const header = (id: string) => JSON.stringify({ type: "session", version: 3, id, timestamp: "2026-10-01T21:56:46.326Z", cwd: "/w" });
/** A sessions folder with one OMP-shaped lane session: the title line, then the header on line 2. */
function sessionsFixture(lines: string[] = [title, header(SESSION_ID), '{"type":"model_change"}']): { dir: string; file: string } {
	const dir = scratch("sessions");
	const file = join(dir, `2026-10-01T21-56-46-326Z_${SESSION_ID}.jsonl`);
	writeFileSync(file, `${lines.join("\n")}\n`);
	return { dir, file };
}

const hit: CtxExecResult = { code: 0, stdout: JSON.stringify({ terminal: false, truncated: true, events: [{ provider_session_id: SESSION_ID }] }), stderr: "" };
const miss: CtxExecResult = { code: 0, stdout: JSON.stringify({ terminal: true, truncated: false, events: [] }), stderr: "" };
const ok: CtxExecResult = { code: 0, stdout: "imported\n", stderr: "" };
/** A fake exec answering each call in turn from `replies` ("hang" never resolves); the log is every argv it saw, `aborted` the calls the bound killed. */
function fakeExec(replies: (CtxExecResult | "hang")[]): { exec: CtxExec; log: string[][]; aborted: string[] } {
	const log: string[][] = [];
	const aborted: string[] = [];
	const exec: CtxExec = (argv, { signal }) => {
		log.push(argv);
		const r = replies[log.length - 1] ?? replies.at(-1)!;
		if (r !== "hang") return Promise.resolve(r);
		signal.addEventListener("abort", () => aborted.push(argv[1]!));
		return new Promise<CtxExecResult>(() => undefined);
	};
	return { exec, log, aborted };
}
const fast = { importMs: 300, checkMs: 300, totalMs: 10_000, retryMs: 1 };
const run = (sessionFile: string | null, sessionsDir: string, exec: CtxExec, over: Partial<IndexLaneSessions> = {}) =>
	indexLaneSessions({ sessionsDir, sessionFile, env: { HOME, PATH: "/fake/bin" }, exec, passwdHome: () => HOME, which: () => CTX, timeouts: fast, ...over });
const importArgv = (dir: string) => [CTX, "import", "--provider", "pi", "--path", dir, "--no-blame", "--no-daemon", "--progress", "none"];
const checkArgv = [CTX, "list", "events", "--provider", "pi", "--provider-session", SESSION_ID, "--limit", "1", "--content", "none", "--format", "json"];

describe("indexLaneSessions: import the workload's sessions folder, then the lane's session by exact id", () => {
	test("(i) import ok and the check returns one event → indexed; the exec log is exactly the import, then the check by provider-session", async () => {
		const { dir, file } = sessionsFixture();
		const f = fakeExec([ok, hit]);
		expect(await run(file, dir, f.exec)).toEqual({ outcome: "indexed", sessionId: SESSION_ID, detail: "found by id after 1 check(s)" });
		expect(f.log).toEqual([importArgv(dir), checkArgv]);
	});

	test(`(ii) the check returns zero events (terminal) every time → failed after ${CTX_CHECK_ATTEMPTS} checks`, async () => {
		const { dir, file } = sessionsFixture();
		const f = fakeExec([ok, miss]);
		expect(await run(file, dir, f.exec)).toEqual({ outcome: "failed", sessionId: SESSION_ID, detail: `not found by id after ${CTX_CHECK_ATTEMPTS} checks` });
		expect(f.log).toEqual([importArgv(dir), ...Array.from({ length: CTX_CHECK_ATTEMPTS }, () => checkArgv)]);
	});

	test("(iii) the index lags: the first check misses, the second hits → indexed after 2 checks", async () => {
		const { dir, file } = sessionsFixture();
		const f = fakeExec([ok, miss, hit]);
		expect(await run(file, dir, f.exec)).toEqual({ outcome: "indexed", sessionId: SESSION_ID, detail: "found by id after 2 check(s)" });
		expect(f.log).toEqual([importArgv(dir), checkArgv, checkArgv]);
	});

	test("(iv) the import exits 1 → failed naming its stderr, and no check runs", async () => {
		const { dir, file } = sessionsFixture();
		const f = fakeExec([{ code: 1, stdout: "", stderr: "\nerror: the daemon is not running\nmore\n" }]);
		expect(await run(file, dir, f.exec)).toEqual({ outcome: "failed", sessionId: SESSION_ID, detail: "import exit 1: error: the daemon is not running" });
		expect(f.log).toEqual([importArgv(dir)]);
	});

	test("(v) the guard: HOME not the passwd home, CTX_DATA_ROOT set, or no passwd home → skipped with no ctx call", async () => {
		const { dir, file } = sessionsFixture();
		const cases: [Partial<IndexLaneSessions>, string][] = [
			[{ env: { HOME: "/tmp/surface-lane-root-x/home", PATH: "/fake/bin" } }, "home-guard"],
			[{ env: { PATH: "/fake/bin" } }, "home-guard"],
			[{ env: { HOME, PATH: "/fake/bin", CTX_DATA_ROOT: "/tmp/ctx-probe" } }, "ctx-data-root"],
			[{ env: { HOME, PATH: "/fake/bin", CTX_DATA_ROOT: "" } }, "ctx-data-root"],
			[{ passwdHome: () => null }, "passwd-home-unknown"],
			[{ passwdHome: () => "" }, "passwd-home-unknown"],
		];
		for (const [over, detail] of cases) {
			const f = fakeExec([ok, hit]);
			expect(await run(file, dir, f.exec, over)).toEqual({ outcome: "skipped", sessionId: SESSION_ID, detail });
			expect(f.log).toEqual([]);
		}
		// the same home with a trailing slash passes; no ctx on PATH is a skip before any call
		const f = fakeExec([ok, hit]);
		expect((await run(file, dir, f.exec, { env: { HOME: `${HOME}/`, PATH: "/fake/bin" } })).outcome).toBe("indexed");
		const none = fakeExec([ok, hit]);
		expect(await run(file, dir, none.exec, { which: () => null })).toEqual({ outcome: "skipped", sessionId: SESSION_ID, detail: "no-ctx" });
		expect(none.log).toEqual([]);
	});

	test("(vi) a session file with no header, a missing file, or no session path → skipped no-session, no ctx call", async () => {
		const { dir, file } = sessionsFixture([title, '{"type":"model_change"}']);
		for (const sessionFile of [file, join(dir, "gone.jsonl"), null]) {
			const f = fakeExec([ok, hit]);
			expect(await run(sessionFile, dir, f.exec)).toEqual({ outcome: "skipped", sessionId: null, detail: "no-session" });
			expect(f.log).toEqual([]);
		}
	});

	test("(vii) the header id is read from line 2 after the title line; a header past line 5 is not looked for", () => {
		expect(sessionHeaderId(sessionsFixture().file)).toBe(SESSION_ID);
		const late = ["{}", "{}", "{}", "{}", "{}", header(SESSION_ID)];
		expect(sessionHeaderId(sessionsFixture([title, ...late]).file)).toBeNull();
		expect(sessionHeaderId(sessionsFixture(['{"type":"session"}']).file)).toBeNull();
	});

	test("(ix) a check that never returns → failed timeout check within the bound, the hung call aborted; an import that hangs → failed timeout import", async () => {
		const { dir, file } = sessionsFixture();
		const check = fakeExec([ok, "hang"]);
		const t0 = Date.now();
		expect(await run(file, dir, check.exec)).toEqual({ outcome: "failed", sessionId: SESSION_ID, detail: "timeout check" });
		expect(Date.now() - t0).toBeLessThan(2_000);
		expect(check.aborted).toEqual(["list"]);
		const imp = fakeExec(["hang"]);
		const t1 = Date.now();
		expect(await run(file, dir, imp.exec)).toEqual({ outcome: "failed", sessionId: SESSION_ID, detail: "timeout import" });
		expect(Date.now() - t1).toBeLessThan(2_000);
		expect(imp.aborted).toEqual(["import"]);
		expect(imp.log).toHaveLength(1);
		// the whole run's bound cuts a step short of its own
		const total = fakeExec([ok, "hang"]);
		const t2 = Date.now();
		expect((await run(file, dir, total.exec, { timeouts: { ...fast, checkMs: 60_000, totalMs: 400 } })).detail).toBe("timeout check");
		expect(Date.now() - t2).toBeLessThan(2_000);
	});
});

let seq = 0;
const entry = (by: string, body: string): EntryRow => ({
	id: `e-${++seq}`, workload_id: "wl-m", slice_id: null, kind: "assumption", body, created_by: by, created_at: `2026-10-01T09:${String(seq).padStart(2, "0")}:00.000Z`,
} as EntryRow);
const startedEntry = (lane: string, session: string | null, by = LANE_RUNNER_BY) => entry(by, laneStartedBody(lane, { pid: 1, start: "x", session, argv: [], runnerPid: 2 }));

describe("the session is this lane's own, never a newest-file guess", () => {
	test("(x) two lanes' lane-started: records → this lane's newest session; none when this lane recorded none", () => {
		const control = controlEntries([
			startedEntry("lane-m-1", null), startedEntry("lane-m-1", "/s/one.jsonl"),
			startedEntry("lane-m-2", "/s/two.jsonl", LANE_STARTER_BY),
			startedEntry("lane-m-3", null),
		]);
		expect(laneSession(control, "lane-m-1")).toBe("/s/one.jsonl");
		expect(laneSession(control, "lane-m-2")).toBe("/s/two.jsonl");
		expect(laneSession(control, "lane-m-3")).toBeNull();
		expect(laneSession(control, "lane-m-4")).toBeNull();
		// a lane-started: a lane forged for itself is not a record
		expect(laneSession(controlEntries([startedEntry("lane-m-5", "/s/forged.jsonl", "lane-m-5")]), "lane-m-5")).toBeNull();
	});

	test("(xi) newLaneSession: a pre-existing file modified after the spawn is never taken; a new file is; of two new files, the newer", () => {
		const dir = scratch("new-session");
		const at = (name: string, secondsAgo: number) => {
			const p = join(dir, name);
			writeFileSync(p, "{}\n");
			const t = Date.now() / 1000 - secondsAgo;
			utimesSync(p, t, t);
			return p;
		};
		at("old.jsonl", 100);
		mkdirSync(join(dir, "old"));
		const before = topLevelSessions(dir);
		expect(before).toEqual(["old.jsonl"]);
		at("old.jsonl", 0);
		at(join("old", "Hand.jsonl"), 0);
		expect(newLaneSession(dir, before)).toBeNull();
		const fresh = at("fresh.jsonl", 10);
		expect(newLaneSession(dir, before)).toBe(fresh);
		const newer = at("newer.jsonl", 5);
		expect(newLaneSession(dir, before)).toBe(newer);
	});
});

describe("ctx-index: a fixed-writer control prefix", () => {
	test("(viii) controlEntries keeps a ctx-index: by the runner or the starter and drops one by a lane or the surface; the lane tools refuse it", () => {
		const body = `ctx-index: lane-m-1 indexed ${SESSION_ID} found by id after 1 check(s)`;
		const kept = controlEntries([entry(LANE_RUNNER_BY, body), entry(LANE_STARTER_BY, "ctx-index: lane-m-1 claimed 42"), entry("lane-m-1", body), entry(SURFACE_BY, body)]);
		expect(kept.map((c) => [c.prefix, c.laneId, c.createdBy, c.rest])).toEqual([
			["ctx-index", "lane-m-1", LANE_RUNNER_BY, `indexed ${SESSION_ID} found by id after 1 check(s)`],
			["ctx-index", "lane-m-1", LANE_STARTER_BY, "claimed 42"],
		]);
		expect(reservedPrefix(body)).toBe("ctx-index");
	});
});

describe("the ctx-index subcommand: --by, the claim, the record", () => {
	/** A temp ledger with a workload and lane `laneId`'s lane-started: naming a fixture session. */
	function fixture(): { ledger: Ledger; wl: string; dir: string; started: (laneId: string) => void } {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const { dir, file } = sessionsFixture();
		const started = (laneId: string) => {
			ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: wl, kind: "assumption", body: laneStartedBody(laneId, { pid: 1, start: "x", session: file, argv: [], runnerPid: 2 }) });
		};
		return { ledger, wl, dir, started };
	}
	const worker = (ledger: Ledger, wl: string, dir: string, laneId: string | undefined, by: string | undefined, exec: CtxExec, pid = 100) => {
		const log: string[] = [];
		let opened = 0;
		const code = runCtxIndex({
			openLedger: () => {
				opened++;
				return ledger;
			},
			workloadId: wl, laneId, by, pid, sessionsDir: dir, env: { HOME, PATH: "/fake/bin" }, exec, passwdHome: () => HOME, which: () => CTX, timeouts: fast, log: (l) => log.push(l),
		});
		return { code, log, opened: () => opened };
	};
	const ctxRows = (ledger: Ledger, wl: string) => ledger.entries(wl).filter((e) => e.body.startsWith("ctx-index:")).map((e) => `${e.created_by} ${e.body}`);

	test("(xii) --by runner → the runner writes, starter → the starter; missing or anything else (or no lane id) → exit 1, no ledger opened, nothing written", async () => {
		const { ledger, wl, dir, started } = fixture();
		started("lane-a-1");
		started("lane-a-2");
		const before = ledger.entries(wl).length;
		for (const [laneId, by] of [["lane-a-1", undefined], ["lane-a-1", "hand"], ["lane-a-1", ""], ["lane-a-1", "Runner"], [undefined, "runner"], ["--by", "runner"]] as const) {
			const f = fakeExec([ok, hit]);
			const w = worker(ledger, wl, dir, laneId, by, f.exec);
			expect(await w.code).toBe(1);
			expect(w.opened()).toBe(0);
			expect(f.log).toEqual([]);
		}
		expect(ledger.entries(wl)).toHaveLength(before);
		expect(await worker(ledger, wl, dir, "lane-a-1", "runner", fakeExec([ok, hit]).exec, 7).code).toBe(0);
		expect(await worker(ledger, wl, dir, "lane-a-2", "starter", fakeExec([ok, hit]).exec, 8).code).toBe(0);
		expect(ctxRows(ledger, wl)).toEqual([
			`${LANE_RUNNER_BY} ctx-index: lane-a-1 claimed 7`,
			`${LANE_RUNNER_BY} ctx-index: lane-a-1 indexed ${SESSION_ID} found by id after 1 check(s)`,
			`${LANE_STARTER_BY} ctx-index: lane-a-2 claimed 8`,
			`${LANE_STARTER_BY} ctx-index: lane-a-2 indexed ${SESSION_ID} found by id after 1 check(s)`,
		]);
	});

	test("(xiii) two workers for one lane → exactly one claimed entry and the second makes no exec call; another lane's claim is independent; a lane's forged claim blocks nothing", async () => {
		const { ledger, wl, dir, started } = fixture();
		started("lane-a-1");
		started("lane-a-2");
		ledger.recordEntry({ by: "lane-a-1", workloadId: wl, kind: "assumption", body: "ctx-index: lane-a-1 claimed 1" });
		const first = fakeExec([ok, hit]);
		const second = fakeExec([ok, hit]);
		const [a, b] = [worker(ledger, wl, dir, "lane-a-1", "runner", first.exec, 11), worker(ledger, wl, dir, "lane-a-1", "starter", second.exec, 12)];
		expect([await a.code, await b.code]).toEqual([0, 0]);
		expect(first.log).toEqual([importArgv(dir), checkArgv]);
		expect(second.log).toEqual([]);
		const other = fakeExec([ok, hit]);
		expect(await worker(ledger, wl, dir, "lane-a-2", "runner", other.exec, 13).code).toBe(0);
		expect(other.log).toHaveLength(2);
		const valid = controlEntries(ledger.entries(wl)).filter((c) => c.prefix === "ctx-index");
		expect(valid.map((c) => [c.laneId, c.createdBy, c.rest])).toEqual([
			["lane-a-1", LANE_RUNNER_BY, "claimed 11"],
			["lane-a-1", LANE_RUNNER_BY, `indexed ${SESSION_ID} found by id after 1 check(s)`],
			["lane-a-2", LANE_RUNNER_BY, "claimed 13"],
			["lane-a-2", LANE_RUNNER_BY, `indexed ${SESSION_ID} found by id after 1 check(s)`],
		]);
		// the claim alone, as the subcommand's first transaction: a third worker for lane-a-1 is refused it
		expect(claimCtxIndex(ledger, wl, "lane-a-1", LANE_STARTER_BY, 14)).toBe(false);
	});

	test("a lane whose lane-started: names no session: claimed, then skipped no-session, no ctx call", async () => {
		const { ledger, wl, dir } = fixture();
		ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: wl, kind: "assumption", body: laneStartedBody("lane-a-1", { pid: 1, start: "x", session: null, argv: [], runnerPid: 2 }) });
		const f = fakeExec([ok, hit]);
		expect(await worker(ledger, wl, dir, "lane-a-1", "runner", f.exec, 21).code).toBe(0);
		expect(f.log).toEqual([]);
		expect(ctxRows(ledger, wl)).toEqual([`${LANE_RUNNER_BY} ctx-index: lane-a-1 claimed 21`, `${LANE_RUNNER_BY} ctx-index: lane-a-1 skipped - no-session`]);
	});
});
