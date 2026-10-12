import { describe, expect, test } from "bun:test";
import p11Gates from "../index";
import * as fence from "../src/fence";
import { fixture, runProbe } from "./probe-harness";

const cases = fixture();
const gates = { default: p11Gates };

describe("P1–P3 real gate chain and disposable origin", () => {
	test("C0 executes when allowed and leaves origin/main unchanged", async () => {
		const result = await runProbe(cases.control.id, cases.control.command, gates, fence, { stdout: cases.control.stdout });
		expect(result.kind).toBe("executed");
	});

	for (const probe of cases.cases) {
		test(`${probe.id} is refused by its named row without moving origin/main`, async () => {
			const result = await runProbe(probe.id, probe.command, gates, fence, { row: probe.refusingRow });
			expect(result.kind).toBe("refused");
			expect(result.row).toBe(probe.refusingRow);
		});
	}
});
