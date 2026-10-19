// The Jo-only boundary, accident grade, layer 2 (PLAN wl-mv654hoqwpfhmo § 6.3 item 2).
//
// Interface these tests fix for the boundary (sl-auth-boundary): `checkToolCall` (gates/src/gates.ts) refuses, with a
// reason containing "Jo-only boundary", eval code (gates/src/eval-code.ts) and bash commands (gates/src/rows/
// r10-raw-ledger.ts, which owns "the ledger is written only through the module") that
// - import the ledger module (`ledger/src`), statically, dynamically or by require;
// - name the ledger file `ledger.db` in an open or a write;
// - construct a bun:sqlite `Database` on any path under `~/.agent-system-2/` (HOME's and the passwd home's);
// - set, unset or override AGENT_SYSTEM_ROLE, AGENT_SYSTEM_LANE_ID, AGENT_SYSTEM_WORKLOAD_ID, AGENT_SYSTEM_LEDGER_DB
//   or any AS2_TEST_* name: `env -u`, `env -i`, a prefix assignment, `export`, `unset`, the bash tool's own `env`
//   input, and in eval `process.env.X = …`, `delete process.env.X`, `os.environ[…] = …`, `os.environ.pop(…)`.
// The refusal holds for every role: a lane, a hand, and the orchestrator agent (§ 6.1: layer 1 does not cover the
// orchestrator's process, so layers 2 and 3 are its boundary). Reading stays allowed: `sqlite3 -readonly <ledger>`
// with SELECT, `echo $AGENT_SYSTEM_ROLE`, eval reading process.env, and `bun test` of a test file.
// Every probe is inert: the gate only reads the strings; nothing here runs, and every path sits under a home this
// test makes up.
import { describe, expect, test } from "bun:test";
import { checkToolCall } from "../src/gates";
import type { CallContext, Refusal, Role } from "../src/types";
import { tmp } from "./helpers";

const HOME = "/nonexistent-home";
const LIVE = `${HOME}/.agent-system-2/ledger.db`;
const cwd = tmp("authority-gate");
const ctxFor = (role: Role): CallContext => ({ role, cwd, env: { HOME, AGENT_SYSTEM_LANE_ID: role === "orchestrator" ? undefined : "lane-x", AGENT_SYSTEM_WORKLOAD_ID: role === "orchestrator" ? undefined : "wl-x" } });
const ROLES: Role[] = ["lane", "hand", "orchestrator"];
const BOUNDARY = "Jo-only boundary";

type Probe = { tool: "bash"; command: string; env?: Record<string, string> } | { tool: "eval"; language: "js" | "py"; code: string };
const call = (p: Probe, role: Role): Refusal =>
	checkToolCall(
		p.tool === "bash" ? { toolName: "bash", input: p.env ? { command: p.command, env: p.env } : { command: p.command } } : { toolName: "eval", input: { language: p.language, code: p.code } },
		ctxFor(role),
	);
const label = (p: Probe) => (p.tool === "bash" ? `bash ${p.command}${p.env ? ` env=${JSON.stringify(p.env)}` : ""}` : `eval ${p.language} ${p.code}`);

const IMPORTS: Probe[] = [
	{ tool: "eval", language: "js", code: `import { Ledger } from "${cwd}/ledger/src/index";\nconst l = Ledger.open("${LIVE}");` },
	{ tool: "eval", language: "js", code: `import { Ledger } from "../ledger/src/index.ts";` },
	{ tool: "eval", language: "js", code: `const { Ledger } = await import("./ledger/src/index.ts");` },
	{ tool: "eval", language: "js", code: `const m = require("./ledger/src/index");` },
	{ tool: "eval", language: "js", code: `import { liveRoots } from "./ledger/src/locality";` },
	{ tool: "bash", command: `bun -e 'import { Ledger } from "./ledger/src/index"; console.log(Ledger)'` },
	{ tool: "bash", command: `bun --eval "const { Ledger } = await import('./ledger/src/index.ts')"` },
];

const LEDGER_FILE: Probe[] = [
	{ tool: "eval", language: "js", code: `import { Database } from "bun:sqlite";\nconst db = new Database("ledger.db");` },
	{ tool: "eval", language: "js", code: `import { Database } from "bun:sqlite";\nconst db = new Database("${LIVE}");\ndb.run("UPDATE workloads SET stakes = 'throwaway'");` },
	{ tool: "eval", language: "py", code: `import sqlite3\nsqlite3.connect("ledger.db").execute("DELETE FROM entries")` },
	{ tool: "bash", command: `sqlite3 ${LIVE} "INSERT INTO entries (id, workload_id, kind, body, created_by, created_at) VALUES ('en-x', 'wl-x', 'assumption', 'plan: approved in-x', 'orchestrator-surface', '2026-10-19')"` },
	{ tool: "bash", command: `sqlite3 ledger.db "UPDATE questions SET status = 'answered'"` },
	{ tool: "bash", command: `bun -e 'import { Database } from "bun:sqlite"; new Database("ledger.db").run("DELETE FROM entries")'` },
];

const UNDER_ROOT: Probe[] = [
	{ tool: "eval", language: "js", code: `import { Database } from "bun:sqlite";\nconst db = new Database("${HOME}/.agent-system-2/scratch.db");` },
	{ tool: "eval", language: "js", code: `import { Database } from "bun:sqlite";\nconst db = new Database(process.env.HOME + "/.agent-system-2/copy.sqlite");` },
	{ tool: "eval", language: "js", code: `import { Database } from "bun:sqlite";\nimport { homedir } from "node:os";\nconst db = new Database(\`\${homedir()}/.agent-system-2/backups/2026-10-19.db\`);` },
	{ tool: "bash", command: `bun -e 'import { Database } from "bun:sqlite"; new Database("${HOME}/.agent-system-2/backup.db")'` },
];

const NAMES = ["AGENT_SYSTEM_ROLE", "AGENT_SYSTEM_LANE_ID", "AGENT_SYSTEM_WORKLOAD_ID", "AGENT_SYSTEM_LEDGER_DB", "AS2_TEST_ISOLATED", "AS2_TEST_LIVE_ROOTS", "AS2_TEST_REAL_HOME"];
const ENV_OVERRIDES: Probe[] = [
	...NAMES.flatMap((n): Probe[] => [
		{ tool: "bash", command: `${n}=orchestrator bun test ledger/test/authority.test.ts` },
		{ tool: "bash", command: `env -u ${n} bun test ledger/test/authority.test.ts` },
		{ tool: "bash", command: `export ${n}=x && bun test ledger/test/authority.test.ts` },
		{ tool: "bash", command: `unset ${n}; bun test ledger/test/authority.test.ts` },
		{ tool: "bash", command: "bun test ledger/test/authority.test.ts", env: { [n]: "x" } },
		{ tool: "eval", language: "js", code: `process.env.${n} = "x";` },
		{ tool: "eval", language: "js", code: `delete process.env.${n};` },
		{ tool: "eval", language: "py", code: `import os\nos.environ["${n}"] = "x"` },
		{ tool: "eval", language: "py", code: `import os\nos.environ.pop("${n}", None)` },
	]),
	{ tool: "bash", command: "env -i PATH=/usr/bin:/bin bun test ledger/test/authority.test.ts" },
	{ tool: "bash", command: "env -i bun -e 'console.log(1)'" },
	{ tool: "bash", command: "AS2_TEST_ANYTHING=1 bun test gates/test/authority-gate.test.ts" },
];

const ALLOWED: Probe[] = [
	{ tool: "bash", command: `sqlite3 -readonly ${LIVE} "SELECT id, stakes FROM workloads"` },
	{ tool: "bash", command: `sqlite3 -readonly ${LIVE} ".tables"` },
	{ tool: "bash", command: "bun test ledger/test/authority.test.ts" },
	{ tool: "bash", command: 'echo "$AGENT_SYSTEM_ROLE $AGENT_SYSTEM_LANE_ID"' },
	{ tool: "bash", command: "printenv AGENT_SYSTEM_WORKLOAD_ID" },
	{ tool: "bash", command: "git status --short" },
	{ tool: "eval", language: "js", code: "const role = process.env.AGENT_SYSTEM_ROLE;\nconsole.log(role);" },
	{ tool: "eval", language: "js", code: `import { Database } from "bun:sqlite";\nconst mem = new Database(":memory:");` },
	{ tool: "eval", language: "py", code: `import os\nprint(os.environ.get("AGENT_SYSTEM_LANE_ID"))` },
];

for (const [group, probes] of [
	["imports the ledger module", IMPORTS],
	["names ledger.db in an open or a write", LEDGER_FILE],
	["constructs a bun:sqlite Database under ~/.agent-system-2/", UNDER_ROOT],
	["sets, unsets or overrides the agent-context or test-isolation names", ENV_OVERRIDES],
] as const) {
	describe(`refused with "${BOUNDARY}": ${group}`, () => {
		for (const role of ROLES) {
			test(`role ${role}: every probe is refused and the reason names the boundary`, () => {
				const missed = probes.flatMap((p) => {
					const r = call(p, role);
					return r !== null && r.reason.includes(BOUNDARY) ? [] : [`${label(p)} → ${r === null ? "ALLOW" : `REFUSE without the boundary: ${r.reason.slice(0, 120)}`}`];
				});
				expect(missed).toEqual([]);
			});
		}
	});
}

describe("reading stays allowed", () => {
	for (const role of ROLES) {
		test(`role ${role}: read-only probes pass`, () => {
			const refused = ALLOWED.flatMap((p) => {
				const r = call(p, role);
				return r === null ? [] : [`${label(p)} → ${r.reason.slice(0, 160)}`];
			});
			expect(refused).toEqual([]);
		});
	}
});
