// P-11 row 15 (gates/extensions/r15-orchestrator-role.ts) driven through a fake OMP extension API:
// on the orchestrator session the lane's tools are refused with the one-line reason; reads, the
// read-only bash forms rows 6 and 10 already model, and the surface's ledger tools pass; a lane and a
// hand see every one of the same calls untouched.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../../surface/index";
import { SURFACE_TOOLS } from "../../surface/src/types";
import { ctxOf, fakePi } from "../../surface/test/helpers";
import orchestratorRoleRow from "../extensions/r15-orchestrator-role";
import type { GatesAPI } from "../index";
import { answerFirstRefusal, ORCHESTRATOR_ROLE_REFUSAL, readOnlyBash, UNRECORDED_QUESTION_REFUSAL } from "../src/rows/r15-orchestrator-role";
import { tmp } from "./helpers";

/** This checkout, resolved at runtime: Ilex's command named Jo's (item 24, run tr-0mv0ks648wy8d2q). */
const REPO_ROOT = resolve(import.meta.dir, "..", "..");

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
	// M8 ctx wiring: ctx's write commands and the write forms of its reads.
	["bash", { command: "ctx import --all" }],
	["bash", { command: "ctx setup" }],
	["bash", { command: "ctx index mode manual" }],
	["bash", { command: "ctx integrations install omp" }],
	["bash", { command: "ctx --quiet import --provider pi" }], // a global option before the write verb
	["bash", { command: "ctx sources add --provider pi --root /tmp/s as2" }],
	["bash", { command: "ctx sources remove as2" }],
	["bash", { command: "ctx status --usage reset" }],
	["bash", { command: "ctx status --usage=disable" }],
	["bash", { command: "ctx search --refresh wait wl-munn32rmt6ajnk" }], // runs the refresh (an import) first
	["bash", { command: "ctx search --refresh=wait foo" }],
	["bash", { command: "ctx show session 01a0f0ca --out transcript.md" }],
	["bash", { command: "ctx graph --query-log q.jsonl search Ledger" }],
	["bash", { command: "ctx graph search Ledger --query-log=q.jsonl" }],
	["bash", { command: "ctx graph index ." }],
	["bash", { command: "ctx search $FLAGS foo" }], // a word known only when it runs may be --refresh=wait
	["bash", { command: "ctx $VERB foo" }],
	["bash", { command: "ctx search foo > hits.txt" }],
	["write", { path: "xd://mcp__ctx_x_search", content: "{}" }], // a server named ctx_x, not ctx
	["write", { path: "xd://mcp__linear_save_issue", content: "{}" }], // another server's device
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
	// Ilex ran it against /Users/jowolff/code/agent-system-2.0; this checkout stands in, so it holds for any uid.
	["bash", { command: `ls -a ${REPO_ROOT} && git -C ${REPO_ROOT} ls-files | grep -i read` }],
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
	// M8 ctx wiring: "older history is one ctx index query away" (tiers/orchestrator.md).
	["bash", { command: "ctx search wl-munn32rmt6ajnk --since 2d" }],
	["bash", { command: "ctx search --limit 5 --source-root agent-system-2-sessions -- \"wake read\"" }],
	["bash", { command: "ctx search --refresh off foo" }],
	["bash", { command: "ctx --quiet --data-root /tmp/ctx search foo --format json" }],
	["bash", { command: "ctx search -- $QUERY" }], // after `--` a word is only the query
	["bash", { command: "ctx show session 01a0f0ca --max-events 50" }],
	["bash", { command: "ctx show event abc --window 3" }],
	["bash", { command: "ctx locate session 01a0f0ca" }],
	["bash", { command: "ctx blame file README.md --lines 1:5" }],
	["bash", { command: "ctx status" }],
	["bash", { command: "ctx sources --provider pi --format json" }],
	["bash", { command: "ctx doctor" }],
	["bash", { command: "ctx graph search Ledger --depth 2" }],
	["bash", { command: "ctx graph --db .graf/index.db query Ledger" }],
	["bash", { command: "ctx search foo 2>/dev/null | head -n 20" }],
	["write", { path: "xd://mcp__ctx_search", content: "{\"query\":\"wl-munn32rmt6ajnk\"}" }],
	["write", { path: "xd://mcp__ctx_show_session", content: "{}" }],
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
// `write` of README.md). MIGRATION.md item 105: the ask itself is a `questions` row first, raised with
// orchestrator_raise_question and named by id in the QUESTION block; a block naming no row is refused,
// and a block naming an open row is refused until the row is answered — by Jo's word at the surface or
// by the recorder naming the question. Both extensions are loaded, as the as2 profile loads them.
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
/** The same ask, re-sent naming its row. */
const withId = (q: string) => ILEX_QUESTION.replace("**QUESTION**\n", `**QUESTION**\n(${q}) `);

type Entry = { type: string; timestamp?: string; message?: { role: string; content: { type: string; text: string }[] } };
const said = (role: "user" | "assistant", text: string, timestamp: string): Entry => ({ type: "message", timestamp, message: { role, content: [{ type: "text", text }] } });
const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
/** A message after every row written so far (the ledger stamps real time; a re-sent QUESTION must be newer than its row). */
const later = () => new Date(Date.now() + 60_000).toISOString();

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
	const open = () => Ledger.open(db, { create: false, backup: false, backupOnOpen: false });
	const instructions = (id: string) => {
		const l = open();
		const rows = l.instructions(id);
		l.close();
		return rows;
	};
	const question = (id: string) => {
		const l = open();
		const row = l.question(id);
		l.close();
		return row;
	};
	/** The orchestrator raises its ask through the tool; the returned id. */
	const raise = async (about: string | null = REAL_WL): Promise<string> => {
		const r = await f.tool("orchestrator_raise_question").execute("1", { body: "What should the one README line say?", options: ["draft", "mine"], ...(about ? { about } : {}) }, undefined, undefined, ctx);
		const m = /^Raised question (q-\S+)/.exec(r.content[0]!.text);
		if (!m) throw new Error(`not raised: ${r.content[0]!.text}`);
		return m[1]!;
	};
	return { f, ctx, entries, call, instructions, question, raise, db };
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
	["orchestrator_raise_question", {}],
	["write", { path: "xd://orchestrator_raise_question", content: "{}" }],
];

describe("P-11 row 15: the orchestrator's QUESTION is a ledger row, answered before it works on (M7 fix round 2, finding B; MIGRATION.md item 105)", () => {
	test("the session's sequence: a QUESTION with no row → working calls refused naming the question tool; raised and re-sent with its id → refused naming the recorder; reads pass; Jo 'use your draft' recorded against the question answers the row, mirrors the instruction on the workload, and the gate lifts", async () => {
		const s = answerSession();
		s.entries.push(said("assistant", ILEX_QUESTION, ago(60)), said("user", "use your draft", ago(30)));
		for (const c of WORKING) expect(await s.call(...c)).toEqual({ block: true, reason: UNRECORDED_QUESTION_REFUSAL });
		expect(UNRECORDED_QUESTION_REFUSAL).not.toContain("\n");
		for (const c of READING) expect(await s.call(...c)).toBeUndefined();
		// The row alone does not lift it: the QUESTION Jo saw predates the row, so the ask is re-sent naming the id.
		const q = await s.raise();
		expect(s.question(q)).toMatchObject({ workload_id: "wl-orchestrator", slice_id: "sl-orchestrator-questions", state: "open", body: `about ${REAL_WL}: What should the one README line say?` });
		expect((await s.call("orchestrator_close_workload", { workloadId: REAL_WL }))?.reason).toBe(UNRECORDED_QUESTION_REFUSAL);
		s.entries.push(said("assistant", withId(q), later()), said("user", "use your draft", later()));
		for (const c of WORKING) {
			const r = await s.call(...c);
			expect(r?.block).toBe(true);
			expect(r?.reason).toBe(answerFirstRefusal([q]));
		}
		expect(answerFirstRefusal([q])).not.toContain("\n");
		for (const c of READING) expect(await s.call(...c)).toBeUndefined();
		const rec = await s.f.tool("orchestrator_record_instruction").execute("1", { questionId: q, words: "use your draft", reading: "use the drafted README line" }, undefined, undefined, s.ctx);
		expect(rec.content[0]!.text).toContain(`Answered ${q} with Jo's words`);
		expect(rec.content[0]!.text).toContain(`on ${REAL_WL} (author jo, channel surface)`);
		expect(s.question(q)).toMatchObject({ state: "answered" });
		expect(s.instructions(REAL_WL)).toMatchObject([{ kind: "instruction", author: "jo", channel: "surface", body: `Jo: "use your draft" — reading: use the drafted README line (answers ${q})` }]);
		expect(s.instructions("wl-orchestrator")).toMatchObject([{ kind: "answer", question_id: q, author: "jo", body: "use your draft" }]);
		// the gate lifts: a hand-on call passes row 15, and the lane's tools get the role refusal again
		expect(await s.call("orchestrator_close_workload", { workloadId: REAL_WL })).toBeUndefined();
		expect(await s.call("write", { path: "README.md", content: "x" })).toEqual({ block: true, reason: ORCHESTRATOR_ROLE_REFUSAL });
	});

	test("a reply that asks about the question records nothing and is not refused: it is words; the working call stays refused until the row is answered", async () => {
		const s = answerSession();
		const q = await s.raise();
		s.entries.push(said("assistant", withId(q), later()), said("user", "which draft, the one with the ledger in it?", later()));
		s.entries.push(said("assistant", "**PMDW**\nThe draft is the line quoted above, the one naming the SQLite ledger.", later()));
		for (const c of READING.slice(0, 3)) expect(await s.call(...c)).toBeUndefined();
		expect(s.instructions(REAL_WL)).toEqual([]);
		expect((await s.call("orchestrator_close_workload", { workloadId: REAL_WL }))?.reason).toBe(answerFirstRefusal([q]));
	});

	test("which rows count: an unknown id, a lane's question, or a row created after the message is unrecorded; without a timestamp the row's existence is enough; an answered row lifts the gate; a block naming two open rows names both", async () => {
		const s = answerSession();
		s.entries.push(said("assistant", "**QUESTION**\n(q-nope) Today or tomorrow?", later()));
		expect((await s.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(UNRECORDED_QUESTION_REFUSAL);
		const l = Ledger.open(s.db, { create: false, backup: false, backupOnOpen: false });
		const sl = l.addSlice({ by: "lane-a", workloadId: REAL_WL, task: "t", doneCondition: "d", inputs: "i" });
		const lanes = l.raiseQuestion({ by: "lane-a", workloadId: REAL_WL, sliceId: sl, body: "a lane's", options: ["a", "b"] });
		l.close();
		s.entries.length = 0;
		s.entries.push(said("assistant", `**QUESTION**\n(${lanes}) Today or tomorrow?`, later()));
		expect((await s.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(UNRECORDED_QUESTION_REFUSAL);
		s.entries.length = 0;
		s.entries.push(said("assistant", "**QUESTION**\n(see below) Today or tomorrow?", ago(60)));
		const q = await s.raise();
		s.entries[0] = said("assistant", `**QUESTION**\n(${q}) Today or tomorrow?`, ago(60)); // the row is newer than the message
		expect((await s.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(UNRECORDED_QUESTION_REFUSAL);
		s.entries[0] = { type: "message", message: { role: "assistant", content: [{ type: "text", text: `**QUESTION**\n(${q}) Today or tomorrow?` }] } };
		expect((await s.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(answerFirstRefusal([q]));
		const q2 = await s.raise(null);
		s.entries[0] = said("assistant", `**QUESTION**\n(${q}) Today or tomorrow?\n\n**QUESTION**\n(${q2}) And the other?`, later());
		expect((await s.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(answerFirstRefusal([q, q2]));
		await s.f.tool("orchestrator_record_instruction").execute("1", { questionId: q, words: "today", reading: "today" }, undefined, undefined, s.ctx);
		expect((await s.call("orchestrator_schedule", { due: "2026-10-01", text: "x" }))?.reason).toBe(answerFirstRefusal([q2]));
		await s.f.tool("orchestrator_record_instruction").execute("1", { questionId: q2, words: "the other too", reading: "the other too" }, undefined, undefined, s.ctx);
		expect(await s.call("orchestrator_schedule", { due: "2026-10-01", text: "x" })).toBeUndefined();
		// A question with no subject: the row's body is the text alone, and the answer lands on the standing workload only.
		expect(s.question(q2)).toMatchObject({ state: "answered", body: "What should the one README line say?" });
		expect(s.instructions(REAL_WL).map((i) => i.body)).toEqual([`Jo: "today" — reading: today (answers ${q})`]);
	});

	test.skipIf(!existsSync(REAL_SESSION))("on the real session file: entries through Jo's 'use your draft' leave Ilex's README write refused, the ask having no row; raised, re-sent and answered, the write gets the role refusal", async () => {
		const s = answerSession();
		const real = readFileSync(REAL_SESSION, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Entry);
		const jo = real.findIndex((e) => e.message?.role === "user" && e.message.content.some((p) => p.text === "use your draft"));
		expect(jo).toBeGreaterThan(0);
		s.entries.push(...real.slice(0, jo + 1));
		const ilexWrite = real[jo + 1]!.message!.content.find((p) => p.type === "toolCall") as unknown as { name: string; arguments: Record<string, unknown> };
		expect(ilexWrite.name).toBe("write");
		expect((await s.call(ilexWrite.name, ilexWrite.arguments))?.reason).toBe(UNRECORDED_QUESTION_REFUSAL);
		const q = await s.raise();
		s.entries.push(said("assistant", withId(q), later()), said("user", "use your draft", later()));
		expect((await s.call(ilexWrite.name, ilexWrite.arguments))?.reason).toBe(answerFirstRefusal([q]));
		await s.f.tool("orchestrator_record_instruction").execute("1", { questionId: q, words: "use your draft", reading: "use the drafted README line" }, undefined, undefined, s.ctx);
		expect((await s.call(ilexWrite.name, ilexWrite.arguments))?.reason).toBe(ORCHESTRATOR_ROLE_REFUSAL);
	});
});
