/**
 * The shipped profile's strong-row OpenAI entry (Jo, in-mv8qzqym1ihmv4, 2026-10-14; PLAN.md § 5 of
 * wl-mv71x5rwdu7eo0): openai-codex/gpt-6.1-sol, reached by deep reviews through REVIEW_ROW_FROM,
 * on the real profile/config.yml rather than a fixture table.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { labOf, reviewRow } from "../src/lab";
import { TIERS } from "../src/route";
import { loadTierTable, modelIdentity, tierTableFromConfig } from "../src/tier-table";

const TEMPLATE = join(import.meta.dir, "..", "..", "profile", "config.yml");
const SOL = "openai-codex/gpt-6.1-sol";

describe("profile template: strong-row OpenAI entry is gpt-6.1-sol (in-mv8qzqym1ihmv4)", () => {
	test("the strong row's openai-codex entry is gpt-6.1-sol", () => {
		const table = loadTierTable(TEMPLATE);
		expect(table.strong.filter(entry => entry.startsWith("openai-codex/"))).toEqual([SOL]);
	});

	test("a deep-tier review on the real table gives its OpenAI leg gpt-6.1-sol", () => {
		const table = loadTierTable(TEMPLATE);
		expect(reviewRow(table, "deep").filter(entry => labOf(entry) === "openai")).toEqual([SOL]);
	});

	test("the real table passes the tier-table check, with gpt-6.1-sol in one tier only", () => {
		const table = tierTableFromConfig(Bun.YAML.parse(readFileSync(TEMPLATE, "utf8")));
		expect(TIERS.filter(tier => table[tier].some(entry => modelIdentity(entry) === SOL))).toEqual(["strong"]);
	});
});
