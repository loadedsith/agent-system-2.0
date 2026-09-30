---
date: 2026-09-30T14:57-07:00
engineer: Ilex
session: wl-muomzp90cvo268
status: resolved
durable: false
supersedes:
workload: wl-muomzp90cvo268
---

# Jo: "in tiers/orchestrator.md, narrow when the orchestrator reads the ledger. Today it calls orchestrator_ledger on every Jo message, even a one-word answer like "approve"; the rule at "Reading state between wakes" already says only asks about state need it. Make it explicit: call orchestrator_ledger only when Jo asks about state; after applying or recording an answer, the surface's "Applied from the surface" line is the receipt and no read follows; open a reply with needs-you only when the surface injected fresh needs-you lines this turn. Tier text only, no code. Done when the file says this, the surface tests that pin tier text (if any) pass, and the change is on a branch with a PR." Jo asked for this change to the system's own rules, so it carries Jo's authority (P-7b item 4). Overlap: the open workload-ceiling workload (wl-muolz8qtp6ylfk) will also add one line to tiers/orchestrator.md (its lowering tool) — keep edits to the § "Reading state between wakes" region so either side rebases trivially.

done: tiers/orchestrator.md states that the orchestrator calls orchestrator_ledger only when Jo asks about state, that after applying or recording an answer the surface's "Applied from the surface" line is the receipt and no read follows, and that a reply opens with needs-you only when the surface injected fresh needs-you lines that turn; any surface tests pinning tier text pass; the change is on a branch with a PR.
done-because: tiers/orchestrator.md § Reading state between wakes (commit 112d39e) now says four things. orchestrator_ledger is called only when Jo asks about state. After an answer is applied or recorded, the surface's "Applied from the surface" line is the receipt (or the record tool's result, for a row the orchestrator wrote) and no read follows. A reply opens with needs-you only when the surface injected needs-you lines that turn. No test pins orchestrator tier text; the tier-adjacent suites pass 220/0. The change is on branch wl/wl-muomzp90cvo268 with PR https://github.com/thewolff/agent-system-2.0/pull/3, unmerged; Jo integrates.

Rendered from the ledger by Ilex (they/them) at workload close; stakes normal, mode autonomous, opened 2026-09-30T21:48:05.652Z.

## What changed

- sl-ledger-read-narrow: Rewrite tiers/orchestrator.md § "Reading state between wakes" to state three rules: orchestrator_ledger only on a state ask; after an applied or recorded answer the receipt is already in hand ("Applied from the surface" line) and no read follows; a reply opens with needs-you only when the surface injected needs-you lines that turn — artifact: Commit 112d39e on wl/wl-muomzp90cvo268, rebased onto origin/main (already up to date) and pushed. PR https://github.com/thewolff/agent-system-2.0/pull/3. tiers/orchestrator.md § Reading state between wakes now states all three rules. Tier-adjacent tests: bun test gates/test/manifest-sync.test.ts gates/test/ledger-rows.test.ts gates/test/message-rows.test.ts gates/test/r15-orchestrator-role.test.ts surface/test/extension.test.ts → 220 pass, 0 fail. The declared bun test surface gates run gave 1986 pass, 47 fail; every failure comes from nesting inside the lane's OS fence (entry en-muonavfst71d6o), and no test reads this file.

## Decisions made (and why)

- assumption (orchestrator-surface): brief-judged: change-small confidence 0.95 judge typesafe/jev-1.13.0
- assumption (lane-muomzp90cvo268-1, sl-ledger-read-narrow): artifact-command: bun test surface gates
- assumption (lane-muomzp90cvo268-1, sl-ledger-read-narrow): Decision: bun test surface gates was run inside this lane's OS fence and gave 1986 pass, 47 fail. Every failure comes from nesting in the fence: fence tests running sandbox-exec exit 71, lane-script/lane-smoke hit "EPERM posix_spawn 'ps'" and a ledger mountLocality error under /private/var/folders. No test reads tiers/orchestrator.md (grep over surface/, gates/test, install/, classifier/test). The tier-related suites pass: manifest-sync, ledger-rows, message-rows, r15-orchestrator-role, and surface extension.test.ts (220 pass, 0 fail). The 47 failures are not caused by the diff, which touches only tiers/orchestrator.md. Wording choice: Jo's rule names the "Applied from the surface" line as the receipt. That line exists only for words the surface applied (surface/extensions/surface-input.ts:53), so the text also names the orchestrator_record_instruction tool result as the receipt when the orchestrator wrote the row itself.

## Dead ends — don't retry these

- none

## Heads-up for whoever touches this next

- message msg-muonbrl27ip5vk [held] not acted on: Finding: a lane cannot run the full `bun test surface gates` inside its own OS fence. The run gave 1986 pass and 47 fail. The failures are all nesting effects: fence.test.ts runs a nested Seatbelt that exits 71, lane-script/lane-smoke fail spawning `ps` with EPERM, and the ledger mountLocality check rejects /private/var/folders. The declared artifact therefore recorded one failure on sl-ledger-read-narrow even though the diff is tier text only. The tier-adjacent suites pass (220/0). PR #3 is ready for Jo to integrate. Suggest a follow-up so these suites skip or adapt when they already run under the fence, otherwise every lane's full-suite artifact will read as failed.
