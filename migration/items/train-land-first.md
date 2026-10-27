---
title: Fast PR checks gate merges while the full suite verifies main after landing
status: building
workload: wl-mvq4edbaf13vnk
pr: 369
---

**Purpose.** Land-first changes the merge train from repeated full-suite PR checks to a small hosted check before merge and a full Mac suite on main after landing. This item records the operator contract and its activation sequence.

## Fast PR check and full main check

For each PR head with current main merged in, the runner computes the transitive fast set: tests importing changed files, tests that name changed files, tests importing those tests' changed dependencies, and the configured smoke files. Changed TypeScript/JavaScript files are transpiled without execution. The hosted fast check runs on GitHub-hosted Ubuntu; all selected Linux tests must execute. `as2/full-suite` remains the same strict required status, must be on an up-to-date head, and is posted only by the runner. A fast green is not a full-suite result.

After each landing the runner runs the full suite on Mac main, coalescing requests to the newest main commit. The verdict is immutable per commit: green, red, or implausible; inconclusive attempts are bounded. Landing stops when main is red or unknown, or too many commits are ahead of the last verified green. One loud incident names the suspect landings since that green and the evidence, then directs recovery. Landing resumes only after a green believable main or a designated repair has been confirmed.

## Exceptions and holds

Schema migrations (`ledger/schema.sql` or the `SCHEMA_VERSION` line), dependency/toolchain manifest or lockfile changes, and production-stakes PRs require the full Mac suite before merge. Production signoff requires a current full-scope green at the head. The 13 macOS-only and four Linux-portability test files run only in the post-merge Mac suite, with the reasons in `profile/config.yml`. The zsh and bubblewrap tests remain in the hosted fast check; its workflow installs both.

A red or unknown main is a hold, not permission to keep merging. A regression wakes repair; an infrastructure stop waits for the runner or infrastructure to recover. Each commit gets bounded blocks of three inconclusive attempts. When a block is exhausted, the tick alerts once and stops retrying until Jo says `main-retry <repo>`, which opens the next bounded block. A red or implausible verdict is never retried for that commit. Recovery is restartable from ledger state and retained run evidence; errors and fallback reasons are explicit.

The strict `as2/full-suite` ruleset is unchanged. `lane_full_test` keeps its name and invokes the runner gate: on land-first repositories it runs the fast check unless an exception or production stakes requires full scope. Close coverage is unchanged in principle: a merged fast-green PR is covered by a green believable main run on its merge commit or a later main commit. The runner still owns the full-suite slice semantics; a green full result completes that slice, timeout is an error, and diagnostic solo runs never turn a red full result green.

## Activation and recovery

Activation is a ledger word, not a profile flag. After this workflow lands, keep land-first off and run shadow mode until a real green believable main verdict establishes verified commit G and the `as2-verified` tag; retain the main-run receipt. **Only then** Jo reruns `install/as2test-setup.sh` and runs `install/install.sh --control-root=verified`. A setup rerun before the tag exists breaks the refresh sequence. Never infer that live setup ran from a documentation change.

Before Jo says `land-first agent-system-2.0 on`, complete the proof deferred from the build by Jo's `in-mvr66z3o61b7qe`:
- Dispatch the real hosted fast workflow against a real PR head through the verified ref, retain its run URL and artifact, and judge its JUnit against the selected Linux set.
- Measure the fast sets for the last 20 code landings and retain their actual Linux execution seconds. A changed-path replay on the current graph or selection milliseconds is not Linux runtime evidence.
- Retain the real shadow-main verdict, setup/install outputs, verified root/tag/bundle/preflight checks, and hosted/timing receipts together. Keep land-first off if a proof fails or evidence is missing; fix the named failure and repeat the affected proof before enabling.

If setup, tag refresh, verified-root promotion, preflight, or installation fails, fail loudly: retain the command output and run evidence, keep land-first off (or let the existing hold refuse activation), fix the named failure, then restart the appropriate setup/promotion step and verify the tag, `verified/current`, bundle source and runner preflight before issuing the activation word. Do not conceal failure with a fallback or manually fabricate a green/tag. `main-retry <repo>` is for an exhausted inconclusive infrastructure block after repair, not for red verdicts.

## Non-land-first behavior

With land-first off, existing strict full-suite behavior remains: PR requests run the full suite and `as2/full-suite` is the merge gate. Shadow main runs and verifier promotion do not gate merges. No hosted fast-only green may substitute for the existing full-suite status.

## Deliberate scope boundary

The residual adversarial class in which a lane deliberately routes around the merge hold is out of scope by Jo's ruling; this plan addresses normal, non-adversarial paths. The readable-call hold remains a lone foreground merge command, and every other readable merge request remains reserved for Jo.
