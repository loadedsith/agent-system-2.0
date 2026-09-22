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

### P-3 · Migration shape · change (1.x had no migration concept; Phase 5's constraint re-ruled)

Jo, 2026-09-22: *"let's follow your recommendation"* to the question: *2.0 is built in parallel
under its own profile, 1.x is never modified, cutover is one lane at a time starting with a real
but low-stakes workload, 1.x remains rollback until the last lane moves.* Jo's constraint that
drove it: *"keep in mind that I do still need to get work accomplished during this time period."*

Requirement: parallel build, per-lane cutover, 1.x untouched and retained as rollback. The lane
(P-2) is the unit of migration as well as of routing. Evidence for "own profile": every `omp`
launched without `OMP_PROFILE` ambiently loads all six 1.x extensions and the `~/.claude` chain
(`INVENTORY.md:313-314`) — isolation is not the default. GUESS carried into Phase 5: the extent of
`OMP_PROFILE` isolation (OMP layer yes; `~/.claude` layer only if the profile drops the `claude`
provider); settle by reading `OMP_SRC` profile resolution.

### P-4 · Plan shape and step verification · keep (strengthens the charter's per-step reversal rule)

Jo, 2026-09-22: *"these phases we're going through - they're just to build the plan to build this
machinery, right? I expect this plan to be long, complex, and have many phases. And I expect that
verification and testing of each step is vital before we move onto the next step."*

Requirement: Phases 1–5 produce the plan (`SPEC-2.0.md`, `DESIGN-2.0.md`, `MIGRATION.md`); the
build is a separate, separately approved plan (`.ai/plumb-seat-charter.md:176-180`). The build
plan may be long and many-phased; every step carries a verification that must pass before the
next step opens, in addition to the owner and reversal the charter already requires
(`:165-166`). Evidence from 1.x of the failure this guards against: the review found rules
believed enforced that never fired (`REVIEW.md` § 4 rule 1, rule 3 Glob branch) because nothing
verified them after they were installed.

Resolved 2026-09-22 — Jo: *"verification and testing of each step counts as both."* Requirement:
every build step has (a) an automated gate the machinery runs and the step must pass, and (b)
Jo's sign-off after using the step's output on real work. The recommended narrowing (sign-off only
for steps that change what Jo sees or types) was **not** adopted; Jo said both, unqualified, so
both apply to every step unless Jo narrows it later.

## Interview log

- 2026-09-22 Q1 → Jo: what is a project lane (what it contains, who owns it, what moves through it,
  how it relates to a repo and a seat)? Jo, 2026-09-22: *"let me look into that further and let you know"* — pending on Jo.
- 2026-09-22 Q2 → Jo: what counts as step verification — automated gate, manual sign-off on real work, or both? Jo: "both" — resolved into P-4.
