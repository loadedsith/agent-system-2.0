#!/usr/bin/env bun
// The outside-the-fence test runner (MIGRATION.md item 24; plan of wl-muraerdsgw7gn4, revision 12,
// § 2.2 to § 2.4). One Bun file with two subcommands; every decision it makes is surface/src/test-run.ts's.
//
//   start <wl> <pr> [--slice <id>] --requested-by <laneId>
//       the starter `lane_full_test` execs (30 s): the workload's repo is served, the PR is open, same
//       repo and on a branch the workload is bound to or a number Jo bound to it with `test-pr` or
//       `train` (`boundPrs`; every `gh` call names `-R`); on a merge train, a PR whose `Depends-on:` PR
//       is not merged or whose base is not main is refused (PLAN wl-mv8s8srodefytc § 1b); then one
//       ledger transaction refuses a PR while Jo's stop holds the merge train (`trainHold`, § 1 D4), settles dead runs, adds
//       the full-suite slice when none was named and writes `test-requested:`; then `run` is spawned
//       detached. Prints `test-run <run id> runner <pid> sha <head> slice <slice> log <path>`, plus
//       ` bound-by <instruction id>` when only Jo's binding admitted the PR, exit 0. A refusal is one
//       stderr line `test-runner start: <reason>` and exit 2; a failure the same, exit 3; usage exit 1.
//       The carried green (PLAN wl-mvpwkpqobyp20w D4): on a merge train, when the PR's last request across the train, its
//       head branch's workload and its fix workloads is green at S and the head is S or past it only by decision-log commits
//       (`ghCompare` before the transaction, the authority re-read in it), the transaction writes `test-requested:` and a green
//       `test-run:` at the head (reason `carried from <R> at <S> (decision-log only)`, R's counts) and settles the slice; no run
//       is spawned, `as2/full-suite` success is posted after the commit, and the line has `runner none`, `log none` and ends ` carried <R>`.
//   run <run id>
//       the detached run: heartbeat at once, the runs.db lock (queued while another run holds it; queued runs take it oldest
//       request first, by their `test-requested:` entry's time in runs.db's `queue` table, skipping dead waiters), `current` published
//       in the acquiring transaction, the install check (a drifted bundle is refreshed once through `sudo -n
//       <libexec>/refresh`), sweep, probe, retention, the trusted clone and bundle, then every untrusted step through
//       `sudo -n -u _as2test <exec> …`, a sweep after each part. After the full part the solo policy (`soloPlan`, PLAN
//       wl-mvq4edh02r5z40 D1) decides what runs alone: a full part that timed out (exit 124, or the outlive sweep fired on it)
//       ends the run there (runner.log `full part timed out: no solo or base parts`; its sweep and the head re-check still run,
//       and the verdict is error naming the timeout); an all-pass full part runs alone only the changed test files its junit ran
//       no test of; a full part with failing tests runs alone only its failing files, never a security test; any other full
//       error runs every changed test file alone but a failing security test. A rerun is diagnostic: it never turns a failure
//       green nor drops it. Then, when every part reported cleanly (`baseParts`, D3), each failing file rerun alone is run alone
//       on base too (`base-solo` in a clone at base's sha, cached per base sha and `./<file>` under <runs root>/base-cache; the
//       full suite never runs on base). After a call that timed out, the wrapper's stuck capture `<part>.stuck.log` is imported
//       into the run dir under the report checks; a missing or refused capture is one runner.log line and changes nothing. Then
//       the head re-check, one `test-run:` entry and the settle
//       in one ledger transaction; then, when the fetch confirmed the requested sha, the `as2/full-suite` commit status on
//       that sha for any PR (green and red-main success, red failure, error error; stale and superseded post none; PLAN
//       wl-mv8s8srodefytc rev 17.1 D2, D8), and the lock released. No `pending` is posted: a missing status already blocks a
//       protected merge. A failed status post is logged and never changes the verdict.
//
//       Parallel files (workload wl-mvg2kzuvwngdmo): the trusted phase writes the profile's `testRunner.fullWorkers` into
//       caps.json beside the caps, and the run logs `<ts> full workers <n>` right before the PR full part; test-exec runs that
//       part with `bun test --parallel=<n>` when n is over 1. Solo parts, on the PR and on base, run one file each.
//       surface/scripts/test-run-waits.ts reads the waits, the `full workers` lines and the results back per day.
//
//       Land-first (PLAN wl-mvq4edbaf13vnk D4): on a land-first repository `start` posts `pending` first (a refused post refuses
//       the request) and records `fast-plan:` in the admission's transaction: a tree carry (no run), the fast set, or the full
//       suite by exception, which runs as above. A fast-set run holds no Mac slot for its hosted part: its preflight (the install
//       read, no refresh), the trusted clone, the parse check over the plan's parse targets (one that does not transpile makes
//       the run red and nothing runs), then `as2-fast.yml` dispatched on `as2-verified` (`hostedFast`); fast.xml, fast.log and
//       fast.summary are imported into the run dir and judged (`fastExec`: a planned file with no executed test makes it red).
//       A dispatch failure, a workflow run of other code than the tag's, or no result in fastWaitMin records `fast-fallback:
//       <run> <reason>` and runs the same set once on the Mac (`exec fast`), under the lock with the install check, sweep and
//       probe a full run has; the hosted run is never retried. Its `test-run:` carries scope fast and host linux or mac, and the
//       final status, for a fast or a full plan, is the merge gate's (`postGate`; a refused post records `status-failed:`).
//       Every run writes one `runner-preflight:` row on the standing workload after its preflight (main-state.ts D5).
//   reap
//       settle-only (D6, R37): every open workload's runner request with no settle and no live heartbeat gets `runner died`;
//       it admits nothing. Prints `reaped none` or `reaped <run id>…`, exit 0; a workload it could not settle on is exit 3,
//       after every other workload was tried.
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
//   AGENT_SYSTEM_TEST_RUNNER_FINALIZE_MS    shared post-sweep head/result/publication deadline (default 150 s)
//   AGENT_SYSTEM_TEST_RUNNER_FAST_WAIT_MS   how long the hosted fast check may take before the Mac fallback (default fastWaitMin)
//   AGENT_SYSTEM_TEST_RUNNER_FAST_POLL_MS   the hosted fast check's poll (default 15 s)
//   AGENT_SYSTEM_TEST_RUNNER_OUTLIVE_MS     how long a part's wrapper may outlive its cap before the runner sweeps (default 60 s)
//   AGENT_SYSTEM_TEST_RUNNER_BUSY_MS        runs.db busy_timeout (default 5 s)
//   AGENT_SYSTEM_TEST_RUNNER_REFRESH_CAP_MS    the refresh helper's cap (default REFRESH_CAP_S plus a minute, 15 min)
//   AGENT_SYSTEM_TEST_RUNNER_REFRESH_GRACE_MS  its SIGTERM-to-SIGKILL grace (default 10 s)
//   AGENT_SYSTEM_TEST_RUNNER_REFRESH_REAP_MS   how long it then waits for sudo to exit (default 30 s)
//   AGENT_SYSTEM_TEST_HOOKS                 a directory of pause/mark files at named boundaries (`hook`), and the
//                                           `<run id>.refresh-signal.refuse` file: the runner's signals to the refresh
//                                           helper's sudo are refused, as the kernel may refuse Jo's signal to a root sudo
import { spawn, spawnSync, type Subprocess } from "bun";
import { Database } from "bun:sqlite";
import {
	appendFileSync, chmodSync, closeSync, constants as FS, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, renameSync,
	rmSync, type Stats, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertNotLiveLedgerUnderTest, defaultLedgerPath, type EntryRow, Ledger, TEST_RUNNER_BY, type WorkloadStatusRow } from "../../ledger/src/index";
import {
	AS2_VERIFIED_TAG, AS2TEST_LIBEXEC, AS2TEST_SUDOERS, CHECKOUT_DRIFT, type DsclRead, type InstallFacts, installDecision, type InstallVerdict, type OwnerIds, preflightDecision,
	preflightProbes, probeCall, probeDecision, readInstall, REBUILT_FILES, REFRESH_CAP_S, REFRESH_EXIT, REFRESH_FAILED, type Verdict,
} from "../src/as2test";
import { repoOf } from "../src/decision-log";
import { FastSetError, type FastRun, type FullRun, fastSet, parseCheck, type ReadFile } from "../src/fast-set";
import { ensureStandingWorkload } from "../src/identity";
import { boundPrs, controlEntries, holdersOf, landFirstOn, mainRetries, worktreePath } from "../src/launch";
import {
	attemptBlock, attribute, CHAIN_MAX, type ChainCommit, type GateDecision, type GateFacts, ghMainChain, mainResults, type MainState, mainState, mainVerdicts, type MainVerdictKind, mergeGate,
	runnerPreflightBody,
} from "../src/main-state";
import { FULL_SUITE_STATUS, fixBindings, fixBinds, ghCompare, type LandFirstRow, landFirstRows, stopEpisode, trainHold, trainPrs } from "../src/merge-train";
import { bodyDeps, DEFAULT_BRANCH } from "../src/merge-train-stack";
import {
	AS2TEST_ROOT, AS2TEST_USER, authoritativeRun, baseParts, boundBranches, buildTestRun, callTimedOut, carriedRun, changedTestFiles, decideRun, decisionLogFault, type ExecCounts, execOf, executedFiles, fullSuiteSlice, HEARTBEAT_EVERY_MS,
	heartbeatText, isBunTestFile, KEEP_RUNS, lockHolderStale, makeRunId, notifiesOrchestrator, ownerRepoOf, ownsRequest, parseHeartbeat, parseTestRequested, type PartInput, type PartResult, partResult, prAdmissible,
	type PrView, pruneRuns, queueAhead, queuedTooLong, type QueueRow, queueWaiterLive, recordLive, reportCapBytes, reservation, type ResultRecord, resultJson, RUN_ID_RE, type RunDecision, type RunFacts, runDirOf, runnerDiedRun, type RunRecord,
	runsDbOf, runsRoot, securityRedBody, securityRedOf, servedRepo, settleArtifact, stageDirOf, type TestHost, type TestRequested, type TestRun, testRequestedBody, testRunBody, testRunFailedBody, testRunFailedOf, type TestVerdict,
	soloPlan, type TestRunnerConfig, testRunnerConfig, testRuns, workDirOf, WRAPPER_EXIT, type WrapperCall, wrapperArgv,
} from "../src/test-run";
import { MERGE_TRAIN_BY, ORCHESTRATOR_RECIPIENT, STANDING_WORKLOAD_ID } from "../src/types";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** The starter's exit codes (S3 maps them): a refusal is the request's fault, a failure the machine's. */
export const START_EXIT = { ok: 0, usage: 1, refused: 2, failed: 3 } as const;
/** A sweep that ends by a signal is retried this many times while the lock row and `current` still name the run (§ 2.3 step 1). */
export const SWEEP_RETRIES = 3;
/** The wrapper outliving its own cap by this much makes the runner sweep (§ 2.3 step 3); AGENT_SYSTEM_TEST_RUNNER_OUTLIVE_MS in tests. */
const OUTLIVE_MS = 60_000;
/**
 * The runner's cap on the refresh helper (PLAN wl-mv718fxhwwcn40 § 1.3), a minute above the helper's own REFRESH_CAP_S;
 * the grace between its SIGTERM and SIGKILL; and how long it then waits for sudo to exit before it goes on. Jo's user
 * cannot signal root processes directly: the runner signals only its own sudo, which may refuse the signal or never pass
 * it on, so the helper's own cap and trap are what bound the root process tree. The runner's cap bounds only its wait.
 */
const REFRESH_TIMEOUT_MS = REFRESH_CAP_S * 1000 + 60_000;
const REFRESH_KILL_GRACE_MS = 10_000;
const REFRESH_REAP_MS = 30_000;

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

/**
 * The state a verdict posts on the sha the fetch confirmed; stale and superseded post none (no result for that sha), and nothing posts
 * `pending`. A red-main posts success (PLAN wl-mv8s8srodefytc rev 17.1 D8): the PR adds no failure to main's, and main's own red is a bug.
 */
const FULL_SUITE_STATE: Partial<Record<TestVerdict, "success" | "failure" | "error">> = { green: "success", "red-main": "success", red: "failure", error: "error" };

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
 * `<dir>/<id>.<point>.marks` (`id` is the run id; the starter's carry, which has no run, names its workload);
 * when `<dir>/<id>.<point>.pause` exists, it writes `.reached` and waits for `.go`, then removes all three
 * (one pause per arming). Unset, it is inert.
 */
function hookMark(id: string, point: string, info: Record<string, unknown> = {}): { base: string } | null {
	const dir = process.env.AGENT_SYSTEM_TEST_HOOKS;
	if (!dir) return null;
	const base = join(dir, `${id}.${point}`);
	appendFileSync(`${base}.marks`, `${JSON.stringify({ at: Date.now(), pid: process.pid, ...info })}\n`);
	return { base };
}
function hookResume(base: string): void {
	for (const s of [".pause", ".go", ".reached"]) rmSync(base + s, { force: true });
}
/** The synchronous form, for a boundary inside an open SQLite transaction. */
function hookSync(id: string, point: string, info: Record<string, unknown> = {}): void {
	const h = hookMark(id, point, info);
	if (!h || !existsSync(`${h.base}.pause`)) return;
	writeFileSync(`${h.base}.reached`, JSON.stringify({ pid: process.pid, at: Date.now(), ...info }));
	while (!existsSync(`${h.base}.go`)) Bun.sleepSync(25);
	hookResume(h.base);
}
async function hook(runId: string, point: string, info: Record<string, unknown> = {}, deadline = Infinity): Promise<void> {
	const h = hookMark(runId, point, info);
	if (!h || !existsSync(`${h.base}.pause`)) return;
	writeFileSync(`${h.base}.reached`, JSON.stringify({ pid: process.pid, at: Date.now(), ...info }));
	while (!existsSync(`${h.base}.go`)) {
		if (Date.now() >= deadline) throw new Stop(`post-sweep deadline exceeded at ${point}`);
		await Bun.sleep(25);
	}
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

/**
 * `<root>/runs.db` with its one-row lock table and the `queue` table of the runs waiting for it (each waiter's request
 * `created_at` in ms, `requestedAt`: the order they take the lock in); busy_timeout first.
 */
export function openLockDb(root: string, busyMs: number = msEnv("AGENT_SYSTEM_TEST_RUNNER_BUSY_MS", 5_000)): Database {
	// Under test, a runs root or a runs.db (a symlink included) inside a live ledger root is refused before anything is created there.
	assertNotLiveLedgerUnderTest(root);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	assertNotLiveLedgerUnderTest(runsDbOf(root));
	const db = new Database(runsDbOf(root), { create: true, strict: true });
	db.exec(`PRAGMA busy_timeout = ${Math.trunc(busyMs)}`);
	busyLoop(() => db.exec(
		"CREATE TABLE IF NOT EXISTS lock (id INTEGER PRIMARY KEY CHECK (id = 1), runId TEXT NOT NULL, pid INTEGER NOT NULL, pgid INTEGER NOT NULL, runDir TEXT NOT NULL, heartbeatAt INTEGER NOT NULL)",
	));
	busyLoop(() => db.exec("CREATE TABLE IF NOT EXISTS queue (runId TEXT PRIMARY KEY, workloadId TEXT NOT NULL, requestedAt INTEGER NOT NULL)"));
	// D5's one pending main target per repository (lowercased owner/repo): replaced by each newer landing, admitted when the active main run
	// settles. It lives here, not in the ledger, on purpose: the tick re-requests every main tip that has no verdict on each pass, so losing
	// runs.db loses nothing durable, and a replaced target never needs an inconclusive test-run of its own.
	busyLoop(() => db.exec("CREATE TABLE IF NOT EXISTS main_pending (repo TEXT PRIMARY KEY, sha TEXT NOT NULL, at INTEGER NOT NULL)"));
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

/** `<runs root>/base-cache/<base sha>/<part, URI-encoded>.json`: base's result of one part (D8), written by Jo's runner only. */
function baseCachePath(root: string, sha: string, part: string): string {
	if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`${sha} is not a full sha`);
	return join(root, "base-cache", sha, `${encodeURIComponent(part)}.json`);
}

/** A cached base result (D8), or null when none is cached or the file is not a clean result (a cached error never counts). */
export function readBaseCache(root: string, sha: string, part: string): PartResult | null {
	let v: unknown;
	try {
		v = JSON.parse(readFileSync(baseCachePath(root, sha, part), "utf8"));
	} catch {
		return null;
	}
	if (v === null || typeof v !== "object") return null;
	const p = v as Record<string, unknown>;
	const counts = ["pass", "fail", "skip", "ms"].every((k) => {
		const n = p[k];
		return typeof n === "number" && Number.isInteger(n) && n >= 0;
	});
	const failures = Array.isArray(p.failures)
		&& p.failures.every((f: unknown) => f !== null && typeof f === "object" && "name" in f && typeof f.name === "string" && "firstError" in f && typeof f.firstError === "string");
	if (!counts || !failures || p.error !== null || !(p.exit === null || Number.isInteger(p.exit))) return null;
	// Every field PartResult names was checked above.
	const result = v as PartResult;
	return result;
}

/** Cache base's clean result of one part (D8): written to a temp name and renamed, so a reader sees the whole file or none. */
export function writeBaseCache(root: string, sha: string, part: string, result: PartResult): void {
	const path = baseCachePath(root, sha, part);
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const tmp = `${path}.${process.pid}.tmp`;
	writeFileSync(tmp, `${JSON.stringify(result)}\n`, { mode: 0o600 });
	renameSync(tmp, path);
}

// ---- start ------------------------------------------------------------------------------------------

/** gh's JSON for `args` (gh found on PATH with this process's env); a gh failure or an answer that is no JSON fails the start, named `what`. */
function ghJson(args: string[], what = `gh ${args.join(" ")}`): unknown {
	const r = spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe", timeout: 15_000 });
	if (r.exitCode !== 0) {
		const why = r.exitedDueToTimeout ? "timed out" : r.stderr.toString().trim().split("\n").at(-1) || `exit ${r.exitCode}`;
		throw new Fail(`${what} failed: ${why}`, START_EXIT.failed);
	}
	try {
		return JSON.parse(r.stdout.toString());
	} catch {
		throw new Fail(`${what} did not return json`, START_EXIT.failed);
	}
}

/** `gh pr view <pr> -R <owner/repo> --json <fields>`'s object. */
function ghPrJson(ownerRepo: string, pr: number, fields: string): Record<string, unknown> {
	return ghJson(["pr", "view", String(pr), "-R", ownerRepo, "--json", fields], `gh pr view ${pr} -R ${ownerRepo}`) as Record<string, unknown>;
}

function ghPrView(ownerRepo: string, pr: number): PrView & { body: string } {
	const v = ghPrJson(ownerRepo, pr, "number,state,headRefOid,headRefName,baseRefName,isCrossRepository,body");
	if (typeof v.number !== "number" || typeof v.state !== "string" || typeof v.headRefOid !== "string" || typeof v.headRefName !== "string" ||
		typeof v.baseRefName !== "string" || typeof v.isCrossRepository !== "boolean" || (v.body !== undefined && typeof v.body !== "string")) {
		throw new Fail(`gh pr view ${pr} -R ${ownerRepo} returned an unexpected shape`, START_EXIT.failed);
	}
	if (v.number !== pr) throw new Fail(`gh pr view ${pr} answered for PR #${v.number}`, START_EXIT.failed);
	// gh answers `body: ""` for an empty body; an answer without the field reads as one.
	return { ...(v as unknown as PrView), body: (v.body as string | undefined) ?? "" };
}

/**
 * Why a merge-train PR may not run yet (PLAN wl-mv8s8srodefytc § 1b, dependencies land first), or null: a
 * `Depends-on:` PR in its body that is not MERGED (one `gh pr view <A> --json state` each, in body order), or a
 * base branch other than DEFAULT_BRANCH (a stack not yet retargeted). Reads no ledger row.
 */
function stackRefusal(ownerRepo: string, view: PrView & { body: string }): string | null {
	for (const dep of bodyDeps(view.body)) {
		if (dep === view.number) continue;
		const state = ghPrJson(ownerRepo, dep, "state").state;
		if (typeof state !== "string") throw new Fail(`gh pr view ${dep} -R ${ownerRepo} returned an unexpected shape`, START_EXIT.failed);
		if (state !== "MERGED") return `#${view.number} depends on #${dep} (${state}): land #${dep} first`;
	}
	if (view.baseRefName !== DEFAULT_BRANCH) return `#${view.number} targets ${view.baseRefName}; retarget it to ${DEFAULT_BRANCH} once its dependency has landed`;
	return null;
}

/** A main request's entries name no slice (`sl-main-<id>` is a name, not a slice row); a PR request's name its slice. */
const sliceOf = (r: TestRequested): string | undefined => (r.main === undefined ? r.slice : undefined);

/** The `error` result of a request whose run never ran or died, `runner died` unless a reason is given; a main request's stays a main run. */
export function diedRun(request: TestRequested, runDir: string | null, reason = "runner died"): TestRun {
	return { ...runnerDiedRun(request, runDir), reason, main: request.main !== undefined };
}

/** After a reservation, a run that cannot proceed (no runner spawned, no profile to run under) gets its `error` result, while it still owns its request. */
function recordError(ledger: Ledger, wl: string, request: TestRequested, runDir: string, reason: string): void {
	const written = ledger.write(() => {
		if (!ownsRequest(testRuns(ledger.entries(wl)), request.runId)) return false;
		const prior = testRuns(ledger.entries(wl)).find((r) => r.request.runId === request.runId)?.results[0];
		if (request.main !== undefined && prior !== undefined) return false;
		ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: sliceOf(request), kind: "assumption", body: testRunBody(diedRun(request, runDir, reason)) });
		return true;
	});
	if (written && request.main !== undefined) {
		const log = (s: string) => {
			process.stdout.write(`${s}\n`);
			ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, kind: "assumption", body: `main-publication: ${request.runId} ${s.replace(/\s+/g, " ")}` });
		};
		revokeOpen(realGh, request.main.repo, `main ${request.sha.slice(0, 7)} error: ${reason}`, log);
		postStatus(realGh, request.main.repo, "error", request.sha, `main full error, run ${request.runId}`, log, MAIN_FULL_STATUS);
	}
}

// ---- GitHub: the runner's one seam -------------------------------------------------------------------

/** One gh process: its exit code (null when it was killed at its timeout) and output. */
export interface GhResult {
	code: number | null;
	stdout: string;
	stderr: string;
}
/** Every gh call of the status posts, the gate, the hosted fast check, main runs and revocation goes through this seam, so a test stubs GitHub. */
export type Gh = (args: string[], timeoutMs?: number) => GhResult;
/** gh found on PATH with this process's env, killed at `timeoutMs` (default 30 s). */
export const realGh: Gh = (args, timeoutMs = 30_000) => {
	const r = spawnSync(["gh", ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
	if (r.exitedDueToTimeout) return { code: null, stdout: r.stdout.toString(), stderr: `gh ${args.slice(0, 2).join(" ")} timed out after ${timeoutMs / 1000} s` };
	return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
};
/** A failed gh call's last line: its stderr's, else its stdout's, else its exit. */
export const ghWhy = (r: GhResult): string => r.stderr.trim().split("\n").at(-1) || r.stdout.trim().split("\n").at(-1) || `exit ${r.code}`;
/** gh's JSON answer for `args`; a failed call or an answer that is no JSON throws, naming the call. */
export function ghJsonOf(gh: Gh, args: string[]): unknown {
	const what = `gh ${args.slice(0, 2).join(" ")}`;
	const r = gh(args);
	if (r.code !== 0) throw new Error(`${what} failed: ${ghWhy(r)}`);
	try {
		return JSON.parse(r.stdout);
	} catch {
		throw new Error(`${what} did not return json`);
	}
}
const field = (v: unknown, k: string): unknown => (v !== null && typeof v === "object" ? (v as Record<string, unknown>)[k] : undefined);
const SHA40 = /^[0-9a-f]{40}$/;
/** The informational status a main run posts on its commit (D5); never required by the ruleset. */
export const MAIN_FULL_STATUS = "as2/main-full";

/**
 * A commit status `context` (as2/full-suite by default, FULL_SUITE_STATUS) `state` on exactly `sha` in `ownerRepo`: `gh api -X POST
 * repos/<owner/repo>/statuses/<sha>`. GitHub refuses a description over 140 characters, so a longer one is cut. Logged through `log`;
 * returns why it was not posted, or null when it was. It never throws.
 */
export function postStatus(
	gh: Gh, ownerRepo: string, state: "pending" | "success" | "failure" | "error", sha: string, description: string, log: (s: string) => void, context = FULL_SUITE_STATUS,
): string | null {
	const what = `status ${context} ${state} on ${sha}`;
	if (!ownerRepo) {
		log(`${what} not posted: the run has no served repo`);
		return "the run has no served repo";
	}
	const desc = description.length > 140 ? `${description.slice(0, 139)}…` : description;
	let why: string | null;
	try {
		const r = gh(["api", "-X", "POST", `repos/${ownerRepo}/statuses/${sha}`, "-f", `state=${state}`, "-f", `context=${context}`, "-f", `description=${desc}`], 15_000);
		why = r.code === 0 ? null : ghWhy(r);
	} catch (e) {
		why = errText(e);
	}
	log(why === null ? `${what} posted` : `${what} not posted: ${why}`);
	return why;
}

// ---- land-first (PLAN wl-mvq4edbaf13vnk D4, D5) -------------------------------------------------------

/**
 * What a land-first admission decided for head X (D4), recorded as `fast-plan: <run id> <json>` in the admission's transaction:
 * the fast set (`files` on hosted Linux, `parse` targets, `macOnly` files left for main runs), the full suite with every
 * exception that requires it, or a tree carry (X's tree is G's, so G's green main run `run` is X's result, no run). `ref` is
 * the PR's head branch, which names a train revert (`train/revert-<T 7>`) to the gate.
 */
export type FastPlan = { ref: string } & (
	| { scope: "fast"; files: string[]; parse: string[]; macOnly: string[] }
	| { scope: "full"; reasons: string[] }
	| { scope: "tree"; g: string; run: string }
);
/** A plan that runs the fast set (D4): hosted Linux `files`, `parse` targets, `macOnly` files left for main runs. */
export type FastSetPlan = Extract<FastPlan, { scope: "fast" }>;
export const FAST_PLAN_PREFIX = "fast-plan:";
export function fastPlanBody(runId: string, plan: FastPlan): string {
	if (!RUN_ID_RE.test(runId)) throw new Error(`fast-plan: ${runId} is not a run id`);
	return `${FAST_PLAN_PREFIX} ${runId} ${JSON.stringify(plan)}`;
}
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");
export function parseFastPlan(body: string): { runId: string; plan: FastPlan } | null {
	const m = /^fast-plan: (tr-[a-z0-9]+) (\{.*\})$/.exec(body.trim());
	if (!m) return null;
	let v: unknown;
	try {
		v = JSON.parse(m[2]!);
	} catch {
		return null;
	}
	const p = v as Record<string, unknown>;
	if (v === null || typeof v !== "object" || typeof p.ref !== "string") return null;
	const ref = p.ref;
	if (p.scope === "fast" && strings(p.files) && strings(p.parse) && strings(p.macOnly)) return { runId: m[1]!, plan: { ref, scope: "fast", files: p.files, parse: p.parse, macOnly: p.macOnly } };
	if (p.scope === "full" && strings(p.reasons)) return { runId: m[1]!, plan: { ref, scope: "full", reasons: p.reasons } };
	if (p.scope === "tree" && typeof p.g === "string" && SHA40.test(p.g) && typeof p.run === "string" && RUN_ID_RE.test(p.run)) return { runId: m[1]!, plan: { ref, scope: "tree", g: p.g, run: p.run } };
	return null;
}
/** The runner's own `fast-plan:` for `runId` among a workload's entries (`controlEntries` drops another writer's copy), or null. */
export function fastPlanOf(entries: readonly EntryRow[], runId: string): FastPlan | null {
	for (const c of controlEntries(entries)) {
		if (c.prefix !== "fast-plan") continue;
		const p = parseFastPlan(c.body);
		if (p !== null && p.runId === runId) return p.plan;
	}
	return null;
}

/** Land-first is on for `ownerRepo`, read now from the standing workload (`landFirstOn`, D12). */
function landFirstNow(ledger: Ledger, ownerRepo: string): boolean {
	return landFirstOn(ledger.entries(STANDING_WORKLOAD_ID), ledger.instructions(STANDING_WORKLOAD_ID), ownerRepo);
}

/** A git command for the runner's own trusted reads (`trustedEnv`, no hooks), synchronous; a failure throws naming it. */
function gitSync(gitDir: string, args: string[], env: Record<string, string>, opts: { stdin?: Uint8Array; timeoutMs?: number } = {}): Buffer {
	const r = spawnSync(["git", `--git-dir=${gitDir}`, ...NO_HOOKS, ...args], { env, stdin: opts.stdin ?? "ignore", stdout: "pipe", stderr: "pipe", timeout: opts.timeoutMs ?? 120_000 });
	if (r.exitCode !== 0) {
		const why = r.exitedDueToTimeout ? `timed out after ${(opts.timeoutMs ?? 120_000) / 1000} s` : r.stderr.toString().trim().split("\n").at(-1) || `exit ${r.exitCode}`;
		throw new Error(`git ${args.slice(0, 2).join(" ")} in ${gitDir} failed: ${why}`);
	}
	return r.stdout;
}

const MODULE_SOURCE = /\.(?:[cm]?[jt]sx?|sql)$/;
export interface CommitTree {
	files: string[];
	read: ReadFile;
}
/**
 * A commit's tracked files and a reader over their contents (`ReadFile`, null for a path the tree does not hold), from the
 * git dir `gitDir`: one `ls-tree`, then, with `prefetch`, every module source (and `.sql`) in one `cat-file --batch`, the
 * rest read on demand. The fast set reads every module of the tree (its import graph); the base side reads one file.
 */
export function treeAt(gitDir: string, commit: string, env: Record<string, string>, prefetch: boolean): CommitTree {
	const blobs = new Map<string, string>();
	for (const line of gitSync(gitDir, ["ls-tree", "-r", "-z", "--full-tree", commit], env).toString("utf8").split("\0")) {
		const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/s.exec(line);
		if (m) blobs.set(m[2]!, m[1]!);
	}
	const cache = new Map<string, string>();
	if (prefetch) {
		const want = [...blobs].filter(([p]) => MODULE_SOURCE.test(p));
		const out = gitSync(gitDir, ["cat-file", "--batch"], env, { stdin: Buffer.from(want.map(([, sha]) => `${sha}\n`).join("")) });
		let at = 0;
		for (const [path, sha] of want) {
			const nl = out.indexOf(10, at);
			const header = /^([0-9a-f]{40}) blob (\d+)$/.exec(out.subarray(at, nl).toString("utf8"));
			if (!header || header[1] !== sha) throw new Error(`git cat-file --batch in ${gitDir} answered ${out.subarray(at, nl).toString("utf8")} for ${path} (${sha})`);
			const size = Number(header[2]);
			cache.set(path, out.subarray(nl + 1, nl + 1 + size).toString("utf8"));
			at = nl + 1 + size + 1;
		}
	}
	const read: ReadFile = (path) => {
		const hit = cache.get(path);
		if (hit !== undefined) return hit;
		const sha = blobs.get(path);
		if (sha === undefined) return null;
		const text = gitSync(gitDir, ["cat-file", "blob", sha], env).toString("utf8");
		cache.set(path, text);
		return text;
	};
	return { files: [...blobs.keys()], read };
}

/** The runner's bare mirror of `ownerRepo` under the runs root: admissions fetch each head into `refs/as2/<run id>/…` there, so concurrent fetches never share a ref. */
function mirrorOf(root: string, ownerRepo: string, env: Record<string, string>): string {
	const dir = join(root, "mirror", `${ownerRepo.replace("/", "__")}.git`);
	if (!existsSync(join(dir, "HEAD"))) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		gitSync(dir, ["init", "-q", "--bare"], env);
	}
	return dir;
}
/** Remove a run's `refs/as2/<run id>/…` from the mirror; a failure is logged and leaves only a ref. */
function dropRunRefs(gitDir: string, runId: string, env: Record<string, string>, log: (s: string) => void): void {
	for (const ref of ["head", "main"]) {
		try {
			gitSync(gitDir, ["update-ref", "-d", `refs/as2/${runId}/${ref}`], env);
		} catch (e) {
			log(`the mirror ref refs/as2/${runId}/${ref} was not removed: ${errText(e)}`);
		}
	}
}

/** The commit the `as2-verified` tag names on `repo` (§ 2 The bundle); null when the tag does not exist (404). Throws when GitHub cannot answer. */
export function verifiedTagOf(gh: Gh, repo: string): string | null {
	const path = `repos/${repo}/git/ref/tags/${AS2_VERIFIED_TAG}`;
	const r = gh(["api", path]);
	if (r.code !== 0) {
		if (/HTTP 404|Not Found/.test(`${r.stderr}\n${r.stdout}`)) return null;
		throw new Error(`gh api ${path} failed: ${ghWhy(r)}`);
	}
	let v: unknown;
	try {
		v = JSON.parse(r.stdout);
	} catch {
		throw new Error(`gh api ${path} did not return json`);
	}
	const sha = field(field(v, "object"), "sha");
	if (field(field(v, "object"), "type") !== "commit" || typeof sha !== "string" || !SHA40.test(sha)) throw new Error(`gh api ${path} does not name a commit`);
	return sha;
}

/** A train revert's head branch (D7): `train/revert-<T 7>`. */
const REVERT_REF = /^train\/revert-[0-9a-f]{7}$/;
/**
 * PR `pr` is the fix the open stop episode's issue names (§ 2 The merge gate, D7): a line of the issue's body or a comment that says
 * `fix` and names `#<pr>` or `/pull/<pr>`. False with no open episode or no filed issue. Throws when GitHub cannot answer.
 */
export function namedFix(gh: Gh, ledger: Ledger, repo: string, pr: number): boolean {
	const ep = stopEpisode(landFirstRows(ledger.entries(STANDING_WORKLOAD_ID), repo));
	if (ep?.filed == null) return false;
	const v = ghJsonOf(gh, ["issue", "view", ep.filed, "--json", "body,comments"]);
	const comments = field(v, "comments");
	const texts = [field(v, "body"), ...(Array.isArray(comments) ? comments.map((c) => field(c, "body")) : [])].filter((t): t is string => typeof t === "string");
	const names = new RegExp(`\\bfix\\b.*(?:#|/pull/)${pr}\\b`, "i");
	return texts.some((t) => t.split("\n").some((l) => names.test(l)));
}

/** What the gate reads of a head besides its result: the repo, the head and its branch, the PR, and what it must pass. */
export interface GateInput {
	gh: Gh;
	ledger: Ledger;
	repo: string;
	head: string;
	ref: string;
	pr: number;
	need: "fast" | "full";
	result: GateFacts["result"];
}

/** Main as the gate reads it now: GitHub's tip of `repo`, its first-parent chain back to G (`ghMainChain`) and main state (`mainState`) over the runner's main results. Throws when GitHub cannot answer. */
export function readMain(gh: Gh, ledger: Ledger, repo: string): { tip: string; chain: ChainCommit[]; state: MainState; results: ResultRecord[] } {
	const ghJson = (args: string[]) => ghJsonOf(gh, args);
	const results = mainResults(ledger.entries(STANDING_WORKLOAD_ID));
	const greens = new Set([...mainVerdicts(results).values()].filter((v) => v.verdict === "green").map((v) => v.sha));
	const tipPath = `repos/${repo}/git/ref/heads/${DEFAULT_BRANCH}`;
	const tip = field(field(ghJson(["api", tipPath]), "object"), "sha");
	if (typeof tip !== "string" || !SHA40.test(tip)) throw new Error(`gh api ${tipPath} returned an unexpected shape`);
	const chain = ghMainChain(repo, tip, ghJson, greens);
	return { tip, chain, state: mainState(chain, results, Date.parse(ledger.now())), results };
}

/**
 * The merge gate's decision on `head` (§ 2 The merge gate), re-read now from the ledger and GitHub: main's tip, its chain back to G
 * and state (`readMain`), whether the head contains the tip (GitHub's compare), and whether it is the incident's repair (a
 * `train/revert-…` head whose tree is G's, or the fix the incident's issue names). Throws when GitHub cannot answer.
 */
export function gateDecision(i: GateInput): GateDecision {
	const ghJson = (args: string[]) => ghJsonOf(i.gh, args);
	const { tip, chain, state } = readMain(i.gh, i.ledger, i.repo);
	let containsTip = tip === i.head;
	if (!containsTip) {
		const status = field(ghJson(["api", `repos/${i.repo}/compare/${tip}...${i.head}`]), "status");
		if (typeof status !== "string") throw new Error(`gh api repos/${i.repo}/compare/${tip.slice(0, 7)}...${i.head.slice(0, 7)} returned no status`);
		containsTip = status === "ahead" || status === "identical";
	}
	let repair: GateFacts["repair"] = null;
	let treeEqualsG = false;
	if (!state.open) {
		if (REVERT_REF.test(i.ref)) {
			repair = "revert";
			const gTree = chain.find((c) => c.sha === state.g)?.tree ?? null;
			const headTree = field(field(ghJson(["api", `repos/${i.repo}/git/commits/${i.head}`]), "tree"), "sha");
			if (typeof headTree !== "string") throw new Error(`gh api repos/${i.repo}/git/commits/${i.head} returned no tree`);
			treeEqualsG = gTree !== null && headTree === gTree;
		} else if (namedFix(i.gh, i.ledger, i.repo, i.pr)) repair = "fix";
	}
	return mergeGate({ head: i.head, containsTip, state, need: i.need, result: i.result, repair, treeEqualsG });
}

/**
 * Post the gate's state on the head (D4, through #320's mechanism): mergeGate's success, or failure naming every reason; a gate that
 * cannot read main or the head posts failure naming that (F7). A post GitHub refuses records `status-failed: <run id> <state> on <sha>:
 * <error>` on the run's workload (F6), so the head stays `pending` and the train sees why. Returns what was decided and the post's error.
 */
export function postGate(i: GateInput & { wl: string; runId: string; log: (s: string) => void }): { state: "success" | "failure"; description: string; error: string | null } {
	let decided: { state: "success" | "failure"; description: string };
	try {
		const d = gateDecision(i);
		decided = d.state === "success" ? { state: "success", description: d.description } : { state: "failure", description: d.reasons.join("; ") };
	} catch (e) {
		decided = { state: "failure", description: `the gate could not read main or the head: ${errText(e)}` };
	}
	i.log(`gate on ${i.head}: ${decided.state}: ${decided.description}`);
	const error = postStatus(i.gh, i.repo, decided.state, i.head, decided.description, i.log);
	if (error !== null) {
		try {
			i.ledger.write(() => i.ledger.recordEntry({
				by: TEST_RUNNER_BY, workloadId: i.wl, kind: "assumption", body: `status-failed: ${i.runId} ${decided.state} on ${i.head}: ${error.replace(/\s+/g, " ")}`,
			}));
		} catch (e) {
			i.log(`status-failed: not recorded: ${errText(e)}`);
		}
	}
	return { ...decided, error };
}

/**
 * Revoke every open success (§ 2 Revocation): each open PR head of `repo` whose newest `as2/full-suite` is a success that is not the
 * gate's repair (`repair: …`) gets failure `landing stopped: <reason>`. One attempt per head; a failure is logged, and the tick's pass
 * revokes what is still owed (D6). Never throws: a list GitHub cannot answer is logged and revokes nothing.
 */
export function revokeOpen(gh: Gh, repo: string, reason: string, log: (s: string) => void): { revoked: number[]; failed: number[] } {
	const out = { revoked: [] as number[], failed: [] as number[] };
	let list: unknown;
	try {
		list = ghJsonOf(gh, ["pr", "list", "-R", repo, "--state", "open", "--json", "number,headRefOid", "--limit", "500"]);
		if (!Array.isArray(list)) throw new Error(`gh pr list -R ${repo} returned an unexpected shape`);
	} catch (e) {
		log(`revocation on ${repo} not attempted: ${errText(e)}; the tick revokes what is owed on its next pass`);
		return out;
	}
	for (const p of list as unknown[]) {
		const n = field(p, "number");
		const head = field(p, "headRefOid");
		if (typeof n !== "number" || typeof head !== "string" || !SHA40.test(head)) {
			log(`revocation on ${repo}: gh pr list named a PR with no number or head; skipped`);
			continue;
		}
		let newest: unknown;
		try {
			const statuses = ghJsonOf(gh, ["api", `repos/${repo}/commits/${head}/statuses`]);
			if (!Array.isArray(statuses)) throw new Error(`gh api repos/${repo}/commits/${head}/statuses returned an unexpected shape`);
			newest = statuses.find((s) => field(s, "context") === FULL_SUITE_STATUS);
		} catch (e) {
			log(`revocation of #${n} at ${head.slice(0, 7)} not attempted: ${errText(e)}`);
			out.failed.push(n);
			continue;
		}
		const description = field(newest, "description");
		if (field(newest, "state") !== "success" || (typeof description === "string" && description.startsWith("repair:"))) continue;
		if (postStatus(gh, repo, "failure", head, `landing stopped: ${reason}`, log) === null) out.revoked.push(n);
		else out.failed.push(n);
	}
	return out;
}

/** What the hosted fast check answered: its artifact downloaded into `dir`, or why the one Mac fallback runs instead (D4). */
export type HostedFast = { ok: true; workflowRunId: number; dir: string } | { ok: false; reason: string };
export interface HostedFastDeps {
	gh: Gh;
	now: () => number;
	sleep: (ms: number) => Promise<void>;
	log: (s: string) => void;
}
/** The fast check's workflow (D3), dispatched on the verified tag. */
export const FAST_WORKFLOW = "as2-fast.yml";

/**
 * The hosted fast check (D4): dispatch `as2-fast.yml` on `as2-verified` with inputs `sha`, `files` (space-separated `./<path>`) and
 * `request` (the run id), taking `workflow_run_id` from the answer; poll the run every `pollMs` until it completes or `waitMs` passes;
 * then download its artifact `as2-fast-<request>` (fast.xml, fast.log, fast.summary) into `dir`. A dispatch GitHub refuses (the tag
 * unreadable included), a run whose `head_sha` is not the tag's commit, or no result in time is `ok: false` with the reason, and the
 * caller runs the set once on the Mac: the hosted run is never retried. A poll GitHub cannot answer is logged and polled again.
 */
export async function hostedFast(d: HostedFastDeps, o: { repo: string; runId: string; sha: string; files: readonly string[]; waitMs: number; pollMs: number; dir: string }): Promise<HostedFast> {
	const start = d.now();
	let tag: string | null;
	try {
		tag = verifiedTagOf(d.gh, o.repo);
	} catch (e) {
		return { ok: false, reason: `dispatch failed: the ${AS2_VERIFIED_TAG} tag could not be read: ${errText(e)}` };
	}
	if (tag === null) return { ok: false, reason: `dispatch failed: ${o.repo} has no ${AS2_VERIFIED_TAG} tag` };
	const dispatch = d.gh([
		"api", "-X", "POST", `repos/${o.repo}/actions/workflows/${FAST_WORKFLOW}/dispatches`, "-f", `ref=${AS2_VERIFIED_TAG}`, "-f", `inputs[sha]=${o.sha}`,
		"-f", `inputs[files]=${o.files.map((f) => `./${f}`).join(" ")}`, "-f", `inputs[request]=${o.runId}`, "-F", "return_run_details=true",
	]);
	if (dispatch.code !== 0) return { ok: false, reason: `dispatch failed: ${ghWhy(dispatch)}` };
	let id: unknown;
	try {
		id = field(JSON.parse(dispatch.stdout), "workflow_run_id");
	} catch {
		id = undefined;
	}
	if (typeof id !== "number" || !Number.isSafeInteger(id)) return { ok: false, reason: "dispatch failed: the answer names no workflow_run_id" };
	d.log(`fast check dispatched: workflow run ${id} on ${AS2_VERIFIED_TAG} (${tag.slice(0, 12)})`);
	let status = "unknown";
	for (;;) {
		const r = d.gh(["api", `repos/${o.repo}/actions/runs/${id}`]);
		if (r.code === 0) {
			let v: unknown = null;
			try {
				v = JSON.parse(r.stdout);
			} catch {
				d.log(`fast check poll of run ${id}: the answer is no json`);
			}
			const headSha = field(v, "head_sha");
			if (typeof headSha === "string" && headSha !== tag) return { ok: false, reason: `run ${id} ran workflow code at ${headSha.slice(0, 12)}, not ${AS2_VERIFIED_TAG} ${tag.slice(0, 12)}` };
			const s = field(v, "status");
			if (typeof s === "string") status = s;
			if (status === "completed" && typeof headSha === "string") break;
		} else d.log(`fast check poll of run ${id} failed: ${ghWhy(r)}`);
		if (d.now() - start >= o.waitMs) return { ok: false, reason: `no result in ${Math.round(o.waitMs / 60_000)} min (run ${id} ${status})` };
		await d.sleep(Math.max(1, Math.min(o.pollMs, start + o.waitMs - d.now())));
	}
	const dl = d.gh(["run", "download", String(id), "-R", o.repo, "-n", `as2-fast-${o.runId}`, "-D", o.dir], 120_000);
	if (dl.code !== 0) return { ok: false, reason: `no result: artifact as2-fast-${o.runId} of run ${id} not downloaded: ${ghWhy(dl)}` };
	return { ok: true, workflowRunId: id, dir: o.dir };
}

/**
 * The fast set's executed counts (R12): of the Linux `files`, how many show an executed test in the JUnit, and the ones that show
 * none. Any such file fails the check. A report that does not parse is an error, never zero counts.
 */
export function fastExec(junit: string, files: readonly string[]): { ok: true; exec: ExecCounts; missing: string[] } | { ok: false; error: string } {
	const e = execOf(junit, files);
	if (!e.ok) return e;
	return { ok: true, exec: e.exec, missing: files.filter((f) => !e.perFile.has(f)) };
}

/** The hosted fast check's poll period (D4); AGENT_SYSTEM_TEST_RUNNER_FAST_POLL_MS in tests. */
const FAST_POLL_MS = 15_000;

/** `fast-fallback: <run id> <reason>` (D4, F5, F10): the hosted fast check gave no usable answer, so the set runs once on the Mac. */
export function fastFallbackBody(runId: string, reason: string): string {
	if (!RUN_ID_RE.test(runId)) throw new Error(`fast-fallback: ${runId} is not a run id`);
	const why = reason.replace(/\s+/g, " ").trim();
	if (why === "") throw new Error(`fast-fallback: ${runId} names no reason`);
	return `fast-fallback: ${runId} ${why}`;
}

/** The hosted run's `fast.summary` (D3, `.github/workflows/as2-fast.yml`): `request <run id> sha <sha> files <n> exit <code> wall <s> s`. */
export interface FastSummary {
	request: string;
	sha: string;
	files: number;
	exit: number;
	wallS: number;
}
/** `fast.summary`'s one line read, or null when the text is not that line. */
export function parseFastSummary(text: string): FastSummary | null {
	const m = /^request (tr-[a-z0-9]+) sha ([0-9a-f]{40}) files (\d+) exit (\d+) wall (\d+) s$/.exec(text.trim());
	if (!m) return null;
	return { request: m[1]!, sha: m[2]!, files: Number(m[3]), exit: Number(m[4]), wallS: Number(m[5]) };
}

/** What the fast check found beyond its part's counts (D4, R12): parse targets that do not transpile, and planned files with no executed test. */
export interface FastFindings {
	parse: readonly { path: string; error: string }[];
	missing: readonly string[];
}
/** The part a parse-check failure stands in for (nothing ran), so decideRun still checks the fetch, the head and the owner. */
const NOTHING_RAN: PartResult = { pass: 0, fail: 0, skip: 0, exit: 0, ms: 0, error: null, failures: [] };
/**
 * The fast run's decision (D4, R12): decideRun over the run's facts, a parse-check failure standing in for the part that never ran;
 * then a parse target that does not transpile, or a planned Linux file with no executed test, makes a green or red run red, each
 * named in the reason. A red never settles. A superseded or stale decision stands; an error keeps its verdict with them appended.
 */
export function fastDecision(f: RunFacts, found: FastFindings): RunDecision {
	const d = decideRun(found.parse.length > 0 && f.full === null ? { ...f, full: NOTHING_RAN } : f);
	if (d.verdict === "superseded" || d.outcome === "stale") return d;
	const parse = found.parse.length === 0 ? null : `parse check failed: ${found.parse.map((p) => `${p.path} ${p.error}`).join("; ")}`;
	const missing = found.missing.length === 0 ? null : `no executed test in the fast set's ${found.missing.join(", ")}`;
	const extra = [parse, missing].filter((s) => s !== null).join("; ");
	if (extra === "") return d;
	const reason = d.reason === null ? extra : `${d.reason}; ${extra}`;
	if (d.outcome === "green" || d.outcome === "red") return { verdict: "red", outcome: "red", reason, settle: false };
	return { ...d, reason };
}

/** A main run is re-requested only by the tick (D6); its queue key is moved this far ahead of every PR request, so it takes the Mac slot first (D5). */
const MAIN_QUEUE_LEAD_MS = 1e12;
/** Run directories a main run, a `main-red:` row or an open incident cites are kept this long, outside KEEP_RUNS (D5, R16). */
export const CITED_KEEP_MS = 30 * 86_400_000;

/**
 * The run ids retention keeps outside KEEP_RUNS (D5, R16), from the standing workload's entries: every main run requested in the last
 * 30 days, every run a runner `main-red:` row of the last 30 days names, and, while a stop episode (an open incident) is open on a
 * repository, every main run and `main-red:` run since that episode was raised, however old.
 */
export function citedRuns(entries: readonly EntryRow[], nowMs: number): Set<string> {
	const out = new Set<string>();
	const opened = new Map<string, number>();
	for (const r of landFirstRows(entries)) {
		if (opened.has(r.repo)) continue;
		const ep = stopEpisode(landFirstRows(entries, r.repo));
		// StopEpisode's `raised` type narrows to never (merge-train.ts extracts one event from a two-event member); the row is a LandFirstRow.
		const raised = ep?.raised as LandFirstRow | undefined;
		if (raised !== undefined) opened.set(r.repo, Date.parse(raised.createdAt));
	}
	const since = Math.min(nowMs - CITED_KEEP_MS, ...opened.values());
	for (const rec of testRuns(entries)) {
		if (rec.request.main !== undefined && Date.parse(rec.request.createdAt) >= since) out.add(rec.request.runId);
	}
	for (const e of entries) {
		if (e.created_by !== TEST_RUNNER_BY || !e.body.startsWith("main-red:") || Date.parse(e.created_at) < since) continue;
		for (const id of e.body.match(/\btr-[a-z0-9]+\b/g) ?? []) out.add(id);
	}
	return out;
}
/** Retention's prune list (§ 2.3 step 9, R16): the runs past the newest KEEP_RUNS among those no main run, `main-red:` or open incident cites; never `self`. */
export function retentionPrune(runs: readonly { id: string; at: number }[], cited: ReadonlySet<string>, self: string): string[] {
	return pruneRuns(runs.filter((r) => !cited.has(r.id)), KEEP_RUNS).filter((id) => id !== self);
}

/** A main request's answer (`main --repo --sha`, D5): what it did, for the one line the tick logs. */
export type MainAdmission =
	| { action: "verdict" | "active" | "pending-same" | "pending"; line: string }
	| { action: "admitted"; runId: string; line: string };

/** Durable regression facts beside the main TestRun; not the holder's issue-url `main-red:` row. */
export interface MainRedFacts {
	repo: string;
	sha: string;
	runId: string;
	verdict: "red" | "implausible";
	suspects: string[];
	failing: string[];
	attribution: { sha: string; files: string[] }[];
}
export function mainRedFactsBody(facts: MainRedFacts): string {
	return `main-red: ${facts.repo.toLowerCase()} ${JSON.stringify(facts)}`;
}

/**
 * D5/D14 integration seam: a green verdict is durable, but no verified root or tag has moved here.
 * The verifier slice replaces this body with atomic root/tag promotion; until then the stall is explicit and durable.
 */
export function promoteMain(ledger: Ledger, repo: string, sha: string, log: (s: string) => void): { ok: false; reason: string } {
	const reason = "verified-root promotion is not installed; run the verifier promotion step";
	ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: `verifier-stalled: ${repo.toLowerCase()} ${sha} ${reason}` });
	log(`verifier-stalled: ${sha}: ${reason}`);
	return { ok: false, reason };
}

/**
 * D5's main request at `sha` of `repo`, in one ledger transaction on the standing workload: nothing when `sha` has a verdict; refused
 * (Fail, refused) when its attempt block is exhausted (`attemptBlock`, reopened by Jo's `main-retry:`); every main request of the
 * repo with no settle and no live heartbeat settled `runner died` first; nothing when `sha` is the active run or the pending target;
 * with another run active, `sha` replaces the pending target (runs.db `main_pending`), and the active run is never cancelled; with
 * none active, the `test-requested: … main=1 repo=<repo>` admitting it. The caller spawns the admitted run.
 */
export function admitMain(ledger: Ledger, lockDb: Database, root: string, repo: string, sha: string, by: string): MainAdmission {
	if (ledger.workload(STANDING_WORKLOAD_ID) === null) throw new Fail(`no standing workload ${STANDING_WORKLOAD_ID}: a main run is recorded there`, START_EXIT.failed);
	const want = repo.toLowerCase();
	const admission = ledger.write((): MainAdmission | Fail => {
		const entries = ledger.entries(STANDING_WORKLOAD_ID);
		const results = mainResults(entries);
		const verdict = mainVerdicts(results).get(sha);
		if (verdict !== undefined) {
			busyLoop(() => lockDb.query("DELETE FROM main_pending WHERE repo = ? AND sha = ?").run(want, sha));
			return { action: "verdict", line: `main ${sha} has its verdict ${verdict.verdict} (run ${verdict.runId}); nothing requested` };
		}
		const now = Date.parse(ledger.now());
		let active: RunRecord | null = null;
		for (const rec of testRuns(entries)) {
			if (rec.request.main?.repo.toLowerCase() !== want || rec.results.length > 0) continue;
			if (recordLive(rec, heartbeatOf(root, rec.request.runId), now)) active = rec;
			else ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: testRunBody(diedRun(rec.request, runDirOf(root, rec.request.runId))) });
		}
		const block = attemptBlock(sha, mainResults(ledger.entries(STANDING_WORKLOAD_ID)), mainRetries(entries, ledger.instructions(STANDING_WORKLOAD_ID), repo));
		if (block.exhausted) return new Fail(`main ${sha} has spent attempt block ${block.block} (${block.attempts} inconclusive runs): fix the runner, then Jo says main-retry ${repo}`, START_EXIT.refused);
		if (active !== null) {
			if (active.request.sha === sha) return { action: "active", line: `main ${sha} is the active main run ${active.request.runId}; nothing requested` };
			const pending = busyLoop(() => lockDb.query<{ sha: string }, [string]>("SELECT sha FROM main_pending WHERE repo = ?").get(want));
			if (pending?.sha === sha) return { action: "pending-same", line: `main ${sha} is already the pending target behind ${active.request.runId}; nothing requested` };
			busyLoop(() => lockDb.query("INSERT OR REPLACE INTO main_pending (repo, sha, at) VALUES (?, ?, ?)").run(want, sha, now));
			return { action: "pending", line: `main ${sha} is the pending target behind the active run ${active.request.runId}${pending ? ` (replacing ${pending.sha})` : ""}` };
		}
		const runId = makeRunId(Date.now(), Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join(""));
		const request: TestRequested = { runId, pr: 0, sha, slice: `sl-main-${runId.slice(3)}`, by, main: { repo } };
		ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: testRequestedBody(request) });
		busyLoop(() => lockDb.query("DELETE FROM main_pending WHERE repo = ?").run(want));
		return { action: "admitted", runId, line: `main ${sha} admitted as run ${runId}` };
	});
	if (admission instanceof Fail) throw admission;
	return admission;
}

/**
 * `reap` (D6, R37): every open workload's runner request with no settle and no live heartbeat (`recordLive`) settled `runner died`,
 * each workload in its own transaction that re-reads its rows. It admits nothing; none to settle is a no-op. Returns the settled run
 * ids and, for each workload whose transaction failed, `<wl>: <error>`; one failed workload never stops the others.
 */
export function reap(ledger: Ledger, root: string): { settled: string[]; failed: string[] } {
	const wls = ledger.db.query<{ workload_id: string }, [string]>(
		"SELECT DISTINCT workload_id FROM entries WHERE kind = 'assumption' AND created_by = ? AND body LIKE 'test-requested: %'",
	).all(TEST_RUNNER_BY).map((r) => r.workload_id);
	const settled: string[] = [];
	const failed: string[] = [];
	for (const wl of wls) {
		try {
			if (ledger.workload(wl)?.status !== "open") continue;
			settled.push(...ledger.write(() => {
				const now = Date.parse(ledger.now());
				const out: string[] = [];
				for (const rec of testRuns(ledger.entries(wl))) {
					if (rec.results.length > 0 || recordLive(rec, heartbeatOf(root, rec.request.runId), now)) continue;
					ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: sliceOf(rec.request), kind: "assumption", body: testRunBody(diedRun(rec.request, runDirOf(root, rec.request.runId))) });
					out.push(rec.request.runId);
				}
				return out;
			}));
		} catch (e) {
			failed.push(`${wl}: ${errText(e)}`);
		}
	}
	return { settled, failed };
}

/**
 * The detached `run <run id>` (the starter's and a main admission's spawn): its log is `<run dir>/runner.log`, and `runner.json`
 * names its pid. Throws when the process cannot start.
 */
function spawnRunner(runDir: string, runId: string): number {
	mkdirSync(runDir, { recursive: true, mode: 0o700 });
	const fd = openSync(join(runDir, "runner.log"), "a", 0o600);
	try {
		const child = spawn([process.execPath, import.meta.path, "run", runId], { cwd: runDir, env: process.env, stdin: "ignore", stdout: fd, stderr: fd, detached: true });
		child.unref();
		writeFileSync(join(runDir, "runner.json"), `${JSON.stringify({ pid: child.pid, pgid: child.pid, runId })}\n`, { mode: 0o600 });
		return child.pid;
	} finally {
		closeSync(fd);
	}
}

// ---- the carried green (PLAN wl-mvpwkpqobyp20w D4) ------------------------------------------------------

/**
 * D4a's sources for PR `pr` on merge train `train`: the train; the workload a `wl/<W>` head branch names; and every workload, open or
 * closed, whose `train-fix:` is for this repo and binds the PR on the train (`fixBinds`). W and each fix count only when their `repo:`
 * checkout's origin is the served `ownerRepo`; `origins` keeps each checkout's origin once read, so a re-read in a transaction runs git
 * only for a checkout it has not seen.
 */
function carrySources(ledger: Ledger, train: string, pr: number, headRefName: string, ownerRepo: string, origins: Map<string, string | null>): string[] {
	const want = ownerRepo.toLowerCase();
	const served = (id: string): boolean => {
		const repo = repoOf(ledger, id);
		if (repo === null) return false;
		if (!origins.has(repo)) origins.set(repo, originOf(repo));
		const origin = origins.get(repo);
		return origin != null && ownerRepoOf(origin)?.toLowerCase() === want;
	};
	const out = [train];
	const owner = headRefName.startsWith("wl/") ? headRefName.slice(3) : null;
	if (owner !== null && owner !== train && ledger.workload(owner) !== null && served(owner)) out.push(owner);
	for (const f of fixBindings(ledger, { closed: true })) {
		if (!out.includes(f.workloadId) && f.repo.toLowerCase() === want && fixBinds(ledger, f, train, pr) && served(f.workloadId)) out.push(f.workloadId);
	}
	return out;
}

/**
 * D4a's authority: the last `test-requested:` for PR `pr` across `sources` in ledger order, created_at then rowid (one query: the
 * order `ledger.entries` and `authoritativeRun` read within one workload, so equal stamps across workloads resolve by insertion), and
 * that request's own result, read from its own workload's records. Null unless that result is a green: a newer red, error, stale or
 * superseded request, or one still pending, carries nothing, whatever older greens exist.
 */
function carryAuthority(ledger: Ledger, sources: readonly string[], pr: number): ResultRecord | null {
	const rows = ledger.db.query<EntryRow, string[]>(`SELECT * FROM entries WHERE workload_id IN (${sources.map(() => "?").join(", ")}) ORDER BY created_at, rowid`).all(...sources);
	const last = authoritativeRun(testRuns(rows), pr);
	const on = last === null ? undefined : rows.find((e) => e.id === last.request.entryId)?.workload_id;
	const own = on === undefined ? null : (testRuns(ledger.entries(on)).find((r) => r.request.runId === last!.request.runId)?.result ?? null);
	return own?.verdict === "green" ? own : null;
}

/**
 * D4b, before any transaction (no gh call holds the ledger's lock): the authority's green at S when the PR's head `head` is S
 * (`identical`, no gh call) or passes `decisionLogFault` on GitHub's compare of the two (`ghCompare`); else null, and the request
 * runs as any other. A compare GitHub cannot answer completely, or a gh call that fails, carries nothing.
 */
function carryCandidate(ledger: Ledger, sources: readonly string[], pr: number, head: string, ownerRepo: string): ResultRecord | null {
	const from = carryAuthority(ledger, sources, pr);
	if (from === null) return null;
	try {
		const c = ghCompare(ownerRepo, from.sha, head, ghJson);
		return decisionLogFault(c.ok ? c.compare : null) === null ? from : null;
	} catch {
		return null;
	}
}

/** The mirror's git env (`trustedEnv`) over an empty gitconfig under the runs root. */
function mirrorEnv(root: string): Record<string, string> {
	const gitconfig = join(root, "mirror", "trusted.gitconfig");
	if (!existsSync(gitconfig)) {
		mkdirSync(dirname(gitconfig), { recursive: true, mode: 0o700 });
		writeFileSync(gitconfig, "", { mode: 0o600 });
	}
	return trustedEnv(gitconfig);
}

/** A land-first admission's decision (D4): the plan, and for a tree carry G's green main run, which is the head's result. */
export interface LandAdmission {
	plan: FastPlan;
	carryFrom: ResultRecord | null;
}

/**
 * D4's admission reads for PR `pr` at `head` on a land-first repository, before any transaction: the PR head and main fetched into the
 * runs root's mirror under `refs/as2/<run id>/`; a tree carry when X's tree is G's tree (`readMain`; a main GitHub cannot read carries
 * nothing, logged); else the fast set over the tree at X against its merge-base with main (`fastSet`), or the full suite by exception.
 * The mirror refs are dropped before it returns. A head that moved since the PR view, or a fast set the config cannot compute, refuses.
 */
function landAdmission(o: {
	ledger: Ledger; root: string; ownerRepo: string; url: string; runId: string; pr: number; head: string; ref: string; production: boolean; config: TestRunnerConfig;
	log: (s: string) => void;
}): LandAdmission {
	const env = mirrorEnv(o.root);
	const mirror = mirrorOf(o.root, o.ownerRepo, env);
	const headRef = `refs/as2/${o.runId}/head`;
	const mainRef = `refs/as2/${o.runId}/main`;
	try {
		try {
			gitSync(mirror, [...NETWORK.slice(NO_HOOKS.length), "fetch", "-q", "--no-tags", o.url, `+refs/pull/${o.pr}/head:${headRef}`, `+refs/heads/${DEFAULT_BRANCH}:${mainRef}`], env, { timeoutMs: 600_000 });
		} catch (e) {
			throw new Fail(`the fast plan could not fetch PR #${o.pr} and ${DEFAULT_BRANCH} from ${o.ownerRepo}: ${errText(e)}`, START_EXIT.failed);
		}
		const x = gitSync(mirror, ["rev-parse", "--verify", `${headRef}^{commit}`], env).toString().trim();
		if (x !== o.head) throw new Fail(`PR #${o.pr}'s head moved to ${x} after it was read at ${o.head}; request again`, START_EXIT.refused);
		try {
			const { chain, state, results } = readMain(realGh, o.ledger, o.ownerRepo);
			const gTree = state.g === null ? null : (chain.find((c) => c.sha === state.g)?.tree ?? null);
			if (state.g !== null && gTree !== null && gTree === gitSync(mirror, ["rev-parse", "--verify", `${x}^{tree}`], env).toString().trim()) {
				const verdict = mainVerdicts(results).get(state.g);
				const from = verdict === undefined ? undefined : results.find((r) => r.runId === verdict.runId);
				if (from !== undefined) return { plan: { ref: o.ref, scope: "tree", g: state.g, run: from.runId }, carryFrom: from };
			}
		} catch (e) {
			o.log(`no tree carry: main could not be read: ${errText(e)}`);
		}
		const mergeBase = gitSync(mirror, ["merge-base", x, mainRef], env).toString().trim();
		const changed = gitSync(mirror, ["diff", "--no-renames", "--name-only", "-z", mergeBase, x], env).toString("utf8").split("\0").filter((p) => p !== "");
		const tree = treeAt(mirror, x, env, true);
		const base = treeAt(mirror, mergeBase, env, false);
		let s: FastRun | FullRun;
		try {
			s = fastSet(changed, tree.files, tree.read, base.read, o.config, o.production);
		} catch (e) {
			if (e instanceof FastSetError) throw new Fail(e.message, START_EXIT.refused);
			throw e;
		}
		const plan: FastPlan = s.kind === "fast" ? { ref: o.ref, scope: "fast", files: s.files, parse: s.parse, macOnly: s.macOnly } : { ref: o.ref, scope: "full", reasons: s.reasons };
		return { plan, carryFrom: null };
	} finally {
		dropRunRefs(mirror, o.runId, env, o.log);
	}
}

/**
 * A tree carry's green (D4, § 2 The merge gate): head X's tree is G's tree, so G's green main run `from` is X's result with no run:
 * its counts, run dir, scope and host, reason `carried from main run <R> at <G> (tree equals G's)`.
 */
export function treeCarriedRun(request: TestRequested, from: TestRun): TestRun {
	if (!from.main || from.verdict !== "green") throw new Error(`test-run ${from.runId} is no green main run to carry`);
	return {
		runId: request.runId, verdict: "green", sha: request.sha, pr: request.pr, reason: `carried from main run ${from.runId} at ${from.sha} (tree equals G's)`, headAtEnd: null,
		base: null, mergeBase: null, full: from.full, solo: from.solo, failures: [], runDir: from.runDir, preflight: null,
		scope: from.scope, main: false, host: from.host, exec: from.exec,
	};
}

async function cmdStart(wl: string, pr: number, sliceArg: string | null, by: string): Promise<number> {
	const ledger = openLedger();
	const w = ledger.workload(wl);
	if (!w || w.status !== "open") throw new Fail(`no open workload ${wl}`, START_EXIT.refused);
	const config = loadConfig();
	const { ownerRepo, url } = servedOf(ledger, wl, config);
	const view = ghPrView(ownerRepo, pr);
	const entries = ledger.entries(wl);
	const instructions = ledger.instructions(wl);
	const bound = boundBranches(wl, entries, holdersOf(entries, w.holder, ledger.holders(wl)));
	// A train member is bound by Jo's `train:` or the tick's `train-board:` (PLAN wl-mvbjiettjrfpxc D2); a fix workload's
	// `train-fix:` binds its PR through that membership entry on the train (PLAN wl-mv8s8srodefytc rev 17.1 D8).
	const bindings = boundPrs(entries, instructions, ledger);
	const admissible = prAdmissible(view, bound, bindings.map((b) => b.pr));
	if (!admissible.ok) throw new Fail(admissible.reason, START_EXIT.refused);
	// A merge train lands dependencies first (§ 1b): checked on gh before the reservation; off a train nothing changes.
	const stacked = trainPrs(entries, instructions).length > 0 ? stackRefusal(ownerRepo, view) : null;
	if (stacked !== null) throw new Fail(stacked, START_EXIT.refused);
	// Admitted only through a binding: the starter's line names it (Jo's instruction, or the train's board entry), so every such run is traceable to it.
	const boundBy = bound.includes(view.headRefName) ? null : (bindings.find((b) => b.pr === view.number)?.by ?? null);
	// D4b: on a merge train, the green this request may carry to the head this start read (evidence for R, S and that head).
	const origins = new Map<string, string | null>();
	const candidate = trainPrs(entries, instructions).includes(pr)
		? carryCandidate(ledger, carrySources(ledger, wl, pr, view.headRefName, ownerRepo, origins), pr, view.headRefOid, ownerRepo)
		: null;
	if (candidate !== null) hookSync(wl, "carry-evidence");

	const root = runsRoot(process.env);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const runId = makeRunId(Date.now(), Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => (b % 36).toString(36)).join(""));
	const runDir = runDirOf(root, runId);
	const say = (s: string) => process.stderr.write(`test-runner start: ${s}\n`);
	// D4: on a land-first repository every request takes the gate. `pending` goes first, so no older success on this head counts while it
	// runs, and a refused post refuses the request; then the tree carry, the fast set, or the full suite by exception.
	let land: LandAdmission | null = null;
	if (landFirstNow(ledger, ownerRepo)) {
		const why = postStatus(realGh, ownerRepo, "pending", view.headRefOid, `as2 check requested, run ${runId}`, say);
		if (why !== null) throw new Fail(`the pending status on ${view.headRefOid} was not posted (${why}); nothing was requested`, START_EXIT.refused);
		const owner = view.headRefName.startsWith("wl/") ? ledger.workload(view.headRefName.slice(3)) : null;
		const production = w.stakes === "production" || owner?.stakes === "production";
		land = landAdmission({ ledger, root, ownerRepo, url, runId, pr, head: view.headRefOid, ref: view.headRefName, production, config, log: say });
	}
	const { slice, carried } = ledger.write(() => {
		if (candidate !== null) hookSync(wl, "carry-open");
		const now = Date.parse(ledger.now());
		const res = reservation(testRuns(ledger.entries(wl)), (id) => heartbeatOf(root, id), now);
		if (!res.ok) {
			const live = res.live.request;
			throw new Fail(`run ${live.runId} (PR #${live.pr}, slice ${live.slice}) is live on ${wl}; its test-run: settles it`, START_EXIT.refused);
		}
		// The merge train's stop hold (PLAN wl-mv8s8srodefytc § 1 D4), on the rows this transaction reads, so a stop answered since admission still holds.
		const held = trainHold({ entries: ledger.entries(wl), instructions: ledger.instructions(wl), questions: ledger.questions(wl) });
		if (held !== null) throw new Fail(held, START_EXIT.refused);
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
		// D4c: the carry commits only on the authority D4b compared (same R, same S, the head this start read), re-read from this
		// transaction's rows before this request joins them; any other falls through to the run. No gh call here: Ledger.write may run this again.
		const from = candidate === null ? null : carryAuthority(ledger, carrySources(ledger, wl, pr, view.headRefName, ownerRepo, origins), pr);
		const carry = from !== null && from.runId === candidate!.runId && from.sha === candidate!.sha ? from : null;
		const request: TestRequested = { runId, pr, sha: view.headRefOid, slice: sl, by };
		ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: sl, kind: "assumption", body: testRequestedBody(request) });
		// D4: the land-first plan rides in the admission's transaction with the request it decides.
		if (land !== null) ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: sl, kind: "assumption", body: fastPlanBody(runId, land.plan) });
		// The tree carry first (D4): X's tree is G's, so G's green main run is X's result; then the decision-log carry (D4b).
		const run = land?.carryFrom ? treeCarriedRun(request, land.carryFrom) : carry !== null ? carriedRun(request, carry) : null;
		if (run === null) return { slice: sl, carried: null };
		ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: wl, sliceId: sl, kind: "assumption", body: testRunBody(run) });
		ledger.completeSlice(sl, { by: TEST_RUNNER_BY, artifact: settleArtifact(run) });
		hookSync(wl, "carry-written");
		return { slice: sl, carried: { run, from: land?.carryFrom ?? carry! } };
	});

	if (carried !== null) {
		// D4d, after the commit: the status the run would post, outside any transaction; a failed post is logged and the green stands.
		// On a land-first repository the gate decides it (D4); a refused post records `status-failed:` and leaves the head pending.
		if (land !== null) {
			postGate({
				gh: realGh, ledger, repo: ownerRepo, head: view.headRefOid, ref: view.headRefName, pr, need: land.plan.scope === "full" ? "full" : "fast",
				result: { verdict: carried.run.verdict, sha: carried.run.sha, scope: carried.run.scope, host: carried.run.host }, wl, runId, log: say,
			});
		} else postStatus(realGh, ownerRepo, "success", view.headRefOid, `carried from run ${carried.from.runId} at ${carried.from.sha.slice(0, 7)} (decision-log only)`, say);
		process.stdout.write(`test-run ${runId} runner none sha ${view.headRefOid} slice ${slice} log none${boundBy ? ` bound-by ${boundBy}` : ""} carried ${carried.from.runId}\n`);
		return START_EXIT.ok;
	}

	try {
		const pid = spawnRunner(runDir, runId);
		process.stdout.write(`test-run ${runId} runner ${pid} sha ${view.headRefOid} slice ${slice} log ${join(runDir, "runner.log")}${boundBy ? ` bound-by ${boundBy}` : ""}\n`);
		return START_EXIT.ok;
	} catch (e) {
		const reason = `the runner did not start: ${errText(e)}`;
		try {
			recordError(ledger, wl, { runId, pr, sha: view.headRefOid, slice, by }, runDir, reason);
		} catch (e2) {
			say(`the failure could not be recorded: ${errText(e2)}`);
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

/**
 * File-backed output cannot wait for EOF held by a grandchild. Poll the exit status with a
 * deadline as well: signalling a process does not bound an unresolved stream/exited promise.
 * Each caller owns its private output directory; no output is trimmed except stderr.
 */
export async function run(cmd: string[], o: {
	cwd: string; env: Record<string, string | undefined>; timeoutMs: number; inheritStderr?: boolean;
	onSpawn?: (pid: number) => void;
}): Promise<{ code: number | null; signal: string | null; out: string; err: string }> {
	const dir = mkdtempSync(join(tmpdir(), "as2-runner-command-"));
	const outPath = join(dir, "stdout");
	const errPath = join(dir, "stderr");
	const outFd = openSync(outPath, "w", 0o600);
	const errFd = openSync(errPath, "w", 0o600);
	let p: Subprocess | undefined;
	try {
		try {
			p = spawn(cmd, { cwd: o.cwd, env: o.env, stdin: "ignore", stdout: outFd, stderr: o.inheritStderr ? "inherit" : errFd });
		} finally {
			closeSync(outFd);
			closeSync(errFd);
		}
		o.onSpawn?.(p.pid);
		const deadline = Date.now() + o.timeoutMs;
		while (p.exitCode === null && p.signalCode === null) {
			if (Date.now() >= deadline) {
				// Release the wait even if signalling is refused or Bun never reports completion.
				try { p.kill("SIGKILL"); } catch { /* the deadline still applies */ }
				throw new Stop(`command timed out after ${o.timeoutMs} ms: ${cmd.join(" ")}`);
			}
			await Bun.sleep(Math.min(25, Math.max(1, deadline - Date.now())));
		}
		return { code: p.exitCode, signal: p.signalCode ?? null, out: readFileSync(outPath, "utf8"), err: readFileSync(errPath, "utf8").trim() };
	} finally {
		p?.unref();
		rmSync(dir, { recursive: true, force: true });
	}
}

/** One wrapper call's end: its exit, and whether the outlive sweep fired on it (PLAN wl-mvq4edh02r5z40 D0; `callTimedOut`). */
type Wrapped = { code: number | null; signal: string | null; out: string; outlived: boolean };

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
	private postSweepDeadline = Infinity;
	private baseSoloCalls = 0;
	private basePrepared = false;
	private url = "";
	/** The served repo's `owner/repo` (`servedOf`), every status post's target; empty until the run resolves it. */
	private ownerRepo = "";
	/** D4: this run's `fast-plan:` of scope fast with what the check found and where it ran; null for a full run. */
	private fast: (FastFindings & { plan: FastSetPlan; host: TestHost; exec: ExecCounts | null }) | null = null;
	/** D4: the hosted part holds no Mac slot, so its checkpoints check supersession only, never the lock row. */
	private slotless = false;
	/** The installed bundle's SOURCE commit as the newest install read found it, or why SOURCE did not parse (D5's row). */
	private source: { ok: true; sha: string } | { ok: false; error: string } = { ok: false, error: "the install was not read" };
	/** D5: this process wrote its one `runner-preflight:` row (or logged why it could not). */
	private preflightRecorded = false;
	private mainExec: ExecCounts | null = null;
	private mainTree: CommitTree | null = null;
	private mainSuspects: string[] = [];
	private mainDiffs = new Map<string, string[]>();
	/** The run's place in the lock queue: its `test-requested:` entry's created_at in ms, read once at start. */
	readonly requestedAt: number;
	private readonly f: RunFacts & { base: string | null; mergeBase: string | null; preflight: string | null };

	constructor(readonly ledger: Ledger, readonly wl: string, readonly request: TestRequested, readonly config: TestRunnerConfig) {
		this.runDir = runDirOf(this.root, request.runId);
		this.stageRoot = join(this.as2root, "stage");
		this.stage = stageDirOf(request.runId, this.as2root);
		this.workDir = workDirOf(request.runId, this.as2root);
		const rec = testRuns(ledger.entries(wl)).find((r) => r.request.runId === request.runId);
		if (!rec) throw new Fail(`no test-requested: record for ${request.runId} on ${wl}`, START_EXIT.failed);
		this.requestedAt = Date.parse(rec.request.createdAt);
		this.lockDb = openLockDb(this.root);
		this.capBytes = reportCapBytes(config);
		this.f = {
			requestedSha: request.sha, fetchedSha: null, error: null, full: null, fullTimedOut: false, solo: [], headAtStart: request.sha, headAtEnd: null, owner: true, sliceState: null, baseRuns: null,
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

	/**
	 * Wait for the lock (queued, oldest request first), take it clean or from a stale holder, and publish `current` in that same
	 * transaction. Every attempt is one BEGIN IMMEDIATE transaction: register in `queue` (a no-op once registered; a row pruned
	 * while this run was suspended comes back with the same requestedAt), prune the dead waiters ahead and find the first live
	 * one, then the holder check; a live holder or a live waiter ahead keeps the run queued. Taking the lock removes the run's row.
	 */
	async acquire(): Promise<void> {
		const waitStart = Date.now();
		const pollMs = msEnv("AGENT_SYSTEM_TEST_RUNNER_POLL_MS", 2_000);
		mkdirSync(this.stageRoot, { recursive: true });
		// A merge train's run never ends on the wait cap (`queuedTooLong`); membership only grows while a train is open, so it is read once.
		const train = trainPrs(this.ledger.entries(this.wl), this.ledger.instructions(this.wl)).length > 0;
		try {
			for (;;) {
				let took: { displaced: string | null } | null = null;
				try {
					took = this.lockDb.transaction(() => {
						this.lockDb.query("INSERT OR IGNORE INTO queue (runId, workloadId, requestedAt) VALUES (?, ?, ?)").run(this.id, this.wl, this.requestedAt);
						const blocker = this.queueBlocker();
						const row = lockRow(this.lockDb);
						if (row && row.runId !== this.id && !lockHolderStale(row.heartbeatAt, Date.now())) return null;
						if (blocker !== null) return null;
						this.lockDb.query("INSERT OR REPLACE INTO lock (id, runId, pid, pgid, runDir, heartbeatAt) VALUES (1, ?, ?, ?, ?, ?)")
							.run(this.id, process.pid, process.pid, this.runDir, Date.now());
						this.lockDb.query("DELETE FROM queue WHERE runId = ?").run(this.id);
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
				if (queuedTooLong(waitStart, Date.now(), this.config, train)) throw new Stop("queued too long");
				hookMark(this.id, "queued");
				await Bun.sleep(pollMs);
			}
		} catch (e) {
			this.leaveQueue();
			throw e;
		}
	}

	/**
	 * Inside the acquiring transaction, after this run registered: the first live waiter ahead of it in (requestedAt, run id)
	 * order, or null. Each waiter ahead is judged on its ledger record and heartbeat file (`queueWaiterLive`, one entries read
	 * per workload); the dead ones before the first live one are deleted.
	 */
	private queueBlocker(): string | null {
		const rows = this.lockDb.query<QueueRow, []>("SELECT runId, workloadId, requestedAt FROM queue ORDER BY requestedAt, runId").all();
		// Priority comes from the durable request, not a second queue flag/schema that could drift.
		const standing = testRuns(this.ledger.entries(STANDING_WORKLOAD_ID));
		for (const row of rows) row.main = standing.some((r) => r.request.runId === row.runId && r.request.main !== undefined);
		// An admitted main process may not have registered its queue row yet. Reserve its priority now so a waiting PR
		// cannot slip into the Mac slot between main settlement and its successor's process startup.
		if (this.request.main === undefined) {
			for (const rec of standing) {
				if (rec.request.main === undefined || rows.some((r) => r.runId === rec.request.runId)) continue;
				if (recordLive(rec, heartbeatOf(this.root, rec.request.runId), Date.now())) {
					rows.push({ runId: rec.request.runId, workloadId: STANDING_WORKLOAD_ID, requestedAt: Date.parse(rec.request.createdAt), main: true });
				}
			}
		}
		const records = new Map<string, RunRecord[]>();
		const now = Date.now();
		const { blocker, dead } = queueAhead(rows, this.id, (q) => {
			let recs = records.get(q.workloadId);
			if (!recs) records.set(q.workloadId, (recs = testRuns(this.ledger.entries(q.workloadId))));
			return queueWaiterLive(recs.find((r) => r.request.runId === q.runId), heartbeatOf(this.root, q.runId), now);
		});
		const prune = this.lockDb.query("DELETE FROM queue WHERE runId = ?");
		for (const runId of dead) prune.run(runId);
		if (dead.length > 0) this.log(`pruned the dead waiters ${dead.join(", ")} from the lock queue`);
		return blocker;
	}

	/** Leave the lock queue (best effort): when acquire ends without the lock, and at the end of the run. */
	private leaveQueue(): void {
		try {
			busyLoop(() => this.lockDb.query("DELETE FROM queue WHERE runId = ?").run(this.id));
		} catch (e) {
			this.log(`the lock queue row was not removed: ${errText(e)}`);
		}
	}

	/**
	 * Before each phase and wrapper call (§ 2.3 step 1, losing the lock): the row still holds this run, and `current` is (re)published
	 * under that check. A slotless phase (D4's hosted part) holds no row, so it checks only that the run was not superseded.
	 */
	async checkpoint(phase: string): Promise<void> {
		await hook(this.id, `phase-${phase}`);
		if (this.superseded) throw new Superseded(this.superseded);
		if (this.slotless) return;
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
		const outliveMs = msEnv("AGENT_SYSTEM_TEST_RUNNER_OUTLIVE_MS", OUTLIVE_MS);
		let outlived = false;
		const watchdog = capMs === null ? null : setTimeout(() => {
			outlived = true;
			this.log(`${call.sub} outlived its cap by ${outliveMs / 1000} s; sweeping`);
			void this.wrap({ sub: "sweep", runId: this.id }).catch((e) => this.log(`the outlive sweep failed: ${errText(e)}`));
		}, capMs + outliveMs);
		const r = await run(argv, {
			cwd: this.as2root, env: process.env,
			timeoutMs: (capMs ?? 0) + outliveMs + 120_000, inheritStderr: true,
			onSpawn: (pid) => {
				hookMark(this.id, `spawn-${call.sub}`, { pid });
				this.log(`${argv.slice(4).join(" ")}: started pid ${pid}`);
			},
		}).finally(() => clearTimeout(watchdog ?? undefined));
		const { out } = r;
		if (out.trim()) process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
		this.log(`${argv.slice(4).join(" ")} → ${r.signal ?? `exit ${r.code}`}${outlived ? " (after the outlive sweep)" : ""}`);
		return { code: r.code, signal: r.signal, out, outlived };
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

	/** The install facts of the runner's own checkout (REPO_ROOT) against the install, and their verdict; the SOURCE commit is kept for D5's row. */
	private decideInstall(): { facts: InstallFacts; v: InstallVerdict } {
		const spec = this.install;
		const facts = readInstall({ checkout: REPO_ROOT, libexec: spec.libexec, root: this.as2root, sudoers: spec.sudoers, dscl: spec.dscl });
		this.source = facts.source.ok ? { ok: true, sha: facts.source.source.sourceSha } : { ok: false, error: facts.source.error };
		return { facts, v: installDecision(facts, spec.ids) };
	}

	/**
	 * D5: this process's one `runner-preflight:` row on the standing workload, `ok` when `refusal` is null, else `refused <refusal>`,
	 * naming the bundle's SOURCE commit (`decideInstall`) and the runner's own root (REPO_ROOT; the verified-root self-check is
	 * sl-fast-verifier's). A SOURCE that did not parse is a refusal, its sha written as forty zeros, which names no commit. A row
	 * that cannot be written is one runner.log line naming why; it never changes the run.
	 */
	private recordPreflight(refusal: string | null): void {
		if (this.preflightRecorded) return;
		this.preflightRecorded = true;
		const src = this.source;
		const reasons = [...(refusal === null ? [] : [refusal]), ...(src.ok ? [] : [`the bundle SOURCE did not parse (${src.error}), so the sha written is forty zeros`])];
		try {
			const body = runnerPreflightBody({ ok: reasons.length === 0, reason: reasons.length === 0 ? null : reasons.join("; "), source: src.ok ? src.sha : "0".repeat(40), root: REPO_ROOT });
			this.ledger.write(() => {
				ensureStandingWorkload(this.ledger);
				this.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body });
			});
			this.log(body);
		} catch (e) {
			this.log(`runner-preflight: not recorded: ${errText(e)}`);
		}
	}

	/** D5's row for a preflight that threw: refused with the stop's reason; a superseded run decided nothing, which is logged. */
	private preflightThrew(e: unknown): void {
		if (e instanceof Superseded) this.log(`runner-preflight: not recorded: the run was superseded before its preflight decided (${e.message})`);
		else this.recordPreflight(e instanceof Stop || e instanceof Fail ? e.message : `the runner failed: ${errText(e)}`);
	}

	/**
	 * `sudo -n <libexec>/refresh`, with no argument (PLAN wl-mv718fxhwwcn40 § 1.3), capped at REFRESH_TIMEOUT_MS (the test knobs
	 * AGENT_SYSTEM_TEST_RUNNER_REFRESH_CAP_MS, _GRACE_MS and _REAP_MS shorten it): SIGTERM, SIGKILL after the grace, then at most
	 * REFRESH_REAP_MS more for sudo to exit, and `exited: false` when it has not. Its stdout and stderr go to run-dir files,
	 * never pipes a root grandchild could hold open past the cap, and are then copied into runner.log.
	 */
	async refresh(): Promise<{ code: number | null; signal: string | null; timedOut: boolean; exited: boolean; cap: string; reap: string; out: string; err: string }> {
		const argv = ["sudo", "-n", join(this.install.libexec, "refresh")];
		const capMs = msEnv("AGENT_SYSTEM_TEST_RUNNER_REFRESH_CAP_MS", REFRESH_TIMEOUT_MS);
		const graceMs = msEnv("AGENT_SYSTEM_TEST_RUNNER_REFRESH_GRACE_MS", REFRESH_KILL_GRACE_MS);
		const reapMs = msEnv("AGENT_SYSTEM_TEST_RUNNER_REFRESH_REAP_MS", REFRESH_REAP_MS);
		const outFile = join(this.runDir, "refresh.out");
		const errFile = join(this.runDir, "refresh.err");
		const outFd = openSync(outFile, "w", 0o600);
		const errFd = openSync(errFile, "w", 0o600);
		let p: Subprocess;
		try {
			p = spawn(argv, { cwd: this.as2root, env: process.env, stdin: "ignore", stdout: outFd, stderr: errFd });
		} finally {
			closeSync(outFd);
			closeSync(errFd);
		}
		this.log(`${argv.join(" ")}: started`);
		// sudo runs as root, so the kernel may refuse Jo's signal to it: a refusal is logged, never thrown. Under test, the
		// `<run id>.refresh-signal.refuse` hook file stands in for that refusal.
		const signal = (sig: "SIGTERM" | "SIGKILL") => {
			const h = hookMark(this.id, "refresh-signal", { sig });
			if (h && existsSync(`${h.base}.refuse`)) {
				this.log(`${argv.join(" ")}: ${sig} refused: the test hook ${h.base}.refuse`);
				return;
			}
			try {
				p.kill(sig);
			} catch (e) {
				this.log(`${argv.join(" ")}: ${sig} refused: ${(e as Error).message}`);
			}
		};
		let timedOut = false;
		let timer: Timer | undefined;
		const exited = await new Promise<boolean>((done) => {
			void p.exited.then(() => done(true));
			timer = setTimeout(() => {
				timedOut = true;
				signal("SIGTERM");
				timer = setTimeout(() => {
					signal("SIGKILL");
					timer = setTimeout(() => done(false), reapMs);
				}, graceMs);
			}, capMs);
		});
		clearTimeout(timer);
		const [out, err] = [outFile, errFile].map((f) => {
			let text = "";
			try {
				text = readFileSync(f, "utf8");
			} catch {
				// nothing written
			}
			rmSync(f, { force: true });
			return text;
		}) as [string, string];
		if (out.trim()) process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
		if (err.trim()) process.stderr.write(err.endsWith("\n") ? err : `${err}\n`);
		// The cap and the reap wait in words: whole minutes as `N min`, anything else (a test knob's) in seconds.
		const words = (ms: number) => (ms % 60_000 === 0 ? `${ms / 60_000} min` : `${ms / 1000} s`);
		const [cap, reap] = [words(capMs), words(reapMs)];
		const r = { code: exited ? p.exitCode : null, signal: exited ? (p.signalCode ?? null) : null, timedOut, exited, cap, reap, out, err };
		const ended = exited ? (r.signal ?? `exit ${r.code}`) : `still running ${reap} after its SIGKILL`;
		this.log(`${argv.join(" ")} → ${ended}${timedOut ? ` (past its ${cap} cap)` : ""}`);
		return r;
	}

	/**
	 * The install half of the preflight (§ 3.1; PLAN wl-mv718fxhwwcn40 § 1.3), before any wrapper call runs the installed `exec`.
	 * A drift the refresh helper can fix (`file-drift`, `input-drift`) gets one `refresh` and one decision more, never a loop; an
	 * `install` failure, which only setup fixes, stops the run as it is. Every stop is the run's `error` verdict and nothing more.
	 * Returns the install verdict, whose summary carries the helper's `refreshed <old12>..<new12>` line when it ran.
	 */
	async installCheck(): Promise<Verdict> {
		await this.checkpoint("install");
		const stop: (reason: string) => never = (reason) => {
			this.f.preflight = `preflight: ${reason}`;
			throw new Stop(this.f.preflight);
		};
		let { facts, v } = this.decideInstall();
		let refreshed: string | null = null;
		if (!v.ok && v.kind !== "install") {
			this.log(`preflight: ${v.reason}; running the refresh helper`);
			const r = await this.refresh();
			if (r.code !== REFRESH_EXIT.ok) {
				// The REFRESH_EXIT name of the code (`fetch` for 70); `failed` for a code the helper does not define, such as sudo's own refusal.
				const name = Object.entries(REFRESH_EXIT).find(([, c]) => c === r.code)?.[0] ?? "failed";
				const how = !r.exited ? `still running ${r.reap} after its SIGKILL` : r.code === null ? `ended by ${r.signal ?? "a signal"}` : `${name} (exit ${r.code})`;
				const cap = r.timedOut ? ` after the runner's ${r.cap} cap` : "";
				// Past the cap, a sudo with no exit code of its own (never reaped, or ended by the runner's signal) says
				// nothing of the root helper under it, which may still be running and holding refresh.d/lock. This run's
				// lock, released in main's finally, is no proof it ended: the helper's own lockf lock is what serialises
				// refreshes, so the next run's refresh waits on it and exits 69 (lock) while the old helper holds it.
				const live = r.timedOut && r.code === null ? "; the helper may still be running, and the next refresh waits on its lock (exit 69, lock, while it holds it)" : "";
				stop(`${REFRESH_FAILED}: the refresh helper ${how}${cap}${live}: ${r.err.trim().split("\n").at(-1) || "no stderr"}`);
			}
			refreshed = r.out.trim().split("\n").at(-1) || null;
			({ facts, v } = this.decideInstall());
			if (!v.ok && v.kind === "input-drift" && facts.source.ok) {
				const src = facts.source.source;
				const rel = Object.keys(src.inputs).find((k) => facts.inputHashes[k] !== src.inputs[k]);
				const head = await run(["git", ...NO_HOOKS, "rev-parse", "--verify", "HEAD"], { cwd: REPO_ROOT, env: trustedEnv("/dev/null"), timeoutMs: 30_000 });
				const sha = /^[0-9a-f]{40}$/.test(head.out.trim()) ? head.out.trim().slice(0, 12) : "unknown";
				stop(`${CHECKOUT_DRIFT}: ${rel} in the runner's checkout ${REPO_ROOT} (HEAD ${sha}) differs from the bundle, which is built from origin/main ${src.sourceSha.slice(0, 12)}; bring the checkout to origin/main`);
			}
			if (!v.ok && v.kind === "file-drift") {
				const reason = v.reason;
				const file = REBUILT_FILES.find((n) => reason.startsWith(`installed ${n} `)) ?? REBUILT_FILES.join(" or ");
				stop(`${REFRESH_FAILED}: the helper exited 0 but installed ${file} does not match SOURCE`);
			}
		}
		if (!v.ok) return stop(v.reason);
		return refreshed ? { ok: true, summary: `${v.summary}; ${refreshed}` } : v;
	}

	/** The probe half of the preflight (§ 3.1), after the sweep: `probe` over the paths the runner itself resolved, decided with the install verdict; a failure is the run's `error`. */
	async preflight(install: Verdict): Promise<void> {
		await this.checkpoint("preflight");
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
		// D5, R16: a run a main run, a runner `main-red:` or an open incident cites is kept 30 days, outside KEEP_RUNS.
		const cited = this.ledger.workload(STANDING_WORKLOAD_ID) === null ? new Set<string>() : citedRuns(this.ledger.entries(STANDING_WORKLOAD_ID), Date.now());
		const prune = retentionPrune([...ids].map((id) => ({ id, at: at(id) })), cited, this.id);
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
		if (q.main !== undefined) {
			await git([...NETWORK, "fetch", "-q", "origin", q.sha], "fetching the requested main commit");
			this.f.fetchedSha = await git([...NO_HOOKS, "rev-parse", "--verify", "FETCH_HEAD^{commit}"], "reading the requested main commit");
		} else {
			await git([...NETWORK, "fetch", "-q", "origin", `+refs/pull/${q.pr}/head:refs/remotes/origin/pr/${q.pr}`, "+refs/heads/main:refs/remotes/origin/main"], "git fetch");
			this.f.fetchedSha = await git([...NO_HOOKS, "rev-parse", "--verify", `refs/remotes/origin/pr/${q.pr}^{commit}`], "reading the PR head");
		}
		if (this.f.fetchedSha !== q.sha) return null;
		await git([...NO_HOOKS, "checkout", "-q", "--detach", q.sha], "git checkout");
		this.f.headAtStart = await git([...NO_HOOKS, "rev-parse", "HEAD"], "reading HEAD");
		let changed: string[] = [];
		if (q.main !== undefined) {
			this.mainTree = treeAt(join(repo, ".git"), q.sha, env, false);
			const verdicts = mainVerdicts(mainResults(this.ledger.entries(STANDING_WORKLOAD_ID)));
			const chain = (await git([...NO_HOOKS, "rev-list", "--first-parent", `--max-count=${CHAIN_MAX}`, q.sha], "reading main suspects")).split("\n");
			for (const sha of chain) {
				if (verdicts.get(sha)?.verdict === "green") break;
				this.mainSuspects.unshift(sha);
				const diff = await git([...NO_HOOKS, "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", sha], "reading suspect changes");
				this.mainDiffs.set(sha, diff.split("\0").filter(Boolean));
			}
		} else {
			this.f.base = await git([...NO_HOOKS, "rev-parse", "--verify", "refs/remotes/origin/main^{commit}"], "reading origin/main");
			this.f.mergeBase = await git([...NO_HOOKS, "merge-base", q.sha, "refs/remotes/origin/main"], "git merge-base");
			const diff = await run(["git", ...NO_HOOKS, "diff", "--name-only", "-z", "--diff-filter=AMR", this.f.mergeBase, q.sha], { cwd: repo, env, timeoutMs: 120_000 });
			if (diff.code !== 0) throw new Stop(`git diff failed: ${diff.err.split("\n").at(-1) || `exit ${diff.code}`}`);
			changed = changedTestFiles(diff.out);
		}
		await git([...NO_HOOKS, "remote", "remove", "origin"], "git remote remove");
		// The tested commit as a branch, so the bundle carries it whatever HEAD's handling.
		await git([...NO_HOOKS, "update-ref", q.main !== undefined ? "refs/heads/as2-tested-main" : `refs/heads/as2-tested-pr-${q.pr}`, q.sha], "naming the tested commit");
		// Main has no comparison base; its migration check uses the requested main commit itself.
		await git([...NO_HOOKS, "update-ref", "refs/tags/as2-trusted-main", this.f.base ?? q.sha], "tagging the trusted base");
		const bundle = join(this.stage, "repo.bundle");
		await git([...NO_HOOKS, "bundle", "create", "-q", bundle, "--all"], "git bundle create");
		chmodSync(bundle, 0o640);
		const caps = join(this.stage, "caps.json");
		writeFileSync(caps, `${JSON.stringify({ fullCapMin: this.config.fullCapMin, soloCapMin: this.config.soloCapMin, fullWorkers: this.config.fullWorkers, fastCapMin: this.config.fastCapMin })}\n`, { mode: 0o640 });
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

	/**
	 * One part through the wrapper, then its junit and log imported into the run dir and read into a result, with the junit's text
	 * (executedFiles reads it) and whether the call timed out (`callTimedOut`: exit 124 or the outlive sweep, PLAN wl-mvq4edh02r5z40
	 * D0). After a timed-out call the wrapper's stuck capture `<part>.stuck.log` (D5) is imported too; a missing or refused capture
	 * is one runner.log line and never changes the result. `base-solo` runs the file in the base clone (D8), reports `base-solo-<i>.*`.
	 * `fast` is D4's Mac fallback: the fast set's files (`./<path>`) in one call under `fastCapMin`, reported as `fast.*`.
	 */
	async part(call: { sub: "full" } | { sub: "solo" | "base-solo"; file: string } | { sub: "fast"; files: string[] }): Promise<{ result: PartResult; junit: string | null; timedOut: boolean }> {
		await this.checkpoint(call.sub);
		const capMs = (call.sub === "full" ? this.config.fullCapMin : call.sub === "fast" ? this.config.fastCapMin : this.config.soloCapMin) * 60_000;
		const started = Date.now();
		const wrapped: WrapperCall = call.sub === "full" ? { sub: call.sub, runId: this.id } : call.sub === "fast" ? { sub: call.sub, runId: this.id, files: call.files } : { sub: call.sub, runId: this.id, file: call.file };
		const r = await this.wrap(wrapped, capMs);
		const ms = Date.now() - started;
		if (r.code === WRAPPER_EXIT.fenced) await this.fenced(call.sub);
		let name: string = call.sub;
		if (call.sub === "solo") {
			this.soloCalls++;
			name = /^part (solo-\d+)$/m.exec(r.out)?.[1] ?? `solo-${this.soloCalls}`;
		} else if (call.sub === "base-solo") {
			this.baseSoloCalls++;
			name = /^part (base-solo-\d+)$/m.exec(r.out)?.[1] ?? `base-solo-${this.baseSoloCalls}`;
		}
		const timedOut = callTimedOut(r);
		if (timedOut) this.importStuck(name);
		if (r.code === WRAPPER_EXIT.refused || r.code === WRAPPER_EXIT.failed) {
			const wrapper = `the wrapper ${r.code === WRAPPER_EXIT.refused ? "refused" : "failed"} ${call.sub} (exit ${r.code})`;
			return { result: { ...partResult({ junit: null, log: null, exit: r.code, ms }), error: timedOut ? `timeout; ${wrapper}` : wrapper }, junit: null, timedOut };
		}
		const imported = importPart(this.workDir, this.runDir, name, this.capBytes);
		const result = partResult({ ...imported, exit: r.signal !== null ? null : r.code, ms, timedOut, maxBytes: this.capBytes });
		return { result, junit: imported.junit, timedOut };
	}

	/** The wrapper's stuck capture of a timed-out part (`<part>.stuck.log`, D5) into the run dir under importReport's checks; logged, never thrown. */
	private importStuck(name: string): void {
		const file = `${name}.stuck.log`;
		try {
			const r = importReport(this.workDir, this.runDir, file, this.capBytes);
			this.log(r.error !== null ? `${file} not imported: ${r.error}` : r.text === null ? `${file} not imported: the wrapper wrote none` : `${file} imported`);
		} catch (e) {
			this.log(`${file} not imported: ${errText(e)}`);
		}
	}

	/**
	 * Each failing solo file rerun alone on base (PLAN wl-mv8s8srodefytc rev 17.1 D8, PLAN wl-mvq4edh02r5z40 D3; `baseParts`): the
	 * same file alone (`base-solo`) in a clone of the same bundle at base's sha (origin/main as the trusted phase fetched it); the
	 * full suite never runs on base. A base result without an error is cached per base sha and `./<file>` label (`baseCache`), so a
	 * second PR on the same red main reruns nothing; an error is not cached. A `full` entry an older runner cached is never read.
	 */
	async baseRuns(): Promise<void> {
		const parts = baseParts(this.f);
		const sha = this.f.base;
		if (parts.length === 0 || sha === null) return;
		const results: Record<string, PartResult> = {};
		for (const file of parts) {
			const cached = readBaseCache(this.root, sha, file);
			if (cached !== null) {
				this.log(`base ${file} at ${sha}: cached`);
				results[file] = cached;
				continue;
			}
			if (!this.basePrepared) {
				await this.checkpoint("base-prepare");
				const r = await this.wrap({ sub: "base-prepare", runId: this.id, sha });
				if (r.code === WRAPPER_EXIT.fenced) await this.fenced("base-prepare");
				if (r.code !== WRAPPER_EXIT.ok) {
					this.log(`base-prepare failed: ${r.signal ?? `exit ${r.code}`}; the comparison stands without base`);
					break;
				}
				this.basePrepared = true;
			}
			const { result } = await this.part({ sub: "base-solo", file });
			await this.sweep(`base ${file}`);
			if (result.error === null) writeBaseCache(this.root, sha, file, result);
			results[file] = result;
		}
		this.f.baseRuns = { sha, parts: results };
	}

	/** `git ls-remote <origin> refs/pull/<N>/head` with the trusted settings (§ 2.3 step 5); null when it cannot answer. */
	async headNow(timeoutMs = 120_000): Promise<string | null> {
		const pr = this.request.pr;
		const r = await run(["git", ...NETWORK, "ls-remote", this.url, `refs/pull/${pr}/head`], {
			cwd: this.runDir, env: trustedEnv(join(this.runDir, "trusted.gitconfig")), timeoutMs,
		});
		if (r.code !== 0) {
			this.log(`ls-remote failed: ${r.err.split("\n").at(-1) || `exit ${r.code}`}`);
			return null;
		}
		return new RegExp(`^([0-9a-f]{40})\\trefs/pull/${pr}/head$`, "m").exec(r.out)?.[1] ?? null;
	}

	/**
	 * Steps in the plan's order: lock and publish → install check (and refresh) → sweep → probe, then the `runner-preflight:` row →
	 * retention → trusted → prepare → the full part and its sweep → the solo parts `soloPlan` names (none after a timed-out full
	 * part), a sweep after each → base runs (none after a timeout) → post-sweep finalization deadline → head re-check. A run whose
	 * admission recorded a `fast-plan:` of scope fast takes `fastBody` instead (D4); a plan of scope full runs these steps.
	 */
	async body(): Promise<void> {
		if (this.request.main !== undefined) {
			const repo = this.request.main.repo;
			if (!this.config.repos.some((r) => r.origin.toLowerCase() === repo.toLowerCase())) throw new Stop(`the test runner does not serve main repository ${repo}`);
			this.ownerRepo = repo;
			this.repo = REPO_ROOT;
			this.url = process.env.AGENT_SYSTEM_TEST_RUNNER_ORIGIN || `https://github.com/${repo}.git`;
		} else ({ url: this.url, repo: this.repo, ownerRepo: this.ownerRepo } = servedOf(this.ledger, this.wl, this.config));
		const fastPlan = fastPlanOf(this.ledger.entries(this.wl), this.id);
		if (fastPlan?.scope === "fast") return this.fastBody(fastPlan);
		await this.acquire();
		await this.macPreflight();
		await this.retention();
		const changed = await this.trusted();
		if (changed === null) return;
		await this.prepare();
		this.log(`full workers ${this.config.fullWorkers}`);
		const full = await this.part({ sub: "full" });
		this.f.full = full.result;
		this.f.fullTimedOut = full.timedOut;
		if (this.request.main !== undefined && full.junit !== null) {
			const counted = execOf(full.junit, this.mainTree!.files.filter(isBunTestFile));
			if (counted.ok) this.mainExec = counted.exec;
			else this.f.error = `main executed counts could not be read from full.xml: ${counted.error}`;
		}
		await this.sweep("full");
		const plan = soloPlan({ full: full.result, timedOut: full.timedOut, changed, executed: full.junit === null ? [] : executedFiles(full.junit) });
		if (plan.stop) this.log("full part timed out: no solo or base parts");
		else {
			this.log(`solo parts: ${plan.files.join(" ") || "none"}`);
			for (const file of plan.files) {
				this.f.solo.push({ file, ...(await this.part({ sub: "solo", file })).result });
				await this.sweep(file);
			}
			if (this.request.main === undefined) await this.baseRuns();
		}
		await this.headRecheck();
	}

	/** The Mac preflight under the lock (§ 3.1): install check (and refresh), sweep, probe; then D5's row, ok or refused with the stop's reason. */
	private async macPreflight(): Promise<void> {
		try {
			const install = await this.installCheck();
			await this.sweep("publish");
			await this.preflight(install);
		} catch (e) {
			this.preflightThrew(e);
			throw e;
		}
		this.recordPreflight(null);
	}

	/** The post-sweep finalization deadline, then the head re-check (§ 2.3 step 5). */
	private async headRecheck(): Promise<void> {
		this.postSweepDeadline = Date.now() + msEnv("AGENT_SYSTEM_TEST_RUNNER_FINALIZE_MS", 150_000);
		this.log(`post-sweep finalization started; deadline ${new Date(this.postSweepDeadline).toISOString()}`);
		await hook(this.id, "head-recheck", {}, this.postSweepDeadline);
		this.f.headAtEnd = this.request.main !== undefined ? this.f.fetchedSha : await this.headNow(Math.max(1, this.postSweepDeadline - Date.now()));
	}

	/**
	 * D4's fast run, holding no Mac slot: the preflight's install read (no refresh: the hosted check runs none of the Mac install,
	 * so a refusal is recorded and logged and the check goes on), then D5's row → trusted → the parse check over the plan's parse
	 * targets at the tree (one that does not transpile makes the run red and nothing runs) → the hosted check (`hosted`) → on a
	 * dispatch failure, other workflow code or no result, the one Mac fallback (`macFast`) → the head re-check.
	 */
	private async fastBody(plan: FastSetPlan): Promise<void> {
		this.fast = { plan, host: "linux", parse: [], missing: [], exec: null };
		this.slotless = true;
		const { v } = this.decideInstall();
		this.f.preflight = v.ok ? v.summary : `preflight: ${v.reason}`;
		if (!v.ok) this.log(`preflight: ${v.reason}; the hosted fast check runs none of the Mac install, so it goes on (a Mac fallback refreshes or stops on it)`);
		this.recordPreflight(v.ok ? null : v.reason);
		const changed = await this.trusted();
		if (changed === null) return;
		const tree = treeAt(join(this.stage, "repo", ".git"), this.request.sha, trustedEnv(join(this.runDir, "trusted.gitconfig")), false);
		this.fast.parse = parseCheck(plan.parse, tree.read);
		if (this.fast.parse.length > 0) this.log(`parse check failed: ${this.fast.parse.map((p) => `${p.path} ${p.error}`).join("; ")}; the fast set does not run`);
		else if (plan.files.length === 0) throw new Stop(`fast-plan of ${this.id} names no Linux test file, so the fast check has nothing to run; name one in testRunner.fastSmoke (profile/config.yml)`);
		else {
			this.log(`parse check: ${plan.parse.length} target(s) transpile; fast set on linux: ${plan.files.join(" ")}`);
			const fallback = await this.hosted(plan);
			if (fallback !== null) await this.macFast(plan, fallback);
		}
		await this.headRecheck();
	}

	/**
	 * The hosted fast check (D4): `hostedFast` downloads the artifact into `<run dir>/hosted`, then fast.summary, fast.xml and
	 * fast.log are imported into the run dir under the report checks and judged. Returns null when judged, else the fallback's
	 * reason: hostedFast's, or an artifact whose fast.summary is missing, unreadable or names another request or sha (no result).
	 */
	private async hosted(plan: FastSetPlan): Promise<string | null> {
		const dir = join(this.runDir, "hosted");
		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		const waitMs = msEnv("AGENT_SYSTEM_TEST_RUNNER_FAST_WAIT_MS", this.config.fastWaitMin * 60_000);
		const h = await hostedFast(
			{ gh: realGh, now: () => Date.now(), sleep: (ms) => Bun.sleep(ms), log: (s) => this.log(s) },
			{ repo: this.ownerRepo, runId: this.id, sha: this.request.sha, files: plan.files, waitMs, pollMs: msEnv("AGENT_SYSTEM_TEST_RUNNER_FAST_POLL_MS", FAST_POLL_MS), dir },
		);
		if (!h.ok) return h.reason;
		const summary = importReport(dir, this.runDir, "fast.summary", this.capBytes);
		const s = summary.text === null ? null : parseFastSummary(summary.text);
		if (s === null) {
			const why = summary.error ?? (summary.text === null ? "it is missing" : "it is not the summary line");
			return `no result: workflow run ${h.workflowRunId}'s fast.summary is unusable: ${why}`;
		}
		if (s.request !== this.id || s.sha !== this.request.sha) {
			return `no result: workflow run ${h.workflowRunId}'s fast.summary names request ${s.request} at ${s.sha.slice(0, 12)}, not ${this.id} at ${this.request.sha.slice(0, 12)}`;
		}
		const imported = importPart(dir, this.runDir, "fast", this.capBytes);
		const timedOut = s.exit === WRAPPER_EXIT.timeout;
		this.f.full = partResult({ ...imported, exit: s.exit, ms: s.wallS * 1000, timedOut, maxBytes: this.capBytes });
		this.f.fullTimedOut = timedOut;
		this.log(`fast check on linux: workflow run ${h.workflowRunId} exit ${s.exit} in ${s.wallS} s`);
		this.judgeFast(imported.junit);
		return null;
	}

	/**
	 * D4's one Mac fallback: `fast-fallback: <run> <reason>` on the run's workload first (a write that fails is logged), then the lock,
	 * the Mac preflight, prepare and the same set once through `exec fast`, and its sweep. The hosted run is never retried.
	 */
	private async macFast(plan: FastSetPlan, reason: string): Promise<void> {
		this.log(`fast check falls back to the Mac once: ${reason}`);
		try {
			const body = fastFallbackBody(this.id, reason);
			this.ledger.write(() => this.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: this.wl, sliceId: this.request.slice, kind: "assumption", body }));
		} catch (e) {
			this.log(`fast-fallback: not recorded: ${errText(e)}; the fallback still runs, and its test-run: says host mac`);
		}
		this.fast!.host = "mac";
		this.slotless = false;
		await this.acquire();
		const install = await this.installCheck();
		await this.sweep("publish");
		await this.preflight(install);
		await this.retention();
		await this.prepare();
		const r = await this.part({ sub: "fast", files: plan.files.map((f) => `./${f}`) });
		this.f.full = r.result;
		this.f.fullTimedOut = r.timedOut;
		await this.sweep("fast");
		this.judgeFast(r.junit);
	}

	/** R12 over the fast part's JUnit (`fastExec`): the executed counts, and each planned file with no executed test; counts that cannot be read are the run's error. */
	private judgeFast(junit: string | null): void {
		const fast = this.fast!;
		if (junit === null) return;
		const e = fastExec(junit, fast.plan.files);
		if (!e.ok) {
			this.f.error = `the fast check's executed counts could not be read from fast.xml: ${e.error}`;
			return;
		}
		fast.exec = e.exec;
		fast.missing = e.missing;
		if (e.missing.length > 0) this.log(`no executed test in the fast set's ${e.missing.join(", ")}`);
	}

	/**
	 * The result (§ 2.3 steps 6–8): with the runs.db row held in a BEGIN IMMEDIATE transaction (so no
	 * takeover lands in between), one ledger transaction checks ownership and the slice's state,
	 * decides, writes `test-run:`, settles (completes the slice) when the decision says so and, for a
	 * run that is not green on a workload no lane holds, writes the `test-run-failed:` message, and for a run with a failing
	 * security test, whoever holds the workload, the `security-red:` message. The
	 * settle commits with the check it rests on: no successor request, pause or cancel lands between
	 * them, and a slice that is not open is never touched. Then `result.json`.
	 */
	finish(): TestRun {
		// Acquire BEGIN outside ledger.write's retry policy: once held, recordEntry/completeSlice
		// use nested savepoints. Only the publication loop below retries either database.
		const write = (lockMine: boolean) => this.ledger.db.transaction(() => {
			const owner = lockMine && !this.superseded && ownsRequest(testRuns(this.ledger.entries(this.wl)), this.id);
			const facts: RunFacts = { ...this.f, owner, sliceState: this.request.main === undefined ? this.ledger.slice(this.request.slice)?.state ?? null : null };
			const decided = this.fast === null ? decideRun(facts) : fastDecision(facts, this.fast);
			// A run displaced from the lock says so; decideRun's reason alone speaks only of the request.
			const lost = this.superseded ?? (lockMine ? null : `the lock row holds ${lockRow(this.lockDb)?.runId ?? "no run"}`);
			const decision = decided.verdict === "superseded" && lost ? { ...decided, reason: `${lost}; ${decided.reason}` } : decided;
			const built = buildTestRun(this.request, facts, decision, { base: this.f.base, mergeBase: this.f.mergeBase, runDir: this.runDir, preflight: this.f.preflight });
			// A fast run's row says scope fast, where it ran, and its executed counts (D4).
			const run: TestRun = this.request.main !== undefined ? { ...built, main: true, scope: "full", host: "mac", exec: this.mainExec }
				: this.fast === null ? built : { ...built, scope: "fast", host: this.fast.host, exec: this.fast.exec };
			// Exactly one settle per request, including a duplicate detached process after the first process settled.
			const prior = testRuns(this.ledger.entries(this.wl)).find((r) => r.request.runId === this.id)?.results[0];
			if (this.request.main !== undefined && prior !== undefined) return { run: prior, settled: null };
			this.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: this.wl, sliceId: sliceOf(this.request), kind: "assumption", body: testRunBody(run) });
			if (this.request.main !== undefined) {
				const verdict = mainVerdicts(mainResults(this.ledger.entries(this.wl))).get(run.sha);
				if (verdict?.runId === run.runId && verdict.verdict !== "green") {
					const failing = [...new Set(run.failures.map((f) => f.name.split(" > ")[0]!.replace(/^\.\//, "")))];
					const facts: MainRedFacts = {
						repo: this.ownerRepo, sha: run.sha, runId: run.runId, verdict: verdict.verdict, suspects: this.mainSuspects,
						failing, attribution: this.mainTree === null ? [] : attribute(this.mainSuspects, failing, this.mainDiffs, this.mainTree),
					};
					this.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: this.wl, kind: "assumption", body: mainRedFactsBody(facts) });
				}
				return { run, settled: null };
			}
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
			// PLAN wl-mvg1vs0rhnu3gg § 3.3: a failing security test reaches Jo whatever holds the workload, so this ignores heldLive.
			const security = securityRedOf(this.wl, this.request.slice, run);
			if (security) {
				this.ledger.enqueue({ by: TEST_RUNNER_BY, workloadId: this.wl, sliceId: this.request.slice, sender: TEST_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: securityRedBody(security) });
			}
			return { run, settled };
		}).immediate();
		let published: { run: TestRun; settled: { ok: true } | { ok: false; reason: string } | null };
		for (;;) {
			try {
				// Even an expired head/result guard gets one nonblocking attempt to record its error.
				published = this.held
					? this.lockDb.transaction(() => write(lockRow(this.lockDb)?.runId === this.id)).immediate()
					: write(true);
				break;
			} catch (e) {
				if (!isBusy(e)) throw e;
				hookMark(this.id, "publication-busy");
				const remaining = this.postSweepDeadline - Date.now();
				if (remaining <= 0) throw new Stop("post-sweep deadline exceeded during publication");
				Bun.sleepSync(Math.min(50, remaining));
				if (Date.now() >= this.postSweepDeadline) throw new Stop("post-sweep deadline exceeded during publication");
			}
		}
		const { run, settled } = published;
		this.log(`test-run ${run.verdict}${run.reason ? `: ${run.reason}` : ""}`);
		if (settled?.ok) this.log(`settled ${this.request.slice}`);
		else if (settled) this.log(`the settle of ${this.request.slice} was refused: ${settled.reason}`);
		this.writeResult(run);
		return run;
	}

	private writeResult(run: TestRun): void {
		const tmp = join(this.runDir, `.result.${process.pid}.json`);
		try {
			writeFileSync(tmp, resultJson(run), { mode: 0o600 });
			renameSync(tmp, join(this.runDir, "result.json"));
		} catch (e) {
			this.log(`result.json not written: ${errText(e)}`);
		} finally {
			rmSync(tmp, { force: true });
		}
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
			if (!Number.isFinite(this.postSweepDeadline)) this.postSweepDeadline = Date.now() + msEnv("AGENT_SYSTEM_TEST_RUNNER_FINALIZE_MS", 150_000);
			try {
				await hook(this.id, "result", {}, this.postSweepDeadline);
				if (Date.now() >= this.postSweepDeadline) throw new Stop("post-sweep deadline exceeded before publication");
			} catch (e) {
				this.f.error = errText(e);
				this.log(`stopped: ${this.f.error}`);
			}
			// Synchronous SQLite waits cannot be interrupted by JS timers. Publication retries
			// nonblocking BEGINs against the shared deadline, not nested fixed retry budgets.
			this.lockDb.exec("PRAGMA busy_timeout = 0");
			this.ledger.db.exec("PRAGMA busy_timeout = 0");
			let run: TestRun;
			try {
				run = this.finish();
			} catch (e) {
				// A locked/unavailable ledger cannot accept a transaction. Preserve a local
				// error verdict instead of silently leaving no artifact; never settle here.
				const reason = `result publication failed: ${errText(e)}${this.f.error ? `; ${this.f.error}` : ""}`;
				const built = buildTestRun(this.request, this.f, { verdict: "error", outcome: "error", reason, settle: false }, {
					base: this.f.base, mergeBase: this.f.mergeBase, runDir: this.runDir, preflight: this.f.preflight,
				});
				const run: TestRun = this.request.main !== undefined ? { ...built, main: true, exec: this.mainExec }
					: this.fast === null ? built : { ...built, scope: "fast", host: this.fast.host, exec: this.fast.exec };
				this.log(`test-run error: ${reason}`);
				this.writeResult(run);
				if (this.request.main !== undefined) {
					// The ledger is unavailable: result.json and runner.log retain the error, and the tick reaps the request.
					// Revocation must not depend on a working ledger or on another logging write succeeding.
					const log = (s: string) => this.log(s);
					revokeOpen(realGh, this.request.main.repo, `main ${run.sha.slice(0, 7)} publication error, run ${run.runId}: ${reason}`, log);
					postStatus(realGh, this.request.main.repo, "error", run.sha, `main full publication error, run ${run.runId}`, log, MAIN_FULL_STATUS);
				}
				return START_EXIT.failed;
			}
			if (this.request.main !== undefined) {
				await hook(this.id, "main-published", {}, this.postSweepDeadline);
				const log = (s: string) => {
					this.log(s);
					this.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: this.wl, kind: "assumption", body: `main-publication: ${this.id} ${s.replace(/\s+/g, " ")}` });
				};
				const verdict = mainVerdicts(mainResults(this.ledger.entries(this.wl))).get(run.sha);
				if (verdict?.verdict === "green") promoteMain(this.ledger, this.ownerRepo, run.sha, log);
				else revokeOpen(realGh, this.ownerRepo, `main ${run.sha.slice(0, 7)} ${verdict?.verdict ?? run.verdict}, run ${run.runId}`, log);
				const state = verdict?.verdict === "green" ? "success" : verdict !== undefined ? "failure" : "error";
				postStatus(realGh, this.ownerRepo, state, run.sha, `main full ${verdict?.verdict ?? run.verdict}, run ${run.runId}`, log, MAIN_FULL_STATUS);
				return 0;
			}
			// Only a terminal state, and only on the sha the fetch confirmed this run tested (trusted's sha check). On a land-first
			// repository (a `fast-plan:` in the admission) the gate decides the state (D4); else today's mapping. Neither throws.
			const plan = fastPlanOf(this.ledger.entries(this.wl), this.id);
			const state = this.f.fetchedSha === run.sha ? FULL_SUITE_STATE[run.verdict] : undefined;
			if (state && plan !== null) {
				postGate({
					gh: realGh, ledger: this.ledger, repo: this.ownerRepo, head: run.sha, ref: plan.ref, pr: run.pr, need: plan.scope === "full" ? "full" : "fast",
					result: { verdict: run.verdict, sha: run.sha, scope: run.scope, host: run.host }, wl: this.wl, runId: this.id, log: (s) => this.log(s),
				});
			} else if (state) postStatus(realGh, this.ownerRepo, state, run.sha, `full suite ${run.verdict}, run ${run.runId}`, (s) => this.log(s));
			return 0;
		} finally {
			clearInterval(this.timer);
			// The run lock goes even when a refresh helper this run started may outlive it (installCheck's `live`):
			// releasing it proves nothing about that helper. Refreshes are serialised by the helper's own lockf lock
			// on refresh.d/lock, which the next run's refresh waits on (exit 69, lock, while the old helper holds it).
			if (this.request.main !== undefined) {
				try {
					// Admit before releasing the Mac: waiting PRs see the durable successor even before its process queues.
					const pending = this.lockDb.query<{ sha: string }, [string]>("SELECT sha FROM main_pending WHERE repo = ?").get(this.request.main.repo.toLowerCase());
					if (pending !== null) {
						const a = admitMain(this.ledger, this.lockDb, this.root, this.request.main.repo, pending.sha, MERGE_TRAIN_BY);
						if (a.action === "admitted") {
							try {
								spawnRunner(runDirOf(this.root, a.runId), a.runId);
							} catch (e) {
								recordError(this.ledger, this.wl, findRequest(this.ledger, a.runId)!.request, runDirOf(this.root, a.runId), `the pending main runner did not start: ${errText(e)}`);
								throw e;
							}
						}
					}
				} catch (e) {
					const reason = `pending main admission failed: ${errText(e)}; the tick must request the tip again`;
					this.log(reason);
					this.ledger.recordEntry({ by: TEST_RUNNER_BY, workloadId: this.wl, kind: "assumption", body: `main-publication: ${this.id} ${reason}` });
				}
			}
			if (this.held) {
				this.lockDb.exec("PRAGMA busy_timeout = 100");
				try {
					busyLoop(() => this.lockDb.query("DELETE FROM lock WHERE runId = ?").run(this.id));
				} catch (e) {
					this.log(`the lock was not released: ${errText(e)}`);
				}
			}
			this.leaveQueue();
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
	if (found.request.main !== undefined && testRuns(ledger.entries(found.workloadId)).find((r) => r.request.runId === runId)?.results.length) return START_EXIT.ok;
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

const USAGE = "usage: test-runner.ts start <wl> <pr> [--slice <id>] --requested-by <laneId> | run <run id> | reap | main --repo <owner/repo> --sha <sha> | promote --sha <sha>";

/**
 * `reap` (D6, R37; surface/scripts/train-tick.ts `LandDeps.runner`): settle every admitted request with no settle and no live
 * heartbeat `runner died`; admits nothing. Exit 0 whether it settled some or none (none is a no-op); a workload it could not
 * settle on is exit 3 (`START_EXIT.failed`) naming each, after the others were settled, and the tick requests no main run that pass.
 */
function cmdReap(): number {
	const { settled, failed } = reap(openLedger(), runsRoot(process.env));
	process.stdout.write(settled.length === 0 ? "reaped none\n" : `reaped ${settled.join(" ")}\n`);
	if (failed.length > 0) throw new Fail(`reap could not settle on ${failed.join("; ")}; the next reap tries again`, START_EXIT.failed);
	return START_EXIT.ok;
}

/** `main --repo --sha` (D5): admit a main run (spawning it), replace the pending target, or nothing; one line on stdout. */
function cmdMain(repo: string, sha: string): number {
	const ledger = openLedger();
	const root = runsRoot(process.env);
	mkdirSync(root, { recursive: true, mode: 0o700 });
	const db = openLockDb(root);
	try {
		const a = admitMain(ledger, db, root, repo, sha, MERGE_TRAIN_BY);
		if (a.action === "admitted") {
			try {
				spawnRunner(runDirOf(root, a.runId), a.runId);
			} catch (e) {
				const reason = `the runner did not start: ${errText(e)}`;
				recordError(ledger, STANDING_WORKLOAD_ID, findRequest(ledger, a.runId)!.request, runDirOf(root, a.runId), reason);
				throw new Fail(reason, START_EXIT.failed);
			}
		}
		process.stdout.write(`${a.line}\n`);
		return START_EXIT.ok;
	} finally {
		db.close();
	}
}

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
	if (cmd === "reap" && rest.length === 0) return cmdReap();
	if (cmd === "main" && rest.length === 4 && rest[0] === "--repo" && rest[2] === "--sha" && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(rest[1]!) && SHA40.test(rest[3]!)) {
		return cmdMain(rest[1]!, rest[3]!);
	}
	if (cmd === "promote" && rest.length === 2 && rest[0] === "--sha" && SHA40.test(rest[1]!)) {
		// The seam sl-fast-verifier fills (D5, § 2 The verified root): never a fake success.
		throw new Fail(`promote ${rest[1]}: not built yet (sl-fast-verifier builds the verified-root promotion); nothing was promoted`, START_EXIT.failed);
	}
	throw new Fail(USAGE, START_EXIT.usage);
}

if (import.meta.main) {
	const sub = ["run", "reap", "main", "promote"].includes(process.argv[2] ?? "") ? process.argv[2]! : "start";
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(err: unknown) => {
			const f = err instanceof Fail ? err : new Fail(errText(err), START_EXIT.failed);
			process.stderr.write(`test-runner ${sub}: ${f.message.replace(/\s+/g, " ")}\n`);
			process.exit(f.code);
		},
	);
}
