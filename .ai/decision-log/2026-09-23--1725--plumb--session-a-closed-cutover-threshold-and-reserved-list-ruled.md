---
date: 2026-09-23T17:25-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Session A closed — A2 cutover, A3 threshold, A4 reserved list ruled; halt point 2
status: resolved
durable: false
---

## What changed

Six commits on `main` after the 17:08 wrap-up (`d6bba67` … `817fab9`), all local; Jo pushes.
Only `SPEC-2.0.md` changed. The 17:08 entry covers A1 and the prerequisite tests; this one
covers the rest of Session A.

- **A2 cutover (P-3), all four parts ruled:**
  - A2.1 first repository is `agent-system-2.0` itself (*"this one absolutely"*) — the proving
    ground where the machinery is built and exercised on real work.
  - A2.2 **cutover is one event, not a per-repo order.** Jo's hypothesis, held up on P-5 (a lane
    is not repo-bound, so capability is one set of machinery for every repo). Good-enough evidence
    = self-hosted build as 2.0 workloads plus one product-repo workload through the reserved-list
    gate. Per-repo knowledge migrates in bulk beforehand. Lintel retires at a single moment.
    **Retirement is dormancy, not deletion** (launchers, charters, HerdR rows stay; fallback is one
    command) — how P-3's rollback survives a single event.
  - A2.3 overlap: both take work, 1.x only for what 2.0 cannot yet do; hand-backs are a sentence
    in the surface / ledger, **no gap-list file**. Guard: 1.x may not touch a branch a 2.0
    workload has open. All twelve seats retire in the end.
  - A2.4 retirement: **Jo says so, per seat, no machinery** — evidence is Phoenix's count of
    completed 2.0 workloads on the repo.
- **A3 threshold (P-7c): 4 hours held** before a message or idle workload is pushed unsolicited.
  Recorded alongside it, at Jo's request: the form of a workload with no live lane (one ledger
  row, `open AND no lane`; Linear/GitHub links are optional sources, never truth for open/closed).
  Ledger technology explicitly still undecided — Session B.
- **A4 reserved commands (P-7b item 3):** the `careful` enumeration plus push to a protected
  branch plus deploy; feature-branch pushes and merges of approved PRs **not** reserved. Held
  decision 6 ("remote push" → protected-branch push or deploy) is thereby ruled.
- **Session A closed; halt point 2.**

## Decisions made (and why)

- **Single-event cutover over per-repo order.** Jo's hypothesis; it holds because 2.0 readiness
  is global machinery, not per-repo skill. The one thing self-hosting cannot prove is the
  reserved-list gate, hence the product-repo test in the evidence.
- **No gap list.** Plumb proposed a machinery-written gap list as retirement evidence; Jo:
  *"it just seems like we might have to institute a lot of machinery to even gather this data"*.
  On inspection the second write path it needed (Lintel's 1.x dispatch) is a change to 1.x,
  forbidden by P-3 — so it could only ever see half the fallbacks. Withdrawn.
- **4 hours, not 24.** Jo's number; Plumb had recommended 24 on the "you already know you owe
  it" argument. Accept more pings.
- **Merges not reserved.** P-8d retired per-unit approval; the irreversibility line is the
  protected branch and the deploy, not the merge.

## Dead ends — don't retry these

- Machinery-computed retirement (empty gap list for N workloads). Four cons recorded in
  `SPEC-2.0.md` § A2.4; the structural one is that 1.x cannot write to it.
- Asking the per-repo cutover order. Withdrawn under A2.2; do not re-ask "which repo is second".

## Heads-up for whoever touches this next

- **Next: Session B**, batched open columns — P-13 ledger tool (Beads; OMP native backends
  `local` / `mnemopi` / `hindsight` / `sharpshooter`), P-11 mechanical-rule list, P-12
  plan-before-or-after-lane, P-15 machinery vs state, P-14 concrete ceiling, P-17 wake capture,
  P-20 slice-brief minimum fields, the classifier low-confidence rule (route one tier up;
  threshold unset), and the held triple-check decisions (reserved list closes at five with P-4
  sign-off; P-16→P-15 dependency). Held decision 6 is done. Then Session C.
- **Still held for Jo** (`SPEC-2.0.md` § Open questions): OQ-2 the TypeSafe data boundary,
  already live via `find` in the default profile (recommendation: email privacy@typesafe.ai for
  zero-retention, keep `find` meanwhile); OQ-1 whose TypeSafe account (Jo vs Newdle).
- `briefs/phase5.md` still lists Q2 (P-3) with a per-repo cutover map and Q13 etc.; the brief is
  not edited to match rulings — `SPEC-2.0.md` is the record. Diff summary rows in
  `REQUIREMENTS.md` against today's rulings before Session B (P-3, P-7b, P-7c, P-9 rows now lag
  the spec) — same drift class the cross-lab review found.
- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel not re-notified; Tinker's test results were acknowledged only in the spec.
