#!/usr/bin/env bash
# Fresh-machine install test (SPEC-2.0.md § B8, P-4 gate): clone this repo into a temp dir, run the
# installer with a temp $HOME, and prove the ledger and its first scheduled copy land under that
# $HOME. Also proves the refusals: an unmanifested file or any symbolic link under a machinery
# directory fails install; a wrong, missing or duplicated ledger-schema row fails install; a
# synced-folder ledger path fails install, including one reached through a symlink; a version-1
# ledger (the schema of 94f06b9 and of 71a576e) fails install with exit 4 and is left unchanged.
# And the periodic backup job (macOS): the launchd plist written under the temp $HOME lints, and
# the exact command it would run (argv, environment, working directory) takes a due copy while a
# writer holds the ledger open, then exits nonzero when the due copy cannot be written. A ledger
# whose snapshot fails (a malformed page) makes the job exit nonzero on every run and leaves no
# file that counts as a copy; a HOME and a ledger path holding "@REPO@" and "&" land in the plist
# exactly as given. The plist is never loaded: this test does not run launchctl.
#
# Usage:   bash install/fresh-machine-test.sh
# Env:     FRESH_TEST_ROOT  where the temp clone and temp HOME go (default: ${TMPDIR:-/tmp})
#          FRESH_TEST_LOG   also tee all output to this file (optional)
# Exit:    0 every check passed · 1 a check failed (the failing step is the last "==>" line)
#
# Writes only inside a new directory under FRESH_TEST_ROOT; the real $HOME and the source
# checkout are never written. The work directory is left in place as evidence; its path is printed.
# If the source checkout has uncommitted files, they are overlaid onto the clone (listed in the
# output) so the test covers the tree as it stands, not only the last commit.
set -euo pipefail

if [ -n "${FRESH_TEST_LOG:-}" ]; then
	mkdir -p "$(dirname "$FRESH_TEST_LOG")"
	exec > >(tee "$FRESH_TEST_LOG") 2>&1
fi

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="${FRESH_TEST_ROOT:-${TMPDIR:-/tmp}}"
mkdir -p "$ROOT"
WORK="$(mktemp -d "$ROOT/fresh-machine.XXXXXX")"
CLONE="$WORK/repo"
FAKE_HOME="$WORK/home"
SQLITE3="$(command -v sqlite3)"
[ -x /usr/bin/sqlite3 ] && SQLITE3=/usr/bin/sqlite3

step() { printf '\n==> %s\n' "$*"; }
ok() { printf 'PASS: %s\n' "$*"; }
die() { printf 'FAIL: %s\n' "$*"; exit 1; }

# Run the clone's installer as a fresh machine would: only PATH and the temp HOME, nothing else
# inherited (no OMP_*, no AGENT_SYSTEM_LEDGER_DB). Extra VAR=value pairs may follow.
run_install() {
	env -i PATH="$PATH" HOME="$FAKE_HOME" "$@" bash "$CLONE/install/install.sh"
}

printf 'fresh-machine install test\n'
printf 'date: %s\nsource: %s\nsource HEAD: %s\nwork dir: %s\nbun: %s\nsqlite3: %s (%s)\n' \
	"$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$SRC" "$(git -C "$SRC" rev-parse HEAD)" "$WORK" \
	"$(bun --version)" "$SQLITE3" "$("$SQLITE3" --version | cut -d' ' -f1)"

step "1. clone the repo into the work dir"
git clone --quiet --no-hardlinks "$SRC" "$CLONE"
ok "cloned to $CLONE at $(git -C "$CLONE" rev-parse --short HEAD)"

step "2. overlay uncommitted files from the source checkout"
overlay="$(git -C "$SRC" ls-files --modified --others --exclude-standard)"
if [ -z "$overlay" ]; then
	ok "source is clean; testing the commit as cloned"
else
	printf '%s\n' "$overlay" | while IFS= read -r f; do
		if [ -f "$SRC/$f" ]; then
			mkdir -p "$(dirname "$CLONE/$f")"
			cp -p "$SRC/$f" "$CLONE/$f"
			printf '  overlaid: %s\n' "$f"
		fi
	done
	ok "overlay done"
fi

step "3. install with a temp HOME: $FAKE_HOME"
mkdir -p "$FAKE_HOME"
run_install || die "install exited $?"
LEDGER="$FAKE_HOME/.agent-system-2/ledger.db"
[ -f "$LEDGER" ] || die "no ledger at $LEDGER"
ok "ledger created at $LEDGER"

step "4. inspect the installed ledger with raw sqlite3"
printf 'user_version=%s journal_mode=%s tables=%s triggers=%s integrity=%s\n' \
	"$("$SQLITE3" "$LEDGER" 'PRAGMA user_version;')" \
	"$("$SQLITE3" "$LEDGER" 'PRAGMA journal_mode;')" \
	"$("$SQLITE3" "$LEDGER" "SELECT group_concat(name, ',') FROM (SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name);")" \
	"$("$SQLITE3" "$LEDGER" "SELECT count(*) FROM sqlite_master WHERE type='trigger';")" \
	"$("$SQLITE3" "$LEDGER" 'PRAGMA integrity_check;')"
[ "$("$SQLITE3" "$LEDGER" 'PRAGMA user_version;')" = 3 ] || die "schema version is not 3"
[ "$("$SQLITE3" "$LEDGER" 'PRAGMA journal_mode;')" = wal ] || die "journal mode is not wal"
ok "schema version 3, WAL"
printf 'files under the temp HOME:\n'
(cd "$FAKE_HOME" && find . -type f | LC_ALL=C sort | sed 's/^/  /')
COPY="$(find "$FAKE_HOME/.agent-system-2/backups" -name 'ledger-*.db' -type f | LC_ALL=C sort | tail -n 1)"
[ -n "$COPY" ] || die "install left no scheduled copy under $FAKE_HOME/.agent-system-2/backups"
[ "$("$SQLITE3" "$COPY" 'PRAGMA user_version;')" = 3 ] && [ "$("$SQLITE3" "$COPY" 'PRAGMA integrity_check;')" = ok ] \
	|| die "the scheduled copy $COPY does not reopen as a schema-3 ledger"
ok "first scheduled copy taken by install and reopened with raw sqlite3: $COPY"

step "5. the installed ledger refuses an illegal raw write"
"$SQLITE3" "$LEDGER" "INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at) VALUES ('wl-fresh', 'fresh-machine probe', 'throwaway', 'autonomous', 'fresh-test', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'fresh-test', strftime('%Y-%m-%dT%H:%M:%fZ','now'));" \
	|| die "legal raw insert refused"
set +e
out="$("$SQLITE3" "$LEDGER" "UPDATE workloads SET status = 'closed' WHERE id = 'wl-fresh';" 2>&1)"
status=$?
set -e
printf 'unstamped close -> exit %s: %s\n' "$status" "$out"
[ "$status" -ne 0 ] || die "unstamped update was accepted"
ok "illegal write refused by the installed file"
"$SQLITE3" "$LEDGER" "PRAGMA recursive_triggers;" | sed 's/^/recursive_triggers=/'
set +e
out="$("$SQLITE3" "$LEDGER" "REPLACE INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at) VALUES ('wl-fresh', 'forged', 'throwaway', 'autonomous', 'fresh-test', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'fresh-test', strftime('%Y-%m-%dT%H:%M:%fZ','now'));" 2>&1)"
status=$?
set -e
printf 'raw REPLACE of an existing workload -> exit %s: %s\n' "$status" "$out"
[ "$status" -ne 0 ] || die "raw REPLACE of an existing row was accepted"
[ "$("$SQLITE3" "$LEDGER" "SELECT brief FROM workloads WHERE id = 'wl-fresh';")" = "fresh-machine probe" ] || die "raw REPLACE changed the row"
ok "raw REPLACE refused by the installed file; row unchanged"

step "6. re-run install (idempotent)"
run_install || die "second install exited $?"
[ "$("$SQLITE3" "$LEDGER" "SELECT count(*) FROM workloads WHERE id = 'wl-fresh';")" = 1 ] || die "re-install lost data"
ok "second install exit 0; existing row kept"

step "7. decoy: an unmanifested file under a machinery directory fails install"
DECOY="$CLONE/ledger/src/decoy-unmanifested.ts"
printf '// decoy: no manifest row\n' >"$DECOY"
set +e
run_install
status=$?
set -e
[ "$status" -eq 2 ] || die "install with decoy exited $status, expected 2"
ok "install refused the decoy with exit 2"
rm "$DECOY"
run_install >/dev/null || die "install after removing the decoy exited $?"
ok "decoy removed ($DECOY); install passes again"

# Expect the clone's installer to exit $1 with the remaining VAR=value pairs.
expect_install_exit() {
	local want="$1" got
	shift
	set +e
	run_install "$@"
	got=$?
	set -e
	[ "$got" -eq "$want" ] || die "install exited $got, expected $want"
}

step "7b. decoy: an unmanifested symbolic link under a machinery directory fails install"
LINK="$CLONE/ledger/unmanifested.ts"
ln -s src/index.ts "$LINK"
expect_install_exit 2
rm "$LINK"
ln -s ../../nowhere "$CLONE/ledger/src/dangling"
expect_install_exit 2
rm "$CLONE/ledger/src/dangling"
run_install >/dev/null || die "install after removing the symlinks exited $?"
ok "a symlink to a real artifact and a dangling symlink were both refused with exit 2; install passes again"

step "7c. a wrong, missing or duplicated ledger-schema manifest row fails install and writes nothing"
MANIFEST="$CLONE/install/manifest.tsv"
cp -p "$MANIFEST" "$WORK/manifest.orig"
S1_DB="$WORK/s1-home-untouched/ledger.db"
T=$'\t'
DOC_ROW="ledger/SCHEMA.md${T}doc${T}-"
SCHEMA_ROW="ledger/schema.sql${T}ledger-schema${T}{ledger_db}"
# Rewrite the original manifest, replacing whole row $1 with $2 (and $3 with $4, when given).
manifest_with() {
	awk -v a="$1" -v b="$2" -v c="${3:-}" -v d="${4:-}" '$0 == a { $0 = b } c != "" && $0 == c { $0 = d } { print }' \
		"$WORK/manifest.orig" >"$MANIFEST"
}
# swapped: the markdown doc claims to be the schema, the schema is filed as a doc
manifest_with "$DOC_ROW" "ledger/SCHEMA.md${T}ledger-schema${T}{ledger_db}" "$SCHEMA_ROW" "ledger/schema.sql${T}doc${T}-"
grep -qF "ledger/SCHEMA.md${T}ledger-schema" "$MANIFEST" && grep -qF "ledger/schema.sql${T}doc" "$MANIFEST" || die "test setup: swap did not apply"
expect_install_exit 2 AGENT_SYSTEM_LEDGER_DB="$S1_DB"
# missing: no ledger-schema row at all (schema.sql filed as a doc)
manifest_with "$SCHEMA_ROW" "ledger/schema.sql${T}doc${T}-"
grep -qF "ledger-schema${T}" "$MANIFEST" && die "test setup: schema row still present"
expect_install_exit 2 AGENT_SYSTEM_LEDGER_DB="$S1_DB"
# duplicated: a second ledger-schema row
manifest_with "$DOC_ROW" "ledger/SCHEMA.md${T}ledger-schema${T}{ledger_db}"
[ "$(grep -cF "ledger-schema${T}" "$MANIFEST")" -eq 2 ] || die "test setup: duplicate did not apply"
expect_install_exit 2 AGENT_SYSTEM_LEDGER_DB="$S1_DB"
[ ! -e "$S1_DB" ] && [ ! -e "$(dirname "$S1_DB")" ] || die "a refused manifest still wrote $S1_DB"
cp -p "$WORK/manifest.orig" "$MANIFEST"
run_install >/dev/null || die "install with the manifest restored exited $?"
ok "swapped, missing and duplicated schema rows each refused with exit 2; nothing written; install passes again"

step "8. a ledger path in a synced folder fails install"
SYNCED="$FAKE_HOME/Library/CloudStorage/Dropbox/ledger.db"
mkdir -p "$(dirname "$SYNCED")"
set +e
run_install AGENT_SYSTEM_LEDGER_DB="$SYNCED"
status=$?
set -e
[ "$status" -eq 3 ] || die "install with a synced ledger path exited $status, expected 3"
[ ! -e "$SYNCED" ] || die "a ledger file was created in the synced folder"
ok "synced-folder path refused with exit 3; nothing created"

step "8b. a symlink into a synced folder fails install"
ln -s "$FAKE_HOME/Library/CloudStorage/Dropbox" "$FAKE_HOME/alias"
expect_install_exit 3 AGENT_SYSTEM_LEDGER_DB="$FAKE_HOME/alias/ledger.db"
[ ! -e "$SYNCED" ] || die "a ledger file was created in the synced folder through the alias"
ok "alias path refused with exit 3; nothing created behind it"

step "9. a version-1 ledger (94f06b9 and 71a576e schemas) fails install with exit 4 and is left unchanged"
for rev in 94f06b9 71a576e; do
	OLD_DB="$WORK/old-$rev/ledger.db"
	mkdir -p "$(dirname "$OLD_DB")"
	git -C "$CLONE" show "$rev:ledger/schema.sql" | "$SQLITE3" "$OLD_DB" >/dev/null
	"$SQLITE3" "$OLD_DB" "INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at) VALUES ('wl-old', 'written under version 1', 'normal', 'autonomous', 'old', strftime('%Y-%m-%dT%H:%M:%fZ','now'), 'old', strftime('%Y-%m-%dT%H:%M:%fZ','now'));"
	before="$("$SQLITE3" "$OLD_DB" 'PRAGMA user_version; SELECT count(*) FROM sqlite_master; SELECT group_concat(id) FROM workloads;')"
	set +e
	out="$(run_install AGENT_SYSTEM_LEDGER_DB="$OLD_DB" 2>&1)"
	status=$?
	set -e
	printf '%s\n' "$out" | sed 's/^/  | /'
	[ "$status" -eq 4 ] || die "install on the $rev schema exited $status, expected 4"
	printf '%s' "$out" | grep -qF "is schema version 1, which predates the supported schema (version 3)" || die "refusal message missing"
	[ "$("$SQLITE3" "$OLD_DB" 'PRAGMA user_version; SELECT count(*) FROM sqlite_master; SELECT group_concat(id) FROM workloads;')" = "$before" ] \
		|| die "the refused $rev ledger was changed"
	[ ! -e "$(dirname "$OLD_DB")/backups" ] || die "a backup was taken of the refused $rev ledger"
	ok "$rev schema: exit 4, version still 1, rows and schema unchanged, no copy"
done

step "10. the periodic backup job: plist under the temp HOME lints; its exact command runs against an open writer"
if [ "$(uname -s)" != Darwin ]; then
	ok "not macOS: no plist is written (systemd timer not built yet); skipped"
else
	PLIST="$FAKE_HOME/Library/LaunchAgents/com.agent-system-2.ledger-backup.plist"
	[ -f "$PLIST" ] || die "no plist at $PLIST"
	/usr/bin/plutil -lint "$PLIST" || die "plist does not lint"
	/usr/bin/plutil -convert json -o "$WORK/job.json" "$PLIST"
	printf 'job: %s\n' "$(cat "$WORK/job.json")"
	[ "$(/usr/bin/plutil -extract EnvironmentVariables.AGENT_SYSTEM_LEDGER_DB raw -o - "$PLIST")" = "$LEDGER" ] \
		|| die "the plist does not point at $LEDGER (a refused install must not rewrite it)"
	ok "plist lints and names the installed ledger"
	# Run the job exactly as launchd would: its argv, only its environment, its working directory.
	run_job() {
		bun -e '
			const job = JSON.parse(await Bun.file(process.argv[1]).text());
			const p = Bun.spawnSync(job.ProgramArguments, { env: job.EnvironmentVariables, cwd: job.WorkingDirectory, stdout: "inherit", stderr: "inherit" });
			process.exit(p.exitCode ?? 1);
		' "$WORK/job.json"
	}
	COPY_DIR="$(dirname "$(find "$FAKE_HOME/.agent-system-2/backups" -name 'ledger-*.db' -type f | LC_ALL=C sort | tail -n 1)")"
	for f in "$COPY_DIR"/ledger-*.db; do mv "$f" "$COPY_DIR/ledger-2026-01-01T00-00-00.000Z.db"; break; done
	find "$COPY_DIR" -name 'ledger-*.db' ! -name 'ledger-2026-01-01T00-00-00.000Z.db' -delete
	ok "copies in $COPY_DIR reduced to one aged copy, so the job's copy is due"
	# A writer holds the ledger open (connection open) until it gets SIGTERM, then closes it and
	# exits 0. (A first version read stdin from a FIFO; at EOF bun kept running instead of returning.)
	bun -e "
		import { Ledger } from '$CLONE/ledger/src/index.ts';
		const l = Ledger.open('$LEDGER', { backupOnOpen: false });
		l.openWorkload({ brief: 'written by the open writer', stakes: 'normal', mode: 'autonomous', by: 'writer', id: 'wl-writer' });
		const keep = setInterval(() => {}, 1 << 30);
		console.log('ready');
		await new Promise((resolve) => process.on('SIGTERM', resolve));
		clearInterval(keep);
		l.close();
		process.exit(0);
	" </dev/null >"$WORK/writer.out" 2>&1 &
	WRITER=$!
	trap 'kill "$WRITER" 2>/dev/null || true' EXIT
	for _ in $(seq 1 100); do grep -q ready "$WORK/writer.out" && break; sleep 0.1; done
	grep -q ready "$WORK/writer.out" || die "the writer never became ready: $(cat "$WORK/writer.out")"
	ok "writer $WRITER holds $LEDGER open"
	set +e
	out="$(run_job 2>&1)"
	status=$?
	set -e
	printf 'job -> exit %s: %s\n' "$status" "$out"
	[ "$status" -eq 0 ] || die "the backup job exited $status against an open writer"
	TAKEN="${out#backup ok: took }"
	[ "$TAKEN" != "$out" ] && [ -f "$TAKEN" ] || die "the backup job did not take a copy"
	[ "$("$SQLITE3" "$TAKEN" "SELECT brief FROM workloads WHERE id = 'wl-writer';")" = "written by the open writer" ] \
		|| die "the copy does not hold the open writer's row"
	ok "the job took $TAKEN while the writer was open; it holds the writer's row"
	rm "$TAKEN"
	chmod 555 "$COPY_DIR"
	set +e
	out="$(run_job 2>&1)"
	status=$?
	set -e
	chmod 755 "$COPY_DIR"
	printf 'job with an unwritable backup directory -> exit %s: %s\n' "$status" "$out"
	[ "$status" -ne 0 ] || die "the backup job exited 0 although the due copy could not be written"
	ok "unwritable backup directory with an older copy present: the job exits $status"
	kill -TERM "$WRITER"
	wait "$WRITER" || die "the writer exited $?"
	trap - EXIT
	ok "writer closed its connection and exited 0"
fi

step "11. a ledger whose snapshot fails: the job exits nonzero twice and leaves no file that counts as a copy"
BAD="$WORK/malformed/ledger.db"
env -i PATH="$PATH" HOME="$FAKE_HOME" bun run "$CLONE/ledger/scripts/init.ts" "$BAD" >/dev/null || die "init of $BAD exited $?"
# Zero the first byte of the workloads table's root page (the M2 third review's reproduction).
bun -e "
	import { Database } from 'bun:sqlite';
	import { readFileSync, writeFileSync } from 'node:fs';
	const db = new Database('$BAD');
	const page = db.query(\"SELECT rootpage FROM sqlite_master WHERE name = 'workloads'\").get().rootpage;
	const size = db.query('PRAGMA page_size').get().page_size;
	db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
	db.close();
	const bytes = readFileSync('$BAD');
	bytes[(page - 1) * size] = 0;
	writeFileSync('$BAD', bytes);
" || die "could not damage $BAD"
for attempt in 1 2; do
	set +e
	out="$(env -i PATH="$PATH" HOME="$FAKE_HOME" bun run "$CLONE/ledger/scripts/backup.ts" "$BAD" 2>&1)"
	status=$?
	set -e
	printf 'job run %s against the malformed ledger -> exit %s: %s\n' "$attempt" "$status" "$out"
	[ "$status" -ne 0 ] || die "the backup job exited 0 although no copy could be taken (run $attempt)"
done
left="$(cd "$WORK/malformed/backups" && find . -type f ! -name SOURCE | LC_ALL=C sort)"
[ -z "$left" ] || die "a failed snapshot left files in the backup directory: $left"
ok "the job exited nonzero on both runs; the backup directory holds only its SOURCE file"

step "12. a HOME and a ledger path holding @REPO@ and & are written into the plist exactly as given"
if [ "$(uname -s)" != Darwin ]; then
	ok "not macOS: no plist is written; skipped"
else
	ODD_HOME="$WORK/home-@REPO@ & co"
	ODD_DB="$WORK/db-@REPO@ & co/@REPO@&.db"
	mkdir -p "$ODD_HOME"
	env -i PATH="$PATH" HOME="$ODD_HOME" AGENT_SYSTEM_LEDGER_DB="$ODD_DB" bash "$CLONE/install/install.sh" >/dev/null \
		|| die "install with HOME=$ODD_HOME and ledger $ODD_DB exited $?"
	ODD_PLIST="$ODD_HOME/Library/LaunchAgents/com.agent-system-2.ledger-backup.plist"
	/usr/bin/plutil -lint "$ODD_PLIST" || die "the plist does not lint"
	got_db="$(/usr/bin/plutil -extract EnvironmentVariables.AGENT_SYSTEM_LEDGER_DB raw -o - "$ODD_PLIST")"
	got_home="$(/usr/bin/plutil -extract EnvironmentVariables.HOME raw -o - "$ODD_PLIST")"
	printf 'plist ledger: %s\nplist HOME: %s\n' "$got_db" "$got_home"
	[ "$got_db" = "$ODD_DB" ] && [ "$got_home" = "$ODD_HOME" ] || die "the plist rewrote the ledger path or HOME"
	/usr/bin/plutil -convert json -o "$WORK/odd-job.json" "$ODD_PLIST"
	set +e
	out="$(bun -e '
		const job = JSON.parse(await Bun.file(process.argv[1]).text());
		const p = Bun.spawnSync(job.ProgramArguments, { env: job.EnvironmentVariables, cwd: job.WorkingDirectory, stdout: "inherit", stderr: "inherit" });
		process.exit(p.exitCode ?? 1);
	' "$WORK/odd-job.json" 2>&1)"
	status=$?
	set -e
	printf 'job -> exit %s: %s\n' "$status" "$out"
	[ "$status" -eq 0 ] || die "the job written for $ODD_DB exited $status"
	ok "plist lints, names $ODD_DB and $ODD_HOME, and its job exits 0"
fi

step "all checks passed"
printf 'work dir kept as evidence: %s\n' "$WORK"
