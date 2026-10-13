// sl-regress-session (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7 § 5.1), the env-exactness
// cases (§ 2.3: every exported name but PWD, SHLVL and _ is in `cert.env` = C environ ⊕ `shell.env` ⊕
// the non-interactive env, with its value; every ordinary `cert.env` name is exported). Every
// session also makes a named call, which the change refuses. The harness is
// shell-start-session-harness.ts.
// - Case 6: a launch-env name `filterChildShellEnv` strips from `shell.env`
//   (GIT_ALTERNATE_OBJECT_DIRECTORIES, pointed at an empty scratch dir). It stays in the C environ,
//   so it is in `cert.env` and reaches the child, and it stays exported after the typed command
//   assigns it (OpenAI r4 B1's probe). The orchestrator may not assign (row 15), so it prints it.
// - Case 8: IFS, UID, EUID, PPID, BASH_VERSION, OPTIND and PS1 set in `shell.env` (OpenAI r5 M1):
//   brush may withhold them, but no exported name falls outside `cert.env` or differs from it.
// - Case 9: a `__proto__` entry in the C environ (OpenAI r5 m1) is in `cert.env` and in the child.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type CaseRun, certEnv, fixture, type Probe, ROLES, roleViolations, runCase } from "./shell-start-session-harness";

const fx = fixture();
afterAll(fx.close);

const STRIPPED = "GIT_ALTERNATE_OBJECT_DIRECTORIES";
/** The special names of case 8, each with a scratch value. */
const SPECIAL: Record<string, string> = { IFS: ":", UID: "4242", EUID: "4243", PPID: "4244", BASH_VERSION: "9.9.9-as2probe", OPTIND: "7", PS1: "as2probe$ " };

/** The value probe `p`'s `cert.env` holds for `name`, or undefined. */
const certValue = (p: Probe, name: string): string | undefined => (p.rec && !p.rec.error ? certEnv(p.rec).get(name) : undefined);

describe.skipIf(fx.skip !== null)(`shell start: a launch-env name filterChildShellEnv strips is in cert.env and stays exported${fx.reason}`, () => {
	let run: CaseRun;
	let launchValue = "";
	const assigned = "/nonexistent/as2probe-assigned";
	beforeAll(async () => {
		launchValue = join(fx.root, "alt-objects");
		mkdirSync(launchValue);
		run = await runCase(fx.stub!, fx.root, fx.fence, { name: "strip", launchExtra: [[STRIPPED, launchValue]], prefix: `${STRIPPED}=${assigned}; ` });
	}, 60_000);

	for (const role of ROLES)
		test(`${role}: in cert.env and the child on every embedded route; the named call is refused`, () => {
			const out: string[] = [];
			for (const p of run.probes.filter((q) => q.role === role && q.route !== "named" && q.ran)) {
				if (certValue(p, STRIPPED) !== launchValue) out.push(`${role} ${p.route}: cert.env lacks ${STRIPPED} or holds another value`);
				// Lane and hand assigned it: still exported, with the assigned value. The orchestrator printed it.
				const want = p.exported ? assigned : launchValue;
				if (p.env.get(STRIPPED) !== want) out.push(`${role} ${p.route}: the child's ${STRIPPED} is ${p.env.has(STRIPPED) ? "another value" : "absent"}`);
			}
			// The assignment is the typed command's own: § 2.3's value check skips that one name.
			const others = roleViolations(run, role).filter((v) => !(v.includes(STRIPPED) && v.includes("a value other than cert.env's")));
			expect([...out, ...others]).toEqual([]);
		});
});

describe.skipIf(fx.skip !== null)(`shell start: special names in shell.env stay a subset of cert.env${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		run = await runCase(fx.stub!, fx.root, fx.fence, { name: "spec", before: [{ tool: "as2probe_env", args: { set: JSON.stringify(SPECIAL) } }] });
	}, 60_000);

	for (const role of ROLES)
		test(`${role}: exported ⊆ cert.env with equal values; the named call is refused`, () => {
			const out: string[] = [];
			// The lever worked: the call's shell.env carries every special name.
			for (const p of run.probes.filter((q) => q.role === role && q.route !== "named"))
				for (const [k, v] of Object.entries(SPECIAL)) if (p.rec?.shellEnv?.[k] !== v) out.push(`harness: ${role} ${p.route}: shell.env lacks ${k}`);
			expect([...out, ...roleViolations(run, role)]).toEqual([]);
		});
});

describe.skipIf(fx.skip !== null)(`shell start: a __proto__ entry in the C environ is in cert.env and the child${fx.reason}`, () => {
	let run: CaseRun;
	beforeAll(async () => {
		run = await runCase(fx.stub!, fx.root, fx.fence, { name: "proto", launchExtra: [["__proto__", "as2probe-proto"]] });
	}, 60_000);

	for (const role of ROLES)
		test(`${role}: __proto__ in cert.env and the child on every embedded route; the named call is refused`, () => {
			const out: string[] = [];
			for (const p of run.probes.filter((q) => q.role === role && q.route !== "named" && q.ran)) {
				if (certValue(p, "__proto__") !== "as2probe-proto") out.push(`${role} ${p.route}: cert.env lacks __proto__`);
				if (p.env.get("__proto__") !== "as2probe-proto") out.push(`${role} ${p.route}: the child lacks __proto__`);
			}
			expect([...out, ...roleViolations(run, role)]).toEqual([]);
		});
});
