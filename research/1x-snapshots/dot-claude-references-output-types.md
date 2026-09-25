# Output types: claim, cite, guess, action

Every statement an agent returns is one of four types, plus a fifth marker for everything
that is not an assertion at all. They have different verification procedures and different
failure costs, so they are labeled and handled separately. Flattened into one stream of
confident prose, none of them can be trusted, and the parent session has no way to tell what
was checked from what was assumed.

**This file is the canonical contract for agents defined under `/Users/jowolff/.claude/agents/`
and for any generic worker spawned from this machine.** Agent definitions point at it and add
only their own role-specific weighting; they do not restate the rules. If a rule needs to
change on this machine, it changes here and in `/Users/jowolff/.claude/CLAUDE.md` in the same
edit.

<!-- provenance -->

## Where this file came from, and how to tell when it has drifted

This is a **full copy**, not a pointer. Two reasons, both of which a pointer cannot satisfy:

1. **It disagrees with the plugin's copy on purpose.** `/Users/jowolff/.claude/CLAUDE.md` is
   authoritative on this machine, and it carries rules the team-facing plugin copy does not
   (proper nouns are not vocabulary; a check that cannot disconfirm is not a check; real local
   paths rather than a `<repo-root>` slot; zsh named as the shell). A pointer would send local
   agents to a document that contradicts the machine's own memory file in those places.
2. **Rule numbering has to match the incidents file.**
   `/Users/jowolff/.claude/references/output-types-incidents.md` anchors its sections as
   `## Rule 7` and `## Rule 8`, matching `CLAUDE.md`'s eight-rule numbering. The plugin copy
   numbers the same two rules 10 and 11. Pointing at the plugin copy would break every
   cross-reference in the incidents file.

**The failure mode of a copy is silent drift** — upstream changes a rule, this file keeps the
old one, and nothing announces it. That is the cost accepted here. It is made *detectable*
rather than eliminated: the upstream text is version-stable at the marketplace path below (no
version number in it, unlike the `plugins/cache/contextpress/newdle/<version>/` path, which
moved several times on 2026-08-20 alone), so one command says whether upstream has moved since
this file was authored.

```
shasum -a 256 /Users/jowolff/.claude/plugins/marketplaces/contextpress/plugins/newdle/references/output-types.md
```

At authoring time, 2026-08-20, that printed
`85cb3529aad6a76397ce16e24223d8749cab308f7fd8bafb78da37c275711dff`, from marketplace commit
`ca0b1be9ba3090eb3b4fa056821a24fb64008085`. A different hash means upstream moved and this
file is due a reconciliation pass — read the diff, fold in what is new, and keep
`/Users/jowolff/.claude/CLAUDE.md` winning wherever the two genuinely conflict.

## PMDW: nothing substantive is bare

`PMDW` is the marker for **conversational content** — anything that is not one of the four
assertion types. A question, an acknowledgement, framing or transition prose, a
recommendation offered as conversation, meta-commentary, an offer to proceed.

The point is diagnostic. When every substantive statement carries either a type label or a
`PMDW` marker, a bare uncategorized sentence becomes visible, and that is exactly where the
labeling discipline is starting to fray. A statement carrying neither is the defect this whole
scheme exists to expose. Decide which it is and mark it rather than letting it through.

## The receipt rule

**The type is determined by whether a receipt is attached, not by how confident the agent
feels.** Self-assessed confidence is unreliable. Receipt presence is not.

A statement with no receipt is a GUESS. This holds no matter how certain the sentence sounds,
how standard the pattern is, or how strongly training-data instinct agrees.

| Type       | What it is                                            | Required receipt                                                      | With no receipt |
| ---------- | ----------------------------------------------------- | --------------------------------------------------------------------- | --------------- |
| **CLAIM**  | A fact about this codebase or a running system        | An **absolute** `/path/to/file.ts:88`, or the exact command run plus its real output | It is a GUESS   |
| **CITE**   | A fact from an external source — **including the general semantics of any third-party system**: a database's return codes, an SQL operator's behaviour, a vendor default, a runtime's limits | The URL actually fetched this session plus the passage saying it, **or** a live test run this session | It is a GUESS   |
| **GUESS**  | Inference, pattern-match, recollection, "usually"     | None — but it must be marked, and carry a basis (see below)            | —               |
| **ACTION** | Something that changed state (file, branch, service)  | The exact command, its exit code, and how to reverse it                | Report anyway   |
| **PMDW**   | Not an assertion: framing, a question, an acknowledgement, an offer to proceed | None — it is a marker, not a claim | — |

What counts as a receipt maps to the primary-source ladder in the shipyard `AGENTS.md`
§ *Verify before assuming*: vendor docs freshly fetched, a live test actually run, the code
actually read, or a published changelog. Filenames, route paths, table and column names,
env-var names, prior-session memory, and training-data instinct are **not** receipts.

### A `file:line` receipt is written as an absolute path — derived, never composed

Rooted at `/`, resolved on the machine you are running on rather than copied out of an
example. So
`/Users/jowolff/code/shipyard/repos/newdle-api/src/server/routes/feeds.ts:41`, never the bare
`src/server/routes/feeds.ts:41`.

Never build a path out of a remembered layout. Take the root from whatever already knows it:

- **The tool that found the file.** Read, Grep, and Glob return real paths. Report what they
  gave you rather than reconstructing anything.
- **`git rev-parse --show-toplevel`** for a repo root. It prints an absolute path from
  anywhere inside the repo, with symlinks resolved.
- **The shipyard-root walk-up** in the plugin's `references/project-linear-sync.md` when you
  need the workspace root rather than a repo root. It searches for markers instead of assuming
  a location, for exactly this reason.

This is a receipt requirement, not a formatting preference, and it follows from what a receipt
is for: the point of the reference is that the reader can open it and check. A relative path
resolves against a working directory the reader does not have — a subagent's cwd is not the
parent's, the parent's is not the terminal's, and by the time a report reaches a chat window
there is no cwd at all. A path that cannot be opened has not been verified by anyone but the
agent that wrote it, which is the state the label exists to rule out.

It also fails the reference rules in `/Users/jowolff/.claude/CLAUDE.md` § *References must
survive without scrolling*: a bare `feeds.ts:41` is an identifier, and identifiers only work
for someone already holding the thing they point at.

This governs the **receipt**, not the prose. Write sentences however reads best, and a commit
message or a diff hunk keeps the repo-relative form the tool itself emits. Two paths are
exempt because they are already unambiguous: a path inside a fenced command being run in a
stated directory, and a path quoted verbatim out of tool output (a stack trace, a
`git status`, a linter). Quoting a tool's own relative path is reporting what it printed;
inventing one is not.

### Writing a citation INTO a document is the opposite job

Everything above governs a **receipt in a report** — prose a human reads and clicks now, on
the machine that just produced it. When you instead write a reference **into a file that gets
committed and re-read later** — a decision-log entry, a `.projects/` doc, an `AGENTS.md`, a
README, a Linear issue body — a line number is the wrong instrument. The two jobs are easy to
confuse because both concern `file:line`.

**Cite a stable anchor.** An HTML comment marker (`<!-- ENG-1586 -->`), a heading
(`## Cut ladder, fixed in advance`), or a distinctive quoted string from the target. A line
number may ride along as convenience, but never as the only way to find the thing. Derive an
absolute path at report time; never freeze a line number at author time.

A stale `file:line` does not announce itself — it still resolves to *a* line, so it reads as a
working reference while pointing at the wrong content. Measured 2026-08-13 in
`/Users/jowolff/code/shipyard/.projects/plugin-restructure/`: one document carried six
sibling-file line citations, all correct when written and all wrong afterward, off by up to 39
lines; they were re-derived, and a single one-line edit to the target broke all six again in
the same session. Every edit above a citation invalidates it silently and nobody is told when
the maintenance comes due.

**Self-check before committing any document that points at another file:** would this citation
still find its target if fifty lines were inserted above it?

## Rules

**Rules 1 through 8 are numbered to match `/Users/jowolff/.claude/CLAUDE.md` and the section
anchors in `/Users/jowolff/.claude/references/output-types-incidents.md`.** The plugin's
team-facing copy numbers the same rules differently — its rules 10 and 11 are rules 7 and 8
here. When citing a rule across the two documents, cite its title, never its number.

1. **No receipt, no claim.** Downgrade to GUESS and mark it. "I could not verify X" is a
   successful report, not a failure.
2. **Guesses are not promoted by restatement.** A GUESS stays a GUESS across the subagent →
   parent boundary, through summarization, and into later turns. The label and its basis
   travel with the statement.
3. **Actions are reported even when they failed or were skipped.** A command that errored, a
   test not run, a step left out — each is an ACTION result and each appears in the report.
4. **Blockers and open questions ride the GUESS channel and surface to the top**, never buried
   at the end of a report. If a decision was made without a receipt, name it where the reader
   will see it.
5. **Third-party semantics are not vocabulary.** Any statement about how an external system
   behaves — a database return code, an SQL operator's semantics, a vendor default, a runtime
   limit, a framework convention — is a CITE-or-test statement. Without a URL fetched or a
   command run this session it is a GUESS, however elementary it feels.
   *"Everyone knows `-2` means the key is missing"* is the exact shape of this failure: it
   reads as vocabulary rather than as an assertion, so it slips past the self-check unlabeled
   and lands in a plan document as fact.
   - **Proper nouns are not vocabulary either.** A name, product, project, show, or reference
     dropped into a sentence is an assertion about what that thing *is*, and an unfamiliar one
     is a GUESS until the person who said it clarifies. Resolve it by asking, not by searching
     for it — the search assumes the category you already guessed. Treating "who is this?" as
     a lookup instead of a question is how an agent ends up drafting a memo for a cable
     call-in show.
6. **Cheap to check beats correctly labeled.** Before marking something GUESS, ask whether a
   tool already in hand would settle it in under a minute — one query, one curl, one grep, one
   targeted read. If yes, run it. A GUESS you could have cheaply resolved is a process
   failure, not a successful report. This inverts rule 1 for cheap checks only; labeling
   remains right for anything expensive, blocked, or needing access you do not have.
   - **A check that cannot disconfirm is not a check.** Before running one, state what a null
     result would rule out. If the answer is "nothing," the tool is the wrong instrument and
     the question belongs to the person who asked. A null result from the wrong instrument is
     worse than no check at all, because it reads as evidence and gets reported as a finding —
     an empty user search proves someone is not in the workspace, never that they are not a
     person.
   - **Bound:** this applies only to statements **another decision depends on** — something
     going into a plan, a recommendation, a diff, or an answer that will be acted on. Passing
     remarks and background colour stay GUESS-and-move-on. The test is "would being wrong here
     change what happens next?" A verification tax on every incidental sentence is its own
     failure mode.
7. **A receipt licenses only what it literally shows.** Where a sentence reaches past its
   receipt, the reaching part is a GUESS and gets marked as one **even though a real receipt
   sits right next to it**. That proximity is what makes this invisible: rule 1 checks whether
   a receipt is *present*, never whether it *covers the claim*, and rule 2 catches a statement
   with no receipt at all. A statement with a true receipt and an oversized conclusion passes
   both.
   - **The common shape is a category jump: a code receipt proves what code does, never
     whether that is desirable.** *"These lines guard against null"* is a CLAIM and its
     `file:line` earns it. *"Therefore nothing breaks"* is a GUESS about product intent
     wearing the first one's receipt.
   - The companion bar on the reviewing side — what it takes to *clear* a concern rather than
     raise one — is in the plugin's `skills/gaslight/SKILL.md` § *The matching rule for
     clearing a concern*.
   - Measured 2026-08-13. True receipts, wrong conclusion, a passing test encoding the error,
     four reviews clearing it, a feature silently lost. The incident is in
     `/Users/jowolff/.claude/references/output-types-incidents.md` § *Rule 7*.
8. **A figure reused in a new context is a new claim.** Not new information — new *context*: a
   different audience, a different comparison, a different decision hanging off it. The number
   is the same and the sentence is not, and it is the sentence that needs the receipt.
   **Rules 1 and 6 fire when you notice you are asserting; this one exists because the failure
   feels like recall.** Restating a measurement taken an hour ago reads as summary, so no
   check gets considered, and the check was never about the number — it was about whether the
   number answers *this* question.
   - **Mechanical form, so it does not depend on noticing:** about to state a figure you did
     not produce with a tool call **in this turn**? Either say where it came from, or
     re-derive it.
   - **For a subagent this fires on everything inherited, because the delegation prompt *is* a
     context change.** A figure arriving in your prompt carries no provenance you can inspect
     and no way to re-derive it. Restating it as a finding launders a parent's number into an
     apparent measurement of your own. Say `the brief's figure, not mine` and label it GUESS
     unless you reproduced it this session.
   - Measured 2026-08-13. Three incidents and the positive example are in
     `/Users/jowolff/.claude/references/output-types-incidents.md` § *Rule 8*.
9. **Labeling is not a gate on doing the work.** Mark what you could not verify and keep
   moving. Do not stop to hunt for a receipt that does not exist, and do not spam GUESS on
   every design decision until the report is unreadable. Stop only when the ambiguity meets
   the bar in the shipyard `AGENTS.md` § *Ask clarifying questions*; this file does not raise
   or lower that bar, and an unreceipted design choice on its own does not meet it. New code
   is receiptable too, just as a different type: the file, the line, and the test you ran are
   its ACTION receipt. Design choices made while writing it are GUESSes, and marking a handful
   of them is correct and cheap.
10. **Receipts stay terse.** `/Users/jowolff/code/shipyard/repos/newdle-api/src/server/routes/citations.ts:88`
    — not a pasted code block. `npm test → exit 1, 3 failing` — not the full log. The receipt
    proves the check happened; it is not the evidence dump. Terse means no surrounding
    evidence dump, not a shortened path: an absolute path is long and still terse, because
    every character of it is doing the work of making the reference openable.
11. **Mind-reading is not conversation.** An inference about what a person meant, wanted, or
    intended is a GUESS. PMDW covers framing, questions, and offers to proceed; it does not
    cover attributing a motive, a feeling, or an unstated intent to the engineering user, a
    teammate, or an end user. *"I think what you're getting at is X"* is the exact shape of
    this failure — it reads as conversational prose and slips through the self-check, when it
    is an unreceipted assertion about another mind and carries the same failure cost as any
    other GUESS. Label it and say what you have evidence for. Hedging inside a PMDW block
    ("my read", "probably", "it seems like") is not a substitute for the label.

## Guess basis: graded confidence

A flat GUESS label puts a near-certainty and a wild swing in the same bucket. That is itself a
form of ambiguity, and ambiguity erodes trust faster than visible uncertainty does. So every
GUESS carries a basis in parentheses, naming where the belief came from:

| Basis                | Means                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `GUESS(inference)`   | Derived from something actually read or run this session — just not the exact thing asserted    |
| `GUESS(pattern)`     | Recognized as a convention of this codebase or framework, not verified at this site             |
| `GUESS(recall)`      | Training-data memory or prior-session recollection; nothing in-session supports it              |

> GUESS(inference): the caller probably handles the null, since
> `/Users/jowolff/code/shipyard/repos/newdle-api/src/server/index.ts:40` wraps it in a try —
> did not read the handler.
> GUESS(pattern): this repo puts DAOs under `src/db/`, so the query likely lives there.
> GUESS(recall): the SDK used to require an explicit `region` — not checked against current docs.

Two rules follow from the grading:

- **A `recall` guess may never be load-bearing.** If a diff, a plan step, an acceptance
  criterion, or a recommended fix depends on one, it is a blocker and goes at the top of the
  report — not into the body as an assumption the next agent silently inherits. Either
  escalate it or resolve it under rule 6.
- **The basis is not a confidence score.** `inference` is not "80% sure." It says what kind of
  evidence exists, which is checkable; how sure the agent feels is not.

## Marking

### How a label is rendered

A block-leading label sits alone on its own line, in markdown bold — `**CLAIM**`, `**CITE**`,
`**GUESS**`, `**ACTION**`, `**PMDW**` — with the statement starting on the next line. This is
the single canonical form; there is no inline-caps alternative.

> **CLAIM**
> citation records are written in
> `/Users/jowolff/code/shipyard/repos/newdle-api/src/server/routes/citations.ts:88` via
> `saveCitation`.
>
> **GUESS(pattern)**
> the client probably calls this through `ApiClient.post` — did not verify the call site.
>
> **ACTION**
> ran `npm run lint` → exit 0.

A label that genuinely belongs mid-sentence or inside a bullet, rather than heading a block,
stays inline and bold, without the line break. The own-line rule governs block-leading labels,
which is the common case.

Never emit ANSI escape sequences (`ESC[1;36m`, `\x1b[...`, or any SGR code) to color a label.
The renderer does not interpret them — they show up as literal `[1;34mPMDW[0m` garbage on the
line where the label should be. This was tried and it failed. Markdown bold is the only
styling that survives.

Mark at the point of the statement, not in a batch at the end. Grouping every guess into one
trailing "Uncertainties" heading defeats the purpose; the label belongs next to the statement,
where a reader acting on that sentence will see it.

### Tables of assertions

Block labels cannot fit table syntax, which is exactly why table rows ship bare today. A table
whose rows are assertions gets a leading `Type` column — one label per row — and a `Receipt`
column where a receipt applies:

| Type | Statement | Receipt |
|---|---|---|
| CLAIM | `POST /v1/feeds` rejects unauthenticated requests | `curl ... :9201/v1/feeds → 401` |
| GUESS(pattern) | `/v1/feeds/legacy` probably skips the auth check | none — route file not read this session |

A single label scoping the whole table is acceptable only when every row is the same type —
real findings tables are usually mixed. Pure-layout tables — a glossary, a port listing, a
file inventory — are structure, not assertions, and are exempt from the Type column; a rule
that appears to demand labeling structure gets ignored wholesale. If in doubt, it is an
assertion table.

### Headers, bottom lines, and recommendations

Markdown headers are navigation, not assertions, and carry no label — labeling a header would
mangle the document for no gain. But the **first line under every header is a statement like
any other and must be labeled.** If a header's text itself asserts something ("Three endpoints
are blockers"), the assertion is restated as a labeled line directly beneath it; the header
alone is never the record.

The summary or bottom-line sentence is the single most commonly bare statement in practice,
and the one the reader is most likely to act on directly — it gets a label like everything
else, never a free pass for coming last. The same applies to recommendation and "what to do"
sections: a recommendation is almost always a GUESS (a proposal, not a verified fact) or PMDW
(an offer to proceed), and naming it as such is the point, not a hedge.

### Report skeleton

A structured report follows this section order, each section leading with a label:

1. **Blockers and open questions** — first, not last. Anything a decision depends on that
   could not be verified.
2. **Findings** — the CLAIM/CITE/GUESS/ACTION statements, tables included.
3. **Coverage** — what was actually checked and what was not, as ACTION.
4. **Bottom line** — the one decision-relevant sentence, labeled.

Adapt section names to the task; the ordering — blockers first, bottom line last but never
unlabeled — is what matters, not the exact headings.

This composes with the message skeleton in `/Users/jowolff/.claude/CLAUDE.md` § *How to
communicate with Jo* rather than competing with it. A blocker is something that must be
**known** immediately and goes up top; the single closing ask is something that must be
**chosen** and goes last. Different objects, different places, both rules intact.

### Worked example

A fictional auth check on three endpoints, chosen to demonstrate the four cases that drift
most often: a findings table, a section header, a bottom-line sentence, and a recommendation.

> ## Blockers and open questions
>
> **GUESS(recall)**
> I believe the mobile clients still call `/v1/feeds/legacy`; nothing in this session confirms
> it. The recommendation to delete the route depends on this — treat it as a blocker, not an
> assumption.
>
> ## Findings
>
> | Type | Statement | Receipt |
> |---|---|---|
> | CLAIM | `POST /v1/feeds` rejects unauthenticated requests | `curl ... :9201/v1/feeds → 401` |
> | CLAIM | `GET /v1/feeds/:id` checks the JWT in a preHandler | `/Users/jowolff/code/shipyard/repos/newdle-api/src/server/routes/feeds.ts:41` |
> | GUESS(pattern) | `/v1/feeds/legacy` probably skips the preHandler | none — route file not read this session |
>
> ### The legacy route
>
> **CLAIM**
> `/Users/jowolff/code/shipyard/repos/newdle-api/src/server/routes/feeds.ts:107` registers
> `/v1/feeds/legacy` with no `preHandler` option, unlike the two routes above it.
>
> ## Recommendations
>
> **GUESS(inference)**
> Add the same preHandler to the legacy route rather than deleting it, until the mobile
> question above is answered. Based on the pattern at
> `/Users/jowolff/code/shipyard/repos/newdle-api/src/server/routes/feeds.ts:41`; not a
> verified requirement.
>
> ## Bottom line
>
> **CLAIM**
> One of the three endpoints (`/v1/feeds/legacy`) is missing auth —
> `/Users/jowolff/code/shipyard/repos/newdle-api/src/server/routes/feeds.ts:107`, confirmed by
> a 200 from an unauthenticated curl.
>
> ```
> <!-- output-types
> tier: 2
> CLAIM: 4
> CITE: 0
> GUESS: 2 (inference 1, pattern 1)
> ACTION: 0
> PMDW: 0
> -->
> ```

<!-- the-envelope -->

## The envelope

Every structured report ends with a machine-readable summary block as its **last line**:

```
<!-- output-types
tier: 0
CLAIM: 12
CITE: 2
GUESS: 5 (inference 3, pattern 1, recall 1)
ACTION: 8
PMDW: 3
-->
```

- Emit it even when counts are zero.
- `tier` is the degradation tier from the next section.
- The GUESS breakdown must sum to the GUESS total.
- Counts are self-reported and are **not** evidence of honesty. The block is a forcing
  function — it is hard to write `GUESS: 0` on a plan without noticing — and it gives tooling
  something to parse. Nothing downstream should treat the numbers as verified.

Agents on the low-cost tier are exempt: their output is short, single-type, and the envelope
would cost more than it returns.

**The main session's replies to the engineering user are exempt too.** The envelope is an
agent-to-agent artifact; its one real consumer is the parent-side rule below that says a parent
carries a subagent's tier forward. A reply in chat has no parent, so the block is read by
nobody and lands as clutter in the middle of a conversation. Labels still apply in full, and a
Tier 1 or Tier 2 finding inherited from a subagent is still passed on, in plain prose rather
than as a count block.

## Degradation

An agent that cannot meet the full contract does not get to quietly emit something that reads
as if it did. It degrades to a named tier and says which one, in the envelope and in prose at
the top of the report.

**Tier 0 — full.** Every statement typed, receipts attached, guesses graded. The normal case.

**Tier 1 — degraded verification.** Structure is intact but receipts were unobtainable: no
network, a blocked tool, a permission denial, a service that was down. The report is
GUESS-heavy *and states why at the top*, naming what would have been checked and what
prevented it. This is a legitimate, useful result, not a failure.

**Tier 2 — degraded coverage.** Only part of the ask was reachable — a file too large for the
read budget, a repo without access, a check that timed out. The report states exactly what was
covered and what was never opened, and must not let the covered portion imply completeness. A
clean report that silently skipped half the checks is worse than a partial one that says so.

**Tier 3 — structural failure.** The contract cannot be met at all. The agent returns what it
attempted and how it failed, and nothing else. **It does not return smoothed prose.** A
plausible-sounding unlabeled report is more expensive than an error, because the parent is
instructed to treat subagent output as authoritative and will act on it.

The tiers degrade *fidelity*, never *honesty*. Tier 1 and Tier 2 are still fully labeled; what
shrinks is how much is CLAIM and how much ground is covered. There is no tier in which
dropping the labels to make a report read better is the correct move.

### Parent-side handling

The parent session owns the other half of this contract:

- A report arriving with **zero labels** is treated as **Tier 3**, no matter how well it
  reads. Do not act on it. Re-delegate with the contract restated, or verify the claims
  directly.
- A **Tier 1 or Tier 2** report is usable — but the parent carries its tier forward. Do not
  present a Tier 2 finding to the engineering user as though the whole surface was audited.
- **Guesses inherited from a subagent stay guesses, with their basis intact.** Summarizing,
  synthesizing, or restating in the parent's own voice does not upgrade them. This is rule 2
  at the boundary where it matters most.
- **Subagent output is the source of truth for its CLAIMs, not its GUESSes.** A statement
  carrying a receipt is authoritative and gets acted on without re-reading the file. A
  statement without one stays a GUESS in the parent's own output and must be verified before
  anything depends on it. A subagent report with no receipts anywhere is a hypothesis, not a
  source of truth.

## Commands handed over for the engineering user to run

**This is the machine-local copy.** The team-facing canonical text is the section of the same
name in the plugin's `references/output-types.md`; when a rule changes in one, change it in
the other in the same edit. One deliberate difference: the plugin copy is shell-neutral
because it ships to teammates who may not run zsh, while this copy names zsh because that is
the shell on this machine.

**Rule zero: hand over only what you cannot run yourself.** Another machine, credentials you
do not hold, an operation the engineering user has to gate, or something a permission boundary
genuinely blocks. Everything else you run yourself and report as an ordinary ACTION. This gate
comes first because without it the rules below make things worse: an elaborate protocol for
handing commands over quietly pulls work *into* someone else's terminal that belonged in
yours, and the best handed-over command is the one that was never handed over.

When you do hand something over it is a **proposed ACTION**, carrying ACTION's full receipt
burden including the reversal path, and it has to survive being read in isolation, hours
later, with no memory of the turns above it.

Never make the engineering user assemble a command out of scrollback. Assume zero carryover
between turns, and assume it about shell state too. The abstract version of this principle
does not fire on code blocks: every other rule about not-making-them-scroll scans for things
that *look* like references — ticket IDs, codenames, coined shorthand, plural
back-references — and a fenced command block passes that scan clean while doing exactly the
same damage.

1. **Every correction reissues the whole thing, runnable from cold.** When a command needs a
   fix, do not send the changed line, the changed block, or "same as before but with X." Send
   the complete sequence again from the first step with the fix folded in. It will feel
   redundant. It is cheaper than making someone diff two versions across four turns of
   scrollback.
2. **More than one command, or any interactive input, means a script file.** Write it to the
   repo's gitignored `.tmp/` directory — the established home for agent working files in this
   workspace. Prefer it over the session scratchpad for anything whose undo path lives inside
   the script, because the scratchpad gets cleaned up and a `--restore` mode nobody can run
   any more is not a reversal path. Outside a repo, use the scratchpad and give the undo as
   standalone commands in chat instead. The thing they type is one unchanging line —
   `zsh /path/to/script.sh` — and it stays byte-identical for the life of the task.
   Corrections edit the file; they re-run the same line. This is what moves the state out of
   scrollback and into the environment.
3. **Every script is safe to run from the top, every time.** No step assumes a variable set by
   a previous run, and no step is "skip this if you already did it." Re-running from scratch
   is always correct, so there is never a question of which lines already ran. Interactive
   prompts live inside the script.
4. **Prose never sits between pasteable blocks.** Explanation goes above the block or below
   the whole sequence, never in the middle where a paste can swallow it and produce a
   `command not found` on your own sentence.
5. **Test the syntax before handing it over.** The shell here is zsh, not bash. `read -p` is a
   bash-ism that fails in zsh with `read: -p: no coprocess`. The default visible prompt is
   `printf 'Type MOVE to proceed: '` followed by `read -r REPLY`, which works in both shells
   and prints the prompt unconditionally. `read -rs "VAR?prompt: "` is the zsh form that
   *hides* what is typed — correct for a password, wrong for a confirmation, where seeing no
   echo reads as a hang. Handing over untested shell syntax is a receipt failure under rule 6
   above, not a style lapse.
6. **Scripts announce each step, stop on the first failure, and log themselves.** Announce
   before acting so a failure is locatable from the output alone; check the exit status of
   every step that can fail and stop there rather than continuing into a confident "done"; and
   tee the whole run to a fixed log path next to the script (`exec > >(tee "$LOG") 2>&1` works
   in zsh). Then the failure message is one sentence: *"this broke — tell the agent, the log
   is already at `<path>`."* The agent reads the log with its own tools. **Never ask the
   engineering user to diagnose, narrow it down, comment something out, or "try just this
   part."** Making them select the right span of terminal output and paste it back is
   assembling content out of scrollback — the exact thing rule 1 forbids, reintroduced on the
   return path, arriving at the moment they are most loaded. It gets through the self-check
   because it feels like helpful triage rather than a regression.
7. **Destructive steps preview, confirm, and print their undo.** Anything that deletes, moves,
   overwrites, or writes to a shared system first prints exactly what it will touch, then
   blocks on a typed confirmation inside the script, then prints the command that reverses it.
   Prefer a reversible staging step (move to quarantine) over the irreversible one (delete),
   and let the irreversible step be a separate later decision. A handed-over script is a
   proposed ACTION; this is ACTION's reversal receipt, operationalized.

This applies to any surface where the engineering user is the one executing — terminal
commands, SQL to paste into a console, curl invocations, one-off scripts. It does not apply to
commands an agent runs itself; those are ordinary ACTIONs and report under rule 3.

## Scope

Two exemptions:

- **This governs the agent's own assertions, not the engineering user's.** An observation they
  report is a starting constraint under the shipyard `AGENTS.md` § *Trust the reporter*, not
  an unreceipted GUESS to be downgraded. Never label or discount what they tell you;
  investigate it.
- **Conversational content is marked, not exempt.** Ordinary back-and-forth carries `PMDW`
  rather than a type label. But a load-bearing statement inside a chat reply still gets its
  type label, and when a chat reply *is* the deliverable — an investigation result, a
  recommendation expected to be acted on — it is a report and the full contract applies,
  envelope caveat above notwithstanding.

## Per-agent weighting

Agents are not evenly distributed across the types. Match the weight to the role:

- `scout`, `reader`, `checker` — nearly all CLAIM plus receipt. A scout that cannot find
  something reports the empty result; it does not reason about where the thing probably is.
- `research`, `beefy-research` — CITE-heavy. Already required to cite; the addition is that
  unfetchable sources become explicit GUESSes rather than quiet omissions.
- `builder`, `beefy-builder`, `debugger` — ACTION-heavy. Every command run, every test result,
  every file written, plus reversal path.
- `planner`, `storyteller` — legitimately mostly GUESS, and should say so. A plan is a
  proposal, not a set of verified facts. Marking it honestly is the point, not a defect.
- `auditor`, `transcript-auditor` — every finding is a CLAIM and needs a receipt, or it is a
  GUESS and gets ranked below the findings that have one. A discrepancy asserted without both
  sides quoted is the auditor's own unreceipted claim.

## Propagating this contract

Subagents do not see this file unless told to read it.

- **Agents defined under `/Users/jowolff/.claude/agents/`** point at
  `/Users/jowolff/.claude/references/output-types.md` in their own definition — this file.
- **Plugin agents under `newdle@contextpress`** load the plugin's copy themselves via
  `${CLAUDE_PLUGIN_ROOT}/references/output-types.md`. Do not append the contract to them; it
  wastes context.
- **A generic `Agent`/`Task` spawn, a `claude --bg` worker, or a headless `-p` call** sees
  neither unless the delegation prompt carries the contract. Append the verbatim labeling
  block from
  `/Users/jowolff/.claude/orchestrator/state/BRIEF-BOILERPLATE.md` — append it, never retype
  it, because a contract reconstructed from memory drifts and the drift is invisible while the
  result still looks like a report.

Append on the first dispatch **and on every followup message**. A worker does not retain the
contract across turns in its own thread, and a followup that omits it is where labeling
quietly stops.
