// The per-workload ctx index at a lane's end (MIGRATION.md item 43): when a lane ends, its workload's
// `~/.agent-system-2/lanes/<wl>/sessions` folder is imported into ctx, the lane's own session is
// checked by its exact header id, and the outcome is one `ctx-index:` control entry.
//
// `lane.ts ctx-index <wl> <laneId> --by runner|starter` is the only caller. Every process that writes
// the lane's `lane-exit:` (or supervised the lane and sees it) spawns that subcommand detached; the
// first ledger transaction (`claimCtxIndex`) lets exactly one of them work. Nothing here throws into
// an exit path, and nothing reaches ctx unless the guard holds: `$HOME` is the account's home from
// the passwd database and `CTX_DATA_ROOT` is unset, so no test or temp HOME ever touches a ctx data
// root other than the real user's. The import runs with `--no-daemon`: it never starts the daemon.
//
// Not indexed (ctx limitations, named in MIGRATION.md item 43): helper sessions nested under a lane
// session, since ctx reads no nested subagent files; and a running lane, whose folder is imported at exit.
import { spawn, spawnSync } from "bun";
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { LANE_RUNNER_BY, LANE_STARTER_BY, type Ledger } from "../../ledger/src/index";
import { type ControlEntry, controlEntries, laneStarted } from "./launch";

export type CtxIndexOutcome = "indexed" | "failed" | "skipped";
export interface CtxIndexResult {
	outcome: CtxIndexOutcome;
	/** The session file's header id, when the file has one (read before the guard, so a skip names it too). */
	sessionId: string | null;
	detail: string;
}

export interface CtxExecResult {
	code: number | null;
	stdout: string;
	stderr: string;
}
/** Run one ctx command; `signal` aborts when the step's bound runs out, and the real exec kills the child then. */
export type CtxExec = (argv: string[], o: { env: Record<string, string | undefined>; signal: AbortSignal }) => Promise<CtxExecResult>;

export interface CtxIndexTimeouts {
	importMs: number;
	checkMs: number;
	totalMs: number;
	/** The wait between two checks: the index can lag the import. */
	retryMs: number;
}
export const CTX_INDEX_TIMEOUTS: CtxIndexTimeouts = { importMs: 600_000, checkMs: 30_000, totalMs: 780_000, retryMs: 5_000 };
/** The checks before a miss is a failure. */
export const CTX_CHECK_ATTEMPTS = 4;
/** The session header is on line 2 after OMP's `title` line; it is looked for in the first five. */
const HEADER_LINES = 5;
const HEADER_BYTES = 64 * 1024;

// ---- the session ---------------------------------------------------------------------------------

/** The `"type":"session"` header's id in the first five lines of `path`, or null (no file, no header). */
export function sessionHeaderId(path: string): string | null {
	let fd: number;
	try {
		fd = openSync(path, "r");
	} catch {
		return null;
	}
	try {
		const buf = Buffer.alloc(HEADER_BYTES);
		const n = readSync(fd, buf, 0, HEADER_BYTES, 0);
		for (const line of buf.subarray(0, n).toString("utf8").split("\n").slice(0, HEADER_LINES)) {
			try {
				const v: unknown = JSON.parse(line);
				if (typeof v === "object" && v !== null && "type" in v && v.type === "session" && "id" in v && typeof v.id === "string" && v.id) return v.id;
			} catch {
				// not a JSON line (or a partial one): not the header
			}
		}
		return null;
	} finally {
		closeSync(fd);
	}
}

/** The session this lane recorded in its own newest `lane-started:`, autonomous or interactive; never another lane's, never a newest-file guess. */
export function laneSession(control: readonly ControlEntry[], laneId: string): string | null {
	return laneStarted(control, laneId)?.session ?? null;
}

/** The top-level `*.jsonl` names in `dir`: the interactive wrapper's snapshot before it spawns OMP. */
export function topLevelSessions(dir: string): string[] {
	try {
		return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith(".jsonl")).map((d) => d.name);
	} catch {
		return [];
	}
}

/**
 * The session file an interactive OMP created: the newest top-level `*.jsonl` in `dir` whose name is
 * not in `preexisting` (the snapshot taken before the spawn), or null. A file that existed before
 * is never taken, however recently it was modified: it is another lane's.
 */
export function newLaneSession(dir: string, preexisting: readonly string[]): string | null {
	const before = new Set(preexisting);
	let best: { path: string; mtime: number } | null = null;
	for (const name of topLevelSessions(dir)) {
		if (before.has(name)) continue;
		const path = join(dir, name);
		let mtime: number;
		try {
			mtime = statSync(path).mtimeMs;
		} catch {
			continue;
		}
		if (best === null || mtime > best.mtime) best = { path, mtime };
	}
	return best?.path ?? null;
}

// ---- the guard -----------------------------------------------------------------------------------

/**
 * Why the indexing must not reach ctx, or null when it may: the passwd home is unknown (fail closed),
 * `$HOME` is not it (trailing slashes aside), or `CTX_DATA_ROOT` is set (any value).
 */
export function guardReason(env: Record<string, string | undefined>, passwdHome: () => string | null): string | null {
	const real = passwdHome();
	if (!real) return "passwd-home-unknown";
	const trailing = /(.)\/+$/;
	if (!env.HOME || env.HOME.replace(trailing, "$1") !== real.replace(trailing, "$1")) return "home-guard";
	if (env.CTX_DATA_ROOT !== undefined) return "ctx-data-root";
	return null;
}

const run = (argv: string[]): string | null => {
	try {
		const r = spawnSync(argv, { stdout: "pipe", stderr: "pipe", timeout: 5_000 });
		return r.exitCode === 0 ? r.stdout.toString() : null;
	} catch {
		return null;
	}
};

/**
 * The account's home from the passwd database, never from `$HOME` (Bun's `os.userInfo()` follows
 * `$HOME` and `$USER`): `dscl . -read /Users/<user> NFSHomeDirectory` on macOS, else `getent passwd
 * <user>`, the user from `id -un`. Null when neither yields a path.
 */
export function passwdHome(): string | null {
	const user = run(["id", "-un"])?.trim();
	if (!user) return null;
	if (process.platform === "darwin") {
		const m = /^NFSHomeDirectory:\s*(\S.*)$/m.exec(run(["dscl", ".", "-read", `/Users/${user}`, "NFSHomeDirectory"]) ?? "");
		if (m) return m[1]!.trim();
	}
	const home = (run(["getent", "passwd", user]) ?? "").split("\n")[0]!.split(":")[5]?.trim();
	return home || null;
}

/** The real exec: the child is SIGKILLed when the step's bound aborts it. */
export const realExec: CtxExec = async (argv, { env, signal }) => {
	const child = spawn(argv, { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
	const kill = (): void => {
		child.kill("SIGKILL");
	};
	signal.addEventListener("abort", kill, { once: true });
	try {
		const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
		return { code, stdout, stderr };
	} finally {
		signal.removeEventListener("abort", kill);
	}
};

// ---- the import and the check --------------------------------------------------------------------

export interface IndexLaneSessions {
	/** `~/.agent-system-2/lanes/<wl>/sessions`: the whole folder is imported. */
	sessionsDir: string;
	/** The lane's session file, from its own `lane-started:` (`laneSession`); null when it recorded none. */
	sessionFile: string | null;
	env: Record<string, string | undefined>;
	exec?: CtxExec;
	passwdHome?: () => string | null;
	/** `ctx` on the env's PATH, or null. */
	which?: (bin: string, env: Record<string, string | undefined>) => string | null;
	timeouts?: Partial<CtxIndexTimeouts>;
}

/** One line for a ledger body: the first non-empty line, at most 200 characters. */
const oneLine = (s: string): string => (s.split("\n").map((l) => l.trim()).find(Boolean) ?? "").slice(0, 200);

/**
 * Import the lane's sessions folder into ctx and check its session is found by exact id. The session
 * header is read first, then the guard; `ctx import --provider pi --path <sessionsDir> --no-blame
 * --no-daemon --progress none`; then `ctx list events --provider pi --provider-session <id> --limit 1
 * --content none --format json` until one event comes back, at most CTX_CHECK_ATTEMPTS times
 * `retryMs` apart (zero events with `terminal: true` is a miss). Each step and the whole run are
 * bounded; a step past its bound is killed and the result is `failed timeout <step>`. Never throws.
 */
export async function indexLaneSessions(o: IndexLaneSessions): Promise<CtxIndexResult> {
	const t = { ...CTX_INDEX_TIMEOUTS, ...o.timeouts };
	const deadline = Date.now() + t.totalMs;
	const sessionId = o.sessionFile !== null && existsSync(o.sessionFile) ? sessionHeaderId(o.sessionFile) : null;
	try {
		if (sessionId === null) return { outcome: "skipped", sessionId: null, detail: "no-session" };
		const why = guardReason(o.env, o.passwdHome ?? passwdHome);
		if (why !== null) return { outcome: "skipped", sessionId, detail: why };
		const ctx = (o.which ?? ((bin, env) => Bun.which(bin, { PATH: env.PATH ?? "" })))("ctx", o.env);
		if (!ctx) return { outcome: "skipped", sessionId, detail: "no-ctx" };
		const exec = o.exec ?? realExec;

		/** One bounded step: the exec's result, or null when its bound (or the whole run's) ran out and it was aborted. */
		const step = async (argv: string[], boundMs: number): Promise<CtxExecResult | null> => {
			const ms = Math.min(boundMs, deadline - Date.now());
			if (ms <= 0) return null;
			const ac = new AbortController();
			let timer: ReturnType<typeof setTimeout> | undefined;
			const expired = new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), ms);
			});
			try {
				const r = await Promise.race([exec(argv, { env: o.env, signal: ac.signal }), expired]);
				if (r === null) ac.abort();
				return r;
			} finally {
				clearTimeout(timer);
			}
		};

		const imported = await step([ctx, "import", "--provider", "pi", "--path", o.sessionsDir, "--no-blame", "--no-daemon", "--progress", "none"], t.importMs);
		if (imported === null) return { outcome: "failed", sessionId, detail: "timeout import" };
		if (imported.code !== 0) return { outcome: "failed", sessionId, detail: `import exit ${imported.code ?? "-"}: ${oneLine(imported.stderr || imported.stdout) || "no output"}` };

		const check = [ctx, "list", "events", "--provider", "pi", "--provider-session", sessionId, "--limit", "1", "--content", "none", "--format", "json"];
		for (let n = 1; n <= CTX_CHECK_ATTEMPTS; n++) {
			if (n > 1) await Bun.sleep(Math.max(0, Math.min(t.retryMs, deadline - Date.now())));
			const r = await step(check, t.checkMs);
			if (r === null) return { outcome: "failed", sessionId, detail: "timeout check" };
			if (r.code !== 0) return { outcome: "failed", sessionId, detail: `check exit ${r.code ?? "-"}: ${oneLine(r.stderr || r.stdout) || "no output"}` };
			let page: { events?: unknown; terminal?: unknown };
			try {
				page = JSON.parse(r.stdout) as typeof page;
			} catch {
				return { outcome: "failed", sessionId, detail: "check output is not JSON" };
			}
			const events = Array.isArray(page.events) ? page.events : null;
			if (events !== null && events.length > 0) return { outcome: "indexed", sessionId, detail: `found by id after ${n} check(s)` };
			if (events === null || page.terminal !== true) return { outcome: "failed", sessionId, detail: "check output has no terminal events page" };
		}
		return { outcome: "failed", sessionId, detail: `not found by id after ${CTX_CHECK_ATTEMPTS} checks` };
	} catch (err) {
		return { outcome: "failed", sessionId, detail: `error ${oneLine(String(err))}` };
	}
}

// ---- the subcommand: the claim and the record ------------------------------------------------------

/** `--by runner|starter` → the writer the entries carry; anything else (or nothing) → null, and the subcommand refuses. */
export function ctxIndexWriter(by: string | undefined): string | null {
	return by === "runner" ? LANE_RUNNER_BY : by === "starter" ? LANE_STARTER_BY : null;
}
export function ctxIndexClaimBody(laneId: string, pid: number): string {
	return `ctx-index: ${laneId} claimed ${pid}`;
}
export function ctxIndexBody(laneId: string, r: CtxIndexResult): string {
	return `ctx-index: ${laneId} ${r.outcome} ${r.sessionId ?? "-"} ${r.detail}`;
}

/**
 * The per-lane claim, one transaction: with no valid `ctx-index:` entry for `laneId` yet, record
 * `ctx-index: <laneId> claimed <pid>` and return true; else false. The ledger serializes writes, so
 * of any number of workers spawned for one lane exactly one proceeds.
 */
export function claimCtxIndex(ledger: Ledger, workloadId: string, laneId: string, by: string, pid: number): boolean {
	return ledger.write(() => {
		if (controlEntries(ledger.entries(workloadId, "assumption")).some((c) => c.prefix === "ctx-index" && c.laneId === laneId)) return false;
		ledger.recordEntry({ by, workloadId, kind: "assumption", body: ctxIndexClaimBody(laneId, pid) });
		return true;
	});
}

export interface CtxIndexRun extends Omit<IndexLaneSessions, "sessionFile"> {
	/** Opened only once the arguments are valid: a refused run touches no ledger. */
	openLedger: () => Ledger;
	workloadId: string;
	laneId: string | undefined;
	by: string | undefined;
	pid: number;
	/** `ctx-index.log` through the worker's stderr. */
	log: (line: string) => void;
}

/**
 * `lane.ts ctx-index <wl> <laneId> --by runner|starter`: refuse (exit 1, nothing written) without a
 * lane id or a valid `--by`; claim, and exit 0 with no work when another worker holds the claim; else
 * index and record `ctx-index: <laneId> <outcome> <sessionId|-> <detail>` as the `--by` writer. A
 * failed outcome write goes to the log.
 */
export async function runCtxIndex(o: CtxIndexRun): Promise<number> {
	const by = ctxIndexWriter(o.by);
	if (by === null || !o.laneId || !/^lane-\S+$/.test(o.laneId)) {
		o.log("usage: lane.ts ctx-index <workload> <laneId> --by runner|starter");
		return 1;
	}
	const laneId = o.laneId;
	const ledger = o.openLedger();
	if (!claimCtxIndex(ledger, o.workloadId, laneId, by, o.pid)) {
		o.log(`${new Date().toISOString()} ${laneId}: another worker holds the claim; nothing to do`);
		return 0;
	}
	const sessionFile = laneSession(controlEntries(ledger.entries(o.workloadId, "assumption")), laneId);
	const r = await indexLaneSessions({ ...o, sessionFile });
	const body = ctxIndexBody(laneId, r);
	o.log(`${new Date().toISOString()} ${body}`);
	try {
		ledger.recordEntry({ by, workloadId: o.workloadId, kind: "assumption", body });
	} catch (err) {
		o.log(`${new Date().toISOString()} the outcome could not be recorded: ${String(err)}`);
	}
	return 0;
}
