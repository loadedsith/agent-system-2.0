// The `_as2test` user's side of the outside-the-fence test runner (MIGRATION.md item 24; the approved
// plan of workload wl-muraerdsgw7gn4, revision 12, § 2.3 step 3 and § 3.1).
//
// What lives here:
// - `renderExecWrapper`: the root-owned sh wrapper `/usr/local/libexec/as2test/exec`, the one
//   command the sudoers line allows. The root, the bun path, the script path, the child env and the
//   sweep's reach are fixed in its text; argv picks only the subcommand and its operands, and the
//   wrapper checks their shape and arity before it execs `surface/scripts/test-exec.ts` (installed
//   as a single-file bundle) under `env -i`;
// - `execArgv`, the sudo argv the runner spawns (test-run.ts `wrapperArgv`, with the exec path a
//   test may move), and the exit-code names;
// - the preflight (§ 3.1): the paths `probe` opens as `_as2test` and the decision over its answers,
//   the install facts (SOURCE, the account, owners, modes, hashes) and the decision over them;
// - `parseSource`, the SOURCE file the refresh helper writes (install/as2test-setup.sh wrote it before);
// - `renderRefreshHelper`: the root-owned sh helper `/usr/local/libexec/as2test/refresh` (workload
//   wl-mv718fxhwwcn40, PLAN revision 6, § 1.1). It takes no arguments, fetches origin/main from the
//   fixed AS2TEST_ORIGIN into a root-owned mirror, builds test-exec as an unprivileged build user,
//   and installs `exec`, `test-exec.js` and `SOURCE`; the runner calls it through `sudo -n` when
//   `installDecision` reports drift (§ 1.2);
// - a small CLI the setup script and the helper call: `render-exec`, `render-refresh` and `bundle-inputs`.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { defaultLedgerPath } from "../../ledger/src/locality";
import { AS2TEST_EXEC, AS2TEST_ROOT, AS2TEST_USER, WRAPPER_EXIT, type WrapperCall, runsDbOf, wrapperArgv } from "./test-run";

// ---- the wrapper ---------------------------------------------------------------------------------

/** The installed wrapper's directory: `exec`, `bun`, `test-exec.js`, `refresh`, `SOURCE` and `refresh.d/`. */
export const AS2TEST_LIBEXEC = dirname(AS2TEST_EXEC);
/** The sudoers drop-in setup writes (§ 3.1 step 4). */
export const AS2TEST_SUDOERS = "/etc/sudoers.d/as2test";
/** The installed files under AS2TEST_LIBEXEC whose sha-256 SOURCE records. */
export const INSTALLED_FILES = ["exec", "bun", "test-exec.js", "refresh"] as const;
export type InstalledFile = (typeof INSTALLED_FILES)[number];
/** The installed files the refresh helper rebuilds from origin/main; only setup writes the others. */
export const REBUILT_FILES = ["exec", "test-exec.js"] as const satisfies readonly InstalledFile[];
/** The PATH the wrapper and test-exec run with; the child's PATH puts its shim dir in front. */
export const WRAPPER_PATH = "/usr/bin:/bin:/usr/sbin:/sbin";
/** The real git test-exec runs and the child's shim execs. */
export const REAL_GIT = "/usr/bin/git";
/** The installed wrapper's sweep: every process of `_as2test` but the sweeper and its ancestors (pkill's default exclusion). */
export const UID_SWEEP = `/usr/bin/pkill -U ${AS2TEST_USER}`;
/** The sweep's SIGTERM → SIGKILL grace and its wait for `locks/sweep.db` (§ 2.3 steps 1 and 3). */
export const KILL_GRACE_MS = 10_000;
export const SWEEP_LOCK_WAIT_MS = 60_000;

export type SweepScope = "uid" | "groups";

export interface ExecWrapperOptions {
	/** The as2test root: `stage/`, `runs/`, `locks/sweep.db` beneath it. */
	root: string;
	/** The bun binary test-exec and the tests run on. */
	bun: string;
	/** test-exec: the installed bundle, or surface/scripts/test-exec.ts in a test. */
	script: string;
	/** `uid` for the installed wrapper; `groups` for a wrapper a test renders (§ 2.3 step 3). */
	sweepScope: SweepScope;
	/** Test-only, `groups` renders only: the pause-hook directory (`<dir>/<run>.<point>.pause|reached|go`). */
	hooks?: string;
	/** Test-only, `groups` renders only: the SIGTERM → SIGKILL grace (default 10 s). */
	killGraceMs?: number;
	/** Test-only, `groups` renders only: the most a sweep waits for `locks/sweep.db` (default 60 s). */
	sweepLockWaitMs?: number;
}

/** What the wrapper hands test-exec in `AS2TEST_EXEC_CONFIG`; test-exec validates it again. */
export interface ExecConfig {
	root: string;
	bun: string;
	/** `groups`, or exactly UID_SWEEP. */
	sweep: string;
	hooks: string | null;
	killGraceMs: number;
	sweepLockWaitMs: number;
}

export class WrapperRenderError extends Error {}

const plainAbs = (p: string): boolean => isAbsolute(p) && resolve(p) === p && !/[\n\0]/.test(p);
const shq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** The config a render fixes; throws WrapperRenderError on a value the wrapper must not carry. */
export function execConfigOf(o: ExecWrapperOptions): ExecConfig {
	for (const [k, v] of [["root", o.root], ["bun", o.bun], ["script", o.script]] as const) {
		if (typeof v !== "string" || !plainAbs(v)) throw new WrapperRenderError(`${k} must be a normalized absolute path: ${String(v)}`);
	}
	if (o.sweepScope !== "uid" && o.sweepScope !== "groups") throw new WrapperRenderError(`sweepScope must be uid or groups: ${String(o.sweepScope)}`);
	const testOnly = o.hooks !== undefined || o.killGraceMs !== undefined || o.sweepLockWaitMs !== undefined;
	if (testOnly && o.sweepScope !== "groups") throw new WrapperRenderError("hooks, killGraceMs and sweepLockWaitMs are test-only: a uid render carries none");
	if (o.hooks !== undefined && !plainAbs(o.hooks)) throw new WrapperRenderError(`hooks must be a normalized absolute path: ${o.hooks}`);
	const ms = (v: number | undefined, d: number, k: string): number => {
		if (v === undefined) return d;
		if (!Number.isSafeInteger(v) || v < 0) throw new WrapperRenderError(`${k} must be a whole number of ms`);
		return v;
	};
	return {
		root: o.root, bun: o.bun, sweep: o.sweepScope === "uid" ? UID_SWEEP : "groups", hooks: o.hooks ?? null,
		killGraceMs: ms(o.killGraceMs, KILL_GRACE_MS, "killGraceMs"), sweepLockWaitMs: ms(o.sweepLockWaitMs, SWEEP_LOCK_WAIT_MS, "sweepLockWaitMs"),
	};
}

/**
 * The `exec` wrapper's sh text (§ 2.3 step 3). It checks the run id against `^tr-[a-z0-9]+$`, the
 * subcommand and its exact arity, then replaces itself with test-exec under `env -i` and a fixed
 * env: PATH, LANG, TERM, SHELL, USER and LOGNAME (from `id -un`, not the caller), and the config.
 * test-exec checks everything again, fences on `<root>/stage/current`, and resolves every path.
 */
export function renderExecWrapper(o: ExecWrapperOptions): string {
	const config = execConfigOf(o);
	const alnum = "abcdefghijklmnopqrstuvwxyz0123456789";
	return [
		"#!/bin/sh",
		"# agent-system 2.0 test runner: the _as2test wrapper (MIGRATION.md item 24), rendered by",
		"# surface/src/as2test.ts renderExecWrapper. Root, bun, script, env and the sweep's reach are fixed",
		"# here; argv chooses only the subcommand and its operands. Exit 64 is a refusal.",
		`# sweep: ${config.sweep === "groups" ? "groups (a test render: only the process groups this wrapper started)" : config.sweep}`,
		"PATH=" + WRAPPER_PATH,
		"export PATH",
		"umask 022",
		`refuse() { printf 'as2test: refused: %s\\n' "$1" >&2; exit ${WRAPPER_EXIT.refused}; }`,
		'[ "$#" -ge 2 ] || refuse "usage: exec <subcommand> <run id> [operand...]"',
		`case "$2" in tr-|tr-*[!${alnum}]*) refuse "run id must match ^tr-[a-z0-9]+\\$" ;; tr-*) ;; *) refuse "run id must match ^tr-[a-z0-9]+\\$" ;; esac`,
		'case "$1" in',
		'\tfull|sweep) [ "$#" -eq 2 ] || refuse "$1 takes exactly <run id>" ;;',
		'\tprepare|solo|cleanup) [ "$#" -eq 3 ] || refuse "$1 takes exactly <run id> and one operand" ;;',
		'\tprobe) [ "$#" -ge 3 ] || refuse "probe takes <run id> and one or more paths" ;;',
		'\t*) refuse "unknown subcommand" ;;',
		"esac",
		"me=$(/usr/bin/id -un) || refuse \"no user name\"",
		`exec /usr/bin/env -i PATH=${WRAPPER_PATH} LANG=en_US.UTF-8 TERM=dumb SHELL=/bin/sh USER="$me" LOGNAME="$me" \\`,
		`\tAS2TEST_EXEC_CONFIG=${shq(JSON.stringify(config))} \\`,
		`\t${shq(o.bun)} ${shq(o.script)} "$@"`,
		"",
	].join("\n");
}

/** The argv the runner spawns: `sudo -n -u _as2test <exec> <subcommand> <run id> …` (test-run.ts `wrapperArgv`). */
export function execArgv(call: WrapperCall, exec: string = AS2TEST_EXEC): string[] {
	return wrapperArgv(call, exec);
}

/** The name of a wrapper exit code, or null for any other code (for `full` and `solo`, bun's own exit). */
export function wrapperExitName(code: number | null): keyof typeof WRAPPER_EXIT | null {
	for (const [k, v] of Object.entries(WRAPPER_EXIT) as [keyof typeof WRAPPER_EXIT, number][]) if (v === code) return k;
	return null;
}

/** The caps file the runner writes before `full` and `solo`: `<root>/stage/<run id>/caps.json`. */
export function capsPathOf(runId: string, root: string = AS2TEST_ROOT): string {
	return join(root, "stage", runId, "caps.json");
}

// ---- the preflight's probes (§ 3 table, § 3.1) ----------------------------------------------------

/** Jo's credential paths, relative to HOME: `probe` must not open any of them as `_as2test` (§ 3, Home directory). */
export const CREDENTIAL_PATHS = [
	".ssh", ".config/gh", ".agent-system-2", ".omp", "Library/Keychains", ".netrc", ".aws", ".codex/auth.json", ".git-credentials",
	".config/git/credentials", ".gnupg", ".docker/config.json", ".kube/config", ".npmrc",
] as const;

/** `any`: `_as2test` must neither open nor write the path; `write`: it must not write it (reading is allowed). */
export type ProbeForbid = "any" | "write";
export interface ProbeItem {
	path: string;
	forbid: ProbeForbid;
	why: string;
}

/**
 * The paths the preflight probes as `_as2test`, for the paths the runner itself resolved: every
 * credential path under HOME; the ledger (`AGENT_SYSTEM_LEDGER_DB` or the default), its directory,
 * `-wal` and `-shm`; the runs root and its `runs.db`; `<stage>/current` (readable by design, never
 * writable); HOME, the main checkout and the lanes root (never writable). A path listed twice keeps
 * the stricter rule.
 */
export function preflightProbes(o: {
	env: Record<string, string | undefined>;
	runsRoot: string;
	mainCheckout: string;
	lanesRoot: string;
	root?: string;
}): ProbeItem[] {
	const home = o.env.HOME;
	if (!home || !isAbsolute(home)) throw new Error("preflightProbes needs an absolute HOME");
	const ledger = defaultLedgerPath(o.env);
	const items: ProbeItem[] = [
		...CREDENTIAL_PATHS.map((p) => ({ path: join(home, p), forbid: "any" as const, why: "credential" })),
		{ path: ledger, forbid: "any", why: "ledger" },
		{ path: dirname(ledger), forbid: "any", why: "ledger directory" },
		{ path: `${ledger}-wal`, forbid: "any", why: "ledger wal" },
		{ path: `${ledger}-shm`, forbid: "any", why: "ledger shm" },
		{ path: resolve(o.runsRoot), forbid: "any", why: "runs root" },
		{ path: runsDbOf(resolve(o.runsRoot)), forbid: "any", why: "runs lock" },
		{ path: join(o.root ?? AS2TEST_ROOT, "stage", "current"), forbid: "write", why: "current" },
		{ path: resolve(home), forbid: "write", why: "home" },
		{ path: resolve(o.mainCheckout), forbid: "write", why: "main checkout" },
		{ path: resolve(o.lanesRoot), forbid: "write", why: "lanes root" },
	];
	const out = new Map<string, ProbeItem>();
	for (const it of items) {
		const had = out.get(it.path);
		if (!had || (had.forbid === "write" && it.forbid === "any")) out.set(it.path, it);
	}
	return [...out.values()];
}

/** The probe call for these items (paths in order). */
export function probeCall(runId: string, items: readonly ProbeItem[]): WrapperCall {
	return { sub: "probe", runId, paths: items.map((i) => i.path) };
}

/** One line of `probe`'s stdout: whether `_as2test` opened the path for reading, and whether it may write it. */
export interface ProbeAnswer {
	path: string;
	read: boolean;
	write: boolean;
}

/** `probe`'s stdout: one JSON object per line. */
export function probeAnswerLine(a: ProbeAnswer): string {
	return JSON.stringify({ path: a.path, read: a.read, write: a.write });
}

/** `probe`'s answers, or null when any line is not one. */
export function parseProbeAnswers(stdout: string): ProbeAnswer[] | null {
	const out: ProbeAnswer[] = [];
	for (const line of stdout.split("\n")) {
		if (line.trim() === "") continue;
		let v: unknown;
		try {
			v = JSON.parse(line);
		} catch {
			return null;
		}
		if (!v || typeof v !== "object" || !("path" in v) || !("read" in v) || !("write" in v)) return null;
		const { path, read, write } = v;
		if (typeof path !== "string" || typeof read !== "boolean" || typeof write !== "boolean") return null;
		out.push({ path, read, write });
	}
	return out;
}

export type Verdict = { ok: true; summary: string } | { ok: false; reason: string };

/** The probe half of the preflight: `probe` answered (exit 0 or 65) for every item, and none is reachable its forbidden way. */
export function probeDecision(items: readonly ProbeItem[], exit: number | null, stdout: string): Verdict {
	if (exit !== WRAPPER_EXIT.ok && exit !== WRAPPER_EXIT.probeReachable) return { ok: false, reason: `probe did not answer (exit ${exit ?? "signal"})` };
	const answers = parseProbeAnswers(stdout);
	if (!answers) return { ok: false, reason: "probe output is not one answer per line" };
	const byPath = new Map(answers.map((a) => [a.path, a]));
	const reached: string[] = [];
	for (const it of items) {
		const a = byPath.get(it.path);
		if (!a) return { ok: false, reason: `probe gave no answer for ${it.path}` };
		if (it.forbid === "any" && a.read) reached.push(`_as2test can read ${it.path} (${it.why})`);
		if (a.write) reached.push(`_as2test can write ${it.path} (${it.why})`);
	}
	if (reached.length > 0) return { ok: false, reason: reached.join("; ") };
	return { ok: true, summary: `probe: ${items.length} paths unreachable as ${AS2TEST_USER}` };
}

// ---- SOURCE and the install facts (§ 3.1 Setup, Preflight) ------------------------------------------

/** What install/as2test-setup.sh recorded. */
export interface SourceRecord {
	source: string;
	sourceSha: string;
	bunVersion: string;
	user: string;
	uid: number;
	gid: number;
	jo: string;
	joUid: number;
	/** sha-256 of each installed file, by name under the libexec dir. */
	files: Record<string, string>;
	/** sha-256 of each bundle input, by path relative to the source checkout. */
	inputs: Record<string, string>;
	/** What setup created and undo may remove: `user`, `group`, and absolute paths. */
	created: string[];
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * SOURCE: `#` comments, then one `<key> <value…>` per line. Single keys: `version 1`, `source`,
 * `source-sha`, `bun-version`, `user`, `uid`, `gid`, `jo`, `jo-uid`. Repeated keys: `file <name>
 * <sha256>`, `input <relative path> <sha256>`, `created <user|group|absolute path>`.
 */
export function parseSource(text: string): { ok: true; source: SourceRecord } | { ok: false; error: string } {
	const single = new Map<string, string>();
	const files: Record<string, string> = {};
	const inputs: Record<string, string> = {};
	const created: string[] = [];
	for (const [i, raw] of text.split("\n").entries()) {
		const line = raw.trimEnd();
		if (line === "" || line.startsWith("#")) continue;
		const sp = line.indexOf(" ");
		if (sp <= 0) return { ok: false, error: `SOURCE line ${i + 1}: no value` };
		const key = line.slice(0, sp);
		const value = line.slice(sp + 1);
		if (key === "file" || key === "input") {
			const m = /^(\S+) ([0-9a-f]{64})$/.exec(value);
			if (!m) return { ok: false, error: `SOURCE line ${i + 1}: ${key} needs <path> <sha256>` };
			(key === "file" ? files : inputs)[m[1]!] = m[2]!;
		} else if (key === "created") {
			if (value !== "user" && value !== "group" && !plainAbs(value)) return { ok: false, error: `SOURCE line ${i + 1}: created needs user, group or an absolute path` };
			created.push(value);
		} else if (["version", "source", "source-sha", "bun-version", "user", "uid", "gid", "jo", "jo-uid"].includes(key)) {
			if (single.has(key)) return { ok: false, error: `SOURCE line ${i + 1}: ${key} twice` };
			single.set(key, value);
		} else return { ok: false, error: `SOURCE line ${i + 1}: unknown key ${key}` };
	}
	if (single.get("version") !== "1") return { ok: false, error: "SOURCE has no `version 1`" };
	const int = (k: string): number | null => {
		const v = single.get(k);
		return v !== undefined && /^\d+$/.test(v) ? Number(v) : null;
	};
	const [uid, gid, joUid] = [int("uid"), int("gid"), int("jo-uid")];
	for (const k of ["source", "source-sha", "bun-version", "user", "jo"]) if (!single.get(k)) return { ok: false, error: `SOURCE has no ${k}` };
	if (uid === null || gid === null || joUid === null) return { ok: false, error: "SOURCE needs numeric uid, gid and jo-uid" };
	for (const f of INSTALLED_FILES) if (!files[f]) return { ok: false, error: `SOURCE has no file ${f}` };
	if (Object.keys(inputs).length === 0) return { ok: false, error: "SOURCE lists no bundle input" };
	return {
		ok: true,
		source: {
			source: single.get("source")!, sourceSha: single.get("source-sha")!, bunVersion: single.get("bun-version")!, user: single.get("user")!,
			uid, gid, jo: single.get("jo")!, joUid, files, inputs, created,
		},
	};
}

/** Who should own a path setup left: root (gid wheel), Jo (gid `_as2test`) or `_as2test` (gid `_as2test`). */
export type OwnerRole = "root" | "jo" | "as2test";
export interface LayoutItem {
	path: string;
	kind: "file" | "dir";
	owner: OwnerRole;
	mode: number;
	/** The INSTALLED_FILES name, for the installed files under libexec. */
	file?: InstalledFile;
}

/** Every path setup and the refresh helper leave, with its owner and mode (§ 3.1 Setup 2–4; PLAN wl-mv718fxhwwcn40 § 1.2). `current` is the runner's, not setup's. */
export function installLayout(p: { libexec?: string; root?: string; sudoers?: string } = {}): LayoutItem[] {
	const libexec = p.libexec ?? AS2TEST_LIBEXEC;
	const root = p.root ?? AS2TEST_ROOT;
	return [
		{ path: libexec, kind: "dir", owner: "root", mode: 0o755 },
		...INSTALLED_FILES.map((f) => ({ path: join(libexec, f), kind: "file" as const, owner: "root" as const, mode: 0o755, file: f })),
		{ path: join(libexec, "SOURCE"), kind: "file", owner: "root", mode: 0o755 },
		// The helper's lock, mirror and staged copies: root-only, so `_as2test` cannot read them.
		{ path: join(libexec, "refresh.d"), kind: "dir", owner: "root", mode: 0o700 },
		{ path: p.sudoers ?? AS2TEST_SUDOERS, kind: "file", owner: "root", mode: 0o440 },
		{ path: root, kind: "dir", owner: "root", mode: 0o755 },
		{ path: join(root, "stage"), kind: "dir", owner: "jo", mode: 0o750 },
		{ path: join(root, "runs"), kind: "dir", owner: "as2test", mode: 0o755 },
		{ path: join(root, "locks"), kind: "dir", owner: "root", mode: 0o755 },
		{ path: join(root, "locks", "sweep.db"), kind: "file", owner: "as2test", mode: 0o600 },
	];
}

export interface StatFact {
	path: string;
	/** null when lstat failed. */
	type: "file" | "dir" | "symlink" | "other" | null;
	uid: number;
	gid: number;
	mode: number;
}

export interface InstallFacts {
	/** The account as dscl reports it, or null when the user or group is missing. */
	account: { uid: number; gid: number } | null;
	/** SOURCE parsed, or why it could not be. */
	source: { ok: true; source: SourceRecord } | { ok: false; error: string };
	/** Every layout path, lstat'ed. */
	stats: StatFact[];
	/** sha-256 of each installed file (null when unreadable). */
	fileHashes: Record<string, string | null>;
	/** sha-256 of each SOURCE input in the runner's checkout (null when unreadable). */
	inputHashes: Record<string, string | null>;
	layout: LayoutItem[];
}

const sha256File = (p: string): string | null => {
	try {
		return createHash("sha256").update(readFileSync(p)).digest("hex");
	} catch {
		return null;
	}
};

function statFact(path: string): StatFact {
	try {
		const s = lstatSync(path);
		return { path, type: s.isSymbolicLink() ? "symlink" : s.isFile() ? "file" : s.isDirectory() ? "dir" : "other", uid: s.uid, gid: s.gid, mode: s.mode & 0o7777 };
	} catch {
		return { path, type: null, uid: -1, gid: -1, mode: 0 };
	}
}

/** `dscl . -read <record> <key>` → the integer value, or null. */
export type DsclRead = (record: string, key: string) => number | null;

const realDscl: DsclRead = (record, key) => {
	const r = Bun.spawnSync(["/usr/bin/dscl", ".", "-read", record, key], { stdout: "pipe", stderr: "ignore" });
	if (r.exitCode !== 0) return null;
	const m = new RegExp(`^${key}:\\s*(\\d+)\\s*$`, "m").exec(r.stdout.toString());
	return m ? Number(m[1]) : null;
};

/** The install facts the preflight decides on, read as Jo (§ 3.1 Preflight). `checkout` is the runner's checkout, whose bundle inputs must match SOURCE. */
export function readInstall(p: { checkout: string; libexec?: string; root?: string; sudoers?: string; dscl?: DsclRead }): InstallFacts {
	const libexec = p.libexec ?? AS2TEST_LIBEXEC;
	const dscl = p.dscl ?? realDscl;
	const layout = installLayout(p);
	let source: InstallFacts["source"];
	try {
		source = parseSource(readFileSync(join(libexec, "SOURCE"), "utf8"));
	} catch (e) {
		source = { ok: false, error: `SOURCE unreadable: ${(e as Error).message}` };
	}
	const uid = dscl(`/Users/${AS2TEST_USER}`, "UniqueID");
	const userGid = dscl(`/Users/${AS2TEST_USER}`, "PrimaryGroupID");
	const gid = dscl(`/Groups/${AS2TEST_USER}`, "PrimaryGroupID");
	const account = uid !== null && gid !== null && userGid === gid ? { uid, gid } : null;
	const fileHashes: Record<string, string | null> = {};
	for (const f of INSTALLED_FILES) fileHashes[f] = sha256File(join(libexec, f));
	const inputHashes: Record<string, string | null> = {};
	if (source.ok) {
		for (const rel of Object.keys(source.source.inputs)) {
			const abs = resolve(p.checkout, rel);
			inputHashes[rel] = relative(p.checkout, abs).startsWith("..") ? null : sha256File(abs);
		}
	}
	return { account, source, stats: layout.map((l) => statFact(l.path)), fileHashes, inputHashes, layout };
}

/** The ids the owner roles stand for: root and wheel are 0 on a real install; a test passes its own. */
export interface OwnerIds {
	root: number;
	wheel: number;
	jo: number;
}

const RERUN = "re-run install/as2test-setup.sh";

/**
 * Why the install half failed (PLAN wl-mv718fxhwwcn40 § 1.2): `install` only setup can fix;
 * `file-drift` (an installed `exec` or `test-exec.js` missing, not a regular file, or off its
 * SOURCE hash) and `input-drift` (a SOURCE input differs in the runner's checkout) the refresh
 * helper can.
 */
export type InstallFailKind = "install" | "file-drift" | "input-drift";
export type InstallVerdict = { ok: true; summary: string } | { ok: false; kind: InstallFailKind; reason: string };

/**
 * The install half of the preflight (§ 3.1 Preflight; PLAN wl-mv718fxhwwcn40 § 1.2). The groups
 * run in order and the first failing one sets the kind:
 * 1. `install`: the account, SOURCE, SOURCE's ids against the account's and Jo's, every layout
 *    item's type, owner and mode (a rebuilt file only when it exists as a regular file), and the
 *    hashes of the files only setup writes (`bun`, `refresh`). The reason says to re-run setup.
 * 2. `file-drift`: a rebuilt file (`exec`, `test-exec.js`) missing, not a regular file, or off its hash.
 * 3. `input-drift`: a SOURCE input differs in the runner's checkout.
 */
export function installDecision(f: InstallFacts, ids: OwnerIds): InstallVerdict {
	const install = (reason: string): InstallVerdict => ({ ok: false, kind: "install", reason: `${reason}; ${RERUN}` });
	if (!f.account) return install(`the ${AS2TEST_USER} account is missing or its user and group ids differ`);
	if (!f.source.ok) return install(f.source.error);
	const src = f.source.source;
	if (src.user !== AS2TEST_USER || src.uid !== f.account.uid || src.gid !== f.account.gid) {
		return install(`SOURCE records ${src.user} ${src.uid}:${src.gid}, the account is ${f.account.uid}:${f.account.gid}`);
	}
	if (src.joUid !== ids.jo) return install(`SOURCE was set up for uid ${src.joUid}, not ${ids.jo}`);
	const rebuilt = (name: InstalledFile | undefined): boolean => name !== undefined && (REBUILT_FILES as readonly InstalledFile[]).includes(name);
	const want = (r: OwnerRole): [number, number] => (r === "root" ? [ids.root, ids.wheel] : r === "jo" ? [ids.jo, src.gid] : [src.uid, src.gid]);
	for (const [i, l] of f.layout.entries()) {
		const s = f.stats[i]!;
		// A rebuilt file that is missing or not a regular file is file-drift, decided below.
		if (rebuilt(l.file) && s.type !== "file") continue;
		if (s.type !== l.kind) return install(`${l.path} is ${s.type ?? "missing"}, expected a ${l.kind}`);
		const [u, g] = want(l.owner);
		if (s.uid !== u || s.gid !== g) return install(`${l.path} is owned ${s.uid}:${s.gid}, expected ${u}:${g}`);
		if (s.mode !== l.mode) return install(`${l.path} has mode ${s.mode.toString(8)}, expected ${l.mode.toString(8)}`);
	}
	for (const name of INSTALLED_FILES) {
		if (!rebuilt(name) && f.fileHashes[name] !== src.files[name]) return install(`installed ${name} does not match its sha-256 in SOURCE`);
	}
	for (const name of REBUILT_FILES) {
		const at = f.layout.findIndex((l) => l.file === name);
		const type = at >= 0 ? f.stats[at]!.type : null;
		if (type === null) return { ok: false, kind: "file-drift", reason: `installed ${name} is missing` };
		if (type !== "file") return { ok: false, kind: "file-drift", reason: `installed ${name} is a ${type}, not a regular file` };
		if (f.fileHashes[name] !== src.files[name]) return { ok: false, kind: "file-drift", reason: `installed ${name} does not match its sha-256 in SOURCE` };
	}
	for (const [rel, sha] of Object.entries(src.inputs)) {
		if (f.inputHashes[rel] !== sha) return { ok: false, kind: "input-drift", reason: `${rel} in this checkout differs from the installed test-exec bundle` };
	}
	return { ok: true, summary: `install: ${AS2TEST_USER} ${src.uid}:${src.gid}, bun ${src.bunVersion}, source ${src.source} at ${src.sourceSha.slice(0, 12)}` };
}

/** The preflight's verdict (§ 3.1): the install checks, then the probe; the first failure is the reason, never a fallback. */
export function preflightDecision(install: Verdict, probe: Verdict): Verdict {
	if (!install.ok) return { ok: false, reason: `preflight: ${install.reason}` };
	if (!probe.ok) return { ok: false, reason: `preflight: ${probe.reason}` };
	return { ok: true, summary: `${install.summary}; ${probe.summary}` };
}

// ---- the refresh helper (PLAN wl-mv718fxhwwcn40 § 1.1) ---------------------------------------------

/** The one origin an installed helper fetches main from: fixed in its text, never read from a remote. */
export const AS2TEST_ORIGIN = "https://github.com/thewolff/agent-system-2.0.git";
/** The preflight's reason codes (§ 1.3): the helper failed, or a drift outlived its success. */
export const REFRESH_FAILED = "bundle-refresh-failed";
export const CHECKOUT_DRIFT = "checkout-drift";
/** The helper's exit codes (§ 1.1). */
export const REFRESH_EXIT = { ok: 0, usage: 64, lock: 69, fetch: 70, build: 71, install: 72, notRoot: 77 } as const;
/** How long a helper waits for another helper's lock, in seconds (§ 1.1 Lock). */
export const REFRESH_LOCK_WAIT_S = 600;
/** Where the helper makes its build directory (§ 1.1 Build). */
export const REFRESH_BUILD_PARENT = "/private/tmp";

/** The SOURCE facts setup owns, fixed in the helper's text; the helper writes them into every SOURCE. */
export interface SourceFacts {
	bunVersion: string;
	user: string;
	uid: number;
	gid: number;
	jo: string;
	joUid: number;
	/** What setup created and undo may remove: `user`, `group`, and absolute paths. */
	created: string[];
}

export interface RefreshHelperOptions {
	/** Where main is fetched from: AS2TEST_ORIGIN for an installed helper; a local bare repo in a test render. */
	origin: string;
	/** The libexec dir: the helper is `<libexec>/refresh`, its lock, mirror and staged copies are in `<libexec>/refresh.d`. */
	libexec: string;
	/** The as2test root the rebuilt `exec` is rendered with. */
	root: string;
	/** The bun the build runs on: `<libexec>/bun` for an installed helper. */
	bun: string;
	facts: SourceFacts;
	/** The user the build runs as (`nobody`), through `sudo -n -u`; null runs it as the caller (a test render). */
	buildUser: string | null;
	/** true for an installed helper: it exits 77 unless uid 0, and installs root:wheel. false installs with the caller's ids. */
	asRoot: boolean;
	/** How long to wait for another helper's lock, in seconds (default REFRESH_LOCK_WAIT_S). */
	lockWaitS?: number;
	/** Test-only: allow git's file protocol, for a local bare origin. */
	allowFileProtocol?: boolean;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]+)?\/[A-Za-z0-9._~/-]+$/;

/** The SOURCE lines the helper writes around `source-sha`; throws WrapperRenderError on an option the helper must not carry. */
function refreshSourceLines(o: RefreshHelperOptions): { head: string[]; facts: string[]; lockWaitS: number } {
	for (const [k, v] of [["libexec", o.libexec], ["root", o.root], ["bun", o.bun]] as const) {
		if (typeof v !== "string" || !plainAbs(v)) throw new WrapperRenderError(`${k} must be a normalized absolute path: ${String(v)}`);
	}
	const fileOrigin = typeof o.origin === "string" && (plainAbs(o.origin) || (o.origin.startsWith("file://") && plainAbs(o.origin.slice("file://".length))));
	if (typeof o.origin !== "string" || !(HTTPS_ORIGIN.test(o.origin) || (o.allowFileProtocol === true && fileOrigin))) {
		throw new WrapperRenderError(`origin must be an https URL${o.allowFileProtocol ? ", a file:// URL or an absolute path" : ""}: ${String(o.origin)}`);
	}
	if (o.buildUser !== null && (typeof o.buildUser !== "string" || !NAME.test(o.buildUser))) throw new WrapperRenderError(`buildUser must be a user name or null: ${String(o.buildUser)}`);
	if (typeof o.asRoot !== "boolean") throw new WrapperRenderError("asRoot must be true or false");
	if (o.asRoot) {
		// An installed helper runs as root: it fetches only the fixed origin, over https, and never runs main's code as root.
		if (o.origin !== AS2TEST_ORIGIN) throw new WrapperRenderError(`an asRoot render fetches only ${AS2TEST_ORIGIN}`);
		if (o.allowFileProtocol) throw new WrapperRenderError("allowFileProtocol is test-only: an asRoot render carries none");
		if (o.buildUser === null) throw new WrapperRenderError("an asRoot render needs a buildUser: root never runs main's code");
	}
	const lockWaitS = o.lockWaitS ?? REFRESH_LOCK_WAIT_S;
	if (!Number.isSafeInteger(lockWaitS) || lockWaitS < 0) throw new WrapperRenderError("lockWaitS must be a whole number of seconds");
	const f = o.facts;
	if (!f || typeof f !== "object") throw new WrapperRenderError("facts are required");
	for (const [k, v] of [["user", f.user], ["jo", f.jo]] as const) if (typeof v !== "string" || !NAME.test(v)) throw new WrapperRenderError(`facts.${k} must be a user name: ${String(v)}`);
	for (const [k, v] of [["uid", f.uid], ["gid", f.gid], ["joUid", f.joUid]] as const) {
		if (!Number.isSafeInteger(v) || v < 0) throw new WrapperRenderError(`facts.${k} must be a whole number: ${String(v)}`);
	}
	if (typeof f.bunVersion !== "string" || !/^[0-9A-Za-z.+-]+$/.test(f.bunVersion)) throw new WrapperRenderError(`facts.bunVersion must be a version: ${String(f.bunVersion)}`);
	if (!Array.isArray(f.created)) throw new WrapperRenderError("facts.created must be a list");
	for (const c of f.created) if (c !== "user" && c !== "group" && !(typeof c === "string" && plainAbs(c))) throw new WrapperRenderError(`facts.created needs user, group or an absolute path: ${String(c)}`);
	const head = [
		`# as2test SOURCE: written by ${join(o.libexec, "refresh")} (surface/src/as2test.ts renderRefreshHelper), read by the runner's preflight (parseSource) and by install/as2test-setup.sh --undo`,
		"version 1",
		`source ${o.origin}`,
	];
	const facts = [
		`bun-version ${f.bunVersion}`, `user ${f.user}`, `uid ${f.uid}`, `gid ${f.gid}`, `jo ${f.jo}`, `jo-uid ${f.joUid}`, ...f.created.map((c) => `created ${c}`),
	];
	// The helper's SOURCE must stay one parseSource (this one, and main's before this change) accepts.
	const sample = [...head, `source-sha ${"0".repeat(40)}`, ...facts, ...INSTALLED_FILES.map((n) => `file ${n} ${"0".repeat(64)}`), `input x ${"0".repeat(64)}`, ""].join("\n");
	const parsed = parseSource(sample);
	if (!parsed.ok) throw new WrapperRenderError(`the helper's SOURCE would not parse: ${parsed.error}`);
	return { head, facts, lockWaitS };
}

/**
 * The refresh helper's sh text (PLAN wl-mv718fxhwwcn40 § 1.1): `<libexec>/refresh`, the one command
 * the second sudoers line allows, with no arguments. It re-execs itself under `env -i`, takes the
 * lock on `refresh.d/lock` (fd 9, lockf), fetches main from the fixed origin into the root-owned
 * mirror `refresh.d/mirror.git`, and answers `current <sha12>` when the installed SOURCE is byte for
 * byte the SOURCE it would write. Otherwise it unpacks main into a fresh build dir, runs bun build,
 * `bundle-inputs` and `render-exec` there as the build user, reads the outputs through the build user
 * into the root-only `refresh.d/stage`, checks the staged copies, and installs `exec`,
 * `test-exec.js` and `SOURCE` (last) through dotted `.new` names and a rename.
 */
export function renderRefreshHelper(o: RefreshHelperOptions): string {
	const { head, facts, lockWaitS } = refreshSourceLines(o);
	const printLines = (xs: string[]) => `\tprintf '%s\\n' ${xs.map(shq).join(" ")}`;
	const gitConfig = ["-c core.hooksPath=/dev/null", "-c protocol.allow=never", "-c protocol.https.allow=always", ...(o.allowFileProtocol ? ["-c protocol.file.allow=always"] : [])].join(" ");
	const asUser = o.buildUser === null ? "" : `/usr/bin/sudo -n -u ${shq(o.buildUser)} `;
	return [
		"#!/bin/sh",
		"# agent-system 2.0 test runner: the test-exec bundle refresh helper (workload wl-mv718fxhwwcn40, PLAN",
		"# § 1.1), rendered by surface/src/as2test.ts renderRefreshHelper. It takes no arguments: every value is",
		"# fixed here, and it never reads its caller's env, cwd or checkout. It fetches main from ORIGIN into a",
		"# root-owned mirror, builds test-exec as the build user, checks what the build user hands back, and",
		"# installs exec, test-exec.js and SOURCE (last). It never writes itself or the sudoers file.",
		"# Exit: 0 refreshed or current · 64 usage · 69 lock · 70 fetch · 71 build or check · 72 install · 77 not root.",
		"# Stdout: one line, `refreshed <old12>..<new12>` or `current <sha12>`.",
		`# build user: ${o.buildUser ?? "the caller (a test render)"}; ${o.asRoot ? "runs as root only" : "a test render: installs with the caller's ids"}`,
		`[ "\${AS2TEST_REFRESH_ENV-}" = clean ] || exec /usr/bin/env -i AS2TEST_REFRESH_ENV=clean PATH=${WRAPPER_PATH} HOME=/var/empty /bin/sh ${shq(join(o.libexec, "refresh"))} "$@"`,
		"umask 022",
		"cd / || exit 71",
		`die() { printf 'as2test-refresh: %s\\n' "$2" >&2; exit "$1"; }`,
		`LIBEXEC=${shq(o.libexec)}`,
		'SELF="$LIBEXEC/refresh"',
		`[ "$#" -eq 0 ] || die ${REFRESH_EXIT.usage} "usage: $SELF (it takes no arguments)"`,
		...(o.asRoot
			? [`[ "$(/usr/bin/id -u)" = 0 ] || die ${REFRESH_EXIT.notRoot} "must run as root: sudo -n $SELF"`, "OWN_U=root", "OWN_G=wheel"]
			: ["OWN_U=$(/usr/bin/id -u) || exit 72", "OWN_G=$(/usr/bin/id -g) || exit 72"]),
		`ROOT=${shq(o.root)}`,
		`BUN=${shq(o.bun)}`,
		`ORIGIN=${shq(o.origin)}`,
		'STATE="$LIBEXEC/refresh.d"',
		'MIRROR="$STATE/mirror.git"',
		'STAGE="$STATE/stage"',
		"BUILD=",
		"GIT_CONFIG_NOSYSTEM=1",
		"GIT_CONFIG_GLOBAL=/dev/null",
		"GIT_TERMINAL_PROMPT=0",
		"export GIT_CONFIG_NOSYSTEM GIT_CONFIG_GLOBAL GIT_TERMINAL_PROMPT",
		"",
		`g() { /usr/bin/git --git-dir="$MIRROR" ${gitConfig} "$@"; }`,
		`as_build() { ${asUser}/usr/bin/env -i PATH=${WRAPPER_PATH} HOME="$BUILD" TMPDIR="$BUILD" "$@" 9>&-; }`,
		"# build_step <stdout file, or - for stderr> <command...>: run as the build user, in $BUILD/src.",
		`build_step() { as_build /bin/sh -c 'cd -- "$1" || exit 1; o=$2; shift 2; if [ "$o" = - ]; then exec "$@" 1>&2; fi; exec "$@" > "$o"' as2test-build "$BUILD/src" "$@"; }`,
		"# take <name>: $BUILD/out/<name>, read as the build user, into the root-only stage. Root never opens a path in $BUILD.",
		`take() { ${asUser}/bin/cat -- "$BUILD/out/$1" > "$STAGE/$1" || die ${REFRESH_EXIT.build} "cannot read the built $1 as the build user"; }`,
		`h256() { if [ -f "$1" ] && [ ! -L "$1" ]; then /usr/bin/shasum -a 256 < "$1" | /usr/bin/awk '{ print $1 }'; else echo missing; fi; }`,
		`isblob() { [ "$(g cat-file -t "$SHA:$1" 2>/dev/null)" = blob ]; }`,
		`blob256() { if isblob "$1"; then g cat-file blob "$SHA:$1" | /usr/bin/shasum -a 256 | /usr/bin/awk '{ print $1 }'; else echo missing; fi; }`,
		`okrel() { case "$1" in "" | /* | . | .. | ./* | ../* | */. | */.. | */./* | */../* | *//* | */) return 1 ;; *[!A-Za-z0-9._/@+-]*) return 1 ;; esac; }`,
		"# write_source <exec> <test-exec.js> <inputs list>: the SOURCE for $SHA, on stdout.",
		"write_source() {",
		printLines(head),
		`\tprintf 'source-sha %s\\n' "$SHA"`,
		printLines(facts),
		`\tprintf 'file exec %s\\n' "$(h256 "$1")"`,
		`\tprintf 'file bun %s\\n' "$(h256 "$LIBEXEC/bun")"`,
		`\tprintf 'file test-exec.js %s\\n' "$(h256 "$2")"`,
		`\tprintf 'file refresh %s\\n' "$(h256 "$SELF")"`,
		`\twhile IFS= read -r rel || [ -n "$rel" ]; do printf 'input %s %s\\n' "$rel" "$(blob256 "$rel")"; done < "$3"`,
		"}",
		`cleanup() { [ -n "$BUILD" ] || return 0; as_build /bin/rm -rf "$BUILD/src" "$BUILD/out" 2>/dev/null; /bin/rm -rf "$BUILD"; }`,
		"",
		"# The lock: held by this shell's fd 9 until it exits, across the fetch, the build and every rename.",
		`/bin/mkdir -p -m 0700 "$STATE" || die ${REFRESH_EXIT.lock} "cannot make $STATE"`,
		'exec 9>>"$STATE/lock"',
		`/usr/bin/lockf -s -t ${lockWaitS} 9 || die ${REFRESH_EXIT.lock} "another refresh holds $STATE/lock (waited ${lockWaitS} s)"`,
		"",
		"# The fetch: main only, from ORIGIN only, into the root-owned mirror.",
		`[ -d "$MIRROR" ] || /usr/bin/git ${gitConfig} init -q --bare --template= "$MIRROR" >&2 || die ${REFRESH_EXIT.fetch} "cannot make the mirror $MIRROR"`,
		`g fetch -q --no-tags "$ORIGIN" '+refs/heads/main:refs/heads/main' >&2 || die ${REFRESH_EXIT.fetch} "fetching main from $ORIGIN failed"`,
		`SHA=$(g rev-parse -q --verify 'refs/heads/main^{commit}') || die ${REFRESH_EXIT.fetch} "the mirror has no main"`,
		`case "$SHA" in *[!0-9a-f]*) die ${REFRESH_EXIT.fetch} "main is not a sha" ;; esac`,
		`[ "\${#SHA}" -eq 40 ] || die ${REFRESH_EXIT.fetch} "main is not a full sha"`,
		`OLD=$(/usr/bin/awk '$1 == "source-sha" { print $2; exit }' "$LIBEXEC/SOURCE" 2>/dev/null)`,
		'[ -n "$OLD" ] || OLD=none',
		`/bin/rm -rf "$STAGE" && /bin/mkdir -m 0700 "$STAGE" || die ${REFRESH_EXIT.build} "cannot empty $STAGE"`,
		"",
		"# Current: the installed SOURCE is byte for byte what this helper would write for main, so the",
		"# installed files match it too. A legacy or foreign SOURCE never is, and is rebuilt.",
		'if [ -f "$LIBEXEC/SOURCE" ]; then',
		`\t/usr/bin/awk '$1 == "input" { print $2 }' "$LIBEXEC/SOURCE" > "$STAGE/inputs.installed" || die ${REFRESH_EXIT.build} "cannot read $LIBEXEC/SOURCE"`,
		`\twrite_source "$LIBEXEC/exec" "$LIBEXEC/test-exec.js" "$STAGE/inputs.installed" > "$STAGE/SOURCE.current" || die ${REFRESH_EXIT.build} "cannot write $STAGE/SOURCE.current"`,
		`\tif /usr/bin/cmp -s "$STAGE/SOURCE.current" "$LIBEXEC/SOURCE"; then printf 'current %.12s\\n' "$SHA"; exit 0; fi`,
		"fi",
		"",
		`# The build, as ${o.buildUser ?? "the caller"}: main's code never runs as root.`,
		`BUILD=$(/usr/bin/mktemp -d ${REFRESH_BUILD_PARENT}/as2test-refresh.XXXXXX) || die ${REFRESH_EXIT.build} "cannot make a build directory"`,
		"trap cleanup EXIT",
		`trap 'exit ${REFRESH_EXIT.build}' HUP INT TERM`,
		`/bin/mkdir "$BUILD/src" "$BUILD/out" || die ${REFRESH_EXIT.build} "cannot make $BUILD/src and $BUILD/out"`,
		...(o.buildUser === null ? [] : [`/usr/sbin/chown -R ${shq(o.buildUser)} "$BUILD" || die ${REFRESH_EXIT.build} "cannot hand $BUILD to ${o.buildUser}"`]),
		`g archive --format=tar -o "$STAGE/src.tar" "$SHA" || die ${REFRESH_EXIT.build} "git archive of $SHA failed"`,
		`as_build /usr/bin/tar -x -f - -C "$BUILD/src" < "$STAGE/src.tar" || die ${REFRESH_EXIT.build} "unpacking $SHA failed"`,
		'/bin/rm -f "$STAGE/src.tar"',
		`build_step - "$BUN" build --target=bun --outfile="$BUILD/out/test-exec.js" --metafile="$BUILD/out/meta.json" surface/scripts/test-exec.ts || die ${REFRESH_EXIT.build} "bun build of surface/scripts/test-exec.ts at $SHA failed"`,
		`build_step "$BUILD/out/inputs" "$BUN" surface/src/as2test.ts bundle-inputs "$BUILD/out/meta.json" "$BUILD/src" || die ${REFRESH_EXIT.build} "as2test.ts bundle-inputs at $SHA failed"`,
		`build_step "$BUILD/out/exec" "$BUN" surface/src/as2test.ts render-exec --root "$ROOT" --bun "$LIBEXEC/bun" --script "$LIBEXEC/test-exec.js" --sweep-scope uid || die ${REFRESH_EXIT.build} "as2test.ts render-exec at $SHA failed"`,
		"take exec",
		"take test-exec.js",
		"take inputs",
		"",
		"# The checks, on the staged copies only.",
		`[ -s "$STAGE/exec" ] || die ${REFRESH_EXIT.build} "the built exec is empty"`,
		`[ -s "$STAGE/test-exec.js" ] || die ${REFRESH_EXIT.build} "the built test-exec.js is empty"`,
		`[ -s "$STAGE/inputs" ] || die ${REFRESH_EXIT.build} "bundle-inputs listed no input"`,
		'while IFS= read -r rel || [ -n "$rel" ]; do',
		`\tokrel "$rel" || die ${REFRESH_EXIT.build} "bundle-inputs listed a path that is not a plain relative path"`,
		`\tisblob "$rel" || die ${REFRESH_EXIT.build} "bundle-inputs listed $rel, which is not a file at $SHA"`,
		'done < "$STAGE/inputs"',
		`write_source "$STAGE/exec" "$STAGE/test-exec.js" "$STAGE/inputs" > "$STAGE/SOURCE" || die ${REFRESH_EXIT.build} "cannot write $STAGE/SOURCE"`,
		`if /usr/bin/grep -q ' missing$' "$STAGE/SOURCE"; then die ${REFRESH_EXIT.build} "the new SOURCE lacks a hash"; fi`,
		"",
		"# The install: each staged copy to a dotted .new name, then one rename each, SOURCE last.",
		"for f in exec test-exec.js SOURCE; do",
		`\t/usr/bin/install -o "$OWN_U" -g "$OWN_G" -m 0755 "$STAGE/$f" "$LIBEXEC/.$f.new" || { /bin/rm -f "$LIBEXEC/.exec.new" "$LIBEXEC/.test-exec.js.new" "$LIBEXEC/.SOURCE.new"; die ${REFRESH_EXIT.install} "installing $f into $LIBEXEC failed"; }`,
		"done",
		"for f in exec test-exec.js SOURCE; do",
		`\t/bin/mv -f "$LIBEXEC/.$f.new" "$LIBEXEC/$f" || die ${REFRESH_EXIT.install} "moving $f into place in $LIBEXEC failed"`,
		"done",
		`printf 'refreshed %.12s..%.12s\\n' "$OLD" "$SHA"`,
		"",
	].join("\n");
}

/** `render-refresh`'s flags: each valued flag once (`--created` repeats), plus `--as-root` and `--allow-file-protocol`. */
function renderRefreshFromArgv(argv: string[]): string {
	const valued = ["--origin", "--libexec", "--root", "--bun", "--user", "--uid", "--gid", "--jo", "--jo-uid", "--bun-version", "--created", "--build-user", "--lock-wait-s"];
	const switches = ["--as-root", "--allow-file-protocol"];
	const one = new Map<string, string>();
	const created: string[] = [];
	const on = new Set<string>();
	for (let i = 0; i < argv.length; i++) {
		const k = argv[i]!;
		if (switches.includes(k)) {
			on.add(k);
			continue;
		}
		if (!valued.includes(k) || i + 1 >= argv.length) throw new WrapperRenderError(`render-refresh: unknown flag or missing value: ${k}`);
		const v = argv[++i]!;
		if (k === "--created") created.push(v);
		else if (one.has(k)) throw new WrapperRenderError(`render-refresh: ${k} given twice`);
		else one.set(k, v);
	}
	const need = (k: string): string => {
		const v = one.get(k);
		if (v === undefined) throw new WrapperRenderError(`render-refresh needs ${k}`);
		return v;
	};
	const int = (k: string): number => {
		const v = need(k);
		if (!/^[0-9]+$/.test(v)) throw new WrapperRenderError(`render-refresh: ${k} must be a whole number`);
		return Number(v);
	};
	return renderRefreshHelper({
		origin: one.get("--origin") ?? AS2TEST_ORIGIN,
		libexec: need("--libexec"),
		root: need("--root"),
		bun: need("--bun"),
		facts: { bunVersion: need("--bun-version"), user: need("--user"), uid: int("--uid"), gid: int("--gid"), jo: need("--jo"), joUid: int("--jo-uid"), created },
		buildUser: one.get("--build-user") ?? null,
		asRoot: on.has("--as-root"),
		lockWaitS: one.has("--lock-wait-s") ? int("--lock-wait-s") : undefined,
		allowFileProtocol: on.has("--allow-file-protocol"),
	});
}

// ---- the setup script's helpers ------------------------------------------------------------------

/** The bundle's inputs from `bun build --metafile` JSON, as paths relative to `checkout`, sorted; bun's own builtins left out. */
export function bundleInputs(metafileJson: string, checkout: string, cwd: string): string[] {
	const meta: unknown = JSON.parse(metafileJson);
	if (!meta || typeof meta !== "object" || !("inputs" in meta) || !meta.inputs || typeof meta.inputs !== "object") throw new Error("metafile has no inputs");
	const out = new Set<string>();
	for (const key of Object.keys(meta.inputs)) {
		if (key.startsWith("bun:") || key.startsWith("node:")) continue;
		const rel = relative(checkout, resolve(cwd, key));
		if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(`bundle input ${key} lies outside ${checkout}`);
		out.add(rel);
	}
	if (out.size === 0) throw new Error("metafile lists no input");
	return [...out].sort();
}

function cli(argv: string[]): number {
	const [cmd, ...rest] = argv;
	const flag = (k: string): string | undefined => {
		const i = rest.indexOf(k);
		return i >= 0 ? rest[i + 1] : undefined;
	};
	try {
		if (cmd === "render-exec") {
			// execConfigOf refuses any scope but uid or groups, and a missing or relative path.
			process.stdout.write(renderExecWrapper({ root: flag("--root") ?? "", bun: flag("--bun") ?? "", script: flag("--script") ?? "", sweepScope: flag("--sweep-scope") as SweepScope }));
			return 0;
		}
		if (cmd === "render-refresh") {
			process.stdout.write(renderRefreshFromArgv(rest));
			return 0;
		}
		if (cmd === "bundle-inputs" && rest.length === 2) {
			const [metafile, checkout] = rest as [string, string];
			process.stdout.write(`${bundleInputs(readFileSync(metafile, "utf8"), resolve(checkout), process.cwd()).join("\n")}\n`);
			return 0;
		}
	} catch (e) {
		process.stderr.write(`as2test: ${(e as Error).message}\n`);
		return 1;
	}
	process.stderr.write(
		[
			"usage: bun surface/src/as2test.ts render-exec --root R --bun B --script S --sweep-scope uid|groups",
			"       bun surface/src/as2test.ts render-refresh --libexec L --root R --bun B --user U --uid N --gid N --jo J --jo-uid N --bun-version V",
			"                                  [--created C]... [--origin URL] [--build-user U] [--as-root] [--lock-wait-s N] [--allow-file-protocol]",
			"       bun surface/src/as2test.ts bundle-inputs <metafile.json> <checkout>",
			"",
		].join("\n"),
	);
	return 2;
}

if (import.meta.main) process.exit(cli(process.argv.slice(2)));
