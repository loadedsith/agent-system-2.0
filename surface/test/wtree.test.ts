// The working tree as a tree id (surface/src/wtree.ts, the gstack-wtree port): a clean tree is
// HEAD's tree; a tracked edit and an untracked file that is not ignored change it, an ignored file
// does not; the real index is left byte-for-byte and mtime-for-mtime as it was; no repo is null.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { workingTree } from "../src/wtree";
import { git, tempRepo, tmp } from "./helpers";

const headTree = (repo: string) => git(repo, ["rev-parse", "HEAD^{tree}"]).out;

describe("workingTree", () => {
	test("a clean repo is HEAD's tree, from the top level and from a subdirectory", () => {
		const repo = tempRepo();
		mkdirSync(join(repo, "sub"));
		expect(workingTree(repo)).toEqual({ repo, tree: headTree(repo) });
		expect(workingTree(join(repo, "sub"))).toEqual({ repo, tree: headTree(repo) });
	});

	test("a tracked edit and an untracked file change the tree; an ignored file does not; the real index is untouched", () => {
		const repo = tempRepo();
		const index = join(repo, ".git", "index");
		const bytes = readFileSync(index);
		const mtime = statSync(index).mtimeMs;
		const clean = headTree(repo);

		writeFileSync(join(repo, "build.log"), "ignored output\n");
		expect(workingTree(repo)?.tree).toBe(clean);

		writeFileSync(join(repo, "README.md"), "edited\n");
		const edited = workingTree(repo)?.tree;
		expect(edited).toMatch(/^[0-9a-f]{40}$/);
		expect(edited).not.toBe(clean);

		writeFileSync(join(repo, "new.ts"), "export {};\n");
		const untracked = workingTree(repo)?.tree;
		expect(untracked).not.toBe(edited);
		expect(git(repo, ["ls-tree", "--name-only", untracked!]).out.split("\n")).toEqual([".gitignore", "README.md", "new.ts"]);

		// Back to the committed content: HEAD's tree again.
		writeFileSync(join(repo, "README.md"), "working tree test repo\n");
		rmSync(join(repo, "new.ts"));
		expect(workingTree(repo)?.tree).toBe(clean);

		expect(readFileSync(index).equals(bytes)).toBe(true);
		expect(statSync(index).mtimeMs).toBe(mtime);
		expect(git(repo, ["diff", "--cached", "--name-only"]).out).toBe("");
	});

	test("a repo with no index yet starts from HEAD, and none is written", () => {
		const repo = tempRepo();
		rmSync(join(repo, ".git", "index"));
		expect(workingTree(repo)).toEqual({ repo, tree: headTree(repo) });
		expect(existsSync(join(repo, ".git", "index"))).toBe(false);
	});

	test("outside a repository it is null", () => {
		expect(workingTree(tmp("no-repo"))).toBeNull();
	});
});
