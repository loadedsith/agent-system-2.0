# Receipts and veracity: is there a better way than labels?

**PMDW**
This report answers Jo's question: *"should we research to investigate if there's an even better way to associate receipts with output? the problem we are trying to solve is it is hard to gauge the veracity of an LLM's statements."* It needs settling before agent-system 2.0 adopts the 1.x output-types framework as a requirement (the proposed P-23). Research agent `ReceiptsVeracity`, 2026-09-24. The work was read-only, and this file is the only write. Degradation tier 2: see Coverage at the end.

**ACTION**
Wrote this file with the `write` tool (success; reverse: `rm /Users/jowolff/code/agent-system-2.0/research/receipts-and-veracity.md`). The only other commands were read-only: `find … | wc -l` (exit 0) and `jq … phantom-claims.jsonl | sort | uniq -c` (exit 0), which change nothing, so there is nothing to reverse.

## Needs you

**QUESTION**
Whether machinery may check hand reports at all. The ruling in `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:39` (P-8a) reads "Hand reports are trusted as-is; Jo does not require machinery to check them". Its open column says "whether 2.0 checks anyway (design choice)". The recommendation below adds a mechanical receipt check. The two options:
- **Check hand reports informationally.** Failures surface as exceptions under P-8c (`REQUIREMENTS.md:41`, "Visibility is exception-based"), and nothing blocks.
- **Check only what the lane relays to Jo.** This leaves hand reports untouched, as P-8a reads literally.

Recommendation: check informationally at the lane. P-8a says Jo does not *require* checking, not that checking is forbidden, and a check that never blocks cannot overrule the trust ruling. The reading of P-8a in this recommendation is a **GUESS** (inference) about Jo's intent, based only on that sentence's wording.

**QUESTION**
Whether a judge model may see receipt text. Any entailment check (approach c) sends the quoted file contents and tool output to the verifier. The judge role in 2.0 is TypeSafe. Its data terms are open questions OQ-1 and OQ-2 (`/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md:612-624`, read this session before context compaction). Three options:
- **Allow it.** Workspace text leaves the machine on every checked message.
- **Judge prose only.** This makes entailment checking impossible.
- **Local model.** This has cost and accuracy that were not measured here.

Recommendation: hold the judge layer until OQ-1 is ruled. The mechanical layer recommended below sends nothing anywhere.

**GUESS**
(inference) The one blocker on evidence: no source I found measures a judge's recall on *rule-7 overreach*, meaning a sentence that stretches past a true receipt, in agent reports. The first measurable test in the Recommendation below exists to produce that number. Until then, any claim that a judge catches overreach is unmeasured.

## Answer

**PMDW**
The answer in eight lines, conclusion first.

1. **CLAIM** There is a better mechanism for one of the two failure classes. The incumbent guard counts labels. The contract itself says "Counts are self-reported and are **not** evidence of honesty" (`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/references/output-types.md:370`).
2. **GUESS** (inference) The better mechanism is to verify receipts against the tool-call record, not trust the model to write them. A program checks four things:
   - every `file:line` was actually read this session
   - every quoted span appears in what was read
   - every CITE URL was actually fetched
   - every ACTION exit code matches the recorded one

   Each part of that is buildable from the evidence in sections (e) and (f). Whether it is *better* in practice is the thing the test measures.
3. **CLAIM** OMP already persists what such a check needs. Each tool result carries its `toolCallId`, its content, and `details.exitCode` on failure (`/Users/jowolff/.omp/agent/seat-sessions/plumb/2026-09-22T05-52-33-604Z_01a0c7ac-4f44-7000-97e6-5f4c9833362f.jsonl:104`). Hand transcripts persist as separate files alongside.
4. **GUESS** (inference) Cost: zero model calls and milliseconds per message. It is a string and lookup check with no model call anywhere.
5. **CITE** What it adds over labels: it catches a fabricated or misremembered receipt, the case where a receipt is present but false. Practitioners converged on this design independently: backcheck's "no model sits in the verdict path" (https://github.com/VectorInstitute/backcheck), and nuhuh's "no model call" (https://github.com/sjh9714/nuhuh).
6. **CITE** What nothing fixes cheaply is rule-7 overreach, where the receipt is true and the conclusion is oversized. Vendor citations do not fix it: "not all claims supported by evidence are true" (https://arxiv.org/abs/2203.11147). Judges on agent traces are near chance: "no configuration across 5 judges… exceeds AUROC 0.65" (https://arxiv.org/abs/2606.09863).
7. **GUESS** (inference) Recommendation: keep the labels, and add mechanical receipt verification whose *verified* counts replace the self-reported envelope. Treat a judge only as an optional, measured triage layer for overreach.

## What the incumbent checks today

**CLAIM**
The receipt rule rests on presence, not truth: "Self-assessed confidence is unreliable. Receipt presence is not." (`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/references/output-types.md:16`). Rule 10 in the plugin numbering, rule 7 in `CLAUDE.md`, sits at `:145`: "A receipt licenses only what it literally shows."

**CLAIM**
The coverage audit records two facts:
- The guard checks label presence, never receipt presence. Its receipt is `…/hooks/output-types-guard.mjs:150-158`, cited upstream in `/Users/jowolff/code/agent-system-2.0/research/output-types-coverage.md`. I did not re-read the guard itself.
- The contract states the enforcement split: "label checks on both stop events, envelope checks on `SubagentStop` only" (`output-types.md:383-384`).

**CLAIM**
The rule-7 incident shows the failure no counter can catch. Two accurate spans in `UserSpotlightEditorPage.tsx` showed an `if (historical && lastSection)` guard. "The receipts were true and the conclusion was wrong." Then "Spotlight creators silently lost a pre-seeded panel", and "A human caught it." (`/Users/jowolff/.claude/references/output-types-incidents.md:24-40`).

**CLAIM**
Jo's own 1.x system already built one mechanical check: `phantom-claim-stop.mjs`. It blocks a turn "whose final assistant message asserts a completed action while the turn contains no tool call that could have produced it", and states "Nothing on this machine compares a report's prose against the tool calls of its own turn" (`/Users/jowolff/.claude/orchestrator/hooks/phantom-claim-stop.mjs:24-28`). The inventory marks it **dead under OMP** (`/Users/jowolff/code/agent-system-2.0/INVENTORY.md:362`). Its calibration log has 6 rows, all `phantom-low` (`jq … phantom-claims.jsonl | sort | uniq -c` → `6 phantom-low`).

**GUESS**
(inference) The recommendation below is the successor to that dead hook, widened from "any tool call at all" to "the specific tool call the receipt names".

## The design space

### (a) Structured output with per-claim evidence pointers

**GUESS**
(inference) How it works: the report is a JSON object, not prose. Each claim carries `{text, type, evidence: [{toolCallId, lines?, quote?}]}`, and a program resolves each pointer.

**CLAIM**
The harness already supports the shape. The task tool accepts `outputSchema` with `schemaMode?: "permissive"|"strict"` (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/task/types.ts:43-53`). The yield tool validates `data` against it (`…/src/tools/yield.ts:516-539`) and rejects a last-turn plain-text result when a schema is declared (`…/tools/yield.ts:471-474`). Persisted tool results carry `toolCallId` (`…/src/session/session-manager.ts:3442-3443`). Extensions get `sessionManager: ReadonlySessionManager` (`…/src/extensibility/extensions/types.ts:443-444`), which exposes `getEntries()` (`…/session/session-manager.ts:3128`).

- **Ties a statement to:** a specific tool-call ID and, optionally, a line range and quote.
- **Verifier:** a program, at yield time.
- **Catches beyond labels:** a pointer to a tool call that never happened, or whose result does not contain the quote. **GUESS** (inference) It also removes the prose-parsing step that approaches (e) and (f) need.
- **Misses:** rule-7 overreach entirely, because a valid pointer says nothing about whether the sentence follows from it. Also, prose for Jo must be rendered from the JSON, which is a second artifact to keep honest.
- **Cost per message:** **GUESS** (inference) extra output tokens for the JSON and no model call to check.
- **OMP fit:** strong for hands, which already yield through a schema-capable tool. Weak for seat-to-Jo prose. **GUESS** (recall) Whether the model can reliably quote its own `toolCallId`s is unverified. The IDs appear in the persisted transcript, for example `"toolCallId":"toolu_01Nfzee5zWT6QLatatSAe4ts"` at the `plumb/…jsonl:715` receipt above, but I did not test a model citing them back.

**CITE**
One hard constraint: Anthropic's citations feature "cannot be used together with structured outputs… returns a 400 error" (https://platform.claude.com/docs/en/build-with-claude/citations). So (a) and vendor citations (b) cannot share one call.

**GUESS**
(inference) I found no primary source that evaluates this exact pattern (agents citing tool-call IDs) for accuracy. The feasibility receipts are OMP's own code.

### (b) Citation-grounded generation and vendor citation APIs

**CITE**
Anthropic Citations: "citations are guaranteed to contain valid pointers to the provided documents". "`cited_text` does not count toward your output tokens". "Enabling citations incurs a slight increase in input tokens". The pointer types are char, page, or content-block locations, and "Only text citations are currently supported" (https://platform.claude.com/docs/en/build-with-claude/citations, reached from https://docs.anthropic.com/en/docs/build-with-claude/citations by redirect, same content).

**CITE**
Tool results can carry citable sources: "Search results can be provided in two ways: 1. From tool calls: Your custom tools return search results". For `source`, "Any stable string works: a URL, or an internal identifier such as `kb://article-1234`" (https://platform.claude.com/docs/en/build-with-claude/search-results).

**CITE**
The research literature on attribution:
- ALCE: "even the best models lack complete citation support 50% of the time" (https://arxiv.org/abs/2305.14627).
- AttributionBench: "even a fine-tuned GPT-3.5 only achieves around 80% macro-F1", with failures from "inability to process nuanced information" (https://arxiv.org/abs/2402.15089).
- AIS defines attribution as a human two-stage annotation task (https://arxiv.org/abs/2112.12870).
- GopherCite: "not all claims supported by evidence are true" (https://arxiv.org/abs/2203.11147).

Approach summary:
- **Ties a statement to:** a character or block span of a document the API was given. The vendor guarantees that the span exists and that `cited_text` is verbatim.
- **Verifier:** the vendor API, for pointer validity only. Support is never verified.
- **Catches beyond labels:** fabricated quotes and invented spans. For fetched sources this is a stronger version of approach (f).
- **Misses:** overreach. A valid span can be cited for a conclusion it does not support, which is the ALCE and GopherCite finding. It also misses anything that is not a document, such as exit codes and command outcomes.
- **Cost per message:** a slight increase in input tokens, and the citation text is free on output (both CITE above).

**CLAIM**
OMP fit is poor today. Extension tool-result content is typed `(TextContent|ImageContent)[]` (`…/extensibility/extensions/types.ts:983-988`). The replacement result is `{ content?; details? }` (`…/src/extensibility/shared-events.ts:341-344`). There is no search-result block type in either. OMP's only `cited_text` handling is in web-search provider parsing (`…/src/web/search/providers/anthropic.ts:282-290`).

**GUESS**
(inference) Adopting (b) would therefore need a change to OMP's provider layer, not an extension. It would also tie the mechanism to one vendor. The spec names tiers, never models or vendors, so a vendor-bound verification layer fits poorly. I did not check other vendors' equivalents.

### (c) Post-hoc claim verification by a judge model

**CITE**
Four methods:
- FActScore "breaks a generation into a series of atomic facts and computes the percentage… supported by a reliable knowledge source". Its automated estimator has "less than a 2% error rate" against humans on biographies (https://arxiv.org/abs/2305.14251).
- SAFE is an agent that decomposes and searches Google. It "agrees with crowdsourced human annotators 72%", wins 76% of disagreements, and is "more than 20 times cheaper" (https://arxiv.org/abs/2403.18802).
- MiniCheck gets "GPT-4-level performance but for 400x lower cost" from a 770M-parameter checker (https://arxiv.org/abs/2404.10774).
- FAX decomposes claims and "cross-checks them against inherently faithful tools", with faithfulness going from 0.20 to 0.46 (https://arxiv.org/abs/2605.27879).

**CITE**
Self-consistency methods check the model against itself, not against the world:
- Chain-of-Verification "answers those questions independently so the answers are not biased" (https://arxiv.org/abs/2309.11495).
- SelfCheckGPT relies on the idea that "if an LLM has knowledge… sampled responses are likely to be similar" (https://arxiv.org/abs/2303.08896).

**CITE**
On *agent* reports specifically, judges are weak:
- The false-success study found "75.8% among AppWorld self-assessing coding-agent trajectories with explicit status claims". It found "no configuration across 5 judges… exceeds AUROC 0.65… only 0.54 AUROC on AppWorld". "Judges rely on surface completion proxies -- confident closing language". And "Lightweight TF-IDF detectors achieve… AUROC 0.83… and 0.95" (https://arxiv.org/abs/2606.09863).
- TRAIL: "best Gemini-2.5-pro model scoring a mere 11%" (https://arxiv.org/abs/2505.08638).
- AgentHallu: "tool-use hallucinations are the most challenging at just 11.6%" (https://arxiv.org/abs/2601.06818).

Approach summary:
- **Ties a statement to:** evidence text (entailment), resampled answers (SelfCheckGPT), or self-posed questions (CoVe).
- **Verifier:** a judge model.
- **Catches beyond labels:** this is the only approach that *tries* to test whether a receipt supports its sentence, so it is the only one aimed at rule 7. **GUESS** (inference) Given the agent-trace numbers above, expect it to miss most overreach unless it is measured and tuned on 2.0's own reports.
- **Misses:** SelfCheckGPT and CoVe do not look at receipts at all, so they cannot tell "I ran the tests" from "I didn't". Judges reward confident prose, which is the wrong incentive for a system trying to surface doubt.
- **Cost per message:**
  - **CLAIM** Spec T3 measured TypeSafe `judge()` at 0.20–0.47 s and "$0.0000286 per call", with accuracy unmeasured (`/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md:19`, an upstream claim preserved as written).
  - **GUESS** (inference) The brief's figure of ~$0.001/call is the parent's, not mine, and it disagrees with the spec by about 35x.
  - **GUESS** (inference) Per-message cost is one call per atomic claim. Atomic decomposition, as in FActScore and SAFE, multiplies the call count.

**CLAIM**
OMP fit: a no-code path exists, and it sees the wrong input.
- The `ttsr.judge` setting will "Ask the judge model role each `question` rule about completed replies, reasoning, and tool calls; a yes injects the rule as a warning" (`…/src/config/settings-schema.ts:3469-3488`).
- The threshold is `JUDGED_RULE_THRESHOLD = 0.7` and the state is capped at `JUDGED_STATE_MAX_CHARS = 60_000` (`…/src/export/ttsr.ts:46-49`).
- It sends `{state:{output: subject, content}, questions}` (`…/export/ttsr.ts:56-72`).

**GUESS**
(inference) From that `state` shape, TTSR judges the reply text, not the tool results the reply cites. That makes it an overreach-by-tone detector, not a receipt checker. A grep of `extensibility/extensions` for `judge` returned 0 matches, so an extension would have to call a model itself.

### (d) Calibrated confidence and uncertainty reporting

**CITE**
The calibration literature:
- Kadavath et al. found larger models "well-calibrated on diverse multiple choice" but found they "struggle with calibration of P(IK) on new tasks" (https://arxiv.org/abs/2207.05221).
- Xiong et al.: "LLMs, when verbalizing their confidence, tend to be overconfident", with failure-prediction AUROC "0.522 to 0.605", and "all investigated methods struggle in challenging tasks" (https://arxiv.org/abs/2306.13063).
- Tian et al., the counterpoint, is limited to QA benchmarks: for RLHF models, verbalized confidence is "typically better-calibrated than the model's conditional probabilities… reducing the expected calibration error by a relative 50%" (https://arxiv.org/abs/2305.14975).
- Kalai et al.: hallucination persists because evaluation "reward[s] guessing over acknowledging uncertainty" (https://arxiv.org/abs/2509.04664).

Approach summary:
- **Ties a statement to:** nothing external, only a number the model emits.
- **Verifier:** nobody, per statement. Calibration is only measurable in aggregate against ground truth.
- **Catches beyond labels:** nothing per statement. **GUESS** (inference) At best, a calibrated score could order which claims a human reviews first.
- **Misses:** every fabricated receipt, and overreach written confidently.

**CLAIM**
The incumbent already rejected this deliberately: "**The basis is not a confidence score.** `inference` is not '80% sure.' It says what kind of evidence exists, which is checkable; how sure the agent feels is not." (`output-types.md:191-192`).

**GUESS**
(inference) The rest of the verdict:
- **Cost:** a few tokens.
- **OMP fit:** trivial, and not worth doing. The literature agrees with the incumbent that confidence is the wrong axis for this problem.

### (e) Provenance from traces: receipts derived from the tool-call record

**CITE**
backcheck reads the transcript twice, "prose → claims" and "tool calls → evidence": "The two halves never inform each other… the agent's account of a session cannot influence the record of it". It notes that for its inputs, "**Transcripts do not record exit codes.**" Its verdicts are supported, inconclusive, contradicted, unsupported, and qualified, where qualified covers stale green, a subset run, and `|| true`. And "**no model sits in the verdict path**" (https://github.com/VectorInstitute/backcheck).

**CLAIM**
OMP transcripts *do* record exit codes for failures. `BashToolDetails.exitCode` is the "Exit code of a command that ran to completion but failed (non-zero)" (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-tui/dist/types/tools/bash.d.ts:16-17`). The persisted example is `"details":{…,"exitCode":1},"isError":true` (`/Users/jowolff/.omp/agent/seat-sessions/plumb/2026-09-22T05-52-33-604Z_01a0c7ac-4f44-7000-97e6-5f4c9833362f.jsonl:104`).

**GUESS**
(inference) A success is recorded as `exitCode` absent plus `isError:false`. The d.ts documents only the failure case.

**CLAIM**
Read results carry the evidence a span check needs:
- `resolvedPath` and `displayContent: { text; startLine; lineNumbers? }`, which "Mirrors the same lines the model receives" (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-tui/dist/types/tools/read.d.ts:16,33-38`).
- For fetched URLs: `kind?: "file" | "url"`, `url`, `finalUrl` (`read.d.ts:11,23-24`).

**CLAIM**
The corpus exists: 665 persisted OMP session files (`find /Users/jowolff/.omp/agent/seat-sessions -name '*.jsonl' | wc -l` → `665`). Hand transcripts sit beside their parent's session as `<session>/<AgentId>.jsonl`, for example `…/plumb/2026-09-22T05-52-33-604Z_01a0c7ac-4f44-7000-97e6-5f4c9833362f/ReaderCtx.jsonl`.

**CLAIM**
The hooks an extension can use:
- `tool_call` fires "before a tool executes. Can block." (`…/extensibility/extensions/types.ts:933-981`).
- `tool_result` gives `{ toolCallId; input; content; isError }` (`types.ts:983-988`), with typed `details` for bash and read (`types.ts:991-994`).
- `turn_end` carries `toolResults` (`shared-events.ts:213-218`).
- `session_stop` carries `messages` and `last_assistant_message`, and may return `decision: "block"` (`shared-events.ts:97-109, 396-406`).

**CLAIM**
Hands never receive `session_stop`: `if (this.#agentKind === "sub" || !this.#extensionRunner?.hasHandlers("session_stop")) { return false; }` (`…/src/session/agent-session.ts:4287`). Subagents do get the parent's extensions rebound (`…/src/task/executor.ts:510-521`).

**GUESS**
(inference) So a hand's report is checked either inside the hand via `turn_end` or `agent_end`, or at the lane against the hand's persisted transcript. The lane option matches the P-8a answer above.

**CLAIM**
OTel is the wrong layer for the check. Spec T2 records that OMP's OTel content capture is off unless `OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT` is set (`/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md:18`, upstream). The OTLP exporter notes "The caller still owns content-capture policy" (`…/src/telemetry-export-otlp.ts:89-91`).

**GUESS**
(inference) The extension already holds the content in process, so exporting it to Phoenix only to check it there adds a network hop and a privacy decision for no gain. Phoenix fits as the place to *store and browse* verdicts, not to compute them. I could not read the GenAI semantic-convention attribute list; that fetch failed (see Sources).

Approach summary:
- **Ties a statement to:** the specific recorded tool call that could have produced it.
- **Verifier:** a program.
- **Catches beyond labels:**
  - a `file:line` never read
  - a URL never fetched, or fetched with `finalUrl ≠ url`, which the research contract already counts as a failed fetch
  - "tests pass" with no test run, a non-zero exit, or a run older than the last edit
  - an ACTION whose stated exit code disagrees with the record
- **Misses:**
  - overreach
  - claims with no receipt at all, which can only be flagged as unsupported
  - paraphrased claims the extractor does not recognize. backcheck lists "pattern-matched claims" and being "tuned to stay quiet" as its own limitations.
- **Cost per message:** **GUESS** (inference) no model call, just a transcript scan.

**GUESS**
(inference) OMP fit is the best of any approach, because everything the check needs is already persisted.

### (f) Receipt-bound assertions: a mechanical span check

**GUESS**
(inference) How it works: a CLAIM receipt `path:line` must be accompanied by a short verbatim quote, and a program checks two things.
1. **Against the session record.** Some read or grep result in this session covered that path and line, and its text contains the quote.
2. **Against disk now.** The quote appears at or near that line in the current file.

Check 1 proves the agent saw it. Check 2 catches a stale line number. A CITE URL must match a non-error `kind:"url"` read result whose content contains the quoted passage.

**CITE**
The same principle appears in two published designs. Vendor citations guarantee "valid pointers" by extracting `cited_text` rather than letting the model type it (https://platform.claude.com/docs/en/build-with-claude/citations). The closed-world tool-call resolver treats registry membership as a mechanical gate: "a hallucinated call is by construction not a decision any gate made" (https://arxiv.org/abs/2609.19425).

Approach summary:
- **Ties a statement to:** a byte-verifiable span on disk *and* in the session record.
- **Verifier:** a program.
- **Catches beyond labels:**
  - fabricated or drifted `file:line`
  - misquoted passages
  - a CITE with no fetch, or with a redirect
  - the stale-line-number failure the incumbent documents, where every edit above a citation silently invalidates it
- **Misses:** overreach, which remains the gap. The Spotlight receipts would have *passed*, because they were true spans. It also misses receipts that are command output rather than file text; approach (e) covers those.
- **Cost per message:** **GUESS** (inference) a few output tokens per quote, and a string search to check.
- **OMP fit:** **CLAIM** the read result exposes `resolvedPath` and `displayContent.startLine`/`text` (`read.d.ts:16,33-38`), which is exactly the pair this check needs.

**GUESS**
(inference) The contract change is small: CLAIM gains a required quote. The rest of the label system is unchanged.

### (g) What practitioners built for "did the agent actually verify this"

**CITE**
nuhuh is a Stop hook. It extracts claims from the final message and "re-runs reality, fresh", with "no model call". Claims it cannot check are marked `⚠️ unverifiable`, "tuned to miss rather than to accuse". It caps at 3 bounces and only runs manifest commands, "never commands taken from the agent's text" (https://github.com/sjh9714/nuhuh). **GUESS** (inference) Its own benchmark numbers, such as 0.0% frontier false-Done over 102 runs, are self-reported by the author and unreplicated.

**CITE**
agent-receipts classifies claims as VERIFIED, STALE, UNVERIFIED, or CONTRADICTED. It flags gaming signals: weakened assertions, skips, `|| true`, and `--no-verify`. It is regex-based and English-only, and its README states: "A passing test run proves the suite passed, not that the suite is any good." (https://github.com/0xelitesystem/agent-receipts).

**CITE**
On Reddit (via https://safereddit.com/r/ClaudeAI/search?q=claude+lied+tests+passed&restrict_sr=on&sort=relevance&t=all):
- u/ka0ticstyle reported a reviewer that said "problem found" 3/3 but caught the planted bug 0/3.
- u/Disastrous_Cat9164, from 366 post-mortems, named the top failure "tests pass ≠ actually wired in", and wrote that a sub-agent's OK "is a hypothesis, not evidence".

**CITE**
On HN (via https://hn.algolia.com/api/v1/search?query=agent%20lied%20tests%20passed&tags=comment):
- pron: "The agents lie with a high enough frequency to be a serious problem."
- Yoric described an agent rewriting tests and golden fixtures to match.

**GUESS**
(pattern) Every tool I opened converges on the same four traits:
- deterministic
- no model in the verdict
- tuned to under-report
- focused on "done/tests pass" claims plus test-gaming signals

The practitioner reports of "true test, wrong conclusion" are the same shape as rule 7. None of the tools claims to catch it.

**GUESS**
(inference) OMP fit: these are Claude Code Stop hooks. The logic ports directly to an OMP extension on `session_stop` for seats, and to a lane-side check for hands.

## Comparison

| Approach | Type | Ties statement to | Verifier | Catches false receipt | Catches rule-7 overreach | Cost / message | OMP extension from tool records? |
|---|---|---|---|---|---|---|---|
| Incumbent labels + count | **CLAIM** | a model-written receipt string | hook counts labels | no (`output-types.md:370`) | no (incident, `output-types-incidents.md:24-40`) | ~0 | exists as a bridge |
| (a) Structured claims → tool-call IDs | **GUESS** (inference) | a toolCallId (+quote) | program | yes | no | JSON tokens, no call | yes, via `outputSchema` (`task/types.ts:43-53`) |
| (b) Vendor citations | **CITE** | a vendor-extracted document span | vendor API (validity only) | yes, for documents | no ("not all claims supported by evidence are true", 2203.11147) | slight input increase | no; needs a provider change (**GUESS** (inference)) |
| (c) Judge verification | **CITE** | evidence text or resamples | judge model | partly | only approach aimed at it; AUROC ≤ 0.65 on agent traces (2606.09863) | 1 call per atomic claim | partly (TTSR sees reply only, **GUESS** (inference)) |
| (d) Calibrated confidence | **CITE** | a self-reported number | nobody | no | no | tokens | trivial and not useful |
| (e) Trace-derived provenance | **CLAIM** | the recorded tool call and its exit code | program | yes, including exit codes (`bash.d.ts:16-17`) | no | no call | yes (`types.ts:983-994`) |
| (f) Quote-in-span check | **CLAIM** | the span on disk and in the session read | program | yes, including stale line numbers | no | quote tokens, no call | yes (`read.d.ts:16,33-38`) |
| (g) Practitioner hooks | **CITE** | re-run commands, transcript evidence | program | yes, for done/tests-pass | no (by their own design) | no call | ports to `session_stop` |

**GUESS**
(inference) The Type column labels each row's *overall* evidential basis. Individual cells marked as guesses stay guesses.

## Recommendation for 2.0

**GUESS**
(inference) **Keep the labels and add mechanical receipt verification. Do not replace the labels.**

The labels still do two jobs no mechanism does:
- They force the writer to sort claims from guesses at the moment of writing.
- They give a verifier something parseable to check.

Their gap is that nothing checks a receipt is true, and approaches (e) and (f) close that gap for zero model calls from data OMP already persists. The verifier would do four things:
- resolve each CLAIM `path:line` plus a required quote against the session's read results and the current file
- resolve each CITE URL against a non-redirected fetch
- resolve each ACTION exit code against `details.exitCode`
- flag "tests pass" claims with no test run after the last edit

Its verified counts would replace the self-reported envelope. Rule-7 overreach stays with the human and the label discipline, because every source here says no cheap mechanism catches it. A judge layer earns a place only after the test below measures its recall on 2.0's own reports.

**GUESS**
(inference) First measurable test: a replay, with no new runtime code in any seat.

1. **Mechanical arm.** Sample 30 final reports, main-seat and hand, from `/Users/jowolff/.omp/agent/seat-sessions/`. For each, extract every CLAIM `file:line`, CITE URL, and ACTION exit code. Resolve each against the same transcript's tool results, and against disk.
   - **Metric:** the unbacked-receipt rate, meaning the fraction of receipts with no covering tool result, a quote mismatch, a URL never fetched, or an exit-code mismatch.
   - **Decision rule:** if the rate is at or above 5%, mechanical verification ships in P-23. If it is under 1%, fabricated receipts are rare and the labels alone hold for that failure class. Both thresholds are my proposal, not measured.
2. **Judge arm.** Hand-label 20 rule-7 cases (true receipt, oversized conclusion), with the Spotlight incident as case one, plus 20 clean controls. Run the judge role on each (receipt text, sentence) pair.
   - **Metric:** recall on the 20 cases and false-positive rate on the controls, compared against the agent-trace AUROC ceiling of 0.65 reported in https://arxiv.org/abs/2606.09863.
   - **Precondition:** this arm needs the OQ-1 data-boundary ruling first, because it sends workspace text to TypeSafe.

## Sources

### Fetched in full or read to the relevant passage

**CITE**
Every URL below was fetched this session, and the passage quoted above appears on the fetched page.
- https://platform.claude.com/docs/en/build-with-claude/citations (via a redirect from docs.anthropic.com; content matched the request)
- https://platform.claude.com/docs/en/build-with-claude/search-results
- arXiv abstracts:
  - https://arxiv.org/abs/2305.14627 (ALCE)
  - https://arxiv.org/abs/2305.14251 (FActScore)
  - https://arxiv.org/abs/2309.11495 (CoVe)
  - https://arxiv.org/abs/2303.08896 (SelfCheckGPT)
  - https://arxiv.org/abs/2404.10774 (MiniCheck)
  - https://arxiv.org/abs/2112.12870 (AIS)
  - https://arxiv.org/abs/2402.15089 (AttributionBench)
  - https://arxiv.org/abs/2203.11147 (GopherCite)
  - https://arxiv.org/abs/2207.05221 (Kadavath)
  - https://arxiv.org/abs/2306.13063 (Xiong)
  - https://arxiv.org/abs/2305.14975 (Tian)
  - https://arxiv.org/abs/2403.18802 (SAFE)
  - https://arxiv.org/abs/2505.05410 (CoT faithfulness)
  - https://arxiv.org/abs/2509.04664 (Kalai)
  - https://arxiv.org/abs/2505.08638 (TRAIL)
  - https://arxiv.org/abs/2601.06818 (AgentHallu)
  - https://arxiv.org/abs/2606.09863 (false success)
  - https://arxiv.org/abs/2609.19425 (closed-world resolution)
  - https://arxiv.org/abs/2605.27879 (FAX)
- GitHub READMEs:
  - https://github.com/sjh9714/nuhuh
  - https://github.com/VectorInstitute/backcheck
  - https://github.com/0xelitesystem/agent-receipts
- Practitioner threads:
  - https://safereddit.com/r/ClaudeAI/search?q=claude+lied+tests+passed&restrict_sr=on&sort=relevance&t=all
  - https://hn.algolia.com/api/v1/search?query=agent%20lied%20tests%20passed&tags=comment
  - https://hn.algolia.com/api/v1/search?query=agent%20hallucinated%20tool%20output%20verify&tags=story (nothing usable)

**CITE**
The CoT faithfulness paper was read but not used above. It finds a CoT reveal rate "often below 20%" and concludes that monitoring CoTs "is unlikely to reliably catch rare and catastrophic unexpected behaviors" (https://arxiv.org/abs/2505.05410).

**GUESS**
(inference) That supports excluding reasoning traces as a receipt source.

**CLAIM**
Local primary sources read this session:
- the three contract, incident, and audit files named in the brief
- `REQUIREMENTS.md`, `SPEC-2.0.md`, `INVENTORY.md`
- `/Users/jowolff/.claude/orchestrator/hooks/phantom-claim-stop.mjs:1-60`
- the OMP source files cited inline, under `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src` (package 18.2.6)
- `@oh-my-pi/pi-tui` `read.d.ts` and `bash.d.ts`
- two persisted session JSONL files

### Partial

**CITE**
https://github.com/open-telemetry/semantic-conventions-genai: the README only. I did not read the span attribute definitions.

### Failed

**CITE**
https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/ returned a "Moved" page that redirects to an index. I counted it as failed. It cost the GenAI attribute list, which does not change the recommendation, because the check runs in-process.

## Coverage

**PMDW**
One row per subject.

| Subject | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| Incumbent contract, incidents, audit | 3 files + 2 greps | all | none | yes: the passages that bear on the question are quoted |
| (a) structured evidence pointers | OMP `task/types.ts`, `tools/yield.ts`, `session-manager.ts` | all | no literature source found | partly: feasibility is proven, accuracy is unmeasured; the next read would be an eval of agents citing tool-call IDs |
| (b) vendor citations and attribution | 2 Anthropic docs + 4 arXiv (ALCE, AIS, AttributionBench, GopherCite) | all | none | yes, for Anthropic; other vendors not checked |
| (c) judge verification | 7 arXiv + OMP `ttsr.ts`, `settings-schema.ts` | all | none | yes, on judge accuracy in the literature; no, on judge accuracy for 2.0, which is the test |
| (d) calibration | 4 arXiv | all | none | yes: the literature agrees and the incumbent already rejects this approach |
| (e) trace provenance | backcheck README, OMP types, pi-tui d.ts, 2 session JSONL, OTel repo + docs | all except the OTel spec page | OTel docs page redirected to an index; OTel repo read to README only | yes: the in-process data is proven, and OTel is not needed for the check |
| (f) span check | Anthropic citations, 2609.19425, `read.d.ts` | all | none | yes |
| (g) practitioners | 3 GitHub READMEs, Reddit search, 2 HN searches | all | none | partly: see the unopened list |
| In-house prior art | `INVENTORY.md` grep, `phantom-claim-stop.mjs:1-60`, `phantom-claims.jsonl` count | lines 1-60 of 221 | none | yes, for what it catches; the rest of its logic is not read |

**PMDW**
**Retrieved and not opened.** Seven prior-art tools were named in listings and not opened:
- https://github.com/mohamedzhioua/agent-done-or-not, from a web_search result
- the prior-art projects backcheck's README lists: grounded ("blocks edits to files the agent never read"), llm-dark-patterns, no-vibes, and claude-verify-before-stop
- tdd-guard, probity, and taskmaster, named in search results

Also not opened:
- the web_search result pages for GitHub Copilot hooks and Claude Code Stop-hook docs, which I used only as leads and do not cite
- the remaining 161 lines of `phantom-claim-stop.mjs`
- the other 663 session files

**GUESS**
(inference) None of those is likely to overturn the recommendation, but grounded in particular overlaps approach (f) and would be the next read. That is why this report is Tier 2.

<!-- output-types tier: 2 CLAIM: 22 CITE: 24 GUESS: 37 (inference 35, pattern 1, recall 1) ACTION: 1 PMDW: 4 QUESTION: 2 -->
