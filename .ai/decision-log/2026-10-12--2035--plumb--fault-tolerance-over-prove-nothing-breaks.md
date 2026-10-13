---
date: 2026-10-12T20:35-07:00
engineer: plumb
session: Post-restart triage; Jo's ruling on "prove nothing breaks"
status: open
---

## Needs a human, at the top

- Whether this becomes a standing as2 rule (SPEC-2.0.md amendment) is Jo's call. Today it is
  applied to one workload only: clean-shell (wl-mv5lrh0drbg0zk).

## Jo's words (2026-10-12, about 20:33 PDT, to Plumb)

> "......prove that nothing breaks is insane. this entire process has been an experience in
> prove everything can break, instead of prove nothing breaks wouldnt it be better if we find
> a fault tolerance?"

Plumb asked whether the clean-shell lane should drop its "prove nothing breaks" step for a
fault-tolerant rollout (ship behind a switch, turn on for one lane, switch off on breakage).
Jo: "YES".

## What prompted it

- Clean-shell's brief, step 3: "prove nothing in normal lane work breaks: the full suite, a
  real omp lane session doing ordinary git/bun/gh work, and the guard-replay"
  (`sqlite3 -readonly ~/.agent-system-2/ledger.db "select brief from workloads where id='wl-mv5lrh0drbg0zk'"`).
- That proof's `shell-start-child.ts` (pid 49146) reached 18 GB footprint (`footprint -p`)
  and swap reached 334 MB free (`sysctl vm.swapusage`); Plumb killed it at about 20:25 PDT.
  Four `guard-replay.ts` processes (~3.5 GB each) exited on their own shortly after.
- The review-tier plan is on review round 8 (Ilex, 03:07Z: "Plan review rounds 6 and 7 each
  found one blocking issue").

## Proposed rule (Plumb's wording, for Jo to accept, change or drop)

as2 changes ship fault-tolerant by default: behind a switch, enabled on one lane first,
cheap and loud on failure (memory caps, timeouts), reversible with one word. Exhaustive
"prove nothing breaks" verification is kept only where a mistake cannot be undone: ledger
integrity and anything that lets an agent act with Jo's authority.

## Research and Jo's response (about 20:45 PDT)

A research hand checked the rule against practitioner sources
(`~/agent-scratch/agent-system-2.0/fault-tolerance-research/REPORT.md`). It found the rule is
mainstream practice and proposed two additions:

1. Every switched-on change carries a named signal that says whether it is working. Fault
   tolerance catches crashes; LLM work mostly fails by being quietly wrong. Source: Google
   SRE workbook, canarying releases.
2. Retry and review rounds get hard caps that escalate to Jo. The two exceptions are
   protected by a hard boundary the agent cannot cross without Jo, not by a longer review
   loop. Source: OpenAI's practical guide to building agents.

Jo: "i do love thoe 2 additions". Jo also said: "standing rules are great but nothing matters if
it isnt backed by machinery my dude". So the rule ships as machinery in a workload, not as a
prose standing rule. Status stays open until that workload exists.
