// State the surface rows share within one OMP session, keyed on the session's SessionManager the
// way gates/src/session.ts does (separately loaded extension modules still share one store through
// globalThis). Only a top-level session whose role env is `orchestrator` is a surface; a lane or a
// hand loading this extension gets an inert session.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { defaultLedgerPath } from "../../ledger/src/locality";
import { Delivered } from "./delivery";
import { type Ctx, POLL_MS, POLL_MS_ENV, ROLE_ENV, SURFACE_TOOLS, VOICE_ENV, WAKE_READ_TOOL } from "./types";

export const REPO_ROOT = join(import.meta.dir, "..", "..");
export const VOICE_RELATIVE = join("voice", "VOICE.md");

export type WakeTrigger = "session-start" | "restart" | "compaction";

export class SurfaceSession {
	/** This session is the orchestrator surface. */
	readonly active: boolean;
	/** A wake render is owed on the next `before_agent_start`. */
	pending: WakeTrigger | null = null;
	/** After a wake render the first turn owes one wake-read entry; tool calls other than it are refused. */
	owed: { trigger: WakeTrigger; since: string } | null = null;
	/** Receipts from Jo's one-word inputs, injected into the next turn's context. */
	readonly notices: string[] = [];
	/** The voice document was injected into the system prompt at least once (probes read this). */
	voiceInjected = false;
	/** Which § B3 lines this session has delivered, in which state (surface/src/delivery.ts). */
	readonly delivered = new Delivered();
	/** The between-wakes poll is running (one per session). */
	polling = false;
	/** The clock the surface reads the ledger at; tests move it. */
	now: () => string = () => new Date().toISOString();
	#ledger: Ledger | null = null;

	constructor(
		ctx: Ctx,
		readonly env: Record<string, string | undefined>,
	) {
		const top = !(!ctx.hasUI && ctx.sessionManager.getHeader()?.parentSession);
		this.active = top && env[ROLE_ENV] === "orchestrator";
	}

	ledger(): Ledger {
		this.#ledger ??= Ledger.open(defaultLedgerPath(this.env));
		return this.#ledger;
	}

	/** How often the poll re-reads the ledger between wakes. */
	get pollMs(): number {
		const n = Number(this.env[POLL_MS_ENV]);
		return Number.isFinite(n) && n > 0 ? n : POLL_MS;
	}

	/** The voice document text, or null with the path tried when it is missing. */
	voice(): { path: string; text: string | null } {
		const path = this.env[VOICE_ENV] || join(REPO_ROOT, VOICE_RELATIVE);
		return { path, text: existsSync(path) ? readFileSync(path, "utf8") : null };
	}

	/** A tool call's verdict while a wake read is owed: only the wake-read tool may run. */
	check(toolName: string): { block: true; reason: string } | null {
		if (!this.owed || toolName === WAKE_READ_TOOL) return null;
		return {
			block: true,
			reason: `wake (${this.owed.trigger}): this turn owes one wake-read ledger entry saying what you resume, before any other tool call; record it with ${WAKE_READ_TOOL}. Surface tools: ${SURFACE_TOOLS.join(", ")}.`,
		};
	}
}

const STORE = Symbol.for("agent-system-2.0/surface/sessions");
type Store = WeakMap<object, SurfaceSession>;

/** This session's surface state, created on first use. */
export function surfaceSession(ctx: Ctx, env: Record<string, string | undefined>): SurfaceSession {
	const g = globalThis as unknown as Record<symbol, Store | undefined>;
	const store = (g[STORE] ??= new WeakMap());
	let s = store.get(ctx.sessionManager);
	if (!s) {
		s = new SurfaceSession(ctx, env);
		store.set(ctx.sessionManager, s);
	}
	return s;
}
