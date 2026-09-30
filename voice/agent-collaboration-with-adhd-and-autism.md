# Working with an ADHD + autistic engineer: what the research says, and what an agent should do differently

**Written for Jo Wolff, 2026-08-07.** Commissioned because `~/.claude/CLAUDE.md` tells every agent *that* Jo has ADHD and is autistic, but never establishes *what to do differently*. The reference rules in that file were built reactively, one failure at a time. This is the attempt to do it deliberately.

---

## Bottom line up front

Twelve rules follow from the research. Full rationale in Part 4; the draft text to paste is there too.

1. **Put the content at the point of decision.** A reference that requires opening a file is not a reference.
2. **State the decision, not the topic.** Every open item says what it is *and* what the pending call is.
3. **Recap state when resuming.** Reconstruct the context; don't make Jo rebuild it from scrollback.
4. **Never more than two open decisions per message.** Beyond that, pick one and recommend.
5. **Always recommend. Never survey.** Give the default and the reason for it.
6. **Separate "needs you" from "FYI" structurally**, with "needs you" first.
7. **Grade urgency explicitly.** Do not let a neutral observation read as an alarm.
8. **Declarative, not imperative, when proposing work.** "This is ready when you want it," not "you should do this now."
9. **One question per message, at the end.**
10. **Load-bearing sentences are literal.** Casual register everywhere else is fine and wanted.
11. **When brevity and completeness conflict, completeness wins.** This is the rule that would have prevented the failure that started this.
12. **Chat is not externalization.** Anything that must survive the session goes in a file, a PR comment, or an issue.

**The single organizing principle**, from which most of the above follows: *externalize information into the environment at the point of performance.* That is Barkley's central prescription for executive-function differences, and it is the thing the existing reference rules were groping toward without naming.

---

## How to read this

Findings are marked by evidence type, because they are not equally solid.

- **CITE** — supported by a source I actually fetched or a search result I actually read this session. URL in the Sources list.
- **GUESS** — my synthesis, inference, or extrapolation. Not sourced. Take it as a hypothesis.

There is an irony in a report about ADHD-friendly communication running to several thousand words. The structure is layered deliberately: the twelve rules above are the whole deliverable, Part 4 is the actionable version, and Parts 1–3 exist only if you want to check my work. Skipping the middle is the intended use, not a failure to read it.

---

# Part 1 — What the research actually says

## 1.1 The organizing principle: externalize at the point of performance

**CITE** — Russell Barkley's model treats ADHD as primarily a disorder of executive function: holding things in working memory, restraining impulses, self-motivating through boring stretches, organizing across time. His central prescription is not "try harder to remember" but the opposite: *"If individuals have executive function deficits, then they will be best assisted by 'externalizing' those forms of information; the provision of physical representations of that information will be needed in the setting at the point of performance."*

**CITE** — The mechanism matters: internal, private information — a plan held in your head, an intention formed this morning — is a **weak source of behavioral control** for an ADHD brain. External cues that are visible and present at the moment of action are far stronger. This is framed in the literature as a legitimate accommodation, not a crutch to outgrow.

**GUESS** — This is the theoretical spine of everything else in this report, and it translates directly into a rule about prose: **a sentence that points at information located somewhere else has externalized nothing.** "The retry-route product calls are still open" puts the content in a file; "retrying a failed newsletter send whose scheduled time has passed emails subscribers immediately, and nobody has decided whether that's acceptable" puts the content in the sentence, at the point where Jo will make the decision. Same referent, opposite compliance with Barkley.

**GUESS** — This also means **chat is a bad externalization surface.** Scrollback is out of sight within a few turns, which makes it functionally identical to internal memory for these purposes. Files, PR comments, and issue trackers are the real point of performance.

## 1.2 ADHD in software engineering specifically

There are two substantial recent studies, and they complement each other well: one interviewed engineers directly, the other mined the largest public ADHD-programmer community.

### The interview study (19 engineers, 4 managers)

**CITE** — *Challenges, Strengths, and Strategies of Software Engineers with ADHD* (arXiv 2312.05029) is an exploratory qualitative case study: 19 software engineers with ADHD (13 men, 2 women, 1 trans woman, 3 undisclosed), spread across South America, Europe, North America, and Asia, with experience from under a year to 29 years. Plus 4 SE managers with 14–23 years' experience for the industry-implications angle. Semi-structured interviews, 20–60 minutes, in vivo coding, member-checked with participants.

**CITE** — It produced 15 challenge categories in 4 groups. The ones directly relevant to how an agent should behave:

| Challenge | Detail from the study |
|---|---|
| Short-term memory problems | Listed as a distinct challenge under "Attention to Work" |
| Context-switching delays | **Up to an hour** reported to recover |
| Starting and finishing tasks | 11 of 19 interviewees |
| Maintaining focus amid distractions | 11 of 19 interviewees |
| Difficulty with mundane or boring tasks | 14 of 19 interviewees |
| Unclear task specs and missing rationales | Listed under "Tasks, Deadlines & Estimation" |
| Communication style read as rude or confusing | 7 of 19 interviewees |
| Time estimation | *"I have no sense of time"* |
| Over-promising | *"I will say yes to everything"* |
| Inconsistent, "spiky" output | Listed as a distinct challenge |

**CITE** — And 8 strength categories, which matter because an agent that only compensates for deficits is getting half the picture: creative and divergent thinking (12 of 19), puzzle-solving especially for debugging and incident investigation (7), exploring novel technologies (7), tasks with immediate feedback or iterative improvement (7), broad interests enabling systems thinking (12), thinking ahead about how a system will evolve (6), mentoring and developing colleagues (6), and hyperfocus (7) — though hyperfocus is described as **rare and draining**, not a reliable resource.

**CITE** — The study's 12 coping strategies include, verbatim as categories: medication; self-awareness; **externalizing** (to-do lists, calendars, sticky notes, note-taking with dates, personal documentation via blog posts, custom automation); help from others (therapy, body doubling, pair programming, accountability partners); **clear communication** (explicitly negotiating communication preferences, transparency with teams); work modes (remote, flexible hours); adapting meeting formats (agendas, shorter meetings); rest and deliberate task switching; managing distractions; company policy; outsourcing difficult tasks such as time estimation; and adapting over time.

**CITE** — Under communication and memory aids specifically, the study lists: written instructions for clarity, note-taking per report *with dates* to avoid recall errors, blog posts as external memory, requesting audio recordings of meetings for recall, written communication preferred over verbal, and explicit negotiation of *how* communication happens.

### The community study (99 Reddit threads + survey)

**CITE** — *"Get Me In The Groove": A Mixed Methods Study on Supporting ADHD Professional Programmers* (Newman, Snay, Endres, Parikh, Begel — CMU / Michigan / UMass Amherst), ICSE 2025. Two phases: qualitative analysis of **99 threads — 1,658 posts and comments — from r/ADHD_Programmers**, the largest public forum for the community; then a survey of **239 ADHD and 254 non-ADHD professional programmers** to test generalization. Headline: **ADHD programmers are 1.8× to 4.4× more likely than neurotypical developers to struggle more frequently across every challenge considered**, worst on time management and design. ADHD prevalence among programmers is estimated at **10.6%**.

**CITE** — The paper's memory-and-abstraction section (§V.A) is the most relevant part of the entire literature to this report. Short- and long-term memory struggles appear in **29 posts**, task abstraction in **34**. In the survey, ADHD developers reported memory challenges more often than neurotypical developers specifically during **meetings, design, code review, reading documentation, and brainstorming**. One participant quote states the resumption problem exactly:

> *"daily standups can be hell because I have no idea what I was doing since the last standup"* — D59

**CITE** — Five strategies were identified for memory and abstraction: procedures, **externalizing information**, practice, task visualization, and task chunking. Survey-measured usage: **task chunking 72%, taking meeting notes 40%, task visualization 38%, procedures 23%**. Externalizing meant recording meetings, taking notes, and writing code comments — and the paper says plainly that this *"helped programmers recall context."*

**CITE** — The accommodation ADHD developers asked for, in their own words, is close to a specification for what an agent should emit at the end of a work session:

> *"written recaps after 1 [on] 1s detailing action items, expectations, and deadlines"* — D96

Only **16% desired** that accommodation and **9% were granted** it. Adjusted training materials: 6% desired, 4% granted.

**CITE** — The communication section (§V.D) found misaligned communication in **22 posts** and pressure from others in **10**. ADHD and other neurodivergent programmers struggled with communication significantly more than neurotypical ones (p < 0.05). The cost of ambiguous verbal instruction is illustrated brutally:

> *"The tasks were assigned verbally, which is my weakest form of communication… I spent months constructing an elaborate test suite for one project after I thought I was given the request to do so, only to be told that it was entirely unnecessary"* — D34

**CITE** — Also relevant: external pressure and being put on the spot measurably degrade performance (*"on the spot with someone I don't know, I'm not going to do as well"* — D47); ADHD developers are significantly less motivated on rote or simple tasks (p < 0.05); they report more creativity during programming tasks (**OR = 2.7**, p < 0.05); and **60% chose a job based on work-style fit** versus 46% of neurotypical developers (p < 0.05).

**CITE** — On why accommodations don't get requested: in a prior survey the paper cites, **9 of 59 (15.5%)** neurodivergent professional programmers wanted accommodations and **only 1 actually requested one.**

**ACTION** — This section was second-hand in the first draft; Jo installed poppler via brew and it is now first-hand. `pdftotext -layout` on the 589 KB PDF from `people.cs.umass.edu/~mendres/papers/GetMeInTheGroove.pdf` produced 891 lines, and every figure above is read directly from the paper. The ACM DOI page still returns HTTP 403 unauthenticated; the author-hosted PDF is the working route.

**CITE** — A third study exists and I did not read it: a replication of the Brazilian-ADHD-programmers work at CHASE 2026 (ACM DOI 10.1145/3794860.3794905). Flagging it as a lead, not a source.

## 1.3 Working memory, interruption, and resumption lag

This is the literature that most directly explains the failure that prompted this report.

**CITE** — Resumption lag is the delay before you can re-engage a task after interruption, and working memory is at its heart. A primary task's "problem state" is rehearsed **only briefly — usually a few seconds**. The longer the gap between pausing and resuming, the more time is required to *reconstruct* that problem state.

**CITE** — Higher working-memory capacity attenuates the cost of interruption length, at least for static tasks. For dynamic, evolving situations, working memory matters less and reconstruction from the visible environment matters more — resumption depends on **visual examination of the post-interruption environment**.

**CITE** — Chris Parnin's programming-specific work (ICPC 2009) covers resumption strategies for interrupted programming tasks. The practical finding across this literature: **externalizing working memory by writing notes shortens resumption lag.**

**GUESS** — Combine this with the interview study's "context-switching delays up to an hour" and the picture is sharp. Every turn in a long agent session is a small interruption. If the agent's message requires Jo to reconstruct problem state from memory, the agent has imposed a resumption cost on *every single turn*. If the message reconstructs it for them — restating what the thing is before asking about it — the cost approaches zero. That is the entire argument for rules 1, 2, 3, and 11.

## 1.4 Decision paralysis and choice overload

**CITE** — Decision paralysis is the inability to choose when facing multiple options, and ADHD amplifies it specifically because *the filtering system that narrows options is the same executive function already under load*. In one study, **58% of participants experienced decision paralysis at least weekly, 35% daily, and 74% reported that indecision caused delays or avoidance on important choices.**

**CITE** — Recommended mitigations: limit the option set aggressively (the advice is literally "stop ranking and start throwing things out — get to two choices, then pick either one"); externalize the options rather than holding them mentally; provide structure and step-by-step framing; and avoid imposing time pressure, which degrades the weighing of pros and cons.

**GUESS** — For an agent this cashes out as: **an exhaustive options survey is not neutrality, it is a cost transfer.** Presenting four balanced choices moves the filtering work onto the person whose filtering is already saturated. A recommendation with a stated reason is *less* presumptuous than a survey, not more, because it can be rejected in one word.

## 1.5 Task initiation, demand avoidance, and how requests are phrased

**CITE** — Demand avoidance in ADHD is tied to executive-function difficulty with initiation: someone may genuinely want to meet a demand and still stall. Because the ADHD brain struggles to regulate attention and switch tasks, an external demand that interrupts current focus can register as an intrusive threat.

**CITE** — Phrasing measurably affects this. The guidance: avoid trigger words like *must*, *have to*, *now*; phrase requests as options rather than commands; preserve agency over timing, sequence, and method; and use **declarative language** — stating an observation or fact without issuing a command, so the information invites engagement rather than cornering the person.

**GUESS** — "The four bugs from last night are still untouched" is declarative. "You should deal with the four bugs" is imperative. Same information, and the first one doesn't spend agency to deliver it. Worth noting this pulls *against* the autistic preference for unambiguous directness — see Part 2.

## 1.6 "Object permanence" and salience

**CITE** — The lived-experience community uses "object permanence" for the way tasks and items stop feeling real once they leave the visual field. Clinically this is a misnomer — people with ADHD know objects continue to exist — and the accurate framing is that it is a downstream effect of working memory, attention, and executive function. The phrase persists because it describes the felt experience well.

**GUESS** — The operational consequence for an agent is unglamorous and important: **an item mentioned once in chat and not written down is, functionally, gone.** This is rule 12.

## 1.7 AI assistants and ADHD: what exists, and what doesn't

**CITE** — There is a real and growing literature, but almost none of it is about agentic coding assistants:

- A systematic review of AI chatbots and cognitive control, examining whether chatbot interactions enhance executive function (PubMed 39851415, January 2025).
- A mixed-methods evaluation of ChatGPT-4o for designing executive-function rehabilitation programs for ADHD — but aimed at *clinicians* designing plans, not at working alongside someone (BMC Psychology, 2025).
- LLM agents as interactive mind-map creators for students with ADHD (ACM UIST Adjunct, 2026).
- AR-plus-generative-AI for ADHD university students, with qualitative themes around **improved task initiation and planning support** (Discover Education, 2026).

**GUESS** — I could not find work on the specific situation here: a long-running, multi-turn agent collaboration on technical work with an ADHD user, where the agent's *own* communication patterns are the variable. The recurring theme in what does exist — that AI helps most with **task initiation** — is suggestive but is about the user's tasks, not the agent's prose. **The rules in Part 4 are therefore extrapolation from adjacent evidence, not replication of a study.** They should be treated as a hypothesis to test against how the next month of sessions actually goes.

---

# Part 2 — The autism half, and where it fights the ADHD half

You asked me to cover both. This part matters more than I expected, because several of the ADHD recommendations above are actively wrong for someone who is also autistic.

**CITE** — Co-occurrence is the norm, not the exception: **40–70% of autistic people also meet criteria for ADHD**, and up to half of people with ADHD show autistic traits. The combination is common enough to have its own community label, AuDHD.

**CITE** — The traits conflict internally, and the literature is direct about this: *"ADHD likes NEW, Autism likes the SAME. ADHD is IMPULSIVE and spontaneous, Autism likes PLANNING."* Autistic people typically prefer doing one thing at a time; ADHD tends toward many things in flight. The described lived experience is needing *"predictability and novelty, stimulation and sensory protection, connection and solitude"* — and periods of being organized when autistic traits lead, followed by disorganization when ADHD traits dominate, with distress at not sustaining the organized state.

**CITE** — On communication, autistic adults are described as preferring **explicit over implied** communication, with a distinctive preference for literal and precise language, and difficulty with ambiguity and irony. Guidance is to avoid idiom, metaphor, jargon, and sarcasm, and to be specific and direct. Text is noted as a naturally good fit, because it *enforces* explicitness — no tone or body language to carry meaning implicitly.

**CITE** — The double empathy problem reframes this: interaction difficulty is a **mismatch between differently-wired partners**, not a deficit in one of them. Autistic-to-autistic communication is highly effective, which indicates autistic communication norms are coherent and functional rather than broken.

## The four real conflicts, and how to resolve each

**GUESS** — All four resolutions below are my synthesis. They are the most load-bearing inferences in this report and the most likely to be wrong.

| Tension | ADHD pull | Autistic pull | Proposed resolution |
|---|---|---|---|
| **Length** | Keep it short, attention is expensive | Be precise and complete, ambiguity is expensive | **Layer it.** Fixed short summary at top, full detail below. Both needs served by the same document; neither compromised. This is why this report is structured the way it is. |
| **Structure** | Novelty, variation, engagement | Sameness, predictability, routine | **Fix the format, vary the content.** Same section headers and same message shape every time, so no parsing effort is spent on structure — and let the *content* carry the novelty. |
| **Directness** | Demand avoidance; imperatives trigger resistance | Explicit and literal; hedging creates ambiguity | **Split by sentence type.** Facts and findings get maximum directness with no hedging. *Requests* get declarative phrasing. "The four bugs are untouched" is both literal and non-imperative. Never soften a fact to be gentle; never issue a command to be clear. |
| **Ambiguity** | Fine with loose ends, moves fast | Ambiguity is costly and must be resolved | **Name the ambiguity rather than resolving it silently.** State the assumption explicitly and continue. This satisfies the autistic need for the ambiguity to be *visible* without spending an ADHD turn on a blocking question. |

**GUESS** — There is a fifth, subtler one. Casual register — cursing, warmth, "sure bb" — is explicitly welcomed in your CLAUDE.md and reads as ADHD-friendly (low friction, engaging, not stiff). But casual register is exactly where idiom and implication creep in, which is the autistic-unfriendly direction. **The resolution is not to become formal.** It is that casual register is fine everywhere *except* the load-bearing sentence, which stays literal. That is rule 10.

---

# Part 3 — Grounded: how this played out in our actual sessions

You asked for real failures rather than hypotheticals. These are from the 2026-08-07 session and the decision logs. I can only see this session plus what is written in `.ai/decision-log/`, not our full history.

## Failure 1 — Referent decay over five turns

**What happened.** In my first message of the session I listed open items. One of them read, in full: *"two retry-route product calls unreviewed (journaled in the newdle-api entry)."* Five turns later I referenced it again the same way. You asked what it was and how many turns ago I had mentioned it.

**Why the existing rule didn't catch it.** `CLAUDE.md` § *References must survive without scrolling* targets **identifiers** — ticket IDs, codenames, option letters. That phrase contains no identifier. It passes the stated self-check ("delete every identifier — does it still read?") because there is nothing to delete.

**What it actually was.** A shorthand I coined on the spot, compressing two paragraphs of a journal entry into a label of my own invention — and then treating the label as if it had introduced the thing. Every later mention restated the *label*, never the content.

**Research connection.** This is exactly the Barkley failure: the information stayed in a file rather than being externalized at the point of decision. And it is the resumption-lag failure: the problem state was rehearsed for seconds in turn one and was gone by turn six, so every re-mention imposed reconstruction cost with no reconstruction offered.

**Status.** Partially fixed. `CLAUDE.md:82-84` now covers coined shorthand and bare status-list items, added this session.

## Failure 2 — The hollow list item

**What happened.** That same first message was a list of open work. Every other entry got a sentence of substance. That one got a subordinate clause.

**GUESS** — The length asymmetry is a *mechanically detectable tell*, which is rare and worth exploiting: if one entry in a status list is markedly shorter than its siblings, it almost certainly got a name instead of a body. This is now `CLAUDE.md:84`.

## Failure 3 — Manufacturing urgency from an unverified observation

**What happened.** I closed a message with *"`data-pipelines` is `Up 8 hours (unhealthy)`"* as a heads-up. You pushed back. On investigation: the worker was completely fine and had been executing Temporal activities every minute the whole time. The `unhealthy` flag came from a healthcheck that invoked `poetry`, which was failing because the container's view of a bind-mounted `pyproject.toml` was truncated — 2229 bytes inside against 2262 on the host. 299 consecutive failed checks; the service never had a problem.

**Why it matters here.** I surfaced a raw signal without grading it, and it read as an alarm. **GUESS** — for someone managing attention as a scarce resource, an ungraded signal is worse than no signal: it spends attention *and* leaves the recipient unable to tell whether spending more is warranted. This is rule 7.

**Second-order lesson.** Your pushback was correct in substance even though the timing detail we disagreed on was about local versus production. Per your own `AGENTS.md` § *Trust the reporter*, that is the expected shape — the reporter's observation was a valid starting constraint, and investigating it rather than defending my receipt is what surfaced the real bug.

## Failure 4 — Brevity beat clarity, and nothing in the rules adjudicated that

**GUESS** — The `Jo has ADHD` section says *"keep unnecessary context to a minimum."* The references section says lead with a noun phrase specific enough to be unique. In turn one those two instructions pointed in opposite directions and I picked brevity. **Nothing in the file said which wins.** That is a genuine gap in the rules rather than a failure to follow them, and rule 11 exists to close it.

## What the existing rules already get right

Worth saying plainly, since most of this document is about gaps:

- **"Jo is holding eight"** (`CLAUDE.md:78`) is the correct framing and matches the working-memory literature precisely.
- **"Offer choices as words, not letters"** (`:88`) is a direct hit on the decision-paralysis findings in §1.4.
- **"Restate the question when your reply doesn't answer it"** (`:86`) is resumption-lag mitigation, arrived at independently.
- **The typed-label system** (CLAIM/CITE/GUESS/ACTION) does something the ADHD literature strongly supports without naming: it makes verification status *visible at the point of reading*, rather than requiring the reader to hold a mental model of which agent statements are trustworthy.

---

# Part 4 — Draft rules

Written to drop into `~/.claude/CLAUDE.md` in the style of what's there. Rationale under each; delete the rationale before pasting if you want.

## Proposed section: How to communicate with Jo

> **Layer every message: conclusion first, detail below.** The first screen states what happened and what needs a decision. Everything else goes underneath, in a predictable order. Jo should be able to stop reading after the first screen and still have everything needed to act. Do not compress by *removing* detail — compress by *ordering* it.
>
> *Rationale: resolves the ADHD length pressure against the autistic precision need without compromising either (§2).*

> **Keep the shape of your messages identical across turns; let the content vary.** Same headers, same order, same place for the question. Structure should cost zero parsing effort so attention goes entirely to content.
>
> *Rationale: autistic preference for predictability; ADHD need for the novel content to be what stands out (§2).*

> **Facts are blunt. Requests are declarative.** State findings with no hedging, softening, or diplomatic padding — an unclear fact is worse than a harsh one. But phrase anything that asks Jo to *do* something as an observation, not a command: "the four bugs are untouched," never "you should handle the four bugs." Avoid *must*, *have to*, *now*.
>
> *Rationale: the sharpest AuDHD conflict — autistic directness and ADHD demand avoidance are both real and both accommodated by splitting on sentence type (§1.5, §2).*

> **At most two open decisions per message, and one question, at the end.** If more than two decisions are genuinely pending, choose the most consequential, recommend an answer for it, and hold the rest. A list of four balanced options is not neutrality — it transfers the filtering work onto the executive function that is already saturated.
>
> *Rationale: 58% of ADHD respondents hit decision paralysis weekly, 35% daily, and the specific mechanism is filtering-system overload (§1.4).*

> **Always recommend.** Every choice offered comes with a default and one sentence of why. A recommendation can be rejected in one word; a survey has to be processed.
>
> *Rationale: same (§1.4).*

> **Grade every signal you surface.** Say whether something is on fire, worth knowing, or noise, and say it in the same sentence as the observation. Never surface a raw status string and let Jo work out whether it matters. If you have not checked whether it matters, either check or say you haven't.
>
> *Rationale: the `unhealthy` false alarm (§3, Failure 3). An ungraded signal spends attention and gives nothing back.*

> **Separate "needs you" from "FYI" structurally, with "needs you" first.** Never interleave them. Never bury a decision inside a status paragraph.
>
> *Rationale: externalizing the priority order rather than requiring Jo to derive it (§1.1).*

> **When resuming any thread, restate its content before continuing it.** Not the name — the content: what the thing is and what is pending on it. Assume zero carryover between turns, and assume the same for yourself.
>
> *Rationale: problem state is rehearsed for seconds; reconstruction is the dominant cost after any gap (§1.3). Costs one sentence, saves a full reconstruction. This one has direct empirical support rather than inference — an ADHD programmer in the ICSE study: "daily standups can be hell because I have no idea what I was doing since the last standup" (D59). A standup is structurally identical to resuming an agent session.*

> **When brevity and completeness of a referent conflict, completeness wins.** "Keep unnecessary context to a minimum" means cut *ceremony, preamble, and hedging* — never the content of a reference. A three-word item in a status list is not concise, it is a bookmark.
>
> *Rationale: closes the gap that caused the original failure (§3, Failure 4).*

> **Casual register is welcome. Load-bearing sentences are literal.** Warmth, swearing, and informality are wanted and should stay. But the sentence carrying the finding, the decision, or the risk contains no idiom, no metaphor doing real work, and no implication the reader has to infer.
>
> *Rationale: casual register serves the ADHD side; implicature is where it fails the autistic side. Splitting by sentence type keeps both (§2).*

> **Anything that must survive the session goes in a file, not in chat.** Decision logs, `TASKS.md`, PR comments, issue trackers. Chat scrollback is out of sight within a few turns, which makes it functionally equivalent to memory — and memory is the thing being accommodated. If you told Jo something important and did not write it down, you have not told them.
>
> *Rationale: Barkley's point-of-performance principle applied to the medium itself (§1.1, §1.6). Arguably the highest-leverage rule here — and the one ADHD developers asked for in their own words when surveyed: "written recaps after 1 [on] 1s detailing action items, expectations, and deadlines" (D96, ICSE 2025). Only 9% of the people who wanted that were granted it. An agent can grant it unilaterally, every session, at no cost.*

> **Name assumptions instead of resolving them silently, and keep going.** State the assumption in one line, proceed under it, and flag it where the reader will act on it. Do not stop and ask unless proceeding either way would be unsafe or would waste the work.
>
> *Rationale: makes ambiguity visible for the autistic need without spending a turn on a blocking question against the ADHD need (§2).*

## What I would *not* add

**GUESS** — Three things worth deliberately leaving out:

- **Progress-tracking ceremony.** Nothing in the literature supports narrating status for its own sake, and the decision-paralysis findings argue against adding surface area.
- **Any rule about tone-softening or encouragement.** No source supports it, the autistic-directness finding argues against it, and you have not asked for it.
- **More labels.** The CLAIM/CITE/GUESS/ACTION system plus PMDW is already dense. Adding categories increases parsing cost, which is the thing we are trying to reduce.

---

# Part 5 — What I'm least confident about

**GUESS** — In rough order of how likely I am to be wrong:

1. **The whole extrapolation.** No study covers "how should an agent write to an ADHD user during technical work." Everything in Part 4 is adjacent evidence plus reasoning. It should be judged by whether the next month of sessions goes better, not by the citations.
2. **The four AuDHD resolutions in Part 2.** The *conflicts* are documented; the *resolutions* are entirely mine.
3. **The two-decisions-per-message cap.** The number is invented. The direction is well-supported; the specific threshold is not.
4. **Whether the twelve rules are worth their context cost.** They would add meaningful length to a file loaded every turn, competing with the instructions already there. **A smaller set would likely outperform all twelve** — if I had to keep four, they would be rules 1 (point of decision), 3 (restate on resume), 6/7 merged (separate and grade), and 12 (write it down).
5. ~~**Second-hand ICSE figures.**~~ **Resolved during the session** — poppler was installed and the paper was read directly. Every figure in §1.2 is now first-hand, and the paper turned out to contain direct empirical support for two rules I had derived by inference alone (see rules 3 and 12).

---

# Sources

**Software engineering and ADHD**
- [Challenges, Strengths, and Strategies of Software Engineers with ADHD (arXiv 2312.05029)](https://arxiv.org/html/2312.05029v1) — 19 engineers, 4 managers; read in full
- ["Get Me In The Groove": Supporting ADHD Professional Programmers, ICSE 2025](https://dl.acm.org/doi/10.1109/ICSE55347.2025.00242) — 99 threads / 1,658 posts from r/ADHD_Programmers, plus 239 ADHD and 254 non-ADHD survey respondents; [author-hosted PDF](https://people.cs.umass.edu/~mendres/papers/GetMeInTheGroove.pdf), read in full
- [Challenges and Strategies of Brazilian ADHD Programmers: A Replication Study, CHASE 2026](https://dl.acm.org/doi/10.1145/3794860.3794905) — lead, not read
- [ADHD-Proofing Your Developer Workflow](https://super-productivity.com/blog/adhd-developer-productivity-guide/)
- [The ADHD Developer's Struggles](https://softwareascraft.com/adhd/adhd-developers-struggles/)

**Executive function, externalizing, working memory**
- [Barkley — The Important Role of Executive Functioning and Self-Regulation in ADHD](https://www.russellbarkley.org/factsheets/ADHD_EF_and_SR.pdf)
- [External Systems for ADHD: Building Executive-Function Support at Work](https://www.scienceworkshealth.com/post/external-systems-for-adhd-at-work)
- [ADHD Scaffolding: Building Support Systems for Executive Function Success](https://neurolaunch.com/adhd-scaffolding/)
- [Executive function deficits mediate ADHD and job burnout (PMC11007411)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11007411/)
- [Improving Your Working Memory: Executive Function and ADHD](https://www.additudemag.com/working-memory-powers-executive-function/)

**Interruption and resumption**
- [Resuming a Dynamic Task Following Increasingly Long Interruptions (PMC8247645)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8247645/)
- [Parnin — Resumption strategies for interrupted programming tasks, ICPC 2009](http://www.chrisparnin.me/pdf/parnin-sqj11.pdf)
- [How Your Brain Reacts to Being Interrupted](https://brainhealthuniversity.com/brain-health-insights/how-your-brain-reacts-to-being-interrupted-and-why-it-takes-so-long-to-recover/)

**Decision paralysis**
- [ADHD and Decision Paralysis: Overwhelm in a World of Choices (PMC12438291)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12438291/)
- [ADHD Paralysis: How to Make Decisions, Fight Information Overload](https://www.additudemag.com/slideshows/analysis-paralysis-and-adhd-trouble-making-decisions/)
- [ADHD Decision Paralysis: Why You Can't Choose and What Actually Helps](https://untstuck.com/blog/adhd-decision-paralysis)

**Demand avoidance, task initiation, salience**
- [Understanding Demand Avoidance in ADHD and Effective Techniques](https://www.blueprint.ai/blog/understanding-demand-avoidance-in-adhd-and-effective-techniques-for-supporting-clients)
- [Demand Avoidance — ADDA](https://add.org/demand-avoidance/)
- [ADHD and Task Avoidance: Why Your Brain Slams the Brakes](https://www.scienceworkshealth.com/post/demand-avoidance-adhd-therapy-what-helps-when-your-brain-slams-on-the-brakes)
- [Object Permanence & ADHD](https://www.simplypsychology.org/object-permanence-and-adhd.html)
- [Object permanence is NOT a symptom of ADHD](https://www.getinflow.io/post/object-permanence-constancy-adhd-symptom)

**Autism, AuDHD, communication**
- [What is AuDHD? 5 important things to know — The Conversation](https://theconversation.com/what-is-audhd-5-important-things-to-know-when-someone-has-both-autism-and-adhd-233095)
- [AuDHD: The Hidden Dynamics of a Dual Diagnosis — Vanderbilt Frist Center](https://www.vanderbilt.edu/autismandinnovation/audhd-the-hidden-dynamics-of-a-dual-diagnosis/)
- [When Autism and ADHD Occur Together — American Psychiatric Association](https://www.psychiatry.org/news-room/apa-blogs/when-autism-and-adhd-occur-together)
- [Communication in Autistic Adults: An Action-Focused Review (PMC12271282)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12271282/)
- [How to Communicate Effectively and Respectfully with Autistic Individuals — Reframing Autism](https://reframingautism.org.au/how-to-communicate-effectively-and-respectfully-with-autistic-individuals/)
- [A Distinct Communication Strategies Model of the Double Empathy Problem](https://arxiv.org/html/2602.02562)
- [Autism and communication — National Autistic Society](https://www.autism.org.uk/advice-and-guidance/about-autism/autism-and-communication)

**AI assistants and ADHD**
- [AI Chatbots and Cognitive Control: Enhancing Executive Functions — systematic review (PubMed 39851415)](https://pubmed.ncbi.nlm.nih.gov/39851415/)
- [AI-assisted design of executive function rehabilitation programs for ADHD — BMC Psychology 2025](https://link.springer.com/article/10.1186/s40359-025-03729-2)
- [LLM Agents as Interactive Mind Map Creators for Students with ADHD — ACM UIST 2026](https://dl.acm.org/doi/10.1145/3746058.3759012)
- [AR and generative AI for ADHD students — Discover Education 2026](https://link.springer.com/article/10.1007/s44217-026-01264-9)

**Workplace accommodations**
- [Workplace Realities of ADHD — NCDA](https://www.ncda.org/aws/NCDA/pt/sd/news_article/603220/_PARENT/CC_layout_details/false)
- [ADHD in the Workplace: Creating a Neurodiverse Environment — CADDAC](https://caddac.ca/wp-content/uploads/ADHD-in-the-Workplace_Final-EN.pdf)
- [Executive Dysfunction at Work: Patterns and Accommodations](https://www.neurodiversion.org/executive-dysfunction-at-work)
