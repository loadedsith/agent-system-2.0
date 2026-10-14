---
date: 2026-10-12T21:48-07:00
engineer: Plumb (seat, for Jo Wolff)
session: Night of 2026-10-12 — one-message answers, merge-conflict machinery, Jev pair trigger
status: open
durable: false
---

## What changed

No code. Five workloads were opened or unparked through Ilex from Jo's pastes (2026-10-13 ~04:37–04:46Z):

- MIGRATION one-file-per-item (`wl-mv5mvvs64ahq0w`) unparked: Jo said go without waiting for Plumb's seven open PRs (#94 #68 #70 #76 #74 #79 #72). Instruction `in-mv672jpcw2d2io`.
- Answers in one message (`wl-mv66ylg1op3wg0`, production, plan first): Ilex ends each turn with a `send:` line; Jo's `ok` applies it as a numbered batch; Jev sorts items routine vs needs-Jo and `ok` never covers needs-Jo; multi-prose-block paste fix first (`in-mv67564pwap534`).
- GitHub-issues projection of the ledger (`wl-mv66ylim0gahog`, production, plan first), design at `~/agent-scratch/agent-system-2.0/issues-design/DESIGN.md`.
- Paired mode with a suggest-only trigger (`wl-mv67564rdkfvnk`, production, plan first, autonomous after Jo's flip `in-mv677b88u736kg`), design at `~/agent-scratch/agent-system-2.0/paired-coding/TRIGGER-DESIGN.md`.
- Question-links workload (`wl-mv66q5b148uznk`) given a plan step that must avoid conflicting with PRs #111/#112.

## Decisions made (and why)

- **Merge conflicts: unpark the MIGRATION one-file-per-item fix instead of waiting on the PRs that conflict.** Every conflict tonight was in `MIGRATION.md` or `install/manifest.tsv`; the fix's own park note allowed "or Jo says go". Waiting on PRs that already conflict was circular.
- **Answering many items in one message is machinery, not a habit.** Numbered batches already worked (`surface/src/input.ts` header, "1 approve, 2 deny"); the missing parts are a machine-built recommended line Jo can accept with one word, and Ilex not adding commentary after answers.
- **Jev (TypeSafe judge, `typesafe/jev`) is the classifier for two jobs:** sorting needs-you items into routine vs needs-Jo for the `ok` line, and judging the two pair-mode signals keywords cannot catch (UI/taste work, ambiguous brief). It suggests only; rulings 3 and 9 forbid a model flipping mode.
- **Pair suggestion appends to the existing round-limit / ceiling question** (Jo chose the design's recommendation) rather than raising a separate question.
- **GitHub issues: one issue per workload, ledger is truth, `Closes #N` written by machinery, issue closes at PR merge, no issues for workload-less MIGRATION items in lane one** (Jo's § 8 answers, via the design's recommendations).

## Dead ends — don't retry these

- **A paste of several prose blocks separated by command lines does not give each block an input row**, despite the `surface/src/input.ts` header comment saying it does. Only the command lines got rows (04:37Z). Until the one-message workload fixes it, send each prose instruction alone.
- **Long prose pastes are truncated at the surface** (`in-mv672dxssifnr4` 316 of 529 bytes, first character lost; `in-mv6742ordazqps` 442 of 553). Ilex reconstructed the text tonight; do not rely on that.
- **The mode keyword regex mis-fired again**: the word "together" opened the paired-mode workload as user-driven (5 of 5 automatic mode picks wrong). Jo had to flip it.

## Heads-up for whoever touches this next

- `#1 extend` on the row-6 replacement (`q-mv61jhjnoyw16o`) is deliberately unanswered: its plan waits on items 100 → 102 → 101, and `extend` relaunches a lane immediately into that wait.
- `install/manifest.tsv` same-spot appends are a second conflict source the MIGRATION fix does not cover; candidate workload.
- Plumb's seven open PRs will need `origin/main` merged and their MIGRATION.md additions converted to item files once the one-file-per-item tooling lands.
