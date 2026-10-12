#!/usr/bin/env bun
// scratch-audit: the one-time audit of the throwaway copies lanes left before scratch roots existed
// (PLAN wl-mv5oikd5jtquww § 1.7). Four modes:
//
//   bun surface/scripts/scratch-audit.ts report [--out <dir>]          read-only: size and classify, write
//                                                                       <dir>/report.md and <dir>/candidates.json
//   bun surface/scripts/scratch-audit.ts quarantine <candidates.json> [--yes]
//                                                                       move every candidate into
//                                                                       <quarantine>/<stamp>/items/<class>/<name>
//   bun surface/scripts/scratch-audit.ts restore <stamp> [--yes]       move them back (the stamp's restore.json)
//   bun surface/scripts/scratch-audit.ts delete <stamp> [--yes]        remove <quarantine>/<stamp>, then
//                                                                       `git worktree prune` in each repo it moved from
//
// Options (every mode): --home <dir> (default $HOME), --tmp <dir> (default realpath of /tmp), --lanes <dir>
// (default `<repo>-lanes` beside the repo, launch.ts worktreePath), --repo <dir> (default the main checkout
// this script's checkout belongs to). The ledger is the surface's (ledger/src/locality.ts
// defaultLedgerPath with HOME = --home) and the test runs root the runner's (surface/src/test-run.ts
// runsRoot with HOME = --home). The quarantine base is `quarantine/` beside the scratch base
// (gates/src/scratch.ts scratchBase): ~/agent-scratch/agent-system-2.0/quarantine.
//
// What `report` lists, one class each:
// - tmp-wl: every entry of the tmp dir named `wl-*`;
// - tmp-quorum-legs: every entry named `quorum-legs-*`;
// - tmp-other: any other entry whose name carries a workload token, or that matches a pattern lanes used
//   on 2026-10-12 (cc-base*, pp*, mig-review-*, wl-alias-probe*, as2probe*);
// - lane-worktree: every directory under the lanes dir (its name is the workload id);
// - test-run: every `tr-*` run under the runs root, attributed through the ledger's `test-requested:` entries.
// A name's workload tokens are its `wl-<alnum>` words: a token that is a ledger workload id names that
// workload; otherwise a token of at least 4 alnum characters names every workload whose id starts with it
// (`wl-mv45-base` → each wl-mv45…). Actions: `keep` when any named workload is open (or, for a worktree,
// when it is not a closed workload's registered, unlocked worktree of the repo); `candidate` when every
// named workload is closed, and for a tmp entry naming none unless it changed in the last 2 hours (then
// `keep`: a live lane may still use it, e.g. a fifo); `listed` for a test run naming none (sized only).
// Sizes are `du -sk`. Nothing is written but the two report files; the ledger is opened
// `{ readonly: true }` and git runs with `--no-optional-locks` and only reads (worktree list, status).
//
// quarantine/restore/delete are for Jo, from a plain terminal (they write the main repo's .git): each
// prints what it will do and acts only with `--yes`; without it they exit 1 having changed nothing.
// Worktrees move with `git -C <repo> worktree move`, everything else with rename (copy, then remove the
// source, across devices). restore.json is written before the first move and after every move, so a
// stopped run still maps every item; restore and delete read the item's place from the disk, not the flag.
// Exit codes: 0 done, 1 refused (no --yes) or an item failed, 2 bad arguments or nothing to run on.
import { Database } from "bun:sqlite";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, resolve } from "node:path";
import { scratchBase } from "../../gates/src/scratch";
import { defaultLedgerPath } from "../../ledger/src/locality";
import { worktreePath } from "../src/launch";
import { parseTestRequested, RUN_ID_RE, runsRoot } from "../src/test-run";

export const CLASSES = ["tmp-wl", "tmp-quorum-legs", "tmp-other", "lane-worktree", "test-run"] as const;
export type ItemClass = (typeof CLASSES)[number];
export type Action = "candidate" | "keep" | "listed";
/** Name patterns the lanes' throwaway copies used on 2026-10-12, beside the workload-named ones. */
export const TONIGHT_PATTERNS: readonly RegExp[] = [/^cc-base/, /^pp/, /^mig-review-/, /^wl-alias-probe/, /^as2probe/];
const PREFIX_MIN = 4;
/** An unattributed tmp entry changed this recently is kept: nothing says which lane, if any, still uses it. */
export const RECENT_MS = 2 * 3_600_000;

export interface Item {
	class: ItemClass;
	path: string;
	kind: "worktree" | "path";
	bytes: number | null;
	mtime: string;
	workloads: string[];
	action: Action;
	reason: string;
	/** Worktrees only: porcelain status lines (uncommitted or untracked), null when status failed. */
	dirty?: number | null;
	branch?: string | null;
}

export interface Report {
	version: 1;
	generatedAt: string;
	home: string;
	tmp: string;
	lanes: string;
	repo: string;
	ledger: string;
	runs: string;
	items: Item[];
	candidates: Item[];
	totals: Record<Action, { count: number; bytes: number }>;
}

interface Roots {
	home: string;
	tmp: string;
	lanes: string;
	repo: string;
	ledger: string;
	runs: string;
}

class Exit extends Error {
	constructor(readonly code: number, message: string) {
		super(message);
	}
}

// ---- arguments ----------------------------------------------------------------------------------

export interface Args {
	mode: "report" | "quarantine" | "restore" | "delete";
	operand: string | null;
	out: string | null;
	yes: boolean;
	roots: Roots;
}

const real = (p: string): string => {
	try {
		return realpathSync.native(p);
	} catch {
		return resolve(p);
	}
};

function mainCheckoutOf(dir: string): string {
	const p = spawnSync("git", ["--no-optional-locks", "-C", dir, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
	if (p.status !== 0) throw new Exit(2, `cannot find the main checkout from ${dir}: ${p.stderr.trim()} (pass --repo)`);
	return dirname(p.stdout.trim());
}

export function parseArgs(argv: readonly string[], env: Record<string, string | undefined> = process.env): Args {
	const [mode, ...rest] = argv;
	if (mode !== "report" && mode !== "quarantine" && mode !== "restore" && mode !== "delete") {
		throw new Exit(2, "usage: scratch-audit.ts report|quarantine <candidates.json>|restore <stamp>|delete <stamp> [--yes] [--out <dir>] [--home <dir>] [--tmp <dir>] [--lanes <dir>] [--repo <dir>]");
	}
	const opt: Record<string, string> = {};
	let yes = false;
	let operand: string | null = null;
	for (let i = 0; i < rest.length; i++) {
		const a = rest[i]!;
		if (a === "--yes") yes = true;
		else if (a === "--out" || a === "--home" || a === "--tmp" || a === "--lanes" || a === "--repo") {
			const v = rest[++i];
			if (v === undefined || v === "") throw new Exit(2, `${a} takes a directory`);
			opt[a.slice(2)] = resolve(v);
		} else if (a.startsWith("--")) throw new Exit(2, `unknown option ${a}`);
		else if (operand === null) operand = a;
		else throw new Exit(2, `unexpected argument ${a}`);
	}
	if (mode === "report" && operand !== null) throw new Exit(2, "report takes no operand");
	if (mode !== "report" && operand === null) throw new Exit(2, `${mode} needs ${mode === "quarantine" ? "<candidates.json>" : "<stamp>"}`);
	if (mode === "report" && yes) throw new Exit(2, "report is read-only; --yes is for quarantine, restore and delete");
	const home = real(opt.home ?? env.HOME ?? homedir());
	const repo = real(opt.repo ?? mainCheckoutOf(import.meta.dir));
	const lanes = real(opt.lanes ?? dirname(worktreePath(repo, "x")));
	const tmp = real(opt.tmp ?? "/tmp");
	const homeEnv = { ...env, HOME: home };
	const ledger = defaultLedgerPath(homeEnv);
	return { mode, operand, out: opt.out ?? null, yes, roots: { home, tmp, lanes, repo, ledger, runs: real(runsRoot(homeEnv)) } };
}

export const quarantineBase = (home: string): string => join(dirname(scratchBase(home)), "quarantine");

// ---- reading ------------------------------------------------------------------------------------

interface WorkloadState {
	status: "open" | "closed";
}

interface LedgerView {
	workloads: Map<string, WorkloadState>;
	/** run id → workload ids that requested it. */
	runs: Map<string, Set<string>>;
}

function readLedger(path: string): LedgerView {
	if (!existsSync(path)) throw new Exit(2, `no ledger at ${path}`);
	const db = new Database(path, { readonly: true });
	try {
		const workloads = new Map<string, WorkloadState>();
		for (const r of db.query<{ id: string; status: "open" | "closed" }, []>("SELECT id, status FROM workloads").all()) workloads.set(r.id, { status: r.status });
		const runs = new Map<string, Set<string>>();
		const rows = db.query<{ workload_id: string; body: string }, []>("SELECT workload_id, body FROM entries WHERE body LIKE 'test-requested: tr-%'").all();
		for (const r of rows) {
			const req = parseTestRequested(r.body);
			if (!req) continue;
			const set = runs.get(req.runId) ?? new Set<string>();
			set.add(r.workload_id);
			runs.set(req.runId, set);
		}
		return { workloads, runs };
	} finally {
		db.close();
	}
}

/** The workloads a name's `wl-<alnum>` tokens name: exact ids, else ids starting with a token of ≥ 4 alnum characters. */
export function workloadsNamedBy(name: string, ids: Iterable<string>): string[] {
	const all = new Set(ids);
	const found = new Set<string>();
	for (const m of name.matchAll(/wl-[a-z0-9]+/g)) {
		const tok = m[0];
		if (all.has(tok)) found.add(tok);
		else if (tok.length - 3 >= PREFIX_MIN) for (const id of all) if (id.startsWith(tok)) found.add(id);
	}
	return [...found].sort();
}

function decide(ids: readonly string[], view: LedgerView, unattributed: { action: Action; reason: string }): { action: Action; reason: string } {
	if (ids.length === 0) return unattributed;
	const open = ids.filter(id => view.workloads.get(id)?.status === "open");
	if (open.length > 0) return { action: "keep", reason: `open workload ${open.join(", ")}` };
	return { action: "candidate", reason: ids.length === 1 ? `workload ${ids[0]} closed` : `workloads ${ids.join(", ")} all closed` };
}

/** `du -sk` in bytes, or null when du failed (unreadable entries are reported, never guessed). */
function sizeOf(path: string): number | null {
	const p = spawnSync("du", ["-sk", path], { encoding: "utf8" });
	const kb = Number.parseInt(p.stdout.trim().split(/\s/)[0] ?? "", 10);
	return p.status === 0 && Number.isFinite(kb) ? kb * 1024 : null;
}

const entries = (dir: string): string[] => {
	try {
		return readdirSync(dir).sort();
	} catch {
		return [];
	}
};

interface WorktreeInfo {
	locked: boolean;
	branch: string | null;
}

function git(repo: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
	const p = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
	return { status: p.status, stdout: p.stdout ?? "", stderr: p.stderr ?? "" };
}

function registeredWorktrees(repo: string): Map<string, WorktreeInfo> {
	const p = git(repo, ["--no-optional-locks", "worktree", "list", "--porcelain"]);
	if (p.status !== 0) throw new Exit(2, `git worktree list in ${repo} failed: ${p.stderr.trim()}`);
	const out = new Map<string, WorktreeInfo>();
	let cur: string | null = null;
	for (const line of p.stdout.split("\n")) {
		if (line.startsWith("worktree ")) {
			cur = real(line.slice("worktree ".length));
			out.set(cur, { locked: false, branch: null });
		} else if (cur && line.startsWith("branch ")) out.get(cur)!.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
		else if (cur && (line === "locked" || line.startsWith("locked "))) out.get(cur)!.locked = true;
	}
	return out;
}

function dirtyCount(dir: string): number | null {
	const p = git(dir, ["--no-optional-locks", "status", "--porcelain"]);
	if (p.status !== 0) return null;
	return p.stdout.split("\n").filter(l => l.trim() !== "").length;
}

export function buildReport(roots: Roots, now = new Date()): Report {
	const view = readLedger(roots.ledger);
	const ids = [...view.workloads.keys()];
	const items: Item[] = [];
	const add = (cls: ItemClass, path: string, kind: Item["kind"], workloads: string[], d: { action: Action; reason: string }, extra: Partial<Item> = {}): void => {
		items.push({ class: cls, path, kind, bytes: sizeOf(path), mtime: lstatSync(path).mtime.toISOString(), workloads, action: d.action, reason: d.reason, ...extra });
	};

	for (const name of entries(roots.tmp)) {
		const cls: ItemClass | null = name.startsWith("wl-") ? "tmp-wl" : name.startsWith("quorum-legs-") ? "tmp-quorum-legs" : null;
		const named = workloadsNamedBy(name, ids);
		const pattern = TONIGHT_PATTERNS.some(re => re.test(name));
		const c = cls ?? (named.length > 0 || pattern ? "tmp-other" : null);
		if (!c) continue;
		const path = join(roots.tmp, name);
		const recent = now.getTime() - lstatSync(path).mtimeMs < RECENT_MS;
		const why = pattern ? "tonight's pattern, no workload named" : "no workload named";
		add(c, path, "path", named, decide(named, view, recent ? { action: "keep", reason: `${why}, changed within 2 h` } : { action: "candidate", reason: why }));
	}

	const registered = existsSync(roots.lanes) ? registeredWorktrees(roots.repo) : new Map<string, WorktreeInfo>();
	for (const name of entries(roots.lanes)) {
		const path = join(roots.lanes, name);
		const st = lstatSync(path);
		if (!st.isDirectory()) continue;
		const wt = registered.get(path);
		const known = view.workloads.get(name);
		const named = known ? [name] : [];
		let d: { action: Action; reason: string };
		if (!known) d = { action: "keep", reason: "no workload with this id in the ledger" };
		else if (!wt) d = { action: "keep", reason: `not a registered worktree of ${roots.repo}` };
		else if (wt.locked && known.status === "closed") d = { action: "keep", reason: "worktree is locked" };
		else d = decide(named, view, { action: "keep", reason: "" });
		add("lane-worktree", path, "worktree", named, d, { dirty: wt ? dirtyCount(path) : null, branch: wt?.branch ?? null });
	}

	for (const name of entries(roots.runs)) {
		if (!RUN_ID_RE.test(name)) continue;
		const path = join(roots.runs, name);
		if (!lstatSync(path).isDirectory()) continue;
		const named = [...(view.runs.get(name) ?? [])].sort();
		add("test-run", path, "path", named, decide(named, view, { action: "listed", reason: "no test-requested entry names this run" }));
	}

	const totals: Report["totals"] = { candidate: { count: 0, bytes: 0 }, keep: { count: 0, bytes: 0 }, listed: { count: 0, bytes: 0 } };
	for (const it of items) {
		totals[it.action].count++;
		totals[it.action].bytes += it.bytes ?? 0;
	}
	return { version: 1, generatedAt: now.toISOString(), ...roots, items, candidates: items.filter(i => i.action === "candidate"), totals };
}

// ---- rendering ----------------------------------------------------------------------------------

const mib = (b: number | null): string => (b === null ? "?" : (b / 1048576).toFixed(1));
const cell = (s: string): string => s.replace(/\|/g, "\\|");

export function renderMarkdown(r: Report): string {
	const out: string[] = [];
	out.push(`# Scratch audit — ${r.generatedAt}`, "");
	out.push("Read-only report of `surface/scripts/scratch-audit.ts report` (PLAN wl-mv5oikd5jtquww § 1.7). Sizes are `du -sk`, in MiB.", "");
	out.push(`- tmp: \`${r.tmp}\``, `- lanes: \`${r.lanes}\``, `- repo: \`${r.repo}\``, `- ledger: \`${r.ledger}\` (read-only)`, `- test runs: \`${r.runs}\``, "");
	out.push("## Totals", "");
	out.push("| class | candidate | MiB | keep | MiB | listed | MiB |", "|---|---|---|---|---|---|---|");
	const sum = (cls: ItemClass | null, a: Action): { n: number; b: number } => {
		const xs = r.items.filter(i => (cls === null || i.class === cls) && i.action === a);
		return { n: xs.length, b: xs.reduce((s, i) => s + (i.bytes ?? 0), 0) };
	};
	for (const cls of [...CLASSES, null]) {
		const [c, k, l] = (["candidate", "keep", "listed"] as const).map(a => sum(cls, a));
		out.push(`| ${cls ?? "**total**"} | ${c!.n} | ${mib(c!.b)} | ${k!.n} | ${mib(k!.b)} | ${l!.n} | ${mib(l!.b)} |`);
	}
	const all = r.items.reduce((s, i) => s + (i.bytes ?? 0), 0);
	const unsized = r.items.filter(i => i.bytes === null).length;
	out.push("", `Total: ${r.items.length} items, ${mib(all)} MiB; candidates ${r.totals.candidate.count} (${mib(r.totals.candidate.bytes)} MiB), keep ${r.totals.keep.count} (${mib(r.totals.keep.bytes)} MiB), listed ${r.totals.listed.count} (${mib(r.totals.listed.bytes)} MiB)${unsized ? `; ${unsized} could not be sized (?)` : ""}.`, "");
	out.push("Next step (Jo, plain terminal): `bun surface/scripts/scratch-audit.ts quarantine <this dir>/candidates.json` previews the moves; add `--yes` to move, check, then `delete <stamp> --yes` (or `restore <stamp> --yes`).", "");
	for (const cls of CLASSES) {
		const xs = r.items.filter(i => i.class === cls).sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0) || a.path.localeCompare(b.path));
		out.push(`## ${cls} (${xs.length})`, "");
		if (xs.length === 0) {
			out.push("None.", "");
			continue;
		}
		const wt = cls === "lane-worktree";
		out.push(`| action | MiB | path | modified | workloads | reason |${wt ? " branch | dirty |" : ""}`, `|---|---|---|---|---|---|${wt ? "---|---|" : ""}`);
		for (const i of xs) {
			const tail = wt ? ` ${cell(i.branch ?? "")} | ${i.dirty === null || i.dirty === undefined ? "?" : i.dirty} |` : "";
			out.push(`| ${i.action} | ${mib(i.bytes)} | \`${cell(i.path)}\` | ${i.mtime.slice(0, 16)} | ${cell(i.workloads.join(", "))} | ${cell(i.reason)} |${tail}`);
		}
		out.push("");
	}
	return out.join("\n");
}

// ---- moving -------------------------------------------------------------------------------------

export interface Move {
	class: ItemClass;
	kind: Item["kind"];
	from: string;
	to: string;
	bytes: number | null;
	workloads: string[];
	moved: boolean;
}

export interface RestoreMap {
	version: 1;
	stamp: string;
	createdAt: string;
	report: string;
	repo: string;
	moves: Move[];
}

const exists = (p: string): boolean => {
	try {
		lstatSync(p);
		return true;
	} catch {
		return false;
	}
};

function movePath(from: string, to: string): void {
	mkdirSync(dirname(to), { recursive: true });
	try {
		renameSync(from, to);
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== "EXDEV") throw e;
		cpSync(from, to, { recursive: true, verbatimSymlinks: true, preserveTimestamps: true, errorOnExist: true, force: false });
		rmSync(from, { recursive: true, force: false });
	}
}

function moveItem(m: { kind: Item["kind"]; from: string; to: string }, repo: string): void {
	if (m.kind === "worktree") {
		mkdirSync(dirname(m.to), { recursive: true });
		const p = git(repo, ["worktree", "move", m.from, m.to]);
		if (p.status !== 0) throw new Error(`git worktree move: ${p.stderr.trim() || `exit ${p.status}`}`);
	} else movePath(m.from, m.to);
}

const STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const stampOf = (d: Date): string => d.toISOString().replace(/[:.]/g, "-");

function readJson<T>(path: string, what: string): T {
	try {
		return JSON.parse(readFileSync(path, "utf8")) as T;
	} catch (e) {
		throw new Exit(2, `cannot read ${what} ${path}: ${e instanceof Error ? e.message : String(e)}`);
	}
}

/** A candidate the quarantine accepts: absolute, normalized, an entry directly in one of the report's roots. */
function candidateProblem(c: Item, r: Report): string | null {
	if (!isAbsolute(c.path) || normalize(c.path) !== c.path) return "not an absolute normalized path";
	const parent = dirname(c.path);
	const want = c.class === "lane-worktree" ? r.lanes : c.class === "test-run" ? r.runs : r.tmp;
	if (parent !== want) return `not an entry of ${want}`;
	if ((c.kind === "worktree") !== (c.class === "lane-worktree")) return "kind does not match its class";
	if (!exists(c.path)) return "no longer exists";
	if (c.kind === "worktree" && !lstatSync(c.path).isDirectory()) return "not a directory";
	return null;
}

const say = (s: string): void => console.log(s);

function quarantine(args: Args, reportPath: string): number {
	const r = readJson<Report>(reportPath, "report");
	if (r.version !== 1 || !Array.isArray(r.candidates)) throw new Exit(2, `${reportPath} is not a scratch-audit candidates.json`);
	const qbase = quarantineBase(args.roots.home);
	const stamp = stampOf(new Date());
	const dir = join(qbase, stamp);
	const moves: Move[] = [];
	const skipped: string[] = [];
	for (const c of r.candidates) {
		const why = candidateProblem(c, r);
		if (why) skipped.push(`${c.path}: ${why}`);
		else moves.push({ class: c.class, kind: c.kind, from: c.path, to: join(dir, "items", c.class, basename(c.path)), bytes: c.bytes, workloads: c.workloads, moved: false });
	}
	const total = moves.reduce((s, m) => s + (m.bytes ?? 0), 0);
	say(`quarantine ${stamp}: ${moves.length} item(s), ${mib(total)} MiB, from ${reportPath} into ${dir}`);
	for (const m of moves) say(`  ${m.kind === "worktree" ? `git -C ${r.repo} worktree move` : "mv"} ${m.from} → ${m.to} (${mib(m.bytes)} MiB)`);
	for (const s of skipped) say(`  skip ${s}`);
	if (!args.yes) {
		say("nothing done: re-run with --yes to move these");
		return 1;
	}
	if (moves.length === 0) return skipped.length > 0 ? 1 : 0;
	mkdirSync(qbase, { recursive: true });
	mkdirSync(dir); // a second run in the same millisecond refuses here rather than sharing a map
	const map: RestoreMap = { version: 1, stamp, createdAt: new Date().toISOString(), report: reportPath, repo: r.repo, moves };
	const save = (): void => writeFileSync(join(dir, "restore.json"), `${JSON.stringify(map, null, 2)}\n`);
	save();
	let failed = 0;
	for (const m of moves) {
		try {
			moveItem(m, r.repo);
			m.moved = true;
			save();
		} catch (e) {
			failed++;
			say(`  FAILED ${m.from}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	say(`moved ${moves.length - failed} of ${moves.length}; restore map ${join(dir, "restore.json")}`);
	say(`check, then: bun ${import.meta.path} delete ${stamp} --yes   (or restore ${stamp} --yes)`);
	return failed > 0 || skipped.length > 0 ? 1 : 0;
}

function stampDir(args: Args, stamp: string): { dir: string; map: RestoreMap } {
	if (!STAMP_RE.test(stamp)) throw new Exit(2, `${stamp} is not a quarantine stamp`);
	const dir = join(quarantineBase(args.roots.home), stamp);
	if (!exists(dir) || lstatSync(dir).isSymbolicLink() || !statSync(dir).isDirectory()) throw new Exit(2, `no quarantine ${dir}`);
	const map = readJson<RestoreMap>(join(dir, "restore.json"), "restore map");
	if (map.version !== 1 || map.stamp !== stamp || !Array.isArray(map.moves)) throw new Exit(2, `${join(dir, "restore.json")} is not this stamp's restore map`);
	for (const m of map.moves) if (!m.to.startsWith(`${dir}/items/`) || normalize(m.to) !== m.to) throw new Exit(2, `restore map entry ${m.to} is outside ${dir}/items`);
	return { dir, map };
}

function restore(args: Args, stamp: string): number {
	const { map } = stampDir(args, stamp);
	const todo: Move[] = [];
	const notes: string[] = [];
	for (const m of map.moves) {
		const atTo = exists(m.to);
		const atFrom = exists(m.from);
		if (atTo && !atFrom) todo.push(m);
		else if (atFrom && !atTo) notes.push(`already in place ${m.from}`);
		else if (atTo && atFrom) notes.push(`CONFLICT ${m.from} exists again; ${m.to} left in quarantine`);
		else notes.push(`MISSING ${m.from}: in neither place`);
	}
	say(`restore ${stamp}: ${todo.length} item(s)`);
	for (const m of todo) say(`  ${m.kind === "worktree" ? `git -C ${map.repo} worktree move` : "mv"} ${m.to} → ${m.from}`);
	for (const n of notes) say(`  ${n}`);
	if (!args.yes) {
		say("nothing done: re-run with --yes to move these back");
		return 1;
	}
	let failed = 0;
	for (const m of todo) {
		try {
			moveItem({ kind: m.kind, from: m.to, to: m.from }, map.repo);
		} catch (e) {
			failed++;
			say(`  FAILED ${m.from}: ${e instanceof Error ? e.message : String(e)}`);
		}
	}
	say(`restored ${todo.length - failed} of ${todo.length}`);
	return failed > 0 || notes.some(n => !n.startsWith("already")) ? 1 : 0;
}

function del(args: Args, stamp: string): number {
	const { dir, map } = stampDir(args, stamp);
	const held = map.moves.filter(m => exists(m.to));
	const bytes = sizeOf(dir);
	const repos = map.moves.some(m => m.kind === "worktree") ? [map.repo] : [];
	say(`delete ${stamp}: rm -rf ${dir} (${held.length} quarantined item(s), ${mib(bytes)} MiB)`);
	for (const m of held) say(`  ${m.to}   (was ${m.from})`);
	for (const repo of repos) say(`  then git -C ${repo} worktree prune`);
	if (!args.yes) {
		say("nothing done: re-run with --yes to delete");
		return 1;
	}
	rmSync(dir, { recursive: true, force: false });
	let failed = 0;
	for (const repo of repos) {
		const p = git(repo, ["worktree", "prune"]);
		if (p.status !== 0) {
			failed++;
			say(`  FAILED git worktree prune in ${repo}: ${p.stderr.trim()}`);
		}
	}
	say(`deleted ${dir}`);
	return failed > 0 ? 1 : 0;
}

export function main(argv: readonly string[]): number {
	const args = parseArgs(argv);
	if (args.mode === "quarantine") return quarantine(args, resolve(args.operand!));
	if (args.mode === "restore") return restore(args, args.operand!);
	if (args.mode === "delete") return del(args, args.operand!);
	const report = buildReport(args.roots);
	const out = args.out ?? join(dirname(scratchBase(args.roots.home)), "scratch-audit", stampOf(new Date(report.generatedAt)));
	mkdirSync(out, { recursive: true });
	writeFileSync(join(out, "report.md"), `${renderMarkdown(report)}\n`);
	writeFileSync(join(out, "candidates.json"), `${JSON.stringify(report, null, 2)}\n`);
	const t = report.totals;
	say(`${report.items.length} items: candidate ${t.candidate.count} (${mib(t.candidate.bytes)} MiB), keep ${t.keep.count} (${mib(t.keep.bytes)} MiB), listed ${t.listed.count} (${mib(t.listed.bytes)} MiB)`);
	say(`wrote ${join(out, "report.md")} and ${join(out, "candidates.json")}`);
	return 0;
}

if (import.meta.main) {
	try {
		process.exit(main(process.argv.slice(2)));
	} catch (err) {
		console.error(err instanceof Error ? err.message : String(err));
		process.exit(err instanceof Exit ? err.code : 2);
	}
}
