# Laya vs TypeSafe (Jev) for agent-system 2.0

**PMDW**
Research report, written 2026-09-28 by the `LayaVsTypeSafe` research subagent for Jo's question *"i want a comparison of laya vs typesafe — i know laya has professed better accuracy, is also open source and free."* Laya **was run locally**, under `/tmp/laya-eval/` only (a uv venv, a Hugging Face cache and a throwaway OMP agent directory). Nothing was installed globally and no OMP setting on Jo's profiles was changed. The last section lists every `/tmp` path left behind.

## Needs Jo

**QUESTION**
Should Laya replace TypeSafe anywhere in 2.0? The three roles are the pre-dispatch work-kind classifier, OMP's `find` tool, and the future receipt-checking judge layer.
- **Keep TypeSafe everywhere (recommended).** On the 30 hand-labelled briefs, Laya's best checkpoint agreed with the hand labels on 11 of 30. TypeSafe agreed on 23 of 30. Laya's confidence also cannot drive the 0.55 low-confidence rule: at that threshold it flags 24 to 30 of the 30 briefs. On one `find` query, Laya returned 9 near-uniform hits, where TypeSafe returned the single correct passage. Nothing in 2.0 changes.
- **Laya for the classifier only.** Briefs stay on the machine. Routing accuracy falls from 23 of 30 to about 10 of 30, which is below "always answer understand" (15 of 30). The classifier hook would need its own HTTP call to Laya, because OMP's `judge` role is one setting per profile and switching it moves `find` and auto-thinking too.
- **Laya everywhere OMP allows.** This is wire-compatible and was proven live in this session. It takes the same accuracy loss on the classifier, plus a clear quality loss on `find` (one query measured).
- **Run a side-by-side in M3 and decide on measured numbers.** M3's gate is already "replay of the 30-brief classifier sample through the hook" (`/Users/jowolff/code/agent-system-2.0/MIGRATION.md`, row `| M3 |`). This report has effectively run that side-by-side for the zero-shot checkpoints. A second arm is only worth running with a Laya checkpoint fine-tuned on 2.0's own labelled briefs, and 30 briefs is not a training set.

The recommendation is to keep TypeSafe everywhere. The one reason: Laya's own maintainers say the shipped checkpoints are near chance zero-shot, this repo's measurement agrees, and self-hosting only removes a data question that Jo already ruled was not a problem.

**GUESS** (inference; not a blocker)
Laya's "better accuracy" headline would matter only after fine-tuning. The vendor's own fine-tuning notebook is 4–5 hours on 2×T4 for about 30k questions (CITE below), and 2.0 has 30 labelled briefs. A fine-tuned classifier is therefore not reachable before M3 without a labelling effort that nobody has scoped.

## 1. Bottom line

**CLAIM**
Laya zero-shot on 2.0's work-kind question: **10/30 (English checkpoint), 11/30 (multilingual), 6/30 (typed-decisions)** agreement with the hand labels, against TypeSafe's **23/30** on the same 30 briefs and the same question text. The majority-class baseline (always `understand`) is 15/30. Receipts are in § 4.

**CLAIM**
Laya **does** plug into OMP's native judge path without code changes. A `models.yml` custom provider with `api: typesafe` pointed at a local `laya-serve` made OMP's `find` tool auto-enable and run all 20 of its judgment requests against Laya on loopback. Receipts are in § 7.

**GUESS** (inference, from the two CLAIMs above plus Jo's 2026-09-24 ruling)
Laya's real advantages are on the data boundary and on price, and both are already settled for this repo: Jo ruled TypeSafe acceptable, and TypeSafe costs about $0.00003 per classifier call. The disadvantage is on the one axis still open, accuracy. That makes "keep TypeSafe" the low-regret call.

## 2. What Laya is

**CITE**
Maker and positioning. https://laya.convaiinnovations.com/ (fetched this session) is a long-form post by "Nandakishor Mukkunnoth · Founder & CEO, ConvAI Innovations". It describes Laya as "a sub-35ms open-weight System 1 decision engine" that "evaluates typed questions over any state … in **a single forward pass**", with three primitives: `choice`, `score`, and `noul`. It frames Laya explicitly as an open answer to TypeSafe Jev: "a well-funded frontier lab called TypeSafe AI … launched Jev … Instead of staying bitter, I decided to … build a completely open, horizontal System 1 decision model family: **Laya**." The page's og:description reads "Outperforms TypeSafe Jev."

**PMDW**
Jo's URL resolves to a classification and judge model of the same kind as TypeSafe, not to something else. It is a direct Jev competitor built on the same API shape.

**CITE**
Model family. The landing page and the README (https://raw.githubusercontent.com/NandhaKishorM/laya/main/README.md) describe three checkpoints:

| checkpoint | encoder | params | context | stated use |
|---|---|---|---|---|
| `laya` | ModernBERT-large | 421M | 512 | English |
| `laya-multilingual` | mmBERT-base | 322M | 1024 (up to 8,192) | 100+ languages |
| `laya-typed-decisions` | ModernBERT-large | 421M | 1024 | the typed-decisions workflows |

The HF model API (https://huggingface.co/api/models/convaiinnovations/laya) reports `"safetensors": {"parameters": {"F16": 421293827 …}}` and `pipeline_tag: "text-classification"`.

**CITE**
License: **Apache-2.0**. The GitHub API (https://api.github.com/repos/NandhaKishorM/laya) returns `"spdx_id": "Apache-2.0"`. PyPI (https://pypi.org/pypi/laya/json) returns `license: Apache-2.0`. The HF card data returns `"license": "apache-2.0"`.

**CITE**
Price: free, self-hosted. The landing page table row reads "Cost per 1M tokens | $0.042 (metered API) | $0.00 (self-hosted)". No hosted paid API is advertised. The "Live Space Demo" is a Hugging Face Space on ZeroGPU (https://huggingface.co/spaces/convaiinnovations/laya-demo, linked from the landing page and not opened).

**CITE**
Hosting: self-host via `pip install laya`. `laya[serve]` exposes "`POST /v1/systemone` … the same wire protocol as TypeSafe's hosted Jev API", "so an existing Jev client … just needs its `baseUrl` repointed" (README § *Self-Hosting: HTTP Server (Jev-compatible)*). There is also an MCP server (`laya[mcp]`), ONNX, LangChain, and a TypeScript package (README, *Installation*).

**CITE**
Repo, release, and activity (https://api.github.com/repos/NandhaKishorM/laya, PyPI JSON, and GitHub releases/tags API, all fetched this session):
- The repo `github.com/NandhaKishorM/laya` was created **2026-09-18** and last pushed 2026-09-27.
- The latest release is **v0.3.21**, published 2026-09-27T19:41Z. PyPI `laya 0.3.21` was uploaded 2026-09-27T19:41:34, classifier "Development Status :: 4 - Beta". Versions 0.3.14–0.3.20 were all uploaded within 90 minutes on 2026-09-24.
- The repo has 27,565 stars, 2,404 forks, and 170 open issues. Commit pagination shows 712 commits, and the contributors listing paginates to 100.
- On Hugging Face, the model has `likes: 4256`, `downloads: 0`, and `createdAt: 2026-09-18`.

**GUESS** (inference, from the figures above)
As a maturity signal, the project is ten days old and moving fast: seven PyPI releases in one evening, and a model API reshaped in 0.3.21. 27.5k stars in ten days alongside a Hugging Face `downloads: 0` field is unusual. It may be viral attention or star inflation, and nothing here tells which. Either way, treat it as a beta that has not been hardened by long use.

**CITE**
API shape. Laya offers typed classification and judgment: `choice` returns `choice`, `probabilities`, and `confidence`; `score` returns an expected level and a distribution; `noul` returns P(true). There are no embeddings in the decision API, though a `predict_shortlist` helper uses embeddings for pre-filtering (README, *Honest limits*). It **does not generate text**.

**CITE**
The confidence definition differs from Jev's. README § *Self-Hosting*: "**`confidence`** on `choice` and `score` answers is 1 minus normalised entropy … not Jev's `(n·p_max − 1)/(n − 1)`. A threshold carried over from Jev does not transfer. For one calibrated number … gate on `answer_confidence`." The installed source agrees: `/tmp/laya-eval/.venv/lib/python3.12/site-packages/laya/common.py:486-487` has `def confidence_from_probs … """Normalized Shannon entropy confidence: 1 - H(p) / log(k).`

## 3. What TypeSafe is, on the same axes

**CLAIM**
First-party record, preserved from `/Users/jowolff/code/agent-system-2.0/research/typesafe-ai.md` § 2 and § 3.2 (receipts there, not re-derived here). TypeSafe sells **Jev**, a closed, hosted "System One" model with the same three primitives. OMP ships a native `typesafe` provider and a `judge` model role whose default chain begins `typesafe/jev-latest`. It is closed-weights and a hosted API only, with no self-host.

**CITE**
Price and limits, re-fetched this session from https://docs.typesafe.ai/models.md: "Price (per Btok / per Mtok) | \$42 / \$0.042", "Charged per input token. Output tokens are free.", "250,000 tokens per second / 1,200 requests per minute", "64k tokens per request; 32k tokens for `state` plus the longest question", and `jev-latest` → `jev-1.13.0`.

**CITE**
Jev's confidence definition. https://docs.typesafe.ai/confidence.md (fetched this session) says the demo "uses `(3 × largest probability − 1) / 2` to approximate confidence for three options". Its explorer code computes `(count * peak - 1) / (count - 1)`. This is a different statistic from Laya's `confidence`, as the Laya README itself says.

**CITE**
Data terms. These are preserved from `/Users/jowolff/code/agent-system-2.0/research/typesafe-data-terms.md`, which fetched them on 2026-09-23 and was not re-fetched here: no training on customer data (MCA §4.1), a perpetual Telemetry right, no published retention period, and hosting in the US.

## 4. Accuracy

### 4.1 What each vendor claims

**CITE**
Laya's claim, quoted exactly from https://laya.convaiinnovations.com/ § 5:

| Benchmark / Metric | TypeSafe Jev 1.13.0 | Laya (Routed) |
|---|---|---|
| typed-decisions (2,000 decisions) | 0.727 | 0.766 |
| AG News (4 labels) | 0.910 | 0.950 |
| DAIR Emotion (6 labels) | 0.480 (Brier 0.846) | 0.595 |
| Calibration Error (ECE) | 0.246 | 0.081 |

The page also says: "Every Laya number is measured; Jev numbers are published by third-party independent studies (AbdelStark, nibzard) and TypeSafe AI."

**CITE**
Laya's own caveats sit on the same page (§ 6) and in the README:
- "Out-of-the-box base models score ~0.35 on the typed-decisions benchmark (near random). The 0.766 score is achieved by fine-tuning on the benchmark's train split."
- README § *Honest limits*: "Laya is a fast base to specialise, not a zero-shot decision engine."
- README § *Where Jev leads*: Banking77 "Jev scores 0.870 … Laya scores 0.425", and Jev has higher soft accuracy on typed-decisions (0.580 vs 0.471).
- BENCHMARKS.md (https://raw.githubusercontent.com/NandhaKishorM/laya/main/BENCHMARKS.md): "Jev figures are **third-party published, never measured here** — no TypeSafe API access — so sample sizes and prompts differ; treat them as indicative."

**CITE**
Where the Jev figures come from:
- AG News 0.910, DAIR Emotion 0.480, Brier 0.846, and the 16% zero-probability figure come from AbdelStark's 300-example pilot (https://raw.githubusercontent.com/AbdelStark/jev-benchmarks/main/README.md). That pilot is zero-shot, "Three hundred held-out examples, 100 per condition".
- The 0.246 ECE comes from nibzard's DMB (https://raw.githubusercontent.com/nibzard/decision-model-benchmark/main/README.md): "The reported S5 expected calibration error (ECE) of 0.246 concerns the underdetermined half, whose reference answer was randomly planted."

**GUESS** (inference, from the three CITEs above)
**The two sets of numbers are not comparable.**
- Laya's 0.766 is a checkpoint fine-tuned on the typed-decisions train split. Jev's 0.727 is zero-shot. The base Laya checkpoints score 0.361 and 0.352 on the same benchmark (BENCHMARKS.md table).
- Laya's ECE 0.081 is after fitting temperatures on its own data. Jev's 0.246 is from a deliberately unanswerable test half in a different benchmark.
- Laya's AG News and DAIR figures come from different samples and prompts than the Jev ones, which Laya's own BENCHMARKS.md concedes.

None of these measures a 5-way work-kind routing task. The published source of Jev's typed-decisions 0.727 was not found (see Unverified).

### 4.2 Measured here: the 30-brief work-kind set

**ACTION**
Method:
- Installed `laya[serve]==0.3.21` into `/tmp/laya-eval/.venv` with `uv` (uv cache and HF cache both under `/tmp/laya-eval/`). Exit 0.
- Ran `/tmp/laya-eval/run_eval.py <checkpoint> <device>` for english/mps, multilingual/mps, typed-decisions/mps, and english/cpu. Exit 0 each.
- Input: `/Users/jowolff/agent-scratch/agent-system-2.0/classifier-sample/briefs.jsonl`, 30 rows.
- Question: **byte-for-byte the ClassifierSample question**, extracted from the transcript `/Users/jowolff/.omp/agent/seat-sessions/plumb/2026-09-23T23-46-38-534Z_01a0d0aa-0546-7000-91dd-fc66a43838ee/ClassifierSample.jsonl` line 70 and copied to `/tmp/laya-eval/classifier_cell_line70.py`.
- One `choice` question with five criteria. State is the brief text as a string. Each checkpoint was pinned explicitly with `model=`.
- One warm-up call was excluded from latency.
- Reversal: `rm -rf /tmp/laya-eval`.

**CLAIM**
Results, from the script's stdout this session:

| checkpoint (device) | agree with hand labels | agree with TypeSafe's picks | TypeSafe vs hand (same rows) | p50 latency / call | choice spread |
|---|---|---|---|---|---|
| `english` (MPS) | **10/30 (33.3%)** | 11/30 | 23/30 | 0.086 s (min 0.056, max 0.213) | change-large 11, judge 8, understand 7, change-small 3, locate 1 |
| `multilingual` (MPS) | **11/30 (36.7%)** | 12/30 | 23/30 | 0.042 s (min 0.025, max 0.194) | change-small 11, understand 7, locate 6, change-large 3, judge 3 |
| `typed-decisions` (MPS) | **6/30 (20.0%)** | 7/30 | 23/30 | 0.100 s | change-large 17, judge 6, change-small 3, understand 3, locate 1 |
| `english` (CPU) | 10/30 (identical picks to MPS) | 11/30 | 23/30 | 0.238 s (min 0.140, max 0.487) | same as MPS |

Hand labels: understand 15, change-small 6, locate 4, judge 4, change-large 1 (`/Users/jowolff/code/agent-system-2.0/research/classifier-sample.md` § Method). So the "always understand" baseline scores 15/30, and **every Laya checkpoint scores below it**. Per-row output is in `/tmp/laya-eval/results-*.jsonl`.

**CLAIM**
The English checkpoint's dominant error is calling research and reader briefs `change-large`: 6 of 15 `understand` briefs, plus 2 of 4 `locate` briefs. Examples are `ReaderCtx`, `ResearchPlanning`, and `ScoutSkills` (`python analyze.py results-english-mps.jsonl`). It got right the one brief TypeSafe missed on vocabulary (`T3TypeSafeJudge` → judge; hand label understand, so both are "wrong" there). It missed the only change-large (`LedgerLifecycle` → understand).

**CLAIM**
Truncation. The English checkpoint's `usage.input_tokens` hit its 512-token cap on 19 of 30 briefs (`in_tok=512` rows in the analyze output). The library right-truncates state to `max_len - head_max_len` (`/tmp/laya-eval/.venv/lib/python3.12/site-packages/laya/agent.py:759-760`, defaults 512/192). The multilingual checkpoint (1024 context, no truncation on these briefs) scored only one brief better, so truncation does not explain the gap.

**CLAIM**
Confidence cannot drive the 2.0 low-confidence rule. Sweeps from `/tmp/laya-eval/analyze.py`, with a brief flagged when `answer_confidence` (Laya's calibrated field) is below the threshold:
- English: at 0.55, 28 of 30 flagged, and 2 unflagged, both wrong. At 0.40, 22 flagged. `answer_confidence` ranges 0.26–0.81.
- Multilingual: at 0.55, 24 of 30 flagged, and 3 of 6 unflagged correct.
- Typed-decisions: at 0.55, all 30 flagged.

For comparison, TypeSafe at 0.55 flagged 5 of 30 and caught 4 of 7 errors (`research/classifier-sample.md` § Threshold sweep). Under SPEC § A1.3's "below threshold, dispatch at the higher of the top two" rule, Laya would pull up nearly every dispatch.

**CLAIM**
Laya's startup log printed `RuntimeWarning: laya: this checkpoint ships invalid temperatures or values outside [0.5, 5]; using choice:11+=0.1005… -> 0.5. Treat confidence from the affected entries as uncalibrated.` (service log, `laya-serve-8123`). That entry covers 11+-option choices, not this 5-option question. It is worth knowing, and it is not on fire.

**GUESS** (inference)
Caveats on the measurement:
- n=30, and the hand labels are a model's reading, not Jo's (the same caveat as `classifier-sample.md`).
- TypeSafe's 23/30 is the 2026-09-23 run, preserved from `results.jsonl`, and was not re-run today.
- Laya might do better with rewritten criteria, `head_max_len` tuning, or fine-tuning. None of that was tried, because the brief asked for the same set and the vendor itself says zero-shot is near chance.

## 5. Cost and latency

**CLAIM**
TypeSafe, measured by Tinker, preserved and not reproduced here. `judge()` wall times were 0.234, 0.202, 0.235, 0.468, and 0.252 s. `judge_batch` single item: `cost: 2.8602e-05`, `model: 'typesafe/jev-1.13.0'` (`/Users/jowolff/agent-scratch/tinker/phase5-prereq-tests/TINKER-REPORT.md:158-160`). This matches the brief's "0.20–0.47 s and $0.0000286/call"; the brief's figure is Tinker's.

**CLAIM**
Laya, measured here on an Apple M4 Pro with 24 GB (`sysctl` this session):
- Per classifier call, warm: p50 **0.086 s (MPS)** or **0.238 s (CPU)** for `english`, and **0.042 s (MPS)** for `multilingual`.
- First load plus warm-up for `multilingual`, including its checkpoint download: `load+warmup_s=71.07` (bg_11 stdout). The HF cache grew 323 MB → 807 MB while the English checkpoint downloaded (`du -sh` this session). English load times were printed but not preserved in this report's receipts, so they are not quoted.
- Disk: the HF cache for all three checkpoints is 2.2 GB, and the whole `/tmp/laya-eval` is 3.6 GB (`du -sh`).
- Marginal cost is $0. It needs a resident Python process holding one or two 0.8 GB checkpoints in memory.

**CITE**
Vendor latency claims: "32.8 ms (GPU) / 193–464 ms (CPU)" preloaded (README, `Router(preload=True)` row), and "measured on a T4" (README).

**GUESS** (inference)
Latency is not the deciding axis. Both are well under a second per dispatch. TypeSafe's per-dispatch cost is fractions of a cent: about $0.00003 × dispatches. Laya's cost is a resident process and about 1–2 GB of RAM on Jo's laptop.

## 6. Data boundary

**CLAIM**
Self-hosted Laya keeps text on the machine:
- In this session, `laya-serve` bound to `127.0.0.1:8123` (`LAYA_HOST=127.0.0.1`). The upstream default is `0.0.0.0` (`laya/serve.py` docstring, fetched), so a loopback bind has to be set explicitly.
- A grep of the installed package for `requests.`/`urllib.request`/`httpx.`/`urlopen`/`telemetry` found outbound HTTP only in the LangChain, LlamaIndex, and CrewAI integrations. Those post to a Laya server URL the caller configures.
- The only other network use is the Hugging Face weight download on first load, which was run here with `HF_HUB_DISABLE_TELEMETRY=1`.

**CLAIM**
The TypeSafe boundary is already ruled. SPEC OQ-2 records *"it's just my account"* and *"it is not a problem re typesafe"* (Jo, 2026-09-24; `/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md`, § Open questions, bullet OQ-2).

**GUESS** (inference)
What self-hosting would change:
- **OQ-1 (whose account, and therefore which repos may appear in briefs)** stops existing, because there is no vendor account and no MCA §5 rights warranty.
- **OQ-2 (whether workspace text may go to TypeSafe)** also disappears, and so does the Newdle-data exposure Tinker measured (7 auto-thinking briefs, plus any `find` inside a Newdle repo; `/Users/jowolff/agent-scratch/agent-system-2.0/typesafe-usage/REPORT.md` § Bottom line).
- SPEC § B15 item 6's gate would reduce to "a measurement exists".

Jo has already ruled both questions acceptable, so self-hosting removes a question that is closed, not one that is blocking. It would matter again only if a Newdle-owned key or Newdle-repo work made OQ-1 live. That is worth knowing, not on fire.

## 7. Integration with OMP, role by role

**CLAIM**
The mechanism. OMP treats any model whose `api` is a judgment API as a native judge:
- `kindOf` returns `"native"` when `isJudgmentApi(model.api)` is true (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/judgment/index.ts:120`).
- It builds a `TypeSafeJudge` with `baseUrl: model.baseUrl` (`…/judgment/index.ts:250-257`).
- The docs say: "`typesafe` and `openrouter-decisions` are judgment APIs … a model declared with one answers System One judgment requests (`{baseUrl}/v1/systemone` …) and is selected by the `judge` model role" (`omp://models.md`, *Allowed provider/model `api` values*).
- `TYPESAFE_BASE_URL` also "overrides the API root" (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-ai/src/judgment/typesafe.ts:49-52`), and it is "used by model discovery, `/login` validation, and System One requests" (`omp://environment-variables.md`, *TypeSafe judgments*).

**ACTION**
Live proof, all under a throwaway agent directory:
1. Wrote `/tmp/laya-eval/omp-agent/models.yml`: provider `laya-local`, `api: typesafe`, `auth: none`, `baseUrl: http://127.0.0.1:8123`, model `laya`. The first attempt failed validation with `invalid maxTokens` at `0`; after that was set to `1`, it loaded.
2. Wrote `/tmp/laya-eval/omp-agent/config.yml` with `modelRoles.judge: laya-local/laya` and `retry.fallbackChains.judge: []`.
3. Started `laya-serve` (english, MPS, loopback). Ran `env -u OMP_PROFILE -u PI_PROFILE -u TYPESAFE_API_KEY PI_CODING_AGENT_DIR=/tmp/laya-eval/omp-agent omp find "where does the HTTP server check the bearer token" /tmp/laya-eval/.venv/lib/python3.12/site-packages/laya`. Exit 0.
4. Result footer: `9 hit(s) … listed 29 · judged 29 · read 20 files (289.0KB) · 20 requests · 70K tokens · $0.0000 · 13.4s wall`. The server log shows 20 `POST /v1/systemone HTTP/1.1" 200 OK` from 127.0.0.1.
5. Stopped the service.

Reversal: `rm -rf /tmp/laya-eval`. The directory `PI_CODING_AGENT_DIR` pointed at is the only OMP state written.

**ACTION**
Comparison run: the same `omp find` query on the same public Laya source directory, through Jo's default profile, which resolves to TypeSafe. Exit 0. Output: `1 hit(s) … serve.py:325-462 0.97 … 6 requests · 23K tokens · $0.0009 · 431ms wall`. This made 6 TypeSafe requests on Jo's key, containing only open-source Laya code, at a cost of $0.0009. It is not reversible, being a vendor call. It may also have refreshed OMP's model-discovery cache in `~/.omp/agent`. That was not checked.

**CLAIM**
The correct answer is `_check_auth` at `/tmp/laya-eval/.venv/lib/python3.12/site-packages/laya/serve.py:382-387`, which is inside TypeSafe's single hit range (325–462). Laya ranked `serve.py` third of 9, behind `router.py:1-868` (0.84) and `agent.py` (0.83). Its hit ranges covered whole files, and its scores were bunched at 0.66–0.84.

| Role | Can OMP point it at Laya? | Receipt | What changes |
|---|---|---|---|
| (1) Pre-dispatch work-kind classifier | **Yes, two ways.** (a) Through the `judge` role, the same path as `find`. (b) The hook is unbuilt 2.0 code (DESIGN § D6 build question 1, decided in M3), so it can call `POST /v1/systemone` on any base URL itself. | `/Users/jowolff/code/agent-system-2.0/DESIGN-2.0.md` (manifest row "the classifier pre-dispatch hook"; D6 item 1); live `find` proof above | Accuracy 23/30 → 10–11/30 (§ 4.2). The 0.55 threshold is meaningless under Laya's confidence (§ 4.2). |
| (2) Native `find` | **Yes. Not hard-wired to TypeSafe.** `find.enabled: auto` enables when the judge role "resolves first to a native System One model"; a custom `api: typesafe` model qualifies, as proven live | `omp://tools/find.md` (*`find.enabled` is `auto` by default…*); live run above | One query: 9 diffuse hits versus 1 precise hit. `find` packs 46 sketches of 384 B into one request and verifies 8 KB passage windows (`omp://tools/find.md` § *How it works* 3–4). That is far past Laya's default 512/1024-token context, and OMP sends no `max_len` (**GUESS**, inferred from the wire shape; not traced), so Laya truncates. |
| (3) Future judge layer (§ B15 item 6) | **Yes**, by the same role or by direct HTTP | as above | Unmeasured for receipt checking. Laya's README reports weak `noul` behaviour ("`noul` can follow its option labels instead of the state … returning a confident 'no' for clearly positive input (#156)"), and B15's own note says judges on agent traces score AUROC ≤ 0.65 |

**CLAIM**
The constraint that bounds any mix. `modelRoles.judge` is one value per profile, and its consumers share it. `omp://local-models.md`:225 says "Auto-thinking, Smart unexpected-stop detection, typed Eval judgments, and AI-assisted git staging use the `judge` role". `omp://tools/find.md`:33 says `find` is enabled when "the `judge` model role resolves first to a native System One model". TTSR also consults the judge (`research/typesafe-ai.md` § 5.4, receipt there). "Laya for the classifier only" therefore means the classifier hook calls Laya over its own HTTP client, not the role.

**GUESS** (inference; not tested)
The `TYPESAFE_BASE_URL` route, which repoints the built-in `typesafe` provider at Laya, would probably break OMP's model discovery. `laya-serve` defines only `GET /health` and `POST /v1/systemone`, with no `GET /v1/models` (`@app.get`/`@app.post` routes in `laya/serve.py`, fetched this session). The custom-provider route in `models.yml` avoids that, and it is the one that was proven.

## 8. Recommendation

**GUESS** (inference, from § 4.2 and § 7)
Keep TypeSafe everywhere. Record Laya as a known-compatible, local fallback that is one `models.yml` block away. It is worth revisiting only if a Newdle-owned key makes the data boundary live again, or if 2.0 accumulates a few hundred labelled briefs to fine-tune on. The closing QUESTION with all four options is at the top under *Needs Jo*.

## Sources

- Laya: https://laya.convaiinnovations.com/, https://raw.githubusercontent.com/NandhaKishorM/laya/main/README.md, https://raw.githubusercontent.com/NandhaKishorM/laya/main/BENCHMARKS.md, https://raw.githubusercontent.com/NandhaKishorM/laya/main/laya/serve.py, https://api.github.com/repos/NandhaKishorM/laya (plus the `/releases`, `/tags`, `/commits`, and `/contributors` endpoints), https://pypi.org/pypi/laya/json, https://huggingface.co/api/models/convaiinnovations/laya, https://api.github.com/repos/F0Rextasy/omp-laya-judge
- Third-party Jev figures: https://raw.githubusercontent.com/AbdelStark/jev-benchmarks/main/README.md, https://raw.githubusercontent.com/nibzard/decision-model-benchmark/main/README.md
- TypeSafe: https://docs.typesafe.ai/models.md, https://docs.typesafe.ai/confidence.md
- OMP: `omp://models.md`, `omp://environment-variables.md`, `omp://tools/find.md`, `omp://local-models.md`, `omp://settings.md`, `omp://auth-broker-gateway.md`; source `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-ai/src/judgment/typesafe.ts`, `…/pi-coding-agent/src/judgment/index.ts`, `…/pi-coding-agent/src/tools/jfind/questions.ts` (OMP 18.3.0, `omp --version`)
- First-party: `research/typesafe-ai.md`, `research/typesafe-data-terms.md`, `research/classifier-sample.md`, `SPEC-2.0.md` (§ A1, § B15 item 6, OQ-1/OQ-2), `DESIGN-2.0.md`, `MIGRATION.md` (row M3), `/Users/jowolff/agent-scratch/agent-system-2.0/typesafe-usage/REPORT.md`, `/Users/jowolff/agent-scratch/tinker/phase5-prereq-tests/TINKER-REPORT.md`, the ClassifierSample transcript line 70

## Unverified

**GUESS**
Each item below is also marked at its point in the body:
- Where Jev's typed-decisions 0.727 was published. Laya attributes it to "third-party … and TypeSafe AI", and neither third-party README fetched here contains it.
- Whether Laya does better with reworded criteria or a fine-tuned head. Not tried.
- Whether the `TYPESAFE_BASE_URL` route works against `laya-serve`. Not tried.
- Laya on the receipt-checking task. Not measured.
- Why the star count and download count diverge.
- Whether the comparison `find` call changed `~/.omp/agent/models.db`.

## Coverage

| Subject | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| Laya vendor pages | landing page, README, BENCHMARKS.md, serve.py, GitHub/PyPI/HF APIs, releases/tags/commits/contributors endpoints | all; README and BENCHMARKS.md by targeted grep, not end to end | none | yes. Every figure used carries its passage |
| Third-party Jev benchmarks | AbdelStark README, nibzard README | both | none | yes for attributing Laya's Jev figures. No for the typed-decisions 0.727 source |
| TypeSafe docs | models.md, confidence.md | both | none | yes |
| OMP docs and source | 6 `omp://` docs (grep), 3 source files | the cited spans | `models.yml` first write failed validation (`invalid maxTokens`), fixed | yes. The integration was proven live |
| First-party 2.0 files | the 5 files in the brief, plus DESIGN-2.0.md, MIGRATION.md, the TINKER report, and the ClassifierSample transcript | cited spans | the first `grep` of SPEC was refused by the ctx-first hook; ran `ctx search` and retried | yes |
| Local runs | 4 eval runs, 1 serve, 2 `omp find` | all output read | none | yes for zero-shot; fine-tuned Laya not covered |

**PMDW**
Retrieved but never opened:
- The Laya demo Space.
- The laya-typed-decisions and laya-multilingual HF model pages. Their checkpoints were run, but the cards were not read.
- The omp-laya-judge repo contents (only its metadata).
- The dev.to article.
- The arXiv papers linked from the landing page.
- The ctx search hits other than the ClassifierSample session.
- `artifact://208` (the full PyPI JSON): extracted by `curl | python`, not read by hand.

None of these would move the measured accuracy.

## /tmp paths left behind

**ACTION**
Everything is under `/tmp/laya-eval/`, 3.6 GB total. Remove it with `rm -rf /tmp/laya-eval`.
- `/tmp/laya-eval/.venv/`: the Python 3.12 venv with `laya[serve]==0.3.21`.
- `/tmp/laya-eval/uv-cache/` (705 MB).
- `/tmp/laya-eval/hf/` (2.2 GB), holding all three checkpoints.
- `/tmp/laya-eval/omp-agent/`: the throwaway OMP agent dir with `models.yml`, `config.yml`, `agent.db*`, and `models.db*`.
- `/tmp/laya-eval/run_eval.py` and `/tmp/laya-eval/analyze.py`.
- `/tmp/laya-eval/classifier_cell_line70.py`.
- `/tmp/laya-eval/results-{english-mps,english-cpu,multilingual-mps,typed-decisions-mps}.jsonl`.

No service is left running: `laya-serve-8123` was stopped.

## Candidate lessons

**CLAIM**
A vendor's "outperforms X" table can be run in minutes when both sides speak the same wire protocol. Laya's `POST /v1/systemone` let the real 2.0 question and the real OMP `find` tool run against it unchanged. That turned a vendor claim into a local measurement in about 20 minutes of compute.

**GUESS** (inference)
Before comparing two models' "accuracy" figures, check whether one of them is fine-tuned on the benchmark's own train split. Here that single fact accounted for the entire headline gap, and the vendor had disclosed it two sections below the headline.

<!-- output-types tier: 0 CLAIM: 17 CITE: 12 GUESS: 11 ACTION: 5 PMDW: 3 QUESTION: 1 -->
