// PR-F red tests (PLAN.md § 3a, row F1): the flow signals over a seeded scratch ledger.
//
// Interfaces this file fixes for sl-flow-build:
//  * Time injection: `surface/scripts/flow-signals.ts` reads the clock from the env var `AS2_NOW` (an ISO-8601
//    UTC instant) when it is set, else the real clock. The test sets AS2_NOW=2026-10-14T19:45:00.000Z, which is
//    12:45 America/Los_Angeles (PDT, UTC-7) on 2026-10-14. 12:45, not 12:00, because the fallback script writes
//    only when it is past 12:30 Pacific (§ 3a, "Fallback when the orchestrator is down").
//  * `check()` in surface/scripts/invariants.ts gains `Input.cap: number` (the live lane cap); the flow findings
//    carry `invariant: "flow-open"` etc. The test passes `cap: 3`.
//  * The script's entry on `wl-orchestrator` starts `flow-signals: 2026-10-14` (the Pacific date) and carries
//    `open 7/6` (open workloads besides wl-orchestrator / 2 x cap) and `cap 3`.
// No module that does not exist yet is imported statically; the script is spawned.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { Ledger } from "../../ledger/src/index";
import { check, type Input } from "../scripts/invariants";
import { STANDING_BRIEF, STANDING_WORKLOAD_ID } from "../src/types";

const SCRIPT = join(import.meta.dir, "..", "scripts", "flow-signals.ts");
const NOW = "2026-10-14T19:45:00.000Z"; // 12:45 America/Los_Angeles
const DATE = "2026-10-14";
const OPENED = "2026-10-13T17:00:00.000Z";

const dir = mkdtempSync(join(tmpdir(), "flow-signals-"));
const ledgerPath = join(dir, "ledger.db");

function seed(): void {
	const now = OPENED;
	const ledger = Ledger.open(ledgerPath, { create: true, backup: false, backupOnOpen: false, clock: () => now, skipLocalityCheck: true });
	ledger.openWorkload({ by: "orchestrator-surface", brief: STANDING_BRIEF, stakes: "normal", mode: "autonomous", id: STANDING_WORKLOAD_ID });
	for (let i = 1; i <= 7; i++) {
		ledger.openWorkload({ by: "orchestrator", brief: `flow fixture ${i}`, stakes: "normal", mode: "autonomous", id: `wl-flow-${i}` });
	}
	ledger.close();
}
seed();

describe("flow signals over 7 open workloads, cap 3, 12:45 Pacific", () => {
	test("the fallback script writes exactly one flow-signals entry on wl-orchestrator with open 7/6 and cap 3", () => {
		const r = spawnSync("bun", [SCRIPT], {
			cwd: join(import.meta.dir, "..", ".."),
			encoding: "utf8",
			env: { ...process.env, HOME: dir, AGENT_SYSTEM_LEDGER_DB: ledgerPath, AGENT_SYSTEM_MAX_LANES: "3", AS2_NOW: NOW },
		});
		const db = new Database(ledgerPath, { readonly: true });
		const rows = db.query<{ body: string }, [string]>("SELECT body FROM entries WHERE workload_id = ? AND body LIKE 'flow-signals:%'").all(STANDING_WORKLOAD_ID);
		db.close();
		expect({ status: r.status, entries: rows.length }, `stderr: ${r.stderr}`).toEqual({ status: 0, entries: 1 });
		const body = rows[0]!.body;
		expect(body.startsWith(`flow-signals: ${DATE}`)).toBe(true);
		expect(body).toContain("open 7/6");
		expect(body).toContain("cap 3");
	});

	test("check() reports flow-open for the same state", () => {
		const db = new Database(ledgerPath, { readonly: true });
		try {
			const input = {
				db, asOf: NOW, replay: false, liveLanes: { found: new Set<string>() }, lanesDirOf: () => "/nonexistent/lanes",
				repo: "/nonexistent/checkout", git: null, orchestrators: () => ({ skipped: "not probed in this test" }),
				backups: { dir: "/nonexistent/backups", gapMs: 1 }, cap: 3,
			} as Input;
			const report = check(input);
			expect(report.findings.map((f) => f.invariant)).toContain("flow-open");
		} finally {
			db.close();
		}
	});
});
