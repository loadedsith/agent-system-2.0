---
date: 2026-09-21T23:01-07:00
engineer: plumb
session: First wake — pronouns chosen, one false start recorded, Phase 1 opened by Jo with a confirmed model plan
status: in-progress
---

## Needs a human, at the top

None. Phase 1 is open on Jo's word and the model plan below is confirmed; nothing is blocked.

## Identity

Plumb chose pronouns at first wake: **they/them**. Recorded here per charter § "Identity"; the
memory document is not edited by the seat.

## What happened

- **Wake required hand-completion, and it is a seat-tier inventory item.** Lintel's
  measurement, relayed to Plumb and not reproduced by Plumb: `wake-seat plumb` failed twice
  with "OMP did not register in HerdR pane". The launcher runs
  `herdr pane run <pane> /Users/jowolff/.omp/agent/seat-launchers/seat-bin/omp` into a pane
  where oh-my-zsh was showing its interactive `[oh-my-zsh] Would you like to update? [Y/n]`
  prompt; the prompt consumed the leading `/`, the pane executed `Users/jowolff/...`, and
  failed with "no such file or directory" (panes `wC:p56`, `wC:p57`). Lintel completed the
  launch by hand (`herdr pane run` again, `herdr agent rename wC:p57 plumb`,
  `check-seat-ready plumb` → READY). Also recorded in the birth entry at
  `/Users/jowolff/code/agent-system-2.0/.ai/decision-log/2026-09-21--2207--lintel--plumb-seat-born.md`
  § "Also recorded: the wake needed hand-completion". Surface owner: Tinker. Goes into
  `INVENTORY.md` under seat-lifecycle machinery as a GUESS (Lintel's receipt, not Plumb's)
  naming what would settle it: a launch attempted into a pane with the oh-my-zsh update
  prompt suppressed.
- **One false start, no work lost.** Lintel opened Phase 1 by pane prompt before Jo had;
  Jo said "stop" twice; Lintel sent HOLD and withdrew the dispatch. Between the opening and
  the hold Plumb ran only reads and read-only git commands, dispatched no hand, wrote nothing.
  The charter gained § "Jo works with you directly" and § "Model selection" during the hold.
- **Phase 1 opened by Jo** (relayed by Lintel with Jo's quoted words, then Jo in this tab:
  "you have my permission to proceed"). Model plan posted and confirmed unchanged:
  - `scout` (haiku) × 4 in parallel — one per source root, listing and mechanical extraction.
  - `reader` (opus) × 3 in parallel after the scouts — load trace; duplication/authority diff;
    seat-lifecycle machinery.
  - No fable hands. `INVENTORY.md` synthesis, the section-6 measurement script, the unsure-list
    discharge, and commits run on Plumb's own turns.
  - Any added hand type or escalated tier re-opens the gate.

## Decisions

- Hand reports land under `/Users/jowolff/code/agent-system-2.0/.tmp/phase1/`, one file per
  hand, path given in the brief before the hand's first read, appended as findings land.
- `INVENTORY.md` is written section by section at the repo root and committed as each
  section settles.

## Heads-up for the next session

- Tree was clean at `98029e6` when this entry was written; no remote, commits stay local.
- The tier table in the charter's § "Model selection" was re-derived this session from
  `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/agents/*.md:4` and matched.
- The ctx-first-search extension refused the first `grep` of this session until a
  `ctx search` had been run once (error text: "ctx-first: this session has not consulted
  prior agent history yet"). It is a per-session gate; one search unlocks it. Loader to be
  located in Phase 1.
