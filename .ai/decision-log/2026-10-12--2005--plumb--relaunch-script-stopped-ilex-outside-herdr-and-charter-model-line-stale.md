---
date: 2026-10-12T20:05-07:00
engineer: plumb
session: Woken by Lintel after the post-reboot relaunch script failed half-way
status: open
---

## Needs a human, at the top

- **Ilex is not running.** The relaunch script stopped the bare Ilex and Plumb processes, then
  failed to start Ilex. Jo re-runs the fixed script from a tab in the HerdR app:
  `zsh /Users/jowolff/agent-scratch/agent-system-2.0/reboot-relaunch/relaunch-ilex-plumb.zsh`.
- **Plumb proposes a charter rewording** (§ "Plumb proposes", below). Jo applies it or not.

## What happened

- The script `/Users/jowolff/agent-scratch/agent-system-2.0/reboot-relaunch/relaunch-ilex-plumb.zsh`
  (written by Plumb) was run in a terminal that was not a HerdR pane. It stopped both bare
  processes (PIDs 23371 Ilex, 23396 Plumb), then `launch-seat --resume ilex` exited 1 with
  "Background seat launch requires a HerdR-managed pane." The failed run's log is kept at
  `/Users/jowolff/agent-scratch/agent-system-2.0/reboot-relaunch/relaunch-2026-10-12-1957-failed.log`.
- **The fault is the script's, not Jo's.** The script never checked for a HerdR pane, and it
  stopped processes before the step that needed the pane. The previous Plumb session did say
  "run it from a third HerdR pane" in the handover message (session
  `2026-10-11T23-58-39-446Z_01a12d67…`, 02:53:44Z), but only as a sentence mid-message; a
  precondition that stops a destructive script belongs in the script, not in prose. (This
  entry first said Jo was never told; that was wrong, and is corrected here.)
- The script also could not recover: re-run after the failure, it found no bare process and
  exited "nothing to do", leaving Ilex down.
- Lintel woke Plumb through `launch-seat` (process command line carries
  `--model anthropic/claude-opus-5-5`, newdle hooks, compaction owner, seat registry).

## What changed

- The script now checks for a HerdR pane first (the same `HERDR_WORKSPACE_ID` /
  `HERDR_PANE_ID` test as `launch-seat`, `/Users/jowolff/.omp/agent/seat-launchers/launch-seat`
  "Background seat launch requires a HerdR-managed pane.") and stops before changing anything
  when it is not in one, saying so in plain words.
- It launches Ilex when Ilex is not running at all (not only when a bare Ilex was stopped),
  using launch-seat's own running-orchestrator test, so a re-run after a half-finished run
  completes the job.
- Checked: `zsh -n` passes; run with the HerdR variables unset it printed the refusal and
  exited 1 with nothing stopped.

## Plumb proposes

The charter's model paragraph is stale. `launch-seat` now pins Plumb to Opus with the comment
"Opus, not Fable: no worker runs on Fable without Jo's express permission (Jo, 2026-10-12).
The 2026-09-21 Fable pin ("a long running fable agent") is withdrawn by that ruling." Jo
said on 2026-10-12, on waking Plumb: "im glad you are opus".

In `.ai/plumb-seat-charter.md` § "Identity", the paragraph beginning
"**You run on the fable model.** Your launcher row pins `anthropic/claude-fable-5-1:medium`"
is proposed to read:

> **You run on Opus.** Your launcher row pins `anthropic/claude-opus-5-5`. The Fable pin of
> 2026-09-21 (*"a long running fable agent"*) was withdrawn on 2026-10-12 by Jo's ruling that
> no worker runs on Fable without Jo's express permission. Jo launches you with one line,
> stable for the life of the seat: `/Users/jowolff/.omp/agent/seat-launchers/wake-seat plumb`.
> That launcher delivers this charter by naming its absolute path in your wake prompt;
> nothing else about the model or the launch is yours to change.

## Also noted

- Plumb's memory document still reads "pronouns: to be chosen on first wake". The choice
  (they/them) is recorded in
  `.ai/decision-log/2026-09-21--2301--plumb--first-wake-pronouns-and-phase-1-opened.md`
  and is waiting for Jo to promote it.
- Plumb's own boundary says "Writes only inside /Users/jowolff/code/agent-system-2.0"; the
  workspace rule for handover scripts says `~/agent-scratch/<repo-name>/`. The script fix was
  written to agent-scratch, where the script and Jo's one-line command already live.
