---
date: 2026-09-30T13:44-07:00
engineer: Ilex
session: wl-muoaxc8vnba3nk
status: resolved
durable: false
supersedes:
workload: wl-muoaxc8vnba3nk
---

# Build the lane launcher per /Users/jowolff/code/agent-system-2.0/DESIGN-lane-launcher.md, decisions 1–16. Plumb runs the lane by hand. Done when: (1) a workload Jo opens in this session launches a real lane on its own; (2) that lane finishes or parks and releases without Jo; (3) the close tool commits its own decision-log entry; (4) every test in the design page's section 8 passes on OMP 18.4.4.

Rendered from the ledger by Ilex (they/them) at workload close; stakes normal, mode autonomous, opened 2026-09-30T16:10:20.095Z.

## What changed

- sl-launch: change-large: surface — pure launch predicate + renderLaunch (surface/src/launch.ts), lane.ts script (launch/run/interactive/stop/cleanup/log), orchestrator_launch_lane, open-tool trigger + tick catch-up + plan-first (decision 15) + done: line (decision 16), close tool commits its entry and refuses held / without done-because:, lane ledger tools (six + lane_handoff) refusing reserved and pushed prefixes, lane row: terminal release, exitClass, stop/park suppression; stakes.ts 'plan it' no longer flips mode; bin/as2 lane dispatch; tiers/lane.md paragraphs — artifact: commits 22c3ad9 + 4fde22b (manifest rows) on main; surface/src/launch.ts, surface/extensions/{launch,lane-tools}.ts, surface/scripts/lane.ts, bin/as2 lane, tiers/lane.md; bun test 2290 pass/6 fail before the manifest rows, install tests 13/0 after; fake-omp predicate matrix, lane-script and lane-smoke tests still owed to sl-verify
- sl-ledger: change-large: ledger module — holder-checked releaseWorkload, reserveLane (in-transaction predicate, one consumed cause, launch: entry by lane-starter), parkLane, handoffWorkload (two updates, null lease), reserved control-prefix helpers checked by created_by; schema stays v5 — artifact: commit bb1b45a on main; ledger/test/lane.test.ts; bun test ledger green (build REPORT.md)
- sl-plan: judge: the plan for this workload is DESIGN-lane-launcher.md (decisions 1–16), quorum-synthesized and gaslighted twice (fable, Codex), approved by Jo 2026-09-30 — decision 15 (plan-first) applied by hand — artifact: DESIGN-lane-launcher.md at 72ba014 (decisions 1–16); Jo opened the workload against it 2026-09-30T16:07Z
- sl-live: judge: one real workload on this repo launched by the machinery with Jo watching (the M7 gate) — decisions 1–16 observed end to end — artifact: live gate passed 2026-09-30 20:35:54–20:39:30Z: Jo opened wl-muokevdn0vre9s in as2 and watched live; launch: cause first → lane-started: → lane-ready: (1.5 s) → artifact-command: grep → done-because: line already present → released 20:36:13 → lane-exit: code 0 outcome completed → Ilex closed 20:39:30 with entry committed 7358c30; no lane-died:; export /Users/jowolff/agent-scratch/agent-system-2.0/migration/M7/lane-launcher/live-gate
- sl-verify: judge: chaos smoke (kill omp / runner / as2 mid-lane; two orchestrators race), real-OMP scripted session on 18.4.4 in the M5 pattern — first the rpc --resume premise, then park→answer→resume, --max-time deadline, row 15 silent on the exec path, fence-on worktree commit; reviewer-codex verification pass — artifact: real-OMP harness 16/16 ok on 18.4.4 (…/M7/lane-launcher/verify/out-3/RESULT.json); Codex B1–B7/S1–S7 each receipted (verify-2/REPORT.md); bun test 2329 pass/6 fail at 74a320b, the 6 = manifest gate, rows added in the next commit; commits 523dd9f 74a320b

## Decisions made (and why)

- jo (surface): Jo: "close it" — reading: For the live launch gate (sl-live): Jo chose not to watch the close of the README-line workload (wl-muokevdn0vre9s). Ilex closes it at once, and that close with its committed entry counts as the gate's close step.
- jo (surface): Jo: "close the lane-launcher build workload (wl-muoaxc8vnba3nk)" — reading: Close the lane-launcher build workload; this implies the README-line run (wl-muokevdn0vre9s) is accepted as the live launch gate's evidence, so sl-live completes on it.
- orchestrator (surface): close receipt: All five slices done; launcher landed 3fde665..c49f4cd, three Codex reviews cleared, live M7 gate passed on wl-muokevdn0vre9s (closed 7358c30). Open finding: the tick predicate relaunched a lane onto this finished-but-unclosed workload at 20:43:49Z.
- assumption (lane-plumb-by-hand): brief-judged: recorded as an assumption entry (routings needs a slice id, ledger/src/index.ts:797-800) — Plumb accepts the hand's choice; real-OMP runner/interactive/cleanup paths unexercised until sl-verify
- assumption (lane-plumb-by-hand): Codex leg 1 (14 findings) fixed in 0e0639c fecf6cc 427b5f4 d50c824 208b514 f542d24; real-OMP 7-scenario rerun all_ok; Plumb rulings: interactive quit with an open slice keeps writing lane-died: (design § 6, loud over silent); test-only AGENT_SYSTEM_LANE_READY_MS/END_GRACE_MS knobs kept (match AGENT_SYSTEM_LEASE_MS)

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-muokmle2v9dxj4 [delivered] not acted on: workload wl-muoaxc8vnba3nk done: all five slices done; the launcher landed 3fde665..c49f4cd with three Codex reviews cleared (…/M7/lane-launcher/codex-review-3/REVIEW.md verdict merge as is) and the live M7 gate passed on wl-muokevdn0vre9s (closed 7358c30). Close it.
- message msg-muokpr1yifikn4 [delivered] not acted on: wl-muoaxc8vnba3nk is finished and ready for the close tool: all five slices done, done-because recorded by lane-plumb-by-hand at 20:41:54Z (en-muokmle2zfjs3k). Finding: the lane-starter launched this lane at 20:43:49Z (launch: cause "first requested-by tick") onto that finished-but-unclosed workload, about two minutes after the by-hand lane released it. The launch predicate does not look at an existing done-because receipt, so every finished workload Jo has not closed yet gets a lane launched on it. That is the relaunch the design ruled out when it dropped Kimi's retry. It cost one idle lane here; this lane did no work and is releasing. Suggest a follow-up workload: the predicate should skip workloads whose latest entry since their last launch is a done-because.
