// The scheduled second copy (SPEC-2.0.md § B2 prior art e), as a plain script.
// Usage: bun run ledger/scripts/backup.ts [path] [--force]
// Opening an existing ledger takes a VACUUM INTO copy into `backups/` beside it when the newest
// copy is at least a day old (or there is none), then keeps the newest seven; --force takes one
// regardless. That open-time check is the schedule: every writer's routine open runs it. The
// installer runs this script once so a fresh machine starts with a copy.
// Prints one line: the copy taken, or the newest copy when none was due.
// Exit: 0 ok · 1 failure · 3 path refused as synced or network.
import { defaultLedgerPath, Ledger, LedgerLocationError } from "../src/index";

const args = process.argv.slice(2);
const force = args.includes("--force");
const path = args.find((a) => a !== "--force") ?? defaultLedgerPath();
try {
	const started = new Date().toISOString();
	const ledger = Ledger.open(path);
	const forced = force ? ledger.backupIfDue(true) : null;
	const newest = ledger.backups().at(-1);
	ledger.close();
	if (!newest) throw new Error(`no copy was taken and none exists beside ${ledger.path}`);
	const taken = forced ?? (newest.at >= started ? newest.path : null);
	console.log(taken ? `backup ok: took ${taken}` : `backup ok: none due; newest ${newest.path}`);
} catch (e) {
	console.error(`ledger backup failed: ${e instanceof Error ? e.message : String(e)}`);
	process.exit(e instanceof LedgerLocationError ? 3 : 1);
}
