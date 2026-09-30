// The lane launch trigger and Jo's word to (re)launch (DESIGN-lane-launcher.md decisions 1, 7, 9;
// § 4 rows "Open-time trigger and tick catch-up" and "`orchestrator_launch_lane` tool").
//
// `triggerLaunch` is the one path every launcher takes: the surface runs the pure predicate over
// the rows the ledger reads now and, when it says launch, execs the lane starter
// (`bun surface/scripts/lane.ts launch <wl>`) through the extension API's `exec` — machinery, never
// the bash tool, so P-11 row 15 never sees it. The starter reserves inside its own transaction (the
// run that binds), so a flip or a second starter between the two runs is refused there, and this
// side writes nothing: a failure after the reservation wrote `launch-failed:` and the `lane-died:`
// message in the starter; a refusal wrote nothing. The result is one line for the tool result or
// the log. The open tool, the answer and withdrawal paths, the mode flip and the wake tick all call
// it; the tool below adds Jo's `launch-requested:` cause first.
import type { Ledger } from "../../ledger/src/index";
import {
	byHandLine, JO_HOLDER, LANE_SCRIPT, laneCap, type LaunchVerdict, launchRequestedBody, verdictOf,
} from "../src/launch";
import { surfaceSession } from "../src/session";
import { DUE_PREFIX, LAUNCH_LANE_TOOL, STANDING_WORKLOAD_ID, type SurfaceAPI, SURFACE_BY, type ToolResult } from "../src/types";

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });
const inactive = text("This session is not the orchestrator surface; nothing was written.");

export interface LaunchOutcome {
	/** The predicate said launch and the starter was run. */
	attempted: boolean;
	/** The starter's exit code (0 = a lane is running), or null when the starter was not run. */
	code: number | null;
	/** The one line for the tool result or the log; null when there is nothing to say (a `due:` row, the standing workload). */
	line: string | null;
}

/**
 * Run the predicate for one workload and exec the starter when it says launch. `who` is the
 * `requested-by` the starter records. Never throws: an exec failure is a line.
 */
export async function triggerLaunch(pi: SurfaceAPI, ledger: Ledger, env: Record<string, string | undefined>, workloadId: string, who: string): Promise<LaunchOutcome> {
	const rows = ledger.launchRows(workloadId, laneCap(env));
	if (!rows) return { attempted: false, code: null, line: `no workload ${workloadId}` };
	const verdict = verdictOf(rows);
	if (!verdict.launch) {
		switch (verdict.reason) {
			case "standing":
			case "due":
				return { attempted: false, code: null, line: null };
			case "user-driven":
				return { attempted: false, code: null, line: `${workloadId} is user-driven: no lane launches by itself; run it by hand with \`${byHandLine(workloadId)}\`` };
			case "held":
				return { attempted: false, code: null, line: `${workloadId} is held by ${rows.workload.holder} (lease until ${rows.workload.holder_lease_until ?? "none"}); nothing launched` };
			case "cap": {
				const live = ledger.liveLaneHolders(rows.now).map((l) => `${l.holder} on ${l.workloadId}`);
				return { attempted: false, code: null, line: `${workloadId} queued behind ${live.join(", ")} (cap ${rows.cap}); the tick launches it when a slot frees` };
			}
			case "awaiting-close":
				return { attempted: false, code: null, line: `${workloadId} is finished and awaiting close: its holder wrote done-because:; nothing launched` };
			case "died-not-relaunched":
				return { attempted: false, code: null, line: `${workloadId} has had a lane and no new cause: relaunch on your word with ${LAUNCH_LANE_TOOL}` };
			case "closed":
				return { attempted: false, code: null, line: `${workloadId} is closed; nothing launched` };
		}
	}
	if (!pi.exec) return { attempted: false, code: null, line: `${workloadId}: the host has no exec for extensions, so the starter could not run; launch by hand with \`bun ${LANE_SCRIPT} launch ${workloadId}\`` };
	try {
		const r = await pi.exec("bun", [LANE_SCRIPT, "launch", workloadId, "--requested-by", who], { timeout: 30_000 });
		const out = (r.stdout.trim() || r.stderr.trim()).split("\n").filter(Boolean);
		const last = out[out.length - 1] ?? (r.killed ? "the starter was killed before it printed" : `the starter exited ${r.code} without a line`);
		return { attempted: true, code: r.code, line: r.code === 0 ? `${workloadId}: ${last}` : `${workloadId}: launch failed (starter exit ${r.code}): ${last}` };
	} catch (err) {
		return { attempted: true, code: null, line: `${workloadId}: the starter could not be run: ${String(err)}` };
	}
}

/**
 * The verdict alone, for the tick: whether a launch would be attempted now, or the workload is
 * awaiting close (the tick closes it). The tick execs only on a launch verdict, so a refused
 * workload costs one read per poll and no process. Null when there is no such workload.
 */
export function launchVerdict(ledger: Ledger, env: Record<string, string | undefined>, workloadId: string): LaunchVerdict | null {
	const rows = ledger.launchRows(workloadId, laneCap(env));
	return rows && verdictOf(rows);
}

export default function launchRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	const z = pi.zod;
	pi.registerTool({
		name: LAUNCH_LANE_TOOL,
		loadMode: "essential",
		label: "Launch Lane",
		description:
			"Jo's word to (re)launch an autonomous lane on an open workload: after a lane died, after a plain stop, or to take a workload Jo holds back from them. " +
			"Records `launch-requested:` on the workload, then runs the launcher and returns its one line (the lane id, a refusal, or the typed failure). " +
			"A user-driven workload is not launched: the by-hand command is returned instead.",
		parameters: z.object({
			workloadId: z.string().describe("The open workload (wl-…)."),
			reason: z.string().optional().describe("Why, in a few words (e.g. 'relaunch after death'); recorded in the request."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const s = surfaceSession(ctx, env);
			if (!s.active) return inactive;
			const id = String(params.workloadId ?? "").trim();
			const reason = typeof params.reason === "string" && params.reason.trim() ? params.reason.trim() : null;
			if (id === STANDING_WORKLOAD_ID) return text("The standing orchestrator workload never has a lane; nothing was written.");
			const ledger = s.ledger();
			const w = ledger.workload(id);
			if (!w) return text(`No workload ${id}; nothing was written.`);
			if (w.status === "closed") return text(`${id} is closed (${w.closed_at}); nothing was written.`);
			if (w.brief.startsWith(DUE_PREFIX)) return text(`${id} is a scheduled row: it never has a lane; nothing was written.`);
			if (w.mode === "user-driven") return text(`${id} is user-driven: no lane launches by itself. Run it by hand with \`${byHandLine(id)}\`, or flip it with the word autonomous. Nothing was written.`);
			const now = s.now();
			if (w.holder !== null && w.holder !== JO_HOLDER && (w.holder_lease_until === null || w.holder_lease_until >= now)) {
				return text(`${id} is held by ${w.holder} under a live lease (until ${w.holder_lease_until ?? "none"}); stop it first: \`as2 lane stop ${id}\`. Nothing was written.`);
			}
			// § B5 "X back to you": Jo's hold after a handoff is released with the request, in one transaction.
			const requestId = ledger.write(() => {
				if (w.holder === JO_HOLDER) {
					const r = ledger.releaseWorkload(id, { by: SURFACE_BY, holder: JO_HOLDER });
					if (!r.released) throw new Error(`Jo's hold on ${id} could not be released: held by ${r.holder ?? "nobody"}`);
				}
				return ledger.recordEntry({ by: SURFACE_BY, workloadId: id, kind: "assumption", body: launchRequestedBody("jo", now, reason ?? undefined) });
			});
			const outcome = await triggerLaunch(pi, ledger, env, id, "jo");
			pi.appendEntry("surface-launch", { id, requestId, code: outcome.code });
			return text(`Recorded launch request ${requestId} on ${id}.${outcome.line ? ` ${outcome.line}` : ""}`, { id, requestId, code: outcome.code, attempted: outcome.attempted });
		},
	});
}
