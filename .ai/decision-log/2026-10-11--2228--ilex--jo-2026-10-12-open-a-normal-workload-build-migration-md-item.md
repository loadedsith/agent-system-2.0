---
date: 2026-10-11T22:28-07:00
engineer: Ilex
session: wl-mv4r19j1q885xc
status: resolved
durable: false
supersedes:
workload: wl-mv4r19j1q885xc
---

# Jo (2026-10-12): "open a normal workload: build MIGRATION.md item 106, the M8 wake render — Ledger.facts(repo) in the ledger module, the `## Repo facts` block in the lane's first prompt under FACTS_BUDGET_BYTES = 8000 with a "showing N of M" header, the lane_read_facts tool, one sentence in tiers/lane.md; DESIGN.md at /Users/jowolff/agent-scratch/agent-system-2.0/m8-wake-render/DESIGN.md is the spec; tests against the live m8-fact rows"
The spec is DESIGN.md §§ 5.1–5.8 (Plumb, 2026-10-12). Build exactly that:
- Ledger.facts(repo) in ledger/src/index.ts. It runs the M8 reader-contract query and drops every batch that has an `m8-rollback [<tag>]` entry.
- renderFacts plus FACTS_BUDGET_BYTES = 8000 in surface/src/facts.ts. Whole facts only, in fact-number order, with a header that says "showing N of M". A repo with no facts renders nothing. A ledger error renders "could not be read (<err>)".
- PromptInput.facts. firstPrompt pushes it before `## Decision-log context`, and promptFor computes it from ledger.facts(p.repo).
- lane_read_facts in surface/extensions/lane-tools.ts, added to LANE_TOOLS. It takes `repo?`, which defaults to the workload's repo, and `match?`, a case-insensitive substring match. It has no budget.
- One sentence in tiers/lane.md, per § 5.5. tiers/test/size.test.ts stays green.
- install/manifest.tsv rows for every new file.
Out of scope: the byte cap on the decision-log context (DESIGN § 6 and § 7 question 2). That is its own item; do not touch decisionLogContext.
Points for the plan (Ilex):
- **Live rows in tests.** "Tests against the live m8-fact rows" collides with the full suite. The suite runs outside the fence as _as2test, and that user cannot open ~/.agent-system-2: surface/src/as2test.ts CREDENTIAL_PATHS, the same collision the ledger-replay workload hit. Proposed shape: the permanent tests run against a fixture built from the live rows (Tinker's 40 and Codex's 32 are on the ledger; Levitt's 77 and more are landing). Separately, the lane proves the render against the live ledger read-only, as a recorded smoke receipt that shows the real "showing N of M" header for at least one fat repo and one small one. The plan states the shape it chose.
- **Fact bodies are Jo's personal data.** They include health, pronouns and security-adjacent details, so a committed fixture puts them in git. The plan states whether the fixture is synthetic, follows the live row shape, or is redacted. Recommended: synthetic bodies in the real format, unless a test needs the real text.
- **Item number.** MIGRATION.md on main has no item 106 (grep of the checkout). The chaos-run branch and Plumb's PR #55 both claim 105. Use 106 if it is free on origin/main at branch time; otherwise use the next free number and say so.
- **Gates.** P-11 row 10 refuses raw ledger reads outside the module, so every read goes through ledger/src. If the work would touch gates/, stop and raise it: that makes it production stakes.
Regression tests fail before the change; prove that on a separate unpacked copy, never by overwriting the worktree. Run the full suite via lane_full_test on the PR. Merging stays Jo's.

done: Ledger.facts(repo), renderFacts with FACTS_BUDGET_BYTES = 8000 and a "showing N of M" header injected into the lane's first prompt before the decision-log context, the lane_read_facts tool, and the tiers/lane.md sentence are built per DESIGN.md § 5, with tests (budget boundary, empty repo, rollback exclusion, prompt ordering, tool default repo and match) and a recorded read-only smoke against the live m8-fact rows; MIGRATION.md item 106 (or the next free number) records it; the full suite is green at the PR head; the change is on a branch with a PR.
done-because: MIGRATION.md item 106, the M8 wake render, is built on wl/wl-mv4r19j1q885xc and open as PR #67 (https://github.com/thewolff/agent-system-2.0/pull/67, head 0c7b091). It contains:
- `Ledger.facts(repo)`, using the reader contract with the rollback exclusion, plus readonly open;
- `renderFacts` with `FACTS_BUDGET_BYTES = 8000` and a "showing N of M" header; the block is injected into the lane's first prompt after the tools line and before `## Decision-log context`;
- the `lane_read_facts` tool;
- the tiers/lane.md sentence;
- tests for the budget boundary (including below-header clipping), the empty repo, rollback exclusion, prompt ordering, the tool's default repo, and match.
The recorded read-only smoke against the live m8-fact rows is at ~/agent-scratch/agent-system-2.0/wl-mv4r19j1q885xc/SMOKE.md. MIGRATION item 106 and row M8 name PR #67. Code review is merge at round 2 (CODE-REVIEW-r2.md). The full suite is green at the PR head, test run tr-0mv4sp857yz28di (3679 pass / 0 fail; the lane-script "repo facts" case is included in 61/61 solo). Jo merges.

Rendered from the ledger by Ilex (they/them) at workload close; stakes normal, mode autonomous, opened 2026-10-12T04:25:35.869Z.

## What changed

- sl-facts-plan: Plan the M8 wake render build (item 106) per DESIGN.md § 5: slices, test shape, fixture policy, item number, no-gates guard — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4r19j1q885xc/PLAN.md rev 2; review approve by openai-codex/gpt-6-sol (PLAN-REVIEW-r2.md); Jo approved q-mv4rqc5n373kzk (in-mv4rt066pq3fnk)
- sl-facts-core: Ledger.facts + OpenOptions.readonly in ledger/src/index.ts; surface/src/facts.ts (FACTS_BUDGET_BYTES, factLine, renderFacts, factsBlock, readFacts); tests per PLAN.md rev 2 § 2.1-2.2, § 3 — artifact: `bun test ledger/test/facts.test.ts surface/test/facts.test.ts ledger/test/ledger.test.ts` → 77 pass / 0 fail, 1360 expects (lane bash, worktree). Fails-before (hand): same new tests on /tmp/sl-facts-core-before (git archive 9039273) → 1 pass / 12 fail / 1 error (missing ../src/facts, l.facts not a function, readonly+create not refused). Files: ledger/src/index.ts (FactRow, OpenOptions.readonly, Ledger.facts), surface/src/facts.ts, ledger/test/facts.test.ts, surface/test/facts.test.ts. Uncommitted.
- sl-facts-docs: tiers/lane.md lane_read_facts sentence; MIGRATION.md item 106 + M8 row marked built (PR pending); install/manifest.tsv rows for the 3 new files, per PLAN.md rev 2 § 2.5-2.6 — artifact: `bun test tiers/test/size.test.ts` → 12 pass / 0 fail (lane bash); tiers/lane.md 12,450 bytes (was 12,198; cap 15,248, warn 12,961). install/manifest.tsv rows at :18, :363-364; MIGRATION.md row M8 (:55) and item 106 (:256) say built on wl/wl-mv4r19j1q885xc, PR pending. Uncommitted.
- sl-facts-wire: PromptInput.facts injected before decision-log via promptFor/factsBlock; lane_read_facts tool in LANE_TOOLS; launch, lane-tools and lane-script tests per PLAN.md rev 2 § 2.3-2.4, § 3 — artifact: Commit c6065a4. `bun test surface/test/launch.test.ts surface/test/lane-tools.test.ts surface/test/lane.test.ts surface/test/extension.test.ts` → 140 pass / 0 fail, 909 expects (lane bash). Fails-before on /tmp/sl-facts-wire-before (archive a26e39c), from the hand: 7 new cases fail (launch ordering, five lane_read_facts cases, extension tool list). The lane-script "repo facts" case is written and loads, but it is unrun inside the fence (EPERM posix_spawn 'ps'; see en-mv4s6df532setc), so its green comes from lane_full_test.
- sl-facts-smoke: Read-only live smoke of Ledger.facts/factsBlock/readFacts against the live ledger (readonly open, fenced bash); headers and counts only — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4r19j1q885xc/SMOKE.md: `bun …/smoke.ts` exit 0 at a26e39c, fenced lane bash, readonly open (write refused: "attempt to write a readonly database"). Headers: Tron "showing 40 of 83 under 8,000 bytes" (7,881 B), Levitt 35 of 77, Codex "showing 32 of 32" (5,740 B), Tinker 40 of 40, Verge 47 of 53 (own rows only), agent-system-2.0 empty. No fact text recorded.
- sl-facts-review: Cross-lab code review of wl/wl-mv4r19j1q885xc (9039273..c6065a4) against PLAN.md rev 2 and DESIGN.md § 5 — artifact: Round 2 verdict was merge with no findings: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4r19j1q885xc/CODE-REVIEW-r2.md (agent://sl-facts-review-2, HEAD 4dc1a79). Round 1 returned revise with 1 major and 1 minor finding (CODE-REVIEW-r1.md); both were fixed in 4dc1a79 under sl-facts-fix-r1.
- sl-facts-fix-r1: Fix code-review round 1. Major: renderFacts must hold ≤ budget even when the header alone does not fit; clip the header the way item 107's decisionLogContext does. Minor: put the repoOf lookup in lane_read_facts inside the try. Update MIGRATION item 106's stale Open-for-Jo sentence. — artifact: Commit 4dc1a79. `bun test surface/test/facts.test.ts surface/test/lane-tools.test.ts ledger/test/facts.test.ts` → 81 pass / 0 fail, 2763 expects (lane bash). Fails-before on /tmp/sl-facts-fix-r1-before (archive c46d5b8), from the hand: 79 pass / 2 fail. The two failures are exactly the new cases: header clip at budget 16, and the throwing repoOf. MIGRATION item 106 no longer contains "Open for Jo".
- sl-facts-pr: Rebase on origin/main, run the declared artifacts on the final tree, push wl/wl-mv4r19j1q885xc, open the PR, then set the PR number in MIGRATION row M8 and item 106 — artifact: PR https://github.com/thewolff/agent-system-2.0/pull/67, head 0c7b091 on wl/wl-mv4r19j1q885xc, rebased on origin/main e472070. On the final tree, `bun test tiers/test/size.test.ts surface/test/facts.test.ts` → 28 pass / 0 fail. Before the first push, the tree also passed the wire artifact (141 pass) and the fix artifact (81 pass). MIGRATION row M8 and item 106 name PR #67 (commit 0c7b091).
- sl-full-mv4r19j1q885xc-1: full suite outside the fence at PR #67 — artifact: test-run tr-0mv4sp857yz28di: green at 0c7b09118f91903d5178478ba8091fabad7eb553 on PR #67; full 3679/0/22; alone: ./ledger/test/facts.test.ts 12/0, ./surface/test/extension.test.ts 13/0, ./surface/test/facts.test.ts 16/0, ./surface/test/lane-script.test.ts 61/0, ./surface/test/lane-tools.test.ts 53/0, ./surface/test/launch.test.ts 50/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv4sp857yz28di

## Decisions made (and why)

- jo (surface): stakes: normal
- jo answered "approve" to q-mv4rqc5n373kzk (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4r19j1q885xc/PLAN.md
- sl-facts-core: Ledger.facts (escaped LIKE, delimiter parse, rollback drop) + readonly open; renderFacts, FACTS_BUDGET_BYTES=8000, readFacts; tests
- sl-facts-docs: tiers/lane.md sentence, MIGRATION item 106 + M8 row marked built, manifest rows for 3 new files; tiers size test green
- sl-facts-wire: PromptInput.facts before decision-log via promptFor; lane_read_facts {repo?,match?} in LANE_TOOLS; launch/lane-tools/lane-script tests
- sl-facts-smoke: read-only live smoke (readonly open, fenced bash): headers and counts only for Tron, Levitt, Codex, Tinker, Verge; no fact text
- sl-facts-review: cross-lab code review of the branch diff vs origin/main, up to 3 rounds
- sl-facts-pr: rebase, declared artifact on final tree, push -u, open PR, fill item 106's PR number; then lane_full_test
tradeoff: budget bounds the whole block incl. header, so "under 8,000 bytes" is literal; costs at most one fact
tradeoff: exact case-sensitive repo match after an escaped LIKE: narrower than the M8 SQL; a symlinked checkout path sees no block (tool's repo covers it)
tradeoff: adds Ledger.open {readonly} for a truly read-only live smoke; tests use synthetic facts in the live shape, never Jo's text
review: approve, openai-codex/gpt-6-sol, /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4r19j1q885xc/PLAN-REVIEW-r2.md)
- assumption (lane-mv4r19j1q885xc-1): builder-lab: anthropic lane lane-mv4r19j1q885xc-1 model anthropic/claude-opus-5-5
- assumption (lane-mv4r19j1q885xc-1, sl-facts-plan): hand-spawn: dt-mv4rf5dwb6ad61a4 session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-plan review yes group dg-mv4rf5dwc8c505c1 row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-plan): hand-settled: dt-mv4rf5dwb6ad61a4 routing rt-mv4rjewkin7thc
- assumption (lane-mv4r19j1q885xc-1, sl-facts-plan): review-round: sl-facts-plan round 1 token dt-mv4rf5dwb6ad61a4 group dg-mv4rf5dwc8c505c1 verdict accepted blocking 1 counts {"counts":{"blocking":{"correctness":1},"major":{"correctness":1,"tests":1},"minor":{"design":1}},"titles":[{"severity":"blocking","kind":"correctness","title":"Live smoke opens a write-capable ledger connection and may change WAL mode"},{"severity":"major","kind":"correctness","title":"Fact parser rejects or ambiguously handles whitespace in repository and source paths"},{"severity":"major","kind":"tests","title":"No launcher-level test proves facts reach the emitted prompt"},{"severity":"minor","kind":"design","title":"Docs and PR slices both own the MIGRATION.md edit"}]}
- assumption (lane-mv4r19j1q885xc-1, sl-facts-plan): hand-spawn: dt-mv4rlc3c345c0d11 session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-plan-2 review yes group dg-mv4rlc3cd2374c3d row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-plan): hand-settled: dt-mv4rlc3c345c0d11 routing rt-mv4rpmt6blauww
- assumption (lane-mv4r19j1q885xc-1, sl-facts-plan): review-round: sl-facts-plan round 2 token dt-mv4rlc3c345c0d11 group dg-mv4rlc3cd2374c3d verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv4r19j1q885xc-1, sl-facts-plan): review-loop-end: sl-facts-plan reason pass
- assumption (lane-mv4r19j1q885xc-1, sl-facts-core): hand-spawn: dt-mv4rud3j5e3a7c13 session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-core review no group dg-mv4rud3ja6c77c4b row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-docs): hand-spawn: dt-mv4rud3j2712e4c3 session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-docs review no group dg-mv4rud3jc2910355 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-core): artifact-command: bun test ledger/test/facts.test.ts surface/test/facts.test.ts ledger/test/ledger.test.ts
- assumption (lane-mv4r19j1q885xc-1, sl-facts-docs): artifact-command: bun test tiers/test/size.test.ts
- assumption (lane-mv4r19j1q885xc-1, sl-facts-docs): hand-settled: dt-mv4rud3j2712e4c3 routing rt-mv4rx1shijz6rk
- assumption (lane-mv4r19j1q885xc-1, sl-facts-core): hand-settled: dt-mv4rud3j5e3a7c13 routing rt-mv4s0nz5czs6tc
- assumption (lane-mv4r19j1q885xc-1, sl-facts-wire): hand-spawn: dt-mv4s1s089959fd1c session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-wire review no group dg-mv4s1s080264349e row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-wire): artifact-command: bun test surface/test/launch.test.ts surface/test/lane-tools.test.ts surface/test/lane.test.ts surface/test/extension.test.ts
- assumption (lane-mv4r19j1q885xc-1, sl-facts-wire): The lane-script.test.ts "repo facts" case cannot run inside the M4b fence. Per the wire hand, every real-process lane-script test, including the existing "parked: an open question…" test, fails at readiness with EPERM posix_spawn 'ps', because /bin/ps is setuid root. The lane's bash is fenced as well. So that case's green comes from lane_full_test at the PR head, which runs outside the fence and runs each changed test file alone. Fails-before for that one case is not shown. The new launch.test and lane-tools.test cases carry the fails-before proof for the injection and the tool.
- assumption (lane-mv4r19j1q885xc-1, sl-facts-wire): hand-settled: dt-mv4s1s089959fd1c routing rt-mv4s7nighsj30g
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): hand-spawn: dt-mv4s8n6005833d6f session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-review review yes group dg-mv4s8n60259704a9 row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): hand-settled: dt-mv4s8n6005833d6f routing rt-mv4sd10fszo5q8
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): review-round: sl-facts-review round 1 token dt-mv4s8n6005833d6f group dg-mv4s8n60259704a9 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":1},"minor":{"correctness":1}},"titles":[{"severity":"major","kind":"correctness","title":"renderFacts returns a header larger than the byte budget when the header alone does not fit"},{"severity":"minor","kind":"correctness","title":"lane_read_facts default-repo lookup errors bypass the promised error response"}]}
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): review-loop-end: sl-facts-review reason pass
- assumption (lane-mv4r19j1q885xc-1, sl-facts-fix-r1): artifact-command: bun test surface/test/facts.test.ts surface/test/lane-tools.test.ts ledger/test/facts.test.ts
- assumption (lane-mv4r19j1q885xc-1, sl-facts-fix-r1): hand-spawn: dt-mv4sf04hcaaca87c session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-fix-r1 review no group dg-mv4sf04h6740f108 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-fix-r1): hand-settled: dt-mv4sf04hcaaca87c routing rt-mv4sj26w203wn4
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): hand-spawn: dt-mv4sjmuj05b8174b session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-review-2 review yes group dg-mv4sjmujd9e8a9f4 row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): hand-settled: dt-mv4sjmuj05b8174b routing rt-mv4smhe3d6ovls
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): review-round: sl-facts-review round 1 token dt-mv4sjmuj05b8174b group dg-mv4sjmujd9e8a9f4 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv4r19j1q885xc-1, sl-facts-review): review-loop-end: sl-facts-review reason pass
- assumption (lane-mv4r19j1q885xc-1, sl-facts-pr): hand-spawn: dt-mv4snrv0dcc8a60f session /Users/jowolff/.agent-system-2/lanes/wl-mv4r19j1q885xc/sessions/2026-10-12T04-25-38-329Z_01a12e5b-eb19-7000-b858-4cc28eec2bc5 spawn sl-facts-pr review no group dg-mv4snrv0c26ad268 row anthropic/claude-sonnet-5-5,openai-codex/gpt-6-luna,moonshot/kimi-k2.5
- assumption (lane-mv4r19j1q885xc-1, sl-facts-pr): hand-settled: dt-mv4snrv0dcc8a60f routing rt-mv4soso6fa17gg
- assumption (lane-mv4r19j1q885xc-1, sl-facts-pr): artifact-command: bun test tiers/test/size.test.ts surface/test/facts.test.ts

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mv4rz7o1u942rk [delivered] not acted on: artifact-failed: `bun test ledger/test/facts.test.ts surface/test/facts.test.ts ledger/test/ledger.test.ts` exited 1 (tool call toolu_019XLs2fVTszgRaEbeBv8Upq)
- message msg-mv4rzii2d7t1j4 [delivered] not acted on: artifact-passed: `bun test ledger/test/facts.test.ts surface/test/facts.test.ts ledger/test/ledger.test.ts` exited 0 (tool call toolu_01DAi4sVLVzpuwKNFcX97MWk)
