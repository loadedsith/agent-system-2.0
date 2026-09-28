// Offline fixtures for the gate tests: temp dirs, temp git repos with a local bare "origin", temp
// ledgers through the ledger module, and an in-memory LaneEntries standing in for the proposed
// entries API (REPORT.md DDL QUESTION).
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import type { EntryKind, LaneEntries, LaneEntry } from "../src/ledger-port";

export const tmp = (tag: string): string => mkdtempSync(join(tmpdir(), `gates-${tag}-`));

const GIT_ENV = {
	...process.env,
	GIT_AUTHOR_NAME: "gate test",
	GIT_AUTHOR_EMAIL: "gate@test.invalid",
	GIT_COMMITTER_NAME: "gate test",
	GIT_COMMITTER_EMAIL: "gate@test.invalid",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_TERMINAL_PROMPT: "0",
};

/** Run git in `cwd`, hooks and signing off; throws on failure. */
export function git(cwd: string, ...args: string[]): string {
	const r = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false", "-c", "init.defaultBranch=main", ...args], {
		cwd,
		encoding: "utf8",
		env: GIT_ENV,
	});
	if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${r.stderr}`);
	return r.stdout.trim();
}

export function commit(repo: string, file: string, content: string, msg = `edit ${file}`): void {
	writeFileSync(join(repo, file), content);
	git(repo, "add", file);
	git(repo, "commit", "-q", "-m", msg);
}

/** A bare origin plus a working clone on `main` with one pushed commit and origin/HEAD recorded. */
export function repoWithOrigin(): { root: string; origin: string; work: string } {
	const root = tmp("repo");
	const origin = join(root, "origin.git");
	const work = join(root, "work");
	git(root, "init", "-q", "--bare", "-b", "main", origin);
	mkdirSync(work);
	git(work, "init", "-q", "-b", "main");
	git(work, "remote", "add", "origin", origin);
	commit(work, "a.txt", "a\n");
	git(work, "push", "-q", "origin", "main");
	git(work, "fetch", "-q", "origin");
	git(work, "remote", "set-head", "origin", "main");
	return { root, origin, work };
}

/** A second clone that advances origin/main by one commit. */
export function advanceOriginMain(root: string, origin: string): void {
	const other = join(root, `other-${Date.now()}`);
	git(root, "clone", "-q", origin, other);
	commit(other, `c-${Date.now()}.txt`, "c\n");
	git(other, "push", "-q", "origin", "main");
}

export function tempLedger(clock?: () => string): { ledger: Ledger; path: string } {
	const path = join(tmp("ledger"), "ledger.db");
	return { ledger: Ledger.open(path, { create: true, backup: false, backupOnOpen: false, ...(clock ? { clock } : {}) }), path };
}

/** In-memory stand-in for the proposed lane-entries API. */
export class FakeEntries implements LaneEntries {
	rows: LaneEntry[] = [];
	constructor(private readonly now: () => string = () => new Date().toISOString()) {}
	recordEntry(input: { by: string; workloadId: string; sliceId?: string | null; kind: EntryKind; body: string }): string {
		const id = `en-${this.rows.length + 1}`;
		this.rows.push({ id, workload_id: input.workloadId, slice_id: input.sliceId ?? null, kind: input.kind, body: input.body, created_by: input.by, created_at: this.now() });
		return id;
	}
	entries(workloadId: string, kind?: EntryKind): LaneEntry[] {
		return this.rows.filter((r) => r.workload_id === workloadId && (!kind || r.kind === kind));
	}
}

/** A six-field brief line block. */
export function brief(over: Partial<Record<string, string>> = {}): string {
	const f = { workload: "wl-test1", task: "Add the thing.", "done-condition": "bun test passes", inputs: "gates/", stakes: "normal", "ceiling-share": "10", ...over };
	return Object.entries(f)
		.filter(([, v]) => v !== "")
		.map(([k, v]) => `${k}: ${v}`)
		.join("\n");
}
