// Temporary outside-fence historical proof; remove after the runner records a pass.
import { expect, test } from "bun:test";
import { main } from "../scripts/probe-history";

test("P1–P3 historical landing and current refusal on unpacked trees", async () => {
	expect(await main("857bca080d0674c837b697c28915d8b44bb7149c")).toBe(0);
});
