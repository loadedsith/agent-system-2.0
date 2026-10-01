---
date: 2026-10-01T09:10-07:00
engineer: Plumb (seat; committed under Jo's git identity)
session: PRs #2 and #3 merged; the owed list became MIGRATION.md § M7 follow-ups; the before-M8 set and the M11 gate ruled
status: open
durable: false
---

Covers 2026-09-30 15:00 PT to 2026-10-01 09:10 PT. Earlier the same day:
`2026-09-30--1330--plumb--lane-launcher-built-verified-three-codex-reviews-live-gate-next.md`.

## Needs a human, at the top

- **M7 closes on one stakes override.** M7's sign-off reads "Jo has watched one workload end to end and overridden
  stakes once". The first half is done many times over. The second never happened: `provenance` has 10 workload
  opens and zero `stakes a->b` changes. Jo said yes to overriding on the next workload they open (`high <id>`).
- **The two before-M8 workloads are not opened yet.** Plumb gave Jo the paste text. One is numbered batch answers
  (follow-up 1). The other is close entries committing on the lane branch, with lanes cut from `origin/<default>`
  (follow-ups 11 and 12).
- **The spend-ceiling proof (`wl-muolz8qtp6ylfk`).** Lane 3 hit its 2 h deadline at 23:57Z before recording its
  hand-off note. Jo relaunched it as lane 4 at 16:05Z on 2026-10-01. When its "for Plumb" ledger note lands,
  Plumb runs `~/agent-scratch/agent-system-2.0/migration/M7/ceiling/proof/run-proof.sh` outside the fence and
  reports back. The proof slice closes on that report.

## What changed

- **PR #2 (graded GUESS labels in gate row 1) merged** by Jo as `a7e0ffa`. Its full suite outside the fence was
  2365 / 0.
- **Local `main` diverged from `origin/main`** (5 unpushed log commits against the merge). The lane starter's base
  check refused a launch (`launch-failed: … have diverged`). Plumb rebased local `main` onto `origin/main` on Jo's
  word, with backup branch `backup/main-pre-rebase-2026-09-30`. The relaunch succeeded.
- **PR #3 (ledger read only on state asks; orchestrator never hands Jo a command, row 1 refuses it)** was built
  by `wl-muonhgx992outc`. It merged `origin/main` into the branch and pushed plainly, per Jo's revise. Two reserved
  requests were denied on Plumb's advice, both moot: a `for`-loop `bun test` and a `git reset --hard`. Full suite
  outside the fence on `3e66b4e`: 2369 pass / 0 fail / 44 files. Plumb's later log edits made the PR conflict, in
  Plumb's own log file only. With Jo's word, Plumb merged `origin/main` into the branch, kept main's copy (a
  superset: 16 additions, 0 removals), and pushed plainly (`e999f6c`). Jo pushed `main`, then merged it as
  `75a50c0`. Local `main` now equals `origin/main`.
- **`MIGRATION.md` § "M7 follow-ups"** holds 13 items in three groups (surface / orchestrator behaviour / lanes
  and git). Each is marked done, direction, or not designed. It is a list, not a design: each item is designed
  when it opens as a workload. The section also records:
  - **Gate on M11:** the cutover waits until every follow-up is done or deferred by name. Jo: *"i like your idea
    about the follow-ups"*.
  - **Before M8:** follow-ups 1, 11 and 12 plus the spend ceiling. Jo: *"those items we should do before m8"*.
    Plumb read this as a ruling and said so; revert `8108ba2` if it was a misreading.
- **Rulings recorded** in yesterday's entry (addenda 15:10–15:40):
  - the refused-draft fix carries the draft text in the refusal (Jo: *"include it"*);
  - the surface blocks stay visible but are trimmed to one plain line per item (Jo: *"yes follow your recco"*);
  - owed 10: gate row 8 has no path for a branch updated by merge.

## Decisions

- **The before-M8 set is chosen by what breaks at scale.** M8 runs many lanes at once. Wrong-target bare answers
  (follow-up 1) and `main` divergence (11 and 12) both multiply with lane count. The other follow-ups are
  annoyances that run alongside M8.
- **Fence-bound proofs go to Plumb, not Jo.** The orchestrator has no channel to Plumb, so the hand-off is a
  ledger note "for Plumb", and Plumb watches the ledger. Jo routed it: *"ledger note for Plumb, no message to me"*.
- **Merge, not rebase, to update an already-pushed branch.** The charter (`.ai/plumb-seat-charter.md` § branch
  already pushed) makes updating one Jo's call. Jo approved the merge for PR #3.

## Dead ends

- The Claude-side output-types guard rejects `**GUESS(inference)**` as a block opener, though 2.0's row 1 now
  accepts it. In this seat, Plumb uses plain `**GUESS**`.

## Candidate lessons

- Before merging a lane PR on GitHub, push local `main`. Otherwise the merge splits `main` again and blocks the
  next launch.
- Editing a notes file that an open PR also carries makes that PR conflict.
- "The orchestrator never hands Jo a command" needs a named runner outside the fence. Otherwise "a lane can't run
  it" reads as "Jo must".
- A lane that hits its deadline overnight leaves its last short step undone until Jo returns.
