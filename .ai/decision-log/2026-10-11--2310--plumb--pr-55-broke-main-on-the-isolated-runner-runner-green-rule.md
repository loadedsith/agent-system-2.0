---
author: plumb
created: 2026-10-11T23:10:00-07:00
status: resolved
---

# PR #55 broke main on the isolated test runner; no Plumb PR goes to Jo without a runner-green run

## What happened

- Plumb's PR #55 (orchestrator questions as ledger rows, MIGRATION item 105) merged to main at `ba17fc2` on 2026-10-11. It changed `gates/extensions/r01-turn-shape.ts` so that every passing orchestrator reply calls `recordPublication(s.ledger(), …)`. That opens the real ledger `~/.agent-system-2/ledger.db`, even for replies that ask nothing.
- The isolated test runner runs as `_as2test`, which is deliberately barred from `~/.agent-system-2`. On the runner, 4 tests in `gates/test/turn-shape-once.test.ts` fail. Main is red there, and so is every PR's full-suite slice, including #67 (M8 wake render). Ilex found it; Ilex's fix workload is `wl-mv4u5gzyelrrb4` (lane started 2026-10-12T05:53:36Z).
- Reproduced without the runner: `HOME=$(mktemp -d) bun test gates/test/turn-shape-once.test.ts` gives 4 fail, while the same file passes 10/10 under Jo's HOME (PortInventory hand, `~/agent-scratch/agent-system-2.0/port-inventory/INVENTORY.md`). A Linux container with no `~/.agent-system-2` shows the same 4 failures.
- Why it got through: Plumb's PRs are built in scratch clones outside the lane system. The only suite Plumb ever ran was plain `bun test` as Jo, and that can read the ledger. No `~/.agent-system-2/test-runs/` result carries `"pr": 55`. Jo merged #55 on Plumb's word that it was green.
- The follow-up PR #68 deepened the same pattern: row 15 always opens the ledger, and row 1 binds on tool-bearing messages too. #68 is a draft and frozen until `wl-mv4u5gzyelrrb4` merges. It will then get lazy ledger reads and a runner run.
- Interim rule sent to every Plumb hand on 2026-10-11 (broadcast, 12 of 12 delivered):
  - Never call `test-runner.ts start` and never write the live ledger.
  - Run the full `bun test` plus a proxy pass with `HOME=$(mktemp -d)`.
  - Open PRs as drafts marked "not ready: awaiting runner run".
  - Plumb arranges real runner runs through Ilex.

## Charter amendment — applied on Jo's order

Jo said "yes" on 2026-10-11 to putting this rule into Plumb's charter. Plumb first proposed it rather than editing: `.ai/plumb-seat-charter.md` § "Your charter is not yours to amend" says *"You propose; someone else applies."* Jo then ordered it applied ("I WANT IT NOW"). Plumb inserted the section below into the live checkout's charter, immediately before `## Manage, don't do`. The charter is untracked (`.git/info/exclude:11`), so the edit exists only in `/Users/jowolff/code/agent-system-2.0/.ai/plumb-seat-charter.md` and not in git. The conflict was Jo's direct order against the charter's no-self-amend rule, and Jo's order was taken. To reverse, delete that section.

**Applied text:**

```markdown
## No PR reaches Jo without a green isolated-runner run

On 2026-10-11 Plumb's PR #55 merged to main having passed only a plain `bun test` run as Jo. It opened the real ledger on every orchestrator reply, so main went red on the isolated `_as2test` runner and every PR's full-suite run failed behind it (decision log `2026-10-11--2310--plumb--pr-55-broke-main-on-the-isolated-runner-runner-green-rule.md`). The rule that follows from it binds every PR Plumb or a Plumb hand produces:

- Never write "merge #N" to Jo, and never call a PR ready, without a passing full-suite run on the isolated test runner as `_as2test`. Attach the test-run id and its result.json `pr` and head to the message. Plain `bun test` as Jo does not count, whatever its result.
- Before that run, every builder also reports a proxy pass, `HOME=$(mktemp -d) bun test`, separately from the normal run. A failure that only the proxy shows is a bug in the PR.
- A code path the PR adds or touches opens `~/.agent-system-2` only where the work requires it, and lazily. Tests use temporary ledgers.
- PRs open as drafts until the runner run is green.
- If the runner cannot be reached for a PR, that is a blocker reported to Jo by name. It is never a reason to substitute another check.
```

## Lessons

- A check that runs as Jo cannot catch a bug that only shows for a user who can't see Jo's files. The runner exists to be that other user, and Plumb's process bypassed it.
- "Suite green" in a Plumb report meant "green as Jo" without saying so. A receipt has to name the user and the runner, not only the pass count.
