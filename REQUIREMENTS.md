# REQUIREMENTS — agent-system 2.0, for Jo's review

Derived from `PREFERENCES.md` (Phase 3 interview, 2026-09-22). One line per requirement, in Jo's
sense of the word: what must be true of 2.0 as Jo experiences it. Mechanisms are Phase 5.
`PREFERENCES.md` holds Jo's verbatim words, the 1.x evidence, and the interview log for each entry;
this file is the reviewable summary and is regenerated from it, never edited alone.

| # | Requirement | vs 1.x | Open for Phase 5 |
|---|---|---|---|
| P-1 | The system serves two workloads — Newdle and Jo's personal work — and is judged on Jo's pain and throughput, not on its own consistency. | keep | — |
| P-2 | Lanes are first-class: a lane is a managed resource of the orchestrator, one persistent working context that would otherwise be another terminal window. | keep (1.x has the resource as "seats", not the model) | — |
| P-3 | 2.0 is built in parallel under its own OMP profile; 1.x is never modified; cutover is one lane at a time, starting with a real but low-stakes workload; 1.x stays as rollback until the last lane moves. | change | extent of `OMP_PROFILE` isolation |
| P-4 | Phases 1–5 produce the plan, not the machinery. The build plan may be long and many-phased; every step passes an automated gate that produces an inspectable evidence artifact (output, screenshot, recording) **and** gets Jo's sign-off on that artifact after real use before the next step opens, on top of owner and reversal. "The lane said so" is not a gate result. | keep, strengthened | — |
| P-5 | Lanes are bound to a workload, not a repository; a lane checks out whatever repos it needs. | change | where per-repo expertise lives (Jo liked the per-repo SME seat; the value is held, not dropped) |
| P-6 | One window by default: Jo talks to a single surface that routes to lanes and relays back; Jo can open any lane directly on demand. | change | — |
| P-7 | That surface **is** the orchestrator — the thing that holds the lane model and routes — not a layer over something else. | change | — |
| P-7a | The orchestrator's knowledge of lanes is their actual state, never a document about them; task state and steps live in a store outside any context window, written by the machinery. | change | — |
| P-7b | The orchestrator acts on its own authority by default; reserved list stays Jo's: phase open/close, spend above a lane's ceiling, irreversible actions outside the repo, changes to the system's own rules. | change | item 3 command list — Phase 5 |
| P-7c | Jo learns the state of a message to a lane — delivered, consumed, acted on — not just arrival; delivered-but-unconsumed past a threshold surfaces as an exception. | change | threshold — Phase 5 |
| P-8 | The lane owns its hands: it spawns, briefs, and owns them; the orchestrator does not dispatch into a lane; Jo's direct access to a lane is a choice, never forced by the lane's behaviour. | change | — |
| P-8a | Hand reports are trusted as-is; Jo does not require machinery to check them. | keep | whether 2.0 checks anyway (design choice) |
| P-8b | The lane's report *to the orchestrator* is informational, never load-bearing; closed by machinery-written state (P-7a), observed liveness/absence-of-progress, and P-4 evidence artifacts. | change | — |
| P-8c | Visibility is exception-based: errors and things needing Jo's attention surface; everything else stays quiet. | change | what counts as an error; how it surfaces |
| P-8d | Spend is governed by model routing, not per-dispatch approval; the 1.x spending gate is retired. | change | — |
| P-9 | A work-kind rule picks a hand's tier, a per-lane ceiling bounds it, no human approval per dispatch. | change | the work-kind taxonomy; who sets a lane's ceiling |
| P-10 | No 1.x rule carries into 2.0 by default: every rule gets keep/change/drop, new rules are coined, old ones retired. The rule-by-rule pass is a Phase 5 step Jo rules on in batches. | change | the pass itself |
| P-11 | Every surviving rule is classed mechanical (a tool gate refuses the action) or written; mechanical whenever the forbidden action is a single tool call; the gate is built and verified in the step that installs the rule. | change | the list of mechanical rules and the tool call each gates |
| P-12 | Jo can choose, per project, to spec and plan it through the system before anything executes; not every task needs this, but the option is offered at the appropriate time. "A big one." | change | which planning practice (Phase 4 research); whether the option comes before or after a lane exists |
| P-13 | Any lane can recall prior work — its own and other lanes', in any repo — **and the decisions made about it**, with provenance, persisting across sessions and across the cutover. Shape ruled: an after-the-fact index (ctx incumbent) plus a machinery-written ledger (decisions, task state, wake); ledger tool is a Phase 5 choice, Beads a candidate. | change | ledger tool — Phase 5 |
| P-14 | 2.0 runs within the subscriptions and budget Jo actually has; fleet-scale patterns (many parallel Max subscriptions) are evidence, not targets. | keep | the concrete ceiling, when the design needs it |
| P-15 | The machinery is portable: an up-to-date copy of the system can be created from Jo's GitHub repo on another machine. State and specific lanes need not be. | change | which artifact classes are machinery vs state; the install path |
| P-16 | The system observes its own errors and repetitions and **proposes** a hook, prose fix, or skill for Jo to accept — never applies one itself. Lower priority (Jo). Depends on P-15: accepted proposals land in the portable repo. | change | what is counted, thresholds, how a proposal is surfaced (P-8c) |
| P-17 | On resume from compaction or shutdown, a lane's first turn is already grounded in what it was doing, what is pending, and what was ruled — automatically, without re-briefing. Distinct from P-13 (the store); depends on it. | change | what is captured, when, and how wake verifies it was read |

## Not requirements, recorded alongside

- **Jo's hypothesis of the final shape:** "graph engineering" — nodes (agents), edges (routing rules
  with branches and loop-backs), shared state (the travelling record). Held as a hypothesis for
  Phase 4 to check; Jo's own words are in `PREFERENCES.md`.
- **Phase 4 priorities (Jo, 2026-09-22):** 1. graph engineering; 2. Addy Osmani's "owning the outer loop"; 3. Yegge, read under P-14 (extract what does not need fleet-scale subscriptions). Then: planning practice for P-12 (OMP plan
  mode, obra/superpowers, addyosmani/agent-skills); memory system for P-13; graph engineering as a
  term and practice; Jo's friend's "FM" orchestrator if written material exists; `OMP_PROFILE`
  isolation extent.

## Requirement or design? The test used throughout

A sentence of the form *"I want to be able to…"* or *"the system must never…"* is a requirement
and belongs here. A sentence of the form *"it should do that by…"* is design and belongs in
Phase 5. Later requirements append as P-18 onward without reopening Phase 3.
