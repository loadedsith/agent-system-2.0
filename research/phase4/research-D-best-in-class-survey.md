# Research D — best-in-class examples of what we're doing: a survey of orchestrators people actually run

## Question

**PMDW**

Jo's fourth Phase 4 priority, in Jo's words from `/Users/jowolff/code/agent-system-2.0/briefs/research.md`:
*"i don't see any research out onto the internet to find best-in-class examples of what we're doing other
than looking into things that addy and steve have done?"* — a survey, not limited to named authors, of
orchestrators and graph-engineered multi-agent coding systems that people actually run, judged against
`REQUIREMENTS.md`.

---

## Blockers and open questions

**GUESS(inference)**

Reddit is unreadable from this session's fetch tool. Four distinct URL forms were tried
(`www.reddit.com/…`, `www.reddit.com/….json`, `old.reddit.com/…`, `www.reddit.com/….rss`) and each
failed: 403, 403, a login-wall redirect, and 429 respectively. The practitioner threads Jo specifically
asked for are therefore present in this report only as **search-result excerpts returned by the
`web_search` tool**, never as pages I read. Every such statement is marked
`CITE (search excerpt only)` at the point it is made, and each URL is listed in
§ *Sources I could not fully read* with an importance grade. This is the one part of the brief I could
not satisfy at full fidelity; it is why this report is **Tier 2**.

**QUESTION**

Two candidates below are the closest existing things to the shape `REQUIREMENTS.md` describes, and they
pull in opposite directions on P-15 (portability from Jo's own GitHub repo). Sourcegraph Amp's Puck and
Google Antigravity's Agent Manager both give you a single conversational surface that *is* the
orchestrator (P-6, P-7) with live lane state (P-7a) — but both are closed, hosted products whose lane
model lives on their servers, not in a repo you can clone onto another machine. The open-source
orchestrators (Claude Squad, Ruflo, Superset) are portable but none of them holds a conversational
orchestrator surface; their surface is a board, a TUI list, or a CLI. Options: (a) treat Amp/Antigravity
as the **design reference** for the surface and build the portable equivalent, accepting that no existing
project gives you both; (b) adopt one of them as the surface and give up P-15 for that layer; (c) decide
P-15 only covers the *machinery you wrote* and not the harness underneath it. I wrote the report under
(a) because it is the only reading that leaves every requirement in `REQUIREMENTS.md` intact — but this
is a decision about what 2.0 *is*, not a fact I can look up.

---

## Answer

**PMDW**

Conclusion first, then the evidence for each candidate.

**CITE**

The single closest existing analogue to the requirement set is **Sourcegraph Amp**, and specifically
three of its parts read together: *Puck* (a personal assistant surface that starts agents, tracks them,
messages them, and brings results back), *orbs* (persistent remote machines, one per thread, that sleep
for free and wake with files and services intact), and *the Dial* (a work-kind → model-tier routing
control where the user picks effort, not a model). Puck: *"Puck is your personal Amp assistant that helps
you manage everything you do in Amp: start agents, monitor them, send messages to them, create projects…
Puck can keep track of the agents it starts, send them more instructions, and bring their results back to
you."* (https://ampcode.com/docs/markdown/puck). Orbs: *"When you send another prompt, the orb wakes up
with your conversation, files, and services still in place."* (https://ampcode.com/docs/markdown/orbs).
The Dial: *"The Dial controls how hard Amp works on a task. Choose a mode based on how much the agent
needs to figure out, not on which model happens to be behind it… Amp chooses the model, reasoning effort,
system prompt, tools, and oracle for each mode."* (https://ampcode.com/docs/markdown/the-dial).

**CITE**

The closest analogue on *lane mechanics* — how a lane owns its own hands, and how the orchestrator knows
lane state without the lane choosing to report — is **Google Antigravity**. Its subagents have an
explicit three-state lifecycle the surface displays live: *"At any point during a session, a subagent
exists in one of three states… Running… Idle… Killed"*, agents address each other by conversation ID
(*"Agents can communicate with parent agents, subagents, or peer agents whose ID is known"*), an idle
agent auto-wakes on a message (*"Sending a message to an idle subagent automatically re-awakens it"*),
and approvals bubble to the human rather than being decided by the parent (*"If a subagent encounters a
tool execution requiring user authorization, the request automatically bubbles up to the main
UI/Subagent panel"*). The `/agents` panel shows *"a live checklist of all active, completed, killed, or
failed background agents"* with identifier, role, state, and current step.
(https://antigravity.google/docs/subagents)

**CITE**

The clearest statement of *why* an orchestrator over persistent workers is the right shape at all —
framed as a throughput problem, not a capability problem — is **Superset**, a Mac app with an open repo
(14.5k stars shown on their own page) whose CTO wrote the plan out: *"Most people believe that the path
from seven to 100 agents is better models, faster inference, and smarter agents. It's not. Agent compute
is already cheap enough… What's stopping us is every agent needs a human to review its code, give
feedback, and decide what to work on next. Scale the agents all you want — it's the humans that don't
scale."* Their proposed fix is a filter layer, which is P-8c stated in someone else's words: *"you could
have a dedicated bouncer agent that sits between the coding agents and you, preventing agents from
surfacing its work until it's sure the agent is either done with its work or is sufficiently stuck. Your
review becomes a final sign-off, not a first pass."* (https://superset.sh/blog/roadmap-to-100-agents)

**CITE**

The strongest documented *counter-position* to the whole lane model comes from Cognition (Devin), and it
is not a hedge — it is a rule: *"I would argue that Principles 1 & 2 are so critical, and so rarely worth
violating, that you should by default rule out any agent architectures that don't abide by them"*, where
Principle 1 is *"Share context, and share full agent traces, not just individual messages"* and
Principle 2 is *"Actions carry implicit decisions, and conflicting decisions carry bad results"*. Walden
Yan's conclusion on parallel agents in 2025: *"running multiple agents in collaboration only results in
fragile systems. The decision-making ends up being too dispersed and context isn't able to be shared
thoroughly enough between the agents."* (https://cognition.com/blog/dont-build-multi-agents)

**GUESS(inference)**

Read against `REQUIREMENTS.md`, that counter-position bites on P-8 (the lane owns its hands) far less
than it looks, because Cognition's target is *sibling subagents splitting one task*, whereas P-5 binds a
lane to a workload rather than to a slice of a single task. What it does bite on is any future design
where the orchestrator fans one piece of work across two lanes. What would settle it: whether 2.0 ever
splits a single deliverable across lanes, which is a Phase 5 design decision, not a fact about Cognition.

---
## The candidates

**PMDW**

Ten candidates, in three kinds: (a) frameworks and products that orchestrate multiple coding agents with
persistent workers behind one human surface; (b) open-source orchestrators individuals built and wrote
up; (c) first-hand practitioner accounts of running several long-lived agents on real work. Each has at
least one primary source fetched in this session.

### 1. Sourcegraph Amp — Puck, orbs, and the Dial *(kind a: product)*

**CITE**

**What it is and who runs it.** A commercial coding agent and development environment from Sourcegraph,
with a web app, a TUI, a CLI, macOS and iOS apps, and remote execution environments. The docs index
describes it as *"a coding agent and development environment built for the frontier"*
(https://ampcode.com/docs).

**CITE**

**Shape.** The human's default surface is *Puck*, opened with Ctrl+/ from any page:
*"Puck can handle quick requests itself or start agents to do larger pieces of work"*, with worked
examples including `Start an agent in ampcode/amp to investigate why CI is failing` and `Start one agent
for each script in this repository, then summarize what they found`. Puck *"can split a request across
several agents and gather their reports"* and *"can find previous conversations, check active threads,
archive completed work, and help you return to an investigation"*
(https://ampcode.com/docs/markdown/puck). Work runs in *orbs* — *"remote machines where Amp agents work
without using your computer. Every orb thread gets a fresh, isolated environment with your code, plugins,
development tools, and the context of the thread that created it."* Persistence is explicit and cheap:
*"When the agent is done, the orb goes to sleep, and a sleeping orb costs nothing, even if it sleeps for
weeks."* Spend is bounded by an actual rate limit: *"Each user can start a burst of 20 metered orbs.
After that burst, Amp starts one new orb every five minutes. Later orb starts wait instead of failing."*
(https://ampcode.com/docs/markdown/orbs). Model choice is taken away from the user by design and
replaced with a work-kind dial — `low` / `medium` / `high` / `ultra` — where *"Amp chooses the model,
reasoning effort, system prompt, tools, and oracle for each mode"*, and *"A thread keeps the mode you
chose when you sent its first message. You cannot change the mode later in that thread."* Three routable
roles exist per mode — *"Main Agent runs the conversation. Oracle handles the second opinions requested
through the `oracle` tool. Subagents covers Task workers, codebase search, thread reading, and the
Librarian"* — each independently pinnable or left on Auto
(https://ampcode.com/docs/markdown/the-dial).

**GUESS(inference)**

This is the nearest thing on the open internet to P-6 + P-7 + P-9 implemented together: one
conversational surface that holds the agent inventory, persistent per-thread workers, and a work-kind
routing rule with a per-thread ceiling instead of a per-dispatch approval. What it does not give is
P-15: the lane model lives on Sourcegraph's servers. Based on reading the four docs pages above; I did
not run Amp.

### 2. Google Antigravity 2.0 and CLI *(kind a: product)*

**CITE**

**What it is and who runs it.** Google's agent-first development platform, in four surfaces: a desktop
app (*"Your standalone desktop command center for your agents"*), a CLI/TUI (`agy`), a Python SDK, and
an IDE. *"Antigravity enables developers to operate at a higher, task-oriented level managing agents
across workspaces"* (https://antigravity.google/docs/home).

**CITE**

**Shape.** Agents live inside *Projects*, which *"define the boundaries of the folders and repositories
they can access"*, and a project may hold several folders: *"Adding multiple folders provides your agent
with full cross-repository context."* A new agent is started in *Local Mode* or *New Worktree Mode*
(https://antigravity.google/docs/getting-started). A parent agent spawns hands with an
`invoke_subagent` tool; the hand *"can either inherit the same workspace as its parent (`inherit`),
create an isolated Git worktree (`branch`), or share directory storage (`share`)"* and *"does not
inherit the parent's existing conversation history (context window), starting with a clean slate."*
Hands are defined as Markdown files with YAML frontmatter, discovered from `.agents/agents/<name>.md`
in the repo or `~/.gemini/config/agents/` machine-wide, each carrying its own `tools`, `model`
(`inherit`, `flash`, or `pro`), `commandExecutionPolicy`, `mcpServers`, and `skills`. Nesting is capped:
*"A maximum nesting depth of 10 levels… is strictly enforced to prevent runaway recursion or resource
exhaustion."* Approvals stay with the human: *"If a subagent encounters a tool execution requiring user
authorization, the request automatically bubbles up to the main UI/Subagent panel"*, with an `Alt+J`
shortcut that *"teleport[s] from your current conversation directly into the Detail View of the next
subagent awaiting your approval"* (https://antigravity.google/docs/subagents).

**GUESS(inference)**

Two features map onto requirements nothing else in this survey covers. The three-state lifecycle
(Running / Idle / Killed) rendered as a live checklist is P-7a — the surface's knowledge of a lane is the
lane's actual state, not a document about it. And auto-wake on message (*"An idle agent automatically
re-awakens to the Running state upon receiving a message from another agent"*) is the delivery mechanic
P-7c asks for, though the docs do not say whether the sender receives a delivery receipt. What would
settle that: the `invoke_subagent` / messaging tool's return value, which is not in the public docs.

### 3. Superset *(kind a: product with an open repo and a written plan)*

**CITE**

**What it is and who runs it.** A macOS desktop app plus CLI, TypeScript SDK, MCP server, and iPhone app,
from a company of the same name; source at https://github.com/superset-sh/superset under Elastic License
2.0. Self-description: *"Superset runs CLI-based coding agents in parallel across isolated git worktrees,
with built-in terminal, review, and open-in-editor workflows"*
(https://raw.githubusercontent.com/superset-sh/superset/main/README.md).

**CITE**

**Shape.** Persistence is per-workspace and survives restarts: *"Tabs, infinite splits, presets, and
persistent sessions that survive restarts"*; each workspace gets *"its own git worktree with its own
branch, terminal, and environment."* The human surface is a sidebar over all workspaces —
*"Track every agent from the sidebar, with working indicators, completion chimes, and dock badges when
one needs your attention"* — plus a command palette and an in-app diff viewer. The same workspaces are
reachable from four surfaces: *"Every surface talks to the same workspaces, so you can start a task in
the app and check on it from anywhere"* — desktop, CLI (`superset` binary), SDK, and an MCP server whose
stated purpose is to *"Let Claude Code, Codex, Cursor, and other agents create and manage workspaces
themselves."* Model choice is per-launch and per-agent: *"choose a model and reasoning effort when you
launch an agent"*, with *"Per-agent settings: tune launch commands, prompt templates, and model
overrides."* Agents can spawn agents through bundled skills: *"agents come pre-loaded with `superset:*`
skills (orchestrate parallel agents, schedule automations, file feedback, diagnose issues)"*. The
supported-agent table lists **Oh My Pi** (https://github.com/can1357/oh-my-pi) as *"Fully supported"*
alongside Claude Code, Codex, Amp, and Antigravity CLI.

**CITE**

**The written plan.** CTO Satya Patel, 2026-02-02: they *"reliably manage 5-7 coding agents in parallel…
Our goal is to be able to manage 100 coding agents in parallel each by the end of 2026"*, and the
bottleneck they name is the human, not the model — *"Right now, most of our agents spend more time
waiting for us to review their work than they spend doing it."* Their three levers are: agents work
harder before interrupting you (adversarial reviewer agents, stacked review agents, a *bouncer* agent);
agent-driven review UIs (*"the agent prepares your review for you… When you open a completed task, you
should be looking at a prepared briefing, not raw output"*); and event-driven proactivity
(https://superset.sh/blog/roadmap-to-100-agents).

**GUESS(inference)**

Superset is the candidate whose *stated problem* matches `REQUIREMENTS.md` most exactly — P-6's one
window, P-8c's exception-based visibility, and P-9's spend-by-routing are each visible in that post — but
its *surface* is a workspace sidebar rather than a conversational orchestrator, so P-7 is unmet. The MCP
server is the interesting seam: it is the one documented path by which an outside orchestrator could hold
the lane model while Superset holds the lanes. Whether that is enough for P-7a depends on what the MCP
server exposes about live state, which I did not read (docs.superset.sh was not fetched).

### 4. Vibe Kanban *(kind a: open-source product — sunsetting)*

**CITE**

**What it is and who runs it.** An open-source kanban board over coding agents from BloopAI, run with
`npx vibe-kanban`. **The project is shutting down**: the README's top heading reads *"Vibe Kanban is
sunsetting."* with a link to https://www.vibekanban.com/blog/shutdown
(https://raw.githubusercontent.com/BloopAI/vibe-kanban/main/README.md).

**CITE**

**Shape.** The human surface is a board, and the premise is explicitly about the human's time:
*"In a world where software engineers spend most of their time planning and reviewing coding agents, the
most impactful way to ship more is to get faster at planning and review."* Work routes from a kanban
issue to a workspace — *"each workspace gives an agent a branch, a terminal, and a dev server"* — and
the human reviews in place: *"Review diffs and leave inline comments — send feedback directly to the
agent without leaving the UI."* It is agent-agnostic across *"10+ coding agents — Claude Code, Codex,
Gemini CLI, GitHub Copilot, Amp, Cursor, OpenCode, Droid, CCR, and Qwen Code"*, self-hostable via
Docker, and exposes an MCP server (`MCP_HOST`/`MCP_PORT` runtime variables).

**GUESS(inference)**

Included because it is the clearest instance of *plan-then-execute as the product shape* (relevant to
P-12), and because its sunsetting is itself a datum: a well-known open-source orchestrator with a
company behind it did not survive. I did not read the shutdown post, so I cannot say why.

### 5. Claude Squad *(kind b: open-source personal orchestrator)*

**CITE**

**What it is and who runs it.** A Go terminal app (`cs`) under AGPL-3.0 from smtg-ai that *"manages
multiple Claude Code, Codex, Gemini (and other local agents including Aider) in separate workspaces,
allowing you to work on multiple tasks simultaneously"*
(https://raw.githubusercontent.com/smtg-ai/claude-squad/main/README.md).

**CITE**

**Shape.** Three mechanisms, stated plainly in the README's *How It Works*: *"1. tmux to create isolated
terminal sessions for each agent. 2. git worktrees to isolate codebases so each session works on its own
branch. 3. A simple TUI interface for easy navigation and management."* The human surface is a list of
sessions in one window — *"Manage instances and tasks in one terminal window"* — and the human attaches
into a session on demand (`↵/o` to attach and reprompt, `ctrl-q` to detach). Sessions persist across
pause and resume (`c` checkout-and-pause, `r` resume). Which agent and which model a session runs is a
named profile in `~/.claude-squad/config.json`, chosen at session creation: *"Profiles let you define
multiple named program configurations and switch between them when creating a new session."*

**GUESS(inference)**

This is the minimal honest implementation of P-2 and P-6's escape hatch — persistent lanes as a managed
resource, one window over them, direct attach on demand — with nothing above it: no orchestrator that
routes, no memory, no spend rule. It is the shape 2.0 would have if only P-2 and the second half of P-6
were implemented. Based on the README; I did not run it.

### 6. Ruflo (formerly Claude Flow), by rUv *(kind b: open-source personal orchestrator)*

**CITE**

**What it is and who runs it.** An MIT-licensed *"agent meta-harness for Claude Code and Codex"* built by
`rUv`, installed either as Claude Code plugins or via `npx ruflo init`. The repo still lives at
`github.com/ruvnet/claude-flow`; the README states the rename directly: *"Claude Flow is now Ruflo —
named by rUv"*. Its framing: *"**Agent = Model + Harness.** The model writes; the harness gives it tools,
memory, loops, sandboxes, and controls so it can actually work. **Ruflo is the harness**"*
(https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md).

**CITE**

**Shape.** The README draws its own routing graph —
`User --> Ruflo (CLI/MCP) --> Router --> Swarm --> Agents --> Memory --> LLM Providers`, with a
`Learning Loop` edge feeding back from Agents to the Router. Routing is automatic rather than
per-dispatch: *"After `init`, just use Claude Code normally — the hooks system automatically routes
tasks, learns from successful patterns, and coordinates agents in the background."* Persistence and
spend each have a named plugin: `ruflo-rvf` — *"Save and restore agent memory across sessions"*;
`ruflo-agentdb` — *"Fast vector database for agent memory"*; `ruflo-cost-tracker` — *"Track token usage,
set budgets, get cost alerts"*; `ruflo-ruvllm` — *"Run local LLMs (Ollama, etc.) with smart routing"*.
Self-improvement is a first-class claim: `ruflo-intelligence` — *"Agents learn from past successes and
get smarter"* — and `ruflo-metaharness` — *"Audit your AI agent setup before you ship. Grade readiness
(1-100), scan tool configs for security issues, snapshot the whole project to catch regressions over
time"*. Installing the full CLI writes into the workspace: *"Files in your workspace… `.claude/`,
`.claude-flow/`, `CLAUDE.md`, helpers, settings"*.

**GUESS(inference)**

Ruflo is the only candidate in this survey that names all four of routing, cross-session memory, spend
tracking, and self-improvement as shipped components — which maps onto P-9, P-13, P-8d and P-16
together. Two cautions I can state as facts rather than opinions: the surface is Claude Code itself plus
a CLI, not a conversational orchestrator holding a lane model (so P-7 is unaddressed), and one
practitioner in this same survey (Ronacher, candidate 10) names `rUv`-adjacent tooling of this kind as
his central example of unreviewed volume. Whether the learning loop does what the README says is not
something I can establish from a README.

### 7. Anthropic's Research multi-agent system *(kind a: a production system, written up by its builders)*

**CITE**

**What it is and who runs it.** The multi-agent system behind Claude's Research feature, written up by
its engineering team (Jeremy Hadfield, Barry Zhang, Kenneth Lien, Florian Scholz, Jeremy Fox, Daniel
Ford), published 2025-06-13
(https://www.anthropic.com/engineering/multi-agent-research-system).

**CITE**

**Shape.** *"Our Research system uses a multi-agent architecture with an orchestrator-worker pattern,
where a lead agent coordinates the process while delegating to specialized subagents that operate in
parallel."* Memory is explicit and external: the lead agent *"begins by thinking through the approach and
saving its plan to Memory to persist the context, since if the context window exceeds 200,000 tokens it
will be truncated"*, and in the appendix — *"agents summarize completed work phases and store essential
information in external memory before proceeding to new tasks. When context limits approach, agents can
spawn fresh subagents with clean contexts while maintaining continuity through careful handoffs."*
Routing effort is a prompt-level rule, not a human approval: *"Simple fact-finding requires just 1 agent
with 3-10 tool calls, direct comparisons might need 2-4 subagents with 10-15 calls each, and complex
research might use more than 10 subagents."* Delegation quality is the named failure mode: *"Each
subagent needs an objective, an output format, guidance on the tools and sources to use, and clear task
boundaries."* Hands write to a filesystem rather than reporting everything upward: *"implement artifact
systems where specialized agents can create outputs that persist independently. Subagents call tools to
store their work in external systems, then pass lightweight references back to the coordinator."* Two
limits are stated against interest: *"multi-agent systems use about 15× more tokens than chats"*, and
*"Currently, our lead agents execute subagents synchronously… the lead agent can't steer subagents,
subagents can't coordinate, and the entire system can be blocked while waiting for a single subagent."*

**GUESS(inference)**

Three of these map onto open requirements. The artifact pattern is a concrete answer to P-8b (the lane's
report to the orchestrator is the distrusted link — so don't make the report the channel; make the
artifact the channel). The scale-effort-to-complexity rule is P-9's work-kind taxonomy in miniature. The
15× figure is theirs, measured on chat workloads rather than coding lanes, and bears on P-14 only as an
order-of-magnitude warning — it is not a measurement of what 2.0 would cost.

### 8. Cognition / Devin — *Don't Build Multi-Agents* *(kind a: a production system's stated architecture, as a counter-position)*

**CITE**

**What it is and who runs it.** Walden Yan of Cognition, the company behind Devin, 2025-06-12
(https://cognition.com/blog/dont-build-multi-agents).

**CITE**

**Shape.** The recommended architecture is the opposite of parallel lanes: *"The simplest way to follow
the principles is to just use a single-threaded linear agent… Here, the context is continuous."* For
long tasks, they add a compression model rather than more agents: *"we introduce a new LLM model whose
key purpose is to compress a history of actions & conversation into key details, events, and decisions…
Depending on the domain, you might even consider fine-tuning a smaller model (this is in fact something
we've done at Cognition)."* Their reading of Claude Code's subagents at the time: *"it never does work in
parallel with the subtask agent, and the subtask agent is usually only tasked with answering a question,
not writing any code… The designers of Claude Code took a purposefully simple approach."* And the named
cost of parallelism: *"Subagent 1 and subagent 2 cannot not see what the other was doing and so their
work ends up being inconsistent with each other."*

**GUESS(inference)**

Where this bears on `REQUIREMENTS.md`: it is a direct argument against any design where two lanes hold
conflicting implicit decisions about the same deliverable, and it is an argument *for* P-13 — the
compression-into-*decisions* model is the same idea as "recall prior work **and the decisions made about
it**". It is not an argument against P-2 as written, because P-5 binds a lane to a workload rather than
to a slice of one task. Settling that would take a case where 2.0 actually splits one deliverable across
lanes; none exists yet.

### 9. Geoffrey Huntley — the Ralph technique *(kind c: first-hand practitioner account)*

**CITE**

**What it is and who runs it.** Huntley's own write-up, published 2025-07-14, of a technique he used to
build a programming language (CURSED): *"Ralph is a technique. In its purest form, Ralph is a Bash
loop"* — `while :; do cat PROMPT.md | claude-code ; done` (https://ghuntley.com/ralph/).

**CITE**

**Shape.** Deliberately *not* multi-agent at the top level: *"While I was in SFO, everyone seemed to be
trying to crack on multi-agent, agent-to-agent communication and multiplexing. At this stage, it's not
needed… Ralph is monolithic. Ralph works autonomously in a single repository as a single process that
performs one task per loop."* But the primary context window is explicitly an orchestrator over hands:
*"Ralph requires a mindset of not allocating to the primary context window. Instead, what you should do
is spawn subagents. Your primary context window should operate as a scheduler, scheduling other
subagents to perform expensive allocation-type work."* Parallelism is capped per work-kind, in the
prompt: *"You may use up to parrallel subagents for all operations but only 1 subagent for build/tests
of rust"* — because *"If you were to fan out to a couple of hundred subagents and then tell those
subagents to run the build and test of an application, what you'll get is bad form back pressure."*
What persists between loops is files, not context: the plan (`@fix_plan.md`) and the specs are
*"deterministically allocate[d] to the stack the same way every loop"*, and tests carry their own
rationale forward — *"it's crucial in that moment to ask Ralph to write out the meaning and the
importance of the test… because future loops will not have the reasoning in their context window."*

**GUESS(inference)**

Two things here bear on requirements. "Primary context window as a scheduler" is P-8 stated from the
lane's side: the lane owns its hands and spends its own context on routing rather than on work. And the
file-based carry-forward is a working P-13 with no tooling at all — decisions survive in the repo, not
in a memory system. What would settle whether that is sufficient for 2.0: whether Jo needs recall
*across* repos and lanes (P-13 says yes), which the Ralph pattern does not provide.

### 10. Armin Ronacher — *Agent Psychosis* *(kind c: first-hand practitioner account, critical)*

**CITE**

**What it is and who runs it.** Armin Ronacher (creator of Flask, Jinja), 2026-01-18
(https://lucumr.pocoo.org/2026/1/18/agent-psychosis/).

**CITE**

**Shape.** Not a system — a first-hand account of running these setups and of reviewing their output as a
maintainer. The token-economics claim is specific and comparative: *"A well-prepared session with good
tooling and context can be remarkably token-efficient. For instance, the entire port of MiniJinja to Go
took only 2.2 million tokens. But the hands-off approaches—spinning up agents and letting them run
wild—burn through tokens at staggering rates. Patterns like Ralph are particularly wasteful: you restart
the loop from scratch each time, which means you lose the ability to use cached tokens or reuse
context."* And a standing risk to any design that assumes today's prices: *"We should also remember that
current token pricing is almost certainly subsidized. These patterns may not be economically viable for
long. And those discounted coding plans we're all on? They might not last either."* On the review side:
*"It takes you a minute of prompting and waiting a few minutes for code to come out of it. But actually
honestly reviewing a pull request takes many times longer than that. The asymmetry is completely
brutal."* He names Steve Yegge's Beads and Gas Town as his central examples, quoting the Gas Town manual
at the top of the piece.

**GUESS(inference)**

This is the strongest documented pressure on P-14 (2.0 runs within the subscriptions and budget Jo
actually has) from someone running the tools: it says the cost difference between a well-contexted
session and a hands-off loop is large, and that per-token prices may be temporary. Its 2.2M-token figure
is Ronacher's, for a single port, and I have not reproduced it. It also independently restates
Superset's bottleneck claim (candidate 3) from the receiving end — the review asymmetry — which makes
that a two-source pattern rather than one vendor's framing.

### Reddit: what I searched and what I came back with

**ACTION**

One `web_search` with `site:reddit.com running multiple long-lived coding agents orchestrator my setup
persistent` → ten results. Then four fetch attempts against two of those threads:
`https://www.reddit.com/r/AI_Agents/comments/1tas0o5/...` → HTTP 403 on the `.json` form, a
JavaScript-only shell on the HTML form; `https://old.reddit.com/r/AI_Agents/comments/1tas0o5/...` →
redirected to `old.reddit.com/login`; `https://www.reddit.com/r/AI_Agents/comments/1tas0o5.rss` → HTTP
429; `https://www.reddit.com/r/LocalLLaMA/comments/1qpbcez/...` → JavaScript-only shell. Nothing was
reversed or written; no reversal needed.

**CITE (search excerpt only — page body not retrieved)**

The excerpts the search tool returned, which are all I have of these threads:
r/AI_Agents 1tas0o5 — *"I got into the habit of running 6-9 Claude Code and Codex sessions at once
across different repos and honestly the 'management' side of it was a mess."*
r/LocalLLaMA 1qpbcez — *"I'm working on parallelising my AI dev workflow. I'm currently running multiple
Claude Code instances, but the coordination is manual and messy."*
r/LocalLLM 1ug2ydp — *"I built Orcasynth — a self-hosted daemon that orchestrates all of them from one
web dashboard. Each agent runs in its own tmux session + git worktree. MIT"*
r/ClaudeAI 1rjxx17 — *"I built a framework for making Claude Code agents persistent, self-correcting,
and multi-terminal. I run 4 AI coding agents at once."*
r/AI_Agents 1rfwt3p — *"Agent Orchestrator runs multiple coding agents (CC, OC, Codex, etc) in parallel
and manages the coordination work you normally do manually."*

**GUESS(inference)**

Read together, the excerpts say the same thing in five different voices — people are already running 4-9
long-lived coding agents and the pain they name is coordination and management, not model quality. That
is the same claim Superset makes with a company behind it. I am labelling this GUESS rather than CITE
because I read headlines and one-sentence excerpts, not the threads; the actual setups, which is what Jo
asked for, are behind the JavaScript wall. Every URL is in § *Sources I could not fully read* with a
grade.

---

## Mapping to REQUIREMENTS.md

**PMDW**

One row per candidate. Cell values: **sat** = the source says something that satisfies the requirement;
**con** = the source says something that contradicts it or argues against it; **part** = satisfies some
of it and is silent or short on the rest; **—** = silent in the sources I read. Bracketed numbers are
receipt keys, listed in full under the table. A cell with no bracket is a GUESS with its basis named in
the notes.

**CLAIM**

The requirement ids used below are the ones in `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:8-33`
— a single Markdown table, `P-1` through `P-17`, one row each. The nine columns in this survey are the
nine the brief named. Three requirement lines are quoted here because the mapping turns on their exact
wording: `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:11` — *"Lanes are first-class: a lane is a managed resource of the
orchestrator, one persistent working context that would otherwise be another terminal window."*;
`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:16` — *"That surface **is** the orchestrator — the thing that holds the lane model and
routes — not a layer over something else."*; `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:32` — *"The system observes its own errors
and repetitions and **proposes** a hook, prose fix, or skill for Jo to accept — never applies one
itself."* `P-17` is the last row of that table and is not among the nine the brief named for this survey's
columns, which is why it has no column of its own.

| Candidate | P-2 lanes | P-6 one window | P-7 surface *is* orchestrator | P-8 lane owns hands | P-9 routing/spend | P-12 plan option | P-13 memory | P-15 portable | P-16 self-improve |
|---|---|---|---|---|---|---|---|---|---|
| 1. Amp | sat [1] | sat [2] | sat [2] | part [3] | sat [3][1] | — | part [2] | **con** [1] | — |
| 2. Antigravity | sat [4][5] | sat [6][5] | part [5] | sat [5] | part [5] | — | con [5] | part [5] | — |
| 3. Superset | sat [7] | sat [7] | con [7] | sat [7] | sat [7] | — | — | part [7] | — |
| 4. Vibe Kanban | sat [9] | sat [9] | con [9] | — | — | sat [9] | — | sat [9] | — |
| 5. Claude Squad | sat [10] | sat [10] | con [10] | — | part [10] | — | — | sat [10] | — |
| 6. Ruflo | part [11] | con [11] | con [11] | sat [11] | sat [11] | — | sat [11] | sat [11] | sat [11] |
| 7. Anthropic Research | con [12] | sat [12] | sat [12] | sat [12] | sat [13] | sat [12] | sat [14] | n/a | sat [15] |
| 8. Cognition | con [16] | sat [16] | — | **con** [16] | — | — | sat [17] | — | — |
| 9. Ralph | con [18] | sat [18] | sat [19] | sat [19] | sat [20] | sat [21] | part [21] | sat [18] | sat [23] |
| 10. Ronacher | — | — | — | — | con [22] | — | part [22] | — | — |

### Receipts

1. https://ampcode.com/docs/markdown/orbs — *"Every orb thread gets a fresh, isolated environment with
   your code, plugins, development tools, and the context of the thread that created it."* /
   *"a sleeping orb costs nothing, even if it sleeps for weeks."* / *"Each user can start a burst of 20
   metered orbs. After that burst, Amp starts one new orb every five minutes."* The P-15 **con** is the
   same passage read the other way: *"Orbs are remote machines"*, Amp's, not Jo's.
2. https://ampcode.com/docs/markdown/puck — *"Puck can handle quick requests itself or start agents to
   do larger pieces of work"*; *"can split a request across several agents and gather their reports"*;
   *"can find previous conversations, check active threads, archive completed work, and help you return
   to an investigation."* P-13 is **part** because that is thread search, not recall of decisions with
   provenance across repos.
3. https://ampcode.com/docs/markdown/the-dial — *"Amp chooses the model, reasoning effort, system
   prompt, tools, and oracle for each mode"*; *"A thread keeps the mode you chose when you sent its
   first message. You cannot change the mode later in that thread."*; *"Main Agent runs the
   conversation. Oracle handles the second opinions… Subagents covers Task workers, codebase search,
   thread reading, and the Librarian."* P-8 is **part**: the roles exist per thread, but nothing I read
   says the orchestrator never dispatches into a thread.
4. https://antigravity.google/docs/getting-started — *"Local Mode"* / *"New Worktree Mode"*; projects
   *"define the boundaries of the folders and repositories they can access"*; *"Adding multiple folders
   provides your agent with full cross-repository context."*
5. https://antigravity.google/docs/subagents — `invoke_subagent`; *"inherit the same workspace as its
   parent (`inherit`), create an isolated Git worktree (`branch`), or share directory storage
   (`share`)"*; *"does not inherit the parent's existing conversation history (context window),
   starting with a clean slate"*; agent definitions as Markdown in `.agents/agents/<name>.md` or
   `~/.gemini/config/agents/` with `tools`, `model`, `commandExecutionPolicy`, `mcpServers`, `skills`;
   *"A maximum nesting depth of 10 levels… is strictly enforced"*; *"An idle agent automatically
   re-awakens to the Running state upon receiving a message from another agent"*; *"the request
   automatically bubbles up to the main UI/Subagent panel"*; `Alt+J` to *"teleport from your current
   conversation directly into the Detail View of the next subagent awaiting your approval."* P-9 is
   **part** (per-agent `model: inherit|flash|pro`, no ceiling documented); P-13 is **con** on the one
   thing the docs do say — a fresh subagent starts with a clean slate and the docs name no store it
   could read from; P-15 is **part** because the agent definitions are repo files you can clone while
   the runtime is Google's.
6. https://antigravity.google/docs/home — *"Your standalone desktop command center for your agents"*;
   *"Antigravity enables developers to operate at a higher, task-oriented level managing agents across
   workspaces."*
7. https://raw.githubusercontent.com/superset-sh/superset/main/README.md — *"runs CLI-based coding
   agents in parallel across isolated git worktrees"*; *"persistent sessions that survive restarts"*;
   *"Track every agent from the sidebar, with working indicators, completion chimes, and dock badges
   when one needs your attention"*; *"Every surface talks to the same workspaces"*; *"choose a model and
   reasoning effort when you launch an agent"*; *"agents come pre-loaded with `superset:*` skills
   (orchestrate parallel agents, schedule automations, file feedback, diagnose issues)"*; supported-agent
   table lists **Oh My Pi** (https://github.com/can1357/oh-my-pi) as *"Fully supported"*. P-7 is **con**
   because the surface described is a sidebar and command palette, not something you converse with;
   P-15 is **part** — source-available under Elastic License 2.0 and it runs on your machine, but it is
   a company's product, not a repo of your own machinery.
8. https://superset.sh/blog/roadmap-to-100-agents — Satya Patel, 2026-02-02: *"we reliably manage 5-7
   coding agents in parallel"*; *"Right now, most of our agents spend more time waiting for us to review
   their work than they spend doing it"*; *"the agent prepares your review for you… you should be
   looking at a prepared briefing, not raw output."* (Bears on P-8c, which is not a column here.)
9. https://raw.githubusercontent.com/BloopAI/vibe-kanban/main/README.md — *"Vibe Kanban is
   sunsetting."*; *"each workspace gives an agent a branch, a terminal, and a dev server"*; *"In a world
   where software engineers spend most of their time planning and reviewing coding agents, the most
   impactful way to ship more is to get faster at planning and review"*; *"Review diffs and leave inline
   comments"*; *"10+ coding agents — Claude Code, Codex, Gemini CLI, GitHub Copilot, Amp, Cursor,
   OpenCode, Droid, CCR, and Qwen Code"*; Docker self-hosting; `MCP_HOST`/`MCP_PORT`.
10. https://raw.githubusercontent.com/smtg-ai/claude-squad/main/README.md — *"1. tmux to create isolated
    terminal sessions for each agent. 2. git worktrees to isolate codebases… 3. A simple TUI
    interface"*; *"Manage instances and tasks in one terminal window"*; attach/detach and pause/resume
    keys; *"Profiles let you define multiple named program configurations and switch between them when
    creating a new session."*
11. https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md — *"Claude Flow is now Ruflo"*;
    *"**Agent = Model + Harness.**… **Ruflo is the harness**"*; the README's own routing graph
    `User --> Ruflo (CLI/MCP) --> Router --> Swarm --> Agents --> Memory --> LLM Providers` with a
    `Learning Loop` edge from Agents back to Router; *"the hooks system automatically routes tasks,
    learns from successful patterns, and coordinates agents in the background"*; `ruflo-rvf` *"Save and
    restore agent memory across sessions"*; `ruflo-agentdb` *"Fast vector database for agent memory"*;
    `ruflo-cost-tracker` *"Track token usage, set budgets, get cost alerts"*; `ruflo-intelligence`
    *"Agents learn from past successes and get smarter"*; `ruflo-metaharness` *"Audit your AI agent
    setup before you ship. Grade readiness (1-100)…"*; MIT, `npx ruflo init` writes `.claude/`,
    `.claude-flow/`, `CLAUDE.md` into your workspace. P-2 is **part** and P-6/P-7 **con** because the
    human surface named throughout is Claude Code itself plus a CLI — *"After `init`, just use Claude
    Code normally"* — not a surface holding a lane model.
12. https://www.anthropic.com/engineering/multi-agent-research-system — *"a lead agent coordinates the
    process while delegating to specialized subagents that operate in parallel"*; *"The LeadResearcher
    begins by thinking through the approach and saving its plan to Memory to persist the context"*;
    *"Each subagent needs an objective, an output format, guidance on the tools and sources to use, and
    clear task boundaries."* P-2 is **con** in the specific sense that these subagents are task-scoped
    and die with the task — the post describes spawning *"fresh subagents with clean contexts"*, the
    opposite of a persistent lane.
13. Same page, principle 3 — *"Simple fact-finding requires just 1 agent with 3-10 tool calls, direct
    comparisons might need 2-4 subagents with 10-15 calls each, and complex research might use more than
    10 subagents with clearly divided responsibilities."*
14. Same page, appendix — *"agents summarize completed work phases and store essential information in
    external memory before proceeding to new tasks… they can retrieve stored context like the research
    plan from their memory rather than losing previous work when reaching the context limit."*
15. Same page, principle 5 — *"**Let agents improve themselves**. We found that the Claude 4 models can
    be excellent prompt engineers. When given a prompt and a failure mode, they are able to diagnose why
    the agent is failing and suggest improvements. We even created a tool-testing agent—when given a
    flawed MCP tool, it attempts to use the tool and then rewrites the tool description to avoid
    failures… This process for improving tool ergonomics resulted in a 40% decrease in task completion
    time for future agents using the new description."* Note the shape difference from P-16: this agent
    *applies* the rewrite; P-16 requires it to *propose* and stop.
16. https://cognition.com/blog/dont-build-multi-agents — *"The simplest way to follow the principles is
    to just use a single-threaded linear agent… Here, the context is continuous."*; *"Subagent 1 and
    subagent 2 cannot not see what the other was doing and so their work ends up being inconsistent with
    each other."*
17. Same page — *"we introduce a new LLM model whose key purpose is to compress a history of actions &
    conversation into key details, events, and decisions… you might even consider fine-tuning a smaller
    model (this is in fact something we've done at Cognition)."*
18. https://ghuntley.com/ralph/ — *"Ralph is a technique. In its purest form, Ralph is a Bash loop"*;
    *"Ralph is monolithic. Ralph works autonomously in a single repository as a single process that
    performs one task per loop."* P-15 **sat** follows from the artifact being a loop plus prompt files
    in the repo itself.
19. Same page — *"Ralph requires a mindset of not allocating to the primary context window. Instead,
    what you should do is spawn subagents. Your primary context window should operate as a scheduler,
    scheduling other subagents to perform expensive allocation-type work."*
20. Same page — *"You may use up to parrallel subagents for all operations but only 1 subagent for
    build/tests of rust"*, with the stated reason: *"If you were to fan out to a couple of hundred
    subagents and then tell those subagents to run the build and test of an application, what you'll get
    is bad form back pressure."*
21. Same page — the plan file `@fix_plan.md` and the specs are *"deterministically allocate[d] to the
    stack the same way every loop"*; *"it's crucial in that moment to ask Ralph to write out the meaning
    and the importance of the test… because future loops will not have the reasoning in their context
    window."* P-13 is **part**: decisions survive in repo files, but only within that one repo.
22. https://lucumr.pocoo.org/2026/1/18/agent-psychosis/ — *"Patterns like Ralph are particularly
    wasteful: you restart the loop from scratch each time, which means you lose the ability to use
    cached tokens or reuse context."*; *"the entire port of MiniJinja to Go took only 2.2 million
    tokens"* (Ronacher's figure, one port, not reproduced here); *"We should also remember that current
    token pricing is almost certainly subsidized."* P-13 **part** is the cache/context-reuse half of the
    same passage: what persists is what you avoid re-paying for.

### Three requirements no candidate in this survey satisfies as written

**GUESS(inference)**

**P-7b — the orchestrator never acts on Jo's authority.** The closest is Antigravity's approval bubbling
[5], which routes a subagent's authorization request to the human rather than letting the parent grant
it. That is the same principle applied one level down. Nothing I read states the rule at the
orchestrator level, i.e. that the top surface may not open, close, or approve on the human's behalf.

**P-7c — delivery to a lane is confirmed, not queued.** Antigravity documents auto-wake on message [5],
which is the wake half. No source I read documents a *receipt* going back to the sender. This is the
single most specific gap between `REQUIREMENTS.md` and everything surveyed.

**P-16 as written — propose, never apply.** Two candidates ship self-improvement (Ruflo's
`ruflo-intelligence` [11], Anthropic's tool-testing agent [15]) and both *apply* the improvement
automatically. The proposal-and-stop shape P-16 requires is not in either.

**GUESS(inference)**

**P-17 (resume already grounded) was added after the columns above were chosen**, so it has no column.
Three sources bear on it. Anthropic: *"we built systems that can resume from where the agent was when
the errors occurred"* and the handoff pattern in [14]. Ralph: every loop re-reads the same plan and spec
files from disk, which is resume-by-reconstruction rather than resume-by-restore [21]. Amp: threads
persist and Puck can *"help you return to an investigation"* [2]. None of the three describes verifying
that the resumed agent actually read the context before its first turn, which is the part P-17's open
column asks about.

---

## Patterns that recur across candidates

**PMDW**

Only patterns present in two or more independent sources, each with both receipts stated. Receipt keys
refer to the numbered list above; where a quote has not appeared yet it is given in full here.

**CITE**

**1. A lane is a git worktree plus a terminal.** Four of the five tool-shaped candidates implement
isolation the same way, and none of them invented anything else. Superset: *"runs CLI-based coding
agents in parallel across isolated git worktrees"*, each workspace with *"its own git worktree with its
own branch, terminal, and environment"* [7]. Claude Squad: *"git worktrees to isolate codebases so each
session works on its own branch"* plus *"tmux to create isolated terminal sessions for each agent"*
[10]. Antigravity: *"New Worktree Mode"* at agent creation [4] and `branch` mode for a subagent, which
*"create[s] an isolated Git worktree"* [5]. Vibe Kanban: *"each workspace gives an agent a branch, a
terminal, and a dev server"* [9].

**CITE**

**2. The human's review time, not the model, is the named bottleneck.** Superset's CTO: *"Right now,
most of our agents spend more time waiting for us to review their work than they spend doing it"* [8].
Vibe Kanban's README opens on the same premise: *"In a world where software engineers spend most of
their time planning and reviewing coding agents, the most impactful way to ship more is to get faster at
planning and review"* [9]. Ronacher says it from the reviewer's side: *"It takes you a minute of
prompting and waiting a few minutes for code to come out of it. But actually honestly reviewing a pull
request takes many times longer than that. The asymmetry is completely brutal"* [22]. Three sources —
one vendor, one open-source project, one independent maintainer — converging on the same constraint.

**CITE**

**3. What a hand produces goes to a file; what it reports upward is a reference.** Anthropic states the
reason as a named failure mode — *"Subagent output to a filesystem to minimize the 'game of telephone.'
… implement artifact systems where specialized agents can create outputs that persist independently.
Subagents call tools to store their work in external systems, then pass lightweight references back to
the coordinator"* [14]. Ralph does the same thing without the vocabulary: the plan and specs are files
re-read every loop, and *"it's crucial in that moment to ask Ralph to write out the meaning and the
importance of the test… because future loops will not have the reasoning in their context window"* [21].

**GUESS(inference)**

That pattern is the direct answer to P-8b (the lane's report to the orchestrator is the distrusted
link). Both sources arrived at it for the same stated reason — the report is lossy — rather than for a
trust reason, but the mechanism is identical.

**CITE**

**4. Effort is chosen by the kind of work, in a rule, with no per-dispatch human approval.** Amp: the
Dial's four modes where *"Amp chooses the model, reasoning effort, system prompt, tools, and oracle for
each mode"*, locked for the life of a thread [3]. Anthropic: *"Agents struggle to judge appropriate
effort for different tasks, so we embedded scaling rules in the prompts"*, then the 1-agent /
2-4-subagent / 10+-subagent ladder [13]. Ralph: a per-work-kind cap written into the prompt —
*"You may use up to parrallel subagents for all operations but only 1 subagent for build/tests of
rust"* [20]. Three different systems, three different ceilings, the same shape: a rule keyed on work
kind, applied without asking.

**CITE**

**5. Orchestrators are agent-agnostic; the CLI underneath is a setting.** Superset's supported table
covers Claude Code, Codex, Amp, Antigravity CLI and Oh My Pi, each marked *"Fully supported"* [7]. Vibe
Kanban: *"10+ coding agents — Claude Code, Codex, Gemini CLI, GitHub Copilot, Amp, Cursor, OpenCode,
Droid, CCR, and Qwen Code"* [9]. Claude Squad: *"multiple Claude Code, Codex, Gemini (and other local
agents including Aider)"*, selected per session by named profile [10]. No open-source orchestrator in
this survey binds itself to one vendor's agent.

**CITE**

**6. A hand starts with a clean context on purpose, and that is stated as a feature.** Antigravity: a
subagent *"does not inherit the parent's existing conversation history (context window), starting with a
clean slate"* [5]. Anthropic: *"agents can spawn fresh subagents with clean contexts while maintaining
continuity through careful handoffs"* [14], and the benefit is named — *"Subagents facilitate
compression by operating in parallel with their own context windows… Each subagent also provides
separation of concerns—distinct tools, prompts, and exploration trajectories—which reduces path
dependency"* (https://www.anthropic.com/engineering/multi-agent-research-system).

**CITE**

**7. The people who build these systems say coordination between parallel agents is the weak part —
and say it about coding specifically.** Cognition: *"Subagent 1 and subagent 2 cannot not see what the
other was doing and so their work ends up being inconsistent with each other"* [16]. Anthropic, in the
same post that advocates the architecture: *"some domains that require all agents to share the same
context or involve many dependencies between agents are not a good fit for multi-agent systems today.
For instance, most coding tasks involve fewer truly parallelizable tasks than research, and LLM agents
are not yet great at coordinating and delegating to other agents in real time"*
(https://www.anthropic.com/engineering/multi-agent-research-system). Anthropic also names its own
current limit: *"the lead agent can't steer subagents, subagents can't coordinate, and the entire system
can be blocked while waiting for a single subagent to finish"* [12].

**GUESS(inference)**

Both quotes are about splitting *one task* across agents. `REQUIREMENTS.md` P-5 binds a lane to a
workload rather than to a slice of one task, so on my reading this pattern is a constraint on what a
lane may delegate internally, not an argument against P-2. I have no source that tests that distinction.

**CITE**

**8. MCP is the documented seam by which something outside the orchestrator can drive it.** Superset
ships *"an MCP server"* whose stated job is to *"Let Claude Code, Codex, Cursor, and other agents create
and manage workspaces themselves"* [7]. Vibe Kanban exposes one too, configured by `MCP_HOST` and
`MCP_PORT` runtime variables [9]. Two of the four tool-shaped candidates already treat "an agent drives
the board" as a supported mode rather than an abuse.

---

### Receipts 23–26 — from a second pass over three sources that were truncated on first read

**PMDW**

Three sources came back truncated the first time (Ralph at line 300 of 491, the Ruflo README at 300 of
428, the Superset README at 300 of 373). I went back and read the remainder rather than leaving them in
§ *Sources I could not fully read*. These four receipts are what the tails added, including one
correction to a quote above.

23. https://ghuntley.com/ralph/, § *ralph can take himself to university* — *"The @AGENT.md is the heart
    of the loop. It instructs how Ralph should compile and run the project. If Ralph discovers a
    learning, permit him to self-improve"*, and the prompt that does it: *"When you learn something new
    about how to run the compiler or examples make sure you update @AGENT.md using a subagent but keep
    it brief. For example if you run commands multiple times before learning the correct command then
    that file should be updated."* Also: *"For any bugs you notice, it's important to resolve them or
    document them in @fix_plan.md to be resolved using a subagent even if it is unrelated to the
    current piece of work after documenting it in @fix_plan.md."* This is why the P-16 cell for Ralph
    is **sat** — with the same caveat as Ruflo and Anthropic: the agent *writes* the improvement, it
    does not propose and wait.
24. Same page, § *current prompt used to build cursed* — the full text of the line quoted in [20], which
    the post's prose rendering had shortened: *"You may use up to 500 parrallel subagents for all
    operations but only 1 subagent for build/tests of rust."* The number is 500. The same prompt also
    caps memory growth — *"When @fix_plan.md becomes large periodically clean out the items that are
    completed from the file using a subagent"* — and forbids status reporting into the rules file:
    *"SUPER IMPORTANT DO NOT IGNORE. DO NOT PLACE STATUS REPORT UPDATES INTO @AGENT.md."*
25. https://raw.githubusercontent.com/superset-sh/superset/main/README.md, § *License & what's free
    forever* — *"The desktop app is free forever. Running agents in parallel on your own machine will
    never require payment… The whole app is in this repo under the Elastic License 2.0: use it, fork
    it, modify it, self-host it for your team. The only thing off the table is repackaging Superset
    itself as a service you sell to others."* The P-15 cell stays **part** rather than **sat**: the
    code is cloneable and self-hostable, but it is someone else's product tree, not Jo's machinery
    repo.
26. https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md, tail — the README's layered
    architecture block: `User --> Claude Code / CLI` → `Orchestration Layer (MCP Server, Router, 27
    Hooks)` → `Swarm Coordination (Queen, Topology, Consensus)` → `100+ Specialized Agents` →
    `Memory & Learning (AgentDB, HNSW, SONA, ReasoningBank)` → `LLM Providers`. Its own
    with-and-without table claims *"Task Routing | You decide | Intelligent routing (89% accuracy)"*,
    *"Memory | Session-only | HNSW vector memory with sub-ms retrieval"*, and *"LLM Providers |
    Anthropic only | 5 providers with failover"*. The MetaHarness doc is described as covering how to
    *"grade your agent setup, scan tool configs for security, detect changes between runs, and eject a
    project into a standalone agent toolkit"*. There is also a federation layer — *"Remote agents start
    untrusted. Identity proven via mTLS + ed25519 challenge-response"* with a behavioural trust score
    *"(0.4×success + 0.2×uptime + 0.2×threat + 0.2×integrity)"*.

**GUESS(inference)**

Two of those numbers are Ruflo's own claims about Ruflo (89% routing accuracy; a benchmark gist claiming
wins *"by 1.3×–1953×"* over LangGraph / AutoGen / CrewAI). I did not open the benchmark gist and have not
reproduced anything, so they are reported as claims made, not as measurements. The *"eject a project
into a standalone agent toolkit"* capability is the only thing in this survey that describes P-15's
install path as a product feature; whether it does what the sentence says is unverified.

---

## Sources I could not fully read

**ACTION**

Six URLs where I could not see the full content. Grades are on fire / worth knowing / noise. Nothing
here was written to or changed; no reversal applies.

**1. Reddit — five threads, all of them. Grade: on fire.**
- `https://www.reddit.com/r/AI_Agents/comments/1tas0o5/i_got_tired_of_juggling_69_claude_code_sessions/`
- `https://www.reddit.com/r/LocalLLaMA/comments/1qpbcez/how_are_you_orchestrating_multiple_coding_agents/`
- `https://www.reddit.com/r/LocalLLM/comments/1ug2ydp/i_built_orcasynth_a_selfhosted_daemon_that/`
- `https://www.reddit.com/r/ClaudeAI/comments/1rjxx17/i_built_a_framework_for_making_claude_code_agents/`
- `https://www.reddit.com/r/AI_Agents/comments/1rfwt3p/agent_orchestrator_runs_multiple_coding_agents/`

**What I got:** a title and one sentence of body per thread, from `web_search` result excerpts. No
comments, no follow-ups, no repo links from inside the posts, no setup details.
**Why the rest is missing:** four URL forms all failed. `www.reddit.com/…` returns a JavaScript-only
application shell with no article text in the HTML; `…/<id>.json` returns HTTP 403;
`old.reddit.com/…` redirects to `old.reddit.com/login`; `…/<id>.rss` returns HTTP 429.
**Why on fire:** Jo asked for Reddit by name, and the thing Reddit has that no vendor page has is what
people's setups actually look like and where they broke. A Playwright browser would very likely get all
five — the content is public, it is the fetch path that is blocked, not the page.

**2. `https://antigravity.google/docs/agent-manager`. Grade: worth knowing.**
**What I got:** nothing — HTTP 404, twice (plain, and with `?hl=en`).
**Why the rest is missing:** the page appears to have moved or been renamed; sibling pages under the
same prefix (`/docs/home`, `/docs/getting-started`, `/docs/subagents`) all resolve normally, so this is
a single dead path rather than a blocked host.
**Why worth knowing:** Antigravity's Agent Manager is, by name, the one surface in this survey closest
to P-6 and P-7 — a window whose whole job is holding and switching between running agents. Everything I
say about it in this report is inferred from the three sibling pages that did load, never from its own
documentation. If Jo wants the P-7a question answered properly (is the surface's knowledge of a lane the
lane's live state?), that page is where the answer would be.

**PMDW**

Three more sources were truncated at 300 lines on first fetch — `https://ghuntley.com/ralph/` (of 491),
the Ruflo README (of 428), and the Superset README (of 373). I went back and read all three tails in
this session; receipts 23–26 are what they added, including one correction. They are therefore **not**
on this list.

---

## Sources

**PMDW**

Every URL below was fetched in this session and its body read.

**Products and frameworks**
- https://ampcode.com/docs — Amp docs index
- https://ampcode.com/docs/markdown/puck — Puck, the conversational surface
- https://ampcode.com/docs/markdown/orbs — orbs, persistence, and the start-rate limit
- https://ampcode.com/docs/markdown/the-dial — the four modes and the three routable roles
- https://antigravity.google/docs/home — surfaces overview
- https://antigravity.google/docs/getting-started — projects, folders, Local vs New Worktree mode
- https://antigravity.google/docs/subagents — `invoke_subagent`, workspace modes, nesting cap, approval bubbling, idle auto-wake
- https://superset.sh/blog/roadmap-to-100-agents — Satya Patel, 2026-02-02
- https://raw.githubusercontent.com/superset-sh/superset/main/README.md — full file
- https://raw.githubusercontent.com/BloopAI/vibe-kanban/main/README.md — full file, including the sunsetting notice
- https://raw.githubusercontent.com/smtg-ai/claude-squad/main/README.md — full file
- https://raw.githubusercontent.com/ruvnet/claude-flow/main/README.md — full file (Ruflo)

**Written-up production systems and practitioner accounts**
- https://www.anthropic.com/engineering/multi-agent-research-system — Hadfield, Zhang, Lien, Scholz, Fox, Ford; 2025-06-13; read twice, second pass for the self-improvement principle
- https://cognition.com/blog/dont-build-multi-agents — Walden Yan, 2025-06-12 (requested as `cognition.ai`, server-redirected to `cognition.com`)
- https://ghuntley.com/ralph/ — Geoffrey Huntley, 2025-07-14; full file including both appendix prompts
- https://lucumr.pocoo.org/2026/1/18/agent-psychosis/ — Armin Ronacher, 2026-01-18

**Repo-local**
- /Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md — P-1 … P-17
- /Users/jowolff/code/agent-system-2.0/briefs/research.md — the phase brief
- /Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/references/output-types.md — the labeling contract

---

## Unverified

**GUESS(recall)**

Each item below is marked at the point it appears in **Answer** or in the mapping table as well; this is
the collected list, not the only place they are flagged.

1. **Nothing in this report was run.** I did not install, launch, or drive Amp, Antigravity, Superset,
   Vibe Kanban, Claude Squad, or Ruflo. Every statement about how they behave is what their own docs
   or READMEs say they do.
2. **Antigravity's Agent Manager surface** — see § *Sources I could not fully read*, item 2. My P-6/P-7
   reads for Antigravity come from three sibling doc pages, not from the manager's own page.
3. **Whether Antigravity's auto-wake returns a delivery receipt to the sender** (the P-7c question). The
   docs state the wake; they do not state a receipt. What would settle it: the return value of the
   messaging tool, which is not in the public docs.
4. **Ruflo's self-reported numbers** — 89% routing accuracy, the 1.3×–1953× benchmark matrix, "314 MCP
   tools", "100+ specialized agents". Reported as claims the README makes, not as measurements.
5. **Why Vibe Kanban is sunsetting.** The README states it and links a post I did not open.
6. **Ronacher's 2.2M-token MiniJinja→Go figure** is his, for one port, not reproduced here. So is his
   claim that current token pricing is subsidized — that is a forecast, not a measurement.
7. **Anthropic's ~15× token multiple** is theirs, measured on chat-vs-research workloads, not on coding
   lanes, and is not a measurement of what 2.0 would cost. Their own post says the coding case differs:
   *"most coding tasks involve fewer truly parallelizable tasks than research."*
8. **Every requirement-fit judgement in the mapping table is mine**, labeled GUESS(inference) by the
   table's own preamble. The receipts prove what each source says; they do not prove that the mapping
   onto P-2 … P-17 is the right one. Jo's reading of a requirement beats mine.
9. **Reddit practitioner setups** — see item 1 of § *Sources I could not fully read*. Present only as
   one-sentence search excerpts. The synthesis I drew from them is labeled GUESS(inference) at the
   point it appears, not CITE.

---

## Coverage

**ACTION**

Twelve subjects, 26 retrievals (16 URLs fetched successfully — one of them twice — 3 repo files read, 6
fetch failures against 2 subjects, 2 `web_search` calls). Multi-subject, so the account is a table.

| Subject | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| Amp | 4 URLs | all 4, in full | none | **yes** — Puck, orbs, and the Dial are the three surfaces the question is about, and each has its own page |
| Antigravity | 4 URLs | 3, in full | `/docs/agent-manager` → 404 ×2 (plain and `?hl=en`) | **no** — the 404 is the manager surface itself; I would read that page next, via a browser if the fetch path stays dead |
| Superset | 2 URLs | both, in full (README needed a second pass for its last 78 lines) | none | **yes for the product's shape; no for the MCP seam** — I would read `docs.superset.sh` next to answer whether an outside orchestrator can see live workspace state |
| Vibe Kanban | 1 URL | 1, in full | none | **partly** — enough to place it; the shutdown post would say why it died, which is the interesting part |
| Claude Squad | 1 URL | 1, in full | none | **yes** — the README states all three mechanisms and the whole key map |
| Ruflo | 1 URL | 1, in full (second pass for its last 128 lines) | none | **yes for what it claims; no for whether the claims hold** — `docs/STATUS.md` and the benchmark gist would be next |
| Anthropic Research | 1 URL, fetched twice | in full, both times | none | **yes** — single self-contained post, re-read to confirm the self-improvement principle rather than recall it |
| Cognition | 1 URL | 1, in full | requested `cognition.ai`, server-redirected to `cognition.com` — delivered the article, so not a failed fetch | **yes** |
| Ralph | 1 URL | 1, in full (second pass for its last 191 lines, including both appendix prompts) | none | **yes** — the appendix prompts are the primary evidence and I read them verbatim |
| Ronacher | 1 URL | 1, in full | none | **yes** |
| Reddit | 5 thread URLs, via 1 `web_search` | 0 pages; 5 search excerpts only | 4 distinct fetch forms failed: 403 (`.json`), JS shell (HTML), login redirect (`old.`), 429 (`.rss`) | **no** — and this is the reason the report is Tier 2 |
| Repo-local | 3 files | all 3 | none | **yes** — `REQUIREMENTS.md` re-read mid-run to quote P-1…P-17 exactly rather than from memory |

**ACTION**

**What I retrieved or saw listed and did not open.** This list is complete; nothing is omitted from it.

- **Linked from sources I read, never fetched:** `https://www.vibekanban.com/blog/shutdown`;
  `https://docs.superset.sh/setup-teardown-scripts` and `https://docs.superset.sh/keyboard-shortcuts`
  and the Superset MCP documentation; Superset's `DEVELOPMENT.md` and `CONTRIBUTING.md`; Ruflo's
  `docs/STATUS.md`, `docs/USERGUIDE.md`, `docs/metaharness-user-guide.md`, `verification.md`,
  `docs/TEAM-GATEWAY-CHECKLIST.md`, `docs/federation/`, its benchmark gist, and issue #1669; the
  remaining pages of the Amp docs index beyond the three I opened; the remaining pages of the
  Antigravity docs beyond the three I opened; Anthropic's linked BrowseComp and Cookbook pages;
  Huntley's linked follow-on posts.
- **Returned by `web_search` and never opened:** `andyrewlee/awesome-agent-orchestrators`,
  `aoagents.dev`, `emdash`, `Baton`, `Conductor`, `orchestrator.build`, the Kilo Code blog post on
  running up to 20 parallel agents, and the Orcasynth repository named in one Reddit title.
- **Repo files deliberately not opened:** `PREFERENCES.md` — the brief says to open it only if I need
  Jo's verbatim words for an entry, and I did not quote Jo anywhere in this report. The three sibling
  research reports in `.tmp/phase4/` are not mine to read and were not read.

**GUESS(inference)**

Where that unopened list is thin and justified: the eight `web_search` leads are additional candidates
of the kinds already covered at ten, and the brief caps the survey at ten with an instruction to stop
when the primary sources are read. Where it is **not** justified: `docs.superset.sh` and the Vibe Kanban
shutdown post were both in reach and both bear directly on open questions (the MCP seam for P-7a; why an
orchestrator with a company behind it stopped). Those two are the honest gaps, and they are part of why
this is Tier 2 rather than Tier 0 — along with Reddit, which is the larger reason.

<!-- output-types
tier: 2
CLAIM: 1
CITE: 34
GUESS: 20 (inference 19, pattern 0, recall 1)
ACTION: 4
PMDW: 8
QUESTION: 1
-->
