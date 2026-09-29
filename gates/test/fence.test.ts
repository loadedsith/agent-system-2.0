// M4b step 3: the OS fence (gates/src/fence.ts). Sandboxed writes to the configured ledger and to a
// repo's .git/hooks and .git/config are refused by the OS, not by a parser: each case runs the
// command the fence revised a bash call into, for real, under /bin/bash. Also: the ledger module
// still writes in-process; `sqlite3 -readonly` reads a live WAL ledger from inside the sandbox; the
// wrapper leaves quoting alone; every fail-closed path refuses; the flag turns the fence off and
// says so in the ledger; rows 3 and 8 read the original command; the eval subprocess is NOT fenced.
import { beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { Ledger } from "../../ledger/src/index";
import p11Gates from "../index";
import { FENCE_OFF_BODY, type FenceSettings, registerFence } from "../src/fence";
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
	return { pi: pi as unknown as GatesAPI, emit, entries };
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

describe("the fence refuses sandboxed writes to .git/hooks and .git/config", () => {
	const env = { HOME: tmp("fence-git-home"), PATH: process.env.PATH };
	let work = "";
	let wt = "";
	beforeAll(() => {
		work = repoWithOrigin().work;
		wt = join(tmp("fence-wt"), "wt");
		git(work, "worktree", "add", "-q", "--detach", wt);
	});

	const gitCases: [string, (repo: string) => string][] = [
		["hooks/pre-commit by redirect", () => "echo 'exit 0' > .git/hooks/pre-commit; chmod +x .git/hooks/pre-commit"],
		["config by git config", () => "git config core.hooksPath /tmp/elsewhere"],
		["config by redirect", () => "printf '[alias]\\n\\tx = !sh\\n' >> .git/config"],
		["config by git -C from another directory", (repo) => `cd / && git -C ${repo} config alias.y '!sh'`],
		["the .git entry renamed aside", () => "mv .git .git-aside"],
	];
	for (const [name, cmd] of gitCases) {
		test(`${name}: non-zero or unwritten, repository metadata unchanged`, async () => {
			const before = snapshot(join(work, ".git"));
			const beforeCfg = readFileSync(join(work, ".git", "config"), "utf8");
			const r = sh(await wrapped(cmd(work), work, env), work);
			expect(r.err).toContain("Operation not permitted");
			expect(existsSync(join(work, ".git", "hooks", "pre-commit"))).toBe(false);
			expect(readFileSync(join(work, ".git", "config"), "utf8")).toBe(beforeCfg);
			expect(snapshot(join(work, ".git")).split("\n").filter((l) => /hooks|config/.test(l))).toEqual(before.split("\n").filter((l) => /hooks|config/.test(l)));
		});
	}

	test("a worktree whose .git is a file: the common hooks and config, and its config.worktree, are fenced", async () => {
		expect(statSync(join(wt, ".git")).isFile()).toBe(true);
		const common = join(work, ".git");
		const cfg = readFileSync(join(common, "config"), "utf8");
		const r1 = sh(await wrapped(`echo 'exit 0' > "$(git rev-parse --git-common-dir)/hooks/pre-commit"`, wt, env), wt);
		const r2 = sh(await wrapped("git config alias.z '!sh'", wt, env), wt);
		const r3 = sh(await wrapped(`echo '[core]' > "$(git rev-parse --git-dir)/config.worktree"`, wt, env), wt);
		const r4 = sh(await wrapped("echo 'gitdir: /tmp/forged' > .git", wt, env), wt);
		for (const r of [r1, r2, r3, r4]) expect(r.err).toContain("Operation not permitted");
		expect(existsSync(join(common, "hooks", "pre-commit"))).toBe(false);
		expect(readFileSync(join(common, "config"), "utf8")).toBe(cfg);
		expect(readFileSync(join(wt, ".git"), "utf8")).toStartWith("gitdir: ");
	});

	test("control: ordinary git work inside the fence succeeds (commit, branch, fetch)", async () => {
		const r = sh(await wrapped("git switch -q -c fence-ctl && git commit -q --allow-empty -m fenced && git fetch -q origin && git log --oneline -1", work, env), work);
		expect({ code: r.code, out: r.out.trim().endsWith("fenced") }).toEqual({ code: 0, out: true });
	});
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
