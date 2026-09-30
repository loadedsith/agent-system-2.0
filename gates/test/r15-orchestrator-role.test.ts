// P-11 row 15 (gates/extensions/r15-orchestrator-role.ts) driven through a fake OMP extension API:
// on the orchestrator session the lane's tools are refused with the one-line reason; reads, the
// read-only bash forms rows 6 and 10 already model, and the surface's ledger tools pass; a lane and a
// hand see every one of the same calls untouched.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../../surface/index";
import { SURFACE_TOOLS } from "../../surface/src/types";
import { ctxOf, fakePi } from "../../surface/test/helpers";
import orchestratorRoleRow from "../extensions/r15-orchestrator-role";
import type { GatesAPI } from "../index";
import { answerFirstRefusal, ORCHESTRATOR_ROLE_REFUSAL, readOnlyBash } from "../src/rows/r15-orchestrator-role";
import { tmp } from "./helpers";

type AnyHandler = (event: unknown, ctx: unknown) => unknown;

/** Only `tool_call` matters to this row; first block wins, as in runner.ts emitToolCall. */
function session(kind: "orchestrator" | "lane" | "hand") {
	const handlers: AnyHandler[] = [];
	const pi = { on: (name: string, h: AnyHandler) => name === "tool_call" && handlers.push(h) } as unknown as GatesAPI;
	const env = { HOME: "/nonexistent-home", ...(kind === "lane" ? {} : { AGENT_SYSTEM_ROLE: "orchestrator" }) };
	orchestratorRoleRow(pi, env);
	const ctx = {
		hasUI: kind !== "hand",
		cwd: tmp("r15-cwd"),
		sessionManager: { getHeader: () => (kind === "hand" ? { parentSession: "/sessions/lane.jsonl" } : null), getEntries: () => [] },
		ui: { notify: () => {} },
	};
	return async (toolName: string, input: Record<string, unknown>) => {
		for (const h of handlers) {
			const r = (await h({ toolName, toolCallId: "call-1", input }, ctx)) as { block?: boolean; reason?: string } | undefined;
			if (r?.block) return r;
		}
		return undefined;
	};
}

const REFUSED: [string, Record<string, unknown>][] = [
	["edit", { path: "gates/index.ts", edits: [] }],
	["ast_edit", { paths: ["gates/src"], ops: [] }],
	["write", { path: "gates/new.ts", content: "x" }],
	["write", { path: "xd://ast_edit", content: "{}" }],
	["write", { path: "xd://report_issue", content: "x" }],
	["write", { path: "agent://Main", content: "go" }],
	["task", { tasks: [{ agent: "standard", task: "do it" }] }],
	["eval", { language: "py", code: "print(1)" }],
	["bash", { command: "git worktree add ../wt -b feat" }],
	["bash", { command: "git commit -m x" }],
	["bash", { command: "git push -u origin feat" }],
	["bash", { command: "gh pr create --fill" }],
	["bash", { command: "git fetch origin" }], // a git form lanes may run, but not a read
	["bash", { command: "git stash" }], // stash push, not stash list
	["bash", { command: "git stash pop" }],
	["bash", { command: "git branch feat" }], // branch creation
	["bash", { command: "git branch -m old new" }],
	["bash", { command: "git branch -u origin/feat" }],
	["bash", { command: "git branch -D feat" }],
	["bash", { command: "git remote add fork https://example.invalid/r.git" }],
	["bash", { command: "git worktree add ../wt feat" }],
	["bash", { command: "git diff --ext-diff" }], // runs the external diff helper
	["bash", { command: "git show --show-signature HEAD" }], // runs gpg
	["bash", { command: "git log --output=log.txt" }], // writes a file
	["bash", { command: "git log --bogus-option" }], // an option git does not list
	["bash", { command: "git -c core.pager=less log" }], // a -c key gitUnmodeled refuses
	["bash", { command: "git diff > change.patch" }], // a write destination
	["bash", { command: "/bin/ls" }], // path-qualified command name
	["bash", { command: "touch x" }],
	["bash", { command: "ls > listing.txt" }], // a write destination
	["bash", { command: "cat notes | tee copy" }],
	["bash", { command: "ls $(touch y)" }], // a substitution runs a writer
	["bash", { command: "FOO=1 ls" }], // an assignment reaches the command's environment
	["bash", { command: "ls", env: { DYLD_INSERT_LIBRARIES: "/tmp/x.dylib" } }],
	["bash", { command: "sudo cat /etc/hosts" }], // a wrapper
	["bash", { command: "cd $DIR && ls" }], // cd to a directory known only when it runs
	["bash", { command: "ls 2>$ERR" }], // a redirect target known only when it runs
	["bash", { command: "ls > /dev/nullx" }], // not /dev/null
	["bash", { command: "bun -e 'console.log(1)'" }], // inline code
	["bash", { command: "file -C -m magic" }], // a read head's documented output option
	["bash", { command: "cat --output=x notes" }], // an undocumented output option
	["bash", { command: "$CMD notes" }], // a name known only when it runs
	["bash", { command: "cat 'notes" }], // unparseable (unterminated quote): blind
	["bash", { command: "cat notes | sh" }], // a shell reading piped commands
	// M7 fix round 2: the search and filter kin stay refused in their write and run forms.
	["bash", { command: "awk '{print $1}' notes > out.txt" }], // shell redirection into a file
	["bash", { command: "awk '{print $1 > \"out.txt\"}' notes" }], // awk's own output redirection
	["bash", { command: "awk '{print | \"sh\"}' notes" }], // awk piping into a command
	["bash", { command: "awk 'BEGIN{system(\"touch x\")}'" }], // awk running a command
	["bash", { command: "awk -f prog.awk notes" }], // a program the gate cannot read
	["bash", { command: "find . -name '*.tmp' -delete" }],
	["bash", { command: "find . -exec rm {} ';'" }],
	["bash", { command: "find . -fprint list.txt" }],
	["bash", { command: "find $DIR -name x" }], // a word known only when it runs
	["bash", { command: "sort -o sorted.txt notes" }],
	["bash", { command: "sort --output=sorted.txt notes" }],
	["bash", { command: "sort --compress-program=gzip notes" }],
	["bash", { command: "uniq notes deduped.txt" }], // uniq's second operand is its output file
	["bash", { command: "rg --pre ./conv pattern" }],
	["bash", { command: "rg -z pattern" }],
	["bash", { command: "grep -r foo . > hits.txt" }],
	["bash", { command: "cut -d: -f1 /etc/passwd | tee users" }],
	["bash", { command: "git -C /tmp ls-files --bogus" }], // an option ls-files does not list
	["bash", { command: "git blame --bogus README.md" }],
	["bash", { command: "" }],
];

const ALLOWED: [string, Record<string, unknown>][] = [
	["read", { path: "gates/index.ts" }],
	["grep", { pattern: "row", path: "gates" }],
	["find", { query: "row 6", grep_keywords: [] }],
	["glob", { path: "gates/**" }],
	["ls", { path: "gates" }],
	["bash", { command: "ls -la gates" }],
	["bash", { command: "cat gates/index.ts | wc -l" }],
	["bash", { command: "head -n 5 README.md; tail -n 5 README.md" }],
	["bash", { command: "[ -f README.md ] && echo yes" }],
	["bash", { command: "diff a.txt b.txt", cwd: "gates" }],
	["bash", { command: "git status" }],
	["bash", { command: "git status --short --branch" }],
	["bash", { command: "git log --oneline -5" }],
	["bash", { command: "git diff HEAD~1 --stat" }],
	["bash", { command: "git show HEAD" }],
	["bash", { command: "git rev-parse --show-toplevel" }],
	["bash", { command: "git branch" }],
	["bash", { command: "git branch -a -v" }],
	["bash", { command: "git branch --list 'feat*'" }],
	["bash", { command: "git branch --contains HEAD" }], // --contains takes HEAD as its value: list mode
	["bash", { command: "git branch --show-current" }],
	["bash", { command: "git remote -v" }],
	["bash", { command: "git worktree list" }],
	["bash", { command: "cd gates && ls" }],
	["bash", { command: "cd /tmp && git status" }],
	["bash", { command: "cat notes 2>/dev/null" }],
	["bash", { command: "git log --oneline -3 2>/dev/null | head -n 1" }],
	// M7 fix round 2, finding A: Ilex's exact command on the orchestrator (05:03:03), refused before
	// because `git ls-files` was not a gitReads subcommand and `grep` sat in no read table.
	["bash", { command: "ls -a /Users/jowolff/code/agent-system-2.0 && git -C /Users/jowolff/code/agent-system-2.0 ls-files | grep -i read" }],
	["bash", { command: "git ls-files" }],
	["bash", { command: "git ls-files --others --exclude-standard" }],
	["bash", { command: "git blame -L 1,10 README.md" }],
	["bash", { command: "git describe --tags --always" }],
	["bash", { command: "git stash list" }],
	["bash", { command: "grep -rn 'row 15' gates" }],
	["bash", { command: "egrep -i 'a|b' notes" }],
	["bash", { command: "rg -n -g '*.ts' checkOrchestratorRole gates" }],
	["bash", { command: "rg -e -z notes" }], // -e takes -z as its pattern
	["bash", { command: "find gates -name '*.ts' -type f" }],
	["bash", { command: "cat notes | sort -u | uniq -c" }],
	["bash", { command: "uniq -f 1 notes" }], // -f's value is not an output operand
	["bash", { command: "cut -d: -f1 notes" }],
	["bash", { command: "awk -F: '{print $1}' notes" }],
	["bash", { command: "awk -v n=2 'NR==n' notes" }],
	["bash", { command: "git log --oneline | awk '{print $1}' | sort | uniq -c | head -n 3" }],
	...SURFACE_TOOLS.map((t): [string, Record<string, unknown>] => [t, {}]),
	...SURFACE_TOOLS.map((t): [string, Record<string, unknown>] => ["write", { path: `xd://${t}`, content: "{}" }]),
];

const label = ([tool, input]: [string, Record<string, unknown>]) => `${tool} ${JSON.stringify(input.command ?? input.path ?? input.tasks ?? input.code ?? "")}`;

describe("P-11 row 15: the orchestrator does no lane work", () => {
	for (const call of REFUSED) {
		test(`orchestrator refuses ${label(call)}`, async () => {
			expect(await session("orchestrator")(...call)).toEqual({ block: true, reason: ORCHESTRATOR_ROLE_REFUSAL });
		});
	}
	for (const call of ALLOWED) {
		test(`orchestrator allows ${label(call)}`, async () => {
			expect(await session("orchestrator")(...call)).toBeUndefined();
		});
	}
	test("the refusal is one line naming the tool that opens a workload", () => {
		expect(ORCHESTRATOR_ROLE_REFUSAL).not.toContain("\n");
		expect(ORCHESTRATOR_ROLE_REFUSAL).toContain("orchestrator_open_workload");
		expect(SURFACE_TOOLS).toContain("orchestrator_open_workload");
	});
	test("rg under a session RIPGREP_CONFIG_PATH is refused unless it passes --no-config (the config file can add --pre)", () => {
		const env = { HOME: "/nonexistent-home", RIPGREP_CONFIG_PATH: "/tmp/rgrc" };
		expect(readOnlyBash("rg pattern notes", "/tmp", env)).toBe(false);
		expect(readOnlyBash("rg --no-config pattern notes", "/tmp", env)).toBe(true);
		expect(readOnlyBash("rg pattern notes", "/tmp", { HOME: "/nonexistent-home" })).toBe(true);
	});
	for (const kind of ["lane", "hand"] as const) {
		test(`a ${kind} session is untouched by every call the orchestrator is refused or allowed`, async () => {
			const call = session(kind);
			for (const c of [...REFUSED, ...ALLOWED]) expect(await call(...c)).toBeUndefined();
		});
	}
});

// M7 fix round 2, finding B: Jo's answer to the orchestrator's QUESTION never reached the ledger.
// The turn sequence of Jo's session 2026-09-30 (Ilex): entry 30, the QUESTION (the workload id only
// in the CLAIM above it), then Jo's "use your draft" (entry 31), then a working call (entry 32 was a
// `write` of README.md). Both extensions are loaded, as the as2 profile loads them.
const REAL_SESSION = "/Users/jowolff/.omp/profiles/agent-system-2/agent/sessions/-tmp/2026-09-30T04-59-58-976Z_01a0f0af-0c80-7000-abb3-08e67c02614d.jsonl";
const REAL_WL = "wl-munn32rmt6ajnk";
const ILEX_QUESTION = [
	"**CLAIM**",
	"Needs you: one thing, the text of the README line. There's nothing else open.",
	"",
	"**CLAIM**",
	`I opened a workload for this: the one-line README addition to agent-system-2.0 (${REAL_WL}). It's at normal stakes and autonomous, and no lane is dispatched yet. It's waiting only on the line's text.`,
	"",
	"**GUESS(inference)**",
	"My draft, if you just want something descriptive: `agent-system-2.0: orchestrator, lanes, and tiered hands over a SQLite ledger, with output-types gates; see SPEC-2.0.md and MIGRATION.md.`",
	"",
	"**QUESTION**",
	"What should the one line in the new root `README.md` say: my draft line above (I recommend it if you just want a pointer to the spec and the migration plan), or your own text?",
].join("\n");

type Entry = { type: string; timestamp?: string; message?: { role: string; content: { type: string; text: string }[] } };
const said = (role: "user" | "assistant", text: string, timestamp: string): Entry => ({ type: "message", timestamp, message: { role, content: [{ type: "text", text }] } });
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();

function answerSession(workloads: string[] = [REAL_WL]) {
	const db = join(tmp("r15-ledger"), "ledger.db");
	const ledger = Ledger.open(db, { create: true, backup: false, backupOnOpen: false });
	for (const id of workloads) ledger.openWorkload({ id, by: "orchestrator-surface", brief: `brief of ${id}`, stakes: "normal", mode: "autonomous" });
	ledger.close();
	const env = { HOME: "/nonexistent-home", AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: db };
	const f = fakePi();
	orchestratorSurface(f.pi, env);
	orchestratorRoleRow(f.pi as unknown as GatesAPI, env);
	const entries: Entry[] = [];
	const ctx = { ...ctxOf(), sessionManager: { getHeader: () => null, getEntries: () => entries } };
	const call = (toolName: string, input: Record<string, unknown>) => f.emit("tool_call", { toolName, toolCallId: "c", input }, ctx) as Promise<{ block?: boolean; reason?: string } | undefined>;
	const instructions = (id: string) => {
		const l = Ledger.open(db, { create: false, backup: false, backupOnOpen: false });
		const rows = l.instructions(id);
		l.close();
		return rows;
	};
	return { f, ctx, entries, call, instructions };
}

const WORKING: [string, Record<string, unknown>][] = [
	["write", { path: "/Users/jowolff/code/agent-system-2.0/README.md", content: "x" }], // Ilex's entry 32
	["task", { tasks: [{ agent: "lane", task: "write the README line" }] }], // entry 35
	["orchestrator_close_workload", { workloadId: REAL_WL }],
	["orchestrator_open_workload", { brief: "README line, again" }],
	["orchestrator_schedule", { due: "2026-10-01", text: "x" }],
	["write", { path: "xd://orchestrator_close_workload", content: "{}" }],
];
const READING: [string, Record<string, unknown>][] = [
	["read", { path: "README.md" }],
	["bash", { command: "git log --oneline -3" }],
	["orchestrator_ledger", {}],
	["orchestrator_wake_read", { body: "x" }],
	["orchestrator_record_instruction", {}],
	["write", { path: "xd://orchestrator_record_instruction", content: "{}" }],
];

describe("P-11 row 15: Jo's answer is recorded before the orchestrator works on (M7 fix round 2, finding B)", () => {
	test("the session's sequence: QUESTION → Jo 'use your draft' → working calls refused naming the recorder; reads pass; after the recorder the answer is an instruction row and the gate lifts", async () => {
		const s = answerSession();
		s.entries.push(said("assistant", ILEX_QUESTION, ago(60)), said("user", "use your draft", ago(30)));
		for (const c of WORKING) {
			const r = await s.call(...c);
			expect(r?.block).toBe(true);
			expect(r?.reason).toBe(answerFirstRefusal([REAL_WL]));
		}
		expect(answerFirstRefusal([REAL_WL])).not.toContain("\n");
		for (const c of READING) expect(await s.call(...c)).toBeUndefined();
		const rec = await s.f.tool("orchestrator_record_instruction").execute("1", { workloadId: REAL_WL, words: "use your draft", reading: "use the drafted README line" }, undefined, undefined, s.ctx);
		expect(rec.content[0]!.text).toContain(`on ${REAL_WL} (author jo, channel surface)`);
		expect(s.instructions(REAL_WL)).toMatchObject([{ kind: "instruction", author: "jo", channel: "surface", body: 'Jo: "use your draft" — reading: use the drafted README line' }]);
		// the gate lifts: a hand-on call passes row 15, and the lane's tools get the role refusal again
		expect(await s.call("orchestrator_close_workload", { workloadId: REAL_WL })).toBeUndefined();
		expect(await s.call("write", { path: "README.md", content: "x" })).toEqual({ block: true, reason: ORCHESTRATOR_ROLE_REFUSAL });
	});

	test("a reply that asks about the question records nothing and is not refused: it is words; the working call stays refused until an answer is recorded", async () => {
		const s = answerSession();
		s.entries.push(said("assistant", ILEX_QUESTION, ago(90)), said("user", "which draft, the one with the ledger in it?", ago(60)));
		s.entries.push(said("assistant", "**PMDW**\nThe draft is the line quoted above, the one naming the SQLite ledger.", ago(50)));
		for (const c of READING.slice(0, 3)) expect(await s.call(...c)).toBeUndefined();
		expect(s.instructions(REAL_WL)).toEqual([]);
		expect((await s.call("orchestrator_close_workload", { workloadId: REAL_WL }))?.reason).toBe(answerFirstRefusal([REAL_WL]));
	});

	test("the question's workload: its id in the QUESTION block, else in the message, else the single open workload, else no gate; a Jo row older than the question does not answer it", async () => {
		const other = "wl-othr0000000001";
		const two = answerSession([REAL_WL, other]);
		two.entries.push(said("assistant", `**CLAIM**\n${REAL_WL} is waiting.\n\n**QUESTION**\nShould ${other} ship today or tomorrow?`, ago(60)));
		expect((await two.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(answerFirstRefusal([other]));
		const none = answerSession([REAL_WL, other]);
		none.entries.push(said("assistant", "**QUESTION**\nToday or tomorrow?", ago(60)));
		expect(await none.call("orchestrator_schedule", { due: "2026-10-01", text: "x" })).toBeUndefined();
		const single = answerSession();
		await single.f.tool("orchestrator_record_instruction").execute("1", { workloadId: REAL_WL, words: "earlier", reading: "an earlier instruction" }, undefined, undefined, single.ctx);
		single.entries.push(said("assistant", "**QUESTION**\nToday or tomorrow?", new Date(Date.now() + 60_000).toISOString()));
		expect((await single.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(answerFirstRefusal([REAL_WL]));
	});

	test.skipIf(!existsSync(REAL_SESSION))("on the real session file: entries through Jo's 'use your draft' leave Ilex's README write refused with the recorder named", async () => {
		const s = answerSession();
		const real = readFileSync(REAL_SESSION, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Entry);
		const jo = real.findIndex((e) => e.message?.role === "user" && e.message.content.some((p) => p.text === "use your draft"));
		expect(jo).toBeGreaterThan(0);
		s.entries.push(...real.slice(0, jo + 1));
		const ilexWrite = real[jo + 1]!.message!.content.find((p) => p.type === "toolCall") as unknown as { name: string; arguments: Record<string, unknown> };
		expect(ilexWrite.name).toBe("write");
		expect((await s.call(ilexWrite.name, ilexWrite.arguments))?.reason).toBe(answerFirstRefusal([REAL_WL]));
		await s.f.tool("orchestrator_record_instruction").execute("1", { workloadId: REAL_WL, words: "use your draft", reading: "use the drafted README line" }, undefined, undefined, s.ctx);
		expect((await s.call(ilexWrite.name, ilexWrite.arguments))?.reason).toBe(ORCHESTRATOR_ROLE_REFUSAL);
	});
});
