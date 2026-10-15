---
title: A built-in merge-train workload kind lands green PRs in order; normal-stakes PRs merge themselves
status: building
workload: wl-mv8s8srodefytc
pr: 156
---
**Built on branch `wl/wl-mv8s8srodefytc`.** Workload `wl-mv8s8srodefytc` (normal stakes). Plan revision 17.1 at `~/agent-scratch/agent-system-2.0/wl-mv8s8srodefytc/PLAN.md`, approved by Jo, rebuilds the train "Gas Town style" to Jo's spec (jo-issues#11: `in-mv91wjnaiiaayo`, `in-mv91xe2f3h0tts`, `in-mv91xkofi9cgzk`). Stacked PRs were added by Jo's `in-mv8u5wx3xu54hs`. It started as a codification of the procedure Jo wrote by hand for `wl-mv6144px2e2n7k`. This PR (#156) carries part 1. Parts 2 and 3 (returning red PRs to their owning lane, and alerts) follow in a second PR.

**The word.** Typing `train <N> [<N> …]` at the surface opens an autonomous, normal-stakes workload with no plan step. Its brief (`trainBrief`, `surface/src/merge-train.ts`) carries the procedure. A surface-only `train:` entry binds the PRs, the way `test-pr` binds them, so the lane runs `lane_full_test` on them without pushing to them. `train <wl-…> <N> …` adds PRs to an open train and relaunches its lane if none is live. The word refuses: a PR already on the train, a workload that is not a train, and a standing or closed workload. A bare `train`, or `train q-…`, still answers an open question that offers the word.

**The procedure.** One PR at a time:
- work out the PR's stakes (`merge-train.ts stakes`). Normal means a same-repo `wl/<id>` branch of a normal-stakes workload; anything else is production;
- merge `origin/main` into the PR branch, never rebasing;
- if the merge conflicts, run `merge-train.ts resolve`. It fixes conflicts limited to MIGRATION.md, `migration/items/` and `install/manifest.tsv`, converting the PR's new legacy M7 blocks into item files and taking the union of the manifest rows;
- run the full suite with `lane_full_test`;
- normal stakes, green and mergeable, with main contained in the head: `gh pr merge --merge --match-head-commit <tested head>`, with no question to Jo. Production stakes: ask Jo merged / skip / stop, and move on to the next PR while that question is open;
- a red PR, a conflict outside the auto-fix set, a stack problem, or a merge refused twice is recorded as `train-passed:` and passed over, with no question.

**What the machinery enforces.**
- The test runner posts the commit status `as2/full-suite` (pending, then success / failure / error) on the exact sha of every PR it tests. Strict branch protection on main, a one-time step for Jo, requiring that status and an up-to-date head makes GitHub refuse any merge of an untested tree.
- P-11 row 6 refuses a lane's `gh api` writes to statuses or check runs.
- The starter refuses train runs after Jo's `stop` until a new `train` word. An open question no longer holds the train.
- A `skip` cancels that PR's train slices, and the close check (`ClosePr.trainSkipped`, `surface/src/close-entry.ts`) treats the skipped PR as if it were closed.

**Stacked PRs.** A PR declares a dependency with a `Depends-on: #N` body line or by basing on another open PR's head branch. Before each PR, `merge-train.ts order` sorts the train with a stable topological sort, so a train with no dependencies keeps Jo's order. It prints the chain (e.g. `#101 → #106 · #110`), and the lane shows it in its messages and questions. The starter refuses a train PR whose body dependency is unmerged or whose base is not the default branch.

**Not yet built (second PR).** Red PRs and conflicts return to the owning lane as tasks; a red main files a bug and the train keeps merging; Jo is alerted only after two failed fixes or on production stakes, with re-sends at 4 h and 8 h on jo-issues issues labelled `as2-train`. The kind is documented in `USER-GUIDE.md`. `tiers/orchestrator.md` is at its byte bound and is not edited.
