// The OMP adapter (surface/index.ts) driven by a fake extension API: role detection (only a
// top-level AGENT_SYSTEM_ROLE=orchestrator session is a surface), the wake cycle (render as the
// first message at start and after compaction, voice document in the system prompt, wake-read
// owed and enforced on tool calls and at stop), Jo's one-word input applied and shown next turn,
// and the identity / open / close / schedule tools.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { STANDING_WORKLOAD_ID, SURFACE_BY as SURFACE } from "../src/types";
import { ctxOf, fakePi, notices, tmp } from "./helpers";

function env(over: Record<string, string> = {}): Record<string, string> {
	const voice = join(tmp("voice"), "VOICE.md");
	writeFileSync(voice, "VOICE DOC BODY");
	const e = { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: join(tmp("ledger"), "ledger.db"), AGENT_SYSTEM_VOICE: voice, HOME: "/nonexistent-home", ...over };
	Ledger.open(e.AGENT_SYSTEM_LEDGER_DB, { create: true, backup: false, backupOnOpen: false }).close(); // the install script's job; the surface never creates one
	return e;
}
const open = (e: Record<string, string>) => Ledger.open(e.AGENT_SYSTEM_LEDGER_DB!, { create: true, backup: false, backupOnOpen: false });
type Started = { systemPrompt: string[]; messages: { customType: string; content: string }[] };

describe("surface extension adapter", () => {
	test("a lane or a hand loading the surface gets inert handlers and inert tools", async () => {
		const f = fakePi();
		const e = env({ AGENT_SYSTEM_ROLE: "lane" });
		orchestratorSurface(f.pi, e);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		const started = (await f.emit("before_agent_start", { prompt: "go", systemPrompt: ["base"] }, ctx)) as Started;
		expect(started.systemPrompt).toEqual(["base"]);
		expect(started.messages).toEqual([]);
		expect(await f.emit("tool_call", { toolName: "bash", input: {} }, ctx)).toBeUndefined();
		const r = await f.tool("orchestrator_identity").execute("1", { name: "X", pronouns: "it" }, undefined, undefined, ctx);
		expect(r.content[0]!.text).toContain("not the orchestrator surface");
		// a hand: top-level role env set but a parent session and no UI
		const hand = ctxOf({ hasUI: false, parent: "/s/lane.jsonl" });
		orchestratorSurface(fakePi().pi, env());
		expect((await f.emit("before_agent_start", { prompt: "go", systemPrompt: ["base"] }, hand) as Started).messages).toEqual([]);
	});

	test("wake at session start: ledger rendered as the first message, voice doc in the system prompt, wake read owed then satisfied", async () => {
		const f = fakePi();
		const e = env();
		const ledger = open(e);
		const wl = ledger.openWorkload({ by: "lane-a", brief: "Fix the feed header", stakes: "normal", mode: "autonomous" });
		const sl = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "t", doneCondition: "d", inputs: "a.ts" });
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Which?", options: ["left", "right"] });
		ledger.close();
		orchestratorSurface(f.pi, e);
		expect(f.registered().sort()).toEqual([
			"lane_add_slice", "lane_complete_slice", "lane_handoff", "lane_message", "lane_raise_question", "lane_record_entry", "lane_release",
			"orchestrator_close_workload", "orchestrator_identity", "orchestrator_launch_lane", "orchestrator_ledger", "orchestrator_lower_ceiling", "orchestrator_open_workload", "orchestrator_record_instruction", "orchestrator_schedule", "orchestrator_wake_read", "slice_artifact",
		]);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		const started = (await f.emit("before_agent_start", { prompt: "hi", systemPrompt: ["base"] }, ctx)) as Started;
		expect(started.systemPrompt[0]).toBe("base");
		expect(started.systemPrompt.join("\n")).toContain("VOICE DOC BODY");
		expect(started.messages).toHaveLength(1);
		const wake = started.messages[0]!;
		expect(wake.customType).toBe("surface-wake");
		expect(wake.content).toMatch(/^# Ledger at .* \(wake: session-start\)/);
		expect(wake.content).toContain("## needs you");
		expect(wake.content).toContain(`${q}, slice ${sl}): Which? — answer with one word: left / right`);
		expect(wake.content).toContain("no identity row yet");
		expect(wake.content).toContain("owes one wake-read entry");
		// owed: other tools refused, stop blocked, the wake-read tool allowed
		const refused = (await f.emit("tool_call", { toolName: "bash", input: { command: "ls" } }, ctx)) as { block: boolean; reason: string };
		expect(refused.block).toBe(true);
		expect(refused.reason).toContain("orchestrator_wake_read");
		expect((await f.emit("session_stop", {}, ctx)) as { decision: string }).toMatchObject({ decision: "block" });
		expect(await f.emit("tool_call", { toolName: "orchestrator_wake_read", input: {} }, ctx)).toBeUndefined();
		const empty = await f.tool("orchestrator_wake_read").execute("1", { body: "  " }, undefined, undefined, ctx);
		expect(empty.content[0]!.text).toContain("nothing was recorded");
		const r = await f.tool("orchestrator_wake_read").execute("1", { body: `resuming ${wl}: one open question ${q}` }, undefined, undefined, ctx);
		expect(r.content[0]!.text).toMatch(/^Recorded wake-read entry en-/);
		expect(await f.emit("tool_call", { toolName: "bash", input: { command: "ls" } }, ctx)).toBeUndefined();
		expect(await f.emit("session_stop", {}, ctx)).toBeUndefined();
		const check = open(e);
		expect(check.entries(STANDING_WORKLOAD_ID, "wake-read").map((x) => x.body)).toEqual([`resuming ${wl}: one open question ${q}`]);
		check.close();
		// a second turn without a trigger: voice doc still injected, no wake message
		const second = (await f.emit("before_agent_start", { prompt: "next", systemPrompt: ["base"] }, ctx)) as Started;
		expect(second.messages).toEqual([]);
		expect(second.systemPrompt.join("\n")).toContain("VOICE DOC BODY");
	});

	test("compaction re-renders and re-owes the wake read; a resumed session wakes as restart", async () => {
		const f = fakePi();
		const e = env();
		orchestratorSurface(f.pi, e);
		const ctx = ctxOf({ resumed: true });
		await f.emit("session_start", { type: "session_start" }, ctx);
		const first = (await f.emit("before_agent_start", { prompt: "hi", systemPrompt: [] }, ctx)) as Started;
		expect(first.messages[0]!.content).toContain("(wake: restart)");
		await f.tool("orchestrator_wake_read").execute("1", { body: "nothing open" }, undefined, undefined, ctx);
		expect(await f.emit("tool_call", { toolName: "bash", input: {} }, ctx)).toBeUndefined();
		await f.emit("session_compact", { type: "session_compact" }, ctx);
		const after = (await f.emit("before_agent_start", { prompt: "go on", systemPrompt: [] }, ctx)) as Started;
		expect(after.messages[0]!.content).toContain("(wake: compaction)");
		expect((await f.emit("tool_call", { toolName: "bash", input: {} }, ctx)) as { block: boolean }).toMatchObject({ block: true });
	});

	test("a missing voice document is named in the system prompt rather than silently skipped", async () => {
		const f = fakePi();
		const e = env({ AGENT_SYSTEM_VOICE: "/nonexistent/VOICE.md" });
		orchestratorSurface(f.pi, e);
		const ctx = ctxOf();
		const started = (await f.emit("before_agent_start", { prompt: "hi", systemPrompt: [] }, ctx)) as Started;
		expect(started.systemPrompt.join("\n")).toContain("voice document was not found at /nonexistent/VOICE.md");
	});

	test("Jo's one word in the prompt: applied through the ledger, notified, carried into the turn's context; other text passes through", async () => {
		const f = fakePi();
		const e = env();
		const ledger = open(e);
		const wl = ledger.openWorkload({ by: "lane-a", brief: "Fix", stakes: "normal", mode: "autonomous" });
		const sl = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "t", doneCondition: "d", inputs: "a.ts" });
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Which?", options: ["left", "right"] });
		ledger.close();
		orchestratorSurface(f.pi, e);
		const ctx = ctxOf();
		notices.length = 0;
		const chat = (await f.emit("before_agent_start", { prompt: "how is it going?", systemPrompt: [] }, ctx)) as Started;
		// no wake happened in this session, so the open question is new since the last turn (§ B3 item 1: delivered between wakes, once)
		expect(chat.messages).toHaveLength(1);
		expect(chat.messages[0]!.content).toContain("## needs you (new since your last turn)");
		expect(chat.messages[0]!.content).toContain(`${q}, slice ${sl}): Which?`);
		expect(notices).toEqual([]);
		expect(((await f.emit("before_agent_start", { prompt: "still thinking", systemPrompt: [] }, ctx)) as Started).messages).toEqual([]);
		const answered = (await f.emit("before_agent_start", { prompt: "right", systemPrompt: [] }, ctx)) as Started;
		expect(notices).toHaveLength(1);
		expect(notices[0]).toContain(`answered ${q} with "right"`);
		expect(notices[0]).toContain(`slice ${sl} is open`);
		expect(answered.messages[0]!.content).toContain("## Applied from the surface since your last turn");
		expect(answered.messages[0]!.content).toContain(`answered ${q} with "right"`);
		const flipped = (await f.emit("before_agent_start", { prompt: "production", systemPrompt: [] }, ctx)) as Started;
		expect(flipped.messages[0]!.content).toContain(`stakes on ${wl} → production`);
		expect(f.entries.filter((x) => x.type === "surface-input")).toHaveLength(2);
		// the receipt is shown once: the next turn carries no stale notice
		expect(((await f.emit("before_agent_start", { prompt: "thanks", systemPrompt: [] }, ctx)) as Started).messages).toEqual([]);
		const check = open(e);
		expect(check.workload(wl)!.stakes).toBe("production");
		expect(check.slice(sl)!.state).toBe("open");
		check.close();
	});

	test("identity, open (stakes inferred, decision log carried), schedule, close (decision log rendered)", async () => {
		const f = fakePi();
		const e = env();
		orchestratorSurface(f.pi, e);
		const repo = tmp("repo");
		const logDir = join(repo, ".ai", "decision-log");
		mkdirSync(logDir, { recursive: true });
		const today = new Date().toISOString().slice(0, 10);
		writeFileSync(join(logDir, `${today}--0900--plumb--prior.md`), "---\nstatus: resolved\n---\n\n## Decisions made (and why)\n\n- prior decision\n");
		const ctx = ctxOf({ cwd: repo });
		const who = await f.tool("orchestrator_identity").execute("1", { name: "Sable", pronouns: "they/them" }, undefined, undefined, ctx);
		expect(who.content[0]!.text).toMatch(/^You are now Sable \(they\/them\); entry en-/);
		const opened = await f.tool("orchestrator_open_workload").execute("1", { brief: "hotfix the feed header", done: "the feed header renders at the right offset in production" }, undefined, undefined, ctx);
		const id = (opened.details as { id: string }).id;
		expect(opened.content[0]!.text).toContain(`Opened ${id} on ${repo}`);
		expect(opened.content[0]!.text).toContain("stakes: production · mode: autonomous");
		expect(opened.content[0]!.text).toContain('inferred production: you said "hotfix"');
		expect(opened.content[0]!.text).toContain("prior decision");
		const overridden = await f.tool("orchestrator_open_workload").execute("1", { brief: "hotfix again", done: "the second hotfix is live", stakes: "throwaway", mode: "user-driven" }, undefined, undefined, ctx);
		expect(overridden.content[0]!.text).toContain("stakes overridden to throwaway; mode overridden to user-driven");
		const sched = await f.tool("orchestrator_schedule").execute("1", { due: "2020-01-01", text: "re-measure the threshold; method = routing_review" }, undefined, undefined, ctx);
		const sid = (sched.details as { id: string }).id;
		const bad = await f.tool("orchestrator_schedule").execute("1", { due: "someday", text: "x" }, undefined, undefined, ctx);
		expect(bad.content[0]!.text).toContain("nothing was opened");
		// the due row is under needs-you at the next wake
		await f.emit("session_compact", {}, ctx);
		const wake = (await f.emit("before_agent_start", { prompt: "x", systemPrompt: [] }, ctx)) as Started;
		expect(wake.messages[0]!.content).toContain("scheduled and past due (2020-01-01): re-measure the threshold");
		expect(wake.messages[0]!.content).toContain("you are Sable (they/them)");
		await f.tool("orchestrator_wake_read").execute("1", { body: "resuming" }, undefined, undefined, ctx);
		// close: refused with open slices; the standing workload never closes; a scheduled row closes with a receipt and no log entry
		const ledger = open(e);
		const sl = ledger.addSlice({ by: "lane-a", workloadId: id, task: "t", doneCondition: "d", inputs: "a" });
		ledger.close();
		const refused = await f.tool("orchestrator_close_workload").execute("1", { workloadId: id }, undefined, undefined, ctx);
		expect(refused.content[0]!.text).toContain("cannot close: 1 open slice(s)");
		expect((await f.tool("orchestrator_close_workload").execute("1", { workloadId: STANDING_WORKLOAD_ID }, undefined, undefined, ctx)).content[0]!.text).toContain("never closed");
		const closedSched = await f.tool("orchestrator_close_workload").execute("1", { workloadId: sid, receipt: "measured: threshold stays 0.55" }, undefined, undefined, ctx);
		expect(closedSched.content[0]!.text).toContain("scheduled row: no decision-log entry");
		const l2 = open(e);
		l2.completeSlice(sl, { by: "lane-a", artifact: "done" });
		// Decision 16: close needs the holder's done-because: receipt; lane-a was launched on it (the starter's launch: names it), holds, records, releases.
		l2.recordEntry({ by: "lane-starter", workloadId: id, kind: "assumption", body: "launch: lane-a cause first requested-by test" });
		expect(l2.claimWorkload(id, { by: "lane-a", holder: "lane-a", leaseMs: 60_000 }).won).toBe(true);
		l2.recordEntry({ by: "lane-a", workloadId: id, kind: "assumption", body: "done-because: the feed header renders at the right offset (PR #12 merged)" });
		l2.releaseWorkload(id, { by: "lane-a", holder: "lane-a" });
		expect(l2.instructions(sid).at(-1)!.body).toBe("close receipt: measured: threshold stays 0.55");
		l2.close();
		const closed = await f.tool("orchestrator_close_workload").execute("1", { workloadId: id, receipt: "shipped" }, undefined, undefined, ctx);
		const path = (closed.details as { path: string }).path;
		expect(path.startsWith(logDir)).toBe(true);
		expect(path).toMatch(/--sable--hotfix-the-feed-header\.md$/);
		expect(existsSync(path)).toBe(true);
		expect(readFileSync(path, "utf8")).toContain("## What changed");
		const l3 = open(e);
		expect(l3.workload(id)!.status).toBe("closed");
		expect((await f.tool("orchestrator_close_workload").execute("1", { workloadId: id }, undefined, undefined, ctx)).content[0]!.text).toContain("already closed");
		l3.close();
	});

	// M7 fix round 2, finding C: Jo typed `status` at 05:09:47 and the reply repeated a stale state,
	// because the render reached the model only at a wake. The on-demand read is that render.
	test("orchestrator_ledger: a slice done and a message enqueued after the wake show in the read, and the message is delivered by it", async () => {
		const f = fakePi();
		const e = env();
		const seed = open(e);
		const wl = seed.openWorkload({ by: "lane-a", brief: "Add a line to the README", stakes: "normal", mode: "autonomous" });
		const sl = seed.addSlice({ by: "lane-a", workloadId: wl, task: "write the line", doneCondition: "README.md has it", inputs: "README.md" });
		seed.close();
		orchestratorSurface(f.pi, e);
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		const wake = (await f.emit("before_agent_start", { prompt: "hi", systemPrompt: [] }, ctx)) as Started;
		expect(wake.messages[0]!.content).toContain(`- ${sl} [open]`);
		await f.tool("orchestrator_wake_read").execute("1", { body: `resuming ${wl}` }, undefined, undefined, ctx);
		// after the wake, the lane finishes the slice and reports to the orchestrator
		const lane = open(e);
		lane.completeSlice(sl, { by: "lane-a", artifact: "README.md written" });
		lane.close();
		expect(await f.emit("tool_call", { toolName: "orchestrator_ledger", input: {} }, ctx)).toBeUndefined();
		for (const params of [{}, { workload: wl }]) {
			const l = open(e);
			const msg = l.enqueue({ by: "lane-a", workloadId: wl, sliceId: sl, sender: "lane-a", recipient: "orchestrator", body: `slice done: README line landed (${JSON.stringify(params)})` });
			l.close();
			const read = (await f.tool("orchestrator_ledger").execute("1", params, undefined, undefined, ctx)).content[0]!.text;
			expect(read).toMatch(/^# Ledger at .* \(read on demand/);
			expect(read).toContain(`slice ${sl} done by lane-a: README.md written`);
			expect(read).toContain(`${msg} [held] lane-a → orchestrator (${sl}): slice done: README line landed`);
			const after = open(e);
			expect(after.message(msg)!.state).toBe("delivered");
			after.close();
		}
		expect((await f.tool("orchestrator_ledger").execute("1", { workload: "wl-nope" }, undefined, undefined, ctx)).content[0]!.text).toBe("No workload wl-nope.");
	});

	// M7 fix round 2, finding B: Jo's answer to the orchestrator's QUESTION lands on the workload as an instruction row.
	test("orchestrator_record_instruction: Jo's words verbatim plus the reading, author jo, channel surface, kind instruction; refused on the standing, a closed or an unknown workload", async () => {
		const f = fakePi();
		const e = env();
		const seed = open(e);
		const wl = seed.openWorkload({ by: SURFACE, brief: "Add a line to the README", stakes: "normal", mode: "autonomous" });
		const done = seed.openWorkload({ by: SURFACE, brief: "old", stakes: "normal", mode: "autonomous" });
		seed.closeWorkload(done, { by: SURFACE });
		seed.close();
		orchestratorSurface(f.pi, e);
		const ctx = ctxOf();
		const rec = f.tool("orchestrator_record_instruction");
		const r = await rec.execute("1", { workloadId: wl, words: "use your draft", reading: "use the drafted README line" }, undefined, undefined, ctx);
		expect(r.content[0]!.text).toMatch(/^Recorded instruction \S+ on wl-/);
		for (const bad of [{ workloadId: STANDING_WORKLOAD_ID }, { workloadId: done }, { workloadId: "wl-nope" }, { workloadId: wl, words: " " }]) {
			const out = await rec.execute("1", { words: "x", reading: "y", ...bad }, undefined, undefined, ctx);
			expect(out.content[0]!.text).toContain("nothing was recorded");
		}
		const check = open(e);
		const rows = check.instructions(wl);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ kind: "instruction", author: "jo", channel: "surface", body: 'Jo: "use your draft" — reading: use the drafted README line' });
		expect(check.instructions(done)).toEqual([]);
		check.close();
	});
});
