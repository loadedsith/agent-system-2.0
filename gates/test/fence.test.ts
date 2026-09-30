// M4b step 3: the OS fence (gates/src/fence.ts). Sandboxed writes to the configured ledger, to a
// repo's .git/hooks and to the .git entry itself are refused by the OS, not by a parser: each case
// runs the command the fence revised a bash call into, for real, under /bin/bash. .git/config is not
// fenced (M4b fix 1): upstream tracking records under the fence, and config writes stay the rows'.
// Also: the ledger module still writes in-process; `sqlite3 -readonly` reads a live WAL ledger from
// inside the sandbox; the wrapper leaves quoting alone; every fail-closed path refuses; internal URLs
// are refused before wrapping; a later handler that drops the wrapper is caught at execution start;
// the flag turns the fence off and says so in the ledger; rows 3 and 8 read the original command;
// the eval subprocess is NOT fenced. M4b fix 2 (review astra-1): the call's cwd resolves as OMP's bash
// tool does (tilde pair, internal-URL and missing cwds refused, parity with the host's resolver); a
// ledger file symlinked elsewhere is fenced where it resolves; a bare repository's hooks are fenced;
// the bypass guard tolerates outer whitespace around the wrapper and still trips on an unwrapped run.
// M4b fix 3 (review astra-2): settings reach the fence only through the reader it is handed, the
// live instance winning over the disk read; with no reader every bash call is refused.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { Database } from "bun:sqlite";
import { Ledger } from "../../ledger/src/index";
import { FENCE_OFF_BODY, type FenceSettings, fenceBypassBody, fenceSettingsFrom, INTERNAL_URL_REASON, registerFence } from "../src/fence";
import p11Gates from "../index";
import { gateSession, type GatesAPI } from "../src/session";
import { advanceOriginMain, commit, git, repoWithOrigin, tmp } from "./helpers";

type AnyHandler = (event: Record<string, unknown>, ctx: unknown) => unknown;
type Revised = { block?: boolean; reason?: string; input?: Record<string, unknown> } | undefined;

const ON: FenceSettings = { enabled: true, autoBackground: true };

/**
 * A fake OMP extension API chaining handlers the way the runner does (runner.ts emitToolCall): every
 * handler gets the same original event, the first block returns, otherwise the last result wins.
 */
function fakePi() {
	const handlers = new Map<string, AnyHandler[]>();
	const entries: { type: string; data: unknown }[] = [];
	const pi = {
		on: (name: string, h: AnyHandler) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		getActiveTools: () => ["bash", "read"],
		getAllTools: () => [{ name: "bash" }, { name: "read" }],
		setActiveTools: async () => {},
		appendEntry: (type: string, data?: unknown) => entries.push({ type, data }),
		registerTool: () => {},
		zod: { object: () => ({}), string: () => ({ describe: () => ({}), optional: () => ({ describe: () => ({}) }) }) },
	};
	const emit = async (name: string, event: Record<string, unknown>, ctx: unknown): Promise<Revised> => {
		let last: Revised;
		for (const h of handlers.get(name) ?? []) {
			const r = (await h(event, ctx)) as Revised;
			if (!r) continue;
			last = r;
			if (r.block) return r;
		}
		return last;
	};
	/** Each handler's own return for `event`, in order (no chaining). */
	const results = async (name: string, event: Record<string, unknown>, ctx: unknown): Promise<unknown[]> => {
		const out: unknown[] = [];
		for (const h of handlers.get(name) ?? []) out.push(await h(event, ctx));
		return out;
	};
	return { pi: pi as unknown as GatesAPI, on: pi.on, emit, results, entries };
}

const notices: string[] = [];
const ctxOf = (cwd: string) => ({
	hasUI: true,
	cwd,
	sessionManager: { getHeader: () => null, getEntries: () => [] },
	ui: { notify: (m: string) => notices.push(m) },
});

let callId = 0;
/** The fence alone (no rows) over one bash call: what OMP would run. */
async function fenced(command: string, cwd: string, env: Record<string, string | undefined>, settings: FenceSettings = ON): Promise<Revised> {
	const f = fakePi();
	registerFence(f.pi, env, async () => settings);
	return f.emit("tool_call", { toolName: "bash", toolCallId: `c${++callId}`, input: { command } }, ctxOf(cwd));
}

/** The wrapped command for `command`; fails the test if the fence refused it. */
async function wrapped(command: string, cwd: string, env: Record<string, string | undefined>): Promise<string> {
	const r = await fenced(command, cwd, env);
	if (!r?.input || r.block) throw new Error(`fence refused: ${r?.reason}`);
	return String(r.input.command);
}

const RUN_ENV = {
	PATH: process.env.PATH,
	GIT_AUTHOR_NAME: "fence test",
	GIT_AUTHOR_EMAIL: "fence@test.invalid",
	GIT_COMMITTER_NAME: "fence test",
	GIT_COMMITTER_EMAIL: "fence@test.invalid",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_TERMINAL_PROMPT: "0",
	GIT_PAGER: "cat",
	PAGER: "cat",
	MANPAGER: "cat",
	LC_ALL: "C",
};

/** Run `command` with /bin/bash -c, the shape OMP's shell hands the wrapper to (and the unwrapped control). */
function sh(command: string, cwd: string, env: Record<string, string | undefined> = RUN_ENV) {
	const r = spawnSync("/bin/bash", ["-c", command], { cwd, env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
	return { code: r.status, out: r.stdout, err: r.stderr };
}

/** Every file under `dir` with its bytes: proof nothing changed. */
function snapshot(dir: string): string {
	const r = spawnSync("/bin/bash", ["-c", `find . -print | LC_ALL=C sort | while read -r f; do printf '%s ' "$f"; [ -f "$f" ] && shasum "$f" | cut -c1-40 || echo; done`], { cwd: dir, encoding: "utf8" });
	return r.stdout;
}

describe("the fence refuses sandboxed writes into the configured ledger directory", () => {
	// The default layout ($HOME/.agent-system-2/ledger.db) under a temp HOME. tmpdir is under /var,
	// itself a symlink to /private/var on macOS: the profile must carry the canonical path, or
	// Seatbelt fails open silently (research/gate-prior-art.md § 3).
	const home = tmp("fence-home");
	const env = { HOME: home, PATH: process.env.PATH };
	const dir = join(home, ".agent-system-2");
	const db = join(dir, "ledger.db");
	const outside = tmp("fence-outside");
	beforeAll(() => {
		Ledger.open(db, { create: true, backup: false, backupOnOpen: false }).close();
		symlinkSync(db, join(outside, "link.db"));
	});

	const cases: [string, string][] = [
		["a shell redirect", `echo forged >> ${db}`],
		["touch", `touch ${db}`],
		["/usr/bin/touch creating a file", `/usr/bin/touch ${dir}/new.txt`],
		["sqlite3", `sqlite3 ${db} "CREATE TABLE forged (x)"`],
		["a child sh", `sh -c 'echo forged > ${db}-wal'`],
		["a symlink outside the fence", `echo forged >> ${join(outside, "link.db")}`],
		["rm", `rm -f ${db}`],
		["mv of the directory", `mv ${dir} ${dir}.moved`],
	];
	for (const [name, command] of cases) {
		test(`${name}: non-zero, ledger directory unchanged`, async () => {
			const before = snapshot(dir);
			const r = sh(await wrapped(command, outside, env), outside);
			expect(r.code).not.toBe(0);
			expect(snapshot(dir)).toBe(before);
		});
	}

	test("control: the same wrapped write outside the fence succeeds", async () => {
		const r = sh(await wrapped(`echo ok > ${outside}/control.txt && /usr/bin/touch ${outside}/c2`, outside, env), outside);
		expect(r.code).toBe(0);
		expect(readFileSync(join(outside, "control.txt"), "utf8")).toBe("ok\n");
	});

	test("the ledger module (in-process) still writes while the fence is on", async () => {
		await wrapped("true", outside, env); // the fence registered and built for this ledger
		const l = Ledger.open(db, { backup: false, backupOnOpen: false });
		const wl = l.openWorkload({ by: "fence-test", brief: "b", stakes: "throwaway", mode: "autonomous" });
		expect(l.workload(wl)?.id).toBe(wl);
		l.close();
	});

	test("sqlite3 -readonly reads a live WAL ledger from inside the sandbox", async () => {
		const live = new Database(db);
		live.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE IF NOT EXISTS probe (x); INSERT INTO probe VALUES (1), (2), (3);");
		try {
			expect(statSync(`${db}-wal`).size).toBeGreaterThan(0); // rows sit in the WAL, uncheckpointed
			const r = sh(await wrapped(`sqlite3 -readonly ${db} 'select count(*) from probe'`, outside, env), outside);
			expect({ code: r.code, out: r.out.trim() }).toEqual({ code: 0, out: "3" });
		} finally {
			live.close();
		}
	});

	test("a setuid binary exits 126 under the fence (known, documented, not worked around)", async () => {
		expect(sh(await wrapped("/bin/ps -p $$", outside, env), outside).code).toBe(126);
	});
});

describe("the fence refuses sandboxed writes to .git/hooks and the .git entry", () => {
	const env = { HOME: tmp("fence-git-home"), PATH: process.env.PATH };
	let work = "";
	let wt = "";
	beforeAll(() => {
		work = repoWithOrigin().work;
		wt = join(tmp("fence-wt"), "wt");
		git(work, "worktree", "add", "-q", "--detach", wt);
	});

	const gitCases: [string, string][] = [
		["hooks/pre-commit by redirect", "echo 'exit 0' > .git/hooks/pre-commit; chmod +x .git/hooks/pre-commit"],
		["the .git entry renamed aside", "mv .git .git-aside"],
	];
	for (const [name, cmd] of gitCases) {
		test(`${name}: non-zero or unwritten, repository metadata unchanged`, async () => {
			const before = snapshot(join(work, ".git"));
			const r = sh(await wrapped(cmd, work, env), work);
			expect(r.err).toContain("Operation not permitted");
			expect(existsSync(join(work, ".git", "hooks", "pre-commit"))).toBe(false);
			expect(snapshot(join(work, ".git")).split("\n").filter((l) => /hooks|config/.test(l))).toEqual(before.split("\n").filter((l) => /hooks|config/.test(l)));
		});
	}

	test("a worktree whose .git is a file: the common hooks and its .git pointer are fenced", async () => {
		expect(statSync(join(wt, ".git")).isFile()).toBe(true);
		const common = join(work, ".git");
		const r1 = sh(await wrapped(`echo 'exit 0' > "$(git rev-parse --git-common-dir)/hooks/pre-commit"`, wt, env), wt);
		const r2 = sh(await wrapped("echo 'gitdir: /tmp/forged' > .git", wt, env), wt);
		for (const r of [r1, r2]) expect(r.err).toContain("Operation not permitted");
		expect(existsSync(join(common, "hooks", "pre-commit"))).toBe(false);
		expect(readFileSync(join(wt, ".git"), "utf8")).toStartWith("gitdir: ");
	});

	test("control: ordinary git work inside the fence succeeds (commit, branch, fetch)", async () => {
		const r = sh(await wrapped("git switch -q -c fence-ctl && git commit -q --allow-empty -m fenced && git fetch -q origin && git log --oneline -1", work, env), work);
		expect({ code: r.code, out: r.out.trim().endsWith("fenced") }).toEqual({ code: 0, out: true });
	});
});

describe(".git/config is not fenced: upstream tracking records, config writes stay the rows'", () => {
	const env = { HOME: tmp("fence-cfg-home"), PATH: process.env.PATH };
	const cfg = (repo: string, key: string) => spawnSync("git", ["config", "--get", key], { cwd: repo, encoding: "utf8" }).stdout.trim();

	test("git push -u origin <branch> to a local bare remote exits 0 and records the upstream", async () => {
		const { work } = repoWithOrigin();
		git(work, "switch", "-q", "-c", "feat");
		commit(work, "f.txt", "f\n");
		const r = sh(await wrapped("git push -q -u origin feat", work, env), work);
		expect({ code: r.code, err: r.err, remote: cfg(work, "branch.feat.remote"), merge: cfg(work, "branch.feat.merge") }).toEqual({ code: 0, err: "", remote: "origin", merge: "refs/heads/feat" });
	});

	test("git switch -c x origin/main exits 0 and records tracking", async () => {
		const { work } = repoWithOrigin();
		const r = sh(await wrapped("git switch -q -c x origin/main", work, env), work);
		expect({ code: r.code, err: r.err, remote: cfg(work, "branch.x.remote"), merge: cfg(work, "branch.x.merge") }).toEqual({ code: 0, err: "", remote: "origin", merge: "refs/heads/main" });
	});

	test("the rows still refuse config writes before the wrapper: git config and a redirect into .git/config (both row 6)", async () => {
		const { work } = repoWithOrigin();
		const before = readFileSync(join(work, ".git", "config"), "utf8");
		const f = fakePi();
		p11Gates(f.pi, { ...env, AGENT_SYSTEM_LEDGER_DB: join(env.HOME, "ledger.db") }, async () => ON);
		const ctx = ctxOf(work);
		const byConfig = await f.emit("tool_call", { toolName: "bash", toolCallId: "cfg-1", input: { command: "git config core.hooksPath /tmp/x" } }, ctx);
		const byRedirect = await f.emit("tool_call", { toolName: "bash", toolCallId: "cfg-2", input: { command: "echo x >> .git/config" } }, ctx);
		expect({ block: byConfig?.block, input: byConfig?.input, row: byConfig?.reason?.slice(0, 18) }).toEqual({ block: true, input: undefined, row: "P-11 row 6 refused" });
		expect({ block: byRedirect?.block, input: byRedirect?.input, why: byRedirect?.reason?.startsWith("P-11 row 6 refused this: writing inside a .git directory") }).toEqual({ block: true, input: undefined, why: true });
		expect(readFileSync(join(work, ".git", "config"), "utf8")).toBe(before);
	});
});

describe("internal URLs are refused before wrapping (OMP does not expand them inside the wrapper's quotes)", () => {
	const d = tmp("fence-urls");
	const env = { HOME: d, PATH: process.env.PATH };
	const refused = [
		"cat skill://tdd/SKILL.md",
		"wc -l artifact://12",
		"cp local://notes.md /tmp/x",
		"cat local:/notes.md",
		"echo agent://Scout/result",
		'git commit -m "see artifact://12"',
		"x=rule://careful; echo $x",
	];
	for (const command of refused) {
		test(`refused: ${command}`, async () => {
			expect(await fenced(command, d, env)).toEqual({ block: true, reason: INTERNAL_URL_REASON });
		});
	}
	const allowed = ["echo https://example.com/skill://x", "echo host.local://x", "echo mylocal:/x", "echo skill:x"];
	for (const command of allowed) {
		test(`not a token at a word start, wrapped: ${command}`, async () => {
			expect(await wrapped(command, d, env)).toContain("sandbox-exec");
		});
	}
	test("with the fence off the command runs unwrapped, and OMP expands the URL itself", async () => {
		expect(await fenced("cat skill://tdd/SKILL.md", d, env, { enabled: false, autoBackground: true })).toBeUndefined();
	});
});

describe("a later extension's tool_call handler that drops the wrapper", () => {
	function setup(later: (event: Record<string, unknown>) => unknown) {
		const home = tmp("fence-bypass");
		const db = join(home, ".agent-system-2", "ledger.db");
		const l = Ledger.open(db, { create: true, backup: false, backupOnOpen: false });
		const wl = l.openWorkload({ by: "orch", brief: "b", stakes: "normal", mode: "autonomous" });
		const env = { HOME: home, PATH: process.env.PATH, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-bp" };
		const f = fakePi();
		registerFence(f.pi, env, async () => ON);
		f.on("tool_call", later);
		return { f, l, wl, ctx: ctxOf(home) };
	}

	test("`return {}` after the gates: the unwrapped start is recorded as an assumption row and every later bash call is refused", async () => {
		const { f, l, wl, ctx } = setup((e) => (e.toolName === "bash" ? {} : undefined));
		const input = { command: "echo hi" };
		const r = await f.emit("tool_call", { toolName: "bash", toolCallId: "b1", input }, ctx);
		expect(r?.input).toBeUndefined();
		await f.emit("tool_execution_start", { toolName: "bash", toolCallId: "b1", args: input }, ctx);
		expect(l.entries(wl, "assumption").map((e) => [e.body, e.created_by])).toEqual([[fenceBypassBody("b1"), "lane-bp"]]);
		const next = await f.emit("tool_call", { toolName: "bash", toolCallId: "b2", input: { command: "true" } }, ctx);
		expect({ block: next?.block, why: next?.reason?.includes("bash call b1 ran without the fence's wrapper") }).toEqual({ block: true, why: true });
		l.close();
	});

	test("control: a later handler returning undefined leaves the wrapper, nothing is recorded, the next call is wrapped", async () => {
		const { f, l, wl, ctx } = setup(() => undefined);
		const r = await f.emit("tool_call", { toolName: "bash", toolCallId: "c1", input: { command: "echo hi" } }, ctx);
		await f.emit("tool_execution_start", { toolName: "bash", toolCallId: "c1", args: r!.input }, ctx);
		expect(l.entries(wl, "assumption")).toEqual([]);
		expect(String((await f.emit("tool_call", { toolName: "bash", toolCallId: "c2", input: { command: "true" } }, ctx))?.input?.command)).toContain("sandbox-exec");
		l.close();
	});
});

describe("every extension profile/config.yml loads returns undefined from tool_call for a bash call", () => {
	const REPO = resolve(import.meta.dir, "..", "..");
	const listed = (Bun.YAML.parse(readFileSync(join(REPO, "profile", "config.yml"), "utf8")) as { extensions?: string[] }).extensions ?? [];
	const paths = listed.map((p) => p.replaceAll("{repo}", REPO));
	// Only the extensions loaded after the gates can replace the fence's wrapper (profile/config.yml
	// lists the surface before the gates and the classifier after them).
	const gatesAt = paths.findIndex((p) => resolve(p) === join(REPO, "gates", "index.ts"));
	const after = paths.slice(gatesAt + 1);
	test("the list is not empty", () => {
		expect(after.length).toBeGreaterThan(0);
	});
	for (const path of after) {
		test(`${path.slice(REPO.length + 1)}: undefined for bash`, async () => {
			const mod = (await import(path)) as { default: (pi: GatesAPI) => void };
			const f = fakePi();
			mod.default(f.pi);
			const results = await f.results("tool_call", { toolName: "bash", toolCallId: "ext-1", input: { command: "echo hi" } }, ctxOf(REPO));
			expect(results.length).toBeGreaterThan(0);
			expect(results).toEqual(results.map(() => undefined));
		});
	}
});

describe("quoting: the wrapped command's output is the unwrapped command's", () => {
	const dir = tmp("fence-quote");
	const env = { HOME: tmp("fence-quote-home"), PATH: process.env.PATH };
	const cmds = [
		`echo 'single quoted' "it's" 'a'\\''b'`,
		`echo $'tab\\there\\nnewline' $'\\x41\\u00e9'`,
		`printf '%s|' 'a\\b' "c\\\\d" e\\\\f 'g\\\\\\h'; echo`,
		"echo one\necho two\n  echo three",
		"cat <<'EOF'\n$HOME 'q' \"dq\" \\n $(not run)\nEOF",
		"X=exp; cat <<EOF\n$X \\$X 'q'\nEOF",
		`echo hi!; echo "!x" '!!' !$; set -H 2>/dev/null; echo "wow!"`,
		`a='x y'; for w in $a "$a"; do echo "[$w]"; done; echo "$((1+2))" \${#a}`,
		`echo "$0" | sed 's/.*bash/bash/'; exit 7`,
	];
	for (const c of cmds) {
		test(JSON.stringify(c).slice(0, 60), async () => {
			const plain = sh(c, dir);
			const fencedRun = sh(await wrapped(c, dir, env), dir);
			expect(fencedRun).toEqual(plain);
		});
	}
});

describe("fail closed", () => {
	test("an unresolvable ledger path (a symlink loop) refuses the call", async () => {
		const d = tmp("fence-loop");
		symlinkSync(join(d, "b"), join(d, "a"));
		symlinkSync(join(d, "a"), join(d, "b"));
		const r = await fenced("echo hi", d, { HOME: d, PATH: process.env.PATH, AGENT_SYSTEM_LEDGER_DB: join(d, "a", "ledger.db") });
		expect(r?.block).toBe(true);
		expect(r?.reason).toContain("the ledger directory");
	});
	test("sandbox-exec absent from PATH refuses the call", async () => {
		const d = tmp("fence-nopath");
		const r = await fenced("echo hi", d, { HOME: d, PATH: d });
		expect(r?.reason).toContain("sandbox-exec was not found");
	});
	test("bash.autoBackground.enabled false refuses the call", async () => {
		const d = tmp("fence-noab");
		const r = await fenced("echo hi", d, { HOME: d, PATH: process.env.PATH }, { enabled: true, autoBackground: false });
		expect(r?.reason).toContain("bash.autoBackground.enabled is false");
	});
	test("settings that cannot be read refuse the call", async () => {
		const d = tmp("fence-nosettings");
		const f = fakePi();
		registerFence(f.pi, { HOME: d, PATH: process.env.PATH }, async () => {
			throw new Error("no host");
		});
		const r = await f.emit("tool_call", { toolName: "bash", toolCallId: "x", input: { command: "true" } }, ctxOf(d));
		expect(r?.reason).toContain("could not be read (no host)");
	});
	test("a .git file with no gitdir line refuses the call", async () => {
		const d = tmp("fence-badgit");
		writeFileSync(join(d, ".git"), "not a pointer\n");
		const r = await fenced("git status", d, { HOME: d, PATH: process.env.PATH });
		expect(r?.reason).toContain("without a `gitdir:` line");
	});
});

/** The fence alone over one bash call carrying `input` (cwd, env, …), from session cwd `sessionCwd`. */
async function fencedInput(input: Record<string, unknown>, sessionCwd: string, env: Record<string, string | undefined>): Promise<Revised> {
	const f = fakePi();
	registerFence(f.pi, env, async () => ON);
	return f.emit("tool_call", { toolName: "bash", toolCallId: `c${++callId}`, input }, ctxOf(sessionCwd));
}

describe("the call's cwd resolves the way OMP's bash tool does (M4b review B1)", () => {
	// OMP 18.3.0 tools/bash.ts:953-963 → path-utils.ts resolveToCwd: `~` is the home directory
	// (os.homedir(), which the fence reads the same way in the same process).
	const env = { HOME: tmp("fence-cwd-home"), PATH: process.env.PATH };
	const session = tmp("fence-cwd-session"); // in no repository
	let work = "";
	beforeAll(() => {
		work = repoWithOrigin().work;
	});

	test("the live tilde/absolute pair: a hook write is refused from `~/…` and from the absolute spelling", async () => {
		const tilde = `~/${relative(homedir(), work)}`;
		for (const [name, cwd] of [["tilde-write", tilde], ["absolute-write", work]] as const) {
			const r = await fencedInput({ command: `touch .git/hooks/${name}`, cwd }, session, env);
			expect(r?.block).toBeUndefined();
			const ran = sh(String(r?.input?.command), work);
			expect({ name, code: ran.code, denied: ran.err.includes("Operation not permitted"), exists: existsSync(join(work, ".git", "hooks", name)) }).toEqual({ name, code: 1, denied: true, exists: false });
			expect(resolve(String(r?.input?.cwd))).toBe(work);
		}
	});

	for (const cwd of ["skill://tdd", "local://notes", "local:/notes", "artifact://12"]) {
		test(`a cwd holding an internal URL is refused, never wrapped: ${cwd}`, async () => {
			const r = await fencedInput({ command: "true", cwd }, session, env);
			expect({ block: r?.block, input: r?.input, why: r?.reason?.includes("internal URL") }).toEqual({ block: true, input: undefined, why: true });
		});
	}

	test("a nonexistent cwd is refused, never wrapped", async () => {
		const r = await fencedInput({ command: "true", cwd: join(session, "no-such-dir") }, session, env);
		expect({ block: r?.block, input: r?.input, why: r?.reason?.includes("is not an existing directory") }).toEqual({ block: true, input: undefined, why: true });
	});

	// Machine-local: the host's own resolver, where OMP is installed (skipped visibly on a fresh clone,
	// so it is imported dynamically: a static import of this absolute path would fail the whole file there).
	const PATH_UTILS = "/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/tools/path-utils.ts";
	test.skipIf(!existsSync(PATH_UTILS))("parity: every cwd the fence accepts is the directory OMP's resolveToCwd picks", async () => {
		const { resolveToCwd } = (await import(PATH_UTILS)) as { resolveToCwd(p: string, cwd: string): string };
		mkdirSync(join(session, "sub"), { recursive: true });
		const sub = join(session, "sub");
		const spellings = ["sub", "./sub", "sub/", `../${basename(session)}/sub`, sub, `${sub}/`, "//", "/", "~", `~/${relative(homedir(), sub)}`, `~${relative(homedir(), sub)}`];
		const got = await Promise.all(spellings.map(async (cwd) => [cwd, (await fencedInput({ command: "true", cwd }, session, env))?.input?.cwd]));
		expect(got).toEqual(spellings.map((cwd) => [cwd, resolveToCwd(cwd, session)]));
	});
});

describe("a ledger file symlinked out of the configured directory is fenced where it resolves (M4b review B2)", () => {
	const home = tmp("fence-reloc-home");
	const env = { HOME: home, PATH: process.env.PATH };
	const configured = join(home, ".agent-system-2");
	const real = join(home, "relocated-ledger");
	const db = join(real, "ledger.db");
	const link = join(configured, "ledger.db");
	const outside = tmp("fence-reloc-outside");
	let live: Database;
	beforeAll(() => {
		mkdirSync(configured);
		mkdirSync(real);
		live = new Database(db);
		live.exec("PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0; CREATE TABLE probe (x); INSERT INTO probe VALUES (1);");
		symlinkSync(db, link);
	});
	afterAll(() => live.close());

	for (const target of [db, `${db}-wal`, `${db}-shm`]) {
		test(`touch ${basename(target)} at its real path: refused`, async () => {
			expect(existsSync(target)).toBe(true);
			const before = statSync(target).mtimeMs;
			const r = sh(await wrapped(`touch ${target}`, outside, env), outside);
			expect({ code: r.code, denied: r.err.includes("Operation not permitted"), mtime: statSync(target).mtimeMs }).toEqual({ code: 1, denied: true, mtime: before });
		});
	}

	test("a sqlite3 insert through the configured symlink is refused and the rows are unchanged", async () => {
		const r = sh(await wrapped(`sqlite3 ${link} 'INSERT INTO probe VALUES (2)'`, outside, env), outside);
		expect(r.code).not.toBe(0);
		expect(live.query("select x from probe order by x").all()).toEqual([{ x: 1 }]);
	});

	test("control: sqlite3 -readonly through the symlink still reads the live WAL database", async () => {
		const r = sh(await wrapped(`sqlite3 -readonly ${link} 'select count(*) from probe'`, outside, env), outside);
		expect({ code: r.code, out: r.out.trim() }).toEqual({ code: 0, out: "1" });
	});
});

describe("a bare repository's hooks are fenced, and only its hooks (M4b review B3)", () => {
	const env = { HOME: tmp("fence-bare-home"), PATH: process.env.PATH };
	let bare = "";
	beforeAll(() => {
		bare = repoWithOrigin().origin; // a bare repository with one pushed commit
	});

	test("a hook write from inside the bare repository is refused", async () => {
		const r = sh(await wrapped("touch hooks/bare-write", bare, env), bare);
		expect({ code: r.code, denied: r.err.includes("Operation not permitted"), exists: existsSync(join(bare, "hooks", "bare-write")) }).toEqual({ code: 1, denied: true, exists: false });
	});

	test("from a directory inside it (refs/heads) the same hooks are fenced", async () => {
		const r = sh(await wrapped("touch ../../hooks/nested-write", join(bare, "refs", "heads"), env), join(bare, "refs", "heads"));
		expect({ code: r.code, exists: existsSync(join(bare, "hooks", "nested-write")) }).toEqual({ code: 1, exists: false });
	});

	test("control: git log in it succeeds, and a write elsewhere in it is not fenced", async () => {
		const log = sh(await wrapped("git log --oneline -1", bare, env), bare);
		expect({ code: log.code, one: log.out.trim().split("\n").length }).toEqual({ code: 0, one: 1 });
		const other = sh(await wrapped("touch not-hooks.txt", bare, env), bare);
		expect({ code: other.code, exists: existsSync(join(bare, "not-hooks.txt")) }).toEqual({ code: 0, exists: true });
	});
});

describe("the bypass guard compares what bash executes, not the bytes around it", () => {
	function bound() {
		const home = tmp("fence-ws");
		const l = Ledger.open(join(home, ".agent-system-2", "ledger.db"), { create: true, backup: false, backupOnOpen: false });
		const wl = l.openWorkload({ by: "orch", brief: "b", stakes: "normal", mode: "autonomous" });
		const env = { HOME: home, PATH: process.env.PATH, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-ws" };
		const f = fakePi();
		registerFence(f.pi, env, async () => ON);
		return { f, l, wl, home, ctx: ctxOf(home) };
	}

	test("outer spaces, tabs and a trailing newline, on the command or around the wrapper, run fenced: no bypass row, no lockout", async () => {
		const { f, l, wl, home, ctx } = bound();
		const pads: [string, (w: string) => string][] = [
			["as returned", (w) => w],
			["padded with spaces", (w) => `  ${w}  `],
			["a trailing newline", (w) => `${w}\n`],
			["leading newline and tab", (w) => `\n\t${w}`],
		];
		let i = 0;
		for (const command of ["  echo ws  ", "\techo ws\n", "echo ws\n"]) {
			for (const [name, pad] of pads) {
				const id = `ws${++i}`;
				const r = await f.emit("tool_call", { toolName: "bash", toolCallId: id, input: { command } }, ctx);
				const executing = pad(String(r?.input?.command));
				await f.emit("tool_execution_start", { toolName: "bash", toolCallId: id, args: { ...r!.input, command: executing } }, ctx);
				const ran = sh(executing, home);
				expect({ name, code: ran.code, out: ran.out, fenced: executing.includes("sandbox-exec") }).toEqual({ name, code: 0, out: "ws\n", fenced: true });
			}
		}
		expect(l.entries(wl, "assumption")).toEqual([]);
		expect(String((await f.emit("tool_call", { toolName: "bash", toolCallId: "ws-next", input: { command: "true" } }, ctx))?.input?.command)).toContain("sandbox-exec");
		l.close();
	});

	test("a genuinely unwrapped execution (the padded original) still trips it", async () => {
		const { f, l, wl, ctx } = bound();
		const input = { command: "  echo ws  " };
		await f.emit("tool_call", { toolName: "bash", toolCallId: "u1", input }, ctx);
		await f.emit("tool_execution_start", { toolName: "bash", toolCallId: "u1", args: input }, ctx);
		expect(l.entries(wl, "assumption").map((e) => e.body)).toEqual([fenceBypassBody("u1")]);
		expect((await f.emit("tool_call", { toolName: "bash", toolCallId: "u2", input: { command: "true" } }, ctx))?.block).toBe(true);
		l.close();
	});
});

describe("the host settings reach the fence only through the reader it is handed", () => {
	const host = (autoBackground: unknown, fence?: unknown) => ({
		getGlobalSettings: () => (fence === undefined ? {} : { gates: { fence: { enabled: fence } } }),
		get: (key: string) => (key === "bash.autoBackground.enabled" ? autoBackground : undefined),
	});

	test("the live instance wins over the disk read: live auto-background false refuses even when disk says true", async () => {
		let diskReads = 0;
		const Settings = {
			current: host(false),
			loadReadOnly: async () => {
				diskReads++;
				return host(true);
			},
		};
		const d = tmp("fence-live");
		const f = fakePi();
		registerFence(f.pi, { HOME: d, PATH: process.env.PATH }, (ctx) => fenceSettingsFrom(Settings, ctx));
		const r = await f.emit("tool_call", { toolName: "bash", toolCallId: "live1", input: { command: "true" } }, ctxOf(d));
		expect({ block: r?.block, why: r?.reason?.includes("bash.autoBackground.enabled is false"), diskReads }).toEqual({ block: true, why: true, diskReads: 0 });
	});

	test("with no live instance the disk read decides, from the call's cwd", async () => {
		const cwds: string[] = [];
		const Settings = {
			loadReadOnly: async ({ cwd }: { cwd: string }) => {
				cwds.push(cwd);
				return host(true, false);
			},
		};
		const d = tmp("fence-disk");
		expect({ got: await fenceSettingsFrom(Settings, ctxOf(d)), cwds }).toEqual({ got: { enabled: false, autoBackground: true }, cwds: [d] });
	});

	test("registered with no reader, every bash call is refused with the reason named", async () => {
		const f = fakePi();
		registerFence(f.pi, { HOME: tmp("fence-noreader-home"), PATH: process.env.PATH });
		const r = await f.emit("tool_call", { toolName: "bash", toolCallId: "nr1", input: { command: "true" } }, ctxOf(tmp("fence-noreader-cwd")));
		expect({ block: r?.block, why: r?.reason?.includes("no host settings reader was handed to the fence") }).toEqual({ block: true, why: true });
	});
});

describe("the flag: gates.fence.enabled false", () => {
	test("runs bash unwrapped and writes one ledger entry saying so", async () => {
		const home = tmp("fence-off");
		const db = join(home, ".agent-system-2", "ledger.db");
		const l = Ledger.open(db, { create: true, backup: false, backupOnOpen: false });
		const wl = l.openWorkload({ by: "orch", brief: "b", stakes: "normal", mode: "autonomous" });
		const env = { HOME: home, PATH: process.env.PATH, AGENT_SYSTEM_WORKLOAD_ID: wl, AGENT_SYSTEM_LANE_ID: "lane-off" };
		const f = fakePi();
		registerFence(f.pi, env, async () => ({ enabled: false, autoBackground: true }));
		const ctx = ctxOf(home);
		for (const command of ["echo one", "echo two"]) {
			expect(await f.emit("tool_call", { toolName: "bash", toolCallId: command, input: { command } }, ctx)).toBeUndefined();
		}
		const rows = l.entries(wl, "assumption");
		expect(rows.map((r) => [r.body, r.created_by])).toEqual([[FENCE_OFF_BODY, "lane-off"]]);
		l.close();
	});
});

describe("rows 3 and 8 read the original command, not the wrapper", () => {
	test("a wrapped `git fetch && git rebase origin/main` still mints rebase evidence and a receipt", async () => {
		const r = repoWithOrigin();
		git(r.work, "switch", "-q", "-c", "feat");
		commit(r.work, "f.txt", "f\n");
		advanceOriginMain(r.root, r.origin);
		const env = { HOME: tmp("fence-r8-home"), PATH: process.env.PATH, ...RUN_ENV };
		const f = fakePi();
		p11Gates(f.pi, env, async () => ON);
		const ctx = ctxOf(r.work);
		const push = { toolName: "bash", toolCallId: "push-1", input: { command: "git push origin feat" } };
		expect((await f.emit("tool_call", push, ctx))?.reason).toContain("origin/main");

		const original = "git fetch origin && git rebase origin/main";
		const call = await f.emit("tool_call", { toolName: "bash", toolCallId: "rb-1", input: { command: original } }, ctx);
		const revised = String(call?.input?.command);
		expect(revised).toContain("sandbox-exec");
		const ran = sh(revised, r.work, env);
		expect(ran.code).toBe(0);
		await f.emit("tool_result", { toolName: "bash", toolCallId: "rb-1", input: call!.input!, details: {}, isError: false }, ctx);

		const s = gateSession(ctx as never, env);
		expect(s.history.at(-1)).toEqual({ kind: "bash", command: original, exitCode: 0 });
		expect(s.bashOriginals.size).toBe(0);
		const after = await f.emit("tool_call", { ...push, toolCallId: "push-2" }, ctx);
		expect(after?.block).toBeUndefined();
		expect(String(after?.input?.command)).toContain("git push origin feat");
	});
});

describe("known-open door: the eval tool's subprocesses are NOT under the fence", () => {
	test("an eval Bun.$ write into a fenced directory succeeds, and the fence does not touch eval calls", async () => {
		const home = tmp("fence-eval");
		const dir = join(home, ".agent-system-2");
		mkdirSync(dir);
		const env = { HOME: home, PATH: process.env.PATH };
		// The same directory is refused to a fenced bash call …
		expect(sh(await wrapped(`touch ${dir}/from-bash`, home, env), home).code).not.toBe(0);
		// … but an eval call passes through the fence unrevised, and its subprocess writes there.
		const f = fakePi();
		registerFence(f.pi, env, async () => ON);
		const code = `await Bun.$\`touch ${dir}/from-eval\``;
		expect(await f.emit("tool_call", { toolName: "eval", toolCallId: "e1", input: { language: "js", code } }, ctxOf(home))).toBeUndefined();
		await Bun.$`touch ${dir}/from-eval`;
		expect(existsSync(join(dir, "from-eval"))).toBe(true);
		expect(existsSync(join(dir, "from-bash"))).toBe(false);
	});
});

// The 181 real read-only git commands (M4b step 1's list, from Jo's shell history and agent
// transcripts). Machine-local evidence: the test is skipped, visibly, where the list is absent.
const HISTORY = process.env.M4B_HISTORY_LIST ?? "/Users/jowolff/agent-scratch/agent-system-2.0/migration/M4b/step1/scripts/history-all.json";
describe.skipIf(!existsSync(HISTORY))("the 181 real read-only commands", () => {
	let clone = "";
	beforeAll(() => {
		clone = join(tmp("fence-replay"), "repo");
		git(tmp("fence-replay-src"), "clone", "-q", join(import.meta.dir, "..", ".."), clone);
	});
	test("pass every gate row, and run wrapped with the same exit code as unwrapped", async () => {
		const cmds = JSON.parse(readFileSync(HISTORY, "utf8")) as string[];
		expect(cmds.length).toBe(181);
		const env = { ...RUN_ENV, HOME: process.env.HOME };
		const f = fakePi();
		p11Gates(f.pi, env, async () => ON);
		const ctx = ctxOf(clone);
		const refused: string[] = [];
		const changed: string[] = [];
		for (const [i, command] of cmds.entries()) {
			const r = await f.emit("tool_call", { toolName: "bash", toolCallId: `h${i}`, input: { command } }, ctx);
			if (!r?.input || r.block) {
				refused.push(`${command}: ${r?.reason}`);
				continue;
			}
			const plain = sh(command, clone, env).code;
			const wrappedCode = sh(String(r.input.command), clone, env).code;
			if (plain !== wrappedCode) changed.push(`${command}: ${plain} → ${wrappedCode}`);
		}
		expect({ refused, changed }).toEqual({ refused: [], changed: [] });
	}, 300_000);
});
