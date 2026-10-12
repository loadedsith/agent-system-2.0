// scratch-audit (PLAN wl-mv5oikd5jtquww § 1.7) through its command line: a temp HOME with a ledger and
// test runs, a temp tmp dir, and a temp git repo whose lanes dir holds real worktrees.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { testRequestedBody } from "../src/test-run";
import type { Report, RestoreMap } from "../scripts/scratch-audit";
import { tmp } from "./helpers";

const SCRIPT = join(import.meta.dir, "..", "scripts", "scratch-audit.ts");
const CLOSED = "wl-aaaclosed0001";
const CLOSED2 = "wl-aaaclosed0002";
const OPEN = "wl-bbbopen00001";
const UNKNOWN = "wl-zzzunknown001";
const SHA = "a".repeat(40);

const gitEnv = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t", GIT_CONFIG_NOSYSTEM: "1" };
function git(dir: string, ...args: string[]): string {
	const p = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", env: gitEnv });
	if (p.status !== 0) throw new Error(`git ${args.join(" ")}: ${p.stderr}`);
	return p.stdout;
}

/** `path` and everything under it set to time `t`, deepest first (a directory's mtime moves when a child is written). */
function age(path: string, t: Date): void {
	for (const e of readdirSync(path, { withFileTypes: true })) {
		if (e.isDirectory()) age(join(path, e.name), t);
		else utimesSync(join(path, e.name), t, t);
	}
	utimesSync(path, t, t);
}
const HOURS_AGO = (): Date => new Date(Date.now() - 3 * 3_600_000);

interface Fixture {
	root: string;
	home: string;
	tmpDir: string;
	repo: string;
	lanes: string;
	out: string;
	run: (...args: string[]) => { status: number | null; stdout: string; stderr: string };
}

function fixture(): Fixture {
	const root = realpathSync(tmp("scratch-audit"));
	const home = join(root, "home");
	const as2 = join(home, ".agent-system-2");
	mkdirSync(as2, { recursive: true });
	const ledger = Ledger.open(join(as2, "ledger.db"), { create: true, backup: false, backupOnOpen: false });
	for (const id of [CLOSED, CLOSED2, OPEN]) ledger.openWorkload({ id, by: "surface", brief: `audit fixture ${id}`, stakes: "normal", mode: "autonomous" });
	const runOf: Record<string, string> = { "tr-closedrun1": CLOSED, "tr-openrun1": OPEN };
	for (const [runId, wl] of Object.entries(runOf)) {
		const slice = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "t", doneCondition: "d", inputs: "i" });
		ledger.recordEntry({ by: "test-runner", workloadId: wl, sliceId: slice, kind: "assumption", body: testRequestedBody({ runId, pr: 7, sha: SHA, slice, by: "lane-a" }) });
		ledger.completeSlice(slice, { by: "lane-a", artifact: "x" });
	}
	ledger.closeWorkload(CLOSED, { by: "surface" });
	ledger.closeWorkload(CLOSED2, { by: "surface" });
	ledger.close();
	const runs = join(as2, "test-runs");
	for (const r of ["tr-closedrun1", "tr-openrun1", "tr-orphanrun1"]) {
		mkdirSync(join(runs, r), { recursive: true });
		writeFileSync(join(runs, r, "full.log"), "x".repeat(5000));
	}
	writeFileSync(join(runs, "runs.db"), "");

	const tmpDir = join(root, "tmp");
	for (const d of [`${CLOSED}-base`, "wl-aaac-short", "wl-alias-probe", `quorum-legs-${CLOSED}`, "pp-copy", "cc-base-1", "mig-review-x", "as2probe9", "bind-base-123", `wl-bbbo-copy`]) {
		mkdirSync(join(tmpDir, d), { recursive: true });
		writeFileSync(join(tmpDir, d, "f"), d);
	}
	for (const f of [`${OPEN}-pr.md`, `notes-${OPEN}.md`, "unrelated.txt", "wl-map.txt"]) writeFileSync(join(tmpDir, f), f);
	// Every copy and everything in it changed 3 h ago: the unattributed ones are candidates (nothing changed within 2 h),
	// and quarantine finds nothing changed since the report.
	age(tmpDir, HOURS_AGO());
	writeFileSync(join(tmpDir, "wl-live-fifo"), "x"); // unattributed and changed just now: a lane may be using it

	const repo = join(root, "as2");
	mkdirSync(repo);
	git(repo, "init", "-q", "-b", "main");
	writeFileSync(join(repo, "README"), "r\n");
	git(repo, "add", "README");
	git(repo, "commit", "-q", "-m", "init");
	const lanes = join(root, "as2-lanes");
	for (const wl of [CLOSED, OPEN, UNKNOWN]) git(repo, "worktree", "add", "-q", "-b", `wl/${wl}`, join(lanes, wl));
	writeFileSync(join(lanes, CLOSED, "uncommitted.txt"), "keep me\n");
	mkdirSync(join(lanes, CLOSED2)); // a closed workload's dir that is not a worktree of the repo
	age(lanes, HOURS_AGO());
	age(runs, HOURS_AGO());

	const out = join(root, "out");
	const env: Record<string, string | undefined> = { ...process.env, HOME: home };
	delete env.AGENT_SYSTEM_LEDGER_DB;
	delete env.AGENT_SYSTEM_TEST_RUNS;
	const run = (...args: string[]) => {
		const p = spawnSync("bun", [SCRIPT, ...args, "--home", home, "--tmp", tmpDir, "--lanes", lanes, "--repo", repo], { encoding: "utf8", env });
		return { status: p.status, stdout: p.stdout, stderr: p.stderr };
	};
	return { root, home, tmpDir, repo, lanes, out, run };
}

function report(f: Fixture): Report {
	const p = f.run("report", "--out", f.out);
	expect(p.stderr).toBe("");
	expect(p.status).toBe(0);
	return JSON.parse(readFileSync(join(f.out, "candidates.json"), "utf8")) as Report;
}

const quarantineDir = (f: Fixture): string => join(f.home, "agent-scratch", "agent-system-2.0", "quarantine");
const worktreePaths = (f: Fixture): string[] => git(f.repo, "worktree", "list", "--porcelain").split("\n").filter(l => l.startsWith("worktree ")).map(l => l.slice(9));

describe("scratch-audit report", () => {
	test("classifies tmp copies, lane worktrees and test runs by their workloads' state", () => {
		const f = fixture();
		const r = report(f);
		const by = (cls: string) => Object.fromEntries(r.items.filter(i => i.class === cls).map(i => [i.path.slice(i.path.lastIndexOf("/") + 1), i.action]));
		expect(by("tmp-wl")).toEqual({
			[`${CLOSED}-base`]: "candidate",
			"wl-aaac-short": "candidate", // prefix wl-aaac names both closed workloads
			"wl-alias-probe": "candidate", // tonight's pattern, no workload named
			"wl-bbbo-copy": "keep", // prefix of the open workload
			[`${OPEN}-pr.md`]: "keep",
			"wl-map.txt": "candidate",
			"wl-live-fifo": "keep",
		});
		expect(by("tmp-quorum-legs")).toEqual({ [`quorum-legs-${CLOSED}`]: "candidate" });
		expect(by("tmp-other")).toEqual({ "as2probe9": "candidate", "cc-base-1": "candidate", "mig-review-x": "candidate", [`notes-${OPEN}.md`]: "keep", "pp-copy": "candidate" });
		expect(by("lane-worktree")).toEqual({ [CLOSED]: "candidate", [CLOSED2]: "keep", [OPEN]: "keep", [UNKNOWN]: "keep" });
		expect(by("test-run")).toEqual({ "tr-closedrun1": "candidate", "tr-openrun1": "keep", "tr-orphanrun1": "listed" });

		const short = r.items.find(i => i.path.endsWith("/wl-aaac-short"))!;
		expect(short.workloads).toEqual([CLOSED, CLOSED2]);
		const wt = r.items.find(i => i.path === join(f.lanes, CLOSED))!;
		expect(wt).toMatchObject({ kind: "worktree", branch: `wl/${CLOSED}`, dirty: 1 });
		expect(r.items.find(i => i.path === join(f.lanes, CLOSED2))!.reason).toBe(`not a registered worktree of ${f.repo}`);
		expect(r.items.filter(i => typeof i.bytes !== "number" || (i.bytes === 0) !== (i.path === join(f.lanes, CLOSED2)))).toEqual([]); // only the empty dir sizes 0
		expect(r.candidates.map(c => c.path).sort()).toEqual(r.items.filter(i => i.action === "candidate").map(i => i.path).sort());
		expect(r.totals.candidate.count).toBe(11);
		expect(r.totals.listed.count).toBe(1);

		const md = readFileSync(join(f.out, "report.md"), "utf8");
		expect(md).toContain("| **total** | 11 |");
		expect(md).toMatch(/^Total: \d+ items, [\d.]+ MiB; candidates 11 /m);
		// read-only: nothing moved, no quarantine
		expect(existsSync(quarantineDir(f))).toBe(false);
		expect(existsSync(join(f.tmpDir, `${CLOSED}-base`))).toBe(true);
	});

	test("R3: an unattributed copy with an old top level and a nested file edited just now is kept", () => {
		const f = fixture();
		mkdirSync(join(f.tmpDir, "pp-edited", "sub"), { recursive: true });
		writeFileSync(join(f.tmpDir, "pp-edited", "sub", "g"), "first");
		age(join(f.tmpDir, "pp-edited"), HOURS_AGO());
		writeFileSync(join(f.tmpDir, "pp-edited", "sub", "g"), "edited now"); // moves g's mtime only, not its directories'
		const r = report(f);
		const item = r.items.find(i => i.path === join(f.tmpDir, "pp-edited"))!;
		expect(new Date(item.mtime).getTime()).toBeLessThan(Date.now() - 2 * 3_600_000);
		expect(item).toMatchObject({ class: "tmp-other", action: "keep", reason: "tonight's pattern, no workload named, changed within 2 h" });
	});
});

describe("scratch-audit quarantine, restore, delete", () => {
	test("quarantine and restore refuse without --yes and change nothing", () => {
		const f = fixture();
		report(f);
		const q = f.run("quarantine", join(f.out, "candidates.json"));
		expect(q.status).toBe(1);
		expect(q.stdout).toContain("nothing done: re-run with --yes");
		expect(q.stdout).toContain(`worktree move ${join(f.lanes, CLOSED)}`);
		expect(existsSync(quarantineDir(f))).toBe(false);
		expect(existsSync(join(f.lanes, CLOSED))).toBe(true);
		expect(worktreePaths(f)).toContain(join(f.lanes, CLOSED));
	});

	test("quarantine then restore puts every candidate back, the worktree registered where it was", () => {
		const f = fixture();
		const r = report(f);
		const q = f.run("quarantine", join(f.out, "candidates.json"), "--yes");
		expect(q.stderr).toBe("");
		expect(q.status).toBe(0);
		const [stamp] = readdirSync(quarantineDir(f));
		const map = JSON.parse(readFileSync(join(quarantineDir(f), stamp!, "restore.json"), "utf8")) as RestoreMap;
		expect(map.moves.length).toBe(11);
		expect(map.moves.every(m => m.moved)).toBe(true);
		for (const c of r.candidates) expect(existsSync(c.path)).toBe(false);
		for (const k of r.items.filter(i => i.action !== "candidate")) expect(existsSync(k.path)).toBe(true);
		const moved = join(quarantineDir(f), stamp!, "items", "lane-worktree", CLOSED);
		expect(worktreePaths(f)).toContain(moved);
		expect(readFileSync(join(moved, "uncommitted.txt"), "utf8")).toBe("keep me\n");

		const dry = f.run("restore", stamp!);
		expect(dry.status).toBe(1);
		expect(existsSync(join(f.lanes, CLOSED))).toBe(false);

		const back = f.run("restore", stamp!, "--yes");
		expect(back.stderr).toBe("");
		expect(back.status).toBe(0);
		for (const c of r.candidates) expect(existsSync(c.path)).toBe(true);
		expect(worktreePaths(f)).toContain(join(f.lanes, CLOSED));
		expect(worktreePaths(f)).not.toContain(moved);
		expect(readFileSync(join(f.lanes, CLOSED, "uncommitted.txt"), "utf8")).toBe("keep me\n");
		expect(readFileSync(join(f.tmpDir, `${CLOSED}-base`, "f"), "utf8")).toBe(`${CLOSED}-base`);
	});

	test("quarantine then delete removes the quarantine and prunes the worktree; delete refuses without --yes", () => {
		const f = fixture();
		const r = report(f);
		expect(f.run("quarantine", join(f.out, "candidates.json"), "--yes").status).toBe(0);
		const [stamp] = readdirSync(quarantineDir(f));
		const dir = join(quarantineDir(f), stamp!);

		const dry = f.run("delete", stamp!);
		expect(dry.status).toBe(1);
		expect(dry.stdout).toContain(`rm -rf ${dir}`);
		expect(dry.stdout).toContain(`git -C ${f.repo} worktree prune`);
		expect(existsSync(dir)).toBe(true);

		const del = f.run("delete", stamp!, "--yes");
		expect(del.stderr).toBe("");
		expect(del.status).toBe(0);
		expect(existsSync(dir)).toBe(false);
		const left = worktreePaths(f);
		expect(left.some(p => p.endsWith(`/${CLOSED}`))).toBe(false);
		expect(left).toContain(join(f.lanes, OPEN));
		for (const c of r.candidates) expect(existsSync(c.path)).toBe(false);
		for (const k of r.items.filter(i => i.action !== "candidate")) expect(existsSync(k.path)).toBe(true);
		expect(git(f.repo, "branch", "--list", `wl/${CLOSED}`).trim()).toBe(`wl/${CLOSED}`); // the branch stays
	});

	test("delete and restore refuse a stamp that is not one", () => {
		const f = fixture();
		const p = f.run("delete", "../../etc", "--yes");
		expect(p.status).toBe(2);
		expect(p.stderr).toContain("is not a quarantine stamp");
	});
});

describe("scratch-audit quarantine re-checks each candidate against the report (R4)", () => {
	test("a candidate replaced after the report is refused: the replacement stays where it is, the others move", () => {
		const f = fixture();
		const r = report(f);
		const victim = join(f.tmpDir, `${CLOSED}-base`);
		expect(r.candidates.some(c => c.path === victim)).toBe(true);
		rmSync(victim, { recursive: true });
		mkdirSync(victim);
		writeFileSync(join(victim, "replacement"), "keep");
		age(victim, HOURS_AGO()); // older than the report: only its identity tells it apart
		const q = f.run("quarantine", join(f.out, "candidates.json"), "--yes");
		expect(q.status).toBe(1);
		expect(q.stdout).toContain(`skip ${victim}: changed since the report; re-run report`);
		expect(readFileSync(join(victim, "replacement"), "utf8")).toBe("keep");
		expect(existsSync(join(f.tmpDir, "wl-alias-probe"))).toBe(false);
	});

	test("a candidate edited after the report is kept in place", () => {
		const f = fixture();
		report(f);
		const edited = join(f.tmpDir, `quorum-legs-${CLOSED}`);
		writeFileSync(join(edited, "f"), "edited after the report");
		const q = f.run("quarantine", join(f.out, "candidates.json"), "--yes");
		expect(q.status).toBe(1);
		expect(q.stdout).toContain(`skip ${edited}: changed since the report; re-run report`);
		expect(readFileSync(join(edited, "f"), "utf8")).toBe("edited after the report");
	});

	test("a candidate whose workload is open now is refused", () => {
		const f = fixture();
		const r = report(f);
		const open = r.items.find(i => i.path === join(f.tmpDir, `${OPEN}-pr.md`))!;
		r.candidates.push({ ...open, action: "candidate" });
		writeFileSync(join(f.out, "candidates.json"), JSON.stringify(r));
		const q = f.run("quarantine", join(f.out, "candidates.json"));
		expect(q.stdout).toContain(`skip ${open.path}: changed since the report; re-run report (workload ${OPEN} is open)`);
		expect(existsSync(open.path)).toBe(true);
	});

	test("a candidates.json written before dev/ino were recorded is refused as a whole", () => {
		const f = fixture();
		const r = report(f);
		const old = { ...r, version: 1, candidates: r.candidates.map(({ dev: _d, ino: _i, reportedAt: _t, ...rest }) => rest) };
		writeFileSync(join(f.out, "candidates.json"), JSON.stringify(old));
		const q = f.run("quarantine", join(f.out, "candidates.json"), "--yes");
		expect(q.status).toBe(2);
		expect(q.stderr).toContain("re-run report");
		expect(existsSync(quarantineDir(f))).toBe(false);
		expect(existsSync(join(f.tmpDir, `${CLOSED}-base`))).toBe(true);
	});
});
