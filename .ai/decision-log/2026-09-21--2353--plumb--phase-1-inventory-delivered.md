# Phase 1 delivered: INVENTORY.md, seven sections, committed at `a1410ad`

- Date: 2026-09-21 (local; wall clock crossed midnight UTC during the phase)
- Seat: Plumb (they/them)
- Status: resolved — awaiting Jo's review in this tab
- Artifact: `/Users/jowolff/code/agent-system-2.0/INVENTORY.md` (commits `0f1143c` § 1, `a1410ad` § 2–7)

## What was done

- Four `scout` hands enumerated `~/.claude`, `~/.omp/agent`, the plugin cache, and the twelve seat
  homes; three `reader` hands traced (A) what loads under OMP, (B) the authority claims and every
  duplicated document, (C) the seat lifecycle end to end. Working set under `.tmp/phase1/`
  (untracked via `.git/info/exclude`).
- Section 6 measured by `.tmp/phase1/measure-seats.sh` on this seat's turn; o200k tokens via
  `js-tiktoken`, labeled approximate. Three corrections applied after the loader trace
  (`~/.claude/AGENTS.md` and `CLAUDE.local.md` removed; shipyard `AGENTS.md` added for six nested seats).
- Two cheap checks left open by Reader B were run before finalizing: `grep -c BRIEF-BOILERPLATE`
  over the ten template-derived charters → 1 hit (Levitt); `ast-grep` in `~/.omp/agent/mcp.json`
  and `~/.claude.json` → 0.
- This seat compacted once mid-phase (252,235 tokens) and resumed from the plugin's continuity
  snapshot; the hook wrote `.ai/.gitignore` (left untracked, not the seat's file to commit).

## Decisions

- **INVENTORY.md written section by section, committed as each settled** (two commits, not seven —
  §§ 2–7 settled together once the readers returned).
- **The seat-message hop table is in § 3.5, not a separate section**: it is a load/traversal fact,
  and the brief's seven sections were kept as the file's only top-level structure.
- **The input file is not cited in INVENTORY.md**, per its rule; its open items are discharged below.

## The model plan was approved and could not be enforced

The spending gate assumed a hand type pins a tier (`<plugin-root>/agents/<type>.md:4`). Under OMP
that line is discarded (`OMP_SRC/task/discovery.ts:136-152`) and every hand runs at the parent
seat's model. All seven hands this phase ran as `claude-fable-5-1` — Plumb's own model — including
the four `scout` hands approved as haiku. Receipt: `~/.omp/agent/seat-sessions/plumb/2026-09-22T05-52-33-604Z_…/ScoutPlugins.jsonl` `"model":"claude-fable-5-1"`.
Consequence for the charter's Model-selection section: choosing a hand *type* does not choose a
tier; the only lever a seat has is its own `--model` (or an OMP-dialect agent definition carrying
`model:` that OMP will read). Raised to Jo in the phase-end message; the charter is read-only to
this seat, so the correction is Jo's to route.

## Open items from the input file, discharged

- **Are multiple persistent named seats an advantage or extra hops?** Not answerable as posed —
  "advantage" is a preference question for Phase 3. What is now measured (§ 3.5): one Jo → Lintel →
  seat → hand → back round trip is 6 hops, 2 of them mailbox hops, each mailbox hop leaving 3 files
  and blocking the sender ≤7 s, with `display:false` so the recipient's human sees nothing land.
  Plumb is exempt from both mailbox hops by ruling. Still open: the preference.
- **Per-repo seats versus per-capability seats?** Still open — a design choice, Phase 3. What is
  now measured for it: per-seat always-loaded text (§ 6.1, 18,352–38,566 tokens), the seven
  registration surfaces a new seat needs and that only surfaces 2↔7 are tested (§ 7, Reader C C-4),
  and that the birth skill still emits Claude-CLI mechanisms (§ 5.1).

## Dead ends and hazards for the next reader

- The `py` eval kernel is shared across concurrent hands: a hand's globals clobbered a sibling's
  mid-run. Hands appended to files with bash `>>` instead.
- `delegation-guard` fires inside hands with no exemption (bridge sends no `agent_type`); a
  `reader` hand had `bash` refused twice for containing the string `grep -r` in a heredoc.
- `ctx-first-search` refuses the first `grep` of every hand until one `ctx search` has run.
- Line-number receipts in INVENTORY.md are valid on 2026-09-22 and will rot on the next edit of
  any cited file (§ 4.2 method note). Stable anchors were not available for most targets.

## Candidate lessons (for Jo to promote or discard)

- OMP drops plugin `model:` pins; a spending gate keyed on hand type cannot be enforced under OMP.
- A shared eval kernel across parallel hands is a data hazard; file appends via shell are the
  safe path until hands get isolated kernels.
