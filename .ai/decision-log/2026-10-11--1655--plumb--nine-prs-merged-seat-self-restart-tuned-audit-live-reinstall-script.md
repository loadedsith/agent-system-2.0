---
author: plumb
created: 2026-10-11T16:55:00-07:00
status: resolved
---

# Nine PRs merged, seat self-restart, tuned audit live, reinstall script

## Decisions (Jo, 2026-10-11, PDT)

- **Alias plan keeps the Oct 9 "refuse every alias" ruling** (workload `wl-mv0n5r9cbafe9s`, MIGRATION item 81). Ledger instruction `in-mv4e24uz8m9ekg` reads "revise q-mv46k4i4t14hs0 every alias"; the later resends dropped the words and were held as the same revise, and the answer `revise` landed on `q-mv46k4i4t14hs0` at 22:29:52Z. The revised plan drops the done line's "`alias ll='ls -l'` allowed" clause.
- **MIGRATION item 44: "skip it."** Item 44 (any commit or fetch in the shared repository voids every review in flight) is already fixed by `060b354` (2026-10-02), which makes the review fingerprint cover the lane's own work (`classifier/src/fingerprint.ts`, `classifier/test/fingerprint.test.ts`).
- **Item 98 takes the P-19 reading:** HerdR may host Ilex's pane so Jo can reach it from moshi; as2 never depends on HerdR. Recorded in MIGRATION.md at `978f072`.
- **M8 seat order** for the remaining eleven seats: Tinker done (PR #31); Wren, Verge, Sedge next; then Lintel; Sluice, Galley, Levitt, Codex, Caspian and Tron between Lintel and Plumb; Plumb last, migrated the day before cutover. Recorded in MIGRATION.md at `1d241ac`, alongside item 97 (gate over-refusals from the guard-replay triage).
- **"Ping each, but bear in mind I could be taking a nap"** (23:40:35Z): Ilex sends one self-contained message per PR as it goes green at its head, in merge order #32 → #42 → #38.
- **Conditional go on `q-mv4g3vae2uqbuo`** (23:44:28Z, `in-mv4gzqpegdxc00`): "when PR #42 merges, treat q-mv4g3vae2uqbuo as answered go and proceed; do not ask me again." The dead-hands golden-file update (#38) proceeds on #42's merge without another question.
- **Stale ledger backup workload closed** (`close` on `q-mv4guu3w4ks0zk`, 23:43:45Z; workload `wl-mv4gn9l7spcsg0`). The backups were correct; the ledger wrote nothing from 2026-10-09T18:03Z to 2026-10-11T18:10Z (receipts `~/agent-scratch/agent-system-2.0/wl-mv4gn9l7spcsg0/FINDINGS.md`).

## Plumb's call

- **Backup-gap invariant threshold is 30 h** (the backup job's 24 h interval plus 6 h, so a finding means a daily copy was missed, not a quiet day). Measured against the ledger's newest write, never the copy's wall-clock age. Built in as2 PR #45 (`plumb/invariants-followup`) with MIGRATION item 99 (run the invariant report on a timer).

## What landed

- **Merged:** #31 (M8 Tinker), #33 (tier-file size lint), #34 (row 17 spawn-rate breaker), #35 (guard-replay), #40 (guard-replay manifest rows), #37 (closed reserved request refused with its state), #41 (invariants report), #39 (row 10 unix-socket fix), #36 (Jo names the lane model per workload).
- **Open at close of day:** #32 (items 71/72), #42 (ledger replay regression, claims MIGRATION item 96), #38 (dead hands, waits on #42), #43 (S5 install test fix), #45 (invariants follow-up, item 99).
- **Running state brought up to main:** running checkout fast-forwarded to `a35c8c1`; `_as2test` test-runner bundle reinstalled from that sha (23:50Z); as2 relaunched 16:52:51 PDT. One line for the next time: `zsh ~/agent-scratch/agent-system-2.0/ff-reinstall-relaunch.zsh`.
- **Plumb seat self-restart** with `~/agent-scratch/agent-system-2.0/restart-plumb.zsh` (SIGTERM after a grace period, `launch-seat --resume plumb`), so the tuned Jev receipts audit loads in-process; new process up 16:46 PDT.

## Lessons

- Merged is not running. A merge moves `origin/main`, not the running checkout or the orchestrator's process.
- GitHub "mergeable" is not as2 green. The as2 full-suite run at the PR head is the merge bar.
- A value relayed from another agent, written as a `cmd → output` receipt, is a laundered receipt. Attribute it and label it.
- `exec > >(tee …)` followed by exec'ing a TUI launches the TUI headless. Keep a TUI on the real terminal.
- A merged PR that touches lane or test-runner code needs fast-forward, `install/as2test-setup.sh`, and relaunch. Without the reinstall every full-suite run errors in preflight, as #32, #42 and #43 did today.
