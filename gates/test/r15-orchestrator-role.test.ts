// P-11 row 15 (gates/extensions/r15-orchestrator-role.ts) driven through a fake OMP extension API:
// on the orchestrator session the lane's tools are refused with the one-line reason; reads, the
// read-only bash forms rows 6 and 10 already model, and the surface's ledger tools pass; a lane and a
// hand see every one of the same calls untouched.
import { describe, expect, test } from "bun:test";
import { SURFACE_TOOLS } from "../../surface/src/types";
import orchestratorRoleRow from "../extensions/r15-orchestrator-role";
import type { GatesAPI } from "../index";
import { ORCHESTRATOR_ROLE_REFUSAL } from "../src/rows/r15-orchestrator-role";
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
	["bash", { command: "git stash list" }], // not one of the history reads
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
	for (const kind of ["lane", "hand"] as const) {
		test(`a ${kind} session is untouched by every call the orchestrator is refused or allowed`, async () => {
			const call = session(kind);
			for (const c of [...REFUSED, ...ALLOWED]) expect(await call(...c)).toBeUndefined();
		});
	}
});
