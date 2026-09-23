# Research B — Addy Osmani on running many coding agents, and "owning the outer loop"

Phase 4 research hand for the agent-system 2.0 redesign. Prepared 2026-09-22.

## Question

What does Addy Osmani mean by "owning the outer loop", in his own words, and what does the rest
of his writing on orchestrating many coding agents prescribe that bears on `REQUIREMENTS.md`
P-1..P-16?

## Answer

### Bottom line first

**CITE**
The phrase is Osmani's own and it has a title post: *Own the Outer Loop*, published 2026-07-15
at `https://addyosmani.com/blog/own-the-outer-loop/`, described in its own metadata as "A written
version of my AI Engineer World's Fair 2026 closing keynote". The one-sentence definition he
gives is a split of a loop into two halves with different owners:

> "Before, our agents were doing the inner loop of the execution loop. Now they run the inner
> execution loop. **Engineers own the outer loop.**"

**CITE**
And the thesis sentence, from the same post's opening paragraph:

> "In the past year, the conversation around **agentic engineering** has moved to **harnesses**
> and **loops**, **fleets** and **software factories**. My 2c is engineers need to **own the
> outer loop** - the **accountability** for these systems."

**CITE**
So "the outer loop" is not a scheduling or orchestration layer. In Osmani's text it is named as
**accountability**, and he decomposes it into three terms, quoted verbatim from
`https://addyosmani.com/blog/own-the-outer-loop/`:

> "And so I want to talk about three terms. The first, **Quality**, refers to all the checks we
> install before we let the system loose. Those checks produce evidence, and from that evidence
> we derive a Verdict.
>
> The second, **Verdict**, refers to the final decision we make before work enters our dependent
> system: I'm the line-producer of this content. […] The model may write the line, but the
> Verdict is mine. The work of my team will not enter our dependent systems without my decision.
> A Verdict is the production decision: should we ship, block, redirect, narrow the response, add
> a guardrail, or reject outright?
>
> The third, **Answerability**, refers to the guarantee that if someone asks, I can explain why."

**CITE**
He also gives the inside/outside split as a capability/agency pair, same post:

> "Inside the system, there's really just one kind of thing our agents are doing: capability. The
> capability to investigate tasks, implement plans, test their results, and report back. […]
> **Outside the system, there's a single kind of thing: agency. The agency to decide, verify,
> approve, and own.**"

**CITE**
And the boundary between the two halves is specifically *evidence*, not a status report:

> "And at the heart of that factory is a careful boundary between what's inside the system and
> what's outside it. Inside the system: we collect inputs […]. The agent loop investigates the
> task, implements a plan, and verifies the result. Then, evidence crosses that boundary. A
> human, who owns the dependent system, sees the evidence and decides whether to proceed."

**CITE**
The human is explicitly removed from the *inner* loop and placed in four named outer loops:

> "**Trusting our systems doesn't mean we don't want a human in the loop.** It just means that
> the human doesn't need to be in the inner loop. **We want them in the constraints loop** (what
> inputs, architectures, instructions, or invariants should we set?), **the sampling loop** (how
> much output should we sample and review?), **the audit loop** (what evidence should we keep and
> how do we make sure our audit log is effective?), **and the ownership loop** (what part of the
> production boundary should we own)."

**CITE**
And his closing operating model, from the same post's "New Work is Real Work" section:

> "There's inner and outer loops. The inner loop is where the work is done. Loops are designed to
> be as independent as possible. **Put all quality assurances and verification inside the loop.
> Once you've designed and validated the loop itself, the only thing you have left to do is to
> grant autonomy by putting in place a back-pressure mechanism that acts to control the rate at
> which the loop is run and its scope of operation. And put humans in their rightful place, on
> the right decisions.**"

**CITE**
Two further definitions from the same post that the requirements mapping below leans on. His
definition of an agent and of a loop:

> "our agent (which I define as a model plus a harness of files, tools, memory, skills, sandboxes,
> permissions, observability, and recovery) is what runs our loop (which I define as
> investigation, implementation, verification, and repeat). And it's what creates our software
> factory."

and his definition of quality as back-pressure, which is where the autonomy ceiling lives:

> "Quality is the concept of back pressure. We mean it literally. **We don't want to grant our
> agents as much autonomy as they can possibly exercise.** We want to grant them just enough
> autonomy that we have enough back pressure to stop them, regulate them, check their work, and
> ensure our humanity."

**CITE**
His "high agency" ladder, which is the shape of what the human does in the outer loop:

> "In a typical agentic workflow, **high agency is the art of knowing when to delegate, when to
> inspect, when to stop, and when to own the result of a process**. The ladder of agency runs from
> low to high: flag a potential problem, investigate it, execute against it, diagnose it, propose
> solutions, recommend fixes, and resolve the issue. A high rung on the agency ladder is
> discernment: found it, it's not worth fixing, moving on."

**CITE**
And the accountability contract he proposes every codebase carry:

> "Every codebase should perhaps come with some kind of accountability contract that explicitly
> states the checklist that was understood when the change was accepted, the evidence that went
> into the decision, who was accountable for the change, and the system status after the change
> was blocked."

### Does he use the phrase differently anywhere else?

**CITE**
`https://addyosmani.com/blog/own-the-outer-loop/` is the only source, of the eight Osmani blog
posts plus one repo README fetched in full this session, in which the strings "outer loop" or
"inner loop" appear at all. The other eight — *Practical Loop Engineering* (2026-08-14), *The
Orchestration Tax* (2026-05-24), *Long-running Agents* (2026-04-28), *Agent Harness Engineering*
(2026-04-19), *Your parallel Agent limit* (2026-04-07), *The Code Agent Orchestra* (2026-03-26),
*The Factory Model* (2026-02-25), *Self-Improving Coding Agents* (2026-01-31), and the
`addyosmani/agent-skills` README — use "loop" heavily but never the inner/outer split. They say
"loop engineering", "the Ralph loop", "agent loop", "feedback loops", "creative loop", "the
factory".

**GUESS(inference)**
So within the corpus fetched this session the phrase has a single meaning and a single home, and
no competing definition to reconcile. What would settle it more firmly: a full-text search of
addyosmani.com (the site exposes no search endpoint I could call), his Substack archive at
`addyo.substack.com`, and the AI Engineer World's Fair keynote video transcript at
`https://www.youtube.com/embed/n97BCfyFIvw` — none of which I could read (see § Sources I could
not fully read).

### The word "loop" carries a second, unrelated meaning in his writing

**CITE**
In *Practical Loop Engineering* (`https://addyosmani.com/blog/practical-loop-engineering/`,
2026-08-14) "loop" is a Claude Code primitive, not the inner/outer distinction. His definition:

> "A loop is an autonomous, self-correcting feedback cycle where an AI agent repeatedly acts,
> tests its results and adjusts its approach until a specific goal is met"

and the two primitives:

> "In Claude Code you have a **goal primitive**, which can drive a single bounded task forward
> until you've got a particular goal, like a measurable finish line that's been met. And then
> **loop** reruns on a timer or a fixed interval, so you can use it to kind of schedule changes."

**GUESS(inference)**
Reading "own the outer loop" as being about the `/loop` primitive would be a misreading — the
keynote post never mentions `/goal` or `/loop`, and the primitives post never mentions
accountability, verdict, or answerability. They are two separate ideas sharing a word. What would
settle it: the keynote transcript, same gap as above.

---

## Answer, part 2 — the rest of Osmani on running many agents

**PMDW**
Eight of his posts were fetched in full this session, plus his `agent-skills` repo README. What
follows is only what he actually wrote in them, grouped by the thing it bears on. Every block is
a quote with the URL attached.

### He caps the number of concurrent agents, and the cap is low

**CITE**
`https://addyosmani.com/blog/practical-loop-engineering/`, his own daily practice:

> "The way that I typically work is I have anywhere between five and ten agents working at the
> same time in parallel."

and later in the same post:

> "For me, I use probably between five and ten agents every day. Very typically I'll max out at
> about five concurrently."

**CITE**
`https://addyosmani.com/blog/cognitive-parallel-agents/` gives a lower working number and a reason:

> "I've accepted that three focused, well-reviewed threads produce more usable output than six
> threads I'm half-supervising. Throughput looks better with six. Code I'm willing to actually
> merge without a second pass looks better with three. My ceiling for a typical session is
> somewhere around three to four threads depending on complexity."

**CITE**
And a rule for which lever to pull first, same post:

> "And try scope reduction before count reduction. Often the lever isn't 'run fewer agents' -
> it's 'give each agent a tighter task.' Tighter scope per thread reduces the mental overhead
> each thread carries, which effectively raises how many you can run while staying genuinely on
> top of the work."

**CITE**
Same post, on what makes a thread self-contained enough to step away from:

> "It shifts with how well you specced the work upfront. A vague brief creates mid-flight ambiguity
> that pulls you back into the thread repeatedly. A crisp brief with clear acceptance criteria
> makes the thread more self-contained. Writing a proper brief before spawning isn't overhead -
> it's what lets you actually step away."

### The orchestration tax: the human is a single-threaded resource

**CITE**
`https://addyosmani.com/blog/orchestration-tax/`, the definition in his own standfirst:

> "Starting more agents is easy now. However, more agents running doesn't mean more of you
> available - your cognitive bandwidth doesn't parallelize. All the judgement to actually steer
> them and merge the code they write into the codebase still has to route through exactly one
> serial processor which is just you. Orchestration tax is basically the price you pay for
> forgetting this and the only real fix is to start architecting your own attention like you
> architect any concurrent system."

**CITE**
The concrete prescriptions from the same post, quoted as its own bolded list items:

> "**Scale fleet to review rate, not the UI.** A good concurrent system uses backpressure so the
> queue doesn't grow infinitely. The producer slows down to match the consumer. Your agent count
> is the producer and your review rate is the consumer. The right number of paralell agents is
> how many you can actually code review properly. For most of us this is a low single digit. The
> AI tool will happily let you spawn 20 but that is just a UI feature."
>
> "**Sort the work.** […] I keep two piles of tasks. One is isolated work that I'm happy to
> delegate to background agents running in the Cloud. These can run async and often just need me
> at the final gate. The other pile is complex tasks where the judgement *is* the work."
>
> "**Batch your reviews.** Context switching cost you heavily everytime you do it. Reviewing 4
> agents at the same time in one sitting is much cheaper than checking one, leaving to do
> something else and returning cold. Give agents a long leash. Let the work pile up a bit and
> process the batch."
>
> "**Only spend the lock on judgement.** Dont waste your brain on things the machine can verify
> itself. Make the agent write a passing test or generate a screenshot. They can prove the boring
> 80% themselves so you only spend your scarce attention on the 20% that genuinely needs a human."
>
> "**Protect your serial time.** The bottleneck needs your best hours, not the leftover minutes
> between agent check-ins."

**CITE**
And the failure mode he names, same post:

> "This is really important because the failure mode is invisible to you. Twenty running agents
> gives you this feeling of massive productivity. The dashboard is full and everything moves. But
> that feeling is decoupled from actually shipping good code to `main`."

### Maker and checker: the agent that did the work never grades it

**CITE**
`https://addyosmani.com/blog/practical-loop-engineering/`:

> "The other habit that matters here is not letting the agent that did the work decide the work
> is good. One sub-agent drafts the change. A separate one verifies it."

**CITE**
And the distinction he draws between that checker and a mechanical goal evaluator, same post:

> "The evaluator sitting behind goal is not that checker, by the way. It doesn't look at the
> content to see if it's good or bad in any way, shape, or form. All it does is examine the
> conversation transcript to see if the hard rules you specified have been met."

**CITE**
`https://addyosmani.com/blog/agent-harness-engineering/` gives the reason:

> "Anthropic's long-running harness work is explicit that separating generation from evaluation
> into distinct agents outperforms self-evaluation, because agents reliably skew positive when
> grading their own work."

**CITE**
And his own near-miss, in his own words, `https://addyosmani.com/blog/practical-loop-engineering/`:

> "And I almost pushed some of those changes. But I didn't actually look at them closely enough.
> I read through its research, but I didn't look at the implementations closely enough. So I
> delegated the task, but I was close to delegating the judgment as well. […] you need to
> sometimes check yourself, that you are not delegating the taste and the judgment to your agent.
> You're delegating the task, and then you are actually checking back that it's meeting your bar."

### Quality gates, hooks, and "success is silent"

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/` names three gates:

> "Three quality gates make agent output trustworthy: plan approval catches bad architecture
> before code exists, hooks enforce automated checks on every lifecycle event, and AGENTS.md
> compounds learning across sessions."

and on plan approval:

> "Require teammates to write a plan before they start coding. The lead reviews the approach and
> approves or rejects. It's far cheaper to fix a bad plan than to fix bad code."

**CITE**
`https://addyosmani.com/blog/agent-harness-engineering/` on what a hook is for, and on the signal
policy:

> "Hooks are what separate 'I told the agent to do X' from 'the system enforces X.' A hook is a
> script that runs at a specific lifecycle point: before a tool call, after a file edit, before
> commit, on session start. They're the right place for things the agent should never forget but
> often does."
>
> "The principle HumanLayer highlights and I've come to agree with is: **success is silent,
> failures are verbose.** If typecheck passes, the agent hears nothing. If it fails, the error
> text gets injected into the loop and the agent self-corrects. That makes the feedback loop
> almost free in the common case and directly actionable when something goes wrong."

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/` on the loop guardrail:

> "Every teammate gets a hard `MAX_ITERATIONS=8`. Before each retry, force a reflection prompt:
> 'What failed? What specific change would fix it? Am I repeating the same approach?' This single
> change substantially cuts stuck agents."

### The rulebook is earned, short, and human-written

**CITE**
`https://addyosmani.com/blog/agent-harness-engineering/`:

> "Keep it short. HumanLayer keeps theirs under 60 lines. Every line is competing for attention,
> and more rules make each rule matter less. **Pilot's checklist, not style guide.**"
>
> "Earn each line. Rules should trace to a specific past failure or a hard external constraint.
> If they don't, they're noise. Ratchet; don't brainstorm."
>
> "You only add constraints when you've seen a real failure. You only remove them when a capable
> model has made them redundant. **Every line in a good `AGENTS.md` should be traceable back to a
> specific thing that went wrong.**"

**CITE**
Same post, on why a harness is not downloadable:

> "This is also why harness engineering is a discipline rather than a framework. The right harness
> for your codebase is shaped by your failure history. You can't download it."

**CITE**
Same post, on the harness not shrinking as models improve, quoting Anthropic:

> "'every component in a harness encodes an assumption about what the model can't do on its own.'
> When the model gets better at something, that component becomes load-bearing for nothing and
> should come out. When the model unlocks something new, new scaffolding is needed to reach the
> new ceiling."

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/` adds a measured reason not to let an agent
write the rulebook:

> "[Research has shown] (Gloaguen et al., ETH Zurich) that LLM-generated AGENTS.md files offer no
> benefit and can marginally reduce success rates (~3% on average) while increasing inference
> costs by over 20%. Developer-written context files, by contrast, provide a modest ~4%
> improvement. Never let an agent write to `AGENTS.md` directly. The lead must approve every line."

**GUESS(inference)**
The ~3% / ~20% / ~4% figures are Osmani's restatement of a third-party paper; I fetched his page,
not the ETH Zurich paper, so what I have a receipt for is that *he says this*, not that the study
found it. What would settle it: fetching Gloaguen et al. directly — he gives no DOI or arXiv link
on the page, only a link back to his own `/blog/agents-md/`, which I did not open.

### Self-improvement as a proposal a human merges

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/`, under "Making agents smarter over time":

> "**Self-Reflection with REFLECTION.md proposals.** After every task, force the agent to write a
> REFLECTION.md: what surprised me, one pattern to add to AGENTS.md, one prompt improvement. The
> lead reviews and merges approved learnings. This is how compound learning actually compounds -
> systematically, not ad hoc."

**CITE**
`https://addyosmani.com/blog/agent-harness-engineering/` states the same ratchet as the core habit:

> "The most important habit in harness engineering is treating agent mistakes as permanent signals.
> Not one-off stories to laugh about, not 'bad runs' to retry. Signals."

and gives his own worked example of one mistake becoming three artifacts:

> "If the agent ships a PR with a commented-out test and I merge it by accident, that's an input.
> The next version of my `AGENTS.md` says 'never comment out tests; delete them or fix them.' The
> next version of my pre-commit hook greps for `.skip(` and `xit(` in the diff. The next version
> of my reviewer subagent flags commented-out tests as a blocker."

**CITE**
And the open problem he flags for the coming year,
`https://addyosmani.com/blog/long-running-agents/`:

> "The harder problems for the next year aren't in any of those layers individually. They're in
> the coordination above them. Many long-running agents on a shared codebase. Agents that read
> their own traces and patch their own harnesses."

### Memory: four channels, plus a decision-provenance pattern

**CITE**
`https://addyosmani.com/blog/self-improving-agents/` names the four channels:

> "Carson's Ralph loop implementation uses at least four channels of memory between runs: **Git
> Commit History** […] **Progress Log (progress.txt)** […] **Task State (prd.json or tasks list)**
> […] **Agents' Knowledge (AGENTS.md):** As discussed, this is the long-term semantic memory - the
> accumulated wisdom of past runs."

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/` names a stronger one, and it is the only
pattern in the corpus that carries *decisions with provenance* rather than work notes:

> "**Beads / Persistent Memory.** Gastown's 'beads' pattern: immutable, git-backed records of
> every decision and outcome with full provenance. Agents query past beads through task graphs and
> a SQL-addressable data plane - not traditional vector-based RAG, but structured, queryable
> institutional memory that goes far beyond a flat markdown file."

**CITE**
`https://addyosmani.com/blog/long-running-agents/` on the session log as the recoverability
mechanism:

> "*Invest in the session log, not just the prompt.* The append-only event log is what makes the
> agent recoverable, debuggable, and auditable. If you can't reconstruct what the agent did in the
> last 24 hours from durable storage, what you have is a long-running shell script that happens to
> call an LLM, not a long-running agent."

**CITE**
And two cautions from `https://addyosmani.com/blog/self-improving-agents/`:

> "Be mindful of context size. As your knowledge file grows, you may not always want to inject all
> of it for every single task (context bloat can reduce performance or cause the model to ignore
> instructions)."
>
> "**Tip:** Whatever persistence you use, periodically **verify that the agent is actually
> utilizing it.** A memory file only helps if it's injected into the prompt in future runs."

**CITE**
Same post, on sharing memory across agents — the closest he comes to a cross-lane store:

> "Finally, consider sharing AGENTS.md knowledge across agents or runs. If you run multiple loops
> (for different projects or parallel tasks), you could centralize some common knowledge. […] even
> a shared wiki or set of markdown files that all your agent sessions reference can ensure
> consistency if you have multiple autonomous agents working in tandem."

### Spend: routing by work kind, and hard per-agent budgets

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/`:

> "**Multi-model routing.** Not every task needs your most expensive model. Route planning and
> architecture tasks to one of the cheaper Gemini/Claude/OpenAI models. Route implementation to
> Sonnet, Opus or Codex. Route review to a dedicated security model. Create a `MODEL_ROUTING.md`
> file"

with the file's contents given as:

> ```
> Planning       -> Gemini
> Implementation -> Claude Opus or Sonnet
> Review         -> etc.
> Tests          -> etc.
> ```

> "**Token Budgeting and Kill Criteria.** Set hard per-agent budgets: Frontend 180k tokens,
> Backend 280k tokens. At 85% of budget, auto-pause and notify the lead. If stuck 3+ iterations on
> the same error, kill and reassign to a fresh agent."

**CITE**
`https://addyosmani.com/blog/practical-loop-engineering/` quotes the Claude Code team's own
phrasing of routing, in the proactive-loop rung:

> "Managed usage by: routing routines to smaller, faster models and using the most capable model
> for judgment calls."

**CITE**
`https://addyosmani.com/blog/long-running-agents/` names cost as an unsolved limitation:

> "**Cost.** A 24-hour run with a frontier model and a few tools is not cheap. Without budgets,
> circuit breakers, and a hard cap on tool spend, an agent can quietly burn through a week's API
> budget in an afternoon. This is solvable, but it's an explicit step you have to take."

**CITE**
And a role-fit finding he reports from Cursor, same post:

> "Their reported finding is that a GPT model was better than Opus for *extended autonomous work*
> specifically because Opus tended to stop early and take shortcuts. **Same task, different role,
> different model.** The matching is becoming part of the design surface."

### Planning before execution

**CITE**
`https://addyosmani.com/blog/long-running-agents/`, the single-highest-leverage move in his words:

> "*Write down the done-condition before the agent starts.* This is the single highest-leverage
> move for long runs. The Anthropic harness post calls it the feature list; Cursor calls it the
> planner's task spec. Either way, it's an external file with explicit, testable completion
> criteria, and it exists so the agent can't quietly redefine *done* mid-run."

**CITE**
`https://addyosmani.com/blog/factory-model/`:

> "The spec is not a prompt anymore. The spec is the product thinking made explicit."
>
> "If you can orchestrate twenty, thirty, fifty agents running in parallel, the difference between
> mediocre output and exceptional output comes down almost entirely to the quality of your
> specification. At that scale, vague thinking does not just slow you down. It multiplies."

**CITE**
`https://addyosmani.com/blog/coding-agents-manager/` gives the brief's contents explicitly:

> "A practical agent brief covers: the outcome (what should be true when we're done), the context
> (where in the codebase this lives and what patterns exist), the constraints (performance,
> security, API shape, dependency rules, style conventions), the non-goals (what we're explicitly
> not doing), acceptance criteria (concrete checks like tests passing or endpoints behaving a
> certain way), integration notes (which files are off-limits and where seams should be), and a
> verification plan (how we'll know it works)."

**CITE**
`https://addyosmani.com/blog/practical-loop-engineering/` names where planning-style loops do not
belong:

> "Generally speaking if you don't have a clear idea of what the end-state/done/good means for
> your completion, it may not be the right pattern for your work. For example, a vague goal would
> be 'keep going until this UI design is good'. What does that mean? Good to who? How is it being
> evaluated? Tasks that require human taste, subjective design, or open-ended creative exploration
> aren't a good fit."

**CITE**
`https://github.com/addyosmani/agent-skills` (README fetched this session) ships planning as a
command ladder, quoted from the README's command table:

> | Define what to build | `/spec` | Spec before code |
> | Plan how to build it | `/plan` | Small, atomic tasks |
> | Build incrementally | `/build` | One slice at a time |
> | Prove it works | `/test` | Tests are proof |
> | Set the quality bar | `/constraints` | Decide it once, enforce it everywhere |
> | Review before merge | `/review` | Improve code health |
> | Ship to production | `/ship` | Faster is safer |

and describes an opt-in way to remove the human from *between* steps without removing verification:

> "Want fewer manual steps once the spec exists? **`/build auto`** generates the plan and
> implements every task in a single approved pass — you approve the plan once, then it runs
> autonomously. It removes the human stepping *between* tasks, not the verification: every task is
> still test-driven and committed individually, and it pauses on failures or risky steps."

**CITE**
The same README's design choices, which is where the repo carries the outer-loop idea without the
phrase:

> "**Verification is non-negotiable.** Every skill ends with evidence requirements - tests
> passing, build output, runtime data. 'Seems right' is never sufficient."
>
> "**Anti-rationalization.** Every skill includes a table of common excuses agents use to skip
> steps (e.g., 'I'll add tests later') with documented counter-arguments."
>
> "**Progressive disclosure.** The `SKILL.md` is the entry point. Supporting references load only
> when needed, keeping token usage minimal."

**CITE**
The README's own description of the `constraint-driven-development` skill, which is the one that
matches the back-pressure idea most directly:

> "Interviews you for a quality bar with sane default thresholds, writes CONSTRAINTS.md, places
> each check by cost, and catches agents silencing checks or skipping tests to get green" — use
> when "No standards are written down, or an agent is producing more than anyone reads"

**CITE**
The README does not contain the string "outer loop". Its four named personas are `code-reviewer`,
`test-engineer`, `security-auditor`, `web-performance-auditor`, and it carries a
`references/orchestration-patterns.md` described in the README's own table as covering "Endorsed
multi-persona orchestration patterns, anti-patterns, and the 'personas don't invoke personas'
rule". I did not open that reference file (see § Coverage).

### Lanes and isolation

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/`:

> "**One file, one owner:** Never let two agents edit the same file. Conflicts kill velocity."
>
> "**Set WIP limits:** Don't run more agents than you can meaningfully review. 3-5 is the sweet
> spot."
>
> "**Git worktrees for isolation.** Each agent gets its own worktree. No merge conflicts, clean
> integration."

**CITE**
And the hierarchical shape, same post:

> "Instead of your orchestrator spawning six subagents - which fragments its context - spawn two
> feature leads. Each feature lead then spawns its own two or three specialists. The parent
> orchestrator only talks to two agents, keeping its context clean. Feature Lead A gets a brief
> like 'Build the search feature' and decomposes it into Data, Logic, and API subagents on its own.
> The parent never sees those details. […] This mimics how real engineering organizations work. You
> don't have the VP of Engineering assigning tasks to individual engineers. You go through layers
> of tech leads."

**CITE**
Same post, on specialisation as the reason to split at all:

> "**Specialization (focused context)** - Each agent only sees the files it owns. An agent that
> only knows about `db.js` writes better database code than one juggling your entire codebase."

**CITE**
Same post, on peer messaging so the lead is not a relay bottleneck:

> "**Peer messaging** is the other critical piece. The backend agent tells the frontend agent the
> API contract directly: 'GET /search?q= returns [{id,title,url}]'. This doesn't go through the
> lead. When a teammate goes idle, the lead is automatically notified. This peer-to-peer approach
> prevents the lead from becoming a coordination bottleneck."

**CITE**
`https://addyosmani.com/blog/coding-agents-manager/` states the boundary rules as team-coordination
rules:

> "My favorite boundary rules, borrowed from team coordination: one agent owns one PR, no mega-PRs
> from multiple agents. If two agents might touch the same files, redesign the task split. Shared
> interfaces get handled in a first PR (human-led), then agents build on top of that seam."

### The surface

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/`, on Cursor's Glass:

> "Glass is Cursor's new interface that makes agent management the primary surface and the
> traditional editor something you reach for when needed. This mirrors a broader pattern across
> the entire ecosystem: the control plane is becoming the primary experience, and the editor is
> one instrument underneath it."

**CITE**
`https://addyosmani.com/blog/coding-agents-manager/` on the check-in format:

> "If you're running ten parallel sessions, you cannot afford to scroll through each one trying to
> understand what happened. You need lightweight, repeatable check-ins. […] Set a check-in cadence:
> 'If you haven't made significant progress in 15 minutes, stop and report blockers.' Ask for
> status in a predictable format: What changed? What's next? What are the risks or blockers? What
> do you need from me?"

**CITE**
And the two-mode split of where the human sits, same post:

> "The first is **local, high-touch sessions where you stay human-in-the-loop**. These are for
> architecture decisions, tricky refactors, product nuance, ambiguous requirements, and anything
> where taste and judgment dominate. […] The second is **cloud or background sessions that run
> asynchronously**. These are for focused, bounded tasks"

---

## Answer, part 3 — the phrase in his newsletter: two more uses, one meaning plus an operational extension

**PMDW**
After the blog corpus was read, his Substack (*Elevate*, `addyo.substack.com`) was fetched. It
carries the phrase twice more. Both were fetched this session.

### Use two — the Substack post of the same name, published six days earlier

**CITE**
`https://addyo.substack.com/p/own-the-outer-loop`, dated Jul 09, 2026, subtitled "Why loop
engineering needs a human at the boundary". Its body text is the same text as the blog post of
2026-07-15: the same opening thesis ("My 2c is engineers need to **own the outer loop** - the
**accountability** for these systems"), the same Quality / Verdict / Answerability triad, the same
four outer loops (constraints, sampling, audit, ownership), the same closing operating model
("Put all quality assurances and verification inside the loop"), and the same sign-off:

> "That is agentic engineering at the outer loop - that is the work now."

**GUESS(inference)**
So this is the same artifact published on two surfaces six days apart, not a second definition.
The definition does not vary between them. What would settle it beyond doubt: a diff of the two
full texts, which I did not run — I compared the passages that define the term, not every
sentence.

**CITE**
Three items appear in the Substack copy that bear on the requirements and that I did not quote
from the blog copy. First, the three named hidden costs, verbatim headings:

> "**Cognitive surrender ~ blindly accepting what AI gives you.**"
>
> "**Cognitive debt ~ erosion of your understanding and memory of how to solve problems.**"
>
> "And then there's the **orchestration tax ~ its easy to spin up lots of agents now, but your
> cognitive bandwidth doesn't parallelize in the same way.**"

**CITE**
Second, his fixes for the orchestration tax, stated as a four-item prescription:

> "Fixes? Make attention the priority in your architectural decisions. Use worktrees, scopes, and
> evidence to reduce the coupling between your initial plan and the work that emerges from it.
> Time-box the effort to resolve unactionable steps. And make change in your software strictly an
> opt-in permission."

**CITE**
Third, the line that draws the authority boundary:

> "Only people can choose. Only people inherit consequence. Agents can be asked to choose, route,
> merge, and escalate safely inside a policy, but they cannot inherit the consequences."

### Use three — *Software Factories, Light and Dark*, the operational extension

**CITE**
`https://addyo.substack.com/p/software-factories-light-and-dark`, dated Jul 22, 2026, subtitled
"Loops, harnesses, factories and why engineers need to own the outer loop." This is the post where
he defines the three layers as a stack, in bold, each a standalone definition:

> "**A loop is one agent doing a single job on repeat: gather context, take an action, check the
> result, and go again until some condition is met. It is the smallest unit of agentic work, and
> everything above it is just loops stacked on loops.**"
>
> "**A harness is the walls around a loop: the sandbox it runs in, the tools it can reach, the
> memory that survives between runs, and the gates that decide what 'done' means. The loop is the
> behavior; the harness is the environment that behavior runs inside.**"
>
> "**A software factory is many harnessed loops running at once, fed by a queue of work and
> drained through a review gate into production, with humans owning the whole thing from above. It
> is not a bigger agent; it is an org chart made of loops.**"

**CITE**
And the caption under his loop-harness-factory diagram, which is the most compact statement of the
phrase anywhere in the corpus:

> "*Loop → harness → factory. A factory isn't a smarter agent; it's many harnessed loops feeding
> one review gate, with a human owning the outer loop.*"

**CITE**
Here the outer loop is given as a list of four owned acts, and the boundary is again named as
evidence — this is the most operational rendering of the idea in his writing:

> "I think engineers need to increasingly own the [outer loop]. The agents can investigate a bug,
> write up the diagnosis, implement a fix, run the tests, and write up a report. That's the
> execution of the inner loop, and they can do it as efficiently as anyone. But that was never the
> job. The bits you own are what I'd call the outer loop: **decide whether it's the right way to
> address the problem, verify that the diagnosis and implementation are sound, approve the change,
> and carry the consequences of being wrong.** The boundary between the two loops is evidence, the
> diffs, the tests, the logs, and a brief explanation that connects them. Types, seams, and rubrics
> make it possible to oversee all this without doing a lot of work for every change."

**CITE**
And the line that states the human did not leave:

> "Notice that the person never left the factory. They moved."
>
> "you're not down on the line writing changes any more; you're up at the end of the production
> line designing it and guarding the gate."

**GUESS(inference)**
So across the three uses the meaning is stable — the human owns judgment, approval and
consequence at the boundary, and the agents own execution inside it — and the third source adds
the operational parts the first two lack: a named autonomy rule, a rule for which loops may run
unattended, and a control-flow shape. Those three follow.

### The autonomy rule he names: back pressure

**CITE**
`https://addyo.substack.com/p/software-factories-light-and-dark` states it as a definition:

> "**Back pressure is the rule that you can only hand a loop as much autonomy as you can cheaply
> and reliably verify, and not one inch more. Verification, not generation, is the real constraint
> on a factory.**"

**CITE**
And identifies the one box in his pipeline diagram that does not scale:

> "By and large, every box in this diagram is almost zero cost: generation, tests, scanning. They
> all run at scale for negligible cost. There is only one expensive box that proves stubbornly
> resistant to scaling, and that's the review gate. That shiny amber box is 'judgment'"

### The rule for which loops may run unattended

**CITE**
Same post, under the heading "What earns a loop the dark":

> "A loop can earn itself fully automated status only if the check is cheap, runs at high
> frequency, and relies on something that can't be easily faked out. Green-or-red oracles, type
> gates, property tests, and a review agent coupled with a real rubric all fit. You also need the
> oracle to answer immediately and not drift over time. When done can be proven not just by you
> but by a machine, you've reached automation."

**CITE**
And the converse, with a length limit he attributes to Dex Horthy:

> "Short loops are easier to verify than long ones. [Dex's rule of thumb]: an agent holds up for
> three to ten steps, then starts losing the thread past twenty. The reason is context
> accumulation, the more the agent drags along, the more likely it is to wander off."
>
> "A loop needs to be reviewed if a wrong answer is expensive and only a person can catch it.
> Subtle production bugs that can't be caught by tests, large blast radii, and a decision that's
> going to shape the work of a year or more all qualify."

**CITE**
And the failure mode of setting every switch the same way:

> "The danger is forgetting to flip each switch and just setting all of them to the same mode. All
> dark, and you're stuck tearing everything down four months later. All lit, and no one can get
> reviews done in time and you're stuck in a gigantic bottleneck. The hard, skilled job is deciding
> where to put each switch."

### Loops versus graphs — his own words on the shape Jo calls graph engineering

**PMDW**
This passage is in scope here because it is Osmani's, not because it is the subject of a different
hand's report. It is quoted, not summarised, so it can be cross-checked against the other Phase 4
reports.

**CITE**
`https://addyo.substack.com/p/software-factories-light-and-dark`, section "Loops, graphs or state
machines?":

> "When you hand an agent a task, you're probably going to build a graph around it, whether you
> call that graph a finite state machine or a set of conditionally-linked service calls. It's a
> framing where the software isn't just following some abstract rules but a structured workflow:
> **every node is an explicit step, and every edge between nodes is an explicit condition.**"
>
> "So the only real novelty is that an agent insisting on autonomy is really just walking around a
> particular graph, and its freedom is constrained to the inside of a node."

**CITE**
His worked example of the same task as a loop and as a graph:

> "Take a bug to fix. As a pure loop, you sit down and think: figure out what's wrong, change some
> code, run the tests, see what happens, and if that round doesn't kill the run, loop back and
> start again. The whole journey is decided as you go […]. As a graph, the first thing you do is
> map out what should happen. Reproduce the bug or go ask for more information, find the cause,
> try a fix, run the tests, and let a failing run route back to the fix while a passing one goes on
> to review, where only an approval reaches done. The agent is still clever inside each box; it
> just can't wander off the paths you sanctioned."

**CITE**
Why he says the graph is worth the lost freedom, and the disambiguation he attaches to the word:

> "The real appeal of that graph, of course, is that it's back pressure drawn as a diagram. You
> give up some of the agent's freedom and get mandatory checks and legible failure points in
> return, so when a run dies you can point at the node that killed it."
>
> "One clarification, because the term is badly overloaded: when I keep calling this a graph, I
> don't mean a knowledge graph. I mean a predefined directed graph of how the work should flow,
> conditional edges and all, giving the loop a shape you can actually trust."

**CITE**
And the prior art he names for it, in his own sentence:

> "you can see the pattern in LangGraph and LlamaIndex Workflows, in Jerry Liu's hybrid
> workflow-graph-over-agents with an outer loop that grows parts of the graph as it runs, and in
> David Khourshid's reminder that this is really just state machines and the actor model turning
> up in new clothes."

**GUESS(inference)**
Mapping that onto the hypothesis recorded in `REQUIREMENTS.md` § "Not requirements, recorded
alongside" — nodes, edges with branches and loop-backs, shared state — Osmani's passage supplies
the first two explicitly (nodes as explicit steps, edges as explicit conditions, with a failing run
routing back to an earlier node) and does not supply the third: he never names a travelling shared
record in this passage. What would settle the third: the LangGraph or LlamaIndex Workflows docs,
which are not Osmani sources and are not this hand's subject.

---

## What Osmani assumes that Jo has ruled out

**PMDW**
P-14 says fleet-scale patterns are evidence, not targets. These are the places where his text
assumes capacity, infrastructure, or product access that a single person on ordinary
subscriptions does not have.

**CITE**
Managed cloud runtimes are assumed available throughout. `https://addyosmani.com/blog/long-running-agents/`:

> "The platform layer is arriving to match. Google's Agent Platform, Anthropic's Managed Agents
> and Claude Agent SDK, Cursor's cloud agents, and OpenAI's Codex Web all point at the same thing:
> agents as managed infrastructure with observability, checkpointing, and permission systems built
> in, not scripts you babysit."

**CITE**
`https://addyosmani.com/blog/orchestration-tax/` assumes a cloud tier exists for the delegable pile:

> "One is isolated work that I'm happy to delegate to background agents running in the Cloud."

**CITE**
`https://addyosmani.com/blog/practical-loop-engineering/` describes a scheduled cloud routine:

> "You can use the `/schedule` command to set up routines that run in the cloud on Claude's
> infrastructure."

**CITE**
Fleet scale is the explicit frame of `https://addyosmani.com/blog/factory-model/`:

> "If you can orchestrate twenty, thirty, fifty agents running in parallel, the difference between
> mediocre output and exceptional output comes down almost entirely to the quality of your
> specification."

**CITE**
And `https://addyosmani.com/blog/self-improving-agents/` reports overnight fleet operation as the
working practice of someone else:

> "Geoffrey Huntley's 'Ralph' technique […] Carson Gross has described running 10+ of these loops
> every night"

**CITE**
`https://addyosmani.com/blog/code-agent-orchestra/` assumes multi-vendor model access for routing,
and an experimental flag for the team feature it describes:

> "Route planning and architecture tasks to one of the cheaper Gemini/Claude/OpenAI models. Route
> implementation to Sonnet, Opus or Codex. Route review to a dedicated security model."

**GUESS(inference)**
Every item above is an assumption about available capacity or product access, not a claim about
what a single-operator system needs. Under P-14 they are evidence only. What would settle whether
any of them is reachable for Jo: the actual subscription and budget state, which is Jo's to state
and was not part of this brief.

**CITE**
The counter-finding, and it is the larger part of his corpus: his own prescriptions are
attention-first and *lower* the ceiling rather than raise it. `https://addyosmani.com/blog/cognitive-parallel-agents/`:

> "My ceiling for a typical session is somewhere around three to four threads depending on
> complexity."

**CITE**
And `https://addyosmani.com/blog/orchestration-tax/`:

> "The right number of paralell agents is how many you can actually code review properly. For most
> of us this is a low single digit. The AI tool will happily let you spawn 20 but that is just a UI
> feature."

**GUESS(inference)**
So the fleet-scale material and the attention-first material are separable in his writing: the
orchestration tax, the three-to-four-thread ceiling, scope-before-count, batched review, maker and
checker, back pressure, and the outer-loop boundary itself are all stated in terms of one human's
attention and carry no capacity assumption. What would settle it: nothing further — the passages
above are quoted in full from posts fetched this session.

---

## Mapping to REQUIREMENTS.md

**PMDW**
One row per requirement for which the Osmani corpus fetched this session says something. The
receipt column names the URL fetched this session and the phrase to search for on that page. The
final column is my inference about fit and is labeled `GUESS(inference)` in every row without
exception — Osmani has never seen `REQUIREMENTS.md` and makes no claim about it.

| Req | What the source says that bears on it | CITE receipt (fetched this session) | Fit — GUESS(inference) |
|---|---|---|---|
| **P-1** (two workloads, judged on Jo's pain and throughput) | The measure he uses is not system throughput but merge-worthy output: "Throughput looks better with six. Code I'm willing to actually merge without a second pass looks better with three." | `addyosmani.com/blog/cognitive-parallel-agents/` — "willing to actually merge without a second pass" | Supports the framing: the metric he optimises is the operator's usable output, matching P-1's "judged on Jo's pain and throughput, not on its own consistency". No conflict found. |
| **P-2** (lanes first-class, one persistent working context) | Lanes appear in his work as two separate things: isolation ("Each agent gets its own worktree") and specialisation ("Each agent only sees the files it owns"). He also warns that a flat spawn "fragments its context" and prescribes a two-level tree — parent talks to two leads, leads spawn their own specialists. | `addyosmani.com/blog/code-agent-orchestra/` — "Git worktrees for isolation", "Specialization (focused context)", "spawn two feature leads" | Partial. His unit is per-task and disposable, not a persistent context that outlives a task; P-2's "would otherwise be another terminal window" has no equivalent in his text. The two-level tree matches P-2+P-8 (orchestrator talks to lanes, lanes own their hands) closely. |
| **P-4** (every step passes an automated gate **and** Jo's sign-off after real use) | Both halves are stated. Automated: "Put all quality assurances and verification inside the loop"; hooks are "what separate 'I told the agent to do X' from 'the system enforces X.'" Human: the Verdict is "the final decision we make before work enters our dependent system". And `/build auto` "removes the human stepping *between* tasks, not the verification". | `addyosmani.com/blog/own-the-outer-loop/` — "Put all quality assurances"; `addyosmani.com/blog/agent-harness-engineering/` — "the system enforces X"; `github.com/addyosmani/agent-skills` README — "removes the human stepping" | Strong fit, and his gate-plus-sign-off pairing is P-4's structure exactly. The addition his text makes that P-4 does not state: the evidence the sign-off is made *on* is specified — "the diffs, the tests, the logs, and a brief explanation that connects them". |
| **P-5** (lane bound to a workload, not a repo) | Nothing found. His splits are by file ownership and by feature ("Feature Lead A gets a brief like 'Build the search feature'"), inside one codebase. Cross-repo lanes are absent from the fetched corpus. | `addyosmani.com/blog/code-agent-orchestra/` — "One file, one owner" | No bearing. Not evidence against P-5; the question is simply not addressed. |
| **P-6** (one window by default, routes and relays) | He reports the surface moving to the control plane: "Glass is Cursor's new interface that makes agent management the primary surface and the traditional editor something you reach for when needed… the control plane is becoming the primary experience, and the editor is one instrument underneath it." Plus the relay format: "Ask for status in a predictable format: What changed? What's next? What are the risks or blockers? What do you need from me?" | `addyosmani.com/blog/code-agent-orchestra/` — "the control plane is becoming the primary experience"; `addyosmani.com/blog/coding-agents-manager/` — "in a predictable format" | Strong fit on the shape, and the check-in format is a concrete candidate for what P-6's relay carries. He is describing a vendor product, not prescribing that Jo build one. |
| **P-7** (the surface **is** the orchestrator) | Not addressed as an architectural claim. The nearest statement is authority rather than architecture: "the agents ship the work inside, while humans own the decisions at the boundary." | `addyosmani.com/blog/own-the-outer-loop/` — "humans own the decisions at the boundary" | Weak. He never distinguishes a surface that holds the model from a surface layered over one. P-7 gets no support and no contradiction from this corpus. |
| **P-7b** (orchestrator never acts on Jo's authority) | Stated as a hard line: "Only people can choose. Only people inherit consequence. Agents can be asked to choose, route, merge, and escalate safely inside a policy, but they cannot inherit the consequences." | `addyo.substack.com/p/own-the-outer-loop` — "Only people inherit consequence" | Strong fit, and it sharpens P-7b: his sentence permits an agent to route and even merge *inside a policy*, while reserving consequence. That is a narrower prohibition than "opening, closing, approving stay Jo's". |
| **P-8** (the lane owns its hands) | The hierarchical shape is his: "The parent orchestrator only talks to two agents, keeping its context clean… The parent never sees those details." Plus peer messaging so "the lead" is not a relay: "This doesn't go through the lead." | `addyosmani.com/blog/code-agent-orchestra/` — "The parent never sees those details" | Strong fit. His stated reason is context hygiene for the parent; P-8's stated reason is ownership. Same structure, different justification. |
| **P-8c** (exception-based visibility) | Stated as a principle with a mechanism: "**success is silent, failures are verbose.** If typecheck passes, the agent hears nothing. If it fails, the error text gets injected into the loop and the agent self-corrects." Plus a budget alarm: "At 85% of budget, auto-pause and notify the lead," and a cadence rule: "If you haven't made significant progress in 15 minutes, stop and report blockers." | `addyosmani.com/blog/agent-harness-engineering/` — "success is silent, failures are verbose"; `addyosmani.com/blog/code-agent-orchestra/` — "auto-pause and notify the lead"; `addyosmani.com/blog/coding-agents-manager/` — "stop and report blockers" | Strong fit, and it answers P-8c's open question ("what counts as an error; how it surfaces") with three concrete triggers: a failing mechanical check, a budget threshold, and a no-progress timer. |
| **P-9** (work-kind rule picks tier, per-lane ceiling, no per-dispatch approval) | Both halves present. Routing by work kind: a `MODEL_ROUTING.md` file with "Planning -> Gemini / Implementation -> Claude Opus or Sonnet / Review -> …". Ceiling: "Set hard per-agent budgets: Frontend 180k tokens, Backend 280k tokens." Plus a stop rule: "If stuck 3+ iterations on the same error, kill and reassign to a fresh agent." | `addyosmani.com/blog/code-agent-orchestra/` — "Multi-model routing", "Token Budgeting and Kill Criteria" | Strong fit and it is the most direct mechanism match in the corpus: a written routing table is a candidate artifact for P-9's "work-kind rule", and per-agent token budgets are a candidate for "per-lane ceiling". His taxonomy is planning / implementation / review / tests. |
| **P-10** (no rule carries over by default; keep/change/drop) | His ratchet states both directions: "You only add constraints when you've seen a real failure. You only remove them when a capable model has made them redundant. **Every line in a good `AGENTS.md` should be traceable back to a specific thing that went wrong.**" Plus the reason rules expire: "every component in a harness encodes an assumption about what the model can't do on its own." | `addyosmani.com/blog/agent-harness-engineering/` — "traceable back to a specific thing that went wrong" | Strong fit, and it supplies a decision criterion P-10 does not yet carry: a rule is kept if it traces to a real failure and dropped when the model has made it redundant. |
| **P-11** (mechanical whenever a single tool call could do the forbidden thing) | Hooks are named as the enforcement layer and placed at tool-call lifecycle points: "A hook is a script that runs at a specific lifecycle point: before a tool call, after a file edit, before commit, on session start." His worked example turns one mistake into a hook that greps the diff. | `addyosmani.com/blog/agent-harness-engineering/` — "before a tool call, after a file edit" | Strong fit. His lifecycle list is a candidate enumeration for P-11's "the tool call each gates". He does not state P-11's *whenever* rule — he treats hooks as one option among rules and subagents. |
| **P-12** (spec and plan through the system before anything executes, per project) | The strongest single statement in the corpus: "*Write down the done-condition before the agent starts.* This is the single highest-leverage move for long runs… an external file with explicit, testable completion criteria, and it exists so the agent can't quietly redefine *done* mid-run." Plus the brief's seven contents (outcome, context, constraints, non-goals, acceptance criteria, integration notes, verification plan), the `/spec` → `/plan` → `/build` ladder, and the economics: a plan review "turns a long, frustrating code review into a quick read of a two-hundred-line plan." | `addyosmani.com/blog/long-running-agents/` — "Write down the done-condition"; `addyosmani.com/blog/coding-agents-manager/` — "A practical agent brief covers"; `github.com/addyosmani/agent-skills` README command table; `addyo.substack.com/p/software-factories-light-and-dark` — "two-hundred-line plan" | Strong fit and it bears directly on P-12's open question. His answer to "not every task needs this" is explicit: the pattern is wrong where done cannot be defined — "Tasks that require human taste, subjective design, or open-ended creative exploration aren't a good fit." |
| **P-13** (recall prior work **and decisions**, with provenance, across sessions) | He names a pattern that carries decisions rather than work notes: "Gastown's 'beads' pattern: immutable, git-backed records of every decision and outcome with full provenance. Agents query past beads through task graphs and a SQL-addressable data plane - not traditional vector-based RAG". And the recoverability bar: "If you can't reconstruct what the agent did in the last 24 hours from durable storage, what you have is a long-running shell script that happens to call an LLM". Cross-agent sharing is raised only tentatively: "even a shared wiki or set of markdown files that all your agent sessions reference". | `addyosmani.com/blog/code-agent-orchestra/` — "immutable, git-backed records of every decision"; `addyosmani.com/blog/long-running-agents/` — "long-running shell script"; `addyosmani.com/blog/self-improving-agents/` — "a shared wiki or set of markdown files" | Strong fit on the *decisions with provenance* half, which is the half P-13 adds beyond work recall, and the beads description is a named candidate. Weak on cross-lane, cross-repo recall: his four Ralph-loop memory channels are per-project, and he offers sharing as a suggestion, not a design. He also flags the cost: "As your knowledge file grows, you may not always want to inject all of it for every single task". |
| **P-14** (runs within Jo's actual subscriptions; fleet-scale is evidence, not target) | Both sides appear. Assumed capacity: managed cloud runtimes ("Google's Agent Platform, Anthropic's Managed Agents… Cursor's cloud agents, and OpenAI's Codex Web"), cloud background agents, `/schedule` cloud routines, "twenty, thirty, fifty agents running in parallel", "10+ of these loops every night". Against it, his own ceiling: "The right number of paralell agents is how many you can actually code review properly. For most of us this is a low single digit." | `addyosmani.com/blog/long-running-agents/` — "agents as managed infrastructure"; `addyosmani.com/blog/factory-model/` — "twenty, thirty, fifty agents"; `addyosmani.com/blog/orchestration-tax/` — "low single digit" | Split, and the split is clean: the fleet material is capacity-dependent and falls under P-14's "evidence, not targets"; the attention material is capacity-independent and survives P-14 intact. See § What Osmani assumes that Jo has ruled out. |
| **P-15** (machinery portable from a GitHub repo) | He ships his own as an installable repo — the README's install line is `npx skills add addyosmani/agent-skills` — and the skills are plain Markdown with progressive disclosure. Against portability of the *rules*: "This is also why harness engineering is a discipline rather than a framework. The right harness for your codebase is shaped by your failure history. You can't download it." | `github.com/addyosmani/agent-skills` README — "npx skills add"; `addyosmani.com/blog/agent-harness-engineering/` — "You can't download it" | Fit with a caveat he states himself: the *skills* are portable, the *rulebook* is not, because it encodes one codebase's failure history. That distinction maps onto P-15's open question of which artifact classes are machinery versus state. |
| **P-16** (system proposes a hook, prose fix, or skill; never applies one) | The propose-never-apply shape is stated twice. "After every task, force the agent to write a REFLECTION.md: what surprised me, one pattern to add to AGENTS.md, one prompt improvement. The lead reviews and merges approved learnings." And the prohibition: "Never let an agent write to `AGENTS.md` directly. The lead must approve every line." His worked example produces exactly P-16's three artifact kinds from one mistake — a rule line, a pre-commit hook, and a reviewer-subagent check. | `addyosmani.com/blog/code-agent-orchestra/` — "The lead reviews and merges", "Never let an agent write to `AGENTS.md` directly"; `addyosmani.com/blog/agent-harness-engineering/` — "the next version of my pre-commit hook greps for" | Strongest fit in the corpus, matching P-16 including the prohibition. His trigger is every task, unconditionally; P-16's open question of thresholds ("what is counted") is not answered — he does not count repetitions, he reflects after each task. The measured reason he gives for the prohibition is second-hand (see § Unverified). |
| **P-17** (on resume, the first turn is already grounded) | Addressed as agent recoverability rather than operator continuity: "The append-only event log is what makes the agent recoverable, debuggable, and auditable." Plus the done-condition file existing "so the agent can't quietly redefine *done* mid-run", which is continuity of intent across a long run. | `addyosmani.com/blog/long-running-agents/` — "append-only event log", "quietly redefine *done*" | Partial. He solves resumption for a long-running agent, not for a lane resuming after compaction, and he never describes a wake step that verifies the record was read. P-17's "without re-briefing" has no counterpart in the corpus. |

---

### Addendum to the table — *Loop Engineering*, fetched after the table was written

**PMDW**
This post was linked from *Software Factories, Light and Dark* and was fetched last, after the
table above was already on disk. It is recorded here rather than folded into the table so the
order of what was known when stays visible.

**CITE**
`https://addyosmani.com/blog/loop-engineering/`, 2026-06-07. Its thesis sentence:

> "**Loop engineering is replacing yourself as the person who prompts the agent. You design the
> system that does it instead.** A loop here can be thought of a recursive goal where you define a
> purpose and the AI iterates until complete."

**CITE**
It does not use the strings "outer loop" or "inner loop" anywhere in the body fetched. This makes
ten Osmani-authored sources read in full this session, of which three use the phrase — the blog
keynote post and the two Substack posts already quoted.

**CITE**
It gives a five-part inventory of what a loop needs, plus a sixth:

> "1. **Automations** that go off on a schedule and do discovery and triage by themselves.
> 2. **Worktrees** so two agents working in paralell dont step on each other.
> 3. **Skills** to write down the project knowledge the agent would otherwise just guess.
> 4. **Plugins and connectors** to plug the agent into the tools you already use.
> 5. **Sub-agents** so one of them has the idea and a different one checks it."
>
> "Then the sixth thing, the memory. A markdown file, or a Linear board, anything that lives
> outside the single conversation and holds what's done and what is next… the model forgets
> everything between runs so the memory has to be on disk and not in the context. The agent
> forgets, the repo doesnt."

**GUESS(inference)**
That sixth item bears on P-13 and P-17 and strengthens both rows above: he states the reason
memory must be external — the model forgets between runs — and names the two artifact shapes he
uses, a markdown file or a Linear board. It does not add cross-lane or cross-repo recall, so the
P-13 row's weak half stands. What would settle the P-17 half: nothing in this post describes a
wake step; the gap is real.

**CITE**
It states the maker/checker split as applying to the *stop condition* itself, which is the
sharpest version of it in the corpus:

> "`/goal` keeps going until a condition you wrote is actually true, and after every turn a
> separate small model checks whether you are done, so the agent that wrote the code isnt the one
> grading it."
>
> "This is also basically what Claude Code's `/goal` does under the hood, a fresh model decides if
> the loop is done instead of the one that did the work, the maker and checker split applied to
> the stop condition itself."

**CITE**
It repeats the ceiling in the operator's terms, and names the ceiling as the human:

> "the worktrees take away the mechanical collision but YOU are still the ceiling, your review
> bandwith decides how many you can actually run, not the tool."

**CITE**
And it states the three things a better loop makes worse rather than better:

> "Verification is still on you. A loop running unattended is also a loop making mistakes
> unattended."
>
> "Your understanding still rots if you allow it."
>
> "And the comfortable posture is the dangerous one. When the loop runs itself its very tempting
> to stop having an opinion and just take whatever it gives back."

**CITE**
And his closing caution against loops as the only mode:

> "go ahead and set up your loops, but don't forget that prompting your agents directly is also
> effective. It's all about finding the right balance."

**GUESS(inference)**
That last line bears on P-6: he does not treat the single orchestrating surface as replacing
direct work in a lane, which is the same two-mode arrangement P-6 states ("Jo can open any lane
directly on demand"). What would settle it: nothing further; the sentence is his own and is quoted
in full.

---

## Sources I could not fully read

1. **`https://www.youtube.com/watch?v=n97BCfyFIvw`** — the AI Engineer World's Fair 2026 closing
   keynote that *Own the Outer Loop* says it is the written version of. **What I got:** title,
   channel ("AI Engineer"), upload date 2026-07-14, duration 18:26, the description, and the
   chapter timestamps. **What is missing:** the spoken content. The fetch returned "No transcript
   available for this video" and "No subtitles/captions available", and then "Fetch time budget
   exhausted". **Why:** the video has no caption track published, so there is no text layer to
   extract; a browser would not fix that, only speech-to-text on the audio would.
   **Importance: worth knowing, not on fire** — the post itself states it is the written version of
   this talk, and the post was read in full, so the definition is not gated on the video. It would
   only matter if he said something on stage that did not survive into the text.

2. **`https://addyosmani.com/blog/human-is-the-expensive-part/`** — linked from *Software
   Factories, Light and Dark* with the sentence "your attention is the actual product". **What I
   got:** nothing. HTTP 404. **Why:** either the slug differs from the one in his own link, or the
   post is unpublished. **Importance: worth knowing** — the title and the linking sentence suggest
   it is directly about the attention ceiling under P-14, which is a load-bearing part of this
   report. Everything I assert about that ceiling comes from other posts that did load, so nothing
   here depends on it. A search for the real slug is the obvious next move and I did not make it.

3. **`https://addyo.substack.com/p/own-the-outer-loop`** — **what I got:** lines 1–300 of 336,
   which covers the entire article body through its sign-off and the first reader comment.
   **What is missing:** lines 301–336, which are further reader comments and the page footer.
   **Importance: noise** — the article text is complete; the tail is Substack chrome.

4. **`https://addyo.substack.com/archive`** — **what I got:** lines 1–300 of 327, the post list
   back through the period covered by this report. **What is missing:** lines 301–327, older
   entries and footer. **Importance: worth knowing** — an older Substack post could in principle
   use the phrase a fourth time. I did not page to the end of the archive, so I cannot exclude it.

5. **`https://addyosmani.com/blog/self-improving-agents/`** — **what I got:** lines 1–300 of 309.
   **What is missing:** lines 301–309, the page's closing lines. **Importance: noise** — the
   substantive content, including the four memory channels quoted above, is within the part read.

6. **The ETH Zurich study behind his AGENTS.md figures (Gloaguen et al.)** — **what I got:** only
   Osmani's one-sentence restatement of it on
   `https://addyosmani.com/blog/code-agent-orchestra/`. **What is missing:** the paper. He gives no
   DOI, arXiv id, or outbound link on that page — only a link to his own `/blog/agents-md/`, which
   I did not open. **Importance: worth knowing** — the ~3% / ~20% / ~4% numbers are the only
   quantitative support in this report for the P-16 prohibition on agents writing their own rules,
   and I have a receipt only for the fact that *he says it*.

---

## Sources

**PMDW**
Every URL below was fetched in this session. The three that carry the phrase "own the outer loop"
are marked.

Osmani's blog, `addyosmani.com`:

1. `https://addyosmani.com/blog/own-the-outer-loop/` — *Own the Outer Loop*, 2026-07-15. **Carries the phrase.** Read in full.
2. `https://addyosmani.com/blog/practical-loop-engineering/` — *Practical Loop Engineering*, 2026-08-14. Read in full.
3. `https://addyosmani.com/blog/loop-engineering/` — *Loop Engineering*, 2026-06-07. Read in full.
4. `https://addyosmani.com/blog/orchestration-tax/` — *The Orchestration Tax*, 2026-05-24. Read in full.
5. `https://addyosmani.com/blog/long-running-agents/` — *Long-running Agents*, 2026-04-28. Read in full.
6. `https://addyosmani.com/blog/agent-harness-engineering/` — *Agent Harness Engineering*, 2026-04-19. Read in full.
7. `https://addyosmani.com/blog/cognitive-parallel-agents/` — *Your parallel Agent limit*, 2026-04-07. Read in full.
8. `https://addyosmani.com/blog/code-agent-orchestra/` — *The Code Agent Orchestra*, 2026-03-26. Read in full.
9. `https://addyosmani.com/blog/factory-model/` — *The Factory Model*, 2026-02-25. Read in full.
10. `https://addyosmani.com/blog/self-improving-agents/` — *Self-Improving Coding Agents*, 2026-01-31. Read to line 300 of 309.
11. `https://addyosmani.com/blog/coding-agents-manager/` — *Managing coding agents*, 2026-01-08. Read in full.

Osmani's newsletter, `addyo.substack.com` (*Elevate*):

12. `https://addyo.substack.com/p/own-the-outer-loop` — *Own the Outer Loop*, 2026-07-09. **Carries the phrase.** Article body read in full.
13. `https://addyo.substack.com/p/software-factories-light-and-dark` — *Software Factories, Light and Dark*, 2026-07-22. **Carries the phrase.** Read in full including comments.
14. `https://addyo.substack.com/archive` — the post index, read to line 300 of 327.

Osmani's GitHub:

15. `https://github.com/addyosmani/agent-skills` — README read in full. Does **not** carry the phrase.

Attempted and failed:

16. `https://www.youtube.com/watch?v=n97BCfyFIvw` — metadata only, no caption track.
17. `https://addyosmani.com/blog/human-is-the-expensive-part/` — HTTP 404.

Local:

18. `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md` — the requirement text quoted in the mapping table's first column is taken from here.

---

## Unverified

**GUESS(recall)**
Nothing in this report rests on recall of Osmani's writing. Every quotation is from a URL fetched
in this session and is reproduced verbatim from the fetched text. Where his own text contains a
typo ("paralell", "wich", "dont"), it is preserved rather than corrected, so the quote can be
matched against the page.

**GUESS(inference)**
The claim that the blog post and the Substack post of the same name are the same article was made
by comparing the passages that define the term, the opening thesis, and the sign-off — not by
diffing the two documents line by line. A sentence present in one and absent from the other could
have escaped me.

**GUESS(inference)**
I assert that ten Osmani sources were read and three carry the phrase. That is a statement about
the sources I fetched, not about his corpus. His blog has posts I never listed (`/blog/agents-md/`,
`/blog/comprehension-debt/`, `/blog/intent-debt/`, `/blog/cognitive-surrender/`,
`/blog/agent-skills/`, `/blog/agentic-code-review/`, `/blog/code-review-ai/` are all linked from
posts I read and none were opened), and the Substack archive was not paged to its end. A fourth
use of the phrase in an unopened post cannot be excluded.

**GUESS(inference)**
The ~3% penalty, ~20% cost increase, and ~4% improvement attributed to Gloaguen et al. are
Osmani's restatement. I have a receipt that he wrote those figures; I have no receipt that the
study found them.

**GUESS(inference)**
Every cell in the final column of the mapping table is my inference about fit. Osmani writes for a
general audience of engineering teams, mostly with organisational scale and cloud infrastructure
assumed; he has made no statement about this system, this operator, or these requirements.

**GUESS(inference)**
Where I describe a requirement as getting "strong fit" or "no bearing", that is a judgement about
whether his text speaks to the requirement, not a recommendation that 2.0 adopt his mechanism.
Recommending is Plumb's job and Jo's decision.

**QUESTION**
One decision this report cannot make: P-16 says the system proposes on observing "errors and
repetitions", with thresholds open. Osmani's trigger is unconditional — a reflection after every
task — which is a different design with a different cost. The options are (a) reflect after every
task as he does, producing a steady stream of proposals Jo triages, or (b) trigger on a counted
repetition, producing fewer proposals but requiring a counting mechanism that does not yet exist.
What each changes: (a) costs Jo attention per task and needs no new machinery; (b) costs
machinery and defers the attention. This is Jo's call, not a gap in evidence.

---

## Coverage

**PMDW**
The question spans several subjects and this session made eighteen retrievals, so this is the
table form. *Sources* above lists what supported the answer; this accounts for everything touched,
including what was retrieved or seen listed and never opened.

| Source area | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| The phrase itself, in Osmani's own text | 3 URLs that contain it | All 3, in full (the Substack copy's body in full; its comment tail not) | None | **Yes.** The acceptance bar was a quotation rather than a paraphrase, and the defining passages are quoted verbatim from all three. |
| Osmani's blog on orchestrating many agents | 11 posts | 10 in full, 1 (`/blog/self-improving-agents/`) to line 300 of 309 | None | **Yes** for the requirements the table covers. **No** for completeness of his corpus — seven further posts are linked from what I read and none were opened (listed below). I would read `/blog/agents-md/` next, because it is where his AGENTS.md evidence lives. |
| Osmani's newsletter (`addyo.substack.com`) | 3 URLs (2 posts, 1 archive index) | Both posts' article bodies in full; the archive to line 300 of 327 | None | **Partly.** The two posts that matter were found and read. The archive was not paged to its end, so an older post using the phrase a fourth time is not excluded. I would page the archive tail next. |
| Osmani's GitHub | 1 repo README (`addyosmani/agent-skills`) | In full, 531 lines | None | **Yes** for whether the repo carries the outer-loop idea (it carries the practice, not the phrase). **No** for its orchestration guidance — see the unopened file below. |
| The keynote talk the post is based on | 1 video URL | Metadata, description, and chapter timestamps only | **Yes — no caption track, and the fetch budget then expired.** It did **not** cost the answer: the post states it is the written version of this talk and the post was read in full. | **Yes, with the gap declared.** A speech-to-text pass on the audio is the only way to close it, and it is not worth it unless Plumb finds a claim in the report that only the talk would settle. |
| Osmani's own attention-ceiling writing | 1 further URL attempted (`/blog/human-is-the-expensive-part/`) | Nothing | **Yes — HTTP 404.** Did not cost the answer; the ceiling material is quoted from two other posts that loaded. | **No, but not load-bearing.** The next move is a search for the correct slug, which I did not make. |
| Third-party work Osmani cites | 0 retrieved | 0 | Not attempted | **No, and declared.** The ETH Zurich study, the Sonar 2026 report, the GitLab June 2026 research, the Wharton study, the Anthropic RCT, and Dex Horthy's talk and repo are all restated by Osmani and none were fetched. Everything sourced from them is labeled as his restatement. This is in scope for a different hand, not for a report on what Osmani says. |
| Practitioner accounts | 0 | 0 | None | **Yes, and deliberate.** The brief caps these at ten and says to stop when the primary sources are read. The question is "what does Osmani mean", and Osmani's own text answers it; a practitioner's reading of him would be weaker evidence than his sentence. |
| Local requirement text | 1 file (`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md`) | In full | None | **Yes.** P-1 through P-17 are quoted from it directly in the mapping table's first column. |

**Nothing retrieved was left unopened is *not* true of this run.** What I saw listed and did not
open:

- **Seven Osmani posts linked from posts I read, none opened:** `/blog/agents-md/`,
  `/blog/comprehension-debt/`, `/blog/intent-debt/`, `/blog/cognitive-surrender/`,
  `/blog/agent-skills/`, `/blog/agentic-code-review/`, `/blog/code-review-ai/`. The first is the
  one I would open next.
- **`references/orchestration-patterns.md` in `addyosmani/agent-skills`**, which the README's own
  table describes as covering "Endorsed multi-persona orchestration patterns, anti-patterns, and
  the 'personas don't invoke personas' rule". I had the repo open and did not open this file. It is
  the single most on-topic unopened item in the run, given P-8 is about who spawns whom.
- **Every outbound link in the Substack posts**: the Sonar 2026 State of Code PDF, the GitLab
  investor-relations research page, the Wharton study, the Anthropic RCT on comprehension, Dex
  Horthy's `12-factor-agents` repo and his AI Engineer talk, and Paul Graham's essay on taste.
- **The tail of the Substack archive** beyond line 300, and the tail of
  `/blog/self-improving-agents/` beyond line 300.

**GUESS(inference)**
Two of those are thin for a bad reason rather than a good one: the orchestration-patterns file was
in my hand and I did not open it, and the archive tail is the one place a fourth use of the phrase
could hide. By the reference's own grading that makes this a Tier 2 run rather than Tier 0,
independent of the two failed fetches, which did not cost the answer. Declared here and in the
envelope.

**ACTION**
This report was written incrementally by appending to
`/Users/jowolff/code/agent-system-2.0/.tmp/phase4/research-B-osmani.md`. One append failed and is
reported here rather than omitted: an earlier `cat >> … <<'EOF'` heredoc was refused by the
`careful` guard because one of Osmani's harness quotes contains a destructive-SQL string, and the
guard matches on content regardless of context. Exit status was an error and the file was not
modified; no reversal was needed. The passage was written with the `write` tool instead, and every
later section was appended by heredoc successfully. Nothing outside this one file was created,
edited, or deleted in this run.

<!-- output-types
tier: 2
CLAIM: 0
CITE: 90
GUESS: 17 (inference 16, pattern 0, recall 1)
ACTION: 1
PMDW: 8
QUESTION: 1
-->
