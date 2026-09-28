// The scheduled second copy (SPEC-2.0.md § B2 prior art e): the backup job.
// Usage: bun run ledger/scripts/backup.ts [path] [--force]
// The periodic launchd agent the installer writes (install/launchd-ledger-backup.plist) runs this
// with AGENT_SYSTEM_LEDGER_DB set; the installer also runs it once so a fresh machine starts with
// a copy. When this ledger's newest copy is at least a day old (or there is none) it takes a
// VACUUM INTO copy into the ledger's own namespace under `backups/` beside it, then keeps that
// ledger's newest seven; --force takes one regardless. Opening a ledger also takes a due copy, as
// a fallback that only reports a failure; this job is strict: a due copy that fails is exit 1,
// even when an older copy exists.
// Prints one line: the copy taken, or the newest copy when none was due.
// Exit: 0 ok · 1 failure (including a due copy that could not be taken) · 3 path refused as synced
// or network · 4 the file is not at the supported schema version (refused unchanged).
import { defaultLedgerPath, Ledger, LedgerLocationError, LedgerSchemaVersionError } from "../src/index";

const args = process.argv.slice(2);
const force = args.includes("--force");
const path = args.find((a) => a !== "--force") ?? defaultLedgerPath();
try {
	const ledger = Ledger.open(path, { backupOnOpen: false });
	try {
		const taken = ledger.backupIfDue(force);
		const newest = ledger.backups().at(-1);
		if (!newest) throw new Error(`no copy was taken and none exists in ${ledger.backupDir}`);
		console.log(taken ? `backup ok: took ${taken}` : `backup ok: none due; newest ${newest.path}`);
	} finally {
		ledger.close();
	}
} catch (e) {
	console.error(`ledger backup failed: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(e instanceof LedgerLocationError ? 3 : e instanceof LedgerSchemaVersionError ? 4 : 1);
}
