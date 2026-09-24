# DESIGN-2.0 — keep / change / drop over 1.x, as ruled by Jo

The disposition ledger for Session C of Phase 5 (`briefs/phase5.md` § Session C; P-10, P-18).
One row per governing artifact in `INVENTORY.md` § 1, in the batch order Jo set: C2, C4, C3,
C5, C6, C1, C7, C8. Default disposition is **drop unless argued for**, except C4, which is a
re-homing pass under P-23 (SPEC § B15).

Every dispositioned row carries: **disposition** (keep / change / drop), **enforcement**
(P-11: mechanical — which tool call or message gate refuses it — or written), **mode** (P-22:
autonomous / user-driven / both), **portability** (SPEC § B8: portable repo, identical on every
machine, or OMP-specific extension/profile setting), and **Jo's words**. Sections beyond the
disposition ledger (taxonomy, machinery/state boundary, mechanical-rule list, tier structure)
are written after the pass, from the rows.

Opened 2026-09-24 (Jo: *"sure let's do it"*, *"to session c"*).

## C2 · Communication rules (`INVENTORY.md` § 1.2, 7 rows) — governing requirement P-24

| # | artifact | disposition | enforcement | mode | portability | Jo's words / justification |
|---|---|---|---|---|---|---|
| C2.1 | `/Users/jowolff/.claude/CLAUDE.md` (global rules file, 8,592 words) | open | | | | |
| C2.2 | `/Users/jowolff/.claude/AGENTS.md` (second ~8k-word rules file) | open | | | | |
| C2.3 | `/Users/jowolff/.claude/CLAUDE.md.*.bak` (two backups) | open | | | | |
| C2.4 | `/Users/jowolff/code/jo-wolff-plugins/plugins/communication-rules/` (Jo's published plugin: inject/stop hooks, three checks, judge, OMP adapter) | open | | | | |
| C2.5 | `/Users/jowolff/code/shipyard/AGENTS.md` (shipyard workspace rules) | open | | | | |
| C2.6 | plugin `skills/humanizer`, `skills/newdle-voice` | open | | | | |
| C2.7 | `/Users/jowolff/Desktop/agent-collaboration-with-adhd-and-autism.md` (evidence file behind § How to communicate with Jo) | open | | | | |

## Mechanical-rule list (P-11) — filled from the rows

| rule | trigger (tool call or message gate) | source row |
|---|---|---|
