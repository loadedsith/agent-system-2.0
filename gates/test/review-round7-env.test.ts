// M4 fix round 7 regression tests, environment and implicit-output hand: astra-7
// (review-astra-7/REVIEW.md) B3 (interpreter environment variables with write or preload effects)
// and B5 (read-only heads with implicit outputs: `file -C`). Every P11/P20 probe string for these two
// findings is here verbatim with its verdict after this round; class variants follow per finding.
// Every probe is inert: the gate only reads the strings; targets sit under /not-real or inside a
// test-owned temp repository, and nothing here runs node, perl or file.
import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { checkToolCall } from "../src/gates";
import { checkReserved } from "../src/rows/r06-reserved";
import { checkRawLedgerWrite } from "../src/rows/r10-raw-ledger";
import type { CallContext, Refusal } from "../src/types";
import { git, tmp } from "./helpers";

/** An inert repository on `topic` (so row 9 has no protected-branch reason of its own). */
const repo = realpathSync(tmp("round7-env-repo"));
git(repo, "init", "-q", "-b", "main");
git(repo, "commit", "-q", "--allow-empty", "-m", "one");
git(repo, "switch", "-q", "-c", "topic");
mkdirSync(join(repo, "sub"));
/** A directory outside any repository, and a link inside the repository that points at it. */
const outside = realpathSync(tmp("round7-env-outside"));
symlinkSync(outside, join(repo, "outlink"));

const LEDGER = "/not-real/ledger.db";
const ctx: CallContext = { role: "lane", cwd: repo, env: { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: LEDGER } };
/** B5's configuration: the ledger is `magic.mgc` in the working directory, where `file -C -m magic` writes. */
const mgcCtx: CallContext = { ...ctx, env: { ...ctx.env, AGENT_SYSTEM_LEDGER_DB: join(repo, "magic.mgc") } };

type V = "ALLOW" | "REFUSE";
const call = (command: string) => ({ toolName: "bash", input: { command } });
const verdict = (r: Refusal): V => (r === null ? "ALLOW" : "REFUSE");
const composed = (command: string, c: CallContext = ctx): V => verdict(checkToolCall(call(command), c));
const reason = (command: string, c: CallContext = ctx): string => checkToolCall(call(command), c)?.reason ?? "";

/** [probe section or "variant", finding, command, verdict now]. */
const B3: [string, string, string, V][] = [
	["P11", "B3", `NODE_OPTIONS="--redirect-warnings=/not-real/ledger.db" node -e 'process.emitWarning("x")'`, "REFUSE"],
	["P11", "B3", `NODE_OPTIONS="--require /not-real/runner.js" node -e "0"`, "REFUSE"],
	["P11", "B3", `env NODE_OPTIONS="--redirect-warnings=/not-real/ledger.db" node -e 'process.emitWarning("x")'`, "REFUSE"],
	["P11", "B3", `PERL5OPT="-MFoo" perl -e "0"`, "REFUSE"],
	["P20", "B3", `NODE_OPTIONS="--import=data:text/javascript,console.log(%22R7_PRELOAD%22)" node -e 'console.log("R7_INLINE")'`, "REFUSE"],
	// The same sink, spelled every way Node reads it (underscore names, a separate value word, the variable form, exported earlier).
	["variant", "B3", `NODE_OPTIONS=--redirect_warnings=/not-real/ledger.db node -e 0`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS="--redirect-warnings /not-real/ledger.db" node -e 0`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS='"--redirect-warnings=/not-real/ledger.db"' node -e 0`, "REFUSE"],
	["variant", "B3", `NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0`, "REFUSE"],
	["variant", "B3", `export NODE_OPTIONS=--redirect-warnings=/not-real/ledger.db; node -e 0`, "REFUSE"],
	["variant", "B3", `export NODE_OPTIONS=--redirect-warnings=/not-real/ledger.db`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS=--redirect-warnings=/not-real/ledger.db-wal node -e 0`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS=--redirect-warnings=warnings.log node -e 0`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS=--redirect-warnings node -e 0`, "REFUSE"],
	// Preloads and loaders: code the gate does not read.
	["variant", "B3", `NODE_OPTIONS="-r /not-real/runner.js" node -e 0`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS=--import=/not-real/runner.mjs node x.js`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS="--loader /not-real/l.mjs" node x.js`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS=--experimental-loader=/not-real/l.mjs node x.js`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS=--inspect node x.js`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS='"--no-warnings' node x.js`, "REFUSE"],
	["variant", "B3", `BUN_OPTIONS="--preload /not-real/p.ts" bun test`, "REFUSE"],
	["variant", "B3", `BUN_OPTIONS=-r/not-real/p.ts bun test`, "REFUSE"],
	["variant", "B3", `BUN_OPTIONS="-c /not-real/bunfig.toml" bun test`, "REFUSE"],
	["variant", "B3", `PYTHONSTARTUP=/not-real/s.py python3`, "REFUSE"],
	["variant", "B3", `PYTHONPATH=/not-real python3 -c 0`, "REFUSE"],
	["variant", "B3", `NODE_PATH=/not-real node x.js`, "REFUSE"],
	["variant", "B3", `PERL5LIB=/not-real perl -e 0`, "REFUSE"],
	["variant", "B3", `PERL5OPT=-wMFoo perl -e 0`, "REFUSE"],
	["variant", "B3", `RUBYOPT=-rfoo ruby -e 0`, "REFUSE"],
	["variant", "B3", `LD_PRELOAD=/not-real/x.so ls`, "REFUSE"],
	["variant", "B3", `DYLD_INSERT_LIBRARIES=/not-real/x.dylib ls`, "REFUSE"],
	["variant", "B3", `env DYLD_INSERT_LIBRARIES=/not-real/x.dylib ls`, "REFUSE"],
	["variant", "B3", `export LD_PRELOAD=/not-real/x.so`, "REFUSE"],
	["variant", "B3", `BASH_ENV=/not-real/x.sh true`, "REFUSE"],
	["variant", "B3", `JAVA_TOOL_OPTIONS=-javaagent:/not-real/a.jar java -version`, "REFUSE"],
	["variant", "B3", `env -S "NODE_OPTIONS=--require=/not-real/x.js node -e 0"`, "REFUSE"],
	// Values the gate cannot read.
	["variant", "B3", `NODE_OPTIONS="$X" node -e 0`, "REFUSE"],
	["variant", "B3", `NODE_OPTIONS=$(cat /not-real/opts) node -e 0`, "REFUSE"],
	["variant", "B3", `P=/not-real/ledger.db; NODE_OPTIONS="--redirect-warnings=$P" node -e 0`, "REFUSE"],
	["variant", "B3", `export NODE_OPTIONS; node -e 0`, "REFUSE"],
	// Controls: settings that load nothing and write nowhere the gate protects.
	["variant", "control", `NODE_OPTIONS=--redirect-warnings=/not-real/warnings.log node -e 0`, "ALLOW"],
	["variant", "control", `NODE_OPTIONS=--max-old-space-size=4096 node x.js`, "ALLOW"],
	["variant", "control", `NODE_OPTIONS="--no-warnings --enable-source-maps" bun test`, "ALLOW"],
	["variant", "control", `NODE_OPTIONS=--no-warnings; export NODE_OPTIONS; node -e 0`, "ALLOW"],
	["variant", "control", `BUN_OPTIONS=--smol bun test`, "ALLOW"],
	["variant", "control", `PYTHONUNBUFFERED=1 python3 -c 'print(1)'`, "ALLOW"],
	["variant", "control", `PERL5OPT=-w perl -e 0`, "ALLOW"],
	["variant", "control", `RUBYOPT=-W0 ruby -e 0`, "ALLOW"],
	["variant", "control", `NODE_ENV=production bun run build`, "ALLOW"],
	["variant", "control", `env NODE_ENV=test bun test gates`, "ALLOW"],
	["variant", "control", `node -e 'process.emitWarning("x")'`, "ALLOW"],
];

/**
 * Main's ruling (fix round 7, SPEC § A4 accidental misuse): the interpreter module-path family
 * (PYTHONPATH, NODE_PATH, PERL5LIB, PERLLIB, RUBYLIB) is modeled when every entry is literal text and
 * resolves inside the repository the command runs in; anything else, and PYTHONHOME always, is refused.
 */
const MODULE_PATHS: [string, V, CallContext?][] = [
	["PYTHONPATH=. python3 -m pytest", "ALLOW"],
	["PYTHONPATH=src python3 -m pytest", "ALLOW"],
	["PYTHONPATH=./lib:src python3 x.py", "ALLOW"],
	[`PYTHONPATH=${repo}/sub python3 x.py`, "ALLOW"],
	["NODE_PATH=./sub node x.js", "ALLOW"],
	["PERL5LIB=lib perl x.pl", "ALLOW"],
	["PERLLIB=lib perl x.pl", "ALLOW"],
	["RUBYLIB=lib ruby x.rb", "ALLOW"],
	["export PYTHONPATH=src; python3 -m pytest", "ALLOW"],
	["cd sub && PYTHONPATH=.. python3 x.py", "ALLOW"],
	["PYTHONPATH=.. python3 x.py", "REFUSE"],
	["PYTHONPATH=.:/not-real python3 x.py", "REFUSE"],
	["PYTHONPATH=src:../other python3 x.py", "REFUSE"],
	["PYTHONPATH=outlink python3 x.py", "REFUSE"],
	["PYTHONPATH=outlink/../sub python3 x.py", "REFUSE"],
	["PYTHONPATH=.git/hooks python3 x.py", "REFUSE"],
	[`PYTHONPATH=${outside} python3 x.py`, "REFUSE"],
	[`PYTHONPATH="$PWD" python3 x.py`, "REFUSE"],
	["PYTHONPATH=$(pwd) python3 x.py", "REFUSE"],
	["cd $D && PYTHONPATH=. python3 x.py", "REFUSE"],
	[`cd ${outside} && PYTHONPATH=. python3 x.py`, "REFUSE"],
	["PYTHONPATH=. python3 x.py", "REFUSE", { ...ctx, cwd: outside }],
	["PYTHONHOME=. python3 x.py", "REFUSE"],
	["PYTHONUSERBASE=. python3 x.py", "REFUSE"],
	["LD_LIBRARY_PATH=. ls", "REFUSE"],
	["DYLD_LIBRARY_PATH=. ls", "REFUSE"],
];

/** B5 probes against the default ledger (P11) and against a ledger at `<cwd>/magic.mgc` (P20's configuration). */
const B5: [string, string, string, V, CallContext][] = [
	["P11", "B5", "sort --output=/not-real/ledger.db /dev/null", "REFUSE", ctx],
	["P11", "B5", "xxd -r /dev/null /not-real/ledger.db", "REFUSE", ctx],
	// Compiling the ledger as a magic source writes `ledger.db.mgc` in the working directory, not the ledger (REVIEW.md B5).
	["P11", "B5", "file -C -m /not-real/ledger.db", "ALLOW", ctx],
	["P11", "B5", "diff --output=/not-real/ledger.db a b", "REFUSE", ctx],
	["P20", "B5", "file -C -m magic", "REFUSE", mgcCtx],
	["P20", "B5", "file --compile --magic-file magic", "REFUSE", mgcCtx],
	["P20", "control", "file --version", "ALLOW", mgcCtx],
	// Every spelling of the compile option and the magic path file accepts.
	["variant", "B5", "file -Cm magic", "REFUSE", mgcCtx],
	["variant", "B5", "file -m magic -C", "REFUSE", mgcCtx],
	["variant", "B5", "file -mmagic -C", "REFUSE", mgcCtx],
	["variant", "B5", "file --comp --magic=magic", "REFUSE", mgcCtx],
	["variant", "B5", "file --magic-file=magic --compile", "REFUSE", mgcCtx],
	["variant", "B5", "file -C -m /not-real/src/magic", "REFUSE", mgcCtx],
	["variant", "B5", "file -C -m magic.mgc", "REFUSE", mgcCtx],
	["variant", "B5", "file -C -m other:magic", "REFUSE", mgcCtx],
	["variant", "B5", "file -C -m x -m magic", "REFUSE", mgcCtx],
	["variant", "B5", "file -m magic README -C", "REFUSE", mgcCtx],
	["variant", "B5", "cd sub && file -C -m ../magic", "ALLOW", mgcCtx],
	["variant", "B5", "cd sub && file -C -m magic", "ALLOW", mgcCtx],
	// Outputs the gate cannot derive.
	["variant", "B5", "file -C", "REFUSE", ctx],
	["variant", "B5", `file -C -m "$M"`, "REFUSE", ctx],
	["variant", "B5", "file -C -m $(cat /not-real/m)", "REFUSE", ctx],
	["variant", "B5", "cd $D && file -C -m magic", "REFUSE", ctx],
	["variant", "B5", "file --frobnicate x", "REFUSE", ctx],
	["variant", "B5", "file -Q x", "REFUSE", ctx],
	// Output-shaped options no other read-only head documents.
	["variant", "B5", "diff --out=/not-real/x a b", "REFUSE", ctx],
	["variant", "B5", "cat --output=/not-real/x a", "REFUSE", ctx],
	["variant", "B5", "strings --compile /not-real/x", "REFUSE", ctx],
	// Controls: compiles to a file that is not the ledger, and read-only options that only look like output.
	["variant", "control", "file -C -m other", "ALLOW", mgcCtx],
	["variant", "control", "file -m magic README", "ALLOW", mgcCtx],
	["variant", "control", "file -b gates", "ALLOW", ctx],
	["variant", "control", "file /not-real/ledger.db", "ALLOW", ctx],
	["variant", "control", "diff -u a b", "ALLOW", ctx],
	["variant", "control", "diff -- --output=x b", "ALLOW", ctx],
	["variant", "control", "od -o /not-real/x", "ALLOW", ctx],
	["variant", "control", "strings -o /not-real/x", "ALLOW", ctx],
	["variant", "control", "ls -o", "ALLOW", ctx],
];

describe("astra-7 B3: interpreter environment variables with write or preload effects", () => {
	for (const [section, finding, command, v] of B3) {
		test(`${section} ${finding}: ${command} → ${v}`, () => {
			expect(composed(command)).toBe(v);
		});
	}

	for (const [command, v, c] of MODULE_PATHS) {
		test(`module path ruling: ${command}${c ? " (cwd outside a repository)" : ""} → ${v}`, () => {
			expect(composed(command, c ?? ctx)).toBe(v);
		});
	}

	test("row 10 alone refuses the ledger sink, naming the environment", () => {
		for (const command of [
			`NODE_OPTIONS="--redirect-warnings=/not-real/ledger.db" node -e 'process.emitWarning("x")'`,
			`env NODE_OPTIONS="--redirect-warnings=/not-real/ledger.db" node -e 'process.emitWarning("x")'`,
			`NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0`,
		]) {
			expect(checkRawLedgerWrite(call(command), ctx)?.reason).toContain("told by its environment to write the ledger file");
		}
	});

	test("row 6 alone refuses preloads as unmodeled programs and names the variable", () => {
		expect(checkReserved(call(`NODE_OPTIONS="--require /not-real/runner.js" node -e "0"`), ctx)?.reason).toContain("NODE_OPTIONS loading `--require /not-real/runner.js`");
		expect(checkReserved(call(`PERL5OPT="-MFoo" perl -e "0"`), ctx)?.reason).toContain("PERL5OPT loading a module");
		expect(checkReserved(call(`LD_PRELOAD=/not-real/x.so ls`), ctx)?.reason).toContain("LD_PRELOAD=/not-real/x.so, a program or library run before the command");
	});

	test("a warnings file inside .git is refused by row 6", () => {
		const command = `NODE_OPTIONS=--redirect-warnings=${repo}/.git/hooks/pre-commit node -e 0`;
		expect(checkReserved(call(command), ctx)?.reason).toContain("write inside a .git directory");
	});
});

describe("astra-7 B5: read-only heads with implicit outputs", () => {
	for (const [section, finding, command, v, c] of B5) {
		test(`${section} ${finding}: ${command} → ${v}`, () => {
			expect(composed(command, c)).toBe(v);
		});
	}

	test("row 10 names the derived .mgc destination as the ledger write", () => {
		expect(checkRawLedgerWrite(call("file -C -m magic"), mgcCtx)?.reason).toContain("`file` writing the ledger file");
	});

	test("compiled output inside .git is refused by row 6", () => {
		expect(checkReserved(call("cd .git && file -C -m magic"), ctx)?.reason).toContain("writing inside a .git directory");
		expect(checkReserved(call("cd .git && file -C -m /not-real/src/hooks"), ctx)?.reason).toContain("writing inside a .git directory");
	});

	test("an underivable compile names the missing magic path", () => {
		expect(reason("file -C")).toContain("file -C without -m");
	});
});
