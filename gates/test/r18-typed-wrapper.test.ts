// P-11 row 18 (gates/src/rows/r18-typed-wrapper.ts) through the whole gate chain: p11Gates over a
// fake runner that chains handlers the way OMP's does (runner.ts emitToolCall), with the real fence.
// Pure: nothing is spawned (sandboxExecPath resolves a path and runs nothing), so it runs inside a
// lane's own fence; the real-execution half is r18-typed-wrapper-exec.test.ts. It imports only what
// origin/main already exported before row 18, so the plan's fails-before run can load it there
// (PLAN.md revision 4 § 4, workload wl-mv4enu3823jb7k).
import { describe, expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import p11Gates from "../index";
import { type FenceSettings, fenceProfile, sandboxExecPath, wrapCommand } from "../src/fence";
import { type GatesAPI, gateSession } from "../src/session";
import { tmp } from "./helpers";

type AnyHandler = (event: Record<string, unknown>, ctx: unknown) => unknown;
type Revised = { block?: boolean; reason?: string; input?: Record<string, unknown>; additionalContext?: string } | undefined;

const ON: FenceSettings = { enabled: true, autoBackground: true };

/** A fake OMP extension API chaining handlers the way the runner does: every handler gets the same original event, the first block returns, otherwise the last result wins. */
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

/** The gates over one session run from a fresh temp home (outside any repository), as a lane or as a hand. */
function session(opts: { role?: "lane" | "hand"; settings?: FenceSettings } = {}) {
	const home = tmp("r18-home");
	const env = { HOME: home, PATH: process.env.PATH };
	const f = fakePi();
	p11Gates(f.pi, env, async () => opts.settings ?? ON);
	const notices: string[] = [];
	const hand = opts.role === "hand";
	const ctx = {
		hasUI: !hand,
		cwd: home,
		sessionManager: { getHeader: () => (hand ? { parentSession: "parent" } : null), getEntries: () => [] },
		ui: { notify: (m: string) => notices.push(m) },
	};
	let n = 0;
	const call = (command: string, id = `r18-${++n}`) => f.emit("tool_call", { toolName: "bash", toolCallId: id, input: { command } }, ctx);
	const exe = sandboxExecPath(env);
	if (!exe) throw new Error("sandbox-exec is not on PATH");
	// The profile the fence writes for a call from `home`: only the default ledger directory is fenced there.
	const profile = fenceProfile([{ kind: "subpath", path: `${realpathSync(home)}/.agent-system-2` }]);
	/** The fence's own wrapper around `command`, as it revises a bare call from this session. */
	const own = (command: string) => wrapCommand(exe, profile, command);
	return { f, env, ctx, home, notices, call, own };
}

const ROW18 = "P-11 row 18 refused this";
const FORM1 = (inner: string) =>
	`P-11 row 18 refused this: the command you typed starts with the M4b OS fence's own wrapper (sandbox-exec, its -p profile and /bin/bash -c). The fence adds that wrapper itself, after the gates. Resend the bare command: ${inner}`;
const FORM2 = (what: string) =>
	`P-11 row 18 refused this: the command you typed starts with ${what}. The fence runs every bash call under its own Seatbelt profile, and a wrapper or profile of your own is not accepted. Resend the bare command, without sandbox-exec, a -p profile or /bin/bash -c.`;

// Lane 11 of item 24's workload (wl-muraerdsgw7gn4), 2026-10-09T03:00:09Z, call
// toolu_01KsVV6tAzk3qkxjnfEnkpLP, as the model wrote it: the fence's wrapper from its `git fetch
// origin` call one turn earlier, copied around the next command (gates/test/fence.test.ts).
const LANE_11_COMMAND = `'/usr/bin/sandbox-exec' -p '(version 1)(allow default)(deny file-write* (subpath "/Users/jowolff/.agent-system-2"))(deny file-write* (literal "/Users/jowolff/code/agent-system-2.0-lanes/wl-muraerdsgw7gn4/.git"))(deny file-write* (subpath "/Users/jowolff/code/agent-system-2.0/.git/hooks"))' /bin/bash -c 'git rebase origin/main'`;

/** A refusal by row 18 that says to resend the bare command. */
const row18 = { block: true, reason: expect.stringMatching(/^P-11 row 18 refused this[^]*Resend the bare command/) };

describe("T1: a typed wrapper is refused by row 18, which says to resend the bare command", () => {
	test("the fence's own wrapper, lane 11's recorded copy, a quote-split head, and the W2 and W3 shapes", async () => {
		const s = session();
		for (const command of [
			s.own("printf one"),
			LANE_11_COMMAND,
			"sand''box-exec -p '(version 1)(allow default)' /bin/bash -c 'printf one'",
			"-p '(version 1)(allow default)' /bin/bash -c 'printf one'",
			"/bin/bash -c 'printf one'",
		]) {
			expect({ command, r: await s.call(command) }).toEqual({ command, r: row18 });
		}
		expect(s.f.entries.filter((e) => e.type === "p11-fence-bypassed")).toEqual([]);
	});

	test("every role and the fence off: a hand gets the same refusal, and so does a lane whose fence is off", async () => {
		for (const s of [session({ role: "hand" }), session({ settings: { enabled: false, autoBackground: true } })]) {
			expect(await s.call(s.own("printf one"))).toEqual({ block: true, reason: FORM1("printf one") });
		}
	});
});

describe("T2: a bare command gets the fence's revision and runs as before", () => {
	for (const bare of ["printf one", "git status"]) {
		test(`${bare}: revised to the fence's wrapper, no bypass at execution start, nothing from tool_result`, async () => {
			const s = session();
			const r = await s.call(bare, "t2");
			expect(r).toEqual({ input: { command: s.own(bare) } });
			expect(gateSession(s.ctx as never, s.env).bashOriginals.get("t2")).toBe(bare);
			await s.f.emit("tool_execution_start", { toolName: "bash", toolCallId: "t2", args: r!.input }, s.ctx);
			expect(s.notices).toEqual([]);
			expect(s.f.entries.filter((e) => e.type === "p11-fence-bypassed")).toEqual([]);
			expect(await s.f.emit("tool_result", { toolName: "bash", toolCallId: "t2", input: r!.input!, details: { exitCode: 0 }, isError: false }, s.ctx)).toBeUndefined();
			expect(gateSession(s.ctx as never, s.env).bashOriginals.has("t2")).toBe(false);
			// The session is not locked out: the next bare call is revised too.
			expect(await s.call(bare)).toEqual({ input: { command: s.own(bare) } });
		});
	}
});

describe("T3: sandbox-exec and /bin/bash -c as quoted data pass", () => {
	test("grep, git log --grep, a heredoc body and an echo are each revised to the fence's wrapper", async () => {
		const s = session();
		const file = join(s.home, "notes.txt");
		writeFileSync(file, "the fence adds sandbox-exec itself\n");
		for (const command of [
			`grep -n 'sandbox-exec' ${file}`,
			"git log --grep 'sandbox-exec'",
			"cat <<'EOF'\n'/usr/bin/sandbox-exec' -p '(version 1)(allow default)' /bin/bash -c 'printf one'\nEOF",
			'echo "/bin/bash -c x"',
		]) {
			expect({ command, r: await s.call(command) }).toEqual({ command, r: { input: { command: s.own(command) } } });
		}
	});
});

describe("T4 and T5: not leading, so not row 18's; another row still refuses", () => {
	test("T4: `printf x | bash -c cat` is row 6's refusal", async () => {
		expect((await session().call("printf x | bash -c cat"))?.reason).toStartWith("P-11 row 6");
	});

	test("T5: `cd /tmp && sandbox-exec …` is refused, not by row 18", async () => {
		const r = await session().call("cd /tmp && sandbox-exec -p '(version 1)(allow default)' /bin/true");
		expect(r?.block).toBe(true);
		expect(r?.reason).not.toStartWith(ROW18);
	});
});

describe("T6: broken and disguised copies", () => {
	test("refused by row 18: quote-split, assigned, unterminated, after a comment line, with a CR inside, and the profile alone", async () => {
		const s = session();
		for (const command of [
			"sand''box-exec -p 'unterminated",
			"X=1 sandbox-exec -p 'unterminated",
			"/bin/bash '-c' 'unterminated",
			`# note\n${s.own("printf one")}`,
			s.own("printf 'a\rb' | od -c"),
			"-p '(version 1)(allow default)' /bin/bash -c x",
			"(version 1)(allow default)",
			// A backslash-newline vanishes as bash removes it: between bash and -c, inside an assignment
			// name, and before the head (CODE-REVIEW-r1-openai.md, workload wl-mv4enu3823jb7k).
			"/bin/bash \\\n  -c true",
			"X\\\n=1 /bin/bash -c true",
			"\\\n  /bin/bash -c true",
			"sandbox-exec \\\n  -p x /bin/true",
			"X\\\n=1 sandbox-exec -p x /bin/true",
			"\\\n  sandbox-exec -p x /bin/true",
			// Append and array assignments, as bash defines them (CODE-REVIEW-r1-kimi.md).
			"X+=1 sandbox-exec -p x /bin/true",
			"a[i]=1 sandbox-exec -p x /bin/true",
		]) {
			expect({ command, r: await s.call(command) }).toEqual({ command, r: row18 });
		}
		// The carriage return is kept in the command to resend, as bash reads it.
		expect((await s.call(s.own("printf 'a\rb' | od -c")))?.reason).toEndWith("Resend the bare command: printf 'a\rb' | od -c");
	});

	test("not refused by row 18 (another row may refuse): a longer name, an expanded head, a quoted assignment, -c on the next line", async () => {
		const s = session();
		for (const command of ["not-sandbox-exec 'unterminated", "bashful -c x", '"$(echo sandbox-exec)" -p x /bin/true', "'X=1' /bin/bash -c x", "/bin/bash\n-c x"]) {
			const r = await s.call(command);
			expect({ command, row18: r?.reason?.startsWith(ROW18) ?? false }).toEqual({ command, row18: false });
		}
	});

	test("a continuation in a bare command and an append assignment before one pass row 18 and are revised to the fence's wrapper", async () => {
		const s = session();
		for (const command of ["printf a\\\n b", "X+=1 printf one"]) {
			expect({ command, r: await s.call(command) }).toEqual({ command, r: { input: { command: s.own(command) } } });
		}
	});
});

describe("T7: the two message forms, chosen by shape", () => {
	test("form 1 names the inner command: the fence's own wrapper, and a six-word copy with a profile of the model's own", async () => {
		const s = session();
		expect((await s.call(s.own("printf one")))?.reason).toBe(FORM1("printf one"));
		expect((await s.call(wrapCommand("/usr/bin/sandbox-exec", "(version 1)(allow default)", "printf one")))?.reason).toBe(FORM1("printf one"));
		expect((await s.call(LANE_11_COMMAND))?.reason).toBe(FORM1("git rebase origin/main"));
	});

	test("form 2 for every other match, naming what the command starts with", async () => {
		const s = session();
		expect((await s.call("sandbox-exec -p '(version 1)(allow default)' /bin/true"))?.reason).toBe(FORM2("sandbox-exec"));
		expect((await s.call("-p '(version 1)(allow default)' /bin/bash -c x"))?.reason).toBe(FORM2("a Seatbelt -p profile"));
		expect((await s.call("/bin/bash -c 'printf one'"))?.reason).toBe(FORM2("/bin/bash -c"));
	});
});
