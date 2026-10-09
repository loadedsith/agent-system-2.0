#!/usr/bin/env bash
# agent-system 2.0: set up the `_as2test` user the outside-the-fence test runner runs lane code as
# (MIGRATION.md item 24; the approved plan of workload wl-muraerdsgw7gn4, revision 12, § 3.1).
#
# Run it as yourself, from the checkout whose test-exec you want installed. It uses sudo for each
# privileged step (SPEC-2.0.md § A4 reserved), previews every change, and asks before making any.
#
#   1. group and user _as2test (dscl): the first id >= 600 free as both a user id and a group id,
#      recorded in SOURCE and reused on a re-run; UserShell /usr/bin/false, NFSHomeDirectory
#      /var/empty, IsHidden 1; in no other group. An _as2test user or group that SOURCE does not
#      record is refused, never taken over.
#   2. /Users/Shared/as2test (root:wheel 0755) with stage/ (you:_as2test 0750), runs/
#      (_as2test 0755) and locks/ (root:wheel 0755) holding sweep.db (_as2test 0600, empty).
#   3. /usr/local/libexec/as2test (root:wheel 0755; every parent root-owned and not group- or
#      world-writable): exec (the wrapper, surface/src/as2test.ts renderExecWrapper, sweepScope
#      uid), bun (a copy of your bun), test-exec.js (`bun build --target=bun` of
#      surface/scripts/test-exec.ts) and SOURCE (the checkout and its sha, the bun version, the ids,
#      what setup created, and the sha-256 of each installed file and of every bundle input).
#   4. /etc/sudoers.d/as2test (root:wheel 0440): `<you> ALL=(_as2test) NOPASSWD:
#      /usr/local/libexec/as2test/exec`, after checking the policy includes /private/etc/sudoers.d;
#      checked with `visudo -cf`, then the whole policy with `visudo -c`, before it is moved in.
#
# Re-run it after a bun upgrade or a change to test-exec or anything it imports (the runner's
# preflight says "re-run install/as2test-setup.sh" when the installed copy no longer matches). A
# re-run also repairs a corrupt or missing locks/sweep.db: setup recreates it empty when it is not
# an empty _as2test-owned 0600 file.
#
# Usage:   bash install/as2test-setup.sh [--dry-run]          set up, or re-run to refresh
#          bash install/as2test-setup.sh --undo [--dry-run]   remove only what SOURCE says setup created
#          bash install/as2test-setup.sh --help
#   --dry-run  checks and prints the plan, then stops; nothing is changed and sudo is not called.
#   --undo     refuses while a run holds the runs lock (<runs root>/runs.db, a heartbeat under 60 s).
# Env:     AGENT_SYSTEM_TEST_RUNS, AGENT_SYSTEM_LEDGER_DB   locate the runs lock --undo checks
#          AS2TEST_SETUP_TEST_PREFIX   tests only: every target path moves under this directory and
#                                      "root-owned" means owned by the caller
# Exit:    0 done, or plan printed · 1 refused or failed (the message says which; a refusal changes
#          nothing) · 2 usage
set -euo pipefail

usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed '$d; s/^# \{0,1\}//'; }
fail() { printf 'as2test-setup: %s\n' "$1" >&2; exit 1; }
say() { printf '%s\n' "$*"; }

MODE=apply
DRY=0
for arg in "$@"; do
	case "$arg" in
	--dry-run) DRY=1 ;;
	--undo) MODE=undo ;;
	-h | --help) usage; exit 0 ;;
	*) usage >&2; exit 2 ;;
	esac
done

CHECKOUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
NAME=_as2test
PREFIX="${AS2TEST_SETUP_TEST_PREFIX:-}"
if [ -n "$PREFIX" ]; then
	case "$PREFIX" in /*) ;; *) fail "AS2TEST_SETUP_TEST_PREFIX must be absolute" ;; esac
	ROOT_UID="$(id -u)"
else
	ROOT_UID=0
fi
ROOT="$PREFIX/Users/Shared/as2test"
LIBEXEC="$PREFIX/usr/local/libexec/as2test"
SUDOERS_D="$PREFIX/etc/sudoers.d"
SUDOERS_FILE="$SUDOERS_D/as2test"
ETC_SUDOERS="$PREFIX/etc/sudoers"
SOURCE_FILE="$LIBEXEC/SOURCE"

JO="$(id -un)"
JO_UID="$(id -u)"
[ "$JO_UID" -ne 0 ] || fail "run this as yourself, not as root: it grants your user, and calls sudo for each privileged step"

# ---- what an earlier run recorded ---------------------------------------------------------------
src_get() { [ -f "$SOURCE_FILE" ] && awk -v k="$1" '$1 == k { sub(/^[^ ]+ /, ""); print; exit }' "$SOURCE_FILE"; }
src_created() { [ -f "$SOURCE_FILE" ] && awk '$1 == "created" { sub(/^[^ ]+ /, ""); print }' "$SOURCE_FILE"; }
REC_UID="$(src_get uid || true)"
REC_GID="$(src_get gid || true)"
REC_CREATED="$(src_created || true)"
recorded() { printf '%s\n' "$REC_CREATED" | grep -qxF -- "$1"; }

# ---- the runs lock (--undo) -------------------------------------------------------------------------
runs_lock_holder() {
	local ledger="${AGENT_SYSTEM_LEDGER_DB:-$HOME/.agent-system-2/ledger.db}"
	local runs="${AGENT_SYSTEM_TEST_RUNS:-$(dirname "$ledger")/test-runs}"
	local db="$runs/runs.db" now
	[ -e "$db" ] || return 0
	now="$(($(date +%s) * 1000))"
	sqlite3 -readonly "$db" "SELECT runId FROM lock WHERE id = 1 AND heartbeatAt > $((now - 60000));" ||
		fail "cannot read the runs lock in $db; refusing rather than guess"
}

# ---- undo -------------------------------------------------------------------------------------------
if [ "$MODE" = undo ]; then
	[ -f "$SOURCE_FILE" ] || fail "no $SOURCE_FILE: setup recorded nothing here, so undo removes nothing"
	holder="$(runs_lock_holder)"
	[ -z "$holder" ] || fail "run $holder holds the runs lock; undo when it has finished"
	plan=()
	recorded "$SUDOERS_FILE" && plan+=("sudo rm -f $SUDOERS_FILE")
	recorded "$LIBEXEC" && plan+=("sudo rm -rf $LIBEXEC")
	recorded "$ROOT" && plan+=("sudo rm -rf $ROOT")
	recorded user && plan+=("sudo dscl . -delete /Users/$NAME")
	recorded group && plan+=("sudo dscl . -delete /Groups/$NAME")
	while IFS= read -r c; do
		case "$c" in "" | user | group | "$SUDOERS_FILE" | "$LIBEXEC" | "$ROOT") ;; *) fail "SOURCE records an unknown created path $c; refusing" ;; esac
	done <<<"$REC_CREATED"
	say "as2test undo plan (from $SOURCE_FILE):"
	[ "${#plan[@]}" -gt 0 ] || { say "  nothing: setup created nothing it recorded"; exit 0; }
	for step in "${plan[@]}"; do say "  $step"; done
	[ "$DRY" -eq 0 ] || { say "dry run: nothing changed"; exit 0; }
	read -r -p "Remove these? [y/N] " answer || answer=""
	[ "$answer" = y ] || [ "$answer" = Y ] || fail "not confirmed; nothing changed"
	for step in "${plan[@]}"; do
		say "==> $step"
		# shellcheck disable=SC2086 # each step is a fixed command built above, its paths without spaces
		$step
	done
	say "as2test removed"
	exit 0
fi

# ---- checks (nothing is written outside a temp dir until the plan is confirmed) ---------------------
command -v bun >/dev/null 2>&1 || fail "bun not found on PATH"
command -v dscl >/dev/null 2>&1 || fail "dscl not found (setup is macOS only)"
BUN_SRC="$(command -v bun)"
BUN_VERSION="$(bun --version)"
SOURCE_SHA="$(git -C "$CHECKOUT" rev-parse HEAD 2>/dev/null || echo unknown)"

dscl_int() { dscl . -read "$1" "$2" 2>/dev/null | awk -v k="$2:" '$1 == k { print $2; exit }'; }
CUR_UID="$(dscl_int "/Users/$NAME" UniqueID || true)"
CUR_GID="$(dscl_int "/Groups/$NAME" PrimaryGroupID || true)"
if [ -n "$CUR_UID" ] && [ "$CUR_UID" != "$REC_UID" ]; then
	fail "a user $NAME (uid $CUR_UID) exists that setup did not record in $SOURCE_FILE; refusing to take it over"
fi
if [ -n "$CUR_GID" ] && [ "$CUR_GID" != "$REC_GID" ]; then
	fail "a group $NAME (gid $CUR_GID) exists that setup did not record in $SOURCE_FILE; refusing to take it over"
fi
if [ -n "$REC_UID" ]; then
	ID="$REC_UID"
	[ "$REC_GID" = "$REC_UID" ] || fail "$SOURCE_FILE records uid $REC_UID and gid $REC_GID; setup uses one id for both"
else
	taken="$( { dscl . -list /Users UniqueID; dscl . -list /Groups PrimaryGroupID; } | awk '{ print $NF }')" || fail "dscl could not list ids"
	ID=600
	while printf '%s\n' "$taken" | grep -qxF -- "$ID"; do ID=$((ID + 1)); done
fi

# Every existing parent of the libexec dir is root-owned and not group- or world-writable.
d="$(dirname "$LIBEXEC")"
while [ "$d" != "/" ] && [ "$d" != "$PREFIX" ]; do
	if [ -e "$d" ]; then
		read -r owner mode <<<"$(stat -f '%u %Lp' "$d")"
		[ "$owner" = "$ROOT_UID" ] || fail "$d is owned by uid $owner, not root; the wrapper must sit in root-owned directories"
		[ $((8#$mode & 8#022)) -eq 0 ] || fail "$d is group- or world-writable (mode $mode)"
	fi
	d="$(dirname "$d")"
done

TMP="$(mktemp -d "${TMPDIR:-/tmp}/as2test-setup.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
(cd "$CHECKOUT" && bun build --target=bun "--outfile=$TMP/test-exec.js" "--metafile=$TMP/meta.json" surface/scripts/test-exec.ts >/dev/null) ||
	fail "bun build of surface/scripts/test-exec.ts failed"
INPUTS="$(cd "$CHECKOUT" && bun surface/src/as2test.ts bundle-inputs "$TMP/meta.json" "$CHECKOUT")" || fail "could not list the bundle's inputs"
(cd "$CHECKOUT" && bun surface/src/as2test.ts render-exec --root "$ROOT" --bun "$LIBEXEC/bun" --script "$LIBEXEC/test-exec.js" --sweep-scope uid) >"$TMP/exec" ||
	fail "could not render the wrapper"
cp "$BUN_SRC" "$TMP/bun"
SUDOERS_LINE="$JO ALL=($NAME) NOPASSWD: $LIBEXEC/exec"
printf '%s\n' "# agent-system 2.0 test runner (MIGRATION.md item 24): written by install/as2test-setup.sh" "$SUDOERS_LINE" >"$TMP/sudoers"

sha() { shasum -a 256 "$1" | awk '{ print $1 }'; }
created=()
while IFS= read -r c; do [ -n "$c" ] && created+=("$c"); done <<<"$REC_CREATED"
add_created() { recorded "$1" || created+=("$1"); }
[ -n "$CUR_UID" ] || add_created user
[ -n "$CUR_GID" ] || add_created group
[ -e "$ROOT" ] || add_created "$ROOT"
[ -e "$LIBEXEC" ] || add_created "$LIBEXEC"
[ -e "$SUDOERS_FILE" ] || add_created "$SUDOERS_FILE"
{
	say "# as2test SOURCE: written by install/as2test-setup.sh, read by the runner's preflight (surface/src/as2test.ts parseSource) and by --undo"
	say "version 1"
	say "source $CHECKOUT"
	say "source-sha $SOURCE_SHA"
	say "bun-version $BUN_VERSION"
	say "user $NAME"
	say "uid $ID"
	say "gid $ID"
	say "jo $JO"
	say "jo-uid $JO_UID"
	for c in "${created[@]}"; do say "created $c"; done
	for f in exec bun test-exec.js; do say "file $f $(sha "$TMP/$f")"; done
	while IFS= read -r rel; do say "input $rel $(sha "$CHECKOUT/$rel")"; done <<<"$INPUTS"
} >"$TMP/SOURCE"

SWEEP_DB="$ROOT/locks/sweep.db"
sweep_db_ok() { [ -f "$SWEEP_DB" ] && [ ! -L "$SWEEP_DB" ] && [ "$(stat -f '%z %u %Lp' "$SWEEP_DB")" = "0 $ID 600" ]; }

# ---- the plan ----------------------------------------------------------------------------------------
say "as2test setup plan for $JO (uid $JO_UID), from $CHECKOUT at $SOURCE_SHA, bun $BUN_VERSION:"
if [ -n "$CUR_GID" ]; then say "  group $NAME gid $ID: exists (recorded)"; else
	say "  sudo dscl . -create /Groups/$NAME PrimaryGroupID $ID"
	say "  sudo dscl . -create /Groups/$NAME RealName 'as2 test runner'"
	say "  sudo dscl . -create /Groups/$NAME Password '*'"
fi
if [ -n "$CUR_UID" ]; then say "  user $NAME uid $ID: exists (recorded)"; else
	say "  sudo dscl . -create /Users/$NAME UniqueID $ID"
	say "  sudo dscl . -create /Users/$NAME PrimaryGroupID $ID"
	say "  sudo dscl . -create /Users/$NAME UserShell /usr/bin/false"
	say "  sudo dscl . -create /Users/$NAME NFSHomeDirectory /var/empty"
	say "  sudo dscl . -create /Users/$NAME IsHidden 1"
	say "  sudo dscl . -create /Users/$NAME RealName 'as2 test runner'"
	say "  sudo dscl . -create /Users/$NAME Password '*'"
fi
say "  sudo install -d -o root -g wheel -m 0755 $ROOT $ROOT/locks"
say "  sudo install -d -o $JO -g $ID -m 0750 $ROOT/stage"
say "  sudo install -d -o $ID -g $ID -m 0755 $ROOT/runs"
if sweep_db_ok; then say "  $SWEEP_DB: kept (empty, $NAME, 0600)"; else
	say "  sudo install -o $ID -g $ID -m 0600 /dev/null $SWEEP_DB   (new or repaired)"
fi
say "  sudo install -d -o root -g wheel -m 0755 $LIBEXEC"
for f in exec bun test-exec.js SOURCE; do say "  sudo install -o root -g wheel -m 0755 $f $LIBEXEC/$f   (sha-256 $(sha "$TMP/$f"))"; done
say "  sudoers $SUDOERS_FILE (root:wheel 0440): $SUDOERS_LINE"
say "    checked first: the policy includes /private/etc/sudoers.d; visudo -cf on the file; visudo -c on the policy"
[ "$DRY" -eq 0 ] || { say "dry run: nothing changed"; exit 0; }

read -r -p "Apply this plan? [y/N] " answer || answer=""
[ "$answer" = y ] || [ "$answer" = Y ] || fail "not confirmed; nothing changed"

# ---- sudoers checks, before any change ---------------------------------------------------------------
policy="$(sudo visudo -c 2>&1)" || fail "visudo -c fails on the current policy; nothing changed: $policy"
if ! printf '%s\n' "$policy" | grep -q 'sudoers\.d' &&
	! sudo grep -Eq '^[#@]includedir[[:space:]]+(/private)?/etc/sudoers\.d[[:space:]]*$' "$ETC_SUDOERS"; then
	fail "the sudo policy does not include /private/etc/sudoers.d; add '#includedir /private/etc/sudoers.d' to /etc/sudoers with visudo, then re-run. Nothing changed"
fi
sudo visudo -cf "$TMP/sudoers" >/dev/null || fail "visudo -cf rejects the drop-in; nothing changed"

# ---- apply -----------------------------------------------------------------------------------------
step() { say "==> $*"; "$@"; }
if [ -z "$CUR_GID" ]; then
	step sudo dscl . -create "/Groups/$NAME" PrimaryGroupID "$ID"
	step sudo dscl . -create "/Groups/$NAME" RealName "as2 test runner"
	step sudo dscl . -create "/Groups/$NAME" Password "*"
fi
if [ -z "$CUR_UID" ]; then
	step sudo dscl . -create "/Users/$NAME" UniqueID "$ID"
	step sudo dscl . -create "/Users/$NAME" PrimaryGroupID "$ID"
	step sudo dscl . -create "/Users/$NAME" UserShell /usr/bin/false
	step sudo dscl . -create "/Users/$NAME" NFSHomeDirectory /var/empty
	step sudo dscl . -create "/Users/$NAME" IsHidden 1
	step sudo dscl . -create "/Users/$NAME" RealName "as2 test runner"
	step sudo dscl . -create "/Users/$NAME" Password "*"
fi
step sudo install -d -o root -g wheel -m 0755 "$ROOT" "$ROOT/locks"
step sudo install -d -o "$JO" -g "$ID" -m 0750 "$ROOT/stage"
step sudo install -d -o "$ID" -g "$ID" -m 0755 "$ROOT/runs"
if ! sweep_db_ok; then
	step sudo rm -f "$SWEEP_DB"
	step sudo install -o "$ID" -g "$ID" -m 0600 /dev/null "$SWEEP_DB"
fi
step sudo install -d -o root -g wheel -m 0755 "$LIBEXEC"
for f in exec bun test-exec.js SOURCE; do step sudo install -o root -g wheel -m 0755 "$TMP/$f" "$LIBEXEC/$f"; done

# The drop-in: staged under a name sudo's includedir skips (it contains a dot), checked, then moved.
step sudo install -o root -g wheel -m 0440 "$TMP/sudoers" "$SUDOERS_D/.as2test.new"
if ! sudo visudo -cf "$SUDOERS_D/.as2test.new" >/dev/null || ! sudo visudo -c >/dev/null; then
	sudo rm -f "$SUDOERS_D/.as2test.new"
	fail "visudo rejected the staged drop-in; it was removed and $SUDOERS_FILE is unchanged. The user, dirs and files are in place: fix the policy and re-run"
fi
step sudo mv -f "$SUDOERS_D/.as2test.new" "$SUDOERS_FILE"
say "as2test is set up: $LIBEXEC (SOURCE records it). The runner checks it before every run."
