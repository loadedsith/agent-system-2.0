/**
 * The read-only repository fingerprint a review hand is checked against (PLAN wl-mupu0sx2o046io D2
 * check 2): every change a `bash` write can make to the work moves it, and taking it writes nothing.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoFingerprint } from "../src/fingerprint";

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) {
		chmodTree(join(dir, ".git"), 0o700, 0o600);
		rmSync(dir, { recursive: true, force: true });
	}
});

function git(cwd: string, ...args: string[]): string {
	const r = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
	return r.stdout.toString();
}

/** A repository with one commit: a.txt, a script, a symlink, and an ignored file. */
function scratchRepo(): string {
	const dir = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "fingerprint-"));
	dirs.push(dir);
	git(dir, "init", "-q");
	writeFileSync(join(dir, "a.txt"), "one\n");
	writeFileSync(join(dir, "run.sh"), "echo hi\n");
	writeFileSync(join(dir, ".gitignore"), "ignored.log\n");
	symlinkSync("a.txt", join(dir, "link"));
	git(dir, "add", "-A");
	git(dir, "commit", "-q", "-m", "init");
	writeFileSync(join(dir, "ignored.log"), "noise\n");
	return dir;
}

function chmodTree(path: string, dirMode: number, fileMode: number): void {
	let stat;
	try {
		stat = statSync(path);
	} catch {
		return;
	}
	if (stat.isDirectory()) {
		chmodSync(path, dirMode);
		for (const name of readdirSync(path)) chmodTree(join(path, name), dirMode, fileMode);
	} else chmodSync(path, fileMode);
}

describe("repoFingerprint", () => {
	test("is stable while nothing changes, and an ignored file does not move it", () => {
		const repo = scratchRepo();
		const before = repoFingerprint(repo);
		expect(repoFingerprint(repo)).toBe(before);
		writeFileSync(join(repo, "ignored.log"), "more noise\n");
		expect(repoFingerprint(repo)).toBe(before);
	});

	test("a worktree edit, a new untracked file and a deleted tracked file each move it", () => {
		const repo = scratchRepo();
		const before = repoFingerprint(repo);
		writeFileSync(join(repo, "a.txt"), "two\n");
		const edited = repoFingerprint(repo);
		expect(edited).not.toBe(before);
		writeFileSync(join(repo, "new.txt"), "x\n");
		const added = repoFingerprint(repo);
		expect(added).not.toBe(edited);
		unlinkSync(join(repo, "run.sh"));
		expect(repoFingerprint(repo)).not.toBe(added);
	});

	test("a change staged only in the index moves it, though the worktree is back as it was (T3)", () => {
		const repo = scratchRepo();
		const before = repoFingerprint(repo);
		writeFileSync(join(repo, "a.txt"), "staged\n");
		git(repo, "add", "a.txt");
		writeFileSync(join(repo, "a.txt"), "one\n");
		expect(git(repo, "diff", "--cached", "--name-only").trim()).toBe("a.txt");
		expect(repoFingerprint(repo)).not.toBe(before);
	});

	test("a commit, a new branch and a stash each move it", () => {
		const repo = scratchRepo();
		const start = repoFingerprint(repo);
		git(repo, "branch", "side");
		const branched = repoFingerprint(repo);
		expect(branched).not.toBe(start);
		writeFileSync(join(repo, "a.txt"), "stashed\n");
		git(repo, "stash", "-q");
		const stashed = repoFingerprint(repo);
		expect(stashed).not.toBe(branched); // the worktree is clean again; refs/stash moved
		git(repo, "commit", "-q", "--allow-empty", "-m", "empty");
		expect(repoFingerprint(repo)).not.toBe(stashed);
	});

	test("an executable-bit change and a retargeted symlink each move it (review 4 note 4)", () => {
		const repo = scratchRepo();
		const before = repoFingerprint(repo);
		chmodSync(join(repo, "run.sh"), 0o755);
		const executable = repoFingerprint(repo);
		expect(executable).not.toBe(before);
		unlinkSync(join(repo, "link"));
		symlinkSync("run.sh", join(repo, "link"));
		expect(repoFingerprint(repo)).not.toBe(executable);
	});

	test("it runs no git write: it is taken unchanged from a repository whose .git is read-only", () => {
		const repo = scratchRepo();
		writeFileSync(join(repo, "a.txt"), "dirty\n"); // a dirty worktree is what an index refresh would write for
		const before = repoFingerprint(repo);
		chmodTree(join(repo, ".git"), 0o500, 0o400);
		expect(repoFingerprint(repo)).toBe(before);
		expect(readdirSync(join(repo, ".git")).filter(name => name.endsWith(".lock"))).toEqual([]);
	});

	test("a directory that is no repository throws, so a caller fails closed", () => {
		const dir = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "fingerprint-none-"));
		dirs.push(dir);
		expect(() => repoFingerprint(dir)).toThrow(/rev-parse --show-toplevel/);
	});
});
