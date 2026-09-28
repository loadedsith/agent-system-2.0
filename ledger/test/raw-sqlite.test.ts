// The file refuses illegal writes by itself: every case here is a raw `sqlite3` CLI write with no
// module in the path (the CLI's connection runs foreign_keys=0, like any foreign tool).
// Mirrors the prototype's ledger-lifecycle/sqlite/logs/11-foreign-write.log.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../src/index";

const SQLITE3 = process.env.SQLITE3 ?? (existsSync("/usr/bin/sqlite3") ? "/usr/bin/sqlite3" : "sqlite3");
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
/** A correctly stamped update: fresh actor and time, rev bumped. */
const STAMP = `changed_by = 'tool:sqlite3', changed_at = ${NOW}, rev = rev + 1`;

let dbPath: string;
const ids: Record<string, string> = {};

function raw(sql: string): { exitCode: number; stdout: string; stderr: string } {
	const r = Bun.spawnSync([SQLITE3, dbPath, sql], { stdout: "pipe", stderr: "pipe" });
	return { exitCode: r.exitCode ?? -1, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}

/** Everything a refused write could have touched, as one comparable string. */
function snapshot(): string {
	return ["workloads", "slices", "messages", "instructions", "questions", "provenance"]
		.map((t) => raw(`SELECT * FROM ${t} ORDER BY rowid;`).stdout).join("\n--\n");
}

beforeAll(() => {
	const dir = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "ledger-raw-"));
	dbPath = join(dir, "ledger.db");
	const l = Ledger.open(dbPath, { create: true });
	const by = "orch-1";
	ids.w = l.openWorkload({ brief: "raw-write fixture", stakes: "normal", mode: "autonomous", by });
	l.claimWorkload(ids.w, { holder: "lane-A", leaseMs: 3_600_000, by: "lane-A" });
	ids.sOpen = l.addSlice({ workloadId: ids.w, task: "t", doneCondition: "d", inputs: "i", by: "lane-A" });
	ids.sDone = l.addSlice({ workloadId: ids.w, task: "t", doneCondition: "d", inputs: "i", by: "lane-A" });
	l.completeSlice(ids.sDone, { artifact: "logs/run.log", by: "lane-A" });
	ids.sCancelled = l.addSlice({ workloadId: ids.w, task: "t", doneCondition: "d", inputs: "i", by: "lane-A" });
	l.cancelSlice(ids.sCancelled, { by: "lane-A" });
	ids.sPaused = l.addSlice({ workloadId: ids.w, task: "t", doneCondition: "d", inputs: "i", by: "lane-A" });
	ids.qOpen = l.raiseQuestion({ workloadId: ids.w, sliceId: ids.sPaused, body: "which?", options: ["a", "b"], by: "lane-A" });
	ids.sAnswered = l.addSlice({ workloadId: ids.w, task: "t", doneCondition: "d", inputs: "i", by: "lane-A" });
	ids.qAnswered = l.raiseQuestion({ workloadId: ids.w, sliceId: ids.sAnswered, body: "which?", options: ["a", "b"], by: "lane-A" });
	ids.iAnswer = l.answerQuestion(ids.qAnswered, { answer: "a", author: "jo", channel: "surface", by: by });
	const msg = () => l.enqueue({ workloadId: ids.w, sender: "orchestrator", recipient: "lane-A", body: "m", by });
	ids.mHeld = msg();
	ids.mDelivered = msg();
	l.advanceMessage(ids.mDelivered, "delivered", { by: "lane-A" });
	ids.mConsumed = msg();
	l.advanceMessage(ids.mConsumed, "delivered", { by: "lane-A" });
	l.advanceMessage(ids.mConsumed, "consumed", { by: "lane-A" });
	ids.mActed = msg();
	for (const s of ["delivered", "consumed", "acted-on"] as const) l.advanceMessage(ids.mActed, s, { by: "lane-A" });
	ids.mLegal = msg();
	ids.w2 = l.openWorkload({ brief: "other workload", stakes: "throwaway", mode: "user-driven", by });
	ids.s2 = l.addSlice({ workloadId: ids.w2, task: "t", doneCondition: "d", inputs: "i", by: "lane-B" });
	ids.wClosed = l.openWorkload({ brief: "closed workload", stakes: "throwaway", mode: "autonomous", by });
	l.closeWorkload(ids.wClosed, { by });
	l.close();
});

// [name, table, SQL, the refusal text the file raises]
const cases: [string, string, () => string, string][] = [
	// messages: held -> delivered -> consumed -> acted-on, one step, never back
	["message held->consumed (skip)", "messages", () => `UPDATE messages SET state = 'consumed', ${STAMP} WHERE id = '${ids.mHeld}';`, "illegal message transition"],
	["message held->acted-on (skip)", "messages", () => `UPDATE messages SET state = 'acted-on', ${STAMP} WHERE id = '${ids.mHeld}';`, "illegal message transition"],
	["message delivered->held (backward)", "messages", () => `UPDATE messages SET state = 'held', ${STAMP} WHERE id = '${ids.mDelivered}';`, "illegal message transition"],
	["message consumed->held (backward)", "messages", () => `UPDATE messages SET state = 'held', ${STAMP} WHERE id = '${ids.mConsumed}';`, "illegal message transition"],
	["message acted-on->consumed (backward)", "messages", () => `UPDATE messages SET state = 'consumed', ${STAMP} WHERE id = '${ids.mActed}';`, "illegal message transition"],
	["message enqueued at a later state", "messages", () => `INSERT INTO messages (id, workload_id, sender, recipient, body, state, created_by, created_at, changed_by, changed_at) VALUES ('msg-skip', '${ids.w}', 'x', 'y', 'b', 'acted-on', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "message must be enqueued in state held"],
	["message transition without a stamp", "messages", () => `UPDATE messages SET state = 'delivered' WHERE id = '${ids.mHeld}';`, "unstamped update"],
	["message body rewritten", "messages", () => `UPDATE messages SET body = 'forged', ${STAMP} WHERE id = '${ids.mHeld}';`, "only state and its stamp change on a message"],
	["message into a closed workload", "messages", () => `INSERT INTO messages (id, workload_id, sender, recipient, body, created_by, created_at, changed_by, changed_at) VALUES ('msg-closed', '${ids.wClosed}', 'x', 'y', 'b', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "no open workload with that id"],
	["message orphan (unknown workload, foreign_keys off)", "messages", () => `INSERT INTO messages (id, workload_id, sender, recipient, body, created_by, created_at, changed_by, changed_at) VALUES ('msg-ghost', 'wl-ghost', 'x', 'y', 'b', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "no open workload with that id"],
	["message on a slice of another workload", "messages", () => `INSERT INTO messages (id, workload_id, slice_id, sender, recipient, body, created_by, created_at, changed_by, changed_at) VALUES ('msg-cross', '${ids.w}', '${ids.s2}', 'x', 'y', 'b', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "the slice belongs to another workload"],
	// slices
	["slice open->done without an artifact", "slices", () => `UPDATE slices SET state = 'done', ${STAMP} WHERE id = '${ids.sOpen}';`, "CHECK constraint failed"],
	["slice done->open (reopen)", "slices", () => `UPDATE slices SET state = 'open', artifact = NULL, ${STAMP} WHERE id = '${ids.sDone}';`, "illegal slice transition"],
	["slice cancelled->open (reopen)", "slices", () => `UPDATE slices SET state = 'open', ${STAMP} WHERE id = '${ids.sCancelled}';`, "illegal slice transition"],
	["slice paused->done (skip the answer)", "slices", () => `UPDATE slices SET state = 'done', artifact = 'x', ${STAMP} WHERE id = '${ids.sPaused}';`, "illegal slice transition"],
	["slice open->paused with no open question", "slices", () => `UPDATE slices SET state = 'paused', ${STAMP} WHERE id = '${ids.sOpen}';`, "a slice pauses only on an open question"],
	["slice paused->open while its question is open", "slices", () => `UPDATE slices SET state = 'open', ${STAMP} WHERE id = '${ids.sPaused}';`, "slice has an open question"],
	["slice paused->cancelled while its question is open", "slices", () => `UPDATE slices SET state = 'cancelled', ${STAMP} WHERE id = '${ids.sPaused}';`, "slice has an open question"],
	["slice created already done", "slices", () => `INSERT INTO slices (id, workload_id, task, done_condition, inputs, state, artifact, created_by, created_at, changed_by, changed_at) VALUES ('sl-born-done', '${ids.w}', 't', 'd', 'i', 'done', 'x', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "a slice is created in state open"],
	["slice added to a closed workload", "slices", () => `INSERT INTO slices (id, workload_id, task, done_condition, inputs, created_by, created_at, changed_by, changed_at) VALUES ('sl-late', '${ids.wClosed}', 't', 'd', 'i', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "no open workload with that id"],
	["slice done-condition rewritten", "slices", () => `UPDATE slices SET done_condition = 'easier', ${STAMP} WHERE id = '${ids.sOpen}';`, "never change"],
	// workloads
	["workload closed->open (reopen)", "workloads", () => `UPDATE workloads SET status = 'open', closed_at = NULL, ${STAMP} WHERE id = '${ids.wClosed}';`, "illegal workload transition"],
	["workload closed with open slices and an open question", "workloads", () => `UPDATE workloads SET status = 'closed', closed_at = ${NOW}, holder = NULL, holder_lease_until = NULL, ${STAMP} WHERE id = '${ids.w}';`, "cannot close a workload"],
	["workload lane steal under a live lease", "workloads", () => `UPDATE workloads SET holder = 'lane-B', ${STAMP} WHERE id = '${ids.w}';`, "live lease"],
	["workload opened already closed", "workloads", () => `INSERT INTO workloads (id, brief, stakes, mode, status, closed_at, created_by, created_at, changed_by, changed_at) VALUES ('wl-born-closed', 'b', 'normal', 'autonomous', 'closed', ${NOW}, 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "a workload is opened in status open"],
	["workload mode flipped without a mode-flip instruction", "workloads", () => `UPDATE workloads SET mode = 'user-driven', ${STAMP} WHERE id = '${ids.w}';`, "a mode flip needs a mode-flip instruction"],
	["workload brief rewritten", "workloads", () => `UPDATE workloads SET brief = 'forged', ${STAMP} WHERE id = '${ids.w}';`, "never change"],
	["workload stakes outside the three levels", "workloads", () => `UPDATE workloads SET stakes = 'yolo', ${STAMP} WHERE id = '${ids.w}';`, "CHECK constraint failed"],
	// questions
	["question open->answered with no answer instruction", "questions", () => `UPDATE questions SET state = 'answered', resolved_by = 'in-fake', ${STAMP} WHERE id = '${ids.qOpen}';`, "a question is resolved only by an answer or withdrawal instruction naming it"],
	["question open->withdrawn by an answer instruction for another question", "questions", () => `UPDATE questions SET state = 'withdrawn', resolved_by = '${ids.iAnswer}', ${STAMP} WHERE id = '${ids.qOpen}';`, "a question is resolved only by an answer or withdrawal instruction naming it"],
	["question answered->open (reopen)", "questions", () => `UPDATE questions SET state = 'open', resolved_by = NULL, ${STAMP} WHERE id = '${ids.qAnswered}';`, "illegal question transition"],
	["question with fewer than two options", "questions", () => `INSERT INTO questions (id, workload_id, slice_id, body, options, created_by, created_at, changed_by, changed_at) VALUES ('q-one', '${ids.w}', '${ids.sOpen}', 'b', '["only"]', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "CHECK constraint failed"],
	["question on a slice of another workload", "questions", () => `INSERT INTO questions (id, workload_id, slice_id, body, options, created_by, created_at, changed_by, changed_at) VALUES ('q-cross', '${ids.w}', '${ids.s2}', 'b', '["a","b"]', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "a question needs an open workload"],
	["question on a done slice", "questions", () => `INSERT INTO questions (id, workload_id, slice_id, body, options, created_by, created_at, changed_by, changed_at) VALUES ('q-done', '${ids.w}', '${ids.sDone}', 'b', '["a","b"]', 'tool:sqlite3', ${NOW}, 'tool:sqlite3', ${NOW});`, "a question needs an open workload"],
	["question options rewritten after raising", "questions", () => `UPDATE questions SET options = '["c","d"]', ${STAMP} WHERE id = '${ids.qOpen}';`, "keeps its id, slice, text and options"],
	// instructions
	["answer instruction for an already answered question", "instructions", () => `INSERT INTO instructions (id, workload_id, kind, question_id, channel, author, body, created_by, created_at) VALUES ('in-late', '${ids.w}', 'answer', '${ids.qAnswered}', 'surface', 'jo', 'b', 'tool:sqlite3', ${NOW});`, "answer or withdrawal must name an open question"],
	["answer instruction naming no question", "instructions", () => `INSERT INTO instructions (id, workload_id, kind, channel, author, body, created_by, created_at) VALUES ('in-bare', '${ids.w}', 'answer', 'surface', 'jo', 'b', 'tool:sqlite3', ${NOW});`, "CHECK constraint failed"],
	["instruction rewritten", "instructions", () => `UPDATE instructions SET body = 'forged' WHERE id = '${ids.iAnswer}';`, "instructions are append-only"],
	["instruction deleted", "instructions", () => `DELETE FROM instructions WHERE id = '${ids.iAnswer}';`, "ledger rows are never deleted"],
	// provenance
	["provenance row deleted", "provenance", () => "DELETE FROM provenance WHERE seq = 1;", "provenance is append-only"],
	["provenance row rewritten", "provenance", () => "UPDATE provenance SET lane_instance = 'someone-else' WHERE seq = 1;", "provenance is append-only"],
	["provenance row for an unknown workload", "provenance", () => `INSERT INTO provenance (at, workload_id, lane_instance, tbl, row_id, action) VALUES (${NOW}, 'wl-ghost', 'tool:sqlite3', 'workloads', 'wl-ghost', 'insert');`, "provenance must name an existing workload"],
	["row inserted with no lane instance (NULL created_by)", "provenance", () => `INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at) VALUES ('wl-anon', 'b', 'normal', 'autonomous', NULL, ${NOW}, NULL, ${NOW});`, "NOT NULL constraint failed: workloads.created_by"],
	["row inserted with a blank lane instance", "provenance", () => `INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at) VALUES ('wl-blank', 'b', 'normal', 'autonomous', '  ', ${NOW}, '  ', ${NOW});`, "CHECK constraint failed"],
	["row inserted with no time", "provenance", () => `INSERT INTO workloads (id, brief, stakes, mode, created_by, changed_by) VALUES ('wl-notime', 'b', 'normal', 'autonomous', 'x', 'x');`, "NOT NULL constraint failed: workloads.created_at"],
	["row inserted with a non-ISO time", "provenance", () => `INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at) VALUES ('wl-badtime', 'b', 'normal', 'autonomous', 'x', 'yesterday', 'x', 'yesterday');`, "CHECK constraint failed"],
	["row inserted with no workload (NULL workload_id)", "provenance", () => `INSERT INTO slices (id, workload_id, task, done_condition, inputs, created_by, created_at, changed_by, changed_at) VALUES ('sl-nowl', NULL, 't', 'd', 'i', 'x', ${NOW}, 'x', ${NOW});`, "no open workload with that id"],
	["row inserted with a forged starting revision", "provenance", () => `INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at, rev) VALUES ('wl-rev', 'b', 'normal', 'autonomous', 'x', ${NOW}, 'x', ${NOW}, 7);`, "insert must start at rev 0"],
	["update that moves changed_at backwards", "provenance", () => `UPDATE messages SET state = 'delivered', changed_by = 'tool:sqlite3', changed_at = '2000-01-01T00:00:00.000Z', rev = rev + 1 WHERE id = '${ids.mHeld}';`, "unstamped update"],
	// deletes
	["workload deleted", "workloads", () => `DELETE FROM workloads WHERE id = '${ids.w2}';`, "ledger rows are never deleted"],
	["message deleted", "messages", () => `DELETE FROM messages WHERE id = '${ids.mHeld}';`, "ledger rows are never deleted"],
];

describe("raw sqlite3 writes are refused by the file itself", () => {
	let before = "";

	test("the raw connection really is a foreign tool: foreign_keys off, WAL from the file", () => {
		const r = raw("PRAGMA foreign_keys; PRAGMA journal_mode;");
		expect(r.exitCode).toBe(0);
		expect(r.stdout.trim().split("\n")).toEqual(["0", "wal"]);
		before = snapshot();
	});

	for (const [name, table, sql, refusal] of cases) {
		test(`refused [${table}]: ${name}`, () => {
			const r = raw(sql());
			expect(r.exitCode).not.toBe(0);
			expect(r.stderr).toContain(refusal);
		});
	}

	test("no refused write changed any row", () => {
		expect(snapshot()).toBe(before);
	});

	test("a legal, stamped raw write is accepted and logged with its lane instance", () => {
		const r = raw(`UPDATE messages SET state = 'delivered', ${STAMP} WHERE id = '${ids.mLegal}';`);
		expect(r.exitCode).toBe(0);
		const log = raw(`SELECT lane_instance || '|' || detail FROM provenance WHERE row_id = '${ids.mLegal}' ORDER BY seq;`);
		expect(log.stdout.trim().split("\n")).toEqual(["orch-1|held", "tool:sqlite3|held->delivered"]);
	});

	test("integrity_check ok and foreign_key_check clean after every raw attempt", () => {
		expect(raw("PRAGMA integrity_check;").stdout.trim()).toBe("ok");
		expect(raw("PRAGMA foreign_key_check;").stdout.trim()).toBe("");
	});
});
