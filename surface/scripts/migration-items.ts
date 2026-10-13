#!/usr/bin/env bun
// migration-items: numbers migration item files after merge (workload wl-mv5mvvs64ahq0w; the rules
// are surface/src/migration-items.ts). Run by .github/workflows/migration-number.yml on every push
// to main; by hand from a clean checkout of main if Actions is off.
//
//   bun surface/scripts/migration-items.ts check [--merged] [--base <ref>] [--repo <dir>]
//   bun surface/scripts/migration-items.ts number [--base <ref>] [--repo <dir>]
//   bun surface/scripts/migration-items.ts publish [--repo <dir>]
//
// --repo defaults to the git toplevel of the current directory. The base is --base, else
// origin/main, else main, else the tag as2-trusted-main (the full-suite runner writes it at
// origin/main's sha, since its clone keeps no main ref); HEAD is never the base. `published` is the
// pairs carried by numbering commits (author as2-numbering, subject `migration: number <N> <slug>[, …]`)
// on the base's first-parent chain, so a numbering commit made on a PR branch counts for nothing.
// With no base, `number`, `publish` and `check --merged` exit 1 naming the refs they tried. Plain
// `check` with no base passes only a tree that holds no numbered item file and no index row: no rule
// about the tree's own unnumbered files reads `published`, so the tree is judged in full, but the
// checks of main's history itself (a slug or number published twice) are skipped. Any
// numbered file or index row with no base exits 1 naming the refs, since the full-suite runner must
// tag as2-trusted-main for the check to read main's record.
//
// check    the tree's items, index and legacy list against the rules; --merged also lists item
//          files on the base with no number. Exit 0 pass, 1 fail.
// number   on the current checkout: give every unnumbered item file its number (a slug main
//          published keeps it; new ones get max(ceiling, published, legacy)+1 onward, in the order
//          their adding commits sit on the base's first-parent history), regenerate the index, and
//          commit as as2-numbering. Nothing to do: no commit, exit 0. A failing check: exit 1,
//          nothing written.
// publish  up to 5 attempts of: fetch origin main, detach at origin/main, number, refuse a commit
//          that touches more than numbers, push HEAD:main (never forced). Exit 1 after 5 refusals.
//
// Exit 2 on a bad argument or a git failure.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	checkTree,
	ITEMS_DIR,
	type ItemFile,
	LEGACY_CEILING,
	MIGRATION_FILE,
	NUMBERING_EMAIL,
	NUMBERING_NAME,
	numberingChangeScope,
	type Pair,
	parseIndex,
	parseItem,
	planNumbering,
	publishedFrom,
	slugOfName,
} from "../src/migration-items";

const ATTEMPTS = 5;
const ORIGIN_MAIN = "refs/remotes/origin/main";
/** origin/main's sha as the full-suite runner tags it (surface/scripts/test-runner.ts trusted()). */
const TRUSTED_MAIN = "refs/tags/as2-trusted-main";
/** The refs tried for the base when --base is not given, in order. */
const BASE_REFS = [ORIGIN_MAIN, "refs/heads/main", TRUSTED_MAIN] as const;
const NO_BASE = `no base: none of ${BASE_REFS.join(", ")} resolves; pass --base <ref>`;
const BOT_ENV = {
	GIT_AUTHOR_NAME: NUMBERING_NAME,
	GIT_AUTHOR_EMAIL: NUMBERING_EMAIL,
	GIT_COMMITTER_NAME: NUMBERING_NAME,
	GIT_COMMITTER_EMAIL: NUMBERING_EMAIL,
};

class Exit extends Error {
	constructor(
		message: string,
		readonly code: number,
	) {
		super(message);
	}
}

interface GitResult {
	code: number;
	out: string;
	err: string;
}

function git(repo: string, args: string[], env?: Record<string, string>): GitResult {
	const r = Bun.spawnSync(["git", ...args], {
		cwd: repo,
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...env },
	});
	return { code: r.exitCode ?? 1, out: r.stdout.toString(), err: r.stderr.toString() };
}

/** git that must succeed: its stdout, else exit 2 naming the command. */
function gitOk(repo: string, args: string[], env?: Record<string, string>): string {
	const r = git(repo, args, env);
	if (r.code !== 0) throw new Exit(`git ${args.join(" ")} failed (exit ${r.code}): ${r.err.trim().split("\n").at(-1) ?? ""}`, 2);
	return r.out;
}

function resolves(repo: string, ref: string): boolean {
	return git(repo, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]).code === 0;
}

/** --base, else origin/main, else main, else the as2-trusted-main tag; null when none resolves. */
function baseOf(repo: string, explicit: string | undefined): string | null {
	if (explicit !== undefined) {
		if (!resolves(repo, explicit)) throw new Exit(`--base ${explicit} does not resolve to a commit`, 2);
		return explicit;
	}
	return BASE_REFS.find((ref) => resolves(repo, ref)) ?? null;
}

/** Numbering pairs from `git log <args>` read oldest first. */
function readPublished(repo: string, logArgs: string[]): Pair[] {
	const out = gitOk(repo, ["log", "--reverse", "--format=%ae%x00%s", ...logArgs]);
	const commits = out
		.split("\n")
		.filter((l) => l !== "")
		.map((l) => {
			const [authorEmail = "", subject = ""] = l.split("\0");
			return { authorEmail, subject };
		});
	return publishedFrom(commits);
}

/** Each item slug's position on the base's first-parent history: the last first-parent commit that added it. */
function readAddOrder(repo: string, base: string): Map<string, number> {
	const out = gitOk(repo, [
		"log",
		"--first-parent",
		"--diff-merges=first-parent",
		"--diff-filter=A",
		"--reverse",
		"--no-renames",
		"--name-only",
		"--format=%x01",
		base,
		"--",
		`${ITEMS_DIR}/`,
	]);
	const order = new Map<string, number>();
	out.split("\x01").forEach((chunk, i) => {
		for (const path of chunk.split("\n")) {
			if (!path.startsWith(`${ITEMS_DIR}/`)) continue;
			const slug = slugOfName(path.slice(ITEMS_DIR.length + 1));
			if (slug) order.set(slug, i);
		}
	});
	return order;
}

function readTree(repo: string): { items: ItemFile[]; migration: string } {
	const mPath = join(repo, MIGRATION_FILE);
	if (!existsSync(mPath)) throw new Exit(`${MIGRATION_FILE} not found in ${repo}`, 1);
	const dir = join(repo, ITEMS_DIR);
	const items: ItemFile[] = [];
	if (existsSync(dir)) {
		for (const name of readdirSync(dir).sort()) {
			const p = join(dir, name);
			// A subdirectory or other non-file reads as empty text, so the header check names it.
			items.push({ name, text: statSync(p).isFile() ? readFileSync(p, "utf8") : "" });
		}
	}
	return { items, migration: readFileSync(mPath, "utf8") };
}

function fail(errors: string[], verb: string): never {
	for (const e of errors) console.error(`${verb}: ${e}`);
	throw new Exit(`${verb}: ${errors.length} problem${errors.length === 1 ? "" : "s"}`, 1);
}

function check(repo: string, explicitBase: string | undefined, merged: boolean): void {
	const base = baseOf(repo, explicitBase);
	if (!base && merged) throw new Exit(`check --merged: ${NO_BASE}`, 1);
	const tree = readTree(repo);
	let published: Pair[] = [];
	if (base) published = readPublished(repo, ["--first-parent", base]);
	else {
		// Fail closed: a numbered file or an index row can only be judged against main's published record.
		const numbered = tree.items.filter((f) => parseItem(f.text).header?.number != null).length;
		const rows = parseIndex(tree.migration).rows.length;
		if (numbered > 0 || rows > 0) {
			throw new Exit(
				`check: ${NO_BASE}; the tree holds ${numbered} numbered item file${numbered === 1 ? "" : "s"} and ${rows} index row${rows === 1 ? "" : "s"}, which need main's published record: the full-suite runner must tag as2-trusted-main at origin/main's sha`,
				1,
			);
		}
	}
	const errors = checkTree({ ...tree, published });
	if (merged && base) {
		const listed = gitOk(repo, ["ls-tree", "--name-only", base, "--", `${ITEMS_DIR}/`]).split("\n").filter((p) => p !== "");
		for (const path of listed) {
			const header = parseItem(gitOk(repo, ["show", `${base}:${path}`])).header;
			if (header && header.number === null) errors.push(`${path}: merged on ${base} with no number`);
		}
	}
	if (errors.length) fail(errors, "check");
	console.log(
		`check: ok (${tree.items.length} item file${tree.items.length === 1 ? "" : "s"}, ${new Set(published.map((p) => p.slug)).size} published, legacy ceiling ${LEGACY_CEILING}, base ${base ?? "none: no numbered item or index row, so main's published record was not read"})`,
	);
}

/** Number the current checkout; the subject committed, or null when there was nothing to do. */
function numberTree(repo: string, explicitBase: string | undefined): string | null {
	const base = baseOf(repo, explicitBase);
	if (!base) throw new Exit(`number: ${NO_BASE}`, 1);
	const dirty = gitOk(repo, ["status", "--porcelain", "--", MIGRATION_FILE, ITEMS_DIR]);
	if (dirty.trim() !== "") fail([`uncommitted changes under ${MIGRATION_FILE} or ${ITEMS_DIR}/:\n${dirty.trimEnd()}`], "number");
	const published = readPublished(repo, ["--first-parent", base]);
	const tree = readTree(repo);
	const errors = checkTree({ ...tree, published }, { skipIndexRows: true });
	if (errors.length) fail(errors, "number");
	const plan = planNumbering({ ...tree, published, addOrder: readAddOrder(repo, base) });
	if (!plan.subject) {
		console.log("number: nothing to number");
		return null;
	}
	const paths: string[] = [];
	for (const [name, text] of plan.files) {
		const rel = `${ITEMS_DIR}/${name}`;
		writeFileSync(join(repo, rel), text);
		paths.push(rel);
	}
	if (plan.migration !== null) {
		writeFileSync(join(repo, MIGRATION_FILE), plan.migration);
		paths.push(MIGRATION_FILE);
	}
	gitOk(repo, ["add", "--", ...paths]);
	gitOk(repo, ["-c", "commit.gpgsign=false", "commit", "-q", "-m", plan.subject, "--", ...paths], BOT_ENV);
	console.log(`number: committed "${plan.subject}"`);
	return plan.subject;
}

/** The reasons HEAD is not exactly one numbering-only commit on top of origin/main. */
function scopeErrors(repo: string): string[] {
	const parents = gitOk(repo, ["rev-list", "--parents", "-n", "1", "HEAD"]).trim().split(" ").slice(1);
	const originMain = gitOk(repo, ["rev-parse", ORIGIN_MAIN]).trim();
	if (parents.length !== 1 || parents[0] !== originMain) return ["HEAD is not one commit on top of origin/main"];
	const errors: string[] = [];
	const changes = gitOk(repo, ["diff", "--no-renames", "--name-status", "-z", ORIGIN_MAIN, "HEAD"]).split("\0");
	for (let i = 0; i + 1 < changes.length; i += 2) {
		const status = changes[i]!;
		const path = changes[i + 1]!;
		if (status !== "M") {
			errors.push(`${path}: status ${status}; a numbering commit only modifies files`);
			continue;
		}
		const why = numberingChangeScope(path, gitOk(repo, ["show", `${ORIGIN_MAIN}:${path}`]), gitOk(repo, ["show", `HEAD:${path}`]));
		if (why) errors.push(why);
	}
	return errors;
}

function publish(repo: string): void {
	for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
		if (attempt > 1) console.log(`publish: retrying from a fresh origin/main (attempt ${attempt}/${ATTEMPTS})`);
		gitOk(repo, ["fetch", "-q", "origin", `+refs/heads/main:${ORIGIN_MAIN}`]);
		gitOk(repo, ["checkout", "-q", "--detach", ORIGIN_MAIN]);
		const subject = numberTree(repo, ORIGIN_MAIN);
		if (!subject) {
			console.log("publish: nothing to push");
			return;
		}
		const scope = scopeErrors(repo);
		if (scope.length) fail(scope, "publish: numbering commit out of scope");
		const push = git(repo, ["push", "origin", "HEAD:refs/heads/main"]);
		if (push.code === 0) {
			console.log(`publish: pushed "${subject}" to origin main`);
			return;
		}
		const reason = push.err.trim().split("\n").filter((l) => l !== "").at(-1) ?? `exit ${push.code}`;
		console.log(`publish: push refused (attempt ${attempt}/${ATTEMPTS}): ${reason}`);
	}
	throw new Exit(`publish: ${ATTEMPTS} pushes refused; giving up`, 1);
}

interface Args {
	cmd: string;
	base?: string;
	repo?: string;
	merged: boolean;
}

function parseArgs(argv: string[]): Args {
	const [cmd, ...rest] = argv;
	if (cmd !== "check" && cmd !== "number" && cmd !== "publish") {
		throw new Exit(
			"usage: migration-items.ts check [--merged] [--base <ref>] [--repo <dir>] | number [--base <ref>] [--repo <dir>] | publish [--repo <dir>]",
			2,
		);
	}
	const out: Args = { cmd, merged: false };
	for (let i = 0; i < rest.length; i++) {
		const a = rest[i]!;
		if (a === "--merged" && cmd === "check") out.merged = true;
		else if ((a === "--base" && cmd !== "publish") || a === "--repo") {
			const v = rest[++i];
			if (v === undefined) throw new Exit(`${a} needs a value`, 2);
			if (a === "--base") out.base = v;
			else out.repo = v;
		} else throw new Exit(`${cmd}: unknown argument ${a}`, 2);
	}
	return out;
}

function main(): number {
	try {
		const args = parseArgs(process.argv.slice(2));
		const repo = args.repo ?? gitOk(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
		if (args.cmd === "check") check(repo, args.base, args.merged);
		else if (args.cmd === "number") numberTree(repo, args.base);
		else publish(repo);
		return 0;
	} catch (e) {
		if (!(e instanceof Exit)) throw e;
		console.error(e.message);
		return e.code;
	}
}

process.exit(main());
