// PLAN.md (wl-mupzpidbb3ksg0) § 1: row 6 held `git log -S'<K> <D>'`, a search for the infra phrase
// that runs nothing (en-mupwhgg3veiwow). The value of git log/show `-S`, `-G` and `--grep`, in the
// attached spellings git-model reads, is data: both passes leave it out when one eligibility decision
// per call holds (a clean depth-0 parse, no wrappers, `-C <literal>` the only git global, a literal
// word, no CR, and a span that re-parses to the same word). Everything else stays refused: the
// commit-message shape (en-mupxb0mbheskcg, Jo's "log only"), separate-word values, CR spellings,
// and the phrase run through any shell, eval, xargs or substitution.
// The phrase is built from pieces so this file reads through a gated shell.
import { describe, expect, test } from "bun:test";
import { realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expandShell } from "../src/exec";
import { checkReserved, reservedAction } from "../src/rows/r06-reserved";
import { parseShell, type Word } from "../src/shell-parse";
import type { CallContext } from "../src/types";
import { git, tmp } from "./helpers";

const K = "kube" + "ctl";
const D = "del" + "ete";
/** The infra CLI name and its delete verb, the RULES `why` row 6 names for it. */
const P = `${K} ${D}`;

/** A repository on `topic` with a tracked MIGRATION.md and an executable script. */
const repo = realpathSync(tmp("r06-quoted-data"));
git(repo, "init", "-q", "-b", "main");
git(repo, "switch", "-q", "-c", "topic");
writeFileSync(join(repo, "MIGRATION.md"), "notes\n");
writeFileSync(join(repo, "s.sh"), "git log -S'a b'\n", { mode: 0o755 });
git(repo, "add", "MIGRATION.md", "s.sh");
git(repo, "commit", "-q", "-m", "one");

const ctx: CallContext = { role: "lane", cwd: repo, env: { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: "/not-real/ledger.db" } };
const row6 = (command: string) => checkReserved({ toolName: "bash", input: { command } }, ctx);

/** The observed hold en-mupwhgg3veiwow, verbatim. */
const OBSERVED_LOG = `git log --format='%h %cI %s' -S'${P}' -- MIGRATION.md`;
/** The observed hold en-mupxb0mbheskcg, verbatim (the entry body between its action prefix and the row 6 suffix). */
const OBSERVED_COMMIT = `git add -A && git commit -q -m "fix(gates,surface): row 6 stops reading eval literals as shell in code that starts no process; held reserved requests name repeats and close themselves (MIGRATION.md follow-ups 29, 31)" -m "Item 29: reservedInCode's expansion pass ran over every string literal even when the code starts no process; a literal holding a file path was followed as a script, so MIGRATION.md's backticked \\\`${K} --context X ${D}\\\` became ${P}. The pass now runs only when codeCommands finds a process start. Regression test replays en-mupu5ly5ur4s1s, en-mupub3ulxymsjk/en-mupuh35ko3eps0 and en-mupv139zgbc1z4.\n\nItem 31: reservedStates gives each reserved request a state (waiting, approved, denied, withdrawn, lane-stopped, superseded); needs-you names the earlier request a repeat matches; new lane tool lane_withdraw_reserved; decision log names why each request closed; reserved-withdrawn is a control prefix." && git log --oneline -1`;

describe("git log/show -S, -G, --grep attached values are data", () => {
	const allowed: [string, string][] = [
		["en-mupwhgg3veiwow, verbatim", OBSERVED_LOG],
		["git show -S'…'", `git show -S'${P}'`],
		["git log -G'…'", `git log -G'${P}'`],
		["git log --grep='…'", `git log --grep='${P}'`],
		["an attached value in double quotes", `git log -S"${P}" --oneline`],
		["two data words in one command", `git log -S'${P}' --grep="${P}" -- MIGRATION.md`],
		["git -C <literal path>", `git -C ${repo} log --oneline -G'${P}'`],
		["a later command that does not run the phrase", `git log -S'${P}' --oneline && git status --short`],
	];
	for (const [name, command] of allowed) test(`ALLOW ${name}`, () => expect(row6(command)).toBeNull());
});

describe("still refused, with the reason row 6 gives today", () => {
	const refused: [string, string][] = [
		["en-mupxb0mbheskcg, verbatim (commit messages are not data)", OBSERVED_COMMIT],
		["git commit -m '…'", `git commit -m '${P}'`],
		["git log -S '…' (a separate value word)", `git log -S '${P}'`],
		["git log --grep '…' (a separate value word)", `git log --grep '${P}'`],
		["the phrase run as a command", `${P} pod x`],
		["bash -c", `bash -c '${P} pod x'`],
		["sh -c", `sh -c '${P} pod x'`],
		["eval", `eval '${P} pod x'`],
		["xargs", `echo pod | xargs ${P}`],
		["$( … )", `echo $(${P} pod x)`],
		["backticks", `echo \`${P} pod x\``],
		["a -S value, then the phrase run after &&", `git log -S'${P}' && ${P} pod x`],
		["a -S value, then the phrase run after ;", `git log -S'${P}'; ${P} pod x`],
		["a -S value, then the phrase run after |", `git log -S'${P}' | ${P} pod x`],
		["a -S value, then the phrase run on the next line", `git log -S'${P}'\n${P} pod x`],
		["the same text as a -S value and in bash -c", `git log -S'${P} pod x' && bash -c '${P} pod x'`],
		["git log -S'…' inside bash -c", `bash -c "git log -S'${P}'"`],
		["git log -S'…' inside eval", `eval "git log -S'${P}'"`],
		["git log -S'…' inside $( … )", `wc -l $(git log -S'${P}')`],
		["git log -S'…' in a subshell", `(git log -S'${P}')`],
		["git -c core.pager='…' log -S'ok'", `git -c core.pager='${P} x' log -S'ok'`],
		["git -c with a modeled key", `git -c color.ui=never log -S'${P}'`],
		["xargs git log -S'…'", `echo x | xargs git log -S'${P}'`],
		["env git log -S'…'", `env git log -S'${P}'`],
		["a command-local assignment", `GIT_PAGER=cat git log -S'${P}'`],
		["git log -S\"$( … )\" (opaque)", `git log -S"$(${P} pod x)"`],
		["a value with a variable in it", `git log -S"\${HOME} ${P}"`],
		["git log -- -S'…' (a path operand)", `git log -- -S'${P}'`],
		["the same value repeated as a path operand", `git log -S'${P}' -- -S'${P}'`],
		["git log --end-of-options -S'…' (an operand)", `git log --end-of-options -S'${P}'`],
		["git diff -S'…' (not in the table)", `git diff -S'${P}'`],
		["a glob in the value", `git log -S'${P}'* -- MIGRATION.md`],
		["CR: backslash-CRLF before the phrase", `git log -S'safe'\\\r\n${P} pod x`],
		["CR: backslash and a lone CR before the phrase", `git log -S'safe'\\\r${P} pod x`],
		["CR: a CRLF in an otherwise allowed command", `git log -S'${P}' -- MIGRATION.md\r\ngit status`],
		["CR: a trailing CRLF", `${OBSERVED_LOG}\r\n`],
		["a backslash-newline inside the data word's span", `git log -S'safe'\\\n${P} pod x`],
		["git log output piped into sh", `git log -p -S'${P}' | sh`],
		["git log output piped into bash -s", `git log -S'${P}' | bash -s`],
		// git-model cannot parse the words, so it assigns no value word and nothing is masked.
		["an option git log does not list", `git log --bogus -S'${P}'`],
	];
	for (const [name, command] of refused) {
		test(`REFUSE ${name}`, () => {
			const r = row6(command);
			expect(r?.block).toBe(true);
			expect(r ? reservedAction(r) : null).toBe(P);
		});
	}

	// git's own reserved and unmodeled forms are judged on the full argv; the masked value hides none of them.
	const gitForms: [string, string, string][] = [
		["git reset --hard after a data word", `git log -S'${P}' && git reset --hard`, "git reset --hard"],
		["force-push after a data word", `git log -S'${P}' && git push --force origin topic`, "force-push"],
		["--textconv with a data word", `git log --textconv -S'${P}'`, "textconv"],
		["--ext-diff with a data word", `git log --ext-diff -S'${P}'`, "ext-diff"],
		["--output with a data word", `git log --output=/tmp/x -S'${P}'`, "output"],
	];
	for (const [name, command, why] of gitForms) {
		test(`REFUSE ${name}`, () => {
			const r = row6(command);
			expect(r?.block).toBe(true);
			// The part before the echoed command: what the refusal names, not the command text.
			expect(r?.reason.split(" Command: ")[0]).toContain(why);
		});
	}
});

describe("Word.span: set only on the opted-in top-level parse", () => {
	const env = { HOME: "/h", X: "a b" };
	const spanOf = (src: string, w: Word): string | undefined => (w.span ? src.slice(w.span[0], w.span[1]) : undefined);
	const forms = ["plain", "'single quoted'", '"double quoted"', "$'ansi\\tc'", "back\\ slash", `-S'a b'"c"d`, "--grep='x y'", "''", "-S'it'\\''s'", '"$HOME"/x'];
	for (const f of forms) {
		test(`the span of ${f} is its source spelling`, () => {
			const src = `git log ${f} --oneline`;
			const words = parseShell(src, { cwd: repo, env, spans: true }).commands[0]!.words;
			expect(words.map((w) => spanOf(src, w))).toEqual(["git", "log", f, "--oneline"]);
		});
	}
	test("offsets index the command after an earlier command and a newline", () => {
		const src = "cd /tmp && echo a\ngit log -S'x y'";
		const words = parseShell(src, { cwd: repo, env, spans: true }).commands.flatMap((c) => c.words);
		expect(words.map((w) => spanOf(src, w))).toEqual(["cd", "/tmp", "echo", "a", "git", "log", "-S'x y'"]);
	});
	test("no span without the opt-in", () => {
		const words = parseShell("git log -S'a b'", { cwd: repo, env }).commands[0]!.words;
		expect(words.every((w) => w.span === undefined)).toBe(true);
	});
	test("no span on a $( … ) or backtick word, nor on the backtick body's words", () => {
		const r = parseShell("echo $(echo a) `echo inner`", { cwd: repo, env, spans: true });
		const outer = r.commands.find((c) => c.top)!;
		expect(outer.words.slice(1).map((w) => [w.opaque, w.span])).toEqual([[true, undefined], [true, undefined]]);
		const inner = r.commands.find((c) => c.words[1]?.text === "inner")!;
		expect(inner.words.every((w) => w.span === undefined)).toBe(true);
	});
	test("no span on brace-expanded, field-split or opaque words", () => {
		const r = parseShell("echo a{b,c} $X $UNSET_Z", { cwd: repo, env, spans: true });
		const words = r.commands[0]!.words;
		expect(words.map((w) => w.text)).toEqual(["echo", "ab", "ac", "a", "b", ""]);
		expect(words.slice(1).every((w) => w.span === undefined)).toBe(true);
	});
	const nestedGit = (command: string): Word[] => {
		const e = expandShell(command, repo, ctx.env).commands.find((c) => c.argv[0]?.text === "git");
		expect(e).toBeDefined();
		return e?.argv ?? [];
	};
	test("the depth-0 parse of the tool's command carries spans", () => {
		expect(nestedGit("git log -S'a b'").every((w) => w.span !== undefined)).toBe(true);
	});
	for (const [name, command] of [
		["eval", `eval "git log -S'a b'"`],
		["bash -c", `bash -c "git log -S'a b'"`],
		["sh -c", `sh -c "git log -S'a b'"`],
		["a heredoc into bash", "bash <<'EOF'\ngit log -S'a b'\nEOF"],
		["a script read from disk", "bash ./s.sh"],
	] as const) {
		test(`no span on words from ${name}`, () => expect(nestedGit(command).every((w) => w.span === undefined)).toBe(true));
	}
});
