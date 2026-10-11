// Ledger replay regression (PLAN wl-mv45yk9llwt3pc rev 5; MIGRATION.md item 85): builderLabs,
// reviewPlan and the needs-you render replayed over every workload of the frozen fixture under
// fixtures/ledger-replay/, compared line by line with its golden.txt. Reads nothing under $HOME, so
// the outside-the-fence runner can run it. One test holds the whole run (unpack, open, replay,
// compare) so Bun's per-test timeout fails it past 60 s.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { diffLines, diffReport, GOLDEN_PATH, replayFixture } from "../scripts/ledger-replay";

test("the ledger replay matches golden.txt line for line", () => {
	const report = diffReport(diffLines(readFileSync(GOLDEN_PATH, "utf8"), replayFixture()));
	if (report) throw new Error(report);
	expect(report).toBe("");
}, 60_000);
