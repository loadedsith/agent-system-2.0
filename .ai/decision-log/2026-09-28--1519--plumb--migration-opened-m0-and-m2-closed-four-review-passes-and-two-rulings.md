---
date: 2026-09-28T15:19-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 execution — migration opened; M0 and M2 closed; four gpt-6-astra review passes; decision-log read ruled
status: resolved
durable: false
---

# Migration opened; M0 and M2 closed; the first code in the repo passed four adversarial review passes

**CLAIM**
Jo opened the migration (*"Open M0"*) and the first two steps closed the same afternoon. Wave 2 (M3 tier files + classifier ∥ M4 P-11 gates) is briefed and waits only on Jo's word; Jo: *"that will be the next thing we do."* Branch `main`, thirteen commits since the morning's wrap-up, Jo pushes.

## What changed

**CLAIM**
1. **M0 closed** — Tinker (owner per the row) found the seat-sessions ctx `pi` root already durable from T1 in `~/.ctx/config.toml`, surviving a daemon restart and a re-index; coverage 699/699 (190 seat main-session files + 509 hand transcripts, 1.1 GB); semantic backend now ready (13,763 documents), so T1's keyword-only caveat is lifted; daemon still "partially ready". Artifact `/Users/jowolff/agent-scratch/agent-system-2.0/migration/M0.txt`. Sign-off waits for the first 2.0 lane to answer a history question (M7 or later).
2. **M2 closed — the ledger, the repo's first code.** One `builder` hand on opus-5-5 built it (`94f06b9`); four `reviewer-codex` passes on gpt-6-astra, each followed by a `builder` fix hand on opus-5-5: blocking counts **3 → 4 → 2 → 0** (`71a576e`, `477af98`, `867b3b6`, `c3fcf36`). Final: schema `user_version 2`, 6 tables, 62+ triggers with every rule in the file (state order, provenance append-only, duplicate-identity `INSERT OR REPLACE`/upsert refused, nonpositive `rowid`/`seq` refused, string-array elements checked, older schema versions refused with exit 4); TypeScript `Ledger` writer module callable without OMP (`inFlight()`, `oldestHeld()`, lease/reclaim, busy-retried init); `VACUUM INTO` backups written to a pid-tagged temp, verified (`integrity_check`, size, version), published by atomic `linkSync`, namespaced per canonical source path with a `SOURCE` owner file, dead-pid temps reclaimed (ESRCH only; EPERM = alive, live-tested), invalid copies quarantined as numbered `.invalid`; installer reads the manifest (exactly one `ledger-schema` row = `ledger/schema.sql`), refuses unmanifested files and every symlink under machinery dirs (exit 2), refuses synced/network paths after canonicalisation (exit 3), writes a launchd backup-agent plist (single-pass XML-escaped render, linted, **never loaded by any hand**). 135 tests; fresh-machine test with eleven negative cases; Plumb's own run `~/agent-scratch/agent-system-2.0/migration/M2/plumb-close.log`.
3. **Repo agents:** `builder` re-pinned `anthropic/claude-opus-5` → `anthropic/claude-opus-5-5` (`df389ce`, Jo: *"builder model, make sure it's running opus-5-5 and do not proceed if the hand is not"*); new read-only `reviewer-codex` pinned `openai-codex/gpt-6-astra` (`493f618`, Jo: *"could we have a codex astra agent run them against the work"*, *"it's gpt-6-astra"*). Jo confirmed the four review skills (`code-review`, `newdle-code-review`, `newdle-security-audit`, `newdle-code-simplify`): *"i think you chose the correct skills."*
4. **Plan edits:** M2 gate wording corrected (ledger lives outside any OMP profile, `$HOME/.agent-system-2/ledger.db`, env `AGENT_SYSTEM_LEDGER_DB`); P-11 row 10 (raw ledger writes refused) added to M4's list — the first hand found no step owned it; M11 evidence gains plan usage per week before/after from `~/.omp/agent/agent.db` `usage_history` beside Phoenix tokens per workload (Jo's cost question: unmeasured today; this is the instrument).
5. **Handed-over script:** `/Users/jowolff/agent-scratch/agent-system-2.0/ledger-backup-agent.sh` (zsh-checked, logged, LOAD/UNLOAD typed confirmation, prints undo) — loads the launchd agent once the installer has run for real; today it exits 0 with "nothing to load". Jo: *"got it."*

## Decisions made (and why)

**CLAIM**
- **Dormancy = 90 days from the cutover event** (Jo: *"90 days is fine"*; `214e137`). No open fields remain in `MIGRATION.md`.
- **Owner column stands** — Jo asked whether Tinker should own the build steps (*"wasn't tinker supposed to be handling this?"*); Jo: *"let's keep it as is this is working."* M0 was Tinker's because it edits ctx config under Jo's home; M2–M6/M8 are Plumb's hands.
- **Scheduled backup = launchd periodic job written by the installer, open-time copy kept as fallback**; hourly `StartInterval` with a 24 h due check (reviewer and hand agreed; a daily timer that fires during sleep is skipped). Linux gets a systemd-timer row when a teammate needs one. **Symlinks under machinery directories stay refused.** Jo: *"yes to both."*
- **N1 resolution: schema version 2 refuses older files; no upgrade code** — nothing real is installed, so migration code would be dead weight (Plumb's call under the ruling; recorded in the M2 row).
- **Quarantine, not deletion**, for invalid copy files (hand's GUESS, reviewer's recommendation, kept).
- **M2 closed after the fourth pass with no fifth review** (Jo: *"open fix hand 4, close M2 after"*) — round 4 was 0 blocking; the two leftovers were ten-line changes with regressions; Plumb's own test run is the closing receipt.
- **B2.1 amended — decision logs are read as context, never as record** (Jo: *"amend it following your recco"*, after *"the new machinery will be able to both read and write decision-logs"*; `fc13e2e`). At workload open on a repo carrying the convention, entries newer than the last 2.0 workload on that repo render into the lane's brief; nothing enters the ledger. The 2026-09-24 "never reads back" was aimed at the ledger not ingesting prose; it had not considered teammates' plugin-written entries being invisible. Built at M5.
- **Model verification instrument for hands:** OMP's `task` tool has no model parameter, so a hand's model is the repo agent file's `model:` pin, verified after the fact in this process's log (`~/.omp/logs/omp.<date>.<pid>.log`, `agent_end … "model":"…"` entries; count the delta across the hand's run). Used for every hand today. `model_perf`/`model_usage` in `agent.db` are shared across every OMP process (Tinker's activity shows there) and cannot attribute a hand.

## Dead ends — don't retry these

**CLAIM**
- **`lazygit log` is not a subcommand** in 0.65.0 (only `completion`); plain `lazygit`, then `4` for the Commits panel. Corrected after handing Jo the wrong line.
- **Handing Jo two `launchctl` commands as prose** — the rule is a script file with one unchanging line; corrected the same turn on Jo's *"aren't you supposed to be giving me commands in a throwaway shell script"*.
- **"Keep `user_version = 1`" in the first fix brief** created the round-2 blocker (old and new schema indistinguishable). A schema change is a version change even before anything is installed.
- **My brief's phrase "profile dir has the ledger"** contradicted B2's "outside any OMP profile" and cost the first hand a QUESTION. Briefs quote the spec's words for locations.
- **ctx could not recover the pre-compaction exchange** (today's session not yet indexed) — three answers of Jo's arrived in the compaction snapshot with no questions; Jo: *"i believe those are all for unrelated questions - i do not know"*. Recorded in the morning entry as a lost exchange.

## Heads-up for whoever touches this next

**CLAIM**
- **Next: wave 2 = M3 ∥ M4**, two `builder` hands on opus-5-5, Plumb integrating the one shared file (the profile template); M4 owns every refusal including "non-tier agent name refused" (M3's test cites it). Waits on Jo's word. Waves after: [M5, M6] → M7 → [M8, M9] → M10 → M11 → M12.
- **Owed to the ledger from elsewhere:** the M4 raw-write hook must match `AGENT_SYSTEM_LEDGER_DB`, default `$HOME/.agent-system-2/ledger.db`, and the `-wal`/`-shm` siblings (`ledger/src/locality.ts`).
- **Sign-offs all fall due at M7** (the plan's fifth column): M0, M2, M3, M4 each sign off when Jo watches the first real workload use them.
- **Untested, noted:** two connections quarantining the same invalid copy at the same instant could leave it under two `.invalid` names sharing one inode (nothing lost). Network-mount refusal has never met a real mount. No `tsconfig`/typecheck yet.
- **Scratch evidence kept:** `~/agent-scratch/agent-system-2.0/migration/M2/` (REPORT/REVIEW per round, logs, fresh-machine work dirs). Deletable after M7's sign-off.
- **Seat continuity:** Jo is having Lintel put this seat to sleep after this wrap-up. On wake: read this entry and the morning's (`2026-09-28--1227--…`), then `MIGRATION.md:45-58` for step state — M0 and M2 rows carry their full closure text.

## Candidate lessons

**GUESS** (inference)
- **Adversarial review earned its cost on the first code:** 71 green tests and a file-enforced rule set, and pass one found the rules had a hole no module-side test could see (every test used the module's connection). Convergence 3→4→2→0 across four rounds; round 2's blocker was Plumb's brief, not the hand's code.
- **A cheap check that cannot disconfirm is not a check:** `model_usage`/`model_perf` looked like a model-verification instrument until Tinker's activity showed up in it; the per-pid log was the instrument that could say "no".
- **Two handed-over-command slips in one afternoon** (prose commands; a wrong subcommand) — both caught by Jo, both the rule already written. The rule fires on code blocks that "look like" quick help; the self-check is: does this block ask Jo to type more than one line?

<!-- output-types
tier: 0
CLAIM: 5
CITE: 0
GUESS: 1 (inference 1)
ACTION: 0
PMDW: 0
QUESTION: 0
-->
