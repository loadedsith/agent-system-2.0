/**
 * The cross-lab review rule, pure (classifier/src/lab.ts; PLAN wl-mupu0sx2o046io D1–D6): the
 * provider → lab map, review detection and read-back, who built a workload from its ledger rows,
 * the routing decision, and how Jo's park answer is read.
 */
import { describe, expect, test } from "bun:test";
import {
	type BuilderLedgerView,
	builderLabs,
	isReviewDispatch,
	isReviewRouting,
	labOf,
	parkQuestionBody,
	reviewPlan,
	unspentGrant,
} from "../src/lab";
import { route } from "../src/route";
import { dist } from "./helpers";

const STRONG = ["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "kimi-code/kimi-for-coding"];
const entry = (body: string, slice_id: string | null = null) => ({ kind: "assumption" as const, body, slice_id });
type Row = ReturnType<BuilderLedgerView["routings"]>[number];
const routing = (over: Partial<Row>): Row => ({
	kind: "change-large",
	pull_up_to: null,
	probabilities: JSON.stringify(dist({ "change-large": 0.9 })),
	outcome: "ran",
	models: JSON.stringify(STRONG),
	ran_models: JSON.stringify(["anthropic/claude-opus-5-5"]),
	...over,
});
const view = (entries: ReturnType<typeof entry>[], routings: Row[] = []): BuilderLedgerView => ({ entries: () => entries, routings: () => routings });
const LANE = [entry('lane-started: lane-a {"pid":1}'), entry("builder-lab: anthropic lane lane-a model anthropic/claude-opus-5-5")];

describe("D1: provider → lab", () => {
	test("the map names three labs; a provider it does not name has no lab", () => {
		expect(labOf("anthropic/claude-opus-5-5")).toBe("anthropic");
		expect(labOf("openai/gpt-6")).toBe("openai");
		expect(labOf("openai-codex/gpt-6-sol:high")).toBe("openai");
		expect(labOf("kimi-code/k3")).toBe("kimi");
		expect(labOf("mystery/model-x")).toBeNull();
	});
});

describe("D2: which dispatches are reviews", () => {
	test("judge is a review; a low-confidence brief is one exactly when judge is in its top two, at 0.55 included", () => {
		expect(isReviewDispatch(route({ choice: "judge", confidence: 0.95, probabilities: dist({ judge: 0.95 }) }, "normal"))).toBe(true);
		const at = (confidence: number, second: string) =>
			isReviewDispatch(route({ choice: "understand", confidence, probabilities: dist({ understand: confidence, [second]: 0.4 }) }, "normal"));
		expect(at(0.55, "judge")).toBe(true);
		expect(at(0.56, "judge")).toBe(false);
		expect(at(0.55, "change-small")).toBe(false);
	});

	test("a settled row reads back the same way; unreadable probabilities never read as a review", () => {
		expect(isReviewRouting(routing({ kind: "judge" }))).toBe(true);
		const lowJudge = JSON.stringify(dist({ understand: 0.5, judge: 0.45 }));
		expect(isReviewRouting(routing({ kind: "understand", pull_up_to: "deep", probabilities: lowJudge }))).toBe(true);
		expect(isReviewRouting(routing({ kind: "understand", pull_up_to: null, probabilities: lowJudge }))).toBe(false);
		expect(isReviewRouting(routing({ kind: "understand", pull_up_to: "deep", probabilities: "{not json" }))).toBe(false);
	});
});

describe("D3: who built the work, from the ledger", () => {
	test("a lane's builder-lab entry; a lane that started with none makes the provenance unknown", () => {
		expect(builderLabs(view(LANE), "wl")).toEqual({ labs: ["anthropic"], unknown: [] });
		const unknown = builderLabs(view([...LANE, entry('lane-started: lane-b {"pid":2}')]), "wl");
		expect(unknown.unknown).toEqual(["lane lane-b has a lane-started: entry and no builder-lab: entry, so the lab it ran on is unknown"]);
	});

	test("non-review rows count what ran, or their whole row when it is unknown; review rows do not count", () => {
		const fellBack = routing({ ran_models: JSON.stringify(["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol"]) });
		expect(builderLabs(view(LANE, [fellBack]), "wl").labs).toEqual(["anthropic", "openai"]);
		const unknownModels = routing({ outcome: "refused-model-unknown", ran_models: null, models: JSON.stringify(STRONG.slice(0, 2)) });
		expect(builderLabs(view(LANE, [unknownModels]), "wl").labs).toEqual(["anthropic", "openai"]);
		const review = routing({ kind: "judge", ran_models: JSON.stringify(["kimi-code/kimi-for-coding"]) });
		expect(builderLabs(view(LANE, [review]), "wl").labs).toEqual(["anthropic"]);
	});

	test("an unsettled spawn token counts its whole row; a settled one, or a review in flight here, does not", () => {
		const spawn = (token: string, review: string, row: string[]) =>
			entry(`hand-spawn: ${token} session /s/lane spawn sl-x review ${review} group dg-1 row ${row.join(",")}`, "sl-x");
		const lost = spawn("dt-1", "no", STRONG.slice(1));
		expect(builderLabs(view([...LANE, lost]), "wl").labs).toEqual(["anthropic", "openai", "kimi"]);
		expect(builderLabs(view([...LANE, lost, entry("hand-settled: dt-1 routing rt-1")]), "wl").labs).toEqual(["anthropic"]);
		const reviewing = spawn("dt-2", "yes", ["kimi-code/kimi-for-coding"]);
		expect(builderLabs(view([...LANE, reviewing]), "wl", new Set(["dt-2"])).labs).toEqual(["anthropic"]);
		expect(builderLabs(view([...LANE, reviewing]), "wl").labs).toEqual(["anthropic", "kimi"]); // lost, not live (T2)
	});

	test("a review withheld for changing the work is a builder; a model on an unmapped provider is every lab", () => {
		expect(builderLabs(view([...LANE, entry("builder-lab: openai hand dt-9 model openai-codex/gpt-6-sol")]), "wl").labs).toEqual(["anthropic", "openai"]);
		const mystery = builderLabs(view(LANE, [routing({ ran_models: JSON.stringify(["mystery/model-x"]) })]), "wl");
		expect(mystery.unknown).toEqual(["a change-large hand ran on mystery/model-x: unknown lab for provider mystery; add it to classifier/src/lab.ts"]);
	});
});

describe("D4–D6: reviewPlan", () => {
	const anthropic = { labs: ["anthropic" as const], unknown: [] };

	test("normal stakes: one hand on the labs outside the builders, the allowlist filtered the same way", () => {
		expect(reviewPlan({ row: STRONG, usable: STRONG, builders: anthropic, stakes: "normal", grant: false })).toEqual({
			kind: "single",
			models: STRONG.slice(1),
			allow: STRONG.slice(1),
			excluded: ["anthropic"],
			sameLab: false,
			short: null,
		});
		const two = reviewPlan({ row: STRONG, usable: STRONG, builders: { labs: ["anthropic", "openai"], unknown: [] }, stakes: "normal", grant: false });
		expect(two).toMatchObject({ kind: "single", models: ["kimi-code/kimi-for-coding"] });
	});

	test("filters per lab, not per entry: a row with two entries of one lab keeps both", () => {
		const row = ["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "openai/gpt-6", "kimi-code/k3"];
		const plan = reviewPlan({ row, usable: row, builders: { labs: ["anthropic", "kimi"], unknown: [] }, stakes: "normal", grant: false });
		expect(plan).toMatchObject({ kind: "single", models: ["openai-codex/gpt-6-sol", "openai/gpt-6"] });
	});

	test("production: one pinned member per available other lab; one lab left is one hand with a short-fan-out note", () => {
		const plan = reviewPlan({ row: STRONG, usable: STRONG, builders: anthropic, stakes: "production", grant: false });
		expect(plan).toEqual({
			kind: "fanout",
			excluded: ["anthropic"],
			members: [
				{ lab: "openai", models: ["openai-codex/gpt-6-sol"], allow: ["openai-codex/gpt-6-sol"] },
				{ lab: "kimi", models: ["kimi-code/kimi-for-coding"], allow: ["kimi-code/kimi-for-coding"] },
			],
		});
		const short = reviewPlan({ row: STRONG, usable: STRONG.slice(0, 2), builders: anthropic, stakes: "production", grant: false, skipped: { [STRONG[2]!]: "no credentials" } });
		expect(short).toMatchObject({ kind: "single", models: ["openai-codex/gpt-6-sol"], short: "production review fans out to openai only (kimi-code/kimi-for-coding (no credentials))" });
	});

	test("no other lab usable → park, with each entry's reason; unknown provenance and unmapped providers park too", () => {
		const parked = reviewPlan({
			row: STRONG,
			usable: STRONG.slice(0, 1),
			builders: anthropic,
			stakes: "normal",
			grant: false,
			skipped: { [STRONG[1]!]: "no credentials", [STRONG[2]!]: "provider disabled" },
		});
		expect(parked).toEqual({
			kind: "park",
			excluded: ["anthropic"],
			reasons: ["anthropic/claude-opus-5-5 (builder lab anthropic)", "openai-codex/gpt-6-sol (no credentials)", "kimi-code/kimi-for-coding (provider disabled)"],
		});
		expect(reviewPlan({ row: STRONG, usable: STRONG, builders: { labs: [], unknown: ["x"] }, stakes: "normal", grant: false }).kind).toBe("park");
		const mystery = ["anthropic/claude-opus-5-5", "mystery/model-x"];
		expect(reviewPlan({ row: mystery, usable: mystery, builders: anthropic, stakes: "normal", grant: false })).toMatchObject({
			kind: "park",
			reasons: ["anthropic/claude-opus-5-5 (builder lab anthropic)", "mystery/model-x (unknown lab for provider mystery; add it to classifier/src/lab.ts)"],
		});
	});

	test("REVIEW-r1 #6: a row mixing a usable other lab with an unknown provider parks naming it, at normal and production stakes", () => {
		const row = ["anthropic/claude-opus-5-5", "openai-codex/gpt-6-sol", "mystery/model-x"];
		for (const stakes of ["normal", "production"] as const) {
			const plan = reviewPlan({ row, usable: row, builders: anthropic, stakes, grant: false });
			expect({ stakes, plan }).toMatchObject({ stakes, plan: { kind: "park", reasons: expect.arrayContaining(["mystery/model-x (unknown lab for provider mystery; add it to classifier/src/lab.ts)"]) } });
		}
	});

	test("a grant is one hand: the other labs first, then the builder's; with no other lab it is the builder's alone", () => {
		expect(reviewPlan({ row: STRONG, usable: STRONG.slice(0, 2), builders: anthropic, stakes: "production", grant: true })).toMatchObject({
			kind: "single",
			models: ["openai-codex/gpt-6-sol", "anthropic/claude-opus-5-5"],
			allow: ["openai-codex/gpt-6-sol", "kimi-code/kimi-for-coding", "anthropic/claude-opus-5-5"],
			sameLab: true,
		});
		expect(reviewPlan({ row: STRONG, usable: STRONG.slice(0, 1), builders: anthropic, stakes: "production", grant: true })).toMatchObject({
			kind: "single",
			models: ["anthropic/claude-opus-5-5"],
		});
	});

	test("a pinned member keeps only its lab, and is refused when its lab is gone or became a builder", () => {
		expect(reviewPlan({ row: STRONG, usable: STRONG, builders: anthropic, stakes: null, grant: false, pin: "kimi" })).toMatchObject({ kind: "single", models: ["kimi-code/kimi-for-coding"] });
		expect(reviewPlan({ row: STRONG, usable: STRONG.slice(0, 2), builders: anthropic, stakes: null, grant: false, pin: "kimi" }).kind).toBe("park");
		expect(reviewPlan({ row: STRONG, usable: STRONG, builders: { labs: ["anthropic", "kimi"], unknown: [] }, stakes: null, grant: false, pin: "kimi" }).kind).toBe("park");
	});
});

describe("D6: reading Jo's answer", () => {
	const parks = [entry("review-park: q-1 slice sl-x", "sl-x")];
	const answer = (over: Partial<{ id: string; kind: "answer" | "withdrawal" | "instruction"; author: string; question_id: string | null; body: string }>) => ({
		id: "in-1",
		kind: "answer" as const,
		author: "jo",
		question_id: "q-1",
		body: "same-lab",
		...over,
	});

	test("only Jo's exact same-lab answer to this slice's park question grants, once", () => {
		expect(unspentGrant(parks, [answer({})], "sl-x")).toBe("in-1");
		expect(unspentGrant(parks, [answer({})], "sl-y")).toBeNull();
		expect(unspentGrant(parks, [answer({ body: "wait" })], "sl-x")).toBeNull();
		expect(unspentGrant(parks, [answer({ kind: "withdrawal" })], "sl-x")).toBeNull();
		expect(unspentGrant(parks, [answer({ author: "lane-a" })], "sl-x")).toBeNull();
		expect(unspentGrant(parks, [answer({ question_id: "q-other" })], "sl-x")).toBeNull();
		expect(unspentGrant([...parks, entry("review-same-lab: in-1 token dt-1", "sl-x")], [answer({})], "sl-x")).toBeNull();
	});

	test("the park question names the builder's lab, the reasons, and both answers", () => {
		const body = parkQuestionBody("sl-x", { labs: ["anthropic"], unknown: [] }, ["openai-codex/gpt-6-sol (no credentials)", "kimi-code/kimi-for-coding (provider disabled)"]);
		expect(body).toBe(
			"No lab other than the builder's (anthropic) can review sl-x: openai-codex/gpt-6-sol (no credentials), kimi-code/kimi-for-coding (provider disabled). " +
				"**same-lab**: run this one review on anthropic, the builder's lab. " +
				"**wait**: hold the review until another lab is back; the lane retries later and asks again if it is still down.",
		);
	});
});
