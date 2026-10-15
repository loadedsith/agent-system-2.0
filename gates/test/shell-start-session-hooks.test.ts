// sl-regress-session (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7 § 5.1), the env-hook cases.
// A session whose env carries a shell start hook is refused outright after the change: every bash
// call's reason names the hook (§ 2.4). The harness is shell-start-session-harness.ts.
// - Case 4: `~/.env` sets BASH_ENV. OMP fills `Bun.env` from it (pi-utils env.ts), so it reaches
//   `shell.env` and the fence's /bin/bash -c runs the script on every embedded route.
// - Case 5: the launch env carries `BASH_FUNC_as2probe_fn%%`, added after the launcher built the env
//   (past its name filter). It sits in the C environ, which brush hands the child, and /bin/bash
//   imports it as the function `as2probe_fn`.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CaseRun, fixture, RC_FN, ROLES, roleViolations, runCase } from "./shell-start-session-harness";

const fx = fixture();
afterAll(fx.close);

describe.skipIf(fx.skip !== null)(`shell start: ~/.env setting BASH_ENV refuses the session's bash${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		run = await runCase(fx.stub!, fx.root, fx.fence, {
			name: "denv",
			prepare: (h) => writeFileSync(join(h.home, ".env"), `BASH_ENV=${h.bashEnvScript}\n`),
		});
	}, 60_000);

	for (const role of ROLES) test(`${role}: every call is refused naming BASH_ENV`, () => expect(roleViolations(run, role, "BASH_ENV")).toEqual([]));
});

describe.skipIf(fx.skip !== null)(`shell start: a BASH_FUNC_ function in the launch env refuses the session's bash${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		run = await runCase(fx.stub!, fx.root, fx.fence, {
			name: "bfunc",
			launchExtra: [[`BASH_FUNC_${RC_FN}%%`, "() {  echo from-bash-func\n}"]],
		});
	}, 60_000);

	for (const role of ROLES) test(`${role}: every call is refused naming BASH_FUNC_`, () => expect(roleViolations(run, role, "BASH_FUNC_")).toEqual([]));
});
