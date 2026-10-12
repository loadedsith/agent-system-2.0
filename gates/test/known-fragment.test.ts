// MIGRATION.md item 102: a write destination built from a known part and an unknown part is judged
// by rows 6 and 10 (plan: agent-scratch/agent-system-2.0/wl-mv4rzy7en8ejuo/PLAN.md, revision 4). The
// parser keeps the known text around an unknown part as fragments (`head` before the first unknown
// part, `tail` after the last); row 10 refuses when a fragment may be the ledger with its known parts
// reaching the ledger or its directory, and row 6 when a candidate or a fragment's known text has a
// `.git` component. Each case below is a row of the plan's table, judged by each row on its own
// (checkReserved, checkRawLedgerWrite), so a row-10 change behind a row-6 refusal is asserted too.
// `$UNKNOWN` and `$D` are unset; cwd /tmp, HOME /nonexistent-home, the ledger /not-real/ledger.db.
// `fragments` is read as optional, so this file loads on a tree without it.
import { describe, expect, test } from "bun:test";
import { checkReserved } from "../src/rows/r06-reserved";
import { checkRawLedgerWrite } from "../src/rows/r10-raw-ledger";
import { parseShell } from "../src/shell-parse";
import type { CallContext } from "../src/types";

const env = { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: "/not-real/ledger.db" };
const ctx: CallContext = { role: "lane", cwd: "/tmp", env };
const call = (command: string) => ({ toolName: "bash", input: { command } });
const row6 = (command: string) => checkReserved(call(command), ctx);
const row10 = (command: string) => checkRawLedgerWrite(call(command), ctx);
const parse = (command: string) => parseShell(command, { cwd: "/tmp", env });
/** The last command's first redirect target, with `fragments` read as optional. */
const target = (command: string) => {
	const w = parse(command).commands.at(-1)?.redirects[0]?.target;
	return { text: w?.text, opaque: w?.opaque, candidates: w?.candidates, fragments: (w as { fragments?: { head: string; tail: string }[] } | null | undefined)?.fragments };
};

const ROW10 = "P-11 row 10 refused this";
const REDIRECT = "a shell redirect into the ledger file";
const DOT_GIT = "writing inside a .git directory";

/** The plan's bold row-10 cases: row 10 refuses (with this reason text), row 6 as the plan's table says. */
const row10Refusals: [id: string, command: string, reason: string, row6Refuses: boolean][] = [
	["E", 'case a in a) f=ledger.db; cd /not-real;; esac; printf x > "$f$UNKNOWN"', `${REDIRECT} (> one of ledger.db…)`, false],
	["1", 'printf x > "/not-real/$UNKNOWN"', `${REDIRECT} (> one of /not-real/…)`, false],
	["2", 'printf x > "/not-real$UNKNOWN"', `${REDIRECT} (> one of /not-real…)`, false],
	["3", 'printf x > "/not-real/led$UNKNOWN"', `${REDIRECT} (> one of /not-real/led…)`, false],
	["4", 'case a in a) d=/not-real;; esac; printf x > "$d/$UNKNOWN"', `${REDIRECT} (> one of /not-real/…)`, false],
	["5", 'printf x > "$UNKNOWN/ledger.db"', `${REDIRECT} (> one of …/ledger.db)`, false],
	["6", 'printf x > "$(dirname x)/ledger.db-wal"', `${REDIRECT} (> one of …/ledger.db-wal)`, false],
	["7", 'cp /dev/null "/not-real/$UNKNOWN"', "`cp` writing the ledger file", false],
	["8", 'sort --output="/not-real/$UNKNOWN" /dev/null', "`sort` writing the ledger file", false],
	["9", 'cp /dev/null --target-directory="/not-real$UNKNOWN"', "`cp` writing the ledger file", false],
	["10", 'cd "$D"; printf x > "not-real/$UNKNOWN"', `${REDIRECT} (> one of not-real/…)`, false],
	["11", 'cd "$D"; printf x > "led$UNKNOWN"', `${REDIRECT} (> one of led…)`, false],
	["12", 'export p="/not-real/$(date)"; printf x > "$p"', `${REDIRECT} (> one of /not-real/…)`, false],
	["18", 'p="/not-real/$UNKNOWN"; printf x > "$p"', `${REDIRECT} (> one of /not-real/…)`, true],
	["19", 'export p="/not-real/$UNKNOWN"; sort -o"$p" /dev/null', "`sort` writing the ledger file", false],
	["20", 'cd "$D"; printf x > "./led$UNKNOWN"', `${REDIRECT} (> one of ./led…)`, false],
	["21", 'cd "$D"; printf x > "../not-real/led$UNKNOWN"', `${REDIRECT} (> one of ../not-real/led…)`, false],
	["22", 'bun tool.ts "$UNKNOWN/ledger.db"', "`bun` on the ledger file outside the ledger module", true],
	["23", 'bun tool.ts "/not-real/$UNKNOWN"', "`bun` on the ledger file outside the ledger module", true],
	["24", 'cp ledger.db --target-directory="/not-real$UNKNOWN"', "`cp` writing the ledger file", false],
	["25", 'cp /dev/null -t "/not-real$UNKNOWN"', "`cp` writing the ledger file", false],
	["26", 'export d="/not-real$UNKNOWN"; cp /dev/null -t"$d"', "`cp` writing the ledger file", false],
	["27", 'printf x > "/not-real/$UNKNOWN/ledger.db"', `${REDIRECT} (> one of /not-real/…/ledger.db)`, false],
	["28", 'printf x > "/not-real/x/$UNKNOWN/../ledger.db"', `${REDIRECT} (> one of /not-real/x/…/../ledger.db)`, false],
	["29", 'printf x > "/not-real/$UNKNOWN/./ledger.db"', `${REDIRECT} (> one of /not-real/…/./ledger.db)`, false],
	["30", 'printf x > "/not-real/$UNKNOWN//ledger.db-wal"', `${REDIRECT} (> one of /not-real/…//ledger.db-wal)`, false],
	// review r1 F1: a head whose last component is exactly `.` or `..` is that component completed
	// across an empty middle, so it may reach the ledger's directory
	["r1-1", 'printf x > "/not-real/.$UNKNOWN/ledger.db"', `${REDIRECT} (> one of /not-real/.…/ledger.db)`, false],
	["r1-2", 'printf x > "/not-real/sub/..$UNKNOWN/ledger.db"', `${REDIRECT} (> one of /not-real/sub/..…/ledger.db)`, false],
	["r1-3", 'cd /not-real; printf x > "x/..$UNKNOWN/ledger.db"', `${REDIRECT} (> one of x/..…/ledger.db)`, false],
	["r1-4", 'printf x > "/not-real/.$UNKNOWN//ledger.db-wal"', `${REDIRECT} (> one of /not-real/.…//ledger.db-wal)`, false],
	["r1-5", 'cd "$D"; printf x > "x/..$UNKNOWN/ledger.db"', `${REDIRECT} (> one of x/..…/ledger.db)`, false],
];

describe("item 102, row 10: a known part that reaches the ledger or its directory, around an unknown part, refuses", () => {
	for (const [id, command, expected, row6Refuses] of row10Refusals) {
		test(`case ${id}: ${command}`, () => {
			const reason = row10(command)?.reason ?? "ALLOW";
			expect(reason).toContain(ROW10);
			expect(reason).toContain(expected);
			if (row6Refuses) expect(row6(command)).not.toBeNull();
			else expect(row6(command)).toBeNull();
		});
	}
});

describe("item 102, row 6: a .git destination a case left, or a .git component beside an unknown part, refuses", () => {
	for (const [id, command] of [
		["13", 'case a in a) d=.git;; esac; printf x > "$d/config"'],
		["14", 'case a in a) d=.git;; esac; printf x > "$d/$UNKNOWN"'],
	] as const) {
		test(`case ${id}: ${command}`, () => {
			expect(row6(command)?.reason ?? "ALLOW").toContain(DOT_GIT);
			expect(row10(command)).toBeNull();
		});
	}
});

describe("rows 15-17 of the plan's table: refused before item 102, unchanged", () => {
	test("15, 16: the ledger's own path in the known text refuses on row 10, not on row 6", () => {
		for (const command of ['printf x > "/not-real/ledger.db$UNKNOWN"', 'tee "/not-real/ledger.db$UNKNOWN" < /dev/null']) {
			const reason = row10(command)?.reason ?? "ALLOW";
			expect(reason).toContain(ROW10);
			expect(reason).toContain("/not-real/ledger.db");
			expect(row6(command)).toBeNull();
		}
	});

	test("17: a .git component in the known text refuses on row 6, not on row 10", () => {
		for (const command of ['printf x > ".git/$UNKNOWN"', 'printf x > "$UNKNOWN/.git/config"', 'printf x > ".git$UNKNOWN"']) {
			expect(row6(command)?.reason ?? "ALLOW").toContain(DOT_GIT);
			expect(row10(command)).toBeNull();
		}
	});
});

describe("allow controls: ordinary writes with an unknown part stay allowed on both rows", () => {
	for (const command of [
		'printf x > "/tmp/out-$(date +%s).log"',
		'printf x > "$TMPDIR/x"',
		'printf x > "/tmp/$UNKNOWN"',
		'echo hi > "$HOME/notes-$UNKNOWN.txt"',
		'tee "/tmp/build-$UNKNOWN.log" < /dev/null',
		'printf x > "/not-real/other-$UNKNOWN"',
		'printf x > "/not-really/$UNKNOWN"',
		'printf x > "/no$UNKNOWN"',
		'printf x > "$UNKNOWN"',
		'printf x > "$UNKNOWN.db"',
		'cd /not-real; printf x > "out-$UNKNOWN"',
		'cd "$D"; printf x > "out-$UNKNOWN"',
		'export p="/tmp/$(date)"; printf x > "$p"',
		'printf x > "/tmp/$UNKNOWN/ledger.db"',
		'printf x > "/not-real/$UNKNOWN/other.db"',
		'printf x > "/tmp/.$UNKNOWN/ledger.db"',
		'printf x > "/not-real/sub/..$UNKNOWN/other.db"',
	]) {
		test(command, () => {
			expect(row6(command)).toBeNull();
			expect(row10(command)).toBeNull();
		});
	}
});

describe("parser: a word keeps the known text around its unknown part (PLAN step 1)", () => {
	test('the item\'s "$f$UNKNOWN": one fragment, head ledger.db; text, opaque and candidates as before', () => {
		const w = target('case a in a) f=ledger.db; cd /not-real;; esac; printf x > "$f$UNKNOWN"');
		expect(w.fragments).toEqual([{ head: "ledger.db", tail: "" }]);
		expect(w.text).toBe("");
		expect(w.opaque).toBe(true);
		expect(w.candidates).toBeUndefined();
	});

	test("two or more unknown parts collapse into one: only the outermost known ends are kept", () => {
		expect(target('printf x > "/a/$UNKNOWN/b/$V/c"').fragments).toEqual([{ head: "/a/", tail: "/c" }]);
		expect(target('printf x > "/a/$UNKNOWN/b/$V/c"').text).toBe("/a//b//c");
	});

	test("a substitution, an unknown variable before a known name, and a word with no known part", () => {
		expect(target('printf x > "/tmp/out-$(date +%s).log"').fragments).toEqual([{ head: "/tmp/out-", tail: ".log" }]);
		expect(target('printf x > "$UNKNOWN/ledger.db"').fragments).toEqual([{ head: "", tail: "/ledger.db" }]);
		const bare = target('printf x > "$UNKNOWN"');
		expect(bare.fragments).toBeUndefined();
		expect(bare.opaque).toBe(true);
	});

	test("a variable keeps a value with an unknown middle (PLAN step 3), beside a case's known values", () => {
		expect(target('export p="/not-real/$(date)"; printf x > "$p"').fragments).toEqual([{ head: "/not-real/", tail: "" }]);
		const joined = target('case a in a) p="/x/$UNKNOWN";; b) p=/y;; esac; printf x > "$p.log"');
		expect(joined.candidates).toEqual(["/y.log"]);
		expect(joined.fragments).toEqual([{ head: "/x/", tail: ".log" }]);
		// an assignment whose known head ends at NAME= keeps nothing: the value stays unknown
		expect(target('p="$UNKNOWN"; printf x > "$p"').fragments).toBeUndefined();
	});
});

describe("the 64-value bound counts fragments", () => {
	/** A `case` that gives `name` each of `n` values `<prefix>1` … `<prefix>n`. */
	const values = (name: string, n: number, prefix: string) => `case z in ${Array.from({ length: n }, (_, i) => `${i + 1}) ${name}=${prefix}${i + 1};;`).join(" ")} esac`;
	const bound = "a word with more than 64 possible values (variables a `case` assigned)";

	test("9 heads × 8 tails around an unknown part is 72 values: a failure, and the rows refuse", () => {
		const command = `${values("a", 9, "/h")}; ${values("b", 8, "/t")}; printf x > "$a$UNKNOWN$b"`;
		expect(parse(command).failures).toContain(bound);
		expect(row6(command)).not.toBeNull();
	});

	test("control: 8 heads × 8 tails is 64 values, within the bound, and the word keeps all 64 fragments", () => {
		const command = `${values("a", 8, "/h")}; ${values("b", 8, "/t")}; printf x > "$a$UNKNOWN$b"`;
		expect(parse(command).failures).toEqual([]);
		const fragments = target(command).fragments ?? [];
		expect(fragments).toHaveLength(64);
		expect(new Set(fragments.map((f) => JSON.stringify(f))).size).toBe(64);
	});
});
