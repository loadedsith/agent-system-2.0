# REVIEW — how the three tiers compose, and where they fail to (Phase 2)

Author: Plumb (they/them). Written 2026-09-22 from `INVENTORY.md` (commit `a1410ad`; line numbers
cited below are that commit's, and `INVENTORY.md` § 8 was appended afterwards without moving them), two reader
traces under `/Users/jowolff/code/agent-system-2.0/.tmp/phase2/` (`reader-D-ctx.md`,
`reader-E-rule-trace.md`, untracked), and Plumb's own checks recorded in § 9. Every finding here
points back at an inventory row (§ 9); a fact the inventory does not hold and this review did not
measure is not asserted. Facts only — contradiction, dead loader, unreachable rule, drifted copy.
Jo's preferences are Phase 3.

Path shorthands, as in the inventory: `P` = `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171`;
`X` = `/Users/jowolff/.omp/agent/extensions`; `O` = `/Users/jowolff/.claude/orchestrator`;
`OMP_SRC` = `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src`.
Every `file:line` below that is not prefixed with one of these is absolute.

**Eleven lines, for a reader who stops here.**

1. A seat's governing text is five layers placed by three mechanisms; precedence between them is
   asserted by sentences inside the layers and ranked by nothing (§ 1).
2. The charter — the one document a seat is chartered by — is the only layer the seat must fetch
   itself; nothing guarantees it was read (§ 1).
3. A hand gets the parent's context files, skills, extensions and digests, and **not** the charter,
   the memory, or the seat contract: `buildSubagentSessionOptions` carries no append prompt (§ 2).
4. Of the six chartered rules traced, one is enforced at the tier it was written for; three fire
   at the wrong tier or on the wrong half; two are enforced by nothing at all (§ 4, § 7).
5. The output-types envelope — the coverage check a parent relies on — is never checked for any
   hand: OMP never emits `session_stop` for a child session (`agent-session.ts:4248`), and the
   `SubagentStop` half is never bridged (§ 4 rule 1).
6. `delegation-guard` refuses hands for doing their own job, because the bridge sends no
   `agent_type` and every exemption keys on it (§ 4 rule 2).
7. Seat messaging is guarded on one channel (`hub`) out of five the contract forbids; the
   `SendMessage` tool the Tron-generation charters name does not exist under OMP, and the `claude`
   CLI route is guarded by nothing (§ 4 rule 4).
8. The model gate is mechanized for four hand types in one repository — this one — and nowhere
   else; every other seat's hands inherit the parent's model silently (§ 4 rule 5).
9. Charter and memory read-only rules have zero machinery at every tier and the charter half is
   written in 1 of 12 charters (§ 4 rule 6).
10. ctx: the only live machinery demands one ctx query per session before the first search,
    against a corpus that contains none of the seats' or hands' own transcripts; nothing else about
    ctx is enforced, and no first-party document says what it is for (§ 8).
11. Skills: 118 names on six sources, 89 visible to every OMP session and every hand; no skill is
    gated by anything, two skills are the sole written form of a rule the machinery enforces
    (`careful`, `ctx`), and two local copies drift with the older one winning (§ 10).

---

## Questions and blockers — first, per the output rules

**QUESTION — rule 4, the forbidden messaging channels (Reader E, carried up)**
Nothing prevents a seat or hand from shelling out to the `claude` CLI; the only guard blocks OMP
`hub` addressed at a seat name. Options: leave it prose-only (costs nothing; Tron's charter `:16`
still instructs `claude agents`); add a DENY segment to `careful-guard.mjs` for `claude agents` /
`claude --bg` (closes the shell route only; the plugin is Tinker/Sedge territory, so it is a
proposal from this seat); or accept that `SendMessage` is absent under OMP (settled — § 4 rule 4)
and treat the charter text as stale to be regenerated. Recorded here; Phase 3 material.

**QUESTION — rule 6, charter/memory read-only (Reader E, carried up)**
Zero machinery at every tier, prose absent from 11 of 12 charters. A PreToolUse `edit|write` path
guard in `X/newdle-hooks.ts` versus regenerating charters from the current template are different
calls about how mechanized the seat pattern should be. Recorded here; Phase 3 material.

**Blockers.**
None. The three load-bearing GUESSes the readers left open (E-G1, E-G2, E-G3) were settled by
Plumb this session; receipts in § 9.

---

## 1. How a seat's governing text is assembled, and in what precedence

**CLAIM**
A seat session's text is five layers, assembled by three different mechanisms with no shared
notion of precedence (`INVENTORY.md` § 3.1, § 3.2):

| layer | mechanism | who decides order | receipt |
|---|---|---|---|
| OMP system prompt + tool descriptions + skill list | OMP core | OMP | `INVENTORY.md:299-308` |
| `--append-system-prompt`: the seat contract (10 seats) or the charter (Lintel, Codex) | `launch-seat:279,:282,:285` | the launcher | `INVENTORY.md:344-347` |
| context files: `/Users/jowolff/.claude/CLAUDE.md` (claude provider p80) and the repo `AGENTS.md`/`CLAUDE.md` chain up to `$HOME` (walker p10) | OMP capability providers, ordered by priority | OMP | `INVENTORY.md:326-327,:348-350` |
| SessionStart injections: output-types digest, shipyard conventions, recent activity, compaction liveness | `X/newdle-hooks.ts` bridge → hidden `before_agent_start` message | the plugin manifest order | `INVENTORY.md:376` |
| charter + memory + two decision-log entries | **named in the wake prompt as files to read** (`launch-seat:283`) | the seat, at its first turn | `INVENTORY.md:345-346` |

**CLAIM**
Precedence is asserted by text, not by machinery. The only document that both claims to override
another and is placed by the launcher where that claim can hold is the seat contract
(`/Users/jowolff/.omp/agent/seat-launchers/omp-persistent-seat-contract.txt:3` "overrides any
legacy charter instruction"), and it reaches 10 of 12 seats — not Lintel, not Codex
(`INVENTORY.md` § 2.2 row 3, `:349`). Every other precedence sentence (`CLAUDE.md:79`,
`orchestrator.md:58`, `shipyard-conventions.md:3,:39`) is a sentence inside a layer, read by the
model, ranked by nothing (`INVENTORY.md` § 2.1).

**CLAIM**
The charter — the document a seat is chartered by — is the only layer the seat has to fetch
itself. It is not a context file, not appended, and therefore the one governing text OMP cannot
guarantee was read (`INVENTORY.md:345`). For Lintel the charter *is* appended
(`/Users/jowolff/.claude/agents/orchestrator.md`), so Lintel is the one seat whose charter has the
same delivery guarantee as its rules file — and Lintel is also the one seat whose charter carries
2 of the template's 15 headings (`INVENTORY.md` § 4.1 (f)).

## 2. How a hand's governing text is assembled

**CLAIM**
A hand is a child session in the seat's process, built by `buildSubagentSessionOptions`
(`OMP_SRC/task/executor.ts:3708-3812`, called at `:3829`). It receives (`INVENTORY.md` § 3.4,
`:398-412`): the parent's context files (`CLAUDE.md`, the repo `AGENTS.md` chain) copied
verbatim (`executor.ts:3744` `contextFiles: options.contextFiles`); the parent's skill list
(`:3745`); the same extensions rebound (`:3750-3751`); the SessionStart digests; its own
definition body inside the subagent template (`:3757-3758`); and the delegation prompt.

**CLAIM**
It does **not** receive the seat contract or the charter. `buildSubagentSessionOptions` carries no
`appendSystemPrompt`/`appendPrompt` key — `grep -n 'appendPrompt\|appendSystemPrompt'
OMP_SRC/task/executor.ts` → no matches — so `composeAppendPrompt(appendParts, options.appendSystemPrompt)`
at `OMP_SRC/sdk.ts:3269` receives `undefined` for every child session. Corroborated in the ten
hand transcripts of this seat's session: the string "persistent-seat communication contract"
appears only inside `read` tool results and reports quoting the file (`ReaderRuleTrace.jsonl:28`,
`ScoutOmpHome.jsonl:49`, `ReaderSeatLifecycle.jsonl:128`), never as delivered prompt text. This
settles `INVENTORY.md:400` (GUESS → CLAIM) and Reader E's `E-G2`.

**CLAIM**
The definition body points at `${CLAUDE_PLUGIN_ROOT}/references/output-types.md` with the variable
unexpanded and unset (`INVENTORY.md:404`); the full output-types contract reaches a hand only if
the hand guesses the path. What a hand reliably gets on the subject is the 681-token SessionStart
digest (`INVENTORY.md` § 6) and `CLAUDE.md:1-53,:200-272`.

**CLAIM**
Four frontmatter keys the definitions rely on are discarded under OMP — `model:`, `skills:`,
`disallowedTools:`, `effort:` (`INVENTORY.md:334`). The consequence is not cosmetic: the plugin
`scout`, described as a haiku read-only locator, runs at the parent's model with write, edit,
eval, task and every MCP tool (`INVENTORY.md:408`). Since `6c4902a` this seat carries OMP-dialect
copies of four types with pins OMP honours (`/Users/jowolff/code/agent-system-2.0/.omp/agents/{builder,planner,reader,scout}.md:5`;
`OMP_SRC/task/discovery.ts:101-112` pushes project dirs without `ignoreModel`); both Phase 2
readers ran on `anthropic/claude-opus-5` as pinned. No other seat home has a `.omp/agents`
directory (Reader E's twelve-home directory test, `reader-E-rule-trace.md:406-411`).

## 3. Where two sources both claim authority

**CLAIM**
`INVENTORY.md` § 2.2 (`:219-233`) lists twelve questions; nine agree in text. The three that do not:

1. **The output-types contract** — three documents each claim canonical status for overlapping
   populations with different type counts (plugin 5 types / rules to 11; `~/.claude/references`
   4 types / 8 rules; `CLAUDE.md` 5 types / 8 rules) and a fourth restatement
   (`~/.claude/AGENTS.md`) loaded by nothing (`INVENTORY.md:221`, § 4.1 a/c). Two live charters add
   a fourth and fifth count under an identical `## Output discipline` heading: Plumb `:648` five
   types, Tron `:491` four (Reader E E-4).
2. **Which tool messages a seat** — the contract says `seat_message`; the charter template and
   Tron's charter (`:16` `claude agents`, `:54` `SendMessage`) still instruct Claude-CLI mechanisms;
   resolved at runtime only for the 10 seats that receive the contract (`INVENTORY.md:222,:349`).
   The `SendMessage` half of the contradiction is empty under OMP: no tool of that name is
   registered anywhere in `OMP_SRC` (`grep -rn '"SendMessage"' OMP_SRC --include=*.ts` → no
   matches; the only hits are the `SendMessageHandler` hook-IPC type at
   `extensibility/extensions/types.ts:1617`), and this seat's own tool inventory carries
   `seat_message` and `hub` and no `SendMessage`. Settles Reader E's `E-G3`.
3. **Where team agents are authored** — text says the plugin repo; the tree holds
   `data-pipelines/.claude/agents/{auditor,builder,debugger}.md` that OMP does not load
   (`INVENTORY.md:226,:366`).

## 4. Enforced by machinery versus written only

**CLAIM**
Six chartered rules plus ctx, traced by Reader E (rules 1–6, `reader-E-rule-trace.md:44-491`)
and Reader D (ctx, `reader-D-ctx.md:139-380`), with Plumb's settlements folded in. "Enforced"
means a hook or extension that can refuse, block, or alter the turn; "written" means a sentence
some tier is expected to read.

| rule | written at (tiers) | enforcing machinery | what the machinery actually checks |
|---|---|---|---|
| 1. Output-types labels + envelope | all three: `CLAUDE.md:1-53,:200-272`; SessionStart digest (`P/hooks/hooks.json:89-106`); Plumb charter `:646-653`, Tron `:489-492`; Lintel's `orchestrator.md` consume-side only (`:259-261`) | `P/hooks/output-types-guard.mjs` on `Stop` (`hooks.json:140-163`) and `SubagentStop` (`:68-77`), bridged by `X/newdle-hooks.ts:1260-1310` | On `Stop`: labels only, skipping the agent allowlist (`:415-418`), exempting replies under 200 chars (`:436,:209`), returning before the envelope block (`:519`); verdict is `additionalContext` → `{continue:true}` (`X/newdle-hooks.ts:1307-1310`), never a block. `SubagentStop` is never bridged (`INVENTORY.md:380`), and OMP never emits `session_stop` for a child session at all (`OMP_SRC/session/agent-session.ts:4248` `if (this.#agentKind === "sub" \|\| …) return false`). |
| 2. Delegate by default / no broad inline search | all three: `P/references/shipyard-conventions.md:15-23` (injected), `:37-60`; `orchestrator.md:153,:155`; both charters `## Manage, don't do` | `P/hooks/delegation-guard.mjs` on PreToolUse `Read\|Grep\|Bash\|Task\|Agent` (`hooks.json:23-30`) | Three checks, every exemption keyed on `input.agent_type` (`:432,:444`) which the bridge never sends (`INVENTORY.md:384-386`): reader exemption `:517`, streak `:535`, scout exemption `:561`. `ask` → block where no UI (`INVENTORY.md:381`). `O/hooks/delegation-boundary.mjs` (478 L) registered nowhere and unregistrable as its runbook proposes (`INVENTORY.md:537-539,:305-306`). |
| 3. Careful / destructive-command gating | all three via `P/skills/careful/SKILL.md:3,:24-26,:88-91`; Plumb `## Boundaries` `:286-307`; Tron: no `## Boundaries` heading; `CLAUDE.md`: no guardrail section (heading set `reader-E-rule-trace.md:216-220`) | `P/hooks/careful-guard.mjs` on PreToolUse `Bash\|Glob` (`hooks.json:3-12`); `rebase-before-push.mjs` on `Bash` (`:13-21`) | Always on, off-switch is `NEWDLE_GUARD` env only (`:73,:1007`); deny/ask only (`:16-20,:78-80`); Bash branch live at all tiers via `SHELL_TOOLS` case-fold (`:1058`, `lib/tool-names.mjs:29,:36-37`); Glob branch dead — `:1013` tests literal `"Glob"`, OMP's tool is `glob` and unmapped (`INVENTORY.md:367,:388`), so the broad-search refusal `:1029-1050` and its scout exemption `:1016` never run. Matcher is textual: refused a heredoc whose prose named a git subcommand (Reader E ACTION, `:267-275`). |
| 4. Seat messaging via `seat_message` | seat, 10 of 12: contract `:3` and paragraph 6; Lintel: `orchestrator.md:189`, `O/state/ROUTING.md:289-296,:487-492,:526-528,:595`; Tron charter contradicts at `:16,:54`; template `charter-template.md:72,:158,:186` still emit Claude-CLI mechanisms | `X/persistent-seat-registry.ts:1127-1130` native `tool_call` handler; `:813-835` `persistentSeatHubMisuseReason` | Blocks `hub` `op:"send"` with `to`, or `op:"wait"` with `from`, matching an allowlisted seat name — allowlist from `OMP_PERSISTENT_SEAT_NAMES` (`:798-800`), not `persistent-seats.json` (`INVENTORY.md:427-429`). Native event, so it fires in hands too (`executor.ts:3750-3751`). Nothing matches `claude agents\|claude --bg\|SendMessage` in `careful-guard.mjs`, `newdle-hooks.ts`, or the registry (zero matches). `seat_message` validates destinations (`:516-519,:868-871,:1000-1002`) — provides, does not prevent. |
| 5. Model tier per hand type (spending gate) | Plumb charter `:365-404` only; Lintel `ROUTING.md:214-218`; all three `shipyard-conventions.md:47-60`; `P/agents/<type>.md:4` pins; every other charter silent | `OMP_SRC/task/discovery.ts:101-112` honouring project-dir `model:`; nothing reads a model *plan* | Plugin pins dropped (`INVENTORY.md:415`, `discovery.ts:148-155` `ignoreModel`). Project pins honoured for `builder`, `planner`, `reader`, `scout` in `/Users/jowolff/code/agent-system-2.0/.omp/agents/*.md:5` — the only seat home with such a directory. The gate itself (plan → Jo → confirm) is read by the seat and checked by nothing. |
| 6. Charter read-only; memory human-promoted | template `charter-template.md:208-215,:332-333,:190-191,:42-43,:53`; Plumb charter `:86-108` (charter half — only charter that has it); Tron `:328-330,:63-65` (memory half); both memory-file headers; Lintel nothing | **none** | Zero matches for `charter\|seat-memory` across `P/hooks`, all six live `X/*.ts`, and every `O/hooks/*.mjs` except three dead-under-OMP files where `charter` is not a seat-charter path (`reader-E-rule-trace.md:455-466`). The only write-tool PreToolUse hook, `repo-rules-inject.mjs` (`hooks.json:59-67`), injects rules; under OMP its `additionalContext` becomes block-with-retry (`X/newdle-hooks.ts:1457-1461`), not a path check. |
| 7. ctx — search prior agent work before starting (Jo's added subject) | one vendor skill only: `/Users/jowolff/.claude/skills/ctx/SKILL.md:3,:12,:41,:80,:151-169,:220-227`; **zero** ctx imperatives in all 12 charters, all 14 `P/agents/*.md`, all 12 `P/references/*.md`, `CLAUDE.md`, `orchestrator.md`, `ROUTING.md` (per-file `grep -ci ctx` → 0, Reader D D-4) | `X/ctx-first-search.ts` (the only live one); `O/hooks/ctx-search-guard.mjs` and `ctx-history-inject.mjs` registered nowhere (D-10, D-11; `INVENTORY.md:519`) | Refuses the first `grep`/`glob`/`web_search` until one ctx *search* has been **called** (`:235-236`); flips on `tool_call`, before any result, so a timed-out search satisfies it (`:222-226`, D-8); only `search` counts — `blame`, `show_*`, `query_events`, `status` do not (`:110,:179-187,:287-288`, D-9, D-19); concedes at `:61-66` that reading the result "is a RULE". Reaches hands: factory re-invoked per agent (`:206-209`, `executor.ts:3750-3752`, D-7). |

**CLAIM**
Counting by "does the machinery check the rule as written, at the tier it was written for":
rule 3's Bash half and rule 4's `hub` sub-clause are the only enforcement that matches its text.
Rule 1 checks half the rule on the wrong tier and none of it on the tier the envelope exists for.
Rule 2 checks its text against the wrong tier because its exemptions cannot see tier at all.
Rule 5 is mechanized on the pin, not on the gate, and only here. Rules 6 and 7's grounding clause
are enforced by nothing. Receipts are the rows above.

## 5. Where copies have drifted

**CLAIM**
`INVENTORY.md` § 4 holds the diffs. The composition-relevant subset: the charter template grew
after the 2026-09-11 batch and no charter was regenerated, so the read-only clause exists in 1 of
12 charters and the brief-boilerplate reference in 1 of 10 (`INVENTORY.md:453,:224`); Tron's
charter has no `## Boundaries` heading at all (Reader E E-12, heading set `:3,:28,:50,:78,:100,:219,:250,:270,:298,:320,:335,:436,:451,:468,:489`)
so the ten pre-growth seats carry no written write-scope limit; `ROUTING.md` — the document Lintel
reads at every wake — cites eleven moved line numbers, one wrong config value, and an 11-row table
for 12 seats (`INVENTORY.md` § 4.2, § 5.3); the two copies of `newdle-hooks.judgment.ts`
re-drifted after a retraction recorded syncing them, and neither is loaded
(`INVENTORY.md:455,:511`).

**CLAIM**
Two drifts are shown to an agent at the moment a guard fires, which is where a stale sentence
does the most work: the ctx-first refusal text says "2,300+ prior sessions"
(`X/ctx-first-search.ts:197`) while `ctx status` reports `Sessions 1,687` (Reader D D-17); and
two dormant orchestrator hooks assert ctx semantic search is broken
(`O/hooks/ctx-history-inject.mjs:23-33`, `ctx-search-guard.mjs:24-26`) while `ctx status` reports
`Semantic ready` (D-18) — dormant, but 16+ `ctxguard-*` eval scenarios still exercise the
unregistered hook (D-12, `O/evals/scenarios/ctxguard-citation-allowed/assert.sh:2-3`).

## 6. What the reading cost buys

**CLAIM**
From `INVENTORY.md` § 6 (corrected figures): the one text that reaches all three tiers is
`/Users/jowolff/.claude/CLAUDE.md` at 11,630 tokens — 30–63% of every seat's always-loaded text and
the whole of a hand's rules inheritance beyond the repo chain. The charters (3,619–10,462 tokens)
reach one tier and are fetched, not delivered. The plugin's `output-types.md` (8,821 tokens) is
delivered to nobody; a 681-token digest is. The contract (454 tokens) reaches 10 seats and, per
§ 2, no hand. The six nested shipyard seats pay two `AGENTS.md` files (9,647 + 1,527–8,029)
before their charter, and so does every hand they dispatch.

**CLAIM**
Set against § 4: the 11,630-token file that reaches every tier states rules 1 and 2 and none of
3–7 (heading set, `reader-E-rule-trace.md:216-220`); the charters that state rules 3, 5 and 6
reach one tier and are the layer with no delivery guarantee (§ 1); the one rule every tier is
mechanically held to before its first search — ctx — is written in a 237-line vendor skill and
nowhere in any first-party text (D-4).

## 7. Rules that bind one tier and silently fail to reach another

**CLAIM**
"Silent" means: the tier that misses the rule receives no error, no refusal, and no text saying
the rule does not apply to it.

| rule | binds (tier, how) | fails to reach (tier) | why silently | receipt |
|---|---|---|---|---|
| 1. Envelope | nobody | hand — the tier the envelope was written for | `session_stop` is not emitted for `agentKind === "sub"`; `SubagentStop` never bridged; a hand omitting the envelope is graded by nothing | `OMP_SRC/session/agent-session.ts:4248`; `P/hooks/output-types-guard.mjs:519`; `INVENTORY.md:380`; 0 of 10 hand transcripts contain the guard's `mute output-types-guard` hint, the seat transcript contains 1 |
| 1. Labels | Lintel, seat — continuation nudge, ≥200 chars, no allowlist | hand (same mechanism); Lintel's produce side (never told to label) | as above; `orchestrator.md` has only consume-side CLAIM text | `output-types-guard.mjs:415-418,:436`; `orchestrator.md:153,:155,:189,:191,:245-248,:259-261,:334-335` (E-5) |
| 2. Delegate by default | all three, as a main-session rule | hand — its exemptions | no `agent_type` in the bridge payload; a `reader` refused for reading and a `scout` for searching, with the refusal text citing `AGENTS.md` as if the hand were the seat | `delegation-guard.mjs:432,:444,:517,:535,:561`; `INVENTORY.md:384-386`; live refusal, `reader-E-rule-trace.md:163-171` (E-6, E-7) |
| 3. Bash gating | all three | — | — | `careful-guard.mjs:1058`; `INVENTORY.md:367` |
| 3. Glob / broad-search gating | nobody | all three | literal `"Glob"` compare against `glob`; refusal `:1029-1050` unreachable | `careful-guard.mjs:1013`; `INVENTORY.md:388` (E-9) |
| 3. Write-scope boundary | Plumb (prose) | 10 Tron-generation seats; hands (never see a charter) | no `## Boundaries` heading; no guard reads one | Tron heading set above (E-12); `INVENTORY.md:399` |
| 4. `hub` at a seat name | all three | — | — | `persistent-seat-registry.ts:813-835,:1127-1130` (E-13) |
| 4. `claude` CLI / `SendMessage` prohibition | seat (10, prose) | Lintel, Codex (no contract); hand (no contract, § 2); every tier mechanically | zero guard matches; `SendMessage` tool does not exist under OMP so that half is self-enforcing by absence while the charter still names it; `claude agents` from `bash` is matched by nothing | `INVENTORY.md:349,:400,:503-505`; E-14, E-15; `OMP_SRC` `"SendMessage"` → 0 matches |
| 5. Model pin | hand — 4 types, 1 repo | every other seat's hands; the 10 unpinned types here | plugin `model:` dropped by `ignoreModel`; no other `.omp/agents` | `discovery.ts:101-112,:148-155`; `INVENTORY.md:415`; twelve-home test (E-16, E-17) |
| 5. Model plan gate | Plumb, Lintel (prose) | 11 other seats (prose absent); every tier mechanically | nothing reads a plan | `plumb-seat-charter.md:365-404`; `ROUTING.md:214-218` |
| 6. Charter read-only | Plumb (prose) | 11 seats (prose absent); hand; every tier mechanically | zero matches for `charter\|seat-memory` in live hooks/extensions | `reader-E-rule-trace.md:455-466` (E-18, E-19); `INVENTORY.md:485-487` |
| 6. Memory human-promoted | 12 seats (prose, template `:332-333`) | hand; every tier mechanically | as above | same |
| 7. ctx consult-before-search | all OMP sessions (refusal) | — | — | `X/ctx-first-search.ts:235-236` (D-6, D-7) |
| 7. ctx: ground in retrieved evidence, cite, check health, do not invent history | nobody | all three | the gate flips on call, not result (D-8); `status` excluded (D-19); `blame` does not count (D-9); guard that would require citations is unregistered and needs `MARCHES_SEAT`, exported by nothing (D-10) | `ctx-first-search.ts:222-226,:287-288,:110`; `O/hooks/ctx-search-guard.mjs:47-49`; `launch-seat` `MARCHES_SEAT` → 0 |
| 7. ctx corpus | Claude Code / Codex / Cursor / Copilot / Kimi / OpenClaw history (8 sources) | every OMP seat and hand — 581 `.jsonl` under `~/.omp/agent/seat-sessions/`, newest today, indexed by nothing | `ctx search` returns nothing from any OMP session; the index is current through 2026-09-21, so it is coverage, not lag | `ctx sources --all` (D-3); `ctx search -- "ReaderRuleTrace"` (D-13); `--since 3d` (D-14); `INVENTORY.md:529` confirmed |

## 8. ctx — role versus machinery

**CLAIM — what ctx is, on this machine**
`ctx 1.5.0`, data root `~/.ctx` (`CTX_DATA_ROOT` unset), one root shared by the CLI and the MCP
server because `/Users/jowolff/.omp/agent/mcp.json:8-16` sets neither env nor `--data-root`
(D-1). `ctx status` → `! ctx is partially ready`, `Sessions 1,687`, 52,314 messages, 67,051 tool
calls, daemon running, semantic ready (D-2). The MCP surface a session sees is seven read-only
tools: `search, blame, status, sources, show_event, show_session, query_events` (D-21).

**CLAIM — intended role, per tier, from the only text that states one**
The single governing text is `/Users/jowolff/.claude/skills/ctx/SKILL.md` (237 lines), a vendor
skill listed in every tier's `<skills>` block including hands (D-5). Its imperatives: search
prior sessions before starting or resuming work (`:3`); keep conclusions grounded in retrieved
evidence (`:12`); if ctx is unavailable say so and do not invent history (`:41`); confirm
readiness with `ctx status`/`ctx sources` when cold (`:80`); do not treat an empty result as
proof of no prior work (`:161`); `ctx blame` for provenance (`:3,:151-169`); citation format
provider / session id / event id (`:220-227`). No first-party document — no charter, no plugin
agent or reference, not `CLAUDE.md`, `orchestrator.md`, or `ROUTING.md` — adds, narrows, or
assigns any of this to a tier (D-4; `JUDGEMENT.md:917,:1147,:1149` are retrospective narrative,
D-20). So the intended role is identical at all three tiers by default, because it is stated
once for everyone and specialized for no one.

**CLAIM — what feeds it**
Eight `available` sources, all automatic discovery: Codex, Pi, Claude Code, Cursor, Copilot,
Kimi, OpenClaw (`ctx sources --all`, D-3). None is under `~/.omp/agent/seat-sessions/`, which holds
581 `.jsonl` transcripts, newest 2026-09-22 (D-3). The `Pi` source — the provider name matching
the harness every seat runs on — points at `/Users/jowolff/.pi/agent/sessions` and holds 2 files,
newest 2026-09-10 (D-16). A string that exists only in today's seat transcripts returns hits
only from Claude Code sessions dated 2026-08-25 (D-13), and the index is current through
2026-09-21 (D-14): the gap is source coverage, not indexing lag. `INVENTORY.md:529` confirmed.

**CLAIM — a route exists to add the seat transcripts; whether it works is untested**
`ctx sources add <NAME> --provider <PROVIDER> --root <PATH>` registers a named provider root
(`ctx sources add --help`, this session); the `providers` doc says "configured-root support is
provider-specific" and that each provider's `configured_root` object in
`provider-support-matrix.json` publishes whether named roots are enabled; the `Pi` provider's
format is `pi_session_jsonl` (`ctx docs show provider-support`, row 76). The matrix itself is not
an embedded docs topic (`ctx docs show provider-support-matrix.json` → unknown topic), so the
enabled/limited flag for `pi` was not read.

**GUESS**
`ctx sources add omp-seats --provider pi --root ~/.omp/agent/seat-sessions` would index the seat
and hand transcripts. Basis: OMP is `pi-coding-agent` and writes `.jsonl` sessions; the Pi
provider format is `pi_session_jsonl`. Two unknowns: whether `pi` has configured roots enabled,
and whether OMP's per-seat subdirectory layout matches the provider's expected tree. What settles
it: running that command once (it writes `~/.ctx/config.toml` — outside this seat's write
boundary, so it is a proposal, not an action) and then `ctx search -- "ReaderRuleTrace"`.
Reader D's `G-D-3` and `G-D-4` are subsumed by this one.

**CLAIM — what reads it, and what the machinery holds anyone to**
Reads happen through the MCP tools or the CLI, at any tier, on the agent's initiative. The only
machinery is `X/ctx-first-search.ts`, loaded ambiently for every OMP session and re-instantiated
per hand (`:206-209`; `executor.ts:3750-3752`; two `factory_loaded` rows 11 ms apart, D-7). It
holds a session to exactly one thing: a ctx *search* must have been *called* before the first
`grep`/`glob`/`web_search` (`:235-236`, refusal text `:197-202`). It does not hold anyone to
reading the result (`:61-66`, conceded in the file), to a result that arrived (`:222-226` flips on
`tool_call`; this session's `mcp__ctx_search` timed out at 30 s and still satisfied it, D-8), to
checking health (`ctx status` explicitly excluded, `:287-288`, while `SKILL.md:80` names it as
the cold-start step, D-19), to using `blame` (does not satisfy, D-9), or to citing (the only
artifact that would require a `ctx:` line per brief, `O/hooks/ctx-search-guard.mjs`, has 0
registrations and keys on `MARCHES_SEAT`, which `launch-seat` never exports — D-10). Gate log:
`/Users/jowolff/.claude/orchestrator/build/ctx-first-search.jsonl` — 472 `factory_loaded`,
331 `gate_satisfied`, 529 refusals (`INVENTORY.md` § 3.6 figures, Reader D's count).
`launch-seat:200-216` validates the ctx MCP *definition* and never contacts the server (D-15).

**CLAIM — the shape**
The rule "search prior agent work before starting" is enforced, once per session, at every OMP
tier, against a corpus that contains zero bytes of any OMP seat's or hand's prior work. A hand
that complies is told about Jo's Claude Code and Codex sessions, never about what the seat it
belongs to did yesterday (`reader-D-ctx.md:366,:374-377`). The seats' own continuity is carried
instead by decision-log entries, `session-handoff.md`, and the compaction summaries — none of
which ctx indexes either, because they are files in repos, not provider history.

## 9. Receipts back into the inventory

**CLAIM — inventory corrections discovered in Phase 2**

| inventory row | was | is now | receipt |
|---|---|---|---|
| `INVENTORY.md:380` | GUESS: whether the `Stop` bridge fires inside a hand's child session | CLAIM: it does not. `#emitSessionStopEvent` returns before emitting when `this.#agentKind === "sub"` | `OMP_SRC/session/agent-session.ts:4248`; 0 of 10 hand transcripts in `/Users/jowolff/.omp/agent/seat-sessions/plumb/2026-09-22T05-52-33-604Z_01a0c7ac-4f44-7000-97e6-5f4c9833362f/` contain `mute output-types-guard`, the seat transcript contains 1 |
| `INVENTORY.md:400` | GUESS: the seat contract does not reach a hand | CLAIM: `buildSubagentSessionOptions` has no append-prompt key; hand transcripts contain the contract only as quoted tool output | `OMP_SRC/task/executor.ts:3708-3812` (grep `appendPrompt\|appendSystemPrompt` → 0); `sdk.ts:3269`; `ReaderRuleTrace.jsonl:28`, `ScoutOmpHome.jsonl:49`, `ReaderSeatLifecycle.jsonl:128` |
| `INVENTORY.md:222` / `:503-505` | contradiction stated as two live mechanisms | one of the two, `SendMessage`, is not a tool under OMP; the contradiction is stale text, the `claude` CLI half is live and unguarded | `grep -rn '"SendMessage"' OMP_SRC --include=*.ts` → 0; `extensibility/extensions/types.ts:1617` is a hook-IPC type; this seat's tool list |
| `INVENTORY.md:529` | seat transcripts not a ctx source | confirmed, with the count and freshness | `ctx sources --all`; 581 `.jsonl`, newest 2026-09-22 (D-3) |
| `INVENTORY.md:519` | `ctx-search-guard.mjs`, `ctx-history-inject.mjs` unregistered | confirmed; and `ctx-search-guard.mjs` would gate nothing outside `~/.claude` even if registered (`MARCHES_SEAT` → 0 in `launch-seat`) | D-10, D-11 |
| `INVENTORY.md:362` | `MARCHES_SEAT` | confirmed never exported by `launch-seat` | `grep -c MARCHES_SEAT launch-seat` → 0 (D-10) |

**CLAIM — finding → inventory row**

| review § | finding | `INVENTORY.md` row |
|---|---|---|
| 1 | five layers, three mechanisms, no precedence machinery | `:299-308`, `:326-327`, `:344-350`, `:376`, § 2.1 `:225` |
| 1 | charter is fetched, not delivered | `:345-346` |
| 2 | hand inherits context files, skills, extensions; not charter/memory/contract | `:398-412`, `:400` (corrected above) |
| 2 | `${CLAUDE_PLUGIN_ROOT}` unexpanded in agent bodies | `:404` |
| 2 | four frontmatter keys dropped; project-dir pins honoured | `:334`, `:408`, `:415` |
| 3 | three contradictions of twelve | `:219-233`, `:221`, `:222`, `:226`, `:366`, § 4.1 |
| 4 r1 | envelope never checked for hands; labels-only on Stop | `:380` (corrected), `:376` |
| 4 r2 | no `agent_type` → hands treated as main | `:381`, `:384-386`, `:537-539`, `:305-306` |
| 4 r3 | Glob branch dead; always-on; textual matcher | `:367`, `:388` |
| 4 r4 | one channel guarded of five; `claude` CLI unguarded | `:349`, `:400`, `:421-424`, `:427-429`, `:503-505` |
| 4 r5 | model pin here only; gate unread by machinery | `:415`, `:466` |
| 4 r6 | no machinery; prose in 1 of 12 | `:453`, `:485-487`, § 4.1 (f) |
| 4 r7 / 8 | ctx: one imperative enforced, corpus excludes OMP | `:125`, `:126`, `:145`, `:313`, `:330`, `:362`, `:431`, `:519`, `:529` |
| 5 | drift subset; refusal-text drift | `:224`, `:453`, `:455`, `:511`, § 4.2, § 5.3 |
| 6 | reading cost against reach | § 6 `:553-652` |
| 7 | tier-gap table | rows as cited in-table |

**CLAIM — reader GUESSes, disposition**

| id | statement | disposition |
|---|---|---|
| E-G1 | Stop bridge may fire in a hand | settled, no — `agent-session.ts:4248` |
| E-G2 | contract does not reach a hand | settled, correct — `executor.ts:3708-3812` |
| E-G3 | `SendMessage` may not exist under OMP | settled, correct — 0 registrations in `OMP_SRC` |
| E-G4 | `P/references/orchestration-patterns.md` model table agrees with the charter | open; low stakes — settles by opening the file |
| E-G5 | `charter` in three dead `O/hooks` files is not a seat-charter path | open; all three dead under OMP regardless |
| E-G6 | figures "12 seats", "11 of 12", "6 live extensions" are the inventory's | correct as labeled; they are `INVENTORY.md`'s counts (§ 1, § 4.1 (f), § 3.2) |
| G-D-1 | two `gate_satisfied` rows are one per hand | open; settles by adding agent id to the log payload |
| G-D-2 | any failing ctx call satisfies the gate | open; the code path (`:222-226`) supports it, only the timeout case observed |
| G-D-3, G-D-4 | no supported route to add seat transcripts / Pi provider targets upstream pi | partly settled: `ctx sources add --provider <p> --root <path>` exists; `pi` configured-root support unread — folded into the § 8 GUESS |
| G-D-5 | `ctx-history-inject.mjs` body shells out to `ctx search` | open; dead under OMP regardless |
| G-D-6 | hands inherit the parent's ctx MCP server | open; D-21 shows the tools present in a hand, mechanism unread |

**ACTION — Plumb's own checks this session (first-party, all read-only, nothing to reverse)**
`grep -c` over the ten hand `.jsonl` and the seat `.jsonl` for `mute output-types-guard` and
`persistent-seat communication contract`; `grep -n session_stop` across `OMP_SRC` and
`read agent-session.ts:3770-3790,4240-4252`; `grep -n appendPrompt\|appendSystemPrompt` over
`executor.ts` (0) and `sdk.ts:3269`; `read executor.ts:3708-3785`; `grep -rn '"SendMessage"'`
over `OMP_SRC` (0); `ctx sources add --help`; `ctx docs show providers` / `provider-support` /
`docs list` / `docs search "pi configured root"`. All exit 0.

## 10. Skills — what reaches a session, and what any of it binds

**CLAIM — the population**
`INVENTORY.md` § 8 (`:681-843`, appended in Phase 2; generated by
`/Users/jowolff/code/agent-system-2.0/scripts/enum-skills.sh`) enumerates 118 distinct skill
names across five roots plus one Homebrew indirection: `~/.omp/agent/skills` p100 (1),
`~/.claude/skills` p80 (15 real dirs + 37 symlinks, 0 empty), newdle plugin p70 (63), claudex-loop
plugin p70 (4), `~/.agents/skills` p70 (47), and `/opt/homebrew/opt/peon-ping/libexec/skills/`
reached only through four `SKILL.md` symlinks. 29 carry `disable-model-invocation: true`; the
remaining 89 are exactly the 89 names in this seat's `<skills>` block, and a hand's block is the
parent's (`OMP_SRC/task/executor.ts:3745`; Reader D saw `ctx` in its own block, D-5). Every tier
sees the same list: there is no per-tier, per-seat, or per-hand skill scoping anywhere
(`INVENTORY.md:345` — `skillOverrides` unread; `:408` — agent `skills:` frontmatter unread).

**CLAIM — three Phase 1 rows corrected by the enumeration**
`INVENTORY.md:161` (12 dirs / 43 symlinks / 4 empty) is wrong and `:347` (15 / 37) is right; the
four "empty" `peon-ping-*` dirs are in `~/.agents/skills`, not `~/.claude/skills`, and the
`~/.claude` ones hold Homebrew symlinks a `find -type f` cannot see. `:349` names `new-seat` as
hidden; it is not (no `disable-model-invocation` key; present in the block). `:168`'s "112
candidates" is 167 entries / 118 names. Receipts: `INVENTORY.md:695-711`.

**CLAIM — skills as rule carriers, against § 4**
Two of the seven rules in § 4 have a skill as their *only* written form at some tier: rule 3's
text lives in `P/skills/careful/SKILL.md` for every tier that has no `## Boundaries` section
(Lintel, ten Tron-generation seats, every hand), and rule 7's text lives in
`/Users/jowolff/.claude/skills/ctx/SKILL.md` for every tier (D-4). Two more skills carry seat
lifecycle rules the review traced under rule 4 and rule 6: `new-seat` (the template that emits
`SendMessage`/`claude agents` into charters, `INVENTORY.md:511-512`) and `seat-shutdown` (two
copies, the OMP one winning, `:456`). Each is a sentence the model may or may not load — a skill
body is fetched on demand, its description is what every turn pays for — and no machinery reads a
skill body at any tier: the `disable-model-invocation` flag is the only skill-level switch OMP
honours (`INVENTORY.md:349`), and it hides, it does not enforce.

**CLAIM — drift inside the skill population**
Same name, two real copies, both local, the older winning by loader priority: `html-report`
(`~/.claude/skills`, 2026-07-01, p80) over `~/.agents/skills/html-report` (2026-07-24); `jo-deck`
(`~/.claude/skills`, 2026-06-18, p80) over `~/.agents/skills/jo-deck` (2026-07-24); `diff -rq`
differs for both (`INVENTORY.md:715-724`). `handoff` exists in three roots, the plugin copy never
loads. `seat-shutdown` is the deliberate case (§ 5). The four `claudex-loop` skills come from a
plugin root Phase 1 did not name, so the inventory's own source list was one short until § 8.

**CLAIM — what the reading cost buys, revised for skills**
`INVENTORY.md:567-568` excluded skill descriptions from the per-tier token counts. The enumeration
gives the count that exclusion hid: 89 name-plus-description entries in every OMP session's
system prompt, at all three tiers, at every turn, with no scoping. The description text is
OMP's own rendering and was not tokenized here.

**GUESS**
The 89 descriptions cost on the order of 5–8k tokens per turn per session. Basis: 89 entries whose
descriptions in the `<skills>` block of this seat's prompt run from one line to a paragraph; not
measured. What settles it: dump the rendered `<skills>` block from one session's stored system
prompt and run it through the same o200k counter Phase 1 used (`.tmp/phase1/tokcount.mjs`).

**ACTION — the enumeration hand, and why Plumb ran the script instead**
One `scout` hand (`ScoutSkills`, haiku per `.omp/agents/scout.md:4`) was dispatched on Jo's
confirmed plan and cancelled after 25 minutes with no output file. Its transcript shows why: the
definition's `tools: read, grep, glob` line (`.omp/agents/scout.md:6`) left it a `write` tool
"limited to the xd:// device transport" — every one of its eight attempts to write the report or a
helper script errored — after which it tried `agent` (errored) and `seat_message` to a target
named `scout` (errored, not an allowlisted seat). No file outside `.tmp/` was written by it. The
task was a delegation error on Plumb's side: a read-only hand type given a file-writing brief.
Plumb wrote `scripts/enum-skills.sh` (zsh, 21 s, exit 0) and ran it twice; reversal is
`git rm scripts/enum-skills.sh` and dropping `INVENTORY.md` § 8.

---

<!-- output-types
tier: 2
CLAIM: 40
CITE: 0
GUESS: 2 (inference 2)
ACTION: 2
PMDW: 0
QUESTION: 2
-->
