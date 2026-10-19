---
title: A review hand's findings block is read from its final assistant text when its yield and its .md carry none, and the review brief shows a complete block
status: building
workload: wl-mv654hoqwpfhmo
pr: none
---
Workload `wl-mv654hoqwpfhmo` (production stakes), PR-K of its plan (`~/agent-scratch/agent-system-2.0/wl-mv654hoqwpfhmo/PLAN.md` § 10, approved by Jo). Item 9 of the plan's brief asks to fix the Kimi parse first: Kimi review rounds were recorded `blocking unknown` far more often than OpenAI's.

**The split (A10, `~/agent-scratch/agent-system-2.0/scratch/wl-mv654hoqwpfhmo/A10-SPLIT.md`, read from the ledger and the hands' session files on 2026-10-19).** 241 review rounds ran on Kimi; 157 were recorded `blocking unknown` (OpenAI: 12 of 657).
- 52 had no reply, which no parser fixes: 40 Moonshot 429 balance suspensions, 5 403 subscription refusals, 3 provider `unexpected_state` errors, 1 connection error, 3 stopped before any reply.
- 105 replied. In none of them did the yield payload or OMP's `<agent>.md` (what the classifier read) hold a block of the contract's shape that `parseFindings` missed: zero conformant misses, so the parser is unchanged.
- 96 of the 105 wrote a valid block in their own assistant text and yielded the findings without it (as JSON objects, prose, or a pointer to "the block above"): 37 in a text-only turn before the yield, 59 split around the yield call, the closing fence a text part of its own after it.
- 9 wrote no valid block anywhere: 8 no block at all, 1 a block with a kind outside the list.

**The rule (Jo, q-mvfor0be7rezgg: `transcript`).** `handFindings` (`classifier/extension.ts`) reads, in order, the yield payload, then `<root>/<agentId>.md`, then the hand's session file `<root>/<agentId>.jsonl`. The first that parses wins, so a payload or `.md` that parses today gives the same result. From the session file it reads the hand's final assistant text: the text parts of the assistant messages after the last user message, joined in session order, one per line, so a block split around the yield call rejoins. The last `review-findings` block in that text is parsed by `parseFindings`, unchanged. Nothing before the last user message is read: not the brief (whose example block below would read as a clean review), and not a reply an earlier user message superseded. A session with no user message reads as nothing. A malformed or unterminated last block stays `unknown`, as does a missing or unreadable session file.

**The example block.** `REVIEW_FINDINGS_PARAGRAPH`, appended to every review brief, now ends with one complete block that `parseFindings` parses: the empty list, `{"findings":[]}`, fenced as `review-findings`, introduced as the block for a review with no findings, with the entry shape stated on the line above it. An example with a finding was not used, because a reply that copied it verbatim would report a finding it never made.

Already-settled rounds are not recounted: the new source applies to rounds that settle after the merge, and the plan's § 11.5 report compares the unknown rate before and after the merge date.

Tests: `classifier/test/kimi-findings.test.ts` drives the A10 fixtures (`classifier/test/fixtures/kimi-findings/`) through `handFindings`, with sessions built in the layouts A10 found. A block in its own turn, and a block split around the yield, give their counts. A block before the last user message is not read. Non-conformant replies stay `unknown`. The OpenAI fixtures keep their counts. The brief's paragraph carries a block that `parseFindings` parses.

Switch: none — a findings-source fix for contract-conformant blocks and an example of the existing contract; Jo q-mvfl9h64q7ivpc, q-mvfor0be7rezgg
