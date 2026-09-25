---
date: 2026-09-24
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 Session C — batch C4 (evidence and output types)
status: resolved
durable: false
---

# Session C: batch C4 closed 14/14; halt point 4

## What changed

- `DESIGN-2.0.md` § C4: all 14 rows ruled by Jo, one per turn, commits `0bd7dfa` (scaffold)
  through `de67705` (close). Summary paragraph at the end of the C4 table.
- Snapshots under `research/1x-snapshots/` (all sha-verified, recorded in the rows):
  `dot-claude-references-output-types.md`, `dot-claude-references-output-types-incidents.md`,
  `dot-claude-orchestrator-hooks-20260924.tar.gz` (85 entries), `dot-claude-skills-ctx/`
  (directory incl. `.ctx-skill.json`), `dot-claude-orchestrator-state-JUDGEMENT-20260924.tar.gz`
  (47 entries), `dot-claude-RETRACTIONS-EXPERIMENTS-20260924.tar.gz` (11 entries).
- P-11 mechanical-rule list now has three rows (turn shape C2.1; contract injection and receipt
  verification C4.7).
- 14 commits unpushed since `5b3a6bb`; Jo pushes.

## Decisions (Jo's words in the rows)

- Output-types contract: **copy once from the installed plugin copy, then own it** — no symlink,
  no sync; envelope and commands-excerpt removed (C4.1). Local `~/.claude` copies dropped
  (C4.2, C4.5); plugin source and published copy kept outside 2.0's hands (C4.3, C4.4).
- Both output-types hooks and the hook-scope files dropped, superseded by lane injection plus a
  mechanical receipt check at the P-23 gate (C4.7); **a single on/off** in the profile template,
  default on — Jo: *"keep a single on/off"* (C4.8).
- All of Lintel's orchestrator hook guards dropped; `phantom-claim-stop`, `ledger-write-guard`,
  `identifier-link-guard` named as reference input (C4.9).
- ctx-first grep gate dropped; ctx itself unaffected (P-13 index half, T1) — Jo asked *"what
  happens to ctx if we drop this"*; answer: nothing, the row is the gate only (C4.10).
- ctx skill **re-homed into this repo** — Jo: *"oh most definitely rehome here"* after asking what
  "portable repo" means (= this repository, § B8). Finding: the skill is installed and hashed by
  `ctx-cli` 1.5.0 (`.ctx-skill.json`); how install handles that is a build-time question (C4.11).
- Lintel's three prose ledgers (JUDGEMENT, RETRACTIONS ×2, EXPERIMENTS + backups) dropped as
  superseded state — § B2.1 ledger is the only record, § B8 state never in the repo, § B14.1
  nothing from prose (C4.12–14).

## Carried forward

- "Consult history at workload open" → **C7** (state) as a written-rule candidate (from C4.10).
- ctx skill install vs ctx's own installer → build time (from C4.11).
- Held, not blocking: Tinker's four housekeeping questions
  (`/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/REPORT.md:14-40`); RRSI apply
  loop after stabilization; hand clones `/tmp/opmodes`, `/tmp/rrsi` to `rm -rf`.

## Next

- **Halt point 4 (after a Session C batch). Jo pushes, then Session C continues.** Next batch by
  ruled order: **C3 routing (14 rows, `INVENTORY.md` § 1.3)**, including the two `CLAUDE.md`
  subagent-routing sections deferred from C2.1. Then C5 verification/hooks (20), C6 skills
  (sizing decision first, against P-22's mode column), C1 identity/charter (20), C7 state (15),
  C8 seat-lifecycle (12). Then `DESIGN-2.0.md` synthesis sections and `MIGRATION.md`.
- Method that held for C2 and C4: one row per turn, recommendation with one-sentence why,
  Jo's words verbatim, snapshot before any drop, commit per row
  (`docs(design): C4.N … (Jo, 2026-09-24)`). Rows whose class a Session B ruling already
  classified can be batched into one question (done for C4.13–14).
- Standing constraints unchanged: P-18 is Jo-local (plugin stays for teammates); TypeSafe on in
  both profiles, do not raise again; no hands without a stated model plan and Jo's word.

## Candidate lessons

- When a Session B ruling classifies a whole artifact class (here § B2.1 + § B8 for prose
  ledgers), the Session C rows in that class are confirmations — batch them into one question.
- P-18 is Jo-local; Jo's "not a problem" is the ruling — surface contrary specialist
  recommendations as contrary, never as a fresh yes-default. (Carried from the previous entry;
  still not promoted to memory.)

## Notes

- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel not notified: a batch close is not a phase close.
