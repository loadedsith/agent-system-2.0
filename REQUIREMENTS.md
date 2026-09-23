# REQUIREMENTS — agent-system 2.0, for Jo's review

Derived from `PREFERENCES.md` (Phase 3 interview, 2026-09-22). One line per requirement, in Jo's
sense of the word: what must be true of 2.0 as Jo experiences it. Mechanisms are Phase 5.
`PREFERENCES.md` holds Jo's verbatim words, the 1.x evidence, and the interview log for each entry;
this file is the reviewable summary and is regenerated from it, never edited alone.

## Vocabulary

- **Workload** — the durable, addressable unit of work: it carries its own brief, its ceiling, its
  key into memory and provenance, and its open/closed state, and it outlives any lane opened on it.
- **Lane** — the managed working context the orchestrator opens on a workload. An instance, not a
  fixture: at most one is live on a workload at a time, and it may close without the workload
  ending.
- **Hand** — a short-lived subagent a lane spawns, briefs, and owns for one piece of work. It
  reports to its lane; Jo does not address it and the orchestrator does not dispatch into it (P-8).
- **Orchestrator** — the thing that holds the workload model, opens workloads and lanes, routes to
  them, and relays back. In 2.0 it is the surface itself, not a layer over one (P-7).
- **Seat** — the 1.x shape being replaced: a persistent named agent process rooted in one
  repository and addressed by name. The persona P-5 abolishes; "seat" always describes 1.x.
- **Surface** — the one conversation Jo has with the system (P-6).
- **Slice** — one bounded piece of work with a stated done-condition, briefed to exactly one hand,
  recorded as one ledger entry, closed by machinery-written state (P-20). A lane decomposes its
  workload into slices.

| # | Requirement | vs 1.x | Open for Phase 5 |
|---|---|---|---|
| P-1 | The system serves two workloads — Newdle and Jo's personal work — and is judged on Jo's pain and throughput, not on its own consistency. | keep | — |
| P-2 | Lanes and workloads are distinct and both first-class: a **workload** is the durable, addressable unit (brief, ceiling, memory key, open/closed state); a **lane** is the managed working context the orchestrator opens on a workload — an instance, not a fixture, at most one live at a time, closable and reopenable. The workload is what persists and what carries continuity across a lane's closure (P-13, P-17). | change (1.x has the working context as "seats", not the model, and no workload unit at all) | — |
| P-3 | 2.0 is built in parallel under its own OMP profile; 1.x is never modified; cutover is one workload at a time, starting with a real but low-stakes workload; 1.x stays as rollback until the last workload moves. | change | extent of `OMP_PROFILE` isolation; the seat↔workload cutover map; the rule for a repo held by both systems during overlap; the retirement condition for a 1.x seat |
| P-4 | Phases 1–5 produce the plan, not the machinery. The build plan may be long and many-phased; every step passes an automated gate that produces an inspectable evidence artifact (output, screenshot, recording) **and** gets Jo's sign-off on that artifact after real use before the next step opens, on top of owner and reversal. "The lane said so" is not a gate result. | keep, strengthened | — |
| P-5 | Lanes are opened on a workload, not bound to a repository; a lane checks out whatever repos it needs. Named persistent lanes are not a tier: persistence is a property of the workload; address = workload name; charter → per-workload brief (purpose and ceiling set by the orchestrator, reserved-list exceptions set by Jo alone) + per-repo rules loaded on checkout; memory and per-repo expertise → the P-13 store. Opening a workload, and opening a lane on it, is the orchestrator's own call. | change | — (ruled 2026-09-23; store shape is P-13's) |
| P-6 | One window by default: Jo talks to a single surface that routes to workloads and relays back; Jo can attach to a workload's live lane on demand, or ask the orchestrator to open one — never a side door around the surface. | change | — |
| P-7 | That surface **is** the orchestrator — the thing that holds the workload model and routes — not a layer over something else. | change | — |
| P-7a | The orchestrator's knowledge is held per workload — each workload's actual state, its open/closed state, and which lane if any is live on it — never a document about them; task state and steps live in a store outside any context window, written by the machinery. | change | — |
| P-7b | The orchestrator acts on its own authority by default; reserved list stays Jo's: phase open/close, spend above a workload's ceiling or raising the ceiling once set, irreversible actions outside the repo, changes to the system's own rules or machinery (including the reserved-list exceptions field of a workload's brief). Opening a workload and its lanes is explicitly not reserved. The orchestrator has no hands of its own: it requests work from lanes, and all work happens inside a lane (ruled 2026-09-23). | change | item 3 command list — Phase 5 |
| P-7c | Jo learns the state of a message to a workload — held (no live lane), delivered, consumed, acted on — not just arrival; the threshold clock starts at held, and a message past it surfaces as an exception. States are queryable on demand and shown when Jo looks; only a message past the threshold is pushed unsolicited, so P-8c's quiet-by-default holds. | change | threshold — Phase 5 |
| P-8 | The lane owns its hands: it spawns, briefs, and owns them; the orchestrator does not dispatch into a lane and has no hands of its own; Jo's direct access to a lane is a choice, never forced by the lane's behaviour. | change | — |
| P-8a | Hand reports are trusted as-is; Jo does not require machinery to check them. | keep | whether 2.0 checks anyway (design choice) |
| P-8b | The lane's report *to the orchestrator* is informational, never load-bearing; closed by machinery-written state (P-7a), observed liveness read against the workload's open/closed state so a closed workload's absent lane is not a stall, and P-4 evidence artifacts. | change | — |
| P-8c | Visibility is exception-based: errors and things needing Jo's attention surface; everything else stays quiet. | change | what counts as an error; how it surfaces |
| P-8d | Spend is governed by model routing, not per-dispatch approval; the 1.x spending gate is retired. | change | — |
| P-9 | A work-kind rule picks a hand's tier, a per-workload ceiling bounds every lane opened on it, no human approval per dispatch. The orchestrator sets the ceiling and may lower it; raising it is reserved to Jo (ruled 2026-09-23). | change | the work-kind taxonomy; what the orchestrator reads the ceiling off |
| P-10 | No 1.x rule carries into 2.0 by default: every rule gets keep/change/drop, new rules are coined, old ones retired. The rule-by-rule pass is a Phase 5 step Jo rules on in batches. | change | the pass itself |
| P-11 | Every surviving rule is classed mechanical (a tool gate refuses the action) or written; mechanical whenever the forbidden action is a single tool call; the gate is built and verified in the step that installs the rule. | change | the list of mechanical rules and the tool call each gates |
| P-12 | Jo can choose, per project, to spec and plan it through the system before anything executes; not every task needs this, but the option is offered at the appropriate time. "A big one." | change | which planning practice (Phase 4 research); whether the option comes before or after a lane exists |
| P-13 | Any lane can recall prior work — its own and other workloads', in any repo — **and the decisions made about it**, with provenance, persisting across sessions and across the cutover. Memory is keyed by workload; provenance is (workload, lane-instance id, time), never a persona. Shape ruled: an after-the-fact index (ctx incumbent) plus a machinery-written ledger (decisions, task state, wake); ledger tool is a Phase 5 choice, Beads a candidate. | change | ledger tool — Phase 5 |
| P-14 | 2.0 runs within the subscriptions and budget Jo actually has; fleet-scale patterns (many parallel Max subscriptions) are evidence, not targets. | keep | the concrete ceiling, when the design needs it |
| P-15 | The machinery is portable: an up-to-date copy of the system can be created from Jo's GitHub repo on another machine. State and specific lanes need not be. | change | which artifact classes are machinery vs state; the install path |
| P-16 | The system observes its own errors and repetitions and **proposes** a hook, prose fix, or skill for Jo to accept — never applies one without Jo's acceptance; after acceptance, installation follows P-7b and P-11. Lower priority (Jo). Depends on P-15: accepted proposals land in the portable repo. | change | what is counted, thresholds, how a proposal is surfaced (P-8c) |
| P-17 | On resume, a workload's lane has its first turn already grounded in the workload's recent work — what it was doing, what is pending, what was ruled — automatically, without re-briefing. Three triggers: compaction, restart, and the first lane opened on a workload with prior history. The wake key is the workload, not the lane instance. Distinct from P-13 (the store); depends on it. | change | what is captured, when, and how wake verifies it was read |
| P-18 | 2.0 does not depend on the newdle plugin being installed. Every plugin-shipped artifact 2.0 keeps (hooks, agent definitions, skills, output-types reference) is re-homed into the portable repo (P-15) or dropped (P-10), decided per artifact in Phase 5; nothing is kept by staying where it is. | keep (Jo's standing constraint, `JO-INPUT.md:9`) | per-artifact disposition — Phase 5 rule pass; rebuilding P-11's mechanical gates outside the plugin |
| P-19 | OMP is the runtime: every 2.0 mechanism (routing, lanes, hands, hooks, gates, memory, message states, continuity) is built on OMP's own facilities; nothing depends on Claude Code, HerdR, or the newdle plugin, including during cutover — the first 2.0 lane is OMP-native. | keep (Jo's standing constraint, `JO-INPUT.md:7`) | — |
| P-20 | Work is done in slices: a lane decomposes its workload into slices, each briefed to one hand with a done-condition, recorded as one ledger entry (P-13), closed by machinery-written state (P-7a); a hand never gets an open-ended brief. The slice is the unit P-8b and P-4 close on. | keep (Jo's standing constraint, `JO-INPUT.md:11`) | slice brief's minimum fields; leaf-only or sub-slices |

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
