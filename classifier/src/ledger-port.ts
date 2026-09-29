// The classifier's view of the ledger. Routing rows are written through the ledger module's
// `recordRouting` (schema v5, ledger/src/index.ts) and read back through `routingsForHand` — the row
// for exactly one session root and allocated agent id — when a delivery reaches an instance that did
// not settle it; nothing here opens the file or runs SQL.
import type { Ledger } from "../../ledger/src/index";

/** The subset of the ledger module the classifier calls. `Ledger` satisfies it structurally. */
export type RoutingLedger = Pick<Ledger, "slice" | "recordRouting" | "routingsForHand">;
