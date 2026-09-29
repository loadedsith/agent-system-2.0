// M4b: the OS fence (MIGRATION.md M4b; research/gate-prior-art.md § 3). Every bash tool call the
// P-11 rows allowed is revised to run under a macOS Seatbelt profile that denies file writes to the
// ledger directory and to the `.git/hooks` of every repository the command runs in, plus the `.git`
// entry itself (so it cannot be renamed aside and swapped). Row 10's shell half and row 6's
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
// `bash.autoBackground.enabled` off, or settings that cannot be read refuse the call; nothing runs
// unwrapped unless the profile says `gates.fence.enabled: false`, and that is written down once.
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
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { canonicalPath, defaultLedgerPath } from "../../ledger/src/locality";
import { expandShell, gitCall } from "./exec";
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

/**
 * The fenced git paths of the repository containing `dir` (git's own discovery: the nearest `.git`
 * walking up): the `.git` entry and the hooks directory. `.git` may be a directory, or a file holding
 * `gitdir: <path>` (worktrees, submodules); a linked worktree's hooks live in the common dir its
 * `commondir` file names. Null when `dir` is in no repository.
 */
export function repoGitTargets(dir: string): FenceTarget[] | null {
	for (let cur = canonical(dir, "the command's directory"); ; cur = dirname(cur)) {
		const dotGit = join(cur, ".git");
		let isFile = false;
		try {
			const st = lstatSync(dotGit);
			isFile = st.isFile() || (st.isSymbolicLink() && existsSync(dotGit) && !lstatSync(realpathSync(dotGit)).isDirectory());
		} catch {
			if (dirname(cur) === cur) return null;
			continue;
		}
		let gitDir = dotGit;
		if (isFile) {
			const m = /^gitdir: *(.+?)\s*$/m.exec(readFileSync(dotGit, "utf8"));
			if (!m) throw new FenceError(`${dotGit} is a file without a \`gitdir:\` line`);
			gitDir = resolve(cur, m[1]!);
		}
		gitDir = canonical(gitDir, `the git directory named by ${dotGit}`);
		let common = gitDir;
		const commonFile = join(gitDir, "commondir");
		if (existsSync(commonFile)) common = canonical(resolve(gitDir, readFileSync(commonFile, "utf8").trim()), `the common git directory named by ${commonFile}`);
		return [
			{ kind: "literal", path: dotGit },
			{ kind: "subpath", path: canonical(join(common, "hooks"), `${common}/hooks`) },
		];
	}
}

/**
 * Everything the fence denies writes to for `command` run from `cwd`: the ledger directory, and the
 * git targets of every repository the command runs in — `cwd`, each directory a `cd` reaches that the
 * gate can see, and each literal `git -C` path (exec.ts gitCall, the resolver the rows use).
 */
export function fenceTargets(command: string, cwd: string, env: Record<string, string | undefined>, toolEnv?: unknown): FenceTarget[] {
	const ledgerDir = dirname(defaultLedgerPath(env));
	const out: FenceTarget[] = [{ kind: "subpath", path: canonical(ledgerDir, "the ledger directory") }];
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
 * The host's settings (OMP 18.3.0 config/settings.ts): the effective `bash.autoBackground.enabled`,
 * and `gates.fence.enabled` from the profile's config.yml (an unknown key OMP keeps as written,
 * `getGlobalSettings()`). Dynamic because this checkout carries no OMP to import from statically;
 * the same host import the classifier uses (classifier/extension.ts productionExtension).
 */
export async function hostFenceSettings(ctx: Ctx): Promise<FenceSettings> {
	// Dynamic: the specifier resolves only inside a running OMP (extensibility/plugins/legacy-pi-compat.ts).
	const { Settings } = await import("@oh-my-pi/pi-coding-agent/config/settings");
	const s = await (Settings.current ?? Settings.loadReadOnly({ cwd: ctx.cwd }));
	const gates: unknown = s.getGlobalSettings().gates;
	const fence: unknown = gates && typeof gates === "object" && "fence" in gates ? gates.fence : undefined;
	const flag: unknown = fence && typeof fence === "object" && "enabled" in fence ? fence.enabled : undefined;
	if (flag !== undefined && typeof flag !== "boolean") throw new FenceError(`${FENCE_FLAG} is ${JSON.stringify(flag)}, not true or false`);
	return { enabled: flag ?? true, autoBackground: s.get("bash.autoBackground.enabled") === true };
}

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
 * only revises what they all allowed. `loadSettings` is injectable for tests.
 */
export function registerFence(
	pi: GatesAPI,
	env: Record<string, string | undefined>,
	loadSettings: (ctx: Ctx) => Promise<FenceSettings> = hostFenceSettings,
): void {
	const sandboxExec = sandboxExecPath(env);

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const state = fenceState(ctx);
		if (state.bypassed !== null) return { block: true, reason: bypassReason(state.bypassed) };
		let settings: FenceSettings;
		try {
			settings = await loadSettings(ctx);
		} catch (err) {
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
		const cwd = typeof event.input.cwd === "string" ? resolve(ctx.cwd, event.input.cwd) : ctx.cwd;
		let profile: string;
		try {
			profile = fenceProfile(fenceTargets(command, cwd, env, event.input.env));
		} catch (err) {
			return refuse(err instanceof FenceError ? err.message : `the fenced paths could not be computed (${String(err)})`);
		}
		const wrapped = wrapCommand(sandboxExec, profile, command);
		s.bashOriginals.set(event.toolCallId, command);
		state.expected.set(event.toolCallId, wrapped);
		return { input: { ...event.input, command: wrapped } };
	});

	// What actually executes (see the header): a call the fence wrapped must start as that wrapper.
	// A call it never wrapped (refused by it or an earlier row, or the fence off) has no entry.
	pi.on("tool_execution_start", (event, ctx) => {
		if (event.toolName !== "bash") return undefined;
		const state = fenceState(ctx);
		const expected = state.expected.get(event.toolCallId);
		if (expected === undefined) return undefined;
		state.expected.delete(event.toolCallId);
		const args = event.args as { command?: unknown } | null | undefined;
		if (args?.command === expected) return undefined;
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
		if (event.toolName === "bash" && event.toolCallId) {
			gateSession(ctx, env).bashOriginals.delete(event.toolCallId);
			fenceState(ctx).expected.delete(event.toolCallId);
		}
		return undefined;
	});
}
