---
title: A copy or move into a known directory is judged on the directory word only, not on the file it creates
status: open
workload: none
pr: none
number: 123
---
Found while planning item 102 (`~/agent-scratch/agent-system-2.0/wl-mv4rzy7en8ejuo/PLAN.md` § Residuals). Probed on the item 102 branch at `2fd1343`, ledger `/not-real/ledger.db` (probe `~/agent-scratch/agent-system-2.0/wl-mv4rzy7en8ejuo/probe.ts`). Each of `cp ledger.db -t /not-real`, `cp /tmp/ledger.db -t /not-real`, `cp /tmp/ledger.db --target-directory=/not-real` and `cp /tmp/ledger.db /not-real` gives row 6 allow, row 10 allow, dests `["/not-real"]`. When `/not-real` is a directory, each writes `/not-real/ledger.db`. `writeDestinations` (`gates/src/exec.ts`) returns the directory word, so row 10 tests `/not-real` against the ledger file and never joins a source's basename onto it. Pre-existing and not item 102's: the shape has no unknown part. Fix direction: for `cp`/`mv`/`ln`/`install`, also judge `DIR/<basename(src)>` for each source when the destination is a `-t` directory or may be a directory; for a recursive copy, refuse when DIR is the ledger's directory or an ancestor of it. Not designed. (lane wl-mv4rzy7en8ejuo, 2026-10-12)
