// The P-11 gates as one OMP extension (DESIGN-2.0.md:334-354; MIGRATION.md:49, M4). Adapter only:
// it maps OMP events onto the OMP-free row modules under src/. Event contracts measured on OMP
// 18.3.0: tool_call {block, reason} and revised `input` (omp://extensions.md:83, :369;
// shared-events.ts:313-335), before_agent_start {systemPrompt, message} (types.ts:1154-1158),
// input (types.ts:913-918), session_stop {decision:"block", reason} for top-level sessions only
// (omp://extensions.md:349). Children re-bind this extension (task/executor.ts:3795-3796), so one
// registration covers the orchestrator, lanes and hands; the role is read per session.
//
// OMP types are declared structurally below rather than imported, so the gates load and test from
// a fresh clone with no OMP package on the module path.
import { defaultLedgerPath } from "../ledger/src/locality";
import { Ledger } from "../ledger/src/index";
import { checkToolCall } from "./src/gates";
import { type GateLedger, ledgerEntries } from "./src/ledger-port";
import { renderOpenQuestions } from "./src/rows/question";
import { injectContract } from "./src/rows/r02-contract";
import { checkReceipts, type HistoryEvent, historyEvent, renderFlags } from "./src/rows/r03-receipts";
import { checkTurnShape } from "./src/rows/r01-turn-shape";
import { WakeRead } from "./src/rows/r07-wake-read";
import { recordJoInstruction } from "./src/rows/r11-jo-instruction";
import { ModeController, type ModeState } from "./src/rows/r14-ask-policy";
import { LANE_ENV, ROLE_ENV, type Role, WORKLOAD_ENV } from "./src/types";

interface TextPart {
	type: string;
	text?: string;
}
interface AgentMessageLike {
	role?: string;
	content?: string | TextPart[];
}
interface Ctx {
	hasUI: boolean;
	cwd: string;
	sessionManager: { getHeader(): { parentSession?: string } | null; getEntries(): { type: string }[] };
	ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
}
type Handler<E, R = unknown> = (event: E, ctx: Ctx) => R | Promise<R>;
export interface GatesAPI {
	on(event: "session_start", h: Handler<{ type: "session_start" }>): void;
	on(event: "session_compact", h: Handler<{ type: "session_compact" }>): void;
	on(event: "before_agent_start", h: Handler<{ prompt: string; systemPrompt: string[] }, { systemPrompt?: string[]; message?: { customType: string; content: string; display: boolean } } | undefined>): void;
	on(event: "input", h: Handler<{ text: string; source: "interactive" | "rpc" | "extension" }, undefined>): void;
	on(event: "tool_call", h: Handler<{ toolName: string; input: Record<string, unknown> }, { block?: boolean; reason?: string; input?: Record<string, unknown> } | undefined>): void;
	on(event: "tool_result", h: Handler<{ toolName: string; input: Record<string, unknown>; details?: unknown; isError: boolean }, undefined>): void;
	on(event: "agent_end", h: Handler<{ willContinue?: boolean }, undefined>): void;
	on(event: "session_stop", h: Handler<{ last_assistant_message?: AgentMessageLike }, { decision: "block"; reason: string } | undefined>): void;
	getActiveTools(): string[];
	getAllTools(): { name: string }[];
	setActiveTools(names: string[]): Promise<void>;
	appendEntry(customType: string, data?: unknown): void;
}

const text = (m: AgentMessageLike | undefined): string =>
	typeof m?.content === "string" ? m.content : (m?.content ?? []).map((p) => (p.type === "text" ? (p.text ?? "") : "")).join("\n");

/** A hand is a subagent session: no UI and a parent session (task/executor.ts:3661-3664, :3829). */
function roleOf(ctx: Ctx, env: Record<string, string | undefined>): Role {
	if (!ctx.hasUI && ctx.sessionManager.getHeader()?.parentSession) return "hand";
	return env[ROLE_ENV] === "orchestrator" ? "orchestrator" : "lane";
}

export default function p11Gates(pi: GatesAPI, env: Record<string, string | undefined> = process.env): void {
	let role: Role = "lane";
	let cwd = process.cwd();
	let mode: ModeState | null = null;
	let ledger: Ledger | null = null;
	const history: HistoryEvent[] = [];
	const workloadId = env[WORKLOAD_ENV] || null;
	const laneId = env[LANE_ENV] || `lane-${process.pid}`;
	const openLedger = (): Ledger => (ledger ??= Ledger.open(defaultLedgerPath(env)));
	const bound = (): boolean => role === "lane" && workloadId !== null;
	const wake = workloadId ? new WakeRead(workloadId, () => ledgerEntries(openLedger())) : null;
	const modes = new ModeController(
		"lane",
		pi,
		() => (workloadId ? (openLedger().workload(workloadId)?.mode ?? null) : null),
		workloadId ? { workloadId, laneId, entries: () => ledgerEntries(openLedger()) } : undefined,
	);

	pi.on("session_start", (_e, ctx) => {
		role = roleOf(ctx, env);
		cwd = ctx.cwd;
		if (!bound() || !wake) return;
		// P-17 triggers: a resumed session (restart), or a fresh lane on a workload that already has history.
		const resumed = ctx.sessionManager.getEntries().some((e) => e.type === "message");
		try {
			if (resumed) wake.trigger("restart");
			else if (openLedger().provenance(workloadId!).length > 1) wake.trigger("first-lane-with-history");
		} catch {
			wake.trigger("restart"); // cannot tell: owe the entry rather than skip it
		}
	});

	pi.on("session_compact", () => {
		if (bound()) wake?.trigger("compaction");
	});

	pi.on("before_agent_start", async (event) => {
		const systemPrompt = injectContract(event.systemPrompt, env);
		if (role === "hand") {
			await new ModeController("hand", pi, () => null).beforeTurn();
			return { systemPrompt };
		}
		if (role !== "lane") return { systemPrompt };
		try {
			mode = await modes.beforeTurn();
			if (mode.note) pi.appendEntry("p11-mode", mode);
		} catch (err) {
			mode = { mode: null, askActive: false, effective: false, note: String(err) };
		}
		if (!wake?.pending || !workloadId) return { systemPrompt };
		let open = "";
		try {
			open = renderOpenQuestions(openLedger(), workloadId);
		} catch (err) {
			open = `Open questions could not be read from the ledger (${String(err)}).`;
		}
		const content =
			`Wake (${wake.pending}): this turn owes one wake-read ledger entry on ${workloadId} stating what you resume; ` +
			`the next turn is refused until it exists (P-11 row 7).${open ? `\n\n${open}` : ""}`;
		return { systemPrompt, message: { customType: "p11-wake", content, display: true } };
	});

	pi.on("input", (event, ctx) => {
		if (!bound()) return undefined;
		try {
			recordJoInstruction(openLedger(), { text: event.text, source: event.source, workloadId: workloadId!, laneId });
		} catch (err) {
			ctx.ui.notify(`P-11 row 11: Jo's instruction was NOT recorded in the ledger (${String(err)}).`, "error");
		}
		return undefined;
	});

	pi.on("tool_call", (event) => {
		const call = { toolName: event.toolName, input: event.input };
		const refusal = checkToolCall(call, { role, cwd, env, mode: mode?.mode }, {
			wake: bound() ? wake : null,
			workload: bound() ? { id: workloadId!, ledger: (): GateLedger => openLedger() } : null,
		});
		if (refusal) return refusal;
		// Row 3 at a hand's exit: flag the report, never block (SPEC-2.0.md § B15 item 5).
		if (role === "hand" && event.toolName === "yield") {
			const data = event.input.data;
			const nested = data !== null && typeof data === "object" && "report" in data && typeof data.report === "string" ? data : null;
			const report = typeof data === "string" ? data : nested ? String(nested.report) : null;
			if (report === null) return undefined;
			const flags = checkReceipts(report, history, cwd);
			if (flags.length === 0) return undefined;
			const flagged = report + renderFlags(flags);
			return { input: { ...event.input, data: nested ? { ...nested, report: flagged } : flagged } };
		}
		return undefined;
	});

	pi.on("tool_result", (event) => {
		const h = historyEvent(event.toolName, event.input, event.details, event.isError);
		if (h) history.push(h);
		return undefined;
	});

	pi.on("agent_end", (event) => {
		if (!event.willContinue) wake?.turnEnded();
		return undefined;
	});

	pi.on("session_stop", (event) => {
		if (role === "hand") return undefined;
		const message = text(event.last_assistant_message);
		const flags = checkReceipts(message, history, cwd);
		if (flags.length > 0) pi.appendEntry("p11-receipts", { flags });
		const refusal = checkTurnShape(message);
		return refusal ? { decision: "block", reason: refusal.reason } : undefined;
	});
}
