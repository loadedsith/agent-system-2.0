// The quota guard at the real RPC runner spawn (PLAN wl-mv71x5rwdu7eo0 § 4; Jo's in-mv8p5m2t005tts and in-mv8qzqym1ihmv4):
// the real runner against the fake omp, with a fresh polls fixture in AS2_HEADROOM_POLLS (classifier/src/headroom.ts reads it).
// Jo's named model projected out spawns no omp and fails the launch at `headroom` as the runner; an unnamed lane whose first
// get_state model is out is moved by `set_model` to the strong row's first entry not out (the profile's row, copied into the
// root's installed profile), confirmed by get_state before its first prompt, and recorded as `lane-headroom:`; a lane whose
// lab is not out runs as before. These spawn processes, so they run in the full suite outside the fence.
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadTierTable } from "../../classifier/src/tier-table";
import { LANE_RUNNER_BY, Ledger } from "../../ledger/src/index";
import { recordRepo } from "../src/decision-log";
import { doneBody, laneExit, laneModelBody, laneStarted } from "../src/launch";
import { SURFACE_BY } from "../src/types";
import { type FakeScript, type FakeStep, fakeRecords, LANE_SCRIPT, laneIdOf, laneRoot, type LaneRoot, laneSnapshot, setScript, sh, until } from "./helpers";

const A = "anthropic/claude-opus-5-5";
const SOL = "openai-codex/gpt-6.1-sol";
const REASON = "anthropic 5h 0.85 used > 0.80";
const DONE: FakeStep[] = [{ tool: "lane_record_entry", args: { body: "done-because: the probe is done" } }];
const PROFILE_CONFIG = join(import.meta.dir, "..", "..", "profile", "config.yml");

const roots: LaneRoot[] = [];
afterAll(() => {
	for (const r of roots) rmSync(r.root, { recursive: true, force: true });
});

/** One fresh poll line in watch.py's shape (`t` epoch seconds, `resetsAt` epoch ms): each provider's 5h use as given,
 * 6 min into the window (under PACE_MIN), so only the 80 % rule speaks. */
function writePolls(r: LaneRoot, used: Record<string, number>): void {
	const now = Date.now();
	const limits = Object.entries(used).map(([provider, usedFraction]) => ({ provider, windowId: "5h", tier: null, resetsAt: now + 4.9 * 3_600_000, usedFraction }));
	const rows = Object.fromEntries(Object.entries(used).map(([provider, u]) => [`${provider}/5h`, u]));
	const path = join(r.root, "polls.jsonl");
	writeFileSync(path, `${JSON.stringify({ t: Math.floor(now / 1000), rows, limits })}\n`);
	r.env.AS2_HEADROOM_POLLS = path;
}

/** The root's installed profile carries the repo profile's tier table (the runner reads the strong row from there). */
function installTierTable(r: LaneRoot): void {
	const config = Bun.YAML.parse(readFileSync(PROFILE_CONFIG, "utf8")) as { task?: { agentModelOverrides?: unknown } };
	writeFileSync(join(r.home, ".omp", "profiles", "agent-system-2", "agent", "config.yml"), JSON.stringify({ setupVersion: 2, task: { agentModelOverrides: config.task?.agentModelOverrides } }));
}

const makeRoot = (used: Record<string, number>): LaneRoot => {
	const r = laneRoot();
	roots.push(r);
	writePolls(r, used);
	installTierTable(r);
	return r;
};
const ledgerOf = (r: LaneRoot) => Ledger.open(r.ledgerPath, { backup: false, backupOnOpen: false });
/** An autonomous workload with its done: line and one open slice, and Jo's `lane-model:` when `model` is given. */
function openWorkload(r: LaneRoot, model: string | null): string {
	const l = ledgerOf(r);
	try {
		const wl = l.openWorkload({ by: SURFACE_BY, brief: "headroom probe", stakes: "normal", mode: "autonomous" });
		recordRepo(l, wl, r.repo);
		l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: doneBody("the probe is done") });
		if (model !== null) l.recordEntry({ by: SURFACE_BY, workloadId: wl, kind: "assumption", body: laneModelBody(model, l.now()) });
		l.addSlice({ by: SURFACE_BY, workloadId: wl, task: "probe", doneCondition: "probed", inputs: "README.md" });
		return wl;
	} finally {
		l.close();
	}
}
const launch = (r: LaneRoot, wl: string, script: FakeScript) => {
	setScript(r, script);
	expect(sh(["bun", LANE_SCRIPT, "launch", wl, "--requested-by", "test"], r.repo, r.env).code).toBe(0);
};
/** The lane's end: its lane-exit:, or a launch-failed: (a runner refusal before any omp writes no lane-exit:). */
const endOf = (r: LaneRoot, wl: string, laneId: string) =>
	until(`the end of ${laneId}`, () => laneSnapshot(r, wl).control.find((c) => (c.prefix === "lane-exit" || c.prefix === "launch-failed") && c.laneId === laneId));
const spawns = (r: LaneRoot) => fakeRecords(r).filter((x) => x.argv !== undefined);
/** The rpc commands the n-th fake omp received, in order; `set_model` as `set_model <provider>/<modelId>`. */
const commandsOf = (r: LaneRoot, n: number) => {
	const pid = spawns(r)[n - 1]!.pid;
	return fakeRecords(r).filter((x) => x.pid === pid && x.command !== undefined).map((x) => (x.command === "set_model" ? `set_model ${x.provider}/${x.modelId}` : x.command!));
};
const deathSenders = (r: LaneRoot, wl: string) => {
	const l = ledgerOf(r);
	try {
		return l.db.query<{ sender: string }, [string]>("SELECT sender FROM messages WHERE workload_id = ? AND body LIKE 'lane-died:%' ORDER BY created_at, rowid").all(wl).map((m) => m.sender);
	} finally {
		l.close();
	}
};

describe("PLAN wl-mv71x5rwdu7eo0 § 4: the quota guard at the runner's spawn", () => {
	test("a named anthropic model with anthropic 5h at 0.85: no omp spawned; one launch-failed: at headroom and one lane-died:, both by lane-runner; released", async () => {
		const r = makeRoot({ anthropic: 0.85 });
		const wl = openWorkload(r, A);
		launch(r, wl, { steps: DONE });
		const lane1 = laneIdOf(wl, 1);
		await endOf(r, wl, lane1);
		expect(spawns(r)).toEqual([]);
		const snap = laneSnapshot(r, wl);
		const failed = snap.control.filter((c) => c.prefix === "launch-failed");
		expect(failed.map((c) => [c.laneId, c.createdBy, c.rest])).toEqual([[lane1, LANE_RUNNER_BY, `headroom: named ${A}, ${REASON}`]]);
		expect(snap.deaths).toEqual([`lane-died: ${lane1}: launch failed at headroom: named ${A}, ${REASON}`]);
		expect(deathSenders(r, wl)).toEqual([LANE_RUNNER_BY]);
		expect(snap.control.filter((c) => c.prefix === "lane-started" || c.prefix === "lane-ready" || c.prefix === "lane-headroom")).toEqual([]);
		expect(snap.workload!.holder).toBeNull();
	}, 60_000);

	test("an unnamed lane whose omp starts on anthropic, anthropic 5h at 0.85: set_model to the strong row's next entry, confirmed by get_state, before the first prompt; lane-headroom: by lane-runner", async () => {
		const r = makeRoot({ anthropic: 0.85 });
		// The target is the profile's strong row's first entry on another lab (profile/config.yml).
		expect(loadTierTable(PROFILE_CONFIG).strong.find((s) => !s.startsWith("anthropic/"))).toBe(SOL);
		const wl = openWorkload(r, null);
		launch(r, wl, { steps: DONE, stateModel: { provider: "anthropic", id: "claude-opus-5-5" } });
		const lane1 = laneIdOf(wl, 1);
		expect(await endOf(r, wl, lane1)).toMatchObject({ prefix: "lane-exit" });
		expect(laneExit(laneSnapshot(r, wl).control, lane1)).toMatchObject({ outcome: "completed" });
		expect(spawns(r)[0]!.argv).not.toContain("--model");
		expect(commandsOf(r, 1).slice(0, 4)).toEqual(["get_state", `set_model ${SOL}`, "get_state", "prompt"]);
		const snap = laneSnapshot(r, wl);
		const moved = snap.control.filter((c) => c.prefix === "lane-headroom");
		expect(moved.map((c) => [c.laneId, c.createdBy, c.rest])).toEqual([[lane1, LANE_RUNNER_BY, `${A} -> ${SOL} (${REASON})`]]);
		const order = snap.control.filter((c) => c.laneId === lane1).map((c) => c.prefix);
		expect(order.indexOf("lane-headroom")).toBeLessThan(order.indexOf("lane-ready"));
		// Jo's word is untouched: no lane-model: was written; the start record names no model and OMP's confirmed one.
		expect(snap.control.some((c) => c.prefix === "lane-model")).toBe(false);
		expect(laneStarted(snap.control, lane1)).toMatchObject({ model: null, ranModel: SOL });
		expect(snap.deaths).toEqual([]);
	}, 60_000);

	test("an unnamed lane when every strong-row lab is out: never ready at headroom, no prompt, one launch-failed: and one lane-died:", async () => {
		const r = makeRoot({ anthropic: 0.85, "openai-codex": 0.9, moonshot: 0.95 });
		const wl = openWorkload(r, null);
		launch(r, wl, { steps: DONE, stateModel: { provider: "anthropic", id: "claude-opus-5-5" } });
		const lane1 = laneIdOf(wl, 1);
		await endOf(r, wl, lane1);
		const snap = laneSnapshot(r, wl);
		expect(laneExit(snap.control, lane1)).toMatchObject({ outcome: "never-ready" });
		expect(commandsOf(r, 1)).not.toContain("prompt");
		expect(commandsOf(r, 1).some((c) => c.startsWith("set_model"))).toBe(false);
		const failed = snap.control.filter((c) => c.prefix === "launch-failed");
		expect(failed.map((c) => [c.laneId, c.createdBy])).toEqual([[lane1, LANE_RUNNER_BY]]);
		expect(failed[0]!.rest).toStartWith(`headroom: ${A} is out (${REASON}); every strong-row entry is out: `);
		expect(snap.deaths.length).toBe(1);
		expect(snap.deaths[0]).toStartWith(`lane-died: ${lane1}: launch failed at headroom: ${A} is out`);
		expect(snap.workload!.holder).toBeNull();
	}, 60_000);

	test("an unnamed lane when the polls show room: no set_model, the first prompt follows the first get_state as before", async () => {
		const r = makeRoot({ anthropic: 0.1 });
		const wl = openWorkload(r, null);
		launch(r, wl, { steps: DONE, stateModel: { provider: "anthropic", id: "claude-opus-5-5" } });
		const lane1 = laneIdOf(wl, 1);
		await endOf(r, wl, lane1);
		expect(laneExit(laneSnapshot(r, wl).control, lane1)).toMatchObject({ outcome: "completed" });
		expect(commandsOf(r, 1).slice(0, 2)).toEqual(["get_state", "prompt"]);
		expect(commandsOf(r, 1).some((c) => c.startsWith("set_model"))).toBe(false);
		const snap = laneSnapshot(r, wl);
		expect(snap.control.some((c) => c.prefix === "lane-headroom")).toBe(false);
		expect(laneStarted(snap.control, lane1)).toMatchObject({ model: null, ranModel: A });
	}, 60_000);
});
