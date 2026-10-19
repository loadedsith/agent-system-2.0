/**
 * The Kimi findings parse (PLAN wl-mv654hoqwpfhmo § 10, PR-K; split A10): real review replies as
 * fixtures under fixtures/kimi-findings/, trimmed to the block and its surroundings.
 *
 * A10 read every Kimi `review-round:` recorded `blocking unknown` (157 of 241 on 2026-10-19). 52 had
 * no reply (403 subscription, 429 balance suspension, provider errors, hands lost). In the other 105,
 * what the classifier was delivered (the hand's yield payload, OMP's `<agent>.md`) never held a block
 * `parseFindings` should have read: no conformant miss. The model did write a valid block, but in its
 * own assistant text: in a turn of its own before the yield (37), or split around the yield call, the
 * closing fence a separate text part after it (59). Nine wrote none that is valid: eight no block at
 * all, one a block whose kind is outside the list.
 *
 * Sources (session file under ~/.agent-system-2/lanes/, ledger `review-round:` entry; "message n of m"
 * counts the session's assistant messages from 0):
 * - kimi-transcript-runner.md: wl-muraerdsgw7gn4/sessions/2026-10-02T18-19-14-528Z_…/sl-plan-runner--kimi.jsonl
 *   assistant message 22 of 24 (en-murcioa9serr40); kimi-delivered-objects.json is the same hand's `.md`.
 * - kimi-transcript-empty.md: wl-mv6uqrx6d1tjb4/sessions/2026-10-14T01-54-08-585Z_…/sl-audhd-review-2.jsonl
 *   message 26 of 28 (en-mv7lob8vmltv9c).
 * - kimi-split-row6.json: wl-mv457r7iqmq29s/sessions/2026-10-12T00-00-26-467Z_…/sl-plan-row6-3.jsonl
 *   message 17 of 18 (en-mv4np6u59ijzeo); kimi-delivered-prose.json is the same hand's `.md`.
 * - kimi-split-sendline.json: wl-mv66ylg1op3wg0/sessions/2026-10-14T01-54-08-381Z_…/sl-sendline-review.jsonl
 *   message 79 of 80 (en-mv7hxgkya55yf4).
 * - kimi-delivered-bad-escape.json: wl-mv0n5r9cbafe9s/sessions/2026-10-09T07-26-04-752Z_…/sl-plan-alias--kimi-2.md
 *   (en-mv0pbjpr0u5q80): its yield string copies the block with `\x69` unescaped, so its JSON is invalid.
 * - kimi-delivered-pointer.json: wl-mv4xdju27wwdfk/sessions/2026-10-12T07-23-11-160Z_…/sl-plan-unwrap--kimi.md
 *   (en-mv4y604eg80yrk).
 * - kimi-transcript-bad-kind.md: wl-mv8cvw0lq3rlds/sessions/2026-10-14T17-05-58-585Z_…/sl-plan-as2ilex-2.jsonl
 *   message 18 of 20 (en-mv8dw6nxv4h91c): kind `feasibility` is outside the list.
 * - kimi-noblock-objects.json: wl-mv6zl15365nf9c/sessions/2026-10-13T18-00-30-344Z_…/sl-plan-privdata--kimi.md
 *   (en-mv70p7ezyx9h4w), its `verdict` and `findings` only: a hand that wrote no block in any turn.
 * - openai-delivered-snapshot-settle.json: wl-muq13bkdghblmo/sessions/2026-10-01T21-10-37-560Z_…/sl-plan-snapshot-settle.md
 *   (en-muq1estojfkkg0, gpt-6-sol); openai-delivered-byhand.json:
 *   wl-mvb9mw00ycfjeo/sessions/2026-10-16T19-40-00-385Z_…/sl-plan-byhand-6.md (en-mvfnvxn0xo0rnk, gpt-6.1-sol).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REVIEW_FINDINGS_PARAGRAPH } from "../extension";
import { type Findings, type FindingsOrUnknown, parseFindings, UNKNOWN } from "../src/rounds";

const fixture = (name: string) => readFileSync(join(import.meta.dir, "fixtures", "kimi-findings", name), "utf8");

/**
 * The findings in a delivered reply as extension.ts `findingsIn` reads them: the text itself, then
 * every string value of a yielded JSON payload, one per line.
 */
function deliveredFindings(text: string): FindingsOrUnknown {
	const direct = parseFindings(text);
	if (direct !== UNKNOWN) return direct;
	let json: unknown;
	try {
		json = JSON.parse(text.trim());
	} catch {
		return UNKNOWN;
	}
	const strings: string[] = [];
	const walk = (x: unknown): void => {
		if (typeof x === "string") strings.push(x);
		else if (Array.isArray(x)) x.forEach(walk);
		else if (typeof x === "object" && x !== null) Object.values(x).forEach(walk);
	};
	walk(json);
	return parseFindings(strings.join("\n"));
}

const counted = (f: FindingsOrUnknown): Findings => {
	if (f === UNKNOWN) throw new Error("expected findings, got unknown");
	return f;
};

const NONE: Findings["counts"] = { blocking: {}, major: {}, minor: {} };

describe("Kimi review replies whose rounds were recorded blocking unknown (A10)", () => {
	test("a block the Kimi model wrote in a turn of its own gives its counts", () => {
		const cases: [string, Findings["counts"], number][] = [
			["kimi-transcript-runner.md", { blocking: { security: 1, correctness: 1 }, major: { design: 2 }, minor: { correctness: 3, docs: 2, design: 1 } }, 10],
			["kimi-transcript-empty.md", NONE, 0],
		];
		for (const [name, counts, titles] of cases) {
			const f = counted(parseFindings(fixture(name)));
			expect({ name, counts: f.counts, titles: f.titles.length }).toEqual({ name, counts, titles });
		}
	});

	test("a block split around the yield call is unknown in its first text part and gives its counts with the closing part", () => {
		const cases: [string, Findings["counts"]][] = [
			["kimi-split-row6.json", { blocking: { tests: 1 }, major: { design: 1 }, minor: { docs: 1 } }],
			["kimi-split-sendline.json", { blocking: { correctness: 1 }, major: {}, minor: { tests: 1, correctness: 1, other: 1, docs: 1 } }],
		];
		for (const [name, counts] of cases) {
			const { between, parts } = JSON.parse(fixture(name)) as { between: string; parts: string[] };
			expect(between).toBe("toolCall yield");
			expect(parts[1]).toBe("```");
			expect({ name, first: parseFindings(parts[0]) }).toEqual({ name, first: UNKNOWN });
			expect({ name, counts: counted(parseFindings(parts.join("\n"))).counts }).toEqual({ name, counts });
		}
	});

	test("a non-conformant reply stays unknown, read directly or through a yielded payload's strings", () => {
		const names = [
			"kimi-delivered-objects.json",
			"kimi-delivered-bad-escape.json",
			"kimi-delivered-pointer.json",
			"kimi-delivered-prose.json",
			"kimi-transcript-bad-kind.md",
			"kimi-noblock-objects.json",
		];
		for (const name of names) {
			const text = fixture(name);
			expect({ name, direct: parseFindings(text), delivered: deliveredFindings(text) }).toEqual({ name, direct: UNKNOWN, delivered: UNKNOWN });
		}
	});
});

describe("the findings paragraph appended to review briefs", () => {
	test("it carries a complete example block that parseFindings parses", () => {
		expect(parseFindings(REVIEW_FINDINGS_PARAGRAPH)).not.toBe(UNKNOWN);
	});
});

describe("OpenAI replies whose rounds were counted", () => {
	test("each delivered payload keeps the counts its review-round entry recorded", () => {
		const cases: [string, Findings["counts"]][] = [
			["openai-delivered-snapshot-settle.json", { blocking: { security: 1 }, major: { correctness: 1 }, minor: { tests: 1 } }],
			["openai-delivered-byhand.json", NONE],
		];
		for (const [name, counts] of cases) {
			expect({ name, counts: counted(deliveredFindings(fixture(name))).counts }).toEqual({ name, counts });
		}
	});
});
