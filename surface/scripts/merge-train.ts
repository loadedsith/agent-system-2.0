#!/usr/bin/env bun
// merge-train: the merge train's resolver (workload wl-mv8s8srodefytc, PLAN § 3; the logic is
// surface/src/merge-train-resolve.ts). Run by a train lane from the PR head's worktree.
//
//   bun surface/scripts/merge-train.ts resolve --pr <n> --workload <wl|none>
//   bun surface/scripts/merge-train.ts convert --pr <n> --workload <wl|none> --base <ref>
//   bun surface/scripts/merge-train.ts check --base <ref>
//
// resolve  a merge in progress: MIGRATION.md (the PR's new numbered items become
//          migration/items/<slug>.md, the rest merged 3-way with main), install/manifest.tsv (3-way,
//          add/add rows unioned) and migration/items/* (identical add/add taken), from the stage
//          blobs. Writes, `git add`s and prints each path; the lane commits.
// convert  no merge in progress: moves HEAD's new numbered items (new since `git merge-base HEAD
//          <ref>`) into item files; prints each path written, nothing when there is nothing to do.
// check    exit 0 when HEAD's MIGRATION.md has no numbered item the merge base lacks.
//
// --workload is the head branch's workload id when the branch is wl/<wl-…>, else none.
// Exit 0 done; 2 a usage error or a git process failure; 3 an unmerged path outside MIGRATION.md,
// install/manifest.tsv and migration/items/*; 4 a conflict it cannot fix without losing an edit.
// Nothing is written on 2, 3 or 4. No network, no push, no ledger.
import { checkItems, convertItems, EXIT_USAGE, type Outcome, resolveMerge, TrainExit, WORKLOAD_RE } from "../src/merge-train-resolve";

const USAGE = [
	"usage: merge-train.ts resolve --pr <n> --workload <wl|none>",
	"       merge-train.ts convert --pr <n> --workload <wl|none> --base <ref>",
	"       merge-train.ts check --base <ref>",
].join("\n");

const FLAGS: Record<string, string[]> = {
	resolve: ["--pr", "--workload"],
	convert: ["--pr", "--workload", "--base"],
	check: ["--base"],
};

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string> } {
	const [cmd, ...rest] = argv;
	const allowed = cmd === undefined ? undefined : FLAGS[cmd];
	if (allowed === undefined) throw new TrainExit(USAGE, EXIT_USAGE);
	const flags: Record<string, string> = {};
	for (let i = 0; i < rest.length; i += 2) {
		const [flag, value] = [rest[i]!, rest[i + 1]];
		if (!allowed.includes(flag)) throw new TrainExit(`${cmd}: unknown argument ${flag}\n${USAGE}`, EXIT_USAGE);
		if (value === undefined) throw new TrainExit(`${flag} needs a value`, EXIT_USAGE);
		flags[flag] = value;
	}
	const missing = allowed.filter((f) => flags[f] === undefined);
	if (missing.length) throw new TrainExit(`${cmd}: missing ${missing.join(", ")}\n${USAGE}`, EXIT_USAGE);
	if (flags["--pr"] !== undefined && !/^[1-9][0-9]*$/.test(flags["--pr"])) throw new TrainExit(`--pr must be a PR number, got \`${flags["--pr"]}\``, EXIT_USAGE);
	if (flags["--workload"] !== undefined && !WORKLOAD_RE.test(flags["--workload"])) {
		throw new TrainExit(`--workload must be wl-<id> or none, got \`${flags["--workload"]}\``, EXIT_USAGE);
	}
	return { cmd, flags };
}

function main(): number {
	try {
		const { cmd, flags } = parseArgs(process.argv.slice(2));
		const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
		if (top.exitCode !== 0) throw new TrainExit(`not inside a git work tree: ${top.stderr.toString().trim()}`, EXIT_USAGE);
		const repo = top.stdout.toString().trim();
		const pr = Number(flags["--pr"]);
		let result: Outcome;
		if (cmd === "resolve") result = resolveMerge(repo, pr, flags["--workload"]!);
		else if (cmd === "convert") result = convertItems(repo, pr, flags["--workload"]!, flags["--base"]!);
		else result = checkItems(repo, flags["--base"]!);
		for (const line of result.err) console.error(line);
		for (const line of result.out) console.log(line);
		return 0;
	} catch (e) {
		if (!(e instanceof TrainExit)) throw e;
		console.error(e.message);
		return e.code;
	}
}

process.exit(main());
