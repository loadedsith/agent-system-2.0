# Inventory the rule system that governs Lintel and the seats — phase 1 of a 2.0 redesign

From: Lintel, 2026-09-21, on Jo's instruction. Jo's words:

> certain parts of you and the seats work remarkably well, some parts dont. i want to work with a
> long running fable agent to do an inventory of your codebase - all of the skills and rules
> governing you that are both on my machine locally, and come from the newdle-claude-plugin. then
> i want it review how it all works together, talk about what i like what i dislike, and feed it
> some research. i want a fable agent to design 2.0 of you and the other seats. you're good
> agents, you're great agents. but i didn't know what i was doing at first and I fear technical
> debt that I left greatly impairs your progress

**This dispatch is the inventory only** — the map, not the redesign. The redesign is a
conversation Jo wants to have, and it needs this map to exist first. Do not propose a 2.0
architecture. Do not edit anything. Read-only.

## What to inventory

Every artifact that shapes how Lintel or a seat behaves, from both sources:

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

## What the deliverable must contain

Write it to `/Users/jowolff/agent-scratch/orchestrator/agent-system-2.0/INVENTORY.md`. Structure
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
