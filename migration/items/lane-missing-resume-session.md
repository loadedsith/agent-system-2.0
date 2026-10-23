---
title: Recover a missing recorded lane session from the newest compatible workload session
status: designed
workload: wl-mvl91mlce720w0
pr: none
---

When a lane's recorded resume path has disappeared, startup does not treat that absence as a readiness timeout. The runner scans only regular files immediately inside the workload's session directory and chooses the newest by modification time; equal mtimes break toward the lexicographically greatest absolute path. It resolves the selected file's origin through the newest session-bearing started/parked provenance entry, matching regular-file realpaths, then checks that origin lane's recorded model against the newest valid workload `lane-model:` choice. Legacy model metadata means the profile default; absent provenance is unknown. A missing candidate or an unknown/incompatible newest origin starts a fresh session. The runner does not fall back to an older candidate.

The selected path is passed as `--resume` only when the provenance/model guard permits it. A fallback recovery records its actual argv and recovery decision to runner stderr. The same chooser is used by the autonomous runner and `as2 lane <wl>`.

OMP stderr is a runner-owned pipe, drained immediately after spawn and forwarded chunk-by-chunk. The runner retains an 8192-byte tail; diagnostic context is whitespace-normalized and capped at the final 1000 characters (or `no stderr`). After OMP exits, the runner waits at most 250 ms for stderr EOF, then cancels the reader without awaiting cancellation. An observed OMP exit before readiness is a `startup` failure; a still-live OMP with no claim by the 3-minute deadline remains a `readiness` failure, distinct from a failed named-model check.

These bounds do not make crash diagnostics complete: a runner crash can lose its in-memory tail, and a long stack-only tail may omit the first useful diagnostic. A session disappearing during discovery or after selection has no retry/race-repair loop. Runner death closes its child pipes, but no post-death OMP EOF/drain/session-shutdown behavior is claimed here.

Verification: `surface/test/lane-resume-script.test.ts` exercises recovery, provenance/model preservation, early startup diagnostics, stderr bounds and finalization. A fixture-only replay on the original product tree fails behavioral assertions for the new recovery and startup cases; the fixed regression passes. Isolated runtime smoke exercises the actual runner CLI for newest-session recovery and fresh start through the fake OMP boundary, plus the actual installed OMP binary's missing-resume refusal through an isolated wrapper. That refusal produces one startup failure and death with the real stderr and exit code 1, then releases the holder. The PR carries the baseline, runtime and compatibility receipts; its head is verified separately by the external full-suite runner.
