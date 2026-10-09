---
date: 2026-10-08
engineer: plumb
session: as2 watch, 2026-10-08 afternoon
status: open — one dated obligation (the restart bundle) carried here
---

# Restart bundle pending; communication-rules adapter loaded warn-only; paired-coding plugin shareable

## OBLIGATION, due 2026-10-09 evening PDT at the latest <!-- as2-restart-bundle-2026-10-09 -->

Jo asked that this not get lost (2026-10-08 ~17:15 PDT). Three things only reach omp processes started after them, so they are bundled into one restart:

1. `omp update` 18.8.5 → 18.8.6 (available; held because lanes were mid-build).
2. The communication-rules OMP adapter, symlinked into `~/.omp/agent/extensions/communication-rules-omp.ts` at 17:01 PDT (warn-only; new lanes already load it).
3. Restart as2 (Ilex) and the Plumb seat.

Steps are at `/Users/jowolff/agent-scratch/agent-system-2.0/PENDING-STEPS.md`. Plumb's wake-up rule: on every wake, and once per day in a reply, restate this obligation until the file's top section is marked done. Trigger for "quiet": item 24 (test runner), the eval-gate build, and the PR #22 red fix have all landed; failing that, the deadline above wins.

## What changed today

- OMP 18.4.4 → 18.8.5; host pin bumped to 18.8 (`gates/src/host.ts`), on main as `484d47f` after a rebase onto Jo's merge of PR #18 (local main had been behind, so Jo's push was refused once).
- Paired-coding PR #2 (`thewolff/jo-wolff-plugins`) merged by Jo at `5bd52c1`. By-hand `/branch` spot-check passed (`agent-scratch/agent-system-2.0/paired-coding/JOINT-TEST.md`, last section). Public install route proven on Claude Code 2.1.292 and OMP 18.8.5 under a throwaway HOME: `agent-scratch/jo-wolff-plugins/install-test/REPORT.md`. Verdict: shareable as-is. Two cosmetic notes for Tinker: OMP "skill description compression failed" warning; README could add the `claude plugin install` CLI form.
- Communication-rules OMP adapter proven beside newdle-hooks in 7 scratch sessions (`agent-scratch/jo-wolff-plugins/comm-rules-omp-test/REPORT.md`): safe warn-only. Two blockers before arming, both for Tinker: an armed block drops the output-types nudge for that turn (OMP runner returns first block only); the needs-you-first rule flags a `**PMDW**` line before `## Needs you`.
- PR #22 (item 40) is red at 51bf854: `surface/test/lane-script.test.ts` N2 "D6 recovery" fails alone and in the suite. Jo's earlier green had already closed item 40, so Ilex opened `wl-mv049108m8whds` (normal stakes) for the fix; plan rev 4 approved by Jo. Cause per the plan: runner's session_shutdown writes `lane-died` when a receipt completes with a slice open. PR #22 must not merge before this lands.
- Hand-launched omps on this machine run without the newdle hooks: "Failed to load extension newdle-hooks.ts: Set NEWDLE_PLUGIN_ROOT" (seat launcher exports it; shells don't). Not fixed; newdle territory.

## Dead ends

- Jo's first pair-test prompt found nothing to do because the trial repo's HEAD already contained the shout commit; `h2.sh` only resets the working tree, not to a named commit. Fix pending.

## Heads-up for the next session

- Pending Ilex answers at time of writing were handed to Jo: approve q-mv04zw30g5cq2o, approve en-mv070njrcg09hc, approve en-mv06h7mx58cjk0, deny en-mv05urf3g5qsjk.
- MIGRATION.md items 58–64 are uncommitted in the checkout; commit when no review hand runs.
