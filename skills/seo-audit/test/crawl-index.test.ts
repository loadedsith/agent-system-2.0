// Fixture tests for the crawl/index rule family (scripts/rules/crawl-index.ts): rules.md categories robots, indexing,
// canonical, http and sitemap. Every fixture under test/fixtures/ is served on its loopback port and audited offline
// from its recorded rendered pages; the emissions must equal the fixture's expect.json as a multiset of
// (rule, path, locator, kind, severity, layer). Re-record with `bun skills/seo-audit/test/record-fixtures.ts`.
import { beforeAll, describe, expect, test } from "bun:test";
import { loadCatalogue } from "../scripts/lib/catalogue.ts";
import { type AuditRun, auditFixture, compareOccurrences, fixtureNames, loadExpect } from "./harness.ts";

const FAMILY: Record<string, true> = { robots: true, indexing: true, canonical: true, http: true, sitemap: true };
const CONTROLS = ["control-basic", "control-sitemap", "control-intent"];

const catalogue = loadCatalogue();
const familyIds = [...catalogue.rules.values()].filter((r) => FAMILY[r.category] && r.mode === "mechanical").map((r) => r.id);
const names = fixtureNames();
const runs = new Map<string, AuditRun>();

beforeAll(async () => {
	const done = await Promise.all(names.map(async (n) => [n, await auditFixture(n)] as const));
	for (const [n, r] of done) runs.set(n, r);
}, 50_000);

describe("fixtures match expect.json", () => {
	for (const name of names) {
		test(name, () => {
			const run = runs.get(name);
			expect(run?.stderr ?? "").not.toContain("seo-audit failed");
			expect(run?.code).toBe(0);
			expect(compareOccurrences(loadExpect(name), run?.emissions ?? [], "recorded")).toEqual({ missing: [], unexpected: [] });
		});
	}
});

test("every mechanical crawl/index rule is planted in some expect.json", () => {
	expect(familyIds.length).toBeGreaterThan(0);
	const planted: Record<string, true> = {};
	for (const name of names) for (const o of loadExpect(name)) planted[o.rule] = true;
	expect(familyIds.filter((id) => !planted[id])).toEqual([]);
});

test("the engine implements every mechanical crawl/index rule", () => {
	const run = runs.get("control-basic");
	expect(run?.notImplemented.length).toBeGreaterThan(0); // other families are still unimplemented
	expect(familyIds.filter((id) => run?.notImplemented.includes(id))).toEqual([]);
});

test("crawl/index controls produce zero findings", () => {
	for (const name of CONTROLS) {
		const findings = (runs.get(name)?.emissions ?? []).filter((e) => e.kind === "finding");
		expect(`${name}: ${findings.map((f) => `${f.rule} ${f.path} ${f.locator}`).join("; ")}`).toBe(`${name}: `);
		expect(runs.get(name)?.verdict).toBe("clean");
	}
});

// The family's do-not-flag notes appear in the fixture do-not-flag.md names in its planted-in column.
test("the family's do-not-flag notes appear where do-not-flag.md says they are planted", () => {
	const missing: string[] = [];
	for (const id of ["DNF-07", "DNF-08", "DNF-10", "DNF-11", "DNF-16", "DNF-25", "NF-BNG-1", "NF-BNG-3"]) {
		const fixture = catalogue.dnf.get(id)?.plantedIn.match(/^test\/fixtures\/([^/]+)\//)?.[1] ?? "";
		if (!runs.get(fixture)?.emissions.some((e) => e.rule === id && e.kind === "dnf-note")) missing.push(`${id} in ${fixture}`);
	}
	expect(missing).toEqual([]);
});

test("intent noindex turns IDX-001 into an observation and keeps IDX-002/IDX-003 findings", () => {
	const intent = runs.get("control-intent")?.emissions ?? [];
	expect(intent.filter((e) => e.rule === "IDX-001").map((e) => [e.path, e.kind])).toEqual([["/private", "observation"]]);
	const keep = runs.get("intent-keep")?.emissions ?? [];
	expect(keep.filter((e) => e.rule === "IDX-002" || e.rule === "IDX-003").map((e) => e.kind)).toEqual(["finding", "finding"]);
	expect(keep.filter((e) => e.rule === "IDX-001" || e.rule === "RBT-012").map((e) => e.kind)).toEqual(["observation", "observation"]);
});
