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

## § Re-measurement 2026-09-28

Written 2026-09-28 by the `Recalibrate` research hand (Jo: *"Re-measure now"*). Status: **complete** (32/32 classified, 0 errors). The 09-23 sections above are unchanged and describe the superseded question. Output dir: `/Users/jowolff/agent-scratch/agent-system-2.0/migration/M3/recalibrate/` (`results.jsonl`, `briefs-additions.jsonl`, `analysis.txt`, `REPORT.md`).

### Method

**CLAIM**
Question under measurement: the live `classifier/kind-question.json`, the S1-corrected text (change-small = single file with a mechanical check; change-large = more than one file, or no mechanical check; SPEC-2.0.md:37-38). Identity as `classify.ts` computes it (`questionSha256`, sha256 of canonical JSON): `5a72c35cf68f238f5bca23065dbb5e244afecd76a10cc6283a81e44578c16550`. The 09-23 question was `47616267…`. Recorded byte-for-byte as `classifier/test/fixtures/kind-question-2026-09-28.json`.

**CLAIM**
Briefs: the same 30 as 09-23 with their 09-23 hand labels, unchanged (text and label match `classifier/test/fixtures/classifier-sample-30.jsonl` 30/30), plus two **additions** from the M3 review's S1 finding, labelled before any call: `AddTwoFileMechanical` (rename a constant across `route.ts` and its test; `bun test` checks it) and `AddOneFileUncheckable` (rewrite a tier file's opening paragraph; nothing checks it). Both hand-labelled **change-large** per SPEC-2.0.md:37-38.

**ACTION**
Classifier: OMP's `judge_batch`, driven host-side because the measuring hand had no eval tool — `runEvalJudgmentBatch` in `@oh-my-pi/pi-coding-agent/src/eval/judgment-batch-bridge.ts` (OMP 18.3.0), whose items call `judge.judge({ state, questions })`, the same request `classify.ts` makes. `questions` = the question file's object (one choice question `kind`, criteria in the order locate / understand / change-small / change-large / judge); `state` = the brief text. Profile `agent-system-2`, judge role set to `typesafe/jev-1.13.0`. Three batches of ten plus one of two, per-item rows appended to disk as they drained, 20-minute cap. Runner: `…/recalibrate/run-batch.ts`.

**CLAIM**
Every answer reports model `typesafe/jev-1.13.0` (the runner cancels a batch on any other). Jobs and bridge-reported cost: `jdgb-1591e526c4f2a16e` $0.000317394, `jdgb-1591e52f260de9ed` $0.000349566, `jdgb-1591e5335dd44050` $0.000294588, `jdgb-1591e5379ece2b1a` (additions) $0.000052206; total **$0.001014** for 32 judgments (4 judge_batch runs, 0 failed items, so 0 retries). Wall time ≤0.2 s per batch. All 32 answers pass `classify()`'s answer checks and `route()`.

**CLAIM**
The judge role's `typesafe/jev-1.13.0` pin does not resolve in OMP's catalog: the resolved chain is `typesafe/jev-latest` (explicit=false), because the `typesafe` catalog holds only `jev-latest` and `jev-preview`. The versioned model is enforced by the response, not the request.

**CITE**
https://docs.typesafe.ai/models.md (fetched 2026-09-28): "`jev-latest` | `jev-1.13.0`"; "The response's `model` field reports the versioned ID that answered". The extension's check that the answering model is the calibrated one (`classifier/extension.ts`, the `S4` comment in the `tool_call` handler) is therefore the pin that holds.

### Agreement

**CLAIM**
Hand label vs choice: **21/30 = 70.0%** on the original thirty; **2/2** on the additions; **23/32 = 71.9%** overall. Confusion on the thirty (hand → choice): understand→understand 13, locate→locate 3, judge→judge 3, change-small→change-small 2; misses: change-small→change-large 2, change-small→understand 2, understand→change-large 1, understand→judge 1, judge→understand 1, locate→understand 1, change-large→judge 1. Choices on the thirty: understand 17, judge 5, change-large 3, locate 3, change-small 2 (09-23: change-large 0).

### Every disagreement

**CLAIM**

| id | hand_label | choice | confidence | probabilities |
|---|---|---|---|---|
| ResearchSelfImprove | understand | change-large | 0.38 | change-large 0.51, understand 0.47, change-small 0.02 |
| LensAbolishedSeat | judge | understand | 0.51 | understand 0.60, judge 0.29, change-large 0.10, change-small 0.01 |
| LedgerLifecycle | change-large | judge | 0.55 | judge 0.64, change-large 0.29, understand 0.05, change-small 0.02 |
| T1CtxPiRoot | change-small | understand | 0.65 | understand 0.72, locate 0.14, change-small 0.07, judge 0.06, change-large 0.01 |
| ScoutOmpHome | locate | understand | 0.87 | understand 0.90, locate 0.07, change-large 0.03 |
| T3TypeSafeJudge | understand | judge | 0.99 | judge 0.99, understand 0.01 |
| XlabFixes | change-small | change-large | 0.99 | change-large 0.99, change-small 0.01 |
| VocabReword | change-small | change-large | 1.00 | change-large 1.00 |
| T2Phoenix | change-small | understand | 1.00 | understand 1.00 |

The additions agree: `AddOneFileUncheckable` change-large 0.96 (change-large 0.97, change-small 0.03); `AddTwoFileMechanical` change-large 0.73 (change-large 0.79, change-small 0.21).

**CLAIM**
`VocabReword` and `XlabFixes` each edit two files (`PREFERENCES.md` and `REQUIREMENTS.md`; their brief text names both), which SPEC-2.0.md:37-38 rules change-large. The 09-23 hand labels, kept unchanged here, call them change-small.

**GUESS**
Those two labels followed the 09-23 question's "a handful of files" wording, so these two "misses" are the corrected question applying the ruled taxonomy. Relabelled per the SPEC (not done — the brief keeps the labels) the thirty would read 23/30 for 09-28 and 21/30 for 09-23. The threshold is unaffected: both sit at 0.99–1.00, above every threshold swept.

**GUESS**
`ResearchSelfImprove` ("Write `research/phase4/research-G-self-improvement.md`") flipped to change-large because the new change-large criterion says "write anything that no test or diff can mechanically check", and a research brief writes a report file no test checks; understand's "without writing to it" does not carve that out. Change-large mass on the 15 hand-understand briefs went from mean 0.000 to 0.065 (ResearchSelfImprove 0.51, TypeSafeTerms 0.29). A criterion edit would need another sample; not tested.

### Confidence distribution (0.05 buckets, original thirty)

**CLAIM**

| bucket | n | histogram | agree | disagree |
|---|---|---|---|---|
| 0.20-0.25 | 1 | # | 1 | 0 |
| 0.30-0.35 | 1 | # | 1 | 0 |
| 0.35-0.40 | 2 | ## | 1 | 1 |
| 0.45-0.50 | 1 | # | 1 | 0 |
| 0.50-0.55 | 2 | ## | 1 | 1 |
| 0.55-0.60 | 1 | # | 0 | 1 |
| 0.60-0.65 | 2 | ## | 2 | 0 |
| 0.65-0.70 | 2 | ## | 1 | 1 |
| 0.75-0.80 | 1 | # | 1 | 0 |
| 0.85-0.90 | 3 | ### | 2 | 1 |
| 0.90-0.95 | 2 | ## | 2 | 0 |
| 0.95-1.00 | 12 | ############ | 8 | 4 |

Median 0.87 (09-23: 0.93); 14 of 30 at ≥0.90 (09-23: 18); 7 of 30 below 0.55 (09-23: 5). With the additions (0.73, 0.96): 0.70-0.75 and 0.95-1.00 gain one each.

### Threshold sweep

**CLAIM**
Flag = confidence strictly below the threshold, over the original thirty, same columns as 09-23. The rightmost column is new: briefs whose routed tier (higher-of-top-two when flagged, `route()` rules, no stakes cap) sits below the tier of their hand label.

| threshold | flagged (of 30) | disagreements caught | false flags | disagreements missed | under-served |
|---|---|---|---|---|---|
| 0.45 | 4 (13%) | 1/9 | 3 | LensAbolishedSeat, VocabReword, ScoutOmpHome, LedgerLifecycle, T2Phoenix, T3TypeSafeJudge, T1CtxPiRoot, XlabFixes | 1 (LensAbolishedSeat) |
| 0.50 | 5 (17%) | 1/9 | 4 | LensAbolishedSeat, VocabReword, ScoutOmpHome, LedgerLifecycle, T2Phoenix, T3TypeSafeJudge, T1CtxPiRoot, XlabFixes | 1 (LensAbolishedSeat) |
| 0.55 | 7 (23%) | 2/9 | 5 | VocabReword, ScoutOmpHome, LedgerLifecycle, T2Phoenix, T3TypeSafeJudge, T1CtxPiRoot, XlabFixes | 0 |
| 0.60 | 8 (27%) | 3/9 | 5 | VocabReword, ScoutOmpHome, T2Phoenix, T3TypeSafeJudge, T1CtxPiRoot, XlabFixes | 0 |
| 0.65 | 10 (33%) | 3/9 | 7 | VocabReword, ScoutOmpHome, T2Phoenix, T3TypeSafeJudge, T1CtxPiRoot, XlabFixes | 0 |
| 0.70 | 12 (40%) | 4/9 | 8 | VocabReword, ScoutOmpHome, T2Phoenix, T3TypeSafeJudge, XlabFixes | 0 |
| 0.75 | 12 (40%) | 4/9 | 8 | VocabReword, ScoutOmpHome, T2Phoenix, T3TypeSafeJudge, XlabFixes | 0 |
| 0.80 | 13 (43%) | 4/9 | 9 | VocabReword, ScoutOmpHome, T2Phoenix, T3TypeSafeJudge, XlabFixes | 0 |
| 0.85 | 13 (43%) | 4/9 | 9 | VocabReword, ScoutOmpHome, T2Phoenix, T3TypeSafeJudge, XlabFixes | 0 |
| 0.90 | 16 (53%) | 5/9 | 11 | VocabReword, T2Phoenix, T3TypeSafeJudge, XlabFixes | 0 |

**CLAIM**
With the two additions the flag counts are identical up to 0.70 (neither is below 0.73) and one higher from 0.75; the disagreement set is the same nine. On the 09-23 question the under-served column is 0 at every threshold.

### Threshold

**CLAIM**
Recommended: **0.55 — it still holds.** It is the lowest threshold with no under-served brief: at 0.50, `LensAbolishedSeat` (hand judge, read understand at 0.51) routes to standard instead of deep. By the 09-23 count criterion alone the knee is 0.60 (+1 flag for +1 catch from 0.55; every later catch costs 2 or more flags), but the one catch it adds is `LedgerLifecycle` at exactly 0.55, which routes to deep with or without the flag (choice judge; top two judge / change-large). Routed tiers at 0.55 and 0.60 are identical on all 32 briefs (`tiers-diff.ts`: 0 differences), so the sample cannot tell them apart and 0.55 needs no code or spec number change.

**CLAIM**
The corrected question makes the flag less precise: at 0.55, 5 of 7 flags are false (09-23: 1 of 5), and over-served briefs (routed above the hand label's tier) rise from 3 to 10 of 30. The new false flags are correct answers at lower confidence: `ScoutSkills` locate 0.72→0.24 and `ScoutSeatHomes` 0.71→0.50 (both pulled fast→strong), `Phase5Agenda` change-small 0.68→0.33 and `ExtSqliteTest` 0.78→0.45 (both standard→strong), `LedgerThirdParty` judge 0.36.

**GUESS**
The cost of that is more strong-tier spawns for locate and single-file work, not wrong work; production B9 briefs name their files and checks explicitly, so the locate/change-small confidence drop may not carry over. n=30+2 with three change-large and four judge labels is still thin; the P-16 month-one re-measure from ledger pull-ups stands.

### Paired comparison, same thirty briefs

**CLAIM**

| measure (30 briefs, hand labels unchanged) | 09-23 question `47616267…` | 09-28 question `5a72c35c…` |
|---|---|---|
| agreement | 23/30 (76.7%) | 21/30 (70.0%) |
| paired: both agree / 09-23 only / 09-28 only / neither | 20 / 3 / 1 / 6 | (same pairs) |
| same choice on both | 26/30 | 26/30 |
| median confidence; ≥0.90; <0.55 | 0.93; 18; 5 | 0.87; 14; 7 |
| change-large chosen | 0 | 3 |
| flagged at 0.55 / of them disagreements / false flags | 5 / 4 / 1 | 7 / 2 / 5 |
| under-served at 0.55 / over-served at 0.55 | 0 / 3 | 0 / 10 |
| cost (30 briefs) | $0.000966 | $0.000962 |

**CLAIM**
The four briefs whose choice changed: `ResearchSelfImprove` understand 0.93 → change-large 0.38, `VocabReword` change-small 0.98 → change-large 1.00, `XlabFixes` change-small 1.00 → change-large 0.99 (these three agree only on 09-23), `LedgerThirdParty` understand 0.43 → judge 0.36 (agrees only on 09-28). The six missed by both: `LensAbolishedSeat`, `ScoutOmpHome`, `LedgerLifecycle`, `T1CtxPiRoot`, `T2Phoenix`, `T3TypeSafeJudge` — the two vocabulary-driven misses at 0.98–1.00 are unchanged, as the 09-23 section predicted a threshold could not fix them.

### Files

- `classifier/test/fixtures/kind-question-2026-09-28.json` — the measured question, byte-for-byte
- `classifier/test/fixtures/classifier-sample-2026-09-28.jsonl` — 32 recorded rows (meta line carries the question sha256 and job ids); the offline replay (`classifier/test/replay.test.ts`) answers from it
- `classifier/calibration.json` — now names this question, judge, and sample; the 09-23 record is kept under `superseded`
- `/Users/jowolff/agent-scratch/agent-system-2.0/migration/M3/recalibrate/results.jsonl` — 32 raw rows as drained (job, batch, cumulative batch cost, model, raw answer)
