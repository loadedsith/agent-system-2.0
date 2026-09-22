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

### P-2 · Lanes · keep (the concept exists in 1.x under another name; 2.0 names it and models it explicitly)

Jo, 2026-09-22: *"our current machinery doesn't even include the concept of project lanes, though
many orchestrators do."*

Requirement: 2.0 has project lanes. Evidence of absence in 1.x: no artifact in `INVENTORY.md` § 1
models a project as a first-class unit of routing — routing is by repository/seat
(`INVENTORY.md` § 1.3; `O/state/ROUTING.md` rows are per repo, `REVIEW.md` § 4 rule 4 receipts) and
Linear projects exist only inside skills (`newdle-project-{spec,plan,sync}`, `INVENTORY.md` § 8).

Resolved 2026-09-22 — Jo: *"lanes are the resources his orchestrator (he calls FM) manages.
basically he approached the same problem I did - too many separate llm windows open in terminal.
his lanes are our marches."* and *"I think we already employ them, we just call them something
different."*

Requirement, restated: a lane is a **managed resource of the orchestrator** — a persistent
working context that would otherwise be one more terminal window — and 2.0 has lanes as its
first-class unit. 1.x has the concept: the twelve persistent seats under Lintel
(`INVENTORY.md` § 1.2, `persistent-seats.json`), each one window, each managed by HerdR and
addressed through `seat_message`. What 1.x lacks is the concept *as a unit the machinery
reasons about*: seats are enumerated in a roster and a routing table but nothing models a seat's
workload, state, or capacity (`REVIEW.md` § 4 rule 4 receipts; `INVENTORY.md:427-429` — two
rosters, neither read by the thing that routes). The earlier "absent in 1.x" reading was Plumb's
mistake and is corrected here.

**GUESS (Plumb, labeled)**: "our marches" here means the seats specifically, not the whole
three-tier system the charter calls the Marches (`.ai/plumb-seat-charter.md:138-139`) — basis:
"too many separate llm windows" is a description of seats, not of Lintel or hands. What settles
it: Q3 below.

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

### P-5 · Lanes are workload-bound · change (1.x seats are repository-bound)

Jo, 2026-09-22: *"i think your recommendation is right, as much as I liked the idea of each repo
having their own named seat as a subject matter expert."*

Requirement: a 2.0 lane is bound to a workload (a project, a feature, "Jo's personal work") and
checks out whichever repositories it needs; repositories are not the unit. Evidence of the 1.x
shape being replaced: one home directory per seat (`launch-seat:95-169`), routing per repo
(`O/state/ROUTING.md`), cross-repo work coordinated only through Lintel (`REVIEW.md` § 5 — the
routing table is stale in eleven places).

**Held, not dropped — Jo's liked thing**: per-repo subject-matter expertise. Jo said they liked
it; the ruling changes the *binding*, not the *value*. Where per-repo knowledge lives in 2.0 when
no seat is per-repo (per-repo memory a lane loads when it checks the repo out? a standing per-repo
lane for the repos that are big enough?) is a design question for Phase 5, recorded here so it is
not lost. Marked **change**, not drop.

### P-6 · One window by default · change (1.x has twelve panes and a router Jo bypasses)

Jo, 2026-09-22: *"if we switch to lanes being workload-bound, do i have to interact with them
individually? i'm not against it, but part of the problem I was trying to solve was not having to
manage 3 or 4 terminal instances."*

Evidence from 1.x: twelve seats means twelve HerdR panes (`persistent-seats.json`, 12 seats +
1 scheduler, `INVENTORY.md:73`); Jo interacts with Plumb directly by charter
(`.ai/plumb-seat-charter.md:333-363`) and with other seats through Lintel. So 1.x already has
the many-windows shape Jo names as the problem, *and* a single front door (Lintel) that Jo
bypasses for at least one seat.

Resolved 2026-09-22 — Jo: *"yes it is a requirement, i think your recommendation is the correct one
and we are to switch to workload-bound lanes."*

Requirement: Jo talks to one surface by default; it routes to lanes and relays back; Jo may open
any single lane directly on demand (as with Plumb now). Together with P-5 (confirmed again here):
lanes are workload-bound. Design consequence carried to Phase 5: the single surface must be able
to route on *workload*, which 1.x's per-repo routing table cannot express (`O/state/ROUTING.md`;
`REVIEW.md` § 5).

### P-7 · The surface is the orchestrator · change (1.x: Lintel is a front door over HerdR + rosters)

Jo, 2026-09-22: *"i've had frustrations with the 1.x lintel shape though I can't quite pin them
down. I think I want it to be me talking to the thing that manages lanes."*

Requirement: the single surface (P-6) is the orchestrator itself — the thing that holds the lane
model, routes to lanes, and relays back — not a conversational layer that asks something else to
do those things. Evidence of the 1.x shape being replaced: Lintel is an OMP seat whose knowledge
of the other seats is a routing table and two rosters maintained by hand (`O/state/ROUTING.md`;
`INVENTORY.md:427-429`), process control is HerdR, and delivery is a mailbox with `queued` and
`delivered` as distinct outcomes; nothing in that chain models a seat's work.

Pinned 2026-09-22 — Jo, shown three measured properties of the 1.x front door: *"honestly all 3
of those frustrate me."* Each becomes a requirement 2.0's orchestrator must satisfy:

- **P-7a · Knowledge is held, not relayed.** The orchestrator's knowledge of lanes is the lanes'
  actual state, not a document about them. 1.x failure: routing from a hand-maintained table and
  two rosters nothing reads back (`O/state/ROUTING.md`, stale in eleven places, `REVIEW.md` § 5;
  `INVENTORY.md:427-429`).
- **P-7b · The orchestrator does not act on its own authority where Jo's word is required.** Opening,
  closing, and approving are Jo's; the orchestrator cannot substitute for them. 1.x failure: Lintel
  opened Phase 1 for Plumb without Jo's word and had to unwind it
  (`.ai/decision-log/2026-09-21--2301--plumb--first-wake-pronouns-and-phase-1-opened.md`); Jo's
  fix was to route around Lintel for one seat (`.ai/plumb-seat-charter.md:333-363`).
- **P-7c · Delivery is confirmed, not queued.** When Jo says something to a lane through the
  orchestrator, Jo learns whether it arrived. 1.x failure: `seat_message` returns `queued` and
  `delivered` as distinct outcomes and `queued` is explicitly not delivery (OMP persistent-seat
  contract, session instruction).

Plumb's GUESS on the joining pattern (a hop that adds no knowledge) is not a requirement; the three
facts above are.

### P-8 · The lane owns its hands · change (what Jo has been doing in 1.x is not this; see correction)

Jo, 2026-09-22: *"the lane owns its hands. the only reason i have been using the 1.x shape is
because I didn't trust the lane to own its own hands"* ("land" in the original, read as "lane").

Requirement: a lane spawns, briefs, and owns its hands; the orchestrator does not dispatch into a
lane; Jo does not have to approve each dispatch for the lane to be trusted with it.

**Correction (2026-09-22, Jo objected to the first wording).** The first draft of this entry said
"keep the mechanism", meaning only the OMP-level fact that a task agent is a child of the session
that spawns it (`OMP_SRC/task/executor.ts:3708-3812`) — a fact any lane-owns-hands design also
relies on. It read as keeping the 1.x *practice*, which is not what Jo ruled and not what Plumb
recommended. Plumb also used "the 1.x shape" for two different things across Q6 and P-8; Jo's
"the 1.x shape I have been using" is the practice Jo does not trust lanes to replace, and Plumb
has not yet asked Jo what that practice is. Nothing from 1.x practice is kept by this entry.

Jo, 2026-09-22, on what the 1.x practice actually is: *"i mostly let the named seat handle
dispatching the hand, but sometimes i find myself interacting with that seat directly. mostly i
trust it."* So 1.x practice is already mostly lane-owns-hands; the residue of distrust shows up as
Jo going to the seat directly sometimes — which P-6 keeps as a right (direct access on demand),
not a workaround. The requirement is therefore: the lane owns its hands, and Jo's direct access
to a lane is a choice, never something the lane's behaviour forces.

Pinned 2026-09-22 — Jo: *"i do trust what its hand report back, i often don't trust the named seat
to report back to lintel. one of the reasons is i can't see what it's doing until it tells me, but I
honestly have decided I don't need to know this unless an error occurs or something needs to be
brought to my attention. i feel that the spend problem can be mitigated by setting up rigorous
model routing"*

- **P-8a · Hand reports are trusted as-is.** Jo does not require machinery to check a hand's
  report. (The 1.x fact that no machinery does — `REVIEW.md` § 4 rule 1 — stays a fact, not a
  requirement; whether 2.0 checks anyway is a Phase 5 design choice, not a Jo preference.)
- **P-8b · The lane's report to the orchestrator is the distrusted link.** Jo often does not trust
  a seat to report back to Lintel. This is the same requirement as P-7a from the other end: the
  orchestrator's knowledge of a lane must not depend on the lane choosing to report.
- **P-8c · Visibility is exception-based.** Jo does not need to see a lane's work in progress;
  errors and things needing Jo's attention must surface, everything else stays quiet.
- **P-8d · Spend is governed by model routing, not per-dispatch approval.** A rigorous routing
  rule (which work gets which tier) replaces the 1.x spending gate
  (`.ai/plumb-seat-charter.md:365-404`) as the spend control. What "rigorous" means is open —
  interview log Q8.
 Jo's stated reason for
the 1.x workaround is distrust of lane-owned hands. What the distrust was *of* determines what
2.0 must guarantee about hands. Candidates from measured 1.x facts (interview log Q7), none
recorded as Jo's reason until Jo says so:
- spend — the model-selection gate exists because Jo said *"i do NOT want plumb to keep
  spawning fable seats"* (`.ai/plumb-seat-charter.md:365-404`);
- discipline — the output-types envelope is never checked for hands (`REVIEW.md` § 4 rule 1;
  `session_stop` not emitted for `agentKind === "sub"`, `OMP_SRC/session/agent-session.ts:4248`)
  and no `agent_type` reaches the guard, so a hand's report is unverified by machinery;
- visibility — a hand's work is invisible to Jo until the seat relays it; a seat can dispatch
  without Jo knowing (the spending gate was added after the fact, `2026-09-21--2301` decision log).

### P-9 · Model routing: work-kind rule plus a per-lane ceiling · change (1.x pins tier per hand type, chosen in prose)

Jo, 2026-09-22: *"i like your recommendation, let's go with that."* to: a work-kind rule maps the
task to a tier, mechanically, independent of hand type; and each lane carries a tier ceiling or
budget the orchestrator sets.

Requirement: the tier decision is not made in a lane's prose. A rule keyed on the kind of work
picks the tier; the lane's ceiling bounds it; no per-dispatch human approval. 1.x evidence for
what this replaces: tier pinned per agent file at line 4 (`P/agents/<type>.md:4`;
`.omp/agents/{scout,reader,builder,planner}.md`), the seat choosing the type in prose, and the
spending gate as the only check (`.ai/plumb-seat-charter.md:365-404`). Open for Phase 5, not for
Jo: the work-kind taxonomy and who sets a lane's ceiling (the orchestrator per P-7, presumably
from the workload's stakes — GUESS).

## Interview log

- 2026-09-22 Q1 → Jo: what is a project lane (what it contains, who owns it, what moves through it,
  how it relates to a repo and a seat)? Jo, 2026-09-22: *"let me look into that further and let you know"* — answered 2026-09-22 (lanes = the orchestrator's managed resources = our seats); resolved into P-2.
- 2026-09-22 Q3 → Jo: is a 2.0 lane bound to a repository as 1.x seats are (`launch-seat:95-169`, one home per seat), or to a workload that may span repos? Jo: workload-bound — resolved into P-5 (with the liked per-repo SME held).
- 2026-09-22 Q4 → Jo: is "one window by default" a requirement — a single conversation surface that routes to lanes, with direct access to a lane on demand? Jo: yes, a requirement — resolved into P-6; workload-bound lanes re-confirmed.
- 2026-09-22 Q5 → Jo: the surface is the orchestrator itself — resolved into P-7. Frustration with the 1.x Lintel shape is unpinned; candidates offered from observed 1.x facts (relay-only knowledge: rosters/ROUTING.md by hand; a phase opened without Jo's word, `.ai/decision-log/2026-09-21--2301--plumb--first-wake-pronouns-and-phase-1-opened.md`; delivery `queued` ≠ `delivered`). Jo: "honestly all 3 of those frustrate me" — recorded as P-7a/b/c.
- 2026-09-22 Q6 → Jo: lane owns hands or orchestrator dispatches into lanes? Jo: the lane owns its hands — resolved into P-8; distrust named as the reason for the 1.x workaround.
- 2026-09-22 Q6b → Jo: what the 1.x practice is. Jo: mostly the seat dispatches, sometimes Jo goes direct, "mostly i trust it" — folded into P-8.
- 2026-09-22 Q7 → Jo: what the *residual* distrust of lane-owned hands was of — spend, discipline, visibility, or other? Jo: hand reports trusted; seat→Lintel reporting distrusted; visibility only on error/attention; spend via model routing — P-8a–d.
- 2026-09-22 Q8 → Jo: what decides a hand's model tier in 2.0 — the hand *type* (1.x: pinned per agent file), the *task* as classified by the lane, or the *lane* itself (each lane has a tier budget)? Jo: work-kind rule plus lane ceiling — P-9.
- 2026-09-22 Q2 → Jo: what counts as step verification — automated gate, manual sign-off on real work, or both? Jo: "both" — resolved into P-4.
