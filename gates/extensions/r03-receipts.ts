// P-11 row 3 as its own extension (astra review S4): the session's tool history, a hand's yield
// flagged in place (never blocked), and a top-level turn's receipts flagged into the session.
import { checkReceipts, historyEvent, renderFlags } from "../src/rows/r03-receipts";
import { type GatesAPI, gateSession, messageText } from "../src/session";

/**
 * Every string in a yield's `data`, flagged in place: a hand's report may sit in any field or nested
 * object, not only `data.report` (astra review S2). Returns the value unchanged when nothing flags.
 */
function flagStrings(value: unknown, check: (s: string) => string[], depth = 0): { value: unknown; flagged: boolean } {
	if (typeof value === "string") {
		const flags = check(value);
		return flags.length > 0 ? { value: value + renderFlags(flags), flagged: true } : { value, flagged: false };
	}
	if (depth >= 6 || value === null || typeof value !== "object") return { value, flagged: false };
	let flagged = false;
	if (Array.isArray(value)) {
		const out = value.map((v) => {
			const r = flagStrings(v, check, depth + 1);
			flagged ||= r.flagged;
			return r.value;
		});
		return { value: flagged ? out : value, flagged };
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) {
		const r = flagStrings(v, check, depth + 1);
		flagged ||= r.flagged;
		out[k] = r.value;
	}
	return { value: flagged ? out : value, flagged };
}

export default function receiptsRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	pi.on("tool_result", (event, ctx) => {
		const h = historyEvent(event.toolName, event.input, event.details, event.isError);
		if (h) gateSession(ctx, env).history.push(h);
		return undefined;
	});

	// Row 3 at a hand's exit: flag the report, never block (SPEC-2.0.md § B15 item 5).
	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role !== "hand" || event.toolName !== "yield") return undefined;
		const r = flagStrings(event.input.data, (text) => checkReceipts(text, s.history, ctx.cwd));
		return r.flagged ? { input: { ...event.input, data: r.value } } : undefined;
	});

	pi.on("session_stop", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role === "hand") return undefined;
		const flags = checkReceipts(messageText(event.last_assistant_message), s.history, ctx.cwd);
		if (flags.length > 0) pi.appendEntry("p11-receipts", { flags });
		return undefined;
	});
}
