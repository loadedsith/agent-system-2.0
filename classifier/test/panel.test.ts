/**
 * classifier/src/panel.ts (PLAN wl-mv5m7qvgkxhpj4 § 3; CONTRACT.md §§ 2–4): the entry bodies, ingest,
 * tamper evidence, publication, the breach audit, timeouts and spawn admission, on a real temp
 * ledger and real files.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { handSettledBody, handSpawnBody, type Lab } from "../src/lab";
import {
	assignIds,
	auditSession,
	breachOf,
	finalizeLegs,
	finishSynth,
	legHeld,
	namesPanelsDir,
	ingestRun,
	type LegLine,
	panelDir,
	panelGroupBody,
	panelGroups,
	panelLegBody,
	panelPublishedBody,
	panelSynthBody,
	panelSynthEndBody,
	panelVoidBody,
	parseManifest,
	parsePanelGroup,
	parsePanelLeg,
	parsePanelPublished,
	parsePanelSynth,
	parsePanelVoid,
	schemaProblem,
	sweepPanels,
	synthHeld,
	words,
	writeLeg,
	writeSynthEnd,
} from "../src/panel";

const LABS: Lab[] = ["anthropic", "openai", "kimi"];
const MODEL: Record<Lab, string> = { anthropic: "anthropic/claude-fable-5-1", openai: "openai-codex/gpt-6-astra", kimi: "moonshot/kimi-k3" };
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

type Mode = "triad" | "quorum-refute";

/** A staging run as prep writes it: a packet per leg in quorum-refute, one shared packet otherwise. */
function stagingRun(dir: string, opts: { mode?: Mode; workload?: string; slice?: string; legTimeoutMin?: Record<string, number> } = {}) {
	const run = join(dir, "staging", `run-${Math.random().toString(36).slice(2)}`);
	const files: Record<string, string> = {
		"leg.schema.json": JSON.stringify({ type: "object", required: ["items"], properties: { items: { type: "array", items: { type: "object", required: ["title"] } } } }),
		"synth.md": "synthesise\n",
		"synth.schema.json": JSON.stringify({ type: "object", required: ["markdown"] }),
	};
	const legInputs: Record<Lab, string[]> = { anthropic: [], openai: [], kimi: [] };
	if (opts.mode === "quorum-refute") {
		for (const lab of LABS) {
			files[`legs/${lab}/packet.md`] = `packet for ${lab}\n`;
			legInputs[lab] = [`legs/${lab}/packet.md`];
		}
	} else {
		files["packet.md"] = "the packet\n";
		for (const lab of LABS) legInputs[lab] = ["packet.md"];
	}
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(join(run, rel, ".."), { recursive: true });
		writeFileSync(join(run, rel), text);
	}
	const manifest = {
		version: 1,
		mode: opts.mode ?? "triad",
		workload: opts.workload ?? "wl-p",
		slice: opts.slice ?? "sl-p",
		createdAt: "2026-10-01T00:00:00Z",
		repoAccess: false,
		repo: null,
		legSchema: "leg.schema.json",
		synthPrompt: "synth.md",
		synthSchema: "synth.schema.json",
		legTimeoutMin: opts.legTimeoutMin ?? { default: 30 },
		inputs: Object.fromEntries(Object.entries(files).map(([rel, text]) => [rel, sha(text)])),
		legInputs,
		synthInputs: [],
		withheld: [],
		canary: null,
	};
	writeFileSync(join(run, "manifest.json"), JSON.stringify(manifest));
	return run;
}

/** A ledger with workload `wl-p`, slice `sl-p`, a lane root, and one ingested panel group with a token per lab. */
function fixture(opts: { mode?: Mode; legTimeoutMin?: Record<string, number> } = {}) {
	const dir = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "panel-"));
	dirs.push(dir);
	const ledger = Ledger.open(join(dir, "ledger.db"), { create: true, backup: false });
	const wl = ledger.openWorkload({ id: "wl-p", brief: "panel", stakes: "production", mode: "autonomous", by: "orch-test" });
	ledger.addSlice({ id: "sl-p", workloadId: wl, task: "t", doneCondition: "d", inputs: "i", by: "lane-test" });
	const root = join(dir, "sessions", "lane");
	mkdirSync(root, { recursive: true });
	const run = stagingRun(dir, opts);
	const pg = "pg-test1";
	const pdir = panelDir(ledger.path, wl, pg);
	const ingested = ingestRun(run, wl, "sl-p", pdir);
	const members = { anthropic: "dt-a", openai: "dt-o", kimi: "dt-k" } as Record<Lab, string | null>;
	ledger.recordEntry({ by: "lane-test", workloadId: wl, sliceId: "sl-p", kind: "assumption", body: panelGroupBody(pg, { run: ingested.run, pdir, slice: "sl-p", mode: ingested.manifest.mode, inputs: ingested.inputs, members }) });
	const at = { workloadId: wl, by: "lane-test" };
	/** Lab `lab`'s hand settled: its routing row, `hand-settled:`, its result file, and (unless `line` is false) its landed line. */
	const land = (lab: Lab, output: string, line = true) => {
		const agentId = `sl-p--${lab}`;
		const routingId = ledger.recordRouting({
			by: "lane-test",
			workloadId: wl,
			sliceId: "sl-p",
			sessionRoot: root,
			agentId,
			kind: "judge",
			confidence: 0.9,
			probabilities: { judge: 0.9 },
			classifiedTier: "deep",
			tier: "deep",
			models: [MODEL[lab]],
			judgeModel: "jev",
			outcome: "ran",
			ranModels: [MODEL[lab]],
		});
		ledger.recordEntry({ by: "lane-test", workloadId: wl, sliceId: "sl-p", kind: "assumption", body: handSettledBody(members[lab]!, routingId) });
		writeFileSync(join(root, `${agentId}.md`), output);
		if (line) ledger.write(() => writeLeg(ledger, at, pg, lab, { status: "landed", sha: sha(output) }));
	};
	const state = () => panelGroups(ledger.entries(wl)).get(pg)!;
	return { dir, ledger, wl, root, run: ingested.run, pg, pdir, at, land, state, manifest: ingested.manifest };
}

const reply = (...titles: string[]) => JSON.stringify({ items: titles.map(title => ({ title })) });

describe("entry bodies", () => {
	test("every panel entry body round-trips through its parser", () => {
		const group = { run: "/r", pdir: "/l/lanes/wl/panels/pg-1", slice: "sl-a", mode: "triad" as const, inputs: { "packet.md": "a".repeat(64) }, members: { anthropic: "dt-1", openai: null, kimi: "dt-3" } };
		expect(parsePanelGroup(panelGroupBody("pg-1", group))).toEqual({ pg: "pg-1", ...group });
		const lines: LegLine[] = [{ status: "landed", sha: "b".repeat(64) }, { status: "missing", reason: "timeout" }, { status: "excluded", call: "read names withheld/x" }];
		for (const line of lines) expect(parsePanelLeg(panelLegBody("pg-1", "kimi", line))).toEqual({ pg: "pg-1", lab: "kimi", line });
		expect(parsePanelSynth(panelSynthBody("pg-1", "dt-9"))).toEqual({ pg: "pg-1", token: "dt-9", end: null });
		expect(parsePanelSynth(panelSynthEndBody("pg-1", "dt-9", { status: "landed", sha: "c".repeat(64) }))?.end).toEqual({ status: "landed", sha: "c".repeat(64) });
		expect(parsePanelSynth(panelSynthEndBody("pg-1", "dt-9", { status: "failed", reason: "schema bad" }))?.end).toEqual({ status: "failed", reason: "schema bad" });
		expect(parsePanelPublished(panelPublishedBody("pg-1", "out", { "out/status.json": "d".repeat(64) }))).toEqual({ pg: "pg-1", what: "out", hashes: { "out/status.json": "d".repeat(64) } });
		expect(parsePanelVoid(panelVoidBody("pg-1", "hash in/packet.md"))).toEqual({ pg: "pg-1", reason: "hash in/packet.md" });
	});

	test("free text in a body is one line, capped", () => {
		expect(words("a\n  b\tc")).toBe("a b c");
		expect(words("x".repeat(500))).toHaveLength(240);
		expect(panelLegBody("pg-1", "openai", { status: "missing", reason: "multi\nline" })).toBe("panel-leg: pg-1 openai missing multi line");
	});
});

describe("manifest and ingest", () => {
	test("a manifest that lists a withheld file as a leg input is refused", () => {
		const dir = mkdtempSync(join(tmpdir(), "panel-m-"));
		dirs.push(dir);
		const m = JSON.parse(readFileSync(join(stagingRun(dir), "manifest.json"), "utf8"));
		expect(() => parseManifest(JSON.stringify({ ...m, withheld: ["packet.md"] }))).toThrow("withheld packet.md is in legInputs.anthropic");
		expect(() => parseManifest(JSON.stringify({ ...m, inputs: { ...m.inputs, "../x": "a".repeat(64) } }))).toThrow("empty, . or .. segment");
	});

	test("ingest copies the run into <pdir>/in with the manifest's hashes", () => {
		const f = fixture();
		expect(readFileSync(join(f.pdir, "in", "packet.md"), "utf8")).toBe("the packet\n");
		expect(f.state().group.inputs["packet.md"]).toBe(sha("the packet\n"));
		expect(f.state().group.inputs["manifest.json"]).toBe(sha(readFileSync(join(f.pdir, "in", "manifest.json"), "utf8")));
	});

	test("ingest refuses a symlink, a hash mismatch, an unlisted file, another workload or slice, and an existing directory", () => {
		const dir = mkdtempSync(join(tmpdir(), "panel-i-"));
		dirs.push(dir);
		const pdir = (n: string) => join(dir, "ledger", "lanes", "wl-p", "panels", n);
		const linked = stagingRun(dir);
		rmSync(join(linked, "packet.md"));
		writeFileSync(join(dir, "elsewhere.md"), "the packet\n");
		symlinkSync(join(dir, "elsewhere.md"), join(linked, "packet.md"));
		expect(() => ingestRun(linked, "wl-p", "sl-p", pdir("pg-1"))).toThrow("is a symlink");
		const tampered = stagingRun(dir);
		writeFileSync(join(tampered, "packet.md"), "changed\n");
		expect(() => ingestRun(tampered, "wl-p", "sl-p", pdir("pg-2"))).toThrow("not the manifest's");
		const extra = stagingRun(dir);
		writeFileSync(join(extra, "notes.md"), "x");
		expect(() => ingestRun(extra, "wl-p", "sl-p", pdir("pg-3"))).toThrow("does not list: notes.md");
		expect(() => ingestRun(stagingRun(dir, { workload: "wl-other" }), "wl-p", "sl-p", pdir("pg-4"))).toThrow("belongs to workload wl-other");
		expect(() => ingestRun(stagingRun(dir), "wl-p", "sl-q", pdir("pg-5"))).toThrow("prepared for slice sl-p, not sl-q");
		const run = stagingRun(dir);
		ingestRun(run, "wl-p", "sl-p", pdir("pg-6"));
		expect(() => ingestRun(run, "wl-p", "sl-p", pdir("pg-6"))).toThrow("EEXIST");
	});
});

describe("publication", () => {
	test("legs publish once all three labs have lines; status.json last; one ledger line", () => {
		const f = fixture();
		f.land("anthropic", reply("a1", "a2"));
		f.land("openai", reply("o1"));
		expect(finalizeLegs(f.ledger, f.at, f.pg)).toBe("waiting");
		f.ledger.write(() => writeLeg(f.ledger, f.at, f.pg, "kimi", { status: "missing", reason: "timeout" }));
		expect(finalizeLegs(f.ledger, f.at, f.pg)).toBe("published");
		const status = JSON.parse(readFileSync(join(f.pdir, "out", "status.json"), "utf8"));
		expect(status.legs.anthropic).toEqual({ status: "landed", reason: null, model: MODEL.anthropic, token: "dt-a", findingIds: ["anthropic-1", "anthropic-2"] });
		expect(status.legs.kimi).toMatchObject({ status: "missing", reason: "timeout", findingIds: [] });
		expect(existsSync(join(f.pdir, "out", "legs", "kimi.json"))).toBe(false);
		expect(f.state().published.out).toEqual({
			"out/legs/anthropic.json": sha(readFileSync(join(f.pdir, "out", "legs", "anthropic.json"), "utf8")),
			"out/legs/openai.json": sha(readFileSync(join(f.pdir, "out", "legs", "openai.json"), "utf8")),
			"out/status.json": sha(readFileSync(join(f.pdir, "out", "status.json"), "utf8")),
		});
		expect(finalizeLegs(f.ledger, f.at, f.pg)).toBe("already");
	});

	for (const stop of ["legs/anthropic.json", "legs/openai.json", "legs/kimi.json", "status.json"]) {
		test(`an interruption after ${stop} is redone with identical bytes and one ledger line`, () => {
			const f = fixture();
			for (const lab of LABS) f.land(lab, reply(`${lab} finding`));
			expect(() =>
				finalizeLegs(f.ledger, f.at, f.pg, rel => {
					if (rel === stop) throw new Error("killed");
				}),
			).toThrow("killed");
			expect(f.state().published.out).toBeNull();
			expect(finalizeLegs(f.ledger, f.at, f.pg)).toBe("published");
			const first = readFileSync(join(f.pdir, "out", "status.json"), "utf8");
			expect(finalizeLegs(f.ledger, f.at, f.pg)).toBe("already");
			expect(readFileSync(join(f.pdir, "out", "status.json"), "utf8")).toBe(first);
			expect(f.ledger.entries(f.wl).filter(e => e.body.startsWith(`panel-published: ${f.pg} out`))).toHaveLength(1);
		});
	}

	test("two finalizers racing write the same bytes and one panel-published line", () => {
		const f = fixture();
		for (const lab of LABS) f.land(lab, reply(lab));
		const results: unknown[] = [];
		// The second runs while the first is between its writes and its ledger line.
		results.push(
			finalizeLegs(f.ledger, f.at, f.pg, rel => {
				if (rel === "status.json") results.push(finalizeLegs(f.ledger, f.at, f.pg));
			}),
		);
		expect(results).toEqual(["published", "already"]);
		expect(f.ledger.entries(f.wl).filter(e => e.body.startsWith(`panel-published: ${f.pg} out`))).toHaveLength(1);
	});

	test("an input changed after ingest voids the run", () => {
		const f = fixture();
		for (const lab of LABS) f.land(lab, reply(lab));
		writeFileSync(join(f.pdir, "in", "leg.schema.json"), JSON.stringify({ type: "object" }));
		expect(finalizeLegs(f.ledger, f.at, f.pg)).toEqual({ void: "hash in/leg.schema.json" });
		expect(f.state().void).toBe("hash in/leg.schema.json");
	});

	test("a result file changed after its settle voids the run", () => {
		const f = fixture();
		for (const lab of LABS) f.land(lab, reply(lab));
		writeFileSync(join(f.root, "sl-p--openai.md"), reply("rewritten"));
		const out = finalizeLegs(f.ledger, f.at, f.pg);
		expect(out).toEqual({ void: `hash ${join(f.root, "sl-p--openai.md")}` });
	});

	test("synthesis: a published output changed before the reply voids the run; a good reply publishes the report", () => {
		const report = (lab: Lab) =>
			JSON.stringify({
				legs: LABS.map(l => ({ lab: l, status: "landed", model: MODEL[l], reason: "" })),
				synth: { lab, builderLab: false },
				findings: [{ id: "S1", title: "t", section: "s", supportIds: ["openai-1"], refuteIds: [] }],
				dropped: [],
				markdown: "# Report\n",
			});
		const f = fixture();
		for (const lab of LABS) f.land(lab, reply(lab));
		expect(finalizeLegs(f.ledger, f.at, f.pg)).toBe("published");
		f.ledger.recordEntry({ by: "lane-test", workloadId: f.wl, sliceId: "sl-p", kind: "assumption", body: panelSynthBody(f.pg, "dt-s") });
		expect(finishSynth(f.ledger, f.at, f.pg, "dt-s", { lab: "openai", builderLab: false }, report("openai"))).toEqual({ status: "landed", sha: sha(report("openai")) });
		expect(readFileSync(join(f.pdir, "out", "REPORT.md"), "utf8")).toBe("# Report\n");
		expect(f.state().published.report).toEqual({ "out/report.json": sha(report("openai")), "out/REPORT.md": sha("# Report\n") });

		const g = fixture();
		for (const lab of LABS) g.land(lab, reply(lab));
		finalizeLegs(g.ledger, g.at, g.pg);
		g.ledger.recordEntry({ by: "lane-test", workloadId: g.wl, sliceId: "sl-p", kind: "assumption", body: panelSynthBody(g.pg, "dt-s") });
		writeFileSync(join(g.pdir, "out", "legs", "kimi.json"), "{}\n");
		expect(finishSynth(g.ledger, g.at, g.pg, "dt-s", { lab: "openai", builderLab: false }, report("openai"))).toEqual({ void: "hash out/legs/kimi.json" });
	});

	test("a synthesis that fails twice voids the run; one refused before it ran does not count", () => {
		const f = fixture();
		for (const lab of LABS) f.land(lab, reply(lab));
		finalizeLegs(f.ledger, f.at, f.pg);
		for (const token of ["dt-1", "dt-2", "dt-3"]) f.ledger.recordEntry({ by: "lane-test", workloadId: f.wl, sliceId: "sl-p", kind: "assumption", body: panelSynthBody(f.pg, token) });
		f.ledger.write(() => writeSynthEnd(f.ledger, f.at, f.pg, "dt-1", { status: "failed", reason: "refused no-usable-model" }));
		expect(finishSynth(f.ledger, f.at, f.pg, "dt-2", { lab: "kimi", builderLab: false }, "not json")).toMatchObject({ status: "failed" });
		expect(f.state().void).toBeNull();
		expect(finishSynth(f.ledger, f.at, f.pg, "dt-3", { lab: "kimi", builderLab: false }, null)).toEqual({ status: "failed", reason: "no result file" });
		expect(f.state().void).toBe("synthesis failed twice");
	});
});

describe("breach audit", () => {
	const scope = (f: ReturnType<typeof fixture>, allowed: string[], repoAccess = false) => ({
		pdir: f.pdir,
		allowed,
		repoAccess,
		root: f.root,
		agentId: "sl-p--kimi",
		lanes: join(f.pdir, "..", "..", ".."),
		run: f.run,
	});

	test("reads of its own inputs pass; every forbidden name is a breach", () => {
		const f = fixture();
		const packet = join(f.pdir, "in", "packet.md");
		const s = scope(f, [packet]);
		expect(breachOf("read", { path: `${packet}:1-20` }, s)).toBeNull();
		expect(breachOf("yield", { data: { items: [{ title: "reads agent://x and withheld/y" }] } }, s)).toBeNull();
		expect(breachOf("read", { path: join(f.pdir, "in", "synth.md") }, s)).toContain("outside its inputs");
		expect(breachOf("read", { path: "agent://sl-p--openai" }, s)).toContain("agent://");
		expect(breachOf("read", { path: join(f.pdir, "..", "pg-other", "out", "status.json") }, s)).toContain("another panel");
		expect(breachOf("grep", { pattern: "x", path: "/repo/withheld/draft.md" }, scope(f, [packet], true))).toContain("withheld");
		expect(breachOf("read", { path: `${f.root}.jsonl` }, scope(f, [packet], true))).toContain("session file");
		expect(breachOf("read", { path: join(f.root, "sl-p--openai.jsonl") }, scope(f, [packet], true))).toContain("session file");
		expect(breachOf("read", { path: join(f.run, "packet.md") }, scope(f, [packet], true))).toContain("staging run");
		expect(breachOf("bash", { command: "ls" }, s)).toContain("packet-only");
		expect(breachOf("bash", { command: "ls" }, scope(f, [packet], true))).toBeNull();
		expect(breachOf("glob", { pattern: "*.md" }, s)).toContain("no path");
		expect(breachOf("read", { path: "/repo/src/a.ts" }, s)).toContain("packet-only");
		// OMP tells every hand to read a matching skill first: installed skill docs are not a breach (sl-xmr-smoke).
		expect(breachOf("read", { path: "skill://cross-model-review" }, s)).toBeNull();
		expect(breachOf("read", { path: "skill://cross-model-review/references/panel/panel.md" }, s)).toBeNull();
		expect(breachOf("read", { path: "skill://cross-model-review/../../x" }, s)).toContain("packet-only");
	});

	test("quorum-refute: a leg may read its own packet and not another leg's", () => {
		const f = fixture({ mode: "quorum-refute" });
		const own = join(f.pdir, "in", "legs", "kimi", "packet.md");
		const s = scope(f, [own]);
		expect(breachOf("read", { path: own }, s)).toBeNull();
		expect(breachOf("read", { path: join(f.pdir, "in", "legs", "openai", "packet.md") }, s)).toContain("outside its inputs");
	});

	test("the audit reads the hand's own session file; an unreadable one fails closed", () => {
		const f = fixture();
		const packet = join(f.pdir, "in", "packet.md");
		const file = join(f.root, "sl-p--kimi.jsonl");
		const call = (name: string, args: unknown) => JSON.stringify({ type: "message", message: { role: "assistant", content: [{ type: "toolCall", name, arguments: args }] } });
		writeFileSync(file, `${call("read", { path: packet })}\n{"type":"message","message":{"role":"user","content":"proc://x"}}\n`);
		expect(auditSession(file, scope(f, [packet]))).toBeNull();
		writeFileSync(file, `${call("read", { path: packet })}\n${call("read", { path: "history://lane" })}\n`);
		expect(auditSession(file, scope(f, [packet]))).toEqual({ breach: "read names history://" });
		expect(auditSession(join(f.root, "absent.jsonl"), scope(f, [packet]))).toHaveProperty("unreadable");
	});

	test("an editing tool's input naming a panels directory is found, through a symlink too", () => {
		const f = fixture();
		const ledgerDir = join(f.pdir, "..", "..", "..", "..");
		expect(namesPanelsDir({ path: join(f.pdir, "out", "x.json") }, ledgerDir, "/")).toBe(join(f.pdir, "out", "x.json"));
		symlinkSync(join(ledgerDir, "lanes"), join(f.dir, "alias"));
		expect(namesPanelsDir({ path: "alias/wl-p/panels/pg-test1/in/packet.md" }, ledgerDir, f.dir)).toBe("alias/wl-p/panels/pg-test1/in/packet.md");
		expect(namesPanelsDir({ path: join(f.dir, "repo", "a.ts"), content: "panels" }, ledgerDir, f.dir)).toBeNull();
	});
});

describe("schemas and ids", () => {
	test("the schema subset", () => {
		const schema = { type: "object", required: ["items"], additionalProperties: false, properties: { items: { type: "array", maxItems: 1, items: { type: "object", properties: { s: { enum: ["a", "b"] } } } } } };
		expect(schemaProblem({ items: [{ s: "a" }] }, schema)).toBeNull();
		expect(schemaProblem({ items: [] , x: 1 }, schema)).toBe("$.x is not allowed");
		expect(schemaProblem({ items: [{ s: "c" }] }, schema)).toBe("$.items[0].s is not one of the enum values");
		expect(schemaProblem({ items: [{}, {}] }, schema)).toBe("$.items has more than 1 items");
		expect(schemaProblem({}, schema)).toBe("$.items is missing");
	});

	test("ids are assigned by position, replacing any the leg gave", () => {
		expect(assignIds({ items: [{ id: "x", t: 1 }, { t: 2 }], note: "n" }, "openai")).toEqual({
			output: { items: [{ id: "openai-1", t: 1 }, { id: "openai-2", t: 2 }], note: "n" },
			ids: ["openai-1", "openai-2"],
		});
		expect(assignIds({ items: "no" }, "openai")).toBeNull();
	});
});

describe("timeouts and admission", () => {
	test("a leg past its lab's timeout is missing; the per-lab override applies; a late result is discarded", () => {
		const f = fixture({ legTimeoutMin: { default: 30, kimi: 90 } });
		f.ledger.recordEntry({ by: "lane-test", workloadId: f.wl, sliceId: "sl-p", kind: "assumption", body: handSpawnBody({ token: "dt-a", root: f.root, spawnKey: "sl-p--anthropic", review: true, group: f.pg, row: [MODEL.anthropic] }) });
		const now = Date.now();
		expect(sweepPanels(f.ledger, f.at, now + 10 * 60_000)).toEqual([]);
		expect(sweepPanels(f.ledger, f.at, now + 31 * 60_000)).toEqual([`${f.pg} anthropic missing timeout`, `${f.pg} openai missing timeout`]);
		expect(f.state().legs.has("kimi")).toBe(false);
		const late = f.ledger.write(() => writeLeg(f.ledger, f.at, f.pg, "openai", { status: "landed", sha: "e".repeat(64) }));
		expect(late).toEqual({ status: "missing", reason: "timeout" });
		expect(sweepPanels(f.ledger, f.at, now + 91 * 60_000)).toEqual([`${f.pg} kimi missing timeout`, `${f.pg} published out`]);
	});

	test("a leg spawn is held once its lab has a line, and a void run holds every spawn", () => {
		const f = fixture();
		expect(legHeld(f.ledger.entries(f.wl), [], "production", f.wl, f.pg, "kimi")).toBeNull();
		f.ledger.write(() => writeLeg(f.ledger, f.at, f.pg, "kimi", { status: "missing", reason: "timeout" }));
		expect(legHeld(f.ledger.entries(f.wl), [], "production", f.wl, f.pg, "kimi")).toContain("already missing (timeout)");
		f.ledger.recordEntry({ by: "lane-test", workloadId: f.wl, sliceId: "sl-p", kind: "assumption", body: panelVoidBody(f.pg, "hash in/packet.md") });
		expect(legHeld(f.ledger.entries(f.wl), [], "production", f.wl, f.pg, "openai")).toContain("is void");
		expect(synthHeld(f.ledger.entries(f.wl), [], f.wl, f.pg, null)).toContain("is void");
	});
});
