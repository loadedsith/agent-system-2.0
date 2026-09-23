---
date: 2026-09-22
session: 2026-09-22--1959--plumb--phase-4-closed-seven-reports-four-rulings-and-the-remote
engineer: plumb
status: resolved
---

# Phase 4 closed — seven research reports, four rulings from the proofread, and the repo has a remote

**CLAIM**
Jo closed Phase 4 on 2026-09-22 ("let's close phase 4 and then call it a night"). Deliverable:
`RESEARCH.md` (commits `4ee89c4`, `f72804c`, `2dc2e4f`), assembled from seven `research`-hand
reports on Opus 5.5 plus two Plumb source readings and one browser-capture file, all tracked under
`research/phase4/`. Phase 5 is not open; Jo opens it.

## What changed

- `RESEARCH.md`: bottom line (eight items), one section per source (A graph engineering, B Osmani,
  C Yegge, D best-in-class survey, E planning practice, F memory, G/§ I self-improvement, plus the
  OMP_PROFILE reading and browser captures), requirement mapping P-1..P-17, compiled
  "Sources not fully read" with grades and what the browser resolved, twelve "Patterns that recur
  across sources", open decisions at the top.
- Jo's proofread (`req-responses.md`) reworded five requirements, all recorded with Jo's verbatim
  words in `PREFERENCES.md` and regenerated in `REQUIREMENTS.md` (`f72804c`):
  P-4 gate produces an inspectable evidence artifact; P-7a task state lives in a store outside
  any context window, machinery-written; P-7b autonomy by default with a reserved list; P-7c Jo
  learns message state (delivered / consumed / acted on) with a queue-age exception; P-8b closed
  by machinery-written state, observed liveness, and P-4 artifacts.
- Rulings (`f89bc76`, `c8423f2`): P-7b reserved list = phase open/close, spend above a lane's
  ceiling, irreversible actions outside the repo, changes to the system's own rules (item 3 gets
  a concrete command list in Phase 5). P-13 shape = index (ctx incumbent) plus a machinery-written
  ledger; Beads a candidate for the ledger, not a choice. "Graph engineering" is not the name of
  2.0: nodes / edges / shared state / interrupt as vocabulary, origin stated once in `SPEC-2.0.md`.
- Remote: Jo ran `scripts/create-remote.zsh` (`a46a2c2`, `5eb084a`, `5d273db`); `origin` =
  `git@github.com:thewolff/agent-system-2.0.git`, `thewolff-engineer` added as collaborator.
  Plumb commits locally on `main`; pushing stays Jo's.

## Decisions

- Research does not change requirements; Jo's word does. Phase 4 mapped every source to every
  requirement and left the text alone; the proofread was where research entered the requirements.
- Held for Phase 5, recorded in `RESEARCH.md` § Open decisions: planning one-owner-per-job vs one
  stack (P-12); P-16 gate shape — in-session / pull request (recommended) / audit-later; P-16
  trigger threshold; P-14 per-role cost number; P-7c queue-age threshold; P-7b item 3 command list.
- **First Phase 5 item, Jo: execute very early** — register `~/.omp/agent/seat-sessions` with ctx
  as a `pi` root (`ctx sources add --provider pi --root …`) and see whether it indexes; decides
  whether ctx stays as the index. Touches ctx's config under Jo's home, so it goes through Tinker
  or Jo, not Plumb.

## Dead ends

- X *articles* are not reachable by fetch or headless browser (body renders as one period);
  Reddit is, via headless Chromium or a Redlib mirror. Handing a Playwright task to Jo was not
  needed.
- `zsh -n` on a script containing `gh api -X PUT` is blocked by the `careful` guard whichever tool
  wrote the file; the script went to Jo syntax-checked by eye only and failed twice on step 0
  (clean-tree check too strict; `grep -q` under `pipefail` racing `gh auth status`). Both fixed;
  third run completed.

## Heads-up

- `research/phase4/research-D-best-in-class-survey.md` contains non-UTF-8 bytes; use `LC_ALL=C`.
- `.tmp/phase4/` still holds the original copies (git-excluded); `research/phase4/` is canonical.
- Untracked hook-written `.ai/.gitignore` and `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel notified of the close with one `seat_message` after this entry.
