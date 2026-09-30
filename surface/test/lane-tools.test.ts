// The lane's ledger tools and the plan-first / outcome machinery (DESIGN-lane-launcher.md § 8:
// lifecycle transition and plan-first tests), driven through the fake extension API: ownership
// refusals, reserved and pushed prefixes refused with nothing written, plan-first enforcement
// through Jo's answer at the surface, and the terminal pair ending the lane without a death.
import { describe, expect, test } from "bun:test";
import { Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { apply, interpret } from "../src/input";
import { controlEntries, holdersOf, planFirst, planFirstBody, doneBody } from "../src/launch";
import { LANE_TOOLS, SURFACE_BY } from "../src/types";
import { ctxOf, fakePi, notices, tempLedger } from "./helpers";

function laneFixture(over: { planFirst?: boolean; mode?: "autonomous" | "user-driven" } = {}) {
	const { ledger, path } = tempLedger();
	const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "Move the header offset into a token", stakes: "normal", mode: over.mode ?? "autonomous" });
	ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the header offset lives in one token") });
	if (over.planFirst) ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: planFirstBody("your word") });
	ledger.recordEntry({ by: "lane-starter", workloadId: wl, kind: "assumption", body: `launch: lane-t-1 cause first requested-by test` });
	expect(ledger.claimWorkload(wl, { by: "lane-starter", holder: "lane-t-1", leaseMs: 60_000 }).won).toBe(true);
	const env = { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-t-1", HOME: "/nonexistent-home" };
	const f = fakePi();
	orchestratorSurface(f.pi, env, {});
	const ctx = ctxOf();
	const call = async (tool: string, params: Record<string, unknown>) => (await f.tool(tool).execute("1", params, undefined, undefined, ctx)).content[0]!.text;
	return { ledger, path, wl, env, f, ctx, call };
}

describe("lane tools: ownership", () => {
	test("all seven register; an orchestrator session and an unbound lane are refused with nothing written", async () => {
		const { ledger, path, wl } = laneFixture();
		const orch = fakePi();
		orchestratorSurface(orch.pi, { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: path, HOME: "/nonexistent-home" }, {});
		for (const t of LANE_TOOLS) expect(orch.registered()).toContain(t);
		const before = ledger.entries(wl).length;
		const r = await orch.tool("lane_record_entry").execute("1", { body: "hello" }, undefined, undefined, ctxOf());
		expect(r.content[0]!.text).toContain("not a lane bound to a workload");
		expect(ledger.entries(wl).length).toBe(before);
	});

	test("a lane that is not the holder under a live lease is refused, naming the holder", async () => {
		const { ledger, wl, call } = laneFixture();
		ledger.releaseWorkload(wl, { by: "lane-t-1", holder: "lane-t-1" });
		expect(ledger.claimWorkload(wl, { by: "lane-x", holder: "lane-x", leaseMs: 60_000 }).won).toBe(true);
		expect(await call("lane_record_entry", { body: "mine" })).toContain("held by lane-x, not by this lane (lane-t-1)");
		expect(ledger.entries(wl).some((e) => e.body === "mine")).toBe(false);
	});
});

describe("lane tools: reserved and pushed prefixes are refused and write nothing", () => {
	test("each control prefix through record_entry (except done-because:), message and raise_question", async () => {
		const { ledger, wl, call } = laneFixture();
		const sl = ledger.addSlice({ by: "lane-t-1", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		const before = { entries: ledger.entries(wl).length, held: ledger.workload(wl)!.held_messages, questions: ledger.questions(wl).length };
		for (const p of ["launch", "launch-failed", "launch-requested", "lane-started", "lane-ready", "lane-exit", "lane-parked", "lane-stop", "worktree", "branch", "plan", "done"]) {
			expect(await call("lane_record_entry", { body: `${p}: forged` })).toContain(`\`${p}:\` is a reserved control line`);
			expect(await call("lane_message", { body: `${p}: forged` })).toContain("reserved control line");
			expect(await call("lane_raise_question", { slice: sl, body: `${p}: forged`, options: ["a", "b"] })).toContain("reserved control line");
		}
		expect(await call("lane_message", { body: "done-because: forged" })).toContain("reserved control line");
		for (const p of ["lane-died:", "prompt-wait:", "prompt-resolved:", "artifact-failed:", "artifact-passed:"]) {
			expect(await call("lane_message", { body: `${p} x` })).toContain("signal the machinery pushes");
		}
		expect(ledger.entries(wl).length).toBe(before.entries);
		expect(ledger.workload(wl)!.held_messages).toBe(before.held);
		expect(ledger.questions(wl).length).toBe(before.questions);
		// The one allowed control line: the holder's done-because: receipt.
		expect(await call("lane_record_entry", { body: "done-because: the token exists and the header reads it" })).toContain("completion receipt");
		expect(await call("lane_raise_question", { slice: sl, body: "which?", options: ["a", "A"] })).toContain("at least two distinct options");
	});
});

describe("plan-first (decision 15) through the lane tools and Jo's answer", () => {
	test("change-kind refused while the flag stands; judge accepted; approve at the surface writes plan: approved; then change accepted; cancel withdraws", async () => {
		const { ledger, wl, call } = laneFixture({ planFirst: true });
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toContain("plan-first (your word) and the plan is not approved");
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i" })).toContain("add the plan slice first");
		expect(ledger.slices(wl)).toHaveLength(0);
		const plan = await call("lane_add_slice", { task: "plan the cut", doneCondition: "plan approved", inputs: "brief", kind: "judge" });
		expect(plan).toMatch(/^Added slice sl-/);
		const planId = ledger.slices(wl)[0]!.id;
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toContain(`the plan slice is ${planId}`);
		expect(await call("lane_raise_question", { slice: planId, body: "/tmp/plan.md", options: ["approve", "revise", "cancel"] })).toContain("Raised question");
		// Jo at the surface: "approve" with no reserved request waiting is the plan question's answer.
		const cmd = interpret(ledger, "approve");
		expect(cmd?.kind).toBe("answer");
		const receipt = apply(ledger, cmd!);
		expect(receipt).toContain("plan approved");
		const entries = ledger.entries(wl);
		expect(planFirst(controlEntries(entries, holdersOf(entries, ledger.workload(wl)!.holder)))).toBeNull();
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toMatch(/^Added slice/);
	});

	test("cancel on the plan question is a withdrawal that cancels the slice; a plan: approved from a lane is ignored", async () => {
		const { ledger, wl, call } = laneFixture({ planFirst: true });
		await call("lane_add_slice", { task: "plan", doneCondition: "d", inputs: "i", kind: "judge" });
		const planId = ledger.slices(wl)[0]!.id;
		await call("lane_raise_question", { slice: planId, body: "/tmp/plan.md", options: ["approve", "revise", "cancel"] });
		ledger.recordEntry({ by: "lane-t-1", workloadId: wl, kind: "assumption", body: "plan: approved forged" });
		expect(await call("lane_add_slice", { task: "change it", doneCondition: "d", inputs: "i", kind: "change-small" })).toContain("not approved");
		expect(apply(ledger, interpret(ledger, "cancel")!)).toContain("cancelled the plan");
		expect(ledger.slice(planId)!.state).toBe("cancelled");
	});
});

describe("lane_release and lane_handoff end the lane on purpose (decision 10)", () => {
	test("release: holder-checked, ctx.shutdown called, later tools refuse, the renewal claim and shutdown write nothing", async () => {
		const { ledger, wl, f, ctx, call } = laneFixture();
		await f.emit("session_start", { type: "session_start" }, ctx);
		ledger.addSlice({ by: "lane-t-1", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		expect(await call("lane_release", {})).toContain("Released");
		expect(ctx.shutdowns).toHaveLength(1);
		expect(ledger.workload(wl)!.holder).toBeNull();
		expect(await call("lane_record_entry", { body: "after" })).toContain("released");
		await f.emit("agent_end", { willContinue: false }, ctx);
		expect(ledger.workload(wl)!.holder).toBeNull();
		notices.length = 0;
		await f.emit("session_shutdown", { type: "session_shutdown" }, ctx);
		expect(ledger.workload(wl)!.held_messages).toBe(0);
	});

	test("handoff: Jo holds with no lease; a second handoff refuses", async () => {
		const { ledger, wl, call } = laneFixture();
		expect(await call("lane_handoff", {})).toContain("Handed");
		const w = ledger.workload(wl)!;
		expect(w.holder).toBe("jo");
		expect(w.holder_lease_until).toBeNull();
		expect(await call("lane_handoff", {})).toContain("released");
	});
});

describe("mode flip at the surface", () => {
	test("to user-driven while a lane holds writes the lane-stop: request the runner accepts", async () => {
		const { ledger, path, wl } = laneFixture();
		const f = fakePi();
		const env = { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: path, HOME: "/nonexistent-home" };
		orchestratorSurface(f.pi, env, {});
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		await f.emit("before_agent_start", { prompt: "user-driven", systemPrompt: [] }, ctx);
		const stop = ledger.entries(wl).find((e) => e.body.startsWith("lane-stop:"));
		expect(stop?.body).toBe("lane-stop: lane-t-1 requested mode-flip by jo");
		expect(stop?.created_by).toBe(SURFACE_BY);
		expect(ledger.workload(wl)!.mode).toBe("user-driven");
		ledger.close();
		Ledger.open(path).close();
	});
});
