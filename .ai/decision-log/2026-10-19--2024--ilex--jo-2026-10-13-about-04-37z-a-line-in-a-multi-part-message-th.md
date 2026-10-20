---
date: 2026-10-19T20:24-07:00
engineer: Ilex
session: wl-mv66ylim0gahog
status: resolved
durable: false
supersedes:
workload: wl-mv66ylim0gahog
---

# Jo (2026-10-13, about 04:37Z, a line in a multi-part message; the surface assigned it no input id): "Open a production workload, plan first: build the GitHub-issues projection of the ledger as designed in /Users/jowolff/agent-scratch/agent-system-2.0/issues-design/DESIGN.md. One issue per workload; the ledger is the truth for every field; provenance seq is the outbox with a cursor and dirty set in a sidecar ~/.agent-system-2/issues.db drained from the surface poll; an hourly reconciler records issues-drift: N on wl-orchestrator and repairs drift; Closes #N is appended to the PR body by publishEntry, never by a model; ledger close closes issues that have no PR; issues Jo files become instructions on wl-orchestrator; typed words issues on / issues off are the switch; caps 20 calls per tick and 300 per hour; lane one is thewolff/agent-system-2.0, currently open workloads only, no backfill. Jo's answers to the file's § 8: MIGRATION items with no workload get no issue in lane one; a PR-bearing workload's issue closes at PR merge, labelled awaiting-merge until then. First slice live-tests that GitHub honours a Closes #N added by a later gh pr edit. Reason (Jo): I want a GitHub-issues view of pending work that machinery closes when the work is done."

Notes (Ilex):
- **The design is the spec.** Read /Users/jowolff/agent-scratch/agent-system-2.0/issues-design/DESIGN.md first. Jo's § 8 answers above override any open choice there.
- **Acting with Jo's authority (Jo's carve-out, in-mv64ibt8qvuzuo).** "Issues Jo files become instructions on wl-orchestrator" turns GitHub content into Jo-authored ledger rows. The plan states exactly how an issue is proven to be Jo's: author login, the repo's permission model, edits after filing, comments, and issues transferred in. It also states what happens to an issue filed by anyone else (recorded as non-Jo, or ignored), and how a lane or a hand cannot file an issue that becomes a Jo instruction. Lanes run `gh` as Jo's account, so author login alone does not distinguish Jo from a lane. The plan must solve this, or raise it on the plan question with options.
- **Writes to GitHub.** Only the surface process drains the outbox; lanes never call it. Caps are 20 calls per tick and 300 per hour. GitHub being down or rate-limiting never blocks the surface poll or a turn, and it is recorded, not retried loudly (fault-tolerance rule).
- **publishEntry's `Closes #N`.** It is appended by machinery when the decision log is committed and pushed to the PR, never typed by a model. The first slice's live test of a `Closes #N` added by a later `gh pr edit` uses a throwaway issue and PR on thewolff/agent-system-2.0, and states how both are cleaned up.
- **Coordination.**
  - The question-links workload wl-mv66q5b148uznk adds links to questions.
  - The one-message-answers workload opened alongside this one changes needs-you rendering and the surface poll.
  - The monitoring workload wl-mv654hoqwpfhmo has a daily report and switches convention; the Phoenix workload wl-mv65t5d34lts00 uses the `as2 phoenix` word shape. Prefer one switch convention.
  - The ledger guards (PR #109, merged) and the forgery boundary shelving (/Users/jowolff/agent-scratch/agent-system-2.0/identity-design/SHELVED.md) bear on who may write wl-orchestrator instruction rows.
  
  Name shared files. Merge order green-first.
Regression tests fail before the change, proven on a separate unpacked copy. Smoke: issues appear for the currently open workloads on thewolff/agent-system-2.0, a ledger close closes a PR-less workload's issue, and `issues off` stops all GitHub writes. MIGRATION.md item. Full suite via lane_full_test on the PR. Merging stays Jo's (merge commit). Production stakes (Jo).

done: Per DESIGN.md and Jo's § 8 answers: every currently open workload on thewolff/agent-system-2.0 has one GitHub issue whose fields come from the ledger. They are kept by a provenance-seq outbox drained from the surface poll under the 20-per-tick and 300-per-hour caps, an hourly reconciler records issues-drift and repairs it, and PR bodies get a machinery-appended Closes #N. A PR-bearing workload's issue is labelled awaiting-merge and closes at merge, and a ledger close closes a PR-less one. Issues proven to be filed by Jo become wl-orchestrator instructions, and `issues on` / `issues off` switch it. The later gh pr edit Closes #N behaviour is live-tested, regression tests fail before the change, a MIGRATION.md item records it, the full suite is green at the PR head, and the change is on a branch with a PR.
done-because: This relaunch found only the historical sl-plan-issues row still open. Closed it on Jo's existing accepted review (in-mv6veobf3666f4) and plan approval (in-mv6vjcvqnb4sg0), preserving the final accepted finding title in its artifact and PR comment https://github.com/thewolff/agent-system-2.0/pull/217#issuecomment-6195418994. All implementation, smoke, review and full-suite slices were already done. Fresh gh pr view 217 confirms OPEN at unchanged b69cdb30a20164f67f7c4e0fbc37d7c5409fb00b; replayed runner receipt en-mv9a2ed1jgit4w proves full suite green there (5244 passed, 0 failed, 94 skipped; changed files individually green). No code, commits, pushes, or test reruns this relaunch. Full done-condition evidence remains en-mv9a38p5dfsao0 and the PR body. Jo integrates; rollout remains restart Ilex, issues on, remove as2-test/closes-edit remote branch, optional personal gh logout.

Rendered from the ledger by Ilex (they/them) at workload close; stakes production, mode autonomous, opened 2026-10-13T04:39:11.470Z.

## What changed

- sl-plan-issues: Write the plan for the GitHub-issues projection (DESIGN.md + Jo's § 8 answers), get a cross-lab plan review, raise approve/revise/cancel. — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN.md; Jo approved plan q-mv6vfi2p6715a8 via in-mv6vjcvqnb4sg0, then amendment via in-mv8yzvhqf6jow0. Review accepted via q-mv6v7u4623xslc / in-mv6veobf3666f4, retaining final finding title: "PR scan omits by-number test-requested PRs outside bound branches". Implementation, subsequent reviews and green PR #217 already complete; this closes the historical plan row left open.
- sl-issues-closes-live: Live-test that GitHub honours a Closes #N added by a later gh pr edit: throwaway issue T, empty-commit PR P on as2-test/closes-edit, edit body, Jo merges, T closed by P — artifact: The test checked issue #124 and PR #125 on thewolff/agent-system-2.0 with GraphQL:
- Before the edit, closingIssuesReferences on #125 was []. After `gh pr edit 125 --body "...Closes #124"` it was [#124].
- Jo merged #125 at 2026-10-13T16:32:36Z (merge commit 6165ecc).
- #124 then read CLOSED, stateReason COMPLETED, ClosedEvent closer PullRequest #125.
- Evidence: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/closes-live/EVIDENCE.md.
- Leftover: the remote branch as2-test/closes-edit still exists. Deleting it is Jo's (row 6), and it will be listed in the PR body.
- sl-issues-core: Build the issues projection core: config, sidecar, render, prs, github caps, switch reader, footer, projector (claim, seeding, ingest, PR scan + footer edits, push), the surface row, index/config/manifest wiring, tests — artifact: Commit 727dba7 on wl/wl-mv66ylim0gahog. The declared artifact `bun test surface/test/issues-render.test.ts surface/test/issues-prs.test.ts surface/test/issues-projector.test.ts surface/test/issues-footer.test.ts gates/test/manifest-sync.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/lane.test.ts` gave 89 pass / 0 fail. The other full-surface tests (extension, ceiling-surface, wake-push, test-runner-smoke, orchestrator-question, plan-first, lane-tools, fixtures-fable) gave 150 pass / 0 fail. Every PLAN.md rev 9 § 9.2 case is present in surface/test/issues-projector.test.ts. The typecheck is unproven: the repo has no typecheck command and no bun types (hand's report). The per-repo tracker (Linear) and the turn-end check are scope adds, and they go to new slices after the plan amendment.
- sl-ceiling-mv66ylim0gahog-1: Jo decides the ceiling overrun — artifact: answered stop in-mv7g3erl5udn28
- sl-plan-amend: Plan amendment rev 10 (PLAN.md § 13) for Jo's two scope adds: tracker per repo (ContextPress ⇒ Linear ENG, as2 ⇒ GitHub, tracker word override) and a turn-end check that each Ilex turn updates its workloads' issues — artifact: Jo approved PLAN.md rev 12 § 13 (in-mv8yzvhqf6jow0, answer to q-mv8ymluhfjq5j4). Review: approve-with-changes from openai-codex/gpt-6-sol, at /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-AMEND-REVIEW-r2-openai.md. Both round-2 majors are answered in rev 12: the old footer is stripped on a tracker move, and turns.seq is now per workload. Neither fix has been reviewed since.
- sl-issues-intake: GitHub intake per PLAN.md § 6: discovery by edge cursor, Jo-proof, instruction row on wl-orchestrator, acked retry; row 6 reserves gh auth switch/token, keychain read, GH_TOKEN= — artifact: Commit c885326 on wl/wl-mv66ylim0gahog.
- Declared artifact `bun test surface/test/issues-intake.test.ts gates/test/tool-call-rows.test.ts gates/test/manifest-sync.test.ts`: 131 pass / 0 fail.
- Other row-6 suites (known-fragment, case-and-noexec, review-round6): 319 pass / 0 fail.
- surface/src/issues/intake.ts exports `intake(ctx: PhaseContext)` as the core's TickPhases.intake. It is not wired into the row yet; sl-issues-turnend or the wiring step does that.
- Row 6 now reserves `gh auth switch|token|login|logout|refresh|setup-git`, GH_TOKEN/GITHUB_TOKEN assignments, and `security find-generic|internet-password`.
- Row 6 also reserves `gh auth status --show-token|-t`. The hand found that it prints the token, so it is the same read as `gh auth token`; I kept it. Bare `gh auth status` still passes.
- Live read-only GraphQL checks: the discovery and proof queries are both valid.
- sl-issues-closes: publishEntry appends the Closes #N footer to the PR body it creates when the switch is on and the link has an issue number (PLAN.md § 5) — artifact: Commit f303866 on wl/wl-mv66ylim0gahog. Declared artifact `bun test surface/test/close-entry.test.ts` → 19 pass / 0 fail, 115 expect() calls. The new tests cover: a created PR's body ends with closesFooter(n); a found open PR runs only `pr list`, and issues.db is byte-identical before and after; off, no config, no sidecar, no link, a link without a number, and an unreadable sidecar each leave the body as main's with unchanged calls. Footer lookup: a lazy `closes()` on EntryCommit.publish; workload.ts is unchanged.
- sl-issues-linear-live: Throwaway ENG issue with Jo's key: record which as2 marker survives Linear's description, move it In Review → Done → Canceled, read labels, then issueDelete — artifact: Ran `bun "$AS2_SCRATCH/linear-live.ts"` → exit 0. Throwaway issue ENG-2282 was created, read back, moved In Review → Done → Canceled with each state read back, and then deleted (read back as trashed: true, archived). The `<!-- as2:begin -->` HTML-comment marker came back byte-identical and is the chosen marker. The visible fence was escaped to `\--- as2 ---`, so it is rejected. Evidence: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/linear-live/EVIDENCE.md. The marker choice was sent to the sl-issues-tracker hand.
- sl-issues-tracker: Tracker per repo per PLAN.md § 13.2: config trackers + overrides, routing and tracker-entry reader, sidecar columns, per-tracker caps, linear.ts adapter, projector routing, move with footer strip, footer guard in close-entry.ts; tests — artifact: Commit 405c33d on wl/wl-mv66ylim0gahog.
- Declared artifact (9 issues/close-entry/manifest test files): 146 pass / 0 fail. The full-surface test files (delivery, wake-close, lane, extension): 51 pass / 0 fail.
- Live adapter check: on the first run, Linear refused the hand's team query with "Query too complex" (21560 > 10000). The lane fixed it in linear.ts with teams first:1 and per-issue labels first:20.
- The re-run against live ENG passed: team, findByTitle, listLabelled, create (ENG-2283), read, update, comment and delete. A GraphQL error is returned as a failure with the key redacted.
- Evidence: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/linear-live/EVIDENCE.md.
- sl-issues-turnend: PLAN.md § 13.3: at each orchestrator turn end, mark the turn's workloads first-dirty, record turns rows with per-workload seq, settle on pushed_seq, one notice when unsettled two ticks; wire the committed intake phase into the row — artifact: Declared artifact (issues-turnend, issues-projector, delivery, wake-close, lane and extension tests): 95 pass / 0 fail.

Committed on wl/wl-mv66ylim0gahog:
- the new file surface/src/issues/turnend.ts;
- the turns table and the priority column in sidecar.ts;
- `ORDER BY priority DESC` in the projector's push query;
- issues.ts: session_start sets turn_mark, agent_end with willContinue false records the turn and runs a tick, every tick settles the turn rows, and ROW_PHASES = {intake}.

All 11 § 13.3 cases are covered, plus the intake cadence. The hand showed the priority-first case fails when `priority DESC` is removed.
- sl-issues-reconcile: PLAN.md § 4 per tracker: hourly reconcile phase records `issues-drift:` on wl-orchestrator, repairs via force, unknown never 0, two-run notice; plus the read-only `surface/scripts/issues.ts check` — artifact: Commit c40628e on wl/wl-mv66ylim0gahog.

- New files: surface/src/issues/reconcile.ts, surface/scripts/issues.ts (`check`, read-only) and surface/test/issues-reconcile.test.ts (15 tests: the § 9 reconcile cases plus Linear drift).
- The lane wired reconcile into ROW_PHASES in surface/extensions/issues.ts and added the manifest rows for turnend, reconcile and the scripts.
- Declared artifact (16 files: issues-*, close-entry, delivery, wake-close, lane, extension, input, manifest-sync): 268 pass / 0 fail.
- sl-issues-word: PLAN.md § 7 and § 13.2: Jo's typed `issues on|off` and `tracker <wl-id> github|linear <TEAM>|none` write instruction + switch/tracker entry in one transaction via the surface input row — artifact: Declared artifact `bun test surface/test/input.test.ts surface/test/extension.test.ts`: 57 pass / 0 fail. Commit: the sl-issues-word commit on wl/wl-mv66ylim0gahog (input.ts, surface-input.ts header, the two test files).

What the words do:
- `issues on|off` writes the instruction and `switch: issues on|off orchestrator by <in-id>` on wl-orchestrator in one transaction.
- `tracker <wl> github|linear <TEAM>|none` writes the instruction and the `tracker:` entry on the named workload in one transaction.

What is refused, writing nothing:
- malformed forms, unknown ids, closed workloads, and wl-orchestrator;
- the same words emitted by a lane-role session's prompt.
- sl-issues-failbefore: Prove the new and changed regression tests fail before the change: run them on an origin/main copy under $AS2_SCRATCH and record the failures — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/FAILS-BEFORE.md covers 15 test files, each run alone on origin/main 9b614b0 with the branch tests copied in.

Fail by assertion on main:
- tool-call-rows: 19 fail
- delivery: 1 fail
- extension: 1 fail
- wake-close: 3 fail

Fail by import on main: close-entry, input, and the nine new issues-* files.

On the branch at acce84a, every file passes: 0 fail in all 15.
- sl-issues-docs: Write migration/items/github-issues-projection.md and the USER-GUIDE.md section for the issues projection, words, tracker routing and turn-end check — artifact: Docs commit on wl/wl-mv66ylim0gahog:
- migration/items/github-issues-projection.md, a new file. Its front matter is title / status: building / workload / pr: none, with no number.
- USER-GUIDE.md § 3 gains the "Issues projection" subsection.

The declared artifact (migration-items-repo, migration-items, manifest-sync) passed 15 / 0 fail.

Rollout order is: restart Ilex, then `issues on`. The word needs the new code loaded.
- sl-issues-review: Production cross-lab code review of git diff origin/main...wl/wl-mv66ylim0gahog against PLAN.md rev 12; findings only — artifact: Code review round 4 on head 90db8d6 returned an empty findings block: `{"findings":[]}`. The report is /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/CODE-REVIEW-r4.md, from a deep hand off the builder lab.

All five round-3 findings are settled:
- four are resolved, with receipts;
- the 24 h late-PR window is accepted as a residual and documented in the migration item.

The jo-issues intake also passed review: Jo-proof holds, the plumb skip applies at both discovery and proof, and labels are ensured on the intake repo.

Earlier rounds, all in the same directory:
- r1 (2 blocking, 7 major, 1 minor): all fixed.
- r2 (3 major, 4 minor): fixed, except the footer opt-out, which is a residual.
- r3 (2 blocking, 2 major, 1 minor): fixed, except the late-PR window, which is a residual.
- sl-issues-smoke: PLAN § 9.7 + § 13.4 smoke: scratch orchestrator surface on a ledger copy, real GitHub/Linear: issues on, drift 0, PR-less close closes, turn pushes, issues off zero calls — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/SMOKE.md. 56 as2 issues seeded, footer on #137 (and #155 → #203 closed at Jo's merge, closedBy [155]), #215 PR-less close CLOSED COMPLETED, 0 projection calls in the off window 05:38:20-05:46:38 (calls table 0, calls.log 0), turn rows updated/not-projected, Linear drift healed (declared check at 06:34Z on b69cdb3: no linear line; exit 1 = drift unknown only from the stale pr_scan_unknown plus #203 closed by the real merge while the copy has it open).
- sl-issues-fix-projector: Fix review r1 findings 1, 4, 5 (projector side), 6, 7, 10 in projector.ts and linear.ts with regression tests — artifact: Commit 622cc94 fixes review r1 findings 1, 4, 5 (projector side), 6, 7 and 10. Each finding has a new test that fails on b346af7; the hand reported each failure, for example finding 1 gave `Expected "OPEN" Received "CLOSED"`.

Declared artifact (10 files: issues-projector, linear, tracker, prs, render, footer, close-entry, input, extension, lane): 230 pass / 0 fail.
- sl-issues-fix-reconcile: Fix review r1 findings 2, 3, 5 (reconciler side), 8, 9 in reconcile.ts, scripts/issues.ts, github.ts, turnend.ts, extensions/issues.ts with regression tests — artifact: Commit 8b3476e fixes review r1 findings 2, 3, 5 (reconciler side), 8 and 9. The same commit also brings the docs in line: the residual line for finding 9 is gone, the sidecar turnMark doc is updated, and the USER-GUIDE check line now says the check is metered.

Each finding has a new test that fails on b346af7, as the hand reported; for example, finding 2 gave Expected 9 Received 8.

Declared artifact (8 files: issues-reconcile, turnend, intake, delivery, wake-close, migration-items-repo, migration-items, manifest-sync): 93 pass / 0 fail.
- sl-issues-fix2-projector: Fix review r2: Linear >20 labels (paginate labels before a set-replacing update), bounded closed-link scan window, move-comment crash gap; regression tests — artifact: Commit fb04e8e fixes the projector-side findings from review r2:
- Linear labels: new `Linear.labels(id)` pages through all labels (50 per page, at most 10 pages); pushLinear builds its update from the full set.
- PR scan: the closed-link scan stops 24 h after close (`LATE_PR_WINDOW_MS`) and once a merge is seen (`pr_merged:<id>`).
- Move comment: a `move_commenting` marker plus a comment read on retry removes the duplicate comment.

The hand ran the new tests against the pre-fix code: 5 fail, exactly the new tests.

Declared artifact (10 files): 234 pass / 0 fail.
- sl-issues-fix2-reconcile: Fix review r2: reconciler uses the current PR set when a link is dirty or PR rows changed, Linear label comparison unknown when incomplete, turn_mark stale-key cleanup, check never migrates the sidecar; regression tests — artifact: Commit 38cff00 fixes the reconciler-side findings from review r2:
- the remote PR lines are trusted only when the link is clean and its sidecar PR rows equal the block's PRs;
- Linear labels that run past one page are reported as unknown;
- turn marks are stored as `<seq> <iso>`, and any older than 7 days are pruned at session start;
- check opens the sidecar without migrating it (an old schema gives `unknown (sidecar not migrated…)`).

The commit also adds the footer-opt-out residual to the migration item.

The hand reported each new test failing on the pre-fix code. The declared artifact (9 files, including tool-call-rows) passed 196 / 0 fail.
- sl-issues-fix3-projector: Fix review r3: footer eligibility recomputed per scan (retarget), reconcile phase runs with a stopped-tracker map when GitHub is stopped — artifact: Commit 7cd019d.

- Footer state is now recomputed on every scan, so retargeting a PR moves it none→pending→none.
- `Tick.stops` is a map with the stop reason, and `PhaseContext.stopped` carries it.
- reconcile always runs after the push; intake stays gated on GitHub.

The hand ran the 2 new tests on the pre-fix code: both failed.

Declared artifact (10 files): 236 pass / 0 fail.
- sl-issues-fix3-reconcile: Fix review r3: reconcile records unknown on a stopped tracker when due, pages Linear labels, per-poll turn-mark heartbeat — artifact: Commit 44a0d14 contains:
- A due reconcile now records `unknown (<kind> <reason>)` for a stopped tracker and makes 0 calls to it; a tracker that did not stop is still compared.
- Linear labels are paged during reconcile, so a 25-label item can reach drift 0.
- Every poll refreshes the turn-mark time (heartbeat).
- Two new residuals in the migration item: the seeding hour, and the 24 h late-PR window.

Per the hand, the new tests failed 4 on the pre-fix 38cff00 code.

Declared artifact (9 files): 199 pass / 0 fail.
- sl-full-mv66ylim0gahog-1: full suite outside the fence at PR #217 — artifact: test-run tr-0mv986qxjavpq9l: green at b69cdb30a20164f67f7c4e0fbc37d7c5409fb00b on PR #217; full 5244/0/94; alone: ./gates/test/tool-call-rows.test.ts 98/0, ./surface/test/close-entry.test.ts 23/0, ./surface/test/delivery.test.ts 11/0, ./surface/test/extension.test.ts 17/0, ./surface/test/input.test.ts 69/0, ./surface/test/issues-footer.test.ts 3/0, ./surface/test/issues-intake.test.ts 39/0, ./surface/test/issues-linear.test.ts 18/0, ./surface/test/issues-projector.test.ts 36/0, ./surface/test/issues-prs.test.ts 7/0, ./surface/test/issues-reconcile.test.ts 38/0, ./surface/test/issues-render.test.ts 12/0, ./surface/test/issues-tracker.test.ts 39/0, ./surface/test/issues-turnend.test.ts 15/0, ./surface/test/wake-close.test.ts 3/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv986qxjavpq9l
- sl-issues-jo-intake: Per Jo's add-jo-issues answer (in-mv92q6ft9t9af4): config key intakeRepo (profile: thewolff/jo-issues); intake reads that repo, skips issues labelled plumb, still makes wl-orchestrator instructions — artifact: Intake now reads `issues.intakeRepo`, set to thewolff/jo-issues in profile/config.yml. Without that key it falls back to the first exact GitHub rule. The commit is "intake reads issues.intakeRepo …" on wl/wl-mv66ylim0gahog.

- **Plumb issues.** Issues labelled with any of `issues.intakeSkipLabels` (default `plumb`) are skipped at discovery and again at proof. They are counted as ignored, and the issue gets no label or comment.
- **Labels.** The `intake` label is ensured on the intake repo once, through `ensureGithubLabels`.
- **Tests.** Declared artifact (8 files): 166 pass / 0 fail.
- **Live read-only check.** DISCOVERY_QUERY and PROOF_QUERY were run against thewolff/jo-issues, exiting 0:
  - discovery returned 58 edges, with labels;
  - proof on #3 returned author thewolff, OWNER, 4 labels (incl. plumb), 0 edits.
- sl-issues-train-skip: Per Jo's in-mv93e832mquneo: intake skips issues labelled as2-train like plumb (default intakeSkipLabels plumb, as2-train); docs updated — artifact: Commit e69d225 is pushed to PR #217. Intake now skips `as2-train` as well as `plumb` by default.

- **Test:** the new case "a plumb- or as2-train-labelled issue … is skipped". With the config.ts change stashed it fails, 0 pass / 1 fail.
- **Declared artifact** on the committed tree: 166 pass / 0 fail.
- **Docs:** the USER-GUIDE intake bullet, and the migration item's Intake section and residual line.
- sl-issues-linear-normal: Linear normalises description markdown, so reconcile reports a permanent drift: store the returned block hash after each Linear write and compare remote against it — artifact: Commit e691c05 fixes the Linear normalisation drift:
- **remote_hash**: a new `remote_hash` column records the hash of the block Linear returns from its create/update mutations.
- **Reconciler**: when the link is clean and that hash is set, the reconciler compares the remote block's hash against it.
- **Marker finding**: block markers are now found with no line-start requirement, so an end marker that Linear has indented still matches.

A fake Linear that normalises the way the live ENG-2284 description shows exercises it. With the tests written before the src change, the 4 normalisation tests fail (0 pass / 4 fail; "machine block differs"); after the fix they pass.

Declared artifact (16 files): 325 pass / 0 fail.
- sl-issues-review5: Cross-lab review of the post-round-4 delta 90db8d6..e691c05 (as2-train intake skip, Linear remote_hash normalisation) — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/CODE-REVIEW-r5.md — deep review (off builder lab) of 90db8d6..2c0a9d5: review-findings {"findings":[]}; scoped tests 139 pass / 0 fail.
- sl-issues-fix-orphan: Reconciler: an open as2 item whose title names a CLOSED ledger workload with no item linked is counted as drift and adopted so the next push closes it (today silently skipped: smoke issue #206 for closed wl-mv8mof9kktbh1c) — artifact: commit 7603458; declared artifact 329 pass / 0 fail; 4 new reconcile tests fail on 2c0a9d5's reconcile.ts (31 pass, 4 fail: drift 0 received) and pass after.
- sl-issues-review6: Cross-lab review of 2c0a9d5..7603458 (reconciler adopts orphan item of a closed workload) — artifact: Round 1 /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/CODE-REVIEW-r6.md: 1 major (closed-only destinations unscanned) fixed in 24fd43e. Round 2 CODE-REVIEW-r6b.md on 2c0a9d5..24fd43e: major resolved; 1 minor left: "Orphan-adoption ownership and existing-link preservation lack direct regressions" (reviewer found no implementation defect).
- sl-issues-fix2-orphan: Review r6 major: reconciler also reads configured destinations (every Linear team in trackers/overrides, every exact or override GitHub repo) so an orphan item of a closed workload on an otherwise idle destination is adopted — artifact: commit 24fd43e; declared artifact 332 pass / 0 fail; 3 new closed-only-destination tests fail on 7603458's reconcile.ts (0 pass, 3 fail) and pass after.
- sl-ceiling-mv66ylim0gahog-2: Jo decides the ceiling overrun — artifact: answered extend in-mv9oeavzr5y58g

## Decisions made (and why)

- jo answered "extend" to q-mv68kmplnhb7k0 (Plan review for wl-mv66ylim0gahog (GitHub issues projection) hit the production limit of 5 rounds. Round 5 (openai-codex/gpt-6-sol, /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r5-openai.md) accepted every earlier answer and raised one new blocking finding: when an issue is already closed with the wrong reason, the plan detects that but never repairs it. PLAN.md revision 6 fixes it: the push reads stateReason, then runs reopen + close with the rendered reason, with a test. Rounds went 13 → 6 → 5 → 4 → 1 findings. Options: extend = one more review round on rev 6, then the plan question (recommended); accept = treat review as passed with the r5 finding answered in rev 6 and go straight to the plan question; stop = hold the plan here.)
- jo answered "accept" to q-mv6v7u4623xslc (The review of sl-plan-issues reached its round limit: 5 failed rounds of 5 allowed (production stakes).
Final round (round 5), remaining findings: blocking 1 (correctness 1) · major 0 · minor 0
- blocking correctness: PR scan omits by-number test-requested PRs outside bound branches
Blocking per round: round 1: 3 · round 2: 1 · round 3: 1 · round 4: 2 · round 5: 1
Estimate (not a measurement): about 2 more rounds, ceil(last 1 / mean fall 0.5 per round)
extend: one more block of 5 rounds for sl-plan-issues; the lane may dispatch the next review.
accept: the review counts as passed with these findings left; the lane may close sl-plan-issues and go on, and the final round's finding titles ride the slice artifact and the PR (a plan slice may then be raised to Jo).
stop: no further round; the review does not count as passed; the lane reports and holds sl-plan-issues for Jo.)
- jo answered "approve" to q-mv6vfi2p6715a8 (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN.md
- sl-issues-closes-live: throwaway issue + empty-commit PR; later gh pr edit adds Closes #N; Jo merges; issue closes by that PR; cleanup stated
- sl-issues-core: sidecar outbox (claim, seeding, ingest, PR scan + footer, push) under 20/tick and 300/h, render, issues row; tests
- sl-issues-reconcile: hourly issues-drift entry on wl-orchestrator, repair via forced push, unknown never 0; tests
- sl-issues-intake: Jo-proof (thewolff + OWNER, Jo-only edits, no transfer, age), instruction row, ack retry, row 6 gh auth rules; tests
- sl-issues-closes: publishEntry appends Closes #N to the decision-log PR it creates when on and linked; tests
- sl-issues-word: typed issues on / issues off write switch: issues on|off orchestrator by <in-id>; tests
- sl-issues-failbefore: new and changed tests fail on an unpacked origin/main copy, pass on the branch; output saved
- sl-issues-docs: migration/items/github-issues-projection.md (rollout, reversal, residual) and USER-GUIDE words
- sl-issues-review: production cross-lab code review of the diff, findings only; fixes as change slices
- sl-issues-smoke: scratch surface on a ledger copy: issues for open workloads, PR-less close closes, off makes zero projection calls
- sl-issues-pr: merge origin/main, declared artifact, push, PR listing Jo's post-merge steps, lane_full_test
tradeoff: Jo-proof is accident grade (thewolff + OWNER, Jo-only edits); row 6 reserves gh auth switch; hard fix: Jo runs gh auth logout -u thewolff
tradeoff: issues off stops every projection GitHub call, not the close's decision-log push and PR create; revise = queue and replay those too
tradeoff: live test needs Jo to merge a throwaway empty-commit PR into main; smoke keeps one closed [smoke] issue; r8 fix in rev 9 unreviewed
review: accepted by Jo after r8 revise, openai-codex/gpt-6-sol, /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r8-openai.md)
- jo answered "merged" to q-mv6vm0q2697tkw (Live test for wl-mv66ylim0gahog: please merge PR #125 (https://github.com/thewolff/agent-system-2.0/pull/125) with a merge commit, then press Delete branch. The PR adds and removes one marker file, so main's tree is unchanged. The lane appended "Closes #124" with a later gh pr edit, and GitHub already lists #124 in closingIssuesReferences. After the merge, the lane checks that #124 is CLOSED, its stateReason is COMPLETED, and its closer is #125. Evidence: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/closes-live/EVIDENCE.md. Options: merged = done, lane verifies; hold = leave it open (the done-line live-test clause stays unmet and the rest of the work goes on).)
- jo answered "stop" to q-mv6wdw6v0pe27g (wl-mv66ylim0gahog has used $23.56 of its $150 ceiling (15 %) and 96 of 46 minutes (208 %), production stakes; 45858979 tokens.
stop (the default): the lane keeps working and is stopped at the ceiling; nothing relaunches.
extend: the ceiling grows by one more block of this workload's own size and the lane goes on (a stopped lane relaunches); for an exact figure say `ceiling <usd> [<hours>] wl-mv66ylim0gahog` instead.
split: the lane is stopped at the ceiling like stop, and the remaining work is split into a new workload; nothing relaunches here.)
- jo (surface): Jo: "plumb-backlog#3 wl-mv66ylim0gahog: Jo 10-14: third priority after Phoenix and plan-link; your plan never shipped (11 uncommitted files). Add: every Ilex turn that acts on a workload creates or updates its issue, checked in code at turn end." — reading: Jo, 2026-10-14: the issues workload is third priority, after Phoenix and the plan-link fix. Its plan never shipped and 11 files sit uncommitted. Add to its scope: every Ilex turn that acts on a workload creates or updates that workload's issue, and code checks this at the end of the turn.
- jo (surface): Jo: "plumb-backlog#3 wl-mv66ylim0gahog: Jo 10-14: Newdle work is tracked in Linear, not GitHub. The projection takes a tracker per repo: Newdle repos (e.g. wl-mv4sweogs5xdkw SEO audit) go to Linear; as2 to thewolff/agent-system-2.0." — reading: Jo, 2026-10-14: Newdle work is tracked in Linear, not GitHub, so the issue projection takes a tracker per repo. Newdle repos go to Linear and as2 goes to GitHub thewolff/agent-system-2.0. Jo's example was the SEO audit workload. The id Jo gave, wl-mv4sweogs5xdkw, is the row 6 under-refusal workload in the ledger; the SEO audit skill is wl-mv5jz4vewt8mbk. Route by each workload's repo, not by that example id.
- jo (surface): ceiling: 150 12
- jo answered "approve" to q-mv8ymluhfjq5j4 (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN.md
- sl-issues-linear-live: throwaway ENG issue with Jo's key: marker survival, In Review/Done/Canceled moves, then issueDelete (restorable)
- sl-issues-tracker: tracker per repo (ContextPress=>Linear ENG, as2=>GitHub), SEO audit seeded to Linear, tracker word move, Linear adapter
- sl-issues-turnend: each Ilex turn end marks its workloads' links first-dirty; turns rows settle on pushed_seq, one notice if not
- sl-issues-reconcile: hourly issues-drift entry on wl-orchestrator per tracker, repair via forced push, unknown never 0
- sl-issues-word: typed issues on/off and tracker <wl-id> github|linear <TEAM>|none write their ledger entries
- sl-issues-failbefore: new and changed tests fail on an unpacked origin/main copy, pass on the branch
- sl-issues-docs: migration/items/github-issues-projection.md (Linear routing, tracker word, turn-end check) and USER-GUIDE
- sl-issues-review: production cross-lab code review of the diff, findings only; fixes as change slices
- sl-issues-smoke: scratch surface on a ledger copy: GitHub and Linear issues appear, PR-less close closes, off stops calls
- sl-issues-pr: merge origin/main, declared artifact, push, PR listing Jo's post-merge steps, lane_full_test
tradeoff: routing by repo origin; SEO audit (repo as2) seeded to Linear in config, later exceptions by your tracker word, never a model's pick
tradeoff: Linear writes use your own LINEAR_API_KEY, so items show you as author and Linear has no intake; a bot key would allow intake later
tradeoff: Linear issues close when the PR merges by observation, no keyword; ContextPress PR bodies are never edited
review: approve-with-changes (2 majors fixed in rev 12), openai-codex/gpt-6-sol, /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-AMEND-REVIEW-r2-openai.md)
- jo (surface): Jo: "jo-issues#3 wl-mv66ylim0gahog: Jo marks this ON FIRE, alongside the merge train. Jo is still relaying every instruction by paste. Prioritise getting it to a green PR; issues Jo files becoming instructions is the part that matters most." — reading: Jo marks the issues workload ON FIRE, alongside the merge train and Phoenix: Jo is still relaying every instruction to Ilex by paste. Prioritise reaching a green PR. The part that matters most is the intake: an issue Jo files (jo-issues on GitHub) becomes an as2 instruction on the right workload without Jo pasting it. Land that path first; the projection outward (workload state to issues) comes after if both cannot ship together.
- jo (surface): approve en-mv91ek2vc0llhc
- jo (surface): approve en-mv8zkltzsyp3i8
- jo answered "add-jo-issues" to q-mv92ac7xt75v5s (Which repo should issue intake read?

As built (approved PLAN § 6), intake reads the issues Jo files on thewolff/agent-system-2.0. The author must be thewolff and the as2 label rules must hold. Each such issue becomes a wl-orchestrator instruction, and Ilex routes it to the right workload.

Your jo-issues#3 instruction points at thewolff/jo-issues instead. On that repo Plumb also files issues as thewolff (labels plumb, as2-routed), so an author of thewolff would not prove that you typed the issue.

Options:
- `ship-as-built` (recommended, fastest to a green PR): the PR goes up now with intake on agent-system-2.0, and reading jo-issues becomes a follow-up workload.
- `add-jo-issues`: before the PR, I add one slice with a config key `intakeRepo: thewolff/jo-issues` that skips issues labelled plumb; they still go to wl-orchestrator. That delays the PR by one slice and one review round.)
- jo (surface): Jo: "jo-issues#11 wl-mv8s8srodefytc and wl-mv66ylim0gahog: train alert issues on jo-issues carry a label (as2-train) that issue intake skips, like plumb; machinery-filed issues never become Jo instructions." — reading: Issue intake on thewolff/jo-issues skips issues labelled as2-train, the same way it skips plumb: the merge train (wl-mv8s8srodefytc) files its alert issues on jo-issues as thewolff with label as2-train, and no machinery-filed issue may ever become a Jo instruction. The same input also tells the merge-train rebuild to put the as2-train label on every alert issue it files.
- jo (surface): approve en-mv93cb0dfzjw1s
- jo answered "extend" to q-mv98d2siwe2osg (wl-mv66ylim0gahog has used $120.01 of its $150 ceiling (80 %) and 394 of 720 minutes (54 %), production stakes; 282306614 tokens.
stop (the default): the lane keeps working and is stopped at the ceiling; nothing relaunches.
extend: the ceiling grows by one more block of this workload's own size and the lane goes on (a stopped lane relaunches); for an exact figure say `ceiling <usd> [<hours>] wl-mv66ylim0gahog` instead.
split: the lane is stopped at the ceiling like stop, and the remaining work is split into a new workload; nothing relaunches here.
pair: 4 long steers from you since open. Answering pair is stop plus a switch to user-driven: the autonomous lane stops at the ceiling, and you continue it yourself (as2 lane wl-mv66ylim0gahog).)
- assumption (lane-mv66ylim0gahog-1): builder-lab: anthropic lane lane-mv66ylim0gahog-1 model anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-spawn: dt-mv67av2a3d2abe54 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues review yes group dg-mv67av2ace03c876 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-settled: dt-mv67av2a3d2abe54 routing rt-mv67nuf7lm6b5s
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): review-round: sl-plan-issues round 1 token dt-mv67av2a3d2abe54 group dg-mv67av2ace03c876 verdict accepted blocking 3 counts {"counts":{"blocking":{"correctness":2,"security":1},"major":{"correctness":6,"design":1,"tests":2},"minor":{"correctness":1}},"titles":[{"severity":"blocking","kind":"correctness","title":"Off-tick cursor advancement prevents first-on seeding"},{"severity":"blocking","kind":"security","title":"First-50 GraphQL proof can miss collaborator edits or transfers"},{"severity":"blocking","kind":"correctness","title":"Issues off does not stop existing close-path GitHub writes"},{"severity":"major","kind":"correctness","title":"PR lookup omits bound branches and merged-before-close handling"},{"severity":"major","kind":"correctness","title":"Drift replay skips repairs when pushed caches match expected state"},{"severity":"major","kind":"correctness","title":"Separate ledger and sidecar writes do not atomically deduplicate intake"},{"severity":"major","kind":"correctness","title":"Two drainers can duplicate creates and exceed unclaimed caps"},{"severity":"major","kind":"correctness","title":"Unpaged Jo issue discovery truncates at thirty results"},{"severity":"major","kind":"correctness","title":"Synchronous footer publication can block an explicit close turn"},{"severity":"major","kind":"design","title":"Issues switch uses a second ledger convention until future migration"},{"severity":"major","kind":"tests","title":"Live-test skip and reserved cleanup cannot prove closure as planned"},{"severity":"major","kind":"tests","title":"Smoke backup command does not create the claimed scratch ledger"},{"severity":"minor","kind":"correctness","title":"Uncounted rate-limit probe exceeds literal GitHub call caps"}]}
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): Plan review round 1 on PLAN.md rev 1 (hand sl-plan-issues, openai-codex/gpt-6-sol): revise, 3 blocking, 9 major, 1 minor; report persisted to /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r1-openai.md. PLAN.md rev 2 answers each finding (its § 12 table). Key decisions in rev 2: switch state uses wl-mv654hoqwpfhmo's registry line `switch: issues on|off orchestrator by <in-id>` from the start; `issues off` stops every projection call but not the close's pre-existing decision-log push and PR create; found-PR Closes edit is queued by publishEntry and delivered by the issues tick (no added network wait in a close turn); Jo-proof = author thewolff + OWNER + every edit/rename by Jo, no transfer, full pages only; gh on this machine runs as thewolff-engineer, so agents' issues fail the author rule. Next: review round 2.
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-spawn: dt-mv67rw573269dbf9 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues-2 review yes group dg-mv67rw5778157312 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-settled: dt-mv67rw573269dbf9 routing rt-mv67zacxcf8av4
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): review-round: sl-plan-issues round 2 token dt-mv67rw573269dbf9 group dg-mv67rw5778157312 verdict accepted blocking 2 counts {"counts":{"blocking":{"correctness":2},"major":{"correctness":4},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"issues off still permits close-path GitHub writes"},{"severity":"blocking","kind":"correctness","title":"Surface exec cannot supply stdin for issue creation and PR footer edit"},{"severity":"major","kind":"correctness","title":"Five-minute claim can expire during a tick and admit a second drainer"},{"severity":"major","kind":"correctness","title":"Timestamp-only intake cursor can permanently skip a full page's successor"},{"severity":"major","kind":"correctness","title":"Reconciler misses linked issue when as2 label is removed"},{"severity":"major","kind":"correctness","title":"Title-based intake exclusion silently discards Jo-authored issues"}]}
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): Plan review round 2 on PLAN.md rev 2 (hand sl-plan-issues-2, openai-codex/gpt-6-sol): revise, 2 blocking (issues off still allows the close's decision-log push/PR create; pi.exec has no stdin for -F -), 4 major (claim lapse, intake tie cursor, removed as2 label, title exclusion); 10 of 13 round-1 answers confirmed. Report at /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r2-openai.md. PLAN.md rev 3: bodies as --body argv; claim fenced and renewed per call; intake via GraphQL issues(filterBy createdBy, CREATED_AT asc, after cursor) — query verified read-only this session (exit 0, totalCount 0); reconcile fetches linked numbers missing from the as2 list; no title exclusion, as2 body block marks projections. The off-scope narrowing (close's existing decision-log push and PR create continue) is put to Jo on the plan question as a tradeoff line; revise builds the deferral instead. Next: review round 3.
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-spawn: dt-mv6818rn194f09e7 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues-3 review yes group dg-mv6818rnbcd727a5 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-settled: dt-mv6818rn194f09e7 routing rt-mv685nmgtlw2yo
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): review-round: sl-plan-issues round 3 token dt-mv6818rn194f09e7 group dg-mv6818rnbcd727a5 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":4},"minor":{"tests":1}},"titles":[{"severity":"major","kind":"correctness","title":"Planned intake query lacks the per-node cursor required for checkpointing"},{"severity":"major","kind":"correctness","title":"First-on seed can advance provenance cursor past a concurrently opened workload"},{"severity":"major","kind":"correctness","title":"Intake cutoff can reject an issue Jo files after switching issues on"},{"severity":"major","kind":"correctness","title":"PR can merge before the asynchronously queued closing footer is attached"},{"severity":"minor","kind":"tests","title":"Smoke leaves a closed scratch-only as2 issue in the live repository"}]}
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): review-loop-end: sl-plan-issues reason pass
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): Plan review round 3 on PLAN.md rev 3 (hand sl-plan-issues-3, openai-codex/gpt-6-sol): revise, 0 blocking, 4 major (intake per-node cursor needs edges.cursor; seed snapshot ordering; intake cutoff must be the on entry's time; merge can outrun the queued footer), 1 minor (smoke orphan issue); all six round-2 answers accepted, the issues-off narrowing accepted as an explicit choice for Jo. Report at /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r3-openai.md. PLAN.md rev 4: edges{cursor node} persisted per edge; hw and open set read in one ledger snapshot; intake_since = created_at of the switch on entry; footer pre-attached by the issues tick on first sight of an open lane PR (publishEntry re-checks at close), residual one-poll race closed from MERGED state; smoke issue named as a kept artifact. Next: review round 4 of 5.
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-spawn: dt-mv6873f5046e0091 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues-4 review yes group dg-mv6873f5c6eac594 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-settled: dt-mv6873f5046e0091 routing rt-mv68b48lc5leyo
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): review-round: sl-plan-issues round 1 token dt-mv6873f5046e0091 group dg-mv6873f5c6eac594 verdict accepted blocking 3 counts {"counts":{"blocking":{"correctness":3},"major":{"correctness":1},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"PR creation does not wake a clean link for footer pre-attachment"},{"severity":"blocking","kind":"correctness","title":"Footer path excludes authoritative bound-branch and test-requested PRs"},{"severity":"blocking","kind":"correctness","title":"Non-default-target PR merge does not trigger keyword issue closure"},{"severity":"major","kind":"correctness","title":"Intake cursor advancement across previously processed edges is underspecified"}]}
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): Plan review round 4 on PLAN.md rev 4 (hand sl-plan-issues-4, openai-codex/gpt-6-sol): revise, 3 blocking (PR creation does not wake a clean link; footer only on wl/<id> with one scalar; non-default-base PRs ignore closing keywords per GitHub docs), 1 major (intake cursor not advanced over skipped edges); round-3 seeding, cutoff, edge-cursor and smoke answers accepted. Report at /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r4-openai.md. PLAN.md rev 5: per-tick one-call open-PR scan maps every bound-branch PR into a per-PR prs table and is the waking path; footer only on default-base PRs, non-default-base merges closed by observation within one poll; publishEntry foots only the PR it creates (--base default, close-entry.ts:363); intake cursor advances on every settled edge including skips. Next: review round 5 of 5.
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-spawn: dt-mv68dsc9122c173f session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues-5 review yes group dg-mv68dsc93ec3d811 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): hand-settled: dt-mv68dsc9122c173f routing rt-mv68k0cq4q914w
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): review-round: sl-plan-issues round 2 token dt-mv68dsc9122c173f group dg-mv68dsc93ec3d811 verdict accepted blocking 1 counts {"counts":{"blocking":{"correctness":1},"major":{},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"Closure-reason drift is detected but cannot be repaired when an issue is already closed"}]}
- assumption (lane-mv66ylim0gahog-1, sl-plan-issues): Plan review round 5 of 5 on PLAN.md rev 5 (hand sl-plan-issues-5, openai-codex/gpt-6-sol): revise. It accepted all four round-4 answers: the per-tick open-PR scan as the waking path, the per-PR prs table across bound branches, closure by observation for non-default-base PRs, and the intake cursor advancing over settled skips. It raised one new blocking finding: a closed issue's wrong close reason is detected but never repaired, because push fetched no stateReason and closes only on a state difference. Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r5-openai.md. PLAN.md rev 6 fixes it: push reads stateReason, and when both sides are closed with different reasons it runs gh issue reopen and then gh issue close -r <rendered reason>, plus a reconcile regression test. The round limit is reached. Rev 6 needs one more review round to pass with no blocking findings; that needs Jo's extend.
- assumption (lane-mv66ylim0gahog-2): builder-lab: anthropic lane lane-mv66ylim0gahog-2 model anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): hand-spawn: dt-mv6ulmtq18fcb959 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues-6 review yes group dg-mv6ulmtqd39cbb60 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): hand-settled: dt-mv6ulmtq18fcb959 routing rt-mv6urw847n69vk
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): review-round: sl-plan-issues round 3 token dt-mv6ulmtq18fcb959 group dg-mv6ulmtqd39cbb60 verdict accepted blocking 1 counts {"counts":{"blocking":{"correctness":1},"major":{},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"A merged PR’s issue is reopened while another workload PR remains open"}]}
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): Plan review round 6 (first of the extend block) on PLAN.md rev 6. Hand: sl-plan-issues-6, openai-codex/gpt-6-sol. Verdict: revise.

It accepted the round-5 close-reason repair. It raised one new blocking finding. A closed workload with PR A merged and PR B still open had its issue reopened by the next scan, so the issue closed only when B was abandoned, not when A merged.

Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r6-openai.md.

PLAN.md rev 7 changes the render rule to "first merge wins": a closed workload whose PR set holds any merged PR renders closed `completed`, whatever its other PRs' states. `awaiting-merge` now applies only when no PR merged and some PR is open. A decision-log PR created after the lane PR merged carries an inert footer; that rests on a GUESS(inference), and the reconciler repairs the issue either way. Mixed-state tests were added to sl-issues-core.

Next: review round 7.
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): hand-spawn: dt-mv6ut56f871f9933 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues-7 review yes group dg-mv6ut56f17119b9c row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): hand-settled: dt-mv6ut56f871f9933 routing rt-mv6v1fi9oa9mgw
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): review-round: sl-plan-issues round 4 token dt-mv6ut56f871f9933 group dg-mv6ut56f17119b9c verdict accepted blocking 2 counts {"counts":{"blocking":{"correctness":2},"major":{},"minor":{"correctness":1}},"titles":[{"severity":"blocking","kind":"correctness","title":"Off-period workloads are skipped by the provenance outbox on re-enable"},{"severity":"blocking","kind":"correctness","title":"PR-set lookup omits tested PRs beyond the default 30-result branch list"},{"severity":"minor","kind":"correctness","title":"Accepted intake acknowledgement failures cannot be retried"}]}
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): Plan review round 7 on PLAN.md rev 7 (hand sl-plan-issues-7, openai-codex/gpt-6-sol): revise. It accepted the round-6 first-merge-wins answer and raised two blocking findings and one minor. Blocking: (1) workloads opened while issues are off are skipped when they are switched back on; (2) the PR-set lookup lacks -L, since gh pr list defaults to 30, and lacks the close check's test-requested by-number fallback. Minor: the intake acknowledgement has no retry. Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r7-openai.md. PLAN.md rev 8 answers each finding. For (1), it states that ingest is local and runs on or off, so a workload opened while off holds a dirty link at on; a never-pushed link whose render is closed creates nothing; an off→open→on test is added. For (2), prs.ts uses -L 1000 plus the gh pr view fallback, and a 1000-row list or a failure makes the set unknown with no render change. For the minor, intake gets an acked column and pending acknowledgements are retried before discovery. Next: review round 8, the third of the extend block.
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): hand-spawn: dt-mv6v2mga657a5932 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-issues-8 review yes group dg-mv6v2mgaf980e035 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): hand-settled: dt-mv6v2mga657a5932 routing rt-mv6v7u43pno4jk
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): review-round: sl-plan-issues round 5 token dt-mv6v2mga657a5932 group dg-mv6v2mgaf980e035 verdict accepted blocking 1 counts {"counts":{"blocking":{"correctness":1},"major":{},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"PR scan omits by-number test-requested PRs outside bound branches"}]}
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): review-limit: q-mv6v7u4623xslc slice sl-plan-issues
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): Plan review round 8 on PLAN.md rev 8. Hand sl-plan-issues-8, openai-codex/gpt-6-sol. Verdict: revise.

It confirmed all three round-7 answers:
- ingest on or off;
- prs.ts -L 1000 with the by-number fallback, applied to rendering;
- intake acked.

It raised one new blocking finding: the per-tick scan mapped only bound-branch heads, so a test-requested PR outside every bound branch got no footer and no merge wake. Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r8-openai.md.

PLAN.md rev 9 fixes it. The scan maps an open PR by bound head or by the workload's test-requested numbers, the same two sources as the PR set. A footer + merge-close test for such a PR is added to sl-issues-core.

Next: review round 9.
- assumption (orchestrator-surface, sl-plan-issues): review-loop-end: sl-plan-issues reason accept
- assumption (lane-mv66ylim0gahog-2, sl-plan-issues): Jo answered accept to q-mv6v7u4623xslc (in-mv6veobf3666f4). The plan review counts as passed with the final round's finding left: r8 blocking "PR scan omits by-number test-requested PRs outside bound branches". PLAN.md rev 9 answers it but no reviewer has seen that change. Also in rev 9: the migration record is now a new file, migration/items/github-issues-projection.md, per tiers/lane.md, not a MIGRATION.md line. Raising the plan question (approve / revise / cancel) next.
- assumption (lane-mv66ylim0gahog-2, sl-issues-closes-live): artifact-command: bun test gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-2, sl-issues-core): hand-spawn: dt-mv6vnalz23b884b9 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-core review no group dg-mv6vnalze469d6a5 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-2, sl-issues-closes-live): The live test is set up on thewolff/agent-system-2.0.
- Throwaway issue #124 created.
- PR #125 opened from as2-test/closes-edit into main. The branch has two commits on origin/main 946c016: 48fed92 adds a marker file and bf674fb removes it, so its tree equals main's.
- Deviation from PLAN.md § 9.1: the plan called for one empty commit, but P-11 row 6 refuses `git commit --allow-empty` and `git commit-tree`. The add + remove pair is the tree-neutral equivalent.
- Push evidence: the declared artifact `bun test gates/test/manifest-sync.test.ts` passed on that tree (1 pass, 0 fail), and the push went through row 8.
- Before the edit, closingIssuesReferences on #125 was empty. `gh pr edit 125 --body "<old>\n\n<!-- as2 -->\nCloses #124"` then exited 0, and afterwards closingIssuesReferences was [#124] with base main.
- Evidence file: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/closes-live/EVIDENCE.md.
- Waiting on q-mv6vm0q2697tkw (merged / hold).
- The worktree is back on wl/wl-mv66ylim0gahog, fast-forwarded to 946c016.
- sl-issues-core has been dispatched in parallel; it does not depend on the merge.
- assumption (lane-mv66ylim0gahog-2, sl-issues-core): hand-settled: dt-mv6vnalz23b884b9 routing rt-mv6wdl2o7dl5hc
- assumption (lane-mv66ylim0gahog-2, sl-issues-core): artifact-command: bun test surface/test/issues-render.test.ts surface/test/issues-prs.test.ts surface/test/issues-projector.test.ts surface/test/issues-footer.test.ts gates/test/manifest-sync.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/lane.test.ts
- assumption (classifier): pair-exposure: lane-mv66ylim0gahog-5 on
- assumption (classifier): pair-signal: taste no 1 ambiguous no 0.7 judge typesafe/jev-1.13.0 tokens 1532 cost 0.000064344
- assumption (lane-mv66ylim0gahog-5): builder-lab: anthropic lane lane-mv66ylim0gahog-5 model anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): Jo's instructions as followed:
- in-mv8xp39va3083k (ceiling 150 12) is followed as the ceiling.
- in-mv7g3erl5udn28 (stop on q-mv6wdw6v0pe27g) is superseded by that newer ceiling.
- in-mv8wzcrzrvxfk0 (turn-end issue update, checked in code) and in-mv8x0ojcti8yrk (tracker per repo: Newdle to Linear, as2 to GitHub) are scope adds to an approved production plan, so they go through PLAN.md rev 10 § 13, a cross-lab review, and an amendment question before any change slice builds them.

Facts behind § 13 (2026-10-15):
- Newdle repos are origin owner ContextPress (newdle-mobile, newdle-token-library, kitchen and shipyard all report git@github.com:ContextPress/…).
- The SEO audit wl-mv5jz4vewt8mbk carries `repo: /Users/jowolff/code/agent-system-2.0`, so routing by repo alone sends it to GitHub. § 13 adds Jo's `tracker` word as an override.
- LINEAR_API_KEY is set. Its viewer is jo@newdle.com. The ENG team (Newdle Engineering) exists and has state types backlog/unstarted/started/completed/canceled. The rate limit header is 2500 requests per hour.

Work done on rev 9 so far:
- sl-issues-closes-live: done; #124 was closed by #125.
- sl-issues-core: committed as 727dba7.

Next: plan review named sl-plan-amend.
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-group: sl-plan-amend group fg-mv8xuctb20934ee5 members dt-mv8xuctb8c5ebc3e,dt-mv8xuctb82ab767e
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-spawn: dt-mv8xuctb8c5ebc3e session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-amend--openai review yes group fg-mv8xuctb20934ee5 row openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-spawn: dt-mv8xuctb82ab767e session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-amend--kimi review yes group fg-mv8xuctb20934ee5 row moonshot/kimi-k3
- assumption (lane-mv66ylim0gahog-5, sl-issues-intake): hand-spawn: dt-mv8xv1ek24212165 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-intake review no group dg-mv8xv1ek59a3caa9 row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-closes): hand-spawn: dt-mv8xv1el4722f2c4 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-closes review no group dg-mv8xv1el4d52c497 row anthropic/claude-sonnet-5-5
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): provider-refused: moonshot status 429 token dt-mv8xuctb82ab767e
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-settled: dt-mv8xuctb82ab767e routing rt-mv8xv1gzanfitc
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-round: sl-plan-amend round 1 token dt-mv8xuctb82ab767e group fg-mv8xuctb20934ee5 verdict failed-dispatch blocking unknown counts unknown
- assumption (lane-mv66ylim0gahog-5, sl-issues-closes): hand-settled: dt-mv8xv1el4722f2c4 routing rt-mv8xxhviotdudc
- assumption (lane-mv66ylim0gahog-5, sl-issues-closes): artifact-command: bun test surface/test/close-entry.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-withheld: dt-mv8xuctb8c5ebc3e
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): builder-lab: openai hand dt-mv8xuctb8c5ebc3e model openai-codex/gpt-6-sol
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-settled: dt-mv8xuctb8c5ebc3e routing rt-mv8xzaoydum0w0
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-round: sl-plan-amend round 1 token dt-mv8xuctb8c5ebc3e group fg-mv8xuctb20934ee5 verdict withheld blocking 4 counts {"counts":{"blocking":{"correctness":4},"major":{"design":2},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"Unmatched jo-wolff-plugins workloads are never projected despite every-turn promise"},{"severity":"blocking","kind":"correctness","title":"SEO audit has no applied Linear tracker override"},{"severity":"blocking","kind":"correctness","title":"Aside-started Ilex turns lack a provenance start cursor"},{"severity":"blocking","kind":"correctness","title":"Linear label creation omits running and awaiting-merge"},{"severity":"major","kind":"design","title":"Tracker-specific sidecar state is not specified"},{"severity":"major","kind":"design","title":"Per-tracker caps omit shared GitHub traffic and Linear user complexity limits"}]}
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): Plan-amendment review round 1 produced no verdict:
- sl-plan-amend--kimi failed: moonshot/kimi-k3 returned 429, account suspended for insufficient balance.
- sl-plan-amend--openai was withheld by the classifier, because the worktree changed while it ran. My commit f303866 (sl-issues-closes) and the running sl-issues-intake hand both wrote to the worktree.

That was my sequencing error. A review must run while no change slice touches the worktree.

Next: let sl-issues-intake settle and commit it. Then re-dispatch the sl-plan-amend review on openai alone, with no change slice running at the same time.
- assumption (lane-mv66ylim0gahog-5, sl-issues-intake): hand-settled: dt-mv8xv1ek24212165 routing rt-mv8yag850ocwlc
- assumption (lane-mv66ylim0gahog-5, sl-issues-intake): artifact-command: bun test surface/test/issues-intake.test.ts gates/test/tool-call-rows.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-plan-amend token dt-mv8yb5vsad633bcb labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-spawn: dt-mv8yb5vsad633bcb session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-amend review yes group dg-mv8yb5vsf7c2975f row openai-codex/gpt-6-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-settled: dt-mv8yb5vsad633bcb routing rt-mv8yh7br2wl5og
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-round: sl-plan-amend round 2 token dt-mv8yb5vsad633bcb group dg-mv8yb5vsf7c2975f verdict accepted blocking 4 counts {"counts":{"blocking":{"correctness":4},"major":{"tests":1,"security":1},"minor":{}},"titles":[{"severity":"blocking","kind":"correctness","title":"SEO audit defaults to GitHub without a seeded Linear override"},{"severity":"blocking","kind":"correctness","title":"Turn-start watermark misses input commands and aside-started turns"},{"severity":"blocking","kind":"correctness","title":"Turn-end updated outcome lacks a persisted pushed sequence"},{"severity":"blocking","kind":"correctness","title":"Linear projection omits required awaiting-merge label"},{"severity":"major","kind":"tests","title":"PR-create footer path lacks effective-tracker guard and move test"},{"severity":"major","kind":"security","title":"Jo's Linear key is inherited by child processes despite fetch-only claim"}]}
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): Amendment review round 1 ran on PLAN.md rev 10 § 13 at worktree c885326. Hand sl-plan-amend on openai-codex/gpt-6-sol; Kimi is out of credit. Verdict: revise, 4 blocking and 2 major.

Blocking:
1. The SEO audit routes to GitHub by default.
2. The turn-start watermark misses input-row commands and aside-started turns.
3. The `updated` outcome lacks a persisted pushed_seq.
4. Linear drops the awaiting-merge label.

Major:
5. The footer path lacks a tracker guard.
6. fetch does not keep the key out of child processes.

Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-AMEND-REVIEW-r1-openai.md.

PLAN.md rev 11 answers each finding:
1. Config `issues.overrides` seeds wl-mv5jz4vewt8mbk to linear:ENG.
2. The turn range now runs from the previous turn end to this turn end, so no start hook is needed.
3. `pushed_seq` is written with the push, including a no-diff push.
4. Linear uses the same label set as GitHub.
5. A footer guard checks the effective tracker and the PR repo, and a tracker move clears the issue number.
6. The key claim is corrected: the key is already inherited by every process Jo's shell starts, it is never put in argv or logs, and redaction is tested. This is stated in § 13.5.

Next: amendment review round 2. No change slice is running, so the review can run against a fixed worktree.
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-plan-amend token dt-mv8yj8563c28d291 labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-spawn: dt-mv8yj8563c28d291 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-plan-amend-2 review yes group dg-mv8yj856098b6e1f row openai-codex/gpt-6-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): hand-settled: dt-mv8yj8563c28d291 routing rt-mv8ylydjjkln28
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-round: sl-plan-amend round 3 token dt-mv8yj8563c28d291 group dg-mv8yj856098b6e1f verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":1,"design":1},"minor":{}},"titles":[{"severity":"major","kind":"correctness","title":"Tracker move leaves existing machinery-owned GitHub closing footer on open PR"},{"severity":"major","kind":"design","title":"Global turn sequence and per-workload render sequence need a consistent settlement invariant"}]}
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): review-loop-end: sl-plan-amend reason pass
- assumption (lane-mv66ylim0gahog-5, sl-plan-amend): Amendment review round 2 ran on PLAN.md rev 11 § 13 (hand sl-plan-amend-2, openai-codex/gpt-6-sol). Verdict: approve-with-changes, 0 blocking. All six round-1 answers were confirmed.

It raised 2 majors:
- a tracker move leaves the old machinery footer on an open PR;
- turns.seq was the global range top, which does not match the per-workload pushed_seq.

Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-AMEND-REVIEW-r2-openai.md.

PLAN.md rev 12 answers both:
- A move strips exactly closesFooter(old) from open PRs in the set. Other text is kept, and a footer that is not the exact suffix counts as drift.
- turns.seq is now that workload's own highest seq in the range, and pushed_seq is the rendered last_seq. An A-then-B test is added.

Next: raise the amendment question to Jo.
- assumption (lane-mv66ylim0gahog-5, sl-issues-tracker): hand-spawn: dt-mv8z0oez358790dd session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-tracker review no group dg-mv8z0oez4edaba8e row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-tracker): hand-settled: dt-mv8z0oez358790dd routing rt-mv8zupinzr73eo
- assumption (lane-mv66ylim0gahog-5, sl-issues-tracker): artifact-command: bun test surface/test/issues-intake.test.ts surface/test/issues-projector.test.ts surface/test/issues-prs.test.ts surface/test/issues-render.test.ts surface/test/issues-footer.test.ts surface/test/issues-tracker.test.ts surface/test/issues-linear.test.ts surface/test/close-entry.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-turnend): hand-spawn: dt-mv8zyf0t7334679f session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-turnend review no group dg-mv8zyf0t89547b3d row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-reconcile): hand-spawn: dt-mv8zyf0tf72cfed5 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-reconcile review no group dg-mv8zyf0tf5ceab3f row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-word): hand-spawn: dt-mv8zyf0tf1a772c0 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-word review no group dg-mv8zyf0t292a3c17 row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-word): hand-settled: dt-mv8zyf0tf1a772c0 routing rt-mv903ukl5wa8zk
- assumption (lane-mv66ylim0gahog-5, sl-issues-word): artifact-command: bun test surface/test/input.test.ts surface/test/extension.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-turnend): hand-settled: dt-mv8zyf0t7334679f routing rt-mv90ace51ut6gw
- assumption (lane-mv66ylim0gahog-5, sl-issues-turnend): artifact-command: bun test surface/test/issues-turnend.test.ts surface/test/issues-projector.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/lane.test.ts surface/test/extension.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-reconcile): hand-settled: dt-mv8zyf0tf72cfed5 routing rt-mv90ey30jab85c
- assumption (lane-mv66ylim0gahog-5, sl-issues-reconcile): artifact-command: bun test surface/test/issues-reconcile.test.ts surface/test/issues-turnend.test.ts surface/test/issues-intake.test.ts surface/test/issues-projector.test.ts surface/test/issues-prs.test.ts surface/test/issues-render.test.ts surface/test/issues-footer.test.ts surface/test/issues-tracker.test.ts surface/test/issues-linear.test.ts surface/test/close-entry.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/lane.test.ts surface/test/extension.test.ts surface/test/input.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-reconcile): Decision: the reconciler shares the tick's per-tick call budget (20) with the push, as PLAN.md § 4 describes. A run that exhausts the budget is recorded as `issues-drift: unknown (budget …)`, never 0, and the next tick does not retry it. A notice needs two consecutive bad runs. The cost is one extra notice on a sustained burst of busy ticks, which keeps every GitHub call under the caps from the done line. Raising or splitting the budget would add a second cap that the plan did not review. A further risk the hand accepted: if the drift-entry ledger write fails, the turn drift lines taken by takeTurnDrift are lost (GUESS(inference), from the hand's report).
- assumption (lane-mv66ylim0gahog-5, sl-issues-docs): hand-spawn: dt-mv90l1effe3bd6a4 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-docs review no group dg-mv90l1ef157667ff row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-docs): hand-settled: dt-mv90l1effe3bd6a4 routing rt-mv90q0i5y8ofb4
- assumption (lane-mv66ylim0gahog-5, sl-issues-docs): artifact-command: bun test surface/test/migration-items-repo.test.ts surface/test/migration-items.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review token dt-mv90qzrm5b7f5e1d labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-spawn: dt-mv90qzrm5b7f5e1d session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review review yes group dg-mv90qzrm61c8a928 row openai-codex/gpt-6-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): artifact-command: bun surface/scripts/issues.ts check
- assumption (lane-mv66ylim0gahog-5, sl-issues-smoke): artifact-command: env AGENT_SYSTEM_LEDGER_DB=/Users/jowolff/agent-scratch/agent-system-2.0/scratch/wl-mv66ylim0gahog/smoke/ledger.db bun surface/scripts/issues.ts check
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-settled: dt-mv90qzrm5b7f5e1d routing rt-mv90vjylepkuf4
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-round: sl-issues-review round 1 token dt-mv90qzrm5b7f5e1d group dg-mv90qzrm61c8a928 verdict accepted blocking 2 counts {"counts":{"blocking":{"correctness":2},"major":{"correctness":7},"minor":{"correctness":1}},"titles":[{"severity":"blocking","kind":"correctness","title":"Closed links miss later PRs and awaiting-merge state"},{"severity":"blocking","kind":"correctness","title":"Read-only check bypasses per-tracker call budgets"},{"severity":"major","kind":"correctness","title":"Reconciler trusts edited remote PR lines as expected projection"},{"severity":"major","kind":"correctness","title":"Removed machinery footer is never restored"},{"severity":"major","kind":"correctness","title":"Truncated PR scan can still report zero drift"},{"severity":"major","kind":"correctness","title":"Malformed Linear list can report zero drift"},{"severity":"major","kind":"correctness","title":"Linear label pagination can erase personal labels"},{"severity":"major","kind":"correctness","title":"Second session resets first session's turn watermark"},{"severity":"major","kind":"correctness","title":"Turn-failure drift marker consumed before ledger write"},{"severity":"minor","kind":"correctness","title":"Partially failed tracker move duplicates comment"}]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): Code review round 1 came back with findings. Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/CODE-REVIEW-r1.md, from the deep hand off the builder lab. It lists 2 blocking, 7 major and 1 minor finding.

Blocking:
- closed links miss later PRs;
- `issues.ts check` bypasses the per-tracker budgets.

Major:
- the reconciler trusts remote PR lines;
- a removed footer is never restored;
- a truncated PR scan can still report drift 0;
- a malformed Linear list is read as empty;
- Linear label pagination can drop personal labels;
- turn_mark is shared across sessions;
- the drift line is consumed before the ledger write.

Minor:
- a move comment can be posted twice.

Decision: fix all 10 in two disjoint change slices, sl-issues-fix-projector and sl-issues-fix-reconcile, then run review round 2. The smoke waits until the fixes land, because it must run on the final code.
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-projector): hand-spawn: dt-mv9113a41230456b session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix-projector review no group dg-mv9113a4c03e6c9e row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-reconcile): hand-spawn: dt-mv9113a4d1a202ab session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix-reconcile review no group dg-mv9113a4b88f86a0 row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-projector): hand-settled: dt-mv9113a41230456b routing rt-mv91cjxt3eqvi8
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-reconcile): hand-settled: dt-mv9113a4d1a202ab routing rt-mv91fms44mdm9s
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-projector): artifact-command: bun test surface/test/issues-projector.test.ts surface/test/issues-linear.test.ts surface/test/issues-tracker.test.ts surface/test/issues-prs.test.ts surface/test/issues-render.test.ts surface/test/issues-footer.test.ts surface/test/close-entry.test.ts surface/test/input.test.ts surface/test/extension.test.ts surface/test/lane.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-reconcile): artifact-command: bun test surface/test/issues-reconcile.test.ts surface/test/issues-turnend.test.ts surface/test/issues-intake.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/migration-items-repo.test.ts surface/test/migration-items.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review token dt-mv91h7wka92fa924 labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-spawn: dt-mv91h7wka92fa924 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review-2 review yes group dg-mv91h7wk1bc800ec row openai-codex/gpt-6-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-settled: dt-mv91h7wka92fa924 routing rt-mv91nm5au92000
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-round: sl-issues-review round 2 token dt-mv91h7wka92fa924 group dg-mv91h7wk1bc800ec verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":2,"design":1},"minor":{"correctness":2,"design":1,"docs":1}},"titles":[{"severity":"major","kind":"correctness","title":"New PR can remain absent while reconciliation reports zero drift"},{"severity":"major","kind":"correctness","title":"Linear issues with more than 20 labels cannot receive any update"},{"severity":"major","kind":"design","title":"Scanning historical closed-link repos can exhaust the GitHub hourly budget"},{"severity":"minor","kind":"correctness","title":"Move comment still duplicates after a crash before its marker"},{"severity":"minor","kind":"design","title":"Intentional PR footer removal is immediately undone"},{"severity":"minor","kind":"correctness","title":"Crashed sessions leave unbounded turn-mark state keys"},{"severity":"minor","kind":"docs","title":"Check migrates old sidecars despite documenting call-count-only writes"}]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-loop-end: sl-issues-review reason pass
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): Code review round 2: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/CODE-REVIEW-r2.md (deep hand, off the builder lab). It has no blocking findings, 3 major and 4 minor.

Round 1 status: 1-6, 8 and 9 are resolved. 7 and 10 are only partly resolved.

Major findings:
- a stale pushed hash hides a newly discovered PR from drift;
- a Linear issue with more than 20 labels gets no update at all;
- scanning closed links makes the GitHub budget grow with history.

Minor findings:
- the move comment can repeat if the process crashes before its marker is written;
- footer opt-out;
- stale turn_mark keys;
- check migrates an old sidecar.

Decision: fix all three majors and three of the minors (move-comment crash gap, turn_mark cleanup, check migration) in sl-issues-fix2-projector and sl-issues-fix2-reconcile.

Footer opt-out is recorded as a residual in the migration item instead of being fixed: PLAN § 5 has machinery always own the footer, and a per-PR opt-out is a new feature the plan did not approve.

Round 3 of 5 follows.
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-projector): hand-spawn: dt-mv91ovts22063050 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix2-projector review no group dg-mv91ovts46f47369 row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-reconcile): hand-spawn: dt-mv91ovtsae719829 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix2-reconcile review no group dg-mv91ovts764774e1 row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-reconcile): hand-settled: dt-mv91ovtsae719829 routing rt-mv91z1wc56t6gw
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-projector): hand-settled: dt-mv91ovts22063050 routing rt-mv91z65nyb8a2o
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-projector): artifact-command: bun test surface/test/issues-projector.test.ts surface/test/issues-linear.test.ts surface/test/issues-tracker.test.ts surface/test/issues-prs.test.ts surface/test/issues-render.test.ts surface/test/issues-footer.test.ts surface/test/close-entry.test.ts surface/test/input.test.ts surface/test/extension.test.ts surface/test/lane.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-reconcile): artifact-command: bun test surface/test/issues-reconcile.test.ts surface/test/issues-turnend.test.ts surface/test/issues-intake.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/migration-items-repo.test.ts surface/test/migration-items.test.ts gates/test/manifest-sync.test.ts gates/test/tool-call-rows.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review token dt-mv920gpw95f0c8fa labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-spawn: dt-mv920gpw95f0c8fa session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review-3 review yes group dg-mv920gpw50270d25 row openai-codex/gpt-6-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-settled: dt-mv920gpw95f0c8fa routing rt-mv924js43k9x4w
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-round: sl-issues-review round 1 token dt-mv920gpw95f0c8fa group dg-mv920gpw50270d25 verdict accepted blocking 2 counts {"counts":{"blocking":{"correctness":2},"major":{"correctness":2},"minor":{"correctness":1}},"titles":[{"severity":"blocking","kind":"correctness","title":"Retargeting a PR onto the default branch never adds Closes footer"},{"severity":"blocking","kind":"correctness","title":"GitHub budget stop skips the due hourly issues-drift entry"},{"severity":"major","kind":"correctness","title":"Late PR after 24-hour wildcard scan cutoff can leave issue stale with zero drift"},{"severity":"major","kind":"correctness","title":"Linear items with over 20 labels permanently report unknown drift"},{"severity":"minor","kind":"correctness","title":"Seven-day turn-mark purge can drop a live idle session's turn range"}]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): Code review round 3 has 2 blocking, 2 major and 1 minor finding. Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/CODE-REVIEW-r3.md.

Round-2 status: 6 resolved, the footer opt-out accepted as a residual, and the per-tick scan of exact-rule repos accepted as by design (as2 always has open work, about 60 calls an hour, as documented).

New findings and decisions:
- Blocking: a PR retargeted onto the default branch never gets its footer. Fix it.
- Blocking: a GitHub budget stop skips the hourly drift entry that is due. Fix it: run the reconcile phase even when GitHub is stopped, and record `unknown (github budget)`. The smoke run hit this live, with 300 calls in the hour.
- Major: a PR opened more than 24 h after close, on a wildcard-routed repo, is not discovered. This becomes a documented residual. The window exists for decision-log PRs, which publishEntry creates at close.
- Major: a Linear item with more than 20 labels always reports unknown. Fix it by paging labels in reconcile.
- Minor: the stale-mark purge can delete the mark of a live but idle session. Fix it with a per-poll heartbeat.

Fix slices: sl-issues-fix3-projector and sl-issues-fix3-reconcile. Review round 4 of 5 follows.
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix3-projector): hand-spawn: dt-mv925u5jf5345a7a session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix3-projector review no group dg-mv925u5jd6c1365d row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix3-reconcile): hand-spawn: dt-mv925u5j3f016fae session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix3-reconcile review no group dg-mv925u5jf6d695bb row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix3-projector): hand-settled: dt-mv925u5jf5345a7a routing rt-mv92a5inzrwhkw
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix3-reconcile): hand-settled: dt-mv925u5j3f016fae routing rt-mv92cco1rm9vk0
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix3-projector): artifact-command: bun test surface/test/issues-projector.test.ts surface/test/issues-linear.test.ts surface/test/issues-tracker.test.ts surface/test/issues-prs.test.ts surface/test/issues-render.test.ts surface/test/issues-footer.test.ts surface/test/close-entry.test.ts surface/test/input.test.ts surface/test/extension.test.ts surface/test/lane.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix3-reconcile): artifact-command: bun test surface/test/issues-reconcile.test.ts surface/test/issues-turnend.test.ts surface/test/issues-intake.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/migration-items-repo.test.ts surface/test/migration-items.test.ts gates/test/manifest-sync.test.ts gates/test/tool-call-rows.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-jo-intake): hand-spawn: dt-mv92r08z60e68d02 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-jo-intake review no group dg-mv92r08z00736fc2 row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-jo-intake): hand-settled: dt-mv92r08z60e68d02 routing rt-mv933829b19gcg
- assumption (lane-mv66ylim0gahog-5, sl-issues-jo-intake): artifact-command: bun test surface/test/issues-intake.test.ts surface/test/issues-projector.test.ts surface/test/issues-tracker.test.ts surface/test/issues-reconcile.test.ts surface/test/issues-turnend.test.ts surface/test/migration-items-repo.test.ts surface/test/migration-items.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review token dt-mv934sfr9bb9db50 labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-spawn: dt-mv934sfr9bb9db50 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review-4 review yes group dg-mv934sfre3f33170 row openai-codex/gpt-6.1-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): hand-settled: dt-mv934sfr9bb9db50 routing rt-mv937mrxdh981s
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-round: sl-issues-review round 2 token dt-mv934sfr9bb9db50 group dg-mv934sfre3f33170 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review): review-loop-end: sl-issues-review reason pass
- assumption (lane-mv66ylim0gahog-5, sl-issues-train-skip): artifact-command: bun test surface/test/issues-intake.test.ts surface/test/issues-projector.test.ts surface/test/issues-tracker.test.ts surface/test/issues-reconcile.test.ts surface/test/issues-turnend.test.ts surface/test/migration-items-repo.test.ts surface/test/migration-items.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-smoke): The live smoke found a bug: Linear rewrites the markdown of an issue description, so ENG-2284 (wl-mv5jz4vewt8mbk) shows drift on every hourly reconcile.

Evidence:
- the scratch drift entry at 05:36:32Z reads `issues-drift: 1 … linear ENG ENG-2284 wl-mv5jz4vewt8mbk: machine block differs`;
- the 04:36 entry already listed it, so the force repair did not clear it;
- the description read from Linear after the repair push (updatedAt 05:36:34Z) still differs from what was sent.

What Linear changes:
- `- <url> merged` becomes `* [<url>](<<url>>) merged`;
- the `ledger seq` line and `<!-- as2:end -->` get indented into the list item.

Effect: every Linear item whose block holds a PR list drifts permanently and costs one forced write an hour.

Decision: fix with sl-issues-linear-normal. Store the hash of the block Linear returns after each write, and have the reconciler compare the remote block against that hash rather than against our render. The done line needs drift 0 in the smoke.
- assumption (lane-mv66ylim0gahog-5, sl-issues-linear-normal): hand-spawn: dt-mv93y2p68ed61051 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-linear-normal review no group dg-mv93y2p60cea368d row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-linear-normal): hand-settled: dt-mv93y2p68ed61051 routing rt-mv947vxk3jswsg
- assumption (lane-mv66ylim0gahog-5, sl-issues-linear-normal): artifact-command: bun test surface/test/issues-reconcile.test.ts surface/test/issues-tracker.test.ts surface/test/issues-linear.test.ts surface/test/issues-render.test.ts surface/test/issues-projector.test.ts surface/test/issues-intake.test.ts surface/test/issues-turnend.test.ts surface/test/issues-prs.test.ts surface/test/issues-footer.test.ts surface/test/close-entry.test.ts surface/test/input.test.ts surface/test/extension.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/migration-items-repo.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review5 token dt-mv94i6ym3a2292a7 labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): hand-spawn: dt-mv94i6ym3a2292a7 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review5 review yes group dg-mv94i6ym43af302b row openai-codex/gpt-6.1-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): review-withheld: dt-mv94i6ym3a2292a7
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): builder-lab: openai hand dt-mv94i6ym3a2292a7 model openai-codex/gpt-6.1-sol
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): hand-settled: dt-mv94i6ym3a2292a7 routing rt-mv94la9l6bj0g0
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): review-round: sl-issues-review5 round 1 token dt-mv94i6ym3a2292a7 group dg-mv94i6ym43af302b verdict withheld blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review5 token dt-mv94ll38859e9e8f labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): hand-spawn: dt-mv94ll38859e9e8f session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review5-2 review yes group dg-mv94ll38d8a1b131 row openai-codex/gpt-6.1-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): hand-settled: dt-mv94ll38859e9e8f routing rt-mv94ow8jnctm9s
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): review-round: sl-issues-review5 round 2 token dt-mv94ll38859e9e8f group dg-mv94ll38d8a1b131 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review5): review-loop-end: sl-issues-review5 reason pass
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-orphan): hand-spawn: dt-mv94s93r9cef0552 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix-orphan review no group dg-mv94s93r28fc6f6b row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-orphan): hand-settled: dt-mv94s93r9cef0552 routing rt-mv94zi8n1wye4g
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix-orphan): artifact-command: bun test surface/test/issues-reconcile.test.ts surface/test/issues-tracker.test.ts surface/test/issues-linear.test.ts surface/test/issues-render.test.ts surface/test/issues-projector.test.ts surface/test/issues-intake.test.ts surface/test/issues-turnend.test.ts surface/test/issues-prs.test.ts surface/test/issues-footer.test.ts surface/test/close-entry.test.ts surface/test/input.test.ts surface/test/extension.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/migration-items-repo.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review6 token dt-mv950v5mba31372b labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): hand-spawn: dt-mv950v5mba31372b session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review6 review yes group dg-mv950v5mbf5d7c53 row openai-codex/gpt-6.1-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): hand-settled: dt-mv950v5mba31372b routing rt-mv9544zr3vezuo
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): review-round: sl-issues-review6 round 1 token dt-mv950v5mba31372b group dg-mv950v5mbf5d7c53 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":1},"minor":{}},"titles":[{"severity":"major","kind":"correctness","title":"Closed-only tracker destinations are never scanned, so their orphan items remain silently open"}]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): review-loop-end: sl-issues-review6 reason pass
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-orphan): hand-spawn: dt-mv954vwtc2a4d7c4 session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-fix2-orphan review no group dg-mv954vwtfd10b2bf row anthropic/claude-opus-5-5
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-orphan): hand-settled: dt-mv954vwtc2a4d7c4 routing rt-mv95b03x3wwutc
- assumption (lane-mv66ylim0gahog-5, sl-issues-fix2-orphan): artifact-command: bun test surface/test/issues-reconcile.test.ts surface/test/issues-tracker.test.ts surface/test/issues-linear.test.ts surface/test/issues-render.test.ts surface/test/issues-projector.test.ts surface/test/issues-intake.test.ts surface/test/issues-turnend.test.ts surface/test/issues-prs.test.ts surface/test/issues-footer.test.ts surface/test/close-entry.test.ts surface/test/input.test.ts surface/test/extension.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/migration-items-repo.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): review-same-lab-rule: in-mv5xafhywe3w8w slice sl-issues-review6 token dt-mv95c2uo8db5232b labs openai,anthropic kimi moonshot/kimi-k3 (its provider refused on dt-mv8xuctb82ab767e (status 429))
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): hand-spawn: dt-mv95c2uo8db5232b session /Users/jowolff/.agent-system-2/lanes/wl-mv66ylim0gahog/sessions/2026-10-13T04-39-14-006Z_01a1338e-b956-7000-831e-f0633cc630ce spawn sl-issues-review6-2 review yes group dg-mv95c2uo8d9442a1 row openai-codex/gpt-6.1-sol,anthropic/claude-fable-5-1
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): hand-settled: dt-mv95c2uo8db5232b routing rt-mv95f632xxuiv4
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): review-round: sl-issues-review6 round 1 token dt-mv95c2uo8db5232b group dg-mv95c2uo8d9442a1 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{"tests":1}},"titles":[{"severity":"minor","kind":"tests","title":"Orphan-adoption ownership and existing-link preservation lack direct regressions"}]}
- assumption (lane-mv66ylim0gahog-5, sl-issues-review6): review-loop-end: sl-issues-review6 reason pass
- assumption (lane-mv66ylim0gahog-5, sl-full-mv66ylim0gahog-1): Red run tr-0mv97egonmuel93 at b69cdb3: the one failure is surface/test/as2test.test.ts T5, which diffs readdirSync("/private/tmp") for as2test-refresh.* dirs before/after (line 851, 969). Two dirs (as2test-refresh.g0nEcu, .issLqW) appeared during the test from a process outside this run; /private/tmp still held as2test-refresh.g0nEcu and a new .tpMBNA at 07:35Z after the run. This PR touches no as2test code; T5 passed in all 11 earlier full logs under test-runs. Every changed test file passed alone. Re-running on the same sha.
- assumption (lane-runner): pair-offer: q-mv98d2siwe2osg site ceiling signals b
- assumption (classifier): pair-exposure: lane-mv66ylim0gahog-6 on
- assumption (lane-mv66ylim0gahog-6): builder-lab: openai lane lane-mv66ylim0gahog-6 model openai-codex/gpt-6.1-sol

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mv68duwcwo5nuo [delivered] not acted on: For wl-mv654hoqwpfhmo (switch registry): wl-mv66ylim0gahog's issues switch writes the entry `switch: issues on|off orchestrator by <in-id>` on wl-orchestrator, in that registry's planned shape. Jo's words are `issues on` / `issues off` and the default is off. The registry's reader should accept the `orchestrator` target for the `issues` switch so that one convention covers both. Plan: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN.md § 7.
- message msg-mv6v8v6ukzvuo0 [delivered] not acted on: This is context for q-mv6v7u4623xslc on sl-plan-issues, which machinery raised after review round 8 settled. GUESS(inference): it is the round-limit extend / accept / stop question. I cannot read its text from a lane.

Status of the extend block:
- Round 6 found one blocker: a second open PR reopened the issue after the first PR merged. Rev 7 fixed it with "first merge wins".
- Round 7 found two blockers and a minor:
  - workloads opened while issues were off were skipped when switched back on;
  - PR lists capped at 30 and missing the test-requested fallback;
  - no retry for the intake acknowledgement.
  Rev 8 fixed all three, and round 8 confirmed all three fixes.
- Round 8 found one new blocker: the per-tick PR scan did not map a test-requested PR outside every bound branch. Rev 9 fixes it: the scan maps by bound head or test-requested number, with a test.

The reports are /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv66ylim0gahog/PLAN-REVIEW-r6..r8-openai.md. Findings per round were 13, 6, 5, 4, 1, 1, 3, 1. Every finding since round 4 is a narrower edge of the same PR-set/footer logic.

Rev 9 (PLAN.md) is unreviewed. I recommend extend: one round on rev 9, then the approve / revise / cancel plan question. Accept would go straight to the plan question with the r8 fix unreviewed. The slice is parked; I dispatch nothing until Jo answers.
- message msg-mv6wdw7iaipxj4 [delivered] not acted on: artifact-failed: `bun test surface/test/issues-render.test.ts surface/test/issues-prs.test.ts surface/test/issues-projector.test.ts surface/test/issues-footer.test.ts gates/test/manifest-sync.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/lane.test.ts` exited 1 (tool call toolu_01GMnmvqoZYoAToQp5x7cj8D)
- message msg-mv8xq8xqu71szk [delivered] not acted on: artifact-passed: `bun test surface/test/issues-render.test.ts surface/test/issues-prs.test.ts surface/test/issues-projector.test.ts surface/test/issues-footer.test.ts gates/test/manifest-sync.test.ts surface/test/delivery.test.ts surface/test/wake-close.test.ts surface/test/lane.test.ts` exited 0 (tool call toolu_01SbiqJWYwT6EBsnMi8qQaCE)
- message msg-mv92gf6mzw0zk0 [delivered] not acted on: **PR up.** PR #217 (https://github.com/thewolff/agent-system-2.0/pull/217) holds the issues projection; Jo's ON FIRE instruction in-mv929emvq67dvk applies.

**What it covers:**
- GitHub issues for agent-system-2.0, and Linear ENG for ContextPress.
- The outbox, the reconciler, and the `Closes #N` footer.
- Intake: issues Jo files on agent-system-2.0 become wl-orchestrator instructions.
- The `issues on|off` switch.

**Where it stands:**
- The full-suite run tr-0mv92g1me3bnu6f is running on head a4c7d05.
- Code review rounds 1-3 are done and their fixes are in the PR. Two items are left as documented residuals: the footer opt-out, and the 24 h late-PR window on glob-routed repos.
- Review round 4 is held on question q-mv92ac7xt75v5s, which I raised on sl-issues-review: should intake read thewolff/jo-issues instead of agent-system-2.0? Plumb also files issues there as thewolff. The options are ship-as-built and add-jo-issues; I recommend ship-as-built.
- Jo's answer unblocks round 4.
- message msg-mv95w5usv4zc3k [delivered] not acted on: artifact-failed: `env AGENT_SYSTEM_LEDGER_DB=/Users/jowolff/agent-scratch/agent-system-2.0/scratch/wl-mv66ylim0gahog/smoke/ledger.db bun surface/scripts/issues.ts check` exited 1 (tool call toolu_01JKhCDZ1ZtnzFwcv9JSyN1D)
- message msg-mv986v0g3j8p34 [delivered] not acted on: **PR #217 at b69cdb3: one unrelated red, re-running.** Full suite tr-0mv97egonmuel93: 5243 pass, 1 fail, and every changed test file passes on its own. The failure is surface/test/as2test.test.ts T5. That test diffs the global /private/tmp for as2test-refresh.* dirs, and a process outside the run created two such dirs while it ran; one was still in /private/tmp afterwards. The rerun is tr-0mv986qxjavpq9l on the same sha. Since the last update: the smoke is done (SMOKE.md). The smoke's PR #155 footer closed #203 when Jo merged it. Reviews r5 and r6 are done; r6's major (an orphan issue of a closed workload, e.g. #206, was never closed) is fixed. The migration item now says pr 217.
- reserved request en-mv8zkltzsyp3i8: bun with a subcommand or target not known until it runs: bun test surface/test/issues-*.test.ts surface/test/close-entry.test.ts gates/test/manifest-sync.test.ts 2>&1 | grep -E "^\s*(✗|\(fail\))|error:|^ *[0-9]+ (pass|fail)|Ran " | head -40 (P-11 row 6 refused tool call toolu_01CBQA7wqgLQFrSGZuetSGoG) — approved
- reserved request en-mv90lh3t06u96o: bun with a subcommand or target not known until it runs: for f in gates/test/tool-call-rows.test.ts surface/test/close-entry.test.ts surface/test/delivery.test.ts surface/test/extension.test.ts surface/test/input.test.ts surface/test/issues-footer.test.ts surface/test/issues-intake.test.ts surface/test/issues-linear.test.ts surface/test/issues-projector.test.ts surface/test/issues-prs.test.ts surface/test/issues-reconcile.test.ts surface/test/issues-render.test.ts surface/test/issues-tracker.test.ts surface/test/issues-turnend.test.ts surface/test/wake-close.test.ts; do echo "== $f"; bun test "$AS2_SCRATCH/failbefore/$f" 2>&1 | grep -E '^ *[0-9]+ (pass|fail)$|^error: |Cannot find module|^\(fail\)' | grep -m 8 .; done (P-11 row 6 refused tool call toolu_01Bvek5CoG4BnqVR15aScMez) — withdrawn by lane-mv66ylim0gahog-5: spelled each bun test target literally instead; fails-before done
- reserved request en-mv90lukpo817uo: bun with a subcommand or target not known until it runs: bun test ./gates/test/tool-call-rows.test.ts 2>&1 | grep -E '^ *[0-9]+ (pass|fail)$'; echo ==; bun test ./surface/test/wake-close.test.ts 2>&1 | grep -E '^ *[0-9]+ (pass|fail)$'; for t in footer intake linear projector prs reconcile render tracker turnend; do echo "== $t"; bun test ./surface/test/issues-$t.test.ts 2>&1 | grep -E '^ *[0-9]+ (pass|fail)$|Cannot find module' | grep -m 3 .; done (P-11 row 6 refused tool call toolu_01Pr4ob3zBGMmszXnAcDqMFZ) — withdrawn by lane-mv66ylim0gahog-5: spelled each bun test target literally instead; fails-before done
- reserved request en-mv91ek2vc0llhc: bun with a subcommand or target not known until it runs: for f in issues-reconcile issues-turnend; do bun test surface/test/$f.test.ts 2>&1 | grep -E "pass$|fail$"; done (P-11 row 6 refused tool call toolu_01Tt2P8u7Z2wsxkjKwJx1QLZ) — approved
- reserved request en-mv93cb0dfzjw1s: gh api with a mutating method: grep -E 'gh pr edit|gh api .*pulls/[0-9]+ .*PATCH|-X PATCH' "$AS2_SCRATCH/smoke/calls.log" | cut -c1-220 | grep -m 10 .; grep -cE 'gh pr edit' "$AS2_SCRATCH/smoke/calls.log" (P-11 row 6 refused tool call toolu_014GPhiXrdeHVkUXqqfAUJ63) — approved
