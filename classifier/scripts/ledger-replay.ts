// Ledger replay regression (PLAN wl-mv45yk9llwt3pc rev 5; MIGRATION.md item 85): builderLabs (D3),
// reviewPlan (D4–D6) and the needs-you render (§ B3 errorLines) replayed over every workload in a
// frozen, committed copy of the live ledger and its scheduled backups, one line per workload,
// compared with a committed golden file.
//
// Usage:
//   bun classifier/scripts/ledger-replay.ts             replay the fixture, print the diff against golden.txt (exit 1 on any)
//   bun classifier/scripts/ledger-replay.ts --update    rewrite golden.txt from the committed fixture; reads nothing under $HOME
//   bun classifier/scripts/ledger-replay.ts --refreeze  re-take the fixture from the live ledger and its backups, then golden.txt
//
// --refreeze is the only path that reads ~/.agent-system-2, and it never writes there: the live file
// is opened `readonly` and copied with VACUUM INTO (WAL content included); the backups are read as
// bytes. Every snapshot is scanned for credential shapes before anything is written; a hit names
// table, row id, column and pattern (never the text) and stops with exit 2.
// Exit: 0 ok · 1 replay differs from golden.txt, or a failure · 2 credential scan hit.
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	BACKUP_NAME,
	BACKUP_SOURCE_FILE,
	backupNamespace,
	canonicalPath,
	copyProblem,
	defaultLedgerPath,
	Ledger,
	type Stakes,
} from "../../ledger/src/index";
import { errorLines } from "../../surface/src/errors";
import { builderLabs, labOf, providerOf, reviewPlan } from "../src/lab";
import { route } from "../src/route";
import { loadTierTable, type TierTable } from "../src/tier-table";

const REPO = join(import.meta.dir, "..", "..");
export const FIXTURE_DIR = join(REPO, "classifier", "test", "fixtures", "ledger-replay");
export const MANIFEST_PATH = join(FIXTURE_DIR, "manifest.json");
export const GOLDEN_PATH = join(FIXTURE_DIR, "golden.txt");
export const TIER_CONFIG_PATH = join(REPO, "profile", "config.yml");
export const UPDATE_COMMAND = "bun classifier/scripts/ledger-replay.ts --update";

// ---- Fixture ------------------------------------------------------------------------------------

export interface SnapshotEntry {
	/** `backup-<copy instant>` or `live-<refreeze instant>`; the first field of its lines. */
	name: string;
	/** `<name>.db.gz` in FIXTURE_DIR. */
	file: string;
	/** Where the bytes came from (the backup copy's path, or the live path). */
	source: string;
	/** Further sources with byte-identical content, deduplicated into this snapshot. */
	sameAs: string[];
	/** SHA-256 of the unpacked database. */
	sha256: string;
	/** The fixed clock for this snapshot: the copy's filename instant, or the refreeze instant. */
	now: string;
}

export interface Manifest {
	refrozenAt: string;
	snapshots: SnapshotEntry[];
}

export function readManifest(path = MANIFEST_PATH): Manifest {
	return JSON.parse(readFileSync(path, "utf8")) as Manifest;
}

/** `2026-10-11T22:40:00.123Z` → `2026-10-11T22-40-00.123Z`, the scheduled copies' own spelling. */
const stamp = (iso: string) => iso.replace(/:/g, "-");

// ---- One line per workload ----------------------------------------------------------------------

export interface ReplayLine {
	snapshot: string;
	workload: string;
	status: string;
	stakes: string;
	builders: string;
	unknown: number;
	tier: string;
	rowLabs: string;
	decision: string;
	needsYou: string[];
}

const labName = (selector: string) => labOf(selector) ?? `unknown:${providerOf(selector)}`;

export function formatLine(l: ReplayLine): string {
	const unknown = l.unknown > 0 ? ` unknown=${l.unknown}` : "";
	const needs = l.needsYou.length > 0 ? ` ${l.needsYou.join(",")}` : "";
	return `${l.snapshot} ${l.workload} ${l.status} stakes=${l.stakes} builders=${l.builders}${unknown} review@${l.tier}[${l.rowLabs}]=${l.decision} needs-you=${l.needsYou.length}${needs}`;
}

const LINE = /^(\S+) (\S+) (\S+) stakes=(\S+) builders=(\S+)(?: unknown=(\d+))? review@([^[\s]+)\[([^\]]*)\]=(\S+) needs-you=(\d+)(?: (\S+))?$/;

export function parseLine(text: string): ReplayLine | null {
	const m = LINE.exec(text);
	if (!m) return null;
	const needsYou = m[11] ? m[11].split(",") : [];
	if (needsYou.length !== Number(m[10])) return null;
	return {
		snapshot: m[1]!, workload: m[2]!, status: m[3]!, stakes: m[4]!, builders: m[5]!, unknown: m[6] ? Number(m[6]) : 0,
		tier: m[7]!, rowLabs: m[8]!, decision: m[9]!, needsYou,
	};
}

/**
 * The lines of one snapshot. `ledger` is a temporary copy opened with the snapshot's fixed clock;
 * nothing here reads a wall clock (errorLines takes `now`; builderLabs and reviewPlan take none).
 */
export function replaySnapshot(ledger: Ledger, snapshot: string, now: string, table: TierTable): ReplayLine[] {
	const needs = new Map<string, string[]>();
	for (const line of errorLines(ledger, ledger.inFlight(), { now })) {
		needs.set(line.workloadId, [...(needs.get(line.workloadId) ?? []), line.kind]);
	}
	const workloads = ledger.db
		.query<{ id: string; status: string; stakes: Stakes }, []>("SELECT id, status, stakes FROM workloads ORDER BY created_at, id")
		.all();
	return workloads.map(({ id, status, stakes }) => {
		// The replay holds no hand in flight, so no review token is live.
		const builders = builderLabs(ledger, id, new Set());
		// The judge kind's tier through the real routing chain, capped by the workload's stakes.
		const tier = route({ choice: "judge", confidence: 1, probabilities: { judge: 1 } }, stakes).tier;
		const row = table[tier];
		// Hypothetical dispatch: every row model usable, no grant, no pin, the workload's own stakes.
		const plan = reviewPlan({ row, usable: row, builders, stakes, grant: false });
		const decision =
			plan.kind === "park" ? "park"
			: plan.kind === "fanout" ? `fanout:${plan.members.map((m) => m.lab).join(",")}`
			: `single:${[...new Set(plan.models.map(labName))].join(",")}`;
		return {
			snapshot, workload: id, status, stakes,
			builders: builders.labs.length > 0 ? builders.labs.join(",") : "none",
			unknown: builders.unknown.length,
			tier, rowLabs: row.map(labName).join(","), decision,
			needsYou: needs.get(id) ?? [],
		};
	});
}

/** Unpack every manifest snapshot into its own temporary dir, replay it, and remove the dir. */
export function replayFixture(dir = FIXTURE_DIR, configPath = TIER_CONFIG_PATH): ReplayLine[] {
	const manifest = readManifest(join(dir, "manifest.json"));
	const table = loadTierTable(configPath);
	return manifest.snapshots.flatMap((s) => {
		const bytes = Bun.gunzipSync(readFileSync(join(dir, s.file)));
		const got = createHash("sha256").update(bytes).digest("hex");
		if (got !== s.sha256) throw new Error(`fixture ${s.file} unpacks to sha-256 ${got}, manifest.json says ${s.sha256}`);
		return replayBytes(bytes, s.name, s.now, table);
	});
}

function replayBytes(bytes: Uint8Array, name: string, now: string, table: TierTable): ReplayLine[] {
	const tmp = mkdtempSync(join(tmpdir(), "ledger-replay-"));
	try {
		const path = join(tmp, "ledger.db");
		writeFileSync(path, bytes);
		// skipLocalityCheck: a temporary copy; the check would read $HOME and spawn df/mount.
		const ledger = Ledger.open(path, { backupOnOpen: false, backup: false, clock: () => now, skipLocalityCheck: true });
		try {
			return replaySnapshot(ledger, name, now, table);
		} finally {
			ledger.close();
		}
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

export function renderGolden(lines: ReplayLine[]): string {
	return lines.map(formatLine).join("\n") + "\n";
}

// ---- The diff -----------------------------------------------------------------------------------

export const RULES = {
	coverage: "fixture coverage (manifest.json / workloads table)",
	fixture: "fixture",
	builders: "D3 builderLabs (classifier/src/lab.ts)",
	tierRow: "tier row (STAKES_CAP in classifier/src/route.ts, profile/config.yml)",
	reviewPlan: "D4–D6 reviewPlan (classifier/src/lab.ts)",
	needsYou: "§ B3 errorLines (surface/src/errors.ts)",
} as const;

export interface LineDiff {
	snapshot: string;
	workload: string;
	field: string;
	rule: string;
	old: string;
	new: string;
}

const buildersOf = (l: ReplayLine) => `${l.builders}${l.unknown > 0 ? ` unknown=${l.unknown}` : ""}`;
const needsOf = (l: ReplayLine) => `${l.needsYou.length}${l.needsYou.length > 0 ? ` ${l.needsYou.join(",")}` : ""}`;

/** Kinds added and removed between two needs-you lists, as a multiset: `+question -held`. */
function kindChange(before: string[], after: string[]): string {
	const count = (xs: string[]) => xs.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
	const b = count(before);
	const a = count(after);
	const parts: string[] = [];
	for (const k of new Set([...before, ...after])) {
		const d = (a.get(k) ?? 0) - (b.get(k) ?? 0);
		for (let i = 0; i < Math.abs(d); i++) parts.push(`${d > 0 ? "+" : "-"}${k}`);
	}
	return parts.length > 0 ? parts.join(" ") : "order changed";
}

/** Every difference between the golden text and the replay, keyed by `<snapshot> <workload>`. */
export function diffLines(golden: string, actual: ReplayLine[]): LineDiff[] {
	const diffs: LineDiff[] = [];
	const old = new Map<string, ReplayLine>();
	for (const [i, text] of golden.split("\n").entries()) {
		if (text === "") continue;
		const parsed = parseLine(text);
		if (!parsed) {
			diffs.push({ snapshot: "golden.txt", workload: `line ${i + 1}`, field: "line", rule: RULES.coverage, old: text, new: "(unparseable)" });
			continue;
		}
		old.set(`${parsed.snapshot} ${parsed.workload}`, parsed);
	}
	const seen = new Set<string>();
	for (const now of actual) {
		const key = `${now.snapshot} ${now.workload}`;
		seen.add(key);
		const was = old.get(key);
		const at = { snapshot: now.snapshot, workload: now.workload };
		if (!was) {
			diffs.push({ ...at, field: "line", rule: RULES.coverage, old: "(absent)", new: formatLine(now) });
			continue;
		}
		if (was.status !== now.status) diffs.push({ ...at, field: "status", rule: RULES.fixture, old: was.status, new: now.status });
		if (was.stakes !== now.stakes) diffs.push({ ...at, field: "stakes", rule: RULES.fixture, old: was.stakes, new: now.stakes });
		if (buildersOf(was) !== buildersOf(now)) diffs.push({ ...at, field: "builders", rule: RULES.builders, old: buildersOf(was), new: buildersOf(now) });
		const sameRow = was.tier === now.tier && was.rowLabs === now.rowLabs;
		if (!sameRow) {
			diffs.push({ ...at, field: "review tier", rule: RULES.tierRow, old: `${was.tier}[${was.rowLabs}]`, new: `${now.tier}[${now.rowLabs}]` });
		}
		if (was.decision !== now.decision) {
			// A decision that moved with its row is the row's change, already named above.
			const rule = sameRow ? RULES.reviewPlan : RULES.tierRow;
			diffs.push({ ...at, field: "review", rule, old: was.decision, new: now.decision });
		}
		if (needsOf(was) !== needsOf(now)) {
			diffs.push({ ...at, field: "needs-you", rule: `${RULES.needsYou}: ${kindChange(was.needsYou, now.needsYou)}`, old: needsOf(was), new: needsOf(now) });
		}
	}
	for (const [key, was] of old) {
		if (!seen.has(key)) diffs.push({ snapshot: was.snapshot, workload: was.workload, field: "line", rule: RULES.coverage, old: formatLine(was), new: "(absent)" });
	}
	return diffs;
}

export function formatDiff(d: LineDiff): string {
	return `${d.workload} @ ${d.snapshot}: ${d.field} — ${d.rule}: ${d.old} → ${d.new}`;
}

/** The failure message: every difference, then the accept path. Empty when nothing differs. */
export function diffReport(diffs: LineDiff[]): string {
	if (diffs.length === 0) return "";
	return [
		`ledger replay differs from ${join("classifier", "test", "fixtures", "ledger-replay", "golden.txt")} on ${diffs.length} field(s):`,
		...diffs.map((d) => `  ${formatDiff(d)}`),
		`If every change above is intended, accept it: ${UPDATE_COMMAND}`,
	].join("\n");
}

// ---- Refreeze -----------------------------------------------------------------------------------

/** Credential shapes the refreeze refuses to commit (PLAN § Size and privacy). */
export const CREDENTIAL_PATTERNS: readonly { name: string; re: RegExp }[] = [
	{ name: "sk- key", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
	{ name: "GitHub token", re: /\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{20,}/ },
	{ name: "AWS access key", re: /\bAKIA[0-9A-Z]{16}\b/ },
	{ name: "Slack token", re: /\bxox[bpa]-[A-Za-z0-9-]{10,}/ },
	{ name: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
	{ name: "Bearer token", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/ },
	{ name: "api key assignment", re: /api[_-]?key\s*[:=]/i },
	{ name: "password assignment", re: /password\s*[:=]/i },
];

export interface CredentialHit {
	snapshot: string;
	table: string;
	rowId: string;
	column: string;
	pattern: string;
}

/** Every TEXT value of every table in the database at `path`, matched against CREDENTIAL_PATTERNS. */
export function scanCredentials(path: string, snapshot: string): CredentialHit[] {
	const db = new Database(path, { readonly: true });
	try {
		const hits: CredentialHit[] = [];
		const tables = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
		for (const { name } of tables) {
			const cols = db.query<{ name: string }, []>(`SELECT name FROM pragma_table_info('${name.replace(/'/g, "''")}')`).all().map((c) => c.name);
			const hasId = cols.includes("id");
			const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
			const rows = db.query<Record<string, unknown>, []>(`SELECT ${hasId ? "id" : "rowid"} AS __row, ${cols.map(q).join(", ")} FROM ${q(name)}`).all();
			for (const row of rows) {
				for (const col of cols) {
					const v = row[col];
					if (typeof v !== "string") continue;
					for (const p of CREDENTIAL_PATTERNS) {
						if (p.re.test(v)) hits.push({ snapshot, table: name, rowId: String(row.__row), column: col, pattern: p.name });
					}
				}
			}
		}
		return hits;
	} finally {
		db.close();
	}
}

interface Taken {
	name: string;
	source: string;
	now: string;
	bytes: Uint8Array;
}

/** The live ledger's own scheduled copies, as bytes, oldest first (PLAN § Which backups count). */
function backupCopies(live: string): Taken[] {
	const dir = join(dirname(live), "backups", backupNamespace(live));
	const owner = readFileSync(join(dir, BACKUP_SOURCE_FILE), "utf8").trim();
	if (owner !== live) throw new Error(`${join(dir, BACKUP_SOURCE_FILE)} names ${owner}, not the live ledger ${live}`);
	return readdirSync(dir)
		.flatMap((name) => {
			const m = BACKUP_NAME.exec(name);
			if (!m) return [];
			const now = `${m[1]}T${m[2]}:${m[3]}:${m[4]}`;
			return [{ name: `backup-${stamp(now)}`, source: join(dir, name), now, bytes: new Uint8Array(readFileSync(join(dir, name))) }];
		})
		.sort((a, b) => (a.now < b.now ? -1 : a.now > b.now ? 1 : 0));
}

/** VACUUM INTO from a `readonly` connection on the live file: a consistent snapshot, WAL included. */
function liveCopy(live: string, tmp: string): Taken {
	const dest = join(tmp, "live.db");
	const db = new Database(live, { readonly: true });
	let now: string;
	try {
		db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
		now = new Date().toISOString();
	} finally {
		db.close();
	}
	return { name: `live-${stamp(now)}`, source: live, now, bytes: new Uint8Array(readFileSync(dest)) };
}

export interface RefreezeResult {
	manifest: Manifest;
	lines: number;
	liveNewestEntry: string | null;
	hits: CredentialHit[];
}

/**
 * Re-take the fixture: the live copy and the backups, each checked with copyProblem and the
 * credential scan in a temporary dir, deduplicated by SHA-256; then the fixture files and golden.txt.
 * Nothing is written to the fixture when a check fails or the scan hits.
 */
export function refreeze(livePath = defaultLedgerPath(), dir = FIXTURE_DIR): RefreezeResult {
	const live = canonicalPath(livePath);
	const tmp = mkdtempSync(join(tmpdir(), "ledger-refreeze-"));
	try {
		const liveTaken = liveCopy(live, tmp);
		const taken = [...backupCopies(live), liveTaken];
		const distinctSnapshots: (SnapshotEntry & { bytes: Uint8Array })[] = [];
		const hits: CredentialHit[] = [];
		let liveNewestEntry: string | null = null;
		for (const t of taken) {
			const sha = createHash("sha256").update(t.bytes).digest("hex");
			const same = distinctSnapshots.find((s) => s.sha256 === sha);
			if (same) {
				same.sameAs.push(t.source);
				continue;
			}
			const path = join(tmp, `${t.name}.db`);
			writeFileSync(path, t.bytes);
			const problem = copyProblem(path);
			if (problem) throw new Error(`${t.source} is not a complete ledger copy: ${problem}`);
			hits.push(...scanCredentials(path, t.name));
			if (t === liveTaken) {
				const db = new Database(path, { readonly: true });
				try {
					liveNewestEntry = db.query<{ m: string | null }, []>("SELECT max(created_at) AS m FROM entries").get()!.m;
				} finally {
					db.close();
				}
			}
			distinctSnapshots.push({ name: t.name, file: `${t.name}.db.gz`, source: t.source, sameAs: [], sha256: sha, now: t.now, bytes: t.bytes });
		}
		const manifest: Manifest = {
			refrozenAt: liveTaken.now,
			snapshots: distinctSnapshots.map(({ bytes: _bytes, ...s }) => s),
		};
		if (hits.length > 0) return { manifest, lines: 0, liveNewestEntry, hits };
		mkdirSync(dir, { recursive: true });
		for (const old of readdirSync(dir)) {
			if (old.endsWith(".db.gz")) rmSync(join(dir, old));
		}
		for (const s of distinctSnapshots) writeFileSync(join(dir, s.file), Bun.gzipSync(s.bytes, { level: 9 }));
		writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
		const lines = replayFixture(dir);
		writeFileSync(join(dir, "golden.txt"), renderGolden(lines));
		return { manifest, lines: lines.length, liveNewestEntry, hits };
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

// ---- CLI ----------------------------------------------------------------------------------------

if (import.meta.main) {
	const args = process.argv.slice(2);
	try {
		if (args.includes("--refreeze")) {
			const r = refreeze();
			if (r.hits.length > 0) {
				console.error(`refreeze stopped: ${r.hits.length} credential-shape hit(s); nothing written. Row ids (text not shown):`);
				for (const h of r.hits) console.error(`  ${h.snapshot} ${h.table} ${h.rowId} ${h.column}: ${h.pattern}`);
				process.exit(2);
			}
			for (const s of r.manifest.snapshots) {
				console.log(`snapshot ${s.name} sha256 ${s.sha256.slice(0, 12)} from ${basename(s.source)}${s.sameAs.length > 0 ? ` (same bytes: ${s.sameAs.map((p) => basename(p)).join(", ")})` : ""}`);
			}
			console.log(`live copy newest entries.created_at ${r.liveNewestEntry}`);
			console.log(`refreeze ok: ${r.manifest.snapshots.length} snapshot(s), ${r.lines} line(s) in ${GOLDEN_PATH}`);
		} else if (args.includes("--update")) {
			const lines = replayFixture();
			writeFileSync(GOLDEN_PATH, renderGolden(lines));
			console.log(`update ok: ${lines.length} line(s) in ${GOLDEN_PATH}`);
		} else {
			const report = diffReport(diffLines(readFileSync(GOLDEN_PATH, "utf8"), replayFixture()));
			if (report) {
				console.error(report);
				process.exit(1);
			}
			console.log("ledger replay matches golden.txt");
		}
	} catch (e) {
		console.error(`ledger replay failed: ${e instanceof Error ? e.message : String(e)}`);
		process.exit(1);
	}
}
