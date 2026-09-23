# Spec, design, migration — phase 5 of the 2.0 redesign

Prepared by Plumb before Jo opens Phase 5, so the whole agenda is visible and orderable up front
rather than arriving one question at a time. Phase 5 is opened by Jo, not by this file. Charter
text governing it: `.ai/plumb-seat-charter.md` § "What you own" item 5 — `SPEC-2.0.md` built by
interview, one question per message, each grounded in a quoted inventory item, review finding,
preference, or research entry, with a recommended answer; then `DESIGN-2.0.md` (keep / change /
drop for every 1.x artifact with its justification) and `MIGRATION.md` (ordered so the Marches
still run at every step, an owner and a reversal on each).

## Purpose, and how to use this

Jo reads down and rules yes / no / why on each item; Plumb captures the ruling into `SPEC-2.0.md`
as it is given and re-shows the running spec after every answer (charter § "Interviewing Jo").
Nothing here is a decision — the recommendations are Plumb's, carried from what is already
recorded in `PREFERENCES.md` and the triple-check, and every one of them is rejectable in one
word. Rejecting an item now is cheaper than rejecting it as a spec clause later. The session order
below (A: four load-bearing questions; B: batched open columns; C: keep/change/drop pass) was
ruled by Jo 2026-09-23 (*"stands"*); re-ordering within it is still a valid ruling, and the phase
ends when Jo says it ends, not when the agenda runs out.

Each question line carries: the question, the recommendation already on record (or `none
recorded`), and what each answer changes downstream.

## Prerequisites — before question 1

Three tests from `RESEARCH.md` § "Early Phase 5 tests". All touch Jo's home or Jo's credentials,
so **Tinker or Jo runs them**, handed over through Lintel; Plumb does not run them.

- **T1 — ctx as the index (P-13).** Register `~/.omp/agent/seat-sessions` as a `pi` root
  (`ctx sources add --provider pi --root …`) and see whether it indexes. Gates: whether ctx can be
  the after-the-fact index half of P-13's ruled index-plus-ledger shape, or must be replaced.
- **T2 — Phoenix as the observation store (P-4, P-7c, P-8b, P-16).** Start the local Arize Phoenix
  and point one OMP session at `http://localhost:6006/v1/traces`; see whether OMP emits OTel spans
  and in what shape. Gates: the observation layer four requirements now stand on. Per the
  triple-check ([O #2]), if OMP has no export, **building the observation layer is the first build
  step**, not a store choice — which changes the shape of `MIGRATION.md`, not just one answer.
- **T3 — TypeSafe as the routing judge (P-9; P-4/P-8b/P-20).** Ruled 2026-09-23: the 2.0 OMP
  profile holds Jo's TypeSafe API key, so OMP's native `judge` model role resolves to
  `typesafe/jev-latest` (`research/typesafe-ai.md` § bottom line). Time one `judge()` choice
  question of slice-brief size from an OMP eval cell; record latency, cost, enum + confidence.
  Gates: whether Q1's work-kind rule can run on every dispatch, or only on a sample.

The **ctx-first gate is not a prerequisite** — it is a per-session refusal in
`~/.omp/agent/extensions/ctx-first-search.ts`, in scope for the P-10 pass (Session C, § 1.4) like
any other rule, and it blocks nothing in this phase.

## Session A — the four load-bearing questions

In this order because each one's answer is an input to the next. Order is Kimi's cold read
(`triple-check/synthesis.md` § "Kimi's cold-read verdict"): P-9, P-3, P-7c threshold, P-7b command
list. These are not defects found in the requirements; they are the decisions Phase 3 deliberately
deferred.

**Q1 (P-9) — what is the work-kind taxonomy, and what does the orchestrator read a workload's
ceiling off?**
*Recommended:* taxonomy — none recorded, genuinely open. Ceiling source — the workload's stakes
(**GUESS**, carried from `PREFERENCES.md` § P-9, where it is already marked a GUESS). Classifier —
TypeSafe via OMP's native judge role, one choice question per slice returning a typed tier with
confidence (**GUESS**, `research/typesafe-ai.md` § 5, first candidate use; T3 measures it). Wiring
it into dispatch is build work: nothing in OMP's `task` tool calls the judge today and the extension
API exposes no judge (same report).
*Changes:* everything after it. The taxonomy is the rule P-11 must class as mechanical or written;
it is the thing a `tool_call` gate would enforce, and the triple-check notes ([O #7]) that OMP's
`task` has no model/tier parameter, so the taxonomy is realised either as an agent-file matrix or
as an input rewrite — a shape decision the spec cannot defer past this answer. First because Q2's
cutover order and Q4's command list both assume tiers already have names.

**Q2 (P-3) — what is the seat↔workload cutover map, what rule holds for a repository held by both
systems during overlap, and what retires a 1.x seat?**
*Recommended:* none recorded for the map or the retirement condition. For the overlap rule, none
recorded.
*Carried, not re-asked:* profile isolation is answered. **CITE** (`triple-check/synthesis.md`
Bucket 2 [O #1], fetched `config-usage.md` and `extension-loading.md`): a named `OMP_PROFILE`
isolates **only the OMP layer** — `~/.claude`, the Claude marketplace plugin, and every checked-out
repo's `.omp`/`.claude` load under every profile; the "drop the claude provider" lever P-3 names is
not the vendor mechanism, and the receipted lever is per-item `disabledExtensions`. So P-3 reads
"own profile **plus explicit per-item disables**". Not re-fetched for this brief.
*Changes:* the order of `MIGRATION.md` and which workload moves first. A cutover map keyed on seats
cannot name a step at all, since 1.x units are per-repo seats and 2.0 units are per-workload
(`synthesis.md` Bucket 1 #2).

**Q3 (P-7c) — what is the threshold, as a number, past which a message's state surfaces to Jo
unsolicited?**
*Recommended:* none recorded — the states are ruled, the number is not.
*Changes:* whether P-8c's quiet-by-default is real or nominal. The clock starts at *held*
(`PREFERENCES.md` § P-7c), so the number also decides how long a workload with no live lane may sit
before Jo hears about it. Depends on Q1 only in that a ceiling-bound lane may be the reason nothing
is live.

**Q4 (P-7b item 3) — which concrete commands count as "irreversible actions outside the
repository"?**
*Recommended:* start from the enumeration in 1.x's `careful` skill (`INVENTORY.md`), and replace
bare "remote push" with **push to a protected branch or deploy** (**GUESS**, held decision 6 below)
— otherwise every merge waits on Jo, which is the per-unit approval P-8d retired.
*Changes:* the reserved list is what P-11 has to gate mechanically; each command named here is a
tool call a gate must recognise. The triple-check ([O #3]) notes two shapes that evade a tool gate:
browser writes are not tool calls, and shell inside `eval` reaches the gate as one opaque string.

## Session B — the remaining open columns, batched

Every `REQUIREMENTS.md` row with a non-empty "Open for Phase 5" column, plus the workload
granularity question the cross-lab legs raised against P-1/P-5. Batched because none of them blocks
another; each carries its default so a batch can be ruled in one pass.

**Batch B1 — the model of the work itself**

- **Q5 (P-1, P-5) — at what granularity is a workload addressed: Newdle as one workload, Newdle ops
  as one, or a feature as one? Do workloads nest?** *Recommended:* none recorded.
  *Changes:* if address = workload name (P-5), nesting and the 1:1 lane:workload relation are
  undefined until this is answered (`synthesis.md` Bucket 2 [A F2]; GPT #5 / Kimi #14).
- **Q6 (P-8a) — does 2.0 check hand reports anyway, given P-8a trusts them as-is?**
  *Recommended:* the closing artifact is **runtime-produced**, not hand-authored (**GUESS**,
  `synthesis.md` Bucket 2 [C #4]) — the only reading that reconciles P-8a's trust with P-4's
  evidence artifact. *Changes:* what P-4's gate accepts as evidence.
- **Q7 (P-8c) — what counts as an error, and how does it surface?** *Recommended:* none recorded.
  *Changes:* the push channel for Q3's threshold and for P-16's proposals, which surface through
  this same route.

**Batch B2 — enforcement, planning, memory**

- **Q8 (P-11) — which rules are mechanical, and what tool call does each gate?**
  *Recommended:* none recorded as a list; the policy is ruled (mechanical whenever the forbidden
  action is a single identifiable tool call). *Changes:* the build steps — P-11 requires the gate
  built and verified in the same step that installs the rule. Depends on Session C: the list cannot
  exist until the surviving rules do.
- **Q9 (P-12) — is the spec-and-plan option offered before a lane exists, or inside one?**
  *Recommended:* **after a lane exists** for plan mode specifically (**GUESS**, `synthesis.md`
  Bucket 2 [O #11] — a floor answer from research E, not a ruling). *Changes:* whether planning can
  create a workload, or only run within one.
- **Q10 (P-13) — which ledger tool?** *Recommended:* Beads is a candidate, not a choice
  (`PREFERENCES.md` § P-13). Add OMP's native memory backends (`local`, `mnemopi`, `hindsight`,
  `sharpshooter`) to the candidate list (**GUESS**, held decision 5) — they are the only candidates
  guaranteed to read OMP sessions. *Changes:* depends on T1's result for the index half.
- **Q11 (P-17) — what is captured at wake, when, and how does wake verify it was read?**
  *Recommended:* none recorded. *Changes:* the third trigger (first lane on a workload with prior
  history) has no 1.x analogue, so this is new machinery, not a port.

**Batch B3 — portability, means, self-improvement**

- **Q12 (P-15) — where is the line between machinery and state per artifact class, and what is the
  install path?** *Recommended:* none recorded. Two items named by the triple-check as unclassed:
  the **per-workload brief** (the one lane-specific artifact left after P-5) and OMP's own install
  units (plugin package, `omp.extensions`, profile agent dir) ([C #10], [A F12], [O #9]).
  *Changes:* what Session C's "keep" disposition actually means — kept *where*.
- **Q13 (P-14) — the concrete ceiling: which subscriptions, what monthly spend?**
  *Recommended:* none recorded; Jo to state it when the design needs the number. *Changes:* nothing
  until Q1's ceiling rule needs a unit; [O #7] notes P-14 has no billing unit until OMP's billing
  path is receipted.
- **Q14 (P-16) — what is counted, at what thresholds, and how is a proposal surfaced?**
  *Recommended:* none recorded. *Changes:* [O #12] — on OMP a hook is a TS factory under
  `hooks/pre|post/`, so a `hooks.json`-shaped proposal would land and silently never fire; the
  proposal format is part of this answer.
- **Q15 (P-18) — per-artifact disposition for every plugin-shipped artifact, and how P-11's
  mechanical gates are rebuilt outside the plugin.** *Recommended:* re-home or drop per artifact,
  already ruled; nothing is kept by staying where it is. *Changes:* merges into Session C — P-18 is
  the rule, Session C is the pass that applies it.

**Batch B4 — the decisions held from the triple-check and the cross-lab legs**

Nine, from `triple-check/synthesis.md` § "Decisions held for Jo" and § "Cross-lab legs". Four were
ruled on 2026-09-23 (`PREFERENCES.md` § Interview log) and are listed only so the set is complete.

1. Split the vocabulary, workload vs lane. *Recommended yes* — **ruled yes 2026-09-23.**
2. The brief's reserved-list exceptions field is Jo-only; ceiling is orchestrator-set; opening a
   workload is not reserved. *Recommended yes* — **ruled yes 2026-09-23.**
3. Is the P-7b reserved list closed at four? *Recommended:* closed **at five**, with P-4 per-step
   sign-off written in as item 5. **Still held.**
4. May the 2.0 build depend on non-OMP 1.x machinery (HerdR panes, plugin hooks) during cutover?
   *Recommended:* no — OMP-native from the first lane. **Ruled 2026-09-23 as P-19** (OMP is the runtime).
5. Add OMP's native memory backends to P-13's candidate list? *Recommended:* yes. **Still held**
   (see Q10).
6. Replace "remote push" in P-7b item 3 with "push to a protected branch or deploy"?
   *Recommended:* yes. **Still held** (see Q4).
7. Raising a workload's ceiling joins the P-7b reserved list (GPT #3). *Recommended yes* — **ruled
   yes 2026-09-23.**
8. The orchestrator has no hands of its own; all work happens inside a lane (GPT #6). *Recommended
   yes* — **ruled yes 2026-09-23.**
9. Is P-16's dependency on P-15 a requirement or a GUESS (GPT #10)? It is a GUESS in
   `PREFERENCES.md` § P-16 and a requirement in the `REQUIREMENTS.md` summary. *Recommended:* none
   recorded beyond Plumb's own reasoning in § P-16. **Still held** — needs one word.

## Session C — the P-10 keep / change / drop pass

**Q16 (P-10) — does the pass run as the batches below, in this order, with "drop unless argued
for" as the default?** *Recommended:* yes, on the batch boundaries and order given here (**GUESS**
— the pass being a Phase 5 step ruled in batches is on record; the batching itself is Plumb's).
*Changes:* the size of every later batch, and what `DESIGN-2.0.md` records per artifact.

The rule-by-rule pass over the 1.x inventory, ruled in batches (P-10, confirmed 2026-09-22). The
default disposition is **drop unless argued for** — no 1.x rule carries into 2.0 by default — and
P-18 means a plugin-shipped artifact is re-homed or dropped per artifact, never kept in place.
Batches follow `INVENTORY.md` § 1's own artifact classes, so each batch has a fixed boundary and a
known size. Row counts are the governing-artifact rows in each table, counted for this brief.

| batch | `INVENTORY.md` heading | rows |
|---|---|---:|
| C1 | § 1.1 Identity and charter | 20 |
| C2 | § 1.2 Communication rules | 7 |
| C3 | § 1.3 Routing and delegation | 14 |
| C4 | § 1.4 Evidence and output types | 14 |
| C5 | § 1.5 Verification and hooks | 20 |
| C6 | § 1.6 Skills | 6 source rows, covering 63 plugin skills + 12 local dirs + 43 symlinks; the per-skill enumeration is § 8 |
| C7 | § 1.7 State | 15 |
| C8 | § 1.8 Seat-lifecycle machinery | 12 |

108 rows across C1–C8, plus the skills expansion in C6, which is the one batch that needs its own
sizing decision before it starts: § 1.6 counts sources, not skills, and Jo has already said they do
not want 50+ skills (`JO-INPUT.md` § Misc/Suggestions). Recommended order: C2 and C4 first (the
communication and output-types rules Jo interacts with most directly and has the strongest opinions
about), then C3, C5, C6, then C1, C7, C8 (which largely dissolve with the seat tier under P-5).

## Then: `DESIGN-2.0.md` and `MIGRATION.md`

- **`DESIGN-2.0.md`** needs from the spec: the work-kind taxonomy and ceiling source (Q1), the
  machinery/state boundary (Q12), the mechanical-rule list (Q8), and the Session C dispositions —
  it *is* the disposition ledger by the Phase 3 unit-of-decision ruling. Charter constraint: the
  design covers **all three tiers** and may propose changing the tier structure itself.
- **`MIGRATION.md`** needs: the cutover map and overlap rule (Q2), the retirement condition for a
  1.x seat (Q2), and T2's result (if OMP does not emit OTel, the observation layer is step one).
  Charter constraints: ordered so the seats still launch and Lintel still runs at **every** step,
  with an **owner and a reversal on each step**. P-4 adds: each step passes an automated gate
  producing an inspectable artifact **and** gets Jo's sign-off on that artifact after real use.

## Halt points — where Jo can stop and still have something usable

1. **After the prerequisites.** Two measured answers about ctx and OTel, useful on their own.
2. **After Session A.** The four deferred decisions are ruled; `SPEC-2.0.md` has a load-bearing
   core even with the open columns unfilled.
3. **After Session B.** A complete spec. `DESIGN-2.0.md` could be started by someone else.
4. **After any Session C batch.** Each batch is a closed artifact class with its dispositions
   recorded; a half-finished pass is still a real disposition ledger for the classes it covers.
5. **After `DESIGN-2.0.md`.** The design stands without the migration; executing `MIGRATION.md` is
   a separately approved plan regardless.

## What this brief does not decide

- Any of the questions in it. Recommendations carried here are the ones already recorded; none is
  new, and none is a ruling.
- The order of the agenda — Plumb's proposal, Jo's to change.
- Anything in 1.x. Phase 5 produces proposals; the seats, Lintel, the plugin, and Jo's local
  configuration keep running exactly as they are.
- Whether Phase 5 opens at all, or when it closes.

## Coverage of `JO-INPUT.md`'s five low-level requirements

Charter rule: Jo's five requirements seed `SPEC-2.0.md` and are the first thing the interview works
through. Mapping, with the two gaps named.

| `JO-INPUT.md` requirement | covered by |
|---|---|
| Everything must work with OMP | **P-19** (ruled 2026-09-23, strong form: nothing depends on Claude Code, HerdR, or the plugin, cutover included) |
| Nothing is sacred | P-10, and `PREFERENCES.md` § "Unit of decision" |
| Fine uninstalling the newdle plugin | P-18 |
| Backed up in a GitHub repo owned by `thewolff` (soft) | P-15, with the ownership clause folded into its text 2026-09-23 |
| All actual work handled as specific slices | **P-20** (ruled 2026-09-23: a slice is the hand-sized unit — one hand, one done-condition, one ledger entry, closed by machinery-written state; also in § Vocabulary). Open for Phase 5: slice brief's minimum fields; leaf-only or sub-slices |
