// The daily scratch sweep (PLAN wl-mv5oikd5jtquww § 1.6), driven through its CLI
// (surface/scripts/scratch-sweep.ts) against a fake HOME, a temp ledger under it, and a fake /tmp:
// closed, unknown and idle-unheld (no holder, or a lapsed lease) roots are removed; a held root and a
// root with anything changed in 3 days are kept; a symlinked child and a plain file are refused and
// left alone, and a link inside a removed root is never followed. The report names every root, the
// remaining total and the legacy places, which are sized and never deleted. Over the threshold one
// `scratch-disk:` entry lands on the standing workload, once while open; under it, `scratch-disk-ok:`.
// --dry-run removes and writes nothing; a missing ledger or a bad threshold removes nothing.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SCRATCH_ENTRY, scratchBase } from "../../gates/src/scratch";
import { Ledger } from "../../ledger/src/index";
import { removalRefusal, reportDir } from "../scripts/scratch-sweep";
import { SCRATCH_SWEEP_BY } from "../src/launch";
import { STANDING_WORKLOAD_ID } from "../src/types";
import { sh, tmp } from "./helpers";

const SCRIPT = join(import.meta.dir, "..", "scripts", "scratch-sweep.ts");
const DAY_MS = 24 * 60 * 60 * 1000;
const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

interface World {
	home: string;
	base: string;
	outside: string;
	legacyTmp: string;
	ledgerPath: string;
	ledger: Ledger;
}

function world(): World {
	const home = realpathSync(tmp("sweep-home"));
	const outside = realpathSync(tmp("sweep-outside"));
	const legacyTmp = realpathSync(tmp("sweep-tmp"));
	dirs.push(home, outside, legacyTmp);
	const base = scratchBase(home);
	mkdirSync(base, { recursive: true });
	const ledgerPath = join(home, ".agent-system-2", "ledger.db");
	const ledger = Ledger.open(ledgerPath, { create: true, backup: false, backupOnOpen: false });
	return { home, base, outside, legacyTmp, ledgerPath, ledger };
}

/** A root with one file (and a nested one) under the base. */
function root(w: World, name: string): string {
	const r = join(w.base, name);
	mkdirSync(join(r, "repo", "src"), { recursive: true });
	writeFileSync(join(r, "repo", "src", "a.ts"), "x".repeat(4096));
	writeFileSync(join(r, "notes.md"), "notes");
	return r;
}

/** Every entry under `path` (itself included) set to `days` days old, deepest first (a directory's mtime moves when a child is written). */
function age(path: string, days: number): void {
	const t = new Date(Date.now() - days * DAY_MS);
	const walk = (p: string): void => {
		for (const e of readdirSync(p, { withFileTypes: true })) {
			if (e.isDirectory()) walk(join(p, e.name));
			else utimesSync(join(p, e.name), t, t);
		}
		utimesSync(p, t, t);
	};
	walk(path);
}

function sweep(w: World, args: string[] = [], env: Record<string, string | undefined> = {}) {
	const merged: Record<string, string | undefined> = { ...process.env, AGENT_SYSTEM_SCRATCH_TOTAL_MB: undefined, ...env, AGENT_SYSTEM_LEDGER_DB: w.ledgerPath };
	const clean: Record<string, string> = {};
	for (const [k, v] of Object.entries(merged)) if (v !== undefined) clean[k] = v;
	return sh([process.execPath, SCRIPT, "--home", w.home, "--legacy-tmp", w.legacyTmp, ...args], w.home, clean);
}

const localDate = (t: Date): string =>
	`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;

/** The disk entries the sweep wrote on the standing workload, oldest first. */
function diskEntries(w: World): string[] {
	if (!w.ledger.workload(STANDING_WORKLOAD_ID)) return [];
	return w.ledger.entries(STANDING_WORKLOAD_ID, "assumption")
		.filter((e) => e.created_by === SCRATCH_SWEEP_BY && (e.body.startsWith(SCRATCH_ENTRY.disk) || e.body.startsWith(SCRATCH_ENTRY.diskOk)))
		.map((e) => e.body);
}

const open = (w: World): string => w.ledger.openWorkload({ by: "lane-a", brief: "a lane's work", stakes: "normal", mode: "autonomous" });

describe("scratch sweep: which roots go", () => {
	const w = world();
	const closed = open(w);
	w.ledger.closeWorkload(closed, { by: "orchestrator-surface" });
	const idle = open(w);
	const lapsed = open(w);
	// Claimed through a handle whose clock is in the past: the lease lapsed long before the run.
	const past = Ledger.open(w.ledgerPath, { backup: false, backupOnOpen: false, clock: () => "2026-01-01T00:00:00.000Z" });
	past.claimWorkload(lapsed, { by: "lane-l", holder: "lane-l", leaseMs: 3_600_000 });
	past.close();
	const held = open(w);
	w.ledger.claimWorkload(held, { by: "lane-h", holder: "lane-h", leaseMs: 3_600_000 });
	const fresh = open(w);
	const unknown = "wl-zzznoworkload";

	const closedRoot = root(w, closed);
	// A link inside a removed root, pointing outside the base: removed as a link, never followed.
	writeFileSync(join(w.outside, "secret"), "keep");
	symlinkSync(w.outside, join(closedRoot, "escape"));
	root(w, unknown);
	age(root(w, idle), 4);
	age(root(w, lapsed), 4);
	age(root(w, held), 10);
	const freshRoot = root(w, fresh);
	age(freshRoot, 10);
	writeFileSync(join(freshRoot, "repo", "src", "new.ts"), "changed today"); // one deep change keeps the whole root
	// A symlinked child (named like a root of a closed workload) and a plain file: refused, left alone.
	mkdirSync(join(w.outside, "target"));
	writeFileSync(join(w.outside, "target", "data"), "keep");
	symlinkSync(join(w.outside, "target"), join(w.base, `${closed}x`));
	writeFileSync(join(w.base, "stray.txt"), "stray");
	// Legacy places: sized, never deleted.
	mkdirSync(join(w.legacyTmp, "wl-oldcopy"));
	writeFileSync(join(w.legacyTmp, "wl-oldcopy", "f"), "x".repeat(8192));
	mkdirSync(join(w.legacyTmp, "quorum-legs-7"));
	mkdirSync(join(w.legacyTmp, "unrelated"));
	mkdirSync(join(w.home, ".agent-system-2", "test-runs", "run-1"), { recursive: true });
	writeFileSync(join(w.home, ".agent-system-2", "test-runs", "run-1", "log"), "log");

	test("the lapsed claim's lease ended before the run", () => {
		expect(w.ledger.workload(lapsed)!.holder_lease_until).toBe("2026-01-01T01:00:00.000Z");
	});

	test("closed, unknown, idle-unheld and lapsed roots are removed; held and fresh kept; symlink and file refused", () => {
		const r = sweep(w, [], { AGENT_SYSTEM_SCRATCH_TOTAL_MB: "0" });
		expect({ code: r.code, err: r.err }).toEqual({ code: 0, err: "" });
		const left = readdirSync(w.base).sort();
		expect(left).toEqual([`${closed}x`, fresh, held, "stray.txt"].sort());
		// nothing outside the base was touched, through either link
		expect(readFileSync(join(w.outside, "secret"), "utf8")).toBe("keep");
		expect(readFileSync(join(w.outside, "target", "data"), "utf8")).toBe("keep");
		expect(existsSync(join(freshRoot, "repo", "src", "new.ts"))).toBe(true);
		// legacy places stay
		expect([existsSync(join(w.legacyTmp, "wl-oldcopy", "f")), existsSync(join(w.home, ".agent-system-2", "test-runs", "run-1", "log"))]).toEqual([true, true]);
	});

	test("the report names every root with its size and action, the remaining total and the legacy places", () => {
		const path = join(reportDir(w.home), `${localDate(new Date())}.md`);
		const report = readFileSync(path, "utf8");
		const rows = report.split("\n");
		const row = (name: string): string => rows.find((l) => l.startsWith(`| ${name} |`)) ?? `no row for ${name}`;
		expect(row(closed)).toMatch(/^\| wl-\S+ \| \d+ \| removed \| workload closed at /);
		expect(row(unknown)).toMatch(/\| \d+ \| removed \| no workload has this id \|$/);
		expect(row(idle)).toMatch(/\| \d+ \| removed \| open, no holder, nothing changed since .* \(over 3 days\) \|$/);
		expect(row(lapsed)).toMatch(/\| removed \| open, lease of lane-l lapsed at /);
		expect(row(held)).toMatch(/\| \d+ \| kept \| open, held by lane-h \(lease until /);
		expect(row(fresh)).toMatch(/\| \d+ \| kept \| open, no holder, changed within 3 days /);
		expect(row(`${closed}x`)).toMatch(/\| - \| refused \| a symlink \(→ .*target\); never followed, never removed \|$/);
		expect(row("stray.txt")).toBe("| stray.txt | - | refused | not a directory; left alone |");
		expect(rows.some((l) => /^- total under the base: \d+ KiB \(\d+\.\d MiB\), over 0 MiB$/.test(l))).toBe(true);
		expect(row(join(w.legacyTmp, "wl-oldcopy"))).toMatch(/^\| \S+wl-oldcopy \| \d+ \|$/);
		expect(row(join(w.legacyTmp, "quorum-legs-7"))).toMatch(/\| \d+ \|$/);
		expect(row(join(w.home, ".agent-system-2", "test-runs"))).toMatch(/\| \d+ \|$/);
		expect(report).not.toContain("unrelated");
	});

	test("over the threshold: one scratch-disk: entry on the standing workload, and only one while it is open", () => {
		const first = diskEntries(w);
		expect(first.length).toBe(1);
		expect(first[0]!).toMatch(new RegExp(`^scratch-disk: \\d+\\.\\d MiB under ${w.base} passes 0 MiB \\(AGENT_SYSTEM_SCRATCH_TOTAL_MB\\); report \\S+\\.md$`));
		const again = sweep(w, [], { AGENT_SYSTEM_SCRATCH_TOTAL_MB: "0" });
		expect(again.code).toBe(0);
		expect(again.out).toContain("already open");
		expect(diskEntries(w)).toEqual(first);
	});

	test("under the threshold (the default): scratch-disk-ok: clears it, once", () => {
		const r = sweep(w);
		expect(r.code).toBe(0);
		const after = diskEntries(w);
		expect(after.length).toBe(2);
		expect(after[1]!).toMatch(new RegExp(`^scratch-disk-ok: \\d+\\.\\d MiB under ${w.base}, at or under 10240 MiB; report `));
		expect(sweep(w).code).toBe(0);
		expect(diskEntries(w)).toEqual(after);
		// the kept roots are still kept on every later run
		expect(readdirSync(w.base).sort()).toEqual([`${closed}x`, fresh, held, "stray.txt"].sort());
	});
});

describe("scratch sweep: what it never does", () => {
	test("--dry-run removes nothing and writes no report and no entry", () => {
		const w = world();
		const closed = open(w);
		w.ledger.closeWorkload(closed, { by: "orchestrator-surface" });
		root(w, closed);
		const r = sweep(w, ["--dry-run"], { AGENT_SYSTEM_SCRATCH_TOTAL_MB: "0" });
		expect(r.code).toBe(0);
		expect(existsSync(join(w.base, closed, "notes.md"))).toBe(true);
		expect(r.out).toContain(`| ${closed} |`);
		expect(r.out).toContain("would remove");
		expect(existsSync(reportDir(w.home))).toBe(false);
		expect(w.ledger.workload(STANDING_WORKLOAD_ID)).toBeNull();
	});

	test("an unreadable ledger removes nothing: no root's fate is guessed", () => {
		const w = world();
		w.ledger.close();
		rmSync(w.ledgerPath);
		root(w, "wl-zzzgone");
		const r = sweep(w);
		expect(r.code).toBe(1);
		expect(existsSync(join(w.base, "wl-zzzgone", "notes.md"))).toBe(true);
		expect(r.out).toContain("could not be read");
	});

	test("a bad threshold or an unknown argument is refused with exit 2 before anything runs", () => {
		const w = world();
		root(w, "wl-zzzunknown");
		expect(sweep(w, [], { AGENT_SYSTEM_SCRATCH_TOTAL_MB: "lots" }).code).toBe(2);
		expect(sweep(w, ["--everything"]).code).toBe(2);
		expect(existsSync(join(w.base, "wl-zzzunknown", "notes.md"))).toBe(true);
		expect(existsSync(reportDir(w.home))).toBe(false);
	});

	test("removalRefusal: only a real directory at exactly base/<name> may go", () => {
		const w = world();
		root(w, "wl-real");
		symlinkSync(join(w.base, "wl-real"), join(w.base, "wl-alias"));
		expect(removalRefusal(w.base, "wl-real")).toBeNull();
		expect(removalRefusal(w.base, "wl-alias")).toContain("is a symlink");
		expect(removalRefusal(w.base, "..")).toContain("is not a child name");
		expect(removalRefusal(w.base, "wl-absent")).toContain("cannot be checked");
	});
});
