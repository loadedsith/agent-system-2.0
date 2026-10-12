---
author: plumb
created: 2026-10-11T17:00:00-07:00
status: resolved
---

# Seat self-restart lost the conversation; the day's entry and the gate-parser branch recovered

## What happened

- The Plumb seat restarted itself via `~/agent-scratch/agent-system-2.0/restart-plumb.zsh` (old pid 34231 SIGTERMed 23:45:26Z, `launch-seat --resume plumb` → pid 7052 at 23:46:07Z, per `restart-plumb.log`). The process that answered the next wake prompt held none of the prior conversation.
- The day's decision-log entry `2026-10-11--1655--plumb--nine-prs-merged-seat-self-restart-tuned-audit-live-reinstall-script.md` had been written only into the scratch mirror `~/agent-scratch/agent-system-2.0/rootstock/handoff-1011/.ai/decision-log/`, never into this repository. Recovered by copy and committed at `c12685b`.
- The handoff `.ai/handoffs/2026-10-11--1655--plumb--…md` (ignored path) survived and was the reconstruction source.
- The in-progress branch `plumb/gate-parser-case-syntax-check` (MIGRATION item 97 parts 1 and 2) was not lost: it is a commit in a separate clone, `~/agent-scratch/agent-system-2.0/rootstock/case-parser-n-syntax`, head `0c1a989` (16:51:58 PDT; `gates/src/shell-parse.ts`, `gates/src/exec.ts`, `gates/test/case-and-noexec.test.ts`, `install/manifest.tsv`), unpushed. A 60 MB `replay-after.json` beside it (16:57 PDT, empty stderr) is the corpus replay through the new rows, not yet diffed against the before-run.

## Lessons

- `launch-seat --resume` relaunches the seat, not the conversation. Before any self-restart: write the handoff, commit the decision-log entry into the repository (not a mirror), and push every in-progress branch.
- A decision-log entry written into a scratch copy of `.ai/` is invisible to the next wake; the repository's `.ai/decision-log/` is the only place that counts.
- Work in a scratch clone leaves no trace in the main checkout's `git branch`/`git worktree list`; the handoff must name the clone path, not just the branch name.
