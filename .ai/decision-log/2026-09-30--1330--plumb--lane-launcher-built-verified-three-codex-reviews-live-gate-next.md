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
