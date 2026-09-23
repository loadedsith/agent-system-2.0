# Memory system for P-13 and P-17 — seven candidates from primary sources

Phase 4, wave 2, hand F. Written by `ResearchMemory` 2026-09-22. Facts only; every
requirement-fit judgement is labeled `GUESS(inference)` and names what would settle it.

## Question

What store can give any lane recall of prior work **and the decisions made about it**, with
provenance, across repos, across sessions, and across the 1.x→2.0 cutover (P-13) — and what
mechanism makes a lane's first turn after compaction or shutdown already grounded (P-17)?

## Answer

**QUESTION**
Two stores, or one? Every candidate I read falls into one of two kinds, and no single
candidate does both jobs. A **ledger** (Beads, Osmani's four channels, Anthropic's memory
tool, artifact files) is written by agents *as they work* — it holds decisions because an
agent chose to write one, and it is injectable at wake. An **index** (ctx, Amp's thread
search) is built *after the fact* over transcripts nobody authored for the purpose — it holds
decisions only insofar as a decision was spoken aloud in a session, and it has no wake
mechanism at all. The choice is: (a) keep ctx as the index and add a ledger for decisions and
wake, (b) replace ctx with a ledger and accept losing transcript-level provenance, or (c)
ledger only, and accept that nothing recovers a decision an agent forgot to write down.
I wrote the report under (a) because it is the only reading under which P-13's two halves —
"prior work" and "the decisions made about it" — both have a named mechanism. That is Jo's
call, not mine.

**GUESS(inference) — blocker on the incumbent**
ctx cannot satisfy P-17 at all, and satisfies only half of P-13, **by design rather than by
configuration**. ctx's own docs state it "does not require hooks or any code running inside
the agent process" (https://ctx.rs) — so there is no point at which it injects anything into a
waking lane. Its comparison page draws the line itself: *"use memory for durable facts you
trust outside the original discussion; use ctx when the agent needs to inspect the discussion,
command, output, or rejected attempt itself"* (https://ctx.rs/comparisons/agent-memory/). What
would settle it: nothing in the docs I read describes a write path, an injection path, or a
session-start integration, and I looked at the product site, the supported-agents page, the
agent-memory comparison, and the installed CLI's own help. Treat it as a design boundary.

**CLAIM**
ctx on this machine is `ctx 1.5.0` (`ctx --version` → `ctx 1.5.0`), and `ctx sources` lists
eight available history sources: Codex (`~/.codex/sessions`, `~/.codex/history.jsonl`), Pi
(`~/.pi/agent/sessions`), Claude Code (`~/.claude/projects`), Cursor (`~/.cursor/projects`),
GitHub Copilot (`~/.copilot/session-state`), Kimi Code (`~/.kimi-code`), OpenClaw
(`~/.openclaw/agents/main/sessions`). None of the eight is under `~/.omp/`.

**CLAIM**
`find ~/.omp/agent/seat-sessions -name '*.jsonl' | wc -l` → **603**, of which **61** are newer
than 2026-09-20 (`find … -newermt '2026-09-20' | wc -l` → 61). Those are my own counts this
session, not the parent's. The parent's REVIEW.md § 8 "CLAIM — what feeds it" records the same
shape with a different figure taken on a different day; I reproduced the shape, not the number.

**CITE**
ctx's public supported-agents table lists **Pi** as `Supported`, source format
`pi_session_jsonl` (https://ctx.rs/concepts/supported-agents/). There is no row for Oh My Pi,
OMP, or any seat-session layout in a table of 42 harnesses that does separately name
Antigravity, Gemini, Mux, NanoClaw, Shelley, and OpenClaw.

**CLAIM**
A named root can be registered — `ctx sources add --help` (run this session) prints
`Usage: ctx sources add [OPTIONS] --provider <PROVIDER> --root <PATH> <NAME>` and, against
`--provider`, the text `History provider; configured-root support is provider-specific`. So
the escape hatch exists and its applicability to `pi` is explicitly not promised by the help
text.

**CLAIM — a docs/CLI mismatch, worth knowing before anyone scripts against it**
https://ctx.rs/concepts/supported-agents/ instructs `ctx sources --json` as "the clearest way
to check support and availability". On 1.5.0 that flag does not exist: `ctx sources --json` →
`error: unexpected argument '--json' found`. `--format json` is the flag the installed binary
takes (`ctx sources add --help` shows `--format <FORMAT> [default: text] [possible values:
text, json]`).

**CITE**
Beads is the only candidate whose primary docs describe a **complete** P-17 loop, and it is
harness-level rather than prompt-level. Its Codex integration page specifies four hooks:
*"`SessionStart` (`startup|resume|clear`) injects full `bd prime` output. `PreCompact`
(`manual|auto`) checks `bd prime --memories-only` and warns if Beads context is unavailable.
`PostCompact` (`manual|auto`) records that the session needs a Beads refresh.
`UserPromptSubmit` injects full `bd prime` once after compaction, then clears the refresh
marker."* It also names why the obvious design fails: *"`PreCompact` alone does not inject
context because Codex ignores plain stdout from compact hooks. The post-compact marker plus
first-prompt refresh is the reliable recovery path."*
(https://beads.gascity.com/integrations/codex.md)

**CITE — but the decision-record claim about Beads does not survive its own docs**
Wave 1's Yegge report quotes Osmani describing *"Gastown's 'beads' pattern: immutable,
git-backed records of every decision and outcome with full provenance"*
(`/Users/jowolff/code/agent-system-2.0/.tmp/phase4/research-C-yegge.md:947`, the quotation is
the parent report's). Beads' own README says something materially different: **"Distributed
graph issue tracker for AI agents, powered by [Dolt]"**, and *"Cross-machine sync uses `bd dolt
push` / `bd dolt pull` against `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is an
export for viewers and interchange, not the source of truth or a backup."*
(https://raw.githubusercontent.com/steveyegge/beads/main/README.md). It is Dolt-backed, not
git-backed; records are mutable issues with an audit trail, not immutable decision records;
and I found no `decision` issue type on any page I read. Take the secondary characterization
as a paraphrase, not a spec.

**PMDW**
The rest of this report is the seven candidates, the comparison table with the
ledger-vs-index column called out explicitly, and the requirement mapping.

## Candidates

### 1. ctx — the incumbent (index over sessions, after the fact)

**CLAIM — the parent's first-party findings, preserved with their receipts**
`/Users/jowolff/code/agent-system-2.0/REVIEW.md` § "8. ctx — role versus machinery" records,
as Plumb's own CLAIMs: data root `~/.ctx` shared by CLI and MCP server because
`/Users/jowolff/.omp/agent/mcp.json:8-16` sets neither env nor `--data-root`; `ctx status` →
`! ctx is partially ready`, 1,687 sessions, 52,314 messages, 67,051 tool calls; the MCP surface
is seven **read-only** tools (`search, blame, status, sources, show_event, show_session,
query_events`); the only governing text is the vendor skill at
`/Users/jowolff/.claude/skills/ctx/SKILL.md`, listed in every tier's skills block; and the only
machinery is `ctx-first-search.ts`, which gates the first `grep`/`glob`/`web_search` on a ctx
search having been *called*, not read, not returned. Same file, § 7 row "ctx corpus", records
that every OMP seat and hand transcript is indexed by nothing. These are the parent's
receipts, restated without broadening.

**CLAIM — reproduced this session**
The gate is live. My first `grep` of this session was refused with
`ctx-first: this session has not consulted prior agent history yet, so this search was refused
before it ran.`, and one `ctx search` unlocked it for the rest of the session. That is the
whole of what the machinery enforces, confirmed by observation rather than by reading the file.

**CITE — what ctx says it is**
*"ctx is an open-source CLI for fast local search across your past coding agent sessions."*
And the positioning against memory systems, in its own words: *"This is different from 'agent
memory,' which usually compacts what happened into facts or summaries that can become stale.
ctx gives agents instant recall of the real record without a lossy memory step."*
(https://ctx.rs)

**CITE — how it gets the data, which settles the ledger-vs-index question**
*"`ctx setup` discovers those sources and reads them without modifying them… ctx does not
require hooks or any code running inside the agent process. After setup, a local background
daemon watches the history sources your agents already write and keeps the index current as
they change."* And: *"ctx does not send your prompts, transcripts, or indexed history to a
cloud service, call model APIs, require API keys, or write into your source repositories."*
(https://ctx.rs)

**CITE — provenance is its strongest feature**
*"`git blame` tells you which commit last changed a line. `ctx blame` tells you which agent
session produced that commit, with exact citations back to the original transcript and recorded
tool calls."* And the honest negative: *"If the session is not on your machine (for example,
because a teammate's agent produced the code), ctx says it cannot prove the attribution."*
(https://ctx.rs)

**CITE — decisions are recoverable, not stored**
*"ctx does not call a model to make memories. It does not need API keys, write into a
repository, or use a hosted search service. It reads local history, builds a searchable index,
and returns cited results."* The page frames the exact P-13 question and answers it by
division of labour: *"The decision rule is simple: use memory for durable facts you trust
outside the original discussion; use ctx when the agent needs to inspect the discussion,
command, output, or rejected attempt itself."*
(https://ctx.rs/comparisons/agent-memory/)

**CITE — what "supported" does and does not promise**
*"Support does not mean ctx launches the agent, installs the agent, changes the agent's files,
or normalizes every provider-specific field into the same output shape."* And on coverage:
*"The table describes provider formats ctx currently knows how to read. It does not guarantee
that a given machine has those histories available."*
(https://ctx.rs/concepts/supported-agents/)

**GUESS(inference) — the OMP coverage question, and what settles it**
Running `ctx sources add omp-seats --provider pi --root ~/.omp/agent/seat-sessions` is the
documented shape of the fix, but two things are unestablished: whether `pi` is one of the
providers with configured-root support (the help text says support "is provider-specific" and
names no list), and whether OMP's per-seat subdirectory tree matches what the `pi_session_jsonl`
reader expects. Basis: the `ctx sources add --help` output I ran, plus the supported-agents
table naming `pi_session_jsonl` as a *file*-shaped format while OMP writes 603 files under a
seat-partitioned tree. What settles it: running that one command and then searching for a
string that exists only in an OMP transcript. It writes `~/.ctx/config.toml`, so it is a
proposal, not something I ran.

### 2. Beads (`bd`) — a ledger agents write to as they work

**CITE — what it is**
*"Beads provides a persistent, structured memory for coding agents. It replaces messy markdown
plans with a dependency-aware graph, allowing agents to handle long-horizon tasks without
losing context."* Header: *"Distributed graph issue tracker for AI agents, powered by
[Dolt](https://github.com/dolthub/dolt)."*
(https://raw.githubusercontent.com/steveyegge/beads/main/README.md)

**CITE — storage and portability**
*"Beads uses Dolt as its database. Two modes: Embedded (default) — `bd init`. Dolt runs
in-process, data lives in `.beads/embeddeddolt/`, single writer… Server — `bd init --server`…
Cross-machine sync uses `bd dolt push` / `bd dolt pull` against `refs/dolt/data` on your git
remote; `.beads/issues.jsonl` is an export for viewers and interchange, not the source of truth
or a backup."* And git is optional: *"Beads works without git. The Dolt database is the storage
backend — git integration (hooks, repo discovery, identity) is optional… `BEADS_DIR` tells bd
where to put the `.beads/` database directory, bypassing git repo discovery."* (same URL)

**CITE — the memory surface, which is the P-13/P-17 hinge**
*"Store a memory that persists across sessions and account rotations. Memories are injected at
prime time (bd prime) so you have them in every session without manual loading."* The memory is
keyed and updatable in place: *"If a memory with this key already exists, it will be updated in
place."* (https://beads.gascity.com/cli-reference/remember.md). The README's minimal `AGENTS.md`
snippet instructs agents directly: *"Use `bd remember "insight"` for persistent project memory;
do not create MEMORY.md files."* Companion commands in the docs index: `bd recall` (*"Retrieve
the full content of a memory by its key"*), `bd memories` (*"List all memories, or search by
keyword"*), `bd forget` (https://beads.gascity.com/llms.txt).

**CITE — the wake mechanism, stated as a lifecycle rather than a convention**
The Codex integration installs `SessionStart` → inject full `bd prime`; `PreCompact` → check
`bd prime --memories-only` and warn; `PostCompact` → record that the session needs a refresh;
`UserPromptSubmit` → inject full `bd prime` once after compaction, then clear the marker.
*"Refresh markers are stored in a user cache/temp directory keyed by Codex `session_id` and
workspace path. They are not written to tracked files or to the Beads database."*
(https://beads.gascity.com/integrations/codex.md). The Claude Code integration is described in
the docs index as *"a SessionStart hook that primes context, using the CLI instead of MCP"*,
and Gemini CLI as *"SessionStart hooks that run `bd prime`"* (https://beads.gascity.com/llms.txt).

**CITE — provenance, in three separable systems**
Beads' own disambiguation: *"Script hooks — Executable `on_create` / `on_update` / `on_close`
scripts in `.beads/hooks/`… fire-and-forget"*; *"Audit history — The per-issue trail behind
`bd history <id> --events`: who changed what, when, with the old and new value of the field.
Reach for it when: A person is asking who closed this bead, and when."*; *"Events journal — One
workspace-wide, sequence-ordered stream of committed mutations, replayable from a
checkpoint."* The journal record carries an `actor`: *"The acting identity that performed the
mutation… An absent `actor` is never user attribution: read it as 'system/unknown', not as a
conflicting writer."* (https://beads.gascity.com/reference/events-journal.md)

**CITE — the journal's three traps, all stated against interest**
*"The journal is **off by default**, local to one clone, and bounded by default once it is
on."* Retention: `events-journal-retain-days` default `7`, `events-journal-retain-rows` default
`100000`, `events-journal-auto-prune` default `true`. Backfill: *"Records are written only
while the journal is enabled. Enabling it does not backfill what happened before."* And the
distributed trap: *"Turn it on wherever beads **writes**, not just where your consumer reads…
a workspace whose writers never enabled it stays permanently empty — and an empty journal is
indistinguishable from a caught-up one."* (same URL)

**CITE — cross-repo**
*"Cross-repo dependencies - Dependencies across repository boundaries"*, concretely
`bd dep add bd-42 external:other-repo:api-ready`; plus routing (*"Routing decides which
repository a new bead lands in"*) and federation (*"peer-to-peer sharing of beads across repos
and organizations"*). (https://beads.gascity.com/multi-agent/index.md)

**CITE — what an agent actually writes, field by field**
*"Use `bd update` with flags instead: `bd update <id> --description`… `--design "design notes"`…
`--notes "additional notes"`… `--acceptance "acceptance criteria"`."* Structured execution
metadata is a first-class extension point: `execution_agent_type`,
`execution_suggested_model`, `execution_reasoning_effort`, `execution_mode`,
`execution_parallel_group`, with the instruction *"When these keys are present, treat them as
the authoritative execution hints… Parent/orchestrator agents must read these fields before
spawning subagents because a running subagent cannot change its model or reasoning effort after
launch."* (https://raw.githubusercontent.com/steveyegge/beads/main/AGENT_INSTRUCTIONS.md)

**CLAIM — what I did not find, having looked for it**
No `decision` issue type, no decision record, and no decision-shaped field appears on any Beads
page I read (README, AGENT_INSTRUCTIONS.md, the docs index of ~170 pages, the events-journal
reference, the multi-agent overview, `bd remember`, the Codex integration). The nearest
constructs are the `--design`/`--notes` free-text fields, comments (`comment.source` is
*"a closed two-value set: `structured` for a comment someone wrote, `audit` for a comment
recorded as an audit-trail entry"*), `bd supersede` (*"Mark an issue as superseded by a newer
version"*), the `supersedes` graph link, and `bd remember`. A decision in Beads is whatever an
agent chose to type into one of those.

### 3. Anthropic's artifact systems and external memory (pattern, not a product)

**CITE — the artifact pattern, verbatim, and the failure mode it names**
*"**Subagent output to a filesystem to minimize the 'game of telephone.'** Direct subagent
outputs can bypass the main coordinator for certain types of results, improving both fidelity
and performance. Rather than requiring subagents to communicate everything through the lead
agent, implement artifact systems where specialized agents can create outputs that persist
independently. Subagents call tools to store their work in external systems, then pass
lightweight references back to the coordinator. This prevents information loss during
multi-stage processing and reduces token overhead from copying large outputs through
conversation history."*
(https://www.anthropic.com/engineering/multi-agent-research-system, Appendix)

**CITE — external memory as the compaction survival mechanism**
*"We implemented patterns where agents summarize completed work phases and store essential
information in external memory before proceeding to new tasks. When context limits approach,
agents can spawn fresh subagents with clean contexts while maintaining continuity through
careful handoffs. Further, they can retrieve stored context like the research plan from their
memory rather than losing previous work when reaching the context limit."* The same post's
architecture caption states the trigger: *"The LeadResearcher begins by thinking through the
approach and saving its plan to Memory to persist the context, since if the context window
exceeds 200,000 tokens it will be truncated and it is important to retain the plan."* (same URL)

**CITE — resume after failure is engineered, not prompted**
*"When errors occur, we can't just restart from the beginning: restarts are expensive and
frustrating for users. Instead, we built systems that can resume from where the agent was when
the errors occurred… We combine the adaptability of AI agents built on Claude with
deterministic safeguards like retry logic and regular checkpoints."* (same URL)

**CITE — what compaction preserves and what it costs**
*"In Claude Code, for example, we implement this by passing the message history to the model to
summarize and compress the most critical details. The model preserves architectural decisions,
unresolved bugs, and implementation details while discarding redundant tool outputs or
messages. The agent can then continue with this compressed context plus the five most recently
accessed files."* Against interest: *"The art of compaction lies in the selection of what to
keep versus what to discard, as overly aggressive compaction can result in the loss of subtle
but critical context whose importance only becomes apparent later."*
(https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

**CITE — structured note-taking, and the resume behaviour it produces**
*"Structured note-taking, or agentic memory, is a technique where the agent regularly writes
notes persisted to memory outside of the context window. These notes get pulled back into the
context window at later times… Like Claude Code creating a to-do list, or your custom agent
maintaining a NOTES.md file, this simple pattern allows the agent to track progress across
complex tasks."* And the observed effect: *"After context resets, the agent reads its own notes
and continues multi-hour training sequences or dungeon explorations. This coherence across
summarization steps enables long-horizon strategies that would be impossible when keeping all
the information in the LLM's context window alone."* (same URL)

### 4. LangGraph — checkpointer vs store (the run-scoped / durable split)

**CITE — the split, in the doc's own table**
Checkpointer persists *"Graph state snapshots"*, scope *"A single thread"*, memory type
*"Short-term, thread-scoped memory"*, use for *"Conversation continuity, human-in-the-loop,
time travel, and fault tolerance"*, access pattern *"Pass a `thread_id` in graph config"*.
Store persists *"Application-defined key-value data"*, scope *"Across threads"*, memory type
*"Long-term, cross-thread memory"*, use for *"User preferences, facts, and shared knowledge"*,
access pattern *"Read and write items from nodes or application code"*.
(https://docs.langchain.com/oss/python/langgraph/persistence)

**CITE — what persistence is for, and the recommended shape**
*"Persistence lets LangGraph applications keep useful information beyond a single graph run. It
matters when an agent needs to continue a conversation, resume after an interruption, recover
from a failure, or remember information across interactions."* And: *"Most applications can use
both: a checkpointer tracks the current thread, and a store tracks durable information across
threads."* (same URL)

**CITE — resume is an identifier, not a re-briefing**
The whole resume mechanism is `{"configurable": {"thread_id": "thread-1"}}` passed on invoke.
The framework, not the node, does the writing; the agent is not asked to summarize itself.
(same URL)

**CITE — three documented failure modes that bear on P-13/P-17**
Durability: *"`MemorySaver` and `InMemorySaver` store checkpoints in RAM. When the process
restarts, all checkpoints are lost. **Fix:** Use a persistent checkpointer for production:
`PostgresSaver`… `SqliteSaver`: Local file-based storage for development."* Unbounded growth:
*"Over long conversations, checkpoints accumulate. This can increase latency and storage
costs."* Isolation: *"When a subgraph updates state, the parent graph may not see the changes
immediately. This is because each subgraph manages its own checkpoint namespace. **Fix:** Use
shared state via Store for data that needs to cross graph boundaries."* (same URL)

**CLAIM — nothing about decisions or provenance**
The persistence page contains no field, table row, or section on who made a change, when, or
why. Provenance and decision-records are `silent` in this source — the only page of the
LangGraph persistence docs I fetched.

### 5. Osmani's four memory channels (Carson's Ralph loop, as Osmani documents it)

**CITE — the four channels, verbatim, each with its stated job**
*"Carson's Ralph loop implementation uses at least four channels of memory between runs:*
*• **Git Commit History:** Each iteration's code changes are committed, so the next iteration
can do a git diff or inspect the repo to see what changed… The commit messages themselves can
provide context as well ("Iteration 5: Added navbar component").*
*• **Progress Log (progress.txt):** A plain text log appended each cycle describing what
happened - e.g. which task was attempted and whether it passed or failed, along with any error
messages or discoveries. This acts as a chronological memory… The agent itself can also be
prompted to read progress.txt at the start of an iteration… Think of it as the agent's
journal.*
*• **Task State (prd.json or tasks list):** The JSON file with tasks gets updated as tasks are
marked done… If the agent crashes and restarts, it can load prd.json and know exactly which
tasks remain.*
*• **Agents' Knowledge (AGENTS.md):** As discussed, this is the long-term semantic memory - the
accumulated wisdom of past runs."*
(https://addyosmani.com/blog/self-improving-agents/)

**CITE — the decision-capture mechanism is an instruction to the agent, in the moment**
*"No, don't use the old endpoint. Instead, use the new v2/users API. Record this in AGENTS.md,
then continue."* Osmani names the effect: *"The agent will dutifully append the correction to
AGENTS.md and carry on with the new instruction - effectively learning from the mistake."*
(same URL)

**CITE — the verification gap, named by the author**
*"**Tip:** Whatever persistence you use, periodically **verify that the agent is actually
utilizing it.** A memory file only helps if it's injected into the prompt in future runs. Check
your prompt template or agent config to ensure, for example, that AGENTS.md and recent
progress.txt entries are included. In Amp and Claude, by default, files like progress.txt might
not be auto-loaded, so you can modify your prompt to say: 'Here are notes from previous
runs:' and include the content."* (same URL)

**CITE — and the cost of the simplest version**
*"Be mindful of context size. As your knowledge file grows, you may not always want to inject
all of it for every single task (context bloat can reduce performance or cause the model to
ignore instructions)… Some advanced setups use retrieval: e.g., split AGENTS.md into multiple
topical files and only include the sections relevant to the current task."* (same URL)

**GUESS(inference)**
This is the cheapest candidate to build and the only one whose wake mechanism is *"modify your
prompt to say: 'Here are notes from previous runs:'"* — i.e. prompt-level, unverified, and
exactly the failure Osmani's own tip warns about. Basis: the four passages above; I did not
read Carson's `compound-product` or `ralph` repos, which are where the implementation lives.

### 6. Amp threads — a hosted session store with handoff and cross-thread recall

**CITE — what a thread holds**
*"A thread is one conversation with the agent: your prompts, the agent's replies, every tool
call it made, and the files it changed. Threads are the unit of work in Amp. You start one per
task, come back to it from any device, hand it to a teammate, or point a later thread at it."*
(https://ampcode.com/docs/markdown/threads)

**CITE — provenance, and it is the same trick ctx uses, pre-wired**
*"Commits the agent makes carry an `Amp-Thread-ID` trailer, so `git log` leads from a change
back to the conversation that produced it. Putting the thread link in a pull request
description gives reviewers the same context."* (same URL)

**CITE — cross-lane recall is a first-class prompt affordance**
*"Paste a thread URL or type `@T-…` in a prompt and the agent reads that thread and pulls out
what matters for the current task. In the CLI, type `@@` to search for a thread to mention. Ask
the agent to find threads by keyword, file, author, label, or date, and it searches your threads
and your workspace members' shared threads."* (same URL)

**CITE — handoff is user-initiated, not automatic**
*"When a thread gets long, ask the agent to 'Handoff and …' and it starts a fresh thread with
the context that matters."* Resume across clients is by identifier:
*"Run `amp threads continue T-…` to attach the CLI to a thread"*, and a thread can be woken
from a script: *"`amp threads continue T-… -ox 'The deploy finished, verify the fix in
production'`… The message runs on the thread's own orb, so this is a simple way to wake a
thread from a CI job or a shell script."* (same URL)

**CITE — Osmani's secondary description of the same feature differs**
*"Amp's auto-handoff feature effectively acts as a short-term memory - when the context window
is about to overflow, it can hand off the conversation to a new session with a condensed
summary so far."* (https://addyosmani.com/blog/self-improving-agents/). Amp's own docs describe
handoff as something you *ask the agent to do*, not something that fires on overflow. I found
no "auto-handoff" on the Threads page; I did not open every Amp docs page, so this is a
discrepancy I am flagging rather than resolving.

**CITE — state lives on Amp's servers**
*"Every thread has a URL like `https://ampcode.com/threads/T-…`. The same thread opens in the
web app, the CLI, and the Amp apps for iOS and macOS."* Export exists but is a copy:
*"Add `.md` to a thread URL… **Export** in the More Actions menu offers Markdown and, for the
thread's creator, the full JSON."* (https://ampcode.com/docs/markdown/threads)

### 7. Anthropic's memory tool (`memory_20250818`) — a ledger the model drives

**CITE — what it is and where the data lives**
*"The memory tool lets Claude store and retrieve information across conversations in a directory
of memory files. Claude can create, read, update, and delete files that persist between
sessions, building up knowledge over time without keeping everything in the context window."*
And: *"The memory tool operates client-side: Claude requests file operations, and your
application executes them. You control where and how the data is stored through your own
infrastructure."*
(https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)

**CITE — the wake behaviour, which is the P-17-relevant part**
*"When the memory tool is enabled, Claude automatically checks its memory directory before
starting a task. As it works, Claude stores what it learns in files under `/memories` and reads
them back in later conversations to continue earlier work."* Continuity is by configuration
rather than by session id: *"A later conversation continues from the same memory when it sends
the same `tools` entry and your handler serves the same store."* (same URL)

**CITE — decisions are a named use case**
*"Maintain project context across multiple agent sessions"*; *"Apply lessons from past
interactions, decisions, and feedback to new tasks"*; *"Build up a knowledge base over time."*
(same URL)

**CITE — it is an API surface, and the work is yours**
*"Using the memory tool takes two steps: 1. Add the memory tool to your request. The `tools`
entry `{"type": "memory_20250818", "name": "memory"}` is the entire configuration… 2. Implement
a client-side handler for each memory command. Your handler must reject paths outside
`/memories`."* Ready-made storage exists in two SDKs only: *"Python and TypeScript also ship a
ready-made local-filesystem implementation, `BetaLocalFilesystemMemoryTool`."* (same URL)

**GUESS(inference)**
This candidate is only reachable for 2.0 if the harness a lane runs on exposes the tool and
implements the handler — it is a Messages-API parameter, not a CLI feature. Basis: the two
passages above, which place both the tool declaration and the storage in the calling
application. What would settle it: whether OMP passes an arbitrary `tools` entry through to the
Anthropic API and runs a handler for it, which is a first-party question about `OMP_SRC` that I
did not open.

## Comparison

Source keys are defined under the table. Every cell carries one, or says `silent` — meaning
the primary sources I fetched do not address it, not that the answer is no. The last column is
the distinction that organizes everything else: a **ledger** is written by agents as they work,
an **index** is built over sessions after the fact.

| Type | Candidate | Stores work (transcripts) | Stores decisions | Provenance | Cross-repo | Survives session end | Resume-at-wake mechanism (P-17) | Portable with the machinery (P-15) | Ledger (agents write during work) vs index (after the fact) |
|---|---|---|---|---|---|---|---|---|---|
| CITE | **1. ctx** | yes — full transcripts, messages and tool calls, *"retains its complete transcript content and source information"* [1] | **no** — *"does not call a model to make memories"*; decisions are recoverable from a session only if spoken in it [2] | **strongest of the seven** — `ctx blame` maps line/file/commit/PR to the producing session *"with exact citations back to the original transcript and recorded tool calls"*; says so when it cannot prove it [1] | yes — indexes *"local Git history"* alongside sessions, machine-wide, not repo-scoped [1] | yes — the whole premise is history that outlives the session [1] | **none** — *"does not require hooks or any code running inside the agent process"*; a daemon watches sources, nothing injects [1] | machinery yes (a CLI, `curl … /install`), state no — index is local, and *"if the session is not on your machine… ctx says it cannot prove the attribution"* [1] | **index.** `ctx setup` *"discovers those sources and reads them without modifying them"* [1] |
| CLAIM | **1a. ctx on this machine** | 8 available sources, none under `~/.omp/`; Pi root is `~/.pi/agent/sessions` [4] | — | — | — | — | — | named roots addable, `configured-root support is provider-specific` [4] | — |
| CITE | **2. Beads** | **no** — issues, dependencies, comments and memories; no transcript is stored [5] | **partly** — no decision type exists; the carriers are `--design`/`--notes` free text [16], comments, `bd supersede` / `supersedes` links [5], and `bd remember` [9] | audit history *"who changed what, when, with the old and new value of the field"*, plus an `actor` on every journal record [7] | yes — `bd dep add bd-42 external:other-repo:api-ready`, routing, federation [8] | yes — *"persists across sessions and account rotations"* [9]; Dolt DB on disk [5] | **yes, four hooks** — `SessionStart` injects `bd prime`; `PreCompact` checks; `PostCompact` marks; `UserPromptSubmit` re-injects once after compaction [6] | machinery yes (`brew install beads`, hooks *"embedded in the bd binary"* [16]); state syncs by `bd dolt push/pull` against `refs/dolt/data` on a git remote [5] | **ledger.** Agents run `bd create`/`bd update --claim`/`bd close`/`bd remember` as they work [5] |
| CITE | **3. Anthropic artifacts + external memory** | partly — *"agents summarize completed work phases and store essential information in external memory"*; summaries, not transcripts [10] | yes, by construction — compaction *"preserves architectural decisions, unresolved bugs, and implementation details"* [11] | `silent` — the artifact is a file with a reference; no author/time/source record is described [10] | `silent` | yes — artifacts *"persist independently"* of the coordinator [10] | **yes, two forms** — compaction re-initiates a new window from a summary [11]; *"After context resets, the agent reads its own notes and continues"* [11]; and engineered resume *"from where the agent was when the errors occurred"* [10] | it is a pattern, so fully portable; nothing to install | **ledger.** *"Subagents call tools to store their work in external systems, then pass lightweight references back to the coordinator"* [10] |
| CITE | **4. LangGraph checkpointer/store** | yes for one thread — checkpointer persists *"Graph state snapshots"* at scope *"A single thread"* [12] | `silent` — no decision or rationale field on the persistence page [12] | `silent` — no actor, time, or authorship field documented [12] | store scope is *"Across threads"*, which is the cross-lane analogue; repos are not the unit [12] | only with a durable backend — *"`MemorySaver` and `InMemorySaver` store checkpoints in RAM. When the process restarts, all checkpoints are lost."* [12] | **yes, and it is an identifier not a briefing** — *"Pass a `thread_id` in graph config"* and the runtime restores state [12] | machinery yes (a library); state is whatever Postgres/SQLite you point it at [12] | **runtime-written, neither.** The framework writes checkpoints; the agent writes to the store explicitly [12] |
| CITE | **5. Osmani's four channels** | partly — `progress.txt` is *"a plain text log appended each cycle"*, and git history carries the diffs [13] | yes, as prose — AGENTS.md is *"the long-term semantic memory - the accumulated wisdom of past runs"*, appended on correction [13] | git commit history is the only provenance, and it attributes code not reasoning [13] | `silent` — every channel is a file in one repo [13] | yes — all four are files on disk [13] | **prompt-level only, and the author flags it** — *"A memory file only helps if it's injected into the prompt in future runs… modify your prompt to say: 'Here are notes from previous runs:'"* [13] | fully — four files in the repo | **ledger.** The agent appends to AGENTS.md and progress.txt as it works [13] |
| CITE | **6. Amp threads** | yes — *"your prompts, the agent's replies, every tool call it made, and the files it changed"* [14] | `silent` as a record type; recoverable by reading the thread [14] | yes — *"Commits the agent makes carry an `Amp-Thread-ID` trailer, so `git log` leads from a change back to the conversation that produced it"* [14] | yes — search spans *"your threads and your workspace members' shared threads"*, filterable by file [14] | yes — threads persist; archived threads stay readable [14] | **partial** — handoff is asked for (*"ask the agent to 'Handoff and …'"*), resume is by id (`amp threads continue T-…`); nothing fires automatically on compaction [14] | **no** — threads live at `ampcode.com/threads/T-…`; export is a copy [14] | **index**, hosted — the product records the thread; agents do not author entries |
| CITE | **7. Anthropic memory tool** | no — files the model chose to write, not transcripts [15] | yes, named as a use case — *"Apply lessons from past interactions, decisions, and feedback to new tasks"* [15] | `silent` — no author or timestamp field in the tool contract [15] | `silent` — `/memories` is *"a prefix that your handler maps onto real storage"*, so scope is yours [15] | yes — *"files that persist between sessions"* [15] | **yes, automatic** — *"Claude automatically checks its memory directory before starting a task"* [15] | machinery is a handler you write; state is *"storage you control"* [15] | **ledger.** *"As it works, Claude stores what it learns in files under `/memories`"* [15] |

**Source keys**

[1] https://ctx.rs · [2] https://ctx.rs/comparisons/agent-memory/ ·
[3] https://ctx.rs/concepts/supported-agents/ ·
[4] `ctx --version`, `ctx sources`, `ctx sources add --help`, `ctx sources --json`, run this session ·
[5] https://raw.githubusercontent.com/steveyegge/beads/main/README.md ·
[6] https://beads.gascity.com/integrations/codex.md ·
[7] https://beads.gascity.com/reference/events-journal.md ·
[8] https://beads.gascity.com/multi-agent/index.md ·
[9] https://beads.gascity.com/cli-reference/remember.md ·
[10] https://www.anthropic.com/engineering/multi-agent-research-system ·
[11] https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents ·
[12] https://docs.langchain.com/oss/python/langgraph/persistence ·
[13] https://addyosmani.com/blog/self-improving-agents/ ·
[14] https://ampcode.com/docs/markdown/threads ·
[15] https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool ·
[16] https://raw.githubusercontent.com/steveyegge/beads/main/AGENT_INSTRUCTIONS.md

**GUESS(inference) — what the last column separates, said plainly**
The two kinds fail in opposite directions, and the table's cells are where that shows. An
index has complete work and weak decisions: everything that happened is there, but finding
*why* means reading a transcript and hoping the reasoning was typed out. A ledger has strong
decisions and no work: what an agent wrote down is crisp, addressable, and injectable — and
anything it did not write down never existed. Basis: the `Stores work` and `Stores decisions`
cells across rows 1, 2, 6 and 7; not a claim that any source frames it this way.

## Mapping to REQUIREMENTS.md

Requirement text is quoted from `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md`, the
table rows P-7a, P-8b, P-13, P-15, P-17. Every fit judgement below is mine and labeled.

### P-13 — *"Any lane can recall prior work — its own and other lanes', in any repo — **and the decisions made about it**, with provenance, persisting across sessions and across the cutover."*

**GUESS(inference)**
P-13 is one sentence containing two requirements that no single candidate meets, and the
`Stores work` / `Stores decisions` columns are where it splits. ctx wins "prior work… in any
repo… with provenance" outright and loses "the decisions made about it": it holds the record,
not the ruling, and its own comparison page says to pair it with a memory rather than replace
one (*"Those tools can sit beside ctx. They carry compact knowledge forward. ctx gives the
agent a way back to the source session when the compact form is too thin"* [2]). Beads wins
"decisions… with provenance… in any repo" through `bd remember`, `--design`/`--notes`,
`bd supersede`, per-issue audit history and cross-repo deps, and does not store work at all.
What would settle which pairing Jo wants: whether a decision that was *made but never written
down* must be recoverable. If yes, an index is mandatory and a ledger alone fails. If no, a
ledger alone is sufficient and simpler.

**GUESS(inference) — the cutover clause is the one nobody satisfies by default**
P-13 requires persistence *across the 1.x→2.0 cutover*, and 2.0 runs under its own
`OMP_PROFILE` (P-3). ctx's index is keyed to discovered provider roots, not to profiles, so a
profile change is invisible to it — which is an argument *for* ctx on this clause, since it
reads whatever a harness writes wherever it writes it. Beads' state is a Dolt database in
`.beads/` (or at `BEADS_DIR`), also profile-independent. The candidates that fail the clause
are the hosted one (Amp threads live at `ampcode.com`) and anything keyed to a harness session
id. Basis: source [1] on ctx's discovery model, [5] on `BEADS_DIR`, [14] on thread URLs; I did
not test any of it against a profile switch.

**CLAIM — the incumbent's gap is coverage, not capability**
`ctx sources` lists no root under `~/.omp/`, and 603 OMP seat-session transcripts sit there
(61 of them newer than 2026-09-20). So today a 2.0 lane using ctx would recall Jo's Claude Code
and Codex history and none of its own or its siblings'. Both figures are my own, run this
session.

### P-17 — *"On resume from compaction or shutdown, a lane's first turn is already grounded in what it was doing, what is pending, and what was ruled — automatically, without re-briefing."*

**GUESS(inference)**
Beads is the only candidate whose primary docs describe a mechanism matching all three clauses
of P-17 — automatic, compaction-aware, and grounded in what was *ruled* as well as what was
pending. `SessionStart` covers shutdown; `PostCompact` + `UserPromptSubmit` covers compaction;
`bd prime` carries memories (the rulings) alongside ready work (what is pending); and
*"Memories are injected at prime time (bd prime) so you have them in every session without
manual loading"* [9] is the "without re-briefing" clause stated by the vendor. Anthropic's
memory tool covers "automatically" (*"Claude automatically checks its memory directory before
starting a task"* [15]) but is a Messages-API parameter rather than a harness feature. The
remaining five are weaker on the same axis: LangGraph resumes *state* but does not ground a
turn; Osmani's channels depend on a prompt template the author himself says to go verify;
Amp's handoff is asked for by a human; Anthropic's artifact pattern is a practice; ctx has no
injection path at all.

**GUESS(inference) — P-17's hardest clause is the one no source addresses**
The requirement's Phase-5 column asks *"how wake verifies it was read"*. Not one of the seven
sources documents a verification that the injected context was actually consumed. Beads gets
closest by warning when context is *unavailable* (*"`PreCompact`… checks `bd prime
--memories-only` and warns if Beads context is unavailable"* [6]) — which is availability, not
consumption. This is exactly the shape of the gap Plumb already measured in 1.x's
`ctx-first-search` gate, which fires on the call and not the result. Basis: the absence across
all seven sources plus REVIEW.md § 8's CLAIM about the gate; an absence is weaker evidence than
a statement, so treat it as "not found" rather than "does not exist".

### P-7a — *"The orchestrator's knowledge of lanes is their actual state, never a document about them."*

**GUESS(inference)**
A shared ledger is a document *unless the lane's writes to it are the same act as the lane's
work*, which is precisely the distinction the last table column draws. Beads makes the write
atomic with the state change — `bd update <id> --claim` is described as *"Atomically claim a
task (sets assignee + in_progress)"* [5], so "who is working on what" is a queryable fact rather
than a report. The events journal goes further: one record per committed mutation, written
*"in the same transaction as the mutation itself"* [7], which is the machine-readable feed an
orchestrator would tail. LangGraph states the same principle structurally — the runtime writes
checkpoints, not the node. ctx cannot serve P-7a at all: it is an index of what already
finished, with a background daemon and an explicitly stale-tolerant refresh model
(*"Search defaults to `--refresh background`"* [3]).

**GUESS(inference) — with the journal's own warning attached**
The events journal is off by default, does not backfill, prunes at 7 days / 100,000 rows by
default, and *"a workspace whose writers never enabled it stays permanently empty — and an
empty journal is indistinguishable from a caught-up one"* [7]. An orchestrator reading lane
state from a journal nobody turned on would see a healthy-looking nothing. What settles it:
enabling it on every writer and checking `head` advances.

### P-8b — *"The lane's report to the orchestrator is the distrusted link; the orchestrator must not depend on a lane choosing to report."*

**GUESS(inference)**
Anthropic states the design answer to P-8b more directly than anything else I read, and states
the failure mode by name: *"Subagent output to a filesystem to minimize the 'game of
telephone.' … implement artifact systems where specialized agents can create outputs that
persist independently. Subagents call tools to store their work in external systems, then pass
lightweight references back to the coordinator"* [10]. That removes the report from the trust
path by making the artifact the channel — but it does not remove the *choice*: a subagent that
writes nothing produces nothing to read. Beads narrows the choice further, because the write is
the work (claim, close, add dependency), not a separate reporting step. ctx narrows it furthest
in principle — a lane cannot *not* write a transcript — and this is the single strongest
argument for keeping an index alongside a ledger. Basis: [10], [5], [1]; no source frames its
mechanism as a trust argument, so the framing is mine.

### P-15 — *"The machinery is portable: an up-to-date copy of the system can be created from Jo's GitHub repo on another machine. State and specific lanes need not be."*

**GUESS(inference)**
Five of seven are portable machinery; the split is clean and matches the `Portable` column.
Installable tools with local state: ctx (`curl -fsSL https://ctx.rs/install | sh`, state in
`~/.ctx` [1]) and Beads (`brew install beads`, state in `.beads/` or `BEADS_DIR` [5]). Pure
patterns with nothing to install: Anthropic's artifact/note-taking practice [10][11] and
Osmani's four files [13]. A library plus a database you choose: LangGraph [12]. A handler you
write: Anthropic's memory tool [15]. The single failure is Amp, whose threads live on Amp's
servers with export as a copy [14] — the same shape wave 1's survey found for Amp and
Antigravity generally.

**GUESS(inference) — the reconstitution question, which P-15 does not yet answer**
P-15 says state need not be portable, and both viable candidates take that permission in
different ways. Re-cloning on a new machine gives you a ctx with an *empty* index that then
rebuilds from whatever local provider history exists there — so the tool is portable and the
memory is not, silently. Beads is the opposite: `bd dolt pull` against the git remote brings
the ledger with you, so a decision written in one place is readable in another, and the docs
give a specific bootstrap path (*"Bucket Federation Quickstart — federate a beads database
across machines through a GCS or S3 bucket"* [8]). What settles the requirement: whether Jo
wants a fresh machine to *know things* or merely to *be able to run the system*. That wording
is a Phase-5 call.

## Sources I could not fully read

1. **`https://www.reddit.com/r/ClaudeAI/search/?q=agent+memory+across+sessions+decisions&restrict_sr=1`**
   — **what I got:** an HTML shell containing the Reddit logo as an inline base64 SVG, a
   `<title>Reddit</title>`, and a viewport meta tag. Zero posts, zero comments, no text
   content. **Why the rest is missing:** the search results are client-rendered; the fetch
   returns the JS shell before hydration. **Tried once, not retried**, per the brief.
   **Importance: noise** for this question. Practitioner threads on agent memory would add
   colour, but every claim in this report needed a vendor doc or a CLI run, and Reddit could
   not have supplied either. It did not cost me the answer.

2. **`https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool`** —
   **what I got:** lines 1–300 of 1,032. **What is missing:** lines 301–1,032 — the SDK
   handler implementations in seven languages, the path-traversal-protection section, the
   command reference for `view`/`create`/`str_replace`/`insert`/`delete`/`rename`, and
   whatever the page says about retention and context management. **Importance: worth
   knowing.** The part I read establishes what the tool is, where state lives, and the
   automatic-check-at-start behaviour — which is all the comparison table claims. The unread
   part would matter if Jo picks this candidate, because the per-command contract is where
   "can an agent update a decision in place" gets answered.

3. **`https://beads.gascity.com/reference/events-journal.md`** — **what I got:** lines 1–300
   of 491. **What is missing:** lines 301–491, including the "Retention and pruning" and
   "Resuming and the truncation error" sections that the part I read forward-references.
   **Importance: worth knowing** for P-7a. I have the record contract, the `actor` field, the
   defaults and the disabled-vs-empty warning; what I lack is the exact recovery path when a
   consumer's checkpoint falls below the retained window.

4. **`https://raw.githubusercontent.com/steveyegge/beads/main/AGENT_INSTRUCTIONS.md`** —
   **what I got:** lines 1–300 of 537. **What is missing:** lines 301–537, which the visible
   portion suggests continue into CLI visual-design conventions. **Importance: noise** — the
   agent-workflow and execution-metadata material I needed is in the part I read, and the tail
   had turned to output styling before it was cut.

5. **`https://addyosmani.com/blog/self-improving-agents/`** — **what I got:** lines 1–300 of
   309. **What is missing:** the closing nine lines. **Importance: noise** — the four memory
   channels, the verification tip, and the context-bloat caution are all quoted verbatim from
   within the part read. Wave 1's report B hit the identical boundary on the identical URL.

6. **`https://ctx.rs/concepts/supported-agents/` instructs a flag that does not exist** —
   this is not a partially readable source but it belongs here because the page reads as
   authoritative and is not, on 1.5.0: it says `ctx sources --json` is *"the clearest way to
   check support and availability"*, and the installed binary answers
   `error: unexpected argument '--json' found`. **Importance: worth knowing** — anyone
   scripting a coverage check against those docs gets a non-zero exit and no data.

## Sources

Fetched or run this session. Numbers match the comparison table's source keys.

1. https://ctx.rs — ctx product site. Read in full.
2. https://ctx.rs/comparisons/agent-memory/ — *Agent memory*. Read in full.
3. https://ctx.rs/concepts/supported-agents/ — *Supported agents*. Read in full.
4. Local CLI, run this session: `ctx --version` → `ctx 1.5.0`; `ctx sources` → 8 available
   sources; `ctx sources add --help`; `ctx sources --json` → `error: unexpected argument`;
   `ctx search --limit 3 -- "ctx corpus REVIEW agent-system 2.0 memory"` → 3 results;
   `find ~/.omp/agent/seat-sessions -name '*.jsonl' | wc -l` → 603, `-newermt '2026-09-20'`
   → 61.
5. https://raw.githubusercontent.com/steveyegge/beads/main/README.md — Beads README. Read in full.
6. https://beads.gascity.com/integrations/codex.md — Codex integration, hook lifecycle. Read in full.
7. https://beads.gascity.com/reference/events-journal.md — Events journal. Read to line 300 of 491.
8. https://beads.gascity.com/multi-agent/index.md — Multi-agent overview. Read in full.
9. https://beads.gascity.com/cli-reference/remember.md — `bd remember`. Read in full.
10. https://www.anthropic.com/engineering/multi-agent-research-system — *How we built our
    multi-agent research system*, 2025-06-13. Read in full including the appendix.
11. https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents —
    *Effective context engineering for AI agents*, 2025-09-29. Read in full.
12. https://docs.langchain.com/oss/python/langgraph/persistence — LangGraph *Persistence*.
    Read in full (served as the `.md` alternate).
13. https://addyosmani.com/blog/self-improving-agents/ — *Self-Improving Coding Agents*,
    2026-01-31. Read to line 300 of 309.
14. https://ampcode.com/docs/markdown/threads — Amp *Threads*, lastModified 2026-09-18. Read in full.
15. https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool — Anthropic
    *Memory tool*. Read to line 300 of 1,032.
16. https://raw.githubusercontent.com/steveyegge/beads/main/AGENT_INSTRUCTIONS.md — Read to
    line 300 of 537.
17. https://beads.gascity.com/ and https://beads.gascity.com/llms.txt — Beads docs index
    (~170 page entries). Both read in full; used to establish what does *not* exist as much as
    what does.
18. https://www.reddit.com/r/ClaudeAI/search/… — attempted once, JS shell only. See above.

First-party repository files read this session (the parent's, cited as the parent's):
`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md`;
`/Users/jowolff/code/agent-system-2.0/REVIEW.md` § 7 row "ctx corpus" and § 8;
`/Users/jowolff/.claude/skills/ctx/SKILL.md`;
`/Users/jowolff/code/agent-system-2.0/briefs/research.md`;
targeted greps of `.tmp/phase4/research-A-graph-engineering.md`,
`research-B-osmani.md`, `research-C-yegge.md`, `research-D-best-in-class-survey.md`.

## Unverified

Each item below is also marked at the point it appears above.

1. **Whether ctx can index OMP seat sessions via `ctx sources add --provider pi`.** The
   command exists and its help says configured-root support is provider-specific; whether
   `pi` has it, and whether OMP's tree matches `pi_session_jsonl`, is untested. Running it
   writes `~/.ctx/config.toml`, outside this hand's write boundary, so I proposed rather than
   ran it. Marked in candidate 1.
2. **Whether Beads has any decision record type I did not find.** I read the README, the
   agent instructions, the ~170-entry docs index, and five doc pages, and found none. An
   absence across those is not proof; the `core-concepts/issues.md` field reference is the
   page that would settle it and I did not open it. Marked in candidate 2.
3. **Whether Amp has an automatic handoff on context overflow.** Osmani describes one; Amp's
   Threads page describes handoff as something you ask for. I did not open the rest of Amp's
   docs. Marked in candidate 6.
4. **Whether OMP can expose Anthropic's `memory_20250818` tool to a lane.** It is a Messages
   API parameter requiring a client-side handler; whether the harness passes arbitrary tool
   entries through is a first-party `OMP_SRC` question I did not open. Marked in candidate 7.
5. **Everything about how any of these behaves when actually run.** I installed and drove
   nothing. The only candidate I exercised is ctx, which is already installed here, and only
   through read-only commands. Every statement about Beads, LangGraph, Amp, and the memory
   tool is what their docs say they do.
6. **Whether P-17's verification clause is satisfiable by any of the seven.** I report that no
   source I read documents verifying the injected context was consumed. That is a
   not-found, not a not-exists.
7. **The parent's figures in REVIEW.md** (1,687 sessions, 52,314 messages, 67,051 tool calls,
   581 transcripts, the gate-log counts) are the parent's measurements on a different day and
   are restated as the parent's, never as mine. My own counts are 603 and 61, both run this
   session.

## Coverage

Seven candidates and eighteen retrievals, so this is a table.

| Subject | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| **ctx** (incumbent) | 3 URLs + 6 local commands + 2 repo files | all 3 URLs in full; all 6 commands run and output read; `REVIEW.md` §§ 7–8 and the ctx `SKILL.md` read | `ctx sources --json` → `error: unexpected argument` (the docs' own instruction); not fatal, `ctx sources` gave the same data | **yes** — the vendor's own "we are not agent memory" framing plus a live source listing settles both halves of the P-13 question for the incumbent |
| **Beads** | 6 URLs (README, AGENT_INSTRUCTIONS, docs home, llms.txt index, codex integration, remember, events-journal, multi-agent) | 5 in full, 2 truncated at line 300 (AGENT_INSTRUCTIONS 300/537, events-journal 300/491) | none | **yes for the mechanism; no for the data model** — I would read `core-concepts/issues.md` next, because it is the field reference that would confirm or refute the no-decision-type finding |
| **Anthropic artifact / memory patterns** | 2 URLs | both in full, appendices included | none | **yes** — the artifact passage and the external-memory passage are the two the question turns on and both are quoted verbatim |
| **LangGraph** | 1 URL | in full | none | **yes for the split; no for durability modes** — wave 1's report A records that `/durable-execution` redirects to this same page, so I did not re-attempt it |
| **Osmani's four channels** | 1 URL | 300 of 309 lines | none | **yes** — the four channels are quoted verbatim from within the read portion |
| **Amp threads** | 2 URLs (docs index, Threads) | both in full | none | **partly** — enough for every table cell; the auto-handoff discrepancy would need the Prompting and CLI pages I did not open |
| **Anthropic memory tool** | 1 URL | 300 of 1,032 lines | none | **yes for placement; no for the command contract** — the per-command semantics are in the unread portion |
| **Reddit / practitioner accounts** | 1 URL | nothing — JS shell | JS-rendered, no content; tried once per the brief | **yes, justified thin** — every claim here required a vendor doc or a CLI run, neither of which Reddit supplies. No practitioner accounts were used, so the brief's cap of ten is unspent |

**Retrieved and never opened:** the ~160 Beads doc pages listed in `llms.txt` that I did not
fetch — notably `core-concepts/issues.md`, `core-concepts/graph-links.md`,
`core-concepts/metadata.md`, `integrations/claude-code.md`, `multi-agent/coordination.md`,
`multi-agent/federation.md`, `workflows/gates.md`, and the whole `cli-reference/` tree beyond
`remember.md`; the Amp docs index entries beyond Threads; the LangGraph `/checkpointers` and
`/stores` child pages linked from the persistence page; the `ctx` docs pages linked from
ctx.rs (`/blame`, `/concepts/how-it-works`, `/reference/cli`, `/comparisons/codebase-graphs`,
`/comparisons/grep-log-search`, `/providers/native-imports`); and the Anthropic Cookbook
memory page linked from the context-engineering post. Each was visible as a link or an index
row and deliberately left closed once the question in front of it was answered — except the
Beads `core-concepts/` pages, which are the one gap I would close first.

**Nothing was downloaded and left unread.** Every URL fetched was read to the point the tool
delivered, and every truncation is declared in *Sources I could not fully read*.

<!-- output-types
tier: 0
CLAIM: 10
CITE: 46
GUESS: 15 (inference 15, pattern 0, recall 0)
ACTION: 0
PMDW: 1
QUESTION: 1
-->
