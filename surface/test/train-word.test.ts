// The merge-train word (PLAN wl-mv8s8srodefytc § 1, § 2): Jo's `train <N…>` opens a merge-train workload in one
// transaction (the preallocated id, the brief naming this train's slice ids, TRAIN_DONE, the normal ceiling, no
// plan), `train <wl-…> <N…>` adds to it, the train hold the starter applies, the skip close in the answer path,
// and the train skip in the close check. Every case runs on a real temp ledger; the routes run through the surface.
import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LANE_STARTER_BY, Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { recordRepo, repoOf } from "../src/decision-log";
import { ensureStandingWorkload } from "../src/identity";
import { apply, applyTrain, commandShaped, interpret, interpretBatch, interpretPaste, maxWords, TRAIN_IN_BATCH } from "../src/input";
import { boundPrs, controlEntries, planFirst } from "../src/launch";
import {
	KNOWN_FLAKES, prStakes, RESOLVE_COMMAND, type StakesView, TRAIN_DONE, trainBody, trainBrief, trainFullSliceId, trainHold, trainInstructionBody, trainPrs, trainSkippedOf,
	trainSliceId, trainSlicePr,
} from "../src/merge-train";
import { Numbering } from "../src/numbering";
import { errorLines } from "../src/errors";
import { type ClosePr, closeFreshness, makeRunId, runnerDiedRun, testRequestedBody, testRunBody } from "../src/test-run";
import { STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import { clock, ctxOf, fakePi, notices, tempLedger, tmp, workloadWithSlice } from "./helpers";

const LANE = "lane-train-1";
const JO = { by: SURFACE_BY, author: "jo", channel: "surface" as const };
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

/** A merge train opened as Jo's word opens it, on a temp ledger with a settable clock. */
function train(prs: number[] = [101, 106]) {
	const c = clock();
	const { ledger } = tempLedger(c.now);
	const repo = tmp("train-repo");
	const cmd = interpret(ledger, `train ${prs.join(" ")}`);
	if (cmd?.kind !== "train") throw new Error(`not a train: ${JSON.stringify(cmd)}`);
	const r = applyTrain(ledger, cmd, repo);
	c.plusHours(0.01);
	return { ledger, c, repo, wl: r.workloadId, line: r.line };
}

/** The lane's slice `id` on `wl`, with a question on it offering `options`; returns the question id. */
function ask(ledger: Ledger, wl: string, id: string, options: string[], by = LANE): string {
	if (!ledger.slice(id)) ledger.addSlice({ by, workloadId: wl, id, task: `train slice ${id}`, doneCondition: "Jo answered", inputs: "the PR" });
	return ledger.raiseQuestion({ by, workloadId: wl, sliceId: id, body: `about ${id}`, options });
}

const holdOf = (ledger: Ledger, wl: string) => trainHold({ entries: ledger.entries(wl), instructions: ledger.instructions(wl), questions: ledger.questions(wl) });

const numbered = (ledger: Ledger): Numbering => {
	const n = new Numbering();
	n.assign(errorLines(ledger));
	return n;
};

function env(): Record<string, string> {
	const voice = join(tmp("voice"), "VOICE.md");
	writeFileSync(voice, "VOICE");
	const e = { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: join(tmp("ledger"), "ledger.db"), AGENT_SYSTEM_VOICE: voice, HOME: "/nonexistent-home" };
	Ledger.open(e.AGENT_SYSTEM_LEDGER_DB, { create: true, backup: false, backupOnOpen: false }).close();
	return e;
}
const open = (e: Record<string, string>) => Ledger.open(e.AGENT_SYSTEM_LEDGER_DB!, { create: true, backup: false, backupOnOpen: false });

describe("train <N…> opens a merge train (§ 1)", () => {
	test("`train 101, #106 101`: one normal autonomous workload, no plan:, done: TRAIN_DONE, the brief naming its slice ids, Jo's instruction then train:", () => {
		const { ledger, repo, wl, line } = train();
		expect(interpret(ledger, "train 101, #106 101")).toEqual({ kind: "train", prs: [101, 106] });
		const opened = ledger.inFlight().map((x) => x.workload).filter((w) => w.id !== STANDING_WORKLOAD_ID);
		expect(opened.map((w) => w.id)).toEqual([wl]);
		const w = ledger.workload(wl)!;
		expect(w).toMatchObject({ stakes: "normal", mode: "autonomous", status: "open", brief: trainBrief(wl, [101, 106]) });
		const k = wl.replace(/^wl-/, "");
		expect(w.brief).toContain(`sl-train-${k}-101`);
		expect(w.brief).toContain(`sl-train-${k}-101-full-1`);
		expect(w.brief).toContain(`${RESOLVE_COMMAND} resolve --pr <n>`);
		// every resolver call runs the train's own script by its lane worktree path, never a PR branch's relative copy
		expect(w.brief).not.toContain("bun surface/scripts/");
		for (const flake of KNOWN_FLAKES) expect(w.brief).toContain(flake);
		expect(repoOf(ledger, wl)).toBe(repo);
		const control = controlEntries(ledger.entries(wl));
		expect(planFirst(control)).toBeNull();
		expect(control.some((c) => c.prefix === "plan")).toBe(false);
		expect(control.find((c) => c.prefix === "done")!.body).toBe(`done: ${TRAIN_DONE}`);
		expect(control.find((c) => c.prefix === "ceiling")!.body).toBe("ceiling: usd 50 wall 360 source stakes normal");
		const [i] = ledger.instructions(wl);
		expect(i).toMatchObject({ kind: "instruction", body: trainInstructionBody(wl, [101, 106]), author: "jo", channel: "surface", created_by: SURFACE_BY });
		expect(i!.body).toBe(`train ${wl} 101 106`);
		expect(control.filter((c) => c.prefix === "train").map((c) => c.body)).toEqual([trainBody([101, 106], i!.id)]);
		expect(boundPrs(ledger.entries(wl), ledger.instructions(wl))).toEqual([{ pr: 101, instructionId: i!.id }, { pr: 106, instructionId: i!.id }]);
		expect(trainPrs(ledger.entries(wl), ledger.instructions(wl))).toEqual([101, 106]);
		expect(line).toBe(`opened merge train ${wl} for #101, #106 (instruction ${i!.id})`);
		// apply never opens one: the open needs the surface's repo
		expect(() => apply(ledger, { kind: "train", prs: [7] })).toThrow("applyTrain");
	});

	test("a lane-written train: binds nothing, with its own instruction or naming Jo's", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const own = ledger.recordInstruction({ by: LANE, workloadId: wl, body: `train ${wl} 101`, author: "jo", channel: "direct" });
		ledger.recordEntry({ by: LANE, workloadId: wl, kind: "assumption", body: `train: 101 ${own}` });
		const jo = ledger.recordInstruction({ ...JO, workloadId: wl, body: `train ${wl} 106` });
		ledger.recordEntry({ by: LANE, workloadId: wl, kind: "assumption", body: `train: 106 ${jo}` });
		expect(boundPrs(ledger.entries(wl), ledger.instructions(wl))).toEqual([]);
		expect(trainPrs(ledger.entries(wl), ledger.instructions(wl))).toEqual([]);
		// so the workload is no train either: an append is refused
		expect(interpret(ledger, `train ${wl} 139`)).toMatchObject({ kind: "refused", why: expect.stringContaining("is not a merge train") });
	});

	test("train slice ids: trainSlicePr reads only this train's ids", () => {
		const wl = "wl-mv8s8srodefytc";
		expect(trainSliceId(wl, 101)).toBe("sl-train-mv8s8srodefytc-101");
		expect(trainFullSliceId(wl, 101, 2)).toBe("sl-train-mv8s8srodefytc-101-full-2");
		expect(trainFullSliceId(wl, 101, 2).length).toBeLessThanOrEqual(48);
		expect(trainSlicePr("sl-train-mv8s8srodefytc-101", wl)).toBe(101);
		expect(trainSlicePr("sl-train-mv8s8srodefytc-101-full-3", wl)).toBe(101);
		expect(trainSlicePr("sl-train-otherone-101", wl)).toBeNull();
		expect(trainSlicePr("sl-full-mv8s8srodefytc-101-1", wl)).toBeNull();
		expect(trainSlicePr("sl-train-mv8s8srodefytc-101-full-", wl)).toBeNull();
	});

	test("the brief carries step 0 (the order command) before step 1 and the § 1b stacked-PR rules; sl-mt-stack's markers are gone", () => {
		const wl = "wl-mv8s8srodefytc";
		const lines = trainBrief(wl, [106, 101]).split("\n");
		const step0 = lines.findIndex((l) => l.startsWith(`0. \`${RESOLVE_COMMAND} order --repo <owner/repo`));
		expect(step0).toBeGreaterThan(-1);
		expect(lines[step0 + 1]!.startsWith("1. ")).toBe(true);
		expect(lines[step0]).toContain("at train start and again before each PR");
		expect(lines[step0]).toContain("lane_message");
		expect(lines[step0]).toContain("gh pr edit B --body-file");
		const rules = lines.find((l) => l.startsWith("Stacked PRs: "))!;
		for (const s of ["done-because", "chain: #101 → **#106** → #107", "gh pr edit B --base main", "reason `stack`", "without Jo's word"]) {
			expect(rules).toContain(s);
		}
		// rev 14's stack questions are gone: a stack problem is passed over, never asked
		expect(rules).not.toContain("retarget-done / skip / stop");
		expect(rules).not.toContain("options skip / stop");
		const source = readFileSync(join(import.meta.dir, "..", "src", "merge-train.ts"), "utf8");
		expect(source).not.toContain("sl-mt-stack adds");
		expect(source).not.toContain("goes here");
	});

	test("rev 17.1 part 1: step 1 computes stakes; normal stakes check, merge with --match-head-commit and verify, with no merged question", () => {
		const wl = "wl-mv8s8srodefytc";
		const brief = trainBrief(wl, [101]);
		const lines = brief.split("\n");
		const step1 = lines.find((l) => l.startsWith("1. "))!;
		expect(step1).toContain(`\`${RESOLVE_COMMAND} stakes --repo <owner/repo of this workload's origin> --pr <n>\``);
		const at = (prefix: string) => lines.findIndex((l) => l.startsWith(prefix));
		const [s7, check, merge, verify, record, production] = ["7. ", "   a. Check: ", "   b. Merge: ", "   c. Verify: ", "   d. Record: ", "   Production stakes: "].map(at);
		expect([s7, check, merge, verify, record, production].every((i, k, all) => i > -1 && (k === 0 || i === all[k - 1]! + 1))).toBe(true);
		expect(lines[s7]).toContain("Normal stakes merge with no question to Jo");
		for (const s of ["git fetch origin", "the sha the green run tested", "`MERGEABLE`", "git merge-base --is-ancestor origin/main <head>", "back to step 3"]) expect(lines[check]).toContain(s);
		expect(lines[merge]).toContain("`gh pr merge <n> -R <owner/repo> --merge --match-head-commit <head>`");
		expect(lines[verify]).toContain("`MERGED`");
		expect(lines[verify]).toContain("back to a. once; a second refusal on the same head: pass the PR over with reason `merge-refused`");
		expect(lines[record]).toContain("`merged by train <merge commit sha> (run <id>)`");
		// the merged / skip / stop question is production's only, and the train goes on while it is open
		expect(lines.filter((l) => l.includes("merged / skip / stop"))).toEqual([lines[production]!]);
		expect(lines[production]).toContain("go on to the next PR while it is open");
		const passed = lines.find((l) => l.startsWith("Passing a PR over"))!;
		for (const s of ["no question to Jo, nothing sent to the PR's owner", "$AS2_SCRATCH", "lane_record_entry `train-passed: pr <n> <reason> <absolute path of the detail file>`"]) expect(passed).toContain(s);
		// a red, a conflict and a second error pass the PR over; none asks Jo
		expect(lines.find((l) => l.startsWith("4. "))).toContain("pass the PR over with reason `conflict`");
		expect(lines.find((l) => l.startsWith("6. "))).toContain("pass the PR over with reason `red`");
		for (const old of ["resolve / skip / stop", "rerun / skip / stop", "retarget-done", "merge only by Jo", "owner delivery"]) expect(brief).not.toContain(old);
	});

	test("the brief names no PR B tool, and train-passed is no control prefix", () => {
		const brief = trainBrief("wl-mv8s8srodefytc", [101, 106]);
		for (const tool of ["lane_train_return", "train-task", "tick"]) expect(brief).not.toContain(tool);
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		ledger.recordEntry({ by: LANE, workloadId: wl, kind: "assumption", body: "train-passed: pr 101 red /tmp/as2/detail.md" });
		expect(controlEntries(ledger.entries(wl))).toEqual([]);
	});
});

/** A git checkout at a temp path whose origin is `url`, the `repo:` a workload is on. */
function checkout(url: string): string {
	const dir = tmp("stakes-repo");
	for (const args of [["init", "-q"], ["config", "remote.origin.url", url]]) {
		const r = Bun.spawnSync(["git", "-C", dir, ...args], { stdout: "pipe", stderr: "pipe" });
		if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
	}
	return dir;
}

/** A temp ledger with three workloads on checkouts: normal on the train repo, production on it, normal on another repo; and one with no repo:. */
function stakesWorld() {
	const { ledger, path } = tempLedger();
	const on = checkout("git@github.com:TheWolff/agent-system-2.0.git");
	const elsewhere = checkout("https://github.com/thewolff/newdle-web.git");
	const normal = workloadWithSlice(ledger).wl;
	const prod = workloadWithSlice(ledger, { stakes: "production" }).wl;
	const other = workloadWithSlice(ledger).wl;
	const bare = workloadWithSlice(ledger).wl;
	recordRepo(ledger, normal, on);
	recordRepo(ledger, prod, on);
	recordRepo(ledger, other, elsewhere);
	return { ledger, path, on, elsewhere, normal, prod, other, bare };
}

const REPO = "thewolff/agent-system-2.0";
const view = (over: Partial<StakesView> = {}): StakesView => ({
	number: 101, headRefName: "wl/wl-none", isCrossRepository: false, headRepository: { name: "agent-system-2.0" }, headRepositoryOwner: { login: "thewolff" }, ...over,
});

describe("prStakes (rev 17.1 D1): normal only for a same-repo wl/<id> branch whose workload is on the train repo at normal stakes", () => {
	test("each case: fork, other repo, non-wl branch, unknown id, workload repo mismatch, no repo:, production workload, normal", () => {
		const w = stakesWorld();
		const of = (over: Partial<StakesView>) => prStakes(view(over), REPO, w.ledger);
		expect(of({ isCrossRepository: true, headRefName: `wl/${w.normal}` })).toEqual({ stakes: "production", reason: "#101 comes from a fork" });
		expect(of({ headRefName: `wl/${w.normal}`, headRepositoryOwner: { login: "someone" } })).toEqual({
			stakes: "production", reason: `#101's head repository someone/agent-system-2.0 is not the train's ${REPO}`,
		});
		expect(of({ headRefName: `wl/${w.normal}`, headRepository: null })).toEqual({ stakes: "production", reason: `#101's head repository is unknown, not the train's ${REPO}` });
		expect(of({ headRefName: "plumb/fix-x" })).toEqual({ stakes: "production", reason: "#101's head branch plumb/fix-x is not wl/<workload id>" });
		expect(of({ headRefName: `wl/${w.normal}-x` }).stakes).toBe("production");
		expect(of({ headRefName: "wl/wl-nosuchid" })).toEqual({ stakes: "production", reason: "#101's branch names wl-nosuchid, which is no workload in the ledger" });
		expect(of({ headRefName: `wl/${w.other}` })).toEqual({
			stakes: "production", reason: `${w.other} is on ${w.elsewhere}, whose origin is thewolff/newdle-web, not ${REPO}`,
		});
		expect(of({ headRefName: `wl/${w.bare}` })).toEqual({ stakes: "production", reason: `${w.bare} has no repo: entry` });
		expect(of({ headRefName: `wl/${w.prod}` })).toEqual({ stakes: "production", reason: `${w.prod}'s stakes are production` });
		// owner/repo compares without case, as GitHub's does
		expect(of({ headRefName: `wl/${w.normal}`, headRepositoryOwner: { login: "TheWolff" } })).toEqual({ stakes: "normal", reason: `${w.normal} on ${REPO}, stakes normal` });
		expect(of({ headRefName: `wl/${w.normal}` }).stakes).toBe("normal");
	});

	test("a repo: entry a lane wrote does not count", () => {
		const w = stakesWorld();
		w.ledger.recordEntry({ by: LANE, workloadId: w.bare, kind: "assumption", body: `repo: ${w.on}` });
		expect(prStakes(view({ headRefName: `wl/${w.bare}` }), REPO, w.ledger)).toEqual({ stakes: "production", reason: `${w.bare} has no repo: entry` });
	});
});

describe("the stakes script, with a fake gh and a temp ledger", () => {
	const CLI = join(import.meta.dir, "..", "scripts", "merge-train.ts");
	const GH = `#!/bin/sh
dir="$(cd "$(dirname "$0")/.." && pwd)"
printf '%s\\n' "$*" >> "$dir/gh.log"
if [ "$1 $2" = "pr view" ] && [ -f "$dir/prs/$3.json" ]; then cat "$dir/prs/$3.json"; exit 0; fi
echo "no pull requests found" >&2
exit 1
`;
	function run(ledgerPath: string, views: StakesView[], ...args: string[]) {
		const root = tmp("train-stakes");
		mkdirSync(join(root, "bin"));
		mkdirSync(join(root, "prs"));
		writeFileSync(join(root, "bin", "gh"), GH);
		chmodSync(join(root, "bin", "gh"), 0o755);
		for (const v of views) writeFileSync(join(root, "prs", `${v.number}.json`), JSON.stringify(v));
		const r = Bun.spawnSync([process.execPath, CLI, ...args], {
			cwd: root, stdout: "pipe", stderr: "pipe",
			env: { PATH: `${join(root, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`, HOME: root, AGENT_SYSTEM_LEDGER_DB: ledgerPath },
		});
		const log = join(root, "gh.log");
		return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString(), calls: () => readFileSync(log, "utf8").trim().split("\n") };
	}

	test("normal and production, exit 0; one gh pr view with the D1 fields; the ledger is not written", () => {
		const w = stakesWorld();
		const before = w.ledger.entries(w.normal).length;
		const views = [view({ number: 101, headRefName: `wl/${w.normal}` }), view({ number: 102, headRefName: `wl/${w.prod}` })];
		const normal = run(w.path, views, "stakes", "--repo", REPO, "--pr", "101");
		expect([normal.code, normal.out, normal.err]).toEqual([0, "normal\n", ""]);
		expect(normal.calls()).toEqual([`pr view 101 -R ${REPO} --json number,headRefName,isCrossRepository,headRepository,headRepositoryOwner`]);
		const prod = run(w.path, views, "stakes", "--repo", REPO, "--pr", "102");
		expect([prod.code, prod.out]).toEqual([0, `production: ${w.prod}'s stakes are production\n`]);
		expect(w.ledger.entries(w.normal).length).toBe(before);
	});

	test("exit 2 on a usage error or a gh failure", () => {
		const w = stakesWorld();
		const usage = run(w.path, [], "stakes", "--repo", REPO);
		expect(usage.code).toBe(2);
		expect(usage.err).toContain("stakes: missing --pr");
		const gone = run(w.path, [], "stakes", "--repo", REPO, "--pr", "999");
		expect(gone.code).toBe(2);
		expect(gone.err).toContain("no pull requests found");
	});
});

describe("train <wl-…> <N…> adds to a train; parsing and refusals (§ 1)", () => {
	test("append keeps the order 101, 106, 139; a PR already on the train is refused", () => {
		const { ledger, wl } = train();
		const cmd = interpret(ledger, `train ${wl} #139`)!;
		expect(cmd).toEqual({ kind: "train-append", workloadId: wl, prs: [139] });
		const receipt = apply(ledger, cmd);
		const ins = ledger.instructions(wl).at(-1)!;
		expect(ins).toMatchObject({ body: `train ${wl} 139`, author: "jo", created_by: SURFACE_BY });
		expect(receipt).toStartWith(`added #139 to merge train ${wl} (instruction ${ins.id}); order 101, 106, 139`);
		expect(trainPrs(ledger.entries(wl), ledger.instructions(wl))).toEqual([101, 106, 139]);
		expect(boundPrs(ledger.entries(wl), ledger.instructions(wl)).map((b) => b.pr)).toEqual([101, 106, 139]);
		const why = `#106 is already on train ${wl}; a skipped PR gets a new train: \`train 106\``;
		expect(interpret(ledger, `train ${wl} 140 106`)).toEqual({ kind: "refused", why });
		// apply checks again: a PR put on the train since the reading is refused, writing nothing
		const late = interpret(ledger, `train ${wl} 141`)!;
		apply(ledger, interpret(ledger, `train ${wl} 141`)!);
		const before = ledger.instructions(wl).length;
		expect(() => apply(ledger, late)).toThrow(`#141 is already on train ${wl}`);
		expect(ledger.instructions(wl)).toHaveLength(before);
	});

	test("refused, never prose: a non-train, standing, closed or unknown workload, `train foo`, no number, a bad number, too many", () => {
		const { ledger, wl } = train();
		const plain = ledger.openWorkload({ by: SURFACE_BY, brief: "Fix", stakes: "normal", mode: "autonomous" });
		ensureStandingWorkload(ledger);
		const closed = ledger.openWorkload({ by: SURFACE_BY, brief: "Closed", stakes: "normal", mode: "autonomous" });
		ledger.closeWorkload(closed, { by: SURFACE_BY });
		const usage = "train <N> [<N> …] opens a merge train; train <wl-…> <N> [<N> …] adds PRs to one";
		const cases: [string, string][] = [
			[`train ${plain} 139`, `${plain} is not a merge train (no train: entry from Jo's train word); open one with train <N> [<N> …]`],
			[`train ${STANDING_WORKLOAD_ID} 139`, "the standing workload is never a merge train"],
			[`train ${closed} 139`, `${closed} is closed: only an open merge train takes PRs`],
			["train wl-nope 139", "no workload wl-nope"],
			["train foo", `foo is not a PR number (a positive whole number, # allowed): ${usage}`],
			[`train ${wl}`, `train names at least one PR number: ${usage}`],
			["train 101 0", `0 is not a PR number (a positive whole number, # allowed): ${usage}`],
			["train 079", `079 is not a PR number (a positive whole number, # allowed): ${usage}`],
			["train q-abc 101", `q-abc is not a PR number (a positive whole number, # allowed): ${usage}`],
			[`train ${Array.from({ length: 51 }, (_, k) => k + 1).join(" ")}`, "train takes at most 50 PRs at once; 51 named"],
		];
		for (const [text, why] of cases) {
			expect(commandShaped(text)).toBe(true);
			const cmd = interpret(ledger, text);
			expect(cmd).toEqual({ kind: "refused", why });
			expect(() => apply(ledger, cmd!)).toThrow("refused, never applied");
		}
		expect(maxWords("train 1 2 3 4 5")).toBe(Number.POSITIVE_INFINITY);
	});

	test("a train word inside a numbered batch is refused, on one line and in a paste; `1 train` stays an answer piece", () => {
		const { ledger, wl } = train();
		const q = ask(ledger, wl, trainSliceId(wl, 101), ["train", "later"]);
		const n = numbered(ledger);
		for (const text of ["1 train 106", "1 later, train 106", `1 later, 2 train ${wl} 139`]) {
			expect(commandShaped(text)).toBe(true);
			expect(interpretBatch(ledger, n, text)).toEqual({ ok: false, lines: [TRAIN_IN_BATCH] });
		}
		const pasted = interpretPaste(ledger, n, "1 train 106\nthen go");
		expect(pasted).toMatchObject({ ok: false, refused: [{ line: 1, text: "1 train 106", why: [TRAIN_IN_BATCH] }] });
		expect(interpretBatch(ledger, n, "1 train")).toMatchObject({ ok: true, items: [{ n: 1, cmd: { kind: "answer", questionId: q, answer: "train" } }] });
		expect(interpretBatch(ledger, n, "train 106, 139")).toBeNull();
	});

	test("bare `train` and `train q-…` answer an open question that offers train", () => {
		const { ledger, wl } = train();
		const q = ask(ledger, wl, trainSliceId(wl, 101), ["train", "later"]);
		expect(interpret(ledger, "train")).toEqual({ kind: "answer", workloadId: wl, questionId: q, answer: "train" });
		expect(interpret(ledger, `train ${q}`)).toEqual({ kind: "answer", workloadId: wl, questionId: q, answer: "train" });
		expect(apply(ledger, interpret(ledger, `train ${q}`)!)).toStartWith(`answered ${q} with "train"`);
	});
});

describe("the surface routes launch the new train and a stopped train on Jo's append (§ 1)", () => {
	test("the single-line route opens the train in the surface's cwd and launches the new id", async () => {
		const f = fakePi(undefined, { exec: true });
		const e = env();
		orchestratorSurface(f.pi, e, {});
		notices.length = 0;
		const cwd = tmp("train-cwd");
		await f.emit("before_agent_start", { prompt: "train 101, #106", systemPrompt: [] }, ctxOf({ cwd }));
		const l = open(e);
		const [w] = l.inFlight().map((x) => x.workload).filter((x) => x.id !== STANDING_WORKLOAD_ID);
		expect(w!.brief).toBe(trainBrief(w!.id, [101, 106]));
		expect(repoOf(l, w!.id)).toBe(cwd);
		expect(notices[0]).toContain(`opened merge train ${w!.id} for #101, #106`);
		expect(f.execs.calls).toHaveLength(1);
		expect(f.execs.calls[0]!.args.slice(1)).toEqual(["launch", w!.id, "--requested-by", "jo"]);
		l.close();
	});

	test("the paste route opens the train and launches the new id", async () => {
		const f = fakePi(undefined, { exec: true });
		const e = env();
		orchestratorSurface(f.pi, e, {});
		notices.length = 0;
		await f.emit("before_agent_start", { prompt: "train 139 140\nmerge them in that order", systemPrompt: [] }, ctxOf());
		const l = open(e);
		const [w] = l.inFlight().map((x) => x.workload).filter((x) => x.id !== STANDING_WORKLOAD_ID);
		expect(trainPrs(l.entries(w!.id), l.instructions(w!.id))).toEqual([139, 140]);
		expect(f.execs.calls.map((c) => c.args.slice(1))).toEqual([["launch", w!.id, "--requested-by", "jo"]]);
		l.close();
	});

	test("stop answered, the lane released, then `train wl-… 139` writes Jo's launch-requested: and the trigger launches it", async () => {
		const f = fakePi(undefined, { exec: true });
		const e = env();
		const seed = open(e);
		const cmd = interpret(seed, "train 101 106");
		if (cmd?.kind !== "train") throw new Error("not a train");
		const wl = applyTrain(seed, cmd, tmp("train-repo")).workloadId;
		seed.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: `launch: ${LANE} cause first requested-by jo` });
		expect(seed.claimWorkload(wl, { by: LANE_STARTER_BY, holder: LANE, leaseMs: 600_000 }).won).toBe(true);
		const q = ask(seed, wl, trainSliceId(wl, 101), ["merged", "skip", "stop"]);
		seed.answerQuestion(q, { ...JO, answer: "stop" });
		seed.releaseWorkload(wl, { by: LANE, holder: LANE });
		seed.close();
		orchestratorSurface(f.pi, e, {});
		await f.emit("before_agent_start", { prompt: `train ${wl} 139`, systemPrompt: [] }, ctxOf());
		const l = open(e);
		const requests = controlEntries(l.entries(wl)).filter((c) => c.prefix === "launch-requested");
		expect(requests.map((r) => r.body)).toEqual([expect.stringMatching(/^launch-requested: by jo at \S+ \(train append\)$/)]);
		expect(f.execs.calls.map((c) => c.args.slice(1))).toEqual([["launch", wl, "--requested-by", "jo"]]);
		l.close();
	});

	test("an append while a lane holds the train live requests no relaunch", () => {
		const { ledger, wl } = train();
		expect(ledger.claimWorkload(wl, { by: LANE_STARTER_BY, holder: LANE, leaseMs: 600_000 }).won).toBe(true);
		expect(apply(ledger, interpret(ledger, `train ${wl} 139`)!)).not.toContain("relaunch");
		expect(controlEntries(ledger.entries(wl)).some((c) => c.prefix === "launch-requested")).toBe(false);
	});
});

describe("the train hold (§ 1 D4), on a temp ledger", () => {
	test("an open question on another PR's train slice no longer holds a run, whatever its options; Jo's stop still does", () => {
		const { ledger, c, wl } = train();
		expect(holdOf(ledger, wl)).toBeNull();
		for (const options of [["merged", "skip", "stop"], ["resolve", "skip", "stop"], ["rerun", "skip", "stop"]]) {
			const sl = options[0] === "rerun" ? trainFullSliceId(wl, 101, 1) : trainSliceId(wl, 101);
			const q = ask(ledger, wl, sl, options);
			expect(holdOf(ledger, wl)).toBeNull();
			c.plusHours(0.01);
			ledger.answerQuestion(q, { ...JO, answer: options[0]! });
			c.plusHours(0.01);
			expect(holdOf(ledger, wl)).toBeNull();
		}
		const stop = ask(ledger, wl, trainSliceId(wl, 106), ["merged", "skip", "stop"]);
		ledger.answerQuestion(stop, { ...JO, answer: "stop" });
		expect(holdOf(ledger, wl)).toBe(`merge train stopped by Jo at #106 (${stop}); \`train ${wl} <N…>\` resumes it`);
	});

	test("a stop holds every PR until a newer train: entry, even after a later merged answer", () => {
		const { ledger, c, wl } = train([101, 106, 120]);
		const q = ask(ledger, wl, trainSliceId(wl, 101), ["merged", "skip", "stop"]);
		ledger.answerQuestion(q, { ...JO, answer: "stop" });
		c.plusHours(0.01);
		const stopped = `merge train stopped by Jo at #101 (${q}); \`train ${wl} <N…>\` resumes it`;
		expect(holdOf(ledger, wl)).toBe(stopped);
		const later = ask(ledger, wl, trainSliceId(wl, 120), ["merged", "skip", "stop"]);
		c.plusHours(0.01);
		ledger.answerQuestion(later, { ...JO, answer: "merged" });
		c.plusHours(0.01);
		expect(holdOf(ledger, wl)).toBe(stopped);
		apply(ledger, interpret(ledger, `train ${wl} 139`)!);
		c.plusHours(0.01);
		expect(holdOf(ledger, wl)).toBeNull();
		// a lane's stop answer, or a stop on a slice that is no train slice, holds nothing
		const lane = ask(ledger, wl, trainSliceId(wl, 139), ["merged", "skip", "stop"]);
		ledger.answerQuestion(lane, { by: LANE, author: LANE, channel: "direct", answer: "stop" });
		const other = ask(ledger, wl, "sl-other-1", ["go", "stop"]);
		c.plusHours(0.01);
		ledger.answerQuestion(other, { ...JO, answer: "stop" });
		expect(holdOf(ledger, wl)).toBeNull();
	});

	test("rows in the same millisecond: an append after Jo's stop clears the hold; a stop after an append still holds", () => {
		// The train's clock is not advanced between the two rows, so both carry the same created_at; only instruction order decides.
		const resumed = train([101, 106]);
		const q = ask(resumed.ledger, resumed.wl, trainSliceId(resumed.wl, 101), ["merged", "skip", "stop"]);
		resumed.ledger.answerQuestion(q, { ...JO, answer: "stop" });
		apply(resumed.ledger, interpret(resumed.ledger, `train ${resumed.wl} 139`)!);
		const [stopAnswer, append] = [resumed.ledger.instructions(resumed.wl).find((i) => i.question_id === q)!, resumed.ledger.instructions(resumed.wl).at(-1)!];
		expect(append.body).toBe(`train ${resumed.wl} 139`);
		expect(stopAnswer.created_at).toBe(append.created_at);
		expect(holdOf(resumed.ledger, resumed.wl)).toBeNull();

		const held = train([101, 106]);
		const q2 = ask(held.ledger, held.wl, trainSliceId(held.wl, 101), ["merged", "skip", "stop"]);
		apply(held.ledger, interpret(held.ledger, `train ${held.wl} 139`)!);
		held.ledger.answerQuestion(q2, { ...JO, answer: "stop" });
		const [append2, stop2] = held.ledger.instructions(held.wl).slice(-2);
		expect(append2!.body).toBe(`train ${held.wl} 139`);
		expect(stop2!.created_at).toBe(append2!.created_at);
		expect(holdOf(held.ledger, held.wl)).toBe(`merge train stopped by Jo at #101 (${q2}); \`train ${held.wl} <N…>\` resumes it`);
	});

	test("a non-train workload is never held; train A's stop does not hold train B", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const k = wl.replace(/^wl-/, "");
		const q = ask(ledger, wl, `sl-train-${k}-101`, ["merged", "skip", "stop"]);
		ledger.answerQuestion(q, { ...JO, answer: "stop" });
		expect(holdOf(ledger, wl)).toBeNull();

		const a = train([101, 106]);
		const bCmd = interpret(a.ledger, "train 101 106");
		if (bCmd?.kind !== "train") throw new Error("not a train");
		const b = applyTrain(a.ledger, bCmd, a.repo).workloadId;
		// the same PR on two trains gets both trains' slices
		const qa = ask(a.ledger, a.wl, trainSliceId(a.wl, 101), ["merged", "skip", "stop"]);
		a.ledger.addSlice({ by: LANE, workloadId: b, id: trainSliceId(b, 101), task: "t", doneCondition: "d", inputs: "i" });
		a.ledger.answerQuestion(qa, { ...JO, answer: "stop" });
		expect(holdOf(a.ledger, a.wl)).toContain(qa);
		expect(holdOf(a.ledger, b)).toBeNull();
	});
});

describe("the skip close (§ 1)", () => {
	/** A red run done on PR 101's first suite slice, then the lane's rerun / skip / stop question on its disposition slice. */
	function redThenAsk(ledger: Ledger, wl: string) {
		const disposition = trainSliceId(wl, 101);
		const full = trainFullSliceId(wl, 101, 1);
		ledger.addSlice({ by: LANE, workloadId: wl, id: disposition, task: "PR #101", doneCondition: "terminal", inputs: "#101" });
		ledger.addSlice({ by: LANE, workloadId: wl, id: full, task: "suite #101", doneCondition: "green", inputs: "#101" });
		const req = { runId: makeRunId(Date.parse("2026-10-01T10:00:00.000Z"), "abcd"), pr: 101, sha: SHA_A, slice: full, by: LANE };
		ledger.recordEntry({ by: "test-runner", workloadId: wl, sliceId: full, kind: "assumption", body: testRequestedBody(req) });
		ledger.recordEntry({
			by: "test-runner", workloadId: wl, sliceId: full, kind: "assumption",
			body: testRunBody({ ...runnerDiedRun(req), verdict: "red", reason: null, full: { pass: 1, fail: 1, skip: 0, exit: 1, ms: 10, error: null }, failures: [{ part: "full", name: "x", firstError: "boom" }] }),
		});
		const q = ask(ledger, wl, disposition, ["rerun", "skip", "stop"]);
		return { disposition, full, q };
	}

	test("Jo's skip cancels the PR's disposition and suite slices and withdraws nothing else; no slice stays open", () => {
		const { ledger, wl } = train();
		const other = train();
		const elsewhere = ask(other.ledger, other.wl, trainSliceId(other.wl, 106), ["merged", "skip", "stop"]);
		const { disposition, full, q } = redThenAsk(ledger, wl);
		const receipt = apply(ledger, interpret(ledger, `skip ${q}`)!);
		expect(receipt).toContain(`merge train: Jo skipped #101: cancelled ${disposition}, cancelled ${full}`);
		expect(ledger.slice(disposition)!.state).toBe("cancelled");
		expect(ledger.slice(full)!.state).toBe("cancelled");
		expect(ledger.slices(wl).filter((s) => s.state === "open" || s.state === "paused")).toEqual([]);
		expect(ledger.question(q)!.state).toBe("answered");
		expect(other.ledger.question(elsewhere)!.state).toBe("open");
		expect(ledger.questions(wl).filter((x) => x.state === "withdrawn")).toEqual([]);
	});

	test("Jo's skip keeps a suite slice whose run is live open, named in the receipt, and cancels the disposition slice", () => {
		const { ledger, wl } = train();
		const disposition = trainSliceId(wl, 101);
		const full = trainFullSliceId(wl, 101, 1);
		ledger.addSlice({ by: LANE, workloadId: wl, id: disposition, task: "PR #101", doneCondition: "terminal", inputs: "#101" });
		ledger.addSlice({ by: LANE, workloadId: wl, id: full, task: "suite #101", doneCondition: "green", inputs: "#101" });
		const runId = makeRunId(Date.parse(ledger.now()), "beef");
		ledger.recordEntry({ by: "test-runner", workloadId: wl, sliceId: full, kind: "assumption", body: testRequestedBody({ runId, pr: 101, sha: SHA_A, slice: full, by: LANE }) });
		const q = ask(ledger, wl, disposition, ["rerun", "skip", "stop"]);
		const beat = () => Date.parse(ledger.now());
		const receipt = apply(ledger, interpret(ledger, `skip ${q}`, beat)!, beat);
		expect(receipt).toContain(`merge train: Jo skipped #101: cancelled ${disposition}, kept ${full} open: test run ${runId} is live; it settles the slice`);
		expect(ledger.question(q)!.state).toBe("answered");
		expect(ledger.slice(disposition)!.state).toBe("cancelled");
		expect(ledger.slice(full)!.state).toBe("open");
	});

	test("a launched lane's question on the disposition slice, answered skip with no lane holding it live, requests one relaunch", () => {
		const { ledger, wl } = train();
		ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: `launch: ${LANE} cause first requested-by jo` });
		const { disposition, q } = redThenAsk(ledger, wl);
		const receipt = apply(ledger, interpret(ledger, `skip ${q}`)!);
		expect(ledger.slice(disposition)!.state).toBe("cancelled");
		expect(receipt).toContain("no lane holds it live, so a relaunch is requested");
		const requests = ledger.entries(wl).filter((e) => e.body.startsWith("launch-requested:"));
		expect(requests.map((e) => [e.created_by, e.body])).toEqual([[SURFACE_BY, expect.stringMatching(/^launch-requested: by jo at \S+ \(train skip #101\)$/)]]);
	});

	test("a launched lane's question on a suite slice kept open by its live run, answered skip, requests no relaunch", () => {
		const { ledger, wl } = train();
		ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: wl, kind: "assumption", body: `launch: ${LANE} cause first requested-by jo` });
		const disposition = trainSliceId(wl, 101);
		const full = trainFullSliceId(wl, 101, 1);
		ledger.addSlice({ by: LANE, workloadId: wl, id: disposition, task: "PR #101", doneCondition: "terminal", inputs: "#101" });
		ledger.addSlice({ by: LANE, workloadId: wl, id: full, task: "suite #101", doneCondition: "green", inputs: "#101" });
		const runId = makeRunId(Date.parse(ledger.now()), "cafe");
		ledger.recordEntry({ by: "test-runner", workloadId: wl, sliceId: full, kind: "assumption", body: testRequestedBody({ runId, pr: 101, sha: SHA_A, slice: full, by: LANE }) });
		const q = ask(ledger, wl, full, ["skip", "stop"]);
		const beat = () => Date.parse(ledger.now());
		const receipt = apply(ledger, interpret(ledger, `skip ${q}`, beat)!, beat);
		expect(receipt).toContain(`kept ${full} open: test run ${runId} is live`);
		expect(receipt).not.toContain("relaunch");
		expect(ledger.slice(full)!.state).toBe("open");
		expect(ledger.entries(wl).filter((e) => e.body.startsWith("launch-requested:"))).toEqual([]);
	});

	test("skip on a non-train workload's question cancels nothing", () => {
		const { ledger } = tempLedger(clock().now);
		const { wl, sl } = workloadWithSlice(ledger);
		const { disposition, full, q } = redThenAsk(ledger, wl);
		apply(ledger, interpret(ledger, `skip ${q}`)!);
		expect(ledger.slice(disposition)!.state).toBe("open");
		expect(ledger.slice(full)!.state).toBe("open");
		expect(ledger.slice(sl)!.state).toBe("open");
	});
});

describe("the train skip in the close check (§ 1)", () => {
	/** PR 101 in the close set as `closeFreshness` reads it, its trainSkipped computed from the ledger. */
	function pr101(ledger: Ledger, wl: string, over: Partial<ClosePr> = {}): ClosePr {
		return {
			number: 101, state: "OPEN", headRefName: "feature/x", headSha: SHA_A, result: { runId: "tr-red-1", verdict: "red", sha: SHA_A },
			headCompare: null, candidateCompare: null, waivedRun: null,
			trainSkipped: trainSkippedOf(101, ledger.entries(wl), ledger.questions(wl), ledger.instructions(wl)), ...over,
		};
	}
	const facts = (prs: ClosePr[]) => ({ failure: null, branch: "wl/wl-t", candidate: { sha: SHA_B, changed: [] }, prs });

	test("an OPEN red PR Jo skipped on the train passes, named in the why", () => {
		const { ledger, wl } = train();
		const q = ask(ledger, wl, trainSliceId(wl, 101), ["rerun", "skip", "stop"]);
		apply(ledger, interpret(ledger, `skip ${q}`)!);
		expect(closeFreshness(facts([pr101(ledger, wl)]))).toEqual({ close: true, why: `every PR in the set is green at its head; skipped by Jo on the train: #101 (${q})` });
		// an OPEN PR whose head moved after its green, skipped, passes too
		const moved = pr101(ledger, wl, { headSha: SHA_B, result: { runId: "tr-green-1", verdict: "green", sha: SHA_A } });
		expect(closeFreshness(facts([moved])).close).toBe(true);
	});

	test("refused: no skip, a lane-authored skip, a skip on a non-train workload", () => {
		const refusal = { close: false, reason: "PR #101's newest test-run tr-red-1 is red: fix it and call lane_full_test (a waiver passes only a merged PR)" };
		const none = train();
		expect(closeFreshness(facts([pr101(none.ledger, none.wl)]))).toEqual(refusal);

		const lane = train();
		const lq = ask(lane.ledger, lane.wl, trainSliceId(lane.wl, 101), ["rerun", "skip", "stop"]);
		lane.ledger.answerQuestion(lq, { by: LANE, author: LANE, channel: "direct", answer: "skip" });
		expect(closeFreshness(facts([pr101(lane.ledger, lane.wl)]))).toEqual(refusal);

		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const nq = ask(ledger, wl, `sl-train-${wl.replace(/^wl-/, "")}-101`, ["rerun", "skip", "stop"]);
		apply(ledger, interpret(ledger, `skip ${nq}`)!);
		expect(closeFreshness(facts([pr101(ledger, wl)]))).toEqual(refusal);
	});
});
