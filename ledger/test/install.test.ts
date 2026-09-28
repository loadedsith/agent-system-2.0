// The installer's manifest checks (SPEC-2.0.md § B8), run against a scratch copy of ledger/ and
// install/ with a temp HOME: the real HOME and this checkout are never written. Regressions from
// the M2 review: S1 (the ledger-schema row is authoritative-or-refused) and S5 (symbolic links
// under a machinery directory are refused, not skipped). install/fresh-machine-test.sh repeats
// both against a real clone.
import { beforeAll, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..", "..");
const T = "\t";
const DOC_ROW = `ledger/SCHEMA.md${T}doc${T}-`;
const SCHEMA_ROW = `ledger/schema.sql${T}ledger-schema${T}{ledger_db}`;

let root: string;
let copy: string;
let manifest: string;
let original: string;

/** Run the scratch copy's installer the way a fresh machine would: PATH and a temp HOME only. */
function install(label: string): { exitCode: number; out: string; db: string } {
	const home = join(root, `home-${label}`);
	mkdirSync(home, { recursive: true });
	const db = join(home, ".agent-system-2", "ledger.db");
	const r = Bun.spawnSync(["bash", join(copy, "install", "install.sh")], {
		env: { PATH: process.env.PATH ?? "", HOME: home }, stdout: "pipe", stderr: "pipe",
	});
	return { exitCode: r.exitCode ?? -1, out: r.stdout.toString() + r.stderr.toString(), db };
}

/** The original manifest with whole rows replaced. */
function manifestWith(...pairs: [string, string][]): void {
	let text = original;
	for (const [from, to] of pairs) {
		expect(text.split("\n")).toContain(from);
		text = text.split("\n").map((line) => (line === from ? to : line)).join("\n");
	}
	writeFileSync(manifest, text);
}

beforeAll(() => {
	root = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "ledger-install-"));
	copy = join(root, "repo");
	for (const dir of ["ledger", "install"]) cpSync(join(REPO, dir), join(copy, dir), { recursive: true });
	for (const d of ["ledger", "install"]) {
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
		expect(readdirSync(join(r.db, "..", "backups")).filter((n) => /^ledger-.*\.db$/.test(n)).length).toBe(1);
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
