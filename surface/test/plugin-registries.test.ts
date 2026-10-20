// The plugin-registry disagreement check (PLAN wl-mv8k0fby51uakg D7, jo-issues#51): surface/src/plugin-registries.ts
// `findDisagreements` on fixture homes, OMP's precedence from pi-coding-agent@18.8.6 src/discovery/helpers.ts
// `listClaudePluginRoots`, and the CLI surface/scripts/plugin-registries.ts that bin/as2 runs before every start.
// Every fixture home is a temp directory holding a project `proj` with a `.git` directory, the cwd of each check; the
// env is the test's own map, never this process's (OMP_PROFILE is set in a lane).
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { main } from "../scripts/plugin-registries";
import { type Disagreement, findDisagreements } from "../src/plugin-registries";
import { tmp } from "./helpers";

const REPO = resolve(import.meta.dir, "..", "..");
const ID = "tool@market";

const roots: string[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r, { recursive: true, force: true });
});

/** A fixture home, its project (the cwd of each check) and its registry paths. */
interface Fixture {
	home: string;
	proj: string;
	claude: string;
	omp: string;
	profile: (name: string) => string;
	project: string;
}

function fixture(tag: string): Fixture {
	const home = realpathSync(tmp(`plugins-${tag}`));
	roots.push(home);
	const proj = join(home, "proj");
	mkdirSync(join(proj, ".git"), { recursive: true });
	return {
		home,
		proj,
		claude: join(home, ".claude", "plugins", "installed_plugins.json"),
		omp: join(home, ".omp", "plugins", "installed_plugins.json"),
		profile: (name: string) => join(home, ".omp", "profiles", name, "plugins", "installed_plugins.json"),
		project: join(proj, ".omp", "plugins", "installed_plugins.json"),
	};
}

function put(path: string, value: unknown): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
}

/** A registry file's content: one id with the given entries. */
const registry = (entries: Record<string, unknown>[], id = ID) => ({ version: 2, plugins: { [id]: entries } });
/** One registry entry at `version`; user scope unless `extra` says otherwise. */
const at = (version: string, extra: Record<string, unknown> = {}) => ({ scope: "user", installPath: `/cache/${ID}/${version}`, version, ...extra });

const check = (f: Fixture, env: Record<string, string> = {}) => findDisagreements({ home: f.home, env, cwd: f.proj });

describe("findDisagreements: OMP's precedence for the cwd", () => {
	test("agreement: the same version in Claude's and OMP's user registries → []", () => {
		const f = fixture("agree");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("1.0.0")]));
		expect(check(f)).toEqual([]);
	});

	test("absent registries → []", () => {
		expect(check(fixture("absent"))).toEqual([]);
	});

	test("a user-scope version mismatch → one disagreement naming both versions and both registries", () => {
		const f = fixture("mismatch");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("2.0.0")]));
		expect(check(f)).toEqual([{ id: ID, ompVersion: "2.0.0", ompPath: f.omp, claudeVersion: "1.0.0", claudePath: f.claude } satisfies Disagreement]);
	});

	test("an id only in Claude's registry → []", () => {
		const f = fixture("claude-only");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("2.0.0")], "other@market"));
		expect(check(f)).toEqual([]);
	});

	test("a Claude entry with enabled: false is not active → []", () => {
		const f = fixture("entry-off");
		put(f.claude, registry([at("1.0.0", { enabled: false })]));
		put(f.omp, registry([at("2.0.0")]));
		expect(check(f)).toEqual([]);
	});

	test("a Claude entry switched off by enabledPlugins false, in Claude's settings or the project's → []", () => {
		const f = fixture("settings-off");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("2.0.0")]));
		put(join(f.home, ".claude", "settings.json"), { enabledPlugins: { [ID]: false } });
		expect(check(f)).toEqual([]);

		const g = fixture("project-settings-off");
		put(g.claude, registry([at("1.0.0")]));
		put(g.omp, registry([at("2.0.0")]));
		put(join(g.home, ".claude", "settings.json"), { enabledPlugins: { [ID]: true } });
		put(join(g.proj, ".claude", "settings.local.json"), { enabledPlugins: { [ID]: false } });
		expect(check(g)).toEqual([]);
	});

	test("a project-scope Claude entry recorded for another project → []", () => {
		const f = fixture("other-project");
		const other = join(f.home, "other");
		mkdirSync(other);
		put(f.claude, registry([at("1.0.0", { scope: "project", projectPath: other }), at("1.5.0", { scope: "local", projectPath: other })]));
		put(f.omp, registry([at("2.0.0")]));
		expect(check(f)).toEqual([]);
	});

	test("a project-scope Claude entry for this project with a mismatch → one; enabledPlugins true opts another project's entry in", () => {
		const f = fixture("this-project");
		put(f.claude, registry([at("1.0.0", { scope: "project", projectPath: f.proj })]));
		put(f.omp, registry([at("2.0.0")]));
		expect(check(f)).toEqual([{ id: ID, ompVersion: "2.0.0", ompPath: f.omp, claudeVersion: "1.0.0", claudePath: f.claude }]);

		const g = fixture("opted-in");
		const other = join(g.home, "other");
		mkdirSync(other);
		put(g.claude, registry([at("1.0.0", { scope: "local", projectPath: other })]));
		put(g.omp, registry([at("2.0.0")]));
		put(join(g.proj, ".claude", "settings.json"), { enabledPlugins: { [ID]: true } });
		expect(check(g)).toEqual([{ id: ID, ompVersion: "2.0.0", ompPath: g.omp, claudeVersion: "1.0.0", claudePath: g.claude }]);
	});

	test("the project OMP registry overrides the user OMP registry: the project's entry is the one compared", () => {
		const f = fixture("project-over-user");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("1.0.0")]));
		put(f.project, registry([at("3.0.0", { scope: "project" })]));
		expect(check(f)).toEqual([{ id: ID, ompVersion: "3.0.0", ompPath: f.project, claudeVersion: "1.0.0", claudePath: f.claude }]);

		// And the other way: a user registry that disagrees is shadowed by a project one that agrees.
		const g = fixture("project-agrees");
		put(g.claude, registry([at("1.0.0")]));
		put(g.omp, registry([at("2.0.0")]));
		put(g.project, registry([at("1.0.0", { scope: "project" })]));
		expect(check(g)).toEqual([]);
	});

	test("the active profile's registry is checked when it exists; CLAUDE_CONFIG_DIR moves Claude's registry", () => {
		const f = fixture("profile");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("1.0.0")]));
		put(f.profile("as2"), registry([at("2.0.0")]));
		expect(check(f)).toEqual([]);
		expect(check(f, { OMP_PROFILE: "as2" })).toEqual([{ id: ID, ompVersion: "2.0.0", ompPath: f.profile("as2"), claudeVersion: "1.0.0", claudePath: f.claude }]);
		expect(check(f, { OMP_PROFILE: "missing" })).toEqual([]);

		const claudeDir = join(f.home, "elsewhere");
		put(join(claudeDir, "plugins", "installed_plugins.json"), registry([at("0.9.0")]));
		expect(check(f, { CLAUDE_CONFIG_DIR: claudeDir })).toEqual([
			{ id: ID, ompVersion: "1.0.0", ompPath: f.omp, claudeVersion: "0.9.0", claudePath: join(claudeDir, "plugins", "installed_plugins.json") },
		]);
	});
});

describe("the CLI: check [--cwd <dir>]", () => {
	const run = (f: Fixture, env: Record<string, string> = {}) => {
		let err = "";
		const code = main(["check", "--cwd", f.proj], { HOME: f.home, ...env }, (s) => {
			err += s;
		});
		return { code, err };
	};

	test("agreement: exit 0 and nothing printed", () => {
		const f = fixture("cli-agree");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("1.0.0")]));
		expect(run(f)).toEqual({ code: 0, err: "" });
	});

	test("a disagreement: exit 1, one line with both versions and paths, then the two fix commands", () => {
		const f = fixture("cli-mismatch");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("2.0.0")]));
		const r = run(f);
		expect(r.code).toBe(1);
		const lines = r.err.trimEnd().split("\n");
		expect(lines[1]).toBe(`  ${ID}: OMP 2.0.0 (${f.omp}) vs Claude 1.0.0 (${f.claude})`);
		expect(lines).toContain(`  match Claude: OMP_PROFILE=default omp plugin install --force ${ID}`);
		expect(lines).toContain(`  match OMP:    claude plugin update ${ID}`);

		put(f.project, registry([at("3.0.0", { scope: "project" })]));
		const p = run(f).err.split("\n");
		expect(p).toContain(`  match Claude: (cd ${f.proj} && omp plugin install --force --scope project ${ID})`);
	});

	test("malformed JSON: exit 2 naming the file", () => {
		const f = fixture("cli-malformed");
		put(f.omp, "{ not json");
		const r = run(f);
		expect(r.code).toBe(2);
		expect(r.err).toContain(f.omp);
		// The real process exits 2 too.
		const p = Bun.spawnSync(["bun", join(REPO, "surface", "scripts", "plugin-registries.ts"), "check", "--cwd", f.proj], { env: { PATH: process.env.PATH ?? "", HOME: f.home }, stdout: "pipe", stderr: "pipe" });
		expect(p.exitCode).toBe(2);
		expect(p.stderr.toString()).toContain(f.omp);
	});
});

describe("bin/as2 runs the check before an orchestrator start", () => {
	/** bin/as2 under sh with HOME at the fixture and nothing else inherited; `--print` and `plugins` never start omp. */
	const as2 = (f: Fixture, ...args: string[]) => {
		const r = Bun.spawnSync(["sh", join(REPO, "bin", "as2"), ...args], { cwd: REPO, env: { PATH: process.env.PATH ?? "", HOME: f.home }, stdout: "pipe", stderr: "pipe" });
		return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
	};
	const prompt = (f: Fixture) => join(f.home, ".agent-system-2", "orchestrator", "system.md");

	test("a disagreement: --print and plugins exit 1 with the plugin line, print no command line and render no prompt", () => {
		const f = fixture("as2-disagree");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("2.0.0")]));
		const line = `  ${ID}: OMP 2.0.0 (${f.omp}) vs Claude 1.0.0 (${f.claude})`;
		for (const args of [["--print"], ["plugins"]]) {
			const r = as2(f, ...args);
			expect({ args, code: r.code, out: r.out }).toEqual({ args, code: 1, out: "" });
			expect(r.err.split("\n")).toContain(line);
		}
		expect(existsSync(prompt(f))).toBe(false);
	});

	test("agreeing or absent registries: --print prints the omp line; plugins exits 0 silently", () => {
		const f = fixture("as2-agree");
		put(f.claude, registry([at("1.0.0")]));
		put(f.omp, registry([at("1.0.0")]));
		for (const g of [f, fixture("as2-absent")]) {
			const r = as2(g, "--print");
			expect(r.code).toBe(0);
			expect(r.out).toContain(` omp --cwd ${REPO} --append-system-prompt ${prompt(g)}`);
			expect(as2(g, "plugins")).toEqual({ code: 0, out: "", err: "" });
		}
	});
});
