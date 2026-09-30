// Stakes/mode inference (§ A1.2, § B13.1) and Jo's one-word inputs (§ B5, § B3 item 5): every
// applied word is a ledger row with author jo, channel surface; unrecognised text is left alone.
import { describe, expect, test } from "bun:test";
import { apply, interpret } from "../src/input";
import { inferMode, inferStakes, saidPlanIt } from "../src/stakes";
import { tempLedger, workloadWithSlice } from "./helpers";

describe("stakes and mode inference", () => {
	test("default normal; production from words, protected branch or a reserved target; throwaway from words or a scratch repo", () => {
		expect(inferStakes({ said: "fix the header offset" })).toMatchObject({ value: "normal" });
		expect(inferStakes({ said: "hotfix the checkout page" })).toMatchObject({ value: "production", reason: 'you said "hotfix"' });
		expect(inferStakes({ said: "tidy", branch: "main" })).toMatchObject({ value: "production", reason: "target branch main is protected" });
		expect(inferStakes({ said: "tidy", reservedTarget: true }).value).toBe("production");
		expect(inferStakes({ said: "spike a prototype of the parser" }).value).toBe("throwaway");
		expect(inferStakes({ said: "measure it", repo: "/Users/jo/agent-scratch/x" })).toMatchObject({ value: "throwaway" });
		// production wins over throwaway when both match
		expect(inferStakes({ said: "throwaway experiment against production" }).value).toBe("production");
	});

	test("mode is autonomous unless Jo asked to steer; 'plan it' alone is plan-first, not steering (decision 15)", () => {
		expect(inferMode("fix the feed")).toMatchObject({ value: "autonomous" });
		expect(inferMode("plan it with me")).toMatchObject({ value: "user-driven", reason: 'you said "with me"' });
		expect(inferMode("plan it")).toMatchObject({ value: "autonomous" });
		expect(saidPlanIt("plan it")).toBe(true);
		expect(saidPlanIt("fix the feed")).toBe(false);
		expect(inferMode("walk me through the migration").value).toBe("user-driven");
	});
});

describe("one-word inputs", () => {
	test("a stakes word flips the only workload in view and records the instruction; a mode word flips mode", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const s = interpret(ledger, "production")!;
		expect(s).toMatchObject({ kind: "stakes", workloadId: wl, stakes: "production" });
		expect(apply(ledger, s)).toMatch(/^stakes on wl-.* → production/);
		expect(ledger.workload(wl)!.stakes).toBe("production");
		const m = interpret(ledger, "user-driven")!;
		expect(apply(ledger, m)).toContain("→ user-driven");
		expect(ledger.workload(wl)!.mode).toBe("user-driven");
		const rows = ledger.instructions(wl);
		expect(rows.map((r) => [r.kind, r.body, r.author, r.channel])).toEqual([
			["instruction", "stakes: production", "jo", "surface"],
			["mode-flip", "user-driven", "jo", "surface"],
		]);
	});

	test("with two workloads in view a bare stakes word is ambiguous; a second word picks the workload", () => {
		const { ledger } = tempLedger();
		const a = workloadWithSlice(ledger).wl;
		const b = workloadWithSlice(ledger, { brief: "second" }).wl;
		expect(interpret(ledger, "throwaway")).toBeNull();
		expect(interpret(ledger, `throwaway ${b}`)).toMatchObject({ kind: "stakes", workloadId: b });
		expect(interpret(ledger, `throwaway ${a}`)).toMatchObject({ workloadId: a });
	});

	test("an option word answers the oldest open question (case-insensitive) and the slice resumes; withdraw replans", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Token name?", options: ["Header-Offset", "nav-offset"] });
		expect(interpret(ledger, "nope")).toBeNull();
		const a = interpret(ledger, "header-offset")!;
		expect(a).toMatchObject({ kind: "answer", questionId: q, answer: "Header-Offset" });
		const receipt = apply(ledger, a);
		expect(receipt).toContain(`slice ${sl} is open`);
		expect(ledger.question(q)!.state).toBe("answered");
		expect(ledger.slice(sl)!.state).toBe("open");
		const q2 = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Really?", options: ["yes", "no"] });
		const w = interpret(ledger, "withdraw")!;
		expect(w).toMatchObject({ kind: "withdraw", questionId: q2, then: "replan" });
		expect(apply(ledger, w)).toContain("replanned, not executed");
		expect(ledger.question(q2)!.state).toBe("withdrawn");
		expect(ledger.slice(sl)!.state).toBe("open");
		const last = ledger.instructions(wl).at(-1)!;
		expect(last).toMatchObject({ kind: "withdrawal", disposition: "replan", author: "jo", channel: "surface" });
	});

	test("approve / deny name the oldest waiting reserved request, or the one given", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		expect(interpret(ledger, "approve")).toBeNull();
		const e1 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push main" });
		const e2 = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "deploy" });
		expect(interpret(ledger, "approve")).toMatchObject({ kind: "reserved", entryId: e1, verdict: "approve" });
		const d = interpret(ledger, `deny ${e2}`)!;
		expect(apply(ledger, d)).toContain(`denied reserved request ${e2}`);
		expect(ledger.instructions(wl).at(-1)!.body).toBe(`deny ${e2}`);
		expect(interpret(ledger, "deny")).toMatchObject({ entryId: e1 });
	});

	test("ordinary sentences are not commands", () => {
		const { ledger } = tempLedger();
		workloadWithSlice(ledger);
		expect(interpret(ledger, "please make it production grade")).toBeNull();
		expect(interpret(ledger, "")).toBeNull();
	});
});
