---
date: 2026-09-29T19:30-07:00
engineer: Plumb (seat; git identity Jo Wolff)
session: Phase 5 execution — triad 1 + cross-lab adversarial pass; fix rounds 4–9 on M3/M4; "extend" and "accidental misuse" rulings; M3 + M4 signed off; M4b OS fence built (.git/config unfenced); wave 3 (M5 surface, M6 skills + profile, as2 launcher) landed; M5 rigor pass in flight
status: resolved
durable: false
---

# Fail-closed extended, then bounded by a threat model; M3 + M4 signed off; the OS fence and wave 3 landed

## Needs Jo

**CLAIM**
Nothing blocking. **M3 and M4 are closed** (Jo: *"yes, signed off"*, 2026-09-29). Open at close of this entry: the wrapper-only astra pass on the OS fence (`AstraFence2`, retried after a network drop) and the M5 rigor pass (Codex astra correctness + fable-medium leg) — both reports land under `~/agent-scratch/agent-system-2.0/migration/{M4b/review-astra-1,M5/review-astra-1,M5/review-fable-1}/`. `main` is ~60 ahead of `origin/main` — Jo pushes. **Launch, once both pass:** `bash install/install.sh` once, then `as2` from any repo (the row records this; `as2 --print` shows the long form).

## What changed (commits on `main`)

**CLAIM**
- `1fe1b6e` M3 fix round 4; `dd88fb8` M4 fix round 4 (both from astra pass 4 + triad 1; reports under `~/agent-scratch/agent-system-2.0/migration/{M3,M4}/fix-4/`).
- `586d736` **M3 fix round 5 — ledger schema v5**: `routings` rows carry `session_root` + final allocated `agent_id`; durable recovery authorizes a delivery only from the row matching both (astra-4 B1); per-member pending release; liveness tokens on timeouts; whitespace model names refused. 127 classifier + 207 ledger tests; fresh-machine step 9 refuses v4. Plumb's call: a no-session-file lane refusing a spawn for no usable model writes no row and says nothing extra.
- `b6b1cfd` **M4 fix round 5** — see § Rulings "extend". `gates/src/git-model.ts` (positive per-subcommand model, prefix-resolved long options, 44 read-only subcommands with option tables generated from git 2.50.1). Generating the tables surfaced three write paths the old read list allowed: `apply --unsafe-paths` (live test wrote an executable `.git/hooks/pre-commit`), `archive -o`, `interpret-trailers --in-place`. verify.ts replay of the adversarial pass: **0 bypasses** (41 at `dd88fb8`); 181 real read-only git commands from shell history: 0 refused; 823 tests.
- `a064959` **threshold inclusive**: exactly 0.55 is flagged (`classifier/src/route.ts`); replay sample 8/32 flagged (LedgerLifecycle, recorded at exactly 0.55, joins).
- `5c61017` M5 row: the orchestrator chooses its own name and pronouns at first wake, recorded as its own ledger entry; hands do not.
- `fafb77e`, `54e7d4f`, `aa80326`, `d7e106e`, `028ca7a`, `a34d9ac`, `5daf1fa`, `61bf786`, `affe95f`, `7d83b39`, `8f8ebb9` — MIGRATION rows.
- `f5cea87` M4 fix round 6 (1131 tests); `fb5242d` **SPEC § A4 threat model** (below); `4ebbb85` fix round 7 (three hands, disjoint files, 1393); `34e744b` fix round 8 (two hands, 1583); `39e8611` fix round 9 (astra-9 verification pass R1, 1623); `216894e` **M3 + M4 closed**.
- `7f80399` M11 scheduled threshold re-measure as a ledger row; `d760648` M5 lane slicing rule + M11 `slice_parallelism` view; `368a665` **M4b opened**; `8e451ad` **M4b step 2 — the OS fence** (Seatbelt deny on the realpath'd ledger dir, the `.git` entry, `.git/hooks`; last `tool_call` handler; per-call original map; 37 tests, 5 real OMP sessions); `30a42ad` **M4b fix round 1** (`.git/config` unfenced per Jo; internal-URL tokens refused loudly; handler-order bypass guard; bash 3.2 recorded).
- `03283b6` **wave 3**: M5 `surface/` (wake = ledger rendered, five § B3 lines, question rows, four-hour hold, first-wake identity, voice doc + owned output-types contract; 21/21 scripted real-OMP checks + shipyard isolation), M6 `skills/` (21 at the § C6.4 pins, `VENDOR.md`, profile render, `includeSkills` exact), `bin/as2` launcher, gates now in the profile's `extensions:` (surface → gates → classifier), row 6 `reserved-request` writer, row 8 `artifact-failed:` writer. 2019 tests / 0 fail; fresh-machine 36 PASS.

## Reviews and their verdicts

**CLAIM**
- **Triad 1** (`~/agent-scratch/agent-system-2.0/migration/triad-1/REPORT.md`): 3/3 legs, 18 ranked defects, 3 rulings; leg A (fable medium) 295 s. Plugin bug: `lib/leg-runner.sh` `leg_has_body` uses `grep '[{[]'`, which fails on macOS grep — the leg was mis-flagged `no-report`; status corrected by hand. For Sedge's queue.
- **Cross-lab adversarial pass on the gates, once** (`…/migration/adversarial-1/`, at `dd88fb8`): fable-5-1 medium 859 s → 52 claims / **36 matcher-confirmed bypasses** + 10 false-refusals; Kimi 597 s → 16 / 4 + 10; **Codex leg: OpenAI's safety filter refused the bypass-hunt prompt** ("possible cybersecurity risk"), 0 output, not retryable. `verify.ts` replays every claim against the real matcher in a clean worktree — only confirmed rows entered the fix brief.
- **M4 astra pass 5** (`dd88fb8`): 3 blocking (printf `%b` octal without leading zero, quoted SQL identifiers erased before the function allowlist, aliased `Bun.file` writer), 5 should-fix. **Astra pass 6** on `b6b1cfd` in flight at compaction.
- **M4 astra 6** (`b6b1cfd`): 9 blocking, all the positive model applied one step further → fix 6. **Astra 7** (skills named, source tags — Jo: *"yes to name it"*): 5 blocking, all evasion shapes → the threat-model ruling. **Astra 8** (graded vs § A4): 3 blocking accident-shaped (env assignments judged as a final map; eval subprocesses outside the env check; infra verbs behind global options) + 1 should-fix → fix 8. **Astra 9, verification-only**: all four closed, 0 bypasses, 0 blocking, one introduced false refusal (a `NODE_OPTIONS` spelling in a comment refused an ordinary `Bun.$`) → fix 9. **Gate re-run PASS** at `34e744b` (`…/M4/gate-final-2/`), fresh-machine at `39e8611`.
- **M4b step 1** (research hand, real-OMP harness with a stub model): state kept under `autoBackground` (lanes already get a fresh shell per call); ~10 ms/call; 181 commands 0 divergences; builtins lost (8/28 probes) — measured against every OMP bash call on this machine (33,153 distinct): 46 GNU-only spellings ≈ 0.14 %, 11 bash-4-only ≈ 0.03 %; `jq` becomes the real one. **OMP seam research** (`…/M4b/omp-seam/`): OMP keeps no original command (per-call map required; ids stable); no native sandbox seam; a later handler returning any object replaces the revision wholesale (fail-open, guarded in fix 1); a bash-tool shadow via `ctx.invokeTool` is the recorded alternative.
- **M3 astra pass 4**: do-not-merge (B1 recovery ignores session root) → fix round 5. **M3 astra pass 5** (`586d736`): **merge as is**, no new finding.
- **M3 gate** (`…/migration/M3/gate/REPORT.md`): 32 briefs through the hook with the live judge, twice; 64/64 answers `typesafe/jev-1.13.0`; hook tier = `route()` 32/32; agreement 20/30 and 21/30 vs recorded 21/30; flagged 6 and 7 vs 7; 2/32 per-brief tiers moved between identical live draws (near-ties on already-flagged briefs). Row 4: 5/5 refusals. OMP reports $0 for `jev-1.13.0` because `profile/models.yml` carries no price (real spend ≈ $0.002).

## Rulings

**CLAIM**
- **Jo: "extend"** — the fail-closed inversion goes one level down. Inside a modeled command, row 6 is no longer a regex denylist: per git subcommand a positive model of allowed options (prefix-resolved, ambiguous → refused), rm positive options with GNU prefix rules (temp paths exempt per § A4), DB clients literal targets only, every wrapper and second-shell runner refused. Reason: fable's 36 confirmed hits were all spellings a regex missed (`--har`, `restore`/`switch --discard-changes`, `clean --force`, quoted subcommands); patching spellings guarantees the next pass finds more.
- **Jo: "lets go with your recco"** — `ssh host cmd` and `bash -c …` refused from a lane (the gate cannot model what runs in the other shell); the 180-command ordinary sample regrades to 98/100 + 33/40 with the five misses graded "ruling" rather than holding the bar by allowing ssh.
- **Jo: "let's follow your recco"** — threshold inclusive (above).
- **Jo: "record it now"** — first-wake identity on M5.
- **Jo: "accidental misuse"** (SPEC § A4, `fb5242d`) — the threat model is our own lanes doing the wrong thing by accident; deliberate evasion is out of scope and fixed only when cheap. Reason: astra 7's five blockers were all evasion shapes; without a bar every pass finds another.
- **Jo: "PASS 9?!" → "go with your recco"** — astra stops hunting on the gates: pass 9 verification-only, then sign-off; further hardening only from ledger evidence (M11) or the fence.
- **Jo: "build it build it buuuuild it"** — M4b step 2, accepting the builtin loss (measured, above).
- **Jo: "refusal of git push -u origin feature is going to be annoying. let's not let it even get to that point"** — `.git/config` leaves the fence set; config-write protection is the parser's alone; `.git/hooks` and the ledger dir stay kernel-fenced.
- **Jo: "i am never going to remember a command that long" → "let's do as2, for now"** — one-word launcher on PATH.
- **Jo: "yes, signed off (per the recco)"** — M3 and M4 together, M4 not held for the fence.
- **Plumb's calls this stretch**: loud over silent for every fence cost (internal-URL tokens refused with the alternative named; bypass → one ledger row + refuse bash until restart); `reserved-request` entries only for real § A4 refusals, not respellings; identity/wake rows on a standing `wl-orchestrator` workload; scheduled rows are `due:` workloads; `VENDOR.md` beside the skills; entry kind `assumption` for the fence-off row.
- **Plumb's calls (earlier)**: `git commit -m "$(date)"` and `git add src/*.ts` stay refused (round-4 rule: expansions in git args); a PMDW check-in beside a QUESTION refused (one closing ask per turn; round-3 allow reversed); read-only git subcommands get full option tables rather than a named exec-option denylist (same shape that failed five reviews); "within noise" for the M3 gate = live-vs-live spread on aggregate figures, gate wording amended (`MIGRATION.md` M3 gate column).

## Lessons

**CLAIM**
- The cross-lab adversarial leg paid for itself in one run: fable at medium found more confirmed bypasses in fourteen minutes than five astra passes combined, because a different lab tries different spellings. Kept to once-on-the-gates by the rigor budget.
- OpenAI content-flags bypass-hunt prompts; Codex is usable as a *reviewer* (review framing) but not as an adversarial leg without Daybreak access.
- "Verify before believing": replaying every leg claim through the real matcher cut 68 claims to 60 confirmed and stopped two wrong claims (an `exit 0` + `fatal:` output "bypass" that was OMP's exit code) from reaching a brief.
- Generating an allowlist from the tool's own documentation finds bypasses the denylist never modeled (`apply --unsafe-paths`).
- A live gate needs its tolerance fixed before the run; the hand did that and the pre-registered per-brief tolerance failed while the aggregate held — the ruling is the reading, recorded on the row.

- A parse-time gate as the only line has an unbounded long tail: blocker counts fell 9 → 5 → 3 across passes but never to zero, and every pass opened a new corner. Every shipping agent pairs the parser with an OS sandbox; the fence is what let the astra treadmill stop honestly.
- Seatbelt fails open silently on a symlinked path; `realpath` everything and test the *real* ledger path.
- OMP replaces a `tool_call` revision wholesale when a later handler returns anything — "the fence is last" is an invariant on the whole profile's extension list, so it has a test.
- Two builder hands on disjoint files in one batch is the norm now (rounds 7, 8, 9, wave 3); serial hands were Plumb-as-lane's habit, not a constraint.
- Measure the cost before ruling on it: "builtins lost" sounded large and was 0.14 % of 33,153 real commands; "bash 3.2" was 0.03 %; `jq` turned out to be a small win. The scan took one minute.
- Loud over silent: a refusal that names the alternative costs one retyped command; an exit-0 no-op (upstream tracking under a fenced `.git/config`) costs a wrong state nobody notices. Jo then ruled the specific case the other way — but by unfencing, not by making it silent.

<!-- output-types
tier: 0
CLAIM: 5
CITE: 0
GUESS: 0
ACTION: 0
PMDW: 0
QUESTION: 0
-->
