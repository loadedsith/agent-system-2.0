// Offline fixtures for the gate tests: temp dirs, temp git repos with a local bare "origin", and
// temp ledgers through the ledger module (schema v3, with the lane-written entries table).
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { tmpDir } from "../../ledger/test/tmp";
import type { ArtifactTree } from "../../surface/src/signals";

export const tmp = (tag: string): string => tmpDir(`gates-${tag}-`);

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

/** The artifact-tree record (surface/src/signals.ts) a passing `bun test` on `work`'s HEAD tree leaves, as row 8 reads it. */
export function testRecord(work: string, over: Partial<ArtifactTree> = {}): ArtifactTree {
	return { sliceId: "sl-test", repo: git(work, "rev-parse", "--show-toplevel"), tree: git(work, "rev-parse", "HEAD^{tree}"), command: "bun test", ...over };
}

export function tempLedger(clock?: () => string): { ledger: Ledger; path: string } {
	const path = join(tmp("ledger"), "ledger.db");
	return { ledger: Ledger.open(path, { create: true, backup: false, backupOnOpen: false, ...(clock ? { clock } : {}) }), path };
}

/** A six-field brief line block. */
export function brief(over: Partial<Record<string, string>> = {}): string {
	const f = { workload: "wl-test1", task: "Add the thing.", "done-condition": "bun test passes", inputs: "gates/", stakes: "normal", "ceiling-share": "10", ...over };
	return Object.entries(f)
		.filter(([, v]) => v !== "")
		.map(([k, v]) => `${k}: ${v}`)
		.join("\n");
}
