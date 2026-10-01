// The decision log read as context at workload open (entries newer than the last 2.0 workload on
// the repo; superseded ones dropped) and rendered at close (filename scheme, frontmatter scalars,
// the four headings, content from the ledger).
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { decisionLogContext, lastWorkloadOn, localOffset, parseFrontmatter, readLog, recordRepo, renderClose, repoOf, section, stamp } from "../src/decision-log";
import { recordIdentity } from "../src/identity";
import { clock, tempLedger, tmp, workloadWithSlice } from "./helpers";

const entry = (dir: string, name: string, fm: Record<string, string>, body: string) => {
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), `---\n${Object.entries(fm).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n${body}`);
};

describe("read at open", () => {
	test("frontmatter is read the plugin parser's way: lower-cased keys, quotes and # comments stripped", () => {
		const { frontmatter, body } = parseFrontmatter('---\nStatus: "resolved" # done\ndurable: true\n---\n\n# T\n\nbody');
		expect(frontmatter).toEqual({ status: "resolved", durable: "true" });
		expect(body.trim()).toBe("# T\n\nbody");
		expect(parseFrontmatter("no frontmatter").frontmatter).toEqual({});
	});

	test("entries newer than the last 2.0 workload on the repo are rendered; superseded ones dropped; sections extracted", () => {
		const c = clock("2026-10-05T12:00:00.000Z");
		const { ledger } = tempLedger(c.now);
		const repo = tmp("repo");
		const dir = join(repo, ".ai", "decision-log");
		entry(dir, "2026-10-01--0900--plumb--old-one.md", { status: "resolved", durable: "false", date: "2026-10-01T09:00:00Z" }, "## Decisions made (and why)\n\n- old decision\n");
		entry(dir, "2026-10-03--0900--plumb--superseded-one.md", { status: "resolved", date: "2026-10-03T09:00:00Z" }, "## Decisions made (and why)\n\n- superseded decision\n");
		entry(dir, "2026-10-04--0900--plumb--new-one.md", { status: "open", durable: "true", supersedes: "2026-10-03--0900--plumb--superseded-one.md", date: "2026-10-04T09:00:00Z" }, "# New\n\n## What changed\n\n- x\n\n## Decisions made (and why)\n\n- new decision\n\n## Heads-up for whoever touches this next\n\n- watch out\n");
		expect(readLog(dir).map((e) => basename(e.path))).toEqual(["2026-10-01--0900--plumb--old-one.md", "2026-10-03--0900--plumb--superseded-one.md", "2026-10-04--0900--plumb--new-one.md"]);
		// a prior 2.0 workload on this repo closed on 2026-10-02
		c.at("2026-10-02T00:00:00.000Z");
		const prior = ledger.openWorkload({ by: "surface", brief: "earlier", stakes: "normal", mode: "autonomous" });
		recordRepo(ledger, prior, repo);
		ledger.closeWorkload(prior, { by: "surface" });
		expect(lastWorkloadOn(ledger, repo)).toBe("2026-10-02T00:00:00.000Z");
		expect(repoOf(ledger, prior)).toBe(repo);
		expect(lastWorkloadOn(ledger, "/elsewhere")).toBeNull();
		const text = decisionLogContext(dir, { since: lastWorkloadOn(ledger, repo), now: "2026-10-05T12:00:00.000Z" });
		expect(text).toContain("since the last 2.0 workload closed 2026-10-02T00:00:00.000Z");
		expect(text).toContain("new decision");
		expect(text).toContain("watch out");
		expect(text).not.toContain("old decision");
		expect(text).not.toContain("superseded decision");
		// no prior workload: the last 14 days, capped
		const all = decisionLogContext(dir, { since: null, now: "2026-10-05T12:00:00.000Z" });
		expect(all).toContain("old decision");
		expect(all).not.toContain("superseded decision");
		expect(decisionLogContext(join(repo, "nope"))).toBe("");
		expect(section("## A\n\nx\n\n## B\n\ny", "B")).toBe("y");
	});
});

describe("render at close", () => {
	test("one entry in the filename scheme with the frontmatter scalars and four headings, from the ledger, authored by the orchestrator's name", () => {
		const c = clock("2026-10-06T15:04:00.000Z");
		const { ledger } = tempLedger(c.now);
		recordIdentity(ledger, "Sable Quill", "they/them");
		const { wl, sl } = workloadWithSlice(ledger, { brief: "Fix the feed header offset" });
		const sl2 = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "Try a media query first", doneCondition: "x", inputs: "a.css" });
		ledger.cancelSlice(sl2, { by: "lane-a" });
		const q = ledger.raiseQuestion({ by: "lane-a", workloadId: wl, sliceId: sl, body: "Token name?", options: ["header-offset", "nav-offset"] });
		ledger.answerQuestion(q, { by: "surface", answer: "header-offset", author: "jo", channel: "surface" });
		ledger.recordInstruction({ by: "surface", workloadId: wl, body: "keep the old class name too", author: "jo", channel: "surface" });
		ledger.recordEntry({ by: "lane-a", workloadId: wl, sliceId: sl, kind: "assumption", body: "the token lives in tokens.css" });
		ledger.completeSlice(sl, { by: "lane-a", artifact: "bun test exit 0" });
		const dir = join(tmp("log"), "decision-log");
		const r = renderClose(ledger, wl, dir, { name: "Sable Quill", pronouns: "they/them", entryId: "en-x" }, { now: c.now(), session: "sess-1" });
		const { day, hhmm } = stamp(c.now());
		expect(basename(r.path)).toBe(`${day}--${hhmm}--sable-quill--fix-the-feed-header-offset.md`);
		expect(existsSync(r.path)).toBe(true);
		const text = readFileSync(r.path, "utf8");
		const { frontmatter } = parseFrontmatter(text);
		expect(frontmatter).toMatchObject({ status: "resolved", durable: "false", supersedes: "", session: "sess-1", date: localOffset(c.now()), engineer: "Sable Quill" });
		expect(Date.parse(frontmatter.date!)).toBe(Date.parse(c.now()));
		expect(section(text, "What changed")).toContain(`${sl}: Move the header offset into a token — artifact: bun test exit 0`);
		expect(section(text, "Decisions made")).toContain('jo answered "header-offset"');
		expect(section(text, "Decisions made")).toContain("keep the old class name too");
		expect(section(text, "Decisions made")).toContain("the token lives in tokens.css");
		expect(section(text, "Dead ends")).toContain(`${sl2} cancelled: Try a media query first`);
		expect(section(text, "Heads-up")).toBe("- none");
		expect(text).toContain("Rendered from the ledger by Sable Quill (they/them)");
	});

	test("write: false renders without touching disk; a missing workload throws", () => {
		const { ledger } = tempLedger();
		const { wl } = workloadWithSlice(ledger);
		const dir = join(tmp("log"), "decision-log");
		const r = renderClose(ledger, wl, dir, null, { write: false });
		expect(existsSync(r.path)).toBe(false);
		expect(basename(r.path)).toMatch(/--orchestrator--/);
		expect(section(r.text, "Heads-up")).toContain("still open");
		expect(() => renderClose(ledger, "wl-none", dir, null)).toThrow(/no workload/);
	});

	test("each reserved request in Heads-up says why it closed; a withdrawal is not repeated as a decision (MIGRATION.md item 31)", () => {
		const { ledger } = tempLedger();
		const { wl, sl } = workloadWithSlice(ledger);
		expect(ledger.claimWorkload(wl, { by: "lane-a", holder: "lane-a", leaseMs: 3_600_000 }).won).toBe(true);
		const request = (body: string, by = "lane-a") => ledger.recordEntry({ by, workloadId: wl, sliceId: sl, kind: "reserved-request", body });
		const decide = (word: string, en: string) => ledger.recordInstruction({ by: "surface", workloadId: wl, body: `${word} ${en}`, author: "jo", channel: "surface" });
		const approved = request("push: git push origin main (P-11 row 6 refused tool call c1)");
		decide("approve", approved);
		const denied = request("deploy: fly deploy (P-11 row 6 refused tool call c2)");
		decide("deny", denied);
		const stopped = request("kubectl: kubectl delete ns x (P-11 row 6 refused tool call c5)");
		ledger.releaseWorkload(wl, { by: "lane-a", holder: "lane-a" });
		// relaunched as lane-b, which still holds the workload when the log renders
		expect(ledger.claimWorkload(wl, { by: "lane-starter", holder: "lane-b", leaseMs: 3_600_000 }).won).toBe(true);
		const older = request("rm: rm -rf build (P-11 row 6 refused tool call c3)", "lane-b");
		const newer = request("rm: rm -rf build (P-11 row 6 refused tool call c4)", "lane-b");
		ledger.recordEntry({ by: "lane-b", workloadId: wl, kind: "assumption", body: `reserved-withdrawn: ${newer} built elsewhere` });
		const never = request("scp: scp a b (P-11 row 6 refused tool call c6)", "lane-9999");
		const r = renderClose(ledger, wl, join(tmp("log"), "decision-log"), null, { write: false });
		const heads = section(r.text, "Heads-up");
		expect(heads).toContain(`- reserved request ${approved}: push: git push origin main (P-11 row 6 refused tool call c1) — approved`);
		expect(heads).toContain(`- reserved request ${denied}: deploy: fly deploy (P-11 row 6 refused tool call c2) — denied`);
		expect(heads).toContain(`- reserved request ${older}: rm: rm -rf build (P-11 row 6 refused tool call c3) — superseded by ${newer}`);
		expect(heads).toContain(`- reserved request ${newer}: rm: rm -rf build (P-11 row 6 refused tool call c4) — withdrawn by lane-b: built elsewhere`);
		expect(heads).toContain(`- reserved request ${stopped}: kubectl: kubectl delete ns x (P-11 row 6 refused tool call c5) — closed: lane-a stopped holding the workload`);
		expect(heads.split("\n")).toContain(`- reserved request ${never}: scp: scp a b (P-11 row 6 refused tool call c6)`);
		expect(section(r.text, "Decisions made")).not.toContain("reserved-withdrawn");
	});
});
