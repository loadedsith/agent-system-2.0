---
title: A built-in merge-train workload kind lands green PRs in order; normal-stakes PRs merge themselves
status: building
workload: wl-mv8s8srodefytc
pr: 156
---
**Built on branch `wl/wl-mv8s8srodefytc`.** Workload `wl-mv8s8srodefytc` (normal stakes). Plan revision 17.1 at `~/agent-scratch/agent-system-2.0/wl-mv8s8srodefytc/PLAN.md`, approved by Jo, rebuilds the train "Gas Town style" to Jo's spec (jo-issues#11: `in-mv91wjnaiiaayo`, `in-mv91xe2f3h0tts`, `in-mv91xkofi9cgzk`). Stacked PRs were added by Jo's `in-mv8u5wx3xu54hs`. It started as a codification of the procedure Jo wrote by hand for `wl-mv6144px2e2n7k`. PR #156 carries part 1. A second PR carries parts 2 and 3 (returning red PRs to their owning lane, and alerts).

**The word.** Typing `train <N> [<N> …]` at the surface opens an autonomous, normal-stakes workload with no plan step. Its brief (`trainBrief`, `surface/src/merge-train.ts`) carries the procedure. A surface-only `train:` entry binds the PRs, the way `test-pr` binds them, so the lane runs `lane_full_test` on them without pushing to them. `train <wl-…> <N> …` adds PRs to an open train and relaunches its lane if none is live. The word refuses: a PR already on the train, a PR on another open train of the same repo (unless Jo skipped it there), a workload that is not a train, and a standing or closed workload. A bare `train`, or `train q-…`, still answers an open question that offers the word.

**The procedure.** One PR at a time:
- work out the PR's stakes (`merge-train.ts stakes`). Normal means a same-repo `wl/<id>` branch of a normal-stakes workload **and** a main protected by an active ruleset that requires `as2/full-suite` on an up-to-date head (read from `GET /repos/{o}/{r}/rules/branches/main`, which needs no admin). Anything else is production;
- merge `origin/main` into the PR branch, never rebasing;
- if the merge conflicts, run `merge-train.ts resolve`. It fixes conflicts limited to MIGRATION.md, `migration/items/` and `install/manifest.tsv`, converting the PR's new legacy M7 blocks into item files and taking the union of the manifest rows;
- run the full suite with `lane_full_test`;
- before merging or asking, a readiness check common to both stakes: the head equals the tested sha, the PR is MERGEABLE, and the head contains the fetched main. A moved head re-prepares a fresh worktree at the new head; a moved main goes back to merging main in. Then stakes are checked again. Normal: `gh pr merge --merge --match-head-commit <tested head>`, with no question to Jo. Production: ask Jo merged / skip / stop with the fresh head and run, and move on to the next PR while that question is open;
- a red PR, a conflict outside the auto-fix set, or a stack problem goes back to its owner with `lane_train_return` (below), with no question. A runner error twice at one head, or a merge refused twice, is a lane-written `train-error:` and the PR is passed over until a later pass;
- a `red-main` result (every failure also fails on main's base, judged by the runner) lets the PR merge: the lane finds or files a `main-red` issue on the repo (`gh issue list/create --label main-red`), records `main-red: <url> run <id>`, and merges as for a green.

**Returning a PR to its owner (part 2, D6-D8).**
- `lane_train_return { pr, kind: red|conflict|stack, detail }` (`surface/extensions/lane-tools.ts`) reads the detail file and the PR's current head with `gh pr view`, then writes the train's `train-task: tt-<id> pr <n> attempt <a> kind <k> head <sha> owner <wl-…|none>` with the detail below it (`recordTrainTask`). The owner is D1's: the open workload of a same-repo `wl/<id>` head branch on the train's repo, else `none`. The attempt is 1 plus the PR's failed settles since Jo's last `retry`; after attempt 2 fails the tool refuses, since Jo's alert is due. A PR with an unsettled task is not returned again.
- The owner hears of the task in its first prompt (`ownerTasks` into `firstPrompt`) or, when a lane is live, as an aside once per session (`pushTrainTasks`, `surface/extensions/lane.ts`). It fixes on the head branch, pushes, and runs `lane_full_test`; or records `train-task-failed: <id> <why>` and releases.
- `settleTasks` gives each task one `train-task-settled: <id> fixed|failed <evidence>`: fixed when the first non-error run the owner requested after the task is green (or red-main) at a new head that is still the PR's head; failed on a red, on `train-task-failed:`, on an owner lane exit with no push since the task, or after 2 h with no push. A runner error never settles and never counts as an attempt.
- For owner `none`, `openTrainFix` opens one fix workload per (repo, PR), or reuses the open one carrying `train-fix: repo <r> pr <n>`, with the brief, `repo:`, `done:`, a `train-fix: … train-entry <en-…>` binding (valid only while that `train:` entry lists the PR), `push-dest:` at the head branch and `launch-requested: by merge-train`.
- While a workload owns an unsettled task, its first lane death, an intended exit with open work and the runner's no-live-lane notice are kept off needs-you (`trainRouted`, `surface/src/errors.ts`): the task counts them.

**What the machinery enforces.**
- The test runner posts the terminal commit status `as2/full-suite` (success / failure / error) on the sha it fetched and tested, for every PR. Stale or superseded runs post nothing. Jo's one-time ruleset on main requires that status on an up-to-date head, so GitHub refuses any merge of an untested tree. Until the ruleset exists, every PR counts as production and asks Jo.
- P-11 row 6 refuses a lane's non-GET `gh api` call to statuses, check runs or check suites; the GraphQL status and check mutations; and any `gh api` argument the gate cannot read.
- The starter refuses train runs after Jo's `stop` until a new `train` word. An open question no longer holds the train.
- A `skip` cancels that PR's train slices, and the close check (`ClosePr.trainSkipped`, `surface/src/close-entry.ts`) treats the skipped PR as if it were closed.

**Stacked PRs.** A PR declares a dependency with a `Depends-on: #N` body line or by basing on another open PR's head branch. Before each PR, `merge-train.ts order` sorts the train with a stable topological sort, so a train with no dependencies keeps Jo's order. It prints the chain (e.g. `#101 → #106 · #110`), and the lane shows it in its messages and questions. The starter refuses a train PR whose body dependency is unmerged or whose base is not the default branch.

**Not yet built.** The train tick (D10) that calls `settleTasks`, `actionable`, `ownerDeliveries` and `openTrainFix` every 5 minutes; Jo's alerts after two failed fixes or on production stakes, with re-sends at 4 h and 8 h on jo-issues issues labelled `as2-train` (D9). The kind is documented in `USER-GUIDE.md`. `tiers/orchestrator.md` is at its byte bound and is not edited.
