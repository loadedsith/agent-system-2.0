// Ledger replay regression (PLAN wl-mv45yk9llwt3pc rev 5; MIGRATION.md item 85): builderLabs,
// reviewPlan and the needs-you render replayed over every workload of the frozen fixture under
// fixtures/ledger-replay/, compared line by line with its golden.txt. Reads nothing under $HOME, so
// the outside-the-fence runner can run it. One test holds the whole run (unpack, open, replay,
// compare) so Bun's per-test timeout fails it past 60 s.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { assertOwnedOnly, diffLines, diffReport, FIXTURE_DIR, GOLDEN_PATH, readManifest, replayFixture, updateGolden } from "../scripts/ledger-replay";

test("the ledger replay matches golden.txt line for line", () => {
	const names = readManifest().snapshots.map((s) => s.name);
	// diffLines reports a snapshot that replays to nothing; the live one must also be there.
	expect(names.filter((n) => n.startsWith("live-"))).toHaveLength(1);
	const report = diffReport(diffLines(readFileSync(GOLDEN_PATH, "utf8"), replayFixture(), names));
	if (report) throw new Error(report);
	expect(report).toBe("");
}, 60_000);

/** Every entry of `dir` with its bytes (`dir/` for a subdirectory), for an unchanged-dir check. */
function contents(dir: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		out[e.isDirectory() ? `${e.name}/` : e.name] = e.isDirectory() ? "" : readFileSync(join(dir, e.name), "base64");
	}
	return out;
}

test("refreeze's ownership check refuses a .db.gz the manifest does not list, naming it, and changes nothing", () => {
	const dir = mkdtempSync(join(tmpdir(), "ledger-replay-owned-"));
	try {
		writeFileSync(join(dir, "manifest.json"), JSON.stringify({ refrozenAt: "2026-10-11T00:00:00.000Z", snapshots: [{ name: "a", file: "a.db.gz" }] }));
		writeFileSync(join(dir, "a.db.gz"), "a");
		writeFileSync(join(dir, "golden.txt"), "g\n");
		expect(() => assertOwnedOnly(dir)).not.toThrow();

		writeFileSync(join(dir, "notes.db.gz"), "not the fixture's");
		mkdirSync(join(dir, "sub"));
		const before = contents(dir);
		let message = "";
		try {
			assertOwnedOnly(dir);
		} catch (e) {
			message = e instanceof Error ? e.message : String(e);
		}
		const named = message.split("Move these out first: ")[1]?.split(", ").sort();
		expect(named).toEqual(["notes.db.gz", "sub/"]);
		expect(contents(dir)).toEqual(before);

		// An unparsable manifest refuses; with no manifest the dir must be empty.
		writeFileSync(join(dir, "manifest.json"), "{");
		expect(() => assertOwnedOnly(dir)).toThrow("does not parse");
		rmSync(join(dir, "manifest.json"));
		expect(() => assertOwnedOnly(dir)).toThrow("has no manifest.json");
		rmSync(dir, { recursive: true });
		mkdirSync(dir);
		expect(() => assertOwnedOnly(dir)).not.toThrow();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("--update refuses, naming it, when one manifest snapshot replays to no line, and writes no golden.txt", () => {
	const dir = mkdtempSync(join(tmpdir(), "ledger-replay-update-"));
	try {
		// One real snapshot (it has workloads) and an empty ledger built here (it has none).
		const real = readManifest().snapshots[0]!;
		copyFileSync(join(FIXTURE_DIR, real.file), join(dir, real.file));
		const emptyPath = join(dir, "empty.db");
		Ledger.open(emptyPath, { create: true, backupOnOpen: false, backup: false, skipLocalityCheck: true }).close();
		const bytes = readFileSync(emptyPath);
		for (const f of readdirSync(dir)) if (f.startsWith("empty.db")) rmSync(join(dir, f));
		writeFileSync(join(dir, "empty-snapshot.db.gz"), Bun.gzipSync(bytes));
		const empty = { name: "empty-snapshot", file: "empty-snapshot.db.gz", source: "test", sameAs: [], sha256: createHash("sha256").update(bytes).digest("hex"), now: real.now };
		writeFileSync(join(dir, "manifest.json"), JSON.stringify({ refrozenAt: real.now, snapshots: [real, empty] }));

		expect(() => updateGolden(dir)).toThrow("(every workload) @ empty-snapshot: line");
		expect(existsSync(join(dir, "golden.txt"))).toBe(false);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}, 60_000);
