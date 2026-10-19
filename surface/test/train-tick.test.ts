// The merge train's tick (PLAN wl-mv8s8srodefytc rev 17.1 D9-D10, part 3): settles once, opens one fix workload per PR,
// launches owners and the train, raises the failed-twice alert, files each alert once on jo-issues with the as2-train label,
// re-sends it louder at 4 h and 8 h until acknowledged, and keeps acting while a question is open.
// Temp ledgers, temp git checkouts with a fake GitHub origin, a fake gh, a fake launcher and a fake notification only.
import { describe, expect, test } from "bun:test";
import { LANE_RUNNER_BY, LANE_STARTER_BY, type Ledger, TEST_RUNNER_BY } from "../../ledger/src/index";
import { type GhResult, tick } from "../scripts/train-tick";
import { recordRepo } from "../src/decision-log";
import { errorLines } from "../src/errors";
import { applyTrain, interpret } from "../src/input";
import { controlEntries, decideLaunch, laneExitBody, launchFailedBody, planHaltedBody } from "../src/launch";
import {
	actionable, fixBindings, recordTrainTask, TRAIN_ALERT_LABEL, TRAIN_ALERT_REPO, trainActivityArgs, trainAlertBody, trainAlertMarker, trainHeadWokenBody, trainHoldBody, trainRetries,
	trainSliceId, type TrainTask, trainWakeBody,
} from "../src/merge-train";
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

/** One push to a branch as GitHub's repository activity lists it. */
interface FakeActivity {
	before: string;
	after: string;
	ref: string;
	timestamp: string;
	activity_type: string;
}

/**
 * gh as the tick calls it: PR views from `prs`, GitHub's push activity per branch from `activity`, and an issue tracker for
 * jo-issues. Listings are newest first and paged as GitHub pages them: `gh issue list` stops at `--limit`, `gh api` returns the
 * first page of `per_page`, or every page with `--paginate` (an array of pages with `--slurp`). `fail` makes a matching call exit 1.
 */
function fakeGh() {
	const prs = new Map<number, { head: string; branch: string }>();
	const activity: FakeActivity[] = [];
	const issues: FakeIssue[] = [];
	const calls: string[][] = [];
	let fail: ((args: string[]) => boolean) | null = null;
	const ok = (stdout: unknown): GhResult => ({ code: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "" });
	const flag = (args: string[], name: string) => {
		const i = args.indexOf(name);
		return i >= 0 ? args[i + 1]! : null;
	};
	/** `gh api`'s `-f key=value` fields. */
	const fields = (args: string[]) => new Map(args.flatMap((a, i) => (args[i - 1] === "-f" ? [a.split("=", 2) as [string, string]] : [])));
	const paged = (args: string[], items: unknown[]): GhResult => {
		const per = Number(fields(args).get("per_page") ?? 30);
		const pages: unknown[][] = [];
		for (let i = 0; i === 0 || i < items.length; i += per) pages.push(items.slice(i, i + per));
		if (!args.includes("--paginate")) return ok(pages[0]);
		return args.includes("--slurp") ? ok(pages) : ok(pages.map((p) => JSON.stringify(p)).join(""));
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
		if (noun === "api" && verb === `repos/${REPO}/activity`) {
			const ref = fields(args).get("ref");
			return paged(args, activity.filter((a) => a.ref === ref).reverse());
		}
		if (noun === "api" && verb === `repos/${TRAIN_ALERT_REPO}/issues`) {
			const label = fields(args).get("labels")!;
			return paged(args, [...issues].sort((a, b) => b.number - a.number).filter((i) => i.labels.includes(label)).map((i) => ({ number: i.number, html_url: i.url, body: i.body, labels: i.labels.map((name) => ({ name })) })));
		}
		if (noun === "issue" && verb === "list") {
			const listed = [...issues].sort((a, b) => b.number - a.number).filter((i) => i.labels.includes(flag(args, "--label")!)).slice(0, Number(flag(args, "--limit") ?? 30));
			return ok(listed.map((i) => ({ number: i.number, url: i.url, body: i.body })));
		}
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
	/** GitHub records a push of `sha` to `branch` at `at`. */
	const pushed = (branch: string, sha: string, at: string) => {
		const before = activity.filter((a) => a.ref === `refs/heads/${branch}`).at(-1)?.after ?? "0".repeat(40);
		activity.push({ before, after: sha, ref: `refs/heads/${branch}`, timestamp: at, activity_type: "push" });
	};
	return { gh, prs, activity, pushed, issues, calls, failWhen: (f: ((args: string[]) => boolean) | null) => { fail = f; } };
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
	/** The owner pushes `sha` to PR `pr` (GitHub records it now) and its run there comes back `verdict`. */
	const push = (pr: number, sha: string, verdict: TestRun["verdict"]) => {
		const p = g.prs.get(pr)!;
		p.head = sha;
		g.pushed(p.branch, sha, c.now());
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

	test("the 2 h rule reads GitHub's push activity on the head branch, and waits while that listing cannot be read (review gtb-r2 F2)", () => {
		const w = world();
		const t = w.task(101);
		const p = w.g.prs.get(101)!;
		// the owner pushes H1 at 1.5 h and has not asked for a run yet: no runner request dates the push, GitHub does
		w.c.plusHours(1.5);
		const pushedAt = w.c.now();
		p.head = H1;
		w.g.pushed(p.branch, H1, pushedAt);
		w.c.plusHours(0.6);
		w.run();
		expect(w.settles()).toEqual([]);
		expect(w.g.calls).toContainEqual(trainActivityArgs(REPO, p.branch));
		// past the push's own 2 h mark, while GitHub's activity cannot be read: no push rule settles, and the gh error is logged
		w.g.failWhen((a) => a[0] === "api" && a[1] === `repos/${REPO}/activity`);
		w.c.plusHours(1.5);
		w.run();
		expect(w.settles()).toEqual([]);
		expect(w.ledger.entries(w.train).some((e) => e.body.startsWith("train-error: tick") && e.body.includes("activity"))).toBe(true);
		w.g.failWhen(null);
		w.run();
		expect(w.settles().map((e) => e.body)).toEqual([`train-task-settled: ${t.id} failed no push for 2 h since ${pushedAt}`]);
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

	/** #101's task settles fixed at H1 and the train consumes it; then the head moves to H2 and the tick wakes the train for it once. */
	const wokenForH2 = () => {
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
		// the PR's head moves again: the train is woken for it
		w.g.prs.get(101)!.head = H2;
		w.run();
		expect(trainLaunches(w)).toBe(2);
		expect(wakes(w)).toBe(1);
		return w;
	};
	const wakes = (w: World) => w.ledger.entries(w.train).filter((e) => e.created_by === MERGE_TRAIN_BY && e.body === trainHeadWokenBody(101, H2)).length;

	test("a head woken for a lane that ends before working it is due again under the backoff, never every tick (review gtb-r2 F1)", () => {
		const w = wokenForH2();
		// the launched lane ends with no run at H2, no train-error: pr 101 and no task: the wake did not work the head
		exit(w, holder(w), null);
		w.c.plusHours(0.2); // 12 min
		w.run();
		w.run();
		expect(trainLaunches(w)).toBe(2);
		w.c.plusHours(0.1); // 18 min
		w.run();
		w.run();
		expect(trainLaunches(w)).toBe(3);
		expect(wakes(w)).toBe(2);
		// again with nothing done: the wait doubles to 30 min
		exit(w, holder(w), null);
		w.c.plusHours(0.4); // 24 min
		w.run();
		expect(trainLaunches(w)).toBe(3);
		w.c.plusHours(0.12); // 31 min
		w.run();
		expect(trainLaunches(w)).toBe(4);
		// a runner that never became ready writes launch-failed: and no lane-exit: the wait (now 1 h) runs from it
		w.ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: w.train, kind: "assumption", body: launchFailedBody(holder(w), "ready", "the lane never became ready") });
		w.c.plusHours(0.9);
		w.run();
		expect(trainLaunches(w)).toBe(4);
		w.c.plusHours(0.15);
		w.run();
		expect(trainLaunches(w)).toBe(5);
		expect(wakes(w)).toBe(4);
	});

	test("the train working the woken head ends its wakes: a train run at that head, or a pass-over whose own retry then applies", () => {
		const w = wokenForH2();
		const lane = holder(w);
		const full = w.ledger.addSlice({ by: lane, workloadId: w.train, id: `${trainSliceId(w.train, 101)}-full-2`, task: "#101 suite", doneCondition: "green", inputs: "#101" });
		w.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: w.train, sliceId: full, kind: "assumption", body: testRequestedBody({ runId: makeRunId(Date.parse(w.c.now()), "trn1"), pr: 101, sha: H2, slice: full, by: lane }) });
		exit(w, lane, null);
		w.c.plusHours(5);
		w.run();
		expect(trainLaunches(w)).toBe(2);
		expect(trainRetries(w.ledger, w.train, new Map([[101, H2]]))).toEqual({ passedOver: [], untested: [] });

		const v = wokenForH2();
		exit(v, holder(v), "merge-refused HTTP 502");
		v.c.plusHours(0.3);
		expect(trainRetries(v.ledger, v.train, new Map([[101, H2]]))).toEqual({ passedOver: [{ pr: 101, count: 1 }], untested: [] });
		v.run();
		expect(trainLaunches(v)).toBe(3);
		expect(wakes(v)).toBe(1);
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

	/** `lane` holds #101 at H0 until `until` (`train-hold:`, PLAN wl-mvfkv7llkp7nk0 § 3), leaves its slices open, and exits released. */
	const held = (w: World, lane: string, until: string): string => {
		worked(w, lane);
		const id = w.ledger.recordEntry({ by: lane, workloadId: w.train, kind: "assumption", body: trainHoldBody(101, H0, until) });
		w.ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: w.train, kind: "assumption", body: laneExitBody(lane, { code: 0, signal: null, outcome: "released" }) });
		return id;
	};
	const holdWakes = (w: World, holdId: string) => w.ledger.entries(w.train).filter((e) => e.created_by === MERGE_TRAIN_BY && e.body === trainWakeBody(101, holdId)).length;

	test("a timed hold wakes the released train once its time passes, with one train-wake: that consumes it (PLAN wl-mvfkv7llkp7nk0 § 3, R10)", () => {
		const w = world();
		const holdId = held(w, TRAIN_LANE, "2026-10-01T12:00:00.000Z");
		w.c.plusHours(1.5);
		w.run();
		expect(trainLaunches(w)).toBe(0);
		expect(actionable(w.ledger, w.train)).toEqual([]);
		w.c.at("2026-10-01T12:00:00.000Z");
		expect(actionable(w.ledger, w.train)).toEqual([`#101 hold-expired (${holdId})`]);
		w.run();
		expect(trainLaunches(w)).toBe(1);
		expect(holdWakes(w, holdId)).toBe(1);
		expect(w.ledger.slice(trainSliceId(w.train, 101))!.state).toBe("open");
		// the woken lane dies before it records an outcome: the consumed hold does not wake the train again
		w.ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: w.train, kind: "assumption", body: laneExitBody(holder(w), { code: 0, signal: null, outcome: "released" }) });
		w.c.plusHours(1);
		w.run();
		w.run();
		expect(trainLaunches(w)).toBe(1);
		expect(holdWakes(w, holdId)).toBe(1);
	});

	test("an `until jo` hold wakes the train only when the PR's workload no longer holds it, here on Jo's approve after a halt", () => {
		const w = world();
		w.ledger.recordEntry({ by: SURFACE_BY, workloadId: w.owner, kind: "assumption", body: planHaltedBody("in-1") });
		const holdId = held(w, TRAIN_LANE, "jo");
		w.c.plusHours(10);
		w.run();
		w.run();
		expect(trainLaunches(w)).toBe(0);
		w.ledger.recordEntry({ by: SURFACE_BY, workloadId: w.owner, kind: "assumption", body: "plan: approved in-2" });
		w.run();
		expect(trainLaunches(w)).toBe(1);
		expect(holdWakes(w, holdId)).toBe(1);
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

	/** Issue #1 carrying `q`'s level 1 marker, then `others` as2-train issues filed after it: a newest-first listing reaches #1 last. */
	const buried = (w: { g: { issues: FakeIssue[] } }, q: string, others: number): FakeIssue => {
		w.g.issues.push({ number: 1, url: `https://github.com/${TRAIN_ALERT_REPO}/issues/1`, title: "merge train: #106 needs you (production merge)", body: `${trainAlertMarker(q, 1)}\n…`, state: "OPEN", labels: [TRAIN_ALERT_LABEL], comments: [] });
		for (let n = 2; n <= others + 1; n++) {
			w.g.issues.push({ number: n, url: `https://github.com/${TRAIN_ALERT_REPO}/issues/${n}`, title: `merge train: #${n} needs you (failed twice)`, body: `${trainAlertMarker(`q-other${n}`, 1)}\n…`, state: "CLOSED", labels: [TRAIN_ALERT_LABEL], comments: [] });
		}
		return w.g.issues[0]!;
	};
	/** The tick's marker lookup, in either form gh offers. */
	const listing = (a: string[]) => (a[0] === "api" && a[1] === `repos/${TRAIN_ALERT_REPO}/issues`) || (a[0] === "issue" && a[1] === "list");

	test("answered after a crash, its marked issue far beyond the first page of the listing: found and closed, never recorded as no issue (review gtb-r2 F3)", () => {
		const w = world();
		const q = mergeQuestion(w.ledger, w.train);
		sendingOnly(w.ledger, w.train, q);
		const target = buried(w, q, 600);
		w.ledger.answerQuestion(q, { ...JO, answer: "skip" });
		w.run();
		w.run();
		expect(target.state).toBe("CLOSED");
		expect(w.g.calls.filter((a) => a[0] === "issue" && a[1] === "close")).toEqual([expect.arrayContaining(["close", "1"])]);
		const end = alertEntries(w.ledger, w.train, q).at(-1)!;
		expect(end).toMatch(new RegExp(`^train-alert: ${q} closed `));
		expect(end).not.toContain("no issue was filed");
	});

	test("a marker lookup that fails or reads an unexpected shape writes nothing durable: no close recorded, no issue created, and the next tick finishes (review gtb-r2 F3)", () => {
		// the close after Jo's answer
		const w = world();
		const q = mergeQuestion(w.ledger, w.train);
		sendingOnly(w.ledger, w.train, q);
		const target = buried(w, q, 600);
		w.ledger.answerQuestion(q, { ...JO, answer: "skip" });
		const real = w.g.gh;
		w.g.gh = (args) => (listing(args) ? { code: 0, stdout: JSON.stringify({ message: "Server Error" }), stderr: "" } : real(args));
		w.run();
		w.g.gh = real;
		w.g.failWhen(listing);
		w.run();
		expect(target.state).toBe("OPEN");
		expect(alertEntries(w.ledger, w.train, q)).toEqual([`train-alert: ${q} level 1 sending`]);
		expect(w.ledger.entries(w.train).filter((e) => e.body.startsWith("train-error: tick")).length).toBeGreaterThan(0);
		w.g.failWhen(null);
		w.run();
		expect(target.state).toBe("CLOSED");
		expect(alertEntries(w.ledger, w.train, q).at(-1)).not.toContain("no issue was filed");

		// level 1's lookup before a create: the question is open and its issue was filed before a crash
		const v = world();
		const q2 = mergeQuestion(v.ledger, v.train);
		sendingOnly(v.ledger, v.train, q2);
		const filed = buried(v, q2, 600);
		v.g.failWhen(listing);
		v.run();
		expect(v.creates()).toEqual([]);
		expect(alertEntries(v.ledger, v.train, q2)).toEqual([`train-alert: ${q2} level 1 sending`]);
		v.g.failWhen(null);
		v.run();
		expect(v.creates()).toEqual([]);
		expect(alertEntries(v.ledger, v.train, q2).at(-1)).toBe(`train-alert: ${q2} level 1 sent ${filed.url}`);
	});
});
