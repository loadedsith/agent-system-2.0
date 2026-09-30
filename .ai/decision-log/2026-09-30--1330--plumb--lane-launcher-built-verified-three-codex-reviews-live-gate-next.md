---
date: 2026-09-30T13:30-07:00
engineer: Plumb (seat; committed under Jo's git identity)
session: Lane launcher built and verified; three Codex reviews; the live M7 gate is the only open slice
status: resolved
durable: false
---

Written at wake after Jo shut the seat down by accident; the session that did this work left no
entry. Reconstructed from `git log`, the ledger, and the scratch dirs, not from memory.

## Needs a human, at the top

- **The live M7 gate (`sl-live` on `wl-muoaxc8vnba3nk`) is the one open slice.** Done-condition as
  written in the ledger: *"Jo has watched a workload they opened launch a lane, finish or park and
  release without them, and close with its entry committed."* Everything else on the build workload
  is `done` (`sl-plan`, `sl-ledger`, `sl-launch`, `sl-verify`).

## What changed (all on `main`, `3fde665..c49f4cd` plus the build commits before it)

- Lane launcher built as workload `wl-muoaxc8vnba3nk` (opened by Ilex 09:10 PDT, Plumb the lane by
  hand, `~/agent-scratch/agent-system-2.0/migration/M7/lane-by-hand/wl-muoaxc8vnba3nk.ts` renews the
  lease every 20 min): `ledger` (sl-ledger), `surface/src/launch.ts`, `surface/extensions/{launch,
  lane-tools}.ts`, `surface/scripts/lane.ts`, `bin/as2 lane …`, `tiers/lane.md` (sl-launch);
  fake-omp + `lane-script.test.ts` + `lane-smoke.test.ts` + `launch.test.ts` (sl-verify).
- Codex review 1 (`…/M7/lane-launcher/codex-review/`): B1–B7, S1–S7, all fixed (`74a320b` and
  earlier). Codex review 2 (`…/codex-review-2/REVIEW.md`): R1–R6, all fixed (`623091b`…`c49f4cd`,
  12:15–12:21). Codex review 3 (`…/codex-review-3/REVIEW.md`, 12:45): all six closed, no new
  regression, verdict *merge as is, proceed to the live M7 gate*.
- Manifest rows for every new file (`3fde665`, earlier docs(install) commits).
- At wake 13:25: `bash install/install.sh` → exit 0 (manifest-or-fail passed on the current tree;
  profile re-rendered, extensions load from repo paths so the 12:xx code is what `as2` runs). Killed a
  stranded test runner pair (`lane.ts run wl-muohlhyy2mav7k` + `fake-omp`, 1h12m old, temp ledger).

## Decisions

- The live gate is run on a **fresh, small, real** workload that Jo opens in `as2`, not on the build
  workload itself (which Plumb holds by hand and which cannot be launched by the machinery while held).
- MIGRATION.md M7 row gets the launcher-build paragraph after the live gate, with the live result.

## Dead ends

- None new this session beyond those in the three review files.

## Heads-up

- Lease on `wl-muoaxc8vnba3nk` is kept alive by a `while true; do sleep 1200; … renew; done` loop
  (pid 64162 at wake). If Plumb's seat dies for good, kill that loop or the workload stays held.
- After the live gate: complete `sl-live` with the artifact (ledger export + Jo's word), close the
  build workload through the close tool (decision 13 commits the entry), update the M7 row.

## Addendum 13:45 — live gate passed

- Jo opened `wl-muokevdn0vre9s` in `as2` (brief: make sure README.md holds the one-liner) and watched
  live. Ledger: `launch: cause first` 20:35:54.659Z → `lane-started:` → `lane-ready:` 20:35:56.144 →
  `artifact-command: grep -nxF …` → `done-because: the line was already present` 20:36:12 → released
  20:36:13 → `lane-exit: code 0 outcome completed` 20:36:17 → Ilex closed 20:39:30 on Jo's "close it",
  entry committed `7358c30`. No `lane-died:`. Export `~/agent-scratch/agent-system-2.0/migration/M7/lane-launcher/live-gate/`.
- `sl-live` completed, build workload `wl-muoaxc8vnba3nk` `done-because:` + released by the by-hand
  script (`…/M7/lane-by-hand/wl-muoaxc8vnba3nk.ts done`), renewer loop pid 64162 killed. **Ilex closes
  it** (the close tool commits the entry); a message "Close it." is queued to the orchestrator.
- `as2 lane cleanup wl-muokevdn0vre9s` → exit 0, worktree removed, branch `wl/wl-muokevdn0vre9s` kept.
- MIGRATION.md M7 row updated with the build, the reviews, the gate, and two findings:
  **L1** a clean completion sends the orchestrator nothing (quiet-by-default), so the close waited for
  Jo's word; **L2** on "close it" Ilex recorded a second instruction on the build workload it does not
  hold, reading Jo's intent as "chose not to watch" (Jo was watching). Both are decisions for Jo, not fixes yet.
- Owed on M7, unchanged: workload ceiling; row 1 graded-label parse.

## Handoff 14:15 (pre-compaction) — what is in flight

- **Committed `9804ce0`**: `awaiting-close` predicate reason (past holders read from provenance via
  `Ledger.holders`; Jo's `launch-requested:` still wins) + wake tick closes a finished, unheld
  workload through `closeWorkloadWithEntry` (shared with the close tool). 2351 tests. Fixes the 20:44Z
  wasted launch onto `wl-muoaxc8vnba3nk` and finding L1. Report `.tmp/awaiting-close/REPORT.md`.
- **Builder hand `AwaitingClose` (opus) is running round 2, uncommitted when it lands** — Jo said
  "fold it in" for both: (a) worktree base = fetch, then the newer of local default branch and
  `origin/<default>` when one contains the other, typed `launch-failed:` on divergence, `base <ref>
  <sha>` recorded (`surface/scripts/lane.ts:102-113` was `origin/HEAD` only — the live-gate lane cut
  from 14 commits behind); (b) the tick surfaces a released workload with `done-because:` but an open
  slice/question as one deduped notice instead of a silent skip. Next: spot-check diff, commit, tell
  Jo to relaunch `as2` (extensions load at start; the fix needs a relaunch).
- Jo exited `as2` and pushed `main` (`origin/main` = `ed2338e` at the time). Jo pushes; Plumb never pushes `main`.
- **Then "what's next" for Jo** (owed list): workload ceiling (runner exists now to count against it);
  row 1 graded-label parse; finding L2 (Ilex recorded an intent-reading instruction on a workload it
  did not hold — consider refusing `record_instruction` on unheld/unopened workloads); Sedge items via
  Lintel (`leg_has_body` macOS grep bug, Codex content-flag); M8 memory→ledger migration is the next
  MIGRATION row after M7.
- Ruled out: pushing `main` from the close tool (reserved action; misses by-hand commits).

## Wrap-up 14:30 — the what's-next shape (Jo: "wrap up so you don't forget that")

**What's next after `as2` relaunches on the round-2 commit.** Most remaining work is independent;
the only real chain is M10 (needs the launcher — done) → M11 (needs M7 ✓ + M10). Fan-out, cap 3
live lanes (`reserveLane`):

| Item | Depends on | Notes |
|---|---|---|
| Workload ceiling — ledger column, open-time sizing by stakes, runner counts tokens + wall time, `question` row at 80 % with *stop at the ceiling* default (shape ruled in MIGRATION.md M7 row) | nothing | first workload to open |
| Row 1 graded-label parse (`**GUESS(inference)**` as a block label) | nothing | small |
| L2 — refuse `orchestrator_record_instruction` on a workload the orchestrator neither opened nor holds (Ilex wrote an intent-reading "Jo chose not to watch" row on `wl-muoaxc8vnba3nk`, 20:39:26Z) | nothing | keep file-disjoint from the ceiling or make it a slice of it |
| M8 memory→ledger, twelve seats | nothing | one lane per seat; each cites `file:line`, writes `…/migration/M8/<repo>.md`, asserts the migration tag |
| M9 HerdR/moshi rows | Jo | installer-owned files |
| M10 product-repo reserved-action workload | launcher ✓ | overlap rule: no 1.x seat on that repo meanwhile |
| M11 cutover | M7 ✓ + M10 | |
| Sedge via Lintel: `leg_has_body` macOS grep bug; Codex content-flag on adversarial framing | nothing | not 2.0 work |

**What still serializes:** each lane's build → test → review chain; Jo's attention (closes, parked
questions, PRs on this repo — machinery never merges here); any two lanes editing the same files.

**Suggested first sitting:** open the ceiling, the row-1 parse, and one M8 seat as three workloads,
then leave.

## Candidate lessons

- **One hand per independent item.** Round 2 sent two independent fixes (worktree base; stuck-finished
  notice) to one hand as follow-ups; they ran serially and cost Jo ~10 minutes of waiting
  (`.tmp/awaiting-close/REPORT.md` § Round 2). Frame every dispatch plan with an "independent items: N,
  hands: N" line; more items than hands needs a stated reason. Proposed charter wording, § "Model
  selection" step 2, appended: *"Name each independent item and give it its own hand; two independent
  items on one hand is serialization and needs a stated reason."*
- **Change-scoped tests test the author's model of the bug.** Round 1's brief-specified fix would have
  passed its own tests and missed the live bug; the builder caught it by replaying against a copy of the
  live ledger. Keep the full suite + independent review leg + live replay as the bar; change-scoped
  tests are the first check, never the last.
- **A by-hand script that predates a typed refusal keeps printing success.** `…/M7/lane-by-hand/wl-muoaxc8vnba3nk.ts:38-39`
  printed "done + released" while the holder-checked release was refused; check the row, not the log line.

## Owed — added 14:40 (Jo: "yes add that to the owed list")

One surface workload, next after the ceiling and row-1 lanes land; the items touch
`surface/src/input.ts`, the needs-you render, and `tiers/orchestrator.md`:

1. **Numbered, batch answers at the surface; refuse an ambiguous bare word.** Live failure 21:34–21:37Z:
   Jo sent `q1: approve` / `q2: deny en-…` (not parsed — `surface/src/input.ts:30` takes one or two words;
   Ilex only recorded readings), then bare `approve`, which the parser applies to a waiting reserved
   request before any question option (`input.ts:44-52`) — it approved `en-muomfqjr1x5b0g`, the request
   Jo meant to deny; bare `deny` then matched nothing. Ilex diagnosed it correctly at 21:37:08Z. Build:
   the needs-you render numbers every open question and waiting reserved request; the surface accepts
   `1 approve, 2 deny` (or one per line), applies each as its own ledgered row, echoes one line per
   answer; a bare word with more than one possible target is refused with "which one?".
2. **Read the ledger only when the answer depends on state.** Every Jo message is followed by an
   `orchestrator_ledger` call (session log 21:34:55–21:36:46Z), even `q1: approve`; M7 fix round 2 (C)
   said "before any state answer". Narrow `tiers/orchestrator.md` to that. The full wake stays on
   session start / restart / compaction only (`surface/extensions/wake.ts:171-218`).
3. **A lane parking on a question pushes nothing until the 60 s poll.** The poll does trigger an unprompted
   turn (`wake.ts:115`, seen at 21:32:59Z), so this is latency, not silence; confirm on the next park.
4. **The full `bun test` cannot pass inside a lane's fence** (47 failures in `gates/test/fence.test.ts`,
   `surface/test/lane-script.test.ts`, `surface/test/lane-smoke.test.ts` — nested `sandbox-exec` exit 71,
   `ps`/`df` EPERM; Ilex's reading of the row-1 lane log, not reproduced by Plumb). Recommended:
   done-lines say "all but the fenced files in the lane; full suite at integration"; Plumb runs the full
   suite on the lane branch outside the fence before integration.

**Ruled 14:50 (Jo, on hiding the ledger render and needs-you blocks from the TUI: *"that seems like it has more risks than benefits"*):** not built. The `surface-wake` and `surface-needs-you` blocks stay `display: true` (`surface/extensions/wake.ts:111`, `:115`, `:232`); tool activity stays hidden (`profile/config.yml:43-44`). Do not re-propose without new evidence.

## Addendum 15:10 — main reconciled; PR #3 held (Jo: "yes line them up", "we will wait")

- **Local `main` diverged from `origin/main`** after Jo merged PR #2 (graded GUESS labels, `a7e0ffa`) while 5 decision-log commits sat unpushed on local `main`. The lane starter's base check refused the launch of the "orchestrator never hands Jo a command" workload (`wl-muonhgx992outc`, `launch-failed: … have diverged`, 22:01:55Z). Plumb rebased local `main` onto `origin/main` on Jo's word (backup branch `backup/main-pre-rebase-2026-09-30`); relaunch started `lane-muonhgx992outc-2` at 22:04:51Z on base `82f104e`.
- **PR #3 held unmerged** (the ledger-read-only-on-state-asks tier change, branch `wl/wl-muomzp90cvo268`) until the command-hand-over lane lands. Both edit `tiers/orchestrator.md`, and the new lane branched from `main`, not from PR #3. Plumb runs the full suite on both branches outside the fence and gives Jo a merge order.
- **Owed, added:**
  5. **Close entries go on the lane's branch, not local `main`.** Every close commits a decision-log entry to local `main` while PRs merge on GitHub, so each merge diverges the two and blocks every launch until reconciled.
  6. **Refused drafts stay on screen.** Gate row 1 refuses at `session_stop`, after display; one refusal of a two-choice QUESTION produced three near-identical messages at 22:02:18–22:02:34Z. A reader hand is checking whether OMP can hide a draft before display (`.tmp/refused-draft/REPORT.md`).
  7. **The receipts gate misses graded GUESS blocks.** `r03-receipts` reads only plain `**GUESS**` (Ilex, lane message `msg-muon01jru77v28`; flag-only, unverified by Plumb).
  8. **Unpushed local `main` commits ride into every lane PR** (PR #3 carries 7 of Plumb's commits besides its own). Push `main` before launching, or cut lanes from `origin/<default>`.
