#!/usr/bin/env bun
// The fake `omp` for the lane launcher's unit tests (DESIGN-lane-launcher.md § 8, "Fake-omp shim
// unit tests"): a shell shim named `omp` on PATH ahead of the real binary execs this file. It
// records argv, env and cwd, speaks the rpc frames the runner reads (measured on OMP 18.4.4 in
// ~/agent-scratch/agent-system-2.0/migration/M7/lane-launcher/verify/out: `ready` first, the
// `get_state` response with `data.sessionFile`, `agent_end` then `prompt_result` with status
// `completed` or `aborted` — an `abort` frame and `--max-time` both end with `aborted`), and
// drives the real lane rows (surface/extensions/lane.ts, lane-tools.ts) through the fake extension
// API, so the lane's claim at session_start, its tools, and its session_shutdown release are the
// real code, not a copy.
//
// Script (JSON at $FAKE_OMP_SCRIPT):
//   { claim?: false,               skip session_start (an extension that did not load: never ready)
//     noSession?: true,            the get_state reply carries no sessionFile
//     steps: [ { tool, args } | { sleepMs } | { exit: code } | { hang: true } | { result: "aborted" | "error" }
//              | { usage: { usd, tokens }, hand? } ],
//                                an arg value "$slice" is the id the newest tool result named (lane_add_slice mints it);
//                                a usage step appends one assistant message with that usage (usage.cost.total,
//                                usage.totalTokens) to the session file, or with `hand` to <session>/<hand>.jsonl, where
//                                OMP writes a hand's session file (the runner's ceiling meter reads both)
//     ignoreAbort?: true,          keep running after an abort frame (the runner's kill path)
//     ignoreEof?: true,            keep running after stdin EOF too (the runner's bounded SIGKILL, B4)
//     ignoreTerm?: true,           record SIGTERM and keep running (a child the by-hand stop must escalate on, review 2 R1)
//     stateOnAbort?: true,         hold the get_state reply until an abort frame arrives (a late session record, review 2 R5)
//     eofDelayMs?: n,              wait n ms between stdin EOF and the shutdown (the runner's late writes land first)
//     shutdownOnTerm?: false }     SIGTERM exits without session_shutdown (default: shutdown, like EOF)
// Record (JSONL appended at $FAKE_OMP_RECORD): { pid, argv, cwd, env: { AGENT_SYSTEM_*, OMP_PROFILE }, session, resumed }
// at start, then { pid, event } for each frame or signal seen: prompt, abort, eof, sigterm, sigint.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import orchestratorSurface from "../index";
import { ctxOf, fakePi } from "./helpers";

interface Script {
	claim?: boolean;
	noSession?: boolean;
	steps?: ({ tool: string; args: Record<string, unknown> } | { sleepMs: number } | { exit: number } | { hang: true } | { result: string } | { usage: { usd: number; tokens: number }; hand?: string })[];
	ignoreAbort?: boolean;
	ignoreEof?: boolean;
	ignoreTerm?: boolean;
	stateOnAbort?: boolean;
	eofDelayMs?: number;
	shutdownOnTerm?: boolean;
}

const script: Script = process.env.FAKE_OMP_SCRIPT && existsSync(process.env.FAKE_OMP_SCRIPT) ? (JSON.parse(readFileSync(process.env.FAKE_OMP_SCRIPT, "utf8")) as Script) : { steps: [] };
const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
	const i = argv.indexOf(name);
	return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1]! : null;
};
const sessionDir = flag("--session-dir") ?? join(process.cwd(), "sessions");
const resumed = flag("--resume");
const maxTime = flag("--max-time");
mkdirSync(sessionDir, { recursive: true });
// `--resume <path>` appends to that same file, as OMP 18.4.4 does (`SessionManager.open(path, sessionDir)`): on workload
// wl-muolz8qtp6ylfk, relaunched lanes 2–5 each reported lane 1's sessionFile in get_state (their lane-started: entries),
// and the lane's --session-dir held that one top-level file. The ceiling meter's cumulative scan relies on it (a copy
// would count twice).
const session = resumed && existsSync(resumed) ? resumed : join(sessionDir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${process.pid}.jsonl`);
if (session === resumed) appendFileSync(session, `{"type":"resumed","from":${JSON.stringify(resumed)}}\n`);
else writeFileSync(session, "");
const recordLine = (o: Record<string, unknown>): void => {
	if (process.env.FAKE_OMP_RECORD) appendFileSync(process.env.FAKE_OMP_RECORD, `${JSON.stringify({ pid: process.pid, ...o })}\n`);
};
{
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined && (k.startsWith("AGENT_SYSTEM_") || k === "OMP_PROFILE")) env[k] = v;
	recordLine({ argv, cwd: process.cwd(), env, session, resumed });
}

const emit = (frame: Record<string, unknown>): void => {
	process.stdout.write(`${JSON.stringify(frame)}\n`);
};
const durationMs = (d: string | null): number | null => {
	const m = d ? /^(\d+)(ms|s|m|h)$/.exec(d) : null;
	if (!m) return null;
	const n = Number(m[1]);
	return m[2] === "ms" ? n : m[2] === "s" ? n * 1000 : m[2] === "m" ? n * 60_000 : n * 3_600_000;
};

const f = fakePi();
orchestratorSurface(f.pi, process.env, {});
const ctx = ctxOf({ cwd: process.cwd() });
let shutDown = false;
const shutdown = async (): Promise<void> => {
	if (shutDown) return;
	shutDown = true;
	await f.emit("session_shutdown", { type: "session_shutdown" }, ctx);
	appendFileSync(session, `{"type":"session_shutdown"}\n`);
	process.exit(0);
};

emit({ type: "ready", protocolVersion: 1, fake: true });
if (script.claim !== false) await f.emit("session_start", { type: "session_start" }, ctx);

let aborted = false;
let promptId: string | null = null;
let started = 0;
/** The slice the newest tool result named, for a step's "$slice" (a resumed lane keeps none: it names ids itself). */
let lastSlice = "";
const result = (status: string): void => {
	emit({ type: "agent_end", fake: true });
	emit({ type: "prompt_result", id: promptId, agentInvoked: true, status, sessionSettled: true });
};
const runPrompt = async (message: string): Promise<void> => {
	started = Date.now();
	appendFileSync(session, `${JSON.stringify({ type: "message", role: "user", text: message })}\n`);
	const limit = durationMs(maxTime);
	const deadline = setTimeout(() => {
		if (!aborted) {
			aborted = true;
			result("aborted");
		}
	}, limit ?? 2_147_483_647);
	for (const step of script.steps ?? []) {
		if (aborted) break;
		if ("exit" in step) process.exit(step.exit);
		if ("result" in step) {
			// The prompt ends with this status on omp's own account (a model error, an abort from elsewhere): no completed result follows.
			aborted = true;
			result(step.result);
			break;
		}
		if ("hang" in step) {
			await new Promise<void>((r) => {
				const t = setInterval(() => {
					if (aborted) {
						clearInterval(t);
						r();
					}
				}, 50);
			});
			continue;
		}
		if ("sleepMs" in step) {
			await Bun.sleep(step.sleepMs);
			continue;
		}
		if ("usage" in step) {
			const file = step.hand ? join(session.replace(/\.jsonl$/, ""), `${step.hand}.jsonl`) : session;
			mkdirSync(dirname(file), { recursive: true });
			appendFileSync(file, `${JSON.stringify({ type: "message", message: { role: "assistant", usage: { totalTokens: step.usage.tokens, cost: { total: step.usage.usd } } } })}\n`);
			continue;
		}
		const args = Object.fromEntries(Object.entries(step.args).map(([k, v]) => [k, v === "$slice" ? lastSlice : v]));
		const r = await f.tool(step.tool).execute(`c${Date.now()}`, args, undefined, undefined, ctx);
		const text = r.content[0]?.text ?? "";
		lastSlice = (/\bsl-[a-z0-9]+\b/.exec(text) ?? [])[0] ?? lastSlice;
		appendFileSync(session, `${JSON.stringify({ type: "tool", tool: step.tool, text })}\n`);
		if (ctx.shutdowns.length > 0) break;
	}
	clearTimeout(deadline);
	if (!aborted) result("completed");
	if (ctx.shutdowns.length > 0) await shutdown();
};

process.on("SIGTERM", () => {
	recordLine({ event: "sigterm" });
	if (script.ignoreTerm) return;
	if (script.shutdownOnTerm === false) process.exit(143);
	void shutdown();
});
process.on("SIGINT", () => {
	recordLine({ event: "sigint" });
	void shutdown();
});

const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let buf = "";
let heldState: Record<string, unknown> | null = null;
for (;;) {
	const { value, done } = await reader.read();
	if (done) break;
	buf += decoder.decode(value, { stream: true });
	for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
		const raw = buf.slice(0, nl);
		buf = buf.slice(nl + 1);
		if (!raw.trim()) continue;
		let o: Record<string, unknown>;
		try {
			o = JSON.parse(raw) as Record<string, unknown>;
		} catch {
			continue;
		}
		if (o.type === "get_state") {
			const reply = { id: o.id, type: "response", command: "get_state", success: true, data: script.noSession ? { model: { id: "fake" } } : { model: { id: "fake" }, sessionFile: session, sessionId: String(process.pid) } };
			if (script.stateOnAbort) heldState = reply;
			else emit(reply);
		} else if (o.type === "prompt") {
			recordLine({ event: "prompt" });
			promptId = typeof o.id === "string" ? o.id : null;
			emit({ id: o.id, type: "response", command: "prompt", success: true });
			void runPrompt(String(o.message ?? ""));
		} else if (o.type === "abort") {
			recordLine({ event: "abort" });
			if (heldState) emit(heldState);
			heldState = null;
			emit({ id: o.id, type: "response", command: "abort", success: true });
			if (!script.ignoreAbort && !aborted && started > 0) {
				aborted = true;
				result("aborted");
			}
		}
	}
}
recordLine({ event: "eof" });
if (script.ignoreEof) await new Promise<never>(() => undefined);
if (script.eofDelayMs) await Bun.sleep(script.eofDelayMs);
await shutdown();
