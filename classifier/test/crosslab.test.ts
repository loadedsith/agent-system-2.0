/**
 * Cross-lab review end to end (PLAN wl-mupu0sx2o046io D1–D6, MIGRATION.md follow-up 23): the
 * classifier extension on a fake OMP host with a real temp ledger, a real git repository as the
 * lane's working directory, and a lane session file on disk (so a hand's session is told from the
 * lane's own). Covers the plan's Routing, Read-only reviews, Production fan-out, Park and Review-4
 * notes test lists.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBriefFields } from "../../gates/src/rows/r05-brief-fields";
import { Ledger, type Stakes } from "../../ledger/src/index";
import { createClassifierExtension } from "../extension";
import { loadCalibration } from "../src/classify";
import { tierTableFromConfig, type TierTable } from "../src/tier-table";
import { asyncDelivery, dist, fakeRegistry, recordedQuestion } from "./helpers";

const ROWS = {
	fast: ["anthropic/claude-haiku-4-5", "openai-codex/gpt-5.6-luna", "kimi-code/kimi-for-coding-highspeed"],
	standard: ["anthropic/claude-sonnet-5-5", "openai-codex/gpt-6-luna", "kimi-code/kimi-k2.5"],
	strong: ["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "kimi-code/kimi-for-coding"],
	deep: ["anthropic/claude-fable-5-1", "openai-codex/gpt-6-astra", "kimi-code/k3"],
};
const TABLE = tierTableFromConfig({ task: { agentModelOverrides: ROWS } });
const ALL = Object.values(ROWS).flat();
const [OPUS, SOL, KIMI] = ROWS.strong as [string, string, string];
const [FABLE, ASTRA, K3] = ROWS.deep as [string, string, string];

/** Answers by the brief's task text: `review…` judge 0.9; `edge…` understand at exactly 0.55 with judge second; `near…` the same at 0.56; anything else change-large 0.9. */
function answer(brief: string) {
	const task = /^task: (.*)$/m.exec(brief)?.[1] ?? "";
	if (task.startsWith("review")) return { choice: "judge", confidence: 0.9, probabilities: dist({ judge: 0.9 }) };
	if (task.startsWith("edge")) return { choice: "understand", confidence: 0.55, probabilities: dist({ understand: 0.55, judge: 0.4 }) };
	if (task.startsWith("near")) return { choice: "understand", confidence: 0.56, probabilities: dist({ understand: 0.56, judge: 0.4 }) };
	return { choice: "change-large", confidence: 0.9, probabilities: dist({ "change-large": 0.9 }) };
}
const JUDGE = { judge: async ({ state }: { state: string }) => ({ answers: { kind: answer(state) }, provider: "typesafe", model: "jev-1.13.0" }) };

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]): void {
	const r = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString()}`);
}

/**
 * A workload on a temp ledger, the lane's repository, its session file, and a mutable registry:
 * `creds` lists the credentialed models (edit it to take a lab down or bring it back).
 */
function world(opts: { stakes?: Stakes; slices?: string[]; table?: TierTable; laneStarted?: boolean } = {}) {
	const dir = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "crosslab-"));
	dirs.push(dir);
	const ledger = Ledger.open(join(dir, "ledger.db"), { create: true, backup: false });
	const wl = ledger.openWorkload({ id: "wl-cross", brief: "crosslab test", stakes: opts.stakes ?? "normal", mode: "autonomous", by: "orch-test" });
	for (const id of opts.slices ?? ["sl-x", "sl-y", "sl-work"]) ledger.addSlice({ id, workloadId: wl, task: id, doneCondition: "d", inputs: "i", by: "lane-test" });
	if (opts.laneStarted !== false) ledger.recordEntry({ by: "lane-runner", workloadId: wl, kind: "assumption", body: 'lane-started: lane-test {"pid":1}' });
	const repo = join(dir, "repo");
	mkdirSync(repo);
	git(repo, "init", "-q");
	writeFileSync(join(repo, "a.txt"), "one\n");
	git(repo, "add", "-A");
	git(repo, "commit", "-q", "-m", "init");
	mkdirSync(join(dir, "sessions"));
	const laneFile = join(dir, "sessions", "lane.jsonl");
	writeFileSync(laneFile, "");
	const creds = [...ALL];
	return { dir, ledger, wl, repo, laneFile, root: laneFile.slice(0, -".jsonl".length), creds, registry: fakeRegistry(ALL, creds), table: opts.table ?? TABLE };
}
type World = ReturnType<typeof world>;

const down = (w: World, ...models: string[]) => {
	for (const m of models) w.creds.splice(w.creds.indexOf(m), 1);
};
const up = (w: World, ...models: string[]) => w.creds.push(...models);

const brief = (w: World, task: string, stakes: Stakes = "normal") =>
	`workload: ${w.wl}\ntask: ${task}\ndone-condition: d\ninputs: i\nstakes: ${stakes}\nceiling-share: 10`;

type Handler = (event: unknown, ctx?: unknown) => unknown;
/** A rewritten task item, as the tests read it back. */
type Item = { agent: string; name: string; task?: string };
/** What a `tool_call` or `before_subagent_spawn` handler returns: a refusal, the rewritten call (flat or batch), or a model row. */
type Reply = { block?: boolean; reason?: string; input?: Item & { tasks: Item[]; context?: string }; model?: string[]; note?: string } | undefined;

/** One lane process: the classifier bound to the lane's session and to its hands' sessions. A second `lane(w)` is a restart. */
function lane(w: World, opts: { fingerprint?: (cwd: string) => string } = {}) {
	const handlers: Record<string, Handler> = {};
	const handSession: Record<string, Handler> = {};
	const logs: string[] = [];
	const extension = createClassifierExtension({
		judge: async () => JUDGE as never,
		tierTable: () => w.table,
		disabledProviders: async () => [],
		question: recordedQuestion(),
		calibration: loadCalibration(),
		ledger: () => w.ledger,
		laneId: "lane-test",
		boundWorkload: () => w.wl,
		log: line => logs.push(line),
		...(opts.fingerprint ? { fingerprint: opts.fingerprint } : {}),
	});
	extension({ on: (name: string, h: Handler) => (handlers[name] = h) } as never);
	extension({ on: (name: string, h: Handler) => (handSession[name] = h) } as never);
	const ctx = { cwd: w.repo, modelRegistry: w.registry, sessionManager: { getSessionFile: () => w.laneFile } };
	const handCtx = (agentId: string) => ({ ...ctx, sessionManager: { getSessionFile: () => `${w.root}/${agentId}.jsonl` } });
	const assistant = (selector: string) => {
		const [provider, ...model] = selector.split("/");
		return { type: "message_end", message: { role: "assistant", provider, model: model.join("/"), content: [] } };
	};
	const text = (msg: unknown) => (typeof msg === "object" && msg !== null && "content" in msg ? String(msg.content) : "");
	return {
		logs,
		toolCall: (input: unknown, toolCallId = "call-1") => handlers.tool_call!({ type: "tool_call", toolName: "task", toolCallId, input }, ctx) as Promise<Reply>,
		spawn: (agent: string, spawnKey: string) =>
			handlers.before_subagent_spawn!({ type: "before_subagent_spawn", agent, invocationKind: "task", patterns: [], spawnKey }, ctx) as Promise<Reply>,
		/** An assistant turn of the lane itself. */
		laneMessage: (selector: string) => handlers.message_end!(assistant(selector), ctx),
		/** An assistant turn in hand `agentId`'s own session. */
		handMessage: (agentId: string, selector: string) => handSession.message_end!(assistant(selector), handCtx(agentId)),
		/** Hand `agentId` calls `toolName` in its own session. */
		handTool: (agentId: string, toolName: string) => handSession.tool_call!({ type: "tool_call", toolName, toolCallId: "t-1", input: {} }, handCtx(agentId)) as Promise<Reply>,
		/** A blocking task call returns with these tier results. */
		results: (toolCallId: string, results: { id: string; agent: string; model?: string }[]) =>
			handlers.tool_result!(
				{
					type: "tool_result",
					toolName: "task",
					toolCallId,
					isError: false,
					input: {},
					content: [],
					details: { results: results.map(r => ({ id: r.id, agent: r.agent, resolvedModelIdentity: r.model })) },
				},
				ctx,
			) as { isError?: boolean; content?: { text: string }[] } | undefined,
		/** An async task call returns with its members scheduled. */
		asyncReturned: (toolCallId: string, progress: { index: number; id: string; status?: string }[]) =>
			handlers.tool_result!(
				{ type: "tool_result", toolName: "task", toolCallId, isError: false, input: {}, content: [], details: { async: { state: "running", jobId: "j", type: "task" }, progress } },
				ctx,
			),
		/** Async jobs deliver their output: the text the lane's model is sent for it. */
		deliver: (agentIds: string[], output = "hand output") => {
			const result = handlers.context!({ type: "context", messages: [asyncDelivery(agentIds, output)] }, ctx) as { messages?: unknown[] } | undefined;
			return text(result?.messages?.[0] ?? asyncDelivery(agentIds, output));
		},
	};
}
type Lane = ReturnType<typeof lane>;

const bodies = (w: World, prefix = "") => w.ledger.entries(w.wl).map(e => e.body).filter(b => b.startsWith(prefix));
const questions = (w: World) => w.ledger.questions(w.wl);

/** A blocking tier dispatch of `sliceId` that spawns, answers on `model`, and settles. */
async function settled(h: Lane, w: World, sliceId: string, task: string, model: string, call: string) {
	const out = await h.toolCall({ agent: "strong", name: sliceId, task: brief(w, task) }, call);
	expect(out?.block).toBeUndefined();
	const spawn = await h.spawn(out!.input.agent, sliceId);
	h.handMessage(sliceId, model);
	return { spawn, result: h.results(call, [{ id: sliceId, agent: out!.input.agent, model }]) };
}

/** A blocking review of `sliceId` up to its spawn reply. */
async function reviewSpawn(h: Lane, w: World, sliceId = "sl-x", call = "rev-1") {
	const out = await h.toolCall({ agent: "strong", name: sliceId, task: brief(w, "review the change") }, call);
	expect(out?.block).toBeUndefined();
	return h.spawn(out!.input.agent, sliceId);
}

describe("Routing", () => {
	test("builders {anthropic}: the review's spawn row has no anthropic entry, and a review that answered on anthropic is withheld", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		const spawn = await reviewSpawn(h, w);
		expect(spawn?.model).toEqual([SOL, KIMI]);
		expect(spawn?.note).toContain("review routed off the builder lab anthropic");
		h.handMessage("sl-x", OPUS);
		const out = h.results("rev-1", [{ id: "sl-x", agent: "strong", model: OPUS }]);
		expect(out?.isError).toBe(true);
		expect(out?.content?.[0]?.text).toContain(`sl-x ran on ${OPUS}, outside the strong row (${SOL}, ${KIMI})`);
		expect(w.ledger.routings(w.wl)).toMatchObject([{ slice_id: "sl-x", outcome: "refused-out-of-row", models: JSON.stringify([SOL, KIMI]) }]);
	});

	test("a change hand that fell back to openai makes builders {anthropic, openai}: the review goes to kimi only; the change itself was unaffected", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		const change = await settled(h, w, "sl-work", "change the loader", SOL, "c1");
		expect(change.spawn?.model).toEqual([OPUS, SOL, KIMI]); // a change dispatch keeps its whole row
		expect(change.result).toBeUndefined();
		expect((await reviewSpawn(h, w))?.model).toEqual([KIMI]);
	});

	test("a hand-spawn token with no hand-settled entry counts its whole row (a change lost before settle)", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		down(w, KIMI);
		const out = await h.toolCall({ agent: "strong", name: "sl-work", task: brief(w, "change it") }, "c1");
		expect((await h.spawn(out!.input.agent, "sl-work"))?.model).toEqual([OPUS, SOL]);
		up(w, KIMI);
		const restarted = lane(w); // the process died with the change hand in flight
		expect((await reviewSpawn(restarted, w))?.model).toEqual([KIMI]);
	});

	test("T1: one slice dispatched twice, the first settled and the second lost before settle: the second still counts", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		await settled(h, w, "sl-work", "change it", OPUS, "c1");
		const again = await h.toolCall({ agent: "strong", name: "sl-work", task: brief(w, "change it again") }, "c2");
		await h.spawn(again!.input.agent, "sl-work"); // the same spawn key as the settled first
		const spawns = bodies(w, "hand-spawn:");
		expect(spawns).toHaveLength(2);
		expect(new Set(spawns.map(b => b.split(" ")[1])).size).toBe(2); // one token per dispatch
		const restarted = lane(w);
		const review = await reviewSpawn(restarted, w);
		expect(review?.block).toBe(true); // the lost second dispatch's whole row counts: no lab is left
		expect(review?.reason).toContain("parked on question");
	});

	test("a settled refused-model-unknown change row counts its whole row", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		down(w, KIMI);
		const out = await h.toolCall({ agent: "strong", name: "sl-work", task: brief(w, "change it") }, "c1");
		await h.spawn(out!.input.agent, "sl-work");
		expect(h.results("c1", [{ id: "sl-work", agent: "strong", model: OPUS }])?.isError).toBe(true); // no turn seen
		expect(w.ledger.routings(w.wl)).toMatchObject([{ outcome: "refused-model-unknown", ran_models: null }]);
		up(w, KIMI);
		expect((await reviewSpawn(h, w))?.model).toEqual([KIMI]);
	});

	test("a review while a change hand of the workload is in flight is refused; so is a mixed review+change batch", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		const mixed = await h.toolCall({
			context: "shared",
			tasks: [
				{ agent: "strong", name: "sl-x", task: brief(w, "review the change") },
				{ agent: "strong", name: "sl-work", task: brief(w, "change it") },
			],
		});
		expect(mixed?.block).toBe(true);
		expect(mixed?.reason).toContain("task 1 (sl-x) is a review and task 2 (sl-work) is not, in one call on workload wl-cross");
		const out = await h.toolCall({ agent: "strong", name: "sl-work", task: brief(w, "change it") }, "c1");
		await h.spawn(out!.input.agent, "sl-work");
		const review = await h.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review the change") }, "c2");
		expect(review?.block).toBe(true);
		expect(review?.reason).toContain("non-review work of workload wl-cross is still in flight (sl-work)");
	});

	test("a lane with lane-started: and no builder-lab: parks the review", async () => {
		const w = world();
		const h = lane(w); // the lane never answered: no builder-lab entry
		const spawn = await reviewSpawn(h, w);
		expect(spawn?.block).toBe(true);
		expect(questions(w)).toHaveLength(1);
		expect(questions(w)[0]!.body).toContain("lane lane-test has a lane-started: entry and no builder-lab: entry");
	});

	test("an unknown provider parks: in the builder history, and as the only other entry of the row", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage("mystery/model-x");
		expect(bodies(w, "builder-lab:")).toEqual(["builder-lab: unknown lane lane-test model mystery/model-x"]);
		expect((await reviewSpawn(h, w))?.block).toBe(true);
		expect(questions(w)[0]!.body).toContain("unknown lab for provider mystery");

		const rows = { ...ROWS, strong: [OPUS, "mystery/model-x"] };
		const v = world({ table: tierTableFromConfig({ task: { agentModelOverrides: rows } }) });
		up(v, "mystery/model-x");
		const registry = fakeRegistry([...ALL, "mystery/model-x"], v.creds);
		const u = lane({ ...v, registry });
		u.laneMessage(OPUS);
		expect((await reviewSpawn(u, { ...v, registry }))?.block).toBe(true);
		expect(questions(v)[0]!.body).toContain("mystery/model-x (unknown lab for provider mystery; add it to classifier/src/lab.ts)");
	});

	test("builder-lab: is written once per lab per lane, across a restart", () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		h.laneMessage(OPUS);
		h.laneMessage(SOL);
		lane(w).laneMessage(OPUS);
		expect(bodies(w, "builder-lab:")).toEqual([`builder-lab: anthropic lane lane-test model ${OPUS}`, `builder-lab: openai lane lane-test model ${SOL}`]);
	});

	test("review detection at exactly 0.55 with judge in the top two; at 0.56 it is no review", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		const edge = await h.toolCall({ agent: "fast", name: "sl-x", task: brief(w, "edge: look at the design") }, "c1");
		expect(edge?.input.agent).toBe("strong"); // pulled up to deep, capped at strong
		expect((await h.spawn("strong", "sl-x"))?.model).toEqual([SOL, KIMI]);
		const near = await h.toolCall({ agent: "fast", name: "sl-y", task: brief(w, "near: look at the design") }, "c2");
		expect(near?.input.agent).toBe("standard");
		expect((await h.spawn("standard", "sl-y"))?.model).toEqual(ROWS.standard);
	});
});

describe("Read-only reviews", () => {
	test("a review hand's editing tools are refused in its own session; a change hand's are not", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		await reviewSpawn(h, w);
		for (const tool of ["edit", "write", "ast_edit"]) {
			expect((await h.handTool("sl-x", tool))?.reason).toContain("a review hand does not change the work; the lane dispatches the fix as a change slice");
		}
		expect(await h.handTool("sl-x", "read")).toBeUndefined();
		// Work dispatched while a review runs is not held back; its hand edits freely.
		const out = await h.toolCall({ agent: "strong", name: "sl-work", task: brief(w, "change it") }, "c2");
		await h.spawn(out!.input.agent, "sl-work");
		expect(await h.handTool("sl-work", "edit")).toBeUndefined();
	});

	const mutations: [string, (repo: string) => void][] = [
		["changed a worktree file", repo => writeFileSync(join(repo, "a.txt"), "changed by the review\n")],
		[
			"staged a change only in the index (T3)",
			repo => {
				writeFileSync(join(repo, "a.txt"), "staged\n");
				git(repo, "add", "a.txt");
				writeFileSync(join(repo, "a.txt"), "one\n");
			},
		],
		["moved a ref", repo => git(repo, "branch", "side")],
	];
	for (const [what, mutate] of mutations) {
		test(`a review whose bash ${what}: output withheld, its lab a builder, still withheld by recover() after a restart`, async () => {
			const w = world();
			const h = lane(w);
			h.laneMessage(OPUS);
			expect((await reviewSpawn(h, w))?.model).toEqual([SOL, KIMI]);
			mutate(w.repo);
			h.handMessage("sl-x", SOL);
			const out = h.results("rev-1", [{ id: "sl-x", agent: "strong", model: SOL }]);
			expect(out?.isError).toBe(true);
			expect(out?.content?.[0]?.text).toContain("the review changed the work");
			const token = bodies(w, "hand-spawn:")[0]!.split(" ")[1]!;
			expect(bodies(w, "review-withheld:")).toEqual([`review-withheld: ${token}`]);
			expect(bodies(w, "builder-lab: openai hand")).toEqual([`builder-lab: openai hand ${token} model ${SOL}`]);
			expect(w.ledger.routings(w.wl)).toMatchObject([{ outcome: "ran" }]); // the row records what ran; the entry withholds

			const restarted = lane(w);
			const replay = restarted.results("rev-1", [{ id: "sl-x", agent: "strong", model: SOL }]);
			expect(replay?.content?.[0]?.text).toContain("is a review that changed the work (review-withheld:");
			// The next review is routed off openai too.
			git(w.repo, "checkout", "-q", "--", ".");
			expect((await reviewSpawn(restarted, w, "sl-y", "rev-2"))?.model).toEqual([KIMI]);
		});
	}

	test("T2: an OpenAI review hand that wrote and was lost before settle: the next review excludes OpenAI", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		down(w, KIMI);
		expect((await reviewSpawn(h, w))?.model).toEqual([SOL]);
		writeFileSync(join(w.repo, "a.txt"), "written by the lost review\n");
		up(w, KIMI);
		expect((await reviewSpawn(lane(w), w, "sl-y", "rev-2"))?.model).toEqual([KIMI]);
	});
});

describe("Production fan-out", () => {
	test("brief normal on a production workload: effective production, tier deep, one pinned hand per other lab, two rows on the slice; row 5 passes the expanded call", async () => {
		const w = world({ stakes: "production" });
		const h = lane(w);
		h.laneMessage(OPUS);
		const input = { agent: "strong", name: "sl-x", task: brief(w, "review the change") };
		const out = await h.toolCall(input, "c1");
		expect(out?.input.tasks.map((t: { name: string; agent: string }) => `${t.name}@${t.agent}`)).toEqual(["sl-x--openai@deep", "sl-x--kimi@deep"]);
		expect(checkBriefFields(out!.input, w.wl)).toBeNull();
		expect((await h.spawn("deep", "sl-x--openai"))?.model).toEqual([ASTRA]);
		expect((await h.spawn("deep", "sl-x--kimi"))?.model).toEqual([K3]);
		h.handMessage("sl-x--openai", ASTRA);
		h.handMessage("sl-x--kimi", K3);
		expect(
			h.results("c1", [
				{ id: "sl-x--openai", agent: "deep", model: ASTRA },
				{ id: "sl-x--kimi", agent: "deep", model: K3 },
			]),
		).toBeUndefined();
		expect(w.ledger.routings(w.wl)).toMatchObject([
			{ slice_id: "sl-x", agent_id: "sl-x--openai", stakes: "production", tier: "deep", models: JSON.stringify([ASTRA]), outcome: "ran" },
			{ slice_id: "sl-x", agent_id: "sl-x--kimi", stakes: "production", tier: "deep", models: JSON.stringify([K3]), outcome: "ran" },
		]);
		const groups = bodies(w, "hand-spawn:").map(b => / group (\S+) /.exec(b)![1]);
		expect(groups[0]).toBe(groups[1]!); // one round
	});

	test("a mixed batch keeps indices straight; async members correlate; recover() of sl-x--kimi-1 after a restart", async () => {
		const w = world({ stakes: "production" });
		const h = lane(w);
		h.laneMessage(OPUS);
		const out = await h.toolCall(
			{ context: "shared", tasks: [{ agent: "task", name: "helper", task: "unrelated" }, { agent: "strong", name: "sl-x", task: brief(w, "review it") }] },
			"c1",
		);
		expect(out?.input.tasks.map((t: { name: string }) => t.name)).toEqual(["helper", "sl-x--openai", "sl-x--kimi"]);
		h.asyncReturned("c1", [
			{ index: 1, id: "sl-x--openai", status: "running" },
			{ index: 2, id: "sl-x--kimi-1", status: "running" }, // OMP's -N collision suffix
		]);
		expect((await h.spawn("deep", "sl-x--kimi-1"))?.model).toEqual([K3]);
		expect((await h.spawn("deep", "sl-x--openai"))?.model).toEqual([ASTRA]);
		h.handMessage("sl-x--openai", ASTRA);
		h.handMessage("sl-x--kimi-1", K3);
		expect(h.deliver(["sl-x--openai", "sl-x--kimi-1"], "FINDINGS")).toBe("FINDINGS");
		expect(w.ledger.routings(w.wl).map(r => r.agent_id)).toEqual(["sl-x--openai", "sl-x--kimi-1"]);
		expect(lane(w).deliver(["sl-x--kimi-1"], "FINDINGS")).toBe("FINDINGS");
	});

	test("one lab down: one hand and a short-fan-out note", async () => {
		const w = world({ stakes: "production" });
		const h = lane(w);
		h.laneMessage(OPUS);
		down(w, K3);
		const out = await h.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review it") }, "c1");
		expect(out?.input).toMatchObject({ name: "sl-x", agent: "deep" });
		const spawn = await h.spawn("deep", "sl-x");
		expect(spawn?.model).toEqual([ASTRA]);
		expect(spawn?.note).toContain(`production review fans out to openai only (${K3} (no credentials))`);
	});

	test("both pinned spawns refused: one park; one member still running: no park", async () => {
		const w = world({ stakes: "production" });
		const h = lane(w);
		h.laneMessage(OPUS);
		await h.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review it") }, "c1");
		down(w, ASTRA, K3);
		expect((await h.spawn("deep", "sl-x--openai"))?.block).toBe(true);
		expect(questions(w)).toHaveLength(0); // the kimi member is still pending
		expect((await h.spawn("deep", "sl-x--kimi"))?.block).toBe(true);
		expect(questions(w)).toHaveLength(1);
		expect(bodies(w, "review-park:")).toEqual([`review-park: ${questions(w)[0]!.id} slice sl-x`]);

		const v = world({ stakes: "production" });
		const g = lane(v);
		g.laneMessage(OPUS);
		await g.toolCall({ agent: "strong", name: "sl-x", task: brief(v, "review it") }, "c1");
		down(v, ASTRA);
		expect((await g.spawn("deep", "sl-x--openai"))?.block).toBe(true);
		expect((await g.spawn("deep", "sl-x--kimi"))?.model).toEqual([K3]);
		expect(questions(v)).toHaveLength(0); // running
		g.handMessage("sl-x--kimi", K3);
		expect(g.results("c1", [{ id: "sl-x--kimi", agent: "deep", model: K3 }])).toBeUndefined();
		expect(questions(v)).toHaveLength(0); // one accepted review: no park
	});

	test("a slice id too long for <slice>--<lab> in 48 characters is refused", async () => {
		const long = `sl-${"a".repeat(40)}`;
		const w = world({ stakes: "production", slices: [long] });
		const h = lane(w);
		h.laneMessage(OPUS);
		const out = await h.toolCall({ agent: "strong", name: long, task: brief(w, "review it") }, "c1");
		expect(out?.block).toBe(true);
		expect(out?.reason).toContain(`is too long for its production review fan-out name \`${long}--openai\``);
	});
});

describe("Park", () => {
	/** A normal-stakes workload whose only usable strong model is the builder's: the review parks. */
	async function parked() {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		down(w, SOL, KIMI);
		const spawn = await reviewSpawn(h, w);
		return { w, h, spawn, question: questions(w)[0]! };
	}

	test("no other lab: refused, one same-lab/wait question, slice paused, a review-park entry, no row on a builder-lab model", async () => {
		const { w, spawn, question } = await parked();
		expect(spawn?.block).toBe(true);
		expect(spawn?.reason).toContain(`parked on question ${question.id}`);
		expect(questions(w)).toHaveLength(1);
		expect(JSON.parse(question.options)).toEqual(["same-lab", "wait"]);
		expect(question.body).toContain(`No lab other than the builder's (anthropic) can review sl-x: ${OPUS} (builder lab anthropic), ${SOL} (no credentials), ${KIMI} (no credentials).`);
		expect(w.ledger.slice("sl-x")?.state).toBe("paused");
		expect(bodies(w, "review-park:")).toEqual([`review-park: ${question.id} slice sl-x`]);
		expect(w.ledger.routings(w.wl).filter(r => r.model?.startsWith("anthropic/"))).toEqual([]);
	});

	test("a re-dispatch while the question is open raises no second question", async () => {
		const { w, h, question } = await parked();
		const again = await h.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review the change") }, "rev-2");
		expect(again?.block).toBe(true);
		expect(again?.reason).toContain(`parked on question ${question.id}`);
		expect(questions(w)).toHaveLength(1);
	});

	test("same-lab: the next dispatch runs on the builder's lab with a review-same-lab: entry; the dispatch after that asks again", async () => {
		const { w, h, question } = await parked();
		const grant = w.ledger.answerQuestion(question.id, { by: "orchestrator-surface", answer: "same-lab", author: "jo", channel: "surface" });
		const spawn = await reviewSpawn(h, w, "sl-x", "rev-2");
		expect(spawn?.model).toEqual([OPUS]);
		expect(spawn?.note).toContain(`same-lab grant ${grant} spent`);
		const token = bodies(w, "hand-spawn:").at(-1)!.split(" ")[1];
		expect(bodies(w, "review-same-lab:")).toEqual([`review-same-lab: ${grant} token ${token}`]);
		h.handMessage("sl-x", OPUS);
		expect(h.results("rev-2", [{ id: "sl-x", agent: "strong", model: OPUS }])).toBeUndefined(); // the granted row allows it
		const third = await reviewSpawn(h, w, "sl-x", "rev-3");
		expect(third?.block).toBe(true);
		expect(questions(w).filter(q => q.state === "open")).toHaveLength(1);
		expect(questions(w)).toHaveLength(2);
	});

	test("same-lab with another lab back: the row is the other labs, then the builder's", async () => {
		const { w, h, question } = await parked();
		w.ledger.answerQuestion(question.id, { by: "orchestrator-surface", answer: "same-lab", author: "jo", channel: "surface" });
		up(w, SOL);
		expect((await reviewSpawn(h, w, "sl-x", "rev-2"))?.model).toEqual([SOL, OPUS]);
	});

	test("a second dispatch racing for the same grant gets the normal rule", async () => {
		const { w, question } = await parked();
		w.ledger.answerQuestion(question.id, { by: "orchestrator-surface", answer: "same-lab", author: "jo", channel: "surface" });
		const a = lane(w);
		const b = lane(w);
		const outA = await a.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review the change") }, "a-1");
		const outB = await b.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review the change") }, "b-1");
		expect((await a.spawn(outA!.input.agent, "sl-x"))?.model).toEqual([OPUS]);
		const late = await b.spawn(outB!.input.agent, "sl-x");
		expect(late?.block).toBe(true); // no grant left, no other lab: it parks again
		expect(bodies(w, "review-same-lab:")).toHaveLength(1);
	});

	test("wait and a withdrawal grant nothing", async () => {
		for (const resolve of ["wait", "withdraw"] as const) {
			const { w, h, question } = await parked();
			if (resolve === "wait") w.ledger.answerQuestion(question.id, { by: "orchestrator-surface", answer: "wait", author: "jo", channel: "surface" });
			else w.ledger.withdrawQuestion(question.id, { by: "orchestrator-surface", reason: "not now", author: "jo", channel: "surface", then: "replan" });
			const again = await reviewSpawn(h, w, "sl-x", "rev-2");
			expect(again?.block).toBe(true);
			expect(bodies(w, "review-same-lab:")).toEqual([]);
			expect(questions(w)).toHaveLength(2);
		}
	});

	test("a single review hand with no answering model parks at settle", async () => {
		const w = world();
		const h = lane(w);
		h.laneMessage(OPUS);
		expect((await reviewSpawn(h, w))?.model).toEqual([SOL, KIMI]);
		const out = h.results("rev-1", [{ id: "sl-x", agent: "strong" }]);
		expect(out?.isError).toBe(true);
		expect(out?.content?.[0]?.text).toContain("parked on question");
		expect(questions(w)).toHaveLength(1);
		expect(questions(w)[0]!.body).toContain("the review hand sl-x ended with no model answering");
	});
});

describe("Review-4 notes", () => {
	const inject = (w: World, prefix: string) =>
		w.ledger.db.exec(`CREATE TRIGGER inject_failure BEFORE INSERT ON entries WHEN NEW.body LIKE '${prefix}%' BEGIN SELECT RAISE(ABORT, 'injected ${prefix} failure'); END;`);

	for (const [fault, changes] of [
		["hand-settled:", false],
		["review-withheld:", true],
	] as const) {
		test(`the routing row, review-withheld:/builder attribution and hand-settled: land together: a fault at ${fault} never lets recover() pass the review`, async () => {
			const w = world();
			const h = lane(w);
			h.laneMessage(OPUS);
			await reviewSpawn(h, w);
			if (changes) writeFileSync(join(w.repo, "a.txt"), "changed\n");
			inject(w, fault);
			h.handMessage("sl-x", SOL);
			const out = h.results("rev-1", [{ id: "sl-x", agent: "strong", model: SOL }]);
			expect(out?.content?.[0]?.text).toContain(`injected ${fault} failure`);
			expect(w.ledger.routings(w.wl)).toEqual([]);
			expect(bodies(w, "hand-settled:")).toEqual([]);
			expect(bodies(w, "builder-lab: openai")).toEqual([]);
			const replay = lane(w).results("rev-1", [{ id: "sl-x", agent: "strong", model: SOL }]);
			expect(replay?.isError).toBe(true);
			expect(replay?.content?.[0]?.text).toContain("no settled routing row");
		});
	}

	test("a fan-out group's terminal accounting and single park survive a restart", async () => {
		const w = world({ stakes: "production" });
		const h = lane(w);
		h.laneMessage(OPUS);
		await h.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review it") }, "c1");
		h.asyncReturned("c1", [
			{ index: 0, id: "sl-x--openai", status: "running" },
			{ index: 1, id: "sl-x--kimi", status: "running" },
		]);
		await h.spawn("deep", "sl-x--openai");
		await h.spawn("deep", "sl-x--kimi");
		h.handMessage("sl-x--openai", FABLE); // off its pinned row
		expect(h.deliver(["sl-x--openai"], "OFF ROW")).not.toContain("OFF ROW");
		expect(questions(w)).toHaveLength(0); // the kimi member is running

		const restarted = lane(w); // the kimi hand died with the process
		expect(restarted.deliver(["sl-x--kimi"], "LOST")).not.toContain("LOST");
		expect(questions(w)).toHaveLength(1);
		restarted.deliver(["sl-x--kimi"], "LOST");
		lane(w).deliver(["sl-x--kimi"], "LOST");
		expect(questions(w)).toHaveLength(1);
		expect(bodies(w, "review-park:")).toHaveLength(1);
	});

	test("a production same-lab grant with zero other labs reaches the single-hand path instead of parking again", async () => {
		const w = world({ stakes: "production" });
		const h = lane(w);
		h.laneMessage(OPUS);
		down(w, ASTRA, K3);
		const first = await h.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review it") }, "c1");
		expect(first?.block).toBe(true);
		const question = questions(w)[0]!;
		const grant = w.ledger.answerQuestion(question.id, { by: "orchestrator-surface", answer: "same-lab", author: "jo", channel: "surface" });
		const out = await h.toolCall({ agent: "strong", name: "sl-x", task: brief(w, "review it") }, "c2");
		expect(out?.input).toMatchObject({ name: "sl-x", agent: "deep" });
		expect((await h.spawn("deep", "sl-x"))?.model).toEqual([FABLE]);
		expect(bodies(w, "review-same-lab:")).toEqual([expect.stringContaining(`review-same-lab: ${grant} token dt-`)]);
		expect(questions(w)).toHaveLength(1);
	});

	test("a fingerprint that cannot be computed fails closed: the output is withheld", async () => {
		const w = world();
		const h = lane(w, {
			fingerprint: () => {
				throw new Error("git is gone");
			},
		});
		h.laneMessage(OPUS);
		await reviewSpawn(h, w);
		h.handMessage("sl-x", SOL);
		const out = h.results("rev-1", [{ id: "sl-x", agent: "strong", model: SOL }]);
		expect(out?.isError).toBe(true);
		expect(out?.content?.[0]?.text).toContain("its spawn-time repository fingerprint could not be taken (git is gone)");
		expect(bodies(w, "review-withheld:")).toHaveLength(1);
	});
});
