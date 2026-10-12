// P-11 row 18 as its own extension (astra review S4): a bash call whose typed command starts with
// the M4b fence's own wrapper is refused, and the refusal says to resend the bare command. It reads
// the event's `input.command` as the model typed it, so it registers before the fence (gates/index.ts)
// and needs no session state: every role, fence on or off, no ledger read.
import { checkTypedWrapper } from "../src/rows/r18-typed-wrapper";
import type { GatesAPI } from "../src/session";

export default function typedWrapperRow(pi: GatesAPI): void {
	pi.on("tool_call", (event) => checkTypedWrapper(event) ?? undefined);
}
