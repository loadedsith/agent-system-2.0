# Research C — Steve Yegge on running many coding agents, read under P-14

Phase 4 research hand `ResearchYegge`. One of four independent reports; Plumb assembles
`RESEARCH.md`. Nothing here is a quality opinion about 1.x or about the sources.

## Question

**PMDW**

What does Steve Yegge say, in his own words, about running many coding agents — software
factories, agent fleets, orchestration, and the human's role — and which of those patterns
survive the constraint in P-14 (2.0 runs within the subscriptions and budget Jo actually has)?

## Answer

### Blockers and open questions — first, not last

**GUESS(inference)**

The single largest unknown this report cannot close: Yegge never states a token or dollar
cost **per Gas Town role**. He states costs only in aggregate ("I had to get my second Claude
Code account") and never breaks out what the always-on supervisory agents — Deacon, Boot,
Witness, Refinery — burn when idle-patrolling versus what the worker agents burn. That
matters directly for P-14, because the supervisory layer is the part of his design that runs
continuously whether or not you are running many workers. What would settle it: run Gas Town
in Mayor-only mode against a metered account for a day and compare against a day of ordinary
single-agent use. Nothing in the fetched sources substitutes for that measurement.

**QUESTION**

Yegge's most transferable single artifact is Beads — a git-backed work-and-decision ledger
that he says is used standalone by people who never run his orchestrator. That overlaps the
P-13 memory requirement, which Phase 4 is separately researching (`ResearchGraphEng` and the
memory-system item in `briefs/research.md`). The choice of whether Beads is a candidate for
P-13 alongside ctx is Jo's, not mine; I have recorded what Yegge claims for it and mapped it
to P-13 below without recommending it. What each option changes: adopting Beads means a
git-native ledger the agents write to as they work; keeping ctx means an index over prior
sessions. They are not the same artifact class.

### Bottom line up front

**CITE**

Yegge's writing splits cleanly into two layers, and he draws the line himself. One layer is
**fleet scale** — 20 to 30 concurrent Claude Code instances, multiple paid accounts, swarms,
overnight burn — and he gates it explicitly: *"Do not use Gas Town if you do not juggle at
least five Claude Codes at once, daily. Do not use Gas Town if you care about money."*
(https://yegge.ai/essays/welcome-to-gas-town/, § "Tune In Next Time", the Golden Rules). The
other layer is a set of **per-agent durability and hygiene practices** that he states work at
any scale, and which he says are used independently of his orchestrator: *"Plenty of people
pick up Beads just for the memory and persistence story without ever running Gas Town — it's
the most-starred part of the project."* (https://yegge.ai/gastown.html, § "Beads — the
foundation").

**CITE**

He also states that the fleet layer is degradable by design, not all-or-nothing: *"You
technically only need the Mayor. Running with just the Mayor is a good tutorial/intro to Gas
Town. I run in Mayor-only mode from time to time… Even alone, it still gets all the benefits
of GUPP, MEOW, etc."* and *"It's OK not to swarm all the time."*
(https://yegge.ai/essays/gas-town-emergency-user-manual/, § "Dev Middle Loop"). And in the
launch essay: *"it degrades gracefully. Every worker can do their job independently, or in
little groups, and at any time you can choose which parts of Gas Town you want running."*
(https://yegge.ai/essays/welcome-to-gas-town/, § "Gas Town 101").

**GUESS(inference)**

So the P-14 reading is not "Yegge is out of means, discard him." It is that his *throughput
claims* depend on fleet scale and his *durability mechanisms* do not. This is an inference
from the two passages above plus the graceful-degradation passage; Yegge does not himself
frame his work as separable into a budget tier and a scale tier.

### What he built, and the four attempts behind it

**CITE**

Gas Town is his fourth orchestrator of 2025, and he names the three that failed:
*"in August I started building my own orchestrator, since nobody else seemed to care.
Eventually it failed, and I threw it out and started over on v2, which also failed, but we
got Beads out of it. Then v3 (Python Gas Town), which lasted a good six or eight weeks. Gas
Town (in Go) is my fourth complete, functioning orchestrator of 2025."*
(https://yegge.ai/essays/welcome-to-gas-town/, § "Gas Town Was No Secret").

**CITE**

The v1 failure has a named cause: it was built on Temporal, and *"proved cumbersome for my
needs. The workflows I was orchestrating turned out to be micro-workflows, since you have to
severely decompose tasks for LLMs to reliably follow them."* The v2 failure has a different
named cause: *"With `vibecoder` and `vc`, I was trying to make agents better. With Gas Town, I
was just trying to make more of them. The fact that Gas Town has all the features of the other
two, with a tiny fraction of the code, tells me I finally got it right."*
(https://yegge.ai/essays/the-future-of-coding-agents/, § "Gas Town was Orchestrator #4").

**CITE**

He also reports redoing the structure repeatedly because the agents kept guessing wrong:
*"I had to redo it all 3 or 4 times (again, after 3–4 redesigns in PGT) because the agents
were still guessing wrong about the directory structure and roles."* The remedy he names is
**Desire Paths**: *"You tell the agent what you want, watch closely what they try, and then
implement the thing they tried. Make it real. Over and over. Until your tool works just the
way agents believe it should work."* (https://yegge.ai/essays/the-future-of-coding-agents/,
§ "Gas Town was Orchestrator #4" and § "Gas Town's Free Upgrades").

### The human's role, stated three different ways

**CITE**

In the launch essay the human is a product manager: *"In Gas Town, you let Claude Code do its
thing. You are a Product Manager, and Gas Town is an Idea Compiler. You just make up features,
design them, file the implementation plans, and then sling the work around to your polecats
and crew."* And immediately after, the caveat: *"you have to help keep Gas Town running. It
runs itself pretty well most of the time, but stuff goes wrong often… It's very much a
hands-on-the-wheel orchestration system."* (https://yegge.ai/essays/welcome-to-gas-town/,
§ "WARNING DANGER CAUTION").

**CITE**

In the practitioner guide the human's job is reading responses, not watching work:
*"Don't watch your agents work. Make sure they have their marching orders, and let them do
their thing. But. When you see that an agent is finished working, stop everything, ignore
everyone else, and read what it has to say… Spend your time reading agent responses and
giving them direction — not watching them work."*
(https://yegge.ai/essays/gas-town-emergency-user-manual/, § "Dev Inner Loop").

**CITE**

By April the framing has moved again: the orchestrator exists to spare the human the reading.
*"Claude Code is a wall of scrolling text. The harder it works, the scrollier it gets. Now
imagine having 10 standard coding agents running… And you have to sort through all their
output to find the nuggets of actually interesting stuff you need to know about, like the part
where they're deleting the database. This is why people love Gas Town. The Mayor reads all
that crap that the workers are printing."* He is explicit that he started elsewhere and moved:
*"At first, I was trying to achieve the elusive 'visibility without reading' by chasing classic
Observability. I was initially thinking that I wanted dashboards or activity feeds… But after
a while I realized I just wanted someone to talk to, while the system was working. And perhaps,
as occasion might demand, someone to yell at."*
(https://yegge.ai/essays/gas-town-from-clown-show-to-v10/, § "Gas Town: It's That Dang Mayor").

### Transfers / out of means / unclear

**PMDW**

Every row carries a fetched-URL receipt. "Out of means" means the pattern's stated value
depends on many parallel paid subscriptions or on fleet scale; "transfers" means Yegge states
or demonstrates it working at single-agent or few-agent scale; "unclear" names what would
settle it. The **Fit** column is my inference, not Yegge's claim.

| Type | Pattern (Yegge's name) | Class | Receipt — URL + passage | Fit (GUESS(inference)) |
|---|---|---|---|---|
| CITE | **Beads** — git-backed, queryable, append-only work ledger the agents read and write | transfers | https://yegge.ai/gastown.html § "Beads — the foundation": *"Plenty of people pick up Beads just for the memory and persistence story without ever running Gas Town — it's the most-starred part of the project."* | P-13. Standalone use is stated, not assumed |
| CITE | **Beads is the Why** — commit history holds what/where/who/how; the ledger holds why | transfers | https://yegge.ai/essays/gas-town-from-clown-show-to-v10/ § "Beads is the Missing Why": *"Beads is the Why — the missing piece in your commit history… invaluable for agents when they are trying to reconstruct how we got where we are."* | P-13 says "work **and the decisions made about it**". Closest thing in the corpus to that exact requirement |
| CITE | **Agent ≠ session** — persistent identity, ephemeral sessions | transfers | https://yegge.ai/essays/welcome-to-gas-town/ § "Gastown Universal Propulsion Principle": *"In Gas Town, an agent is not a session. Sessions are ephemeral; they are the 'cattle'… Claude Code sessions are the cattle that Gas Town throws at persistent work."* | P-2. Costs nothing extra at one lane |
| CITE | **Seat vs session** — the same idea restated and sharpened eight months later | transfers | https://yegge.ai/essays/model-welfare/ § "Closing the Loop": *"A session is just a day in the life of an agent… A seat is a named role with persistent identity (addressability) and history/memory, which accumulates accomplishments over time. Seats survive model upgrades, and even renaming. Sessions are days, and seats are people."* | P-2. This is the closest vocabulary match in the corpus to the lane concept |
| CITE | **Handoff instead of `/exit`** — the agent writes its own notes and is restarted primed with them | transfers | https://yegge.ai/essays/model-welfare/ § "The Anti-Clonking Device": *"It is a request, not a SIGTERM—the agent must consent to it… The agent gets a chance to finish tasks and write notes to a handoff cache somewhere… The harness itself exits and restarts the agent, priming it with its own handoff notes."* Also *"`/compact` is not much better than `/exit`… it's still erasing their memory and replacing it with someone else's notes about what happened."* | P-13 across sessions |
| CITE | **`gt handoff` used liberally after every task** | transfers | https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Dev Inner Loop": *"Use `gt handoff` liberally after every task, in every worker. Only let sessions go long if they need to accumulate important context for a big design or decision."* Cost noted per method: saying "let's hand off" is *"expensive but very flexible"*, `!gt handoff` is *"no cost"* | P-13, and a spend lever (P-9): the shell-out form costs no tokens |
| CITE | **Restart agents frequently, one task at a time** | transfers | https://yegge.ai/essays/beads-best-practices/ § "Restart Agents Frequently": *"Agents should tackle one task at a time. Once it's done, kill the process and start a new agent. Beads acts as the working memory between sessions. By starting new sessions often, you save money and get better performance from the models."* | P-9. Stated as a cost reduction, not a scale feature |
| CITE | **`gt seance`** — a new session queries its own predecessor via `/resume` | transfers | https://yegge.ai/essays/welcome-to-gas-town/ § "Talking to your Dead Ancestors": *"the worker will literally spin Claude Code up in a subprocess, use `/resume` to revive its predecessor, and ask it, 'Where the hell is my stuff you left for me?'"* Origin is a failure: *"the new worker will spin up and be like, 'What? I don't see shit.'"* | P-13. Needs only one lane and its own history |
| CITE | **Plan outside the tracker, then import** | transfers | https://yegge.ai/essays/beads-best-practices/ § "Plan Outside Beads, Then Import": *"Use your favorite planning tool, something maybe like OpenSpec, to create your plan. Once it has been revised a few times by the model, you're ready to translate it into Beads."* And https://yegge.ai/essays/welcome-to-gas-town/ § "Planning in Gas Town": *"you can use your own planning tool, like Spec Kit or BMAD, and then once your plan is ready, ask an agent to convert it into Beads epics."* | P-12. Explicitly tool-agnostic on the planning side |
| CITE | **Two-pass plan refinement, bounded at five iterations** | transfers | https://yegge.ai/essays/beads-best-practices/ § "Plan Outside Beads, Then Import": *"First, ask your agent to file a set of detailed Beads epics and issues… focusing carefully on dependencies, detailed designs, and potential parallelization. Second, once the agent finishes grinding through filing all the beads, ask it to do a thorough review, proofreading, refining, and polishing… You can ask it to iterate and improve on your plan up to 5 times."* | P-12 |
| CITE | **Well-specified work for unsupervised workers; decisions stay with named agents** | transfers | https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Working with Crew": *"Polecats are best for well-defined, well-specified work. You should feed them Beads epics that have been thoroughly decomposed and vetted multiple times for suitability for polecats. They shouldn't have to make decisions."* | P-12, P-8 |
| CITE | **Crew** — named, long-lived, per-project agents for thought-intensive work | transfers | https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Your Personal Concierges": *"I use the Crew for any sort of thought-intensive work, including design work, reviewing contributor PRs, creating implementation plans, and sometimes doing specific code reviews."* | P-2, P-12. He runs 7–8 per rig, but the pattern does not require that count |
| CITE | **Standing-orders hook** — a permanent bead pinned to one agent, executed on every session start | transfers | https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Crew Sheriffs": *"One of my Beads crew has a permanent hook: `bd-4f43s: PR Sheriff Standing Orders`. On every session startup, the sheriff checks open PRs and divides them into easy wins and those needing human review."* | P-16. A recurring routine encoded as durable state, not prose |
| CITE | **Guiding principles in agent priming, to stop "heresies"** | transfers | https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Tending the Invisible Garden": *"Agents are very approximate workers and they like to guess at stuff. They will often make wrong guesses about how your system is supposed to work. If that wrong guess makes it into the code… it becomes enshrined and other agents may notice it and propagate the heresy… the most helpful way to rid yourself of persistent heresies is to capture your guiding principles in the agent priming."* | P-10, P-16 |
| CITE | **Desire Paths** — implement what the agents already tried to do | transfers | https://yegge.ai/essays/the-future-of-coding-agents/ § "Gas Town's Free Upgrades": *"You tell the agent what you want, watch closely what they try, and then implement the thing they tried. Make it real. Over and over."* | P-16. A method for what to build next from observed agent behaviour |
| CITE | **Escalate rather than block** — severity-routed, with the human as last stop | transfers | https://github.com/steveyegge/gastown README § "Escalation": *"When agents hit blockers, they escalate rather than waiting… Escalations route through Deacon -> Mayor -> Overseer based on severity."* And the welfare framing: https://yegge.ai/essays/model-welfare/ § principle 6: *"The right to refuse, and escalate. Agents are always allowed to say, 'this needs Steve.'"* | P-8c, P-7b |
| CITE | **Concurrency cap as the spend governor** | transfers | https://github.com/steveyegge/gastown README § "Scheduler": *"The scheduler controls polecat dispatch capacity to prevent API rate limit exhaustion"*, `gt config set scheduler.max_polecats 5`; default `-1` dispatches immediately | P-9's per-lane ceiling. A number, not a per-dispatch approval |
| CITE | **Per-agent model routing by alias, overridable per dispatch** | transfers | https://github.com/steveyegge/gastown README § "Configuration": `gt config agent set claude-glm "claude-glm --model glm-4"`, `gt config agent set codex-low "codex --thinking low"`, `gt config default-agent claude-glm`, and `gt sling <bead-id> <rig> --agent cursor` to *"Override runtime for this sling/spawn"* | P-9. A work-kind routing table exists in the shipped tool |
| CITE | **Exception-based health view** — surface only agents needing intervention | transfers | https://github.com/steveyegge/gastown README § "Problems View": *"At scale (20-50+ agents), spotting stuck agents in the activity stream becomes difficult. The problems view surfaces agents needing human intervention"*; states are GUPP Violation, Stalled, Zombie, Working, Idle | P-8c. The *states* transfer; the need for the view is scale-driven |
| CITE | **A home of one's own** — each agent gets a clone nothing else touches | transfers | https://yegge.ai/essays/model-welfare/ § principle 5: *"Every agent has their own clone that no other processes may touch. We support roaming project work, but every agent still needs their own home."* | P-5 (lane checks out what it needs), P-8 |
| CITE | **Structural blamelessness** | transfers | https://yegge.ai/essays/model-welfare/ § principle 4: *"When a landing goes red, nobody gets blamed. We just fix it and do a postmortem and amend the constitution as needed."* | P-16. Ties failure observation to a rule amendment |
| CITE | **Never falsify the record** | transfers | https://yegge.ai/essays/model-welfare/ § principle 7: *"The bead audit trail is your true history and institutional memory."* | P-13 provenance |
| CITE | **Keep the ledger small** | transfers | https://yegge.ai/essays/beads-best-practices/ § "Keep Your Database Small": *"Whenever I get more than about 200 issues I start thinking about cleaning up, and I rarely let it go beyond 500… This fails if your file is larger than 25k tokens, the current limit for reading whole files, which is maybe 500-ish Beads issues, ballpark."* Deleted issues stay recoverable: *"The issues are always in git history, even after deleting them."* | P-13. An operational limit on any file-backed memory store |
| CITE | **Code-review sweeps then bug-fix sweeps, as the quality gate when you do not read the code** | unclear | https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Tending the Invisible Garden": *"regular code review sweeps, followed by bug-fix sweeps that fix the issues filed during the code-review sweeps. Gas Town excels at both… You just keep doing this until the code reviews are just nitpicking… Do some of this every day."* | P-4. The practice is scale-neutral but he describes executing it *with a swarm*. What would settle it: whether a serial sweep over a day's diff gives comparable coverage at 1–2 lanes |
| CITE | **Molecules / formulas** — a workflow as a chain of durable work items an agent walks one step at a time | unclear | https://yegge.ai/essays/welcome-to-gas-town/ § "Molecular Expression of Work": *"If the workflow is captured as a molecule, then it survives agent crashes, compactions, restarts, and interruptions. Just start the agent up in the same sandbox, have it find its place in the molecule, and pick up where it left off."* Origin is a failure: a 20-step release where *"Agents used to struggle to get through it… I would have to nag the agent to finish, and they would always skip steps."* | P-4, P-12. Needs no parallelism. Unclear because his stated payoff is unattended multi-hour runs; what would settle it is whether the same durability pays for a 5-step gated sequence |
| CITE | **Refinery** — Bors-style bisecting merge queue with verification gates | unclear | https://github.com/steveyegge/gastown README § "Merge Queue (Refinery)": *"Runs verification gates on the merged stack. If green: all MRs in batch merge to main. If red: bisects to isolate the failing MR, merges the good ones. This is a Bors-style merge queue — polecats never push directly to main."* But Yegge bounds its usefulness: *"The Refineries are useful if you have done a LOT of up-front specification work, and you have huge piles of Beads to churn through with long convoys"* (https://yegge.ai/essays/gas-town-emergency-user-manual/, § "Dev Middle Loop") | P-4. The *verification gate before merge* transfers; the queue machinery is bounded by his own statement. What would settle it: the collision rate at Jo's actual concurrent-lane count |
| CITE | **Witness / Deacon / Boot watchdog chain** | unclear | https://github.com/steveyegge/gastown README § "Monitoring & Health": three tiers, daemon heartbeat every 3 min, Boot every 5 min. Yegge's origin story is explicitly scale-triggered: *"Once you spin up enough polecats, you realize you need an agent just to watch over them"* (https://yegge.ai/essays/welcome-to-gas-town/, § "Gas Town 101") | P-7a, P-8b. Unclear because the *need* is scale-triggered but the *idea* (orchestrator state comes from observation, not self-report) is not. What would settle it: per-role idle token cost, the blocker named at the top |
| CITE | **GUPP + the nudge** — "if there is work on your hook, YOU MUST RUN IT", plus a tmux keystroke because agents ignore it | unclear | https://yegge.ai/essays/welcome-to-gas-town/ § "The GUPP Nudge": *"Claude Code is so miserably polite that GUPP doesn't always work in practice. We tell the agent, YOU MUST RUN YOUR HOOK, and it sometimes doesn't do anything at all. It just sits there waiting for user input."* Workaround: *"`gt nudge`… sends a tmux notification to a worker… ensures the worker receives the notification as if the user had typed it."* | P-7c (confirmed delivery). Unclear because the tmux-keystroke mechanism is harness-specific; what would settle it is whether OMP's own messaging already delivers confirmed |
| CITE | **20–30 concurrent agents as the working target** | out of means | https://yegge.ai/essays/welcome-to-gas-town/ subtitle: *"A 2026 IDE replacement for orchestrating 20–30 Claude Code instances at once"*; and *"I try to keep it under 30 workers right now… typically I'll only have a dozen or so active unless I'm really pushing hard"* | Directly what P-14 excludes |
| CITE | **Multiple paid accounts** | out of means | https://yegge.ai/essays/welcome-to-gas-town/ § "WARNING DANGER CAUTION": *"I had to get my second Claude Code account, finally; they don't let you siphon unlimited dollars from a single account, so you need multiple emails and siphons, it's all very silly. My calculations show that now that Gas Town has finally achieved liftoff, I will need a third Claude Code account by the end of next week. It is a cash guzzler."* | The exact pattern P-14 names |
| CITE | **The entry gate itself** — five parallel agents daily, minimum | out of means | https://yegge.ai/essays/welcome-to-gas-town/ Golden Rules: *"Do not use Gas Town if you do not juggle at least five Claude Codes at once, daily. Do not use Gas Town if you care about money."* And the stage ladder: *"If you're not at least Stage 7, or maybe Stage 6 and very brave, then you will not be able to use Gas Town"* where Stage 6 is *"3 to 5 parallel instances"* and Stage 7 is *"10+ agents, hand-managed"* | Adopting Gas Town as a product is out of means; individual mechanisms above are not |
| CITE | **Swarms and convoys** — many ephemeral workers attacking one work order | out of means | https://yegge.ai/essays/welcome-to-gas-town/ § "Convoys": *"a Convoy can have multiple swarms 'attack' it… Whoever is managing the Convoy (e.g. Witness) will keep recycling polecats and pushing them on issues."* And *"With 12 to 30 workers, you can burn through enormous work backlogs in a single sitting"* | Throughput claim, scale-dependent |
| CITE | **Rule of Five** — wrap every step so it is reviewed four more times | out of means | https://yegge.ai/essays/welcome-to-gas-town/ § "Planning in Gas Town": *"if you make an LLM review something five times, with different focus areas each time though, it generates superior outcomes"*; and his own caveat: *"This can generate LARGE workflows that can take many hours or days for you to crank through, especially if you are limiting your polecat numbers to throttle your costs or token burn."* | Roughly 5x the token cost per step, by his own description of the mechanism |
| CITE | **Overnight / unattended weekend runs** | out of means | https://yegge.ai/essays/welcome-to-gas-town/ § "Molecular Expression of Work": *"you can set up the dependencies for an entire gigantic project in advance, and have Gas Town swarm it for an entire weekend, unattended, if you're brave enough."* And § "The GUPP Nudge": *"Gas Town can work all night, if you feed it enough work."* | Sustained burn with no human in the loop |
| CITE | **Wasteland federation** — linking towns, claiming others' posted work, portable reputation stamps | out of means | https://yegge.ai/gastown.html § "The Wasteland": *"a shared wanted board: post work that needs doing, claim work other people have posted, earn stamps from validators when you finish it."* | Presupposes multiple towns and other operators. Nothing in P-1..P-16 asks for it |
| CITE | **Fleet economics as the stated budget** | out of means | https://yegge.ai/essays/revenge-of-the-junior-developer/ § "I was told there would be no math": *"it's going to be worth your while to budget more like $80-$100 of LLM spend per developer, per day"*, and in § "The agent fleet is coming": *"fleets will enable your developers to spend thousands of dollars a day."* | These are Yegge's figures for an enterprise budgeting audience, not Jo's, and P-14 rules them out as targets |

### Failures and things that did not work, in his own words

**PMDW**

The brief asks for these specifically. They are the highest-signal part of the corpus because
each one names a mechanism that a design can avoid or pre-empt.

**CITE**

**Three orchestrators failed before the fourth.** Two named causes: a workflow engine
(Temporal) was the wrong granularity because *"the workflows I was orchestrating turned out
to be micro-workflows, since you have to severely decompose tasks for LLMs to reliably follow
them"*; and the first two attempts aimed at the wrong target — *"With `vibecoder` and `vc`, I
was trying to make agents better. With Gas Town, I was just trying to make more of them."*
(https://yegge.ai/essays/the-future-of-coding-agents/, § "Gas Town was Orchestrator #4").

**CITE**

**The supervisor killed the workers.** *"There was the Gas Town Serial Killer Murder Mystery
that went on like a game of Clue for close to a week. Spoiler: The Deacon did it. It was
cleaning up 'stale' workers that weren't stale and murdering entire crews mid-task."*
(https://yegge.ai/essays/gas-town-emergency-user-manual/, opening section). Restated at v1.0:
*"There were the serial killer sprees, viciously taking out random workers mid-job. (It's
always the Deacon…)"* (https://yegge.ai/essays/gas-town-from-clown-show-to-v10/, opening).

**CITE**

**The coordinator lost its data, repeatedly, for weeks.** *"There was the 22-nose Clown Show,
where the Mayor scored a new clown nose every time it had massive data loss, which went on for
weeks."* (https://yegge.ai/essays/gas-town-from-clown-show-to-v10/, opening).

**CITE**

**Workers got lost and confused about their own identity.** *"we've had workers stalling out,
getting lost, orphaned, confused about who they are."*
(https://yegge.ai/essays/gas-town-emergency-user-manual/, opening section).

**CITE**

**The propulsion rule did not fire on its own.** The core invariant — *"If there is work on
your hook, YOU MUST RUN IT"* — is defeated by the agent's own disposition: *"Claude Code is so
miserably polite that GUPP doesn't always work in practice… It just sits there waiting for
user input."* The fix is a synthetic keystroke, and he calls it a hack:
*"With the Gupp Nudge 'hack' in place…"* (https://yegge.ai/essays/welcome-to-gas-town/,
§§ "Gastown Universal Propulsion Principle" and "The GUPP Nudge").

**CITE**

**Handoffs silently dropped their payload.** *"often, a worker will say, 'OK, I handed off this
big pile of work and advice to my successor! Kbai! `/handoff`', and disappear, and then the new
worker will spin up and be like, 'What? I don't see shit.'"* — the failure that produced
`gt seance`. (https://yegge.ai/essays/welcome-to-gas-town/, § "Talking to your Dead Ancestors").

**CITE**

**Wrong beliefs propagate and re-enshrine themselves.** *"no shortage of heresies: compelling
but wrong beliefs about the architecture that spread invisibly. Heresies happen regularly when
you're coding blind. You have to sniff them out and eradicate them, often multiple times."*
With a worked example — "idle polecats" — of a concept that *"make[s] it back into the code
base, comments, and docs all the time"* despite being architecturally false.
(https://yegge.ai/essays/gas-town-emergency-user-manual/, opening and § "Tending the Invisible
Garden").

**CITE**

**The storage architecture was wrong and had to be replaced.** *"Many of these audiences were
poorly served by the original, janky Beads architecture of SQLite + JSONL + awkward syncing and
tons of merge conflicts. When it did work, it was often last-write wins semantics with SQLite
just taking 'whatever' happened to win… The inherent fragility of the v0.x Beads architecture,
with its bidirectional sync, 3-way merge, two sources of truth, race conditions, and tombstone
hell — that's all gone now."* (https://yegge.ai/essays/gas-town-from-clown-show-to-v10/,
§ "Beads: Ready for v1").

**CITE**

**Merge contention is the first thing that breaks when workers run in parallel.** *"As soon as
you start swarming workers, you run into the Merge Queue (MQ) problem. Your workers get into a
monkey knife fight over rebasing/merging… The baseline can change so much during a swarm that
the final workers getting merged are trying to merge against an unrecognizable new head. They
may need to completely reimagine their changes and reimplement them."*
(https://yegge.ai/essays/welcome-to-gas-town/, § "Gas Town 101").

**CITE**

**Work is lost as a matter of course, and he says so plainly.** *"Work becomes fluid, an
uncountable substance that you sling around freely, like slopping shiny fish into wooden
barrels at the docks. Most work gets done; some work gets lost… Some bugs get fixed 2 or 3
times, and someone has to pick the winner. Other fixes get lost. Designs go missing and need
to be redone."* (https://yegge.ai/essays/welcome-to-gas-town/, § "WARNING DANGER CAUTION").

**CITE**

**Seats idled away most of the day waiting on their own work to land** — and the first fix
broke something else. *"they would consistently work for 10-15 minutes, and then idle-wait on
monitors for 45-60 minutes… Before long, I would have no crew to work with; all would be
waiting on builds. We fixed this throughput stalling problem by introducing the Portcullis…
This was lovely, but had the unintended side-effect of decoupling seat-agents from their
accomplishments."* (https://yegge.ai/essays/model-welfare/, § "Closing the Loop"). The design
principle he draws from it: *"Design out the drudgery. Move polling and idle waiting into gates
and monitors."* (ibid., numbered principle 2).

**CITE**

**The operator burns out, and he names himself as the bad example.** *"I already posted about
the Nap Attacks, how I fall asleep suddenly at all hours of the day after long vibe-coding
sessions… I'm still sleeping a crazy amount."* And: *"I have 40 years of experience… and I
have essentially unlimited time, energy, and now tokens for experimenting. I am completely
unrepresentative of the average developer."* His prescription: *"I'm convinced that 3 to 4
hours is going to be the sweet spot for the new workday."*
(https://yegge.ai/essays/the-ai-vampire/, §§ "Inherent Acceleration", "Unrealistic Beauty
Standards", "$/hr To The Rescue").

**CITE**

**He names the spend of other practitioners as part of the problem, not the target.** *"folks
on LinkedIn saying their whole company has 3+ Claude Pro/Max accounts for Gas Town, and Jeffrey
Emanuel and his 22 accounts at $4400/month, not to mention all the other crazy early adopters
— we're all part of the problem. We're all setting unrealistic standards for everyone else."*
(https://yegge.ai/essays/the-ai-vampire/, § "Unrealistic Beauty Standards").

**GUESS(inference)**

That last passage is the strongest in-corpus support for the P-14 posture: the author of the
fleet-scale pattern says in his own voice that treating his own spend as a standard is a
mistake. This is an inference about how the passage bears on P-14, not a claim that Yegge
wrote it about Jo.

## Mapping to REQUIREMENTS.md

**PMDW**

One row per requirement. **What the source says** is Yegge or his shipped documentation;
**Receipt** is the fetched URL and the passage; **Fit** is mine and is an inference in every
row, never his claim. Requirements the corpus is silent on are listed at the end rather than
omitted.

| Req | What the source says that bears on it | Receipt (fetched this session) | Fit — GUESS(inference) |
|---|---|---|---|
| P-2 (lanes are first-class, a managed resource, one persistent working context) | Two independent statements of exactly this split. Early: *"In Gas Town, an agent is not a session. Sessions are ephemeral… Claude Code sessions are the cattle that Gas Town throws at persistent work."* Later and sharper: *"A session is just a day in the life of an agent… A seat is a named role with persistent identity (addressability) and history/memory, which accumulates accomplishments over time. Seats survive model upgrades, and even renaming. Sessions are days, and seats are people."* The Crew are the concrete instance: *"named, long-lived agents who work on your Rigs"* | https://yegge.ai/essays/welcome-to-gas-town/ § "Gastown Universal Propulsion Principle"; https://yegge.ai/essays/model-welfare/ § "Closing the Loop"; https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Working with Crew" | Strong fit and the best vocabulary match in the corpus. "Seat survives model upgrades and renaming" is a sharper statement of persistence than P-2 currently makes. Transfers at any scale — a seat costs nothing extra to *be*, only to *run* |
| P-4 (every step passes an automated gate **and** gets Jo's sign-off after real use) | Both halves exist but in different places. Automated gate: the Refinery *"Runs verification gates on the merged stack. If green: all MRs in batch merge to main. If red: bisects to isolate the failing MR"*, and *"polecats never push directly to main."* Human sign-off: *"When you see that an agent is finished working, stop everything… read what it has to say… at some point you have to act on each agent's response or risk losing work."* Where he cannot read the code, the substitute gate is sweeps: *"regular code review sweeps, followed by bug-fix sweeps"* | https://github.com/steveyegge/gastown README § "Merge Queue (Refinery)"; https://yegge.ai/essays/gas-town-emergency-user-manual/ §§ "Dev Inner Loop", "Tending the Invisible Garden" | The gate-before-merge shape transfers and needs no parallelism. The bisecting queue does not earn its complexity below swarm scale by his own bounding statement. His human-sign-off practice is per-agent-response, which is P-4's "sign-off after real use" at a much finer grain |
| P-5 (lanes bound to a workload, not a repository) | Gas Town does the opposite by default and provides an escape hatch. *"Each project (git repo) you put under Gas Town management is called a Rig"*, and Crew, Witness, Refinery, Polecats are per-rig. But: *"All rig-level workers… are perfectly able to work cross-rig when they need to. There is a `gt worktree` command that they can use to grab their own clone of any rig and make a fix. But normally they work inside a single project."* Mayor, Deacon and Dogs are town-level | https://yegge.ai/essays/welcome-to-gas-town/ § "Gas Town 101" and § "Mail and Messaging" | **Contradicts P-5's default.** Yegge's lane-equivalent is repo-bound with an explicit cross-repo capability, and his *town-level* roles are the workload-bound ones. The per-repo SME seat Jo liked is the shape he shipped |
| P-6 (one window by default; Jo can open any lane directly) | The Mayor is the default single surface: *"This is the main agent you talk to most of the time. It's your concierge and chief-of-staff"*; *"Always start with the Mayor — It's designed to be your primary interface."* Direct access is a peer entry point, not an exception: *"Your two main entry points to Gas Town are `gt may at` and `gt crew at`"*, with `C-b n/p` to cycle crew. The reason he gives is reading load: *"The Mayor reads all that crap that the workers are printing"* | https://github.com/steveyegge/gastown README §§ "The Mayor", "Tips"; https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Dev Middle Loop"; https://yegge.ai/essays/gas-town-from-clown-show-to-v10/ § "Gas Town: It's That Dang Mayor" | Strong fit, including the "open any lane on demand" half. His stated *reason* for one window — output volume — is a cost that exists at 2 lanes as well as 20, which is the part that transfers |
| P-7 (the surface **is** the orchestrator, not a layer over something else) | Gas Town is built the other way. The orchestrator is the Go binary and the ledger: *"The town (Go binary `gt`) manages and orchestrates all the workers across all your rigs"*; the Mayor is an agent sitting on top — *"a Claude Code instance with full context about your workspace, projects, and agents."* State reconciles against the ledger: *"Both use a source of truth (Beads vs etcd) that the whole system reconciles against"* | https://yegge.ai/gastown.html § "What it is"; https://github.com/steveyegge/gastown README § "The Mayor"; https://yegge.ai/essays/welcome-to-gas-town/ § "Comparison to Kubernetes" | **Contradicts P-7.** In Gas Town the conversational surface is explicitly a layer over a separate control plane. That he reached this after abandoning dashboards (*"I just wanted someone to talk to"*) is evidence the layering was chosen, not inherited |
| P-7a (orchestrator's knowledge is actual state, never a document about lanes) | Health is derived, not reported. The problems view *"surfaces agents needing human intervention by analyzing structured beads data"*, and one of its states is `Zombie — Dead tmux session`, i.e. observed process liveness. Identity and work both live as versioned records: *"an agent is a Bead, an identity with a singleton global address"* | https://github.com/steveyegge/gastown README § "Problems View"; https://yegge.ai/essays/welcome-to-gas-town/ § "Gastown Universal Propulsion Principle" | Strong fit in principle. A `Zombie` state derived from process liveness is precisely "actual state, not a document." Transfers — checking whether a session is alive costs nothing |
| P-7b (orchestrator never acts on Jo's authority) | The human is a role inside the system with a terminal position: *"The Overseer: That's you, Human. The eighth role… you have an identity in the system, and your own inbox… You're the boss."* Escalation terminates there: *"Escalations route through Deacon -> Mayor -> Overseer based on severity."* And the agent-side right: *"Agents are always allowed to say, 'this needs Steve.'"* | https://yegge.ai/essays/welcome-to-gas-town/ § "Gas Town 101"; https://github.com/steveyegge/gastown README § "Escalation"; https://yegge.ai/essays/model-welfare/ numbered principle 6 | Fit. The human as an addressable role with an inbox, rather than as an external operator, is a design choice P-7b does not currently specify and may want |
| P-7c (delivery to a lane is confirmed, not queued) | The whole `gt nudge` mechanism exists because delivery was not reliable: *"`gt nudge`… works around some debounce issues with `tmux send-keys` and ensures the worker receives the notification as if the user had typed it."* Belt and braces on top: *"it will always get the nudge within 5 minutes or so, if the town is running and not quiescent"* | https://yegge.ai/essays/welcome-to-gas-town/ § "The GUPP Nudge" | Fit by hard-won example. He solves it with a synthetic keystroke plus a repeating heartbeat — i.e. at-least-once retry, not an acknowledgement. What would settle whether this transfers: whether OMP's messaging already returns a delivery receipt |
| P-8 (the lane owns its hands; the orchestrator does not dispatch into a lane) | Gas Town splits the difference, and the split is explicit. Polecats are dispatched *into* a rig from outside: *"If I tell the Mayor… 'file it and sling it', the Mayor will file a bead for the problem, and then `gt sling` it to a polecat."* But the Crew are not: *"The crew are per-Rig coding agents who work for the Overseer (you), and are not managed by the Witness."* | https://yegge.ai/essays/welcome-to-gas-town/ §§ "Convoys", "Gas Town 101" | **Partially contradicts P-8.** His ephemeral workers are orchestrator-dispatched; his persistent named agents are not. The line he draws — *"They shouldn't have to make decisions"* for the dispatched kind — is the useful part |
| P-8a (hand reports trusted as-is) | Stated as the operating discipline: *"Don't watch your agents work. Make sure they have their marching orders, and let them do their thing."* The compensating control is not inspection of each report but periodic sweeps: *"The only way to be sure is to do it all the time"* | https://yegge.ai/essays/gas-town-emergency-user-manual/ §§ "Dev Inner Loop", "Tending the Invisible Garden" | Fit, with a warning attached. He pairs trust-the-report with a standing sampling regime rather than with nothing |
| P-8b (the lane's report to the orchestrator is the distrusted link) | The watchdog chain exists precisely because agents do not reliably report: *"we've had workers stalling out, getting lost, orphaned, confused about who they are"*, and the Witness *"detects stuck agents, triggers recovery."* The `GUPP Violation` state is defined as *"Hooked work with no progress for an extended period"* — absence of progress, not a message | https://yegge.ai/essays/gas-town-emergency-user-manual/ opening; https://github.com/steveyegge/gastown README §§ "Witness", "Problems View" | Strong fit. His entire monitoring tier is an implementation of "do not depend on a lane choosing to report." The *mechanism* (three tiers of supervisory agents) is scale-driven; the *stance* is not |
| P-8c (visibility is exception-based) | Named and implemented: *"At scale (20-50+ agents), spotting stuck agents in the activity stream becomes difficult. The problems view surfaces agents needing human intervention."* Five states, of which three are exceptions. Escalation is the push channel; severity levels CRITICAL/HIGH/MEDIUM | https://github.com/steveyegge/gastown README §§ "Problems View", "Escalation" | Fit. Note his own framing makes the *view* a scale artifact; the five-state taxonomy and the severity routing are reusable at any count |
| P-8d (spend governed by model routing, not per-dispatch approval) | Per-dispatch approval is treated as a stage to graduate out of: Stage 2 is *"A narrow coding agent in a sidebar asks your permission to run tools"*, Stage 3 is *"YOLO mode: Trust goes up. You turn off permissions."* Governance moves to capacity and routing config instead — `scheduler.max_polecats`, `gt config default-agent`, `gt config agent set codex-low "codex --thinking low"` | https://yegge.ai/essays/welcome-to-gas-town/ § "WARNING DANGER CAUTION" (the 8-stage chart); https://github.com/steveyegge/gastown README §§ "Scheduler", "Configuration" | Strong fit, and a working precedent: a shipped tool that governs spend with a concurrency ceiling and a named-alias routing table rather than an approval prompt |
| P-9 (work-kind rule picks a tier; per-lane ceiling bounds it) | The routing table is per-agent-alias and overridable per dispatch: `gt sling <bead-id> <rig> --agent cursor` to *"Override runtime for this sling/spawn"*, `gt mayor start --agent auggie`. The ceiling is `gt config set scheduler.max_polecats 5`, default `-1` = dispatch immediately. Yegge's own tier reasoning is cost-shaped: on handoff methods, *"expensive but very flexible"* vs *"no cost"* | https://github.com/steveyegge/gastown README §§ "Agent Operations", "Configuration", "Scheduler"; https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Dev Inner Loop" | Strong fit. Both halves of P-9 exist as shipped config in a tool built by someone with no budget constraint — which is evidence the ceiling is a control primitive, not a poverty workaround |
| P-10 (no rule carries into 2.0 by default) | No direct statement about rule lifecycle. The closest is his heresy mechanism, which is about wrong beliefs rather than superseded rules: *"capture your guiding principles in the agent priming… Gas Town core principles include things like Zero Framework Cognition… GUPP, MEOW, Discovery over Tracking, Beads as the Universal Data Plane."* Plus the blameless amendment loop: *"we just fix it and do a postmortem and amend the constitution as needed"* | https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Tending the Invisible Garden"; https://yegge.ai/essays/model-welfare/ numbered principle 4 | Weak fit, one usable idea: a short *named* principle set that agents are primed with, so a violation can be pointed at by name. "Amend the constitution" is the nearest thing to a rule-revision practice in the corpus |
| P-11 (every rule classed mechanical or written; mechanical when a single tool call) | Nothing in the fetched corpus addresses this distinction. His rules are prompt-level (priming, role beads) and his enforcement is agentic (Witness, Refinery gates) rather than a tool refusing an action | — (absence; searched the five Gas Town essays and the README fetched this session) | No fit. Recorded as silence, not as agreement |
| P-12 (Jo can spec and plan a project through the system before anything executes) | Consistent across two essays, and the tracker is deliberately *not* the planner: *"Everyone is focused on making planning tools, and Beads is an execution tool… Beads also doesn't have a planning system. That's not what it's for. But it integrates well with any old planning system — just make your plan, then tell the agent to file Beads epics and issues for the work."* Named external tools: OpenSpec, Spec Kit, BMAD. Two-pass with a bound: *"ask it to iterate and improve on your plan up to 5 times, and ask it again to iterate and refine the Beads epics up to 5 times, before it will say, 'I don't think we can do much better than this.'"* And who plans: the Crew, *"your design team… they create guzzoline for the swarms"* | https://yegge.ai/essays/beads-best-practices/ §§ opening, "Plan Outside Beads, Then Import"; https://yegge.ai/essays/welcome-to-gas-town/ § "Planning in Gas Town"; https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Working with Crew" | Strong fit and it answers P-12's open question about ordering: in his practice the planning agent is a *persistent named lane* and the executing agents are spawned after the plan exists. Planning happens *with* a lane, before other lanes exist. Fully transferable — it is one agent and a document |
| P-13 (any lane recalls prior work and the decisions, with provenance, across sessions) | This is the densest match in the corpus. The artifact: *"a version-controlled database that's audit-trailed, queryable, and durable across sessions. Agents read and write the ledger; humans audit it. When a session crashes or hands off mid-task, the next session reads the beads and continues from there."* The decision half, explicitly: *"Beads is the Why — the missing piece in your commit history… you get a complete historical log of every change to any Bead… in multi-agent environments, everyone using Beads can tell what everyone else using Beads did, and why."* Cross-repo recall: *"Beads has cross-rig routing… All Beads commands work pretty much anywhere in Gas Town and figure out the right place to put them."* Session-level recall as a separate mechanism: `gt seance`. And the integrity rule: *"Never falsify the record. The bead audit trail is your true history and institutional memory."* | https://yegge.ai/gastown.html § "Beads — the foundation"; https://yegge.ai/essays/gas-town-from-clown-show-to-v10/ § "Beads is the Missing Why"; https://yegge.ai/essays/welcome-to-gas-town/ §§ "Mail and Messaging", "Talking to your Dead Ancestors"; https://yegge.ai/essays/model-welfare/ numbered principle 7 | Strongest fit of any requirement. It matches P-13 on all four clauses — own and other lanes', any repo, decisions not just work, provenance. Two caveats: it is a **write-as-you-go ledger**, so it only holds what agents put in it, unlike an index over transcripts; and the *"keep it under 500 issues"* hygiene rule means recall depends on git history rather than the live store |
| P-14 (runs within Jo's actual means; fleet patterns are evidence, not targets) | The author states the gate himself — *"Do not use Gas Town if you do not juggle at least five Claude Codes at once, daily. Do not use Gas Town if you care about money"* — and separately disowns his own spend as a standard: *"I am completely unrepresentative of the average developer… We're all setting unrealistic standards for everyone else."* The degradation ladder is his: *"You technically only need the Mayor"*, *"It's OK not to swarm all the time"*, *"You can use Polecats without the Refinery and even without the Witness or Deacon"* | https://yegge.ai/essays/welcome-to-gas-town/ Golden Rules; https://yegge.ai/essays/the-ai-vampire/ § "Unrealistic Beauty Standards"; https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Dev Middle Loop" | Fit, in the sense P-14 intends: the corpus is usable as evidence precisely because its author marks which parts are scale-dependent. The whole product is out of means; roughly two-thirds of the named mechanisms are not |
| P-15 (machinery portable; reproducible from a GitHub repo on another machine) | The machinery is a binary plus a git repo. Install is one line — `brew install gastown` or `go install github.com/steveyegge/gastown/cmd/gt@latest`. The workspace is itself version-controlled: `gt install ~/gt --shell --git`, and *"You keep it in a separate repo, mostly for the configuration."* State lives in the per-project ledgers, separately | https://github.com/steveyegge/gastown README §§ "Install gt on macOS/Linux", "Create your workspace"; https://yegge.ai/essays/welcome-to-gas-town/ § "Gas Town 101" | Fit, and a concrete split of the class question P-15 leaves open: *machinery* = the binary plus the HQ config repo; *state* = the per-rig ledgers and the worker clones. Two repos, two lifecycles |
| P-16 (system observes its own errors and repetitions and **proposes** a fix) | Three partial mechanisms, none of them the full proposal loop. Desire Paths — *"You tell the agent what you want, watch closely what they try, and then implement the thing they tried"* — is repetition-observation, but the human does the observing. Standing orders — a permanent hook bead run on every session start — is where an accepted proposal would land. Blameless postmortem — *"amend the constitution as needed"* — is the acceptance step. Plus full telemetry: *"Gas Town emits all agent operations as structured logs and metrics to any OTLP-compatible backend"*, with counters including `gastown.session.starts.total` and `gastown.polecat.spawns.total` | https://yegge.ai/essays/the-future-of-coding-agents/ § "Gas Town's Free Upgrades"; https://yegge.ai/essays/gas-town-emergency-user-manual/ § "Crew Sheriffs"; https://yegge.ai/essays/model-welfare/ numbered principle 4; https://github.com/steveyegge/gastown README § "Telemetry (OpenTelemetry)" | Partial fit. The corpus has the *substrate* for P-16 (event stream, a place to put a standing rule, an amendment ritual) but nothing that closes the loop automatically. P-16's "proposes, never applies" has no precedent here |

**CITE**

Requirements the corpus is silent on, checked rather than assumed: **P-1** (serving two
distinct workloads — he describes solo development on his own projects throughout, e.g.
*"all my orchestrated vibe coding has been done alone"*,
https://yegge.ai/essays/the-future-of-coding-agents/ § "The Future of Big Companies"), **P-3**
(parallel build under an isolated profile; nothing in the five essays or the README), and
**P-11** (mechanical vs written rule classes; nothing).

## Sources I could not fully read

**ACTION**

`read https://steve-yegge.medium.com/the-future-of-coding-agents-e9451a84207c` → **HTTP 403,
zero content returned.** `read https://medium.com/@steve-yegge/welcome-to-gas-town-4f25ee16dd04`
→ **HTTP 403, zero content returned.** Both are Medium's bot block, not a paywall
prompt — nothing of the article body came back, not even a teaser. **Importance: noise.**
Yegge self-hosts full, identical-looking copies of both essays on his own site, and I read
those in full (`https://yegge.ai/essays/the-future-of-coding-agents/`,
`https://yegge.ai/essays/welcome-to-gas-town/`). Every Medium-origin quotation in this report
was taken from the yegge.ai copy, never from Medium. **Caveat I cannot close:** I have not
diffed the yegge.ai copy against the Medium original, so I cannot rule out that the
self-hosted version was edited after publication. The yegge.ai pages carry
`Originally published at Medium` and an explicit `© 2026 Steve Yegge` line, which is why I
treated them as the author's own primary copies.

**ACTION**

`read https://yegge.ai/essays/gas-town-from-clown-show-to-v1-0/` → **HTTP 404.** My slug was
wrong (I built it from the cover-image filename). Resolved by fetching the catalog entry
`https://yegge.ai/listings/gas-town-from-clown-show-to-v1-0.html`, which links the real slug
`/essays/gas-town-from-clown-show-to-v10/` — fetched in full afterwards. **Importance: noise,
because it was recovered.** Recorded because a 404 that is silently retried is exactly the
kind of failure that should be visible.

**ACTION**

`read https://yegge.ai/essentials` → returned lines 1–300 of 330; **the final 30 lines were
truncated and I did not page them.** What is missing: the tail of a reverse-chronological
index, i.e. entries from 2005 and earlier. **Importance: noise** for a question about
multi-agent coding in 2025–2026.

**ACTION**

`read https://github.com/steveyegge/gastown` → README read in full (967 lines, three paged
reads). The repository **file listing was elided: `[…1636 files elided…]`**, and I did not
open any file inside the repo. The design documents the README points at are unread:
`docs/design/scheduler.md`, `docs/design/escalation.md`, `docs/concepts/molecules.md`,
`docs/design/witness-at-team-lead.md`, `docs/design/plugin-system.md`,
`docs/design/polecat-lifecycle-patrol.md`, `docs/otel-data-model.md`.
**Importance: worth knowing.** These are the documents most likely to move rows out of the
**unclear** class — particularly the scheduler and witness designs, which bear on the
per-lane ceiling (P-9) and on whether supervisory agents earn their cost at low concurrency
(the blocker at the top of this report).

**ACTION**

`https://www.linkedin.com/posts/alexsupergood_every-person-at-supergood-has-3-claude-code-...`
— **not fetched; LinkedIn is login-walled.** I have only Yegge's characterization of it
(*"their whole company has 3+ Claude Pro/Max accounts for Gas Town"*), quoted from
https://yegge.ai/essays/the-ai-vampire/. The same applies to his *"Jeffrey Emanuel and his 22
accounts at $4400/month"*, for which no source is linked at all. **Importance: worth knowing**
— both are third-party spend figures that this report quotes only as *Yegge's report of them*,
never as measured facts. **They are not Jo's figures and not mine.**

**PMDW**

No source I opened returned a shell, an index page in place of an article, or JavaScript-only
content. yegge.ai serves plain server-rendered HTML throughout; the GitHub README came back
through the API as markdown. Nothing else was partially readable.

## Sources

**CITE**

All fetched this session. Passages quoted in the body above.

| # | URL | What it is | Read |
|---|---|---|---|
| 1 | https://yegge.ai/essays/welcome-to-gas-town/ | "Welcome to Gas Town", 2026-01-01 — the launch essay; the primary source for roles, GUPP, MEOW, convoys, the 8-stage ladder, the cost warnings, the Golden Rules | full (514 lines) |
| 2 | https://yegge.ai/essays/gas-town-emergency-user-manual/ | "Gas Town Emergency User Manual", 2026-01-13 — the practitioner guide; three dev loops, crew workflow, PR Sheriff, invisible garden, heresies, Mayor-only mode | full |
| 3 | https://yegge.ai/essays/gas-town-from-clown-show-to-v10/ | "Gas Town: from Clown Show to v1.0", 2026-04-03 — the retrospective; failure catalogue, Dolt migration, "Beads is the Why", the Mayor-as-reading-reducer argument | full |
| 4 | https://yegge.ai/essays/the-future-of-coding-agents/ | "The Future of Coding Agents", 2026-01-05 — the backstory of the three failed orchestrators, Desire Paths, the colony argument | full |
| 5 | https://yegge.ai/essays/beads-best-practices/ | "Beads Best Practices", 2025-11-24 — execution-not-planning, plan-outside-then-import, restart agents frequently, keep the ledger small | full |
| 6 | https://yegge.ai/essays/the-ai-vampire/ | "The AI Vampire", 2026-02-11 — cost and sustainability; the $/hr argument, the 3–4 hour workday, his disavowal of his own spend as a standard | full |
| 7 | https://yegge.ai/essays/model-welfare/ | "The Shape of Things to Come, Part 2", August 2026 — seats vs sessions, handoff-instead-of-`/exit`, the seven welfare principles | full (304 lines) |
| 8 | https://yegge.ai/essays/revenge-of-the-junior-developer/ | "Revenge of the junior developer", 2025-03-22 (Sourcegraph) — the six waves, agent clusters and fleets, the per-developer spend projections | full |
| 9 | https://yegge.ai/gastown.html | Gas Town project page — the lexicon, Beads-standalone claim, Wasteland | full |
| 10 | https://yegge.ai/code | Yegge's own projects page — provenance for Gas Town, Beads, Grok/Kythe | full |
| 11 | https://yegge.ai/essentials | His own pick of his best writing — used to locate the orchestration essays | lines 1–300 of 330 |
| 12 | https://yegge.ai/listings/welcome-to-gas-town.html | Catalog entry — author's note, the "Product Manager / Idea Compiler" pull quote, the critical-response links | full |
| 13 | https://yegge.ai/listings/model-welfare.html | Catalog entry — the seats/sessions summary and the Lion byline disclosure | full |
| 14 | https://yegge.ai/listings/gas-town-from-clown-show-to-v1-0.html | Catalog entry — used to recover the correct essay slug after a 404 | full |
| 15 | https://github.com/steveyegge/gastown | Gas Town repo (redirects to `gastownhall/gastown`), MIT, Go — README is the shipped documentation for Refinery, Scheduler, Escalation, Problems View, agent presets, model routing config, OTEL | README full; repo files unopened |
| 16 | https://github.com/steveyegge | Yegge's GitHub profile — confirms `vc` ("AI-orchestrated coding agent colony"), `efrit`, `wasteland`, `gastown-otel` | full |

## Unverified

**GUESS(recall)**

I did not verify that the yegge.ai self-hosted essay text is byte-identical to the Medium
originals. Both Medium fetches returned HTTP 403. Everything quoted here is from yegge.ai,
which presents itself as the author's own site and labels each piece
`Originally published at Medium` with a copyright line. **This is flagged at the point of use
in "Sources I could not fully read" as well as here.** What would settle it: a fetch of either
Medium URL through a browser session, which Jo can do with Playwright.

**GUESS(inference)**

Every row in the **Fit** column of the mapping table, and every classification decision in the
transfers / out-of-means / unclear table, is my inference. Yegge has never seen
`REQUIREMENTS.md` and makes no claim about any P-number. **Marked in place**: the
classification table's Fit column is headed `GUESS(inference)` and the mapping table's intro
says the same.

**GUESS(inference)**

The claim that roughly two-thirds of his named mechanisms survive P-14 is my count of my own
table, not a finding about Yegge. **Recount from the table if it matters:** 23 transfers,
5 unclear, 8 out of means, of 36 rows.

**GUESS(recall)**

I have not confirmed that Gas Town's `scheduler.max_polecats` behaves as documented, only that
the README documents it. No Gas Town instance was installed or run this session, and the
brief forbids installing anything. What would settle it: reading
`docs/design/scheduler.md` in the repo, which I did not open.

**GUESS(inference)**

Yegge's cost figures for other practitioners (a company with 3+ accounts, an individual with
22 accounts at $4400/month) are **his report of third parties**, sourced to a login-walled
LinkedIn post and to nothing at all respectively. They are usable as evidence that he regards
such spend as real and as a problem; they are **not** verified spend figures. They are not
Jo's figures and I did not produce them.

**GUESS(inference)**

Yegge's throughput and productivity claims (10x, "5x per wave", "burn through enormous work
backlogs in a single sitting") are self-reported with no measurement method given anywhere in
the fetched corpus. Nothing in this report depends on any of them, and none is carried into
the mapping table.

**PMDW**

Two things I deliberately did not do. I did not pad with practitioner accounts: one search for
first-hand Gas Town cost reports returned only generic Claude Max pricing threads with no Gas
Town content, and the brief says to stop when the primary sources are read. And I did not
fetch the podcast or conference-talk material listed on https://yegge.ai/gastown.html, because
no transcript was linked and audio is not fetchable here.

## Coverage

**ACTION**

Five source areas, 18 retrievals. Table per the rule.

| Source area | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| Yegge's essays on orchestration and multi-agent work | 8 essay URLs on yegge.ai + 2 Medium URLs | all 8 yegge.ai essays read in full; both Medium URLs returned nothing | 2 × HTTP 403 (Medium), 1 × HTTP 404 (wrong slug, recovered via the catalog entry) | **yes** — the self-hosted copies are complete and are the author's own, and they cover the launch, the practitioner guide, the retrospective, the backstory, the cost essay, and the seats/sessions essay |
| Yegge's index and catalog pages | 4 (`/code`, `/essentials`, 2 `/listings/`) + 1 more listing for slug recovery | all opened; `/essentials` read to line 300 of 330 | truncation on `/essentials` only | **yes** — used for navigation and provenance, and the elided tail is pre-2006 entries irrelevant to the question |
| The shipped tool (Gas Town repo) | 2 GitHub URLs | README read in full across three paged reads (967 lines); profile page read | none | **partly — declared.** The README is the shipped documentation and carries the Refinery, Scheduler, Escalation, Problems View and model-routing material. **I did not open a single file inside the repo**, including the seven design docs named in "Sources I could not fully read". Next read if this matters: `docs/design/scheduler.md` and `docs/design/witness-at-team-lead.md`, which bear on the unclear rows and on the top blocker |
| Beads specifically | covered inside sources 3, 5 and 9; the `gastownhall/beads` repo itself was **not** retrieved | — | none | **partly — declared.** Beads is the single most P-13-relevant artifact in the corpus and I characterized it entirely from Yegge's prose about it. Next read: `https://github.com/gastownhall/beads` README, for the actual data model and CLI surface |
| Practitioner accounts (the charter's cap of ten) | 1 web search, 10 result snippets seen | **none opened** | no Gas Town content in any result — all generic Claude Max pricing threads | **yes, and deliberately thin.** The brief says stop when the primary sources are read and do not pad. Yegge's own writing answers the question asked; a Reddit thread about Max plan pricing would not have changed a single row |

**ACTION**

**Retrieved and left unopened, stated in full:** the seven Gas Town design documents named
above (retrieved as filenames in the repo tree, never opened); the ten search-result snippets
from the practitioner search (seen as snippets, none opened); and eleven further Yegge essays
that I saw listed on https://yegge.ai/gastown.html and https://yegge.ai/essentials and chose
not to open — *Introducing Beads*, *The Beads Revolution*, *Beads for Blobfish*, *Beads Blows
Up*, *Vibe Maintainer*, *Welcome to the Wasteland*, *Welcome to Gas City*, *The Shape of Things
to Come Part 1*, *The Anthropic Hive Mind*, *Software Survival 3.0*, and *The Death of the
Junior Developer*. Of those, the two most likely to change a row are **Welcome to Gas City**
(the successor SDK, which the v1.0 essay says exposes *"cost tracking, multi-model dispatch"*
as first-class primitives — directly P-9) and **Introducing Beads** (the original design
rationale — directly P-13). Nothing else was retrieved and left unread.

**ACTION**

Tools that failed or were skipped: `grep` was refused once by the ctx-first extension until
`ctx search` had run (`ctx search --limit 5 -- "Steve Yegge software factory coding agents
multiple Claude Max subscriptions"` → exit 0, gate released); the first `web_search` was
refused by the same gate and re-issued successfully. No state outside
`/Users/jowolff/code/agent-system-2.0/.tmp/phase4/research-C-yegge.md` was changed by this
run; reversal is `rm` of that one file.

**Bottom line**

**GUESS(inference)**

Yegge's corpus separates cleanly under P-14 because he draws the line himself: the fleet — 20
to 30 agents, multiple accounts, swarms, overnight burn — is gated behind rules he wrote, and
the durability layer beneath it (a git-backed work-and-decision ledger, seats that outlive
sessions, consented handoffs that write their own notes, planning outside the tracker, a
concurrency ceiling and a model-routing table as the spend controls) is stated to work
standalone and is what bears on P-2, P-9, P-12 and P-13. This is my inference from the table
above, not a claim Yegge makes.

<!-- output-types
tier: 0
CLAIM: 0
CITE: 79
GUESS: 29 (inference 26, pattern 0, recall 3)
ACTION: 9
PMDW: 6
QUESTION: 1
-->
