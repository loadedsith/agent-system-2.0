# Output-types incidents

Supplement to `contract/output-types.md` (this repository's owned output-types contract,
DESIGN-2.0.md C4.5). It holds the measured incidents behind the rules that are hardest to
believe on first reading.

**Do not load this file as a matter of course.** The contract in `output-types.md` is
injected into every lane and hand by machinery (P-11 row 2), so every line there is paid for
on every dispatch. These narratives are not — read one only when a rule is being disputed,
re-derived, or taught, and read only the section you need.

Each section is anchored by a heading so a pointer stays valid when text is inserted above
it. Cite the heading, never a line number.

---

## Rule 10 — a receipt licenses only what it literally shows

<!-- output-types-rule-10 -->

Measured 2026-08-13.

A plan step said a page "breaks otherwise". A review overturned it, citing two accurate
`file:line` receipts that genuinely showed the null path is guarded — the seeding sat
behind a conditional that skipped it rather than throwing on it.

Both statements were true and they were not the same claim. The receipts proved the code
would not *throw*; the step's real content was that something would be *lost*. Those are
different failures and only one of them has a stack trace.

What followed is the part worth carrying:

- The step was downgraded on the strength of the receipts.
- A builder shipped a **passing test** asserting the panel is omitted — encoding the wrong
  conclusion as a green check.
- Four later review passes read that green test as confirmation and moved on.
- The feature was silently lost in production. No crash, no error, no log entry.
- A human caught it.

The chain only breaks at step one. Every review after the downgrade was reviewing the
downgrade's premise, not the original question, and none of them could tell.

The companion bar on the reviewing side — what it takes to *clear* a concern rather than
raise one — is the same rule read backwards: a concern is cleared only by a receipt that
covers the concern's actual claim, not a neighbouring one.

---

## Rule 11 — a figure reused in a new context is a new claim

<!-- output-types-rule-11 -->

Measured 2026-08-13. Three instances in a single session, the same shape each time.

**The 22.8-second figure.** `22.8 seconds` was a correct measurement — of a Lighthouse
Slow 4G stress profile. It was then repeated for hours as what readers experience, which
was wrong by roughly 7.5x: real signed-in mobile p50 was 3.2 s. Nothing about the number
changed. The sentence around it did, and the caveat did not travel with it. By the time
anyone checked, the figure had reached further than the qualification that made it true.

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

This is why the rule fires on **everything** a subagent inherits. A delegation prompt is
itself a context change: the figure arrives with no provenance the agent can inspect, so
repeating it as a finding converts a parent's number into an apparent measurement of the
child's own. Say `the brief's figure, not mine`, and label it GUESS unless you reproduced
it yourself this session.

The same holds within one agent's own run — a figure measured early and restated later
against a different question is the identical failure. The number is the same, the
sentence is not, and it is the sentence that needs the receipt.
