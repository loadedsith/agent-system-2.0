// The lane row (surface/extensions/lane.ts, M5 fix round 1): a bound lane claims its workload at
// session start and renews the lease; a takeover records the old holder's death first; shutdown
// with open work writes the lane-died row and releases; a leaked human prompt is a prompt-wait row
// until it resolves; a declared artifact command's bash results write the slice's outcomes. Every
// row is read back through errorLines, the way the surface reads it.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { errorLines } from "../src/errors";
import { openPromptWaits, artifactCommands } from "../src/signals";
import { ARTIFACT_TOOL, INSTRUCTION_POLL_MS, LANE_RELEASE_TOOL, LEASE_MS } from "../src/types";
import { ctxOf, fakePi, notices, timers, tmp } from "./helpers";

function laneEnv(over: Record<string, string> = {}) {
	const path = join(tmp("ledger"), "ledger.db");
	const ledger = Ledger.open(path, { create: true, backup: false, backupOnOpen: false });
	const wl = ledger.openWorkload({ by: "orch", brief: "Fix the feed header", stakes: "normal", mode: "autonomous" });
	const sl = ledger.addSlice({ by: "orch", workloadId: wl, task: "Move the header offset into a token", doneCondition: "bun test passes", inputs: "src/header.css" });
	const env = { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-a", HOME: "/nonexistent-home", ...over };
	return { ledger, wl, sl, env };
}
const messages = (ledger: Ledger, wl: string) => ledger.db.query<{ state: string; sender: string; recipient: string; slice_id: string | null; body: string }, [string]>("SELECT state, sender, recipient, slice_id, body FROM messages WHERE workload_id = ? ORDER BY rowid").all(wl);

describe("lane row: claim and lease (§ B3 item 4 writer)", () => {
	test("session_start claims the workload for the lane with the lease; the renewal timer and turn end extend it; the orchestrator and an unbound lane do nothing", async () => {
		timers.length = 0;
		const { ledger, wl, env } = laneEnv();
		const f = fakePi();
		orchestratorSurface(f.pi, env);
		const ctx = ctxOf();
		const before = Date.now();
		await f.emit("session_start", { type: "session_start" }, ctx);
		const w = ledger.workload(wl)!;
		expect(w.holder).toBe("lane-a");
		const until = Date.parse(w.holder_lease_until!);
		expect(until).toBeGreaterThanOrEqual(before + LEASE_MS - 1000);
		expect(until).toBeLessThanOrEqual(Date.now() + LEASE_MS + 1000);
		expect(timers).toHaveLength(1);
		expect(timers[0]!.ms).toBe(LEASE_MS / 3);
		// renewal moves the lease forward (the ledger stamps sqlite's clock: not before the first lease)
		timers[0]!.fn();
		expect(Date.parse(ledger.workload(wl)!.holder_lease_until!)).toBeGreaterThanOrEqual(until);
		await f.emit("agent_end", { willContinue: false }, ctx);
		expect(ledger.workload(wl)!.holder).toBe("lane-a");
		expect(errorLines(ledger).filter((l) => l.kind === "lane-died")).toEqual([]);

		// the orchestrator loading the same extension claims nothing
		timers.length = 0;
		const orch = fakePi();
		orchestratorSurface(orch.pi, { ...env, AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_WORKLOAD_ID: "", AGENT_SYSTEM_LANE_ID: "" });
		const other = laneEnv();
		await orch.emit("session_start", { type: "session_start" }, ctxOf());
		expect(other.ledger.workload(other.wl)!.holder).toBeNull();
		// a lane with no workload id claims nothing either
		const unbound = fakePi();
		orchestratorSurface(unbound.pi, { ...other.env, AGENT_SYSTEM_WORKLOAD_ID: "" });
		await unbound.emit("session_start", { type: "session_start" }, ctxOf());
		expect(other.ledger.workload(other.wl)!.holder).toBeNull();
	});

	test("a second lane taking over a lapsed lease records the first lane's death before the claim, so the death is surfaced once and the takeover is named", async () => {
		const { ledger, wl, env } = laneEnv({ AGENT_SYSTEM_LANE_ID: "lane-b" });
		// lane-a held it and died: a lease that lapsed in the past (the reclaim compares to sqlite's real now)
		ledger.db.query("UPDATE workloads SET holder = 'lane-a', holder_lease_until = '2026-09-01T11:00:00.000Z', rev = rev + 1 WHERE id = ?").run(wl);
		expect(errorLines(ledger).filter((l) => l.kind === "lane-died").map((l) => l.line)).toEqual([expect.stringContaining("lane lane-a on") ]);
		const f = fakePi();
		orchestratorSurface(f.pi, env);
		await f.emit("session_start", { type: "session_start" }, ctxOf());
		expect(ledger.workload(wl)!.holder).toBe("lane-b");
		const dead = errorLines(ledger).filter((l) => l.kind === "lane-died");
		expect(dead).toHaveLength(1);
		expect(dead[0]!.line).toContain("lane lane-a on");
		expect(dead[0]!.line).toContain("lease lapsed 2026-09-01T11:00:00.000Z");
		expect(dead[0]!.line).toContain("lane-b holds it now");
		expect(messages(ledger, wl).map((m) => [m.state, m.recipient, m.body.slice(0, 18)])).toEqual([["held", "orchestrator", "lane-died: lane-a:"]]);
		// a live lease held by another lane is not taken: the lane is told
		const rival = fakePi();
		notices.length = 0;
		orchestratorSurface(rival.pi, { ...env, AGENT_SYSTEM_LANE_ID: "lane-c" });
		await rival.emit("session_start", { type: "session_start" }, ctxOf());
		expect(ledger.workload(wl)!.holder).toBe("lane-b");
		expect(notices.some((n) => n.includes("held by lane-b under a live lease"))).toBe(true);
		expect(messages(ledger, wl)).toHaveLength(1);
	});

	test("session_shutdown with open work writes the lane-died row and releases the workload; with nothing open it only releases", async () => {
		const { ledger, wl, sl, env } = laneEnv();
		const f = fakePi();
		orchestratorSurface(f.pi, env);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		await f.emit("session_shutdown", { type: "session_shutdown" }, ctx);
		expect(ledger.workload(wl)!.holder).toBeNull();
		const dead = errorLines(ledger).filter((l) => l.kind === "lane-died");
		expect(dead).toHaveLength(1);
		expect(dead[0]!.line).toMatch(/^lane lane-a on wl-.* died: session shutdown at .* with 1 open slice\(s\), 1 open slice\(s\)$/);
		expect(messages(ledger, wl).map((m) => [m.sender, m.recipient, m.state])).toEqual([["lane-a", "orchestrator", "held"]]);

		const done = laneEnv();
		done.ledger.completeSlice(done.sl, { by: "lane-a", artifact: "bun test exit 0" });
		const g = fakePi();
		orchestratorSurface(g.pi, done.env);
		const gctx = ctxOf();
		await g.emit("session_start", { type: "session_start" }, gctx);
		await g.emit("session_shutdown", { type: "session_shutdown" }, gctx);
		expect(done.ledger.workload(done.wl)!.holder).toBeNull();
		expect(messages(done.ledger, done.wl)).toEqual([]);
		void sl;
	});
});

describe("lane row: leaked prompt (§ B3 item 5 writer)", () => {
	test("tool_approval_requested writes a prompt-wait row the surface renders as a question; tool_approval_resolved ends it", async () => {
		const { ledger, wl, sl, env } = laneEnv();
		const f = fakePi();
		orchestratorSurface(f.pi, env);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		await f.emit("tool_approval_requested", { sessionId: "s-1", toolCallId: "call-7", toolName: "bash", reason: "rm -rf build needs approval" }, ctx);
		const waits = openPromptWaits(ledger, wl);
		expect(waits).toHaveLength(1);
		expect(waits[0]).toMatchObject({ lane: "lane-a", toolName: "bash", toolCallId: "call-7", sessionId: "s-1", reason: "rm -rf build needs approval" });
		expect(messages(ledger, wl)[0]!.slice_id).toBe(sl);
		const q = errorLines(ledger).filter((l) => l.kind === "question");
		expect(q).toHaveLength(1);
		expect(q[0]!.line).toContain("lane lane-a on");
		expect(q[0]!.line).toContain("is blocked on a human prompt it should never open (bash, tool call call-7");
		expect(q[0]!.line).toContain("rm -rf build needs approval");
		await f.emit("tool_approval_resolved", { sessionId: "s-1", toolCallId: "call-7", toolName: "bash", approved: false, reason: "denied by Jo" }, ctx);
		expect(openPromptWaits(ledger, wl)).toEqual([]);
		expect(errorLines(ledger).filter((l) => l.kind === "question")).toEqual([]);
		expect(messages(ledger, wl).map((m) => m.body.slice(0, 16))).toEqual(["prompt-wait: bas", "prompt-resolved:"]);
		// a resolution with no wait behind it writes nothing
		await f.emit("tool_approval_resolved", { sessionId: "s-1", toolCallId: "call-8", toolName: "bash", approved: true }, ctx);
		expect(messages(ledger, wl)).toHaveLength(2);
	});

	test("an `ask` execution is a prompt wait until it ends; a wait still open at shutdown is ended by the shutdown", async () => {
		const { ledger, wl, env } = laneEnv();
		const f = fakePi();
		orchestratorSurface(f.pi, env);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		await f.emit("tool_execution_start", { toolName: "ask", toolCallId: "ask-1", args: { question: "Which token?" } }, ctx);
		expect(errorLines(ledger).filter((l) => l.kind === "question").map((l) => l.line)).toEqual([expect.stringContaining("(ask, tool call ask-1")]);
		await f.emit("tool_execution_end", { toolName: "ask", toolCallId: "ask-1", result: {}, isError: false }, ctx);
		expect(openPromptWaits(ledger, wl)).toEqual([]);
		await f.emit("tool_execution_start", { toolName: "ask", toolCallId: "ask-2", args: { question: "And this?" } }, ctx);
		expect(openPromptWaits(ledger, wl)).toHaveLength(1);
		await f.emit("session_shutdown", { type: "session_shutdown" }, ctx);
		expect(openPromptWaits(ledger, wl)).toEqual([]);
		expect(messages(ledger, wl).map((m) => m.body.split(":")[0])).toEqual(["prompt-wait", "prompt-resolved", "prompt-wait", "prompt-resolved", "lane-died"]);
		expect(messages(ledger, wl)[3]!.body).toContain("ended: the session shut down");
	});
});

describe("lane row: runtime artifact (§ B3 item 3 writer)", () => {
	test("slice_artifact declares the command; two failing results surface the line; a passing result clears it; another command is not the artifact", async () => {
		const { ledger, wl, sl, env } = laneEnv();
		const f = fakePi();
		orchestratorSurface(f.pi, env);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		const declare = f.tool(ARTIFACT_TOOL);
		expect((await declare.execute("d0", { slice: sl, command: "  " }, undefined, undefined, ctx)).content[0]!.text).toContain("nothing was declared");
		expect((await declare.execute("d0", { slice: "sl-nope", command: "bun test" }, undefined, undefined, ctx)).content[0]!.text).toContain("is not on workload");
		const r = await declare.execute("d1", { slice: sl, command: "bun test surface/test/render.test.ts" }, undefined, undefined, ctx);
		expect(r.content[0]!.text).toMatch(/^Declared the runtime artifact of sl-/);
		expect(artifactCommands(ledger, wl)).toEqual(new Map([[sl, "bun test surface/test/render.test.ts"]]));
		const result = (id: string, command: string, code: number) =>
			f.emit("tool_result", { toolName: "bash", toolCallId: id, input: { command }, details: code === 0 ? {} : { exitCode: code }, isError: code !== 0 }, ctx);
		await result("b1", "bun test surface/test/render.test.ts", 1);
		await result("b2", "ls", 1); // not the artifact
		expect(errorLines(ledger).filter((l) => l.kind === "artifact")).toEqual([]);
		await result("b3", "bun test surface/test/render.test.ts", 1);
		const lines = errorLines(ledger).filter((l) => l.kind === "artifact");
		expect(lines).toHaveLength(1);
		expect(lines[0]!.line).toContain(`slice ${sl} (${wl}) failed its runtime artifact 2 times`);
		await result("b4", "bun test surface/test/render.test.ts", 0);
		expect(errorLines(ledger).filter((l) => l.kind === "artifact")).toEqual([]);
		expect(messages(ledger, wl).map((m) => [m.slice_id, m.body.slice(0, 16)])).toEqual([[sl, "artifact-failed:"], [sl, "artifact-failed:"], [sl, "artifact-passed:"]]);
		// a background run has no outcome yet
		await f.emit("tool_result", { toolName: "bash", toolCallId: "b5", input: { command: "bun test surface/test/render.test.ts" }, details: { async: { id: "job-1" } }, isError: false }, ctx);
		expect(messages(ledger, wl)).toHaveLength(3);
		// a pass with no surfaced failures behind it writes nothing
		await result("b6", "bun test surface/test/render.test.ts", 0);
		expect(messages(ledger, wl)).toHaveLength(3);
		// the orchestrator cannot declare
		const orch = fakePi();
		orchestratorSurface(orch.pi, { ...env, AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_WORKLOAD_ID: "" });
		expect((await orch.tool(ARTIFACT_TOOL).execute("d2", { slice: sl, command: "x" }, undefined, undefined, ctxOf())).content[0]!.text).toContain("not a lane bound to a workload");
	});
});

describe("lane row: Jo's instructions reach the lane after its prompt was built", () => {
	const poll = () => timers.find((t) => t.ms === INSTRUCTION_POLL_MS)!;
	/** A started lane session: Jo's rows written through the surface, the before_agent_start messages and the pushes it receives. */
	async function lane(over: Record<string, string> = {}, before: string[] = []) {
		const { ledger, wl, env } = laneEnv(over);
		const jo = (body: string) => ledger.recordInstruction({ by: "orchestrator-surface", workloadId: wl, body, author: "jo", channel: "surface" });
		const written = before.map(jo);
		const f = fakePi();
		orchestratorSurface(f.pi, env);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		const start = async (prompt: string) => {
			const r = (await f.emit("before_agent_start", { prompt, systemPrompt: [] }, ctx)) as { messages: { customType: string; content: string }[] };
			return r.messages.filter((m) => m.customType === "lane-instructions");
		};
		const pushed = () => f.sent.filter((s) => s.message.customType === "lane-instructions");
		const toolResult = (toolName: string, id: string) => f.emit("tool_result", { toolName, toolCallId: id, input: toolName === "bash" ? { command: "ls" } : {}, isError: false }, ctx);
		return { ledger, wl, f, ctx, jo, written, start, pushed, toolResult };
	}

	test("an instruction written after the prompt was built (wl-muonhgx992outc) comes back at before_agent_start; one the prompt carries is not repeated", async () => {
		timers.length = 0;
		const l = await lane({}, ["proof script goes to Plumb, not Jo"]);
		const inPrompt = l.written[0]!;
		const late = l.jo("ledger note for Plumb,\nno message to Jo");
		const owed = await l.start(`Resume ${l.wl}. Jo's instructions:\n- ${inPrompt} (…): proof script goes to Plumb, not Jo`);
		expect(owed).toHaveLength(1);
		expect(owed[0]!.content).toContain(`Jo's instructions on ${l.wl} not in your prompt`);
		expect(owed[0]!.content).toContain(`- ${late} (`);
		expect(owed[0]!.content).toContain("ledger note for Plumb, no message to Jo");
		expect(owed[0]!.content).not.toContain(inPrompt);
		// both are handed over now: neither is pushed again
		poll().fn();
		await l.toolResult("read", "r1");
		expect(l.pushed()).toEqual([]);
		// a prompt that already names every row gets no message
		const g = await lane({ AGENT_SYSTEM_LANE_ID: "lane-b" }, ["one", "two"]);
		expect(await g.start(`instructions: ${g.written.join(", ")}`)).toEqual([]);
	});

	test("a Jo row written mid-run is pushed once as an aside on the poll or the next tool result; an orchestrator-authored row never is", async () => {
		timers.length = 0;
		const l = await lane();
		await l.start(`Work ${l.wl}.`);
		expect(poll()).toBeDefined();
		const first = l.jo("stop after the token move");
		l.ledger.recordInstruction({ by: "orchestrator-surface", workloadId: l.wl, body: "orchestrator's own note", author: "orchestrator", channel: "surface" });
		poll().fn();
		expect(l.pushed()).toHaveLength(1);
		expect(l.pushed()[0]!.options).toEqual({ deliverAs: "aside", triggerTurn: true });
		expect(l.pushed()[0]!.message.display).toBe(true);
		expect(l.pushed()[0]!.message.content).toContain(`New instruction(s) from Jo on ${l.wl} since your last turn`);
		expect(l.pushed()[0]!.message.content).toContain(`- ${first} (`);
		expect(l.pushed()[0]!.message.content).not.toContain("orchestrator's own note");
		poll().fn();
		await l.toolResult("bash", "b1");
		expect(l.pushed()).toHaveLength(1);
		// the next one lands on a tool result of any tool, before the poll fires
		const second = l.jo("and skip the docs");
		await l.toolResult("read", "r1");
		expect(l.pushed()).toHaveLength(2);
		expect(l.pushed()[1]!.message.content).toContain(`- ${second} (`);
		expect(l.pushed()[1]!.message.content).not.toContain(first);
		poll().fn();
		expect(l.pushed()).toHaveLength(2);
	});

	test("nothing is pushed before the first prompt starts, and nothing after the lane releases", async () => {
		timers.length = 0;
		const l = await lane();
		const early = l.jo("written before the first prompt");
		await l.toolResult("read", "r0");
		expect(l.pushed()).toEqual([]);
		expect(poll()).toBeUndefined();
		// the row is owed at before_agent_start instead
		expect((await l.start("go")).map((m) => m.content).join("\n")).toContain(early);
		const handle = timers.indexOf(poll()) + 1;
		const released = await l.f.tool(LANE_RELEASE_TOOL).execute("rel", {}, undefined, undefined, l.ctx);
		expect(released.content[0]!.text).toContain(`Released ${l.wl}`);
		expect(l.ctx.cleared).toContain(handle);
		l.jo("too late");
		poll().fn();
		await l.toolResult("read", "r1");
		expect(l.pushed()).toEqual([]);
		expect(await l.start("again")).toEqual([]);
	});
});
