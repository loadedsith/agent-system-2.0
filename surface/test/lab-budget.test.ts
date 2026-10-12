// The per-lab token budget (MIGRATION.md item 113): the pure rules in surface/src/lab-budget.ts (config,
// usage deltas, the 5 h and 24 h windows, the token and quota trips, Jo's lift and keep), the ledger side in
// surface/src/lab-budget-io.ts (the launch gate, the question raised once, the relaunch after a lift and after
// the window clears), the answer path in surface/src/input.ts, and the `lab-budget` invariant in
// surface/scripts/invariants.ts. The runner's stop and the starter's refusal run as processes in
// surface/test/lane-script.test.ts; the classifier's skip is in classifier/test/crosslab.test.ts.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LANE_RUNNER_BY, LANE_STARTER_BY, Ledger } from "../../ledger/src/index";
import { BACKUP_GAP_MS, check, type LabBudgetInput } from "../scripts/invariants";
import { spendBody } from "../src/ceiling";
import { ensureStandingWorkload } from "../src/identity";
import { apply } from "../src/input";
import {
	LAB_BUDGET_DEFAULTS, LAB_BUDGET_OPTIONS, type LabBudgetConfig, labBudgetConfig, labDecisions, type LabDecision, labStates, type LabUsageEvent, laneLabs, mayRaise,
	nextLaneLab, orchestratorSpendBody, parseQuotaCache, type QuotaSnapshot, usageEvents, type UsageRow,
} from "../src/lab-budget";
import { gatedVerdict, heldLabs, labQuestionRows, raiseLabBudgetQuestion, readLabView, releaseClearedLabs } from "../src/lab-budget-io";
import { controlEntries, holdersOf, laneModelBody, laneStartedBody, laneStopAcceptedBody, launchRequestedBody } from "../src/launch";
import { STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";

const H = 3_600_000;
const T0 = Date.parse("2026-10-12T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});
const tmp = (tag: string) => {
	const d = mkdtempSync(join(tmpdir(), `lab-budget-${tag}-`));
	dirs.push(d);
	return d;
};

/** A config with small budgets: openai 100 per 5 h / 300 per 24 h, the others large; reserve 10 %. */
const SMALL: LabBudgetConfig = {
	tokens: { anthropic: { "5h": 1e9, "24h": 1e9 }, openai: { "5h": 100, "24h": 300 }, kimi: { "5h": 1e9, "24h": 1e9 } },
	quotaReservePct: 10,
	quotaMaxAgeMin: 30,
};
const ev = (atMs: number, tokens: number, over: Partial<LabUsageEvent> = {}): LabUsageEvent => ({ at: atMs, workloadId: "wl-a", source: "lane-a-1", lab: "openai", tokens, usd: 0, ...over });
const lift = (atMs: number): LabDecision => ({ lab: "openai", word: "lift", at: atMs, questionId: "q-1", answerId: `in-${atMs}` });
const states = (events: LabUsageEvent[], o: { decisions?: LabDecision[]; quota?: QuotaSnapshot | null; config?: LabBudgetConfig; now?: number } = {}) =>
	labStates({ events, decisions: o.decisions ?? [], quota: o.quota ?? null, config: o.config ?? SMALL, now: o.now ?? T0 });
const quota = (probedAt: number, remainingFraction: number, window: { durationMs: number; resetsAt: number } | null = { durationMs: 7 * 24 * H, resetsAt: T0 + 24 * H }): QuotaSnapshot => ({
	probedAt,
	limits: [{ provider: "openai-codex", id: "openai-codex:primary", label: "7 days", remainingFraction, durationMs: window?.durationMs ?? null, resetsAt: window?.resetsAt ?? null }],
});

describe("config: the defaults, then profile/config.yml's labBudget: block, then the env", () => {
	test("no block: the defaults (Plumb's second ruling: anthropic 800M / 2B, openai 80M / 150M, kimi 25M / 60M, reserve 10 %)", () => {
		expect(labBudgetConfig({}, {})).toEqual({ config: LAB_BUDGET_DEFAULTS, errors: [] });
		expect(LAB_BUDGET_DEFAULTS.tokens).toEqual({
			anthropic: { "5h": 800_000_000, "24h": 2_000_000_000 }, openai: { "5h": 80_000_000, "24h": 150_000_000 }, kimi: { "5h": 25_000_000, "24h": 60_000_000 },
		});
		expect(LAB_BUDGET_DEFAULTS.quotaReservePct).toBe(10);
	});
	test("the block overrides per value, the env overrides the block; a malformed value keeps its default and is named", () => {
		const doc = { labBudget: { tokens: { openai: { "5h": 5, "24h": -1 }, nope: { "5h": 1 } }, quotaReservePct: 20 } };
		const { config, errors } = labBudgetConfig(doc, { AGENT_SYSTEM_LAB_BUDGET_OPENAI_5H: "7", AGENT_SYSTEM_LAB_BUDGET_KIMI_24H: "lots", AGENT_SYSTEM_LAB_QUOTA_RESERVE_PCT: "5" });
		expect(config.tokens.openai).toEqual({ "5h": 7, "24h": 150_000_000 });
		expect(config.tokens.kimi["24h"]).toBe(60_000_000);
		expect(config.quotaReservePct).toBe(5);
		expect(errors).toEqual([
			"labBudget.tokens.openai.24h is not a positive number",
			"labBudget.tokens.nope is not a lab (anthropic, openai, kimi)",
			"AGENT_SYSTEM_LAB_BUDGET_KIMI_24H=lots is not a positive number",
		]);
	});
	test("the checked-in profile/config.yml carries the block, equal to the defaults", () => {
		const doc: unknown = Bun.YAML.parse(readFileSync(join(import.meta.dir, "..", "..", "profile", "config.yml"), "utf8"));
		expect(labBudgetConfig(doc, {})).toEqual({ config: LAB_BUDGET_DEFAULTS, errors: [] });
		expect(doc !== null && typeof doc === "object" && "labBudget" in doc).toBe(true);
	});
});

describe("usage: spend: entries are cumulative per workload, counted as deltas per lab", () => {
	const row = (by: string, wl: string, body: string, atMs: number): UsageRow => ({ workload_id: wl, body, created_by: by, created_at: iso(atMs) });
	test("a split spend: counts each lab's difference; the first counts whole; a later lower total counts nothing", () => {
		const rows = [
			row(LANE_RUNNER_BY, "wl-a", spendBody("lane-a-1", { usd: 1, tokens: 100, wallMin: 1, labs: { openai: { tokens: 80, usd: 0.8 }, kimi: { tokens: 20, usd: 0.2 } } }), T0),
			row(LANE_RUNNER_BY, "wl-a", spendBody("lane-a-1", { usd: 2, tokens: 250, wallMin: 2, labs: { openai: { tokens: 200, usd: 1.6 }, kimi: { tokens: 50, usd: 0.4 } } }), T0 + H),
			row(LANE_RUNNER_BY, "wl-a", spendBody("lane-a-2", { usd: 2, tokens: 250, wallMin: 2, labs: { openai: { tokens: 200, usd: 1.6 }, kimi: { tokens: 50, usd: 0.4 } } }), T0 + 2 * H),
		];
		expect(usageEvents(rows).map((e) => [e.at - T0, e.lab, e.tokens])).toEqual([[0, "openai", 80], [0, "kimi", 20], [H, "openai", 120], [H, "kimi", 30]]);
	});
	test("a legacy spend: with no split counts its delta to the lane's lab (builder-lab:, else the runner's lane-started: ranModel); with neither, to nothing", () => {
		const rows = [
			row(LANE_RUNNER_BY, "wl-a", laneStartedBody("lane-a-1", { pid: 1, start: "x", session: null, argv: [], runnerPid: 2, model: null, ranModel: "openai-codex/gpt-6-sol" } as never), T0 - H),
			row(LANE_RUNNER_BY, "wl-a", "spend: lane-a-1 usd 1 tokens 100 wall 1", T0),
			row(LANE_RUNNER_BY, "wl-a", "spend: lane-a-1 usd 2 tokens 160 wall 2", T0 + H),
			row(LANE_RUNNER_BY, "wl-b", "spend: lane-b-1 usd 2 tokens 500 wall 2", T0),
			row("lane-c-1", "wl-c", "builder-lab: kimi lane lane-c-1 model moonshot/kimi-k3", T0 - H),
			row(LANE_RUNNER_BY, "wl-c", "spend: lane-c-1 usd 1 tokens 40 wall 1", T0),
		];
		expect(usageEvents(rows).map((e) => [e.workloadId, e.lab, e.tokens])).toEqual([["wl-a", "openai", 100], ["wl-c", "kimi", 40], ["wl-a", "openai", 60]]);
		expect(Object.fromEntries(laneLabs(rows))).toEqual({ "lane-a-1": "openai", "lane-c-1": "kimi" });
	});
	test("orchestrator-spend: is a delta already, and counts only from the surface on the standing workload; a lane's spend: forged by a lane counts nothing", () => {
		const body = orchestratorSpendBody("sess-1", { usd: 3, tokens: 900, labs: { anthropic: { tokens: 900, usd: 3 } } });
		const rows = [
			row(SURFACE_BY, STANDING_WORKLOAD_ID, body, T0),
			row(SURFACE_BY, STANDING_WORKLOAD_ID, body, T0 + H),
			row("lane-a-1", STANDING_WORKLOAD_ID, body, T0),
			row(SURFACE_BY, "wl-a", body, T0),
			row("lane-a-1", "wl-a", "spend: lane-a-1 usd 1 tokens 999 wall 1 labs openai:999:1", T0),
		];
		expect(usageEvents(rows).map((e) => [e.source, e.lab, e.tokens])).toEqual([["orchestrator", "anthropic", 900], ["orchestrator", "anthropic", 900]]);
	});
});

describe("windows: a rolling 5 h and 24 h count per lab", () => {
	test("5 h counts only the last five hours; 24 h the last day; an event exactly at the window's start is out", () => {
		const s = states([ev(T0 - 5 * H, 50), ev(T0 - 4 * H, 40), ev(T0 - 23 * H, 30), ev(T0 - 25 * H, 1000)]).openai;
		expect(s.usage).toEqual({ "5h": 40, "24h": 120 });
		expect(s.held).toBe(false);
	});
	test("other labs' usage does not count toward openai", () => {
		expect(states([ev(T0 - H, 500, { lab: "kimi" })]).openai.usage).toEqual({ "5h": 0, "24h": 0 });
	});
	test("usage after now (a replay) is not counted", () => {
		expect(states([ev(T0 + H, 500)]).openai.usage["5h"]).toBe(0);
	});
});

describe("trip: a lab over either window, or at the quota reserve, is held", () => {
	test("at the 5 h budget exactly: held, the reason and the top consumers name the window and the workloads", () => {
		const s = states([ev(T0 - H, 60, { workloadId: "wl-a" }), ev(T0 - 2 * H, 40, { workloadId: "wl-b", source: "orchestrator" })]).openai;
		expect(s.held).toBe(true);
		expect(s.reasons).toEqual(["5h tokens 100 of budget 100"]);
		expect(s.top.map((c) => [c.workloadId, c.tokens])).toEqual([["wl-a", 60], ["wl-b", 40]]);
	});
	test("one token under both budgets: not held", () => {
		expect(states([ev(T0 - H, 99)]).openai.held).toBe(false);
	});
	test("the 24 h budget alone: held, with the 24 h reason", () => {
		const s = states([ev(T0 - 10 * H, 90), ev(T0 - 12 * H, 90), ev(T0 - 20 * H, 90), ev(T0 - 22 * H, 90)]).openai;
		expect(s.reasons).toEqual(["24h tokens 360 of budget 300"]);
	});
	test("a fresh quota report at or under the reserve holds the lab with no token use; above it, or stale, does not", () => {
		expect(states([], { quota: quota(T0 - 60_000, 0.1) }).openai.reasons).toEqual(["quota openai-codex:primary 10% left (reserve 10%)"]);
		expect(states([], { quota: quota(T0 - 60_000, 0.11) }).openai.held).toBe(false);
		expect(states([], { quota: quota(T0 - 31 * 60_000, 0.05) }).openai.held).toBe(false);
		expect(states([], { quota: quota(T0 - 60_000, 0.05), config: { ...SMALL, quotaReservePct: 0 } }).openai.held).toBe(false);
		expect(states([], { quota: quota(T0 - 60_000, 0.05) }).anthropic.held).toBe(false);
	});
	test("the quota cache parses omp usage --json as printed; a remaining fraction may come as usedFraction", () => {
		const report = { reports: [{ provider: "openai-codex", limits: [
			{ id: "openai-codex:primary", label: "7 days", window: { durationMs: 604800000, resetsAt: 1792389012000 }, amount: { usedFraction: 0.92 } },
			{ id: "no-amount", label: "x", window: {}, amount: {} },
		] }] };
		const q = parseQuotaCache(JSON.stringify({ probedAt: T0, report }))!;
		expect(q.limits).toHaveLength(1);
		expect(q.limits[0]!.remainingFraction).toBeCloseTo(0.08, 6);
		expect(q.limits[0]!.resetsAt).toBe(1792389012000);
		expect(parseQuotaCache("not json")).toBeNull();
		expect(parseQuotaCache(JSON.stringify({ report }))).toBeNull();
	});
});

describe("lift and keep: Jo's answers to the lab-budget question", () => {
	test("lift restarts both windows at the answer: usage before it no longer counts, usage after it does", () => {
		const events = [ev(T0 - 3 * H, 150), ev(T0 - H, 30)];
		expect(states(events).openai.held).toBe(true);
		const lifted = states(events, { decisions: [lift(T0 - 2 * H)] }).openai;
		expect(lifted.held).toBe(false);
		expect(lifted.usage).toEqual({ "5h": 30, "24h": 30 });
		expect(states([...events, ev(T0 - 30 * 60_000, 80)], { decisions: [lift(T0 - 2 * H)] }).openai.held).toBe(true);
	});
	test("a lift covers a quota hold until that quota window resets; a lift before the window began does not", () => {
		const q = quota(T0 - 60_000, 0.05, { durationMs: 7 * 24 * H, resetsAt: T0 + 24 * H });
		expect(states([], { quota: q, decisions: [lift(T0 - H)] }).openai.held).toBe(false);
		expect(states([], { quota: q, decisions: [lift(T0 - 7 * 24 * H)] }).openai.held).toBe(true);
		// With no window in the report, a lift covers it for five hours.
		const bare = quota(T0 - 60_000, 0.05, null);
		expect(states([], { quota: bare, decisions: [lift(T0 - 4 * H)] }).openai.held).toBe(false);
		expect(states([], { quota: bare, decisions: [lift(T0 - 6 * H)] }).openai.held).toBe(true);
	});
	test("keep: no second question for that lab for five hours; another lab may still be asked; an open question also blocks a raise", () => {
		const keep: LabDecision = { lab: "openai", word: "keep", at: T0 - H, questionId: "q-1", answerId: "in-1" };
		expect(mayRaise("openai", [], [keep], T0)).toBe(false);
		expect(mayRaise("openai", [], [keep], T0 + 4 * H + 1)).toBe(true);
		expect(mayRaise("kimi", [], [keep], T0)).toBe(true);
		const open = { id: "q-2", slice_id: "sl-lab-budget-openai-x-1", created_by: LANE_RUNNER_BY, state: "open" } as never;
		expect(mayRaise("openai", [open], [], T0)).toBe(false);
	});
	test("labDecisions reads Jo's lift or keep on a lab-budget question only: another author, another word, or another slice is no decision", () => {
		const q = (id: string, slice: string, by: string, resolvedBy: string) => ({ id, slice_id: slice, created_by: by, resolved_by: resolvedBy }) as never;
		const ins = (id: string, body: string, author = "jo", kind = "answer") => ({ id, body, author, kind, created_at: iso(T0) }) as never;
		const decisions = labDecisions(
			[q("q-1", "sl-lab-budget-openai-a-1", LANE_RUNNER_BY, "in-1"), q("q-2", "sl-lab-budget-kimi-a-1", SURFACE_BY, "in-2"), q("q-3", "sl-lab-budget-openai-a-2", "lane-a-1", "in-3"), q("q-4", "sl-lab-budget-openai-a-3", LANE_STARTER_BY, "in-4"), q("q-5", "sl-other", LANE_RUNNER_BY, "in-5")],
			[ins("in-1", "lift"), ins("in-2", "Keep it"), ins("in-3", "lift"), ins("in-4", "lift", "lane-a-1"), ins("in-5", "lift")],
		);
		expect(decisions.map((d) => [d.lab, d.word, d.answerId])).toEqual([["openai", "lift", "in-1"], ["kimi", "keep", "in-2"]]);
	});
});

describe("which lab a launch runs on", () => {
	const c = (by: string, body: string) => controlEntries([{ id: `e-${body.length}`, workload_id: "wl-a", slice_id: null, kind: "assumption", body, created_by: by, created_at: iso(T0) } as never]);
	test("Jo's named model first, else the newest lane's ranModel, else unknown", () => {
		expect(nextLaneLab(c(SURFACE_BY, laneModelBody("moonshot/kimi-k3", iso(T0))))).toBe("kimi");
		expect(nextLaneLab(c(LANE_RUNNER_BY, laneStartedBody("lane-a-1", { pid: 1, start: "x", session: null, argv: [], runnerPid: 2, model: null, ranModel: "openai-codex/gpt-6-sol" } as never)))).toBe("openai");
		expect(nextLaneLab([])).toBeNull();
	});
});

// ---- the ledger side -------------------------------------------------------------------------------

/** A temp ledger with a settable clock, the standing workload, and the env that points the budget at a temp config and quota file. */
interface World {
	dir: string;
	ledger: Ledger;
	env: Record<string, string>;
	at(ms: number): void;
	open(id: string, model: string | null): string;
	spend(wl: string, laneId: string, tokens: number, lab?: "openai" | "kimi" | "anthropic"): string;
}
function world(config: LabBudgetConfig = SMALL): World {
	const dir = tmp("world");
	let now = iso(T0);
	const ledger = Ledger.open(join(dir, "ledger.db"), { create: true, backup: false, backupOnOpen: false, clock: () => now, skipLocalityCheck: true });
	ensureStandingWorkload(ledger);
	const cfg = join(dir, "config.yml");
	writeFileSync(cfg, `labBudget:\n  tokens:\n${Object.entries(config.tokens).map(([lab, w]) => `    ${lab}:\n      5h: ${w["5h"]}\n      24h: ${w["24h"]}\n`).join("")}  quotaReservePct: ${config.quotaReservePct}\n  quotaMaxAgeMin: ${config.quotaMaxAgeMin}\n`);
	const env = { AGENT_SYSTEM_LAB_BUDGET_CONFIG: cfg, AGENT_SYSTEM_LAB_QUOTA_FILE: join(dir, "lab-quota.json"), AGENT_SYSTEM_LAB_QUOTA_PROBE: "off" };
	const at = (ms: number) => {
		now = iso(ms);
	};
	const open = (id: string, model: string | null) => {
		const wl = ledger.openWorkload({ by: SURFACE_BY, id, brief: id, stakes: "normal", mode: "autonomous" });
		if (model !== null) ledger.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: laneModelBody(model, now) });
		return wl;
	};
	const spend = (wl: string, laneId: string, tokens: number, lab: "openai" | "kimi" | "anthropic" = "openai") =>
		ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: wl, kind: "assumption", body: spendBody(laneId, { usd: 0, tokens, wallMin: 1, labs: { [lab]: { tokens, usd: 0 } } }) });
	return { dir, ledger, env, at, open, spend };
}
const rowsOf = (w: World, wl: string) => w.ledger.launchRows(wl, 3)!;

describe("the launch gate (gatedVerdict): a launch onto a held lab is refused with reason lab-budget", () => {
	test("held openai refuses an openai workload's launch and leaves a kimi workload's alone; an unknown lab is not gated", () => {
		const w = world();
		const oa = w.open("wl-oa", "openai-codex/gpt-6-sol");
		const km = w.open("wl-km", "moonshot/kimi-k3");
		const unk = w.open("wl-unk", null);
		expect(gatedVerdict(w.ledger, w.env, rowsOf(w, oa), T0).verdict).toMatchObject({ launch: true });
		w.spend(oa, "lane-oa-0", 100);
		const g = gatedVerdict(w.ledger, w.env, rowsOf(w, oa), T0);
		expect(g.verdict).toEqual({ launch: false, reason: "lab-budget" });
		expect(g.hold?.lab).toBe("openai");
		expect(gatedVerdict(w.ledger, w.env, rowsOf(w, km), T0).verdict).toMatchObject({ launch: true });
		expect(gatedVerdict(w.ledger, w.env, rowsOf(w, unk), T0).verdict).toMatchObject({ launch: true });
		expect([...heldLabs(w.ledger, w.env, T0).keys()]).toEqual(["openai"]);
		w.ledger.close();
	});
	test("a predicate refusal stands before the budget is read (a closed or standing workload is never reported as lab-budget)", () => {
		const w = world();
		w.spend(w.open("wl-oa", "openai-codex/gpt-6-sol"), "lane-oa-0", 1000);
		expect(gatedVerdict(w.ledger, w.env, rowsOf(w, STANDING_WORKLOAD_ID), T0).verdict).toEqual({ launch: false, reason: "standing" });
		w.ledger.close();
	});
	test("the question is raised once per lab: a second launch on the same or another workload raises none; it names the lab, the usage, the top consumer and lift / keep", () => {
		const w = world();
		const oa = w.open("wl-oa", "openai-codex/gpt-6-sol");
		const ob = w.open("wl-ob", "openai/gpt-6-sol");
		w.spend(oa, "lane-oa-1", 120);
		const hold = gatedVerdict(w.ledger, w.env, rowsOf(w, oa), T0).hold!;
		const q1 = raiseLabBudgetQuestion(w.ledger, { by: SURFACE_BY, workloadId: oa, state: hold, now: T0 });
		expect(q1).toMatch(/^q-/);
		expect(raiseLabBudgetQuestion(w.ledger, { by: SURFACE_BY, workloadId: oa, state: hold, now: T0 })).toBeNull();
		expect(raiseLabBudgetQuestion(w.ledger, { by: LANE_STARTER_BY, workloadId: ob, state: hold, now: T0 })).toBeNull();
		const [q] = w.ledger.questions(oa);
		expect(q!.slice_id).toBe("sl-lab-budget-openai-oa-1");
		expect(JSON.parse(q!.options)).toEqual([...LAB_BUDGET_OPTIONS]);
		expect(q!.body).toContain("lab budget: openai is held (5h tokens 120 of budget 100");
		expect(q!.body).toContain("top consumers: wl-oa lane-oa-1 120");
		w.ledger.close();
	});
});

describe("the answer: lift relaunches what the hold stopped; keep stays held; a cleared window withdraws the question", () => {
	/** wl-oa's lane was stopped by the openai hold, and the hold's question is open on it. */
	function stopped() {
		const w = world();
		const oa = w.open("wl-oa", "openai-codex/gpt-6-sol");
		w.ledger.recordEntry({ by: LANE_STARTER_BY, workloadId: oa, kind: "assumption", body: `launch: lane-oa-1 cause first requested-by jo` });
		w.spend(oa, "lane-oa-1", 150);
		w.ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: oa, kind: "assumption", body: laneStopAcceptedBody("lane-oa-1", "lab-budget-openai") });
		const hold = readLabView(w.ledger, w.env, T0).states.openai;
		const qid = raiseLabBudgetQuestion(w.ledger, { by: LANE_RUNNER_BY, workloadId: oa, state: hold, now: T0 })!;
		return { w, oa, qid };
	}
	const requests = (w: World, wl: string) => w.ledger.entries(wl).filter((e) => e.body.startsWith("launch-requested:"));
	test("lift: the slice completes, the lab is no longer held, and Jo's launch-requested: lands on the stopped workload once", () => {
		const { w, oa, qid } = stopped();
		w.at(T0 + 60_000);
		const receipt = apply(w.ledger, { kind: "answer", workloadId: oa, questionId: qid, answer: "lift" });
		expect(receipt).toContain("the openai lab budget is lifted");
		expect(receipt).toContain(`a relaunch is requested for ${oa}`);
		expect(w.ledger.slice("sl-lab-budget-openai-oa-1")!.state).toBe("done");
		expect(readLabView(w.ledger, w.env, T0 + 2 * 60_000).states.openai.held).toBe(false);
		expect(requests(w, oa).map((e) => [e.created_by, e.body])).toEqual([[SURFACE_BY, launchRequestedBody("jo", iso(T0 + 60_000), "lab budget lift")]]);
		expect(gatedVerdict(w.ledger, w.env, rowsOf(w, oa), T0 + 2 * 60_000).verdict).toMatchObject({ launch: true, cause: { kind: "request" } });
		w.ledger.close();
	});
	test("keep: the lab stays held, nothing is relaunched, and no question is raised again inside five hours", () => {
		const { w, oa, qid } = stopped();
		w.at(T0 + 60_000);
		expect(apply(w.ledger, { kind: "answer", workloadId: oa, questionId: qid, answer: "keep" })).toContain("stays held");
		expect(readLabView(w.ledger, w.env, T0 + 2 * 60_000).states.openai.held).toBe(true);
		expect(requests(w, oa)).toEqual([]);
		const hold = readLabView(w.ledger, w.env, T0 + 2 * 60_000).states.openai;
		expect(raiseLabBudgetQuestion(w.ledger, { by: SURFACE_BY, workloadId: oa, state: hold, now: T0 + 2 * 60_000 })).toBeNull();
		w.ledger.close();
	});
	test("the window rolls off: the tick withdraws the open question (then cancel) and relaunches the stopped workload", () => {
		const { w, oa, qid } = stopped();
		const later = T0 + 25 * H;
		w.at(later);
		const lines = releaseClearedLabs(w.ledger, readLabView(w.ledger, w.env, later));
		expect(lines).toEqual([`lab budget: openai is no longer held; withdrew ${qid} and requested a relaunch of ${oa}`]);
		expect(w.ledger.questions(oa).find((q) => q.id === qid)!.state).toBe("withdrawn");
		expect(requests(w, oa)).toHaveLength(1);
		expect(releaseClearedLabs(w.ledger, readLabView(w.ledger, w.env, later))).toEqual([]);
		expect(labQuestionRows(w.ledger).questions.filter((q) => q.state === "open")).toEqual([]);
		w.ledger.close();
	});
});

// ---- the invariant ---------------------------------------------------------------------------------

describe("the lab-budget invariant", () => {
	const input = (w: World, over: Partial<LabBudgetInput> = {}): LabBudgetInput => ({ config: SMALL, errors: [], quota: null, quotaFrom: join(w.dir, "lab-quota.json"), ...over });
	const report = (w: World, asOf: number, o: { replay?: boolean; live?: string[] | null; lb?: Partial<LabBudgetInput> } = {}) => {
		const db = new Database(join(w.dir, "ledger.db"), { readonly: true });
		try {
			return check({
				db, asOf: iso(asOf), replay: o.replay ?? false, liveLanes: o.live === null ? { skipped: "no probe in this test" } : { found: new Set(o.live ?? []) }, lanesDirOf: () => "/nonexistent/lanes",
				repo: "/nonexistent/checkout", git: null, orchestrators: () => ({ skipped: "no probe in this test" }), backups: { dir: join(w.dir, "no-backups"), gapMs: BACKUP_GAP_MS },
				labBudget: input(w, o.lb),
			}).findings.filter((f) => f.invariant === "lab-budget");
		} finally {
			db.close();
		}
	};
	function busy() {
		const w = world();
		const oa = w.open("wl-oa", null);
		w.ledger.recordEntry({ by: LANE_RUNNER_BY, workloadId: oa, kind: "assumption", body: laneStartedBody("lane-oa-1", { pid: 1, start: "x", session: null, argv: [], runnerPid: 2, model: null, ranModel: "openai-codex/gpt-6-sol" } as never) });
		w.at(T0 + 10 * 60_000);
		w.spend(oa, "lane-oa-1", 60);
		w.at(T0 + 20 * 60_000);
		w.spend(oa, "lane-oa-1", 130);
		return { w, oa };
	}
	test("under budget: no finding (the control)", () => {
		const w = world();
		w.spend(w.open("wl-oa", null), "lane-oa-1", 99);
		expect(report(w, T0 + H)).toEqual([]);
		w.ledger.close();
	});
	test("over the 5 h budget: one finding naming the held line, the lane alive on the lab, no question yet; since is the entry that crossed it", () => {
		const { w } = busy();
		const [f] = report(w, T0 + H, { live: ["wl-oa lane-oa-1", "wl-km lane-km-1"] });
		expect(f).toMatchObject({ key: "lab-budget:openai:5h:none", workload: "lab:openai", since: iso(T0 + 20 * 60_000) });
		expect(f!.text).toContain("lab budget: openai is held (5h tokens 130 of budget 100)");
		expect(f!.text).toContain("lanes alive on openai: wl-oa lane-oa-1 (the runner stops");
		expect(f!.text).toContain("no lab-budget question is open");
		expect(f!.query).toContain("FROM entries WHERE kind = 'assumption'");
		w.ledger.close();
	});
	test("the question open, then Jo's lift: the finding names the question, and after the lift the finding is gone", () => {
		const { w, oa } = busy();
		const hold = readLabView(w.ledger, w.env, T0 + H).states.openai;
		w.at(T0 + H);
		const qid = raiseLabBudgetQuestion(w.ledger, { by: LANE_RUNNER_BY, workloadId: oa, state: hold, now: T0 + H })!;
		expect(report(w, T0 + H + 1000, { live: [] })[0]!.text).toContain(`Jo's lab-budget question ${qid} is open (lift or keep)`);
		w.at(T0 + H + 2000);
		apply(w.ledger, { kind: "answer", workloadId: oa, questionId: qid, answer: "lift" });
		expect(report(w, T0 + H + 3000, { live: [] })).toEqual([]);
		// Replay before the lift still sees the hold: Jo's answer after as-of is left out.
		expect(report(w, T0 + H + 1000, { replay: true, live: [] })).toHaveLength(1);
		w.ledger.close();
	});
	test("a quota at the reserve is a finding live and none under --as-of (the cache holds the newest probe only); the process table unread is said so", () => {
		const w = world();
		const q = quota(T0 - 60_000, 0.05);
		const [f] = report(w, T0, { live: null, lb: { quota: q } });
		expect(f).toMatchObject({ key: "lab-budget:openai:quota:none", since: iso(T0 - 60_000) });
		expect(f!.text).toContain("lanes alive on openai: unknown");
		expect(report(w, T0, { replay: true, lb: { quota: q } })).toEqual([]);
		w.ledger.close();
	});
	test("config problems ride the finding's text", () => {
		const { w } = busy();
		expect(report(w, T0 + H, { lb: { errors: ["labBudget.tokens.openai.5h is not a positive number"] } })[0]!.text).toContain("Config problems, each kept at its default: labBudget.tokens.openai.5h is not a positive number.");
		w.ledger.close();
	});
});

describe("holdersOf/controlEntries still read the stop the hold writes", () => {
	test("lane-stop: <lane> accepted lab-budget-<lab> from the runner is a valid control line", () => {
		const e = { id: "e-1", workload_id: "wl-a", slice_id: null, kind: "assumption", body: laneStopAcceptedBody("lane-a-1", "lab-budget-openai"), created_by: LANE_RUNNER_BY, created_at: iso(T0) } as never;
		expect(controlEntries([e], holdersOf([e], null)).map((c) => [c.prefix, c.laneId, c.rest])).toEqual([["lane-stop", "lane-a-1", "accepted lab-budget-openai"]]);
	});
});
