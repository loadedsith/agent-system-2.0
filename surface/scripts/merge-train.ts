#!/usr/bin/env bun
// merge-train: the merge train's resolver and its order (workload wl-mv8s8srodefytc, PLAN § 3 and § 1b;
// the logic is surface/src/merge-train-resolve.ts and surface/src/merge-train-stack.ts). Run by a train
// lane: resolve / convert / check from the PR head's worktree, order from anywhere.
//
//   bun surface/scripts/merge-train.ts resolve --pr <n> --workload <wl|none>
//   bun surface/scripts/merge-train.ts convert --pr <n> --workload <wl|none> --base <ref>
//   bun surface/scripts/merge-train.ts check --base <ref>
//   bun surface/scripts/merge-train.ts order --repo <owner/repo> --prs <n>[,<n>…]
//
// resolve  a merge in progress: MIGRATION.md (the PR's new numbered items become
//          migration/items/<slug>.md, the rest merged 3-way with main), install/manifest.tsv (3-way,
//          add/add rows unioned) and migration/items/* (identical add/add taken), from the stage
//          blobs. Writes, `git add`s and prints each path; the lane commits.
// convert  no merge in progress: moves HEAD's new numbered items (new since `git merge-base HEAD
//          <ref>`) into item files; prints each path written, nothing when there is nothing to do.
// check    exit 0 when HEAD's MIGRATION.md has no numbered item the merge base lacks.
// order    the train's PRs (`trainPrs`, in Jo's order) in the order the train works them: one
//          `gh pr list --state open --limit 1000 --json number,headRefName`, then one `gh pr view <n>
//          --json number,state,body,baseRefName,headRefName` per train PR and per dependency found.
//          Prints the chain line, then one line of JSON {order, waiting, cycles, chain, unrecorded}.
//
// --workload is the head branch's workload id when the branch is wl/<wl-…>, else none.
// Exit 0 done; 2 a usage error or a git or gh process failure; 3 an unmerged path outside MIGRATION.md,
// install/manifest.tsv and migration/items/*; 4 a conflict it cannot fix without losing an edit.
// Nothing is written on 2, 3 or 4. No push, no ledger; only order reads the network (gh), and it writes nothing.
import { checkItems, convertItems, EXIT_USAGE, type Outcome, resolveMerge, TrainExit, WORKLOAD_RE } from "../src/merge-train-resolve";
import { headsByBranch, orderReport, prDeps, type StackPr } from "../src/merge-train-stack";

const USAGE = [
	"usage: merge-train.ts resolve --pr <n> --workload <wl|none>",
	"       merge-train.ts convert --pr <n> --workload <wl|none> --base <ref>",
	"       merge-train.ts check --base <ref>",
	"       merge-train.ts order --repo <owner/repo> --prs <n>[,<n>…]",
].join("\n");

const FLAGS: Record<string, string[]> = {
	resolve: ["--pr", "--workload"],
	convert: ["--pr", "--workload", "--base"],
	check: ["--base"],
	order: ["--repo", "--prs"],
};

/** gh's open-PR page size for `order`: gh lists 30 by default (https://cli.github.com/manual/gh_pr_list), so a stack base could go unmapped. */
const OPEN_LIMIT = 1000;
const PRS_RE = /^#?[1-9][0-9]*(?:[ ,]+#?[1-9][0-9]*)*$/;

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
	if (flags["--repo"] !== undefined && !/^[\w.-]+\/[\w.-]+$/.test(flags["--repo"])) throw new TrainExit(`--repo must be <owner>/<repo>, got \`${flags["--repo"]}\``, EXIT_USAGE);
	if (flags["--prs"] !== undefined && !PRS_RE.test(flags["--prs"].trim())) throw new TrainExit(`--prs must be PR numbers, comma-separated, got \`${flags["--prs"]}\``, EXIT_USAGE);
	return { cmd, flags };
}

/** `gh <args>`'s stdout parsed as JSON; a gh failure or a non-JSON answer is exit 2. */
function ghJson(args: string[]): unknown {
	const r = Bun.spawnSync(["gh", ...args], { stdout: "pipe", stderr: "pipe", timeout: 30_000 });
	if (r.exitCode !== 0) {
		const why = r.exitedDueToTimeout ? "timed out" : r.stderr.toString().trim().split("\n").at(-1) || `exit ${r.exitCode}`;
		throw new TrainExit(`gh ${args.join(" ")} failed: ${why}`, EXIT_USAGE);
	}
	try {
		return JSON.parse(r.stdout.toString());
	} catch {
		throw new TrainExit(`gh ${args.join(" ")} did not return json`, EXIT_USAGE);
	}
}

/** `gh pr view <n> -R <repo> --json number,state,body,baseRefName,headRefName`, checked for shape. */
function viewPr(repo: string, n: number): StackPr & { state: string } {
	const args = ["pr", "view", String(n), "-R", repo, "--json", "number,state,body,baseRefName,headRefName"];
	const v = ghJson(args) as Record<string, unknown> | null;
	if (!v || v.number !== n || typeof v.state !== "string" || typeof v.body !== "string" || typeof v.baseRefName !== "string") {
		throw new TrainExit(`gh ${args.join(" ")} returned an unexpected shape`, EXIT_USAGE);
	}
	return { number: n, state: v.state, body: v.body, baseRefName: v.baseRefName };
}

/** `order` (§ 1b): the open PRs' heads once, each train PR and each dependency it declares once, then the chain line and the report. */
function order(repo: string, prs: number[]): Outcome {
	const listArgs = ["pr", "list", "-R", repo, "--state", "open", "--limit", String(OPEN_LIMIT), "--json", "number,headRefName"];
	const open = ghJson(listArgs);
	if (!Array.isArray(open) || open.some((p) => typeof p?.number !== "number" || typeof p?.headRefName !== "string")) {
		throw new TrainExit(`gh ${listArgs.join(" ")} returned an unexpected shape`, EXIT_USAGE);
	}
	const heads = headsByBranch(open as { number: number; headRefName: string }[]);
	const views = new Map<number, StackPr & { state: string }>();
	for (const n of prs) views.set(n, viewPr(repo, n));
	for (const n of prs) for (const d of prDeps(views.get(n)!, heads)) if (!views.has(d)) views.set(d, viewPr(repo, d));
	const report = orderReport(prs, views, heads);
	const err = open.length >= OPEN_LIMIT ? [`gh listed ${open.length} open PRs, its --limit: a base branch past them maps to no PR`] : [];
	return { out: [report.chain, JSON.stringify(report)], err };
}

function main(): number {
	try {
		const { cmd, flags } = parseArgs(process.argv.slice(2));
		let result: Outcome;
		if (cmd === "order") {
			const prs = [...new Set(flags["--prs"]!.trim().split(/[ ,]+/).map((s) => Number(s.replace(/^#/, ""))))];
			result = order(flags["--repo"]!, prs);
		} else {
			const top = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], { stdout: "pipe", stderr: "pipe" });
			if (top.exitCode !== 0) throw new TrainExit(`not inside a git work tree: ${top.stderr.toString().trim()}`, EXIT_USAGE);
			const repo = top.stdout.toString().trim();
			const pr = Number(flags["--pr"]);
			if (cmd === "resolve") result = resolveMerge(repo, pr, flags["--workload"]!);
			else if (cmd === "convert") result = convertItems(repo, pr, flags["--workload"]!, flags["--base"]!);
			else result = checkItems(repo, flags["--base"]!);
		}
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
