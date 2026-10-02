#!/usr/bin/env bun
// The lane script (DESIGN-lane-launcher.md § 4 row "Lane script"; decisions 2, 3, 6, 8, 10, 11, 12,
// 14): one Bun file with subcommands, every ledger write through the module (P-11 row 10).
//
//   launch <wl> [--requested-by <who>]  the starter the surface execs: reserve (predicate inside the
//                                        transaction), preflight, worktree + branch, system prompt,
//                                        spawn `run` detached; prints `lane <laneId> runner <pid>`
//   run <wl> <laneId>                    the runner: one `omp --mode rpc --no-ui` child, one prompt,
//                                        lane-started:/lane-ready:/lane-exit:, park on prompt_result,
//                                        stop requests and the ceiling meter (spend:, the 80 % question,
//                                        the 100 % stop) polled every STOP_POLL_MS
//   interactive <wl>                     `as2 lane <wl>`: reserve under the interactive policy, then
//                                        omp in the TUI in the foreground (--resume when recorded)
//   stop <wl>                            write the lane-stop: request; wait for lane-exit:; with no
//                                        runner alive, accept, end omp (SIGTERM, then SIGKILL after the
//                                        grace, each only while the pid's start time matches
//                                        lane-started:), release only once it is gone
//   cleanup <wl>                         remove the worktree when clean and pushed; keep the branch
//   log <wl>                             print the runner log path and tail it
//   ctx-index <wl> <laneId> --by runner|starter
//                                        after a lane's exit, detached: claim once per lane, import the
//                                        workload's sessions folder into ctx, check the lane's session by
//                                        id, record ctx-index: (MIGRATION.md item 43, src/ctx-index.ts)
//
// Stamps: every subcommand writes as `lane-starter`, except `run`, which writes as `lane-runner`, and
// `ctx-index`, which writes as the one its `--by` names.
// Exit codes for launch/interactive: surface/src/launch.ts STARTER_EXIT.
import { type Subprocess, spawn, spawnSync } from "bun";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fenceTargets } from "../../gates/src/fence";
import { canonicalPath } from "../../ledger/src/locality";
import {
	type InstructionRow, LANE_RUNNER_BY, LANE_STARTER_BY, Ledger, defaultLedgerPath, type QuestionRow, type SliceRow, type Stakes, type WorkloadRow,
} from "../../ledger/src/index";
import {
	type Ceiling, CEILING_OPTIONS, type CeilingOption, ceilingQuestionBody, crossed, effectiveCeiling, scanSpend, type Spend, spendBody, wallMinutes,
} from "../src/ceiling";
import { newLaneSession, runCtxIndex, topLevelSessions } from "../src/ctx-index";
import { decisionLogContext, repoOf } from "../src/decision-log";
import {
	branchBody, branchName, ceilingMaxTime, type ControlEntry, controlEntries, decideInteractive, decideLaunch, exitClass, fencedBy, firstPrompt, holdersOf,
	INTENDED_OUTCOMES, joInstructionsFor, LANE_MAX_TIME_ENV, laneArgv, laneDiedDeadlineBody, laneDiedExitBody, laneDiedLaunchBody, laneDir, laneEnv, laneExit, laneExitBody,
	laneMaxTime, laneCap, type LaneOutcome, laneReadyBody, laneStarted, laneStartedBody, laneStopAcceptedBody, laneStopRequestBody, launchFailedBody, doneLine,
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
const git = (repo: string, args: string[], timeoutMs?: number): { code: number; out: string; err: string; timedOut: boolean } => {
	const r = spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
	return { code: r.exitCode ?? -1, out: r.stdout.toString().trim(), err: r.stderr.toString().trim(), timedOut: r.exitedDueToTimeout === true };
};
/** The bound on the starter's `git fetch` before it cuts a branch; a fetch past it counts as failed. Well inside the 30 s the trigger gives the whole starter (surface/extensions/launch.ts). */
const FETCH_TIMEOUT_MS = msEnv("AGENT_SYSTEM_LANE_FETCH_TIMEOUT_MS", 10_000);
const which = (bin: string): string | null => Bun.which(bin);
const home = (): string => process.env.HOME || homedir();

/**
 * `ps -p <pid> -o stat=,lstart=`: the process start time, or null when no such process (macOS first, § 7 item 5).
 * A zombie (state Z) is null too: it has exited and only waits for a parent that is not reaping it (a hung or
 * SIGSTOPped runner), so no signal can end it and `lane.ts stop` must not count it as alive.
 */
export function startTime(pid: number): string | null {
	const r = spawnSync(["ps", "-p", String(pid), "-o", "stat=,lstart="], { stdout: "pipe", stderr: "pipe" });
	const out = r.stdout.toString().trim();
	if (r.exitCode !== 0 || !out) return null;
	const stat = out.split(/\s/, 1)[0]!;
	// lstart's own spacing ("Oct  2") is kept: lane-started: entries recorded with `-o lstart=` must still compare equal.
	return stat.startsWith("Z") ? null : out.slice(stat.length).trim() || null;
}

function openLedger(): Ledger {
	try {
		return Ledger.open(defaultLedgerPath(process.env));
	} catch (err) {
		throw new Fail("ledger", `the ledger could not be opened: ${String(err)}`, STARTER_EXIT.ledger!);
	}
}

interface Base {
	/** `origin/<default>` whenever that ref resolves; local `<default>` only with no `origin` or no remote default ref; `HEAD` for a detached checkout with neither. */
	ref: string;
	sha: string;
	/** The fetch's first error line, or null when it succeeded or there is no `origin`. */
	fetchFailed: string | null;
}

interface Prepared {
	repo: string;
	worktree: string;
	branch: string;
	/** Set only when this run cut the branch; a reused branch or worktree keeps the base it was cut from. */
	base: Base | null;
	dir: string;
	systemPromptPath: string;
	sessionDir: string;
}

/**
 * The base a new lane branch is cut from (DESIGN-lane-launcher.md § 4, lane script row): fetch
 * `origin` (bounded, a failure is recorded and not fatal), then `origin/<default>` whenever it
 * resolves — whether local `<default>` is ahead, behind, equal, or diverged. Jo commits locally and
 * pushes in batches, so local `<default>` may carry unpushed commits: cutting from origin keeps
 * them out of every lane branch and its PR, and local `<default>` can never block a launch. Local
 * `<default>` is the base only when there is no `origin` or no remote ref for the default.
 */
function chooseBase(repo: string): Base {
	let fetchFailed: string | null = null;
	if (git(repo, ["remote", "get-url", "origin"]).code === 0) {
		const f = git(repo, ["fetch", "--prune", "origin"], FETCH_TIMEOUT_MS);
		if (f.code !== 0) fetchFailed = f.timedOut ? `timed out after ${FETCH_TIMEOUT_MS} ms` : (f.err || f.out || `exit ${f.code}`).split("\n")[0]!;
	}
	const head = git(repo, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
	const name = head.code === 0 && head.out ? head.out.replace(/^origin\//, "") : git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).out;
	const commit = (ref: string): string | null => {
		const r = git(repo, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
		return r.code === 0 && r.out ? r.out : null;
	};
	const named = name && name !== "HEAD";
	const remote = named ? commit(`refs/remotes/origin/${name}`) : null;
	if (remote !== null) return { ref: `origin/${name}`, sha: remote, fetchFailed };
	const local = named ? commit(`refs/heads/${name}`) : null;
	if (local !== null) return { ref: name, sha: local, fetchFailed };
	const detached = name === "HEAD" ? commit("HEAD") : null;
	if (detached === null) throw new Fail("preflight", `the default branch of ${repo} cannot be resolved`, STARTER_EXIT["repo-or-fence"]!);
	return { ref: "HEAD", sha: detached, fetchFailed };
}

/** Preflight (exit 2/3/4), worktree and branch (exit 5; the base is `chooseBase`'s, never refused), the system prompt file. Runs after the reservation. */
function prepare(ledger: Ledger, wl: string, interactive: boolean): Prepared {
	if (!which("omp")) throw new Fail("preflight", "no `omp` on PATH", STARTER_EXIT["no-omp"]!);
	const config = join(home(), ".omp", "profiles", PROFILE, "agent", "config.yml");
	if (!existsSync(config)) throw new Fail("preflight", `no profile config at ${config}; run: as2 install`, STARTER_EXIT["no-profile"]!);
	const repo = repoOf(ledger, wl);
	if (!repo) throw new Fail("preflight", `workload ${wl} records no repository`, STARTER_EXIT["repo-or-fence"]!);
	const top = git(repo, ["rev-parse", "--show-toplevel"]);
	if (top.code !== 0) throw new Fail("preflight", `${repo} is not a git checkout: ${top.err}`, STARTER_EXIT["repo-or-fence"]!);
	const worktree = worktreePath(top.out, wl);
	// § 6 "fence denies the worktree path": the canonical destination against the same targets the fence denies for a command in the checkout.
	const fenced = fencedBy(canonicalPath(worktree), fenceTargets("true", top.out, process.env));
	if (fenced !== null) throw new Fail("preflight", `worktree ${worktree} lies inside a fenced path ${fenced}`, STARTER_EXIT["repo-or-fence"]!);
	const branch = branchName(wl);
	let base: Base | null = null;
	if (!existsSync(join(worktree, ".git"))) {
		mkdirSync(dirname(worktree), { recursive: true });
		const exists = git(top.out, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`]).code === 0;
		if (!exists) base = chooseBase(top.out);
		// the sha, not the ref: the branch starts at exactly what the entry records, with no upstream set from origin/<default>
		const add = base === null ? git(top.out, ["worktree", "add", worktree, branch]) : git(top.out, ["worktree", "add", "-b", branch, worktree, base.sha]);
		if (add.code !== 0) throw new Fail("worktree", `git worktree add failed: ${add.err || add.out}`, STARTER_EXIT.worktree!);
	}
	const dir = laneDir(wl, home());
	mkdirSync(dir, { recursive: true });
	const tier = readFileSync(TIER_FILE, "utf8").replace(/^---\n[\s\S]*?\n---\n/, "");
	const systemPromptPath = join(dir, "system.md");
	writeFileSync(systemPromptPath, `${tier.trim()}\n\n${interactive ? "This lane runs in Jo's terminal; Jo is present." : "This lane runs unattended; questions go to Jo through lane_raise_question."}\n`);
	const sessionDir = join(dir, "sessions");
	mkdirSync(sessionDir, { recursive: true });
	return { repo: top.out, worktree, branch, base, dir, systemPromptPath, sessionDir };
}

/** The one prompt (§ 7 item 3), from the rows as they stand at launch; a metered lane's ceiling line goes after the stakes line (DESIGN-workload-ceiling.md § 2 item 4). */
function promptFor(ledger: Ledger, w: WorkloadRow, laneId: string, p: Prepared, ceilingLine: string | null): string {
	const entries = ledger.entries(w.id);
	const control = controlEntries(entries, holdersOf(entries, w.holder));
	const instructions = ledger.instructions(w.id);
	const resolved = resolutions(control, ledger.questions(w.id), instructions, ledger.slices(w.id)).map((r) => ({
		...r, question: ledger.question(r.questionId)?.body ?? "",
	}));
	const logDir = process.env[DECISION_LOG_ENV] || join(p.repo, ".ai", "decision-log");
	let decisionLog = "";
	try {
		decisionLog = existsSync(logDir) ? decisionLogContext(logDir) : "";
	} catch {
		decisionLog = "";
	}
	const prompt = firstPrompt({
		workload: w, laneId, repo: p.repo, worktree: p.worktree, branch: p.branch, done: doneLine(control), planFirst: planFirst(control)?.trigger ?? null,
		decisionLog, resolved, instructions: joInstructionsFor(control, instructions, laneId), machinery: canonicalPath(p.repo) === canonicalPath(REPO_ROOT), tools: LANE_TOOLS,
	});
	if (ceilingLine === null) return prompt;
	const out = prompt.split("\n");
	out.splice(out.indexOf(`stakes: ${w.stakes} · mode: ${w.mode}`) + 1, 0, ceilingLine);
	return out.join("\n");
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
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: branchBody(p.branch, p.base) });
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

/**
 * The per-workload ctx index (MIGRATION.md item 43): `ctx-index` in its own detached process, stdio to
 * the lane dir's `ctx-index.log`, spawned as cmdLaunch spawns the runner. Every exit path calls it
 * after its exit, release and death writes, so nothing waits on ctx; the subcommand's claim lets one
 * worker per lane proceed. A spawn failure goes to stderr and changes nothing else.
 */
function spawnCtxIndex(wl: string, laneId: string, by: "runner" | "starter"): void {
	try {
		const dir = laneDir(wl, home());
		mkdirSync(dir, { recursive: true });
		const log = openSync(join(dir, "ctx-index.log"), "a");
		const worker = spawn(["bun", import.meta.path, "ctx-index", wl, laneId, "--by", by], {
			cwd: dir, env: process.env, stdin: "ignore", stdout: log, stderr: log, detached: true,
		});
		worker.unref();
	} catch (err) {
		process.stderr.write(`lane: the ctx-index worker for ${laneId} could not be spawned: ${String(err)}\n`);
	}
}

// ---- the ceiling meter (DESIGN-workload-ceiling.md § 2 item 4) ------------------------------------

/**
 * Where the ceiling question raised for one ceiling value stands: never raised (or only withdrawn: the
 * runner's own cancel at a clean finish, or Jo's withdraw), open, or answered with one of the options.
 */
export type CeilingQuestionState = "none" | "open" | CeilingOption;

/** The runner's memory across polls in this run: the ceiling values (`ceilingKey`) it raised a question for. */
export interface MeterState {
	raised: readonly string[];
}
export interface MeterInputs {
	/** The effective ceiling now (`effectiveCeiling`). */
	ceiling: Ceiling;
	/** The workload's spend so far: every session file's usage and the wall across runs. */
	spend: Spend;
	/** The ceiling question for this ceiling value, as the ledger shows it (`ceilingQuestionState`). */
	question: CeilingQuestionState;
}
/** One poll's decision. `raise` and `stop` both write a `spend:` entry; neither is "none". */
export interface MeterResult {
	state: MeterState;
	level: 0 | 80 | 100;
	/** Raise the ceiling question: once per ceiling value, from 80 % on. */
	raise: boolean;
	/** Stop the lane: at 100 %, whatever the question for this value says. */
	stop: boolean;
}

/** A ceiling value as the meter keys it: an extend or a lowering is a new value that may raise again. */
export const ceilingKey = (c: Ceiling): string => `usd ${c.usd} wall ${c.wallMin}`;

/**
 * One poll of the meter, pure. From 80 % of either half, the question is raised once per ceiling
 * value in this run while none is open or answered for it, and the lane keeps working. At 100 % the
 * lane stops, whatever the question says; when none is open or answered for this value (the spend
 * jumped past 80 % between polls, a relaunch after a withdrawn question, or Jo withdrew it), the
 * question is raised with the stop, so a ceiling stop always leaves Jo the three answers. A withdrawn
 * question reads as never raised (`ceilingQuestionState`), so a relaunch at 85 % raises afresh; this
 * run's memory keeps a question Jo withdrew from coming back before 100 %. An extend answer is a
 * raised ceiling, a new value the caller passes in, with its own question state; an extend whose
 * raise has not landed leaves the old value in force, and the old value stops (stop is the default).
 */
export function meterStep(state: MeterState, inputs: MeterInputs): MeterResult {
	const level = crossed(inputs.spend, inputs.ceiling);
	if (level === 0) return { state, level, raise: false, stop: false };
	const key = ceilingKey(inputs.ceiling);
	const raise = inputs.question === "none" && (level === 100 || !state.raised.includes(key));
	return { state: raise && !state.raised.includes(key) ? { raised: [...state.raised, key] } : state, level, raise, stop: level === 100 };
}

/** The runner's ceiling question: its slice is `sl-ceiling-…` and the runner raised it (the predicate surface/src/input.ts exports as `isCeilingQuestion`). */
const ceilingQuestion = (q: QuestionRow, slice: SliceRow): boolean => slice.id.startsWith("sl-ceiling-") && q.created_by === LANE_RUNNER_BY;

/** The ceiling slice's done condition ends with the ceiling value its question was raised for (`raiseCeilingQuestion`). */
const RAISED_FOR = /\bceiling (usd \S+ wall \S+)$/;

/**
 * The newest ceiling question raised for `ceiling`'s value that is open or answered, as `meterStep`
 * reads it; a withdrawn one is skipped (it no longer asks anything), so a value whose questions were
 * all withdrawn reads `"none"`. An answer that is none of the options reads as stop, the default.
 */
export function ceilingQuestionState(
	questions: readonly QuestionRow[], slices: readonly SliceRow[], instructions: readonly InstructionRow[], ceiling: Ceiling,
): CeilingQuestionState {
	const key = ceilingKey(ceiling);
	for (let i = questions.length - 1; i >= 0; i--) {
		const q = questions[i]!;
		const slice = slices.find((s) => s.id === q.slice_id);
		if (!slice || !ceilingQuestion(q, slice) || RAISED_FOR.exec(slice.done_condition)?.[1] !== key || q.state === "withdrawn") continue;
		if (q.state === "open") return "open";
		const word = instructions.find((x) => x.id === q.resolved_by)?.body.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
		return (CEILING_OPTIONS as readonly string[]).includes(word) ? (word as CeilingOption) : "stop";
	}
	return "none";
}

/**
 * The raise, in one write stamped `lane-runner`: the slice `sl-ceiling-<wl>-<n>` (slice ids are
 * ledger-wide, so the workload is in the id; n = 1 + the workload's ceiling slices), the question on
 * it with the three options (the file pauses the slice), and the `spend:` entry.
 */
export function raiseCeilingQuestion(ledger: Ledger, r: { workloadId: string; laneId: string; spend: Spend; ceiling: Ceiling; stakes: Stakes }): { sliceId: string; questionId: string } {
	return ledger.write(() => {
		const prefix = `sl-ceiling-${r.workloadId.replace(/^wl-/, "")}-`;
		let n = 1 + ledger.slices(r.workloadId).filter((s) => s.id.startsWith(prefix)).length;
		while (ledger.slice(`${prefix}${n}`) !== null) n += 1;
		const sliceId = ledger.addSlice({
			by: LANE_RUNNER_BY, workloadId: r.workloadId, id: `${prefix}${n}`, task: "Jo decides the ceiling overrun",
			doneCondition: `Jo answers stop, extend or split for the ceiling ${ceilingKey(r.ceiling)}`, inputs: "ceiling",
		});
		const questionId = ledger.raiseQuestion({
			by: LANE_RUNNER_BY, workloadId: r.workloadId, sliceId, body: ceilingQuestionBody(r.workloadId, r.spend, r.ceiling, r.stakes), options: [...CEILING_OPTIONS],
		});
		ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: r.workloadId, kind: "assumption", body: spendBody(r.laneId, r.spend) });
		return { sliceId, questionId };
	});
}

/** A lane that finished under the ceiling withdraws every open ceiling question (`then: cancel`), so the close is not blocked (§ 2 item 4). */
export function withdrawCeilingQuestions(ledger: Ledger, workloadId: string): string[] {
	const slices = ledger.slices(workloadId);
	const out: string[] = [];
	for (const q of ledger.questions(workloadId)) {
		const slice = slices.find((s) => s.id === q.slice_id);
		if (q.state !== "open" || !slice || !ceilingQuestion(q, slice)) continue;
		ledger.withdrawQuestion(q.id, { by: LANE_RUNNER_BY, reason: "finished under the ceiling", author: LANE_RUNNER_BY, channel: "direct", then: "cancel" });
		out.push(q.id);
	}
	return out;
}

/** The first prompt's ceiling line: the ceiling, the spend so far, and the remainder a brief's ceiling-share comes from. */
export function ceilingPromptLine(c: Ceiling, s: Spend): string {
	const usd = Math.max(0, c.usd - s.usd);
	const wall = Math.max(0, c.wallMin - s.wallMin);
	return `ceiling: $${c.usd} / ${c.wallMin} min for the workload; spent so far $${s.usd.toFixed(2)} / ${Math.round(s.wallMin)} min (${Math.round(s.tokens)} tokens); set each brief's ceiling-share from the remainder, $${usd.toFixed(2)} / ${Math.round(wall)} min. At 80 % Jo is asked; at 100 % this lane is stopped.`;
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
	/** OMP's `--max-time`: the ceiling's remaining wall plus the margin, or AGENT_SYSTEM_LANE_MAX_TIME when that is set and shorter; fixed at the spawn. */
	let maxTime = laneMaxTime(process.env);
	const spawnedAt = Date.now();
	let deadlineAt = spawnedAt + (maxTimeMs(maxTime) ?? Number.MAX_SAFE_INTEGER);
	const readyMinutes = READY_MS >= 60_000 ? `${Math.round(READY_MS / 60_000)}m` : `${Math.round(READY_MS / 1000)}s`;

	let child: Subprocess<"pipe", "pipe", "inherit"> | null = null;
	let outcome: LaneOutcome | null = null;
	/** The accepted stop's reason for `lane-exit: … outcome stop reason <r>` (decision 6; Codex review 2, R6). */
	let stopReason: string | null = null;
	let ready = false;
	/** A callback's failure (the readiness step): omp is killed and the read loop's end rethrows it into finalization (Codex review 2, R2). */
	let fatal: Fail | null = null;
	/** Why readiness failed, when it was not a missing claim: the launch-failed: and lane-died: bodies name it. */
	let readinessFailure: string | null = null;
	let session: string | null = null;
	let ended = false;
	let finished = false;
	let argv: string[] = [];
	const timers: ReturnType<typeof setTimeout>[] = [];
	const send = (frame: Frame): void => {
		if (child && !ended) child.stdin.write(`${JSON.stringify(frame)}\n`);
	};
	const startRecord = (): string => laneStartedBody(laneId, { pid: child?.pid ?? 0, start: child ? startTime(child.pid) ?? "" : "", session, argv, runnerPid: process.pid });

	// The ceiling meter (DESIGN-workload-ceiling.md § 2 items 3, 4): the offsets live as long as the run and the first scan starts
	// every file at byte 0, so a relaunch counts the whole workload; the wall is the finished runs plus this one since its spawn.
	const offsets = new Map<string, number>();
	let tally: Spend = { usd: 0, tokens: 0, wallMin: 0 };
	let meterState: MeterState = { raised: [] };
	let sessionsDir: string | null = null;
	let runStart: number | null = null;
	const measure = (control: readonly ControlEntry[]): Spend => {
		if (sessionsDir !== null) tally = scanSpend(sessionsDir, offsets, tally);
		return { ...tally, wallMin: wallMinutes(control, Date.now(), runStart) };
	};
	/**
	 * One meter poll: raise at 80 % once per ceiling value, stop at 100 % through the stop path (acceptance `ceiling`, outcome stop,
	 * no lane-died:). A failure is logged, never fatal; a stop the step called for is taken even when its writes failed. Returns
	 * whether it stopped the lane.
	 */
	const meter = (stakes: Stakes, control: readonly ControlEntry[]): boolean => {
		let stopping = false;
		try {
			const spend = measure(control);
			const instructions = ledger.instructions(wl);
			const ceiling = effectiveCeiling(control, instructions, stakes);
			const step = meterStep(meterState, { ceiling, spend, question: ceilingQuestionState(ledger.questions(wl), ledger.slices(wl), instructions, ceiling) });
			stopping = step.stop;
			if (step.raise) raiseCeilingQuestion(ledger, { workloadId: wl, laneId, spend, ceiling, stakes });
			else if (step.stop) record(spendBody(laneId, spend));
			meterState = step.state;
		} catch (err) {
			process.stderr.write(`runner: the ceiling meter failed: ${String(err)}\n`);
		}
		if (stopping) stop("ceiling", "ceiling");
		return stopping;
	};

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
			// The final spend, when an omp was spawned; a failed scan never blocks the exit record.
			let spend: Spend | null = null;
			try {
				if (runStart !== null) spend = measure(control);
			} catch (err) {
				process.stderr.write(`runner: the final spend scan failed: ${String(err)}\n`);
			}
			ledger.write(() => {
				if (held && !intended && !laneDeaths(ledger, wl).some((d) => d.holder === laneId)) {
					const body = final === "never-ready"
						? laneDiedLaunchBody(laneId, "readiness", readinessFailure ?? `no claim in ${readyMinutes}`)
						: final === "deadline" ? laneDiedDeadlineBody(laneId, maxTime, inFlight) : laneDiedExitBody(laneId, final, code, signal);
					ledger.enqueue({ by: LANE_RUNNER_BY, workloadId: wl, sender: LANE_RUNNER_BY, recipient: ORCHESTRATOR_RECIPIENT, body });
				}
				if (final === "never-ready") record(launchFailedBody(laneId, "readiness", `${readinessFailure ?? `never ready in ${readyMinutes}`} (omp exit code ${code ?? "-"} signal ${signal ?? "-"})`));
				if (held) ledger.releaseWorkload(wl, { by: LANE_RUNNER_BY, holder: laneId });
				if (spend !== null && laneExit(control, laneId) === null) record(spendBody(laneId, spend));
				if (laneExit(control, laneId) === null) record(laneExitBody(laneId, { code, signal, outcome: final, reason: final === "stop" ? stopReason : null }));
			});
			// The exit is on the ledger (this write's, or the one `lane.ts stop` wrote first): index the workload's sessions.
			spawnCtxIndex(wl, laneId, "runner");
		} catch (err) {
			process.stderr.write(`runner: finalization failed: ${String(err)}\n`);
		}
	};

	/** A stop, from the ledger or a signal: acceptance persisted first, then abort and end (decision 14). */
	const stop = (ref: string, reason: string): void => {
		if (outcome === "stop" || finished) return;
		try {
			record(laneStopAcceptedBody(laneId, ref));
		} catch (err) {
			process.stderr.write(`runner: the stop acceptance could not be written: ${String(err)}\n`);
		}
		outcome = "stop";
		stopReason = reason;
		send({ id: "abort", type: "abort" });
		end();
	};
	process.on("SIGTERM", () => stop("signal", "signal"));
	process.on("SIGINT", () => stop("signal", "signal"));
	process.on("SIGHUP", () => undefined);

	try {
		const p = prepare(ledger, wl, false);
		sessionsDir = p.sessionDir;
		{
			const { workload: cur, control } = controlNow();
			const ceiling = effectiveCeiling(control, ledger.instructions(wl), cur?.stakes ?? w.stakes);
			const remainingWallMin = Math.max(0, ceiling.wallMin - wallMinutes(control, Date.now(), null));
			const envMs = process.env[LANE_MAX_TIME_ENV]?.trim() ? maxTimeMs(maxTime) : null;
			const shorter = envMs !== null && envMs < (maxTimeMs(ceilingMaxTime(remainingWallMin)) ?? Number.MAX_SAFE_INTEGER);
			argv = laneArgv({
				worktree: p.worktree, sessionDir: p.sessionDir, systemPromptPath: p.systemPromptPath, maxTime, resume: resumeOf(ledger, w, laneId),
				remainingWallMin: shorter ? null : remainingWallMin,
			});
			maxTime = argv[argv.indexOf("--max-time") + 1]!;
			deadlineAt = spawnedAt + (maxTimeMs(maxTime) ?? Number.MAX_SAFE_INTEGER);
		}
		const ordinal = (/-(\d+)$/.exec(laneId) ?? [])[1] ?? "0";
		const frames = join(p.dir, `lane-${ordinal}.jsonl`);
		const env = laneEnv(process.env, { workloadId: wl, laneId });
		env.OMP_PROFILE = PROFILE;
		runStart = Date.now();
		child = spawn(["omp", ...argv], { cwd: p.worktree, env, stdin: "pipe", stdout: "pipe", stderr: "inherit" });
		const omp = child;
		record(startRecord());
		send({ id: "state", type: "get_state" });

		// Readiness (B1): the lane's own claim, stamped with its id, within the pre-claim lease; no renewal before it.
		// Ready means the claim, the lane-ready: receipt and the prompt all landed; a failure in any of them is fatal (review 2, R2).
		const readyPoll = setInterval(() => {
			if (ready || finished || outcome !== null || fatal !== null) return;
			try {
				const cur = ledger.workload(wl);
				if (cur && cur.holder === laneId && cur.changed_by === laneId) {
					clearInterval(readyPoll);
					record(laneReadyBody(laneId, ledger.now()));
					const { workload: latest, control } = controlNow();
					const stakes = latest?.stakes ?? w.stakes;
					// A relaunch already at or past the ceiling stops here, before the first prompt spends a model turn past it.
					if (meter(stakes, control)) {
						ready = true;
						return;
					}
					const ceilingLine = ceilingPromptLine(effectiveCeiling(control, ledger.instructions(wl), stakes), measure(control));
					send({ id: "p1", type: "prompt", message: promptFor(ledger, w, laneId, p, ceilingLine) });
					ready = true;
				} else if (Date.now() - spawnedAt >= READY_MS) {
					clearInterval(readyPoll);
					process.stderr.write(`runner: ${laneId} never claimed ${wl} within ${readyMinutes}; killing omp\n`);
					outcome = "never-ready";
					omp.kill("SIGKILL");
				}
			} catch (err) {
				clearInterval(readyPoll);
				fatal = new Fail("readiness", String(err), STARTER_EXIT.unknown!);
				process.stderr.write(`runner: readiness failed: ${String(err)}; killing omp\n`);
				omp.kill("SIGKILL");
			}
		}, READY_POLL_MS);
		timers.push(readyPoll);

		const stopPoll = setInterval(() => {
			if (finished) return;
			try {
				const { workload: cur, control } = controlNow();
				const req = pendingStop(control, laneId);
				if (req) stop(req.entryId, req.reason);
				if (ready && outcome === null) meter(cur?.stakes ?? w.stakes, control);
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
					// Finished under the ceiling: the open ceiling question is withdrawn (then cancel), so it does not block the close, and
					// before stdin EOF, so the lane's own shutdown does not count the paused ceiling slice as its unfinished work (lane-died:).
					if (outcome === "completed") {
						try {
							withdrawCeilingQuestions(ledger, wl);
						} catch (err) {
							process.stderr.write(`runner: the ceiling question could not be withdrawn: ${String(err)}\n`);
						}
					}
					end();
				}
			}
		}
		const code = await omp.exited;
		if (fatal !== null) throw fatal;
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
		if (!ready) readinessFailure = `${f.stage} failed: ${f.message}`;
		outcome ??= ready ? "died" : "never-ready";
		finish(code, child.signalCode ?? null);
		return f.code;
	}
	return 0;
}

// ---- interactive ----------------------------------------------------------------------------------

/** SIGTERM, then SIGKILL after END_GRACE_MS, and the exit awaited: a child this process spawned is never left running. */
async function terminate(child: Pick<Subprocess, "kill" | "exited" | "exitCode" | "signalCode">): Promise<void> {
	if (child.exitCode !== null || child.signalCode !== null) return;
	child.kill("SIGTERM");
	const exited = await Promise.race([child.exited.then(() => true), Bun.sleep(END_GRACE_MS).then(() => false)]);
	if (!exited) {
		child.kill("SIGKILL");
		await child.exited;
	}
}

async function cmdInteractive(wl: string): Promise<number> {
	const ledger = openLedger();
	const w = ledger.workload(wl);
	if (!w) throw new Fail("interactive", `no workload ${wl}`, STARTER_EXIT.unknown!);
	const laneId = reserveOrExit(ledger, wl, "jo", true);
	// Held across the catch: a failure after the spawn terminates and reaps omp before the release (Codex review 2, R3).
	let omp: Subprocess<"inherit", "inherit", "inherit"> | null = null;
	try {
		const p = prepare(ledger, wl, true);
		const resume = resumeOf(ledger, w, laneId);
		ledger.write(() => {
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: worktreeBody(p.worktree) });
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: branchBody(p.branch, p.base) });
		});
		const argv = ["--cwd", p.worktree, "--session-dir", p.sessionDir, "--append-system-prompt", p.systemPromptPath, ...(resume ? ["--resume", resume] : [])];
		const env = laneEnv(process.env, { workloadId: wl, laneId });
		env.OMP_PROFILE = PROFILE;
		line(`lane ${laneId} on ${wl} in ${p.worktree} (branch ${p.branch}); first prompt copied to ${join(p.dir, "prompt.md")}`);
		// Interactive lanes are not metered (DESIGN-workload-ceiling.md § 2, "Not covered"): no ceiling line.
		writeFileSync(join(p.dir, "prompt.md"), promptFor(ledger, w, laneId, p, null));
		// The TUI's ^C belongs to omp (a foreground process group signal reaches both); this wrapper waits for the exit.
		process.on("SIGINT", () => undefined);
		// The session files already here belong to earlier lanes: the one this OMP creates is the one not in this snapshot.
		const preexisting = topLevelSessions(p.sessionDir);
		const child = spawn(["omp", ...argv], { cwd: p.worktree, env, stdin: "inherit", stdout: "inherit", stderr: "inherit" });
		omp = child;
		// The lane's identity is OMP's process, not this wrapper's (Codex review B5): `lane.ts stop` compares this pid and start time.
		const record = (session: string | null): void => {
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStartedBody(laneId, { pid: child.pid, start: startTime(child.pid) ?? "", session, argv, runnerPid: process.pid }) });
		};
		record(resume);
		const code = await child.exited;
		// The session OMP wrote: a new top-level file, never one that existed before the spawn; a resumed lane appends to its
		// resume path, which it already recorded, so it finds no new file.
		const session = newLaneSession(p.sessionDir, preexisting);
		if (session !== null && session !== resume) record(session);
		// Once per lane, in one transaction with the release: `lane.ts stop` may have written the exit already; when it accepted
		// the stop but has not written it yet (it waits to see omp gone), this wrapper writes the same stop exit with the real code.
		ledger.write(() => {
			const cur = ledger.workload(wl);
			if (cur && cur.status === "open" && cur.holder === laneId) ledger.releaseWorkload(wl, { by: LANE_STARTER_BY, holder: laneId });
			const es = ledger.entries(wl);
			const control = controlEntries(es, holdersOf(es, cur?.holder ?? null));
			if (laneExit(control, laneId) !== null) return;
			const byHand = control.some((c) => c.prefix === "lane-stop" && c.laneId === laneId && /^accepted\b/.test(c.rest));
			ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneExitBody(laneId, { code, signal: child.signalCode ?? null, outcome: byHand ? "stop" : "interactive", reason: byHand ? "by-hand" : null }) });
		});
		// Spawned even when `lane.ts stop` wrote the exit: only this wrapper knew the session once OMP exited.
		spawnCtxIndex(wl, laneId, "starter");
		return code;
	} catch (err) {
		const f = err instanceof Fail ? err : new Fail("interactive", String(err), STARTER_EXIT.unknown!);
		if (omp !== null) {
			try {
				await terminate(omp);
			} catch (cleanup) {
				// The original failure is the one reported; the cleanup's own failure goes to stderr beside it.
				process.stderr.write(`lane: omp pid ${omp.pid} could not be terminated: ${String(cleanup)}\n`);
			}
		}
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
	// No runner (or it did not answer): accept the request here. The release and the exit wait until the recorded omp is
	// verified gone — SIGTERM, then SIGKILL after the grace, each only while the pid's start time still matches
	// lane-started: — and a process that cannot be shown gone is a failed stop, never a released lane (Codex review 2, R1).
	ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneStopAcceptedBody(laneId, req) });
	if (started && started.laneId === laneId && started.pid > 0) {
		const pid = started.pid;
		const ended = await endRecorded(pid, started.start);
		if (ended === "unverifiable" || ended === "survived") {
			const why = ended === "survived" ? "survived SIGTERM and SIGKILL" : "is alive and lane-started: recorded no start time to verify it against";
			process.stderr.write(`lane stop: omp pid ${pid} ${why}; ${wl} stays held by ${laneId} and no lane-exit: is written\n`);
			return 1;
		}
		line(ended === "gone" ? `omp pid ${pid} is gone` : ended === "other" ? `omp pid ${pid} has a different start time; not signalled` : `omp pid ${pid} ended after ${ended} (start time matched lane-started:)`);
	}
	// Once per lane, against the interactive wrapper that may have written the same exit when its omp ended.
	const r = ledger.write(() => {
		const released = ledger.releaseWorkload(wl, { by: LANE_STARTER_BY, holder: laneId });
		const e3 = ledger.entries(wl);
		const wrote = laneExit(controlEntries(e3, holdersOf(e3, ledger.workload(wl)?.holder ?? null)), laneId) === null;
		if (wrote) ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: laneExitBody(laneId, { code: null, signal: null, outcome: "stop", reason: "by-hand" }) });
		return { ...released, wrote };
	});
	// This stop wrote the exit: it spawns the index too, whether or not a supervisor was alive (one taken over after 60 s
	// may never finalize); the claim keeps a late supervisor's worker from repeating it.
	if (r.wrote) spawnCtxIndex(wl, laneId, "starter");
	line(r.released ? `released ${wl} from ${laneId}` : `${wl} is held by ${r.holder ?? "nobody"}, not ${laneId}; nothing released`);
	return 0;
}

/** Is `pid` still the process lane-started: recorded? `unknown` when no start time was recorded to compare. */
function recordedState(pid: number, start: string): "same" | "gone" | "other" | "unknown" {
	const now = startTime(pid);
	return now === null ? "gone" : !start ? "unknown" : now === start ? "same" : "other";
}

/** Poll until the recorded process is no longer `same`, or `ms` pass; true when it is gone (or the pid was reused). */
async function leftWithin(pid: number, start: string, ms: number): Promise<boolean> {
	const deadline = Date.now() + ms;
	for (;;) {
		if (recordedState(pid, start) !== "same") return true;
		if (Date.now() >= deadline) return false;
		await Bun.sleep(100);
	}
}

/** Signal a process by hand only while it is verifiably the recorded one; `SIGTERM`/`SIGKILL` name the signal it ended after. */
async function endRecorded(pid: number, start: string): Promise<"gone" | "other" | "unverifiable" | "survived" | "SIGTERM" | "SIGKILL"> {
	const state = recordedState(pid, start);
	if (state === "gone" || state === "other") return state;
	if (state === "unknown") return "unverifiable";
	const signal = (sig: NodeJS.Signals): void => {
		try {
			if (recordedState(pid, start) === "same") process.kill(pid, sig);
		} catch {
			// ESRCH: it ended between the check and the signal
		}
	};
	signal("SIGTERM");
	if (await leftWithin(pid, start, END_GRACE_MS)) return "SIGTERM";
	signal("SIGKILL");
	return (await leftWithin(pid, start, 5_000)) ? "SIGKILL" : "survived";
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
		process.stderr.write("usage: lane.ts launch|run|interactive|stop|cleanup|log|ctx-index <workload> [...]\n");
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
		case "ctx-index": {
			const i = rest.indexOf("--by");
			return runCtxIndex({
				openLedger, workloadId: wl, laneId: rest[0], by: i >= 0 ? rest[i + 1] : undefined, pid: process.pid,
				sessionsDir: join(laneDir(wl, home()), "sessions"), env: process.env, log: (s) => process.stderr.write(`${s}\n`),
			});
		}
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
