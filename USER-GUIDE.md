# as2 user guide

A cheat sheet for talking to Ilex, the orchestrator, at the as2 surface. Short words in the tables below are applied by the surface itself before Ilex reads the turn; anything else is ordinary conversation for Ilex.

## 1. Start a workload

Describe the work in plain words. Ilex opens the workload and infers stakes and mode from what was said; either can be changed later with one word (section 3).

| Stakes | Said when the brief contains | Review before merge | Jo's part | Ceiling |
|---|---|---|---|---|
| `throwaway` | throwaway, scratch, experiment, prototype, spike, poc, "try out", "just see"; or a repo under scratch/tmp/sandbox | none | none | $5 / 1h |
| `normal` (default) | nothing pointing either way | a judge slice; merge proceeds on pass | told in one line after the merge | $50 / 6h |
| `production` | production, prod, deploy, release, hotfix, customer(s), live, outage, incident; or a protected branch or reserved target | a judge slice on deep, then Jo | approves the merge; the deploy is a separate reserved action | $150 / 12h |

- A production review's OpenAI reviewer runs on `openai-codex/gpt-6-sol` (the strong row), never `gpt-6-astra`, until the review-cost framework workload lands or Jo says otherwise (Jo, 2026-10-12; MIGRATION.md item 110).
- A brief judged a large change gets three times the ceiling.
- **Plan first** is the default at normal stakes: the lane's first slice is a plan, answered `approve` / `revise` / `cancel`, and no change slice starts until it is approved. The plan question shows the plan itself: the file path, one line per slice, the main tradeoffs and the review verdict. The plan is skipped only when the open-time judge answers change-small at 0.9 or higher, or when you say "no plan" (or "no-plan") in the brief, unquoted: a quoted `"no plan"` on its own is read as a mention. Ilex can also pass `plan: none` when it opens the workload. "No plan" works only at open; said later, it does not lift plan-first. Production stakes always plan, and "plan it", "plan first", "plan-first" or "plan this" win over "no plan". Throwaway work plans only when judged a large change.
- **Mode:** a lane runs on its own (`autonomous`) unless the brief says "with me", "step by step", "walk me through", "check with me", "ask me", "together", "pair", "interactive" or "user-driven".

Template:

```
new workload, normal stakes, plan first: <what to build>.
```

## 2. Answer a parked question

A question line under *needs you* reads:
`#3 lane on wl-… is waiting on you (q-…, slice sl-…): <question> — answer with one word: <options> (or withdraw)`.
The `q-…` id sits in the parentheses near the start; the options sit at the end.

| Type | One-word answers | Effect |
|---|---|---|
| Any lane question | the option names the line lists (for example `green` / `red`) | answers it; the parked lane resumes |
| Any lane question | `withdraw` | the slice is replanned, not executed |
| Plan question | `approve` / `revise` / `cancel` | approve unlocks change slices; revise reopens the plan; cancel withdraws and cancels the plan slice |
| Ceiling question (raised at 80 %) | `stop` (default) / `extend` / `split` | stop: the lane halts at 100 %; extend: one more ceiling block and a relaunch; split: halts like stop, then Ilex offers a new workload for the rest |
| Ceiling question | `withdraw` | cancels the ceiling slice; the lane still stops at the ceiling |
| Review park (no other lab can review) | `same-lab` / `wait` | same-lab: this one review runs on the builder's lab; wait: the review waits for another lab and the lane asks again if none is back |
| Review round limit | `extend` / `accept` / `stop` | extend: one more block of review rounds for that slice; accept: the review passes with the listed findings left; stop: no further round, the lane reports and holds the slice |
| Reserved action | `approve` / `deny` | decides the waiting action (for example a push to `main`) |

Targeting:

- A bare word applies when it fits exactly one line. When it fits several, the surface answers "which one?" and applies nothing.
- Name the row with a second word: `<option> q-…`, `withdraw q-…`, `approve en-…`, `deny en-…`.
- Use the line's number: `1 approve`. Also accepted: `#1 approve`, `1: approve`, `q1: approve`, `1) deny`.
- Batch several, separated by commas or one per line: `1 approve, 2 deny, 3 green`. Every valid piece applies; a stale or invalid number (not given, no longer waiting, a word its line does not take, given twice) is skipped and named (`#2 skipped: <reason>`), and one bad number never refuses the rest.
- After each Ilex message the surface shows the *needs Jo* list (items only you can decide, each with a one-line reason) and one `send: <n> <word>, …` line holding Ilex's recommended answer to every routine item. Type `ok` to apply that line, or answer by number.
- A number stays with its line for the whole session and is never reused.
- Type `pending` (the whole message) to see every open answer as one fenced block, one line per open row: `<option> <id>  # <subject> · <recommendation> · also: <other options> / withdraw`. The first word is the recorded recommendation, and the tail says `recommended (<where it was recorded>)`; with none recorded it is the row's first option, and the tail says `no recommendation recorded`. A reserved action's tail offers only `deny`. Change a line's first word to pick another option. The `# …` tail is dropped when the line is read, so the line is `<option> <id>`.
- Paste the block back whole, or any of its lines. It is one paste, checked whole and applied all-or-nothing. Pasting it whole also answers every row with no recommendation with its first option; change or delete those lines first if that is not your answer.

## 3. Change a running workload

| Word | Effect |
|---|---|
| `throwaway` / `normal` / `production` | sets stakes and re-sizes the ceiling to the new stakes |
| `autonomous` | hands the workload to a lane and requests a launch |
| `user-driven` | Jo steers; a running autonomous lane is asked to stop at its next poll |
| `ceiling <usd> [<hours>] [wl-…]` | sets an exact ceiling, for example `ceiling 60 8`, `ceiling $60 8h wl-…`. Hours and id in either order; omitted hours keep the current wall time |
| `rounds <n> [wl-…]` | sets the review round limit, for example `rounds 5 wl-…`. Defaults: 3 at throwaway and normal, 5 at production; a stakes word re-sizes it |
| `stop-reviews [wl-… \| sl-…]` | stops review loops: every loop on the workload, or the one on `sl-…`. A review already running finishes and its remaining findings are reported; nothing done is reverted |
| `ok` | applies exactly the last `send:` line shown, each answer its own row, with no Ilex turn unless an answer was to Ilex's own question. Stale or invalid numbers are skipped and named, the rest apply. Refused whole, applying nothing, only when something else was shown after the send line (for example `pending`); with no send line shown, `ok` goes to Ilex as words |
| `pending` | shows the paste-ready block of every open answer (section 2). The surface answers; Ilex takes no turn |
| `brb` | holds routine needs-you pushes until `back`; on-fire lines still come at once. Ilex takes no turn |
| `back` | goes to Ilex as your turn: a digest of the held lines plus the complete list, each item written up with its content |

With one open workload the word applies to it. With several, add the id: `production wl-…`, `autonomous wl-…`. `ok`, `pending`, `brb` and `back` are surface words only as the whole message: `back q-…` or `1 back` still answers a question that offers that word.

**Several commands in one paste:** one command per line, as many lines as you like. Each line is read with the rules of a message of its own: `1 approve, 2 deny` on one line, `production wl-…` on the next, `ceiling 120 wl-…` on the next. The paste is applied in one transaction, in order. A numbered piece that is stale or invalid is skipped and named (`#2 skipped: <reason>`) and the rest apply, on any line of the paste; any other bad line refuses the paste, nothing is applied, and the reply names that line by number and text. A command word with an id that is not an open row (`approve en-nope`, `production wl-nope`, or an id cut short to its prefix, `production wl-`) is a bad line, not an instruction, and a row answered on two lines is too. In a paste a stakes or mode word takes only an id after it: a `wl-…` id flips that workload, and a `q-…` id answers that question (`production ready` is plain words). Lines that are no command are your words to Ilex, one input row per block (consecutive lines together; a command line between two blocks makes two rows), so `1 approve, 2 deny` followed by "Relaunch the classifier fix now" is one paste. A `pending` block pasted back loses its own heading, the fence around its answer lines and the sentences under it, so the block pasted whole sends Ilex no words; a fence you type yourself is kept. The input rows are written in the same transaction as the commands, and Ilex records what each one answers or instructs on its own turn afterwards; a refused paste writes no row and hands Ilex nothing.

### Steer a workload yourself (user-driven)

1. Open it user-driven: put "with me" (or another mode word from section 1) in the brief, or flip an open workload with `user-driven wl-…`. A lane already running on its own is asked to stop at its next poll.
2. Ilex names the workload. In a **separate terminal**, run `as2 lane wl-…`. That terminal becomes the lane's session: you type to the lane there, and it can stop and ask you with its `ask` tool. Autonomous lanes lose that tool (`SPEC-2.0.md` § B13.1).
3. To stop the lane: `as2 lane stop wl-…`. To read its runner log: `as2 lane log wl-…`.

## 4. Read the screen

- **Wake block:** `# Ledger at <time> (wake: <why>)`, then `you are <name> (<pronouns>)`, then `## needs you`, then one `## wl-…` block per open workload.
- **Needs you** lists, in order: reserved actions waiting; anything held 4 hours or more; a slice that failed its artifact twice; a dead lane; a lane that ended on purpose (parked, completed, released) leaving open slices with no holder and no question; a lane waiting on a question or stuck on a prompt; scheduled work past due. Answerable lines carry `#n`. "nothing: …" means nothing is owed.
- **Reserved actions waiting:** a request that repeats an earlier call on the same workload says so (`same call as en-…, approved 18:00`, UTC). A request leaves the list without your word when the lane that raised it stops holding the workload, when a repeat replaces it, or when the running lane withdraws it (`lane_withdraw_reserved`) after moving past it.
- **Between wakes:** at launch, restart and compaction Ilex opens with the wake block and its read without your typing (if you type first, the wake rides your turn). New lines arrive as `## needs you (new since your last turn)`. Tick results (a workload closed, a lane launched, "finished but cannot close") arrive on their own under `## Applied from the surface since your last turn`; words you typed are confirmed under the same heading in your next turn.
- **Batched pushes:** new lines between your turns are held, not pushed one by one. The first one opens a 5-minute window (`AGENT_SYSTEM_SURFACE_BATCH_MS`, in milliseconds, default 300000) that runs from that line and does not slide; when it ends, the lines still standing go out together as one push and one Ilex turn, and lines settled meanwhile (a question answered, a request decided) drop out. Typing anything takes the held lines into your turn sooner, except after `brb`, when only `back` releases them. On fire goes at once, `brb` or not: a lane death with work still open, the ceiling question (at 80 %, and again when the lane stops at 100 %), a lane that stopped at its ceiling, and a red or errored full-suite run.
- **Count line:** every push and every turn carries `open answer lines: N`, and Ilex ends each message with ``N others waiting: `pending` shows them all`` (or `nothing else waiting`) instead of re-listing older items. After 30 minutes without typing, your next turn gets the complete list once.
- **Workload block:** `brief:`, `done:`, then the one-liner
  `stakes: normal · mode: autonomous · plan first: <why> — flip either with one word: … · ceiling $50 / 6h`,
  then `spent $12.4 of $50 · 95.2 of 360 min`, the lane and its lease, `slices:`, `open questions:`, and the last 8 ledger entries.

## 5. Who does what

| Who | Does | Does not |
|---|---|---|
| Ilex | routes, opens and closes workloads, records Jo's answers | close slices, dispatch hands, raise a ceiling, run commands for Jo |
| Lane | builds inside the fence; adds and completes slices; raises questions | run the full test suite; push past gate refusals |
| Plumb | pushes what a lane cannot | |
| Test runner | runs the full test suite, then each changed test file alone, outside the fence at a PR's head, when a lane calls `lane_full_test`; records the result in the ledger and completes the full-suite slice on a green | merge, push, or run anything a lane did not request |
| Jo | answers questions, merges PRs, pushes `main` | |

The test runner runs lane-written code outside the fence, so it narrows what that code can reach instead of sandboxing it: tests run as a separate user, `_as2test`, with an empty environment (no tokens, keys or SSH agent), a throwaway home, git without a credential helper, and a preflight that refuses the run when `_as2test` can open a known credential path, the ledger or the runner's lock. What stays open: a test can reach the network; it can read any file every user can read, other repositories' source included, though nothing of Jo's is writable to it; it writes its own junit, so it can lie about its own result; it can defeat its own time caps, which are not containment; and a lane chaining long runs delays everyone else's (a queued run ends in error after 60 minutes). Separately, a lane can still forge a green `test-run:` through the ledger module, because the ledger accepts a caller-supplied writer; that gap is MIGRATION.md's follow-up "Writer identity for machinery prefixes", not closed by the runner. Before the first run, Jo runs `install/as2test-setup.sh` once. It uses `sudo` to create the `_as2test` user, its directories, one sudoers line, and root-owned copies of bun and the runner's wrapper; it previews every change and asks first, and `--undo` reverses it. Jo runs it again after a bun upgrade or a change to `surface/scripts/test-exec.ts`.

Restart as2 after merges that change surface or lane code; a running session keeps the old code.

## 6. When something looks stuck

- **Lane parked:** a question waits under *needs you*. Answer it or `withdraw` it.
- **Spend at 100 %:** the lane has stopped. Answer `extend`, or set `ceiling <usd> [<hours>] wl-…`.
- **Lane died:** the line names the lane. `as2 lane log <wl>` tails the runner log.
- **Lane ended with work open:** `lane … ended (parked) with 2 open slice(s) and no question`. Tell Ilex to relaunch it (`relaunch wl-…`), close it, or what to do instead; the line is pushed once per ending, between wakes.
- **Held 4h:** a workload with no lane and no activity. Flip to `autonomous`, or run it by hand with `as2 lane <wl>`.
- **Blocked on a prompt:** answer it in that lane's session, or end the session.
- **Cannot close:** open slices, paused slices or open questions remain, or a lane still holds the lease (`as2 lane stop <wl>`).
- **"which one?":** the word fit several lines or, for a stakes, mode or `ceiling` word, several open workloads. Answer by number, or add the `wl-…` id it lists.
- **A word did nothing:** a bare stakes, mode or `ceiling` word with several open workloads gets "which one?" instead. It does nothing only when its `wl-…` id is not an open workload, or the `ceiling` figures do not parse. Check the id or the figures.
- **Stakes raised mid-run:** a review slice is not added automatically. Ask Ilex for one.

## Doc vs parser

- The q-id is inside the parentheses near the start of the question line, not at its end.
- `tiers/orchestrator.md` gives the ceiling word as `ceiling <usd> [<hours>]`; the parser also takes a `wl-…` id.
- `user driven` (two words) is not accepted at the surface; type `user-driven`.
- A comment in `surface/src/stakes.ts` lists "plan it" as user-driven; the code treats it as plan-first only and leaves mode alone.
- `tiers/orchestrator.md` says `withdraw` replans a slice; on the ceiling question it cancels instead.
- `green` / `red` and similar are options a lane chooses for its question, not fixed words in the parser.
- A stakes or mode word followed by a `q-…` id answers that question (`autonomous q-…`) in a single message and in a paste, and flips nothing; a bare `autonomous` still flips mode. Followed by an `en-…` id it is refused: a reserved action takes only `approve` or `deny`.
