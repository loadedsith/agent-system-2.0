// Create the ledger (or verify an existing one) at $AGENT_SYSTEM_LEDGER_DB or the default path.
// Usage: bun run ledger/scripts/init.ts [path]
// Refuses a synced or network folder. Idempotent: an existing ledger at the current schema
// version is left untouched. Prints one line: the path, the schema version, the journal mode.
import { defaultLedgerPath, Ledger, LedgerLocationError } from "../src/index";

const path = process.argv[2] ?? defaultLedgerPath();
try {
	const ledger = Ledger.open(path, { create: true });
	const version = ledger.db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
	const mode = ledger.db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()!.journal_mode;
	ledger.close();
	console.log(`ledger ok: path=${path} schema_version=${version} journal_mode=${mode}`);
} catch (e) {
	console.error(`ledger init failed: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(e instanceof LedgerLocationError ? 3 : 1);
}
