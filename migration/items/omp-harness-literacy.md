---
title: The OMP harness guide and start card ship in the as2 profile
status: building
workload: wl-mv8k0fby51uakg
pr: 144
---
**Built on branch `wl/wl-mv8k0fby51uakg`.** Until now no as2 agent was told what its harness offers: which OMP slash commands exist in its mode, which launch flags as2 passes, and which of OMP's settings are machinery-owned. Agents guessed, suggested `/settings` edits that the next install overwrote, or typed slash commands that OMP never dispatches from model output.

Two files now carry that knowledge, both verified against OMP 18.8.6 and its source:

- **The guide**, `profile/OMP-HARNESS.md`. It covers every built-in slash command, the as2 profile's dynamic commands, the launch flags as2's launchers pass, and every OMP setting. Each entry has its OMP source anchor (`pi-coding-agent@18.8.6 src/<file>` plus a `name:`/`id:` string) and a verdict per role: Ilex, a lane, a seat. `install/install.sh` links it to `~/.omp/profiles/<profile>/agent/OMP-HARNESS.md`, so an edit in the checkout is live without a re-install. Nothing loads it automatically. Agents read it on demand, and hands are pointed to it by a line in each hand tier file (`tiers/fast.md`, `tiers/standard.md`, `tiers/strong.md`, `tiers/deep.md`).
- **The start card**, `profile/AGENTS.md`. It holds the short rules, the commands Ilex may suggest to Jo, the launch flags and the settings that are `use` or `machinery-owned` for Ilex or lanes. The installer renders it like `config.yml` (`{repo}` becomes the checkout's absolute path; a surviving `{repo}` refuses the install with exit 2, nothing written) into `~/.omp/profiles/<profile>/agent/AGENTS.md`. There OMP loads it into every top-level session of the profile, Ilex and every lane, as native user context. OMP strips `AGENTS.md` from subagents, so hands never see the card.

The verdict vocabulary, defined in the guide's § Verdict key and roles:

- `use` (when): for a slash command, Jo types it and Ilex may suggest it. No agent can type one, because OMP dispatches slash commands only from user prompt text, and a lane's runner sends none. For settings and skills, the role acts through it.
- `machinery-owned`: set by `profile/config.yml` or the launcher. Change the template and re-install, never `/settings`, because install section 5 rewrites the profile's `config.yml`.
- `Jo only`: Jo's call in the TUI; an agent does not take it.
- `not for as2` (why): with the lane shorthands `(TUI-only)` (the command does not exist in rpc) and `(no sender)` (rpc would run it, but nothing sends it).

Graham's paired-mode note: see profile/OMP-HARNESS.md § Pairing and workspace directories.

**The runtime guide, snapshot headers and the plugin-registry refusal (2026-10-20, jo-issues#55).** A research audit of the guide found it covered what each command, flag and setting is, but not how OMP behaves while it runs. `profile/OMP-RUNTIME.md` closes that gap: one section for each of the audit's 22 subsystems (profile scoping, plugin registries, extension load order and the fail-closed `tool_call` event, message delivery, compaction and the stop-hook skip, session leases, the rpc protocol the lane runner uses, MCP sources and OAuth, credentials, logs, OTEL, tool approval, what a hand inherits, and the rest), each with OMP source receipts and a verdict for Ilex, a lane, a hand and a seat. The installer links it beside the guide, and the card and the four hand tier files name both files. The same pass corrected five guide rows (`--resume`, `OMP_PROFILE`, the extension list, `/mcp`, `/reload-plugins`), added the launch flags no launcher passes (`--no-extensions`, `--no-skills`, `--approval-mode` and the rest), and corrected `plugins/VENDOR.md` clash C11 and its `profile/config.yml` comment: OMP's plugin registry is per profile, so the as2 profile loads no marketplace plugin. The guides and the card now open with `snapshot of OMP <x.y.z>, <date>; drift will occur` in place of the old `verified-omp` line. The card also teaches the start refusal from jo-issues#51: `as2` refuses to start while the default-profile OMP plugin registry and Claude's disagree on a plugin's version, prints two fix commands, and `as2 plugins` rechecks.

Re-verifying on an OMP upgrade. `ledger/test/omp-harness.test.ts` checks that line 1 of the guide, the runtime guide and the card is the snapshot line, with a version equal to `MEASURED_HOST` in `gates/src/shell-start.ts`; that the runtime guide has a `## ` section for each of the audit's 22 subsystems, each with a source receipt or a pointer to a guide section; and that the card is at most 8000 bytes, carries its marker on line 2 and names both guides by their `{repo}` paths. On any OMP upgrade:

1. Rerun the three count commands at the top of the guide.
2. Re-check each changed command, flag and setting row, and each runtime section, against the new OMP source, and update the anchors and verdicts.
3. Bump the snapshot line in all three files.
4. Re-run `bash install/install.sh`.

A version bump of `MEASURED_HOST` fails the snapshot test until the three files are re-verified and bumped too. A minor upgrade also bumps `VERIFIED_HOST` after `gates/test/host.test.ts` passes on the new host.
