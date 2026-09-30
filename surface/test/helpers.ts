// Offline fixtures for the surface tests: temp ledgers through the ledger module with a settable
// clock, a fake OMP extension API following the runner's chaining (copied from
// gates/test/extension.test.ts so the two extensions are driven the same way), and a workload with
// one slice.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import type { SurfaceAPI } from "../src/types";

export const tmp = (tag: string): string => mkdtempSync(join(tmpdir(), `surface-${tag}-`));

/** A settable clock: `at(iso)` moves it; every ledger write stamps the current value. */
export function clock(start = "2026-10-01T10:00:00.000Z"): { now: () => string; at: (iso: string) => void; plusHours: (h: number) => void } {
	let t = start;
	return {
		now: () => t,
		at: (iso) => {
			t = iso;
		},
		plusHours: (h) => {
			t = new Date(Date.parse(t) + h * 3_600_000).toISOString();
		},
	};
}

export function tempLedger(now?: () => string): { ledger: Ledger; path: string } {
	const path = join(tmp("ledger"), "ledger.db");
	return { ledger: Ledger.open(path, { create: true, backup: false, backupOnOpen: false, ...(now ? { clock: now } : {}) }), path };
}

/** An open workload with one open slice, opened by a lane. */
export function workloadWithSlice(ledger: Ledger, over: { brief?: string; stakes?: "throwaway" | "normal" | "production"; mode?: "autonomous" | "user-driven" } = {}): { wl: string; sl: string } {
	const wl = ledger.openWorkload({ by: "lane-a", brief: over.brief ?? "Fix the feed header offset in newdle-web", stakes: over.stakes ?? "normal", mode: over.mode ?? "autonomous" });
	const sl = ledger.addSlice({ by: "lane-a", workloadId: wl, task: "Move the header offset into a token", doneCondition: "bun test passes", inputs: "src/header.css" });
	return { wl, sl };
}

type AnyHandler = (event: unknown, ctx: unknown) => unknown;
export interface FakeTool {
	name: string;
	execute(id: string, params: Record<string, unknown>, signal: undefined, onUpdate: undefined, ctx: unknown): Promise<{ content: { text: string }[]; details?: unknown }>;
}
const schema = (): unknown => ({ describe: () => schema(), optional: () => schema() });

export function fakePi(tools = ["read", "bash", "ask", "task", "yield"], o: { exec?: boolean } = {}) {
	const handlers = new Map<string, AnyHandler[]>();
	const entries: { type: string; data: unknown }[] = [];
	/** Messages pushed through pi.sendMessage (the between-wake delivery), with their options. */
	const sent: { message: { customType: string; content: string; display: boolean }; options?: unknown }[] = [];
	const registered = new Map<string, FakeTool>();
	let active = [...tools];
	const execs: {
		calls: { command: string; args: string[]; options: unknown }[];
		answer: (command: string, args: string[]) => { stdout: string; stderr: string; code: number; killed: boolean };
	} = { calls: [], answer: () => ({ stdout: "", stderr: "", code: 0, killed: false }) };
	const pi = {
		on: (name: string, h: AnyHandler) => handlers.set(name, [...(handlers.get(name) ?? []), h]),
		getActiveTools: () => [...active],
		getAllTools: () => tools.map((name) => ({ name })),
		setActiveTools: async (names: string[]) => {
			active = names;
		},
		appendEntry: (type: string, data?: unknown) => entries.push({ type, data }),
		registerTool: (t: FakeTool) => registered.set(t.name, t),
		sendMessage: (message: { customType: string; content: string; display: boolean }, options?: unknown) => sent.push({ message, options }),
		zod: { object: schema, string: schema, array: schema, enum: schema },
	};
	/** pi.exec, opt-in (`fakePi(tools, { exec: true })`): recorded, answered by `execs.answer` (default: exit 0, empty output). */
	const exec = async (command: string, args: string[], options?: unknown) => {
		execs.calls.push({ command, args, options });
		return execs.answer(command, args);
	};
	if (o.exec) Object.assign(pi, { exec });
	const emit = async (name: string, event: Record<string, unknown>, ctx: unknown): Promise<unknown> => {
		const hs = handlers.get(name) ?? [];
		if (name === "before_agent_start") {
			let systemPrompt = event.systemPrompt as string[];
			const messages: { customType: string; content: string }[] = [];
			for (const h of hs) {
				const r = (await h({ ...event, systemPrompt }, ctx)) as { systemPrompt?: string[]; message?: { customType: string; content: string } } | undefined;
				if (r?.message) messages.push(r.message);
				if (r?.systemPrompt) systemPrompt = r.systemPrompt;
			}
			return { systemPrompt, messages };
		}
		let last: unknown;
		for (const h of hs) {
			const r = (await h(event, ctx)) as { block?: boolean; decision?: string; handled?: boolean } | undefined;
			if (!r) continue;
			last = r;
			if (r.block || r.decision === "block" || r.handled) return r;
		}
		return last;
	};
	const tool = (name: string): FakeTool => {
		const t = registered.get(name);
		if (!t) throw new Error(`tool ${name} not registered`);
		return t;
	};
	return { pi: pi as unknown as SurfaceAPI, emit, entries, sent, execs, active: () => active, tool, registered: () => [...registered.keys()] };
}

export const notices: string[] = [];
/** Timers registered through ctx.setInterval (the surface's poll, the lane's lease renewal): fire one with `timers[i].fn()`. */
export const timers: { fn: () => void; ms: number }[] = [];
export const ctxOf = (o: { hasUI?: boolean; parent?: string; cwd?: string; resumed?: boolean; idle?: boolean } = {}) => {
	const shutdowns: number[] = [];
	const cleared: unknown[] = [];
	return {
		hasUI: o.hasUI ?? true,
		cwd: o.cwd ?? tmp("cwd"),
		sessionManager: { getHeader: () => ({ parentSession: o.parent }), getEntries: () => (o.resumed ? [{ type: "message" }] : []) },
		ui: { notify: (m: string) => notices.push(m) },
		setInterval: (fn: () => void, ms: number) => {
			timers.push({ fn, ms });
			return timers.length;
		},
		clearTimer: (t: unknown) => {
			cleared.push(t);
		},
		isIdle: () => o.idle ?? true,
		/** ctx.shutdown calls (lane_release / lane_handoff end the session through it). */
		shutdown: () => {
			shutdowns.push(Date.now());
		},
		shutdowns,
		cleared,
	};
};
