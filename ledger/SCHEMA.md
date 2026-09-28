# Ledger schema, version 1

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
    them to iCloud;
  - any path whose mount is not local: on macOS, the mount entry for the path's mount point
    (from `df -P` then `/sbin/mount`) must carry the `local` flag; on Linux, the `/proc/mounts`
    filesystem type must not be a network type (`nfs`, `cifs`, `smbfs`, `sshfs`, and the rest
    listed in `locality.ts`). A mount that cannot be determined is refused too.
- Copying: never `cp` a WAL database; it loses what is still in the `-wal` file. Take a copy with
  `VACUUM INTO '<path>'` (the module's `backup()`), or `sqlite3 ledger.db ".backup '<path>'"`.

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

**Existence without foreign keys.** `foreign_keys` is a per-connection setting and the `sqlite3`
CLI runs with it off. So the file also checks by trigger that a child row names an **open**
workload, and that a named slice or question belongs to that same workload.

**What the file does not check.** It cannot know *who* is really writing: `changed_by` is whatever
the writer claims. Refusing raw writes to this file from agents is the P-11 raw-write gate
(`DESIGN-2.0.md` mechanical-rule list), built at migration step M4 as an OMP extension hook
matching the path in `AGENT_SYSTEM_LEDGER_DB` or the default above.

## Tables

Ids carry a type prefix (checked): `wl-`, `sl-`, `msg-`, `q-`, `in-`. The module generates
`<prefix>-<milliseconds since epoch, base36><6 random base36 chars>`, which sorts by creation
time; any other writer may choose any id with the right prefix.

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
- `open → closed`, once; a closed workload stays closed ("illegal workload transition").
- Closing is refused while any slice is `open` or `paused` or any question is `open` ("cannot
  close a workload with open or paused slices or open questions"). A closed workload holds no lane.
- **Lease and reclaim.** The holder changes to a different holder only after a release (holder set
  to NULL) or once `holder_lease_until` is earlier than the database clock ("workload is held
  under a live lease"). The same holder may renew.
- **Mode flip is an instruction.** `mode` changes only if an `instructions` row of kind
  `mode-flip` with the new mode as its body was recorded on this workload at or after the
  workload's last change ("a mode flip needs a mode-flip instruction").
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
paused ──► open   only when no question on it is open (the file does it when the last is answered)
open ──► done     with a non-blank artifact
open ──► cancelled, paused ──► cancelled   only when no question on it is open
done, cancelled   final
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
transition"). Only `state` and its stamp change ("only state and its stamp change on a message").
The age of the oldest held message is `now - min(created_at) WHERE state = 'held'`
(index `messages_state_created`).

### `instructions` — Jo's instructions, answers, withdrawals, mode flips

| column | meaning |
|---|---|
| `id` | `in-…` |
| `workload_id`, `slice_id` | where it applies (slice optional) |
| `kind` | `instruction` (§ B5) \| `answer` \| `withdrawal` (§ B3 item 5) \| `mode-flip` (§ B13.1) |
| `question_id` | set exactly for `answer` and `withdrawal` |
| `channel` | `surface` (through the orchestrator) \| `direct` (Jo in the lane's own session) |
| `author` | the human who gave it |
| `body` | the text; for `mode-flip`, the new mode |

Append-only ("instructions are append-only"). An answer or withdrawal must name an open question
of the same workload ("answer or withdrawal must name an open question of this workload").

### `questions` — lane-raised questions

| column | meaning |
|---|---|
| `id` | `q-…`, stable for life: links the paused slice and the answer |
| `workload_id`, `slice_id` | the slice it pauses (must be `open` or `paused` when raised) |
| `body` | the question |
| `options` | JSON array of at least two option strings |
| `state` | `open` \| `answered` \| `withdrawn` |
| `resolved_by` | the `instructions.id` that resolved it; set exactly when not `open` |

Raised `open`; inserting it pauses its slice and only its slice. `open → answered` needs an
`answer` instruction naming it; `open → withdrawn` needs a `withdrawal` instruction naming it
("a question is resolved only by an answer or withdrawal instruction naming it"). Resolved is
final. An answer resumes the slice once no other question on it is open. A withdrawal never counts
as an answer; it leaves the slice paused for the writer to cancel or replan
(`withdrawQuestion(..., then: "cancel" | "replan")` in the module).

### `provenance` — the log

| column | meaning |
|---|---|
| `seq` | order of writes |
| `at` | time of the write (the row's `created_at` or `changed_at`) |
| `workload_id` | workload the write belongs to |
| `lane_instance` | who wrote (the row's `created_by` or `changed_by`) |
| `tbl`, `row_id` | what was written |
| `action` | `insert` \| `update` |
| `detail` | e.g. `held->delivered`, `status open->closed holder lane-1->-` |

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
`foreign_keys = ON`, then checks `journal_mode = wal`. Every write runs in `BEGIN IMMEDIATE` and is
retried on `SQLITE_BUSY`, which `BEGIN IMMEDIATE` and `COMMIT` can both return. Keep read
transactions short: a long-lived reader stops WAL checkpoints.

## Versioning

`PRAGMA user_version` is the schema version (1). The module refuses a file with a different
version. `ledger/schema.sql` creates version 1 from an empty file; later versions will ship as
migrations.
