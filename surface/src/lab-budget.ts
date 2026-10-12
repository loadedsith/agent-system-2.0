// The per-lab token budget's pure half (MIGRATION.md item 113). A runaway on one workload once spent
// most of a lab's subscription in hours while its workload's dollar ceiling never tripped: the ceiling
// is per workload and priced at list rates, the subscription is per lab and counted in tokens. This
// module holds the rule that sits above every workload: each lab (classifier/src/lab.ts) has a token
// budget per rolling 5 h and 24 h window, counted from every `spend:` entry (lanes and the hands they
// spawn, reviews included) and every `orchestrator-spend:` entry (the orchestrator's own turns and
// hands), and a quota reserve read from OMP's own usage report when one is fresh. Over either, the lab
// is held: no new lane launch, relaunch or review dispatch runs on it until Jo answers `lift` to the
// lab-budget question, or the window rolls off.
//
// Nothing here opens the ledger or a file: surface/src/lab-budget-io.ts reads the rows and the quota
// cache and hands them in.
import { type Lab, LABS, labOf } from "../../classifier/src/lab";
import { type EntryRow, type InstructionRow, LANE_RUNNER_BY, LANE_STARTER_BY, type QuestionRow } from "../../ledger/src/index";
import { type LabTallies, labsText, parseSpend } from "./ceiling";
import { type ControlEntry, laneModel } from "./launch";
import { STANDING_WORKLOAD_ID, SURFACE_BY } from "./types";

// ---- config ------------------------------------------------------------------------------------

export type LabWindow = "5h" | "24h";
export const LAB_WINDOWS: readonly { id: LabWindow; ms: number }[] = [
	{ id: "5h", ms: 5 * 3_600_000 },
	{ id: "24h", ms: 24 * 3_600_000 },
];

export interface LabBudgetConfig {
	/** Tokens (OMP's `usage.totalTokens`, cache reads included) per lab per rolling window. */
	tokens: Record<Lab, Record<LabWindow, number>>;
	/** Hold a lab when a fresh quota report shows this percent or less remaining in any of its windows; 0 turns it off. */
	quotaReservePct: number;
	/** A quota report older than this many minutes is unknown, and the token budgets alone decide. */
	quotaMaxAgeMin: number;
}

/**
 * The defaults (Plumb's second ruling, 2026-10-12, MIGRATION.md item 113): above today's measured healthy use, so that no
 * live lane trips. The ledger-copy smoke at 2026-10-12T07:44Z counted anthropic 613.4 M in 5 h and 1.3 B in 24 h, and openai
 * 59.3 M and 90.7 M, while every lane was healthy; the lane session files gave anthropic 490.7 M, openai 114.7 M and kimi
 * 42.9 M over the same 5 h. The hourly histogram (anthropic 2026-10-01T20 to 10-12T06, openai 10-07T16 to 10-12T06, kimi
 * 10-08T17 to 10-12T06) has a busy 5 h (p90) of anthropic 180.5 M, openai 25.8 M and kimi 17.9 M. openai's runaway reached
 * 174 M in 5 h. The quota reserve is the real backstop for the subscription.
 */
export const LAB_BUDGET_DEFAULTS: LabBudgetConfig = {
	tokens: {
		anthropic: { "5h": 800_000_000, "24h": 2_000_000_000 },
		openai: { "5h": 80_000_000, "24h": 150_000_000 },
		kimi: { "5h": 25_000_000, "24h": 60_000_000 },
	},
	quotaReservePct: 10,
	quotaMaxAgeMin: 30,
};

/** `AGENT_SYSTEM_LAB_BUDGET_<LAB>_<5H|24H>`: one budget, in tokens. */
export const labBudgetEnv = (lab: Lab, window: LabWindow): string => `AGENT_SYSTEM_LAB_BUDGET_${lab.toUpperCase()}_${window.toUpperCase()}`;
export const LAB_QUOTA_RESERVE_ENV = "AGENT_SYSTEM_LAB_QUOTA_RESERVE_PCT";

/**
 * The config: the defaults, then the profile's `labBudget:` block (profile/config.yml), then the env.
 * A malformed value is an error naming it; the caller keeps the defaults for it (the conservative side).
 */
export function labBudgetConfig(doc: unknown, env: Record<string, string | undefined>): { config: LabBudgetConfig; errors: string[] } {
	const config: LabBudgetConfig = {
		tokens: { anthropic: { ...LAB_BUDGET_DEFAULTS.tokens.anthropic }, openai: { ...LAB_BUDGET_DEFAULTS.tokens.openai }, kimi: { ...LAB_BUDGET_DEFAULTS.tokens.kimi } },
		quotaReservePct: LAB_BUDGET_DEFAULTS.quotaReservePct,
		quotaMaxAgeMin: LAB_BUDGET_DEFAULTS.quotaMaxAgeMin,
	};
	const errors: string[] = [];
	const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
	const pct = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
	const block = doc !== null && typeof doc === "object" && "labBudget" in doc ? doc.labBudget : undefined;
	if (block !== undefined && block !== null) {
		if (typeof block !== "object" || Array.isArray(block)) errors.push("labBudget is not a mapping");
		else {
			const b = block as Record<string, unknown>;
			const tokens = b.tokens;
			if (tokens !== undefined && (tokens === null || typeof tokens !== "object" || Array.isArray(tokens))) errors.push("labBudget.tokens is not a mapping");
			else if (tokens !== undefined) {
				for (const [lab, row] of Object.entries(tokens as Record<string, unknown>)) {
					if (!(LABS as readonly string[]).includes(lab)) {
						errors.push(`labBudget.tokens.${lab} is not a lab (${LABS.join(", ")})`);
						continue;
					}
					if (row === null || typeof row !== "object" || Array.isArray(row)) {
						errors.push(`labBudget.tokens.${lab} is not a mapping`);
						continue;
					}
					for (const [w, v] of Object.entries(row as Record<string, unknown>)) {
						if (w !== "5h" && w !== "24h") errors.push(`labBudget.tokens.${lab}.${w} is not a window (5h, 24h)`);
						else if (!positive(v)) errors.push(`labBudget.tokens.${lab}.${w} is not a positive number`);
						else config.tokens[lab as Lab][w] = v;
					}
				}
			}
			if (b.quotaReservePct !== undefined) {
				if (pct(b.quotaReservePct)) config.quotaReservePct = b.quotaReservePct;
				else errors.push("labBudget.quotaReservePct is not a number from 0 to 100");
			}
			if (b.quotaMaxAgeMin !== undefined) {
				if (positive(b.quotaMaxAgeMin)) config.quotaMaxAgeMin = b.quotaMaxAgeMin;
				else errors.push("labBudget.quotaMaxAgeMin is not a positive number");
			}
		}
	}
	for (const lab of LABS) {
		for (const { id } of LAB_WINDOWS) {
			const raw = env[labBudgetEnv(lab, id)]?.trim();
			if (!raw) continue;
			const n = Number(raw);
			if (positive(n)) config.tokens[lab][id] = n;
			else errors.push(`${labBudgetEnv(lab, id)}=${raw} is not a positive number`);
		}
	}
	const reserve = env[LAB_QUOTA_RESERVE_ENV]?.trim();
	if (reserve) {
		const n = Number(reserve);
		if (pct(n)) config.quotaReservePct = n;
		else errors.push(`${LAB_QUOTA_RESERVE_ENV}=${reserve} is not a number from 0 to 100`);
	}
	return { config, errors };
}

// ---- usage from the ledger ----------------------------------------------------------------------

export const ORCHESTRATOR_SPEND_PREFIX = "orchestrator-spend:";

/**
 * `orchestrator-spend: <sessionId> usd <x> tokens <n> wall 0[ labs …]`: the orchestrator's usage since its
 * previous record in this process (a delta, never cumulative), on the standing workload, written by the surface.
 */
export function orchestratorSpendBody(sessionId: string, s: { usd: number; tokens: number; labs?: LabTallies }): string {
	const labs = s.labs ? labsText(s.labs) : "";
	return `${ORCHESTRATOR_SPEND_PREFIX} ${sessionId} usd ${Math.round(s.usd * 1e4) / 1e4} tokens ${Math.round(s.tokens)} wall 0${labs ? ` labs ${labs}` : ""}`;
}

/** One lab's usage, dated: a `spend:` delta of a lane (`source` its lane id) or an orchestrator record (`source` `orchestrator`). */
export interface LabUsageEvent {
	at: number;
	workloadId: string;
	source: string;
	lab: Lab;
	tokens: number;
	usd: number;
}

export type UsageRow = Pick<EntryRow, "workload_id" | "body" | "created_by" | "created_at">;

const SPEND_LINE = /^spend:\s+(lane-\S+)\s+([\s\S]*)$/;
const ORCH_LINE = /^orchestrator-spend:\s+(\S+)\s+([\s\S]*)$/;
const BUILDER_LAB = /^builder-lab:\s+(\S+)\s+lane\s+(lane-\S+)/;
const LANE_STARTED = /^lane-started:\s+(lane-\S+)\s+(\{[\s\S]*\})$/;

/**
 * The lab each lane ran on, from `rows`: a `builder-lab: <lab> lane <lane>` entry (the classifier's), else the lane's
 * first `lane-started:` record by the runner or starter that names a model (`ranModel`, OMP's own report, before
 * the `model` Jo named). A lane neither names is absent.
 */
export function laneLabs(rows: readonly UsageRow[]): Map<string, Lab> {
	const fromBuilder = new Map<string, Lab>();
	const fromStart = new Map<string, Lab>();
	for (const r of rows) {
		const body = r.body.trim();
		const bl = BUILDER_LAB.exec(body);
		if (bl && (LABS as readonly string[]).includes(bl[1]!)) {
			fromBuilder.set(bl[2]!, bl[1] as Lab);
			continue;
		}
		const ls = (r.created_by === LANE_RUNNER_BY || r.created_by === LANE_STARTER_BY) ? LANE_STARTED.exec(body) : null;
		if (!ls || fromStart.has(ls[1]!)) continue;
		try {
			const v: unknown = JSON.parse(ls[2]!);
			const ran = field(v, "ranModel");
			const named = field(v, "model");
			const sel = typeof ran === "string" ? ran : typeof named === "string" ? named : null;
			const lab = sel === null ? null : labOf(sel);
			if (lab !== null) fromStart.set(ls[1]!, lab);
		} catch {
			// not a start record
		}
	}
	for (const [lane, lab] of fromBuilder) fromStart.set(lane, lab);
	return fromStart;
}

/**
 * The dated per-lab usage in `rows` (oldest first by `created_at`). A workload's `spend:` entries are
 * cumulative over its whole session directory (the runner scans every file from byte 0), so each counts
 * as its difference from the workload's previous one, never below zero. A body with a `labs` split counts
 * each lab's difference; one whose previous body had no split spreads its total difference by its own
 * split; a legacy body with no split counts wholly to its lane's lab (`laneLabs`), and to nothing when
 * no row names one. `orchestrator-spend:` entries are deltas already. Only the runner's `spend:` and
 * the surface's `orchestrator-spend:` count.
 */
export function usageEvents(rows: readonly UsageRow[]): LabUsageEvent[] {
	const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
	const laneLab = laneLabs(sorted);
	const prev = new Map<string, { tokens: number; usd: number; labs?: LabTallies }>();
	const out: LabUsageEvent[] = [];
	for (const r of sorted) {
		const body = r.body.trim();
		const at = Date.parse(r.created_at);
		if (!Number.isFinite(at)) continue;
		const orch = r.created_by === SURFACE_BY && r.workload_id === STANDING_WORKLOAD_ID ? ORCH_LINE.exec(body) : null;
		if (orch) {
			const s = parseSpend(orch[2]!);
			for (const lab of LABS) {
				const t = s?.labs?.[lab];
				if (t && t.tokens > 0) out.push({ at, workloadId: r.workload_id, source: "orchestrator", lab, tokens: t.tokens, usd: t.usd });
			}
			continue;
		}
		const sp = r.created_by === LANE_RUNNER_BY ? SPEND_LINE.exec(body) : null;
		if (!sp) continue;
		const s = parseSpend(sp[2]!);
		if (s === null) continue;
		const laneId = sp[1]!;
		const p = prev.get(r.workload_id);
		prev.set(r.workload_id, s);
		const dTokens = Math.max(0, s.tokens - (p?.tokens ?? 0));
		const dUsd = Math.max(0, s.usd - (p?.usd ?? 0));
		const push = (lab: Lab, tokens: number, usd: number) => {
			if (tokens > 0) out.push({ at, workloadId: r.workload_id, source: laneId, lab, tokens, usd });
		};
		if (s.labs && p?.labs) {
			for (const lab of LABS) {
				const cur = s.labs[lab];
				if (cur) push(lab, Math.max(0, cur.tokens - (p.labs[lab]?.tokens ?? 0)), Math.max(0, cur.usd - (p.labs[lab]?.usd ?? 0)));
			}
		} else if (s.labs && p) {
			for (const lab of LABS) {
				const cur = s.labs[lab];
				if (cur) push(lab, s.tokens > 0 ? dTokens * (cur.tokens / s.tokens) : 0, s.usd > 0 ? dUsd * (cur.usd / s.usd) : 0);
			}
		} else if (s.labs) {
			for (const lab of LABS) {
				const cur = s.labs[lab];
				if (cur) push(lab, cur.tokens, cur.usd);
			}
		} else {
			const lab = laneLab.get(laneId);
			if (lab) push(lab, dTokens, dUsd);
		}
	}
	return out;
}

// ---- the question and Jo's lift -----------------------------------------------------------------

export const LAB_BUDGET_OPTIONS = ["lift", "keep"] as const;
export type LabBudgetOption = (typeof LAB_BUDGET_OPTIONS)[number];
/** Who may raise the lab-budget question: the runner, the starter, the surface's tick. */
export const LAB_BUDGET_RAISERS: readonly string[] = [LANE_RUNNER_BY, LANE_STARTER_BY, SURFACE_BY];
const LAB_SLICE = /^sl-lab-budget-(anthropic|openai|kimi)-/;

/** `sl-lab-budget-<lab>-<wl suffix>-<n>`: the slice the question sits on (slice ids are ledger-wide). */
export function labSlicePrefix(lab: Lab, workloadId: string): string {
	return `sl-lab-budget-${lab}-${workloadId.replace(/^wl-/, "")}-`;
}

/** The lab of a lab-budget question: its slice names it and a raiser wrote it; null for any other question. */
export function labBudgetQuestionLab(q: Pick<QuestionRow, "slice_id" | "created_by">): Lab | null {
	const m = LAB_SLICE.exec(q.slice_id);
	return m && LAB_BUDGET_RAISERS.includes(q.created_by) ? (m[1] as Lab) : null;
}

export interface LabDecision {
	lab: Lab;
	word: LabBudgetOption;
	at: number;
	questionId: string;
	answerId: string;
}

/** Jo's answers to lab-budget questions, oldest first: `lift` or `keep` as the answer's first word, from Jo. */
export function labDecisions(questions: readonly QuestionRow[], instructions: readonly InstructionRow[]): LabDecision[] {
	const out: LabDecision[] = [];
	for (const q of questions) {
		const lab = labBudgetQuestionLab(q);
		if (lab === null || q.resolved_by === null) continue;
		const ins = instructions.find((i) => i.id === q.resolved_by);
		if (!ins || ins.kind !== "answer" || ins.author !== "jo") continue;
		const word = ins.body.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
		if (word !== "lift" && word !== "keep") continue;
		const at = Date.parse(ins.created_at);
		if (Number.isFinite(at)) out.push({ lab, word, at, questionId: q.id, answerId: ins.id });
	}
	return out.sort((a, b) => a.at - b.at);
}

// ---- quota (OMP's usage report) -----------------------------------------------------------------

/** One limit of OMP's `omp usage --json` report, as far as this module reads it. */
export interface QuotaLimit {
	provider: string;
	id: string;
	label: string;
	remainingFraction: number;
	durationMs: number | null;
	resetsAt: number | null;
}
export interface QuotaSnapshot {
	/** When the probe ran (ms). */
	probedAt: number;
	limits: QuotaLimit[];
}

/**
 * The cache file `{ probedAt, report }`, where `report` is `omp usage --json` as printed
 * (`{ reports: [{ provider, limits: [{ id, label, window: { durationMs, resetsAt }, amount: { remainingFraction } }] }] }`,
 * pi-ai/src/usage.ts). Limits with no remaining fraction are dropped; null when the shape is not that.
 */
export function parseQuotaCache(text: string): QuotaSnapshot | null {
	let v: unknown;
	try {
		v = JSON.parse(text);
	} catch {
		return null;
	}
	const probedAt = field(v, "probedAt");
	const reports = field(field(v, "report"), "reports");
	if (typeof probedAt !== "number" || !Number.isFinite(probedAt) || !Array.isArray(reports)) return null;
	const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
	const limits: QuotaLimit[] = [];
	for (const r of reports) {
		const provider = field(r, "provider");
		const ls = field(r, "limits");
		if (typeof provider !== "string" || !Array.isArray(ls)) continue;
		for (const l of ls) {
			const id = field(l, "id");
			const label = field(l, "label");
			const window = field(l, "window");
			const amount = field(l, "amount");
			const remaining = num(field(amount, "remainingFraction"));
			const used = num(field(amount, "usedFraction"));
			const rem = remaining ?? (used === null ? null : 1 - used);
			if (rem === null || typeof id !== "string") continue;
			limits.push({ provider, id, label: typeof label === "string" ? label : id, remainingFraction: rem, durationMs: num(field(window, "durationMs")), resetsAt: num(field(window, "resetsAt")) });
		}
	}
	return { probedAt, limits };
}

// ---- the state of each lab ----------------------------------------------------------------------

export interface LabConsumer {
	workloadId: string;
	source: string;
	tokens: number;
}

export interface LabState {
	lab: Lab;
	held: boolean;
	/** One clause per cause, e.g. `5h tokens 41.2M of budget 40M` or `quota openai-codex:primary 8% left (reserve 10%)`. */
	reasons: string[];
	/** Tokens counted per window (since Jo's newest lift when that is later than the window's start). */
	usage: Record<LabWindow, number>;
	budget: Record<LabWindow, number>;
	/** The largest consumers in the widest window that tripped (24 h when none did), most first, at most three. */
	top: LabConsumer[];
	/** Jo's newest `lift` (ms), or null. */
	liftedAt: number | null;
}

const H5 = 5 * 3_600_000;

/** `41.2M`, `950k`, `12`: a token count at a glance. */
export function tokensText(n: number): string {
	if (n >= 1e9) return `${Math.round(n / 1e8) / 10}B`;
	if (n >= 1e6) return `${Math.round(n / 1e5) / 10}M`;
	if (n >= 1e3) return `${Math.round(n / 100) / 10}k`;
	return `${Math.round(n)}`;
}

/**
 * Each lab's state at `now`. A window counts the events after `now − window` and after Jo's newest
 * `lift` of the lab, so a lift gives the lab a fresh window. The quota rule reads a snapshot no older
 * than `quotaMaxAgeMin`: any limit of the lab's providers at or under the reserve holds the lab, unless
 * Jo lifted it since that limit's window began (`resetsAt − durationMs`; with no window, a lift in the
 * last 5 h).
 */
export function labStates(input: { events: readonly LabUsageEvent[]; decisions: readonly LabDecision[]; quota: QuotaSnapshot | null; config: LabBudgetConfig; now: number }): Record<Lab, LabState> {
	const { events, decisions, quota, config, now } = input;
	const out = {} as Record<Lab, LabState>;
	const fresh = quota !== null && now - quota.probedAt <= config.quotaMaxAgeMin * 60_000 ? quota : null;
	for (const lab of LABS) {
		const liftedAt = decisions.filter((d) => d.lab === lab && d.word === "lift").at(-1)?.at ?? null;
		const usage = { "5h": 0, "24h": 0 } as Record<LabWindow, number>;
		const reasons: string[] = [];
		let topWindow: LabWindow = "24h";
		let tripped5h = false;
		for (const w of LAB_WINDOWS) {
			const from = Math.max(now - w.ms, liftedAt ?? Number.NEGATIVE_INFINITY);
			for (const e of events) if (e.lab === lab && e.at > from && e.at <= now) usage[w.id] += e.tokens;
			if (usage[w.id] >= config.tokens[lab][w.id]) {
				reasons.push(`${w.id} tokens ${tokensText(usage[w.id])} of budget ${tokensText(config.tokens[lab][w.id])}`);
				if (w.id === "5h") tripped5h = true;
			}
		}
		if (tripped5h && usage["24h"] < config.tokens[lab]["24h"]) topWindow = "5h";
		if (fresh && config.quotaReservePct > 0) {
			for (const l of fresh.limits) {
				if (labOf(l.provider) !== lab || l.remainingFraction * 100 > config.quotaReservePct) continue;
				const start = l.durationMs !== null && l.resetsAt !== null ? l.resetsAt - l.durationMs : null;
				const covered = liftedAt !== null && (start !== null ? liftedAt >= start : now - liftedAt < H5);
				if (!covered) reasons.push(`quota ${l.id} ${Math.round(l.remainingFraction * 100)}% left (reserve ${config.quotaReservePct}%)`);
			}
		}
		const fromTop = Math.max(now - (topWindow === "5h" ? H5 : 24 * 3_600_000), liftedAt ?? Number.NEGATIVE_INFINITY);
		const byKey = new Map<string, LabConsumer>();
		for (const e of events) {
			if (e.lab !== lab || e.at <= fromTop || e.at > now) continue;
			const key = `${e.workloadId} ${e.source}`;
			const c = byKey.get(key) ?? { workloadId: e.workloadId, source: e.source, tokens: 0 };
			c.tokens += e.tokens;
			byKey.set(key, c);
		}
		const top = [...byKey.values()].sort((a, b) => b.tokens - a.tokens).slice(0, 3);
		out[lab] = { lab, held: reasons.length > 0, reasons, usage, budget: { ...config.tokens[lab] }, top, liftedAt };
	}
	return out;
}

/** `wl-x lane-…-5 41.2M, wl-orchestrator orchestrator 3.1M`; `none recorded` when empty. */
export function consumersText(top: readonly LabConsumer[]): string {
	return top.length === 0 ? "none recorded" : top.map((c) => `${c.workloadId} ${c.source} ${tokensText(c.tokens)}`).join(", ");
}

/** The one line naming a held lab: what tripped, the usage per window, the top consumers. */
export function labHeldLine(s: LabState): string {
	return `lab budget: ${s.lab} is held (${s.reasons.join("; ")}); used 5h ${tokensText(s.usage["5h"])} of ${tokensText(s.budget["5h"])}, 24h ${tokensText(s.usage["24h"])} of ${tokensText(s.budget["24h"])}; top consumers: ${consumersText(s.top)}`;
}

/** The question Jo answers: the held line, what is held, and what each answer does. */
export function labBudgetQuestionBody(s: LabState): string {
	return `${labHeldLine(s)}. No new lane launch, relaunch or review dispatch runs on ${s.lab} while it is held. ` +
		`lift: start a fresh window for ${s.lab} from now (a quota hold stays lifted until that quota window resets) and relaunch the lanes the hold stopped. ` +
		`keep: stay held until the usage rolls out of the window; not asked again for 5 hours.`;
}

/**
 * Whether a lab-budget question for `lab` may be raised now: none open for the lab anywhere, and no `keep`
 * from Jo in the last 5 h (`keep` means stay held without being asked again).
 */
export function mayRaise(lab: Lab, questions: readonly QuestionRow[], decisions: readonly LabDecision[], now: number): boolean {
	if (questions.some((q) => q.state === "open" && labBudgetQuestionLab(q) === lab)) return false;
	const last = decisions.filter((d) => d.lab === lab).at(-1);
	return !(last && last.word === "keep" && now - last.at < H5);
}

// ---- which lab a launch runs on -------------------------------------------------------------------

/**
 * The lab the workload's next lane runs on: Jo's named model (`laneModel`), else the model the newest lane
 * that reported one ran (`lane-started:` ranModel, from OMP's get_state); null when neither is known
 * (a first launch on the profile default: the runner checks again once OMP names its model).
 */
export function nextLaneLab(control: readonly ControlEntry[]): Lab | null {
	const named = laneModel(control);
	if (named !== null) return labOf(named);
	for (let i = control.length - 1; i >= 0; i--) {
		const c = control[i]!;
		if (c.prefix !== "lane-started") continue;
		try {
			const ran = field(JSON.parse(c.rest), "ranModel");
			if (typeof ran === "string") return labOf(ran);
		} catch {
			// not a start record
		}
	}
	return null;
}

/** `v[key]` when `v` is an object that has it; undefined otherwise. Every JSON read above goes through it. */
function field(v: unknown, key: string): unknown {
	return v !== null && typeof v === "object" && key in v ? Reflect.get(v, key) : undefined;
}
