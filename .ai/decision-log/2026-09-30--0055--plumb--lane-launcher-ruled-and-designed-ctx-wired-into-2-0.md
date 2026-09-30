---
date: 2026-09-30T00:55-07:00
engineer: Plumb (seat; committed under Jo's git identity)
session: Lane launcher quorum → Jo's rulings → design page + gaslight; ctx wired into 2.0
status: resolved
durable: false
---

## What changed

- `DESIGN-lane-launcher.md` (new, 231 lines): the lane-launcher design under Jo's two rulings, every quorum fork A–L closed, mermaid process shape, components, ledger changes, twelve-row failure table, verification plan, manifest rows, provenance. Written by a planner hand from `~/agent-scratch/agent-system-2.0/migration/M7/lane-launcher/SYNTHESIS.md`; gaslighted once (one leg, Claude on fable); the four landed critiques applied by a builder hand; one pre-existing contradiction (reverse mode flip vs `orchestrator_launch_lane`) fixed by Plumb.
- `c00b8a2` ctx wiring: `install/install.sh` registers `~/.omp/profiles/agent-system-2/agent/sessions` as a ctx Pi root; `profile/mcp.json` (new, manifested at `install/manifest.tsv:110`) mounts the ctx MCP server in the profile; `gates/src/exec.ts` models ctx read subcommands; row 15 allows the seven `mcp__ctx_*` tools; fresh-machine test step 3e; scripted real-OMP session in `~/agent-scratch/agent-system-2.0/migration/M8/ctx-wiring/session/`. 2275 tests, 0 fail. Installed into the live profile (`bash install/install.sh` → exit 0, ctx root `omp-agent-system-2-sessions` added).
- `MIGRATION.md` M7 row: rulings, design page, gaslight, ctx wiring recorded.

## Decisions made (and why)

- **Jo, Q1 (who starts a lane):** at workload open from Ilex's own extension, plus the same pure predicate on the 60-second wake tick as catch-up. No supervisor daemon. Reason: Claude's immediacy with Kimi's crash-safety, one predicate, nothing new to keep alive.
- **Jo, Q2 (what an autonomous lane is):** one prompt into `omp --mode rpc --no-ui`, a detached per-lane runner holds the pipe and releases the lease on any exit. Reason: survives `as2` exiting (all three labs against Plumb's draft), typed exit, no daemon; Codex's persistent rpc needs the supervisor and its `--max-time` only caps a turn.
- **Plumb: holder-checked release at module level, schema stays v5.** `ledger/src/index.ts:31-33` refuses an older schema with no upgrade path, so v6 costs a reinstall of Jo's live ledger for a threat model of accidental misuse. The v6 diff is in the page as the alternative.
- **Plumb: all four gaslight critiques taken** — `launch:` written by `reserveLane` inside its transaction with `by: "lane-starter"` (the vacuous-readiness bug: `claimWorkload` stamps `changed_by` from `by`, `ledger/src/index.ts:458`); refusals write nothing; live parked path cut (park → release → `--resume` on the answer); starter and runner are one `surface/scripts/lane.ts`; the `runner-alive:` heartbeat dropped because the runner's death closes `omp`'s stdin and `omp` releases at prompt end (`rpc-mode.ts:1760-1774`).
- **Plumb: the reverse mode flip writes `launch-requested:` in the flip transaction**, so the predicate relaunches; no separate tool call.
- **Jo: ctx wiring now, in parallel** (not deferred to M8). **Plumb: the orchestrator keeps the ctx MCP tools** — both paths are read-only.
- **Plumb (assumption, Jo asleep):** `durable: false` on this entry; the page itself is the durable artifact.

## Dead ends — don't retry these

- Plumb's withheld draft: worktrees under `~/.agent-system-2/` (fenced, `gates/src/fence.ts:201`), lanes as children paused on `as2` exit, `steer` over a held pipe. All three refuted; recorded in the page § 10.
- Kimi's print-mode lane (`-p`): no stop path, no steering — refuted by both refuters.
- Kimi's one automatic retry: relaunched a finished-but-unclosed workload.
- `ctx` reachability by hoping OMP reads `~/.omp/agent/mcp.json` for a `--profile` session: it does not (`discovery/builtin.ts:212-219`, per the hand); the profile needs its own `agent/mcp.json`.

## Heads-up for whoever touches this next

- Uncommitted at write time: `DESIGN-lane-launcher.md`, `MIGRATION.md`, this entry — committed together right after (see the wrap-up receipts). Nothing pushed; Jo pushes.
- The page rides on one premise read but not run: `omp --mode rpc --resume <path>` continues the recorded conversation for a new `prompt` frame. It is the first real-OMP test in the build (page § 8).
- Next: open "build the lane launcher" as a 2.0 workload with Ilex; Plumb runs the lane by hand one last time (beefy-builder), with the page as the brief and the close-tool commit folded in.
- Still owed on M7: the workload ceiling; row 1 graded-label parse.
- Gaslight was one leg because the picker came back empty; a Codex leg on the revised page is cheap if Jo wants a second lab.
