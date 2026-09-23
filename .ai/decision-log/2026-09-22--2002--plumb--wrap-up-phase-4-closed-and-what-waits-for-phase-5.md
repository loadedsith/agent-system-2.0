---
date: 2026-09-22T20:02-07:00
engineer: Jo Wolff (seat: Plumb)
session: Phase 4 research assembled, proofread folded in, Phase 4 closed
status: resolved
durable: false
---

## What changed

- Phase 4 closed by Jo. Full record in the phase-close entry written minutes earlier:
  `.ai/decision-log/2026-09-22--1959--plumb--phase-4-closed-seven-reports-four-rulings-and-the-remote.md`.
  This wrap-up does not restate it.
- Commits this session on `main` (all local, none pushed by Plumb): `4ee89c4` RESEARCH.md
  assembly; `f72804c` proofread rewordings + reports tracked under `research/phase4/`;
  `f89bc76` P-7b reserved list; `c8423f2` P-13 shape + naming ruling; `a46a2c2`, `5eb084a`,
  `5d273db` `scripts/create-remote.zsh` and its two fixes; `2dc2e4f` P-16 report + § I;
  `82cc033` phase-close decision log.
- Files: `RESEARCH.md` (new), `research/phase4/*` (ten files, new), `PREFERENCES.md`,
  `REQUIREMENTS.md`, `req-responses.md` (Jo's, resolutions appended), `scripts/create-remote.zsh`.

## Decisions made (and why)

- All in the phase-close entry. Two made after it, for the record: (1) the ctx registration
  test (register `~/.omp/agent/seat-sessions` as a `pi` root) is the first Phase 5 item and
  Jo wants it executed very early; it changes ctx's config under Jo's home, so Tinker or Jo
  runs it, not Plumb. (2) Lintel set a repo-local `core.sshCommand` pointing at
  `~/.ssh/id_ed25519_personal` so pushes authenticate as `thewolff`; any other clone of a
  `thewolff`-owned repo needs the same override. Undo: `git config --unset core.sshCommand`.

## Dead ends — don't retry these

- `zsh -n` on a script containing `gh api -X PUT` is blocked by the `careful` guard whichever
  tool wrote the file. Hand such scripts over syntax-checked by eye and expect a step-0 retry.
- `grep -q` on a pipeline under `set -o pipefail` races the producer (`gh auth status`); capture
  to a variable first.

## Heads-up for whoever touches this next

- Nothing is pending on Jo. Phase 5 is not open; Jo opens it. Held Phase 5 decisions are listed
  in `RESEARCH.md` § "Open decisions and held questions".
- Unpushed: `2dc2e4f`, `82cc033`, and this entry's commit. Plumb may not push `main` (charter
  § "What the grant does not touch"); Jo pushes with `git -C /Users/jowolff/code/agent-system-2.0 push`.
- `.tmp/phase4/` still holds the original report copies (git-excluded); `research/phase4/` is
  canonical. `research-D-best-in-class-survey.md` has non-UTF-8 bytes — use `LC_ALL=C`.
- `.ai/session-handoff.md` (gitignored) is current through this wrap-up.
