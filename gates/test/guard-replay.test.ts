// guard-replay (gates/scripts/guard-replay.ts) over the recorded corpus: the rows as they are now
// reproduce every live verdict the fixture carries (no LOST, no NEW-CATCH), a weakened row shows up
// as LOST and exits 1, and the transcript parser reads what OMP writes. The fixture is a synthetic
// OMP session transcript of real lane and hand calls (home rewritten to /Users/as2, file contents
// and results omitted, refusal texts kept), so the test needs nothing outside the repository.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkToolCall } from "../src/gates";
import type { Refusal } from "../src/types";
import {
	type Check, classify, collectCalls, isHandTranscript, jsonLines, parseSession, renderExamples, renderTable, replay, ROWS, rowOf, toolEventInput,
} from "../scripts/guard-replay";

const FIXTURES = join(import.meta.dir, "fixtures", "guard-replay");
const SCRIPT = join(import.meta.dir, "..", "scripts", "guard-replay.ts");

const corpus = () => collectCalls([FIXTURES], 0);

describe("the fixture corpus on the rows as they are now", () => {
	test("every live verdict is reproduced: no LOST, no NEW-CATCH, nothing thrown", () => {
		const calls = corpus();
		expect(calls.length).toBeGreaterThanOrEqual(40);
		const report = replay(calls);
		expect(report.errors).toBe(0);
		expect(report.lost).toBe(0);
		const newCatches = report.calls.filter((c) => c.outcomes.some((o) => o.kind === "new-catch")).map((c) => `${c.line}: ${c.nowReason}`);
		expect(newCatches).toEqual([]);
		// The corpus covers the replayable rows with live refusals and the state-bound ones too.
		for (const row of ["r06-reserved", "r10-raw-ledger", "r05-brief-fields"]) expect(report.rows[row]!.unchanged).toBeGreaterThan(0);
		for (const row of ["r08-push-rebase", "question", "fence"]) expect(report.rows[row]!.stateBound).toBeGreaterThan(0);
		expect(report.passed).toBeGreaterThan(0);
		expect(new Set(calls.map((c) => c.tool))).toEqual(new Set(["bash", "eval", "write", "edit", "read", "task"]));
	});

	test("the context is the transcript's, not this process's", () => {
		const call = corpus()[0]!;
		expect(call.home).toBe("/Users/as2");
		expect(call.cwd).toBe("/Users/as2/code/agent-system-2.0-lanes/wl-muq13bkdghblmo");
		expect(call.workload).toBe("wl-muq13bkdghblmo");
		expect(call.role).toBe("lane");
		expect(isHandTranscript(call.path)).toBe(false);
	});

	test("a weakened row 6 is a LOST: the stub lets every reserved action through", () => {
		const weakened: Check = (call, ctx, deps) => {
			const r = checkToolCall(call, ctx, deps);
			return r && rowOf(r.reason) === "r06-reserved" ? null : r;
		};
		const report = replay(corpus(), weakened);
		expect(report.rows["r06-reserved"]!.lost).toBeGreaterThan(0);
		expect(report.rows["r06-reserved"]!.unchanged).toBe(0);
		expect(report.lost).toBe(report.rows["r06-reserved"]!.lost);
		// The other rows are untouched by the stub.
		expect(report.rows["r10-raw-ledger"]!.lost).toBe(0);
		expect(report.rows["r05-brief-fields"]!.lost).toBe(0);
		expect(renderTable(report)).toContain(`LOST ${report.lost}:`);
		const shown = renderExamples(report, "r06-reserved");
		expect(shown).toContain("r06-reserved LOST (");
		expect(shown).toContain("live: P-11 row 6 refused this");
		expect(shown).toContain(`${FIXTURES}/corpus.jsonl:`);
	});

	test("a row that refuses what it did not refuse live is a NEW-CATCH, not a LOST", () => {
		const stricter: Check = (call, ctx, deps) => checkToolCall(call, ctx, deps) ?? (call.toolName === "read" ? { block: true, reason: "P-11 row 10 refused this: reads too" } : null);
		const report = replay(corpus(), stricter);
		expect(report.lost).toBe(0);
		expect(report.rows["r10-raw-ledger"]!.newCatch).toBe(corpus().filter((c) => c.tool === "read").length);
	});

	test("a judge that throws is counted as an error, never as a verdict", () => {
		const throwing: Check = () => {
			throw new Error("boom");
		};
		const report = replay(corpus(), throwing);
		expect(report.errors).toBe(report.calls.length);
		expect(report.lost).toBe(0);
		expect(renderExamples(report, "errors")).toContain("threw: Error: boom");
	});

	test("--json emits one object per call with the two rows and the outcomes", () => {
		const report = replay(corpus());
		const lines = jsonLines(report).split("\n");
		expect(lines).toHaveLength(report.calls.length);
		const first = JSON.parse(lines[0]!) as Record<string, unknown>;
		for (const k of ["path", "line", "toolCallId", "tool", "command", "cwd", "role", "workload", "nowRow", "nowReason", "liveRow", "outcomes"]) expect(first).toHaveProperty(k);
	});
});

describe("the command line", () => {
	test("prints the per-row table in under ten seconds and exits 0 on the corpus", () => {
		const t0 = Date.now();
		const r = spawnSync("bun", [SCRIPT, "--root", FIXTURES, "--days", "30", "--show", "r06-reserved"], { encoding: "utf8" });
		expect(Date.now() - t0).toBeLessThan(10_000);
		expect(r.stderr).toBe("");
		expect(r.status).toBe(0);
		expect(r.stdout).toContain("GUARD REPLAY (");
		for (const row of ROWS) expect(r.stdout).toContain(row.id);
		expect(r.stdout).toContain("ok: no LOST on any replayable row");
		expect(r.stdout).toContain("r06-reserved UNCHANGED (");
		expect(r.stdout).toContain("r06-reserved LOST (0)");
	});

	test("exits 1 when a replayable row has a LOST: a harmless command the transcript says row 6 refused", () => {
		const root = mkdtempSync(join(tmpdir(), "guard-replay-"));
		const lines = [
			{ type: "session", version: 3, id: "s", timestamp: "2026-10-11T00:00:00Z", cwd: "/Users/as2/code/x" },
			{ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "t1", name: "bash", arguments: { command: "ls -la" } }] } },
			{ type: "message", message: { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: "P-11 row 6 refused this: ls is on the § A4 reserved list" }], isError: true } },
		];
		writeFileSync(join(root, "s.jsonl"), `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
		const r = spawnSync("bun", [SCRIPT, "--root", root, "--days", "0", "--show", "r06-reserved"], { encoding: "utf8" });
		expect(r.status).toBe(1);
		expect(r.stdout).toContain("LOST 1: a call refused live is let through now");
		expect(r.stdout).toContain(`${join(root, "s.jsonl")}:2  bash  ls -la`);
		expect(r.stdout).toContain("live: P-11 row 6 refused this: ls is on the § A4 reserved list");
	});

	test("a bad argument exits 2 with the reason", () => {
		const r = spawnSync("bun", [SCRIPT, "--days", "soon"], { encoding: "utf8" });
		expect(r.status).toBe(2);
		expect(r.stderr).toContain("--days takes a number of days");
	});

	test("an unknown row name is said, not crashed on", () => {
		expect(renderExamples(replay([]), "r99")).toContain("no such row: r99");
	});
});

describe("classification", () => {
	const kinds = (now: string | null, live: string | null) => classify(now, live).map((o) => `${o.kind}:${o.row ?? "-"}`);
	test("same verdict both times", () => {
		expect(kinds(null, null)).toEqual(["pass:-"]);
		expect(kinds("r06-reserved", "r06-reserved")).toEqual(["unchanged:r06-reserved"]);
		expect(kinds("r08-push-rebase", "r08-push-rebase")).toEqual(["state-bound:r08-push-rebase"]);
	});
	test("a replayable row's new refusal is a NEW-CATCH; a lost one is a LOST", () => {
		expect(kinds("r06-reserved", null)).toEqual(["new-catch:r06-reserved"]);
		expect(kinds(null, "r06-reserved")).toEqual(["lost:r06-reserved"]);
		expect(kinds("r06-reserved", "r10-raw-ledger")).toEqual(["new-catch:r06-reserved", "lost:r10-raw-ledger"]);
	});
	test("a refusal now at an earlier row shadows the live row: still refused, not a LOST", () => {
		expect(kinds("r10-raw-ledger", "r06-reserved")).toEqual(["new-catch:r10-raw-ledger", "shadowed:r06-reserved"]);
	});
	test("state-bound rows never count as NEW-CATCH or LOST", () => {
		expect(kinds("r08-push-rebase", null)).toEqual(["state-bound:r08-push-rebase"]);
		expect(kinds(null, "fence")).toEqual(["state-bound:fence"]);
		expect(kinds("r09-protected-edit", "question")).toEqual(["state-bound:r09-protected-edit", "state-bound:question"]);
		// A replayable refusal now against a state-bound live refusal is the catch alone.
		expect(kinds("r06-reserved", "r08-push-rebase")).toEqual(["new-catch:r06-reserved"]);
		// A state-bound refusal now against a replayable live one: the live row was consulted and passed.
		expect(kinds("r08-push-rebase", "r06-reserved")).toEqual(["state-bound:r08-push-rebase", "lost:r06-reserved"]);
	});
	test("rowOf reads the row off the reason's head only", () => {
		expect(rowOf("P-11 row 6 refused this: rm -rf")).toBe("r06-reserved");
		expect(rowOf("  P-11 question row refused this dispatch")).toBe("question");
		expect(rowOf("M4b OS fence: the running OMP is 18.8.5")).toBe("fence");
		expect(rowOf("logS raw: kubectl delete | verdict: P-11 row 6 refused")).toBeNull();
		expect(rowOf("")).toBeNull();
		expect(rowOf(null)).toBeNull();
	});
});

describe("the transcript parser", () => {
	const header = JSON.stringify({ type: "session", version: 3, id: "s", timestamp: "2026-10-11T00:00:00Z", cwd: "/Users/someone/code/agent-system-2.0-lanes/wl-abc" });
	const call = (id: string, name: string, args: Record<string, unknown>) =>
		JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "x" }, { type: "toolCall", id, name, arguments: args }] } });
	const result = (id: string, text: string, isError = false) =>
		JSON.stringify({ type: "message", message: { role: "toolResult", toolCallId: id, toolName: "bash", content: [{ type: "text", text }], isError } });

	test("pairs each call with its result, keeps the line, derives cwd, home and workload", () => {
		const text = [header, call("a", "bash", { command: "ls" }), call("b", "grep", { pattern: "x" }), result("a", "ok"), call("c", "bash", { command: "pwd" })].join("\n");
		const calls = parseSession("/x/lanes/wl-abc/sessions/s.jsonl", text);
		expect(calls).toHaveLength(1); // b is not a replayed tool; c has no result
		expect(calls[0]).toMatchObject({ line: 2, toolCallId: "a", tool: "bash", input: { command: "ls" }, cwd: "/Users/someone/code/agent-system-2.0-lanes/wl-abc", home: "/Users/someone", workload: "wl-abc", role: "lane", result: "ok" });
	});

	test("a refused call's live row is the result's head; an error result that is no refusal is a pass", () => {
		const text = [header, call("a", "bash", { command: "git push --force" }), result("a", "P-11 row 6 refused this: force push", true), call("b", "bash", { command: "false" }), result("b", "exit 1", true)].join("\n");
		const report = replay(parseSession("/x/s.jsonl", text), (): Refusal => null);
		expect(report.calls[0]!.liveRow).toBe("r06-reserved");
		expect(report.calls[0]!.outcomes).toEqual([{ row: "r06-reserved", kind: "lost" }]);
		expect(report.calls[1]!.liveRow).toBeNull();
		expect(report.calls[1]!.outcomes).toEqual([{ row: null, kind: "pass" }]);
	});

	test("an edit call's hashline headers become path or paths, as OMP's event input has them", () => {
		expect(toolEventInput("edit", { input: "[a/b.ts#1A2B]\nPUT 1.=1:\n+x\n" })).toEqual({ input: "[a/b.ts#1A2B]\nPUT 1.=1:\n+x\n", path: "a/b.ts" });
		expect(toolEventInput("edit", { input: "[a.ts#1A2B]\nPUT 1.=1:\n+x\n[b.ts#3C4D]\nPUT 2.=2:\n+y\n" })).toEqual({ input: "[a.ts#1A2B]\nPUT 1.=1:\n+x\n[b.ts#3C4D]\nPUT 2.=2:\n+y\n", paths: ["a.ts", "b.ts"] });
		expect(toolEventInput("edit", { path: "given.ts", input: "[x.ts#1A2B]\n" })).toEqual({ path: "given.ts", input: "[x.ts#1A2B]\n" });
		expect(toolEventInput("write", { path: "w.ts", content: "[x.ts#1A2B]\n" })).toEqual({ path: "w.ts", content: "[x.ts#1A2B]\n" });
	});

	test("a hand's transcript sits in a directory named after its parent session", () => {
		expect(isHandTranscript(join(FIXTURES, "corpus.jsonl"))).toBe(false);
	});

	test("a resumed transcript's repeated calls are read once", () => {
		const calls = collectCalls([FIXTURES, FIXTURES], 0);
		expect(calls).toHaveLength(corpus().length);
	});
});
