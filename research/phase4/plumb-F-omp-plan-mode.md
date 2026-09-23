# Plumb F — OMP plan mode, as shipped (input to P-12: which planning practice)

All paths under `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src`.

**CLAIM — what it is**
A session mode, not a skill. State is `{ enabled, planFilePath, workflow: "parallel" | "iterative", reentry }`
(`plan-mode/state.ts:1-6`). While active the system prompt `prompts/system/plan-mode-active.md`
makes the working tree read-only (`:1-5`), requires the plan to be written to
`'/Users/jowolff/.omp/agent/seat-sessions/plumb/2026-09-22T05-52-33-604Z_01a0c7ac-4f44-7000-97e6-5f4c9833362f/local'<slug>-plan.md` (`:5`), and forbids asking for approval in prose — approval happens only by
writing the slug to `xd://propose` (`:7-9`, `:118-121`).

**CLAIM — what a plan must be**
"Execution spec, not design doc": a fresh agent must be able to implement from the file alone with
zero design decisions (`:13-15`). Required sections: Context, Approach (ordered behaviour steps
with exact edits, reuse, callsites), Critical files & anchors (≤5), Verification (concrete
input → observable output, exact commands), Assumptions & contingencies (`:81-92`). Forbidden:
Non-Goals, Alternatives, Risks, Future Work sections (`:95`). Two workflows: iterative
(explore → interview → update → calibrate, `:60-68`) and parallel (understand with scout
subagents → design → review → write, `:69-78`).

**CLAIM — the human gate and what happens after**
Review options on `xd://propose`: approve and execute in a fresh context; approve and compact;
approve and keep context; save and quit (`:106-113`). On approval the plan is inlined into the
system prompt with "MUST verify each step before next" and todo tracking
(`prompts/system/plan-mode-approved.md:1-25`); a durable copy is autosaved to
`<project>/.omp/plans/<TOPIC>_PLAN.md` by default, `plan.autosaveDir` overrides
(`plan-mode/plan-autosave.ts:14-40`). Plan mode can be the startup default for new interactive
sessions (`cli/modes/interactive-mode.ts:1660-1672`); headless print mode does not honour that and
offers `--plan-yolo` (auto-approve) instead (`cli/modes/print-mode.ts:157-163`). A plan model
role can differ from the execution model (`commands/launch-help.ts:22`, `plan-mode/model-transition.ts`).

**CLAIM — relation to P-12 as ruled**
P-12 requires the *option* to spec-and-plan per project, offered at the appropriate time. Plan mode
is an option-per-session (toggle key `app.plan.toggle`, `cli/controllers/input-controller.ts:643-645`,
or startup default), read-only while planning, with a mandatory human approval gate and a
durable plan file — which is the P-4 shape (gate + sign-off) at the plan step. It is a *task*
planner ("execution spec") rather than a project *spec* tool; nothing in the prompt speaks of
specs, requirements, or Linear.

**GUESS (inference)**
Whether plan mode can be entered for a *hand* (subagent) rather than the session — there is a
`prompts/system/plan-mode-subagent.md`; not read. Settle by reading it and the executor's use.
