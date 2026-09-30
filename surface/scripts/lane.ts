#!/usr/bin/env bun
// The lane script (DESIGN-lane-launcher.md § 4 row "Lane script"; decisions 2, 3, 6, 8, 10, 11, 12,
// 14): one Bun file with subcommands, every ledger write through the module (P-11 row 10).
//
//   launch <wl> [--requested-by <who>]  the starter the surface execs: reserve (predicate inside the
//                                        transaction), preflight, worktree + branch, system prompt,
//                                        spawn `run` detached; prints `lane <laneId> runner <pid>`
//   run <wl> <laneId>                    the runner: one `omp --mode rpc --no-ui` child, one prompt,
//                                        lane-started:/lane-ready:/lane-exit:, park on prompt_result,
//                                        stop requests polled every STOP_POLL_MS
//   interactive <wl>                     `as2 lane <wl>`: reserve under the interactive policy, then
//                                        omp in the TUI in the foreground (--resume when recorded)
//   stop <wl>                            write the lane-stop: request; wait for lane-exit:; with no
//                                        runner alive, accept, signal omp only if the pid's start time
//                                        matches lane-started:, release
//   cleanup <wl>                         remove the worktree when clean and pushed; keep the branch
//   log <wl>                             print the runner log path and tail it
//
// Stamps: every subcommand writes as `lane-starter`, except `run`, which writes as `lane-runner`.
// Exit codes for launch/interactive: surface/src/launch.ts STARTER_EXIT.
import { type Subprocess, spawn, spawnSync } from "bun";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { LANE_RUNNER_BY, LANE_STARTER_BY, Ledger, defaultLedgerPath, type WorkloadRow } from "../../ledger/src/index";
import { decisionLogContext, repoOf } from "../src/decision-log";
import {
	branchBody, branchName, controlEntries, decideInteractive, decideLaunch, exitClass, firstPrompt, holdersOf, laneArgv, laneDiedExitBody,
	laneDiedLaunchBody, laneDir, laneEnv, laneExit, laneExitBody, laneMaxTime, laneCap, laneReadyBody, laneStarted, laneStartedBody,
	laneStopAcceptedBody, laneStopRequestBody, launchFailedBody, doneLine, pendingStop, planFirst, PRECLAIM_LEASE_MS, resolutions, resumeSession,
	STARTER_EXIT, STOP_POLL_MS, worktreeBody, worktreePath,
} from "../src/launch";
import { DECISION_LOG_ENV, LANE_TOOLS, LEASE_MS, LEASE_MS_ENV, ORCHESTRATOR_RECIPIENT } from "../src/types";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const TIER_FILE = join(REPO_ROOT, "tiers", "lane.md");
const READY_MS = 3 * 60_000;
const PROFILE = process.env.AGENT_SYSTEM_PROFILE || process.env.OMP_PROFILE || "agent-system-2";

class Fail extends Error {
	constructor(readonly stage: string, message: string, readonly code: number) {
		super(message);
	}
}

const line = (s: string): void => {
	process.stdout.write(`${s}\n`);
};
const git = (repo: string, args: string[]): { code: number; out: string; err: string } => {
	const r = spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
	return { code: r.exitCode, out: r.stdout.toString().trim(), err: r.stderr.toString().trim() };
};
const which = (bin: string): string | null => Bun.which(bin);
const home = (): string => process.env.HOME || homedir();

/** `ps -p <pid> -o lstart=`: the process start time, or null when no such process (macOS first, § 7 item 5). */
export function startTime(pid: number): string | null {
	const r = spawnSync(["ps", "-p", String(pid), "-o", "lstart="], { stdout: "pipe", stderr: "pipe" });
	const out = r.stdout.toString().trim();
	return r.exitCode === 0 && out ? out : null;
}

function openLedger(): Ledger {
	try {
		return Ledger.open(defaultLedgerPath(process.env));
	} catch (err) {
		throw new Fail("ledger", `the ledger could not be opened: ${String(err)}`, STARTER_EXIT.ledger!);
	}
}

interface Prepared {
	repo: string;
	worktree: string;
	branch: string;
	dir: string;
	systemPromptPath: string;
	sessionDir: string;
}

/** Preflight (exit 2/3/4), worktree and branch (exit 5), the system prompt file. Runs after the reservation. */
function prepare(ledger: Ledger, wl: string, interactive: boolean): Prepared {
	if (!which("omp")) throw new Fail("preflight", "no `omp` on PATH", STARTER_EXIT["no-omp"]!);
	const config = join(home(), ".omp", "profiles", PROFILE, "agent", "config.yml");
	if (!existsSync(config)) throw new Fail("preflight", `no profile config at ${config}; run: as2 install`, STARTER_EXIT["no-profile"]!);
	const repo = repoOf(ledger, wl);
	if (!repo) throw new Fail("preflight", `workload ${wl} records no repository`, STARTER_EXIT["repo-or-fence"]!);
	const top = git(repo, ["rev-parse", "--show-toplevel"]);
	if (top.code !== 0) throw new Fail("preflight", `${repo} is not a git checkout: ${top.err}`, STARTER_EXIT["repo-or-fence"]!);
	const head = git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
	const base = head.code === 0 && head.out ? head.out : git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).out;
	if (!base) throw new Fail("preflight", `the default branch of ${repo} cannot be resolved`, STARTER_EXIT["repo-or-fence"]!);
	const worktree = worktreePath(top.out, wl);
	if (worktree.startsWith(join(top.out, ".git"))) throw new Fail("preflight", `worktree ${worktree} lies inside a fenced path`, STARTER_EXIT["repo-or-fence"]!);
	const branch = branchName(wl);
	if (!existsSync(join(worktree, ".git"))) {
		mkdirSync(dirname(worktree), { recursive: true });
		const exists = git(top.out, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).code === 0;
		const add = exists ? git(top.out, ["worktree", "add", worktree, branch]) : git(top.out, ["worktree", "add", "-b", branch, worktree, base]);
		if (add.code !== 0) throw new Fail("worktree", `git worktree add failed: ${add.err || add.out}`, STARTER_EXIT.worktree!);
	}
	const dir = laneDir(wl, home());
	mkdirSync(dir, { recursive: true });
	const tier = readFileSync(TIER_FILE, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
	const systemPromptPath = join(dir, "system.md");
	writeFileSync(systemPromptPath, `${tier.trim()}\n\n${interactive ? "This lane runs in Jo's terminal; Jo is present." : "This lane runs unattended; questions go to Jo through lane_raise_question."}\n`);
	const sessionDir = join(dir, "sessions");
	mkdirSync(sessionDir, { recursive: true });
	return { repo: top.out, worktree, branch, dir, systemPromptPath, sessionDir };
}

/** The one prompt (§ 7 item 3), from the rows as they stand at launch. */
function promptFor(ledger: Ledger, w: WorkloadRow, laneId: string, p: Prepared): string {
	const entries = ledger.entries(w.id);
	const control = controlEntries(entries, holdersOf(entries, w.holder));
	const resolved = resolutions(control, ledger.questions(w.id), ledger.instructions(w.id), ledger.slices(w.id)).map((r) => ({
		...r, question: ledger.question(r.questionId)?.body ?? "",
	}));
	const logDir = process.env[DECISION_LOG_ENV] || join(p.repo, ".ai", "decision-log");
	let decisionLog = "";
	try {
		decisionLog = existsSync(logDir) ? decisionLogContext(logDir) : "";
	} catch {
		decisionLog = "";
	}
	return firstPrompt({
		workload: w, laneId, repo: p.repo, worktree: p.worktree, branch: p.branch, done: doneLine(control), planFirst: planFirst(control)?.trigger ?? null,
		decisionLog, resolved, tools: LANE_TOOLS,
	});
}

/** After a reservation, a failure writes launch-failed: and the lane-died: message and releases the pre-claim. */
function failAfterReserve(ledger: Ledger, wl: string, laneId: string, f: Fail): void {
	try {
		ledger.write(() => {
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: launchFailedBody(laneId, f.stage, f.message) });
			ledger.enqueue({ by: LANE_STARTER_BY, workloadId: wl, sender: LANE_STARTER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: laneDiedLaunchBody(laneId, f.stage, f.message) });
			ledger.releaseWorkload(wl, { by: LANE_STARTER_BY, holder: laneId });
		});
	} catch (err) {
		process.stderr.write(`lane: the failure could not be recorded: ${String(err)}\n`);
	}
}

function reserveOrExit(ledger: Ledger, wl: string, who: string, interactive: boolean): string {
	const r = ledger.reserveLane(wl, {
		by: LANE_STARTER_BY, cap: laneCap(process.env), leaseMs: PRECLAIM_LEASE_MS, requestedBy: who,
		decide: interactive ? decideInteractive : decideLaunch,
	});
	if (r.ok) return r.laneId;
	const code = /^cap\b/.test(r.reason) ? STARTER_EXIT.cap! : /^held\b/.test(r.reason) ? STARTER_EXIT.held! : /^closed\b/.test(r.reason) ? STARTER_EXIT.closed! : STARTER_EXIT["not-launchable"]!;
	throw new Fail("reserve", `${wl} not launched: ${r.reason}`, code);
}

// ---- launch --------------------------------------------------------------------------------------

function cmdLaunch(wl: string, who: string): number {
	const ledger = openLedger();
	const laneId = reserveOrExit(ledger, wl, who, false);
	try {
		const p = prepare(ledger, wl, false);
		ledger.write(() => {
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: worktreeBody(p.worktree) });
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: branchBody(p.branch) });
		});
		const log = openSync(join(p.dir, "runner.log"), "a");
		const runner = spawn(["bun", import.meta.path, "run", wl, laneId], {
			cwd: p.worktree, env: laneEnv(process.env, { workloadId: wl, laneId }), stdin: "ignore", stdout: log, stderr: log, detached: true,
		});
		runner.unref();
		line(`lane ${laneId} runner ${runner.pid}`);
		return STARTER_EXIT.ok!;
	} catch (err) {
		const f = err instanceof Fail ? err : new Fail("launch", String(err), STARTER_EXIT.unknown!);
		failAfterReserve(ledger, wl, laneId, f);
		throw f;
	}
}

// ---- run (the runner) -----------------------------------------------------------------------------

type Frame = Record<string, unknown>;

async function cmdRun(wl: string, laneId: string): Promise<number> {
	const ledger = openLedger();
	const w = ledger.workload(wl);
	if (!w) throw new Fail("run", `no workload ${wl}`, STARTER_EXIT.unknown!);
	const p = prepare(ledger, wl, false);
	const entries0 = ledger.entries(wl);
	const resume = resumeSession(controlEntries(entries0, holdersOf(entries0, w.holder)));
	const argv = laneArgv({ worktree: p.worktree, sessionDir: p.sessionDir, systemPromptPath: p.systemPromptPath, maxTime: laneMaxTime(process.env), resume });
	const ordinal = (/-(\d+)$/.exec(laneId) ?? [])[1] ?? "0";
	const frames = join(p.dir, `lane-${ordinal}.jsonl`);
	const env = laneEnv(process.env, { workloadId: wl, laneId });
	env.OMP_PROFILE = PROFILE;
	const child: Subprocess<"pipe", "pipe", "inherit"> = spawn(["omp", ...argv], { cwd: p.worktree, env, stdin: "pipe", stdout: "pipe", stderr: "inherit" });
	const send = (frame: Frame): void => {
		child.stdin.write(`${JSON.stringify(frame)}\n`);
	};
	let session: string | null = null;
	let finished = false;
	let parked = false;
	let promptDone = false;
	let stopAccepted = false;
	let ready = false;
	const record = (body: string): void => {
		ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: wl, kind: "assumption", body });
	};
	record(laneStartedBody(laneId, { pid: child.pid, start: startTime(child.pid) ?? "", session: null, argv, runnerPid: process.pid }));
	send({ id: "state", type: "get_state" });

	const finish = (code: number | null, signal: string | null): void => {
		if (finished) return;
		finished = true;
		try {
			const cur = ledger.workload(wl);
			const es = ledger.entries(wl);
			const control = controlEntries(es, holdersOf(es, cur?.holder ?? null));
			const intended = stopAccepted || parked || exitClass(control, laneId) === "intended" || (promptDone && !parked) || !cur || cur.status !== "open" || cur.holder !== laneId;
			const outcome = stopAccepted ? "stopped" : parked ? "parked" : promptDone ? "completed" : cur && cur.holder !== laneId ? "released" : "died";
			ledger.write(() => {
				if (cur && cur.status === "open" && cur.holder === laneId) ledger.releaseWorkload(wl, { by: LANE_RUNNER_BY, holder: laneId });
				record(laneExitBody(laneId, { code, signal, outcome }));
				if (!intended) {
					ledger.enqueue({ by: LANE_RUNNER_BY, workloadId: wl, sender: LANE_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body: laneDiedExitBody(laneId, outcome, code, signal) });
				}
			});
		} catch (err) {
			process.stderr.write(`runner: finalization failed: ${String(err)}\n`);
		}
	};

	const stopPoll = setInterval(() => {
		if (finished) return;
		try {
			const es = ledger.entries(wl);
			const cur = ledger.workload(wl);
			const req = pendingStop(controlEntries(es, holdersOf(es, cur?.holder ?? null)), laneId);
			if (req && !stopAccepted) {
				record(laneStopAcceptedBody(laneId, req.entryId));
				stopAccepted = true;
				send({ id: "abort", type: "abort" });
				setTimeout(() => {
					if (!finished) child.kill();
				}, 10_000);
			}
			// Renew the lease while alive (the lane row renews too; this covers a lane whose extension did not load).
			if (cur && cur.holder === laneId) {
				const n = Number(process.env[LEASE_MS_ENV]);
				ledger.claimWorkload(wl, { by: LANE_RUNNER_BY, holder: laneId, leaseMs: Number.isFinite(n) && n > 0 ? n : LEASE_MS });
			}
		} catch (err) {
			process.stderr.write(`runner: stop poll failed: ${String(err)}\n`);
		}
	}, STOP_POLL_MS);

	const onStop = (): void => {
		if (finished) return;
		try {
			record(laneStopRequestBody(laneId, "signal", LANE_RUNNER_BY));
		} catch {
			// the ledger may be gone; the abort still goes out
		}
		stopAccepted = true;
		send({ id: "abort", type: "abort" });
		setTimeout(() => {
			if (!finished) child.kill();
		}, 10_000);
	};
	process.on("SIGTERM", onStop);
	process.on("SIGINT", onStop);
	process.on("SIGHUP", () => undefined);

	const readyTimer = setTimeout(() => {
		if (!ready && !finished) {
			process.stderr.write("runner: omp did not become ready within 3 min\n");
			child.kill();
		}
	}, READY_MS);

	const reader = child.stdout.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		for (let nl = buf.indexOf("\n"); nl >= 0; nl = buf.indexOf("\n")) {
			const raw = buf.slice(0, nl);
			buf = buf.slice(nl + 1);
			if (!raw.trim()) continue;
			appendFileSync(frames, `${raw}\n`);
			let o: Frame;
			try {
				o = JSON.parse(raw) as Frame;
			} catch {
				continue;
			}
			if (!ready) {
				ready = true;
				clearTimeout(readyTimer);
				const st = "sessionFile" in o && typeof o.sessionFile === "string" ? o.sessionFile : null;
				const data = "data" in o && typeof o.data === "object" && o.data !== null ? (o.data as Frame) : null;
				session = st ?? (data && "sessionFile" in data && typeof data.sessionFile === "string" ? data.sessionFile : null);
				ledger.write(() => {
					record(laneStartedBody(laneId, { pid: child.pid, start: startTime(child.pid) ?? "", session, argv, runnerPid: process.pid }));
					record(laneReadyBody(laneId, ledger.now()));
				});
				send({ id: "p1", type: "prompt", message: promptFor(ledger, w, laneId, p) });
			} else if (!session && "sessionFile" in o && typeof o.sessionFile === "string") {
				session = o.sessionFile;
				record(laneStartedBody(laneId, { pid: child.pid, start: startTime(child.pid) ?? "", session, argv, runnerPid: process.pid }));
			}
			if (o.type === "prompt_result" || o.type === "agent_end") {
				if (!promptDone) {
					promptDone = true;
					try {
						const r = ledger.parkLane(wl, { by: LANE_RUNNER_BY, laneId, session: session ?? "" });
						parked = r.parked;
					} catch (err) {
						process.stderr.write(`runner: park failed: ${String(err)}\n`);
					}
					child.stdin.end();
				}
			}
		}
	}
	const code = await child.exited;
	clearInterval(stopPoll);
	finish(code, child.signalCode ?? null);
	return 0;
}

// ---- interactive ----------------------------------------------------------------------------------

async function cmdInteractive(wl: string): Promise<number> {
	const ledger = openLedger();
	const w = ledger.workload(wl);
	if (!w) throw new Fail("interactive", `no workload ${wl}`, STARTER_EXIT.unknown!);
	const laneId = reserveOrExit(ledger, wl, "jo", true);
	try {
		const p = prepare(ledger, wl, true);
		const es = ledger.entries(wl);
		const resume = resumeSession(controlEntries(es, holdersOf(es, w.holder)));
		ledger.write(() => {
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: worktreeBody(p.worktree) });
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: branchBody(p.branch) });
		});
		const argv = ["--cwd", p.worktree, "--session-dir", p.sessionDir, "--append-system-prompt", p.systemPromptPath, ...(resume ? ["--resume", resume] : [])];
		const env = laneEnv(process.env, { workloadId: wl, laneId });
		env.OMP_PROFILE = PROFILE;
		ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStartedBody(laneId, { pid: process.pid, start: startTime(process.pid) ?? "", session: resume, argv, runnerPid: process.pid }) });
		line(`lane ${laneId} on ${wl} in ${p.worktree} (branch ${p.branch}); first prompt copied to ${join(p.dir, "prompt.md")}`);
		writeFileSync(join(p.dir, "prompt.md"), promptFor(ledger, w, laneId, p));
		const child = spawn(["omp", ...argv], { cwd: p.worktree, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
		const code = await child.exited;
		const cur = ledger.workload(wl);
		if (cur && cur.status === "open" && cur.holder === laneId) ledger.releaseWorkload(wl, { by: LANE_STARTER_BY, holder: laneId });
		ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneExitBody(laneId, { code, signal: child.signalCode ?? null, outcome: "interactive-ended" }) });
		return code;
	} catch (err) {
		const f = err instanceof Fail ? err : new Fail("interactive", String(err), STARTER_EXIT.unknown!);
		failAfterReserve(ledger, wl, laneId, f);
		throw f;
	}
}

// ---- stop, cleanup, log ------------------------------------------------------------------------------

async function cmdStop(wl: string): Promise<number> {
	const ledger = openLedger();
	const w = ledger.workload(wl);
	if (!w) throw new Fail("stop", `no workload ${wl}`, 1);
	const es = ledger.entries(wl);
	const control = controlEntries(es, holdersOf(es, w.holder));
	const started = laneStarted(control);
	const laneId = w.holder?.startsWith("lane-") ? w.holder : started?.laneId ?? null;
	if (!laneId) {
		line(`${wl} has no lane to stop (holder ${w.holder ?? "nobody"})`);
		return 0;
	}
	const req = ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStopRequestBody(laneId, "as2-lane-stop", "jo") });
	line(`stop requested of ${laneId} (entry ${req}); waiting for lane-exit:`);
	const runnerAlive = started !== null && started.runnerPid > 0 && startTime(started.runnerPid) !== null;
	const deadline = Date.now() + (runnerAlive ? 60_000 : 0);
	while (Date.now() < deadline) {
		const e2 = ledger.entries(wl);
		if (laneExit(controlEntries(e2, holdersOf(e2, ledger.workload(wl)?.holder ?? null)), laneId)) {
			line(`${laneId} exited`);
			return 0;
		}
		await Bun.sleep(1000);
	}
	// No runner (or it did not answer): accept the request here, signal omp only when the pid is the recorded process, release.
	ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStopAcceptedBody(laneId, req) });
	if (started && started.laneId === laneId && started.pid > 0) {
		const now = startTime(started.pid);
		if (now !== null && started.start && now === started.start) {
			process.kill(started.pid, "SIGTERM");
			line(`signalled omp pid ${started.pid} (start time matches lane-started:)`);
		} else line(`omp pid ${started.pid} ${now === null ? "is gone" : "has a different start time; not signalled"}`);
	}
	const r = ledger.releaseWorkload(wl, { by: LANE_STARTER_BY, holder: laneId });
	ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneExitBody(laneId, { code: null, signal: null, outcome: "stopped", reason: "by-hand" }) });
	line(r.released ? `released ${wl} from ${laneId}` : `${wl} is held by ${r.holder ?? "nobody"}, not ${laneId}; nothing released`);
	return 0;
}

function cmdCleanup(wl: string): number {
	const ledger = openLedger();
	const repo = repoOf(ledger, wl);
	if (!repo) throw new Fail("cleanup", `workload ${wl} records no repository`, 1);
	const worktree = worktreePath(repo, wl);
	if (!existsSync(worktree)) {
		line(`no worktree at ${worktree}`);
		return 0;
	}
	const dirty = git(worktree, ["status", "--porcelain"]);
	if (dirty.out) throw new Fail("cleanup", `${worktree} is dirty; commit or stash first`, 1);
	const unpushed = git(worktree, ["log", "--oneline", "@{upstream}..HEAD"]);
	if (unpushed.code !== 0) throw new Fail("cleanup", `${branchName(wl)} has no upstream; push it first`, 1);
	if (unpushed.out) throw new Fail("cleanup", `${branchName(wl)} has unpushed commits; push first`, 1);
	const rm = git(repo, ["worktree", "remove", worktree]);
	if (rm.code !== 0) throw new Fail("cleanup", `git worktree remove failed: ${rm.err}`, 1);
	line(`removed worktree ${worktree}; branch ${branchName(wl)} kept`);
	return 0;
}

function cmdLog(wl: string): number {
	const path = join(laneDir(wl, home()), "runner.log");
	line(path);
	if (existsSync(path)) {
		const tail = readFileSync(path, "utf8").split("\n").slice(-40).join("\n");
		process.stdout.write(`${tail}\n`);
	}
	return 0;
}

// ---- main ------------------------------------------------------------------------------------------

async function main(argv: string[]): Promise<number> {
	const [cmd, wl, ...rest] = argv;
	if (!cmd || !wl) {
		process.stderr.write("usage: lane.ts launch|run|interactive|stop|cleanup|log <workload> [...]\n");
		return 1;
	}
	switch (cmd) {
		case "launch": {
			const i = rest.indexOf("--requested-by");
			return cmdLaunch(wl, i >= 0 && rest[i + 1] ? rest[i + 1]! : "by-hand");
		}
		case "run": {
			const laneId = rest[0];
			if (!laneId) throw new Fail("run", "run needs <wl> <laneId>", 1);
			return cmdRun(wl, laneId);
		}
		case "interactive":
			return cmdInteractive(wl);
		case "stop":
			return cmdStop(wl);
		case "cleanup":
			return cmdCleanup(wl);
		case "log":
			return cmdLog(wl);
		default:
			process.stderr.write(`lane.ts: unknown subcommand ${cmd}\n`);
			return 1;
	}
}

if (import.meta.main) {
	main(process.argv.slice(2)).then(
		(code) => process.exit(code),
		(err: unknown) => {
			const f = err instanceof Fail ? err : new Fail("unknown", String(err), 1);
			process.stderr.write(`lane ${f.stage}: ${f.message}\n`);
			process.exit(f.code);
		},
	);
}
