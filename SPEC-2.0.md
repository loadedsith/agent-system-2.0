# SPEC-2.0 — the agent system 2.0, as ruled by Jo

Phase 5 opened by Jo 2026-09-23 (*"next"*). Built by interview, one question per message, per
`briefs/phase5.md`; every ruling is appended here as it is given, in Jo's words where Jo gave
them. `REQUIREMENTS.md` (P-1 … P-20) is the input; this file records what each open column
resolved to. Vocabulary: `REQUIREMENTS.md` § Vocabulary (workload / lane / hand / slice).

Status legend per clause: **ruled** (Jo's word, dated) · **carried** (a default from
`PREFERENCES.md` or the triple-check, not re-asked) · **open** (QUESTION, not yet ruled).

## Prerequisite tests (handed to Lintel → Tinker 2026-09-23)

| Test | Gates | Result |
|---|---|---|
| T1 ctx as `pi`-root index | P-13 index half | open |
| T2 Phoenix / OMP OTel export | P-4, P-7c, P-8b, P-16 observation layer | open |
| T3 TypeSafe `judge()` latency/cost | whether Q1's classifier runs per dispatch or on a sample | open |

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

**Granularity (is Newdle one workload or many) — pulled forward from Session B, to be ruled
before A2**, since the cutover map cannot be keyed on units without a size. Carried
recommendation: many, one per thing Jo would name and return to.

**A1.3 Classifier and tier names — open.** Classifier: TypeSafe via OMP's native `judge` role,
one choice question per slice (carried, gated on T3). Tier names: open.

### A2 · Seat → workload cutover map, overlap rule, seat retirement (P-3)

open

### A3 · Unsolicited-surface threshold (P-7c)

open

### A4 · Reserved-action command list (P-7b item 3)

open

## Session B — remaining open columns

open

## Session C — keep / change / drop pass (P-10)

open — disposition ledger lives in `DESIGN-2.0.md`.

## Open questions

- **OQ-1 (2026-09-23, from `research/typesafe-data-terms.md`) — which entity is the Customer on
  the TypeSafe key in the 2.0 profile: Jo personally, or Newdle?** MCA §5 makes the accepting
  party warrant it holds the rights to the Input. *Personal key* → only Jo-owned repositories may
  appear in slice briefs. *Newdle key or Newdle-approved key* → Newdle repositories may too.
  Terms otherwise acceptable for repository text (no training use, MCA §4.1; retention not
  zero, US-hosted); not acceptable for secrets. Held until the key goes into a profile.
