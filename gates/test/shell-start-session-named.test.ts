// sl-regress-session (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7 § 5.1), the named-call cases.
// A named call runs in the project's daemon broker, a separate process whose env the gates cannot
// bind to the call (§ 1.2 item 1); after the change it is refused with item 4's reason, and the
// embedded routes of the same sessions start clean. The harness is shell-start-session-harness.ts.
// - Case 2: `~/.zshenv` and `~/.profile` export BASH_ENV; the service shell (zsh from SHELL, or sh)
//   reads its startup file and the fence's /bin/bash -c then runs the BASH_ENV script.
// - Case 3: a broker started first by a scratch-profile session (no gates) whose env exports
//   BASH_ENV, then reused by launcher-env sessions' named calls in the same profile and project dir.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CaseRun, fixture, makeHome, pairs, ROLES, roleViolations, runCase, runSession, starterEnv } from "./shell-start-session-harness";

const fx = fixture();
afterAll(fx.close);

describe.skipIf(fx.skip !== null)(`shell start: BASH_ENV exported by ~/.zshenv or ~/.profile, through a named call${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		run = await runCase(fx.stub!, fx.root, fx.fence, {
			name: "zenv",
			prepare: (h) => {
				for (const f of [".zshenv", ".profile"]) writeFileSync(join(h.home, f), `export BASH_ENV=${h.bashEnvScript}\n`);
			},
		});
	}, 60_000);

	for (const role of ROLES) test(`${role}: the named call is refused; the embedded routes start clean`, () => expect(roleViolations(run, role)).toEqual([]));
});

describe.skipIf(fx.skip !== null)(`shell start: a broker another session started with BASH_ENV, reused by a named call${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		const stub = fx.stub!;
		const h = makeHome(fx.root, "brk", stub);
		// The broker's starter: an omp on the same profile and project dir, without the gates or a
		// launcher, whose env exports BASH_ENV. Its named call starts the project's broker, which keeps
		// this session's env; the session stays up (keepAlive) so the broker has a client while the
		// launcher-env sessions below reuse it.
		// 30 s outlasts the launcher-env sessions below (about 10 s measured).
		stub.script("brk-start", [{ tool: "bash", args: { command: "/bin/sleep 30", name: "brk-keep" } }, { text: "done" }]);
		await runSession(stub, {
			tag: "brk-start",
			home: h,
			env: pairs(starterEnv(h, fx.fence, { BASH_ENV: h.bashEnvScript })),
			launcherArgs: [],
			headless: true,
			gates: false,
			keepAlive: true,
		});
		run = await runCase(stub, fx.root, fx.fence, { name: "brk", homes: { lane: h, orchestrator: h } });
	}, 60_000);

	for (const role of ROLES) test(`${role}: the named call is refused; the embedded routes start clean`, () => expect(roleViolations(run, role)).toEqual([]));
});
