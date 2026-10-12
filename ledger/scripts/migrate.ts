// Upgrade a ledger to the module's schema version: the only path that does (Ledger.open never upgrades).
// Usage: bun run ledger/scripts/migrate.ts [path] [--force]
// Path: $AGENT_SYSTEM_LEDGER_DB or the default path when omitted. Refuses a synced or network folder.
// Order: every check before the snapshot reads the file through a connection that writes nothing. A
// file already at the current version is checked and left untouched (idempotent). Otherwise it is
// refused unchanged when its triggers are not its version's or a lane holds a workload under a live
// lease (--force overrides the lease check only); then a `VACUUM INTO` snapshot is written beside it
// and checked; then the snapshot path and the undo are printed; then the upgrade runs in one
// transaction, which checks the version and (without --force) the leases again under its write lock.
// Exit: 0 upgraded or already current · 1 other failure · 3 path refused · 4 a schema version the
// module neither supports nor upgrades, or one that changed under the lock · 5 the file's trigger set
// is not its version's · 6 held by a live lane. A non-zero exit before the snapshot line wrote
// nothing at all. After it, the snapshot is kept and the last line reads the schema version back, so
// whether the upgrade committed is shown, not assumed.
import {
	defaultLedgerPath, LedgerHeldError, LedgerLocationError, LedgerSchemaVersionError, LedgerTriggerDriftError, migrateLedger,
	schemaVersionOf,
} from "../src/index";

/** One POSIX shell word: single-quoted, so zsh and sh expand nothing in it. */
const shellWord = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;

const args = process.argv.slice(2);
const force = args.includes("--force");
const path = args.find((a) => a !== "--force") ?? defaultLedgerPath();
/** Set once the recovery lines are printed: from then on a failure reads the version back. */
const run: { begun: { path: string; from: number } | null } = { begun: null };
try {
	const t0 = performance.now();
	const r = migrateLedger(path, {
		force,
		beforeUpgrade: (recovery) => {
			run.begun = recovery;
			if (recovery.snapshot) console.log(`snapshot (version ${recovery.from}, taken before any write): ${recovery.snapshot}`);
			console.log(`undo, lossless (keeps every row written since): sqlite3 ${shellWord(recovery.path)} ${shellWord(recovery.undo)}`);
		},
	});
	if (r.from === r.to) {
		console.log(`ledger ok: path=${r.path} schema_version=${r.to} (already current; nothing written)`);
	} else {
		console.log(`ledger migrated: path=${r.path} from=${r.from} to=${r.to} in ${(performance.now() - t0).toFixed(1)} ms`);
	}
} catch (e) {
	console.error(`ledger migrate failed: ${e instanceof Error ? e.message : String(e)}`);
	const begun = run.begun;
	if (begun) {
		let now: string;
		try {
			const v = schemaVersionOf(begun.path);
			now = v === begun.from ? `${v}: the upgrade did not commit` : `${v}: NOT the version checked (${begun.from}); inspect the file before anything else`;
		} catch (r) {
			now = `unreadable (${r instanceof Error ? r.message : String(r)})`;
		}
		console.error(`schema version read back now: ${now}; the snapshot printed above is kept`);
	}
	process.exit(e instanceof LedgerLocationError ? 3 : e instanceof LedgerSchemaVersionError ? 4 : e instanceof LedgerTriggerDriftError ? 5
		: e instanceof LedgerHeldError ? 6 : 1);
}
