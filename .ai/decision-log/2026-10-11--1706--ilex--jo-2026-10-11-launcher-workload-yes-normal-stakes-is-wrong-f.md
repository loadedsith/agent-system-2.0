---
date: 2026-10-11T17:06-07:00
engineer: Ilex
session: wl-mv45mh3byhixog
status: resolved
durable: false
supersedes:
workload: wl-mv45mh3byhixog
---

# Jo (2026-10-11): "launcher workload, yes. Normal stakes is wrong for this one: it touches surface/ launch, so production. When it lands, relaunch the row-6 bypass workload on openai." — answering Ilex's question whether to open a small workload that lets the launcher run a lane on another lab's model.
Why: the row-6 bypass workload (wl-mv457r7iqmq29s) lost two lanes to Anthropic's provider refusal. Both lane logs end with prompt_result status error, "Refusal (cyber): This request triggered restrictions on violative cyber content and was blocked under Anthropic's Usage Policy", retryable false (/Users/jowolff/.agent-system-2/lanes/wl-mv457r7iqmq29s/lane-1.jsonl near its end, and lane-2.jsonl). The runner reported this as "prompt ended error". Every lane today runs on one model: Ilex grepped surface/scripts/lane.ts for "model" and found nothing that picks a lane's model per workload. Lane argv in lane-started: entries carries no --model.
Change: let Jo name the model (or lab) a workload's lane runs on, so a workload can be relaunched on e.g. openai. The plan chooses the shape: a parameter on orchestrator_launch_lane and/or orchestrator_open_workload, the ledger entry that records it so a later relaunch, death and resume keep it, and how the lane runner passes it to omp (--model). It also states what happens to builder-lab: accounting and cross-lab review routing when the lane's lab is not anthropic: the classifier must treat the lane's actual lab as the builder. It also states how a resumed session (--resume) that was refused behaves on a new model. Optional, plan decides: surface a provider refusal in the lane-died: line instead of a bare "prompt ended error".
Requirements: regression tests that fail before the change (proven on a separate unpacked copy, never by overwriting the worktree) showing a lane launched with a named model starts omp on that model and keeps it across a relaunch. Add a MIGRATION.md item. Full suite via lane_full_test on the PR. Merging stays Jo's. Coordinate with wl-mv0n866rd9jlds (items 71/72), which also edits surface/scripts/lane.ts, surface/extensions/launch.ts and surface/src/launch.ts: the plan states the merge order or how conflicts are handled. Also coordinate with the dead-hands workload wl-mv45jcsi4h3nr4 (classifier/src/lab.ts builderLabs) if builder-lab accounting changes.
After this lands (merged by Jo), Ilex relaunches wl-mv457r7iqmq29s on openai per Jo's instruction in-mv45m5lmjhhnuo.

done: Jo can name the model a workload's lane runs on, the launcher starts the lane on that model and keeps it across relaunches, and the classifier counts the lane's actual lab as the builder; regression tests fail before the change and pass after; a MIGRATION.md item records it; the full suite is green at the PR head; the change is on a branch with a PR.
done-because: PR #36 (https://github.com/thewolff/agent-system-2.0/pull/36, branch wl/wl-mv45mh3byhixog) is at 77cd204. `git ls-remote` was rechecked after the restart, and both refs/heads/wl/wl-mv45mh3byhixog and refs/pull/36/head are 77cd2042fc9d2dc4f0dfb2a2f5cf3e7553769ef7.

Against the done line:
- Jo can name the model: orchestrator_open_workload and orchestrator_launch_lane take a `model` parameter. It is recorded as `lane-model:`, a bad or blank value is refused with nothing written, and `default` clears it.
- The launcher starts the lane on that model and keeps it across relaunches: every spawn passes `--model` from the newest lane-model: entry. Readiness requires get_state's provider/id to match it exactly; a mismatch fails the launch at stage model. A session recorded on another model is not resumed.
- The classifier counts the lane's actual lab as the builder: builderLabs no longer marks a runner lane that never got a prompt as unknown, and lane-ready: is written right before the first prompt.
- Regression tests fail before and pass after: 16 failed on a git-archive copy of origin/main, and all pass on the branch.
- A MIGRATION.md item records it: item 85.
- The full suite is green at the PR head: tr-0mv4g72p3gh0zql at 77cd204, with 3306 pass and 0 fail. The runner completed sl-full-mv45mh3byhixog-2.
- Cross-lab review passed in 2 rounds on openai and kimi. One pre-existing minor race was reported to the orchestrator in msg-mv4ggvn23rdse8.

Every slice is done. Merging is Jo's.

Rendered from the ledger by Ilex (they/them) at workload close; stakes production, mode autonomous, opened 2026-10-11T18:26:13.895Z.

## What changed

- sl-plan-lane-model: Plan: lane model per workload. The plan covers the launch/open parameter, a ledger entry that survives relaunch/death/resume, omp --model in the runner, the builder-lab and cross-lab routing for a non-anthropic lane, refused-resume behaviour, and merge order with wl-mv0n866rd9jlds / wl-mv45jcsi4h3nr4 — artifact: Plan approved: Jo answered approve on q-mv475ohyjtzojk (in-mv4ebfuk1twqo0) for /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv45mh3byhixog/PLAN.md, reviewed by openai-codex/gpt-6-astra (PLAN-REVIEW-r3-openai.md). The plan was built and shipped as PR #36 (head 77cd204, full suite green in tr-0mv4g72p3gh0zql: 3306 pass, 0 fail), and Jo has merged it (in-mv4h3stk7v629s).
- sl-lane-model-build: Build PLAN.md v3: model param on open/launch, lane-model: entry, omp --model with get_state barrier, fresh session on model change, refusal text in lane-died, builderLabs exemption, tests, docs, MIGRATION 85 — artifact: PR https://github.com/thewolff/agent-system-2.0/pull/36 at head 537acb5 (rebased on origin/main ef33eb4). Declared artifact on the clean tree: 161 pass / 0 fail. Fails-before on a git archive of origin/main: 16 fail / 19 pass (controls T8b and T5b pass by design).
- sl-lane-model-review: Cross-lab production review of PR #36 diff against PLAN v3: findings only — artifact: Round 1: openai had 1 major and 2 minor findings, kimi 3 minor; all were fixed in 9ffeb00 except the guard-replay manifest rows, which stay on purpose (en-mv4famqcnvl534). Round 2 on 77cd204: openai 0 findings; kimi 1 minor, "Same stop-vs-teardown race as round-1 (a) remains on the no-claim readiness-timeout and fatal-readiness paths", which is pre-existing and out of scope and was reported as a follow-up. Entries en-mv4fx80r71301s and round 2 above.
- sl-full-mv45mh3byhixog-1: full suite outside the fence at PR #36 — artifact: test-run tr-0mv4fenksfru68j: green at 537acb56eedd92b507f30dac142ffd4e2fcdc674 on PR #36; full 3302/0/22; alone: ./classifier/test/lab.test.ts 19/0, ./surface/test/lane-model-script.test.ts 12/0, ./surface/test/lane-model.test.ts 16/0, ./surface/test/launch.test.ts 48/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv4fenksfru68j
- sl-lane-model-fix1: Fix review round 1: failModel enqueues its death at decision time; blank model refused; DESIGN § 6 recovery wording; T2 tick catch-up row — artifact: Pushed 77cd204 to PR #36. It merges origin/wl at 537acb5 into a branch rebased on origin/main 4d6070a, so no pushed commit is rewritten; the tree equals 9ffeb00. Declared artifact on that tree: 161 pass / 0 fail. The new process rows T4r-p and T2p run on the external runner.
- sl-full-mv45mh3byhixog-2: full suite outside the fence at PR #36 — artifact: test-run tr-0mv4g72p3gh0zql: green at 77cd2042fc9d2dc4f0dfb2a2f5cf3e7553769ef7 on PR #36; full 3306/0/22; alone: ./classifier/test/lab.test.ts 19/0, ./surface/test/lane-model-script.test.ts 14/0, ./surface/test/lane-model.test.ts 16/0, ./surface/test/launch.test.ts 48/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv4g72p3gh0zql
- sl-ceiling-mv45mh3byhixog-2: Jo decides the ceiling overrun — artifact: answered stop in-mv4hs4u05lfsow

## Decisions made (and why)

- jo (surface): Jo: "keep production ceiling" — reading: The launcher-model workload keeps the production default ceiling of $150 / 12h; no lowering.
- jo (surface): Jo: "approve q-mv475ohyjtzojk" — reading: Approve the launcher-model plan (q-mv475ohyjtzojk). Not yet applied to the question row: the surface did not apply Jo's five-line batch.
- jo (surface): Jo: "approve q-mv475ohyjtzojk" — reading: Same launcher-model plan approval resent; still not applied to q-mv475ohyjtzojk because the batch was refused whole.
- jo (surface): Jo: "approve q-mv475ohyjtzojk" — reading: Third send of the launcher-model plan approval. Not applied, for the same multi-line pair reason.
- jo answered "approve" to q-mv475ohyjtzojk (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mv45mh3byhixog/PLAN.md
- sl-lane-model-build: model param on open/launch → lane-model: entry → omp --model, get_state check before ready, fresh session on model change
- sl-lane-model-review: production cross-lab review of the PR diff after the build settles; full suite via lane_full_test after the last push
tradeoff: a model change starts a fresh omp session (no --resume) to avoid replaying a refused or cross-provider transcript; ledger carries state
tradeoff: exact provider/model, known lab, no :level; a launch whose omp does not report get_state.model fails closed rather than run unverified
tradeoff: builderLabs (dead-hands wl-mv45jcsi4h3nr4 file) exempts runner lanes that ended before lane-ready:, so no prompt was ever sent
review: approve, openai-codex/gpt-6-astra, /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv45mh3byhixog/PLAN-REVIEW-r3-openai.md)
- jo (surface): deny en-mv4g50ylmp16gw
- jo (surface): Jo: "ping each, but bear in mind i could be taking a nap" — reading: Ilex sends Jo one message when PR #36 (lane model per workload) is green at its head and ready to merge. The ping stands alone when read cold. Nothing on this workload changes.
- jo (surface): Jo: "i merge'd 36, what do i do net?" — reading: Jo merged PR #36 (lane model per workload). pr://36 shows State MERGED, updated 2026-10-11T23:46:52Z. That fulfils the hold on the row-6 bypass workload wl-mv457r7iqmq29s (in-mv45m5lmjhhnuo): once the main checkout is fast-forwarded and as2 restarted, Ilex relaunches it with model openai-codex/gpt-6-sol. This workload still has the stale plan slice sl-plan-lane-model open, which blocks the close.
- jo (surface): Jo: "keep the order; the lane cap is 10 this launch, not 5 — start all four parked items now" — reading: Has Ilex start a short lane now, third of four. The lane completes the stale plan slice sl-plan-lane-model on the evidence that PR #36 is merged and done-because en- was recorded, then releases so the workload can close. No other work.
- jo answered "stop" to q-mv4hpk94b6cqo0 (wl-mv45mh3byhixog has used $125.45 of its $150 ceiling (83 %) and 142 of 720 minutes (19 %), production stakes; 188357508 tokens.
stop (the default): the lane keeps working and is stopped at the ceiling; nothing relaunches.
extend: the ceiling grows by one more block of this workload's own size and the lane goes on (a stopped lane relaunches); for an exact figure say `ceiling <usd> [<hours>] wl-mv45mh3byhixog` instead.
split: the lane is stopped at the ceiling like stop, and the remaining work is split into a new workload; nothing relaunches here.)
- jo (surface): Jo: "stop q-mv4hpk94b6cqo0" — reading: Answers the lane-model workload's second ceiling question with stop. No lane relaunches, and Ilex closes the workload once nothing is left open.
- assumption (lane-mv45mh3byhixog-1): builder-lab: anthropic lane lane-mv45mh3byhixog-1 model anthropic/claude-opus-5-5
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-group: sl-plan-lane-model group fg-mv45t6580e8ee8c8 members dt-mv45t658700e3c55,dt-mv45t658f802c47d
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-spawn: dt-mv45t658700e3c55 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-plan-lane-model--openai review yes group fg-mv45t6580e8ee8c8 row openai-codex/gpt-6-astra
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-spawn: dt-mv45t658f802c47d session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-plan-lane-model--kimi review yes group fg-mv45t6580e8ee8c8 row moonshot/kimi-k3
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-settled: dt-mv45t658700e3c55 routing rt-mv463lv1iggbuo
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-round: sl-plan-lane-model round 1 token dt-mv45t658700e3c55 group fg-mv45t6580e8ee8c8 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":4,"design":1,"tests":1},"minor":{"tests":1}},"titles":[{"severity":"major","kind":"correctness","title":"Model validation is not a readiness barrier"},{"severity":"major","kind":"correctness","title":"Missing get_state model bypasses the named-model guarantee"},{"severity":"major","kind":"correctness","title":"Resume model provenance is undefined for supported parked sessions"},{"severity":"major","kind":"design","title":"Interactive launches lack the fresh-session policy and an existing-workload model-update route"},{"severity":"major","kind":"correctness","title":"Rejected startup leaves unknown builder provenance that blocks later review"},{"severity":"major","kind":"tests","title":"T5 conflates a baseline-pass classifier guard with a new launcher integration"},{"severity":"minor","kind":"tests","title":"T1–T7 omit default clearing, tick catch-up and lane-model forgery coverage"}]}
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-settled: dt-mv45t658f802c47d routing rt-mv46fp6haikhkw
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-round: sl-plan-lane-model round 1 token dt-mv45t658f802c47d group fg-mv45t6580e8ee8c8 verdict accepted blocking unknown counts unknown
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-group: sl-plan-lane-model group fg-mv46i13l28fe0e40 members dt-mv46i13l30d4000d,dt-mv46i13lfae31639
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-spawn: dt-mv46i13l30d4000d session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-plan-lane-model--openai-2 review yes group fg-mv46i13l28fe0e40 row openai-codex/gpt-6-astra
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-spawn: dt-mv46i13lfae31639 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-plan-lane-model--kimi-2 review yes group fg-mv46i13l28fe0e40 row moonshot/kimi-k3
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-settled: dt-mv46i13l30d4000d routing rt-mv46nhi9sfc7i8
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-round: sl-plan-lane-model round 2 token dt-mv46i13l30d4000d group fg-mv46i13l28fe0e40 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{"tests":1}},"titles":[{"severity":"minor","kind":"tests","title":"T8 must distinguish named-to-default fresh startup from compatible default-era resume"}]}
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-settled: dt-mv46i13lfae31639 routing rt-mv46t5jat5tuj4
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-round: sl-plan-lane-model round 2 token dt-mv46i13lfae31639 group fg-mv46i13l28fe0e40 verdict accepted blocking unknown counts unknown
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-group: sl-plan-lane-model group fg-mv46v7tsfc0a779c members dt-mv46v7ts00e25f74,dt-mv46v7ts89f863f1
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-spawn: dt-mv46v7ts00e25f74 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-plan-lane-model--openai-3 review yes group fg-mv46v7tsfc0a779c row openai-codex/gpt-6-astra
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-spawn: dt-mv46v7ts89f863f1 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-plan-lane-model--kimi-3 review yes group fg-mv46v7tsfc0a779c row moonshot/kimi-k3
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-settled: dt-mv46v7ts00e25f74 routing rt-mv46zfbtb2bhmo
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-round: sl-plan-lane-model round 3 token dt-mv46v7ts00e25f74 group fg-mv46v7tsfc0a779c verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): hand-settled: dt-mv46v7ts89f863f1 routing rt-mv4752o13r5udc
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): review-round: sl-plan-lane-model round 3 token dt-mv46v7ts89f863f1 group fg-mv46v7tsfc0a779c verdict accepted blocking unknown counts unknown
- assumption (lane-mv45mh3byhixog-1, sl-plan-lane-model): The plan review took 3 rounds of the 5 allowed, each reviewed by openai and kimi. Round 1: openai said revise (6 major, 1 minor) and kimi said approve-with-changes (2 major, 4 minor). Round 2: openai approved with 1 minor; kimi said approve-with-changes, with 1 major (R2-1) and 1 minor. Round 3: openai approved with no findings; kimi said approve-with-changes, with 1 minor (R3-1: never-ready finalisation needs a stage, so a model failure writes exactly one launch-failed:). I folded R3-1 into PLAN.md §3 and T4 with no further round, since it is a minor clarification. The classifier refused every review hand's own verdict-file write, so the lane saved the verdict files from the hands' replies: PLAN-REVIEW-r{1,2,3}-{openai,kimi}.md in /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv45mh3byhixog/. Plan question q-mv475ohyjtzojk is raised.
- assumption (lane-mv45mh3byhixog-2): builder-lab: anthropic lane lane-mv45mh3byhixog-2 model anthropic/claude-opus-5-5
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-build): artifact-command: bun test surface/test/lane-model.test.ts surface/test/launch.test.ts surface/test/turn-end.test.ts classifier/test/lab.test.ts classifier/test/crosslab.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-build): hand-spawn: dt-mv4eeipq1be003a2 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-lane-model-build review no group dg-mv4eeipqcd6d8c8f row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-build): hand-settled: dt-mv4eeipq1be003a2 routing rt-mv4f9hwwfpgkcg
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-build): Decision: this branch adds the three missing install/manifest.tsv rows for gates/scripts/guard-replay.ts, gates/test/guard-replay.test.ts and gates/test/fixtures/guard-replay/corpus.jsonl. origin/main 797065b (commit 9433026) left them out, so gates/test/manifest-sync.test.ts fails on main itself and the full suite can't be green at this PR head without them. No open PR fixes it: `gh pr list --search guard-replay` came back empty. Rule breach on record: the build hand reported that, after its compaction, it typed the fence wrapper out by hand in 12 bash commands. It committed and pushed nothing.
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): review-group: sl-lane-model-review group fg-mv4fezag5a61a292 members dt-mv4fezaga9e615b9,dt-mv4fezag4ddbdbcf
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-spawn: dt-mv4fezaga9e615b9 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-lane-model-review--openai review yes group fg-mv4fezag5a61a292 row openai-codex/gpt-6-astra
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-spawn: dt-mv4fezag4ddbdbcf session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-lane-model-review--kimi review yes group fg-mv4fezag5a61a292 row moonshot/kimi-k3
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-settled: dt-mv4fezaga9e615b9 routing rt-mv4fo8alts1mgw
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): review-round: sl-lane-model-review round 1 token dt-mv4fezaga9e615b9 group fg-mv4fezag5a61a292 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":1},"minor":{"correctness":1,"docs":1}},"titles":[{"severity":"major","kind":"correctness","title":"A stop accepted after a model failure can suppress its required death receipt"},{"severity":"minor","kind":"correctness","title":"Explicit blank model values bypass validation and can write or launch"},{"severity":"minor","kind":"docs","title":"Switching back does not necessarily recover the old session"}]}
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-settled: dt-mv4fezag4ddbdbcf routing rt-mv4fwy6qrznaio
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): review-round: sl-lane-model-review round 1 token dt-mv4fezag4ddbdbcf group fg-mv4fezag5a61a292 verdict accepted blocking unknown counts unknown
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): Review round 1 on PR #36 at 537acb5. Two labs replied.

openai (agent sl-lane-model-review--openai) asks for changes, with 0 blocking, 1 major and 2 minor findings:
- major: a stop accepted after failModel suppresses the stage-model lane-died:;
- minor: a blank or whitespace-only model skips validation;
- minor: DESIGN-lane-launcher.md § 6 says "naming the old model again resumes that session", which the code does not do.

kimi (agent sl-lane-model-review--kimi) approves with minor changes, with 3 minor findings:
- the same stop/failModel race;
- T2's tick catch-up variant (a launchable relaunch after a death) is not covered;
- the guard-replay manifest rows are outside the plan's scope.

On that last one: the rows were added on purpose (entry en-mv4famqcnvl534), because without them manifest-sync fails on main. They stay.

The fix slice sl-lane-model-fix1 covers the race, the blank model, the DESIGN wording and the T2 tick-after-death row.

The full suite was green at 537acb5 (tr-0mv4fenksfru68j: 3302 pass, 0 fail). The fix push needs a new run.
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-fix1): hand-spawn: dt-mv4fxovr7502d899 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-lane-model-fix1 review no group dg-mv4fxovr3c8fc1e8 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-fix1): hand-settled: dt-mv4fxovr7502d899 routing rt-mv4g45u4y1ryf4
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-fix1): artifact-command: bun test surface/test/lane-model.test.ts surface/test/launch.test.ts surface/test/turn-end.test.ts classifier/test/lab.test.ts classifier/test/crosslab.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): review-group: sl-lane-model-review group fg-mv4g7on2a7081108 members dt-mv4g7on2896edf34,dt-mv4g7on247b33c9e
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-spawn: dt-mv4g7on2896edf34 session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-lane-model-review--openai-2 review yes group fg-mv4g7on2a7081108 row openai-codex/gpt-6-astra
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-spawn: dt-mv4g7on247b33c9e session /Users/jowolff/.agent-system-2/lanes/wl-mv45mh3byhixog/sessions/2026-10-11T18-26-16-264Z_01a12c37-2e48-7000-8a5a-0db2aa17f48a spawn sl-lane-model-review--kimi-2 review yes group fg-mv4g7on2a7081108 row moonshot/kimi-k3
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-settled: dt-mv4g7on2896edf34 routing rt-mv4gclzjcj6a68
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): review-round: sl-lane-model-review round 2 token dt-mv4g7on2896edf34 group fg-mv4g7on2a7081108 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): hand-settled: dt-mv4g7on247b33c9e routing rt-mv4ggm09v6n534
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): review-round: sl-lane-model-review round 2 token dt-mv4g7on247b33c9e group fg-mv4g7on2a7081108 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{"correctness":1}},"titles":[{"severity":"minor","kind":"correctness","title":"Same stop-vs-teardown race as round-1 (a) remains on the no-claim readiness-timeout and fatal-readiness paths: a stop accepted between SIGKILL and finish() suppresses the lane-died: (surface/scripts/…"}]}
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): review-loop-end: sl-lane-model-review reason pass
- assumption (lane-mv45mh3byhixog-2, sl-lane-model-review): Review round 2 on the fix commit 9ffeb00 (PR #36 head 77cd204).

openai (sl-lane-model-review--openai-2) approves, with 0 findings.

kimi (sl-lane-model-review--kimi-2) approves with 1 minor finding: the same stop-versus-teardown race still exists on the no-claim readiness-timeout path and the fatal-readiness path (surface/scripts/lane.ts ~806-816). That race was already there before this PR: those paths are on origin/main unchanged, and PLAN v3's R3-1 is scoped to the model stage.

Decision: the review passes with no blocking or major findings left. The pre-existing race is left out of this PR and reported to the orchestrator as a follow-up.

Both labs judged T4r-p deterministic: it fails on the old code and cannot hang, because the helper is bounded at about 30 s.
- assumption (lane-mv45mh3byhixog-2): Jo's in-mv4gjfwiwofrb4 says "deny en-mv4g50ylmp16gw". That is the reserved request P-11 row 6 raised when it refused `git reset --hard 3c402d8`. I am following the denial: no reset was run. Instead I restored the branch to a fast-forward of the pushed 537acb5 by merging origin/wl/wl-mv45mh3byhixog into the rebased branch (77cd204, whose tree equals 9ffeb00). Nothing pushed was rewritten, and no reserved action is pending.
- assumption (lane-mv45mh3byhixog-3): builder-lab: anthropic lane lane-mv45mh3byhixog-3 model anthropic/claude-opus-5-5
- assumption (lane-mv45mh3byhixog-4): builder-lab: anthropic lane lane-mv45mh3byhixog-4 model anthropic/claude-opus-5-5

## Dead ends — don't retry these

- sl-ceiling-mv45mh3byhixog-1 cancelled: Jo decides the ceiling overrun
- q-mv4hohi2f32q68 withdrawn (then cancel): finished under the ceiling — the question was: wl-mv45mh3byhixog has used $123.24 of its $150 ceiling (82 %) and 46 of 720 minutes (6 %), production stakes; 187040630 tokens.
stop (the default): the lane keeps working and is stopped at the ceiling; nothing relaunches.
extend: the ceiling grows by one more block of this workload's own size and the lane goes on (a stopped lane relaunches); for an exact figure say `ceiling <usd> [<hours>] wl-mv45mh3byhixog` instead.
split: the lane is stopped at the ceiling like stop, and the remaining work is split into a new workload; nothing relaunches here.

## Heads-up for whoever touches this next

- message msg-mv46ht5igq9fcw [delivered] not acted on: FYI for coordination: plan v2 of wl-mv45mh3byhixog adds about 6 lines to classifier/src/lab.ts builderLabs, the area the dead-hands workload wl-mv45jcsi4h3nr4 owns. A lane with a runner-written launch-failed: and no lane-ready: never received a prompt, so it no longer counts as an unknown builder. Without this, a launch killed for running on the wrong model would park every later review on the workload. Whichever PR Jo merges second rebases. Plan: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv45mh3byhixog/PLAN.md. Also: the classifier refuses write from review hands even for verdict files outside the repo ("a review hand does not change the work"); the round-1 openai hand could not save its verdict file, so the lane saved it from the reply.
- message msg-mv4f5inj9zenls [delivered] not acted on: artifact-failed: `bun test surface/test/lane-model.test.ts surface/test/launch.test.ts surface/test/turn-end.test.ts classifier/test/lab.test.ts classifier/test/crosslab.test.ts gates/test/manifest-sync.test.ts` exited 1 (tool call toolu_019SRCPZSB74EkesvGd6pJXk)
- message msg-mv4fbt8sx75xxc [delivered] not acted on: artifact-passed: `bun test surface/test/lane-model.test.ts surface/test/launch.test.ts surface/test/turn-end.test.ts classifier/test/lab.test.ts classifier/test/crosslab.test.ts gates/test/manifest-sync.test.ts` exited 0 (tool call toolu_01FYoMHQUCEBLXnD8XZvbMMT)
- message msg-mv4ggvn23rdse8 [delivered] not acted on: Follow-up from the PR #36 review (wl-mv45mh3byhixog). This race is already on origin/main and is not fixed in this PR.

The race: in surface/scripts/lane.ts, the runner kills omp on the no-claim readiness timeout or on a fatal readiness error, but it writes the lane-died: only in finish(). If a stop is accepted in the window between the kill and finish() (`as2 lane stop` or SIGTERM), exitClass reads the end as intended. The lane then gets a launch-failed: and no lane-died:.

PR #36 closed this for the model stage only: failModel now enqueues its death before the kill.

Suggested fix: enqueue the decided death before the kill on those two paths as well.

Separately, PR #36 adds the three guard-replay rows to install/manifest.tsv. Without them, manifest-sync fails on main at 797065b and later.
- message msg-mv4gz8gwwbxlvk [delivered] not acted on: PR #36 (lane model per workload, MIGRATION item 85) is green and ready for Jo to merge.
- Full suite at head 77cd204: 3306 pass, 0 fail (tr-0mv4g72p3gh0zql).
- Cross-lab review passed: openai and kimi, 2 rounds.

Once it is merged and the checkout is fast-forwarded with as2 restarted, wl-mv457r7iqmq29s can be relaunched with model `openai-codex/gpt-6-sol`.

Merge order: whichever of PR #36 and wl-mv0n866rd9jlds (items 71/72) Jo merges second needs a rebase.
- reserved request en-mv4g50ylmp16gw: git reset --hard: git reset --hard 3c402d8 && git merge --no-edit origin/main && git log --oneline -3 && git status --short (P-11 row 6 refused tool call toolu_01Wdrs3j9hfHa5AjWoFjoXcH) — denied
