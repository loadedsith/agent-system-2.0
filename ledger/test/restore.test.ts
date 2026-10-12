// ledger/scripts/restore.ts (audit finding A7-1): backup -> more writes -> restore -> inFlight() shows
// the copy's state, the live files are moved aside (never deleted), the writes lost are counted, and
// the printed undo puts the moved-aside ledger back. Refusals change nothing.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../src/index";
import { restore, RestoreRefused, type RestoreDeps } from "../scripts/restore";

const SQLITE3 = existsSync("/usr/bin/sqlite3") ? "/usr/bin/sqlite3" : "sqlite3";
const SCRIPT = join(import.meta.dir, "..", "scripts", "restore.ts");

const scratch = (label: string) => mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), `ledger-restore-${label}-`));
const NOW = new Date("2026-10-12T06:00:00.000Z");
const STAMP = "2026-10-12T06-00-00.000Z";

function deps(writers: RestoreDeps["writers"] = () => ({ found: [] })) {
	const lines: string[] = [];
	const ran: string[] = [];
	const d: RestoreDeps = { writers, invariants: (p) => (ran.push(p), 0), now: () => NOW, log: (l) => lines.push(l) };
	return { d, lines, ran };
}

/** A ledger with workload `kept`, a scheduled copy of it, then workload `lost` written after the copy. */
function ledgerWithCopy(label: string) {
	const dir = scratch(label);
	const path = join(dir, "ledger.db");
	const l = Ledger.open(path, { create: true });
	const kept = l.openWorkload({ brief: "in the copy", stakes: "normal", mode: "autonomous", by: "orch-1" });
	const copy = l.backupIfDue(true)!;
	const lost = l.openWorkload({ brief: "after the copy", stakes: "normal", mode: "autonomous", by: "orch-1" });
	l.close();
	return { dir, path, copy, kept, lost };
}

const ids = (path: string) => {
	const l = Ledger.open(path, { backupOnOpen: false });
	try {
		return l.inFlight().map((w) => w.workload.id).sort();
	} finally {
		l.close();
	}
};

describe("restore: round trip", () => {
	test("backup -> restore -> inFlight() is the copy's; the live files are moved aside; lost writes, invariants and undo are printed", () => {
		const { dir, path, copy, kept, lost } = ledgerWithCopy("round-trip");
		expect(ids(path)).toEqual([kept, lost].sort());
		const { d, lines, ran } = deps();
		const r = restore(copy, path, d);

		expect(ids(path)).toEqual([kept]);
		expect(r.target).toBe(realpathSync(path));
		expect(r.aside).toBe(`${r.target}.pre-restore-${STAMP}`);
		expect(r.moved).toContain("");
		expect(ids(r.aside)).toEqual([kept, lost].sort()); // moved aside, intact
		expect(lines.find((l) => l.startsWith("opened with Ledger.open:"))).toBe("opened with Ledger.open: journal_mode wal, 1 open workload(s)");
		expect(lines).toContain(`restored: ${realpathSync(copy)} -> ${r.target}`);
		expect(lines.find((l) => l.startsWith("  rows in the moved-aside ledger newer"))).toContain("workloads 1");
		expect(ran).toEqual([r.target]);
		expect(existsSync(copy)).toBe(true); // the copy itself is untouched
		expect(readdirSync(dir).filter((n) => n.includes(".restore-"))).toEqual([]); // no temporary file left

		// The printed undo puts the moved-aside ledger back and keeps the restored one.
		const undo = lines.slice(lines.indexOf("undo:") + 1).join("\n");
		const sh = Bun.spawnSync(["sh", "-c", undo]);
		expect(sh.exitCode).toBe(0);
		expect(ids(path)).toEqual([kept, lost].sort());
		expect(ids(`${path}.restored-${STAMP}`)).toEqual([kept]);
	});

	test("a stopped ledger whose -wal and -shm are gone (smoke on a copy of the live ledger, 2026-10-12) still has its lost writes counted", () => {
		const { path, copy } = ledgerWithCopy("no-wal");
		// What a non-Bun last closer (the sqlite3 CLI) leaves: everything checkpointed, no -wal or -shm beside the file.
		expect(Bun.spawnSync([SQLITE3, path, "PRAGMA wal_checkpoint(TRUNCATE);"]).exitCode).toBe(0);
		for (const s of ["-wal", "-shm"]) renameSync(path + s, `${path}${s}.gone`);
		// A fresh process, as the CLI is: this process's own earlier connections can mask the failure.
		const run = (code: string) => Bun.spawnSync(["bun", "-e", code], { stdout: "pipe", stderr: "pipe" });
		const plain = run(`import { Database } from "bun:sqlite"; new Database(${JSON.stringify(path)}, { readonly: true }).query("SELECT 1").get();`);
		expect(plain.stderr.toString()).toContain("unable to open database file");
		const r = run(`
			import { restore } from ${JSON.stringify(SCRIPT)};
			restore(${JSON.stringify(copy)}, ${JSON.stringify(path)}, { writers: () => ({ found: [] }), invariants: () => 0, now: () => new Date(), log: (l) => console.log(l) });
		`);
		expect(r.exitCode).toBe(0);
		const lines = r.stdout.toString().split("\n");
		expect(lines.find((l) => l.startsWith("writes lost:"))).not.toContain("unknown");
		expect(lines.find((l) => l.startsWith("  rows in the moved-aside ledger newer"))).toContain("workloads 1");
	});
});

describe("restore: refusals change nothing", () => {
	const unchanged = (dir: string, before: string[]) => expect(readdirSync(dir).sort()).toEqual(before);

	test("a running writer refuses and names it; a probe that could not look refuses too", () => {
		const { dir, path, copy, kept, lost } = ledgerWithCopy("writers");
		const before = readdirSync(dir).sort();
		expect(() => restore(copy, path, deps(() => ({ found: ["lane: surface/scripts/lane.ts run wl-x wl-x-lane-1"] })).d))
			.toThrow(/writers are running[^]*lane\.ts run wl-x wl-x-lane-1/);
		expect(() => restore(copy, path, deps(() => ({ skipped: "pgrep is not available on this machine" })).d))
			.toThrow("could not check for running writers (pgrep is not available on this machine)");
		unchanged(dir, before);
		expect(ids(path)).toEqual([kept, lost].sort());
	});

	test("a backup that is not a complete copy, or is the ledger itself, refuses before the process check", () => {
		const { dir, path } = ledgerWithCopy("bad-copy");
		const empty = join(dir, "empty.db");
		writeFileSync(empty, "");
		const before = readdirSync(dir).sort();
		let probed = false;
		const d = deps(() => ((probed = true), { found: [] })).d;
		expect(() => restore(empty, path, d)).toThrow(RestoreRefused);
		expect(() => restore(empty, path, d)).toThrow("is not a complete copy of a ledger (empty file)");
		expect(() => restore(path, path, d)).toThrow("is the ledger itself");
		expect(() => restore(join(dir, "missing.db"), path, d)).toThrow("no backup at");
		expect(probed).toBe(false);
		unchanged(dir, before);
	});

	test("the CLI: usage and a bad backup exit 2 with nothing changed", () => {
		const { dir, path } = ledgerWithCopy("cli");
		const empty = join(dir, "empty.db");
		writeFileSync(empty, "");
		const before = readdirSync(dir).sort();
		const script = join(import.meta.dir, "..", "scripts", "restore.ts");
		const usage = Bun.spawnSync(["bun", "run", script]);
		expect(usage.exitCode).toBe(2);
		expect(usage.stderr.toString()).toContain("usage: bun run ledger/scripts/restore.ts <backup> [ledger]");
		const bad = Bun.spawnSync(["bun", "run", script, empty, path]);
		expect(bad.exitCode).toBe(2);
		expect(bad.stderr.toString()).toContain("ledger restore refused:");
		unchanged(dir, before);
		expect(readFileSync(empty, "utf8")).toBe("");
	});
});
