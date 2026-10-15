// The clean-shell switch (workload wl-mv5lrh0drbg0zk, PLAN.md revision 8, Jo in-mv64ikvmebzls0): the
// certified shell start (src/shell-start.ts) is enforced only for the sessions this switch turns it
// on for, so it can run for one lane first and be switched off with one word.
//
// The installed profile's `gates.cleanShell` is one of:
// - absent or "off": off everywhere (the default);
// - "all": on everywhere;
// - a list of workload ids: on for sessions whose AGENT_SYSTEM_WORKLOAD_ID is listed (a lane and its
//   hands, which share the lane's process env). The orchestrator has no workload id, so it is on only
//   under "all".
// `as2 clean-shell off|all|<wl-id>` (bin/as2) writes it.
//
// Read from the file at every bash call, not through OMP's Settings. OMP 18.8.6 does reload the
// global config.yml in a running session, but only through a directory watch (config/settings.ts
// startWatching, armed in rpc and interactive mode by main.ts) that applies an edit 200 ms after the
// last FSEvents event (CONFIG_WATCH_DEBOUNCE_MS) and keeps the last good layer when the file does not
// parse: a bash call right after `as2 clean-shell off` could still read the old value. The file is
// small; a read is skipped while its stat (mtime, ctime, inode, size) is unchanged. The file is the
// one OMP's Settings reads: `config.yml`, else `config.yaml`, in the agent dir (pi-utils dirs.ts
// MAIN_CONFIG_FILENAMES), parsed with the same parser (bun's YAML).
//
// An unreadable or malformed value is off: off is main's behaviour, the undoable direction. The fence
// says so once (src/fence.ts); `shellStart` names it in its reason.
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** The installed-profile key (profile/config.yml carries it; bin/as2 `clean-shell` writes it). */
export const CLEAN_SHELL_KEY = "gates.cleanShell";

/** A workload id as the ledger writes it, and as `as2 clean-shell <wl-id>` accepts it. */
export const WORKLOAD_ID = /^wl-[a-z0-9]+$/;

/** OMP's main config file names in its agent dir, in the order its Settings reads them. */
const CONFIG_FILENAMES = ["config.yml", "config.yaml"] as const;

/** The switch's value: off, on everywhere, or on for the listed workloads. */
export type CleanShellValue = "off" | "all" | readonly string[];

/** A read of the switch, or why it could not be read (which counts as off). */
export type CleanShellRead = { ok: true; value: CleanShellValue } | { ok: false; error: string };

/** The read the fence makes per call (gates/index.ts hostCleanShell; tests hand in their own). */
export type CleanShellCheck = () => Promise<CleanShellRead>;

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The switch from the value at `gates.cleanShell` (undefined when the key is absent). */
export function parseCleanShell(value: unknown): CleanShellRead {
	if (value === undefined || value === "off") return { ok: true, value: "off" };
	if (value === "all") return { ok: true, value: "all" };
	if (Array.isArray(value) && value.every((v) => typeof v === "string" && WORKLOAD_ID.test(v))) return { ok: true, value: [...(value as string[])] };
	return { ok: false, error: `${CLEAN_SHELL_KEY} is ${JSON.stringify(value)}, not "off", "all" or a list of workload ids (wl-…)` };
}

/** The switch in a parsed config document: the value at `gates.cleanShell`, read the way the raw settings layer is (host.ts unknownSetting). */
export function cleanShellOfConfig(doc: unknown): CleanShellRead {
	let cur: unknown = doc;
	for (const seg of CLEAN_SHELL_KEY.split(".")) {
		if (!cur || typeof cur !== "object" || !(seg in cur)) return parseCleanShell(undefined);
		cur = (cur as Record<string, unknown>)[seg];
	}
	return parseCleanShell(cur);
}

const cache = new Map<string, { stamp: string; read: CleanShellRead }>();

/** The switch in the profile config under `agentDir` (no config file: off). Re-read only when the file's stat changes. */
export function readCleanShell(agentDir: string): CleanShellRead {
	for (const name of CONFIG_FILENAMES) {
		const path = join(agentDir, name);
		let stamp: string;
		try {
			const st = statSync(path, { bigint: true, throwIfNoEntry: false });
			if (!st) continue;
			stamp = `${st.mtimeNs}:${st.ctimeNs}:${st.ino}:${st.size}`;
		} catch (err) {
			return { ok: false, error: `${path} could not be read (${message(err)})` };
		}
		const hit = cache.get(path);
		if (hit?.stamp === stamp) return hit.read;
		let read: CleanShellRead;
		try {
			read = cleanShellOfConfig(Bun.YAML.parse(readFileSync(path, "utf8")));
		} catch (err) {
			read = { ok: false, error: `${path} could not be read or parsed (${message(err).split("\n")[0]})` };
		}
		cache.set(path, { stamp, read });
		return read;
	}
	return { ok: true, value: "off" };
}

/** The switch through OMP's `getAgentDir` (`@oh-my-pi/pi-utils`, host.ts HOST_MEMBERS), or why not. */
export function cleanShellFromHost(getAgentDir: unknown): CleanShellRead {
	if (typeof getAgentDir !== "function") return { ok: false, error: `@oh-my-pi/pi-utils getAgentDir is ${getAgentDir === null ? "null" : typeof getAgentDir}, not a function, so the profile config could not be found` };
	try {
		return readCleanShell(String(getAgentDir()));
	} catch (err) {
		return { ok: false, error: `the profile's agent dir could not be read (${message(err)})` };
	}
}

/** Whether the switch turns the clean shell on for a session with this workload id (none: the orchestrator). */
export function cleanShellOn(read: CleanShellRead, workloadId: string | undefined): boolean {
	if (!read.ok) return false;
	if (read.value === "all") return true;
	if (read.value === "off") return false;
	return workloadId !== undefined && read.value.includes(workloadId);
}

/** Why the clean shell is off for this session, and how to turn it on. */
export function cleanShellOffReason(read: CleanShellRead, workloadId: string | undefined): string {
	const how = `turn it on with \`as2 clean-shell ${workloadId ?? "all"}\`${workloadId ? " (or `as2 clean-shell all`)" : ""}`;
	if (!read.ok) return `the clean shell is off for this session because ${CLEAN_SHELL_KEY} could not be read (${read.error}): fix it, or ${how}`;
	const why =
		read.value === "off" ? `${CLEAN_SHELL_KEY} is "off" or absent`
		: workloadId === undefined ? `${CLEAN_SHELL_KEY} lists workloads and this session has none (the orchestrator is on only under "all")`
		: `${CLEAN_SHELL_KEY} does not list ${workloadId}`;
	return `the clean shell is off for this session (${why}), so its shell start is not certified: ${how}`;
}
