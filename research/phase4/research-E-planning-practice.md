# Research E — planning practice for P-12: which one, and what each actually does

## Question

**PMDW**
P-12 says Jo can choose, per project, to spec and plan it through the system before anything
executes; the option is offered at the appropriate time; not every task needs it. Jo's verbatim
open question (PREFERENCES.md P-12) names three candidates — OMP's own plan mode,
`obra/superpowers`, `addyosmani/agent-skills` — against the 1.x planning artifacts Jo already
owns. This report reads all of them from source and reports what each *does*, not which is best.

## Answer

**QUESTION**
The four candidate families are not competing for the same slot, and choosing "one planning
practice" is the wrong shape of decision. Three distinct jobs exist and each candidate covers a
different subset:

- **(a) Project spec** — a durable requirements artifact with a human review gate, living
  outside any one session. Covered by: Osmani's `spec-driven-development`, Jo's
  `newdle-project-spec`, superpowers' `brainstorming` (architectural path). **Not covered by OMP
  plan mode at all.**
- **(b) Task plan** — an ordered, executable breakdown with acceptance criteria. Covered by all
  four.
- **(c) Plan→execute handoff** — how an approved plan reaches the thing that does the work.
  Covered by OMP plan mode (fresh context / compact / keep), superpowers
  (`subagent-driven-development` vs `executing-plans`, human picks), Osmani (`/build` vs
  `/build auto`), Jo's 1.x (Linear issues + boot-from-issue).

The decision Jo owns: **pick one owner per job, or pick one stack for all three.** Taking OMP
plan mode for (b)+(c) and a spec skill for (a) is coherent and is what the evidence supports;
taking superpowers wholesale means adopting its TDD/worktree/review machinery too, because its
planning skills hard-require those sub-skills by name. Both are defensible; neither is mine to
choose. What each would change is in § *Mapping to REQUIREMENTS.md*.

**GUESS(inference)**
The single most decision-relevant structural difference I found: **OMP plan mode is the only
candidate whose read-only guarantee is enforced by the harness rather than by prose.** Every
other candidate's "do not write code during planning" is an instruction inside a Markdown file
that the model may ignore. Basis: `plan-mode/state.ts` + `prompts/system/plan-mode-active.md`
per the parent's receipts file (below), against the prose-only wording quoted from each skill in
§ Candidates. What would settle it harder: an actual test run of each skill under a tool-call
gate, which I did not do.

**CLAIM**
Jo's two general-purpose 1.x planning skills are **vendored, lagging copies of Osmani's**, not
independent artifacts. `diff` against upstream fetched this session: `spec-driven-development`
differs in 66 lines, all of them upstream additions (Phase 0 capability map, external-spec-tool
clause, `tasks/plan.md` output convention); `planning-and-task-breakdown` differs in 58 lines,
again all upstream additions (the whole *Output Files* / *Task List Target* section, the
never-overwrite-an-incomplete-plan rule, the definition-of-done pointer). Receipt:
`diff /Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/spec-driven-development/SKILL.md /tmp/osm-sdd.md`
→ exit 1, 66 diff lines, zero lines present locally but absent upstream; same command for
`planning-and-task-breakdown` → 58 lines, same direction.

**GUESS(inference)**
So "Osmani's agent-skills" is not a new candidate for Jo — it is an upgrade of two skills
already installed. The load-bearing consequence: choosing Osmani is closer to `git pull` than to
a migration. What would settle whether the upstream additions matter: whether Jo wants the
external-tracker branch (upstream's `planning-and-task-breakdown` now supports Linear as the
task-list target natively, which Jo's `newdle-project-plan` reimplements by hand).

**CLAIM**
The held P-12 question — *before or after a lane exists* — has a clean answer per candidate, and
they split two-to-two. Detail and receipts per candidate below; summary: OMP plan mode and
Osmani's commands both assume a session/checkout already exists and plan *inside* it.
Superpowers explicitly creates the isolated workspace **after** design approval, and Jo's
`newdle-project-spec`/`newdle-project-plan` produce a project directory plus Linear issues that
no session owns, which a later lane boots from.

## Candidates

### 1. obra/superpowers

**CITE**
It is a plugin, not a single skill, and its planning path is four skills in a fixed order. From
the README's *The Basic Workflow* (https://github.com/obra/superpowers, fetched this session):
*"**brainstorming** - Activates before writing code. Refines rough ideas through questions,
explores alternatives, presents design in sections for validation. Saves design document."* →
*"**using-git-worktrees** - Activates after design approval. Creates isolated workspace on new
branch, runs project setup, verifies clean test baseline."* → *"**writing-plans** - Activates
with approved design. Breaks work into bite-sized tasks (2-5 minutes each). Every task has exact
file paths, complete code, verification steps."* → *"**subagent-driven-development** or
**executing-plans** - Activates with plan. Either dispatches a fresh subagent per task with a
review after each (most thorough), or implements every task inline in the current session with
one fresh review of the whole branch at the end (cheapest)."*

**What it produces.**

**CITE**
Two files, both path-fixed and both committed to git.
`skills/brainstorming/SKILL.md` (raw.githubusercontent.com, main): *"Write the validated design
(spec) to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`"*, *"Commit the design document
to git"*. `skills/writing-plans/SKILL.md`: *"**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`"*.
Both add *"(User preferences for spec/plan location override this default)"*.

**CITE**
The plan's format is prescriptive to the point of containing the code. `writing-plans`:
*"Write comprehensive implementation plans assuming the engineer has zero context for our
codebase and questionable taste."* Mandatory header fields are Goal, Architecture, Tech Stack,
**Spec** (*"the plan argues from the spec, so the spec travels with it; executors read both"*),
**Global Constraints**, and **Review Focus** (*"The five input classes or failure modes the spec
implies but no task's tests exercise…"*). Each task carries Files / Interfaces (Consumes,
Produces) / checkbox steps. The No-Placeholders section forbids *"TBD", "TODO", "implement
later"*, *"Add appropriate error handling"*, and *"Similar to Task N" (repeat the code — the
engineer may be reading tasks out of order)*.

**How the human is gated.**

**CITE**
Hardest gate of any candidate, and it is stated as a machine-readable block.
`brainstorming/SKILL.md` `<HARD-GATE>`: *"Before taking any implementation action, including
invoking an implementation skill, writing product code, scaffolding, installing product
dependencies, or creating an external project, complete the selected path's prerequisites"* —
and, critically, *"Conversational design approval only permits writing the spec; written-spec
approval only permits invoking writing-plans. A reply approves the stage actually presented.
Approval of an idea or feature scope does not approve artifacts that do not exist yet."*
The written-spec gate has scripted wording: *"Spec written and committed to `<path>`. Please
review it and let me know if you want to make any changes before we start writing out the
implementation plan."* Then a second gate at the plan: *"Plan complete and saved to
`docs/superpowers/plans/<filename>.md`. Please review the plan. Which execution approach would
you prefer?"*

**CITE**
And the gate is explicitly *not* relaxed by task size. Its Red Flags table: *"This is too simple
to need a design" → "Follow the selected path…"*; *"I'll call it bounded and skip the spec" →
"Reaching for a label to skip work IS the doubt — take the heavier path."*; *"It's bounded and
the design is obvious — I'll start while they read it" → "The gate is the approval, not the
design's length."*

**Is this task big enough to plan.**

**CITE**
This is the only candidate with a named, announced-out-loud classifier. `brainstorming`:
*"Before your first question, classify the request and say the classification out loud — 'this
looks bounded, so I'll present a short design here rather than write a spec' — so your human
partner can override it"*. Three paths: **Spike** (*"a feasibility question… whose output is an
answer, not code you keep… No design doc, no spec file"*), **Bounded** (*"a well-scoped change
to code that already exists in this repo… present a short design IN CHAT… No spec file, no
implementation plan document"*), **Architectural** (*"new projects, new subsystems, changes that
restructure how components fit together… questions, approaches, sectioned design, written spec,
then the writing-plans skill"*). The tie-break: *"When in doubt between two paths, take the
heavier one. The ratchet is one-way: hidden complexity discovered mid-task upgrades the path…
Nothing downgrades mid-task."* And bounded is measured against the repo, not the model's
familiarity: *"Bounded measures the repo, not your familiarity. A new project has no existing
flow — it is architectural."*

**Planning separated from execution.**

**CITE**
Separated by skill boundary and by terminal state, not by tool permissions.
*"**Terminal states are path-bound.** Architectural: the ONLY skill you invoke after
brainstorming is writing-plans — never frontend-design, mcp-builder, or any other implementation
skill."* Read-only exploration is allowed during the gate: *"Read-only project exploration is
allowed while those prerequisites remain incomplete."* There is no harness enforcement named
anywhere in these files.

**How plans reach executing agents.**

**CITE**
Via extracted per-task brief files plus a ledger, never by handing over the plan.
`subagent-driven-development/SKILL.md`: *"run this skill's `bash scripts/task-brief PLAN_FILE N`
— it extracts the task's full text to a uniquely named file and prints the path"*, and the
dispatch carries *"(2) the brief path, introduced as 'read this first — it is your requirements,
with the exact values to use verbatim'"*. The prohibition is explicit: *"Never make a subagent
read the whole plan file."* and *"A dispatch prompt describes one task, not the session's
history… a real session's dispatch hit 42k chars of which 99% was pasted history."* Progress
lives in a file, not in context: *"Conversation memory does not survive compaction… Track
progress in a ledger file, not only in todos. Harness todos are a live view; the ledger is the
record."* at `<repo-root>/.superpowers/sdd/<plan-basename>/progress.md`, whose first line names
its own plan so a stray ledger cannot be mistaken for yours.

**CITE**
After the single execution-method gate, the human is deliberately cut out until the end.
`executing-plans`: *"**Continuous execution:** Do not pause to check in with your human partner
between tasks."* and *"**Rulings, not stalls.** Conflicts, ambiguities, plan defects — decide
them… Record every decision in the ledger as `Ruling: <what you decided> — <why> — <what it
costs if wrong>`"*. Exactly four stop conditions: *"an irreversible or destructive operation; a
security-sensitive action; a side effect outside this worktree that norms say you ask about
first (a merge, a push to a shared branch, a publish); and a plan so broken that every path
forward is a guess."*

**CITE**
Model routing is part of the handoff, which bears on P-9. `subagent-driven-development` §
*Model Selection*: *"Use the least powerful model that can handle each role"*; *"**Always
specify the model explicitly when dispatching a subagent.** An omitted model inherits your
session's model — often the most capable and most expensive — which silently defeats this
section."*; *"**Turn count beats token price.**… the cheapest models routinely take 2-3× the
turns on multi-step work — costing more overall."*

**Before or after a lane exists.**

**CITE**
**After the spec, before the workspace.** `using-git-worktrees` *"Activates after design
approval. Creates isolated workspace on new branch"* (README), and both executors open with
*"Ensure the work happens in an isolated workspace: use superpowers:using-git-worktrees to
create one or verify the existing one. Never start implementation on a main/master branch
without your human partner's explicit consent."* The spec is written and committed before any
isolated working context exists.

**Trigger — who decides to plan.**

**CITE**
The model does, aggressively, with the human able to override. `using-superpowers/SKILL.md`:
*"If you think there is even a 1% chance a skill might apply to what you are doing, you
ABSOLUTELY MUST invoke the skill."*, *"**Invoke relevant or requested skills BEFORE any response
or action** — including clarifying questions, exploring the codebase, or checking files."*, and
*"**Before entering plan mode:** if you haven't already brainstormed, invoke the brainstorming
skill first."* Precedence: *"User instructions (CLAUDE.md, AGENTS.md, GEMINI.md, etc, direct
requests) take precedence over skills."*

### 2. addyosmani/agent-skills

**CITE**
Planning is a **command ladder over auto-triggering skills**. README table
(https://github.com/addyosmani/agent-skills, fetched this session): *"Define what to build |
`/spec` | Spec before code"*, *"Plan how to build it | `/plan` | Small, atomic tasks"*, *"Build
incrementally | `/build` | One slice at a time"*. And *"Skills also activate automatically based
on what you're doing"*.

**What it produces.**

**CITE**
`skills/spec-driven-development/SKILL.md`: a spec document covering six named areas — Objective,
Commands, Project Structure, Code Style, Testing Strategy, Boundaries — plus Success Criteria
and Open Questions, with a full Markdown template inline. Boundaries are a three-tier system:
*"**Always do:**… **Ask first:** Database schema changes, adding dependencies, changing CI
config… **Never do:** Commit secrets, edit vendor directories, remove failing tests without
approval"*. Format is not locked: *"**External spec tools:** This workflow is format-agnostic.
If the project already uses OpenSpec or another specification system, keep that system's
artifact format… This skill owns the clarification, content, and approval gates; the external
tool owns how the approved spec is represented."*

**CITE**
`skills/planning-and-task-breakdown/SKILL.md` produces two artifacts at fixed paths: *"**Plan
document:** Save the implementation plan to `tasks/plan.md`"* and *"**Task list:** Record each
task in the **task list target**"*, default `tasks/todo.md`. The task-list target is
pluggable — *"**External tracker:** if the project's agent rules (`CLAUDE.md`, `AGENTS.md`, etc.)
or the user designate an issue tracker (e.g. GitHub Issues, Jira, Linear, `bd`/beads), create
one tracker item per task instead of writing `tasks/todo.md`"* — and the plan document then
*"keep[s] the plan document's Task List section as an ordered index of tracker item IDs or links
rather than a duplicate checklist"*.

**How the human is gated.**

**CITE**
Four gates in the spec skill, drawn as an ASCII diagram: *"SPECIFY ──→ PLAN ──→ TASKS ──→
IMPLEMENT"* each over *"Human reviews"*, with *"Do not advance to the next phase until the
current one is validated."* Its Verification checklist requires *"[ ] The human has reviewed and
approved the spec"*; the planning skill's requires *"[ ] The human has reviewed and approved the
plan"*. Assumptions are surfaced before any spec content is written: *"ASSUMPTIONS I'M MAKING:…
→ Correct me now or I'll proceed with these."*

**CITE**
`/build auto` collapses the per-task gates into exactly one and says so:
`.claude/commands/build.md` — *"**Single checkpoint.** Present the full plan and wait for an
unambiguous affirmative (e.g. 'approve', 'go', 'yes'). Treat hedged responses ('looks
reasonable', 'I guess') as **not** approved. This is the only human gate — after approval, run
autonomously."* With named re-entry conditions: *"**Stop and ask the user** (do not push
through) when: a test can't be made to pass…; the spec is ambiguous, or a task needs a decision
the spec doesn't cover; a task is high-risk or irreversible — auth/permission changes,
destructive data migrations, payments, deletions, deploys, anything touching secrets, **or
anything you can't undo with `git revert`**"*.

**Is this task big enough to plan.**

**CITE**
A size test plus a decomposition test, both stated as thresholds. `spec-driven-development`
*When to Use*: *"The task would take more than 30 minutes to implement"*; *When NOT to use*:
*"Single-line fixes, typo corrections, or changes where requirements are unambiguous and
self-contained."* Upstream adds Phase 0: *"Most requests describe one capability. If this one
does, skip this phase and go straight to Specify — Phase 0 exists for the exception, not the
rule"*, triggering a reviewable **capability map** (module table + build order) when *"a single
requirement bundles several independently testable capabilities"*, itself gated —
*"The human reviews module boundaries, dependency direction, and build order before any module
spec is written. Getting the map wrong is expensive; reviewing ten lines is not."*
`planning-and-task-breakdown` *When NOT to use*: *"Single-file changes with obvious scope, or
when the spec already contains well-defined tasks."*

**Planning separated from execution.**

**CITE**
By instruction only, and the instruction borrows the phrase: *"### Step 1: Enter Plan Mode /
Before writing any code, operate in read-only mode"*, *"**Do NOT write code during planning.**"*
`.claude/commands/plan.md` repeats it as step 1 — *"Enter plan mode — read only, no code
changes"*. Nothing in either file names a harness mechanism that enforces read-only.

**How plans reach executing agents.**

**CITE**
Through files on disk read by the next command, not through a dispatch protocol.
`spec-driven-development` Phase 4: *"Execute tasks one at a time following
`skills/incremental-implementation/SKILL.md`… and `skills/test-driven-development/SKILL.md`. Use
`skills/context-engineering/SKILL.md` to load the right spec sections and source files at each
step rather than flooding the agent with the entire spec."* `/build auto` *"**Require a spec.**
Look only for a spec at a known path: `SPEC.md` at the repo root, `docs/SPEC.md`, or a file
under `spec/`. A README or arbitrary doc does **not** count. If none exists, stop and tell the
user to run `/spec` first — do not invent requirements."* The repo does ship subagents
(`agents/code-reviewer.md`, `security-auditor.md`, `test-engineer.md`,
`web-performance-auditor.md`, per the fetched file listing), but none of them is a plan executor.

**CITE**
One safety rule has no analogue in any other candidate and is worth lifting regardless of what
Jo picks: *"**Never overwrite an incomplete plan.**… Different work → **stop and ask.** The
unchecked tasks may be mid-build in another session."* — and for trackers, *"never bulk-close or
delete another plan's open tracker items to make room for new ones."*

**Before or after a lane exists.**

**CITE**
**Inside an existing checkout; silent on lanes.** `/build auto` step 2: *"**Establish a clean
baseline.** Run `git status --porcelain`. If there are uncommitted changes outside the expected
planning artifacts… stop and ask the user to commit, stash, or confirm how to handle them."* No
worktree, branch, or session creation appears anywhere in the two planning skills or the two
commands fetched. That silence is the receipt.

**Trigger — who decides to plan.**

**CITE**
Both: an explicit slash command, or automatic skill activation — *"Skills also activate
automatically based on what you're doing — designing an API triggers `api-and-interface-design`,
building UI triggers `frontend-ui-engineering`, and so on."*

### 3. OMP's own plan mode

**CLAIM (upstream, the parent's — receipt preserved, conclusion not broadened)**
The source-level facts are Plumb's, read from `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src`
and recorded at `/Users/jowolff/code/agent-system-2.0/.tmp/phase4/plumb-F-omp-plan-mode.md`. I
did not re-read the source tree; the brief forbids it. The load-bearing ones for this comparison,
quoted from that file with its own receipts intact:

- It is a **session mode, not a skill** — state `{ enabled, planFilePath, workflow, reentry }`
  (`plan-mode/state.ts:1-6`).
- While active, the working tree is **read-only by system prompt**
  (`prompts/system/plan-mode-active.md:1-5`), and approval cannot be asked for in prose — it
  happens only by writing the slug to `xd://propose` (`:7-9`, `:118-121`).
- The plan is an *"execution spec, not design doc"*: a fresh agent must implement from the file
  alone with zero design decisions (`:13-15`). Required sections: Context, Approach, Critical
  files & anchors (≤5), Verification, Assumptions & contingencies (`:81-92`). **Forbidden**
  sections: Non-Goals, Alternatives, Risks, Future Work (`:95`).
- Review options at the gate: *approve and execute in a fresh context; approve and compact;
  approve and keep context; save and quit* (`:106-113`).
- On approval the plan is inlined into the system prompt with *"MUST verify each step before
  next"* (`prompts/system/plan-mode-approved.md:1-25`); a durable copy autosaves to
  `<project>/.omp/plans/<TOPIC>_PLAN.md`, overridable via `plan.autosaveDir`
  (`plan-mode/plan-autosave.ts:14-40`).
- Two workflows: **iterative** (explore → interview → update → calibrate, `:60-68`) and
  **parallel** (understand with scout subagents → design → review → write, `:69-78`).
- Plan mode can be the **startup default** for new interactive sessions
  (`cli/modes/interactive-mode.ts:1660-1672`); headless print mode does not honour that and
  offers `--plan-yolo` (auto-approve) instead (`cli/modes/print-mode.ts:157-163`).
- The **plan model role can differ from the execution model** (`commands/launch-help.ts:22`,
  `plan-mode/model-transition.ts`).

**CITE**
Public documentation for plan mode effectively does not exist, and that is documented as a
defect by OMP's own issue tracker. `https://github.com/can1357/oh-my-pi/issues/9253` (fetched
this session, open, v17.4.0): *"Three of the undocumented ones are modes, and two of those are
**on by default**: `plan.enabled` and `goal.enabled` both default to `true`. Vibe mode, which is
off by default, is the only mode with a dedicated documentation page."* And: *"Plan and goal mode
surface only as incidental prose: `docs/vibe-mode.md:18` mentions 'plan/goal modes' in passing
and `docs/keybindings.md:33` names plan mode as a keybinding target. There is no plan-mode or
goal-mode doc file. `docs/session-tree-plan.md` is about session trees, not plan mode."*

**CITE**
I verified that absence independently against the repo's directory listing
(`https://github.com/can1357/oh-my-pi/tree/main/docs`, fetched this session): the `docs/` tree
lists `approval-mode.md`, `vibe-mode.md`, `session-tree-plan.md`, `compaction.md`, `memory.md`,
`skills.md` and 70-odd others — and no `plan.md` or `plan-mode.md`. A direct fetch of
`https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/plan.md` returned **HTTP 404**.

**CITE**
There *is* a hosted docs page, and I could not read it (see § *Sources I could not fully read*).
The only text I hold for it is the search-result snippet returned this session for
`https://omp.sh/docs/plan`: *"Plan mode — Explore a change without modifying the project, review
the proposed approach, then choose exactly how omp should hand it to an implementation model.
Plan before omp changes anything. The status line shows Plan, omp switches to th…"* — a search
index's excerpt, not a passage I fetched from the page body. It is consistent with the parent's
source reading; it adds nothing the source reading does not already carry.

**Answers to the standard questions**, all resting on the parent's receipts above:
**artifact** — `<slug>-plan.md` under the session's local dir, autosaved to
`<project>/.omp/plans/<TOPIC>_PLAN.md`, in a fixed five-section execution-spec format;
**gate** — one mandatory approval via `xd://propose` with four named outcomes, prose approval
structurally impossible; **separation** — enforced read-only working tree while planning;
**handoff** — the approved plan is inlined into the system prompt of the executing context, with
a choice of fresh / compacted / same context, and optionally a different model.

**CLAIM (upstream, the parent's)**
On "is this task big enough to plan", Plumb's file records the relevant negative: plan mode is a
per-session toggle (`app.plan.toggle`, `cli/controllers/input-controller.ts:643-645`) or a
startup default. Nothing in what Plumb read classifies task size. There is no spike/bounded/
architectural equivalent, and *"nothing in the prompt speaks of specs, requirements, or Linear"*.

**Before or after a lane exists.**

**GUESS(inference)**
**After, necessarily.** Plan mode is session state, and a session is what P-2 calls a lane's
working context; you toggle it in a session you are already in, or you start a session with it
on. Basis: the state shape and the toggle/startup-default receipts in the parent's file. What
would settle whether it can be entered *for a hand* rather than for the session: Plumb's own
open item — a `prompts/system/plan-mode-subagent.md` exists and was not read.

### 4. The five 1.x planning artifacts Jo already owns

**PMDW**
The enumeration of five is the brief's, not a finding of mine. All five are first-party files
under `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/`; I read each this
session.

**CLAIM — `spec-driven-development` (vendored Osmani, lagging)**
Four gated phases, *"Do not advance to the next phase until the current one is validated"*
(`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/spec-driven-development/SKILL.md:22-24`),
six-area spec template, verification checklist requiring *"The human has reviewed and approved
the spec"* (`:197`), scope test *"Single-line fixes, typo corrections, or changes where
requirements are unambiguous and self-contained"* (`:20`). **Missing versus upstream:** Phase 0
capability map, the external-spec-tool clause, and the `tasks/plan.md` output convention — see
the `diff` receipt in § Answer.

**CLAIM — `planning-and-task-breakdown` (vendored Osmani, lagging)**
*"### Step 1: Enter Plan Mode / Before writing any code, operate in read-only mode"*
(`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/planning-and-task-breakdown/SKILL.md:24-26`),
XS→XL sizing table, *"Verification checkpoints occur after every 2-3 tasks"* (`:112`), gate
*"The human has reviewed and approved the plan"* (`:223`), scope test at `:20`. **Missing versus
upstream:** the entire Output Files / Task List Target section — so this local copy has **no
defined output path and no external-tracker branch**, and the never-overwrite-an-incomplete-plan
rule is absent.

**CLAIM — `newdle-project-spec`**
Produces `.projects/<name>/SPEC.md` at the shipyard root **plus a live Linear project**, with
full YAML frontmatter (`linear_project_id`, `linear_project_url`, team, initiative, lead, state,
`issue_prefix`, `last_synced`, `created`). Gate:
*"**Write gate is mandatory.** Render a full preview and state plainly that nothing has been
created. Wait for an explicit confirmation ('yes', 'ship it', 'create it', or equivalent) before
any `save_project` call."*
(`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/newdle-project-spec/SKILL.md:18`).
It delegates twice — to `newdle:reader` for a codebase scan before writing, and to
`newdle:planner` to draft the SPEC.md body — and its Step 10 report hands the user the next four
commands in order, ending at *"Implement task by task using the builder or beefy-builder agent"*.

**CLAIM — `newdle-project-plan`**
*"**Two explicit gates.** Gate 1: plan review — present the draft plan and wait for approval
before writing any file. Gate 2: Linear write gate — render a full issue preview and wait for an
explicit 'create it' before any `save_issue` call."*
(`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/newdle-project-plan/SKILL.md:19`;
the gate headings themselves at `:215` and `:253`). Produces `.projects/<name>/PLAN.md` (phases,
checkpoints, risks, per-task acceptance criteria/verification/dependencies/files/scope) and
`.projects/<name>/TASKS.md` (flat checklist), then Linear issues whose identifiers are written
back into TASKS.md as HTML-comment anchors (`<!-- NDE-42 -->`). It dedupes by title before
creating, and it refuses XL tasks outright: *"**XL tasks: stop and ask the user to split before
proceeding.** Do not file an XL task as a single issue."*

**CLAIM — the handoff is the issue body, and it is a contract**
`newdle-project-plan` Step 4 assembles each issue description *"per the boot-from-issue
contract… all five sections in order"* — Boot context (project name, repos in scope derived from
the task's *Files likely touched*, before/after process hooks, "Depends on" as issue
identifiers), What, Acceptance criteria, Verification, Constraints. This is the closest thing in
any candidate to superpowers' per-task brief file, except it lives in Linear rather than on disk.

**CLAIM — the `planner` agent**
`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/agents/planner.md:1-15` — a
read-only planning subagent (`tools: Read, Grep, Glob, Bash`, `model: fable`, `effort: high`),
output format Goal / Assumptions / Tasks / Verification / Out of scope, with
*"Never edit product source; readonly enforcement is by toolset, not prompt alone."* It is the
one 1.x artifact whose read-only property is mechanically backed — by tool allowlist. Its
output-types section states the shape a plan must take: *"**A plan is mostly GUESS, and saying so
is the point**"*, and *"**A fork the brief did not resolve is a QUESTION, not an assumption.**"*

**Before or after a lane exists.**

**CLAIM**
**Before, and independently of one.** `newdle-project-spec` resolves the shipyard root by
marker walk-up and writes to `.projects/<name>/` there, refusing to write locally even when
invoked from a child repo (`…/newdle-project-spec/SKILL.md:19`). The resulting artifact set —
project dir, PLAN.md, TASKS.md, Linear issues carrying a Boot context block naming *repos in
scope* — is owned by no session and is designed to be picked up later, per the Step 10 handoff
list. That is planning that outlives and precedes any particular working context.

### 5. Three other practices wave 1 surfaced, each with a primary source I fetched

**PMDW**
Included only where a primary source exists and I read it myself this session; the *observation
that these recur* is wave 1's, in `research-D-best-in-class-survey.md` and `research-B-osmani.md`.

**CITE — spec files re-read every loop (Geoffrey Huntley, "Ralph")**
`https://ghuntley.com/ralph/` (published 2025-07-14, fetched this session). The practice:
*"The items that you want to allocate to the stack every loop are your plan ('@fix_plan.md') and
your specifications."*, under the rule *"**deterministically allocate the stack the same way
every loop**"*. How the spec is produced: *"Specs are formed through a conversation with the
agent at the beginning phase of a project. Instead of asking the agent to implement the project,
what you want to do is have a long conversation with the LLM about your requirements… Once your
agent has a decent understanding of the task to be done, it's at that point that you issue a
prompt to write the specifications out, one per file, in the specifications folder."* The human
gate is **absent by design** — *"This is full hands-off vibe coding that will test the bounds of
what you consider 'responsible engineering'"* — and the plan is not a static document but a
selection surface: *"Follow the @fix_plan.md and **choose the most important thing**."* When it
goes wrong the spec is the suspect: *"If Ralph is building the wrong thing completely, then your
specifications may be incorrect. A big, hard lesson for me when building CURSED was that it was
only a month in that I noticed that my specification for the lexer defined a keyword twice for
two opposing scenarios."* **Before or after a lane:** before — the specs are written in the
opening conversation, and the loop is started afterwards against them.

**CITE — the done-condition file (Addy Osmani, prose, distinct from his skills repo)**
`https://addyosmani.com/blog/long-running-agents/` (2026-04-28, fetched this session):
*"*Write down the done-condition before the agent starts.* This is the single highest-leverage
move for long runs. The Anthropic harness post calls it the feature list; Cursor calls it the
planner's task spec. Either way, it's an external file with explicit, testable completion
criteria, and it exists so the agent can't quietly redefine *done* mid-run."* The same post
states the separation principle P-4 leans on: *"*Separate the evaluator from the generator.*
Self-grading is the failure mode. A planner / worker / judge pipeline… is a real architectural
pattern not a stylistic preference."* And it reports the same file-outside-context mechanic as
Ralph: *"`prd.json` is the plan, `progress.txt` is the lab notes, `AGENTS.md` is the rolling
rulebook. **The agent itself is amnesiac, but the filesystem isn't.**"* **Before or after a
lane:** before the run; silent on lanes as persistent contexts.

**CITE — plan-then-execute as the product shape (Vibe Kanban)**
Reported by wave 1 from `https://raw.githubusercontent.com/BloopAI/vibe-kanban/main/README.md`
with the premise *"In a world where software engineers spend most of their time planning and
reviewing coding agents, the most impactful way to ship more is to get faster at planning and
review."* — and with the project's own top heading reading *"Vibe Kanban is sunsetting."*
I did **not** fetch that README myself this session; the quote and the sunsetting are wave 1's
CITE at `/Users/jowolff/code/agent-system-2.0/.tmp/phase4/research-D-best-in-class-survey.md:249-266`,
preserved here without broadening. Carried only as a datum: the one surveyed product whose
*shape* was plan-then-execute is shutting down, and wave 1 explicitly did not read the shutdown
post, so nobody currently knows why.

## Comparison

**PMDW**
Source keys are in § *Sources*. `silent` means the candidate's primary source says nothing on
that axis and the receipt is which file's silence it is. `Type` is the row's dominant label;
individual cells carry their own receipts in the Candidates section above.

| Type | Candidate | Artifact produced | Human gate | Plan→execute handoff | Project vs task scope | Trigger — who decides to plan | Portability (P-15) | Fit with P-4 (gate + sign-off) |
|---|---|---|---|---|---|---|---|---|
| CITE | **obra/superpowers** | Spec `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` + plan `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`, both committed [2][3] | Three stage-bound gates (design → spec → plan), `<HARD-GATE>`: *"A reply approves the stage actually presented"* [2]; plan gate also asks the human to pick the execution method [3] | Per-task brief file via `scripts/task-brief`, ledger at `.superpowers/sdd/<plan>/progress.md`, model named explicitly per dispatch; *"Never make a subagent read the whole plan file"* [5] | **Both** — path classifier routes spike/bounded (task, no doc) vs architectural (project, spec+plan) [2] | Model, pre-emptively: *"even a 1% chance a skill might apply… you ABSOLUTELY MUST invoke"*; human overrides via CLAUDE.md/AGENTS.md [6] | One repo, 16 named harnesses incl. `pi install git:github.com/obra/superpowers`; ships `.claude-plugin/`, `.pi/extensions/`, `.opencode/`, and 12 more [1] | Strong on gate, **weak on sign-off after real use** — after the one execution-method gate it forbids check-ins: *"Do not pause to check in with your human partner between tasks"* [4][5] |
| CITE | **addyosmani/agent-skills** | Spec doc (six areas, template inline) + `tasks/plan.md` + `tasks/todo.md` **or** one tracker item per task (Linear named) [8][9] | Four phase gates, *"Do not advance to the next phase until the current one is validated"* [8]; `/build auto` reduces to *"the only human gate"* [11] | Files at known paths read by the next command; `/build auto` refuses to start without a spec at `SPEC.md`/`docs/SPEC.md`/`spec/*` [11]. No plan-executor subagent in `agents/` [7] | **Both** — Phase 0 capability map for multi-capability initiatives, otherwise one spec per feature [8] | Both: `/spec`, `/plan`, `/build` commands **and** automatic skill activation [7] | `npx skills add addyosmani/agent-skills` into *"70+ agents"*; **known gap**: per-skill install drops repo-level `references/`, tracked as issue #361 [7] | Strongest match on both halves: named human review at every phase, plus explicit high-risk stop list incl. *"anything you can't undo with `git revert`"* [11] |
| CLAIM (upstream) / CITE | **OMP plan mode** | `<slug>-plan.md` + autosave `<project>/.omp/plans/<TOPIC>_PLAN.md`; fixed five sections; Non-Goals/Alternatives/Risks/Future Work **forbidden** [P-F] | One approval via `xd://propose`, four outcomes; prose approval structurally impossible; working tree read-only while planning [P-F] | Approved plan inlined into the executing system prompt with *"MUST verify each step before next"*; choice of fresh context / compact / keep; plan model may differ from execution model [P-F] | **Task only** — *"execution spec, not design doc"*; nothing in the prompt speaks of specs, requirements, or Linear [P-F] | Human, by session toggle or startup default; **no task-size classifier exists** [P-F] | Built into the installed binary, not a copyable artifact; nothing to put in Jo's GitHub repo. Conversely OMP's marketplace *"is compatible with the Claude Code plugin registry format"*, so the other two candidates install **into** it [14] | Gate: strongest of all four (harness-enforced). Sign-off after real use: `silent` — no such concept in anything Plumb read [P-F] |
| CLAIM | **1.x `newdle-project-spec` + `newdle-project-plan`** | `.projects/<name>/SPEC.md` (YAML frontmatter + Linear project) → `PLAN.md` + `TASKS.md` → Linear issues, anchors written back as `<!-- NDE-42 -->` | Three: spec write gate, plan review gate (Gate 1), Linear write gate (Gate 2) — each requires explicit confirmation before any write | Issue body **is** the brief: five-section boot-from-issue contract (Boot context / What / Acceptance / Verification / Constraints), repos-in-scope derived from *Files likely touched* | **Project** — refuses repo-root `SPEC.md`, refuses `tasks/`, always writes at shipyard root | Human, by slash command (`/spec project`, `/plan project`) | Ships in versioned plugin `newdle@0.2.171`, manifest self-described as *"Distribution copy of shipyard/.claude/"*; no source URL in the manifest | Both halves present at plan time; **depends on Linear MCP** — *"If MCP tools are unavailable, halt and say so"* |
| CLAIM | **1.x vendored `spec-driven-development` + `planning-and-task-breakdown`** | Spec doc (six areas); plan doc with **no defined output path** — the local copy predates upstream's Output Files section | Four phase gates + two checklist items requiring human approval (`:197`, `:223`) | `silent` — neither local file names a subagent, a brief, or a dispatch; the whole *Task List Target* branch is absent from the local copy | Task-level, within one spec | Model (auto-activation) or a person invoking the skill | Same plugin as the row above; **lagging upstream by 66 and 58 diff lines**, all additions | Gates stated as prose checklists only; no mechanism named |
| CLAIM | **1.x `planner` agent** | A plan message (Goal / Assumptions / Tasks / Verification / Out of scope) — **no file**, no path | `silent` on gates — the agent definition names none; its caller supplies them | Returns to whoever spawned it; `newdle-project-spec` and `newdle-project-plan` both call it as the drafting step | Task-level drafting inside either scope | Its caller — *"Use proactively when a task is large, ambiguous, or needs ordered steps"* | Same plugin; model pin `fable`, `effort: high` | Read-only is **mechanically** enforced: *"readonly enforcement is by toolset, not prompt alone"* (`tools: Read, Grep, Glob, Bash`) |
| CITE | **Ralph (Huntley)** | `@fix_plan.md` + one spec file per topic in a specs folder, re-read every loop [15] | **None by design** — *"full hands-off vibe coding that will test the bounds of what you consider 'responsible engineering'"* [15] | The loop re-reads the plan and specs from disk each iteration; primary context acts as a scheduler spawning subagents [15] | **Project** — specs are written once in an opening conversation and govern the whole build [15] | Human, once, at project start [15] | A bash loop plus files in the repo; nothing to install [15] | Contradicts P-4 outright: no gate, no sign-off, agent picks its own next task [15] |
| CITE | **Done-condition file (Osmani, prose)** | *"an external file with explicit, testable completion criteria"* — feature list / planner task spec [16] | `silent` — the prescription is about the file existing, not about who approves it [16] | The file is read by each session; state lives outside context — *"The agent itself is amnesiac, but the filesystem isn't"* [16] | Run-level (one long-running goal), not per-repo project [16] | Human, before the run starts [16] | Format-agnostic prose pattern; portable by construction [16] | Half: it is the automated-gate half (*"separate the evaluator from the generator"*), silent on human sign-off [16] |
| CITE (upstream, wave 1's) | **Vibe Kanban** | Kanban issues over agent workspaces; *"each workspace gives an agent a branch, a terminal, and a dev server"* [D:249-266] | In-product diff review with inline comments [D:249-266] | Board issue → workspace → agent, agent-agnostic across 10+ CLIs [D:249-266] | **Project** — the board is the plan [D:249-266] | Human, by creating a board item [D:249-266] | Self-hostable via Docker, MCP server exposed — **but the project is sunsetting** [D:249-266] | Gate present (review-in-place); sign-off-after-real-use `silent` in what wave 1 read [D:249-266] |

## Mapping to REQUIREMENTS.md

**PMDW**
Every row below is my inference from the receipts above onto requirement text I read at
`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md`. The requirement wording is Jo's; the fit
judgement is mine and labeled as such.

### P-12 — spec and plan a project through the system before anything executes; the option is offered at the appropriate time; not every task needs it

**GUESS(inference)**
P-12 has three clauses and **no single candidate satisfies all three.**

- *"spec and plan"* — only the spec-carrying candidates qualify: superpowers' architectural path,
  Osmani's `/spec`+`/plan`, Jo's `newdle-project-spec`+`newdle-project-plan`. OMP plan mode
  produces an execution spec and forbids the sections a design doc needs (Non-Goals,
  Alternatives, Risks) [P-F], so it cannot be the (a) job.
- *"per project"* — Jo's 1.x pair is the only candidate whose artifact is keyed to a project
  identity that outlives the session (`.projects/<name>/` + Linear project id). Osmani's is keyed
  to a checkout (`tasks/plan.md`); superpowers' to a repo path plus a git branch; OMP's to a
  session with a project-level autosave directory.
- *"not every task needs it… offered at the appropriate time"* — **only superpowers implements
  the offer as a decision procedure**: classify, announce the classification out loud, let the
  human override, ratchet upward only [2]. Osmani implements it as thresholds a model applies
  silently (*"more than 30 minutes"*, *"Single-line fixes"*) [8]. OMP plan mode has no classifier
  at all — it is on or off [P-F]. Jo's project skills are invoked by command, so the "offer" is
  Jo remembering to type it.

**GUESS(inference)**
What settles the gap: nothing in the sources. The classifier-that-announces-itself is a
superpowers-specific design that could be lifted into any of the others as prose, and lifting it
is a Phase 5 design decision, not a research finding.

### P-12's held sub-question — before or after a lane exists

**CLAIM**
Answered per candidate, from the receipts in § Candidates: **superpowers = spec first, workspace
second** (worktree created after design approval [1]); **Jo's 1.x project pair = before, and
unowned by any session** (shipyard-root `.projects/`, Linear issues carrying repos-in-scope);
**Osmani = inside an existing checkout, silent on lanes** (its only environment assertion is
`git status --porcelain` at `/build auto` [11]); **OMP plan mode = after, necessarily** — it is
session state [P-F]; **Ralph = before** (specs written in the opening conversation, loop started
after) [15].

**GUESS(inference)**
So the sub-question is really *which job runs where*: (a) project spec is the one that wants to
happen before a lane exists, and it is the one OMP plan mode cannot do. If Jo wants planning to
precede lane creation, the spec step has to live in something other than plan mode — which is
the same conclusion § Answer reaches from a different direction.

### P-4 — every step passes an automated gate **and** gets Jo's sign-off after real use

**GUESS(inference)**
Split the requirement and the candidates split with it. **Automated gate at the plan step:** OMP
plan mode is the only one where "cannot write while planning" and "cannot approve in prose" are
properties of the harness rather than of a Markdown file [P-F]; the 1.x `planner` agent is the
only other mechanically-backed one, and only for read-only (`tools:` allowlist). **Sign-off after
real use:** no candidate models it. Superpowers actively works against it — *"Do not pause to
check in with your human partner between tasks"* [4][5]; Osmani's `/build auto` collapses to one
up-front gate by design [11]; Jo's 1.x gates are all *before* the write, none after the use.

**GUESS(inference)**
The closest thing any source offers to the sign-off half is Osmani's prose separation of
evaluator from generator [16] and superpowers' end-of-branch fresh reviewer [4] — both of which
are *machine* verification, not Jo's. P-4's second half remains unimplemented by every candidate.

### P-7b — the orchestrator never acts on Jo's authority: opening, closing, approving stay Jo's

**GUESS(inference)**
Two candidates encode the boundary in a way that survives delegation, and they do it
differently. Superpowers puts it in the approving agent's own prompt — *"A reply approves the
stage actually presented. Approval of an idea or feature scope does not approve artifacts that do
not exist yet"* [2] — which is a defence against an agent laundering one approval into several.
OMP plan mode puts it in the transport: approval exists only as a write to `xd://propose`, so an
agent cannot manufacture one in prose [P-F]. **The transport version is the one that composes
with P-7b**, because it does not rely on the orchestrator's own restraint.

**GUESS(inference)**
Against P-7b: superpowers' *"Rulings, not stalls"* [4][5] explicitly authorises the executing
agent to decide conflicts and ambiguities unilaterally, logging rather than asking. That is a
deliberate transfer of decision authority away from the human, bounded by four stop conditions.
Whether that crosses P-7b depends on whether Jo reads "approving" as covering mid-execution
rulings — which is Jo's call, not mine.

### P-8 — the lane owns its hands; the orchestrator does not dispatch into a lane

**GUESS(inference)**
Superpowers is the only candidate that specifies hand-ownership mechanically, and it matches P-8:
the plan executor spawns and briefs its own implementers, and the implementer is forbidden from
spawning further — *"the implementer never dispatches subagents — not helpers, and never a
reviewer… In real sessions, every reviewer a worker spawned duplicated the task review the
controller dispatched anyway"* [5]. That is one level of hands, owned by the lane, with the
reason stated as measured waste.

**GUESS(inference)**
Osmani's skills are silent on this (`agents/` ships reviewers and auditors, none of which is a
plan executor) [7]; Jo's 1.x project skills dispatch `newdle:reader` and `newdle:planner` from
within the planning skill, which is the lane owning its hands already; OMP plan mode's parallel
workflow uses scout subagents during planning [P-F]. Ralph states the same shape in different
words: the primary context *"should operate as a scheduler, scheduling other subagents to perform
expensive allocation-type work"* [15].

### P-15 — machinery portable; an up-to-date copy creatable from Jo's GitHub repo on another machine

**CITE**
The enabling fact for all three third-party candidates: OMP's marketplace *"is compatible with
the Claude Code plugin registry format"*, a marketplace is *"a Git repository (or local
directory) containing a catalog file at `.omp-plugin/marketplace.json` (preferred) or
`.claude-plugin/marketplace.json` (Claude Code-compatible fallback)"*, and plugins install at
user or project scope [14]. Both `obra/superpowers` and `addyosmani/agent-skills` ship
`.claude-plugin/marketplace.json` at their repo root (file listings [1] and [7], fetched).

**GUESS(inference)**
So installation is not the risk; **activation is**, and it is bounded rather than unknown.
Superpowers depends on a `SessionStart` hook to inject its `using-superpowers` bootstrap — the
README says so for Antigravity (*"runs the plugin's session-start hook, so Superpowers is active
from the first message"*) and warns about Hermes (*"Hermes has no post-compaction hook, so a very
long session that compacts over its first turn loses the bootstrap"*) [1]. On the OMP side,
marketplace installs *"load extension modules declared by `package.json` `omp.extensions`"*,
runtime hooks are *"discovered from the installed plugin tree"*, and you *"restart the session for
newly installed tools, hooks, or extension modules"* [14]; `session_start` is a real hook event
and discovery *"Append[s] plugin extension entry points"* [18]. What remains genuinely open is
format: OMP's hook is a `.ts`/`.js` module default-exporting a factory that registers handlers via
`pi.on(...)` [18], and nothing I fetched says OMP reads a Claude Code plugin's declarative hook
configuration. Settles by reading the rest of `docs/hooks.md` and `docs/extension-loading.md`, or
by installing into a throwaway profile and watching whether the bootstrap fires.

**CLAIM**
For the 1.x artifacts, P-15 is currently unmet in the sense P-15 means: they reach this machine
as a versioned plugin cache whose manifest describes it as *"Distribution copy of
shipyard/.claude/"* and carries no source URL
(`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/.claude-plugin/plugin.json`,
read this session). The generator is a private shipyard checkout, not a repo another machine can
clone from the manifest alone.

**GUESS(inference)**
And the vendoring finding lands here too: two of the five 1.x planning artifacts are copies of an
upstream that moved. P-15's *"up-to-date copy"* has a second meaning for vendored content —
up to date with *whose* main. Adopting Osmani as a marketplace dependency rather than a vendored
copy would make that automatic; keeping the vendored fork makes it manual forever. That is a
Phase 5 design choice with a real maintenance cost either way.

## Sources I could not fully read

| URL | What I got | Why the rest is missing | Importance |
|---|---|---|---|
| `https://omp.sh/docs/plan` | HTML `<head>` only — title, canonical (`https://omp.sh/`), og/twitter meta. Zero body content. Plus a search-result snippet from the same session's `web_search`: *"Explore a change without modifying the project, review the proposed approach, then choose exactly how omp should hand it to an implementation model."* | JS-rendered docs site; the fetched document has no server-rendered article body, and `canonical` points at the site root rather than the page | **Worth knowing.** This is candidate 3's only public documentation. It cost me nothing decisive because the parent's source reading covers the same ground with stronger receipts, but it means no *independent* public confirmation of plan mode's behaviour exists in this report |
| `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/plan.md` | **HTTP 404** | The file does not exist — corroborated by the `docs/` tree listing, which has no plan-mode page, and by issue #9253 saying so explicitly | **Worth knowing**, and the failure is itself the finding rather than a gap |
| `https://www.reddit.com/r/ClaudeAI/search/?q=superpowers+plan+mode&restrict_sr=1` | An SVG logo and `<title>Reddit</title>`. No posts, no text | JS shell; Reddit serves no content to this fetcher. Tried once, per the brief, and not retried | **Noise** for this question. Practitioner opinion about which planning skill people prefer would not change any fact in this report, all of which come from the artifacts themselves |
| `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md` | Lines 1-150 of ~360: runtime status, discovery pipeline, and the full event-surface list | I stopped at the event list once it answered whether `session_start` exists. The execution-model and mutation-semantics tail is unread | **Worth knowing.** It is where a statement about Claude-Code-format hook translation would live if one exists; its absence from what I read is why the P-15 activation item stays open rather than closing |
| `https://github.com/obra/superpowers` file tree | Root listing with *"[…198 files elided…]"* | The GitHub API listing truncates. I resolved the skills directory separately via `/tree/main/skills`, so the planning skills were not affected | **Noise** — the elision hit `docs/windows`, evals, and tests, none of which bear on the question |

## Sources

Fetched this session unless marked otherwise.

1. `https://github.com/obra/superpowers` — README and root file listing (GitHub API)
2. `https://raw.githubusercontent.com/obra/superpowers/main/skills/brainstorming/SKILL.md`
3. `https://raw.githubusercontent.com/obra/superpowers/main/skills/writing-plans/SKILL.md`
4. `https://raw.githubusercontent.com/obra/superpowers/main/skills/executing-plans/SKILL.md` (lines 1-300 of 379 read)
5. `https://raw.githubusercontent.com/obra/superpowers/main/skills/subagent-driven-development/SKILL.md` (lines 1-300 of 574 read)
6. `https://raw.githubusercontent.com/obra/superpowers/main/skills/using-superpowers/SKILL.md`
7. `https://github.com/addyosmani/agent-skills` — README and root file listing (GitHub API)
8. `https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/spec-driven-development/SKILL.md`
9. `https://raw.githubusercontent.com/addyosmani/agent-skills/main/skills/planning-and-task-breakdown/SKILL.md`
10. `https://raw.githubusercontent.com/addyosmani/agent-skills/main/.claude/commands/plan.md`
11. `https://raw.githubusercontent.com/addyosmani/agent-skills/main/.claude/commands/build.md`
12. `https://github.com/can1357/oh-my-pi/issues/9253` — *34 of 72 built-in slash commands undocumented, including default-on plan and goal modes*, open, v17.4.0
13. `https://github.com/can1357/oh-my-pi/tree/main/docs` — directory listing
14. `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/marketplace.md` — read in two passes, lines 1-60 and 64-255 (full)
15. `https://ghuntley.com/ralph/` — Geoffrey Huntley, *Ralph Wiggum as a "software engineer"*, 2025-07-14
16. `https://addyosmani.com/blog/long-running-agents/` — Addy Osmani, 2026-04-28
17. `https://omp.sh/docs/plan` — **head only**, see § *Sources I could not fully read*
18. `https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/hooks.md` — lines 1-150 of ~360 read: runtime status, discovery pipeline, event surfaces

First-party files read this session (absolute paths):

- `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md`
- `/Users/jowolff/code/agent-system-2.0/briefs/research.md`
- `/Users/jowolff/code/agent-system-2.0/.tmp/phase4/plumb-F-omp-plan-mode.md` — cited as **[P-F]**; the parent's CLAIMs, receipts preserved
- `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/spec-driven-development/SKILL.md`
- `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/planning-and-task-breakdown/SKILL.md`
- `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/newdle-project-spec/SKILL.md`
- `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/skills/newdle-project-plan/SKILL.md` (lines 1-300 of 330)
- `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/agents/planner.md`
- `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/.claude-plugin/plugin.json`
- `/Users/jowolff/code/agent-system-2.0/.tmp/phase4/research-D-best-in-class-survey.md` — targeted ranges only; cited as **[D:lines]**
- `/Users/jowolff/code/agent-system-2.0/.tmp/phase4/research-B-osmani.md` — grep hits only, used for leads

Commands run this session:

- `diff <local spec-driven-development> /tmp/osm-sdd.md` → exit 1, 66 differing lines
- `diff <local planning-and-task-breakdown> /tmp/osm-ptb.md` → exit 1, 58 differing lines
- `curl -sfL` on the two upstream raw URLs into `/tmp/osm-sdd.md`, `/tmp/osm-ptb.md` (reversal: `rm /tmp/osm-sdd.md /tmp/osm-ptb.md`)

## Unverified
**GUESS(inference)**
**Whether superpowers' `SessionStart` bootstrap fires under OMP.** Bounded, not eliminated, by
two further fetches this session. Established: OMP emits a `session_start` hook event, and its
discovery pipeline explicitly *"Append[s] plugin extension entry points"* [18]; marketplace
installs *"load extension modules declared by `package.json` `omp.extensions`"* and runtime hooks
are *"discovered from the installed plugin tree"*, with *"restart the session for newly installed
tools, hooks, or extension modules"* [14]. Still open: OMP's hook unit is a `.ts`/`.js` module
default-exporting a factory that calls `pi.on(...)` [18], while a Claude Code plugin declares
hooks as configuration invoking a script. Neither fetched doc says OMP translates that
declarative form. So superpowers' skills would install; whether the bootstrap that makes them
auto-trigger fires is unresolved. Settles by: reading the rest of `docs/hooks.md` and
`docs/extension-loading.md`, or a throwaway-profile install. Flagged at the point it appears in
§ *Mapping → P-15*.
install.

**GUESS(inference)**
**Whether OMP plan mode can be entered for a hand rather than a session.** A
`prompts/system/plan-mode-subagent.md` exists and neither Plumb nor I read it [P-F]. This matters
for P-8: if a lane can put its own hand into plan mode, the plan gate composes with lane-owned
hands; if not, planning is a session-level act only.

**GUESS(recall) — not load-bearing, and nothing in this report depends on it**
I did not establish whether `obra/superpowers`' `.pi/extensions/superpowers.ts` targets the same
"Pi" that `can1357/oh-my-pi` forked from. The README's Pi section says *"Pi has native skills, so
no compatibility `Skill` tool is required"* [1], which is about Pi, not about OMP. I have treated
OMP compatibility as resting solely on the Claude-Code-plugin-registry route [14], which is
fetched and does not depend on this.

**GUESS(inference)**
**Why Vibe Kanban is sunsetting.** Neither wave 1 nor I read the shutdown post. If the reason was
that plan-then-execute-as-a-product is a bad shape, that would be evidence against P-12's whole
premise; if it was funding or acquisition, it is irrelevant. Currently unknown, and I have not
let it carry weight anywhere above.

**CLAIM**
Two superpowers files were read in part, not in full: `executing-plans/SKILL.md` (lines 1-300 of
379) and `subagent-driven-development/SKILL.md` (lines 1-300 of 574). Everything I quote from
them is inside the range I read. The unread tails cover the finish/cleanup phases and the
prompt-template appendices; if a gate or handoff rule lives only there, I missed it.

**Not verified and not attempted:** whether any of these practices actually improves outcomes.
Every source in this report is a description of a method by its own author. None of them is
evidence that the method works, and the only efficacy-shaped datum anywhere near this question is
the wave-1 note that the one plan-then-execute *product* surveyed is shutting down.

## Coverage

**ACTION**
Retrieved 19 URLs and 11 first-party files; ran `curl` twice into `/tmp`, one two-part `diff`
(exit 1 on both halves; reversal `rm /tmp/osm-sdd.md /tmp/osm-ptb.md`), and 1 `ctx search` (required by
this machine's ctx-first gate before any `grep` would run — one result was a Cursor-session copy
of the same Osmani planning skill, which I did not use as a source). One `grep` call failed
because it resolved a URL as a relative path and tripped the delegation guard; I re-issued it as
a `read` with a line range, which is the row marked partial below. This report file itself was
written and then revised in place by shell heredoc and slice-and-reassemble; reversal is deleting
`/Users/jowolff/code/agent-system-2.0/.tmp/phase4/research-E-planning-practice.md`. No other file
was created or modified.

| Subject / source area | Retrieved | Opened and read | Failures | Sufficient? |
|---|---|---|---|---|
| obra/superpowers | 6 URLs (README + 5 SKILL.md) | All 6; two read to line 300 of 379 and 574 | None | **Yes** for the planning path — brainstorming, writing-plans and both executors were read in full or through the sections that carry gates, artifacts and handoff. Next I would read the two tails and `implementer-prompt.md` |
| addyosmani/agent-skills | 5 URLs (README + 2 SKILL.md + 2 commands) | All 5, in full | None | **Yes.** `/spec` command and `incremental-implementation` were not read; `/build` and the two skills carry the gate and handoff answers, and `/spec` is a thin wrapper by the pattern of `/plan`. Next: `/spec`, `idea-refine`, `interview-me` |
| OMP plan mode | 6 URLs + 1 first-party receipts file | Issue #9253 and the `docs/` tree in full; `marketplace.md` in full (two reads); `hooks.md` lines 1-150 of ~360; `omp.sh/docs/plan` head only; `docs/plan.md` 404 | **2 failures**: 404 on `docs/plan.md`; body-less fetch of `omp.sh/docs/plan` | **Yes, but only because the parent's source reading exists.** Both failures cost me independent public confirmation, not the answer. Without `plumb-F-omp-plan-mode.md` this row would be insufficient and the report would be Tier 1. `hooks.md` was read only as far as the event list; its execution-model tail is unopened and named in § *Unverified* |
| 1.x planning artifacts | 6 first-party files + 2 upstream copies for diffing | 5 SKILL/agent files (one to line 300 of 330), the plugin manifest, both diffs | None | **Yes.** The vendoring finding came out of this row and was not in the brief |
| Other practices (wave 1 leads) | 2 URLs fetched by me + 2 wave-1 reports consulted by targeted range | Ralph and long-running-agents in full; research-D at 2 ranges; research-B by grep hits | None | **Thin and justified.** The brief caps practitioner accounts at ten and admits these only where a primary source exists; I fetched 2 of the 3 myself and marked the third as wave 1's, unfetched by me |
| Practitioner discussion (Reddit) | 1 URL | Nothing — JS shell | **1 failure**, expected per the brief | **Yes, and deliberate.** Tried once, not retried. Opinion would not change a fact in this report |

**ACTION**
**Nothing retrieved was left unopened, with one exception I am naming.** Every URL and file I
fetched appears above and was read at least in part. The exception is that `web_search` returned
10 results for OMP plan-mode documentation and I opened 3 of them (`omp.sh/docs/plan`, issue
#9253, and the `oh-my-pi` docs tree). The 7 I saw listed and did not open:
`https://omp.sh/docs`, `https://omp.sh/docs/cli`, `https://omp.sh/`, `https://omp.sh/docs/modes`,
`https://omp.sh/docs/agents` — all on the same JS-rendered site that returned no body for the one
page I did try, so opening them would have produced the same empty result — plus
`https://github.com/docfork/pi/blob/main/packages/coding-agent/examples/extensions/plan-mode/README.md`
(a *different* project's plan-mode example extension, not OMP's shipped mode) and
`https://github.com/adawdani/oh-my-pi---Coding-agent-with-the-IDE-wired-in/blob/main/docs/tools/task.md`
(a mirror of the repo I read directly). I also did not open the four `agents/*.md` files listed in
the addyosmani repo tree, having established from the README and commands that none of them is a
plan executor.

**PMDW**
Bottom line, labeled: the report answers *what each candidate does*, from source, for all five
candidate groups, and it leaves the choice open on purpose — see the QUESTION at the top of
§ Answer.

<!-- output-types
tier: 0
CLAIM: 14
CITE: 30
GUESS: 18 (inference 17, pattern 0, recall 1)
ACTION: 2
PMDW: 6
QUESTION: 1
-->
