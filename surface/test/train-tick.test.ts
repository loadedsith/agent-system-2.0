// The merge train's tick (PLAN wl-mv8s8srodefytc rev 17.1 D9-D10, part 3): settles once, opens one fix workload per PR,
// launches owners and the train, raises the failed-twice alert, files each alert once on jo-issues with the as2-train label,
// re-sends it louder at 4 h and 8 h until acknowledged, and keeps acting while a question is open.
// Temp ledgers, temp git checkouts with a fake GitHub origin, a fake gh, a fake launcher and a fake notification only.
import { describe, expect, test } from "bun:test";
import { LANE_STARTER_BY, type Ledger, TEST_RUNNER_BY } from "../../ledger/src/index";
import { type GhResult, tick } from "../scripts/train-tick";
import { recordRepo } from "../src/decision-log";
import { errorLines } from "../src/errors";
import { applyTrain, interpret } from "../src/input";
import { controlEntries, decideLaunch } from "../src/launch";
import { fixBindings, recordTrainTask, TRAIN_ALERT_LABEL, TRAIN_ALERT_REPO, trainAlertBody, trainAlertMarker, trainSliceId, type TrainTask } from "../src/merge-train";
import { makeRunId, testRequestedBody, type TestRun, testRunBody } from "../src/test-run";
import { MERGE_TRAIN_BY, SURFACE_BY } from "../src/types";
import { clock, tempLedger, tmp } from "./helpers";

const REPO = "thewolff/product";
const TRAIN_LANE = "lane-train-1";
const OWNER_LANE = "lane-owner-1";
const JO = { by: SURFACE_BY, author: "jo", channel: "surface" as const };
const H0 = "a".repeat(40);
const H1 = "b".repeat(40);
const H2 = "c".repeat(40);

function checkout(): string {
	const dir = tmp("train-tick-repo");
	for (const args of [["init", "-q"], ["config", "remote.origin.url", `https://github.com/${REPO}.git`]]) {
		const r = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
		if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
	}
	return dir;
}

interface FakeIssue {
	number: number;
	url: string;
	title: string;
	body: string;
	state: "OPEN" | "CLOSED";
	labels: string[];
	comments: string[];
}

/** gh as the tick calls it: PR views from `prs`, and an issue tracker for jo-issues. `fail` makes a matching call exit 1. */
function fakeGh() {
	const prs = new Map<number, { head: string; branch: string }>();
	const issues: FakeIssue[] = [];
	const calls: string[][] = [];
	let fail: ((args: string[]) => boolean) | null = null;
	const ok = (stdout: unknown): GhResult => ({ code: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "" });
	const flag = (args: string[], name: string) => {
		const i = args.indexOf(name);
		return i >= 0 ? args[i + 1]! : null;
	};
	const issue = (args: string[]) => issues.find((i) => i.number === Number(args[2]))!;
	const gh = (args: string[]): GhResult => {
		calls.push(args);
		if (fail?.(args)) return { code: 1, stdout: "", stderr: "HTTP 502" };
		const [noun, verb] = args;
		if (noun === "pr" && verb === "view") {
			const n = Number(args[2]);
			const p = prs.get(n);
			if (!p) return { code: 1, stdout: "", stderr: `no pull request ${n}` };
			return ok({
				number: n, headRefName: p.branch, headRefOid: p.head, isCrossRepository: false, headRepository: { name: "product" },
				headRepositoryOwner: { login: "thewolff" }, state: "OPEN", body: "", mergedAt: null,
			});
		}
		if (noun === "issue" && verb === "list") return ok(issues.filter((i) => i.labels.includes(flag(args, "--label")!)).map((i) => ({ number: i.number, url: i.url, body: i.body })));
		if (noun === "issue" && verb === "create") {
			const number = issues.length + 1;
			const url = `https://github.com/${TRAIN_ALERT_REPO}/issues/${number}`;
			issues.push({ number, url, title: flag(args, "--title")!, body: flag(args, "--body")!, state: "OPEN", labels: [flag(args, "--label")!], comments: [] });
			return ok(`${url}\n`);
		}
		if (noun === "issue" && verb === "view") {
			const i = issue(args);
			return ok({ state: i.state, comments: i.comments.map((body) => ({ body })) });
		}
		if (noun === "issue" && verb === "comment") {
			issue(args).comments.push(flag(args, "--body")!);
			return ok("");
		}
		if (noun === "issue" && verb === "edit") {
			const i = issue(args);
			for (const l of flag(args, "--add-label")!.split(",")) if (!i.labels.includes(l)) i.labels.push(l);
			return ok("");
		}
		if (noun === "issue" && verb === "close") {
			issue(args).state = "CLOSED";
			return ok("");
		}
		return { code: 1, stdout: "", stderr: `fake gh: unexpected ${args.join(" ")}` };
	};
	return { gh, prs, issues, calls, failWhen: (f: ((args: string[]) => boolean) | null) => { fail = f; } };
}

/** A train on #101 and #106 held by TRAIN_LANE, the autonomous owner of #101, a fake gh and launcher, on one ledger with a settable clock. */
function world() {
	const c = clock();
	const { ledger } = tempLedger(c.now);
	const trainCheckout = checkout();
	const cmd = interpret(ledger, "train 101 106");
	if (cmd?.kind !== "train") throw new Error("not a train");
	const train = applyTrain(ledger, cmd, trainCheckout).workloadId;
	expect(ledger.claimWorkload(train, { by: LANE_STARTER_BY, holder: TRAIN_LANE, leaseMs: 600_000 }).won).toBe(true);
	const owner = ledger.openWorkload({ by: SURFACE_BY, brief: "Fix the feed header", stakes: "normal", mode: "autonomous" });
	recordRepo(ledger, owner, checkout());
	const branch = `wl/${owner}`;
	const g = fakeGh();
	g.prs.set(101, { head: H0, branch });
	g.prs.set(106, { head: H0, branch: "feature/other" });
	const launches: string[] = [];
	const notes: string[] = [];
	/** The fake launcher: lane.ts launch's reservation (decideLaunch consumes the request), with no process behind the lane. */
	const launch = (wl: string) => {
		launches.push(wl);
		const r = ledger.reserveLane(wl, { by: LANE_STARTER_BY, cap: 10, leaseMs: 60_000, requestedBy: MERGE_TRAIN_BY, decide: decideLaunch });
		return r.ok ? { code: 0, line: `launched ${r.laneId}` } : { code: 1, line: r.reason };
	};
	const run = () => tick({ ledger, gh: g.gh, launch, notify: (_t, text) => { notes.push(text); return true; } });
	/** The train lane's lane_train_return for PR `pr` at the fake PR's current head. */
	const task = (pr: number, kind: TrainTask["kind"] = "red"): TrainTask => {
		const p = g.prs.get(pr)!;
		const view = { number: pr, headRefName: p.branch, headRefOid: p.head, isCrossRepository: false, headRepository: { name: "product" }, headRepositoryOwner: { login: "thewolff" } };
		const r = recordTrainTask(ledger, { train, by: TRAIN_LANE, pr, kind, detail: `run tr-x red at ${p.head}\nsrc/x.test.ts > case 1: boom`, view, trainRepo: REPO });
		if (!r.ok) throw new Error(r.reason);
		return r.task;
	};
	let seq = 0;
	/** A runner request and result on the owner for PR `pr` at `sha`. */
	const result = (pr: number, sha: string, verdict: TestRun["verdict"]) => {
		const slice = ledger.addSlice({ by: OWNER_LANE, workloadId: owner, task: `suite #${pr}`, doneCondition: "green", inputs: `#${pr}` });
		const runId = makeRunId(Date.parse(c.now()) + ++seq, "abcd");
		ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: owner, sliceId: slice, kind: "assumption", body: testRequestedBody({ runId, pr, sha, slice, by: OWNER_LANE }) });
		ledger.recordEntry({
			by: TEST_RUNNER_BY, workloadId: owner, sliceId: slice, kind: "assumption",
			body: testRunBody({
				runId, verdict, sha, pr, reason: null, headAtEnd: sha, base: null, mergeBase: null,
				full: { pass: 1, fail: verdict === "red" ? 1 : 0, skip: 0, exit: verdict === "red" ? 1 : 0, ms: 10, error: null },
				solo: [], failures: verdict === "red" ? [{ part: "full", name: "src/x.test.ts > case 1", firstError: "boom" }] : [], runDir: null, preflight: null,
			}),
		});
	};
	/** The owner pushes `sha` to PR `pr` and its run there comes back `verdict`. */
	const push = (pr: number, sha: string, verdict: TestRun["verdict"]) => {
		g.prs.get(pr)!.head = sha;
		result(pr, sha, verdict);
	};
	const settles = () => ledger.entries(train).filter((e) => e.created_by === MERGE_TRAIN_BY && e.body.startsWith("train-task-settled:"));
	const creates = () => g.calls.filter((a) => a[0] === "issue" && a[1] === "create");
	/** Attempts 1 and 2 on #101 both settled failed: the tick has raised the alert and filed its issue. */
	const failTwice = () => {
		task(101);
		c.plusHours(0.05);
		push(101, H1, "red");
		run();
		task(101);
		c.plusHours(0.05);
		push(101, H2, "red");
		return run();
	};
	return { c, ledger, train, owner, g, launches, notes, run, task, push, settles, creates, failTwice };
}

describe("settles and deliveries (D8, D10)", () => {
	test("a settle is written once across two ticks", () => {
		const w = world();
		const t = w.task(101);
		w.c.plusHours(0.05);
		w.push(101, H1, "green");
		w.run();
		w.run();
		expect(w.settles().map((e) => e.body)).toEqual([expect.stringMatching(new RegExp(`^train-task-settled: ${t.id} fixed `))]);
	});

	test("an unsettled task launches its autonomous owner once, with launch-requested: by merge-train; a live train is not woken", () => {
		const w = world();
		w.task(101);
		w.run();
		w.run();
		expect(w.launches).toEqual([w.owner]);
		expect(controlEntries(w.ledger.entries(w.owner)).filter((c) => c.prefix === "launch-requested").map((c) => c.createdBy)).toEqual([MERGE_TRAIN_BY]);
		expect(w.launches).not.toContain(w.train);
	});

	test("an actionable train no lane holds live is woken", () => {
		const w = world();
		w.task(101);
		w.c.plusHours(0.05);
		w.push(101, H1, "green");
		w.c.plusHours(0.2); // the train lane's lease has lapsed
		w.run();
		expect(w.launches).toContain(w.train);
		expect(controlEntries(w.ledger.entries(w.train)).some((c) => c.prefix === "launch-requested" && c.createdBy === MERGE_TRAIN_BY)).toBe(true);
	});

	test("attempt 1 failed with the owner gone: exactly one fix workload, reused for attempt 2", () => {
		const w = world();
		w.task(101);
		w.ledger.closeWorkload(w.owner, { by: SURFACE_BY });
		w.run();
		w.c.plusHours(2.1); // no push for 2 h: attempt 1 settles failed
		w.run();
		expect(w.settles().map((e) => e.body)).toEqual([expect.stringContaining("failed no push for 2 h")]);
		w.task(101);
		w.run();
		w.run();
		const fixes = fixBindings(w.ledger);
		expect(fixes.map((f) => f.pr)).toEqual([101]);
		expect(w.ledger.workload(fixes[0]!.workloadId)).toMatchObject({ status: "open", created_by: MERGE_TRAIN_BY });
		expect(w.launches).toContain(fixes[0]!.workloadId);
	});
});

describe("alerts (D9)", () => {
	test("attempt 2 failed: one retry / skip / stop question and one issue labelled as2-train; a second tick files no duplicate", () => {
		const w = world();
		w.failTwice();
		const qs = w.ledger.questions(w.train);
		expect(qs).toHaveLength(1);
		expect(qs[0]).toMatchObject({ slice_id: trainSliceId(w.train, 101), state: "open", created_by: MERGE_TRAIN_BY });
		expect(JSON.parse(qs[0]!.options)).toEqual(["retry", "skip", "stop"]);
		expect(w.creates()).toHaveLength(1);
		expect(w.creates()[0]).toEqual(expect.arrayContaining(["-R", TRAIN_ALERT_REPO, "--label", TRAIN_ALERT_LABEL]));
		expect(w.g.issues[0]!.title).toBe("merge train: #101 needs you (failed twice)");
		expect(w.g.issues[0]!.body).toContain(qs[0]!.id);
		w.run();
		w.c.plusHours(1);
		w.run();
		expect(w.creates()).toHaveLength(1);
		expect(w.ledger.questions(w.train)).toHaveLength(1);
	});

	test("not acknowledged: one louder re-send at 4 h, the next at 8 h, nothing after; as2-train is never removed", () => {
		const w = world();
		w.failTwice();
		const q = w.ledger.questions(w.train)[0]!.id;
		const issue = w.g.issues[0]!;
		w.c.plusHours(3.9);
		w.run();
		expect(issue.comments).toEqual([]);
		w.c.plusHours(0.2);
		w.run();
		w.run();
		expect(issue.comments).toHaveLength(1);
		expect(issue.comments[0]).toContain("@thewolff");
		expect(issue.comments[0]).toContain("unacknowledged 4 h");
		expect(issue.labels).toEqual([TRAIN_ALERT_LABEL, "loud"]);
		expect(w.notes).toHaveLength(1);
		const line = errorLines(w.ledger).find((l) => l.rowId === q);
		expect(line?.line).toStartWith("LOUD (unacknowledged 4 h)");
		w.c.plusHours(4);
		w.run();
		w.run();
		expect(issue.comments).toHaveLength(2);
		expect(issue.labels).toEqual([TRAIN_ALERT_LABEL, "loud", "critical"]);
		expect(w.notes).toHaveLength(2);
		expect(errorLines(w.ledger).find((l) => l.rowId === q)?.line).toStartWith("LOUD, critical (unacknowledged 8 h)");
		w.c.plusHours(24);
		w.run();
		expect(issue.comments).toHaveLength(2);
		expect(w.notes).toHaveLength(2);
		expect(w.creates()).toHaveLength(1);
		expect(w.g.calls.some((a) => a.includes("--remove-label"))).toBe(false);
	});

	test("a crash between sending and sent: the retry posts no second comment and notifies once", () => {
		const w = world();
		w.failTwice();
		const issue = w.g.issues[0]!;
		w.c.plusHours(4.1);
		w.g.failWhen((a) => a[0] === "issue" && a[1] === "edit");
		w.run();
		expect(issue.comments).toHaveLength(1);
		expect(w.notes).toHaveLength(0);
		w.g.failWhen(null);
		w.run();
		w.run();
		expect(issue.comments).toHaveLength(1);
		expect(issue.labels).toContain("loud");
		expect(w.notes).toHaveLength(1);
	});

	test("acknowledged by closing the issue: no re-send; Jo's answer closes an open issue", () => {
		const w = world();
		w.failTwice();
		const issue = w.g.issues[0]!;
		issue.state = "CLOSED";
		w.c.plusHours(4.1);
		w.run();
		w.c.plusHours(4);
		w.run();
		expect(issue.comments).toEqual([]);
		expect(w.notes).toEqual([]);
		expect(w.ledger.questions(w.train)[0]!.state).toBe("open");

		const v = world();
		v.failTwice();
		v.ledger.answerQuestion(v.ledger.questions(v.train)[0]!.id, { ...JO, answer: "skip" });
		v.run();
		expect(v.g.issues[0]!.state).toBe("CLOSED");
		v.c.plusHours(5);
		v.run();
		expect(v.g.issues[0]!.comments).toEqual([]);
		expect(v.g.calls.filter((a) => a[0] === "issue" && a[1] === "close")).toHaveLength(1);
	});

	test("a production-stakes PR's merge question is an alert", () => {
		const w = world();
		const sl = w.ledger.addSlice({ by: TRAIN_LANE, workloadId: w.train, id: trainSliceId(w.train, 106), task: "PR #106", doneCondition: "terminal", inputs: "#106" });
		w.ledger.raiseQuestion({ by: TRAIN_LANE, workloadId: w.train, sliceId: sl, body: "#106 production: merge it?", options: ["merged", "skip", "stop"] });
		w.run();
		w.run();
		expect(w.creates()).toHaveLength(1);
		expect(w.creates()[0]).toEqual(expect.arrayContaining(["--label", TRAIN_ALERT_LABEL]));
		expect(w.g.issues[0]!.title).toBe("merge train: #106 needs you (production merge)");
	});

	test("an open question on the train does not stop the tick acting on other PRs", () => {
		const w = world();
		const sl = w.ledger.addSlice({ by: TRAIN_LANE, workloadId: w.train, id: trainSliceId(w.train, 106), task: "PR #106", doneCondition: "terminal", inputs: "#106" });
		w.ledger.raiseQuestion({ by: TRAIN_LANE, workloadId: w.train, sliceId: sl, body: "#106 production: merge it?", options: ["merged", "skip", "stop"] });
		const t = w.task(101);
		w.run();
		expect(w.launches).toEqual([w.owner]);
		w.c.plusHours(0.05);
		w.push(101, H1, "red");
		w.c.plusHours(0.2);
		w.run();
		expect(w.settles().map((e) => e.body)).toEqual([expect.stringContaining(`${t.id} failed`)]);
		expect(w.launches).toContain(w.train);
	});
});

describe("alert sends with an uncertain outcome (D9, review gtb-r1 findings 9 and 10)", () => {
	/** The production merge question on #106 of `train`: an open alert the next tick files at level 1. */
	const mergeQuestion = (ledger: Ledger, train: string): string => {
		const sl = ledger.addSlice({ by: TRAIN_LANE, workloadId: train, id: trainSliceId(train, 106), task: "PR #106", doneCondition: "terminal", inputs: "#106" });
		return ledger.raiseQuestion({ by: TRAIN_LANE, workloadId: train, sliceId: sl, body: "#106 production: merge it?", options: ["merged", "skip", "stop"] });
	};
	/** The tick's `train-alert:` entries for question `q` on `train`, oldest first. */
	const alertEntries = (ledger: Ledger, train: string, q: string): string[] =>
		ledger.entries(train).filter((e) => e.created_by === MERGE_TRAIN_BY && e.body.startsWith(`train-alert: ${q} `)).map((e) => e.body);
	/** A tick that wrote level 1 `sending` for `q` and died before `sent`. */
	const sendingOnly = (ledger: Ledger, train: string, q: string): void => {
		ledger.recordEntry({ by: MERGE_TRAIN_BY, workloadId: train, kind: "assumption", body: trainAlertBody(q, 1, "sending") });
	};

	test("a create that files the issue but exits nonzero: the marker is found again, the issue adopted, nothing filed twice", () => {
		const w = world();
		const q = mergeQuestion(w.ledger, w.train);
		const real = w.g.gh;
		let lost = 0;
		w.g.gh = (args) => {
			const r = real(args);
			if (args[0] === "issue" && args[1] === "create" && lost++ === 0) return { code: 1, stdout: "", stderr: "HTTP 502: the reply was lost" };
			return r;
		};
		w.run();
		w.run();
		expect(w.g.issues).toHaveLength(1);
		expect(w.creates()).toHaveLength(1);
		expect(alertEntries(w.ledger, w.train, q)).toEqual([`train-alert: ${q} level 1 sending`, `train-alert: ${q} level 1 sent ${w.g.issues[0]!.url}`]);
	});

	test("a create that fails for another reason is not retried: the error is logged and the next tick files the issue once", () => {
		const w = world();
		mergeQuestion(w.ledger, w.train);
		w.g.failWhen((a) => a[0] === "issue" && a[1] === "create");
		w.run();
		expect(w.creates()).toHaveLength(1);
		expect(w.g.calls.some((a) => a[0] === "label")).toBe(false);
		expect(w.ledger.entries(w.train).some((e) => e.body.startsWith("train-error: tick"))).toBe(true);
		w.g.failWhen(null);
		w.run();
		expect(w.g.issues).toHaveLength(1);
		expect(w.creates()).toHaveLength(2);
	});

	test("a missing as2-train label: the label is created and the issue filed once", () => {
		const w = world();
		const q = mergeQuestion(w.ledger, w.train);
		const real = w.g.gh;
		const labels = new Set<string>();
		w.g.gh = (args) => {
			if (args[0] === "label" && args[1] === "create") {
				labels.add(args[2]!);
				return { code: 0, stdout: "", stderr: "" };
			}
			if (args[0] === "issue" && args[1] === "create" && !labels.has(TRAIN_ALERT_LABEL)) {
				w.g.calls.push(args);
				return { code: 1, stdout: "", stderr: `could not add label: '${TRAIN_ALERT_LABEL}' not found` };
			}
			return real(args);
		};
		w.run();
		expect([...labels]).toEqual([TRAIN_ALERT_LABEL]);
		expect(w.g.issues).toHaveLength(1);
		expect(w.creates()).toHaveLength(2);
		expect(alertEntries(w.ledger, w.train, q).at(-1)).toBe(`train-alert: ${q} level 1 sent ${w.g.issues[0]!.url}`);
	});

	test("answered after a crash between level 1 sending and sent: the marked issue is found and closed once, the end written", () => {
		const w = world();
		const q = mergeQuestion(w.ledger, w.train);
		sendingOnly(w.ledger, w.train, q);
		const url = `https://github.com/${TRAIN_ALERT_REPO}/issues/1`;
		w.g.issues.push({ number: 1, url, title: "merge train: #106 needs you (production merge)", body: `${trainAlertMarker(q, 1)}\n…`, state: "OPEN", labels: [TRAIN_ALERT_LABEL], comments: [] });
		w.ledger.answerQuestion(q, { ...JO, answer: "skip" });
		w.run();
		w.run();
		expect(w.g.issues[0]!.state).toBe("CLOSED");
		expect(w.g.calls.filter((a) => a[0] === "issue" && a[1] === "close")).toHaveLength(1);
		expect(w.creates()).toEqual([]);
		expect(alertEntries(w.ledger, w.train, q)).toEqual([`train-alert: ${q} level 1 sending`, expect.stringMatching(new RegExp(`^train-alert: ${q} closed `))]);
	});

	test("withdrawn after level 1 sending with no issue filed: the end is written and nothing is created", () => {
		const w = world();
		const q = mergeQuestion(w.ledger, w.train);
		sendingOnly(w.ledger, w.train, q);
		w.ledger.withdrawQuestion(q, { ...JO, reason: "not needed", then: "replan" });
		w.run();
		w.run();
		expect(w.g.issues).toEqual([]);
		expect(w.creates()).toEqual([]);
		expect(w.g.calls.some((a) => a[0] === "issue" && a[1] === "close")).toBe(false);
		expect(alertEntries(w.ledger, w.train, q)).toEqual([`train-alert: ${q} level 1 sending`, expect.stringMatching(new RegExp(`^train-alert: ${q} closed `))]);
	});
});
