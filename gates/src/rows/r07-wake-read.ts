// P-11 row 7 (DESIGN-2.0.md:344; SPEC-2.0.md:491-504 § B7 via C5.6): after any P-17 trigger
// (compaction, restart, first lane on a workload with history) the lane's first turn writes one
// ledger entry stating what it resumes; a second turn is refused until that entry exists. A turn is
// one agent run (OMP `agent_end` without `willContinue`).
//
// The entry counts only when this lane wrote it (`created_by`) after this trigger (astra review B3:
// another lane's entry discharged the obligation). The one call exempt from the refusal is the
// typed recovery tool below, which writes the entry through the ledger module itself; no text in a
// bash or eval call exempts it. The obligation is enforced on tool calls and again at the turn's
// stop, so a second turn with no tool calls is refused too.
import type { EntryRow } from "../../../ledger/src/index";
import type { GateLedger, Refusal, ToolCall } from "../types";

export type WakeTrigger = "compaction" | "restart" | "first-lane-with-history";

/** The recovery tool's name: the only call allowed while the entry is owed. */
export const WAKE_READ_TOOL = "ledger_wake_read";

export class WakeRead {
	#pending: { trigger: WakeTrigger; since: string; turnsEnded: number } | null = null;

	constructor(
		private readonly workloadId: string,
		private readonly laneId: string,
		private readonly ledger: () => Pick<GateLedger, "entries" | "recordEntry">,
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

	/** Is this entry this lane's wake read for the pending trigger? */
	#discharges(e: EntryRow, since: string): boolean {
		return e.kind === "wake-read" && e.created_by === this.laneId && e.created_at >= since;
	}

	/** The refusal owed now (turn two or later with no entry), or null. Clears the obligation once the entry exists. */
	owed(): Refusal {
		const p = this.#pending;
		if (!p || p.turnsEnded === 0) return null;
		let found: boolean;
		try {
			found = this.ledger().entries(this.workloadId, "wake-read").some((e) => this.#discharges(e, p.since));
		} catch (err) {
			return { block: true, reason: `P-11 row 7 refused this: after ${p.trigger}, the wake verified read is owed and the ledger could not be read (${String(err)}).` };
		}
		if (found) {
			this.#pending = null;
			return null;
		}
		return {
			block: true,
			reason:
				`P-11 row 7 refused this: after ${p.trigger}, the lane's first turn owes one ledger entry (kind wake-read, by ${this.laneId}) stating what it resumes, ` +
				`and none exists for ${this.workloadId} since ${p.since}. Call the ${WAKE_READ_TOOL} tool with what you resume, read from the ledger, then continue (SPEC-2.0.md § B7).`,
		};
	}

	/** Row 7 over one tool call: everything but the recovery tool waits on the entry. */
	check(call: ToolCall): Refusal {
		return call.toolName === WAKE_READ_TOOL ? null : this.owed();
	}

	/** The recovery tool's body: write this lane's wake-read entry through the ledger module. An empty or blank slice is no slice. */
	record(body: string, sliceId?: string | null): string {
		if (!body.trim()) throw new Error("a wake-read entry states what the lane resumes; the body was empty");
		const slice = typeof sliceId === "string" && sliceId.trim() ? sliceId.trim() : null;
		const id = this.ledger().recordEntry({ by: this.laneId, workloadId: this.workloadId, sliceId: slice, kind: "wake-read", body });
		this.#pending = null;
		return id;
	}
}
