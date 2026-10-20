// P-11 row 19 as its own extension: a question about OMP is answered after reading OMP's own docs or
// source (gates/src/rows/r19-omp-docs-first.ts has the rule). This file maps OMP's events onto it.
//
// - The question: Ilex's and lanes' `input` (interactive or rpc; OMP 18.8.6 emits no other source) and a
//   hand's first `before_agent_start` (its task prompt; hands get no `input`) each start one, and only
//   they do. The judge call starts there and is awaited at the first answer boundary.
// - The consult: `tool_result`, any role.
// - The answer boundaries, each held on every attempt while the question is triggered and unconsulted:
//   - Ilex's and a lane's final reply: `assistant_message` replaces its text with HELD_MARKER (the row 1
//     pattern, gates/extensions/r01-turn-shape.ts; LATER_HOLD after the first), keeping the draft, and
//     the `session_stop` after it blocks with the reason and the draft, so the continuation rewrites it.
//   - Ilex's and a lane's outward tools (orchestrator_reply, orchestrator_raise_question, lane_message,
//     lane_raise_question, by name or as `xd://` devices) are refused at `tool_call`.
//   - A hand's `yield` is refused at `tool_call` (OMP fires no session_stop for a subagent).
// - Row 1 and row 19 stay independent: row 19 registers before row 1 (gates/index.ts). OMP hands each
//   assistant_message handler the previous rewrite and returns the first session_stop result (runner.ts),
//   so a reply row 19 holds reaches row 1 only as row 19's marker (which passes row 1): row 1 neither
//   judges it nor cites its QUESTION rows (row 15's publication binding refuses a row an earlier reply
//   cited, so citing a held draft would refuse its rewrite for good), and the stop ends on row 19's reason.
//   A reply row 19 lets through is row 1's to judge, and a row 1 hold is never one of row 19's. So each
//   continuation answers one row: row 1's loop is row 1's own, and row 19's ends after HOLD_LIMIT holds.
// - The loop guard: after HOLD_LIMIT holds the next attempt goes through. A final reply carries RELEASE_LINE as
//   its first line, a markdown heading so row 1's needs-you-first check skips it. A hand's yield carries it on
//   the first string of its `data` (or its `error`). A release at an outward tool puts it on the next reply.
//   Each release is logged as a `p11-omp-docs-first` session entry, as row 3 logs its flags. A yield revision
//   is last-wins in OMP (shared-events.ts accumulateToolCallResult), so on that one released yield it replaces
//   row 3's flags.
import type { JudgmentJudge } from "../../classifier/src/judge-ask";
import { HELD_MARKER, LATER_HOLD, OmpQuestion, RELEASE_LINE, consultsOmp, outwardTool } from "../src/rows/r19-omp-docs-first";
import { type Ctx, type GatesAPI, type GateSession, gateSession, messageText } from "../src/session";

/** OMP's `judge` role for a session (gates/index.ts hostJudge); tests hand in a fake. */
export type OmpJudge = (ctx: Ctx) => Promise<JudgmentJudge>;

export interface DocsFirstDeps {
	/** Absent: every input counts as a question about OMP (fail closed). */
	judge?: OmpJudge;
	/** The judge's bound; JUDGE_TIMEOUT_MS unless a test sets it. */
	timeoutMs?: number;
}

/** The session entry a release is logged as. */
export const RELEASE_LOG = "p11-omp-docs-first";

/** Each session's current question. Kept here: no other row reads it. */
const questions = new WeakMap<GateSession, OmpQuestion>();

/** `value` with RELEASE_LINE on its first string (depth-first, as row 3 walks a yield's `data`), or null when it holds none. */
function withReleaseLine(value: unknown, depth = 0): unknown {
	if (typeof value === "string") return `${RELEASE_LINE}\n\n${value}`;
	if (depth >= 6 || value === null || typeof value !== "object") return null;
	for (const [k, v] of Object.entries(value)) {
		const marked = withReleaseLine(v, depth + 1);
		if (marked === null) continue;
		if (Array.isArray(value)) return value.map((x, i) => (String(i) === k ? marked : x));
		return { ...value, [k]: marked };
	}
	return null;
}

export default function ompDocsFirstRow(pi: GatesAPI, env: Record<string, string | undefined> = process.env, deps: DocsFirstDeps = {}): void {
	const start = (s: GateSession, ctx: Ctx, text: string) => {
		const judge = deps.judge;
		questions.set(s, new OmpQuestion(text, judge && (() => judge(ctx)), deps.timeoutMs));
	};
	const logRelease = (q: OmpQuestion, why: string, at: string) => {
		pi.appendEntry(RELEASE_LOG, { released: true, holds: q.holds, at, trigger: why });
	};

	pi.on("input", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role !== "hand" && (event.source === "interactive" || event.source === "rpc")) start(s, ctx, event.text);
		return undefined;
	});

	pi.on("before_agent_start", (event, ctx) => {
		const s = gateSession(ctx, env);
		if (s.role === "hand" && !questions.has(s)) start(s, ctx, event.prompt);
		return undefined;
	});

	pi.on("tool_result", (event, ctx) => {
		const q = questions.get(gateSession(ctx, env));
		if (q && consultsOmp(event.toolName, event.input, event.details, event.isError)) q.consulted = true;
		return undefined;
	});

	pi.on("tool_call", async (event, ctx) => {
		const s = gateSession(ctx, env);
		const q = questions.get(s);
		if (!q) return undefined;
		const boundary = s.role === "hand" ? (event.toolName === "yield" ? "yield" : null) : outwardTool(event.toolName, event.input);
		if (!boundary) return undefined;
		const a = await q.attempt();
		if (a.kind === "hold") return { block: true, reason: a.reason };
		if (a.kind === "pass") return undefined;
		logRelease(q, a.why, boundary);
		if (s.role !== "hand") return undefined;
		// A hand's yield carries the line in its report, on `data` first, else on `error`.
		const data = withReleaseLine(event.input.data);
		const error = data === null ? withReleaseLine(event.input.error) : null;
		if (data === null && error === null) return undefined;
		q.releaseShown = true;
		return { input: data !== null ? { ...event.input, data } : { ...event.input, error } };
	});

	pi.on("assistant_message", async (event, ctx) => {
		const s = gateSession(ctx, env);
		const q = questions.get(s);
		const content = event.message.content;
		if (!q || s.role === "hand" || !Array.isArray(content) || content.some((p) => p.type === "toolCall")) return undefined;
		const draft = messageText(event.message);
		const a = await q.attempt();
		if (a.kind === "release") logRelease(q, a.why, "reply");
		if (a.kind !== "hold") {
			if (!q.released || q.releaseShown) return undefined;
			const first = content.findIndex((p) => p.type === "text");
			if (first < 0) return undefined;
			q.releaseShown = true;
			return { content: content.map((p, i) => (i !== first ? p : { ...p, text: `#### ${RELEASE_LINE}\n\n${p.text ?? ""}` })) };
		}
		q.draft = draft;
		if (q.markerShown) return { content: content.map((p) => (p.type !== "text" ? p : { ...p, text: LATER_HOLD })) };
		q.markerShown = true;
		const first = content.findIndex((p) => p.type === "text");
		return { content: content.map((p, i) => (p.type !== "text" ? p : { ...p, text: i === first ? HELD_MARKER : "" })) };
	});

	pi.on("session_stop", async (event, ctx) => {
		const s = gateSession(ctx, env);
		const q = questions.get(s);
		if (!q || s.role === "hand") return undefined;
		const draft = q.draft;
		q.draft = null;
		if (draft !== null) {
			// Held at assistant_message; nothing can be read between it and this stop.
			return (await q.holding()) ? { decision: "block", reason: `${q.reason}\n\nYour held reply was:\n\n${draft}` } : undefined;
		}
		// A reply assistant_message did not see (a host or a message shape it skips): its attempt counts here.
		const a = await q.attempt();
		if (a.kind === "release") logRelease(q, a.why, "stop");
		return a.kind === "hold" ? { decision: "block", reason: a.reason } : undefined;
	});
}
