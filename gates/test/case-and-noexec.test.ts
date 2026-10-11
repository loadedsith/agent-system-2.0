// The guard-replay drift triage (2026-10-11, rootstock/drift/REPORT.md): the parser could not read
// `case … esac` (241 wrong NEW-CATCH refusals, "unbalanced )"), and `zsh -n script` / `bash -n script`
// were judged as if the script ran (8 LOST, 3 NEW-CATCH). The first three commands below are the
// live ones, verbatim from seat transcripts.
import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expandShell } from "../src/exec";
import { checkReserved } from "../src/rows/r06-reserved";
import { checkRawLedgerWrite } from "../src/rows/r10-raw-ledger";
import { parseShell } from "../src/shell-parse";
import type { CallContext } from "../src/types";
import { tmp } from "./helpers";

const env = { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: "/not-real/ledger.db" };
const ctx: CallContext = { role: "lane", cwd: "/tmp", env };
const parse = (command: string) => parseShell(command, { cwd: "/tmp", env });
const argvs = (command: string) => parse(command).commands.map((c) => c.words.map((w) => w.text).join(" "));
const row6 = (command: string) => checkReserved({ toolName: "bash", input: { command } }, ctx);

describe("shell parser: case … esac", () => {
	test("the three live refusals from the drift report parse, and the arms' commands are the commands", () => {
		const live = [
			`ps -Ao pid,etime,command | tr -s ' ' | sed -n '1,400p' | while IFS= read -r l; do case "$l" in *"bin/omp"*) printf '%s\\n' "$l";; esac; done`,
			`ps -Ao pid=,command= | while IFS= read -r l; do case "$l" in *seat-sessions*|*--hook*|*omp*) printf '%s\\n' "$l" | sed -n 's/.*\\(--model[= ][^ ]*\\).*/MODEL: \\1/p';; esac; done | sort | uniq -c; echo "--- launcher default ---"; grep -n -i -m8 'model' /Users/jowolff/.omp/agent/seat-launchers/launch-seat`,
			`ls out; for f in out/*; do case $f in *.jsonl) ;; *) echo "== $f"; head -c 900 "$f"; echo;; esac; done 2>/dev/null | head -90`,
		];
		for (const command of live) {
			expect(parse(command).failures).toEqual([]);
			expect(row6(command)).toBeNull();
		}
		expect(argvs(live[0]!)).toEqual(["ps -Ao pid,etime,command", "tr -s  ", "sed -n 1,400p", "IFS= read -r l", "printf %s\\n "]);
		const second = parse(live[1]!);
		expect(second.keywords).toEqual(["while", "do", "case", "esac", "done"]);
		expect(second.commands.find((c) => c.words[0]?.text === "sed")?.stdinFrom?.words[0]?.text).toBe("printf");
	});

	test("every arm is judged: a reserved action inside an arm, nested case, (pattern) form, ;& and ;;&", () => {
		const nested = `case $x in\n  (a|b) case $y in\n    1) echo one ;&\n    2) echo two ;;&\n    *) echo other\n  esac ;;\n  c) rm -rf /not-real/.git ;;\nesac; echo after`;
		const p = parse(nested);
		expect(p.failures).toEqual([]);
		expect(argvs(nested)).toEqual(["echo one", "echo two", "echo other", "rm -rf /not-real/.git", "echo after"]);
		expect(p.ops).toEqual([";&", ";;&", "\n", ";;", ";;", ";"]);
		expect(row6(nested)?.reason).toContain("rm -rf");
		expect(row6(`case $x in a) echo a;; b) git push --force origin feature;; esac`)?.reason).toContain("force-push");
	});

	test("case inside $( … ), in a { … } group, with newlines and comments, and with a heredoc in an arm", () => {
		expect(argvs(`echo $(case x in a) echo a;; esac) done`)).toEqual(["echo a", "echo  done"]);
		expect(parse(`{ case x in a) echo a;; esac; }`).failures).toEqual([]);
		expect(argvs(`case x\nin\n# which\na)\necho a\n;;\nesac`)).toEqual(["echo a"]);
		expect(parse(`case x in a) cat <<EOF\nhi\nEOF\n;; esac; echo z`).commands.map((c) => [c.words[0]?.text, c.redirects[0]?.body ?? null])).toEqual([
			["cat", "hi"],
			["echo", null],
		]);
	});

	test("a case the gate cannot read to esac is still a failure, and the rows refuse it", () => {
		for (const [command, failure] of [
			[`case x in a) echo a;; `, "unterminated case … esac"],
			[`case x in`, "unterminated case … esac"],
			[`case`, "case without `in`"],
			[`case x in a echo a;; esac`, "case pattern not closed by )"],
			[`case x in @(a|b)) echo a;; esac`, "case pattern not closed by )"],
			[`case x in a) echo a;; esac)`, "unbalanced )"],
			[`case x in ) echo a;; esac`, "case pattern the gate cannot read"],
		] as const) {
			expect(parse(command).failures).toContain(failure);
			expect(row6(command)?.reason).toContain("a command the gate cannot read to the end");
		}
	});

	test("quoted or glued spellings are words, not the keyword", () => {
		expect(argvs(`echo case x in a; echo esac`)).toEqual(["echo case x in a", "echo esac"]);
		expect(parse(`"case" x in a) echo a;; esac`).failures).toContain("unbalanced )");
		expect(argvs(`casex=1; echo $casex`)).toEqual(["casex=1", "echo 1"]);
	});
});

describe("expander: a shell's -n reads the script and runs nothing", () => {
	const dir = tmp("noexec");
	const script = join(dir, "run-proof.sh");
	writeFileSync(script, "export AGENT_SYSTEM_LEDGER_DB=/not-real/ledger.db\ngit push --force origin feature\n");
	const ran = (command: string) => expandShell(command, dir, env).commands.map((c) => c.argv.map((w) => w.text).join(" "));

	test("-n alone before the script: the script's commands are not this call's commands, and rows 6 and 10 allow it", () => {
		for (const shell of ["zsh", "bash", "sh"]) {
			const command = `${shell} -n ${script} && echo SYNTAX_OK`;
			expect(ran(command)).toEqual([`${shell} -n ${script}`, "echo SYNTAX_OK"]);
			expect(expandShell(command, dir, env).blind).toEqual([]);
			expect(row6(command)).toBeNull();
			expect(checkRawLedgerWrite({ toolName: "bash", input: { command } }, ctx)).toBeNull();
		}
		expect(ran(`bash -x -n ${script}`)).toEqual([`bash -x -n ${script}`]);
		expect(expandShell(`bash -n ${join(dir, "missing.sh")}`, dir, env).blind).toEqual([]);
		expect(expandShell(`bash -n <<'EOF'\ngit push --force origin feature\nEOF`, dir, env).commands.length).toBe(1);
	});

	test("without -n, in a cluster, or with -c, the script (or string) runs and is judged as before", () => {
		expect(ran(`zsh ${script}`)).toContain("git push --force origin feature");
		expect(row6(`zsh ${script}`)?.reason).toContain("force-push");
		expect(ran(`bash -xn ${script}`)).toContain("git push --force origin feature");
		expect(ran(`bash -n -c 'git push --force origin feature'`)).toContain("git push --force origin feature");
		expect(ran(`bash -nc 'git push --force origin feature'`)).toContain("git push --force origin feature");
		expect(ran(`bash -- -n`)).toEqual(["bash -- -n"]);
		expect(expandShell(`bash -- -n`, dir, env).blind[0]).toContain("does not exist");
	});

	test("the path stays a read of the file: -n on the ledger itself is still row 10's call", () => {
		const home = tmp("home");
		mkdirSync(join(home, ".agent-system-2"));
		const db = join(home, ".agent-system-2", "ledger.db");
		writeFileSync(db, "");
		const r = checkRawLedgerWrite({ toolName: "bash", input: { command: `bash -n ${db}` } }, { role: "lane", cwd: home, env: { HOME: home } });
		expect(r?.reason).toContain("`bash` on the ledger file");
	});
});
