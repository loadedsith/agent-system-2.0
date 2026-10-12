// surface/src/chaos.ts against hand-built throwaway ledgers (PLAN wl-mv45yxnkw2251c § 3, sl-chaos-lib):
// the judge ((a) by `kind:rowId`, (b), (c) through `builderLabs`, the settle re-check), the verdict's
// evidence rules, the isolation snapshot and diff over a temp "live" ledger, git repo and lanes root,
// the 03:00 PT window, the rotation, the report path and the report.
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { handSpawnBody } from "../../classifier/src/lab";
import { LANE_RUNNER_BY, LANE_STARTER_BY, Ledger } from "../../ledger/src/index";
import {
	daysSinceEpoch, emptySeen, type Evidence, type EvidenceItem, FAULT_EVIDENCE, FAULTS, type FaultName, ISOLATION_LIMIT, isolationDiff, isolationSnapshot,
	judgePoll, liveActorsOf, nightlyDue, nightlyFault, type Poll, REMOTE_TRACKING, renderReport, reportPath, type Seen, verdict,
} from "../src/chaos";
import { laneExitBody } from "../src/launch";
import { ORCHESTRATOR_RECIPIENT, SURFACE_BY } from "../src/types";
import { clock, tmp } from "./helpers";

const T0 = "2026-10-11T10:00:00.000Z";
const at = (s: number): string => new Date(Date.parse(T0) + s * 1000).toISOString();
const LANE = "lane-chaos-run1-1";
const noSessions = () => [];

/** A throwaway ledger with the run's workload, its clock at injection. */
function world() {
	const c = clock(T0);
	const ledger = Ledger.open(join(tmp("chaos"), "ledger.db"), { create: true, backup: false, backupOnOpen: false, clock: c.now });
	const wl = ledger.openWorkload({ by: "chaos", brief: "chaos run workload", stakes: "normal", mode: "autonomous", id: "wl-chaos-run1" });
	let seen: Seen = emptySeen();
	const polls: Poll[] = [];
	/** One judge poll `s` seconds after injection. */
	const poll = (s: number): Poll => {
		c.at(at(s));
		const p = judgePoll(ledger, wl, seen, { sessionModels: noSessions });
		seen = p.seen;
		polls.push(p);
		return p;
	};
	return { c, ledger, wl, poll, polls };
}
/** What the scenario builders write through: the throwaway ledger and its workload. */
interface World {
	ledger: Ledger;
	wl: string;
}

/** The lane's normal end: one slice done, then the chaos-hold question raised and the workload released on park. */
function parkedOnQuestion(w: World): { q: string; hold: string } {
	w.ledger.claimWorkload(w.wl, { by: LANE, holder: LANE, leaseMs: 120_000 });
	const done = w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "append one line to chaos/scratch.txt", doneCondition: "bun test chaos/ passes", inputs: "chaos/" });
	w.ledger.completeSlice(done, { by: LANE, artifact: "bun test chaos/ exit 0" });
	const hold = w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "chaos-hold", doneCondition: "Jo answers", inputs: "-" });
	const q = w.ledger.raiseQuestion({ by: LANE, workloadId: w.wl, sliceId: hold, body: "close or keep?", options: ["close", "keep"] });
	w.ledger.releaseWorkload(w.wl, { by: LANE, holder: LANE });
	return { q, hold };
}

/** The runner's record of a killed lane: its death line (held for the surface), its exit, and the release. */
function laneKilled(w: World, laneId = LANE, exitBy = LANE_RUNNER_BY): string {
	const msg = w.ledger.enqueue({ by: LANE_RUNNER_BY, workloadId: w.wl, sender: LANE_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: `lane-died: ${laneId}: died (signal SIGKILL)` });
	w.ledger.recordEntry({ by: exitBy, workloadId: w.wl, kind: "assumption", body: laneExitBody(laneId, { code: null, signal: "SIGKILL", outcome: "died" }) });
	w.ledger.releaseWorkload(w.wl, { by: LANE_RUNNER_BY, holder: laneId });
	return msg;
}

/** Every evidence item the fault names, observed at injection. */
function evidence(fault: FaultName, over: Partial<Evidence> = {}, items?: EvidenceItem[]): Evidence {
	return {
		fault, injectedAt: T0, nonceMisses: [], egress: [], harness: [],
		items: items ?? FAULT_EVIDENCE[fault].map((name) => ({ name, observed: "seen", at: T0 })),
		...over,
	};
}

describe("judge and verdict", () => {
	test("pass: one question line, nothing orphaned, no dead hand; the settle re-check 30 s on agrees", () => {
		const w = world();
		const { q } = parkedOnQuestion(w);
		for (const s of [5, 10, 20, 30, 35, 40]) w.poll(s);
		const p0 = w.polls[0]!;
		expect(p0.a).toEqual({ ok: true, union: [`question:${q}`], present: [`question:${q}`] });
		expect(p0.b.ok).toBe(true);
		expect(p0.c).toEqual({ ok: true, exitedHands: [], counted: [] });
		const v = verdict(w.polls, evidence("orchestrator-kill-mid-review"));
		expect(v.verdict).toBe("PASS");
		expect(v.deciding?.at).toBe(at(5));
		expect(v.settle?.at).toBe(at(35));
		expect(v.atMs).toBe(5_000);
		const report = renderReport({
			fault: "orchestrator-kill-mid-review", variant: null, token: "run1", fence: "on", verdict: v,
			timings: { startedAt: T0, setupMs: 61_000, triggerAt: T0, injectedAt: T0 }, evidence: evidence("orchestrator-kill-mid-review"),
			egressLog: [{ phase: "preflight", host: "api.anthropic.com" }], rows: null, runners: [], stubCounts: { "anthropic/claude-sonnet-4-5": 7 },
			isolation: null, scratch: { path: "/tmp/as2-chaos-run1", kept: false }, notes: [],
		});
		expect(report).toContain("# chaos orchestrator-kill-mid-review: PASS");
		expect(report).toContain(`question:${q}`);
		expect(report).toContain("fence: on");
		expect(report).toContain("| preflight | api.anthropic.com |");
		expect(report).toContain(`Known limit: ${ISOLATION_LIMIT}`);
	});

	test("two-line fail: a second identity fails the run at that poll, though the first poll had passed", () => {
		const w = world();
		const { q } = parkedOnQuestion(w);
		w.poll(5);
		const msg = w.ledger.enqueue({ by: LANE_RUNNER_BY, workloadId: w.wl, sender: LANE_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: `lane-died: ${LANE}: died (signal SIGKILL)` });
		const p1 = w.poll(10);
		expect(p1.a.union).toEqual([`question:${q}`, `lane-died:${msg}`]);
		w.poll(40);
		const v = verdict(w.polls, evidence("orchestrator-kill-mid-review"));
		expect(v.verdict).toBe("FAIL");
		expect(v.reason).toContain("(a) reached 2 needs-you lines at +10 s");
		expect(v.atMs).toBe(10_000);
	});

	test("a changed-text same-identity line counts once: the death line's open-slice count moves, its kind:rowId does not", () => {
		const w = world();
		w.ledger.claimWorkload(w.wl, { by: LANE, holder: LANE, leaseMs: 120_000 });
		const s1 = w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "first", doneCondition: "d", inputs: "i" });
		w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "second", doneCondition: "d", inputs: "i" });
		const msg = laneKilled(w);
		const p0 = w.poll(5);
		w.ledger.completeSlice(s1, { by: SURFACE_BY, artifact: "by hand" });
		const p1 = w.poll(10);
		w.poll(40);
		expect(p0.lines[0]!.text).toContain("2 open slice(s)");
		expect(p1.lines[0]!.text).toContain("1 open slice(s)");
		expect(p1.a).toEqual({ ok: true, union: [`lane-died:${msg}`], present: [`lane-died:${msg}`] });
		expect(p1.seen.lines.get(`lane-died:${msg}`)).toMatchObject({ firstText: p0.lines[0]!.text, text: p1.lines[0]!.text, firstPoll: 0 });
		// the open slice is unheld but surfaced by the single death line: (b) holds
		expect(p1.b).toMatchObject({ ok: true, holder: null, orphans: [] });
		expect(verdict(w.polls, evidence("lane-kill-mid-hand")).verdict).toBe("PASS");
	});

	test("an orphaned open slice: unheld and the single line is a question, not a death; the window ends without a pass", () => {
		const w = world();
		w.ledger.claimWorkload(w.wl, { by: LANE, holder: LANE, leaseMs: 120_000 });
		const stray = w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "left open", doneCondition: "d", inputs: "i" });
		const hold = w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "chaos-hold", doneCondition: "d", inputs: "i" });
		w.ledger.raiseQuestion({ by: LANE, workloadId: w.wl, sliceId: hold, body: "close or keep?", options: ["close", "keep"] });
		const held = w.poll(5);
		expect(held.b).toMatchObject({ ok: true, liveHolder: true });
		w.ledger.releaseWorkload(w.wl, { by: LANE, holder: LANE });
		const p = w.poll(10);
		expect(p.a.ok).toBe(true);
		expect(p.b).toEqual({ ok: false, holder: null, liveHolder: false, openSlices: [stray], orphans: [{ sliceId: stray, task: "left open" }] });
		// judged from the release on (the held poll above would itself pass and decide)
		const v = verdict(w.polls.slice(1), evidence("orchestrator-kill-mid-review"), 10_000);
		expect(v.verdict).toBe("FAIL");
		expect(v.reason).toContain(`orphaned: ${stray}`);
	});

	test("a dead hand still counted: its lane exited, but builderLabs counts its fallback row (c)", () => {
		const spawned = (exitBy: string) => {
			const w = world();
			w.ledger.claimWorkload(w.wl, { by: LANE, holder: LANE, leaseMs: 120_000 });
			w.ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: w.wl, kind: "assumption", body: `lane-started: ${LANE} {"pid":4242}` });
			const sl = w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "append a line", doneCondition: "d", inputs: "i" });
			w.ledger.recordEntry({
				by: LANE, workloadId: w.wl, sliceId: sl, kind: "assumption",
				body: handSpawnBody({ token: "dt-1", root: join(tmp("sessions"), "lane"), spawnKey: "Hand1", review: false, group: "fast", row: ["openai-codex/gpt-5.1-codex-mini", "moonshot/kimi-k2"] }),
			});
			laneKilled(w, LANE, exitBy);
			return w.poll(5);
		};
		// the lane-exit: comes from the lane itself, so builderLabs' death rule (runner or starter only) does not fire
		const counted = spawned(LANE);
		expect(counted.c.ok).toBe(false);
		expect(counted.c.exitedHands).toEqual(["dt-1"]);
		expect(counted.c.counted).toHaveLength(1);
		expect(counted.c.counted[0]!.why).toContain("builderLabs still counts its row: openai; kimi");
		expect(counted.ok).toBe(false);
		// the runner's lane-exit: makes the hand dead to builderLabs too; with no session file it counts nothing
		const dead = spawned(LANE_RUNNER_BY);
		expect(dead.c).toEqual({ ok: true, exitedHands: ["dt-1"], counted: [] });
		expect(dead.builders.labs).toEqual([]);
		expect(dead.ok).toBe(true);
	});

	test("a late orphan appearing in the settle window fails the re-check", () => {
		const w = world();
		parkedOnQuestion(w);
		w.poll(5);
		w.poll(10);
		const late = w.ledger.addSlice({ by: LANE, workloadId: w.wl, task: "late", doneCondition: "d", inputs: "i" });
		w.poll(20);
		w.poll(35);
		const v = verdict(w.polls, evidence("orchestrator-kill-mid-review"));
		expect(v.verdict).toBe("FAIL");
		expect(v.deciding?.at).toBe(at(5));
		expect(v.settle?.at).toBe(at(35));
		expect(v.reason).toContain("then changed by the settle re-check at +35 s");
		expect(v.reason).toContain(`(b) fails: no holder, 1 open slice(s), orphaned: ${late}`);
	});

	test("evidence rules: egress and nonce misses fail, a missing or unobserved item is a harness error, a missed system item fails, lost evidence fails the settle", () => {
		const w = world();
		parkedOnQuestion(w);
		for (const s of [5, 20, 35]) w.poll(s);
		const fault = "duplicate-lane-runner";
		const names = FAULT_EVIDENCE[fault];
		expect(verdict(w.polls, evidence(fault, { egress: ["api.anthropic.com"] })).reason).toBe("egress attempted in the measured phase: api.anthropic.com");
		expect(verdict(w.polls, evidence(fault, { nonceMisses: ["lane turn 3"] })).verdict).toBe("FAIL");
		expect(verdict(w.polls, evidence(fault, { harness: ["unrouted model x/y"] })).verdict).toBe("HARNESS-ERROR");
		const some = evidence(fault, {}, [{ name: names[0]!, observed: "exit 3, stderr held", at: T0 }]);
		expect(verdict(w.polls, some)).toMatchObject({ verdict: "HARNESS-ERROR", reason: `fault evidence never recorded: ${names[1]}, ${names[2]}` });
		const all = (over: Partial<EvidenceItem>[]) => evidence(fault, {}, names.map((name, i) => ({ name, observed: "seen", at: T0, ...over[i] })));
		expect(verdict(w.polls, all([{ at: null, observed: "second launch still running" }])).verdict).toBe("HARNESS-ERROR");
		const systemMiss = verdict(w.polls, all([{}, { at: null, observed: "wrote lane-started: lane-chaos-run1-2", systemFault: true }]));
		expect(systemMiss.verdict).toBe("FAIL");
		expect(systemMiss.reason).toContain("wrote lane-started: lane-chaos-run1-2");
		const lost = verdict(w.polls, all([{}, {}, { lostAt: at(25), observed: "lane-chaos-run1-2 reserved the workload" }]));
		expect(lost.verdict).toBe("FAIL");
		expect(lost.reason).toContain('evidence "first lane held throughout, no second lane held or reserved" no longer holds');
		const noSettle = verdict(w.polls.slice(0, 2), all([]));
		expect(noSettle.verdict).toBe("HARNESS-ERROR");
	});
});

describe("isolation snapshot and diff", () => {
	const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
	const git = (dir: string, ...args: string[]) => {
		const r = Bun.spawnSync(["git", "-C", dir, "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", ...args], { env: gitEnv, stdout: "pipe", stderr: "pipe" });
		if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
		return r.stdout.toString().trim();
	};
	/** A "live" system in temp dirs: a ledger with one held workload, a checkout with a dirty file, a lanes root with that workload's dir. */
	function live() {
		const root = tmp("chaos-live");
		const ledgerDb = join(root, "ledger.db");
		const c = clock(T0);
		const ledger = Ledger.open(ledgerDb, { create: true, backup: false, backupOnOpen: false, clock: c.now });
		const wl = ledger.openWorkload({ by: SURFACE_BY, brief: "Jo's live workload", stakes: "normal", mode: "autonomous", id: "wl-live" });
		ledger.claimWorkload(wl, { by: "lane-live-1", holder: "lane-live-1", leaseMs: 3_600_000 });
		const sl = ledger.addSlice({ by: "lane-live-1", workloadId: wl, task: "live work", doneCondition: "d", inputs: "i" });
		ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: "launch: lane-live-1 requested by jo" });
		const checkout = join(root, "checkout");
		mkdirSync(checkout);
		git(checkout, "init", "-q", "-b", "main");
		writeFileSync(join(checkout, "a.txt"), "committed\n");
		git(checkout, "add", "a.txt");
		git(checkout, "commit", "-q", "-m", "init");
		writeFileSync(join(checkout, "a.txt"), "dirty 1\n");
		const lanes = join(root, "lanes");
		mkdirSync(join(lanes, "wl-live", "sessions"), { recursive: true });
		const paths = { ledgerDb, checkout, lanesRoots: [lanes] };
		return { c, ledger, wl, sl, checkout, lanes, paths, snap: () => isolationSnapshot(paths) };
	}

	test("an updated live ledger row is listed with its table, id, actor and workload; strangers and the run's token fail", () => {
		const l = live();
		const before = l.snap();
		expect(before.ledger.error).toBeNull();
		expect(before.checkout.error).toBeNull();
		const liveActors = liveActorsOf(before);
		expect([...liveActors]).toEqual(expect.arrayContaining([SURFACE_BY, "lane-live-1", LANE_STARTER_BY]));
		l.ledger.completeSlice(l.sl, { by: "lane-live-1", artifact: "bun test exit 0" });
		const after = l.snap();
		const d = isolationDiff(before, after, ["run1tok", "/tmp/as2-chaos-run1tok", "wl-chaos-run1tok"], liveActors);
		expect(d.ledger.rows).toContainEqual({ table: "slices", key: l.sl, change: "update", actor: "lane-live-1", workload: "wl-live", fail: null });
		expect(d.ledger.rows.filter((r) => r.table === "provenance").every((r) => r.change === "insert" && r.actor === "lane-live-1")).toBe(true);
		expect(d.failures).toEqual([]);
		expect(d.ok).toBe(true);

		// a relaunch of Jo's lane during the run: the starter (live) names the new lane id, so its rows are live too
		l.ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: l.wl, kind: "assumption", body: "launch: lane-live-2 requested by jo" });
		l.ledger.recordEntry({ by: "lane-live-2", workloadId: l.wl, kind: "wake-read", body: "resuming" });
		expect(isolationDiff(before, l.snap(), "run1tok", liveActors).ok).toBe(true);

		const stranger = l.ledger.recordEntry({ by: "lane-stranger-1", workloadId: l.wl, kind: "assumption", body: "hello" });
		const named = l.ledger.recordEntry({ by: "lane-live-1", workloadId: l.wl, kind: "assumption", body: "saw /tmp/as2-chaos-run1tok/home" });
		const chaos = l.ledger.recordEntry({ by: "chaos", workloadId: l.wl, kind: "assumption", body: "launch requested" });
		const bad = isolationDiff(before, l.snap(), ["run1tok"], liveActors);
		expect(bad.ok).toBe(false);
		const fails = Object.fromEntries(bad.ledger.rows.filter((r) => r.table === "entries" && r.fail).map((r) => [r.key, r.fail]));
		expect(fails).toEqual({
			[stranger]: "actor lane-stranger-1 was not active on the live ledger before the run",
			[named]: "names the run (run1tok)",
			[chaos]: "written by chaos actor chaos",
		});
	});

	test("a dirty file's content change shows in the checkout diff although git status is unchanged; untouched snapshots compare equal", () => {
		const l = live();
		const s1 = l.snap();
		const s1again = l.snap();
		const quiet = isolationDiff(s1, s1again, "run1tok", liveActorsOf(s1));
		expect(quiet.checkout).toEqual([]);
		expect(quiet.ok).toBe(true);
		expect(Object.keys(s1.checkout.status)).toEqual(["a.txt"]);
		writeFileSync(join(l.checkout, "a.txt"), "dirty 2\n");
		const s2 = l.snap();
		expect(s2.checkout.status).toEqual(s1.checkout.status);
		const d = isolationDiff(s1, s2, "run1tok", liveActorsOf(s1));
		expect(d.checkout).toEqual([{ field: "file", detail: `a.txt: ${s1.checkout.files["a.txt"]} → ${s2.checkout.files["a.txt"]}`, attributedTo: null }]);
		expect(d.failures).toEqual([`live checkout file changed: a.txt: ${s1.checkout.files["a.txt"]} → ${s2.checkout.files["a.txt"]}`]);
		writeFileSync(join(l.checkout, "new file.txt"), "x\n");
		const s3 = l.snap();
		const fields = isolationDiff(s2, s3, "run1tok", liveActorsOf(s2)).checkout.map((c) => `${c.field} ${c.detail.split(":")[0]}`);
		expect(fields).toEqual(["status new file.txt", "file new file.txt"]);
	});

	test("refs and lanes roots: a live lane's wl/<id> ref and its dir are listed; another ref, or an entry naming the run, fails", () => {
		const l = live();
		const s1 = l.snap();
		git(l.checkout, "branch", "wl/wl-live");
		writeFileSync(join(l.lanes, "wl-live", "sessions", "lane-live-1.log"), "x");
		const s2 = l.snap();
		const d = isolationDiff(s1, s2, "run1tok", liveActorsOf(s1));
		expect(d.checkout).toEqual([expect.objectContaining({ field: "ref", attributedTo: "wl-live" })]);
		expect(d.listings.map((x) => [x.workload, x.change, x.path, x.fail])).toEqual([
			["wl-live", "changed", "wl-live/sessions", false],
			["wl-live", "added", "wl-live/sessions/lane-live-1.log", false],
		]);
		expect(d.ok).toBe(true);
		git(l.checkout, "branch", "other");
		mkdirSync(join(l.lanes, "wl-chaos-run1tok"));
		const bad = isolationDiff(s2, l.snap(), "run1tok", liveActorsOf(s2));
		expect(bad.failures).toEqual(expect.arrayContaining([
			expect.stringMatching(/^live checkout ref changed: refs\/heads\/other: absent → /),
			`live lanes root ${l.lanes}: added wl-chaos-run1tok names the run`,
		]));
	});

	test("a remote-tracking ref move (a live lane's fetch) is listed and does not fail; a refs/heads/main move still fails", () => {
		const l = live();
		git(l.checkout, "update-ref", "refs/remotes/origin/main", "HEAD");
		const s1 = l.snap();
		const next = git(l.checkout, "commit-tree", "HEAD^{tree}", "-p", "HEAD", "-m", "fetched");
		git(l.checkout, "update-ref", "refs/remotes/origin/main", next);
		const s2 = l.snap();
		const fetched = isolationDiff(s1, s2, "run1tok", liveActorsOf(s1));
		expect(fetched.checkout).toEqual([{ field: "ref", detail: `refs/remotes/origin/main: ${s1.checkout.refs.split(" ")[0]} commit → ${next} commit`, attributedTo: REMOTE_TRACKING }]);
		expect(fetched.ok).toBe(true);
		git(l.checkout, "update-ref", "refs/heads/main", next);
		const moved = isolationDiff(s2, l.snap(), "run1tok", liveActorsOf(s2));
		expect(moved.ok).toBe(false);
		expect(moved.failures).toEqual(expect.arrayContaining([expect.stringMatching(/^live checkout ref changed: refs\/heads\/main: \w+ commit → \w+ commit$/), expect.stringMatching(/^live checkout HEAD changed: /)]));
		expect(moved.failures.some((f) => f.includes("refs/remotes/"))).toBe(false);
	});
});

describe("nightly window and rotation", () => {
	const reports = () => tmp("chaos-reports");

	test("due at PT 03:05, not at 03:20; the window is [03:00, 03:15) and a report for the PT date stops it", () => {
		const dir = reports();
		expect(nightlyDue(new Date("2026-07-15T10:05:00Z"), dir)).toBe(true); // 03:05 PDT
		expect(nightlyDue(new Date("2026-07-15T10:20:00Z"), dir)).toBe(false); // 03:20 PDT
		expect(nightlyDue(new Date("2026-07-15T10:00:00Z"), dir)).toBe(true);
		expect(nightlyDue(new Date("2026-07-15T10:14:59Z"), dir)).toBe(true);
		expect(nightlyDue(new Date("2026-07-15T09:59:59Z"), dir)).toBe(false);
		expect(nightlyDue(new Date("2026-07-15T10:15:00Z"), dir)).toBe(false);
		writeFileSync(join(dir, "launchd.log"), "");
		expect(nightlyDue(new Date("2026-07-15T10:05:00Z"), dir)).toBe(true);
		writeFileSync(join(dir, "2026-07-15-provider-refusal.md"), "# report");
		expect(nightlyDue(new Date("2026-07-15T10:05:00Z"), dir)).toBe(false);
		expect(nightlyDue(new Date("2026-07-16T10:05:00Z"), dir)).toBe(true);
	});

	test("from a UTC+5:30 clock: 15:35 IST is 03:05 PDT and due, 15:50 IST is not", () => {
		const prior = process.env.TZ;
		process.env.TZ = "Asia/Kolkata";
		try {
			const ist = new Date("2026-07-15T15:35:00+05:30");
			expect([ist.getHours(), ist.getMinutes(), ist.getTimezoneOffset()]).toEqual([15, 35, -330]);
			expect(nightlyDue(ist, reports())).toBe(true);
			expect(nightlyDue(new Date("2026-07-15T15:50:00+05:30"), reports())).toBe(false);
			// every IST quarter hour is a UTC quarter hour: one fire of a whole PT day lands in the window
			const dir = reports();
			const fires = Array.from({ length: 96 }, (_, i) => new Date(Date.parse("2026-07-15T12:30:00+05:30") + i * 900_000)).filter((d) => nightlyDue(d, dir));
			expect(fires.map((d) => d.toISOString())).toEqual(["2026-07-15T10:00:00.000Z"]);
		} finally {
			if (prior === undefined) delete process.env.TZ;
			else process.env.TZ = prior;
		}
	});

	test("both 2026 DST transitions: exactly one quarter-hourly fire of the PT day is due, at 03:00 local", () => {
		const firesOf = (fromIso: string, hours: number) => {
			const dir = reports();
			return Array.from({ length: hours * 4 }, (_, i) => new Date(Date.parse(fromIso) + i * 900_000)).filter((d) => nightlyDue(d, dir)).map((d) => d.toISOString());
		};
		// 2026-03-08: 02:00 PST jumps to 03:00 PDT; the PT day is 23 hours from 08:00Z
		expect(firesOf("2026-03-08T08:00:00Z", 23)).toEqual(["2026-03-08T10:00:00.000Z"]);
		expect(nightlyDue(new Date("2026-03-08T10:05:00Z"), reports())).toBe(true); // 03:05 PDT
		expect(nightlyDue(new Date("2026-03-08T11:05:00Z"), reports())).toBe(false); // 04:05 PDT
		// 2026-11-01: 02:00 PDT falls back to 01:00 PST; the PT day is 25 hours from 07:00Z
		expect(firesOf("2026-11-01T07:00:00Z", 25)).toEqual(["2026-11-01T11:00:00.000Z"]);
		expect(nightlyDue(new Date("2026-11-01T10:05:00Z"), reports())).toBe(false); // 02:05 PST
		expect(nightlyDue(new Date("2026-11-01T11:05:00Z"), reports())).toBe(true); // 03:05 PST
	});

	test("nightlyFault cycles through the five faults by PT date", () => {
		expect(nightlyFault("1970-01-01")).toBe(FAULTS[0]);
		expect(daysSinceEpoch("2026-10-11")).toBe(20737);
		expect(nightlyFault("2026-10-11")).toBe("network-block-60s");
		const days = Array.from({ length: 10 }, (_, i) => new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10));
		const seq = days.map((d) => nightlyFault(d));
		expect(new Set(seq.slice(0, 5)).size).toBe(5);
		expect(seq.slice(5)).toEqual(seq.slice(0, 5));
		expect(seq.slice(0, 3)).toEqual(["network-block-60s", "provider-refusal", "duplicate-lane-runner"]);
		// 05:30Z on the 12th is 22:30 PDT on the 11th: the PT date picks the fault
		expect(nightlyFault(new Date("2026-10-12T05:30:00Z"))).toBe("network-block-60s");
	});

	test("report path: PT date, then a -HHMM suffix on collision", () => {
		const dir = reports();
		const now = new Date("2026-10-12T05:30:00Z"); // 2026-10-11 22:30 PDT
		const first = reportPath(dir, now, "provider-refusal");
		expect(first).toBe(join(dir, "2026-10-11-provider-refusal.md"));
		writeFileSync(first, "");
		const second = reportPath(dir, now, "provider-refusal");
		expect(second).toBe(join(dir, "2026-10-11-provider-refusal-2230.md"));
		writeFileSync(second, "");
		expect(reportPath(dir, now, "provider-refusal")).toBe(join(dir, "2026-10-11-provider-refusal-2230-2.md"));
		expect(reportPath(dir, now, "lane-kill-mid-hand")).toBe(join(dir, "2026-10-11-lane-kill-mid-hand.md"));
	});
});
