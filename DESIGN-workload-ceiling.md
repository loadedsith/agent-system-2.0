# Workload ceiling: plan

Workload `wl-muolz8qtp6ylfk`, plan slice `sl-ceiling-plan`, lane `lane-muolz8qtp6ylfk-1`, 2026-09-30.

**done:** Every workload carries a stakes-sized ceiling in its ledger row, the lane runner counts tokens and wall time against it, and crossing 80 % raises a question row to Jo defaulting to stop at the ceiling, proven by a run against a real lane.

## 1. Choices Jo is approving with this plan

**QUESTION**
Answering *approve* accepts all four choices below. Answering *revise* with the letter of a choice takes its alternative instead.

- **A. Column plus an in-place v5 → v6 upgrade** (recommended). The brief asks for a ceiling column on the workload row. Jo's live ledger is at schema v5 with real rows, and today `Ledger.open` refuses any older version with no upgrade path (`ledger/src/index.ts`, `LedgerSchemaVersionError`). So v6 ships one narrow upgrade: v5 → v6 only, run in one transaction after a forced backup. It adds the two columns, backfills them from stakes, and adds the trigger. *Alternative:* the ceiling lives in a `ceiling:` control entry on schema v5, so nothing is upgraded. The catch is that the raise rule then lives in the entry readers, not in the file.
- **B. The ceiling is sized from stakes alone, at open, inside `Ledger.openWorkload`.** Doing it there keeps this workload out of `surface/extensions/workload.ts`, which is the L2 file. *Alternative:* multiply the size by 3 for a plan-first (change-large) workload, as the M7 row suggests. That needs a two-line edit to the open tool in `workload.ts`, and would land after L2 does.
- **C. The sizes.** These are my guess, with this basis: this plan slice alone cost $1.66 nominal over 27 turns, measured from the lane's own frames. The table lives in one place, `ledger/src/ceiling.ts`.

  | Stakes | Dollars (nominal, list price) | Wall time (lane run time) |
  |---|---|---|
  | throwaway | $5 | 1 h |
  | normal | $50 | 6 h |
  | production | $150 | 12 h |

- **D. *extend* adds one more stakes-sized block** (both halves), so Jo's answer stays one word. An exact figure goes through the surface word `ceiling <usd> [<hours>] [wl-…]`, which is Jo's and is recorded as an instruction.

## 2. Mechanism (what the slices build)

**CLAIM** — the facts this rests on, each checked this session:
- OMP's `message_end` rpc frame carries `message.usage.totalTokens` and `message.usage.cost.total` (nominal list-price dollars). I read both from this lane's own frames: `/Users/jowolff/.agent-system-2/lanes/wl-muolz8qtp6ylfk/lane-1.jsonl`, first assistant message `totalTokens 40647`, `cost.total 0.189`.
- A hand's session file is `<artifactsDir>/<id>.jsonl` (`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/task/executor.ts:3520-3521`), and the artifacts dir sits beside the lane's session under `~/.agent-system-2/lanes/<wl>/sessions/<session>/`. So summing the assistant `usage` over every `.jsonl` under `sessions/` counts the lane and all of its hands, sync and async alike. That also closes the async-delivery gap the task-tool result has.
- `questions.slice_id` is `NOT NULL` (`/Users/jowolff/code/agent-system-2.0-lanes/wl-muolz8qtp6ylfk/ledger/schema.sql:128`), so the ceiling question needs a slice of its own.
- The mode flip already has the "needs a Jo instruction" trigger (`workloads_mode_needs_instruction`, `/Users/jowolff/code/agent-system-2.0-lanes/wl-muolz8qtp6ylfk/ledger/schema.sql:422-425`), and the raise trigger copies it.

**GUESS(inference)** — the design, not yet built:
1. **Row.** Two columns go on `workloads`: `ceiling_usd REAL NOT NULL CHECK (ceiling_usd > 0)` and `ceiling_wall_min INTEGER NOT NULL CHECK (ceiling_wall_min > 0)`. `openWorkload` fills them from `ceilingFor(stakes)`. `setCeiling(id, { by, usd, wallMin })` changes them. A trigger, `workloads_ceiling_raise_needs_jo`, refuses any increase of either value unless an `instructions` row exists that is authored by `jo`, has a body of `ceiling: …` or `stakes: …`, and is no older than `OLD.changed_at`. That puts P-7b item 2 in the file. Lowering needs no instruction, which makes it the orchestrator's. `setStakes` re-sizes to the new stakes' size, and the surface now writes the `stakes:` instruction *before* the flip (today the order is the other way round, `surface/src/input.ts:79-80`). The provenance detail gains `ceiling a->b`.
2. **Spend.** The unit is nominal dollars (§ B11). Tokens are counted and recorded beside the dollars but never compared, because § B11 rejected tokens as the unit. Spend is the sum over the workload's session files, so it is cumulative across relaunches and `--resume`, and recomputable at any time. **Wall time** is lane run time: the sum of `lane-started:` → `lane-exit:` intervals, plus the current run. Calendar time since open is not counted, so a workload parked on Jo spends nothing.
3. **Runner.** On the existing 5-second stop poll, the runner meters incrementally (byte offsets per file). It writes `spend: <laneId> usd <x> tokens <n> wall <min>`, with writer `lane-runner`, a new reserved control prefix, at each threshold and at `lane-exit:`. **At 80 %** of either half, in one transaction, it adds the machinery slice `sl-ceiling-<n>` ("Jo decides the ceiling overrun") and raises the question: *"<wl> has spent $x of $c (w of W min). stop (default): the lane stops at the ceiling · extend: one more <stakes> block · split: stop at the ceiling, and the orchestrator opens the rest as a new workload."* The options are `stop / extend / split`, and it is raised once per ceiling value. The lane keeps working. **At 100 %**, when the question is still open or was answered stop or split, the runner writes `lane-stop: <laneId> accepted ceiling`, aborts, and ends with outcome `stop`. That path already writes no `lane-died:` (`exitClass`), so the overrun reaches Jo as § B3 line 5, the open question, not as a death. `--max-time` becomes the remaining wall ceiling plus 10 minutes, a backstop behind the runner's own stop. When a lane finishes under the ceiling with the question still open, the runner withdraws it with `then: cancel`, so the close is not blocked.
4. **Surface.** Answering the ceiling question:
   - *extend* records `ceiling: <new>` from Jo, then `setCeiling`, completes the ceiling slice, and writes `launch-requested:`. If the lane had stopped, the predicate relaunches it with `--resume`.
   - *stop* and *split* complete the slice, and nothing relaunches.
   - The one-liner at open and in every render shows `ceiling $50 / 6h`. The workload block shows the newest `spend:` line against it.
   - `orchestrator_lower_ceiling { workloadId, usd?, wallMinutes? }` refuses any value above the current one.
   - The lane's first prompt carries the ceiling and the spend so far, so the lane can set § B9's ceiling-share field from real numbers.

**Not covered, on purpose:**
- Interactive `as2 lane <wl>` sessions have no runner, so they are not metered. That is Jo at the keyboard.
- The classifier's TypeSafe `judge()` calls are metered money but are not in session files, and § B11 puts them at fractions of a cent.

## 3. Slices

The file clusters are disjoint across slices, and none of them touches `surface/extensions/workload.ts` or `gates/src/rows/r15-orchestrator-role.ts` (L2's files). S1 goes first. S2 and S3 then run in one batch against S1's API, fixed below.

| Slice | Kind / tier | Files (read and write) | Done condition | Proving command |
|---|---|---|---|---|
| **S1 ledger** | change-large / strong | `ledger/schema.sql`, `ledger/src/index.ts`, new `ledger/src/ceiling.ts`, `ledger/SCHEMA.md`, `ledger/test/*` | v6: the two columns, `ceilingFor`, `setCeiling`, `ceilingQuestion`, the raise trigger, `setStakes` re-sizing, provenance detail, the v5 → v6 upgrade (forced backup, one transaction, idempotent refusal of v4 and below), and backups: the first v6 copy is written right after the upgrade | `bun test ledger` |
| **S2 runner meter** | change-large / strong | `surface/scripts/lane.ts`, new `surface/src/ceiling.ts` (pure: scan, wall, thresholds, question text), `surface/src/launch.ts` (`spend:` prefix, `--max-time` from the remaining wall), `surface/test/fake-omp.ts` (writes session files carrying `usage`), `surface/test/lane-script.test.ts`, new `surface/test/ceiling-meter.test.ts` | Fake-omp: 80 % raises exactly one question and the lane goes on; 100 % unanswered → `lane-stop: … accepted ceiling`, outcome `stop`, no `lane-died:`; hand session files counted; a relaunch keeps the cumulative total; finishing under the ceiling withdraws the question | `bun test surface/test/ceiling-meter.test.ts surface/test/lane-script.test.ts` |
| **S3 surface** | change-small / standard | `surface/src/input.ts`, `surface/src/render.ts`, new `surface/extensions/ceiling.ts`, `surface/src/types.ts`, `surface/index.ts`, new `surface/test/ceiling-surface.test.ts`, `tiers/orchestrator.md` (one line: the lowering tool), and the tool-name list in `surface/test/extension.test.ts:53-54` (**the one line shared with L2's likely test edits**, see § 5) | *extend* raises the ceiling and requests a relaunch; *stop* and *split* only complete the slice; the `ceiling` word works for Jo; the lowering tool refuses a raise; the stakes word writes its instruction first; the one-liner shows the ceiling | `bun test surface/test/ceiling-surface.test.ts surface/test/extension.test.ts surface/test/lane-tools.test.ts` |
| **S4 review** | judge / strong (normal stakes, § B4) | read-only over S1–S3's diff | Written verdict; blocking findings fixed and re-checked | the review file plus `bun test` |
| **S5 real-lane proof** | change-small / standard | scratch dir under `~/agent-scratch/agent-system-2.0/migration/M7/ceiling/` | A real `omp` lane (a real model) on a scratch workload, lowered to a tiny ceiling (for example $0.15 / 10 min), raises the 80 % question and stops at 100 % with no `lane-died:`. The ledger is exported. | the exported ledger plus the runner log |

Lane integration, done by me rather than a hand: `install/manifest.tsv` rows for the four new files; the `DESIGN-lane-launcher.md` decision 12 note (`--max-time` is now the wall half of the ceiling); the M7 row in `MIGRATION.md`; the full `bun test`; then rebase, push, and the PR. Jo integrates.

## 4. Contract S2 and S3 build against (S1 delivers it)

```ts
// ledger/src/ceiling.ts
export const CEILING_BY_STAKES: Record<Stakes, { usd: number; wallMin: number }>; // § 1 C
export function ceilingFor(stakes: Stakes): { usd: number; wallMin: number };
// Ledger
openWorkload(...)                      // unchanged signature; fills ceiling_usd / ceiling_wall_min
setCeiling(id, { by, usd, wallMin })   // the file refuses a raise without Jo's ceiling:/stakes: instruction
ceilingQuestion(workloadId, { by, laneId, body, options }): { sliceId: string; questionId: string } // one write
// WorkloadRow gains ceiling_usd: number, ceiling_wall_min: number
```

## 5. Risks

**GUESS(inference)**
- **The real-lane proof, S5.** A lane's `omp` loads its extensions from the profile, which points at the main checkout, and that checkout's ledger module (v5) refuses a v6 scratch ledger. So S5 either passes the worktree's extensions by `-e` with a scratch ledger (M5 pattern) plus the live profile's credentials, or it runs after Jo integrates, as a live gate on the upgraded ledger. I will try the first. If it cannot run against a real model, I raise that as a question instead of substituting the stub model.
- **The upgrade touches Jo's live ledger.** It is forced-backup-first and one transaction, but v5 copies taken before it will read as not-current to `copyProblem`. The first v6 backup is written straight after the upgrade, so restore always has a valid copy.
- **L2 overlap.** L2 is the pending work to refuse `orchestrator_record_instruction` on a workload the orchestrator neither opened nor holds. The only shared file is `surface/test/extension.test.ts`, one line: the exact tool-name set, which grows by `orchestrator_lower_ceiling`. If Jo wants strict disjointness, S3 lands after L2 merges and rebases onto it.
