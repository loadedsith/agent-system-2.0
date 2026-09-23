• # Cross-lab review — Kimi — cold-read lens

  ## Critical

  **1. P-3 delegates the entire cutover mechanics to Phase 5.**
  The "Open for Phase 5" column lists `OMP_PROFILE` isolation, the seat↔workload map, the rule for a repo held by both systems, and the retirement condition for a 1.x seat (`REQUIREMENTS.md:12`; `PREFERENCES.md:103-104`). These are not design details; they decide whether the migration is even possible. A second engineer cannot draw the cutover plan without them.

  **2. P-9's routing rule cannot be built because its inputs are undefined.**
  The requirement says "A work-kind rule picks a hand's tier, a per-workload ceiling bounds every lane" with "no human approval per dispatch" (`REQUIREMENTS.md:25`), but the same cell leaves "the work-kind taxonomy" and "what the orchestrator reads the ceiling off" open for Phase 5 (`PREFERENCES.md:368-369`). The "rule" is a placeholder; the taxonomy *is* the rule.

  **3. P-7c's exception behavior depends on a threshold that does not exist.**
  Four message states are named and "the threshold clock starts at held" (`REQUIREMENTS.md:19`; `PREFERENCES.md:262-269`), but the threshold value itself is listed as "Phase 5" (`REQUIREMENTS.md:19`). Without the threshold, the exception condition in P-8c is unimplementable.

  **4. P-7b's reserved list contains an item whose scope is empty.**
  Item 3 is "irreversible actions outside the repo," with examples given, but "narrowed to a concrete command list in Phase 5" (`PREFERENCES.md:285-286`; `REQUIREMENTS.md:18`). A second engineer cannot build the reservation gate because the list of forbidden tool calls is missing.

  ## High

  **5. "Workload" is used as a first-class unit in P-1 before it is defined.**
  P-1 says "The system serves two workloads — Newdle and Jo's personal work" (`REQUIREMENTS.md:10`), but the workload/lane vocabulary ruling appears later (`PREFERENCES.md:33-40`). The reader must infer the definition from P-2.

  **6. "Orchestrator" is referenced in P-2 before P-7 explains what it is.**
  P-2 describes a lane as "the managed working context the orchestrator opens on a workload" (`REQUIREMENTS.md:11`; `PREFERENCES.md:69`), but the orchestrator is only defined in P-7 as "the thing that holds the workload model and routes" (`REQUIREMENTS.md:16-17`; `PREFERENCES.md:227-237`).

  **7. "Hand" is used throughout P-8 without ever being defined.**
  "The lane owns its hands: it spawns, briefs, and owns them" (`REQUIREMENTS.md:20`; `PREFERENCES.md:300`). No prior sentence explains what a hand is, how it differs from a lane, or what it means for a lane to "own" one.

  **8. "Seat" is treated as a known 1.x concept but is never defined.**
  P-2's vs-1.x note says 1.x has the working context as "seats" (`REQUIREMENTS.md:11`), and P-5/P-6/P-7/P-8 repeatedly contrast lanes with seats (`PREFERENCES.md:73-75`, `PREFERENCES.md:209-214`). A reader who never saw 1.x cannot map a seat to a process, a window, a persona, or a repo.

  **9. P-15's portability requirement is unverifiable because the machinery/state boundary is open.**
  The requirement says "an up-to-date copy of the system can be created from Jo's GitHub repo" (`REQUIREMENTS.md:31`), but the same cell leaves "which artifact classes are machinery vs state" and "the install path" to Phase 5 (`PREFERENCES.md:489-490`). You cannot know if the repo is complete without the boundary.

  ## Medium

  **10. P-12 claims an option is offered "at the appropriate time" but the timing is unresolved.**
  Jo's words ask for "the option to plan larger tasks with a lane instead of the lane just executing" (`PREFERENCES.md:406-407`). The requirement widens this to "spec and plan ... before anything executes" (`REQUIREMENTS.md:28`), but whether planning happens before or after a lane exists is explicitly held as a Phase 5 question (`PREFERENCES.md:432-435`). The "appropriate time" is the undecided part.

  **11. P-13 mandates an index-plus-ledger shape while leaving the ledger tool open.**
  The requirement fixes "an after-the-fact index ... plus a machinery-written ledger" (`REQUIREMENTS.md:29`), but the ledger tool is "a Phase 5 choice, Beads a candidate" (`PREFERENCES.md:451-456`). The choice of tool determines whether the required shape is feasible, so the requirement is half-made.

  **12. P-17 adds a third resume trigger not present in Jo's quoted words.**
  Jo said resume must work after "compaction or session shut down" (`PREFERENCES.md:517-519`). The requirement adds "the first lane opened on a workload with prior history" as a third trigger (`REQUIREMENTS.md:33`; `PREFERENCES.md:527-528`). This is a real extension; it should be flagged as a ruling, not read back as Jo's words.

  **13. P-5 offers two incompatible homes for per-repo expertise.**
  It says per-repo expertise moves to "per-repo memory in the store, loaded on checkout," then immediately adds that "a standing per-repo lane is not a tier, only a workload that happens not to close" (`PREFERENCES.md:190-192`). A second engineer cannot tell whether per-repo knowledge is pulled on checkout or represented by a long-running workload.

  ## Low

  **14. P-1 does not bound workload granularity.**
  "Newdle and Jo's personal work" are named as the two workloads (`REQUIREMENTS.md:10`), but P-2 allows a workload to be "a project, a feature, 'Jo's personal work'" (`PREFERENCES.md:69-72`). It is unclear whether Newdle is one workload or many, which affects routing, ceilings, and memory keys.

  **Fix first:** Finding 2 (P-9's work-kind taxonomy and ceiling source). It sits at the center of spend control, tier routing, and the reserved-list spend exception, and without it the orchestrator cannot make the dispatch decisions the rest of the document assumes it makes.

  12 findings; fix P-9 first.

