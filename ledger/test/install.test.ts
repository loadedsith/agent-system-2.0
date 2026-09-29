// The installer's manifest checks (SPEC-2.0.md § B8), run against a scratch copy of every directory
// the manifest names, with a temp HOME: the real HOME and this checkout are never written. Regressions from
// the M2 reviews: S1 (the ledger-schema row is authoritative-or-refused), S5 (symbolic links
// under a machinery directory are refused, not skipped), N1 (an older schema is refused with exit
// 4, nothing written) and S2 (the periodic backup job is written as a launchd plist under the temp
// HOME, never loaded; its exact command runs against an open writer and fails when a due copy
// does). install/fresh-machine-test.sh repeats these against a real clone.
import { beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const T = "\t";
const DOC_ROW = `ledger/SCHEMA.md${T}doc${T}-`;
const SCHEMA_ROW = `ledger/schema.sql${T}ledger-schema${T}{ledger_db}`;

let root: string;
let copy: string;
let manifest: string;
let original: string;

/** Run the scratch copy's installer the way a fresh machine would: PATH, a temp HOME, and `env`. */
function install(label: string, env: Record<string, string> = {}): { exitCode: number; out: string; db: string; home: string } {
	const home = join(root, `home-${label}`);
	mkdirSync(home, { recursive: true });
	const db = env.AGENT_SYSTEM_LEDGER_DB ?? join(home, ".agent-system-2", "ledger.db");
	const r = Bun.spawnSync(["bash", join(copy, "install", "install.sh")], {
		env: { PATH: process.env.PATH ?? "", HOME: home, ...env }, stdout: "pipe", stderr: "pipe",
	});
	return { exitCode: r.exitCode ?? -1, out: r.stdout.toString() + r.stderr.toString(), db, home };
}

/** Every scheduled copy under the ledger's backups/ root, whatever its namespace directory. */
const copiesOf = (db: string) => {
	const root = join(dirname(db), "backups");
	return existsSync(root) ? (readdirSync(root, { recursive: true }) as string[]).filter((n) => /ledger-[^/]*\.db$/.test(n)).map((n) => join(root, n)) : [];
};

/** The original manifest with whole rows replaced. */
function manifestWith(...pairs: [string, string][]): void {
	let text = original;
	for (const [from, to] of pairs) {
		expect(text.split("\n")).toContain(from);
		text = text.split("\n").map((line) => (line === from ? to : line)).join("\n");
	}
	writeFileSync(manifest, text);
}

/** Every top-level directory install/manifest.tsv has rows under (b3e06bb added the M3/M4 ones). */
const MANIFEST_DIRS = ["ledger", "install", "profile", "tiers", "classifier", "gates"];

beforeAll(() => {
	root = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "ledger-install-"));
	copy = join(root, "repo");
	for (const dir of MANIFEST_DIRS) cpSync(join(REPO, dir), join(copy, dir), { recursive: true });
	for (const d of MANIFEST_DIRS) {
		for (const name of readdirSync(join(copy, d), { recursive: true }) as string[]) {
			if (name.endsWith(".DS_Store")) rmSync(join(copy, d, name));
		}
	}
	manifest = join(copy, "install", "manifest.tsv");
	original = readFileSync(manifest, "utf8");
});

describe("install: the baseline copy installs", () => {
	test("exit 0; ledger created; the first scheduled copy is taken by install (S2 ownership)", () => {
		const r = install("baseline");
		expect(r.out).toContain("install complete");
		expect(r.exitCode).toBe(0);
		expect(existsSync(r.db)).toBe(true);
		expect(copiesOf(r.db).length).toBe(1);
	});
});

describe("install: a ledger at an older schema version is refused with exit 4, nothing written (N1)", () => {
	// The first schema (94f06b9, version 1) and the last before the hand's identity columns (1fe1b6e, version 4).
	for (const [rev, version] of [["94f06b9", 1], ["1fe1b6e", 4]] as const) {
		test(`review probe: a version-${version} ledger built from ${rev}:ledger/schema.sql`, () => {
			const db = join(root, `old-schema-${rev}`, "ledger.db");
			mkdirSync(dirname(db), { recursive: true });
			const schema = Bun.spawnSync(["git", "-C", REPO, "show", `${rev}:ledger/schema.sql`], { stdout: "pipe" });
			const sqlite3 = existsSync("/usr/bin/sqlite3") ? "/usr/bin/sqlite3" : "sqlite3";
			expect(Bun.spawnSync([sqlite3, db], { stdin: schema.stdout }).exitCode).toBe(0);
			const r = install(`old-schema-${rev}`, { AGENT_SYSTEM_LEDGER_DB: db });
			expect(r.out).toContain(`is schema version ${version}, which predates the supported schema (version 5)`);
			expect(r.out).not.toContain("install complete");
			expect(r.exitCode).toBe(4);
			expect(Bun.spawnSync([sqlite3, db, "PRAGMA user_version;"]).stdout.toString().trim()).toBe(String(version));
			expect(copiesOf(db)).toEqual([]);
			expect(existsSync(join(r.home, "Library", "LaunchAgents"))).toBe(false);
		});
	}
});

describe.if(process.platform === "darwin")("install: the periodic backup job is a launchd plist, written and never loaded (S2)", () => {
	test("the plist lints; its exact command takes a due copy while a writer holds the ledger open, and exits 1 when the copy fails", async () => {
		const r = install("launchd");
		expect(r.exitCode).toBe(0);
		expect(r.out).toContain("backup job written, not loaded");
		const plist = join(r.home, "Library", "LaunchAgents", "com.agent-system-2.ledger-backup.plist");
		const lint = Bun.spawnSync(["/usr/bin/plutil", "-lint", plist], { stdout: "pipe" });
		expect(lint.exitCode).toBe(0);
		const job = JSON.parse(Bun.spawnSync(["/usr/bin/plutil", "-convert", "json", "-o", "-", plist], { stdout: "pipe" }).stdout.toString()) as {
			Label: string; ProgramArguments: string[]; EnvironmentVariables: Record<string, string>; WorkingDirectory: string;
			StartInterval: number; RunAtLoad: boolean;
		};
		expect(structuredClone(job)).toMatchObject({ // a copy: bun's toMatchObject wrote its matchers into the received object
			Label: "com.agent-system-2.ledger-backup", StartInterval: 3600, RunAtLoad: true, WorkingDirectory: copy,
			ProgramArguments: [expect.stringMatching(/^\/.*bun$/), "run", join(copy, "ledger", "scripts", "backup.ts")],
			EnvironmentVariables: { AGENT_SYSTEM_LEDGER_DB: r.db, HOME: r.home },
		});
		const runJob = () => {
			const p = Bun.spawnSync(job.ProgramArguments, { env: job.EnvironmentVariables, cwd: job.WorkingDirectory, stdout: "pipe", stderr: "pipe" });
			return { exitCode: p.exitCode, out: p.stdout.toString(), err: p.stderr.toString() };
		};

		// Rename the install's copy to an old time, so the job's copy is due.
		const [installed] = copiesOf(r.db);
		const aged = join(dirname(installed!), "ledger-2026-01-01T00-00-00.000Z.db");
		renameSync(installed!, aged);
		const writer = Bun.spawn(["bun", "-e", `
			import { Ledger } from ${JSON.stringify(join(copy, "ledger", "src", "index.ts"))};
			const l = Ledger.open(${JSON.stringify(r.db)}, { backupOnOpen: false });
			l.openWorkload({ brief: "written by the open writer", stakes: "normal", mode: "autonomous", by: "writer", id: "wl-writer" });
			console.log("ready");
			await Bun.stdin.text(); // hold the connection open until the test closes stdin
			l.close();
		`], { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
		try {
			const reader = writer.stdout.getReader();
			expect(new TextDecoder().decode((await reader.read()).value)).toContain("ready");
			const took = runJob();
			expect([took.exitCode, took.err]).toEqual([0, ""]);
			expect(took.out).toMatch(/^backup ok: took /);
			const fresh = took.out.replace(/^backup ok: took /, "").trim();
			const sqlite3 = existsSync("/usr/bin/sqlite3") ? "/usr/bin/sqlite3" : "sqlite3";
			expect(Bun.spawnSync([sqlite3, fresh, "SELECT brief FROM workloads WHERE id = 'wl-writer';"]).stdout.toString().trim()).toBe("written by the open writer");

			// N3 through the job: the older copy is there, the directory is not writable, the copy is due.
			rmSync(fresh);
			chmodSync(dirname(aged), 0o555);
			try {
				const failed = runJob();
				expect({ exitCode: failed.exitCode, out: failed.out }).toEqual({ exitCode: 1, out: "" });
				expect(failed.err).toContain("ledger backup failed");
			} finally {
				chmodSync(dirname(aged), 0o755);
			}
		} finally {
			writer.stdin.end();
			await writer.exited;
		}
	});

	test("M2 third review, S1: a HOME and a ledger path holding @REPO@, @HOME@ and XML characters are written as given", () => {
		const db = join(root, "db-@REPO@ & @HOME@", "<'@LOG@'> \"&\".db");
		const r = install("@REPO@ & @HOME@", { AGENT_SYSTEM_LEDGER_DB: db });
		expect(r.out).toContain("install complete");
		expect(r.exitCode).toBe(0);
		const plist = join(r.home, "Library", "LaunchAgents", "com.agent-system-2.ledger-backup.plist");
		expect(Bun.spawnSync(["/usr/bin/plutil", "-lint", plist]).exitCode).toBe(0);
		const job = JSON.parse(Bun.spawnSync(["/usr/bin/plutil", "-convert", "json", "-o", "-", plist], { stdout: "pipe" }).stdout.toString()) as {
			ProgramArguments: string[]; EnvironmentVariables: Record<string, string>; WorkingDirectory: string; StandardOutPath: string;
		};
		expect({ ...job.EnvironmentVariables, WorkingDirectory: job.WorkingDirectory, StandardOutPath: job.StandardOutPath }).toEqual({
			AGENT_SYSTEM_LEDGER_DB: db, HOME: r.home, PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
			WorkingDirectory: copy, StandardOutPath: join(dirname(db), "ledger-backup.log"),
		});
		const p = Bun.spawnSync(job.ProgramArguments, { env: job.EnvironmentVariables, cwd: job.WorkingDirectory, stdout: "pipe", stderr: "pipe" });
		expect([p.exitCode, p.stderr.toString()]).toEqual([0, ""]);
		expect(p.stdout.toString()).toStartWith("backup ok: none due; newest ");
		expect(p.stdout.toString()).toContain(`/db-@REPO@ & @HOME@/backups/<'@LOG@'> "&"-`); // this ledger's own namespace
	});
});

describe("install: the manifest's ledger-schema row is strict (S1)", () => {
	const refused = (label: string, why: string) => {
		const r = install(label);
		writeFileSync(manifest, original);
		expect(r.out).toContain(why);
		expect(r.exitCode).toBe(2);
		expect(existsSync(join(r.db, ".."))).toBe(false);
	};

	test("review probe E4: SCHEMA.md filed as the schema and schema.sql as a doc is refused, nothing written", () => {
		manifestWith([DOC_ROW, `ledger/SCHEMA.md${T}ledger-schema${T}{ledger_db}`], [SCHEMA_ROW, `ledger/schema.sql${T}doc${T}-`]);
		refused("swapped", "the ledger module applies ledger/schema.sql and nothing else");
	});

	test("no ledger-schema row at all is refused", () => {
		manifestWith([SCHEMA_ROW, `ledger/schema.sql${T}doc${T}-`]);
		refused("missing", "manifest needs exactly one ledger-schema row; found 0");
	});

	test("two ledger-schema rows are refused", () => {
		manifestWith([DOC_ROW, `ledger/SCHEMA.md${T}ledger-schema${T}{ledger_db}`]);
		refused("duplicate", "manifest needs exactly one ledger-schema row; found 2");
	});

	test("the init script itself refuses a --schema that is not the module's schema, before creating anything", () => {
		const db = join(root, "init-wrong-schema", "ledger.db");
		const r = Bun.spawnSync(["bun", "run", join(copy, "ledger", "scripts", "init.ts"), db, "--schema", join(copy, "ledger", "SCHEMA.md")], { stdout: "pipe", stderr: "pipe" });
		expect(r.stderr.toString()).toContain("is not the schema this module applies");
		expect(r.exitCode).toBe(2);
		expect(existsSync(db)).toBe(false);
	});
});

describe("install: symbolic links under a machinery directory are refused (S5)", () => {
	const refusedWithLink = (label: string, link: string, target: string, row?: string) => {
		symlinkSync(target, join(copy, link));
		if (row) writeFileSync(manifest, `${original}${row}\n`);
		const r = install(label);
		rmSync(join(copy, link));
		writeFileSync(manifest, original);
		expect(r.out).toContain(row ? `${link} is a symbolic link` : `${link} -> ${target}`);
		expect(r.exitCode).toBe(2);
		expect(existsSync(r.db)).toBe(false);
	};

	test("review probe E3: an unmanifested ledger/unmanifested.ts -> src/index.ts", () => {
		refusedWithLink("link-file", "ledger/unmanifested.ts", "src/index.ts");
	});

	test("a dangling link and a link to a directory outside the repo", () => {
		refusedWithLink("link-dangling", "ledger/src/dangling.ts", "../../nowhere.ts");
		refusedWithLink("link-dir", "install/outside", root);
	});

	test("a link that has its own manifest row is still refused", () => {
		refusedWithLink("link-row", "ledger/linked.ts", "src/index.ts", `ledger/linked.ts${T}ledger-module${T}-`);
	});

	test("after every refusal the untouched copy installs again", () => {
		expect(install("after").exitCode).toBe(0);
	});
});
