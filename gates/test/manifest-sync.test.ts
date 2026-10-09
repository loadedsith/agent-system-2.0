// Manifest sync (M4 fix round 4, S7; triad 1, cold read): every file under gates/, tiers/,
// classifier/, surface/ and ledger/ has a row in install/manifest.tsv, so a new file fails here in
// `bun test` before it fails install/install.sh on a fresh machine (surface/ and ledger/ added with
// MIGRATION.md item 24: lanes add most new files there). The walk mirrors install.sh's own
// (`find -type f`, skipping .DS_Store and anything under node_modules). The manifest is read, never written.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const DIRS = ["gates", "tiers", "classifier", "surface", "ledger"];

function files(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === "node_modules" || e.name === ".DS_Store") continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...files(p));
		else if (e.isFile()) out.push(relative(REPO, p));
	}
	return out;
}

test("every file under gates/, tiers/, classifier/, surface/ and ledger/ has an install/manifest.tsv row", () => {
	const rows = new Set(
		readFileSync(join(REPO, "install", "manifest.tsv"), "utf8")
			.split("\n")
			.filter((l) => l !== "" && !l.startsWith("#"))
			.map((l) => l.split("\t")[0]!),
	);
	const missing = DIRS.flatMap((d) => files(join(REPO, d))).filter((f) => !rows.has(f)).sort();
	expect(missing).toEqual([]);
});
