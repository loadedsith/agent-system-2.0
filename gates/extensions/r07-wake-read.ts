// P-11 row 7 as its own extension (astra review S4): after a P-17 trigger the lane's first turn
// writes a wake-read entry; later turns are refused until this lane's entry exists — on every tool
// call except the recovery tool, and at the turn's stop, so a tool-less second turn is refused too
// (astra review B3). The recovery tool writes the entry through the ledger module.
import { renderOpenQuestions } from "../src/rows/question";
import { WAKE_READ_TOOL } from "../src/rows/r07-wake-read";
import { type GatesAPI, gateSession } from "../src/session";

export default function wakeReadRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;
	pi.registerTool({
		name: WAKE_READ_TOOL,
		loadMode: "essential",
		label: "Record Wake Read",
		description:
			"After compaction, a restart, or joining a workload with history, record the one wake-read ledger entry stating what this lane resumes, read from the ledger. " +
			"Until it exists, the lane's second turn is refused (P-11 row 7). Writes through the ledger module as this lane.",
		parameters: z.object({
			body: z.string().describe("What this lane resumes: the workload's state as read from the ledger, and the next step."),
			slice: z.string().optional().describe("The slice id (sl-…) the lane resumes, when it resumes one; empty or blank means none."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = gateSession(ctx, env);
			if (!s.bound || !s.wake) {
				return { content: [{ type: "text", text: "This session is not a lane bound to a workload; no wake read is owed and nothing was recorded." }] };
			}
			const id = s.wake.record(String(params.body ?? ""), typeof params.slice === "string" ? params.slice : null);
			return { content: [{ type: "text", text: `Recorded wake-read entry ${id} on ${s.workloadId} as ${s.laneId}.` }], details: { id } };
		},
	});

	pi.on("session_start", (_e, ctx) => {
		const s = gateSession(ctx, env);
		if (!s.bound || !s.wake) return undefined;
		// P-17 triggers: a resumed session (restart), or a fresh lane on a workload that already has history.
		const resumed = ctx.sessionManager.getEntries().some((e) => e.type === "message");
		try {
			if (resumed) s.wake.trigger("restart");
			else if (s.ledger().provenance(s.workloadId!).length > 1) s.wake.trigger("first-lane-with-history");
		} catch {
			s.wake.trigger("restart"); // cannot tell: owe the entry rather than skip it
		}
		return undefined;
	});

	pi.on("session_compact", (_e, ctx) => {
		const s = gateSession(ctx, env);
		if (s.bound) s.wake?.trigger("compaction");
		return undefined;
	});

	pi.on("before_agent_start", (_e, ctx) => {
		const s = gateSession(ctx, env);
		if (!s.bound || !s.wake?.pending) return undefined;
		let open = "";
		try {
			open = renderOpenQuestions(s.ledger(), s.workloadId!);
		} catch (err) {
			open = `Open questions could not be read from the ledger (${String(err)}).`;
		}
		const content =
			`Wake (${s.wake.pending}): this turn owes one wake-read ledger entry on ${s.workloadId} stating what you resume; ` +
			`record it with the ${WAKE_READ_TOOL} tool. The next turn is refused until it exists (P-11 row 7).${open ? `\n\n${open}` : ""}`;
		return { message: { customType: "p11-wake", content, display: true } };
	});

	pi.on("tool_call", (event, ctx) => {
		const s = gateSession(ctx, env);
		return s.bound ? (s.wake?.check(event) ?? undefined) : undefined;
	});

	pi.on("agent_end", (event, ctx) => {
		if (!event.willContinue) gateSession(ctx, env).wake?.turnEnded();
		return undefined;
	});

	pi.on("session_stop", (_e, ctx) => {
		const s = gateSession(ctx, env);
		const owed = s.bound ? s.wake?.owed() : null;
		return owed ? { decision: "block", reason: owed.reason } : undefined;
	});
}
