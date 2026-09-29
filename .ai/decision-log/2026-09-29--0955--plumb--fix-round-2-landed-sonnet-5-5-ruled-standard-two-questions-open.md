---
date: 2026-09-29T09:55-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 execution — wave 2 fix round 2 landed (M3 + M4); Sonnet 5.5 ruled standard row 1; no bare opus-5; two questions open
status: in-progress
durable: false
---

# Fix round 2 landed for M3 and M4; Sonnet 5.5 is the standard tier; two decisions open

## Needs Jo (open at compaction)

**QUESTION**
1. **Async-hand model-check gap** (found by the M3 fix hand): the new out-of-row model check runs on the `task` tool *result*; an async hand's output arrives as a job delivery and never passes it, so a credential change between the spawn hook and OMP's final selection can still land a hand off-tier, unrecorded. Options: check on OMP's `agent_end` extension event + record the *actual* model in the ledger (`recordRouting` outcome; one `builder` hand on opus-5-5 — **Plumb recommends**), or mark the four tier files `blocking: true` (no hand; lanes lose fire-and-continue). Tier files unchanged (async) until ruled.
2. **Gates row 1 strictness**: `gates/src/rows/r01-turn-shape.ts:51-54` now refuses any `?` outside the one `**QUESTION**` block — including a quoted question of Jo's (*"wasn't tinker…?"*) and a PMDW check-in. Options: keep strict (hand's recommendation) or exempt quoted spans / blockquotes (**Plumb recommends**). Committed strict; two-line change either way.

## What changed (commits on `main`, Jo pushes; 15 ahead of `origin/main`)

**CLAIM**
- `559873e` **M4 fix round 2** — all six round-2 astra findings + two false positives; `bun test gates` 273/0 (Plumb's run). Report `~/agent-scratch/agent-system-2.0/migration/M4/fix-2/REPORT.md`.
- `9cb274a` **M3 fix round 2** — R2-B1 (spawn check mirrors OMP final selection + `tool_result` refusal), R2-B2 (one pending classification per slice; colliding/renamable slice ids refused), R2-S1 (`profile/models.yml` exact `typesafe/jev-1.13.0`, `retry.fallbackChains.judge: []`, moved version refused with one line); `bun test classifier` 87/0 (Plumb's run). Report `…/M3/fix-2/REPORT.md`.
- Both fix rounds were run **from the partial round-2 review files on disk** (Jo: *"lets go with your recco"*) instead of re-dispatching the sleep-killed astra reviews; round-3 reviews of the fixed ranges are the replacement.

## Rulings (Jo, 2026-09-29)

**CLAIM**
- **Sonnet 5.5 → `standard` row 1** (`profile/config.yml`); receipt: `~/.omp/agent/models.db` `model_cache` row `anthropic` (authoritative, 09:06) lists `claude-sonnet-5-5`, $2/$10, 1M ctx, 128k out — cheaper than either opus row. The static `pi-catalog/models.json` did not have it; the live cache is the availability instrument.
- *"there should be no references to opus-5 - they should all be updated to opus-5-5"* — `reader` re-pinned (`.omp/agents/reader.md:4`), classifier fixtures, SPEC § A1.3 (`SPEC-2.0.md:80-84`), MIGRATION M3 row; `~/.omp/agent/config.yml:19` `modelRoles.commit` edited on Jo's explicit word (*"edit it in my oMP configu"*; backup `~/agent-scratch/agent-system-2.0/omp-config.yml.bak-2026-09-29`). Historical records (INVENTORY/REVIEW/old log entries) keep their 1.x measurements. Jo confirmed *"when you say opus-5 you mean opus-5-5 right?"* — yes.

## Also

**CLAIM**
- Hand's unicode probes (`ｒｍ -rf`, `rm −rf`) ALLOW correctly: live `zsh -c` → command not found / plain non-recursive rm; § A4 reserves `rm -rf` only.
- Unverified (hand's GUESS): `models.yml` `auth: oauth` may need an `apiKey` per `models-config.ts:70-73`; settles at the M3 gate run. Installer must place `models.yml` beside `config.yml` or dispatch fails closed — on the integration list.

## Next

**CLAIM**
Plumb's integration turn (no hand): manifest rows for `tiers/`, `classifier/`, `profile/` (incl. `models.yml`), `gates/`; `gates` in `install.sh` MACHINERY_DIRS; v2 loop in the fresh-machine test; run green. Then round-3 astra reviews (`529c765..559873e`, `cc6020d..9cb274a`) when the laptop stays awake; then M3/M4 gate runs (`MIGRATION.md:48-49`), close rows; wave 3 [M5, M6].

## Candidate lessons

**GUESS** (inference)
- OMP model availability = `~/.omp/agent/models.db` `model_cache`, not `pi-catalog/models.json`/`priority.json` (lagged a generation today).
- "No references to X" splits into live artifacts (edit) and dated records (leave); say which bucket each grep hit fell in.
- A hand-lifecycle invariant checked at the `task` tool result covers blocking hands only; on OMP it belongs on `agent_end`.

<!-- output-types
tier: 0
CLAIM: 5
CITE: 0
GUESS: 1 (inference 1)
ACTION: 0
PMDW: 0
QUESTION: 1
-->
