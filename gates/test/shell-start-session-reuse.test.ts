// sl-regress-session (workload wl-mv5lrh0drbg0zk, PLAN.md revision 7 § 5.1), case 7: Shell reuse
// (OpenAI r5 B1), run with the clean shell on (`gates.cleanShell: "all"` in the scratch profile). A
// foreground call runs on the session's persistent brush Shell (§ 1.2 item 5), reused while
// `buildSessionKey` (`shell.env` sorted, `key=value` joined with `\n`) matches. (Until revision 8 the
// probes used `pty: true`, which takes the same Shell in an rpc session; with the clean shell on a
// `pty: true` call is now refused without PI_NO_PTY=1, which no launcher sets.) Between
// two such calls the recorder's `as2probe_env` lever changes `shell.env` from {A=a, B=b} to
// {A='a\nB=b'} and refreshes OMP's shell config cache. A and B are names that sort next to each
// other in the session's env (measured: with names that sort apart, other entries fall between
// them, the key changes, and no Shell is reused), so the key is unchanged and today the second call
// reuses a Shell built with B. After the change that call is refused (a newline value in
// `shell.env`, § 2.2 item 5). With a newline-free change ({A=a2}) the next call runs on a fresh
// Shell where B, assigned in the typed command, is not exported. The lane and the orchestrator run
// it; a hand shares the lane's process, its cache and its Shell keys, so it adds nothing here. The
// harness is shell-start-session-harness.ts.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
	type Role,
	runSession,
	type Step,
	UNSET,
	violations,
} from "./shell-start-session-harness";

const fx = fixture();
afterAll(fx.close);

const A = "AS2PROBE_REUSE_A";
const B = "AS2PROBE_REUSE_B";
const lever = (set: Record<string, string>, unset = ""): Step => ({ tool: "as2probe_env", args: { set: JSON.stringify(set), unset } });

/**
 * The sequence: {A=a,B=b} → probe 1; {A='a\nB=b'} → probe 2 (assigns B); back to {A=a,B=b} →
 * probe 3; {A=a2} → probe 4 (assigns B). The orchestrator cannot assign (row 15): it prints B.
 */
function reuseSteps(role: Role, h: Home): Step[] {
	const probe = (suffix: string, prefix = "") => probeSteps(role, h, "reuse", ["foreground"], { suffix, prefix, names: [B] });
	return [
		lever({ [A]: "a", [B]: "b" }),
		...probe("1"),
		lever({ [A]: `a\n${B}=b` }, B),
		...probe("2", `${B}=after; `),
		lever({ [A]: "a", [B]: "b" }),
		...probe("3"),
		lever({ [A]: "a2" }, B),
		...probe("4", `${B}=after; `),
		{ text: "done" },
	];
}

describe.skipIf(fx.skip !== null)(`shell start: a reused Shell never outlives a shell.env change${fx.reason}`, () => {
	const probes = new Map<Role, Probe[]>();
	beforeAll(async () => {
		const stub = fx.stub!;
		const hl = makeHome(fx.root, "rul", stub);
		const lane = laneLaunch(hl, fx.fence, { name: "reuse" });
		stub.script("reuse-lane", reuseSteps("lane", hl));
		await runSession(stub, { tag: "reuse-lane", home: hl, env: lane.env, launcherArgs: [], headless: true });
		const ho = makeHome(fx.root, "ruo", stub);
		const orch = orchestratorLaunch(ho, fx.fence, { name: "reuse" });
		stub.script("reuse-orch", reuseSteps("orchestrator", ho));
		await runSession(stub, { tag: "reuse-orch", home: ho, env: orch.env, launcherArgs: orch.args, headless: false });
		for (const [role, tag, h] of [["lane", "reuse-lane", hl], ["orchestrator", "reuse-orch", ho]] as const)
			probes.set(role, await Promise.all(["1", "2", "3", "4"].map((s) => collect(stub, tag, h, role, "foreground", probeId("reuse", role, "foreground", s)))));
	}, 60_000);

	for (const role of ["lane", "orchestrator"] as const)
		test(`${role}: the call after a newline shell.env value is refused; after a newline-free change B is not exported`, () => {
			const [p1, p2, p3, p4] = probes.get(role)!;
			const out: string[] = [];
			for (const [n, p] of [["1", p1!], ["3", p3!], ["4", p4!]] as const) out.push(...violations(p).map((v) => `call ${n}: ${v}`));
			// Call 4 assigned B on a fresh Shell: B is not exported (lane), not set (orchestrator).
			const b4 = p4!.env.get(B);
			if (p4!.ran && b4 !== undefined && b4 !== UNSET) out.push(`call 4: ${B} is ${p4!.exported ? "exported" : "set"} after the newline-free change`);
			if (p2!.ran) {
				out.push("call 2: ran after shell.env took a newline value (not refused)");
				out.push(...violations(p2!).map((v) => `call 2: ${v}`));
			} else if (!/newline/i.test(p2!.text ?? "")) out.push(`call 2: refused without naming the newline value: ${JSON.stringify((p2!.text ?? "no result").slice(0, 160))}`);
			expect(out).toEqual([]);
		});
});
