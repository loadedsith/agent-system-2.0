# Triple-check — lens: OMP is the floor

**PMDW**
Critique of `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md` (read in full, 49 lines shown by the read tool) and `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md` (read in full, 571 lines shown by the read tool) against Jo's standing constraint. Read-only; no repo file edited. Lens question: where does a requirement or ruling lean on a harness other than OMP, or on an OMP capability the two documents never receipt. Beyond the two artifacts I fetched six OMP docs pages this session (hooks, extension loading, config/profiles, memory, handoff pipeline, advisor) and the docs directory listing, because a floor lens with no floor receipts would be all GUESS.

**CLAIM**
The constraint itself: `/Users/jowolff/code/agent-system-2.0/JO-INPUT.md:7` — *"EVERYTHING MUST work with OMP"*; `/Users/jowolff/code/agent-system-2.0/.ai/plumb-seat-charter.md:275-276` — *"A finding about a mechanism that only works in another harness is a finding about a mechanism that does not work."* Two adjacent constraints bear on this lens: `/Users/jowolff/code/agent-system-2.0/JO-INPUT.md:9` — *"assume that at the end of this I will [uninstall the newdle-claude-plugin]"* — and `:19` — Jo likes *"Session hand offs before autocompaction"*.

## Blockers and questions — first

**QUESTION**
Does the 2.0 parallel build (P-3) get to depend on 1.x machinery that is not OMP — HerdR panes for direct lane access (P-6) and the newdle plugin's Claude-format hooks for gates (P-11) — during cutover, or is the floor OMP-native from step one? Options: *reuse during cutover, replace before the last lane moves* (fastest; contradicts "1.x is never modified" the moment 2.0 needs a HerdR or plugin change, and inherits the plugin Jo plans to uninstall) or *OMP-native from the first lane* (slower first step; every P-3 lane runs on the same floor it will end on). This is authority, not evidence: the documents are silent, and either reading changes what "1.x untouched" means. Findings 1, 8, 9 below proceed under the second reading because it is the only one consistent with `JO-INPUT.md:7` and `:9` together.

**QUESTION**
Should P-13's candidate list include OMP's own memory backends before the ledger tool is chosen? Options: *add them as candidates* (Phase 5 tests them in the 2.0 profile alongside ctx and Beads; costs one early test) or *leave the list as ruled* (ctx + Beads only; the floor's native store is never evaluated). Finding 5 carries the receipts. Recommendation offered as conversation: add them — they are the only candidates guaranteed to read OMP sessions.

**GUESS (blocker, not a question)**
Whether OMP exports OpenTelemetry spans to an OTLP endpoint is still unmeasured; the documents say so themselves (`PREFERENCES.md:132-133`). I did not run the test (it starts a service; the brief and `RESEARCH.md:64` assign it to Tinker or Jo). Finding 2 states what hangs on it.

## Findings, by severity

### 1 · critical · P-3 — a named OMP profile isolates the OMP layer only; the `~/.claude` chain and every checked-out repo's `.omp`/`.claude` load under every profile

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:82-87` — requirement "parallel build, per-lane cutover, 1.x untouched"; evidence for "own profile" is `INVENTORY.md:313-314`; the isolation extent is carried as a GUESS: *"OMP layer yes; `~/.claude` layer only if the profile drops the `claude` provider; settle by reading `OMP_SRC` profile resolution."* `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:12` — last column "extent of `OMP_PROFILE` isolation". So the documents mark this as unverified. Correct label; the answer is now fetchable.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/config-usage.md` (fetched this session), § Profiles: *"A named profile (`omp --profile <name>`, `OMP_PROFILE`, or the legacy fallback `PI_PROFILE`) relocates the OMP user base. … A profile sees only its own OMP config, never the default profile's agent config."* Then: *"The other source bases are not profile-scoped and load identically under every profile: the external-tool bases (`~/.claude`, `~/.codex`, `~/.gemini`) belong to those tools, and the project-level bases (`<cwd>/.omp`, `<cwd>/.claude`, ...) are keyed to the working directory."* Provider priorities in the same page: native `.omp` 100, `omp-plugins` 90, `claude` 80, `claude-plugins` marketplace 70.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extension-loading.md` (fetched this session): user extension root under a profile is `~/.omp/profiles/<name>/agent/extensions` — so the six 1.x extensions under the default agent dir do not load in a named profile (this confirms the "OMP layer yes" half). The receipted lever for the `~/.claude` layer is per-item: `disabledExtensions: - context-file:user:CLAUDE.md`. And: *"`--no-extensions` … is not a whole-process capability-isolation switch. Skills, MCP servers, tools, prompts, and rules owned by other discovery subsystems retain their own enable/disable controls."*

**GUESS (inference from the two pages above)**
What P-3 loses: a 2.0 lane launched under `OMP_PROFILE=<2.0>` still loads `~/.claude/CLAUDE.md` (the 11,630-token rules file P-1 cites as the 1.x cost, `PREFERENCES.md:42`), the newdle plugin from the Claude marketplace provider, and — because P-5 lanes check out shipyard repos — each repo's `<cwd>/.omp/agents/*.md` and `.claude/` config, i.e. the 1.x hand definitions and pins P-9 is replacing. "Own profile" therefore does not deliver "no 1.x rule carries by default" (P-10, `REQUIREMENTS.md:26`) at the loader level; it has to be done with explicit per-item disables in the profile's `config.yml`, and the "drop the `claude` provider" lever the document names is not the mechanism the vendor page describes. Fix hint: P-3 wording — "own profile **plus** explicit disables for the non-profile-scoped bases, verified by a P-4 gate that lists what the profile actually loaded".

### 2 · critical · P-4 addendum — four requirements now stand on one unreceipted OMP capability (OTel export), and the summary table does not show the dependency

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:125-130` rules Phoenix the Phase 5 candidate for P-4 gates, P-8b liveness, P-7c message state, and P-16 counting. `:132-133` — *"The gating unknown is whether OMP emits OTel spans at all, and in what shape — every receipt above is Claude Code emitting."* `:121-122` — the only wiring evidence is Claude Code's OTel export. So the documents label it correctly. What they do not do: `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:13`, `:19`, `:22`, `:32` — none of the four rows' last columns say "depends on the OTel test"; P-4's says "—".

**CLAIM**
The OMP docs directory, listed this session (`curl -s https://api.github.com/repos/can1357/oh-my-pi/contents/docs | jq -r '.[].name'`, exit 0), has no page named for telemetry, tracing, OTel, or observability — the nearest names are `advisor-watchdog.md`, `stream.md`, `rpc.md`.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/handoff-generation-pipeline.md` (fetched this session): `generateHandoffFromContext(...)` *"issues an OTEL-instrumented `completeSimple`-equivalent oneshot"*. So OTel instrumentation exists inside the agent package. Whether anything exports it to an endpoint is not in what I fetched.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md` (fetched this session) — the fallback the document names ("an OMP extension that emits spans") has a receipted event surface: `tool_call`, `tool_result`, `turn_start`, `turn_end`, `agent_start`, `agent_end`, `session_*`. With one hole, stated on the same page: *"Eval prelude invocations such as `browser.open(...)`, direct `BrowserTab` helpers, `tab.run(...)`, direct `computer` helpers, and `computer.run(fnOrCode, options)` are host bridge calls, not AgentTool calls, so they do not emit `tool_call` or `tool_result`."*

**GUESS (inference)**
Consequence if OMP has no native export: the observation layer behind P-4(a), P-8b, P-7c, and P-16 is machinery 2.0 must build (an extension) and then gate and sign off under P-4 and P-11 before any of those four requirements can be checked — the observation layer becomes the first build step, not a Phase 5 store choice. And an extension-built layer is blind to browser/computer work by the vendor's own statement, which touches P-8b directly (finding 10). Fix hint: add "depends on the OTel early test" to the four REQUIREMENTS rows.

### 3 · high · P-11 / P-7b item 3 — "mechanical whenever the forbidden action is a single tool call" meets a floor where browser actions are not tool calls and shell inside `eval` is one opaque call

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:363-366` — *"A rule is mechanical whenever the forbidden action is a single identifiable tool call."* `:258-260` — reserved item 3 is *"remote push, production writes, deletion that bypasses quarantine"*. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:27`. Neither document mentions `eval`, the browser bridge, or which OMP event a gate binds to; the 1.x evidence (`:366-369`) is newdle plugin hooks — the plugin Jo is uninstalling (`JO-INPUT.md:9`).

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md`: `tool_call` *"(pre-execution) → can return `{ block?: boolean; reason?: string; input?: … }`"*; *"if handler throws, wrapper fails closed and blocks execution"*. Same page: browser/computer helpers *"do not emit `tool_call` or `tool_result`"*.

**ACTION**
Probe of the eval→tool bridge, read-only: in this session's Python kernel, `await tool.grep({"pattern": "zzqqxx_no_such_token_zzqqxx", "i": …})` with no path. Result: refused by the newdle `delegation-guard` hook with its usual text ("this Grep has no subdirectory scoping it … Confirm to run it directly"). No state changed; nothing to reverse. So a tool invoked *through* eval's `tool.<name>` bridge does pass the gate.

**CLAIM**
Gates fire for hands on this floor: this session (a `task` sub-agent, id `LensOmpFloor`) was refused twice on `grep` — once by the OMP extension `ctx-first-search.ts` ("this session has not consulted prior agent history yet, so this search was refused before it ran") and once by the plugin's `delegation-guard`. The documents' worry about hands (`PREFERENCES.md:319-321`, envelope check never fires for `agentKind === "sub"`) is about a stop-type event, not the tool-call path.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extension-loading.md`: *"Restricted task/eval children rebind the parent's already-imported extension factories to their own session. Hooks and providers remain available without ambient extension discovery."*

**GUESS (inference; I ran no destructive probe)**
What P-11 loses: a production write done by clicking in a browser (`tab.click` on a Supabase or GitHub page) is not a `tool_call` at all; a `git push` issued from `subprocess.run` inside a Python `eval` cell reaches the gate only as the `eval` tool's code string. Both are on the reserved list and neither is "a single identifiable tool call" under OMP, so the rule as worded classifies them mechanical while the floor cannot gate them that way. Partial levers that do exist on the floor, unreceipted in the documents: `browser.open({ allowed_domains })` (this session's tool manifest) and the `input` rewrite on `tool_call`. Fix hint: P-11 — "…a single AgentTool call that emits `tool_call`; bridge and in-kernel actions are written rules or get a purpose-built gate".

### 4 · high · P-7c — three message states plus an urgent interrupt assume a cross-process channel OMP's receipted seat mailbox does not have

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:237-247` — *delivered / consumed / acted on*, threshold exception, and *"the orchestrator may interrupt a lane's turn to force consumption when Jo marks a message urgent."* 1.x evidence: `seat_message` returns `queued` and `delivered` only. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:19`. No receipt in either document that OMP exposes consumption or a cross-process interrupt.

**CLAIM (live observation of this session's tool manifest; reproduce by reading the schemas in any OMP session)**
`seat_message` takes `{target, message, i}`; `hub` `send` takes `{to, message, await, replyTo}`. Neither carries a priority or urgency field. The `hub` description says *"Parent-to-subagent IRC delivered immediately as steering"* — immediate delivery is receipted for parent→child inside one session tree only.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md`: hook `ctx` includes `abort()` and `hasQueuedMessages()`; events `turn_start`, `turn_end`, `context`. `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/advisor-watchdog.md` (fetched this session): an in-session *"Interrupting steering message"* channel exists, and OMP itself draws P-7c's line — *"Acceptance means the host accepted the note for primary delivery, not that the primary model consumed it."*

**GUESS (inference)**
Consequence: "consumed" is observable only by machinery running inside each lane's process (an extension on `turn_start`/`context`), and the urgent interrupt is receipted for advisor→primary and parent→child, not orchestrator→seat across processes. If the P-7 orchestrator is its own process, the one path Jo named for the HOURS problem (`:238-239`) has no floor mechanism yet. Fix hint: state P-7c as "observable from inside the lane by machinery"; carry "cross-process interrupt — unreceipted under OMP" to Phase 5.

### 5 · high · P-13 — the ruled shape names an index that sees zero OMP sessions and a ledger candidate from outside OMP, and never mentions the floor's own memory backends, one of which is a decision store

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:418-423` — shape ruled: index (ctx incumbent) plus ledger (Beads candidate). `:425-427` — ctx indexes *"Claude Code / Codex / Cursor / Copilot / Kimi / OpenClaw history and **zero** OMP sessions"*. `:549` — what ctx can index of OMP/Pi roots is a GUESS. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:29`. `RESEARCH.md:66-67` — the early test is to register `~/.omp/agent/seat-sessions` as a ctx `pi` root. OMP's native memory appears in neither document.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/memory.md` (fetched this session): five `memory.backend` modes — `off` (default), `local` (*"Project-scoped summaries and lessons generated from persisted sessions"*), `hindsight` (remote, with `global` / `per-project` scoping), `mnemopi` (local SQLite), `sharpshooter` (*"Friction-gated project decision files (architecture/product/style), consolidated in the background"*). A `learn` tool writes `learned.md`; `memory://` URLs read the store; the local pipeline *"is skipped for subagents."*

**GUESS (inference; doc read, backend not enabled or tested)**
Consequence: the floor already ships both halves of the ruled shape in some form — an after-the-fact index over persisted OMP sessions (`local`) and a written decision store (`sharpshooter`, `learn`) — and the candidate list omits the only candidates guaranteed to parse OMP's session format. The ctx `pi`-root test is a bet on a third-party tool reading OMP's `.jsonl`; a null result there leaves P-13's index half with no OMP coverage and the ruling collapses to ledger-only, the option `RESEARCH.md:32-33` says *"nothing recovers a decision an agent forgot to write."* Two fit caveats on the native option, both GUESS: `local` is project-scoped by cwd where P-13 wants cross-repo, and it skips hands. Fix hint: add OMP's backends to P-13's candidate row and a third early test ("enable `memory.backend` in the 2.0 profile, see what lands").

### 6 · high · P-17 — every piece of 1.x continuity evidence is plugin or launcher machinery Jo plans to remove; OMP's native compaction hooks and automatic handoff document go unnamed

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:497-502` — continuity carried by `session-handoff.md`, decision-log entries, *"the plugin's pre-compaction snapshot injected at session start"*, and the `launch-seat:283` wake prompt. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:33` — open: *"what is captured, when, and how wake verifies it was read."* `JO-INPUT.md:9` — the plugin is going; `:19` — Jo likes hand-offs before autocompaction. Nothing in either document says what OMP does at compaction.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md`: session events `session_before_compact`, `session.compacting` (*"can return `{ context?: string[]; prompt?: string; preserveData?: … }`"*), `session_compact`, `auto_compaction_start`, `auto_compaction_end`, `session_shutdown`, `session_start`; and `before_agent_start` (*"can return `{ message?: … }`"*) for injection.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/handoff-generation-pipeline.md`: `/handoff` exists; *"To use this pipeline automatically, include `handoff` in `compaction.methodOrder` (the default order is `remote`, `snapcompact`, `handoff`, `shake`, `soft`)"*; `compaction.handoffSaveToDisk` writes *"a timestamped `handoff-*.md` artifact under the session's artifacts directory"*; the document is committed *"as a compaction entry"* and `session_compact` is emitted after. The docs listing also names `session-operations-export-share-fork-resume.md` and `compaction.md` — names only; I did not read them, so resume semantics stay GUESS.

**GUESS (inference)**
Consequence: nothing is lost by the floor here — the opposite. The thing Jo likes and the documents attribute to the plugin has a native successor, and P-17's "what is captured, when" is partly answered by OMP's own defaults. The remaining gap is real: the event list has nothing for "the model consumed the injected message," so "how wake verifies it was read" cannot be an event and must be an output check (GUESS from absence). Fix hint: P-17's 1.x row adds "OMP native: compaction hooks + auto-handoff — test in the 2.0 profile".

### 7 · medium · P-9 / P-8d / P-14 — "tier by work-kind, independent of hand type" against a dispatch surface where the model belongs to the agent file; the one receipted rewrite lever is unnamed

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:331-337` — the tier is picked by a rule keyed on work-kind, bounded by a lane ceiling; 1.x evidence is the per-agent-file pin (`.omp/agents/*.md:4`, `P/agents/<type>.md:4`). `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:25`. Open column: taxonomy and who sets the ceiling — not the dispatch mechanism.

**CLAIM (live observation of this session's tool manifest)**
The `task` tool schema has `agent`, `name`, `task`, `tools`, `outputSchema`, `schemaMode` — no model or tier parameter. The eval prelude's `completion(prompt, model?="default"|"smol"|"slow")` is the only per-call tier selector, and it is a one-shot completion, not a hand.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md`: on `tool_call`, *"A non-blocking handler that returns `input` replaces the arguments the tool executes with"*, and `{ block: true }` refuses. The docs listing has `task-agent-discovery.md` (name only, unread).

**GUESS (inference)**
Consequence: under OMP the work-kind rule is realised either as an agent-file matrix (type × tier) or as an extension that rewrites `task.agent` on `tool_call`; the ceiling gate is a `tool_call` block that has to resolve agent → pin. None of this is in the documents; Phase 5 could reasonably design the rule as prose the lane applies, which is the 1.x shape P-9 replaces. Related and lower: P-14's ceiling (`PREFERENCES.md:439-442`) has no unit until the documents say how OMP bills Anthropic usage — subscription or API key; this session runs `anthropic/claude-fable-5-1` under OMP (workstation block), billing path unreceipted; `auth-broker-gateway.md` and `providers.md` exist in the listing, unread. Fix hint: P-9 open column gains "OMP lever: `tool_call` input override or agent-file matrix".

### 8 · medium · P-6 — "Jo can open any lane directly" is evidenced only by HerdR panes, which are not OMP, and no OMP attach-to-running-session capability is receipted

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:187-191` — twelve HerdR panes; `:196-197` — *"Jo may open any single lane directly on demand (as with Plumb now)"*; `:62-64` — seats *"each one window, each managed by HerdR"*. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:15`. The documents give no OMP mechanism for direct access.

**CLAIM**
`seat_list` run this session returned twelve seats, every one `harness: omp`, ownership `OMP` — so seats are an OMP-managed concept — with state `unknown` for ten, `idle` for one, `running` for two. Nothing in that surface attaches a terminal to a seat.

**GUESS (inference; `collab.md` and `agent-hub.md` exist in the docs listing, unread)**
Consequence: under the QUESTION above, 2.0 either keeps HerdR (a 1.x dependency inside the "1.x untouched" build) or needs an OMP-native attach that nobody has receipted. Without one, lanes are headless and "direct access" degrades to relay through the orchestrator — which P-6 defines as the default, not the right. Fix hint: P-6 open column — "direct-access mechanism under OMP without HerdR".

### 9 · medium · P-15 — the only 1.x install path is the Claude Code plugin cache Jo is removing; OMP's own plugin and profile units are unnamed

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:453-457` — *"only the plugin part is installable from elsewhere"*; open: the install path. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:31`. `JO-INPUT.md:9-10` — plugin goes; machinery should install on a new machine.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extension-loading.md`: *"Installed plugin extension entries come from package `omp.extensions` / `pi.extensions` manifests"*; `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/config-usage.md`: provider `omp-plugins` at priority 90, and a named profile relocates *"slash commands, rules, prompts, instructions, hooks, tools, extensions, settings, skills, and MCP, plus … `SYSTEM.md` / `RULES.md` / `AGENTS.md`"* to `~/.omp/profiles/<name>/agent/...`. The listing has `marketplace.md` and `plugin-manager-installer-plumbing.md` (names only).

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/research/phase4/research-E-planning-practice.md:667-670` — *"nothing I fetched says OMP reads a Claude Code plugin's declarative hook configuration."* Yet the newdle plugin's hooks fired in this OMP session (finding 3). The bridge exists; its mechanism is unreceipted anywhere I read (GUESS), and it is the thing being removed.

**GUESS (inference)**
Consequence: with no OMP unit named, Phase 5 can design "install" as "clone and symlink into `~/.claude`" — the exact non-OMP shape — and the profile directory, which is already the unit OMP isolates per finding 1, goes unused as the install target. Fix hint: P-15 open column — "OMP plugin package (`package.json#omp.extensions`) vs the profile's agent directory".

### 10 · medium · P-8b / P-7a — "observed liveness, time since last tool call" has one receipted source on this floor, and it is blind to browser work; the seat state OMP exposes today is `unknown` for most seats

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:301-303` — closed by *"observed liveness and absence-of-progress detection (process alive, time since last tool call)"*. `:217-225` — the orchestrator's knowledge is *"the lanes' actual state."* `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:17`, `:22`. Neither says where tool-call timing comes from under OMP.

**CLAIM**
`seat_list` this session: ten of twelve seats report `unknown`. That is the floor's peer-visible state as it stands.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md`: `tool_call` / `tool_result` fire per AgentTool call — and not for browser/computer bridge calls.

**GUESS (inference)**
Consequence: a lane spending ten minutes in `tab.run` looks idle to a tool-call clock and trips the Zombie / no-progress detector P-8b cites from Yegge (`:305-306`); and P-7a's "actual state" is not available from the seat surface as-is — it has to be written by an in-lane extension, which is the machinery finding 2 says becomes the first build step. Fix hint: define progress as any bus event (`turn_*`, `tool_*`, `agent_*`), and name the bridge blind spot.

### 11 · low · P-12 — "OMP's own plan mode" is receipted in the research, but the requirement text still says "whatever it exposes" and does not carry the two floor facts that decide its open question

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:395-396`, `:544` — *"OMP plan mode (`OMP_SRC`, whatever it exposes)"*; `:400-403` — before/after a lane exists held as a Phase 5 QUESTION. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:28`. `/Users/jowolff/code/agent-system-2.0/research/phase4/research-E-planning-practice.md:332-353` — plan mode is session state, read-only by system prompt, approval only via `xd://propose`; `:398-402` — *"After, necessarily. Plan mode is session state"*; `:757-760` — whether a hand can be put in plan mode is unread (`plan-mode-subagent.md`); `:742-753` — whether superpowers' `SessionStart` bootstrap fires under OMP is unresolved.

**GUESS (inference)**
Consequence: the held QUESTION already has a floor-constrained answer for one candidate (plan mode: after), and picking either Claude-ecosystem skill set assumes a bootstrap OMP may not fire. Neither fact reached the two documents. Fix hint: fold research-E's two OMP facts into P-12's open column.

### 12 · low · P-16 — "suggests a hook" leaves "hook" undefined on a floor where a hook is a TypeScript factory in a specific directory, and the counting source is finding 2's bet

**CLAIM**
`/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:461-466` — proposes *"a hook, a prose fix, a skill"*; `:128` — counted from spans. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:32`.

**CITE**
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md`: *"A hook module must default-export a factory"* registering via `pi.on(...)`; native discovery is `<cwd>/.omp/hooks/pre|post/*.{ts,js}` and `<agentDir>/hooks/pre|post/`; *"a factory placed **directly** in `hooks/` is not discovered … loads nothing and reports no error."*

**GUESS (inference)**
Consequence: a proposal shaped like the 1.x plugin's declarative `hooks.json` — the only "hook" the documents' evidence ever shows — would land in the portable repo (P-15) and silently never fire. Fix hint: P-16 — "an OMP hook factory or extension".

## Actions taken this session

**ACTION**
`ctx search --limit 5 -- "EVERYTHING MUST work with OMP agent-system 2.0 requirements"` — exit 0; read-only, unlocked the `ctx-first` gate; nothing to reverse.

**ACTION**
Fetched, read-only: `docs/hooks.md`, `docs/extension-loading.md`, `docs/config-usage.md`, `docs/memory.md`, `docs/handoff-generation-pipeline.md`, `docs/advisor-watchdog.md` from `raw.githubusercontent.com/can1357/oh-my-pi/main/`, plus the `docs/` listing via the GitHub contents API (`curl … | jq`, exit 0). No local state changed.

**ACTION**
`seat_list` — read-only; output quoted in findings 8 and 10.

**ACTION**
Eval probe `await tool.grep({...})` with no path — blocked by the delegation-guard hook before execution; no state changed.

**ACTION**
Wrote this file to `/Users/jowolff/agent-scratch/agent-system-2.0/triple-check/omp-floor.md`. Reverse: `rm /Users/jowolff/agent-scratch/agent-system-2.0/triple-check/omp-floor.md`.

**ACTION (skipped, deliberately)**
The OTel export test, any profile-isolation test, and any read of OMP source (`OMP_SRC` is unset in this session: `printenv OMP_SRC` → exit 1). Everything about those stays GUESS above.

## Closing

**PMDW**
Twelve findings: two critical, four high, four medium, two low. Fix first: finding 1 — the profile-isolation claim under P-3 — because it is the premise every other lane-by-lane guarantee in P-3 and P-10 rests on, and the vendor page settles it in one sentence the documents did not have.

<!-- output-types
tier: 0
CLAIM: 20
CITE: 14
GUESS: 13 (inference 12, absence 1)
ACTION: 7
PMDW: 2
QUESTION: 2
-->
