// Ledger replay regression (PLAN wl-mv45yk9llwt3pc rev 5; MIGRATION.md item 85): builderLabs,
// reviewPlan and the needs-you render replayed over every workload of the frozen fixture under
// fixtures/ledger-replay/, compared line by line with its golden.txt. Reads nothing under $HOME, so
// the outside-the-fence runner can run it. One test holds the whole run (unpack, open, replay,
// compare) so Bun's per-test timeout fails it past 60 s.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { BACKUP_SOURCE_FILE, backupNamespace, canonicalPath, Ledger } from "../../ledger/src/index";
import { assertOwnedOnly, diffLines, diffReport, FIXTURE_DIR, GOLDEN_PATH, readManifest, refreeze, replayFixture, TIER_CONFIG_PATH, updateGolden } from "../scripts/ledger-replay";

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

/**
 * A synthetic live ledger at `<root>/live/ledger.db` with `workloads` workloads, and the backups
 * namespace dir refreeze reads beside it (`backups/<namespace>/SOURCE`, no copies), all under
 * `root`: refreeze is passed this path, so nothing reads $HOME or $AGENT_SYSTEM_LEDGER_DB.
 */
function syntheticLive(root: string, workloads: number): string {
	const live = join(root, "live", "ledger.db");
	mkdirSync(dirname(live));
	const ledger = Ledger.open(live, { create: true, backupOnOpen: false, backup: false, skipLocalityCheck: true });
	for (let i = 0; i < workloads; i++) ledger.openWorkload({ id: `wl-synthetic${i}`, brief: "replay test", stakes: "normal", mode: "autonomous", by: "orch-test" });
	ledger.close();
	const canonical = canonicalPath(live);
	const backups = join(dirname(canonical), "backups", backupNamespace(canonical));
	mkdirSync(backups, { recursive: true });
	writeFileSync(join(backups, BACKUP_SOURCE_FILE), `${canonical}\n`);
	return live;
}

/** A previous fixture at `<root>/fixture` holding only what refreeze owns: manifest.json, its one file, golden.txt. */
function syntheticFixture(root: string): string {
	const dir = join(root, "fixture");
	mkdirSync(dir);
	writeFileSync(join(dir, "manifest.json"), JSON.stringify({ refrozenAt: "2026-10-11T00:00:00.000Z", snapshots: [{ name: "a", file: "a.db.gz" }] }));
	writeFileSync(join(dir, "a.db.gz"), "a");
	writeFileSync(join(dir, "golden.txt"), "g\n");
	return dir;
}

test("refreeze refuses a fixture dir holding a .db.gz its manifest does not list, naming it, and changes nothing", () => {
	const root = mkdtempSync(join(tmpdir(), "ledger-replay-owned-"));
	try {
		const live = syntheticLive(root, 1);
		const dir = syntheticFixture(root);
		writeFileSync(join(dir, "notes.db.gz"), "not the fixture's");
		const before = contents(dir);
		expect(() => refreeze(live, dir, TIER_CONFIG_PATH)).toThrow("Move these out first: notes.db.gz");
		expect(contents(dir)).toEqual(before);
		// No stage and no `.old` sibling.
		expect(readdirSync(root).sort()).toEqual(["fixture", "live"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60_000);

test("refreeze refuses on coverage when the live ledger has no workload and no backups, and changes nothing", () => {
	const root = mkdtempSync(join(tmpdir(), "ledger-replay-coverage-"));
	try {
		const live = syntheticLive(root, 0);
		const dir = syntheticFixture(root);
		const before = contents(dir);
		expect(() => refreeze(live, dir, TIER_CONFIG_PATH)).toThrow("replay coverage is broken; golden.txt not written");
		expect(contents(dir)).toEqual(before);
		expect(readdirSync(root).sort()).toEqual(["fixture", "live"]);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60_000);

test("refreeze keeps and reports a file that appears in the old fixture after its ownership check, and removes only what it owns", () => {
	const root = mkdtempSync(join(tmpdir(), "ledger-replay-swap-"));
	try {
		const live = syntheticLive(root, 1);
		const dir = syntheticFixture(root);
		const r = refreeze(live, dir, TIER_CONFIG_PATH, { beforeSwap: () => writeFileSync(join(dir, "foreign.txt"), "added after the check") });
		expect(r.lines).toBe(1);
		expect(r.leftover?.remaining).toEqual(["foreign.txt"]);
		const old = r.leftover!.path;
		expect(dirname(old)).toBe(root);
		expect(contents(old)).toEqual({ "foreign.txt": Buffer.from("added after the check").toString("base64") });
		expect(readdirSync(root).sort()).toEqual(["fixture", basename(old), "live"].sort());
		const liveFile = r.manifest.snapshots.find((s) => s.name.startsWith("live-"))!.file;
		expect(readdirSync(dir).sort()).toEqual(["golden.txt", liveFile, "manifest.json"].sort());

		// With nothing foreign, the old dir is emptied of what refreeze owns and removed.
		expect(refreeze(live, dir, TIER_CONFIG_PATH).leftover).toBeNull();
		expect(readdirSync(root).sort()).toEqual(["fixture", basename(old), "live"].sort());
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}, 60_000);

test("assertOwnedOnly returns the names it owns, and refuses a subdirectory, an unparsable manifest, and entries with no manifest", () => {
	const dir = mkdtempSync(join(tmpdir(), "ledger-replay-owned-"));
	try {
		writeFileSync(join(dir, "manifest.json"), JSON.stringify({ refrozenAt: "2026-10-11T00:00:00.000Z", snapshots: [{ name: "a", file: "a.db.gz" }] }));
		writeFileSync(join(dir, "a.db.gz"), "a");
		expect([...assertOwnedOnly(dir)].sort()).toEqual(["a.db.gz", "golden.txt", "manifest.json"]);

		mkdirSync(join(dir, "sub"));
		const before = contents(dir);
		expect(() => assertOwnedOnly(dir)).toThrow("Move these out first: sub/");
		expect(contents(dir)).toEqual(before);
		rmSync(join(dir, "sub"), { recursive: true });

		// An unparsable manifest refuses; with no manifest the dir must be empty, and refreeze owns nothing in it.
		writeFileSync(join(dir, "manifest.json"), "{");
		expect(() => assertOwnedOnly(dir)).toThrow("does not parse");
		rmSync(join(dir, "manifest.json"));
		expect(() => assertOwnedOnly(dir)).toThrow("has no manifest.json");
		rmSync(dir, { recursive: true });
		mkdirSync(dir);
		expect(assertOwnedOnly(dir).size).toBe(0);
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
