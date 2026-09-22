---
status: resolved
seat: plumb
date: 2026-09-22
---

# Phase 3 closed — fourteen requirements on record; Phase 4 opened, no research begun

## What changed

- `PREFERENCES.md` (Phase 3 output, `42ac238`): P-1 through P-14, each quoting Jo, each citing
  the 1.x evidence, keep/change marked on the requirement not the artifact; a section stating
  what the entries are requirements *of* (behaviour as Jo experiences it; mechanisms are Phase 5);
  Jo's "graph engineering" hypothesis recorded as a research input; the Phase 4 research queue
  with Jo's priorities.
- `REQUIREMENTS.md` (`1b0b306`, `42ac238`): one-line-per-requirement review table, derived from
  `PREFERENCES.md`; regenerate, never edit alone.
- `briefs/research.md` (`42ac238`): the Phase 4 brief — graph engineering first, Osmani's "owning
  the outer loop" second, Yegge third and read under P-14 (Jo's means).

## Decisions (Jo's, this session)

- Lanes = the orchestrator's managed resources = 1.x seats (P-2); workload-bound (P-5); one window
  by default with direct lane access on demand (P-6); the surface *is* the orchestrator (P-7),
  with held-not-relayed knowledge, no acting on Jo's authority, confirmed delivery (P-7a–c).
- Parallel build under its own profile, per-lane cutover, 1.x untouched as rollback (P-3);
  every build step verified by automated gate **and** Jo sign-off (P-4).
- Lane owns its hands (P-8); hand reports trusted, lane→orchestrator report distrusted,
  exception-based visibility, spend by model routing (P-8a–d); work-kind rule + lane ceiling (P-9).
- Every rule re-decided in Phase 5 (P-10); mechanical enforcement at tool boundaries (P-11).
- Spec-and-plan option per project, "a big one" (P-12); persistent cross-repo memory of work and
  decisions (P-13); runs within Jo's means (P-14).

## Dead ends

- Plumb used "the 1.x shape" for two different things across Q6/P-8 and wrote "keep the
  mechanism" in P-8; Jo objected; corrected in `7b99fd2`. Lesson: name the 1.x *practice* and the
  OMP *primitive* separately.
- Plumb first marked P-2 "absent in 1.x"; wrong — 1.x has the resource (seats) without the model.

## Heads-up

- Phase 4 opened by Jo 2026-09-22 with the explicit condition that **no research begins until Jo
  approves the model plan**. The plan is posted in Plumb's tab after this entry.
- No OMP-dialect `research` agent exists under `.omp/agents/`; the plugin's pin
  (`P/agents/research.md:4` = opus) is not honoured by OMP without one — same finding as Phase 1
  for scout/reader/builder/planner. Creating `.omp/agents/research.md` is part of the model plan.
- Per-repo expertise (P-5), before/after-lane for planning (P-12), the ceiling number (P-14) are
  Phase 5 items, on record in `REQUIREMENTS.md`'s last column.
