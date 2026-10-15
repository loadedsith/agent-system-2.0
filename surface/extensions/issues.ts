// The issues row (PLAN wl-mv66ylim0gahog § 2, § 8, § 13.2): the projection of the ledger onto each
// workload's tracker (GitHub issues or a Linear team), drained only here, in the orchestrator
// surface's own process. Inert unless the session is the surface (`s.active`: the orchestrator's
// top-level session); lanes and hands load it and do nothing.
//
// On `session_start` it registers its own `ctx.setInterval` at the surface poll's cadence
// (`s.pollMs`, the same timer source surface/extensions/wake.ts uses for its poll). Each firing
// starts one projector tick (surface/src/issues/projector.ts) fire-and-forget: never awaited by the
// poll, a wake push or a turn, so no turn waits on GitHub. One tick at a time in the process
// (`running`; a firing while one runs is skipped) and across processes (the sidecar claim). Every
// error is caught and becomes a tick notice on the surface's queue (`s.tickNotices`, pushed by the
// wake row's poll), once per distinct text for the session.
//
// No `issues:` block in profile/config.yml (or `$AGENT_SYSTEM_ISSUES_CONFIG`) ⇒ nothing is opened
// and no call is made. The switch (`switch: issues on|off …` on wl-orchestrator) is read every tick.
// Linear's key is `LINEAR_API_KEY` from this process's environment, read per tick and handed to the
// projector only; every notice line has it redacted before it is queued.
import { randomUUID } from "node:crypto";
import { loadIssuesConfig } from "../src/issues/config";
import { type FetchLike, LINEAR_KEY_ENV, redact } from "../src/issues/linear";
import { type TickPhases, tick } from "../src/issues/projector";
import { Sidecar, sidecarPath } from "../src/issues/sidecar";
import { type SurfaceSession, surfaceSession } from "../src/session";
import type { SurfaceAPI } from "../src/types";

export interface IssuesDeps {
	/** The phases after the push (reconcile, intake); wired in by a later step. */
	phases?: TickPhases;
	/** Epoch ms; tests move it. */
	now?: () => number;
	/** Linear's fetch; tests fake it. Default: the global fetch. */
	fetch?: FetchLike;
}

interface RowState {
	started: boolean;
	running: boolean;
	/** Notice texts already queued this session. */
	readonly told: Set<string>;
	sidecar: Sidecar | null;
	/** This drainer for the claim: pid + a per-session id. */
	readonly holder: string;
	/** The tick in flight, or the last one (a test seam: tests await it after firing the timer). */
	last: Promise<void> | null;
	shutdown: boolean;
}

const STATES = new WeakMap<SurfaceSession, RowState>();

function rowState(s: SurfaceSession): RowState {
	let st = STATES.get(s);
	if (!st) {
		st = { started: false, running: false, told: new Set(), sidecar: null, holder: `${process.pid}:${randomUUID()}`, last: null, shutdown: false };
		STATES.set(s, st);
	}
	return st;
}

/** The tick in flight (or the last one) for this surface session, or null before any; tests await it. */
export function issuesTickInFlight(s: SurfaceSession): Promise<void> | null {
	return STATES.get(s)?.last ?? null;
}

export default function issuesRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env, deps: IssuesDeps = {}): void {
	const now = deps.now ?? (() => Date.now());

	const tell = (s: SurfaceSession, st: RowState, raw: string): void => {
		const line = redact(raw, env[LINEAR_KEY_ENV]?.trim());
		if (st.told.has(line)) return;
		st.told.add(line);
		s.tickNotices.push(`tick: issues: ${line}`);
	};

	const runTick = async (s: SurfaceSession, st: RowState): Promise<void> => {
		try {
			const cfg = loadIssuesConfig(env);
			if (!cfg.ok) {
				tell(s, st, `the issues: block of the profile config does not parse: ${cfg.error}`);
				return;
			}
			if (cfg.config === null) return;
			if (!pi.exec) {
				tell(s, st, "the host has no exec for extensions; the issues projection cannot run");
				return;
			}
			st.sidecar ??= Sidecar.open(sidecarPath(env));
			await tick({
				exec: pi.exec.bind(pi),
				ledger: s.ledger(),
				sidecar: st.sidecar,
				config: cfg.config,
				holder: st.holder,
				now,
				notice: (line) => tell(s, st, line),
				...(deps.phases ? { phases: deps.phases } : {}),
				linear: { key: env[LINEAR_KEY_ENV]?.trim() || null, fetch: deps.fetch ?? ((url, init) => fetch(url, init)) },
			});
		} catch (err) {
			tell(s, st, `the issues tick failed: ${String(err instanceof Error ? err.message : err)}`);
		} finally {
			st.running = false;
			if (st.shutdown) {
				st.sidecar?.close();
				st.sidecar = null;
			}
		}
	};

	pi.on("session_start", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const st = rowState(s);
		if (st.started) return undefined;
		st.started = true;
		ctx.setInterval(() => {
			if (st.running || st.shutdown) return;
			st.running = true;
			st.last = runTick(s, st).catch((err: unknown) => {
				process.stderr.write(`surface: the issues tick failed: ${String(err)}\n`);
			});
		}, s.pollMs);
		return undefined;
	});

	pi.on("session_shutdown", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const st = rowState(s);
		st.shutdown = true;
		if (!st.running) {
			st.sidecar?.close();
			st.sidecar = null;
		}
		return undefined;
	});
}
