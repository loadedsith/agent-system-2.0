# Triple-check — lens: contradictions between requirements

**PMDW**
Critique only, of `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md` (49 lines, read in full) and `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md` (571 lines, read in full). `RESEARCH.md:25-72` was read once because three findings needed a receipt from it. No file was edited; no formatter, linter, or test was run. Each finding is stated as "P-x says A; P-y says B; both hold only if C" — the A and B are CLAIMs with `file:line` receipts, the C is my inference and is labeled GUESS. Fix hints are one line, labeled PMDW.

**ACTION**
`mkdir -p /Users/jowolff/agent-scratch/agent-system-2.0/triple-check` → exit 0; this report written to `/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/contradictions.md` via the write tool. Reverse: `rm /Users/jowolff/agent-scratch/agent-system-2.0/triple-check/contradictions.md`. No other state changed; no file under `/Users/jowolff/code/agent-system-2.0` was touched.

## Questions first (two; the rest of the decisions are held inside the findings below, not dropped)

**QUESTION**
Is the P-7b reserved list closed at four items, or open? `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:230-231` says "any approval Jo has explicitly reserved; the rest of the list is open"; `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:252-253` and `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:18` present four items as ruled. *Closed* means P-4's per-step sign-off (a reserved approval, finding 7) has to be added as an explicit fifth item or folded into item 1. *Open* means REQUIREMENTS.md:18 needs the words "plus any approval Jo reserves" so the summary stops reading as exhaustive. Recommendation: closed, with P-4 sign-off written in as item 5 — an open reserved list is the "orchestrator won't be able to do ANYTHING" shape Jo rejected at `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:227-229`.

**QUESTION**
Who may write the "reserved-list exceptions" field of a per-workload brief (`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:165-166`) — Jo only, or the orchestrator as part of opening a lane? *Jo only* keeps P-7b item 4 (changes to the system's own rules are Jo's) intact and makes lane-opening a partly-reserved act. *Orchestrator* means the orchestrator can carve its own exceptions to the list that constrains it (finding 1). Recommendation: Jo only, and say so in P-5's ruling; lane-opening itself stays the orchestrator's call, only that one field is Jo's.

## Findings, by severity

### 1 · CRITICAL — The per-workload brief carries "reserved-list exceptions", and nothing reserves the brief

**Affects:** P-5, P-7b (item 4), P-16.

**CLAIM**
P-5's 2026-09-23 ruling re-homes the 1.x charter as "a per-workload brief (purpose, ceiling, reserved-list exceptions) plus per-repo rules a lane loads when it checks a repo out" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:165-166`, summarised at `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:14`.

**CLAIM**
P-7b says the orchestrator "opens hands, routes, retries, merges within policy, and escalates without asking" and "Everything not on the list is the orchestrator's call" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:229-232`; item 4 of the ruled list reserves "Changes to the system's own rules or machinery" to Jo and equates it with P-16's propose-never-apply — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:261-262`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:18`.

**GUESS**
P-5 says a lane's brief may hold exceptions to the reserved list; P-7b item 4 says changes to the system's rules are Jo's; P-7b's default says everything unlisted is the orchestrator's. Neither document says who authors a brief. Both hold only if the brief (or at least its exceptions field) is on the reserved list — which it is not, in either file. As written, the orchestrator opening a lane for a new workload writes a document that can exempt that lane from the list constraining the orchestrator. This is the P-16 failure mode (the system changing its own rules) reintroduced through P-5's ruling one day after P-7b was ruled.

**PMDW**
Fix hint: add "the brief's reserved-list-exceptions field" to P-7b item 4's scope, or strike "reserved-list exceptions" from P-5's brief and leave exceptions where item 4 already puts them — with Jo.

### 2 · HIGH — Spend above a lane's ceiling has three different behaviours, and no P-item caps the sum of ceilings

**Affects:** P-7b (item 2), P-8d, P-9, P-11, P-14.

**CLAIM**
P-7b item 2: "Spend above a lane's ceiling — P-9 already says the ceiling bounds a lane without per-dispatch approval; exceeding it is the one spend event with nowhere else to go" — i.e. it goes to Jo — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:256-257`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:18`.

**CLAIM**
P-11 names "a dispatch above the lane's ceiling" as a rule 2.0 "prevents mechanically" — a tool gate that refuses the action — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:358-361`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:27`.

**CLAIM**
P-8d: "Spend is governed by model routing, not per-dispatch approval; the 1.x spending gate is retired" — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:24`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:309-312`. P-9: "no per-dispatch human approval" and "who sets a lane's ceiling" is open for Phase 5, with Plumb's GUESS that it is the orchestrator — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:331-337`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:25`.

**CLAIM**
P-14: 2.0 "runs within the subscriptions and budget Jo actually has"; the concrete ceiling is owed by Phase 5 — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:30`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:439-442`.

**GUESS**
Three readings of the same event: P-7b item 2 says an over-ceiling dispatch is escalated to Jo (an approval); P-11 says it is refused by a gate (no approval, no dispatch); P-8d/P-9 say there is no per-dispatch approval at all. An escalation-to-Jo on the dispatch that crosses the ceiling *is* a per-dispatch approval for that dispatch. All three hold only if the sequence is written down: gate refuses → exception surfaces (P-8c) → Jo may raise the ceiling → lane retries. Nobody wrote that sequence. Separately: P-7b item 2 is only a control if the orchestrator cannot raise the ceiling itself, but P-9 leaves "who sets the ceiling" open and Plumb's own GUESS is the orchestrator; if the orchestrator sets ceilings and opens lanes on its own authority, the sum of ceilings is unbounded and P-14 is enforced by nothing in P-1..P-17.

**PMDW**
Fix hint: state the refuse-then-surface sequence once under P-7b item 2, and add "raising a ceiling, and the aggregate ceiling across lanes" to the reserved list so P-14 has an owner.

### 3 · HIGH — The ledger is lane-written; P-7a forbids exactly that for the state the orchestrator reads; P-17 wake needs the lane-written part

**Affects:** P-7a, P-8b, P-13, P-17, P-6.

**CLAIM**
P-7a: task state and steps live "in a store outside any context window, written by the machinery as a side-effect of the work, not by a lane choosing to write a status" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:221-223`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:17`.

**CLAIM**
P-13's ruled shape: "a ledger the machinery **and lanes** write as they work — decisions, task state and steps (P-7a), and what a lane injects at wake (P-17)" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:419-421`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:29`.

**CLAIM**
P-17 requires the first turn after resume to be grounded in "what was ruled" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:492-494`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:33` — and names the 1.x failure as hand-maintained handoff files "none required, none checked" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:497-502`.

**CLAIM**
P-8b: "A lane's report is informational; nothing the orchestrator decides depends on it" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:303`.

**GUESS**
P-7a says the orchestrator's state store is machinery-written, never lane-chosen; P-13 says lanes write the ledger, and lists "task state and steps (P-7a)" as ledger content; P-17 needs rulings at wake, and a ruling exists in the store only if a lane chose to write it. Both hold only if the ledger is partitioned — a machinery-written half (task state, steps, wake payload) the orchestrator reads, and a lane-written half (decisions) it does not depend on — and nothing in either file draws that line. Without it, either P-7a is violated (orchestrator reads lane-chosen text) or P-17's "what was ruled" is the 1.x decision-log pattern under a new name, and P-8b's "nothing depends on the lane's report" is false for every ruling. P-6's direct access widens this: a ruling Jo gives inside a lane bypasses the orchestrator entirely and reaches the store only through the lane-written half.

**PMDW**
Fix hint: in P-13, split "decisions" (lane-written, P-8b applies) from "task state, steps, wake" (machinery-written, P-7a applies), and say which half P-17 draws from.

### 4 · HIGH — Hand reports are trusted with no machinery check, but the lane's evidence to the orchestrator *is* hand output

**Affects:** P-4, P-8a, P-8b.

**CLAIM**
P-8a: "Hand reports are trusted as-is. Jo does not require machinery to check a hand's report" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:295-297`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:21`.

**CLAIM**
P-8b: the lane→orchestrator loop is closed by "machinery-written state (P-7a), observed liveness and absence-of-progress detection (process alive, time since last tool call), and P-4's evidence artifacts" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:301-303`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:22`.

**CLAIM**
P-4's evidence standard: the artifact, "not the lane's statement, is what Jo's sign-off is given on. 'The lane said so' is not a gate result", citing RESEARCH pattern 5 "hand output goes to a file; a reference travels upward" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:111-115`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:13`.

**GUESS**
P-8a says the hand's word is accepted unchecked; P-8b/P-4 say the lane's word is not accepted and an evidence artifact must close the loop; pattern 5 says the artifact is the hand's output file. So the "evidence" the orchestrator relies on is the unchecked hand's own report, one hop down. Both hold only if "evidence artifact" at the lane→orchestrator boundary means something the hand did not author — a screenshot, a test run, a trace (the P-4 addendum's Phoenix spans, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:125-130`) — and that requirement, applied to hands, is precisely the machinery check P-8a says Jo does not require. The two entries are reconcilable, but only by deciding P-8a's open column ("whether 2.0 checks anyway") in the affirmative, which REQUIREMENTS.md:21 still lists as undecided. Sub-point, also GUESS (I have not tested OMP's wait behaviour this session): P-8b's "time since last tool call" liveness signal reads a lane that is idle-because-blocked-on-its-hands as absence of progress, unless liveness observes the lane's children — P-8 makes hands the lane's children, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:275-276`.

**PMDW**
Fix hint: state in P-8b that the closing artifact is runtime-produced (span, exit code, screenshot), never hand-authored prose; that resolves P-8a's open column as a consequence rather than a separate choice.

### 5 · HIGH — The 2026-09-23 P-4 addendum names Phoenix as "the store" for state that P-13 (ruled 2026-09-22) already assigned to index + ledger

**Affects:** P-4, P-7a, P-7c, P-8b, P-13, P-16.

**CLAIM**
P-7a: task state lives in "the same store P-13/P-17 need (`RESEARCH.md` Question 1, index plus ledger)" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:224-225`. P-13 ruled 2026-09-22: index (ctx incumbent) plus ledger (Beads a candidate), ledger tool a Phase 5 choice — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:418-423`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:29`.

**CLAIM**
P-4 addendum 2026-09-23: Phoenix is a Phase 5 candidate for "P-8b observed liveness (span timestamps written by the runtime), P-7c message state (consumption visible as a span), and P-16"; "OMP emits → Phoenix is the store for the requirements above" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:125-130`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:136-137`. `RESEARCH.md` restates it as "Phoenix as the observation store (P-4, P-8b, P-7c, P-16)" — `/Users/jowolff/code/agent-system-2.0/RESEARCH.md:69-71`.

**CLAIM**
P-8b's closure is "machinery-written state (P-7a)" first — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:301`. REQUIREMENTS.md:13 (P-4) shows no open Phase 5 item; the Phoenix candidacy appears only in PREFERENCES.

**GUESS**
P-7a/P-13 say there is one store, shaped index + ledger; the P-4 addendum says there is a store called Phoenix for liveness, message state, and error counts — three things that are lane state under P-7a's definition. Both hold only if Phoenix is understood as the "index" half of P-13 (after-the-fact over spans instead of over transcripts) or as a third store the P-13 ruling did not contemplate; the addendum says neither, and REQUIREMENTS.md P-4's open column is "—" while a store decision now hangs off it. This is the brief's "one P-item names a Phase 5 dependency another has already ruled" shape: the P-13 ruling fixed the store's shape a day before P-4 acquired a store candidate outside it.

**PMDW**
Fix hint: one sentence in P-13's ruling placing Phoenix (traces) relative to index + ledger, and "observation store candidate (Phoenix)" in P-4's open column so the summary table stops saying "—".

### 6 · MEDIUM — The orchestrator is a conversational context with its own work, and no P-item requires *its* continuity

**Affects:** P-7, P-7b, P-8, P-12, P-17.

**CLAIM**
P-7: the one surface "is the orchestrator itself — the thing that holds the lane model, routes to lanes, and relays back" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:207-208`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:16`. P-7b: the orchestrator "opens hands" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:229`.

**CLAIM**
P-8: "the orchestrator does not dispatch into a lane" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:271-272`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:20`. P-12 holds open whether planning happens "before a lane exists for the project (planning creates the lane)" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:400-403`.

**CLAIM**
P-17 is scoped to "a lane's first turn" — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:33`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:492-494`. P-7a: "a lane's context can be lost without the orchestrator losing the lane" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:223-224`.

**GUESS**
P-7 makes the orchestrator a thing Jo converses with, and P-7b gives it hands of its own — so it has a context window that compacts and a process that restarts; P-12's "before a lane exists" option puts a whole planning conversation in that window; P-17 guarantees resume for lanes only. Both hold only if the orchestrator is either a lane (then P-8's "does not dispatch into a lane" and P-2's lane model need to say so) or holds nothing beyond the P-7a store (then pre-lane planning has nowhere durable to live until the lane is created). Neither is written. P-7a guards against the orchestrator losing a *lane's* state; nothing guards against the orchestrator losing its *own*.

**PMDW**
Fix hint: extend P-17's subject from "a lane" to "a lane or the orchestrator", or rule that the orchestrator holds no conversational state and P-12 pre-lane planning creates the lane first.

### 7 · MEDIUM — P-4's per-step sign-off is a reserved approval absent from the ruled reserved list

**Affects:** P-4, P-7b.

**CLAIM**
P-4: Jo's sign-off "after using the step's output on real work" applies to "every step unless Jo narrows it later" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:103-107`; "before the next step opens" — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:13`.

**CLAIM**
P-7b's reserved list, ruled at four items: phase open/close, spend above ceiling, irreversible actions outside the repo, changes to the system's own rules — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:252-262`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:18`. The same entry earlier says the list includes "any approval Jo has explicitly reserved" and "the rest of the list is open" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:230-231`.

**GUESS**
P-4 reserves an approval per build step; P-7b's ruled list has no such item, and a step is not a phase (P-4 says the plan is "many-phased", so phases contain steps). Both hold only if the list is open-ended (PREFERENCES :230-231) — but REQUIREMENTS.md:18 and the "ruled — four items" heading read as closed. The summary and the entry disagree on whether the list is exhaustive; the first QUESTION above is this.

**PMDW**
Fix hint: item 5, "sign-off on each build step's evidence artifact (P-4)", or a "plus any approval Jo reserves" clause in REQUIREMENTS.md:18.

### 8 · MEDIUM — "Remote push" on the reserved list makes every merge wait for Jo, which is per-unit-of-work approval by another name

**Affects:** P-1, P-7b (item 3), P-8d.

**CLAIM**
P-7b: the orchestrator "merges within policy … without asking"; "Explicitly *not* on the list: dispatching hands, choosing tiers within the ceiling, merging within policy, retrying, escalating — Jo's 'we are going for the opposite'" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:229`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:263-264`.

**CLAIM**
P-7b item 3 lists "remote push" first among irreversible actions outside the repository, with the concrete command list deferred to Phase 5 — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:258-260`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:18`. P-1 judges the system on Jo's throughput — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:10`.

**GUESS**
P-7b says merging is the orchestrator's; item 3 says pushing is Jo's; a merge that cannot be pushed is not finished work, so under P-1 every merged unit blocks on a Jo approval — the shape P-8d retired for spend reappears for delivery. Both hold only if item 3's Phase 5 command list distinguishes routine branch pushes from protected-branch pushes, deploys, and production writes. The entry cites the `careful` skill as the source list, and that list (as summarised at :258-259) includes "remote push" without that distinction.

**PMDW**
Fix hint: in item 3, replace "remote push" with "push to a protected branch or deploy" now, rather than leaving it to the Phase 5 narrowing.

### 9 · MEDIUM — P-3's migration unit was written when a lane was a seat; P-5 re-based lanes onto workloads and P-3 was not revisited

**Affects:** P-3, P-5.

**CLAIM**
P-3: "cutover is one lane at a time … 1.x stays as rollback until the last lane moves"; "The lane (P-2) is the unit of migration as well as of routing" — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:12`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:82-83` (dated 2026-09-22).

**CLAIM**
P-5, ruled 2026-09-23: a lane is bound to a workload spanning repos; 1.x seats are one-home-per-repo; standing workloads are "Jo's personal work", "Newdle ops" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:146-150`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:172-173`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:14`.

**GUESS**
P-3 says the cutover and rollback unit is a lane; P-5 says a 2.0 lane is a workload that may cover several 1.x seats' repos, and a 1.x seat's repo may serve several workloads. Both hold only if there is a written seat↔workload mapping saying which 1.x seats go dormant when "Newdle ops" moves and which come back if it rolls back. No such mapping exists in either file, and P-3's open column names only `OMP_PROFILE` isolation.

**PMDW**
Fix hint: add "the seat↔workload cutover map" to P-3's open column.

### 10 · MEDIUM — P-16's "depends on P-15" is a GUESS in PREFERENCES and a fact in REQUIREMENTS, and it pre-decides P-15's open question

**Affects:** P-5, P-15, P-16.

**CLAIM**
PREFERENCES marks the direction of dependency as "GUESS on whether Jo agrees" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:479-480`. REQUIREMENTS states "Depends on P-15: accepted proposals land in the portable repo" with no marker — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:32`.

**CLAIM**
P-15's open column: "which artifact classes are machinery vs state" — "a lane's charter? memory? the model-routing rule?" — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:31`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:456-457`. Jo excluded "state and specific lanes" from portability — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:453`. P-16 proposals are "a hook, a prose fix, a skill" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:465-466`.

**CLAIM**
P-5 puts "reserved-list exceptions" and the ceiling in the per-workload brief — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:165-166`; P-15 lists "rules, enforcement" as machinery — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:451`.

**GUESS**
P-16 says every accepted proposal lands in the portable repo; P-15 says specific lanes need not be portable and has not yet classed a lane's brief; a P-16 "prose fix" to a workload brief is therefore either a change to a non-portable artifact (P-16's dependency claim is false for it) or the brief is machinery (then "specific lanes need not be portable" has no referent, since P-5 already re-homed everything else a lane carries into the P-13 store). Both hold only if P-15's classing puts the brief on the machinery side, which is the open question P-15's column says Phase 5 owes. Also: the label was dropped in the summary — a GUESS promoted by restatement.

**PMDW**
Fix hint: restore the GUESS marker in REQUIREMENTS.md:32 or get Jo's word on it; and class the per-workload brief in P-15's ruling since P-5 has made it the one lane-specific artifact left.

### 11 · MEDIUM — P-4(b) "sign-off after real use", unqualified, cannot be given for steps that have no Jo-facing output

**Affects:** P-4, P-3, P-13.

**CLAIM**
P-4: "Jo's sign-off after using the step's output on real work"; the narrowing to steps that change what Jo sees or types "was **not** adopted; Jo said both, unqualified, so both apply to every step" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:103-107`.

**CLAIM**
The same entry queues an early step whose output is "see what lands" from an OTel emission test — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:132-135`; P-13 owes a ledger-tool choice — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:29`; P-3 owes the `OMP_PROFILE` isolation extent — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:12`.

**GUESS**
P-4(b) says every step needs Jo's sign-off after real use; the plan already contains steps (an emission test, a store schema, a profile isolation check) whose output Jo never uses on real work. Both hold only if "real use" is read as "the machinery's real use", which is the narrowing Jo declined. As written, the build plan cannot open its second step.

**PMDW**
Fix hint: one line under P-4 saying that for a step with no Jo-facing output, (b) is Jo's sign-off on the (a) artifact — the proofread wording at :111-113 already nearly says this.

### 12 · LOW — P-12's open column still points at "Phase 4 research", and Phase 4 closed with the question reshaped and held for Phase 5

**Affects:** P-12.

**CLAIM**
REQUIREMENTS.md P-12 open column: "which planning practice (Phase 4 research)" — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:28`; PREFERENCES: "a **Phase 4 research item** (queued below)" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:395-396`.

**CLAIM**
RESEARCH.md holds it for Phase 5 with a different shape — "'which planning practice' is the wrong shape — there are three jobs … one owner per job, or one stack for all three" — `/Users/jowolff/code/agent-system-2.0/RESEARCH.md:49-52`.

**GUESS**
No contradiction between requirements, but a stale dependency of the kind the brief asked for: REQUIREMENTS.md's header says it "is regenerated from [PREFERENCES], never edited alone" (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:6`), and neither file records the Phase 4 outcome for P-12 while P-13, P-5, and the graph-engineering hypothesis all carry post-Phase-4 rulings.

**PMDW**
Fix hint: P-12's column becomes "one owner per planning job or one stack — Phase 5; before/after lane — Phase 5".

### 13 · LOW — "Recall persists across the cutover" and "ctx may be replaced" and "1.x is never modified" only hold together if someone re-indexes 1.x

**Affects:** P-3, P-13, P-4 (early Phase 5 test).

**CLAIM**
P-13: recall "persists across sessions and across the 1.x → 2.0 cutover"; "the OMP seat-session gap below must close or the index is replaced" — `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:414-415`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:419-420`, `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:29`.

**CLAIM**
P-3: "1.x is never modified" — `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:12`, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:82`. The early Phase 5 ctx test registers a new `pi` root with ctx — `/Users/jowolff/code/agent-system-2.0/RESEARCH.md:66-67` — and RESEARCH.md says "ledger replaces ctx" means "lose transcript-level provenance" — `/Users/jowolff/code/agent-system-2.0/RESEARCH.md:32`.

**GUESS**
P-13 says 1.x's history must be recallable after cutover; P-13 also allows replacing the only index that holds it; P-3 says 1.x is not modified, while the test that would keep ctx registers a root in the index 1.x is currently using. Both hold only if (a) ctx's configuration is counted as outside "1.x" and (b) a replacement index re-ingests the 581 seat-session files and the Claude Code history ctx holds today. Neither is written. Whether registering a root in ctx changes 1.x's behaviour I did not test this session.

**PMDW**
Fix hint: add "1.x history migrates into whichever index 2.0 chooses" to P-13's open column.

## Closing

**PMDW**
Thirteen findings: one critical, four high, six medium, two low. Fix first: finding 1 — the per-workload brief's "reserved-list exceptions" field (P-5 ruling, `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:165-166`) has no reserved owner, which lets the orchestrator's own-authority default (P-7b) reach into the list that bounds it; it is a one-line change to either P-5 or P-7b item 4, and it closes before the spec restates P-7b as the system's contract. Generic-concern disclosure: finding 12 (stale phase pointer) is the only one that could be raised against any multi-phase requirements doc; the rest are specific to these two files.

<!-- output-types
tier: 0
CLAIM: 34
CITE: 0
GUESS: 14 (inference 14, pattern 0, recall 0)
ACTION: 1
PMDW: 16
QUESTION: 2
-->
