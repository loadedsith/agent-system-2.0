#!/usr/bin/env bash
# agent-system 2.0 install — skeleton (migration step M2).
#
# Reads install/manifest.tsv (SPEC-2.0.md § B8: the manifest IS the machinery table) and installs
# each row by its kind. Today that means one thing: create or verify the ledger. Profile building
# (template, extension and agent links) arrives with the later migration steps as new kinds.
#
# Usage:   bash install/install.sh
# Env:     AGENT_SYSTEM_LEDGER_DB   ledger file (default: $HOME/.agent-system-2/ledger.db)
# Exit:    0 installed · 1 other failure · 2 manifest check failed (nothing written)
#          3 ledger path refused as synced or network folder (nothing written)
#
# Order matters: every check runs before anything is written, so a failed install leaves the
# machine as it found it. Safe to re-run: an existing ledger at the current schema is untouched.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$REPO/install/manifest.tsv"
# Directories whose every file must have a manifest row. Listed ahead of the steps that create
# them so a new directory cannot slip in unchecked.
MACHINERY_DIRS=(ledger install extensions agents profile skills)
LEDGER_DB="${AGENT_SYSTEM_LEDGER_DB:-$HOME/.agent-system-2/ledger.db}"

step() { printf '==> %s\n' "$*"; }
fail() { printf 'install: FAIL: %s\n' "$1" >&2; exit "${2:-1}"; }

command -v bun >/dev/null 2>&1 || fail "bun not found on PATH (the ledger module runs on bun:sqlite)"

# ---- 1. read and validate the manifest ------------------------------------------------------
step "reading manifest $MANIFEST"
[ -f "$MANIFEST" ] || fail "no manifest at $MANIFEST" 2
paths=""
rows=0
header_seen=0
line_no=0
while IFS= read -r line || [ -n "$line" ]; do
	line_no=$((line_no + 1))
	case "$line" in '#'* | '') continue ;; esac
	if [ "$header_seen" -eq 0 ]; then
		[ "$line" = "$(printf 'path\tkind\tdestination')" ] || fail "manifest line $line_no: expected header 'path<TAB>kind<TAB>destination'" 2
		header_seen=1
		continue
	fi
	IFS=$'\t' read -r path kind dest extra <<<"$line"
	[ -n "${path:-}" ] && [ -n "${kind:-}" ] && [ -n "${dest:-}" ] && [ -z "${extra:-}" ] \
		|| fail "manifest line $line_no: need exactly three TAB-separated fields: $line" 2
	[ -f "$REPO/$path" ] || fail "manifest line $line_no: $path does not exist in the repo" 2
	case "$kind" in
		ledger-schema) [ "$dest" = "{ledger_db}" ] || fail "manifest line $line_no: ledger-schema destination must be {ledger_db}" 2 ;;
		ledger-module | ledger-init | test | doc | install) [ "$dest" = "-" ] || fail "manifest line $line_no: kind $kind is used in place; destination must be -" 2 ;;
		*) fail "manifest line $line_no: unknown kind '$kind' (this installer knows ledger-schema, ledger-module, ledger-init, test, doc, install)" 2 ;;
	esac
	if printf '%s\n' "$paths" | grep -Fxq -- "$path"; then fail "manifest line $line_no: duplicate row for $path" 2; fi
	paths="$paths$path"$'\n'
	rows=$((rows + 1))
done <"$MANIFEST"
[ "$header_seen" -eq 1 ] || fail "manifest has no header row" 2
step "manifest ok: $rows rows"

# ---- 2. every file under a machinery directory has a row (P-11: manifest-or-fail) ------------
step "checking machinery directories for unmanifested files: ${MACHINERY_DIRS[*]}"
missing=""
for dir in "${MACHINERY_DIRS[@]}"; do
	[ -d "$REPO/$dir" ] || continue
	while IFS= read -r file; do
		rel="${file#"$REPO"/}"
		printf '%s\n' "$paths" | grep -Fxq -- "$rel" || missing="$missing  $rel"$'\n'
	done < <(find "$REPO/$dir" -type f ! -name '.DS_Store' ! -path '*/node_modules/*' | LC_ALL=C sort)
done
if [ -n "$missing" ]; then
	printf 'install: these files are under a machinery directory and have no manifest row:\n%s' "$missing" >&2
	fail "unmanifested artifacts; add a row to install/manifest.tsv or move the file out" 2
fi
step "no unmanifested files"

# ---- 3. install each row by kind -------------------------------------------------------------
# ledger-schema: create or verify the ledger. The init script refuses a synced or network folder
# (ledger/src/locality.ts) with exit 3 before it creates anything.
while IFS=$'\t' read -r path kind dest; do
	case "$path" in '#'* | '' | path) continue ;; esac
	case "$kind" in
		ledger-schema)
			step "ledger: $LEDGER_DB (schema $path)"
			set +e
			bun run "$REPO/ledger/scripts/init.ts" "$LEDGER_DB"
			status=$?
			set -e
			[ "$status" -eq 0 ] || fail "ledger init exited $status" "$([ "$status" -eq 3 ] && echo 3 || echo 1)"
			;;
		*) ;; # used in place from the checkout
	esac
done <"$MANIFEST"

step "install complete: ledger at $LEDGER_DB"
