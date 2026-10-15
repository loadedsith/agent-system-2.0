/**
 * Jo's Kimi-out rule (input in-mv5xafhywe3w8w, PLAN wl-mv5xay6bjp0268 § 2.1–2.5): the helpers in classifier/src/lab.ts the
 * classifier's four sites use. The end-to-end behaviour (T1–T11) is in crosslab.test.ts; these pin the pieces.
 */
import { describe, expect, test } from "bun:test";
import type { EntryRow, RoutingRow } from "../../ledger/src/index";
import {
	type BuilderLedgerView,
	type BuilderRole,
	builderLabs,
	builderRoles,
	isKimiQuotaRefusal,
	KIMI_OUT_RULE,
	kimiOutRuleActive,
	type Lab,
	parseReviewSameLabRule,
	reviewPlan,
	reviewSameLabRuleBody,
} from "../src/lab";
import { dist } from "./helpers";

const OPUS = "anthropic/claude-opus-5-5";
const SOL = "openai-codex/gpt-6-sol";
const KIMI = "moonshot/kimi-k2.7-code";
const STRONG = [OPUS, SOL, KIMI];
const END = Date.parse("2026-11-01T00:00:00-07:00");
const QUOTA = '429 {"error":{"message":"Your account is suspended due to insufficient balance"}}';

type Entry = Pick<EntryRow, "kind" | "body" | "created_by" | "created_at">;
type Row = Pick<RoutingRow, "kind" | "pull_up_to" | "probabilities" | "outcome" | "models" | "ran_models" | "session_root" | "agent_id">;
const entry = (body: string, created_by = "lane-a"): Entry => ({ kind: "assumption", body, created_by, created_at: "2026-10-20T10:00:00.000Z" });
const routing = (over: Partial<Row>): Row => ({
	kind: "change-large",
	pull_up_to: null,
	probabilities: JSON.stringify(dist({ "change-large": 0.9 })),
	outcome: "ran",
	models: JSON.stringify(STRONG),
	ran_models: JSON.stringify([SOL]),
	session_root: "/s/lane",
	agent_id: null,
	...over,
});
const view = (entries: Entry[], routings: Row[] = []): BuilderLedgerView => ({ entries: () => entries, routings: () => routings });
const LANE = [entry('lane-started: lane-a {"pid":1}'), entry(`builder-lab: anthropic lane lane-a model ${OPUS}`)];

describe("the rule's window", () => {
	test("active before 2026-11-01T00:00:00-07:00, ended at it; the constant names Jo's input and the row omission", () => {
		expect(KIMI_OUT_RULE.endsAt).toBe(END);
		expect(KIMI_OUT_RULE.input).toBe("in-mv5xafhywe3w8w");
		expect(KIMI_OUT_RULE.rowOmission).toBe(true);
		expect(kimiOutRuleActive(END - 1)).toBe(true);
		expect(kimiOutRuleActive(END)).toBe(false);
		expect(kimiOutRuleActive(END + 1)).toBe(false);
	});
});

describe("review-same-lab-rule: entry body", () => {
	test("writes the fixed shape and reads it back; the kimi evidence runs to the end of the line", () => {
		const body = reviewSameLabRuleBody({ slice: "sl-x", token: "dt-1", labs: ["openai", "anthropic"], kimi: `${KIMI} (its provider refused on dt-0 (status 429))` });
		expect(body).toBe(`review-same-lab-rule: in-mv5xafhywe3w8w slice sl-x token dt-1 labs openai,anthropic kimi ${KIMI} (its provider refused on dt-0 (status 429))`);
		expect(parseReviewSameLabRule(body)).toEqual({
			input: "in-mv5xafhywe3w8w",
			slice: "sl-x",
			token: "dt-1",
			labs: ["openai", "anthropic"],
			kimi: `${KIMI} (its provider refused on dt-0 (status 429))`,
		});
	});

	test("anything else reads as null", () => {
		expect(parseReviewSameLabRule("review-same-lab: in-x token dt-1")).toBeNull();
		expect(parseReviewSameLabRule("review-same-lab-rule: in-mv5xafhywe3w8w slice sl-x token dt-1 labs openai")).toBeNull();
		expect(parseReviewSameLabRule("")).toBeNull();
	});
});

describe("builder roles (§ 2.3)", () => {
	test("each lab's most involved role: lane over hand over review; builderLabs' result is unchanged", () => {
		const withheld = entry(`builder-lab: openai hand dt-9 model ${SOL}`);
		expect(builderRoles(view([...LANE, withheld]), "wl")).toEqual({ anthropic: "lane", openai: "review" });
		expect(builderRoles(view([...LANE, withheld], [routing({})]), "wl")).toEqual({ anthropic: "lane", openai: "hand" });
		expect(builderRoles(view(LANE, [routing({ ran_models: JSON.stringify([OPUS]) })]), "wl")).toEqual({ anthropic: "lane" });
		expect(builderLabs(view([...LANE, withheld], [routing({})]), "wl")).toEqual({ labs: ["anthropic", "openai"], unknown: [] });
	});

	test("an unsettled spawn counts as a review when it was one, a hand when not", () => {
		const spawn = (token: string, review: string) => entry(`hand-spawn: ${token} session /s/lane spawn sl-x review ${review} group dg-1 row ${KIMI}`);
		expect(builderRoles(view([...LANE, spawn("dt-1", "yes")]), "wl")).toEqual({ anthropic: "lane", kimi: "review" });
		expect(builderRoles(view([...LANE, spawn("dt-1", "no")]), "wl")).toEqual({ anthropic: "lane", kimi: "hand" });
	});
});

describe("same-lab order (§ 2.3)", () => {
	const plan = (roles?: Partial<Record<Lab, BuilderRole>>) =>
		reviewPlan({ row: STRONG, usable: [OPUS, SOL], builders: { labs: ["anthropic", "openai"], unknown: [] }, stakes: "normal", grant: true, roles });

	test("the least-involved builder lab goes first; without roles the row order stands; allow is unchanged", () => {
		const ordered = plan({ anthropic: "lane", openai: "hand" });
		expect(ordered).toMatchObject({ kind: "single", models: [SOL, OPUS], sameLab: true });
		expect(plan({ anthropic: "review", openai: "lane" })).toMatchObject({ models: [OPUS, SOL] });
		const plain = plan();
		expect(plain).toMatchObject({ models: [OPUS, SOL] });
		if (ordered.kind !== "single" || plain.kind !== "single") throw new Error("expected single plans");
		expect(ordered.allow).toEqual(plain.allow);
	});
});

describe("Kimi quota refusal (§ 2.4)", () => {
	test("a kimi-lab 429 with quota text while the rule is active; nothing else", () => {
		expect(isKimiQuotaRefusal("moonshot", 429, QUOTA, END - 1)).toBe(true);
		expect(isKimiQuotaRefusal("kimi-code", 429, "exceeded_current_quota", END - 1)).toBe(true);
		expect(isKimiQuotaRefusal("moonshot", 429, QUOTA, END)).toBe(false);
		expect(isKimiQuotaRefusal("moonshot", 429, "429 rate limit reached, retry later", END - 1)).toBe(false);
		expect(isKimiQuotaRefusal("moonshot", 429, null, END - 1)).toBe(false);
		expect(isKimiQuotaRefusal("moonshot", 500, QUOTA, END - 1)).toBe(false);
		expect(isKimiQuotaRefusal("moonshot", 401, QUOTA, END - 1)).toBe(false);
		expect(isKimiQuotaRefusal("openai-codex", 429, QUOTA, END - 1)).toBe(false);
	});
});
