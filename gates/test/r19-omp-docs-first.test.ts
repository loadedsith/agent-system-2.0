// P-11 row 19, "OMP questions read OMP first" (PLAN wl-mv8k0fby51uakg D9, in-mv90pa1iolasjk; jo-issues#55),
// through the whole gate chain: p11Gates over a fake runner that chains handlers the way OMP 18.8.6's
// does (extensibility/extensions/runner.ts): `tool_call` stops at the first block and otherwise keeps the
// last result, `assistant_message` hands each handler the previous rewrite, `session_stop` returns the
// first result any handler gives (emit), `input` stops at the first `handled`, `before_agent_start`
// threads the system prompt. The judge is a fake standing in for OMP's `judge` role, in the shape
// classifier/src/judge-ask.ts askJudgment sends it (`noul` for a bool question).
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { JudgmentJudge } from "../../classifier/src/judge-ask";
import { Ledger } from "../../ledger/src/index";
import ompDocsFirstRow, { RELEASE_LOG } from "../extensions/r19-omp-docs-first";
import p11Gates from "../index";
import type { FenceSettings } from "../src/fence";
import { checkTurnShape } from "../src/rows/r01-turn-shape";
import { consultsOmp, HELD_MARKER, HOLD_LIMIT, KEYWORDS, keywordHit, QUESTION_CAP, RELEASE_LINE } from "../src/rows/r19-omp-docs-first";
import type { GatesAPI } from "../src/session";
import { CERTIFIED, tmp } from "./helpers";

type AnyHandler = (event: Record<string, unknown>, ctx: unknown) => unknown;
type Block = { type: string; text?: string; [k: string]: unknown };
type Result = { block?: boolean; reason?: string; decision?: string; input?: Record<string, unknown>; handled?: boolean; content?: Block[] } | undefined;

const OFF: FenceSettings = { enabled: false, autoBackground: true };

interface FakePi {
	pi: GatesAPI;
	emit(name: string, event: Record<string, unknown>, ctx: unknown): Promise<Result>;
	/** runner.ts emitAssistantMessage: each handler sees the previous rewrite; the final content. */
	reply(content: Block[], ctx: unknown): Promise<Block[]>;
	entries: { type: string; data: unknown }[];
}

function fakePi(): FakePi {
	const handlers = new Map<string, AnyHandler[]>();
	const entries: { type: string; data: unknown }[] = [];
	const pi = {
		on: (name: string, h: AnyHandler) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		getActiveTools: () => ["read", "yield"],
		getAllTools: () => [{ name: "read" }, { name: "yield" }],
		setActiveTools: async () => {},
		appendEntry: (type: string, data?: unknown) => entries.push({ type, data }),
		registerTool: () => {},
		zod: { object: () => ({}), string: () => ({ describe: () => ({}), optional: () => ({ describe: () => ({}) }) }) },
	};
	const emit = async (name: string, event: Record<string, unknown>, ctx: unknown): Promise<Result> => {
		const hs = handlers.get(name) ?? [];
		if (name === "before_agent_start") {
			let systemPrompt = event.systemPrompt as string[];
			for (const h of hs) {
				const r = (await h({ ...event, systemPrompt }, ctx)) as { systemPrompt?: string[] } | undefined;
				if (r?.systemPrompt) systemPrompt = r.systemPrompt;
			}
			return undefined;
		}
		let last: Result;
		for (const h of hs) {
			const r = (await h(event, ctx)) as Result;
			if (!r) continue;
			if (name === "session_stop") return r;
			last = r;
			if (r.block || r.handled) return r;
		}
		return last;
	};
	const reply = async (content: Block[], ctx: unknown): Promise<Block[]> => {
		let current = content;
		for (const h of handlers.get("assistant_message") ?? []) {
			const r = (await h({ type: "assistant_message", message: structuredClone({ role: "assistant", content: current }) }, ctx)) as Result;
			if (r?.content === undefined) continue;
			expect(r.content.map((b) => b.type)).toEqual(current.map((b) => b.type));
			current = r.content;
		}
		return current;
	};
	return { pi: pi as unknown as GatesAPI, emit, reply, entries };
}

type Role = "orchestrator" | "lane" | "hand";

/** A fake judge answering `yes` with probability `p`; `calls` keeps every request it got. */
function judgeSaying(p: number) {
	const calls: { state: unknown; questions: Record<string, unknown> }[] = [];
	const judge = async (): Promise<JudgmentJudge> => ({
		judge: async (request) => {
			calls.push(request as (typeof calls)[number]);
			const key = Object.keys(request.questions)[0]!;
			return { answers: { [key]: { noul: p } }, model: "jev-1.13.0", provider: "typesafe" };
		},
	});
	return Object.assign(judge, { calls });
}

const tmpLedgerDb = (): string => {
	const db = join(tmp("r19-ledger"), "ledger.db");
	Ledger.open(db, { create: true, backup: false, backupOnOpen: false }).close();
	return db;
};

interface Session {
	f: FakePi;
	ctx: SessionCtx;
}

/** One session of `role` under p11Gates with `judge` wired in. */
function session(role: Role, judge: ((ctx: unknown) => Promise<JudgmentJudge>) | undefined): Session {
	const home = tmp("r19-home");
	const env: Record<string, string | undefined> = { HOME: home, AGENT_SYSTEM_CONTRACT: "/nonexistent", AGENT_SYSTEM_LEDGER_DB: tmpLedgerDb() };
	if (role === "orchestrator") env.AGENT_SYSTEM_ROLE = "orchestrator";
	const f = fakePi();
	p11Gates(f.pi, env, async () => OFF, CERTIFIED, undefined, judge as never);
	return { f, ctx: ctxOf(role, home) };
}

interface SessionCtx {
	hasUI: boolean;
	cwd: string;
	sessionManager: { getHeader(): { parentSession: string } | null; getEntries(): never[] };
	ui: { notify(): undefined };
}

function ctxOf(role: Role, cwd: string): SessionCtx {
	return {
		hasUI: role === "orchestrator",
		cwd,
		sessionManager: { getHeader: () => (role === "hand" ? { parentSession: "/sessions/lane.jsonl" } : null), getEntries: () => [] },
		ui: { notify: () => undefined },
	};
}

const text = (t: string): Block => ({ type: "text", text: t });
const ANSWER = "**PMDW**\nUse the settings command.";
const SAID = (t: string) => ({ text: t, source: "interactive" as const });
const READ_SOURCE = { toolName: "read", toolCallId: "r1", input: { path: "/Users/x/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts:10-40" }, isError: false };
const ROW19 = "P-11 row 19 held this answer";

/** One final reply and the stop after it: the text Jo would see, and the stop's block reason (null when it ends). */
async function answer(s: Session, body = ANSWER): Promise<{ shown: string; stop: string | null }> {
	const shown = await s.f.reply([text(body)], s.ctx);
	const stop = await s.f.emit("session_stop", { last_assistant_message: { role: "assistant", content: shown } }, s.ctx);
	return { shown: shown.map((b) => b.text ?? "").join(""), stop: stop?.decision === "block" ? (stop.reason ?? "") : null };
}

describe("the trigger", () => {
	test("the keyword list is pinned and matches whole words only", () => {
		expect([...KEYWORDS]).toEqual(["omp", "oh-my-pi", "pi-coding-agent", "harness", "slash command", "/add-dir", "/collab", "/settings", "/login"]);
		for (const [said, hit] of [
			["How do I resume in OMP?", "omp"],
			["read omp://extensions.md", "omp"],
			["see OMP-RUNTIME.md", "omp"],
			["what does @oh-my-pi/pi-utils export", "oh-my-pi"],
			["the pi-coding-agent source", "pi-coding-agent"],
			["which Harness flag", "harness"],
			["list the slash commands", "slash command"],
			["is /add-dir sticky", "/add-dir"],
			["start /collab", "/collab"],
			["open /settings.", "/settings"],
			["/login again", "/login"],
		] as const) expect(keywordHit(said)).toBe(hit);
		for (const said of ["/compact", "compaction ran", "a compact summary", "prompt", "the a/settings file", "romp", "harnessing it"]) expect(keywordHit(said)).toBeNull();
	});

	test("a keyword hit holds the final text and session_stop, then passes after a successful read of an @oh-my-pi path", async () => {
		const judge = judgeSaying(0);
		const s = session("lane", judge);
		await s.f.emit("input", SAID("How do I open /settings in OMP?"), s.ctx);
		const held = await answer(s);
		expect(held.shown).toBe(HELD_MARKER);
		expect(held.stop).toContain(ROW19);
		for (const named of ["OMP-HARNESS.md", "OMP-RUNTIME.md", "omp://", "@oh-my-pi/"]) expect(held.stop).toContain(named);
		expect(held.stop).toContain(`Your held reply was:\n\n${ANSWER}`);
		await s.f.emit("before_agent_start", { prompt: "", systemPrompt: [] }, s.ctx);
		expect(await s.f.emit("tool_result", READ_SOURCE, s.ctx)).toBeUndefined();
		expect(await answer(s)).toEqual({ shown: ANSWER, stop: null });
		// A keyword triggers at once: the judge was never asked.
		expect(judge.calls).toHaveLength(0);
	});

	test("judge yes holds, judge no passes, and the question sent is capped", async () => {
		const yes = judgeSaying(0.9);
		const a = session("lane", yes);
		await a.f.emit("input", SAID("how do I make a session resumable?"), a.ctx);
		expect((await answer(a)).stop).toContain(ROW19);
		expect(yes.calls).toHaveLength(1);

		const no = judgeSaying(0.1);
		const b = session("lane", no);
		const long = `fix the flaky test ${"x".repeat(QUESTION_CAP * 2)}`;
		await b.f.emit("input", SAID(long), b.ctx);
		expect(await answer(b)).toEqual({ shown: ANSWER, stop: null });
		expect(String(no.calls[0]!.state).length).toBeLessThanOrEqual(QUESTION_CAP);
	});

	test("a judge that errors, cannot be resolved, or does not answer in time holds (fail closed)", async () => {
		const failing = async (): Promise<JudgmentJudge> => ({
			judge: async () => {
				throw new Error("no credential");
			},
		});
		const unresolved = async (): Promise<JudgmentJudge> => {
			throw new Error("no judge role");
		};
		for (const judge of [failing, unresolved]) {
			const s = session("lane", judge);
			await s.f.emit("input", SAID("tidy the README"), s.ctx);
			expect((await answer(s)).stop).toContain(ROW19);
		}
		// The timeout, on the row alone with a short bound: a judge that never answers.
		const f = fakePi();
		const silent = async (): Promise<JudgmentJudge> => ({ judge: () => Promise.withResolvers<never>().promise });
		ompDocsFirstRow(f.pi, { HOME: tmp("r19-home") }, { judge: silent, timeoutMs: 20 });
		const ctx = ctxOf("lane", tmp("r19-cwd"));
		await f.emit("input", SAID("tidy the README"), ctx);
		const shown = await f.reply([text(ANSWER)], ctx);
		expect(shown[0]!.text).toBe(HELD_MARKER);
		const stop = await f.emit("session_stop", { last_assistant_message: { role: "assistant", content: shown } }, ctx);
		expect(stop?.reason).toContain("did not answer within");
		// No judge wired at all into the row: every input counts.
		const g = fakePi();
		ompDocsFirstRow(g.pi, { HOME: tmp("r19-home") });
		await g.emit("input", SAID("tidy the README"), ctx);
		expect((await g.reply([text(ANSWER)], ctx))[0]!.text).toBe(HELD_MARKER);
	});

	test("a machinery input the judge rejects, with no keyword, passes; so do `compact` and `compaction`", async () => {
		for (const said of ["Resume slice sl-x: run the suite and report the counts.", "/compact", "the compaction ran; summarize what changed"]) {
			const s = session("lane", judgeSaying(0.05));
			await s.f.emit("input", { text: said, source: "rpc" }, s.ctx);
			expect(await answer(s)).toEqual({ shown: ANSWER, stop: null });
			expect(await s.f.emit("tool_call", { toolName: "lane_message", toolCallId: "m1", input: { body: "done" } }, s.ctx)).toBeUndefined();
		}
	});

	test("a session with no input yet is not held", async () => {
		const s = session("lane", judgeSaying(1));
		expect(await answer(s)).toEqual({ shown: ANSWER, stop: null });
	});
});

describe("what satisfies it", () => {
	test("an errored read does not satisfy; a successful one does", async () => {
		const s = session("lane", judgeSaying(0));
		await s.f.emit("input", SAID("what does omp --resume do"), s.ctx);
		await s.f.emit("tool_result", { ...READ_SOURCE, isError: true }, s.ctx);
		expect((await answer(s)).stop).toContain(ROW19);
		await s.f.emit("tool_result", { toolName: "read", toolCallId: "r2", input: { path: "omp://sessions.md" }, isError: false }, s.ctx);
		expect((await answer(s)).stop).toBeNull();
	});

	test("the path rule: omp:// docs, @oh-my-pi files and the two guides, by read, grep, find or search", () => {
		const ok = (toolName: string, input: Record<string, unknown>, details?: unknown) => consultsOmp(toolName, input, details, false);
		expect(ok("read", { path: "omp://extensions.md" })).toBe(true);
		expect(ok("read", { path: "profile/OMP-RUNTIME.md:20-60" })).toBe(true);
		expect(ok("read", { path: "/Users/x/.omp/profiles/agent-system-2/agent/OMP-HARNESS.md" })).toBe(true);
		expect(ok("read", { path: "omp://" }, { resolvedPath: "/x/@oh-my-pi/pi-coding-agent/docs/index.md" })).toBe(true);
		expect(ok("grep", { pattern: "resume", path: "src;omp://" })).toBe(true);
		expect(ok("find", { query: "resume", path: "/g/node_modules/@oh-my-pi/pi-coding-agent/src" })).toBe(true);
		expect(ok("search", { pattern: "x", path: "OMP-HARNESS.md" })).toBe(true);
		expect(ok("read", { path: "docs/OMP-HARNESS.md.bak" })).toBe(false);
		expect(ok("read", { path: "README.md" })).toBe(false);
		expect(ok("bash", { command: "cat omp://extensions.md" })).toBe(false);
		expect(ok("write", { path: "profile/OMP-RUNTIME.md" })).toBe(false);
		expect(consultsOmp("read", { path: "omp://extensions.md" }, undefined, true)).toBe(false);
	});
});

describe("what keeps and what resets the question", () => {
	test("a hidden continuation and a wake aside keep the state; a new input resets it", async () => {
		const s = session("orchestrator", judgeSaying(0.2));
		await s.f.emit("input", SAID("which omp flag skips the setup wizard?"), s.ctx);
		expect((await answer(s)).stop).toContain(ROW19);
		// The stop's hidden continuation, then a wake aside: turns with no `input`.
		await s.f.emit("before_agent_start", { prompt: "", systemPrompt: [] }, s.ctx);
		expect((await answer(s)).stop).toContain(ROW19);
		await s.f.emit("before_agent_start", { prompt: "## needs you\n- nothing", systemPrompt: [] }, s.ctx);
		expect((await answer(s)).stop).toContain(ROW19);
		// Jo's next input is a new question; the judge says it is not about OMP.
		await s.f.emit("input", SAID("ship the PR"), s.ctx);
		expect(await answer(s)).toEqual({ shown: ANSWER, stop: null });
	});

	test("a lane's rpc input resets; an extension-sourced input does not", async () => {
		const s = session("lane", judgeSaying(0));
		await s.f.emit("input", { text: "what does the harness do on /login", source: "rpc" }, s.ctx);
		await s.f.emit("input", { text: "ignored", source: "extension" }, s.ctx);
		expect((await answer(s)).stop).toContain(ROW19);
		await s.f.emit("input", { text: "run the tests", source: "rpc" }, s.ctx);
		expect((await answer(s)).stop).toBeNull();
	});
});

describe("the answer boundaries", () => {
	test("a hand's yield is refused twice, then passes after a read; its later prompts keep the question", async () => {
		const s = session("hand", judgeSaying(0));
		await s.f.emit("before_agent_start", { prompt: "Explain how OMP binds extensions into subagents.", systemPrompt: [] }, s.ctx);
		const yieldCall = { toolName: "yield", toolCallId: "y", input: { data: { report: "**PMDW**\nDone." } } };
		const first = await s.f.emit("tool_call", yieldCall, s.ctx);
		expect(first?.block).toBe(true);
		expect(first?.reason).toContain(ROW19);
		await s.f.emit("before_agent_start", { prompt: "You must call yield.", systemPrompt: [] }, s.ctx);
		expect((await s.f.emit("tool_call", yieldCall, s.ctx))?.block).toBe(true);
		await s.f.emit("tool_result", { toolName: "grep", toolCallId: "g", input: { pattern: "bindPreparedExtensions", path: "/g/node_modules/@oh-my-pi/pi-coding-agent/src" }, isError: false }, s.ctx);
		expect((await s.f.emit("tool_call", yieldCall, s.ctx))?.block).toBeUndefined();
	});

	test("a hand whose task the judge rejects yields freely", async () => {
		const s = session("hand", judgeSaying(0.1));
		await s.f.emit("before_agent_start", { prompt: "Rename foo to bar in src/x.ts.", systemPrompt: [] }, s.ctx);
		expect((await s.f.emit("tool_call", { toolName: "yield", toolCallId: "y", input: { data: { report: "**PMDW**\nDone." } } }, s.ctx))?.block).toBeUndefined();
	});

	test("an outward tool is refused while held, by name and as its xd:// device; other tools pass", async () => {
		const lane = session("lane", judgeSaying(0));
		await lane.f.emit("input", SAID("how do slash commands reach an rpc lane?"), lane.ctx);
		expect(await lane.f.emit("tool_call", { toolName: "read", toolCallId: "r", input: { path: "README.md" } }, lane.ctx)).toBeUndefined();
		for (const call of [
			{ toolName: "lane_message", toolCallId: "m", input: { body: "answer" } },
			{ toolName: "lane_raise_question", toolCallId: "q", input: { slice: "sl-1", body: "x?", options: ["a", "b"] } },
			{ toolName: "write", toolCallId: "w", input: { path: "xd://lane_message", content: "{}" } },
		]) {
			const r = await lane.f.emit("tool_call", call, lane.ctx);
			expect(r?.block).toBe(true);
			expect(r?.reason).toContain(ROW19);
		}
		await lane.f.emit("tool_result", { toolName: "read", toolCallId: "r2", input: { path: "omp://rpc.md" }, isError: false }, lane.ctx);
		expect(await lane.f.emit("tool_call", { toolName: "lane_message", toolCallId: "m2", input: { body: "answer" } }, lane.ctx)).toBeUndefined();

		const ilex = session("orchestrator", judgeSaying(0));
		await ilex.f.emit("input", SAID("what is omp's /collab?"), ilex.ctx);
		for (const toolName of ["orchestrator_reply", "orchestrator_raise_question"]) {
			const r = await ilex.f.emit("tool_call", { toolName, toolCallId: toolName, input: { to: "plumb", body: "x", i: "x" } }, ilex.ctx);
			expect(r?.block).toBe(true);
			expect(r?.reason).toContain(ROW19);
		}
	});
});

describe("row 1 and row 19 together", () => {
	const ROW1 = "P-11 row 1 refused this turn to Jo";
	const malformed = "**PMDW**\nDone. Do you want the PR now, or should I wait?\nZEBRA-7Q";
	test("row 19 holds first, so row 1 never judges a held draft; after the read row 1 judges the rewrite alone", async () => {
		const s = session("orchestrator", judgeSaying(0));
		await s.f.emit("input", SAID("does omp keep my settings per profile?"), s.ctx);
		const r19 = await answer(s, malformed);
		expect(r19.shown).toBe(HELD_MARKER);
		expect(r19.stop).toContain(ROW19);
		expect(r19.stop).toContain("hold 1 of");
		expect(r19.stop).not.toContain(ROW1);
		expect(r19.stop).toEndWith(`Your held reply was:\n\n${malformed}`);
		await s.f.emit("before_agent_start", { prompt: "", systemPrompt: [] }, s.ctx);
		await s.f.emit("tool_result", { toolName: "read", toolCallId: "r", input: { path: "profile/OMP-HARNESS.md" }, isError: false }, s.ctx);
		// Row 1's own loop: two refusals, each row 1's alone, and row 19 counts none of them.
		for (let i = 0; i < 2; i++) {
			const r1 = await answer(s, malformed);
			expect(r1.shown).toBe(i === 0 ? "(Reply held by P-11 row 1. The corrected reply follows.)" : "…");
			expect(r1.stop).toStartWith(ROW1);
			expect(r1.stop).not.toContain(ROW19);
			await s.f.emit("before_agent_start", { prompt: "", systemPrompt: [] }, s.ctx);
		}
		expect(await answer(s)).toEqual({ shown: ANSWER, stop: null });
	});

	test("a lane: row 19's hold ends on row 19's reason, the rewrite after the read on row 1's", async () => {
		const s = session("lane", judgeSaying(0));
		await s.f.emit("input", { text: "how does the omp rpc mode end a turn?", source: "rpc" }, s.ctx);
		const held = await answer(s, malformed);
		expect(held.stop).toContain(ROW19);
		expect(held.stop).not.toContain(ROW1);
		await s.f.emit("tool_result", { toolName: "read", toolCallId: "r", input: { path: "omp://rpc.md" }, isError: false }, s.ctx);
		const r1 = await answer(s, malformed);
		expect(r1.stop).toStartWith(ROW1);
		expect(r1.stop).not.toContain(ROW19);
	});

	test("row 19's marker, its later holds and its release line pass row 1, for the orchestrator and a lane", () => {
		const released = `#### ${RELEASE_LINE}\n\n## Needs you\n- nothing\n\n**QUESTION**\nShip it today? Options: yes / no\n\nNothing else waiting.`;
		for (const role of ["orchestrator", "lane"] as const) {
			expect(checkTurnShape(HELD_MARKER, role)).toBeNull();
			expect(checkTurnShape("…", role)).toBeNull();
			expect(checkTurnShape(released, role)).toBeNull();
		}
	});
});

describe("the loop guard", () => {
	test(`final text: ${HOLD_LIMIT} holds, then the reply goes through with the release line, logged`, async () => {
		const s = session("lane", judgeSaying(0));
		await s.f.emit("input", SAID("explain the omp extension runner"), s.ctx);
		for (let i = 1; i <= HOLD_LIMIT; i++) {
			const r = await answer(s);
			expect(r.shown).toBe(i === 1 ? HELD_MARKER : "…");
			expect(r.stop).toContain(`hold ${i} of ${HOLD_LIMIT}`);
			await s.f.emit("before_agent_start", { prompt: "", systemPrompt: [] }, s.ctx);
		}
		const last = await answer(s);
		expect(last.stop).toBeNull();
		expect(last.shown).toBe(`#### ${RELEASE_LINE}\n\n${ANSWER}`);
		expect(RELEASE_LINE).toBe(`row 19: released after ${HOLD_LIMIT} holds without an OMP read`);
		expect(s.f.entries.filter((e) => e.type === RELEASE_LOG)).toHaveLength(1);
		// Released for this question: later replies pass untouched.
		expect(await answer(s)).toEqual({ shown: ANSWER, stop: null });
	});

	test(`a hand's yield: ${HOLD_LIMIT} refusals, then it goes through carrying the release line, logged`, async () => {
		const s = session("hand", judgeSaying(0));
		await s.f.emit("before_agent_start", { prompt: "What does /add-dir change?", systemPrompt: [] }, s.ctx);
		const yieldCall = { toolName: "yield", toolCallId: "y", input: { data: { report: "**PMDW**\nDone.", n: 3 } } };
		for (let i = 1; i <= HOLD_LIMIT; i++) expect((await s.f.emit("tool_call", yieldCall, s.ctx))?.reason).toContain(`hold ${i} of ${HOLD_LIMIT}`);
		const passed = await s.f.emit("tool_call", yieldCall, s.ctx);
		expect(passed?.block).toBeUndefined();
		expect(passed?.input).toEqual({ data: { report: `${RELEASE_LINE}\n\n**PMDW**\nDone.`, n: 3 } });
		expect(s.f.entries.filter((e) => e.type === RELEASE_LOG)).toHaveLength(1);
	});
});
