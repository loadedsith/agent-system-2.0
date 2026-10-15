// The clean-shell switch in real sessions (workload wl-mv5lrh0drbg0zk, PLAN.md revision 8 "Proofs"):
// - switch off (`gates.cleanShell` absent from the scratch profile, as a profile installed before
//   revision 8 has it): the fence never reads the certificate, so a lane's and the orchestrator's
//   named and `pty: true` calls run as on origin/main, where the clean shell refuses both;
// - one running lane session follows the switch on its next call: listed (`[<its workload>]`), its
//   `pty: true` call is refused; `as2 clean-shell off` (bin/as2, run by this process between the
//   session's calls: an agent's own run of it is P-11 row 6's, which refuses the script's
//   `rm -f "$tmp"`) rewrites the scratch profile's config.yml and the session's next `pty: true`
//   call runs; `as2 clean-shell <its workload>` puts it back, and the call after that is refused.
// The harness is shell-start-session-harness.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import {
	collect,
	fixture,
	type Home,
	laneLaunch,
	makeHome,
	orchestratorLaunch,
	type Probe,
	probeId,
	probeSteps,
	REPO,
	type Route,
	runSession,
	setCleanShell,
	type Step,
} from "./shell-start-session-harness";

const fx = fixture();
afterAll(fx.close);

const OFF_ROUTES: Route[] = ["foreground", "pty", "named"];
const PTY_REFUSED = "rerun the call without `pty`";

/** A probe that ran and was not refused by the fence. */
function ranUnrefused(p: Probe): string[] {
	const at = `${p.role} ${p.route} (${p.id})`;
	const out: string[] = [];
	if (!p.ran) out.push(`${at}: did not run: ${JSON.stringify((p.text ?? "no result").slice(0, 200))}`);
	if (p.text?.includes("M4b OS fence")) out.push(`${at}: the fence refused it: ${JSON.stringify(p.text.slice(0, 200))}`);
	return out;
}

describe.skipIf(fx.skip !== null)(`clean shell off: named and pty calls run as on origin/main${fx.reason}`, () => {
	const probes: Probe[] = [];
	beforeAll(async () => {
		const stub = fx.stub!;
		const hl = makeHome(fx.root, "offl", stub, null);
		const lane = laneLaunch(hl, fx.fence, { name: "off" });
		stub.script("off-lane", [...probeSteps("lane", hl, "off", OFF_ROUTES), { text: "done" }]);
		await runSession(stub, { tag: "off-lane", home: hl, env: lane.env, launcherArgs: [], headless: true });
		for (const route of OFF_ROUTES) probes.push(await collect(stub, "off-lane", hl, "lane", route, probeId("off", "lane", route)));
		const ho = makeHome(fx.root, "offo", stub, null);
		const orch = orchestratorLaunch(ho, fx.fence, { name: "off" });
		stub.script("off-orch", [...probeSteps("orchestrator", ho, "off", OFF_ROUTES), { text: "done" }]);
		await runSession(stub, { tag: "off-orch", home: ho, env: orch.env, launcherArgs: orch.args, headless: false });
		for (const route of OFF_ROUTES) probes.push(await collect(stub, "off-orch", ho, "orchestrator", route, probeId("off", "orchestrator", route)));
	}, 60_000);

	for (const role of ["lane", "orchestrator"] as const)
		test(`${role}: the foreground, pty and named calls all ran, none refused`, () => {
			expect(probes.filter((p) => p.role === role).flatMap(ranUnrefused)).toEqual([]);
		});
});

describe.skipIf(fx.skip !== null)(`clean shell flipped in a running lane session: its next call follows${fx.reason}`, () => {
	let h: Home;
	let workloadId = "";
	const p: Probe[] = [];
	const said: string[] = [];
	beforeAll(async () => {
		const stub = fx.stub!;
		h = makeHome(fx.root, "flip", stub, null);
		const lane = laneLaunch(h, fx.fence, { name: "flip" });
		workloadId = lane.workloadId;
		setCleanShell(h, [workloadId]);
		/** `as2 clean-shell <arg>` as Jo runs it, against the scratch HOME. */
		const as2 = (arg: string) => () => {
			const r = spawnSync("/bin/sh", [join(REPO, "bin", "as2"), "clean-shell", arg], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: h.home } });
			said.push(`${r.status}: ${r.stdout}${r.stderr}`);
		};
		const probe = (suffix: string, first?: () => void): Step[] =>
			probeSteps("lane", h, "flip", ["pty"], { suffix }).map((s, i) => (i === 0 && first && "tool" in s ? { ...s, first } : s));
		stub.script("flip-lane", [...probe("1"), ...probe("2", as2("off")), ...probe("3", as2(workloadId)), { text: "done" }]);
		await runSession(stub, { tag: "flip-lane", home: h, env: lane.env, launcherArgs: [], headless: true });
		for (const s of ["1", "2", "3"]) p.push(await collect(stub, "flip-lane", h, "lane", "pty", probeId("flip", "lane", "pty", s)));
	}, 60_000);

	test("listed: the pty call is refused naming pty", () => {
		expect({ ran: p[0]!.ran, refused: p[0]!.text?.includes(PTY_REFUSED) }).toEqual({ ran: false, refused: true });
	});

	test("`as2 clean-shell off` between calls writes off, and the session's next pty call runs", () => {
		expect(said[0]).toBe(`0: gates.cleanShell: [${workloadId}] -> off (${join(h.agentDir, "config.yml")})\n`);
		expect(ranUnrefused(p[1]!)).toEqual([]);
	});

	test("`as2 clean-shell <its workload>` puts it back, and the call after that is refused again", () => {
		expect(said[1]).toBe(`0: gates.cleanShell: off -> [${workloadId}] (${join(h.agentDir, "config.yml")})\n`);
		expect({ ran: p[2]!.ran, refused: p[2]!.text?.includes(PTY_REFUSED) }).toEqual({ ran: false, refused: true });
	});
});
