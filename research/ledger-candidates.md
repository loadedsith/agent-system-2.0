# Ledger candidates for P-13 (Phase 5 spec question)

Research hand: `LedgerCandidates`, 2026-09-23. Read-only except this file.
Question: which tool holds the machinery-written ledger P-13 requires
(`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:47`) under P-19's OMP-only rule
(`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:53`).

Labels follow the house output-types contract: **CLAIM** = local file or command inspected
this session; **CITE** = URL fetched this session; **GUESS** = inference; **QUESTION** = needs
Jo. OMP source below is the installed package, version 18.2.11
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/package.json:3`).

## Needs you (top, per the reporting rule)

**QUESTION**
Does P-19 allow a third-party binary as the ledger? P-13 names Beads as a candidate
(`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:47`), while P-19 says every 2.0 mechanism,
memory and message states included, "is built on OMP's own facilities"
(`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:53`). Beads is an external Go binary with
its own Dolt database, so the two rows point different ways.
- *P-19 excludes it*: Beads drops out, and the recommendation below holds with no contest.
- *P-19 allows it*: Beads is the runner-up. It would win only if cross-machine sync of ledger
  **state** were wanted, and P-15 says state does not have to be portable
  (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:49`).
This report was written as if P-19 excludes it. The recommendation is the same either way.

## Bottom line

**Recommendation:** a plain SQLite database owned by one 2.0 OMP extension, opened through
Bun's built-in `bun:sqlite`, kept at a fixed path outside any OMP profile's agent directory.
**Single strongest reason:** it is the only candidate that holds the exact row shape and answers both
required queries (`open AND no lane`, oldest held age) in one SQL statement each, using the same
engine OMP's own subsystems already use. Nothing extra gets installed, and nothing sits outside OMP.
**What would change it:** a live test showing that an OMP extension cannot import `bun:sqlite`;
Jo ruling that the ledger must sync across machines (Beads' `bd dolt push`); or OMP shipping a
documented cross-session storage API for extensions.

## Candidate table

| Tool | What it is | Storage | Queryable from OMP extension? | Holds arbitrary structured rows? | OMP-native? | Install footprint | Receipts |
|---|---|---|---|---|---|---|---|
| **SQLite via `bun:sqlite`, owned by a 2.0 extension** | Embedded SQL DB in the Bun runtime OMP runs on | One `.db` file at a path the extension picks | Yes, in-process (extensions run in-process in Bun). The in-process import itself is untested: **GUESS** | Yes: any schema. Both queries passed a live test | Yes. Same engine as OMP's memory, autoresearch, commit cache | None. Bun 1.3.14 bundles SQLite 3.51.0 | [1][2][3][4][T1][T2] |
| **Beads (`bd`)** | "Distributed graph issue tracker for AI agents, powered by Dolt" | Dolt DB in `.beads/` or `BEADS_DIR` | Only by shelling out (`pi.exec("bd", …)`, `--json`) | Partly. Fixed issue columns plus a free JSON `metadata` field; custom statuses allowed | No. External Go binary. No OMP/pi integration listed | `brew install beads`. Not installed on this machine | [5][6][7][8][9][10][11][12][T3] |
| **OMP memory `local`** | Rollout-summary pipeline plus `learned.md` lessons | SQLite job queue plus markdown files under the profile's memories dir | `ctx.memory.save/status`. Search not available | No. Free-text lessons, capped at 100 | Yes | None | [13][14][15][16][17] |
| **OMP memory `mnemopi`** | Local semantic memory (working/episodic, embeddings, facts) | SQLite per bank under the profile's memories dir | `ctx.memory.search/save` returns text items | No. `save` stores `content` as a `memoryType: "fact"` | Yes (bundled package) | Bundled. Loads embedding model | [13][14][18][19] |
| **OMP memory `hindsight`** | Client for a remote Hindsight server | Remote server bank | `ctx.memory` via the remote API | No. Retain/recall/reflect over free-text memories | Client only. Server is external | Needs a running Hindsight server | [13][20][21] |
| **OMP memory `sharpshooter`** | Friction-gated project decision memory | 3 markdown files plus a JSON delta queue per project bank | Search only. `writable: false` | No. Explicitly "never task state" | Yes | None | [13][22][23][24] |
| **OMP-native task/state facilities** (`todo`, goals, `judge_batch`, async jobs, `appendEntry`) | Per-session or per-process runtime state | Session file entries or in-memory Maps | Some readable (`sessionManager.getBranch()`) | No cross-session store | Yes | None | [25][26][27][28][29] |

## Per-candidate detail

### 1. Plain SQLite owned by a 2.0 OMP extension (recommended)

**What it is and where data lives.**

**CLAIM**
OMP's own subsystems open SQLite through `bun:sqlite`, for example
`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/memories/storage.ts:1`
(`import { Database } from "bun:sqlite"`). The autoresearch subsystem owns a purpose-built
two-table schema with indexes and WAL
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/autoresearch/storage.ts:195-267`),
which is the same pattern a 2.0 ledger extension would follow.

**CLAIM**
The OMP CLI runs on Bun: the first line of
`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/dist/cli.js` is
`#!/usr/bin/env bun`. `bun --version` → `1.3.14`. `bun -e` opening `bun:sqlite` returned
`{"v":"3.51.0"}` with exit 0 (live test T1).

**CITE**
"Extensions run **in-process with no isolation**." The same page states that an extension is "a
TS/JS module exporting a default factory".
https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md (§ Background work, § What an extension is).

**GUESS**
An extension can `import { Database } from "bun:sqlite"` exactly as core does. The basis is a
pattern: in-process, same Bun runtime. It was not tested inside a loaded OMP extension, because
that needs a second file on disk and this assignment allows one write.

**How an extension or hook reads and writes it.** The extension opens the database at load and
writes rows from event handlers (`session_start`, `tool_result`, …) or from registered tools. The
two required queries are one SELECT each.

**CLAIM**
Live test T2: in-memory `bun:sqlite` with a `workload` table and a `message` table.
`SELECT id FROM workload WHERE state="open" AND (lane IS NULL OR lane="")` returned only the
open, laneless row (`[{"id":"w1"}]`). A `MIN(held_at)` over `state="held"` returned
`oldest_held_hours: 5`. Exit 0. The test ran in bare Bun, not inside OMP.

**CLAIM**
Lanes can also *read* such a database with OMP's own `read` tool (`file.db:table`, `?q=SELECT`)
and write rows with the `write` tool (`db.sqlite:table` insert):
`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/prompts/tools/read.md:21`,
`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/prompts/tools/write.md:7`.

**GUESS**
Because the `write` tool can insert rows, a lane could write the ledger directly and bypass the
machinery. If the ledger has to stay machinery-written, the extension's `tool_call` handler
would refuse `write` calls aimed at the ledger path. That is a P-11 mechanical gate, and it is
a design suggestion, not something tested.

**Survives sessions and profiles.**

**CITE**
OMP's documented way to make extension state durable is session-scoped: "Persist with
`pi.appendEntry(...)`" and "Rebuild state from `ctx.sessionManager.getBranch()` on
`session_start`…". https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md
(§ Session and state patterns). That stays inside one session file, so it does not cross
sessions. This is why the ledger needs its own file.

**CLAIM**
The `ExtensionContext` fields have no data-dir or storage member
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:429-472`).
The package does export `getAgentDir`
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/index.ts:10`),
but a named profile "derives its own agent dir"
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-utils/src/dirs.ts:434-444`).

**GUESS**
If the ledger lived under `getAgentDir()`, it would split across OMP profiles. A fixed absolute
path would survive both sessions and profiles. The path choice is a Phase 5 decision; this report
does not pick it.

**Install footprint.** Zero: SQLite ships inside Bun (T1).

**Gap against the Contract row shape.** None in storage terms. SQLite holds every field:
workload name, brief, stakes/ceiling, opened-at, last-activity-at, open/closed, lane, slices
with states, messages with held/delivered/consumed/acted-on timestamps, and provenance columns.

**GUESS**
The real cost is that 2.0 owns the schema, the migrations, and the single-writer discipline,
because nothing ships them. Cross-machine sync would be manual. P-15 says ledger state does not
need to travel, so that sync gap does not fail a requirement.

### 2. Beads (`bd`)

**What it is.**

**CITE**
"Distributed graph issue tracker for AI agents, powered by Dolt." The docs site is
https://beads.gascity.com/. Source: https://raw.githubusercontent.com/steveyegge/beads/main/README.md.

**Where data lives.**

**CITE**
"Embedded (default) — `bd init`. Dolt runs in-process, data lives in `.beads/embeddeddolt/`,
single writer." Also "`BEADS_DIR` tells bd where to put the `.beads/` database directory, bypassing
git repo discovery." Same README, § Storage Modes and § Git-Free Usage.

**GUESS**
One ledger across every repo would mean pointing every lane at a single `BEADS_DIR`. The default
is one database per project.

**Schema or shape.**

**CITE**
An issue has `id, title, description, type, status, priority, labels, created_at, updated_at`,
plus `blocks`/`parent-child`/`discovered-from`/`related` dependencies and hierarchical child IDs
(`bd-a3f8e9.1`). https://beads.gascity.com/core-concepts/issues.md.

**CITE**
"The `metadata` field on issues accepts arbitrary JSON… the preferred extension point for data
that is specific to an integration, orchestrator…" https://beads.gascity.com/core-concepts/metadata.md.

**CITE**
Custom statuses are configurable: `bd config set status.custom "in_review:active,…"`, with
categories `active`/`wip`/`done`/`frozen`. https://beads.gascity.com/cli-reference/statuses.md.

**CITE**
The README lists "Messaging: Message issue type with threading (`--thread`), ephemeral lifecycle".
Same README, § Features.

**Query.**

**CITE**
`bd query` supports `AND/OR/NOT` over the fields `status, priority, type, assignee` ("use
"none" for unassigned"), `created, updated, closed, parent, label`… and `type` includes
`decision`. https://beads.gascity.com/cli-reference/query.md. `metadata` is **not** on that field
list.

**CITE**
`bd sql` runs "a raw SQL query against the underlying database", with the warning "Direct database
access bypasses the storage layer." https://beads.gascity.com/cli-reference/sql.md.

**Provenance.**

**CITE**
The per-issue audit history gives "who changed what, when, with the old and new value". The
events journal gives `seq`, `ts`, `op`, `actor` per mutation, "off by default".
https://beads.gascity.com/reference/events-journal.md.

**How an OMP extension or hook reads and writes it.**

**CLAIM**
The extension API exposes `exec(command, args, options)`
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:1443`).
An extension would run `bd … --json` as a subprocess each time.

**CITE**
The Beads integration list covers Aider, Claude Code, Codex, Cody, Cursor, Factory, Gemini,
Junie, Kilo Code, Kiro, Mux, OpenCode, Windsurf, MCP, Copilot, Azure DevOps. It has no OMP or
pi entry. https://beads.gascity.com/llms.txt.

**CITE**
`bd init` "creates or updates `AGENTS.md` by default… and also installs project Claude/Codex
integrations unless you pass `--skip-agents` or `--stealth`". README § Quick Start.

**GUESS**
In 2.0, Beads would need `--stealth`/`--skip-agents` to keep Claude Code artifacts out of the
repos, which P-19 forbids depending on.

**Survives sessions and profiles.**

**GUESS**
Yes. The database sits in `.beads/` or `BEADS_DIR`, outside any OMP agent directory, so it does
not depend on a session or a profile. The basis is the README storage passage above.

**Install footprint.**

**CITE**
`brew install beads` gives the embedded-capable build; `go install` with CGO off is
"Server-mode only". https://beads.gascity.com/getting-started/installation.md.

**CLAIM**
`which bd dolt` printed nothing and exited 1 (T3): neither is installed here.

**Gap against the Contract row shape.**
- **GUESS**: workload → epic issue, brief → `description`, opened/last-activity →
  `created_at`/`updated_at`, open/closed → `status`, lane → `assignee`
  (`bd query "status=open AND assignee=none"` answers the first query), slices → child issues.
  This is a mapping inferred from the fields above. It has not been tested.
- **GUESS**: stakes/ceiling have to go in `metadata`, which `bd query` cannot filter.
  Filtering on them would need `bd sql`, which the docs say bypasses the storage layer.
- **GUESS**: message queue states → message-type issues with custom statuses `held`,
  `delivered`, `consumed`, `acted_on`. No doc fetched this session says whether `bd query`
  accepts a custom status value; its field list names only the built-in statuses. Per-state
  timestamps (`delivered_at`, `consumed_at`) are not native fields, so they would live in the
  audit history or in `metadata`. Oldest held age would need `bd sql`.
- **GUESS**: lane-instance id as provenance → the `actor` field. The source `actor` resolves
  from was not fetched.

### 3. OMP native memory backends: `local`, `mnemopi`, `hindsight`, `sharpshooter`

**Shared facts.**

**CLAIM**
"Backends are mutually exclusive — `await resolveMemoryBackend(settings)` returns exactly one"
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/memory-backend/types.ts:4-5`).
The ids are `"off" | "local" | "hindsight" | "mnemopi" | "sharpshooter"` (`…/memory-backend/types.ts:16`).
The extension-facing surface is `ctx.memory` with `status/search/save`
(`…/extensibility/extensions/types.ts:471-472`, `…/memory-backend/runtime.ts`).

**CLAIM**
The save input is `{ content: string; context?; source?; importance? }` (`…/memory-backend/types.ts:58-63`).
Search returns items of `{ id?, content, source?, timestamp?, score? }` (`…/memory-backend/types.ts:42-48`).
Every write is a free-text string, and every read is ranked text.

**CLAIM**
The memories root is `dirs.agentSubdir(agentDir, "memories", "state")`
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-utils/src/dirs.ts:925-926`), and
`agentDir` is per profile (`…/pi-utils/src/dirs.ts:434-444`). The three local backends
therefore do not cross profiles.

**CLAIM**
The default profile's `/Users/jowolff/.omp/agent/config.yml` has no `memory` key. A grep for
`^\s*(memory|backend|memories|autolearn)` found nothing.

**CITE**
"Memory is disabled by default." https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/memory.md.

**GUESS**
Using any of these four as the ledger would take the one memory slot away from memory, because
only one backend can be active at a time.

**`local`.**

**CLAIM**
`status` reports `searchable: false`, with the message "Structured search is not available"
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/memory-backend/local-backend.ts:42-44`).

**CLAIM**
`learned.md` keeps at most 100 lessons (`…/memories/index.ts:1306`). The SQLite side has
`threads`, `stage1_outputs`, `jobs`. These are the extraction pipeline's own tables, not user rows
(`…/memories/storage.ts:75-107`).

**CITE**
"Lessons are newest-first, deduplicated, secret-redacted, capped at 100 entries."
https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/memory.md.

**Gap:** the backend stores prose only, has no query, and has no fields.

**`mnemopi`.**

**CLAIM**
`save` calls `rememberScoped(content, { …, memoryType: "fact" })`
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/mnemopi/backend.ts:296-322`).
The package's tables are memory stores such as `working_memory` and `episodic_memory` with a
`content TEXT` column and FTS5 indexes
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-mnemopi/src/core/beam/schema.ts:26-142`).

**Gap:** the backend offers semantic recall over text, not a table of workloads, slices, and
message states.

**GUESS**
An extension could open `mnemopi.db` and add its own tables. That would couple 2.0 to a bundled
package's private schema, which is worse than owning a separate file.

**`hindsight`.**

**CITE**
"Hindsight requires a reachable Hindsight server. The default endpoint is `http://localhost:8888`."
The tools it exposes are `recall`, `retain`, `reflect`.
https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/memory.md.

**CLAIM**
The backend counts as configured only when `hindsightApiUrl` is a non-empty string
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/hindsight/config.ts:147`,
`:189-190`).

**Gap:** it needs an external service, and its memories are free text.

**`sharpshooter`.**

**CLAIM**
The delta `statement` field is documented as "Timeless normative statement; never task state,
paths, or symbols"
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/sharpshooter/types.ts:43`).
The output is three markdown files, `architecture.md`, `product.md`, `style.md` (`…/sharpshooter/types.ts:60`).
`status` reports `writable: false` (`…/sharpshooter/backend.ts:157`).

**Gap:** by its own design, sharpshooter excludes task state.

**Verdict on item 3:** all four are key-value or free-text memory, not a ledger. None of them can
answer `open AND no lane`.

### 4. OMP-native task and state facilities that could be reused

**CLAIM**
`todo`: phases persist "via their toolResult entry" on the **session branch**
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/tools/index.ts:441-443`).
Todo state therefore lives inside one session.

**CLAIM**
Goals: `GoalModeState` is an in-session runtime type with no store
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/goals/state.ts`).

**CLAIM**
`judge_batch`: batches sit in a module-level `new Map<string, JudgmentBatch>()`, resolved by
owner session (`…/eval/judgment-batch-bridge.ts:465-470`). They are process-memory only.

**CLAIM**
Async job manager: settled rows are kept for `DEFAULT_RETENTION_MS = 5 * 60 * 1000`
(`…/async/job-manager.ts:9`). That is in-memory with a 5-minute retention window.

**CLAIM**
The persisted-agents registry rebuilds agent metadata by streaming session files
(`…/registry/persisted-agents.ts:8`, `visitEntriesFromFileStream`). It is a read-side view, not a
writable store.

**CITE**
Extension custom entries (`pi.appendEntry`) are rebuilt "from `ctx.sessionManager.getBranch()`",
so they are session-scoped. https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md.

**CLAIM**
OMP-owned SQLite files such as `agent-storage` (`model_usage`, `settings`, `meta` key/value;
`…/session/agent-storage.ts:209-235`) and autoresearch are purpose-specific.

**GUESS**
Writing ledger rows into an OMP-owned file would couple 2.0 to OMP internals that can change
under any `omp update`.

**Verdict on item 4:** OMP ships no cross-session, cross-profile task or ledger store an
extension could reuse. The closest precedent is autoresearch's own-file SQLite, and that is the
pattern recommended above.

## What was not found

**CLAIM**
No documented storage API, data directory, or key-value store for extensions was found in
`ExtensionContext` (`…/extensibility/extensions/types.ts:429-472`) or in
https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md. The only durable
pattern the docs name is session-scoped `appendEntry`.

**CITE**
No Beads integration for OMP or pi exists in the docs index (https://beads.gascity.com/llms.txt).

**GUESS**
No page read this session says whether `bd query` filters on custom status values. Nothing read
says how Beads resolves `actor` for provenance.

**GUESS**
It was not tested whether a loaded OMP extension can import `bun:sqlite`. The next step is a
throwaway extension under a 2.0 profile that opens an in-memory database on `session_start`.

**CLAIM**
The first fetch of the OMP extensions doc, under `packages/coding-agent/docs/extensions.md`,
returned HTTP 404. The docs live at the repo root `docs/`, and the second fetch succeeded.

## URLs and files fetched

Numbered receipts used in the table.

| # | Source | Opened? |
|---|---|---|
| 1 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/memories/storage.ts:1-143` | yes |
| 2 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/autoresearch/storage.ts:180-275` | yes |
| 3 | https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md | yes (fetched; state section and in-process line read) |
| 4 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:425-480, 1425-1445` | yes |
| 5 | https://raw.githubusercontent.com/steveyegge/beads/main/README.md | yes |
| 6 | https://beads.gascity.com/llms.txt | yes |
| 7 | https://beads.gascity.com/core-concepts/issues.md | yes |
| 8 | https://beads.gascity.com/core-concepts/metadata.md | yes |
| 9 | https://beads.gascity.com/cli-reference/query.md | yes |
| 10 | https://beads.gascity.com/cli-reference/sql.md | yes |
| 11 | https://beads.gascity.com/cli-reference/statuses.md | yes |
| 12 | https://beads.gascity.com/getting-started/installation.md (lines 1-300 of 562) and https://beads.gascity.com/reference/events-journal.md (lines 1-300 of 491) | yes, partially (see Coverage) |
| 13 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/memory-backend/types.ts`, `resolve.ts`, `runtime.ts` | yes, in full |
| 14 | https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/memory.md | yes |
| 15 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/memory-backend/local-backend.ts` | yes |
| 16 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/memories/index.ts` (grep hits 202-1417) | grep only |
| 17 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-utils/src/dirs.ts:429-448, 924-927` | yes |
| 18 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/mnemopi/backend.ts:289-343` | yes |
| 19 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-mnemopi/src/core/beam/schema.ts` (grep of CREATE TABLE) | grep only |
| 20 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/hindsight/config.ts` (grep) | grep only |
| 21 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/hindsight/backend.ts:1-63` | yes |
| 22 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/sharpshooter/types.ts` | yes, in full |
| 23 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/sharpshooter/paths.ts` | yes, in full |
| 24 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/sharpshooter/backend.ts` (grep 147-228) | grep only |
| 25 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/tools/index.ts:440-444` | grep hit |
| 26 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/goals/state.ts` | yes, in full |
| 27 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/eval/judgment-batch-bridge.ts` (grep 1-540) | grep only |
| 28 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/async/job-manager.ts:1-63` | yes |
| 29 | `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/registry/persisted-agents.ts:1-83` | yes |
| — | https://api.github.com/repos/can1357/oh-my-pi/contents/docs (listing used to locate docs) | yes |
| — | https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/docs/extensions.md | **404**, did not cost the answer |
| — | `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:39-58`, `RESEARCH.md` and `PREFERENCES.md` (grep for P-13/Beads), `research/phase4/research-C-yegge.md` and `research-F-memory-system.md` (grep) | yes / grep |

Live tests run this session:
- **T1**: `bun --version` → `1.3.14`; `bun -e` opening `bun:sqlite` in memory → `{"v":"3.51.0"}`, exit 0.
- **T2**: `bun -e` in-memory ledger with `workload` and `message` tables. The `open AND no lane`
  query returned `[{"id":"w1"}]`; the oldest-held query returned `[{"workload_id":"w1","oldest_held_hours":5}]`. Exit 0.
- **T3**: `which bd dolt` → no output, exit 1.

## Coverage

| Source area | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| Beads | README, llms.txt, 7 docs pages | README, llms.txt, issues, metadata, query, sql, statuses in full; installation and events-journal first 300 lines each | none | yes for fit against the row shape. Not read: `bd set-state`, `bd mail`, the configuration page, and how `actor` resolves. Those would decide the message-state mapping if P-19 lets Beads back in |
| OMP memory backends | 4 backend dirs, the memory-backend module, docs/memory.md | types/resolve/runtime/local-backend in full; sharpshooter types/paths in full; mnemopi, hindsight, sharpshooter backends in part | none | yes. Every backend's write surface is the same free-text `save` |
| OMP extension storage | extensions.md, types.ts, pi-utils dirs.ts, index.ts | the relevant sections | first extensions.md URL 404, then correct URL fetched | yes, with one untested step (extension import of `bun:sqlite`) |
| OMP-native task/state | todo, goals, judge_batch, job-manager, persisted-agents, autoresearch, agent-storage | the relevant sections or grep hits | none | yes. Each is session- or process-scoped, or purpose-specific |

**CLAIM**
Retrieved but not opened: the `docs/` listing's `hooks.md`, `session.md` (the `custom` entry
reference), `mnemosyne-memory-backend.md`, and `environment-variables.md`; the remaining 262 lines
of the Beads installation page and 191 lines of the events-journal page; the Beads integration
pages listed in llms.txt. None of them was needed for the recommendation.
`hooks.md` would matter if the ledger has to be read from an OMP hook rather than an extension.
