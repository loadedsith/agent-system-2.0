// P-11 row 8 on content-bound evidence (MIGRATION.md § M7 follow-ups item 13; wl-muptjioqjtvthc
// PLAN.md § 2): a push passes when the pushed commit contains every freshly fetched upstream and
// the workload's ledger holds a passing test record (`artifact-tree:`) for the pushed tree, or for
// a tree that differs from it only under `.ai/decision-log/`. Real git in temp repos with a bare
// origin; the last block drives the real fence, the lane's artifact recorder and row 8 together,
// including a done slice's tests re-run on a new commit (wl-mupzpidbb3ksg0 PLAN.md § 2).
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import laneRow from "../../surface/extensions/lane";
import { artifactTreeBody, artifactTrees } from "../../surface/src/signals";
import { ARTIFACT_TOOL } from "../../surface/src/types";
import { workingTree } from "../../surface/src/wtree";
import { ctxOf, fakePi } from "../../surface/test/helpers";
import pushRebaseRow from "../extensions/r08-push-rebase";
import { registerFence } from "../src/fence";
import { checkPushRebase, type TestRecords } from "../src/rows/r08-push-rebase";
import { isTestRunCommand } from "../src/test-run";
import type { CallContext, Refusal } from "../src/types";
import { advanceOriginMain, commit, git, repoWithOrigin, tempLedger, testRecord, tmp } from "./helpers";

const lane = (cwd: string): CallContext => ({ role: "lane", cwd, env: { HOME: "/nonexistent-home" } });
const bash = (command: string) => ({ toolName: "bash", input: { command } });
const verdict = (r: Refusal): "ALLOW" | "REFUSE" => (r === null ? "ALLOW" : "REFUSE");
const PUSH = "git push origin feat";
const check = (work: string, records: TestRecords, command = PUSH) => checkPushRebase(bash(command), lane(work), records);
const pushVerdict = (work: string, records: TestRecords, command = PUSH) => verdict(check(work, records, command));

/** A branch `feat` one commit ahead of the main it was cut from, with origin/main advanced since and fetched. */
function feature() {
	const r = repoWithOrigin();
	git(r.work, "switch", "-q", "-c", "feat");
	commit(r.work, "f.txt", "f\n");
	advanceOriginMain(r.root, r.origin);
	git(r.work, "fetch", "-q", "origin");
	return r;
}
/** `feat` rebased onto the advanced origin/main. */
function rebased() {
	const r = feature();
	git(r.work, "rebase", "-q", "origin/main");
	return r;
}
/** `feat` with the advanced origin/main merged in: HEAD is a merge commit. */
function merged() {
	const r = feature();
	git(r.work, "merge", "-q", "--no-edit", "origin/main");
	return r;
}

/** REVIEW.md B1: commands whose exit status is not a test runner's verdict on the tree, or that run no test. */
const NOT_A_BARE_RUN = [
	"echo bun test",
	"true # bun test",
	"bun test --help",
	"bun test x.test.ts 2>&1 | tail -n 40",
	"bun test x.test.ts || true",
	"bun test x.test.ts; exit 0",
	"grep -rn 'bun test' tiers",
	"cd /tmp/elsewhere && bun test",
	"rg -c jest .",
	"bunx vitest --version",
	"bun test x || true",
	"bun test x | cat",
	"bun test x; true",
	"bun test x &",
	"bash -c 'bun test'",
];

describe("isTestRunCommand: one bare test-runner invocation, nothing the shell could chain, pipe or redirect", () => {
	test.each([
		["bun test", true],
		["bun test a.test.ts b.test.ts", true],
		["bun test -t name x.test.ts", true],
		["  bun test x.test.ts\t", true],
		["pytest -v tests", true],
		["npx vitest run", true],
		["jest", true],
		["go test ./...", true],
		["just gate-test", true],
		["bun testing", false],
		["FOO=1 bun test", false],
		["bun test x.test.ts > out.log", false],
		["bun test $(ls *.test.ts)", false],
		["bun test x.test.ts\nexit 0", false],
		["bun test x.test.ts\rexit 0", false],
		["bun test -h", false],
		["", false],
		...NOT_A_BARE_RUN.map((c): [string, boolean] => [c, false]),
	])("%p → %p", (command, bare) => {
		expect(isTestRunCommand(command)).toBe(bare);
	});
});

describe("row 8 allows a push that contains the upstream and carries a test record for its tree", () => {
	test("a rebased branch with a record on its tree", () => {
		const { work } = rebased();
		expect(pushVerdict(work, () => [testRecord(work)])).toBe("ALLOW");
	});
	test("a merge-based branch: origin/main merged in, the record on the merge commit's tree, a plain push", () => {
		const { work } = merged();
		expect(git(work, "rev-list", "--parents", "-n", "1", "HEAD").split(" ")).toHaveLength(3);
		expect(pushVerdict(work, () => [testRecord(work)])).toBe("ALLOW");
	});
	test("a commit after the record that touches only .ai/decision-log/", () => {
		const { work } = rebased();
		const record = testRecord(work);
		mkdirSync(join(work, ".ai", "decision-log"), { recursive: true });
		commit(work, ".ai/decision-log/x.md", "close entry\n");
		expect(pushVerdict(work, () => [record])).toBe("ALLOW");
	});
	test("a record written on an earlier slice of the workload, now done", () => {
		const { work } = rebased();
		const { ledger } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "b", stakes: "normal", mode: "autonomous" });
		const first = ledger.addSlice({ by: "lane-1", workloadId: wl, task: "build it", doneCondition: "d", inputs: "i" });
		const { repo, tree, command } = testRecord(work);
		ledger.recordEntry({ by: "lane-1", workloadId: wl, sliceId: first, kind: "assumption", body: artifactTreeBody({ repo, tree, command }) });
		ledger.completeSlice(first, { by: "lane-1", artifact: "bun test → 0 fail" });
		ledger.addSlice({ by: "lane-2", workloadId: wl, task: "push it", doneCondition: "d", inputs: "i" });
		expect(ledger.slice(first)?.state).toBe("done");
		expect(pushVerdict(work, () => artifactTrees(ledger, wl))).toBe("ALLOW");
	});
	test("a push that cds into the repository is judged there", () => {
		const { root, work } = rebased();
		expect(pushVerdict(root, () => [testRecord(work)], `cd ${work} && git push origin feat`)).toBe("ALLOW");
	});
	test("a tags-only push and a branch deletion are not row 8's to judge, even with no workload", () => {
		const { work } = rebased();
		git(work, "tag", "v1");
		expect(pushVerdict(work, null, "git push origin --tags")).toBe("ALLOW");
		expect(pushVerdict(work, null, "git push origin refs/tags/v1")).toBe("ALLOW");
		expect(pushVerdict(work, null, "git push origin --delete old")).toBe("ALLOW");
	});
	test("a bare runner with several files or a name filter", () => {
		const { work } = rebased();
		expect(pushVerdict(work, () => [testRecord(work, { command: "bun test a.test.ts b.test.ts" })])).toBe("ALLOW");
		expect(pushVerdict(work, () => [testRecord(work, { command: "bun test -t name x.test.ts" })])).toBe("ALLOW");
	});
});

describe("row 8 refuses a push with no matching test record", () => {
	test("no record at all", () => {
		const { work } = rebased();
		const r = check(work, () => []);
		expect(r?.reason).toContain(`pushed tree ${git(work, "rev-parse", "HEAD^{tree}").slice(0, 12)}`);
		expect(r?.reason).toContain("0 test records");
	});
	test("a record on an older tree: a commit after the test run", () => {
		const { work } = rebased();
		const record = testRecord(work);
		commit(work, "later.txt", "later\n");
		const r = check(work, () => [record]);
		expect(verdict(r)).toBe("REFUSE");
		expect(r?.reason).toContain(record.tree.slice(0, 12));
		expect(r?.reason).toContain("later.txt");
	});
	test("a record whose command is not a test run", () => {
		const { work } = rebased();
		expect(pushVerdict(work, () => [testRecord(work, { command: "grep -n x f" })])).toBe("REFUSE");
	});
	test.each(NOT_A_BARE_RUN)("a record on the pushed tree whose command is not one bare runner: %p", (command) => {
		const { work } = rebased();
		const r = check(work, () => [testRecord(work, { command })]);
		expect(verdict(r)).toBe("REFUSE");
		expect(r?.reason).toContain("1 test record for");
		expect(r?.reason).toContain("none from a bare test-runner command");
	});
	test("a record for another repository, on the same tree", () => {
		const { work } = rebased();
		const other = repoWithOrigin();
		expect(pushVerdict(work, () => [testRecord(work, { repo: git(other.work, "rev-parse", "--show-toplevel") })])).toBe("REFUSE");
	});
	test("a record on another workload", () => {
		const { work } = rebased();
		const { ledger } = tempLedger();
		const mine = ledger.openWorkload({ by: "orch", brief: "mine", stakes: "normal", mode: "autonomous" });
		const theirs = ledger.openWorkload({ by: "orch", brief: "theirs", stakes: "normal", mode: "autonomous" });
		const sl = ledger.addSlice({ by: "orch", workloadId: theirs, task: "t", doneCondition: "d", inputs: "i" });
		const { repo, tree, command } = testRecord(work);
		ledger.recordEntry({ by: "lane-9", workloadId: theirs, sliceId: sl, kind: "assumption", body: artifactTreeBody({ repo, tree, command }) });
		expect(pushVerdict(work, () => artifactTrees(ledger, mine))).toBe("REFUSE");
		expect(pushVerdict(work, () => artifactTrees(ledger, theirs))).toBe("ALLOW");
	});
	test("a merge-based branch with a matching record, but origin/main advanced again after the merge", () => {
		const { root, origin, work } = merged();
		const record = testRecord(work);
		advanceOriginMain(root, origin);
		expect(check(work, () => [record])?.reason).toContain("does not contain origin/main");
	});
	test("a record whose tree held a stray untracked file: the tested tree is not the commit's", () => {
		const { work } = rebased();
		writeFileSync(join(work, "stray.txt"), "not committed\n");
		const ran = workingTree(work)!;
		expect(ran.tree).not.toBe(git(work, "rev-parse", "HEAD^{tree}"));
		const r = check(work, () => [testRecord(work, { tree: ran.tree })]);
		expect(verdict(r)).toBe("REFUSE");
		expect(r?.reason).toContain("stray.txt");
	});
	test("a rename into .ai/decision-log/ also removes a tested path", () => {
		const { work } = rebased();
		const record = testRecord(work);
		mkdirSync(join(work, ".ai", "decision-log"), { recursive: true });
		git(work, "mv", "f.txt", ".ai/decision-log/f.txt");
		git(work, "commit", "-q", "-m", "move");
		expect(pushVerdict(work, () => [record])).toBe("REFUSE");
	});
	test("no workload", () => {
		const { work } = rebased();
		expect(check(work, null)?.reason).toContain("this session has no workload, so the ledger holds no test record for it");
	});
	test("a ledger that cannot be read", () => {
		const { work } = rebased();
		const r = check(work, () => {
			throw new Error("database is locked");
		});
		expect(r?.reason).toContain("database is locked");
	});
});

describe("row 8 finds the push's destination and fails closed on what it cannot read", () => {
	test("the remote comes from branch.<b>.pushRemote when the push names none, and its default branch is the upstream", () => {
		const { root, origin, work } = rebased();
		const fork = join(root, "fork.git");
		git(root, "clone", "-q", "--bare", origin, fork);
		git(work, "remote", "add", "fork", fork);
		git(work, "fetch", "-q", "fork");
		git(work, "remote", "set-head", "fork", "main");
		advanceOriginMain(root, fork);
		const records = () => [testRecord(work)];
		expect(pushVerdict(work, records, "git push")).toBe("ALLOW"); // no config: origin
		git(work, "config", "branch.feat.pushRemote", "fork");
		expect(check(work, records, "git push")?.reason).toContain("does not contain fork/main");
	});
	test("the tracked branch on the remote is an upstream too", () => {
		const { root, origin, work } = rebased();
		git(work, "push", "-q", "-u", "origin", "feat");
		const other = join(root, "other-feat");
		git(root, "clone", "-q", "-b", "feat", origin, other);
		commit(other, "theirs.txt", "theirs\n");
		git(other, "push", "-q", "origin", "feat");
		expect(check(work, () => [testRecord(work)])?.reason).toContain("does not contain origin/feat");
	});
	test("a detached HEAD refuses a push of HEAD", () => {
		const { work } = rebased();
		git(work, "checkout", "-q", "--detach");
		expect(check(work, () => [testRecord(work)], "git push origin HEAD:feat")?.reason).toContain("detached HEAD");
	});
	test("a fetch that fails refuses", () => {
		const { work } = rebased();
		git(work, "remote", "set-url", "origin", join(tmp("r8-gone"), "missing.git"));
		expect(check(work, () => [testRecord(work)])?.reason).toContain("`git fetch origin` failed");
	});
});

describe("fenced lane, end to end: the fence, the lane's artifact recorder and row 8 on one session", () => {
	test("a fenced declared test artifact records the tree; the push goes through; a commit after it is refused", async () => {
		const { work } = merged();
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "ship feat", stakes: "normal", mode: "autonomous" });
		const sl = ledger.addSlice({ by: "orch", workloadId: wl, task: "ship the branch", doneCondition: "tests pass", inputs: "feat" });
		const env = { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-a", HOME: tmp("r8-fence-home"), PATH: process.env.PATH ?? "" };
		const f = fakePi();
		// The load order gates/index.ts and the surface use: the surface first, row 8, the fence last.
		laneRow(f.pi, env);
		pushRebaseRow(f.pi as never, env);
		registerFence(f.pi as never, env, async () => ({ enabled: true, autoBackground: true }));
		const ctx = ctxOf({ cwd: work });
		await f.emit("session_start", { type: "session_start" }, ctx);
		const ARTIFACT = "bun test gates/test/r08-tree-evidence.test.ts";
		await f.tool(ARTIFACT_TOOL).execute("d1", { slice: sl, command: ARTIFACT }, undefined, undefined, ctx);

		type Revised = { block?: boolean; reason?: string; input?: { command: string } } | undefined;
		const ran = (await f.emit("tool_call", { toolName: "bash", toolCallId: "t1", input: { command: ARTIFACT } }, ctx)) as Revised;
		expect(ran?.block).toBeUndefined();
		const wrapped = ran!.input!.command;
		expect(wrapped).toContain("sandbox-exec");
		await f.emit("tool_result", { toolName: "bash", toolCallId: "t1", input: { command: wrapped }, details: {}, isError: false }, ctx);
		const tree = git(work, "rev-parse", "HEAD^{tree}");
		expect(artifactTrees(ledger, wl)).toEqual([{ sliceId: sl, repo: git(work, "rev-parse", "--show-toplevel"), tree, command: ARTIFACT }]);

		const pushed = (await f.emit("tool_call", { toolName: "bash", toolCallId: "p1", input: { command: PUSH } }, ctx)) as Revised;
		expect(pushed?.block).toBeUndefined();
		expect(pushed?.input?.command).toContain(PUSH);

		commit(work, "f.txt", "changed after the test run\n");
		const refused = (await f.emit("tool_call", { toolName: "bash", toolCallId: "p2", input: { command: PUSH } }, ctx)) as Revised;
		expect(refused?.block).toBe(true);
		expect(refused?.reason).toContain("P-11 row 8");
		expect(refused?.reason).toContain("f.txt");
	});
	test("a declared artifact that pipes a failing run through tail exits 0 and records the tree, and the push is still refused", async () => {
		const { work } = merged();
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "ship feat", stakes: "normal", mode: "autonomous" });
		const sl = ledger.addSlice({ by: "orch", workloadId: wl, task: "ship the branch", doneCondition: "tests pass", inputs: "feat" });
		const env = { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-a", HOME: tmp("r8-mask-home"), PATH: process.env.PATH ?? "" };
		const f = fakePi();
		laneRow(f.pi, env);
		pushRebaseRow(f.pi as never, env);
		registerFence(f.pi as never, env, async () => ({ enabled: true, autoBackground: true }));
		const ctx = ctxOf({ cwd: work });
		await f.emit("session_start", { type: "session_start" }, ctx);
		const ARTIFACT = "bun test failing.test.ts 2>&1 | tail -n 5";
		await f.tool(ARTIFACT_TOOL).execute("d1", { slice: sl, command: ARTIFACT }, undefined, undefined, ctx);

		type Revised = { block?: boolean; reason?: string; input?: { command: string } } | undefined;
		const ran = (await f.emit("tool_call", { toolName: "bash", toolCallId: "t1", input: { command: ARTIFACT } }, ctx)) as Revised;
		expect(ran?.block).toBeUndefined();
		// `tail` exits 0 whatever the tests did; OMP reports the pipeline as a plain success.
		await f.emit("tool_result", { toolName: "bash", toolCallId: "t1", input: { command: ran!.input!.command }, details: {}, isError: false }, ctx);
		const tree = git(work, "rev-parse", "HEAD^{tree}");
		expect(artifactTrees(ledger, wl)).toEqual([{ sliceId: sl, repo: git(work, "rev-parse", "--show-toplevel"), tree, command: ARTIFACT }]);

		const pushed = (await f.emit("tool_call", { toolName: "bash", toolCallId: "p1", input: { command: PUSH } }, ctx)) as Revised;
		expect(pushed?.block).toBe(true);
		expect(pushed?.reason).toContain("P-11 row 8");
		expect(pushed?.reason).toContain("none from a bare test-runner command");
	});
	test("a done slice's declared tests re-run after a new commit record the new tree: the push is refused before the re-run and goes through after it", async () => {
		const { work } = merged();
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "ship feat", stakes: "normal", mode: "autonomous" });
		const sl = ledger.addSlice({ by: "orch", workloadId: wl, task: "ship the branch", doneCondition: "tests pass", inputs: "feat" });
		const env = { AGENT_SYSTEM_ROLE: "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-a", HOME: tmp("r8-rerun-home"), PATH: process.env.PATH ?? "" };
		const f = fakePi();
		laneRow(f.pi, env);
		pushRebaseRow(f.pi as never, env);
		registerFence(f.pi as never, env, async () => ({ enabled: true, autoBackground: true }));
		const ctx = ctxOf({ cwd: work });
		await f.emit("session_start", { type: "session_start" }, ctx);
		const ARTIFACT = "bun test gates/test/r08-tree-evidence.test.ts";
		await f.tool(ARTIFACT_TOOL).execute("d1", { slice: sl, command: ARTIFACT }, undefined, undefined, ctx);

		type Revised = { block?: boolean; reason?: string; input?: { command: string } } | undefined;
		const runArtifact = async (id: string) => {
			const ran = (await f.emit("tool_call", { toolName: "bash", toolCallId: id, input: { command: ARTIFACT } }, ctx)) as Revised;
			expect(ran?.block).toBeUndefined();
			await f.emit("tool_result", { toolName: "bash", toolCallId: id, input: { command: ran!.input!.command }, details: {}, isError: false }, ctx);
		};
		await runArtifact("t1");
		const old = git(work, "rev-parse", "HEAD^{tree}");
		ledger.completeSlice(sl, { by: "lane-a", artifact: "passed" });

		commit(work, "f.txt", "changed after the slice closed\n");
		const now = git(work, "rev-parse", "HEAD^{tree}");
		expect(now).not.toBe(old);
		expect(artifactTrees(ledger, wl).filter((t) => t.tree === now)).toEqual([]);
		const before = (await f.emit("tool_call", { toolName: "bash", toolCallId: "p1", input: { command: PUSH } }, ctx)) as Revised;
		expect(before?.block).toBe(true);
		expect(before?.reason).toContain("P-11 row 8");

		await runArtifact("t2");
		expect(artifactTrees(ledger, wl).filter((t) => t.tree === now)).toEqual([{ sliceId: sl, repo: git(work, "rev-parse", "--show-toplevel"), tree: now, command: ARTIFACT }]);
		const after = (await f.emit("tool_call", { toolName: "bash", toolCallId: "p2", input: { command: PUSH } }, ctx)) as Revised;
		expect(after?.block).toBeUndefined();
		expect(after?.input?.command).toContain(PUSH);
	});
});
