// Restore the ledger from a scheduled copy (audit finding A7-1).
// Usage: bun run ledger/scripts/restore.ts <backup> [ledger]
// (ledger default: $AGENT_SYSTEM_LEDGER_DB, else $HOME/.agent-system-2/ledger.db.)
// In order, stopping at the first refusal with nothing changed:
//   1. the backup must be a complete copy (`copyProblem`: non-empty, integrity_check ok, at the
//      supported schema version) and must not be the ledger itself;
//   2. no writer may be running: no `surface/scripts/lane.ts run` process and no `omp --cwd <this
//      checkout>` process (the invariant report's own probes, surface/scripts/invariants.ts), and no
//      process holding the ledger or its -wal/-shm (lsof, or /proc/<pid>/fd where lsof is absent).
//      A probe that cannot look refuses too: "could not check" is never "nothing running".
// Then: the ledger and its -wal/-shm are renamed to `<ledger>.pre-restore-<time>{,-wal,-shm}` (never
// deleted, never over an existing file); the backup is copied to a temporary file beside the
// ledger, checked again, and renamed into place; `Ledger.open` opens it once, which switches the
// copy's `delete` journal back to WAL; the writes lost are printed (the moved-aside file's newest
// write and provenance seq against the restored copy's, and its rows newer than the copy, per table);
// the invariant report runs over the restored ledger; and the commands that undo the restore are
// printed. Platform-neutral: the same commands on macOS and Linux.
// Exit: 0 restored · 1 failed (the undo is printed if anything was moved) · 2 refused or usage
// · 3 ledger path refused as synced or network.
import { Database } from "bun:sqlite";
import { copyFileSync, existsSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { liveLanesFromPgrep, orchestratorsFromPs, type Probe } from "../../surface/scripts/invariants";
import { assertLocalPath, copyProblem, defaultLedgerPath, Ledger, LedgerLocationError } from "../src/index";

const SUFFIXES = ["", "-wal", "-shm"] as const;
const REPO = resolve(import.meta.dir, "..", "..");

export interface RestoreDeps {
	/** Every process that could write the ledger at this canonical path, or why they could not be listed. */
	writers: (ledgerPath: string) => Probe<string[]>;
	/** Run the invariant report over the restored ledger; its exit code. */
	invariants: (ledgerPath: string) => number;
	now: () => Date;
	log: (line: string) => void;
}

/** A refusal: nothing was changed. */
export class RestoreRefused extends Error {}

/** Newest write (max created_at over every table that has one) and newest provenance seq of a ledger file. */
interface Facts {
	newest: string | null;
	seq: number | null;
	tables: string[];
}

function facts(db: Database): Facts {
	const tables = db.query<{ name: string }, []>(
		"SELECT m.name FROM sqlite_master m WHERE m.type = 'table' AND EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE name = 'created_at') ORDER BY m.name",
	).all().map((t) => t.name);
	const newest = tables.length
		? db.query<{ newest: string | null }, []>(`SELECT max(created_at) AS newest FROM (${tables.map((t) => `SELECT created_at FROM "${t}"`).join(" UNION ALL ")})`).get()!.newest
		: null;
	const seq = db.query<{ seq: number | null }, []>("SELECT max(seq) AS seq FROM provenance").get()!.seq;
	return { newest, seq, tables };
}

/**
 * Open a ledger file read-only. A WAL-mode file whose -wal and -shm are gone (every writer closed, the
 * last through a client that removes them, as the sqlite3 CLI does) fails Bun's plain read-only open
 * with "unable to open database file", at construction or at the first read, so the probe reads;
 * with no -wal there is nothing outside the main file, so it is opened `immutable` instead, which
 * creates no file beside it.
 */
function openReadonly(path: string): Database {
	let db: Database | undefined;
	try {
		db = new Database(path, { readonly: true });
		db.query("SELECT count(*) FROM sqlite_master").get();
		return db;
	} catch (e) {
		db?.close();
		if (existsSync(`${path}-wal`)) throw e;
		return new Database(`file:${path.replace(/[%?#]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)}?immutable=1`, { readonly: true });
	}
}

const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

/** The shell lines that put the moved-aside files back, setting the restored ones aside first. */
function undoLines(target: string, aside: string, moved: string[], stamp: string): string[] {
	const restoredAside = `${target}.restored-${stamp}`;
	return [
		"# stop every lane and orchestrator first, then:",
		...SUFFIXES.map((s) => `[ -e ${shellQuote(target + s)} ] && mv -n ${shellQuote(target + s)} ${shellQuote(restoredAside + s)}`),
		...moved.map((s) => `mv -n ${shellQuote(aside + s)} ${shellQuote(target + s)}`),
	];
}

/** Restore `backupArg` over the ledger at `ledgerArg`. Throws RestoreRefused before changing anything. */
export function restore(backupArg: string, ledgerArg: string, deps: RestoreDeps): { aside: string; moved: string[]; target: string } {
	const target = assertLocalPath(ledgerArg);
	if (!existsSync(backupArg)) throw new RestoreRefused(`no backup at ${resolve(backupArg)}`);
	// Canonical, like the ledger's path: a symlinked tmp or home must not hide that the two are one file.
	const backup = realpathSync(backupArg);
	if (backup === target) throw new RestoreRefused(`${backup} is the ledger itself, not a copy of it`);
	const problem = copyProblem(backup);
	if (problem) throw new RestoreRefused(`${backup} is not a complete copy of a ledger (${problem}); nothing changed`);

	const writers = deps.writers(target);
	if ("skipped" in writers) throw new RestoreRefused(`could not check for running writers (${writers.skipped}); nothing changed`);
	if (writers.found.length) {
		throw new RestoreRefused(`writers are running; stop them and run this again (nothing changed):\n${writers.found.map((w) => `  ${w}`).join("\n")}`);
	}

	const stamp = deps.now().toISOString().replace(/:/g, "-");
	const aside = `${target}.pre-restore-${stamp}`;
	const present = SUFFIXES.filter((s) => existsSync(target + s));
	for (const s of present) if (existsSync(aside + s)) throw new RestoreRefused(`${aside + s} exists; nothing changed`);

	// What the live file holds, read before it moves. A file that cannot be read is reported, not a refusal:
	// restoring over a damaged ledger is what this script is for.
	let before: Facts | string | null = null;
	if (present.includes("")) {
		let db: Database | undefined;
		try {
			db = openReadonly(target);
			before = facts(db);
		} catch (e) {
			before = `unreadable: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			db?.close();
		}
	}

	const moved: string[] = [];
	const undo = () => undoLines(target, aside, moved, stamp);
	try {
		for (const s of present) {
			renameSync(target + s, aside + s);
			moved.push(s);
			deps.log(`moved aside: ${target + s} -> ${aside + s}`);
		}
		const tmp = join(dirname(target), `.${basename(target)}.restore-${process.pid}.tmp`);
		try {
			copyFileSync(backup, tmp);
			const again = copyProblem(tmp);
			if (again) throw new Error(`the copy of ${backup} at ${tmp} is not complete (${again})`);
			if (existsSync(target)) throw new Error(`${target} appeared while restoring; a writer started`);
			renameSync(tmp, target);
		} finally {
			rmSync(tmp, { force: true });
		}
		deps.log(`restored: ${backup} -> ${target}`);

		const ledger = Ledger.open(target, { backupOnOpen: false });
		let after: Facts;
		try {
			const mode = ledger.db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()!.journal_mode;
			after = facts(ledger.db);
			deps.log(`opened with Ledger.open: journal_mode ${mode}, ${ledger.inFlight().length} open workload(s)`);
		} finally {
			ledger.close();
		}

		if (before === null) deps.log("writes lost: none known (there was no ledger file to move aside)");
		else if (typeof before === "string") deps.log(`writes lost: unknown, the moved-aside ledger is ${before}`);
		else {
			deps.log(`writes lost: moved-aside newest write ${before.newest ?? "none"}, provenance seq ${before.seq ?? "none"}; restored newest write ${after.newest ?? "none"}, provenance seq ${after.seq ?? "none"}`);
			if (after.newest !== null && before.newest !== null && before.newest > after.newest) {
				const db = openReadonly(aside);
				try {
					const counts = before.tables.map((t) => [t, db.query<{ n: number }, [string]>(`SELECT count(*) AS n FROM "${t}" WHERE created_at > ?`).get(after.newest!)!.n] as const)
						.filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`);
					deps.log(`  rows in the moved-aside ledger newer than the restored copy: ${counts.join(", ") || "none"}`);
				} finally {
					db.close();
				}
			}
		}
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		if (moved.length) throw new Error(`${message}\nundo:\n${undo().join("\n")}`);
		throw e;
	}

	deps.log("invariant report over the restored ledger:");
	const code = deps.invariants(target);
	if (code !== 0) deps.log(`the invariant report exited ${code}; the restore itself is done`);
	deps.log("undo:");
	for (const line of undo()) deps.log(line);
	return { aside, moved, target };
}

/** Pids holding any of `files` open: lsof where present, else /proc/<pid>/fd (Linux). */
function holders(files: string[]): Probe<string[]> {
	if (files.length === 0) return { found: [] };
	if (Bun.which("lsof")) {
		const p = Bun.spawnSync(["lsof", "-t", "--", ...files]);
		const pids = p.stdout.toString().split("\n").filter(Boolean);
		// lsof exits 1 with no output when nothing holds the files.
		if (p.exitCode === 0 || (p.exitCode === 1 && pids.length === 0)) return { found: pids.map((pid) => `pid ${pid} holds the ledger (lsof)`) };
		return { skipped: `lsof exited ${p.exitCode}: ${p.stderr.toString().trim()}` };
	}
	if (existsSync("/proc/self/fd")) {
		const wanted = new Set(files);
		const found: string[] = [];
		for (const pid of readdirSync("/proc").filter((n) => /^\d+$/.test(n))) {
			let fds: string[];
			try {
				fds = readdirSync(`/proc/${pid}/fd`);
			} catch {
				continue; // another user's process, or gone
			}
			for (const fd of fds) {
				try {
					if (wanted.has(readlinkSync(`/proc/${pid}/fd/${fd}`))) {
						found.push(`pid ${pid} holds the ledger (/proc/${pid}/fd)`);
						break;
					}
				} catch {
					// the fd closed meanwhile
				}
			}
		}
		return { found };
	}
	return { skipped: "neither lsof nor /proc is available to see which processes hold the ledger" };
}

/** Lane runs, orchestrators on this checkout, and holders of the file: the real machine. */
export function liveWriters(ledgerPath: string): Probe<string[]> {
	const lanes = liveLanesFromPgrep();
	if ("skipped" in lanes) return { skipped: `lane processes: ${lanes.skipped}` };
	const orchestrators = orchestratorsFromPs(REPO);
	if ("skipped" in orchestrators) return { skipped: `orchestrator processes: ${orchestrators.skipped}` };
	const held = holders(SUFFIXES.map((s) => ledgerPath + s).filter(existsSync));
	if ("skipped" in held) return { skipped: `file holders: ${held.skipped}` };
	return {
		found: [
			...[...lanes.found].map((l) => `lane: surface/scripts/lane.ts run ${l}`),
			...orchestrators.found.map((o) => `orchestrator: pid ${o.pid} ${o.command}`),
			...held.found,
		],
	};
}

if (import.meta.main) {
	const [backupArg, ledgerArg, ...extra] = process.argv.slice(2);
	if (!backupArg || extra.length) {
		console.error("usage: bun run ledger/scripts/restore.ts <backup> [ledger]");
		process.exit(2);
	}
	try {
		restore(backupArg, ledgerArg ?? defaultLedgerPath(), {
			writers: liveWriters,
			invariants: (ledgerPath) => Bun.spawnSync(["bun", join(REPO, "surface", "scripts", "invariants.ts")], {
				env: { ...process.env, AGENT_SYSTEM_LEDGER_DB: ledgerPath },
				stdout: "inherit",
				stderr: "inherit",
			}).exitCode ?? 1,
			now: () => new Date(),
			log: (line) => console.log(line),
		});
	} catch (e) {
		console.error(`ledger restore ${e instanceof RestoreRefused ? "refused" : "failed"}: ${e instanceof Error ? e.message : String(e)}`);
		process.exit(e instanceof RestoreRefused ? 2 : e instanceof LedgerLocationError ? 3 : 1);
	}
}
