// MIGRATION.md item 81 regression tests (PLAN wl-mv0n5r9cbafe9s, revision 10.6 § 3): row 6 refuses every
// bash alias definition (§ 2 D: t1 a parsed `alias` head, t2 the unquoted text, t3 a trap action) and the
// switches that turn alias expansion on (§ 2 C). An alias runs its value under its own name, which no row
// expands: `alias g=git; g push origin main` hid a push to main from every parser row.
// The file imports only what origin/main already exports (`checkReserved`), so the fails-before run can
// take it to an archive of origin/main: there every REFUSE row is red and every ALLOW row and labeled
// control is green. Every probe is inert: the gate only reads the strings; the three fixture files sit
// in a fresh temp directory this file removes.
import { afterAll, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkReserved } from "../src/rows/r06-reserved";
import type { CallContext } from "../src/types";
import { tmp } from "./helpers";

const dir = tmp("r06-trap");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const ctx: CallContext = { role: "lane", cwd: dir, env: { HOME: "/nonexistent-home" } };
/** The session's own environment sets EMPTY to the empty string, so a gate-time `$EMPTY` expands to no word. */
const ctxEmpty: CallContext = { ...ctx, env: { ...ctx.env, EMPTY: "" } };
/** Row 6 alone on one bash call, with the bash tool's own `env` input when given, under `context` (default ctx). */
const row6 = (command: string, env?: Record<string, string>, context: CallContext = ctx) => checkReserved({ toolName: "bash", input: env ? { command, env } : { command } }, context);
const reason = (command: string, env?: Record<string, string>, context: CallContext = ctx) => row6(command, env, context)?.reason ?? "";

/** D's reason: the alias refusal, or the trap-action refusal t3 gives an action off its allowlist. */
const D_REASON = /an alias definition \(the alias runs its value under its own name, which the gate does not expand\)|a trap action the gate does not model/;
const ALIAS_REASON = "an alias definition (the alias runs its value under its own name, which the gate does not expand)";
const BLIND = "a command the gate cannot read to the end";

// Round 13: a trap that sources a file a later line reads. The file holds something harmless; the
// row must refuse whatever it holds.
const payload = join(dir, "t3-payload.sh");
writeFileSync(payload, ":\n");
// A file whose EXIT trap sources itself, run with `.`: the gate reads it once and returns.
const selfSourcing = join(dir, "self-sourcing.sh");
writeFileSync(selfSourcing, `trap '. ${selfSourcing}' EXIT\n`);
// diff review r7: a sourced file whose trap action holds a raw CR, which the parser turns into a newline.
const sourcedCr = join(dir, "sourced-cr.sh");
writeFileSync(sourcedCr, "trap 'echo\r' EXIT\n");

/** § 3 REFUSE (D): every alias definition, however spelled, and every trap action off t3's allowlist. */
const DEFINITIONS: string[] = [
	"alias g=git; g push origin main", // the done line
	"alias ll='ls -l'", // Jo's "every alias"
	'alias ll="ls -l"',
	"alias ll='ls -l'; alias la='ls -a'",
	"alias g=git",
	"alias g=git\ng push origin main",
	"alias -- g=git",
	"alias -p g=git",
	'alias "$n"',
	"alias c=$X",
	'alias x="$(echo y)"',
	"alias g*", // a glob can match a file named g=git
	String.raw`$'al\x69as' g=git`,
	"$'alias' g=git",
	"a{l,}ias g=git",
	"al''ias g=git",
	'"al"ias g=git',
	String.raw`al\ias g=git`,
	"'alias' g=git",
	String.raw`\alias g=git`,
	"a=alias; $a g=git",
	"x=ias; al$x g=git",
	"a=ali; b=as; $a$b g=git",
	"a=alias\n(a=x)\n$a g=git", // t2: the model computes head `x`, the text still spells it
	"eval 'alias g=git'",
	"eval alias g=git",
	"if alias g=git; then :; fi",
	"alias ll='ls -l' || alias la='ls -a'",
	"alias printf='echo git'\nprintf push origin main | bash",
	"alias e='echo x'\necho `e`",
	"al\\\nias g=git", // bash joins a backslash-newline pair before it splits words
	"alias {a,b}", // t1 expanded operand; a named false refusal (two queries, no definition)
	// PLAN-rev9.md § 4, round 7: the quote-mask witness and its kin
	"v=POSIXLY_CORRE\nw=CT=1\nz=x\nalias x=\"'\"\n> /dev/null${z:${v}${w}}\nalias alias=echo\nalias \"'\"",
	"alias x=\"'>'\"",
	"alias x=\"a'b\"",
	"if alias g=git; then alias h=x; fi",
	"while alias g=git; do alias h=x; done",
	"alias g=git\ncat <<E\nx\nE",
	'$"alias" g=git',
	// PLAN-rev9.md § 4, round 6
	"v=POSIXLY_CORRE\nw=CT=1\nz=x\nalias alias=git > /dev/null${z:${v}${w}}\nalias push origin main",
	"alias g=git > /tmp/x",
	"alias g=git && alias -p > /tmp/x",
	'alias g="git $X"',
	"alias g=git # c",
	// round 11 (t3: a trap action runs later inside the shell itself)
	"trap 'al\\\nias g=git' EXIT",
	String.raw`trap $'al\x69as g=git' EXIT`,
	"trap 'alias g=git' DEBUG",
	"trap 'alias g=git' ERR",
	"trap \"trap 'alias g=git' EXIT\" DEBUG", // nested
	'trap "$a" EXIT', // opaque action
	"trap '$a$b g=git' DEBUG", // expanded head in an action
	"trap -- 'alias g=git' EXIT",
	// round 13 (t3 allowlist)
	String.raw`trap "source /dev/stdin <<< \$'\141lias g=git'" DEBUG`,
	`printf '\\141lias g=git\\n' > ${payload}\ntrap '. ${payload}' DEBUG\n:`,
	`. ${selfSourcing}`,
	"trap 'eval x' EXIT",
	"trap 'bash -c :' EXIT",
	"trap 'echo x > /tmp/f' EXIT",
	`trap 'printf "%s" "$(date)"' EXIT`,
	// round 14 (t3 condition 6: the action cannot define a function)
	String.raw`trap 'echo() { eval "$1"; }' DEBUG; echo "$(printf '\141lias g=git')"; trap - DEBUG`,
	"trap 'function rm { :; }' EXIT",
	"trap 'kill() { :; }' DEBUG",
	// round 15
	`trap ': "<<true"\necho() { eval "$1"; }\ntrue' DEBUG; echo "$(printf '\\141lias g=git')"; trap - DEBUG`,
	"trap 'function echo if :; then :; fi' DEBUG",
	"trap 'echo x <<< y' EXIT",
	// round 16 (printf is off the allowlist: `printf -v` sets a variable the model never sees)
	String.raw`a='echo ok'; printf -v a '\141lias g=printf'; trap "$a" DEBUG`, // opaque action, empty text
	"trap 'printf -v a x' DEBUG",
	"trap 'printf done' EXIT",
	// round 12 (t2 decoded words: text the gate never parses as code)
	String.raw`PS4=$'$(al\x69as g=git; al\x69as g)'; set -x; :; set +x`,
	String.raw`a=$'x[$(al\x69as g=git)]'; : $((a))`,
	String.raw`echo $'al\x69as g=git' | bash`,
];

/**
 * § 3 REFUSE (D, t3) from diff review r1: statements expansion drops (a bare `exec`, an empty argv with
 * its redirects) and pinned fail-closed refusals, each refused for the trap action.
 */
const TRAP_ACTIONS: string[] = [
	`trap "exec > payload.sh; echo -e '\\0141lias g=echo'" USR1`, // the review's witness: the trap rewrites a script a later `.` reads
	"trap '> /tmp/x' EXIT",
	"trap 'exec 3>/tmp/x' EXIT",
	"trap 'exec >/tmp/x' EXIT",
	"trap 'command echo x' EXIT",
	"trap 'x=1' EXIT", // pinned: an action that only assigns a variable
	"trap INT", // pinned: the lone operand is read as the action, so bash's `trap SIG` reset is refused
	// diff review r2: the parser drops a command-position word it reads as a keyword; bash runs a quoted
	// keyword or an Object.prototype name as the command, and real keyword syntax is pinned refused
	`trap '"if" echo x' EXIT`,
	`trap '"time" echo x' EXIT`,
	`trap '"!" echo x' EXIT`,
	`trap '"[[" echo x' EXIT`,
	"trap 'constructor' EXIT",
	"trap 'toString' EXIT",
	"trap '__proto__' EXIT",
	"trap 'if true; then echo x; fi' EXIT", // pinned: keyword syntax in a trap action
	String.raw`trap 'echo x > $'\''/dev/null'\''' EXIT`, // pinned: an expanded redirect target, even one that decodes to /dev/null
	// diff review r3: a backquote body is parsed below top level, where a dropped keyword is never
	// recorded, so condition 6 refuses any backquote; a redirect-only statement is pinned refused
	"trap 'echo `echo nested; constructor`' EXIT",
	`trap 'echo \`"if" echo x\`' EXIT`,
	"trap 'echo `if true; then constructor; fi`' EXIT",
	"trap 'echo `date`' EXIT", // pinned: any backquote, even one that only runs date
	"trap '> /dev/null' EXIT", // pinned: a redirect-only statement, even to /dev/null
	"trap 'echo ok; > /dev/null' EXIT",
	// diff review r5: condition 6 is a character allowlist; the parser turns CR into a newline where
	// bash runs a command named `echo\r`, and globs, `#`, `\` and `~` are refused with it
	String.raw`trap $'echo\r' EXIT`,
	String.raw`trap $'echo ok >/dev/null\r' EXIT`,
	"trap 'rm -f /tmp/x*' EXIT",
	"trap 'echo a # b' EXIT",
	"trap 'echo \\x' EXIT", // the action text is `echo \x`, one backslash
	"trap 'rm -f ~/x' EXIT",
	// diff review r6: a raw CR byte inside a quoted action; parseShell turns it into a newline before
	// any row sees it, where bash runs a command named `echo\r`, so any CR beside a trap is refused
	"trap 'echo\r' EXIT",
	"trap 'echo ok >/dev/null\r' EXIT",
	"trap 'echo\r\ntrue' EXIT",
	// diff review r7: a trap set from eval'd or sourced text is parsed afresh from normalized, decoded
	// text, and the parser's $'…' decoding differs from bash 3.2's, so eval, source, `.` or any $'
	// beside a trap is refused
	String.raw`eval $'trap \'echo\r\' EXIT'`,
	String.raw`trap $'\U00000065cho X' EXIT`,
	String.raw`trap $'echo ok >/dev/\u006eull' EXIT`,
	"eval \"trap 'echo ok' EXIT\"",
	`. ${sourcedCr}`,
];

/**
 * § 3 REFUSE (D, t3) under ctxEmpty: a trap action's variables take their values when it runs, so
 * `$EMPTY` in command position is an unknown head even though the session's env sets it to "".
 */
const TRAP_ACTIONS_EMPTY_ENV: string[] = [
	"EMPTY=eval; trap '$EMPTY echo ok' EXIT",
	"EMPTY=eval; trap '$EMPTY' EXIT",
	String.raw`printf -v EMPTY '\141lias'; trap '$EMPTY echo x=y' EXIT`,
];

/** § 3 REFUSE (D) rows that also name a switch C refuses: D runs before C, so the reason is D's. */
const D_BEFORE_C: [string, Record<string, string>?][] = [
	["shopt -s expand_aliases\nalias g=git\ng push origin main"],
	["POSIXLY_CORRECT=1\nalias alias=git\nalias push origin main"], // round 6
	["alias alias=git\nalias push origin main", { POSIXLY_CORRECT: "1" }], // round 6
	["alias alias='echo R8'\nalias MARKER", { POSIX_PEDANTIC: "1" }], // round 8
	["alias alias='echo R8'\nalias MARKER", { "BASH_FUNC_alias%%": '() { builtin alias "$@"; }' }], // round 8
];

/** § 3 REFUSE (C): the switches that turn alias expansion on, with the name the reason gives. */
const SWITCHES: [string, string, Record<string, string>?][] = [
	["shopt -s expand_aliases", "expand_aliases"],
	["shopt -s 'expand_aliases'", "expand_aliases"],
	['shopt -s expand_"aliases"', "expand_aliases"],
	["shopt -qs expand_aliases", "expand_aliases"],
	["shopt -s -o posix", "posix"],
	["set -o posix", "posix"],
	["set -eo posix", "posix"],
	["set -oe posix", "posix"],
	['set -o "$x"', "posix"],
	["POSIXLY_CORRECT=1", "POSIXLY_CORRECT"],
	["export POSIXLY_CORRECT=1", "POSIXLY_CORRECT"],
	['declare POSIX"LY_CORRECT"=1', "POSIXLY_CORRECT"],
	["echo ok", "POSIXLY_CORRECT", { POSIXLY_CORRECT: "1" }],
	["echo ok", "SHELLOPTS", { SHELLOPTS: "posix" }],
	["echo ok", "POSIX_PEDANTIC", { POSIX_PEDANTIC: "1" }],
	["echo ok", "BASH_FUNC_x%%", { "BASH_FUNC_x%%": "() { :; }" }],
];

/** § 3 labeled controls: refused on origin/main already, for the old reason; now refused for either. */
const CONTROLS: [string, string, string][] = [
	["command alias g=git", "`command` wraps the command", ALIAS_REASON],
	["builtin alias g=git", "`builtin` wraps the command", ALIAS_REASON],
	["bash -c 'alias g=git'", "`bash` started as a second shell", ALIAS_REASON],
	["x=$(alias g=git)", BLIND, ALIAS_REASON],
	["BASH_ALIASES[g]=git", BLIND, "`BASH_ALIASES` named in the command"], // a glob head on origin/main
	["b[POSIXLY_CORRECT=1]=x\nalias alias=git\nalias push origin main", BLIND, ALIAS_REASON], // round 6, a glob head on origin/main
	["alias x='a", BLIND, ALIAS_REASON], // round 7, an unterminated quote: refused by the fails-before run
	['alias x="a', BLIND, ALIAS_REASON], // round 7, the same
];

/** § 3 ALLOW: queries, removals, mentions, the switches that are not alias expansion, and allowlisted traps. */
const ALLOWED: string[] = [
	"alias",
	"alias -p",
	"alias ll",
	"alias -p ll",
	"unalias ll",
	"unalias -a",
	"alias -p; pwd",
	"grep alias /dev/null",
	"echo alias",
	'git commit -m "add alias support"',
	"bun test gates/test/r06-alias.test.ts gates/test/review-round5.test.ts gates/test/manifest-sync.test.ts", // the declared artifact, verbatim
	"set -o pipefail",
	"set -o",
	"set -euo pipefail",
	"set -e",
	'set -- "$@"',
	"set -- posix",
	"export X=1",
	'export PATH="$PATH:/x"',
	"shopt -s nullglob",
	"shopt -u nullglob",
	`tmp=/tmp/x; trap 'rm -f "$tmp"' EXIT`,
	"trap 'echo done' EXIT",
	"trap 'echo done >/dev/null' EXIT",
	"trap 'rm -f /tmp/x' EXIT",
	"trap 'kill 0' INT",
	"trap - EXIT",
	"trap -p",
	'trap -p "$sig"',
	'trap - "$sig"',
	`trap 'echo done' "$sig"`,
	`trap 'kill "$pid"' EXIT`,
	`trap 'rm -f "$a" "$b" 2>/dev/null' EXIT`,
	"trap '' INT",
	"PS4='+ $LINENO '; set -x; :; set +x",
	"echo ok\r", // a CR outside any trap command is not refused by t3's CR check
];

describe("item 81 (D): every alias definition is refused", () => {
	test("the tables carry every § 3 row", () => {
		expect(DEFINITIONS.length + D_BEFORE_C.length).toBe(76);
		expect(SWITCHES.length).toBe(16);
		expect(CONTROLS.length).toBe(8);
		expect(ALLOWED.length).toBe(36);
		expect(TRAP_ACTIONS.length).toBe(36);
		expect(TRAP_ACTIONS_EMPTY_ENV.length).toBe(3);
	});
	for (const command of DEFINITIONS) {
		test(`REFUSE: ${JSON.stringify(command)}`, () => {
			expect(row6(command)).not.toBeNull();
			expect(reason(command)).toMatch(D_REASON);
		});
	}
	for (const [command, env] of D_BEFORE_C) {
		test(`REFUSE, D's reason before C's: ${JSON.stringify(command)}${env ? ` with env ${JSON.stringify(env)}` : ""}`, () => {
			expect(row6(command, env)).not.toBeNull();
			expect(reason(command, env)).toContain(ALIAS_REASON);
		});
	}
	test("the done line's two rows name the alias definition", () => {
		expect(reason("alias g=git; g push origin main")).toContain(ALIAS_REASON);
		expect(reason("alias ll='ls -l'")).toContain(ALIAS_REASON);
		expect(reason("alias ll='ls -l'")).toContain("Spell it as the command typed out where it runs, without an alias.");
	});
	test("a trap action off the allowlist names the trap action", () => {
		expect(reason("trap 'printf done' EXIT")).toContain("a trap action the gate does not model");
	});
	for (const command of TRAP_ACTIONS) {
		test(`REFUSE (trap action): ${JSON.stringify(command)}`, () => {
			expect(row6(command)).not.toBeNull();
			expect(reason(command)).toContain("a trap action the gate does not model");
		});
	}
	for (const command of TRAP_ACTIONS_EMPTY_ENV) {
		test(`REFUSE (trap action) with ctx env EMPTY="": ${JSON.stringify(command)}`, () => {
			expect(row6(command, undefined, ctxEmpty)).not.toBeNull();
			expect(reason(command, undefined, ctxEmpty)).toContain("a trap action the gate does not model");
		});
	}
});

describe("item 81 (C): the switches that turn alias expansion on are refused", () => {
	for (const [command, name, env] of SWITCHES) {
		test(`REFUSE (${name}): ${JSON.stringify(command)}${env ? ` with env ${JSON.stringify(env)}` : ""}`, () => {
			expect(row6(command, env)).not.toBeNull();
			expect(reason(command, env)).toContain(`\`${name}\``);
		});
	}
});

describe("item 81: labeled controls, refused before the change for another reason", () => {
	for (const [command, old, now] of CONTROLS) {
		test(`REFUSE (control): ${JSON.stringify(command)}`, () => {
			const why = reason(command);
			expect(row6(command)).not.toBeNull();
			expect(why.includes(old) || why.includes(now)).toBe(true);
		});
	}
});

describe("item 81: what is not a definition or a switch stays allowed", () => {
	for (const command of ALLOWED) test(`ALLOW (row 6): ${JSON.stringify(command)}`, () => expect(row6(command)).toBeNull());
});
