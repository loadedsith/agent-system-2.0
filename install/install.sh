#!/usr/bin/env bash
# agent-system 2.0 install (migration steps M2 ledger, M6 profile + skills).
#
# Reads install/manifest.tsv (SPEC-2.0.md § B8: the manifest IS the machinery table) and installs
# each row by its kind. Today that means: create or verify the ledger from the manifest's one
# ledger-schema row, using its one ledger-init row, take the first scheduled copy with its one
# ledger-backup row, (macOS) write the periodic backup job from its one ledger-backup-agent row
# into $HOME/Library/LaunchAgents (written, never loaded: the load command is printed at the end),
# and build the OMP profile: render the `profile` row profile/config.yml with {repo} filled into
# $HOME/.omp/profiles/<profile>/agent/config.yml, place the `profile` row profile/models.yml beside
# it, and link every `tier` row into $HOME/.omp/profiles/<profile>/agent/agents/. `skill` rows
# (skills/<name>/SKILL.md) and `skill-asset` rows are used in place through the profile's
# skills.customDirectories; the render is refused when its skills.includeSkills is not exactly
# the set of `skill` rows, or when a `skill` row lacks a frontmatter description (omp://skills.md:
# the native provider requires one). Each `launcher` row (bin/<name>, destination
# {local_bin}/<name>) is linked to $HOME/.local/bin/<name> the way the tier files are, so `as2`
# is one word on PATH; the directory is created if absent and a notice is printed when it is not
# on PATH. The last line names the providers the rendered profile routes to and says each needs a
# /login once per profile (the profile's setupVersion skips OMP's first-launch sign-in scene).
#
# Usage:   bash install/install.sh
# Env:     AGENT_SYSTEM_LEDGER_DB   ledger file (default: $HOME/.agent-system-2/ledger.db)
#          AGENT_SYSTEM_PROFILE     OMP profile name (default: agent-system-2); the profile lives at
#                                   $HOME/.omp/profiles/<profile>/agent (omp://config-usage.md § Profiles)
# Exit:    0 installed · 1 other failure · 2 manifest or profile check failed (nothing written)
#          3 ledger path refused as synced or network folder (nothing written)
#          4 the ledger file exists at a schema version other than the supported one (5), e.g. a
#            version-1 to -4 ledger from before schema v5 (nothing written; no upgrade exists:
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
MACHINERY_DIRS=(ledger install extensions agents profile skills tiers classifier gates bin surface contract voice)
# The one schema file the ledger module applies (ledger/src/index.ts SCHEMA_PATH). The manifest's
# ledger-schema row must name exactly this file; the init script re-checks it against the module.
CANONICAL_SCHEMA="ledger/schema.sql"
LEDGER_DB="${AGENT_SYSTEM_LEDGER_DB:-$HOME/.agent-system-2/ledger.db}"
# launchd runs the job with / as its working directory, so the plist carries an absolute path.
case "$LEDGER_DB" in /*) LEDGER_ABS="$LEDGER_DB" ;; *) LEDGER_ABS="$PWD/$LEDGER_DB" ;; esac
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PROFILE_NAME="${AGENT_SYSTEM_PROFILE:-agent-system-2}"
PROFILE_DIR="$HOME/.omp/profiles/$PROFILE_NAME/agent"
LOCAL_BIN="$HOME/.local/bin"

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
config_rows=""
models_rows=""
tier_rows=""
launcher_rows=""
skill_names=""
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
		profile)
			[ "$dest" = "{profile}/agent/${path##*/}" ] || fail "manifest line $line_no: profile destination must be {profile}/agent/${path##*/}" 2
			case "$path" in
				profile/config.yml) config_rows="$config_rows$path"$'\n' ;;
				profile/models.yml) models_rows="$models_rows$path"$'\n' ;;
				*) fail "manifest line $line_no: kind profile is only profile/config.yml and profile/models.yml; got $path" 2 ;;
			esac ;;
		tier)
			[ "$dest" = "{profile}/agent/agents/${path##*/}" ] || fail "manifest line $line_no: tier destination must be {profile}/agent/agents/${path##*/}" 2
			case "$path" in tiers/*.md) ;; *) fail "manifest line $line_no: kind tier is tiers/<name>.md; got $path" 2 ;; esac
			tier_rows="$tier_rows$path"$'\n' ;;
		skill)
			[ "$dest" = "-" ] || fail "manifest line $line_no: kind skill is used in place through the profile's customDirectories; destination must be -" 2
			case "$path" in skills/*/SKILL.md) ;; *) fail "manifest line $line_no: kind skill is skills/<name>/SKILL.md; got $path" 2 ;; esac
			name="${path#skills/}"; name="${name%/SKILL.md}"
			case "$name" in */*) fail "manifest line $line_no: kind skill is one level under skills/ (omp://skills.md); got $path" 2 ;; esac
			skill_names="$skill_names$name"$'\n' ;;
		skill-asset)
			[ "$dest" = "-" ] || fail "manifest line $line_no: kind skill-asset is used in place; destination must be -" 2
			case "$path" in skills/*) ;; *) fail "manifest line $line_no: kind skill-asset lives under skills/; got $path" 2 ;; esac ;;
		launcher)
			[ "$dest" = "{local_bin}/${path##*/}" ] || fail "manifest line $line_no: launcher destination must be {local_bin}/${path##*/}" 2
			case "$path" in bin/*) ;; *) fail "manifest line $line_no: kind launcher is bin/<name>; got $path" 2 ;; esac
			case "${path#bin/}" in */*) fail "manifest line $line_no: kind launcher is one level under bin/; got $path" 2 ;; esac
			[ -x "$REPO/$path" ] || fail "manifest line $line_no: launcher $path is not executable" 2
			launcher_rows="$launcher_rows$path"$'\n' ;;
		ledger-module | module | extension | data | test | doc | install) [ "$dest" = "-" ] || fail "manifest line $line_no: kind $kind is used in place; destination must be -" 2 ;;
		*) fail "manifest line $line_no: unknown kind '$kind' (this installer knows ledger-schema, ledger-module, ledger-init, ledger-backup, ledger-backup-agent, module, extension, tier, profile, skill, skill-asset, launcher, data, test, doc, install)" 2 ;;
	esac
	if printf '%s\n' "$paths" | grep -Fxq -- "$path"; then fail "manifest line $line_no: duplicate row for $path" 2; fi
	paths="$paths$path"$'\n'
	rows=$((rows + 1))
done <"$MANIFEST"
[ "$header_seen" -eq 1 ] || fail "manifest has no header row" 2
# The ledger kinds are run, not just listed, so each must name exactly one file; the schema row
# must name the one file the module applies, so a misclassified or missing row cannot pass.
for kind_rows in "ledger-schema:$schema_rows" "ledger-init:$init_rows" "ledger-backup:$backup_rows" "ledger-backup-agent:$agent_rows" "profile config.yml:$config_rows" "profile models.yml:$models_rows"; do
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
CONFIG_ROW="${config_rows%$'\n'}"
MODELS_ROW="${models_rows%$'\n'}"
[ -n "$tier_rows" ] || fail "manifest has no tier rows; the profile needs its tiers/<name>.md agents" 2
[ -n "$skill_names" ] || fail "manifest has no skill rows; the profile's includeSkills would allow nothing" 2
step "manifest ok: $rows rows (schema $SCHEMA_ROW, $(printf '%s' "$tier_rows" | grep -c .) tiers, $(printf '%s' "$skill_names" | grep -c .) skills)"

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

# ---- 2b. render the profile and check it before anything is written ---------------------------
# {repo} in the template becomes this checkout's absolute path; substituted text is never scanned
# again. The render is refused (exit 2, nothing written) when the result is not YAML, when a
# {repo} survives, when skills.customDirectories is not exactly [<repo>/skills], when
# skills.includeSkills is not exactly the manifest's `skill` rows, or when a `skill` row's SKILL.md
# has no frontmatter description (omp://skills.md: the native provider drops such a skill, and the
# allowlist would then name a skill that never loads).
step "profile: rendering $CONFIG_ROW for profile $PROFILE_NAME"
set +e
RENDERED="$(bun -e '
	const [template, repo, ...names] = process.argv.slice(1);
	const fail = (m) => { console.error(`install: profile: ${m}`); process.exit(1); };
	const text = (await Bun.file(template).text()).split("{repo}").join(repo);
	if (text.includes("{repo}")) fail("a {repo} survived the render");
	let doc;
	try { doc = Bun.YAML.parse(text); } catch (e) { fail(`rendered ${template} is not YAML: ${e.message}`); }
	const skills = doc && typeof doc === "object" ? doc.skills : undefined;
	if (!skills || typeof skills !== "object") fail(`${template} has no skills: block`);
	const dirs = skills.customDirectories;
	if (!Array.isArray(dirs) || dirs.length !== 1 || dirs[0] !== `${repo}/skills`) fail(`skills.customDirectories must be exactly [${repo}/skills]; got ${JSON.stringify(dirs)}`);
	const want = [...new Set(names)].sort();
	const have = Array.isArray(skills.includeSkills) ? [...new Set(skills.includeSkills.map(String))].sort() : null;
	if (!have) fail("skills.includeSkills must be a list");
	const missing = want.filter((n) => !have.includes(n));
	const extra = have.filter((n) => !want.includes(n));
	if (missing.length || extra.length) fail(`skills.includeSkills differs from the manifest skill rows; missing from config: [${missing}] not in manifest: [${extra}]`);
	for (const n of want) {
		const path = `${repo}/skills/${n}/SKILL.md`;
		const head = (await Bun.file(path).text()).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
		let fm;
		try { fm = head ? Bun.YAML.parse(head[1]) : null; } catch (e) { fail(`${path}: frontmatter is not YAML: ${e.message}`); }
		if (!fm || typeof fm !== "object" || typeof fm.description !== "string" || !fm.description.trim()) fail(`${path}: frontmatter has no description (omp://skills.md requires one)`);
		if (fm.name !== undefined && fm.name !== n) fail(`${path}: frontmatter name ${JSON.stringify(fm.name)} differs from its directory ${n}`);
	}
	process.stdout.write(text.endsWith("\n") ? text : text + "\n");
' "$REPO/$CONFIG_ROW" "$REPO" $skill_names)"
status=$?
set -e
[ "$status" -eq 0 ] || fail "profile render refused" 2
step "profile ok: includeSkills matches the $(printf '%s' "$skill_names" | grep -c .) skill rows; every skill has a description"

# The providers this profile routes to, for the login line printed after a successful install
# (section 7): every model named in the rendered task.agentModelOverrides and modelRoles, in that
# order, so the line follows the tier table rather than a second copy of it. Read here, before
# anything is written, so a profile naming no provider refuses the install instead of printing an
# empty line at the end.
PROVIDERS="$(printf '%s' "$RENDERED" | bun -e '
	const doc = Bun.YAML.parse(await Bun.stdin.text());
	const models = [...Object.values(doc?.task?.agentModelOverrides ?? {}).flat(), ...Object.values(doc?.modelRoles ?? {})];
	const providers = [...new Set(models.filter((m) => typeof m === "string" && m.includes("/")).map((m) => m.slice(0, m.indexOf("/"))))];
	if (!providers.length) { console.error("install: profile: the rendered config names no provider/model in task.agentModelOverrides or modelRoles"); process.exit(1); }
	console.log(providers.join(", "));
')" || fail "profile render refused" 2

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

# ---- 5. the OMP profile (profile + tier rows) ---------------------------------------------------
# Written last, after the ledger steps, so a refused ledger leaves no half-profile behind. The
# tier files are symbolic links into the checkout: a tier edit is live without a re-install, and
# nothing under the profile is a second copy to drift. Re-runs rewrite the same content.
step "profile: $PROFILE_DIR"
mkdir -p "$PROFILE_DIR/agents"
printf '%s' "$RENDERED" >"$PROFILE_DIR/config.yml.tmp.$$" || { rm -f "$PROFILE_DIR/config.yml.tmp.$$"; fail "could not write $PROFILE_DIR/config.yml" 1; }
mv -f "$PROFILE_DIR/config.yml.tmp.$$" "$PROFILE_DIR/config.yml"
cp -f "$REPO/$MODELS_ROW" "$PROFILE_DIR/models.yml"
step "profile written: config.yml (rendered from $CONFIG_ROW), models.yml (from $MODELS_ROW)"
while IFS= read -r tier; do
	[ -n "$tier" ] || continue
	ln -sfn "$REPO/$tier" "$PROFILE_DIR/agents/${tier##*/}"
	step "tier linked: $PROFILE_DIR/agents/${tier##*/} -> $REPO/$tier"
done <<<"$tier_rows"
step "profile ready: omp --profile $PROFILE_NAME (or OMP_PROFILE=$PROFILE_NAME); skills load from $REPO/skills"

# ---- 6. the launcher (launcher rows) ------------------------------------------------------------
# A symbolic link into the checkout, like the tier files: the script resolves its own real path to
# find the repo, so an edit to bin/<name> is live without a re-install.
if [ -n "$launcher_rows" ]; then
	mkdir -p "$LOCAL_BIN"
	while IFS= read -r launcher; do
		[ -n "$launcher" ] || continue
		ln -sfn "$REPO/$launcher" "$LOCAL_BIN/${launcher##*/}"
		step "launcher linked: $LOCAL_BIN/${launcher##*/} -> $REPO/$launcher"
	done <<<"$launcher_rows"
	case ":$PATH:" in
		*":$LOCAL_BIN:"*) ;;
		*) step "note: $LOCAL_BIN is not on PATH; add it (e.g. in ~/.zshrc: export PATH=\"\$HOME/.local/bin:\$PATH\") to run the launcher by name" ;;
	esac
fi

step "install complete: ledger at $LEDGER_DB"

# ---- 7. provider login, once per profile ---------------------------------------------------------
# The profile's setupVersion (profile/config.yml) skips OMP's first-launch wizard, its sign-in scene
# included, so the one step left is logging in. Credentials go to the profile's own agent.db, so a
# new profile needs its own logins even when the default profile has them.
step "first launch: this profile routes to $PROVIDERS; OMP needs a login to each once per profile: run /login in the as2 session (credentials stay in $PROFILE_DIR/agent.db)"
