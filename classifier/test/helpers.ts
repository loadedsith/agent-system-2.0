import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { KindJudge } from "../src/classify";

export interface SampleRow {
	id: string;
	hand_label: string;
	text: string;
	response: { choice: string; confidence: number; probabilities: Record<string, number> };
	judge_model: string;
}

export const FIXTURE_PATH = join(import.meta.dir, "fixtures", "classifier-sample-30.jsonl");

export function loadSample(): { questionSha256: string; rows: SampleRow[] } {
	const [meta, ...rows] = readFileSync(FIXTURE_PATH, "utf8").trim().split("\n").map(line => JSON.parse(line));
	return { questionSha256: meta.meta.question_sha256, rows };
}

/**
 * A judge that answers only from recorded TypeSafe responses, keyed by the exact brief text. An
 * unrecorded brief throws: the default test run can never reach a live judge.
 */
export function recordedJudge(rows: { text: string; response: SampleRow["response"]; judge_model?: string }[]): KindJudge & {
	calls: string[];
} {
	const byText = new Map(rows.map(row => [row.text, row]));
	const calls: string[] = [];
	return {
		calls,
		async judge({ state }) {
			calls.push(state);
			const row = byText.get(state);
			if (!row) throw new Error(`no recorded classifier response for brief: ${state.slice(0, 60)}`);
			const [provider, ...model] = (row.judge_model ?? "typesafe/jev-1.13.0").split("/");
			return { answers: { kind: row.response }, provider: provider!, model: model.join("/") };
		},
	};
}
