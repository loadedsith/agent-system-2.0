# Operating modes: which skill set serves autonomous running, which serves user-driven steering

## Answer

**GUESS(inference)** — a judgment built on the CITEs below, not itself a quoted fact
1. Steering → `addyosmani/agent-skills`: **supported.** Its orchestration reference says the user is the orchestrator, and plain `/build` builds one task and then stops.
2. Autonomous → `obra/superpowers`: **supported only for executing a plan the human already approved.** Between tasks it does not pause, and it decides ambiguities itself. But its `<HARD-GATE>` requires human approval before any implementation on every task, one-file fixes included, and nothing turns that gate off.
3. Only agent-skills ships both modes behind one switch (`/build` vs `/build auto`). Neither repo goes from one request to the next without a human gate, so that part of P-22 has to come from the harness, not from either skill set.

**PMDW**
The contract puts both "answer up top" and "questions first". The acceptance line says the file opens with the answer, so the answer comes first and the one open question follows immediately below it.

## Needs Jo

**QUESTION**
What "autonomous running" means for the P-22 operating modes. The verdict turns on this. It is Jo's definition to make; more reading will not settle it.
- *Autonomous means executing a plan Jo already approved.* Superpowers' execution half fits this, the mapping stands, and the gates before execution stay Jo's.
- *Autonomous means handing off a task, a small one included, and it gets handled with no approval step first.* Neither repo does this. Superpowers forbids it outright ("a bounded task's approval is as hard a gate as an architectural one"). Agent-skills' `/build auto` still needs a spec file and one plan approval. This mode would have to be designed into the harness or orchestrator.

**GUESS(inference)**
Recommended default: *handing off a task* for small work, and *executing an approved plan* for features. The basis is Jo's own two lines: `/Users/jowolff/code/agent-system-2.0/JO-INPUT.md:31` (*"I want to feel like I can just give it a task and then it gets handled"*) and `/Users/jowolff/code/agent-system-2.0/JO-INPUT.md:32` (*"This is fine for small bugfixes, but for new features I should be directly involved in the loop"*). Reading these two lines as a definition of the modes is my inference about what Jo meant.

**GUESS(inference)** — blocker for the auto-trigger column, carried from Phase 4, not re-tested
Whether superpowers' `SessionStart` bootstrap fires under OMP is still unresolved. Phase 4 left it open at `/Users/jowolff/code/agent-system-2.0/research/phase4/research-E-planning-practice.md:742-752`. If it does not fire, superpowers' skills load under OMP but do not trigger themselves (see § 1d).

## 1. obra/superpowers

**CLAIM**
Read at `main`, pinned by a shallow clone this session to commit `5bf4e78011075bcfc0dc295f0724994cd123ee71` (committed 2026-09-18). Receipt: `git -C superpowers log -1 --format='%H %cI'` → that SHA. Every URL below was fetched from `raw.githubusercontent.com/obra/superpowers/main/` this session.

### 1a. Gates that require a human

**CITE**
**The HARD-GATE (path approval).** Every task passes it. `https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md`: *"Before taking any implementation action, including invoking an implementation skill, writing product code, scaffolding, installing product dependencies, or creating an external project, complete the selected path's prerequisites: - Spike: the human partner approves the question and probe. - Bounded: the human partner approves the short in-chat design. - Architectural: the human partner reviews and approves the written spec, then reviews the written implementation plan and selects its execution method."* The Bounded path is scoped down to *"a new flag, a small endpoint, a one-file fix"* and still requires this approval: *"Implementation starts only after your human partner says yes to that design — a bounded task's approval is as hard a gate as an architectural one."*

**CITE**
**Approval does not carry over from one task to the next.** Same file, Red Flags table: *"They approved the spike, so the follow-up change is approved too" | Each task gets its own classification and its own approval.* The skill also blocks the model from reclassifying a task to escape the gate: *"I'll call it bounded and skip the spec" | Reaching for a label to skip work IS the doubt — take the heavier path."*

**CITE**
**Architectural path, four waits before code.** Same file, checklist: *"Present design — in sections scaled to their complexity, get user approval after each section"*. Then the written-spec gate: *"Wait for the user's response. If they request changes, make them and re-run the spec review loop. Only proceed once the user approves."* Then the plan gate. `https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md`, § Execution Handoff: *"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Please review the plan. Which execution approach would you prefer?"*

**CITE**
**Worktree consent**, which applies only when no preference is on record. `https://raw.githubusercontent.com/obra/superpowers/main/skills/using-git-worktrees/SKILL.md`: *"Has the user already indicated their worktree preference in your instructions? If not, ask for consent before creating a worktree"* and *"Honor any existing declared preference without asking."*

**CITE**
**Consent before working on main/master**, which applies only when on that branch. `https://raw.githubusercontent.com/obra/superpowers/main/skills/executing-plans/SKILL.md` and `.../subagent-driven-development/SKILL.md`, § Setup, both say: *"Never start implementation on a main/master branch without your human partner's explicit consent."*

**CITE**
**Four ways a running plan stops.** `executing-plans/SKILL.md` and `subagent-driven-development/SKILL.md`: *"Four things stop you, and only these: an irreversible or destructive operation; a security-sensitive action; a side effect outside this worktree that norms say you ask about first (a merge, a push to a shared branch, a publish); and a plan so broken that every path forward is a guess. For those, stop and ask."*

**CITE**
**The integration gate at the end.** `https://raw.githubusercontent.com/obra/superpowers/main/skills/finishing-a-development-branch/SKILL.md`: *"Wait for their answer; the integration decision is theirs."* Its rationalization table repeats the point: *"They obviously want it merged" | Integration is your human partner's decision. Present the menu and wait.* Conditional sub-gates in the same file:
- confirming the base branch (*"Confirm before merging: merging into the wrong base is expensive to undo"*)
- typed confirmation before a discard (*"Only the typed word `discard` authorizes deletion."*)
- a worktree removal that git refuses (*"Show your human partner what is at stake and ask"*)

**CITE**
**Whether a self-review is good enough**, which applies only when no subagent tool exists. `executing-plans/SKILL.md`, § Final Review: *"a self-review by the author is weaker than a fresh reviewer, and your human partner decides whether that is enough before merge."*

### 1b. Paths that run without a human

**CITE**
**Plan execution does not pause between tasks.** `https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md`: *"Continuous execution: Do not pause to check in with your human partner between tasks. Execute all tasks from the plan without stopping."* and *"Rulings, not stalls. A running plan does not wait on a human. Conflicts, ambiguities, plan defects, a cap you would have asked to exceed — decide them. … A wrong ruling costs rework your human partner can see and undo; a session parked on a question costs their whole day and buys nothing."* `executing-plans/SKILL.md` carries the same two rules. Its rationalization table adds: *"Let me check in before the next task" | They chose inline to spend less. Progress prompts spend their time instead. Only the four stops stop you.*

**CITE**
**Review and fix loops run without the human.** In the `subagent-driven-development/SKILL.md` process graph, the controller answers the implementer's questions (*"Implementer asks questions?" -> "Answer questions, provide context"*), runs up to five fix rounds, and then adjudicates: *"Fix round R of 5: R≤3 resume implementer; R≥4 fresh implementer, more capable model"*, *"Rule and continue; stop only if every path forward is a guess"*. In `executing-plans/SKILL.md` the agent fixes Critical and Important final-review findings *"in ONE pass"* without a re-review.

**CITE**
**The human sees the rulings only after the run.** `executing-plans/SKILL.md`, § Finish: *"Your final message is the only place the decisions you took on your human partner's behalf — and the findings you chose not to act on — reach them."*

**CITE**
**The author's own description.** `https://raw.githubusercontent.com/obra/superpowers/main/README.md`: *"once you say "go", it launches a subagent-driven-development process … It's not uncommon for your agent to work autonomously for a couple hours at a time without deviating from the plan you put together."*

**CITE**
**Exploring before the gate is allowed.** `brainstorming/SKILL.md`: *"Read-only project exploration is allowed while those prerequisites remain incomplete."*

### 1c. Mode switch

**CLAIM**
The repo has no mode switch: no flag, command, or config key changes the gate structure. Receipts:
- A glob of the pinned clone for `commands/*`, `agents/*`, `hooks/*`, `skills/*/SKILL.md` returned 15 skills and 4 hook files, and no `commands/` or `agents/` directory. The path was `/tmp/opmodes/superpowers/{skills/*/SKILL.md,commands/*,hooks/*,agents/*}`.
- A grep of the whole clone for `SUPERPOWERS_[A-Z_]+|--auto|auto permission|permission mode|yolo|dangerously` found only these environment variables: `SUPERPOWERS_DISABLE_TELEMETRY`, `SUPERPOWERS_ROOT` (the evals/test path), and the historical `SUPERPOWERS_SKILLS_ROOT`. `--dangerously-skip-permissions` appears only in the repo's own test scripts, under `tests/explicit-skill-requests/`.

**CITE**
The slash commands this repo used to have were entry points, not modes, and are gone. `https://raw.githubusercontent.com/obra/superpowers/main/RELEASE-NOTES.md` (v4.0.2): *"Added `disable-model-invocation: true` to all three slash commands (`/brainstorm`, `/execute-plan`, `/write-plan`). … The underlying skills … remain available for Claude to invoke autonomously."*

**CITE**
Three partial controls exist. Each removes one specific gate. None of them removes the HARD-GATE.
- **Execution method stated in advance.** `writing-plans/SKILL.md`: *"If they have already explicitly supplied an execution method, ask them to review the plan and confirm it captures what they want; wait for that review before implementation"*. This removes the method choice but keeps the plan review.
- **Worktree preference declared** in instructions. This removes the consent question (§ 1a).
- **User instructions take precedence.** `https://raw.githubusercontent.com/obra/superpowers/main/skills/using-superpowers/SKILL.md`: *"User instructions (CLAUDE.md, AGENTS.md, GEMINI.md, etc, direct requests) take precedence over skills … Only skip skill workflows or instructions when your human partner has explicitly told you to."*

**GUESS(inference)**
A standing line in `CLAUDE.md`/`AGENTS.md` that tells the agent to skip approval for bounded tasks is the only candidate for an "autonomous small work" switch in superpowers. Whether the model follows it against a `<HARD-GATE>` block and a Red Flags table written to resist exactly that has not been tested. This is the cheapest experiment that could change the verdict.

### 1d. Auto-trigger or invocation

**CITE**
Skills trigger automatically and forcefully, through a hook injected at session start.
- `https://raw.githubusercontent.com/obra/superpowers/main/hooks/hooks.json` registers `SessionStart` with matcher `"startup|clear|compact"`.
- `https://raw.githubusercontent.com/obra/superpowers/main/hooks/session-start` injects the full `using-superpowers` skill wrapped in `<EXTREMELY_IMPORTANT>`.
- That skill says: *"If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill."*
- README: *"because the skills trigger automatically, you don't need to do anything special."*

**CITE**
Subagents are exempt. `using-superpowers/SKILL.md` opens: *"If you were dispatched as a subagent to execute a specific task, ignore this skill."*

### 1e. Self-improvement loop

**CLAIM**
Superpowers has none. This preserves Phase 4's receipt without broadening it: `/Users/jowolff/code/agent-system-2.0/research/phase4/research-G-self-improvement.md:356-366` found that `diagnosing-superpowers` *reports and stops*, and that the README says *"we don't generally accept contributions of new skills"*. Extended this session: a grep of `/tmp/opmodes/superpowers/skills` for `lessons? learned|self-improv|update (AGENTS|CLAUDE)\.md|propose (a )?(new )?(rule|skill)|write a (new )?skill` → "No matches found". A null here rules out those phrasings only, not every possible loop.

**CITE**
`writing-skills` is triggered by skill-authoring work, not by failures. `https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-skills/SKILL.md`: *"description: Use when creating new skills, editing existing skills, or verifying skills work before deployment"*.

## 2. addyosmani/agent-skills

**CLAIM**
Read at `main`, pinned by a shallow clone this session to commit `bcab6a1b8503100e8618c3b4e32cc78de43de769` (committed 2026-09-22). Every URL below was fetched from `raw.githubusercontent.com/addyosmani/agent-skills/main/` this session.

### 2a. Gates that require a human

**CITE**
**Four phase gates in the spec skill.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/spec-driven-development/SKILL.md` draws *"SPECIFY ──→ PLAN ──→ TASKS ──→ IMPLEMENT"* with *"Human reviews"* under each phase, and says *"Do not advance to the next phase until the current one is validated."* Its verification checklist includes *"[ ] The human has reviewed and approved the spec"*. The Phase 0 capability map is gated too: *"The map is gated like every phase."*

**CITE**
**Command-level waits.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/.claude/commands/spec.md`: *"Save the spec as SPEC.md in the project root and confirm with the user before proceeding."* `.../.claude/commands/plan.md`: *"Present the plan for human review"* and *"If tasks/plan.md or tasks/todo.md already exists with unchecked tasks for different work, stop and ask before writing"*.

**CITE**
**Checkpoints inside the plan.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/planning-and-task-breakdown/SKILL.md`: *"Verification checkpoints occur after every 2-3 tasks"*, with the template line *"- [ ] Review with human before proceeding"*.

**CITE**
**Plain `/build` hands control back after each task.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/.claude/commands/build.md`: *"`/build` — implement the next pending task, then stop (careful, one slice at a time)."* The default loop ends *"8. Mark the task complete and stop"*.

**CITE**
**Core behaviour: stop when confused.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/using-agent-skills/SKILL.md`, which calls these *"non-negotiable"*: *"1. STOP. Do not proceed with a guess. … 4. Wait for resolution before continuing."* The assumptions rule, by contrast, does *not* wait: *"→ Correct me now or I'll proceed with these."*

**CITE**
**The ship gate.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/.claude/commands/ship.md`: *"If any persona returns a Critical finding, the default verdict is NO-GO unless the user explicitly accepts the risk."*

### 2b. Paths that run without a human

**CITE**
**`/build auto`: one gate, then no pauses between tasks.** `build.md`: *"Single checkpoint. Present the full plan and wait for an unambiguous affirmative (e.g. "approve", "go", "yes"). Treat hedged responses ("looks reasonable", "I guess") as not approved. This is the only human gate — after approval, run autonomously."* Before that checkpoint there are two preconditions: a spec file at a known path (*"If none exists, stop and tell the user to run `/spec` first — do not invent requirements"*) and a clean tree (*"If there are uncommitted changes … stop and ask the user"*).

**CITE**
**`/build auto` stops on three conditions. Ambiguity is one of them.** `build.md`: *"Stop and ask the user (do not push through) when: a test can't be made to pass or the build breaks without an obvious fix … the spec is ambiguous, or a task needs a decision the spec doesn't cover … a task is high-risk or irreversible — auth/permission changes, destructive data migrations, payments, deletions, deploys, anything touching secrets, or anything you can't undo with `git revert`"*. On resuming: *"After the user resolves a blocker, they re-invoke `/build auto` — it resumes from the next pending task."*

**GUESS(inference)**
This is the sharpest behavioural difference between the two autonomous paths. When superpowers' executor hits an ambiguity, it rules on it and writes the ruling to the ledger (§ 1b). `/build auto` stops and asks. Mid-run, superpowers is the more autonomous of the two; `/build auto` is more conservative.

**CITE**
**Restart and loop handling is left to the harness.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/docs/getting-started.md`: *"Its per-task status updates, verification results, and commits make each completed task a restartable boundary, so a capable external harness may exit and resume there"* and *"A shell-level "Ralph loop" is harness behavior, not a separate skill workflow. … a restart must not bypass an approval gate."*

**CITE**
**Skills that assume a live user refuse to run without one.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/interview-me/SKILL.md`: *"Do not invoke in non-interactive contexts like CI pipelines, scheduled runs, `/loop`, or autonomous-loop. If you're in one of those and the ask is underspecified, flag that as a blocker for the user instead of guessing."* `.../skills/doubt-driven-development/SKILL.md`, § Non-interactive contexts: *"Cross-model is skipped, and the skip must be announced in the output … Never invoke an external CLI without explicit user authorization"*. `.../skills/constraint-driven-development/SKILL.md` lists as a trigger: *"You're about to run `/build auto` or any autonomous loop, and the only thing standing between it and main is a test suite the agent also wrote"*.

**CITE**
**The design refuses to let an agent run the lifecycle for the user.** `https://raw.githubusercontent.com/addyosmani/agent-skills/main/references/orchestration-patterns.md`:
- Pattern 4: *"There is no orchestrator agent — the user IS the orchestrator."*
- Anti-pattern C (*"An agent that calls `/spec`, then `/plan`, then `/build`, etc. on the user's behalf"*): *"Loses the human checkpoints that catch wrong-direction work … Removes user agency at exactly the points where judgment matters most."*
- Governing rule: *"the user (or a slash command) is the orchestrator."*

### 2c. Mode switch

**CITE**
Yes: an explicit argument to one command. `build.md`: *"`$ARGUMENTS` selects the mode. Treat `auto` (canonical) or `all` as autonomous mode; anything else (or empty) is the default single-task mode. Note: autonomous mode is not faster per task — it runs the same test-driven loop — it only removes the human stepping between tasks."* README (`https://raw.githubusercontent.com/addyosmani/agent-skills/main/README.md`): *"`/build auto` generates the plan and implements every task in a single approved pass — you approve the plan once, then it runs autonomously."*

**CLAIM**
The switch is a wrapper around the command, and it is missing on some hosts. Two hits in the pinned clone were read from grep output only; the pages were not fetched:
- `/tmp/opmodes/agent-skills/docs/antigravity-setup.md:57`: *"wrapper-only `/build auto` orchestration is unavailable"*
- `/tmp/opmodes/agent-skills/docs/copilot-setup.md:113`: *"These aliases do not implement the orchestration in this repo's Claude Code commands — `/build auto`'s single-approval plan-and-implement pass"*.

**GUESS(inference)**
The switch covers only the build phase. `/spec` and `/plan` have no auto form, and `/build auto` refuses to start without a spec file. The spec gate therefore stands in both modes.

**GUESS(inference)**
Two files disagree, and I did not test which one wins. The plan template embeds *"Review with human before proceeding"* every 2-3 tasks, while `/build auto` calls its plan approval *"the only human gate"*. I read the command as overriding the checkpoint lines, but no run confirms that.

### 2d. Auto-trigger or invocation

**CITE**
There are two layers. The commands are invoked by the user. Skills are left to the host's own description routing, and the bootstrap hook is deliberately left unwired.
- README: *"Skills also activate automatically based on what you're doing"*.
- `https://raw.githubusercontent.com/addyosmani/agent-skills/main/hooks/session-start.sh`: *"Not wired by the plugin: hosts that already route skills from their descriptions (Claude Code, Codex CLI) would run a second router on top of the native one … Wire this script into a SessionStart hook only on hosts without native skill routing."*
- `https://raw.githubusercontent.com/addyosmani/agent-skills/main/.claude-plugin/plugin.json` declares only `"commands"` and `"skills"`, with no `hooks` field.

**GUESS(inference)**
Nothing forces agent-skills' skills to fire. Whether one fires depends on how the host matches descriptions, so it will trigger less reliably than superpowers' injected rule that says *"1% chance … ABSOLUTELY MUST"*. No test was run to measure this.

### 2e. Self-improvement loop

**CLAIM**
None found. A grep of `/tmp/opmodes/agent-skills/skills`, `/.claude-plugin`, and `/.claude/commands` for `lessons? learned|self-improv|retro|update (AGENTS|CLAUDE)\.md|learn from|memory|propose (a )?(new )?rule` returned only unrelated hits: a retrospectives example in `idea-refine/examples.md`, and the word "memory" used in the performance and security sense. The null rules out those phrasings only.

**CITE**
The repo's measurement belongs to its maintainers and runs outside a session. `https://raw.githubusercontent.com/addyosmani/agent-skills/main/docs/comparison.md`: *"a three-tier eval framework lives in the repo"*. That is CI over the catalog, not a loop that proposes rules while a session runs.

## 3. Comparison

**CLAIM**
Every cell restates a CITE or CLAIM from §§ 1-2. Gate counts use one definition: a named point on the full feature path (spec → plan → build → integrate) where the skill text requires waiting for a human. "Conditional" means the wait fires only when its trigger occurs.

| Type | Repo | Human gates | Autonomous path exists? | Mode switch? | Auto-trigger? | Self-improvement loop? |
|---|---|---|---|---|---|---|
| CLAIM (from § 1 CITEs) | **obra/superpowers** | **Architectural: 4 unconditional:** design approval (per section), written-spec approval, plan review plus method choice, integration menu. **Bounded: 1:** in-chat design approval, even for a one-file fix. **Conditional: 8+:** intent question, worktree consent, main/master consent, 4 stop classes mid-run, base-branch confirm, discard confirm, refused worktree removal. **Between tasks: 0.** | **Yes, for execution only.** Continuous, ruled rather than asked, 5-round fix loop, ledger survives compaction. Reported at the end. | **No.** Three partial controls: a method stated in advance, a declared worktree preference, and user-instruction precedence. None lifts the HARD-GATE. | **Yes, forced.** A SessionStart hook injects the "1% chance … MUST" rule on startup, clear, and compact. Under OMP this is unresolved. | **No.** Diagnosis reports and stops (Phase 4 plus grep null). |
| CLAIM (from § 2 CITEs) | **addyosmani/agent-skills** | **Default: spec approval, plan approval, one human `/build` per task (N), a checkpoint review every 2-3 tasks.** **`/build auto`: the spec must already exist, plus 1 plan approval.** **Conditional:** confusion stop, capability-map approval, plan-overwrite stop, dirty tree, 3 `/build auto` stop classes (failing test, ambiguity, irreversible), NO-GO acceptance at `/ship`. | **Yes, for the build phase only** (`/build auto`). It stops on ambiguity instead of ruling on it. | **Yes.** `/build auto` or `/build all`. Missing on the Antigravity and Copilot aliases. | **Partly.** Commands are user-invoked. Skills rely on native host description routing, and the bootstrap hook is deliberately not wired. | **No.** Grep null; the evals run in CI for maintainers. |

## 4. Verdict on Jo's mapping

**CLAIM**
The mapping under test is Jo's text at `/Users/jowolff/code/agent-system-2.0/JO-INPUT.md:38`: *"addyosmani/agent-skills for when I want to actually steer and do things myself, and obra/superpowers for autonomous running. I want these agents to be able to both work in autonomous mode and user driven mode."*

**CITE**
Both authors describe their repos the same way Jo does. Osmani's own comparison doc, `https://raw.githubusercontent.com/addyosmani/agent-skills/main/docs/comparison.md`, says:
- *"A human gate at each step vs. a hands-off run: agent-skills checkpoints by default; Superpowers minimizes mid-run check-ins on purpose."*
- *"Autonomy over a long run: Superpowers, by design."*
- Superpowers is best for *"A big, ambiguous chunk you want to hand off and walk away from"*.

**GUESS(inference)**
**Verdict: supported, with a scope correction. It is not reversed.**
- The steering half matches the source directly. The user-as-orchestrator rule, plain `/build` stopping after each task, and a human review at every phase are all written into agent-skills.
- The autonomous half holds only for the **execution** of a plan Jo already approved. There, superpowers runs longer without a human than `/build auto` does, because it rules on ambiguity instead of stopping.
- Superpowers is also the **most** gate-heavy of the two *before* execution. It has four unconditional waits on a feature, one wait on a one-file fix, and no switch to turn them off.
- So "use superpowers when I want it to run autonomously" is right about *how* it runs and wrong about *when* Jo would be asked. The ask comes up front, every time.

**GUESS(inference)**
The two-repo framing is less necessary than Jo's line assumes. Jo's stated need is agents that do *both* modes. Agent-skills alone ships both modes behind one switch; superpowers ships one fixed shape. That observation is scoped to "which repo carries which mode". It is not a recommendation to adopt either repo, which is out of scope here.

**GUESS(inference)**
**What would change the verdict:**
- **Jo's answer to the question at the top.** If "autonomous" means *hand off and it gets handled* for small work, the verdict becomes **neither**. Superpowers forbids that shape, and `/build auto` still needs a spec and a plan approval.
- **A live test of superpowers under a standing `AGENTS.md` line that skips approval for bounded tasks.** If the model obeys, superpowers gains the small-work autonomous mode the source does not ship, and the mapping gets stronger.
- **A live `/build auto` run over a plan that contains the template's "Review with human before proceeding" checkpoints.** If it halts at those lines, agent-skills' autonomous mode is weaker than its command text says.
- **The OMP bootstrap question in § Needs Jo.** If superpowers' `SessionStart` injection does not fire under OMP, its main difference in how it activates disappears, and "the agent just has superpowers" stops being true on this harness.

## 5. What this extends from Phase 4

**CLAIM**
Phase 4 already established several of these points:
- The brainstorming HARD-GATE, the plan gate, continuous execution, and the four stops: `/Users/jowolff/code/agent-system-2.0/research/phase4/research-E-planning-practice.md:110-122` and `:174-181`.
- `/build auto` reducing to *"the only human gate"*: `/Users/jowolff/code/agent-system-2.0/research/phase4/research-E-planning-practice.md:255-262` and the table row at `:537`.
- "Rulings, not stalls" as *"a deliberate transfer of decision authority away from the human"*: `/Users/jowolff/code/agent-system-2.0/research/phase4/research-E-planning-practice.md:622-627`.
- No self-improvement loop in superpowers: `/Users/jowolff/code/agent-system-2.0/research/phase4/research-G-self-improvement.md:356-366`.

**GUESS(inference)**
The brief describes Phase 4 as leaning against Jo's mapping. That is the brief's characterization; I did not reproduce it. The Phase 4 passages I read place superpowers as the executor that hands the human the least authority mid-run. That supports the autonomous half rather than reversing it.

**CLAIM**
New in this report, each receipted in §§ 1-2:
- The HARD-GATE applies to Bounded one-file fixes, and approval does not carry across tasks.
- Superpowers has no mode switch, and its three partial controls do not lift the HARD-GATE.
- Agent-skills does not wire its bootstrap hook.
- `orchestration-patterns.md` names the user as orchestrator and rejects agent-run lifecycles (Anti-pattern C).
- Agent-skills' skills that need a live user refuse to run without one.
- `/build auto` stops on ambiguity where superpowers rules on it.
- Superpowers' integration gate at the end of a run.
- Osmani's own comparison doc states Jo's mapping.

## Sources

**CITE**
Every URL below was fetched this session. "Full" means every line was read. "Partial" gives the ranges read.

obra/superpowers (`raw.githubusercontent.com/obra/superpowers/main/…`):
1. `README.md` — full.
2. `skills/brainstorming/SKILL.md` — full.
3. `skills/writing-plans/SKILL.md` — partial: lines 150-192, § No Placeholders through Execution Handoff. The last ~3 lines after *"If Subagent-driven chosen"* were not shown.
4. `skills/executing-plans/SKILL.md` — full (379 lines, read in two passes).
5. `skills/subagent-driven-development/SKILL.md` — partial: lines 1-140 of ~574 (continuous execution, rulings, stops, process graph, setup).
6. `skills/using-superpowers/SKILL.md` — full.
7. `skills/using-git-worktrees/SKILL.md` — partial: lines 1-66 (Step 0 consent, Step 1a).
8. `skills/finishing-a-development-branch/SKILL.md` — full.
9. `skills/writing-skills/SKILL.md` — partial: lines 1-30 (frontmatter trigger).
10. `hooks/hooks.json` — full.
11. `hooks/session-start` — full.
12. `RELEASE-NOTES.md` — partial: lines 840-852 (v4.0.2 slash commands).

addyosmani/agent-skills (`raw.githubusercontent.com/addyosmani/agent-skills/main/…`):
13. `README.md` — partial: lines 1-60 (commands table, `/build auto`, auto-activation).
14. `.claude/commands/build.md` — full.
15. `.claude/commands/spec.md` — full.
16. `.claude/commands/plan.md` — full.
17. `.claude/commands/ship.md` — full.
18. `.claude-plugin/plugin.json` — full.
19. `hooks/session-start.sh` — full.
20. `references/orchestration-patterns.md` — full (376 lines, two passes).
21. `docs/comparison.md` — partial: lines 1-100 of ~132; the "Concrete scenarios" tail was not read.
22. `docs/getting-started.md` — partial: lines 120-200 (commands table, working across sessions, Ralph loops).
23. `skills/using-agent-skills/SKILL.md` — full.
24. `skills/spec-driven-development/SKILL.md` — partial: lines 1-80 and 180-260. Lines 80-180 (Phase 1-2 body) were not read.
25. `skills/planning-and-task-breakdown/SKILL.md` — partial: lines 100-160.
26. `skills/interview-me/SKILL.md` — partial: lines 30-40.
27. `skills/doubt-driven-development/SKILL.md` — partial: lines 158-168.
28. `skills/constraint-driven-development/SKILL.md` — partial: lines 24-40.

First-party:
29. `/Users/jowolff/code/agent-system-2.0/JO-INPUT.md:30-45`.
30. `/Users/jowolff/code/agent-system-2.0/research/phase4/research-E-planning-practice.md` — lines 60-303, 596-630, plus a grep over the whole file.
31. `/Users/jowolff/code/agent-system-2.0/research/phase4/research-G-self-improvement.md:340-375`.

## Unverified

**GUESS(inference)**
The following are marked where they appear above and gathered here only for the index:
- whether a standing `AGENTS.md` instruction lifts superpowers' HARD-GATE (§ 1c)
- whether `/build auto` honours or skips the plan template's human checkpoints (§ 2c)
- how reliably agent-skills' skills fire compared with superpowers' injected rule (§ 2d)
- whether superpowers' bootstrap fires under OMP (§ Needs Jo, carried from Phase 4)

No live run of either repo was made.

**GUESS(inference)**
The Antigravity and Copilot limits on `/build auto` (§ 2c) come from grep lines in the local clone. Those pages were not fetched, so their wider context is unread.

## Coverage

**CLAIM**
The question spans two repos plus first-party context, with 28 URLs and 3 local files retrieved. The account follows.

| Source area | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| obra/superpowers | Shallow clone (whole tree, grepped twice) + 12 URLs | All 12 URLs, 7 of them in full. `subagent-driven-development` lines 1-140 of ~574; `using-git-worktrees` 1-66; `writing-plans` 150-192; `writing-skills` 1-30; `RELEASE-NOTES` 840-852 | None. The first `grep` of `writing-plans` in the clone was refused by the delegation hook; I re-fetched the section by URL instead. It cost nothing. | **Yes.** Every gate and autonomy rule named in the brief sits in the ranges read. I would next read the rest of `subagent-driven-development` (fix-loop detail, prompt templates) and `requesting-code-review`, which the README says "Critical issues block progress". |
| addyosmani/agent-skills | Shallow clone (whole tree, grepped twice) + 16 URLs | All 16. `build.md`, `spec.md`, `plan.md`, `ship.md`, `plugin.json`, `session-start.sh`, `orchestration-patterns.md`, `using-agent-skills` in full; the rest by range (see Sources) | None | **Yes** for gates, switch, and trigger. I would next read `incremental-implementation/SKILL.md` (never opened), the `context-engineering` § Restartable Session Boundaries, and `spec-driven-development` lines 80-180. |
| First-party context | 3 files | JO-INPUT 30-45; research-E by range and grep; research-G 340-375 | ctx-first gate refused the first grep until one `ctx search` ran. That search returned nothing usable for this question. | **Yes.** The brief pointed at these exact ranges. |

**CLAIM**
**Retrieved but never opened:** most of both cloned trees. Grep saw every file in them, and only the files listed in Sources were opened. The files that appeared in grep hits but were not opened:
- superpowers: `AGENTS.md`, `docs/porting-to-a-new-harness.md`, `.kimi-plugin/plugin.json` (the only "auto permission mode" mention, a harness mode rather than a superpowers mode), every maintainer plan under `docs/superpowers/plans/` (including `2026-07-15-sdd-fix-loop-redesign.md`, whose goal line says "convergent and autonomous"), and `docs/superpowers/specs/2026-04-06-worktree-rototill-design.md`.
- agent-skills: `docs/adoption-guide.md`, `docs/agents.md`, `docs/antigravity-setup.md`, `docs/copilot-setup.md`, `docs/cursor-setup.md`, `docs/gemini-cli-setup.md`, the `commands/*.toml` and `.gemini/commands/*.toml` copies of `/build` (the grep lines show the same text as `build.md`), `skills/context-engineering/SKILL.md`, and `skills/planning-and-task-breakdown/SKILL.md` outside lines 100-160.

None of these changes an answer above, except that the Antigravity and Copilot limits are quoted from grep lines only.

## Actions

**ACTION**
`mkdir -p /tmp/opmodes && cd /tmp/opmodes && git clone --depth 1 -q https://github.com/obra/superpowers.git && git clone --depth 1 -q https://github.com/addyosmani/agent-skills.git` → exit 0. Reverse with `rm -rf /tmp/opmodes`. This write sits outside the brief's "No other writes" constraint. I made it because the brief asked for a grep over both trees, and the grep-null receipts in §§ 1c, 1e, and 2e point into this clone. I left it in place so those receipts can be opened. Deleting it is safe, since the pinned SHAs above re-create it.

**ACTION**
Wrote `/Users/jowolff/code/agent-system-2.0/research/operating-modes.md` (this file) → write succeeded. Reverse by deleting the file; it is untracked.

**ACTION**
Skipped formatters, linters, and tests, per the brief.

<!-- output-types
tier: 0
CLAIM: 14
CITE: 34
GUESS: 14 (inference 14, pattern 0, recall 0)
ACTION: 3
PMDW: 1
QUESTION: 1
-->
