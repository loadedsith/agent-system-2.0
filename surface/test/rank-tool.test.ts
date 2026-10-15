// new guard: no fail-before
//
// sl-rank-tool of wl-mv8k039gvogt8g (PLAN rev 5 § 2 D4, D5; § 3 T7–T11): the `as2_rank` tool (surface/extensions/rank.ts),
// the open-time background ask (surface/extensions/workload.ts), the wake rank line (surface/src/render.ts) and the
// read-only `as2 rank` (surface/scripts/rank.ts). None exists before this slice, so this file fails on its imports until
// the build. Ledgers are real temp ledgers on the real clock (the surface opens its own handle, as in production); the
// judge is a fake that answers the rank questions from the brief's words, as OMP's judge answers on the wire (`noul`).
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import orchestratorSurface from "../index";
import { ensureStandingWorkload } from "../src/identity";
import { rankLines, renderWake } from "../src/render";
import { readingBody } from "../src/orchestrator-question";
import { briefHash, goalsHash, livePins, parseShown, rankOpen, SEED_GOALS, type Shown } from "../src/rank";
import { surfaceSession } from "../src/session";
import { RANK_BY, STANDING_WORKLOAD_ID, SURFACE_BY } from "../src/types";
import { ctxOf, fakePi, sh, tempLedger, tmp } from "./helpers";

const REPO = join(import.meta.dir, "..", "..");

type Wire = { state: { goals?: string[]; item?: string } | string; questions: Record<string, { type: string; instructions?: string; criteria?: unknown }> };

/**
 * A rank-question answer set on the wire: `HIGH` unblocks Jo, `MID` fixes breakage, `ENFORCER` builds an enforcer and
 * delivers the seed goal, `GOAL` delivers every goal of Jo's, `BAD` throws.
 */
function wireAnswers(req: Wire) {
	const item = typeof req.state === "string" ? req.state : String(req.state.item ?? "");
	const answers: Record<string, unknown> = {};
	for (const [name, q] of Object.entries(req.questions)) {
		if (q.type === "noul") {
			const yes = (name === "unblocks_jo" && item.includes("HIGH")) || (name === "fixes_breakage" && item.includes("MID")) || (name === "builds_enforcer" && item.includes("ENFORCER"));
			answers[name] = { type: "noul", noul: yes ? 0.95 : 0.05 };
		} else if (q.type === "choice") {
			const labels = Object.keys(q.criteria as Record<string, string>);
			answers[name] = { type: "choice", choice: "none", confidence: 0.95, probabilities: Object.fromEntries(labels.map((l) => [l, l === "none" ? 0.95 : 0.05 / (labels.length - 1)])) };
		} else {
			const top = String(q.instructions).includes(SEED_GOALS[0]!) ? item.includes("ENFORCER") : item.includes("GOAL");
			answers[name] = { type: "score", score: top ? 3 : 0, confidence: 0.9, probabilities: top ? { 0: 0.02, 1: 0.03, 2: 0.05, 3: 0.9 } : { 0: 0.9, 1: 0.05, 2: 0.03, 3: 0.02 } };
		}
	}
	return { answers, model: "jev-1.13.0", provider: "typesafe", usage: { input: 900 } };
}

interface FakeJudge {
	asks: { item: string; goals: string[] }[];
	judge: () => Promise<never>;
	factories: () => number;
}

/** The fake judge: every rank ask it took (`item`, `goals`), answering from the brief; `BAD` items throw. */
function fakeJudge(o: { during?: () => void } = {}): FakeJudge {
	const asks: { item: string; goals: string[] }[] = [];
	let factory = 0;
	const judge = {
		judge: async (req: Wire) => {
			const s = typeof req.state === "string" ? { item: req.state } : req.state;
			asks.push({ item: String(s.item ?? ""), goals: [...(s.goals ?? [])] });
			o.during?.();
			if (String(s.item).includes("BAD")) throw new Error("jev offline");
			return wireAnswers(req);
		},
	};
	return { asks, judge: async () => (factory++, judge as never), factories: () => factory };
}

type Role = "orchestrator" | "lane" | "hand";

/** One ledger and a session of `role` over it with `judge` wired; `call` runs as2_rank. */
function world(role: Role = "orchestrator", judgeOf: FakeJudge = fakeJudge()) {
	const { ledger, path } = tempLedger();
	ensureStandingWorkload(ledger);
	const env: Record<string, string> = { AGENT_SYSTEM_ROLE: role === "orchestrator" ? "orchestrator" : "lane", AGENT_SYSTEM_LEDGER_DB: path, HOME: "/nonexistent-home" };
	if (role === "lane") Object.assign(env, { AGENT_SYSTEM_LANE_ID: "lane-r-1" });
	const f = fakePi(undefined, { exec: false });
	orchestratorSurface(f.pi, env, { judge: judgeOf.judge, askTimeoutMs: 2_000 });
	const ctx = role === "hand" ? ctxOf({ hasUI: false, parent: "/sessions/parent.jsonl" }) : ctxOf();
	if (role === "hand") Object.assign(ctx.sessionManager, { getSessionFile: () => "/sessions/artifacts/StrongRankHand.jsonl" });
	const call = async (params: Record<string, unknown> = {}) => {
		const r = await f.tool("as2_rank").execute("1", params, undefined, undefined, ctx);
		return { text: r.content[0]!.text, details: r.details as { items: string[]; shown: string } | undefined };
	};
	const open = (brief: string) => ledger.openWorkload({ by: SURFACE_BY, brief, stakes: "normal", mode: "autonomous" });
	/** An input row of Jo's words, as the surface writes it. */
	const input = (words = "this first") => {
		ledger.recordInstruction({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, body: words, author: "jo", channel: "surface" });
		return ledger.instructions(STANDING_WORKLOAD_ID).at(-1)!.id;
	};
	/** Every row of every kind the ledger holds, as one count per table. */
	const rows = () => ["entries", "instructions", "questions", "workloads", "slices", "messages"].map((t) => ledger.db.query<{ n: number }, []>(`SELECT count(*) AS n FROM ${t}`).get()!.n);
	const shown = (): (Shown & { id: string })[] =>
		ledger.entries(STANDING_WORKLOAD_ID, "assumption").filter((e) => e.created_by === RANK_BY && e.body.startsWith("rank-shown: ")).map((e) => ({ id: e.id, ...parseShown(e.body)! }));
	const bodies = (wl: string, prefix: string) => ledger.entries(wl, "assumption").filter((e) => e.body.startsWith(prefix)).map((e) => e.body);
	return { ledger, path, env, f, ctx, call, open, input, rows, shown, bodies, judge: judgeOf };
}

const order = (ledger: Ledger) => rankOpen(ledger, new Date().toISOString()).map((i) => i.workloadId);

describe("T7 fill", () => {
	test("each item lacking a current signal gets one ask; a second call asks none; a new workload is asked alone; the returned order is rankOpen's", async () => {
		const w = world();
		const low = w.open("Tidy the README wording");
		const high = w.open("HIGH: stop Jo pasting lane ids by hand");
		const mid = w.open("MID: the wake render crashes on an empty ledger");
		const first = await w.call();
		expect(w.judge.asks).toHaveLength(3);
		expect(w.judge.asks.map((a) => a.item.split("\n")[0]).sort()).toEqual(["HIGH: stop Jo pasting lane ids by hand", "MID: the wake render crashes on an empty ledger", "Tidy the README wording"]);
		expect(first.details!.items).toEqual([high, mid, low]);
		expect(first.details!.items).toEqual(order(w.ledger));
		expect(w.bodies(high, "priority-signal: ")).toHaveLength(1);
		expect(w.bodies(high, "priority-signal: ")[0]).toContain(`brief ${briefHash(w.ledger.workload(high)!.brief)} goals ${goalsHash([])}`);
		// the table: the rows in that order, every term column, the goals line, the weights, the parallel read, show-only
		const lines = first.text.split("\n");
		const rowsOf = lines.filter((l) => /^\d+ · wl-/.test(l));
		expect(rowsOf.map((l) => l.split(" · ")[1])).toEqual([high, mid, low]);
		expect(first.text).toContain("goals: none");
		expect(first.text).toContain("weights: goal_max 0.3 · unblocks_jo 0.2 · fixes_breakage 0.15 · urgency 0.2 · cuts_spend 0.15");
		expect(first.text).toContain("parallel read");
		expect(first.text).toContain("show-only: launch order is unchanged (as2 rank-mode)");

		await w.call();
		expect(w.judge.asks).toHaveLength(3);
		const late = w.open("A later workload");
		await w.call();
		expect(w.judge.asks).toHaveLength(4);
		expect(w.judge.asks[3]!.item).toStartWith("A later workload");
		expect(order(w.ledger)).toEqual([high, mid, low, late]);
		// refresh re-asks every item
		await w.call({ refresh: "yes" });
		expect(w.judge.asks).toHaveLength(8);
	});

	test("the third failure on a (brief, goals) pair stops asks for it; the item is listed unscored as jev failed", async () => {
		const w = world();
		const bad = w.open("BAD brief the judge cannot answer");
		for (let i = 1; i <= 3; i++) {
			const r = await w.call();
			expect(r.text).toContain(`${bad} error: jev offline`);
		}
		expect(w.judge.asks).toHaveLength(3);
		expect(w.bodies(bad, "priority-signal-failed: ").map((b) => / attempt (\d) error /.exec(b)?.[1])).toEqual(["1", "2", "3"]);
		const fourth = await w.call();
		expect(w.judge.asks).toHaveLength(3);
		expect(fourth.text).toContain(`unscored: ${bad} (jev failed)`);
		expect(w.bodies(bad, "priority-signal-failed: ")).toHaveLength(3);
	});

	test("with goals, the asks see the proposed goals and the call's own rank-shown ranks with them", async () => {
		const w = world();
		const high = w.open("HIGH: stop Jo pasting lane ids by hand");
		const goal = w.open("GOAL: ship the ranking work");
		await w.call();
		expect(order(w.ledger)).toEqual([high, goal]); // no goals of Jo's: the seed goal term is 0 for both
		const asked = w.judge.asks.length;
		const goals = ["Ship the ranking work this week"];
		const r = await w.call({ goals, inputId: w.input("rank the ranking work first") });
		expect(w.judge.asks.slice(asked).map((a) => a.goals)).toEqual([[...SEED_GOALS, ...goals], [...SEED_GOALS, ...goals]]);
		const mine = w.shown().at(-1)!;
		expect(mine.by).toBe("orchestrator");
		expect(mine.goals).toBe(goalsHash(goals));
		expect(mine.items.map((i) => i.workloadId)).toEqual([goal, high]);
		expect(r.details!.items).toEqual([goal, high]);
		expect(order(w.ledger)).toEqual([goal, high]);
	});

	test("an item Jev says builds an enforcer ranks first over higher scores, its row flagged; the goals line shows the seed goal", async () => {
		const w = world();
		const high = w.open("HIGH MID: unblocks Jo and fixes the wake");
		const gate = w.open("ENFORCER: a review gate every plan passes");
		const low = w.open("Tidy the README wording");
		const r = await w.call();
		expect(w.judge.asks.map((a) => a.goals)).toEqual([[...SEED_GOALS], [...SEED_GOALS], [...SEED_GOALS]]);
		expect(r.details!.items).toEqual([gate, high, low]);
		const rowsOf = r.text.split("\n").filter((l) => /^\d+ · wl-/.test(l));
		expect(rowsOf[0]).toContain(`1 · ${gate} · autonomous/waiting · - · `);
		expect(rowsOf[0]).toContain(" · enforcer: ranks first · ENFORCER: a review gate every plan passes");
		expect(rowsOf[1]).toContain(` · - · HIGH MID: unblocks Jo and fixes the wake`);
		expect(r.text).toContain(`goals: none (only the seed goals weigh; seed goal, asked first and never stale: "${SEED_GOALS[0]}"`);
	});
});

describe("T8 Jo receipt", () => {
	test("goals, first or unpin with no input, a non-input, or a spent input: refused, no row of any kind written, no judge call", async () => {
		const w = world();
		const wl = w.open("HIGH: unscored so far");
		const spent = w.input("this first");
		const r = await w.f.tool("orchestrator_record_instruction").execute("1", { workloadId: wl, inputId: spent, reading: "do this first" }, undefined, undefined, w.ctx);
		expect(r.content[0]!.text).toStartWith("Recorded instruction");
		const before = w.rows();
		for (const params of [{ goals: ["Ship it"] }, { first: wl }, { first: wl, inputId: "in-nope" }, { goals: ["Ship it"], inputId: spent }, { first: wl, inputId: spent }, { inputId: w.input("x") }]) {
			const res = await w.call(params);
			expect(res.text).toStartWith("Refused: ");
			expect(res.text).toContain("Nothing was written and Jev was not asked.");
		}
		// the one input row the loop typed is the only new row
		expect(w.rows()).toEqual([before[0], before[1]! + 1, ...before.slice(2)]);
		expect(w.judge.asks).toEqual([]);
		expect(w.judge.factories()).toBe(0);
	});

	test("on a lane session and a hand session Jo's parameters are refused with nothing written and no judge call", async () => {
		for (const role of ["lane", "hand"] as const) {
			const w = world(role);
			const wl = w.open("HIGH: unscored so far");
			const inputId = w.input("goals: ship it");
			const before = w.rows();
			for (const params of [{ goals: ["Ship it"], inputId }, { first: wl, inputId }, { unpin: wl, inputId }]) {
				const res = await w.call(params);
				expect(res.text).toStartWith("Refused: goals, first and unpin are Jo's words, recorded only by the orchestrator");
			}
			expect(w.rows()).toEqual(before);
			expect(w.judge.asks).toEqual([]);
		}
	});

	test("a fresh input with goals and first: every row in one transaction, the input spent once, then refused by as2_rank and by orchestrator_record_instruction", async () => {
		const w = world();
		const a = w.open("HIGH: stop Jo pasting lane ids by hand");
		const b = w.open("Tidy the README wording");
		const inputId = w.input("ship the ranking; the README first");
		// count the surface handle's outermost write transactions, and which one each row landed in
		const handle = surfaceSession(w.ctx, w.env).ledger();
		const write = handle.write.bind(handle);
		const recordEntry = handle.recordEntry.bind(handle);
		let depth = 0;
		let outer = 0;
		const landed: number[] = [];
		Object.assign(handle, {
			write: <T>(fn: () => T): T => {
				if (depth++ === 0) outer++;
				try {
					return write(fn);
				} finally {
					depth--;
				}
			},
			recordEntry: (...args: Parameters<Ledger["recordEntry"]>) => (landed.push(depth > 0 ? outer : -1), recordEntry(...args)),
		});
		const r = await w.call({ goals: ["Ship the ranking work"], first: b, inputId });
		expect(r.text).toContain(`Jo's input ${inputId} spent`);
		expect(new Set(landed)).toEqual(new Set([outer]));
		const control = w.ledger.entries(STANDING_WORKLOAD_ID, "assumption").map((e) => e.body.split(":")[0]);
		expect(control.slice(-5)).toEqual(["rank-goals", "rank-shown", "rank-override", "rank-shown", "reading"]);
		expect(w.bodies(a, "priority-signal: ")).toHaveLength(1);
		expect(w.bodies(b, "priority-signal: ")).toHaveLength(1);
		// 2 signals + goals + pick + override + shown + reading
		expect(landed).toHaveLength(7);
		const readings = w.bodies(STANDING_WORKLOAD_ID, "reading: ").filter((x) => x.includes(inputId));
		expect(readings).toEqual([readingBody(`as2_rank rank goals: "Ship the ranking work"; ${b} first (a pin)`, inputId, b)]);
		// spent: as2_rank and orchestrator_record_instruction both refuse it now
		const before = w.rows();
		expect((await w.call({ unpin: b, inputId })).text).toContain(`${inputId} already instructed ${b}`);
		const ri = await w.f.tool("orchestrator_record_instruction").execute("1", { workloadId: a, inputId, reading: "again" }, undefined, undefined, w.ctx);
		expect(ri.content[0]!.text).toContain(`${inputId} already instructed ${b}, and one input is recorded once`);
		expect(w.rows()).toEqual(before);
	});

	test("an input spent between the fill and the transaction aborts the transaction with nothing written", async () => {
		let spend: (() => void) | null = null;
		const judge = fakeJudge({ during: () => spend?.() });
		const w = world("orchestrator", judge);
		const a = w.open("HIGH: stop Jo pasting lane ids by hand");
		const inputId = w.input("a first");
		spend = () => {
			w.ledger.recordEntry({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, kind: "assumption", body: readingBody("elsewhere", inputId, a) });
			spend = null;
		};
		const before = w.rows();
		const r = await w.call({ first: a, inputId });
		expect(judge.asks).toHaveLength(1);
		expect(r.text).toStartWith(`Refused: ${inputId} was spent on ${a} while Jev was asked`);
		// only the racing reading entry landed: no signal, no pick, no pin, no rank-shown
		expect(w.rows()).toEqual([before[0]! + 1, ...before.slice(1)]);
		expect(livePins(w.ledger)).toEqual([]);
		expect(w.bodies(a, "priority-signal")).toEqual([]);
	});
});

describe("T8b pins", () => {
	test("first on the item Jev ranks last puts it at #1 in the same reply and after; the pick snapshot is Jev's unpinned waiting order; unpin drops it in the same reply", async () => {
		const w = world();
		const high = w.open("HIGH: stop Jo pasting lane ids by hand");
		const mid = w.open("MID: the wake render crashes");
		const low = w.open("Tidy the README wording");
		await w.call();
		expect(order(w.ledger)).toEqual([high, mid, low]);
		const pinIn = w.input(`${low} first`);
		const r = await w.call({ first: low, inputId: pinIn });
		expect(r.details!.items).toEqual([low, high, mid]);
		expect(r.text.split("\n").find((l) => l.startsWith("1 · "))).toContain(`${low} · autonomous/waiting · pinned (Jo, ${pinIn})`);
		expect(order(w.ledger)).toEqual([low, high, mid]);
		const [pick, mine] = w.shown().slice(-2);
		expect(pick!.by).toBe("pick");
		expect(pick!.items.map((i) => [i.workloadId, i.pinned])).toEqual([[high, false], [mid, false], [low, false]]);
		expect(mine!.items.map((i) => [i.workloadId, i.pinned])).toEqual([[low, true], [high, false], [mid, false]]);
		expect(w.bodies(STANDING_WORKLOAD_ID, "rank-override: ")).toEqual([`rank-override: ${low} input ${pinIn} shown ${pick!.id}`]);

		// two pins: newest first
		const second = w.input(`${mid} first`);
		expect((await w.call({ first: mid, inputId: second })).details!.items).toEqual([mid, low, high]);
		// unpin: the reply already shows it gone
		const unpinIn = w.input(`drop the pin on ${mid}`);
		const u = await w.call({ unpin: mid, inputId: unpinIn });
		expect(u.details!.items).toEqual([low, high, mid]);
		expect(w.bodies(STANDING_WORKLOAD_ID, "rank-unpin: ")).toEqual([`rank-unpin: ${mid} input ${unpinIn}`]);
		// a pin ends with its workload
		w.ledger.closeWorkload(low, { by: SURFACE_BY });
		expect(livePins(w.ledger)).toEqual([]);
		expect(order(w.ledger)).toEqual([high, mid]);
		// unpin with no live pin is refused
		expect((await w.call({ unpin: high, inputId: w.input("unpin it") })).text).toStartWith(`Refused: ${high} has no live pin to drop`);
	});
});

describe("T9 registration", () => {
	test("as2_rank registers on orchestrator, lane and hand sessions alike; each call writes its own rank-shown by", async () => {
		const byOf: Record<Role, string> = { orchestrator: "orchestrator", lane: "lane-r-1", hand: "hand:StrongRankHand" };
		for (const role of ["orchestrator", "lane", "hand"] as const) {
			const w = world(role);
			const wl = w.open("HIGH: stop Jo pasting lane ids by hand");
			expect(w.f.registered()).toContain("as2_rank");
			const r = await w.call();
			expect(r.details!.items).toEqual([wl]);
			expect(w.shown().map((s) => s.by)).toEqual([byOf[role]]);
			expect(w.bodies(wl, "priority-signal: ")).toHaveLength(1);
		}
	});
});

describe("T10 wake line and CLI", () => {
	test("the wake line and as2 rank show the tool's top 3 over one fixture ledger; neither asks a judge nor writes", async () => {
		const w = world();
		const wls = [w.open("Tidy the README wording"), w.open("HIGH: stop Jo pasting lane ids by hand"), w.open("MID: the wake render crashes"), w.open("HIGH MID: both at once")];
		const r = await w.call();
		const top3 = r.details!.items.slice(0, 3);
		expect(top3).toEqual([wls[3], wls[1], wls[2]]);
		const asked = w.judge.asks.length;
		const factories = w.judge.factories();
		const before = w.rows();
		const rankRows = () => w.ledger.db.query<{ n: number }, []>("SELECT count(*) AS n FROM entries WHERE body LIKE 'priority-signal%' OR body LIKE 'rank-%'").get()!.n;
		const rankBefore = rankRows();

		const now = new Date().toISOString();
		const [line] = rankLines(w.ledger, now);
		expect(line).toStartWith("Rank (Jev, show-only): 1 ");
		expect([...line!.matchAll(/\b(\d) (wl-\S+)/g)].map((m) => m[2])).toEqual(top3);
		expect(line).toContain("; 0 unscored; goals none; as2_rank for the table");
		expect(renderWake(w.ledger, { holdHours: 24, now }).text).toContain(line!);

		const home = tmp("home");
		const cli = sh(["bun", join(REPO, "surface", "scripts", "rank.ts"), "--top", "3"], REPO, { PATH: process.env.PATH ?? "", HOME: home, AGENT_SYSTEM_LEDGER_DB: w.path });
		expect(cli.code).toBe(0);
		const cliRows = cli.out.split("\n").filter((l) => /^\d+ · wl-/.test(l)).map((l) => l.split(" · ")[1]);
		expect(cliRows).toEqual(top3);
		expect(cli.out).toContain("fill: none (read-only");
		expect(cli.out).toContain("show-only: launch order is unchanged (as2 rank-mode)");
		expect(w.rows()).toEqual(before);

		// the orchestrator's own wake carries the same line
		await w.f.emit("session_start", { type: "session_start" }, w.ctx);
		const started = (await w.f.emit("before_agent_start", { prompt: "status", systemPrompt: ["base"] }, w.ctx)) as { messages: { content: string }[] };
		expect(started.messages[0]!.content).toContain(line!);

		expect(w.judge.asks).toHaveLength(asked);
		expect(w.judge.factories()).toBe(factories);
		// the wake writes its own surface bookkeeping, but no rank row: no signal, failure, goals, shown, pin or audit
		expect(rankRows()).toBe(rankBefore);
	});

	test("an unscored item: the wake line and the CLI list it unscored, with its reason in the CLI", () => {
		const w = world();
		const wl = w.open("Never asked");
		const now = new Date().toISOString();
		expect(rankLines(w.ledger, now)).toEqual([`Rank (Jev, show-only): 1 ${wl} Never asked (unscored); 1 unscored; goals none; as2_rank for the table`]);
		const cli = sh(["bun", join(REPO, "surface", "scripts", "rank.ts")], REPO, { PATH: process.env.PATH ?? "", HOME: tmp("home"), AGENT_SYSTEM_LEDGER_DB: w.path });
		expect(cli.code).toBe(0);
		expect(cli.out).toContain(`unscored: ${wl} (no signal)`);
		expect(sh(["bun", join(REPO, "surface", "scripts", "rank.ts"), "--top", "x"], REPO, { PATH: process.env.PATH ?? "", HOME: tmp("home"), AGENT_SYSTEM_LEDGER_DB: w.path }).code).toBe(1);
	});
});

describe("T11 open", () => {
	const OPEN = { brief: "HIGH: stop Jo pasting lane ids by hand", stakes: "normal", done: "it is done" };
	const KINDS = ["locate", "understand", "change-small", "change-large", "judge"];
	const SIZED = { answers: { kind: { choice: "change-large", confidence: 0.9, probabilities: Object.fromEntries(KINDS.map((k) => [k, k === "change-large" ? 0.9 : 0.025])) } }, provider: "typesafe", model: "jev" };

	/** A surface whose judge answers the sizing ask at once and each rank ask with `rank`; `written` resolves with the first rank row the surface writes. */
	function opener(rank: (req: Wire) => Promise<unknown>) {
		const { ledger, path } = tempLedger();
		const env = { AGENT_SYSTEM_ROLE: "orchestrator", AGENT_SYSTEM_LEDGER_DB: path, HOME: "/nonexistent-home" };
		const rankAsks: Wire[] = [];
		const judge = {
			judge: (req: Wire) => {
				if ("kind" in req.questions) return Promise.resolve(SIZED);
				rankAsks.push(req);
				return rank(req);
			},
		};
		const f = fakePi(undefined, { exec: false });
		orchestratorSurface(f.pi, env, { judge: async () => judge as never });
		const ctx = ctxOf();
		const handle = surfaceSession(ctx, env).ledger();
		const recordEntry = handle.recordEntry.bind(handle);
		const written = Promise.withResolvers<string>();
		Object.assign(handle, {
			recordEntry: (...args: Parameters<Ledger["recordEntry"]>) => {
				const id = recordEntry(...args);
				if (args[0].body.startsWith("priority-signal")) written.resolve(args[0].body);
				return id;
			},
		});
		const open = async () => {
			const r = await f.tool("orchestrator_open_workload").execute("1", OPEN, undefined, undefined, ctx);
			return { id: (r.details as { id: string }).id, text: r.content[0]!.text };
		};
		return { ledger, rankAsks, open, written: written.promise };
	}

	test("opening a workload starts one background ask and its signal is written on its own", async () => {
		const o = opener(async (req) => wireAnswers(req));
		const r = await o.open();
		expect(r.text).toStartWith(`Opened ${r.id}`);
		expect(await o.written).toStartWith("priority-signal: ");
		expect(o.rankAsks).toHaveLength(1);
		const signals = o.ledger.entries(r.id, "assumption").filter((e) => e.body.startsWith("priority-signal: "));
		expect(signals.map((e) => e.created_by)).toEqual([RANK_BY]);
		expect(rankOpen(o.ledger, new Date().toISOString())[0]).toMatchObject({ workloadId: r.id, score: expect.any(Number) });
	});

	test("a judge that throws does not fail the open; its failure is a failure row", async () => {
		const o = opener(async () => {
			throw new Error("jev offline");
		});
		const r = await o.open();
		expect(r.text).toStartWith(`Opened ${r.id}`);
		expect(await o.written).toMatch(/^priority-signal-failed: .* attempt 1 error /);
		expect(o.rankAsks).toHaveLength(1);
	});

	test("a judge that hangs does not delay the open: it returns with the ask still pending, and the ask's end is written later", async () => {
		const hang = Promise.withResolvers<never>();
		const o = opener(() => hang.promise);
		const r = await o.open();
		expect(r.text).toStartWith(`Opened ${r.id}`);
		expect(o.rankAsks).toHaveLength(1);
		expect(o.ledger.entries(r.id, "assumption").filter((e) => e.body.startsWith("priority-signal"))).toEqual([]);
		hang.reject(new Error("released"));
		expect(await o.written).toMatch(/^priority-signal-failed: .* attempt 1 error /);
	});
});
