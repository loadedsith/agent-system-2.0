# Ledger schema, version 6

The agent-system 2.0 ledger is one SQLite file in WAL mode. This document is for a person or a
non-OMP tool reading or writing it. The authoritative definition is `ledger/schema.sql`; this page
explains it. Ruling: `SPEC-2.0.md` § B2 ("Ruled 2026-09-24").

## Where the file lives

- Default: `$HOME/.agent-system-2/ledger.db`, outside every OMP profile.
- Override: the environment variable `AGENT_SYSTEM_LEDGER_DB` (an absolute or relative path).
- Never on a synced or network folder: SQLite WAL does not work over a network filesystem. The
  module (`ledger/src/locality.ts`) refuses, before creating anything:
  - any path under these `$HOME` folders: `Library/Mobile Documents`, `Library/CloudStorage`,
    `Desktop`, `Documents`, `Dropbox`, `Google Drive`, `OneDrive`, `Box`, `Box Sync`,
    `iCloud Drive`, `pCloud Drive`. Desktop and Documents are on the list because macOS can sync
    them to iCloud. The path and each of these folders are compared both as written and
    canonicalised (the nearest existing ancestor with every symlink resolved, a dangling symlink
    followed to its target, then the not-yet-existing rest), so a symlink into a synced folder, a
    synced folder that is itself a symlink, a symlinked `$HOME`, and an existing or dangling
    database symlink are all refused ("… is inside …, a synced folder");
  - any path whose mount is not local: on macOS, the mount entry for the path's mount point
    (from `df -P` then `/sbin/mount`) must carry the `local` flag; on Linux, the `/proc/mounts`
    filesystem type must not be a network type (`nfs`, `cifs`, `smbfs`, `sshfs`, and the rest
    listed in `locality.ts`). A mount that cannot be determined is refused too.

  The module then opens the canonical path, so what was checked is what is opened
  (`Ledger#path` is that canonical path).
- Copying: never `cp` a WAL database; it loses what is still in the `-wal` file. Take a copy with
  `VACUUM INTO '<path>'` (the module's `backup()`), or `sqlite3 ledger.db ".backup '<path>'"`.
- **Scheduled second copy** (§ B2 prior art e). A copy is a `VACUUM INTO` snapshot named
  `ledger-<time>.db`, an ordinary ledger file (open it with `sqlite3` or `Ledger.open`).
  - **Layout.** Copies of a ledger live in its own namespace directory under the backup root:
    `backups/<stem>-<hash>/` beside the ledger, where `<stem>` is the ledger's file name without
    its extension and `<hash>` is the first 12 hex digits of the SHA-256 of its canonical path
    (`backupNamespace()` in the module). That directory's `SOURCE` file holds the canonical path.
    Two ledgers in one directory, or two ledgers given the same `OpenOptions.backup.dir`, therefore
    never see, count or prune each other's copies. A namespace directory whose `SOURCE` names
    another ledger is refused ("backup directory … holds copies of …, not of …"), not adopted.
    Moving or renaming a ledger gives it a new namespace; its old copies stay where they were.
  - **Complete copies only.** A snapshot is written to a temporary dot-file in the namespace
    directory (`.ledger-<time>.db.<pid>-<random>.tmp`, where `<pid>` is the writing process),
    checked (non-empty, `PRAGMA integrity_check` ok, `user_version` one `Ledger.open` opens: the
    supported schema version, 6, or one it upgrades, 5), and only then linked to
    its `ledger-<time>.db` name; on any failure the temporary file is removed and the error
    propagates ("snapshot of … is not a complete copy (…)", or SQLite's own error). A writer
    killed before that cleanup (SIGKILL, power loss) leaves its temporary file; the next copy
    that lands removes every such file whose `<pid>` no longer exists (`kill(pid, 0)` fails with
    ESRCH) and leaves the rest, so a writer still running keeps its file. A file with a copy name
    that fails the same check (an empty or partial file an earlier version left) never counts as
    the newest copy: it is set aside as `<name>.invalid`, or `<name>.invalid.2`, `.invalid.3`, …
    when that name is taken (an earlier set-aside file is never replaced), kept, and reported on
    stderr ("ledger: set aside … as ….invalid[.N], not a complete copy (…)"). Remove `.invalid`
    files by hand once inspected; pruning does not touch them.
  - **When.** A copy is due when the ledger's newest copy is at least 24 hours old, or there is
    none. After a copy lands, that ledger's newest 7 are kept (`OpenOptions.backup` sets `dir`,
    `intervalMs`, `keep`, or `false`), and dead writers' temporary files are removed.
  - **The periodic job (the schedule).** `bun run ledger/scripts/backup.ts [path] [--force]`
    (path default: `$AGENT_SYSTEM_LEDGER_DB`, else the default above) takes a copy when due and
    prints `backup ok: took <copy>` or `backup ok: none due; newest <copy>`. It is strict: when a
    due copy cannot be written it exits 1 ("ledger backup failed: …"), even if an older copy
    exists. Exit codes: 0 ok, 1 failure, 3 path refused, 4 schema version refused. On macOS the
    installer writes a launchd user agent that runs it every hour and once at load
    (`install/com.agent-system-2.ledger-backup.plist`, filled in and written to
    `$HOME/Library/LaunchAgents/com.agent-system-2.ledger-backup.plist`; its output goes to
    `ledger-backup.log` beside the ledger). The installer never loads it. To load it, and to
    unload it (unload before loading again after a re-install):

    ```sh
    launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.agent-system-2.ledger-backup.plist
    launchctl bootout gui/$(id -u)/com.agent-system-2.ledger-backup
    ```

    Linux: a systemd user timer is a later addition (placeholder comment in the manifest); until
    it exists the open-time fallback below is the only schedule there.
  - **Open-time fallback.** Every `Ledger.open` of an existing ledger also takes a due copy
    (`OpenOptions.backupOnOpen`, default true). A failure there is reported on stderr ("ledger:
    scheduled backup failed: …") and does not fail the open, so a writer stays available when
    backup storage is not. It only runs when some writer opens the ledger; a long-lived connection
    gets no new copy from it, which is why the periodic job is the schedule.

## Rules every writer is bound by

The rules are in the file as `CHECK` constraints and triggers. A write that breaks one fails with
the message in quotes below, whichever tool made it.

**Provenance on every row.** Every row carries its workload (`workload_id`; for a workload, its
own `id`), the lane instance that wrote it (`created_by`, `changed_by`), and the time
(`created_at`, `changed_at`). None may be NULL or blank. Times are ISO-8601 UTC with
milliseconds, `YYYY-MM-DDTHH:MM:SS.sssZ` (what `Date#toISOString()` and
`strftime('%Y-%m-%dT%H:%M:%fZ','now')` produce), so comparing them as text compares them as time.

**Stamped updates.** Rows start at `rev = 0` with `changed_*` equal to `created_*`. Every UPDATE
must set `rev = rev + 1`, a `changed_by`, and a `changed_at` no earlier than the old one:
"unstamped update". So a raw write must look like:

```sql
UPDATE messages
   SET state = 'delivered',
       changed_by = 'my-tool', changed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), rev = rev + 1
 WHERE id = 'msg-…';
```

**Append-only log.** Every INSERT and UPDATE on the five tables below appends a row to
`provenance` through a trigger; nothing can skip it. `provenance` itself cannot be updated or
deleted ("provenance is append-only"). No ledger row is ever deleted ("ledger rows are never
deleted"). Identity and brief columns never change after insert.

**No replacement.** An INSERT that reuses an existing `id`, an existing `rowid`, or (in
`provenance`) an existing `seq` is refused whatever its conflict clause: `INSERT OR REPLACE`,
`REPLACE`, `INSERT OR IGNORE` and `INSERT … ON CONFLICT DO UPDATE` alike ("ledger rows are never
replaced: that id is already in use"; "provenance is append-only: that seq is already in use").
This matters because `REPLACE` deletes the old row first, and with `recursive_triggers` off (the
`sqlite3` CLI default) that delete fires no delete trigger. For the same reason an UPDATE may not
change a row's `rowid` ("a ledger row keeps its rowid"). A writer that wants a new row picks a new
id.

**Positive physical identity** (version 2). An explicit `rowid` (or `provenance.seq`) of 0 or
below is refused, whatever the conflict clause ("a ledger rowid is a positive integer"; "a
provenance seq is a positive integer"). The replacement guard runs before the row is stored,
when an omitted rowid reads as -1; with no nonpositive rowid ever stored, that -1 cannot match a
row, so a stray negative identity cannot block later ordinary inserts. Omit `rowid` and `seq`;
SQLite assigns positive ones.

**Existence without foreign keys.** `foreign_keys` is a per-connection setting and the `sqlite3`
CLI runs with it off. So the file also checks by trigger that a child row names an **open**
workload, and that a named slice or question belongs to that same workload.

**What the file does not check.** It cannot know *who* is really writing: `changed_by` is whatever
the writer claims. Refusing raw writes to this file from agents is the P-11 raw-write gate
(`DESIGN-2.0.md` mechanical-rule list), built at migration step M4 as an OMP extension hook
matching the path in `AGENT_SYSTEM_LEDGER_DB` or the default above.

## Tables

Ids carry a type prefix (checked): `wl-`, `sl-`, `msg-`, `q-`, `in-`, `rt-`, `en-`. The module generates
`<prefix>-<milliseconds since epoch, base36><6 random base36 chars>`, which sorts by creation
time; any other writer may choose any id with the right prefix. A slice a lane dispatches to a tier
hand must also be a valid OMP agent id, `[A-Za-z0-9_-]{1,48}`, because the dispatch's `name` is the
slice id and OMP would rename anything else (SPEC-2.0.md § B9; the classifier refuses the dispatch);
the module's generated ids always are (`sl-` plus base36 characters, 17 in 2026).

### `workloads`

| column | meaning |
|---|---|
| `id` | `wl-…` |
| `brief` | the workload brief; never changes |
| `stakes` | `throwaway` \| `normal` \| `production` (§ B4) |
| `mode` | `autonomous` \| `user-driven` (§ B13.1: who is steering) |
| `status` | `open` \| `closed` |
| `holder` | the lane instance (or `jo`, § B5) holding the workload; NULL when unheld |
| `holder_lease_until` | when the holder's lease expires; NULL means no expiry |
| `closed_at` | set exactly when `status = 'closed'` |
| `created_by`, `created_at`, `changed_by`, `changed_at`, `rev` | provenance and stamp |

- Opened `open` with no holder ("a workload is opened in status open with no holder").
- `open → closed`, once; a closed workload stays closed ("illegal workload transition"), and
  nothing else on it changes either: holder, lease, stakes, mode and stamp are final (version 6, "a
  closed workload is final: nothing on it changes").
- The standing workload `wl-orchestrator` is never closed (version 6, "the standing workload
  wl-orchestrator is never closed").
- Closing is refused while any slice is `open` or `paused` or any question is `open` ("cannot
  close a workload with open or paused slices or open questions"). A closed workload holds no lane.
- **Lease and reclaim.** The holder changes to a different holder only after a release (holder set
  to NULL) or once `holder_lease_until` is earlier than the database clock ("workload is held
  under a live lease"). The same holder may renew.
- **Mode flip is an instruction.** `mode` changes only if an `instructions` row of kind
  `mode-flip` with the new mode as its body was recorded on this workload at or after the
  workload's last change ("a mode flip needs a mode-flip instruction").
- **A stakes change is an instruction** (version 6). `stakes` changes only if an `instructions`
  row of kind `instruction` with body `stakes: <new stakes>` was recorded on this workload at or
  after the workload's last change ("a stakes change needs a "stakes: <stakes>" instruction
  recorded since the last workload change"). The surface records both in one transaction.
- Last activity is derived, not stored: `workload_status.last_activity_at` is the latest
  `provenance.at` for the workload.

### `slices`

| column | meaning |
|---|---|
| `id` | `sl-…` |
| `workload_id` | its workload |
| `task`, `done_condition`, `inputs` | the brief fields that live on the slice (§ B9); never change |
| `state` | `open` \| `paused` \| `done` \| `cancelled` |
| `artifact` | the runtime artifact that closed it (§ B1); set exactly when `done` |

State order ("illegal slice transition" otherwise):

```
open ──► paused   only while a question on this slice is open (the file does it when one is raised)
paused ──► open   only when no question on it is open (the file does it when the last is resolved
                  and no withdrawal on the slice said cancel)
paused ──► cancelled   the file does it when the last question is resolved and any withdrawal on
                  the slice said cancel
open ──► done     with a non-blank artifact
open ──► cancelled, paused ──► cancelled   only when no question on it is open
done, cancelled   final: nothing on a done or cancelled slice changes, its artifact and stamp
                  included (version 6, "a done or cancelled slice is final: nothing on it changes,
                  its artifact included")
```

### `messages` — the four-state queue

| column | meaning |
|---|---|
| `id` | `msg-…` |
| `workload_id`, `slice_id` | where it belongs (slice optional) |
| `sender`, `recipient`, `body` | never change |
| `state` | `held` \| `delivered` \| `consumed` \| `acted-on` |
| `created_at` | the enqueue time |

Born `held` ("message must be enqueued in state held"); then exactly
`held → delivered → consumed → acted-on`, one step at a time, never backwards ("illegal message
transition"). Only `state` and its stamp change ("only state and its stamp change on a message"),
and an `acted-on` message is final: not even its stamp changes (version 6, "an acted-on message is
final: nothing on it changes").
The age of the oldest held message is `now - min(created_at) WHERE state = 'held'`
(index `messages_state_created`).

### `instructions` — Jo's instructions, answers, withdrawals, mode flips

| column | meaning |
|---|---|
| `id` | `in-…` |
| `workload_id`, `slice_id` | where it applies (slice optional) |
| `kind` | `instruction` (§ B5) \| `answer` \| `withdrawal` (§ B3 item 5) \| `mode-flip` (§ B13.1) |
| `question_id` | set exactly for `answer` and `withdrawal` |
| `disposition` | set exactly for `withdrawal`: `cancel` \| `replan`, what happens to the paused slice |
| `channel` | `surface` (through the orchestrator) \| `direct` (Jo in the lane's own session) |
| `author` | the human who gave it |
| `body` | the text; for `mode-flip`, the new mode; for `withdrawal`, the reason |

Append-only ("instructions are append-only"). An answer or withdrawal must name an open question
of the same workload ("answer or withdrawal must name an open question of this workload"). A
withdrawal without a disposition, or any other kind with one, fails its `CHECK`.

### `questions` — lane-raised questions

| column | meaning |
|---|---|
| `id` | `q-…`, stable for life: links the paused slice and the answer |
| `workload_id`, `slice_id` | the slice it pauses (must be `open` or `paused` when raised) |
| `body` | the question |
| `options` | JSON array of at least two strings; a non-string element is refused ("question options must be a JSON array of strings") |
| `state` | `open` \| `answered` \| `withdrawn` |
| `resolved_by` | the `instructions.id` that resolved it; set exactly when not `open` |

Raised `open`; inserting it pauses its slice and only its slice. `open → answered` needs an
`answer` instruction naming it; `open → withdrawn` needs a `withdrawal` instruction naming it
("a question is resolved only by an answer or withdrawal instruction naming it"). Resolved is
final. A withdrawal never counts as an answer.

**Settling the slice.** When the last open question on a paused slice is resolved, the file moves
the slice in the same statement: to `cancelled` if any withdrawal of a question on that slice has
disposition `cancel`, otherwise back to `open` (answers and `replan` withdrawals). A cancel given
while another question on the slice is still open is deferred, not lost: answering the other
question later cancels the slice. Module: `withdrawQuestion(..., then: "cancel" | "replan")`.

### `routings` — one row per dispatch, written when its outcome is known (version 5)

| column | meaning |
|---|---|
| `id` | `rt-…` |
| `workload_id`, `slice_id` | the dispatch's workload and slice (slice required, and must belong to the workload) |
| `spawn_key` | the key the spawn event carried (the requested name for a blocking spawn, the allocated agent id for an async one), else NULL; never blank |
| `session_root` | the lane's session root: its session file without `.jsonl`, the directory its hands' session files are in (version 5); never blank |
| `agent_id` | the agent id OMP finally allocated to the hand, so the hand is `<session_root>/<agent_id>.jsonl` (version 5). NULL exactly when `outcome` is `refused-no-usable-model` (checked); one row per `session_root` and `agent_id` (checked) |
| `kind` | the classifier's answer: `locate` \| `understand` \| `change-small` \| `change-large` \| `judge` |
| `confidence` | the judge's confidence, 0 to 1 |
| `probabilities` | JSON: the judge's per-kind probabilities |
| `classified_tier` | the tier the kind maps to: `fast` \| `standard` \| `strong` \| `deep` |
| `pull_up_to` | NULL, or the tier a low confidence pulled up to (`standard` \| `strong` \| `deep`); from = `classified_tier` |
| `stakes` | the brief's stakes, or NULL when it had none |
| `pull_down_to` | NULL, or the tier the stakes cap pulled down to (`fast` \| `standard` \| `strong`); from = `coalesce(pull_up_to, classified_tier)` |
| `tier` | the tier dispatched |
| `models` | JSON array of non-blank model names (every entry a non-blank string, checked): the tier-row candidates usable at spawn, in row order; empty exactly when `outcome` is `refused-no-usable-model` (checked) |
| `model` | the first entry of `models` (checked), NULL when it is empty: the spawn-time selection |
| `judge_model` | the model that classified |
| `outcome` | what happened (version 4): `ran` (every model that answered was on the tier row) \| `refused-out-of-row` (one was not; the hand's output was withheld from the lane) \| `refused-no-usable-model` (the spawn was refused; nothing ran) \| `refused-model-unknown` (no answering model could be read; the output was withheld) |
| `ran_models` | JSON array, non-empty, of distinct non-blank model names (every entry a string, none blank, none repeated; checked): every model that answered, first-seen order (version 4). Present exactly when `outcome` is `ran` or `refused-out-of-row` (checked) — a refusal row keeps the off-row model that answered |

"Blank" means empty after trimming whitespace: spaces, tabs, newlines, and the other characters
JavaScript's `String#trim` removes (no-break space, the Unicode space separators, BOM). The file
spells the same set out in its trigger, because SQLite's one-argument `trim()` removes spaces only
(version 5, astra review 4 N1).

Append-only ("routings are append-only"); never deleted or replaced. Needs an open workload and a
slice of that workload ("no open workload with that id, or the slice belongs to another
workload"). Either model list holding anything but non-blank strings, or `ran_models` naming a
model twice, is refused ("routing models and ran_models must be JSON arrays of distinct non-blank
model names"). A second row for one `session_root` and `agent_id` is refused ("a hand has one
routing row: that session root already has a row for that agent id"). Provenance detail: `<kind> <classified_tier>[ up <pull_up_to>][ down <pull_down_to>] -> <tier> <model or "(no usable model)">: <outcome>[ on <ran_models, comma-separated>]`.
Module: `recordRouting({ workloadId, sliceId, spawnKey?, sessionRoot, agentId?, kind, confidence, probabilities,
classifiedTier, pullUpTo?, stakes?, pullDownTo?, tier, models, judgeModel, outcome, ranModels?, by })` returns the id
(it stores `model = models[0]`); `routings(workloadId)` reads them oldest first, and
`routingsForHand(sessionRoot, agentId)` reads the row for exactly one hand. The classifier (M3)
writes the row once per dispatch: at a refused spawn, or where the hand's output first reaches the
lane. When a delivery reaches a classifier instance that did not settle it, the classifier reads
back the one row for exactly that session root and allocated agent id, and takes the slice from
the row; a hand with no such row is withheld. So a refusal outlives the process that made it, and
one lane's row never authorizes another lane's hand.

### `entries` — lane-written entries (version 3)

| column | meaning |
|---|---|
| `id` | `en-…` |
| `workload_id`, `slice_id` | where it applies (slice optional; when set, must belong to the workload) |
| `kind` | `wake-read` (P-11 row 7) \| `mode-effective` (mode row) \| `assumption` (question row) \| `reserved-request` (row 6, raised to Jo) |
| `body` | the text |

A lane's own record, not Jo's words, so kept apart from `instructions`. Append-only ("entries are
append-only"); never deleted or replaced; needs an open workload. Provenance detail: the kind.
Module: `recordEntry({ workloadId, sliceId?, kind, body, by })` returns the id;
`entries(workloadId, kind?)` reads them oldest first. Both are in the gates' ledger port, the
`GateLedger` type in `gates/src/types.ts` (a `Pick` of `Ledger`).

### `provenance` — the log

| column | meaning |
|---|---|
| `seq` | order of writes |
| `at` | time of the write (the row's `created_at` or `changed_at`) |
| `workload_id` | workload the write belongs to |
| `lane_instance` | who wrote (the row's `created_by` or `changed_by`) |
| `tbl`, `row_id` | what was written |
| `action` | `insert` \| `update` |
| `detail` | e.g. `held->delivered`, `status open->closed holder lane-1->-`, `withdrawal q-… then cancel` |

### View `workload_status`

Every `workloads` column plus `last_activity_at`, `open_slices`, `paused_slices`,
`open_questions`, `held_messages`, `oldest_held_at`.

## The two named queries

**What is in flight** (wake, § B7): every open workload, with its `open` and `paused` slices, every
`open` question (all of them, not a last-N window, § B3 item 5), and every message not yet
`acted-on`. Module: `Ledger#inFlight()`. Plain SQL starting point:

```sql
SELECT * FROM workload_status WHERE status = 'open' ORDER BY created_at;
```

**Oldest held message age** (§ B3): module `Ledger#oldestHeld(at?, workloadId?)`.

```sql
SELECT id, workload_id, created_at AS enqueued_at,
       round((julianday(strftime('%Y-%m-%dT%H:%M:%fZ','now')) - julianday(created_at)) * 86400.0, 3) AS age_seconds
  FROM messages WHERE state = 'held' ORDER BY created_at, id LIMIT 1;
```

## Connections

The module sets, on every connection and in this order: `busy_timeout` (default 5000 ms), then
`foreign_keys = ON`, then `synchronous = FULL` (version 6, ledger audit A1-1: Bun's SQLite and the
macOS `sqlite3` both open at `NORMAL` (1), under which WAL may lose the latest commits on power
loss, though not on a process crash), then `journal_mode = wal`. A foreign tool writing the file
should set `synchronous = FULL` too. Every write runs in `BEGIN IMMEDIATE` and is
retried on `SQLITE_BUSY`, which `BEGIN IMMEDIATE` and `COMMIT` can both return. Opening is covered
by the same retry policy (`busyRetries`, default 5): reading the version, switching to WAL,
initializing a new file, which takes `BEGIN IMMEDIATE` before any schema statement runs and
re-reads the version under the lock, so a file another process initialized first is left alone
and a failed attempt rolls back to an empty file, and upgrading an older one (Versioning). Keep
read transactions short: a long-lived reader stops WAL checkpoints.

## Versioning

`PRAGMA user_version` is the schema version: **6**. `ledger/schema.sql` creates version 6 from an
empty file (`sqlite3 ledger.db < ledger/schema.sql`); it has exactly one `BEGIN;` line and one
`COMMIT;` line, and the module runs the statements between them inside its own `BEGIN
IMMEDIATE`. The installer accepts exactly one manifest `ledger-schema` row, and it must name
`ledger/schema.sql`.

Version 1 was the schema before the M2 review fixes (commits `94f06b9` and `71a576e` both
declared 1, with different rules). Version 2 (commit `477af98`) had no `routings` or `entries`
table, and its `provenance.tbl` CHECK admitted only the first five tables; widening that CHECK is a
schema change, so the two tables are version 3 (commit `de28132`). Version 4 (commits `bd8ef73`,
`1fe1b6e`) adds the dispatch's `outcome` and `ran_models` to `routings` and lets `models` be empty
for a refused spawn. Version 5 adds the hand's `session_root` and `agent_id` to `routings` (one
row per hand), and counts tab-, newline- and other whitespace-only model names as blank (M3 fix
round 5). Version 6 (ledger audit A3-1, A2-3, A2-4) adds five triggers and no column: done and
cancelled slices, acted-on messages and closed workloads are final
(`slices_final`, `messages_acted_on_final`, `workloads_closed_final`); a stakes change needs its
`stakes: <stakes>` instruction (`workloads_stakes_needs_instruction`); `wl-orchestrator` is never
closed (`workloads_standing_never_closes`).

**Upgrade from version 5.** `Ledger.open` (and so `init.ts`, `backup.ts` and the installer)
upgrades a version-5 file in place, in one `BEGIN IMMEDIATE` transaction: it re-reads the version
under the lock, checks the file carries exactly version 5's triggers (Trigger check), creates the
five triggers with schema.sql's own text, sets `user_version = 6`, checks again against version
6, and commits. Any failure rolls back and leaves the file at version 5, unchanged. No row is
written or rewritten; rows a version-5 writer left in a final state are kept as they are. The
upgrade is one-way: the version-5 module refuses a version-6 file ("is not the supported schema
(version 5)"), so every process that writes the ledger runs the version-6 module from then on.
The steps are `MIGRATIONS` in `ledger/src/index.ts`; a later version adds an entry there.

A file at version 1 to 4, or at any version that is neither 6 nor upgraded, is refused before
anything is written to it, and left exactly as found. The refusal names the file and its version:

- "ledger at `<path>` is schema version 4, which predates the supported schema (version 6) and
  every version this module upgrades; the file is refused unchanged: move it aside and install a
  new ledger (ledger/SCHEMA.md, Versioning)" (the same text for versions 1 to 3);
- for any other version: "ledger at `<path>` is schema version `<n>`, which is not the supported
  schema (version 6); the file is refused unchanged (ledger/SCHEMA.md, Versioning)".

`Ledger.open` throws `LedgerSchemaVersionError`; `ledger/scripts/init.ts` and
`ledger/scripts/backup.ts` exit **4**; `install/install.sh` exits **4** and writes nothing. To
proceed, move the old file aside (for example `mv ledger.db ledger.v4.db`) and re-run the
installer, which creates a new version-6 ledger.

### Trigger check

The rules live in triggers, and a missing or rewritten trigger passes `PRAGMA integrity_check` and
`user_version` alike. So every `Ledger.open` compares the file's triggers (name, and the SHA-256 of
each statement's text in `sqlite_master`) with the set schema.sql gives the file's version (for
version 5: version 6's set less the triggers the upgrade adds), and refuses a file whose set
differs, before anything is written and before an upgrade: "ledger at `<path>` (schema version
`<n>`) does not carry the triggers schema.sql gives that version, so the file is refused
unchanged: missing `<a>`; changed `<b>` (sha256 `<12 hex>`, schema.sql `<12 hex>`); not in
schema.sql `<c>` (ledger/SCHEMA.md, Trigger check)". `Ledger.open` throws
`LedgerTriggerDriftError`; `init.ts` exits **5**; `backup.ts` exits **1**. An extra trigger is
refused too: one can drop a write silently (`SELECT RAISE(IGNORE)` in a `BEFORE INSERT ON
provenance` drops the log row and the write goes on). The one exception is for tests that inject a
failure into a file another process then opens: extra triggers named in
`AGENT_SYSTEM_LEDGER_FAULT_TRIGGERS` (comma-separated) are let through. It never excuses a missing
or changed trigger, `ledger-health` still reports the extra, and nothing outside the tests sets it.
To repair a drifted file, restore the newest complete copy,
or recreate the named triggers with schema.sql's text. `surface/scripts/invariants.ts` reports
the same comparison read-only as the `ledger-health` invariant, beside `PRAGMA quick_check` and
`PRAGMA foreign_key_check` on the live file.
