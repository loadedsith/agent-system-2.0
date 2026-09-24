---
date: 2026-09-24T11:02-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Session B closed — B2 ledger, B2.1 decision logs, P-23 output types, P-16 in full ruled; halt point 3
status: resolved
durable: false
---

## What changed

Nine commits on `main` after the 19:10 entry's addenda (`46d516f` … `15785ba`); 17 unpushed
since `724e6f2`, Jo pushes. `SPEC-2.0.md` (Session B now B1–B15, all ruled) and four research
reports. `REQUIREMENTS.md` and `briefs/phase5.md` untouched by Plumb — a builder hand
(`PreSessionCDiff`) is editing them now, uncommitted, for Jo's review.

- **B2 ledger ruled: homegrown `bun:sqlite`.** Jo: *"you are REALLY pushing this bun:sqlite
  nonsense and let me tell you - i don't want to. and you've done a good job providing me with
  reasons why I SHOULD regardless of what I want. we are going forward with your
  recommendation"*. Rules in the file (CHECK + triggers); module callable without OMP; four
  gaslight fixes applied; five prior-art obligations folded in (lease + reclaim, `busy_timeout`
  before WAL on every connection, retry on every write, checkpoint-starvation guard, scheduled
  `VACUUM INTO` second copy). Beads rejected on two engine-level failures through the approved
  path — `set-state` split 7/29 kills (upstream open gastownhall/beads#5637, unfixed) and silent
  journal-truncation loss (Dolt drops torn records by design, `fsck` clean). B8 "CLI" wording fixed.
- **B2.1 decision logs:** ledger is the only record; on workload close the machinery renders an
  entry into any repo carrying the plugin convention — plugin filename scheme, its five
  frontmatter scalars (`status`, `durable`, `supersedes`, `session`, `date`, verified against
  `hooks/lib/parse-decision-log-frontmatter.py:25-30, :92-98`), section headings — never read
  back; parser-checked at build.
- **B15 / P-23 output types:** Jo asked for research first (*"the problem we are trying to solve
  is it is hard to gauge the veracity of an LLM's statements"*). `research/receipts-and-veracity.md`:
  nothing (vendor citations, judges at AUROC ≤ 0.65, entailment) catches rule-7 overreach; what is
  checkable with zero model calls is whether the receipt *exists* — OMP persists `resolvedPath`,
  `startLine`, exit codes per tool call. Ruled: labels required and re-homed; receipts verified
  mechanically at the lane from the tool-call record; verified counts replace the self-reported
  envelope; propagation is lane machinery; P-11 gains "a message leaving an agent"; unverifiable
  hand report flagged not trusted; judge held until OQ-1. Jo: *"verification is important - i am
  not sure why we didn't enforce this in 1.x"*.
- **B14 / P-16 in full:** B14.1 counts only ledger rows; B14.2 threshold **three** of the same
  normalized signal (sourced), spread and window **unset, measured after a month** — Plumb's
  "two workloads, 30 days" withdrawn as unsourced when Jo asked *"where are those numbers coming
  from?"*; B14.3 proposal = ledger row of kind `proposal` with RRSI-shaped fields (score/cost
  null until a scorer exists) + unmerged branch in the portable repo (cutting it not reserved)
  + one B3 line + accepted by merge writing back; manifest-effect field; **B12.2 amended**
  (acceptance = manifest effect, not only a new row). RRSI (`regularized-rsi.com`, code
  `google-research/rrsi`) researched at Jo's ask: critic usable now, floor/cost/pruning need a
  scorer; apply loop held for after stabilization.
- **B13.1 P-22 "autonomous" defined** — small work handed off with no approval; features
  execute an approved plan; research (`research/operating-modes.md`) supported Jo's
  Osmani-steer / superpowers-autonomous mapping with that scope correction.
- Answered in chat, not ruled: lanes get repo `AGENTS.md` via OMP's context-file loading (seen
  in this seat's own prompt); cross-repo workloads and hand inheritance are Session C items.
  Build estimate given as GUESS: four to six weeks calendar, review cadence the bottleneck.

## Decisions made (and why)

- **SQLite over Beads, against Jo's stated preference, on measured engine behaviour** — the
  bypass risk (a hand reaching for `bd` or `sqlite3`) is gate-able by P-11 for either engine and
  cancelled out; the split write and silent loss are not gate-able.
- **Research before ruling, three times** (P-22 mapping, P-23 mechanism, P-16 format). Each time
  the research changed the ruling's shape; none reversed the direction.
- **Numbers only with a source** — B14.2 rules the one sourced number and defers the rest.

## Dead ends — don't retry these

- "Prose-adjacent" as a description of Beads' wrapper — retracted; the honest frame is
  rule-in-the-file vs rule-in-our-code.
- Recommending unsourced thresholds dressed as recommendations (B14.2). Jo catches it; mark
  them GUESS or don't offer them.
- Jo's "let's follow the recco" on 2026-09-23 evening was for P-16 counting, not B2; B2 was
  ruled separately on 2026-09-24 with Jo's explicit words.

## Heads-up for whoever touches this next

- **Halt point 3. Jo pushes.** *(Superseded, see addendum below: the `PreSessionCDiff` builder
  edits to `REQUIREMENTS.md` and `briefs/phase5.md` § Session C were reviewed by Jo and
  committed `6ede85c`; nothing is uncommitted.)*
- **Session C opens on Jo's word**: keep/change/drop over the 1.x rules, C2 and C4 first
  (`briefs/phase5.md:209-211`); disposition ledger lives in `DESIGN-2.0.md`. Session C
  inputs from Session B: mode column (which mode a kept skill serves), harness-portability
  column, superpowers SessionStart-under-OMP unknown (`research-E:742-752`), cross-repo
  `AGENTS.md` loading and hand context inheritance.
- Held in files: OQ-1/OQ-2 TypeSafe (`SPEC-2.0.md` § Open questions; judge layer of P-23 waits
  on it); Tinker's four housekeeping items (`ledger-lifecycle/REPORT.md:14-40`, defaults in
  SPEC § B2); RRSI apply loop after stabilization (SPEC § B14.3).
- Clones left by hands: `/tmp/opmodes`, `/tmp/rrsi` — `rm -rf` when done; receipts in
  `research/operating-modes.md` and `research/rrsi-and-proposal-formats.md` point into them.
- Untracked hook-written `.ai/.gitignore`, `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel not notified this session.

## Addendum, 2026-09-24 — after the entry: P-24, inputs synced, seat going to sleep

- Pre-Session-C diff reviewed by Jo (*"read, commit away"*) and committed `6ede85c`; spec
  header names P-21…P-24 (`8d4c5e1`).
- **B16 / P-24 ruled** (`288b59e`, row in `REQUIREMENTS.md` `e519ae6`): interactive by
  default — one ask per turn, recommendation attached, never a document in place of steps;
  interactive ≠ chatty. Any command handed to Jo is a disposable logged script; the **lane**
  listens via a ledger row on exit. Mechanical form: `tools.approvalMode: write` + per-tool
  overrides in the profile template; OMP `ask` tool for every decision that is Jo's; plan mode
  where B6 puts a judge slice first; turn shape and script rule at the P-23 message gate.
  Jo's question *"is there some type of interactive mode that i can set OMP into?"* — answered:
  no single switch; approval mode + `ask` + plan mode cover "ask before acting"; turn shape is
  2.0's own gate.
- **Jo is putting the seat to sleep and opening Session C fresh.** On wake: read this entry
  and `SPEC-2.0.md` § Session C (open; disposition ledger lives in `DESIGN-2.0.md`), then
  `briefs/phase5.md` § Session C (`:183-279`, now carrying the mode and harness-portability
  columns, the two mechanical rules, C4 under P-23, the ruled-map). Order: **C2 communication
  (P-24 governing) and C4 output types (P-23 governing) first**, then C3, C5, C6, then C1, C7,
  C8. Session C answers `INVENTORY.md`'s rule rows one by one; keep/change/drop with the
  enforcement class (P-11) and the mode and portability tags per row.
- 23 commits unpushed since `724e6f2` at the time of writing; Jo pushes.

## Addendum 2, 2026-09-24 — TypeSafe: ruled not a problem; usage measured anyway

- Jo: *"it's just my account"*, *"it is not a problem re typesafe"* — recorded in `SPEC-2.0.md`
  § Open questions under OQ-1/OQ-2 (`0835ce0`).
- Tinker's measurement (dispatched via Lintel at Jo's ask, before the ruling) landed:
  `/Users/jowolff/agent-scratch/agent-system-2.0/typesafe-usage/REPORT.md`. Tinker's headline,
  not re-derived by Plumb: 167 requests since 09-21; 36 known tests; 102 from six `find` calls
  (all in OMP's own code); 28 automatic auto-thinking classifications, one per generic `task`
  hand, each sending the hand's brief; 1 Lintel probe. Newdle content reached TypeSafe only via
  7 of the automatic brief classifications, from Verge's dataviz research hands.
- **Open for Jo:** Tinker recommends adding `typesafe` to OMP `disabledProviders` in the default
  profile — keeps the key, stops every TypeSafe path. Plumb's default: yes (nothing 1.x uses it
  by design; 2.0's classifier runs in its own profile). Tinker's surface; Jo's word.
- Next on the docket: Session C at C2.
