# Beads (bd) failures from the local ledger test: are they known upstream?

**PMDW**
Research date 2026-09-23. Bounded pass over GitHub issues, PRs, and releases in the Beads repository, the Dolt repository and source, the Beads docs, one DoltHub blog post, and two Hacker News threads. The local test used bd 1.3.0, dolt 2.3.5, macOS arm64, embedded mode, with no sql-server. All four local findings are the brief's, measured by the Beads hand in `/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/beads/SECTION.md`. They were not reproduced in this research.

## Needs attention

**CLAIM**
No blockers. No human decision is needed to use this report.

**CITE**
`steveyegge/beads` now redirects to `gastownhall/beads`. Every link below uses the new owner. Receipt: `gh repo view steveyegge/beads` returned `"nameWithOwner":"gastownhall/beads"`, run this session.

**GUESS(inference)**
Coverage is Tier 2 for the community section only. The Reddit thread returned no content and the bjorn.now blog tag page came back empty; see Coverage. The per-finding answers do not depend on either source.

## Answer: per finding

**PMDW**
"Brief's figure" means the number comes from the local test report. It is not re-measured here.

| # | Local finding (brief's figure, GUESS here, not reproduced) | Upstream status | Key links |
|---|---|---|---|
| 1 | `bd set-state` split under SIGKILL, 7 of 29 kills: event bead written, label not updated, despite "Atomically" in the help text | **Known: the mechanism is filed. Open, untriaged, no fix PR found.** The report describes a failed second write, not a kill, but the root cause is the same: two independently committed calls. Still present on `main` | [#5637](https://github.com/gastownhall/beads/issues/5637) (open). Related: [#5657](https://github.com/gastownhall/beads/issues/5657) (open), [#5112](https://github.com/gastownhall/beads/issues/5112) (open), [#4521](https://github.com/gastownhall/beads/issues/4521) (open) |
| 2 | Journal truncation causes silent data loss, and `dolt fsck` reports "No problems found" | **Partially known, and by design in Dolt.** Dolt's journal loader treats an incomplete tail as a torn write, truncates to the last valid record, and raises no error. No upstream report of "truncation → silent loss plus fsck clean" was found. An adjacent report of fsck saying clean on a store that would not load does exist | Dolt source [journal_record.go @ v2.3.5](https://raw.githubusercontent.com/dolthub/dolt/v2.3.5/go/store/nbs/journal_record.go); [dolt#11181](https://github.com/dolthub/dolt/issues/11181) (closed); [beads#2430](https://github.com/gastownhall/beads/issues/2430) (closed) |
| 3 | No state-order enforcement: `bd set-state` accepts any transition, and `bd update` accepts `delivery:bogus` | **Not found as a bug. By design according to the source.** `set-state` checks only the `<dimension>=<value>` format and the no-op case | [state.go @ v1.3.0](https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/cmd/bd/state.go) |
| 4 | A mis-set `BEADS_DIR` pointing at an uninitialized directory silently falls back to the cwd workspace | **Partially known: the same bug class is filed. Open.** The exact case (a missing or empty directory) was not found as its own issue. The source at v1.3.0 falls through to the cwd walk by construction | [#5756](https://github.com/gastownhall/beads/issues/5756) (open); PR [#6255](https://github.com/gastownhall/beads/pull/6255) (open, `BEADS_DB` variant); [beads.go @ v1.3.0](https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/internal/beads/beads.go). Adjacent: [#5972](https://github.com/gastownhall/beads/issues/5972) (open, `restore --force`) |
| 5 | 5-minute claim lease reverted by `bd reclaim` | **Known. The design is intended; the tuning gap is filed.** The TTL is hardcoded at 5 min and `claim.ttl` is accepted but has no effect | [#5681](https://github.com/gastownhall/beads/issues/5681) (open); [#4716](https://github.com/gastownhall/beads/issues/4716) (closed by PR #4718) |
| 6 | Telemetry on by default | **Documented, by design (opt-out).** | [AGENT_INSTRUCTIONS.md](https://raw.githubusercontent.com/gastownhall/beads/main/AGENT_INSTRUCTIONS.md) § Telemetry |
| 7 | `bd batch` grammar too narrow for multi-write transactions | **Not found.** The only related filing asks for `gate` commands in `bd batch` | [#4292](https://github.com/gastownhall/beads/issues/4292) (open, title only) |

**CLAIM**
The table cells are summaries of the per-finding CITE blocks below. Each cell carries its receipt there.

### Finding 1: `set-state` is two commits, not one

**CITE**
https://github.com/gastownhall/beads/issues/5637 (fetched): the issue is open, labeled `status/needs-triage`, and was filed 2026-08-11. It says: "`bd set-state` on current main performs its two writes as two independently-committed lifecycle calls … 1. `lifecycle.Create(...)` - the state-change event issue (commits its own Dolt version inside the storage layer …); 2. `lifecycle.Update(...)` - the `LabelPatch` that swaps the state label. If step 2 fails … the event from step 1 is already durably committed." It also calls this "an atomicity regression introduced when both routes were collapsed onto the lifecycle facade."

**CITE**
https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/cmd/bd/state.go (fetched). The shipped 1.3.0 source matches the issue:
- line 117 reads `` Long: `Atomically set operational state on an issue. ``
- line 225 reads `created, err := lifecycle.Create(ctx, issueops.CreateRequest{`
- line 253 reads `if _, err := lifecycle.Update(ctx, issueops.UpdateRequest{`

The same three lines exist at the same numbers on `main` (https://raw.githubusercontent.com/gastownhall/beads/main/cmd/bd/state.go, fetched).

**CLAIM**
No fix PR was found. `gh search prs --repo gastownhall/beads` for "5637", "set-state atomic", "set-state transaction" and "state event label one transaction" returned zero results for each query, run this session.

**GUESS(inference)**
The local SIGKILL split (brief's figure: 7 of 29) is the kill-timing version of #5637's failed-step-2 case. A kill that lands after `lifecycle.Create` returns and before `lifecycle.Update` commits leaves exactly the observed shape. The local test also saw `dolt status` show *uncommitted* working-set rows, which suggests that the SQL transaction landed but the Dolt version commit did not. I did not trace the storage layer's commit path to confirm this.

**CITE**
https://github.com/gastownhall/beads/issues/5657 (fetched) is open. On bd 1.1.0 it reports that concurrent label updates on one issue "silently lose or duplicate labels". It names `set-state` directly: "`bd set-state` is documented as 'Atomically set operational state' but sits on the same path and corrupted in 30/30 concurrent trials." That figure is the issue author's, not measured here.

**CITE**
https://github.com/gastownhall/beads/issues/5112 (fetched) is open, reported on bd 1.0.5 in server mode: "A multi-field `bd update` is not transactional. When it hits the 30s timeout the process is killed mid-write, and the record is left with some fields written and others not."

**CITE**
https://github.com/gastownhall/beads/issues/4521 (fetched) is open: "During an agent-initiated batch write operation, the process timed out and was interrupted. This interruption resulted in a corrupted Dolt journal, preventing the embedded Dolt database from opening." The reporter recovered from a JSONL export.

### Finding 2: journal truncation is silent by Dolt's design

**CITE**
https://raw.githubusercontent.com/dolthub/dolt/v2.3.5/go/store/nbs/journal_record.go (fetched). The doc comment on `processJournalRecords` (line 419 area) reads: "If an invalid journal record is found, it is not included and this function stops processing journal entries, but does not return an error. Journal records may be incomplete if the system crashes while records are being persisted to disk. … We must gracefully recover without preventing the server from starting up, so we are careful to only return the journal file offset that points to end of the last valid record." Line 468 area adds: "When we have a real file, we truncate anything which is beyond the current offset." An error is raised only if `possibleDataLossCheck` finds parseable records after the bad point (`return off, NewJournalDataLossError(path, off)`).

**CITE**
The same two passages exist at line 419 and line 468 in the Dolt engine commit that bd 1.3.0 embeds. That commit is `dolthub/dolt/go v0.40.5-0.20260715172757-a6690826d767` (https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/go.mod, line 149, fetched). Receipt: https://raw.githubusercontent.com/dolthub/dolt/a6690826d767/go/store/nbs/journal_record.go returned HTTP 200 and both passages matched, fetched this session.

**GUESS(inference)**
This explains the local result. The test truncated the journal from 361364 to 180000 bytes (brief's figures). A cut tail looks exactly like a crash-torn tail, so the engine keeps the valid prefix and discards the rest silently. Dolt intends this as crash recovery, not as a detection failure. The random-bytes case differs because valid records follow the garbage, which trips `possibleDataLossCheck`; the local test did see that case refuse to open.

**GUESS(inference)**
`dolt fsck` probably reports clean because the surviving prefix is a valid journal. I did not read the fsck code path, so this is unverified.

**CITE**
https://github.com/dolthub/dolt/issues/11181 (fetched), a Dolt maintainer comment: "Dolt strives to be and is designed to be crash resistant, certainly in the face of abruptly terminated Dolt processes and even in the face of crashed computers, assuming the underlying filesystem and storage technology is accepting writes and persisting them according to its durability contracts." The same maintainer says `dolt fsck --revive-journal-with-data-loss` "truncates the journal at the first error." Status: closed 2026-08-10 as "we do not believe it currently reflects a defect in Dolt."

**CITE**
https://github.com/gastownhall/beads/issues/2430 (fetched), closed. The reporter saw `possible data loss detected in journal file at offset 961963: corrupted journal` on load, yet "Running `dolt fsck` doesn't report any issues", with output ending in `No problems found.` A later comment attributes the cause to #2933 (Beads deleting Dolt's `noms/LOCK` file).

**CLAIM**
That false-clean runs in the opposite direction from the local test. There, fsck said clean while the load *failed*. In the local test, fsck said clean while the load *succeeded with fewer rows*. Both are recorded in the sources cited above.

**CITE**
https://github.com/gastownhall/beads/issues/2933 (fetched via `gh issue view`), closed 2026-03-31: "Beads previously contained code (`CleanStaleNomsLocks`) that deleted these files on startup, after init, after bootstrap, and during `bd doctor --fix`. That code has been removed."

**CLAIM**
Searching `dolthub/dolt` issues for "journal truncated", "fsck no problems found", "fsck truncated journal", "journal data loss", "embedded crash safety" and "kill -9 journal" returned no issue matching the local truncation symptom. The `gh search issues` runs this session returned zero results for all of these except "revive-journal-with-data-loss".

### Finding 3: no state-order rule, by construction

**CITE**
https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/cmd/bd/state.go (fetched):
- The command validates only `if len(parts) != 2 || parts[0] == "" || parts[1] == ""` → `invalid state format`.
- `runSetState` then returns early only when `oldLabel == newLabel` (`no change`).
- There is no transition table or allowed-values check between the `findStateLabel` read and the write.
- The help examples are free-form pairs: "patrol:active, patrol:muted / mode:normal, mode:degraded / health:healthy, health:failing".

**CLAIM**
No issue requests transition enforcement. `gh search issues --repo gastownhall/beads` for "state machine transition", "set-state validation", "allowed transitions", "label validation" and "arbitrary label" returned nothing relevant, run this session.

**GUESS(inference)**
Beads treats state dimensions and labels as free-form tags, and ordering is the caller's job. The local wrapper's check-then-act is therefore the expected integration pattern, not a workaround for a defect.

### Finding 4: `BEADS_DIR` fallback is coded behavior, and its bug class is filed

**CITE**
https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/internal/beads/beads.go (fetched), `FindBeadsDir` (line 757). The function reads `BEADS_DIR` first. It returns that path only `if info, err := os.Stat(absBeadsDir); err == nil && info.IsDir()` and `hasBeadsProjectFiles(absBeadsDir)`. Otherwise control continues to "2. Walk up from CWD toward the repo root". That branch has no warning or error.

**CLAIM**
This is exactly the local symptom: a missing or empty `BEADS_DIR` directory, with the cwd inside a workspace, ends in the cwd workspace. That is the brief's observation, and the code path above produces it.

**CITE**
https://github.com/gastownhall/beads/issues/5756 (fetched), open, `status/needs-triage`. Title: "bd -C <target> silently serves the caller's database when the target has no store of its own." It states: "`BEADS_DIR=/tmp/tgt/.beads bd where # byte-identical to the bd -C /tmp/tgt where output above`". It also says: "Writes are the same resolution path, so `bd create`/`bd update` under `-C` presumably land in the caller's store too". A 2026-09-06 comment on 1.3.0-rc.1 in embedded mode confirms writes land in an ancestor store.

**CITE**
https://github.com/gastownhall/beads/pull/6255 (fetched), open: "`bd`'s store-requiring command path (`list`, `show`, `create`, `update`, ...) ignored an explicit `BEADS_DB`/`BD_DB` target and silently opened whichever database ambient workspace discovery resolved to instead."

**CITE**
https://github.com/gastownhall/beads/issues/5972 (fetched), open: "`bd backup restore <path> --force` drops the target database before validating the source. If the path is not a Dolt backup — an empty directory is enough — the restore fails … and the store you ran it against is gone." Reported on v1.2.2.

**GUESS(inference)**
The local accident combined the `BEADS_DIR` fallback with `restore --force`, which is in the same hazard class as #5972. #5972 destroys the target on a bad *source*. The local case restored a good source onto the wrong *target*. A fix for #5756 that refuses a store-less `BEADS_DIR` would have stopped the local accident. A fix for #5972 alone would not have.

### Findings 5 to 7: lease, telemetry, batch

**CITE**
https://github.com/gastownhall/beads/issues/5681 (fetched), open: "On bd 1.2.1 the TTL appears to be hardcoded at 5 minutes with no override", and "`bd config set claim.ttl 48h` is accepted and reads back, but is inert." The suggested mitigation: "`bd reclaim --older-than <dur>` is a grace window past expiry, and it IS controllable".

**CITE**
https://github.com/gastownhall/beads/issues/4716 (fetched), filed by steveyegge and closed 2026-07-11 by PR #4718 (per `gh issue view --json closedByPullRequestsReferences`): a plain `bd update -s in_progress -a X` armed a lease, "making interactive claims reclaim-bait".

**CITE**
https://raw.githubusercontent.com/gastownhall/beads/main/AGENT_INSTRUCTIONS.md (fetched), § Telemetry: "Metrics are enabled by default (opt-out)." Events are "POSTed to `https://gastownhall-eventsapi.com/mp/collect`". "`DO_NOT_TRACK=1` opts out". The v1.3.0 source defines the same endpoint as `DefaultEndpoint` in `internal/metrics/metrics.go` line 21 (https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/internal/metrics/metrics.go, fetched).

**CLAIM**
Telemetry bugs exist, but I have seen them only as search-result titles; I did not open any of them:
- #4807 (open) "DataDir() hardcodes ~/.beads, ignores BEADS_DIR"
- #5712 (closed) "disabling telemetry strands the existing eventsData queue forever"
- #5871 (closed) "unbounded ~/.beads/eventsData spool"
- #5900 (closed) "send-metrics telemetry-flush processes are never reaped"

**CLAIM**
The only `bd batch` scope request found is #4292, "Support `gate create` and `gate resolve` in `bd batch`" (open). It was seen as a title only. Searches for "bd batch label", "batch set-state" and "bd batch create" returned nothing.

### Bonus: provenance timestamps

**CITE**
https://github.com/gastownhall/beads/pull/6012 (fetched via `gh pr view`), open: "Relying on the database CURRENT_TIMESTAMP default allowed a non-UTC session to persist local wall time; later JSON readers serialized that value with a Z suffix, creating a false UTC timestamp." This matches the local report's "provenance `created_at` in local time with a `Z` suffix". It is still unmerged.

## What changes the picture

**CITE**
No fix has shipped after 1.3.0. `gh release list --repo gastownhall/beads` shows v1.3.0 (2026-09-15) as Latest, followed only by v1.3.1-rc.1 (2026-09-21). The rc changelog lists three bug fixes: config dotted keys (#6578), `bd dolt start` on proxied workspaces (#6580), and a doc-flags script (#6581). None touch set-state, journals, `BEADS_DIR`, or restore.

**CITE**
The embedded engine is not the `dolt` CLI. https://raw.githubusercontent.com/gastownhall/beads/main/docs/reference/troubleshooting.md (fetched): "Embedded mode links its own Dolt engine at the version pinned in `go.mod` and is not affected by which `dolt` CLI is on your PATH." For bd 1.3.0 that pin is the `a6690826d767` pseudo-version cited above, not dolt 2.3.5.

**GUESS(inference)**
The local fsck and revive runs used the dolt 2.3.5 CLI against a store written by an older embedded engine. The journal-recovery passage is identical in both, so this probably did not change the truncation result. Other fsck behavior was not compared.

**CITE**
Upstream documents "single writer" for embedded mode, but I found no statement that embedded mode is not crash-safe. The v1.3.0 README (https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/README.md, fetched), lines 131-132: "**Embedded (default)** — `bd init`. Dolt runs in-process, data lives in `.beads/embeddeddolt/`, single writer." Line 75 separately calls `bd update --claim` "Atomically claim a task".

**CITE**
DoltHub, the Dolt vendor, says embedded DDL lacks concurrent atomicity. https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/ (fetched): "I also found a broader limitation: Embedded Dolt's DDL statements lack atomicity under concurrency, which we can't fully support today." The same post describes Beads and its sibling projects as "write-only, fully vibe-coded, open-source projects".

**CITE**
The troubleshooting doc covers journal corruption after an unclean shutdown. Same URL: "`bd` will not run Dolt's data-loss repair mode automatically", and "Only use the revive path after reviewing Dolt's data-loss warning." Line 118-119: "Do NOT remove files inside `.dolt/` directories (including `noms/LOCK`). These are Dolt-internal files — removing them WILL cause unrecoverable data".

**CLAIM**
Every open issue cited above carries `status/needs-triage` and shows `Updated: 2026-09-19` in its fetched header: #5637, #5657, #5756, #5972, #4521, #4135, #5112 and #5681. **GUESS(pattern)** That date looks like a bulk relabel, not maintainer engagement. Only #4135 also carries `triaged`.

## Community view on reliability

**CITE**
https://github.com/gastownhall/beads/issues/2573 (fetched), "Moving to dolt pretty much made beads unusable for me", closed as stale 2026-05-22. One commenter: "I estimate that 5-10% of my agents' time is spent wrangling Dolt-related bead issues now." Another reported "2+ complete database wipes" over two weeks on bd 0.59.0. Steve Yegge replied (2026-03-22): "The Dolt server lifecycle has been the #1 pain point since the migration". A maintainer later wrote that embedded mode from v1.0.0 means "The failure loop described in this thread … should no longer occur."

**CITE**
https://github.com/gastownhall/beads/issues/4135 (fetched), open. It consolidates "6 observed failure modes" on bd 1.0.3–1.0.4 in embedded mode, including silently dropped `bd close` in chained invocations. One comment reports the Dolt-layer loss no longer reproduced on 1.0.4.

**CITE**
https://news.ycombinator.com/item?id=47772212 (fetched, 2026-04-14): "I've been using Beads for 5 different projects, and Beads and/or Dolt failures have been a regular thing. It's own 'doctor' feature … can never fix all of the issues."

**CITE**
https://news.ycombinator.com/item?id=46487580 (fetched, 2026-01-04, before the Dolt migration). The poster replaced Beads because "every release made it slower and more frustrating to use" and "its background daemon took to syncing the wrong things at the wrong times". A commenter called the author's approach "quite erratic and honestly a bit unprofessional".

**CITE**
https://github.com/dolthub/dolt/issues/11181 (fetched), Dolt maintainer, 2026-08-05: "Outside of agents and harnesses messing with Dolt's internal LOCK files, or other files in its internal state directories, we have not had recent reports of journal corruption."

**GUESS(inference)**
Overall picture: the community reports are anecdotal and concentrated around the February–April 2026 Dolt migration. The currently open issues are unusually precise, with reproductions and code references, and several come from agent-assisted reporters. They cluster on non-transactional multi-write paths and silent workspace resolution, which are the same two families the local test hit.

## Sources

**PMDW**
Grouped by how fully each was read.

**CLAIM**
Fetched in full this session (body plus all comments shown):
- https://github.com/gastownhall/beads/issues/5637
- https://github.com/gastownhall/beads/issues/5657
- https://github.com/gastownhall/beads/issues/5756
- https://github.com/gastownhall/beads/issues/5972
- https://github.com/gastownhall/beads/issues/4521
- https://github.com/gastownhall/beads/issues/4135
- https://github.com/gastownhall/beads/issues/2430
- https://github.com/gastownhall/beads/issues/5681
- https://github.com/gastownhall/beads/issues/4716
- https://github.com/gastownhall/beads/issues/5112
- https://github.com/gastownhall/beads/issues/2573
- https://github.com/gastownhall/beads/pull/6255 (body, comments not requested)
- https://github.com/dolthub/dolt/issues/11181
- https://news.ycombinator.com/item?id=47772212
- https://news.ycombinator.com/item?id=46487580

**CLAIM**
Fetched partially (targeted lines or a truncated body):
- https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/cmd/bd/state.go (lines 114-275) and the `main` copy (grep)
- https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/internal/beads/beads.go (lines 530-575, 740-790)
- https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/internal/metrics/metrics.go (grep)
- https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/go.mod (grep)
- https://raw.githubusercontent.com/gastownhall/beads/v1.3.0/README.md (grep)
- https://raw.githubusercontent.com/gastownhall/beads/main/AGENT_INSTRUCTIONS.md (lines 490-518)
- https://raw.githubusercontent.com/gastownhall/beads/main/docs/reference/troubleshooting.md (grep, lines 160-200 and 700-712)
- https://raw.githubusercontent.com/dolthub/dolt/main/go/store/nbs/journal_record.go (lines 415-475), plus the `v2.3.5` and `a6690826d767` copies (grep)
- https://github.com/gastownhall/beads/issues/2933 (first 1800 chars of the body)
- https://github.com/gastownhall/beads/pull/6012 (first 900 chars of the body)
- https://www.dolthub.com/blog/2026-04-02-restoring-beads-classic/ (lines 1-300 of 366)
- `gh release view v1.3.1-rc.1` (full changelog)

**CLAIM**
Attempted and failed:
- https://www.reddit.com/r/ClaudeAI/comments/1qorl5r/solving_claudes_context_compaction_problem_for/ returned only the Reddit logo SVG, no post text.
- https://bjorn.now/tags/beads/ fell back to an RSS feed with ten "Untitled" entries and no content.

## Coverage

| Subject | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| 1 set-state split | #5637, #5657, #5112, #4521; state.go at v1.3.0 and main; 4 PR searches | All | none | Yes. The mechanism is filed and matches the shipped source line for line |
| 2 journal truncation / fsck | journal_record.go at main, v2.3.5 and the pinned commit; dolt#11181; beads#2430, #2933; about 12 dolt issue searches | All, but #2933 only the first 1800 chars | none | Mostly. The fsck code path was not read, so "fsck clean because the prefix is valid" stays a GUESS. Next read would be `go/cmd/dolt/commands/fsck.go` |
| 3 state order | state.go v1.3.0; 5 issue searches | All | none | Yes. The source settles it |
| 4 BEADS_DIR fallback | beads.go v1.3.0; #5756; PR #6255; #5972; 4 issue searches | All | none | Yes |
| 5-7 lease / telemetry / batch | #5681, #4716, AGENT_INSTRUCTIONS.md, metrics.go; searches | All except the telemetry and batch issues listed as titles only | none | Yes for status. The telemetry and batch bug titles were not opened; see below |
| Upstream releases / docs | release list, v1.3.1-rc.1 notes, README, troubleshooting.md, go.mod, DoltHub blog | All; blog 300 of 366 lines | none | Yes |
| Community | web_search (10 results), 2 HN threads, #2573, #4135 | HN ×2, #2573, #4135 | Reddit (no content), bjorn.now (empty feed) | Partial, Tier 2. Next read would be the Reddit thread through another front end, and yegge.ai |

**CLAIM**
Retrieved and not opened. Each appeared in a `gh search` result list or in the web_search result list, and none is relied on above except where marked "title only":
- **Beads issues:** #5433, #5585, #4807, #5712, #5871, #5900, #4292, #5700, #5737, #6065, #6064, #5509, #4241, and every other row printed by the `gh search issues` runs (roughly 150 titles).
- **Dolt issues:** #10837, #10852, #10971, #11775, #10331.
- **web_search results:**
  - https://www.yegge.ai/listings/the-beads-revolution-how-i-built-the-todo-system-that-ai-age
  - https://github.com/WMSmith25/steveyegge_beads
  - https://www.dolthub.com/blog/2026-07-22-introducing-beads-proxied-server-mode/
  - https://github.com/gastownhall/beads/blob/main/SECURITY.md
  - https://www.dolthub.com/blog/2026-01-27-long-running-agentic-work-with-beads/
  - the last 66 lines of the DoltHub "Restoring Beads Classic" post

**GUESS(recall)**
The web_search tool's own synthesis made claims I did not verify, so none of them is used above. It said Yegge's essay describes losing about 80 issues, and it described issue #4033 (JSONL deleted on read against an empty DB, fixed by #4087).

<!-- output-types
tier: 2
CLAIM: 14
CITE: 30
GUESS: 10 (inference 8, pattern 1, recall 1)
ACTION: 0
PMDW: 3
QUESTION: 0
-->
