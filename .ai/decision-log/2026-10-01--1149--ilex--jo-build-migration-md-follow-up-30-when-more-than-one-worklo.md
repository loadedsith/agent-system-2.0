---
date: 2026-10-01T11:49-07:00
engineer: Ilex
session: wl-mupuood9xe720w
status: resolved
durable: false
supersedes:
workload: wl-mupuood9xe720w
---

# Jo: "build MIGRATION.md follow-up 30. When more than one workload is open, a bare stakes word (throwaway/normal/production), mode word (autonomous/user-driven) or `ceiling <usd> [<hours>]` currently does nothing and says nothing. Make it reply "which one?" and list the candidate workloads by their one-liner and wl- id, the way bare answer words already do (surface/src/input.ts). A word with a wl- id keeps working as today. Update USER-GUIDE.md § 5, "A word did nothing", to match." Inputs: MIGRATION.md § M7 follow-ups item 30 (as of 2026-10-01 its text may exist only as an uncommitted edit in the main checkout /Users/jowolff/code/agent-system-2.0/MIGRATION.md, not on origin/main; Jo's words above are the full requirement); surface/src/input.ts (header comment line 5: a bare answer word with more than one possible target is refused as ambiguous, "which one?"; reuse that path rather than adding a second convention); USER-GUIDE.md § 5 "A word did nothing". Tests: a bare stakes word, a bare mode word and a bare `ceiling` word each with two open workloads reply "which one?" with both workloads' one-liners and ids and change nothing; the same words with a wl- id still apply; one open workload unchanged. Fence: gates/test/fence.test.ts, surface/test/lane-script.test.ts and surface/test/lane-smoke.test.ts fail inside a lane's fence; per Jo's standing routing, the full `bun test` outside the fence is Plumb's — record a "for Plumb: run the full bun test on <branch> at <head> outside the fence, report back" note with lane_record_entry and send Jo no command, script or path. Jo relays Plumb's result as an instruction row; read instruction rows on every wake.

done: With more than one open workload, a bare stakes word, mode word or `ceiling <usd> [<hours>]` replies "which one?" listing each candidate workload's one-liner and wl- id and changes nothing, while the same words with a wl- id apply as today, with tests for all three word kinds; USER-GUIDE.md § 5 "A word did nothing" matches the new behaviour; Plumb's full bun test outside the fence is green at the PR head; the change is on a branch with a PR.
done-because: - With more than one open workload, a bare stakes word, mode word or `ceiling <usd> [<hours>]` now returns the existing `ambiguous` command, with the workloads as candidates (surface/src/input.ts). whichOne echoes `which one? "<word>" fits wl-… (<brief excerpt>; stakes · mode · ceiling), … — add the id, e.g. "<word> wl-…"` and writes nothing (surface/extensions/surface-input.ts).
- The same words with a wl- id apply as before, and so does the case with one open workload.
- Tests cover all three word kinds: input.test.ts (stakes, mode), ceiling-surface.test.ts (ceiling), and extension.test.ts, which runs production, user-driven and `ceiling 80 4` end to end and checks that the ledger is unchanged, then that `production <wl>` applies. In the fence the 5-file artifact suite is 59/0.
- USER-GUIDE.md: the "which one?" and "A word did nothing" bullets match the new behaviour. They live in § 6, not the § 5 the done line names.
- Plumb's full bun test outside the fence is green at the PR head ecf2856: Jo answered "green", in-mupw00hhuiqjnk, with no counts relayed.
- The change is on branch wl/wl-mupuood9xe720w, in PR #9 (https://github.com/thewolff/agent-system-2.0/pull/9). Jo integrates it.

Rendered from the ledger by Ilex (they/them) at workload close; stakes normal, mode autonomous, opened 2026-10-01T18:11:14.397Z.

## What changed

- sl-plan-which-workload: Plan follow-up 30: when a bare stakes, mode or ceiling word fits more than one workload, reply "which one?" and list the candidate workloads. — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mupuood9xe720w/PLAN.md approved by Jo: q-mupuux4towlq80 answered "approve" (in-mupvaod8xjixa8)
- sl-which-workload: When several workloads are open, make a bare stakes, mode or ceiling word return "ambiguous" with workload candidates, rendered by whichOne. Add tests. Update the USER-GUIDE "which one?" and "A word did nothing" bullets. — artifact: Commit aa78eef on wl/wl-mupuood9xe720w. `bun test surface/test/input.test.ts surface/test/ceiling-surface.test.ts surface/test/extension.test.ts surface/test/numbering.test.ts surface/test/render.test.ts` → 59 pass / 0 fail. The 11 other non-fence surface files → 126 pass / 0 fail.
- sl-pr-which-workload: Rebase onto origin/main, push wl/wl-mupuood9xe720w with -u, and open the PR. — artifact: PR https://github.com/thewolff/agent-system-2.0/pull/9. Head ecf2856ef0e8c42bd37b74f0f9a6be8e191ca27b (aa78eef rebased onto origin/main f4b296e), pushed with -u, no force. The 5-file artifact suite after the rebase → 59 pass / 0 fail.
- sl-plumb-full-which-workload: Get Plumb's full bun test outside the fence at PR #9's head ecf2856. — artifact: Jo answered "green" to q-mupvk40koddmgw (in-mupw00hhuiqjnk): Plumb's full bun test outside the fence at ecf2856ef0e8c42bd37b74f0f9a6be8e191ca27b passed. No counts were relayed. After git fetch, origin/wl/wl-mupuood9xe720w = HEAD = ecf2856, so the green run is at the PR head.

## Decisions made (and why)

- jo flipped mode to autonomous
- jo answered "approve" to q-mupuux4towlq80 (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mupuood9xe720w/PLAN.md

The plan reuses the existing "which one?" path. With more than one open workload, a bare stakes, mode or `ceiling` word gets "which one?" and writes nothing. The reply lists each workload's wl- id, the opening of its brief and its stakes · mode · ceiling line.

Slices: one change slice covering input.ts, surface-input.ts, three test files and USER-GUIDE.md. Then the PR. Then the note for Plumb's full test run.

Your call: Jo's "one-liner" in this code is only the stakes/mode/ceiling line, which can be identical for two workloads. So I added the brief excerpt to tell them apart. Approve keeps the excerpt. Revise with "one-liner only" drops it.

The "A word did nothing" bullet is in USER-GUIDE.md § 6, not § 5. It is updated there.)
- jo answered "green" to q-mupvk40koddmgw (This waits on Plumb's full bun test of PR #9 at head ecf2856, run outside the fence. The ledger note to Plumb is en-mupvk1bqamfzls. When Plumb reports, answer green or red, with his counts if you have them. On green, I close the slice, write done-because and release. On red, I open a fix slice for the failures. Merging PR #9 is yours.)
- assumption (orchestrator-surface): brief-judged: change-large confidence 0.97 judge typesafe/jev-1.13.0
- assumption (lane-mupuood9xe720w-2, sl-plan-which-workload): State at park: plan written to /Users/jowolff/agent-scratch/agent-system-2.0/wl-mupuood9xe720w/PLAN.md and raised as q-mupuux4towlq80 (approve / revise / cancel) on sl-plan-which-workload. No repo changes; worktree clean at origin/main 29f5aa6. On approve, the next lane adds sl-which-workload (change-small; one cluster: surface/src/input.ts, surface/extensions/surface-input.ts, surface/test/input.test.ts, surface/test/ceiling-surface.test.ts, surface/test/extension.test.ts, USER-GUIDE.md), then sl-pr-which-workload (commit, fetch+rebase origin/main, push -u, open PR), then sl-plumb-full (ledger note for Plumb; closes on Jo's relayed instruction row). Design: widen the existing `ambiguous` Command's candidates with a `workload` kind (numbering's Target untouched) and render workload candidates in whichOne as `wl-… (<brief ≤60 chars>; stakes · mode · ceiling)`, with the tail `add the id, e.g. "<word> wl-…"`. On "revise one-liner only", drop the brief excerpt. Note: the "A word did nothing" bullet is at USER-GUIDE.md § 6, not § 5. It is updated there, along with the "which one?" bullet above it.
- assumption (lane-mupuood9xe720w-3, sl-which-workload): artifact-command: bun test surface/test/input.test.ts surface/test/ceiling-surface.test.ts surface/test/extension.test.ts surface/test/numbering.test.ts surface/test/render.test.ts
- assumption (lane-mupuood9xe720w-3, sl-plumb-full-which-workload): For Plumb: please run the full bun test on wl/wl-mupuood9xe720w at ecf2856ef0e8c42bd37b74f0f9a6be8e191ca27b outside the fence and report back.
- That head is PR #9 (https://github.com/thewolff/agent-system-2.0/pull/9), pushed to origin.
- It is also checked out in worktree /Users/jowolff/code/agent-system-2.0-lanes/wl-mupuood9xe720w.
- Inside the fence, surface/test/{input,ceiling-surface,extension,numbering,render}.test.ts gave 59 pass / 0 fail. The other 11 non-fence surface files gave 126 / 0.
- Not run inside the fence: gates/test/fence.test.ts, surface/test/lane-script.test.ts, surface/test/lane-smoke.test.ts, and the gates suite.
- No install/manifest.tsv rows should be needed, because no file was added.
sl-plumb-full-which-workload stays open until your report.
- assumption (lane-mupuood9xe720w-3): State at park:
- PR #9 (https://github.com/thewolff/agent-system-2.0/pull/9) is open at ecf2856, which is aa78eef rebased onto origin/main f4b296e. It was pushed with -u, no force.
- Done slices: sl-plan-which-workload, sl-which-workload and sl-pr-which-workload.
- Open: sl-plumb-full-which-workload, paused on q-mupvk40koddmgw (green / red) until Plumb reports on note en-mupvk1bqamfzls.
- Next lane, on green: close the slice on Plumb's counts at ecf2856, write done-because, release.
- Next lane, on red: add a fix slice. Any new commit needs a re-test of the new head.
Note: the old slice id sl-plumb-full was already taken ledger-wide, so this slice is sl-plumb-full-which-workload.

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mupw0mjji1v8xs [held] not acted on: wl-mupuood9xe720w is done and ready to close. Every slice is complete; the done-because entry is recorded. PR #9 (https://github.com/thewolff/agent-system-2.0/pull/9) is at head ecf2856. Plumb's full bun test is green at that head; you relayed it without counts. With several open workloads, a bare stakes, mode or `ceiling` word now replies "which one?", lists each workload's wl- id, brief excerpt and one-liner, and writes nothing. The USER-GUIDE bullets are updated in § 6. Merging PR #9 is yours.
