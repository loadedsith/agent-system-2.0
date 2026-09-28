import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../ledger/src/index";
import { type KindQuestion, loadKindQuestion } from "../src/classify";

export interface SampleRow {
	id: string;
	hand_label: string;
	text: string;
	response: { choice: string; confidence: number; probabilities: Record<string, number> };
	judge_model: string;
}

export const FIXTURE_PATH = join(import.meta.dir, "fixtures", "classifier-sample-30.jsonl");

/**
 * The question the 2026-09-23 sample was recorded with (research/classifier-sample.md), kept
 * byte-for-byte so the replay replays what was measured. The classifier asks
 * classifier/kind-question.json, which may differ until a new sample is recorded (calibration.json).
 */
export const RECORDED_QUESTION_PATH = join(import.meta.dir, "fixtures", "kind-question-2026-09-23.json");
export const recordedQuestion = (): KindQuestion => loadKindQuestion(RECORDED_QUESTION_PATH);

export function loadSample(): { questionSha256: string; rows: SampleRow[] } {
	const [meta, ...rows] = readFileSync(FIXTURE_PATH, "utf8").trim().split("\n").map(line => JSON.parse(line));
	return { questionSha256: meta.meta.question_sha256, rows };
}

type JudgeReply = { choice: string; confidence: number; probabilities?: Record<string, number> };

/**
 * A judge that answers only from recorded TypeSafe responses, keyed by the exact brief text. An
 * unrecorded brief throws: the default test run can never reach a live judge.
 */
export function recordedJudge(rows: { text: string; response: JudgeReply; judge_model?: string }[]) {
	const byText = new Map(rows.map(row => [row.text, row]));
	const calls: string[] = [];
	return {
		calls,
		async judge({ state }: { state: string }) {
			calls.push(state);
			const row = byText.get(state);
			if (!row) throw new Error(`no recorded classifier response for brief: ${state.slice(0, 60)}`);
			const [provider, ...model] = (row.judge_model ?? "typesafe/jev-1.13.0").split("/");
			return { answers: { kind: row.response }, provider: provider!, model: model.join("/") };
		},
	};
}

/** A full five-kind distribution: `mass` on the named kinds, the remainder spread evenly on the rest. */
export function dist(mass: Record<string, number>): Record<string, number> {
	const kinds = ["locate", "understand", "change-small", "change-large", "judge"];
	const rest = kinds.filter(k => !(k in mass));
	const left = 1 - Object.values(mass).reduce((a, b) => a + b, 0);
	return Object.fromEntries(kinds.map(k => [k, k in mass ? mass[k]! : left / rest.length]));
}

/** A model registry shaped like OMP's: `getAvailable()` lists models, `getApiKey()` resolves credentials. */
export interface FakeRegistry {
	getAvailable(): { provider: string; id: string; name: string }[];
	getApiKey(model: { provider: string; id: string }): Promise<string | undefined>;
}

export function fakeRegistry(available: string[], credentialed: string[] = available): FakeRegistry {
	const models = available.map(selector => {
		const [provider, ...id] = selector.split("/");
		return { provider: provider!, id: id.join("/"), name: selector };
	});
	return {
		getAvailable: () => models,
		getApiKey: async (m: { provider: string; id: string }) =>
			credentialed.includes(`${m.provider}/${m.id}`) ? "test-only" : undefined,
	};
}

/** A real schema-v3 ledger in a scratch directory with one open workload and the named slices. */
export function scratchLedger(slices: string[] = ["sl-one", "sl-two"], workloadId = "wl-abc123") {
	const dir = mkdtempSync(join(process.env.LEDGER_TEST_TMP ?? tmpdir(), "classifier-ledger-"));
	const ledger = Ledger.open(join(dir, "ledger.db"), { create: true, backup: false });
	ledger.openWorkload({ id: workloadId, brief: "classifier test", stakes: "normal", mode: "autonomous", by: "orch-test" });
	for (const id of slices) ledger.addSlice({ id, workloadId, task: id, doneCondition: "d", inputs: "i", by: "lane-test" });
	return { ledger, workloadId };
}
