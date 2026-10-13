// THROWAWAY (PLAN wl-mv615mkeaf1yio rev 8 § 1, fails-before): T8a-p of lane-model-script.test.ts in its old order,
// forced. Lane 2's fake omp holds its stdout open until the gate exists, so its runner can neither write lane-exit:
// nor spawn its drain (MIGRATION.md item 71) until the test opens it. Jo's request is written before the gate, so
// lane 2's drain always reads it and launches lane 3 itself, which hangs and keeps the workload. The by-hand
// launch after it is then refused `held` (exit 7) where the old test expected 0: this file fails on purpose and is
// deleted before the final head. It spawns processes, so it runs outside the fence.
import { afterAll, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { recordRepo } from "../src/decision-log";
import { doneBody, laneExit, laneModelBody, laneStarted } from "../src/launch";
import { SURFACE_BY } from "../src/types";
import {
	alive, drainLinesOf, drainSettled, type FakeScript, fakeRecords, LANE_SCRIPT, laneIdOf, laneRoot, type LaneRoot, laneSnapshot, setScript, settleDrains, sh, until,
} from "./helpers";

const X = "openai-codex/gpt-6-sol";

const roots: { r: LaneRoot; wl: string | null }[] = [];
// Lane 3 hangs by design: it is stopped first, then every drain and lane is settled, then the root goes.
afterAll(async () => {
	const settled = await Promise.allSettled(roots.map(async ({ r, wl }) => {
		if (wl !== null) lane(r, ["stop", wl]);
		await settleDrains(r);
	}));
	for (const { r } of roots) rmSync(r.root, { recursive: true, force: true });
	for (const s of settled) if (s.status === "rejected") throw s.reason;
}, 180_000);

const lane = (r: LaneRoot, args: string[]) => sh(["bun", LANE_SCRIPT, ...args], r.repo, r.env);
/** An autonomous workload with its done: line and one open slice, no model named. */
function openWorkload(r: LaneRoot): string {
	const l = Ledger.open(r.ledgerPath, { backup: false, backupOnOpen: false });
	try {
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "lane model drain race probe", stakes: "normal", mode: "autonomous" });
		recordRepo(l, wl, r.repo);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the probe is done") });
		l.addSlice({ by: SURFACE_BY, workloadId: wl, task: "probe", doneCondition: "probed", inputs: "README.md" });
		return wl;
	} finally {
		l.close();
	}
}
/** Jo's `launch-requested:`, with Jo's `lane-model:` first, written as the surface writes them. */
const request = (r: LaneRoot, wl: string, model: string) => {
	const l = Ledger.open(r.ledgerPath, { backup: false, backupOnOpen: false });
	try {
		const now = l.now();
		for (const body of [laneModelBody(model, now), `launch-requested: by jo at ${now}`]) l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body });
	} finally {
		l.close();
	}
};
const launch = (r: LaneRoot, wl: string, script: FakeScript, by: string) => {
	setScript(r, script);
	return lane(r, ["launch", wl, "--requested-by", by]).code;
};

test("probe: T8a-p in the old order: the by-hand launch after lane 2's exit is refused held while lane 2's drain runs lane 3", async () => {
	const r = laneRoot();
	const entry: { r: LaneRoot; wl: string | null } = { r, wl: null };
	roots.push(entry);
	const wl = openWorkload(r);
	entry.wl = wl;
	const [lane1, lane2, lane3] = [1, 2, 3].map((n) => laneIdOf(wl, n)) as [string, string, string];

	// Lane 1 dies on the default model. Its drain is awaited, so only lane 2's drain is in play below.
	expect(launch(r, wl, { steps: [{ exit: 3 }] }, "test")).toBe(0);
	await until(`lane-exit: of ${lane1}`, () => laneExit(laneSnapshot(r, wl).control, lane1));
	await drainSettled(r, lane1);

	// 1. Lane 2 runs on X and dies; its fake holds stdout until the gate, so lane-exit: and the drain spawn wait for it.
	const gate = join(r.root, "lane2-exit-gate");
	request(r, wl, X);
	expect(launch(r, wl, { steps: [{ exit: 3 }], holdStdoutUntil: gate }, "jo")).toBe(0);
	const omp2 = await until("lane 2's fake omp spawn", () => fakeRecords(r).filter((x) => x.argv !== undefined)[1]);
	await until("lane 2's fake omp gone", () => !alive(omp2.pid));
	expect(laneExit(laneSnapshot(r, wl).control, lane2)).toBeNull();

	// 2. The next spawn hangs (the fake reads its script at spawn; lane 2's already has).
	setScript(r, { steps: [{ hang: true }] });

	// 3. Jo's request for the default model, then the gate: lane 2's drain reads after the request.
	request(r, wl, "default");
	writeFileSync(gate, "");
	expect(await until(`lane-exit: of ${lane2}`, () => laneExit(laneSnapshot(r, wl).control, lane2))).toMatchObject({ outcome: "died" });

	// 4. Lane 2's drain launched lane 3 itself and ended; lane 3 holds the workload and its omp is alive.
	const drain = await drainSettled(r, lane2);
	expect(drainLinesOf(r, drain).some((l) => l.startsWith(`attempt ${drain} ${wl} exit 0:`))).toBe(true);
	const launched = laneSnapshot(r, wl).control.find((c) => c.prefix === "launch" && c.laneId === lane3);
	expect(launched?.rest).toMatch(/ requested-by lane-runner$/);
	await until("lane-started: of lane 3", () => laneStarted(laneSnapshot(r, wl).control, lane3));
	expect(laneSnapshot(r, wl).workload!.holder).toBe(lane3);
	const omp3 = await until("lane 3's fake omp spawn", () => fakeRecords(r).filter((x) => x.argv !== undefined)[2]);
	expect(alive(omp3.pid)).toBe(true);

	// 5. The old test's by-hand launch and its old expectation: 0. It is refused held (7) while lane 3 holds the workload.
	expect(lane(r, ["launch", wl, "--requested-by", "jo"]).code).toBe(0);
}, 120_000);
