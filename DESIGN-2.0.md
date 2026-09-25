# DESIGN-2.0 — keep / change / drop over 1.x, as ruled by Jo

The disposition ledger for Session C of Phase 5 (`briefs/phase5.md` § Session C; P-10, P-18).
One row per governing artifact in `INVENTORY.md` § 1, in the batch order Jo set: C2, C4, C3,
C5, C6, C1, C7, C8. Default disposition is **drop unless argued for**, except C4, which is a
re-homing pass under P-23 (SPEC § B15).

Every dispositioned row carries: **disposition** (keep / change / drop), **enforcement**
(P-11: mechanical — which tool call or message gate refuses it — or written), **mode** (P-22:
autonomous / user-driven / both), **portability** (SPEC § B8: portable repo, identical on every
machine, or OMP-specific extension/profile setting), and **Jo's words**. Sections beyond the
disposition ledger (taxonomy, machinery/state boundary, mechanical-rule list, tier structure)
are written after the pass, from the rows.

Opened 2026-09-24 (Jo: *"sure let's do it"*, *"to session c"*).

**Standing constraint, Jo 2026-09-24:** *"the plugin will only be gone for me - others will
still use it."* P-18's "2.0 does not depend on the plugin" is Jo-local: a plugin-shipped
artifact dropped from 2.0 still exists for teammates, so dropping it implies no shipyard step;
re-homing one creates a second copy that will drift from the plugin's, accepted per row.

## C2 · Communication rules (`INVENTORY.md` § 1.2, 7 rows) — governing requirement P-24

| # | artifact | disposition | enforcement | mode | portability | Jo's words / justification |
|---|---|---|---|---|---|---|
| C2.1 | `/Users/jowolff/.claude/CLAUDE.md` (global rules file, 8,592 words) | **change — split** (ruled 2026-09-24) | voice: written; turn shape (one ask per turn, script not bare command, needs-you first / closing ask last): **mechanical** at the P-23 message-leaving-an-agent gate (SPEC § B16 item 3) | user-driven | portable repo: one Jo-facing voice document (§ How to communicate with Jo, § References must survive without scrolling, § Commands you hand to Jo, pronouns, thumbs-up, fold-in-the-cheese, HTML template), loaded by the profile template | Jo: *"split as recommended"*. Output-types sections → C4 (P-23). § Time-intensive work goes to a subagent, § Subagent output is the source of truth → C3. YAML-bracket and MCP-401 notes → **drop** (machine-local incident notes). Nothing stays at `~/.claude/CLAUDE.md` (P-18). |
| C2.2 | `/Users/jowolff/.claude/AGENTS.md` (second ~8k-word rules file, untracked) | **drop** (ruled 2026-09-24) | — | — | — | Jo: *"drop as dead, make sure there's a backup"*. Dead: no OMP loader (`INVENTORY.md:343`, `:502`), no document names it (`:455`), 21 hunks drifted, contradicts `CLAUDE.md` on two rules. **Backup taken 2026-09-24:** `research/1x-snapshots/dot-claude-AGENTS.md`, byte-identical (sha256 `4478ea52…e2b3`, 292 lines). `MIGRATION.md`: the removal step (Tinker's surface) re-verifies the sha before deleting. |
| C2.3 | `/Users/jowolff/.claude/CLAUDE.md.2026-08-07-current.bak`, `.2026-08-07-pre-comms-rules.bak` | **drop** (ruled 2026-09-24) | — | — | — | Jo: *"let's go with your recco"*. Seven-week-old copies of a git-tracked file; a `.bak` beside a rules file is the P-15 drift pattern. **Snapshots taken 2026-09-24:** `research/1x-snapshots/dot-claude-CLAUDE.md.2026-08-07-current.bak` (sha256 `0b488f4d…a7ee`), `…pre-comms-rules.bak` (`a52d855f…3a47`), both byte-identical. Removal at migration re-verifies the shas (Tinker's surface). |
| C2.4 | `/Users/jowolff/code/jo-wolff-plugins/plugins/communication-rules/` (Jo's published plugin: inject/stop hooks, three checks, judge, OMP adapter) | **drop** (ruled 2026-09-24) | the rule it enforced is C2.1's mechanical turn-shape gate; the three check scripts (`checks/needs-you-first.mjs`, `closing-ask-last.mjs`, `name-the-artifact.mjs`) are **reference input** for that gate's build, verified at install per P-11 — not carried as code | user-driven | — (gate lives in the portable repo, OMP-native per P-19) | Jo: *"following your recco"* after *"is it more trouble than it's worth?"*. Never installed, unregistered, warn-only (`INVENTORY.md:88`, `:456`, `:526`); enforced an 8-rule subset that differed from the loaded set. Testing the scripts now was declined: P-11 verifies the gate at build time regardless. `judge/ask.mjs` held with P-23's judge layer (SPEC § B15 item 6). |
| C2.5 | `/Users/jowolff/code/shipyard/AGENTS.md` (shipyard workspace rules, 6,290 words) | **keep — outside 2.0's hands** (ruled 2026-09-24) | written (the workspace's own rules; 2.0 neither re-homes nor edits it) | both | repo state, not machinery; loaded natively by OMP's `AGENTS.md` chain, including past nested repo roots (`INVENTORY.md:358-359`) | Jo: *"sounds like keep as is is easier"*. Not plugin-shipped, not machine-local, so P-18 does not reach it. Notes, not rulings: where it overlaps C2.1's voice document (Ask clarifying questions, Before multi-step work, Trust the reporter), the voice document governs turns addressed to Jo and this file governs work in the repo; a conflict is a proposal to the shipyard owner. Its 9,647-token cost per nested session is OMP walker behaviour — a ceiling/C7 observation. |
| C2.6 | plugin `skills/humanizer` (5,107 words), `skills/newdle-voice` (444 words) | **split** (ruled 2026-09-24): `humanizer` **re-home**; `newdle-voice` **drop from 2.0** | written (a skill, invoked as the last edit on customer-facing text; `shipyard/AGENTS.md:223` names it by role and tolerates its absence) | both | `humanizer`: portable repo — forks from the plugin copy, drift accepted and noted (cf. `INVENTORY.md:548`). `newdle-voice`: stays plugin-shipped for the team; not in 2.0's manifest; no shipyard step | Jo: *"yes to all"* after *"the plugin will only be gone for me - others will still use it"*. P-15 line: how any lane writes (machinery) vs what one product sounds like (product content). |
| C2.7 | `/Users/jowolff/Desktop/agent-collaboration-with-adhd-and-autism.md` (evidence file behind § How to communicate with Jo) | open | | | | |

## Mechanical-rule list (P-11) — filled from the rows

| rule | trigger (tool call or message gate) | source row |
|---|---|---|
| turn shape to Jo: one ask/QUESTION per turn; a command handed to Jo is a script path, never bare; needs-you block first, closing ask last | message leaving an agent, addressed to Jo (P-23 gate) — refused, not warned | C2.1 |
