# Upstream skill-pack refresh and manifest review (M5b)

**PMDW**
Research hand for migration step M5b, 2026-09-28. Scope: the four upstream packs behind the 2.0 core skill manifest (`DESIGN-2.0.md` § C6.1), what changed since the June copies, and what the manifest, its absorption groupings, and the `includeSkills` allowlist need changed. Read-only everywhere except this file. Fresh clones live under `/tmp/skill-refresh/` and were left in place (list at the end of § 9).

## 0. Needs Jo — blockers and questions

**PMDW**
No blocker stopped this report. Two decisions need Jo now. The other proposed amendments are held in § 3.2, each with a recommendation. Plumb applies nothing until Jo rules on it (`MIGRATION.md` M5b sign-off column).

**QUESTION**
**Should 2.0 vendor superpowers' approved-plan execution for autonomous features (build question 8)?** Options and what each changes:
- **Vendor a subset (recommended).** Take `subagent-driven-development` + `executing-plans`, with their prompt files and scripts, from `obra/superpowers` v6.4.2. Merge them into **one new manifest row** (working name `execute-plan`; kind change-large; mode **autonomous**). Copy once, then own it. Rewrite its eight `superpowers:*` cross-references so they point at existing manifest rows. Effect: the manifest goes from 20 to 21 rows. P-22's "features execute an approved plan without pausing between tasks" gets a procedure written for exactly that. 2.0 owns a fork of about 940 lines plus five bash helpers and stops receiving upstream fixes automatically.
- **Vendor all 15 skills.** This imports the brainstorming `<HARD-GATE>` (per-task human approval that cannot be switched off), a second TDD, a second debugging procedure, a second code-review procedure, a git-worktree procedure, and a session bootstrap injector. It duplicates rows #3–#7 and contradicts the 20-row sizing rule and the Q-d allowlist ruling.
- **Do not vendor.** Instead, absorb Osmani's `/build auto` procedure (`/tmp/skill-refresh/agent-skills/.claude/commands/build.md`) into an existing row. This costs the least. But `/build auto` **stops and asks** on spec ambiguity. It does not rule on the ambiguity and keep going, so it pauses more than P-22's autonomous definition wants.
- Evidence is in § 6. Work proceeded under no assumption: nothing was vendored.

**QUESTION**
**Where does the one new Osmani skill, `constraint-driven-development`, go?** Options:
- **Split it (recommended).** Its product-agnostic half moves into row #6 `code-review-and-quality` as a review lens: the "Floor" (no new suppressions, no skipped or deleted tests, no stubs, no secrets, no weakened bar) and "Step 6: Guard the bar itself", plus its `references/floor-guard.md`. The same half becomes an input to the P-4 automated gate. The per-repo interview and the `CONSTRAINTS.md` thresholds go to product repos (P-5). Row count unchanged.
- **Add it as its own row.** 21 rows (22 if superpowers is also added). The skill's own text says the interview must not run in autonomous contexts, so half the skill would be user-driven only.
- **Ignore it.** This loses the only upstream text aimed at an agent weakening its own tests to reach green, which is the main risk of autonomous mode.

**GUESS**
(inference) Neither question blocks M6. A "no" to superpowers leaves the 20-row manifest intact. The constraint split only edits row #6's absorb list.

## 1. Per-pack versions

| pack | pinned (June copy) | upstream latest tag · commit · date | commits between | label |
|---|---|---|---|---|
| `addyosmani/agent-skills` | tag `0.6.2` · `d187883b7d761265309cdcc0f202cc76b4b3fb06` · 2026-06-10 | **`0.6.11` · `2686b620fc1fed2e8f60c704839c766b8594c6b6` · 2026-09-25 21:19:37 -0700**. HEAD is this tag: `git describe --tags` → `0.6.11` | **361** (`git rev-list --count d187883..HEAD` → `361`) | CITE |
| `pbakaus/impeccable` (skill) | frontmatter `version: 3.5.0`. No commit recorded. Tag `skill-v3.5.0` = `99fbe4bb10a1453c82027a477503ce240d9b0b47` · 2026-05-28 | **`skill-v4.3.1` · `cd12f8660e2dde57b9615c8a6b8ea674101f9cfc` · 2026-09-08 19:23:50 -0700**. Main is 61 commits past it with frontmatter `version: 4.4.0` and no tag | **1160** (`git rev-list --count skill-v3.5.0..skill-v4.3.1`) | CITE |
| `pbakaus/impeccable` (CLI / engine) | the June copy came from `npx impeccable@latest skills install` (`/Users/jowolff/code/shipyard/scripts/refresh-vendor-skills.sh:115`) | npm `latest` = **4.1.0** (`npm view impeccable dist-tags` → `"latest": "4.1.0"`). Tag `cli-v4.1.0` = `73a6f51a540bc3938a2c40677d074c70b81fa5a0` · 2026-09-08. Engine tag `engine-v0.1.5` = `112703d5bf2469574758e0ddc5baf8e03c958f58`, which matches `scripts/VERSION` = `0.1.5` at `skill-v4.3.1` | — | CITE |
| `blader/humanizer` | `2.8.0` · `9600f2b7241cb4eed6ad803abee5ea01d67fe8e4` · 2026-06-07 | **`v3.1.0` · `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8` · 2026-09-27 22:54:38 -0700**. HEAD is this tag | **60** (`git rev-list --count 9600f2b..v3.1.0`) | CITE |
| `obra/superpowers` | **not pinned — not installed** (no `superpowers` dir under any `/Users/jowolff/.claude/plugins/cache/*/`, `/Users/jowolff/.omp/agent/skills/`, `/Users/jowolff/.agents/skills/`; `ls` → "No such file or directory" for each) | **`v6.4.2` · `8ca22dba9a94f28898bbce59f2537ff4d87c747d` · 2026-09-25 11:06:27 -0700**. HEAD is this tag | n/a (683 commits total at the tag) | CITE / CLAIM |

**CLAIM**
Jo's clone `/Users/jowolff/code/agent-skills` sits exactly at the June pin: `git -C /Users/jowolff/code/agent-skills log -1` → `d187883b… 2026-06-10 18:39:38 -0700 (HEAD -> main, tag: 0.6.2)`. The brief's "361 behind" matches the count above. I did not modify that clone.

**CLAIM**
The June humanizer copy is byte-identical to upstream `9600f2b:SKILL.md`. Both hash to `2efe22f6a7614510cb7dcff162ff5bbf68fc0468` (`git hash-object`).

**CLAIM**
The June impeccable copy cannot be rebuilt from any git tag. `diff -rq` against both `.claude/skills/impeccable` and `plugin/skills/impeccable` at `skill-v3.5.0` shows about 30 differing or missing files. `git log --all --find-object=27156fa7…` (the June `SKILL.md` blob) returns nothing. The June `SKILL.md` also carries `${CLAUDE_PLUGIN_ROOT}/skills/impeccable/scripts/...` paths and lacks the tag's "Copy" rules block.

**GUESS**
(inference, strong basis) The June copy is whatever the npm CLI installed on 2026-06-12. npm's publish times put `2.3.2` at 2026-05-30 and `3.0.0` at 2026-06-15 (`npm view impeccable time`), so on 2026-06-12 the CLI would have been `2.3.2`. It bundled a skill whose frontmatter read 3.5.0. This is why the 2.0 pin needs a git tag and commit, not a frontmatter version.

## 2. agent-skills diff, `d187883..0.6.11`, `skills/` only

**CITE**
`git diff --name-status -M d187883..0.6.11 -- skills/` in `/tmp/skill-refresh/agent-skills`: 26 files, 1628 insertions, 410 deletions. **No skill removed, none renamed.** One skill added. The skill-directory count went from 24 to 25 (`git ls-tree --name-only <rev> skills/ | wc -l` → 24 / 25). Description lines come from `git diff -U0 … | grep '^[-+]description:'`. Body summaries come from the per-skill diffs and `git log d187883..0.6.11 -- skills/`.

| skill | status | `description` changed? | body change, one line | C6 placement | label |
|---|---|---|---|---|---|
| `constraint-driven-development` | **ADDED** (+ `references/floor-guard.md`) | new | Writes a per-repo `CONSTRAINTS.md` quality bar from a four-question interview; enforces a Floor (no new suppressions, stubs, skipped tests, secrets, weakened bar); ships a diff-scoped floor-guard reference; says "Don't run [the interview] in non-interactive contexts (CI, `/loop`, autonomous runs)" | unplaced — QUESTION 2 | CITE |
| `api-and-interface-design` | modified | no | New § 6 "Honouring an Idempotency Key" (atomic claim, payload mismatch, retention) + checklist rows | #15 base | CITE |
| `browser-testing-with-devtools` | modified | no (upstream) | Default MCP arg `--autoConnect` → `--isolated`; new "Profile Isolation" rules | C6.2 product-repo | CITE |
| `code-review-and-quality` | modified | **yes**: adds "Use when asked to review a diff or a pull request, even when the diff is pasted inline." | Structural-depth lenses, "Structural Remedies" section, file-size signal, dependency-upgrade workflow; **severity labels changed to Critical / Required / Optional / Nit** | #6 base | CITE |
| `context-engineering` | modified | no | New "Restartable Session Boundaries" and "Context Budget Management" (trim at 75%) | C6.2 drop | CITE |
| `debugging-and-error-recovery` | modified | **yes**: adds "something that worked yesterday broke", "figure out what broke and why" | Ecosystem-neutral test commands; step-range typo fix | #5 base | CITE |
| `deprecation-and-migration` | modified | **yes**: adds database schema migration (expand/contract) | New "Database Schema Migrations (Expand/Contract)" section + checklist | #18 base | CITE |
| `documentation-and-adrs` | modified | **yes**: adds "document an architecture decision (ADR) or the reasoning behind a design choice" | New "Match the existing convention first" (location, numbering, template) | #10 base | CITE |
| `doubt-driven-development` | modified | **yes**: adds "every assumption cross-examined", "stress-testing a plan" | Reference path `references/…` → `../../references/…` only | absorbed into #14 | CITE |
| `frontend-ui-engineering` | modified | **yes**: now "production-quality, **accessible, responsive** … **meeting WCAG accessibility requirements**" | New "Reference-led UI quality" section; finish-gate review; more state checks | absorbed into #20 | CITE |
| `git-workflow-and-versioning` | modified | **yes**: adds "splitting uncommitted work … into clean atomic commits, opening or reviewing a pull request (PR), pushing to a remote … cutting a release, choosing a semantic version bump, tagging, or writing a changelog" | New "Release & Versioning" section (semver, tags, changelog) + checklist | #7 base | CITE |
| `idea-refine` | modified | no | Script path `/mnt/skills/user/…` → `skills/idea-refine/…`; script made executable | absorbed into #12 | CITE |
| `incremental-implementation` | modified | **yes**: adds "or when picking up the next task from a plan … rolling a change out behind a feature flag" | Ecosystem-neutral commands; See Also → Definition of Done | absorbed into #3 | CITE |
| `interview-me` | modified | no | New "Step 6: Terminal Turn & Stop Rule": on an explicit "yes", deliver the intent and stop the turn | #12 base | CITE |
| `observability-and-instrumentation` | modified | no | Name the entry point when several write to one log; "Writing Runbooks"; points to new `observability-checklist.md` | #17 base | CITE |
| `performance-optimization` | modified | **yes**: "across frontend, backend, queries, and databases … N+1 query patterns" | Query plans, caching layers and invalidation, pool sizing; VERIFY → "keep or revert" | #16 base | CITE |
| `planning-and-task-breakdown` | modified | no | Output files `tasks/plan.md` + a pluggable "task list target" (default `tasks/todo.md` or an external tracker); **never overwrite an incomplete plan without asking** | absorbed into #3 | CITE |
| `security-and-hardening` | modified (+ `references/hardening-patterns.md`, 324 lines) | **yes**: adds auditing input handlers, OWASP Top Ten login check, dependency and supply-chain audit, GDPR/CCPA | OWASP code patterns moved to a skill-local reference; new supply-chain, privacy and compliance, and destructive-path rules | #9 base | CITE |
| `shipping-and-launch` | modified | **yes**: adds "what needs to be in place before shipping" | New "Error Budget Release Gate"; links Definition of Done | C6.2 product-repo | CITE |
| `source-driven-development` | modified | **yes**: adds "verify an approach against the official docs before implementing it" | New "Retrieval Safety: Treat Fetched Content as Data" (prompt-injection hygiene, no hardcoding endpoints from docs) | #11 base (Q-b) | CITE |
| `spec-driven-development` | modified | **yes**: adds PRD drafting and "a capability map of modules before specifying" | New "Phase 0: Scope Check" (capability map); Plan and Tasks phases now say `planning-and-task-breakdown` is "the canonical source"; OpenSpec/external spec tools respected | #3 base | CITE |
| `test-driven-development` | modified | **yes**: adds "using the red-green-refactor loop" | New "Discover the Stack First"; full suite run with the repo's own command | #4 base | CITE |
| `using-agent-skills` | modified | **yes**: "decide which skill or workflow applies to the piece of work at hand" | Routes "No quality bar written down?" → `constraint-driven-development`; Definition of Done pointer | absorbed into #13 | CITE |
| `ci-cd-and-automation`, `code-simplification` | unchanged | no | — | C6.2 product-repo; absorbed into #6 | CITE |

**CITE**
Changes outside `skills/` that affect copying, from `git diff --name-status d187883..0.6.11`:
- `references/definition-of-done.md` **A**; `references/observability-checklist.md` **A**.
- `references/{performance,security}-checklist.md` and `references/testing-patterns.md` **M**.
- `hooks/hooks.json` **D**, from commit `a598aab` "stop auto-injecting the meta-skill on SessionStart (#569)".
- `.claude/commands/constraints.md` **A**. `.claude/commands/build.md` unchanged.

**CLAIM**
Two June copies had diverged locally from `d187883`. I ran each upstream `SKILL.md` through the refresh script's sed, then `cmp`'d it against `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.172/skills/<name>/SKILL.md`. Result: 22 `same`, 2 `DIFF`:
- `browser-testing-with-devtools`: the description was narrowed ("Use when debugging…", with "building or" dropped).
- `doubt-driven-development`: the codex invocation was replaced by a `-c permissions.doubtro…` network-enabled profile, with a measured note dated 2026-08-14.

A wholesale refresh overwrites both edits. Neither skill is a manifest base, so the loss only matters for #14's copy-once text.

## 3. Impact on the C6.1 manifest

### 3.1 Row by row

**PMDW**
Rows #1 `ctx` and #8 `resolving-merge-conflicts` come from no pack and are omitted. Upstream file paths are relative to `/tmp/skill-refresh/agent-skills/` unless stated. Row numbers are C6.1's (`/Users/jowolff/code/agent-system-2.0/DESIGN-2.0.md`, heading `### C6.1 The shortlist — 2.0's manifest`).

| C6.1 row | pack skill(s) | upstream path at latest | verdict | grouping still holds? | label |
|---|---|---|---|---|---|
| #2 `humanizer` | `blader/humanizer` | `/tmp/skill-refresh/humanizer/SKILL.md` @ `v3.1.0` | **changed, major**: 3.0.0 rebuilt it (35 patterns → 25, now 26 in 3.1.0); `allowed-tools` removed (2.9.1); version moved to `metadata.version` (2.8.3); output modes added (2.9.0) | yes — no absorptions | CITE |
| #3 `spec-and-plan` | base `spec-driven-development`; absorbs `planning-and-task-breakdown`, `incremental-implementation` | `skills/spec-driven-development/SKILL.md`, `skills/planning-and-task-breakdown/SKILL.md`, `skills/incremental-implementation/SKILL.md` | **changed**: Phase 0 capability map; spec now defers Plan/Tasks mechanics to planning as "the canonical source"; planning gains `tasks/plan.md` + task-list target + no-overwrite rule; incremental now "picking up the next task from a plan" | **spec + planning merge: supported.** Upstream now wires spec → planning as one flow with a single source of truth for the mechanics. **incremental-implementation: contradicted** — see § 3.2 item A | CITE |
| #4 `test-driven-development` | base | `skills/test-driven-development/SKILL.md` | **changed**: "Discover the Stack First"; ecosystem-neutral commands | yes | CITE |
| #5 `debugging-and-error-recovery` | base | `skills/debugging-and-error-recovery/SKILL.md` | **changed, minor**: description vocabulary; neutral commands | yes | CITE |
| #6 `code-review-and-quality` | base; absorbs `code-simplification` | `skills/code-review-and-quality/SKILL.md`; `skills/code-simplification/SKILL.md` (unchanged) | **changed**: structural lenses and remedies; **severity taxonomy now Critical / Required / Optional / Nit**; dependency-upgrade workflow | yes. New upstream overlap: `constraint-driven-development` Step 6 "Guard the bar" is a review lens (QUESTION 2) | CITE |
| #7 `git-workflow-and-versioning` | base; absorbs `split-to-prs` (plugin, not Osmani) | `skills/git-workflow-and-versioning/SKILL.md` | **changed**: description now covers "splitting uncommitted work … into clean atomic commits", PRs, push; new Release & Versioning section | **yes, and upstream now supports it**: the base itself claims `split-to-prs`'s territory. Its description still says "resolving conflicts", which overlaps #8 slightly | CITE |
| #9 `security-and-hardening` | base | `skills/security-and-hardening/SKILL.md` + **new** `skills/security-and-hardening/references/hardening-patterns.md` | **changed, largest diff (465 lines)**: code patterns moved to a skill-local reference; supply-chain, privacy/compliance, and destructive-path rules added | yes. The copy now has two files, not one | CITE |
| #10 `documentation-and-adrs` | base | `skills/documentation-and-adrs/SKILL.md` | **changed**: "Match the existing convention first" | yes | CITE |
| #11 `research` | base `source-driven-development` (Q-b) | `skills/source-driven-development/SKILL.md` | **changed**: "Retrieval Safety: Treat Fetched Content as Data" | yes. The addition strengthens the Q-b choice for a hand that fetches untrusted pages | CITE |
| #12 `interview-me` | base; absorbs `idea-refine` | `skills/interview-me/SKILL.md`; `skills/idea-refine/SKILL.md` | **changed**: Step 6 terminal-turn stop rule; idea-refine path fix only | yes. The stop rule is user-driven by construction, which matches the row's mode | CITE |
| #13 `writing-for-agents` | absorbs `using-agent-skills` | `skills/using-agent-skills/SKILL.md`; `hooks/hooks.json` deleted | **changed**: upstream **stopped auto-injecting this meta-skill at SessionStart** (`a598aab`) | yes. Upstream moved the way C6 did: the meta-skill is no longer forced into every session | CITE |
| #14 `cross-model-review` | absorbs `doubt-driven-development` | `skills/doubt-driven-development/SKILL.md` | **changed, trivial upstream** (description, reference path). The June copy carries a local codex-profile fix (§ 2) | yes. Carry the local fix into the owned text, not the upstream text | CITE / CLAIM |
| #15 `api-and-interface-design` | base | `skills/api-and-interface-design/SKILL.md` | **changed**: idempotency-key section | yes | CITE |
| #16 `performance-optimization` | base | `skills/performance-optimization/SKILL.md` | **changed, large**: backend, query, cache, and pool material | yes | CITE |
| #17 `observability-and-instrumentation` | base | `skills/observability-and-instrumentation/SKILL.md` → **new** `references/observability-checklist.md` | **changed**: entry-point logging, runbooks | yes. The copy now needs a reference file the June store lacks | CITE |
| #18 `deprecation-and-migration` | base | `skills/deprecation-and-migration/SKILL.md` | **changed**: database expand/contract | yes | CITE |
| #19 `accessibility` | none today (Q-e) | `skills/frontend-ui-engineering/SKILL.md` (now claims WCAG), `references/accessibility-checklist.md` (unchanged), `skills/constraint-driven-development/SKILL.md:120,158` (axe-core `wcag2a,wcag2aa,wcag21aa`), impeccable `reference/audit.md` | **no pack skill fills the slot**. No new upstream a11y skill in any of the four packs | the slot stands. § 3.2 item C adds these files to the Q-e comparison | CITE |
| #20 `impeccable` | base; absorbs `frontend-ui-engineering` | `/tmp/skill-refresh/impeccable/plugin/skills/impeccable/SKILL.md` @ `skill-v4.3.1` | **changed, major** (§ 5): 3.5.0 → 4.3.1; **the row's note "drives `npx impeccable`" is now false**; `allowed-tools` gone; a self-contained engine binary; native iOS/Android references; an installable detector hook | the absorption holds (impeccable 4.x `audit` still covers a11y, perf, responsive). The absorbed skill now carries WCAG content → § 3.2 item C | CITE |

### 3.2 Proposed amendments (held for Jo; one ruling each)

**PMDW**
Each item states the change, the recommendation, and why. None is applied.

**GUESS**
(inference) **A. Move `incremental-implementation` out of #3.** Row #3 is kind *judge*. Upstream now scopes `incremental-implementation` as the skill for "picking up the next task from a plan" (`/tmp/skill-refresh/agent-skills/skills/incremental-implementation/SKILL.md:3`), and `/build` and `/build auto` both invoke it (`/tmp/skill-refresh/agent-skills/.claude/commands/build.md:5`). That makes it execution (*change*), not planning. Recommendation: if QUESTION 1 is answered "vendor a subset", absorb it into the new `execute-plan` row. If "do not vendor", absorb it into #4 `test-driven-development` (the per-slice loop). Either way #3 keeps spec + planning. The allowlist is unaffected, since the absorbed name was never in it.

**CLAIM**
**B. Row #20's note is stale.** C6.1 row #20 says impeccable "drives `npx impeccable`". The June `SKILL.md` frontmatter has `allowed-tools: - Bash(npx impeccable *)`. At `skill-v4.3.1`, `plugin/skills/impeccable/SKILL.md:1-9` has no `allowed-tools`, and Setup runs `"${CLAUDE_SKILL_DIR}/scripts/impeccable" context` (line 19). Recommendation: rewrite the note to "drives its bundled `scripts/impeccable` launcher (engine binary pinned by `scripts/VERSION`)".

**GUESS**
(inference) **C. Feed three more texts into the Q-e accessibility comparison (#19).** When `frontend-ui-engineering` is absorbed into impeccable, its new WCAG scope and `references/accessibility-checklist.md` go with it. `constraint-driven-development` also names axe-core with WCAG 2.1 AA tags as the external accessibility check. The research hand that decides Q-e should compare `newdle-a11y-audit` against these three, not only against published a11y skills.

**GUESS**
(inference) **D. Humanizer's re-copy is a new text, not a refresh.** 3.0.0 renumbered and cut the patterns (35 → 26). Any 1.x rule or doc that cites a humanizer pattern number (§-number) points at the wrong pattern after the re-copy. I did not grep the 2.0 repo for pattern-number citations; that check is cheap and belongs to the M6 builder.

**CLAIM**
**E. The June copy mechanism breaks on 0.6.11 and should not carry into 2.0.**
- Commit `91d4d07` changed skill links to `../../references/<file>.md`. The refresh script's sed (`/Users/jowolff/code/shipyard/scripts/refresh-vendor-skills.sh:98-99`), run on that form, printed `../../\${CLAUDE_PLUGIN_ROOT}/references/performance-checklist.md` in this session.
- Run on the new skill-local `references/hardening-patterns.md`, it printed `${CLAUDE_PLUGIN_ROOT}/references/hardening-patterns.md`. That file is not in the plugin's `references/` (`ls …/newdle/0.2.172/references/` lists no `hardening-patterns.md`, `definition-of-done.md`, or `observability-checklist.md`).
- The script also `git pull`s Jo's clone (`:83`) and `~/.cursor/skills/humanizer` (`:67,130`), and reads humanizer's version with `grep '^version:'` (`:142`). In v3.1.0 that field is `metadata.version`, so the read returns nothing.

**GUESS**
(inference) Recommendation for E: 2.0's copy step clones each pin by tag into a temp dir. It copies each manifest skill directory whole, including skill-local `references/`. It copies only the pack-level `references/*.md` the kept skills cite (list below). It leaves the relative links alone, so they resolve inside the 2.0 skill root. Relative links survive only if 2.0 keeps a `skills/<name>/` + `references/` layout two levels apart; that is a build choice to confirm at M6.

**CITE**
Pack-level references cited by manifest skills at 0.6.11 (`grep -roE '(\.\./\.\./)?references/[a-z-]+\.md' skills/*/SKILL.md`):
- `performance-checklist.md` (#6, #16)
- `security-checklist.md` (#6, #9)
- `definition-of-done.md` (#3 via planning and incremental; #13 via using-agent-skills)
- `observability-checklist.md` (#17)
- `testing-patterns.md` (#4)
- `accessibility-checklist.md` (#20 via frontend)
- `orchestration-patterns.md` (#14 via doubt-driven)

Skill-local: `security-and-hardening/references/hardening-patterns.md`, `constraint-driven-development/references/floor-guard.md`.

**CLAIM**
**F. Allowlist (`includeSkills`) names: no change forced by upstream.** No pack skill that is a C6.1 base was renamed or removed (§ 2 name-status: only `M` and one `A` under `skills/`). The allowlist changes only if Jo adds a row: `execute-plan` (QUESTION 1) and/or `constraint-driven-development` as its own row (QUESTION 2).

**CLAIM**
**G. C6.2 dispositions unaffected.** `ci-cd-and-automation` is unchanged. `shipping-and-launch` and `browser-testing-with-devtools` changed but remain product-repo. `context-engineering` gained "Restartable Session Boundaries" but stays dropped. Sources: § 2 table and `DESIGN-2.0.md` § C6.2 rows "Product-repo skills" and "Plugin skills unplaced".

**GUESS**
(inference) One item for Plumb to look at: `context-engineering`'s new "Restartable Session Boundaries" (persist state at a completed task boundary, not at a token count) is close to § B7 wake. It is worth one read as reference input to wake; it is not a reason to un-drop the skill.

## 4. New upstream skills not in the June copy

| skill | pack | recommendation | why, against the C6 sizing rule ("machinery a lane or hand loads for a kind of work in a mode") | label |
|---|---|---|---|---|
| `constraint-driven-development` | agent-skills 0.6.11 | **split**: Floor + guard → #6; interview + `CONSTRAINTS.md` → product-repo (QUESTION 2) | The Floor is product-agnostic judge work in both modes and targets autonomous-mode risk. The interview is per-repo and, by its own text (`skills/constraint-driven-development/SKILL.md:38`), user-driven only | GUESS (recommendation) on a CITE receipt |
| `diagnosing-superpowers` | superpowers v6.4.1+ | ignore | Diagnoses superpowers sessions specifically; no use without the full pack | GUESS |
| humanizer, impeccable | — | no new skills. impeccable added *sub-commands and references* (`doctor`, `hooks`, native `ios.md`/`android.md`, `operate.md`, `craft-floor.md`), not separate skills | — | CITE (`ls` of `plugin/skills/impeccable/reference` @ `skill-v4.3.1`) |

## 5. impeccable and humanizer

### impeccable 3.5.0 → 4.3.1

**CITE**
Breaking changes to invocation (`/tmp/skill-refresh/extract/imp-4.3.1/plugin/skills/impeccable/SKILL.md`, `scripts/impeccable`, and `README.npm.md` @ `cli-v4.1.0`):
1. **`allowed-tools: Bash(npx impeccable *)` removed.** The skill calls `"${CLAUDE_SKILL_DIR}/scripts/impeccable" <verb>`.
2. **The node scripts are gone.** In 3.5.0, `scripts/` held about 25 `*.mjs` files (`context.mjs`, `detect.mjs`, `palette.mjs`, `live-*.mjs`, …). In 4.3.1 it holds a POSIX launcher `impeccable`, an `impeccable.cmd`, `VERSION` = `0.1.5`, `command-metadata.json`, `data/`, and four browser `.js` bundles.
3. **The launcher runs a prebuilt engine binary.** It looks in `$IMPECCABLE_BIN`, then a version-pinned cache at `${IMPECCABLE_HOME:-$HOME/.impeccable}/bin/<VERSION>/`. If absent, it downloads from `https://github.com/pbakaus/impeccable/releases/download` and verifies against a `.sha256` sidecar fetched from the same place (`scripts/impeccable:75-160`). It "needs network access and write permission" on first run (`:91`).
4. **The CLI command is renamed.** It is now `npx impeccable install` (`skills install` is "the legacy namespace and still works"). It installs **hook manifests by default** unless `--no-hooks`. It requires Node ≥ 22.18.0 (`package.json` `engines`).
5. **New project-level detector hook** (`reference/hooks.md:17,106`). `/impeccable hooks on` writes `.claude/settings.local.json`, `.codex/hooks.json`, `.cursor/hooks.json`, `.github/hooks/impeccable.json`, or `.grok/hooks/…`. No OMP target is listed.
6. **`craft` is a deprecated alias**; new `doctor`, `hooks`, and native-platform references.

**GUESS**
(inference) What this changes for "copy once, then own" (row #20):
- **The engine is not in the copy.** Owning the skill text does not own the binary. The first run on a fresh machine downloads `engine 0.1.5` unless 2.0 either pins `IMPECCABLE_BIN` to a vendored binary or accepts the download. The integrity check is the same-origin sha256 sidecar, so a compromised release channel defeats it. This matters for the "fresh-machine install test" P-4 names.
- **Pick the harness variant deliberately.** The tag ships `.claude/`, `.pi/`, `.agents/`, `plugin/`, and other variants that differ only in how the skill directory is spelled (`diff` of `.claude` vs `plugin` `SKILL.md` @ `skill-v4.3.1`: lines 19 and 80). Whether OMP expands `${CLAUDE_SKILL_DIR}` is untested. If it does not, the `.agents/` or `.pi/` variant (literal `<skill-base-dir>` placeholder) is the safer copy.
- **Keep the hook off in 2.0.** It writes per-repo harness manifests, which is outside the lane's hands under § A4. Copy with `--no-hooks` if copying through the CLI at all.

### humanizer 2.8.0 → 3.1.0

**CITE**
From `/tmp/skill-refresh/humanizer/CHANGELOG.md` @ `v3.1.0` and `git show v3.1.0:SKILL.md`:
- **2.8.3** moved the version to `metadata.version`.
- **2.9.0** added the no-fabrication rule and three output modes.
- **2.9.1** "Removed unsupported metadata, tool approvals". The June frontmatter's `allowed-tools: Read, Write, Edit, Grep, Glob, AskUserQuestion` is gone at v3.1.0 (`grep allowed-tools` → no match).
- **3.0.0** "consolidated 35 patterns into 25", regrouped under an explanation of why AI text sounds the way it does.
- **3.1.0** added #26 "Re-explaining what the reader knows", for 26 patterns.
- Size: 621 → 397 lines.

**CITE**
Invocation modes at v3.1.0 (`SKILL.md:47-53`):
- **Pasted text (default)**: draft, a short list of remaining patterns, and the final rewrite.
- **File mode**: rewrite prose only and keep code, paths, and YAML unchanged.
- **Embedded mode**: "When another task uses this skill for a pull request, commit message, or document, return only the final text."

**GUESS**
(inference) Embedded mode is the one an autonomous lane wants, and 2.0's owned copy should keep it. Losing `AskUserQuestion` from `allowed-tools` changes nothing for OMP, since OMP does not read that field the way Claude Code does. That is untested and does not matter for the copy. No breaking change to the name or the trigger.

## 6. superpowers v6.4.2 and build question 8

**CITE**
Skills at `v6.4.2` (`git ls-tree --name-only v6.4.2 skills/`, 15), with `SKILL.md` line counts: `brainstorming` 285, `diagnosing-superpowers` 120, `dispatching-parallel-agents` 167, `executing-plans` 373, `finishing-a-development-branch` 225, `receiving-code-review` 205, `requesting-code-review` 95, `subagent-driven-development` 568, `systematic-debugging` 283, `test-driven-development` 330, `using-git-worktrees` 167, `using-superpowers` 65, `verification-before-completion` 120, `writing-plans` 204, `writing-skills` 681. MIT licence.

**CITE**
How plan execution is gated at v6.4.2:
- **Before execution: human gates.** The `brainstorming/SKILL.md:38-56` `<HARD-GATE>` requires, on the Architectural path, that "the human partner reviews and approves the written spec, then reviews the written implementation plan and selects its execution method". Even Bounded one-file work needs "the human partner approves the short in-chat design". `writing-plans/SKILL.md:179-200` "Execution Handoff" asks the partner to review the saved plan and choose Subagent-driven or Native.
- **During execution: no pauses between tasks.** `subagent-driven-development/SKILL.md:17`: "Do not pause to check in with your human partner between tasks. Execute all tasks from the plan without stopping." `executing-plans/SKILL.md:27-30` says the same for inline execution.
- **Ambiguity handling.** Both files: "**Rulings, not stalls.** … decide them … Record every decision in the ledger as `Ruling: <what you decided> — <why> — <what it costs if wrong>`, and keep going."
- **Four stops only.** "an irreversible or destructive operation; a security-sensitive action; a side effect outside this worktree that norms say you ask about first (a merge, a push to a shared branch, a publish); and a plan so broken that every path forward is a guess."
- **Setup and end gates.** Setup: "Never start implementation on a main/master branch without your human partner's explicit consent" (`executing-plans:112`). End: `finishing-a-development-branch:81` "Wait for their answer; the integration decision is theirs".
- **New since the operating-modes research.** v6.4.1 release notes: "`executing-plans` no longer stops every few tasks to check in with you. It runs the whole plan, then gets one review at the end", now a "Native (inline) execution" mode (`RELEASE-NOTES.md:19-35`). v6.4.2 made plans leaner (`:3-15`).

**CITE**
The execution pair is not self-contained. `grep -rhoE 'superpowers:[a-z-]+'` over `executing-plans` + `subagent-driven-development` finds:
- `finishing-a-development-branch` ×8, `subagent-driven-development` ×3.
- `requesting-code-review` ×2, `test-driven-development` ×2, `using-git-worktrees` ×2.
- `systematic-debugging` ×1, `verification-before-completion` ×1, `writing-plans` ×1.

Five bash helpers ship with them: `executing-plans/scripts/{task-start,task-done}` and `subagent-driven-development/scripts/{sdd-workspace,task-brief,review-package}`. `sdd-workspace` creates `<repo-root>/.superpowers/sdd/<plan>/` with a `.gitignore` (lines 6, 24, 45-46, 65).

**CITE**
Pi support exists: `.pi/extensions/superpowers.ts` registers the skills dir and injects the `using-superpowers` bootstrap on `session_start`/`session_compact`. `skills/using-superpowers/references/pi-tools.md` says "Pi core does not ship a standard subagent tool … If no subagent tool is available, do not fabricate `Task` calls".

**GUESS**
(inference) Whether OMP counts as "Pi" for that extension, and whether OMP's `task` tool satisfies subagent dispatch, is untested. If not, the vendored text falls back to `executing-plans` (inline), which is the cheaper mode anyway.

**GUESS**
(inference) **Answer: a subset serves P-22's autonomous feature path. A single skill does not.** `subagent-driven-development` and `executing-plans` are the only two skills that implement "execute an approved plan without pausing between tasks". They share one workspace and ledger. SDD falls back to inline when no subagent tool exists (its "When to Use" graph). They are one procedure with two cost profiles and belong in one row.

The rest of superpowers either duplicates C6.1 rows:
- `test-driven-development` → #4; `systematic-debugging` → #5; `requesting-`/`receiving-code-review` and `verification-before-completion` → #6 and the P-4 gate; `writing-plans` → #3; `writing-skills` → #13

or conflicts with 2.0 rulings:
- `brainstorming`'s HARD-GATE vs § B6 "spec-and-plan is the lane's first judge slice, by stakes".
- `finishing-a-development-branch`'s merge menu vs § A4's reserved list.
- `using-superpowers`' bootstrap injection vs the Q-d `includeSkills` allowlist.
- `using-git-worktrees` vs lane machinery.

**GUESS**
(inference) **Recommendation for build question 8: vendor a subset, as one owned row.** Pin superpowers at v6.4.2 and copy `subagent-driven-development/` + `executing-plans/` (prompts and scripts included). Merge them into one row, `execute-plan` (kind change-large, mode autonomous). Absorb `incremental-implementation` into it (§ 3.2 A). Then make four edits:
- Rewrite the eight `superpowers:*` references to manifest rows #3–#7.
- Map the "four stops" onto § A4's reserved list, so there is one stop list, not two.
- Keep "Rulings, not stalls" and point its `Ruling:` lines at the 2.0 ledger (§ B2).
- Delete the main/master consent line and the `finishing-a-development-branch` hand-off, because A4 already owns merge and push.

**Trade-off:** 2.0 owns about 940 lines plus five scripts and stops getting upstream fixes. Upstream shipped 85 commits between v6.0.0 and v6.4.2 (`git rev-list --count v6.0.0..v6.4.2` → 85), including workspace-collision and empty-range fixes (`RELEASE-NOTES.md` v6.4.1). The pin in § 7 makes a later re-diff cheap.

**GUESS**
(inference) Why not Osmani `/build auto` instead: it has the right shape (one approval, then every task, one commit each). But its stop list includes "the spec is ambiguous, or a task needs a decision the spec doesn't cover" (`/tmp/skill-refresh/agent-skills/.claude/commands/build.md`, step 6). That makes it pause on exactly the cases superpowers rules on and ledgers. It is also a slash command, and C6 carries no commands. It remains the fallback if Jo answers "do not vendor".

## 7. Proposed `VENDOR.md` pins for 2.0

| pack | upstream URL | tag | commit | date | copy source path | status | label |
|---|---|---|---|---|---|---|---|
| addyosmani/agent-skills | https://github.com/addyosmani/agent-skills.git | `0.6.11` | `2686b620fc1fed2e8f60c704839c766b8594c6b6` | 2026-09-25 | `skills/<name>/` per manifest row + the seven `references/*.md` in § 3.2 E | recommended | CITE |
| pbakaus/impeccable (skill) | https://github.com/pbakaus/impeccable.git | `skill-v4.3.1` | `cd12f8660e2dde57b9615c8a6b8ea674101f9cfc` | 2026-09-08 | `plugin/skills/impeccable/` (or `.agents/skills/impeccable/` if OMP does not expand `${CLAUDE_SKILL_DIR}`) | recommended | CITE |
| pbakaus/impeccable (engine it downloads) | https://github.com/pbakaus/impeccable/releases | `engine-v0.1.5` | `112703d5bf2469574758e0ddc5baf8e03c958f58` | 2026-09-08 | binary via launcher, or vendored and pointed at by `IMPECCABLE_BIN` | record alongside the skill pin | CITE |
| blader/humanizer | https://github.com/blader/humanizer.git | `v3.1.0` | `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8` | 2026-09-27 | `SKILL.md` + `LICENSE` | recommended | CITE |
| obra/superpowers | https://github.com/obra/superpowers.git | `v6.4.2` | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` | 2026-09-25 | `skills/subagent-driven-development/`, `skills/executing-plans/` | **only if QUESTION 1 = vendor a subset** | CITE |

**GUESS**
(inference) Do not pin impeccable's main (`114ea1d3…`, frontmatter 4.4.0, untagged) or humanizer by frontmatter version. The June impeccable pin shows a frontmatter version alone cannot be reproduced.

## 8. What was not verified

- **GUESS** — whether OMP expands `${CLAUDE_SKILL_DIR}` in skill text (affects the impeccable variant choice). Not tested.
- **GUESS** — whether OMP's `task` tool satisfies superpowers' subagent dispatch, and whether `.pi/extensions/superpowers.ts` loads under OMP. Not tested.
- **GUESS** — whether any 2.0 or 1.x text cites humanizer pattern numbers (§ 3.2 D). Not grepped.
- **GUESS** — the June impeccable copy's exact source (npm CLI 2.3.2) is inferred from publish dates, not observed.
- **PMDW** — I did not read every changed line of the 0.6.11 diff. For each manifest skill I read the per-skill diff hunks (artifact output of `git diff d187883..0.6.11 -- skills/<name>`). For `constraint-driven-development` I read its head, Floor, Steps 5–6, and the floor-guard contract. For impeccable I read `SKILL.md`, the launcher, `hooks.md` (grep), and `README.npm.md`, not the 30+ reference files.

## 9. Coverage

| source area | retrieved | opened and read | failures | sufficient? |
|---|---|---|---|---|
| First-party context (`DESIGN-2.0.md` § C6, `SPEC-2.0.md` § B13, `MIGRATION.md` M5b row, `research/operating-modes.md`, plugin `VENDOR.md`, `refresh-vendor-skills.sh`) | 6 files | all 6, by range or grep | The ctx-first hook refused the first grep until one `ctx search` ran (it returned nothing on-topic); the delegation hook refused one grep once, and the retry passed. Neither cost anything | yes — these define the manifest and the brief |
| addyosmani/agent-skills | fresh clone `/tmp/skill-refresh/agent-skills` | `git diff --stat/--name-status`, description diff, per-skill hunks for all 25 skills, `build.md` in full, `constraint-driven-development` by range, reference-link grep | none | yes. Next I would read `hardening-patterns.md` in full to confirm nothing from the old #9 body was dropped |
| June plugin copies | `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.172/skills/` | 24 addy `SKILL.md` via `cmp`, humanizer via hash, impeccable via `diff -rq` | none | yes |
| pbakaus/impeccable | fresh clone + `git archive` extracts of `skill-v3.5.0` and `skill-v4.3.1`; `npm view impeccable` | 4.3.1 `SKILL.md` in full, launcher by grep, `hooks.md` by grep, `README.npm.md` and `package.json` @ `cli-v4.1.0` by range | none | yes for invocation. The reference files were not opened; they do not change invocation |
| blader/humanizer | fresh clone | `CHANGELOG.md` top 80 lines, v3.1.0 `SKILL.md` sections, frontmatter of both versions, commit log | none | yes |
| obra/superpowers | fresh clone + `git archive` of `skills/` @ v6.4.2 | `executing-plans` 1–70, `subagent-driven-development` 1–60, grep of both for gates and cross-refs, `brainstorming` 36–58, `writing-plans` handoff grep, `pi-tools.md`, `.pi/extensions/superpowers.ts` 1–40, `RELEASE-NOTES.md` 1–80 | none | yes for gating and dependencies; `operating-modes.md` holds the deeper read. Next I would read SDD lines 60–568 (the review loop) before writing the owned text |

**CLAIM**
Nothing retrieved was left unopened, with one exception: the ~30 impeccable 4.3.1 `reference/*.md` files and the non-skill agent-skills changes (evals, docs, scripts) were retrieved in the clones and not opened. Neither bears on skill names, descriptions, or invocation.

**ACTION**
`mkdir -p /tmp/skill-refresh && git clone` of the four repos, plus `git fetch --tags` in each (exit 0). Extracts: `git archive … | tar -x` into `/tmp/skill-refresh/extract/{imp-3.5.0,imp-4.3.1,addy-d187883,sp-6.4.2}` (exit 0). One scratch file: `/tmp/skill-refresh/extract/cmp.md`. Total 467 MB (`du -sh`). Reverse with `rm -rf /tmp/skill-refresh`. `npm view impeccable …` ran from `/tmp/skill-refresh` (exit 0). It installs nothing but may have written npm's metadata cache under `~/.npm/_cacache`; reverse is `npm cache clean --force` if that matters. No other writes besides this file.

## Candidate lessons

- **GUESS** — A frontmatter `version:` is not a pin. The June impeccable copy says 3.5.0 and matches no commit. Every 2.0 pin should be tag + commit, and the copy should come from the git tag, not from an installer.
- **GUESS** — A copy step that rewrites links with a global sed breaks silently when upstream changes its link style (here `../../references/`). Copying the directory layout intact beats rewriting paths.
- **GUESS** — "Absorbs X" rows should state the absorbed skill's *kind*. The one contradiction found (§ 3.2 A) is an execution skill filed under a judge row, and a kind column on absorptions would have caught it.

<!-- output-types tier: 0 CLAIM: 11 CITE: 63 GUESS: 23 ACTION: 1 PMDW: 5 QUESTION: 2 -->
