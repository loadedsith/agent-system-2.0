---
author: plumb
created: 2026-10-09T01:30:00-07:00
status: resolved
---

# By-hand pivot: PRs #24/#27/#28/#29 merged, restart bundle run, before-M8 gate retired, M8 opened, item 48 by hand

## Decisions (Jo, 2026-10-08 evening to 2026-10-09 early, PDT)

- **Items 24, 65, 68 finished by hands outside the fence, not by lanes** ("yes fucking do it"; lanes 9–11 on item 24 ended silently). Result: as2 PR #24 (runner, six uid-bound tests fixed, r10 EACCES guard), PR #28 (fence copied-wrapper, item 65 → renumbered 77), PR #27 (silent park, item 68 → 80), PR #29 (runner workload close). All merged by Jo; each Anthropic-built PR had a `reviewer-codex` review first (`~/agent-scratch/agent-system-2.0/review-pr27/REVIEW.md`, `review-pr28/REVIEW.md`).
- **Restart bundle done** (`~/agent-scratch/agent-system-2.0/restart-bundle.zsh`, log beside it): `as2 install` with `compaction: thresholdPercent: 25` in `profile/config.yml`, omp 18.8.5 → 18.8.6, Ilex stopped and restarted by Jo with `AGENT_SYSTEM_MAX_LANES=5 as2`, Plumb restarted via HerdR. `PENDING-STEPS.md` closed.
- **MIGRATION.md renumbered**: Plumb's items are 70–81 (lane PRs took 58/59/65); 81 = alias bypass; 82 = any workload touching `gates/` is production stakes at open (ledger instruction `in-mv0novd17fre9s`); 83 = adversarial probe suite for gate PRs, now with a second half: replay the ctx-indexed real-traffic corpus through old and new rows and print the per-row delta (from the rootstock-os research, `~/agent-scratch/agent-system-2.0/research/rootstock-os/REPORT.md`); 84 = row 15 pins a workload-less question.
- **Before-M8 gate retired, M8 opened** ("lets go with your recco"): open items 14, 32, 54, 70, 71, 72, 78, 82, 83 build alongside M8 as lanes; 82/83 at the head of the queue. Recorded at MIGRATION.md "Gate retired" line.
- **Item 48 (multi-line paste) built by hand now**, after four one-command pastes in a row ("i want it in"): as2 PR #30, branch `plumb/item-48-multiline-paste`, head `3a4082e`; Codex review pending; two builder questions carried to Jo in the PR body (who records a paste's plain-words run; an unrecognised command-shaped line becomes plain words rather than refusing).
- **as2 self-review limit stated**: lanes may edit `gates/` (bites only after merge + restart); review can be independent, adversarial and tested, never a proof; Jo's merge stays the floor.
- Gate-PR fix rounds fix the root, not the symptom (Codex option taken on #28).

## Side work closed tonight

- paired-coding 1.2 (Landlock) verified **PASS** at `6eea315` on Ubuntu 24.04 Docker (report `~/agent-scratch/jo-wolff-plugins/paired-coding-probes/landlock-gate/plumb-verify/REPORT.md`); PR head `b1490c1` on `paired-coding-1.2.0` differs by comments/README only (diffed). Stale remote branch `paired-coding-1.2` to delete after merge.
- rootstock-os research: "OS for agents like as2" is partly right; it is a Claude Code hooks-and-prose kit (same species as the 1.x newdle plugin). Steal: corpus replay (folded into item 83), spawn-rate breaker and tier-file size lint (offered to Jo, undecided).
- Jev receipts-audit C2 day 1 running on this seat (`~/agent-scratch/agent-system-2.0/jev-veracity/validation/live-log.jsonl`).

## Lessons

- Three PRs off one base sharing files need a stated merge order (`git merge-tree` each pair before saying order doesn't matter).
- Tell hands to stop the minute Jo merges.
- A runner's first red is its proof; "already on main" review findings become MIGRATION items the same hour.
- Seat messages cross: diff a new head against the verified one and re-run only what the diff touches.
- Never name a zsh variable `path`; test handed scripts end to end, not only `zsh -n`.
