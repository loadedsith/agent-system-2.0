---
date: 2026-09-23
session: Pre-Phase-5 requirement hardening — P-5, Phoenix, P-18, triple-check, cross-lab review, two rulings
engineer: plumb
status: resolved
---

# Pre-Phase-5 rulings, a triple-check, and a cross-lab review

Phase 5 is still not open. This session hardened `REQUIREMENTS.md` + `PREFERENCES.md` before it
opens. Six commits on `main`, all pushed by Jo except the last:
`a485b3a`, `e0d50e7`, `12b354f`, `96a5e70`, `9cae5e5`, `730c3dc`.

## What changed

- **P-5 ruled** (`a485b3a`): named persistent lanes are not a tier. Persistence belongs to the
  workload; address = workload name; the charter's job goes to a per-workload brief plus per-repo
  rules loaded on checkout; memory and per-repo expertise go to the P-13 store. This abolishes 1.x
  seats as personas — Plumb included.
- **Local Arize Phoenix recorded** (`e0d50e7`): `/Users/jowolff/.phoenix/phoenix.db` (26 MB, wired
  to Claude Code OTel in Aug 2026, never to OMP, not running), missed in Phase 1. Now a Phase 5
  observation-layer candidate for P-4/P-8b/P-7c/P-16, gated on the OMP-emits-OTel test listed in
  `RESEARCH.md` § "Early Phase 5 tests" together with the ctx `pi`-root registration test.
- **P-18 recorded** (`12b354f`): 2.0 does not depend on the newdle plugin; every plugin-shipped
  artifact kept is re-homed into the portable repo (P-15) or dropped (P-10), per artifact in Phase 5.
- **Triple-check** (three same-provider lenses: contradictions, OMP-is-the-floor, abolished-seat)
  → Jo ruled the **workload / lane vocabulary split** (workload = durable addressable unit with
  brief, ceiling, memory key, open/closed state; lane = running instance, at most one live per
  workload) and that the brief's reserved-list **exceptions field is Jo-only**; ceiling is
  orchestrator-set; opening a workload is not reserved. Applied across twelve entries (`96a5e70`).
- **Cross-lab review** on `96a5e70`: one GPT leg (`gpt-6-astra`, codex read-only sandbox,
  contradictions lens, 10 findings) and one Kimi leg (`kimi-k2.7-code-highspeed`, cold read,
  14 findings), triad-style isolation. Seven mechanical fixes applied (`9cae5e5`): P-2 no longer
  calls a lane "persistent"; P-7b summary says "rules or machinery"; P-7c states are queryable on
  demand and only a past-threshold message is pushed (P-8c holds); P-16 "never applies one
  without Jo's acceptance"; `## Vocabulary` block in `REQUIREMENTS.md`; attribution notes on the
  P-17 third resume trigger, P-7c four states, P-7a open/closed clause (ruled via the triple-check,
  not Jo's words); P-5 single home for per-repo expertise.
- **Two rulings from the cross-lab review** (`730c3dc`):
  1. **Raising a workload's ceiling is reserved to Jo** (P-7b item 2). The orchestrator sets the
     initial ceiling and may lower it; once set, moving it up is Jo's. Without this the spend
     reservation was hollow — the orchestrator could raise the number instead of asking.
  2. **The orchestrator has no hands of its own.** All work happens inside a lane, done by the
     lane's hands; the orchestrator requests work from lanes. Jo: *"many of the problems i have
     with lintel is it spawns its own hands. all work should happen within a lane."* P-7b's
     "opens hands" wording was loose; P-8 is the rule. Orchestration chores too big for the
     orchestrator's own turn open as a workload of their own, so their spend is ceilinged.

## Answered along the way

- **P-3's open column on `OMP_PROFILE` isolation is answered** (CITE by the OMP-floor lens from
  `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/config-usage.md`): a named profile
  isolates only the OMP layer; `~/.claude`, the Claude marketplace plugin, and each repo's
  `.omp`/`.claude` load under every profile. Isolation = own profile **plus** per-item
  `disabledExtensions`. Not yet folded into P-3's text — Phase 5 item.
- Triple-check is same-provider; triad and quorum are the only cross-lab skills and neither
  critiques a document. Filled ad hoc with
  `/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/xlab/run-legs.zsh`.

## What the multi-lab run taught

GPT found two authority holes (ceiling raises; orchestrator's own hands) that all three Claude
lenses read past — author and reviewer sharing a blind spot. Kimi's cold read reframed the
"open for Phase 5" columns of P-9, P-3, P-7c, P-7b item 3 as the requirements themselves, not
details: they are the first four spec questions when Phase 5 opens, in that order. Workload
granularity (is Newdle one workload or many?) was flagged by all three labs independently.
Neither lab produced a false contradiction, and none touched Jo-quoted text; the drift was all in
summary rows, which now get a diff check after every reword.

## Held for Jo (not dropped — synthesis file has the detail)

`/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/synthesis.md`:
P-16→P-15 dependency is a GUESS in PREFERENCES and a requirement in the summary; whether the
reserved list closes at five including P-4 sign-off; OMP-native from the first lane; OMP's native
memory backends (`local`, `mnemopi`, `hindsight`, `sharpshooter`) as P-13 candidates;
"remote push" → protected-branch push/deploy. Plus workload granularity (P-1 vs P-5) for Phase 5.

## Dead ends

- `zsh -n` on a script containing `gh api -X PUT` is refused by the careful guard; syntax-check
  such scripts with the offending line stubbed.
- The cross-lab runner's Kimi leg needs an empty scratch cwd; running it inside the repo
  would let Kimi read files outside the prompt.

## Heads-up for the next person

- `730c3dc` is local; Jo pushes.
- Phase 5 opens only on Jo's word. First actions then: read `interview-me` and
  `spec-driven-development`; hand the two early tests (ctx `pi`-root registration; start Phoenix
  and point one OMP session at `http://localhost:6006/v1/traces`) to Lintel → Tinker; first spec
  question is P-9's work-kind taxonomy and ceiling source.
- Reports: `/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/{contradictions,omp-floor,abolished-seat,synthesis}.md`
  and `xlab/run-20260923-132555/{gpt-contradictions,kimi-coldread}.md`.
- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore`, `.ai/session-handoff.md`
  are not Plumb's.
