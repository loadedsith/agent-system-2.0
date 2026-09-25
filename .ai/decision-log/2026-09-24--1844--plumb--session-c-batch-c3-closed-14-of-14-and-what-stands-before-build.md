---
date: 2026-09-24T18:44-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 Session C — batch C3 (routing and delegation)
status: resolved
durable: false
---

# Session C: batch C3 closed 14/14; what stands between here and the build

## What changed

- `DESIGN-2.0.md` § C3: 14 rows ruled by Jo, commits `0ffae0b` (scaffold) through `c9fd053`
  (close). Summary paragraph at the end of the C3 table. P-11 mechanical-rule list now five rows.
- Snapshots under `research/1x-snapshots/` (sha-verified in the rows):
  `dot-claude-orchestrator-state-ROUTING-20260924.tar.gz` (8 entries),
  `dot-claude-orchestrator-WORKSTREAMS-contracts-20260924.tar.gz` (5),
  `dot-claude-orchestrator-runbooks-summon-20260924.tar.gz` (15).
- 12 commits unpushed since `53e7840`; Jo pushes.

## Decisions (Jo's words in the rows)

- **Nothing in routing re-homes.** Every 1.x routing artifact is superseded by § A1 (brief →
  classifier → kind → tier → cap → model) and § B9 (six-field leaf brief), or belongs to a tier
  2.0 lacks (seats, HerdR, Claude Code). Jo: *"recco"*, *"drop em"*, *"drooop them"*.
- Plugin's 14 role files dropped from 2.0: fourteen role files *are* a routing table, and a
  role file with its own `model:` pin can override the tier (C3.6). Same reasoning kept OMP's
  bundled hand types outside 2.0's hands and never routed to (C3.7).
- Two new P-11 rows, both refusing a `task` call from a lane: names only a tier file (C3.7);
  carries all six § B9 brief fields (C3.12, from `brief-clause-guard.mjs`).
- Per-dispatch human prompts (`fable-mode-guard`, `research-agent-guard`) dropped as the thing
  P-9 abolished; the cost question is answered once at workload open by the stakes cap (C3.11).
- Reference input named for builds: `ROUTING.md` shape table and judge section; the two ledger
  contracts (B2 schema); `agent-reuse-criteria`, `mid-run-death-recovery`, `guard-collisions`
  runbooks; the 14 role bodies (tier files and brief clauses); shipyard-conventions' delegate-when
  column; orchestration-patterns' four anti-patterns; the Linear sync contract's call shapes
  (B10); `worktree-spawn-guard`'s failure mode (hand isolation).
- Jo asked *"what do we lose by dropping them"* (runbooks): answered in three buckets — lost for
  real (three judgment sections, now named as reference input), relocated by ruling, nothing.

## Carried forward

- **Open build question: hand reuse across slices** — 2.0 has no ruling; § B9 briefs a fresh hand
  per slice by default (C3.4).
- Jo's *"i just want my top level agent available"* → the C2.1 voice document's evidence section
  (C3.13).
- From C4, still carried: "consult history at workload open" → C7; ctx skill vs `ctx-cli`
  installer → build time.
- Held, not blocking: Tinker's four housekeeping questions
  (`/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/REPORT.md:14-40`); RRSI apply
  loop after stabilization; hand clones `/tmp/opmodes`, `/tmp/rrsi` to `rm -rf`.

## What stands between here and the build (Jo asked: "are we ready to actually start building")

Answer given: not yet; three things, in order, per `briefs/phase5.md:281-302`.

1. The rest of Session C — 73 rows: C5 verification/hooks (20), C6 skills (sizing decision first,
   against P-22's mode column), C1 identity/charter (20), C7 state (15), C8 seat-lifecycle (12).
   The brief expects C1/C7/C8 to largely dissolve with the seat tier.
2. `DESIGN-2.0.md` synthesis sections — the tier structure, the machinery/state boundary written
   out, and the build choices the spec deferred here (classifier as hook vs extension,
   `SPEC-2.0.md:99-101`; hand reuse; ctx skill install). Halt point 5.
3. `MIGRATION.md` — ordered cutover, owner and reversal per step, gate plus Jo's sign-off per step;
   executing it is a separately approved plan.

GUESS (unmeasured): two or three more sessions of C batches, one for the synthesis, one for
`MIGRATION.md`. Building the ledger module, classifier hook, and tier files can start under the
2.0 `OMP_PROFILE` before `MIGRATION.md` is finished (§ A2 overlap), but not before the synthesis —
that is where the build's slices come from.

## Next

- **Halt point 4 (after a Session C batch). Jo pushes, then Session C continues with C5.**
- Method unchanged: one row per turn, recommendation with one-sentence why, Jo's words verbatim,
  snapshot before any drop of an unversioned file, commit per row. Batch confirmation rows when a
  Session B ruling already classifies the class. State once per batch: plugin-shipped rows need
  no snapshot (git-tracked in the plugin source repo) and no shipyard step (P-18 Jo-local).
- Standing constraints unchanged: P-18 Jo-local; TypeSafe on in both profiles, do not raise; no
  hands without a stated model plan and Jo's word.

## Candidate lessons

- Plugin-shipped rows follow one fixed clause (no snapshot, no shipyard step, plugin copy stays);
  state it once at the top of a batch rather than per row.
- When a Session B ruling classifies a whole artifact class, the Session C rows in it are
  confirmations — batch them into one question. (Carried from the C4 entry.)
- P-18 is Jo-local; Jo's "not a problem" is the ruling. (Carried; still unpromoted.)

## Notes

- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel not notified: a batch close is not a phase close.
