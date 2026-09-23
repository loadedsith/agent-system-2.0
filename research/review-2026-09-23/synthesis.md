# Triple-check synthesis — REQUIREMENTS.md + PREFERENCES.md, 2026-09-23

Three lenses, same provider, no cross-visibility. Raw reports beside this file:
`contradictions.md` (13 findings), `omp-floor.md` (12), `abolished-seat.md` (12).
Reviewed text: `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md` and
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md` at commit `e0d50e7` (before P-18, `12b354f`).
Clustered by defect. Lens tags: [C] contradictions, [O] OMP floor, [A] abolished seat.

## Decisions held for Jo (six raised across the lenses; two asked in chat, four held here)

1. **Split the vocabulary: "workload" (durable, addressable, carries brief/ceiling/memory key)
   vs "lane" (the running instance).** [A Q1] Recommend yes; eight entries get a mechanical reword.
2. **The brief's "reserved-list exceptions" field is Jo-only; ceiling is orchestrator-set; opening
   a workload is not reserved.** [C Q2, A Q2] Recommend yes.
3. **Is the P-7b reserved list closed at four?** [C Q1] Recommend closed, with P-4 per-step sign-off
   written in as item 5 (fixes cluster 8).
4. **May the 2.0 build depend on non-OMP 1.x machinery (HerdR panes, plugin hooks) during cutover?**
   [O Q1] Recommend no — OMP-native from the first lane; P-18 already points this way.
5. **Add OMP's native memory backends (`local`, `mnemopi`, `hindsight`, `sharpshooter`) to P-13's
   candidate list?** [O Q2] Recommend yes; they are the only candidates guaranteed to read OMP sessions.
6. **P-7b item 3: replace "remote push" with "push to a protected branch or deploy" now?** [C #8]
   Recommend yes; otherwise every merge waits on Jo, the per-unit approval P-8d retired.

## Bucket 1 — corroborated by 2+ lenses, artifact-specific

### 1. The per-workload brief lets the orchestrator write its own exceptions — [C #1 critical, A F3 high]
P-5's 2026-09-23 ruling (`PREFERENCES.md:165-166`) puts "reserved-list exceptions" in a brief no
P-item reserves; P-7b's default gives everything unlisted to the orchestrator. Plumb's own wording
from yesterday opened this. Fix: exceptions field → P-7b item 4 scope (Jo's); ceiling → orchestrator
(P-9); say who opens a workload. → decision 2.

### 2. P-3's cutover unit was a seat; after P-5 it has no mapping — [C #9, A F5]
"One lane at a time" cannot name a step when 1.x units are per-repo seats and 2.0 units are
per-workload lanes. Fix: P-3 open column gains "cutover unit = workload; seat↔workload map; rule for a
repo held by both systems during overlap; retirement condition for a 1.x seat". P-13 corollary: what
key 1.x persona-keyed memory is imported under.

### 3. The store is under-specified after two rulings a day apart — [C #3, C #5, O #5, A F10]
P-7a says machinery-written; P-13 says "machinery and lanes write the ledger"; the Phoenix addendum
names a third store; provenance has no key without personas; OMP's own memory backends are never
mentioned. Fix: P-13 partitions the ledger (machinery-written: task state, steps, wake payload, workload
open/closed; lane-written: decisions, P-8b applies); places Phoenix (traces) relative to index + ledger;
provenance key = (workload, lane-instance id, time); candidates += OMP native backends. → decision 5.

### 4. Continuity for a lane that *closed*, and for the orchestrator itself — [A F8, C #6, O #6]
P-17 fires on compaction/shutdown; a new lane for a workload with history is neither. The orchestrator
has a context window and no continuity requirement. OMP natively has `session_before_compact`,
auto-handoff in `compaction.methodOrder`, `before_agent_start` injection (CITE in `omp-floor.md`
finding 6) — the plugin snapshot Jo likes has a native successor. Fix: P-17 subject = "a lane or the
orchestrator"; third trigger = first lane opened on a workload with history; key = workload; 1.x row
adds OMP native compaction hooks + handoff as the thing to test.

### 5. P-7c has no addressee when no lane is live, and no cross-process interrupt on the floor — [A F4, O #4]
All three states presuppose a live lane; "urgent interrupt" is receipted only advisor→primary and
parent→child inside one process. Fix: addressee = workload; four states, first = "held by orchestrator,
no lane", threshold clock starts at *held*; "cross-process interrupt — unreceipted under OMP" to Phase 5.

### 6. P-8b liveness cannot tell closed from stalled, and is blind to browser work — [A F9, O #10]
Workload open/closed is not in P-7a's held state; browser/computer bridge calls emit no `tool_call`
(CITE hooks.md). Fix: P-7a held state includes each workload's open/closed and which lane is live;
progress = any bus event (`turn_*`, `tool_*`, `agent_*`); name the bridge blind spot.

### 7. P-15's classing of the brief, and the install unit — [C #10, A F12, O #9]
The brief is the one lane-specific artifact left after P-5; P-15 has not classed it; REQUIREMENTS.md:32
states P-16's dependency without the GUESS marker PREFERENCES carries. OMP's install units (plugin
package `omp.extensions`, profile agent dir) are unnamed. Fix: P-15 open column names the brief and the
OMP unit; restore the GUESS marker or get Jo's word.

### 8. P-11's "single tool call" and the ceiling sequence — [O #3, C #2, A F6]
Browser writes are not tool calls; shell inside `eval` reaches the gate as one opaque string;
"spend above ceiling" is refused (P-11), escalated (P-7b), and never-approved (P-8d) at once;
per-repo rules "loaded on checkout" have no install step and collide with P-10/P-15. Fix: P-11 wording
"a single AgentTool call that emits `tool_call`; bridge and in-kernel actions are written rules or get a
purpose-built gate"; state refuse → surface (P-8c) → Jo may raise → retry under P-7b item 2; per-repo
rules are 2.0-authored files that passed the P-10 pass, or dropped. P-18 covers the hook re-homing half.

### 9. P-4 sign-off is a reserved approval the list lacks, and cannot be given for steps with no Jo-facing output — [C #7, C #11]
Fix: item 5 on the reserved list (→ decision 3); one line under P-4: for a step with no Jo-facing
output, (b) is Jo's sign-off on the (a) artifact.

## Bucket 2 — single-lens, ordered by severity

- **[O #1 critical, CITE]** A named `OMP_PROFILE` isolates only the OMP layer; `~/.claude`, the
  Claude marketplace plugin, and every checked-out repo's `.omp`/`.claude` load under every profile
  (`config-usage.md`, `extension-loading.md`, fetched). The "drop the claude provider" lever P-3 names
  is not the vendor mechanism; the receipted lever is per-item `disabledExtensions`. Fix: P-3 wording
  "own profile plus explicit per-item disables"; P-3's open column is answered.
- **[O #2 critical]** Four requirements (P-4, P-7c, P-8b, P-16) now stand on the unmeasured OTel test
  and none of their REQUIREMENTS rows says so; OMP docs have no telemetry page; if OMP has no export,
  the observation layer is the first build step, not a store choice. Fix: "depends on the OTel early
  test" in four rows.
- **[A F1 critical]** "Lane" names both the instance and the durable slot in eight entries. → decision 1.
- **[A F2 high]** "Workload" is used at three granularities (Newdle / Newdle ops / a feature); if
  address = workload name, nesting and 1:1 lane:workload are undefined.
- **[C #4 high]** P-8a trusts hand reports unchecked; P-8b/P-4 require an artifact the hand did not
  author. Reconcilable only by ruling P-8a's open column: the closing artifact is runtime-produced.
- **[A F7 medium]** P-6 "open any lane directly (as with Plumb now)" — exemplar abolished; the no-live-lane
  case undefined. Fix: direct access = attach to the live lane or ask the orchestrator to open one.
- **[O #7 medium]** `task` has no model/tier parameter; the work-kind rule is realised as an agent-file
  matrix or a `tool_call` input rewrite; P-14 has no billing unit until OMP's billing path is receipted.
- **[O #8 medium]** P-6 direct access is evidenced only by HerdR panes; no OMP attach-to-session
  receipted (`collab.md`, `agent-hub.md` unread).
- **[O #11 low]** P-12's held question already has a floor answer for plan mode (after a lane exists);
  research-E's two OMP facts never reached the requirements.
- **[O #12 low]** P-16 "suggests a hook" — on OMP a hook is a TS factory in `hooks/pre|post/`; a
  `hooks.json`-shaped proposal would land and silently never fire.
- **[C #8 medium]** "Remote push" reserved makes every merge wait on Jo. → decision 6.

## Bucket 3 — corroborated but generic (housekeeping, not design)

- Stale pointers: P-2 still says "persistent" and "keep" with an unclosed GUESS [A F11]; P-12's open
  column still says "Phase 4 research" [C #12]. Fix in the same reword pass as decision 1.

## What P-18 (recorded after the reviews ran) already answers

Part of [O #3], [O #6], [O #9]: plugin hooks, the compaction snapshot, and the install path are
re-homed or dropped per artifact. It does not answer [O #1] (profile isolation) or [O #2] (OTel).

## Cross-lab legs (run 2026-09-23 13:25 on 96a5e70, after the vocabulary reword)

Outputs: `xlab/run-20260923-132555/gpt-contradictions.md` (GPT `gpt-6-astra`, codex read-only
sandbox, effort high, 10 findings) and `xlab/run-20260923-132555/kimi-coldread.md` (Kimi
`k2.7-code-highspeed`, 14 findings, bare prompt, no tools).

### Corroborates the Claude clusters
- GPT #5 / Kimi #14 = [A F2] workload granularity (P-1 "two workloads" vs P-5 project/feature).
- GPT #4 = [C #4]-adjacent: P-13 "lanes write" the ledger vs P-7a/P-8b machinery-only state.
- GPT #9 = P-15 open column overstates what P-18 already fixed.
- Kimi #9 = P-15 unverifiable until the machinery/state boundary is drawn (same as [O #3]).

### New — mechanical, applied without a ruling (XlabFixes builder)
- GPT #1 P-2 "persistent" lane lifetime contradicts P-5. → drop "persistent" from the lane definition.
- GPT #2 P-7b summary says "rules", full entry "rules or machinery". → summary fixed.
- GPT #7 P-7c four states vs P-8c quiet-by-default. → states queryable on demand; only past-threshold pushed.
- GPT #8 P-16 "never applies one itself" broader than the entry. → "never without Jo's acceptance".
- Kimi #5-8 workload/orchestrator/hand/seat used before defined in REQUIREMENTS. → `## Vocabulary` block.
- Kimi #12 P-17 third trigger read back as Jo's words. → attribution note (also P-7c states, P-7a open/closed).
- Kimi #13 P-5 two homes for per-repo expertise. → one mechanism (per-repo memory on checkout).

### New — held for Jo
- **GPT #3** the orchestrator sets the ceiling whose exceedance is reserved to Jo; setting vs raising
  never distinguished. Recommend: add "raising a workload's ceiling" to the P-7b reserved list.
- **GPT #6** P-7b "the orchestrator opens hands" vs P-8 "a lane spawns, briefs, and owns its hands".
  Recommend: rule the orchestrator has no hands of its own; P-7b reworded to "requests work from lanes".
- **GPT #10** P-16→P-15 dependency is a GUESS in PREFERENCES and a requirement in the summary.
  Needs one word from Jo; folds into the same ask as the two above if Jo prefers.

### Kimi's cold-read verdict (not defects, the Phase 5 agenda)
Kimi #1-4 (critical) are the deferred decisions themselves: P-3 cutover mechanics, P-9 work-kind
taxonomy + ceiling source, P-7c threshold value, P-7b item-3 command list. Kimi #10/#11: P-12 timing,
P-13 ledger tool. Kimi's "fix first" = P-9; GPT's = P-2 lifetime. These are the first spec questions
when Phase 5 opens, in that order: P-9, P-3, P-7c threshold, P-7b command list.
