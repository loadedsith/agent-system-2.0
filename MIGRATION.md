# MIGRATION — from 1.x seats to 2.0 workloads, one step at a time

Written 2026-09-28 after Jo accepted the design (*"design stands"*, `DESIGN-2.0.md` § D1–D7).
Governing rulings: § A2 (cutover map, overlap, retirement), § B8 (install path), P-3 (1.x remains
rollback at every step), P-4 (every step passes an automated gate producing an inspectable
artifact **and** gets Jo's sign-off after real use). Inputs collected in `DESIGN-2.0.md` § D7.

**Executing this file is a separately approved plan** (charter; `briefs/phase5.md:301-302`).
Nothing here runs on this document alone.

## The shape of the migration, in three sentences

1. **Build 2.0 beside 1.x** — every step below leaves every 1.x seat launchable and Lintel running,
   because 2.0 lives in its own OMP profile (`agent-system-2`) and its own repo, and touches 1.x
   files only in the two named steps (M1, M9), each with a one-command reversal.
2. **Prove it on this repo first** (A2.1) — the build of 2.0 runs as 2.0 workloads from the first
   lane that can run; then one product-repo workload exercises a reserved-list action under the
   gate (A2.2 good-enough evidence).
3. **Retire seats on Jo's word, one at a time** (A2.4) — dormancy, not deletion (A2.2). While 1.x
   and 2.0 overlap, Jo does not run a 1.x seat while a lane works on that repo (A2.3 amended
   2026-09-28); no machinery enforces this.

## Invariants every step keeps

- **1.x untouched except M1 and M9.** No file under `~/.claude`, `~/.omp/agent`, or a seat home is
  edited by 2.0 machinery. Snapshots of every unversioned file 2.0 stops relying on are already in
  `research/1x-snapshots/` (C batches, sha-verified).
- **Seats still launch; Lintel still runs.** Checked by the step's gate where the step could
  affect it (M1, M9); assumed elsewhere because nothing in the step touches 1.x.
- **Owner and reversal on every step.** Owner is who runs it; reversal is one command or one
  `git revert`.
- **Gate artifact + Jo's sign-off.** The gate is automated and leaves an artifact Jo can open; the
  sign-off happens after Jo has used the result, not on reading the artifact.

## Steps

| # | step | owner | gate (automated, artifact) | Jo's sign-off after | reversal |
|---|---|---|---|---|---|
| M0 | **Register the 1.x transcripts as a ctx `pi` root** (`ctx sources add --provider pi --root ~/.omp/agent/seat-sessions omp-seat-sessions`). Already run once by Tinker (T1); make it durable in ctx's config so a fresh index includes it. | Tinker or Jo (touches ctx config under Jo's home) | `ctx sources` lists the root; one search returns a seat-session hit → saved to `/Users/jowolff/agent-scratch/agent-system-2.0/migration/M0.txt` | first time a 2.0 lane answers a history question from it | `ctx sources remove omp-seat-sessions` |
| M1 | **Disable the newdle plugin for Jo only** (`settings.json`: `newdle@contextpress: false` in `enabledPlugins`; remove the two plugin-cache hook lines — C5.1). Jo-local (P-18: *"the plugin will only be gone for me"*); teammates unaffected. | Jo (their own `settings.json`) | `claude` starts with no plugin hook errors; every 1.x seat still launches (`launch-seat --start <seat>` × 12 → `check-seat-ready` green) → log at `…/migration/M1.log` | a day of 1.x seats running without the plugin | restore from `research/1x-snapshots/dot-claude-settings.json-20260924` (sha `ce47871f…`) |
| M2 | **Ledger module** (`bun:sqlite`, § B2): schema, module API, WAL, the rules in the file; the `sqlite3` raw-write gate (P-11 row 10). First manifest rows; install script skeleton (§ B8). | Plumb (build lane, once M6 exists — before that, a hand under a stated model plan) | module tests + the fresh-machine install test (clone → install → profile has the ledger) → CI artifact | after M6's first real workload has written to it | `git revert` the build commits; `rm -r ~/.omp/profiles/agent-system-2/…` links the install created |
| M3 | **Tier files + classifier hook** (§ A1.3): six tier files (orchestrator, lane, fast/standard/strong/deep), the pre-dispatch classifier on TypeSafe (threshold 0.55, higher-of-top-two below it), tier→model table with provider order in the profile template (P-11 row 15). Open build question 1 (hook vs extension; agent files vs input rewrite) decided here. | Plumb | replay of the 30-brief classifier sample through the hook → `research/classifier-sample.md` figures reproduced within noise; a dispatch naming a non-tier agent is refused (P-11 row 4) → test log | first workload's slices land on the expected tiers | `git revert` |
| M4 | **P-11 gates** as extension hooks: rows 1–9, 11, 12, 14 (turn shape, contract injection, receipt verification, six brief fields, § A4 reserved list, wake verified read, rebase-before-push, protected-branch edit, Jo's-instruction entry, manifest-or-fail install, no-`ask` profile denial). Reference inputs: the six 1.x hooks named in C5. | Plumb | one failing and one passing fixture per gate → test log; the fresh-machine install test still passes | first workload runs with zero gate false-positives Jo had to override | `git revert`; a single gate can be removed from the profile's extension list without reverting the rest |
| M5 | **Orchestrator surface + wake + errors** (§ B3, § B7, § A3): the single surface, stakes inference (§ A1.2), the four § B3 error lines, the four-hour hold, wake as the ledger rendered, P-7c. | Plumb | a scripted session: open workload → compaction → wake renders the ledger and the resume entry is enforced → transcript artifact | Jo runs one real session on the surface | `git revert` |
| M6 | **First workload on this repo under the P-4 gate** (A2.1): the remaining build of 2.0 itself becomes 2.0 workloads. Phoenix receives the spans (T2: env `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` → `http://localhost:6006/v1/traces` in the profile template). Two open build questions decided by use: hand reuse (2), contract injection point (7). | Plumb, as the first lane; Jo as the operator | Phoenix shows the workload's trace; the ledger shows open → slices → closed on runtime artifacts → export of both to `…/migration/M6/` | Jo has watched one workload end to end and overridden stakes once | close the workload; Plumb continues as a 1.x seat (A2.1: *"rollback is Plumb continuing"*) |
| M7 | **Skills manifest** (C6.1: 20 skills; `includeSkills` allowlist in the profile; `humanizer`, `ctx` copied-once-then-owned; merged `cross-model-review`, `spec-and-plan`; accessibility base after the research hand — `RESEARCH.md` early test 4). | Plumb | the profile lists exactly the manifest names (`omp` skill listing → artifact); every skill's `description` present (native provider requires it) | Jo's picker shows 20, not 60; one personal skill opted in by name works | `git revert`; `includeSkills` back to empty |
| M8 | **Bulk memory → ledger migration** (A2.2; C1): for each of the twelve seats, memory + charter *facts* → ledger entries keyed by repo. Wren's memory file is `web-seat-memory.md`; Levitt's repo is uncommitted (snapshot first); Codex's is `~/.codex/memories/memory_summary.md`. Charter *rules* are not migrated — they are tier-file reference input (C1 clause 2) or already P-11 rows. | Plumb (reads seat homes; writes only the ledger) | per-seat count of entries written, each citing its source file and line → `…/migration/M8.md`; a lane on each repo renders the entries at wake | Jo spot-checks three repos' rendered facts | `DELETE` those entries by their migration tag through the module (no raw writes) |
| M9 | **Optional HerdR/moshi template rows** (C5.7): if Jo wants HerdR pane state or moshi in the 2.0 profile, add the extension path rows by default-profile path. Open build question 6 (out-of-profile extension path) measured here. | Jo (installer-owned files) | 2.0 profile starts with the extensions loaded, `herdr` shows the pane → screenshot | a week of use | remove the two rows |
| M10 | **One product-repo workload that exercises a reserved-list action under the gate** (A2.2 good-enough evidence): a real `newdle-*` task whose close touches a protected-branch push or a deploy; the gate refuses, the orchestrator raises it as a P-7b one-liner, Jo approves, the action runs. Overlap rule in force: no 1.x seat runs on that repo while the lane works. | Jo picks the task; a 2.0 lane runs it | ledger + Phoenix show refuse → raise → approve → run; export to `…/migration/M10/` | Jo approved the reserved action and saw it land | the 1.x seat for that repo takes the next task (A2.3) |
| M11 | **Cutover event** (A2.2): Jo says so, with M6 and M10 in front of them. From here 2.0 takes every repo's new work by default. | Jo | none automated — the evidence is M6 + M10's artifacts | — | 1.x seats are still launchable; Jo routes work back by hand |
| M12 | **Retire seats, one per Jo's word** (A2.4): evidence offered per seat = Phoenix count of completed 2.0 workloads on that repo + the ledger's hand-backs. Retirement = HerdR row stopped, launcher untouched, charter and memory left on disk. Lintel retires at a single moment (A2.2). Plumb retires last — it carries the build until then (C1.15). Dormancy period: **a period Jo sets** — unset; deletion is a later, separate decision. | Jo | `seat_list` shows the seat stopped; `launch-seat --start <seat>` still works (rollback) → log | the repo's next workload ran without the seat | `launch-seat --start <seat>` |

## What is deliberately not a step

- **No 1.x seat is edited** to add a guard, a hook, or a notice — P-3. The overlap rule is Jo's operator rule (A2.3 amended).
- **No deletion** of `~/.claude/orchestrator`, seat homes, launchers, mailboxes, or transcripts — A2.2 dormancy. A deletion plan, if ever, is its own document.
- **No shipyard change** — P-18 is Jo-local; teammates keep the plugin, `AGENTS.md`, and their hooks.
- **No Docker `otel-collector` hop** — T2's carried default is OMP → Phoenix on 6006 directly.

## Open fields (Jo's, not the build's)

- **Dormancy period** after retirement (M12) — *"a period Jo sets"*, unset.
- **Whether M9 runs at all** — HerdR/moshi rows are optional; Jo's call at M9 time.
- **TypeSafe key's Customer entity** (`SPEC-2.0.md` OQ-1) before any Newdle repo brief reaches the classifier at M10.
