---
date: 2026-09-24T17:18-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Session C opened; batch C2 (communication rules) closed 7/7; TypeSafe questions settled; halt point 4
status: resolved
durable: false
---

## What changed

Fourteen commits on `main` after the 11:02 entry (`0835ce0` … `c0e93b4`); 37 unpushed since
`724e6f2`, Jo pushes. New file `DESIGN-2.0.md` (the Session C disposition ledger). New directory
`research/1x-snapshots/` holding byte-identical copies of five 1.x files ruled dropped or moved.
`SPEC-2.0.md` § Session C marked opened; § Open questions carries Jo's OQ-1/OQ-2 ruling.

- **TypeSafe, settled.** Jo: *"it's just my account"*, *"it is not a problem re typesafe"*.
  Plumb had graded OQ-2 "on fire" on Tinker's chained claim; regraded after Jo's pushback.
  Tinker's usage measurement (dispatched at Jo's ask via Lintel, before the ruling):
  `/Users/jowolff/agent-scratch/agent-system-2.0/typesafe-usage/REPORT.md` — 167 requests since
  09-21, 36 known tests, 102 from six `find` calls in OMP's own code, 28 automatic brief
  classifications, Newdle content only via 7 of those (Tinker's figures). Jo said *"sure"* to
  Tinker's `disabledProviders` recommendation, then overruled it in Tinker's terminal within the
  hour: *"typesafe should go back everywhere deal with it."* `config.yml` restored byte-identical;
  TypeSafe ON in both profiles; the `agent-system-2` profile question closed; Jo declined a
  shipyard-only block — **do not raise it again.** Tinker's logs in `~/.claude/.ai/decision-log/`
  (`…1556…` and `…1600…`).
- **Session C opened** (Jo: *"sure let's do it"*, *"to session c"*). No hands for C2; one row per
  turn, recommendation attached, ledger re-shown by commit.
- **C2 closed, 7/7** (`DESIGN-2.0.md:22-34`):
  - C2.1 `~/.claude/CLAUDE.md` → **change, split**: voice sections become one portable Jo-facing
    document; turn shape (one ask per turn, script not bare command, needs-you first / closing
    ask last) is **mechanical** at the P-23 message gate — first row of the P-11 list; output
    types → C4; subagent-routing sections → C3; YAML/MCP-401 notes dropped.
  - C2.2 `~/.claude/AGENTS.md` → **drop** as dead; snapshot `research/1x-snapshots/dot-claude-AGENTS.md`.
  - C2.3 two `CLAUDE.md.*.bak` → **drop**; snapshots kept.
  - C2.4 `communication-rules` plugin → **drop**; its three checks are reference input for the
    gate build, verified at install (P-11). Testing them now declined as not worth it.
  - C2.5 shipyard `AGENTS.md` → **keep, outside 2.0's hands** (repo content, OMP-native load).
  - C2.6 `humanizer` → **re-home** (forks from the plugin copy, drift accepted); `newdle-voice`
    → **drop from 2.0**, stays plugin-shipped for the team.
  - C2.7 Desktop ADHD/autism evidence file → **re-home as unloaded evidence** beside the voice
    document; snapshot kept; Desktop copy may go.
- **Standing constraint recorded** (`DESIGN-2.0.md:17-20`), Jo: *"the plugin will only be gone
  for me - others will still use it."* P-18 is Jo-local; dropping a plugin artifact implies no
  shipyard step.

## Decisions made (and why)

- Snapshots for every dropped/moved 1.x file, sha-verified, before the migration step deletes
  anything — Jo: *"make sure there's a backup"*.
- No test of the 1.x check scripts before dropping them: P-11 verifies the gate at build time
  regardless, so the test bought one bit the build resolves for free.
- OQ-1/OQ-2 recorded as Jo's ruling in the spec, not left "held".

## Dead ends — don't retry these

- Grading a specialist's chained claim as "on fire" without a count. Jo's "not a problem" was
  the ruling; recommending Tinker's disable with a yes-default afterwards cost Tinker an edit
  and its reversal.
- Over-reading `INVENTORY.md` in one call (lines 455-755) to find one cluster row — use a
  targeted grep.

## Heads-up for whoever touches this next

- **Halt point 4 (after a Session C batch). Jo pushes, then Session C continues.** Next batch by
  the ruled order: **C4 output types (14 rows, `INVENTORY.md` § 1.4, P-23 governing)** — a
  re-homing pass: which rows the one portable copy carries, which are superseded by the
  mechanical receipt check. The two `CLAUDE.md` sections deferred from C2 land there. Then C3,
  C5, C6, C1, C7, C8. No hands planned for C4.
- On wake: read this entry, `DESIGN-2.0.md` (whole — it is short), `briefs/phase5.md:183-246`.
- Tinker's four housekeeping items (`ledger-lifecycle/REPORT.md:14-40`) still unanswered;
  RRSI apply loop held to after stabilization.
- Hand clones `/tmp/opmodes`, `/tmp/rrsi` still present — `rm -rf` when convenient.
- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel notified twice this session (TypeSafe relays); not notified of the C2 close — a batch
  is not a phase.
