// M4b: the OS fence (MIGRATION.md M4b; research/gate-prior-art.md § 3). Every bash tool call the
// P-11 rows allowed is revised to run under a macOS Seatbelt profile that denies file writes to the
// ledger directory (and the directory a symlinked ledger file resolves into) and to the `.git/hooks`
// of every repository the command runs in (a bare repository's `hooks`), plus the `.git` entry
// itself (so it cannot be renamed aside and swapped). The directory the command runs in is the one
// OMP's bash tool resolves from `input.cwd` (hostCommandCwd). Row 10's shell half and row 6's
// runs-a-program half become defense in depth: the parse-time rules still judge first, and this is
// the layer a parser gap cannot talk past.
//
// `.git/config` and a worktree's `config.worktree` are NOT fenced (M4b fix 1, Jo 2026-09-29): with
// them fenced, every upstream-recording git form (`git push -u`, `git switch -c x origin/main`,
// `git branch -u`, …) printed a config error and exited 0 with nothing recorded (138 of 33,153 real
// commands, Plumb's scan). Config-write protection is the parser's alone: row 6's positive git model
// refuses `git config` writes and `-c` keys outside its allowlist, and row 6's write-destination
// check refuses shell writes into `.git` (rows/r06-reserved.ts reservedInExec).
//
// Where it runs: the last `tool_call` handler the gates register (gates/index.ts). OMP hands every
// handler the same original event, stops at the first block and keeps the last non-block result
// (OMP 18.3.0 extensibility/extensions/runner.ts emitToolCall), so the rows have all judged the
// original command before this sees it, and they never see the wrapper (row 6 refuses `bash -c`).
// The original is kept per tool call id so rows 3 and 8 read it from `tool_result`, not the wrapper
// (session.ts originalInput).
//
// A handler in an extension loaded after the gates that returns any object for a bash call replaces
// the wrapper whole (runner.ts:1549-1553 assigns, never merges). OMP's `tool_execution_start` carries
// the args that execute (pi-agent-core agent-loop.ts:3126-3132, `args: record.args`, the revision
// baked in at :2776-2777) but cannot be cancelled: the loop pushes it and runs the tool without
// waiting on extensions (agent-loop.ts:3126-3208; agent-session.ts:4403-4411 ignores the handlers'
// results). So the check here is after the fact: a bash call whose executing command is not this
// fence's own wrapper for that tool call id is written down (a ledger `assumption` row), and every
// later bash call in the session is refused until restart. The start event also fires for a call a
// later handler blocked (agent-loop.ts:3126 precedes the block check at :3163), with the unrevised
// args, so a later handler's block reads as a bypass too: loud over silent.
//
// Fails closed: a path that cannot be canonicalized, `sandbox-exec` missing, OMP's
// `bash.autoBackground.enabled` off, settings that cannot be read, or a host OMP whose major.minor is
// not the one the settings reads were verified on (src/host.ts VERIFIED_HOST) refuse the call; nothing
// runs unwrapped unless the profile says `gates.fence.enabled: false`, and that is written down once.
// A command that runs `sandbox-exec` anywhere the shell would run it (exec.ts nestedSandboxExec, by
// the parsed word) is refused. A typed copy of this fence's own wrapper does not get that far in
// production: P-11 row 18 (rows/r18-typed-wrapper.ts), registered before the fence, refuses it and
// names the bare command to resend; the fence no longer strips a copy (MIGRATION.md item 99).
// A command holding an OMP internal URL (`skill://`, `artifact://`, `local:/`, `agent://`, …) is
// refused too: OMP expands those only outside shell quotes (tools/bash-skill-urls.ts:279-281,
// :378-383) and the wrapper single-quotes the whole command, so they would reach bash literally.
//
// Known-open doors (not under this fence; row 10's other halves stay the line):
// - the JS `eval` tool's subprocesses (Bun.$, spawn…) run in OMP's own process tree, unsandboxed;
// - the file tools (write, edit, ast_edit) write from OMP's process, unsandboxed;
// - setuid binaries (`/bin/ps`) exit 126 under any Seatbelt profile; documented, not worked around;
// - OMP's in-process shell builtins are replaced by the macOS binaries (the builtin loss Jo accepted
//   2026-09-29), and wrapped calls run macOS `/bin/bash` 3.2.57, not OMP's bash-5.2-compatible shell:
//   no `declare -A`, `${x,,}` or `mapfile`. 0 of 33,153 real commands used any of the three (Plumb's
//   scan, 2026-09-29); there is no bash 5 on this Mac (`/opt/homebrew/bin/bash` absent);
// - renaming the repository directory itself (not `.git`) moves the fenced paths with it.
// Seatbelt matches canonical paths only, so a symlinked spelling in the profile fails open silently
// (measured, gate-prior-art.md § 3): every path here goes through canonicalPath first.
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { canonicalPath, defaultLedgerPath } from "../../ledger/src/locality";
import { expandShell, gitCall, nestedSandboxExec } from "./exec";
import { HostError, type HostModules, hostSettings, readSetting, unknownSetting } from "./host";
import { type Ctx, type GatesAPI, gateSession } from "./session";

/** The profile key that turns the fence off (M4b step 5, the reversal). */
export const FENCE_FLAG = "gates.fence.enabled";

/** A reason the fence cannot be built for a call. The call is refused, never run unfenced. */
export class FenceError extends Error {}

export interface FenceSettings {
	/** `gates.fence.enabled`; absent = true. */
	enabled: boolean;
	/** OMP's effective `bash.autoBackground.enabled`. Off, OMP keeps shell state the wrapper loses (step 1, b′). */
	autoBackground: boolean;
}

export interface FenceTarget {
	/** `subpath`: the path and everything under it; `literal`: the path itself only. */
	kind: "subpath" | "literal";
	path: string;
}

/** `sandbox-exec` on `env.PATH`, as an absolute path, or null (M4b design 7: probed at load). */
export function sandboxExecPath(env: Record<string, string | undefined>): string | null {
	return Bun.which("sandbox-exec", { PATH: env.PATH ?? "" });
}

/** A path as Seatbelt must see it; throws FenceError instead of returning a spelling that fails open. */
function canonical(path: string, what: string): string {
	try {
		return canonicalPath(path);
	} catch (err) {
		throw new FenceError(`the canonical path of ${what} (${path}) cannot be computed: ${err instanceof Error ? err.message : String(err)}`);
	}
}

/** Unicode spaces OMP rewrites to ASCII spaces in a path (path-utils.ts UNICODE_SPACES, normalizeUnicodeSpaces). */
const HOST_UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/;

/**
 * The directory OMP's bash tool runs a call in, from its `cwd` input: the host's own contract,
 * replicated because this checkout carries no OMP to import from (the helper, `resolveToCwd` in
 * @oh-my-pi/pi-coding-agent 18.3.0 src/tools/path-utils.ts:381-394, resolves only inside a running
 * OMP; the parity test in fence.test.ts runs this against it where OMP is installed). bash.ts:953-963:
 * a falsy cwd is the session cwd; a cwd holding `://` or `local:/` is expanded as an internal URL
 * first; then `resolveToCwd`: `~`, `~/x`, `~x` against the home directory (expandTilde, :123-133),
 * an all-slash cwd is the session cwd, an absolute path is itself, anything else resolves against
 * the session cwd; the result must be an existing directory. The spellings OMP rewrites before that
 * (an internal URL, a leading `@` or `:`, a `file:` URL, Unicode spaces; expandPath :135-149) are
 * refused rather than modelled, so the fence never discovers targets in one directory while bash
 * runs in another (M4b review B1: `~/repo` fenced nothing while the absolute spelling fenced .git).
 */
export function hostCommandCwd(inputCwd: unknown, sessionCwd: string, home: string = homedir()): string {
	if (inputCwd === undefined || inputCwd === null || inputCwd === "") return sessionCwd;
	if (typeof inputCwd !== "string") throw new FenceError(`the call's cwd is ${JSON.stringify(inputCwd)}, not a path`);
	const unmodelled = inputCwd.includes("://") || inputCwd.includes("local:")
		? "an internal URL OMP expands before running"
		: /^[@:]/.test(inputCwd)
			? "a leading @ or : that OMP strips"
			: /^file:/i.test(inputCwd)
				? "a file: URL OMP converts"
				: HOST_UNICODE_SPACES.test(inputCwd)
					? "a Unicode space OMP rewrites"
					: null;
	if (unmodelled) throw new FenceError(`the call's cwd ${JSON.stringify(inputCwd)} holds ${unmodelled}, so the fence cannot be sure it fences the directory bash will run in; pass the absolute directory as cwd`);
	const expanded = inputCwd === "~" ? home : inputCwd.startsWith("~/") || inputCwd.startsWith("~\\") ? home + inputCwd.slice(1) : inputCwd.startsWith("~") ? join(home, inputCwd.slice(1)) : inputCwd;
	const dir = /^\/+$/.test(expanded) ? sessionCwd : isAbsolute(expanded) ? expanded : resolve(sessionCwd, expanded);
	let isDir = false;
	try {
		isDir = statSync(dir).isDirectory();
	} catch {
		// missing: refused below
	}
	if (!isDir) throw new FenceError(`the call's cwd ${JSON.stringify(inputCwd)} is not an existing directory (${dir})`);
	return dir;
}

/** A git directory by git's own test (setup.c is_git_directory): `HEAD`, `objects/` and `refs/`. */
function looksLikeGitDir(dir: string): boolean {
	try {
		return statSync(join(dir, "HEAD")).isFile() && statSync(join(dir, "objects")).isDirectory() && statSync(join(dir, "refs")).isDirectory();
	} catch {
		return false;
	}
}

/**
 * The fenced git paths of the repository containing `dir` (git's own discovery, walking up: at each
 * directory the `.git` entry first, then the directory itself as a git directory): for a `.git`
 * entry, the entry and the hooks directory; `.git` may be a directory, or a file holding
 * `gitdir: <path>` (worktrees, submodules). For a bare repository (a directory that is itself a git
 * directory and not named `.git`, whose parent is found as the `.git` entry instead), its hooks
 * directory only, never the whole directory (M4b review B3). A linked worktree's hooks live in the
 * common dir its `commondir` file names. Null when `dir` is in no repository.
 */
export function repoGitTargets(dir: string): FenceTarget[] | null {
	for (let cur = canonical(dir, "the command's directory"); ; cur = dirname(cur)) {
		const dotGit = join(cur, ".git");
		const out: FenceTarget[] = [];
		let gitDir: string;
		let isFile: boolean | null = null;
		try {
			const st = lstatSync(dotGit);
			isFile = st.isFile() || (st.isSymbolicLink() && existsSync(dotGit) && !lstatSync(realpathSync(dotGit)).isDirectory());
		} catch {
			// no .git entry here
		}
		if (isFile !== null) {
			gitDir = dotGit;
			if (isFile) {
				const m = /^gitdir: *(.+?)\s*$/m.exec(readFileSync(dotGit, "utf8"));
				if (!m) throw new FenceError(`${dotGit} is a file without a \`gitdir:\` line`);
				gitDir = resolve(cur, m[1]!);
			}
			gitDir = canonical(gitDir, `the git directory named by ${dotGit}`);
			out.push({ kind: "literal", path: dotGit });
		} else if (basename(cur) !== ".git" && looksLikeGitDir(cur)) {
			gitDir = cur;
		} else {
			if (dirname(cur) === cur) return null;
			continue;
		}
		let common = gitDir;
		const commonFile = join(gitDir, "commondir");
		if (existsSync(commonFile)) common = canonical(resolve(gitDir, readFileSync(commonFile, "utf8").trim()), `the common git directory named by ${commonFile}`);
		out.push({ kind: "subpath", path: canonical(join(common, "hooks"), `${common}/hooks`) });
		return out;
	}
}

/**
 * Everything the fence denies writes to for `command` run from `cwd`: the ledger directory, and the
 * git targets of every repository the command runs in — `cwd`, each directory a `cd` reaches that the
 * gate can see, and each literal `git -C` path (exec.ts gitCall, the resolver the rows use).
 * The ledger directory is the configured parent and, when the ledger file is a symlink elsewhere, the
 * parent of the file it resolves to, the one the ledger module opens (ledger/src/locality.ts
 * assertLocalPath returns canonicalPath(file); M4b review B2). Keeping the configured parent fenced
 * protects the symlink itself from being replaced.
 */
export function fenceTargets(command: string, cwd: string, env: Record<string, string | undefined>, toolEnv?: unknown): FenceTarget[] {
	const ledgerPath = defaultLedgerPath(env);
	const out: FenceTarget[] = [{ kind: "subpath", path: canonical(dirname(ledgerPath), "the ledger directory") }];
	const ledgerFileDir = dirname(canonical(ledgerPath, "the ledger file"));
	if (ledgerFileDir !== out[0]!.path) out.push({ kind: "subpath", path: ledgerFileDir });
	const dirs = new Set([cwd]);
	for (const e of expandShell(command, cwd, env, toolEnv).commands) {
		if (e.dirKnown) dirs.add(e.dir);
		const g = gitCall(e);
		if (g?.dir) dirs.add(g.dir);
	}
	const seen = new Set(out.map((t) => `${t.kind} ${t.path}`));
	for (const d of dirs) {
		for (const t of repoGitTargets(d) ?? []) {
			const key = `${t.kind} ${t.path}`;
			if (!seen.has(key)) {
				seen.add(key);
				out.push(t);
			}
		}
	}
	return out;
}

/** A Seatbelt (SBPL) string literal. A control character is refused rather than guessed at. */
function sbplString(path: string): string {
	if (/[\u0000-\u001f\u007f]/.test(path)) throw new FenceError(`a fenced path holds a control character (${JSON.stringify(path)})`);
	return `"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

/** The Seatbelt profile: allow everything, deny file writes to each target. */
export function fenceProfile(targets: FenceTarget[]): string {
	return `(version 1)(allow default)${targets.map((t) => `(deny file-write* (${t.kind} ${sbplString(t.path)}))`).join("")}`;
}

/** `s` as one POSIX single-quoted shell word. */
export function shellQuote(s: string): string {
	return `'${s.replaceAll("'", `'\\''`)}'`;
}

/** The revised command: the original, unchanged, run by `/bin/bash -c` under the profile. */
export function wrapCommand(sandboxExec: string, profile: string, command: string): string {
	return `${shellQuote(sandboxExec)} -p ${shellQuote(profile)} /bin/bash -c ${shellQuote(command)}`;
}

const refuse = (why: string) => ({
	block: true as const,
	reason: `M4b OS fence: ${why}; refused rather than run this bash call outside the fence. To run bash unfenced, set ${FENCE_FLAG}: false in the profile's config.yml (recorded in the ledger).`,
});

/**
 * The fence's settings from the host (gates/src/host.ts): the effective `bash.autoBackground.enabled`
 * through its registered handle, the way OMP's own bash tool reads it (18.4.4 tools/bash.ts:1129
 * `cfgBashAutoBackgroundEnabled.get(this.session.settings)`), and `gates.fence.enabled` from the raw
 * global layer, where OMP keeps a key it has no registration for. `Settings.current` is the live
 * instance, so a setting changed in the running session counts; `loadReadOnly` is the disk read for a
 * host that has not set it. The modules are the ones the extension entry imports (gates/index.ts
 * hostFenceSettings); this module never imports OMP itself, because a copy loaded here can be a second
 * module instance whose `current` is unset (M4b review astra 2: the live value was ignored and a
 * refused call ran). A host whose major.minor is not the verified one throws before any read.
 */
export async function fenceSettingsFrom(host: HostModules, ctx: Ctx): Promise<FenceSettings> {
	const s = await hostSettings(host, ctx.cwd);
	const flag = unknownSetting(s, FENCE_FLAG.split("."));
	if (flag !== undefined && typeof flag !== "boolean") throw new FenceError(`${FENCE_FLAG} is ${JSON.stringify(flag)}, not true or false`);
	return { enabled: flag ?? true, autoBackground: readSetting(host, s, "bash.autoBackground.enabled") === true };
}

/**
 * A command that already runs `sandbox-exec`. OMP persists the fence's revision as the call's own
 * arguments (agent-session.ts:4518-4527 "schedules, displays, persists, and executes"), so on a later
 * turn the model reads its earlier calls as `'/usr/bin/sandbox-exec' -p '…' /bin/bash -c '…'` and
 * copies the wrapper into a new command; the fence would then wrap it again. A nested sandbox-exec
 * runs only when the inner profile is no looser than the outer (measured 2026-09-30: same profile
 * exits 0, inner `(allow default)` under a deny profile exits 71 `sandbox_apply: Operation not
 * permitted`), so a copied wrapper from another cwd fails with exit 71 and nothing says why (Ilex's
 * session, 2026-09-30T03-04-18-977Z, call toolu_01LVzLbM1nwZqNeZcPU3pydp). Refused before wrapping:
 * loud over silent.
 *
 * A typed copy is P-11 row 18's to refuse (rows/r18-typed-wrapper.ts): it registers before the fence,
 * reads the command as typed and names the bare command to resend, which ends the refusal loop that
 * ended two long lanes on 2026-10-08 (MIGRATION.md item 65) without item 77's strip. What reaches the
 * fence is judged by the parsed word only (nestedSandboxExec): `sandbox-exec` as data (`grep -n
 * 'sandbox-exec' f`, a commit message, a heredoc body) is not refused, and the fence alone, without
 * the rows, still refuses a typed wrapper because its head word runs `sandbox-exec`.
 */
export const ALREADY_WRAPPED_REASON =
	"M4b OS fence: the command already carries sandbox-exec; the fence adds sandbox-exec itself (a nested one exits 71 when its profile is looser than the fence's), so write the plain command without the sandbox-exec wrapper and without /bin/bash -c.";

export const FENCE_OFF_BODY = `${FENCE_FLAG} is false: bash tool calls in this lane run without the M4b OS fence (no Seatbelt deny on the ledger directory, the .git entry or .git/hooks).`;

/**
 * An OMP internal URL at the start of a word, quoted or not: OMP's own schemes (tools/bash-skill-urls.ts
 * INTERNAL_URL_PATTERN_INCLUDING_NORMALIZED_LOCAL, including the one-slash `local:/`). Inside the
 * wrapper every one of them is quoted text OMP leaves alone, so a quoted one (a commit message) is
 * refused as well: loud over silent.
 */
const INTERNAL_URL = /(?<![\w./\\-])(?:(?:skill|agent|artifact|plan|memory|rule|attachment):\/\/|local:\/)/;

export const INTERNAL_URL_REASON =
	"M4b OS fence: internal URLs do not expand under the OS fence (OMP expands skill://, artifact://, local://, agent:// and the rest only outside shell quotes, and the fence runs the whole command as one quoted word); read the artifact with the read tool, or write it to a path first and use that path.";

/** The ledger body when a later handler bypassed the fence on `toolCallId`. */
export const fenceBypassBody = (toolCallId: string) =>
	`M4b OS fence bypassed: bash call ${toolCallId} executed a command other than the fence's wrapper, so a tool_call handler in an extension loaded after the gates replaced or dropped it (or blocked the call, which the start event cannot tell apart); every later bash call in this session is refused until OMP restarts.`;

const bypassReason = (toolCallId: string) =>
	`M4b OS fence: bash call ${toolCallId} ran without the fence's wrapper, because a tool_call handler loaded after the gates replaced it (recorded in the ledger); every bash call is refused until OMP restarts. Make that extension's tool_call handler return undefined for bash, or load it before the gates, then restart.`;

/** Per session: the wrapper the fence returned for each bash call id, and the call that bypassed it. */
interface FenceState {
	expected: Map<string, string>;
	bypassed: string | null;
}
const STATE = Symbol.for("agent-system-2.gates.fence-state");
function fenceState(ctx: Ctx): FenceState {
	const g = globalThis as { [STATE]?: WeakMap<object, FenceState> };
	const store = (g[STATE] ??= new WeakMap());
	let s = store.get(ctx.sessionManager);
	if (!s) {
		s = { expected: new Map(), bypassed: null };
		store.set(ctx.sessionManager, s);
	}
	return s;
}

/**
 * Register the fence. Call it after every other gates `tool_call` handler: it judges nothing, it
 * only revises what they all allowed. `loadSettings` is the only way settings reach the fence: in
 * production gates/index.ts hands in OMP's live `Settings` (hostFenceSettings); tests hand in a
 * fixed value. Without one, every bash call is refused, never run on a guessed default.
 */
export function registerFence(
	pi: GatesAPI,
	env: Record<string, string | undefined>,
	loadSettings?: (ctx: Ctx) => Promise<FenceSettings>,
): void {
	const sandboxExec = sandboxExecPath(env);

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const state = fenceState(ctx);
		if (state.bypassed !== null) return { block: true, reason: bypassReason(state.bypassed) };
		let settings: FenceSettings;
		try {
			if (!loadSettings) throw new FenceError("no host settings reader was handed to the fence (gates/index.ts passes OMP's live Settings; a caller registering the fence directly passes its own)");
			settings = await loadSettings(ctx);
		} catch (err) {
			if (err instanceof HostError) return refuse(err.message);
			return refuse(`the settings that switch it could not be read (${err instanceof Error ? err.message : String(err)})`);
		}
		const s = gateSession(ctx, env);
		if (!settings.enabled) {
			if (!s.fenceOffRecorded) {
				try {
					if (s.bound) s.ledger().recordEntry({ workloadId: s.workloadId!, kind: "assumption", body: FENCE_OFF_BODY, by: s.laneId });
					else pi.appendEntry("p11-fence-off", { body: FENCE_OFF_BODY });
					s.fenceOffRecorded = true;
				} catch (err) {
					ctx.ui.notify(`M4b OS fence is off and the ledger entry saying so could not be written: ${String(err)}`, "warning");
				}
			}
			return undefined;
		}
		if (!settings.autoBackground) return refuse("bash.autoBackground.enabled is false for this profile, and with it off OMP keeps shell state across calls that the wrapper would silently lose (M4b step 1, b′)");
		if (!sandboxExec) return refuse("sandbox-exec was not found on PATH at load");
		const command = event.input.command;
		if (typeof command !== "string") return refuse("the call has no command text to wrap");
		if (INTERNAL_URL.test(command)) return { block: true, reason: INTERNAL_URL_REASON };
		if (!event.toolCallId) return refuse("the call has no tool call id, so rows 3 and 8 could not read its original command");
		let cwd: string;
		let profile: string;
		try {
			cwd = hostCommandCwd(event.input.cwd, ctx.cwd);
			// By the parsed word, so quoting (`sand''box-exec`) does not hide it from the fence (item 65
			// review B1), and `sandbox-exec` as data is not refused. Row 6 refuses it by name already, and
			// row 18 a leading one; this is the fence's own line.
			if (nestedSandboxExec(command, cwd, env, event.input.env)) return { block: true, reason: ALREADY_WRAPPED_REASON };
			profile = fenceProfile(fenceTargets(command, cwd, env, event.input.env));
		} catch (err) {
			return refuse(err instanceof FenceError ? err.message : `the fenced paths could not be computed (${String(err)})`);
		}
		const wrapped = wrapCommand(sandboxExec, profile, command);
		s.bashOriginals.set(event.toolCallId, command);
		state.expected.set(event.toolCallId, wrapped);
		// An explicit cwd goes back as the absolute directory the targets were found from, so bash runs
		// where the fence looked even if the host's resolution drifts from hostCommandCwd's copy.
		return { input: { ...event.input, command: wrapped, ...(event.input.cwd ? { cwd } : {}) } };
	});

	// What actually executes (see the header): a call the fence wrapped must start as that wrapper.
	// A call it never wrapped (refused by it or an earlier row, or the fence off) has no entry.
	// Spaces, tabs and newlines around the wrapper are bash word separators outside its quotes, so a
	// host or extension that pads or trims the command runs the same sandboxed command: compared with
	// them stripped, never as a bypass (M4b review: an outer-space variant ran fenced yet locked the
	// session out). OMP 18.3.0 itself does not rewrite `command` between tool_call and start: its
	// argument whitespace trim skips content keys (pi-ai utils/validation.ts CONTENT_CARRYING_KEYS)
	// and its event-input normalisation is edit-only (extensibility/tool-event-input.ts:70-71).
	pi.on("tool_execution_start", (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const state = fenceState(ctx);
		const expected = state.expected.get(event.toolCallId);
		if (expected === undefined) return undefined;
		state.expected.delete(event.toolCallId);
		const args = event.args as { command?: unknown } | null | undefined;
		if (typeof args?.command === "string" && args.command.replace(/^[ \t\n]+|[ \t\n]+$/g, "") === expected) return undefined;
		if (state.bypassed !== null) return undefined;
		state.bypassed = event.toolCallId;
		const body = fenceBypassBody(event.toolCallId);
		const s = gateSession(ctx, env);
		try {
			if (s.bound) s.ledger().recordEntry({ workloadId: s.workloadId!, kind: "assumption", body, by: s.laneId });
			else pi.appendEntry("p11-fence-bypassed", { body });
		} catch (err) {
			ctx.ui.notify(`${body} The ledger entry saying so could not be written: ${String(err)}`, "error");
			return undefined;
		}
		ctx.ui.notify(body, "error");
		return undefined;
	});

	// After rows 3 and 8 have read the original (they register earlier), drop it.
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName !== "bash" || !event.toolCallId) return undefined;
		gateSession(ctx, env).bashOriginals.delete(event.toolCallId);
		fenceState(ctx).expected.delete(event.toolCallId);
		return undefined;
	});
}
