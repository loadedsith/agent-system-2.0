import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLocalPath, defaultLedgerPath, Ledger, LEDGER_DB_ENV, LedgerLocationError } from "../src/index";

const REPO = join(import.meta.dir, "..", "..");
const scratch = (label: string) => mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), `ledger-${label}-`));
const fresh = (label: string, opts: Parameters<typeof Ledger.open>[1] = {}) =>
	Ledger.open(join(scratch(label), "ledger.db"), { create: true, ...opts });

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
		const l = fresh("inflight");
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
		expect(init.stdout.toString()).toContain(`ledger ok: path=${path} schema_version=1 journal_mode=wal`);
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
