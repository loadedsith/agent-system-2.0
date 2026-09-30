# 2026-09-30 03:30 — Plumb — M4b and M5 verified; fence fix-2's host resolver was a regression caught by two independent legs; M7 next

Status: **resolved on Plumb's side; both rows await Jo's sign-off.** Follows `2026-09-29--1930--plumb--triad-adversarial-extend-ruling-m3-gate-passed-fix-rounds-4-5.md`.

## What landed (all on `main`)

| Commit | What |
|---|---|
| `5ca28d1` | M5 rigor pass recorded: readers right, writers and delivery missing (Codex astra + fable-medium legs agree) |
| `f5d740f` | M4b fix round 2: astra fence B1 `~/repo` cwd, B2 ledger-file symlink, B3 bare repo, whitespace-tolerant bypass guard, **and an absolute-path host-settings resolver (item 5) that turned out to be a regression** |
| `ae19622` | Classifier: `require("@oh-my-pi/pi-utils")` at spawn rejected by OMP's compat loader — every tier spawn failed live; now an awaited import at `session_start` |
| `760c54b` | M4b fix round 3: `gates/index.ts` bare-imports Settings and hands the live reader to the fence; `hostSettingsModule` deleted; no reader → fail closed |
| `515307a` | M5 fix round 1: lane claim/lease/release + `lane-died:`; durable once-only death across takeover; between-wake delivery (idle poll + `sendMessage` aside); `slice_artifact` declared command → `artifact-failed:`/`artifact-passed:`; unbound reserved refusals on `wl-orchestrator`; leaked prompts via `tool_approval_requested/resolved`; S1–S5; 7 new files manifested |
| `a80dce1`, `7869eb8`, `93d4162`, `c8298e6` | MIGRATION.md rows |

Verification: M4b astra 3 **pass** (`~/agent-scratch/agent-system-2.0/migration/M4b/review-astra-3/REVIEW.md`, 1698 gates tests, 181 real commands 0 refused); M5 astra 2 **pass** (`…/M5/review-astra-2/REVIEW.md`, real-OMP writer/delivery harness 14/14, original scenarios 15/15, 1943 tests). Full suite at `515307a`: 2070 tests, 0 fail.

## Rulings (Plumb, within standing pre-approval)

- **M5 held open for the writer round** rather than closed on reader evidence (fable leg's recommendation; Jo: "let's follow your recco"). Reason: a lane dying silently is the failure the surface exists to catch; a first session without line 4 would be a false calm.
- **Lane row lives in the surface package** (`surface/extensions/lane.ts`): loads on every session, inert unless bound; the gates' session state is lane-only and was in a sibling's hands.
- **Artifact identity is a lane-declared exact command** (`slice_artifact` tool → `assumption` entry `artifact-command:`), schema stays v5. Cost, stated in `tiers/lane.md`: an undeclared or respelled command is unjudged. A column is a later round if M7 shows lanes forgetting to declare.
- **All new signals are prefixed `messages` rows**; surfaced-once = `held` → `delivered`.
- **Classifier keeps bare `@oh-my-pi` imports in the entry** (ruled mid-round when the hand showed the brief's premise was false).

## Lessons

1. **A hand's fail-before harness must load the code the way production loads it.** Fix-2's builder reproduced "every bash call refused" by importing `gates/src/fence` by *absolute path* from a probe extension. Measured rule (`…/M4b/classifier-host/probe/out.jsonl:1`, OMP 18.3.0): the legacy-pi-compat loader rewrites bare `@oh-my-pi/*` specifiers reached from the extension entry by *relative* imports to the host's in-process modules; only absolute-path imports fall through to bun's auto-install cache (18.4.4, no native addon). The "reproduction" was the harness; the "fix" made the fence read a second Settings copy that ignored live in-process values (astra 2 proved it: live `bash.autoBackground.enabled` false / disk true → old fence refused, fix-2 fence ran the command).
2. **Two independent legs catch what one cannot.** The classifier hand (chasing the same phantom) and the verification reviewer found the regression from opposite directions in the same hour. The rigor pattern — a verification pass after every fix round, not just after the first — is what caught it; without astra 2 the regression would have shipped into M7.
3. **A phantom hunt can still find a real bug.** The classifier hand's live probe surfaced the `require()` spawn failure that no unit test could (bun test has no compat loader). Live `omp -e` runs are the regression proof for anything loader-dependent; say so in the report instead of adding a wiring test.
4. **Reviewer worktrees leave `.ai/decision-log/.wrap-up-nudge-state` behind** (a hook's state file), which blocks `git worktree remove` without force. Delete it, then remove without force.

## Addendum 05:30 — M7 first session (Jo, orchestrator Ilex)

Signed off M4b + M5 at 03:30; Jo launched `as2` at 03:04. Six findings, all landed on `main` by 05:30 (`ff86593`, `8328353`, `c82d826`, `2031e0d`, `8628fba`, `f78bde3`):

1. **Extension tools mount as `xd://` devices by default** (`tools.xdev`), so a gate keyed on a tool name never sees the call; the wake gate refused the wake read for eight turns. Fix: `loadMode: "essential"` on every ledger tool. Lesson: the scripted real-OMP harnesses called tools by name and never went through the device transport — a harness must drive the model's actual path.
2. **A fresh OMP profile runs the setup wizard**; credentials are per-profile `agent.db`. Fix: `setupVersion` and Jo's whole look-and-feel rendered into the template; install prints the providers to `/login`.
3. **Jo's `omp update` inside the session moved the host to 18.4.4**, which removed `Settings.get`; every bash call on a fresh launch was refused fail-closed (loud, as ruled — nobody was told *why* until the re-verification). Fix: handle reads via shared `gates/src/host.ts`, a verified-host pin with a member table checked at session start. Lesson: pin the host; a fail-closed gate with no version check reads as "everything is broken".
4. **Ceremony on a one-line ask.** Jo's ruling: the trivial-ask path — words-only answers get a plain reply, no workload, no labels, no envelope. Anything that changes state is a workload a lane runs.
5. **The orchestrator did lane work itself** (worktree, commit, push, PR #1) because no lane existed and nothing refused it. Fix: row 15 refuses mutating tools and non-read bash on the orchestrator. Still owed: a lane launcher.
6. **The fence's wrapper is persisted as the model's own command**, so the TUI shows it and the model copies it back (nested `sandbox-exec` → exit 71). Fix: copied wrappers refused loudly; `display.hideToolActivity` hides the wall. Ruling: keep the `tool_call` revision; the shadow-bash seam is a later row, only on M11 evidence of context cost.

Also: the orchestrator first named itself Wren (the newdle-web seat); Jo had it choose again — **Ilex (they/them)**, ledger rowid 4.

## Open

- **Jo's sign-off on M4b and M5** — then M7: `bash install/install.sh` once, then `as2`.
- The plugin's `leg_has_body` macOS grep bug and the Codex content-flag on adversarial framing still owed to Sedge via Lintel.
