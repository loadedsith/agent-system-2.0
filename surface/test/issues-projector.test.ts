// The issues projector's tick and row (PLAN wl-mv66ylim0gahog §§ 2, 3, 5, 8, § 9.2): seeding, ingest,
// the budget and the claim, backoff, pushes, the PR scan and footers, and first-merge-wins state.
// GitHub is a fake behind the exec seam (`FakeGh`); git answers `remote get-url origin` from a map.
import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger, TEST_RUNNER_BY } from "../../ledger/src/index";
import issuesRow, { issuesTickInFlight } from "../extensions/issues";
import { recordRepo } from "../src/decision-log";
import { ensureStandingWorkload } from "../src/identity";
import { type IssuesConfig, ISSUES_DEFAULTS } from "../src/issues/config";
import { closesFooter } from "../src/issues/footer";
import { backoffMs, type TickPhases, tick } from "../src/issues/projector";
import { BLOCK_BEGIN, BLOCK_END, issueTitle, LABEL, PROJECTION_LABELS, type PrState } from "../src/issues/render";
import { CLAIM_MS, INTAKE_ACCEPTED, STATE, Sidecar, sidecarPath } from "../src/issues/sidecar";
import { switchBody } from "../src/issues/switch";
import { surfaceSession } from "../src/session";
import { pushDestBody, testRequestedBody } from "../src/test-run";
import { STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import type { ExecResult } from "../src/types";
import { ctxOf, fakePi, tempLedger, timers, tmp } from "./helpers";

const REPO = "o/r";
const SHA = "a".repeat(40);
const T0 = Date.parse("2026-10-01T10:00:00.000Z");

const out = (stdout: string): ExecResult => ({ stdout, stderr: "", code: 0, killed: false });
const json = (v: unknown): ExecResult => out(JSON.stringify(v));
const arg = (args: readonly string[], name: string): string => args[args.indexOf(name) + 1] ?? "";

interface FakeIssue {
	number: number;
	title: string;
	body: string;
	labels: Set<string>;
	state: "OPEN" | "CLOSED";
	stateReason: string | null;
}
interface FakePr {
	number: number;
	url: string;
	head: string;
	base: string;
	state: PrState;
	body: string;
}

/** GitHub as the projector's gh argv see it: issues and PRs share one number space, like GitHub's. */
class FakeGh {
	next = 1;
	readonly issues = new Map<number, FakeIssue>();
	readonly prs = new Map<number, FakePr>();
	readonly labels = new Set<string>(PROJECTION_LABELS);
	/** Every gh argv, in order (git calls are not here). */
	readonly calls: string[][] = [];
	fail: (args: readonly string[]) => boolean = () => false;
	/** Runs before a gh call is answered. */
	onCall: ((args: readonly string[]) => void) | null = null;
	/** Runs before a git call is answered. */
	onGit: (() => void) | null = null;
	remaining = 5000;
	readonly origins = new Map<string, string>();
	/** Extra open PRs in the scan (to reach its limit). */
	scanPad = 0;
	/** Extra rows in a branch's `--state all` list (to reach its limit). */
	readonly branchPad = new Map<string, number>();

	addIssue(o: Partial<FakeIssue> & { title: string }): FakeIssue {
		const issue: FakeIssue = { number: this.next++, body: "", labels: new Set(), state: "OPEN", stateReason: null, ...o };
		this.issues.set(issue.number, issue);
		return issue;
	}

	addPr(head: string, o: { base?: string; state?: PrState; body?: string } = {}): FakePr {
		const n = this.next++;
		const pr: FakePr = { number: n, url: `https://github.com/${REPO}/pull/${n}`, head, base: o.base ?? "main", state: o.state ?? "OPEN", body: o.body ?? "lane body" };
		this.prs.set(n, pr);
		return pr;
	}

	/** The gh calls whose first two words are `verb`. */
	made(verb: string): string[][] {
		return this.calls.filter((a) => `${a[0]} ${a[1]}` === verb);
	}

	readonly exec = async (command: string, args: string[]): Promise<ExecResult> => {
		if (command === "git") {
			this.onGit?.();
			const url = this.origins.get(args[1] ?? "");
			return url === undefined ? { stdout: "", stderr: "error: No such remote 'origin'", code: 2, killed: false } : out(`${url}\n`);
		}
		this.calls.push(args);
		this.onCall?.(args);
		if (this.fail(args)) return { stdout: "", stderr: "HTTP 502: Bad Gateway", code: 1, killed: false };
		return this.answer(args);
	};

	private prByRef(ref: string): FakePr | undefined {
		return [...this.prs.values()].find((p) => p.url === ref || String(p.number) === ref);
	}

	private answer(a: readonly string[]): ExecResult {
		const verb = `${a[0]} ${a[1]}`;
		switch (verb) {
			case "api rate_limit":
				return out(`${this.remaining}\n`);
			case "repo view":
				return json({ defaultBranchRef: { name: "main" } });
			case "label list":
				return json([...this.labels].map((name) => ({ name })));
			case "label create":
				this.labels.add(a[2]!);
				return out("");
			case "pr list": {
				if (arg(a, "--state") === "open") {
					const open = [...this.prs.values()].filter((p) => p.state === "OPEN");
					const rows = open.map((p) => ({ number: p.number, url: p.url, headRefName: p.head, baseRefName: p.base, isCrossRepository: false, body: p.body }));
					for (let i = 0; i < this.scanPad; i++) rows.push({ number: 90_000 + i, url: `https://github.com/${REPO}/pull/${90_000 + i}`, headRefName: `pad-${i}`, baseRefName: "main", isCrossRepository: false, body: "" });
					return json(rows.slice(0, Number(arg(a, "-L"))));
				}
				const head = arg(a, "--head");
				const rows = [...this.prs.values()].filter((p) => p.head === head).map((p) => ({ number: p.number, state: p.state, url: p.url, baseRefName: p.base }));
				for (let i = 0; i < (this.branchPad.get(head) ?? 0); i++) rows.push({ number: 80_000 + i, state: "CLOSED", url: `https://github.com/${REPO}/pull/${80_000 + i}`, baseRefName: "main" });
				return json(rows.slice(0, Number(arg(a, "-L"))));
			}
			case "pr view": {
				const pr = this.prByRef(a[2]!);
				if (!pr) return { stdout: "", stderr: "no pull requests found", code: 1, killed: false };
				return arg(a, "--json") === "body" ? json({ body: pr.body }) : json({ number: pr.number, state: pr.state, url: pr.url, baseRefName: pr.base });
			}
			case "pr edit":
				this.prByRef(a[2]!)!.body = arg(a, "--body");
				return out(a[2]!);
			case "issue list": {
				const quoted = /^"(.*)" in:title$/.exec(arg(a, "--search"))?.[1] ?? "";
				const rows = [...this.issues.values()].filter((i) => i.labels.has(arg(a, "--label")) && i.title.includes(quoted)).map((i) => ({ number: i.number, title: i.title }));
				return json(rows);
			}
			case "issue create": {
				const labels = new Set<string>();
				a.forEach((x, i) => {
					if (x === "--label") labels.add(a[i + 1]!);
				});
				const issue = this.addIssue({ title: arg(a, "--title"), body: arg(a, "--body"), labels });
				return out(`https://github.com/${REPO}/issues/${issue.number}\n`);
			}
			case "issue view": {
				const i = this.issues.get(Number(a[2]))!;
				return json({ title: i.title, body: i.body, labels: [...i.labels].map((name) => ({ name })), state: i.state, stateReason: i.stateReason });
			}
			case "issue edit": {
				const i = this.issues.get(Number(a[2]))!;
				if (a.includes("--title")) i.title = arg(a, "--title");
				if (a.includes("--body")) i.body = arg(a, "--body");
				if (a.includes("--add-label")) for (const l of arg(a, "--add-label").split(",")) i.labels.add(l);
				if (a.includes("--remove-label")) for (const l of arg(a, "--remove-label").split(",")) i.labels.delete(l);
				return out(`https://github.com/${REPO}/issues/${i.number}\n`);
			}
			case "issue reopen": {
				const i = this.issues.get(Number(a[2]))!;
				i.state = "OPEN";
				i.stateReason = "REOPENED";
				return out("");
			}
			case "issue close": {
				const i = this.issues.get(Number(a[2]))!;
				i.state = "CLOSED";
				i.stateReason = arg(a, "-r") === "not planned" ? "NOT_PLANNED" : "COMPLETED";
				return out("");
			}
			default:
				return { stdout: "", stderr: `fake gh: unknown ${a.join(" ")}`, code: 1, killed: false };
		}
	}
}

/** A temp ledger on a moving clock, a temp sidecar beside it, the fake GitHub, and the tick with its options. */
function setup(over: Partial<IssuesConfig> = {}) {
	let t = T0;
	const { ledger, path } = tempLedger(() => new Date(t).toISOString());
	const sidecar = Sidecar.open(sidecarPath({ AGENT_SYSTEM_LEDGER_DB: path }));
	const gh = new FakeGh();
	const repoDir = tmp("checkout");
	const otherDir = tmp("other-checkout");
	gh.origins.set(repoDir, `https://github.com/${REPO}.git`);
	gh.origins.set(otherDir, "git@github.com:x/other.git");
	const config: IssuesConfig = { repo: REPO, jo: "jo", ...ISSUES_DEFAULTS, perTick: 100, perHour: 10_000, ...over };
	const notices: string[] = [];
	let switches = 0;
	const sw = (on: boolean): string => {
		ensureStandingWorkload(ledger);
		t += 1_000;
		return ledger.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: switchBody(on, `in-sw${++switches}`) });
	};
	const h = {
		ledger,
		sidecar,
		gh,
		repoDir,
		otherDir,
		config,
		notices,
		now: () => t,
		advance: (ms: number) => {
			t += ms;
		},
		run: (o: { holder?: string; phases?: TickPhases } = {}) =>
			tick({ exec: gh.exec, ledger, sidecar, config, holder: o.holder ?? "h1", now: () => t, notice: (l) => notices.push(l), ...(o.phases ? { phases: o.phases } : {}) }),
		/** Open a workload whose `repo:` entry names `repo` (null: none). */
		open: (brief = "build the thing", repo: string | null = repoDir): string => {
			t += 1_000;
			const id = ledger.openWorkload({ by: SURFACE_BY, brief, stakes: "normal", mode: "autonomous" });
			if (repo !== null) recordRepo(ledger, id, repo);
			return id;
		},
		close: (id: string): void => {
			t += 1_000;
			ledger.closeWorkload(id, { by: SURFACE_BY });
		},
		slice: (id: string): string => {
			t += 1_000;
			return ledger.addSlice({ by: SURFACE_BY, workloadId: id, task: "t", doneCondition: "d", inputs: "i" });
		},
		on: () => sw(true),
		off: () => sw(false),
		issueOf: (id: string): FakeIssue | undefined => {
			const n = sidecar.link(id)?.issue_number;
			return n === null || n === undefined ? undefined : gh.issues.get(n);
		},
		/** On, one workload on the repo, its issue pushed; the calls so far cleared. */
		pushedOne: async (brief = "build the thing"): Promise<{ id: string; issue: FakeIssue }> => {
			h.on();
			const id = h.open(brief);
			await h.run();
			const issue = h.issueOf(id);
			if (!issue) throw new Error(`no issue for ${id}: ${notices.join("; ")}`);
			gh.calls.length = 0;
			return { id, issue };
		},
	};
	return h;
}

describe("seeding and ingest", () => {
	test("seeding links only the open workloads on the configured repo; the rest are cached as elsewhere or retired", async () => {
		const h = setup();
		const a = h.open("on the repo");
		const b = h.open("on another repo", h.otherDir);
		const c = h.open("closed before on");
		h.close(c);
		const d = h.open("no repo entry", null);
		h.on();
		const r = await h.run();
		expect(r).toMatchObject({ claimed: true, on: true, seeded: true, stopped: null });
		expect(h.gh.issues.size).toBe(1);
		expect(h.issueOf(a)?.title).toBe(issueTitle(a, "on the repo"));
		expect(h.sidecar.link(b)).toMatchObject({ repo: "x/other", dirty: 0, issue_number: null });
		expect(h.sidecar.link(c)).toBeNull();
		expect(h.sidecar.link(d)).toMatchObject({ repo: "-", dirty: 0 });
		expect(h.gh.made("issue create")).toHaveLength(1);
	});

	test("off makes no gh call, and seeding survives off ticks before the first on", async () => {
		const h = setup();
		const a = h.open();
		for (let i = 0; i < 3; i++) {
			const r = await h.run();
			expect(r).toMatchObject({ claimed: true, on: false, seeded: false, calls: 0 });
		}
		expect(h.gh.calls).toHaveLength(0);
		expect(h.sidecar.state(STATE.seededAt)).toBeNull();
		expect(h.sidecar.cursor()).not.toBeNull();
		h.off();
		await h.run();
		expect(h.gh.calls).toHaveLength(0);
		h.on();
		const r = await h.run();
		expect(r.seeded).toBe(true);
		expect(h.issueOf(a)).toBeDefined();
	});

	test("a workload opened between the seeding snapshot and the sidecar write is ingested in the same tick", async () => {
		const h = setup();
		const a = h.open("before the snapshot");
		h.on();
		let b = "";
		h.gh.onGit = () => {
			h.gh.onGit = null;
			b = h.open("inside the seeding window");
		};
		await h.run();
		expect(b).not.toBe("");
		expect(h.issueOf(a)).toBeDefined();
		expect(h.issueOf(b)?.title).toBe(issueTitle(b, "inside the seeding window"));
	});

	test("intake_since is the on entry's created_at, not the seeding tick's clock", async () => {
		const h = setup();
		h.on();
		const onAt = new Date(h.now()).toISOString();
		h.advance(10 * 60_000);
		await h.run();
		expect(h.sidecar.state(STATE.intakeSince)).toBe(onAt);
		expect(h.sidecar.state(STATE.seededAt)).toBe(new Date(h.now()).toISOString());
	});

	test("a lease-only renewal marks nothing; a holder change does", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		h.ledger.claimWorkload(id, { by: "lane-x-1", holder: "lane-x-1", leaseMs: 60_000 });
		await h.run();
		expect([...issue.labels].sort()).toEqual([LABEL.as2, LABEL.running]);
		h.gh.calls.length = 0;
		h.advance(5_000);
		h.ledger.claimWorkload(id, { by: "lane-x-1", holder: "lane-x-1", leaseMs: 60_000 });
		const r = await h.run();
		expect(r.ingested).toBe(0);
		expect(h.sidecar.link(id)?.dirty).toBe(0);
		expect(h.gh.calls.map((a) => `${a[0]} ${a[1]}`)).toEqual(["pr list"]);
	});

	test("off, a workload opens, on: its issue is created; one opened and closed while off gets none", async () => {
		const h = setup();
		h.on();
		await h.run();
		h.off();
		const a = h.open("opened while off");
		const b = h.open("opened and closed while off");
		h.close(b);
		await h.run();
		expect(h.gh.made("issue create")).toHaveLength(0);
		h.on();
		await h.run();
		expect(h.issueOf(a)?.title).toBe(issueTitle(a, "opened while off"));
		expect(h.sidecar.link(b)).toBeNull();
		expect(h.gh.made("issue create")).toHaveLength(1);
	});
});

describe("the budget and the claim", () => {
	test("perTick stops the tick at the cap, counting rate_limit and the scan; later ticks finish the work", async () => {
		const h = setup({ perTick: 20 });
		h.on();
		const ids = Array.from({ length: 10 }, (_, i) => h.open(`workload ${i}`));
		const r = await h.run();
		expect(r).toMatchObject({ stopped: "budget", calls: 20 });
		expect(h.gh.calls).toHaveLength(20);
		expect(h.gh.calls[0]).toEqual(["api", "rate_limit", "--jq", ".resources.core.remaining"]);
		expect(h.gh.made("pr list").some((a) => arg(a, "--state") === "open")).toBe(true);
		expect(h.sidecar.callsInHour(h.now())).toBe(20);
		for (let i = 0; i < 5; i++) await h.run();
		for (const id of ids) expect(h.issueOf(id)).toBeDefined();
		expect(h.gh.made("issue create")).toHaveLength(10);
	});

	test("perHour stops every tick once the hour's calls are spent, until the hour rolls", async () => {
		const h = setup({ perTick: 20, perHour: 25 });
		h.on();
		for (let i = 0; i < 10; i++) h.open(`workload ${i}`);
		expect((await h.run()).calls).toBe(20);
		expect(await h.run()).toMatchObject({ stopped: "budget", calls: 5 });
		expect(await h.run()).toMatchObject({ stopped: "budget", calls: 0 });
		expect(h.gh.calls).toHaveLength(25);
		h.advance(60 * 60_000 + 1);
		const r = await h.run();
		expect(r.calls).toBeGreaterThan(0);
	});

	test("a second holder makes no call while the claim is live; after its expiry the tick takes it over", async () => {
		const h = setup();
		h.on();
		const a = h.open();
		expect(h.sidecar.claim("h2", h.now())).toBe(true);
		expect(await h.run()).toMatchObject({ claimed: false, calls: 0 });
		expect(h.gh.calls).toHaveLength(0);
		h.advance(CLAIM_MS + 1);
		expect((await h.run()).claimed).toBe(true);
		expect(h.issueOf(a)).toBeDefined();
	});

	test("a claim lost mid-tick (clock-injected expiry) stops the tick; the new holder adopts the created issue, no duplicate", async () => {
		const h = setup();
		h.on();
		const a = h.open("first");
		const b = h.open("second");
		h.gh.onCall = (args) => {
			if (`${args[0]} ${args[1]}` !== "issue create") return;
			h.gh.onCall = null;
			h.advance(CLAIM_MS + 1);
			expect(h.sidecar.claim("h2", h.now())).toBe(true);
		};
		const r = await h.run({ holder: "h1" });
		expect(r.stopped).toBe("lost");
		expect(h.gh.issues.size).toBe(1);
		expect(h.sidecar.link(a)?.issue_number).toBeNull();
		expect(await h.run({ holder: "h1" })).toMatchObject({ claimed: false });
		const r2 = await h.run({ holder: "h2" });
		expect(r2.stopped).toBeNull();
		expect(h.gh.issues.size).toBe(2);
		expect(h.issueOf(a)?.title).toBe(issueTitle(a, "first"));
		expect(h.issueOf(b)?.title).toBe(issueTitle(b, "second"));
		expect(h.gh.made("issue create")).toHaveLength(2);
	});

	test("the projection's labels are created once", async () => {
		const h = setup();
		h.gh.labels.clear();
		h.gh.labels.add("as2");
		h.on();
		await h.run();
		expect(h.gh.made("label create").map((a) => a[2])).toEqual(PROJECTION_LABELS.filter((l) => l !== "as2"));
		await h.run();
		expect(h.gh.made("label list")).toHaveLength(1);
		expect(h.gh.made("label create")).toHaveLength(PROJECTION_LABELS.length - 1);
	});

	test("under the rate floor the scan, footers and pushes pause; the hourly read is made once an hour", async () => {
		const h = setup();
		h.gh.remaining = 100;
		h.on();
		const a = h.open();
		await h.run();
		expect(h.issueOf(a)).toBeUndefined();
		expect(h.gh.made("pr list")).toHaveLength(0);
		expect(h.notices.some((n) => n.includes("rate limit low"))).toBe(true);
		h.gh.remaining = 5000;
		await h.run();
		expect(h.gh.made("api rate_limit")).toHaveLength(1);
		h.advance(60 * 60_000);
		await h.run();
		expect(h.gh.made("api rate_limit")).toHaveLength(2);
		expect(h.issueOf(a)).toBeDefined();
	});
});

describe("failures and backoff", () => {
	test("a failed create backs the link off without a throw, retries after the backoff, and parks at parkAfterFails", async () => {
		const h = setup({ parkAfterFails: 2 });
		h.gh.fail = (a) => `${a[0]} ${a[1]}` === "issue create";
		h.on();
		const a = h.open();
		const r = await h.run();
		expect(r.stopped).toBe("failed");
		expect(h.sidecar.link(a)).toMatchObject({ fails: 1, dirty: 1, next_try_at: h.now() + backoffMs(1) });
		expect(h.notices.some((n) => n.includes("HTTP 502"))).toBe(true);
		h.gh.calls.length = 0;
		expect((await h.run()).stopped).toBeNull();
		expect(h.gh.made("issue create")).toHaveLength(0);
		h.advance(backoffMs(1));
		await h.run();
		expect(h.gh.made("issue create")).toHaveLength(1);
		expect(h.sidecar.link(a)?.fails).toBe(2);
		expect(h.notices.some((n) => n.includes("parked after 2 failed pushes"))).toBe(true);
		h.gh.fail = () => false;
		h.advance(2 * 60 * 60_000);
		await h.run();
		expect(h.issueOf(a)).toBeUndefined();
	});

	test("a lost create is recovered by its title; Jo's text outside the block is kept on every push", async () => {
		const h = setup();
		h.on();
		const a = h.open("recover me");
		const lost = h.gh.addIssue({ title: issueTitle(a, "recover me"), body: "Jo's words", labels: new Set([LABEL.as2]) });
		await h.run();
		expect(h.gh.made("issue create")).toHaveLength(0);
		expect(h.sidecar.link(a)?.issue_number).toBe(lost.number);
		expect(lost.body.startsWith(BLOCK_BEGIN)).toBe(true);
		expect(lost.body.endsWith("\n\nJo's words")).toBe(true);
		expect([...lost.labels].sort()).toEqual([LABEL.as2, LABEL.waiting]);
		const block = lost.body.slice(0, lost.body.indexOf(BLOCK_END) + BLOCK_END.length);
		lost.body = `Jo above\n\n${block}\n\nJo below`;
		h.slice(a);
		await h.run();
		expect(lost.body.startsWith("Jo above\n\n<!-- as2:begin -->")).toBe(true);
		expect(lost.body.endsWith("<!-- as2:end -->\n\nJo below")).toBe(true);
		expect(lost.body).toContain("slices: 1 open");
	});

	test("a closed issue whose stateReason drifted is repaired by reopen then close with the rendered reason", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		h.close(id);
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		issue.stateReason = "NOT_PLANNED";
		h.sidecar.db.query("UPDATE links SET force = 1, dirty = 1 WHERE workload_id = ?").run(id);
		h.gh.calls.length = 0;
		await h.run();
		expect(h.gh.calls.filter((a) => a[0] === "issue" && (a[1] === "reopen" || a[1] === "close")).map((a) => a[1])).toEqual(["reopen", "close"]);
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
	});

	test("a full branch list makes the PR set unknown: no render change, backed off", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const body = issue.body;
		h.gh.branchPad.set(`wl/${id}`, 1000);
		h.slice(id);
		const r = await h.run();
		expect(r.stopped).toBe("failed");
		expect(h.gh.made("issue view")).toHaveLength(0);
		expect(h.gh.made("issue edit")).toHaveLength(0);
		expect(issue.body).toBe(body);
		expect(h.sidecar.link(id)).toMatchObject({ dirty: 1, fails: 1 });
		expect(h.notices.some((n) => n.includes("PR set unknown"))).toBe(true);
	});
});

describe("the PR scan and footers", () => {
	test("a lane PR opened after the push gets its footer on the next scan, with no ledger change", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const pr = h.gh.addPr(`wl/${id}`);
		await h.run();
		expect(pr.body).toBe(`lane body${closesFooter(issue.number)}`);
		expect(issue.body).toContain(`- ${pr.url} open`);
		h.gh.calls.length = 0;
		await h.run();
		await h.run();
		expect(h.gh.made("pr edit")).toHaveLength(0);
	});

	test("a push-dest PR, a lane PR and a test-requested PR each get one footer; a footed PR is never edited again", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		h.ledger.claimWorkload(id, { by: "lane-x-1", holder: "lane-x-1", leaseMs: null });
		h.ledger.recordEntry({ by: "lane-x-1", workloadId: id, kind: "assumption", body: pushDestBody({ remote: "origin", branch: "feature/side", sha: SHA }) });
		const lane = h.gh.addPr(`wl/${id}`);
		const side = h.gh.addPr("feature/side");
		const asked = h.gh.addPr("jo/hand-made");
		h.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: id, kind: "assumption", body: testRequestedBody({ runId: "tr-abc1234", pr: asked.number, sha: SHA, slice: "sl-x", by: "lane-x-1" }) });
		await h.run();
		const footer = closesFooter(issue.number);
		for (const pr of [lane, side, asked]) expect(pr.body).toBe(`lane body${footer}`);
		expect(h.gh.made("pr edit")).toHaveLength(3);
		lane.body = "Jo removed the footer";
		h.slice(id);
		await h.run();
		await h.run();
		expect(h.gh.made("pr edit")).toHaveLength(3);
		expect(lane.body).toBe("Jo removed the footer");
	});

	test("a non-default-base PR gets no footer; its merge closes the closed workload's issue within one tick", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const pr = h.gh.addPr(`wl/${id}`, { base: "develop" });
		await h.run();
		expect(h.sidecar.prs()).toMatchObject([{ number: pr.number, footer: "none" }]);
		expect(h.gh.made("pr edit")).toHaveLength(0);
		h.close(id);
		await h.run();
		expect(issue.state).toBe("OPEN");
		expect(issue.labels.has(LABEL.awaitingMerge)).toBe(true);
		pr.state = "MERGED";
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		expect(issue.labels.has(LABEL.awaitingMerge)).toBe(false);
		expect(h.gh.made("pr edit")).toHaveLength(0);
	});

	test("a PR merged before any scan saw it closes the issue from MERGED", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		h.gh.addPr(`wl/${id}`, { state: "MERGED" });
		h.close(id);
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
	});

	test("a scan of 200 open PRs marks nothing", async () => {
		const h = setup();
		const { id } = await h.pushedOne();
		h.gh.scanPad = 200;
		const pr = h.gh.addPr(`wl/${id}`);
		const r = await h.run();
		expect(r.stopped).toBeNull();
		expect(h.sidecar.prs()).toHaveLength(0);
		expect(h.sidecar.link(id)?.dirty).toBe(0);
		expect(pr.body).toBe("lane body");
		expect(h.notices.some((n) => n.includes("nothing was marked"))).toBe(true);
	});

	test("a test-requested PR outside every branch list is fetched by number, footed, and its merge closes the closed workload's issue within one tick", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const pr = h.gh.addPr("jo/elsewhere");
		h.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: id, kind: "assumption", body: testRequestedBody({ runId: "tr-def5678", pr: pr.number, sha: SHA, slice: "sl-x", by: "lane-x-1" }) });
		await h.run();
		expect(pr.body).toBe(`lane body${closesFooter(issue.number)}`);
		expect(h.gh.made("pr view").some((a) => a[2] === String(pr.number))).toBe(true);
		h.close(id);
		await h.run();
		expect(issue.state).toBe("OPEN");
		expect(issue.labels.has(LABEL.awaitingMerge)).toBe(true);
		pr.state = "MERGED";
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
	});
});

describe("first merge wins", () => {
	test("A merged + B open on a closed workload: closed completed, not reopened by the next scan, and B closing later changes nothing", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const a = h.gh.addPr(`wl/${id}`);
		const b = h.gh.addPr(`wl/${id}`);
		await h.run();
		a.state = "MERGED";
		h.close(id);
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		h.gh.calls.length = 0;
		await h.run();
		b.state = "CLOSED";
		await h.run();
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		expect(h.gh.calls.filter((x) => x[0] === "issue" && (x[1] === "reopen" || x[1] === "close"))).toHaveLength(0);
		expect(issue.labels.has(LABEL.unmerged)).toBe(false);
	});

	test("A closed unmerged + B open: open awaiting-merge; both closed unmerged: closed not planned and unmerged", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const a = h.gh.addPr(`wl/${id}`);
		const b = h.gh.addPr(`wl/${id}`);
		await h.run();
		a.state = "CLOSED";
		h.close(id);
		await h.run();
		expect(issue.state).toBe("OPEN");
		expect([...issue.labels].sort()).toEqual([LABEL.as2, LABEL.awaitingMerge]);
		b.state = "CLOSED";
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "NOT_PLANNED" });
		expect([...issue.labels].sort()).toEqual([LABEL.as2, LABEL.unmerged]);
	});

	test("the lane PR merged, then the decision-log PR opened: closed completed at the ledger close", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		const lane = h.gh.addPr(`wl/${id}`);
		await h.run();
		lane.state = "MERGED";
		await h.run();
		expect(issue.state).toBe("OPEN");
		h.close(id);
		const log = h.gh.addPr(`wl/${id}`, { body: "decision log" });
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
		expect(issue.body).toContain(`- ${log.url} open`);
	});

	test("a merged PR beyond the first 30 of its branch still counts", async () => {
		const h = setup();
		const { id, issue } = await h.pushedOne();
		for (let i = 0; i < 40; i++) h.gh.addPr(`wl/${id}`, { state: i === 34 ? "MERGED" : "CLOSED" });
		h.close(id);
		await h.run();
		expect(issue).toMatchObject({ state: "CLOSED", stateReason: "COMPLETED" });
	});
});

describe("intake binding and phases", () => {
	test("an accepted intake issue whose input id the brief quotes is adopted: no create, retitled, intake label gone, Jo's text kept", async () => {
		const h = setup();
		const jo = h.gh.addIssue({ title: "Please add a dark mode", body: "Jo's ask", labels: new Set([LABEL.intake]) });
		h.sidecar.db
			.query("INSERT INTO intake (issue_number, verdict, reason, in_id, acked, seen_at) VALUES (?, ?, ?, ?, 1, ?)")
			.run(jo.number, INTAKE_ACCEPTED, null, "in-jo1", new Date(h.now()).toISOString());
		h.on();
		const id = h.open("Add a dark mode (from in-jo1)");
		await h.run();
		expect(h.gh.made("issue create")).toHaveLength(0);
		expect(h.gh.made("issue list")).toHaveLength(0);
		expect(h.sidecar.link(id)?.issue_number).toBe(jo.number);
		expect(jo.title).toBe(issueTitle(id, "Add a dark mode (from in-jo1)"));
		expect([...jo.labels].sort()).toEqual([LABEL.as2, LABEL.waiting]);
		expect(jo.body.endsWith("\n\nJo's ask")).toBe(true);
	});

	test("phases run after the push while on, reconcile first, in the tick's budget; a phase's throw is one notice", async () => {
		const h = setup();
		const order: string[] = [];
		const phases: TickPhases = {
			reconcile: async (ctx) => {
				order.push(`reconcile:${ctx.defaultBranch}:${ctx.rateLow}`);
				const r = await ctx.gh.run(["api", "rate_limit", "--jq", ".resources.core.remaining"]);
				expect(r.ok).toBe(true);
			},
			intake: async () => {
				order.push("intake");
				throw new Error("boom");
			},
		};
		await h.run({ phases });
		expect(order).toEqual([]);
		h.on();
		const r = await h.run({ phases });
		expect(order).toEqual(["reconcile:main:false", "intake"]);
		expect(r.calls).toBe(h.gh.calls.length);
		expect(h.gh.made("api rate_limit")).toHaveLength(2);
		expect(h.notices).toContain("the intake phase failed: boom");
	});
});

describe("the issues row", () => {
	afterEach(() => {
		timers.length = 0;
	});

	function rowEnv(config: string) {
		const ledgerPath = join(tmp("row-ledger"), "ledger.db");
		Ledger.open(ledgerPath, { create: true, backup: false, backupOnOpen: false }).close();
		const configPath = join(tmp("row-config"), "config.yml");
		writeFileSync(configPath, config);
		return {
			AGENT_SYSTEM_ROLE: "orchestrator",
			AGENT_SYSTEM_LEDGER_DB: ledgerPath,
			AGENT_SYSTEM_ISSUES_CONFIG: configPath,
			AGENT_SYSTEM_SURFACE_POLL_MS: "1234",
			HOME: "/nonexistent-home",
		};
	}

	test("a session that is not the surface registers nothing", async () => {
		const e = { ...rowEnv("issues:\n  repo: o/r\n  jo: jo\n"), AGENT_SYSTEM_ROLE: "lane" };
		const f = fakePi(undefined, { exec: true });
		issuesRow(f.pi, e);
		timers.length = 0;
		await f.emit("session_start", { type: "session_start" }, ctxOf());
		expect(timers).toHaveLength(0);
	});

	test("the surface registers one interval at the poll cadence; a tick runs fire-and-forget, one at a time", async () => {
		const e = rowEnv(`issues:\n  repo: ${REPO}\n  jo: jo\n`);
		const ledger = Ledger.open(e.AGENT_SYSTEM_LEDGER_DB, { backup: false, backupOnOpen: false });
		ensureStandingWorkload(ledger);
		ledger.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: switchBody(true, "in-on1") });
		ledger.close();
		const f = fakePi(undefined, { exec: true });
		f.execs.answer = (_c, args) => {
			if (args[0] === "api") return out("5000\n");
			if (args[0] === "repo") return json({ defaultBranchRef: { name: "main" } });
			if (args[0] === "label") return json(PROJECTION_LABELS.map((name) => ({ name })));
			return json([]);
		};
		issuesRow(f.pi, e);
		timers.length = 0;
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		expect(timers).toEqual([{ fn: expect.any(Function), ms: 1234 }]);
		const s = surfaceSession(ctx, e);
		timers[0]!.fn();
		const first = issuesTickInFlight(s);
		timers[0]!.fn();
		expect(issuesTickInFlight(s)).toBe(first);
		await first;
		expect(f.execs.calls.map((c) => `${c.command} ${c.args[0]} ${c.args[1]}`)).toEqual(["gh api rate_limit", "gh repo view", "gh label list", "gh pr list"]);
		timers[0]!.fn();
		await issuesTickInFlight(s);
		expect(f.execs.calls).toHaveLength(5);
		expect(s.tickNotices).toEqual([]);
		await f.emit("session_shutdown", { type: "session_shutdown" }, ctx);
	});

	test("no issues: block makes no call; a malformed block is one notice however many ticks see it", async () => {
		const e = rowEnv("other: 1\n");
		const f = fakePi(undefined, { exec: true });
		issuesRow(f.pi, e);
		timers.length = 0;
		const ctx = ctxOf();
		await f.emit("session_start", { type: "session_start" }, ctx);
		const s = surfaceSession(ctx, e);
		timers[0]!.fn();
		await issuesTickInFlight(s);
		expect(f.execs.calls).toHaveLength(0);
		writeFileSync(e.AGENT_SYSTEM_ISSUES_CONFIG, "issues:\n  repo: not a repo\n");
		for (let i = 0; i < 2; i++) {
			timers[0]!.fn();
			await issuesTickInFlight(s);
		}
		expect(f.execs.calls).toHaveLength(0);
		expect(s.tickNotices).toHaveLength(1);
		expect(s.tickNotices[0]).toStartWith("tick: issues: the issues: block of the profile config does not parse:");
	});
});
