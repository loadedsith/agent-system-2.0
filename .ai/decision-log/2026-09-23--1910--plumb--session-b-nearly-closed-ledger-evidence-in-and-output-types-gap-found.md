---
date: 2026-09-23T19:10-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Session B nearly closed — B1–B12 ruled, B2 evidence in, P-16 counting, P-22 provisional, output-types gap found; halt point 3
status: resolved
durable: false
---

## What changed

24 commits on `main` after the 17:25 wrap-up (`8a1c…` after `241e4da` … `2e82255`), Jo has pushed
through `724e6f2`; the seven after it are local. Files: `SPEC-2.0.md` (Session B § B1–B14,
Open questions), `research/` (six new reports), `REQUIREMENTS.md` untouched (P-21, P-22 land in
the pre-Session-C diff).

- **Session B rulings, all in `SPEC-2.0.md` in Jo's words:** B1 slice closes on a runtime
  artifact; B3 error = four things (plus item 5: a lane waiting on a human, confirmed observable
  in OMP's extension API — `research/omp-prompt-state.md`); B4 stakes caps tiers, review is a
  stakes property; B5 direct instructions ledgered; B6 spec-and-plan is the lane's first judge
  slice; B7 wake is the ledger rendered; B8 P-15 machinery/state rule, one install script,
  machine-read manifest; B9 six-field leaf-only slice brief; B10 Linear + GitHub tie-back (new
  **P-21**); B11 ceiling = nominal list-price dollars bounding three flat-rate subs + metered
  TypeSafe; B12 reserved list is five, closed with valves; P-16 depends on P-15; **B13 P-22 two
  operating modes, provisional** — B13.1 "autonomous" = small work handed off with no approval,
  features execute an approved plan; **B14.1 P-16 counts only ledger rows** (B3 errors, B4
  refusals, A1 pull-ups; B5 instructions as repetitions), no prose mining.
- **A1 low-confidence rule:** shape ruled (higher of top two kinds, never lower); threshold
  **0.55 measured** on 30 real briefs, 76.7% agreement (`research/classifier-sample.md`).
- **B2 ledger — evidence complete, NOT ruled.** Cross-lab gaslight (`research/gaslight-b2-ledger-2026-09-23.md`)
  → Jo ordered a measured comparison. Tinker's three hands ran 11 identical lifecycle steps on
  both engines: `/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/REPORT.md`.
  Then two research hands: `research/beads-known-issues.md` (the `set-state` split is upstream
  open issue gastownhall/beads#5637, no fix on main; Dolt drops torn journal records **by
  design** without error; `BEADS_DIR` silent fallback is #5756 open; leases hardcoded #5681) and
  `research/sqlite-ledger-prior-art.md` (12 instances; happy on one host at low concurrency;
  pain = `busy_timeout` on every connection, second writers on shared/synced folders, no
  cross-machine sync; **our design lacks a lease/reclaim for a dead agent's claim**).
- **Output-types coverage audit** (`research/output-types-coverage.md`): the framework has
  **no home in 2.0** — zero grep hits in `SPEC-2.0.md`; four on-fire gaps (no requirement obliges
  labeling; six-field brief has no propagation slot; P-8a trust vs 1.x Tier-3 rule; P-11's
  single-tool-call test excludes a Stop-time message guard). Hand recommends standalone P-23.
- **Operating-modes research** (`research/operating-modes.md`): Jo's Osmani-steer /
  superpowers-autonomous mapping **supported with a scope correction** (superpowers is autonomous
  only when executing an approved plan; before that it is the more gated).

## Decisions made (and why)

- **Measure Beads before ruling B2** rather than accept the gaslight's 2-of-3 "under-evidenced"
  verdict or Claude's exclusion. Jo: *"i really, really want to use beads"*; a fair shot cost one
  hand-day and produced engine-level findings no argument could.
- **P-22 provisional, mapping unruled** until research; Jo: *"before we make that a rule shouldn't
  we research whether that's a correct assumption?"* Research then supported it.
- **P-16 counts ledger rows only** — the same rule as B1 and B7 (ledger over prose); the accepted
  gap (an uncorrected silent wrong answer is invisible) is written into B14.1.
- **Threshold 0.55, not 0.80** — Jo rejected an unmeasured number; measured on Jo-owned briefs.

## Dead ends — don't retry these

- "Prose-adjacent" as a description of Beads' wrapper — retracted in chat; the honest framing is
  *rule in the file (SQLite CHECK+triggers) vs rule in our code (TS wrapper any `bd` call
  bypasses)*, and the bypass is gate-able by P-11 machinery for **both** engines, so it cancels.
  The remaining B2 difference is engine-level: split writes and silent journal loss.
- Claude leg of `gaslight-fanout.sh` loses its report to the output-types Stop hook inside
  `claude -p`; recover from `~/.claude/projects/-Users-jowolff-code-agent-system-2-0/*.jsonl`.
- Jo's "let's follow the recco" (19:0x) was for **P-16 counting**, not B2 — B2 was never
  recorded as ruled. Don't infer a B2 ruling from that exchange.

## Heads-up for whoever touches this next

- **Jo is idle; resume only on their word. One decision at a time, holding the next.** Queue:
  1. **B2 ledger** — recommendation homegrown `bun:sqlite`, rules in schema; fold in from prior
     art: lease + reclaim primitive, `busy_timeout` on every connection before WAL, retry on
     every write path, checkpoint starvation guard, a second copy for recovery (`VACUUM INTO`
     on a schedule). Apply the four gaslight 3/3 fixes and B8's "CLI" wording. Then the
     decision-logs question (1.x wrap-up machinery: merge into ledger or human layer).
  2. **P-23 output-types** as a standalone requirement; settle G2 (propagation is lane
     machinery, not a brief field), G3 (zero-label report vs P-8a trust), G4 (P-11 gains a
     "message leaving an agent" mechanical trigger).
  3. **P-16 threshold** — recommended three of the same normalized signal across ≥2 workloads in
     a rolling 30 days, provisional. Then **P-16 proposal format** (P-8c surfacing; on OMP a hook
     is a TS factory under `hooks/pre|post/`, so a `hooks.json`-shaped proposal never fires —
     `briefs/phase5.md:150-153`).
  4. Pre-Session-C diff of `REQUIREMENTS.md` (P-3, P-7b, P-7c, P-9 lag; add P-21, P-22, P-23)
     and `briefs/phase5.md` (add mode + harness-portability columns; mechanical rules: prompts
     designed out of lanes, provider rate-limit fallback to same tier). Then Session C.
- Tinker's four housekeeping questions (`REPORT.md:14-40`): uninstall `bd`/`dolt`, quarantine
  four `.git` dirs, delete one queued telemetry event, keep 27 profile paths — defaults
  proposed, nothing blocked, unanswered.
- Still held (`SPEC-2.0.md` § Open questions): OQ-1 whose TypeSafe account; OQ-2 data boundary.
- Research hands left a clone at `/tmp/opmodes` (grep-null receipts point into it; `rm -rf` to
  remove). `beads-known-issues.md` notes `steveyegge/beads` now redirects to `gastownhall/beads`.
- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel not notified this session beyond the lifecycle brief handoff.

## Addendum, 2026-09-24 — B2 ruled after this entry was written

Jo, on returning: *"you are REALLY pushing this bun:sqlite nonsense and let me tell you - i
don't want to. and you've done a good job providing me with reasons why I SHOULD regardless of
what I want. we are going forward with your recommendation"*. **B2 = homegrown `bun:sqlite`**,
rules in the file, five prior-art obligations folded in, Beads rejected on the two engine-level
failures; B8 "CLI" wording fixed. Commit `46d516f`. Queue item 1 above is done; the
decision-logs question (ledger replaces authored entries, wrap-up becomes a rendered view —
recommended) is the open ask. Items 2–4 unchanged.
