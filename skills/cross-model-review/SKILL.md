---
name: cross-model-review
description: Fans a judge slice across the three providers (Claude, Codex/GPT, Kimi) so no single lab's priors decide alone. Two entry points, one skill. Review a code diff (triad) when a change needs an independent read before it stands, a second opinion on a branch or PR, or an adversarial pass on your own work. Generate a plan (quorum) when a brief needs independent plans drafted blind by three labs and compared. Use for any cross-model, second-opinion, red-team, or "are we sure" request on code, plans, specs, or documents; the doubt-driven adversarial pass and the plan-refutation stage live here too.
---

# cross-model-review — one judge slice, three labs

<!-- owned: agent-system 2.0 row #14 (DESIGN-2.0.md § C6.1, Q-a ruled 2026-09-25: "yes to the merge - there are too many entry points"). This file is 2.0's routing text. The two bases are ours, copied once from newdle-claude-plugins plugins/newdle/skills at 2f7e67f8 and kept whole with their prompts and scripts: references/triad/ (diff review) and references/quorum/ (plan generation). The absorbed addyosmani/agent-skills `doubt-driven-development` 0.6.11 text is references/doubt-driven-development.md, carrying the June codex network-profile fix (skills/VENDOR.md); `gaslight`, `newdle-triple-check`, `claudex-loop`, `claudex-route`, `codex-build`, `codex-review` and `council` are absorbed here and not shipped. Provider set per SPEC-2.0.md § B11: the three flat-rate subscriptions; no metered chat key. -->

## Why three labs

Single-model review has correlated blind spots: the same weights grading their own homework, whether the reviewer is the main session or a subagent of it. Subagents change the role, not the priors. Three independently trained models from three labs, each in its own information environment, disagree in useful places; where they agree, the finding is worth more than any one of them.

## Pick the entry point

| the artifact under judgment | entry point | read next |
|---|---|---|
| a code diff (branch vs base, a PR, uncommitted work) | **triad** — three legs review the diff, one agreement-ranked report | `references/triad/triad.md` |
| a brief that needs a plan | **quorum** — three legs draft blind, one synthesis maps convergence and forks | `references/quorum/quorum.md` |
| a plan, spec, or document that already exists and needs an adversarial read | **quorum's refutation stage** (`--refute` against the draft) for a plan; **doubt-driven** for any single artifact, see `references/doubt-driven-development.md` | as named |

Each base is self-contained: its `scripts/` fan out the legs in parallel with the isolation and timeouts it documents, and its `prompts/` are the leg contracts. Relative paths inside `references/triad/triad.md` and `references/quorum/quorum.md` (`scripts/…`, `prompts/…`) resolve against **that** directory, not this skill's root: run the fan-out script from `references/triad/` or `references/quorum/` under this skill's directory.

## Rules that apply to both

- **Three providers, one skill.** The legs are Claude, Codex/GPT, and Kimi Code, each through its own CLI on its own subscription (SPEC-2.0.md § B11). A leg whose provider is rate-limited or whose CLI is missing is reported as a missing leg, never silently replaced by a second leg on another provider; a two-leg run says so in its report.
- **Same input, no cross-talk.** Every leg gets the identical artifact and prompt and never sees another leg's output until synthesis. That is the whole value; do not "help" a leg with another leg's findings.
- **Read-only legs.** A leg reviews; it never edits the workspace. The bases enforce this per CLI (a read-only sandbox for Codex, a scratch copy for the others); keep those flags exactly as the base text has them. The Codex sandbox note in `references/doubt-driven-development.md` (network enabled, filesystem fenced) is the measured state and applies to every Codex leg here.
- **Synthesis is labeled.** The report separates what all three found, what two found, what one found, and what was refuted. A finding one lab raised and another refuted is reported as a disagreement, not dropped.
- **The slice closes on the report file.** Both bases write a report under the repo's `.tmp/` (or the location the base names); that file is the judge slice's artifact (SPEC-2.0.md § B1). Paste the needs-you section into the reply; the rest stays in the file.

## Mode

Both entry points run in both modes (SPEC-2.0.md § B13.1). User-driven: Jo names the artifact and reads the report. Autonomous: a lane fans out the judge slice its stakes call for and acts on the agreement-ranked findings without waiting; anything the report marks as needing a human decision goes to the lane's question row, not to a pause.

## Verification

- [ ] The right base was chosen: diff → triad, brief → quorum, existing plan or artifact → refutation / doubt-driven
- [ ] All three legs ran, or the report names which leg is missing and why
- [ ] No leg saw another leg's output before synthesis
- [ ] The report file exists at the location the base names and the reply points at it
- [ ] Disagreements between legs are reported as disagreements, not resolved silently
