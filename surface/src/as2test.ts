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
// - `parseSource`, the SOURCE file install/as2test-setup.sh writes;
// - a small CLI the setup script calls: `render-exec` and `bundle-inputs`.
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { defaultLedgerPath } from "../../ledger/src/locality";
import { AS2TEST_EXEC, AS2TEST_ROOT, AS2TEST_USER, WRAPPER_EXIT, type WrapperCall, runsDbOf, wrapperArgv } from "./test-run";

// ---- the wrapper ---------------------------------------------------------------------------------

/** The installed wrapper's directory; setup puts `exec`, `bun`, `test-exec.js` and `SOURCE` here. */
export const AS2TEST_LIBEXEC = dirname(AS2TEST_EXEC);
/** The sudoers drop-in setup writes (§ 3.1 step 4). */
export const AS2TEST_SUDOERS = "/etc/sudoers.d/as2test";
/** The installed files under AS2TEST_LIBEXEC whose sha-256 SOURCE records. */
export const INSTALLED_FILES = ["exec", "bun", "test-exec.js"] as const;
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
}

/** Every path setup leaves, with its owner and mode (§ 3.1 Setup 2–4). `current` is the runner's, not setup's. */
export function installLayout(p: { libexec?: string; root?: string; sudoers?: string } = {}): LayoutItem[] {
	const libexec = p.libexec ?? AS2TEST_LIBEXEC;
	const root = p.root ?? AS2TEST_ROOT;
	return [
		{ path: libexec, kind: "dir", owner: "root", mode: 0o755 },
		...[...INSTALLED_FILES, "SOURCE"].map((f) => ({ path: join(libexec, f), kind: "file" as const, owner: "root" as const, mode: 0o755 })),
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

/** The install half of the preflight (§ 3.1 Preflight): account, SOURCE, owners and modes, installed hashes, and the checkout's bundle inputs. */
export function installDecision(f: InstallFacts, ids: OwnerIds): Verdict {
	if (!f.account) return { ok: false, reason: `the ${AS2TEST_USER} account is missing or its user and group ids differ; ${RERUN}` };
	if (!f.source.ok) return { ok: false, reason: `${f.source.error}; ${RERUN}` };
	const src = f.source.source;
	if (src.user !== AS2TEST_USER || src.uid !== f.account.uid || src.gid !== f.account.gid) {
		return { ok: false, reason: `SOURCE records ${src.user} ${src.uid}:${src.gid}, the account is ${f.account.uid}:${f.account.gid}; ${RERUN}` };
	}
	if (src.joUid !== ids.jo) return { ok: false, reason: `SOURCE was set up for uid ${src.joUid}, not ${ids.jo}; ${RERUN}` };
	const want = (r: OwnerRole): [number, number] => (r === "root" ? [ids.root, ids.wheel] : r === "jo" ? [ids.jo, src.gid] : [src.uid, src.gid]);
	for (const [i, l] of f.layout.entries()) {
		const s = f.stats[i]!;
		if (s.type !== l.kind) return { ok: false, reason: `${l.path} is ${s.type ?? "missing"}, expected a ${l.kind}; ${RERUN}` };
		const [u, g] = want(l.owner);
		if (s.uid !== u || s.gid !== g) return { ok: false, reason: `${l.path} is owned ${s.uid}:${s.gid}, expected ${u}:${g}; ${RERUN}` };
		if (s.mode !== l.mode) return { ok: false, reason: `${l.path} has mode ${s.mode.toString(8)}, expected ${l.mode.toString(8)}; ${RERUN}` };
	}
	for (const name of INSTALLED_FILES) {
		if (f.fileHashes[name] !== src.files[name]) return { ok: false, reason: `installed ${name} does not match its sha-256 in SOURCE; ${RERUN}` };
	}
	for (const [rel, sha] of Object.entries(src.inputs)) {
		if (f.inputHashes[rel] !== sha) return { ok: false, reason: `${rel} in this checkout differs from the installed test-exec bundle; ${RERUN}` };
	}
	return { ok: true, summary: `install: ${AS2TEST_USER} ${src.uid}:${src.gid}, bun ${src.bunVersion}, source ${src.source} at ${src.sourceSha.slice(0, 12)}` };
}

/** The preflight's verdict (§ 3.1): the install checks, then the probe; the first failure is the reason, never a fallback. */
export function preflightDecision(install: Verdict, probe: Verdict): Verdict {
	if (!install.ok) return { ok: false, reason: `preflight: ${install.reason}` };
	if (!probe.ok) return { ok: false, reason: `preflight: ${probe.reason}` };
	return { ok: true, summary: `${install.summary}; ${probe.summary}` };
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
		if (cmd === "bundle-inputs" && rest.length === 2) {
			const [metafile, checkout] = rest as [string, string];
			process.stdout.write(`${bundleInputs(readFileSync(metafile, "utf8"), resolve(checkout), process.cwd()).join("\n")}\n`);
			return 0;
		}
	} catch (e) {
		process.stderr.write(`as2test: ${(e as Error).message}\n`);
		return 1;
	}
	process.stderr.write("usage: bun surface/src/as2test.ts render-exec --root R --bun B --script S --sweep-scope uid|groups\n       bun surface/src/as2test.ts bundle-inputs <metafile.json> <checkout>\n");
	return 2;
}

if (import.meta.main) process.exit(cli(process.argv.slice(2)));
