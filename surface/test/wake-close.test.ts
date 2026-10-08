// The tick's auto-close of a workload awaiting close (surface/extensions/wake.ts `catchUp`) under the
// fail-closed close check (MIGRATION.md item 24, surface/src/close-entry.ts `closeCheck`): a served
// workload with no green test-run is refused on every poll, so the tick retries each poll but tells
// Jo once per distinct refusal text (`s.refusedClose`), again when the text changes or after the
// workload stopped being ready, and a later successful close is told as usual. Fence-safe: the
// surface's `pi.exec` is the fake one (no git or gh process runs), answering the close check as a
// served repo whose `git rev-parse` fails, so the refusal comes from the real close path.
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { launchVerdict } from "../extensions/launch";
import orchestratorSurface from "../index";
import { TEST_RUNNER_CONFIG_ENV } from "../src/close-entry";
import { recordRepo } from "../src/decision-log";
import { doneBody } from "../src/launch";
import { surfaceSession } from "../src/session";
import { SURFACE_BY } from "../src/types";
import { ctxOf, fakePi, timers, tmp } from "./helpers";

const ORIGIN_URL = "https://github.com/example/repo.git";

function env(): Record<string, string> {
	const voice = join(tmp("voice"), "VOICE.md");
	writeFileSync(voice, "VOICE DOC BODY");
	const config = join(tmp("config"), "config.yml");
	writeFileSync(config, "setupVersion: 2\ntestRunner:\n  repos:\n    - origin: example/repo\n      command: bun test\n");
	const e = {
		AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: join(tmp("ledger"), "ledger.db"), AGENT_SYSTEM_VOICE: voice, HOME: "/nonexistent-home",
		[TEST_RUNNER_CONFIG_ENV]: config,
	};
	Ledger.open(e.AGENT_SYSTEM_LEDGER_DB, { create: true, backup: false, backupOnOpen: false }).close();
	return e;
}
const open = (e: Record<string, string>) => Ledger.open(e.AGENT_SYSTEM_LEDGER_DB!, { backup: false, backupOnOpen: false });
const HAND = "lane-plumb-by-hand";

/** A by-hand holder's released workload with its `done-because:` receipt standing: awaiting close, nothing open. */
function awaitingClose(e: Record<string, string>, repo: string): string {
	const l = open(e);
	const wl = l.openWorkload({ by: SURFACE_BY, brief: "Add a verify line to the README", stakes: "normal", mode: "autonomous" });
	recordRepo(l, wl, repo);
	l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("README.md carries a verify line") });
	expect(l.claimWorkload(wl, { by: HAND, holder: HAND, leaseMs: 60_000 }).won).toBe(true);
	const sl = l.addSlice({ by: HAND, workloadId: wl, task: "add the line", doneCondition: "README has the line", inputs: "README.md" });
	l.completeSlice(sl, { by: HAND, artifact: "the line" });
	l.recordEntry({ by: HAND, workloadId: wl, kind: "assumption", body: "done-because: README.md carries a verify line\nchecked by reading it" });
	l.releaseWorkload(wl, { by: HAND, holder: HAND });
	expect(launchVerdict(l, e, wl)).toEqual({ launch: false, reason: "awaiting-close" });
	l.close();
	return wl;
}

describe("the tick's refused close is told once per refusal", () => {
	test("two ticks with the same refusal give one notice; a changed refusal gives a second; not-ready then ready again tells it again; a later close is told as usual", async () => {
		const e = env();
		const repo = tmp("repo");
		const wl = awaitingClose(e, repo);
		// The fake exec: the close check sees a served origin, then `git rev-parse` fails with `fatal`; with no origin the repo is not served.
		const git = { origin: true, fatal: "fatal: first" };
		const f = fakePi(undefined, { exec: true });
		f.execs.answer = (command, args) => {
			if (command === "git" && args[2] === "config") return git.origin ? { stdout: `${ORIGIN_URL}\n`, stderr: "", code: 0, killed: false } : { stdout: "", stderr: "", code: 1, killed: false };
			if (command === "git" && args[2] === "rev-parse" && args[3] === "--show-toplevel") return { stdout: "", stderr: git.fatal, code: 128, killed: false };
			return { stdout: "", stderr: "", code: 0, killed: false };
		};
		orchestratorSurface(f.pi, e, {});
		const ctx = ctxOf({ cwd: repo });
		const s = surfaceSession(ctx, e);
		const applied = async (): Promise<string[]> => {
			const turn = (await f.emit("before_agent_start", { prompt: "hi", systemPrompt: [] }, ctx)) as { messages: { content: string }[] };
			const text = turn.messages[0]?.content ?? "";
			const heading = "## Applied from the surface since your last turn";
			return text.includes(heading) ? text.split(heading)[1]!.trim().split("\n") : [];
		};
		/** One poll: the timer fires and the catch-up it started finishes (it awaits only the fake exec, so each event-loop turn moves it on; no wall-clock wait). */
		const tick = async () => {
			timers[0]!.fn();
			while (s.launching) {
				const { promise, resolve } = Promise.withResolvers<void>();
				setImmediate(resolve);
				await promise;
			}
		};
		const closeChecks = () => f.execs.calls.filter((c) => c.command === "git" && c.args[2] === "config").length;
		const refusal = (fatal: string) => `- tick: ${wl} cannot close: the close check could not answer: ${repo} is not a git checkout (git rev-parse exited 128: ${fatal})`;

		timers.length = 0;
		await f.emit("session_start", { type: "session_start" }, ctx);
		expect(timers).toHaveLength(1);

		// the same refusal on two ticks: retried both times, told once
		await tick();
		await tick();
		expect(closeChecks()).toBe(2);
		expect(await applied()).toEqual([refusal("fatal: first")]);
		await tick();
		expect(closeChecks()).toBe(3);
		expect(await applied()).toEqual([]);

		// the refusal text changes: told again, once
		git.fatal = "fatal: second";
		await tick();
		await tick();
		expect(closeChecks()).toBe(5);
		expect(await applied()).toEqual([refusal("fatal: second")]);

		// not ready (a slice opens), then ready again: the same refusal is told again
		const l = open(e);
		const sl = l.addSlice({ by: HAND, workloadId: wl, task: "one more", doneCondition: "d", inputs: "i" });
		l.close();
		await tick();
		expect(closeChecks()).toBe(5);
		expect(await applied()).toEqual([`- tick: ${wl} is finished but cannot close: 1 open slice(s), 0 paused, 0 open question(s) — resolve them or close by hand`]);
		const l2 = open(e);
		l2.completeSlice(sl, { by: HAND, artifact: "done" });
		l2.close();
		await tick();
		await tick();
		expect(closeChecks()).toBe(7);
		expect(await applied()).toEqual([refusal("fatal: second")]);

		// the close goes through (the repo is no longer served): told as usual
		git.origin = false;
		await tick();
		const closed = await applied();
		expect(closed).toHaveLength(1);
		expect(closed[0]).toStartWith(`- tick: closed ${wl}: README.md carries a verify line — Decision-log entry rendered at ${join(repo, ".ai", "decision-log")}/`);
		const after = open(e);
		expect(after.workload(wl)!.status).toBe("closed");
		after.close();
		await tick();
		expect(await applied()).toEqual([]);
	});
});
