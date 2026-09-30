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
//     steps: [ { tool, args } | { sleepMs } | { exit: code } | { hang: true } ],
//     ignoreAbort?: true,          keep running after an abort frame (the runner's kill path)
//     shutdownOnTerm?: false }     SIGTERM exits without session_shutdown (default: shutdown, like EOF)
// Record (JSONL appended at $FAKE_OMP_RECORD): { pid, argv, cwd, env: { AGENT_SYSTEM_*, OMP_PROFILE }, session, resumed }
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import orchestratorSurface from "../index";
import { ctxOf, fakePi } from "./helpers";

interface Script {
	claim?: boolean;
	noSession?: boolean;
	steps?: ({ tool: string; args: Record<string, unknown> } | { sleepMs: number } | { exit: number } | { hang: true })[];
	ignoreAbort?: boolean;
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
const session = join(sessionDir, `${new Date().toISOString().replace(/[:.]/g, "-")}_${process.pid}.jsonl`);
writeFileSync(session, resumed && existsSync(resumed) ? `${readFileSync(resumed, "utf8")}{"type":"resumed","from":${JSON.stringify(resumed)}}\n` : "");
if (process.env.FAKE_OMP_RECORD) {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined && (k.startsWith("AGENT_SYSTEM_") || k === "OMP_PROFILE")) env[k] = v;
	appendFileSync(process.env.FAKE_OMP_RECORD, `${JSON.stringify({ pid: process.pid, argv, cwd: process.cwd(), env, session, resumed })}\n`);
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
		const r = await f.tool(step.tool).execute(`c${Date.now()}`, step.args, undefined, undefined, ctx);
		appendFileSync(session, `${JSON.stringify({ type: "tool", tool: step.tool, text: r.content[0]?.text ?? "" })}\n`);
		if (ctx.shutdowns.length > 0) break;
	}
	clearTimeout(deadline);
	if (!aborted) result("completed");
	if (ctx.shutdowns.length > 0) await shutdown();
};

process.on("SIGTERM", () => {
	if (script.shutdownOnTerm === false) process.exit(143);
	void shutdown();
});
process.on("SIGINT", () => void shutdown());

const reader = Bun.stdin.stream().getReader();
const decoder = new TextDecoder();
let buf = "";
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
			emit({ id: o.id, type: "response", command: "get_state", success: true, data: script.noSession ? { model: { id: "fake" } } : { model: { id: "fake" }, sessionFile: session, sessionId: String(process.pid) } });
		} else if (o.type === "prompt") {
			promptId = typeof o.id === "string" ? o.id : null;
			emit({ id: o.id, type: "response", command: "prompt", success: true });
			void runPrompt(String(o.message ?? ""));
		} else if (o.type === "abort") {
			emit({ id: o.id, type: "response", command: "abort", success: true });
			if (!script.ignoreAbort && !aborted && started > 0) {
				aborted = true;
				result("aborted");
			}
		}
	}
}
await shutdown();
