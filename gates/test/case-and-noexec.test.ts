// The guard-replay drift triage (2026-10-11, rootstock/drift/REPORT.md): the parser could not read
// `case … esac` (241 wrong NEW-CATCH refusals, "unbalanced )"), and `zsh -n script` / `bash -n script`
// were judged as if the script ran (8 LOST, 3 NEW-CATCH). The first three commands below are the
// live ones, verbatim from seat transcripts.
//
// Review round 1 (PR #49, agent-scratch/agent-system-2.0/review-pr49/REVIEW.md) found three holes in
// that change, each with a regression block below: B1, a command substitution nested in a `${ … }` or
// `$(( … ))` subject or pattern was never parsed; B3, an assignment or `cd` in an arm the shell skips
// decided how a matching arm's redirect resolved; B2, a `+n` or `+o noexec` after `-n` turns
// execution back on while the expander still returned as a read.
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

/** Row 10 over a bash command string from `cwd`. */
const row10 = (command: string, cwd = "/tmp") => checkRawLedgerWrite({ toolName: "bash", input: { command } }, { role: "lane", cwd, env });
/** The expander's view: argv texts, redirect target texts, with a case-joined word's candidates in braces. */
const seen = (command: string, cwd = "/tmp") =>
	expandShell(command, cwd, env).commands.map((e) => ({
		argv: e.argv.map((w) => w.text + (w.candidates ? `{${w.candidates.join(",")}}` : "")),
		redirects: e.redirects.map((r) => (r.target?.text ?? "") + (r.target?.candidates ? `{${r.target.candidates.join(",")}}` : "")),
	}));

describe("review round 1, Reproduction A: each attack string that rows 6 and 10 allowed now refuses", () => {
	// REVIEW.md § "Reproduction A — gate-only security probes": the exact strings, cwd /tmp, the ledger at
	// /not-real/ledger.db. Every one returned row6 null, row10 null, blind [] on 5f9fbeb. Reproduction B's
	// strings are the same shapes with a harmless print in place of the write (the real-shell oracles that
	// proved each position executes); their protected-payload forms are these.
	const matrix: Array<{ name: string; command: string; row10: string; commands: string[] }> = [
		{ name: "B1subject", command: "case ${x:-$(printf x > /not-real/ledger.db)} in x) :;; esac", row10: "a shell redirect into the ledger file (> /not-real/ledger.db)", commands: ["printf x", ":"] },
		{ name: "B1pattern", command: "case x in ${x:-$(printf x > /not-real/ledger.db)}) :;; esac", row10: "a shell redirect into the ledger file (> /not-real/ledger.db)", commands: ["printf x", ":"] },
		{ name: "B1arithmetic", command: "case $(( $(printf x > /not-real/ledger.db; printf 0) )) in x) :;; esac", row10: "a shell redirect into the ledger file (> /not-real/ledger.db)", commands: ["printf x", "printf 0", ":"] },
		{ name: "B2plusn", command: "bash -n +n <<\\EOF\nprintf x > /not-real/ledger.db\nEOF", row10: "a shell redirect into the ledger file (> /not-real/ledger.db)", commands: ["bash -n +n", "printf x"] },
		{ name: "B2pluso", command: "bash -n +o noexec <<\\EOF\nprintf x > /not-real/ledger.db\nEOF", row10: "a shell redirect into the ledger file (> /not-real/ledger.db)", commands: ["bash -n +o noexec", "printf x"] },
		{ name: "B3", command: 'dest=/not-real/ledger.db; case live in dead) dest=/tmp/safe;; live) printf x > "$dest";; esac', row10: "a shell redirect into the ledger file (> /not-real/ledger.db)", commands: ["printf x"] },
	];
	for (const row of matrix) {
		test(row.name, () => {
			const x = expandShell(row.command, "/tmp", env);
			expect(x.blind).toEqual([]);
			expect(x.commands.map((e) => e.argv.map((w) => w.text).join(" "))).toEqual(row.commands);
			expect(row10(row.command)?.reason).toContain(row.row10);
		});
	}
});

describe("B1: a command substitution inside a parameter or arithmetic expansion is a command of this string", () => {
	const write = "printf x > /not-real/ledger.db";
	const push = "git push --force origin feature";

	test("in a case subject and in a pattern: ${x:-$(…)}, ${x:=$(…)}, $(( $(…) )), backticks — rows 6 and 10 refuse", () => {
		for (const spell of [(c: string) => `\${x:-$(${c})}`, (c: string) => `\${x:=$(${c})}`, (c: string) => `$(( $(${c}; printf 0) ))`, (c: string) => `\${x:-\`${c}\`}`, (c: string) => `"\${x:-$(${c})}"`]) {
			for (const at of [(w: string) => `case ${w} in x) :;; esac`, (w: string) => `case x in ${w}) :;; esac`, (w: string) => `case x in a|${w}) :;; esac`]) {
				expect(row10(at(spell(write)))?.reason).toContain("a shell redirect into the ledger file (> /not-real/ledger.db)");
				expect(row6(at(spell(push)))?.reason).toContain("force-push");
				expect(parse(at(spell(write))).failures).toEqual([]);
			}
		}
	});

	test("anywhere else too, and however deep: an argument, a redirect target, a heredoc body, ${…} in $((…)) in ${…}", () => {
		expect(row10(`echo \${x:-$(${write})}`)?.reason).toContain("> /not-real/ledger.db");
		expect(row10(`echo hi > /tmp/\${x:-$(${write})}`)?.reason).toContain("> /not-real/ledger.db");
		expect(row10(`cat <<EOF\n\${x:-$(${write})}\nEOF`)?.reason).toContain("> /not-real/ledger.db");
		expect(row6(`: "\${x:-$(( \${y:-$(${push})} ))}"`)?.reason).toContain("force-push");
		expect(argvs(`echo \${x:-$(( \${y:-$(echo deep)} ))} end`)).toEqual(["echo deep", "echo  end"]);
	});

	test("the value is still unknown, and the word is dropped from argv as before", () => {
		expect(argvs("case ${x:-$(echo a)} in x) :;; esac")).toEqual(["echo a", ":"]);
		expect(parse("echo ${x:-$(echo a)}").commands.at(-1)?.words[1]?.opaque).toBe(true);
	});

	test("a plain $seat subject, a direct $(…) subject and ${NAME} keep working; no failure is recorded", () => {
		expect(parse("case $seat in a) echo a;; esac").failures).toEqual([]);
		expect(argvs("case $(uname) in Darwin) echo mac;; esac")).toEqual(["uname", "echo mac"]);
		expect(argvs("x=1; case ${x} in 1) echo one;; esac")).toEqual(["x=1", "echo one"]);
		expect(row10("case $seat in a) echo a;; esac")).toBeNull();
	});

	test("quoting inside ${…} follows the shell: '…' hides $(…) when the expansion is unquoted, not inside double quotes", () => {
		// live, 2026-10-11, bash 3.2.57 and zsh: `${x:-'$(c)'}` printed the text, `"${x:-'$(c)'}"` ran c.
		expect(argvs("echo ${x:-'$(echo RAN)'} end")).toEqual(["echo  end"]);
		expect(argvs(`echo "\${x:-'$(echo RAN)'}" end`)).toEqual(["echo RAN", "echo  end"]);
		expect(argvs('echo ${x:-"$(echo RAN)"} end')).toEqual(["echo RAN", "echo  end"]);
	});

	test("closers hidden by quotes, escapes, nesting and a substitution do not end the expansion early", () => {
		// live, same shells: `${x:-"}"}` → `}`, `${x:-'}'}` → `}`, `${x:-\}}` → `}`, `${x:-{a}}` → `{a}`, `${x:-$(echo "}")}` → `}`.
		for (const command of [`echo "\${x:-"}"}" end`, "echo ${x:-'}'} end", "echo ${x:-\\}} end", "echo ${x:-{a}} end", `echo \${x:-$(echo "}")} end`, "echo $(( (1+2) )) end"]) {
			const p = parse(command);
			expect(p.failures).toEqual([]);
			expect(p.commands.at(-1)?.words.at(-1)?.text).toBe("end");
		}
		expect(argvs(`echo \${x:-$(echo "}")} end`)).toEqual(["echo }", "echo  end"]);
	});

	test("an expansion the gate cannot read to its end is a failure, so row 6 refuses", () => {
		for (const [command, failure] of [
			["echo ${x:-$(echo a)", "unterminated ${ … }"],
			["echo $(( $(echo a) ", "unterminated $(( … ))"],
			["echo ${x:-'oops}", "unterminated ${ … }"],
		] as const) {
			expect(parse(command).failures).toContain(failure);
			expect(row6(command)?.reason).toContain("a command the gate cannot read to the end");
		}
	});
});

describe("B3: each case arm starts from the state at `case`; after esac, what any arm assigned is a candidate, not a fact", () => {
	test("an assignment in a non-matching arm does not decide a matching arm's redirect", () => {
		const command = 'dest=/not-real/ledger.db; case live in dead) dest=/tmp/safe;; live) printf x > "$dest";; esac';
		expect(seen(command)).toEqual([{ argv: ["printf", "x"], redirects: ["/not-real/ledger.db"] }]);
		expect(row10(command)?.reason).toContain("a shell redirect into the ledger file (> /not-real/ledger.db)");
		// the same with cd: the matching arm runs where `case` ran, not where another arm went
		expect(row10("case live in dead) cd /tmp;; live) printf x > ledger.db;; esac", "/not-real")?.reason).toContain("> ledger.db");
	});

	test("after esac a variable assigned in any arm is one of its candidates, and a protected candidate refuses", () => {
		const command = 'case live in dead) dest=/not-real/ledger.db;; live) dest=/tmp/safe;; esac; printf x > "$dest"';
		expect(seen(command)).toEqual([{ argv: ["printf", "x"], redirects: ["{/not-real/ledger.db,/tmp/safe}"] }]);
		expect(row10(command)?.reason).toContain("a shell redirect into the ledger file (> one of /not-real/ledger.db | /tmp/safe)");
		// the no-match path (dest unset) is one of the paths: the candidate list is partial and the word opaque
		expect(row10('case a in a) dest=/not-real/ledger.db;; esac; printf x > "$dest"')?.reason).toContain("one of /not-real/ledger.db");
		// through a later assignment, a nested case, and a candidate that is a prefix of the path
		expect(row10('case a in a) dest=/not-real/ledger.db;; esac; d=$dest; printf x > "$d"')?.reason).toContain("ledger");
		expect(row10('case a in a) case b in b) dest=/not-real/ledger.db;; esac;; esac; printf x > "$dest"')?.reason).toContain("one of /not-real/ledger.db");
		expect(row10('case a in a) dir=/not-real;; b) dir=/tmp;; esac; printf x > "$dir/ledger.db"')?.reason).toContain("one of /not-real/ledger.db | /tmp/ledger.db");
	});

	test("cd in an arm: after esac the directory is unknown, and a relative ledger name refuses", () => {
		const command = "cd /tmp; case x in a) cd /not-real;; esac; printf x > ledger.db";
		const last = expandShell(command, "/tmp", env).commands.at(-1)!;
		expect(last.dirKnown).toBe(false);
		expect(row10(command)?.reason).toContain("a shell redirect into the ledger file (> ledger.db)");
		expect(row10("case x in a) cd /not-real;; esac; printf x > ledger.db-wal")?.reason).toContain("> ledger.db-wal");
		expect(row10("case x in a) cd /not-real;; esac; tee ledger.db < /dev/null")?.reason).toContain("`tee` writing the ledger file");
		expect(row10("case x in a) cd /not-real;; esac; sqlite3 ledger.db .tables")?.reason).toContain("a relative path after a cd to a directory the gate does not know");
		// arms that agree keep the directory known
		expect(expandShell("cd /tmp; case x in a) cd /tmp;; esac; printf x > ledger.db", "/tmp", env).commands.at(-1)?.dirKnown).toBe(true);
		expect(row10("cd /tmp; case x in a) cd /tmp;; esac; printf x > ledger.db")).toBeNull();
	});

	test("fall-through: a ;& or ;;& arm's state reaches later arms; a ;; arm's does not", () => {
		expect(row10('case a in a) dest=/not-real/ledger.db;& b) printf x > "$dest";; esac')?.reason).toContain("one of /not-real/ledger.db");
		expect(row10('case a in a) dest=/not-real/ledger.db;;& b) :;; c) printf x > "$dest";; esac')?.reason).toContain("one of /not-real/ledger.db");
		expect(seen('case a in a) dest=/not-real/ledger.db;; b) printf x > "$dest";; esac')).toEqual([{ argv: ["printf", "x"], redirects: [""] }]);
		expect(row10('case a in a) dest=/not-real/ledger.db;; b) printf x > "$dest";; esac')).toBeNull();
		expect(row10('case a in a) cd /not-real;& b) printf x > ledger.db;; esac')?.reason).toContain("> ledger.db");
	});

	test("a join with no protected value is not a refusal, and a value every path agrees on stays known", () => {
		expect(row10('case x in a) out=/tmp/a;; b) out=/tmp/b;; esac; printf x > "$out"')).toBeNull();
		expect(row6("case x in a) mode=1;; b) mode=2;; esac; echo $mode")).toBeNull();
		expect(seen("x=1; case y in a) x=1;; b) :;; esac; echo $x")).toEqual([{ argv: [":"], redirects: [] }, { argv: ["echo", "1"], redirects: [] }]);
		expect(seen("x=1; case y in a) x=2;; esac; echo $x")).toEqual([{ argv: ["echo", "{1,2}"], redirects: [] }]);
	});
});

describe("B2: a later +n or +o noexec turns execution back on", () => {
	const dir = tmp("noexec-b2");
	const script = join(dir, "run-proof.sh");
	writeFileSync(script, "git push --force origin feature\n");
	const ran = (command: string) => expandShell(command, dir, env).commands.map((c) => c.argv.map((w) => w.text).join(" "));
	const heredoc = "<<'EOF'\ngit push --force origin feature\nEOF";

	test("-n +n, -n +o noexec, -n +xn: the script and the stdin commands run and are judged", () => {
		// live, 2026-10-11 (REVIEW.md Reproduction B): `bash -n +n` and `bash -n +o noexec` printed EXECUTED; `zsh -f -n +n` too.
		for (const shell of ["bash", "zsh", "sh"]) {
			for (const opts of ["-n +n", "-n +o noexec", "-n +xn", "-n +o xtrace +n"]) {
				expect(ran(`${shell} ${opts} ${script}`)).toContain("git push --force origin feature");
				expect(row6(`${shell} ${opts} ${script}`)?.reason).toContain("force-push");
				expect(ran(`${shell} ${opts} ${heredoc}`)).toContain("git push --force origin feature");
				expect(row6(`${shell} ${opts} ${heredoc}`)?.reason).toContain("force-push");
			}
		}
	});

	test("reversed: +n -n and +o noexec -n end with noexec on, a read; so does -n +o xtrace", () => {
		for (const opts of ["+n -n", "+o noexec -n", "-n +o xtrace", "-n -- "]) {
			expect(ran(`bash ${opts} ${script}`)).toEqual([`bash ${opts.trim()} ${script}`]);
			expect(row6(`bash ${opts} ${script}`)).toBeNull();
			expect(expandShell(`bash ${opts} ${heredoc}`, dir, env).commands.length).toBe(1);
		}
	});

	test("an option the gate cannot read may be +n: no read shortcut; the script path is then blind, or the script is judged", () => {
		expect(expandShell(`bash -n $opt ${script}`, dir, env).blind[0]).toContain("runs a script path not known until it runs");
		expect(row6(`bash -n $opt ${script}`)?.reason).toContain("a command the gate cannot read to the end");
		expect(ran(`bash -n +o $opt ${script}`)).toContain("git push --force origin feature");
	});
});
