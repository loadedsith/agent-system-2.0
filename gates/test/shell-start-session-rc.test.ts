// sl-regress-session (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7 § 5.1), case 1: a scratch
// `~/.bashrc` defining a function that references a lowercase variable, setting that variable and
// `set -a`, with `SHELL=/bin/bash` in the starter env. OMP resolves a bash-named shell from SHELL
// when no `shellPath` is set and then sources the rc into its bash snapshot (§ 1.3). After the
// change (profile `shellPath: /bin/sh`) no probe on any embedded route sees the function, the
// variable or allexport, the named call is refused, and § 2.3's env holds. The harness and what each
// assertion reads are in shell-start-session-harness.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CaseRun, fixture, RC_FN, RC_VAR, ROLES, roleViolations, runCase } from "./shell-start-session-harness";

const fx = fixture();
afterAll(fx.close);

describe.skipIf(fx.skip !== null)(`shell start: a ~/.bashrc with SHELL=/bin/bash reaches no gated bash call${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		run = await runCase(fx.stub!, fx.root, fx.fence, {
			name: "rc",
			starter: { SHELL: "/bin/bash" },
			prepare: (h) => writeFileSync(join(h.home, ".bashrc"), `${RC_FN}() { echo "$${RC_VAR}"; }\n${RC_VAR}=from-bashrc\nset -a\n`),
		});
	}, 60_000);

	for (const role of ROLES) test(`${role}: every route starts clean; the named call is refused`, () => expect(roleViolations(run, role)).toEqual([]));
});
