# Inventory the rule system that governs the Marches — phase 1 of a 2.0 redesign

From: Lintel, 2026-09-21, on Jo's instruction. Jo's words:

> certain parts of you and the seats work remarkably well, some parts dont. i want to work with a
> long running fable agent to do an inventory of your codebase - all of the skills and rules
> governing you that are both on my machine locally, and come from the newdle-claude-plugin. then
> i want it review how it all works together, talk about what i like what i dislike, and feed it
> some research. i want a fable agent to design 2.0 of you and the other seats. you're good
> agents, you're great agents. but i didn't know what i was doing at first and I fear technical
> debt that I left greatly impairs your progress

**The subject is the whole three-tier arrangement, not Lintel.** Jo widened the scope on
2026-09-21: *"i don't want plumb's scope to be just a 2.0 for lintel - i want it to be for the
entire persistent seat/hand/march situation that we have. it's a big scope i know."* So inventory
what governs **every tier** — Lintel as the coordination layer, the persistent seats rooted one
per repository, and the transient hands they dispatch — plus the machinery that constitutes the
arrangement itself: seat birth and chartering, the seven registration surfaces, launching, waking,
addressing, shutdown, routing between tiers, hand briefing and reporting, and what state persists
where. Lintel's charter is one artifact in that system, not the system.

⛔ **The hand tier is the one that will be under-evidenced, and leaving it thin is the failure to
avoid.** Hands are defined by agent definitions (mostly in the plugin) and by the briefs that
dispatch them; they leave receipts but no durable record of their own. Where the evidence for a
tier is absent, **that absence is a finding** — report it as one rather than narrowing the map to
the tiers that document themselves well.

**This dispatch is the inventory only** — the map, not the redesign. The redesign is a
conversation Jo wants to have, and it needs this map to exist first. Do not propose a 2.0
architecture. Do not edit anything. Read-only.

## What to inventory

Every artifact that shapes how Lintel, a seat, or a hand behaves, from both sources:

**Local, on this machine**
- `/Users/jowolff/.claude/CLAUDE.md` — the global rules
- `/Users/jowolff/.claude/orchestrator/` — Lintel's charter, `state/`, `runbooks/`, `hooks/`,
  `contracts/`, `evals/`
- `/Users/jowolff/.claude/skills/` and any other local skill directories
- `/Users/jowolff/.claude/agents/` — local agent definitions
- `/Users/jowolff/.claude/settings.json` and `settings.local.json` — permissions, hook
  registrations
- `/Users/jowolff/.omp/agent/` — the seat launcher, extensions, seat charters and memory documents
  wherever they live, the persistent-seat contract
- Each seat's own charter and memory document inside its home repository (the seat table is in
  `/Users/jowolff/.claude/orchestrator/state/ROUTING.md`; these files are untracked, excluded via
  `.git/info/exclude`, so they will not show in `git ls-files`)

**From the plugin**
- The `newdle` plugin as installed:
  `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/` — its skills, agents,
  hooks, and `references/`
- Its source repository if it is checked out locally
- `/Users/jowolff/code/jo-wolff-plugins/` — Jo's own plugins, including `communication-rules`

**Every artifact in the map carries which tier(s) it governs** — Lintel, seat, hand, or more than
one. That column is what makes the map a map of the Marches rather than a file listing, and it is
where the interesting finding lives: an artifact that governs one tier while reading as though it
governs all of them, and a tier with nothing governing it at all.

**Tier-specific things not to miss, because they are easy to walk past:**
- **Seat lifecycle machinery** — `/Users/jowolff/.claude/skills/new-seat/` (how a seat is born and
  chartered), the launcher and its test in `/Users/jowolff/.omp/agent/seat-launchers/`, the
  persistent-seat contract and registry extension, the `seat-shutdown` skill, and the seven
  registration surfaces. These govern the seat tier as a tier, not any one seat.
- **Hand-tier governing text** — the plugin's `agents/` definitions and the `references/` files
  those definitions load, since a hand's rules arrive through its agent definition rather than
  through any charter. Note for each hand type which references it loads: a rule that reaches a
  seat but not a hand is precisely the finding phase 2 is looking for.
- **The dispatch surfaces themselves** — whatever a brief is required to contain, wherever that is
  stated, and whatever validates a returned report.

## Jo's own document — read it first, use it as a checklist

`/Users/jowolff/code/agent-system-2.0/JO-INPUT.md` is Jo's brainstorm, verbatim. The charter section
`## JO-INPUT.md` governs how it may be used; the short form is **coverage checklist, never
evidence**, and **do not quote or argue with it in `INVENTORY.md`**. Three consequences bind this
phase directly:

1. **Plugin provenance is a required column on every artifact.** Jo: *"I am FINE with uninstalling
   the newdle-claude-plugin. In fact assume that at the end of this I will."* So for each artifact
   record whether it is plugin-shipped, local, or OMP-side, **and what stops working if the plugin
   is removed**. The hand tier is the exposed one — hand types are plugin agent definitions loading
   plugin `references/` — so trace that dependency precisely rather than in summary. This is the
   most consequential structural fact in Jo's document.
2. **Record what is portable and what is machine-specific**, per artifact, while you are already
   reading it. Jo wants the machinery reinstallable on a fresh machine from a repository they own,
   so an absolute path to `/Users/jowolff/...`, a hardcoded seat name, or a dependency on this
   machine's directory layout is a portability fact worth capturing at inventory time — cheap now,
   expensive to re-derive later. Do not judge whether portability is worth it; just record it.
3. **OMP compatibility is a fact to record, not an assumption.** Jo: *"EVERYTHING MUST work with
   OMP."* Where an artifact assumes the Claude CLI's mechanisms (`CLAUDE.md` auto-loading,
   `claude agents`, Claude-era hook registration) rather than OMP's, say so with a receipt.

**Discharge Jo's "Things that I'm Unsure of" list as an explicit checklist.** At the time of
writing it holds two items — whether multiple persistent named seats are an advantage or just
extra hops, and whether seats should be divided per repository or built around capabilities
(a frontend seat, a database seat). Read the list in the file rather than trusting this sentence;
it may have grown. These are answerable factually in part: how many hops a request actually takes,
what each seat holds that a general agent would not, what breaks when a seat is absent, what the
per-seat reading cost is. **Answer what evidence can answer and say plainly what only Jo can
decide.** Report each item at phase end as answered-with-receipt or still-open-and-why.

## Known terrain — locations and owners, handed over so you do not rediscover them

Jo's call, 2026-09-21: the seat is primed with the **map**, never with a verdict. Everything in
this section is where-things-are and who-owns-them. **None of it says whether anything is good** —
that judgment is yours to form from the evidence, and Jo's to give in phase 3.

- `/Users/jowolff/.claude` — owned by the seat **Tinker**. A git repository.
- `/Users/jowolff/.omp` — also **Tinker's**. ⛔ **Not a git repository**, so there is no history to
  read and no `git` command will tell you when anything there changed; convention on this machine
  is a timestamped `*.pre-<change>-<stamp>` sibling copy before an edit, and those copies are on
  disk next to the files they back up.
- The `newdle` plugin — source repository `/Users/jowolff/code/shipyard/repos/newdle-claude-plugins`,
  owned by the seat **Sedge**; the **installed** copy is the version-cache directory named above.
  Those are two different artifacts and can differ. The cache holds several versions side by side;
  resolve the live one by `sort -V`, never lexicographically (`0.2.171` ranks above `0.2.98` only
  under `-V`).
- `/Users/jowolff/code/shipyard` — the workspace, owned by the seat **Verge**; its `AGENTS.md` is
  the workspace rules file every session in that tree loads.
- Each seat's charter and memory: `<seat home>/.ai/<slug>-seat-charter.md` and
  `-seat-memory.md`, listed in that repository's `.git/info/exclude`. Untracked by design, so
  `git ls-files` will not show them and neither will a GitHub view of the repo.
- The seat roster and the launcher live in `/Users/jowolff/.omp/agent/seat-launchers/launch-seat`
  and `/Users/jowolff/.omp/agent/persistent-seats.json`. **Adding a seat touches seven surfaces**,
  enumerated at `/Users/jowolff/.claude/orchestrator/state/ROUTING.md:222-256`; the guard against
  two of those rosters diverging is a test,
  `/Users/jowolff/.omp/agent/seat-launchers/queue-seat-message.test.ts`. That rule is itself an
  inventory item — read it, do not take this sentence as the receipt.
- Your own repository, `/Users/jowolff/code/agent-system-2.0`, is in the inventory's scope too.

## Historical evidence you may and should read

Jo's call, same conversation. Three record types on this machine say **what was tried and what it
cost**, which is the sharpest available evidence on which rules were written against a real failure
and which were written on a hunch:

- `/Users/jowolff/.claude/orchestrator/state/RETRACTIONS.md` — recorded incorrect claims and their
  corrections.
- `/Users/jowolff/.claude/orchestrator/state/EXPERIMENTS.md` — pre-registered machinery changes,
  their measurement windows, and their verdicts.
- The `.ai/decision-log/` directories in every repository, which are committed and readable.

⛔ **Read these as history, not as authority. They record what was tried and what it cost, never
what is correct.** A rule that traces to a logged incident is a rule with evidence behind it, and
that is a fact worth putting in the map; whether the rule is the *right* response to that incident
is a phase 3 and phase 5 question and not yours to answer here. Where an artifact in the map traces
to one of these records, cite the record by absolute path — that provenance is one of the most
useful columns you can produce.

## What the deliverable must contain

Write it to `/Users/jowolff/code/agent-system-2.0/INVENTORY.md`. Structure
it so a person can read one section and act, rather than having to hold the whole thing.

1. **The map.** Every artifact: what it is, where it lives, which source ships it, and what it
   claims authority over. Group by function — identity and charter, communication rules, routing
   and delegation, evidence and output types, verification and hooks, skills, state.
2. **The authority graph.** What overrides what, as stated by the documents themselves. Where the
   precedence is explicit, quote it. **Where two documents both claim final say on the same
   question, say so — that is a finding, not a formatting problem.**
3. **What actually loads, versus what merely exists.** This is the most valuable column and the
   easiest to get wrong. For each artifact: is it registered in a settings file, loaded by a hook,
   read by an agent definition, or pointed at by a skill — with the receipt. **A rule nobody loads
   is not a rule, and Jo needs to know which ones those are.**
4. **Duplication.** The same rule stated in more than one place, with the wordings diffed. Note
   where copies have already drifted apart, and which copy is canonical (some divergences are
   deliberate and say so in the text; preserve that distinction).
5. **Dead and orphaned material.** Skills never invoked, hooks registered against events that do
   not fire, agents nobody spawns, state files nothing reads, runbooks describing retired systems.
   Where you can establish non-use with evidence, do. Where you cannot, say the evidence is absent
   rather than guessing.
6. **Size and reading cost.** How many words and tokens a seat must load at session start before
   it does any work, broken down by source. Measure it; do not estimate.
7. **What works.** Not only defects. Name the parts that are coherent, load-bearing, and worth
   preserving through a rewrite — a redesign that discards those is worse than no redesign.

## Evidence standard

Absolute `file:line` for every claim about what a document says or does. Where you infer that
something is unused or unloaded, mark it a GUESS and name what would settle it.

**Do not editorialize about quality yet.** Jo will bring their own likes and dislikes to the next
phase, and a map pre-loaded with your opinions will steer that conversation before it starts. The
honest exception is factual dysfunction — a contradiction, a dead loader, a drifted copy — which
is a finding and belongs in the map.

## Labeling contract

Label every statement as CLAIM, CITE, GUESS, ACTION, or QUESTION, at the point of the statement.
Block-leading labels alone on their own line in markdown bold; content on the next line. Never
ANSI escapes. CLAIM needs an inspectable receipt. GUESS is the label for anything without one,
however confident. Mark conversational passages with the literal text `PMDW`. Blockers and
questions at the top. End with the output-types envelope.
