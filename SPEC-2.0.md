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

**A1.3 Classifier and tier names — partly ruled 2026-09-23.** Classifier: TypeSafe via OMP's
native `judge` role, one choice question per slice (carried; T3 measured 0.2–0.5 s, $0.00003,
so it runs on every dispatch). Tier→model mapping lives in the 2.0 profile only; the spec names
tiers, never models. Kind→tier: locate→fast, understand→standard, change-small→standard,
**change-large→standard, not deep** — Jo: *"i would push back on change-large-deep spending
top-tier on every multi file. i feel depending on the complexity that could be an opus-5-5 task
and not necessarily a fable task."* judge→deep. Open: whether there are three tiers (fast /
standard / deep) or four, given Jo's "depending on the complexity" and the 1.x ladder having
four distinct models (haiku, opus-5, opus-5-5, fable).

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
