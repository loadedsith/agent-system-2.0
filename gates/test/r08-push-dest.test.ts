// P-11 row 8's destination resolution and `push-dest:` records (MIGRATION.md item 24;
// wl-muraerdsgw7gn4 PLAN.md § 2.2 step 2, § 6 row S4c). Row 8 resolves each branch a let-through
// push updates, statically, and the extension writes one `push-dest: <remote> <branch> <sha>` per
// branch at tool_call, as the lane holding the workload. It refuses a mirroring remote, `--all`,
// `--mirror`, wildcard refspecs, destinations it cannot follow (a remote.<name>.push mapping on a
// bare push or a lone src; push.default matching or nothing) and a push sharing its bash call.
// Real git config in temp repos with a bare origin; every push is judged, none runs.
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { artifactTreeBody } from "../../surface/src/signals";
import { boundBranches, parsePushDest } from "../../surface/src/test-run";
import { ctxOf, fakePi } from "../../surface/test/helpers";
import pushRebaseRow from "../extensions/r08-push-rebase";
import { judgePush, type PushJudgment, type TestRecords } from "../src/rows/r08-push-rebase";
import type { CallContext } from "../src/types";
import { commit, git, repoWithOrigin, tempLedger, testRecord, tmp } from "./helpers";

const lane = (cwd: string): CallContext => ({ role: "lane", cwd, env: { HOME: "/nonexistent-home" } });
const bash = (command: string) => ({ toolName: "bash", input: { command } });

/** `feat` one commit ahead of origin/main, checked out, with push.default set in the repository's own config. */
function feature(pushDefault = "simple") {
	const r = repoWithOrigin();
	git(r.work, "switch", "-q", "-c", "feat");
	commit(r.work, "f.txt", "f\n");
	git(r.work, "config", "push.default", pushDefault);
	return { ...r, head: git(r.work, "rev-parse", "HEAD") };
}

/** Row 8 on `command` from `work`, with a passing test record on HEAD's tree. */
const judge = (work: string, command: string, records: TestRecords = () => [testRecord(work)]): PushJudgment => judgePush(bash(command), lane(work), records);
const branches = (j: PushJudgment) => j.dests.map((d) => d.branch);
const EXPLICIT = "push with an explicit `<src>:<dst>` refspec";

describe("row 8 resolves where a let-through push lands", () => {
	test("a bare push under push.default simple gives the current branch", () => {
		const { work, head } = feature("simple");
		const j = judge(work, "git push");
		expect(j.refusal).toBeNull();
		expect(j.dests).toEqual([{ remote: "origin", branch: "feat", sha: head }]);
	});
	test("a bare push under push.default current gives the current branch", () => {
		const { work, head } = feature("current");
		expect(judge(work, "git push origin").dests).toEqual([{ remote: "origin", branch: "feat", sha: head }]);
	});
	test("a bare push under push.default upstream gives branch.<b>.merge", () => {
		const { work, head } = feature("upstream");
		git(work, "config", "branch.feat.remote", "origin");
		git(work, "config", "branch.feat.merge", "refs/heads/wl/up");
		const j = judge(work, "git push");
		expect(j.refusal).toBeNull();
		expect(j.dests).toEqual([{ remote: "origin", branch: "wl/up", sha: head }]);
	});
	test("`git push origin HEAD:wl/other` alone records wl/other, not the current branch", () => {
		const { work, head } = feature();
		const j = judge(work, "git push origin HEAD:wl/other");
		expect(j.refusal).toBeNull();
		expect(j.dests).toEqual([{ remote: "origin", branch: "wl/other", sha: head }]);
	});
	test("two refspecs record two destinations, each with its source's commit", () => {
		const { work, head } = feature();
		const j = judge(work, "git push origin feat HEAD:refs/heads/wl/two");
		expect(j.refusal).toBeNull();
		expect(j.dests).toEqual([
			{ remote: "origin", branch: "feat", sha: head },
			{ remote: "origin", branch: "wl/two", sha: head },
		]);
	});
	test("a lone src with no remote.<name>.push mapping gives the same branch name", () => {
		const { work, head } = feature();
		git(work, "branch", "side");
		git(work, "config", "push.default", "nothing"); // push.default governs only a push with no refspec
		const j = judge(work, "git push origin side");
		expect(j.refusal).toBeNull();
		expect(j.dests).toEqual([{ remote: "origin", branch: "side", sha: head }]);
	});
	test("a push that cds into the repository is still its own command", () => {
		const { root, work } = feature();
		const j = judgePush(bash(`cd ${work} && git push origin HEAD:wl/cd`), lane(root), () => [testRecord(work)]);
		expect(j.refusal).toBeNull();
		expect(branches(j)).toEqual(["wl/cd"]);
	});
});

describe("a remote.<name>.push mapping: a destination resolution cannot follow is refused, an explicit one is not remapped", () => {
	function mapped() {
		const r = repoWithOrigin();
		git(r.work, "switch", "-q", "-c", "wl/source");
		commit(r.work, "s.txt", "s\n");
		git(r.work, "config", "push.default", "simple");
		git(r.work, "config", "remote.origin.push", "refs/heads/wl/source:refs/heads/wl/target");
		return r;
	}
	test.each(["git push", "git push origin", "git push origin wl/source"])("%p refuses", (command) => {
		const { work } = mapped();
		const j = judge(work, command);
		expect(j.refusal?.reason).toContain(EXPLICIT);
		expect(j.refusal?.reason).toContain("remote.origin.push mapping");
		expect(j.dests).toEqual([]);
	});
	test("an explicit `HEAD:wl/x` is allowed and records wl/x", () => {
		const { work } = mapped();
		const j = judge(work, "git push origin HEAD:wl/x");
		expect(j.refusal).toBeNull();
		expect(j.dests).toEqual([{ remote: "origin", branch: "wl/x", sha: git(work, "rev-parse", "HEAD") }]);
	});
});

describe("row 8 refuses a push whose branches it cannot name", () => {
	test("remote.origin.mirror=true refuses, even with an explicit refspec", () => {
		const { work } = feature();
		git(work, "config", "remote.origin.mirror", "true");
		for (const command of ["git push origin HEAD:wl/x", "git push origin feat", "git push"]) {
			const j = judge(work, command);
			expect(j.refusal?.reason).toContain("remote.origin.mirror");
			expect(j.dests).toEqual([]);
		}
	});
	test("a mirroring remote named by --repo refuses", () => {
		const { root, origin, work } = feature();
		const backup = join(root, "backup.git");
		git(root, "clone", "-q", "--bare", origin, backup);
		git(work, "remote", "add", "backup", backup);
		git(work, "config", "remote.backup.mirror", "true");
		expect(judge(work, "git push --repo=backup").refusal?.reason).toContain("remote.backup.mirror");
		expect(judge(work, "git push --repo backup").refusal?.reason).toContain("remote.backup.mirror");
	});
	test.each(["matching", "nothing"])("push.default=%s refuses a bare push", (mode) => {
		const { work } = feature(mode);
		const j = judge(work, "git push origin");
		expect(j.refusal?.reason).toContain(EXPLICIT);
		expect(j.refusal?.reason).toContain(`push.default is '${mode}'`);
		expect(j.dests).toEqual([]);
	});
	test.each(["git push origin --all", "git push --all", "git push origin --branches", "git push --mirror origin", "git push --mirror"])("%p refuses", (command) => {
		const { work } = feature();
		const j = judge(work, command);
		expect(j.refusal?.reason).toMatch(/`--(all|branches|mirror)` pushes every/);
		expect(j.dests).toEqual([]);
	});
	test.each(["git push origin 'refs/heads/*:refs/heads/*'", "git push origin '+refs/heads/wl/*:refs/heads/wl/*'", "git push origin :"])("a wildcard or matching refspec refuses: %p", (command) => {
		const { work } = feature();
		const j = judge(work, command);
		expect(j.refusal?.block).toBe(true);
		expect(j.refusal?.reason).toContain(EXPLICIT);
		expect(j.dests).toEqual([]);
	});
	test("a lone src that is no local branch refuses", () => {
		const { work, head } = feature();
		expect(judge(work, `git push origin ${head}`).refusal?.reason).toContain(EXPLICIT);
	});
	test("push.default upstream with no upstream branch refuses", () => {
		const { work } = feature("upstream");
		expect(judge(work, "git push origin").refusal?.reason).toContain(EXPLICIT);
	});
	test.each([
		"git switch wl/other && git push origin",
		"git checkout -q wl/other; git push origin feat",
		"git fetch origin && git push origin feat",
		"git push origin feat | cat",
		"git push origin feat && git push origin HEAD:wl/two",
	])("a push in a compound command refuses: %p", (command) => {
		const { work } = feature();
		git(work, "branch", "wl/other");
		const j = judge(work, command);
		expect(j.refusal?.reason).toContain("push in its own command");
		expect(j.refusal?.reason).toContain("shares its bash call with");
		expect(j.dests).toEqual([]);
	});
});

describe("a tag-only push records nothing", () => {
	test.each(["git push origin refs/tags/v1", "git push origin --tags", "git push origin v1", "git push origin HEAD:refs/tags/v2", "git push origin v1:wl/tagged"])("%p", (command) => {
		const { work } = feature();
		git(work, "tag", "v1");
		const j = judge(work, command);
		expect(j.refusal).toBeNull();
		expect(j.dests).toEqual([]);
	});
});

describe("the extension writes push-dest entries at tool_call, as the lane, once row 8 lets the push through", () => {
	type Revised = { block?: boolean; reason?: string } | undefined;
	function laneSession(o: { role?: string; workload?: boolean } = {}) {
		const r = feature();
		const { ledger, path } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "ship feat", stakes: "normal", mode: "autonomous" });
		const sl = ledger.addSlice({ by: "orch", workloadId: wl, task: "push the branch", doneCondition: "pushed", inputs: "feat" });
		const env: Record<string, string> = { AGENT_SYSTEM_ROLE: o.role ?? "lane", AGENT_SYSTEM_LEDGER_DB: path, AGENT_SYSTEM_LANE_ID: "lane-a", HOME: tmp("r8-dest-home"), PATH: process.env.PATH ?? "" };
		if (o.workload !== false) env.AGENT_SYSTEM_WORKLOAD_ID = wl;
		const f = fakePi();
		pushRebaseRow(f.pi as never, env);
		const ctx = ctxOf({ cwd: r.work });
		const push = async (command: string, id = "p1") => (await f.emit("tool_call", { toolName: "bash", toolCallId: id, input: { command } }, ctx)) as Revised;
		const tested = () => {
			const { repo, tree, command } = testRecord(r.work);
			ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "assumption", body: artifactTreeBody({ repo, tree, command }) });
		};
		const recorded = () => ledger.entries(wl).filter((e) => e.body.startsWith("push-dest:"));
		return { ...r, ledger, wl, push, tested, recorded };
	}

	test("a let-through push writes one entry per destination, by the lane, before the push runs", async () => {
		const s = laneSession();
		s.tested();
		const before = git(s.origin, "for-each-ref", "refs/heads/");
		expect((await s.push("git push origin feat HEAD:wl/other"))?.block).toBeUndefined();
		const rows = s.recorded();
		expect(rows.map((e) => [e.created_by, e.kind, parsePushDest(e.body)])).toEqual([
			["lane-a", "assumption", { remote: "origin", branch: "feat", sha: s.head }],
			["lane-a", "assumption", { remote: "origin", branch: "wl/other", sha: s.head }],
		]);
		expect(git(s.origin, "for-each-ref", "refs/heads/")).toBe(before); // judged at tool_call; nothing ran
		expect(boundBranches(s.wl, s.ledger.entries(s.wl), ["lane-a"])).toEqual([`wl/${s.wl}`, "feat", "wl/other"]);
	});
	test("a push row 8 refused records nothing", async () => {
		const s = laneSession();
		const refused = await s.push("git push origin feat");
		expect(refused?.block).toBe(true);
		expect(refused?.reason).toContain("0 test records");
		s.tested();
		expect((await s.push("git switch main && git push origin feat", "p2"))?.reason).toContain("push in its own command");
		git(s.work, "config", "remote.origin.mirror", "true");
		expect((await s.push("git push origin HEAD:wl/x", "p3"))?.block).toBe(true);
		expect(s.recorded()).toEqual([]);
	});
	test("a tag-only push records nothing", async () => {
		const s = laneSession();
		s.tested();
		git(s.work, "tag", "v1");
		expect((await s.push("git push origin refs/tags/v1"))?.block).toBeUndefined();
		expect((await s.push("git push origin --tags", "p2"))?.block).toBeUndefined();
		expect(s.recorded()).toEqual([]);
	});
	test("a push outside any lane records nothing: no workload, or the orchestrator", async () => {
		const loose = laneSession({ workload: false });
		loose.tested();
		git(loose.work, "tag", "v1");
		expect((await loose.push("git push origin refs/tags/v1"))?.block).toBeUndefined();
		expect((await loose.push("git push origin feat", "p2"))?.reason).toContain("this session has no workload");
		expect(loose.recorded()).toEqual([]);
		const orch = laneSession({ role: "orchestrator" });
		orch.tested();
		expect((await orch.push("git push origin feat"))?.block).toBeUndefined();
		expect(orch.recorded()).toEqual([]);
	});
	test("a destination the ledger cannot carry refuses the push instead of letting it through unrecorded", async () => {
		const s = laneSession();
		s.tested();
		const r = await s.push("git push origin 'HEAD:wl/a b'");
		expect(r?.block).toBe(true);
		expect(r?.reason).toContain("its destination could not be recorded");
		expect(s.recorded()).toEqual([]);
	});
});
