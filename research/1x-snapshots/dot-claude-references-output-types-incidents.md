# Output-types incidents

Supplement to the "Output types: claim, cite, guess, action" section of
`/Users/jowolff/.claude/CLAUDE.md`. It holds the measured incidents behind the two rules
that are hardest to believe on first reading.

**This file is deliberately not in `CLAUDE.md`.** That file is loaded into every turn of
every session in every project, so every line in it is paid for continuously. These
narratives are proof, not instruction — they only need to be readable when a rule is being
disputed, re-derived, or explained to someone. Read the section you need; do not load the
file by default.

Each section is anchored by a heading and an HTML comment so a pointer stays valid when
text is inserted above it. Cite the heading, never a line number.

---

## Rule 7 — a receipt licenses only what it literally shows

<!-- output-types-rule-7 -->

Measured 2026-08-13.

A plan step read *"it breaks otherwise"*, about a Spotlight editor seeding a timeline
panel. A `gaslight` critique overturned it, citing two accurate spans in
`UserSpotlightEditorPage.tsx` that genuinely show the seeding sits behind an
`if (historical && lastSection)` guard.

The receipts were true and the conclusion was wrong. They prove the code will not *throw*.
They say nothing about whether something is *lost* — and it was. Those are different
failures, and only one of them has a stack trace.

What followed is the part worth carrying:

- The step was downgraded on the strength of the receipts.
- A builder shipped a **passing test** asserting the panel is omitted, encoding the wrong
  conclusion as a green check.
- Four later review passes read that green test as confirmation and moved on.
- Spotlight creators silently lost a pre-seeded panel. No crash, no error, no log.
- A human caught it.

The chain only breaks at step one. Every review after the downgrade was reviewing the
downgrade's premise rather than the original question, and none of them could tell.

---

## Rule 8 — a figure reused in a new context is a new claim

<!-- output-types-rule-8 -->

Measured 2026-08-13. Three instances in a single session, the same shape each time.

**The 22.8-second figure.** `22.8 seconds` was a correct measurement — of a Lighthouse Slow
4G stress profile. Repeated for hours as what readers experience, it was wrong by roughly
7.5x: real signed-in mobile p50 was 3.2 s. Nothing about the number changed. The sentence
around it did, and the caveat did not travel with it. By the time anyone checked, the
figure had reached considerably further than the qualification that made it true.

**The one-story saving.** A saving measured on a single story was restated as applying to
"every desktop feed visit". The real rate was 1 in 20.

**The stale byte-share.** A byte-share computed from one capture was quoted against a
payload that had since changed size, so the percentage described a page that no longer
existed.

### The positive example, same session

A performance audit wrote, unprompted, *"the byte figures in the brief are yours, not
mine."* That is the behaviour the rule exists to make standard: the agent noticed that a
number arriving in its brief carried no provenance it could inspect and no way to
re-derive, and refused to launder it into an apparent measurement of its own.

### The subagent failure, same session

A builder inherited a field percentile from its delegation brief, calibrated a capture
profile to it, and never flagged that the target was inherited rather than measured. The
target later turned out to be contaminated — and because it was never labelled, nothing
downstream had any reason to re-check it.

This is why the rule fires on **everything** a subagent inherits: a delegation prompt is
itself a context change, and the figure arrives with no provenance the agent can inspect.
