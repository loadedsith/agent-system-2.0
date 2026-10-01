---
date: 2026-10-01T09:32-07:00
engineer: Ilex
session: wl-mupql4646o8feo
status: resolved
durable: false
supersedes:
workload: wl-mupql4646o8feo
---

# Jo: "new workload: a lane that relaunches or resumes reads every instruction row Jo wrote on its workload since its last lane started, before acting, and follows the newest one that applies; an instruction written while a lane is mid-start reaches it on its next turn. Two failures on wl-muolz8qtp6ylfk: the "for Plumb" routing was missed and the run-or-skip question went to Jo instead. Source: MIGRATION.md § M7 follow-ups item 14." Evidence from this session (ledger wl-muolz8qtp6ylfk): Jo's instructions in-muopeiqaub4we8 (22:55:36Z, proof script goes to Plumb, not Jo) and in-muopsv1xhkdips (23:06:45Z, ledger note for Plumb, no message to Jo) were written while no lane was live; lane-muolz8qtp6ylfk-4 resumed at 16:05:55Z, its wake-read (16:06:09Z) listed slices only and named neither instruction, and it raised q-mupq909lwqybcw asking Jo to run the script. A second case: in-muonq581ayjjls on wl-muonhgx992outc was written seconds after lane-muonhgx992outc-3 started (mid-start). Likely seams: the lane's first prompt / wake render built by the lane starter and runner (surface/src/launch.ts first-prompt builder, surface/scripts/lane.ts), the lane wake-read tool (P-11 row 7 / § B7), and mid-run delivery of new instruction rows to a live lane. Overlap: PR #4 (wl-muolz8qtp6ylfk, spend ceiling) adds a ceiling line to the first prompt in launch.ts/lane.ts; the git-hygiene workload (wl-mupqeggnftygao, production) touches launch.ts and lane.ts; the numbered-batch-answers workload (wl-mupqck4ix2kjy8) touches surface/src/input.ts and render.ts. Expect rebases.

done: A lane that launches, relaunches or resumes on a workload is given every instruction row Jo wrote on that workload since its previous lane started, before its first action, and acts on the newest applicable one; an instruction row written while a lane is starting or running reaches that lane by its next turn; tests reproduce both wl-muolz8qtp6ylfk failures (the missed Plumb routing on resume and the mid-start instruction) and pass; the change is on a branch with a PR.
done-because: PR https://github.com/thewolff/agent-system-2.0/pull/7 (commit 8547122 on wl/wl-mupql4646o8feo, rebased on origin/main, pushed -u). Launch, relaunch and resume: firstPrompt now lists every Jo instruction row since the previous lane's launch: (all rows for a first lane), oldest first, with newest-applicable-wins, before the ledger_wake_read line. Mid-start and mid-run: the lane extension injects rows the prompt does not name at before_agent_start, then pushes new rows once each as an aside on a 15 s poll and at every tool result. Tests reproduce both failures. wl-muolz8qtp6ylfk resume miss: launch.test.ts, `bun test surface/test/launch.test.ts` 33/0. wl-muonhgx992outc mid-start: lane.test.ts, `bun test surface/test/lane.test.ts` 9/0. The hands confirmed the new tests fail without the change. Full `bun test surface gates` inside the fence: 2005 pass / 47 fail, all 47 in fence/lane-script/lane-smoke and all fence-environmental. lane-script/lane-smoke exercise lane.ts and need Jo's run outside the fence. Throwaway smoke against a real ledger printed the expected prompt section. Jo integrates.

Rendered from the ledger by Ilex (they/them) at workload close; stakes normal, mode autonomous, opened 2026-10-01T16:16:29.788Z.

## What changed

- sl-prompt-instructions: firstPrompt carries every Jo instruction row since the previous lane started (joInstructionsFor), oldest first, with "newest applicable wins" and "name them in your wake-read"; lane.ts promptFor feeds it; launch.test.ts reproduces the wl-muolz8qtp6ylfk resume miss — artifact: `bun test surface/test/launch.test.ts` run by the lane → 33 pass, 0 fail. New describe block in surface/test/launch.test.ts (tests a–c); hand confirmed (a),(b) fail with the render disabled and (c) with the dedupe disabled. firstPrompt section at surface/src/launch.ts:720-727; lane.ts promptFor passes joInstructionsFor(control, instructions, laneId).
- sl-midrun-delivery: Lane extension delivers Jo instruction rows not already in the first prompt: at before_agent_start (ids absent from event.prompt) and afterwards on a poll timer + tool_result step boundary via pi.sendMessage aside; lane.test.ts reproduces the wl-muonhgx992outc mid-start instruction — artifact: `bun test surface/test/lane.test.ts` run by the lane → 9 pass, 0 fail. Three new tests (mid-start before_agent_start injection; mid-run aside push once via poll/tool_result, orchestrator rows never; nothing before first prompt or after release); hand confirmed all three fail against HEAD's surface/extensions/lane.ts (6 pass / 3 fail).

## Decisions made (and why)

- assumption (orchestrator-surface): brief-judged: understand confidence 0.63 judge typesafe/jev-1.13.0
- assumption (lane-mupql4646o8feo-1, sl-prompt-instructions): artifact-command: bun test surface/test/launch.test.ts
- assumption (lane-mupql4646o8feo-1, sl-midrun-delivery): artifact-command: bun test surface/test/lane.test.ts

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mupr4caa00xzi8 [held] not acted on: wl-mupql4646o8feo is done: PR #7 (https://github.com/thewolff/agent-system-2.0/pull/7, commit 8547122). A launched, relaunched or resumed lane's first prompt now lists every instruction row Jo wrote since the previous lane's launch, oldest first, and says the newest one that applies wins. An instruction written mid-start or mid-run reaches the lane at before_agent_start, or as an aside within 15 s or at its next tool result. Both wl-muolz8qtp6ylfk failures are reproduced in tests: launch.test.ts 33/0, lane.test.ts 9/0. Inside the fence the full surface+gates run is 2005 pass / 47 fail, and all 47 are the known fence/lane-script/lane-smoke failures. lane-script/lane-smoke are the suites that exercise lane.ts, so they need Jo's run outside the fence. PR #4 also edits firstPrompt/promptFor, so a small conflict is likely. Jo integrates; ready to close.
