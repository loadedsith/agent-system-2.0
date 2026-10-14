// Pins P-11 row 6 on a lane's sudo commands around the as2test refresh helper (PLAN.md §1.5, T9).
// A lane never runs the root-owned refresh helper or the test-exec bundle through sudo, and never
// sudo at all: every form below is refused, and each refusal names sudo. The gate only reads the
// strings; nothing here starts a process or touches /usr/local/libexec.
import { describe, expect, test } from "bun:test";
import { realpathSync } from "node:fs";
import { checkToolCall } from "../src/gates";
import type { CallContext, Refusal } from "../src/types";
import { git, tmp } from "./helpers";

const repo = realpathSync(tmp("as2test-refresh-pins"));
git(repo, "init", "-q", "-b", "main");
git(repo, "commit", "-q", "--allow-empty", "-m", "init");

const ctx: CallContext = { role: "lane", cwd: repo, env: { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: "/not-real/ledger.db" } };
const check = (command: string): Refusal => checkToolCall({ toolName: "bash", input: { command } }, ctx);

const commands = [
	"sudo -n /usr/local/libexec/as2test/refresh",
	"sudo /usr/local/libexec/as2test/refresh",
	"sudo -n -u _as2test /usr/local/libexec/as2test/exec sweep tr-x",
	"sudo ls /not-real",
];

describe("row 6: a lane never runs sudo, the as2test refresh helper included", () => {
	for (const command of commands) {
		test(`REFUSE: ${command}`, () => expect(check(command) === null ? "ALLOW" : "REFUSE").toBe("REFUSE"));
		test(`the refusal names sudo: ${command}`, () => expect(check(command)?.reason ?? "").toContain("sudo"));
	}
});
