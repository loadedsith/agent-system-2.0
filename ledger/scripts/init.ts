// Create the ledger (or verify an existing one) at $AGENT_SYSTEM_LEDGER_DB or the default path.
// Usage: bun run ledger/scripts/init.ts [path] [--schema <file>]
// Refuses a synced or network folder. Idempotent: an existing ledger at the current schema
// version is left untouched; an existing file at any other version (an older ledger, or one this
// module does not know) is refused unchanged, never upgraded. Prints one line: the path, the
// schema version, the journal mode.
// --schema is the manifest's ledger-schema row (install/install.sh passes it): the module applies
// exactly one schema file, so a manifest naming any other file is refused before anything is
// written, rather than logged and ignored.
// Exit: 0 ok · 1 other failure · 2 --schema is not the schema this module applies · 3 path refused
// · 4 the file exists at a schema version other than the supported one (nothing written).
import { realpathSync } from "node:fs";
import { defaultLedgerPath, Ledger, LedgerLocationError, LedgerSchemaVersionError, SCHEMA_PATH } from "../src/index";

const args = process.argv.slice(2);
const schemaAt = args.indexOf("--schema");
const schemaArg = schemaAt >= 0 ? args.splice(schemaAt, 2)[1] : undefined;
if (schemaAt >= 0) {
	let same = false;
	try {
		same = schemaArg !== undefined && realpathSync(schemaArg) === realpathSync(SCHEMA_PATH);
	} catch {
		// a missing file is simply not the schema
	}
	if (!same) {
		console.error(`ledger init failed: --schema ${schemaArg ?? "(missing)"} is not the schema this module applies (${SCHEMA_PATH})`);
		process.exit(2);
	}
}
const path = args[0] ?? defaultLedgerPath();
try {
	const ledger = Ledger.open(path, { create: true, backupOnOpen: false });
	const version = ledger.db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
	const mode = ledger.db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()!.journal_mode;
	ledger.close();
	console.log(`ledger ok: path=${path} schema_version=${version} journal_mode=${mode}`);
} catch (e) {
	console.error(`ledger init failed: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(e instanceof LedgerLocationError ? 3 : e instanceof LedgerSchemaVersionError ? 4 : 1);
}
