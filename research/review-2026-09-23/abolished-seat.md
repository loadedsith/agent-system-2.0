**PMDW**

Lens: what the persona-less, workload-bound lane (P-5, ruled 2026-09-23) silently breaks in every other P-item. Critique only. Both artifacts read in full this session: `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md` (49 lines) and `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md` (571 lines). Nothing else opened. No files in the repo edited.

## Questions for Jo (decisions, not missing evidence)

**QUESTION**
Q1 — does "lane" get split into two words, or does P-5 get a cardinality sentence? Every finding below except F5 and F6 traces to one ambiguity: after P-5, "lane" names both the short-lived process instance (born and dies with a checkout) and the persistent addressable slot (the workload). Option one: coin two terms now (e.g. *workload* for the address/brief/ceiling/memory key, *lane* for the running instance) and reword P-2, P-7a, P-7b, P-7c, P-8b, P-9, P-13, P-17 accordingly before Phase 5 opens. Option two: keep "lane" and add one sentence to P-5 fixing cardinality (one live lane per workload at most; the workload outlives its lanes). Option one costs a reword pass on eight entries; option two costs nothing now and leaves eight entries readable two ways in the spec. Recommendation: option one, because P-7c and P-17 cannot be specified until the addressee and the wake key are named, and a cardinality sentence alone does not name them.

**QUESTION**
Q2 — is opening a workload (which allocates a ceiling and may carry reserved-list exceptions) on the P-7b reserved list or not? Option one: on the list — Jo opens every workload, the orchestrator only opens lanes inside workloads Jo has opened. Option two: off the list — the orchestrator may open workloads on its own authority, and only the *exceptions* clause of a brief is Jo's. Option one keeps P-7b item 4 intact but puts a human step in front of every new project; option two honours "we are going for the opposite" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:228-229`) but lets the orchestrator write its own spend authority. Recommendation: option two with a split brief (ceiling orchestrator-set, exceptions Jo-set), because the ceiling is exactly the thing P-9 already says the orchestrator sets.

## Findings, by severity

### F1 · critical · "Lane" now names two different things and eight entries depend on which one

**CLAIM**
P-2 defines a lane as "one persistent working context" (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:11`; `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:60-62`). P-5 rules "a lane lives as long as its workload" and "Persistence is a property of the **workload**, not of a named agent" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:161`, `:172-173`), and "A lane that closes loses nothing a new lane cannot recall" (`:167-168`).

**CLAIM**
Other entries use "lane" for the thing that survives context loss and closure: P-7a "a lane's context can be lost without the orchestrator losing the lane" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:223-224`); P-17 "a lane comes back from compaction or shutdown already knowing what it was doing" (`:489-490`); P-13 "its own and other lanes'" (`:413`); P-9 "each lane carries a tier ceiling" (`:328-329`); P-7b item 2 "spend above a lane's ceiling" (`:256`).

**GUESS**
Under P-5 the thing that survives is the workload, and the thing that is born and dies is the lane instance. The entries above were written when those were the same object (a 1.x seat). None says which one it means now. P-5 would have to say either "one lane per workload, and the workload is the durable identity" or introduce a second noun; without that, P-7a/P-7c/P-8b/P-9/P-13/P-17 are each readable two ways in `SPEC-2.0.md`. Fix hint: one cardinality-and-identity sentence in P-5, then a mechanical reword of the eight entries.

### F2 · high · "Workload" is used at three granularities, and the address is the workload name

**CLAIM**
P-1: "the system serves two workloads — Newdle and Jo's personal work" (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:10`; `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:40`). P-5 requirement: "bound to a workload (a project, a feature, 'Jo's personal work')" (`:146`). P-5 resolution: "Standing workloads ('Jo's personal work', 'Newdle ops')" (`:172-173`). P-5 address rule: "**Address** → the workload's name; the one surface (P-6) routes by workload" (`:164`).

**GUESS**
"Newdle" (P-1), "Newdle ops" (P-5 standing), and "a feature" inside Newdle (P-5 requirement) are three nesting levels all called workload. If address = workload name, a message to "Newdle" has no single lane to go to, and a feature-workload's ceiling has no stated relation to the "Newdle" ceiling. Nothing says whether workloads nest, whether a parent workload is addressable, or whether one live lane per workload is the rule. P-5 (or P-1) would have to say what a workload is at the addressing level, and whether a lane:workload is 1:1. Fix hint: P-5 names the addressable unit and states that P-1's two "workloads" are portfolios, not addresses (or the reverse).

### F3 · high · Who opens a workload and writes its brief is undefined, and the brief mixes orchestrator authority with Jo's

**CLAIM**
P-5: "**Charter** → a per-workload brief (purpose, ceiling, reserved-list exceptions)" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:165-166`). P-9 leaves "who sets a lane's ceiling" open for Phase 5 "not for Jo", with the GUESS "the orchestrator per P-7" (`:335-337`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:25`). P-7b item 4 reserves to Jo "Changes to the system's own rules or machinery" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:261-262`). The reserved list's four items do not include opening or closing a workload (`:255-262`); "Explicitly *not* on the list: dispatching hands, choosing tiers within the ceiling, merging within policy, retrying, escalating" (`:263-264`).

**GUESS**
A brief that carries reserved-list exceptions is a rules artifact (P-7b item 4 → Jo's), while the same brief's ceiling is, per P-9's own GUESS, the orchestrator's. One document, two authorities, and no entry says who may create it. Because opening a workload is not on the reserved list, the default reading of P-7b is that the orchestrator may open a workload, set its ceiling, and (since the brief is one thing) write its own exceptions. P-7b or P-5 would have to say whether workload creation is reserved and which fields of the brief each party owns. Fix hint: split the brief in P-5 into orchestrator-owned (purpose, ceiling) and Jo-owned (exceptions), and add "opening a workload" to P-7b either as reserved or as explicitly not reserved. See Q2.

**GUESS**
Secondary: P-11 names "a write to the lane's own governing text" as a mechanical-gate candidate (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:359-360`). After P-5, "the lane's own governing text" is the per-workload brief plus the per-repo rules; P-11 would have to re-point that gate at the brief, and decide whether a lane writing a *different* workload's brief is the same violation.

### F4 · high · P-7c's three message states have no addressee when no lane is live

**CLAIM**
P-7c: "three observable states — *delivered* to the lane, *consumed* (the lane's turn has read it), *acted on*"; "A message that stays delivered-but-unconsumed past a threshold surfaces as an exception"; "the orchestrator may interrupt a lane's turn to force consumption when Jo marks a message urgent" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:239-243`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:19`). P-5: address is the workload name, "no persona" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:164`); a lane closes with its workload (`:172`).

**GUESS**
Every P-7c state presupposes a lane exists to be delivered to. A message addressed to a workload whose lane has closed (or was never opened) has no "delivered" event, so the delivered-but-unconsumed threshold never starts, so the exception never fires — the exact hours-in-queue failure P-7c was written against (`:238-239`) recurs with a different cause. "Interrupt a lane's turn" for a closed lane is undefined (spawn one? refuse?). P-7c would have to say that the addressee is the workload, add a state for "queued, no live lane", and say whether urgent on a closed workload opens a lane. Fix hint: four states, with "held by orchestrator, no lane" as the first, and the threshold clock starting at *held*.

### F5 · high · P-3 "one lane at a time" has no mapping from per-repo 1.x seats to per-workload 2.0 lanes

**CLAIM**
P-3: "cutover is one lane at a time, starting with a real but low-stakes workload; 1.x stays as rollback until the last lane moves"; "The lane (P-2) is the unit of migration as well as of routing" (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:12`; `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:82-83`). P-2 identifies the 1.x instance of lanes as "the twelve persistent seats under Lintel" (`:62-63`). P-5: 1.x seats are repository-bound, "one home directory per seat", "routing per repo" (`:141`, `:148-149`); 2.0 lanes "check out whichever repositories" they need (`:146-147`).

**GUESS**
A 1.x seat and a 2.0 lane are not the same kind of unit, so "one lane at a time" does not name a step. Cutting over one *workload* means a 2.0 lane checks out repos that 1.x seats still own — two systems on one working tree, with the 1.x seat still receiving Lintel routing for that repo. Cutting over one *seat* has no 2.0 counterpart to move to. "Until the last lane moves" has no termination test: 1.x seats do not move, they become unaddressed once every workload touching their repo is on 2.0. P-3 would have to say (a) the unit is the workload, (b) the rule for a repo held by both systems during overlap (read-only on one side? disjoint branches?), and (c) the condition under which a 1.x seat is retired. Fix hint: P-3 says "cutover unit = workload; a 1.x seat is retired when no 1.x-routed workload touches its repo; during overlap 1.x seats do not write to a repo a 2.0 workload has checked out" — or whatever Jo rules, but it must be one of these.

**GUESS**
Corollary for P-13: recall "persists across the 1.x → 2.0 cutover" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:415`). 1.x memory is keyed by persona (seat charters and memories per home, `:453-455`, `:497-501`). P-5 re-homes per-repo expertise to per-repo memory (`:169-170`) but says nothing about the persona-keyed remainder (a seat's workload history that is not about one repo). P-13 would have to say what key 1.x persona memory is imported under.

### F6 · high · "Per-repo rules loaded on checkout" collides with P-10, P-11, and P-15

**CLAIM**
P-5: charter → "per-repo rules a lane loads when it checks a repo out" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:165-166`). P-10: "no 1.x rule carries into 2.0 by default"; 1.x rules "accreted across `~/.claude/CLAUDE.md`, the plugin's `references/output-types.md`, seat charters, and workspace `AGENTS.md`" (`:344`, `:347-348`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:26`). P-11: "A rule is mechanical whenever the forbidden action is a single identifiable tool call; the enforcement point is built and verified (P-4) as part of the step that installs the rule" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:364-366`). P-15: "the machinery — orchestrator, lane and hand definitions, rules, enforcement, skills — lives in one repository" (`:451-452`).

**GUESS**
Three collisions. (1) P-10: the existing per-repo rule files are the workspace `AGENTS.md` set — the fourth 1.x rule root P-10 names. "Loaded on checkout" imports them by default unless P-5 says the per-repo rules are *2.0-authored* files that passed the P-10 pass. (2) P-11: a per-repo rule that is mechanical needs a gate installed; "loaded on checkout" is a runtime event with no install step and no P-4 evidence artifact, so per-repo rules are written-only by construction, or P-11's install-step requirement needs a "gate loaded on checkout" variant. (3) P-15: rules that live in N work repos are not in "one repository", and Newdle work repos are shared with teammates, so the P-10 pass cannot retire a team rule unilaterally. P-5 would have to say whether per-repo rules are machinery (then they live in the portable repo keyed by repo, and P-15 holds) or state owned by each repo (then P-10 and P-11 have a carve-out to write). Fix hint: per-repo rules live in the machinery repo under a per-repo key and are applied on checkout; a work repo's own `AGENTS.md` is team text the lane reads as a written rule, not a 2.0 rule.

### F7 · medium · P-6/P-8 "open any lane directly, as with Plumb now" — the exemplar is abolished and the no-lane case is undefined

**CLAIM**
P-6: "Jo may open any single lane directly on demand (as with Plumb now)" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:196-197`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:15`). P-8: "Jo's direct access to a lane is a choice, never something the lane's behaviour forces" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:286-287`). P-5: "this abolishes the 1.x seats as personas, Plumb included" (`:175`); P-7: the orchestrator "holds the lane model" (`:207-208`).

**GUESS**
Direct access in 1.x is by persona (a named pane). After P-5 it is by workload name — but a workload may have no live lane. Opening "the lane for workload X" when none exists either creates one (then Jo, not the orchestrator, is the creator, and P-7's held lane model has to learn about it after the fact) or fails. P-6 would have to say whether direct access can instantiate a lane and, if so, that the orchestrator remains the creator. Fix hint: P-6 says direct access is "attach to the workload's live lane, or ask the orchestrator to open one" — never a side door.

### F8 · medium · P-17 covers compaction and shutdown; P-5 cites it for closure, which P-17 does not define

**CLAIM**
P-5: "A lane that closes loses nothing a new lane cannot recall (P-13, P-17)" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:167-168`). P-17: "on resume, a lane's first turn is grounded in **its own** recent work — what it was doing, what is pending, what was ruled — automatically"; trigger is "compaction or shutdown" (`:492-494`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:33`). P-17's Phase 5 column: "what is captured, when, and how wake verifies it was read" (`:33`).

**GUESS**
A new lane for a workload whose previous lane closed is not "resuming" and has no "own recent work" — the work belonged to a prior instance. P-17 as worded does not fire for it; P-13 (recall on demand) does, but P-13 is not automatic at wake, which is the exact distinction P-17 was recorded to preserve (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:491-492`). So P-5's guarantee ("loses nothing") is only half-backed. Also undefined: the key the wake payload is looked up by. In 1.x it is the seat (`:500-501`); in 2.0 it must be the workload, and if F2's nesting is unresolved the key is unresolved. P-17 would have to add "first lane opened for a workload with prior history" as a third trigger and name the workload as the key. Fix hint: P-17 triggers = compaction, shutdown, *and* first turn of any lane on a workload with a ledger.

### F9 · medium · P-8b absence-of-progress cannot tell a closed lane from a stalled one without a workload live/closed bit

**CLAIM**
P-8b: the loop is closed by "observed liveness and absence-of-progress detection (process alive, time since last tool call)" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:301-303`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:22`). P-7a: task state lives in a store "written by the machinery as a side-effect of the work" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:221-223`). P-5: lanes close with their workload (`:172`).

**GUESS**
In 1.x a seat is meant to be always up, so absence is a signal. In 2.0 a lane being absent is the normal end state of a finished workload, and a lane being absent on an *open* workload is a zombie. Distinguishing them needs the workload's open/closed state to be machinery-written into the P-7a store — and P-7a lists "task state and steps", not workload lifecycle. P-7a or P-8b would have to name workload open/closed as part of held state. Fix hint: one clause in P-7a: "…including each workload's open/closed state and which lane, if any, is live on it."

### F10 · medium · P-13 provenance has no identifier once personas are gone

**CLAIM**
P-13: recall "its own and other lanes' … **and the decisions made about it**, with provenance" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:413-414`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:29`). 1.x provenance for decisions is the seat's name in decision-log filenames (e.g. `2026-09-21--2301--plumb--…`, `:234`). P-5: "no persona" (`:164`).

**GUESS**
"Other lanes'" and "with provenance" both presuppose something stable to attribute to. A lane instance that is gone and had no name leaves provenance = workload name + time, at best — and if two lanes ever served one workload (F2), even that is ambiguous. P-13 would have to say the provenance key is (workload, lane-instance id, time) or similar. Fix hint: P-13 says provenance names the workload and a machinery-assigned lane instance id, never a persona.

### F11 · low · P-2 still says "persistent", still marked "keep", and carries a GUESS its own resolution has settled

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:11` marks P-2 "keep" and defines a lane as "one persistent working context". P-2's GUESS block says "'our marches' here means the seats specifically … What settles it: Q3 below" (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:70-73`); Q3 is resolved "workload-bound — resolved into P-5" (`:557`). P-5 says persistence belongs to the workload, not the lane (`:161`, `:172-173`).

**GUESS**
After P-5, "his lanes are our marches" holds for *managed resource that would otherwise be a window* and fails for *persistent* and for *seat = lane*. P-2's definition, its "keep" mark, and the un-closed GUESS all predate the ruling. Generic-ish (stale cross-reference), but the word "persistent" in the top-level definition of the system's first-class unit is not generic. Fix hint: P-2 reads "a managed working context, persistent for as long as its workload is", mark → "change", and the GUESS at `:70-73` is closed against Q3.

### F12 · low · P-15's "specific lanes need not be portable" has no 2.0 referent

**CLAIM**
P-15: Jo excludes "state and specific lanes" from portability (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:447-449`); requirement includes "lane and hand definitions, rules" as machinery (`:451-452`); Phase 5 owes "the line between 'machinery' and 'state' for each artifact class (a lane's charter? memory? the model-routing rule?)" (`:456-457`; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:31`).

**GUESS**
"A lane's charter" is now the per-workload brief (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:165`), which carries policy (ceiling, reserved-list exceptions) — rule-like, so machinery by P-15's list — while being the nearest thing 2.0 has to a "specific lane", which Jo excluded. P-15's Phase 5 column already asks the question; P-5 changed the answer's shape without the column noting it. Fix hint: P-15's open column adds "the per-workload brief" as a named artifact class to classify.

## Closing

**PMDW**
Twelve findings: one critical (F1), five high (F2–F6), four medium (F7–F10), two low (F11–F12). Fix F1 first — naming the durable thing (workload) apart from the instance (lane) and stating cardinality makes F2, F4, F7, F8, F9, and F10 mostly mechanical rewords; F3, F5, and F6 remain real decisions after that.

**ACTION**
`mkdir -p /Users/jowolff/agent-scratch/agent-system-2.0/triple-check` → exit 0; then wrote this file to `/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/abolished-seat.md`. Reverse: `rm /Users/jowolff/agent-scratch/agent-system-2.0/triple-check/abolished-seat.md`. No file under `/Users/jowolff/code/agent-system-2.0` was modified; no formatter, linter, or test run.

<!-- output-types
tier: 0
CLAIM: 13
CITE: 0
GUESS: 15 (inference 15)
ACTION: 1
PMDW: 2
QUESTION: 2
-->
