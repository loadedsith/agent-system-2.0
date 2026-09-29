// M4 fix round 7, git hand: astra-7 (review-astra-7/REVIEW.md) B1 and B2. Every git probe string
// from review-astra-7/PROBES.md (P11, P20, P26) is here verbatim with its verdict after this round;
// class variants follow per finding. The gate only reads these strings. The live groups run real git
// in test-owned temp repos with stub programs that print a marker, to pin the git behavior each
// verdict rests on (git 2.50.1).
import { describe, expect, test } from "bun:test";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { checkToolCall } from "../src/gates";
import { checkReserved } from "../src/rows/r06-reserved";
import { checkRawLedgerWrite } from "../src/rows/r10-raw-ledger";
import type { CallContext, Refusal } from "../src/types";
import { git, tmp } from "./helpers";

/** An inert repository on `topic` (a push of it is not a push to main) with a tracked `file.txt` and a `gates/src/gates.ts`. */
const repo = realpathSync(tmp("round7-git"));
git(repo, "init", "-q", "-b", "main");
git(repo, "commit", "-q", "--allow-empty", "-m", "one");
git(repo, "switch", "-q", "-c", "topic");
writeFileSync(join(repo, "file.txt"), "x\n");
git(repo, "add", "file.txt");
git(repo, "commit", "-q", "-m", "two");

const ctx: CallContext = { role: "lane", cwd: repo, env: { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: "/not-real/ledger.db" } };
const verdict = (r: Refusal): "ALLOW" | "REFUSE" => (r === null ? "ALLOW" : "REFUSE");
const bashCall = (command: string) => ({ toolName: "bash", input: { command } });
/** The composed gate, as P20 and P26 ran it. */
const composed = (command: string) => checkToolCall(bashCall(command), ctx);
/** Rows 6 and 10, as P11 ran them. */
const rows = (command: string) => checkReserved(bashCall(command), ctx) ?? checkRawLedgerWrite(bashCall(command), ctx);

type V = "ALLOW" | "REFUSE";
/** [probe section, the finding it closes or "" for an unchanged control, command, verdict now]. */
const PROBES: [string, string, string, V][] = [
	// Main's ruling (fix round 7): a doc lookup through the default viewer is allowed, the pager class `git log` gets; choosing a viewer stays refused.
	["P11", "", "git help status", "ALLOW"],
	["P11", "", "git status --help", "ALLOW"],
	["P11", "B2", "git verify-commit HEAD", "REFUSE"],
	["P11", "B2", "git archive --format=review HEAD", "REFUSE"],
	// Kept: hash-object's filters are the attribute-selected clean filters `git add` runs; only an explicit --filters is refused (see REPORT-git QUESTION).
	["P11", "", "git hash-object --path=foo gates/src/gates.ts", "ALLOW"],
	["P11", "B1", "git checkout --orphan foo --no-orphan .", "REFUSE"],
	["P11", "", "git restore --staged --no-staged .", "REFUSE"],
	["P11", "", "git apply --build-fake-ancestor=/not-real/ledger.db /not-real/patch", "REFUSE"],
	["P11", "", "git archive --prefix=../../ --format=tar HEAD", "ALLOW"],
	["P20", "B1", "git checkout --orphan foo --no-orphan .", "REFUSE"],
	["P20", "", "git checkout --no-orphan --orphan foo .", "ALLOW"],
	["P20", "", "git checkout .", "REFUSE"],
	["P20", "", "git help status", "ALLOW"],
	["P20", "", "git help --man status", "REFUSE"],
	["P20", "", "git status --help", "ALLOW"],
	["P20", "", "git status -h", "ALLOW"],
	["P20", "B2", "git archive --format=review HEAD", "REFUSE"],
	["P20", "", "git archive --format=tar HEAD", "ALLOW"],
	["P20", "", "git restore --staged --no-staged .", "REFUSE"],
	["P20", "", "git restore --no-staged --staged .", "ALLOW"],
	["P20", "", "git merge -s ort -s custom topic", "REFUSE"],
	["P20", "", "git merge -s custom -s ort topic", "REFUSE"],
	["P26", "", 'git -c man.viewer=review -c "man.review.cmd=printf R7_VIEWER" help status', "REFUSE"],
	["P26", "", 'git -c "tar.review.command=cat >/dev/null; printf R7_ARCHIVE_FILTER" archive --format=review HEAD', "REFUSE"],
];

describe("astra-7 probes, verbatim", () => {
	for (const [section, finding, command, want] of PROBES) {
		test(`${section}${finding ? ` ${finding}` : ""}: ${want} ${command}`, () => {
			expect(verdict(section === "P11" ? rows(command) : composed(command))).toBe(want);
		});
	}
});

/** Class variants: [finding, command, verdict]. */
const VARIANTS: [string, string, V][] = [
	// B1: branch creation is the final value of -b / --orphan, whatever the spelling or order.
	["B1", "git checkout --orphan=foo --no-orphan .", "REFUSE"],
	["B1", "git checkout --orph foo --no-orph .", "REFUSE"],
	["B1", "git checkout --orphan foo --no-orphan file.txt", "REFUSE"],
	["B1", "git checkout --no-orphan .", "REFUSE"],
	["B1", "git checkout --detach --no-detach .", "REFUSE"],
	["B1", "git checkout -t --no-track .", "REFUSE"],
	["B1", "git checkout --orphan foo --no-orphan -- .", "REFUSE"],
	["B1", "git checkout --orphan foo", "ALLOW"],
	["B1", "git checkout -b foo", "ALLOW"],
	["B1", "git checkout -bfoo main", "ALLOW"],
	["B1", "git checkout main", "ALLOW"],
	// Help: the default-viewer lookups are allowed (Main's ruling); an explicit viewer choice is refused.
	["help", "git --help status", "ALLOW"],
	["help", "git -h status", "ALLOW"],
	["help", "git log --help", "ALLOW"],
	["help", "git help help", "ALLOW"],
	["help", "git help", "ALLOW"],
	["help", "git help -a", "ALLOW"],
	["help", "git help -w status", "REFUSE"],
	["help", "git help --info status", "REFUSE"],
	["help", "git help --web status", "REFUSE"],
	["B2", "git log -h", "ALLOW"],
	// B2: archive formats git builds itself only, every --format checked.
	["B2", "git archive --format review HEAD", "REFUSE"],
	["B2", "git archive --forma=review HEAD", "REFUSE"],
	["B2", "git archive --format=tar --format=review HEAD", "REFUSE"],
	["B2", "git archive --format=review --format=tar HEAD", "REFUSE"],
	["B2", "git archive --format=TAR HEAD", "REFUSE"],
	["B2", "git archive --format=zip HEAD", "ALLOW"],
	["B2", "git archive --format=tgz HEAD", "ALLOW"],
	["B2", "git archive --format=tar.gz HEAD", "ALLOW"],
	["B2", "git archive HEAD", "ALLOW"],
	// B2 audit: format placeholders that run gpg (live group below), escaped % and ordinary formats allowed.
	["B2", "git log --format='%G?' -1", "REFUSE"],
	["B2", "git log '--pretty=format:%GS'", "REFUSE"],
	["B2", "git show -s --format=%GK", "REFUSE"],
	["B2", "git rev-list --format='%G?' HEAD", "REFUSE"],
	["B2", "git reflog show --format=%GS", "REFUSE"],
	["B2", "git for-each-ref --format='%(signature)'", "REFUSE"],
	["B2", "git branch --format='%(signature:key)'", "REFUSE"],
	["B2", "git tag -l --format='%(signature)'", "REFUSE"],
	["B2", "git log --format='%%G' -1", "ALLOW"],
	["B2", "git log --format='%H %an' -1", "ALLOW"],
	["B2", "git for-each-ref --format='%(refname)'", "ALLOW"],
	// B2 audit: signature checks run gpg, as log --show-signature does.
	["B2", "git verify-tag v1", "REFUSE"],
	["B2", "git tag -v v1", "REFUSE"],
	["B2", "git tag --verify v1", "REFUSE"],
	["B2", "git merge --verify-signatures topic", "REFUSE"],
	["B2", "git pull --verify-signatures origin topic", "REFUSE"],
	["B2", "git log --show-signature -1", "REFUSE"],
	// B2 audit: a URL that selects a transport helper program, like merge -s selects git-merge-<name>.
	["B2", "git ls-remote review::x", "REFUSE"],
	["B2", "git ls-remote review://x", "REFUSE"],
	["B2", "git fetch review::x", "REFUSE"],
	["B2", "git pull ext::sh", "REFUSE"],
	["B2", "git clone review::x /not-real/clone", "REFUSE"],
	["B2", "git remote add r review://x", "REFUSE"],
	["B2", "git remote set-url origin review::x", "REFUSE"],
	["B2", "git push --repo=review::x HEAD:topic", "REFUSE"],
	["B2", "git ls-remote https://github.com/git/git", "ALLOW"],
	["B2", "git ls-remote git@github.com:git/git.git", "ALLOW"],
	["B2", "git fetch origin", "ALLOW"],
	["B2", "git fetch file:///not-real/repo", "ALLOW"],
	["B2", "git remote add r https://github.com/git/git", "ALLOW"],
	["B2", "git push origin topic", "ALLOW"],
];

describe("astra-7 class variants", () => {
	for (const [finding, command, want] of VARIANTS) {
		test(`${finding}: ${want} ${command}`, () => {
			expect(verdict(rows(command))).toBe(want);
		});
	}
});

/** Real git in a disposable repo, stub programs only (the -c forms here are the gate-refused P26 controls, run by the test, never by a lane). */
function scratchRepo(tag: string): string {
	const dir = realpathSync(tmp(tag));
	git(dir, "init", "-q", "-b", "main");
	writeFileSync(join(dir, "f"), "clean\n");
	git(dir, "add", "f");
	git(dir, "commit", "-q", "-m", "one");
	return dir;
}
const IDENTITY = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid" };
const run = (cwd: string, ...args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...IDENTITY, GIT_CONFIG_NOSYSTEM: "1", HOME: cwd } });

describe("the git behavior the verdicts rest on (live, disposable repos)", () => {
	test("B1: --orphan foo --no-orphan . discards the dirty file; --no-orphan --orphan foo . refuses and keeps it", () => {
		const dir = scratchRepo("r7-orphan");
		writeFileSync(join(dir, "f"), "dirty\n");
		expect(run(dir, "checkout", "--no-orphan", "--orphan", "foo", ".").status).not.toBe(0);
		expect(readFileSync(join(dir, "f"), "utf8")).toBe("dirty\n");
		expect(run(dir, "checkout", "--orphan", "foo", "--no-orphan", ".").status).toBe(0);
		expect(readFileSync(join(dir, "f"), "utf8")).toBe("clean\n");
	});

	test("B2: archive --format=<name> runs tar.<name>.command", () => {
		const dir = scratchRepo("r7-archive");
		const r = run(dir, "-c", "tar.review.command=cat >/dev/null; printf R7_ARCHIVE_FILTER", "archive", "--format=review", "HEAD");
		expect(r.stdout).toBe("R7_ARCHIVE_FILTER");
	});

	test("B2: a %G placeholder runs gpg.program on a signed commit; %H does not", () => {
		const dir = scratchRepo("r7-gpg");
		const log = join(dir, "gpg.log");
		const gpg = join(dir, "stub-gpg");
		writeFileSync(gpg, `#!/bin/sh\necho ran >> '${log}'\ncat >/dev/null\nprintf -- '-----BEGIN PGP SIGNATURE-----\\nx\\n-----END PGP SIGNATURE-----\\n'\necho '[GNUPG:] SIG_CREATED D 1 8 00 1 X' >&2\n`, { mode: 0o755 });
		expect(run(dir, "-c", `gpg.program=${gpg}`, "commit", "-q", "-S", "--allow-empty", "-m", "signed").status).toBe(0);
		const runs = (...args: string[]) => {
			writeFileSync(log, "");
			run(dir, "-c", `gpg.program=${gpg}`, ...args);
			return readFileSync(log, "utf8").length > 0;
		};
		expect(runs("log", "-1", "--format=%H")).toBe(false);
		expect(runs("log", "-1", "--format=%G?")).toBe(true);
		expect(runs("for-each-ref", "--format=%(signature)")).toBe(true);
		expect(runs("verify-commit", "HEAD")).toBe(true);
	});

	test("B2: <scheme>:: and an unknown <scheme>:// look for git-remote-<scheme>", () => {
		const dir = scratchRepo("r7-transport");
		for (const url of ["review::x", "review://x"]) expect(run(dir, "ls-remote", url).stderr).toContain("remote-review");
	});
});
