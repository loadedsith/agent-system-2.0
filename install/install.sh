#!/usr/bin/env bash
# agent-system 2.0 install — skeleton (migration step M2).
#
# Reads install/manifest.tsv (SPEC-2.0.md § B8: the manifest IS the machinery table) and installs
# each row by its kind. Today that means: create or verify the ledger from the manifest's one
# ledger-schema row, using its one ledger-init row, take the first scheduled copy with its one
# ledger-backup row, and (macOS) write the periodic backup job from its one ledger-backup-agent
# row into $HOME/Library/LaunchAgents. The job is written, never loaded: the load command is
# printed at the end. Profile building (template, extension and agent links) arrives with the
# later migration steps as new kinds.
#
# Usage:   bash install/install.sh
# Env:     AGENT_SYSTEM_LEDGER_DB   ledger file (default: $HOME/.agent-system-2/ledger.db)
# Exit:    0 installed · 1 other failure · 2 manifest check failed (nothing written)
#          3 ledger path refused as synced or network folder (nothing written)
#          4 the ledger file exists at a schema version other than the supported one (3), e.g. a
#            version-1 or version-2 ledger from before schema v3 (nothing written; no upgrade exists:
#            move the file aside and re-run to create a new ledger)
#
# Order matters: every check runs before anything is written, so a failed install leaves the
# machine as it found it. Safe to re-run: an existing ledger at the current schema is untouched,
# and the backup job's plist is rewritten with the same content.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="$REPO/install/manifest.tsv"
# Directories whose every file must have a manifest row. Listed ahead of the steps that create
# them so a new directory cannot slip in unchecked.
MACHINERY_DIRS=(ledger install extensions agents profile skills tiers classifier gates)
# The one schema file the ledger module applies (ledger/src/index.ts SCHEMA_PATH). The manifest's
# ledger-schema row must name exactly this file; the init script re-checks it against the module.
CANONICAL_SCHEMA="ledger/schema.sql"
LEDGER_DB="${AGENT_SYSTEM_LEDGER_DB:-$HOME/.agent-system-2/ledger.db}"
# launchd runs the job with / as its working directory, so the plist carries an absolute path.
case "$LEDGER_DB" in /*) LEDGER_ABS="$LEDGER_DB" ;; *) LEDGER_ABS="$PWD/$LEDGER_DB" ;; esac
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

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
schema_rows=""
init_rows=""
backup_rows=""
agent_rows=""
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
	[ ! -L "$REPO/$path" ] || fail "manifest line $line_no: $path is a symbolic link; machinery artifacts are regular files" 2
	case "$kind" in
		ledger-schema)
			[ "$dest" = "{ledger_db}" ] || fail "manifest line $line_no: ledger-schema destination must be {ledger_db}" 2
			schema_rows="$schema_rows$path"$'\n' ;;
		ledger-init) [ "$dest" = "-" ] || fail "manifest line $line_no: kind $kind is used in place; destination must be -" 2
			init_rows="$init_rows$path"$'\n' ;;
		ledger-backup) [ "$dest" = "-" ] || fail "manifest line $line_no: kind $kind is used in place; destination must be -" 2
			backup_rows="$backup_rows$path"$'\n' ;;
		ledger-backup-agent)
			[ "$dest" = "{launch_agents}/${path##*/}" ] || fail "manifest line $line_no: ledger-backup-agent destination must be {launch_agents}/${path##*/}" 2
			agent_rows="$agent_rows$path"$'\n' ;;
		ledger-module | module | extension | tier | profile | data | test | doc | install) [ "$dest" = "-" ] || fail "manifest line $line_no: kind $kind is used in place; destination must be -" 2 ;;
		*) fail "manifest line $line_no: unknown kind '$kind' (this installer knows ledger-schema, ledger-module, ledger-init, ledger-backup, ledger-backup-agent, module, extension, tier, profile, data, test, doc, install)" 2 ;;
	esac
	if printf '%s\n' "$paths" | grep -Fxq -- "$path"; then fail "manifest line $line_no: duplicate row for $path" 2; fi
	paths="$paths$path"$'\n'
	rows=$((rows + 1))
done <"$MANIFEST"
[ "$header_seen" -eq 1 ] || fail "manifest has no header row" 2
# The ledger kinds are run, not just listed, so each must name exactly one file; the schema row
# must name the one file the module applies, so a misclassified or missing row cannot pass.
for kind_rows in "ledger-schema:$schema_rows" "ledger-init:$init_rows" "ledger-backup:$backup_rows" "ledger-backup-agent:$agent_rows"; do
	kind="${kind_rows%%:*}"
	list="${kind_rows#*:}"
	count="$(printf '%s' "$list" | grep -c . || true)"
	[ "$count" -eq 1 ] || fail "manifest needs exactly one $kind row; found $count${list:+: $(printf '%s' "$list" | tr '\n' ' ')}" 2
done
SCHEMA_ROW="${schema_rows%$'\n'}"
INIT_ROW="${init_rows%$'\n'}"
BACKUP_ROW="${backup_rows%$'\n'}"
AGENT_ROW="${agent_rows%$'\n'}"
[ "$SCHEMA_ROW" = "$CANONICAL_SCHEMA" ] \
	|| fail "manifest's ledger-schema row names $SCHEMA_ROW; the ledger module applies $CANONICAL_SCHEMA and nothing else" 2
step "manifest ok: $rows rows (schema $SCHEMA_ROW)"

# ---- 2. every file under a machinery directory has a row (P-11: manifest-or-fail) ------------
# Symbolic links are listed separately and refused outright: find -type f skips them, and a link
# can point anywhere (outside the repo, at another artifact, at nothing), so none is accepted.
step "checking machinery directories for unmanifested files and symbolic links: ${MACHINERY_DIRS[*]}"
missing=""
links=""
for dir in "${MACHINERY_DIRS[@]}"; do
	[ -e "$REPO/$dir" ] || [ -L "$REPO/$dir" ] || continue
	while IFS= read -r file; do
		rel="${file#"$REPO"/}"
		printf '%s\n' "$paths" | grep -Fxq -- "$rel" || missing="$missing  $rel"$'\n'
	done < <(find "$REPO/$dir" -type f ! -name '.DS_Store' ! -path '*/node_modules/*' | LC_ALL=C sort)
	while IFS= read -r link; do
		links="$links  ${link#"$REPO"/} -> $(readlink "$link")"$'\n'
	done < <(find "$REPO/$dir" -type l ! -path '*/node_modules/*' | LC_ALL=C sort)
done
if [ -n "$links" ]; then
	printf 'install: these symbolic links are under a machinery directory:\n%s' "$links" >&2
	fail "symbolic links under machinery directories are not installed; replace each with a regular file and a manifest row" 2
fi
if [ -n "$missing" ]; then
	printf 'install: these files are under a machinery directory and have no manifest row:\n%s' "$missing" >&2
	fail "unmanifested artifacts; add a row to install/manifest.tsv or move the file out" 2
fi
step "no unmanifested files, no symbolic links"

# ---- 3. install the ledger ---------------------------------------------------------------------
# ledger-init creates or verifies the ledger from the ledger-schema row. It refuses a schema file
# other than the module's (exit 2) and a synced or network folder (exit 3, ledger/src/locality.ts),
# both before it creates anything.
step "ledger: $LEDGER_DB (schema $SCHEMA_ROW, init $INIT_ROW)"
set +e
bun run "$REPO/$INIT_ROW" "$LEDGER_DB" --schema "$REPO/$SCHEMA_ROW"
status=$?
set -e
case "$status" in 0) ;; 2 | 3 | 4) fail "ledger init exited $status" "$status" ;; *) fail "ledger init exited $status" 1 ;; esac

# ledger-backup: the backup job. Running it once here gives a fresh machine its first copy in the
# ledger's own namespace under backups/; it exits nonzero when a due copy cannot be taken.
step "ledger backup: $BACKUP_ROW"
bun run "$REPO/$BACKUP_ROW" "$LEDGER_DB" || fail "ledger backup exited $?" 1

# ---- 4. the periodic backup job (ledger-backup-agent) --------------------------------------------
# macOS: fill the template and write it to $HOME/Library/LaunchAgents. Written, never loaded: the
# installer does not run launchctl. Linux gets a systemd user timer later (manifest placeholder);
# until then the open-time copy is the only schedule there.
PLIST="$LAUNCH_AGENTS/${AGENT_ROW##*/}"
if [ "$(uname -s)" = Darwin ]; then
	step "backup job: $AGENT_ROW -> $PLIST"
	BUN_BIN="$(command -v bun)"
	case "$BUN_BIN" in /*) ;; *) BUN_BIN="$PWD/$BUN_BIN" ;; esac
	mkdir -p "$LAUNCH_AGENTS"
	# One pass over the template: each @NAME@ in the template is replaced by its value, XML-escaped;
	# substituted text is never scanned again, so a value may contain "@REPO@" or "&" literally. An
	# @NAME@ in the template with no value here fails the render.
	bun -e '
		const [template, ...pairs] = process.argv.slice(1);
		const values = new Map(pairs.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
		const escape = (s) => s.replace(/[&<>"\x27]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "\x27": "&apos;" })[c]);
		const text = (await Bun.file(template).text()).replace(/@([A-Z_]+)@/g, (token, name) => {
			if (!values.has(name)) { console.error(`install: ${template} has ${token}, which has no value`); process.exit(1); }
			return escape(values.get(name));
		});
		process.stdout.write(text.endsWith("\n") ? text : text + "\n");
	' "$REPO/$AGENT_ROW" \
		"BUN=$BUN_BIN" \
		"BACKUP_SCRIPT=$REPO/$BACKUP_ROW" \
		"LEDGER_DB=$LEDGER_ABS" \
		"HOME=$HOME" \
		"REPO=$REPO" \
		"LOG=$(dirname "$LEDGER_ABS")/ledger-backup.log" \
		>"$PLIST.tmp.$$" || { rm -f "$PLIST.tmp.$$"; fail "backup job template $AGENT_ROW could not be filled" 1; }
	/usr/bin/plutil -lint "$PLIST.tmp.$$" >/dev/null || { rm -f "$PLIST.tmp.$$"; fail "the filled backup job plist does not lint" 1; }
	mv -f "$PLIST.tmp.$$" "$PLIST"
	step "backup job written, not loaded. To load it (and after any re-install, unload first):"
	printf '    launchctl bootstrap gui/$(id -u) %q\n' "$PLIST"
	printf '  to unload:\n    launchctl bootout gui/$(id -u)/com.agent-system-2.ledger-backup\n'
else
	step "backup job: not macOS; no periodic job written (systemd timer not built yet); the open-time copy is the only schedule"
fi

step "install complete: ledger at $LEDGER_DB"
