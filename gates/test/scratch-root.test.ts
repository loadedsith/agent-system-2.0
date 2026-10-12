// The own scratch root through the gate (PLAN wl-mv5oikd5jtquww § 1.2): rules 1–4 and 6 let
// housekeeping inside the root through rows 6 and 8 and mark the call confined; every escape the plan
// lists is still refused, unconfined. Rule 5 (hooks and .git writes) keeps today's refusals. Real temp
// HOMEs with real roots and real repositories, judged through checkToolCall as a live call is.
import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkToolCall } from "../src/gates";
import { checkReserved } from "../src/rows/r06-reserved";
import { judgePush } from "../src/rows/r08-push-rebase";
import { SCRATCH_ENV, scratchRootFor } from "../src/scratch";
// Through the namespace: isConfined is new on this branch, so on origin/main the file still loads
// and each test fails on its own (sl-scratch-prefail).
import * as session from "../src/session";
import { type CallContext, type Role, type ToolCall, WORKLOAD_ENV } from "../src/types";
import { commit, git, tmp } from "./helpers";

const ID = "wl-scr4tch1";
const OTHER = "wl-0ther22";
const HOME = realpathSync(tmp("scratch-root"));
const ROOT = scratchRootFor(HOME, ID);
const OTHER_ROOT = scratchRootFor(HOME, OTHER);
mkdirSync(ROOT, { recursive: true });
mkdirSync(OTHER_ROOT, { recursive: true });

// A repository inside the root with a dirty file and a second branch; a bare one beside it.
const REPO = join(ROOT, "r");
mkdirSync(REPO);
git(REPO, "init", "-q", "-b", "main");
commit(REPO, "f", "one\n");
git(REPO, "branch", "x");
writeFileSync(join(REPO, "f"), "dirty\n");
const BARE = join(ROOT, "o.git");
git(ROOT, "init", "-q", "--bare", "-b", "main", BARE);

// An outside repository with a worktree whose `.git` file points outside the root.
const OUTSIDE = realpathSync(tmp("scratch-outside"));
git(OUTSIDE, "init", "-q", "-b", "main");
commit(OUTSIDE, "f", "one\n");
git(OUTSIDE, "worktree", "add", "-q", join(ROOT, "wt"), "-b", "wt");
writeFileSync(join(ROOT, "wt", "f"), "dirty\n");

// A symlink in the root that leads out of it.
symlinkSync(OUTSIDE, join(ROOT, "out"));

const ENV: Record<string, string | undefined> = { HOME, PATH: process.env.PATH, [WORKLOAD_ENV]: ID, [SCRATCH_ENV]: ROOT };

let n = 0;
interface Verdict {
	verdict: "ALLOW" | "REFUSE";
	reason: string;
	confined: boolean;
}

/** checkToolCall over one bash call carrying a tool call id, as the extension passes the OMP event. */
function judge(command: string, over: { role?: Role; env?: Record<string, string | undefined>; toolEnv?: Record<string, string>; cwd?: string } = {}): Verdict {
	const toolCallId = `scratch-${++n}`;
	const call: ToolCall & { toolCallId: string } = { toolName: "bash", toolCallId, input: over.toolEnv ? { command, env: over.toolEnv } : { command } };
	const ctx: CallContext = { role: over.role ?? "lane", cwd: over.cwd ?? HOME, env: over.env ?? ENV, mode: null };
	const r = checkToolCall(call, ctx, { workload: null, wake: null, testRecords: null });
	return { verdict: r?.block ? "REFUSE" : "ALLOW", reason: r?.reason ?? "", confined: session.isConfined(toolCallId) };
}

const allowed = (command: string, over?: Parameters<typeof judge>[1]) => {
	const v = judge(command, over);
	expect({ command, ...v }).toEqual({ command, verdict: "ALLOW", reason: "", confined: true });
};
const refused = (command: string, over?: Parameters<typeof judge>[1]): string => {
	const v = judge(command, over);
	expect({ command, verdict: v.verdict, confined: v.confined }).toEqual({ command, verdict: "REFUSE", confined: false });
	return v.reason;
};

describe("allowed inside the own root, and marked confined", () => {
	// Spelled through the variable: the test HOME sits under the temp directories, where rm -rf of a
	// literal path is allowed anyway (r06 TEMP_PATH), so a literal spelling would prove nothing here.
	test("rule 1: rm -rf of a path inside the root, spelled through the variable", () => {
		allowed(`rm -rf "$AS2_SCRATCH/pp"`);
		allowed(`rm -rf "\${AS2_SCRATCH}/pp" "$AS2_SCRATCH/qq"`);
		allowed(`rm -rf $AS2_SCRATCH/pp`);
		allowed(`rm -rf "$AS2_SCRATCH/r"`);
	});

	test("rule 2: git's discard verdicts on a repository inside the root", () => {
		allowed(`git -C "$AS2_SCRATCH/r" checkout -- f`);
		allowed(`git -C "$AS2_SCRATCH/r" restore f`);
		allowed(`git -C "$AS2_SCRATCH/r" reset --hard`);
		allowed(`git -C "$AS2_SCRATCH/r" clean -fdx`);
		allowed(`git -C "$AS2_SCRATCH/r" branch -D x`);
		allowed(`cd "$AS2_SCRATCH/r" && git checkout -- f`);
		allowed(`git -C ${REPO} checkout -- f`, { cwd: REPO });
	});

	test("rule 3: a push whose destination is a path inside the root, protected and forced included", () => {
		allowed(`git -C "$AS2_SCRATCH/r" push "$AS2_SCRATCH/o.git" main`);
		allowed(`git -C "$AS2_SCRATCH/r" push --force "$AS2_SCRATCH/o.git" main`);
		allowed(`git -C "$AS2_SCRATCH/r" push "$AS2_SCRATCH/o.git" :x`);
		allowed(`cd "$AS2_SCRATCH/r" && git push ${BARE} HEAD:main`);
	});

	test("rule 4: init and clone into the root, from a path", () => {
		allowed(`git init -q "$AS2_SCRATCH/n"`);
		allowed(`git init -q --bare -b main "$AS2_SCRATCH/n.git"`);
		allowed(`git clone -q "$AS2_SCRATCH/o.git" "$AS2_SCRATCH/c9"`);
		// Made and entered through the variable, then relative: no scratch rule is needed for the
		// directory is known, so the call is allowed without the mark (the fence's git denies apply).
		expect(judge(`mkdir -p "$AS2_SCRATCH/pp" && cd "$AS2_SCRATCH/pp" && git init -q --bare -b main o.git && git clone -q o.git c1`)).toEqual({ verdict: "ALLOW", reason: "", confined: false });
	});

	test("rule 6: the variable spelled where git wants literal text, the directory made in the same call", () => {
		allowed(`git -C "$AS2_SCRATCH/r" log --oneline`);
		allowed(`mkdir -p "$AS2_SCRATCH/new" && git -C "$AS2_SCRATCH/new" init -q`);
	});

	test("row 8 skips a push into the root and marks the call; checkReserved alone marks rule 1", () => {
		const push = { toolName: "bash", toolCallId: "scratch-r8", input: { command: `git -C "$AS2_SCRATCH/r" push "$AS2_SCRATCH/o.git" main && git -C "$AS2_SCRATCH/r" log` } };
		expect(judgePush(push, { role: "hand", cwd: HOME, env: ENV, mode: null }, null)).toEqual({ refusal: null, dests: [] });
		expect(session.isConfined("scratch-r8")).toBe(true);
		const rm = { toolName: "bash", toolCallId: "scratch-r6", input: { command: `rm -rf "$AS2_SCRATCH/pp"` } };
		expect(checkReserved(rm, { role: "hand", cwd: HOME, env: ENV, mode: null })).toBeNull();
		expect(session.isConfined("scratch-r6")).toBe(true);
	});

	test("a call no scratch rule changed is not marked", () => {
		const v = judge(`ls "$AS2_SCRATCH"`);
		expect(v).toEqual({ verdict: "ALLOW", reason: "", confined: false });
	});
});

describe("every escape is refused, unconfined", () => {
	test("another workload's root, `..`, `%`, a symlink out, the root itself", () => {
		refused(`rm -rf "$AS2_SCRATCH/../${OTHER}/pp"`);
		refused(`rm -rf "$AS2_SCRATCH/../.."`);
		refused(`rm -rf "$AS2_SCRATCH/p%"`);
		refused(`rm -rf "$AS2_SCRATCH/out/f"`);
		refused(`rm -rf "$AS2_SCRATCH"`);
		refused(`rm -rf "$AS2_SCRATCH/"`);
		refused(`git -C ${OTHER_ROOT} checkout -- f`);
	});

	test("URL, file://, named-remote and bare pushes", () => {
		refused(`git -C "$AS2_SCRATCH/r" push https://example.invalid/x.git main`);
		refused(`git -C "$AS2_SCRATCH/r" push "file://$AS2_SCRATCH/o.git" main`);
		refused(`git -C "$AS2_SCRATCH/r" push origin main`);
		refused(`git -C "$AS2_SCRATCH/r" push`);
		refused(`git -C "$AS2_SCRATCH/r" push --mirror "$AS2_SCRATCH/o.git"`);
		refused(`git -C "$AS2_SCRATCH/r" push --repo="$AS2_SCRATCH/o.git" main`);
		refused(`git clone https://example.invalid/x.git "$AS2_SCRATCH/c"`);
	});

	test("mktemp output, another variable, a glob, a relative path after cd", () => {
		refused(`D=$(mktemp -d) && rm -rf "$D"`);
		refused(`rm -rf "$HOME/agent-scratch/agent-system-2.0/scratch/${ID}/pp"`);
		refused(`rm -rf "$AS2_SCRATCH"/*`);
		refused(`rm -rf "$AS2_SCRATCH/p"*`);
		refused(`cd "$AS2_SCRATCH" && rm -rf pp`);
		refused(`rm -rf "$(echo "$AS2_SCRATCH")/pp"`);
	});

	test("AS2_SCRATCH overridden by the tool env, an assignment, export or for", () => {
		refused(`rm -rf "$AS2_SCRATCH/pp"`, { toolEnv: { [SCRATCH_ENV]: "/etc" } });
		refused(`AS2_SCRATCH=/etc; rm -rf "$AS2_SCRATCH/pp"`);
		refused(`export AS2_SCRATCH=/etc && rm -rf "$AS2_SCRATCH/pp"`);
		refused(`for AS2_SCRATCH in /etc; do rm -rf "$AS2_SCRATCH/pp"; done`);
		refused(`read AS2_SCRATCH; rm -rf "$AS2_SCRATCH/pp"`);
		refused(`rm -rf "\${AS2_SCRATCH:=/etc}/pp"`);
		refused(`rm -rf "$AS2_SCRATCH/pp"`, { env: { ...ENV, [SCRATCH_ENV]: "/etc" } });
	});

	test("rule 5: .git/hooks, .git/config and gitlink writes in scratch, -c core.hooksPath anywhere", () => {
		refused(`printf '#!/bin/sh\\nexit 0\\n' > "$AS2_SCRATCH/r/.git/hooks/pre-push"`);
		refused(`cd "$AS2_SCRATCH/r" && printf 'x' > .git/hooks/pre-push`);
		refused(`echo x >> "$AS2_SCRATCH/r/.git/config"`);
		refused(`echo "gitdir: /etc" > "$AS2_SCRATCH/r/.git"`);
		refused(`git -C "$AS2_SCRATCH/r" config core.hooksPath h`);
		refused(`cd "$AS2_SCRATCH/r" && git -c core.hooksPath=h push "$AS2_SCRATCH/o.git" main`);
		refused(`git -c core.hooksPath=h status`);
	});

	test("a repository at or above the root, or with its gitdir outside, gets no rule 2", () => {
		refused(`git -C "$AS2_SCRATCH/wt" checkout -- f`);
		refused(`git -C "$AS2_SCRATCH/wt" reset --hard`);
		refused(`git -C ${OUTSIDE} checkout -- f`);
	});

	test("unbound, orchestrator, and a root that does not exist", () => {
		const unbound = { HOME, PATH: process.env.PATH, [SCRATCH_ENV]: ROOT };
		refused(`rm -rf "$AS2_SCRATCH/pp"`, { env: unbound });
		refused(`rm -rf "$AS2_SCRATCH/pp"`, { role: "orchestrator" });
		const home2 = realpathSync(tmp("scratch-noroot"));
		refused(`rm -rf "$AS2_SCRATCH/pp"`, { env: { HOME: home2, PATH: process.env.PATH, [WORKLOAD_ENV]: ID, [SCRATCH_ENV]: scratchRootFor(home2, ID) } });
	});
});

interface Fixture {
	allow: { id: string; command: string }[];
	refuse: { id: string; command: string }[];
	notCovered: { id: string; why: string }[];
}
const FIXTURE: Fixture = JSON.parse(readFileSync(join(import.meta.dir, "fixtures", "scratch-replay.json"), "utf8"));

describe("tonight's held commands, rewritten into the root (fixtures/scratch-replay.json)", () => {
	test("the nine holds the plan lists are all covered, the SEO hold listed as not", () => {
		expect([...new Set(FIXTURE.allow.map((e) => e.id))].sort()).toEqual(
			["en-mv5mrwkbgccxkw", "en-mv5n4f46p3q60w", "en-mv5n9huuu4fpq8", "en-mv5og4bi1ttzwg", "en-mv5og7n0vuql8g", "en-mv5oha1fkhws8w", "en-mv5onf46tundvk", "en-mv5ooj4ug71ts0", "en-mv5oopqx3l9s74"].sort(),
		);
		expect(FIXTURE.notCovered.map((e) => e.id)).toEqual(["en-mv5kqxyt13ylfk"]);
	});
	for (const e of FIXTURE.allow) test(`${e.id} is allowed and confined`, () => allowed(e.command));
	for (const e of FIXTURE.refuse) test(`${e.id}'s hook step is still refused`, () => refused(e.command));
});
