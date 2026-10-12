#!/usr/bin/env bun
// The outside-the-fence test runner (MIGRATION.md item 24; plan of wl-muraerdsgw7gn4, revision 12,
// § 2.2 to § 2.4). One Bun file with two subcommands; every decision it makes is surface/src/test-run.ts's.
//
//   start <wl> <pr> [--slice <id>] --requested-by <laneId>
//       the starter `lane_full_test` execs (30 s): the workload's repo is served, the PR is open, same
//       repo and on a branch the workload is bound to (every `gh` call names `-R`); then one ledger
//       transaction settles dead runs, adds the full-suite slice when none was named and writes
//       `test-requested:`; then `run` is spawned detached. Prints
//       `test-run <run id> runner <pid> sha <head> slice <slice> log <path>`, exit 0. A refusal is one
//       stderr line `test-runner start: <reason>` and exit 2; a failure the same, exit 3; usage exit 1.
//   run <run id>
//       the detached run: heartbeat at once, the runs.db lock (queued while another run holds it),
//       `current` published in the acquiring transaction, sweep, preflight, retention, the trusted
//       clone and bundle, then every untrusted step through `sudo -n -u _as2test <exec> …`, a sweep
//       after each part, the head re-check, one `test-run:` entry and the settle in one ledger
//       transaction, the lock released.
//
// Stamps: everything is written as `test-runner` (TEST_RUNNER_BY).
//
// Test-only knobs (the fence's tests set them; Jo's environment never does, and none crosses the
// wrapper's `env -i`):
//   AGENT_SYSTEM_TEST_RUNS                  the runs root (plan § 2.3 step 1; also read by the lane)
//   AGENT_SYSTEM_TEST_RUNNER_CONFIG         a yml replacing <checkout>/profile/config.yml
//   AGENT_SYSTEM_TEST_RUNNER_ORIGIN         the URL cloned and ls-remoted instead of the repo's origin
//   AGENT_SYSTEM_TEST_RUNNER_ROOT           the as2test root instead of AS2TEST_ROOT
//   AGENT_SYSTEM_TEST_RUNNER_INSTALL        json {libexec, sudoers, ids: {root, wheel, jo}, account: {uid, gid}}: a test
//                                           install the preflight checks instead of the real one (`installSpec`)
//   AGENT_SYSTEM_TEST_RUNNER_HEARTBEAT_MS   the heartbeat period (default 15 s)
//   AGENT_SYSTEM_TEST_RUNNER_POLL_MS        the lock wait's poll (default 2 s)
//   AGENT_SYSTEM_TEST_RUNNER_BUSY_MS        runs.db busy_timeout (default 5 s)
//   AGENT_SYSTEM_TEST_HOOKS                 a directory of pause/mark files at named boundaries (`hook`)
import { spawn, spawnSync } from "bun";
import { Database } from "bun:sqlite";
import {
	appendFileSync, chmodSync, closeSync, constants as FS, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync,
	rmSync, type Stats, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertNotLiveLedgerUnderTest, defaultLedgerPath, Ledger, TEST_RUNNER_BY, type WorkloadStatusRow } from "../../ledger/src/index";
import {
	AS2TEST_LIBEXEC, AS2TEST_SUDOERS, type DsclRead, installDecision, type OwnerIds, preflightDecision, preflightProbes, probeCall, probeDecision, readInstall,
} from "../src/as2test";
import { repoOf } from "../src/decision-log";
import { holdersOf, worktreePath } from "../src/launch";
import {
	AS2TEST_ROOT, AS2TEST_USER, boundBranches, buildTestRun, changedTestFiles, decideRun, fullSuiteSlice, HEARTBEAT_EVERY_MS, heartbeatText, KEEP_RUNS,
	lockHolderStale, makeRunId, notifiesOrchestrator, ownsRequest, parseHeartbeat, parseTestRequested, type PartInput, type PartResult, partResult, prAdmissible,
	type PrView, pruneRuns, queuedTooLong, reportCapBytes, reservation, resultJson, RUN_ID_RE, type RunFacts, runDirOf, runnerDiedRun, runsDbOf, runsRoot,
	servedRepo, settleArtifact, stageDirOf, type TestRequested, type TestRun, testRequestedBody, testRunBody, testRunFailedBody, testRunFailedOf,
	type TestRunnerConfig, testRunnerConfig, testRuns, workDirOf, WRAPPER_EXIT, type WrapperCall, wrapperArgv,
} from "../src/test-run";
import { ORCHESTRATOR_RECIPIENT } from "../src/types";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** The starter's exit codes (S3 maps them): a refusal is the request's fault, a failure the machine's. */
export const START_EXIT = { ok: 0, usage: 1, refused: 2, failed: 3 } as const;
/** A sweep that ends by a signal is retried this many times while the lock row and `current` still name the run (§ 2.3 step 1). */
export const SWEEP_RETRIES = 3;
/** The wrapper outliving its own cap by this much makes the runner sweep (§ 2.3 step 3). */
const OUTLIVE_MS = 60_000;

const msEnv = (name: string, fallback: number): number => {
	const n = Number(process.env[name]);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Where the preflight finds the install it checks, and the ids its owners must carry. */
export interface InstallSpec {
	libexec: string;
	sudoers: string;
	ids: OwnerIds;
	/** The account reader; undefined is the real `dscl`. */
	dscl?: DsclRead;
}

/** The real install (root-owned, Jo's uid), or the test install AGENT_SYSTEM_TEST_RUNNER_INSTALL describes; the wrapper is `<libexec>/exec` either way. */
export function installSpec(env: Record<string, string | undefined> = process.env): InstallSpec {
	const raw = env.AGENT_SYSTEM_TEST_RUNNER_INSTALL;
	if (!raw) return { libexec: AS2TEST_LIBEXEC, sudoers: AS2TEST_SUDOERS, ids: { root: 0, wheel: 0, jo: process.getuid!() } };
	const v = JSON.parse(raw) as { libexec?: unknown; sudoers?: unknown; ids?: Partial<OwnerIds>; account?: { uid?: unknown; gid?: unknown } };
	const nat = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
	const { uid, gid } = v.account ?? {};
	if (typeof v.libexec !== "string" || typeof v.sudoers !== "string" || !v.ids || !nat(v.ids.root) || !nat(v.ids.wheel) || !nat(v.ids.jo) || !nat(uid) || !nat(gid)) {
		throw new Fail("AGENT_SYSTEM_TEST_RUNNER_INSTALL is not {libexec, sudoers, ids: {root, wheel, jo}, account: {uid, gid}}", START_EXIT.failed);
	}
	const dscl: DsclRead = (record, key) => {
		if (record === `/Users/${AS2TEST_USER}`) return key === "UniqueID" ? uid : key === "PrimaryGroupID" ? gid : null;
		return record === `/Groups/${AS2TEST_USER}` && key === "PrimaryGroupID" ? gid : null;
	};
	return { libexec: v.libexec, sudoers: v.sudoers, ids: { root: v.ids.root, wheel: v.ids.wheel, jo: v.ids.jo }, dscl };
}

class Fail extends Error {
	constructor(message: string, readonly code: number) {
		super(message);
	}
}
/** A run-level failure: the verdict is `error` with this reason. */
class Stop extends Error {}
/** The run lost its lock or its request: it writes `superseded` and settles nothing. */
class Superseded extends Error {}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const isBusy = (e: unknown): boolean => e instanceof Error && "code" in e && typeof e.code === "string" && e.code.startsWith("SQLITE_BUSY");

function openLedger(): Ledger {
	try {
		return Ledger.open(defaultLedgerPath(process.env));
	} catch (e) {
		throw new Fail(`the ledger could not be opened: ${errText(e)}`, START_EXIT.failed);
	}
}

/** The profile's `testRunner:` block from the checkout this script runs from (§ 6 S8), or the test override. */
export function loadConfig(env: Record<string, string | undefined> = process.env): TestRunnerConfig {
	const path = env.AGENT_SYSTEM_TEST_RUNNER_CONFIG || join(REPO_ROOT, "profile", "config.yml");
	let doc: unknown;
	try {
		doc = Bun.YAML.parse(readFileSync(path, "utf8"));
	} catch (e) {
		throw new Fail(`the profile ${path} could not be read: ${errText(e)}`, START_EXIT.failed);
	}
	const c = testRunnerConfig(doc);
	if (!c.ok) throw new Fail(`the profile ${path}: ${c.error}`, START_EXIT.failed);
	return c.config;
}

/** `git -C <repo> config --get remote.origin.url`, or null. */
function originOf(repo: string): string | null {
	const r = spawnSync(["git", "-C", repo, "config", "--get", "remote.origin.url"], { stdout: "pipe", stderr: "pipe" });
	const out = r.stdout.toString().trim();
	return r.exitCode === 0 && out ? out : null;
}

/** The repo, its `owner/repo` and the URL the run clones (the origin, or the test override). */
function servedOf(ledger: Ledger, wl: string, config: TestRunnerConfig): { repo: string; ownerRepo: string; url: string } {
	const repo = repoOf(ledger, wl);
	if (!repo) throw new Fail(`${wl} has no repo: entry`, START_EXIT.refused);
	const origin = originOf(repo);
	if (!origin) throw new Fail(`${repo} has no origin remote`, START_EXIT.refused);
	const served = servedRepo(config, origin);
	if (!served) throw new Fail(`the test runner does not serve ${origin} (profile testRunner.repos)`, START_EXIT.refused);
	return { repo, ownerRepo: served.origin, url: process.env.AGENT_SYSTEM_TEST_RUNNER_ORIGIN || origin };
}

/** The heartbeat file's time for a run, or null when it has none or it does not parse. */
export function heartbeatOf(root: string, runId: string): number | null {
	try {
		return parseHeartbeat(readFileSync(join(runDirOf(root, runId), "heartbeat"), "utf8"), runId);
	} catch {
		return null;
	}
}

// ---- test hooks ---------------------------------------------------------------------------------

/**
 * A named boundary. With AGENT_SYSTEM_TEST_HOOKS set, every pass appends a line to
 * `<dir>/<run id>.<point>.marks`; when `<dir>/<run id>.<point>.pause` exists, it writes
 * `.reached` and waits for `.go`, then removes all three (one pause per arming). Unset, it is inert.
 */
function hookMark(runId: string, point: string, info: Record<string, unknown> = {}): { base: string } | null {
	const dir = process.env.AGENT_SYSTEM_TEST_HOOKS;
	if (!dir) return null;
	const base = join(dir, `${runId}.${point}`);
	appendFileSync(`${base}.marks`, `${JSON.stringify({ at: Date.now(), pid: process.pid, ...info })}\n`);
	return { base };
}
function hookResume(base: string): void {
	for (const s of [".pause", ".go", ".reached"]) rmSync(base + s, { force: true });
}
/** The synchronous form, for a boundary inside an open SQLite transaction. */
function hookSync(runId: string, point: string, info: Record<string, unknown> = {}): void {
	const h = hookMark(runId, point, info);
	if (!h || !existsSync(`${h.base}.pause`)) return;
	writeFileSync(`${h.base}.reached`, JSON.stringify({ pid: process.pid, at: Date.now(), ...info }));
	while (!existsSync(`${h.base}.go`)) Bun.sleepSync(25);
	hookResume(h.base);
}
async function hook(runId: string, point: string, info: Record<string, unknown> = {}): Promise<void> {
	const h = hookMark(runId, point, info);
	if (!h || !existsSync(`${h.base}.pause`)) return;
	writeFileSync(`${h.base}.reached`, JSON.stringify({ pid: process.pid, at: Date.now(), ...info }));
	while (!existsSync(`${h.base}.go`)) await Bun.sleep(25);
	hookResume(h.base);
}

// ---- the runs lock (§ 2.3 step 1) ------------------------------------------------------------------

export interface LockRow {
	runId: string;
	pid: number;
	pgid: number;
	runDir: string;
	heartbeatAt: number;
}

/** `<root>/runs.db` with its one-row lock table; busy_timeout first. */
export function openLockDb(root: string, busyMs: number = msEnv("AGENT_SYSTEM_TEST_RUNNER_BUSY_MS", 5_000)): Database {
	// Under test, a runs root inside a live ledger root is refused before anything is created there.
	assertNotLiveLedgerUnderTest(root);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const db = new Database(runsDbOf(root), { create: true, strict: true });
	db.exec(`PRAGMA busy_timeout = ${Math.trunc(busyMs)}`);
	busyLoop(() => db.exec(
		"CREATE TABLE IF NOT EXISTS lock (id INTEGER PRIMARY KEY CHECK (id = 1), runId TEXT NOT NULL, pid INTEGER NOT NULL, pgid INTEGER NOT NULL, runDir TEXT NOT NULL, heartbeatAt INTEGER NOT NULL)",
	));
	return db;
}

export const lockRow = (db: Database): LockRow | null => db.query<LockRow, []>("SELECT runId, pid, pgid, runDir, heartbeatAt FROM lock WHERE id = 1").get();

/** Retry `fn` on SQLITE_BUSY (each attempt already waited busy_timeout). */
function busyLoop<T>(fn: () => T, attempts = 12): T {
	for (let i = 0; ; i++) {
		try {
			return fn();
		} catch (e) {
			if (!isBusy(e) || i + 1 >= attempts) throw e;
			Bun.sleepSync(50);
		}
	}
}

/** `<stage>/current` := `<run id>\n`, by an atomic rename of a 0640 temp file. Call only inside a runs.db transaction that holds the row for `runId`. */
function writeCurrent(stageRoot: string, runId: string): void {
	const tmp = join(stageRoot, `.current.${runId}.${process.pid}`);
	writeFileSync(tmp, `${runId}\n`, { mode: 0o640 });
	chmodSync(tmp, 0o640);
	renameSync(tmp, join(stageRoot, "current"));
}

/**
 * The guarded publication (§ 2.3 step 1, "Publishing `current`, linearized"): in one BEGIN IMMEDIATE
 * transaction, publish only when the lock row holds `runId`. A displaced runner publishes nothing,
 * and SQLite orders this after any takeover's own publication. Returns whether it published.
 */
export function publishIfOwner(db: Database, stageRoot: string, runId: string): boolean {
	return busyLoop(() => db.transaction(() => {
		if (lockRow(db)?.runId !== runId) return false;
		writeCurrent(stageRoot, runId);
		return true;
	}).immediate());
}

// ---- the report import (§ 2.2 step 4) -------------------------------------------------------------

/**
 * Copy `<work dir>/<name>` into `<run dir>/<name>` and return its text: opened O_NOFOLLOW|O_NONBLOCK
 * (a symlink fails; a FIFO cannot block), a regular file by fstat on that descriptor, read up to
 * `capBytes`. A missing file is `{ text: null, error: null }`; every refusal names its reason.
 */
export function importReport(workDir: string, runDir: string, name: string, capBytes: number): { text: string | null; error: string | null } {
	let st: Stats;
	try {
		st = lstatSync(workDir);
	} catch {
		return { text: null, error: null };
	}
	if (!st.isDirectory()) return { text: null, error: `${workDir} is not a directory` };
	let fd: number;
	try {
		fd = openSync(join(workDir, name), FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK);
	} catch (e) {
		const code = e instanceof Error && "code" in e ? String(e.code) : "";
		if (code === "ENOENT") return { text: null, error: null };
		if (code === "ELOOP") return { text: null, error: `${name} is a symlink` };
		return { text: null, error: `${name} is unreadable (${code || errText(e)})` };
	}
	try {
		const fs = fstatSync(fd);
		if (!fs.isFile()) return { text: null, error: `${name} is not a regular file` };
		if (fs.size > capBytes) return { text: null, error: `${name} is over the ${capBytes}-byte report cap` };
		const buf = Buffer.alloc(capBytes + 1);
		let n = 0;
		for (;;) {
			const k = readSync(fd, buf, n, buf.length - n, null);
			if (k <= 0) break;
			n += k;
			if (n > capBytes) return { text: null, error: `${name} is over the ${capBytes}-byte report cap` };
		}
		const data = buf.subarray(0, n);
		writeFileSync(join(runDir, name), data, { mode: 0o600 });
		return { text: data.toString("utf8"), error: null };
	} catch (e) {
		return { text: null, error: `${name} is unreadable (${errText(e)})` };
	} finally {
		closeSync(fd);
	}
}

/** One part's junit and log, imported under the same checks; the first refusal makes the part `error`. */
export function importPart(workDir: string, runDir: string, part: string, capBytes: number): Pick<PartInput, "junit" | "log" | "importError"> {
	const junit = importReport(workDir, runDir, `${part}.xml`, capBytes);
	const log = importReport(workDir, runDir, `${part}.log`, capBytes);
	return { junit: junit.text, log: log.text, importError: junit.error ?? log.error };
}

// ---- start ------------------------------------------------------------------------------------------

function ghPrView(ownerRepo: string, pr: number): PrView {
	const r = spawnSync(["gh", "pr", "view", String(pr), "-R", ownerRepo, "--json", "number,state,headRefOid,headRefName,baseRefName,isCrossRepository"], {
		stdout: "pipe", stderr: "pipe", timeout: 15_000,
	});
	if (r.exitCode !== 0) {
		const why = r.exitedDueToTimeout ? "timed out" : r.stderr.toString().trim().split("\n").at(-1) || `exit ${r.exitCode}`;
		throw new Fail(`gh pr view ${pr} -R ${ownerRepo} failed: ${why}`, START_EXIT.failed);
	}
	let v: Record<string, unknown>;
	try {
		v = JSON.parse(r.stdout.toString()) as Record<string, unknown>;
	} catch {
		throw new Fail(`gh pr view ${pr} -R ${ownerRepo} did not return json`, START_EXIT.failed);
	}
	if (typeof v.number !== "number" || typeof v.state !== "string" || typeof v.headRefOid !== "string" || typeof v.headRefName !== "string" ||
		typeof v.baseRefName !== "string" || typeof v.isCrossRepository !== "boolean") {
		throw new Fail(`gh pr view ${pr} -R ${ownerRepo} returned an unexpected shape`, START_EXIT.failed);
	}
	if (v.number !== pr) throw new Fail(`gh pr view ${pr} answered for PR #${v.number}`, START_EXIT.failed);
	return v as unknown as PrView;
}

/** After a reservation, a run that cannot proceed (no runner spawned, no profile to run under) gets its `error` result, while it still owns its request. */
function recordError(ledger: Ledger, wl: string, request: TestRequested, runDir: string, reason: string): void {
	ledger.write(() => {
		if (!ownsRequest(testRuns(ledger.entries(wl)), request.runId)) return;
		const run: TestRun = { ...runnerDiedRun(request, runDir), reason };
		ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: request.slice, kind: "assumption", body: testRunBody(run) });
	});
}

function cmdStart(wl: string, pr: number, sliceArg: string | null, by: string): number {
	const ledger = openLedger();
	const w = ledger.workload(wl);
	if (!w || w.status !== "open") throw new Fail(`no open workload ${wl}`, START_EXIT.refused);
	const config = loadConfig();
	const { ownerRepo } = servedOf(ledger, wl, config);
	const view = ghPrView(ownerRepo, pr);
	const entries = ledger.entries(wl);
	const bound = boundBranches(wl, entries, holdersOf(entries, w.holder, ledger.holders(wl)));
	const admissible = prAdmissible(view, bound);
	if (!admissible.ok) throw new Fail(admissible.reason, START_EXIT.refused);

	const root = runsRoot(process.env);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const runId = makeRunId(Date.now(), Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join(""));
	const runDir = runDirOf(root, runId);
	const slice = ledger.write(() => {
		const now = Date.parse(ledger.now());
		const res = reservation(testRuns(ledger.entries(wl)), (id) => heartbeatOf(root, id), now);
		if (!res.ok) {
			const live = res.live.request;
			throw new Fail(`run ${live.runId} (PR #${live.pr}, slice ${live.slice}) is live on ${wl}; its test-run: settles it`, START_EXIT.refused);
		}
		let sl: string;
		if (sliceArg !== null) {
			const s = ledger.slice(sliceArg);
			if (!s || s.workload_id !== wl) throw new Fail(`no slice ${sliceArg} on ${wl}`, START_EXIT.refused);
			if (s.state !== "open") throw new Fail(`slice ${sliceArg} is ${s.state}, not open`, START_EXIT.refused);
			sl = s.id;
		} else {
			const f = fullSuiteSlice(wl, pr, ledger.slices(wl).map((s) => s.id));
			sl = ledger.addSlice({ by: TEST_RUNNER_BY, workloadId: wl, id: f.id, task: f.task, doneCondition: f.doneCondition, inputs: `PR #${pr} at ${view.headRefOid}` });
		}
		for (const d of res.settleDead) {
			ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: d.request.slice, kind: "assumption", body: testRunBody(runnerDiedRun(d.request, runDirOf(root, d.request.runId))) });
		}
		ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: sl, kind: "assumption", body: testRequestedBody({ runId, pr, sha: view.headRefOid, slice: sl, by }) });
		return sl;
	});

	const log = join(runDir, "runner.log");
	try {
		mkdirSync(runDir, { recursive: true, mode: 0o700 });
		const fd = openSync(log, "a", 0o600);
		const child = spawn([process.execPath, import.meta.path, "run", runId], {
			cwd: runDir, env: process.env, stdin: "ignore", stdout: fd, stderr: fd, detached: true,
		});
		child.unref();
		closeSync(fd);
		writeFileSync(join(runDir, "runner.json"), `${JSON.stringify({ pid: child.pid, pgid: child.pid, runId })}\n`, { mode: 0o600 });
		process.stdout.write(`test-run ${runId} runner ${child.pid} sha ${view.headRefOid} slice ${slice} log ${log}\n`);
		return START_EXIT.ok;
	} catch (e) {
		const reason = `the runner did not start: ${errText(e)}`;
		try {
			recordError(ledger, wl, { runId, pr, sha: view.headRefOid, slice, by }, runDir, reason);
		} catch (e2) {
			process.stderr.write(`test-runner start: the failure could not be recorded: ${errText(e2)}\n`);
		}
		throw new Fail(reason, START_EXIT.failed);
	}
}

// ---- run --------------------------------------------------------------------------------------------

/** The `test-requested:` the runner wrote for `runId`, and its workload. */
function findRequest(ledger: Ledger, runId: string): { workloadId: string; request: TestRequested } | null {
	const rows = ledger.db.query<{ workload_id: string; body: string }, [string, string]>(
		"SELECT workload_id, body FROM entries WHERE kind = 'assumption' AND created_by = ? AND body LIKE ? ORDER BY created_at, rowid",
	).all(TEST_RUNNER_BY, `test-requested: ${runId} %`);
	for (const r of rows) {
		const req = parseTestRequested(r.body);
		if (req && req.runId === runId) return { workloadId: r.workload_id, request: req };
	}
	return null;
}

/** git for the trusted phase: no system config, an empty global config, no inherited GIT_* variable, no prompt. */
function trustedEnv(gitconfig: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("GIT_")) env[k] = v;
	return { ...env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: gitconfig, GIT_TERMINAL_PROMPT: "0" };
}
const NO_HOOKS = ["-c", "core.hooksPath=/dev/null"];
/** The network commands' extra settings (§ 2.3 step 2): no template, and only the keychain helper. */
const NETWORK = [...NO_HOOKS, "-c", "init.templateDir=", "-c", "credential.helper=", "-c", "credential.helper=osxkeychain"];

/** One command, stdout verbatim: never trimmed, since NUL-delimited output (`git diff -z`) may begin or end with a path's own whitespace. */
async function run(cmd: string[], o: { cwd: string; env: Record<string, string>; timeoutMs: number }): Promise<{ code: number | null; out: string; err: string }> {
	const p = spawn(cmd, { cwd: o.cwd, env: o.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const timer = setTimeout(() => p.kill("SIGKILL"), o.timeoutMs);
	const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
	await p.exited;
	clearTimeout(timer);
	return { code: p.exitCode, out, err: err.trim() };
}

type Wrapped = { code: number | null; signal: string | null; out: string };

class Runner {
	readonly root = runsRoot(process.env);
	readonly runDir: string;
	readonly as2root = process.env.AGENT_SYSTEM_TEST_RUNNER_ROOT || AS2TEST_ROOT;
	readonly install = installSpec();
	readonly exec = join(this.install.libexec, "exec");
	private repo = "";
	readonly stageRoot: string;
	readonly stage: string;
	readonly workDir: string;
	readonly lockDb: Database;
	readonly capBytes: number;
	private timer: Timer | undefined;
	/** The run took the lock row at some point. */
	private held = false;
	/** The run learnt it no longer holds the row (heartbeat or checkpoint) or its request. */
	private superseded: string | null = null;
	private soloCalls = 0;
	private url = "";
	private readonly f: RunFacts & { base: string | null; mergeBase: string | null; preflight: string | null };

	constructor(readonly ledger: Ledger, readonly wl: string, readonly request: TestRequested, readonly config: TestRunnerConfig) {
		this.runDir = runDirOf(this.root, request.runId);
		this.stageRoot = join(this.as2root, "stage");
		this.stage = stageDirOf(request.runId, this.as2root);
		this.workDir = workDirOf(request.runId, this.as2root);
		this.lockDb = openLockDb(this.root);
		this.capBytes = reportCapBytes(config);
		this.f = {
			requestedSha: request.sha, fetchedSha: null, error: null, full: null, solo: [], headAtStart: request.sha, headAtEnd: null, owner: true, sliceState: null,
			base: null, mergeBase: null, preflight: null,
		};
	}

	get id(): string {
		return this.request.runId;
	}

	log(s: string): void {
		process.stdout.write(`${new Date().toISOString()} ${s}\n`);
	}

	/** One tick of the 15 s timer (§ 2.2 step 4): the heartbeat file, then the lock row's heartbeatAt by this run's own id. */
	beat(): void {
		const now = Date.now();
		try {
			const tmp = join(this.runDir, `.heartbeat.${process.pid}`);
			writeFileSync(tmp, heartbeatText(this.id, now), { mode: 0o600 });
			renameSync(tmp, join(this.runDir, "heartbeat"));
		} catch (e) {
			this.log(`heartbeat file not written: ${errText(e)}`);
		}
		if (!this.held || this.superseded) return;
		hookSync(this.id, "heartbeat-update");
		try {
			const changes = this.lockDb.query("UPDATE lock SET heartbeatAt = ? WHERE runId = ?").run(Date.now(), this.id).changes;
			hookMark(this.id, "heartbeat", { changes });
			if (changes === 0) this.lose("the lock row no longer holds this run (heartbeat updated no row)");
		} catch (e) {
			this.log(`lock heartbeat not written: ${errText(e)}`);
		}
	}

	private lose(why: string): void {
		if (!this.superseded) {
			this.superseded = why;
			this.log(`superseded: ${why}`);
		}
	}

	/** Wait for the lock (queued), take it clean or from a stale holder, and publish `current` in that same transaction. */
	async acquire(): Promise<void> {
		const waitStart = Date.now();
		const pollMs = msEnv("AGENT_SYSTEM_TEST_RUNNER_POLL_MS", 2_000);
		mkdirSync(this.stageRoot, { recursive: true });
		for (;;) {
			let took: { displaced: string | null } | null = null;
			try {
				took = this.lockDb.transaction(() => {
					const row = lockRow(this.lockDb);
					if (row && row.runId !== this.id && !lockHolderStale(row.heartbeatAt, Date.now())) return null;
					this.lockDb.query("INSERT OR REPLACE INTO lock (id, runId, pid, pgid, runDir, heartbeatAt) VALUES (1, ?, ?, ?, ?, ?)")
						.run(this.id, process.pid, process.pid, this.runDir, Date.now());
					writeCurrent(this.stageRoot, this.id);
					hookSync(this.id, "acquire-tx");
					return { displaced: row && row.runId !== this.id ? row.runId : null };
				}).immediate();
			} catch (e) {
				if (!isBusy(e)) throw e;
				hookMark(this.id, "acquire-busy");
			}
			if (took) {
				this.held = true;
				hookMark(this.id, "acquired", took);
				this.log(took.displaced ? `took the lock from the stale holder ${took.displaced}` : "took the lock");
				this.beat();
				return;
			}
			if (queuedTooLong(waitStart, Date.now(), this.config)) throw new Stop("queued too long");
			hookMark(this.id, "queued");
			await Bun.sleep(pollMs);
		}
	}

	/** Before each phase and wrapper call (§ 2.3 step 1, losing the lock): the row still holds this run, and `current` is (re)published under that check. */
	async checkpoint(phase: string): Promise<void> {
		await hook(this.id, `phase-${phase}`);
		if (this.superseded) throw new Superseded(this.superseded);
		if (!publishIfOwner(this.lockDb, this.stageRoot, this.id)) {
			this.lose(`the lock row holds ${lockRow(this.lockDb)?.runId ?? "no run"}`);
			throw new Superseded(this.superseded!);
		}
	}

	/**
	 * One wrapper call: `sudo -n -u _as2test <exec> <sub> <run id> …` (wrapperArgv). Its stderr goes to runner.log; stdout is captured and echoed there.
	 * It starts in the as2test root, which `_as2test` can read: the run dir is Jo's 0700 dir, and a cwd the child cannot read kills bun on getcwd.
	 */
	async wrap(call: WrapperCall, capMs: number | null = null): Promise<Wrapped> {
		const argv = wrapperArgv(call, this.exec);
		const p = spawn(argv, { cwd: this.as2root, env: process.env, stdin: "ignore", stdout: "pipe", stderr: "inherit" });
		hookMark(this.id, `spawn-${call.sub}`, { pid: p.pid });
		let outlived = false;
		const watchdog = capMs === null ? null : setTimeout(() => {
			outlived = true;
			this.log(`${call.sub} outlived its cap by ${OUTLIVE_MS / 1000} s; sweeping`);
			void this.wrap({ sub: "sweep", runId: this.id }).catch((e) => this.log(`the outlive sweep failed: ${errText(e)}`));
		}, capMs + OUTLIVE_MS);
		const out = await new Response(p.stdout).text();
		await p.exited;
		clearTimeout(watchdog ?? undefined);
		if (out.trim()) process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
		const r = { code: p.exitCode, signal: p.signalCode ?? null, out };
		this.log(`${argv.slice(4).join(" ")} → ${r.signal ?? `exit ${r.code}`}${outlived ? " (after the outlive sweep)" : ""}`);
		return r;
	}

	/** A fenced exit (77) while this run believes it holds the lock: the checkpoint decides whether it was displaced. */
	private async fenced(what: string): Promise<never> {
		await this.checkpoint("fenced");
		throw new Stop(`${what} was fenced although the lock row holds this run`);
	}

	/** `sweep`, retried after a signal at most SWEEP_RETRIES times while the row and `current` still name this run (§ 2.3 step 1). */
	async sweep(after: string): Promise<void> {
		for (let attempt = 0; ; attempt++) {
			await this.checkpoint("sweep");
			hookMark(this.id, "sweep", { after, attempt });
			const r = await this.wrap({ sub: "sweep", runId: this.id });
			if (r.code === WRAPPER_EXIT.ok) return;
			if (r.code === WRAPPER_EXIT.fenced) await this.fenced("the sweep");
			if (r.signal !== null && attempt < SWEEP_RETRIES) {
				this.log(`the sweep after ${after} ended by ${r.signal}; retry ${attempt + 1} of ${SWEEP_RETRIES}`);
				continue;
			}
			if (r.code === WRAPPER_EXIT.sweepLockHeld) throw new Stop("sweep lock held");
			throw new Stop(r.signal !== null
				? `the sweep after ${after} ended by ${r.signal} ${attempt + 1} times; its ${SWEEP_RETRIES} retries are spent`
				: `the sweep after ${after} failed: exit ${r.code}`);
		}
	}

	/** The preflight (§ 3.1): the install checks, then `probe` over the paths the runner itself resolved; the first failure is the run's `error`. */
	async preflight(): Promise<void> {
		await this.checkpoint("preflight");
		const spec = this.install;
		const install = installDecision(readInstall({ checkout: REPO_ROOT, libexec: spec.libexec, root: this.as2root, sudoers: spec.sudoers, dscl: spec.dscl }), spec.ids);
		if (!install.ok) {
			this.f.preflight = `preflight: ${install.reason}`;
			throw new Stop(this.f.preflight);
		}
		const items = preflightProbes({ env: process.env, runsRoot: this.root, mainCheckout: this.repo, lanesRoot: dirname(worktreePath(this.repo, this.wl)), root: this.as2root });
		const r = await this.wrap(probeCall(this.id, items));
		if (r.code === WRAPPER_EXIT.fenced) await this.fenced("the probe");
		const v = preflightDecision(install, probeDecision(items, r.signal !== null ? null : r.code, r.out));
		this.f.preflight = v.ok ? v.summary : v.reason;
		if (!v.ok) throw new Stop(v.reason);
	}

	/** Retention (§ 2.3 step 9): the newest KEEP_RUNS stay whole; older ones lose their stage dir, their work dir (fenced `cleanup`) and the run dir's scratch files. */
	async retention(): Promise<void> {
		const ids = new Set<string>([this.id]);
		for (const dir of [this.root, this.stageRoot, join(this.as2root, "runs")]) {
			try {
				for (const n of readdirSync(dir)) if (RUN_ID_RE.test(n)) ids.add(n);
			} catch {
				// a root that does not exist yet holds no runs
			}
		}
		const at = (id: string): number => parseInt(id.slice(3, 12), 36) || 0;
		const prune = pruneRuns([...ids].map((id) => ({ id, at: at(id) })), KEEP_RUNS).filter((id) => id !== this.id);
		for (const old of prune) {
			rmSync(stageDirOf(old, this.as2root), { recursive: true, force: true });
			if (existsSync(workDirOf(old, this.as2root))) {
				await this.checkpoint("cleanup");
				const r = await this.wrap({ sub: "cleanup", runId: this.id, oldRunId: old });
				if (r.code === WRAPPER_EXIT.fenced) await this.fenced("cleanup");
				if (r.code !== WRAPPER_EXIT.ok) this.log(`cleanup of ${old} failed: ${r.signal ?? `exit ${r.code}`}`);
			}
			const dir = join(this.root, old);
			try {
				for (const n of readdirSync(dir)) if (!/\.(xml|log)$/.test(n) && n !== "result.json") rmSync(join(dir, n), { recursive: true, force: true });
			} catch {
				// no run dir for this id
			}
		}
	}

	/** The trusted phase (§ 2.3 step 2): clone, fetch, the sha check, checkout, base, changed files, the bundle. Null when the fetched head is not the requested sha. */
	async trusted(): Promise<string[] | null> {
		await this.checkpoint("trusted");
		const repo = join(this.stage, "repo");
		rmSync(this.stage, { recursive: true, force: true });
		mkdirSync(repo, { recursive: true, mode: 0o750 });
		const gitconfig = join(this.runDir, "trusted.gitconfig");
		writeFileSync(gitconfig, "", { mode: 0o600 });
		const env = trustedEnv(gitconfig);
		/** A git step whose output is one object name (or nothing), trimmed. */
		const git = async (args: string[], what: string): Promise<string> => {
			const r = await run(["git", ...args], { cwd: repo, env, timeoutMs: 600_000 });
			if (r.code !== 0) throw new Stop(`${what} failed: ${r.err.split("\n").at(-1) || `exit ${r.code}`}`);
			return r.out.trim();
		};
		const { request: q } = this;
		await git([...NETWORK, "clone", "-q", "--no-checkout", this.url, "."], "git clone");
		await git([...NETWORK, "fetch", "-q", "origin", `+refs/pull/${q.pr}/head:refs/remotes/origin/pr/${q.pr}`, "+refs/heads/main:refs/remotes/origin/main"], "git fetch");
		this.f.fetchedSha = await git([...NO_HOOKS, "rev-parse", "--verify", `refs/remotes/origin/pr/${q.pr}^{commit}`], "reading the PR head");
		if (this.f.fetchedSha !== q.sha) return null;
		await git([...NO_HOOKS, "checkout", "-q", "--detach", q.sha], "git checkout");
		this.f.headAtStart = await git([...NO_HOOKS, "rev-parse", "HEAD"], "reading HEAD");
		this.f.base = await git([...NO_HOOKS, "rev-parse", "--verify", "refs/remotes/origin/main^{commit}"], "reading origin/main");
		this.f.mergeBase = await git([...NO_HOOKS, "merge-base", q.sha, "refs/remotes/origin/main"], "git merge-base");
		const diff = await run(["git", ...NO_HOOKS, "diff", "--name-only", "-z", "--diff-filter=AMR", this.f.mergeBase, q.sha], { cwd: repo, env, timeoutMs: 120_000 });
		if (diff.code !== 0) throw new Stop(`git diff failed: ${diff.err.split("\n").at(-1) || `exit ${diff.code}`}`);
		const changed = changedTestFiles(diff.out);
		await git([...NO_HOOKS, "remote", "remove", "origin"], "git remote remove");
		// The tested commit as a branch, so the bundle carries it whatever HEAD's handling.
		await git([...NO_HOOKS, "update-ref", `refs/heads/as2-tested-pr-${q.pr}`, q.sha], "naming the tested commit");
		const bundle = join(this.stage, "repo.bundle");
		await git([...NO_HOOKS, "bundle", "create", "-q", bundle, "--all"], "git bundle create");
		chmodSync(bundle, 0o640);
		const caps = join(this.stage, "caps.json");
		writeFileSync(caps, `${JSON.stringify({ fullCapMin: this.config.fullCapMin, soloCapMin: this.config.soloCapMin })}\n`, { mode: 0o640 });
		chmodSync(caps, 0o640);
		chmodSync(this.stage, 0o750);
		this.log(`trusted phase: ${q.sha} on base ${this.f.base}, merge-base ${this.f.mergeBase}; changed test files: ${changed.join(" ") || "none"}`);
		return changed;
	}

	async prepare(): Promise<void> {
		await this.checkpoint("prepare");
		const r = await this.wrap({ sub: "prepare", runId: this.id, sha: this.request.sha });
		if (r.code === WRAPPER_EXIT.fenced) await this.fenced("prepare");
		if (r.code !== WRAPPER_EXIT.ok) throw new Stop(`prepare failed: ${r.signal ?? `exit ${r.code}`}`);
	}

	/** One part through the wrapper, then its junit and log imported into the run dir and read into a result. */
	async part(call: { sub: "full" } | { sub: "solo"; file: string }): Promise<PartResult> {
		await this.checkpoint(call.sub === "full" ? "full" : "solo");
		const capMs = (call.sub === "full" ? this.config.fullCapMin : this.config.soloCapMin) * 60_000;
		const started = Date.now();
		const r = await this.wrap(call.sub === "full" ? { sub: "full", runId: this.id } : { sub: "solo", runId: this.id, file: call.file }, capMs);
		const ms = Date.now() - started;
		if (r.code === WRAPPER_EXIT.fenced) await this.fenced(call.sub);
		let name = "full";
		if (call.sub === "solo") {
			this.soloCalls++;
			name = /^part (solo-\d+)$/m.exec(r.out)?.[1] ?? `solo-${this.soloCalls}`;
		}
		if (r.code === WRAPPER_EXIT.refused || r.code === WRAPPER_EXIT.failed) {
			return { ...partResult({ junit: null, log: null, exit: r.code, ms }), error: `the wrapper ${r.code === WRAPPER_EXIT.refused ? "refused" : "failed"} ${call.sub} (exit ${r.code})` };
		}
		const imported = importPart(this.workDir, this.runDir, name, this.capBytes);
		return partResult({ ...imported, exit: r.signal !== null ? null : r.code, ms, timedOut: r.code === WRAPPER_EXIT.timeout, maxBytes: this.capBytes });
	}

	/** `git ls-remote <origin> refs/pull/<N>/head` with the trusted settings (§ 2.3 step 5); null when it cannot answer. */
	async headNow(): Promise<string | null> {
		const pr = this.request.pr;
		const r = await run(["git", ...NETWORK, "ls-remote", this.url, `refs/pull/${pr}/head`], {
			cwd: this.runDir, env: trustedEnv(join(this.runDir, "trusted.gitconfig")), timeoutMs: 120_000,
		});
		if (r.code !== 0) {
			this.log(`ls-remote failed: ${r.err.split("\n").at(-1) || `exit ${r.code}`}`);
			return null;
		}
		return new RegExp(`^([0-9a-f]{40})\\trefs/pull/${pr}/head$`, "m").exec(r.out)?.[1] ?? null;
	}

	/** Steps in the plan's order: lock and publish → sweep → preflight → retention → trusted → prepare → parts with a sweep after each → head re-check. */
	async body(): Promise<void> {
		({ url: this.url, repo: this.repo } = servedOf(this.ledger, this.wl, this.config));
		await this.acquire();
		await this.sweep("publish");
		await this.preflight();
		await this.retention();
		const changed = await this.trusted();
		if (changed === null) return;
		await this.prepare();
		this.f.full = await this.part({ sub: "full" });
		await this.sweep("full");
		for (const file of changed) {
			this.f.solo.push({ file, ...(await this.part({ sub: "solo", file })) });
			await this.sweep(file);
		}
		await hook(this.id, "head-recheck");
		this.f.headAtEnd = await this.headNow();
	}

	/**
	 * The result (§ 2.3 steps 6–8): with the runs.db row held in a BEGIN IMMEDIATE transaction (so no
	 * takeover lands in between), one ledger transaction checks ownership and the slice's state,
	 * decides, writes `test-run:`, settles (completes the slice) when the decision says so and, for a
	 * run that is not green on a workload no lane holds, writes the `test-run-failed:` message. The
	 * settle commits with the check it rests on: no successor request, pause or cancel lands between
	 * them, and a slice that is not open is never touched. Then `result.json`.
	 */
	finish(): TestRun {
		const write = (lockMine: boolean) => this.ledger.write(() => {
			const owner = lockMine && !this.superseded && ownsRequest(testRuns(this.ledger.entries(this.wl)), this.id);
			const facts: RunFacts = { ...this.f, owner, sliceState: this.ledger.slice(this.request.slice)?.state ?? null };
			const decided = decideRun(facts);
			// A run displaced from the lock says so; decideRun's reason alone speaks only of the request.
			const lost = this.superseded ?? (lockMine ? null : `the lock row holds ${lockRow(this.lockDb)?.runId ?? "no run"}`);
			const decision = decided.verdict === "superseded" && lost ? { ...decided, reason: `${lost}; ${decided.reason}` } : decided;
			const run = buildTestRun(this.request, facts, decision, { base: this.f.base, mergeBase: this.f.mergeBase, runDir: this.runDir, preflight: this.f.preflight });
			this.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: this.wl, sliceId: this.request.slice, kind: "assumption", body: testRunBody(run) });
			// decision.settle holds only for an owner whose slice this transaction read as open. The
			// completion is a nested write (a savepoint): a refusal rolls back only itself, and the
			// `test-run:` entry still commits.
			let settled: { ok: true } | { ok: false; reason: string } | null = null;
			if (decision.settle) {
				try {
					this.ledger.completeSlice(this.request.slice, { by: TEST_RUNNER_BY, artifact: settleArtifact(run) });
					settled = { ok: true };
				} catch (e) {
					settled = { ok: false, reason: errText(e) };
				}
			}
			const heldLive = this.ledger.liveLaneHolders().some((h) => h.workloadId === this.wl);
			const failed = notifiesOrchestrator(run.verdict, heldLive) ? testRunFailedOf(this.wl, this.request.slice, run) : null;
			if (failed) {
				this.ledger.enqueue({ by: TEST_RUNNER_BY, workloadId: this.wl, sliceId: this.request.slice, sender: TEST_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: testRunFailedBody(failed) });
			}
			return { run, settled };
		});
		const { run, settled } = this.held
			? busyLoop(() => this.lockDb.transaction(() => write(lockRow(this.lockDb)?.runId === this.id)).immediate())
			: write(true);
		this.log(`test-run ${run.verdict}${run.reason ? `: ${run.reason}` : ""}`);
		if (settled?.ok) this.log(`settled ${this.request.slice}`);
		else if (settled) this.log(`the settle of ${this.request.slice} was refused: ${settled.reason}`);
		try {
			writeFileSync(join(this.runDir, "result.json"), resultJson(run), { mode: 0o600 });
		} catch (e) {
			this.log(`result.json not written: ${errText(e)}`);
		}
		return run;
	}

	async main(): Promise<number> {
		mkdirSync(this.runDir, { recursive: true, mode: 0o700 });
		this.beat();
		this.timer = setInterval(() => this.beat(), msEnv("AGENT_SYSTEM_TEST_RUNNER_HEARTBEAT_MS", HEARTBEAT_EVERY_MS));
		try {
			try {
				await this.body();
			} catch (e) {
				if (e instanceof Superseded) this.lose(e.message);
				else if (e instanceof Stop) this.f.error = e.message;
				else if (e instanceof Fail) this.f.error = e.message;
				else this.f.error = `the runner failed: ${errText(e)}`;
				if (!(e instanceof Superseded)) this.log(`stopped: ${this.f.error}`);
			}
			await hook(this.id, "result");
			this.finish();
			return 0;
		} finally {
			clearInterval(this.timer);
			if (this.held) {
				try {
					busyLoop(() => this.lockDb.query("DELETE FROM lock WHERE runId = ?").run(this.id));
				} catch (e) {
					this.log(`the lock was not released: ${errText(e)}`);
				}
			}
			this.lockDb.close();
		}
	}
}

async function cmdRun(runId: string): Promise<number> {
	process.umask(0o027);
	if (!RUN_ID_RE.test(runId)) throw new Fail(`${runId} is not a run id`, START_EXIT.usage);
	const ledger = openLedger();
	const found = findRequest(ledger, runId);
	if (!found) throw new Fail(`no test-requested: for ${runId}`, START_EXIT.failed);
	const w: WorkloadStatusRow | null = ledger.workload(found.workloadId);
	if (!w) throw new Fail(`no workload ${found.workloadId}`, START_EXIT.failed);
	let config: TestRunnerConfig;
	try {
		config = loadConfig();
	} catch (e) {
		// No caps to run under: the request still gets its error result.
		process.stdout.write(`${new Date().toISOString()} ${errText(e)}\n`);
		recordError(ledger, found.workloadId, found.request, runDirOf(runsRoot(process.env), runId), errText(e));
		return 0;
	}
	return new Runner(ledger, found.workloadId, found.request, config).main();
}

// ---- main ---------------------------------------------------------------------------------------------

const USAGE = "usage: test-runner.ts start <wl> <pr> [--slice <id>] --requested-by <laneId> | run <run id>";

export async function main(argv: string[]): Promise<number> {
	const [cmd, ...rest] = argv;
	if (cmd === "start") {
		const [wl, prArg, ...opts] = rest;
		let slice: string | null = null;
		let by: string | null = null;
		for (let i = 0; i < opts.length; i += 2) {
			const v = opts[i + 1];
			if (opts[i] === "--slice" && v) slice = v;
			else if (opts[i] === "--requested-by" && v) by = v;
			else throw new Fail(USAGE, START_EXIT.usage);
		}
		if (!wl || !/^wl-\S+$/.test(wl) || !prArg || !/^[1-9]\d{0,9}$/.test(prArg) || by === null || !/^[^\s-]\S*$/.test(by)) throw new Fail(USAGE, START_EXIT.usage);
		if (slice !== null && !/^sl-\S+$/.test(slice)) throw new Fail(USAGE, START_EXIT.usage);
		return cmdStart(wl, Number(prArg), slice, by);
	}
	if (cmd === "run" && rest.length === 1) return cmdRun(rest[0]!);
	throw new Fail(USAGE, START_EXIT.usage);
}

if (import.meta.main) {
	const sub = process.argv[2] === "run" ? "run" : "start";
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(err: unknown) => {
			const f = err instanceof Fail ? err : new Fail(errText(err), START_EXIT.failed);
			process.stderr.write(`test-runner ${sub}: ${f.message.replace(/\s+/g, " ")}\n`);
			process.exit(f.code);
		},
	);
}
