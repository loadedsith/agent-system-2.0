---
date: 2026-09-23T16:42-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Wrap-up — pre-Phase-5 rulings, Phase 5 agenda, TypeSafe research; Phase 5 not opened
status: resolved
durable: false
---

## What changed

Eleven commits on `main` today, all pushed by Jo through `4109f2c`; this wrap-up adds one more.
The 13:40 entry (`2026-09-23--1340--plumb--pre-phase-5-rulings-triple-check-and-cross-lab-review.md`)
covers the morning; this entry covers what landed after it.

- **Two cross-lab rulings** (`730c3dc`): raising a workload's ceiling joins the P-7b reserved list
  (orchestrator sets and may lower; raising is Jo's); the orchestrator has **no hands of its own**
  — all work happens inside a lane, P-7b "opens hands" reworded to "requests work from lanes".
- **Phase 5 agenda** (`2978896`, order ruled "stands" in `f6c3357`): `briefs/phase5.md` —
  three prerequisite tests, Session A (P-9 taxonomy, P-3 cutover, P-7c threshold, P-7b command
  list), Session B (remaining open columns + held decisions), Session C (P-10 keep/change/drop in
  eight batches, 108 rows, default "drop unless argued for"), then design and migration, halt
  points, `JO-INPUT.md` coverage.
- **P-19 and P-20** (`4ca18af`): the agenda's coverage table found two of Jo's five `JO-INPUT.md`
  requirements with no P-item. P-19 *OMP is the runtime* (strong form: nothing depends on Claude
  Code, HerdR, or the plugin, cutover included; settles the held "OMP-native from first lane").
  P-20 *Work is done in slices* (slice = hand-sized unit: one hand, one done-condition, one ledger
  entry, closed by machinery-written state). Repo ownership (`thewolff`) folded into P-15.
- **TypeSafe research** (`c675e31`, Opus 5.5 hand): `research/typesafe-ai.md`. OMP integrates
  TypeSafe natively as the `judge` model role (default chain `typesafe/jev-latest, @tiny, @smol,
  @default`), no Claude Code in the path. Jo ruled the **2.0 OMP profile contains their TypeSafe
  API key** (`4109f2c`); classifier candidate recorded under P-9; timed `judge()` call is early
  Phase 5 test 3 / agenda T3. Jo removed the prose skill at `~/.claude/skills/typesafe-ai` (a
  Claude Code artifact 2.0 does not use).
- **Review artifacts landed in the repo** (this commit): `research/review-2026-09-23/` — the three
  triple-check lens reports, `synthesis.md`, and the cross-lab runner, prompts, and outputs. They
  previously lived only in `/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/`, which is
  unversioned; the 13:40 entry's scratch paths still resolve but the repo copy is canonical.

## Decisions made (and why)

- **No hands for the orchestrator.** Jo: *"many of the problems i have with lintel is it spawns
  its own hands. all work should happen within a lane."* One dispatch path is easier to observe
  (P-4) and to ceiling (P-9); orchestration chores too large for a turn open as a workload.
- **Ceiling raises reserved.** Otherwise the orchestrator could raise the number instead of asking
  and P-7b item 2 guards nothing.
- **P-19 strong form over "works with OMP, others alongside".** It is what Jo's sentence says;
  P-18 already removes the plugin; the OMP-floor lens found native equivalents for every 1.x
  mechanism relied on.
- **Slice = hand-sized, not lane-sized.** Gives P-8b and P-4 a unit to close on. Open: brief's
  minimum fields; leaf-only vs sub-slices (Plumb's GUESS: leaf only).
- **Agenda before opening the phase, instead of harness plan mode.** Plan mode is read-only and
  would hold rulings in scrollback; the interview needs capture-as-you-go. The agenda gives the
  whole shape up front and is rejectable per item.
- **TypeSafe credential in the 2.0 profile.** Jo's call; the DPA/privacy terms were not fetched
  (slice briefs carry repo text) — see heads-up.

## Dead ends — don't retry these

- `zsh -n` on a script containing `gh api -X PUT` is refused by the careful guard; stub the line to
  syntax-check.
- The Kimi leg must run in an empty scratch cwd; inside the repo it can read files outside the
  prompt and the isolation is lost.
- Harness plan mode for Phase 5 — rejected for the reason above; do not re-propose.

## Heads-up for whoever touches this next

- **Phase 5 is not open.** Jo opens it in a fresh session. First moves: hand the three prerequisite
  tests (ctx `pi`-root registration; Phoenix/OTel; timed TypeSafe `judge()` call) to Lintel →
  Tinker; then agenda Q1, the P-9 work-kind taxonomy. Read `interview-me` and
  `spec-driven-development` first.
- **Four decisions still held for Jo** (`briefs/phase5.md` § Batch B4; `PREFERENCES.md` interview
  log 2026-09-23): reserved list closed at five with P-4 sign-off; OMP memory backends as P-13
  candidates; "remote push" → protected-branch push/deploy; P-16→P-15 dependency status.
- **TypeSafe data terms unread.** The researcher flagged that slice briefs carry repo text and the
  DPA/MCA/privacy pages linked from the docs were not fetched. One fetch; do it before the key goes
  into a profile that sends briefs.
- **Thirteen of sixteen agenda questions have no recorded recommendation** — that is where Jo's
  thinking time goes; the rest is yes/no on carried defaults.
- **Summary rows drift.** Three of today's cross-lab findings were `REQUIREMENTS.md` rows that no
  longer matched their `PREFERENCES.md` entries after a reword. Diff the two after every reword.
- `research/phase4/research-D-best-in-class-survey.md` contains non-UTF-8 bytes; use `LC_ALL=C`.
- Untracked hook-written `.ai/.gitignore` and `.ai/decision-log/.gitignore` are not Plumb's.
- Lintel was notified of today's rulings by `seat_message` at 13:41 (delivered); this wrap-up is
  not re-sent.
