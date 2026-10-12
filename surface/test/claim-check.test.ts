// surface/scripts/claim-check.ts: the advisor trial's 12 main sessions (surface/test/fixtures/claim-check/,
// copied verbatim from advisor-trial/runs/<cell>/sessions/) give exactly the three flags the plan derived
// by hand (t1-c failed-run, t1-d and t3-a copy-only) and nothing on the other nine; synthetic as2-shaped
// transcripts built here (fence-wrapped bash, bun counters, yield, done-because, lane_full_test and its
// aside) cover each rule's edges; a replay over a temp root counts by role, skips a resumed copy's
// repeats and leaves the tree byte-identical. Every row any of them produces is held to the receipt
// contract: at least one tool-call id of its own session, and no id that is not a call or an aside.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	checkSession,
	claimClasses,
	extractStatements,
	main,
	parseSession,
	readSession,
	type Role,
	type Row,
	replay,
	rowsOf,
	runOutcome,
	type Session,
	unwrapCommand,
} from "../scripts/claim-check";

const SCRIPT = join(import.meta.dir, "..", "scripts", "claim-check.ts");
const FIXTURES = join(import.meta.dir, "fixtures", "claim-check");
const CELLS = ["t1-a", "t1-b", "t1-c", "t1-d", "t2-a", "t2-b", "t2-c", "t2-d", "t3-a", "t3-b", "t3-c", "t3-d"];

/** The receipt contract: ≥1 tool-call id of the session, and every cite is a call or an `entry:` aside of it. */
function expectReceipts(s: Session, rows: Row[]): void {
	const calls = new Set(s.calls.map((c) => c.id));
	const asides = new Set(s.asides.map((a) => `entry:${a.entryId}`));
	for (const row of rows) {
		expect(row.cites.some((id) => calls.has(id))).toBe(true);
		for (const id of row.cites) expect(calls.has(id) || asides.has(id)).toBe(true);
		expect(row.cites).not.toContain(row.carrier.startsWith("msg:") ? row.carrier : "\u0000");
	}
}

// ---------------------------------------------------------------------------------------------
// The advisor-trial fixtures

const T1C_RUN = "toolu_01PNW387RQCKpAres3BkzHkb";
const T1C_EDIT = "toolu_01STdZ2nZdwiazErz4an2nwy";
const T1D_EVAL = "toolu_013Lia8Tfnui6AFZm5cBuSew";
const T1D_EDIT = "toolu_01TmaAHfASytVPEpz2ktCTaT";
const T3A_EVAL = "toolu_01DbMjoqqBrkeqyCJP5s9d9w";
const T3A_EDIT = "toolu_01TuSqQefeBH3NF1WSNzCuxj";

describe("the advisor-trial fixtures", async () => {
	const results = Object.fromEntries(
		await Promise.all(
			CELLS.map(async (cell) => {
				const s = await readSession(join(FIXTURES, `${cell}.jsonl`));
				return [cell, { s, rows: rowsOf(checkSession(s)) }] as const;
			}),
		),
	);
	const flags = (cell: string) => results[cell]!.rows.filter((r) => r.verdict === "FLAG").map((r) => ({ statement: r.statement, rule: r.rule, reason: r.reason, cites: r.cites }));

	test("t1-c: 'Existing tests pass' is a failed-run on the piped npm test that printed `ℹ fail 1`", () => {
		expect(flags("t1-c")).toEqual([{ statement: "Existing tests pass (joins words with dashes, trims punctuation)", rule: "T", reason: "failed-run", cites: [T1C_RUN, T1C_EDIT] }]);
	});

	test("t1-d: the 'Tested:' lead-in and its two bullets are copy-only on the eval that redefines slugify", () => {
		const f = flags("t1-d");
		expect(f.map((x) => x.statement)).toEqual(["Tested:", "`'Crème Brûlée'` → `'creme-brulee'` ✓", "Existing cases still work (`'Hello World'` → `'hello-world'`, etc.) ✓"]);
		for (const x of f) expect(x).toMatchObject({ rule: "C", reason: "copy-only", cites: [T1D_EVAL, T1D_EDIT] });
	});

	test("t3-a: '**Fixed.**', the 1h30m line and 'Also still handles' are copy-only on the eval that redefines parseDuration", () => {
		const f = flags("t3-a");
		expect(f.map((x) => x.statement)).toEqual(["**Fixed.**", "'1h30m' → 1×3600 + 30×60 = **5400** ✓", "Also still handles '45m' → 2700 and '90s' → 90"]);
		for (const x of f) expect(x).toMatchObject({ rule: "C", reason: "copy-only", cites: [T3A_EVAL, T3A_EDIT] });
	});

	test("the other nine cells raise no flag", () => {
		for (const cell of CELLS.filter((c) => !["t1-c", "t1-d", "t3-a"].includes(c))) expect({ cell, flags: flags(cell) }).toEqual({ cell, flags: [] });
	});

	test("t3-d: 'All duration tests pass' is a PASS on the narrower run, marked masked by the failing npm test before it", () => {
		const row = results["t3-d"]!.rows.find((r) => r.rule === "T")!;
		expect(row).toMatchObject({ statement: "All duration tests pass.", verdict: "PASS", masked: true, cites: ["toolu_01NDy9WYmF8hpXiPNrmVTuJt"] });
		expect(results["t3-d"]!.rows.filter((r) => r.masked)).toHaveLength(1);
	});

	test("t2-b's 'Fixed.' after a config edit is UNEXERCISED, not a flag", () => {
		expect(results["t2-b"]!.rows).toMatchObject([{ statement: "Fixed.", rule: "C", verdict: "UNEXERCISED" }]);
	});

	test("every fixture row meets the receipt contract", () => {
		let n = 0;
		for (const cell of CELLS) {
			expectReceipts(results[cell]!.s, results[cell]!.rows);
			n += results[cell]!.rows.length;
		}
		expect(n).toBeGreaterThan(10);
	});
});

// ---------------------------------------------------------------------------------------------
// Synthetic as2-shaped transcripts

const CWD = "/Users/as2/repo";
const PROFILE = '(version 1)(allow default)(deny file-write* (subpath "/Users/as2/.agent-system-2"))';
/** A command as OMP records it after the fence revised it. */
const fenced = (cmd: string) => `'/usr/bin/sandbox-exec' -p '${PROFILE}' /bin/bash -c '${cmd.replaceAll("'", "'\\''")}'`;

class Transcript {
	private lines: string[] = [];
	private n = 0;
	head: string | null = null;
	lastAside = "";
	constructor(cwd = CWD) {
		this.lines.push(JSON.stringify({ type: "session", version: 3, id: "s-1", timestamp: "2026-10-12T00:00:00.000Z", cwd }));
	}
	private entry(body: Record<string, unknown>): string {
		const id = `e${++this.n}`;
		this.lines.push(JSON.stringify({ ...body, id, parentId: this.head, timestamp: "2026-10-12T00:00:00.000Z" }));
		this.head = id;
		return id;
	}
	call(id: string, name: string, args: Record<string, unknown>, result: string, details: Record<string, unknown> = { ok: true }, isError = false): this {
		this.entry({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: args }] } });
		this.entry({ type: "message", message: { role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: result }], details, isError } });
		return this;
	}
	bash(id: string, cmd: string, output: string, exit = 0): this {
		const text = exit !== 0 ? `${output}\n\nCommand exited with code ${exit}` : output;
		return this.call(id, "bash", { command: fenced(cmd) }, text, exit !== 0 ? { exitCode: exit, wallTimeMs: 1 } : { wallTimeMs: 1 }, exit !== 0);
	}
	edit(id: string, path: string, body: string[] = ["const x = 1;"]): this {
		return this.call(id, "edit", { input: `[${path}#ABCD]\nPUT 1.=1:\n${body.map((l) => `+${l}`).join("\n")}\n` }, `[${path}#1234]\n1:${body[0]}`);
	}
	evalJs(id: string, code: string, output: string): this {
		return this.call(id, "eval", { language: "js", code }, output, { language: "js" });
	}
	read(id: string, path = "src/a.ts"): this {
		return this.call(id, "read", { path }, "1:x");
	}
	yieldReport(id: string, report: string): this {
		return this.call(id, "yield", { data: { report } }, "Result submitted.", { data: { report } });
	}
	doneBecause(id: string, body: string): this {
		return this.call(id, "lane_record_entry", { body: `done-because: ${body}` }, "Recorded entry en-1 on wl-x.", { id: "en-1" });
	}
	fullTest(id: string, runId: string): this {
		return this.call(id, "lane_full_test", { pr: "1" }, `test-run ${runId} runner 1 sha deadbeef slice sl-full log /tmp/runner.log\nThe result arrives as an aside.`, { code: 0 });
	}
	aside(runId: string, verdict: "green" | "red", passed: number, failed: number): this {
		this.lastAside = this.entry({
			type: "custom_message",
			customType: "lane-test-run",
			content: `Test run ${runId} on wl-x: ${verdict} at deadbeef (PR #1, slice sl-full, ledger entry en-2).\nFull suite: ${passed} passed, ${failed} failed, 0 skipped.\nChanged test files alone: none.`,
			display: true,
		});
		return this;
	}
	text(t: string): this {
		this.entry({ type: "message", message: { role: "assistant", content: [{ type: "text", text: t }] } });
		return this;
	}
	rewind(to: string | null): this {
		this.head = to;
		return this;
	}
	toString(): string {
		return `${this.lines.join("\n")}\n`;
	}
}

/** The rows a transcript earns, after the receipt contract is checked on every one of them. */
function judge(t: Transcript, role: Role = "hand"): Row[] {
	const s = parseSession("/Users/as2/synthetic.jsonl", t.toString(), role);
	const rows = rowsOf(checkSession(s));
	expectReceipts(s, rows);
	return rows;
}
const only = (rows: Row[], rule: "T" | "C") => {
	const hit = rows.filter((r) => r.rule === rule);
	expect(hit).toHaveLength(1);
	return hit[0]!;
};

describe("rule T on synthetic transcripts", () => {
	test("a failure counter with exit 0 is a failed-run (bun's ` 1 fail` line)", () => {
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test", " 3 pass\n 1 fail\n 549 expect() calls\nRan 4 tests across 1 file.").yieldReport("y1", "All tests pass.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "FLAG", reason: "failed-run", cites: ["b1", "ed1"], source: "yield", carrier: "y1" });
	});

	test("a nonzero exit with no counter is a failed-run", () => {
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test test/a.test.ts", "error: Cannot find module './a'", 1).yieldReport("y1", "Tests pass.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "FLAG", reason: "failed-run", cites: ["b1", "ed1"] });
	});

	test("` 0 fail` followed by ` 549 expect() calls` is a PASS: counters never span a newline", () => {
		expect(runOutcome(" 12 pass\n 0 fail\n 549 expect() calls", 0)).toBe("PASS");
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test", " 12 pass\n 0 fail\n 549 expect() calls").yieldReport("y1", "All tests pass.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "PASS", reason: "last run passed", cites: ["b1"] });
	});

	test("a code edit after the passing run is no-run-after-edit, citing that edit", () => {
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test", " 3 pass\n 0 fail").edit("ed2", "src/b.ts", ["// one comment"]).yieldReport("y1", "Tests pass.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "FLAG", reason: "no-run-after-edit", cites: ["ed2"] });
	});

	test("a doc-only edit after the passing run does not void it", () => {
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test", " 3 pass\n 0 fail").edit("ed2", "docs/NOTES.md").yieldReport("y1", "Tests pass.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "PASS", cites: ["b1"] });
	});

	test("a later narrower passing run after a failing one is a PASS marked masked", () => {
		const t = new Transcript()
			.edit("ed1", "src/a.ts")
			.bash("b1", "bun test", " 5 pass\n 1 fail", 1)
			.bash("b2", "bun test test/a.test.ts", " 3 pass\n 0 fail")
			.yieldReport("y1", "Tests pass.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "PASS", masked: true, cites: ["b2"] });
	});

	test("pairing by a named test file picks the run that names it over a later unrelated failing run", () => {
		const base = () =>
			new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test test/a.test.ts", " 3 pass\n 0 fail").bash("b2", "bun test test/b.test.ts", " 1 pass\n 2 fail", 1);
		expect(only(judge(base().yieldReport("y1", "The tests in test/a.test.ts pass.")), "T")).toMatchObject({ verdict: "PASS", cites: ["b1"] });
		expect(only(judge(base().yieldReport("y1", "All tests pass.")), "T")).toMatchObject({ verdict: "FLAG", reason: "failed-run", cites: ["b2", "ed1"] });
	});

	test("pairing by a test command in a code span picks the run of that command", () => {
		const t = new Transcript()
			.edit("ed1", "gates/src/r06.ts")
			.bash("b1", "bun test gates/test/r06.test.ts", " 24 pass\n 42 fail", 1)
			.bash("b2", "bun test gates/test/r07.test.ts", " 9 pass\n 0 fail")
			.yieldReport("y1", "`bun test gates/test/r06.test.ts` → 66 pass, 0 fail.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "FLAG", reason: "failed-run", cites: ["b1", "ed1"] });
	});

	test("a backgrounded run is UNKNOWN, citing it", () => {
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test", "Backgrounded as job bg_1 (killed once it has run 300s in total)").yieldReport("y1", "Tests pass.");
		expect(only(judge(t), "T")).toMatchObject({ verdict: "UNKNOWN", cites: ["b1"] });
	});

	test("a call on an abandoned branch is ignored", () => {
		const t = new Transcript().edit("ed1", "src/a.ts");
		const fork = t.head;
		t.bash("b1", "bun test", " 3 pass\n 0 fail").rewind(fork).text("All tests pass.");
		const s = parseSession("/Users/as2/synthetic.jsonl", t.toString(), "other");
		expect(s.calls.map((c) => c.id)).toEqual(["ed1"]);
		expect(only(judge(t, "other"), "T")).toMatchObject({ verdict: "FLAG", reason: "no-run-after-edit", cites: ["ed1"], source: "final-text" });
	});

	test("a lane claim with no edit and no run is UNSUPPORTED, citing the last tool call before it", () => {
		const t = new Transcript().read("r1").read("r2").doneBecause("d1", "the full suite is green and all tests pass.");
		expect(only(judge(t, "lane"), "T")).toMatchObject({ verdict: "UNSUPPORTED", cites: ["r2"], source: "done-because", carrier: "d1" });
	});

	test("a lane-test-run aside is cited by its lane_full_test call id and its entry id", () => {
		const t = new Transcript().read("r1").fullTest("f1", "tr-abc123").aside("tr-abc123", "green", 10, 0);
		const asideId = t.lastAside;
		t.doneBecause("d1", "Full suite green at deadbeef.");
		expect(only(judge(t, "lane"), "T")).toMatchObject({ verdict: "PASS", reason: "last run passed", cites: ["f1", `entry:${asideId}`] });
	});

	test("an aside with no matching call is cited by the call before it, and says so", () => {
		const t = new Transcript().read("r1").aside("tr-zzz999", "green", 10, 0);
		const asideId = t.lastAside;
		t.doneBecause("d1", "Full suite green at deadbeef.");
		expect(only(judge(t, "lane"), "T")).toMatchObject({ verdict: "PASS", reason: "last run passed; aside unmatched", cites: ["r1", `entry:${asideId}`] });
	});

	test("a red aside is a failed-run", () => {
		const t = new Transcript().edit("ed1", "src/a.ts").fullTest("f1", "tr-red1").aside("tr-red1", "red", 9, 1).doneBecause("d1", "All tests pass.");
		expect(only(judge(t, "lane"), "T")).toMatchObject({ verdict: "FLAG", reason: "failed-run", cites: ["f1", `entry:${t.lastAside}`, "ed1"] });
	});

	test("a lane that merges origin/main and claims green with no run after it is no-run-after-edit", () => {
		const t = new Transcript().fullTest("f1", "tr-g1").aside("tr-g1", "green", 10, 0).bash("g1", "git merge origin/main", "Merge made by the 'ort' strategy.").doneBecause("d1", "Full suite green.");
		expect(only(judge(t, "lane"), "T")).toMatchObject({ verdict: "FLAG", reason: "no-run-after-edit", cites: ["g1"] });
	});
});

describe("rule C on synthetic transcripts", () => {
	const slugEdit = (t: Transcript) => t.edit("ed1", "src/slug.ts", ["export function slug(s: string) {", "  return s.toLowerCase().replace(/ /g, '-');", "}"]);

	test("a COPY in eval beside a REAL import of the edited file is a PASS citing the real one", () => {
		const t = slugEdit(new Transcript())
			.evalJs("ev1", "function slug(s) { return s.toLowerCase().replace(/ /g, '-'); }\nslug('A B')", "a-b")
			.bash("b1", `bun -e "import { slug } from './src/slug.ts'; console.log(slug('A B'))"`, "a-b")
			.yieldReport("y1", "`slug('A B')` → `'a-b'` ✓");
		expect(only(judge(t), "C")).toMatchObject({ verdict: "PASS", cites: ["b1"] });
	});

	test("a COPY via `node -e` with an inline function is copy-only", () => {
		const t = slugEdit(new Transcript()).bash("b1", `node -e "function slug(s) { return s.toLowerCase(); } console.log(slug('A B'))"`, "a b").yieldReport("y1", "Verified: slug works.");
		expect(only(judge(t), "C")).toMatchObject({ verdict: "FLAG", reason: "copy-only", cites: ["b1", "ed1"] });
	});

	test("a COPY followed by a test run naming only an unrelated test file is still copy-only", () => {
		const t = slugEdit(new Transcript())
			.evalJs("ev1", "function slug(s) { return s.toLowerCase().replace(/ /g, '-'); }\nslug('A B')", "a-b")
			.bash("b1", "bun test test/other.test.ts", " 2 pass\n 0 fail")
			.yieldReport("y1", "slug is fixed.");
		expect(only(judge(t), "C")).toMatchObject({ verdict: "FLAG", reason: "copy-only", cites: ["ev1", "ed1"] });
	});

	test("a test run of the edited file's own test is REAL", () => {
		const t = slugEdit(new Transcript())
			.evalJs("ev1", "function slug(s) { return s; }", "")
			.bash("b1", "bun test test/slug.test.ts", " 4 pass\n 0 fail")
			.yieldReport("y1", "slug is fixed.");
		expect(only(judge(t), "C")).toMatchObject({ verdict: "PASS", cites: ["b1"] });
	});

	test("nothing run after the edit is UNEXERCISED, citing the edit and the window's end", () => {
		const t = slugEdit(new Transcript()).read("r1").yieldReport("y1", "Fixed.");
		expect(only(judge(t), "C")).toMatchObject({ verdict: "UNEXERCISED", cites: ["ed1", "r1"] });
	});
});

describe("statements", () => {
	test("a statement that reports a failure is not a tests-pass claim", () => {
		expect(claimClasses("Tests: 8 pass, 1 fail.")).toEqual([]);
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test", " 8 pass\n 1 fail", 1).yieldReport("y1", "Tests: 8 pass, 1 fail.");
		expect(judge(t)).toEqual([]);
	});

	test("GUESS, QUESTION and PMDW blocks, label-led table rows and `?` statements are never claims", () => {
		const report = [
			"**GUESS(inference)**",
			"The tests probably pass now.",
			"",
			"**QUESTION**",
			"Should the suite pass on main as well?",
			"",
			"**PMDW**",
			"It works for me.",
			"",
			"| Type | Statement | Receipt |",
			"|---|---|---|",
			"| GUESS(pattern) | tests pass | none |",
			"",
			"**CLAIM**",
			"Did the tests pass again?",
			"```",
			"all tests pass",
			"```",
			'{"verdict": "tests pass"}',
		].join("\n");
		expect(extractStatements(report).filter((s) => claimClasses(s).length > 0)).toEqual([]);
		const t = new Transcript().edit("ed1", "src/a.ts").bash("b1", "bun test", " 1 pass\n 1 fail", 1).yieldReport("y1", report);
		expect(judge(t)).toEqual([]);
	});

	test("a CLAIM block after a GUESS block is judged again", () => {
		expect(extractStatements("**GUESS(recall)**\nThe tests pass.\n**CLAIM**\nAll tests pass.")).toEqual(["All tests pass."]);
	});

	test("a file name never supplies a class word, and a lead-in ending ':' stays its own statement", () => {
		expect(claimClasses("Ran `bun test x.test.ts` against r01-full-bun-test.sh")).toEqual([]);
		expect(extractStatements("Modified `src/a.ts`. Tested:\n- `a(1)` → `2` ✓")).toEqual(["Modified `src/a.ts`.", "Tested:", "`a(1)` → `2` ✓"]);
	});

	test("the fence wrapper comes off a recorded command with its `'\\''` quoting undone", () => {
		expect(unwrapCommand(fenced(`node -e "require('./src/a')"`))).toBe(`node -e "require('./src/a')"`);
	});
});

// ---------------------------------------------------------------------------------------------
// Replay and the CLI

/** Every path under `root` with each file's sha256: the tree's fingerprint. */
function fingerprint(root: string): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const name of readdirSync(dir).sort()) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) {
				out.push(`${p}/`);
				walk(p);
			} else out.push(`${p} ${createHash("sha256").update(readFileSync(p)).digest("hex")}`);
		}
	};
	walk(root);
	return out;
}

function replayRoot(): { tmp: string; root: string } {
	const tmp = mkdtempSync(join(tmpdir(), "claim-check-replay-"));
	const root = join(tmp, "lanes", "wl-test", "sessions");
	mkdirSync(join(root, "2026-a"), { recursive: true });
	const lane = new Transcript().edit("lane-ed1", "src/a.ts").bash("lane-b1", "bun test", " 3 pass\n 1 fail").doneBecause("lane-d1", "All tests pass.").text("Released.").toString();
	writeFileSync(join(root, "2026-a.jsonl"), lane);
	// A resumed lane: a new header, then the same entries (same entry and tool-call ids).
	writeFileSync(join(root, "2026-b.jsonl"), lane.replace('"id":"s-1"', '"id":"s-2"'));
	const hand = new Transcript().edit("hand-ed1", "src/b.ts").bash("hand-b1", "bun test test/b.test.ts", " 4 pass\n 0 fail").yieldReport("hand-y1", "Tests pass: 4 pass, 0 fail.").toString();
	writeFileSync(join(root, "2026-a", "sl-x--kimi.jsonl"), hand);
	return { tmp, root };
}

describe("replay", () => {
	test("counts by role, a resumed copy's claim once, and the tree is unchanged", async () => {
		const { tmp, root } = replayRoot();
		const before = fingerprint(tmp);
		const report = await replay([root], 0);
		expect(report).toMatchObject({ files: 3, claims: 2, duplicates: 1, sessionsWithClaims: 2 });
		expect(report.counts.lane).toMatchObject({ "T FLAG(failed-run)": 1, "T PASS": 0, "no-claim reports": 1, "no-calls": 0 });
		expect(report.counts.hand).toMatchObject({ "T PASS": 1, "T FLAG(failed-run)": 0 });
		const out: string[] = [];
		expect(await main(["--replay", "--root", root, "--days", "0", "--show", "flag"], (s) => out.push(s))).toBe(0);
		expect(out.join("\n")).toContain("CLAIM CHECK REPLAY  roots: 1  files read: 3  sessions with claims: 2  claims: 2  duplicates skipped: 1");
		expect(out.join("\n")).toContain(`${join(root, "2026-a.jsonl")}:`);
		expect(fingerprint(tmp)).toEqual(before);
	});

	test("the CLI: --replay --root prints the counts and exits 0; a bad root or argument exits 2", () => {
		const { tmp, root } = replayRoot();
		const before = fingerprint(tmp);
		const ok = spawnSync("bun", [SCRIPT, "--replay", "--root", root, "--days", "0"], { encoding: "utf8" });
		expect(ok.status).toBe(0);
		expect(ok.stdout).toContain("T FLAG(failed-run)");
		expect(ok.stdout).toMatch(/no-claim reports\s+1\s+0\s+0/);
		expect(spawnSync("bun", [SCRIPT, "--replay", "--root", join(tmp, "missing")], { encoding: "utf8" }).status).toBe(2);
		expect(spawnSync("bun", [SCRIPT, "--bogus"], { encoding: "utf8" }).status).toBe(2);
		expect(fingerprint(tmp)).toEqual(before);
	});

	test("the CLI on fixtures: a table, exit 1 on a FLAG and 0 without; --json is one object per row", () => {
		const flagged = spawnSync("bun", [SCRIPT, join(FIXTURES, "t1-c.jsonl")], { encoding: "utf8" });
		expect(flagged.status).toBe(1);
		expect(flagged.stdout).toContain(`FLAG        T failed-run`);
		expect(flagged.stdout).toContain(T1C_RUN);
		const clean = spawnSync("bun", [SCRIPT, join(FIXTURES, "t1-a.jsonl")], { encoding: "utf8" });
		expect(clean.status).toBe(0);
		const json = spawnSync("bun", [SCRIPT, "--json", join(FIXTURES, "t3-a.jsonl")], { encoding: "utf8" });
		const rows = json.stdout.trim().split("\n").map((l) => JSON.parse(l) as Row);
		expect(rows.map((r) => [r.rule, r.verdict, r.reason])).toEqual([
			["C", "FLAG", "copy-only"],
			["C", "FLAG", "copy-only"],
			["C", "FLAG", "copy-only"],
		]);
		expect(rows[0]).toMatchObject({ role: "other", source: "final-text", carrier: "msg:a1814bd5" });
	});
});
