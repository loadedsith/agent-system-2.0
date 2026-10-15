// Every GitHub call the issues projection makes (PLAN wl-mv66ylim0gahog § 2 github.ts, § 3 claim).
// Each `gh` call goes through the extension API's exec with NETWORK_MS and is counted before it
// runs: against `perTick` in memory, and against `perHour` by a `calls` row inserted in one
// IMMEDIATE sidecar transaction that first checks and renews this tick's claim. Over either cap, or
// with the claim lost, the call is not made and the tick ends (`TickStop`): a budget stop is never a
// failure, so nothing backs off for it. A call that runs and fails is a failure the caller handles.
// Bodies always go as argv (`--body <text>`): exec has no stdin.
import type { ExecResult, SurfaceAPI } from "../types";
import type { Sidecar } from "./sidecar";

/** A network call's timeout (the close path's own, surface/src/close-entry.ts). */
export const NETWORK_MS = 60_000;

export type Exec = NonNullable<SurfaceAPI["exec"]>;

/**
 * Thrown by a counted call that is not made: `budget` (this tick's `perTick` or the hour's
 * `perHour` is spent) or `lost` (another holder has the claim). The tick ends quietly; a phase that
 * must record "the budget ran out" (the reconciler's `unknown`) catches it, records, and rethrows.
 */
export class TickStop extends Error {
	constructor(readonly reason: "budget" | "lost", readonly detail: string) {
		super(`issues tick stopped: ${reason} (${detail})`);
	}
}

export type GhOutcome = { ok: true; out: string } | { ok: false; error: string };

export interface GhCallerOptions {
	holder: string;
	perTick: number;
	perHour: number;
	/** Epoch ms; tests move it. */
	now: () => number;
}

/** The counted gh caller one tick uses; phases get the same instance, so they share its budget. */
export class GitHub {
	/** Counted calls this tick made. */
	calls = 0;

	constructor(
		private readonly exec: Exec,
		private readonly sidecar: Sidecar,
		private readonly o: GhCallerOptions,
	) {}

	/** One counted `gh <args>`; throws TickStop when it may not run, never on a failed call. */
	async run(args: readonly string[]): Promise<GhOutcome> {
		if (this.calls >= this.o.perTick) throw new TickStop("budget", `${this.o.perTick} calls this tick`);
		const counted = this.sidecar.countCall(this.o.holder, this.o.now(), this.o.perHour);
		if (counted === "lost") throw new TickStop("lost", "another process holds the issues claim");
		if (counted === "hour") throw new TickStop("budget", `${this.o.perHour} calls this hour`);
		this.calls++;
		let r: ExecResult;
		try {
			r = await this.exec("gh", [...args], { timeout: NETWORK_MS });
		} catch (err) {
			return { ok: false, error: `gh ${args.slice(0, 2).join(" ")} failed: ${String(err instanceof Error ? err.message : err).split("\n")[0]}` };
		}
		if (r.code === 0 && !r.killed) return { ok: true, out: r.stdout };
		const why = r.killed ? "timed out" : `exited ${r.code}`;
		return { ok: false, error: `gh ${args.slice(0, 2).join(" ")} ${why}: ${(r.stderr.trim() || r.stdout.trim() || "no output").split("\n")[0]}` };
	}

	/** A counted call whose stdout is JSON: the parsed value, or a failure naming what it printed. */
	async json(args: readonly string[]): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
		const r = await this.run(args);
		if (!r.ok) return r;
		try {
			return { ok: true, value: JSON.parse(r.out) };
		} catch {
			return { ok: false, error: `gh ${args.slice(0, 2).join(" ")} printed no JSON (${r.out.trim().split("\n")[0] || "no output"})` };
		}
	}

	/** Re-check and renew the claim without counting a call (before a create, before writing an issue number); throws TickStop when lost. */
	fence(): void {
		if (!this.sidecar.fence(this.o.holder, this.o.now())) throw new TickStop("lost", "another process holds the issues claim");
	}
}
