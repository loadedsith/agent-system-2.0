// P-11 row 4 as its own extension (astra review S4): a dispatch names one of the four tier files.
import { checkTierName } from "../src/rows/r04-tier-name";
import type { GatesAPI } from "../src/session";

export default function tierNameRow(pi: GatesAPI): void {
	pi.on("tool_call", (event) => (event.toolName === "task" ? (checkTierName(event.input) ?? undefined) : undefined));
}
