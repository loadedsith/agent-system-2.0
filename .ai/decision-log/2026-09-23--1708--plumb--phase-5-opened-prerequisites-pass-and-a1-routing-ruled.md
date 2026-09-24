---
date: 2026-09-23T17:08-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 opened — three prerequisite tests pass, A1 (P-9 model routing) ruled in full, TypeSafe data boundary found already live
status: resolved
durable: false
---

## What changed

Jo opened Phase 5 (*"next"*). Eight commits on `main` after `ad54dca`, `3dc527c` … `c07ac3c`, all
local; Jo pushes. New file `SPEC-2.0.md`; new file `research/typesafe-data-terms.md`.

- **Prerequisite tests, all three pass** (Tinker, via Lintel; receipts
  `/Users/jowolff/agent-scratch/tinker/phase5-prereq-tests/TINKER-REPORT.md`; recorded in
  `SPEC-2.0.md` § Prerequisite tests, Tinker's receipts preserved without broadening):
  - T1 ctx indexes OMP seat sessions once registered as a `pi` root — P-13's index half can be ctx.
    Keyword-only today.
  - T2 OMP exports OTel spans (env var only, http/protobuf) and Phoenix ingests them with usage,
    latency, model, tool attributes. The "no export → observation layer is build step one"
    migration branch does not fire. Carried default: OMP → Phoenix directly on 6006.
  - T3 TypeSafe `judge()` on a synthetic slice: 0.2–0.5 s, $0.0000286, stable choice. Cheap enough
    to classify every dispatch.
  - Side effect: a 2.0 OMP profile `agent-system-2` now exists at
    `/Users/jowolff/.omp/profiles/agent-system-2/`, TypeSafe key only, created by Tinker.
- **A1 (P-9) ruled in full** — `SPEC-2.0.md` § A1:
  - A1.1 work-kind taxonomy is **shape-keyed, five kinds**: locate, understand, change-small,
    change-large, judge. Consequence stays out of the taxonomy (ceiling + reserved list carry it).
  - A1.2 ceiling source: the orchestrator **infers stakes** (throwaway / normal / production) from
    what Jo said plus the target, writes it into the brief, shows a one-liner Jo overrides in one
    word; default normal. Jo writes no brief.
  - A1.4 workload granularity: **task-sized**, one job with an end; no repo-sized standing
    workloads; group tags dropped from the model.
  - A1.3 **four tiers, fast / standard / strong / deep**, names not models, tier→model table in the
    profile only; kind→tier fixed (change-large → strong, only judge → deep); routing chain
    brief → classifier → kind → tier → cap → model.
- **TypeSafe data terms fetched twice** (Plumb's research hand → `research/typesafe-data-terms.md`;
  Tinker independently, reconciled, no contradiction): no training on inputs (MCA §4.1),
  retention not zero, DPA covers personal data only, six US subprocessors, zero-retention only by
  emailing privacy@typesafe.ai.

## Decisions made (and why)

- **Shape over consequence for the taxonomy.** A classifier can read shape off a brief with no
  repo context; consequence needs context the brief lacks and duplicates the ceiling. Hybrid
  rejected because its raise-only flag is redundant with the P-7b gate.
- **Inferred stakes, default normal, not default-top.** Jo cannot promise a brief per workload;
  P-5 already made the brief orchestrator-written. Default-top spends top tier on scratch work
  until Jo notices; the reserved-list case is already forced to top by the judge kind and the gate.
- **Task-sized workloads.** A ceiling on "all of newdle-web" bounds nothing; a repo-sized workload
  is a 1.x seat under another name, ruled out under P-5. Per-repo knowledge is the P-13 store.
- **Four tiers, not three.** Jo: *"depending on the complexity that could be an opus-5-5 task and
  not necessarily a fable task"* — a distinction three tiers cannot express. Fable is where the
  thinking is (judge), not the typing.
- **Granularity pulled forward from Session B** because A2's cutover map cannot be keyed on units
  without a size.

## Dead ends — don't retry these

- Asking Jo the granularity question as "with Newdle and personal as labels" — read as a question
  about stakes meaning differing per repo. The framing that landed was *size*: task-sized vs
  repo-sized, with concrete examples of each.
- Recording models in the spec. Jo's caveat (*"as far as we are using opus at the moment"*) is why
  the spec names tiers and the profile maps them.

## Heads-up for whoever touches this next

- **Held for Jo, in `SPEC-2.0.md` § Open questions:**
  - OQ-2 **the TypeSafe data boundary is already live**: Tinker's CLAIM — the key has been in the
    *default* OMP profile since 2026-09-21 10:31, so every 1.x session's native `find` has been
    sending workspace text to TypeSafe since then. Recommendation: email for zero-retention, keep
    `find` as-is meanwhile. Grade: worth knowing, not on fire.
  - OQ-1 whose account the key is (Jo personally vs Newdle) — decides which repos may appear in
    briefs under MCA §5.
- **Next:** A2 — the seat → workload cutover map, the overlap rule, and what retires a 1.x seat
  (Plumb included). Then A3 threshold, A4 command list. Session B gains: the classifier
  low-confidence rule (route one tier up, threshold unset).
- Halt point reached: prerequisites done, A1 in the file. Session B's list has one fewer item
  (granularity) and one more (low-confidence rule).
- Tinker's `ctx sources add` syntax differs from `briefs/phase5.md:31` (needs a positional name;
  `remove` takes the name). Brief not corrected; the spec table has the working form.
- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel was told of the dedupe only; this wrap-up is not re-sent.
