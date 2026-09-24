# Gaslight — B2 proposed homegrown-SQLite ledger (SPEC-2.0.md § B2, "Proposed 2026-09-23")

**Scope:** explicit `--paths` — `SPEC-2.0.md`, `research/ledger-candidates.md`, `research/ledger-candidates-third-party.md`, `REQUIREMENTS.md`, `PREFERENCES.md`; grounding live repo, all legs symmetric; HEAD `7b2f09a` (proposal paragraph uncommitted in the working tree, identical to frozen evidence — every leg checked this).
**Run dir:** `/var/folders/ry/rn93xvbd51j3k60vt0cy13vh0000gn/T/gaslight/b2-ledger-20260923-175502/`
**Legs:** no `manifest.txt` — the wrapper shell was cut at 300 s before the script wrote it. Per-leg status from the run dir:
- claude: script recorded `no-report (186s)` — the leg's stdout carried only a post-hoc self-check because the output-types-guard Stop hook fired inside `claude -p` and only the final turn is printed. The full report was recovered verbatim from the session transcript (`~/.claude/projects/-Users-jowolff-code-agent-system-2-0/3c3dda18-….jsonl`) → `claude-recovered-run1.md`. A byte-identical re-run reproduced the same failure and a second report (`claude-recovered-run2.md`), used only where noted.
- codex: ok (`codex.md`, 14 KB).
- kimi: ok (`kimi.md`, 13 KB).
- **returned: 3/3 selected** (claude by transcript recovery, stated above).

## Landed critiques

### [G1] coherence / problem fit — "no custom CLI" contradicts B8 and the no-lock-in constraint, and raw `sqlite3` is not a safe writer (labs: claude, codex, kimi — 3/3)
**Where:** `/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md:239-240` (proposal), `:233-234` (constraint: "unless the schema is documented and a standalone CLI exists"), `:342-343` (B8 lists ledger "schema, module, and CLI" as machinery).
**The charge:** as written the spec contradicts itself in two places (Plumb wrote both). Beyond wording: the state-order rule (held→delivered→consumed→acted-on) and provenance-always-filled would live in the TypeScript module, so a `sqlite3` writer bypasses them — open *read*, unsafe *write*.
**What the receipt shows vs the conclusion:** the textual contradiction is confirmed by all three. That a raw writer would corrupt state is shape-recognized (no bypass demonstrated — codex).
**Confirmed or shape-recognized:** contradiction confirmed; corruption GUESS(inference).
**What is lost if this critique is wrong:** a wording edit.
**Smaller/cleaner version — the three legs disagree on the remedy, not the defect:**
- claude: put the rules in the file — `CHECK` constraints + `BEFORE UPDATE` trigger; **live-tested in `bun:sqlite`** (`consumed:illegal transition | delivered:ok | held:illegal transition | consumed:ok | acted_on:ok | bogus:illegal transition`, exit 0). Then "no custom CLI" is true; edit B8 to "schema and module". (run2 self-retracted an unreceipted side-claim about Postgres trigger syntax; the SQLite test stands.)
- codex: one ledger module whose operations are callable without OMP (an independent Bun program); the extension is one adapter; raw `sqlite3` is inspection/repair only; acceptance test = same valid and invalid transition through an OMP client and a non-OMP client.
- kimi: ship a thin `bun ledger` CLI as machinery.
**Severity:** rework (small).

### [G2] scope / reversibility — the Beads fallback trigger is mis-scoped (labs: claude, codex, kimi — 3/3)
**Where:** `SPEC-2.0.md:240-241` vs `:230-231`.
**The charge:** the constraint weights multi-user/multi-machine broadly; the fallback fires only on "live concurrent multi-user writes across machines". That skips sequential transfer between machines and asynchronous collaboration (codex), and the one case it names is one Beads cannot meet without a shared `dolt sql-server` — a hosted service, which `:216` forbids being mandatory (claude, CITE https://beads.gascity.com/architecture/index.md "Server mode needed for concurrent writers", "No real-time collaboration"; dolt.md "Embedded mode is single-writer (enforced via file lock)").
**Confirmed or shape-recognized:** mismatch confirmed by text; "hosted" reading of a shared Dolt server is claude's GUESS.
**What is lost if this critique is wrong:** a reworded clause.
**Smaller/cleaner version:** state the v1 topology explicitly (local ledger, local processes share it); name the three collaboration needs separately (transfer, async sync, live multi-writer); keep Beads a candidate, re-examined when records first cross machines; keep a tested backup/restore as the exit path (codex).
**Severity:** simplify.

### [G3] necessity — state locality is unanswered and the obvious shortcut fails (labs: claude, codex, kimi — 3/3 in different forms)
**Where:** `SPEC-2.0.md:230`, `:348` (B8 hands "whether state can travel" to B2); proposal's "fixed path" `:238`.
**The charge:** the proposal never says whether ledger state moves between machines in v1. claude: a synced/network folder is ruled out — CITE https://www.sqlite.org/wal.html "All processes using a database must be on the same host computer; WAL does not work over a network filesystem", and Bun recommends WAL. kimi: a hard-coded absolute path breaks on any other machine — default under `$HOME`, env-overridable, listed in the install manifest.
**Confirmed or shape-recognized:** WAL limit CITE-confirmed; the rest wording.
**What is lost if this critique is wrong:** one sentence and one config knob.
**Smaller/cleaner version:** "The ledger file is local state and does not sync in v1 (P-15); it must not live on a network or synced folder; path defaults under `$HOME`, overridable; cross-machine is a later JSONL-to-git-ref export."
**Severity:** simplify.

### [G4] the loaded-extension `bun:sqlite` import is untested (labs: kimi landed; claude and codex each refuse to clear it — 3/3)
**Where:** `SPEC-2.0.md:238`; `research/ledger-candidates.md:76`, `:392-393`.
**The charge:** every test so far ran in plain Bun. OMP core imports `bun:sqlite` in 20 files (claude grep) and docs say extensions run in-process (kimi, https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md:270), which supports but does not prove it.
**Confirmed or shape-recognized:** GUESS(pattern); gap recognized, not a failure.
**What is lost if this critique is wrong:** a one-hour throwaway test.
**Smaller/cleaner version:** throwaway extension under the `agent-system-2` profile opening an in-memory `bun:sqlite` on `session_start`. Gate, not a redesign.
**Severity:** rework (verification only).

### [G5] problem fit — the research proves SQLite's convenience, not lower maintenance, and one Beads exclusion is wrong (labs: codex, kimi — 2/3; claude disagrees, see D1)
**Where:** `research/ledger-candidates.md:29-36`, `:438-450`; `research/ledger-candidates-third-party.md:50-65` ("The judgement that this outweighs their sync features is a GUESS, not a measurement").
**The charge:** the criteria (custom columns, single-statement SQL, in-process access) make SQLite win by construction and do not answer the maintenance objection; the comparison omits the application behaviour Jo owns under either choice (transitions, provenance, retries, schema changes, recovery, wake rendering). None of the six third-party binaries were ever run (kimi re-confirmed `which`). And the research's claim that Beads' query language cannot filter metadata is contradicted by Beads source — CITE pinned https://raw.githubusercontent.com/gastownhall/beads/16871ee…/internal/query/parser.go and evaluator.go recognise `metadata.<key>` equality (codex). That does not establish timestamp aggregation or a working integration.
**Confirmed or shape-recognized:** the criteria and the metadata mis-claim are confirmed; "Beads is cheaper to maintain" is *not* asserted — codex says explicitly the receipts do not establish it.
**What is lost if this critique is wrong:** about a day of hand time on a comparison that SQLite may win anyway.
**Smaller/cleaner version (codex):** one representative lifecycle run through both — open a workload, attach a slice, advance a message through four states, record provenance, restart and render wake, restore from backup; include one interrupted transition and one competing lane claim; compare the custom code and recovery procedure each needs; reuse as P-4 acceptance evidence. Beads may use `bd --json` plus a small TypeScript reduction — do not require one SQL statement.
**Severity:** rework (of the selection argument).

### [G6] SQLite single-writer / busy handling unaddressed (labs: kimi — 1/3)
**Where:** implied by SQLite; not in the proposal.
GUESS(pattern). Open with WAL, serialise writes through the module. claude's run2 retracted its own `busy_timeout` sentence as reaching past its receipt. Severity: simplify; a few lines.

## Disagreements across labs

### [D1] Is Beads fairly excluded for this owner? — cleared by claude; landed as under-evidenced by codex and kimi
- **claude C1 (clear):** CITE dolt.md — embedded Beads is single-writer under a file lock; the spec runs many workloads at once (`SPEC-2.0.md:68`), so even solo Jo needs `dolt sql-server` — a daemon to run and supervise. Beads leaves the 2.0-specific work in place (wake render, verified-read gate, provenance, message-state rules) and adds a Go binary, a Dolt daemon, and the mapping onto `bd set-state`. CLAIM via GitHub API: 11 release tags since 2026-06-26 (v1.1.0 07-04, v1.2.1 08-11, v1.3.0 09-15, v1.3.1-rc.1 09-21) — a fast-moving upstream to track. **Clearance test:** none of this is in the artifact (the research never made the many-lanes-vs-single-writer argument, nor the release cadence) → counts. What is lost if wrong: colleagues needing tracker features get them via export/migration later, not from day one.
- **codex G1 / kimi G6 (land):** the comparison never ran Beads; the metadata exclusion was wrong; "custom is cheaper" is unmeasured. Remedy: the bounded lifecycle comparison in G5.
- Both sides carry receipts. Handed over unresolved: **rule now on the doc-level evidence, or spend one bounded hand-day running the lifecycle through both before ruling.**

## Cleared concerns

### [C1] "Go Beads is no longer actively maintained" (research caveat) — refuted (claude)
CLAIM via `curl https://api.github.com/repos/gastownhall/beads` → `pushed_at: 2026-09-23T12:46:48Z`, `archived: False`, 27,392 stars, MIT. Cites what the artifact does not say (the research left it unresolved). Counts. If wrong: nothing changes — D1 does not depend on it.

### [C2] "No ledger at all" — the ledger requirement itself holds (all three)
`PREFERENCES.md:488-500` index-plus-ledger ruling; `SPEC-2.0.md:169-175` ledger authoritative for open workloads; B7 wake source. Removing it removes required behaviour. (Restates the artifact — reading-comprehension clearance, listed for completeness, weight zero. codex adds the sharper point: the *requirement* holds; a *custom* implementation does not follow from it.)

### [C3] OMP memory backends correctly ruled out; `bun:sqlite` present and working on this machine (kimi, codex probes: `{"v":"3.51.0"}`, `foreign_keys: 0`)
Restates the research. Weight zero except codex's note that foreign-key enforcement is per-connection (CITE https://sqlite.org/foreignkeys.html) — the module must `PRAGMA foreign_keys=ON` on every open.

## Held up under pressure
- **A store with these columns is the smallest thing that answers B3's two queries** — all three; SQLite is "a credible local substrate" (codex CITE bun transactions, sqlite whentouse).
- **Schema in the repo as machinery, contents as state** — coherent with B8 (kimi, claude).
- **The minimal delta is already close:** one file, one schema, one module, no daemon; G1–G4 are wording and schema changes (claude).
- **clu is not a drop-in** (codex CITE clu schema/sync docs: mailbox rows expire, coordination events not exported, same-second sync conflicts).

## Verdict
**Simplify-and-verify, with one open ruling.** Two of three legs keep SQLite ("keep, simplified" — claude; "simplify" — kimi); codex withholds the selection until one bounded lifecycle comparison against Beads has been run, and kimi partly agrees the exclusion is doc-only. All three agree on the four fixes regardless of engine: (1) resolve the writer contract — rules in the schema (tested) or a non-OMP-callable module, and fix B8's "CLI" wording in the same edit; (2) reword the Beads trigger and name the three collaboration needs; (3) state v1 = local state, not on a synced folder, path configurable; (4) gate on the loaded-extension `bun:sqlite` test. Single highest-value change: (1). Whether to spend a hand-day on the Beads lifecycle comparison before ruling is D1 and is Jo's call.

<!-- output-types
tier: 0
CLAIM: 9
CITE: 9
GUESS: 8 (inference 7, pattern 1)
ACTION: 0
PMDW: 0
QUESTION: 1
-->
