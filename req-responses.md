P-4: does "automated gate" include an evidence based outcome (screenshot or video)? As you go forward with it we'll want to tighten this to avoid "lane said so"
P7a: we'll want something other than context to store our tasks state and steps.
P-7b: doesn't this mean the orchestrator won't be able to do ANYTHING without my say so? we are going for the opposite
P-7c: this Is more interesting than it seems on the surface. If we keep the orchestrator rotating very fast, this is fine, but its entirely possible for a user message to queue with the UI for HOURS.
P-8b: what closes this loop?

---

## Resolutions (Plumb, 2026-09-22, confirmed by Jo "as written")

- P-4 → the automated gate produces an inspectable evidence artifact (output / screenshot /
  recording); Jo's sign-off is given on the artifact, never on the lane's statement.
  `PREFERENCES.md` § P-4, "Proofread 2026-09-22".
- P-7a → task state and steps live in a store outside any context window, written by the
  machinery as a side-effect of work; the orchestrator reads it. Same store as P-13/P-17.
  `PREFERENCES.md` § P-7a.
- P-7b → autonomy by default; a short reserved list stays Jo's. Phase open/close + explicitly
  reserved approvals confirmed; rest of the list open — candidates listed under
  `PREFERENCES.md` § P-7 "P-7b reserved list — open".
- P-7c → Jo learns message state (delivered / consumed / acted on); delivered-but-unconsumed
  past a threshold surfaces as an exception; urgent messages may interrupt a lane's turn.
  `PREFERENCES.md` § P-7c. Threshold is a Phase 5 number.
- P-8b → closed by machinery-written state (P-7a), observed liveness / absence-of-progress, and
  P-4's evidence artifacts; a lane's report is informational. `PREFERENCES.md` § P-8b.
- `REQUIREMENTS.md` rows regenerated; `RESEARCH.md` passages marked *(reworded)* rewritten.
