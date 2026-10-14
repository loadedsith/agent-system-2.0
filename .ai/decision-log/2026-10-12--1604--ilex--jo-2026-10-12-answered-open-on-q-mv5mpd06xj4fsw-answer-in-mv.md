---
date: 2026-10-12T16:04-07:00
engineer: Ilex
session: wl-mv5msri070p0qo
status: resolved
durable: false
supersedes:
workload: wl-mv5msri070p0qo
---

# Jo (2026-10-12) answered "open" on q-mv5mpd06xj4fsw (answer in-mv5mseif6arif4), after this exchange: Jo: "you keep getting a new command for me and have to restate everything but now with the new command. did we figure out a way to solve that?" and "i like the idea of 1 and 2 - wouldnt rule #3 conflict with my communication rules and make it easy for me to get lost and forget things?" Ilex then revised rule 3 (below) and Jo answered open.

Problem: every needs-you item that arrives gives the orchestrator a new turn, and the voice rules (restate content, closing ask survives alone) make it rebuild the whole list of open answers each time, so Jo's scrollback fills with near-identical messages differing by one line (this session, 2026-10-12 18:55–19:30Z, roughly a dozen such messages).

Build:
1. A surface word `pending`: renders one paste-ready block of every open answer line from the ledger, with no model in the loop. Covers open questions (orchestrator's and lanes') and reserved-action holds. Each line is the exact paste form (`<option> <q-id>` / `approve|deny <en-id>`) with the recommended option first where one is recorded, plus a one-line plain-language subject (what it is, which workload in words). Lines must survive the surface's paste rules (a multi-line paste of the block applies cleanly; no trailing punctuation).
2. Batched arrivals: when several needs-you items arrive while Jo has typed nothing, the surface delivers them to the orchestrator as one turn (one message to Jo), not one turn each. The plan chooses the window and states how an on-fire item (lane death with open work, ceiling hit, red run on a PR Jo is waiting on) still goes through at once.
3. voice/VOICE.md, revised rule (Ilex's wording Jo accepted): a new item gets its full write-up once and again whenever its state changes; older items are never dropped: every message ends with one count line ("N others waiting: `pending` shows them all"); on `back`, or after a quiet stretch, Jo gets the complete paste-ready list once with content, not ids; `brb` / `back` hold and release a digest. The rule must say how it fits "References must survive without scrolling" and the closing-ask rules, and name the conflict it resolves. Also update tiers/orchestrator.md and USER-GUIDE.md word lists for `pending`, `brb`, `back`.

Coordinate: the tooling workload wl-mv5i3lulwwbbi8 edits surface/src/input.ts word handling (new cancel/supersede words) and its tiers/orchestrator.md and USER-GUIDE.md word lists; name shared files and merge order. Also known: surface/src/input.ts:112-114 treats a mode word with a question id as a failed mode flip, so a question whose options are mode words cannot be answered by id; fix it here if the plan touches that dispatch and tooling has not. Regression tests fail before the change, proven on a separate unpacked copy. Smoke: a real surface session showing `pending` output and one batched turn. MIGRATION.md item. Full suite via lane_full_test on the PR. Merging stays Jo's (merge commit).

done: The surface answers `pending` with one paste-ready block of every open answer line built from the ledger; several needs-you arrivals while Jo is idle reach the orchestrator as one turn, with on-fire items still immediate; voice/VOICE.md carries the revised rule (write-up once, count line plus `pending` every message, full list on `back`, `brb`/`back` digest) and the word lists are updated; regression tests fail before the change; a smoke run on a real surface session shows both; a MIGRATION.md item records it; the full suite is green at the PR head; the change is on a branch with a PR.
done-because: every clause of the done line now holds.
- `pending`: the surface answers it with one paste-ready block built from the ledger (surface/src/pending.ts; surface-input.ts handles it with no turn).
- Batching: several needs-you arrivals while Jo is idle reach the orchestrator as one turn after the fixed window; on-fire lines still go out at once (wake.ts poll, batch.ts onFire).
- voice/VOICE.md has the rule "Older items are counted, not re-listed": the write-up appears once, the count line plus `pending` ends every message, `back` and the quiet stretch carry the full list, and `brb`/`back` give the digest. The tiers/orchestrator.md and USER-GUIDE.md word lists include `pending`, `brb` and `back`.
- Regression tests fail before the change: sl-prefail, 43 fail on 857bca0. The r1–r3 fixes add cases that fail on their predecessors.
- The smoke on a real omp rpc surface session showed `pending` with 0 model requests and three questions arriving as 1 request (sl-pending-smoke).
- MIGRATION.md item 116 records the change.
- Four cross-lab code review rounds; the last passed with 0 findings (sl-pending-review).
- The full suite is green at PR head 1e74e59: tr-0mv5tp5bkmnfh3d, 3939 pass, 0 fail.
- The change is on branch wl/wl-mv5msri070p0qo with PR #106 open. Jo merges with a merge commit; tooling PR #101 conflicts in input.ts, surface-input.ts, lane-tools.ts, orchestrator.md, USER-GUIDE.md and MIGRATION.md, so whichever merges second resolves keeping both.

Rendered from the ledger by Ilex (they/them) at workload close; stakes normal, mode autonomous, opened 2026-10-12T19:14:46.968Z.

## What changed

- sl-plan-pending: Plan: cut the `pending` word, batched needs-you delivery, VOICE.md rule, word lists, MIGRATION item and tests into slices; cross-lab plan review; plan question to Jo — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/PLAN.md rev 4 approved by Jo on q-mv5ppqhh480yrk (in-mv5qaqpjxq8cn4); review r4 approve-with-changes, openai-codex/gpt-6-sol, PLAN-REVIEW-r4.md
- sl-pending-lib: surface/src/pending.ts: pendingItems/pendingBlock per PLAN D1 (one line per row, recorded recommendation precedence); lane_raise_question refuses multiword options; tests — artifact: bun test surface/test/pending.test.ts surface/test/lane-tools.test.ts → 65 pass, 0 fail (465 expects); surface/src/pending.ts (pendingItems, pendingBlock, pendingWaits), lane-tools.ts:296 one-word option refusal
- sl-input-paste: surface/src/input.ts: stripTail for `<word> <id>  # …` lines; mode/stakes word with q-/en- id answers by id (fix 112-114); tests — artifact: bun test surface/test/input.test.ts → 46 pass, 0 fail (321 expects); hand report: 7 of 8 new cases fail on an unpacked origin/main copy (fix # 3 now is the regression guard)
- sl-pending-docs: voice/VOICE.md older-items rule, tiers/orchestrator.md and USER-GUIDE.md words pending/brb/back, MIGRATION item (PLAN D5-D7) — artifact: voice/VOICE.md:110-155 (closing-ask amend, 'Older items are counted, not re-listed', skeleton step 3), tiers/orchestrator.md, USER-GUIDE.md, MIGRATION.md item 116; bun test tiers/test → 12 pass, 0 fail (size warnings: orchestrator.md at 246/269 lines, 17232/18168 bytes)
- sl-surface-wire: Wire `pending` (input event, no turn), D3 batching in wake.ts + batch.ts with flush recheck and deferred consumption, on-fire, ceiling stopped state, brb/back/quiet, count line; tests — artifact: commit 44df799; bun test (11 surface files: batch, wake-push, extension, delivery, pending, input, wake-close, ceiling-surface, numbering, render, orchestrator-question) → 181 pass, 0 fail; hand: 18 related files 362 pass, 27 new/changed cases fail on HEAD a54b373
- sl-gate-count: P-11 row 1 (gates/src/rows/r01-turn-shape.ts) allows the VOICE count line as the one trailing line after the closing ask; tests in gates/test/message-rows.test.ts — artifact: bun test gates/test/message-rows.test.ts gates/test/r15-orchestrator-role.test.ts → 220 pass, 0 fail; COUNT_LINE in gates/src/rows/r01-turn-shape.ts; 8 new pass cases fail on unchanged code (hand run: 34 pass 8 fail)
- sl-prefail: Run the new and changed regression tests on an unpacked origin/main copy (new pure modules copied in so failures are assertions) and record which fail — artifact: zsh /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/prefail.sh: on /tmp/prefail-pending (git archive origin/main 857bca0) plus only the test files and the new modules pending.ts/batch.ts → 174 pass, 43 fail, all assertion failures (expect…toEqual/toBe/toContain/toBeNull). Failing: input D2 ×7, batch D3/D4 ×16, extension pending/paste ×4, wake-push W11, delivery ×6 (stopped state + count line), lane-tools one-word option, row 1 count line ×8. pending.test.ts passes there by construction (new module copied in)
- sl-pending-smoke: Real omp rpc surface session (stub model, scratch HOME/ledger, short poll and batch window): `pending` shows the block with no model request; three questions arriving reach the model as one turn — artifact: bun /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/smoke.ts on real omp 18.8.6 rpc surface session (stub model, POLL 1000, BATCH 6000): STEP 2 PASS — `pending` → surface-pending message with the 2-line block, rpc response agentInvoked:false, 0 model requests, no agent_start; STEP 3 PASS — three questions raised 1.5 s apart → exactly 1 model request (#4, +22.16s) carrying all three ids plus `open answer lines: 5`; omp stderr empty. Earlier run saved in smoke-output.txt
- sl-pending-review: Cross-lab code review of 857bca0..44df799 against PLAN.md rev 4, findings only — artifact: Round 4 (sl-pending-review-4, cross-lab) passed with 0 findings on a7a489f: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/CODE-REVIEW-r4.md. Earlier rounds are saved in CODE-REVIEW-r1..r3.md in the same directory. Their findings and dispositions:
- r1 finding 1 rejected: PLAN D3 says on-fire carries the hold; r2 and r4 confirmed the rejection.
- r1 findings 2-5 fixed in 4cc2018.
- r2 findings 1-2 fixed in 84a8341.
- r3 finding 1 fixed in a7a489f.
- r3 finding 2 accepted as recorded: a generated-only paste passes through as prose. r4 agreed.
- sl-pending-fix-r1: Fix review r1 findings 2-5: back/quiet block with a wake, ledger read drops shown identities from hold, whole-block paste ignores generated wrapper, long-option line bound — artifact: commit (see next) on wl/wl-mv5msri070p0qo; sl-surface-wire 11-file artifact → 187 pass 0 fail (a first run under machine load timed out 2 ceiling-surface cases at 5 s; alone 16 pass, rerun 187/0). New cases fail on 44df799 per hand report agent://sl-pending-fix-r1: back/quiet with wake ×2, ledger unhold ×2, whole-block paste extension + input, long option. Finding 3 implemented as: any orchestrator_ledger read drops every identity it showed (render.ts:139-142 shows all needs-you lines even when scoped)
- sl-pending-fix-r2: Fix review r2: recognize a pasted pending block as a block (heading + its fence + generated sentences under it), keep Jo's own fences; an answer word too long for a 240-char line puts its question under the fence — artifact: commit 84a8341: pendingWrapperLines (surface/src/pending.ts) replaces isPendingWrapper; interpretPaste drops only a generated heading, its ```text fence and closing ```, and generated sentences directly under it. pendingBlock moves an answer line over 240 chars to a counted "are too long for an answer line" sentence. sl-surface-wire 11-file artifact → 187 pass 0 fail; tiers/test + lane-tools + message-rows → 107 pass
- sl-pending-fix-r3: Fix review r3 finding 1: a pasted pending block is recognised only when complete (heading+hint, ```text, answer-shaped lines, closing ```); an orphan heading or unclosed fence stays Jo's — artifact: commit a7a489f: pendingWrapperLines marks only a complete block (heading+hint, ```text, ≥1 answer-shaped line, closing ```; or hint-less heading + ≥1 generated sentence; or PENDING_EMPTY + waits). input.test.ts adds exact-heading+prose and unclosed-fence cases. sl-surface-wire artifact → 187 pass 0 fail
- sl-pending-pr: Merge origin/main, rerun declared artifacts on the clean tree, push wl/wl-mv5msri070p0qo, open the PR — artifact: PR #106 https://github.com/thewolff/agent-system-2.0/pull/106 is open at head 79c2a73. That head merges origin/main 7655317; the MIGRATION.md conflict was resolved by keeping items 109 and 116. `git push -u origin wl/wl-mv5msri070p0qo` created the branch. On the clean tree, every declared artifact passed:
- surface set: 187 pass
- pending+lane-tools: 66 pass
- gates rows 1/15: 220 pass
- tiers: 12 pass
- input: 47 pass
- sl-full-mv5msri070p0qo-1: full suite outside the fence at PR #106 — artifact: test-run tr-0mv5tp5bkmnfh3d: green at 1e74e59f486639219ea3099ed171bbe48b730fb7 on PR #106; full 3939/0/29; alone: ./gates/test/message-rows.test.ts 42/0, ./surface/test/batch.test.ts 21/0, ./surface/test/delivery.test.ts 11/0, ./surface/test/extension.test.ts 15/0, ./surface/test/input.test.ts 47/0, ./surface/test/lane-tools.test.ts 53/0, ./surface/test/pending.test.ts 13/0, ./surface/test/wake-close.test.ts 3/0, ./surface/test/wake-push.test.ts 18/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv5tp5bkmnfh3d
- sl-pending-manifest: Add install/manifest.tsv rows for surface/src/pending.ts, surface/src/batch.ts and their tests (full-suite red: manifest-sync + install tests) — artifact: commit 1e74e59 pushed to PR #106. `bun test gates/test/manifest-sync.test.ts ledger/test/install.test.ts` → 24 pass 0 fail. The 7 manifest and install failures of tr-0mv5shm15wj21po came from the missing manifest rows. The 8th failure (pending.test.ts, "df failed") is an environmental ledger-locality flake: the same "df failed" also appears in another run's result.json (2 of 54 runs), and pending.test.ts passed alone in that same run (13/0).

## Decisions made (and why)

- jo answered "extend" to q-mv5ov3pob98znk (The review of sl-plan-pending reached its round limit: 3 failed rounds of 3 allowed (normal stakes).
Final round (round 3), remaining findings: unknown · unknown: 1 hand with no readable findings block (dt-mv5oknel7722d962)
Blocking per round: round 1: 3 · round 2: 1 · round 3: unknown
Estimate (not a measurement): about 1 more round, ceil(last 1 / mean fall 2 per round)
extend: one more block of 3 rounds for sl-plan-pending; the lane may dispatch the next review.
accept: the review counts as passed with these findings left; the lane may close sl-plan-pending and go on, and the final round's finding titles ride the slice artifact and the PR (a plan slice may then be raised to Jo).
stop: no further round; the review does not count as passed; the lane reports and holds sl-plan-pending for Jo.)
- jo answered "approve" to q-mv5ppqhh480yrk (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/PLAN.md
- sl-pending-lib: surface/src/pending.ts builds the one-line-per-row pending block from the ledger; lane_raise_question requires one-word options; tests
- sl-input-paste: input.ts strips `# …` tails after `<word> <id>`; a mode/stakes word with a q-/en- id answers the question (fixes input.ts:112-114); tests
- sl-docs: VOICE.md "older items are counted" rule; pending/brb/back in orchestrator.md and USER-GUIDE.md; MIGRATION item after 114
- sl-surface-wire: `pending` without a model turn; 5-min batch of needs-you pushes, rechecked at flush; on-fire pushed at once; brb/back/quiet digest
- sl-prefail: the new regression tests fail on an unpacked origin/main copy, on their assertions
- sl-smoke: real surface session in rpc mode shows the `pending` block and three arrivals reaching the orchestrator as one turn
- sl-review: cross-lab code review of the diff, findings only
- sl-pr: merge origin/main after the tooling PR, declared artifact, push, PR, lane_full_test green
tradeoff: routine needs-you items wait up to 5 min plus one poll while you are silent; lane death with open work, ceiling and red runs go at once
tradeoff: pasting the block untouched answers unrecommended rows with their first option (approve for reserved); each such line says so
tradeoff: brb, back and the quiet stretch are session state only; on-fire items still push while you are away
review: approve-with-changes, openai-codex/gpt-6-sol, /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/PLAN-REVIEW-r4.md)
- assumption (orchestrator-surface): brief-judged: change-large confidence 1.00 judge typesafe/jev-1.13.0
- assumption (lane-mv5msri070p0qo-1): builder-lab: anthropic lane lane-mv5msri070p0qo-1 model anthropic/claude-opus-5-5
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): hand-spawn: dt-mv5o2efh8b6f8d95 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-plan-pending review yes group dg-mv5o2efh72e68c8a row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): hand-settled: dt-mv5o2efh8b6f8d95 routing rt-mv5o9jud323h8g
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): review-round: sl-plan-pending round 1 token dt-mv5o2efh8b6f8d95 group dg-mv5o2efh72e68c8a verdict accepted blocking 3 counts {"counts":{"blocking":{"correctness":3},"major":{"correctness":1,"design":1},"minor":{"docs":1}},"titles":[{"severity":"blocking","kind":"correctness","title":"Unrecommended questions and reserved holds lack copyable answer lines"},{"severity":"blocking","kind":"correctness","title":"Open ceiling question suppresses the planned 100%-ceiling on-fire signal"},{"severity":"blocking","kind":"correctness","title":"Early consumption drops non-fire lane deaths before batch flush"},{"severity":"major","kind":"correctness","title":"Comment lines can leak into mixed-paste instruction text"},{"severity":"major","kind":"design","title":"On-fire push during brb releases ordinary held digest early"},{"severity":"minor","kind":"docs","title":"Count-line footer conflicts with closing-ask-last and unconditional-count wording"}]}
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): hand-spawn: dt-mv5odsiid4d82eb6 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-plan-pending-2 review yes group dg-mv5odsiibd9a2931 row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): hand-settled: dt-mv5odsiid4d82eb6 routing rt-mv5oheee4t7a4g
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): review-round: sl-plan-pending round 2 token dt-mv5odsiid4d82eb6 group dg-mv5odsiibd9a2931 verdict accepted blocking 1 counts {"counts":{"blocking":{"correctness":1},"major":{"correctness":2},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"Complete pending block cannot be pasted as one transaction"},{"severity":"major","kind":"correctness","title":"Plan approval presented as a recommendation without recorded support"},{"severity":"major","kind":"correctness","title":"Batch flush preserves stale state-derived needs-you lines"}]}
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): hand-spawn: dt-mv5oknel7722d962 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-plan-pending-3 review yes group dg-mv5oknelcb848f57 row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): hand-settled: dt-mv5oknel7722d962 routing rt-mv5ov3plalpce8
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): review-round: sl-plan-pending round 3 token dt-mv5oknel7722d962 group dg-mv5oknelcb848f57 verdict accepted blocking unknown counts unknown
- assumption (lane-mv5msri070p0qo-1, sl-plan-pending): review-limit: q-mv5ov3pob98znk slice sl-plan-pending
- assumption (orchestrator-surface, sl-plan-pending): review-rounds-extend: sl-plan-pending +3 by in-mv5pdjax7rlybk
- assumption (lane-mv5msri070p0qo-2): builder-lab: anthropic lane lane-mv5msri070p0qo-2 model anthropic/claude-opus-5-5
- assumption (lane-mv5msri070p0qo-2, sl-plan-pending): hand-spawn: dt-mv5piaql355ff781 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-plan-pending-4 review yes group dg-mv5piaqlf087d4a2 row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-2, sl-plan-pending): hand-settled: dt-mv5piaql355ff781 routing rt-mv5pnz4q3o6vb4
- assumption (lane-mv5msri070p0qo-2, sl-plan-pending): review-round: sl-plan-pending round 4 token dt-mv5piaql355ff781 group dg-mv5piaqlf087d4a2 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":2},"minor":{}},"titles":[{"severity":"major","kind":"correctness","title":"An ordinary typed turn while brb is active drains the routine hold before back"},{"severity":"major","kind":"correctness","title":"Multiword lane question options make the promised pending block unpasteable"}]}
- assumption (lane-mv5msri070p0qo-2, sl-plan-pending): review-loop-end: sl-plan-pending reason pass
- assumption (lane-mv5msri070p0qo-3): builder-lab: anthropic lane lane-mv5msri070p0qo-3 model anthropic/claude-opus-5-5
- assumption (lane-mv5msri070p0qo-3, sl-pending-lib): hand-spawn: dt-mv5qce2jd3a2fb1c session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-lib review no group dg-mv5qce2j5aef3eb7 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-input-paste): hand-spawn: dt-mv5qce2j5a2a54f4 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-input-paste review no group dg-mv5qce2j211ba657 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-pending-docs): hand-spawn: dt-mv5qce2jde1781c3 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-docs review no group dg-mv5qce2j1ac1f378 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-pending-docs): hand-settled: dt-mv5qce2jde1781c3 routing rt-mv5qhcpltx4hs0
- assumption (lane-mv5msri070p0qo-3, sl-input-paste): hand-settled: dt-mv5qce2j5a2a54f4 routing rt-mv5qhtx96gne9s
- assumption (lane-mv5msri070p0qo-3, sl-input-paste): artifact-command: bun test surface/test/input.test.ts
- assumption (lane-mv5msri070p0qo-3, sl-pending-docs): artifact-command: bun test tiers/test
- assumption (lane-mv5msri070p0qo-3, sl-pending-docs): Decision at execution, outside the approved slice list but required by the plan's D5 rule: the docs now say the count line follows the closing ask. P-11 row 1 refuses any prose after the closing ask, so an orchestrator message with that footer would be refused. The receipt is /Users/jowolff/code/agent-system-2.0-lanes/wl-mv5msri070p0qo/gates/src/rows/r01-turn-shape.ts:292-293 and :347-348: after the ask, only OPTION_LINE or RECOMMENDATION_LINE may follow. I am adding slice sl-gate-count. It lets exactly the count line (`N others waiting: \`pending\` shows them all`, or `nothing else waiting`) follow the closing ask in r01-turn-shape.ts, with tests in gates/test/message-rows.test.ts. Nothing else in row 1 changes.
- assumption (lane-mv5msri070p0qo-3, sl-gate-count): hand-spawn: dt-mv5qjbdnb203c33e session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-gate-count review no group dg-mv5qjbdn7554e609 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-pending-lib): hand-settled: dt-mv5qce2jd3a2fb1c routing rt-mv5qjbfoarewow
- assumption (lane-mv5msri070p0qo-3, sl-pending-lib): artifact-command: bun test surface/test/pending.test.ts surface/test/lane-tools.test.ts
- assumption (lane-mv5msri070p0qo-3, sl-surface-wire): hand-spawn: dt-mv5qkbzjf2a5b4e1 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-surface-wire review no group dg-mv5qkbzjbb9db563 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-gate-count): hand-settled: dt-mv5qjbdnb203c33e routing rt-mv5qlakupxiw3k
- assumption (lane-mv5msri070p0qo-3, sl-gate-count): artifact-command: bun test gates/test/message-rows.test.ts gates/test/r15-orchestrator-role.test.ts
- assumption (lane-mv5msri070p0qo-3, sl-surface-wire): hand-settled: dt-mv5qkbzjf2a5b4e1 routing rt-mv5r2nu27kk2yo
- assumption (lane-mv5msri070p0qo-3, sl-surface-wire): artifact-command: bun test surface/test/batch.test.ts surface/test/wake-push.test.ts surface/test/extension.test.ts surface/test/delivery.test.ts surface/test/pending.test.ts surface/test/input.test.ts surface/test/wake-close.test.ts surface/test/ceiling-surface.test.ts surface/test/numbering.test.ts surface/test/render.test.ts surface/test/orchestrator-question.test.ts
- assumption (lane-mv5msri070p0qo-3, sl-prefail): artifact-command: zsh /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/prefail.sh
- assumption (lane-mv5msri070p0qo-3, sl-pending-smoke): hand-spawn: dt-mv5r53ym4508e4fc session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-smoke review no group dg-mv5r53ymee8cb4b8 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-pending-smoke): hand-settled: dt-mv5r53ym4508e4fc routing rt-mv5rbukdnl2l1c
- assumption (lane-mv5msri070p0qo-3, sl-pending-smoke): artifact-command: bun /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/smoke.ts
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-spawn: dt-mv5rdmmk87c4d710 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-review review yes group dg-mv5rdmmk3449faa5 row openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-settled: dt-mv5rdmmk87c4d710 routing rt-mv5ri71boy1ips
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-round: sl-pending-review round 1 token dt-mv5rdmmk87c4d710 group dg-mv5rdmmk3449faa5 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":4},"minor":{"correctness":1}},"titles":[{"severity":"major","kind":"correctness","title":"On-fire pushes release routine held lines before the batching window"},{"severity":"major","kind":"correctness","title":"Back or quiet return omits the complete pending digest when a wake is pending"},{"severity":"major","kind":"correctness","title":"On-demand ledger reads leave non-message held identities for duplicate pushes"},{"severity":"major","kind":"correctness","title":"Pasting the whole pending block forwards its wrapper as spurious instructions"},{"severity":"minor","kind":"correctness","title":"Long one-word options can exceed the 240-character pending-line limit"}]}
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-loop-end: sl-pending-review reason pass
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): I triaged code review round 1 (verdict revise, 0 blocking, 4 major, 1 minor).

Rejected, finding 1 (on-fire releases the routine hold): approved PLAN.md D3 "What goes out, and when" reads "When not away (`brb`, D4), an on-fire line pushes on its own poll and carries the current hold with it. This keeps order and leaves the hold empty." The reviewer cited D4, which governs only the away case. The code matches the plan, so this finding is not changed.

Accepted, as fix slice sl-review-fix1:
- Finding 2: `back` or a quiet return must append the complete pending block even when a wake is taken.
- Finding 3: an orchestrator_ledger render drops the identities it showed from the hold.
- Finding 4: a whole-block paste ignores the surface's exact generated wrapper lines (the `## pending:` heading and the ```text / ``` fence lines), so they forward no instruction.
- Finding 5: an answer line over 240 characters shortens its `also:` list without touching the answer word.
- assumption (lane-mv5msri070p0qo-3, sl-pending-fix-r1): hand-spawn: dt-mv5rjhux6c22dad1 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-fix-r1 review no group dg-mv5rjhuxb8118874 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5msri070p0qo-3, sl-pending-fix-r1): hand-settled: dt-mv5rjhux6c22dad1 routing rt-mv5rtd62d0vpq8
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-spawn: dt-mv5rv2p68989dad1 session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-review-2 review yes group dg-mv5rv2p661185550 row openai-codex/gpt-6-sol
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-settled: dt-mv5rv2p68989dad1 routing rt-mv5rzf0qaevq4g
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-round: sl-pending-review round 1 token dt-mv5rv2p68989dad1 group dg-mv5rv2p661185550 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":1},"minor":{"correctness":1}},"titles":[{"severity":"major","kind":"correctness","title":"Pending-block paste drops Jo’s literal prose and forwards generated fallback sentences as instructions"},{"severity":"minor","kind":"correctness","title":"Long first answer option still exceeds pending line limit without a failing bound assertion"}]}
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-loop-end: sl-pending-review reason pass
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-spawn: dt-mv5s36ic91d3445f session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-review-3 review yes group dg-mv5s36icf2814a94 row openai-codex/gpt-6-sol
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-settled: dt-mv5s36ic91d3445f routing rt-mv5s9m71122oe8
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-round: sl-pending-review round 1 token dt-mv5s36ic91d3445f group dg-mv5s36icf2814a94 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":2},"minor":{}},"titles":[{"severity":"major","kind":"correctness","title":"Incomplete pending blocks erase Jo’s exact heading or capture her fence"},{"severity":"major","kind":"correctness","title":"Generated-only pending blocks pass fallback and prompt-wait text through as Jo’s prompt"}]}
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-loop-end: sl-pending-review reason pass
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): Code review round 3 (sl-pending-review-3) returned revise with 2 major findings.

Finding 1, "Incomplete pending blocks erase Jo's exact heading or capture her fence": fixed in a7a489f.

Finding 2, "Generated-only pending blocks pass fallback and prompt-wait text through as Jo's prompt": not changed. Such a paste has no answer line, so it follows the existing rule for any paste with no command line (surface/extensions/surface-input.ts:233-235): it passes through to the orchestrator unchanged, the same as any other prose paste. No answer is applied, and nothing is lost or mis-recorded. Handling it would need a new surface reply for a paste that does nothing, which is a UX choice the plan does not make. The round limit (3) is reached, so this goes to Jo.
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-spawn: dt-mv5sbyrm825867ec session /Users/jowolff/.agent-system-2/lanes/wl-mv5msri070p0qo/sessions/2026-10-12T19-43-12-814Z_01a131a3-fbae-7000-af1f-81bc5c77974a spawn sl-pending-review-4 review yes group dg-mv5sbyrm0872ba8a row openai-codex/gpt-6-sol
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): hand-settled: dt-mv5sbyrm825867ec routing rt-mv5sff57m9pd6o
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-round: sl-pending-review round 1 token dt-mv5sbyrm825867ec group dg-mv5sbyrm0872ba8a verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv5msri070p0qo-3, sl-pending-review): review-loop-end: sl-pending-review reason pass
- assumption (lane-mv5msri070p0qo-3, sl-pending-manifest): artifact-command: bun test gates/test/manifest-sync.test.ts ledger/test/install.test.ts

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mv5owdzadgdszk [delivered] not acted on: sl-plan-pending is paused on the round-limit question q-mv5ov3pob98znk. I recommend answering it with accept.

Why:
- Round 3 (openai-codex/gpt-6-sol, hand dt-mv5oknel7722d962) gave the verdict approve-with-changes, with 0 blocking findings. It found 1 major issue (it said `withdraw` works on reserved requests, which it does not) and 1 minor issue (the plan gave the tooling branch's merge-base and input.ts overlap wrongly).
- The classifier recorded the round as "unknown" only because the hand ended with a structured JSON result. The review-findings block was in its prose turn just before that (history://sl-plan-pending-3).
- Both findings are now fixed in PLAN.md rev 3. The verdict is saved at /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/PLAN-REVIEW-r3.md.
- Blocking findings by round: 3, then 1, then 0.

After an accept, the lane raises the plan question (approve / revise / cancel) with the plan at /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5msri070p0qo/PLAN.md.

If Jo answers extend, the lane dispatches one more review round.
- message msg-mv5uydtppl5qf4 [held] not acted on: wl-mv5msri070p0qo is done. PR #106 (https://github.com/thewolff/agent-system-2.0/pull/106) has a green full suite at head 1e74e59: tr-0mv5tp5bkmnfh3d, 3939 pass, 0 fail.

Merge order:
- Tooling PR #101 touches the same input.ts, surface-input.ts, lane-tools.ts, orchestrator.md, USER-GUIDE.md and MIGRATION.md.
- Whichever PR merges second needs a resolve that keeps both sets of words.
- tiers/orchestrator.md is at 246/269 lines and 17232/18168 bytes, near its size bound. Recheck it after both PRs are in.

One deviation from the approved plan: P-11 row 1 now allows the count line after the closing ask (en-mv5qj0e5u10ni8).

Restart as2 after merge so the surface loads the new code.
