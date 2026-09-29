// P-11 row 2 as its own extension (astra review S4): the owned output-types contract appended to
// every agent's system prompt, lanes and hands alike (children re-bind extensions).
import { injectContract } from "../src/rows/r02-contract";
import type { GatesAPI } from "../src/session";

export default function contractRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("before_agent_start", (event) => ({ systemPrompt: injectContract(event.systemPrompt, env) }));
}
