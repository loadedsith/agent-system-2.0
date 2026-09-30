// The wake render (§ B7) and the five § B3 lines, the § A3 hold, the M11 due row, identity and the
// stakes/mode one-liner, all from ledger state.
import { describe, expect, test } from "bun:test";
import { artifactFailures, errorLines, parseDue, waitingReserved } from "../src/errors";
import { ensureStandingWorkload, identityOf, recordIdentity } from "../src/identity";
import { oneLiner, renderWake } from "../src/render";
import { ARTIFACT_FAILED_PREFIX, STANDING_WORKLOAD_ID } from "../src/types";
import { clock, tempLedger, workloadWithSlice } from "./helpers";

describe("needs-you lines (§ B3, § A3, M11)", () => {
	test("nothing open renders a needs-you block that says nothing, and no workloads", () => {
		const { ledger } = tempLedger();
		const r = renderWake(ledger, { trigger: "session-start" });
		expect(r.lines).toEqual([]);
		expect(r.text).toContain("## needs you\nnothing:");
		expect(r.text).toContain("## open workloads\nnone");
		expect(r.text).toContain("no identity row yet");
	});

	test("line 5: an open question renders at once with its options; answered, it is gone and the slice is open again", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Token name?", options: ["header-offset", "nav-offset"] });
		const lines = errorLines(ledger);
		expect(lines).toHaveLength(1);
		expect(lines[0]).toMatchObject({ kind: "question", rowId: q, options: ["header-offset", "nav-offset"] });
		expect(lines[0]!.line).toContain("header-offset / nav-offset");
		expect(ledger.slice(sl)!.state).toBe("paused");
		ledger.answerQuestion(q, { by: "surface", answer: "header-offset", author: "jo", channel: "surface" });
		expect(errorLines(ledger)).toEqual([]);
		expect(ledger.slice(sl)!.state).toBe("open");
	});

	test("line 2: a held message surfaces at four hours, not before; the line carries the age", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl, sl } = workloadWithSlice(ledger);
		ledger.enqueue({ by: "surface", workloadId: wl, sliceId: sl, sender: "jo", recipient: "lane-a", body: "use the token" });
		c.plusHours(3.9);
		expect(errorLines(ledger, undefined, { now: c.now() }).filter((l) => l.kind === "held")).toEqual([]);
		c.plusHours(0.2);
		const held = errorLines(ledger, undefined, { now: c.now() }).filter((l) => l.kind === "held");
		expect(held).toHaveLength(1);
		expect(held[0]!.line).toMatch(/^held 4\.1h on wl-/);
	});

	test("line 2 second form: open slices, no lane, no activity for four hours", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		workloadWithSlice(ledger);
		c.plusHours(5);
		const held = errorLines(ledger, undefined, { now: c.now() }).filter((l) => l.kind === "held");
		expect(held).toHaveLength(1);
		expect(held[0]!.line).toContain("1 open slice(s), no lane");
	});

	test("line 3: a slice surfaces after two artifact-failed messages, not one; a done slice never does", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const fail = () => ledger.enqueue({ by: "lane-a", workloadId: wl, sliceId: sl, sender: "lane-a", recipient: "orchestrator", body: `${ARTIFACT_FAILED_PREFIX} bun test exit 1` });
		fail();
		expect(artifactFailures(ledger, wl).get(sl)).toBe(1);
		expect(errorLines(ledger).filter((l) => l.kind === "artifact")).toEqual([]);
		fail();
		const lines = errorLines(ledger).filter((l) => l.kind === "artifact");
		expect(lines).toHaveLength(1);
		expect(lines[0]!.line).toContain("failed its runtime artifact 2 times");
		ledger.completeSlice(sl, { by: "lane-a", artifact: "bun test exit 0" });
		expect(errorLines(ledger).filter((l) => l.kind === "artifact")).toEqual([]);
	});

	test("line 4: a lane whose lease lapsed is reported dead; a live lease is not", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl } = workloadWithSlice(ledger);
		expect(ledger.claimWorkload(wl, { by: "lane-a", holder: "lane-a", leaseMs: 3_600_000 }).won).toBe(true);
		expect(errorLines(ledger, undefined, { now: c.now() }).filter((l) => l.kind === "lane-died")).toEqual([]);
		c.plusHours(2);
		const dead = errorLines(ledger, undefined, { now: c.now() }).filter((l) => l.kind === "lane-died");
		expect(dead).toHaveLength(1);
		expect(dead[0]!.line).toContain("lane lane-a on wl-");
	});

	test("line 1: a reserved request waits until an instruction names it; `approve <id>` clears it", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const en = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push to main" });
		expect(waitingReserved(ledger, wl).map((r) => r.id)).toEqual([en]);
		const line = errorLines(ledger).find((l) => l.kind === "reserved")!;
		expect(line.line).toContain(`approve ${en}`);
		ledger.recordInstruction({ by: "surface", workloadId: wl, body: `approve ${en}`, author: "jo", channel: "surface" });
		expect(waitingReserved(ledger, wl)).toEqual([]);
	});

	test("due: a scheduled row is listed once past due and not before; parseDue rejects a bad date", () => {
		const c = clock("2026-10-30T00:00:00.000Z");
		const { ledger } = tempLedger(c.now);
		ledger.openWorkload({ by: "surface", brief: "due:2026-10-31 re-measure the classifier threshold; method = routing_review", stakes: "throwaway", mode: "autonomous" });
		expect(errorLines(ledger, undefined, { now: c.now() })).toEqual([]);
		c.at("2026-10-31T00:00:01.000Z");
		const due = errorLines(ledger, undefined, { now: c.now() });
		expect(due).toHaveLength(1);
		expect(due[0]!.kind).toBe("due");
		expect(due[0]!.line).toContain("re-measure the classifier threshold");
		expect(parseDue("due:notadate do it")).toBeNull();
		expect(parseDue("fix the feed")).toBeNull();
	});

	test("order is § B3 order: reserved, held, artifact, lane-died, question, then due", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl, sl } = workloadWithSlice(ledger);
		const sl2 = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "second", doneCondition: "d", inputs: "b.ts" });
		ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl2, body: "which?", options: ["a", "b"] });
		ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "deploy" });
		ledger.enqueue({ by: "lane-a", workloadId: wl, sliceId: sl, sender: "lane-a", recipient: "orchestrator", body: `${ARTIFACT_FAILED_PREFIX} 1` });
		ledger.enqueue({ by: "lane-a", workloadId: wl, sliceId: sl, sender: "lane-a", recipient: "orchestrator", body: `${ARTIFACT_FAILED_PREFIX} 2` });
		ledger.openWorkload({ by: "surface", brief: "due:2020-01-01 overdue thing", stakes: "throwaway", mode: "autonomous" });
		c.plusHours(5);
		expect(errorLines(ledger, undefined, { now: c.now() }).map((l) => l.kind)).toEqual(["reserved", "held", "artifact", "question", "due"]);
	});
});

describe("render and one-liner (§ B7, § A1.2, § B13.1)", () => {
	test("the render carries the one-liner, slices, open questions regardless of last-N, pending messages with states, and the last N entries", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger, { stakes: "production", mode: "user-driven" });
		for (let i = 0; i < 12; i++) ledger.recordInstruction({ by: "lane-a", workloadId: wl, body: `note ${i}`, author: "jo", channel: "direct" });
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Which token?", options: ["x", "y"] });
		const m = ledger.enqueue({ by: "surface", workloadId: wl, sender: "jo", recipient: "lane-a", body: "go" });
		ledger.advanceMessage(m, "delivered", { by: "lane-a" });
		const r = renderWake(ledger, { lastN: 3 });
		expect(r.text).toContain(`## ${wl}`);
		expect(r.text).toContain("stakes: production · mode: user-driven");
		expect(r.text).toContain(`- ${sl} [paused] Move the header offset`);
		expect(r.text).toContain(`- ${q} on ${sl}: Which token? — options: x / y`);
		expect(r.text).toContain(`- ${m} [delivered] jo → lane-a: go`);
		expect(r.text).toContain("last 3 ledger entries:");
		expect(r.text).toContain("note 11");
		expect(r.text).not.toContain("note 8");
		expect(r.text.indexOf("## needs you")).toBeLessThan(r.text.indexOf(`## ${wl}`));
		expect(r.text).not.toContain(`## ${STANDING_WORKLOAD_ID}`);
	});

	test("a mode flip shows as pending until a mode-effective entry with the new mode lands after it", () => {
		const c = clock();
		const { ledger } = tempLedger(c.now);
		const { wl } = workloadWithSlice(ledger);
		expect(oneLiner(ledger, ledger.workload(wl)!)).toContain("mode: autonomous — flip either with one word");
		ledger.flipMode(wl, { by: "surface", mode: "user-driven", author: "jo", channel: "surface" });
		expect(oneLiner(ledger, ledger.workload(wl)!)).toContain("mode: user-driven (flip pending");
		c.plusHours(0.01);
		ledger.recordEntry({ by: "lane-a", workloadId: wl, kind: "mode-effective", body: "user-driven" });
		expect(oneLiner(ledger, ledger.workload(wl)!)).toContain("mode: user-driven — flip");
	});

	test("identity: none on first wake; recorded on the standing workload; the newest wins; parentheses refused", () => {
		const { ledger } = tempLedger();
		expect(identityOf(ledger)).toBeNull();
		const first = recordIdentity(ledger, "Sable", "they/them");
		expect(ledger.workload(STANDING_WORKLOAD_ID)?.status).toBe("open");
		expect(ledger.entries(STANDING_WORKLOAD_ID, "assumption").map((e) => e.body)).toEqual(["identity: Sable (they/them)"]);
		expect(identityOf(ledger)).toMatchObject({ name: "Sable", pronouns: "they/them", entryId: first.entryId });
		recordIdentity(ledger, "Wren", "she/her");
		expect(identityOf(ledger)?.name).toBe("Wren");
		expect(() => recordIdentity(ledger, "A (b)", "x")).toThrow(/parentheses/);
		expect(ensureStandingWorkload(ledger)).toBe(STANDING_WORKLOAD_ID);
		expect(renderWake(ledger).text).toContain("you are Wren (she/her)");
	});
});
