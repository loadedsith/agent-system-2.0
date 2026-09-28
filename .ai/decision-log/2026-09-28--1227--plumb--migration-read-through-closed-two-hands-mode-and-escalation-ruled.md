---
date: 2026-09-28
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 halt point 5 — Jo's read-through of MIGRATION.md, interactive walkthrough, two research hands, two gaslights
status: resolved
durable: yes
---

# Migration plan read through and closed; two hands ran; mode selection and autonomous escalation ruled

**CLAIM**
Jo read `MIGRATION.md` end to end (line by line, then as a plain-words walkthrough M0 → M12) and every mismatch was fixed the same turn. `MIGRATION.md` now has **no open fields**. Eighteen commits landed and Jo pushed (`## main...origin/main`, in sync). Nothing from the plan has been executed; opening it is still Jo's word, starting with M0 (ctx `pi`-root registration → Tinker).

## What changed today, in order

**CLAIM**
1. **A2.4 amended — all seats retire at once at the cutover event** (Jo: *"all or nothing"*). M11+M12 collapsed; plugin-disable moved to an optional post-cutover M12 (Jo: *"the 1.x seats are pretty much worthless to me without the plugin"*).
2. **M5 gains the profile-isolation check** (no 1.x hook, plugin hook, or plugin skill fires in a 2.0 session).
3. **Skills manifest (M6) moved before the first workload (M7)** (Jo: *"so when we first turn on 2.x we won't have the skills available?"*).
4. **M5b — upstream skill-pack refresh — added, then run early** on Jo's word (*"run now per your recco"*), one `research` hand on opus-5-5. Report `research/skill-pack-refresh.md`. Pins: Osmani `agent-skills` 0.6.2 → 0.6.11 (361 commits), `impeccable` 3.5.0 → `skill-v4.3.1`, `humanizer` 2.8.0 → v3.1.0; no base skill renamed or removed. **Two rulings:** `obra/superpowers` v6.4.2 `subagent-driven-development` + `executing-plans` vendored as **row #21 `execute-plan`** (build question 8 closed; Jo: *"vendor for the two superpower skills"*); Osmani's new `constraint-driven-development` **split** — Floor + guard-the-bar into row #6 `code-review-and-quality`, the per-repo interview to product repos (Jo: *"going with your recco of split it"*, after two rounds of "what do you mean by split"). Rows #2, #3, #6, #20 amended to the refreshed pins; § C6.4 written; M6 copies by tag into 2.0's own `VENDOR.md`. Jo confirmed the manual refresh loop is accepted (*"we need to do this kind of manual skill update process regardless … just confirming"*).
5. **Mode selection ruled — mode = who is steering** (B13.1): handed off and left = autonomous; Jo opens the lane's session or says "with me"/"plan it" = user-driven; written on the workload row, shown beside stakes, flipped in one word. Gap found by Jo's question *"when does a lane open interactively, when does a lane open autonomously?"*.
6. **Autonomous escalation ruled — the `question` ledger row** (B3 item 5 second trigger): an autonomous lane with no `ask` writes a question row with options; surfaced at once; only that slice pauses; Jo's answer is a ledgered instruction; a second `change` slice on the same question is refused. Gap found by Jo: *"we need machinery in place for an autonomous lane to escalate something to me."* Both as P-11 rows; M4/M5 build lines.
7. **Gaslight (claude + codex; claude leg lost to the plugin's Stop hook overwriting its report, codex returned; header 1/2)** on rulings 5–6 → three completions applied on Jo's "yes": the lane-tier no-wait sentence reconciled with the question row (G1); flip effective before the lane's next turn, surface shows it only once the tool policy matches (G2); question lifecycle — stable id, rendered at wake regardless of last-N, no four-hour timer, ledgered withdrawal replans and never approves (G3). Fixtures added to M4/M5.
8. **Escalation criteria stated for Jo** (must: the P-7b/A4 reserved list; may: the question row under Jo's own safer-and-reversible threshold; never: missing evidence).
9. **M9 HerdR/moshi rows ruled in** (Jo: *"yes we are going to run it"*).
10. **OQ-1 open field struck** — already ruled by Jo 2026-09-24 (*"it's just my account"*); carried into the plan in error. Plumb's error.
11. **Laya vs TypeSafe research hand** (opus-5-5), Jo's request. Laya was run locally on the 30-brief classifier sample: zero-shot 10/30 (english), 11/30, 6/30 vs TypeSafe 23/30; below the 15/30 majority baseline; its confidence flags 24–30 of 30 under the 0.55 threshold; Laya's "outperforms Jev" claim compares a fine-tuned checkpoint to zero-shot Jev. Wire-compatible with OMP `find` via one `models.yml` block. **Ruled: keep TypeSafe; Laya recorded in § A1 as the named local fallback.** Side effect reported: one `find` call to TypeSafe on Jo's key, $0.0009. `/tmp/laya-eval` (3.6 GB) removed.
12. **Interactive-by-default machinery** — Jo asked to solidify their preference for interactive work. A size-cap rule was proposed, kimi-gaslit (verdict: simplify — structural inline-block rule instead), recorded with a one-turn "inline" escape, then **dropped the same session** on Jo's *"why am i doing that? that's going to be annoying"* → *"drop it"*. Two reverts; the P-11 turn-shape row carries a "considered and dropped" note so it is not re-proposed. What stands: the three mechanical turn-shape checks, `ask` as the only decision instrument, commands as logged scripts, P-24 item 1 as prose.
13. **Dormancy period ruled: 90 days from the cutover event** (Jo: *"90 days is fine"*). Last open field closed.

## State

**CLAIM**
`main` in sync with `origin/main` after Jo's push. Manifest: **21 core skills** (§ C6.1). P-11 list: 17 rows (one struck, one with a dropped-rule note). D6 open build questions: 7 (question 8 closed). `MIGRATION.md`: M0–M12 with M5b done, no open fields. Hand clones cleaned: `/tmp/skill-refresh`, `/tmp/laya-eval`. Gaslight run dirs left under `/var/folders/…/T/gaslight/` (system temp; no action).

## Held / carried

**CLAIM**
- Tinker's four housekeeping questions (`/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/REPORT.md:14-40`) — still held.
- Three checks deferred to M6 from the pack refresh: `${CLAUDE_SKILL_DIR}` expansion under OMP; whether OMP's `task` tool satisfies `execute-plan`'s subagent assumption; humanizer pattern-number grep.
- Accessibility research hand (Q-e) — runs at M6 on a model plan + Jo's word; now also compares against `frontend-ui-engineering`'s WCAG scope, `constraint-driven-development`'s axe-core tags, impeccable `reference/audit.md`.

## Candidate lessons

**GUESS** (inference)
- **Receipt on the label line, twice in one day.** Both output-types-guard corrections today were the same slip: `**CLAIM** (hand's receipts, …)` with the receipt inline on the label line instead of the content line. Not a receipt failure — a rendering habit that appears when the receipt is "the whole report" rather than one `file:line`. Check: the label line has nothing after the closing `**`.
- **Sequencing errors are the read-through's yield, and questions are the design's.** Every row-level ruling from Session C held; what Jo's read caught was order (M1→M12, M6↔M7, M5b) and two gaps no row could surface (who sets the mode; how an autonomous lane escalates). A read-through by the person who will run the plan is a distinct review from the rulings pass, and both are needed.
- **A rule proposed to satisfy a stated preference can cost the preference-holder more than it saves.** The inline-block rule was structurally sound (two gaslights agreed) and still wrong, because its escape put a keystroke on Jo every time they wanted content in the chat. The test that would have caught it earlier: who pays when the rule fires as designed?
- **"Split it" needed three explanations.** The first two used the row's own vocabulary (Floor, guard, review lens). The one that landed described the two procedures in plain words and said which file each half goes into. Rulings on unfamiliar upstream text need the plain description first.
- **A gaslight leg can be lost to its own harness.** The claude leg's report was overwritten by the plugin's Stop-hook correction turn; `claude.log` was empty. The manifest's `1/2` header made it legible; a 1/1 read would have hidden a missing lab.

<!-- output-types
tier: 0
CLAIM: 4
CITE: 0
GUESS: 1 (inference 1)
ACTION: 0
PMDW: 0
QUESTION: 0
-->
