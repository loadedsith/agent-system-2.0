# Cross-lab review — GPT — contradictions lens

**CLAIM**
**1. High — P-2 gives lanes the lifetime that P-5 assigns exclusively to workloads.** P-2 says a lane is “persistent for as long as its workload is” ([PREFERENCES.md:69–71](PREFERENCES.md:69)). P-5 says “a workload outlives its lanes” and that a closing lane loses nothing a new lane cannot recall ([PREFERENCES.md:188–194](PREFERENCES.md:188)). The summary preserves the lifetime promise ([REQUIREMENTS.md:11](REQUIREMENTS.md:11)).

**GUESS**
High-confidence contradiction: both hold only if P-2’s “persistent” describes continuity across replacement instances, rather than the lifetime of the lane itself. That qualification is unwritten and conflicts with the explicit vocabulary distinguishing the instance from the durable unit.

**CLAIM**
**2. High — P-7b’s summary narrows the authority Jo reserved.** The full ruling reserves “changes to the system’s own rules **or machinery**” to Jo ([PREFERENCES.md:288–290](PREFERENCES.md:288)). The summary reserves only “changes to the system’s own rules,” while granting the orchestrator authority by default ([REQUIREMENTS.md:18](REQUIREMENTS.md:18)).

**GUESS**
High-confidence summary disagreement: both hold only if every machinery change counts as a rule change, or the summary’s reserved list is understood to be incomplete. Neither qualification appears. A machinery change that leaves policy unchanged receives different authorization answers from the two documents.

**CLAIM**
**3. High — The orchestrator controls the ceiling whose exceedance requires Jo.** P-9 says “the orchestrator sets a workload’s ceiling” and it is “not Jo’s to set” ([PREFERENCES.md:366–369](PREFERENCES.md:366)). P-7b reserves “spend above a workload’s ceiling” to Jo ([PREFERENCES.md:283–284](PREFERENCES.md:283)). P-5 also assigns the brief’s ceiling field to the orchestrator ([PREFERENCES.md:182–185](PREFERENCES.md:182)).

**GUESS**
Medium-confidence authority gap: both hold as an effective spending restriction only if the orchestrator cannot raise an existing ceiling to authorize spending that previously exceeded it, or such a raise itself requires Jo. The documents distinguish who sets the ceiling from who approves exceeding it, but never distinguish initial setting from subsequent increases.

**CLAIM**
**4. High — P-13 allows lane-written ledger content where P-7a/P-8b require independent state.** P-7a requires task state to be written “by the machinery as a side-effect of the work, not by a lane choosing to write a status” ([PREFERENCES.md:246–250](PREFERENCES.md:246)). P-8b says “nothing the orchestrator decides depends on” a lane’s report ([PREFERENCES.md:329–334](PREFERENCES.md:329)). P-13 nevertheless specifies a ledger “the machinery and lanes write as they work,” including “task state and steps” ([PREFERENCES.md:451–454](PREFERENCES.md:451)). Its summary calls that ledger “machinery-written” ([REQUIREMENTS.md:29](REQUIREMENTS.md:29)).

**GUESS**
High-confidence missing boundary: all hold only if lane-authored ledger entries cannot supply the authoritative task state on which the orchestrator depends, or “lanes write” means something other than discretionary status reporting. The full entry does not allocate those writing rights; the summary conceals the ambiguity.

**CLAIM**
**5. Medium — P-1’s two workloads conflict with P-5’s project/feature workload model.** P-1 says the system “serves two workloads — Newdle and Jo’s personal work” ([PREFERENCES.md:49–50](PREFERENCES.md:49)). P-5 defines a workload as “a project, a feature, ‘Jo’s personal work’” and allows the orchestrator to open workloads autonomously ([PREFERENCES.md:163–164](PREFERENCES.md:163), [PREFERENCES.md:185–187](PREFERENCES.md:185)).

**GUESS**
High-confidence terminology conflict: both hold only if P-1’s “two workloads” means two areas of work rather than two instances of the defined durable unit. Under the literal reading, opening a separate Newdle feature workload exceeds P-1’s stated set. This also changes the granularity of the ceiling, memory key, and migration unit.

**CLAIM**
**6. Medium — P-7b gives hand creation to the orchestrator; P-8 gives it to lanes.** P-7b says “the orchestrator opens hands” without asking ([PREFERENCES.md:251–255](PREFERENCES.md:251)). P-8 says “a lane spawns, briefs, and owns its hands; the orchestrator does not dispatch into a lane” ([PREFERENCES.md:300–301](PREFERENCES.md:300)).

**GUESS**
High-confidence missing ownership qualification: both hold only if “the orchestrator opens hands” means it requests work whose hand dispatch remains the lane’s decision, or the orchestrator has its own separate lane and hands. Neither distinction is stated. The text otherwise assigns the same dispatch operation to both actors.

**CLAIM**
**7. Medium — P-7c promises routine message-state reporting; P-8c promises silence outside exceptions.** P-7c gives messages four observable states and says “Jo is told which” ([PREFERENCES.md:264–269](PREFERENCES.md:264)). P-8c says errors and things needing attention surface, while “everything else stays quiet” ([PREFERENCES.md:337–338](PREFERENCES.md:337)).

**GUESS**
High-confidence missing visibility distinction: both hold only if normal delivery/consumption updates are passively visible or available on request, while only overdue messages produce unsolicited notifications. Alternatively, every state transition must count as needing attention, which substantially narrows P-8c. The overdue-message exception is explicit; the treatment of successful transitions is not.

**CLAIM**
**8. Medium — P-16’s summary makes the prohibition on applying fixes broader than its full entry.** The summary says the system proposes a fix for Jo to accept and “never applies one itself” ([REQUIREMENTS.md:32](REQUIREMENTS.md:32)). The full entry says P-7b and P-11 “govern what happens after Jo says yes” ([PREFERENCES.md:498–501](PREFERENCES.md:498)); P-11 requires installation with a built and verified enforcement point ([PREFERENCES.md:395–398](PREFERENCES.md:395)).

**GUESS**
Medium-confidence scope disagreement: both hold only if “never applies one itself” means “never applies without Jo’s authorization,” or an actor outside the system performs every accepted installation. The text does not choose between forbidding autonomous adoption and forbidding system execution even after approval.

**CLAIM**
**9. Low — P-15’s “Open for Phase 5” column includes classifications already constrained by P-18.** P-15 leaves “which artifact classes are machinery vs state” open ([REQUIREMENTS.md:31](REQUIREMENTS.md:31)). Its full entry already names definitions, rules, enforcement, and skills as machinery ([PREFERENCES.md:484–490](PREFERENCES.md:484)). P-18 further requires every retained plugin artifact—including hooks, definitions, skills, and the output-types reference—to be “re-homed into the portable repo” ([PREFERENCES.md:548–552](PREFERENCES.md:548)).

**GUESS**
High-confidence open-scope overstatement: both hold only if Phase 5’s classification question excludes those already-fixed classes and cannot classify retained plugin artifacts as nonportable state. The column does not identify that reduced scope. This is a specific already-ruled boundary, not a generic objection to leaving implementation details open.

**CLAIM**
**10. Low — P-16’s dependency is an unconfirmed inference in the full entry and a requirement in the summary.** The summary states “Depends on P-15: accepted proposals land in the portable repo” ([REQUIREMENTS.md:32](REQUIREMENTS.md:32)). The full entry calls the dependency “a design constraint … not … a new requirement” and explicitly labels agreement as “GUESS on whether Jo agrees with the direction of dependency” ([PREFERENCES.md:505–513](PREFERENCES.md:505)).

**GUESS**
High-confidence status disagreement: both hold only if the summary is allowed to promote an unconfirmed inference into the requirement without preserving its status, or a confirming ruling exists outside this complete artifact. The dependency may be sensible; its recorded authority differs.

**PMDW**
10 findings; I would fix #1 first because lane lifetime versus workload continuity determines what the system opens, closes, replaces, resumes, and migrates.