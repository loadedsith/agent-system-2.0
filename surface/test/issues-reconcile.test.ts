// The reconciler (PLAN wl-mv66ylim0gahog § 4, § 9.3 sl-issues-reconcile, § 13.2): the hourly drift
// entry on wl-orchestrator, `unknown` (never 0) on a 1000-row list, a failed read, a low rate limit
// or a spent budget; remote-only drift (a label, the close reason, a title, a removed `as2` label, a
// deleted issue, a reopen) repaired by the next push; a pending footer and move drift counted; the
// two-run notice; drift on a Linear item; and `surface/scripts/issues.ts check`, which prints the
// same computation and writes nothing. GitHub is `FakeGh` behind the exec seam (its label list and
// a missing issue answered here), Linear is `FakeLinear` behind the injected fetch: no network call.
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { recordRepo } from "../src/decision-log";
import { ensureStandingWorkload } from "../src/identity";
import { type IssuesConfig, ISSUES_DEFAULTS } from "../src/issues/config";
import type { Exec } from "../src/issues/github";
import { tick } from "../src/issues/projector";
import { DRIFT_PREFIX, ISSUE_LIST_LIMIT, prsOfBlock, reconcile, reopenComment } from "../src/issues/reconcile";
import { issueTitle, LABEL } from "../src/issues/render";
import { INTAKE_IGNORED, STATE, Sidecar, sidecarPath } from "../src/issues/sidecar";
import { switchBody } from "../src/issues/switch";
import { STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import { check } from "../scripts/issues";
import { arg, FakeGh, FakeLinear, json, REPO } from "./issues-fakes";
import { tempLedger, tmp } from "./helpers";

const T0 = Date.parse("2026-10-14T10:00:00.000Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const KEY = "lin_api_RECONCILE0123456789";
const SCRIPT = join(import.meta.dir, "..", "scripts", "issues.ts");

/** A temp ledger and sidecar, FakeGh and FakeLinear, a GitHub checkout (o/r) and a Linear one (lin/app ⇒ ENG), the tick with the reconcile phase. */
function setup(o: { over?: Partial<IssuesConfig>; key?: string | null } = {}) {
	let t = T0;
	const { ledger, path } = tempLedger(() => new Date(t).toISOString());
	const sidecar = Sidecar.open(sidecarPath({ AGENT_SYSTEM_LEDGER_DB: path }));
	const gh = new FakeGh();
	const linear = new FakeLinear();
	const repoDir = tmp("rc-checkout");
	const linDir = tmp("rc-lin-checkout");
	gh.origins.set(repoDir, `https://github.com/${REPO}.git`);
	gh.origins.set(linDir, "git@github.com:lin/app.git");
	const config: IssuesConfig = {
		trackers: [
			{ match: REPO, tracker: { kind: "github" } },
			{ match: "lin/*", tracker: { kind: "linear", team: "ENG" } },
		],
		overrides: {},
		jo: "jo",
		...ISSUES_DEFAULTS,
		perTick: 100,
		perHour: 10_000,
		...o.over,
	};
	const key = o.key === undefined ? KEY : o.key;
	const notices: string[] = [];
	let listPad = 0;
	// The reconciler's label list (bodies, states, every as2 issue) and a number GitHub does not have; the rest is FakeGh's.
	const exec: Exec = async (command, args) => {
		if (command === "gh" && args[0] === "issue" && args[1] === "list" && !args.includes("--search")) {
			gh.calls.push(args);
			if (gh.fail(args)) return { stdout: "", stderr: "HTTP 502: Bad Gateway", code: 1, killed: false };
			const rows = [...gh.issues.values()]
				.filter((i) => i.labels.has(arg(args, "--label")))
				.map((i) => ({ number: i.number, title: i.title, state: i.state, stateReason: i.stateReason, labels: [...i.labels].map((name) => ({ name })), body: i.body }));
			for (let i = 0; i < listPad; i++) rows.push({ number: 70_000 + i, title: `pad ${i}`, state: "CLOSED", stateReason: "COMPLETED", labels: [{ name: LABEL.as2 }], body: "" });
			return json(rows.slice(0, Number(arg(args, "-L"))));
		}
		if (command === "gh" && args[0] === "issue" && (args[1] === "view" || args[1] === "edit") && !gh.issues.has(Number(args[2]))) {
			gh.calls.push(args);
			return { stdout: "", stderr: `GraphQL: Could not resolve to an issue or pull request with the number of ${args[2]}. (repository.issue)`, code: 1, killed: false };
		}
		return gh.exec(command, args);
	};
	const h = {
		ledger,
		path,
		sidecar,
		gh,
		linear,
		exec,
		repoDir,
		linDir,
		config,
		notices,
		key,
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
		pad: (n: number) => {
			listPad = n;
		},
		run: () => tick({ exec, ledger, sidecar, config, holder: "h1", now: () => t, notice: (l) => notices.push(l), phases: { reconcile }, linear: { key, fetch: linear.fetch } }),
		/** An hour on, then a tick: the reconciler is due. */
		hourly: () => {
			t += HOUR;
			return h.run();
		},
		on: () => {
			ensureStandingWorkload(ledger);
			t += 1_000;
			ledger.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: switchBody(true, "in-sw1") });
		},
		open: (brief = "build the thing", dir = repoDir): string => {
			t += 1_000;
			const id = ledger.openWorkload({ by: SURFACE_BY, brief, stakes: "normal", mode: "autonomous" });
			recordRepo(ledger, id, dir);
			return id;
		},
		close: (id: string) => {
			t += 1_000;
			ledger.closeWorkload(id, { by: SURFACE_BY });
		},
		/** The drift entries on wl-orchestrator, oldest first. */
		drift: (): string[] =>
			ledger
				.entries(STANDING_WORKLOAD_ID, "assumption")
				.filter((e) => e.body.startsWith(DRIFT_PREFIX))
				.map((e) => e.body),
		last: (): string => h.drift().at(-1) ?? "",
		issueOf: (id: string) => gh.issues.get(sidecar.link(id)?.issue_number ?? -1)!,
		linearOf: (id: string) => linear.issues.get(sidecar.link(id)?.external_id ?? "")!,
		/** On, one GitHub workload pushed and the first (clean) reconcile recorded. */
		pushedOne: async (brief = "build the thing") => {
			h.on();
			const id = h.open(brief);
			await h.run();
			expect(h.drift()).toHaveLength(1);
			return { id, issue: h.issueOf(id) };
		},
	};
	return h;
}

describe("the drift entry", () => {
	test("a clean run records 0; Jo's title edit is one line naming the tracker, forced, repaired by the next push; the schedule is hourly", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		expect(h.last()).toBe(`issues-drift: 0 at ${new Date(h.now()).toISOString()}`);
		expect(h.sidecar.state(STATE.lastReconcile)).toBe(String(h.now()));
		h.advance(30 * MIN);
		await h.run();
		expect(h.drift()).toHaveLength(1);

		issue.title = `${id} — Jo renamed it`;
		const seqBefore = h.ledger.db.query<{ m: number }, []>("SELECT max(seq) AS m FROM provenance").get()!.m;
		await h.hourly();
		const entry = h.last().split("\n");
		expect(entry[0]).toBe(`issues-drift: 1 at ${new Date(h.now()).toISOString()}`);
		expect(entry[1]).toBe(`github ${REPO} #${issue.number} ${id}: title "${id} — Jo renamed it" (ledger: "${issueTitle(id, "build the thing")}")`);
		expect(h.sidecar.link(id)).toMatchObject({ dirty: 1, force: 1, fails: 0 });
		// The entry is the only ledger write: the workload's own provenance did not move.
		expect(h.ledger.db.query<{ m: number }, [string]>("SELECT max(seq) AS m FROM provenance WHERE workload_id = ?").get(id)!.m).toBeLessThan(seqBefore + 1);

		h.gh.calls.length = 0;
		h.advance(MIN);
		await h.run();
		expect(h.gh.made("issue edit")).toHaveLength(1);
		expect(issue.title).toBe(issueTitle(id, "build the thing"));
		expect(h.sidecar.link(id)).toMatchObject({ dirty: 0, force: 0 });
		await h.hourly();
		expect(h.last()).toStartWith("issues-drift: 0 at ");
	});

	test("ignored intake issues since the last run are one line, not counted", async () => {
		const h = setup();
		await h.pushedOne();
		h.sidecar.immediate(() => {
			for (const [n, reason] of [[90, "not Jo"], [91, "not Jo"], [92, "filed before issues on"]] as const) {
				h.sidecar.db.query("INSERT INTO intake (issue_number, verdict, reason, in_id, acked, seen_at) VALUES (?, ?, ?, NULL, 0, ?)").run(n, INTAKE_IGNORED, reason, new Date(h.now() + 1).toISOString());
			}
		});
		await h.hourly();
		expect(h.last().split("\n")).toEqual([`issues-drift: 0 at ${new Date(h.now()).toISOString()}`, "intake: 3 ignored (filed before issues on 1, not Jo 2)"]);
		await h.hourly();
		expect(h.last().split("\n")).toHaveLength(1);
	});
});

describe("unknown, never 0", () => {
	test("a 1000-row label list, a failed list, and a rate limit under the floor each record unknown", async () => {
		const h = setup();
		await h.pushedOne();
		h.pad(ISSUE_LIST_LIMIT);
		await h.hourly();
		expect(h.last()).toBe(`issues-drift: unknown (github ${REPO}: gh issue list returned ${ISSUE_LIST_LIMIT} rows, the limit) at ${new Date(h.now()).toISOString()}`);

		h.pad(0);
		h.gh.fail = (a) => a[0] === "issue" && a[1] === "list" && !a.includes("--search");
		await h.hourly();
		expect(h.last()).toStartWith(`issues-drift: unknown (github ${REPO}: gh issue list exited 1: HTTP 502: Bad Gateway) at `);

		h.gh.fail = () => false;
		h.gh.remaining = 100;
		h.gh.calls.length = 0;
		await h.hourly();
		expect(h.last()).toStartWith("issues-drift: unknown (GitHub rate limit under 500 at the hourly read; GitHub was not read) at ");
		expect(h.gh.made("issue list")).toHaveLength(0);
		expect(h.drift().filter((b) => b.startsWith("issues-drift: 0"))).toHaveLength(1);
	});

	test("a spent budget records unknown, then the stop ends the tick; the run is not repeated next tick", async () => {
		const h = setup();
		await h.pushedOne();
		// The hourly rate_limit read and the PR scan spend the tick's two calls; the label list has none left.
		h.config.perTick = 2;
		const r = await h.hourly();
		expect(r.stopped).toBe("budget");
		expect(h.last()).toStartWith("issues-drift: unknown (the github call budget ran out (2 github calls this tick)) at ");
		h.advance(MIN);
		await h.run();
		expect(h.drift()).toHaveLength(2);
	});
});

describe("remote-only drift is repaired by the next push", () => {
	test("Jo's label change on GitHub (ledger unchanged) is one line and the push puts the rendered labels back; a removed as2 label is found by number", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		expect([...issue.labels].sort()).toEqual([LABEL.as2, LABEL.waiting]);
		issue.labels.delete(LABEL.waiting);
		issue.labels.add(LABEL.running);
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(`github ${REPO} #${issue.number} ${id}: labels [as2, running] (ledger: [as2, waiting])`);

		h.gh.calls.length = 0;
		h.advance(MIN);
		await h.run();
		const edit = h.gh.made("issue edit");
		expect(edit).toHaveLength(1);
		expect(arg(edit[0]!, "--add-label")).toBe(LABEL.waiting);
		expect(arg(edit[0]!, "--remove-label")).toBe(LABEL.running);
		expect([...issue.labels].sort()).toEqual([LABEL.as2, LABEL.waiting]);

		issue.labels.delete(LABEL.as2);
		h.gh.calls.length = 0;
		await h.hourly();
		expect(h.gh.made("issue view").map((a) => a[2])).toEqual([String(issue.number)]);
		expect(h.last().split("\n")[1]).toBe(`github ${REPO} #${issue.number} ${id}: labels [waiting] (ledger: [as2, waiting])`);
		h.advance(MIN);
		await h.run();
		expect(issue.labels.has(LABEL.as2)).toBe(true);
		await h.hourly();
		expect(h.last()).toStartWith("issues-drift: 0 at ");
	});

	test("a remote-only close-reason change (not planned where the ledger renders completed, no ledger event) is repaired by reopen + close", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		h.close(id);
		h.advance(MIN);
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		issue.stateReason = "NOT_PLANNED";
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(`github ${REPO} #${issue.number} ${id}: state closed not planned (ledger: closed completed)`);
		expect(issue.comments).toEqual([]);

		h.gh.calls.length = 0;
		h.advance(MIN);
		await h.run();
		const states = h.gh.calls.filter((a) => a[0] === "issue" && (a[1] === "reopen" || a[1] === "close"));
		expect(states.map((a) => a[1])).toEqual(["reopen", "close"]);
		expect(arg(states[1]!, "-r")).toBe("completed");
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		await h.hourly();
		expect(h.last()).toStartWith("issues-drift: 0 at ");
	});

	test("Jo reopening a closed workload's issue is repaired toward closed with one comment", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		h.close(id);
		h.advance(MIN);
		await h.run();
		issue.state = "OPEN";
		issue.stateReason = "REOPENED";
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(`github ${REPO} #${issue.number} ${id}: state open (ledger: closed completed)`);
		expect(issue.comments).toEqual([reopenComment(id)]);
		h.advance(MIN);
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		expect(issue.comments).toHaveLength(1);
	});

	test("an issue deleted on GitHub is one line; its number is cleared and the next push creates it again", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		h.gh.issues.delete(issue.number);
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(`github ${REPO} #${issue.number} ${id}: not found on GitHub; the next push creates its issue again`);
		expect(h.sidecar.link(id)).toMatchObject({ issue_number: null, dirty: 1, pushed_hash: null });
		h.advance(MIN);
		await h.run();
		const again = h.issueOf(id);
		expect(again.number).not.toBe(issue.number);
		expect(again.title).toBe(issueTitle(id, "build the thing"));
		await h.hourly();
		expect(h.last()).toStartWith("issues-drift: 0 at ");
	});
});

describe("local drift", () => {
	test("a pending footer is one line; move drift is one line, reported once; an open workload with no issue is one line and gets a dirty link", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const pr = h.gh.addPr(`wl/${id}`);
		h.gh.fail = (a) => a[0] === "pr" && a[1] === "edit";
		// The scan owes the footer, its edit fails: GitHub's work stops, the phases do not run.
		await h.hourly();
		expect(h.drift()).toHaveLength(1);
		h.sidecar.immediate(() => h.sidecar.setState(STATE.moveDrift, JSON.stringify([`wl-old: ${pr.url} still carries the Closes #9 footer, not as its body's suffix; left as it is`])));
		// A minute on: the footer is backing off, the push and the reconciler run.
		h.advance(MIN);
		await h.run();
		const entry = h.last().split("\n");
		expect(entry[0]).toBe(`issues-drift: 2 at ${new Date(h.now()).toISOString()}`);
		expect(entry.slice(1)).toEqual([
			`github ${REPO} PR #${pr.number} ${id}: its Closes #${issue.number} footer is still pending`,
			`github wl-old: ${pr.url} still carries the Closes #9 footer, not as its body's suffix; left as it is`,
		]);
		expect(h.sidecar.state(STATE.moveDrift)).toBeNull();

		// An open workload whose link was lost (ingest already read past it): one line, a dirty link, pushed next tick.
		h.gh.fail = () => false;
		const b = h.open("second thing");
		h.config.perTick = 0;
		h.advance(MIN);
		await h.run();
		h.config.perTick = 100;
		expect(h.sidecar.link(b)).toMatchObject({ dirty: 1, issue_number: null });
		h.sidecar.immediate(() => h.sidecar.deleteLink(b));
		await h.hourly();
		expect(h.last().split("\n")).toContain(`github ${REPO} ${b}: open and has no issue`);
		expect(h.sidecar.link(b)).toMatchObject({ repo: REPO, dirty: 1, issue_number: null });
		h.advance(MIN);
		await h.run();
		expect(h.issueOf(b).title).toBe(issueTitle(b, "second thing"));
	});

	test("drift on two consecutive runs is one notice, told once until a run comes back 0; an unmapped as2 issue is reported, never closed", async () => {
		const h = setup();
		await h.pushedOne();
		const stray = h.gh.addIssue({ title: "wl-nobody0 — not ours", labels: new Set([LABEL.as2]) });
		const told = () => h.notices.filter((n) => n.startsWith("issues drift on"));
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(`github ${REPO} #${stray.number}: open, labelled as2, and its title names no workload in the ledger ("wl-nobody0 — not ours"); left open`);
		expect(told()).toEqual([]);
		await h.hourly();
		expect(told()).toHaveLength(1);
		expect(told()[0]).toMatch(/^issues drift on 2 reconciles in a row: 1 difference \(en-\S+ on wl-orchestrator\)$/);
		await h.hourly();
		expect(told()).toHaveLength(1);
		expect(h.gh.made("issue close")).toHaveLength(0);
		expect(stray.state).toBe("OPEN");

		stray.state = "CLOSED";
		await h.hourly();
		expect(h.last()).toStartWith("issues-drift: 0 at ");
		stray.state = "OPEN";
		await h.hourly();
		expect(told()).toHaveLength(1);
		await h.hourly();
		expect(told()).toHaveLength(2);
	});
});

describe("Linear", () => {
	test("Jo's state and label change on a Linear item is one line naming the team, repaired by the next push", async () => {
		const h = setup();
		h.on();
		const id = h.open("ship the app", h.linDir);
		await h.run();
		expect(h.last()).toStartWith("issues-drift: 0 at ");
		expect(h.linear.made("list")).toHaveLength(1);
		const item = h.linearOf(id);
		expect(h.linear.stateName(item)).toBe("In Progress");
		const team = h.linear.team("ENG");
		item.stateId = team.states.find((s) => s.name === "Canceled")!.id;
		item.labelIds.delete(team.labels.find((l) => l.name === LABEL.waiting)!.id);
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(`linear ENG ${item.identifier} ${id}: labels [as2] (ledger: [as2, waiting]); state Canceled (ledger: In Progress)`);
		expect(h.sidecar.link(id)).toMatchObject({ dirty: 1, force: 1 });

		h.advance(MIN);
		await h.run();
		expect(h.linear.stateName(item)).toBe("In Progress");
		expect(h.linear.labelNames(item)).toEqual([LABEL.as2, LABEL.waiting]);
		await h.hourly();
		expect(h.last()).toStartWith("issues-drift: 0 at ");
	});

	test("a Linear item deleted is one line and re-created; without a key the run is unknown", async () => {
		const h = setup();
		h.on();
		const id = h.open("ship the app", h.linDir);
		await h.run();
		const item = h.linearOf(id);
		h.linear.issues.delete(item.id);
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(`linear ENG ${item.identifier} ${id}: not found on Linear; the next push creates its issue again`);
		expect(h.sidecar.link(id)).toMatchObject({ external_id: null, issue_ref: null, dirty: 1 });
		h.advance(MIN);
		await h.run();
		expect(h.linearOf(id).id).not.toBe(item.id);

		const k = setup({ key: null });
		k.on();
		k.open("ship the app", k.linDir);
		await k.run();
		expect(k.last()).toStartWith("issues-drift: unknown (linear ENG: Linear team ENG: LINEAR_API_KEY is not set) at ");
	});
});

describe("issues.ts check", () => {
	test("prints the same drift as the reconciler and writes nothing: no entry, no sidecar change, gh reads only", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const cfg = join(tmp("rc-cfg"), "config.yml");
		writeFileSync(cfg, `issues:\n  trackers:\n    - { match: ${REPO}, kind: github }\n    - { match: "lin/*", kind: linear, team: ENG }\n  jo: jo\n`);
		const env = { AGENT_SYSTEM_LEDGER_DB: h.path, AGENT_SYSTEM_ISSUES_CONFIG: cfg, LINEAR_API_KEY: h.key ?? undefined };
		const run = async () => {
			const out: string[] = [];
			const err: string[] = [];
			const code = await check({ env, exec: h.exec, fetch: h.linear.fetch, out: (l) => out.push(l), err: (l) => err.push(l), now: h.now });
			return { code, out, err };
		};
		expect(await run()).toEqual({ code: 0, out: ["drift: 0"], err: [] });

		issue.labels.add(LABEL.question);
		const snapshot = () => JSON.stringify([h.sidecar.links(), h.sidecar.prs(), h.sidecar.db.query("SELECT * FROM state ORDER BY key").all(), h.sidecar.db.query("SELECT count(*) AS n FROM calls").get()]);
		const before = snapshot();
		const entries = h.ledger.entries(STANDING_WORKLOAD_ID).length;
		h.gh.calls.length = 0;
		const r = await run();
		expect(r).toEqual({ code: 1, out: ["drift: 1", `github ${REPO} #${issue.number} ${id}: labels [as2, question, waiting] (ledger: [as2, waiting])`], err: [] });
		expect(snapshot()).toBe(before);
		expect(h.ledger.entries(STANDING_WORKLOAD_ID)).toHaveLength(entries);
		expect(h.gh.calls.every((a) => ["issue list", "issue view", "pr list", "pr view"].includes(`${a[0]} ${a[1]}`))).toBe(true);
		expect(h.gh.calls.length).toBeGreaterThan(0);

		// The reconciler, an hour on, reports the same line.
		await h.hourly();
		expect(h.last().split("\n")[1]).toBe(r.out[1]!);
	});

	test("a bad argument, no issues block, or no sidecar exits 2", async () => {
		const bad = Bun.spawnSync(["bun", SCRIPT, "drain"], { stdout: "pipe", stderr: "pipe" });
		expect(bad.exitCode).toBe(2);
		expect(bad.stderr.toString()).toContain("usage: bun surface/scripts/issues.ts check");
		const h = setup();
		const none = join(tmp("rc-none"), "config.yml");
		writeFileSync(none, "other: 1\n");
		const err: string[] = [];
		const io = { exec: h.exec, fetch: h.linear.fetch, out: () => {}, err: (l: string) => err.push(l) };
		expect(await check({ env: { AGENT_SYSTEM_LEDGER_DB: h.path, AGENT_SYSTEM_ISSUES_CONFIG: none }, ...io })).toBe(2);
		const cfg = join(tmp("rc-cfg2"), "config.yml");
		writeFileSync(cfg, `issues:\n  trackers:\n    - { match: ${REPO}, kind: github }\n  jo: jo\n`);
		const elsewhere = join(tmp("rc-empty"), "ledger.db");
		expect(await check({ env: { AGENT_SYSTEM_LEDGER_DB: elsewhere, AGENT_SYSTEM_ISSUES_CONFIG: cfg }, ...io })).toBe(2);
		expect(err[0]).toContain("no issues: block");
		expect(err[1]).toContain("no sidecar at");
	});
});

describe("prsOfBlock", () => {
	test("reads the PR lines of the machine block only", () => {
		const body = "Jo's note\n- https://github.com/o/r/pull/9 merged\n<!-- as2:begin -->\nopen questions:\n- q-1: see /pull/3 open\nPRs:\n- https://github.com/o/r/pull/4 open\n- https://github.com/o/r/pull/5 closed\nledger seq: 3\n<!-- as2:end -->";
		expect(prsOfBlock(body)).toEqual([
			{ number: 4, url: "https://github.com/o/r/pull/4", state: "OPEN", base: "" },
			{ number: 5, url: "https://github.com/o/r/pull/5", state: "CLOSED", base: "" },
		]);
		expect(prsOfBlock("no block")).toEqual([]);
	});
});
