#!/usr/bin/env bash
# Fresh-machine install test (SPEC-2.0.md § B8, P-4 gate): clone this repo into a temp dir, run the
# installer with a temp $HOME, and prove the ledger and its first scheduled copy land under that
# $HOME. Also proves the refusals: an unmanifested file or any symbolic link under a machinery
# directory fails install; a wrong, missing or duplicated ledger-schema row fails install; a
# synced-folder ledger path fails install, including one reached through a symlink.
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
[ "$("$SQLITE3" "$LEDGER" 'PRAGMA user_version;')" = 1 ] || die "schema version is not 1"
[ "$("$SQLITE3" "$LEDGER" 'PRAGMA journal_mode;')" = wal ] || die "journal mode is not wal"
ok "schema version 1, WAL"
printf 'files under the temp HOME:\n'
(cd "$FAKE_HOME" && find . -type f | LC_ALL=C sort | sed 's/^/  /')
COPY="$(find "$FAKE_HOME/.agent-system-2/backups" -name 'ledger-*.db' -type f | LC_ALL=C sort | tail -n 1)"
[ -n "$COPY" ] || die "install left no scheduled copy under $FAKE_HOME/.agent-system-2/backups"
[ "$("$SQLITE3" "$COPY" 'PRAGMA user_version;')" = 1 ] && [ "$("$SQLITE3" "$COPY" 'PRAGMA integrity_check;')" = ok ] \
	|| die "the scheduled copy $COPY does not reopen as a schema-1 ledger"
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

step "all checks passed"
printf 'work dir kept as evidence: %s\n' "$WORK"
