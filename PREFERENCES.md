# PREFERENCES — what must be true in 2.0 (Phase 3)

Captured by Plumb (they/them) in conversation with Jo, in Plumb's tab, from 2026-09-22. Plumb
captures, Plumb does not argue (`.ai/plumb-seat-charter.md:153-156`). One entry per like or
dislike, quoting Jo's words, pointing at the inventory item or review finding that motivated it,
marked **keep / change / drop**. Anything ambiguous is a QUESTION here, never resolved silently.

## Unit of decision (ruled 2026-09-22)

Jo, 2026-09-22: *"please understand: I am NOT precious about re-using anything that was already
built."* and *"our goal is to build the best orchestration system that we can for me to get newdle
(and my own personal work), done as painlessly and efficiently as possible."*

Ruling: entries here are **requirements for 2.0**, not votes on 1.x artifacts. The keep/change/drop
mark applies to the requirement. A 1.x artifact is cited as evidence that the requirement existed
and as the record of how it failed to hold (`REVIEW.md` § 4, § 7), never as the thing being kept.
`DESIGN-2.0.md` (Phase 5) will still list every 1.x artifact, as a disposition ledger — superseded
by requirement N, or dropped with no successor.

## Entries

### P-1 · The goal · keep

Jo, 2026-09-22: *"our goal is to build the best orchestration system that we can for me to get
newdle (and my own personal work), done as painlessly and efficiently as possible."*

Requirement: the system serves two workloads — Newdle and Jo's personal work — and is judged on
Jo's pain and throughput, not on the machinery's own consistency. Evidence that 1.x is not judged
this way: `INVENTORY.md` § 6 (a 11,630-token rules file paid by every tier at every turn;
`REVIEW.md` § 6) and `REVIEW.md` § 4 (six chartered rules, one enforced as written).

### P-2 · Project lanes · change (new capability, absent in 1.x)

Jo, 2026-09-22: *"our current machinery doesn't even include the concept of project lanes, though
many orchestrators do."*

Requirement: 2.0 has project lanes. Evidence of absence in 1.x: no artifact in `INVENTORY.md` § 1
models a project as a first-class unit of routing — routing is by repository/seat
(`INVENTORY.md` § 1.3; `O/state/ROUTING.md` rows are per repo, `REVIEW.md` § 4 rule 4 receipts) and
Linear projects exist only inside skills (`newdle-project-{spec,plan,sync}`, `INVENTORY.md` § 8).

**QUESTION (open, asked 2026-09-22)**
What a "project lane" is, in Jo's meaning — see the interview log below. Not resolved until Jo
answers; the requirement stands at the level of Jo's sentence.

## Interview log

- 2026-09-22 Q1 → Jo: what is a project lane (what it contains, who owns it, what moves through it,
  how it relates to a repo and a seat)? Jo, 2026-09-22: *"let me look into that further and let you know"* — pending on Jo.
