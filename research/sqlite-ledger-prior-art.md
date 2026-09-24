# SQLite as an agent-orchestrator ledger: prior art, sentiment, pain points

**PMDW**
Research for the agent-system 2.0 ledger-choice decision (B2). The question, verbatim from Jo: "have people done this in the past? I bet they have… were people generally happy with the outcome of building sqlite for their ledger? were there pain points?" Our design, per `/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/REPORT.md:44-85`: one WAL file, a message state machine enforced by CHECK plus triggers, one owning module as the writer contract, and several processes claiming work with compare-and-set inside `BEGIN IMMEDIATE`.

## Needs you

**GUESS**
(inference) No blockers. This report is Tier 2: several candidate sources were retrieved as search-result titles and never opened. They are listed in the Coverage table. None of them is likely to reverse the answer. The opened sources already agree with each other on the three main pain points.

**QUESTION**
Should leases and reclaim be part of the B2 decision, or a separate item? Every agent-coordination tool opened here that claims work across processes also built something to reclaim abandoned claims: coord (leases plus a reclaim sweep), hq (heartbeat monitoring), and Beads (claim/lease in its backend core). Our design has no lease primitive. That fact comes from REPORT.md, the parent's source, and is not re-read here. *Fold into B2* means the ledger choice is judged with lease cost included. *Keep separate* means B2 compares engines only and leases get their own task. Recommendation: fold it into B2, because both SQLite options and every alternative pay this cost, so it changes the cost comparison but not which engine wins.

## Answer

**CITE**
Yes, people have done this, and often. Named agent-system instances with an opened primary source:
- Beads v0.x, Steve Yegge's issue tracker for agents: SQLite plus JSONL plus git sync.
- Claude Code's own `__store.db`.
- hq, an MCP coordination server.
- coord, an atomic-claim task queue.
- mcp_agent_mail, agent-to-agent messaging.
- Ultrathink, an AI-run store with an 8-state SQLite work queue.

Sources: https://yegge.ai/essays/gas-town-from-clown-show-to-v10/, https://github.com/anthropics/claude-code/issues/14124, https://github.com/hegner123/hq, https://github.com/DmarshalTU/coord, https://github.com/Dicklesworthstone/mcp_agent_mail/issues/123, https://ultrathink.art/blog/orchestrating-agents-with-claude-code.

**GUESS**
(inference from the sources below) Overall sentiment: positive on one host with low write concurrency ("the orchestration layer hasn't been the bottleneck once", Ultrathink). It sours at three points. The top three pains, most-cited first:
1. `database is locked` from `busy_timeout=0` defaults and from write paths that never got retry logic.
2. Corruption or lost rows when a second writer process, a deploy overlap, or a WAL file on a VM-shared, network, or synced folder breaks the single-host assumption.
3. No history and no cross-machine sync. This is the reason Beads left, and it was the surrounding sync architecture, not the SQLite engine.

## Instances

| Type | Who | What they built | SQLite features used | Outcome / sentiment (quoted) | Pain points (quoted) | Source |
|---|---|---|---|---|---|---|
| CITE | Beads v0.x (Steve Yegge; now gastownhall) | Issue/task ledger for coding agents; SQLite + JSONL export + git sync | WAL; `beginImmediateWithRetry` on one tx path | "the original, janky Beads architecture of SQLite + JSONL + awkward syncing and tons of merge conflicts"; the Gas Town reviewer called beads "genuinely great. tasks survive crashes, context wipes" | "last-write wins semantics with SQLite just taking “whatever” happened to win"; "two sources of truth, race conditions, and tombstone hell"; "Multiple SQLite transaction entry points lack retry logic for `SQLITE_BUSY`" (#1272) | https://yegge.ai/essays/gas-town-from-clown-show-to-v10/ ; https://github.com/gastownhall/beads/issues/1272 ; https://safereddit.com/r/ClaudeCode/comments/1qur3qq/ |
| CITE | Beads 2026 (julianknutsen et al.) | SQLite brought back as an optional backend behind the Dolt-parity seam, merged 2026-07-10 | Claim/lease in its core; history, sync, and federation deliberately missing | "SQLite gives a zero-server, zero-credential, single-file workspace" | "History: not tracked (SQLite backend has no version control; use Dolt for history)"; follow-up WAL hardening PRs #4680/#4681 closed unmerged: "240/240 'database is locked'" at `busy_timeout=0` | https://github.com/gastownhall/beads/pull/4601 ; https://github.com/gastownhall/beads/pull/4680 |
| CITE | Anthropic Claude Code | `~/.claude/__store.db`, a local store shared by parallel subagents | Rollback journal (`journal_mode=delete`), `busy_timeout=0` | Reporter: enabling WAL fixed it at 3 agents | "Parallel subagent execution freezes due to SQLite lock contention"; at 12 agents: "Setting `busy_timeout` via sqlite3 CLI does not persist - it is per-connection." | https://github.com/anthropics/claude-code/issues/14124 |
| CITE | hegner123/hq | MCP "SQLite-backed coordination system" for Claude agents | WAL; "Atomic step claiming"; "Heartbeat monitoring" | Author's own CONS.md accepts single-machine as a "conscious design choice" | "Zero Automated Tests … Race conditions may exist but go undetected"; "Magic Strings Instead of Constants"; "Backup requires stopping writes or using SQLite backup API" | https://github.com/hegner123/hq ; https://raw.githubusercontent.com/hegner123/hq/main/CONS.md |
| CITE | DmarshalTU/coord | Multi-agent task queue with atomic claim | WAL; single `Mutex`-guarded connection; `UPDATE … WHERE id=? AND state='pending'` rowcount CAS; 5-min leases + reclaim sweep | Tested with a "16-process atomic-claim race" and "200 tasks × 8 claimers"; stays "`0.x` until it gets meaningful production use" | "The pre-0.4 in-memory filter silently dropped matches at that scale"; the ack was "a separate (and frequently forgotten) call" | https://github.com/DmarshalTU/coord |
| CITE | Dicklesworthstone/mcp_agent_mail | Agent-to-agent mail and file reservations, SQLite with a Git archive behind it | WAL; `retry_on_db_lock` (on some paths only) | Recovered from the Git archive with `am doctor repair -y` | "database disk image is malformed" after a second server on the same root; "refusing automatic sqlite recovery ... while live WAL/SHM sidecars are present" (#123); "Resource is temporarily busy" (#122); "lost the lock race … continuously for ~30s" (#234) | https://github.com/Dicklesworthstone/mcp_agent_mail/issues/123 |
| CITE | Ultrathink (AI-run e-commerce store) | 8-state `WorkQueueTask` running 10 agent roles; Rails 8 + Solid Queue on SQLite | WAL; Docker volume | "processed over 3,000 tasks across 10 agent roles, and the orchestration layer hasn't been the bottleneck once"; "No message broker. No pub/sub. No event bus. A database table with a status column." | "concurrent deploys risk WAL corruption. We lost two database records"; "we'd use PostgreSQL instead of SQLite"; the Rails post: "We lost two orders to this" during blue-green overlap | https://ultrathink.art/blog/orchestrating-agents-with-claude-code ; https://safereddit.com/r/rails/comments/1sbglu3/sqlite_in_production_on_rails_8_wal_mode/ |
| CITE | OpenCode contributor (u/Arn777333) | Several CLI processes sharing one WAL session store | WAL; better-sqlite3 (synchronous) | Fixed with a shared retry helper: "about 50ms with asynchronous backoff inside a ten second total budget" | "A process held the write lock for longer than five seconds, another hit “database is locked” and an active turn died"; "An earlier change already retried message upserts, but starting a turn, updating session state and settling the turn could still fail" | https://safereddit.com/r/opencodeCLI/comments/1woca02/retrying_a_sqlite_write_without_freezing_the/ |
| CITE | goqite (markusw), HN discussion | Go job queue in SQLite, not agent-specific | `UPDATE`-based claim, same-file transactional enqueue | "nice and low tech" (asa400); "If you want to be able to send to the queue in the same transaction as other state changes, it has to be the same file." (author) | "wishing SQLite had something like Postgres' LISTEN/NOTIFY/SKIP LOCKED"; "not even enforcing foreign keys unless you open the DB in a certain mode" (pdimitar) | https://news.ycombinator.com/item?id=39666467 |
| CITE | Litestream (Ben Johnson), not agent-specific | Streaming WAL replication and backup | WAL, `busy_timeout` | Tips page treats per-connection pragmas as routine setup | "This pragma must be set on each database connection, as it does not persist across connections" (foreign_keys); "Multiple applications replicating into the same bucket & path can cause situations where you will be unable to restore" | https://litestream.io/tips/ |
| CITE | Stephen Margheim (fractaledmind), Rails on SQLite | Rails production tuning guide | IMMEDIATE transactions, `busy_timeout`, WAL | "running SQLite on Rails out-of-the-box isn’t viable today" | Deferred transactions produce `SQLITE_BUSY` under concurrency; the `busy_timeout` backoff penalizes older queries | https://fractaledmind.com/2024/04/15/sqlite-on-rails-the-how-and-why-of-optimal-performance/ |
| CITE | r/sqlite single-worker WAL audit log | Append-only audit ledger | WAL, `synchronous=NORMAL`, `busy_timeout` | "If you keep your disk local (no network attached disk) … I doubt you could ever corrupt an SQLite file" | Advice given: "set syncronous to normal and busy_timeout to 5s" | https://safereddit.com/r/sqlite/comments/1tw2fyu/ |

## Pain-point clusters

### 1. WAL on network, synced, or VM-shared folders

**CITE**
SQLite's own WAL doc: "All processes using a database must be on the same host computer; WAL does not work over a network filesystem." https://www.sqlite.org/wal.html

**CITE**
Beads #920, WSL2 on `/mnt/c/`: "sqlite3: disk I/O error: truncate /mnt/c/.../.beads/beads.db-shm: invalid argument" and "failed to enable WAL mode: sqlite3: locking protocol". Beads #1224 is a stack overflow caused by a WAL locking error on a WSL2 Docker bind mount. https://github.com/gastownhall/beads/issues/920 ; https://github.com/gastownhall/beads/issues/1224

**CITE**
Zotero: "Storing your Zotero data directory in a cloud storage folder (Dropbox, Google Drive, OneDrive, etc) is extremely likely to corrupt your database … The same applies to essentially any database-backed program … cloud storage systems generally don’t honor such locks." https://www.zotero.org/support/kb/data_directory_in_cloud_storage_folder

**CITE**
Ultrathink: "with SQLite on a Docker volume, concurrent deploys risk WAL corruption. We lost two database records learning this." https://ultrathink.art/blog/orchestrating-agents-with-claude-code . A commenter pushes back that this was never root-caused: "WAL mode handles multiple writers by serializing them. It shouldn't cause database corruption or dropped writes. I suspect there is some other bug lurking here." (u/ryeguy, https://safereddit.com/r/rails/comments/1sbglu3/sqlite_in_production_on_rails_8_wal_mode/)

**GUESS**
(inference) The Ultrathink loss is weak evidence against SQLite itself because the cause was never found. It is strong evidence for the operational point: two containers mounting one db file during a deploy is the moment the single-host assumption breaks without anyone noticing.

### 2. Busy and locking errors under concurrency

**CITE**
Beads PR #4680, written against a SQLite backend whose connection string set only `foreign_keys(1)` + `_txlock=immediate`: "a long-lived reader (the gascity controller) plus many short-lived `bd` writer processes — that yields `database is locked` on essentially every write." Measured: "OLD (rollback-journal, busy_timeout=0): 240/240 'database is locked'" and "NEW (WAL, busy_timeout=5000): 0/240 (p50 ~0.4ms, p99 ~82ms under 8-way contention)". https://github.com/gastownhall/beads/pull/4680

**CITE**
Claude Code #14124: "Setting `busy_timeout` via sqlite3 CLI does not persist - it is per-connection." https://github.com/anthropics/claude-code/issues/14124

**CITE**
The same shape shows up in four codebases: retry logic existed but not on every write path. Beads #1272: "Multiple SQLite transaction entry points lack retry logic." mcp_agent_mail #122: `macro_contact_handshake` did not use the existing `retry_on_db_lock`. OpenCode: message upserts retried but "starting a turn, updating session state and settling the turn could still fail". Beads #1505: "Repeated sqlite3: database is locked errors", "Daemon enters tight CPU loop". Sources: https://github.com/gastownhall/beads/issues/1272 , https://github.com/Dicklesworthstone/mcp_agent_mail/issues/122 , https://safereddit.com/r/opencodeCLI/comments/1woca02/retrying_a_sqlite_write_without_freezing_the/ , https://github.com/gastownhall/beads/issues/1505

**CITE**
berthub on upgrading a read transaction to a write: "No matter how high you set your .timeout, this scenario always delivers an instant SQLITE_BUSY error"; "If you know you are going to write in a transaction, start it with a write, or use BEGIN IMMEDIATE"; but "You might read here and there to just always use BEGIN IMMEDIATE but that will easily cause timeouts". On `SQLITE_BUSY_RECOVERY`: "If you open multiple SQLite connections at the beginning of your program, I recommend doing so sequentially." https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/

**CITE**
SQLite docs: "BEGIN IMMEDIATE might fail with SQLITE_BUSY if another write …"; "An attempt to execute COMMIT might also result in an SQLITE_BUSY return code". https://www.sqlite.org/lang_transaction.html

**CITE**
Pragma order matters: "`busy_timeout` must be set first so that the connection will wait if switching to WAL encounters a busy database." https://freshteapot.net/writing/sqlite-connection-string-order/

**CITE**
Checkpoint starvation: with a reader that never lets go, "the WAL file will grow without bound" (https://www.sqlite.org/wal.html). Beads's PR deferred "WAL checkpoint-starvation handling under a long-lived reader" (https://github.com/gastownhall/beads/pull/4680).

### 3. Schema and trigger migrations

**CITE**
The only migration pain found is Beads's move off SQLite, not trigger migrations inside SQLite. Examples: "v0.55.4 forces Dolt backend on existing SQLite databases, Not clear how to smoothly upgrade" (#2016, title only); "SQLite-era JSONL export loses dependencies and labels" (#3079, title only); "The `bd migrate --to-dolt` command was removed in v0.58.0" (https://github.com/gastownhall/beads/blob/main/docs/architecture/dolt.md).

**GUESS**
(inference) No opened source reports on migrating CHECK or trigger schemas in a live multi-process SQLite ledger. REPORT.md also lists trigger migrations as untested. This is a gap in the evidence, not evidence that migrations are safe.

### 4. Backup discipline

**CITE**
SQLite's list of ways to corrupt a database includes "Backup or restore while a transaction is active", "Deleting a hot journal", and "Copying a database file without also copying its journal". It is "safe to make a copy of an SQLite database file as long as there are no transactions in progress while the copy". https://www.sqlite.org/howtocorrupt.html

**CITE**
Litestream: "If you delete your database file but not your WAL file then SQLite will try to apply those old WAL pages". https://litestream.io/tips/ . The Claude Code issue recommended `rm -f ~/.claude/__store.db-shm ~/.claude/__store.db-wal` as recovery (https://github.com/anthropics/claude-code/issues/14124). That is the "deleting a hot journal" move from SQLite's corruption list.

**CITE**
hq's author: "Backup requires stopping writes or using SQLite backup API". https://raw.githubusercontent.com/hegner123/hq/main/CONS.md

**GUESS**
(parent's figure, not reproduced) REPORT.md says a naive `cp` of our WAL db lost everything and `VACUUM INTO` worked. That matches the SQLite doc passage above.

### 5. foreign_keys is set per connection

**CITE**
"Foreign key constraints are disabled by default … so must be enabled separately for each database connection." https://www.sqlite.org/foreignkeys.html . Litestream says the same: "must be set on each database connection, as it does not persist across connections." https://litestream.io/tips/

**CITE**
A practitioner complaint: "not even enforcing foreign keys unless you open the DB in a certain mode" (pdimitar); "the entire time I feel like I’m needing to be twice as careful" (sgarland). https://news.ycombinator.com/item?id=39666467

### 6. A second tool bypassing the owning module

**CITE**
From the Beads maintainers' blog: "if an agent CAN do something, an agent WILL do it." https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/

**CITE**
mcp_agent_mail #123 shows a second process corrupting the db. A second `am` server on the same `STORAGE_ROOT` led to "database disk image is malformed". The requested fix was "single active server per resolved STORAGE_ROOT". In #234, CLI calls made while the HTTP server ran "lost the lock race … continuously for ~30s". https://github.com/Dicklesworthstone/mcp_agent_mail/issues/123 ; https://github.com/Dicklesworthstone/mcp_agent_mail/issues/234

**GUESS**
(parent's finding, not reproduced) REPORT.md says `/usr/bin/sqlite3` runs with `foreign_keys=0`. As a result it accepted an orphan insert and skipped module-maintained provenance, while the triggers still refused an illegal transition (exit 19). The per-connection foreign-key CITEs above are consistent with that finding.

### 7. Cross-machine sync and history

**CITE**
Yegge: "The inherent fragility of the v0.x Beads architecture, with its bidirectional sync, 3-way merge, two sources of truth, race conditions, and tombstone hell — that’s all gone now", along with "the 22-nose Clown Show, where the Mayor scored a new clown nose every time it had massive data loss, which went on for weeks." https://yegge.ai/essays/gas-town-from-clown-show-to-v10/

**CITE**
DoltHub: the move was needed to "scale far beyond what was possible with Beads’s original backend, which was an amalgamation of SQLite and Git", but "the move to Dolt added friction for solo Beads users, who were used to the simpler SQLite and Git model". https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/

**CITE**
Beads's restored SQLite backend drops sync on purpose: "history, branches, remotes, sync, federation, and compaction are Dolt-only capabilities". https://github.com/gastownhall/beads/pull/4601

**GUESS**
(inference) The lesson from Beads is about the second source of truth (JSONL through git) plus last-write-wins merging. It is not that SQLite as a single-host store failed. The Beads project now ships SQLite for the single-workspace case again.

## Evidence that argues against our design specifically

**CITE**
1. Leases and reclaim are missing. coord uses "leases (default 5 min)" with a background reclaim sweep (https://github.com/DmarshalTU/coord). hq has "Heartbeat monitoring" (https://github.com/hegner123/hq). Beads lists "claim/lease" in its backend core (https://github.com/gastownhall/beads/pull/4601). Compare-and-set inside `BEGIN IMMEDIATE` makes the claim atomic, but nothing frees a claim held by a dead agent.

**GUESS**
(inference) That is the most concrete gap between our design and working peers. REPORT.md, the parent's source, lists "no lease primitive" as a missing engine feature.

**CITE**
2. `busy_timeout` has to be set on every connection, before WAL. Every instance above that shipped with `busy_timeout=0` (Claude Code, Beads's first SQLite backend) hit `database is locked` right away. Sources: https://github.com/anthropics/claude-code/issues/14124 ; https://github.com/gastownhall/beads/pull/4680 ; https://freshteapot.net/writing/sqlite-connection-string-order/

**GUESS**
(parent's finding) REPORT.md measured `SQLITE_BUSY` / `SQLITE_BUSY_RECOVERY` at `busy_timeout 0`, which matches.

**CITE**
3. A timeout alone does not fix it: retry has to cover every write path. Three separate projects had retry on some write paths and not others (Beads #1272, mcp_agent_mail #122, OpenCode). A single owning module is exactly the right place to enforce retry, but only if every write goes through it. Sources as in cluster 2.

**CITE**
4. `BEGIN IMMEDIATE` for every claim can itself cause timeouts under load ("that will easily cause timeouts", berthub). COMMIT can also return `SQLITE_BUSY` (https://www.sqlite.org/lang_transaction.html).

**CITE**
5. A long-lived reader starves checkpoints. "the WAL file will grow without bound" (https://www.sqlite.org/wal.html). An orchestrator with a watcher or dashboard that holds a read connection open is exactly the setup Beads flagged and deferred (https://github.com/gastownhall/beads/pull/4680).

**CITE**
6. The database must be single-host and local-disk. It cannot live on a VM-shared mount, a synced folder, or a volume two containers mount during a deploy. Sources: https://www.sqlite.org/wal.html , https://www.zotero.org/support/kb/data_directory_in_cloud_storage_folder , https://github.com/gastownhall/beads/issues/920

**CITE**
7. Recovery options are thin. mcp_agent_mail recovered from corruption only because a Git archive held a second copy (#123). Beads v0.x had JSONL (#3931 title: "silently dropping issues only present in jsonl from other sessions"). Our design has one file.

**GUESS**
(parent's figure, not reproduced) REPORT.md says page damage lost all 5 `messages` rows.

**CITE**
8. A practitioner who ran it said they would choose differently: "If starting over … we'd use PostgreSQL instead of SQLite. The single-writer constraint hasn't caused data loss since the February 4 incident, but it limits architectural options." https://ultrathink.art/blog/orchestrating-agents-with-claude-code

**GUESS**
(inference) Weighing the evidence: nothing here argues SQLite cannot do this job on one host. Points 1–7 are all costs the owning module has to carry, and the failures above happened where a project skipped one of them.

## Sources

**CITE**
Fetched in full:
- https://yegge.ai/essays/gas-town-from-clown-show-to-v10/
- https://ultrathink.art/blog/orchestrating-agents-with-claude-code
- https://ultrathink.art/blog/the-work-queue-that-runs-everything
- https://safereddit.com/r/clawdbot/comments/1rhkxt1/
- https://safereddit.com/r/ClaudeCode/comments/1qur3qq/
- https://safereddit.com/r/rails/comments/1sbglu3/sqlite_in_production_on_rails_8_wal_mode/
- https://safereddit.com/r/opencodeCLI/comments/1woca02/retrying_a_sqlite_write_without_freezing_the/
- https://safereddit.com/r/sqlite/comments/1tw2fyu/
- https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/
- https://freshteapot.net/writing/sqlite-connection-string-order/
- https://litestream.io/tips/
- https://www.zotero.org/support/kb/data_directory_in_cloud_storage_folder
- https://github.com/hegner123/hq (README) and https://raw.githubusercontent.com/hegner123/hq/main/CONS.md
- https://github.com/DmarshalTU/coord (README)
- Beads issues via the GitHub API: #920, #1224, #1272, #1505; PRs #4680, #4681
- mcp_agent_mail issues via the GitHub API: #122, #123, #234, #254
- HN via the Algolia API: https://news.ycombinator.com/item?id=39666467 , https://news.ycombinator.com/item?id=40837610 , https://news.ycombinator.com/item?id=46851518

**CITE**
Fetched partially:
- https://github.com/gastownhall/beads/blob/main/docs/architecture/dolt.md (lines 1–300)
- https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/ (1–300 of 366)
- https://fractaledmind.com/2024/04/15/sqlite-on-rails-the-how-and-why-of-optimal-performance/ (1–300 of 381)
- https://github.com/anthropics/claude-code/issues/14124 (1–300 of 322)
- https://github.com/gastownhall/beads/pull/4601 (first 1,800 characters of the body)
- SQLite docs via curl + grep, matching passages only: https://www.sqlite.org/wal.html , https://www.sqlite.org/foreignkeys.html , https://www.sqlite.org/howtocorrupt.html , https://www.sqlite.org/useovernet.html , https://www.sqlite.org/lang_transaction.html
- Beads #4547 (search-API excerpt)

**ACTION**
Failed: `curl -s https://api.github.com/repos/gastownhall/beads/issues/3931 | jq -r '…\(.body[:1800])'` exited 5 with `Error: cannot use null as iterable`. The body of Beads #3931 was not retrieved; only its title is used here. Reversal: none needed, it was a read. Direct reddit.com `.json` returned 403/429 in an earlier session, so every Reddit fetch here went through `safereddit.com`, and every one succeeded.

## Unverified

**GUESS**
(recall) The close reason on Claude Code #14124 ("not planned") comes from a search-result summary, not from the fetched page text. The issue's closed state and "stale" label were seen.

**GUESS**
(recall) The web-search summaries of unopened Reddit threads (Intent Bus "34 jobs/s", Stagent, Aiball, the r/LocalLLM Postgres-for-agent-memory benchmarks) are not used in the answer. Treat any of their figures as unverified.

**GUESS**
(inference) The Ultrathink deploy-overlap data loss was not root-caused, per the r/rails reply. Their longer write-up (https://ultrathink.art/blog/sqlite-in-production-lessons) was not opened.

**GUESS**
(parent's figures) Every REPORT.md number restated here (5 rows lost, exit 19, and the Beads 7/29 split-state figure not repeated in the body) is the parent's and was not reproduced in this session.

## Coverage

**CLAIM**
Coverage by source area. Retrievals are listed in the Sources section; this table accounts for all of them plus what was never opened.

| Area | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| Beads (SQLite era + exit + SQLite return) | Yegge essay, dolt.md, DoltHub blog, 6 issues/PRs with bodies, PR #4601, ~10 issue titles | Essay full; dolt.md and blog partial; #920 #1224 #1272 #1505 #4680 #4681 full; #4601 partial | #3931 body fetch failed (jq null) | Yes. The reason for leaving and the SQLite return are both primary-sourced. Next reads: #2016 and #3079 bodies for migration detail |
| Claude Code `__store.db` | #14124 | 300 of 322 lines | Close reason not in fetched text | Yes for the lock/pragma lesson |
| Small agent-coordination tools | hq, coord, mcp_agent_mail (5 issues), 8 GitHub candidates as search titles | hq README + CONS.md, coord README, mcp_agent_mail #122 #123 #234 #254 | none | Partly. No lease or reclaim failure stories were found. Next read: AleBrito124356/durable-agents (BEGIN IMMEDIATE claim) |
| Ultrathink / Rails | 2 blog posts, 2 Reddit threads | all full | sqlite-in-production-lessons post not opened | Yes. The data-loss root cause is contested in the source itself |
| Reddit practitioner threads | ~10 search results | 5 opened (r/ClaudeCode, r/clawdbot, r/rails, r/opencodeCLI, r/sqlite) | none; direct reddit.com blocked, mirror used | Partly. No thread reports long-run happiness with a SQLite agent ledger beyond Ultrathink and the Gas Town review |
| SQLite-as-queue prior art (HN, Litestream, Rails) | 3 HN threads, 5 HN titles, Litestream tips, fractaledmind, berthub, freshteapot, Zotero | HN ×3 full, Litestream full, berthub full, freshteapot full, Zotero full, fractaledmind 300/381 | none | Yes for the busy/pragma/backup lessons |
| SQLite official docs | 5 pages | grep-matched passages only | none | Yes. Every doc claim quotes the matched passage |

**CLAIM**
Retrieved but never opened: the Reddit threads r/sqlite/1ts1i3s (Intent Bus), r/ClaudeAI/1sb7aad (Stagent), r/claude/1v2cr7t (Aiball), r/ClaudeCode/1rr7vgo (orchestrator reverse-engineering), r/LocalLLM/1uy4rbx (Postgres for agent memory), r/sqlite/1vhkn56 (best queue for sqlite); the GitHub repos jwhiting/taskq, cgeene/commandcenter, AleBrito124356/durable-agents, vystartasv/agent-state-db, HakAl/agent-comms, mkalkere/agent-coordinator, mathomhaus/guild, dichovsky/crew; the HN threads 41514986, 34947327, 41449492, 41847282, 48703923, 41072631; the Beads issue bodies #1752, #1781, #2016, #2085, #3070, #3079, #1525; the fifth mcp_agent_mail search hit; the rest of dolt.md, the DoltHub blog, fractaledmind, #14124, and #4601; the Ultrathink sqlite-in-production-lessons post. This is what makes the report Tier 2 rather than Tier 0.

<!-- output-types
tier: 2
CLAIM: 2
CITE: 45
GUESS: 15 (inference 8, pattern 0, recall 7)
ACTION: 1
PMDW: 1
QUESTION: 1
-->
