---
date: 2026-09-28
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 Session C — C6, C1, C7, C8 closed; synthesis; MIGRATION.md
status: resolved
durable: true
---

# Session C closed; design accepted ("design stands"); MIGRATION.md written — halt point 5

## What changed

- `DESIGN-2.0.md`: C6 skills (20 kept / 98 disposed, five questions ruled), C1 identity (20),
  C7 state (15), C8 seat-lifecycle (12) — C1/C7/C8 ruled by Plumb in one pass under A2.2
  dormancy + P-5, no questions needed. P-11 list: 15 rows, one struck (overlap guard →
  operator rule), two new 2.0 rules from the brief (no human prompts in lanes with a mode
  split; rate-limit falls sideways). Synthesis § D1–D7 written at the top of the file.
  Jo: *"design stands"* (2026-09-28).
- `MIGRATION.md` written: 12 steps M0–M11 (M12 folded into M11 after Jo's "all or nothing" ruling on retirement, A2.4 amended), each with owner, automated gate + artifact, Jo's
  sign-off after use, reversal; invariants; non-steps; three open fields.
- `SPEC-2.0.md` A2.3 amended: the mechanical overlap guard withdrawn (Jo sequences by hand).
- `RESEARCH.md`: early Phase 5 test 4 — the accessibility-skill research hand, tracked.
- Snapshots (sha in the rows): three skill roots (2026-09-25), Lintel dir + Tinker, Codex home,
  `~/.omp` seat files, orchestrator state prose, `~/.claude/state` + handoff + daemon
  (**`daemon/control.key` excluded**; never staged).
- Commits `4563c49` … `14d8060`; Jo pushed twice in between; six unpushed at this entry.

## Decisions (Jo's words in the rows)

- **Skill sizing rule**: a 2.0 skill is machinery a lane loads for a *kind* in a *mode*; 20
  core skills against 118 names. Jo added accessibility (*"make sure we include some kind of
  accessibility skill"*; base open, research hand tracked) and `impeccable` (*"agreed"*).
- **Personal skills**: 2.0 profile `includeSkills` = the manifest names; opt in one name at a
  time (Jo: *"won't that mean i will still see over 40 skills when picking?"* → *"yes"* to
  the allowlist). "Optional root" was wrong — OMP loads a root whole and registers a slash
  command per skill (`omp://skills.md:116,144`).
- **Cross-model review**: `triad` + `quorum` merged, one skill two entry points (*"there are
  too many entry points right now so this solves that"*). Research base:
  `source-driven-development` + findings-file artifact.
- **Domain four in core** (`api-and-interface-design`, `performance-optimization`,
  `observability-and-instrumentation`, `deprecation-and-migration`).
- **Bulk memory → ledger** (A2.2 applied): repo facts move from files only old seats read to
  the one place every lane reads at wake, keyed by repo; Jo: *"agreed"*. Two-repo workloads
  noted as a build question.
- **Overlap guard**: no machinery. Jo: *"i will simply not run a 1.x seat while something is
  working on a lane."*
- **`ask` mode split**: user-driven lanes keep `ask`; autonomous lanes and hands lose it
  (Jo: *"yes"*).

## Dead ends

- Offering `~/.agents/skills` as an "optional user root" — not optional for the picker.
- A category sweep for C6 missed five plugin skills; a per-name completeness check caught them.
- First `daemon/` tarball included `control.key` — rebuilt with an exclude before staging.

## Open

- `MIGRATION.md` execution is a separately approved plan — Jo's word opens it.
- Open build questions: `DESIGN-2.0.md` § D6 (seven). Open fields: `MIGRATION.md` last section.
- Accessibility research hand: needs a model plan + Jo's word (`RESEARCH.md` early test 4).
- Held: Tinker's four housekeeping questions
  (`/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/REPORT.md:14-40`); RRSI
  apply loop; hand clones `/tmp/opmodes`, `/tmp/rrsi` to `rm -rf`.

## Candidate lessons

- State the sizing rule before the list; it does the cutting.
- Check a loader's actual behaviour before offering a visibility option.
- Batch close needs a mechanical completeness check (every inventory name placed).
- Exclude key/credential files before the first `tar`, not after.
- Four questions → write all four to the file, bring two, hold two.

## Notes

- Lintel notified after this entry (phase halt point, not a batch close).
- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
