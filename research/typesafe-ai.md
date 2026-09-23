# TypeSafe (System One / Jev) and OMP: research for agent-system 2.0

**PMDW**
Research report, written 2026-09-23 by the `TypeSafeResearch` subagent for the 2.0 redesign. It is read-only. Nothing was installed or configured, and the TypeSafe API was not called. OMP source was read from the installed package at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/`, version 18.2.11 (`pi-coding-agent/package.json:3`). OMP docs were fetched from `can1357/oh-my-pi@main`. TypeSafe docs were fetched from `docs.typesafe.ai`.

## Needs Jo: blockers and questions

**GUESS** (inference; blocker: missing evidence)
Nobody knows how long a small, dispatch-sized routing call takes. The only published latency figure is a vendor cookbook number for a much larger call: 0.27 s for 13 questions over about 54,000 characters, on jev-1.12. That figure appears in §5.1. Calling the API was out of scope for this brief. The question is settled by one timed call per candidate taxonomy, run from an OMP eval cell with a credential.

**GUESS** (inference; blocker: missing evidence)
Nobody knows how accurate Jev is on a 2.0 work-kind taxonomy. The vendor says calibration "is measured across groups of predictions; it does not guarantee that an individual answer is correct" (https://docs.typesafe.ai/concepts/system-one.md). The question is settled by a labelled set of past slices scored against Jev's picks. The repo has no labelled set yet, and P-9's taxonomy is still open (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:43`, "Open for Phase 5" column).

**QUESTION**
Should the 2.0 OMP profile hold a TypeSafe credential at all?
- **Yes, via `/login typesafe` on the 2.0 profile.** The native judge, the routing classifier (§5.1), TTSR rule judging, and the `find` tool all come on together, because each is gated on the judge role resolving to a native model (§3.2). The cost is sending prompt and state text to a third party.
- **No.** OMP falls back to the `@tiny`/`@smol`/`@default` chat models for `judge()` (§3.2). The `find` tool and TTSR judging stay off under their `auto` settings, and §5.1 would run on a prompted chat model instead.

Recommended default: yes, but only after the data-governance question below is read. The routing use in §5.1 has no equivalent at this price in the fallback chain.

**QUESTION**
Are TypeSafe's data terms acceptable for sending slice briefs, which contain repo text, to the API? The docs page links a DPA, an MCA, and a privacy policy (https://docs.typesafe.ai/legal.md). None of those three linked documents was fetched. What the docs pages themselves say is in §2.
- **Accept the docs-level statements.** They say Jev is not trained on customer data and that zero data retention is available on enterprise plans.
- **Read the DPA first.**

Recommended default: read the DPA first. It is one fetch, and slice briefs carry repo content.

## 1. Bottom line

**CITE**
TypeSafe sells **Jev**, a "System One" model. It takes a state plus typed questions (Choice, Score, Noul) and returns typed answers with probabilities and confidence, and it never generates text. The price is $0.042 per million input tokens, and output is free (https://docs.typesafe.ai/introduction, https://docs.typesafe.ai/models.md).

**CLAIM**
TypeSafe works with OMP **natively**. The installed OMP ships a `typesafe` provider, a `/login typesafe` / `TYPESAFE_API_KEY` credential, and a `judge` model role whose default chain starts with `typesafe/jev-latest`. The eval tool's `judge(state, questions)` helper resolves through that chain (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/priority.json:116-121`, `.../src/prompts/tools/eval.md:34-35`, `.../src/judgment/index.ts:234-236`).

**CLAIM**
The native path contains no Claude Code at all. The Claude Code skill at `/Users/jowolff/.claude/skills/typesafe-ai/SKILL.md` is guidance-only prose that teaches an agent to write TypeSafe calls. It is not a runtime dependency of anything.

**GUESS** (inference, from the cited API shape and price plus OMP's own difficulty classifier)
The top use is P-9 routing. A lane asks Jev one Choice question per slice, "which tier does this slice need", and gets back a typed tier and a confidence. OMP's auto-thinking classifier already does the same thing for reasoning effort. Per-call latency and taxonomy accuracy are unmeasured (see Needs Jo).

**GUESS** (inference)
The second use is cheap typed checks at slice close: whether the evidence artifact matches the done-condition (P-4, P-8b, P-20), feeding a verify-and-escalate pattern rather than acting as the gate itself.

## 2. What TypeSafe is

**CITE**
Product. https://docs.typesafe.ai/introduction: Jev is the flagship model and the first "System One" model. It takes state plus typed questions and returns typed answers and probabilities, with no text generation. There are three primitives:
- **Choice** returns `choice`, `probabilities`, and `confidence`.
- **Score** returns `score`, `probabilities`, and `confidence`.
- **Noul** returns a 0–1 value.

All questions in one call are evaluated in parallel and in isolation from each other.

**CITE**
Coding-agent positioning. https://docs.typesafe.ai/introduction/coding-agents.md: "Jev is **not** a drop-in replacement for the LLM behind Claude Code…" and "There is no `model: "jev-latest"` setting that turns your coding agent into a Jev-powered agent." Jev is a component that an agent calls. It is not the agent's brain.

**CITE**
API surface. https://docs.typesafe.ai/api.md and https://docs.typesafe.ai/introduction/quickstart.md:
- One endpoint, `POST https://api.typesafe.ai/v1/systemone`, with `Authorization: Bearer $TYPESAFE_API_KEY`.
- Required fields: `state` (a string, object, or array), `model` (for example `jev-latest`), and `questions` (a named map).
- Choice allows up to 255 options. Score takes 2–10 levels. Noul `criteria` is optional.
- The response carries `model`, `answers`, and `usage{input_tokens, output_tokens}`.
- Error codes are 401, 422, 429, and 529. The SDKs retry 429 and 529 with backoff.
- The quickstart's example response reports `"model":"jev-1.13.0"` with 392 input and 65 output tokens.

**CITE**
Confidence. https://docs.typesafe.ai/confidence.md (fetched as a docs page this session): Choice and Score return `confidence` in [0,1], derived from the probability distribution. Noul has no confidence value. Thresholds scale with risk and "depend on your domain."

**CITE**
Models, pricing, and limits. https://docs.typesafe.ai/models.md:
- Jev 1.13 (`jev-1.13.0`) costs "$42 / $0.042" per billion / per million tokens, "Charged per input token. Output tokens are free."
- Rate limits are 250,000 tokens per second and 1,200 requests per minute. "Rate limits are adjusting dynamically… can change without notice."
- Context is 64k tokens per request, with 32k for state plus the longest question. Input is text only.
- `jev-latest` and `jev-preview` both alias 1.13.0. The page advises pinning a version ID if thresholds were tuned against a version.
- `GET /v1/models` lists the available models. There are no per-account fine-tunes.
- "Jev is not trained on customer requests or responses." Zero data retention is available on enterprise plans.

**CITE**
Credentials and SDKs:
- Keys come from `console.typesafe.ai/keys` (quickstart).
- Python: `pip install typesafe-sdk` reads `TYPESAFE_API_KEY`, `TYPESAFE_BASE_URL`, `TYPESAFE_DEFAULT_MODEL`, and `TYPESAFE_LOG_LEVEL`, with defaults of base `https://api.typesafe.ai`, model `jev-latest`, and timeout 10.0 s (https://docs.typesafe.ai/sdk/python/api/constants.md).
- JavaScript: `npm install @typesafe-ai/sdk` requires Node 20+, reads `TYPESAFE_API_KEY`, and is at v0.6.0 (https://docs.typesafe.ai/sdk/javascript.md).
- Any other language can call the HTTP API directly (https://docs.typesafe.ai/sdk.md).

**CITE**
Legal. https://docs.typesafe.ai/legal.md links a DPA (typesafe.ai/legal/data-processing), an MCA, and a privacy policy. Zero data retention is requested through privacy@typesafe.ai. The linked documents themselves were **not** fetched.

**CITE**
Known weaknesses. https://docs.typesafe.ai/model-jaggedness/jev-1.13.md, for jev-1.13, reviewed 2026-09-17, lists these failure modes:
- literal reading
- math and counting
- dates
- indirection
- large irrelevant state
- adversarial content ("State is data… does not treat it as hostile by default")
- contradictory criteria
- structural invariants
- generation

**CITE**
Pricing page. `https://typesafe.ai/pricing` returned HTTP 404. This did not cost the answer, because models.md carries the price.

## 3. Integration paths

### 3.1 Claude Code skill (installed)

**CLAIM**
`/Users/jowolff/.claude/skills/typesafe-ai/SKILL.md` is 149 lines of prose guidance and was read in full. It tells the agent to:
- read the live docs, starting from `llms.txt`, and append `.md` to any page path;
- design Choice/Score/Noul questions;
- compose and verify calls;
- "Keep API credentials server-side."

The directory holds only `SKILL.md` and `LICENSE`, both with mtime 2026-09-23 16:27. It is a plain directory, not a symlink, and has no `.claude-plugin` wrapper. It contains no executable code, no MCP server, and no hooks.

**CITE**
Vendor install paths for the skill (https://docs.typesafe.ai/agent-skill.md, quickstart):
- `claude plugin marketplace add typesafe-ai/skills` followed by `claude plugin install typesafe@typesafe-ai`, invoked as `/typesafe:typesafe-ai`;
- `npx skills add typesafe-ai/skills --skill typesafe-ai` for other agents;
- or copying `skills/typesafe-ai` manually.

The local install matches the manual-copy form.

**CITE**
The source repo is `typesafe-ai/skills`, described as "Agent skills for building with TypeSafe's System One API" (https://api.github.com/orgs/typesafe-ai/repos).

**GUESS** (inference, from `/Users/jowolff/code/agent-system-2.0/INVENTORY.md:348`, which says `~/.claude/skills/*` loads into OMP via `claude.ts`)
OMP sessions probably discover this skill too. It does not appear in this session's skill list, and loading was not tested. Either way the skill only changes how an agent *writes* TypeSafe calls. It is not needed for OMP's native judge.

### 3.2 OMP native: the `judge()` lead, resolved

**CLAIM**
The lead is correct. All paths below are under `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/`, version 18.2.11.

| What | Receipt |
|---|---|
| `judge(state, questions)` in the eval tool: "Cheap and fast (TypeSafe when credentialed, else the tiny/smol chat model)". `judgeBatch`/`judge_batch` is also available. | `pi-coding-agent/src/prompts/tools/eval.md:34-35`, `:39` |
| Eval bridge `__judge__`; Noul is renamed `bool` on the eval side | `pi-coding-agent/src/eval/judgment-bridge.ts:1-13`, `:32`; calls `resolveJudge` at `:177` |
| Default `judge` role chain `["typesafe/jev-latest","@tiny","@smol","@default"]` | `pi-coding-agent/src/priority.json:116-121` |
| Chain resolution: a candidate with no key is skipped with `no API key for <provider>/<id>`; the chain throws `judgment: no judge model available` when empty | `pi-coding-agent/src/judgment/index.ts:141`, `:188`, `:201` |
| A judgment-API model becomes `new TypeSafeJudge(...)`; others use a prompted `TextJudge` | `pi-coding-agent/src/judgment/index.ts:233-236` |
| `hasNativeJudge` is true only when the first chain candidate is a judgment API | `pi-coding-agent/src/judgment/index.ts:135-138` |
| Usage is journaled with `role: TYPESAFE_PROVIDER` | `pi-coding-agent/src/judgment/index.ts:310-311` |
| Env: "`TYPESAFE_API_KEY` is resolved by the auth registry (`rules/auth/typesafe.kdl`), `TYPESAFE_BASE_URL` overrides the API root, `TYPESAFE_DEFAULT_MODEL` the model"; routes `/v1/systemone` (typesafe) and `/decisions` (openrouter-decisions) | `pi-ai/src/judgment/typesafe.ts:2-14`, `:32-33`, `:36-39`, `:50-56` |
| Credential: `auth "typesafe" { env "TYPESAFE_API_KEY"; login "api-key" … validate "models-endpoint" url="https://api.typesafe.ai/v1/models" … }`, which is the `/login typesafe` flow | `pi-catalog/src/compat/rules/auth/typesafe.kdl` (whole file) |
| Provider `typesafe`, default model `jev-latest`, `cost input=0.042 output=0`, `supports-tools #false`, kind `"judge"` | `pi-catalog/src/compat/rules/providers/typesafe.kdl` |
| Alternate route through OpenRouter: `api="openrouter-decisions"`, model `~typesafe/jev-latest` | `pi-catalog/src/compat/rules/providers/openrouter.kdl:20-21` |
| `omp auth-gateway` serves `POST /v1/systemone`, so SDK clients point `TYPESAFE_BASE_URL` at it "and never hold the real key" | `pi-ai/src/auth-gateway/server.ts:825-829`, `pi-ai/src/auth-gateway/routes/systemone.ts:1-12`, `pi-ai/src/providers/systemone-server.ts:2-4` |
| Help text: `TYPESAFE_API_KEY - TypeSafe System One judgments (auto thinking, unexpected-stop, AI staging, eval judge())` | `pi-coding-agent/src/cli/help-extra.ts:61` |
| Settings: `ttsr.judge` and `find.enabled` default to `auto`, meaning "Judge only when the judge role resolves to a native TypeSafe jev model" | `pi-coding-agent/src/config/settings-schema.ts:3471-3486`, `:4308-4322` |
| The legacy `providers.judgmentProvider` setting migrates into the `judge` role | `pi-coding-agent/src/config/settings.ts:2857-2878` |
| Shipped in 18.2.4 (2026-09-17): "Added TypeSafe provider support through `/login typesafe` or `TYPESAFE_API_KEY`…", "Added the `judge(state, questions)` evaluation helper…"; the judge role with fallbacks arrived in 18.2.7; native judges through custom providers in 18.2.8 | `pi-coding-agent/CHANGELOG.md:207-217`, `:144-145`, `:113` |

**CITE**
OMP upstream docs (https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md): "`typesafe` and `openrouter-decisions` are judgment APIs, not chat transports… selected by the `judge` model role."

**CITE**
https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md:
- Its example sets `modelRoles.judge: typesafe/jev-latest` with `retry.fallbackChains.judge: [typesafe/jev-preview, "@tiny","@smol","@default"]`.
- It states: "Built-in model-kind roles are `image`, `web`, `speech`, `dictation`, and `judge`…"
- It lists the available judge models with `omp models --kind judge`.

**CLAIM**
Every in-tree caller of the judge chain, from a grep of `resolveJudge|hasNativeJudge|judgment/index` over `pi-coding-agent/src`:
- `auto-thinking/classifier.ts:109`
- `cli/find-cli.ts:120`
- `git-tui/ai-stage.ts:119`
- `eval/judgment-bridge.ts:177`
- `session/agent-session.ts:2459-2460` (TTSR `ruleJudge`)
- `session/unexpected-stop-classifier.ts:69`
- `tools/jfind/index.ts:49`, `:105`

Nothing under `src/task/` calls it. OMP's `task` tool does **not** consult the judge when it picks a subagent's model today.

**CLAIM**
The extension API exposes no judge surface. A grep of `(?i)judge|judgment` over `pi-coding-agent/src/extensibility` returned no matches, run earlier this session.

**CLAIM**
Local state:
- `/Users/jowolff/.omp/agent/config.yml:18-20` sets `modelRoles` only for `commit` and `web`, so the default judge chain applies.
- `printenv TYPESAFE_API_KEY | wc -c` printed `0`, so the variable is not set in this process.

Whether a stored `/login typesafe` credential exists in OMP's auth store was **not** checked. As a result, whether this machine's judge currently resolves to Jev or to `@tiny` is unknown.

### 3.3 MCP

**GUESS** (inference, from absence)
TypeSafe publishes no MCP server. The docs index (`https://docs.typesafe.ai/llms.txt`) lists no MCP page. The TypeSafe GitHub org repo list (https://api.github.com/orgs/typesafe-ai/repos) shows no MCP repo: its repos are the site, `skills`, `typesafe-sdk-python`, `typesafe-sdk-js`, `system-one-adapter-python`, `Overwatch` (no description), `daggerverse`, and three forks. Absence from an index is not proof. An MCP wrapper would add nothing on OMP anyway, because the native path exists.

### 3.4 SDK, CLI, HTTP

**CITE**
Python and JavaScript SDKs plus raw HTTP are the documented paths (https://docs.typesafe.ai/sdk.md). All three are harness-independent: anything that can make an HTTPS request with a bearer token can call Jev.

**CITE**
`typesafe-ai/system-one-adapter-python` is described as a "Drop-in TypeSafeClient replacement backed by LLM APIs" (https://api.github.com/orgs/typesafe-ai/repos). The repo itself was not opened.

**GUESS** (inference, from absence)
There is no TypeSafe CLI. The docs index shows no CLI page, and the org shows no CLI repo.

### 3.5 Codex

**CITE**
The vendor positions the skill as working for "Claude Code, Codex, and other agents," installed via `npx skills add` (https://docs.typesafe.ai/introduction/coding-agents.md, https://docs.typesafe.ai/agent-skill.md). As with Claude Code, the Codex path is guidance only. Codex does not become a Jev runtime.

## 4. P-19 assessment (fact, not a ruling)

**CLAIM**
P-19 requires every 2.0 mechanism to be "built on OMP's own facilities; nothing depends on Claude Code, HerdR, or the newdle plugin" (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:53`).

| Path | Depends on Claude Code? | Receipt |
|---|---|---|
| OMP native `judge` role, eval `judge()`, auto-thinking, TTSR judge, `find` | No. The credential is `/login typesafe` or `TYPESAFE_API_KEY` in OMP's own auth registry | §3.2 table |
| OMP `auth-gateway` `/v1/systemone` proxy | No | `pi-ai/src/auth-gateway/server.ts:825-829` |
| Direct HTTP / SDK from 2.0 code | No | https://docs.typesafe.ai/sdk.md |
| Claude Code plugin install (`claude plugin install typesafe@typesafe-ai`) | Yes, for installation. It is guidance only and not required by any runtime path | https://docs.typesafe.ai/agent-skill.md |
| `~/.claude/skills/typesafe-ai/` (current install) | Lives in a Claude Code directory. It is guidance only and not required by any runtime path | §3.1 |

**GUESS** (inference)
If 2.0 wants the guidance skill, P-18 and P-15 would re-home it into the portable repo rather than leave it in `~/.claude/skills/`. That is a Phase 5 disposition question, not a runtime dependency.

## 5. Concrete uses in 2.0, ordered by value

### 5.1 P-9 tier routing (first candidate, per Jo)

**CLAIM**
P-9 reads: "A work-kind rule picks a hand's tier, a per-workload ceiling bounds every lane opened on it, no human approval per dispatch. The orchestrator sets the ceiling…" (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:43`). P-8 puts hand-spawning in the lane, not the orchestrator (`REQUIREMENTS.md:38`, same file). P-8d governs spend by model routing (`REQUIREMENTS.md:42`, same file). The tier pick therefore happens inside a lane, at the moment it briefs a hand on a slice.

The four questions Jo asked, answered one at a time:

**Can it return a typed tier with a confidence?**

**CITE**
Yes. A Choice question takes up to 255 named options and returns `choice`, `probabilities`, and `confidence` in [0,1] (https://docs.typesafe.ai/api.md, https://docs.typesafe.ai/confidence.md). The vendor's intent-routing pattern uses exactly this shape: "TypeSafe can sit in front of all of these as a fast, cheap classifier that determines which handler to invoke." It pairs a Choice for intent with a Score for complexity and gates on confidence ≥ 0.5 (https://docs.typesafe.ai/patterns/intent-routing.md). A companion confidence-routing pattern uses thresholds of 0.6 and 0.85 (https://docs.typesafe.ai/patterns/confidence-routing.md).

**CLAIM**
OMP already ships the same mechanism for a neighbouring decision. `classifyDifficulty` asks one Choice question over `low|medium|high|xhigh` (plus `max` when the model has it), maps the answer to a reasoning Effort, and clamps it under a ceiling (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/auto-thinking/classifier.ts:4-12`, `:52-64`, `:105-130`). A local on-device judge gets a coarser 3-bucket question (`classifier.ts:7-9`, `:124-125`). The structure matches P-9: a classifier picks a level, and a separately set ceiling bounds it.

**What does one call cost?**

**CITE**
$0.042 per million input tokens, and output is free (https://docs.typesafe.ai/models.md). OMP's catalog carries the same price: `cost input=0.042 output=0` (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-catalog/src/compat/rules/providers/typesafe.kdl`).

**GUESS** (inference: arithmetic on the cited price with an assumed brief size)
A 2,000-token slice brief plus the question would cost about $0.00008 per call. The quickstart's 392-token example would cost about $0.000016. The token counts are assumptions, not measurements of real 2.0 slice briefs.

**How long does one call take?**

**CITE**
The only published figure comes from the vendor cookbook, on jev-1.12, not 1.13: "one call, all 13 … $0.000497 0.27s" versus "13 calls, one each … $0.006090 2.71s", for 13 questions over an article of about 54,000 characters (https://docs.typesafe.ai/cookbooks/parallel_questions.md). This is a vendor measurement, not one taken here.

**GUESS** (inference)
A single-question call over a short brief is likely no slower than that figure. This is unverified. No call was made. Measuring it is the latency blocker in Needs Jo. The Python SDK's 10 s default timeout (https://docs.typesafe.ai/sdk/python/api/constants.md) is an upper bound on waiting, not a latency figure.

**Is it fast and cheap enough for every dispatch?**

**CITE**
On rate and cost, the documented limits are 1,200 requests per minute and 250,000 tokens per second, "adjusting dynamically… can change without notice" (https://docs.typesafe.ai/models.md).

**GUESS** (inference)
Dispatch volume under P-14's budget is far below 1,200 per minute, and the per-call cost in the arithmetic above is negligible next to any hand's chat-model spend. The latency half of "fast enough" is unmeasured.

**Can OMP call it at dispatch time with no Claude Code?**

**CLAIM**
Yes, through the eval tool. `judge(state, questions)` is available in every OMP session with the eval tool, and it resolves through the `judge` role chain to Jev when credentialed (§3.2). Claude Code is not in the path.

**CLAIM**
There is no built-in dispatch hook yet. OMP's `task` tool does not call the judge (grep in §3.2), and the extension API exposes no judge (§3.2).

**GUESS** (inference)
A lane would route in one of three ways: call `judge()` from an eval cell before spawning a hand; call `/v1/systemone` from 2.0's own machinery, directly or through `omp auth-gateway`; or wait for a future OMP extension surface. Which of these fits P-11's mechanical-gate rule is a Phase 5 design choice.

**GUESS** (inference, from the jaggedness page and the calibration caveat)
Caveats specific to routing:
- Jev reads literally and struggles with indirection, so tier criteria written as crisp observable features ("touches more than one repo", "requires a migration") should outperform abstract ones.
- Calibration holds only in aggregate, so a low-confidence pick should fall back to a default tier rather than trust the argmax.
- Pin `jev-1.13.0` instead of `jev-latest` once thresholds are tuned, as models.md advises.

### 5.2 Slice-close checks for P-4, P-8b, and P-20

**CLAIM**
P-20 gives every slice a done-condition and makes the slice the unit P-8b and P-4 close on (`REQUIREMENTS.md:54`). P-4 requires an inspectable evidence artifact at every gate (`REQUIREMENTS.md:31`).

**GUESS** (inference)
A Noul or Choice question over (done-condition, evidence artifact) is a cheap first-pass check. Low confidence or a "no" escalates to a model or to Jo, in the style of the vendor's confidence-routing pattern. It cannot be the P-4 gate itself, because "the lane said so" is not a gate result and a probabilistic judge is not an inspectable artifact. It is a filter in front of the gate. The "structural invariants" and "literal reading" failure modes on the jaggedness page apply here.

### 5.3 Slice brief validation for P-20

**GUESS** (inference)
Before a hand is spawned, a Noul question ("does this brief state a checkable done-condition?") enforces P-20's "a hand never gets an open-ended brief" cheaply. The brief's minimum fields are still open for Phase 5 (`REQUIREMENTS.md:54`).

### 5.4 Mechanical rule judging (P-11-adjacent) via TTSR

**CLAIM**
OMP's TTSR rule matcher already consults the judge when `ttsr.judge` is `on`, or `auto` with a native judge (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/session/agent-session.ts:2458-2460`, `.../src/config/settings-schema.ts:3471-3486`).

**GUESS** (inference)
Written (non-mechanical) rules under P-11 could get a judged trigger on OMP's own facility. This path was not traced beyond the settings gate and the call site.

### 5.5 P-16 observation (propose, never apply)

**GUESS** (inference)
Classifying lane transcripts or error events into a fixed taxonomy (repetition, rule violation, tool failure) with Choice questions, then counting, gives P-16's "observes its own errors and repetitions" (`REQUIREMENTS.md:50`) a cheap tagger. The proposal itself still needs a generating model, because Jev does not generate text. P-16 is marked lower priority in REQUIREMENTS.

### 5.6 Skill and tool suggestion for hands

**CITE**
The vendor's skill-suggestion cookbook: two Jev requests pick at most one of 182 Hermes skills. Wrong loads fell from 16.8% to 7.3% and needless loads from 9.8% to 4.0% across 488 requests with claude-haiku-4-5, on jev-1.12, with thresholds of 0.30 (https://docs.typesafe.ai/cookbooks/skill_suggestion.md). These are vendor measurements, not reproduced here.

**CLAIM**
OMP's `find` tool is already a native-judge consumer, enabled under `auto` only when the judge is native (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/tools/jfind/index.ts:41-49`).

### 5.7 What it is not for

**CITE**
Jev is "not a drop-in replacement for the LLM behind Claude Code" (https://docs.typesafe.ai/introduction/coding-agents.md), and generation is listed as a failure mode (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md). It cannot be a hand or a lane model.

**CITE**
"State is data… does not treat it as hostile by default" (https://docs.typesafe.ai/model-jaggedness/jev-1.13.md). Any use over untrusted text, such as PR bodies or web content, needs the adversarial caveat in its design.

## 6. Open questions and what settles each

| Open question | What would settle it |
|---|---|
| Per-call latency for a dispatch-sized Choice | One timed `judge()` call from an OMP eval cell with a credential. Blocked here by the brief's no-API-call constraint |
| Accuracy on the 2.0 work-kind taxonomy | Taxonomy ruled (P-9, Phase 5), then a labelled set of past slices scored against Jev |
| Whether this machine already holds a `/login typesafe` credential | `omp models --kind judge`, or inspecting OMP's auth store under the 2.0 profile. Not run |
| Whether a slice brief's content is acceptable to send | Fetch and read the DPA at typesafe.ai/legal/data-processing (Needs Jo) |
| Where the routing call lives: an eval cell, 2.0 machinery over HTTP, or an OMP extension | Phase 5 design; depends on P-11's mechanical-rule list |
| Whether `openrouter-decisions` is an acceptable substitute route (for billing consolidation) | `pi-catalog/src/compat/rules/providers/openrouter.kdl:20-21` shows it exists; OpenRouter's docs for `/decisions` were not fetched |
| Whether 2.0 keeps the guidance skill | P-18 per-artifact disposition in Phase 5 |

**CLAIM**
Superseded prior work: `/Users/jowolff/agent-scratch/claude/typesafe-ai-omp-integration-research.md` was written against OMP 18.2.3, before the native integration shipped in 18.2.4 (`pi-coding-agent/CHANGELOG.md:207-217`). Its recommendation to build a custom TypeSafe tool is superseded by the native `judge` role.

---

**Question**
What is TypeSafe, can OMP use it without Claude Code, and what could 2.0 do with it, starting with P-9 tier routing?

**Answer**
TypeSafe sells Jev, a typed-judgment model priced at $0.042 per million input tokens with free output (CITE, models.md). OMP 18.2.4 and later integrates it natively: a `judge` model role credentialed by `/login typesafe` or `TYPESAFE_API_KEY`, surfaced as eval `judge()` (CLAIM, §3.2). The native path contains no Claude Code, and the Claude Code or Codex skill is guidance only (CLAIM, §3.1, §4). For P-9 routing, the typed tier with a confidence is supported (CITE). Cost is negligible, though the per-call figure is my arithmetic on a GUESSed token count. Latency for small calls and accuracy on a work-kind taxonomy are unmeasured (GUESS). Callability from OMP without Claude Code is established through eval `judge()`, but no dispatch-time hook exists in `task` (CLAIM).

**Sources**
- TypeSafe docs:
  - https://docs.typesafe.ai/introduction
  - https://docs.typesafe.ai/introduction/quickstart.md
  - https://docs.typesafe.ai/introduction/coding-agents.md
  - https://docs.typesafe.ai/concepts/system-one.md
  - https://docs.typesafe.ai/agent-skill.md
  - https://docs.typesafe.ai/api.md
  - https://docs.typesafe.ai/models.md
  - https://docs.typesafe.ai/confidence.md
  - https://docs.typesafe.ai/sdk.md
  - https://docs.typesafe.ai/sdk/python/api/constants.md
  - https://docs.typesafe.ai/sdk/javascript.md
  - https://docs.typesafe.ai/legal.md
  - https://docs.typesafe.ai/model-jaggedness/jev-1.13.md
  - https://docs.typesafe.ai/patterns/intent-routing.md
  - https://docs.typesafe.ai/patterns/confidence-routing.md
  - https://docs.typesafe.ai/cookbooks/parallel_questions.md
  - https://docs.typesafe.ai/cookbooks/skill_suggestion.md
  - https://docs.typesafe.ai/llms.txt
- TypeSafe GitHub org: https://api.github.com/orgs/typesafe-ai/repos
- OMP upstream docs:
  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/models.md
  - https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/settings.md
- OMP source (installed package): the files listed in the §3.2 table, plus `auto-thinking/classifier.ts`, `tools/jfind/index.ts`, and `session/unexpected-stop-classifier.ts`
- Local files:
  - `/Users/jowolff/.claude/skills/typesafe-ai/SKILL.md`
  - `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md`
  - `/Users/jowolff/code/agent-system-2.0/INVENTORY.md`
  - `/Users/jowolff/.omp/agent/config.yml`

**PMDW**
Every TypeSafe doc URL above was checked against the `llms.txt` index this session. The System One, parallel-questions, skill-suggestion, jaggedness, and Python-constants passages were re-fetched at these exact URLs.

**Unverified**
Each item is also marked GUESS at its point in the body:
- small-call latency;
- taxonomy accuracy;
- per-call cost for real 2.0 briefs;
- the absence of an MCP server and a CLI;
- whether OMP loads `~/.claude/skills/typesafe-ai`;
- whether a stored `/login typesafe` credential exists;
- DPA and MCA content;
- the `openrouter-decisions` route's terms;
- how a TTSR judged trigger behaves beyond its call site.

**Coverage**

| Subject | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| TypeSafe docs | `llms.txt` index plus about 17 pages | All listed in Sources | None among fetched pages | Yes for what TypeSafe is, its API, price, and integration paths. No for latency, which needs a live call |
| TypeSafe pricing and legal | `typesafe.ai/pricing`; `legal.md` | `legal.md` | `typesafe.ai/pricing` returned HTTP 404 (did not cost the answer; models.md has the price) | No for data governance: the DPA, MCA, and privacy pages were never fetched |
| TypeSafe GitHub org | Repo list | First 300 lines of about 1,166, plus a grep of all names and descriptions | None | Yes for "is there an MCP or CLI repo". Individual repos were not opened |
| Installed skill | `SKILL.md` | All 149 lines | None | Yes |
| OMP source 18.2.11 | judgment, eval, auto-thinking, session, jfind, settings, catalog `.kdl`, auth-gateway, CHANGELOGs | The cited spans | Glob of `pi-coding-agent/docs/**` found no docs in the package | Yes for the `judge()` lead |
| OMP upstream docs | `models.md`, `settings.md`, docs/ listing via the contents API | `models.md`, `settings.md` | GitHub code search API returned HTTP 401 (did not cost the answer; local source covers it) | Yes |
| 2.0 requirements | `REQUIREMENTS.md`, `INVENTORY.md` spans | P-4, P-8 to P-9, P-16, P-19, P-20; INVENTORY `:303-305`, `:348` | None | Yes |
| Prior work | ctx search; earlier report in `agent-scratch` | The earlier report, in full | None | Yes (superseded) |

**PMDW**
Retrieved but never opened:
- Most `llms.txt` entries beyond the pages in Sources. This covers the remaining cookbook, pattern, and reference pages.
- The DPA, MCA, and privacy-policy pages linked from `legal.md`.
- Every OMP upstream doc in the docs/ listing other than `models.md` and `settings.md`. This includes `providers.md`, `environment-variables.md`, `task-agent-discovery.md`, `ttsr-injection-lifecycle.md`, `custom-tools.md`, `extensions.md`, `sdk.md`, `python-repl.md`, `magic-keywords.md`, and `mcp-config.md`.
- The individual TypeSafe org repos (`skills`, the SDKs, `system-one-adapter-python`, `Overwatch`).
- Earlier docs fetch artifacts beyond the first 300 lines of each.

None of these would change the `judge()` finding. The DPA would settle the data-governance question.

<!-- output-types
tier: 1
CLAIM: 17
CITE: 24
GUESS: 17 (inference 17, pattern 0, recall 0)
ACTION: 0
PMDW: 3
QUESTION: 2
-->
