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

## What these are requirements *of* (ruled 2026-09-22, on Jo's question)

Jo asked: *"what are these the requirements of, exactly? are they the requirements of how the
entire machinery will work, or does that happen in the design phase?"*

These are requirements **on the machinery's behaviour as Jo experiences it** — what must be true
of 2.0 for it to be acceptable — not a description of how the machinery works. Each entry states a
guarantee, a shape, or a constraint; none states a mechanism. *How* the machinery satisfies them
is Phase 5 (`.ai/plumb-seat-charter.md:162-169`): `SPEC-2.0.md` restates these as the system's
contract, `DESIGN-2.0.md` chooses mechanisms and disposes of every 1.x artifact, `MIGRATION.md`
orders the build. Where an entry says "Phase 5 owes …" or "open for Phase 5", that is the line
between the two: the requirement stops there and the design begins.

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

Proofread 2026-09-22 — Jo: *"does 'automated gate' include an evidence based outcome (screenshot
or video)? As you go forward with it we'll want to tighten this to avoid 'lane said so'."*
Confirmed wording: the gate in (a) produces an inspectable artifact — command output, screenshot,
or recording, as fits the step — and that artifact, not the lane's statement, is what Jo's
sign-off (b) is given on. "The lane said so" is not a gate result. Research bearing:
`RESEARCH.md` pattern 5 (hand output goes to a file; a reference travels upward) and Osmani's
"evidence crosses the boundary" (`RESEARCH.md` § B).

Addendum 2026-09-23 — Jo: *"I believe I have something like a local version of phenixAi set up -
if this is true, could we use it as we build and shape each piece of 2.0"* and, on recording it:
*"record now - so the test will be built into one of our steps?"* Verified: a local Arize Phoenix
exists (`/Users/jowolff/.phoenix/phoenix.db`, 26.3MB, last written 4 weeks ago; installed under
`/Users/jowolff/.local/share/uv/tools/arize-phoenix/`), not running at the time of writing, wired
to Claude Code's OTel export in August 2026 (ctx sessions `efcdb0b4`, `53d6b03c`, `a02cd8d9`), never
to OMP. Missed by Phase 1; now `INVENTORY.md` § 1.7 last row.

Ruling: Phoenix is a **Phase 5 candidate for the observation layer** — the machinery-produced
evidence behind P-4 gates (a trace with required spans present is an artifact, not "the lane said
so"), P-8b observed liveness (span timestamps written by the runtime), P-7c message state
(consumption visible as a span), and P-16 (errors and repetitions counted from spans). Also the
build-time use Jo asked for: each 2.0 piece's traces during its sign-off period are the evidence
P-4 (b) is given on.

**Test built into a step, yes.** The gating unknown is whether OMP emits OTel spans at all, and in
what shape — every receipt above is Claude Code emitting. That test (start Phoenix, point one OMP
session at `http://localhost:6006/v1/traces`, see what lands) is the second early Phase 5 item
beside the ctx `pi`-root registration test (`RESEARCH.md` § "Early Phase 5 tests"). It activates a service
on the machine, so Tinker or Jo runs it, not Plumb. Outcome decides the design: OMP emits → Phoenix
is the store for the requirements above; OMP does not → either an OMP extension that emits spans
or a transcript-fed pipeline (the fallback the August sessions sketched), and Phoenix is judged
against P-14 on that cost.

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

Resolved 2026-09-23 — Jo asked: *"How do named persistent lanes work in a world where a lane
functions as it will in 2.0? It's okay if we don't keep named persistent lanes."* Plumb's answer
(recorded as the ruling; Jo: *"i agree with this direction"*): named persistent lanes are not a
tier in 2.0. Persistence is a property of the **workload**, not of a named agent. Each thing a
1.x seat carries is re-homed:

- **Address** → the workload's name; the one surface (P-6) routes by workload, no persona.
- **Charter** → a per-workload brief (purpose, ceiling, reserved-list exceptions) plus per-repo
  rules a lane loads when it checks a repo out.
- **Memory** → the P-13 store; continuity lives in the store, not in the lane. A lane that
  closes loses nothing a new lane cannot recall (P-13, P-17).
- **Per-repo expertise** → per-repo memory in the store, loaded on checkout. This answers the
  held question above: "load on checkout" is the default; a standing per-repo lane is not a
  tier, only a workload that happens not to close.
- **Persistence** → a lane lives as long as its workload. Standing workloads ("Jo's personal
  work", "Newdle ops") are persistent in effect, named by what they do, not who they are.

Consequence stated plainly, per the charter's own test: this abolishes the 1.x seats as personas,
Plumb included. Research bearing: `RESEARCH.md:316` (Yegge: agent ≠ session; seat = persistent
identity is an addressing convenience; survey: lane = worktree + terminal in 4 of 5 tools).
`REQUIREMENTS.md` P-5's last column ("where per-repo expertise lives") is discharged by this
ruling; the store's shape is still the P-13 Phase 5 choice.

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
  `INVENTORY.md:427-429`). Proofread 2026-09-22 — Jo: *"we'll want something other than context
  to store our tasks state and steps."* Confirmed: task state and steps live in a store outside
  any context window, written by the machinery as a side-effect of the work, not by a lane
  choosing to write a status. The orchestrator reads the store; a lane's context can be lost
  without the orchestrator losing the lane. This is the same store P-13/P-17 need (`RESEARCH.md`
  Question 1, index plus ledger).
- **P-7b · The orchestrator acts on its own authority by default.** Proofread 2026-09-22 — Jo, on
  the earlier wording "does not act on its own authority where Jo's word is required": *"doesn't
  this mean the orchestrator won't be able to do ANYTHING without my say so? we are going for the
  opposite."* Confirmed: the orchestrator opens hands, routes, retries, merges within policy, and
  escalates without asking. A short **reserved list** stays Jo's — opening and closing a phase,
  and any approval Jo has explicitly reserved; the rest of the list is open (see the proofread
  note below this entry). Everything not on the list is the orchestrator's call. 1.x failure the
  reserved list guards: Lintel opened Phase 1 for Plumb without Jo's word and had to unwind it
  (`.ai/decision-log/2026-09-21--2301--plumb--first-wake-pronouns-and-phase-1-opened.md`). Research
  bearing: Osmani — *"Agents can be asked to choose, route, merge, and escalate safely inside a
  policy, but they cannot inherit the consequences"* (`RESEARCH.md` § B).
- **P-7c · Jo learns the state of a message, not just its arrival.** Proofread 2026-09-22 — Jo:
  *"If we keep the orchestrator rotating very fast, this is fine, but its entirely possible for a
  user message to queue with the UI for HOURS."* Confirmed: three observable states — *delivered*
  to the lane, *consumed* (the lane's turn has read it), *acted on* — and Jo is told which. A
  message that stays delivered-but-unconsumed past a threshold surfaces as an exception (P-8c);
  the orchestrator may interrupt a lane's turn to force consumption when Jo marks a message
  urgent. 1.x failure: `seat_message` returns `queued` and `delivered` as distinct outcomes and
  `queued` is explicitly not delivery (OMP persistent-seat contract, session instruction); nothing
  in 1.x reports consumption at all. Research bearing: Yegge's `gt nudge` exists because arrival
  was unreliable and even then promises only *"within 5 minutes or so"*; no source documents
  queue age (`RESEARCH.md` § C, pattern 10).

Plumb's GUESS on the joining pattern (a hop that adds no knowledge) is not a requirement; the three
facts above are.

**P-7b reserved list — ruled 2026-09-22.** Jo asked for help determining it, then confirmed
the four items below ("yes"). Item 3 is narrowed to a concrete command list in Phase 5. Each
item with the evidence it comes from:
1. Opening and closing a phase — on the list (Jo's 1.x failure, above).
2. Spend above a lane's ceiling — P-9 already says the ceiling bounds a lane without per-dispatch
   approval; exceeding it is the one spend event with nowhere else to go.
3. Irreversible actions outside the repository — remote push, production writes, deletion that
   bypasses quarantine; 1.x's `careful` skill enumerates these (`INVENTORY.md`), and Osmani's
   Verdict is *"the final decision we make before work enters our dependent system"*.
4. Changes to the system's own rules or machinery — P-16 already says the system proposes and
   never applies; listing it here makes P-7b and P-16 the same rule.
Explicitly *not* on the list: dispatching hands, choosing tiers within the ceiling, merging within
policy, retrying, escalating — Jo's "we are going for the opposite".

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
  orchestrator's knowledge of a lane must not depend on the lane choosing to report. Proofread
  2026-09-22 — Jo: *"what closes this loop?"* Confirmed: closed by machinery-written state (P-7a),
  observed liveness and absence-of-progress detection (process alive, time since last tool call),
  and P-4's evidence artifacts. A lane's report is informational; nothing the orchestrator decides
  depends on it. Research bearing: `RESEARCH.md` pattern 4 (the runtime, not the agent, is the
  recorder) and Yegge's problems view states *"Zombie"* / *"GUPP Violation — hooked work with no
  progress for an extended period"* (§ C).
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

### P-10 · Every rule is re-decided · change (1.x rules accreted; none was ever retired by decision)

Jo, 2026-09-22: *"I feel like we may want to revisit all the rules we have during this process and
probably coin some new ones and retire some older ones."*

Requirement: no 1.x rule carries into 2.0 by default. Each existing rule gets a disposition
(keep / change / drop), new rules are coined where the requirements need them, and each rule that
survives is assigned an enforcement class under P-11 (once ruled). Evidence of the 1.x shape:
rules accreted across `~/.claude/CLAUDE.md`, the plugin's `references/output-types.md`, seat
charters, and workspace `AGENTS.md` with no disposition record (`INVENTORY.md` § 2 authority
graph; `REVIEW.md` § 5 drift — the same rule stated in up to four places with differing text).

Where the rule-by-rule pass happens: Plumb's recommendation is Phase 5 (`DESIGN-2.0.md` is already
the disposition ledger by the Phase 3 unit-of-decision ruling), as a dedicated step Jo rules on
in batches — not in Phase 3, which sets requirements, not rule text. Confirmed 2026-09-22 — Jo: *"agreed to
the rule-by-rule pass being in step 5 rather phase 3"*.

### P-11 · Enforcement policy: mechanical at tool boundaries, written elsewhere · change (1.x: written everywhere, enforced almost nowhere)

Jo, 2026-09-22: *"as far as Q9 - i agree with your recommendation"* to: for the class of rule that
is cheap to gate at a tool boundary — a message to a forbidden channel, a write to the lane's own
governing text, a dispatch above the lane's ceiling — 2.0 prevents it mechanically; the rest are
written rules.

Requirement: every rule surviving P-10 is classed **mechanical** (a hook or tool gate refuses the
action) or **written** (text the lane is trusted to follow). A rule is mechanical whenever the
forbidden action is a single identifiable tool call; the enforcement point is built and verified
(P-4) as part of the step that installs the rule. 1.x evidence for what this replaces: of six
machine-checked rules traced, the envelope check never fires for hands, the `careful-guard` Glob
branch is dead, and the channel rule and charter read-only marker are prose only
(`REVIEW.md` § 4, § 7). Phase 5 owes: the list of mechanical rules and, for each, the tool call
it gates.

### P-12 · Jo can plan with a lane before it executes · change (1.x: a seat plans or executes as its charter says; the option is not Jo's per task)

Jo, 2026-09-22, offered as an example of the requirement/design line: *"i want the option to plan
larger tasks with a lane instead of the lane just executing"*.

Requirement: for a task Jo judges large, Jo can choose to work the plan out with the lane —
conversationally, before anything is dispatched or built — rather than the lane going straight
to execution. The option is Jo's, per task, and the lane executes by default when Jo does not
take it. Evidence of the 1.x shape: whether a seat plans first is fixed by charter text and skill
(`planner` hand type, `newdle-project-plan` skill, `INVENTORY.md` § 8), not offered to Jo at the
moment of the task. Phase 5 owes: how Jo takes the option (a word, a mode, a flag) and what
"large" means if the lane is to offer it unprompted.

Confirmed 2026-09-22 — Jo: *"that is a big one. essentially i want the option to spec and plan
certain projects, and I want to know the best way to do it (which will require research - is it
omp's own plan mode? is it a skill in agent-superpowers (https://github.com/obra/superpowers) or
addy osmani's agent skills https://github.com/addyosmani/agent-skills). not all tasks will require
this, but i should at least be given the option to go through this process at the appropriate
time (unsure if that's before or after a lane is built)"*

Requirement, widened: Jo can choose to **spec and plan** a project through the system — not only
plan a task with a lane. Weight: Jo calls it "a big one". Two things are deliberately open:

- **Which planning practice** — OMP's own plan mode, a skill from obra/superpowers, a skill from
  addyosmani/agent-skills, or something else. This is a **Phase 4 research item** (queued below);
  Jo wants the best way found, not assumed. 1.x fact for the research to start from: 1.x already
  ships `spec-driven-development`, `planning-and-task-breakdown`, `newdle-project-spec`,
  `newdle-project-plan`, and `planner` (`INVENTORY.md` § 8), none of which Jo names here.
- **When the option is offered** — before a lane exists for the project (planning creates the
  lane) or inside a lane already built. Jo is unsure. Held as a **QUESTION for Phase 5**, to be
  answered with the research in hand rather than now; the requirement is only that the option is
  offered "at the appropriate time" and that not every task needs it.

### P-13 · Persistent, cross-repo memory of work *and decisions* · change (1.x: ctx sees the wrong sessions; seat continuity lives in files nothing indexes)

Jo, 2026-09-22: *"do our requirements cover a persistent, cross-repo memory system (right now
we're using ctx but that is not set in stone)?"* Checked: they did not. P-5 holds per-repo
expertise as a Phase 5 question; P-7a is the orchestrator's knowledge of *live* lane state. No
entry required that what a lane learned survives the lane, the session, or the repository.

Confirmed 2026-09-22 — Jo: *"let's follow your recommendation"* (the draft plus "decisions as well
as transcripts"). Requirement: a lane can recall prior work — its own and other lanes', in any
repository — **and the decisions made about it**, with provenance; the recall persists across
sessions and across the 1.x → 2.0 cutover. The tool is not fixed: ctx is the 1.x incumbent, not a
requirement.

Ruled 2026-09-22 (after Phase 4 research) — Jo: *"let's follow your index plus ledger."* Shape:
an **index** built after the fact over sessions (ctx is the incumbent; the OMP seat-session gap
below must close or the index is replaced) **plus** a **ledger** the machinery and lanes write as
they work — decisions, task state and steps (P-7a), and what a lane injects at wake (P-17). Beads
is a candidate for the ledger, not a choice (`RESEARCH.md` Question 1;
`research/phase4/research-F-memory-system.md:14-99`).

1.x evidence: ctx indexes Claude Code / Codex / Cursor / Copilot / Kimi / OpenClaw history and
**zero** OMP sessions — 581 seat-session `.jsonl` files under `~/.omp/agent/seat-sessions/`,
newest that day, indexed by nothing (`REVIEW.md` § 7 row "ctx corpus", § 8). Seat continuity is
instead carried by decision-log entries, `session-handoff.md`, and compaction summaries, none of
which ctx indexes either (`REVIEW.md:317-319`). The only machinery is a gate that a ctx search was
*called* before the first `grep` (`X/ctx-first-search.ts:235-236`), which holds nobody to using
the result (`REVIEW.md` § 7 row 7).

### P-14 · Runs within Jo's actual means · keep (a constraint Jo has always had; never written down)

Jo, 2026-09-22, on Steve Yegge as a source: *"yegge is a very extreme person to look to - he has
creates software factories using multiple claude pro max subscriptions - i do not have the funds
to do this."*

Requirement: 2.0 is designed for the subscriptions and budget Jo actually has, not for a fleet.
Any practitioner pattern that assumes many parallel paid subscriptions is evidence about what is
possible, not a target. Phase 5 owes: the concrete ceiling (which subscriptions, what monthly
spend) — Jo to state it when the design needs the number; not asked in Phase 3.

### P-15 · Portable machinery: reproducible from a GitHub repo · change (1.x is spread across five roots and one plugin cache)

Jo, 2026-09-22 (after Phase 3 closed; appended by the standing rule that later requirements
append without reopening): *"i want this system to be portable. not entirely portable - i don't
need state and specific lanes to be portable, but I want to be able to go to my github repo and
create a version of this system that is as up to date as the one I am working with."*

Requirement: the machinery — orchestrator, lane and hand definitions, rules, enforcement, skills —
lives in one repository from which an up-to-date copy of the system can be created on another
machine. Excluded by Jo: state, and specific lanes. 1.x evidence: governing artifacts sit on five
roots plus a plugin cache (`INVENTORY.md` § 1; skills on five roots + Homebrew, § 8), seat homes
carry their own charters and memories (`launch-seat:95-169`), and only the plugin part is
installable from elsewhere. Phase 5 owes: the line between "machinery" and "state" for each
artifact class (a lane's charter? memory? the model-routing rule?), and the install path.

### P-16 · Self-improvement: the system proposes fixes to itself · change (1.x: lessons are human-promoted only) — lower priority, by Jo

Jo, 2026-09-22: *"it must be able to self improve. e.g, it notices a certain amount of errors and
suggests a hook or a prose fix, or it notices i've repeated something multiple times and suggests
a skill. the self-improving part is lower priority"*

Requirement: the system observes its own failures and repetitions and **proposes** a change — a
hook, a prose fix, a skill — for Jo to accept. Proposes, not applies: P-7b (no acting on Jo's
authority) and P-11 (every rule installed with its gate and verified) govern what happens after
Jo says yes. 1.x evidence: memory is human-promoted by charter (`REVIEW.md` § 4 rule 6) and the
only self-observation is the "Candidate lessons" convention in prose; nothing counts errors or
repetitions. Priority: lower than P-1..P-15, by Jo.

**Plumb's weigh-in, asked for by Jo — does P-15 necessitate P-16?** No, and the dependency runs
the other way. Portability (P-15) is "the machinery lives in one repo and installs from it";
self-improvement (P-16) is "the system proposes changes to itself". A portable system that never
self-improves is complete. A self-improving system that is *not* portable drifts: each accepted
proposal lands in a local file and the GitHub copy falls behind — the 1.x failure in miniature
(five roots, two copies of `html-report` and `jo-deck` differing, `INVENTORY.md` § 8). So P-16
depends on P-15: every accepted proposal must land in the portable repository. That is recorded
here as a design constraint on P-16, not as a new requirement. (Inference from the two rulings
and the § 8 evidence — GUESS on whether Jo agrees with the direction of dependency.)

### P-17 · Continuity across compaction and restart · change (1.x: hand-written handoff files and a plugin snapshot, none required, none checked)

Jo, 2026-09-22: *"one of the requirements is that an agent must be able to resume from compaction
or session shut down and have an understanding of what it was recently working on (i think we
might have this covered by the memory requirement)"*

Checked against P-13: partly. P-13 is the **store** — prior work and decisions recallable on
demand, across repos and sessions. This is the **behaviour at resume** — a lane comes back from
compaction or shutdown already knowing what it was doing and what is pending, without Jo (or the
orchestrator) re-briefing it. Recorded separately because a system can satisfy P-13 (everything
is queryable) and fail this (nothing queries it at wake). Requirement: on resume, a lane's first
turn is grounded in its own recent work — what it was doing, what is pending, what was ruled —
automatically. Depends on P-13 as its substrate; the orchestrator's held lane state (P-7a) is the
other half.

1.x evidence: continuity is carried by three hand-maintained things — a seat-written
`session-handoff.md` (gitignored, exists only if the seat keeps it), decision-log entries, and
the plugin's pre-compaction snapshot injected at session start ("Newdle OMP continuity",
`INVENTORY.md:376` SessionStart injections) — plus the wake prompt naming the charter, memory,
and two decision-log entries as files to read (`launch-seat:283`; `REVIEW.md:80`). None is
indexed by ctx (`REVIEW.md:317-319`); nothing verifies a seat actually read them.

### P-18 · No dependency on the newdle plugin · keep (Jo's standing constraint, promoted to a requirement)

Jo, `JO-INPUT.md:9`: *"I am FINE with uninstalling the newdle-claude-plugin. In fact assume that at
the end of this I will. My team members do not need my machinery"*. Asked 2026-09-23: *"does 2.x
assume i have the newdle plugin installed?"* — checked: no P-item said so either way; the word
appears in `REQUIREMENTS.md` zero times and in this file only as 1.x evidence (P-10, P-15, P-17).
Jo, 2026-09-23: *"yes"* to recording it.

Requirement: 2.0 does not depend on the newdle plugin being installed. Every plugin-shipped
artifact 2.0 keeps — hooks (careful-guard, output-types-guard, the compaction snapshot), agent
definitions, skills, `references/output-types.md` — is either re-homed into the portable repo
(P-15) or dropped (P-10), decided per artifact in the Phase 5 rule pass. Nothing is kept by
staying where it is. 1.x evidence: the hand tier's governing text is largely plugin-shipped
(`INVENTORY.md` § 1.9 plugin provenance summary; § 3.2 "plugin-loss" column).

**GUESS (Plumb, labeled)**: the harder half of this is not the uninstall but the re-homing —
the plugin's hooks are the only mechanical enforcement 1.x has (`REVIEW.md` § 4), so P-11's
"mechanical whenever the forbidden action is a single tool call" has to be rebuilt in the
portable repo, not inherited. That is a Phase 5 design cost, recorded here so it is priced.

## Jo's hypothesis of the final shape (recorded 2026-09-22; a research input, not a requirement)

Ruled 2026-09-22 (after Phase 4 research) — Jo: *"let's absolutely use the vocabulary without the
umbrella."* 2.0 documents use nodes / edges / shared state / interrupt as vocabulary and do not
name the system "graph engineering"; the phrase's origin (a July-2026 X coinage, contested by
LangChain, four meanings per Turing Post) is stated once in `SPEC-2.0.md`
(`research/phase4/research-A-graph-engineering.md:17-55`).

Jo, 2026-09-22: *"essentially what I am trying to do is known as graph engineering right now. in
short: Graph engineering is the practice of connecting multiple specialized AI agents into an
organized workflow where they pass tasks, decisions, and shared information to each other. …
Nodes: The individual AI agents or functions that perform specific jobs … Edges: The rules and
pathways that decide how work flows from one agent to the next, including branching paths or
loop-backs for corrections. Shared State: The central record of what the system currently knows,
which updates and travels along with the work … i believe that is what our final shape will look
like, but again it requires research."*

Status: Jo's hypothesis, held as a GUESS about the design until Phase 4 checks it against sources.
Plumb has not verified the term or the definition (nothing fetched). Observed mapping to the
requirements, for the research to test, not to assume: nodes ↔ lanes and hands (P-2, P-8); edges ↔
routing and the orchestrator (P-6, P-7, P-9); shared state ↔ held lane state and memory (P-7a,
P-13).

## Research queue for Phase 4 (from Phase 3 rulings)

**Jo's priorities, 2026-09-22** — *"i really want to highlight the importance of what we're doing
as graph engineering, and also of what Addy Osmani calls 'owning the outer loop'"*. Ordered:

1. **Graph engineering** — as Jo defines it above: nodes, edges, shared state. Whose term, what
   its practitioners say, how it maps to P-2/P-6/P-7/P-9/P-13.
2. **Addy Osmani, "owning the outer loop"** — Jo's phrase for Osmani's idea; Plumb has not read
   it and does not know what it denotes (GUESS: the human's loop around agent runs — nothing
   fetched). Fetch and cite Osmani's own text first.
3. **Steve Yegge** — read under P-14: extract patterns that do not depend on fleet-scale
   subscriptions; mark the rest as out of Jo's means. The charter's "Osmani and Yegge first"
   (`.ai/plumb-seat-charter.md:158-160`) stands, with Yegge read through the P-14 lens by Jo's
   ruling here.

Then, unordered:

- Planning practice for P-12: OMP plan mode (`OMP_SRC`, whatever it exposes); obra/superpowers
  (https://github.com/obra/superpowers); addyosmani/agent-skills
  (https://github.com/addyosmani/agent-skills). Compare against the 1.x skills named in P-12.
  Neither URL fetched in Phase 3 — Jo named them; Plumb has not read them.
- Jo's friend's orchestrator "FM" (P-2): anything written down about lanes, if Jo can obtain it.
- Memory system for P-13: what ctx can and cannot index (OMP/Pi provider roots — `REVIEW.md` § 8 GUESS), and alternatives. Not fetched in Phase 3.
- `OMP_PROFILE` isolation extent (P-3 GUESS): settle by reading `OMP_SRC` profile resolution.


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
- 2026-09-22 Q9 → Jo: enforcement policy — mechanical prevention vs written rule — for which classes of rule? Jo asked whether this covers only existing rules; answered: no, it is the policy for any rule, and all rules are re-decided (P-10). Q9 resolved: mechanical at tool boundaries, written elsewhere — P-11. Rule pass confirmed for Phase 5 (P-10).
- 2026-09-22 Q10 → Jo asked whether "plan larger tasks with a lane instead of executing" is Phase 5 material. Answered: no, it is a requirement — recorded as P-12. Jo confirmed: "that is a big one" — widened to spec-and-plan; planning practice → Phase 4 research queue; before/after lane → Phase 5 QUESTION.
- 2026-09-22 Q11 → Jo asked whether persistent cross-repo memory is covered. Checked: no. Draft P-13 written in Plumb's words; Jo confirmed with "decisions as well as transcripts" — P-13.
- 2026-09-22 Jo offered "graph engineering" as the hypothesised final shape — recorded as a research input, not a requirement.
- 2026-09-22 Jo: Yegge is out of Jo's means (multiple Max subscriptions) → P-14; graph engineering and Osmani's "owning the outer loop" set as Phase 4 priorities 1 and 2; Yegge read under the P-14 lens.
- 2026-09-22 (after close) Jo added portability → P-15, and self-improvement (lower priority) → P-16, asking Plumb to weigh in on whether P-15 necessitates P-16. Answered in P-16: no; P-16 depends on P-15.
- 2026-09-22 Jo asked whether resume-after-compaction/shutdown is covered by memory. Checked: partly — P-13 is the store, resume behaviour is distinct → P-17.
- 2026-09-22 Q2 → Jo: what counts as step verification — automated gate, manual sign-off on real work, or both? Jo: "both" — resolved into P-4.
- 2026-09-23 Jo asked how named persistent lanes work under 2.0's lane model, "okay if we don't keep" them. Answered: persistence belongs to the workload; personas dropped; re-homing per artifact — Jo: "i agree with this direction" — resolved into P-5.
- 2026-09-23 Jo asked whether a local "phenixAi" exists and can be used while building 2.0. Verified: local Arize Phoenix, missed by Phase 1; recorded under P-4 as an observation-layer candidate with the OMP-emits-OTel test queued as an early Phase 5 item.
- 2026-09-23 Jo asked whether 2.x assumes the newdle plugin is installed. Checked: no P-item said so; Jo: "yes" to recording it — P-18.
