// The wake render (§ B7) and the five § B3 lines, the § A3 hold, the M11 due row, identity and the
// stakes/mode one-liner, all from ledger state.
import { describe, expect, test } from "bun:test";
import { errorLines, parseDue, reservedStates, waitingReserved } from "../src/errors";
import { ensureStandingWorkload, identityOf, recordIdentity } from "../src/identity";
import { Numbering } from "../src/numbering";
import { oneLiner, renderWake } from "../src/render";
import { artifactFailures } from "../src/signals";
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
		expect(artifactFailures(ledger, wl).get(sl)?.n).toBe(1);
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

describe("held reserved requests: repeat and self-close (MIGRATION.md item 31)", () => {
	const call = (id: string) => `kubectl delete: eval: const repo = "x" (P-11 row 6 refused tool call ${id})`;
	/** A workload held by lane-a, with a clock at 18:00Z. */
	function held() {
		const c = clock("2026-10-01T18:00:00.000Z");
		const { ledger } = tempLedger(c.now);
		const { wl, sl } = workloadWithSlice(ledger);
		expect(ledger.claimWorkload(wl, { by: "lane-a", holder: "lane-a", leaseMs: 3_600_000 }).won).toBe(true);
		const request = (id: string, by = "lane-a") => ledger.recordEntry({ by, workloadId: wl, sliceId: sl, kind: "reserved-request", body: call(id) });
		const decide = (word: "approve" | "deny", en: string) => ledger.recordInstruction({ by: "surface", workloadId: wl, body: `${word} ${en}`, author: "jo", channel: "surface" });
		const reservedLines = () => errorLines(ledger, undefined, { now: c.now() }).filter((l) => l.kind === "reserved");
		return { c, ledger, wl, request, decide, reservedLines };
	}

	test("a repeat of an approved call names it with Jo's UTC time, before the approve/deny hint", () => {
		const { c, request, decide, reservedLines } = held();
		const a = request("c1");
		decide("approve", a);
		c.at("2026-10-01T18:07:00.000Z");
		const b = request("c2");
		const lines = reservedLines();
		expect(lines.map((l) => l.rowId)).toEqual([b]);
		expect(lines[0]!.line).toEndWith(`: kubectl delete: eval: const repo = "x" (P-11 row 6 refused tool call c2) — same call as ${a}, approved 18:00 — \`approve ${b}\` or \`deny ${b}\``);
	});

	test("a repeat of a denied call says denied with its time; a different call is no repeat", () => {
		const { c, ledger, wl, request, decide, reservedLines } = held();
		const a = request("c1");
		c.at("2026-10-01T18:02:30.000Z");
		decide("deny", a);
		const b = request("c2");
		const other = ledger.recordEntry({ by: "lane-a", workloadId: wl, kind: "reserved-request", body: "deploy: fly deploy (P-11 row 6 refused tool call c3)" });
		const lines = reservedLines();
		expect(lines.find((l) => l.rowId === b)!.line).toContain(`— same call as ${a}, denied 18:02 — \`approve ${b}\``);
		expect(lines.find((l) => l.rowId === other)!.line).not.toContain("same call as");
	});

	test("a later repeat supersedes a waiting request: only the newest shows, naming the earliest as superseded", () => {
		const { ledger, wl, request, reservedLines } = held();
		const a = request("c1");
		const b = request("c2");
		const c3 = request("c3");
		expect(waitingReserved(ledger, wl).map((r) => r.id)).toEqual([c3]);
		expect(reservedStates(ledger, wl).map((r) => r.state)).toEqual([{ kind: "superseded", by: b }, { kind: "superseded", by: c3 }, { kind: "waiting" }]);
		expect(reservedLines().map((l) => l.line)).toEqual([expect.stringContaining(`— same call as ${a} (superseded) — \`approve ${c3}\``)]);
	});

	test("the raising lane stops holding (release, handoff): its requests close; a relaunch under a new lane id repeating it names the closed one", () => {
		const { ledger, wl, request, reservedLines } = held();
		const a = request("c1");
		expect(reservedLines()).toHaveLength(1);
		ledger.releaseWorkload(wl, { by: "lane-a", holder: "lane-a" });
		expect(reservedLines()).toEqual([]);
		expect(reservedStates(ledger, wl)[0]!.state).toEqual({ kind: "lane-stopped", lane: "lane-a" });
		expect(ledger.claimWorkload(wl, { by: "lane-starter", holder: "lane-b", leaseMs: 3_600_000 }).won).toBe(true);
		expect(reservedLines()).toEqual([]);
		const b = request("c2", "lane-b");
		expect(reservedLines().map((l) => l.line)).toEqual([expect.stringContaining(`— same call as ${a}, closed (lane-a stopped holding) — \`approve ${b}\``)]);
		ledger.handoffWorkload(wl, { by: "lane-b", holder: "lane-b", to: "jo" });
		expect(reservedLines()).toEqual([]);
	});

	test("a request from a session that never held the workload stays waiting (an unbound session's lane-<pid> on the standing workload)", () => {
		const { ledger } = tempLedger();
		const standing = ensureStandingWorkload(ledger);
		const en = ledger.recordEntry({ by: "lane-4242", workloadId: standing, kind: "reserved-request", body: call("c1") });
		expect(waitingReserved(ledger, standing).map((r) => r.id)).toEqual([en]);
		expect(errorLines(ledger).filter((l) => l.kind === "reserved").map((l) => l.rowId)).toEqual([en]);
	});

	test("a holder's reserved-withdrawn: closes the request and a repeat says withdrawn with its time; one by a non-holder is ignored", () => {
		const { c, ledger, wl, request, reservedLines } = held();
		const a = request("c1");
		ledger.recordEntry({ by: "lane-x", workloadId: wl, kind: "assumption", body: `reserved-withdrawn: ${a} forged` });
		expect(reservedLines().map((l) => l.rowId)).toEqual([a]);
		c.at("2026-10-01T18:11:00.000Z");
		ledger.recordEntry({ by: "lane-a", workloadId: wl, kind: "assumption", body: `reserved-withdrawn: ${a} went another way` });
		expect(reservedLines()).toEqual([]);
		expect(reservedStates(ledger, wl)[0]!.state).toMatchObject({ kind: "withdrawn", by: "lane-a", reason: "went another way" });
		const b = request("c2");
		expect(reservedLines().map((l) => l.line)).toEqual([expect.stringContaining(`— same call as ${a}, withdrawn 18:11 — \`approve ${b}\``)]);
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

	test("needs-you bullets carry #n on answerable lines: 1..k in line order by default, the passed numbering's numbers when given", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Which token?", options: ["x", "y"] });
		const en = ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "reserved-request", body: "push to main" });
		const fresh = renderWake(ledger);
		expect(fresh.text).toContain("\n- #1 reserved action waiting on you");
		expect(fresh.text).toContain("\n- #2 lane on");
		expect(fresh.lines.map((l) => [l.rowId, l.n])).toEqual([[en, 1], [q, 2]]);
		const numbering = new Numbering();
		numbering.assign(errorLines(ledger).reverse()); // the question seen first: q is #1, the request #2
		const r = renderWake(ledger, { numbering });
		expect(r.text).toContain("\n- #2 reserved action waiting on you");
		expect(r.text).toContain("\n- #1 lane on");
		expect(r.text).not.toContain("#3");
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
