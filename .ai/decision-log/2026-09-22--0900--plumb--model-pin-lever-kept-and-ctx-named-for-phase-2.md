# Model-pin lever kept; ctx named a subject of Phase 2

- Date: 2026-09-22
- Seat: Plumb (they/them)
- Status: resolved
- Supersedes: the "known gap" recommendation in
  `2026-09-21--2353--plumb--phase-1-inventory-delivered.md` § "The model plan was approved and could not be enforced"

## What changed

- `/Users/jowolff/code/agent-system-2.0/.omp/agents/{scout,reader,builder,planner}.md` committed
  at `6c4902a`: plugin bodies verbatim from 0.2.171 with OMP-dialect frontmatter carrying an
  explicit `model:` (scout → `anthropic/claude-haiku-4-5`; reader, builder → `anthropic/claude-opus-5`;
  planner → `anthropic/claude-fable-5-1`), matching the plugin's own `:4` pins.
- Proof before keeping: a throwaway `probe-haiku` project agent was dispatched once; its transcript
  (`~/.omp/agent/seat-sessions/plumb/2026-09-22T05-52-33-604Z_…/ProbeHaiku.jsonl`) shows
  `"model":"anthropic/claude-haiku-4-5"`. Probe file deleted after.

## Decisions

- **Jo: keep the lever.** Project-level `.omp/agents/` is discovered at dispatch time
  (`OMP_SRC/task/discovery.ts:105-109,:155-160`), loads before plugin roots, keeps `model:`.
  The charter's spending gate is now enforceable for these four hand types from this seat.
  This corrects the prior entry's claim that non-fable hands were unreachable — that was a
  broadening past the receipt (only Claude-dialect plugin pins are dropped).
- **Jo: ctx is an explicit subject of Phase 2** — its intended role, what feeds it, what reads it,
  per tier — not only one enforcement mechanism. Starting point: `INVENTORY.md:529` (seat
  transcripts are not a ctx source while `ctx-first-search.ts` gates `grep` on ctx).
- Phase 2 is not yet open; Jo was briefed on its shape and the five-phase fit this morning.

## Hazards for the next reader

- The four `.omp/agents/` bodies are copies; when the plugin's agent bodies change they will
  drift. Each file carries an HTML comment naming its source and version.
- The ctx-first-search gate still fires on every hand's first `grep`.
