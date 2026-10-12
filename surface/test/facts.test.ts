import { describe, expect, test } from "bun:test";
import type { FactRow } from "../../ledger/src/index";
import { FACTS_BUDGET_BYTES, factLine, factsBlock, readFacts, renderFacts } from "../src/facts";
import { tempLedger } from "./helpers";

// Synthetic facts only, in the live row shape (MIGRATION.md row M8).
const REPO = "/fixture/shipyard";
const row = (n: number, text: string, src = `/fixture/shipyard/notes/n${n}.md:1-2`): FactRow => ({
	id: `en-fixture${String(n).padStart(3, "0")}`, n, tag: "m8-verge-wl1", repo: REPO, src, text, created_at: "2026-10-01T10:00:00.000Z",
});
const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const header = (shown: number, total: number, budget: string) =>
	`## Repo facts (${REPO}): showing ${shown} of ${total} under ${budget} bytes; \`lane_read_facts\` for the rest or another repo`;

describe("factLine", () => {
	test("shortens each src path to its file name and keeps the line range", () => {
		expect(factLine(row(1, "the deploy box is arm64", "/fixture/shipyard/notes/deep/a.md:18-33"))).toBe(
			"- the deploy box is arm64 (en-fixture001; a.md:18-33)");
	});

	test("several src parts, spaces in paths, are each shortened and joined with `, `", () => {
		expect(factLine(row(2, "two sources", "/fixture/My Repo/x.md:1-2,/fixture/My Repo/c d/y z.md:3-40"))).toBe(
			"- two sources (en-fixture002; x.md:1-2, y z.md:3-40)");
	});

	test("a fact with no src carries only its id", () => {
		expect(factLine(row(3, "/fixture/a.md:1-2 lost its separator", ""))).toBe("- /fixture/a.md:1-2 lost its separator (en-fixture003)");
	});
});

describe("renderFacts", () => {
	test("no facts renders nothing at all", () => {
		expect(renderFacts(REPO, [])).toBe("");
		expect(renderFacts(REPO, [], 10)).toBe("");
	});

	test("the default budget is 8,000 bytes and is named in the header", () => {
		expect(FACTS_BUDGET_BYTES).toBe(8000);
		expect(renderFacts(REPO, [row(1, "one")])).toBe(`${header(1, 1, "8,000")}\n- one (en-fixture001; n1.md:1-2)`);
	});

	// ASCII and multibyte text: the budget is UTF-8 bytes, not string length.
	for (const [label, unit, k] of [["ascii", "a", 10], ["multibyte", "漢é🙂", 1]] as const) {
		test(`a block of exactly the budget renders whole; one byte less drops the last fact whole (${label})`, () => {
			const rows = [row(1, unit.repeat(40 * k)), row(2, unit.repeat(30 * k)), row(3, unit.repeat(35 * k))];
			const lines = rows.map(factLine);
			// The block's size depends on the budget only through its formatted width, so pick it in 1,000-9,999.
			const whole = bytes([header(3, 3, "0,000"), ...lines].join("\n"));
			expect(whole).toBeGreaterThan(1001);
			expect(whole).toBeLessThan(10_000);
			const exact = [header(3, 3, whole.toLocaleString("en-US")), ...lines].join("\n");
			expect(bytes(exact)).toBe(whole);
			expect(renderFacts(REPO, rows, whole)).toBe(exact);

			const short = renderFacts(REPO, rows, whole - 1);
			expect(short).toBe([header(2, 3, (whole - 1).toLocaleString("en-US")), lines[0], lines[1]].join("\n"));
			expect(bytes(short)).toBeLessThanOrEqual(whole - 1);
		});
	}

	test("order is kept: a later, smaller fact is never pulled forward past one that does not fit", () => {
		const rows = [row(1, "small first"), row(2, "x".repeat(3000)), row(3, "small last")];
		const out = renderFacts(REPO, rows, 1000);
		expect(out).toBe(`${header(1, 3, "1,000")}\n- small first (en-fixture001; n1.md:1-2)`);
	});

	test("a first fact larger than the budget leaves the header alone, pointing at the tool", () => {
		expect(renderFacts(REPO, [row(1, "y".repeat(5000)), row(2, "tiny")], 1000)).toBe(header(0, 2, "1,000"));
	});

	test("a budget below the header alone clips the header on a code point, ending `…` (item 107's rule), down to 0", () => {
		const wellFormed = (s: string) => new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(s)) === s && !s.includes("\uFFFD");
		expect(renderFacts(REPO, [row(1, "one fact")], 16)).toBe("## Repo facts…");
		expect(renderFacts(REPO, [row(1, "one fact")], 0)).toBe("");
		expect(renderFacts(REPO, [row(1, "one fact")], 1)).toBe("");
		for (const repo of [REPO, "/fixture/漢字é🙂🙂/repo"]) {
			const rows = [{ ...row(1, "one fact"), repo }];
			for (let budget = 0; budget < bytes(renderFacts(repo, rows, 9999)) + 2; budget++) {
				const out = renderFacts(repo, rows, budget);
				const full = `## Repo facts (${repo}): showing 0 of 1 under ${budget.toLocaleString("en-US")} bytes; \`lane_read_facts\` for the rest or another repo`;
				expect(bytes(out)).toBeLessThanOrEqual(budget);
				expect(wellFormed(out)).toBe(true);
				if (bytes(full) <= budget) continue;
				if (budget < bytes("…")) expect(out).toBe("");
				else {
					expect(out.endsWith("…")).toBe(true);
					expect(full.startsWith(out.slice(0, -1))).toBe(true);
					// The longest prefix: the next code point would not fit beside the `…`.
					const next = String.fromCodePoint(full.codePointAt(out.length - 1)!);
					expect(bytes(out) + bytes(next)).toBeGreaterThan(budget);
				}
			}
		}
	});

	test("property: the block never exceeds the budget, shows a prefix of the facts in order, and stops only when the next would cross", () => {
		let seed = 0x5eed;
		const rand = (n: number) => {
			seed = (seed * 1103515245 + 12345) % 2 ** 31;
			return seed % n;
		};
		const alphabet = ["a", "Z", " ", "é", "漢", "🙂", "ß", "::"];
		for (let round = 0; round < 300; round++) {
			const total = 1 + rand(40);
			const rows = Array.from({ length: total }, (_, i) =>
				row(i + 1, Array.from({ length: 1 + rand(160) }, () => alphabet[rand(alphabet.length)]).join(""),
					rand(4) === 0 ? "" : `/fixture/My Repo/d${i}/f ${i}.md:${i}-${i + 3}${rand(3) === 0 ? ",/fixture/e.md:1-2" : ""}`));
			const budget = 400 + rand(6000);
			const out = renderFacts(REPO, rows, budget);
			expect(bytes(out)).toBeLessThanOrEqual(budget);
			const [first, ...shown] = out.split("\n");
			const lines = rows.map(factLine);
			expect(shown).toEqual(lines.slice(0, shown.length));
			expect(first).toBe(header(shown.length, total, budget.toLocaleString("en-US")));
			if (shown.length < total) {
				// The header is sized as if every fact were shown; with the next line the block would cross.
				const next = [header(total, total, budget.toLocaleString("en-US")), ...lines.slice(0, shown.length + 1)].join("\n");
				expect(bytes(next)).toBeGreaterThan(budget);
			}
		}
	});
});

describe("factsBlock", () => {
	test("renders the ledger's facts for the repo, and nothing for a repo without any", () => {
		const { ledger } = tempLedger();
		const wl = ledger.openWorkload({ by: "orch", brief: "migrate memory", stakes: "normal", mode: "autonomous" });
		ledger.recordEntry({ by: "lane-m8", workloadId: wl, kind: "assumption", body: `m8-fact #10 [m8-verge-wl1] repo=${REPO} src=/fixture/shipyard/b.md:3-4 :: second` });
		ledger.recordEntry({ by: "lane-m8", workloadId: wl, kind: "assumption", body: `m8-fact #9 [m8-verge-wl1] repo=${REPO} src=/fixture/shipyard/a.md:1-2 :: first` });
		const [nine, ten] = ledger.facts(REPO);
		expect(factsBlock(ledger, REPO)).toBe(
			`${header(2, 2, "8,000")}\n- first (${nine!.id}; a.md:1-2)\n- second (${ten!.id}; b.md:3-4)`);
		expect(factsBlock(ledger, "/fixture/elsewhere")).toBe("");
	});

	test("a ledger that throws is said in the block, never a silent blank", () => {
		const broken = { facts: (): FactRow[] => { throw new Error("boom"); } };
		expect(factsBlock(broken, REPO)).toBe("## Repo facts: could not be read (boom)");
	});
});

describe("readFacts", () => {
	const rows = [row(1, "Alpha deploys on arm64"), row(2, "beta runs nightly", "/fixture/shipyard/NOTES/ops.md:5-9"), row(3, "gamma alpha")];

	test("without a match: every fact, with the count", () => {
		expect(readFacts(rows, REPO)).toBe([`3 facts for ${REPO}`, ...rows.map(factLine)].join("\n"));
	});

	test("with a match: case-insensitive over text and src, with N of M", () => {
		expect(readFacts(rows, REPO, "ALPHA")).toBe([`2 of 3 match "ALPHA" for ${REPO}`, factLine(rows[0]!), factLine(rows[2]!)].join("\n"));
		expect(readFacts(rows, REPO, "notes/ops")).toBe([`1 of 3 match "notes/ops" for ${REPO}`, factLine(rows[1]!)].join("\n"));
		expect(readFacts(rows, REPO, "zzz")).toBe(`0 of 3 match "zzz" for ${REPO}`);
	});

	test("no budget: far more than 8,000 bytes of facts all come back", () => {
		const many = Array.from({ length: 200 }, (_, i) => row(i + 1, `fact ${i} `.padEnd(150, "x")));
		const out = readFacts(many, REPO);
		expect(bytes(out)).toBeGreaterThan(FACTS_BUDGET_BYTES * 3);
		expect(out.split("\n")).toHaveLength(201);
		expect(out.split("\n")[200]).toBe(factLine(many[199]!));
	});
});
