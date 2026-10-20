// The plugin-registry disagreement check (PLAN wl-mv8k0fby51uakg D7, jo-issues#51): which plugin ids an OMP session
// started in `cwd` takes from an OMP registry while Claude Code's registry holds an active entry for the same id at a
// different version. `as2` start refuses on any (bin/as2 `check_plugins`, surface/scripts/plugin-registries.ts).
//
// The precedence is OMP's own, copied from pi-coding-agent@18.8.6 src/discovery/helpers.ts `listClaudePluginRoots`
// (with `resolveActiveProjectRegistryPath`, `readClaudeEnabledPlugins` and `parseClaudePluginsRegistry` beside it):
//   1. Claude's `<claudeDir>/plugins/installed_plugins.json`: an entry without a string installPath, or with
//      `enabled: false`, is skipped; a `false` in the merged `enabledPlugins` settings skips it; a project or local
//      entry counts only when its canonical projectPath is the active project's, or an `enabledPlugins` `true` opts
//      it in; a user entry counts otherwise.
//   2. An OMP user registry entry list for an id replaces every Claude entry for that id (any scope).
//   3. The project OMP registry found by OMP's walk from the cwd replaces both for the ids it lists.
// The OMP user registries read are the default profile's `<home>/<configDir>/plugins/installed_plugins.json` and the
// active profile's `<home>/<configDir>/profiles/<profile>/plugins/installed_plugins.json` when that file exists
// (pi-utils@18.8.6 src/dirs.ts `getPluginsDir`, `getProfileConfigRoot`); each is resolved on its own, as an OMP
// session in that profile would. XDG redirection (Linux only in `DirResolver`) is not followed.
//
// HOME, env and cwd are parameters, so tests run on fixture homes; the module reads files and writes nothing.
import { readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface RegistryInputs {
	home: string;
	env: Record<string, string | undefined>;
	cwd: string;
}

export interface Disagreement {
	id: string;
	ompVersion: string;
	ompPath: string;
	claudeVersion: string;
	claudePath: string;
}

/** A registry file that holds text but not a registry OMP would read (bad JSON, or no numeric version / plugins map). */
export class MalformedRegistryError extends Error {
	constructor(readonly path: string) {
		super(`malformed plugin registry: ${path}`);
		this.name = "MalformedRegistryError";
	}
}

interface Entry {
	scope?: unknown;
	installPath?: unknown;
	version?: unknown;
	enabled?: unknown;
	projectPath?: unknown;
}

interface Root {
	id: string;
	version: string;
	installPath: string;
	/** The registry file the entry came from. */
	registry: string;
	origin: "claude" | "omp";
}

const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Claude's config dir: `CLAUDE_CONFIG_DIR` (trimmed, resolved) or `<home>/.claude` (src/config/claude-paths.ts `resolveClaudePaths`). */
export function claudeConfigDir(home: string, env: RegistryInputs["env"]): string {
	const override = env.CLAUDE_CONFIG_DIR?.trim();
	return override ? resolve(override) : join(home, ".claude");
}

/** The active OMP profile, or undefined for the default (pi-utils@18.8.6 src/dirs.ts `resolveProfileEnv`); an invalid name counts as none. */
export function activeProfile(env: RegistryInputs["env"]): string | undefined {
	const name = (env.OMP_PROFILE !== undefined ? env.OMP_PROFILE : env.PI_PROFILE)?.trim();
	if (!name || name === "default" || name.endsWith(".") || !PROFILE_NAME_RE.test(name)) return undefined;
	return name;
}

/** The OMP user registries to check: the default profile's, then the active profile's when that file exists. */
export function ompUserRegistries(home: string, env: RegistryInputs["env"]): { path: string; profile: string | undefined }[] {
	// OMP's config dir name: `PI_CONFIG_DIR` or `.omp` (pi-utils@18.8.6 src/dirs.ts `getConfigDirName`).
	const root = join(home, env.PI_CONFIG_DIR || ".omp");
	const out: { path: string; profile: string | undefined }[] = [{ path: join(root, "plugins", "installed_plugins.json"), profile: undefined }];
	const profile = activeProfile(env);
	if (profile) {
		const path = join(root, "profiles", profile, "plugins", "installed_plugins.json");
		if (isFile(path)) out.push({ path, profile });
	}
	return out;
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

function isDir(path: string): boolean {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
}

function exists(path: string): boolean {
	try {
		statSync(path);
		return true;
	} catch {
		return false;
	}
}

/** pi-utils@18.8.6 src/dirs.ts `normalizePathForComparison` on a POSIX host: the real path, else the resolved one. */
function normalize(path: string): string {
	const resolved = resolve(path);
	try {
		return realpathSync(resolved);
	} catch {
		return resolved;
	}
}

/** src/discovery/helpers.ts `canonicalClaudeProjectPath`: the real path, or null when it does not exist. */
function canonical(path: string): string | null {
	try {
		return realpathSync(resolve(path));
	} catch {
		return null;
	}
}

/** src/capability/fs.ts `readFile`: a regular file's text, or null for anything missing, unreadable or not a file. */
function readText(path: string): string | null {
	try {
		if (!statSync(path).isFile()) return null;
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

/**
 * A registry's plugins map, as `parseClaudePluginsRegistry` accepts it: null for no entries (missing, unreadable or
 * empty file); a file with text OMP would reject throws MalformedRegistryError.
 */
function readRegistry(path: string): Record<string, unknown> | null {
	const content = readText(path);
	if (!content) return null;
	let data: unknown;
	try {
		data = JSON.parse(content);
	} catch {
		throw new MalformedRegistryError(path);
	}
	if (!data || typeof data !== "object" || !("version" in data) || !("plugins" in data)) throw new MalformedRegistryError(path);
	const { version, plugins } = data;
	if (typeof version !== "number" || !plugins || typeof plugins !== "object" || Array.isArray(plugins)) throw new MalformedRegistryError(path);
	return Object.fromEntries(Object.entries(plugins));
}

/**
 * src/discovery/helpers.ts `resolveActiveProjectRegistryPath`, with HOME a parameter: the nearest ancestor of cwd
 * (stopping before home) holding a `<configDir>` directory, else the nearest holding `.git`, as
 * `<dir>/<configDir>/plugins/installed_plugins.json`; null when neither is found. `userRoots` are the config roots
 * `isUserConfigRoot` excludes (home's and each OMP user registry's).
 */
export function projectRegistryPath(cwd: string, home: string, env: RegistryInputs["env"], userRoots: readonly string[]): string | null {
	const name = env.PI_CONFIG_DIR || ".omp";
	const homeDir = normalize(home);
	const excluded = new Set([normalize(join(home, name)), ...userRoots.map(normalize)]);
	const isUserConfigRoot = (dir: string) => excluded.has(normalize(join(dir, name)));
	for (const marker of [name, ".git"]) {
		let dir = resolve(cwd);
		while (normalize(dir) !== homeDir) {
			const found = marker === name ? isDir(join(dir, marker)) : exists(join(dir, marker));
			if (found && !isUserConfigRoot(dir)) return join(dir, name, "plugins", "installed_plugins.json");
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}
	return null;
}

/** src/discovery/helpers.ts `readClaudeEnabledPlugins`: `enabledPlugins` booleans merged, later files winning; bad files skipped. */
function readEnabledPlugins(claudeDir: string, projectDirs: readonly string[]): Map<string, boolean> {
	const enabled = new Map<string, boolean>();
	const files = [join(claudeDir, "settings.json")];
	for (const dir of projectDirs) files.push(join(dir, ".claude", "settings.json"), join(dir, ".claude", "settings.local.json"));
	for (const file of files) {
		const content = readText(file);
		if (!content) continue;
		let data: unknown;
		try {
			data = JSON.parse(content);
		} catch {
			continue;
		}
		if (!data || typeof data !== "object" || !("enabledPlugins" in data)) continue;
		const map = data.enabledPlugins;
		if (!map || typeof map !== "object" || Array.isArray(map)) continue;
		for (const [id, value] of Object.entries(map)) if (typeof value === "boolean") enabled.set(id, value);
	}
	return enabled;
}

/** The usable entries of one registry id: an array with at least one entry, under an id holding `@`; else null. */
function entriesOf(id: string, value: unknown): Entry[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	if (id.lastIndexOf("@") === -1) return null;
	return value.filter((e): e is Entry => !!e && typeof e === "object");
}

const versionOf = (entry: Entry): string => (typeof entry.version === "string" && entry.version ? entry.version : "unknown");

/** The disagreements an OMP session in `cwd` would carry, for every OMP user registry checked. Throws MalformedRegistryError. */
export function findDisagreements(inputs: RegistryInputs): Disagreement[] {
	const { home, env, cwd } = inputs;
	const users = ompUserRegistries(home, env);
	const userRoots = users.map((u) => dirname(dirname(u.path)));
	const claudeDir = claudeConfigDir(home, env);
	const claudePath = join(claudeDir, "plugins", "installed_plugins.json");
	const claudePlugins = readRegistry(claudePath);
	const projectFound = projectRegistryPath(cwd, home, env, userRoots);
	const out: Disagreement[] = [];
	const seen = new Set<string>();
	for (const user of users) {
		const projectPath = projectFound && normalize(projectFound) !== normalize(user.path) ? projectFound : null;
		const projectRoot = projectPath ? dirname(dirname(dirname(projectPath))) : cwd;
		const activeProject = canonical(projectRoot);
		const canonicalCwd = canonical(cwd);
		const settingsDirs = [...new Set([activeProject, canonicalCwd].filter((d): d is string => !!d))];
		const overrides = readEnabledPlugins(claudeDir, settingsDirs);

		// 1. Claude's active entries.
		const claude: Root[] = [];
		for (const [id, value] of Object.entries(claudePlugins ?? {})) {
			const entries = entriesOf(id, value);
			if (!entries) continue;
			for (const entry of entries) {
				if (typeof entry.installPath !== "string" || !entry.installPath) continue;
				if (entry.enabled === false) continue;
				const override = overrides.get(id);
				if (override === false) continue;
				if ((entry.scope === "local" || entry.scope === "project") && override !== true) {
					if (typeof entry.projectPath !== "string" || !entry.projectPath || !activeProject) continue;
					if (canonical(entry.projectPath) !== activeProject) continue;
				}
				claude.push({ id, version: versionOf(entry), installPath: entry.installPath, registry: claudePath, origin: "claude" });
			}
		}

		// 2. The OMP user registry replaces Claude's entries for every id it lists.
		let roots: Root[] = [...claude];
		for (const [id, value] of Object.entries(readRegistry(user.path) ?? {})) {
			const entries = entriesOf(id, value);
			if (!entries) continue;
			roots = roots.filter((r) => r.id !== id);
			for (const entry of entries) {
				if (typeof entry.installPath !== "string" || !entry.installPath) continue;
				if (entry.enabled === false) continue;
				if (roots.some((r) => r.id === id && r.installPath === entry.installPath)) continue;
				roots.push({ id, version: versionOf(entry), installPath: entry.installPath, registry: user.path, origin: "omp" });
			}
		}

		// 3. The project OMP registry shadows both for the ids it supplies.
		if (projectPath) {
			const project: Root[] = [];
			for (const [id, value] of Object.entries(readRegistry(projectPath) ?? {})) {
				const entries = entriesOf(id, value);
				if (!entries) continue;
				for (const entry of entries) {
					if (typeof entry.installPath !== "string" || !entry.installPath) continue;
					if (entry.enabled === false) continue;
					project.push({ id, version: versionOf(entry), installPath: entry.installPath, registry: projectPath, origin: "omp" });
				}
			}
			if (project.length > 0) {
				const ids = new Set(project.map((r) => r.id));
				roots = [...project, ...roots.filter((r) => !ids.has(r.id))];
			}
		}

		for (const omp of roots) {
			if (omp.origin !== "omp") continue;
			for (const c of claude) {
				if (c.id !== omp.id || c.version === omp.version) continue;
				const key = JSON.stringify([omp.id, omp.version, omp.registry, c.version]);
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({ id: omp.id, ompVersion: omp.version, ompPath: omp.registry, claudeVersion: c.version, claudePath });
			}
		}
	}
	return out;
}

/**
 * The two fix commands for one disagreement. OMP's marketplace install takes no version: `name@marketplace` installs
 * the catalog's current version, and `--force` is needed over an existing install (pi-coding-agent@18.8.6
 * src/cli/classify-install-target.ts `classifyInstallTarget` reads a trailing `@<version>` as an npm spec;
 * src/extensibility/plugins/marketplace/manager.ts `#validateInstall` refuses an installed id without force). The
 * profile is named so the command writes the registry that disagrees; `default` selects the default profile
 * (pi-utils@18.8.6 src/dirs.ts `normalizeProfileName`).
 */
export function fixCommands(d: Disagreement, inputs: RegistryInputs): { omp: string; claude: string } {
	const users = ompUserRegistries(inputs.home, inputs.env);
	const user = users.find((u) => u.path === d.ompPath);
	if (user) return { omp: `OMP_PROFILE=${user.profile ?? "default"} omp plugin install --force ${d.id}`, claude: `claude plugin update ${d.id}` };
	const projectDir = dirname(dirname(dirname(d.ompPath)));
	return { omp: `(cd ${projectDir} && omp plugin install --force --scope project ${d.id})`, claude: `(cd ${projectDir} && claude plugin update ${d.id})` };
}
