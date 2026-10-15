# plugins/ — Jo's vendored plugins and their clash check

`plugins/i-have-audhd/` and `plugins/ask-graham/` are copies of the same directories in Jo's
jo-wolff-plugins repository, taken at the pin below and then owned by this repo, the way `skills/`
is (skills/VENDOR.md). Nothing tracks upstream on its own: a re-pin is a deliberate re-copy and
re-diff. Workload wl-mv8r90k9nci4qo (Jo, 2026-10-14: "add my i-have-audhd and ask-graham plugins
(jo-wolff-plugins main) to the as2 profile"); plan
`/Users/jowolff/agent-scratch/agent-system-2.0/wl-mv8r90k9nci4qo/PLAN.md`.

## Pin

| plugin | version | source | commit | copied |
|---|---|---|---|---|
| i-have-audhd | 1.2.0 | `git@github.com:thewolff/jo-wolff-plugins.git` `plugins/i-have-audhd/` | `c923617400c09aaba4c64da2ad7a4b7d331ab02a` (main, "i-have-audhd 1.2.0: warn findings reach the agent's next turn") | 2026-10-14 |
| ask-graham | 0.3.0 | same, `plugins/ask-graham/` | same | 2026-10-14 |

Re-pinned 2026-10-14 from `9b976d4` (i-have-audhd 1.0.0, ask-graham 0.2.0), at Jo's request that
the as2 profile run the versions Jo runs elsewhere. What the re-pin changed for the orchestrator
session: i-have-audhd's warn findings now reach the agent's next turn as a custom message (C7), and
ask-graham's verdicts are do it now, start now, later and don't build, with a Stop check that
blocks once when a turn read the skill and gave no `**Verdict:**` line (C12).

**Delta from upstream: the upstream `*.test.mjs` files are not copied.** They are node:test files
that run in jo-wolff-plugins' own CI; here `bun test` would pick them up. The test-only fixtures
they import (`plugins/ask-graham/fixtures/`, `plugins/i-have-audhd/triggers/fixtures/`) are copied
like every other file, with `test` manifest rows. Every other file is byte-identical to the pin, and
no file here carries an edit.

**Re-pin**, from the repo root:

```
git -C <jo-wolff-plugins checkout> fetch origin
rm -rf plugins/i-have-audhd plugins/ask-graham
git -C <jo-wolff-plugins checkout> archive <sha> plugins/i-have-audhd plugins/ask-graham | tar -x -C .
find plugins/i-have-audhd plugins/ask-graham -name '*.test.mjs' -delete
```

Then update the table above, the manifest rows for added or removed files, re-check the clash table
against the new adapters, and run `bun test plugins/test/loader.test.ts ledger/test/install.test.ts`
and `install/fresh-machine-test.sh`.

## How the profile loads them

- **Adapters.** `plugins/index.ts` is the one `extensions:` entry in profile/config.yml, last in
  the list. It calls the two OMP adapters (`plugins/i-have-audhd/omp/i-have-audhd-omp.ts`,
  `plugins/ask-graham/omp/ask-graham-omp.ts`) only when `AGENT_SYSTEM_ROLE=orchestrator`. That
  is Jo's `as2` session. Lanes (`AGENT_SYSTEM_ROLE=lane`) and hands (no role) load nothing from it.
  Each adapter finds its own files from its location (`omp/..`), so the vendored trees need no
  path edits.
- **Skills.** The plugin skills load in place: `skills.customDirectories` is `<repo>/skills`,
  `<repo>/plugins/ask-graham/skills` and `<repo>/plugins/i-have-audhd/skills`, and `includeSkills`
  names `ask-graham` and `i-have-audhd` beside the 22 in skills/. install/install.sh accepts a
  `skill` row at `plugins/<p>/skills/<n>/SKILL.md`, and refuses a render whose customDirectories
  is not `<repo>/skills` followed by each plugin skills dir that holds a `skill` row, or where two
  skill rows share a name.
- **Not the marketplace copies.** Marketplace registries are per profile
  (`OMP_PROFILE=agent-system-2 omp plugin marketplace list` printed "No marketplaces configured" on
  2026-10-14), but installed plugins are not: `omp plugin install` puts them in OMP's root plugin
  dir, `~/.omp/plugins`, which every profile loads from (pi-utils `dirs.ts` `getPluginsDir`). The
  install smoke on 2026-10-14 showed the agent-system-2 profile loading
  `~/.omp/plugins/node_modules/i-have-audhd/omp/i-have-audhd-omp.ts` and `…/ask-graham/omp/ask-graham-omp.ts`
  before surface/. profile/config.yml's `disabledExtensions` therefore names
  `extension-module:i-have-audhd-omp` and `extension-module:ask-graham-omp`, so as2 sessions run only
  this pinned copy, through `plugins/index.ts` (clash C11). A marketplace update of those two
  plugins does not reach as2: re-pin here instead. Two loaded copies would inject twice and check
  every stop twice (plugins/i-have-audhd/omp/REGISTRATION.md, "Do not combine this with the
  marketplace install").
- **State and settings stay Jo's.** i-have-audhd reads `~/.claude/i-have-audhd.json` and writes
  `~/.claude/.i-have-audhd-state/`. ask-graham reads `.ask-graham` in the working directory or
  any directory above it, then `${XDG_CONFIG_HOME:-~/.config}/ask-graham/config`. All are shared
  with Jo's other harnesses, and as2 writes none of them.

## Clash check

Checked against surface/, gates/, classifier/, voice/VOICE.md, contract/output-types.md and
tiers/orchestrator.md on 2026-10-14, and re-checked against the c923617 adapters the same day (C1,
C3, C4, C5, C7 updated; C12 added). Anchors are file plus symbol or heading.

| # | Clash | Evidence | Resolution |
|---|---|---|---|
| C1 | At intensity every-idea, ask-graham nudges every agent start: its `before_agent_start` handler fires once per direct prompt and once per dequeued batch of user messages, rpc prompts included (0.2.0 did the same on `input`). Lanes run as `omp --mode rpc`, so every lane runner prompt (first prompt and continue prompts) would get a "should we build X?" nudge. Jo's intensity is every-idea. | `plugins/ask-graham/omp/ask-graham-omp.ts` `askGrahamOmp` (`before_agent_start` handler); `surface/src/launch.ts` `laneArgv` (`--mode rpc`) | **resolved:** `plugins/index.ts` loads the adapters only in the orchestrator session. |
| C2 | i-have-audhd skips only subagent sessions, so a lane (a top-level session) would get the AuDHD core injected and have its replies to the orchestrator Stop-checked. | `plugins/i-have-audhd/omp/i-have-audhd-omp.ts` `sessionStartHandler` (`agent.kind === "sub"`) | **resolved:** the same role gate. |
| C3 | Order of `session_stop` results. The surface's wake (wake-read owed), gates rows 1, 3 and 7 all return blocks on the orchestrator, and OMP returns the first block. | OMP `extensibility/extensions/runner.ts` (session_stop: `if (stopResult.decision === "block") return`); `surface/extensions/wake.ts` and `gates/extensions/r01-turn-shape.ts`, `r03-receipts.ts`, `r07-wake-read.ts` `session_stop` handlers | **resolved:** `plugins/index.ts` loads last, so as2's blocks are seen first. Unarmed, i-have-audhd never blocks on OMP: the core caps every rule to warn. ask-graham 0.3.0 does block, once per turn (C12). |
| C4 | Arming. `enforcement.armOmp: true` in `~/.claude/i-have-audhd.json` lets i-have-audhd block on OMP. That file is shared by every harness, so arming it for another profile also arms the orchestrator. An armed block after row 1 passed would continue an orchestrator turn. | `plugins/i-have-audhd/omp/REGISTRATION.md` § Environment and profile | **raised to Jo** as a plan tradeoff, approved 2026-10-14: arming stays Jo's switch, and as2 neither sets nor overrides it. At the re-pin the file exists and sets every rule to `warn` with no `armOmp`, so the plugin is unarmed. |
| C5 | Overlap with as2's message shape. The i-have-audhd core (Needs you first, body, closing ask last, at most two open decisions, commands only when you can't run them) restates voice/VOICE.md and what gates row 1 enforces, with two differences: its "Closing ask" heading is not row 1's single **QUESTION** block, and it says nothing follows the closing ask, while VOICE.md puts the count line after it as a footer. | `plugins/i-have-audhd/skills/i-have-audhd/SKILL.md` inject span, item 3 "**Closing ask**" ("When present, it comes last and nothing follows it"); `voice/VOICE.md` "Message skeleton, same shape every turn" (count line as a footer); `gates/src/rows/r01-turn-shape.ts` (count-line footer exemption) | **resolved, as2 wins:** the order matches otherwise. Where they differ, the as2 rules win: the **QUESTION** block name and the count-line footer after it. The tier files and the contract sit in the system prompt, row 1 refuses a malformed turn whatever the inject says, and the plugin's Stop checks only warn, keyed on its own "Needs you" / "Closing ask" markers. Since 1.2.0 a warn finding reaches the agent's next turn (C7) instead of only the log, so a footer the plugin flags shows up as a notice the agent can ignore; row 1 still decides. |
| C6 | The output-types contract puts a QUESTION at the top of a report, while i-have-audhd puts the choice last. | `contract/output-types.md` § The receipt rule (QUESTION row); inject span "What the user must *know* goes first; what they must *choose* goes last" | **resolved, already settled:** voice/VOICE.md "One closing ask per message, and it goes last" puts the blocker (to know) at the top and the closing ask (to choose) last, which is the split i-have-audhd uses. |
| C7 | Hidden and queued messages against the surface's typed-input FIFO and the `input` handlers of gates rows 1 and 11. ask-graham 0.3.0 returns its nudge from `before_agent_start`; i-have-audhd 1.2.0 queues each warn finding for the next turn (`customType` `i-have-audhd-warning`, `display: true`) and shows a one-line UI notice. | `surface/extensions/surface-input.ts` (`input` handler; `before_agent_start` matches `event.prompt`); `gates/extensions/r11-jo-instruction.ts` `onInput(text, source)`; OMP `extensibility/extensions/runner.ts` `emitBeforeAgentStart` (each handler sees the same `prompt`; returned messages are collected); `plugins/i-have-audhd/omp/i-have-audhd-omp.ts` default export (`deliver`, `sendMessage` with `deliverAs: "nextTurn"`) | **resolved:** neither is an input. The nudge is a returned custom message and the warning is a custom message sent with `deliverAs: "nextTurn"`; neither raises an `input` event nor changes the prompt text `surface-input.ts` matches. |
| C8 | The classifier routes hands, which are subagents. Neither plugin has a `tool_call` or `task` handler. | Handler lists of both adapters | **no clash.** The fence order in profile/config.yml does not change, since the fence is a tool_call concern. |
| C9 | The inject tells the model to "Load the full `i-have-audhd` skill", and the as2 skill allowlist would hide that skill. | `profile/config.yml` `skills.includeSkills` | **resolved:** both plugin skills are listed and load from their plugin dirs. |
| C10 | Installer and discovery invariant: each includeSkills name must resolve under exactly one listed customDirectory, and discovery must find each skill at its manifest row's file. | `install/install.sh` § 2b (profile render); `install/fresh-machine-test.sh` step 3b (skill listing) | **resolved:** the render maps each `skill` row to its own dir and requires that dir to be listed. fresh-machine-test compares each discovered skill's file with its manifest row. |
| C11 | The marketplace copies Jo installed in the default profile (93c1a75, older than this pin) load into every as2 session, lanes included, because OMP's installed-plugin dir is root-level, not per profile. That makes C1/C2 live already, and with `plugins/index.ts` the orchestrator would load each plugin twice. | pi-utils `dirs.ts` `getPluginsDir` (`rootSubdir("plugins")`); install smoke extension listing (SMOKE.log, 2026-10-14) | **resolved:** profile/config.yml `disabledExtensions` lists both adapters' `extension-module:` names. OMP's `discoverExtensionPaths` skips discovered plugin extensions with those names and never filters configured paths. install/fresh-machine-test.sh step 3c seeds installed copies plus a control plugin and checks that only the control and `plugins/index.ts` load. Found after plan approval and recorded on the workload. |
| C12 | ask-graham 0.3.0's Stop check blocks the orchestrator once per turn when the turn read the ask-graham skill and its final text has no `**Verdict:**` line naming do it now, start now, later or don't build. That block continues an orchestrator turn after as2's rows passed, the C4 concern, but bounded to one continuation per turn and only on a turn that ran the skill. The verdict line is bold-prefixed prose, not a bare bold label, so row 1 reads it as body text. | `plugins/ask-graham/omp/ask-graham-omp.ts` `sessionStop` (`blockedOpener`, fail open); `plugins/ask-graham/skills/ask-graham/scripts/verdict.mjs` `checkStop`; `plugins/ask-graham/skills/ask-graham/SKILL.md` § 5 and its output shape (verdict line first); `gates/src/rows/r01-turn-shape.ts` `BLOCK_LABEL`, `plain` | **accepted with the re-pin:** the skill puts the verdict line first, which row 1 allows, and a reply that also carries a **QUESTION** keeps the QUESTION last. Loaded last (C3), so the continuation only runs once as2's own stop checks pass, and it re-enters them. |
