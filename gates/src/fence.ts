// M4b: the OS fence (MIGRATION.md M4b; research/gate-prior-art.md § 3). Every bash tool call the
// P-11 rows allowed is revised to run under a macOS Seatbelt profile that denies file writes to the
// ledger directory and to the `.git/hooks`, `.git/config` (and a worktree's `config.worktree`) of
// every repository the command runs in, plus the `.git` entry itself (so it cannot be renamed aside
// and swapped). Row 10's shell half and row 6's runs-a-program half become defense in depth: the
// parse-time rules still judge first, and this is the layer a parser gap cannot talk past.
//
// Where it runs: the last `tool_call` handler the gates register (gates/index.ts). OMP hands every
// handler the same original event, stops at the first block and keeps the last non-block result
// (OMP 18.3.0 extensibility/extensions/runner.ts emitToolCall), so the rows have all judged the
// original command before this sees it, and they never see the wrapper (row 6 refuses `bash -c`).
// The original is kept per tool call id so rows 3 and 8 read it from `tool_result`, not the wrapper
// (session.ts originalInput).
//
// Fails closed: a path that cannot be canonicalized, `sandbox-exec` missing, OMP's
// `bash.autoBackground.enabled` off, or settings that cannot be read refuse the call; nothing runs
// unwrapped unless the profile says `gates.fence.enabled: false`, and that is written down once.
//
// Known-open doors (not under this fence; row 10's other halves stay the line):
// - the JS `eval` tool's subprocesses (Bun.$, spawn…) run in OMP's own process tree, unsandboxed;
// - the file tools (write, edit, ast_edit) write from OMP's process, unsandboxed;
// - setuid binaries (`/bin/ps`) exit 126 under any Seatbelt profile; documented, not worked around;
// - OMP's in-process shell builtins are replaced by the macOS binaries, and `/bin/bash` is 3.2
//   (no `declare -A`, `mapfile`, `${x,,}`): the builtin loss Jo accepted 2026-09-29;
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
 * The git directories of the repository containing `dir` (git's own discovery: the nearest `.git`
 * walking up). `.git` may be a directory, or a file holding `gitdir: <path>` (worktrees, submodules);
 * a linked worktree's hooks and config live in the common dir its `commondir` file names. Null when
 * `dir` is in no repository.
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
		const out: FenceTarget[] = [
			{ kind: "literal", path: dotGit },
			{ kind: "subpath", path: canonical(join(common, "hooks"), `${common}/hooks`) },
			{ kind: "subpath", path: canonical(join(common, "config"), `${common}/config`) },
		];
		if (common !== gitDir) out.push({ kind: "subpath", path: canonical(join(gitDir, "config.worktree"), `${gitDir}/config.worktree`) });
		return out;
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

export const FENCE_OFF_BODY = `${FENCE_FLAG} is false: bash tool calls in this lane run without the M4b OS fence (no Seatbelt deny on the ledger directory, .git/hooks or .git/config).`;

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
		if (!event.toolCallId) return refuse("the call has no tool call id, so rows 3 and 8 could not read its original command");
		const cwd = typeof event.input.cwd === "string" ? resolve(ctx.cwd, event.input.cwd) : ctx.cwd;
		let profile: string;
		try {
			profile = fenceProfile(fenceTargets(command, cwd, env, event.input.env));
		} catch (err) {
			return refuse(err instanceof FenceError ? err.message : `the fenced paths could not be computed (${String(err)})`);
		}
		s.bashOriginals.set(event.toolCallId, command);
		return { input: { ...event.input, command: wrapCommand(sandboxExec, profile, command) } };
	});

	// After rows 3 and 8 have read the original (they register earlier), drop it.
	pi.on("tool_result", (event, ctx) => {
		if (event.toolName === "bash" && event.toolCallId) gateSession(ctx, env).bashOriginals.delete(event.toolCallId);
		return undefined;
	});
}
