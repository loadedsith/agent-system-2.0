// The projection's pure render (PLAN wl-mv66ylim0gahog § 2, § 9.2): title, block, labels, state
// with first merge wins, and Jo's text outside the as2 markers kept.
import { describe, expect, test } from "bun:test";
import { BLOCK_BEGIN, BLOCK_END, issueTitle, mergeBody, type PrFact, type RenderInput, render, renderHash } from "../src/issues/render";

const pr = (number: number, state: PrFact["state"], base = "main"): PrFact => ({ number, state, base, url: `https://github.com/o/r/pull/${number}` });
const input = (over: Partial<RenderInput> & { status?: "open" | "closed"; holder?: string | null } = {}): RenderInput => ({
	workload: { id: "wl-abc", brief: "Fix the feed header\nmore detail", stakes: "normal", mode: "autonomous", status: over.status ?? "open", holder: over.holder === undefined ? null : over.holder },
	ceiling: "$50 / 6h, nothing spent",
	slices: over.slices ?? { open: 1, paused: 0, done: 2, cancelled: 0 },
	questions: over.questions ?? [],
	prs: over.prs ?? [],
	lastSeq: over.lastSeq ?? 12,
});

describe("render", () => {
	test("title is `<id> — <first line of the brief>`, cut to 80 characters", () => {
		expect(render(input()).title).toBe("wl-abc — Fix the feed header");
		const long = issueTitle("wl-x", "a".repeat(200));
		expect(long.startsWith("wl-x — ")).toBe(true);
		expect(long.length).toBe("wl-x — ".length + 80);
	});

	test("an open workload: open, as2 + running or waiting, question when one is open; the block names holder, slices, questions, PRs and last seq", () => {
		const waiting = render(input());
		expect(waiting).toMatchObject({ state: "open", reason: null, labels: ["as2", "waiting"] });
		expect(waiting.block).toContain("holder: nobody — waiting");
		const running = render(input({ holder: "lane-abc-1", questions: [{ id: "q-1", body: "Which header?\nlong" }], prs: [pr(5, "OPEN")] }));
		expect(running.labels).toEqual(["as2", "question", "running"]);
		expect(running.block.startsWith(BLOCK_BEGIN)).toBe(true);
		expect(running.block.endsWith(BLOCK_END)).toBe(true);
		for (const s of ["holder: lane-abc-1", "- q-1: Which header?", "- https://github.com/o/r/pull/5 open", "ledger seq: 12", "slices: 1 open · 0 paused · 2 done · 0 cancelled", "ceiling: $50 / 6h"]) {
			expect(running.block).toContain(s);
		}
		// A merged PR never closes the issue of an open workload: the ledger is the truth.
		expect(render(input({ prs: [pr(5, "MERGED")] })).state).toBe("open");
	});

	test("first merge wins: closed workload, A MERGED + B OPEN ⇒ closed completed; B later closed unmerged changes nothing", () => {
		const both = render(input({ status: "closed", prs: [pr(1, "MERGED"), pr(2, "OPEN")] }));
		expect(both).toMatchObject({ state: "closed", reason: "completed", labels: ["as2"] });
		const later = render(input({ status: "closed", prs: [pr(1, "MERGED"), pr(2, "CLOSED")] }));
		expect(later).toMatchObject({ state: "closed", reason: "completed", labels: ["as2"] });
		expect(renderHash(later)).not.toBe(renderHash(both)); // the block shows B's state; state and labels do not move
	});

	test("A CLOSED unmerged + B OPEN ⇒ open awaiting-merge", () => {
		expect(render(input({ status: "closed", prs: [pr(1, "CLOSED"), pr(2, "OPEN")] }))).toMatchObject({ state: "open", reason: null, labels: ["as2", "awaiting-merge"] });
	});

	test("every PR closed unmerged ⇒ closed not planned + unmerged", () => {
		expect(render(input({ status: "closed", prs: [pr(1, "CLOSED"), pr(2, "CLOSED")] }))).toMatchObject({ state: "closed", reason: "not planned", labels: ["as2", "unmerged"] });
	});

	test("no PR: closed completed, or not planned when every slice was cancelled and none done", () => {
		expect(render(input({ status: "closed" }))).toMatchObject({ state: "closed", reason: "completed", labels: ["as2"] });
		expect(render(input({ status: "closed", slices: { open: 0, paused: 0, done: 0, cancelled: 3 } }))).toMatchObject({ state: "closed", reason: "not planned" });
		expect(render(input({ status: "closed", slices: { open: 0, paused: 0, done: 1, cancelled: 3 } }))).toMatchObject({ state: "closed", reason: "completed" });
		expect(render(input({ status: "closed", slices: { open: 0, paused: 0, done: 0, cancelled: 0 } }))).toMatchObject({ state: "closed", reason: "completed" });
	});
});

describe("mergeBody", () => {
	const block = `${BLOCK_BEGIN}\nnew\n${BLOCK_END}`;

	test("Jo's text outside the markers is kept byte for byte", () => {
		const remote = `Jo's note above\n\n${BLOCK_BEGIN}\nold\n${BLOCK_END}\n\nJo's note below`;
		expect(mergeBody(remote, block)).toBe(`Jo's note above\n\n${block}\n\nJo's note below`);
	});

	test("an empty body is the block; a body with no block gets the block on top and keeps its text", () => {
		expect(mergeBody("", block)).toBe(block);
		expect(mergeBody("Jo filed this", block)).toBe(`${block}\n\nJo filed this`);
	});

	test("an unchanged block yields the remote body unchanged", () => {
		const remote = `x\n${block}\ny`;
		expect(mergeBody(remote, block)).toBe(remote);
	});
});
