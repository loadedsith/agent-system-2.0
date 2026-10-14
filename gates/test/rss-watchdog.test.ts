// The memory cap the gate tests put on the omp processes they spawn (gates/test/rss-watchdog.ts;
// workload wl-mv5lrh0drbg0zk, PLAN.md revision 8 "Proofs").
import { describe, expect, test } from "bun:test";
import { physFootprint, startRssWatchdog } from "./rss-watchdog";

describe.skipIf(process.platform !== "darwin")("the RSS watchdog", () => {
	test("reads this process's footprint, and nothing for a pid that is gone", () => {
		const bytes = physFootprint(process.pid);
		expect(bytes).toBeGreaterThan(1024 * 1024);
		expect(bytes).toBeLessThan(64 * 1024 ** 3);
		expect(physFootprint(2 ** 30)).toBeNull();
	});

	test("fires with the reading over the cap, and not under a cap the process is far below", async () => {
		const under: number[] = [];
		// Both poll on the same interval and the under watch started first, so it has read at least as
		// often as the over watch once that one fires.
		const stopUnder = startRssWatchdog({ pid: process.pid, capBytes: 1024 ** 4, intervalMs: 5, onExceed: (b) => under.push(b) });
		const over = await new Promise<number>((resolve) => startRssWatchdog({ pid: process.pid, capBytes: 1, intervalMs: 5, onExceed: resolve }));
		stopUnder();
		expect(over).toBeGreaterThan(1024 * 1024);
		expect(under).toEqual([]);
	});
});
