# OMP: is "blocked on a prompt" observable from outside?

**CLAIM**
Yes. OMP emits first-party extension events specifically for approval-pending and ask-pending, and both are distinct from turn-end idle. `tool_approval_requested` / `tool_approval_resolved` are declared at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:916` and `:925`, subscribable at `:1285` and `:1286`.

## 1. Lifecycle states and the surfaces that carry them

**CLAIM**
The registry roster has exactly four states — `"running" | "idle" | "parked" | "aborted"` — at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-tui/src/overlays/agent-hub-types.ts:7`, re-exported into the agent registry at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/registry/agent-registry.ts:16-18` and stored per ref at `:75`. None of the four means "blocked on a human". Transition to `idle` happens only on result acceptance at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/registry/agent-registry.ts:247`; `parked`/`aborted` are set from persistence at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/registry/persisted-agents.ts:727` and `:804`.

**GUESS** (inference, from `:247` guarding on `ref.status === "running"`)
A session sitting on a permission prompt stays `running` in the registry, because acceptance never fires mid-turn. I did not run a session to confirm.

**CLAIM**
Hook events (the `HookEvent` union at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/hooks/types.ts:393-409`) carry **no** approval or ask event. Its session/turn literals are enumerated at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/shared-events.ts:30-299` — `session_start`, `session_stop`, `session_shutdown`, `agent_start`, `agent_end`, `turn_start`, `turn_end`, `auto_compaction_*`, `auto_retry_*`, `ttsr_triggered`, `todo_reminder`, plus tool call/result. So an agent that only subscribes to hooks sees Claude Code's problem exactly.

**CLAIM**
The richer *extension* API is the surface that differs. Beyond the approval pair it exposes `tool_execution_start` / `tool_execution_end` with `args` at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/types.ts:800-824`, and a synchronous `isIdle(): boolean` on the extension context at `:454`.

**CLAIM**
Two out-of-process surfaces exist. ACP: a pending tool permission becomes an outbound JSON-RPC `requestPermission` call to the connected client — wrapped at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/session/session-tools.ts:873-891`, issued at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/modes/acp/acp-client-bridge.ts:143`, capability-gated at `:36`. Warp: OSC-777 events on stdout at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/modes/warp-events.ts:66-78`.

**CLAIM**
No status *file* is written for any of this. The states above travel as in-process events, an ACP RPC, or a terminal escape sequence.

## 2. The exact distinguishing names

**CLAIM**
Extension events: `"tool_approval_requested"` with `{sessionId, toolCallId, toolName, reason?, approvalMode}` (`.../extensibility/extensions/types.ts:916-923`) and `"tool_approval_resolved"` with `{approved}` (`:925-932`). Emitted from the tool wrapper at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/extensibility/extensions/wrapper.ts:285-303`, inside `if (approvalCheck.required)` at `:273`.

**CLAIM**
`ask` has no dedicated event; it is detected as a tool that starts and does not end — `tool_execution_start` where `toolName === "ask"` (tool name declared at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/tools/ask.ts:747`).

**CLAIM**
Warp's wire names for the same two conditions: `permission_request` and `question_asked`, both listed in `WARP_ATTENTION_EVENTS` at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/modes/warp-events.ts:10-18`, emitted at `:199`, `:206` (`permission_replied`), `:211`.

**CLAIM**
A worked reference implementation already exists on this machine: `/Users/jowolff/.omp/agent/extensions/herdr-omp-agent-state.ts:67` declares `type AgentState = "working" | "blocked" | "idle"`, and `:400-435` maps `tool_approval_requested` → blocked, `tool_approval_resolved` → unblocked, `tool_execution_start`(`ask`) → blocked with the question text as the label (`:234-241`), `tool_execution_end`(`ask`) → unblocked, `agent_end` → idle after a 250 ms debounce (`:75`, `:303-307`). It refcounts with `blockedCount` (`:350-361`) so nested prompts do not unblock early, and ships state over a unix socket named by `HERDR_SOCKET_PATH` (`:12-46`).

**GUESS** (inference; I read only the handler list at `:371-462`)
Plan-mode exit and generic confirm dialogs are not covered by that extension — I found no handler for them and did not trace whether they route through the approval gate.

## 3. "NO TURN OBSERVED" vs "started a turn"

**CLAIM**
Two separate files under the mailbox `acks/` directory, both polled at 50 ms (`/Users/jowolff/.omp/agent/extensions/persistent-seat-registry.ts:749-761`). `<id>.json` is the drain's ack — claimed and injected (`:764-767`). `<id>.turn.json` is the turn receipt, written by the recipient's own `agent_start` handler (`:769-776`, handler at `:1151`). Delivery waits 3 s for the ack (`:896`), then 4 s for the turn receipt; if it lands, `receipt.status = "acted"` (`:904`). Absent, the caller gets the "NO TURN OBSERVED within 4s" string at `:158`; present, "started a turn carrying it" at `:156`. The comment at `:769-774` records why they are separate: an envelope was acked in 7 s and the seat then sat idle 60 s with no turn.

**CLAIM**
So the mailbox's liveness signal is `agent_start` only. It cannot distinguish "seat is blocked on a permission prompt" from "seat never woke" — both look like a missing `.turn.json`.

## 4. What a 2.0 extension would hook for "lane blocked on prompt since T"

**GUESS** (inference from the event shapes above; nothing run)
An OMP extension (not a hook — the hook union has none of this) subscribing to `tool_approval_requested`, `tool_approval_resolved`, and `tool_execution_start`/`tool_execution_end` filtered to `toolName === "ask"` would have everything needed: stamp `T` on the first blocking event, keep a refcount so nested prompts do not close the row early, and emit the ledger row on transition into non-zero. `toolCallId` gives a stable key for pairing request to resolution, `sessionId` identifies the lane, `reason`/`approvalMode` give the blocked-on-what text, and the `ask` tool's `args.questions[0].question` gives a human-readable label. The one structural gap is the parked/crashed case — if the process dies while blocked, no resolved event ever arrives, so the ledger writer needs its own liveness check rather than trusting the event pair to close.
