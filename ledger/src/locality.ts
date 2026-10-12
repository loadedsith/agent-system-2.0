// Where the ledger file lives, and the refusal to put it on a synced or network folder.
// SPEC-2.0.md § B2 fix 3: v1 ledger state is local, never on a synced or network folder,
// because SQLite WAL does not work over a network filesystem.
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

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

let accountHome: string | undefined;

/**
 * The account's own ledger: the default path under the home directory the password database gives
 * this user, which a test's `HOME=$(mktemp -d)` does not move. Under `bun test` this is the live
 * ledger the user's lanes write, whatever HOME and $AGENT_SYSTEM_LEDGER_DB say. Bun's
 * `os.userInfo().homedir` and `os.homedir()` both follow $HOME, so the home comes from the shell's
 * `~user` expansion, which reads the password database. A failed lookup throws: the guard fails
 * closed.
 */
export function liveLedgerPath(): string {
	if (accountHome === undefined) {
		const out = Bun.spawnSync(["/bin/sh", "-c", 'eval "echo ~$(id -un)"'], { stdout: "pipe", stderr: "pipe" });
		const home = out.stdout.toString().trim();
		if (out.exitCode !== 0 || !isAbsolute(home)) {
			throw new Error(`could not read this account's home directory from the password database (exit ${out.exitCode}: ${out.stderr.toString().trim() || home})`);
		}
		accountHome = home;
	}
	return join(accountHome, DEFAULT_LEDGER_RELATIVE);
}

function canonicalOrResolved(path: string): string {
	if (existsSync(path)) return realpathSync(path);
	const dir = dirname(resolve(path));
	return join(existsSync(dir) ? realpathSync(dir) : dir, basename(path));
}

/** A test process reached for the account's live ledger. Thrown before any connection is opened. */
export class LiveLedgerUnderTestError extends Error {
	constructor(readonly path: string) {
		super(`refusing to open the live ledger ${path} from a test run (NODE_ENV=test): a test opens a ledger it ` +
			`created, never the account's own (ledger/SCHEMA.md, Tests never open the live ledger)`);
		this.name = "LiveLedgerUnderTestError";
	}
}

/**
 * Refuse `path` when this process is a test run (`bun test` sets NODE_ENV=test, and its child
 * processes inherit it) and `path` is the account's live ledger. A real-HOME `bun test` whose code
 * fell through to the default path once opened the live file with a branch's module and upgraded
 * its schema under every process running main (2026-10-12).
 */
export function assertNotLiveLedgerUnderTest(path: string, env: Record<string, string | undefined> = process.env): void {
	if (env.NODE_ENV !== "test") return;
	const live = canonicalOrResolved(liveLedgerPath());
	if (canonicalOrResolved(path) === live) throw new LiveLedgerUnderTestError(live);
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

/**
 * The path the operating system would actually open for `path`, which need not exist yet: the
 * nearest existing ancestor (looked up without following it) resolved through every symlink,
 * plus the not-yet-existing remainder. A dangling symlink is followed to where it points, since
 * opening it would create its target.
 */
export function canonicalPath(path: string, hops = 0): string {
	if (hops > 40) throw new LedgerLocationError(`too many symbolic links resolving ${path}`);
	let head = resolve(path);
	const rest: string[] = [];
	for (;;) {
		let isLink: boolean | null = null;
		try {
			isLink = lstatSync(head).isSymbolicLink();
		} catch {
			// head does not exist; walk up
		}
		if (isLink !== null) {
			if (isLink && !existsSync(head)) return canonicalPath(join(linkTarget(head, hops), ...rest), hops + 1);
			try {
				return join(realpathSync(head), ...rest);
			} catch (err) {
				// Bun's realpathSync (1.3.14, macOS) throws EOPNOTSUPP on a unix socket, or a symlink
				// to one (/var/run/docker.sock, /var/run/mDNSResponder). Resolve it by hand: follow the
				// link the way the dangling case does, else the canonical parent plus the entry's name.
				if (!(err instanceof Error && "code" in err && err.code === "EOPNOTSUPP")) throw err;
				if (isLink) return canonicalPath(join(linkTarget(head, hops), ...rest), hops + 1);
				return join(realpathSync(dirname(head)), basename(head), ...rest);
			}
		}
		const up = dirname(head);
		if (up === head) return join(head, ...rest);
		rest.unshift(basename(head));
		head = up;
	}
}

/**
 * Where the symlink `link` points, resolved as pathname resolution does (POSIX base definitions
 * § 4.16): a relative target starts from the directory that really contains the link, not its
 * spelling, and each `..` is the physical parent of the component resolved before it. Collapsing
 * the target lexically instead names the wrong file when a directory on the way is itself a link
 * (PR #39 review). Every component goes back through canonicalPath, so the hop limit still holds.
 */
function linkTarget(link: string, hops: number): string {
	const target = readlinkSync(link);
	let at = isAbsolute(target) ? sep : realpathSync(dirname(link));
	for (const part of target.split(sep)) {
		if (part === "" || part === ".") continue;
		at = part === ".." ? dirname(at) : canonicalPath(join(at, part), hops + 1);
	}
	return at;
}

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
 * non-local mount; otherwise returns the canonical path (symlinks resolved), which is the path
 * the caller must open. The path and each synced root are compared both as written and after
 * canonicalisation, so a symlink into a synced folder, a synced folder that is itself a symlink,
 * and a symlinked $HOME are all refused. An undeterminable mount is refused too: the rule is
 * "never on a network folder", so an unknown answer is not a pass.
 */
export function assertLocalPath(path: string, home: string = process.env.HOME ?? homedir()): string {
	const abs = resolve(path);
	const real = canonicalPath(abs);
	for (const rel of SYNCED_HOME_FOLDERS) {
		const lexicalRoot = join(resolve(home), rel);
		for (const root of [lexicalRoot, canonicalPath(lexicalRoot)]) {
			for (const candidate of [abs, real]) {
				if (candidate === root || candidate.startsWith(root + sep)) {
					const via = candidate === abs ? "" : ` (${abs} resolves to it)`;
					throw new LedgerLocationError(`ledger path ${candidate}${via} is inside ${root}, a synced folder; set ${LEDGER_DB_ENV} to a local path`);
				}
			}
		}
	}
	const where = mountLocality(real);
	if (where !== "local") {
		throw new LedgerLocationError(`ledger path ${real} is not on a local filesystem (${where}); set ${LEDGER_DB_ENV} to a local path`);
	}
	return real;
}
