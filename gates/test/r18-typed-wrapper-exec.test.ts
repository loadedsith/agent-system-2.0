// P-11 row 18's real-execution half (PLAN.md revision 4 § 4, workload wl-mv4enu3823jb7k): a bare
// command and a command carrying `sandbox-exec` as quoted data pass every row, and the fence's
// revision runs for real under /usr/bin/sandbox-exec. The pure verdicts are in r18-typed-wrapper.test.ts.
//
// Inside a lane this runs nested under the lane's own fence, and Seatbelt refuses a nested profile
// looser than the outer one with exit 71 (fence.ts ALREADY_WRAPPED_REASON's comment). So the cwd is
// the repository root and the environment is this process's own: the profile is built from the same
// targets as the outer fence (fence.ts fenceTargets reads only the ledger path and the directories).
// The lane-binding variables are dropped so the gates judge as an unbound session and write nothing
// to the ledger; none of them is a fence target.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import p11Gates from "../index";
import type { FenceSettings } from "../src/fence";
import type { GatesAPI } from "../src/session";
import { LANE_ENV, ROLE_ENV, WORKLOAD_ENV } from "../src/types";

type AnyHandler = (event: Record<string, unknown>, ctx: unknown) => unknown;
type Revised = { block?: boolean; reason?: string; input?: Record<string, unknown> } | undefined;

const ON: FenceSettings = { enabled: true, autoBackground: true };
const ENV: Record<string, string | undefined> = { ...process.env };
for (const name of [WORKLOAD_ENV, LANE_ENV, ROLE_ENV]) delete ENV[name];
const ROOT = resolve(import.meta.dir, "..", "..");

/** The command the gates revise a bash call from the repository root into, through every row and the fence. */
async function revised(command: string): Promise<string> {
	const handlers: AnyHandler[] = [];
	const pi = {
		on: (name: string, h: AnyHandler) => {
			if (name === "tool_call") handlers.push(h);
		},
		getActiveTools: () => ["bash", "read"],
		getAllTools: () => [{ name: "bash" }, { name: "read" }],
		setActiveTools: async () => {},
		appendEntry: () => {},
		registerTool: () => {},
		zod: { object: () => ({}), string: () => ({ describe: () => ({}), optional: () => ({ describe: () => ({}) }) }) },
	};
	p11Gates(pi as unknown as GatesAPI, ENV, async () => ON);
	const ctx = { hasUI: true, cwd: ROOT, sessionManager: { getHeader: () => null, getEntries: () => [] }, ui: { notify: () => {} } };
	const event = { toolName: "bash", toolCallId: "r18-exec", input: { command } };
	let last: Revised;
	for (const h of handlers) {
		const r = (await h(event, ctx)) as Revised;
		if (!r) continue;
		if (r.block) throw new Error(`refused: ${r.reason}`);
		last = r;
	}
	const wrapped = String(last?.input?.command);
	expect(wrapped).toStartWith("'/usr/bin/sandbox-exec' -p '(version 1)(allow default)");
	return wrapped;
}

/** Run `command` with /bin/bash -c, the shape OMP's shell hands the wrapper to. */
function sh(command: string) {
	const r = spawnSync("/bin/bash", ["-c", command], { cwd: ROOT, env: ENV as NodeJS.ProcessEnv, encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
	return { code: r.status, out: r.stdout, err: r.stderr };
}

describe("row 18 lets bare commands through and the fence's revision runs", () => {
	test("printf one prints one, exit 0", async () => {
		expect(sh(await revised("printf one"))).toEqual({ code: 0, out: "one", err: "" });
	});

	test("grep -n 'sandbox-exec' finds its line: quoted data is neither row 18's nor the fence's to refuse", async () => {
		const r = sh(await revised("grep -n 'sandbox-exec' gates/src/rows/r18-typed-wrapper.ts"));
		expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
		expect(r.out).toMatch(/^\d+:.*sandbox-exec/m);
	});
});
