// The merge-train workload kind (PLAN wl-mv8s8srodefytc § 1, § 2): Jo's `train <N> [<N> …]` opens a
// workload that takes green PRs one at a time, merges main in without rebasing, lets the resolver
// (surface/scripts/merge-train.ts) fix the conflicts it knows, runs the full suite and asks Jo to merge.
// This module is the kind's pure part: the procedure text the lane reads as its brief (`trainBrief`),
// the bodies of Jo's instruction and the surface's `train:` entry, the train's PR order (`trainPrs`),
// the slice id rule (`sl-train-<k>-<n>`, `sl-train-<k>-<n>-full-<r>`, where `<k>` is the train's
// workload id without its `wl-`), the hold the test runner's starter applies (`trainHold`) and the
// skip the close check honours (`trainSkippedOf`). The word itself is parsed and applied in
// surface/src/input.ts; the starter evaluates the hold in surface/scripts/test-runner.ts `cmdStart`.
import type { EntryRow, InstructionRow, QuestionRow } from "../../ledger/src/index";
import { prBindingInstructionBody, prBindings } from "./launch";
import { SURFACE_BY } from "./types";

/** The `done:` line of every merge train (§ 1): what is true when the train is over. */
export const TRAIN_DONE =
	"Every PR on this merge train is terminal (merged by Jo, skipped because it was merged or closed or its branch had a live lane, or cancelled by Jo's skip) with no train slice left open, and done-because lists each PR's outcome.";

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
 * Why the test runner refuses `lane_full_test { pr }` on this workload now (§ 1, the train hold), or null.
 * A workload with no valid `train:` entry is never held. On a train:
 * (b) a question on any of its train slices answered `stop` by Jo holds every PR unless the newest `train:` entry's
 *     instruction comes after that answer in `rows.instructions`, the ledger's order (created_at, then rowid), so Jo's
 *     train word in the same millisecond as the stop still resumes it; Jo's train word is the only resume, so later
 *     answers on other questions do not clear it; the newest stop, in the same order, is the one named;
 * (a) an open question on a train slice of another PR M (its disposition slice or any full-suite slice), whatever
 *     its options, holds every PR but M.
 * A slice of another train (`trainSlicePr`) never holds this one. Pass the rows read in the starter's
 * reservation transaction, so a question raised between admission and reservation still holds.
 */
export function trainHold(rows: TrainRows & { pr: number }): string | null {
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
	if (stop !== null) return `merge train stopped by Jo at #${stop.n} (${stop.q.id}); \`train ${stop.q.workload_id} <N…>\` resumes it`;
	for (const q of rows.questions) {
		if (q.state !== "open") continue;
		const n = trainSlicePr(q.slice_id, q.workload_id);
		if (n !== null && n !== rows.pr) return `merge train holds: #${n}'s question ${q.id} is open; Jo answers it before the next PR runs`;
	}
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
 * The lane's brief for train `wl` opened on `prs` (§ 2): the header, each PR's slice ids, and the codified
 * procedure, numbered, with the real slice ids of this train and the resolver's command.
 */
export function trainBrief(wl: string, prs: readonly number[]): string {
	const sl = `sl-train-${wl.replace(/^wl-/, "")}-<n>`;
	const full = `${sl}-full-<r>`;
	const append = `\`train ${wl} <N…>\``;
	const lines = [
		`merge train (Jo's word): ${prs.map((n) => `#${n}`).join(", ")}`,
		"",
		`Train ${wl}. Its PRs, in order: these, then every PR Jo adds with ${append} (Jo's instruction on this workload), each in Jo's order. ` +
			"Work one PR at a time; the next PR waits for Jo's answer on this one. Each PR's slices:",
		...prs.map((n) => `- #${n}: ${trainSliceId(wl, n)}, suite runs on ${trainFullSliceId(wl, n, 1)}, ${trainFullSliceId(wl, n, 2)}, …`),
		"",
		`0. \`${RESOLVE_COMMAND} order --repo <owner/repo of this workload's origin> --prs <every PR on this train, in the order above, comma-separated>\`, ` +
			"at train start and again before each PR, because a body can change. It prints the chain line (`#101 → #106 → #107 · #139`: " +
			"arrows join a stack, `·` separates independent PRs, `✓` a merged dependency, `⇠` a PR that waits), then JSON " +
			"`{order, waiting, cycles, chain, unrecorded}`. Work the PRs in its `order`. Post the chain line with lane_message at the start. " +
			"For every `unrecorded` edge `{pr: B, dependsOn: A}` (B's base branch is A's head and B's body has no `Depends-on: #A` line), " +
			"at once, before A can merge: `gh pr edit B --body-file <a file holding B's body plus the line \"Depends-on: #A\">`, then run `order` again.",
		`1. Per PR n two slices, added with these exact ids (lane_add_slice \`id\`): \`${sl}\` (the PR's disposition: prep, questions, outcome) ` +
			`and, once a push or the shortcut makes it testable, \`${full}\` for its suite runs, r counting from 1. ` +
			`A PR has at most one open full-suite slice: every run, retry, rerun, or rerun after a stale or error result goes on that open slice; ` +
			"add `-full-<r+1>` only when a green has completed `-full-<r>` and the PR needs a new run because main or its head moved. " +
			"`gh pr view <n> --json headRefName,headRefOid,state,mergeable,mergeStateStatus`; a merged or closed PR: complete " +
			`\`${sl}\` with artifact \`skipped: <state>\`. A head branch whose workload has a live lane is not touched: complete it with ` +
			"`skipped: live lane <id>` and report it with lane_message. Then the next PR. Before step 2: every dependency of n must be " +
			"MERGED, then a base-branch stack is retargeted (Stacked PRs, below); otherwise n is passed over as that rule says.",
		"2. `git fetch origin`; a worktree of the head branch (`git worktree add` beside the lane worktree). Run every resolver command " +
			"below with that PR worktree as cwd (the script works on the repo of its cwd) and always your lane worktree's copy of the " +
			"script, never the PR branch's: an older PR branch may not have it. Run " +
			`\`${RESOLVE_COMMAND} check --base origin/main\`: exit 0 = no PR-added numbered MIGRATION.md item is left. If the head ` +
			"contains origin/main, `check` exits 0, and its last full suite at that head is green → step 7.",
		"3. `git merge --no-ff origin/main` (a merge commit). Never rebase, never force-push.",
		`4. On conflict: \`${RESOLVE_COMMAND} resolve --pr <n> --workload <head workload>\`, where <head workload> is the head branch's ` +
			"workload id when the branch is `wl/<wl-…>`, else `none`. Exit 0: it wrote and staged MIGRATION.md / migration/items / " +
			"install/manifest.tsv; `git commit --no-edit`. Exit 3 (a conflict outside that set), 4 (one it cannot fix without losing " +
			"a side's edit) or 2 (a usage error or a git process failure, e.g. `git merge-file` crashed): `git merge --abort`, push nothing, " +
			`raise a question on \`${sl}\` naming the files and the resolver's message, ` +
			"options resolve / skip / stop (resolve = the train resolves it by hand and gets one cross-lab review of the resolution before pushing).",
		`5. Conversion commit: \`${RESOLVE_COMMAND} convert --pr <n> --workload <head workload> --base origin/main\`. When it wrote ` +
			"files, `git add` them and commit `migration: #<n>'s item to migration/items/<slug>.md`. Then `check` must exit 0, and " +
			"`git status --porcelain` must be empty.",
		"6. Declare the slice artifact (a bare `bun test <the PR's changed test files> surface/test/migration-items.test.ts`), pass it " +
			`on that clean tree, \`git push origin HEAD:<head branch>\` (no force). Use the PR's open \`${full}\`, or add the next r when ` +
			`none is open. Then \`lane_full_test { pr: <n>, slice: ${full} }\`; a green completes that slice itself. Green → step 7. ` +
			`Every failure a known flake (${KNOWN_FLAKES.join(", ")}) → rerun once on the same slice. A runner \`error\` or \`stale\` ` +
			"because main moved → back to step 2, keeping the same open slice for the next run, except on a PR Jo skipped (A skip while " +
			"a run is live, below). Any other red, or a flake rerun red " +
			`again: never fixed; raise a question on \`${sl}\`: red at <sha>, run <id>, counts, the failing test names and first error ` +
			`lines; options rerun / skip / stop. rerun → lane_full_test again on the same open \`${full}\`; skip → Jo's answer itself ` +
			"cancels the PR's open train slices, next PR; stop → as in step 7.",
		"7. Before the ask: `git fetch origin` and `gh pr view <n> --json headRefOid,mergeable,mergeStateStatus` again. The head must " +
			"equal the sha the green run tested, `origin/main` must equal the green run's recorded `base` (result.json / the aside), and " +
			"`mergeable` must be `MERGEABLE`; a moved head or main → step 2 (a new suite run). An `UNKNOWN` mergeable is re-queried once " +
			`and otherwise reported as unknown, never as mergeable. Raise the question on \`${sl}\`: PR green and mergeable at <sha> on ` +
			"main <base>, run <id>, <pass>/<fail>/<skip>, item file if any; options merged / skip / stop. merged → `gh pr view` shows " +
			`MERGED, complete \`${sl}\` with artifact \`merged by Jo <merge commit>\`, next PR; skip → Jo's answer cancels the PR's open ` +
			"train slices, next PR; stop → record it and release the lane with no done-because (slices stay open, the workload stays " +
			`open; Jo's ${append} relaunches it).`,
		"",
		"Rules: one live run per workload; no code edit beyond the resolver's output (and a resolution Jo authorised with `resolve`); " +
			"never merge: the merge is Jo's, as a merge commit; record per PR with lane_record_entry: head tested, run id, verdict and " +
			"counts, item file written if any, and its outcome.",
		"The train hold: the test runner refuses lane_full_test for a PR while a question on another PR's train slice is open, and " +
			`refuses every PR after Jo answers stop, until Jo's next ${append}.`,
		`A skip while a run is live: Jo's skip keeps the PR's \`${full}\` open while its run is live (the receipt says \`kept <slice> open\`). ` +
			"Wait for the result: a green completes that slice; on any other result (red, stale, error, or the runner died) never rerun " +
			"or re-prepare the skipped PR (no step 2 again): raise a question on that full-suite slice, options skip / stop, so Jo's " +
			"skip cancels it now that the run has ended.",
		`Terminal outcomes: \`${sl}\` completed (\`merged by Jo …\`, \`skipped: <state>\`, \`skipped: live lane <id>\`) or cancelled ` +
			`by Jo's skip, and no open \`${full}\`. done-because when every PR on the train is terminal, listing each; with no open ` +
			"slice left the orchestrator's close is not refused.",
		"Stacked PRs: a PR depends on #A when its body has a `Depends-on: #A` line (the edge the lane records, or the author's) or its " +
			"base branch is #A's head. The chain line goes in every merged, red and conflict question (\"chain: #101 → **#106** → #107\", " +
			"the PR at hand in bold) and in done-because. The test runner refuses lane_full_test for a train PR whose `Depends-on:` PR is " +
			"not MERGED or whose base branch is not main. Once #A is merged, and before #B's step 2: `gh pr edit B --base main` unless " +
			"GitHub already retargeted B; merging main into B then brings in A's merge commit. If the gate refuses `gh pr edit`, raise a " +
			`question on \`${sl}\` for B, options retarget-done / skip / stop. A PR in \`waiting\`, a PR whose dependency Jo skipped or that ` +
			"closed unmerged, and a cycle member are passed over while other PRs can run; when nothing else is runnable, raise a question " +
			`on \`${sl}\` with the chain: "#n depends on #A, which is not on the train" (or "was skipped", "closed unmerged", "is in a cycle"), ` +
			`options skip / stop (after stop, Jo's \`train ${wl} A\` adds #A ahead of #n and relaunches the train). Never add a PR to the ` +
			"train, nor a `Depends-on:` line beyond an `unrecorded` edge, without Jo's word.",
	];
	return lines.join("\n");
}
