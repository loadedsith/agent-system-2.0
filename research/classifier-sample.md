# Classifier sample — work-kind confidence on 30 real slice briefs

Written 2026-09-24T01:31:09.793062+00:00. Status: **complete** (30/30 classified, 0 errors). Output dir: `/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/`.

## Needs you

**CLAIM**
Recommended low-confidence threshold: **0.55** (see § Threshold; the receipt is the sweep table, computed from `/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/results.jsonl`). No spec edit made.

**GUESS**
Two of the seven disagreements sit at confidence 0.98–0.99 and no threshold catches them; both look like the brief's *vocabulary* misleading the classifier (one brief literally says "run one `judge()` call"; one says "start Phoenix … report whether OMP emits spans", which reads as observation). A threshold cannot fix those; a "does the brief change state?" hint in the instructions might. Not tested.

## Method

**ACTION**
Sources, in the order the brief named them. (1) First user message of every Plumb subagent transcript under `/Users/jowolff/.omp/agent/seat-sessions/plumb/*/*.jsonl` (29 hands across three sessions; the extraction is the `prompts` cell in this session's eval kernel — each row's `source` field in `briefs.jsonl` carries the absolute path and line). (2) The three Phase 5 prerequisite tests Plumb sent by `seat_message` at `/Users/jowolff/.omp/agent/seat-sessions/plumb/2026-09-23T23-46-38-534Z_01a0d0aa-0546-7000-91dd-fc66a43838ee.jsonl:53`, split into one brief each. (3) The ledger-lifecycle hand brief at `/Users/jowolff/agent-scratch/agent-system-2.0/ledger-lifecycle/BRIEF.md` (lines 1,12-27 as one brief; lines 38-39 as a second). (4) `ctx search --limit 20 -- "dispatch"` was run first (ctx-first gate); its hits were Newdle/orchestrator sessions and yielded no usable 2.0 brief. `briefs/*.md` and the decision-log "Heads-up" sections were read and found to duplicate the hand prompts already collected; not sampled separately.

**ACTION**
Trimming: prompts over 1500 chars were cut at the `# Acceptance` heading or the last line break before 1500 chars; nothing was rewritten. Boilerplate `Complete assignment thoroughly:` was dropped.

**ACTION**
Data-boundary exclusions (regex `shipyard/repos|newdle-|newdle\b|kitchen|data-pipelines`): `ReaderRuleTrace`, `ScoutClaudeHome`, `ScoutPlugins`, `LensOmpFloor` excluded — their text names Newdle plugin files or paths under `/Users/jowolff/code/shipyard/repos/`. "If in doubt, exclude" applied.

**CLAIM**
Hand labels were written to `briefs.jsonl` before any classifier call (file mtime precedes the first `judge_batch` job `jdgb-158b8f7d1395cceb`). Hand-label spread: {'understand': 15, 'locate': 4, 'judge': 4, 'change-small': 6, 'change-large': 1}. **change-large has one example** (the ledger-lifecycle build); the other hand briefs on this machine are research, reader, scout, and small-edit hands. No brief was invented.

**CLAIM**
Classifier: `judge_batch` from the eval kernel, one choice question, five criteria in the order locate / understand / change-small / change-large / judge with the spec definitions. Three batches of 10. Model reported by `b.status()`: `typesafe/jev-1.13.0` for all three. Cost by batch: $0.000319, $0.000351, $0.000296; total **$0.00097** for 30 briefs. Wall time per batch ≤0.4 s. Job ids: `jdgb-158b8f7d1395cceb`, `jdgb-158b8f819d15ccec`, `jdgb-158b8f81fc55cced`. The `cost` field on each `results.jsonl` row is the batch's cumulative `status().cost` at the moment that row drained, not a per-item cost.

## Confidence distribution (0.05 buckets)

**CLAIM**
From `results.jsonl`, `confidence` field (TypeSafe's own confidence; note it is not the top probability — e.g. `ProbeHaiku` has p(understand)=0.65 and confidence 0.56).

| bucket | n | histogram | agree | disagree |
|---|---|---|---|---|
| 0.40-0.45 | 4 | #### | 1 | 3 |
| 0.50-0.55 | 1 | # | 0 | 1 |
| 0.55-0.60 | 1 | # | 1 | 0 |
| 0.65-0.70 | 1 | # | 1 | 0 |
| 0.70-0.75 | 2 | ## | 2 | 0 |
| 0.75-0.80 | 1 | # | 1 | 0 |
| 0.80-0.85 | 1 | # | 0 | 1 |
| 0.85-0.90 | 1 | # | 1 | 0 |
| 0.90-0.95 | 5 | ##### | 5 | 0 |
| 0.95-1.00 | 13 | ############# | 11 | 2 |

Median confidence 0.93; 18 of 30 at ≥0.90; 5 of 30 below 0.55.

## Agreement

**CLAIM**
Hand label vs classifier choice: **23/30 agree = 76.7%**. Confusion (hand → choice): understand→understand 14, change-small→change-small 4, locate→locate 3, judge→judge 2; disagreements: judge→understand 2, change-small→understand 2, locate→understand 1, change-large→judge 1, understand→judge 1. The classifier's choices: understand 19, change-small 4, judge 4, locate 3, change-large 0.

## Every disagreement

**CLAIM**

| id | hand_label | choice | confidence | probabilities |
|---|---|---|---|---|
| T1CtxPiRoot | change-small | understand | 0.40 | understand 0.52, locate 0.32, change-small 0.11, judge 0.05 |
| LensAbolishedSeat | judge | understand | 0.42 | understand 0.54, judge 0.46 |
| LedgerThirdParty | judge | understand | 0.43 | understand 0.54, judge 0.45, change-small 0.01 |
| LedgerLifecycle | change-large | judge | 0.52 | judge 0.62, change-large 0.24, understand 0.13, change-small 0.01 |
| ScoutOmpHome | locate | understand | 0.82 | understand 0.85, locate 0.15 |
| T3TypeSafeJudge | understand | judge | 0.98 | judge 0.98, understand 0.02 |
| T2Phoenix | change-small | understand | 0.99 | understand 1.00 |

**GUESS**
Reading each: `T1CtxPiRoot` (run `ctx sources add`, report a search) — the classifier read "report" and called it understand; the hand label change-small is defensible but the brief is a test, and neither label is clearly right. `LensAbolishedSeat` and `LedgerThirdParty` — judge vs understand is the classifier's soft boundary: a comparison with a bottom line was read as research. `LedgerLifecycle` — the only change-large in the set; the classifier gave change-large 0.24 and judge 0.62 because the deliverable is a comparison table with "no recommendation". `ScoutOmpHome` (enumerate files, write rows) — read as understand at 0.82, the only high-ish-confidence miss that is plainly a locate. `T3TypeSafeJudge` — the text says `judge()`; keyword capture. `T2Phoenix` — "start Phoenix … report whether OMP emits spans" read as observation at 0.99; my change-small rests on the start-a-service step.

## Where disagreements cluster

**CLAIM**
Disagreement confidences: 0.40, 0.42, 0.43, 0.52, 0.82, 0.98, 0.99. Four of seven sit in 0.40–0.52. In the band below 0.55 there are 5 briefs and 4 are disagreements (80% error). In 0.55–0.85 there are 8 briefs and 1 disagreement (12.5%). At ≥0.85 there are 17 briefs and 2 disagreements (11.8%), both at ≥0.98 and both vocabulary-driven.

## Threshold sweep

**CLAIM**
Flag = confidence strictly below the threshold. Computed over `results.jsonl`.

| threshold | flagged (of 30) | disagreements caught | false flags | disagreements missed |
|---|---|---|---|---|
| 0.45 | 4 (13%) | 3/7 | 1 | ScoutOmpHome, LedgerLifecycle, T3TypeSafeJudge, T2Phoenix |
| 0.50 | 4 (13%) | 3/7 | 1 | ScoutOmpHome, LedgerLifecycle, T3TypeSafeJudge, T2Phoenix |
| 0.55 | 5 (17%) | 4/7 | 1 | ScoutOmpHome, T3TypeSafeJudge, T2Phoenix |
| 0.60 | 6 (20%) | 4/7 | 2 | ScoutOmpHome, T3TypeSafeJudge, T2Phoenix |
| 0.65 | 6 (20%) | 4/7 | 2 | ScoutOmpHome, T3TypeSafeJudge, T2Phoenix |
| 0.70 | 7 (23%) | 4/7 | 3 | ScoutOmpHome, T3TypeSafeJudge, T2Phoenix |
| 0.75 | 9 (30%) | 4/7 | 5 | ScoutOmpHome, T3TypeSafeJudge, T2Phoenix |
| 0.80 | 10 (33%) | 4/7 | 6 | ScoutOmpHome, T3TypeSafeJudge, T2Phoenix |
| 0.85 | 11 (37%) | 5/7 | 6 | T3TypeSafeJudge, T2Phoenix |
| 0.90 | 12 (40%) | 5/7 | 7 | T3TypeSafeJudge, T2Phoenix |

## Threshold

**CLAIM**
Recommended: **0.55**. Reasoning: it is the knee of the sweep — at 0.55 the classifier flags 5 of 30 briefs (17%), catches 4 of the 7 disagreements, and produces 1 false flag (the 0.42-confidence `LedgerCandidates`, a judge/understand tie the classifier resolved correctly). Raising the threshold to 0.85 flags 11 briefs (37%) to catch one more disagreement (`ScoutOmpHome` at 0.82); the two remaining misses at 0.98/0.99 are unreachable by any threshold. Lowering to 0.50 loses `LedgerLifecycle` (0.52), the only change-large in the sample, which is the kind the spec most needs routed correctly.

**GUESS**
n=30 with one change-large and four judge examples is thin for the judge/understand and change-large boundaries — the two boundaries where all the low-confidence disagreements live. The 0.55 number is a measured knee on this sample, not a calibrated estimate; a second sample of 30 drawn from hands that *build* things (none exist yet on this machine for 2.0) would move the change-large row and might move the knee.

## Files

- `/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/briefs.jsonl` — 30 rows (id, source, text, hand_label)
- `/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/results.jsonl` — 30 rows (id, hand_label, choice, confidence, probabilities, cost, model)
- `/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/PROGRESS.md` — last written after batch 3
- `/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/REPORT.md` — this file
