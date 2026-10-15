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
import { controlEntries, decideLaunch, laneExitBody } from "../src/launch";
import { fixBindings, recordTrainTask, TRAIN_ALERT_LABEL, TRAIN_ALERT_REPO, trainSliceId, type TrainTask } from "../src/merge-train";
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

describe("retries of a released train and fork PRs (D8-D10, review gtb-r1)", () => {
	/** What these helpers read of a world: its ledger, its train and the fake launcher's record. */
	interface World {
		ledger: Ledger;
		train: string;
		launches: string[];
	}
	/** The train's PR slices, added by `lane` as step 1 does, so no PR reads as not yet worked. */
	const worked = (w: World, lane: string) => {
		for (const n of [101, 106]) {
			const sl = trainSliceId(w.train, n);
			if (!w.ledger.slice(sl)) w.ledger.addSlice({ by: lane, workloadId: w.train, id: sl, task: `PR #${n}`, doneCondition: "terminal", inputs: `#${n}` });
		}
	};
	/** `lane` passes #101 over with `train-error: pr 101 <why>` (when given) and exits released. */
	const exit = (w: World, lane: string, why: string | null) => {
		worked(w, lane);
		if (why !== null) w.ledger.recordEntry({ by: lane, workloadId: w.train, kind: "assumption", body: `train-error: pr 101 ${why}` });
		w.ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: w.train, kind: "assumption", body: laneExitBody(lane, { code: 0, signal: null, outcome: "released" }) });
	};
	const trainLaunches = (w: World) => w.launches.filter((l) => l === w.train).length;
	const holder = (w: World) => w.ledger.workload(w.train)!.holder!;

	test("a PR passed over with train-error: wakes the released train after 15 min, then after 30 min, never every tick", () => {
		const w = world();
		exit(w, TRAIN_LANE, "merge-refused HTTP 502");
		w.c.plusHours(0.2); // 12 min: the lease has lapsed, the retry wait has not
		w.run();
		expect(trainLaunches(w)).toBe(0);
		w.c.plusHours(0.1); // 18 min
		w.run();
		w.run();
		expect(trainLaunches(w)).toBe(1);
		// the retried pass is refused again: the next wait doubles
		exit(w, holder(w), "merge-refused HTTP 502 again");
		w.c.plusHours(0.4); // 24 min after that exit
		w.run();
		expect(trainLaunches(w)).toBe(1);
		w.c.plusHours(0.12); // 31 min
		w.run();
		expect(trainLaunches(w)).toBe(2);
	});

	test("a head moved after the train consumed its fixed settle wakes the train once for that head", () => {
		const w = world();
		w.task(101);
		w.c.plusHours(0.05);
		w.push(101, H1, "green");
		w.c.plusHours(0.2);
		w.run();
		expect(w.settles().map((e) => e.body)).toEqual([expect.stringContaining("fixed")]);
		expect(trainLaunches(w)).toBe(1);
		// the train's pass consumes the settle and ends without a run at a new head
		exit(w, holder(w), null);
		w.c.plusHours(0.1);
		w.run();
		expect(trainLaunches(w)).toBe(1);
		// the PR's head moves again: the train is woken for it, once
		w.g.prs.get(101)!.head = H2;
		w.run();
		expect(trainLaunches(w)).toBe(2);
		exit(w, holder(w), null);
		w.c.plusHours(0.1);
		w.run();
		w.run();
		expect(trainLaunches(w)).toBe(2);
	});

	test("the live-owner shortcut keeps the PR pending: its train slices stay open, the tick reads it, and a later pass retries it", () => {
		const w = world();
		// the train's own full-suite run on #101 is red, and the PR goes back to its owner, whose lane stays live
		worked(w, TRAIN_LANE);
		const full = w.ledger.addSlice({ by: TRAIN_LANE, workloadId: w.train, id: `${trainSliceId(w.train, 101)}-full-1`, task: "#101 suite", doneCondition: "green", inputs: "#101" });
		w.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: w.train, sliceId: full, kind: "assumption", body: testRequestedBody({ runId: makeRunId(Date.parse(w.c.now()), "trn0"), pr: 101, sha: H0, slice: full, by: TRAIN_LANE }) });
		expect(w.ledger.claimWorkload(w.owner, { by: LANE_STARTER_BY, holder: OWNER_LANE, leaseMs: 6 * 3_600_000 }).won).toBe(true);
		w.task(101);
		w.c.plusHours(0.05);
		w.push(101, H1, "green");
		w.c.plusHours(0.2);
		w.run();
		expect(trainLaunches(w)).toBe(1);
		// the train finds the owner live: it passes #101 over and exits, leaving both slices open
		exit(w, holder(w), `live lane ${OWNER_LANE}`);
		expect([trainSliceId(w.train, 101), full].map((s) => w.ledger.slice(s)!.state)).toEqual(["open", "open"]);
		const views = () => w.g.calls.filter((a) => a[0] === "pr" && a[1] === "view" && a[2] === "101").length;
		const before = views();
		w.c.plusHours(0.3);
		w.run();
		expect(views()).toBeGreaterThan(before);
		expect(trainLaunches(w)).toBe(2);
	});

	test("a fork's ownerless task opens no fix workload: the tick settles it failed and files Jo's alert", () => {
		const w = world();
		const t = w.task(106);
		const gh = (args: string[]): GhResult => {
			const r = w.g.gh(args);
			if (args[0] !== "pr" || args[1] !== "view" || args[2] !== "106") return r;
			return { ...r, stdout: JSON.stringify({ ...JSON.parse(r.stdout), isCrossRepository: true, headRepositoryOwner: { login: "someone" } }) };
		};
		const pass = () => tick({ ledger: w.ledger, gh, launch: (wl) => ({ code: 0, line: `launched ${wl}` }), notify: () => true });
		pass();
		pass();
		expect(fixBindings(w.ledger)).toEqual([]);
		expect(w.settles().map((e) => e.body)).toEqual([expect.stringMatching(new RegExp(`^train-task-settled: ${t.id} failed `))]);
		const qs = w.ledger.questions(w.train);
		expect(qs).toEqual([expect.objectContaining({ slice_id: trainSliceId(w.train, 106), state: "open", created_by: MERGE_TRAIN_BY })]);
		expect(JSON.parse(qs[0]!.options)).toEqual(["retry", "skip", "stop"]);
		expect(w.creates()).toHaveLength(1);
		expect(w.creates()[0]).toEqual(expect.arrayContaining(["--label", TRAIN_ALERT_LABEL]));
	});
});
