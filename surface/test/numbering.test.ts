// The session-stable numbers Jo answers needs-you lines with (wl-mupqck4ix2kjy8 PLAN.md D1, D2):
// a row keeps its number, a new row gets max+1 whatever its position, a number is never reused,
// and only reserved lines and question lines with options are numbered.
import { describe, expect, test } from "bun:test";
import type { ErrorLine } from "../src/errors";
import { Numbering, answerable } from "../src/numbering";

const line = (kind: ErrorLine["kind"], rowId: string, options?: string[]): ErrorLine => ({ kind, workloadId: "wl-1", rowId, line: `${kind} ${rowId}`, ...(options ? { options } : {}) });
const reserved = (id: string) => line("reserved", id);
const question = (id: string) => line("question", id, ["a", "b"]);
const numbers = (lines: ErrorLine[]) => lines.map((l) => [l.rowId, l.n]);

describe("Numbering", () => {
	test("a row keeps its number across repeated assigns; a new row gets max+1 even when it sorts before existing lines", () => {
		const n = new Numbering();
		expect(numbers(n.assign([reserved("en-1"), question("q-1")]))).toEqual([["en-1", 1], ["q-1", 2]]);
		expect(numbers(n.assign([reserved("en-1"), question("q-1")]))).toEqual([["en-1", 1], ["q-1", 2]]);
		expect(numbers(n.assign([reserved("en-0"), reserved("en-1"), question("q-1")]))).toEqual([["en-0", 3], ["en-1", 1], ["q-1", 2]]);
	});

	test("a number whose row disappeared is never given to a new row, and the row keeps it if it comes back", () => {
		const n = new Numbering();
		n.assign([reserved("en-1"), question("q-1"), question("q-2")]);
		expect(numbers(n.assign([reserved("en-1"), question("q-3")]))).toEqual([["en-1", 1], ["q-3", 4]]);
		expect(numbers(n.assign([question("q-9"), question("q-2")]))).toEqual([["q-9", 5], ["q-2", 3]]);
	});

	test("target(n) and numberOf(rowId) round-trip; numbers and rows never given are null", () => {
		const n = new Numbering();
		n.assign([reserved("en-1"), { ...question("q-1"), workloadId: "wl-2" }]);
		expect(n.target(1)).toEqual({ kind: "reserved", workloadId: "wl-1", rowId: "en-1" });
		expect(n.target(2)).toEqual({ kind: "question", workloadId: "wl-2", rowId: "q-1" });
		expect(n.numberOf("q-1")).toBe(2);
		expect(n.target(n.numberOf("en-1")!)!.rowId).toBe("en-1");
		expect(n.target(3)).toBeNull();
		expect(n.target(0)).toBeNull();
		expect(n.numberOf("q-unknown")).toBeNull();
	});

	test("a prompt-wait line (question, no options) and held / artifact / lane-died / due lines get no number and take none", () => {
		const n = new Numbering();
		const unanswerable = [line("question", "m-wait"), line("held", "m-1"), line("artifact", "sl-1"), line("lane-died", "m-2"), line("due", "wl-9")];
		expect(unanswerable.some(answerable)).toBe(false);
		const out = n.assign([...unanswerable, question("q-1")]);
		expect(out.map((l) => l.n)).toEqual([undefined, undefined, undefined, undefined, undefined, 1]);
		expect(n.numberOf("m-wait")).toBeNull();
	});
});
