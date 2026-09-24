# Output-types framework: 1.x inventory × 2.0 coverage

Audit of whether every piece of the 1.x output-types framework has a home in the 2.0
requirements/spec. Written 2026-09-23 by a research hand for Plumb. Read-only audit; nothing
outside this file was written.

Jo's standing instruction this audit is measured against:

**CITE**
`/Users/jowolff/code/agent-system-2.0/JO-INPUT.md:20` — *"The output-types - all agents must obey
these when communicating, hooks can enforce them (and do currently)"*. First-party local artifact,
quoted verbatim.

---

## 1. Gaps first — pieces of the framework with no 2.0 home

Graded: **on fire** (a ruled 2.0 decision already forecloses it, or Jo's stated requirement is
unrepresented) / **worth knowing** (no home, but nothing blocks giving it one) / **noise**
(1.x-specific machinery that dissolves with the seat tier).

**CLAIM**
No requirement in `REQUIREMENTS.md` states that 2.0 agents label their output. A grep for
`output.?types|output_types|envelope|PMDW` across the six 2.0 documents returned matches in
`INVENTORY.md`, `REVIEW.md`, `PREFERENCES.md`, `briefs/phase5.md`, `JO-INPUT.md` — and **zero** in
`/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md`. The only requirement naming the framework is
`/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:52` (P-18), which names
`output-types reference` as an artifact whose *disposition* is decided in Phase 5 — not as a thing
that must survive.

| # | Gap | Grade |
|---|---|---|
| G1 | **The obligation itself.** Nothing in `REQUIREMENTS.md` or `SPEC-2.0.md` requires a 2.0 hand or lane to label its statements; the framework enters Phase 5 only as a C4 disposition row whose default is *drop unless argued for* (`/Users/jowolff/code/agent-system-2.0/briefs/phase5.md:191`), inverting the burden on something Jo already stated as a must (`JO-INPUT.md:20`). | **on fire** |
| G2 | **Propagation into a hand's brief.** The slice brief is ruled closed at six fields with extra fields explicitly rejected (`/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md:436-447`); none of the six carries a reporting contract, so the 1.x propagation rule (`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/references/output-types.md:560-566`) has nowhere to land without reopening a ruled decision. | **on fire** |
| G3 | **Parent-side handling.** 1.x says a zero-label report is Tier 3 and must not be acted on (`…/references/output-types.md:414-425`); `REQUIREMENTS.md:39` (P-8a) says hand reports are trusted as-is and Jo does not require machinery to check them. These are in direct tension and the tension is unrecorded anywhere in `SPEC-2.0.md`. | **on fire** |
| G4 | **The envelope and its consumer.** `REQUIREMENTS.md:40` (P-8b) makes a lane's report to the orchestrator informational and closes slices on machinery-written state instead; the envelope's stated purpose is for a *parent to carry a subagent's tier forward* (`…/references/output-types.md:347-384`). The hand→lane hop still exists and still needs a coverage signal, but no 2.0 text says so. | **worth knowing** |
| G5 | **Degradation tiers 0–3.** No 2.0 analogue. P-4's inspectable evidence artifact (`REQUIREMENTS.md:31`) covers whether a *step* passed, never whether a *report* covered its ask. | **worth knowing** |
| G6 | **The two levels (`receipts` / `labels`) and the `--level` dial.** A per-person floor-plus-dial with no off position (`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/hooks/lib/hook-scope.mjs:399-412`, CLI at `:752-767`). No 2.0 requirement mentions a settable output level, and P-16's self-improvement loop (`REQUIREMENTS.md:50`) is about proposing rules, not dialing them. | **worth knowing** |
| G7 | **Session-start injection as a delivery mechanism.** The contract reaches every 1.x session through a SessionStart hook (`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/hooks/output-types-inject.mjs:165-181`). 2.0's only per-turn injection requirement is P-17 wake, which B7 ruled is *the ledger rendered*, not rules (`SPEC-2.0.md:392-404`). Nothing in 2.0 delivers standing rules into a lane at open. | **worth knowing** |
| G8 | **Enforcement class for a stop-event check.** P-11 (`REQUIREMENTS.md:45`) classes a rule mechanical *"whenever the forbidden action is a single tool call"*. The output-types guard grades an outgoing message on `Stop`/`SubagentStop`, which is not a tool call — so under P-11 as written it falls to "written", i.e. prose, which is exactly the 1.x state Jo says hooks already fix. | **on fire** |
| G9 | **The absolute-path receipt rule** (`…/references/output-types.md:44-78`) and **the citation-into-a-document anchor rule** (`:80-88`). No 2.0 home; the second one bears directly on P-13 provenance and the ledger's own rows. | **worth knowing** |
| G10 | **GUESS basis grading** (`inference`/`pattern`/`recall`, `…/references/output-types.md:169-192`), including the rule that a `recall` guess may never be load-bearing. No 2.0 home. | **worth knowing** |
| G11 | **Rendering rules** — label alone on its own line, markdown bold, no ANSI (`…/references/output-types.md:196-236`) — plus the assertion-table `Type` column (`:238-253`), header/bottom-line rule (`:255-268`), and report skeleton (`:270-282`). No 2.0 home. | **worth knowing** |
| G12 | **The eleven rules** (`…/references/output-types.md:90-167`), including rule 10 (a receipt licenses only what it shows) and rule 11 (a reused figure is a new claim), each backed by a measured incident file. No 2.0 home; C4 is a disposition row for the *file*, not for its eleven rules. | **worth knowing** |
| G13 | **Per-agent weighting and the low-cost exemption** (`…/references/output-types.md:536-558`; guard's `EXEMPT_AGENTS` at `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/hooks/output-types-guard.mjs:170`). Tied to 1.x agent-type names; under P-5/A1 the tier comes from a classifier, so the mapping has to be re-derived, not re-homed. | **worth knowing** |
| G14 | **The § "Commands handed over" block**, which the reference declares canonical over Jo's `CLAUDE.md` copy (`…/references/output-types.md:427-433`). It lives inside the output-types file but is a communication rule; it would be split between C2 and C4 with nothing saying so. | **worth knowing** |
| G15 | **Guard-internal calibration** — the 200-char `Stop` floor, `SubagentStop`-only envelope checks, nudge dedupe and `MAX_NUDGES` (`…/hooks/output-types-guard.mjs:209,:238-251,:436,:519`). Implementation detail of a Claude-Code hook surface; P-19 requires an OMP-native rebuild anyway. | **noise** |
| G16 | **The four divergent copies of the contract** (`/Users/jowolff/code/agent-system-2.0/INVENTORY.md:116-120`). P-15/P-18 re-homing dissolves this by construction; it needs no separate 2.0 home, only a note that the 2.0 copy is singular. | **noise** |

**QUESTION**
Does the output-types framework get its own requirement (P-23), or does it stay a Session C row?
Standalone P-23 makes surviving the default and makes G1/G2/G3 visible before Session C opens;
staying as a C4 row keeps `REQUIREMENTS.md` closed but leaves a thing Jo called a must sitting
under *drop unless argued for*. Recommendation in § 3; this audit proceeded as if the answer were
P-23, because that is the reading `JO-INPUT.md:20` supports.

---

## 2. Inventory — the 1.x framework, piece by piece

**CLAIM**
Every 1.x receipt below was read or grepped this session. The "2.0 home" column reads `none` where
no `REQUIREMENTS.md` P-item, no `SPEC-2.0.md` section, and no `briefs/phase5.md` row covers the
piece beyond the generic C4 artifact-disposition slot.

| Type | Piece | 1.x location | Enforced by | 2.0 home |
|---|---|---|---|---|
| CLAIM | Six-label vocabulary (CLAIM/CITE/GUESS/ACTION/PMDW/QUESTION) | `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/references/output-types.md:20-42` | hook (`output-types-guard.mjs` label check) + injected prose | none — C4 row only (`briefs/phase5.md:201`) |
| CLAIM | The receipt rule (type set by receipt, not confidence) | `…/references/output-types.md:13-18` | prose (injected); guard checks label presence, never receipt presence (`…/hooks/output-types-guard.mjs:150-158`) | none |
| CLAIM | Absolute-path `file:line` receipts, derived not composed | `…/references/output-types.md:44-78` | prose | none |
| CLAIM | Citation-into-a-document = stable anchor, not a line number | `…/references/output-types.md:80-88` | prose | none (bears on P-13, `REQUIREMENTS.md:47`) |
| CLAIM | The eleven rules (no-receipt-no-claim … figure-in-new-context) | `…/references/output-types.md:90-167` | prose | none |
| CLAIM | Graded GUESS bases (`inference`/`pattern`/`recall`) + "recall may never be load-bearing" | `…/references/output-types.md:169-192` | envelope-consistency check only: breakdown must sum (`…/hooks/output-types-guard.mjs:558-574`) | none |
| CLAIM | Rendering: label alone on own line, markdown bold, never ANSI | `…/references/output-types.md:196-236` | hook — opener check (`…/hooks/output-types-guard.mjs:438-506`) | none |
| CLAIM | Message must *open* with a label | `…/references/output-types.md:200-214` | hook — the one positional check, both stop events | none |
| CLAIM | Assertion tables get a `Type` column | `…/references/output-types.md:238-253` | prose | none |
| CLAIM | Headers carry no label; first line under a header and the bottom line do | `…/references/output-types.md:255-268` | prose | none |
| CLAIM | Report skeleton — blockers/questions first, bottom line last and labeled | `…/references/output-types.md:270-282` | prose | none |
| CLAIM | The envelope (`<!-- output-types … -->` as final line, counts, tier) | `…/references/output-types.md:347-384` | hook — envelope presence + internal consistency, `SubagentStop` only (`…/hooks/output-types-guard.mjs:519-583`) | none; P-8b (`REQUIREMENTS.md:40`) demotes the report the envelope summarizes |
| CLAIM | Envelope exemptions: low-cost agents; main-session chat replies | `…/references/output-types.md:379-384` | hook (`…/hooks/output-types-guard.mjs:170,:519`) | none |
| CLAIM | Degradation tiers 0–3 | `…/references/output-types.md:386-412` | hook — `tier:` line required in envelope (`…/hooks/output-types-guard.mjs:554-556`) | none; P-4 (`REQUIREMENTS.md:31`) gates steps, not report coverage |
| CLAIM | Parent-side handling: zero labels = Tier 3, do not act; inherited guesses stay guesses | `…/references/output-types.md:414-425` | hook nudge on both events (`…/hooks/output-types-guard.mjs:458-478`) | **conflicts** with P-8a (`REQUIREMENTS.md:39`) |
| CLAIM | § Commands handed over (declared canonical over Jo's `CLAUDE.md`) | `…/references/output-types.md:427-433` | prose | none (would split C2/C4) |
| CLAIM | Scope: governs the agent's assertions, not Jo's; conversational content marked not exempt | `…/references/output-types.md:522-534` | prose | none |
| CLAIM | Per-agent weighting (scout CLAIM-heavy, planner GUESS-heavy, etc.) | `…/references/output-types.md:536-558` | agent definitions | P-18 artifact disposition (`REQUIREMENTS.md:52`) for the definitions; the weighting itself none |
| CLAIM | Propagation: every delegation prompt points at the reference or restates it | `…/references/output-types.md:560-566` | agent definitions, e.g. `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/agents/reader.md:48`, `…/agents/builder.md:36`, `…/agents/auditor.md:42` (11 of 14 definitions point at the file; `scout.md:19`, `changelog.md:16`, `checker.md:16`, `summarizer.md:15` inline it instead) | none — B9's six-field brief has no contract field (`SPEC-2.0.md:436-447`) |
| CLAIM | SessionStart injection of the contract | `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/hooks/output-types-inject.mjs:57-91` (receipts text), `:92-142` (labels text), emitted at `:165-181`; registered at `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/hooks/hooks.json:118-119` | hook (SessionStart, `additionalContext`) | none |
| CLAIM | Stop / SubagentStop guard registration | `…/hooks/hooks.json:72-73` (SubagentStop), `:160-161` (Stop) | hook | P-11 class undecided (`REQUIREMENTS.md:45`); P-18 re-home (`:52`) |
| CLAIM | Guard never blocks; uses `additionalContext`; honors `stop_hook_active`; dedupes nudges | `…/hooks/output-types-guard.mjs:102-117,:238-251` | hook internals | none |
| CLAIM | Two output levels `receipts` (floor, shipped default) / `labels`, dial with no off position | `/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/hooks/lib/hook-scope.mjs:399-412` | mechanical — guard passes through entirely below `labels` (`…/hooks/output-types-guard.mjs:400-403`) | none |
| CLAIM | `hook-scope.mjs --level receipts\|labels` CLI, and the injected text teaching the command | `…/hooks/lib/hook-scope.mjs:713-767`; hint builder `:488-490` | mechanical | none |
| CLAIM | Per-repo enablement gate (`newdle-hooks.json`) applied to this guard | `…/hooks/output-types-guard.mjs:395-398`; repo file `/Users/jowolff/code/agent-system-2.0/newdle-hooks.json` | mechanical | none |
| CLAIM | OMP bridge that makes the guard fire at all for a seat | `/Users/jowolff/.omp/agent/extensions/newdle-hooks.ts:1259-1280` (`session_stop` → `last_assistant_message` → `output-types-guard`) | mechanical | P-19 requires OMP-native rebuild (`REQUIREMENTS.md:53`) |
| CLAIM | Jo's global copy: § PMDW rendering contract and § Output types | `/Users/jowolff/.claude/CLAUDE.md` § "PMDW marks conversation" and § "Output types: claim, cite, guess, action, question"; inventoried at `/Users/jowolff/code/agent-system-2.0/INVENTORY.md:85`, sync clause at `:232` | prose (loaded for every session under `$HOME`) | C2 §1.2 row (`briefs/phase5.md:199-201`) as part of the `CLAUDE.md` artifact; the output-types half unaddressed |
| CLAIM | Four divergent copies of the contract (plugin, `~/.claude/references`, plugin source, jo-wolff-plugins) | `/Users/jowolff/code/agent-system-2.0/INVENTORY.md:116-120` | — (this is the drift, not a control) | C4 rows; dissolved by P-15/P-18 |
| CLAIM | Measured incident files behind rules 10 and 11 | `/Users/jowolff/code/agent-system-2.0/INVENTORY.md:120` (`output-types-incidents.md` ×3) | prose | none |
| CLAIM | Known 1.x enforcement hole: envelope never checked for any hand | `/Users/jowolff/code/agent-system-2.0/REVIEW.md:26-28`, `:232`; carried into `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:385-387` | — (the hole) | not re-raised in `SPEC-2.0.md`; P-8a/P-8b make it moot only if hand reports are genuinely non-load-bearing |
| CLAIM | Known 1.x enforcement hole: labels checked on the wrong tier, `Stop` only, no allowlist | `/Users/jowolff/code/agent-system-2.0/REVIEW.md:168`, `:179`, `:233` | — | none |
| CLAIM | P-18 names the output-types reference as a re-home-or-drop artifact | `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md:52`; source wording `/Users/jowolff/code/agent-system-2.0/PREFERENCES.md:597-602` | — | this is the *only* explicit 2.0 mention of the framework |
| CLAIM | Session C batch C4 = `INVENTORY.md` § 1.4, 14 rows, recommended to run early | `/Users/jowolff/code/agent-system-2.0/briefs/phase5.md:201`, `:209-211`; source table `/Users/jowolff/code/agent-system-2.0/INVENTORY.md:112-135` | — | the pass itself; default disposition *drop unless argued for* (`briefs/phase5.md:191`) |

**GUESS(inference)**
The 14-row C4 count in `briefs/phase5.md:201` matches the `INVENTORY.md` § 1.4 table I read at
`INVENTORY.md:112-135`, which lists 14 artifact rows — but several of those rows are Lintel-local
evidence machinery (`JUDGEMENT.md`, `RETRACTIONS.md`, `EXPERIMENTS.md`, ctx) rather than
output-types pieces, so C4 as scoped disposes of roughly six output-types rows, not the 33 pieces
enumerated above. I did not re-count the table programmatically.

---

## 3. Recommended disposition

**GUESS(inference)**
Make it a standalone requirement, **P-23: every agent in 2.0 labels its statements and carries its
receipts, and the obligation is enforced by machinery rather than prose** — because Jo stated it as
a must (`JO-INPUT.md:20`) while Session C's default is *drop unless argued for*
(`briefs/phase5.md:191`), so leaving it as a C4 row plus P-18 re-homing makes survival the thing
that has to be argued for, and leaves G2 (the six-field slice brief, already ruled closed at
`SPEC-2.0.md:436-447`) and G3 (P-8a's trust-as-is versus Tier 3's do-not-act) as silent conflicts
nobody is obliged to resolve. This is a proposal, not a ruling.

**PMDW**
P-23 does not replace C4. C4 still disposes of the four divergent copies, the incidents files, and
the Lintel evidence machinery in the same batch; P-23 changes only the default those rows are
judged against.

---

## 4. Sources

**ACTION**
Read in full (no selector, whole file returned): `/Users/jowolff/code/agent-system-2.0/REQUIREMENTS.md`;
`/Users/jowolff/.claude/plugins/cache/contextpress/newdle/0.2.171/references/output-types.md`
(two reads, `:1-300` then `:301-566`).

**ACTION**
Read partially: `/Users/jowolff/code/agent-system-2.0/INVENTORY.md:110-140`;
`/Users/jowolff/code/agent-system-2.0/briefs/phase5.md:150-243`;
`/Users/jowolff/code/agent-system-2.0/SPEC-2.0.md:434-465`.

**ACTION**
Grepped, not read: `…/hooks/output-types-guard.mjs` (594 lines, ~90 matched lines read);
`…/hooks/output-types-inject.mjs` (186 lines); `…/hooks/lib/hook-scope.mjs` (821 lines);
`…/hooks/hooks.json`; `…/agents/*.md`; `/Users/jowolff/.omp/agent/extensions/newdle-hooks.ts`;
`REVIEW.md`; `PREFERENCES.md`; `JO-INPUT.md`; `SPEC-2.0.md` (structure + two keyword sweeps).
`wc -l` on the three hook scripts → 594 / 186 / 821. All read-only; nothing to reverse.

**ACTION**
Not opened: `/Users/jowolff/.claude/CLAUDE.md` as a file on disk (its § PMDW and § Output types
arrived in this session's own context, so the section receipts above are by-heading, not by line);
`/Users/jowolff/.claude/references/output-types.md` (the second copy);
`/Users/jowolff/code/jo-wolff-plugins/plugins/output-types/` (the fourth copy);
`output-types-incidents.md`; `SPEC-2.0.md` Sessions A and B in full;
`INVENTORY.md` §§ 2–8. Their rows above rest on `INVENTORY.md`'s and `REVIEW.md`'s receipts, not on
my own reading — upstream CLAIMs preserved, not broadened.

**GUESS(inference)**
The `receipts`-level text is the shipped default (`…/hooks/lib/hook-scope.mjs:412`), so on a stock
install the label vocabulary and envelope are *not* requested and the guard is dormant
(`…/hooks/output-types-guard.mjs:400-403`). This session is at `labels`. Whether Jo's machine has
a `newdle-output-level.json` setting it there I did not read — `/Users/jowolff/.claude/newdle-output-level.json`
exists at 40 bytes per `INVENTORY.md:123`, contents unread.

<!-- output-types
tier: 2
CLAIM: 38
CITE: 1
GUESS: 3 (inference 3, pattern 0, recall 0)
ACTION: 4
PMDW: 1
QUESTION: 1
-->
