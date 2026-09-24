# Ledger candidates, third-party widening (P-13, Phase 5)

Research hand: `LedgerThirdParty`, 2026-09-23. Read-only except this file. Extends
`/Users/jowolff/code/agent-system-2.0/research/ledger-candidates.md` (which covered Beads at
survey depth, the four OMP memory backends, OMP-native state, and plain SQLite via `bun:sqlite`)
and does not repeat it.

Labels follow the house output-types contract: **CLAIM** = local file or command inspected this
session; **CITE** = URL fetched this session (numbered `U#`, listed under *URLs fetched*);
**GUESS(basis)** = inference, pattern, or recall; **QUESTION** = needs Jo. Web-search result
summaries were used only to find repos; none of them is cited as a source.

**PMDW**
Two constraints arrived with the brief and are applied throughout. First, Jo ruled 2026-09-23
that third-party tools are eligible (the brief's statement, not re-verified here). Second, a
mid-task constraint relayed by Main: *the ledger must not be locked into OMP* — Jo's words,
relayed: "some day my colleagues might [use this], and i don't necessarily want something as
important as the ledger locked into omp." Every candidate row below is judged on three added
axes: (a) can a non-OMP client (CLI, another harness, a human) read and write it without OMP
running; (b) multi-user / multi-machine story; (c) is the data format open.

## Needs you (top, per the reporting rule)

**QUESTION**
The no-lock-in constraint collides with P-19 as written. P-19 says every 2.0 mechanism,
"memory and message states" included, "is built on OMP's own facilities"
(`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:53`). The relayed constraint says the
ledger must not be locked into OMP. P-15 also says "State and specific lanes need not be"
portable (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:49`), while colleagues using
the ledger implies state that other people and machines reach. The pending call has two options:
- *The ledger is OMP-written but OMP-independent* — the writer runs inside an OMP extension,
  while the schema is documented and a small standalone CLI can also read and write it. This
  keeps P-19 for the mechanism and satisfies the relayed constraint for the data. This report
  proceeds under this reading.
- *The ledger is a third-party system OMP merely talks to* — Beads (or clu, below) owns the
  data and its CLI is the contract; the OMP extension becomes one client. This amends P-19
  for the ledger.
Either answer changes P-19 or P-15 wording; neither changes the recommendation below today.

**GUESS(inference)**
Blocker-class caveat on Beads: a third-party project states the Go Beads "is no longer actively
maintained" and replaces `bd` with a Rust reimplementation (`br`) during its install
(U21, § "Important: Beads Rust (br) Replaces Beads Go (bd)"). Beads' own docs show activity
through August 2026 — the JSON contract page is "Last reviewed: 2026-08-07" (U6) and the Dolt
page discusses Dolt 2.3.0 "released 2026-08-13" (U3). The two sources disagree; nothing fetched
this session settles which is right. It matters only if Beads is chosen.

## Bottom line

**GUESS(inference)**
**No third-party candidate beats plain SQLite for this row shape and these queries.** The
recommendation stands, reshaped by the no-lock-in constraint: **one SQLite file with a
documented schema in the portable repo, written by a runtime-neutral TypeScript ledger module
that the OMP extension imports and that a standalone `bun` CLI also exposes.** The extension is
then one client, not the only writer.

**Deciding property:** the ledger's defining rows — a message queue with four timed states
(held → delivered → consumed → acted-on), slices with states, stakes/ceiling, and
(workload, lane-instance id, time) provenance — are first-class columns only in a schema 2.0
owns. Every third-party tool examined models *issues*; its message support is either absent,
a TTL-expiring unread flag (clu, U16), read/ack only (mcp_agent_mail, U21), or custom statuses
plus free JSON that its own query language cannot filter (Beads, U4, and `bd query` per the
earlier report). And none of the tools with a real multi-machine story (Beads, Grite, git-bug)
can be written in-process from Bun without its binary. The basis is the per-candidate receipts
below. The judgement that this outweighs their sync features is a GUESS, not a measurement.

**What plain SQLite does and does not satisfy under the no-lock-in rule:**

**CITE**
The file format is open: SQLite is a US Library of Congress "Recommended Storage Format for
datasets" (U27).

**CLAIM**
A non-OMP client exists on this machine: `sqlite3 --version` → `3.50.6 2025-09-22`, found at
`/Users/jowolff/Library/Android/sdk/platform-tools/sqlite3` (command run this session).

**GUESS(inference)**
The format being open does not make the ledger open. The schema, the state-transition rules
(what may move `held` → `delivered`), and the single-writer discipline would live only in the
2.0 extension. A colleague with `sqlite3` could read the rows, but writing them correctly would
need 2.0's code. The ledger is therefore locked to 2.0 unless two things ship with it: a
schema document in the portable repo, and a CLI that runs with `bun` alone, no OMP. Without
both, the claim "not locked into OMP" is false for writes.

**GUESS(inference)**
Plain SQLite's multi-user / multi-machine story is nothing out of the box. The cheapest proven
pattern among the candidates is clu's: SQLite stays the working copy, and a JSONL snapshot is
pushed to a dedicated, non-branch git ref (`refs/clu/store`) and reconciled last-writer-wins on
pull (U15). 2.0 could copy that pattern later without changing the store.

**What would change it:**
- Jo ruling that **live, concurrent multi-user writes across machines** are required now, not
  "some day" → **Beads** becomes the pick. It is the only candidate with a documented
  multi-writer mode (Dolt `sql-server`) plus versioned push/pull (U3, U4, U5). It carries
  the Beads maintenance caveat above and a heavier install.
- A test showing that **Bun's MySQL client talks to `dolt sql-server`** would open a middle
  path. The same ledger module would target SQLite now via `Bun.SQL` and Dolt later, because
  `Bun.SQL` exposes one tagged-template API over SQLite and MySQL (U12) and Dolt is
  "MySQL-compatible" (U13). Untested: **GUESS(inference)**.
- clu gaining **stateful, non-expiring messages and a JSON metadata column** would make it a
  credible drop-in. It is already a plain SQLite file with a published schema and a non-OMP
  CLI (U14, U16).

## Candidate table

**PMDW**
Every cell is a CITE against the receipts column unless it carries an inline GUESS. "Bun
extension r/w" means reading and writing from an OMP extension in-process (Bun/TypeScript)
without shelling out. "Non-OMP r/w" is Jo's axis (a). "Multi-user/machine" is axis (b).
"Open format" is axis (c).

| Tool | What it is | Storage | Bun extension r/w? | Non-OMP r/w? | Holds arbitrary structured rows? | Multi-user / multi-machine | Open format? | Install footprint | Receipts |
|---|---|---|---|---|---|---|---|---|---|
| **Plain SQLite, 2.0-owned (baseline, re-judged)** | Embedded SQL file | One `.db` file | Yes, `bun:sqlite` (earlier report's T1/T2) | Read: any SQLite client. Write: only via 2.0 code unless a schema doc + standalone CLI ship (**GUESS(inference)**) | Yes, any schema | None built in. clu-style git-ref JSONL sync is a known pattern (**GUESS(inference)**) | File format yes (LoC RFS). Schema: only if documented | None (in Bun) | U27, U15, local `sqlite3` |
| **Beads (`bd`)** | "Distributed graph issue tracker for AI agents, powered by Dolt" | Dolt DB: embedded in `.beads/embeddeddolt/` (single writer) or `dolt sql-server` | No in-process path. Options: shell out to `bd --json`; read the `issues.jsonl` export (not source of truth); or run server mode and connect over MySQL (untested, **GUESS(inference)**) | Yes: `bd` CLI, MCP server, many harness integrations | Partly: fixed issue columns + free `metadata` JSON; custom statuses | Strongest: `bd dolt push/pull` via `refs/dolt/data` on the git remote; server mode for concurrent writers; federation | Dolt is MySQL-compatible SQL; issue schema and JSON contract documented | `bd` binary (embeds Dolt); server mode adds a pinned `dolt` (~103 MB) | U1, U3–U9, U11, U13 |
| **clu** | "SQLite-backed issue tracker for coordinating AI coding agents on a single machine" | `.clu/data.sqlite`, plain SQLite, schema in `migrations.go` | Yes, technically: the file is plain SQLite, so `bun:sqlite` can open it (**GUESS(inference)**: not tested). Writing bypasses clu's CLI rules | Yes: `clu` CLI (`--json` everywhere), `clu http` REST, web UI | Partly: fixed columns, labels, global `kv` table; no per-issue JSON field | Single machine by design. Experimental `clu sync` to `refs/clu/store`, LWW at one-second granularity | Yes: SQLite + published DDL; sync snapshot is JSONL | Single pure-Go binary; `go install` | U14, U15, U16 |
| **Grite** | Repo-local, git-backed issue tracker "built for AI agents" | Append-only CBOR event log in `refs/grite/wal`; per-actor `sled` view in `.git/grite/` | No: CBOR WAL + CRDT projection; libraries are Rust crates | Yes: `grite` CLI with `--json`; npm/pip/gem wrappers | Partly: issues, labels, comments, typed links, locks | Strong: `git fetch/push`, CRDT merge, per-actor IDs, optional Ed25519 signing | Documented (WAL format, hash vectors) but binary CBOR in git refs, not human-plain | `grite` + `grite-daemon` binaries; Git ≥ 2.38 | U17 |
| **Backlog.md** | "Markdown-native Task Manager & Kanban visualizer" | One `.md` file per task (frontmatter + body) in `backlog/` | Files are plain text, so read yes; the npm package ships only a launcher + platform binaries, no importable library | Yes: `backlog` CLI (`--json` on reads), MCP server, web UI, hand-editable files | Weak: configurable `statuses`, `priorities`, `projects`; no documented arbitrary fields | Git-tracked files; merge like code; cross-branch state checks | Yes: plain Markdown in git | Bun-compiled binary via npm/brew | U18, U19, U20 |
| **mcp_agent_mail** | "Mail-like coordination layer for coding agents", HTTP-only FastMCP server | SQLite (`storage.sqlite3`, FTS5) + per-project Git repo of Markdown messages | Not in-process; HTTP/MCP to the server, or open its SQLite directly (**GUESS(inference)**) | Yes: MCP tools, Typer CLI, web UI | Messages only: `messages`, `message_recipients(read_ts, ack_ts)`, reservations | One server, reachable over HTTP with a bearer token; Git archive is cloneable | Yes: SQLite + Markdown in Git | Python 3.14 + uv venv; a running server | U21 |
| **git-bug** | "Bug tracker … fully embedded in git" | Operation packs (JSON) as git blobs/commits under `refs/<namespace>/<id>` | No: needs git object access + operation replay; GraphQL API via `git bug webui` | Yes: CLI, TUI, web UI, GraphQL, bridges | No: bug entity (title, comments, labels, status) | Strong: git remotes, Lamport-clock merge, identities | Yes: on-disk format formally specified ("git-bug spec") | Go binary; GPLv3 | U22, U23 |
| **Turso / libSQL** | SQLite-compatible engine with sync | Local SQLite-compatible file + remote primary | Yes: `@libsql/client` / `@tursodatabase/sync` TS clients | Yes: any libSQL/SQLite client for the local file | Yes, any schema | Sync exists but the documented path needs **Turso Cloud** ("assumes that you have an account") | SQLite-compatible file | npm client (native deps); cloud account for sync | U24, U25, U26 |

## Per-candidate detail

### 1. Beads — deep look

**Schema / data model.**

**CITE**
"The database stores five kinds of records: issues…, dependencies…, labels, comments, and
events (the audit trail)." The issue schema lists `id`, `title`, `description`, `design`,
`acceptance_criteria`, `notes`, `status` (`open, in_progress, blocked, deferred, closed,
pinned, hooked`, "extendable via the `status.custom` config key"), `priority` 0–4, `issue_type`
(including `decision` and `message`), `assignee`, `created_at`/`updated_at`, `created_by`,
`closed_at`/`close_reason`, `external_ref`, `metadata` (JSON), `labels`, `dependencies`,
`comments`. Workflow-layer fields include "claim leasing (`lease_expires_at`, `heartbeat_at`)".
"The schema is stable by default: prefer the `metadata` field for integration-, orchestrator-,
or team-specific data before proposing new first-class fields." (U4, § Issue Schema)

**Storage.**

**CITE**
"Beads uses **Dolt** as its sole storage backend." Embedded mode: "Dolt runs in-process,
single-writer, with data at `.beads/embeddeddolt/`". Server mode "connects to a running
`dolt sql-server`" for "Multiple agents writing simultaneously" (U4, U3). SQLite is legacy: "If
upgrading from an older version that used SQLite", and `bd migrate --to-dolt` "was removed in
v0.58.0" (U3). "`.beads/issues.jsonl` is an export for viewers and interchange, not the source
of truth or a backup" (U1, § Storage Modes).

**CLI and API.**

**CITE**
The contract is the CLI's `--json` output, with a `schema_version` envelope that "will become
the default format in v2.0" (U6). The community-tools page says: "Tools should use the `bd` CLI
(`bd list --json`, etc.) to access data. Tools that read the old `.beads/issues.jsonl` format
directly are not compatible with current versions." (U9)

**CITE**
`bd set-state` "Creates an event bead recording the state change (source of truth)", removes
the old `dimension:value` label, and adds the new one, with an optional `--reason` (U7).
`bd mail` "Delegates mail operations to an external mail provider", configured via
`BEADS_MAIL_DELEGATE`, so Beads ships no mail store of its own (U8).

**Can Bun read/write it without the `bd` binary?**

**CITE**
Embedded mode "links the Dolt engine into `bd`" (U3). The only listed TypeScript SDK,
`@herbcaudill/beads-sdk`, "Connects directly to the beads daemon via Unix socket … with JSONL
file fallback", and its `JsonlTransport` parses `.beads/issues.jsonl` (U11). It targets the
`HerbCaudill/beads` repo, not `gastownhall/beads` (U11, first line).

**GUESS(inference)**
In-process access from Bun without `bd` is not available in embedded mode, because the engine
exists only inside the Go binary. The beads-sdk is likely incompatible with current Beads: it
depends on a daemon socket and on the JSONL file, and U9 says JSONL-direct tools do not work
with current versions. The SDK was not installed or run to check.

**CITE**
Server mode listens on a TCP port or a Unix socket (`BEADS_DOLT_SERVER_PORT` default `3307`,
`--server-socket`) (U3). Dolt: "Connect to Dolt just like any MySQL database" (U13). Bun:
"MySQL support is built into `Bun.SQL` … compatible with MySQL 5.7+ and MySQL 8.0+" (U12).

**GUESS(inference)**
In server mode, a Bun extension could therefore read the Beads tables over `Bun.SQL`. This is
untested. Writing that way would bypass `bd`: `bd sql` warns that "Direct database access
bypasses the storage layer" (cited in the earlier report), and one GUI "writes through `bd` to
preserve hook logic and ID assignment" (U9, BeadSpec entry). Direct SQL writes are therefore
unsafe for Beads' own invariants (hash IDs, audit events).

**Sync story.**

**CITE**
"Cross-machine sync uses Dolt remotes: `bd dolt push` / `bd dolt pull`… Dolt stores issue
history under `refs/dolt/data`, separate from source branches." Fresh clones run
`bd bootstrap` (U5). Remotes can also be "DoltHub, S3, GCS, a filesystem path" (U4). Merge is
cell-level (U4, § Why Dolt?). Stated limits: "No real-time collaboration", "Manual sync to
remotes", unsuitable for "Large teams (10+)" (U4, § Trade-offs).

**CITE**
Operational risk, from Beads' own docs: Beads pins Dolt 2.2.0 because 2.3.0 "regressed
`CALL DOLT_RESET('--hard')`" in 3/60 fresh databases, and that failure hits `bd flatten`,
`bd admin compact`, and "the merge-settle path behind `bd dolt pull`" (U3). A schema-version
guard makes an older binary refuse a database migrated by a newer one (U1).

**Non-OMP / multi-user / open format.**

**CITE**
Integrations exist for Claude Code, Codex, Cursor, Gemini, Copilot, OpenCode, Aider, and others,
plus an MCP server "for MCP-only environments" (U2). A community project, BeadBoard, ships "an
embedded execution runtime (bb-pi) built on Pi" (U9).

**GUESS(inference)**
Beads is the strongest candidate on Jo's no-lock-in axis. Colleagues on any harness can use
`bd`, sync rides the git remote they already have, and the format is SQL over Dolt. BeadBoard
being built on Pi suggests a Pi-family extension is feasible, but BeadBoard was not opened.

**Gap against the row shape.**
- **GUESS(inference)**: workload → epic; brief → `description`; stakes/ceiling → `metadata`
  or a `stakes:<tier>` label via `bd set-state`; lane → `assignee` (`bd query` supports
  `assignee=none`, per the earlier report); open/closed → `status`; last-activity →
  `updated_at`; slices → child issues.
- **GUESS(inference)**: message queue → `message`-type issues whose delivery state is a
  `bd set-state <id> delivery=held|delivered|consumed|acted_on` dimension. Each transition
  leaves an event bead, which supplies per-state timestamps and a reason. "Age of oldest held
  message" then needs the time each message entered `held`: a join across event beads, which
  only raw SQL (`bd sql`) could express in one statement. Not tested.
- **GUESS(inference)**: provenance lane-instance id → `created_by` / event `actor`. How
  `actor` resolves was not read (the earlier report flagged the same gap).
- **GUESS(inference)**: recall decisions by workload → `decision`-type issues that are children
  of, or linked to, the workload epic. This fits natively.

### 2. clu

**CITE**
"SQLite-backed issue tracker for coordinating AI coding agents on a single machine … One file:
`.clu/data.sqlite`. Commit `config.yaml`, gitignore the DB." "SQLite via `modernc.org/sqlite` —
no CGo." "Every command takes `--json`." It has named locks and a mailbox:
`clu ping code-reviewer "PR #412 ready"` / `clu inbox`. `clu http` exposes the REST API
standalone. (U14)

**CITE**
The schema is public DDL. `issues(id, title, type, status, priority, assignee, created, updated,
closed, …)` plus later `defer_until`, `description`, `notes`, and `started_at`; also `deps`,
`issue_labels`, `comments`, `kv(key, value)`, `locks`, `active_agents`, and
`events(id, issue_id, actor, kind, payload, ts)`. The mailbox is
`mailbox(id, sender, recipient, body, created, expires NOT NULL, read_at)`, commented
"ephemeral, expires after a TTL … read_at NULL = unread". Lane and assignee were deliberately
collapsed into one column (migration v13). Migrations are versioned by `PRAGMA user_version`.
(U16)

**CITE**
Statuses are `open`, `in_progress`, `closed`, `cancelled` (U14, § Status semantics). Sync is
"Experimental"; the ref carries `state.jsonl` (issues, deps, labels, comments, kv, cron) and
`tombstones.jsonl`; merge is "last-writer-wins by `updated`"; "`updated` is unix *seconds*";
"a bare `git clone` won't carry issues" (U15).

**GUESS(inference)**
clu is the closest off-the-shelf match to the recommended design: a plain SQLite file, a public
schema, a non-OMP CLI, and an optional git-ref sync. It falls short on exactly the rows 2.0
cares most about:
- messages expire and carry only a read flag, not four timed states;
- the mailbox is not in the sync snapshot, because `state.jsonl`'s listed contents omit it;
- no per-issue JSON field exists for stakes/ceiling, which would have to be labels;
- the fixed status set has no custom extension documented.
2.0 adding its own tables to `data.sqlite` would couple 2.0 to clu's migration numbering.

### 3. Grite

**CITE**
"Grite stores issues as an append-only event log inside git refs (`refs/grite/wal`) … CRDT-based
conflict resolution. No servers. No databases." Events are "CBOR-encoded chunks, signed with
Ed25519 if enabled". The materialized view is a per-actor `sled` database under `.git/grite/`.
Crates `libgrite-core`/`libgrite-cli` exist for "Embed grite operations in Rust applications and
agent harnesses". "`grite init` creates `AGENTS.md`." Documented specs include "Git WAL",
"Data Model", and "Hash Vectors … for interoperability". (U17)

**GUESS(inference)**
Grite has a strong multi-machine story and an open, specified format. It has no TypeScript
path, so a Bun extension would shell out to `grite --json` or reimplement CBOR decoding plus CRDT
projection. Its issue model has no message-queue states. `grite init` writing `AGENTS.md` into
repos is the same side effect the earlier report flagged for `bd init`. The project is young,
judged only by the README's own framing; no release history was fetched.

### 4. Backlog.md

**CITE**
"every task is a plain `.md` file in your repo"; "Local-first — no server, no account, no
telemetry"; `backlog init --no-git` for filesystem-only projects; `--json` on `task list`,
`task view`, and `search`, with `--watch` streaming (U18). Config keys `statuses`, `priorities`,
and `projects` are lists; `onStatusChange` runs a shell command on status change (U20).

**CITE**
The npm package's `files` field ships only `scripts/*.cjs`, `README.md`, and `LICENSE`, with
per-platform binaries as `optionalDependencies`, so there is no importable library. Its dev
toolchain is Bun (`"test": "bun test"`, `@types/bun`) (U19).

**GUESS(inference)**
Backlog.md is the most human-legible and colleague-friendly option: Markdown in git, merges like
code. It is the weakest on the required queries. "Open with no lane" and "oldest held message"
would mean parsing every Markdown file's frontmatter, and no documented arbitrary field exists
for stakes, message states, or per-state timestamps. It is a task board, not a ledger.

### 5. mcp_agent_mail

**CITE**
"A mail-like coordination layer for coding agents, exposed as an HTTP-only FastMCP server …
backed by Git (for human-auditable artifacts) and SQLite (for indexing and queries)." The data
model is `messages(id, project_id, sender_id, thread_id, subject, body_md, created_ts,
importance, ack_required, attachments)` and `message_recipients(message_id, agent_id, kind,
read_ts, ack_ts)`. `fetch_inbox` supports `unread_only`; `acknowledge_message` "Sets ack and
read"; overdue-ack views exist (`ACK_TTL_SECONDS` default 1800). Install creates a "Python 3.14
virtual environment". It "Installs **Beads Rust (`br`)** … and creates a `bd` shell alias". (U21)

**GUESS(inference)**
mcp_agent_mail is the only candidate whose message model approaches 2.0's: per-recipient
`read_ts` and `ack_ts` map roughly to delivered/consumed and acted-on, and "held" has no
column. It covers messages only, not workloads or slices. It needs a running Python server,
which is a mandatory service, and its installer rewrites the `bd` alias. Its schema is worth
borrowing: per-recipient state timestamps in a child table. As a tool, it should be avoided.

### 6. git-bug

**CITE**
"fully embedded in git … use your normal git remote to collaborate"; integration "through the
CLI or the GraphQL API"; "The on-disk format is formally specified in the git-bug spec … if you
want to write another implementation or a tool that reads git-bug data directly"; GPLv3 (U22).
Entities are "a series of edit operations" stored as JSON `OperationPack` blobs under
`refs/<namespace>/<id>`, ordered by Lamport clocks, with a reusable entity framework ("make your
own distributed data-structure in git") (U23).

**GUESS(inference)**
git-bug's multi-user, open-format credentials are the most mature of the git-native options.
Its bug entity does not hold the row shape. Its reusable DAG entity framework is Go-only, so a
custom "workload" entity would mean writing Go, not a Bun extension.

### 7. Turso / libSQL

**CITE**
Embedded replicas: "reads run locally … writes are sent to the cloud primary" unless
`offline: true`; "Do not open the local database while the embedded replica is syncing. This can
lead to data corruption." (U24). The newer Turso Sync guide "uses the Turso Cloud to sync the
local Turso databases and assumes that you have an account"; conflicts resolve "last push
wins" (U25).

**GUESS(recall)**
libSQL's server (`sqld`) can be self-hosted, which would remove the cloud dependency. Nothing
fetched this session confirms that for the sync path. The claim is not load-bearing: Turso is
listed only as the "SQLite plus sync" comparator.

**GUESS(inference)**
As a local file, Turso adds nothing over `bun:sqlite`. As sync, the documented path violates the
brief's "no mandatory hosted service" constraint.

## What was not found

**CITE**
No candidate other than Beads documents an OMP or Pi integration. The nearest Pi-family entry is
the community BeadBoard project ("bb-pi built on Pi"), which was listed but not opened (U9).

**GUESS(inference)**
No third-party tool examined models a message queue with more than two recipient states. None
answers "age of oldest held message" as a native query. Every one would need either raw SQL
against its internal tables or a 2.0-side projection.

**GUESS(inference)**
No working TypeScript library for current Beads was found. The one listed SDK targets a daemon
and JSONL transport that current Beads docs describe as incompatible (U9, U11).

**ACTION**
`which sqlite3 bd dolt backlog clu grite git-bug; sqlite3 --version` printed only
`/Users/jowolff/Library/Android/sdk/platform-tools/sqlite3` and `3.50.6 2025-09-22 …`. None of
the six third-party binaries, nor `dolt`, is installed. Read-only; no reversal needed.

**PMDW**
Untested and worth one throwaway test before Phase 5 locks the ledger: (1) `Bun.SQL` MySQL
adapter against a local `dolt sql-server` (auth plugin compatibility is the likely snag — Bun
refuses RSA key retrieval over plain TCP by default, U12); (2) `bun:sqlite` opening a
`.clu/data.sqlite` written by the `clu` binary. Both need installs, which this assignment
forbids.

## URLs fetched

| # | URL | Opened? |
|---|---|---|
| U1 | https://raw.githubusercontent.com/steveyegge/beads/main/README.md | yes, in full |
| U2 | https://beads.gascity.com/llms.txt | yes, in full |
| U3 | https://beads.gascity.com/architecture/dolt.md | lines 1–300 of 929 |
| U4 | https://beads.gascity.com/architecture/index.md | yes, in full |
| U5 | https://beads.gascity.com/core-concepts/sync-concepts.md | yes, in full |
| U6 | https://beads.gascity.com/reference/json-schema.md | yes, in full |
| U7 | https://beads.gascity.com/cli-reference/set-state.md | yes, in full |
| U8 | https://beads.gascity.com/cli-reference/mail.md | yes, in full |
| U9 | https://beads.gascity.com/community-tools.md | yes, in full |
| U10 | https://beads.gascity.com/related-projects.md | yes, in full (one entry, scry; not used) |
| U11 | https://raw.githubusercontent.com/HerbCaudill/beads-sdk/main/README.md | yes, in full |
| U12 | https://bun.com/docs/runtime/sql | lines 1–300 of 1503 |
| U13 | https://raw.githubusercontent.com/dolthub/dolt/main/README.md | lines 1–300 of 854 |
| U14 | https://raw.githubusercontent.com/arjia-labs/clu/main/README.md | yes, in full |
| U15 | https://raw.githubusercontent.com/arjia-labs/clu/main/docs/content/docs/sync.mdx | yes, in full |
| U16 | https://raw.githubusercontent.com/arjia-labs/clu/main/internal/store/migrations.go | yes, in full |
| U17 | https://raw.githubusercontent.com/neul-labs/grite/main/README.md | yes, in full |
| U18 | https://raw.githubusercontent.com/MrLesk/Backlog.md/main/README.md | yes, in full |
| U19 | https://raw.githubusercontent.com/MrLesk/Backlog.md/main/package.json | yes, in full |
| U20 | https://raw.githubusercontent.com/MrLesk/Backlog.md/main/ADVANCED-CONFIG.md | yes, in full |
| U21 | https://raw.githubusercontent.com/Dicklesworthstone/mcp_agent_mail/main/README.md | lines 1–300 read; rest by targeted grep (storage, data model, ack) |
| U22 | https://raw.githubusercontent.com/git-bug/git-bug/master/README.md | yes, in full |
| U23 | https://raw.githubusercontent.com/git-bug/git-bug/master/doc/design/data-model.md | yes, in full |
| U24 | https://docs.turso.tech/features/embedded-replicas/introduction | yes, in full |
| U25 | https://docs.turso.tech/sync/usage | lines 1–300 of 339 |
| U26 | https://raw.githubusercontent.com/tursodatabase/libsql-client-ts/main/README.md → packages/libsql-client/README.md | yes (root file is a pointer) |
| U27 | https://www.sqlite.org/locrsf.html | yes, in full |

Local files read this session: `/Users/jowolff/code/agent-system-2.0/research/ledger-candidates.md`
(in full), `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md` (grep of P-13–P-19). Web
searches: three (agent-native trackers; Backlog.md; agent mail). One `ctx search` for prior
sessions returned a 2026-09-10 note that the Beads repo once described itself as "a memory
upgrade for your coding agent". The current README (U1) says "Distributed graph issue tracker
for AI agents". Not used further.

## Coverage

| Subject | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| Beads (deep) | 11 URLs (U1–U11) | 10 in full, Dolt guide first 300 of 929 lines | none | yes for storage, schema, API, sync, and the Bun-access question. Would read next: rest of U3 (shared-server mode, backups), `bd sql`'s table list, how `actor` resolves |
| Bun/Dolt bridge | U12, U13 | first 300 lines each | none | yes to state the path exists on paper; not tested (needs installs) |
| clu | U14–U16 | all in full | none | yes |
| Grite | U17 | in full | none | partly: README only. Would read next: `docs/git-wal.md`, `docs/comparison.md` |
| Backlog.md | U18–U20 | all in full | none | yes for fit; no task-file example opened |
| mcp_agent_mail | U21 | lines 1–300 + grep of the rest | none | yes for the message data model |
| git-bug | U22, U23 | both in full | none | yes; the formal spec repo was not opened |
| Turso/libSQL | U24–U26 | in full except U25's last 39 lines | U26 root README was only a pointer; followed it | yes; self-hosted `sqld` sync not checked (recall only, not load-bearing) |
| SQLite openness | U27, local `sqlite3` | in full | none | yes |

**CLAIM**
Seen in search results or listings but never opened: Beans (`henriquebastos/beans`), `ticket`
(`wedow/ticket`), Trekker (`obsfx/trekker`), `agent-inbox`, `agent-comms`, `beads_rust`,
`beads-rs`, `beads-mem`, the radial.build "issue tracker for AI agents" post, BeadBoard, scry,
Backlog.md `MANIFESTO.md`, the git-bug spec repo, Grite's `docs/*.md`, Turso's `llms.txt`, and
the remainder of U3, U12, U13, U21, and U25. Beans (SQLite plus a git-committable JSONL
journal, per a search summary only) is the one most likely to matter; it was cut to hold the
six-candidate cap, and its pattern is already represented by clu's sync.

<!-- output-types
tier: 0
CLAIM: 2
CITE: 30
GUESS: 25 (inference 24, pattern 0, recall 1)
ACTION: 1
PMDW: 3
QUESTION: 1
-->
