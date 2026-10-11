// Size lint on the always-loaded tier files (rootstock-os REPORT.md § 3.1; rootstock's
// check_claude_md.py fails past 200 lines or 2,000 tokens, README.md:49-58). Every tier file is the
// whole system prompt of an agent that runs it, so its size is paid on every turn of every session.
//
// Measured 2026-10-11 at e1d7291 with `wc -l -c tiers/*.md` (lines = newline count, bytes = wc -c):
//   orchestrator.md  215 lines  14534 bytes
//   lane.md           60 lines  12198 bytes
//   fast.md           36 lines   3011 bytes
//   standard.md       34 lines   2362 bytes
//   strong.md         36 lines   3162 bytes
//   deep.md           36 lines   3133 bytes
//
// Bound per file and per measure = max(ceil(measured × 1.25), floor). The floor is rootstock's own
// budget: 200 lines, and 2,000 tokens taken as 8,000 bytes at roughly four bytes per token for
// English prose (a heuristic, not a tokenizer count). The floor keeps the small model-tier files from
// failing on an ordinary paragraph; the +25% keeps the two large files from growing unnoticed.
// A file past 85% of a bound prints a warning and still passes; past 100% it fails. The warn line
// sits above 80% because a file at its measured size is at 1/1.25 = 80% of a +25% bound, so a 75%
// line would warn on every run from day one; at 85% a warning means the file has grown.
// Raising a bound is a deliberate edit to this table, with the new measurement in the comment above.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TIER_DIR = join(import.meta.dir, "..");
const WARN_AT = 0.85;

const BOUNDS: Record<string, { lines: number; bytes: number }> = {
	"orchestrator.md": { lines: 269, bytes: 18168 },
	"lane.md": { lines: 200, bytes: 15248 },
	"fast.md": { lines: 200, bytes: 8000 },
	"standard.md": { lines: 200, bytes: 8000 },
	"strong.md": { lines: 200, bytes: 8000 },
	"deep.md": { lines: 200, bytes: 8000 },
};

function measure(name: string): { lines: number; bytes: number } {
	const buf = readFileSync(join(TIER_DIR, name));
	let lines = 0;
	for (const b of buf) if (b === 0x0a) lines++;
	return { lines, bytes: buf.length };
}

describe("always-loaded tier file size", () => {
	test.each(Object.keys(BOUNDS))("%s exists", name => {
		expect(existsSync(join(TIER_DIR, name))).toBe(true);
	});

	test.each(Object.keys(BOUNDS))("%s is within its line and byte bound", name => {
		const bound = BOUNDS[name]!;
		const size = measure(name);
		for (const k of ["lines", "bytes"] as const) {
			if (size[k] > bound[k] * WARN_AT && size[k] <= bound[k]) {
				console.warn(`tiers/${name}: ${size[k]} ${k} is past ${WARN_AT * 100}% of its ${bound[k]}-${k} bound`);
			}
		}
		expect(size.lines).toBeLessThanOrEqual(bound.lines);
		expect(size.bytes).toBeLessThanOrEqual(bound.bytes);
	});
});
