# SPEC-2.0 — the agent system 2.0, as ruled by Jo

Phase 5 opened by Jo 2026-09-23 (*"next"*). Built by interview, one question per message, per
`briefs/phase5.md`; every ruling is appended here as it is given, in Jo's words where Jo gave
them. `REQUIREMENTS.md` (P-1 … P-20) is the input; this file records what each open column
resolved to. Vocabulary: `REQUIREMENTS.md` § Vocabulary (workload / lane / hand / slice).

Status legend per clause: **ruled** (Jo's word, dated) · **carried** (a default from
`PREFERENCES.md` or the triple-check, not re-asked) · **open** (QUESTION, not yet ruled).

## Prerequisite tests (handed to Lintel → Tinker 2026-09-23)

Results 2026-09-23 from Tinker (receipts: `/Users/jowolff/agent-scratch/tinker/phase5-prereq-tests/TINKER-REPORT.md`; Tinker's decision-log entry `28941e9` in `~/.claude`). Tinker's receipts, preserved without broadening.

| Test | Gates | Result |
|---|---|---|
| T1 ctx as `pi`-root index | P-13 index half | **works.** `ctx sources add --provider pi --root ~/.omp/agent/seat-sessions omp-seat-sessions` → seat-session hits found that were absent before; `--source-root` filters to them. Caveats: keyword-only (0 / 15,252 embedded), daemon "partially healthy", coverage of the 182 seat files unmeasured. ctx can be the index half of P-13. |
| T2 Phoenix / OMP OTel export | P-4, P-7c, P-8b, P-16 observation layer | **OMP exports.** Env-only switch (`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, http/protobuf; content off unless `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT`), source `pi-coding-agent/src/telemetry-export.ts:94-145`. One throwaway run → 1 trace, 4 spans (invoke_agent root, 2× chat, 1× tool) with `gen_ai.*` usage/latency/model attributes and OMP's `pi.gen_ai.*` step/tool fields; Phoenix maps to OpenInference and fills cost. The "no export → observation layer is build step one" branch does **not** fire. Carried default: OMP → Phoenix on 6006 directly (Tinker's recommendation; the Docker `otel-collector` holding 4317/4318 is an unproven hop). |
| T3 TypeSafe `judge()` latency/cost | whether Q1's classifier runs per dispatch or on a sample | **per dispatch.** Synthetic 1,112-char slice, one choice question: 0.20–0.47 s wall, `typesafe/jev-1.13.0`, $0.0000286 per call, choice stable across five runs, confidence 0.98–1. Accuracy unmeasured (one synthetic item). Ran in the default profile — see OQ-2. |

Also from T3: **a 2.0 OMP profile now exists**, `agent-system-2` at `/Users/jowolff/.omp/profiles/agent-system-2/`, created by Tinker, holding the TypeSafe key only (no chat-model credential). Undo: `rm -r` that directory.

## Session A — load-bearing decisions

### A1 · Work-kind taxonomy and ceiling source (P-9)

**A1.1 Taxonomy — ruled 2026-09-23.** Jo: *"yes to your recommendation of shape-keyed with 5
kinds"* (after asking for the alternative and trade-offs; Jo: *"i like your recommendation, what
would be a reasonable alternative and what are the trade offs of each?"*).

The work-kind rule is keyed on the **shape of the task**, read off the slice brief, five kinds:

| Kind | What the slice does | Tier (to be named in A1.3) |
|---|---|---|
| locate | find where something is; no interpretation | lowest |
| understand | read and report on a surface; no writes | mid |
| change-small | write, single file, checkable by a test or diff | mid |
| change-large | write, multi-file or with no mechanical check | mid-high |
| judge | design, review, decide; anything whose output is a ruling rather than an artifact | top |

Consequence (blast radius, reversibility) is **not** in the taxonomy: it is carried by the
workload ceiling (P-9) and the reserved list (P-7b). Rejected alternatives, recorded so they are
not re-proposed: consequence-keyed (classifier needs repo context the brief lacks; duplicates the
ceiling; not gateable as a single tool call) and hybrid shape-plus-raise-only-flag (flag is
redundant with the P-7b gate). Tier names per kind are A1.3; the kind→tier column above is
Plumb's carried default, not ruled.

**A1.2 Ceiling source — ruled 2026-09-23.** Jo: *"we're going with your recco - stakes
inferred"*. The orchestrator **infers** a workload's stakes from what Jo said in the surface plus
the target (production vs personal repo, protected vs scratch branch, whether a reserved-list
target is touched), writes it into the workload brief as one of **throwaway / normal /
production**, and shows the result in the surface as a one-liner Jo can override in one word.
Default **normal**. Jo writes no brief and promises none (Jo: *"i don't think i will reliably be
able to promise that there will be a workload brief for each workload"*; P-5 already makes the
brief orchestrator-written). The brief records the inferred value and any override (P-4 audit).
Rejected: default-to-top-cap (spends top tier on scratch work until noticed; the reserved-list
case is already forced to top by the *judge* kind and the P-7b gate). Stakes → tier-cap mapping
is A1.3.
Worked example confirmed by Jo 2026-09-23 (*"that does, at least as far as we are using opus at
the moment"*): a mobile CSS fix in `newdle-web` on a feature branch → *normal*, cap = the
mid-high rung; locate → lowest rung, understand / change-small → mid, judge → wants top, capped
to mid-high and recorded as capped. Jo's caveat is the reason A1.3 names **tiers, not models**:
the ladder is whatever the profile maps each tier to at the time (today haiku / opus / fable per
`.omp/agents/*.md:4`), and the spec never hard-codes a model name.

**A1.4 Workload granularity — ruled 2026-09-23** (pulled forward from Session B). Jo: *"task
size and the tags do not really matter"*. A workload is **task-sized**: one job with an end
(a fix, a feature, a rework, the 2.0 redesign), closed when done; Newdle has many at once, each
with its own ceiling and memory key. No repo-sized, never-ending workloads — that shape is a 1.x
seat, ruled out as a tier under P-5. Per-repo knowledge lives in the P-13 store keyed by repo,
not in a workload. **Group tags** (Newdle / personal) are not part of the model; P-1's "two
workloads" sentence reads as two *sources of work*, not two workload objects. Stakes levels
mean the same thing regardless of repo or source (Jo's clarifying question, answered same turn).

**A1.3 Classifier, tiers, routing chain — ruled 2026-09-23.** Jo: *"cool i thought so, lets go
with your recco"* (four tiers), after *"i would push back on change-large-deep spending top-tier
on every multi file. i feel depending on the complexity that could be an opus-5-5 task and not
necessarily a fable task."*

**Four tiers: fast / standard / strong / deep.** Names, not models; the tier→model table lives in
the 2.0 profile only (today fast=haiku-4-5, standard=opus-5, strong=opus-5-5, deep=fable-5-1,
matching the four distinct pins at `.omp/agents/*.md:4`). Kind→tier is fixed in the spec:

| Kind | Tier |
|---|---|
| locate | fast |
| understand | standard |
| change-small | standard |
| change-large | strong |
| judge | deep — the only kind that reaches deep |

**Routing chain per dispatch:** brief → classifier → kind → tier → cap → model.
1. Classifier: OMP's native `judge` role (TypeSafe when credentialed; T3: 0.2–0.5 s, $0.00003,
   runs on every dispatch), one choice question over the five kinds, returning kind + confidence.
   It names the kind of work only; it never picks a model.
2. Kind→tier: the table above.
3. Cap: the workload's stakes tier (A1.2) pulls a higher tier down; the pull-down is recorded.
4. Tier→model: the profile table; the hand spawns on that model.
Build constraint (`briefs/phase5.md:63-67`): OMP's `task` tool has no model/tier parameter and
nothing calls the judge today, so step 1 is a pre-dispatch hook or extension and step 4 is one
agent file per tier or an input rewrite — a `DESIGN-2.0.md` choice.

**Low-confidence rule — shape ruled 2026-09-23, threshold under measurement.** Jo: *"recommended,
i can spend the hour"* (after *"so the .80 number is grounded in real data?"* — it was not: T3
measured one synthetic brief, confidence 0.98–1.0, accuracy never measured). The rule: below
the threshold, dispatch at the **higher tier of the top two kinds** by the classifier's own
probabilities (never lower; the B4 stakes cap still applies); record the pull-up on the slice's
ledger row; count pull-ups as a P-16 signal about the brief or the question. Above the
threshold, route as classified. **The threshold is measured, not chosen:** a hand is classifying
~30 real briefs from this repo's own history (Jo-owned sources only, per OQ-2), hand-labelled
first, three batches of ten with per-brief on-disk output and a 20-minute cap, so a failure
part-way is visible and resumable (`/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/`).
The number goes here when `REPORT.md` lands, with the accuracy figure beside it. Rejected: "one
tier up" (ignores the probabilities `judge()` already returns); 0.80 as an unmeasured
placeholder (Jo).
**Measured 2026-09-23** (`research/classifier-sample.md`; raw rows in
`/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/`): 30 real briefs, hand-labelled
first, `typesafe/jev-1.13.0`, $0.00097 total. Agreement 23/30 (76.7%). **Threshold: 0.55** — the
knee of the sweep: flags 5 of 30, catches 4 of 7 disagreements, one false flag; 0.80 would flag
10 of 30 for the same 4. Two disagreements at 0.98–0.99 are vocabulary-driven (the brief contains
`judge()`; "report whether…") and are a classifier-instruction fix, not a threshold. The
classifier chose change-large 0 times in 30 (the one hand-labelled change-large scored judge
0.62 / change-large 0.24) — the higher-of-top-two rule over-serves that case rather than
under-serving it. Caveats: n=30, one change-large and four judge examples; hand labels are a
model's reading, not Jo's; 1.x-style prompts, not B9 six-field briefs (production confidence
expected higher, so 0.55 errs safe). Re-measured after the first real month from ledger pull-ups
versus gate failures (P-16).

### A2 · Seat → workload cutover map, overlap rule, seat retirement (P-3)

**A2.0 Unit of cutover — consequence of A1.4, not separately asked.** Workloads are task-sized,
so no 1.x seat maps to one workload. A seat maps to a **repository whose new work starts opening
as 2.0 workloads**; the cutover map is an ordered list of repositories (equivalently of the twelve
1.x seats: Lintel, Tinker, Sedge, Verge, Wren, Sluice, Galley, Levitt, Codex, Caspian, Tron,
Plumb — `seat_list` 2026-09-23). The first 2.0 workload opened on a repo is that repo's cutover
event.

**A2.1 First repository — ruled 2026-09-23.** Jo: *"this one absolutely"* — `agent-system-2.0`,
the build of 2.0 itself, moves first: the build plan runs as 2.0 workloads from the first lane
that can run. Rationale: real work, lowest stakes (no users, one seat, rollback is Plumb
continuing), and the machinery must work on itself before it touches a shipped repo (P-4).
Known blind spot: deploys, protected branches, and the reserved list never fire here, so the
**second** repository is a product repo — A2.2.

**A2.2 Cutover is one event, not a per-repo order — ruled 2026-09-23.** Jo's hypothesis: *"because
of the way 2.x lanes/seats work compared to 1.x, my hypothesis is that we will reach a condition
where 2.x is good enough and then all 1.x seats would be retired"*; Plumb's reading that it holds
with amendments; Jo: *"record that in place"*. Basis: P-5 — a lane is not repo-bound, so 2.0's
capability is one set of machinery for every repo; there is no repo-specific readiness to wait
for. The per-repo order question is withdrawn.
- **A2.1 stands as the proving ground**, not as step one of twelve: the machinery is built and
  exercised on this repo's real work.
- **Good-enough evidence** = the self-hosted build running as 2.0 workloads **plus at least one
  product-repo workload that exercised a reserved-list action under the gate** (deploys and
  protected-branch pushes never fire in this repo, so self-hosting alone cannot prove the gate).
- **Per-repo knowledge migrates in bulk before the switch**: each seat's memory and charter
  content → P-13 entries keyed by repo. Data migration, not a cutover.
- **Lintel retires at a single moment by nature** — two orchestrators overlapping is the one
  overlap that is bad in itself.
- **Retirement is dormancy, not deletion**: launchers, charters, HerdR rows stay on disk for a
  period Jo sets; fallback is one command. Deleting 1.x is a later, separate decision. This is
  how P-3's "1.x remains rollback" survives a single-event cutover.
- The event fires when Jo says so (A2.4), with the evidence above in front of them.

**A2.3 Overlap rule — ruled 2026-09-23.** Jo: *"both may take work but the idea is to eventually
completely retire all 1.x seats"*. During overlap, 2.0 takes a repo's work by default; the 1.x
seat takes only work 2.0 cannot yet do at that step of the build (a deploy, a reserved-list
action, anything the missing machinery blocks). When the orchestrator hands work back to 1.x it
says so in the surface — a sentence in the P-13 ledger, **not a gap-list file or schema** (the
earlier "written as a gap in `MIGRATION.md`" wording was withdrawn under A2.4 the same turn: the
second write path it needed was a change to 1.x, forbidden by P-3). Mechanical guard (P-11): a
1.x seat may not touch a branch a 2.0 workload has open. End state is unambiguous: **every 1.x
seat retires**, Plumb included; overlap is a transition, not a steady state.

**A2.4 Retirement condition — ruled 2026-09-23.** Jo: *"i say so, no gap list no machinery"*
(after *"it just seems like we might have to institute a lot of machinery to even gather this
data"*). A 1.x seat retires **when Jo says so, per seat**. Evidence offered at that moment: the
observation layer's count of completed 2.0 workloads on that repo (Phoenix, T2 — a query over
spans the lane already tags with the workload name, no new machinery) and the ledger's record of
any hand-backs to 1.x. Nothing computes "ready"; no N. Rejected: mechanical retirement on an
empty gap list for N workloads (needs a 1.x write path, forbidden; measures only fallbacks the
system saw; zero for quiet repos; gameable by scope; measures capability not quality).

### A3 · Unsolicited-surface threshold (P-7c)

**Ruled 2026-09-23.** Jo: *"4 hours"*. A held thing on any open workload — a message in state
*held* (arrived with no live lane), or the workload itself open with no lane and no activity —
is pushed to Jo unsolicited once it has been held for **4 hours**. One number, applied to the
age of the oldest held thing per workload; everything younger stays queryable-only (P-8c).
Failed gates and errors surface by their own route, not this clock.

**Form of a workload with no live lane** (Plumb's reading, confirmed by Jo asking for it, same
turn): one row in the P-13 ledger — name, brief, stakes/ceiling, opened-at, last-activity-at,
slices and their states, message queue with P-7c states, lane field empty. The ledger is the
list of open workloads; "not being worked on" is the query `open AND no lane`, never a scan of
Linear or GitHub. Linear issues / projects, GitHub issues, `.projects/` specs are optional
*sources* linked on the row for P-17 resume, never the source of truth for open/closed (P-7a).
Phoenix records activity by workload name; it holds no state.

**Ledger technology: not yet decided** (Jo, same turn: *"we haven't yet decided on the actual
tech to hold the ledger for 2.x yet, correct?"* — correct). P-13 names it a Phase 5 choice, Beads
a candidate; OMP's native memory backends (`local`, `mnemopi`, `hindsight`, `sharpshooter`) are
held as candidates from the cross-lab review. It is a Session B question (Q on P-13).

### A4 · Reserved-action command list (P-7b item 3)

**Ruled 2026-09-23.** Jo: *"yes as stated"*. "Irreversible actions outside the repository" =
the 1.x `careful` enumeration — force-push, hard reset, branch or tag deletion, `rm -rf`,
`DROP` / `TRUNCATE`, production database writes, infrastructure teardown (`doctl` and kin), secret
rotation — **plus** push to a protected branch, **plus** deploy. **Not reserved:** pushes to
feature branches; merges of approved, green PRs (P-8d: no per-unit approval). The bare "remote
push" wording in P-7b is replaced by "push to a protected branch or deploy" (held decision 6,
now ruled). Enforcement is P-11's: each item is a tool call a gate must recognise; the two known
evasions — browser writes are not tool calls, shell inside `eval` reaches the gate as one opaque
string — are build requirements on the gate, not list items.

**Session A closed 2026-09-23.** A1 routing, A2 cutover, A3 threshold, A4 reserved commands all
ruled. Halt point 2 reached (`briefs/phase5.md` § Halt points).

## Session B — remaining open columns

Opened 2026-09-23 (*"on to session b"*). Q5 (granularity) was ruled in Session A as A1.4.

### B1 · Slice closure: runtime artifact, reports untouched (P-8a, P-4, P-20)

**Ruled 2026-09-23.** Jo: *"yes."* A slice closes on a **runtime-produced artifact** captured by
the machinery — a test run's exit code, a diff, a screenshot, a command's output — never on the
hand's prose. The hand's report is kept as-is and is never checked by a second hand (P-8a stands).
For slices with no runnable output (the *judge* kind: a design, a ruling), the artifact is the
written output plus Jo's acceptance. This is P-20's "closed by machinery-written state" and what
P-4's gate accepts as evidence. Rejected: a second hand reviewing reports.

### B2 · Ledger tool (P-13) — open

**P-19 clarified 2026-09-23.** Jo: *"for the ledger question it definitely doesn't need to only
be made out of OMP material - beads and any other 3rd party solution available to use"*. P-19
excludes Claude Code, HerdR, and the newdle plugin; it does **not** exclude third-party tools.
The ledger may be a third-party store, provided an OMP extension can read and write it and no
hosted service is mandatory. This answers the research hand's QUESTION in
`research/ledger-candidates.md` (it had assumed exclusion).

Evidence so far (`research/ledger-candidates.md`, Tinker-style receipts preserved): OMP's four
native memory backends are free-text memory, per-profile, not a ledger; OMP's own task state is
per-session; plain SQLite via `bun:sqlite` (already OMP's engine) holds the full row and answers
both queries — tested in plain Bun, not yet inside a loaded extension. Beads: runner-up pending
the wider scan. A bounded third-party scan (Beads in depth plus up to six others) is running →
`research/ledger-candidates-third-party.md`. Ruling deferred until it lands.

**Constraint added 2026-09-23.** Jo: *"while i am the only one using this machinery, some day my
colleagues might, and i don't necessarily want something as important as the ledger locked into
omp"*. The ledger is **not OMP-bound**: a non-OMP client (a CLI, another harness, a person) can
read and write it without OMP running; the data format is open (a plain file with a documented
schema, or git-tracked text); multi-user and multi-machine use is a weighted criterion, not an
afterthought. This narrows P-19 for the ledger specifically (OMP is the runtime *of the lanes*,
not the owner of the record) and extends P-15 (portable machinery) to "portable record". Plain
SQLite owned by an OMP extension is re-judged against this: the file is open, but the schema and
writer would be OMP-only unless the schema is documented and a standalone CLI exists. The
running third-party scan was steered to weight this.

**Proposed 2026-09-23 — not ruled.** The 2.0 ledger is a homegrown SQLite database: one file
outside any OMP profile; a documented schema in this repo; one TypeScript ledger module the OMP
extension imports; no custom CLI; Beads the named fallback. The ledger must hold: workload rows
(brief, stakes, lane, open/closed, last activity), slices, the four-state message queue (held /
delivered / consumed / acted-on, with the age of the oldest held message queryable — B3),
direct-instruction entries (B5), and (workload, lane-instance, time) provenance; wake is the
ledger rendered (B7). Jo's stated cost: *"it creates yet another piece of machinery for me to
maintain and that's a real cost"*, and *"everyone is using beads and it's cool and talked about
a lot"*.

**Cross-lab gaslight 2026-09-23** (Jo: *"i want to gaslight this decision - all labs"*; three
legs returned; reconciled report
`/Users/jowolff/agent-scratch/agent-system-2.0/gaslight-b2/RECONCILED.md`). Verdict
simplify-and-verify. Four defects landed 3/3 and apply to whichever engine is chosen:
1. **Writer contract.** "No custom CLI" contradicted the constraint above and B8's machinery
   list; raw `sqlite3` is a safe reader, not a safe writer. Fix: the state-order and provenance
   rules live *in the file* (`CHECK` + `BEFORE UPDATE` trigger — live-tested in `bun:sqlite` by
   one leg), or the module's operations are callable without OMP; B8's "CLI" wording follows
   whichever is chosen.
2. **Fallback trigger.** "Live concurrent multi-user writes" skips sequential transfer and
   asynchronous collaboration, and is the one case Beads meets only with a shared
   `dolt sql-server` — a hosted service, which this section forbids being mandatory. Fix: name
   the three collaboration needs separately; v1 topology stated explicitly.
3. **State locality.** v1 ledger state is local, never on a synced or network folder (SQLite
   WAL does not work over a network filesystem — sqlite.org/wal.html); path defaults under
   `$HOME`, overridable, listed in the install manifest; cross-machine is a later
   JSONL-to-git-ref export.
4. **Gate.** The loaded-extension `bun:sqlite` import is still untested; a throwaway extension
   test is a P-4 gate before any ruling.

**Disagreement handed to Jo.** Claude cleared Beads with new receipts (embedded Beads is
single-writer under a file lock, so many concurrent lanes need a `dolt sql-server` daemon even
solo; 11 upstream release tags since June); Codex and Kimi landed the exclusion as
under-evidenced (no candidate binary was ever run; the research's "Beads cannot filter
metadata" claim is contradicted by Beads source). The "Beads unmaintained" caveat is refuted
(repo pushed 2026-09-23, release 2026-09-15). Jo, 2026-09-23: *"let's go with thew recco"* —
**one bounded hand-day runs the same ledger lifecycle through both engines before B2 is ruled**
(brief: `/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/BRIEF.md`; routed via
Lintel). Ruling waits on `REPORT.md` there. Jo's preference is on record: *"i really, really
want to use beads"*; preference is a legitimate reason in this spec.

### B3 · What counts as an error, and how it surfaces (P-8c)

**Ruled 2026-09-23.** Jo: *"those four things"* (after asking for alternatives and their
complexity). Exactly four things surface unsolicited, one line each in the single surface (P-6):
1. a reserved-list action waiting on Jo (P-7b);
2. a held thing past the A3 threshold (4 hours);
3. a failed gate the lane could not recover — a slice that failed its runtime artifact (B1)
   **twice** (starting number, Jo's to change);
4. a lane that died — session gone, workload still open — surfaced once even if the orchestrator
   reopens it, because a vanished worker is the 1.x "seat forgot" failure Jo wants to see.
Everything else — a hand failing once, a retry, a slow slice, a ceiling cap firing, a workload
opening or closing — stays inside the lane and the ledger, queryable on demand. P-16 proposals
ride this same channel. Rejected, recorded for Session C not to re-propose: narrower (items 1–2
only — same information four hours later); broader (a second "worth knowing" digest tier —
erodes quiet-by-default, second stream to read); configurable per stakes (a policy table Jo would
have to remember exists). A tier can be added later at no cost; removing one costs trust.

**Fifth item, ruled 2026-09-23.** Jo, after noting 1.x seats *"often get stuck on prompts and we
are unaware"*: *"add 'lane waiting on a human, reserved or not' to B3's unsolicited list as a
fifth item once it's confirmed observable"*. Confirmed observable the same day (reader report
`/Users/jowolff/agent-scratch/agent-system-2.0/omp-prompt-state.md`, copied to
`research/omp-prompt-state.md`): OMP's extension API emits `tool_approval_requested` /
`tool_approval_resolved` with session, tool-call id, tool name and reason
(`pi-coding-agent/src/extensibility/extensions/types.ts:916-932`, emitted at
`extensions/wrapper.ts:285-303`); an `ask` wait is `tool_execution_start` with
`toolName === "ask"`. Not visible through hooks or the registry roster (running/idle/parked/aborted
only) — the 2.0 extension subscribes directly. A process that dies while blocked never emits
`resolved`; item 4 (lane died) is the liveness check that closes that hole.
5. a lane waiting on a human, reserved or not — surfaced when the wait begins, with what it is
   waiting on; not the four-hour clock.
The gap it closes: a lane alive but blocked on a non-reserved prompt (tool permission, `ask`,
confirm) was none of items 1–4. Companion lane rule for Session C: non-reserved prompts are
designed out (permissions pre-granted in the profile template, `ask` not available to lanes), so
the only human wait a lane can hit is the reserved list; item 5 is the safety net if that leaks.

### B4 · Stakes → tier cap, and review as a stakes property (P-9, P-8a, A4 "approved")

**Ruled 2026-09-23.** Jo: *"yes to your reccos"*, after *"so would every normal workload cost
fable time?"* exposed that A1.2/A1.3 had left the stakes→cap table unset.

| Stakes | Tier cap | Review before merge | Jo's part |
|---|---|---|---|
| throwaway | fast | none | none |
| normal | strong | a *judge* slice (runs on strong under the cap); merge proceeds on pass | told in one line after the merge |
| production | deep | a *judge* slice on deep, **then Jo** | approves the merge; the deploy is a separate reserved one-liner (A4) |

So fable is spent only on production workloads' judge slices and on anything Jo raises. A judge
slice's closing artifact (B1) is its written verdict plus the slice's runtime artifacts; a second
failed review is B3 error #3. Jo reviews a result the judge already passed — verdict plus diff —
never a cold diff. **A4's "approved, green PR" is defined as: the stakes-required review
passed.** Overriding stakes in one word (A1.2) is also how Jo asks for more or less review on a
workload; there is no separate review setting. Rejected: end-only (Jo sees output only at the
protected-branch / deploy boundary — never reviews the approach); front-and-end (plan approval
mandatory above a stakes level — P-12 stays optional).

Hole this closed, for the record: before this ruling nothing in `REQUIREMENTS.md` defined a
review process for workload output (`grep review|approv` 2026-09-23: no requirement), and A4's
"approved" was undefined.

### B5 · Jo steering a lane, and Jo coding manually (P-8, P-13, P-17)

**Ruled 2026-09-23.** Jo: *"yes to your reccos"* to *"what happens if i decide i want to steer or
code manually at some point?"*
- **Steering from the surface** is the normal path: a message into the lane's next turn with a
  P-7c state, so delivery and action are visible. Already covered by ruled requirements.
- **Direct instructions to a lane are ledgered.** Jo may open a lane's OMP session and talk to it
  (P-8: direct access is a choice); the lane records any such instruction as a ledger entry, same
  as a surface message, so P-13 recall and P-17 wake do not miss it. One mechanical rule (P-11).
- **"I've got X" hands the workload to Jo.** The orchestrator closes the lane; the workload stays
  open with `lane = Jo`; no slices run; the A3 clock does not run against Jo. **"X back to you"**
  reopens a lane, whose first turn is P-17-grounded on the ledger plus Jo's diff. One new lane
  state, no other machinery.
- **A side branch needs no rule**: Jo codes on their own branch, the lane continues, merge as
  anyone would.
- **Not blessed:** Jo editing in a running lane's checkout on the workload's branch — it
  recreates the shared-checkout collision the 1.x charter already recorded once
  (`.ai/plumb-seat-charter.md:67-70`). If it happens anyway, the runtime records the foreign
  diff as a ledger entry and the next slice's brief includes it; that is mitigation, not a mode.

### B6 · Spec-and-plan option is offered inside the lane (P-12)

**Ruled 2026-09-23.** Jo: *"inside the lane"*. The orchestrator opens the workload and lane as
usual. If Jo said "plan it", or stakes is *production* and the orchestrator offers it in the
stakes one-liner (*"plan first? (recommended)"*), the lane's **first slice is a *judge*-kind
planning slice** whose closing artifact is the plan, which Jo approves before any *change* slice
runs. No planning happens before a workload exists — the orchestrator has no hands (P-7b/P-8)
and a plan is already a *judge* slice with a tier and an artifact (A1, B1). A plan spanning
several workloads (an epic) is a workload of its own whose output is other workloads' briefs,
which the orchestrator then opens; no new concept. Which planning practice the slice follows
(Phase 4 research) is a `DESIGN-2.0.md` choice.

### B7 · Wake: the ledger rendered, never a hand's prose (P-17)

**Ruled 2026-09-23.** Jo: *"i think we should refer to a ledger over an agent's prose pretty
much any day."* At every P-17 trigger (compaction, restart, first lane on a workload with
history) the lane's first context is **the ledger row rendered**: brief, stakes, open slices and
their states, the last N ledger entries (decisions, hand-backs, Jo's direct instructions), and
the message queue with P-7c states. Captured continuously by machinery — nothing depends on an
agent remembering to write a handoff. **Verified read:** the lane's first turn must write one
ledger entry stating what it is resuming; the machinery refuses a second turn until it exists
(P-11: single tool call). Older history is one P-13 index query away. Rejected: a hand-written
handoff or summary as the wake source (1.x `session-handoff.md`, wrap-up prose) — the 1.x
"seats forget" failure is exactly a handoff that was not written or not read. Prose may exist
*in* the ledger as an entry's body; it is never the source of truth for state.

### B8 · Machinery vs state, and the install path (P-15)

**Ruled 2026-09-23.** Jo: *"yes"* (after *"i agree that portability of state is a separate
question"* and *"1.x has a lot of drift right now"*).

**The rule:** machinery = everything identical on every machine — the 2.0 OMP extension(s), the
four tier agent files, the classifier prompt, rule text, gates, skills, the ledger **schema,
module, and CLI**, the profile *template* (settings, model-role and tier→model mapping, extension
list; no secrets) — lives in the `agent-system-2.0` repo. State = everything per-machine or
per-moment — ledger *contents*, sessions, workload briefs, checkouts, credentials, Phoenix data —
never in the repo. Classifies the two unclassed items: the per-workload brief is state; OMP's
install units are machinery the repo declares. Per-repo rules (P-5) are machinery owned by each
product repo, not by this one. Whether state *can* travel is B2's sync property, held there.

**The install path:** one script that builds the OMP profile from the template and links the
extension and agent dirs into it — "clone, run install, add your keys".

**No hand-maintained artifact table.** The script reads a **machine-read install manifest** in
the repo — one row per artifact: path, kind, destination — and that manifest *is* the machinery
table. It cannot drift from what is installed because it is what is installed; a repo artifact
under the machinery directories with no manifest row **fails install** (P-11 mechanical check);
a wrong row fails the fresh-machine install test (P-4 gate). `DESIGN-2.0.md`'s per-artifact rows
(Session C) cite manifest rows rather than restating them. Rejected: a hand-written per-class
table (drifts — the same failure seen today in `REQUIREMENTS.md` summary rows and
`briefs/phase5.md`); rule-only (leaves the ambiguous rows — profile settings vs secrets,
tier→model table, per-repo rules — to be re-reasoned each time). Cost: one manifest row per new
artifact, one build step, the fresh-machine test that P-4 requires anyway.

### B9 · Slice brief minimum fields; leaf-only (P-20)

**Ruled 2026-09-23.** Jo: *"i agree with these"*, then *"good reccos lets do em"*. A slice brief
has exactly six fields: (1) **workload id** (ledger key); (2) **task**, one paragraph; (3)
**done-condition**, stated as the runtime artifact that closes the slice (B1) — what P-4's gate
accepts; (4) **inputs**: the paths and branch the hand may touch (feeds the A2.3 branch lock and
the OQ-1 repository boundary); (5) **stakes**, inherited from the workload, never re-stated by
hand (feeds the B4 cap); (6) **ceiling share**, a number the lane sets from the workload's
remaining ceiling (P-14). Work-kind and tier are **not** fields — the classifier derives them from
(2) (A1.1, A1.3). **Leaf-only:** a slice never spawns sub-slices; a hand that finds it needs
decomposition closes its slice with a "needs split" artifact and the lane cuts new slices.
Rejected: sub-slices (hands spawning hands — the Lintel pattern Jo rejected in the cross-lab
rulings, `PREFERENCES.md` § log 2026-09-23); extra fields (every field is one the lane can fill
wrong; six is what the ruled machinery consumes).

### B10 · Linear and GitHub issues (new requirement P-21)

**Ruled 2026-09-23.** Jo: *"much like 1.0, 2.x must work with both"* — *"I don't know if i made
it a clear and explicit req"*. It was not in `REQUIREMENTS.md`; recorded here as **P-21: 2.0
works with both Linear issues and GitHub issues, as 1.x does.** The tie-back: a workload row
carries an optional `source` link (a Linear issue or a GitHub issue; `.projects/` specs likewise);
on workload **open** and **close** the machinery mirrors state to the source — status plus a
one-line comment carrying the ledger summary; **nothing per slice** (a slice inherits its
workload's source through the workload id); the source is **never read for truth** (A3, P-7a:
open/closed is the ledger's query, never a scan of Linear or GitHub). Write-back is not a
reserved action (reversible, not on the A4 list). Rejected: per-slice ticket comments (the 1.x
noise pattern — a ticket carrying twelve hand reports; the ledger holds them for anyone who
asks). `REQUIREMENTS.md` gains P-21 in the pre-Session-C diff.

### B11 · The concrete ceiling (P-14)

**Ruled 2026-09-23.** Jo: *"i do run flat rate subs for kimi, claude, and codex"*, then *"yes"*.
The system's means: **three flat-rate subscriptions (Claude, Codex, Kimi) plus metered TypeSafe**
(fractions of a cent per `judge()` call, T3); **no other metered spend.** Every chat-tier call
has zero marginal cost, so the P-14 "monthly figure" is the subscriptions themselves. A workload
**ceiling** is a **nominal-dollar number at list price as OMP computes it** — the unit OMP already
emits per call — bounding the workload's share of *subscription capacity* (usage windows and
rate limits), not a bill; the orchestrator sets it by stakes (B4). **The reserved spend event
(P-7b item 2) is any spend that would cost real money beyond the subscriptions** — a metered chat
key, a paid service — plus, as already ruled, raising a ceiling once set. Rate-limit exhaustion
stays inside the lane (B3) unless it holds a thing past four hours (A3). Session C mechanical
rule to write: a tier whose provider is rate-limited falls to the same tier on another provider,
never up a tier; the tier→model table in the profile spreads tiers across the three providers
(spec names tiers, never models). Rejected: tokens (differ per tier), tier-hours (unmeasurable),
a per-provider table (three numbers Jo would have to remember).

### B12 · Two decisions held since the triple-check (P-7b, P-16/P-15)

**B12.1 The reserved list is five, closed by default — ruled 2026-09-23.** Jo: *"yes"* (after
*"if it is a final and fixed list, what happens when we run into a scenario that we did not
account for?"*). The five: (1) opening/closing a phase; (2) spend above a workload ceiling, and
raising one; (3) the A4 command list — `careful`'s enumeration, protected-branch push, deploy;
(4) changes to the system's own rules or machinery, including a workload's exceptions field;
(5) **production-stakes sign-off before merge** (P-4 "both", placed by B4) — in force before,
now counted. *Closed by default* means: the orchestrator cannot grow the list; it **may always
ask** about anything unlisted (escalating is not reserved, `PREFERENCES.md` § P-7b); additions
are Jo's ruling under item 4; per-workload extras go in the Jo-only exceptions field (P-5);
a scenario nobody foresaw costs one incident — B3 surfaces it, P-16 proposes the addition, Jo
rules. Rejected: an open-ended list (no promise to the orchestrator that "not reserved" is real);
a longer list (friction on the foreseen cases, no cover for the unforeseen one).

**B12.2 P-16 depends on P-15 — ruled 2026-09-23.** Jo: *"agreed to your recco for question 2"*.
No self-improvement proposal can be accepted until the B8 install manifest exists; accepting a
proposal *is* adding its manifest row (a hook, prose fix, or skill is machinery and lives in
the portable repo). Sequences the build: install path first, P-16 last, matching Jo's priority.

### B13 · Two operating modes; skill set small (new requirement P-22, provisional)

**Ruled 2026-09-23, provisional.** Jo: *"i like the 2 operating mode idea, but before we make
that a rule shouldn't we research whether that's a correct assumption?"*, then *"update p22 but
with the caveat that if research disproves this we might go in another direction"*. Recorded as
**P-22: agents work in both an autonomous mode and a user-driven mode, and the skill set is
sized for both — not 50+** (`JO-INPUT.md:37-38`, Jo's own words: *"I want these agents to be
able to both work in autonomous mode and user driven mode"*). **Caveat, Jo's:** the requirement
stands unless research disproves it; if it does, the direction changes. What is *not* ruled:
the repo-to-mode mapping in `JO-INPUT.md:38` (Osmani's `agent-skills` when Jo steers,
`obra/superpowers` for autonomous running). Phase 4 evidence leans against that mapping —
superpowers is the more human-gated of the two (three `<HARD-GATE>` stage approvals plus a
human-picks-executor gate, `research/phase4/research-E-planning-practice.md:76-122`) and
Osmani's `/build auto` is the one that runs task-to-task with a single human gate (`:215-218`,
`:537`) — so it goes to a bounded research question before Session C: *which of superpowers /
agent-skills / neither serves autonomous running vs user-driven steering, from source.* Session C
gains a **mode** column (which mode each kept skill serves) beside the harness-portability
column. `REQUIREMENTS.md` gains P-22 in the pre-Session-C diff.

**B13.1 "Autonomous" defined — ruled 2026-09-23.** Jo: *"your agreement is correct"*. Research
(`research/operating-modes.md`, from source) supports Jo's mapping with a scope correction:
steering → agent-skills (*"the user IS the orchestrator"*); autonomous → superpowers, but only
for **executing an already-approved plan** — before execution its HARD-GATE demands approval per
task and cannot be switched off; neither repo hands off small work with no approval step. So
P-22's **autonomous mode** means: **small work is handed off and handled with no approval step;
features execute an approved plan without pausing between tasks.** The repo mapping stands for
features; the small-work path is supplied by the lane machinery (B6: spec-and-plan is the lane's
first judge slice, by stakes), not by either repo. Rejected: autonomous = approved-plan execution
only (leaves Jo's *"give it a task and then it gets handled"*, `JO-INPUT.md:31`, unserved).

### B14 · Self-improvement (P-16)

**B14.1 What is counted — ruled 2026-09-23.** Jo: *"let's follow the recco"*. P-16 counts
**only machinery-written ledger rows; nothing from prose.** The **error signal** is three row
kinds that already exist for other reasons: B3 error lines, B4 automated-gate refusals, and A1
low-confidence pull-ups. The **repetition signal** is Jo's direct lane instructions as ledgered
under B5, matched by normalized text across workloads (Jo's *"i've repeated something multiple
times"*, `PREFERENCES.md:541-543`). Costs nothing new to build: every counted thing is a row
that exists already. Rejected: transcript mining and prompt-time detection of Jo's correction
phrases (the two prose channels in `research/phase4/research-G-self-improvement.md:572`) —
same rule as B7 wake and B1 closure, the ledger over an agent's prose. Known gap, accepted: a
silent wrong answer Jo never corrected through a ledgered instruction is invisible; correction-
phrase detection may later arrive as a P-16 proposal of its own. **Open:** B14.2 threshold,
B14.3 proposal format and surfacing (P-8c).

## Session C — keep / change / drop pass (P-10)

open — disposition ledger lives in `DESIGN-2.0.md`.

## Open questions

- **OQ-1 (2026-09-23, from `research/typesafe-data-terms.md`) — which entity is the Customer on
  the TypeSafe key in the 2.0 profile: Jo personally, or Newdle?** MCA §5 makes the accepting
  party warrant it holds the rights to the Input. *Personal key* → only Jo-owned repositories may
  appear in slice briefs. *Newdle key or Newdle-approved key* → Newdle repositories may too.
  Terms otherwise acceptable for repository text (no training use, MCA §4.1; retention not
  zero, US-hosted); not acceptable for secrets. Held until the key goes into a profile.
- **OQ-2 (2026-09-23, from Tinker's T3) — the TypeSafe data boundary, and it is already live.**
  Tinker's CLAIM: the TypeSafe key has been in the **default** OMP profile since 2026-09-21 10:31
  (`~/.omp/agent/agent.db` auth_credentials id=12), so every 1.x session's native `find` tool has
  been sending workspace text to TypeSafe since then (GUESS on volume; calls not counted). The
  "read the terms before the key goes into a profile" heads-up was overtaken before it was
  written. Options: (1) send real slice briefs under the standard terms as published; (2) ask
  privacy@typesafe.ai for zero-data-retention terms first and send synthetic or metadata-only
  state until answered — **recommended by the terms hand and by Tinker**; (3) send a structured
  slice summary only. The same choice governs the live `find` path. OQ-1 (whose account) is a
  sub-question of this one.
