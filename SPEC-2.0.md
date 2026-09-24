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

Open for Session B: the low-confidence rule (Plumb's recommendation: below threshold, route one
tier up, never down, and log; the threshold number is unset).

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

### B2 · Ledger tool (P-13) — open, pending `research/ledger-candidates.md`

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
