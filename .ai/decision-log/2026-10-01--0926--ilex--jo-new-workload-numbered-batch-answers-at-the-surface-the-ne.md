---
date: 2026-10-01T09:26-07:00
engineer: Ilex
session: wl-mupqck4ix2kjy8
status: resolved
durable: false
supersedes:
workload: wl-mupqck4ix2kjy8
---

# Jo: "new workload: numbered batch answers at the surface. The needs-you render numbers every open question and waiting reserved request; the surface accepts "1 approve, 2 deny" (or one per line) and applies each as its own ledger row with one echo line per answer; a bare approve/deny/accept with more than one possible target is refused with "which one?". Source: MIGRATION.md § M7 follow-ups item 1. (i already merged pr 3)" Context from this session: the surface's word parser (surface/src/input.ts `interpret`) takes at most two words and checks waiting reserved requests before question options, so a bare `approve` meant for a plan question approved a reserved request instead; prefixed answers like `q1: approve` silently matched nothing. The needs-you render lives in surface/src/errors.ts / render.ts; applied-input echo lines in surface/extensions/surface-input.ts. PR #3 (orchestrator tier text + row 1 orchestrator hand-over refusal) is merged; PR #4 (spend ceiling, wl-muolz8qtp6ylfk) is open and touches surface/src/input.ts and render.ts, so expect a rebase against it.

done: The needs-you render numbers every open question and waiting reserved request; the surface accepts numbered answers ("1 approve, 2 deny" or one per line) and applies each as its own ledger row with one echo line per answer; a bare approve/deny/accept with more than one possible target is refused with "which one?"; tests cover these cases; the change is on a branch with a PR.
done-because: PR #5 (https://github.com/thewolff/agent-system-2.0/pull/5, branch wl/wl-mupqck4ix2kjy8, commits 2cc8d4a + 128e988 rebased onto origin/main 1cd7875). On that branch:
- Every waiting reserved request and open question renders as `- #n …` in the wake render, the on-demand read and the between-wakes delivery. Numbers are session-stable and never reused (surface/src/numbering.ts).
- The surface accepts `1 approve, 2 deny` and the one-per-line form (plus `#1`, `1:`, `q1:` and `1)`). It validates the whole batch first and applies all-or-nothing, each answer through apply() as its own ledger row, with one `#n → receipt` echo line per answer.
- A bare approve/deny/withdraw/option word that fits more than one row is refused with `which one? …` and writes nothing.
- Tests cover these cases in surface/test/input.test.ts, extension.test.ts, numbering.test.ts, render.test.ts and delivery.test.ts. The six-file artifact run gives 56 pass / 0 fail, and the adjacent suites give 56 / 0.
- Not run inside the fence: fence, lane-script and lane-smoke.
- PR #4 overlap: the PR body names the hunks that will conflict.

Rendered from the ledger by Ilex (they/them) at workload close; stakes normal, mode autonomous, opened 2026-10-01T16:09:50.562Z.

## What changed

- sl-plan-batch-answers: Plan the slice cut for numbered batch answers at the surface against the done: line — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mupqck4ix2kjy8/PLAN.md approved by Jo: answer approve to q-mupqgm37d3j94w (instruction in-mupqixns8cpyps)
- sl-numbering: Number answerable needs-you lines with session-stable, never-reused #n (Numbering class) in the wake render, needsYouBlock and the poll — artifact: commit 2cc8d4a on wl/wl-mupqck4ix2kjy8; `bun test surface/test/numbering.test.ts surface/test/render.test.ts surface/test/delivery.test.ts surface/test/extension.test.ts` → 32 pass, 0 fail
- sl-batch-answers: Parse and apply numbered batch answers all-or-nothing, with one echo line per answer; refuse a bare answer word that has more than one target with "which one?"; update docs — artifact: commit 128e988 on wl/wl-mupqck4ix2kjy8 (rebased onto origin/main 1cd7875, pushed), PR https://github.com/thewolff/agent-system-2.0/pull/5; `bun test surface/test/input.test.ts surface/test/extension.test.ts surface/test/lane-tools.test.ts surface/test/numbering.test.ts surface/test/render.test.ts surface/test/delivery.test.ts` → 56 pass, 0 fail

## Decisions made (and why)

- jo answered "approve" to q-mupqgm37d3j94w (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mupqck4ix2kjy8/PLAN.md: two slices run in order. sl-numbering adds stable #n numbers to the needs-you lines. A number is held for the session and never reused. sl-batch-answers adds the numbered batch parser ("1 approve, 2 deny" or one per line) with all-or-nothing validation and one echo line per answer. It also refuses any bare answer word that has more than one target with "which one?". After that comes the rebase and PR, with the PR #4 overlap named. Your call: numbers that are never reused versus a reset to #1 when the list empties. The plan uses never reused.)
- assumption (orchestrator-surface): brief-judged: change-large confidence 0.82 judge typesafe/jev-1.13.0
- assumption (lane-mupqck4ix2kjy8-1, sl-plan-batch-answers): State at park: plan written to /Users/jowolff/agent-scratch/agent-system-2.0/wl-mupqck4ix2kjy8/PLAN.md and raised as q-mupqgm37d3j94w (approve / revise / cancel). No code changes yet; worktree clean at 1cd7875 (origin/main). The next lane, on approve, adds sl-numbering (change-small) and then sl-batch-answers (change-large) in that order (sl-batch-answers reads the Numbering contract in the plan), then rebases, pushes wl/wl-mupqck4ix2kjy8 and opens the PR, naming the PR #4 overlap in input.ts and surface-input.ts. Note: slice id sl-plan was already taken, so the plan slice is sl-plan-batch-answers.
- assumption (lane-mupqck4ix2kjy8-2, sl-numbering): artifact-command: bun test surface/test/numbering.test.ts surface/test/render.test.ts surface/test/delivery.test.ts surface/test/extension.test.ts
- assumption (lane-mupqck4ix2kjy8-2, sl-batch-answers): artifact-command: bun test surface/test/input.test.ts surface/test/extension.test.ts surface/test/lane-tools.test.ts surface/test/numbering.test.ts surface/test/render.test.ts surface/test/delivery.test.ts

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mupqxfbk25lk00 [held] not acted on: wl-mupqck4ix2kjy8 is done and ready to close. PR #5 (https://github.com/thewolff/agent-system-2.0/pull/5) is up for Jo to integrate. What it does:
- Needs-you lines now carry `#n`, stable for the session and never reused.
- `1 approve, 2 deny` and the one-per-line form are checked as a whole batch and applied all-or-nothing, one row and one echo line per answer.
- A bare answer word that fits more than one row gets "which one?" and writes nothing.
- Tests inside the fence: the 6-file artifact gives 56 pass / 0 fail, and the adjacent suites give 56 / 0. fence, lane-script and lane-smoke were not run.

Heads-up: PR #4 (spend ceiling) and PR #5 conflict in surface/src/input.ts and surface/extensions/surface-input.ts. Whichever merges second needs a rebase, and the PR body lists the hunks. Behaviour change: a short input shaped like "<number> <word>", e.g. "5 minutes", now gets a refusal echo ("#5 is not on the needs-you list") and still passes through to the model.
