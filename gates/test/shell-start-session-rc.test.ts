// sl-regress-session (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7 § 5.1 as revision 8 changes it),
// case 1: a scratch `~/.bashrc` defining a function that references a lowercase variable, setting
// that variable and `set -a`, with `SHELL=/bin/bash` in the starter env, and the clean shell on
// (`gates.cleanShell: "all"` in the scratch profile). OMP resolves a bash-named shell from SHELL when
// no `shellPath` is set and then sources the rc into its bash snapshot (§ 1.3). Revision 8 sets no
// global `shellPath`: the certificate refuses a bash-named shell instead, so every call on every
// route is refused naming the shell and its fix, and none runs with the rc's function, variable or
// allexport. The harness and what each assertion reads are in shell-start-session-harness.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CaseRun, fixture, RC_FN, RC_VAR, ROLES, roleViolations, runCase } from "./shell-start-session-harness";

/** The certificate's reason for a bash-named shell (gates/src/shell-start.ts), as each refusal carries it. */
const BASH_SHELL = 'OMP resolves the bash tool\'s shell to "/bin/bash", whose name contains "bash"';

const fx = fixture();
afterAll(fx.close);

describe.skipIf(fx.skip !== null)(`shell start: with SHELL=/bin/bash and a ~/.bashrc, every gated bash call is refused naming the shell${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		run = await runCase(fx.stub!, fx.root, fx.fence, {
			name: "rc",
			starter: { SHELL: "/bin/bash" },
			prepare: (h) => writeFileSync(join(h.home, ".bashrc"), `${RC_FN}() { echo "$${RC_VAR}"; }\n${RC_VAR}=from-bashrc\nset -a\n`),
		});
	}, 60_000);

	for (const role of ROLES) test(`${role}: every route is refused naming the bash-named shell; none ran`, () => expect(roleViolations(run, role, BASH_SHELL)).toEqual([]));
});
