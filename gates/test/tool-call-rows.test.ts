// Refused and allowed cases for the tool-call rows: 4 tier name, 5 brief fields, 6 reserved
// actions, 8 push needs fetch+rebase, 9 protected-branch edit, 10 raw ledger write, 14 no `ask`.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkToolCall } from "../src/gates";
import { checkTierName } from "../src/rows/r04-tier-name";
import { checkBriefFields } from "../src/rows/r05-brief-fields";
import { checkReserved, reservedInShell } from "../src/rows/r06-reserved";
import { checkPushRebase, RebaseEvidence } from "../src/rows/r08-push-rebase";
import { checkProtectedEdit } from "../src/rows/r09-protected-edit";
import { checkRawLedgerWrite } from "../src/rows/r10-raw-ledger";
import { checkAsk } from "../src/rows/r14-ask-policy";
import type { CallContext } from "../src/types";
import { advanceOriginMain, brief, commit, git, repoWithOrigin, tmp } from "./helpers";

const lane = (cwd = tmp("cwd"), env: Record<string, string | undefined> = { HOME: "/nonexistent-home" }): CallContext => ({ role: "lane", cwd, env });

describe("row 4: a dispatch names only a tier file", () => {
	test("refuses a role name, a bundled name, and an omitted agent", () => {
		expect(checkTierName({ tasks: [{ agent: "builder", task: "x" }] })?.reason).toContain('item 0: "builder"');
		expect(checkTierName({ tasks: [{ agent: "standard", task: "x" }, { agent: "task", task: "y" }] })?.reason).toContain('item 1: "task"');
		expect(checkTierName({ tasks: [{ task: "x" }] })?.reason).toContain("no agent named");
		expect(checkTierName({ agent: "scout", task: "flat shape" })?.block).toBe(true);
	});
	test("allows each of the four tiers, batch and flat", () => {
		for (const t of ["fast", "standard", "strong", "deep"]) expect(checkTierName({ tasks: [{ agent: t, task: "x" }] })).toBeNull();
		expect(checkTierName({ agent: "deep", task: "flat" })).toBeNull();
	});
	test("orchestrator and lane are tier files but not dispatchable", () => {
		expect(checkTierName({ tasks: [{ agent: "lane", task: "x" }] })?.block).toBe(true);
		expect(checkTierName({ tasks: [{ agent: "orchestrator", task: "x" }] })?.block).toBe(true);
	});
});

describe("row 5: all six brief fields", () => {
	test("refuses a missing field and a malformed value", () => {
		const missing = checkBriefFields({ tasks: [{ agent: "fast", task: brief({ stakes: "" }) }] });
		expect(missing?.reason).toContain('missing "stakes:"');
		const bad = checkBriefFields({ tasks: [{ agent: "fast", task: brief({ stakes: "yolo", workload: "42" }) }] });
		expect(bad?.reason).toContain('"stakes: yolo" is not');
		expect(bad?.reason).toContain('"workload: 42" is not');
	});
	test("refuses per item: one complete item does not cover another", () => {
		const r = checkBriefFields({ tasks: [{ agent: "fast", task: brief() }, { agent: "fast", task: "just do it" }] });
		expect(r?.reason).toContain("item 1");
		expect(r?.reason).not.toContain("item 0");
	});
	test("allows fields in the item, in the shared context, bolded and bulleted", () => {
		expect(checkBriefFields({ tasks: [{ agent: "fast", task: brief() }] })).toBeNull();
		const shared = "workload: wl-abc\ninputs: gates/\nstakes: production\nceiling-share: 12.5%";
		expect(checkBriefFields({ context: shared, tasks: [{ agent: "fast", task: "- **task:** fix it\n- **done-condition:** tests green" }] })).toBeNull();
	});
});

describe("row 6: § A4 reserved actions", () => {
	const refused = [
		"git push --force origin feat",
		"git push -f origin feat",
		"git push --force-with-lease",
		"git push origin +feat",
		"git reset --hard HEAD~1",
		"git branch -D old",
		"git tag -d v1",
		"git push origin --delete old",
		"git push origin :old",
		"rm -rf build",
		"rm -r -f build",
		"rm --recursive --force /tmp/x",
		'psql "$DB" -c "DROP TABLE users"',
		"echo 'TRUNCATE TABLE events;' | psql",
		"psql postgres://prod-db.internal/app -c 'update t set x=1'",
		"kubectl delete pod web-1",
		"terraform destroy -auto-approve",
		"doctl compute droplet delete web",
		"gh secret set API_KEY < key.txt",
		"vault kv put secret/app key=1",
		"git push origin main",
		"git push origin feat:main",
		"fly deploy",
		"vercel --prod",
		"npm publish",
		"gh workflow run deploy.yml",
		"cd x && git -C y push --force",
	];
	for (const cmd of refused) {
		test(`refuses: ${cmd}`, () => {
			const r = checkReserved({ toolName: "bash", input: { command: cmd } }, lane());
			expect(r?.block).toBe(true);
			expect(r?.reason).toContain("§ A4 reserved list");
		});
	}
	const allowed = ["git push origin feat", "git push -u origin feat", "git status", "rm -r build", "rm -f a.txt", "git branch feat", "gh pr create --fill", "git fetch origin --prune", "echo drop tables later", "git push origin main-fix"];
	for (const cmd of allowed) {
		test(`allows: ${cmd}`, () => expect(checkReserved({ toolName: "bash", input: { command: cmd } }, lane())).toBeNull());
	}
	test("refuses a reserved action inside a script the command runs", () => {
		const dir = tmp("script");
		writeFileSync(join(dir, "ship.sh"), "#!/bin/zsh\nset -e\nbun test\nfly deploy\n");
		expect(checkReserved({ toolName: "bash", input: { command: "zsh ship.sh" } }, lane(dir))?.reason).toContain("ship.sh");
		writeFileSync(join(dir, "ok.sh"), "#!/bin/zsh\nbun test\n");
		expect(checkReserved({ toolName: "bash", input: { command: "zsh ok.sh" } }, lane(dir))).toBeNull();
	});
	test("refuses shell reached through eval, allows harmless eval", () => {
		expect(checkReserved({ toolName: "eval", input: { language: "js", code: "await Bun.$`git push --force origin x`" } }, lane())?.block).toBe(true);
		expect(checkReserved({ toolName: "eval", input: { language: "py", code: "import subprocess\nsubprocess.run(['terraform','destroy'])" } }, lane())?.block).toBe(true);
		expect(checkReserved({ toolName: "eval", input: { language: "py", code: "print(1+1)" } }, lane())).toBeNull();
	});
	test("refuses browser writes, allows browser reads", () => {
		expect(checkReserved({ toolName: "eval", input: { language: "js", code: "const tab = await browser.open(u); await tab.click('#buy')" } }, lane())?.block).toBe(true);
		expect(checkReserved({ toolName: "mcp__chrome_devtools_click", input: { uid: "1" } }, lane())?.block).toBe(true);
		expect(checkReserved({ toolName: "mcp__chrome_devtools_take_screenshot", input: {} }, lane())).toBeNull();
		expect(checkReserved({ toolName: "eval", input: { language: "js", code: "const tab = await browser.open(u); await tab.screenshot()" } }, lane())).toBeNull();
	});
	test("refuses a bare push from a checkout on a protected branch", () => {
		const { work } = repoWithOrigin();
		expect(checkReserved({ toolName: "bash", input: { command: "git push" } }, lane(work))?.reason).toContain("current branch main");
		git(work, "switch", "-q", "-c", "feat");
		expect(checkReserved({ toolName: "bash", input: { command: "git push" } }, lane(work))).toBeNull();
	});
	test("refuses moving a protected ref by writing .git internals", () => {
		expect(checkReserved({ toolName: "write", input: { path: "/r/.git/refs/heads/main", content: "abc" } }, lane())?.block).toBe(true);
		expect(checkReserved({ toolName: "write", input: { path: "/r/.git/refs/heads/feat", content: "abc" } }, lane())).toBeNull();
	});
	test("the matcher is quote-blind on purpose", () => {
		expect(reservedInShell('git commit -m "then git reset --hard"')).toBe("git reset --hard");
	});
});

describe("row 8: a push needs a recorded fetch+rebase onto the target's upstream", () => {
	/** A feature branch one commit ahead of a main that origin has since advanced. */
	function behind() {
		const r = repoWithOrigin();
		git(r.work, "switch", "-q", "-c", "feat");
		commit(r.work, "f.txt", "f\n");
		advanceOriginMain(r.root, r.origin);
		return r;
	}
	/** Run a bash command for real, then feed its result to the evidence the way the extension does. */
	function ran(evidence: RebaseEvidence, cmd: string, cwd: string): void {
		const r = spawnSync("zsh", ["-c", cmd], { cwd, encoding: "utf8", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
		evidence.observe(cmd, cwd, {}, r.status === 0);
	}
	const push = (command: string) => ({ toolName: "bash", input: { command } });

	test("refuses a push whose branch does not contain the fetched mainline", () => {
		const { work } = behind();
		expect(checkPushRebase(push("git push -u origin feat"), lane(work), new RebaseEvidence())?.reason).toContain("does not contain origin/main");
	});
	test("allows the push after a recorded rebase onto origin/main", () => {
		const { work } = behind();
		const ev = new RebaseEvidence();
		ran(ev, "git fetch -q origin && git rebase -q origin/main", work);
		expect(checkPushRebase(push("git push -u origin feat"), lane(work), ev)).toBeNull();
	});
	test("a rebase done outside the session's tool results is not evidence", () => {
		const { work } = behind();
		git(work, "fetch", "-q", "origin");
		git(work, "rebase", "-q", "origin/main");
		expect(checkPushRebase(push("git push -u origin feat"), lane(work), new RebaseEvidence())?.reason).toContain("no successful rebase");
	});
	test("a fetch-and-rebase chained into the push command is not evidence (astra review B4)", () => {
		const { work } = behind();
		const cmd = "git fetch origin --prune && git rebase origin/main && git push -u origin feat";
		expect(checkPushRebase(push(cmd), lane(work), new RebaseEvidence())?.block).toBe(true);
	});
	test("a commit after the recorded rebase refuses the push again", () => {
		const { work } = behind();
		const ev = new RebaseEvidence();
		ran(ev, "git fetch -q origin; git rebase -q origin/main", work);
		commit(work, "later.txt", "later\n");
		expect(checkPushRebase(push("git push origin feat"), lane(work), ev)?.reason).toContain("a commit made after the last rebase");
	});
	test("a failed rebase is not evidence", () => {
		const { work } = behind();
		const ev = new RebaseEvidence();
		git(work, "fetch", "-q", "origin");
		git(work, "rebase", "-q", "origin/main");
		ev.observe("git rebase origin/main", work, {}, false); // the tool result said it failed
		expect(checkPushRebase(push("git push origin feat"), lane(work), ev)?.reason).toContain("no successful rebase");
	});
	test("follows cd into the repo", () => {
		const { root, work } = behind();
		expect(checkPushRebase(push(`cd ${work} && git push origin feat`), lane(root), new RebaseEvidence())?.block).toBe(true);
	});
});

describe("row 9: no edit on a protected branch", () => {
	test("refuses write and edit into a checkout on main", () => {
		const { work } = repoWithOrigin();
		expect(checkProtectedEdit({ toolName: "write", input: { path: join(work, "new/dir/file.ts"), content: "x" } }, lane(work))?.reason).toContain('protected branch "main"');
		expect(checkProtectedEdit({ toolName: "edit", input: { path: "a.txt", paths: ["a.txt"], input: "..." } }, lane(work))?.block).toBe(true);
	});
	test("allows the same edit on a feature branch and outside any checkout", () => {
		const { work } = repoWithOrigin();
		git(work, "switch", "-q", "-c", "feat");
		expect(checkProtectedEdit({ toolName: "write", input: { path: join(work, "b.txt"), content: "x" } }, lane(work))).toBeNull();
		const loose = tmp("loose");
		expect(checkProtectedEdit({ toolName: "write", input: { path: join(loose, "c.txt"), content: "x" } }, lane(loose))).toBeNull();
	});
});

describe("row 10: raw ledger writes refused", () => {
	const setup = () => {
		const home = tmp("home");
		const dir = join(home, ".agent-system-2");
		mkdirSync(dir);
		const db = join(dir, "ledger.db");
		return { home, dir, db, ctx: lane(home, { HOME: home }) };
	};
	test("refuses sqlite3 writes by every spelling of the path", () => {
		const { home, db, dir, ctx } = setup();
		for (const cmd of [
			`sqlite3 ${db} "INSERT INTO workloads VALUES (1)"`,
			`sqlite3 ~/.agent-system-2/ledger.db "DELETE FROM slices"`,
			`sqlite3 $HOME/.agent-system-2/ledger.db .dump`,
			`cd ${dir} && sqlite3 ledger.db "UPDATE questions SET state='answered'"`,
			`cp /tmp/other.db ${db}`,
			`echo x > ${db}-wal`,
			`rm ${db}-shm`,
		]) {
			expect(checkRawLedgerWrite({ toolName: "bash", input: { command: cmd } }, ctx)?.reason).toContain("P-11 row 10");
		}
		expect(home).toBeTruthy();
	});
	test("refuses the env override path and the variable spelled in the command", () => {
		const alt = join(tmp("alt"), "l.db");
		const ctx = lane(tmp("cwd"), { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: alt });
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: `sqlite3 ${alt} 'DROP TABLE x'` } }, ctx)?.block).toBe(true);
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: `sqlite3 "$AGENT_SYSTEM_LEDGER_DB" 'VACUUM'` } }, ctx)?.block).toBe(true);
	});
	test("refuses file-tool writes to the file and its WAL/SHM siblings", () => {
		const { db, ctx } = setup();
		for (const p of [db, `${db}-wal`, `${db}-shm`]) expect(checkRawLedgerWrite({ toolName: "write", input: { path: p, content: "" } }, ctx)?.block).toBe(true);
	});
	test("refuses eval code that opens the ledger without the module", () => {
		const { db, ctx } = setup();
		expect(checkRawLedgerWrite({ toolName: "eval", input: { code: `import { Database } from "bun:sqlite"; new Database("${db}").run("DELETE FROM slices")` } }, ctx)?.block).toBe(true);
	});
	test("allows read-only inspection, the module's scripts, and other databases", () => {
		const { db, ctx } = setup();
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: `sqlite3 -readonly ${db} "SELECT count(*) FROM workloads"` } }, ctx)).toBeNull();
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: `ls -la ${db}*` } }, ctx)).toBeNull();
		// The exemption is the real module's script by where it resolves, not a path that reads like one (astra review B2).
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: `bun ${join(import.meta.dir, "../../ledger/scripts/backup.ts")} ${db}` } }, ctx)).toBeNull();
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: `bun ledger/scripts/backup.ts ${db}` } }, ctx)?.block).toBe(true);
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: `sqlite3 /tmp/scratch.db "CREATE TABLE t(x)"` } }, ctx)).toBeNull();
		expect(checkRawLedgerWrite({ toolName: "write", input: { path: `${db}.notes.md`, content: "" } }, ctx)).toBeNull();
	});
});

describe("row 14: `ask` unavailable to hands and autonomous lanes", () => {
	test("refuses ask from a hand, an autonomous lane, and a lane with no known mode", () => {
		expect(checkAsk("ask", "hand", null)?.reason).toContain("a hand");
		expect(checkAsk("ask", "lane", "autonomous")?.reason).toContain("autonomous mode");
		expect(checkAsk("ask", "lane", null)?.block).toBe(true);
	});
	test("allows ask from a user-driven lane and the orchestrator; other tools untouched", () => {
		expect(checkAsk("ask", "lane", "user-driven")).toBeNull();
		expect(checkAsk("ask", "orchestrator", null)).toBeNull();
		expect(checkAsk("read", "hand", null)).toBeNull();
	});
});

describe("composition: checkToolCall", () => {
	test("a clean dispatch and a clean command pass every row", () => {
		const ctx = lane();
		expect(checkToolCall({ toolName: "task", input: { tasks: [{ agent: "standard", task: brief() }] } }, ctx)).toBeNull();
		expect(checkToolCall({ toolName: "bash", input: { command: "ls" } }, ctx)).toBeNull();
	});
	test("the first refusing row wins", () => {
		expect(checkToolCall({ toolName: "task", input: { tasks: [{ agent: "builder", task: "x" }] } }, lane())?.reason).toContain("row 4");
		expect(checkToolCall({ toolName: "ask", input: {} }, { ...lane(), role: "hand" })?.reason).toContain("row 14");
	});
});
