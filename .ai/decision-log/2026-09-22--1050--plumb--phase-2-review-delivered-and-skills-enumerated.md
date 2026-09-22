# Phase 2 delivered — REVIEW.md, per-skill enumeration, three reader GUESSes settled

- Date: 2026-09-22 (10:50 PDT)
- Author: Plumb (they/them), resident seat
- Status: resolved (Phase 2 output delivered; Jo has not yet closed the phase)
- Repo: `/Users/jowolff/code/agent-system-2.0`, `main` at `6fe12ad`

## What changed

**ACTION**
`6fe12ad` — `REVIEW.md` (new, 453 lines), `INVENTORY.md` § 8 appended (lines 1–677 byte-identical
to `a1410ad`, so every `INVENTORY.md:<line>` receipt in REVIEW and the reader reports still
resolves), `scripts/enum-skills.sh` (new). One commit by Jo's ruling ("let's follow your
recommendation as one commit"). Reversal: `git revert 6fe12ad`.

## Decisions

- **Jo opened Phase 2** ("please proceed with phase 2") and **confirmed the model plan**: two
  `reader` hands on opus, up to two `scout` on haiku, no fable. Two readers ran (both verified as
  `anthropic/claude-opus-5`); one scout ran and was cancelled (below).
- **Jo added ctx as an explicit Phase 2 subject** (recorded in the previous entry); it is
  `REVIEW.md` § 8 and § 4 rule 7.
- **Jo asked whether Phase 1 enumerated skills; it had not** (counted, not listed). Jo ruled: add
  a per-skill enumeration, and land it with the review as one commit. Landed as `INVENTORY.md` § 8
  rather than an in-place § 1.6 expansion, so the committed line numbers the review cites do not
  move — the first attempt spliced it in place and shifted 163 lines; reverted before commit.
- **Plumb's Phase 2 model gate was honoured** for the readers and the scout: pins from
  `.omp/agents/*.md` held (`reader` → opus, `scout` → haiku).

## Findings Jo should carry into Phase 3 (all receipted in REVIEW.md)

- The output-types envelope is never checked for any hand: OMP does not emit `session_stop` for
  child sessions (`OMP_SRC/session/agent-session.ts:4248`). REVIEW § 4 rule 1.
- A hand never receives the seat contract or the charter: `buildSubagentSessionOptions` carries no
  append prompt (`OMP_SRC/task/executor.ts:3708-3812`). REVIEW § 2.
- `SendMessage` is not a tool under OMP; Tron-generation charters instruct a tool that does not
  exist, while the `claude` CLI route those charters also name is guarded by nothing. REVIEW § 3, § 4 rule 4.
- The model gate is mechanized for four hand types in this repo only. REVIEW § 4 rule 5.
- Charter/memory read-only: zero machinery, prose in 1 of 12 charters. REVIEW § 4 rule 6.
- ctx: one imperative enforced (a search must be *called* before the first grep), against a corpus
  with no OMP seat or hand transcripts; nothing else about ctx is enforced or even written outside
  one vendor skill. REVIEW § 8.
- Skills: 89 visible to every session at every tier with no scoping; `html-report` and `jo-deck`
  have two differing local copies with the older winning; `new-seat` is not hidden as Phase 1 said.
  REVIEW § 10, INVENTORY § 8.

## Questions held for Jo (Reader E's, carried in REVIEW.md "Questions and blockers")

1. Rule 4 — the forbidden messaging channels: leave prose-only, propose a `careful-guard` DENY for
   `claude agents`/`claude --bg` (plugin change → Tinker/Sedge via Lintel), or regenerate the stale
   charters. Phase 3 material.
2. Rule 6 — charter/memory read-only: a PreToolUse path guard in `X/newdle-hooks.ts` versus
   regenerating charters from the current template. Phase 3 material.

## Dead ends — do not redo

- **Do not give a `scout` a file-writing brief.** `.omp/agents/scout.md:6` `tools: read, grep, glob`
  leaves `write` device-only; the `ScoutSkills` hand spent 25 minutes failing eight writes, then
  tried `agent` and `seat_message` (both errored) before cancellation. No stray files. A `reader`
  (no `tools:` line) can write via bash heredoc; a mechanical listing is a script, not a hand.
- Do not re-splice § 8 into § 1.6: it moves every line ≥ 170 and breaks REVIEW's receipts.
- `pi` provider configured-root support for `ctx sources add` is unread — the matrix JSON is not an
  embedded docs topic. Settling it means running `ctx sources add … --provider pi --root
  ~/.omp/agent/seat-sessions`, which writes `~/.ctx/config.toml` — outside this seat's write
  boundary; it is a proposal for Jo/Tinker, recorded as the one GUESS in REVIEW § 8.
- Skill-description token cost is the one GUESS in REVIEW § 10 (5–8k/turn); settle with
  `.tmp/phase1/tokcount.mjs` over a dumped `<skills>` block.

## Heads-up

- Opus/haiku pins in `.omp/agents/*.md` name bare family IDs (`anthropic/claude-opus-5`), not dated
  snapshots; the catalog has no dated Opus 5 ID. Same shape as the seat's own default. Jo asked;
  answered in-tab; vendor aliasing semantics not fetched (GUESS).
- `.tmp/phase2/` holds `reader-D-ctx.md`, `reader-E-rule-trace.md`, `plumb-F-skills.md`,
  `review-draft.md`, `inventory-ctx-rows.txt` — untracked, receipts index for this phase.
- Lintel ping for Phase 2 sent after this entry (see handoff for the receipt state).
