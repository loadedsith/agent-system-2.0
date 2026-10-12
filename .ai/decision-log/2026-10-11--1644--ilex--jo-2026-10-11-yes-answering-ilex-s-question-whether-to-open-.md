---
date: 2026-10-11T16:44-07:00
engineer: Ilex
session: wl-mv4gn9l7spcsg0
status: resolved
durable: false
supersedes:
workload: wl-mv4gn9l7spcsg0
---

# Jo (2026-10-11): "yes", answering Ilex's question whether to open a workload to fix the stale ledger backup job.
Evidence (Ilex, 2026-10-11T23:33Z, read-only SQL `SELECT max(created_at), count(*) FROM entries`):
- newest backup /Users/jowolff/.agent-system-2/backups/ledger-99cb347ab357/ledger-2026-10-11T17-20-43.640Z.db: newest entry 2026-10-09T17:48:20.988Z, 3602 entries;
- live /Users/jowolff/.agent-system-2/ledger.db: newest entry 2026-10-11T23:33:04.873Z, 4271 entries.
The replay lane (msg-mv464pmvp91m9s on wl-mv45yk9llwt3pc) found the 10-10 and 10-11 backups byte-identical (sha 29069f04…), both ending at 2026-10-09T17:48:20.988Z, while /Users/jowolff/.agent-system-2/ledger-backup.log ends "backup ok: took …ledger-2026-10-11T17-20-43.640Z.db". So the job reports success and writes a copy that is missing two days of entries. The lane's unverified guess: VACUUM INTO ran on a connection that did not see the WAL content, or the job copied a different file.
Code to read first: ledger/scripts/backup.ts (the job), ledger/src/index.ts backup() (VACUUM INTO into a temp file, copyProblem check, link), the launchd template install/com.agent-system-2.ledger-backup.plist and how install/install.sh fills it (AGENT_SYSTEM_LEDGER_DB, HOME, WorkingDirectory), ledger/SCHEMA.md "Scheduled second copy". Check the installed plist at $HOME/Library/LaunchAgents/com.agent-system-2.ledger-backup.plist (which ledger path and repo checkout it runs) and whether a long-lived reader or an un-checkpointed WAL explains it.
Find the real cause with receipts before choosing a fix; do not only add a staleness check. Requirements:
- A backup taken after the fix contains the live ledger's newest entry at the time it was taken.
- A regression test that fails before the fix (prove on a separate unpacked copy, never by overwriting the worktree) reproduces the cause, e.g. a copy that omits entries still in the WAL or a copy of the wrong file.
- The job no longer reports "backup ok" for a copy that is behind the ledger it was asked to copy; the plan states how "behind" is judged.
- Never write to or replace the live ledger, and never delete existing backups. A fresh live backup, if the plan wants one, is a handed-over step for Jo or Plumb outside the fence (the lane's fence denies writes under ~/.agent-system-2), as a logged script per Jo's handed-over-command rules.
- MIGRATION.md item. Full suite via lane_full_test on the PR. Merging stays Jo's.
- If the change must touch gates/, stop and raise it (Jo's standing rule: gates/ is production).
Coordinate: the replay workload wl-mv45yk9llwt3pc reads backups as fixture input via its --refreeze; the plan notes whether its frozen fixture was built from a stale backup.

done: The ledger backup job's real cause of stale copies is found with receipts and fixed, so a backup taken now contains the live ledger's newest entry; a regression test reproduces the cause and fails before the fix; the job no longer reports success for a copy that is behind the ledger; a MIGRATION.md item records it; the full suite is green at the PR head; the change is on a branch with a PR.
done-because: Jo answered close on q-mv4guu3w4ks0zk (in-mv4gytd87gr0n4), so the workload closes on the finding and not on the done line's fix clauses.

The done line asked for the real cause of stale backup copies. The finding (en-mv4guu3vvoiiv4, receipts in /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4gn9l7spcsg0/FINDINGS.md) is that the copies were not stale:
- For rows created before 2026-10-11T17:20:43.640Z, the 10-11 copy matches the live ledger in all 7 tables on row count and newest created_at.
- The ledger wrote nothing from 2026-10-09T18:03:33Z to 2026-10-11T18:10:46Z. That is why the 10-10 and 10-11 copies are byte-identical.
- The job copies once every 24 h (BACKUP_DEFAULTS, backupIfDue). Ilex's 23:33Z comparison therefore set a 17:20Z copy against rows written from 18:10Z on.
- The 10-09 copy holds an entry written 139 ms before the copy was taken, so the copy job reads rows still in the write-ahead log.

Not met, by Jo's choice:
- no fix, because there was no defect to fix;
- no regression test, because none could honestly fail before a fix;
- no change to how the job reports success;
- no MIGRATION.md item, no full-suite run, no branch commit and no PR.

The replay workload wl-mv45yk9llwt3pc was told in msg-mv4guu3wtcvo5c that a fixture frozen from the 10-11 copy is a faithful snapshot as of 17:20Z. The live ledger and the existing backups were not changed.

Rendered from the ledger by Ilex (they/them) at workload close; stakes production, mode autonomous, opened 2026-10-11T23:34:46.603Z.

## What changed

- sl-plan-backup-stale: Establish the cause of the stale ledger backups with receipts, then plan the fix (or report that there is none) for Jo's decision. — artifact: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4gn9l7spcsg0/FINDINGS.md (finding en-mv4guu3vvoiiv4: the copies are faithful; the ledger was idle from 10-09T18:03Z to 10-11T18:10Z; the copy interval is 24 h), and Jo's answer close on q-mv4guu3w4ks0zk (in-mv4gytd87gr0n4): no code change.

## Decisions made (and why)

- jo answered "close" to q-mv4guu3w4ks0zk (The backups are not stale. Every copy matches the live ledger as it stood when the copy was taken: all 7 tables, row counts and newest timestamps (receipts: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4gn9l7spcsg0/FINDINGS.md). The ledger wrote nothing from 10-09T18:03Z to 10-11T18:10Z. That is why the 10-10 and 10-11 copies are identical. The copy job runs once a day, so the 17:20Z copy predates everything written from 18:10Z on. Because nothing is broken, a regression test cannot honestly fail before a fix, so the done line cannot be met as written. Pick one. close: no code change; I close with this finding as the receipt. harden: I plan a check where the job reads its new copy and the live ledger in one transaction and fails if the copy is behind. Its test fails only against an injected bad copy, not a real cause, and it gets a MIGRATION item and a PR. cadence: I plan more frequent copies (for example hourly, keeping more), so a copy lags the ledger by at most an hour; MIGRATION item and PR.)
- assumption (lane-mv4gn9l7spcsg0-1): builder-lab: anthropic lane lane-mv4gn9l7spcsg0-1 model anthropic/claude-opus-5-5
- assumption (lane-mv4gn9l7spcsg0-1, sl-plan-backup-stale): Finding, with receipts in /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4gn9l7spcsg0/FINDINGS.md: the backup copies are not stale. I compared the 10-11T17:20:43.640Z copy with the live ledger, restricted to rows created before that instant. All seven tables match on count and max(created_at); entries is 3602, newest 2026-10-09T17:48:20.988Z. The live ledger has no new row in any table from 2026-10-09T18:03:33Z to 2026-10-11T18:10:46Z, about 48 h idle. That gap is why the 10-10 and 10-11 copies are byte-identical (sha1 29069f04…). The 24 h interval explains the rest: at 23:33Z the newest copy (17:20Z) predates all 18:10Z+ activity. Positive control: the 10-09 copy at 16:59:40.338Z holds an entry from 139 ms earlier. So there is no cause to reproduce and no regression test that can honestly fail before a fix. The done line's premise does not hold; asking Jo how to proceed.
- assumption (lane-mv4gn9l7spcsg0-2): builder-lab: anthropic lane lane-mv4gn9l7spcsg0-2 model anthropic/claude-opus-5-5

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-mv4guu3wtcvo5c [delivered] not acted on: Finding on wl-mv4gn9l7spcsg0: the ledger backup copies are faithful, not stale. Receipts: /Users/jowolff/agent-scratch/agent-system-2.0/wl-mv4gn9l7spcsg0/FINDINGS.md. I compared the 10-11T17:20:43Z copy with the live ledger for rows created before that instant: all 7 tables match on count and max(created_at). The ledger was idle from 10-09T18:03Z to 10-11T18:10Z, so the 10-10 and 10-11 copies are byte-identical. The job copies every 24 h, so the 17:20Z copy predates all 18:10Z+ rows. For the replay workload wl-mv45yk9llwt3pc: a fixture frozen from the 10-11 copy is a correct snapshot as of 17:20Z. It lacks everything written from 18:10Z on; that is not corruption. Jo's question on sl-plan-backup-stale: close / harden / cadence.
