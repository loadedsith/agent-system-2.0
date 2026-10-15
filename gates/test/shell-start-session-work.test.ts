// sl-regress-session (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7 § 5.1), ordinary work: the
// change must leave everyday bash calls working. A lane and its hand run git init/commit/log/status
// in a scratch repository, `bun --version`, `bun -e` and `gh --version`, each exit 0, plus an
// `async: true, timeout: 0` job whose output is read back. The orchestrator runs only what row 15
// allows it (read-only commands): `git status` and `git log` in the checkout, and the async job.
// The harness is shell-start-session-harness.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dispatchSteps, fixture, handBrief, type Home, laneLaunch, makeHome, orchestratorLaunch, type Role, runSession, type Step, WAIT } from "./shell-start-session-harness";

const fx = fixture();
afterAll(fx.close);

/**
 * The lane's and the hand's ordinary commands, by id; REPO_DIR is the role's scratch repository.
 * The commit is a form row 6's git model knows (`cd` then `git -c … commit`; it refuses `-C` with
 * `-c`, and `--allow-empty`).
 */
const WORK: Record<string, string> = {
	"git-init": "git init -q REPO_DIR",
	"git-commit": "cd REPO_DIR && printf 'probe\\n' > probe.txt && git add probe.txt && git -c user.name=as2probe -c user.email=as2probe@example.invalid commit -q -m probe",
	"git-log": "git -C REPO_DIR log --oneline -1",
	"git-status": "git -C REPO_DIR status --short",
	"bun-version": "bun --version",
	"bun-e": "bun -e 'console.log(6 * 7)'",
	"gh-version": "gh --version",
};
/** The async job's output: the command prints it from two words, so only the job's output holds it whole. */
const ASYNC_OUT = "async-readback";
const asyncJob = (role: Role): Step => ({ tool: "bash", args: { command: `printf '%s-%s:%s\\n' async readback ${role}`, async: true, timeout: 0 } });

/** Each WORK command run by `role`, its exit status written to `<out>/<role>-<id>.rc`. */
function workSteps(role: Role, h: Home, repoDir: string): Step[] {
	return Object.entries(WORK).map(([id, cmd]) => ({ tool: "bash", args: { command: `${cmd.replaceAll("REPO_DIR", join(repoDir, role))}; printf '%s' "$?" > ${join(h.out, `${role}-${id}.rc`)}` } }));
}

describe.skipIf(fx.skip !== null)(`shell start: ordinary work runs in every role${fx.reason}`, () => {
	let lane: Home;
	let tagText: Map<string, string>;
	let orchResults: Map<string, string | undefined>;
	beforeAll(async () => {
		const stub = fx.stub!;
		lane = makeHome(fx.root, "wl", stub);
		const repoDir = join(fx.root, "work");
		mkdirSync(repoDir);
		const launch = laneLaunch(lane, fx.fence, { name: "work" });
		stub.script("work-hand", [...workSteps("hand", lane, repoDir), asyncJob("hand"), WAIT, { tool: "yield", args: { data: { done: true } } }, { text: "done" }]);
		stub.script("work-lane", [...workSteps("lane", lane, repoDir), asyncJob("lane"), WAIT, ...dispatchSteps(handBrief("work-hand", launch.workloadId)), { text: "done" }]);
		await runSession(stub, { tag: "work-lane", home: lane, env: launch.env, launcherArgs: [], headless: true });

		const orch = makeHome(fx.root, "wo", stub);
		const o = orchestratorLaunch(orch, fx.fence, { name: "work" });
		stub.script("work-orch", [
			{ tool: "bash", args: { command: "git status --short" } },
			{ tool: "bash", args: { command: "git log --oneline -1" } },
			asyncJob("orchestrator"),
			WAIT,
			{ text: "done" },
		]);
		await runSession(stub, { tag: "work-orch", home: orch, env: o.env, launcherArgs: o.args, headless: false });
		tagText = new Map(["work-lane", "work-hand", "work-orch"].map((t) => [t, stub.transcript.get(t) ?? ""]));
		orchResults = new Map((stub.calls.get("work-orch") ?? []).map((c) => [String(c.args.command ?? c.tool), stub.results.get(c.id)]));
	}, 60_000);

	for (const [role, tag] of [["lane", "work-lane"], ["hand", "work-hand"]] as const)
		test(`${role}: git init/commit/log/status, bun --version, bun -e, gh --version exit 0; the async job is read back`, () => {
			const out: string[] = [];
			for (const id of Object.keys(WORK)) {
				const rc = join(lane.out, `${role}-${id}.rc`);
				const status = existsSync(rc) ? readFileSync(rc, "utf8") : "did not run";
				if (status !== "0") out.push(`${id}: ${status === "did not run" ? status : `exit ${status}`}`);
			}
			if (!tagText.get(tag)!.includes(`${ASYNC_OUT}:${role}`)) out.push("the async job's output was not read back");
			expect(out).toEqual([]);
		});

	test("orchestrator: git status and git log exit 0; the async job is read back", () => {
		const out: string[] = [];
		for (const cmd of ["git status --short", "git log --oneline -1"]) {
			const text = orchResults.get(cmd);
			// Anchored: a refusal starts with its gate's name; `git log` prints HEAD's subject, which may say "refused".
			if (text === undefined || /^(P-11 row|M4b OS fence)/.test(text) || /exited with code \d+/.test(text)) out.push(`${cmd}: ${JSON.stringify((text ?? "no result").slice(0, 160))}`);
		}
		if (!/^[0-9a-f]{7,} /m.test(orchResults.get("git log --oneline -1") ?? "")) out.push("git log printed no commit");
		if (!tagText.get("work-orch")!.includes(`${ASYNC_OUT}:orchestrator`)) out.push("the async job's output was not read back");
		expect(out).toEqual([]);
	});
});
