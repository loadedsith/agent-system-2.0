// The merge-train workload kind (PLAN wl-mv8s8srodefytc rev 17.1 § 1, part 1): Jo's `train <N> [<N> …]` opens a
// workload that takes green PRs one at a time, merges main in without rebasing, lets the resolver
// (surface/scripts/merge-train.ts) fix the conflicts it knows, runs the full suite, then merges a normal-stakes PR
// itself and asks Jo about a production-stakes one; a PR it cannot land is passed over with a `train-passed:` entry.
// This module holds the procedure text the lane reads as its brief (`trainBrief`), a PR's stakes (`prStakes`, D1; it
// reads the ledger and the `repo:` checkout's origin), the check on main's protection (`mainProtectionGap`, D2), the
// bodies of Jo's instruction and the surface's `train:` entry, the train's PR order (`trainPrs`), the slice id rule
// (`sl-train-<k>-<n>`, `sl-train-<k>-<n>-full-<r>`, where
// `<k>` is the train's workload id without its `wl-`), the stop hold the test runner's starter applies (`trainHold`)
// and the skip the close check honours (`trainSkippedOf`). The word itself is parsed and applied in
// surface/src/input.ts; the starter evaluates the hold in surface/scripts/test-runner.ts `cmdStart`.
import type { EntryRow, InstructionRow, Ledger, QuestionRow } from "../../ledger/src/index";
import { controlEntries, prBindingInstructionBody, prBindings } from "./launch";
import { DEFAULT_BRANCH } from "./merge-train-stack";
import { ownerRepoOf } from "./test-run";
import { SURFACE_BY } from "./types";

/**
 * The commit status the test runner posts on exactly a run's sha in the PR's repo (PLAN wl-mv8s8srodefytc rev 17.1 D2), for
 * every PR: branch protection on main requires it, so no merge, the train's or Jo's, lands a head without a green from the runner.
 */
export const FULL_SUITE_STATUS = "as2/full-suite";

/** The `done:` line of every merge train (§ 1): what is true when the train is over. */
export const TRAIN_DONE =
	"Every PR on this merge train is terminal (merged by the train or by Jo, skipped because it was merged or closed or its branch had a live lane, or cancelled by Jo's skip) with no train slice left open, and done-because lists each PR's outcome.";

/** The full-suite failures Jo named as known flakes (§ 0): a run whose every failure is one of these is rerun once. */
export const KNOWN_FLAKES: readonly string[] = [
	"surface/test/lane-model-script.test.ts T2p",
	"surface/test/lane-model-script.test.ts T8a-p",
	"surface/test/lane-model-script.test.ts T8b-p",
];

/**
 * The resolver the procedure runs (§ 3): `order`, `resolve`, `convert`, `check`; exit 0 ok, 3 a conflict outside its set, 4 it
 * cannot fix without losing an edit, 2 usage or a git process failure. The train's own copy, by its lane worktree's path: an
 * older PR branch may lack the script, and the script reads the repo from its cwd (the PR worktree).
 */
export const RESOLVE_COMMAND = "bun <your lane worktree>/surface/scripts/merge-train.ts";

/** A train slice id: `sl-train-<k>-<n>` or `sl-train-<k>-<n>-full-<r>`; group 1 is `<k>` (the train's workload id without `wl-`), group 2 the PR number. */
export const TRAIN_SLICE_RE = /^sl-train-([a-z0-9]+)-([1-9]\d*)(?:-full-[1-9]\d*)?$/;

/** PR `n`'s disposition slice on train `wl`: `sl-train-<k>-<n>`. */
export function trainSliceId(wl: string, n: number): string {
	return `sl-train-${wl.replace(/^wl-/, "")}-${n}`;
}

/** PR `n`'s `r`th full-suite slice on train `wl`: `sl-train-<k>-<n>-full-<r>`. */
export function trainFullSliceId(wl: string, n: number, r: number): string {
	return `${trainSliceId(wl, n)}-full-${r}`;
}

/** The PR a train slice of `wl` is for, or null: a slice of another train, or no train slice at all, is never this train's. */
export function trainSlicePr(sliceId: string, wl: string): number | null {
	const m = TRAIN_SLICE_RE.exec(sliceId);
	return m && `wl-${m[1]}` === wl ? Number(m[2]) : null;
}

/** Jo's words for `train`, opening or adding to train `wl`: the instruction body `train:` names. */
export function trainInstructionBody(wl: string, prs: readonly number[]): string {
	return prBindingInstructionBody("train", wl, prs);
}

/** `train: <N> [<N> …] <instruction id>`: the surface's record on the train, written after Jo's instruction in one transaction. */
export function trainBody(prs: readonly number[], instructionId: string): string {
	return `train: ${prs.join(" ")} ${instructionId}`;
}

/** The train's PRs in order: every valid `train:` entry oldest first, each in Jo's order (`prBindings`); empty on a workload that is no merge train. */
export function trainPrs(entries: readonly EntryRow[], instructions: readonly InstructionRow[]): number[] {
	const out: number[] = [];
	for (const b of prBindings(entries, instructions, ["train"])) for (const pr of b.prs) if (!out.includes(pr)) out.push(pr);
	return out;
}

/** Jo's answer resolving `q` with `word`: an `answer` instruction by author jo written by the surface, the question's resolver; else null. */
function joAnswer(q: QuestionRow, instructions: readonly InstructionRow[], word: string): InstructionRow | null {
	if (q.state !== "answered" || q.resolved_by === null) return null;
	const ins = instructions.find((i) => i.id === q.resolved_by);
	if (!ins || ins.kind !== "answer" || ins.question_id !== q.id || ins.author !== "jo" || ins.created_by !== SURFACE_BY) return null;
	return ins.body.trim().toLowerCase() === word ? ins : null;
}

/** A train workload's rows, as one transaction reads them. */
export interface TrainRows {
	entries: readonly EntryRow[];
	instructions: readonly InstructionRow[];
	questions: readonly QuestionRow[];
}

/**
 * Why the test runner refuses `lane_full_test` on this workload now (§ 1 D4, the train's stop hold), or null.
 * A workload with no valid `train:` entry is never held. On a train, a question on any of its train slices answered
 * `stop` by Jo holds every PR unless the newest `train:` entry's instruction comes after that answer in
 * `rows.instructions`, the ledger's order (created_at, then rowid), so Jo's train word in the same millisecond as the
 * stop still resumes it; Jo's train word is the only resume, so later answers on other questions do not clear it; the
 * newest stop, in the same order, is the one named. An open question holds nothing: the train goes on to the next PR
 * while a production PR's question is open. A slice of another train (`trainSlicePr`) never holds this one. Pass the
 * rows read in the starter's reservation transaction, so a stop answered between admission and reservation still holds.
 */
export function trainHold(rows: TrainRows): string | null {
	const train = prBindings(rows.entries, rows.instructions, ["train"]);
	if (train.length === 0) return null;
	const newest = Math.max(...train.map((b) => rows.instructions.findIndex((i) => i.id === b.instructionId)));
	let stop: { q: QuestionRow; n: number; at: number } | null = null;
	for (const q of rows.questions) {
		const n = trainSlicePr(q.slice_id, q.workload_id);
		const ins = n === null ? null : joAnswer(q, rows.instructions, "stop");
		if (n === null || ins === null) continue;
		const at = rows.instructions.indexOf(ins);
		if (at < newest) continue;
		if (stop === null || at > stop.at) stop = { q, n, at };
	}
	return stop === null ? null : `merge train stopped by Jo at #${stop.n} (${stop.q.id}); \`train ${stop.q.workload_id} <N…>\` resumes it`;
}

/** `gh pr view <n> --json number,headRefName,isCrossRepository,headRepository,headRepositoryOwner`, the fields `prStakes` reads. */
export interface StakesView {
	number: number;
	headRefName: string;
	isCrossRepository: boolean;
	headRepository: { name: string } | null;
	headRepositoryOwner: { login: string } | null;
}

/** A PR's stakes on a merge train (D1): `normal` merges itself, `production` asks Jo; `reason` says why. */
export interface PrStakes {
	stakes: "normal" | "production";
	reason: string;
}

/** A same-repo workload branch: `wl/<workload id>`; group 1 is the id. */
const WORKLOAD_BRANCH_RE = /^wl\/(wl-[a-z0-9]+)$/;

/** The GitHub `owner/repo` of a checkout's origin (`git -C <path> config --get remote.origin.url`, then `ownerRepoOf`), or null. */
function checkoutOwnerRepo(path: string): string | null {
	const r = Bun.spawnSync(["git", "-C", path, "config", "--get", "remote.origin.url"], { stdout: "pipe", stderr: "pipe" });
	const url = r.stdout.toString().trim();
	return r.exitCode === 0 && url ? ownerRepoOf(url) : null;
}

/**
 * PR `view`'s stakes on the train whose repository is `trainRepo` (`owner/repo`; D1). Normal only when all hold: the PR
 * is no fork (`isCrossRepository` false), its head repository is `trainRepo`, its head branch is `wl/<id>`, `<id>` is a
 * ledger workload whose `repo:` entry (the surface's, read as `controlEntries` reads it) is a checkout whose origin is
 * `trainRepo`, and that workload's stakes are normal. Every other case is production. `owner/repo` compares without
 * case, as GitHub does (`servedRepo`).
 */
export function prStakes(view: StakesView, trainRepo: string, ledger: Pick<Ledger, "workload" | "entries">): PrStakes {
	const production = (reason: string): PrStakes => ({ stakes: "production", reason });
	const want = trainRepo.toLowerCase();
	const n = `#${view.number}`;
	if (view.isCrossRepository) return production(`${n} comes from a fork`);
	const head = view.headRepository && view.headRepositoryOwner ? `${view.headRepositoryOwner.login}/${view.headRepository.name}` : null;
	if (head?.toLowerCase() !== want) return production(`${n}'s head repository ${head ?? "is unknown"}${head ? " is not" : ", not"} the train's ${trainRepo}`);
	const id = WORKLOAD_BRANCH_RE.exec(view.headRefName)?.[1];
	if (id === undefined) return production(`${n}'s head branch ${view.headRefName} is not wl/<workload id>`);
	const w = ledger.workload(id);
	if (!w) return production(`${n}'s branch names ${id}, which is no workload in the ledger`);
	const path = controlEntries(ledger.entries(id)).filter((c) => c.prefix === "repo").at(-1)?.rest ?? null;
	if (path === null) return production(`${id} has no repo: entry`);
	const origin = checkoutOwnerRepo(path);
	if (origin?.toLowerCase() !== want) return production(`${id} is on ${path}, whose origin is ${origin ?? "no GitHub repository"}, not ${trainRepo}`);
	if (w.stakes !== "normal") return production(`${id}'s stakes are ${w.stakes}`);
	return { stakes: "normal", reason: `${id} on ${trainRepo}, stakes normal` };
}

/**
 * Why main's protection is unverified (D2), or null when it holds: among the active rules on main
 * (`gh api repos/<owner/repo>/rules/branches/main`, GitHub's "Get rules for a branch", which needs only metadata read), one
 * `required_status_checks` rule names FULL_SUITE_STATUS and is strict (`strict_required_status_checks_policy`: the branch
 * must be up to date). Classic branch protection is not read: its `strict` needs administration read, which the lanes'
 * credentials lack, and "Get a branch" leaves it out. Without that rule a self-merge could land a head tested on an old main.
 */
export function mainProtectionGap(rules: unknown): string | null {
	if (!Array.isArray(rules)) return "the rules read is not a list";
	type Check = { type?: unknown; parameters?: { required_status_checks?: unknown; strict_required_status_checks_policy?: unknown } };
	const checks = (rules as Check[]).filter((r) => r?.type === "required_status_checks");
	if (checks.length === 0) return `no active rule on ${DEFAULT_BRANCH} requires status checks`;
	const named = checks.filter((r) => {
		const required = r.parameters?.required_status_checks;
		return Array.isArray(required) && required.some((c) => c?.context === FULL_SUITE_STATUS);
	});
	if (named.length === 0) return `no required status check on ${DEFAULT_BRANCH} names ${FULL_SUITE_STATUS}`;
	if (!named.some((r) => r.parameters?.strict_required_status_checks_policy === true)) return `the rule requiring ${FULL_SUITE_STATUS} on ${DEFAULT_BRANCH} is not strict (a branch need not be up to date)`;
	return null;
}

/**
 * The question Jo answered `skip` on for PR `pr` on this train (§ 1, the skip in the close check), or null:
 * the workload carries a valid `train:` entry and Jo's `skip` (author jo, written by the surface) resolves
 * a question on one of this train's slices of that PR. A lane-written answer, or a `skip` on a workload
 * that is no train, never counts. The close check treats such a PR like a closed one.
 */
export function trainSkippedOf(pr: number, entries: readonly EntryRow[], questions: readonly QuestionRow[], instructions: readonly InstructionRow[]): string | null {
	if (prBindings(entries, instructions, ["train"]).length === 0) return null;
	const q = questions.find((x) => trainSlicePr(x.slice_id, x.workload_id) === pr && joAnswer(x, instructions, "skip") !== null);
	return q?.id ?? null;
}

/**
 * The lane's brief for train `wl` opened on `prs` (§ 2, rev 17.1 part 1): the header, each PR's slice ids, and the codified
 * procedure, numbered, with the real slice ids of this train and the resolver's command. Step 7 lands a green PR: one
 * readiness check for both stakes (the tested head, mergeable, main contained), the stakes read again, then a normal PR
 * merges itself (merge with `--match-head-commit`, verify, record) and a production PR gets Jo's merged / skip / stop
 * question while the train goes on. A moved head goes back to step 2's fresh worktree, a moved main to step 3. A red, a
 * conflict, a stack problem or a second refused merge is a lane-written `train-passed:` entry (no control prefix) and the
 * train passes over the PR: no question, nothing sent to the PR's owner.
 */
export function trainBrief(wl: string, prs: readonly number[]): string {
	const sl = `sl-train-${wl.replace(/^wl-/, "")}-<n>`;
	const full = `${sl}-full-<r>`;
	const append = `\`train ${wl} <N…>\``;
	const lines = [
		`merge train (Jo's word): ${prs.map((n) => `#${n}`).join(", ")}`,
		"",
		`Train ${wl}. Its PRs, in order: these, then every PR Jo adds with ${append} (Jo's instruction on this workload), each in Jo's order. ` +
			"Work one PR at a time. No question holds the next PR: a production PR's question stays open while the train goes on, and a PR " +
			"the train cannot land is passed over (Passing a PR over, below). Each PR's slices:",
		...prs.map((n) => `- #${n}: ${trainSliceId(wl, n)}, suite runs on ${trainFullSliceId(wl, n, 1)}, ${trainFullSliceId(wl, n, 2)}, …`),
		"",
		`0. \`${RESOLVE_COMMAND} order --repo <owner/repo of this workload's origin> --prs <every PR on this train, in the order above, comma-separated>\`, ` +
			"at train start and again before each PR, because a body can change. It prints the chain line (`#101 → #106 → #107 · #139`: " +
			"arrows join a stack, `·` separates independent PRs, `✓` a merged dependency, `⇠` a PR that waits), then JSON " +
			"`{order, waiting, cycles, chain, unrecorded}`. Work the PRs in its `order`. Post the chain line with lane_message at the start. " +
			"For every `unrecorded` edge `{pr: B, dependsOn: A}` (B's base branch is A's head and B's body has no `Depends-on: #A` line), " +
			"at once, before A can merge: `gh pr edit B --body-file <a file holding B's body plus the line \"Depends-on: #A\">`, then run `order` again.",
		`1. Per PR n two slices, added with these exact ids (lane_add_slice \`id\`): \`${sl}\` (the PR's disposition: prep, stakes, outcome) ` +
			`and, once a push or the shortcut makes it testable, \`${full}\` for its suite runs, r counting from 1. ` +
			`A PR has at most one open full-suite slice: every run, retry, rerun, or rerun after a stale or error result goes on that open slice; ` +
			"add `-full-<r+1>` only when a green has completed `-full-<r>` and the PR needs a new run because main or its head moved. " +
			"`gh pr view <n> --json headRefName,headRefOid,state,mergeable,mergeStateStatus`; a merged or closed PR: complete " +
			`\`${sl}\` with artifact \`skipped: <state>\`. A head branch whose workload has a live lane is not touched: complete it with ` +
			"`skipped: live lane <id>` and report it with lane_message. Then the next PR. Stakes: " +
			`\`${RESOLVE_COMMAND} stakes --repo <owner/repo of this workload's origin> --pr <n>\` prints \`normal\` (a same-repo \`wl/<id>\` ` +
			"branch whose workload is on this repository at normal stakes, and main's protection verified) or `production: <reason>` " +
			"(anything else, `production: main protection unverified (<why>)` included); exit 2 (usage or a gh failure): run it once " +
			"more, then count the PR as production. Step 7 runs it again before it decides. Before step 2: every dependency of n must " +
			"be MERGED, then a base-branch stack is retargeted (Stacked PRs, below); otherwise n is passed over as that rule says.",
		"2. `git fetch origin`; a PR worktree at the PR's current head, new each time this step runs: `git worktree add --detach " +
			"<a new path beside the lane worktree> origin/<head branch>`. Never reuse an older PR worktree: its tree is an older head. " +
			"Run every resolver command below with that PR worktree as cwd (the script works on the repo of its cwd) and always your " +
			"lane worktree's copy of the script, never the PR branch's: an older PR branch may not have it. Run " +
			`\`${RESOLVE_COMMAND} check --base origin/main\`: exit 0 = no PR-added numbered MIGRATION.md item is left. If the head ` +
			"contains origin/main, `check` exits 0, and its last full suite at that head is green → step 7.",
		"3. `git merge --no-ff origin/main` (a merge commit). Never rebase, never force-push.",
		`4. On conflict: \`${RESOLVE_COMMAND} resolve --pr <n> --workload <head workload>\`, where <head workload> is the head branch's ` +
			"workload id when the branch is `wl/<wl-…>`, else `none`. Exit 0: it wrote and staged MIGRATION.md / migration/items / " +
			"install/manifest.tsv; `git commit --no-edit`. Exit 3 (a conflict outside that set), 4 (one it cannot fix without losing " +
			"a side's edit) or 2 (a usage error or a git process failure, e.g. `git merge-file` crashed): `git merge --abort`, push nothing, " +
			"and pass the PR over with reason `conflict` (the files, the resolver's exit code and its message). The train never resolves a conflict by hand.",
		`5. Conversion commit: \`${RESOLVE_COMMAND} convert --pr <n> --workload <head workload> --base origin/main\`. When it wrote ` +
			"files, `git add` them and commit `migration: #<n>'s item to migration/items/<slug>.md`. Then `check` must exit 0, and " +
			"`git status --porcelain` must be empty.",
		"6. Declare the slice artifact (a bare `bun test <the PR's changed test files> surface/test/migration-items.test.ts`), pass it " +
			`on that clean tree, \`git push origin HEAD:<head branch>\` (no force). Use the PR's open \`${full}\`, or add the next r when ` +
			`none is open. Then \`lane_full_test { pr: <n>, slice: ${full} }\`; a green completes that slice itself. Green → step 7. ` +
			`Every failure a known flake (${KNOWN_FLAKES.join(", ")}) → rerun once on the same slice. A runner \`stale\` because main or the ` +
			"head moved, or a runner `error` → back to step 2, keeping the same open slice for the next run; a second `error` at the same " +
			"head: pass the PR over with reason `error`. Any other red, or a flake rerun red again: the train never fixes it; pass the PR " +
			"over with reason `red` (run id, head, counts, the failing test names and first error lines, the run's result.json path).",
		"7. Land the green PR, both stakes through a. and b. in order; only b.'s answer picks the merge or Jo's question:",
		"   a. Ready: `git fetch origin`, then `gh pr view <n> -R <owner/repo> --json headRefOid,mergeable,mergeStateStatus`. The head must " +
			"equal the sha the green run tested, `mergeable` must be `MERGEABLE` (an `UNKNOWN` is re-queried once and never read as " +
			"mergeable), and `git merge-base --is-ancestor origin/main <head>` must exit 0. A moved head (not the tested sha) → back to " +
			"step 2 (a new PR worktree at the new head, and on from there); never merge main into the older local tree. The tested " +
			"head not containing origin/main, or not `MERGEABLE` → back to step 3 (merge main in, push, a new suite run).",
		`   b. Stakes, again: run step 1's \`${RESOLVE_COMMAND} stakes\` command now; its answer decides, not step 1's (the workload's ` +
			"stakes or main's protection may have changed while the suite ran). `normal` → c. `production: <reason>`, or a second " +
			"exit 2 → Production stakes, below.",
		"   c. Merge: `gh pr merge <n> -R <owner/repo> --merge --match-head-commit <head>`, a merge commit, never `--admin`, `--squash`, " +
			"`--rebase` or `--auto`. Main's protection, which b. verified (a strict rule requiring `as2/full-suite`, which the test runner " +
			"posts), makes GitHub refuse a merge whose head lacks the current main or a green status, so a race ends in a refused merge.",
		"   d. Verify: `gh pr view <n> -R <owner/repo> --json state,mergeCommit` shows `MERGED`. A refused merge (gh exits non-zero, or the " +
			"state is not MERGED) → back to a. once; a second refusal on the same head: pass the PR over with reason `merge-refused` (gh's messages).",
		`   e. Record: complete \`${sl}\` with artifact \`merged by train <merge commit sha> (run <id>)\`, then the next PR.`,
		`   Production stakes, reached only from b. after a. passed: raise the question on \`${sl}\`: PR green and mergeable at <the ` +
			"head a. read> on main <the origin/main a. fetched>, run <the green run at that head>, <pass>/<fail>/<skip>, b.'s stakes " +
			"reason, the chain, item file if any; options merged / skip / stop. Do not wait for it: go on to the next PR while it is " +
			`open. merged → \`gh pr view\` shows MERGED, complete \`${sl}\` with artifact \`merged by Jo <merge commit>\`; skip → Jo's ` +
			"answer cancels the PR's open train slices; stop → record it and release the lane with no done-because (slices stay open, " +
			`the workload stays open; Jo's ${append} relaunches it).`,
		"",
		"Passing a PR over (no question to Jo, nothing sent to the PR's owner): write the detail to a file under `$AS2_SCRATCH`, then " +
			"lane_record_entry `train-passed: pr <n> <reason> <absolute path of the detail file>`, reason one of red, conflict, stack, " +
			"merge-refused, error; then the next PR. A passed PR's slices stay open. On a later run of the train a passed PR is worked " +
			"again from step 1 only when its head or origin/main moved since its newest `train-passed:`, or, for `stack`, its dependency merged.",
		"Rules: one live run per workload; no code edit beyond the resolver's output; merge only at step 7 c., on b.'s `normal`, as a " +
			"merge commit; a production PR's merge is Jo's. Record per PR with lane_record_entry: stakes and reason, head tested, run id, " +
			"verdict and counts, item file written if any, and its outcome.",
		`The train's stop: after Jo answers stop on a question on one of this train's slices, the test runner refuses lane_full_test for every PR until Jo's next ${append}. No other question holds a run.`,
		`Terminal outcomes: \`${sl}\` completed (\`merged by train …\`, \`merged by Jo …\`, \`skipped: <state>\`, \`skipped: live lane <id>\`) ` +
			`or cancelled by Jo's skip, and no open \`${full}\`. done-because when every PR on the train is terminal, listing each; with no ` +
			"open slice left the orchestrator's close is not refused. When nothing on the train is runnable and a production question is " +
			"open, stop and let the lane wait on it; Jo's answer resumes it. When nothing is runnable and no question is open, post one " +
			"lane_message listing each PR that is not terminal with its newest `train-passed:` entry, then release with no done-because.",
		"Stacked PRs: a PR depends on #A when its body has a `Depends-on: #A` line (the edge the lane records, or the author's) or its " +
			"base branch is #A's head. The chain line goes in every production question and `train-passed:` detail (\"chain: #101 → **#106** → #107\", " +
			"the PR at hand in bold) and in done-because. The test runner refuses lane_full_test for a train PR whose `Depends-on:` PR is " +
			"not MERGED or whose base branch is not main. Once #A is merged, and before #B's step 2: `gh pr edit B --base main` unless " +
			"GitHub already retargeted B; merging main into B then brings in A's merge commit. A PR in `waiting` is passed over with no " +
			"entry and tried again on each pass, once a PR ahead of it lands. A cycle member, a PR whose dependency Jo skipped, closed " +
			"unmerged or is not on the train, and a PR whose retarget the gate refuses: pass it over with reason `stack` (the chain and the " +
			"problem). Never add a PR to the train, nor a `Depends-on:` line beyond an `unrecorded` edge, without Jo's word.",
	];
	return lines.join("\n");
}
