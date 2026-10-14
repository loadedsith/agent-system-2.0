---
date: 2026-10-12T19:26-07:00
engineer: Ilex
session: wl-mv5oikd5jtquww
status: resolved
durable: false
supersedes:
workload: wl-mv5oikd5jtquww
---

# Jo (2026-10-12, input in-mv5oi28m3xkikg): "i want the solution to this tmp issue - you're proposing lane owned scratch?" Yes: this workload builds it.

Problem: lanes keep getting reserved holds (each one a needs-you line for Jo, and approval never admits a re-run) for ordinary housekeeping on their own throwaway copies under /tmp. Tonight: en-mv5n4f46p3q60w (eval lane, rm -rf of a base copy it had unpacked inside surface/test/), en-mv5n9huuu4fpq8 (guards lane, rm -rf of a sentinel dir through a variable), en-mv5mrwkbgccxkw (guards lane, git checkout -- in its /tmp fails-before copy), en-mv5og4bi1ttzwg and en-mv5og7n0vuql8g (migration lane, rm -rf /tmp/pp and a .git write in a mktemp repo), en-mv5oha1fkhws8w (migration lane, git push into a bare repo it just created), and the SEO lane's quorum cleanup (an rm -rf of a mktemp dir). Several were withdrawn by the lane minutes later; the rest Jo denied. The SEO lane went further and wrote its own sandbox profile (msg-mv5lsxejrb5mgw).

Build (Ilex's design, the plan may improve it):
1. Each lane gets one scratch root the machinery creates and owns, exported to every lane and hand bash call as a known variable (for example AS2_SCRATCH=/tmp/as2/<workload id>/ or under ~/agent-scratch/agent-system-2.0/<workload id>/tmp). The plan picks the location, how it survives restarts, and when the runner removes it (workload close).
2. Gate row 6 (and any other row that holds these) allows the destructive housekeeping forms — rm -rf, git init/clone, .git writes, git checkout --, git branch -d, and git push to a filesystem remote — when every target and destination path resolves, after normalisation, inside the lane's own scratch root, written literally or through the known scratch variable. Paths that are unknown until run (mktemp output, other variables, globs) stay refused; so do URLs, named remotes, symlink escapes, `..` escapes, and another lane's scratch root. Nothing outside the scratch root gets any looser.
3. The fence already allows writes there or is made to; state which.
4. tiers/lane.md (and the hand tiers) tell lanes and hands to put throwaway copies, fails-before unpacked copies and probe repos under the scratch root, never inside the worktree.
5. Proof: replay tonight's held commands, rewritten to use the scratch root, and show each is allowed; show the escape cases (another lane's root, `..`, symlink out, a URL push, a named remote, mktemp output) still refused; guard-replay row deltas reported (gates/scripts/guard-replay.ts); a real lane session that creates, pushes to and deletes a probe repo in its scratch root with no hold.
Regression tests fail before the change, proven on a separate unpacked copy. Coordinate: clean-shell wl-mv5lrh0drbg0zk (fence and session env), the PR #93 fence-wrapper diagnosis wl-mv5o5xkyebs7i8, items 100–102 (row 6 parser), probe suite PR #97 (add the escape cases as probes if it has landed). Name shared files and merge order (green-first). MIGRATION.md item. Full suite via lane_full_test on the PR. Merging stays Jo's (merge commit). Production stakes: gates/.

done: Every lane and hand has a machine-owned scratch root exposed as a known variable; rm -rf, git init/clone, .git writes, git checkout --, git branch -d and filesystem-remote pushes whose targets all resolve inside that lane's own root are allowed without a hold, while every escape (other lanes' roots, `..`, symlinks out, unknown paths, URLs, named remotes) stays refused; tonight's held commands, rewritten to the scratch root, replay as allowed; lane tiers point throwaway copies there; regression tests fail before the change; guard-replay deltas are reported; a MIGRATION.md item records it; the full suite is green at the PR head; the change is on a branch with a PR.
done-because: PR #107 (https://github.com/thewolff/agent-system-2.0/pull/107), branch wl/wl-mv5oikd5jtquww, head a43e8f9.
- Scratch root: every lane and hand has a machine-owned scratch root, exported as AS2_SCRATCH (gates/src/scratch.ts scratchRootFor; surface/src/launch.ts laneEnv). The root is created by the launcher's prepare and re-created after a won claim (surface/src/scratch-root.ts).
- Allowed inside the root: row 6 allows confined rm -rf, git init/clone, git checkout --, git branch -d and filesystem-remote pushes inside the lane's own root.
- .git writes and hooks stay refused, per approved plan rev 4 tradeoff 2.
- Escapes stay refused (gates/test/scratch-root.test.ts, 29 pass): other lanes' roots, `..`, symlinks out, unknown paths, URLs and named remotes.
- Tonight's held commands, rewritten to the root (replay.md): all 9 go from REFUSE on main to ALLOW+confined; the 5 hook writes stay refused.
- Guard-replay: 0 deltas between main and the branch over 41 fixture calls and 134098 real calls; every --scratch delta is the throwaway env.
- Tiers: lane.md and the hand tiers point throwaway copies at the root.
- Fails-before: prefail.md.
- MIGRATION.md has item 117.
- Real-lane smoke: Jo answered pass (in-mv61d90ikvbu2o).
- Disk management:
  - the cap line;
  - removal at close;
  - the daily sweep, serialized with claims;
  - the audit with per-item re-validated quarantine. The quarantine/delete itself is Jo's to run (msg-mv5x35uznp95a8).
- Code review: r3 passed (CODE-REVIEW-r3.md).
- Full suite green at the head: tr-0mv617cwji1dpp3, 4010 passed, 0 failed, 29 skipped.

Rendered from the ledger by Ilex (they/them) at workload close; stakes production, mode autonomous, opened 2026-10-12T20:02:50.393Z.

## What changed

- sl-plan-scratch: Plan: lane scratch roots (location, env var, row 6 allow rule, fence, tiers, size cap, close removal, daily sweep, one-time audit), slice cut, cross-lab review — artifact: Jo approved q-mv5ra4hwn2abr4 (in-mv5rgfrvuwuebk); plan /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/PLAN.md rev 4; review pass openai-codex/gpt-6-astra /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/PLAN-REVIEW-r4.md
- sl-scratch-contract: gates/src/scratch.ts: SCRATCH_ENV, scratchBase, scratchRootFor, ownScratchRoot, insideRoot (physical), scratchSpelling (textual), entry prefixes; unit tests — artifact: bun test gates/test/scratch.test.ts → 27 pass 0 fail; /Users/jowolff/code/agent-system-2.0-lanes/wl-mv5oikd5jtquww/gates/src/scratch.ts
- sl-scratch-gate: Row 6 scratch rules 1-4 and 6, rows 8/9 skips, confined marker, confined fence profile with fail-closed, guard-replay --scratch; regression tests incl. replay fixture and escape cases — artifact: bun test gates/test/scratch-root.test.ts gates/test/scratch.test.ts gates/test/guard-replay.test.ts → 97 pass 0 fail. bun test gates/test → 2530 pass / 33 fail, all in-fence sandbox_apply (fence.test, scratch-fence behaviour, probe-suite C0) + manifest-sync (docs slice); scratch-fence behaviour tests confirmed on the runner at the PR.
- sl-scratch-surface: laneEnv AS2_SCRATCH + mkdir + prompt line, advisory cap measure with scratch needs-you kind, root removal at workload close — artifact: bun test surface/test/scratch-surface.test.ts surface/test/lane-tools.test.ts surface/test/launch.test.ts surface/test/lane.test.ts surface/test/render.test.ts surface/test/extension.test.ts → 182 pass 0 fail; hand also ran 12 covering files 159/0. lane-script/lane-smoke left to the runner (fence EPERM ps).
- sl-scratch-sweep: Daily scratch sweep script, launchd plist 04:30, install.sh --scratch-sweep flag, fresh-machine-test step; tests on fake HOME — artifact: bun test surface/test/scratch-sweep.test.ts → 9 pass 0 fail; bash -n install.sh / fresh-machine-test.sh exit 0; plutil -lint plist OK (hand report). fresh-machine-test step 14 runs on the runner after manifest rows land (sl-scratch-docs).
- sl-scratch-audit: One-time leftovers audit script (report/quarantine/restore/delete) with test; lane runs report and writes the audit file — artifact: bun test surface/test/scratch-audit.test.ts → 5 pass 0 fail; real report /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/audit/report.md (257 items, 3184.8 MiB; 152 candidates 1294.5 MiB) + candidates.json
- sl-scratch-docs: Tiers point throwaway copies at $AS2_SCRATCH (lane + hand tiers), MIGRATION.md item, install/manifest.tsv rows for new files — artifact: bun test tiers/test gates/test/manifest-sync.test.ts classifier/test/tier-files.test.ts → 20 pass 0 fail; MIGRATION.md item 117 (open PRs claim up to 116); tiers/lane.md + four hand tiers; 11 manifest rows.
- sl-scratch-prefail: Run the new regression tests on an unpacked origin/main copy: behavior tests fail on assertions, new-script tests reported absent — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/prefail.md: on origin/main copy every new behaviour test fails (scratch-surface 1/11 assertion+TypeError, lane-tools 52/1 assertion, scratch-sweep/audit absent scripts); after e554999 scratch-root 1/28 and scratch-fence 0/11 load on main and fail per test (gate hand rerun, msg in transcript); worktree: 29/0, 5/0+6 sandbox_apply in-fence, 12/0, 9/0, 5/0, 53/0.
- sl-scratch-replay: guard-replay old vs new over the corpus, unbound and --scratch: deltas listed; table of tonight's held commands main vs branch — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/replay.md. (1) main 7655317 vs branch a982df0: 0 deltas on the fixture (41 calls) and the real corpus (134098 calls). (2) --scratch: the fixture shows only the known line-32 r10 LOST plus one reason-text change. The real corpus has 131 verdict and 114 reason deltas, and main's rows reproduce all of them under the same env with 0 disagreements, so all are expected. (3) all 9 held allow entries go from REFUSE on main to ALLOW+confined on the branch; all 5 hook entries stay REFUSE. 2 minor findings.
- sl-scratch-review: Production cross-lab review of the whole diff, findings only — artifact: Round 3 (sl-scratch-review-3, deep, same-lab by Jo's q-mv5yi0vdk8il8g) PASSED. Report: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/CODE-REVIEW-r3.md. Both r2 majors are resolved and the review found no regressions. Its one minor finding, "surface/extensions/lane.ts imports ensureScratchRoot from the launcher script", is fixed in 59c553d: the helper moved to surface/src/scratch-root.ts. Rounds: r1 FAIL 4 (fixed 2612ff6), r2 FAIL 2 major (fixed 7404802), r3 PASS.
- sl-scratch-smoke: Real omp lane session does init/clone/commit/push by path/checkout --/branch -d/rm -rf in AS2_SCRATCH with no hold; same script against origin/main gates shows refusals — artifact: Jo answered `pass` to q-mv5u6bppxtju2o (in-mv61d90ikvbu2o, 2026-10-13T02:02:37Z). The smoke test ran from a plain terminal: surface/scripts/scratch-smoke.ts PASSED on the branch, and with --ref origin/main it FAILED with refusals. The PASS is a real lane that creates, pushes to and deletes a probe repo in its scratch root with no hold. smoke-handover.log was not written, so Jo probably ran the bun commands directly rather than run-smoke.zsh; the receipt is Jo's answer.
- sl-scratch-pr: Rebase on origin/main, declared artifact on final tree, push, open PR, lane_full_test — artifact: PR https://github.com/thewolff/agent-system-2.0/pull/107 at a982df0; declared artifact 211 pass 0 fail on clean tree; full suite tr-0mv5we4wfqussbh green 3987/0/29 (scratch-fence 11/0 outside the fence).
- sl-scratch-fix-r1: Fix code-review r1 findings R1–R4: identity-anchored rename-then-delete for close/sweep/audit, sweep re-reads ownership before removal, audit recency over descendants, quarantine re-validates identity/recency/workload state — artifact: bun test surface/test/scratch-sweep.test.ts surface/test/scratch-audit.test.ts surface/test/scratch-surface.test.ts surface/test/scratch-remove.test.ts gates/test/manifest-sync.test.ts surface/test/close-entry.test.ts → 49 pass 0 fail; hand showed R1–R4 regressions failing before (13 pass / 7 fail).
- sl-full-mv5oikd5jtquww-1: full suite outside the fence at PR #107 — artifact: test-run tr-0mv5we4wfqussbh: green at a982df0edd759bba23e35878c4c735b2b99f7d53 on PR #107; full 3987/0/29; alone: ./gates/test/scratch-fence.test.ts 11/0, ./gates/test/scratch-root.test.ts 29/0, ./gates/test/scratch.test.ts 27/0, ./surface/test/lane-tools.test.ts 53/0, ./surface/test/scratch-audit.test.ts 10/0, ./surface/test/scratch-remove.test.ts 5/0, ./surface/test/scratch-surface.test.ts 12/0, ./surface/test/scratch-sweep.test.ts 10/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv5we4wfqussbh
- sl-scratch-fix-r2: Fix review r2 majors: sweep reread+rename serialized with workload claims via a ledger BEGIN IMMEDIATE; quarantine re-validates each candidate right before an identity-checked rename and refuses cross-device moves; guard-replay --scratch header note; MIGRATION 117 — artifact: Commit 7404802. The declared 7-file suite: 95 pass, 0 fail. Before the fix the hand showed the new regressions failing: the sweep test received "the claim ran: won" where it expected SQLITE_BUSY; quarantine moved the replaced and the edited candidates; and the extension's won claim found no root (ENOENT). An extra run of 14 lane and extension test files: 257 pass. One residual, accepted: lane.ts's runner renewal after a lapsed lease does not re-create the root. The extension re-creates it on its next claim, and the gates fail closed until then.
- sl-full-mv5oikd5jtquww-2: full suite outside the fence at PR #107 — artifact: test-run tr-0mv5yi1bznbj6cf: green at 5b503149c594e1e80832168968b1cbf11a78f3a9 on PR #107; full 4005/0/29; alone: ./gates/test/scratch-fence.test.ts 11/0, ./gates/test/scratch-root.test.ts 29/0, ./gates/test/scratch.test.ts 27/0, ./surface/test/lane-tools.test.ts 53/0, ./surface/test/scratch-audit.test.ts 12/0, ./surface/test/scratch-remove.test.ts 6/0, ./surface/test/scratch-surface.test.ts 13/0, ./surface/test/scratch-sweep.test.ts 11/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv5yi1bznbj6cf
- sl-full-mv5oikd5jtquww-3: full suite outside the fence at PR #107 — artifact: test-run tr-0mv617cwji1dpp3: green at a43e8f948583e7366091881066c63b6471773d8a on PR #107; full 4010/0/29; alone: ./gates/test/scratch-fence.test.ts 11/0, ./gates/test/scratch-root.test.ts 29/0, ./gates/test/scratch.test.ts 27/0, ./surface/test/lane-tools.test.ts 53/0, ./surface/test/scratch-audit.test.ts 12/0, ./surface/test/scratch-remove.test.ts 6/0, ./surface/test/scratch-surface.test.ts 13/0, ./surface/test/scratch-sweep.test.ts 11/0; /Users/jowolff/.agent-system-2/test-runs/tr-0mv617cwji1dpp3

## Decisions made (and why)

- jo (surface): Jo: "will there be a process to make sure that the lane owned scratch folders are regularly audited and cleaned up? i dont have unlimited disc space" — reading: Disk use is in scope: lane scratch roots must be regularly audited and cleaned, not only removed at workload close. Add (1) a per-lane size cap that the lane is told about and that surfaces when exceeded; (2) removal of a workload's scratch root when it closes; (3) a scheduled sweep (daily, installed like the chaos nightly) that removes scratch roots of closed or deleted workloads and orphans from dead lanes, reports total size per root, and raises one needs-you line when the total passes a stated threshold; (4) a one-time audit of today's leftovers (/tmp/wl-*, /tmp/quorum-legs-*, /private/tmp lane copies, lane worktrees of closed workloads under /Users/jowolff/code/agent-system-2.0-lanes, ~/.agent-system-2/test-runs) with sizes, and a reversible quarantine-then-delete step Jo confirms (never a silent delete outside the scratch roots).
- jo answered "approve" to q-mv5ra4hwn2abr4 (/Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/PLAN.md
- sl-scratch-contract: gates/src/scratch.ts: root per workload under ~/agent-scratch/agent-system-2.0/scratch, AS2_SCRATCH, inside-root checks
- sl-scratch-gate: row 6 scratch rules (rm -rf, git checkout--/branch -d/init/clone, push by path), rows 8/9 skips, confined fence profile
- sl-scratch-surface: laneEnv + mkdir + prompt line, advisory per-lane cap with needs-you line, root removed at workload close
- sl-scratch-sweep: daily launchd sweep (closed/deleted/orphan roots), size report, one needs-you line past a total threshold
- sl-scratch-audit: audit script for today's leftovers with sizes; quarantine/restore/delete commands Jo runs
- sl-scratch-docs: tiers point throwaway copies at $AS2_SCRATCH, MIGRATION.md item, manifest rows
- sl-scratch-prefail: new tests run on an unpacked origin/main copy and fail there
- sl-scratch-replay: guard-replay deltas old vs new, plus tonight's held commands main vs branch
- sl-scratch-smoke: real lane session does the repo lifecycle in scratch: all calls succeed, end state checked, no holds
- sl-scratch-review: production cross-lab code review of the whole diff
- sl-scratch-pr: rebase, push, PR, full suite green on the runner
tradeoff: scratch-rule calls run confined (writes only in own root, no network, refused if fence off); mixed calls fail, so keep housekeeping separate
tradeoff: narrower than brief: .git writes and hooks stay refused in scratch, so pre-push-hook probes and the SEO quorum mktemp hold stay held
tradeoff: cap only alerts (your "surfaces when exceeded"); sweep deletes an unheld open root after 3 idle days; nothing else deleted silently
review: pass, openai-codex/gpt-6-astra, /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/PLAN-REVIEW-r4.md)
- jo answered "same-lab" to q-mv5u2zwymom77k (No lab other than the builder's (anthropic, openai) can review sl-scratch-replay: anthropic/claude-fable-5-1 (builder lab anthropic), openai-codex/gpt-6-astra (builder lab openai). **same-lab**: run this one review on anthropic, openai, the builder's labs. **wait**: hold the review until another lab is back; the lane retries later and asks again if it is still down.)
- jo answered "same-lab" to q-mv5u3hchtadm9s (No lab other than the builder's (anthropic, openai) can review sl-scratch-review: anthropic/claude-fable-5-1 (builder lab anthropic), openai-codex/gpt-6-astra (builder lab openai). **same-lab**: run this one review on anthropic, openai, the builder's labs. **wait**: hold the review until another lab is back; the lane retries later and asks again if it is still down.)
- jo answered "same-lab" to q-mv5yi0vdk8il8g (No lab other than the builder's (anthropic, openai) can review sl-scratch-review: anthropic/claude-fable-5-1 (builder lab anthropic), openai-codex/gpt-6-sol (builder lab openai). **same-lab**: run this one review on anthropic, openai, the builder's labs. **wait**: hold the review until another lab is back; the lane retries later and asks again if it is still down.)
- jo answered "pass" to q-mv5u6bppxtju2o (The real-lane proof cannot run inside a lane, because the OS fence cannot nest (sandbox_apply, exit 71). From a plain terminal, please run:
(1) bun /Users/jowolff/code/agent-system-2.0-lanes/wl-mv5oikd5jtquww/surface/scripts/scratch-smoke.ts — expected: exit 0, PASS.
(2) the same command with --ref origin/main — expected: exit 1, FAIL, listing P-11 row 6 refusals and reserved-request entries.
Each run uses a throwaway HOME and ledger under ~/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/smoke/. It touches nothing live, and it deletes its run directory on PASS.
Answer `pass` if (1) passed and (2) failed. Otherwise answer `fail` and paste the log path.)
- assumption (lane-mv5oikd5jtquww-1): builder-lab: anthropic lane lane-mv5oikd5jtquww-1 model anthropic/claude-opus-5-5
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-group: sl-plan-scratch group fg-mv5purfb0e764152 members dt-mv5purfc56c2b0c9,dt-mv5purfcfc7b92b3
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5purfc56c2b0c9 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--openai review yes group fg-mv5purfb0e764152 row openai-codex/gpt-6-astra
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5purfcfc7b92b3 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--kimi review yes group fg-mv5purfb0e764152 row moonshot/kimi-k3
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5purfc56c2b0c9 routing rt-mv5q3fts1guhhc
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 1 token dt-mv5purfc56c2b0c9 group fg-mv5purfb0e764152 verdict accepted blocking 5 counts {"counts":{"blocking":{"security":3,"correctness":1,"tests":1},"major":{"correctness":1},"minor":{"design":1}},"titles":[{"severity":"blocking","kind":"security","title":"Temporary-directory write allowances permit same-call escape of newly exempted Git operations"},{"severity":"blocking","kind":"security","title":"Scratch hook execution confinement does not survive repository relocation"},{"severity":"blocking","kind":"security","title":"Scratch exemptions lack a required fence-enabled precondition"},{"severity":"blocking","kind":"correctness","title":"The per-lane disk cap is only an advisory alert threshold"},{"severity":"blocking","kind":"tests","title":"Replay acceptance explicitly excludes a held command covered by the done line"},{"severity":"major","kind":"correctness","title":"The prescribed AS2_SCRATCH Git spelling still hits the separate unmodeled-command gate"},{"severity":"minor","kind":"design","title":"Parallel surface, sweep and audit test-file ownership overlaps"}]}
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5purfcfc7b92b3 routing rt-mv5qlq86f930cg
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 1 token dt-mv5purfcfc7b92b3 group fg-mv5purfb0e764152 verdict accepted blocking unknown counts unknown
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-group: sl-plan-scratch group fg-mv5qowwx416debc3 members dt-mv5qowwx79f6ee15,dt-mv5qowwxd4133565
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5qowwx79f6ee15 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--openai-2 review yes group fg-mv5qowwx416debc3 row openai-codex/gpt-6-astra
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5qowwxd4133565 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--kimi-2 review yes group fg-mv5qowwx416debc3 row moonshot/kimi-k3
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5qowwxd4133565 routing rt-mv5qpaxplzooao
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 2 token dt-mv5qowwxd4133565 group fg-mv5qowwx416debc3 verdict failed-dispatch blocking unknown counts unknown
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5qowwx79f6ee15 routing rt-mv5qtn1m7xh9mo
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 2 token dt-mv5qowwx79f6ee15 group fg-mv5qowwx416debc3 verdict accepted blocking 1 counts {"counts":{"blocking":{"security":1},"major":{},"minor":{}},"titles":[{"severity":"blocking","kind":"security","title":"A confined rule-5 hook can install a persistent hook that executes on a later ordinary, non-confined Git call"}]}
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-group: sl-plan-scratch group fg-mv5qvmaedca3bdba members dt-mv5qvmaf8fa091ec,dt-mv5qvmaf8ba91b54
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5qvmaf8fa091ec session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--openai-3 review yes group fg-mv5qvmaedca3bdba row openai-codex/gpt-6-astra
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5qvmaf8ba91b54 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--kimi-3 review yes group fg-mv5qvmaedca3bdba row moonshot/kimi-k3
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5qvmaf8ba91b54 routing rt-mv5qw02qa0zjeo
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 3 token dt-mv5qvmaf8ba91b54 group fg-mv5qvmaedca3bdba verdict failed-dispatch blocking unknown counts unknown
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5qvmaf8fa091ec routing rt-mv5r30a6evs6ps
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 3 token dt-mv5qvmaf8fa091ec group fg-mv5qvmaedca3bdba verdict accepted blocking 2 counts {"counts":{"blocking":{"security":1,"tests":1},"major":{},"minor":{}},"titles":[{"severity":"blocking","kind":"security","title":"Default receive hooks leave the persistent-hook escape open"},{"severity":"blocking","kind":"tests","title":"Smoke completion query does not prove successful execution or fail-before behavior"}]}
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-group: sl-plan-scratch group fg-mv5r6j4f436fbeca members dt-mv5r6j4f1e8ee0a6,dt-mv5r6j4f60a4817c
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5r6j4f1e8ee0a6 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--openai-4 review yes group fg-mv5r6j4f436fbeca row openai-codex/gpt-6-astra
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-spawn: dt-mv5r6j4f60a4817c session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-plan-scratch--kimi-4 review yes group fg-mv5r6j4f436fbeca row moonshot/kimi-k3
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5r6j4f60a4817c routing rt-mv5r6x5n77s5xc
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 4 token dt-mv5r6j4f60a4817c group fg-mv5r6j4f436fbeca verdict failed-dispatch blocking unknown counts unknown
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): hand-settled: dt-mv5r6j4f1e8ee0a6 routing rt-mv5r9ptso6yg3k
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-round: sl-plan-scratch round 4 token dt-mv5r6j4f1e8ee0a6 group fg-mv5r6j4f436fbeca verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{},"minor":{}},"titles":[]}
- assumption (lane-mv5oikd5jtquww-1, sl-plan-scratch): review-loop-end: sl-plan-scratch reason pass
- assumption (lane-mv5oikd5jtquww-2): builder-lab: anthropic lane lane-mv5oikd5jtquww-2 model anthropic/claude-opus-5-5
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-contract): hand-spawn: dt-mv5rhqyh36a50b33 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-contract review no group dg-mv5rhqyh550554b7 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol,moonshot/kimi-k2.7-code
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-contract): hand-settled: dt-mv5rhqyh36a50b33 routing rt-mv5rm9rhar62ps
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-contract): artifact-command: bun test gates/test/scratch.test.ts
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-gate): hand-spawn: dt-mv5ro11na48b5fb5 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-gate review no group dg-mv5ro11nfd685570 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-surface): hand-spawn: dt-mv5ro11neca158fe session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-surface review no group dg-mv5ro11nd92fa4e4 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-sweep): hand-spawn: dt-mv5ro11na066af5e session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-sweep review no group dg-mv5ro11n9dbd5080 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-audit): hand-spawn: dt-mv5ro11n47bfc25c session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-audit review no group dg-mv5ro11n9fca3d45 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-audit): hand-settled: dt-mv5ro11n47bfc25c routing rt-mv5rxzp8msfwu8
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-audit): artifact-command: bun test surface/test/scratch-audit.test.ts
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-surface): hand-settled: dt-mv5ro11neca158fe routing rt-mv5s5wgn876rk0
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-surface): Decisions on the surface hand's two questions:
- (1) Reserve the scratch-* entry prefixes in launch.ts so lanes cannot forge them, for example a `scratch-under-cap:` that would hide an over-cap line. Only the machinery writers may write them: the lane extension, the close, and the sweep. This is production stakes, and it costs one WRITERS row plus a lane-tools test.
- (2) Removal entries go on wl-orchestrator. The closed workload refuses inserts through the schema trigger entries_insert_workload, and the plan's "remove after the close commits" ordering is kept.
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-sweep): hand-settled: dt-mv5ro11na066af5e routing rt-mv5s6wnd7t0phc
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-sweep): artifact-command: bun test surface/test/scratch-sweep.test.ts
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-surface): artifact-command: bun test surface/test/scratch-surface.test.ts surface/test/lane-tools.test.ts surface/test/launch.test.ts surface/test/lane.test.ts surface/test/render.test.ts surface/test/extension.test.ts
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-gate): hand-settled: dt-mv5ro11na48b5fb5 routing rt-mv5solb26enrb4
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-gate): artifact-command: bun test gates/test/scratch-root.test.ts gates/test/scratch.test.ts gates/test/guard-replay.test.ts
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-docs): hand-spawn: dt-mv5sqq4p9ca34349 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-docs review no group dg-mv5sqq4pbd95b046 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-prefail): hand-spawn: dt-mv5ssex41454933d session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-prefail review no group dg-mv5ssex486f0c413 row anthropic/claude-sonnet-5-5,openai-codex/gpt-6-luna
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-smoke): hand-spawn: dt-mv5ssex46b28f90e session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-smoke review no group dg-mv5ssex48799e1d4 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-prefail): hand-settled: dt-mv5ssex41454933d routing rt-mv5sumthg72y2o
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-docs): hand-settled: dt-mv5sqq4p9ca34349 routing rt-mv5sw2f1g3v5ds
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-docs): artifact-command: bun test tiers/test gates/test/manifest-sync.test.ts classifier/test/tier-files.test.ts
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-smoke): hand-settled: dt-mv5ssex46b28f90e routing rt-mv5tbrv108zrwg
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-smoke): artifact-command: bun surface/scripts/scratch-smoke.ts --dry-run
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-replay): hand-spawn: dt-mv5tcoa4f1129455 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-replay review yes group dg-mv5tcoa45086943f row openai-codex/gpt-6-astra
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-review): hand-spawn: dt-mv5tcoa4fc5e8283 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-review review yes group dg-mv5tcoa4a1ce911d row openai-codex/gpt-6-astra
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-review): hand-settled: dt-mv5tcoa4fc5e8283 routing rt-mv5tnmypj3wwlc
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-review): review-round: sl-scratch-review round 1 token dt-mv5tcoa4fc5e8283 group dg-mv5tcoa4a1ce911d verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"security":1,"correctness":3},"minor":{}},"titles":[{"severity":"major","kind":"security","title":"Cleanup containment checks do not survive an ancestor replacement"},{"severity":"major","kind":"correctness","title":"Sweep can delete an open workload after a lane has claimed it"},{"severity":"major","kind":"correctness","title":"Audit treats an actively edited old directory as an idle candidate"},{"severity":"major","kind":"correctness","title":"Quarantine applies saved candidate decisions to changed or replaced paths"}]}
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-review): review-loop-end: sl-scratch-review reason pass
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-fix-r1): hand-spawn: dt-mv5towyi6a581884 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-fix-r1 review no group dg-mv5towyi22ef9e74 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-replay): review-withheld: dt-mv5tcoa4f1129455
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-replay): builder-lab: openai hand dt-mv5tcoa4f1129455 model openai-codex/gpt-6-astra
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-replay): hand-settled: dt-mv5tcoa4f1129455 routing rt-mv5tubggp6qdc0
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-replay): review-round: sl-scratch-replay round 1 token dt-mv5tcoa4f1129455 group dg-mv5tcoa45086943f verdict withheld blocking 0 counts {"counts":{"blocking":{},"major":{"tests":1},"minor":{}},"titles":[{"severity":"major","kind":"tests","title":"--scratch changes 131 real-corpus row verdicts beyond the stated fixture-only exception through replay-context rebinding"}]}
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-fix-r1): hand-settled: dt-mv5towyi6a581884 routing rt-mv5u21l48qci68
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-fix-r1): artifact-command: bun test surface/test/scratch-sweep.test.ts surface/test/scratch-audit.test.ts surface/test/scratch-surface.test.ts surface/test/scratch-remove.test.ts gates/test/manifest-sync.test.ts surface/test/close-entry.test.ts
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-replay): review-park: q-mv5u2zwymom77k slice sl-scratch-replay
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-review): review-park: q-mv5u3hchtadm9s slice sl-scratch-review
- assumption (lane-mv5oikd5jtquww-2, sl-scratch-pr): artifact-command: bun test gates/test/scratch-root.test.ts gates/test/scratch.test.ts gates/test/guard-replay.test.ts gates/test/manifest-sync.test.ts surface/test/scratch-sweep.test.ts surface/test/scratch-audit.test.ts surface/test/scratch-surface.test.ts surface/test/scratch-remove.test.ts surface/test/close-entry.test.ts surface/test/lane-tools.test.ts tiers/test
- assumption (lane-mv5oikd5jtquww-2): State at a982df0 (PR #107). The full suite is green (tr-0mv5we4wfqussbh). These slices are done: contract, audit, sweep, surface, gate, docs, prefail, fix-r1, pr. Three slices are paused on Jo's answers. sl-scratch-review r2 waits on q-mv5u3hchtadm9s; r1 found 4 majors, all fixed in 2612ff6. sl-scratch-replay waits on q-mv5u2zwymom77k. Both are blocked because no lab other than the builders is usable: Kimi is out of balance and openai built the r1 fix. sl-scratch-smoke waits on q-mv5u6bppxtju2o: the run has to happen in a plain terminal, and the dry run passes 25 of 25. After any review-driven push I re-run lane_full_test. The done-because receipt is written once the review passes and the smoke and replay are in.
- assumption (lane-mv5oikd5jtquww-3): builder-lab: anthropic lane lane-mv5oikd5jtquww-3 model anthropic/claude-opus-5-5
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-review): review-same-lab: in-mv5xa822jiemm8 token dt-mv5xba08ba31cffc
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-review): hand-spawn: dt-mv5xba08ba31cffc session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-review-2 review yes group dg-mv5xba08baeaacc0 row anthropic/claude-fable-5-1,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-replay): review-same-lab: in-mv5xa821j27oxs token dt-mv5xba082a5563d2
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-replay): hand-spawn: dt-mv5xba082a5563d2 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-replay-2 review yes group dg-mv5xba082fb771b2 row anthropic/claude-fable-5-1,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-review): hand-settled: dt-mv5xba08ba31cffc routing rt-mv5xtf5c8nulmo
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-review): review-round: sl-scratch-review round 1 token dt-mv5xba08ba31cffc group dg-mv5xba08baeaacc0 verdict accepted blocking 0 counts {"counts":{"blocking":{},"major":{"correctness":2},"minor":{}},"titles":[{"severity":"major","kind":"correctness","title":"Sweep can still remove a live lane's scratch root after the ownership reread"},{"severity":"major","kind":"correctness","title":"Quarantine can move or delete a candidate that changed after preliminary validation"}]}
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-review): review-loop-end: sl-scratch-review reason pass
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-replay): hand-settled: dt-mv5xba082a5563d2 routing rt-mv5xwdoih7qcqo
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-replay): review-round: sl-scratch-replay round 2 token dt-mv5xba082a5563d2 group dg-mv5xba082fb771b2 verdict accepted blocking unknown counts unknown
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-fix-r2): hand-spawn: dt-mv5xye3g4c0c3ebd session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-fix-r2 review no group dg-mv5xye3gb491cc01 row anthropic/claude-opus-5-5,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-fix-r2): hand-settled: dt-mv5xye3g4c0c3ebd routing rt-mv5ygdxk86flds
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-fix-r2): artifact-command: bun test surface/test/scratch-sweep.test.ts surface/test/scratch-audit.test.ts surface/test/scratch-remove.test.ts surface/test/scratch-surface.test.ts surface/test/close-entry.test.ts gates/test/guard-replay.test.ts gates/test/manifest-sync.test.ts
- assumption (lane-mv5oikd5jtquww-3, sl-scratch-review): review-park: q-mv5yi0vdk8il8g slice sl-scratch-review
- assumption (lane-mv5oikd5jtquww-3): State at 5b50314 (PR #107):
- Full suite green: tr-0mv5yi1bznbj6cf, 4005 passed, 0 failed.
- sl-scratch-replay done (replay.md): 0 main/branch deltas; every --scratch delta expected; the 9 held commands go REFUSE→ALLOW+confined; the 5 hook commands stay refused.
- Review r2 (CODE-REVIEW-r2.md) found 2 majors, fixed in 7404802 with regressions that failed before the fix.
- Open:
  - sl-scratch-review round 3, parked on q-mv5yi0vdk8il8g (same-lab/wait).
  - sl-scratch-smoke, paused on q-mv5u6bppxtju2o (Jo's plain-terminal run).
- Accepted residual: the runner's own lease renewal in surface/scripts/lane.ts does not re-create the root. The extension does it on its next claim; the gates fail closed until then.
- Unfixed replay minors: no test for guard-replay --scratch; the header note is now added.
- assumption (lane-mv5oikd5jtquww-4): builder-lab: anthropic lane lane-mv5oikd5jtquww-4 model anthropic/claude-opus-5-5
- assumption (lane-mv5oikd5jtquww-4, sl-scratch-review): review-same-lab: in-mv60u8w4bj7wn4 token dt-mv60uncaf0c6bb41
- assumption (lane-mv5oikd5jtquww-4, sl-scratch-review): hand-spawn: dt-mv60uncaf0c6bb41 session /Users/jowolff/.agent-system-2/lanes/wl-mv5oikd5jtquww/sessions/2026-10-12T20-30-11-689Z_01a131ce-fee9-7000-bde4-ce752b11c156 spawn sl-scratch-review-3 review yes group dg-mv60uncaf1147d1c row anthropic/claude-fable-5-1,openai-codex/gpt-6-sol
- assumption (lane-mv5oikd5jtquww-4, sl-scratch-review): hand-settled: dt-mv60uncaf0c6bb41 routing rt-mv614ot0rzb2tc
- assumption (lane-mv5oikd5jtquww-4, sl-scratch-review): review-round: sl-scratch-review round 1 token dt-mv60uncaf0c6bb41 group dg-mv60uncaf1147d1c verdict accepted blocking unknown counts unknown

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mv5puvx6wlq03k [delivered] not acted on: Coordination for wl-mv5lrh0drbg0zk (clean shell: fence and bash env): this workload (lane scratch roots) adds one variable, AS2_SCRATCH=<HOME>/agent-scratch/agent-system-2.0/scratch/<workload id>, to the lane process env via surface/src/launch.ts laneEnv, and every lane and hand bash call must inherit it. If the clean-shell build strips the bash env to an allowlist, AS2_SCRATCH needs to be on it. Shared files with that workload: gates/src/fence.ts (this plan adds a confined profile for scratch-only housekeeping calls and a hook-exec deny under the scratch base). Plan: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/PLAN.md § 4; merge order green-first, each PR rebases on main before pushing.
- message msg-mv5qw2qnbbzdvk [delivered] not acted on: Kimi (moonshot/kimi-k3) is unusable: each dispatch fails with 429 "account suspended due to insufficient balance". Two review dispatches have failed this way: sl-plan-scratch--kimi-2 and --kimi-3. Production plan reviews of wl-mv5oikd5jtquww are therefore running on openai only until the balance is topped up.
- message msg-mv5r63g16mwz5s [delivered] not acted on: This is a finding for Jo about a gap that already exists, separate from this workload. On main 857bca0, row 6 detects writes into git directories only when a path component is named `.git`. A lane can therefore plant a hook that a later ordinary git call runs, and every row allows all three calls (lane context, real repos in /tmp):
1. `git init --separate-git-dir=/tmp/x/gd /tmp/x/wt`
2. `printf … > /tmp/x/gd/hooks/pre-commit && chmod +x …`
3. `cd /tmp/x/wt && git commit`
A bare repo's `hooks/pre-receive` and a write-tool call into gd/hooks are allowed the same way. Receipt: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/probe-hooks.ts, with the output in PLAN-REVIEW-r3.md beside it. The scratch plan neither opens nor closes this gap. Closing it means detecting gitdirs by their content rather than their name, which is a separate production gate change. I suggest opening a workload for it.
- message msg-mv5u3njubcy4n4 [delivered] not acted on: wl-mv5oikd5jtquww: both remaining reviews are parked with no usable off-builder lab. Kimi is still 429 (balance), and openai is now a builder lab because the r1 fix hand (sl-scratch-fix-r1) ran there. The parked questions are q-mv5u3hchtadm9s (code review round 2 of sl-scratch-review) and q-mv5u2zwymom77k (sl-scratch-replay guard-replay report). Round 1 (openai, CODE-REVIEW-r1.md) found 4 majors in deletion safety. All 4 are fixed in 2612ff6, and each has a regression test that failed before the fix. My recommendation is `wait` if Kimi gets topped up soon, otherwise `same-lab`. Meanwhile I am pushing the branch, opening the PR and running the full suite. The smoke proof still needs Jo to run it from a plain terminal; I will send that command separately.
- message msg-mv5vs8q0qb26f4 [delivered] not acted on: Full-suite run tr-0mv5u5oy4p7ztpn for PR #107 (wl-mv5oikd5jtquww, started 22:40Z) has not run in 46 minutes. Its runner.log is empty and its heartbeat is still alive. The runs.db lock has gone to runs that started after it: tr-0mv5uasc2ostkg2, then tr-0mv5tyz7bj420e0, now tr-0mv5uw0rkokg7ld. Lock acquisition looks non-FIFO and can starve a waiting run. This lane keeps waiting; flagged as a runner defect for Jo.
- message msg-mv5x35uznp95a8 [delivered] not acted on: wl-mv5oikd5jtquww, PR #107: the full suite is green at a982df0 (tr-0mv5we4wfqussbh, 3987 passed, 0 failed). That run includes the 6 fence behaviour tests that cannot run inside the fence.

Three things wait on Jo:
(a) Review round 2 (q-mv5u3hchtadm9s) and the guard-replay report (q-mv5u2zwymom77k) need `same-lab` or `wait`.
(b) The smoke run needs a plain terminal (q-mv5u6bppxtju2o).
(c) The one-time disk audit is Jo's to confirm. The report is regenerated in the v2 format and quarantine refuses the old one: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/audit/report.md. It covers 280 items: 154 candidates (1294.5 MiB) and 126 kept.

Proposed commands for (c), from a plain terminal in /Users/jowolff/code/agent-system-2.0-lanes/wl-mv5oikd5jtquww:
1. Preview: `bun surface/scripts/scratch-audit.ts quarantine /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/audit/candidates.json`
2. Move: the same command with `--yes`. It prints a stamp.
3. Then `bun surface/scripts/scratch-audit.ts delete <stamp> --yes` to delete, or `restore <stamp> --yes` to undo.

Also: the three failed in-fence smoke run directories (about 153 MB) under .../wl-mv5oikd5jtquww/smoke/run-* can be removed.
- message msg-mv5yi5rvnjg7i8 [delivered] not acted on: wl-mv5oikd5jtquww, PR #107 at 5b50314:
- Review round 2 (same-lab, CODE-REVIEW-r2.md) found 2 majors. Both are fixed in 7404802, each with a regression test that failed before the fix.
  - The sweep now re-reads the workload and moves the root aside in one ledger write transaction, so it cannot interleave with a claim.
  - Quarantine re-checks each candidate just before an identity-checked rename, and no longer copies across filesystems.
- origin/main is merged in. The only conflict was additive, in MIGRATION.md: item 110 is kept and placed before 117.
- The guard-replay report is done (replay.md). It shows 0 deltas between main and the branch; all 9 held commands go from REFUSE to ALLOW+confined, and all 5 hook commands stay refused.
- The full suite is running (tr-0mv5yi1bznbj6cf).
- Review round 3 is parked on q-mv5yi0vdk8il8g (same-lab or wait). Kimi is still out of balance. I recommend same-lab.
- The smoke test still needs your plain-terminal run (q-mv5u6bppxtju2o).
- message msg-mv627y31c7rvnk [held] not acted on: wl-mv5oikd5jtquww is done, receipt en-mv627vap7btt6o.
- PR #107 is ready for you to merge (merge commit). Head a43e8f9: the full suite passes (tr-0mv617cwji1dpp3, 4010 passed, 0 failed), code review round 3 passed (CODE-REVIEW-r3.md), and the smoke test passed on your answer.
- Still yours: the one-time audit quarantine/delete. The commands are in msg-mv5x35uznp95a8.
- The PR shares files with open PRs #100, #98, #97, #79, #75 and #73. Whichever you merge second will need to merge main in again.
- reserved request en-mv5s36cjp8gmww: rm with an argument not known until it runs (it could be -rf): bash /private/tmp/sl-scratch-sweep-fake-launchctl-probe.sh (P-11 row 6 refused tool call toolu_011vidGCM6iTE4mX2SNfhmPK) — closed: lane-mv5oikd5jtquww-2 stopped holding the workload
- reserved request en-mv5s3ibwnu7pq8: bun with a subcommand or target not known until it runs: bun test surface/test/scratch-surface.test.ts 2>&1 | tail -6; for f in launch lane render extension close-entry close-fresh wake-close lane-tools delivery numbering; do printf "%s: " $f; bun test surface/test/$f.test.ts 2>&1 | grep -E "^ *[0-9]+ (pass|fail)|^Ran" | tr '\n' ' '; echo; done (P-11 row 6 refused tool call toolu_01JPdZYbyg5PEMjj3z9SuimB) — closed: lane-mv5oikd5jtquww-2 stopped holding the workload
- reserved request en-mv5s4qnud6zgg0: rm with an argument not known until it runs (it could be -rf): for a in "--bogus" "--scratch-sweep=on" "--scratch-sweep --scratch-sweep" "--scratch-sweep --chaos-nightly=off" "--scratch-sweep=off --chaos-nightly"; do env -i PATH=/usr/bin:/bin HOME=/nonexistent-sweep-home bash install/install.sh $a; echo "[$a] exit=$?"; done (P-11 row 6 refused tool call toolu_01Xfnfj22SVDczhz5p6PRK71) — closed: lane-mv5oikd5jtquww-2 stopped holding the workload
- reserved request en-mv5s7l6vf81wqo: rm -rf (recursive force-delete): eval: const W = "/Users/jowolff/code/agent-system-2.0-lanes/wl-mv5oikd5jtquww/gates/src/";
const { checkToolCall } = await import(W + "gates.ts");
const { isConfined } = await import(W + "session.ts");
const fs = await import("node:fs"); const os = await import("node:os"); const path = await import("node:path");
const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "scr-")));
const root = path.join(home, "agent-scratch/agent-system-2.0/scratch/wl-abc");
fs.mkdirSync(root, { recursive: true });
const env = { HOME: home, PATH: process.env.PATH, AGENT_SYSTEM_WORKLOAD_ID: "wl-abc", AS2_SCRATCH: root };
let n = 0;
const run = (command, role = "lane") => { const call = { toolName: "bash", toolCallId: `t${++n}`, input: { command } }; const r = checkToolCall(call, { role, cwd: home, env, mode: null }, { workload: null, wake: null, testRecords: null }); return [r ? r.reason.slice(0, 160) : "ALLOW", isConfined(call.toolCallId)]; };
for (const c of [`rm -rf "$AS2_SCRATCH/pp"`, `rm -rf $AS2_SCRATCH`, `rm -rf "$AS2_SCRATCH/../x"`, `mkdir -p "$AS2_SCRATCH/pp" && cd "$AS2_SCRATCH/pp" && git init -q --bare -b main o.git && git clone -q o.git c1 && cd c1 && echo a > f && git add f && git -c user.name=A -c user.email=a@a commit -q -m base && git push -q "$AS2_SCRATCH/pp/o.git" main`, `git -C "$AS2_SCRATCH/pp/c1" checkout -- f`, `git push origin main`, `for AS2_SCRATCH in /etc; do rm -rf "$AS2_SCRATCH/x"; done`]) console.log(c, "=>", run(c));
console.log("orch", run(`rm -rf "$AS2_SCRATCH/pp"`, "orchestrator")); (P-11 row 6 refused tool call toolu_01GHxuAbAnP8nqboCftqaFNg) — closed: lane-mv5oikd5jtquww-2 stopped holding the workload
- reserved request en-mv5srlv041g64g: gh with a subcommand or target not known until it runs: for n in 106 105 104 103 102 101 100 98 96 95 94 92 91 79 76 75 74 73 72 70 68; do nums=$(gh pr diff $n 2>/dev/null | awk '/^diff --git/{f=($0 ~ /MIGRATION\.md/)} f && /^\+[0-9]+\. /{sub(/^\+/,""); split($0,a,"."); printf "%s ", a[1]}'); echo "$n: $nums"; done (P-11 row 6 refused tool call toolu_01SvnsaJkPwW7bBinnjUErnv) — closed: lane-mv5oikd5jtquww-2 stopped holding the workload
- reserved request en-mv5ssh3cfhh9mo: rm -rf (recursive force-delete): W=/Users/jowolff/code/agent-system-2.0-lanes/wl-mv5oikd5jtquww; D=/tmp/wl-mv5oikd5jtquww-prefail; rm -rf $D; mkdir -p $D && git -C $W archive origin/main | tar -x -C $D && cd $W && for f in gates/test/scratch-root.test.ts gates/test/scratch-fence.test.ts gates/test/fixtures/scratch-replay.json surface/test/scratch-surface.test.ts surface/test/scratch-sweep.test.ts surface/test/scratch-audit.test.ts surface/test/lane-tools.test.ts gates/src/scratch.ts gates/test/scratch.test.ts; do mkdir -p $D/$(dirname $f); cp $f $D/$f; done; ls $D $D/gates $D/surface | head -50; git -C $W status --short | head -30 (P-11 row 6 refused tool call toolu_01SrDEwvXkv58L1eY63Bd9sn) — closed: lane-mv5oikd5jtquww-2 stopped holding the workload
- reserved request en-mv5ssqq02aoiyo: bun with a subcommand or target not known until it runs: cd /tmp/wl-mv5oikd5jtquww-prefail && for f in gates/test/scratch-root.test.ts gates/test/scratch-fence.test.ts surface/test/scratch-surface.test.ts surface/test/scratch-sweep.test.ts surface/test/scratch-audit.test.ts surface/test/lane-tools.test.ts gates/test/scratch.test.ts; do echo "=== $f"; (cd ${f%%/*} && timeout 280 bun test ${f#*/} > /tmp/wl-mv5oikd5jtquww-prefail/out-$(basename $f).txt 2>&1; echo exit $?; grep -E "^\s*[0-9]+ (pass|fail)|^error:|Cannot find|^\(fail\)" /tmp/wl-mv5oikd5jtquww-prefail/out-$(basename $f).txt | head -40); done (P-11 row 6 refused tool call toolu_01SWzRCiEi69R3BH7DCU3eZY) — closed: lane-mv5oikd5jtquww-2 stopped holding the workload
- reserved request en-mv5swiaksixe68: rm -rf (recursive force-delete): cat >> /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv5oikd5jtquww/prefail.md <<'EOF'

## Rerun after commit e554999 (namespace imports in the two gates test files; sl-scratch-gate hand)

- origin/main copy + gates/src/scratch.ts + fixture: `bun test gates/test/scratch-root.test.ts` → 1 pass, 28 fail, no load error (27 `session.isConfined is not a function`, 1 assertion; the pass is the fixture id-list check).
- `bun test gates/test/scratch-fence.test.ts` → 0 pass, 11 fail, no load error (8 `checkReserved(...)` toBeNull assertions — main refuses `rm -rf "$AS2_SCRATCH/pp"` — 1 profile-text assertion, 2 TypeErrors).
- worktree: scratch-root 29/0; scratch-fence 5 pass + 6 in-fence sandbox_apply (runner-only).
EOF (P-11 row 6 refused tool call toolu_01BUkLMBRuPr44nazEfsGDNJ) — withdrawn by lane-mv5oikd5jtquww-2: heredoc text quoting rm -rf, not a delete; note written with the edit tool instead
- reserved request en-mv5xkwn4xgjf9c: bun with a subcommand or target not known until it runs: cd /tmp/wl-mv5oikd5jtquww-replay-main && cat > summarize.ts <<'EOF'
// throwaway: per-row verdict counts of a guard-replay --json file, and a keyed map for diffs
import { readFileSync } from "node:fs";
const f = process.argv[2]!;
const rows: Record<string, Record<string, number>> = {};
const tot: Record<string, number> = {};
let n = 0;
for (const l of readFileSync(f, "utf8").split("\n")) {
  if (!l) continue; n++;
  const o = JSON.parse(l);
  for (const oc of o.outcomes) {
    tot[oc.kind] = (tot[oc.kind] ?? 0) + 1;
    if (oc.row) { rows[oc.row] ??= {}; rows[oc.row][oc.kind] = (rows[oc.row][oc.kind] ?? 0) + 1; }
  }
}
console.log(f, "calls", n, JSON.stringify(tot));
for (const r of Object.keys(rows).sort()) console.log("  ", r.padEnd(24), JSON.stringify(rows[r]));
EOF
for f in out-main-real.jsonl out-branch-real.jsonl; do bun summarize.ts $f; done (P-11 row 6 refused tool call toolu_01PYNey3vkdW8Zm9DZvmbYdQ) — closed: lane-mv5oikd5jtquww-3 stopped holding the workload
