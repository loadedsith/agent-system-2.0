// Upgrade a ledger to the module's schema version: the only path that does (Ledger.open never upgrades).
// Usage: bun run ledger/scripts/migrate.ts [path] [--force]
// Path: $AGENT_SYSTEM_LEDGER_DB or the default path when omitted. Refuses a synced or network folder.
// Order: a file already at the current version is checked and left untouched (idempotent). Otherwise
// it is refused unchanged when its triggers are not its version's or a lane holds a workload under a
// live lease (--force overrides the lease check only); then a `VACUUM INTO` snapshot is written beside
// it and checked; then the upgrade runs in one transaction. Prints the snapshot and the undo.
// Exit: 0 upgraded or already current · 1 other failure · 3 path refused · 4 a schema version the
// module neither supports nor upgrades · 5 the file's trigger set is not its version's · 6 held by a
// live lane. Nothing is written on any non-zero exit.
import {
	defaultLedgerPath, LedgerHeldError, LedgerLocationError, LedgerSchemaVersionError, LedgerTriggerDriftError, migrateLedger,
} from "../src/index";

const args = process.argv.slice(2);
const force = args.includes("--force");
const path = args.find((a) => a !== "--force") ?? defaultLedgerPath();
try {
	const started = performance.now();
	const r = migrateLedger(path, { force });
	const ms = (performance.now() - started).toFixed(1);
	if (r.from === r.to) {
		console.log(`ledger ok: path=${r.path} schema_version=${r.to} (already current; nothing written)`);
	} else {
		console.log(`ledger migrated: path=${r.path} from=${r.from} to=${r.to} in ${ms} ms`);
		console.log(`snapshot (version ${r.from}, taken before any write): ${r.snapshot}`);
		console.log(`undo, lossless (keeps every row written since): sqlite3 ${JSON.stringify(r.path)} ${JSON.stringify(r.undo)}`);
	}
} catch (e) {
	console.error(`ledger migrate failed: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(e instanceof LedgerLocationError ? 3 : e instanceof LedgerSchemaVersionError ? 4 : e instanceof LedgerTriggerDriftError ? 5
		: e instanceof LedgerHeldError ? 6 : 1);
}
