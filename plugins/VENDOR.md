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
| i-have-audhd | 1.0.0 | `git@github.com:thewolff/jo-wolff-plugins.git` `plugins/i-have-audhd/` | `9b976d405cca80218dc8c328ba9917859ad29208` (main, merge of PR #16) | 2026-10-14 |
| ask-graham | 0.2.0 | same, `plugins/ask-graham/` | same | 2026-10-14 |

The pin is main after the PR #13 fixes (a7424fc is an ancestor of it), newer than the 93c1a75 that
Jo's default OMP profile got from the marketplace on 2026-10-14.

**Delta from upstream: the upstream `*.test.mjs` files are not copied.** They are node:test files
that run in jo-wolff-plugins' own CI; here `bun test` would pick them up. Every other file is
byte-identical to the pin, and no file here carries an edit.

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
- **Not the marketplace.** The agent-system-2 profile has its own plugin directory:
  `OMP_PROFILE=agent-system-2 omp plugin marketplace list` printed "No marketplaces configured" on
  2026-10-14, while the default profile listed jo-wolff-plugins. So this entry cannot double-load
  with the marketplace install in Jo's default profile. Do not also run `omp plugin install` under
  the agent-system-2 profile. Two loaded copies inject twice and check every stop twice
  (plugins/i-have-audhd/omp/REGISTRATION.md, "Do not combine this with the marketplace install").
- **State and settings stay Jo's.** i-have-audhd reads `~/.claude/i-have-audhd.json` and writes
  `~/.claude/.i-have-audhd-state/`. ask-graham reads `.ask-graham` in the working directory or
  any directory above it, then `${XDG_CONFIG_HOME:-~/.config}/ask-graham/config`. All are shared
  with Jo's other harnesses, and as2 writes none of them.

## Clash check

Checked against surface/, gates/, classifier/, voice/VOICE.md, contract/output-types.md and
tiers/orchestrator.md on 2026-10-14. Anchors are file plus symbol or heading.

| # | Clash | Evidence | Resolution |
|---|---|---|---|
| C1 | At intensity every-idea, ask-graham nudges every `input` whose source is `interactive` or `rpc`. Lanes run as `omp --mode rpc`, so every lane runner prompt (first prompt and continue prompts) would get a "should we build X?" nudge. Jo's intensity is every-idea. | `plugins/ask-graham/omp/ask-graham-omp.ts` `askGrahamOmp` (`input` handler); `surface/src/launch.ts` `laneArgv` (`--mode rpc`) | **resolved:** `plugins/index.ts` loads the adapters only in the orchestrator session. |
| C2 | i-have-audhd skips only subagent sessions, so a lane (a top-level session) would get the AuDHD core injected and have its replies to the orchestrator Stop-checked. | `plugins/i-have-audhd/omp/i-have-audhd-omp.ts` `sessionStartHandler` (`agent.kind === "sub"`) | **resolved:** the same role gate. |
| C3 | Order of `session_stop` results. The surface's wake (wake-read owed), gates rows 1, 3 and 7 all return blocks on the orchestrator, and OMP returns the first block. | OMP `extensibility/extensions/runner.ts` (session_stop: `if (stopResult.decision === "block") return`); `surface/extensions/wake.ts` and `gates/extensions/r01-turn-shape.ts`, `r03-receipts.ts`, `r07-wake-read.ts` `session_stop` handlers | **resolved:** `plugins/index.ts` loads last, so as2's blocks are seen first. Unarmed, i-have-audhd never blocks on OMP: the core caps every rule to warn. |
| C4 | Arming. `enforcement.armOmp: true` in `~/.claude/i-have-audhd.json` lets i-have-audhd block on OMP. That file is shared by every harness, so arming it for another profile also arms the orchestrator. An armed block after row 1 passed would continue an orchestrator turn. | `plugins/i-have-audhd/omp/REGISTRATION.md` § Environment and profile | **raised to Jo** as a plan tradeoff, approved 2026-10-14: arming stays Jo's switch, and as2 neither sets nor overrides it. The file does not exist today, so the plugin is unarmed. |
| C5 | Overlap with as2's message shape. The i-have-audhd core (Needs you first, body, closing ask last, at most two open decisions, commands only when you can't run them) restates voice/VOICE.md and what gates row 1 enforces. Its "Closing ask" heading differs from row 1's single **QUESTION** block. | `plugins/i-have-audhd/skills/i-have-audhd/SKILL.md` inject span; `voice/VOICE.md` "Message skeleton, same shape every turn"; `gates/src/rows/r01-turn-shape.ts` header | **resolved:** same order and the same rules, so they don't contradict. Row 1 refuses a malformed turn whatever the inject says, and tiers/orchestrator.md names the blocks. The plugin's Stop checks only warn and key on its own "Needs you" / "Closing ask" markers. |
| C6 | The output-types contract puts a QUESTION at the top of a report, while i-have-audhd puts the choice last. | `contract/output-types.md` § The receipt rule (QUESTION row); inject span "What the user must *know* goes first; what they must *choose* goes last" | **resolved, already settled:** voice/VOICE.md "One closing ask per message, and it goes last" puts the blocker (to know) at the top and the closing ask (to choose) last, which is the split i-have-audhd uses. |
| C7 | ask-graham's hidden message against the surface's typed-input FIFO and the `input` handlers of gates rows 1 and 11. | `surface/extensions/surface-input.ts` (`input` handler; `before_agent_start` matches `event.prompt`); `gates/extensions/r11-jo-instruction.ts` `onInput(text, source)` | **resolved:** the nudge is a custom message sent with `deliverAs: "nextTurn"`, not an input. It raises no `input` event and leaves the prompt text unchanged. |
| C8 | The classifier routes hands, which are subagents. Neither plugin has a `tool_call` or `task` handler. | Handler lists of both adapters | **no clash.** The fence order in profile/config.yml does not change, since the fence is a tool_call concern. |
| C9 | The inject tells the model to "Load the full `i-have-audhd` skill", and the as2 skill allowlist would hide that skill. | `profile/config.yml` `skills.includeSkills` | **resolved:** both plugin skills are listed and load from their plugin dirs. |
| C10 | Installer and discovery invariant: each includeSkills name must resolve under exactly one listed customDirectory, and discovery must find each skill at its manifest row's file. | `install/install.sh` § 2b (profile render); `install/fresh-machine-test.sh` step 3b (skill listing) | **resolved:** the render maps each `skill` row to its own dir and requires that dir to be listed. fresh-machine-test compares each discovered skill's file with its manifest row. |
