// An OMP extension the shell-start session regression loads before the gates
// (shell-start-session-harness.ts): at each bash tool_call it writes what the call's embedded shell
// starts from, as this omp process holds it then (PLAN.md revision 7 § 1.7, § 2.3):
// - the C environ, read through bun:ffi `_NSGetEnviron` (libSystem) into ordered entries, so a
//   `__proto__` entry is kept and `Bun.env` edits, which never reach it, are not mistaken for it;
// - `shell.env` and the shell, `Settings.getShellConfig()` of the live session's settings;
// - the non-interactive env, `buildNonInteractiveEnv()` (the bash tool passes no `env`, and the
//   checkout has no `.envrc`, so the per-command overrides are empty).
// It writes `<HOME>/as2probe-recorder/<toolCallId>.json` and never blocks or revises a call.
//
// It also registers `as2probe_env`, the shell-reuse case's lever (§ 5.1, OpenAI r5 B1): set and
// delete `Bun.env` names, then `refreshShellConfigCache()`, the call OMP makes on session_start,
// session_switch and session_branch. Bun.env edits never reach the C environ, so only `shell.env`
// changes.
import { CString, dlopen, FFIType, read } from "bun:ffi";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Handler = (event: { toolName: string; toolCallId?: string; input: Record<string, unknown> }, ctx: unknown) => unknown;
interface StringSchema {
	describe(text: string): StringSchema;
	optional(): StringSchema;
}
interface RecorderAPI {
	on(event: "tool_call", h: Handler): void;
	registerTool(tool: Record<string, unknown>): void;
	zod: { object(shape: Record<string, unknown>): unknown; string(): StringSchema };
}

/** The C environ as ordered `[name, value]` entries; throws on an entry without `=`. */
function cEnviron(): [string, string][] {
	const lib = dlopen("/usr/lib/libSystem.B.dylib", { _NSGetEnviron: { args: [], returns: FFIType.ptr } });
	try {
		const environPtr = lib.symbols._NSGetEnviron();
		if (!environPtr) throw new Error("_NSGetEnviron returned null");
		const envp = read.ptr(environPtr, 0);
		const out: [string, string][] = [];
		for (let i = 0; ; i++) {
			const p = read.ptr(envp, i * 8);
			if (!p) break;
			const entry = new CString(p).toString();
			const eq = entry.indexOf("=");
			if (eq < 0) throw new Error(`environ entry without '=': ${JSON.stringify(entry.slice(0, 40))}`);
			out.push([entry.slice(0, eq), entry.slice(eq + 1)]);
		}
		return out;
	} finally {
		lib.close();
	}
}

export default function shellStartRecorder(pi: RecorderAPI): void {
	const dir = join(homedir(), "as2probe-recorder");
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "bash") return undefined;
		const command = typeof event.input.command === "string" ? event.input.command : "";
		const record: Record<string, unknown> = { toolCallId: event.toolCallId, command };
		try {
			// Dynamic, from this entry file: this checkout carries no OMP to import statically, and
			// legacy-pi-compat hands an entry file's bare `@oh-my-pi/*` import the host's own module
			// instance (gates/index.ts hostModules, same reason).
			const [{ Settings }, { buildNonInteractiveEnv }] = await Promise.all([
				import("@oh-my-pi/pi-coding-agent/config/settings"),
				import("@oh-my-pi/pi-coding-agent/exec/non-interactive-env"),
			]);
			const settings = await Settings.current;
			if (!settings) throw new Error("no live Settings");
			const config = settings.getShellConfig();
			record.environ = cEnviron();
			record.shellEnv = config.env;
			record.shell = config.shell;
			record.nonInteractive = buildNonInteractiveEnv();
		} catch (err) {
			record.error = err instanceof Error ? err.message : String(err);
		}
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${String(event.toolCallId)}.json`), JSON.stringify(record));
		return undefined;
	});

	const z = pi.zod;
	pi.registerTool({
		name: "as2probe_env",
		loadMode: "essential",
		label: "as2probe_env",
		description: "Test lever: set and delete Bun.env names, then refresh OMP's shell config cache.",
		parameters: z.object({
			set: z.string().optional().describe("JSON object of names to set"),
			unset: z.string().optional().describe("comma-separated names to delete"),
		}),
		async execute(_id: string, params: { set?: string; unset?: string }) {
			// Dynamic for the reason above, and from the package root: legacy-pi-compat routes a bundled
			// package's root onto the host's instance, while `@oh-my-pi/pi-utils/procmgr` loaded a second
			// copy whose refresh never reached the host's cache (measured: shell.env kept no set name).
			const { procmgr } = await import("@oh-my-pi/pi-utils");
			for (const k of (params.unset ?? "").split(",").filter(Boolean)) delete Bun.env[k];
			const set: Record<string, string> = params.set ? JSON.parse(params.set) : {};
			for (const [k, v] of Object.entries(set)) Bun.env[k] = v;
			procmgr.refreshShellConfigCache();
			return { content: [{ type: "text", text: "as2probe_env applied" }], details: {} };
		},
	});
}
