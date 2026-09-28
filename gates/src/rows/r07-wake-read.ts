// P-11 row 7 (DESIGN-2.0.md:344; SPEC-2.0.md:491-504 § B7 via C5.6): after any P-17 trigger
// (compaction, restart, first lane on a workload with history) the lane's first turn writes one
// ledger entry stating what it resumes; a second turn is refused until that entry exists. A turn is
// one agent run (OMP `agent_end` without `willContinue`). The refusal lands on the second turn's
// tool calls, except the call that writes the entry through the ledger module.
import { type LaneEntries, LaneEntriesUnavailable } from "../ledger-port";
import type { Refusal, ToolCall } from "../types";

export type WakeTrigger = "compaction" | "restart" | "first-lane-with-history";

/** A call that can write the wake-read entry: a ledger module script, or eval code calling recordEntry. */
function writesEntry(call: ToolCall): boolean {
	if (call.toolName === "bash") return /(^|[\s/])ledger\/scripts\/[\w-]+\.ts\b/.test(String(call.input.command ?? ""));
	if (call.toolName === "eval") return /\brecordEntry\s*\(/.test(String(call.input.code ?? ""));
	return false;
}

export class WakeRead {
	#pending: { trigger: WakeTrigger; since: string; turnsEnded: number } | null = null;

	constructor(
		private readonly workloadId: string,
		private readonly entries: () => LaneEntries,
		private readonly now: () => string = () => new Date().toISOString(),
	) {}

	/** A P-17 trigger fired: the next turn owes a wake-read entry. */
	trigger(trigger: WakeTrigger): void {
		this.#pending = { trigger, since: this.now(), turnsEnded: 0 };
	}

	get pending(): WakeTrigger | null {
		return this.#pending?.trigger ?? null;
	}

	/** A turn (agent run) ended. */
	turnEnded(): void {
		if (this.#pending) this.#pending.turnsEnded++;
	}

	/** Row 7 over one tool call. The first turn after a trigger is free; later turns need the entry. */
	check(call: ToolCall): Refusal {
		const p = this.#pending;
		if (!p || p.turnsEnded === 0) return null;
		let found: boolean;
		try {
			found = this.entries().entries(this.workloadId, "wake-read").some((e) => e.created_at >= p.since);
		} catch (err) {
			if (writesEntry(call)) return null;
			const why = err instanceof LaneEntriesUnavailable ? err.message : `the ledger could not be read (${String(err)})`;
			return { block: true, reason: `P-11 row 7 refused this: after ${p.trigger}, the wake verified read is owed and ${why}` };
		}
		if (found) {
			this.#pending = null;
			return null;
		}
		if (writesEntry(call)) return null;
		return {
			block: true,
			reason:
				`P-11 row 7 refused this: after ${p.trigger}, the lane's first turn owes one ledger entry (kind wake-read) stating what it resumes, ` +
				`and none exists for ${this.workloadId} since ${p.since}. Write it through the ledger module first ` +
				`(recordEntry({ kind: "wake-read", workloadId: "${this.workloadId}", body: "<what I resume, from the ledger>" })), then continue (SPEC-2.0.md § B7).`,
		};
	}
}
