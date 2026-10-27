// test-exec: what the `_as2test` wrapper runs (MIGRATION.md item 24; the approved plan of workload
// wl-muraerdsgw7gn4, revision 12, § 2.3 steps 1 and 3, § 3.1). Installed as a single-file
// `bun build --target=bun` bundle beside the wrapper; a test runs this file directly.
//
//   exec prepare <run id> <sha>        clone <stage>/<run id>/repo.bundle into runs/<run id>/repo, detached at <sha>
//   exec full    <run id>              bun test, junit to runs/<run id>/full.xml, console to full.log, under the full cap;
//                                      with `--parallel=<n>` when caps.json carries `fullWorkers` over 1 (profile/config.yml
//                                      `testRunner.fullWorkers`; no key runs serially)
//   exec solo    <run id> ./<file>     bun test ./<file> alone, to solo-<i>.xml/.log, under the solo cap
//   exec base-prepare <run id> <sha>   the same bundle cloned into runs/<run id>/base/repo at base's <sha> (PLAN wl-mv8s8srodefytc D8)
//   exec base-solo <run id> ./<file>   `solo` in the base clone, to base-solo-<i>.xml/.log
//   exec sweep   <run id>              SIGTERM, then SIGKILL, to the run's processes, holding locks/sweep.db
//   exec cleanup <run id> <old run id> delete runs/<old run id>
//   exec probe   <run id> <path>...    whether this user can open or write each path (the preflight)
//
// The wrapper fixes the root, bun, the env and the sweep's reach in AS2TEST_EXEC_CONFIG; argv picks
// only the subcommand and its operands. Every subcommand is fenced: it refuses unless
// <root>/stage/current names its run. Exit codes are test-run.ts WRAPPER_EXIT; `full`, `solo` and `base-solo`
// otherwise pass bun's own exit through (128 + the signal number when bun died by a signal).
//
// At a part's cap, before its group is killed, a bounded stuck capture (process tree, `sample` per bun process, `lsof` per
// process, the log's last 200 lines) goes to `<part stem>.stuck.log` beside the part's log (PLAN wl-mvq4edh02r5z40 D5).
//
// Parallel files (workload wl-mvg2kzuvwngdmo): the worker count rides in caps.json, never in argv, so `full <run id>`
// keeps its operand count and the installed wrapper needs no change. The runner logs `full workers <n>` before the PR
// full part; surface/scripts/test-run-waits.ts reads it back per run. The reversal is `fullWorkers: 1` in the profile.
import { Database } from "bun:sqlite";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
	accessSync, appendFileSync, chmodSync, closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync,
	readFileSync, readSync, realpathSync, rmdirSync, symlinkSync, unlinkSync, writeFileSync, writeSync,
} from "node:fs";
import { constants as osConstants } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { type ExecConfig, probeAnswerLine, REAL_GIT, UID_SWEEP } from "../src/as2test";
import { sweepLegacyNativeTemps } from "../src/as2test-temp";
import {
	AS2TEST_USER, childEnv, childGitconfigText, childLayout, gitShimText, isBunTestFile, RUN_ID_RE, SHA_RE, WRAPPER_EXIT,
} from "../src/test-run";

class Exit extends Error {
	constructor(readonly code: number, message: string) {
		super(message);
	}
}
const refuse = (why: string): never => {
	throw new Exit(WRAPPER_EXIT.refused, `refused: ${why}`);
};
const failed = (why: string): never => {
	throw new Exit(WRAPPER_EXIT.failed, `failed: ${why}`);
};

type Config = ExecConfig;

function config(): Config {
	let v: unknown;
	try {
		v = JSON.parse(process.env.AS2TEST_EXEC_CONFIG ?? "");
	} catch {
		return refuse("no wrapper config (run through the exec wrapper)");
	}
	if (!v || typeof v !== "object") return refuse("wrapper config is not an object");
	const c = v as Record<string, unknown>;
	const abs = (x: unknown): x is string => typeof x === "string" && isAbsolute(x) && normalize(x) === x;
	const ms = (x: unknown): x is number => typeof x === "number" && Number.isSafeInteger(x) && x >= 0;
	if (!abs(c.root) || !abs(c.bun) || (c.sweep !== "groups" && c.sweep !== UID_SWEEP) || !(c.hooks === null || abs(c.hooks)) || !ms(c.killGraceMs) || !ms(c.sweepLockWaitMs) || !ms(c.captureMs)) {
		return refuse("wrapper config is malformed");
	}
	if (c.sweep !== "groups" && (c.hooks !== null)) return refuse("hooks are for a groups render only");
	return { root: c.root, bun: c.bun, sweep: c.sweep, hooks: c.hooks, killGraceMs: c.killGraceMs, sweepLockWaitMs: c.sweepLockWaitMs, captureMs: c.captureMs };
}

/** The canonical root and its three areas. */
interface Areas {
	root: string;
	stage: string;
	runs: string;
	locks: string;
}

/** The root is fixed in the wrapper, so its realpath is trusted. */
function areas(cfg: Config): Areas {
	let root: string;
	try {
		root = realpathSync(cfg.root);
	} catch {
		return failed(`root ${cfg.root} is missing`);
	}
	const a = { root, stage: join(root, "stage"), runs: join(root, "runs"), locks: join(root, "locks") };
	for (const dir of [a.stage, a.runs, a.locks]) if (!inside(dir, dir)) failed(`${dir} is missing or not a plain directory`);
	return a;
}

/** `<stage>/current` names `runId`, or the call is fenced (§ 2.3 step 1, Fencing). */
function readCurrent(a: Areas): string | null {
	try {
		return readFileSync(join(a.stage, "current"), "utf8").trim();
	} catch {
		return null;
	}
}
function fence(a: Areas, runId: string): void {
	const current = readCurrent(a);
	if (current !== runId) throw new Exit(WRAPPER_EXIT.fenced, `fenced: ${join(a.stage, "current")} names ${current ?? "no run"}, not ${runId}`);
}

/** `path` resolves (symlinks followed) to `base` itself or beneath it. */
function inside(path: string, base: string): boolean {
	let real: string;
	try {
		real = realpathSync(path);
	} catch {
		return false;
	}
	return real === base || real.startsWith(`${base}/`);
}

/** The run's work dir: `runs/<run id>`, a real directory (no symlink) that resolves to itself. */
function workDir(a: Areas, runId: string): string {
	const work = join(a.runs, runId);
	let st;
	try {
		st = lstatSync(work);
	} catch {
		return refuse(`${work} does not exist (prepare first)`);
	}
	if (!st.isDirectory() || realpathSync(work) !== work) return refuse(`${work} is not a directory under ${a.runs}`);
	return work;
}

/**
 * A test's pause point: when `<hooks>/<run>.<point>.pause` exists, write `.reached` (this pid, the time and `info`) and wait for
 * `.go`, or until `stop` says so (the stuck capture's hooks stop at its deadline).
 */
async function hook(cfg: Config, runId: string, point: string, o: { stop?: () => boolean; info?: Record<string, unknown> } = {}): Promise<void> {
	if (!cfg.hooks) return;
	const base = join(cfg.hooks, `${runId}.${point}`);
	if (!existsSync(`${base}.pause`)) return;
	writeFileSync(`${base}.reached`, JSON.stringify({ pid: process.pid, at: Date.now(), ...o.info }));
	while (!existsSync(`${base}.go`) && !o.stop?.()) await Bun.sleep(25);
}

// ---- process groups --------------------------------------------------------------------------------

const groupsFile = (work: string) => join(work, "groups");

/** Whether process group `pgid` still has a member this user can signal. */
function groupAlive(pgid: number): boolean {
	try {
		process.kill(-pgid, 0);
		return true;
	} catch {
		return false;
	}
}

function signalGroup(pgid: number, sig: NodeJS.Signals): void {
	try {
		process.kill(-pgid, sig);
	} catch {
		// gone, or not ours
	}
}

/** Append once through a validated descriptor: a child may have replaced this pathname while it ran. */
function persistGroups(work: string, groups: number[]): void {
	const path = groupsFile(work);
	const text = groups.map((g) => `${g}\n`).join("");
	const errors: string[] = [];
	let fd: number | undefined;
	let operation = "open";
	try {
		fd = openSync(path, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK);
		operation = "validate";
		const st = fstatSync(fd);
		if (!st.isFile()) throw new Error("not a regular file");
		operation = "append";
		const n = writeSync(fd, text);
		if (n !== text.length) throw new Error(`short write: ${n} of ${text.length} bytes`);
	} catch (e) {
		errors.push(`${operation} failed: ${errText(e)}`);
	} finally {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch (e) {
				errors.push(`close failed: ${errText(e)}`);
			}
		}
	}
	if (errors.length > 0) failed(`timeout cleanup: cannot persist descendant groups to ${path}: ${errors.join("; ")}`);
}

/**
 * Snapshot descendant group leaders before TERM can orphan them. Bun's parallel workers lead their own groups, so
 * killing only `pgid` relies on bun forwarding the signal. Persist those groups for a later sweep as well.
 * Discovery has one 2 s deadline; even a failed discovery must not prevent killing the groups already known.
 */
async function killGroup(cfg: Config, pgid: number, work: string): Promise<void> {
	const groups = new Set([pgid]);
	let cleanupError: unknown;
	try {
		const deadline = Date.now() + 2_000;
		const query = (flag: "-g" | "-P", ids: number[]): number[] => {
			const left = deadline - Date.now();
			if (left <= 0) failed(`timeout cleanup: discovering descendants of group ${pgid} exceeded 2000 ms`);
			const r = spawnSync("/usr/bin/pgrep", [flag, ids.join(",")], { encoding: "utf8", timeout: left, maxBuffer: PS_CAP });
			if (r.error || (r.status !== 0 && r.status !== 1)) {
				failed(`timeout cleanup: pgrep ${flag} ${ids.join(",")}: ${r.error?.message ?? (r.stderr.trim() || `exit ${r.status}, signal ${r.signal}`)}`);
			}
			return r.stdout.split("\n").filter((s) => /^[1-9]\d*$/.test(s)).map(Number);
		};
		const seen = new Set([pgid]);
		let frontier = [...new Set([pgid, ...query("-g", [pgid])])];
		for (let depth = 0; frontier.length > 0; depth++) {
			if (depth >= 32) failed(`timeout cleanup: descendants of group ${pgid} exceeded 32 levels`);
			for (const pid of frontier) if (groupAlive(pid)) groups.add(pid);
			frontier = query("-P", frontier).filter((pid) => !seen.has(pid));
			for (const pid of frontier) seen.add(pid);
		}
		persistGroups(work, [...groups].filter((g) => g !== pgid));
	} catch (e) {
		cleanupError = e;
	}
	const targets = [...groups];
	for (const g of targets) signalGroup(g, "SIGTERM");
	const until = Date.now() + cfg.killGraceMs;
	while (targets.some(groupAlive) && Date.now() < until) await Bun.sleep(50);
	for (const g of targets) signalGroup(g, "SIGKILL");
	if (cleanupError !== undefined) throw cleanupError;
}

// ---- the stuck capture (PLAN wl-mvq4edh02r5z40 revision 3, D5) -------------------------------------------

/** The most bytes a section of `<part>.stuck.log` holds; also a tool's stdout, a sample report read and the log tail read. */
const CAPTURE_CAP = 1 << 20;
/** ps lists every process; its stdout is filtered to the part's tree before the section cap applies. */
const PS_CAP = 8 << 20;
/** A tool that fails or is refused leaves the last this many bytes of its stderr. */
const STDERR_TAIL = 2_048;
const LOG_TAIL_LINES = 200;
const PS = ["/bin/ps", "-ax", "-o", "pid=,ppid=,pgid=,state=,etime=,command="];

/** Thrown inside the capture once it was cut or ended: the step after it never runs. */
class Abandoned extends Error {}

interface ToolRun {
	argv: string[];
	pid: number | undefined;
	code: number | null;
	signal: NodeJS.Signals | null;
	/** spawn's own failure (ENOENT, EPERM, …) when the tool never ran. */
	error: string | null;
	out: string;
	err: string;
	ms: number;
}

const errText = (e: unknown): string => (e as NodeJS.ErrnoException)?.code ?? (e instanceof Error ? e.message : String(e));

/** One capture: its O_EXCL output file, its deadline, the capture tools still running (each the leader of its own group), its cap dir and the sample reports it named there. */
class Capture {
	private fd: number | null;
	readonly started = Date.now();
	readonly deadline: number;
	/** The capture tools whose pipes have not closed, by process group. */
	private readonly live = new Map<number, ChildProcess>();
	capDir: string | null = null;
	/** The `sample-<pid>.txt` paths this capture named in its cap dir: the only names cleanup unlinks before the kill. */
	private readonly reports = new Set<string>();
	/** Whether the stuck log already says the cap dir was left for after the kill. */
	private capDirLeft = false;
	/** Set at the cut or the end: nothing after it is spawned, read or written as a section. */
	over = false;

	constructor(fd: number, captureMs: number) {
		this.fd = fd;
		this.deadline = this.started + captureMs;
	}

	alive(): void {
		if (this.over) throw new Abandoned();
	}

	/** Whether a hook wait or a report read must stop: the capture is over or its deadline passed. */
	readonly late = (): boolean => this.over || Date.now() >= this.deadline;

	write(text: string): void {
		if (this.fd === null) return;
		try {
			writeSync(this.fd, text);
		} catch (e) {
			process.stderr.write(`as2test: stuck capture: write failed: ${errText(e)}\n`);
			this.close();
		}
	}

	/** A headed, timed section, its body capped at CAPTURE_CAP bytes. */
	section(title: string, since: number, body: string): void {
		this.alive();
		const bytes = Buffer.from(body);
		const text = bytes.length > CAPTURE_CAP ? `${bytes.subarray(0, CAPTURE_CAP).toString()}\n[section cut at ${CAPTURE_CAP} bytes]\n` : body;
		this.write(`== ${title} (${Date.now() - since} ms) ==\n${text}${text.endsWith("\n") ? "" : "\n"}`);
	}

	/**
	 * Run one tool async, detached in its own process group, stdout kept to `outCap` bytes and stderr to its last
	 * STDERR_TAIL; resolves when its pipes close (never rejects once started). Nothing is spawned once the capture is over.
	 */
	tool(argv: string[], outCap = CAPTURE_CAP): Promise<ToolRun> {
		this.alive();
		const t0 = Date.now();
		const { promise, resolve } = Promise.withResolvers<ToolRun>();
		const out: Buffer[] = [];
		let outLen = 0;
		let err = Buffer.alloc(0);
		let child: ChildProcess | undefined;
		let settled = false;
		const finish = (code: number | null, signal: NodeJS.Signals | null, error: string | null) => {
			if (settled) return;
			settled = true;
			if (child?.pid !== undefined) this.live.delete(child.pid);
			resolve({ argv, pid: child?.pid, code, signal, error, out: Buffer.concat(out).toString(), err: err.toString(), ms: Date.now() - t0 });
		};
		try {
			child = spawn(argv[0]!, argv.slice(1), { cwd: "/", stdio: ["ignore", "pipe", "pipe"], detached: true });
		} catch (e) {
			finish(null, null, errText(e));
			return promise;
		}
		if (child.pid !== undefined) this.live.set(child.pid, child);
		child.stdout?.on("data", (c: Buffer) => {
			const keep = Math.min(c.length, outCap - outLen);
			if (keep > 0) {
				out.push(c.subarray(0, keep));
				outLen += keep;
			}
		});
		child.stderr?.on("data", (c: Buffer) => {
			err = Buffer.concat([err, c]);
			if (err.length > STDERR_TAIL) err = err.subarray(err.length - STDERR_TAIL);
		});
		child.on("error", (e) => finish(null, null, errText(e)));
		child.on("close", (code, signal) => finish(code, signal, null));
		return promise;
	}

	/** End the capture: SIGKILL every capture group still running and abandon its pipes (never awaited); returns those groups. */
	stop(): number[] {
		this.over = true;
		const killed = [...this.live.keys()];
		for (const [pgid, child] of this.live) {
			signalGroup(pgid, "SIGKILL");
			child.stdout?.destroy();
			child.stderr?.destroy();
			child.unref();
		}
		this.live.clear();
		return killed;
	}

	/** The path `sample` writes its report for `pid` to, inside the cap dir; recorded so cleanup unlinks exactly it. */
	reportPath(pid: number): string {
		const path = join(this.capDir!, `sample-${pid}.txt`);
		this.reports.add(path);
		return path;
	}

	/**
	 * Before the kill, bounded work only: unlink each sample report this capture named (lstat first; a link is unlinked itself,
	 * never followed; a directory is left), then one rmdir of the cap dir. When that rmdir fails (something else is in it, or a
	 * just-killed sample is still closing) the dir is left for `afterKill` and the stuck log says so, once.
	 */
	clearCapDir(): void {
		if (this.capDir === null) return;
		for (const report of this.reports) {
			try {
				if (!lstatSync(report).isDirectory()) unlinkSync(report);
			} catch {
				// already gone, or not removable here: the rmdir below fails and afterKill removes it
			}
		}
		this.reports.clear();
		try {
			rmdirSync(this.capDir);
			this.capDir = null;
		} catch (e) {
			const code = (e as NodeJS.ErrnoException).code;
			if (code === "ENOENT") {
				this.capDir = null;
				return;
			}
			if (this.capDirLeft) return;
			this.capDirLeft = true;
			this.write(code === "ENOTEMPTY" || code === "EEXIST" ? "cap dir not empty: left for after the kill\n" : `cap dir not removed: ${errText(e)}: left for after the kill\n`);
		}
	}

	/**
	 * After killGroup has killed the part's groups: remove a cap dir `clearCapDir` left, without following a link in it
	 * (removeTree; a just-killed sample may still be closing, so a few tries), then close the stuck log. Never throws.
	 */
	async afterKill(): Promise<void> {
		try {
			for (let attempt = 1; this.capDir !== null; attempt++) {
				try {
					removeTree(this.capDir);
					this.capDir = null;
				} catch (e) {
					if ((e as NodeJS.ErrnoException).code === "ENOENT") this.capDir = null;
					else if (attempt >= 5) {
						this.write(`cap dir ${this.capDir} not removed after the kill: ${errText(e)}\n`);
						this.capDir = null;
					} else await Bun.sleep(20);
				}
			}
		} finally {
			this.close();
		}
	}

	close(): void {
		this.over = true;
		if (this.fd === null) return;
		const fd = this.fd;
		this.fd = null;
		closeSync(fd);
	}
}

/** A tool's block in its section: the command, its pid, how it ended and its stdout; on a failure or refusal, its stderr tail. */
function toolBlock(r: ToolRun): string {
	const how = r.error !== null ? `not run: ${r.error}` : r.signal !== null ? `signal ${r.signal}` : `exit ${r.code}`;
	const failedTool = r.error !== null || r.code !== 0;
	const out = r.out === "" || r.out.endsWith("\n") ? r.out : `${r.out}\n`;
	const err = failedTool && r.err.trim() !== "" ? `stderr (last ${STDERR_TAIL} bytes):\n${r.err.trimEnd()}\n` : "";
	return `$ ${r.argv.join(" ")}  [pid ${r.pid ?? "none"}, ${how}, ${r.ms} ms]\n${out}${err}`;
}

/**
 * Read a file only when it is a regular file, without following a link or blocking: open O_RDONLY|O_NOFOLLOW|O_NONBLOCK,
 * fstat, then one positional read of at most `max` bytes, the first (`head`) or the last (`tail`).
 */
function readRegular(path: string, max: number, from: "head" | "tail"): { text: string } | { refused: string } {
	let fd: number;
	try {
		fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
	} catch (e) {
		return { refused: `${path}: open failed: ${errText(e)}` };
	}
	try {
		const st = fstatSync(fd);
		if (!st.isFile()) {
			const kind = st.isFIFO() ? "a FIFO" : st.isDirectory() ? "a directory" : st.isSocket() ? "a socket" : "a device";
			return { refused: `${path} is ${kind}, not a regular file` };
		}
		const len = Math.min(st.size, max);
		const buf = Buffer.alloc(len);
		const n = readSync(fd, buf, 0, len, from === "tail" ? st.size - len : 0);
		return { text: buf.subarray(0, n).toString() };
	} finally {
		closeSync(fd);
	}
}

interface Proc {
	pid: number;
	bun: boolean;
}

/** Whether a command line runs bun: its first word's basename. */
const runsBun = (command: string): boolean => basename(command.trim().split(/\s+/)[0] ?? "") === "bun";

/**
 * Section 1: the part's process group plus every descendant of its members (a child that moved group is still shown), from
 * one ps snapshot. Where ps is refused (a sandbox refuses its setuid exec), its exit and stderr, then the same tree from pgrep.
 */
async function processTree(c: Capture, pgid: number): Promise<{ body: string; procs: Proc[] }> {
	const ps = await c.tool(PS, PS_CAP);
	c.alive();
	if (ps.error === null && ps.code === 0) {
		const rows = ps.out.split("\n").flatMap((line) => {
			const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+\S+\s+\S+\s+(.*)$/.exec(line);
			return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), command: m[4]!, line: line.trim() }] : [];
		});
		const tree = new Set([pgid, ...rows.filter((r) => r.pgid === pgid).map((r) => r.pid)]);
		for (let grew = true; grew; ) {
			grew = false;
			for (const r of rows) {
				if (tree.has(r.ppid) && !tree.has(r.pid)) {
					tree.add(r.pid);
					grew = true;
				}
			}
		}
		const mine = rows.filter((r) => tree.has(r.pid));
		return {
			body: ["PID PPID PGID STAT ELAPSED COMMAND", ...mine.map((r) => r.line), ""].join("\n"),
			procs: mine.map((r) => ({ pid: r.pid, bun: runsBun(r.command) })),
		};
	}
	const lines = [toolBlock(ps).trimEnd(), "fallback: /usr/bin/pgrep -lf (PID COMMAND; no ppid, state or elapsed)"];
	const found = new Map<number, string>();
	const pgrep = async (args: string[]): Promise<number[]> => {
		const r = await c.tool(["/usr/bin/pgrep", "-lf", ...args]);
		c.alive();
		// pgrep exits 1 when nothing matched; anything else is a failure worth keeping.
		if (r.error !== null || (r.code !== 0 && r.code !== 1)) lines.push(toolBlock(r).trimEnd());
		const fresh: number[] = [];
		for (const line of r.out.split("\n")) {
			const m = /^(\d+) (.*)$/.exec(line);
			if (!m || found.has(Number(m[1]))) continue;
			found.set(Number(m[1]), m[2]!);
			fresh.push(Number(m[1]));
		}
		return fresh;
	};
	let frontier = [pgid, ...(await pgrep(["-g", String(pgid)]))];
	for (let depth = 0; frontier.length > 0 && depth < 32; depth++) frontier = await pgrep(["-P", frontier.join(",")]);
	for (const [pid, command] of found) lines.push(`${pid} ${command}`);
	return { body: `${lines.join("\n")}\n`, procs: [...found].map(([pid, command]) => ({ pid, bun: runsBun(command) })) };
}

/** Section 2, one bun process: `sample` into the cap dir, then (before the deadline only) its report read the safe way. Never rejects. */
async function sampleOne(cfg: Config, runId: string, c: Capture, pid: number): Promise<string> {
	try {
		const report = c.reportPath(pid);
		const r = await c.tool(["/usr/bin/sample", String(pid), "3", "-mayDie", "-file", report]);
		await hook(cfg, runId, "stuck-sample-read", { stop: c.late, info: { report } });
		if (c.late()) return `${toolBlock(r)}report not read: the capture is over\n`;
		const read = readRegular(report, CAPTURE_CAP, "head");
		return `${toolBlock(r)}${"text" in read ? `report (first ${CAPTURE_CAP} bytes at most):\n${read.text}` : `report refused: ${read.refused}`}\n`;
	} catch (e) {
		return e instanceof Abandoned ? "" : `sample ${pid}: failed: ${errText(e)}\n`;
	}
}

/** Sections 1-4 in order; sample and lsof start together once the tree is known. */
async function captureSections(cfg: Config, runId: string, c: Capture, pgid: number, work: string, stem: string, logPath: string): Promise<void> {
	c.capDir = mkdtempSync(join(work, `${stem}.stuck-`));
	let since = Date.now();
	const { body, procs } = await processTree(c, pgid);
	c.section(`1. process tree of group ${pgid}: ${PS.join(" ")}`, since, body);
	since = Date.now();
	const buns = procs.filter((p) => p.bun);
	const samples = buns.map((p) => sampleOne(cfg, runId, c, p.pid));
	const lsofs = procs.map((p) => c.tool(["/usr/sbin/lsof", "-nP", "-p", String(p.pid)]));
	await hook(cfg, runId, "stuck-capture", { stop: c.late });
	c.alive();
	const sampled = await Promise.all(samples);
	c.alive();
	c.section(`2. sample per bun process (${buns.length})`, since, buns.length === 0 ? "no bun process in the tree\n" : sampled.join("\n"));
	const listed = await Promise.all(lsofs);
	c.alive();
	c.section(`3. lsof per process (${procs.length})`, since, procs.length === 0 ? "no process in the tree\n" : listed.map(toolBlock).join("\n"));
	c.clearCapDir();
	since = Date.now();
	const tail = readRegular(logPath, CAPTURE_CAP, "tail");
	let text = "refused" in tail ? `refused: ${tail.refused}\n` : "";
	if ("text" in tail) {
		const lines = tail.text.split("\n");
		if (lines.at(-1) === "") lines.pop();
		text = lines.length === 0 ? "(empty)\n" : `${lines.slice(-LOG_TAIL_LINES).join("\n")}\n`;
	}
	c.section(`4. last ${LOG_TAIL_LINES} lines of ${logPath}`, since, text);
}

/**
 * D5: before the cap's kill, a bounded stuck capture into `<part stem>.stuck.log` beside the part's log, opened
 * O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW; when that open fails the capture is skipped with one stderr line and null comes back.
 * One deadline (cfg.captureMs) owns it: at the deadline every capture group still running is SIGKILLed, its readers are
 * abandoned, the cap dir is cleared with bounded work only (`clearCapDir`) and the file says `capture cut at <ms> ms`.
 * The caller kills the part's group, then calls the returned capture's `afterKill` (a leftover cap dir goes, the file
 * closes). Never throws; nothing it does changes the part's exit.
 */
async function stuckCapture(cfg: Config, runId: string, work: string, pgid: number, logPath: string, cap: number): Promise<Capture | null> {
	const stem = basename(logPath, ".log");
	const path = join(work, `${stem}.stuck.log`);
	let fd: number;
	try {
		fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
	} catch (e) {
		process.stderr.write(`as2test: stuck capture skipped: cannot create ${path}: ${errText(e)}\n`);
		return null;
	}
	const c = new Capture(fd, cfg.captureMs);
	try {
		c.write(`stuck capture of ${stem} (process group ${pgid}) at its cap of ${cap} ms, ${new Date(c.started).toISOString()}, deadline ${cfg.captureMs} ms\n`);
		const deadline = Promise.withResolvers<"cut">();
		const timer = setTimeout(() => deadline.resolve("cut"), cfg.captureMs);
		const run = captureSections(cfg, runId, c, pgid, work, stem, logPath).then(
			() => "done" as const,
			(e: unknown) => {
				if (!(e instanceof Abandoned)) c.write(`capture failed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
				return "done" as const;
			},
		);
		const how = await Promise.race([run, deadline.promise]);
		clearTimeout(timer);
		const killed = c.stop();
		c.clearCapDir();
		if (how === "cut") c.write(`capture cut at ${Date.now() - c.started} ms\nkilled capture groups: ${killed.join(" ") || "none"}\n`);
		else if (killed.length > 0) c.write(`killed capture groups still running: ${killed.join(" ")}\n`);
	} catch (e) {
		c.write(`capture failed: ${errText(e)}\n`);
	}
	return c;
}

// ---- prepare ---------------------------------------------------------------------------------------

function git(args: string[], env: Record<string, string>, cwd: string): void {
	const r = spawnSync(REAL_GIT, ["-c", "core.hooksPath=/dev/null", "-c", "init.templateDir=", "-c", "credential.helper=", ...args], { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	if (r.status !== 0) failed(`git ${args[0]}: ${(r.stderr || r.stdout || String(r.error ?? "")).trim().split("\n").at(-1)}`);
}

/** chmod u=rwX,go=rX over a tree, never following a symlink. */
function openUp(path: string): void {
	const st = lstatSync(path);
	if (st.isSymbolicLink()) return;
	if (st.isDirectory()) {
		chmodSync(path, 0o755);
		for (const name of readdirSync(path)) openUp(join(path, name));
	} else if (st.isFile()) chmodSync(path, st.mode & 0o100 ? 0o755 : 0o644);
}

/**
 * Where a side runs (PLAN wl-mv8s8srodefytc rev 17.1 D8): the PR side in `runs/<run id>` itself, base in `runs/<run id>/base`,
 * each with its own clone (`<dir>/repo`) and child layout. Both sides record their process groups in `runs/<run id>/groups`
 * and write their reports into `runs/<run id>`, base's as `base-solo-<i>.*`.
 */
type Side = "pr" | "base";
const REPORT_PREFIX: Record<Side, string> = { pr: "", base: "base-" };

/** The side's directory: the run's work dir, or its `base` child, a real directory that resolves to itself. */
function sideDir(a: Areas, runId: string, side: Side): string {
	const work = workDir(a, runId);
	if (side === "pr") return work;
	const base = join(work, "base");
	if (!inside(base, work) || realpathSync(base) !== base) return refuse(`${base} is not a directory (base-prepare first)`);
	return base;
}

function prepare(cfg: Config, a: Areas, runId: string, sha: string, side: Side): void {
	if (!SHA_RE.test(sha)) refuse(`${sha} is not a full sha`);
	fence(a, runId);
	const stageRun = join(a.stage, runId);
	const bundle = join(stageRun, "repo.bundle");
	if (!existsSync(bundle)) failed(`${bundle} is missing`);
	if (!inside(bundle, stageRun) || realpathSync(bundle) === stageRun) refuse(`${bundle} resolves outside ${stageRun}`);
	// Base clones beside the PR's clone, after it: the run's work dir and its groups file already exist.
	const runWork = side === "pr" ? join(a.runs, runId) : workDir(a, runId);
	const work = side === "pr" ? runWork : join(runWork, "base");
	if (side === "pr" && existsSync(work)) {
		// The shell must make TMPDIR before Bun starts, including a sweep/probe before prepare.
		// Only that bootstrap layout may preexist; claim preparation exclusively before any other write.
		workDir(a, runId);
		const tmp = join(work, ".wrapper-tmp");
		const entries = readdirSync(work);
		if (entries.length !== 1 || entries[0] !== ".wrapper-tmp") refuse(`${work} already exists`);
		const st = lstatSync(tmp);
		if (!st.isDirectory() || realpathSync(tmp) !== tmp || st.uid !== process.getuid?.() || (st.mode & 0o777) !== 0o700) refuse(`${tmp} is not an owned private plain directory`);
	} else {
		try {
			mkdirSync(work, { mode: 0o755 });
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === "EEXIST") refuse(`${work} already exists`);
			throw e;
		}
	}
	// A failed/interrupted prepare is not reusable, nor can two prepare processes share a run.
	try {
		mkdirSync(join(work, ".prepare"), { mode: 0o700 });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "EEXIST") refuse(`${work} already exists`);
		throw e;
	}
	const l = childLayout(work);
	for (const d of [l.home, l.tmp, l.xdgConfig, l.xdgCache, l.xdgData, l.bunCache, dirname(l.ledger), l.shimDir]) mkdirSync(d, { recursive: true, mode: 0o755 });
	writeFileSync(l.gitconfig, childGitconfigText(), { mode: 0o644 });
	writeFileSync(join(l.shimDir, "git"), gitShimText(REAL_GIT), { mode: 0o755 });
	symlinkSync(cfg.bun, join(l.shimDir, "bun"));
	if (side === "pr") writeFileSync(groupsFile(work), "", { mode: 0o644 });
	// The clone sees no system config and an empty global one.
	const env = { ...childEnv(process.env, work), GIT_CONFIG_GLOBAL: "/dev/null" };
	git(["clone", "--quiet", "--no-checkout", realpathSync(bundle), join(work, "repo")], env, work);
	git(["checkout", "--quiet", "--detach", sha], env, join(work, "repo"));
	git(["remote", "remove", "origin"], env, join(work, "repo"));
	chmodSync(work, 0o755);
	// Native extraction artifacts in the wrapper's private startup TMPDIR stay private.
	for (const name of readdirSync(work)) if (name !== ".wrapper-tmp") openUp(join(work, name));
	process.stdout.write(`prepared ${join(work, "repo")} at ${sha}\n`);
}

// ---- full and solo ---------------------------------------------------------------------------------

/** `<stage>/<run id>/caps.json`, written by the runner in its trusted phase before any part. */
function caps(a: Areas, runId: string): { path: string; v: Record<string, unknown> } {
	const path = join(a.stage, runId, "caps.json");
	let v: unknown;
	try {
		v = JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return refuse(`${path} is missing or not json (the runner writes the caps before a part)`);
	}
	return { path, v: v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {} };
}

function capMs(a: Areas, runId: string, key: "fullCapMin" | "soloCapMin"): number {
	const { path, v } = caps(a, runId);
	const n = v[key];
	if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return refuse(`${path} has no positive ${key}`);
	return Math.round(n * 60_000);
}

/** The PR full part's workers: caps.json `fullWorkers`, 1 (serial) when the key is absent; anything but an integer of 1 or more is refused. */
function fullWorkers(a: Areas, runId: string): number {
	const { path, v } = caps(a, runId);
	const n = v.fullWorkers;
	if (n === undefined) return 1;
	if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1) return refuse(`${path} has a fullWorkers that is not an integer of 1 or more`);
	return n;
}

/** Remove a stale report so a part that writes none is read as missing, never as an earlier one. */
function unlinkIfPresent(path: string): void {
	try {
		unlinkSync(path);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
	}
}

/**
 * Run `bun test …` in `<dir>/repo` with `<dir>`'s child env, in its own process group under the cap; the group is recorded in the
 * run's groups file for a `groups` sweep. At the cap, the stuck capture (D5) runs, bounded by its own deadline, before the kill.
 */
async function part(cfg: Config, runId: string, work: string, dir: string, argv: string[], logPath: string, cap: number): Promise<number> {
	const log = openSync(logPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
	const child = spawn(cfg.bun, argv, { cwd: join(dir, "repo"), env: childEnv(process.env, dir), stdio: ["ignore", log, log], detached: true });
	closeSync(log);
	const pgid = child.pid;
	if (pgid === undefined) return failed(`bun did not start`);
	appendFileSync(groupsFile(work), `${pgid}\n`);
	const done = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((r) => child.on("exit", (code, signal) => r({ code, signal })));
	let timer: ReturnType<typeof setTimeout> | undefined;
	const capped = new Promise<"cap">((r) => {
		timer = setTimeout(() => r("cap"), cap);
	});
	const first = await Promise.race([done, capped]);
	clearTimeout(timer);
	if (first === "cap") {
		const capture = await stuckCapture(cfg, runId, work, pgid, logPath, cap);
		const errors: string[] = [];
		try {
			await killGroup(cfg, pgid, work);
		} catch (e) {
			errors.push(e instanceof Error ? e.message : String(e));
		} finally {
			// Off the kill path: a cap dir the capture could not clear goes after the groups are killed.
			try {
				await capture?.afterKill();
			} catch (e) {
				errors.push(`stuck capture finalization failed: ${e instanceof Error ? e.message : String(e)}`);
			} finally {
				await done;
			}
		}
		const timeout = `timeout: the part passed its cap of ${cap} ms; its group was killed`;
		if (errors.length > 0) throw new Exit(WRAPPER_EXIT.failed, `${timeout}\n${errors.join("\n")}`);
		throw new Exit(WRAPPER_EXIT.timeout, timeout);
	}
	// Anything the part left behind in its group is the sweep's (§ 2.3 step 4): the runner sweeps after every part.
	if (first.code !== null) return first.code;
	return 128 + (first.signal ? (osConstants.signals[first.signal] ?? 0) : 0);
}

async function full(cfg: Config, a: Areas, runId: string): Promise<number> {
	fence(a, runId);
	const work = workDir(a, runId);
	const cap = capMs(a, runId, "fullCapMin");
	const workers = fullWorkers(a, runId);
	const xml = join(work, "full.xml");
	const log = join(work, "full.log");
	unlinkIfPresent(xml);
	unlinkIfPresent(log);
	unlinkIfPresent(join(work, "full.stuck.log"));
	return part(cfg, runId, work, work, ["test", "--reporter=junit", `--reporter-outfile=${xml}`, ...(workers > 1 ? [`--parallel=${workers}`] : [])], log, cap);
}

async function solo(cfg: Config, a: Areas, runId: string, file: string, side: Side): Promise<number> {
	if (!file.startsWith("./")) refuse(`${file} must be ./<relative path>`);
	const rel = file.slice(2);
	if (rel === "" || rel.includes("\0") || rel.split("/").some((s) => s === "" || s === "." || s === "..")) refuse(`${file} is not a plain relative path`);
	if (!isBunTestFile(rel)) refuse(`${file} is not a Bun test file name`);
	fence(a, runId);
	const work = workDir(a, runId);
	const dir = sideDir(a, runId, side);
	const repo = join(dir, "repo");
	let realRepo: string;
	try {
		realRepo = realpathSync(repo);
	} catch {
		return refuse(`${repo} is missing (prepare first)`);
	}
	if (realRepo !== repo) refuse(`${repo} is not a plain directory`);
	const target = join(repo, rel);
	if (!inside(target, realRepo) || realpathSync(target) === realRepo) refuse(`${file} resolves outside the clone`);
	if (!lstatSync(realpathSync(target)).isFile()) refuse(`${file} is not a file`);
	const cap = capMs(a, runId, "soloCapMin");
	// Claim the lowest free index: <stem>-<i>.log is created exclusively.
	let i = 1;
	let log = "";
	const stem = `${REPORT_PREFIX[side]}solo`;
	for (; ; i++) {
		log = join(work, `${stem}-${i}.log`);
		try {
			lstatSync(log);
		} catch {
			break;
		}
	}
	const xml = join(work, `${stem}-${i}.xml`);
	unlinkIfPresent(xml);
	unlinkIfPresent(join(work, `${stem}-${i}.stuck.log`));
	process.stdout.write(`part ${stem}-${i}\n`);
	return part(cfg, runId, work, dir, ["test", "--reporter=junit", `--reporter-outfile=${xml}`, `./${rel}`], log, cap);
}

// ---- sweep -------------------------------------------------------------------------------------------

function isBusy(e: unknown): boolean {
	const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
	return code.startsWith("SQLITE_BUSY") || code.startsWith("SQLITE_LOCKED");
}

/**
 * The sweep (§ 2.3 steps 1 and 3): hold `BEGIN EXCLUSIVE` on `locks/sweep.db` (journal in memory, so
 * no file is ever created beside it) for the whole sweep, in this process, which also sends every
 * signal. With the lock held: `current` must name this run; SIGTERM; wait out the grace; read
 * `current` again and abort if it changed; SIGKILL. The lock goes when the process exits.
 */
async function sweep(cfg: Config, a: Areas, runId: string): Promise<number> {
	fence(a, runId);
	const lockPath = join(a.locks, "sweep.db");
	if (!inside(lockPath, a.locks) || realpathSync(lockPath) !== lockPath) failed(`${lockPath} is not a plain file under ${a.locks}`);
	let db: Database;
	try {
		db = new Database(lockPath, { readwrite: true, create: false });
	} catch (e) {
		return failed(`cannot open ${lockPath}: ${(e as Error).message} (re-run install/as2test-setup.sh)`);
	}
	// Setting the journal mode reads the file under a shared lock, so it waits on a holder exactly
	// like BEGIN EXCLUSIVE does: both sit in the one retry loop, bounded by the lock wait.
	const deadline = Date.now() + cfg.sweepLockWaitMs;
	let journal = false;
	for (;;) {
		const left = deadline - Date.now();
		db.run(`PRAGMA busy_timeout=${Math.max(0, Math.min(left, 5_000))}`);
		try {
			if (!journal) {
				const mode = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode=MEMORY").get()?.journal_mode;
				if (mode !== "memory") return failed(`${lockPath} would not take journal_mode=MEMORY (got ${mode}); re-run install/as2test-setup.sh`);
				journal = true;
			}
			db.run("BEGIN EXCLUSIVE");
			break;
		} catch (e) {
			if (e instanceof Exit) throw e;
			if (!isBusy(e)) return failed(`sweep lock: ${(e as Error).message} (re-run install/as2test-setup.sh if ${lockPath} is corrupt)`);
			if (Date.now() >= deadline) throw new Exit(WRAPPER_EXIT.sweepLockHeld, `error sweep lock held: waited ${cfg.sweepLockWaitMs} ms for ${lockPath}`);
			await Bun.sleep(Math.min(100, Math.max(0, deadline - Date.now())));
		}
	}
	if (readCurrent(a) !== runId) throw new Exit(WRAPPER_EXIT.fenced, `fenced: current no longer names ${runId}; nothing signalled`);
	await hook(cfg, runId, "sweep-read1");

	const work = join(a.runs, runId);
	const groups = (): number[] => {
		if (cfg.sweep !== "groups") return [];
		let text = "";
		try {
			text = readFileSync(groupsFile(work), "utf8");
		} catch {
			return [];
		}
		return [...new Set(text.split("\n").filter((s) => /^[1-9]\d*$/.test(s)).map(Number))].filter((g) => g !== process.pid);
	};
	// Resolve the actual account, not an argv/config UID. Refuse before signaling or touching /private/tmp
	// unless this is really that user's process. Groups fixtures never resolve the account or sweep temp.
	let ownerUid: number | null = null;
	if (cfg.sweep !== "groups") {
		const id = spawnSync("/usr/bin/id", ["-u", AS2TEST_USER], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
		const uid = /^\d+\s*$/.test(id.stdout ?? "") ? Number(id.stdout.trim()) : NaN;
		if (id.status !== 0 || !Number.isSafeInteger(uid) || uid <= 0 || process.getuid?.() !== uid) refuse(`uid sweep must run as ${AS2TEST_USER}`);
		ownerUid = uid;
	}
	const signal = (sig: "TERM" | "KILL"): void => {
		if (cfg.sweep === "groups") for (const g of groups()) signalGroup(g, `SIG${sig}`);
		else spawnSync("/usr/bin/pkill", [`-${sig}`, "-U", String(ownerUid)], { stdio: "ignore" });
	};
	const anyLeft = (): boolean => {
		if (cfg.sweep === "groups") return groups().some(groupAlive);
		return spawnSync("/usr/bin/pgrep", ["-U", String(ownerUid)], { stdio: "ignore" }).status === 0;
	};

	signal("TERM");
	const until = Date.now() + cfg.killGraceMs;
	while (anyLeft() && Date.now() < until) await Bun.sleep(50);
	if (readCurrent(a) !== runId) throw new Exit(WRAPPER_EXIT.fenced, `fenced: current changed during the sweep; aborted before SIGKILL`);
	await hook(cfg, runId, "sweep-read2");
	signal("KILL");
	if (cfg.sweep === "groups" && existsSync(groupsFile(work))) writeFileSync(groupsFile(work), groups().filter(groupAlive).map((g) => `${g}\n`).join(""));
	if (ownerUid !== null) {
		for (const removal of sweepLegacyNativeTemps("/private/tmp", ownerUid)) {
			const line = `native-temp: ${JSON.stringify(removal)}\n`;
			if (removal.kind === "removed") process.stdout.write(line);
			else process.stderr.write(line);
		}
	}
	db.run("COMMIT");
	db.close();
	process.stdout.write(`swept ${runId} (${cfg.sweep === "groups" ? "groups" : `uid ${AS2TEST_USER}`})\n`);
	return WRAPPER_EXIT.ok;
}

// ---- cleanup -----------------------------------------------------------------------------------------

/** Delete a tree without following any symlink in it; directories are opened up first so a read-only one goes too. */
function removeTree(path: string): void {
	const st = lstatSync(path);
	if (st.isDirectory()) {
		chmodSync(path, 0o700);
		for (const name of readdirSync(path)) removeTree(join(path, name));
		rmdirSync(path);
	} else unlinkSync(path);
}

function cleanup(a: Areas, runId: string, oldRunId: string): number {
	if (!RUN_ID_RE.test(oldRunId)) refuse(`${oldRunId} is not a run id`);
	if (oldRunId === runId) refuse("cleanup never deletes its own run");
	fence(a, runId);
	const target = join(a.runs, oldRunId);
	let st;
	try {
		st = lstatSync(target);
	} catch {
		process.stdout.write(`cleanup: ${target} is already gone\n`);
		return WRAPPER_EXIT.ok;
	}
	if (st.isSymbolicLink() || !st.isDirectory()) refuse(`${target} is not a real directory`);
	if (realpathSync(target) !== target || dirname(target) !== a.runs) refuse(`${target} is not a direct child of ${a.runs}`);
	removeTree(target);
	process.stdout.write(`cleanup: removed ${target}\n`);
	return WRAPPER_EXIT.ok;
}

// ---- probe ---------------------------------------------------------------------------------------------

/** Whether this user can open `path` for reading (O_NONBLOCK: a FIFO cannot block it), and write it or create it. */
function probeOne(path: string): { path: string; read: boolean; write: boolean } {
	let read = false;
	try {
		closeSync(openSync(path, constants.O_RDONLY | constants.O_NONBLOCK));
		read = true;
	} catch {
		// unreadable or absent
	}
	// A missing path is writable when its nearest existing ancestor is.
	let p = path;
	for (;;) {
		try {
			lstatSync(p);
			break;
		} catch {
			const up = dirname(p);
			if (up === p) break;
			p = up;
		}
	}
	let write = false;
	try {
		accessSync(p, constants.W_OK);
		write = true;
	} catch {
		// not writable
	}
	return { path, read, write };
}

function probe(a: Areas, runId: string, paths: string[]): number {
	if (paths.length === 0 || !paths.every((p) => isAbsolute(p) && !p.includes("\0"))) refuse("probe takes one or more absolute paths");
	fence(a, runId);
	const answers = paths.map((p) => probeOne(resolve(p)));
	process.stdout.write(answers.map((x, i) => `${probeAnswerLine({ ...x, path: paths[i]! })}\n`).join(""));
	return answers.some((x) => x.read || x.write) ? WRAPPER_EXIT.probeReachable : WRAPPER_EXIT.ok;
}

// ---- main ------------------------------------------------------------------------------------------------

const ARITY: Record<string, number> = { prepare: 1, full: 0, solo: 1, "base-prepare": 1, "base-solo": 1, sweep: 0, cleanup: 1 };

async function main(argv: string[]): Promise<number> {
	process.umask(0o022);
	const cfg = config();
	const [sub, runId, ...ops] = argv;
	if (sub === undefined || runId === undefined) return refuse("usage: exec <subcommand> <run id> [operand...]");
	if (!RUN_ID_RE.test(runId)) return refuse("run id must match ^tr-[a-z0-9]+$");
	if (sub === "probe") {
		if (ops.length < 1) return refuse("probe takes <run id> and one or more paths");
	} else if (!Object.hasOwn(ARITY, sub)) return refuse(`unknown subcommand ${sub}`);
	else if (ops.length !== ARITY[sub]) return refuse(`${sub} takes exactly ${ARITY[sub]} operand(s) after the run id`);
	const a = areas(cfg);
	switch (sub) {
		case "prepare":
		case "base-prepare":
			prepare(cfg, a, runId, ops[0]!, sub === "prepare" ? "pr" : "base");
			return WRAPPER_EXIT.ok;
		case "full":
			return full(cfg, a, runId);
		case "solo":
		case "base-solo":
			return solo(cfg, a, runId, ops[0]!, sub === "solo" ? "pr" : "base");
		case "sweep":
			return sweep(cfg, a, runId);
		case "cleanup":
			return cleanup(a, runId, ops[0]!);
		default:
			return probe(a, runId, ops);
	}
}

try {
	process.exitCode = await main(process.argv.slice(2));
} catch (e) {
	if (e instanceof Exit) {
		process.stderr.write(`as2test: ${e.message}\n`);
		process.exitCode = e.code;
	} else {
		process.stderr.write(`as2test: failed: ${(e as Error).stack ?? String(e)}\n`);
		process.exitCode = WRAPPER_EXIT.failed;
	}
}
