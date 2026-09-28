// The gates' view of the ledger. Every ledger write goes through ledger/src/index.ts (the module is
// the writer contract, SPEC-2.0.md § B2); nothing here opens the file or runs SQL.
//
// Lane entries (the wake verified read of row 7, the mode-effective acknowledgement of the mode row,
// the named assumption of the question row, a reserved action raised to Jo by row 6) have no table
// in schema v2 (ledger/SCHEMA.md "Tables"). They go through LaneEntries, an interface the ledger
// module does not implement yet: REPORT.md carries the DDL as a QUESTION. Until a follow-up adds
// `recordEntry`/`entries` to the module, `ledgerEntries()` throws LaneEntriesUnavailable and the
// rows that need an entry fail closed with that reason.
import type { Ledger } from "../../ledger/src/index";

/** The subset of the ledger module the gates call. `Ledger` satisfies it structurally. */
export type GateLedger = Pick<
	Ledger,
	"workload" | "slice" | "question" | "recordInstruction" | "raiseQuestion" | "provenance" | "inFlight"
>;

export type EntryKind = "wake-read" | "mode-effective" | "assumption" | "reserved-request";

export interface LaneEntry {
	id: string;
	workload_id: string;
	slice_id: string | null;
	kind: EntryKind;
	body: string;
	created_by: string;
	created_at: string;
}

/** Lane-written ledger entries. Proposed module API; see the DDL QUESTION in REPORT.md. */
export interface LaneEntries {
	recordEntry(input: { by: string; workloadId: string; sliceId?: string | null; kind: EntryKind; body: string }): string;
	entries(workloadId: string, kind?: EntryKind): LaneEntry[];
}

export class LaneEntriesUnavailable extends Error {
	constructor() {
		super(
			"the ledger module has no lane-entries API yet (recordEntry/entries; schema v2 has no entries table). " +
				"This gate cannot record or find the entry it needs, so it refuses rather than pass unchecked. " +
				"Pending: the entries-table DDL QUESTION in migration/M4/REPORT.md.",
		);
	}
}

/** The module's lane-entries API when a follow-up has added it; otherwise throws LaneEntriesUnavailable. */
export function ledgerEntries(ledger: object): LaneEntries {
	const l = ledger as Partial<LaneEntries>;
	if (typeof l.recordEntry !== "function" || typeof l.entries !== "function") throw new LaneEntriesUnavailable();
	return l as LaneEntries;
}
