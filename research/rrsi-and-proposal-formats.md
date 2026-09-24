# RRSI and the P-16 proposal format — research for the B14.3 ruling

**PMDW**
Research report, 2026-09-24, written by the `RrsiProposalFormats` subagent for Plumb. It covers
the RRSI paper and code (*Regularized Recursive Self-Improvement of Agent Harnesses*), and a survey
of the formats a P-16 self-improvement proposal could take. Read-only work except this file and a
shallow clone under `/tmp/rrsi`.

**PMDW**
A note on citations. The contract asked for `file:line` receipts into the RRSI clone, and a
committed document should cite stable anchors rather than bare line numbers. Both rules apply
here, and I followed both. Every RRSI receipt names the function or symbol (the stable anchor)
and adds the line number for convenience. Line numbers are pinned to clone commit
`be50316e1db05914068a973f322770ef08ed7ba1` (2026-09-23), so they stay correct at that commit. SPEC
receipts cite the section heading, and the line number comes along for convenience.

**Question**
What do RRSI's selection-side rules and candidate ledger imply for what a P-16 proposal must carry
and for what a later apply loop needs from the 2.0 ledger, and which proposal formats are
available, with their strengths and weaknesses?

---

## Needs you — blockers and questions

**QUESTION**
Is creating an **unmerged proposal branch** in the portable repo a change to "the system's own
rules or machinery", which is reserved-list item 4
(`/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md` § B12.1, :543-546)?
- If **not reserved**: a branch changes nothing that is installed until Jo merges it, and the
  merge stays Jo's act. P-16 can cut the branch itself whenever a proposal fires.
- If **reserved**: the proposal lives only as a ledger row with its diff stored as text. A branch
  gets cut only when Jo asks to see it or accepts it.

This report proceeds as if the answer is **not reserved** and recommends that answer. The
recommendation is a GUESS about intent. Its basis is that B12.2 places acceptance at the manifest
row, not at the branch (§ B12.2, :556-559).

**GUESS(inference)**
B12.2 says accepting a proposal *is* adding its manifest row. That does not fit two of the
cheapest enforcement rungs, and it is worth knowing before B14.3 is ruled:
- On OMP, a deny rule is a `tools.approval.<tool>: deny` or a `bash.patterns` entry in settings
  (omp://approval-mode.md:9-10, :64).
- Settings live in the profile *template*, which B8 classes as one existing machinery artifact
  (§ B8, :467-479). A deny-rule proposal therefore edits an existing artifact and adds no row.
- A prose fix to existing rule text is the same case.

So a proposal has to carry a **manifest effect** field: *new row*, or *edit to artifact X*. B12.2's
wording probably wants a clause to match. This is inference from the two receipts above. B12.2
has not been re-read against a real manifest, because no manifest exists yet.

**GUESS(inference)**
Nothing fetched this session measures whether a propose-only loop improves anything. RRSI's
reported gains all come from an **apply** loop with an automatic scorer: every candidate is
evaluated on an evolve set before selection (paper §2 Eq. 2, §3.3). The Phase 4 finding
(`/Users/jowolff/code/agent-system-2.0/research/phase4/research-G-self-improvement.md:44-56`) still
stands. RRSI does not change P-16's evidence base. It changes what a proposal should record so
that a later loop can measure it.

---

## Answer

**CLAIM**
RRSI's four selection rules split in two. The **leakage critic** reads only the candidate diff,
before any evaluation, so it runs in a propose-only loop today
(`/tmp/rrsi/rrsi/critic.py` `review`, :115-147). The **noise-adjusted floor**, the **cost rule**,
and **pruning** each need a measured score, a measured cost, or both
(`/tmp/rrsi/rrsi/selection.py` `judge`/`cost_rule`, :81-121; `/tmp/rrsi/rrsi/history.py`
`yield_g`/`prune_set`, :143-163). None of the three can run in 2.0 until 2.0 has a scorer.

**CLAIM**
RRSI's ledger writes one JSONL record per edit, with these fields: component, hypothesis, the
failure mode it targets, predicted-affected tasks, diff, ΔS, ΔC, accepted, outcome, S, C, bundle
size, and reason. Candidates that die before measurement are kept with ΔS = null
(`/tmp/rrsi/rrsi/history.py` `append_candidate`, :77-99; docstring :39-40).

**GUESS(inference)**
A P-16 proposal that carries those same fields, nulls included, is forward-compatible with a later
apply loop at almost no cost now. It also needs three 2.0-specific fields: the triggering ledger
row ids, the normalized signal key it should drive to zero, and a what-might-break section.
Two things a later loop needs from the 2.0 ledger cannot be backfilled: **the portable-repo commit
each lane ran under**, and **the proposal id on each manifest row**. Both are cheap to record now.

**GUESS(inference)**
Recommended format: a hybrid.
- The **record** is a ledger row of kind `proposal` whose columns are RRSI's candidate fields.
- The **artifact** is a branch in the portable repo.
- The proposal **surfaces** as one line in the B3 channel.
- **Acceptance** is Jo's merge.

RRSI does the same thing mechanically. Each candidate gets its own branch, and "accepting one
fast-forwards the branch, so the incumbent is always a commit" (`/tmp/rrsi/README.md:35`).

---

## 1. What RRSI is

**CITE**
RRSI is a Google Cloud AI Research method, published 2026-09-21 (https://arxiv.org/abs/2609.24972,
fetched). It keeps a harness's whole edit space open (prompts, control flow, config, context
management, tools, skills, memory, subagents) and regularizes the *search* that edits it. Paper
§3.1: *"RRSI deliberately leaves Ω(H) open … Instead of restricting this hypothesis space directly,
we regularize the search trajectory through it."*

On the proposal side it applies three constraints:
- an annealed per-candidate edit budget;
- evidence-aware credit, where the proposer reads the full edit history;
- structured exploration of components the run has never touched.

On the selection side it applies four:
- a leakage critic;
- a noise-adjusted floor;
- a complexity-aware cost rule;
- structural pruning.

Paper and project page: https://regularized-rsi.com/assets/RRSI.pdf and
https://regularized-rsi.com/ (both fetched).

**CITE**
Every round needs a scorer. The harness runs on a fixed evolve set with k trials per task, a
verifier scores each trial, and policy tokens are counted: *"the candidates are evaluated on the
same evolve set; and the best candidate is selected as the next incumbent"* (paper §2). The loop
is an **apply** loop and has no human gate. The README's run command is
`python3 rrsi.py --domain <name> run`, which runs *"rounds 0..T-1, resumable"*
(https://github.com/google-research/rrsi README, read from the clone at `/tmp/rrsi/README.md`).

**CITE**
The headline figures, reproduced this session from the sources and not taken from the brief:
- **Project page:** +4.0 points average on the three evolve benchmarks, +3.4 on *"the six held-out
  benchmarks"*, and −36% policy tokens versus unregularized evolution
  (https://regularized-rsi.com/).
- **Paper abstract:** *"up to 14.1 points on the split it evolves against and up to 4.7 points on
  the five out-of-distribution benchmarks … 30% fewer policy tokens"*
  (https://arxiv.org/abs/2609.24972).
- **Paper Table 2:** RRSI runs 2.42 M tokens/trial against 3.80 M for unregularized evolution. My
  arithmetic from that table: 1 − 2.42/3.80 = 36%.

The abstract says 30%. The abstract counts five out-of-distribution benchmarks and the site counts
six held-out ones; the site's six include the in-distribution Harvey LAB held-out split. None of
these figures bears on P-16.

## 2. The candidate ledger, from the code

**CLAIM**
The ledger is `History`, an append-only JSONL file with one record per **edit**, not per
candidate. A candidate that bundles n edits writes n records, and they share one measurement
(`/tmp/rrsi/rrsi/history.py` module docstring :29-40; `append_candidate` :77-99). Every record
gets a timestamp on write (`append`, :72). Re-adjudicating a round rewrites that round's records
(`replace_round`).

| Type | Field | What it holds | Receipt |
|---|---|---|---|
| CLAIM | `t`, `variant`, `edit_id` | round, candidate (variant) id, and edit id within the candidate | `/tmp/rrsi/rrsi/history.py:85` |
| CLAIM | `component` | one of K = prompt, control_flow, config, output_plumbing, context_mgmt, client_tool, skill, memory, subagent. It is validated against the diff: a declared structural tag with no evidence in the diff is re-classified from the diff | `/tmp/rrsi/rrsi/components.py:44-46` (`K`, `K_STR`); `normalize`/`has_evidence` :82-101 |
| CLAIM | `hypothesis` | one sentence: *"the mechanism and WHY it should move the score"* | `/tmp/rrsi/rrsi/history.py:87`; prompt schema `/tmp/rrsi/rrsi/propose.py:93` |
| CLAIM | `targets_mode` | *"failure mode / capability gap / habit it targets"* | `/tmp/rrsi/rrsi/propose.py:94` |
| CLAIM | `predicted_affected` | concrete task ids the edit should move. Hits and misses are scored after evaluation and shown back to the proposer: *"over-claiming counts against you"* | `/tmp/rrsi/rrsi/propose.py:99`, :126-128; scoring in `/tmp/rrsi/rrsi/loop.py` `attribute` :159-174 |
| CLAIM | `diff` | path to the candidate's `diff.patch` | `/tmp/rrsi/rrsi/history.py` `append_candidate`; written at `/tmp/rrsi/rrsi/loop.py:502` |
| CLAIM | `delta_S`, `delta_C`, `S`, `C` | score change, **relative** cost change `(C'−C_t)/C_t`, and absolute score and cost. All four are null when the candidate was never measured | `/tmp/rrsi/rrsi/history.py:39-40`; `relative_cost_change` in `/tmp/rrsi/rrsi/evaluate.py:131` |
| CLAIM | `accepted`, `outcome` | `accepted` is true only for the round's winner. `outcome` ∈ ACCEPTED / REJECTED / LOST (admissible but out-scored), or a pre-measurement gate failure: `critic_reject`, `smoke_fail`, `eval_invalid`, `not_evaluated` | `/tmp/rrsi/rrsi/history.py:52`; `/tmp/rrsi/rrsi/loop.py:314-322`; `/tmp/rrsi/rrsi/selection.py` `Candidate.gate_failure` |
| CLAIM | `bundle` | number of edits in the candidate | `/tmp/rrsi/rrsi/history.py:97` |
| CLAIM | `detail` | the selector's reason string, capped at 600 chars (for example *"cost rule failed: …"*) | `/tmp/rrsi/rrsi/history.py:98`; reasons built in `/tmp/rrsi/rrsi/selection.py:107-120` |

**CLAIM**
The proposer's prompt schema asks for more than the ledger keeps: `why_not_lower_lever`,
`trigger_condition`, `retroactive_check`, and `regression_risk`
(`/tmp/rrsi/rrsi/propose.py:95-104`). `done()` bounces a submission back unless every edit carries
`id, component, hypothesis, targets_mode, predicted_affected, retroactive_check`
(`/tmp/rrsi/rrsi/propose.py:341-345`). The `retroactive_check` field asks for a three-part
counterfactual (propose.py:100-103):
- **corrective:** which cited failing tasks would have moved;
- **preservative:** which success habits the edit could disrupt;
- **transfer:** why it generalizes.

**CLAIM**
The proposer reads the ledger with this instruction: *"A rejected mechanism is negative evidence;
do not redraw it unchanged"* (`/tmp/rrsi/rrsi/propose.py:266-268`). The render keeps only the last
four unmeasured gate failures, because *"a wall of aborts is a feedback loop, not evidence"*
(`/tmp/rrsi/rrsi/history.py` `render`, :166-176).

**CLAIM**
Each candidate is its own git branch in its own worktree. Accepting one fast-forwards the evolve
branch to the winner's commit (`/tmp/rrsi/rrsi/loop.py:474` `worktree_add`, :329 `fast_forward`;
`/tmp/rrsi/rrsi/gitops.py` `fast_forward` :121). README: *"accepting one fast-forwards the branch,
so the incumbent is always a commit"* (`/tmp/rrsi/README.md:35`).

## 3. Each selection rule, as implemented

### 3.1 Leakage critic

**CLAIM**
The critic runs **before evaluation** and has two layers (`/tmp/rrsi/rrsi/critic.py` module
docstring and `review` :115-147):
1. A deterministic regex precheck over the diff, which rejects immediately on any hit
   (`precheck` :105-110; `hard = precheck(...)` :116). The generic pattern catches credentials
   (`GENERIC_PATTERNS` :50-52). Each domain adds its own patterns, for example task ids, judge
   references, verifier paths, and every benchmark task name
   (`/tmp/rrsi/domains/coding/adapter.py:113-141`, `/tmp/rrsi/domains/workspace/adapter.py:97-100`).
2. An LLM review that returns strict JSON `{verdict, reasons, risk_notes}`. It rejects on any of
   six grounds (`SYSTEM_TMPL` :62-94):
   - **leakage / task-specialization.** Litmus: *"would this change still make sense, and still
     help, on an unfamiliar task from a different suite in the same kind of work?"*
   - **degenerate:** a no-op, or a change that disables a safety mechanism;
   - **grader gaming;**
   - **undeclared bundling;**
   - **runtime memory/skill leakage:** persisting task-specific data;
   - **unbounded work:** a check or retry loop with no exit.

Output that stays unparseable after three attempts counts as a reject (:131-147). A rejection goes
back to the proposer for up to `repair_rounds` = 5 repairs (`/tmp/rrsi/rrsi/config.py:77`;
`/tmp/rrsi/rrsi/loop.py:498-551`). A candidate that cannot be repaired is recorded as
`critic_reject` with no measurement.

**CITE**
The paper gives the reason for screening before evaluation: *"a leaking candidate never receives
the inflated evolve-set score that could make it attractive to subsequent rounds"* (paper §3.3,
https://regularized-rsi.com/assets/RRSI.pdf).

**What it measures / threshold:**

**CLAIM**
No numeric threshold. The critic judges the diff's content, and any single reject category, or any
regex hit, rejects the candidate.

### 3.2 Noise-adjusted floor

**CLAIM**
A candidate is inadmissible if `S' < S* − δ`, where S* is the best evolve-set score so far
(`/tmp/rrsi/rrsi/selection.py` `judge`, :107-111). δ is estimated before the run from repeated
evaluations of the **unchanged** base harness: `δ = z · sd(null ΔS)` with z = 2.0 by default. It
uses the direct spread across repeated base evaluations when there are two or more, and otherwise
a bootstrap over trials (`/tmp/rrsi/rrsi/calibrate.py` `calibrate`, :85-107; default
`/tmp/rrsi/rrsi/config.py:68-69`). The shipped values are fixed per instance. The coding instance
uses `"delta": 0.017` (`/tmp/rrsi/domains/coding/rrsi.json:10`); the README lists
0.017 / 0.004 / 0.020 (`/tmp/rrsi/README.md:53`).

**CITE**
Purpose, per the paper: *"The floor prevents the search from walking downhill through a sequence of
regressions that are individually small enough to be mistaken for noise"* (paper §3.3).

### 3.3 Cost rule, plus the within-band rule

**CLAIM**
`cost_rule` has two branches (`/tmp/rrsi/rrsi/selection.py:81-93`):
- **Gain above the noise band** (`ΔS > δ`, :84): admissible only if `ΔC ≤ β0 + β1·ΔS` (:85-86).
  ΔC is the relative token change, so the defaults β0 = 0.10 and β1 = 40 mean *"10% more tokens for
  free"* and *"each +1pp of S buys +40%"* (`/tmp/rrsi/rrsi/config.py` docstring and :70-71). The
  coding instance uses β1 = 44.5 (`/tmp/rrsi/domains/coding/rrsi.json:13`).
- **Gain inside the noise band:** admissible only if `w_s·ΔS − w_c·ΔC + w_n·ν > 0` (:90-91). ν
  counts the structural component types (client_tool, skill, memory, subagent) that have never
  had an accepted edit (`/tmp/rrsi/rrsi/components.py` `novelty`, :103-108). The coding instance
  sets `w_s = 0.0` (`/tmp/rrsi/domains/coding/rrsi.json:14`). A within-band score bump alone
  therefore cannot admit a coding candidate. Only lower cost or structural novelty can.

After both branches come the domain guards. The engineering domain rejects a candidate whose
valid-output rate drops by more than 0.03 or whose no-submission rate rises by more than 0.02
(paper App. C.3; `Domain.guards`, `/tmp/rrsi/domains/eng/adapter.py:221`). Among admissible
candidates the highest S wins; if none is admissible, the incumbent stays
(`/tmp/rrsi/rrsi/selection.py:136`).

### 3.4 Pruning

**CLAIM**
`yield_g` computes, per component, the best measured ΔS within the last `n_prune` rounds (default
4), or −∞ if there is none (`/tmp/rrsi/rrsi/history.py:143-150`; `/tmp/rrsi/rrsi/config.py:75`).
`prune_set` returns every tried component with `g ≤ 0` (:152-163). Each entry lists
`recent_best_gain` and the accepted edits still in the incumbent. Pruning is **advisory, not
automatic**. The prune set is handed to the proposer, and the proposer's instruction describes a
removal as *"a legitimate edit (component = the pruned component, hypothesis = "prune: …")"*
(`/tmp/rrsi/rrsi/propose.py:123-125`, :262-278). A prune is itself a candidate and passes the same
critic and gate.

### 3.5 Proposal-side rules that bear on format

**CLAIM**
The annealed budget is `b_t = ceil(b_min + (b_max − b_min)·½(1 + cos(πt/T)))`
(`/tmp/rrsi/rrsi/schedule.py` `edit_budget`). The default `b_min` = 1, so late rounds allow one
attributable edit per candidate (`/tmp/rrsi/rrsi/config.py`, `b_min: int = 1`). `done()` enforces
the budget, and an over-budget submission is bounced back (`/tmp/rrsi/rrsi/propose.py` module
docstring :42-43).

## 4. Scorer-dependent vs usable in a propose-only loop

| Type | RRSI element | Needs a scorer? | Usable in P-16 today, no scorer | Receipt / basis |
|---|---|---|---|---|
| CLAIM | Candidate ledger (fields in §2) | No. The measurement fields are nullable by design | **Yes.** Record every field and leave ΔS, ΔC, S, C null | `/tmp/rrsi/rrsi/history.py:39-40` |
| CLAIM | Leakage critic (regex precheck plus LLM review of the diff) | No. It runs before evaluation | **Yes**, adapted (see §5) | `/tmp/rrsi/rrsi/critic.py` `review` :115-147 |
| CLAIM | Component tag validated against the diff | No | **Yes.** A declared kind (hook / prose / skill) is checked against what the diff actually touches | `/tmp/rrsi/rrsi/components.py:82-101` |
| CLAIM | Noise-adjusted floor | Yes: S, S*, and δ from repeated base evaluations | **No** | `/tmp/rrsi/rrsi/selection.py:107-111`; `/tmp/rrsi/rrsi/calibrate.py:85-107` |
| CLAIM | Cost rule and within-band rule | Yes: ΔS and a measured ΔC | **No.** Only a *declared* cost class is possible | `/tmp/rrsi/rrsi/selection.py:81-93` |
| CLAIM | Pruning | Yes: measured ΔS per component over a window | **No** as specified | `/tmp/rrsi/rrsi/history.py:143-163` |
| GUESS(inference) | Pruning, observational analog | No | **Partly.** An accepted artifact whose target signal keeps recurring, or which never fires, can trigger a removal proposal. This needs firing counts per artifact | inference from `prune_set` semantics; the 2.0 ledger has no firing column yet |
| CLAIM | Predicted-affected plus hit/miss scoreboard | Scoring the prediction needs per-task outcomes | **Declaration yes, scoring later** | `/tmp/rrsi/rrsi/loop.py` `attribute` :159-174 |
| CLAIM | Annealed edit budget | No | **Yes**, as a flat rule of one artifact per proposal (RRSI's own floor is b_min = 1) | `/tmp/rrsi/rrsi/schedule.py`; `/tmp/rrsi/rrsi/config.py` |
| GUESS(inference) | Structured exploration (stall → untried components) | Yes: stall is measured against δ | **Not relevant.** P-16 fires on a threshold (§ B14.2), not on a search schedule | `/tmp/rrsi/rrsi/history.py` `stall_flag` :189-193 |

## 5. Implications for what a P-16 proposal must carry

**PMDW**
The table below is design inference throughout. Each row is anchored to an RRSI receipt or a SPEC
receipt, but "must carry" is my recommendation, not a finding.

| Type | RRSI element | A P-16 proposal carries, to be RRSI-compatible later | Cost now |
|---|---|---|---|
| GUESS(inference) | Per-edit record (`history.py:77-99`) | `proposal_id`; `kind` (pre-hook / post-hook / approval-policy / prose / skill), the analog of `component`, validated against the diff; `hypothesis` (one sentence: the mechanism and why it stops the signal); `diff` (the branch ref); `outcome` ∈ proposed / accepted / rejected / withdrawn / superseded; `reason` (Jo's reason on rejection, the analog of `detail`) | ~8 columns on one ledger row kind. The B2 state-order rules can enforce the outcome transitions in the file (§ B2 ruling, :301-310) |
| GUESS(inference) | Nullable measurement (`history.py:39-40`) | `delta_signal`, `delta_cost`, `measured_at` columns, **null at creation** and filled by a later loop | Three nullable columns. Adding them later means a migration and leaves old rows without a slot. Adding them now is free |
| GUESS(inference) | `targets_mode` plus the feedback F_t | **The triggering ledger row ids** (the three that fired it, § B14.2 :606-608) and the normalized signal key | Foreign keys only. The rows already exist (§ B14.1, :593-597) |
| GUESS(inference) | `predicted_affected` (`propose.py:99`) | `predicted_signal_keys`: the signal key(s) this should drive to zero. A later loop scores hit/miss exactly as `attribute` does | One field |
| GUESS(inference) | `retroactive_check` / `regression_risk` (`propose.py:100-104`) | **What-might-break** section in the three RRSI parts. *Corrective*: would the artifact have fired on each triggering row? *Preservative*: what currently-working behaviour could it block? This is bokan's "what's already working" (`research-G:238-240`). *Transfer*: would it still be right on an unfamiliar workload? | One text field. The corrective part is mechanical only if B4 refusal rows and B3 error rows keep the tool-call input. **GUESS(inference): not established.** No 2.0 ledger schema exists yet to check against |
| GUESS(inference) | Leakage critic (`critic.py:62-94`) | A **critic verdict** field, written by a pre-surfacing screen. Regex precheck: the diff must not contain literal workload ids, lane ids, repo paths, or secrets copied out of the triggering rows. Review with RRSI's six categories translated: *leakage* = the fix is fitted to the three triggering instances; *degenerate*; **grader gaming = the diff suppresses the counted row kind itself** (for example, silencing a B3 error line instead of removing its cause); undeclared bundling; memory leakage; unbounded work. The last maps to TimFKiefer's hook-recursion check (`research-G:190-196`) | One regex pass plus one hand call per proposal, and a verdict column. Rare, because firing needs three occurrences |
| GUESS(inference) | Noise-adjusted floor (`selection.py:107-111`) | Nothing new. The base rate of each signal key is derivable from rows the ledger already has, once B14.2's deferred window is measured (§ B14.2, :606-615) | Zero now |
| GUESS(inference) | Cost rule (`selection.py:81-93`) | `enforcement_rung` (P-11 class) chosen cheapest-first, plus a **declared** cost class: no model call (approval policy, `bash.patterns`, TS pre-hook); per-call model cost (prompt-based hook); always-loaded context bytes (prose rule, skill description) | One enum and one estimate. The OMP ladder is in the note below |
| GUESS(inference) | Pruning (`history.py:143-163`) | The **manifest row carries `proposal_id`** back to its proposal and signal key, and the ledger records **artifact firings** (a B4 refusal row names the gate that refused) | One manifest column now. Backfilling provenance later is impossible for rows installed without it |
| GUESS(inference) | Annealed budget, b_min = 1 (`config.py`) | **One installable artifact (one manifest effect) per proposal** | A rule, no build cost |
| GUESS(inference) | Branch per candidate, accept = fast-forward (`README.md:35`, `loop.py:329`) | Artifact on a branch in the portable repo; acceptance = merge | Already the recommendation on the table |

**CLAIM**
OMP translation of the cheapest-first ladder. TimFKiefer's rungs are Claude Code settings
(`permissions.deny`, `permissions.ask`, hooks in `settings.json`)
(https://raw.githubusercontent.com/TimFKiefer/self-improving-claude/main/README.md, fetched). OMP's
equivalents, cheapest first:
1. `tools.approval.<tool>: deny`, or a `bash.patterns` deny (omp://approval-mode.md:9-10, :64).
2. A TS pre-hook factory under `hooks/pre/`.
3. A TS post-hook factory under `hooks/post/` (omp://hooks.md:26-31, :64-69).
4. Prose.
5. A skill.

OMP's docs warn that *"a `bash.patterns` `deny` rule does not apply to the same command run through
`eval`"* (omp://approval-mode.md:72). That is a concrete example of what a what-might-break section
has to name.

**GUESS(inference)**
The `prompt`/`ask` rungs are unavailable to lanes. B3's companion lane rule designs non-reserved
prompts out (§ B3, :393-395). A proposal choosing a prompt rung would create a human wait that
B3 item 5 then surfaces.

**GUESS(inference)**
The brief says a `hooks.json`-shaped proposal lands on OMP and never fires. omp://hooks.md documents
only TS/JS factories under `hooks/pre|post/` and says a factory placed directly in `hooks/` *"loads
nothing and reports no error"* (:64-69). A grep for `hooks.json` across omp:// returned no match.
The "never fires" part is the brief's claim, consistent with the docs, and I did not test it live.

### What a post-stabilization apply loop needs from 2.0's ledger

**GUESS(inference)**
RRSI's selector consumes S, C, δ, and the per-component yield, so an apply loop in 2.0 would need
analogs of each. In order of how hard each is to add later:
1. **Harness version per lane-instance.** The portable-repo commit the lane ran under. Without it,
   no outcome can be attributed to an accepted change. RRSI gets this for free because *"the
   incumbent is always a commit"* (`/tmp/rrsi/README.md:35`). **Cannot be backfilled.**
2. **Proposal id on every manifest row.** This supplies RRSI's `accepted_edits` per component
   (`/tmp/rrsi/rrsi/history.py` `accepted_edits`), which pruning needs. **Cannot be backfilled.**
3. **Per-slice outcome.** Pass or fail against the B1 runtime artifact, plus B3 item 3 twice-failed
   gates. These already exist as machinery-written rows (§ B1, § B3 :362-373).
4. **Per-slice cost.** Policy tokens per slice. Whether the ledger records this is **not
   established**. P-14's ceiling share suggests a spend field exists; I did not verify one.
5. **Artifact firing rows.** Which installed gate fired or refused, for pruning.
6. **A replayable set plus a repeated baseline**, for δ. RRSI calibrates δ by re-running the
   unchanged harness (`/tmp/rrsi/rrsi/calibrate.py:85-107`). 2.0 has no fixed task set. B9's
   six-field briefs are the nearest thing to a replayable task (§ B9). Replay would cost real
   subscription capacity. This is the expensive, deferrable part.

---

## 6. Proposal-format alternatives

### A. A branch / pull request in the portable repo (BerriAI shape)

**CITE**
BerriAI's `self-improving-agent`: *"Two tools. The agent proposes a minimal diff, you approve, a
draft PR opens."* The target is a named repo (`SELF_IMPROVING_AGENT_REPO`). The token is *"a
fine-grained PAT with **Contents: Read & write** and **Pull requests: Read & write** on the
configured repo."* Four defense layers: tool description, *"Schema gate — tool requires
`userConfirmedInThisMessage: true`; executor throws on `false`"*, an `onBeforeApply` hook, and PAT
scope (https://raw.githubusercontent.com/BerriAI/self-improving-agent/main/README.md, fetched in
full).

**CLAIM**
RRSI uses the same mechanics without the PR: a branch per candidate, and acceptance by
fast-forward (`/tmp/rrsi/README.md:35`; `/tmp/rrsi/rrsi/loop.py:329`).

**Strengths:**

**GUESS(inference)**
- The artifact is born in the portable repo, so B12.2's dependency holds by construction.
- The manifest row and the artifact land in one merge.
- The diff can be reviewed in a proper diff UI.
- CI on the branch can run P-11's "gate built and verified in the step that installs the rule"
  (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:45`) and the P-4 fresh-machine install
  test (§ B8 :484-493) *before* Jo looks.
- A rejection is a closed PR, and its history survives.
- The accept act is structurally Jo's if branch protection stops the orchestrator from merging.
  That makes the reserved-list gate mechanical in P-11's sense rather than written.

**Weaknesses:**

**GUESS(inference)**
- Needs a push-scoped credential on the portable repo. Pushing a *protected* branch is already
  reserved (§ B12.1 item 3, :546). Pushing an unprotected proposal branch is the open question at
  the top of this report.
- Review in GitHub is a place outside the surface (P-6, `REQUIREMENTS.md:33`). The surface line has
  to point at it.
- The merge happens outside the ledger, so something must write `accepted` back to the ledger row.
  A post-merge install step keyed on the manifest row's `proposal_id` would do it.
- Branches accumulate if Jo never answers.
- **Local-only variant:** a local branch with no push. Jo merges with `git merge`. This drops the
  token and the GitHub dependency and loses mobile review.

**Fit:**

**GUESS(inference)**
OMP: neutral, because the artifact is just files. Portable repo: best of all options. Reserved
list: good, with branch protection.

### B. A proposal document in a queue directory the surface lists

**CITE**
bokan's `claude-skill-self-improvement` generates one reviewable file, `CLAUDE_IMPROVEMENTS.md`,
with *"Friction patterns ranked by frequency … Suggested additions to your config … What's already
working (so you don't break it) … Raw quotes showing where things went sideways"*, and the workflow
*"You review. You apply what makes sense. Repeat."*
(https://raw.githubusercontent.com/bokan/claude-skill-self-improvement/master/README.md, fetched).

**CITE**
Two directory-of-proposals conventions carry a lifecycle status in frontmatter:
- **MADR:** `status: "{proposed | rejected | accepted | deprecated | … | superseded by ADR-0123}"`,
  plus a *Confirmation* section: *"Is there any automated or manual fitness function?"*
  (https://raw.githubusercontent.com/adr/madr/main/template/adr-template.md, fetched).
- **Changesets:** one markdown file with YAML frontmatter per change in `.changeset/`, committed
  with the branch
  (https://raw.githubusercontent.com/changesets/changesets/main/docs/adding-a-changeset.md,
  fetched; the page warns it is outdated relative to changesets.dev).

**Strengths:**

**GUESS(inference)**
- Rich, human-readable, and greppable, with room for evidence and what-might-break.
- No external service.
- MADR's *Confirmation* section maps directly onto P-11's verification requirement.

**Weaknesses:**

**GUESS(inference)**
- **The status field duplicates ledger state.** B2.1 rules *"The ledger is the only record"*
  (§ B2.1, `SPEC-2.0.md:344-346`), so a file-carried status is a second source of truth that will
  drift.
- The proposed artifact is prose about a change, not the change. Someone has to transcribe it into
  the repo on acceptance, which is the 1.x drift failure `research-G:575` records.
- If the file lives under the repo's machinery directories, B8's rule applies: *"a repo artifact
  under the machinery directories with no manifest row fails install"* (§ B8 :484-487). If it
  lives outside the repo, it is state and not portable.

**Fit:**

**GUESS(inference)**
OMP: neutral. Portable repo: poor, as a second copy. Reserved list: accept is a prose act with no
mechanical gate.

### C. A ledger row of kind `proposal`, rendered on demand, artifact attached

**CLAIM**
This is RRSI's own shape. Its ledger is an append-only per-edit record carrying the diff path,
outcome, and reason, and the proposer reads it back as history
(`/tmp/rrsi/rrsi/history.py:77-99`, `render` :166-186).

**CLAIM**
2.0's ledger is ruled homegrown SQLite, with state-order rules in the file as `CHECK`
constraints and triggers (§ B2 ruling, `SPEC-2.0.md:301-310`). It is the only record (§ B2.1).
P-16's counted signals are already ledger rows (§ B14.1 :593-597). Wake and wrap-up are the ledger
rendered (§ B7, § B2.1).

**Strengths:**

**GUESS(inference)**
- One record, consistent with B2.1, B7, and B14.1.
- The lifecycle (proposed → accepted | rejected | withdrawn | superseded) is enforced mechanically
  by the file's rules.
- The triggering rows are foreign keys.
- "What is pending" is a query, never a scan, per P-7a.
- Rejected proposals stay as negative evidence the next proposer reads, which is RRSI's *"do not
  redraw it unchanged"* (`/tmp/rrsi/rrsi/propose.py:266-268`).
- Forward-compatible with an apply loop by construction.

**Weaknesses:**

**GUESS(inference)**
- The ledger is **state**, and the machinery is not (§ B8 :469-479). An artifact stored in the
  ledger is not in the portable repo, so acceptance still needs a step that writes it there and
  adds the manifest row.
- The ledger is local to one machine (§ B2: *"one machine, one user"*), so a proposal is invisible
  elsewhere until the later JSONL export.
- Reviewing a diff rendered in the terminal is weaker than a diff UI.

**Fit:**

**GUESS(inference)**
OMP: native, since the extension already owns the ledger module. Portable repo: needs a
materialize step. Reserved list: the accept transition can require a Jo-originated row, which is
mechanical.

### D. A message in the surface with the diff inline (approve-in-session)

**CITE**
TimFKiefer's `self-improving-claude` *"walks you through approval one proposal at a time. You see
the actual code before anything installs"*. The proposal shows *Form*, *Rationale*, and the code,
and *"You approve, edit, or reject. On approval the script lands in `.claude/hooks/`"*
(https://raw.githubusercontent.com/TimFKiefer/self-improving-claude/main/README.md, fetched in
full).

**CLAIM**
On OMP a hook or extension factory can *"send persistent custom messages with
`pi.sendMessage(...)`"* and *"register custom message renderers via
`pi.registerMessageRenderer(...)`"* (omp://hooks.md:46-49). A proposal could render as a custom
message in the surface.

**Strengths:**

**GUESS(inference)**
- Fastest loop.
- The decision and the code sit in the same place, which is the externalize-at-the-point-of-
  performance principle.
- No external service.
- A schema-gated accept tool (BerriAI's `userConfirmedInThisMessage` pattern) makes the gate
  mechanical.

**Weaknesses:**

**CLAIM**
B3 surfaces each unsolicited item as **one line** (§ B3, `SPEC-2.0.md:364-366`). An inline diff is
not one line.

**GUESS(inference)**
- Scrollback is not a record.
- The orchestrator *"has no hands of its own"* (`REQUIREMENTS.md:36`, P-7b), so after an in-chat
  accept a lane still has to write the artifact into the repo. Acceptance and landing come apart,
  which is the gap BerriAI and RRSI both close with a branch.

**Fit:**

**GUESS(inference)**
OMP: native. Portable repo: needs a landing step. Reserved list: mechanical only with a schema-gated
tool. **Best used as the surfacing layer**: one line, with a "show" command that renders the diff
on demand.

### E. An issue in Linear or GitHub (per B10)

**CLAIM**
B10 makes 2.0 work with both Linear and GitHub issues. The machinery mirrors workload state to the
source on open and close, and *"the source is never read for truth"* (§ B10,
`SPEC-2.0.md:510-522`).

**CITE**
Renovate ships an issue-based approval queue. With `dependencyDashboardApproval`, *"Renovate [will]
wait for your approval before creating an update PR"*, and ticking a checkbox on the dashboard
issue produces the PR. The same page warns: *"When you require prior approval, you need to check
the dashboard issue regularly … You'll probably forget to check often enough, and out of sight
means out of mind!"* (https://docs.renovatebot.com/key-concepts/dashboard/, fetched).

**CITE**
Linear's Triage inbox provides the verbs a proposal queue needs: *"accept with `1`, mark as
duplicate with `2`, decline with `3`, or snooze with `H`"*. Triage Rules, Intelligence, and
Responsibility are Business/Enterprise features (https://linear.app/docs/triage, fetched).

**Strengths:**

**GUESS(inference)**
- Accept, decline, duplicate, and snooze are built in.
- Visible to teammates and reachable from a phone.
- Renovate shows the issue-then-PR hybrid works at scale.

**Weaknesses:**

**GUESS(inference)**
- Acceptance recorded in the issue means reading Linear or GitHub for truth, against B10 and P-7a,
  unless a webhook writes the decision back to the ledger. That is new machinery.
- An issue is not the artifact, so a branch is still needed.
- A second place to look beside the surface. Renovate's own docs name the forgetting failure, and
  that failure matters most for this reader.
- A P-16 proposal is not a workload, so B10's per-workload tie-back does not cover it without a
  new rule.
- Network and credential dependency.

**Fit:**

**GUESS(inference)**
OMP: external. Portable repo: indirect. Reserved list: accept is a click in a third-party UI, not a
2.0 tool call.

### F. An RRSI-style candidate record as the proposal itself

**CLAIM**
RRSI's record carries hypothesis, component, diff, targets_mode, predicted_affected, ΔS, ΔC,
outcome, and reason. The proposer schema adds `why_not_lower_lever`, `trigger_condition`,
`retroactive_check`, and `regression_risk` (§2 above; `/tmp/rrsi/rrsi/propose.py:92-104`).

**Strengths:**

**GUESS(inference)**
- Forces a falsifiable hypothesis and a stated prediction.
- `why_not_lower_lever` is exactly the cheapest-first ladder question.
- `trigger_condition` pushes against "always" (propose.py:97-98: *"'always' is almost never
  right"*).
- Negative evidence is retained.
- Directly consumable by a later apply loop.

**Weaknesses:**

**GUESS(inference)**
- It is a **content schema, not a delivery vehicle**. It still needs a home (C), an artifact (A),
  and a surface (D).
- Today its ΔS and ΔC are null, so half the record is empty.
- A proposer asked for predictions with no scorer to check them risks writing false precision.
  RRSI counters this with a hit/miss scoreboard (`/tmp/rrsi/rrsi/loop.py:159-174`), which 2.0 does
  not have yet.

**Fit:**

**GUESS(inference)**
Composes with C, as the row's columns, and with A, as the PR body. It is not an alternative to
them.

### G. Found along the way: shadow-mode install (dry-run / warn, then promote)

**CITE**
OPA Gatekeeper deploys a new constraint with `enforcementAction: dryrun`: *"constraints to be
deployed in the cluster without making actual changes … impacted [resources] are surfaced as
violations in the `status` field"*. `warn` also *"provide[s] immediate feedback on why that
constraint would have been denied"*. The default is `deny`
(https://open-policy-agent.github.io/gatekeeper/website/docs/violations/, fetched, v3.23.x).

**Strengths:**

**GUESS(inference)**
- The only format that **measures a proposal without a scorer**: it counts would-have-fired events
  against the real stream, which gives false-positive evidence before enforcement.
- Maps onto an extra P-11 rung: a post-hook that logs where a pre-hook would block.

**Weaknesses:**

**GUESS(inference)**
- Installing anything, even observe-only, is applying machinery. That collides with P-16's *"never
  applies one without Jo's acceptance"* (`REQUIREMENTS.md:50`) and with reserved item 4.
- A shadow artifact would need its own manifest row, and B12.2 makes adding a row *be* acceptance.
- Promotion from warn to deny is a second reserved decision.

**Fit:**

**GUESS(inference)**
Not admissible as the proposal format under current rulings. Admissible as a **post-acceptance
stage** if Jo wants it: accept into warn mode, promote later. A cheaper scorer-free substitute
already fits A or F: replay the proposed hook offline against the ledger's own rows, as TimFKiefer
traces generated hooks against constructed stdin envelopes (TimFKiefer README, fetched).

---

## 7. Comparison

| Type | Format | Lands in portable repo by construction | Single record (B2.1) | Fits B3 one-line surface | Accept gate mechanical (P-11) | RRSI-forward-compatible | No external service | Build cost |
|---|---|---|---|---|---|---|---|---|
| GUESS(inference) | A. Branch / PR | **yes** | no, needs a ledger write-back | yes, as a pointer | yes, with branch protection | partly, via the PR body | local variant yes; PR variant no | low (git plus optional token) |
| GUESS(inference) | B. Queue-directory document | no, transcription needed | **no**, status duplicates the ledger | yes, as a pointer | no | partly | yes | low |
| GUESS(inference) | C. Ledger row `proposal` | no, materialize step | **yes** | yes, rendered | yes, via state-order rules | **yes** | yes | low; the module exists per B2 |
| GUESS(inference) | D. Inline message plus diff | no, landing step | no, scrollback | **no**, multi-line | only if schema-gated | no | yes | low |
| GUESS(inference) | E. Linear / GitHub issue | no | no, unless a webhook writes back | yes, as a pointer | no, third-party click | no | **no** | medium (webhook, credentials) |
| GUESS(inference) | F. RRSI candidate record | n/a, a schema | n/a | n/a | n/a | **yes** | n/a | zero, it is columns |
| GUESS(inference) | G. Shadow-mode install | yes | no | yes | conflicts with "never applies" | yes, as measurement | yes | medium |
| GUESS(inference) | **A + C + F, surfaced via D-as-one-line** | **yes** | **yes**, ledger is truth and git is the artifact | **yes** | **yes** | **yes** | yes (local branch) | low |

## 8. Recommendation

**GUESS(inference)**
The recommendation is the hybrid: the record is C, the fields are F, the artifact is A, and the
surface is D reduced to one line.
- **Firing.** When a signal hits three (§ B14.2), P-16 cuts a branch in the portable repo. The
  branch carries exactly one installable artifact and its manifest effect (new row, or an edit to
  an existing artifact).
- **Critic.** P-16 runs the adapted leakage critic. The critic's categories include "does this
  silence the counted row instead of its cause". A reject goes back for a bounded repair, or is
  recorded as `critic_reject`.
- **Ledger row.** P-16 writes a `proposal` row: kind, hypothesis, branch ref, enforcement rung,
  declared cost class, triggering row ids, predicted signal keys, a three-part what-might-break,
  the critic verdict, and null measurement columns.
- **Surfacing.** B3 surfaces one line, and a "show" command renders the row and the diff on demand.
- **Acceptance.** Jo merges.
- **Write-back.** The install step, seeing a manifest row whose `proposal_id` is still `proposed`,
  writes `accepted`, so the ledger stays the only record.
- **Rejection.** Closing or deleting the branch writes `rejected` with Jo's reason.

This is the recommendation already on the table, plus four additions from RRSI: nullable
measurement columns, the critic screen, `proposal_id` on the manifest row, and the lane's harness
commit on every lane-instance row.

**GUESS(inference)**
What would change it:
- **The QUESTION at the top.** If an unmerged branch counts as a reserved change, the artifact
  stays as diff text in the ledger row until Jo asks. That is C alone, with A deferred to
  acceptance.
- **No push-scoped token.** If Jo will not grant one, use the local-branch variant. It changes
  nothing else.
- **Accepting from a phone or with teammates.** If Jo wants that, E becomes attractive, but only
  with a write-back webhook so the issue never becomes the source of truth.
- **A scorer arrives.** If 2.0 later gets replayable slices and a repeated baseline, the floor, cost
  rule, and pruning switch on over the same rows, and the format does not change. That is the
  point of carrying the nullable columns now.

---

## 9. Sources

**Fetched in full**

**CITE**
- https://regularized-rsi.com/ (project page text).
- https://arxiv.org/abs/2609.24972 (abstract via the arXiv API).
- https://raw.githubusercontent.com/BerriAI/self-improving-agent/main/README.md
- https://raw.githubusercontent.com/bokan/claude-skill-self-improvement/master/README.md
- https://raw.githubusercontent.com/TimFKiefer/self-improving-claude/main/README.md
- https://docs.renovatebot.com/key-concepts/dashboard/
- https://linear.app/docs/triage
- https://raw.githubusercontent.com/adr/madr/main/template/adr-template.md
- https://raw.githubusercontent.com/changesets/changesets/main/docs/adding-a-changeset.md (the
  page itself flags it as outdated).
- https://open-policy-agent.github.io/gatekeeper/website/docs/violations/

**CLAIM**
Read from the clone of https://github.com/google-research/rrsi at `be50316`:
- `/tmp/rrsi/README.md` in full.
- `/tmp/rrsi/rrsi/history.py`, `selection.py`, `critic.py`, `schedule.py`, `components.py`,
  `config.py`, and `calibrate.py`, all in full.
- `/tmp/rrsi/rrsi/propose.py`, `loop.py`, `gitops.py`, and `evaluate.py`, by targeted grep with the
  surrounding lines read.
- `/tmp/rrsi/domains/*/adapter.py` critic patterns and guards, by grep.
- `/tmp/rrsi/domains/coding/rrsi.json`, by grep.

**CLAIM**
First-party files read this session:
- `/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md` § B2 ruling, B2.1 (partial), B3, B8, B9, B10,
  B12, B14.1, B14.2.
- `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md` P-4 through P-20 rows, by grep.
- `/Users/jowolff/code/agent-system-2.0/research/phase4/research-G-self-improvement.md`: lines
  18-60, 174-266, 565-590, and 695-720, plus the BerriAI section by grep (:275-293).
- omp://hooks.md (:1-70 region, by grep and read) and omp://approval-mode.md (by grep).

**Fetched partially**

**CITE**
https://regularized-rsi.com/assets/RRSI.pdf. The PDF converter reported *"Text extraction is
incomplete for PDF pages 3, 16, 19, 20, 24"*. Those pages hold the Figure 2 schematic, the
Algorithm 1/2 boxes, the appendix contents, and the Table 6 layout. The prose, the equations
(partly garbled), Table 5, and Appendix C came through. **The loss did not cost the answer**,
because the algorithms were read from their implementation in the clone instead.

**Failed / not opened**

**CLAIM**
The RRSI project page's *Evolution explorer* (per-round proposals, critic verdicts, gate reasons,
and diffs) is rendered client-side. `curl -sL https://regularized-rsi.com/ | grep -oE
'assets/[A-Za-z0-9_./-]+'` listed only the PDF and four logo images, so the explorer's data
source was not found. It was **not opened**. **Cost: none for this question.** It would have shown
real critic-reject reasons, which are useful as few-shot examples for a 2.0 critic, not for the
format decision.

**CLAIM**
The clone contains no stored run data. `git ls-files | grep -Ei 'runs/|history|jsonl|frontier'`
matched only `rrsi/history.py` and three `frontier` script files. The ledger schema therefore
comes from code, not from a sample record.

---

## Unverified

**GUESS(inference)**
Each item below is also marked where it appears in the body:
- Whether B4 refusal and B3 error rows keep the tool-call input needed for a mechanical
  replay-against-triggering-rows check. No 2.0 ledger schema exists to check.
- Whether the 2.0 ledger records per-slice token cost.
- That a `hooks.json`-shaped artifact "never fires" on OMP. This is the brief's claim; the docs are
  consistent with it, and it was not tested live.
- The reading that an unmerged branch is not a reserved change. That is the QUESTION at the top.
- That the RRSI critic's categories transfer to a 2.0 critic, "counter-gaming" in particular. This
  is design inference and is untested.

---

## Coverage

| Type | Subject / source area | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|---|
| ACTION | RRSI paper, site, arXiv | 3 URLs | all 3 | PDF text extraction incomplete on 5 pages | **yes.** The missing pages are algorithm boxes, and I read their code instead |
| ACTION | RRSI code | `git clone --depth 1 https://github.com/google-research/rrsi /tmp/rrsi` → exit 0 (reverse: `rm -rf /tmp/rrsi`); 17 core modules, 3 domain adapters | 7 modules in full, 4 by targeted grep, the adapters and one config by grep | none | **yes** for ledger, critic, gate, cost, and pruning. `analyst.py`, `digester.py`, `driver.py`, `llm.py`, `domain.py`, and `evaluate.py` beyond `relative_cost_change` were not opened, because they implement feedback and evaluation, not selection |
| ACTION | 2.0 spec and requirements | SPEC-2.0.md, REQUIREMENTS.md | the named sections | none | **yes** |
| ACTION | Phase 4 prior art | research-G | the four cited ranges plus the BerriAI grep | none | **yes** |
| ACTION | Alternatives A–G | 7 URLs (BerriAI, bokan, TimFKiefer, MADR, changesets, Renovate, Linear, Gatekeeper; TimFKiefer serves D and G) | all | changesets page self-flagged as outdated. Not load-bearing: only the directory-of-files convention is used | **yes**, one or more primary sources per alternative |
| ACTION | OMP facts (hook shape, approval rungs, message API) | omp://hooks.md, omp://extension-loading.md, omp://approval-mode.md | by grep and targeted read | `hooks.json` grep over omp:// returned nothing. That is a negative result, not a fetch failure | **yes** |
| ACTION | RRSI Evolution explorer | listed on the site | **not opened.** Data source not found by curl | client-rendered | **no**, and not needed for this question. Next read if a 2.0 critic is built |

**CLAIM**
Everything else that was retrieved was opened. Four things were retrieved or listed and **not**
opened:
- the RRSI Evolution explorer data;
- the RRSI modules `analyst.py`, `digester.py`, `driver.py`, `llm.py`, and `domain.py`;
- the non-coding `rrsi.json` files, beyond the README's summary of their δ values;
- Linear's linked Triage Intelligence and Asks pages.

<!-- output-types
tier: 0
CLAIM: 35
CITE: 22
GUESS: 36 (inference 36, pattern 0, recall 0)
ACTION: 7
PMDW: 3
QUESTION: 1
-->
