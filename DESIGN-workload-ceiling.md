# Workload ceiling: plan (revision 2)

Workload `wl-muolz8qtp6ylfk`, plan slice `sl-ceiling-plan`, lane `lane-muolz8qtp6ylfk-2`, 2026-09-30.

**done:** Every workload carries a stakes-sized ceiling in its ledger row, the lane runner counts tokens and wall time against it, and crossing 80 % raises a question row to Jo defaulting to stop at the ceiling, proven by a run against a real lane.

## 1. Jo's rulings this revision carries

**CLAIM**
Jo's words on this workload, instruction row of 2026-09-30T21:30:15Z, followed by the answer `revise` to `q-muom66wdlpz340` (answer instruction `in-muomdeln10gcn4`); read with `sqlite3 -readonly` from the live ledger's `instructions` table: *"revise A and B. A: keep schema v5 — the ceiling is a `ceiling:` control entry written at open by orchestrator-surface, read by the runner; no upgrade of the live ledger. B: size by the change-large judgment as the M7 ruling says (x3 for a plan-first workload); editing the open tool in workload.ts is fine, L2 is not open. C and D approved as written."*

- **A.** Schema stays v5 and the ledger module is untouched. The ceiling is a reserved control entry, `ceiling: usd <x> wall <min> source <why>`, written in the open transaction by `orchestrator-surface`, the same way `done:` and `plan: first` are written today (`surface/extensions/workload.ts:208-215`). That entry is the workload's ceiling in its ledger row set.
- **B.** The size is the stakes size, ×3 when the open-time classifier judged the brief change-large (the `brief-judged:` result the open tool already computes). **GUESS(inference):** a workload that is plan-first only because of production stakes or Jo's "plan it", and was not judged change-large, stays ×1. My reading is that Jo's "plan-first" here names the change-large trigger. If Jo meant every plan-first workload, the fix is a one-line change in the sizing function.
- **C.** $5 / 1 h (throwaway), $50 / 6 h (normal), $150 / 12 h (production). Dollars are nominal list price as OMP computes them; hours are lane run time.
- **D.** *extend* adds one more block of the workload's own size. An exact figure goes through Jo's surface word `ceiling <usd> [<hours>] [wl-…]`.

## 2. Mechanism

**CLAIM** — facts this rests on, each checked this session:
- OMP's `message_end` rpc frame carries `message.usage.totalTokens` and `message.usage.cost.total`. Read from this lane's frames at `/Users/jowolff/.agent-system-2/lanes/wl-muolz8qtp6ylfk/lane-1.jsonl`: first assistant message `totalTokens 40647`, `cost.total 0.189`.
- A hand's session file is `<artifactsDir>/<id>.jsonl` (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/task/executor.ts:3520-3521`). Summing assistant `usage` over every `.jsonl` under `~/.agent-system-2/lanes/<wl>/sessions/` therefore counts the lane and all of its hands, sync and async.
- Reserved control prefixes, their fixed writers and the writer check live in one place: `CONTROL_PREFIXES`, `CONTROL_WRITERS` and `validWriter` (`/Users/jowolff/code/agent-system-2.0-lanes/wl-muolz8qtp6ylfk/surface/src/launch.ts:68-128`).
- `questions.slice_id` is `NOT NULL` (`/Users/jowolff/code/agent-system-2.0-lanes/wl-muolz8qtp6ylfk/ledger/schema.sql:128`), so the ceiling question gets a slice of its own.

**GUESS(inference)** — the design, not yet built:
1. **Entry and authority.** Two new reserved prefixes go in `launch.ts`:
   - `ceiling:`, writer `orchestrator-surface` only;
   - `spend:`, writer `lane-runner` only.

   Lane tools refuse both, as they already refuse every reserved prefix. The **effective ceiling** is the newest valid `ceiling:` entry, read by a pure `effectiveCeiling(control, instructions)`. An entry that *raises* either half is valid only when it names a Jo-authored instruction id (`… by <in-id>`) newer than the entry it raises. P-7b item 2 is enforced this way, in the reader, since the file no longer carries it. Lowering needs no instruction; it is the orchestrator's. A workload opened before this lands has no entry, so the reader falls back to its stakes size ×1.
2. **Writers, all surface.**
   - The open tool writes the first entry (`source stakes <s>` or `source stakes <s> x3 change-large`).
   - Jo's stakes word re-sizes to the new stakes. The instruction is written first, so the raise can name it.
   - The *extend* answer and the `ceiling` word record Jo's instruction, then the raising entry that names it.
   - A new `orchestrator_lower_ceiling { workloadId, usd?, wallMinutes? }` refuses any value above the current one.
3. **Spend.** The unit is nominal dollars (§ B11). Tokens are counted and recorded beside it but never compared. Spend is the sum over the workload's session files, so it is cumulative across relaunches and `--resume`. **Wall** is the sum of `lane-started:` → `lane-exit:` intervals plus the current run. Time parked on Jo is not counted.
4. **Runner.** On the existing 5-second poll it meters incrementally (byte offsets per file). It writes `spend: <laneId> usd <x> tokens <n> wall <min>` at each threshold and at `lane-exit:`.
   - **At 80 %** of either half, in one `ledger.write`: `addSlice` `sl-ceiling-<n>` ("Jo decides the ceiling overrun"), then `raiseQuestion`. Options are `stop / extend / split`, with stop named as the default. It is raised once per effective ceiling, and the lane keeps working.
   - **At 100 %**, with the question open or answered stop or split: `lane-stop: <laneId> accepted ceiling`, then abort, outcome `stop`. That path writes no `lane-died:` (`exitClass`), so Jo sees § B3 line 5, the open question.
   - A lane finishing under the ceiling withdraws its open ceiling question (`then: cancel`), so the close is not blocked.
   - `--max-time` = remaining wall plus 10 minutes, a backstop behind the runner's own stop.
   - The first prompt carries the ceiling and the spend so far, so the lane sets § B9's ceiling share from real numbers.
5. **Surface on the answer.** *extend* raises the ceiling as in 2, completes the ceiling slice, and writes `launch-requested:`, so a stopped lane relaunches with `--resume`. *stop* and *split* complete the slice and relaunch nothing. The one-liner and the render show `ceiling $50 / 6h` and the newest `spend:` against it.

**Not covered, on purpose:**
- Interactive `as2 lane` sessions have no runner, so they are not metered. That is Jo at the keyboard.
- TypeSafe `judge()` calls are not in session files and cost fractions of a cent (§ B11).

## 3. Slices

The file clusters are disjoint across slices. S1 is the shared pure module, and it goes first. S2 and S3 then run in one batch against S1's exports (§ 4). L2 is not open (Jo), so `workload.ts` is in S3.

| Slice | Kind / tier | Files (read and write) | Done condition | Proving command |
|---|---|---|---|---|
| **S1 ceiling core** | change-small / standard | new `surface/src/ceiling.ts`, `surface/src/launch.ts` (two prefixes, writers, the `--max-time` renderer taking a remaining-wall input), new `surface/test/ceiling.test.ts` | Pure functions: sizing table ×3 rule, `ceiling:` and `spend:` bodies and parsing, `effectiveCeiling` with the raise-needs-Jo rule (matrix: raise without, with an older, and with a newer Jo instruction; lowering by the surface; a lane-written entry ignored), session-file spend scan, wall from control entries, threshold check | `bun test surface/test/ceiling.test.ts surface/test/launch.test.ts` |
| **S2 runner meter** | change-large / strong | `surface/scripts/lane.ts`, `surface/test/fake-omp.ts` (writes session files with `usage`), `surface/test/lane-script.test.ts`, new `surface/test/ceiling-meter.test.ts` | Fake-omp: 80 % raises exactly one question and the lane goes on; 100 % unanswered → accepted ceiling stop, outcome `stop`, no `lane-died:`; hand files counted; a relaunch keeps the cumulative total; finishing under the ceiling withdraws the question | `bun test surface/test/ceiling-meter.test.ts surface/test/lane-script.test.ts` |
| **S3 surface** | change-small / standard | `surface/extensions/workload.ts` (open writes `ceiling:`), `surface/src/input.ts`, `surface/src/render.ts`, new `surface/extensions/ceiling.ts`, `surface/src/types.ts`, `surface/index.ts`, `surface/test/extension.test.ts`, new `surface/test/ceiling-surface.test.ts`, `tiers/orchestrator.md` (one line) | Open writes the entry (×1, and ×3 when judged change-large); *extend* raises and requests a relaunch; *stop* and *split* only complete the slice; the `ceiling` word; the stakes word re-sizes; the lowering tool refuses a raise; the one-liner shows the ceiling | `bun test surface/test/ceiling-surface.test.ts surface/test/extension.test.ts surface/test/lane-tools.test.ts` |
| **S4 review** | judge / strong (normal stakes, § B4) | read-only over S1–S3's diff | Written verdict; blocking findings fixed and re-checked | the review file plus `bun test` |
| **S5 real-lane proof** | change-small / standard | scratch dir `~/agent-scratch/agent-system-2.0/migration/M7/ceiling/` | The worktree's `lane.ts launch` runs a real `omp` lane with a real model against a scratch ledger. A scratch workload is lowered to a tiny ceiling (for example $0.15 / 10 min); it raises the 80 % question and stops at 100 % with no `lane-died:`. Ledger exported. | the exported ledger plus the runner log |

Lane integration, done by me: `install/manifest.tsv` rows for the new files; the `DESIGN-lane-launcher.md` decision 12 note (`--max-time` becomes the wall half of the ceiling); the M7 row in `MIGRATION.md`; the full `bun test`; then rebase, push, and the PR. Jo integrates.

## 4. Contract (S1 delivers; S2 and S3 build against it)

```ts
// surface/src/ceiling.ts
export const CEILING_BY_STAKES: Record<Stakes, { usd: number; wallMin: number }>; // § 1 C
export const CHANGE_LARGE_FACTOR = 3;
export function sizeFor(stakes: Stakes, judgedKind: RoutingKind | null): Ceiling; // Ceiling = { usd, wallMin }
export function ceilingBody(c: Ceiling, source: string, byInstruction?: string): string; // "ceiling: usd 50 wall 360 source …[ by in-…]"
export function effectiveCeiling(control: readonly ControlEntry[], instructions: readonly InstructionRow[], stakes: Stakes): Ceiling;
export function spendBody(laneId: string, s: Spend): string; // Spend = { usd, tokens, wallMin }
export function scanSpend(sessionsDir: string, offsets: Map<string, number>, acc: Spend): Spend; // incremental
export function wallMinutes(control: readonly ControlEntry[], now: number, currentStart: number | null): number;
export function crossed(s: Spend, c: Ceiling): 0 | 80 | 100;
export const CEILING_OPTIONS = ["stop", "extend", "split"] as const;
export function ceilingQuestionBody(wl: string, s: Spend, c: Ceiling, stakes: Stakes): string;
```

## 5. Risks

**GUESS(inference)**
- **S5 on a real model.** The lane's `omp` loads the main checkout's extensions from the profile. With schema v5 unchanged, they read a scratch ledger fine. Only the runner (the worktree's `lane.ts`) needs the new code, so a pre-merge real-lane run is expected to work. If it cannot run against a real model, I raise that as a question and do not substitute the stub model.
- **The raise rule is reader-enforced,** so a raw write could forge a `ceiling:` entry. Row 10 already refuses raw ledger writes, and `validWriter` drops any entry not written by `orchestrator-surface`, the same trust level as `plan: approved` today.
