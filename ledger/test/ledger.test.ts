import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
// Only names that also existed before the N1-N4 fixes, so each regression below fails on its own
// assertion against the old module rather than the whole file failing to load.
import { assertLocalPath, defaultLedgerPath, Ledger, LEDGER_DB_ENV, LedgerLocationError } from "../src/index";

const REPO = join(import.meta.dir, "..", "..");
const SQLITE3 = existsSync("/usr/bin/sqlite3") ? "/usr/bin/sqlite3" : "sqlite3";
const scratch = (label: string) => mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), `ledger-${label}-`));
const fresh = (label: string, opts: Parameters<typeof Ledger.open>[1] = {}) =>
	Ledger.open(join(scratch(label), "ledger.db"), { create: true, ...opts });

/** Raw sqlite3 CLI (foreign_keys and recursive_triggers off): SQL on stdin, stops at the first error. */
function sqlite(path: string, sql: string): { exitCode: number | null; out: string; err: string } {
	const r = Bun.spawnSync([SQLITE3, "-batch", "-bail", path], { stdin: Buffer.from(sql), stdout: "pipe", stderr: "pipe" });
	return { exitCode: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
}

/** `bun run ledger/scripts/<name> ...args`. */
function script(name: string, ...args: string[]): { exitCode: number | null; out: string; err: string } {
	const r = Bun.spawnSync(["bun", "run", join(REPO, "ledger", "scripts", name), ...args], { stdout: "pipe", stderr: "pipe" });
	return { exitCode: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

const RAW_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
const RAW_STAMPS = `'tool:sqlite3', ${RAW_NOW}, 'tool:sqlite3', ${RAW_NOW}`;

/** A clock that starts at `start` and advances `stepMs` per call, so stamps are known in advance. */
function steppingClock(start: string, stepMs = 1): () => string {
	let t = Date.parse(start) - stepMs;
	return () => new Date((t += stepMs)).toISOString();
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("legal lifecycle", () => {
	test("open -> claim -> slice -> queue -> question -> answer -> done -> close, every write logged", () => {
		const l = fresh("lifecycle");
		const w = l.openWorkload({ brief: "ship the ledger", stakes: "normal", mode: "autonomous", by: "orch-1" });
		expect(l.claimWorkload(w, { holder: "lane-1", leaseMs: 60_000, by: "lane-1" })).toEqual({ won: true });
		const s = l.addSlice({ workloadId: w, task: "write schema", doneCondition: "tests.log exit 0", inputs: "ledger/", by: "lane-1" });

		const m = l.enqueue({ workloadId: w, sliceId: s, sender: "orchestrator", recipient: "lane-1", body: "go", by: "orch-1" });
		for (const to of ["delivered", "consumed", "acted-on"] as const) l.advanceMessage(m, to, { by: "lane-1" });
		expect(l.message(m)?.state).toBe("acted-on");

		const q = l.raiseQuestion({ workloadId: w, sliceId: s, body: "WAL or rollback journal?", options: ["WAL", "rollback"], by: "lane-1" });
		expect(l.slice(s)?.state).toBe("paused");
		const answer = l.answerQuestion(q, { answer: "WAL", author: "jo", channel: "surface", by: "orch-1" });
		expect(l.question(q)).toMatchObject({ state: "answered", resolved_by: answer });
		expect(l.slice(s)?.state).toBe("open");

		const direct = l.recordInstruction({ workloadId: w, sliceId: s, body: "also document the env var", author: "jo", channel: "direct", by: "lane-1" });
		expect(l.instructions(w).map((i) => [i.id, i.kind])).toEqual([[answer, "answer"], [direct, "instruction"]]);

		l.completeSlice(s, { artifact: "/tmp/tests.log", by: "lane-1" });
		l.closeWorkload(w, { by: "orch-1" });
		expect(l.workload(w)).toMatchObject({ status: "closed", holder: null, open_slices: 0, open_questions: 0 });

		const log = l.provenance(w).map((p) => `${p.tbl}:${p.action}:${p.detail}`);
		expect(log).toEqual([
			"workloads:insert:open stakes=normal mode=autonomous",
			expect.stringMatching(/^workloads:update:holder -->lane-1 lease /),
			"slices:insert:open",
			"messages:insert:held",
			"messages:update:held->delivered",
			"messages:update:delivered->consumed",
			"messages:update:consumed->acted-on",
			"questions:insert:open slice=" + s,
			"slices:update:open->paused",
			"instructions:insert:answer " + q,
			"questions:update:open->answered by " + answer,
			"slices:update:paused->open",
			"instructions:insert:instruction",
			"slices:update:open->done",
			"workloads:update:status open->closed holder lane-1->- lease -",
		]);
		l.close();
	});

	test("a question pauses only its own slice; unrelated slices keep running", () => {
		const l = fresh("isolation");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const a = l.addSlice({ workloadId: w, task: "a", doneCondition: "d", inputs: "i", by: "lane-1" });
		const b = l.addSlice({ workloadId: w, task: "b", doneCondition: "d", inputs: "i", by: "lane-1" });
		l.raiseQuestion({ workloadId: w, sliceId: a, body: "?", options: ["x", "y"], by: "lane-1" });
		expect([l.slice(a)?.state, l.slice(b)?.state]).toEqual(["paused", "open"]);
		l.completeSlice(b, { artifact: "b.log", by: "lane-1" });
		expect(() => l.closeWorkload(w, { by: "orch-1" })).toThrow("cannot close a workload");
		l.close();
	});

	test("two open questions on one slice: the slice resumes only after both are answered", () => {
		const l = fresh("two-questions");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const s = l.addSlice({ workloadId: w, task: "a", doneCondition: "d", inputs: "i", by: "lane-1" });
		const q1 = l.raiseQuestion({ workloadId: w, sliceId: s, body: "1?", options: ["x", "y"], by: "lane-1" });
		const q2 = l.raiseQuestion({ workloadId: w, sliceId: s, body: "2?", options: ["x", "y"], by: "lane-1" });
		l.answerQuestion(q1, { answer: "x", author: "jo", channel: "surface", by: "orch-1" });
		expect(l.slice(s)?.state).toBe("paused");
		l.answerQuestion(q2, { answer: "y", author: "jo", channel: "surface", by: "orch-1" });
		expect(l.slice(s)?.state).toBe("open");
		l.close();
	});

	test("a withdrawal cancels or replans the slice and is never recorded as an answer", () => {
		const l = fresh("withdraw");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const s1 = l.addSlice({ workloadId: w, task: "a", doneCondition: "d", inputs: "i", by: "lane-1" });
		const s2 = l.addSlice({ workloadId: w, task: "b", doneCondition: "d", inputs: "i", by: "lane-1" });
		const q1 = l.raiseQuestion({ workloadId: w, sliceId: s1, body: "?", options: ["x", "y"], by: "lane-1" });
		const q2 = l.raiseQuestion({ workloadId: w, sliceId: s2, body: "?", options: ["x", "y"], by: "lane-1" });
		l.withdrawQuestion(q1, { reason: "not needed", then: "cancel", author: "jo", channel: "surface", by: "orch-1" });
		l.withdrawQuestion(q2, { reason: "do it differently", then: "replan", author: "jo", channel: "surface", by: "orch-1" });
		expect([l.question(q1)?.state, l.slice(s1)?.state, l.question(q2)?.state, l.slice(s2)?.state])
			.toEqual(["withdrawn", "cancelled", "withdrawn", "open"]);
		expect(l.instructions(w).map((i) => i.kind)).toEqual(["withdrawal", "withdrawal"]);
		l.close();
	});

	test("a mode flip lands as a ledgered instruction in the same write", () => {
		const l = fresh("mode");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const i = l.flipMode(w, { mode: "user-driven", author: "jo", channel: "surface", by: "orch-1" });
		expect(l.workload(w)?.mode).toBe("user-driven");
		expect(l.instructions(w)).toMatchObject([{ id: i, kind: "mode-flip", body: "user-driven" }]);
		l.close();
	});
});

describe("lease + reclaim", () => {
	test("a live lease refuses another holder; an expired one is reclaimed", () => {
		const l = fresh("lease");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		expect(l.claimWorkload(w, { holder: "lane-A", leaseMs: 150, by: "lane-A" })).toEqual({ won: true });
		expect(l.claimWorkload(w, { holder: "lane-B", leaseMs: 150, by: "lane-B" })).toEqual({ won: false, holder: "lane-A", status: "open" });
		expect(l.claimWorkload(w, { holder: "lane-A", leaseMs: 150, by: "lane-A" })).toEqual({ won: true });
		Bun.sleepSync(250);
		expect(l.claimWorkload(w, { holder: "lane-B", leaseMs: 60_000, by: "lane-B" })).toEqual({ won: true });
		expect(l.claimWorkload(w, { holder: "lane-C", leaseMs: 60_000, by: "lane-C" })).toMatchObject({ won: false, holder: "lane-B" });
		l.releaseWorkload(w, { by: "lane-B" });
		expect(l.claimWorkload(w, { holder: "jo", leaseMs: null, by: "orch-1" })).toEqual({ won: true });
		expect(l.workload(w)).toMatchObject({ holder: "jo", holder_lease_until: null });
		l.close();
	});
});

describe("provenance cannot be omitted", () => {
	test("the module refuses a write with no lane instance, and the file refuses one without the module", () => {
		const l = fresh("provenance");
		expect(() => l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "" })).toThrow("CHECK constraint failed");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		expect(() => l.addSlice({ workloadId: w, task: "t", doneCondition: "d", inputs: "i", by: "   " })).toThrow("CHECK constraint failed");
		expect(() => l.db.run("UPDATE workloads SET stakes = 'production' WHERE id = ?", [w])).toThrow("unstamped update");
		l.close();
	});

	test("every row of every table carries workload, lane instance and a well-formed time", () => {
		const l = fresh("provenance-all");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const s = l.addSlice({ workloadId: w, task: "t", doneCondition: "d", inputs: "i", by: "lane-1" });
		const q = l.raiseQuestion({ workloadId: w, sliceId: s, body: "?", options: ["a", "b"], by: "lane-1" });
		l.answerQuestion(q, { answer: "a", author: "jo", channel: "surface", by: "orch-1" });
		l.enqueue({ workloadId: w, sender: "o", recipient: "l", body: "m", by: "orch-1" });
		for (const table of ["slices", "messages", "questions", "instructions"]) {
			for (const row of l.db.query<{ workload_id: string; created_by: string; created_at: string }, []>(`SELECT * FROM ${table}`).all()) {
				expect(row.workload_id).toBe(w);
				expect(row.created_by.trim()).not.toBe("");
				expect(row.created_at).toMatch(ISO);
			}
		}
		const prov = l.provenance(w);
		expect(prov.length).toBe(8);
		for (const p of prov) {
			expect(p.lane_instance.trim()).not.toBe("");
			expect(p.at).toMatch(ISO);
		}
		l.close();
	});
});

describe("queries", () => {
	test("oldest held: the earliest message still held, its age at a given instant, per workload or overall", () => {
		const l = fresh("oldest", { clock: steppingClock("2026-09-28T10:00:00.000Z", 10_000) });
		expect(l.oldestHeld("2026-09-28T11:00:00.000Z")).toBeNull();
		const w1 = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" }); // 10:00:00
		const w2 = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" }); // 10:00:10
		const send = (w: string) => l.enqueue({ workloadId: w, sender: "o", recipient: "l", body: "m", by: "orch-1" });
		const m1 = send(w1); // 10:00:20
		const m2 = send(w2); // 10:00:30
		const m3 = send(w1); // 10:00:40
		const at = "2026-09-28T10:01:00.000Z";
		expect(l.oldestHeld(at)).toEqual({ id: m1, workload_id: w1, enqueued_at: "2026-09-28T10:00:20.000Z", age_seconds: 40 });
		expect(l.oldestHeld(at, w2)).toMatchObject({ id: m2, age_seconds: 30 });

		l.advanceMessage(m1, "delivered", { by: "lane-1" });
		expect(l.oldestHeld(at)).toMatchObject({ id: m2, age_seconds: 30 });
		expect(l.oldestHeld(at, w1)).toMatchObject({ id: m3, age_seconds: 20 });
		expect(l.workload(w1)).toMatchObject({ held_messages: 1, oldest_held_at: "2026-09-28T10:00:40.000Z" });

		l.advanceMessage(m2, "delivered", { by: "lane-1" });
		l.advanceMessage(m3, "delivered", { by: "lane-1" });
		expect(l.oldestHeld(at)).toBeNull();
		l.close();
	});

	test("in flight: open workloads with their running/paused slices, open questions and unacted messages", () => {
		// A stepping clock: two slices added in the same millisecond would otherwise order by the
		// random tail of their ids (ORDER BY created_at, id), and this test asserts creation order.
		const l = fresh("inflight", { clock: steppingClock("2026-09-28T10:00:00.000Z") });
		const w = l.openWorkload({ brief: "live", stakes: "production", mode: "user-driven", by: "orch-1" });
		const done = l.addSlice({ workloadId: w, task: "done one", doneCondition: "d", inputs: "i", by: "lane-1" });
		l.completeSlice(done, { artifact: "a.log", by: "lane-1" });
		const running = l.addSlice({ workloadId: w, task: "running", doneCondition: "d", inputs: "i", by: "lane-1" });
		const paused = l.addSlice({ workloadId: w, task: "paused", doneCondition: "d", inputs: "i", by: "lane-1" });
		const q = l.raiseQuestion({ workloadId: w, sliceId: paused, body: "which?", options: ["a", "b", "c"], by: "lane-1" });
		const acted = l.enqueue({ workloadId: w, sender: "o", recipient: "l", body: "old", by: "orch-1" });
		for (const to of ["delivered", "consumed", "acted-on"] as const) l.advanceMessage(acted, to, { by: "lane-1" });
		const pending = l.enqueue({ workloadId: w, sender: "o", recipient: "l", body: "new", by: "orch-1" });
		const closed = l.openWorkload({ brief: "finished", stakes: "throwaway", mode: "autonomous", by: "orch-1" });
		l.closeWorkload(closed, { by: "orch-1" });

		const flight = l.inFlight();
		expect(flight.map((f) => f.workload.id)).toEqual([w]);
		const [f] = flight;
		expect(f!.workload).toMatchObject({ stakes: "production", mode: "user-driven", open_slices: 1, paused_slices: 1, open_questions: 1, held_messages: 1 });
		expect(f!.workload.last_activity_at).toMatch(ISO);
		expect(f!.slices.map((s) => [s.id, s.state])).toEqual([[running, "open"], [paused, "paused"]]);
		expect(f!.openQuestions).toMatchObject([{ id: q, slice_id: paused, options: ["a", "b", "c"] }]);
		expect(f!.pendingMessages.map((m) => m.id)).toEqual([pending]);
		l.close();
	});
});

describe("runtime obligations", () => {
	test("a write waits out another process's write lock by retrying on SQLITE_BUSY", () => {
		const dir = scratch("busy");
		const path = join(dir, "ledger.db");
		Ledger.open(path, { create: true }).close();
		const holder = Bun.spawn(["bun", "-e", `
			import { Database } from "bun:sqlite";
			const db = new Database(${JSON.stringify(path)});
			db.exec("BEGIN IMMEDIATE");
			console.log("locked");
			Bun.sleepSync(600);
			db.exec("COMMIT");
		`], { stdout: "pipe" });
		// Wait until the other process holds the lock.
		const deadline = Date.now() + 5000;
		const probe = Ledger.open(path, { busyTimeoutMs: 0, busyRetries: 0 });
		while (Date.now() < deadline) {
			try {
				probe.db.exec("BEGIN IMMEDIATE");
				probe.db.exec("ROLLBACK");
				Bun.sleepSync(10);
			} catch {
				break;
			}
		}
		expect(() => probe.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "o" })).toThrow();
		probe.close();

		const patient = Ledger.open(path, { busyTimeoutMs: 20, busyRetries: 8 });
		const w = patient.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		expect(patient.workload(w)?.status).toBe("open");
		patient.close();
		holder.kill();
	});

	test("backup via VACUUM INTO yields a readable copy with the rules intact", () => {
		const l = fresh("backup");
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const dest = join(scratch("backup-dest"), "copy.db");
		l.backup(dest);
		l.close();
		const copy = Ledger.open(dest);
		expect(copy.workload(w)?.brief).toBe("b");
		expect(() => copy.db.run("DELETE FROM workloads")).toThrow("ledger rows are never deleted");
		copy.close();
	});

	test("a plain `bun run` script, with no OMP in the environment, creates, writes and queries the ledger", () => {
		const path = join(scratch("plain"), "nested", "ledger.db");
		const env: Record<string, string> = {};
		for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(OMP_|PI_)/.test(k)) env[k] = v;
		env[LEDGER_DB_ENV] = path;
		const init = Bun.spawnSync(["bun", "run", join(REPO, "ledger", "scripts", "init.ts")], { env, stdout: "pipe", stderr: "pipe" });
		expect(init.stderr.toString()).toBe("");
		expect(init.exitCode).toBe(0);
		expect(init.stdout.toString()).toContain(`ledger ok: path=${path} schema_version=2 journal_mode=wal`);
		const use = Bun.spawnSync(["bun", "-e", `
			import { Ledger } from ${JSON.stringify(join(REPO, "ledger", "src", "index.ts"))};
			const l = Ledger.open();
			const w = l.openWorkload({ brief: "from a plain script", stakes: "throwaway", mode: "autonomous", by: "script" });
			console.log(JSON.stringify(l.inFlight().map((f) => f.workload.brief)));
		`], { env, stdout: "pipe", stderr: "pipe" });
		expect(use.stderr.toString()).toBe("");
		expect(use.stdout.toString().trim()).toBe('["from a plain script"]');
	});
});

describe("locality", () => {
	test("the default path is $HOME-rooted and the env var overrides it", () => {
		expect(defaultLedgerPath({ HOME: "/home/x" })).toBe("/home/x/.agent-system-2/ledger.db");
		expect(defaultLedgerPath({ HOME: "/home/x", [LEDGER_DB_ENV]: "/data/l.db" })).toBe("/data/l.db");
	});

	test("synced folders under $HOME are refused, a local folder is accepted", () => {
		const home = scratch("home");
		for (const rel of ["Library/CloudStorage/Dropbox/l.db", "Library/Mobile Documents/com~apple~CloudDocs/l.db", "Documents/l.db", "Dropbox/l.db"]) {
			expect(() => assertLocalPath(join(home, rel), home)).toThrow(LedgerLocationError);
		}
		expect(() => assertLocalPath(join(home, ".agent-system-2", "ledger.db"), home)).not.toThrow();
	});

	test("the init script exits 3 and creates nothing when the path is in a synced folder", () => {
		const home = scratch("home-synced");
		const target = join(home, "Library", "CloudStorage", "Dropbox", "ledger.db");
		mkdirSync(join(home, "Library", "CloudStorage", "Dropbox"), { recursive: true });
		const r = Bun.spawnSync(["bun", "run", join(REPO, "ledger", "scripts", "init.ts")], {
			env: { ...process.env, HOME: home, [LEDGER_DB_ENV]: target }, stdout: "pipe", stderr: "pipe",
		});
		expect(r.exitCode).toBe(3);
		expect(r.stderr.toString()).toContain("a synced folder");
		expect(existsSync(target)).toBe(false);
	});
});


// ---- regressions from the M2 review (REVIEW.md, review-astra) --------------------------------

describe("withdrawal disposition is persisted and honoured by the file (B2)", () => {
	const setup = (label: string) => {
		const l = fresh(label);
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const s = l.addSlice({ workloadId: w, task: "a", doneCondition: "d", inputs: "i", by: "lane-1" });
		const q1 = l.raiseQuestion({ workloadId: w, sliceId: s, body: "one?", options: ["a", "b"], by: "lane-1" });
		const q2 = l.raiseQuestion({ workloadId: w, sliceId: s, body: "two?", options: ["a", "b"], by: "lane-1" });
		return { l, w, s, q1, q2 };
	};
	const jo = { author: "jo", channel: "surface" as const, by: "orch-1" };

	test("review probe: cancel-withdraw one question, answer the other; the slice ends cancelled, not resumed", () => {
		const { l, w, s, q1, q2 } = setup("b2-probe");
		const wid = l.withdrawQuestion(q1, { reason: "stop this slice", then: "cancel", ...jo });
		expect(l.slice(s)?.state).toBe("paused");
		expect(l.instructions(w).find((i) => i.id === wid)).toMatchObject({ kind: "withdrawal", disposition: "cancel" });
		l.answerQuestion(q2, { answer: "a", ...jo });
		expect([l.slice(s)?.state, l.question(q1)?.state, l.question(q2)?.state]).toEqual(["cancelled", "withdrawn", "answered"]);
		expect(l.provenance(w).map((p) => p.detail)).toContain(`withdrawal ${q1} then cancel`);
		expect(l.provenance(w).at(-1)).toMatchObject({ tbl: "slices", detail: "paused->cancelled" });
		l.close();
	});

	test("answer first, then cancel-withdraw the last open question: cancelled at once", () => {
		const { l, s, q1, q2 } = setup("b2-last");
		l.answerQuestion(q1, { answer: "a", ...jo });
		expect(l.slice(s)?.state).toBe("paused");
		l.withdrawQuestion(q2, { reason: "no", then: "cancel", ...jo });
		expect(l.slice(s)?.state).toBe("cancelled");
		l.close();
	});

	test("replan-withdraw one, answer the other: the slice runs again", () => {
		const { l, s, q1, q2 } = setup("b2-replan");
		l.withdrawQuestion(q1, { reason: "differently", then: "replan", ...jo });
		expect(l.slice(s)?.state).toBe("paused");
		l.answerQuestion(q2, { answer: "b", ...jo });
		expect(l.slice(s)?.state).toBe("open");
		l.close();
	});

	test("a deferred cancel outranks a later replan on the same slice", () => {
		const { l, s, q1, q2 } = setup("b2-both");
		l.withdrawQuestion(q1, { reason: "stop", then: "cancel", ...jo });
		l.withdrawQuestion(q2, { reason: "differently", then: "replan", ...jo });
		expect(l.slice(s)?.state).toBe("cancelled");
		l.close();
	});
});

describe("synced-folder refusal sees through symlinks (B3)", () => {
	test("review probe: an alias into ~/Dropbox is refused like ~/Dropbox itself", () => {
		const home = scratch("b3-home");
		mkdirSync(join(home, "Dropbox"), { recursive: true });
		symlinkSync(join(home, "Dropbox"), join(home, "alias"));
		expect(() => assertLocalPath(join(home, "Dropbox", "ledger.db"), home)).toThrow(LedgerLocationError);
		expect(() => assertLocalPath(join(home, "alias", "ledger.db"), home)).toThrow("a synced folder");
	});

	test("a symlinked HOME, a synced root that is itself a symlink, and existing or dangling database links are refused", () => {
		const home = scratch("b3-more");
		mkdirSync(join(home, "Dropbox"));
		const homeLink = join(scratch("b3-homelink"), "home");
		symlinkSync(home, homeLink);
		expect(() => assertLocalPath(join(home, "Dropbox", "l.db"), homeLink)).toThrow("a synced folder");
		expect(() => assertLocalPath(join(homeLink, "Dropbox", "l.db"), home)).toThrow("a synced folder");

		const syncTarget = scratch("b3-sync-target");
		symlinkSync(syncTarget, join(home, "OneDrive"));
		expect(() => assertLocalPath(join(syncTarget, "l.db"), home)).toThrow("a synced folder");

		const local = join(home, ".agent-system-2");
		mkdirSync(local);
		writeFileSync(join(home, "Dropbox", "real.db"), "");
		symlinkSync(join(home, "Dropbox", "real.db"), join(local, "existing.db"));
		expect(() => assertLocalPath(join(local, "existing.db"), home)).toThrow("a synced folder");
		symlinkSync(join(home, "Dropbox", "not-yet.db"), join(local, "dangling.db"));
		expect(() => assertLocalPath(join(local, "dangling.db"), home)).toThrow("a synced folder");
	});

	test("Ledger.open refuses the alias and creates nothing behind it; an accepted alias is opened at its canonical path", () => {
		const home = scratch("b3-open");
		mkdirSync(join(home, "Dropbox"));
		symlinkSync(join(home, "Dropbox"), join(home, "alias"));
		mkdirSync(join(home, "real-local"));
		symlinkSync(join(home, "real-local"), join(home, "work"));
		const saved = process.env.HOME;
		process.env.HOME = home;
		try {
			expect(() => Ledger.open(join(home, "alias", "ledger.db"), { create: true })).toThrow(LedgerLocationError);
			expect(readdirSync(join(home, "Dropbox"))).toEqual([]);
			const l = Ledger.open(join(home, "work", "ledger.db"), { create: true });
			expect(l.path).toBe(join(realpathSync(join(home, "real-local")), "ledger.db"));
			l.close();
		} finally {
			process.env.HOME = saved;
		}
	});
});

describe("scheduled second copy (S2)", () => {
	/** This directory's copies, wherever under backups/ they are (one ledger per test directory). */
	const copyPaths = (path: string) => (readdirSync(join(dirname(path), "backups"), { recursive: true }) as string[])
		.filter((n) => n.endsWith(".db")).map((n) => join(dirname(path), "backups", n)).sort((a, b) => basename(a) < basename(b) ? -1 : 1);
	const copies = (path: string) => copyPaths(path).map((p) => basename(p));

	test("opening an existing ledger takes a reopenable VACUUM INTO copy when due, none when not, and keeps the newest N", () => {
		const dir = scratch("s2-open");
		const path = join(dir, "ledger.db");
		const first = Ledger.open(path, { create: true });
		const w = first.openWorkload({ brief: "kept in the copy", stakes: "normal", mode: "autonomous", by: "orch-1" });
		first.close();
		expect(existsSync(join(dir, "backups"))).toBe(false); // the creating open has nothing to copy
		const openAt = (iso: string) => Ledger.open(path, { clock: () => iso, backup: { keep: 2 } }).close();

		openAt("2026-09-28T10:00:00.000Z");
		expect(copies(path)).toEqual(["ledger-2026-09-28T10-00-00.000Z.db"]);
		openAt("2026-09-28T11:00:00.000Z");
		expect(copies(path)).toEqual(["ledger-2026-09-28T10-00-00.000Z.db"]);
		openAt("2026-09-29T10:00:00.000Z");
		openAt("2026-09-30T10:00:00.000Z");
		expect(copies(path)).toEqual(["ledger-2026-09-29T10-00-00.000Z.db", "ledger-2026-09-30T10-00-00.000Z.db"]);

		const copy = Ledger.open(copyPaths(path).at(-1)!, { backup: false });
		expect(copy.workload(w)?.brief).toBe("kept in the copy");
		expect(() => copy.db.run("DELETE FROM workloads")).toThrow("ledger rows are never deleted");
		copy.close();
	});

	test("the `bun run` backup script takes a copy when due, reports none due right after, and --force takes one", () => {
		const dir = scratch("s2-script");
		const path = join(dir, "ledger.db");
		Ledger.open(path, { create: true }).close();
		const a = script("backup.ts", path);
		expect([a.exitCode, a.err]).toEqual([0, ""]);
		expect(a.out).toMatch(/^backup ok: took .*ledger-.*\.db\n$/);
		expect(script("backup.ts", path).out).toMatch(/^backup ok: none due; newest /);
		expect(script("backup.ts", path, "--force").out).toMatch(/^backup ok: took /);
		expect(copies(path).length).toBe(2);
		const check = Bun.spawnSync([SQLITE3, copyPaths(path)[0]!, "PRAGMA user_version; PRAGMA integrity_check;"]);
		expect(check.stdout.toString().trim().split("\n")).toEqual(["2", "ok"]);
	});
});

describe("a ledger at an older or unknown schema version is refused unchanged, never upgraded (N1)", () => {
	/** Everything the refusal must leave alone: version, schema objects, rows. */
	const state = (path: string) =>
		sqlite(path, "PRAGMA user_version; SELECT count(*) FROM sqlite_master; SELECT group_concat(id || ':' || brief) FROM workloads;").out;

	for (const rev of ["94f06b9", "71a576e"]) {
		test(`review probe: a version-1 ledger built from ${rev}:ledger/schema.sql is refused by open, init and the backup job`, () => {
			const dir = scratch(`n1-${rev}`);
			const path = join(dir, "ledger.db");
			const schema = Bun.spawnSync(["git", "-C", REPO, "show", `${rev}:ledger/schema.sql`], { stdout: "pipe", stderr: "pipe" });
			expect(schema.exitCode).toBe(0);
			expect(sqlite(path, schema.stdout.toString()).exitCode).toBe(0);
			expect(sqlite(path, `INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at) VALUES ('wl-old', 'written under version 1', 'normal', 'autonomous', ${RAW_STAMPS});`).err).toBe("");
			const before = state(path);
			expect(before.split("\n")[0]).toBe("1");
			const refusal = [`ledger at ${realpathSync(path)} is schema version 1`, "predates the supported schema (version 2)"];

			for (const opts of [{}, { create: true }]) {
				let error: unknown;
				try {
					Ledger.open(path, opts).close();
				} catch (e) {
					error = e;
				}
				expect((error as Error | undefined)?.constructor.name).toBe("LedgerSchemaVersionError");
				for (const text of refusal) expect(String(error)).toContain(text);
			}
			for (const name of ["init.ts", "backup.ts"]) {
				const r = script(name, path);
				expect({ name, exitCode: r.exitCode, out: r.out }).toEqual({ name, exitCode: 4, out: "" });
				for (const text of refusal) expect(r.err).toContain(text);
			}
			expect(state(path)).toBe(before);
			expect(existsSync(join(dir, "backups"))).toBe(false);
		});
	}

	test("an unknown version is refused as not the supported schema", () => {
		const l = fresh("n1-unknown");
		const path = l.path;
		l.close();
		sqlite(path, "PRAGMA user_version = 7;");
		expect(() => Ledger.open(path)).toThrow(`ledger at ${path} is schema version 7, which is not the supported schema (version 2)`);
		expect(script("init.ts", path).exitCode).toBe(4);
		expect(sqlite(path, "PRAGMA user_version;").out).toBe("7");
	});
});

describe("a nonpositive physical identity is refused, so ordinary writes keep working (N2)", () => {
	const WORKLOAD_COLS = "id, brief, stakes, mode, created_by, created_at, changed_by, changed_at";

	test("review probe: a workload with rowid -1, then an ordinary openWorkload", () => {
		const l = fresh("n2-rowid", { backup: false });
		for (const [clause, rowid] of [["INSERT", -1], ["INSERT OR REPLACE", 0], ["INSERT OR IGNORE", -1]] as const) {
			const r = sqlite(l.path, `${clause} INTO workloads (rowid, ${WORKLOAD_COLS}) VALUES (${rowid}, 'wl-negative', 'b', 'normal', 'autonomous', ${RAW_STAMPS});`);
			expect({ clause, exitCode: r.exitCode, err: r.err }).toMatchObject({ clause, exitCode: 1, err: expect.stringContaining("a ledger rowid is a positive integer") });
		}
		const w = l.openWorkload({ brief: "ordinary", stakes: "normal", mode: "autonomous", by: "orch-1" });
		expect(l.workload(w)?.status).toBe("open");
		expect(sqlite(l.path, "SELECT count(*) FROM workloads WHERE rowid <= 0; SELECT count(*) FROM workloads;").out).toBe("0\n1");
		l.close();
	});

	test("review probe: provenance seq -1, then an ordinary stakes update", () => {
		const l = fresh("n2-seq", { backup: false });
		const w = l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "orch-1" });
		for (const seq of [-1, 0]) {
			const r = sqlite(l.path, `INSERT INTO provenance (seq, at, workload_id, lane_instance, tbl, row_id, action) VALUES (${seq}, ${RAW_NOW}, '${w}', 'raw', 'workloads', '${w}', 'insert');`);
			expect({ exitCode: r.exitCode, err: r.err }).toMatchObject({ exitCode: 1, err: expect.stringContaining("a provenance seq is a positive integer") });
		}
		l.setStakes(w, { stakes: "production", by: "orch-1" });
		expect(l.workload(w)?.stakes).toBe("production");
		expect(sqlite(l.path, "SELECT count(*) FROM provenance WHERE seq <= 0;").out).toBe("0");
		l.close();
	});

	test("an explicit rowid that is already taken is still refused as a replacement, and the row is unchanged", () => {
		const l = fresh("n2-replace", { backup: false });
		const w = l.openWorkload({ brief: "original", stakes: "normal", mode: "autonomous", by: "orch-1" });
		const r = sqlite(l.path, `INSERT OR REPLACE INTO workloads (rowid, ${WORKLOAD_COLS}) SELECT rowid, 'wl-forged', 'forged', 'normal', 'autonomous', ${RAW_STAMPS} FROM workloads WHERE id = '${w}';`);
		expect(r.err).toContain("ledger rows are never replaced");
		expect(sqlite(l.path, "SELECT group_concat(id || ':' || brief) FROM workloads;").out).toBe(`${w}:original`);
		l.close();
	});
});

describe("the backup job fails when a due copy fails; an ordinary open stays tolerant (N3)", () => {
	test("review probe: a 2020 copy plus an unwritable backup directory", () => {
		const dir = scratch("n3");
		const path = join(dir, "ledger.db");
		Ledger.open(path, { create: true }).close();
		Ledger.open(path, { clock: () => "2020-01-01T00:00:00.000Z" }).close(); // the open takes the 2020 copy
		const OLD = "ledger-2020-01-01T00-00-00.000Z.db";
		const found = (readdirSync(join(dir, "backups"), { recursive: true }) as string[]).filter((n) => n.endsWith(OLD));
		expect(found.length).toBe(1);
		const copyDir = dirname(join(dir, "backups", found[0]!));
		chmodSync(copyDir, 0o555);
		try {
			const writer = Bun.spawnSync(["bun", "-e", `
				import { Ledger } from ${JSON.stringify(join(REPO, "ledger", "src", "index.ts"))};
				const l = Ledger.open(${JSON.stringify(path)});
				console.log(l.openWorkload({ brief: "written while backups fail", stakes: "normal", mode: "autonomous", by: "o" }));
				l.close();
			`], { stdout: "pipe", stderr: "pipe" });
			expect(writer.exitCode).toBe(0);
			expect(writer.stdout.toString()).toMatch(/^wl-/);
			expect(writer.stderr.toString()).toContain("ledger: scheduled backup failed");

			const job = script("backup.ts", path);
			expect({ exitCode: job.exitCode, out: job.out }).toEqual({ exitCode: 1, out: "" });
			expect(job.err).toContain("ledger backup failed");
			expect(readdirSync(copyDir).filter((n) => n.endsWith(".db"))).toEqual([OLD]);
		} finally {
			chmodSync(copyDir, 0o755);
		}
		expect(script("backup.ts", path).out).toMatch(/^backup ok: took /);
	});
});

describe("each ledger's copies are its own, even in a shared backup directory (N4)", () => {
	const workloadIds = (copyPath: string) => {
		const db = new Database(copyPath, { readonly: true });
		try {
			return db.query<{ id: string }, []>("SELECT id FROM workloads ORDER BY id").all().map((r) => r.id);
		} finally {
			db.close();
		}
	};

	for (const shared of [false, true]) {
		test(`review probe: a.db and b.db in one directory${shared ? ", both configured to one backup dir" : ""}; each copy holds its own ledger`, () => {
			const dir = scratch("n4");
			const backup = shared ? { dir: join(dir, "shared-backups") } : {};
			for (const name of ["a", "b"]) {
				const l = Ledger.open(join(dir, `${name}.db`), { create: true, backup });
				l.openWorkload({ brief: `ledger ${name}`, stakes: "normal", mode: "autonomous", by: "o", id: `wl-${name}` });
				l.close();
				Ledger.open(join(dir, `${name}.db`), { backup }).close(); // the open takes this ledger's due copy
			}
			for (const name of ["a", "b"]) {
				const l = Ledger.open(join(dir, `${name}.db`), { backup });
				const own = l.backups();
				l.close();
				expect(own.length).toBe(1);
				expect(workloadIds(own[0]!.path)).toEqual([`wl-${name}`]);
			}
		});
	}

	test("a namespace directory whose SOURCE names another ledger is refused, not adopted", () => {
		const l = fresh("n4-source");
		l.backupIfDue(true);
		writeFileSync(join(dirname(l.backups()[0]!.path), "SOURCE"), "/somewhere/else.db\n");
		expect(() => l.backups()).toThrow(`holds copies of /somewhere/else.db, not of ${l.path}`);
		expect(() => l.backupIfDue(true)).toThrow("holds copies of /somewhere/else.db");
		l.close();
	});
});

describe("initialization honours busyRetries (S4)", () => {
	/** Another process creates the file, turns on WAL and holds BEGIN IMMEDIATE for `ms`. */
	async function holdFreshFile(path: string, ms: number) {
		const holder = Bun.spawn(["bun", "-e", `
			import { Database } from "bun:sqlite";
			const db = new Database(${JSON.stringify(path)});
			db.exec("PRAGMA journal_mode = WAL");
			db.exec("BEGIN IMMEDIATE");
			console.log("locked");
			Bun.sleepSync(${ms});
			db.exec("COMMIT");
		`], { stdout: "pipe" });
		const reader = holder.stdout.getReader();
		await reader.read();
		reader.releaseLock();
		return holder;
	}

	test("review probe: opening an uninitialized file under another writer's lock waits it out and applies the schema", async () => {
		const path = join(scratch("s4-wait"), "ledger.db");
		const holder = await holdFreshFile(path, 400);
		const l = Ledger.open(path, { create: true, busyTimeoutMs: 0, busyRetries: 8 });
		expect(l.db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version).toBe(2);
		expect(l.openWorkload({ brief: "b", stakes: "normal", mode: "autonomous", by: "o" })).toMatch(/^wl-/);
		l.close();
		expect(await holder.exited).toBe(0);
	});

	test("with no retries left the open fails as SQLITE_BUSY and leaves the file uninitialized, not half-built", async () => {
		const path = join(scratch("s4-fail"), "ledger.db");
		const holder = await holdFreshFile(path, 300);
		let error: unknown;
		try {
			Ledger.open(path, { create: true, busyTimeoutMs: 0, busyRetries: 0 }).close();
		} catch (e) {
			error = e;
		}
		expect(error).toMatchObject({ code: expect.stringMatching(/^SQLITE_BUSY/) });
		expect(await holder.exited).toBe(0);
		const sqlite3 = existsSync("/usr/bin/sqlite3") ? "/usr/bin/sqlite3" : "sqlite3";
		const state = Bun.spawnSync([sqlite3, path, "PRAGMA user_version; SELECT count(*) FROM sqlite_master;"]);
		expect(state.stdout.toString().trim().split("\n")).toEqual(["0", "0"]);
		Ledger.open(path, { create: true }).close();
	});

	test("four processes creating the same new ledger at once all succeed", async () => {
		const path = join(scratch("s4-race"), "ledger.db");
		const script = `
			import { Ledger } from ${JSON.stringify(join(REPO, "ledger", "src", "index.ts"))};
			Ledger.open(${JSON.stringify(path)}, { create: true, busyTimeoutMs: 0, busyRetries: 8 }).close();
		`;
		const procs = Array.from({ length: 4 }, () => Bun.spawn(["bun", "-e", script], { stdout: "pipe", stderr: "pipe" }));
		const codes = await Promise.all(procs.map((p) => p.exited));
		const errors = await Promise.all(procs.map((p) => new Response(p.stderr).text()));
		expect({ codes, errors }).toEqual({ codes: [0, 0, 0, 0], errors: ["", "", "", ""] });
	});
});