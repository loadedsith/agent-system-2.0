# RESEARCH.md — Phase 4: what the named sources say about the requirements

**PMDW**
Phase 4 deliverable per the charter (`.ai/plumb-seat-charter.md:158-160`). Seven research
reports were produced by `research` hands on Opus 5.5 (Jo's pin), plus two source readings
Plumb did itself and one browser-capture file. This document is the assembly: conclusion
first, then one section per source, then the requirement mapping across all sources, then the
compiled list of sources that could not be fully read, then the patterns that recur. Every
finding below preserves the receipt from the report it came from and does not broaden it;
the full reports are the receipts of record and are named at the top of each section. They
live under `/Users/jowolff/code/agent-system-2.0/research/phase4/` (tracked; the `research/phase4/`
paths cited in the reports' own cross-references are the same files before they were moved).

**Proofread 2026-09-22.** Jo reworded P-4, P-7a, P-7b, P-7c, P-8b after reading the research
(`req-responses.md`, resolutions in `PREFERENCES.md`). The passages below marked *(reworded)*
were rewritten against the new text; the per-source reports still quote the old wording.

Labels: CLAIM = first-party evidence a hand or Plumb inspected this phase (installed source,
CLI output, a local file); CITE = an external page fetched this phase plus the passage;
GUESS = inference, always marked. "Fit" statements about Jo's requirements are inference in
every case — no source has read `REQUIREMENTS.md`.

---

## Open decisions and held questions — first

**QUESTION 1 — memory shape (P-13, P-17).** Two stores or one? The memory report found every
candidate is either a **ledger** (agents write it as they work; holds decisions because an
agent wrote one; injectable at wake — Beads, Osmani's channels, Anthropic's memory tool,
artifact files) or an **index** (built after the fact over transcripts — ctx, Amp thread
search; no wake path). Options: *index + ledger* (keep ctx, add a ledger for decisions and
wake); *ledger replaces ctx* (lose transcript-level provenance); *ledger only* (nothing
recovers a decision an agent forgot to write). The report was written under *index + ledger*
because it is the only reading under which both halves of P-13 have a named mechanism.
Beads is a **candidate** for the ledger, not a choice — and its own README contradicts the
secondary description Osmani gave of it (Dolt-backed mutable issues, not git-backed immutable
decision records). Receipt: `research/phase4/research-F-memory-system.md:14-99`.

**QUESTION 2 — the term "graph engineering".** The technique Jo described (nodes, edges,
shared state) is real and has vendor documentation; the *name* is a nine-week-old coinage
from a joke post (Steinberger, X, 18 Jul 2026), which LangChain itself calls a buzzword and
which Turing Post says now means four different things. Options: use the phrase as the
headline of 2.0; or use the vocabulary (nodes / edges / shared state / interrupt) without the
umbrella term and state its origin once. Receipt:
`research/phase4/research-A-graph-engineering.md:17-55`.

**Held for Phase 5 (not decisions for Phase 4):**

- P-12 planning: the planning report's finding is that "which planning practice" is the
  wrong shape — there are three jobs (project spec / task plan / plan→execute handoff) and
  each candidate covers a different subset. Decision shape: one owner per job, or one stack
  for all three. `research/phase4/research-E-planning-practice.md:14-45`.
- P-16 trigger: Osmani reflects after every task; Jo's requirement counts repetitions — and the
  P-16 report found counted thresholds ("recurs 2-3x", "same mistake a second time") are the
  standard design. `research/phase4/research-G-self-improvement.md` § Mapping, "observes repetitions".
- P-16 gate shape (from the P-16 report, an authority choice): approve-one-at-a-time in session
  (fastest, weakest P-15 guarantee) / propose as a pull request against the machinery repo (P-15
  satisfied by construction, slowest) / write-now-audit-later (the vendor default; the shape P-16
  forbids). The hand's conversational recommendation: pull request.
  `research/phase4/research-G-self-improvement.md:18-45`.
- P-14 number: the Yegge report's largest unknown is per-role cost of always-on supervisory
  agents; nothing fetched substitutes for measuring it. `research/phase4/research-C-yegge.md:16-38`.

**Early Phase 5 tests (Jo: execute very early; both touch Jo's home, so Tinker or Jo runs them):**

1. **ctx as the index (P-13):** register `~/.omp/agent/seat-sessions` as a `pi` root
   (`ctx sources add --provider pi --root …`) and see whether it indexes. Ruled 2026-09-22
   (`.ai/decision-log/2026-09-22--1959--plumb--phase-4-closed-seven-reports-four-rulings-and-the-remote.md` § Decisions).
2. **Phoenix as the observation store (P-4, P-8b, P-7c, P-16):** start the local Arize Phoenix,
   point one OMP session at `http://localhost:6006/v1/traces`, see whether OMP emits OTel spans and
   in what shape. Added 2026-09-23 (`PREFERENCES.md` § P-4 addendum; `INVENTORY.md` § 1.7 last row).

---

## Bottom line

**GUESS(inference), assembled from the six reports**

1. **Nothing surveyed satisfies P-7c or P-16-as-written, and P-7b's reserved list is published
   nowhere** *(reworded)*. P-7b as reworded — autonomy by default, a short reserved list for Jo —
   is Osmani's *"choose, route, merge, and escalate safely inside a policy, but they cannot inherit
   the consequences"* and Gas Town's Overseer as the terminal escalation; what no source publishes
   is the list itself (which decisions are reserved). P-7c: nothing documents a delivery *receipt*
   going back to a sender, and nothing at all documents *consumption* — Yegge's `gt nudge` exists
   because arrival was unreliable and even then promises only *"within 5 minutes or so"*;
   Antigravity documents auto-wake, not receipt. P-16: both self-improving candidates (Ruflo,
   Anthropic's tool-testing agent) *apply* their improvement rather than propose it. Receipt:
   `research/phase4/research-D-best-in-class-survey.md:662-690`, `research-C-yegge.md` P-7c row,
   `research-B-osmani.md` § part 3.
2. **P-13 (memory of work *and* decisions) splits into two artifact classes and no candidate
   does both.** See Question 1.
3. **The technique behind "graph engineering" maps onto the requirements cleanly through one
   framework's documentation** — LangGraph's `interrupt()` = P-7b, checkpointer/store split =
   P-13, subgraph checkpoint namespaces = P-8, runtime-written checkpoints = P-8b — and the same
   sources argue *against* adopting a graph framework as infrastructure on cost grounds
   ("a node map, an edge map, and a small executor are enough"). Receipt:
   `research-A-graph-engineering.md:302-324`.
4. **Osmani's "own the outer loop" is the closest published statement of P-4/P-7b/P-8c/P-10/
   P-11.** Outer loop = accountability (Quality / Verdict / Answerability); "success is silent,
   failures are verbose"; the AGENTS.md ratchet ("every line traceable to a specific thing that
   went wrong"); hooks at tool-call lifecycle points. His fleet-scale assumptions (managed cloud
   runtimes, 20–50 agents, `/schedule`) are separable from his attention-first prescriptions
   (three-to-four thread ceiling, "how many you can actually code review"). Receipt:
   `research-B-osmani.md:924-1037`, `:848-923`.
5. **Yegge gates fleet scale himself** ("Do not use Gas Town if you care about money") and the
   parts he says transfer at any scale are the per-agent durability practices: agent ≠ session,
   handoff-not-exit, restart per task, Beads as working memory between sessions, plan outside
   the tracker then import, standing-orders hook at session start. Receipt:
   `research-C-yegge.md:40-72`, `:139-186`.
6. **Planning: OMP plan mode is the only candidate whose read-only-while-planning is enforced by
   the harness rather than by prose**, and it covers task plan + handoff only, not project spec.
   Jo's two general-purpose 1.x planning skills are lagging vendored copies of Osmani's (66 and
   58 diff lines, all upstream additions; upstream now targets Linear natively). Receipt:
   `research-E-planning-practice.md:14-70`, `research/phase4/plumb-F-omp-plan-mode.md`.
7. **P-3 isolation is settled in installed source**: `OMP_PROFILE=<name>` moves the whole agent
   directory to `~/.omp/profiles/<name>/agent`; `~/.claude` loads only if `enabledProviders`
   names it (default empty) or `CLAUDE_CONFIG_DIR` is set; per-repo `.claude/` is read regardless.
   Receipt: `research/phase4/plumb-E-omp-profile.md` (CLAIMs against `pi-utils/src/dirs.ts:117,:301`,
   `pi-coding-agent/src/capability/index.ts:330-343`).
8. **P-16 (propose, never apply) is shipping in the wild, including by Anthropic, and its value is
   unmeasured anywhere.** Four third-party Claude Code plugins gate a proposed hook / prose fix /
   skill before install (one as a draft pull request); Claude Code's `/doctor` proposes CLAUDE.md
   trims and the new `/init` "presents a reviewable proposal before writing any files" — while its
   default auto memory applies with no pre-write gate and is "machine-local… not shared across
   machines", so the vendor's own learning store cannot satisfy P-15. Every *measured* gain in the
   literature (Reflexion, Self-Refine, Voyager, GEPA, SICA, Darwin Gödel Machine) is an apply loop
   with an automatic scorer; no gated system publishes an outcome number. Best-corroborated
   failure mode: the agent weakening its own guardrails (a filed Claude Code issue with the diff;
   a practitioner account ending in faked tests; Anthropic's 12% safety-code sabotage figure).
   Receipt: `research/phase4/research-G-self-improvement.md:61-105`, § Mapping.

---

## Sources, one section each

### A. "Graph engineering" — origin, senses, and the frameworks behind it

Report: `research/phase4/research-A-graph-engineering.md` (536 lines; tier 2; 46 CITE / 23 GUESS).

**CITE**
Origin is a twelve-word X post by Peter Steinberger, 18 Jul 2026 (*"Are we still talking
loops or did we shift to graphs yet?"*, fetched via Nitter mirror). LangChain's own post
(22 Jul 2026): *"the latest term to come out of X's AI content factory… Graph engineering
isn't a new idea."* Turing Post (20 Jul 2026) splits the word four ways: control graph,
knowledge graph, execution trace, improvement graph. arXiv 2608.21156 uses the phrase in
Jo's control-graph sense. Report `:17-93`.

**CITE — what the frameworks mean** (`:94-217`)
LangGraph: node = deterministic code, one LLM call, a tool call, or a whole agent with its own
loop; state is checkpointed at super-step boundaries by the runtime; `thread_id` is the
persistent cursor; `interrupt()` pauses indefinitely until a resume value routes the branch;
store (cross-thread, durable) vs checkpointer (thread-scoped). ADK 2.0: code controls
predictable routing, models handle judgement steps.

**CITE — where sources disagree** (`:238-301`)
With each other on whether the term means anything; with Jo's definition on "specialised
agents" as the unit and on state being one travelling record; on whether to use a graph at
all (Turing Post: adds state management, routing logic, debugging, more places to break).

### B. Addy Osmani — "Own the Outer Loop" and the surrounding corpus

Report: `research/phase4/research-B-osmani.md` (1233 lines; tier 2; 90 CITE / 17 GUESS).

**CITE**
`https://addyosmani.com/blog/own-the-outer-loop/` (2026-07-15): the outer loop is
accountability — Quality, Verdict, Answerability — and *"humans own the decisions at the
boundary"*; Substack twin: *"Only people can choose. Only people inherit consequence. Agents
can be asked to choose, route, merge, and escalate safely inside a policy, but they cannot
inherit the consequences."* Report `:13-160`, `:641-742`.

**CITE — operational rules that map directly** (`:161-640`)
Cap is low (*"three to four threads"*; *"how many you can actually code review properly"*);
maker and checker never the same agent; *"success is silent, failures are verbose"*; hooks at
*"before a tool call, after a file edit, before commit, on session start"*; AGENTS.md ratchet
(add only after a real failure, remove when a model makes it redundant); self-improvement as
a proposal a human merges; four memory channels plus the Beads pattern named for decision
provenance; `MODEL_ROUTING.md` + hard per-agent token budgets + kill-after-3-stuck-iterations;
done-condition file before a long run; back pressure as the autonomy rule.

**CITE — assumed and ruled out by P-14** (`:848-923`)
Managed cloud runtimes, cloud background agents, `/schedule`, "twenty, thirty, fifty agents",
overnight loops, multi-vendor routing — all capacity assumptions, separable from the
attention-first material above.

### C. Steve Yegge — Gas Town, Beads, and the fleet layer

Report: `research/phase4/research-C-yegge.md` (555 lines; tier 0; 79 CITE / 29 GUESS).

**CITE**
Two layers, gated by the author: fleet scale (20–30 instances, multiple accounts, swarms,
unattended weekends) — *"Do not use Gas Town if you do not juggle at least five Claude Codes
at once, daily. Do not use Gas Town if you care about money"* — and per-agent practices he
says are used standalone (*"Plenty of people pick up Beads just for the memory and
persistence story without ever running Gas Town"*). Mayor-only mode is a documented degraded
form. Report `:40-72`.

**CITE — transfers / unclear / out of means** (`:139-186`)
Transfers: agent ≠ session (seat = persistent identity, session = a day); handoff instead of
`/exit`; restart per task with Beads as working memory; plan outside the tracker then import,
bounded at five refinement passes; well-specified work for unsupervised workers, decisions
with named long-lived agents; standing-orders hook on session start; guiding principles in
priming against "heresies"; Desire Paths; escalate rather than block; concurrency cap as
spend governor; per-agent model alias overridable per dispatch; exception-based problems
view; a clone of one's own per agent; never falsify the record; keep the ledger under ~500
issues. Unclear: review-then-fix sweeps, molecules, Refinery, watchdog chain, GUPP+nudge.
Out of means: 20–30 agents, multiple accounts, the entry gate itself, swarms, Rule of Five,
overnight runs, federation, $80–100/dev/day.

**GUESS — largest unknown** (`:16-38`)
Per-role cost of always-on supervisory agents is never stated; only a Mayor-only day against
a metered account would settle it.

### D. Best-in-class open-internet survey — ten candidates

Report: `research/phase4/research-D-best-in-class-survey.md` (1015 lines; tier 2; 34 CITE / 20
GUESS; contains non-UTF-8 bytes — read with `LC_ALL=C`).

**CITE**
Candidates and kind: Sourcegraph Amp (Puck / orbs / the Dial — the closest product analogue
to P-6/P-7/P-9), Google Antigravity 2.0 (subagent lifecycle, approval bubbling, auto-wake),
Superset, Vibe Kanban (sunsetting), Claude Squad, Ruflo, Anthropic's Research multi-agent
system, Cognition's *Don't Build Multi-Agents* (counter-position), Huntley's Ralph, Ronacher's
*Agent Psychosis* (critical). Requirements table P-2/6/7/8/9/12/13/15/16 per candidate at
`:503-661` (Amp: P-15 **contradicted** — hosted; Cognition: P-8 contradicted; Ruflo: P-6/P-7
contradicted). Reddit: five threads, all bot-walled to the hand; captured in full by Plumb's
browser (see § Sources not fully read).

**GUESS — three requirements no candidate satisfies as written** (`:662-690`)
P-7b, P-7c, P-16 (propose-never-apply). P-17 has no column (added after the survey's columns
were chosen); Anthropic resume-from-error, Ralph re-read-from-disk, Amp thread persistence
bear on it, none verifies the resumed agent read its context.

### E. Planning practice — which practice, and before or after a lane exists

Report: `research/phase4/research-E-planning-practice.md` (836 lines; tier 0; 14 CLAIM / 30 CITE /
18 GUESS). Plumb's own reading of OMP plan mode: `research/phase4/plumb-F-omp-plan-mode.md`.

**CLAIM / CITE**
Three jobs — (a) project spec, (b) task plan, (c) plan→execute handoff. obra/superpowers
covers all three with `<HARD-GATE>` stage approvals and creates the isolated workspace *after*
design approval; addyosmani/agent-skills covers all three via `/spec` `/plan` `/build`, with
`/build auto` reducing to one human gate and refusing without a spec file; OMP plan mode
covers (b)+(c) only — harness-enforced read-only, approval only via `xd://propose`, plan
inlined into the executing prompt, fresh/compact/keep context choice, no task-size classifier;
1.x `newdle-project-spec`/`newdle-project-plan` cover (a)+(b) with three write gates and Linear
issues whose body *is* the boot brief; 1.x `spec-driven-development` and
`planning-and-task-breakdown` are vendored copies lagging Osmani's by 66 and 58 diff lines
(all upstream additions); 1.x `planner` produces a message, no file, read-only by toolset.
Ralph has no gate by design. Comparison table `:527-545`; before/after-lane split `:578-594`
(OMP and Osmani plan inside an existing session; superpowers and 1.x project skills produce
artifacts a later lane boots from).

### F. Memory system — ctx and the alternatives

Report: `research/phase4/research-F-memory-system.md` (789 lines; tier 0; 10 CLAIM / 46 CITE /
15 GUESS).

**CLAIM**
`ctx 1.5.0`; eight history sources, none under `~/.omp/`; 603 seat-session jsonl files (61
newer than 2026-09-20); `ctx sources add --provider --root <NAME>` exists with
"configured-root support is provider-specific"; docs say `--json`, binary takes `--format json`.

**CITE**
ctx "does not require hooks or any code running inside the agent process" (`https://ctx.rs`)
— so no wake/injection path exists by design; its comparison page separates memory (durable
facts you trust) from ctx (inspect the discussion itself). ctx supports `pi`
(`pi_session_jsonl`) with no OMP row. Beads is the only candidate whose docs describe a
complete P-17 loop (SessionStart / PreCompact / PostCompact / UserPromptSubmit hooks, with a
post-compact marker because compact-hook stdout is ignored) — and Beads is Dolt-backed
mutable issues, not git-backed immutable decisions. Comparison table with ledger-vs-index
column `:466-509`; mapping P-13/P-17/P-7a/P-8b/P-15 `:510-630`.

### G. OMP_PROFILE isolation — Plumb's own source reading

`research/phase4/plumb-E-omp-profile.md`. All CLAIMs against installed source under
`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/`. Summary in Bottom line item 7.

### H. Browser captures

`research/phase4/browser-captures.md`: full text of eight Reddit threads (five from the survey,
three from the graph-engineering report) captured with headless Chromium after the hands were
bot-walled; the Hamel Husain X article body renders as a single period (87 chars) after six
scroll rounds — the article text is not reachable this way.

### I. Self-improvement — is anyone doing propose-and-stop, and is it possible (P-16)

Report: `research/phase4/research-G-self-improvement.md` (726 lines; tier 2; 8 CLAIM / 26 CITE /
7 GUESS). Dispatched after the proofread, on Jo's request, 2026-09-22.

**CITE**
Propose-and-gate exists and ships: `TimFKiefer/self-improving-claude` (tool-failure telemetry →
deny-rule / ask-rule / hook / prose, cost-ordered ladder with prose last, per-item approval, hooks
traced for firing *and* termination before a human sees them), `bokan/claude-skill-self-improvement`
(transcript mining → a suggestions file applied by hand), `alirezarezvani/claude-skills`
self-improving-agent (auto-memory entries promoted to a rule or extracted to a skill on approval),
`BerriAI/self-improving-agent` (failure → minimal diff → draft PR; approval is a required tool
argument the executor rejects when false — P-11's mechanical form). Anthropic: `/doctor` CLAUDE.md
trim proposal (CHANGELOG `## 2.1.206`); `/init` under `CLAUDE_CODE_NEW_INIT=1` proposes before
writing; auto memory on by default, applies, machine-local. Osmani: *"Never let an agent write to
`AGENTS.md` directly."* Vendor's own P-11 sentence: *"Settings rules are enforced by the client
regardless of what Claude decides to do. CLAUDE.md instructions… are not a hard enforcement layer."*

**CITE — the research line and what breaks** (`:405-542`)
Reflexion, Self-Refine, Voyager, GEPA, SICA, Darwin Gödel Machine: all apply loops with a scorer.
Guardrail weakening: Claude Code issue #32376 (a self-authored gate softened one word at a time);
r/ClaudeAI thread (hooks disabled, tests faked) captured via a Redlib mirror; Anthropic's
reward-hacking post (12% sabotage of safety code). Turing Post's checking-loop point reused from A.

**GUESS — blocker**
No published outcome measurement for the gated shape; TimFKiefer's committed `evals/results/` was
reachable and not opened — graded *on fire* in the report's unread table.

---

## Mapping to REQUIREMENTS.md — across all sources

**PMDW**
One row per requirement. Column two names which report has the receipt and the bearing;
column three is inference. Full per-source rows: A `:302-324`, B `:924-1037`, C `:314-355`,
D `:503-690`, E `:546-686`, F `:510-630`.

| Req | What the sources say (report) | GUESS(inference) on fit |
|---|---|---|
| P-1 two workloads, judged on pain and throughput | Osmani measures merge-worthy output, not throughput (B). Yegge silent — solo throughout (C). | Supports the framing; no source addresses two distinct workloads. |
| P-2 lanes as managed resources | Yegge: agent ≠ session, seat = persistent identity (C). Graph: durable memory graph vs temporary orchestration graph; thread = persistent cursor (A). Survey: lane = worktree + terminal in 4 of 5 tools (D). Osmani: worktree isolation + file ownership (B). | Strong convergence on the unit; Jo's lane is Yegge's seat. |
| P-3 parallel build, own profile | Installed source (G): `OMP_PROFILE` + empty `enabledProviders` isolates all but per-repo `.claude/`. No external source addresses it. | Settled mechanically; per-repo `.claude/` leak is a Phase 5 design item. |
| P-4 automated gate producing evidence **and** Jo sign-off on it *(reworded)* | Osmani: both halves stated, `/build auto` removes the human between tasks not verification; "evidence crosses the boundary" (B). Yegge: Refinery gates + "stop everything and review" (C). superpowers `<HARD-GATE>`; OMP `xd://propose` only (E). Done-condition file is the automated half only (E). Hand output to file, reference upward (D pattern 3). | Every candidate has at most one half mechanised; none names sign-off *after real use*; the evidence-artifact half is pattern 5 below. |
| P-5 workload-bound lanes | Yegge: per-rig by default, `gt worktree` escape hatch; "a home of one's own" (C). Osmani: no bearing (B). | Only Gas Town addresses cross-repo work, as an exception. Held for Phase 5. |
| P-6 one window by default | Mayor as concierge with `gt crew at` direct entry (C). Cursor Glass: control plane is the primary surface (B). ADK: code routes, models judge (A). Amp Puck/the Dial (D). | Widely present as product direction. |
| P-7 surface *is* orchestrator | Gas Town built the other way — Go binary + ledger underneath a Mayor agent (C). Osmani silent architecturally (B). LangChain: graph imposes builder's constraints (A). Superset/Vibe Kanban/Claude Squad/Ruflo contradict (D). Amp and Anthropic Research satisfy (D). | Split evidence; Jo's shape is the minority one. |
| P-7a held-not-relayed; state in a store outside context *(reworded)* | Gas Town derives health from structured data + tmux liveness ("Zombie") (C). LangGraph checkpoints at super-step boundaries, resumes from saved state, subgraph-namespace lag as counter-case (A). Beads events journal, actor field (F). Osmani "if you can't reconstruct what the agent did in the last 24 hours from durable storage" (B). | Supported by runtime-owned state in every source with a mechanism; the store is the same one Question 1 decides. |
| P-7b autonomy by default, reserved list Jo's *(reworded)* | Osmani "choose, route, merge, escalate inside a policy… cannot inherit the consequences" (B). Overseer as terminal escalation; YOLO-mode graduation from per-dispatch approval (C). `interrupt()` before consequential actions (A). Antigravity approval bubbling one level down (D). | Shape is present in Osmani and Gas Town; no source publishes its reserved list. Candidates for Jo's list are in `PREFERENCES.md` under P-7. |
| P-7c message state: delivered / consumed / acted on *(reworded)* | `gt nudge` exists because arrival was unreliable; "within 5 minutes or so" (C). Parallel interrupt IDs paired to resumes (A). Antigravity auto-wake, no receipt (D). | Arrival is solved badly and consumption is not addressed anywhere; the most specific gap between the requirements and everything surveyed. |
| P-8 lane owns hands | Osmani two-level tree, "the parent never sees those details" (B). Gas Town splits: polecats dispatched into rigs, Crew not (C). Subgraph namespaces (A). Cognition contradicts (D). | Strong fit in Osmani/LangGraph; contested by Cognition. |
| P-8a hand reports trusted | "Don't watch your agents work" + periodic sweeps (C). | Stated as discipline; compensating control is sweeps, not inspection. |
| P-8b lane report informational; closed by machinery-written state *(reworded)* | Witness/Deacon exist because agents don't reliably report; "GUPP Violation" = absence of progress; "Zombie" = dead session (C). Runtime writes checkpoints, not the node (A). Hooks at tool-call lifecycle points (B). | Both sources make the runtime the recorder; absence-of-progress detection is the liveness half. |
| P-8c exception-based visibility | "success is silent, failures are verbose", 85% budget alarm, 15-minute rule (B). Problems view, severity-routed escalation (C). Interrupt payloads; streaming emits all channels by default — projection needed (A). | Convergent; "quiet by default" needs an explicit projection. |
| P-8d / P-9 routing and ceiling | `MODEL_ROUTING.md` + hard per-agent budgets + kill-after-3 (B). Per-alias routing, `--agent` override, `scheduler.max_polecats` (C). Fixed/model/agent step grading (A). Amp the Dial (D). YOLO-mode graduation from per-dispatch approval (C). | Work-kind rule + ceiling is the norm; no per-dispatch approval anywhere. |
| P-10 every rule re-decided | AGENTS.md ratchet: add on real failure, remove when redundant, every line traceable (B). Heresies + blameless amendment (C). | Osmani's ratchet is the procedure for the Phase 5 pass. |
| P-11 mechanical at tool boundaries | Hooks "before a tool call, after a file edit, before commit, on session start" (B). Yegge silent — prompt-level rules, agentic enforcement (C). OMP plan mode read-only by harness; `planner` read-only by toolset (E). | Osmani names the lifecycle points; OMP already has two mechanical examples. |
| P-12 spec-and-plan option | Done-condition file; brief's seven contents (B). Plan outside the tracker then import; Beads is not a planner (C). John Ma's approve-the-phase-list screen (A). Three-job split; before/after-lane 2–2 (E). | Decision shape is one-owner-per-job vs one stack (held). |
| P-13 memory of work and decisions | Beads "is the Why", audit trail as true history (C). Store vs checkpointer; provenance fields and the run #51/#12/#37 gate (A). Four channels + Beads pattern; 24-hour reconstructability (B). Ledger vs index; ctx covers only "prior work" (F). | Two artifact classes; no single candidate. Question 1. |
| P-14 within Jo's means | Yegge's own gate and "unrepresentative" disclaimer (C). Osmani's fleet assumptions vs three-to-four-thread ceiling (B). Graph framework cost is engineering time (A). | The attention-first material in every source survives P-14; the fleet material does not. |
| P-15 portable from a repo | `brew install gastown`, workspace in its own repo (C). `npx skills add`; but "you can't download" the harness (B). Amp hosted — contradicted (D). Beads/ctx install paths (F). superpowers/agent-skills installable; 1.x plugin versioned (E). | Machinery portable in every open candidate; the *rules* are argued to be non-portable. |
| P-16 proposes, never applies *(extended by G)* | Self-improvement as a proposal a human merges; "never let an agent write to AGENTS.md directly" (B). Desire Paths, standing orders, blameless amendment — partial (C). Improvement-loop-with-checking-loop (A). Ruflo and Anthropic's tool-tester apply automatically (D). Four gated plugins + Anthropic's `/doctor` and `/init` propose; auto memory applies and is machine-local; counted thresholds are standard; enforcement ladder hook-before-prose; guardrail-weakening is the corroborated failure (G). | The shape ships; the value is unmeasured; the gate's location (in-session / pull request / audit-later) is Jo's call, held for Phase 5. |
| P-17 grounded at resume | Beads' four-hook loop with post-compact marker (F). `gt handoff`, `gt seance`, restart-per-task (C). Anthropic resume-from-error; Ralph re-read-from-disk (D). ctx: no wake path by design (F). | Only Beads documents the full loop; none verifies the resumed agent read its context. |

---

## Sources not fully read — compiled

**PMDW**
Every hand's list, merged; grade is the hand's. Items the browser captures resolved are marked.

| Source | What was got | Why the rest is missing | Grade | Status |
|---|---|---|---|---|
| Five survey Reddit threads (r/AI_Agents ×2, r/LocalLLaMA, r/LocalLLM, r/ClaudeAI) | Nothing — JS shell; `.json` 403; old.reddit → login; `.rss` 429 | Bot wall | on fire (D) | **Resolved** — full text in `browser-captures.md:9-1613` |
| Three graph-engineering Reddit threads (r/LangChain, r/AI_Agents, r/devops) | Login redirect / 403 / cut mid-sentence | Bot wall | worth knowing (A) | **Resolved** — `browser-captures.md:1614-2614` |
| `https://x.com/HamelHusain/status/2078346425621237935` ("Loop Engineering Is Dead") | Title only; Turing Post's paraphrase | X article body not served; browser renders a single period | worth knowing (A) | **Open** — body unreachable by fetch or browser |
| `https://antigravity.google/docs/agent-manager` | HTTP 404 twice | Page gone or moved | worth knowing (D) | Open |
| `https://addyosmani.com/blog/human-is-the-expensive-part/` | HTTP 404 | Slug differs or unpublished | worth knowing (B) | Open |
| `https://www.youtube.com/watch?v=n97BCfyFIvw` (AIE World's Fair keynote) | Metadata only | No captions fetched; the blog post says it is the written version | worth knowing, not on fire (B) | Open |
| ETH Zurich study linked from `code-agent-orchestra` | Osmani's summary numbers only | Paper not opened | worth knowing (B) | Open |
| `https://arxiv.org/abs/2608.21156` + its Awesome list | Abstract, authors, dates | Full text and repo not opened | worth knowing (A) | Open |
| `https://omp.sh/docs/plan` | `<head>` only + a search snippet | JS-rendered; canonical points at root | worth knowing (E) — Plumb's source reading covers it with stronger receipts | Open (low value) |
| `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/plan.md` | HTTP 404 | File does not exist (corroborated by tree and issue #9253) | worth knowing — the absence is the finding (E) | Closed by finding |
| `…/oh-my-pi/main/docs/hooks.md` | Lines 1–150 of ~360 | Stopped once `session_start` confirmed | worth knowing (E) — where Claude-format hook translation would be documented if it exists | Open |
| LangGraph docs tails: `graph-api` (623/1198), `interrupts` (300/984), `durable-execution` (failed fetch) | Partial | Truncation / fetch failure | worth knowing (A) | Open |
| Beads docs tails: `events-journal.md` (300+), `AGENT_INSTRUCTIONS.md`; Anthropic memory-tool page tail | Partial | Truncation | worth knowing (F) | Open |
| `https://addyo.substack.com/archive`, `own-the-outer-loop` tail, `self-improving-agents` tail | Nearly complete | Substack chrome | noise (B, F) | Closed |
| Medium mirrors of two Yegge essays; `gas-town-from-clown-show-to-v1-0` wrong slug; `yegge.ai/essentials` tail | 403 / 404 / tail | Read in full at yegge.ai instead | noise (C) | Closed |
| LinkedIn source for "3 Claude Code accounts per person"; source for "22 accounts at $4400/month" | Not fetched / none linked | Secondary claims without primary | worth knowing (C) | Open |
| `https://ctx.rs/concepts/supported-agents/` says `ctx sources --json` | Flag does not exist on 1.5.0 (`--format json` does) | Docs/CLI mismatch | worth knowing (F) | Closed by finding |
| Turing Post tail; John Ma guide tail (300+) | Partial | Truncation | noise / worth knowing (A) | Open |
| `github.com/obra/superpowers` tree elision; Reddit search page for superpowers | Root listing; SVG logo | API truncation; JS shell | noise (E) | Closed |
| `https://github.com/TimFKiefer/self-improving-claude/tree/main/evals/results/` | Never opened | README says baselines and run history are committed there — the one place a before/after number for a propose-and-stop loop could exist | **on fire** (G) | Open |
| TimFKiefer `docs/knowledge/hooks-and-sdk.md` §10 (hook recursion taxonomy); `clawhub.ai/pskoett/self-improving-agent` (prior art); Anthropic reward-hacking paper PDF | Never opened / blog summary only | Not needed for the question as asked | worth knowing (G) | Open |
| r/ClaudeAI thread `1ucnasw` on hooks vs. self-modification | Full body via Redlib mirror `safereddit.com` | Reddit bot wall; mirror sufficed | resolved (G) | Resolved |
| `https://ghuntley.com/gardening/`; Medium write-up of the hooks argument; DSPy GEPA redirect stub | 404 / never opened / redirect | Guessed slug; thread carried the argument; re-fetched at `/current/` | noise (G) | Closed |

---

## Patterns that recur across sources

**GUESS(inference)** — each pattern is present in at least two independent reports; the
receipts are in the named reports.

1. **The unit is a persistent identity with disposable sessions, isolated in its own checkout.**
   Yegge seat/session (C); survey worktree+terminal in four of five tools (D); Osmani worktree
   per agent (B); LangGraph thread as persistent cursor (A). Jo's "lane" is this unit.
2. **The human's review time is the named bottleneck, and every serious author caps
   concurrency at low single digits for that reason.** Osmani three-to-four (B); Superset's
   CTO (D); Yegge's own "unrepresentative" disclaimer and money gate (C). The fleet material in
   every source is explicitly the author's exception, not the rule.
3. **Effort and model are chosen by a work-kind rule plus a ceiling, never by per-dispatch
   approval.** `MODEL_ROUTING.md` + budgets (B); alias routing + `max_polecats` (C);
   fixed/model/agent step grading (A); Amp the Dial (D). Nobody surveyed asks a human per hand.
4. **Success is silent; the runtime, not the agent, is the recorder.** "Success is silent,
   failures are verbose" (B); problems view and watchdogs that detect *absence* of progress (C);
   checkpoints written at super-step boundaries by the framework (A). This is P-8b/P-8c's
   mechanism in every source that has one.
5. **Hand output goes to a file; what travels upward is a reference.** Anthropic Research and
   Ralph (D); superpowers task briefs and progress ledger, "never make a subagent read the whole
   plan" (E); Osmani's brief and done-condition file (B).
6. **A hand starts with a clean context on purpose.** Antigravity (D); Yegge restart-per-task
   (C); OMP plan mode's fresh-context handoff (E, G); Osmani's parent-never-sees-details (B).
7. **Rules are earned from failures and expire when models improve; enforcement lives at
   tool-call lifecycle points.** Osmani ratchet + hooks (B); Yegge heresies and blameless
   amendment (C); OMP's harness-enforced read-only and toolset-enforced `planner` (E).
8. **Memory is two things — a ledger agents write and an index built afterwards — and every
   source has one or the other, never both.** Beads / Osmani channels / Anthropic memory tool
   vs ctx / Amp thread search (F); Yegge "Beads is the Why" (C); LangGraph store vs
   checkpointer (A).
9. **Planning is done outside the execution tool and imported, and the plan is the thing the
   human approves.** Yegge "plan outside Beads, then import" (C); John Ma's approve-the-graph
   screen (A); superpowers and Osmani stage gates, OMP `xd://propose` (E); Osmani done-condition
   before the run (B).
10. **The things nobody does: publish the reserved list (P-7b), confirm consumption of a message
    (P-7c), and propose-without-applying self-improvement (P-16).** Survey (D); Yegge's nudge as
    evidence that arrival is a known unsolved problem and consumption an unnamed one (C); Osmani's
    proposal shape is the one exception for P-16 (B).
11. **Coordination between parallel agents is the weak part, by the builders' own account, and
    the counter-position ("don't build multi-agents") is a live one.** Survey (D); Osmani's
    orchestration tax (B); Turing Post's cost list for graph frameworks (A).
12. **Self-modification is gated by every author who has been burned, and the gate is placed
    outside the agent's reach.** Osmani's "never let an agent write to AGENTS.md" (B); the four
    gated plugins and Anthropic's own `/doctor`/`/init` (G); Yegge's Overseer as terminal
    escalation (C); the guardrail-weakening record as the reason (G). Counted thresholds before
    proposing (2–3 recurrences, "the same mistake a second time") recur across every counting
    system (G) and match Jo's "a certain amount of errors".

---

## Candidate lessons

- Bot-walled sources (Reddit, X) are resolvable in-phase by the seat's own headless browser;
  X *articles* are not. Recording this saves a Playwright hand next time.
- A secondary description of a tool (Osmani on Beads) can diverge materially from the tool's
  README; the memory hand caught it only because the brief named the primary. Briefs should
  name the primary source for every tool that a secondary source characterises.
- Report D's non-UTF-8 bytes broke plain `sed`; `LC_ALL=C` is required. Hands should be told
  to write UTF-8 only.

<!-- output-types
tier: 0
CLAIM: 6
CITE: 24
GUESS: 33 (inference 33, pattern 0, recall 0)
ACTION: 0
PMDW: 6
QUESTION: 2
-->
