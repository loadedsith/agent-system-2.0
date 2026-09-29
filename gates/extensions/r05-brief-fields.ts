// P-11 row 5 as its own extension (astra review S4): a dispatch carries the six § B9 brief fields.
import { checkBriefFields } from "../src/rows/r05-brief-fields";
import type { GatesAPI } from "../src/session";

export default function briefFieldsRow(pi: GatesAPI): void {
	pi.on("tool_call", (event) => (event.toolName === "task" ? (checkBriefFields(event.input) ?? undefined) : undefined));
}
