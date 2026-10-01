// The numbers Jo answers needs-you lines with (MIGRATION.md § M7 follow-ups item 1): every answerable
// line — a waiting reserved request, an open question with options — gets a number that is stable
// for the life of one Numbering (the surface keeps one per session, surface/src/session.ts). A row
// keeps its number from the first time it is numbered; a row new to it gets the next number above
// the highest ever given; a number is never reused, so a stale number on screen can never land on a
// different row. Prompt-wait lines (kind "question", no options) are not answerable at the surface.
import type { ErrorLine } from "./errors";

export interface Target {
	kind: "reserved" | "question";
	workloadId: string;
	rowId: string;
}

/** Is this needs-you line answerable at the surface: a reserved line, or a question line with options (an open question row; prompt-wait lines have no options). */
export function answerable(l: ErrorLine): boolean {
	return l.kind === "reserved" || (l.kind === "question" && l.options !== undefined);
}

export class Numbering {
	#byRow = new Map<string, number>();
	#byNumber = new Map<number, Target>();
	#max = 0;

	/** Sets `n` on every answerable line; a row keeps its number for this object's life; rows new to it get max-given+1 in line order; a number is never reused, even after its row stops appearing. Returns the same lines. */
	assign(lines: ErrorLine[]): ErrorLine[] {
		for (const l of lines) {
			if (!answerable(l)) continue;
			let n = this.#byRow.get(l.rowId);
			if (n === undefined) {
				n = ++this.#max;
				this.#byRow.set(l.rowId, n);
				this.#byNumber.set(n, { kind: l.kind as Target["kind"], workloadId: l.workloadId, rowId: l.rowId });
			}
			l.n = n;
		}
		return lines;
	}

	/** The row number n was given, or null if never given. */
	target(n: number): Target | null {
		return this.#byNumber.get(n) ?? null;
	}

	/** The number a row was given, or null. */
	numberOf(rowId: string): number | null {
		return this.#byRow.get(rowId) ?? null;
	}
}
