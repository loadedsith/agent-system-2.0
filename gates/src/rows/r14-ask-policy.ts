// P-11 row 14 (DESIGN-2.0.md:351; SPEC-2.0.md § B3 :392-395, § B16) and the mode row
// (DESIGN-2.0.md:353; SPEC-2.0.md § B13.1 :630-640): `ask` is unavailable to a hand and to an
// autonomous lane; the mode field, read at lane start and before every turn, sets it. A flip is
// effective before the lane's next turn; the surface may show the new mode only once the tool
// policy matches (a mode-effective entry, written after the active tool set is read back); pending
// questions survive the flip (the flip touches the workload row only, ledger/src/index.ts:441).
import type { Mode } from "../../../ledger/src/index";
import { type LaneEntries, LaneEntriesUnavailable } from "../ledger-port";
import type { Refusal, Role } from "../types";

export const ASK_TOOL = "ask";

/** Whether `ask` is available to this session. Unknown mode on a lane = no `ask` (fail closed). */
export function askAllowed(role: Role, mode: Mode | null | undefined): boolean {
	if (role === "hand") return false;
	if (role === "lane") return mode === "user-driven";
	return true; // the orchestrator is the surface Jo talks to
}

/** Row 14 at the tool call: the backstop when the active tool set was not (or could not be) changed. */
export function checkAsk(toolName: string, role: Role, mode: Mode | null | undefined): Refusal {
	if (toolName !== ASK_TOOL || askAllowed(role, mode)) return null;
	const who = role === "hand" ? "a hand" : `a lane in ${mode ?? "unknown"} mode`;
	return {
		block: true,
		reason:
			`P-11 row 14 refused this: \`ask\` is unavailable to ${who}. A lane opens no blocking human prompt. ` +
			`A § A4 reserved action goes through the reserved gate; a material non-reserved choice goes into a \`question\` ledger row ` +
			`(raiseQuestion: the options and what each changes), which pauses only that slice; a choice with one clearly safer, reversible ` +
			`option is taken and named as an assumption. A hand reports the choice to its lane and stops.`,
	};
}

/** The slice of OMP's extension API the mode controller drives (types.ts:1454-1461). */
export interface ToolSwitch {
	getActiveTools(): string[];
	getAllTools(): { name: string }[];
	setActiveTools(names: string[]): Promise<void>;
}

export interface ModeState {
	mode: Mode | null;
	askActive: boolean;
	/** Tool policy read back and matching the mode: the surface may now show this mode. */
	effective: boolean;
	/** Why the mode-effective entry was not written, when it was not. */
	note?: string;
}

/**
 * Applies the workload's current mode to the session's tool set before a lane turn, reads the set
 * back, and records mode-effective once per change of mode. Returns what is actually in force.
 */
export class ModeController {
	#lastEffective: Mode | null = null;

	constructor(
		private readonly role: Role,
		private readonly tools: ToolSwitch,
		private readonly readMode: () => Mode | null,
		private readonly record?: { workloadId: string; laneId: string; entries: () => LaneEntries },
	) {}

	async beforeTurn(): Promise<ModeState> {
		const mode = this.role === "lane" ? this.readMode() : null;
		const want = askAllowed(this.role, mode);
		const registered = this.tools.getAllTools().some((t) => t.name === ASK_TOOL);
		const active = this.tools.getActiveTools();
		if (active.includes(ASK_TOOL) !== want && (registered || !want)) {
			await this.tools.setActiveTools(want ? [...active, ASK_TOOL] : active.filter((n) => n !== ASK_TOOL));
		}
		const askActive = this.tools.getActiveTools().includes(ASK_TOOL);
		// No UI = OMP never registers `ask` (omp://tools/ask.md): "wanted but unregistered" is not a match.
		const effective = askActive === want;
		const state: ModeState = { mode, askActive, effective };
		if (effective && mode && mode !== this.#lastEffective && this.record) {
			try {
				this.record.entries().recordEntry({
					by: this.record.laneId,
					workloadId: this.record.workloadId,
					kind: "mode-effective",
					body: `${mode}: ask ${askActive ? "available" : "unavailable"}`,
				});
				this.#lastEffective = mode;
			} catch (err) {
				state.note = err instanceof LaneEntriesUnavailable ? err.message : String(err);
			}
		}
		return state;
	}
}
