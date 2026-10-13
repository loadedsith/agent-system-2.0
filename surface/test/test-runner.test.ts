// The outside-the-fence test runner as the processes it really is (MIGRATION.md item 24; plan of
// wl-muraerdsgw7gn4, § 2.2 to § 2.4 and § 6 row S2): surface/scripts/test-runner.ts `start` and `run`
// on a temp ledger, a temp runs root and a temp as2test root. GitHub is a local bare repo with
// refs/pull/<N>/head (the origin-URL override) plus a fake `gh` that logs its argv; `_as2test` is the
// S4b wrapper rendered with `sweepScope: groups` behind a fake `sudo` that drops `-n -u _as2test` and
// runs it as the current user. The install the preflight checks is a temp copy whose owners are this
// user. A fake sudo cannot deny the current user its own files, so it forwards `probe` to the real
// wrapper and reports every answer closed (the real denial is proved at S8, plan § 8). Boundaries
// are paused through the runner's AGENT_SYSTEM_TEST_HOOKS files and the wrapper's rendered `hooks`.
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger, LiveLedgerUnderTestError, TEST_RUNNER_BY } from "../../ledger/src/index";
import { renderExecWrapper } from "../src/as2test";
import { recordRepo } from "../src/decision-log";
import {
	childLayout, makeRunId, parseHeartbeat, parseTestRun, partResult, pushDestBody, runnerDiedRun, type TestRun, testRequestedBody, testRunBody, testRuns, workDirOf,
	WRAPPER_EXIT, type WrapperCall, wrapperArgv,
} from "../src/test-run";
import { ORCHESTRATOR_RECIPIENT, SURFACE_BY } from "../src/types";
import { importPart, importReport, lockRow, openLockDb, publishIfOwner, START_EXIT } from "../scripts/test-runner";
import { alive, tmp, until } from "./helpers";

setDefaultTimeout(180_000);

const RUNNER = join(import.meta.dir, "..", "scripts", "test-runner.ts");
const TEST_EXEC = join(import.meta.dir, "..", "scripts", "test-exec.ts");
const OWNER_REPO = "thewolff/agent-system-2.0";
const LANE = "lane-runnertest-1";

const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

const GIT_ENV: Record<string, string> = {
	PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0",
	GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
};
function g(cwd: string, ...args: string[]): string {
	const r = Bun.spawnSync(["git", ...args], { cwd, env: GIT_ENV, stdout: "pipe", stderr: "pipe" });
	if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} in ${cwd}: ${r.stderr.toString()}`);
	return r.stdout.toString().trim();
}
const sha256 = (p: string): string => createHash("sha256").update(readFileSync(p)).digest("hex");

// ---- the fixture repository: main plus one PR per scenario -------------------------------------------

const PASS = (name: string) => `import { expect, test } from "bun:test";\ntest(${JSON.stringify(name)}, () => { expect(1 + 1).toBe(2); });\n`;
const RED = `import { test } from "bun:test";
for (let i = 1; i <= 25; i++) {
	const n = String(i).padStart(2, "0");
	test(\`case \${n}\`, () => { throw new Error(\`failure \${n}: \${"detail ".repeat(30)}end \${n}\`); });
}
test("passes", () => {});
`;
// Passes in the full suite and fails when run alone by its exact path, through state it leaks into the clone:
// the solo-only failure (plan § 4, PR #16's takeover test). The suite runs it first; its solo run finds the leftover.
const SOLO_ONLY = `import { test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
test("needs a clean clone", () => {
	if (existsSync(".leaked-state")) throw new Error("state leaked by an earlier run is still here");
	writeFileSync(".leaked-state", "1");
});
`;
// The child's env, a descendant that rebuilds its env as {HOME, PATH}, and a child left behind for the sweep.
const ENV_DUMP = `import { test } from "bun:test";
import { writeFileSync } from "node:fs";
test("dumps its env", () => {
	const d = Bun.spawnSync(["/bin/sh", "-c", "command -v git"], { env: { HOME: process.env.HOME ?? "", PATH: process.env.PATH ?? "" }, stdout: "pipe" });
	writeFileSync("env-dump.json", JSON.stringify({ env: process.env, descendantGit: d.stdout.toString().trim() }));
	const left = Bun.spawn(["/bin/sleep", "300"], { stdio: ["ignore", "ignore", "ignore"] });
	left.unref();
	writeFileSync("leftover.pid", String(left.pid));
});
`;
const HANG = `import { test } from "bun:test";
import { writeFileSync } from "node:fs";
test("hangs", async () => {
	const c = Bun.spawn(["/bin/sleep", "300"], { stdio: ["ignore", "ignore", "ignore"] });
	writeFileSync("hang.pid", String(c.pid));
	await Bun.sleep(10_000_000);
}, 100_000_000);
`;
const EXITS = `import { test } from "bun:test";
test("exits before the report", () => { process.exit(0); });
`;

const PR = { green: 1, red: 2, solo: 3, env: 4, hang: 5, exit: 6, space: 7 } as const;
type PrName = keyof typeof PR;
const PR_FILES: Record<PrName, Record<string, string>> = {
	green: { "a.test.ts": PASS("a") },
	red: { "red.test.ts": RED },
	solo: { "order_spec.ts": SOLO_ONLY },
	env: { "env.test.ts": ENV_DUMP },
	hang: { "hang.test.ts": HANG },
	exit: { "exits.test.ts": EXITS },
	// git lists ` a.test.ts` first (a space sorts before `a`); trimmed, it would name its sibling.
	space: { " a.test.ts": PASS("space a"), "a.test.ts": PASS("a") },
};

interface Fixture {
	bare: string;
	main: string;
	head: Record<PrName, string>;
}
let fx: Fixture;

beforeAll(() => {
	const root = realpathSync(tmp("trun-fixture"));
	roots.push(root);
	const work = join(root, "work");
	mkdirSync(work);
	g(work, "init", "-q", "-b", "main");
	writeFileSync(join(work, "README.md"), "runner fixture\n");
	// `xa.test.ts` shares a substring with `a.test.ts`: a solo run by `./a.test.ts` must not pick it up.
	writeFileSync(join(work, "xa.test.ts"), PASS("xa"));
	// Every checkout would run the `evil` smudge filter if any config the runner reads defined it.
	writeFileSync(join(work, ".gitattributes"), "*.ts filter=evil\n");
	g(work, "add", "-A");
	g(work, "commit", "-q", "-m", "main");
	const main = g(work, "rev-parse", "HEAD");
	const head = {} as Record<PrName, string>;
	for (const name of Object.keys(PR) as PrName[]) {
		g(work, "checkout", "-q", "--detach", main);
		for (const [f, text] of Object.entries(PR_FILES[name])) writeFileSync(join(work, f), text);
		g(work, "add", "-A");
		g(work, "commit", "-q", "-m", `pr ${name}`);
		head[name] = g(work, "rev-parse", "HEAD");
		g(work, "update-ref", `refs/pull/${PR[name]}/head`, head[name]);
	}
	const bare = join(root, "origin.git");
	g(root, "init", "-q", "--bare", "-b", "main", bare);
	g(work, "push", "-q", bare, "main", "+refs/pull/*:refs/pull/*");
	fx = { bare, main, head };
});

// ---- a world: ledger, runs root, as2test root, install, fake gh and sudo --------------------------------

const GH = `#!/bin/sh
dir="$(cd "$(dirname "$0")/.." && pwd)"
printf '%s\\n' "$*" >> "$dir/gh.log"
if [ "$1 $2" = "pr view" ] && [ -f "$dir/prs/$3.json" ]; then cat "$dir/prs/$3.json"; exit 0; fi
echo "no pull requests found" >&2
exit 1
`;
const SUDO = `#!/bin/sh
[ "$1" = -n ] && [ "$2" = -u ] && [ "$3" = _as2test ] || { echo "fake sudo: bad argv" >&2; exit 1; }
shift 3
printf '%s %s %s\\n' "$2" "$3" "$(pwd -P)" >> "$(dirname "$0")/../sudo-cwd.log"
if [ "$2" = probe ]; then
	out=$("$@")
	code=$?
	if [ "$code" != 0 ] && [ "$code" != 65 ]; then printf '%s\\n' "$out"; exit "$code"; fi
	printf '%s\\n' "$out" | sed -e 's/"read":true/"read":false/g' -e 's/"write":true/"write":false/g'
	exit 0
fi
exec "$@"
`;

interface World {
	root: string;
	home: string;
	runs: string;
	as2: string;
	exec: string;
	hooks: string;
	origin: string;
	checkout: string;
	env: Record<string, string>;
	ledger: Ledger;
	/** Run `fn` with the ledger clock `ms` in the past. */
	ago: <T>(ms: number, fn: () => T) => T;
}

function world(o: { capMin?: number; queueMaxMin?: number; killGraceMs?: number; sweepLockWaitMs?: number } = {}): World {
	const root = realpathSync(tmp("trun"));
	roots.push(root);
	const gid = statSync(root).gid;
	const uid = process.getuid!();
	const home = join(root, "home");
	for (const d of [join(home, ".agent-system-2"), join(home, ".config", "git"), join(root, "bin"), join(root, "prs"), join(root, "hooks"), join(root, "runs")]) mkdirSync(d, { recursive: true });
	// Jo's own config defines the filter the fixture's .gitattributes names; the trusted phase must never read it.
	// (No `;` in the value: gitconfig would read it as a comment.)
	const evil = `[filter "evil"]\n\tsmudge = touch ${root}/SMUDGED && cat\n\tclean = cat\n`;
	writeFileSync(join(home, ".gitconfig"), evil);
	writeFileSync(join(home, ".config", "git", "config"), evil);
	const ledgerPath = join(home, ".agent-system-2", "ledger.db");
	let offset = 0;
	const ledger = Ledger.open(ledgerPath, { create: true, backup: false, backupOnOpen: false, clock: () => new Date(Date.now() - offset).toISOString() });
	const ago = <T>(ms: number, fn: () => T): T => {
		offset = ms;
		try {
			return fn();
		} finally {
			offset = 0;
		}
	};

	const as2 = join(root, "as2");
	mkdirSync(join(as2, "stage"), { recursive: true });
	mkdirSync(join(as2, "runs"));
	mkdirSync(join(as2, "locks"));
	writeFileSync(join(as2, "locks", "sweep.db"), "");
	chmodSync(as2, 0o755);
	chmodSync(join(as2, "stage"), 0o750);
	chmodSync(join(as2, "runs"), 0o755);
	chmodSync(join(as2, "locks"), 0o755);
	chmodSync(join(as2, "locks", "sweep.db"), 0o600);
	const hooks = join(root, "hooks");
	const libexec = join(root, "libexec");
	mkdirSync(libexec);
	chmodSync(libexec, 0o755);
	const exec = join(libexec, "exec");
	writeFileSync(exec, renderExecWrapper({
		root: as2, bun: process.execPath, script: TEST_EXEC, sweepScope: "groups", hooks, killGraceMs: o.killGraceMs ?? 300, sweepLockWaitMs: o.sweepLockWaitMs ?? 30_000,
	}));
	writeFileSync(join(libexec, "bun"), "stand-in for the installed bun\n");
	writeFileSync(join(libexec, "test-exec.js"), "stand-in for the installed bundle\n");
	const source = [
		"version 1", "source /tmp/as2-checkout", `source-sha ${"0".repeat(40)}`, `bun-version ${Bun.version}`, "user _as2test", `uid ${uid}`, `gid ${gid}`, "jo jo", `jo-uid ${uid}`,
		...["exec", "bun", "test-exec.js"].map((f) => `file ${f} ${sha256(join(libexec, f))}`),
		`input surface/scripts/test-exec.ts ${sha256(TEST_EXEC)}`,
	];
	writeFileSync(join(libexec, "SOURCE"), `${source.join("\n")}\n`);
	for (const f of ["exec", "bun", "test-exec.js", "SOURCE"]) chmodSync(join(libexec, f), 0o755);
	const sudoers = join(root, "sudoers");
	writeFileSync(sudoers, "jo ALL=(_as2test) NOPASSWD: exec\n");
	chmodSync(sudoers, 0o440);

	writeFileSync(join(root, "bin", "gh"), GH);
	writeFileSync(join(root, "bin", "sudo"), SUDO);
	chmodSync(join(root, "bin", "gh"), 0o755);
	chmodSync(join(root, "bin", "sudo"), 0o755);

	const origin = join(root, "origin.git");
	g(root, "clone", "-q", "--mirror", fx.bare, origin);
	const checkout = join(root, "checkout");
	mkdirSync(checkout);
	g(checkout, "init", "-q", "-b", "main");
	g(checkout, "remote", "add", "origin", `https://github.com/${OWNER_REPO}.git`);

	const cap = o.capMin ?? 2;
	const config = join(root, "config.yml");
	writeFileSync(config, `testRunner:\n  repos:\n    - origin: ${OWNER_REPO}\n      command: bun test\n  fullCapMin: ${cap}\n  soloCapMin: ${cap}\n  reportCapMb: 5\n  queueMaxMin: ${o.queueMaxMin ?? 60}\n`);

	const env: Record<string, string> = {
		PATH: `${join(root, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: home, TMPDIR: process.env.TMPDIR ?? "/tmp", LANG: "en_US.UTF-8", USER: process.env.USER ?? "jo",
		AGENT_SYSTEM_LEDGER_DB: ledgerPath, AGENT_SYSTEM_TEST_RUNS: join(root, "runs"), AGENT_SYSTEM_TEST_RUNNER_CONFIG: config, AGENT_SYSTEM_TEST_RUNNER_ORIGIN: origin,
		AGENT_SYSTEM_TEST_RUNNER_ROOT: as2,
		AGENT_SYSTEM_TEST_RUNNER_INSTALL: JSON.stringify({ libexec, sudoers, ids: { root: uid, wheel: gid, jo: uid }, account: { uid, gid } }),
		AGENT_SYSTEM_TEST_RUNNER_HEARTBEAT_MS: "500", AGENT_SYSTEM_TEST_RUNNER_POLL_MS: "200", AGENT_SYSTEM_TEST_RUNNER_BUSY_MS: "300", AGENT_SYSTEM_TEST_HOOKS: hooks,
		// Credentials in Jo's env: none may reach the code under test (plan § 3).
		GH_TOKEN: "secret-gh", ANTHROPIC_API_KEY: "secret-anthropic", OPENAI_API_KEY: "secret-openai", MOONSHOT_API_KEY: "secret-moonshot",
		SSH_AUTH_SOCK: "/tmp/secret-agent.sock", OMP_SESSION_TOKEN: "secret-omp", AGENT_SYSTEM_SECRET: "secret-as",
	};
	return { root, home, runs: join(root, "runs"), as2, exec, hooks, origin, checkout, env, ledger, ago };
}

/** An open autonomous workload on the world's checkout, with one open slice. */
function workload(w: World): { wl: string; slice: string } {
	const wl = w.ledger.openWorkload({ by: SURFACE_BY, brief: "runner fixture", stakes: "normal", mode: "autonomous" });
	recordRepo(w.ledger, wl, w.checkout);
	const slice = w.ledger.addSlice({ by: LANE, workloadId: wl, task: "full suite", doneCondition: "a green test-run", inputs: "the PR" });
	return { wl, slice };
}

/** What the fake gh answers for `pr view <N>`. */
function setPr(w: World, n: number, o: { sha: string; headRefName: string; state?: string; isCrossRepository?: boolean }): void {
	writeFileSync(join(w.root, "prs", `${n}.json`), JSON.stringify({
		number: n, state: o.state ?? "OPEN", headRefOid: o.sha, headRefName: o.headRefName, baseRefName: "main", isCrossRepository: o.isCrossRepository ?? false,
	}));
}

function start(w: World, wl: string, pr: number, extra: string[] = []) {
	const r = Bun.spawnSync([process.execPath, RUNNER, "start", wl, String(pr), ...extra, "--requested-by", LANE], { env: w.env, stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
}

const newRunId = (): string => makeRunId(Date.now(), Math.random().toString(36).slice(2, 8).padEnd(4, "0"));

/** A `test-requested:` written as the starter would, `agoMs` in the past; returns the run id. */
function request(w: World, wl: string, slice: string, pr: number, sha: string, agoMs = 0): string {
	const runId = newRunId();
	w.ago(agoMs, () => w.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: slice, kind: "assumption", body: testRequestedBody({ runId, pr, sha, slice, by: LANE }) }));
	return runId;
}

/** `run <run id>` as the starter spawns it, with its log in the run dir. */
function spawnRun(w: World, runId: string, env: Record<string, string> = {}) {
	const dir = join(w.runs, runId);
	mkdirSync(dir, { recursive: true });
	const fd = openSync(join(dir, "runner.log"), "a");
	return Bun.spawn([process.execPath, RUNNER, "run", runId], { cwd: dir, env: { ...w.env, ...env }, stdin: "ignore", stdout: fd, stderr: fd });
}

const runnerLog = (w: World, runId: string): string => {
	try {
		return readFileSync(join(w.runs, runId, "runner.log"), "utf8");
	} catch {
		return "";
	}
};

/** The run's own `test-run:` (the first entry for it), once written. */
async function resultOf(w: World, wl: string, runId: string, timeoutMs = 120_000): Promise<TestRun & { entryId: string }> {
	try {
		return await until(`the test-run: of ${runId}`, () => {
			const rec = testRuns(w.ledger.entries(wl)).find((r) => r.request.runId === runId);
			return rec?.results[0] ?? null;
		}, timeoutMs);
	} catch (e) {
		throw new Error(`${(e as Error).message}\n--- runner.log ---\n${runnerLog(w, runId)}`);
	}
}

/**
 * `<run dir>/result.json` as a FIFO: the runner's write of it blocks, after its `test-run:`
 * transaction has committed, until the returned function reads it.
 */
function holdResultJson(w: World, runId: string): () => Promise<string> {
	const dir = join(w.runs, runId);
	mkdirSync(dir, { recursive: true });
	const fifo = join(dir, "result.json");
	const r = Bun.spawnSync(["mkfifo", fifo], { stderr: "pipe" });
	if (r.exitCode !== 0) throw new Error(`mkfifo ${fifo}: ${r.stderr.toString()}`);
	return () => new Response(Bun.spawn(["cat", fifo], { stdout: "pipe" }).stdout).text();
}

const hookBase = (w: World, runId: string, point: string) => join(w.hooks, `${runId}.${point}`);
const arm = (w: World, runId: string, point: string) => writeFileSync(`${hookBase(w, runId, point)}.pause`, "");
const go = (w: World, runId: string, point: string) => writeFileSync(`${hookBase(w, runId, point)}.go`, "");
const reached = (w: World, runId: string, point: string) =>
	until(`${runId} at ${point}`, () => existsSync(`${hookBase(w, runId, point)}.reached`) && (JSON.parse(readFileSync(`${hookBase(w, runId, point)}.reached`, "utf8")) as { pid: number; at: number }), 60_000);
function marks(w: World, runId: string, point: string): Record<string, unknown>[] {
	const f = `${hookBase(w, runId, point)}.marks`;
	return existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];
}
const current = (w: World): string => readFileSync(join(w.as2, "stage", "current"), "utf8").trim();
const heldMessages = (w: World, wl: string) =>
	w.ledger.db.query<{ body: string; sender: string; recipient: string; state: string }, [string]>("SELECT body, sender, recipient, state FROM messages WHERE workload_id = ? ORDER BY rowid").all(wl);
/** The world's runs.db, with no busy wait: a write while another connection holds a transaction fails at once. */
const lockDbOf = (w: World): Database => openLockDb(w.runs, 0);
/** The lock row's heartbeat moved two minutes back: its holder is stale to every waiter. */
function staleRow(w: World): void {
	const db = lockDbOf(w);
	try {
		db.query("UPDATE lock SET heartbeatAt = ?").run(Date.now() - 120_000);
	} finally {
		db.close();
	}
}

// ---- the starter -------------------------------------------------------------------------------------

describe("start: which PRs run (§ 2.2 steps 1–2)", () => {
	test("a fork PR and a closed PR are refused; an unbound branch is refused, then accepted once a push-dest: binds it; every gh call names -R", async () => {
		const w = world();
		const { wl } = workload(w);
		setPr(w, PR.green, { sha: fx.head.green, headRefName: `wl/${wl}`, isCrossRepository: true });
		const fork = start(w, wl, PR.green);
		expect(fork.code).toBe(START_EXIT.refused);
		expect(fork.err).toContain("comes from a fork");

		setPr(w, PR.green, { sha: fx.head.green, headRefName: `wl/${wl}`, state: "CLOSED" });
		const closed = start(w, wl, PR.green);
		expect(closed.code).toBe(START_EXIT.refused);
		expect(closed.err).toContain("is closed, not open");

		setPr(w, PR.green, { sha: fx.head.green, headRefName: "wl/wl-someone-else" });
		const unbound = start(w, wl, PR.green);
		expect(unbound.code).toBe(START_EXIT.refused);
		expect(unbound.err).toContain("wl/wl-someone-else is not one this workload is bound to");
		expect(testRuns(w.ledger.entries(wl))).toEqual([]);

		// The holder lane's row-8 record of a push to that branch binds it.
		w.ledger.claimWorkload(wl, { by: LANE, holder: LANE, leaseMs: 600_000 });
		w.ledger.recordEntry({ by: LANE, workloadId: wl, kind: "assumption", body: pushDestBody({ remote: "origin", branch: "wl/wl-someone-else", sha: fx.head.green }) });
		const bound = start(w, wl, PR.green);
		expect(bound.code).toBe(START_EXIT.ok);
		const runId = /^test-run (tr-[a-z0-9]+) /.exec(bound.out)![1]!;
		expect((await resultOf(w, wl, runId)).verdict).toBe("green");

		const calls = readFileSync(join(w.root, "gh.log"), "utf8").trim().split("\n");
		expect(calls).toHaveLength(4);
		for (const c of calls) expect(c).toBe(`pr view ${PR.green} -R ${OWNER_REPO} --json number,state,headRefOid,headRefName,baseRefName,isCrossRepository`);
	});

	test("a repo the profile does not serve is refused before any gh call", () => {
		const w = world();
		const { wl } = workload(w);
		g(w.checkout, "remote", "set-url", "origin", "https://github.com/someone/other.git");
		const r = start(w, wl, PR.green);
		expect(r.code).toBe(START_EXIT.refused);
		expect(r.err).toContain("does not serve https://github.com/someone/other.git");
		expect(existsSync(join(w.root, "gh.log"))).toBe(false);
	});
});

describe("start: the reservation (§ 2.2 step 3)", () => {
	test("a second request while one is live is refused, before its first heartbeat too (the startup lease)", () => {
		const w = world();
		const { wl, slice } = workload(w);
		setPr(w, PR.green, { sha: fx.head.green, headRefName: `wl/${wl}` });
		const live = request(w, wl, slice, PR.green, fx.head.green);
		expect(existsSync(join(w.runs, live, "heartbeat"))).toBe(false);
		const r = start(w, wl, PR.green, ["--slice", slice]);
		expect(r.code).toBe(START_EXIT.refused);
		expect(r.err).toBe(`test-runner start: run ${live} (PR #${PR.green}, slice ${slice}) is live on ${wl}; its test-run: settles it`);
		expect(testRuns(w.ledger.entries(wl)).map((x) => x.request.runId)).toEqual([live]);
	});

	test("a dead runner (no heartbeat past the 120 s lease) is settled as error runner died, then the new run proceeds and settles the slice", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		setPr(w, PR.green, { sha: fx.head.green, headRefName: `wl/${wl}` });
		const dead = request(w, wl, slice, PR.green, fx.head.green, 200_000);
		const r = start(w, wl, PR.green, ["--slice", slice]);
		expect(r.code).toBe(START_EXIT.ok);
		const runs = testRuns(w.ledger.entries(wl));
		expect(runs[0]!.request.runId).toBe(dead);
		expect(runs[0]!.result).toMatchObject({ verdict: "error", reason: "runner died", runDir: join(w.runs, dead) });
		const runId = runs[1]!.request.runId;
		expect((await resultOf(w, wl, runId)).verdict).toBe("green");
		expect(w.ledger.slice(slice)).toMatchObject({ state: "done", changed_by: TEST_RUNNER_BY });
	});

	test("a queued run stays live past 120 s: its heartbeat runs while it waits for the lock, so a second request is refused", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		setPr(w, PR.green, { sha: fx.head.green, headRefName: `wl/${wl}` });
		const db = lockDbOf(w);
		// Another run holds the lock with a heartbeat ten minutes ahead: fresh for the whole test, with no timer to keep it so.
		db.query("INSERT INTO lock (id, runId, pid, pgid, runDir, heartbeatAt) VALUES (1, 'tr-otherholder', 1, 1, '/nowhere', ?)").run(Date.now() + 600_000);
		try {
			// The request is 200 s old (past the startup lease); requested sha ≠ the PR head, so once it runs it ends quickly as stale.
			const queued = request(w, wl, slice, PR.green, fx.main, 200_000);
			const child = spawnRun(w, queued);
			await until("two queued polls", () => marks(w, queued, "queued").length >= 2);
			const first = parseHeartbeat(readFileSync(join(w.runs, queued, "heartbeat"), "utf8"), queued)!;
			await until("a later heartbeat", () => (parseHeartbeat(readFileSync(join(w.runs, queued, "heartbeat"), "utf8"), queued) ?? 0) > first);
			const r = start(w, wl, PR.green, ["--slice", slice]);
			expect(r.code).toBe(START_EXIT.refused);
			expect(r.err).toContain(`run ${queued} `);
			expect(testRuns(w.ledger.entries(wl))).toHaveLength(1);
			db.query("DELETE FROM lock").run();
			expect((await resultOf(w, wl, queued)).verdict).toBe("stale");
			await child.exited;
		} finally {
			db.close();
		}
	});

	test("a run that waits past queueMaxMin ends error queued too long, without touching the holder's lock or current", async () => {
		const w = world({ queueMaxMin: 0.01 });
		const { wl, slice } = workload(w);
		const db = lockDbOf(w);
		db.query("INSERT INTO lock (id, runId, pid, pgid, runDir, heartbeatAt) VALUES (1, 'tr-otherholder', 1, 1, '/nowhere', ?)").run(Date.now() + 600_000);
		try {
			const runId = request(w, wl, slice, PR.green, fx.head.green);
			await spawnRun(w, runId).exited;
			const run = await resultOf(w, wl, runId);
			expect(run).toMatchObject({ verdict: "error", reason: "queued too long", full: null });
			expect(lockRow(db)!.runId).toBe("tr-otherholder");
			expect(existsSync(join(w.as2, "stage", "current"))).toBe(false);
			expect(heldMessages(w, wl).map((m) => m.body)).toEqual([`test-run-failed: ${wl} ${slice} error at ${fx.head.green}: 0 failing`]);
		} finally {
			db.close();
		}
	});
});

// ---- whole runs ------------------------------------------------------------------------------------------

describe("run: verdicts and the settle (§ 2.3 steps 2–8)", () => {
	test("green: start prints its line, the run settles the slice it added; ./ exact path; the bundle clone has history; no smudge filter ran; a sweep after each part; no message", async () => {
		const w = world();
		const { wl } = workload(w);
		setPr(w, PR.green, { sha: fx.head.green, headRefName: `wl/${wl}` });
		const r = start(w, wl, PR.green);
		expect(r.code).toBe(START_EXIT.ok);
		const m = /^test-run (tr-[a-z0-9]+) runner (\d+) sha ([0-9a-f]{40}) slice (sl-full-\S+-1) log (\S+)$/.exec(r.out)!;
		expect(m).not.toBeNull();
		const [, runId, pid, sha, slice, log] = m as unknown as string[];
		expect(sha).toBe(fx.head.green);
		expect(log).toBe(join(w.runs, runId!, "runner.log"));
		expect(JSON.parse(readFileSync(join(w.runs, runId!, "runner.json"), "utf8"))).toEqual({ pid: Number(pid), pgid: Number(pid), runId });
		expect(w.ledger.slice(slice!)).toMatchObject({ state: "open", created_by: TEST_RUNNER_BY, task: `full suite outside the fence at PR #${PR.green}` });

		const run = await resultOf(w, wl, runId!);
		expect(run).toMatchObject({ verdict: "green", sha: fx.head.green, headAtEnd: fx.head.green, base: fx.main, mergeBase: fx.main, runDir: join(w.runs, runId!) });
		expect(run.full).toMatchObject({ pass: 2, fail: 0, exit: 0, error: null });
		// `./a.test.ts` alone runs a.test.ts only: xa.test.ts, which `a.test.ts` as a substring would also match, is not in it.
		expect(run.solo).toEqual([expect.objectContaining({ file: "./a.test.ts", pass: 1, fail: 0, exit: 0, error: null })]);
		expect(run.preflight).toContain("probe:");
		await until("the settle", () => w.ledger.slice(slice!)?.state === "done");
		expect(w.ledger.slice(slice!)!.artifact).toBe(`test-run ${runId}: green at ${fx.head.green} on PR #${PR.green}; full 2/0/0; alone: ./a.test.ts 1/0; ${join(w.runs, runId!)}`);
		expect(JSON.parse(readFileSync(join(w.runs, runId!, "result.json"), "utf8"))).toMatchObject({ runId, verdict: "green", sha: fx.head.green });
		for (const f of ["full.xml", "full.log", "solo-1.xml", "solo-1.log"]) expect(existsSync(join(w.runs, runId!, f))).toBe(true);
		expect(heldMessages(w, wl)).toEqual([]);

		expect(existsSync(join(w.root, "SMUDGED"))).toBe(false);
		expect(marks(w, runId!, "sweep").map((x) => x.after)).toEqual(["publish", "full", "./a.test.ts"]);

		// The handoff: `_as2test`'s clone from the bundle is a real repository.
		const clone = join(workDirOf(runId!, w.as2), "repo");
		expect(g(clone, "rev-parse", "HEAD")).toBe(fx.head.green);
		expect(g(clone, "log", "--format=%H").split("\n")).toEqual([fx.head.green, fx.main]);
		expect(g(clone, "diff", "--name-only", run.mergeBase!)).toBe("a.test.ts");
		expect(g(clone, "remote")).toBe("");
		// The lock is released and `current` still names the last run.
		const db = lockDbOf(w);
		expect(lockRow(db)).toBeNull();
		db.close();
		expect(current(w)).toBe(runId!);
		// Control: a plain clone under the same HOME does run the filter, so the fixture was armed for the runner too.
		const control = Bun.spawnSync(["git", "clone", "-q", w.origin, join(w.root, "control")], { env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: w.home, GIT_CONFIG_NOSYSTEM: "1" }, stderr: "pipe" });
		expect(control.exitCode).toBe(0);
		expect(existsSync(join(w.root, "SMUDGED"))).toBe(true);
	});

	test("every wrapper call starts in the as2test root, never the 0700 run dir _as2test cannot read (item 24, Jo's diagnosis)", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.green, fx.head.green);
		await spawnRun(w, runId).exited;
		expect((await resultOf(w, wl, runId)).verdict).toBe("green");
		const calls = readFileSync(join(w.root, "sudo-cwd.log"), "utf8").trim().split("\n").map((l) => l.split(" ")).filter(([, id]) => id === runId);
		expect(calls.map(([sub]) => sub).filter((s, i, all) => all.indexOf(s) === i).sort()).toEqual(["full", "prepare", "probe", "solo", "sweep"]);
		for (const [sub, , cwd] of calls) expect({ sub, cwd }).toEqual({ sub, cwd: w.as2 });
	});

	test("a changed test file whose name begins with a space keeps it: the solo part runs `./ a.test.ts`, not its sibling `./a.test.ts` in its place", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.space, fx.head.space);
		await spawnRun(w, runId).exited;
		const run = await resultOf(w, wl, runId);
		expect(run.solo).toEqual([
			expect.objectContaining({ file: "./ a.test.ts", pass: 1, fail: 0, error: null }),
			expect.objectContaining({ file: "./a.test.ts", pass: 1, fail: 0, error: null }),
		]);
		expect(run.verdict).toBe("green");
	});

	test("red keeps the slice open with every failing name and its whole first error line (25 of them), and messages the orchestrator when no lane holds the workload", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.red, fx.head.red);
		await spawnRun(w, runId).exited;
		const run = await resultOf(w, wl, runId);
		expect(run.verdict).toBe("red");
		expect(run.full).toMatchObject({ pass: 2, fail: 25, exit: 1, error: null });
		expect(run.solo).toEqual([expect.objectContaining({ file: "./red.test.ts", pass: 1, fail: 25 })]);
		const full = run.failures.filter((f) => f.part === "full");
		expect(full).toHaveLength(25);
		expect(run.failures.filter((f) => f.part === "./red.test.ts")).toHaveLength(25);
		for (const [i, f] of full.entries()) {
			const n = String(i + 1).padStart(2, "0");
			expect(f.name).toBe(`red.test.ts > case ${n}`);
			expect(f.firstError).toContain(`failure ${n}: ${"detail ".repeat(30)}end ${n}`);
		}
		// The entry carries them all, untruncated.
		const entry = w.ledger.entries(wl).find((e) => e.id === run.entryId)!;
		expect(parseTestRun(entry.body)!.failures).toHaveLength(50);
		expect(w.ledger.slice(slice)!.state).toBe("open");
		expect(heldMessages(w, wl)).toEqual([{
			body: `test-run-failed: ${wl} ${slice} red at ${fx.head.red}: 50 failing, first red.test.ts > case 01`, sender: TEST_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, state: "held",
		}]);
	});

	test("a red run on a workload a lane holds under a live lease does not message the orchestrator (the lane hears it)", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		w.ledger.claimWorkload(wl, { by: LANE, holder: LANE, leaseMs: 600_000 });
		const runId = request(w, wl, slice, PR.red, fx.head.red);
		await spawnRun(w, runId).exited;
		expect((await resultOf(w, wl, runId)).verdict).toBe("red");
		expect(heldMessages(w, wl)).toEqual([]);
	});

	test("a changed _spec.ts file failing alone with the suite green is red", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.solo, fx.head.solo);
		await spawnRun(w, runId).exited;
		const run = await resultOf(w, wl, runId);
		expect(run.full).toMatchObject({ pass: 2, fail: 0, exit: 0, error: null });
		expect(run.solo).toEqual([expect.objectContaining({ file: "./order_spec.ts", pass: 0, fail: 1 })]);
		expect(run.verdict).toBe("red");
		expect(run.failures).toEqual([{ part: "./order_spec.ts", name: "order_spec.ts > needs a clean clone", firstError: "error: state leaked by an earlier run is still here" }]);
		expect(w.ledger.slice(slice)!.state).toBe("open");
	});

	test("the head moved mid-run: stale, nothing settled", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.green, fx.head.green);
		arm(w, runId, "head-recheck");
		const child = spawnRun(w, runId);
		await reached(w, runId, "head-recheck");
		g(w.origin, "update-ref", `refs/pull/${PR.green}/head`, fx.head.red);
		go(w, runId, "head-recheck");
		await child.exited;
		const run = await resultOf(w, wl, runId);
		expect(run).toMatchObject({ verdict: "stale", headAtEnd: fx.head.red });
		expect(run.full).toMatchObject({ pass: 2, fail: 0 });
		expect(run.reason).toContain("moved");
		expect(w.ledger.slice(slice)!.state).toBe("open");
	});

	test("the requested sha is not the fetched head: stale before any test, nothing prepared", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.green, fx.head.red);
		await spawnRun(w, runId).exited;
		const run = await resultOf(w, wl, runId);
		expect(run).toMatchObject({ verdict: "stale", full: null, solo: [], failures: [] });
		expect(run.reason).toContain("nothing was tested");
		expect(marks(w, runId, "spawn-prepare")).toEqual([]);
		expect(marks(w, runId, "spawn-full")).toEqual([]);
		expect(existsSync(workDirOf(runId, w.as2))).toBe(false);
		expect(w.ledger.slice(slice)!.state).toBe("open");
	});

	test("a superseded runner's late result settles nothing: its request was settled as dead and a newer one written while it ran", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.green, fx.head.green);
		arm(w, runId, "result");
		const child = spawnRun(w, runId);
		await reached(w, runId, "result");
		// What a later starter writes for a runner whose heartbeat went stale: `runner died`, then its own request.
		w.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: slice, kind: "assumption", body: testRunBody(runnerDiedRun({ runId, pr: PR.green, sha: fx.head.green, slice, by: LANE })) });
		request(w, wl, slice, PR.green, fx.head.green);
		go(w, runId, "result");
		await child.exited;
		const rec = testRuns(w.ledger.entries(wl)).find((r) => r.request.runId === runId)!;
		expect(rec.results.map((r) => r.verdict)).toEqual(["error", "superseded"]);
		expect(rec.results[1]!.reason).toContain("lost ownership of the request; the run found green");
		expect(rec.results[1]!.full).toMatchObject({ pass: 2, fail: 0 });
		expect(w.ledger.slice(slice)!.state).toBe("open");
		expect(heldMessages(w, wl)).toEqual([]);
	});

	// result.json is written after the `test-run:` transaction: held there, the run has decided and
	// committed, and whatever lands now is the gap an after-the-fact settle would have raced.
	test("the settle commits with the test-run: entry: a successor request landing once the entry is visible finds the slice done, and the old green writes nothing after it", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.green, fx.head.green);
		const release = holdResultJson(w, runId);
		const child = spawnRun(w, runId);
		const run = await resultOf(w, wl, runId);
		const atEntry = w.ledger.slice(slice)!;
		const successor = request(w, wl, slice, PR.green, fx.head.green);
		expect(JSON.parse(await release())).toMatchObject({ runId, verdict: "green" });
		await child.exited;
		expect(run.verdict).toBe("green");
		expect(atEntry).toMatchObject({ state: "done", changed_by: TEST_RUNNER_BY });
		expect(atEntry.artifact).toStartWith(`test-run ${runId}: green at ${fx.head.green}`);
		expect(w.ledger.slice(slice)).toEqual(atEntry);
		expect(testRuns(w.ledger.entries(wl)).find((r) => r.request.runId === successor)!.results).toEqual([]);
		expect(runnerLog(w, runId)).toContain(`settled ${slice}`);
	});

	test("the settle commits with the test-run: entry: a pause landing once the entry is visible is refused, and the slice keeps the run's own completion", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.green, fx.head.green);
		const release = holdResultJson(w, runId);
		const child = spawnRun(w, runId);
		await resultOf(w, wl, runId);
		const atEntry = w.ledger.slice(slice)!;
		let pause = "paused";
		try {
			w.ledger.raiseQuestion({ by: LANE, workloadId: wl, sliceId: slice, body: "hold on?", options: ["yes", "no"] });
		} catch (e) {
			pause = (e as Error).message;
		}
		await release();
		await child.exited;
		expect(atEntry).toMatchObject({ state: "done", changed_by: TEST_RUNNER_BY });
		expect(atEntry.artifact).toStartWith(`test-run ${runId}: green`);
		expect(pause).toContain("a question needs an open workload and a running or paused slice");
		expect(w.ledger.slice(slice)).toEqual(atEntry);
	});

	test("missing junit gives error, never green", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.exit, fx.head.exit);
		await spawnRun(w, runId).exited;
		const run = await resultOf(w, wl, runId);
		expect(run.verdict).toBe("error");
		expect(run.full!.error).toBe("junit report missing");
		expect(w.ledger.slice(slice)!.state).toBe("open");
	});

	test("the child env: no credential variable, HOME under the work dir, GIT_CONFIG_NOSYSTEM=1, and a {HOME, PATH} descendant still finds the git shim; the sweep removes a child the test left", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.env, fx.head.env);
		await spawnRun(w, runId).exited;
		expect((await resultOf(w, wl, runId)).verdict).toBe("green");
		const workDir = workDirOf(runId, w.as2);
		const dump = JSON.parse(readFileSync(join(workDir, "repo", "env-dump.json"), "utf8")) as { env: Record<string, string>; descendantGit: string };
		for (const k of Object.keys(dump.env)) {
			expect(k).not.toMatch(/^(GH_TOKEN|ANTHROPIC_API_KEY|OPENAI_.*|MOONSHOT_.*|SSH_AUTH_SOCK|OMP_.*|AGENT_SYSTEM_TEST_.*)$/);
			if (k.startsWith("AGENT_SYSTEM_")) expect(k).toBe("AGENT_SYSTEM_LEDGER_DB");
		}
		for (const v of Object.values(dump.env)) expect(v).not.toContain("secret-");
		expect(dump.env.HOME).toBe(childLayout(workDir).home);
		expect(dump.env.AGENT_SYSTEM_LEDGER_DB!.startsWith(`${workDir}/`)).toBe(true);
		expect(dump.env.GIT_CONFIG_NOSYSTEM).toBe("1");
		expect(dump.descendantGit).toBe(join(childLayout(workDir).shimDir, "git"));
		const leftover = Number(readFileSync(join(workDir, "repo", "leftover.pid"), "utf8"));
		expect(alive(leftover)).toBe(false);
		expect(marks(w, runId, "sweep").map((x) => x.after)).toEqual(["publish", "full", "./env.test.ts"]);
	});

	test("a part past its cap: the wrapper kills its group and the part is error timeout", async () => {
		const w = world({ capMin: 0.05 });
		const { wl, slice } = workload(w);
		const runId = request(w, wl, slice, PR.hang, fx.head.hang);
		await spawnRun(w, runId).exited;
		const run = await resultOf(w, wl, runId);
		expect(run.verdict).toBe("error");
		expect(run.full).toMatchObject({ exit: WRAPPER_EXIT.timeout, error: "timeout" });
		expect(run.solo).toEqual([expect.objectContaining({ file: "./hang.test.ts", error: "timeout" })]);
		const pid = Number(readFileSync(join(workDirOf(runId, w.as2), "repo", "hang.pid"), "utf8"));
		expect(alive(pid)).toBe(false);
	});

	test("retention: past the newest 10, a run loses its stage dir, its work dir (through the fenced cleanup) and its run dir's scratch files; logs, reports and result.json stay", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const old: string[] = [];
		for (let i = 0; i < 11; i++) {
			const id = makeRunId(Date.now() - (20 - i) * 60_000, `old${i}`);
			old.push(id);
			mkdirSync(join(w.runs, id));
			for (const f of ["runner.log", "full.xml", "full.log", "result.json", "heartbeat", "runner.json", "trusted.gitconfig"]) writeFileSync(join(w.runs, id, f), "x\n");
			mkdirSync(join(w.as2, "stage", id, "repo"), { recursive: true });
			mkdirSync(join(w.as2, "runs", id, "repo"), { recursive: true });
		}
		// The new run asks for a sha the PR does not have, so it ends right after retention, before any test.
		const runId = request(w, wl, slice, PR.green, fx.main);
		await spawnRun(w, runId).exited;
		expect((await resultOf(w, wl, runId)).verdict).toBe("stale");
		// Twelve runs: the two oldest are pruned.
		for (const id of old.slice(0, 2)) {
			expect(existsSync(join(w.as2, "stage", id))).toBe(false);
			expect(existsSync(join(w.as2, "runs", id))).toBe(false);
			expect(readdirSync(join(w.runs, id)).sort()).toEqual(["full.log", "full.xml", "result.json", "runner.log"]);
		}
		for (const id of old.slice(2)) {
			expect(existsSync(join(w.as2, "stage", id))).toBe(true);
			expect(existsSync(join(w.as2, "runs", id))).toBe(true);
			expect(existsSync(join(w.runs, id, "heartbeat"))).toBe(true);
		}
		expect(marks(w, runId, "spawn-cleanup")).toHaveLength(2);
	});
});

// ---- the report import (§ 2.2 step 4) ----------------------------------------------------------------------

describe("the junit and log import", () => {
	function dirs() {
		const root = realpathSync(tmp("trun-import"));
		roots.push(root);
		mkdirSync(join(root, "work"));
		mkdirSync(join(root, "run"));
		return { work: join(root, "work"), run: join(root, "run"), root };
	}
	const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="bun test" tests="1" assertions="1" failures="0" skipped="0" time="0.01">\n  <testsuite name="a.test.ts" file="a.test.ts" tests="1" assertions="1" failures="0" skipped="0" time="0.01">\n    <testcase name="a" classname="" time="0.01" file="a.test.ts" assertions="1" />\n  </testsuite>\n</testsuites>\n`;

	test("a regular file under the cap is copied into the run dir and parsed", () => {
		const d = dirs();
		writeFileSync(join(d.work, "full.xml"), JUNIT);
		writeFileSync(join(d.work, "full.log"), "a.test.ts:\n(pass) a\n");
		const p = importPart(d.work, d.run, "full", 1_000_000);
		expect(p.importError).toBeNull();
		expect(readFileSync(join(d.run, "full.xml"), "utf8")).toBe(JUNIT);
		expect(partResult({ ...p, exit: 0, ms: 5 })).toMatchObject({ pass: 1, fail: 0, error: null });
	});

	test("a symlinked junit, a FIFO with no writer (the open does not block), an over-cap report or log each make the part error", () => {
		const d = dirs();
		writeFileSync(join(d.root, "elsewhere.xml"), JUNIT);
		symlinkSync(join(d.root, "elsewhere.xml"), join(d.work, "full.xml"));
		expect(importReport(d.work, d.run, "full.xml", 1_000_000)).toEqual({ text: null, error: "full.xml is a symlink" });
		const linked = importPart(d.work, d.run, "full", 1_000_000);
		expect(partResult({ ...linked, exit: 0, ms: 1 })).toMatchObject({ error: "report import refused: full.xml is a symlink", pass: 0, fail: 0 });
		expect(existsSync(join(d.run, "full.xml"))).toBe(false);

		expect(Bun.spawnSync(["/usr/bin/mkfifo", join(d.work, "solo-1.xml")]).exitCode).toBe(0);
		const t0 = Date.now();
		expect(importReport(d.work, d.run, "solo-1.xml", 1_000_000)).toEqual({ text: null, error: "solo-1.xml is not a regular file" });
		expect(Date.now() - t0).toBeLessThan(2_000);

		writeFileSync(join(d.work, "solo-2.xml"), JUNIT);
		expect(importReport(d.work, d.run, "solo-2.xml", 100)).toEqual({ text: null, error: "solo-2.xml is over the 100-byte report cap" });
		writeFileSync(join(d.work, "solo-2.log"), "x".repeat(JUNIT.length + 1));
		const overLog = importPart(d.work, d.run, "solo-2", JUNIT.length);
		expect(partResult({ ...overLog, exit: 0, ms: 1 }).error).toBe(`report import refused: solo-2.log is over the ${JUNIT.length}-byte report cap`);
	});

	test("a missing junit is error, never green", () => {
		const d = dirs();
		const p = importPart(d.work, d.run, "full", 1_000_000);
		expect(p).toEqual({ junit: null, log: null, importError: null });
		expect(partResult({ ...p, exit: 0, ms: 1 })).toMatchObject({ error: "junit report missing" });
	});
});

// ---- the lock, publication and fencing, with paused boundaries (§ 2.3 step 1) ---------------------------------

describe("the runs lock and current", () => {
	test("(a) a clean acquisition publishes current in its own transaction; while it is open the other waiter stays busy, then queues until the holder is done", async () => {
		const w = world();
		const a = workload(w);
		const b = workload(w);
		const A = request(w, a.wl, a.slice, PR.green, fx.head.green);
		// B asks for a sha the PR does not have: once it holds the lock it ends at once as stale.
		const B = request(w, b.wl, b.slice, PR.green, fx.main);
		arm(w, A, "acquire-tx");
		const ca = spawnRun(w, A);
		await reached(w, A, "acquire-tx");
		// Inside A's open transaction: current already names A, the row is not yet visible, and no other writer gets in.
		expect(current(w)).toBe(A);
		const probe = lockDbOf(w);
		expect(lockRow(probe)).toBeNull();
		expect(() => probe.exec("BEGIN IMMEDIATE")).toThrow();
		probe.close();
		const cb = spawnRun(w, B);
		await until("B busy on A's open transaction", () => marks(w, B, "acquire-busy").length >= 1);
		expect(marks(w, B, "acquired")).toEqual([]);
		go(w, A, "acquire-tx");
		await until("B queued behind A", () => marks(w, B, "queued").length >= 1);
		await until("A's acquisition committed", () => marks(w, A, "acquired").length === 1);
		expect(marks(w, A, "acquired")).toEqual([expect.objectContaining({ displaced: null })]);
		await ca.exited;
		expect((await resultOf(w, a.wl, A)).verdict).toBe("green");
		await cb.exited;
		expect((await resultOf(w, b.wl, B)).verdict).toBe("stale");
		const aDone = (marks(w, A, "result")[0]!.at as number);
		expect(marks(w, B, "acquired")).toEqual([expect.objectContaining({ displaced: null })]);
		expect(marks(w, B, "acquired")[0]!.at as number).toBeGreaterThanOrEqual(aDone);
		expect(current(w)).toBe(B);
	});

	test("two waiters on one stale lock row, SQLITE_BUSY retried: exactly one takes it over", async () => {
		const w = world();
		const db = lockDbOf(w);
		db.query("INSERT INTO lock (id, runId, pid, pgid, runDir, heartbeatAt) VALUES (1, 'tr-staleholder', 1, 1, '/nowhere', ?)").run(Date.now() - 120_000);
		db.close();
		const a = workload(w);
		const b = workload(w);
		const A = request(w, a.wl, a.slice, PR.green, fx.main);
		const B = request(w, b.wl, b.slice, PR.green, fx.main);
		arm(w, A, "acquire-tx");
		const ca = spawnRun(w, A);
		await reached(w, A, "acquire-tx");
		const cb = spawnRun(w, B);
		await until("B busy", () => marks(w, B, "acquire-busy").length >= 1);
		go(w, A, "acquire-tx");
		await Promise.all([ca.exited, cb.exited]);
		expect((await resultOf(w, a.wl, A)).verdict).toBe("stale");
		expect((await resultOf(w, b.wl, B)).verdict).toBe("stale");
		const takeovers = [...marks(w, A, "acquired"), ...marks(w, B, "acquired")].filter((m) => m.displaced === "tr-staleholder");
		expect(takeovers).toHaveLength(1);
		expect(marks(w, A, "acquired")).toEqual([expect.objectContaining({ displaced: "tr-staleholder" })]);
		expect(marks(w, B, "acquired")).toEqual([expect.objectContaining({ displaced: null })]);
	});

	test("(b) a runner replaced after it committed publishes nothing later, and current stays B; (f) every wrapper call it makes is fenced", async () => {
		const w = world();
		const a = workload(w);
		const b = workload(w);
		const A = request(w, a.wl, a.slice, PR.green, fx.head.green);
		const B = request(w, b.wl, b.slice, PR.green, fx.head.green);
		arm(w, A, "phase-preflight");
		// A beats once at acquisition and then not again for the length of the test: its row goes stale only when the test says.
		const ca = spawnRun(w, A, { AGENT_SYSTEM_TEST_RUNNER_HEARTBEAT_MS: "600000" });
		await reached(w, A, "phase-preflight");
		expect(current(w)).toBe(A);
		staleRow(w);
		const cb = spawnRun(w, B);
		await until("B took over", () => marks(w, B, "acquired").length === 1);
		expect(marks(w, B, "acquired")[0]).toMatchObject({ displaced: A });
		expect(current(w)).toBe(B);
		// The guarded publication itself: A's id no longer holds the row, so nothing is written.
		const db = lockDbOf(w);
		expect(publishIfOwner(db, join(w.as2, "stage"), A)).toBe(false);
		db.close();
		expect(current(w)).toBe(B);
		// (f) Each subcommand for A's run id is refused by the fence while current names B.
		const calls: WrapperCall[] = [
			{ sub: "prepare", runId: A, sha: fx.head.green }, { sub: "full", runId: A }, { sub: "solo", runId: A, file: "./a.test.ts" }, { sub: "sweep", runId: A },
			{ sub: "cleanup", runId: A, oldRunId: B }, { sub: "probe", runId: A, paths: [w.home] },
		];
		for (const call of calls) {
			const r = Bun.spawnSync(wrapperArgv(call, w.exec), { env: w.env, stdout: "pipe", stderr: "pipe" });
			expect([call.sub, r.exitCode]).toEqual([call.sub, WRAPPER_EXIT.fenced]);
		}
		go(w, A, "phase-preflight");
		await ca.exited;
		const ra = await resultOf(w, a.wl, A);
		expect(ra.verdict).toBe("superseded");
		expect(ra.reason).toContain(`the lock row holds ${B}`);
		expect(marks(w, A, "spawn-probe")).toEqual([]);
		expect(marks(w, A, "spawn-prepare")).toEqual([]);
		expect(w.ledger.slice(a.slice)!.state).toBe("open");
		await cb.exited;
		expect((await resultOf(w, b.wl, B)).verdict).toBe("green");
	});

	test("(e) a displaced runner's heartbeat updates no row and cannot keep the successor's lock alive", async () => {
		const w = world();
		const a = workload(w);
		const b = workload(w);
		const A = request(w, a.wl, a.slice, PR.green, fx.head.green);
		const B = request(w, b.wl, b.slice, PR.green, fx.main);
		const ca = spawnRun(w, A);
		await until("A holds the lock", () => marks(w, A, "acquired").length === 1);
		arm(w, A, "heartbeat-update");
		await reached(w, A, "heartbeat-update");
		// A is frozen before its next UPDATE; its row goes stale and B takes it over.
		staleRow(w);
		const cb = spawnRun(w, B);
		await until("B took over", () => marks(w, B, "acquired").length === 1);
		const before = (() => {
			const db = lockDbOf(w);
			try {
				return lockRow(db)!;
			} finally {
				db.close();
			}
		})();
		expect(before.runId).toBe(B);
		const frozenUntil = Date.now();
		go(w, A, "heartbeat-update");
		await until("A's heartbeat after the takeover", () => marks(w, A, "heartbeat").some((m) => (m.at as number) >= frozenUntil));
		expect(marks(w, A, "heartbeat").filter((m) => (m.at as number) >= frozenUntil)).toEqual([expect.objectContaining({ changes: 0 })]);
		await Promise.all([ca.exited, cb.exited]);
		expect((await resultOf(w, a.wl, A)).verdict).toBe("superseded");
		expect((await resultOf(w, b.wl, B)).verdict).toBe("stale");
		expect(marks(w, B, "acquired")[0]).toMatchObject({ displaced: A });
	});
});

describe("exclusive sweeps (§ 2.3 step 1, the order of a run)", () => {
	/**
	 * A's sweep holds the sweep lock, paused at `point`; A's row goes stale; B takes over, publishes and
	 * its sweep waits. The test sends `signal` to B's waiting sweep, standing in for A's `uid` sweep,
	 * which a `groups` render cannot reproduce. Then A resumes.
	 */
	async function race(point: "sweep-read1" | "sweep-read2", signal: "SIGTERM" | "SIGKILL") {
		const w = world();
		const a = workload(w);
		const b = workload(w);
		const A = request(w, a.wl, a.slice, PR.green, fx.head.green);
		const B = request(w, b.wl, b.slice, PR.green, fx.head.green);
		arm(w, A, point);
		const ca = spawnRun(w, A, { AGENT_SYSTEM_TEST_RUNNER_HEARTBEAT_MS: "600000" });
		await reached(w, A, point);
		staleRow(w);
		const cb = spawnRun(w, B);
		await until("B took over", () => marks(w, B, "acquired").length === 1);
		expect(current(w)).toBe(B);
		const first = (await until("B's first sweep", () => marks(w, B, "spawn-sweep")[0]))!.pid as number;
		process.kill(first, signal);
		await until("B's retried sweep", () => marks(w, B, "spawn-sweep").length >= 2);
		const resumedAt = Date.now();
		go(w, A, point);
		await Promise.all([ca.exited, cb.exited]);
		const ra = await resultOf(w, a.wl, A);
		const rb = await resultOf(w, b.wl, B);
		expect(ra.verdict).toBe("superseded");
		expect(w.ledger.slice(a.slice)!.state).toBe("open");
		// B retried its sweep once, got the lock only after A's sweep ended, and its preflight and parts ran unharmed after that.
		expect(marks(w, B, "sweep").map((m) => [m.after, m.attempt])).toEqual([["publish", 0], ["publish", 1], ["full", 0], ["./a.test.ts", 0]]);
		expect(runnerLog(w, B)).toContain(`ended by ${signal}; retry 1 of 3`);
		expect(marks(w, B, "spawn-probe")[0]!.at as number).toBeGreaterThan(resumedAt);
		expect(rb).toMatchObject({ verdict: "green" });
		expect(rb.full).toMatchObject({ pass: 2, fail: 0, error: null });
		return { w, A, B, ra };
	}

	test("(c) SIGTERM: A has read current = A; B publishes, its sweep waits and is signalled; A aborts before SIGKILL; B retries and runs unharmed", async () => {
		const { w, A } = await race("sweep-read1", "SIGTERM");
		// A's sweep read current again after its grace, found B, and aborted fenced before any SIGKILL.
		expect(runnerLog(w, A)).toContain(`sweep ${A} → exit ${WRAPPER_EXIT.fenced}`);
	});

	test("(d) SIGKILL: A paused between its second read and SIGKILL; B's sweep is killed while it waits; B retries and runs unharmed", async () => {
		const { w, A, ra } = await race("sweep-read2", "SIGKILL");
		// A's own sweep finished (its second read still saw A); the runner then found the row held by B.
		expect(runnerLog(w, A)).toContain(`sweep ${A} → exit 0`);
		expect(ra.reason).toContain("the lock row holds");
	});

	test("a sweep killed on every attempt spends its 3 retries and the run ends error", async () => {
		const w = world();
		const { wl, slice } = workload(w);
		const A = request(w, wl, slice, PR.green, fx.head.green);
		// The test holds the sweep lock, so every sweep of A waits on it until it is signalled.
		const holder = new Database(join(w.as2, "locks", "sweep.db"));
		holder.exec("PRAGMA journal_mode = MEMORY");
		holder.exec("BEGIN EXCLUSIVE");
		try {
			const ca = spawnRun(w, A);
			for (let i = 0; i < 4; i++) {
				const pid = (await until(`sweep attempt ${i + 1}`, () => marks(w, A, "spawn-sweep")[i]))!.pid as number;
				process.kill(pid, "SIGTERM");
			}
			await ca.exited;
			const run = await resultOf(w, wl, A);
			expect(run.verdict).toBe("error");
			expect(run.reason).toBe("the sweep after publish ended by SIGTERM 4 times; its 3 retries are spent");
			expect(marks(w, A, "spawn-probe")).toEqual([]);
			expect(w.ledger.slice(slice)!.state).toBe("open");
		} finally {
			holder.exec("ROLLBACK");
			holder.close();
		}
	});
});

describe("the runs lock under test (Guard A, MIGRATION.md item 114)", () => {
	test("a runs.db that is a symlink into a live ledger root is refused, and its target is left as it was", () => {
		const live = tmp("runner-live");
		const target = join(live, "ledger.db");
		const db = new Database(target, { create: true });
		db.exec("CREATE TABLE t (x)");
		db.close();
		const bytes = readFileSync(target);
		const root = tmp("runner-runs");
		roots.push(live, root);
		symlinkSync(target, join(root, "runs.db"));
		const was = process.env.AS2_TEST_LIVE_ROOTS;
		process.env.AS2_TEST_LIVE_ROOTS = live;
		try {
			expect(() => openLockDb(root, 0)).toThrow(LiveLedgerUnderTestError);
		} finally {
			if (was === undefined) delete process.env.AS2_TEST_LIVE_ROOTS;
			else process.env.AS2_TEST_LIVE_ROOTS = was;
		}
		expect(readFileSync(target).equals(bytes)).toBe(true);
	});
});
