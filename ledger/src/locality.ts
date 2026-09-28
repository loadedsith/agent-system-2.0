// Where the ledger file lives, and the refusal to put it on a synced or network folder.
// SPEC-2.0.md § B2 fix 3: v1 ledger state is local, never on a synced or network folder,
// because SQLite WAL does not work over a network filesystem.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

/** Env var that overrides the ledger path. The M4 raw-write gate matches the same variable. */
export const LEDGER_DB_ENV = "AGENT_SYSTEM_LEDGER_DB";

/** Default ledger file, relative to $HOME. Outside every OMP profile. */
export const DEFAULT_LEDGER_RELATIVE = join(".agent-system-2", "ledger.db");

/** $AGENT_SYSTEM_LEDGER_DB if set, else $HOME/.agent-system-2/ledger.db. */
export function defaultLedgerPath(env: Record<string, string | undefined> = process.env): string {
	const override = env[LEDGER_DB_ENV];
	if (override && override.trim() !== "") return resolve(override);
	return join(env.HOME ?? homedir(), DEFAULT_LEDGER_RELATIVE);
}

/**
 * Folders, relative to $HOME, that a sync client owns on macOS or commonly owns elsewhere.
 * Desktop and Documents are included because macOS "Desktop & Documents in iCloud" syncs them.
 */
export const SYNCED_HOME_FOLDERS = [
	join("Library", "Mobile Documents"),
	join("Library", "CloudStorage"),
	"Desktop",
	"Documents",
	"Dropbox",
	"Google Drive",
	"OneDrive",
	"Box",
	"Box Sync",
	"iCloud Drive",
	"pCloud Drive",
];

/** Filesystem types refused on Linux (from /proc/mounts). macOS uses the "local" mount flag instead. */
export const NETWORK_FS_TYPES: Record<string, true> = {
	nfs: true, nfs4: true, cifs: true, smb: true, smb3: true, smbfs: true, afs: true, afpfs: true,
	webdav: true, davfs: true, "fuse.sshfs": true, sshfs: true, "9p": true, ceph: true, glusterfs: true,
	"fuse.rclone": true, "fuse.s3fs": true, lustre: true,
};

export class LedgerLocationError extends Error {}

/** The nearest existing ancestor of `path` (the file itself may not exist yet). */
function existingAncestor(path: string): string {
	let p = resolve(path);
	while (!existsSync(p)) {
		const up = dirname(p);
		if (up === p) break;
		p = up;
	}
	return p;
}

function mountPointOf(path: string): string | null {
	const out = Bun.spawnSync(["df", "-P", path], { stdout: "pipe", stderr: "pipe" });
	if (out.exitCode !== 0) return null;
	const lines = out.stdout.toString().trim().split("\n");
	const last = lines[lines.length - 1]?.trim().split(/\s+/);
	// POSIX df -P: Filesystem, blocks, used, available, capacity, mounted-on (may contain spaces).
	return last && last.length >= 6 ? last.slice(5).join(" ") : null;
}

/** "local" | "network:<why>" | "unknown:<why>". */
export function mountLocality(path: string): string {
	const target = existingAncestor(path);
	const mp = mountPointOf(target);
	if (!mp) return "unknown:df failed";
	if (process.platform === "darwin") {
		const out = Bun.spawnSync(["/sbin/mount"], { stdout: "pipe", stderr: "pipe" });
		const line = out.stdout.toString().split("\n").find((l) => l.includes(` on ${mp} (`));
		if (!line) return `unknown:no mount entry for ${mp}`;
		const flags = line.slice(line.lastIndexOf("(") + 1, line.lastIndexOf(")")).split(",").map((s) => s.trim());
		return flags.includes("local") ? "local" : `network:${mp} is mounted without the local flag (${flags[0]})`;
	}
	if (existsSync("/proc/mounts")) {
		const entry = readFileSync("/proc/mounts", "utf8").split("\n").map((l) => l.split(" "))
			.find((f) => f[1]?.replace(/\\040/g, " ") === mp);
		if (!entry) return `unknown:no /proc/mounts entry for ${mp}`;
		return Object.hasOwn(NETWORK_FS_TYPES, entry[2] ?? "") ? `network:${mp} is ${entry[2]}` : "local";
	}
	return "unknown:unsupported platform";
}

/**
 * Throws LedgerLocationError when `path` sits under a sync-client folder of `home` or on a
 * non-local mount. An undeterminable mount is refused too: the rule is "never on a network
 * folder", so an unknown answer is not a pass.
 */
export function assertLocalPath(path: string, home: string = process.env.HOME ?? homedir()): void {
	const abs = resolve(path);
	for (const rel of SYNCED_HOME_FOLDERS) {
		const root = join(resolve(home), rel);
		if (abs === root || abs.startsWith(root + sep)) {
			throw new LedgerLocationError(`ledger path ${abs} is inside ${root}, a synced folder; set ${LEDGER_DB_ENV} to a local path`);
		}
	}
	const where = mountLocality(abs);
	if (where !== "local") {
		throw new LedgerLocationError(`ledger path ${abs} is not on a local filesystem (${where}); set ${LEDGER_DB_ENV} to a local path`);
	}
}
