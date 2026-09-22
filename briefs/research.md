# Research real orchestrators in practice — phase 4 of the 2.0 redesign

Prepared by Plumb at the end of Phase 3 (2026-09-22) so Phase 4 opens with Jo's priorities in
front of it. Phase 4 is opened by Jo, not by this file. Charter text governing the phase:
`.ai/plumb-seat-charter.md:158-160` — named sources first, fetched and cited, never summarized
from recollection; then other first-hand practitioner accounts, capped at ten; then anything Jo
drops into `research/`. Output `RESEARCH.md` with a closing "Patterns that recur across sources".

## Jo's priorities, in order (Jo's words in PREFERENCES.md § Research queue)

1. **Graph engineering.** Jo's definition (nodes = specialised agents; edges = routing rules
   incl. branches and loop-backs; shared state = the travelling record) is in `PREFERENCES.md`
   § "Jo's hypothesis of the final shape". Establish: whose term, what practitioners and
   frameworks mean by it, and how it maps onto the requirements (`REQUIREMENTS.md`). Jo:
   *"i really want to highlight the importance of what we're doing as graph engineering"*.
2. **Addy Osmani — "owning the outer loop".** Jo's phrase for Osmani's idea. Fetch Osmani's own
   text first; do not paraphrase from memory. Then the rest of Osmani on running many agents.
3. **Steve Yegge** — read under P-14: Jo does not have the funds for fleet-scale subscriptions.
   Extract the patterns that survive that constraint; mark the rest explicitly as out of means.

## Then, from the Phase 3 rulings

- Planning practice for P-12: OMP plan mode (`OMP_SRC`); obra/superpowers
  (https://github.com/obra/superpowers); addyosmani/agent-skills
  (https://github.com/addyosmani/agent-skills). Compare with the five 1.x planning artifacts
  named in P-12.
- Memory system for P-13: what ctx can and cannot index (`REVIEW.md` § 8), and alternatives;
  the requirement is work *and decisions*, with provenance, tool-agnostic.
- Jo's friend's "FM" orchestrator (P-2), if written material exists — Jo to supply.
- `OMP_PROFILE` isolation extent (P-3) — settle from `OMP_SRC`, not from docs.

## Rules that carry over

- Every source fetched this session and cited by URL and passage; nothing from recollection.
- Every hand is preceded by a model plan posted to Jo and confirmed (charter § Model selection).
- Facts only; where a source makes a claim about a system, it is CITE, and where Plumb infers
  a fit to a requirement, it is GUESS naming what would settle it.
