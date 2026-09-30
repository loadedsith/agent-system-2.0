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
import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fenceTargets } from "../../gates/src/fence";
import { canonicalPath } from "../../ledger/src/locality";
import { LANE_RUNNER_BY, LANE_STARTER_BY, Ledger, defaultLedgerPath, type WorkloadRow } from "../../ledger/src/index";
import { decisionLogContext, repoOf } from "../src/decision-log";
import {
	branchBody, branchName, controlEntries, decideInteractive, decideLaunch, exitClass, fencedBy, firstPrompt, holdersOf, INTENDED_OUTCOMES,
	laneArgv, laneDiedDeadlineBody, laneDiedExitBody, laneDiedLaunchBody, laneDir, laneEnv, laneExit, laneExitBody, laneMaxTime, laneCap,
	type LaneOutcome, laneReadyBody, laneStarted, laneStartedBody, laneStopAcceptedBody, laneStopRequestBody, launchFailedBody, doneLine,
	maxTimeMs, pendingStop, planFirst, PRECLAIM_LEASE_MS, resolutions, resumeFor, STARTER_EXIT, STOP_POLL_MS, worktreeBody, worktreePath,
} from "../src/launch";
import { laneDeaths } from "../src/signals";
import { DECISION_LOG_ENV, LANE_TOOLS, LEASE_MS, LEASE_MS_ENV, ORCHESTRATOR_RECIPIENT } from "../src/types";

const REPO_ROOT = resolve(import.meta.dir, "..", "..");
const TIER_FILE = join(REPO_ROOT, "tiers", "lane.md");
/** A millisecond knob from the environment, or its fallback (the fake-omp tests shorten the two waits below). */
const msEnv = (name: string, fallback: number): number => {
	const n = Number(process.env[name]);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};
/** The readiness window: the lane's own claim must land within the pre-claim lease (decisions 8, 14). */
const READY_MS = msEnv("AGENT_SYSTEM_LANE_READY_MS", PRECLAIM_LEASE_MS);
const READY_POLL_MS = 1_000;
/** After `abort` and stdin EOF, the wait before SIGKILL (§ 3 stop path). */
const END_GRACE_MS = msEnv("AGENT_SYSTEM_LANE_END_GRACE_MS", 30_000);
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
	// § 6 "fence denies the worktree path": the canonical destination against the same targets the fence denies for a command in the checkout.
	const fenced = fencedBy(canonicalPath(worktree), fenceTargets("true", top.out, process.env));
	if (fenced !== null) throw new Fail("preflight", `worktree ${worktree} lies inside a fenced path ${fenced}`, STARTER_EXIT["repo-or-fence"]!);
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
		decisionLog, resolved, machinery: canonicalPath(p.repo) === canonicalPath(REPO_ROOT), tools: LANE_TOOLS,
	});
}

/** The session this attempt resumes (decisions 6, 7, 14): the raising lane's for a resolution, else the workload's newest. */
function resumeOf(ledger: Ledger, w: WorkloadRow, laneId: string): string | null {
	const entries = ledger.entries(w.id);
	const control = controlEntries(entries, holdersOf(entries, w.holder));
	return resumeFor(control, laneId, resolutions(control, ledger.questions(w.id), ledger.instructions(w.id), ledger.slices(w.id)));
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

/**
 * The runner (§ 5 pseudocode). Lifecycle ownership starts at the first line: whatever fails after
 * the reservation — preparation, the spawn, a read, a ledger write — ends in one finalization that
 * records the end and releases the pre-claim (Codex review B3). Readiness is the lane's own claim
 * (`changed_by` = the lane id) within the pre-claim lease, never an rpc frame (B1); completion is
 * the one `prompt_result` for the prompt this runner sent, with its status kept (B2); a stop, from
 * the ledger or a signal, persists its acceptance before `abort`, then stdin EOF, then SIGKILL
 * after a bounded wait (B4).
 */
async function cmdRun(wl: string, laneId: string): Promise<number> {
	const ledger = openLedger();
	const w = ledger.workload(wl);
	if (!w) throw new Fail("run", `no workload ${wl}`, STARTER_EXIT.unknown!);
	const record = (body: string): void => {
		ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: wl, kind: "assumption", body });
	};
	const controlNow = () => {
		const es = ledger.entries(wl);
		const workload = ledger.workload(wl);
		return { workload, control: controlEntries(es, holdersOf(es, workload?.holder ?? null)) };
	};
	const maxTime = laneMaxTime(process.env);
	const spawnedAt = Date.now();
	const deadlineAt = spawnedAt + (maxTimeMs(maxTime) ?? Number.MAX_SAFE_INTEGER);
	const readyMinutes = READY_MS >= 60_000 ? `${Math.round(READY_MS / 60_000)}m` : `${Math.round(READY_MS / 1000)}s`;

	let child: Subprocess<"pipe", "pipe", "inherit"> | null = null;
	let outcome: LaneOutcome | null = null;
	let ready = false;
	let session: string | null = null;
	let ended = false;
	let finished = false;
	let argv: string[] = [];
	const timers: ReturnType<typeof setTimeout>[] = [];
	const send = (frame: Frame): void => {
		if (child && !ended) child.stdin.write(`${JSON.stringify(frame)}\n`);
	};
	const startRecord = (): string => laneStartedBody(laneId, { pid: child?.pid ?? 0, start: child ? startTime(child.pid) ?? "" : "", session, argv, runnerPid: process.pid });

	/** Once: stdin EOF, then SIGKILL after the grace period if the child has not exited. */
	const end = (): void => {
		if (ended || !child) return;
		ended = true;
		const c = child;
		try {
			c.stdin.end();
		} catch {
			// the pipe is already closed by a dead child
		}
		timers.push(setTimeout(() => {
			if (c.exitCode === null && c.signalCode === null) c.kill("SIGKILL");
		}, END_GRACE_MS));
	};

	/** Once: the exit record, the death message when the end was not intended, the conditional release. */
	const finish = (code: number | null, signal: string | null): void => {
		if (finished) return;
		finished = true;
		for (const t of timers) clearTimeout(t);
		try {
			const { workload: cur, control } = controlNow();
			const held = cur !== null && cur.status === "open" && cur.holder === laneId;
			const final: LaneOutcome = outcome ?? (!ready ? "never-ready" : held ? "died" : "released");
			const intended = INTENDED_OUTCOMES[final] || exitClass(control, laneId) === "intended";
			const inFlight = cur ? cur.open_slices + cur.paused_slices : 0;
			ledger.write(() => {
				if (held && !intended && !laneDeaths(ledger, wl).some((d) => d.holder === laneId)) {
					const body = final === "never-ready"
						? laneDiedLaunchBody(laneId, "readiness", `no claim in ${readyMinutes}`)
						: final === "deadline" ? laneDiedDeadlineBody(laneId, maxTime, inFlight) : laneDiedExitBody(laneId, final, code, signal);
					ledger.enqueue({ by: LANE_RUNNER_BY, workloadId: wl, sender: LANE_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body });
				}
				if (final === "never-ready") record(launchFailedBody(laneId, "readiness", `never ready in ${readyMinutes} (omp exit code ${code ?? "-"} signal ${signal ?? "-"})`));
				if (held) ledger.releaseWorkload(wl, { by: LANE_RUNNER_BY, holder: laneId });
				if (laneExit(control, laneId) === null) record(laneExitBody(laneId, { code, signal, outcome: final }));
			});
		} catch (err) {
			process.stderr.write(`runner: finalization failed: ${String(err)}\n`);
		}
	};

	/** A stop, from the ledger or a signal: acceptance persisted first, then abort and end (decision 14). */
	const stop = (ref: string): void => {
		if (outcome === "stop" || finished) return;
		try {
			record(laneStopAcceptedBody(laneId, ref));
		} catch (err) {
			process.stderr.write(`runner: the stop acceptance could not be written: ${String(err)}\n`);
		}
		outcome = "stop";
		send({ id: "abort", type: "abort" });
		end();
	};
	process.on("SIGTERM", () => stop("signal"));
	process.on("SIGINT", () => stop("signal"));
	process.on("SIGHUP", () => undefined);

	try {
		const p = prepare(ledger, wl, false);
		argv = laneArgv({ worktree: p.worktree, sessionDir: p.sessionDir, systemPromptPath: p.systemPromptPath, maxTime, resume: resumeOf(ledger, w, laneId) });
		const ordinal = (/-(\d+)$/.exec(laneId) ?? [])[1] ?? "0";
		const frames = join(p.dir, `lane-${ordinal}.jsonl`);
		const env = laneEnv(process.env, { workloadId: wl, laneId });
		env.OMP_PROFILE = PROFILE;
		child = spawn(["omp", ...argv], { cwd: p.worktree, env, stdin: "pipe", stdout: "pipe", stderr: "inherit" });
		const omp = child;
		record(startRecord());
		send({ id: "state", type: "get_state" });

		// Readiness (B1): the lane's own claim, stamped with its id, within the pre-claim lease; no renewal before it.
		const readyPoll = setInterval(() => {
			if (ready || finished || outcome !== null) return;
			try {
				const cur = ledger.workload(wl);
				if (cur && cur.holder === laneId && cur.changed_by === laneId) {
					ready = true;
					clearInterval(readyPoll);
					record(laneReadyBody(laneId, ledger.now()));
					send({ id: "p1", type: "prompt", message: promptFor(ledger, w, laneId, p) });
				} else if (Date.now() - spawnedAt >= READY_MS) {
					clearInterval(readyPoll);
					process.stderr.write(`runner: ${laneId} never claimed ${wl} within ${readyMinutes}; killing omp\n`);
					outcome = "never-ready";
					omp.kill("SIGKILL");
				}
			} catch (err) {
				process.stderr.write(`runner: readiness poll failed: ${String(err)}\n`);
			}
		}, READY_POLL_MS);
		timers.push(readyPoll);

		const stopPoll = setInterval(() => {
			if (finished) return;
			try {
				const { workload: cur, control } = controlNow();
				const req = pendingStop(control, laneId);
				if (req) stop(req.entryId);
				// Renew the lease while ready and alive (the lane row renews too; this covers a lane whose timer stalled).
				if (ready && outcome === null && cur && cur.holder === laneId) {
					const n = Number(process.env[LEASE_MS_ENV]);
					ledger.claimWorkload(wl, { by: LANE_RUNNER_BY, holder: laneId, leaseMs: Number.isFinite(n) && n > 0 ? n : LEASE_MS });
				}
			} catch (err) {
				process.stderr.write(`runner: stop poll failed: ${String(err)}\n`);
			}
		}, STOP_POLL_MS);
		timers.push(stopPoll);

		const reader = omp.stdout.getReader();
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
				const data = "data" in o && typeof o.data === "object" && o.data !== null ? (o.data as Frame) : null;
				const sessionFile = data && typeof data.sessionFile === "string" ? data.sessionFile : typeof o.sessionFile === "string" ? o.sessionFile : null;
				if (session === null && sessionFile !== null) {
					session = sessionFile;
					record(startRecord());
				}
				// Completion (B2): the prompt_result for this runner's one prompt, its status kept; agent_end is not an end.
				if (o.type === "prompt_result" && o.id === "p1" && outcome === null) {
					const status = typeof o.status === "string" ? o.status : "error";
					if (status === "aborted" && Date.now() >= deadlineAt) outcome = "deadline";
					else if (status === "completed") {
						try {
							const r = ledger.parkLane(wl, { by: LANE_RUNNER_BY, laneId, session: session ?? "" });
							outcome = r.parked ? (r.open > 0 ? "parked" : "resume-pending") : "completed";
						} catch (err) {
							process.stderr.write(`runner: park failed: ${String(err)}\n`);
							outcome = "completed";
						}
					} else outcome = status === "aborted" ? "aborted" : "error";
					end();
				}
			}
		}
		const code = await omp.exited;
		finish(code, omp.signalCode ?? null);
	} catch (err) {
		const f = err instanceof Fail ? err : new Fail("run", String(err), STARTER_EXIT.unknown!);
		process.stderr.write(`runner: ${f.stage}: ${f.message}\n`);
		for (const t of timers) clearTimeout(t);
		if (child === null) {
			// Before the spawn: a launch failure (decision 9), in the starter's shape; finalization has nothing to reap.
			finished = true;
			failAfterReserve(ledger, wl, laneId, f);
			return f.code;
		}
		child.kill("SIGKILL");
		const code = await child.exited;
		outcome ??= ready ? "died" : "never-ready";
		finish(code, child.signalCode ?? null);
		return f.code;
	}
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
		const resume = resumeOf(ledger, w, laneId);
		ledger.write(() => {
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: worktreeBody(p.worktree) });
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: branchBody(p.branch) });
		});
		const argv = ["--cwd", p.worktree, "--session-dir", p.sessionDir, "--append-system-prompt", p.systemPromptPath, ...(resume ? ["--resume", resume] : [])];
		const env = laneEnv(process.env, { workloadId: wl, laneId });
		env.OMP_PROFILE = PROFILE;
		line(`lane ${laneId} on ${wl} in ${p.worktree} (branch ${p.branch}); first prompt copied to ${join(p.dir, "prompt.md")}`);
		writeFileSync(join(p.dir, "prompt.md"), promptFor(ledger, w, laneId, p));
		// The TUI's ^C belongs to omp (a foreground process group signal reaches both); this wrapper waits for the exit.
		process.on("SIGINT", () => undefined);
		const spawnedAt = Date.now();
		const child = spawn(["omp", ...argv], { cwd: p.worktree, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
		// The lane's identity is OMP's process, not this wrapper's (Codex review B5): `lane.ts stop` compares this pid and start time.
		const record = (session: string | null): void => {
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStartedBody(laneId, { pid: child.pid, start: startTime(child.pid) ?? "", session, argv, runnerPid: process.pid }) });
		};
		record(resume);
		const code = await child.exited;
		// The session OMP wrote: the newest file in the lane's session dir touched since the spawn (a resumed session is the same path).
		const session = newestSession(p.sessionDir, spawnedAt);
		if (session !== null && session !== resume) record(session);
		const cur = ledger.workload(wl);
		if (cur && cur.status === "open" && cur.holder === laneId) ledger.releaseWorkload(wl, { by: LANE_STARTER_BY, holder: laneId });
		ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneExitBody(laneId, { code, signal: child.signalCode ?? null, outcome: "interactive" }) });
		return code;
	} catch (err) {
		const f = err instanceof Fail ? err : new Fail("interactive", String(err), STARTER_EXIT.unknown!);
		failAfterReserve(ledger, wl, laneId, f);
		throw f;
	}
}

/** The newest `.jsonl` under `dir` modified at or after `sinceMs` (a second of slack), or null. */
function newestSession(dir: string, sinceMs: number): string | null {
	let best: { path: string; mtime: number } | null = null;
	for (const name of existsSync(dir) ? readdirSync(dir) : []) {
		if (!name.endsWith(".jsonl")) continue;
		const path = join(dir, name);
		const mtime = statSync(path).mtimeMs;
		if (mtime >= sinceMs - 1000 && (best === null || mtime > best.mtime)) best = { path, mtime };
	}
	return best?.path ?? null;
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
	ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneExitBody(laneId, { code: null, signal: null, outcome: "stop", reason: "by-hand" }) });
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
