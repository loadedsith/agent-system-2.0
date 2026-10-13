// The orchestrator's recommendations (PLAN wl-mv66ylg1op3wg0 D3; surface/src/triage.ts). The tool
// `orchestrator_recommend` records the word Ilex recommends for one answerable needs-you row (`#n`
// from the session Numbering, or its q-…/en-… id) as a `recommend: <row-id> <word> — <reason>` entry
// by the surface on the row's workload; it refuses a row that is unknown or no longer waiting, a row
// whose options are not one word each, and a word that is not one of the row's options (approve /
// deny for a reserved request). triageItems reads the entry before pending.ts's recorded
// recommendation. At the orchestrator's `session_stop`, one advisory continuation (never a block)
// names the answerable rows still lacking Ilex's recommendation; a row it named is not named again
// until Jo's next typed input, so one stop yields at most one continuation and the continuation's own
// stop yields none unless a new row appeared. Inert on every session that is not the surface.
import type { ErrorLine } from "../src/errors";
import { type SurfaceSession, surfaceSession } from "../src/session";
import { recordRecommendation, unrecommended } from "../src/triage";
import { type Ctx, RECOMMEND_TOOL, type SurfaceAPI, type ToolResult } from "../src/types";

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });
const inactive = text("This session is not the orchestrator surface; nothing was written.");

/** OMP's advisory stop result (omp://extensions.md § session_stop): one more turn carrying the context, never a refusal. */
interface StopAdvice {
	continue: true;
	additionalContext: string;
}
/** `session_stop` as OMP takes it; the gates' slice types only the block result. */
type StopOn = { on(event: "session_stop", h: (event: unknown, ctx: Ctx) => StopAdvice | undefined): void };

/** Rows the nudge already named since Jo's last typed input, per surface session. */
const nudged = new WeakMap<SurfaceSession, Set<string>>();

export default function sendLineRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;
	pi.registerTool({
		name: RECOMMEND_TOOL,
		loadMode: "essential",
		label: "Recommend An Answer",
		description:
			"Record the one-word answer you recommend to Jo for one open needs-you item: a reserved request (approve / deny) or a question whose options are one word each. " +
			"Name it by its number (`#3`) or its id (`q-…`, `en-…`); `word` must be one of its options; `reason` is one line. " +
			"Only items with a recommendation can go in Jo's `send:` line; a reserved request and a plan approval are always Jo's to decide.",
		parameters: z.object({
			item: z.string().describe("The item: `#n` as numbered on the needs-you list, or its q-… / en-… id."),
			word: z.string().describe("The answer you recommend: one of the item's options (approve or deny for a reserved request)."),
			reason: z.string().describe("Why, in one line."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const r = recordRecommendation(s.ledger(), s.numbering, { item: String(params.item ?? ""), word: String(params.word ?? ""), reason: String(params.reason ?? "") }, { now: s.now() });
			if (!r.ok) return text(r.reason);
			return text(`Recorded: ${r.n !== null ? `#${r.n} ` : ""}${r.rowId} → ${r.word} (entry ${r.entryId} on ${r.workloadId}).`, r);
		},
	});

	pi.on("input", (_event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (s.active) nudged.delete(s);
		return undefined;
	});

	(pi as unknown as StopOn).on("session_stop", (_event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		let lacking: ErrorLine[];
		try {
			lacking = unrecommended(s.ledger(), s.numbering, { now: s.now() });
		} catch {
			// Advisory only: a ledger that cannot be read here never holds the stop (the wake and row 1 report it).
			return undefined;
		}
		const seen = nudged.get(s) ?? new Set<string>();
		if (!lacking.some((l) => !seen.has(l.rowId))) return undefined;
		for (const l of lacking) seen.add(l.rowId);
		nudged.set(s, seen);
		const names = lacking.map((l) => `${l.n !== undefined ? `#${l.n} ` : ""}${l.rowId}`).join(", ");
		return {
			continue: true,
			additionalContext: `Before you stop: these open items have no recommendation from you: ${names}. Record one per item with ${RECOMMEND_TOOL} (item, word, a one-line reason); an item with none is listed for Jo as needs Jo and is never in the send: line. Then stop; say nothing more to Jo about it.`,
		};
	});
}
