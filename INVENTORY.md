# INVENTORY — the rule system that governs the Marches (Phase 1)

Author: Plumb (they/them), resident seat for the agent-system 2.0 redesign. Written 2026-09-21/22
from four scout enumerations and three reader traces under
`/Users/jowolff/code/agent-system-2.0/.tmp/phase1/` (untracked; the receipts quoted here are
the primary files, the reports are the working set). Brief:
`/Users/jowolff/code/agent-system-2.0/briefs/inventory.md`.

**How to read this file.** Seven sections, each usable alone. Every factual row is a CLAIM
with an absolute path receipt; sizes and mtimes come from `stat`/`wc` runs recorded in the scout
reports. Anything inferred is labeled **GUESS** inline with what would settle it. No quality
opinions — only factual dysfunction (contradiction, dead loader, drifted copy, a mechanism that
does not exist under OMP). Jo's preferences enter in Phase 3, not here.

**The three tiers, as this file uses the words.** *Lintel* — the coordinator, itself an OMP
persistent seat whose home is `/Users/jowolff/.claude` (`/Users/jowolff/.omp/agent/seat-launchers/launch-seat:139-141`).
*Seat* — one of 12 durable named OMP sessions rooted in a home repository
(`/Users/jowolff/.omp/agent/persistent-seats.json:4-52`). *Hand* — a transient subagent spawned by
the `task` tool inside a seat's session; governed by an agent definition, not a charter.

**Provenance vocabulary.** `local` = under `/Users/jowolff/.claude` (Tinker's, a git repo, HEAD
`bf7e2b9`); `omp` = under `/Users/jowolff/.omp` (Tinker's, not a git repo); `plugin` = the
installed newdle plugin `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171`
(byte-identical to the source repo's `plugins/newdle` at `2f7e67f` except `.DS_Store`/`.in_use` —
`/Users/jowolff/code/agent-system-2.0/.tmp/phase1/scout-plugins.md:1477-1519`); `repo` = inside a
seat's home repository; `jo-plugins` = `/Users/jowolff/code/jo-wolff-plugins` (Jo's own, remote
`thewolff/jo-wolff-plugins`, HEAD `1f4e7f1`).

---

## 1. The map

Grouped by function. Columns: what it is · where · tier(s) it governs · provenance · size
(bytes / words). "Loads?" is deliberately **not** in this section — that is Section 3, per
artifact, with the loader's `file:line`. Exhaustive per-file listings (1,452 rows for
`~/.claude`, 92 for `~/.omp`, 1,538 for the plugins, 421 for seat homes) are in the four scout
reports; this section lists every *governing* artifact individually and collapses only noise.

### 1.1 Identity and charter

| artifact | what | tier | prov | bytes / words |
|---|---|---|---|---:|
| `/Users/jowolff/.claude/agents/orchestrator.md` | Lintel's charter (named as `charter=` at `launch-seat:140`); frontmatter `model: opus` at line 4 | lintel | local | 32,158 / 4,847 |
| `/Users/jowolff/.claude/orchestrator/IDENTITY.md` | Lintel name provenance; says "the charter governs current behavior; this file records where the identity came from" (`:3`) | lintel | local | 2,289 / 334 |
| `/Users/jowolff/.claude/orchestrator/CHARTER.md` | **0 bytes** (`stat -f %z` → 0); a 21.8KB backup `CHARTER.md.pre-receipt-line-20260824` sits beside it | lintel | local | 0 / 0 |
| `/Users/jowolff/.claude/orchestrator/README.md` | orientation | lintel | local | 1,491 / 215 |
| `/Users/jowolff/.claude/.ai/tinker-seat-charter.md` + `tinker-seat-memory.md` (+3 charter backups) | Tinker (home `/Users/jowolff/.claude`) | seat | repo(local) | 17.5KB / 1.7KB |
| `/Users/jowolff/code/shipyard/repos/newdle-claude-plugins/.ai/sedge-seat-charter.md` + `-memory.md` | Sedge | seat | repo | see scout-seat-homes:76-99 |
| `/Users/jowolff/code/shipyard/.ai/verge-seat-charter.md` + `-memory.md` | Verge | seat | repo | scout-seat-homes:100-142 |
| `/Users/jowolff/code/shipyard/repos/newdle-web/.ai/wren-seat-charter.md` + `.ai/web-seat-memory.md` | Wren — memory file is `web-seat-memory.md` (`launch-seat:99`), not `wren-seat-memory.md` | seat | repo | scout-seat-homes:143-174 |
| `/Users/jowolff/code/shipyard/repos/data-pipelines/.ai/sluice-seat-charter.md` + `-memory.md` | Sluice | seat | repo | scout-seat-homes:175-339 |
| `/Users/jowolff/code/shipyard/repos/kitchen/.ai/galley-seat-charter.md` + `-memory.md` | Galley | seat | repo | scout-seat-homes:340-358 |
| `/Users/jowolff/code/joseph-gordon-levitt/.ai/levitt-seat-charter.md` + `-memory.md` | Levitt — home is a git repo with **no commits** (`git status -sb` → `No commits yet on main...origin/main [gone]`, scout-seat-homes:20) | seat | repo | scout-seat-homes:359-381 |
| `/Users/jowolff/.codex/AGENTS.md` + `/Users/jowolff/.codex/memories/memory_summary.md` | Codex — charter/memory are Codex-CLI-native files (`launch-seat:147-148`); home is **not a git repo**, no `.ai/` | seat | other | scout-seat-homes:382-401 |
| `/Users/jowolff/code/shipyard/repos/newdle-api/.ai/caspian-seat-charter.md` + `-memory.md` | Caspian | seat | repo | scout-seat-homes:402-418 |
| `/Users/jowolff/code/shipyard/repos/newdle-users/.ai/tron-seat-charter.md` + `-memory.md` | Tron | seat | repo | scout-seat-homes:419-437 |
| `/Users/jowolff/code/agent-system-2.0/.ai/plumb-seat-charter.md` + `-memory.md` | Plumb | seat | repo | 43,985 / 7,217 + 206 words |
| `/Users/jowolff/.claude/skills/new-seat/SKILL.md` (40.8KB) + `references/charter-template.md`, `memory-template.md` | the template every seat charter/memory is generated from; the step-3 rule ladder | seat (as a tier) | local | 40,789 / — |
| `/Users/jowolff/.omp/agent/seat-launchers/omp-persistent-seat-contract.txt` | the seat↔seat messaging contract; delivered as "User Instructions" in every OMP seat session | lintel, seat | omp | 2,269 / 354 |
| `/Users/jowolff/.omp/agent/persistent-seats.json` | the seat roster (12 seats + 1 scheduler `levitt-morning`) | seat | omp | 1,028 / 96 |
| `/Users/jowolff/.claude/agents/transcript-auditor.md` | second local agent definition; `model: opus` at line 4 | hand? | local | 10,230 |
| `/Users/jowolff/.claude/agents/BCKPorchestrator.md.bak`, `orchestrator.md.pre-marches-20260825` | charter backups (62.9KB, 26.6KB) | — | local | backup |

Receipt for the seat→home mapping: `/Users/jowolff/.claude/orchestrator/state/ROUTING.md:188-200`
(11 rows — **Lintel has no row**; its home comes only from `launch-seat:139`) cross-checked against
`launch-seat:95-167` (scout-seat-homes.md:7-24).

### 1.2 Communication rules (how to talk to Jo, voice, references)

| artifact | what | tier | prov | bytes / words |
|---|---|---|---|---:|
| `/Users/jowolff/.claude/CLAUDE.md` | the global rules file: PMDW marker, pronouns, thumbs-up, fold-in-the-cheese, § "How to communicate with Jo", § "References must survive without scrolling", § "Commands you hand to Jo", § "Time-intensive work goes to a subagent", § "Subagent output is the source of truth", § "Output types", HTML presentations, YAML brackets, MCP 401 note | all (every session whose cwd is under `$HOME`) | local | 52,293 / 8,592 |
| `/Users/jowolff/.claude/AGENTS.md` | a second ~8k-word rules file beside it; relationship to `CLAUDE.md` is Section 4 cluster (c) | ? | local | 48,410 / 7,981 |
| `/Users/jowolff/.claude/CLAUDE.md.2026-08-07-current.bak`, `.2026-08-07-pre-comms-rules.bak` | backups (25.2KB, 20.0KB) | — | local | backup |
| `/Users/jowolff/code/jo-wolff-plugins/plugins/communication-rules/` | Jo's published plugin: README, `hooks/hooks.json`, `communication-rules-inject.mjs`, `communication-rules-stop.mjs`, three `checks/*.mjs` (needs-you-first, closing-ask-last, name-the-artifact), `judge/ask.mjs`, `omp/REGISTRATION.md` (mtime 2026-09-21 21:30, "OMP seat adapter … warn-only, unregistered, fail-open") | all (if installed) | jo-plugins | scout-plugins:1544-1579 |
| `/Users/jowolff/code/shipyard/AGENTS.md` | the shipyard workspace rules (§ headings at scout-seat-homes:460-481) — governs every session under `/Users/jowolff/code/shipyard`, i.e. Sedge, Verge, Wren, Sluice, Galley, Caspian, Tron | seat, hand (under shipyard) | repo | 41,583 / 6,290 |
| plugin `skills/humanizer`, `skills/newdle-voice` | voice/wording skills (2 of 63) | all | plugin | — |
| `/Users/jowolff/agent-scratch/`, `/Users/jowolff/Desktop/agent-collaboration-with-adhd-and-autism.md` | referenced by `CLAUDE.md` § "How to communicate with Jo" as the evidence file; not inventoried (outside every root) | — | other | — |

### 1.3 Routing and delegation (who dispatches whom, with what)

| artifact | what | tier | prov | bytes / words |
|---|---|---|---|---:|
| `/Users/jowolff/.claude/orchestrator/state/ROUTING.md` | Lintel's routing state: seat table (`:188-200`), the seven registration surfaces (`:222-256`), model table (Plumb pinned at `:217`) | lintel | local | 69,780 / 10,857 |
| `/Users/jowolff/.claude/orchestrator/state/WORKSTREAMS.md` | workstream register; mtime 2026-08-19 (unchanged for a month) | lintel | local | 8,166 / 1,082 |
| `/Users/jowolff/.claude/orchestrator/contracts/dispatch-ledger.md`, `request-ledger.md` (+1 backup) | what a dispatch/request ledger entry must contain | lintel | local | 10.9KB, 2.5KB |
| `/Users/jowolff/.claude/orchestrator/runbooks/*.md` (7) | `delegation-check`, `relaunch-precompact-adoption-20260915`, `restart-cycle-20260911`, `mid-run-death-recovery`, `agent-reuse-criteria`, `guard-collisions`, `bootstrap` | lintel | local | 3–15KB each |
| `/Users/jowolff/.claude/orchestrator/summon.sh` (+2 backups, `summon.log` 709B mtime 6d), `audit-summon.sh` | Lintel's launch/audit scripts predating the OMP launcher | lintel | local | 16.0KB, 11.2KB |
| plugin `agents/*.md` (14) | the hand tier's governing text: `auditor`, `beefy-builder`, `beefy-research`, `builder`, `changelog`, `checker`, `debugger`, `planner`, `reader`, `research`, `scout`, `storyteller`, `summarizer`, `web-seat`; each pins `model:` at line 4 (fable ×5, opus ×5, haiku ×4) | hand | plugin | 1.4–8.7KB each |
| OMP built-in hand types `reviewer`, `security-reviewer`, `task`, `sonic` | present in Plumb's `task` tool roster with **no definition under any inventoried root** (scouts found none) | hand | omp-binary (GUESS — settled by Section 3) | — |
| plugin `references/shipyard-conventions.md` | routing table, model table, seats, `reader` cost measurements, worktree isolation — injected at session start by `shipyard-conventions-inject.mjs` | lintel, seat | plugin | 24,417 / 3,665 |
| plugin `references/orchestration-patterns.md` | how to brief and run hands | lintel, seat | plugin | 23,825 / 3,701 |
| plugin `references/project-linear-sync.md`, `quick-help.md` | Linear/project routing, help text | seat | plugin | 20.1KB, 3.0KB |
| plugin hooks `delegation-guard.mjs` (31.3KB), `fable-mode-guard.mjs`, `research-agent-guard.mjs`, `worktree-spawn-guard.mjs` | PreToolUse guards on `Task|Agent` (registered `hooks.json:23-56`) | seat→hand boundary | plugin | 31.3 / 15.5 / 8.6 / 11.0KB |
| local hooks `brief-clause-guard.mjs`, `delegation-boundary.mjs` (+test), `request-issue-hand-guard.mjs` | Lintel-side brief/dispatch guards under `/Users/jowolff/.claude/orchestrator/hooks/` | lintel | local | 18.8 / 21.5 / 5.2KB |
| `/Users/jowolff/.claude/CLAUDE.md` § "Time-intensive work goes to a subagent, always", § "Subagent output is the source of truth" | delegation rules at the global level | all | local | (part of 1.2 row) |
| `/Users/jowolff/code/shipyard/AGENTS.md` routing table | per-task-type agent routing for shipyard sessions | seat, hand | repo | (part of 1.2 row) |

### 1.4 Evidence and output types

| artifact | what | tier | prov | bytes / words |
|---|---|---|---|---:|
| plugin `references/output-types.md` | the CLAIM/CITE/GUESS/ACTION/QUESTION/PMDW contract; loaded by every plugin agent definition | all | plugin | 38,224 / 6,298 |
| `/Users/jowolff/.claude/references/output-types.md` | a second copy, mtime 1 month | ? | local | 37,420 / 5,955 |
| `/Users/jowolff/code/shipyard/repos/newdle-claude-plugins/plugins/newdle/references/output-types.md` | the source-repo copy (identical to installed per diff) | — | plugin-src | 38,224 |
| `/Users/jowolff/code/jo-wolff-plugins/plugins/output-types/skills/output-types/reference.md` | a fourth, published copy (19.2KB / 3,180 words — half the size) | all (if installed) | jo-plugins | 19,192 / 3,180 |
| `output-types-incidents.md` ×3 (`/Users/jowolff/.claude/references/`, plugin `references/`, plugin source) | the measured incidents behind rules 7 and 8 | all | local + plugin | 3.7 / 4.3 / 4.3KB |
| `/Users/jowolff/.claude/CLAUDE.md` § "Output types: claim, cite, guess, action, question" | the same contract restated in the global file, with "Synced excerpt" clauses | all | local | (part of 1.2 row) |
| plugin hooks `output-types-inject.mjs` (SessionStart), `output-types-guard.mjs` (Stop + SubagentStop) | injects the labels contract (measured output: 2,810 bytes / 409 words / 681 o200k tokens) and checks the first label + envelope on Stop | all | plugin | 10.0 / 30.9KB |
| plugin `references/hook-scope.md`; `newdle-hooks.json` per repo; `/Users/jowolff/.claude/newdle-output-level.json` (40B), `newdle-hook-mutes.json` (34B) | the on/off and `receipts`/`labels` level machinery for the plugin hooks | all | plugin + local | 12.2KB |
| local hooks `phantom-claim-stop.mjs` (+`phantom-lib.mjs`), `publish-stop.mjs`, `identifier-url-resolver.mjs` (+`.seatnames`, 2 backups), `identifier-link-guard.mjs`, `turn-id.mjs`, `intake-capture.mjs`, `intake-sweep.mjs`, `savepoint-guard.mjs`, `savepoint-restore.sh`, `ledger-write-guard.mjs`, `staging-guard.mjs`, `pr-notify.mjs`, `evals-touch-post.mjs`, `judgement-fit-posttool.sh`, `ctx-history-inject.mjs`, `ctx-search-guard.mjs`, `repair-context.mjs`, `session-gate.mjs`, `shell-lex.mjs`, `plugin-hook-shim.mjs` | Lintel's evidence/ledger guards under `/Users/jowolff/.claude/orchestrator/hooks/` (registered in `settings.json` — Section 3 says whether they fire under OMP) | lintel | local | 1.9–35.8KB each |
| `/Users/jowolff/.omp/agent/extensions/ctx-first-search.ts` | OMP extension: refuses the session's first `grep` until `ctx search` has run once ("a REFUSAL, not an injection", `:2`) | all OMP | omp | 17,334 / 2,480 |
| `/Users/jowolff/.claude/skills/ctx/SKILL.md` | the ctx working-memory skill | all | local | 8,876 |
| `/Users/jowolff/.claude/orchestrator/state/JUDGEMENT.md` (227KB) + 5 `JUDGEMENT-ARCHIVE*.md` (4.6–149KB) | Lintel's judgment ledger | lintel | local | 227,000 / 33,620 |
| `/Users/jowolff/.claude/orchestrator/state/RETRACTIONS.md` (358KB / 57,708 words) and `/Users/jowolff/.claude/state/RETRACTIONS.md` (1.8KB, mtime 2026-08-20) | recorded incorrect claims — **two files of the same name**, 200× apart in size | lintel | local | 358,159 / 57,708 |
| `/Users/jowolff/.claude/orchestrator/state/EXPERIMENTS.md` (+7 backups) | pre-registered machinery experiments | lintel | local | 54,192 / 8,354 |

### 1.5 Verification and hooks (the machinery that enforces, injects, or refuses)

| artifact | what | tier | prov | bytes / words |
|---|---|---|---|---:|
| `/Users/jowolff/.claude/settings.json` | Claude-CLI settings: 22 matcher-level hook registrations across 9 events, 23 command entries, 15 distinct commands (scout-claude-home:1478-1508); `enabledPlugins` = claudex-loop, honcho, newdle, ponytail (`:36`); **no `extensions` key** | Claude CLI sessions | local | 18.8KB |
| `/Users/jowolff/.claude/settings.local.json` | permissions | Claude CLI | local | 1.7KB |
| `/Users/jowolff/.claude/.claude/settings.json` | a project-scoped settings file *inside* `~/.claude` registering 6 plugin hooks through `plugin-hook-shim.mjs` (SessionStart, PreToolUse Bash, Stop ×2, SubagentStop, SessionEnd) | Lintel/Tinker (cwd `~/.claude`) under Claude CLI | local | 1.6KB |
| 14 `settings.json.*` backups at `~/.claude` root (2026-06-13 → 2026-09-11) | history of hook registration changes | — | local | backup |
| plugin `hooks/hooks.json` | 7 PreToolUse, 1 SubagentStop, 1 PreCompact, 6 SessionStart, 3 Stop, 1 SessionEnd registrations (verbatim scout-plugins:616-798) | all (via the bridge) | plugin | 4,760 / 285 |
| plugin `hooks/*.mjs|sh` (19 scripts + `lib/`) | `branch-first-nudge`, `careful-guard` (95.9KB), `compact-continuity` (42.8KB), `compaction-liveness`, `context-pressure`, `delegation-guard`, `fable-mode-guard`, `output-types-guard`, `output-types-inject`, `project-context-inject`, `rebase-before-push`, `recent-activity.sh`, `repo-rules-inject`, `research-agent-guard`, `session-end-reminder.sh`, `session-snapshot`, `shipyard-conventions-inject`, `worktree-spawn-guard`, `wrap-up-nudge.sh` | all | plugin | 2.2–95.9KB |
| `/Users/jowolff/.omp/agent/extensions/*.ts` (6 live) | `newdle-hooks.ts` (77.3KB — the plugin-hook bridge into OMP), `persistent-seat-registry.ts` (53.3KB — `seat_list`/`seat_message`), `ctx-first-search.ts`, `herdr-omp-agent-state.ts` ("installed by herdr", `:1`), `moshi-hooks.ts` ("Auto-generated by moshi-hook", `:1`), `compaction-state-owner.ts` (1.1KB) — plus 16 `.pre-*` backups (13 of them for `newdle-hooks.ts`, 2026-09-10 → 09-17) | all OMP | omp | 1.1–77.3KB |
| `/Users/jowolff/.omp/agent/seat-adapters/newdle-hooks.judgment.ts` (161.3KB, +1 backup) | the seat-specific hook adapter; how it is attached is Section 3 | seat | omp | 161,309 / 24,359 |
| `/Users/jowolff/.omp/agent/config.yml` | OMP config (verbatim scout-omp-home:119-178): `skills.enableClaudeUser: true` (`:35-36`), `modelRoles.default: anthropic/claude-opus-5:medium` (`:43-45`), `compaction.thresholdPercent: 25` (`:48-49`); **no `extensions:` key** | all OMP | omp | 856 / 96 |
| `/Users/jowolff/.omp/config.yml` | **0 bytes** — a second, empty config at the `~/.omp` root | — | omp | 0 |
| `/Users/jowolff/.omp/agent/mcp.json` (+1 backup), `lsp.json` | MCP servers (linear, ctx, WhisprFlow, chrome-devtools), LSP | all OMP | omp | 1.2KB, 678B |
| `/Users/jowolff/.claude/orchestrator/hooks/` — 20 `newdle-hooks.*.ts` / `persistent-seat-registry.*.ts` / `queue-seat-message.envelopev2.ts` variants (9.8–160.7KB) | staged/candidate versions of the OMP extensions living in Lintel's hooks dir (`continuityfresh`, `ext-reconcile`, `extwatchdog`, `hostpayload`, `idguard`, `judgment`, `ledgerguard`, `per-hook-redirect`, `precompact-veto`, `precompact-wiring`, `staleness-banner`, `urlargs`, `urlmachinery`, `mailfix`, `startupreceipt`, `turnfix`) | — (workshop) | local | ≈1.0MB total |
| `/Users/jowolff/.claude/orchestrator/hooks/.retired/`, `.retired-20260915/`, `UNINSTALL.md`, `uninstall.sh` | retirement machinery | — | local | — |
| `/Users/jowolff/.claude/hooks/relative-path-guard.mjs`, `herdr-agent-state.sh` | two hooks outside the orchestrator dir | ? | local | 6.5KB, 3.1KB |
| `/Users/jowolff/.claude/orchestrator/tools/` (≈70 files) | ledger tooling: `request-append.sh`, `request-amend.sh` (36.7KB), `request_issues_reconcile.py`, `issues-ledger-check.*`, `savepoint-generate.py` (40.5KB), `dispatch-spine.py`, `drift-detect.sh`, selftests | lintel | local | — |
| `/Users/jowolff/.claude/orchestrator/evals/` (README 21.8KB, `run-tier1.sh`, `run-tier2.sh`, `pair-check.sh`, `PAIR-EXEMPTIONS.txt`, `scenarios/`, `scenarios-tier2/`, `lib/`) | Lintel's hook regression suite | lintel | local | — |
| plugin `evals/` (README 32.1KB, `run-tier1.sh`, `run-tier2.sh`, `scenarios/`, `scenarios-tier2/`, `routing/`, `fixtures/`, `delegation-guard-baseline/`) | the plugin's hook regression suite | plugin hooks | plugin | — |
| `/Users/jowolff/.omp/agent/seat-launchers/*.test.ts`, `test-launch-seat.zsh`, `test-wake-seat.zsh`, `test-fixtures/herdr` | seat-machinery tests | seat | omp | 2–17.6KB |
| `/opt/homebrew/bin/moshi-hook` | external binary named in 10 `settings.json` hook lines (`:80,92,132,142,178,188,200,231,272,303`) | Claude CLI | machine | — |
| `/Users/jowolff/.claude/plugins/cache/ponytail/ponytail/4.8.4/hooks/ponytail-statusline.sh` | statusline (`settings.json:472`) | Claude CLI | other plugin | — |

### 1.6 Skills

| source | count | how counted | tier | prov |
|---|---:|---|---|---|
| plugin `skills/*/SKILL.md` | **63** | `grep -c` over scout-plugins installed rows | all | plugin |
| `/Users/jowolff/.claude/skills/` | 12 real dirs with `SKILL.md` (`bb-cli` 48.3KB, `ctx`, `html-report`, `jo-deck`, `linear-project-suggest`, `lintel-charter-rollout`, `new-seat` 40.8KB, `orchestrator-evals`, `seat-shutdown`, `sheet-to-linear`, `ubersicht-widget`, +1) · **43 symlinks → `/Users/jowolff/.agents/skills/<name>`** (all targets exist) · 4 empty dirs (`peon-ping-{config,log,toggle,use}`, 0 files) | scout-claude-home Artifacts rows; `ls -d /Users/jowolff/.agents/skills/*/ \| wc -l` → 47 | all | local (+ `~/.agents/skills`, a root the brief did not name) |
| `/Users/jowolff/.omp/agent/skills/seat-shutdown/SKILL.md` | 1 (7.3KB) — a **second `seat-shutdown`** beside `/Users/jowolff/.claude/skills/seat-shutdown/SKILL.md` (8.3KB) | scout-omp-home:92 | seat | omp |
| `/Users/jowolff/code/jo-wolff-plugins/plugins/output-types/skills/output-types/` | 1 | scout-plugins:1580 | all | jo-plugins |
| plugin `SKILLS-MANIFEST.md` | 7.3KB index of the 63 | — | plugin |
| `/Users/jowolff/.claude/settings.json` `skillOverrides` | key present (scout-claude-home:1510) | Claude CLI | local |

Plumb's own session exposes **≈90 skill names** in its tool prompt (observed, this session);
the union of the sources above is 63 + 47 + 1 + 1 = 112 candidates — which ones actually reach a
session is Section 3.

### 1.7 State (what persists, where)

| artifact | what | tier | prov | size |
|---|---|---|---|---:|
| `/Users/jowolff/.claude/orchestrator/state/STANDUP.md` | Lintel's memory document (`launch-seat:141`) | lintel | local | 33.8KB / 4,591 |
| `/Users/jowolff/.claude/orchestrator/state/REQUESTS.jsonl` (1.7MB), `.amendments` (4.2MB), `ledger-write-guard.jsonl` (151KB), + a `REQUESTS.jsonl.pre-*` family and `runs/` (≈570 files) | the request ledger and its backups | lintel | local | ≈8MB |
| `/Users/jowolff/.claude/orchestrator/state/JUDGEMENT.md`, `RETRACTIONS.md`, `EXPERIMENTS.md`, `ROUTING.md`, `WORKSTREAMS.md` | see 1.3/1.4 | lintel | local | — |
| `<home>/.ai/<slug>-seat-memory.md` ×11 (Codex: `memories/memory_summary.md`) | seat memory, human-promoted only | seat | repo | scout-seat-homes |
| `<home>/.ai/decision-log/` | committed decision logs; counts per home in scout-seat-homes collapsed rows | seat, hand (via wrap-up) | repo | — |
| `<home>/.ai/session-state.md` | compaction snapshot (written/consumed by plugin hooks) | seat | repo | transient |
| `/Users/jowolff/.claude/.ai/session-handoff.md` (24.1KB), `sol-seats-recipe-20260916.md`, `.ai/omp-compaction-archive/`, `.ai/decision-log/` | Lintel/Tinker handoff material under `~/.claude/.ai` | lintel, tinker | local | — |
| `/Users/jowolff/.omp/agent/seat-sessions/<slug>/` | OMP transcripts per seat: 3,419 files, 957MB total; Tinker 1,130 files / 338MB, Lintel 603 / 153MB, Plumb 12 (scout-omp-home:93-104) | seat | omp | 957MB |
| `/Users/jowolff/.omp/agent/seat-mailboxes/{inbox,acks,archive}` | 1 / 2,929 / 766 files | seat | omp | 2.3MB |
| `/Users/jowolff/.omp/agent/compaction-archive/{lintel,tinker}` | 15 + 2 files | seat | omp | 249KB |
| `/Users/jowolff/.omp/agent/custom-session-files/` | 84 one-line files, each the path of a seat transcript (sample at scout-omp-home:250-256) | seat | omp | 9.5KB |
| `/Users/jowolff/.claude/agent-memory/orchestrator/`, `newdle-builder/` | Claude-CLI agent memory dirs (orchestrator: 6d; newdle-builder: 2mo) | lintel, hand | local | — |
| `/Users/jowolff/.claude/state/REGISTRY.md`, `RETRACTIONS.md`, `pr-notify/` | a second `state/` dir at `~/.claude` root | ? | local | 1.3KB, 1.8KB |
| `/Users/jowolff/.claude/newdle-compaction-heartbeat.ndjson` (40.7KB), `.claude.json` (39.6KB, mtime 3mo), `history.jsonl` (1MB) | Claude-CLI-side state | Claude CLI | local | — |

### 1.8 Seat-lifecycle machinery (the seat tier as a tier)

| artifact | what | tier | prov | bytes / words |
|---|---|---|---|---:|
| `/Users/jowolff/.omp/agent/seat-launchers/launch-seat` (+6 `.pre-*` backups, 2026-09-11 → 09-21) | the launcher: per-seat `case` block `:95-167`, `default_model=` at `:93,142,149,168` | seat | omp | 22,184 / 2,782 |
| `/Users/jowolff/.omp/agent/seat-launchers/wake-seat` | `launch-seat --start` then `check-seat-ready` (verbatim scout-omp-home:195-222) | seat | omp | 564 / 76 |
| `/Users/jowolff/.omp/agent/seat-launchers/check-seat-ready` | readiness poller | seat | omp | 3,130 |
| `/Users/jowolff/.omp/agent/seat-launchers/seat-bin/omp` | the wrapper HerdR runs in the pane (the path whose leading `/` the oh-my-zsh prompt ate on 2026-09-21) | seat | omp | 2,193 |
| `/Users/jowolff/.omp/agent/seat-launchers/queue-seat-message` (+test) | CLI to queue a mailbox envelope | seat | omp | 9,446 |
| `/Users/jowolff/.omp/agent/seat-launchers/persistent-seat-registry.test.ts`, `persistent-seat-registry.candidate*.ts` ×2 | registry tests and two candidate copies | seat | omp | 6.3 / 34.4 / 23.5KB |
| `/Users/jowolff/.omp/agent/skills/seat-shutdown/SKILL.md` and `/Users/jowolff/.claude/skills/seat-shutdown/SKILL.md` | shutdown ritual, two copies (7,299 vs 8,311 bytes) | seat | omp + local | — |
| `/Users/jowolff/.claude/skills/new-seat/` | birth (see 1.1) | seat | local | — |
| `/Users/jowolff/.claude/skills/lintel-charter-rollout/SKILL.md` | 12.0KB, `disable-model-invocation=true` | lintel | local | — |
| `/Users/jowolff/.claude/orchestrator/state/ROUTING.md:222-256` | the seven-surface registration rule | seat | local | — |
| `/Users/jowolff/.omp/agent/extensions/herdr-omp-agent-state.ts`, `/Users/jowolff/.claude/hooks/herdr-agent-state.sh` | HerdR pane-state reporters, one per harness | seat | omp + local | 12.4KB, 3.1KB |
| `/Users/jowolff/.claude/daemon/` (`roster.json` 88B, `attach-journal/`, `dispatch/`, `control.key`), `daemon.log` (67KB, mtime 1w) | a Claude-CLI-era daemon; last written 2026-09-14 | ? | local | — |

### 1.9 Plugin provenance summary (the required column, rolled up)

| provenance | governing artifacts (this map) | what stops if the plugin is uninstalled |
|---|---|---|
| plugin (0.2.171) | 14 hand definitions, 12 references (incl. `output-types.md`, `shipyard-conventions.md`, `orchestration-patterns.md`), 19 hook scripts + `hooks.json`, 63 skills, evals | every plugin-defined hand type; the output-types injection and Stop/SubagentStop guard; session-start conventions injection; compaction continuity/snapshot; delegation/fable/research/worktree guards; 63 skills. Local files that point INTO the plugin — `settings.json:282` (`plugin-hook-shim.mjs output-types-guard.mjs`), `~/.claude/.claude/settings.json` (6 shim lines), `newdle-hooks.ts`/`newdle-hooks.judgment.ts` (resolve `PLUGIN_ROOT`), `launch-seat` — become dangling references. Section 3 receipts each. |
| local (`~/.claude`) | `CLAUDE.md`, `AGENTS.md`, `orchestrator.md`, 47 orchestrator hooks, 12+47 skills, `ROUTING.md`/`STANDUP.md`/ledgers, `new-seat`, evals | unaffected by plugin removal, except the shim registrations above |
| omp (`~/.omp`) | 6 extensions, seat adapter, launcher family, roster, contract, `seat-shutdown` | unaffected in file terms; `newdle-hooks.ts` and the judgment adapter have nothing to bridge |
| repo | 11 charters + memories, 7 shipyard `AGENTS.md`/`CLAUDE.md` chains, decision logs | unaffected |
| jo-plugins | `output-types` skill copy, `communication-rules` plugin | independent of the newdle plugin; not installed in `installed_plugins.json` (`:4-43` lists newdle, ponytail, claudex-loop only) |

---
