/**
 * The tier files the classifier rewrites dispatches to. A `model:` pin in any of them would let the
 * file override the profile's tier row (SPEC-2.0.md § A1.3 "Names, not models"; DESIGN-2.0.md
 * C3.6 "a role file with its own `model:` pin lets the file override the tier").
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TIERS } from "../src/route";

const TIER_DIR = join(import.meta.dir, "..", "..", "tiers");
const FILES = [...TIERS, "orchestrator", "lane"];

function frontmatter(name: string): Record<string, string> {
	const text = readFileSync(join(TIER_DIR, `${name}.md`), "utf8");
	const block = /^---\n([\s\S]*?)\n---\n/.exec(text);
	if (!block) throw new Error(`${name}.md has no frontmatter`);
	return Object.fromEntries(
		block[1]!.split("\n").map(line => {
			const at = line.indexOf(":");
			return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
		}),
	);
}

describe("tier files", () => {
	test.each(FILES)("%s.md names itself and pins no model", name => {
		const fields = frontmatter(name);
		expect(fields.name).toBe(name);
		expect(fields.description).toBeTruthy();
		expect(fields).not.toHaveProperty("model");
	});

	test("the lane file carries the written half of the no-blocking-prompt row verbatim", () => {
		// DESIGN-2.0.md P-11 row "non-reserved prompts to a human are designed out of lanes".
		expect(readFileSync(join(TIER_DIR, "lane.md"), "utf8")).toContain(
			"a lane opens no blocking human prompt; reserved actions go through the § A4 gate; a material non-reserved choice goes through a `question` row that suspends only dependent work",
		);
	});
});
