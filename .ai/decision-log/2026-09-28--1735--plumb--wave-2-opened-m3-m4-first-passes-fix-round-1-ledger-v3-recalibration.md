---
date: 2026-09-28T17:35-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 execution — wave 2 opened (M3 ∥ M4); first passes, astra round 1, fix round 1, ledger v3, classifier re-measured; astra round 2 in flight at sleep
status: in-progress
durable: false
---

# Wave 2 opened; M3 and M4 through one review-fix round; ledger v3; classifier re-measured

**CLAIM**
Jo opened wave 2 (*"lets do it open it"*). By the laptop sleep: M3 (tier files + classifier) and M4 (P-11 gates) each have a first pass, an astra review, and a fix round landed; the ledger is at schema v3; the classifier question was re-measured live. Eleven commits since `f78930d`, `main` ahead of `origin/main` by 11 — **Jo pushes**. Tree clean except two pre-existing untracked `.ai/.gitignore` files that are not Plumb's.

## What changed, in order (commits on `main`)

**CLAIM**
1. `06c40b9` wave 2 opened on the M3/M4 rows; briefs `~/agent-scratch/agent-system-2.0/migration/{M3,M4}/BRIEF.md`.
2. `514634d` **M5 amended** — owned text (voice document from the C2.1 split of `~/.claude/CLAUDE.md`; owned output-types contract C4.7) is built at M5 with manifest rows; isolation gate adds: `~/.claude/CLAUDE.md` does not load (2.0 never sets `enabledProviders: [claude]`), the voice document does, and the repo `AGENTS.md`/`CLAUDE.md` chain still loads (`disabledProviders` names neither `agents-md` nor `claude-md`; both OMP-native priority-10 providers, `OMP_SRC/capability/index.ts:46-55,337,364-368`; home walk unconditional `discovery/helpers.ts:704-712`). Gap found by Jo's question; Jo: *"lets follow your recco"*.
3. `aa58fe3` **M3 first pass** (builder, opus-5-5; 40 tests): six tier files with no `model:` pins; classifier as an OMP extension (`tool_call` rewrites `tasks[i].agent` to the tier; `before_subagent_spawn` returns the tier's ordered model row); models only in the profile's `task.agentModelOverrides`. Build question 1 decided.
4. `eaa3159` **M3 rulings** (Jo, interactively): routing record = new append-only `routings` table (schema v3); provider-fallback rows 2–3 per tier approved as written (`profile/config.yml:31-45`). Plumb's calls: `modelRoles.judge` pinned to `typesafe/jev-1.13.0`; a brief with no `stakes` routes uncapped.
5. `dd14105` **M4 first pass** (builder, opus-5-5; 95 tests): one extension, one module per row, rows 1–12, 14, mode, question, G1–G3. Build question 7 decided: contract injected in `before_agent_start`, reaching hands via executor re-binding.
6. `71e3e07` **M4 ruling** (Jo): lane-written entries = new append-only `entries` table (schema v3). Plumb's calls: `gates/` joins the installer's machinery dirs; `approvalMode: yolo` with `ask` removed per role+mode by the extension (no profile-wide deny); contract path a placeholder until M5; full 1.x deploy list kept.
7. `de28132` **ledger v3** (builder, opus-5-5; 161 tests): `routings` (+ nullable `spawn_key`) and `entries` with the `instructions` trigger family; v2 files refused; `recordRouting`/`routings`/`recordEntry`/`entries`; fresh-machine test checks v3 (four lines + one comment authorized under `install/`).
8. `cc6020d` **M3 fix round 1** (astra pass 1: 3 blocking, 4 should-fix, 1 nit → all fixed; 66 tests): spawn constrained to credentialed row models, refuse when none usable; escape chains refused in config; spawn-key matching with per-call pending state; tier prompts cover every routable kind; checked judge answers; calibration gate on the question hash.
9. `caa9e85` **classifier re-measured** (research hand, opus-5-5; Jo: *"Re-measure now"*): 32 judgments on `typesafe/jev-1.13.0`, **$0.00101**; corrected question 21/30 (+2/2 review cases) vs old 23/30 on unchanged labels; two misses are two-file edits the old labels call change-small and the ruling calls change-large. **Threshold stays 0.55.** SPEC § A1.3 paragraph added (`SPEC-2.0.md:128`). The hand had no `eval` tool and drove OMP's host-side `runEvalJudgmentBatch` (`OMP_SRC/eval/judgment-batch-bridge.ts:490-545`) — same judge path.
10. `529c765` **M4 fix round 1** (astra pass 1: 6 blocking, 4 should-fix → all fixed; 148 tests): POSIX shell parser + nested-shell expander, fail closed on unreadable input; raw-ledger exemption by real script path only; `ledger_wake_read` tool checked at `session_stop`; rebase evidence from tool results keyed by repo+HEAD; question row judged on ledger state + declared kind/slice; failed instruction write holds the turn; one extension file per row; real v3 entries.
11. `717c2b9` **§ B9 amended** (Jo): `kind`/`slice` brief fields required only while a question is open.

## Decisions made (and why)

**CLAIM**
- All rulings above. Jo asked to be walked through decisions **interactively, one at a time** — done via `ask` with a recommendation each; every answer recorded on the M3/M4 rows the same turn.
- Fail-closed on unreadable gate input kept (P-11: refused, not warned); M11 counts how often lanes hit it.
- Research briefs that write a report file can now classify as change-large (routes up, never down) — left until P-16 data shows frequency.

## Found, not yet fixed — carried into fix round 2

**CLAIM**
- **Judge alias fragility:** `typesafe/jev-1.13.0` matches nothing in OMP's catalog (`OMP_SRC/priority.json:117` has only `jev-latest`), so it resolves to the alias; when TypeSafe moves the alias, the answer-model check refuses every dispatch until a re-sample. Plan (Jo asked *"how do we deal with that fragility?"*, recommendation given, not yet ruled-on beyond that): a `models.yml` custom entry `api: typesafe` pinning the version (the Laya hand proved the shape, `research/laya-vs-typesafe.md:26,220`; TypeSafe accepts versioned ids per `https://docs.typesafe.ai/models.md`), keep the answer-model check, and a B3 error line naming the drift and the re-sample cost.
- Fresh-machine test step 9 proves v1 refusal at install level but not v2 (`477af98` not in its loop) — add in the `install/` integration edit.

## Also diagnosed this session

**CLAIM**
Jo saw *"No API key found for anthropic"* in this pane at ~16:49 and had to `/login`. Cause: a caller-aborted OAuth preflight refresh (`omp.2026-09-28.50098.log` 16:49:20, coincident with the harness interrupting a running command to deliver Jo's message) → OMP blocks the credential row for **5 min** (`pi-ai/src/auth/select.ts:37,744-756`) → final pass finds no credential → the login prompt (`agent-session.ts:6897-6903`). Block row was in `auth_credential_blocks` (credential 11, until 16:54:20). Token itself valid to 2026-09-29 00:45. A separate fable-tier rate-limit block ran 16:42–16:47. Message is misleading for this case; inventory item for 2.0's B3 error surfacer.

## In flight at sleep

**CLAIM**
Two `reviewer-codex` hands on gpt-6-astra were running when Jo closed the laptop: `M3ReviewAstra2` (range `aa58fe3..caa9e85`) and `M4ReviewAstra2` (range `dd14105..529c765`), reports due at `~/agent-scratch/agent-system-2.0/migration/{M3,M4}/review-astra-2/REVIEW.md` — neither directory existed yet. **On wake: check for the two REVIEW.md files; if absent, re-dispatch both with the same task text** (in `history://` of this session, or reconstruct from this entry: same four skills, closed/partial/not per pass-1 finding, the named probes).

## Next

**CLAIM**
Fix round 2 for M3 (review 2 findings + judge-version pin) and M4 (review 2 findings), then Plumb's integration turn: manifest rows for `tiers/`, `classifier/`, `profile/`, `gates/`; `gates` in `install.sh` MACHINERY_DIRS and new manifest kinds; v2 loop in the fresh-machine test; fresh-machine test green; then the M3 and M4 gate runs from `MIGRATION.md:48-49`; close both rows. Then wave 3: [M5, M6].

## Candidate lessons

**GUESS** (inference)
- A repo-pinned agent type's **tool list** is a brief premise like its model pin: `research` has no `eval`, so "use `judge_batch` from the eval kernel" was a false premise the hand had to route around.
- "No API key found for <provider>" has three causes and one message; `auth_credential_blocks` distinguishes them. Check the table before re-logging in.
- A design ruling that classes an artifact as machinery without a migration row that writes it is the same failure P-11 row 10 was at M2; before each wave, check every machinery class in `DESIGN-2.0.md:52-64` has a producing step.
- Walking Jo through decisions one `ask` at a time with a recommendation worked: six rulings today, each recorded the same turn, no lost proposal-and-answer pairs.

<!-- output-types
tier: 0
CLAIM: 8
CITE: 0
GUESS: 1 (inference 1)
ACTION: 0
PMDW: 0
QUESTION: 0
-->
