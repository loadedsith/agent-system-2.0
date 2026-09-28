/**
 * (a) Replay of the 30-brief classifier sample (research/classifier-sample.md) through classify()
 * and route(), answered from the recorded TypeSafe responses. Offline by construction. The replay
 * asks the question the sample was recorded with (fixtures/kind-question-2026-09-23.json); the
 * classifier's own question is gated on classifier/calibration.json, not on this file.
 */
import { describe, expect, test } from "bun:test";
import { classify, questionSha256 } from "../src/classify";
import { route } from "../src/route";
import { loadSample, recordedJudge, recordedQuestion } from "./helpers";

const sample = loadSample();
const { rows } = sample;
const question = recordedQuestion();

describe("classifier sample replay", () => {
	test("the fixture's recorded question is the one the sample's answers came from", () => {
		// An edit to the recorded question invalidates the recorded answers; re-record, don't patch.
		expect(questionSha256(question)).toBe(sample.questionSha256);
		expect(rows).toHaveLength(30);
	});

	test("reproduces the sample's kind assignments, agreement and 5-of-30 flag count", async () => {
		const judge = recordedJudge(rows);
		const results = [];
		for (const row of rows) {
			const classification = await classify(row.text, judge, question);
			results.push({ row, classification, routing: route(classification, null) });
		}

		// Every brief went to the judge once, and every kind came back as recorded.
		expect(judge.calls).toHaveLength(30);
		for (const { row, classification } of results) {
			expect(classification.choice).toBe(row.response.choice);
			expect(classification.judgeModel).toBe("typesafe/jev-1.13.0");
		}

		// research/classifier-sample.md § Agreement: 23/30; choices understand 19, change-small 4,
		// judge 4, locate 3, change-large 0.
		expect(results.filter(r => r.classification.choice === r.row.hand_label)).toHaveLength(23);
		const choices: Record<string, number> = {};
		for (const r of results) choices[r.classification.choice] = (choices[r.classification.choice] ?? 0) + 1;
		expect(choices).toEqual({ understand: 19, "change-small": 4, judge: 4, locate: 3 });

		// § Threshold: at 0.55, 5 of 30 flagged, 4 of them disagreements, 1 false flag (LedgerCandidates).
		const flagged = results.filter(r => r.routing.lowConfidence);
		expect(flagged.map(r => r.row.id).sort()).toEqual(
			["LedgerCandidates", "LedgerLifecycle", "LedgerThirdParty", "LensAbolishedSeat", "T1CtxPiRoot"].sort(),
		);
		expect(flagged.filter(r => r.classification.choice !== r.row.hand_label).map(r => r.row.id)).not.toContain(
			"LedgerCandidates",
		);
		expect(flagged.filter(r => r.classification.choice !== r.row.hand_label)).toHaveLength(4);
	});

	test("the two hand-labelled judge briefs read as understand are pulled up to deep, none pulled down", async () => {
		const judge = recordedJudge(rows);
		const pulled: Record<string, string> = {};
		for (const row of rows) {
			const routing = route(await classify(row.text, judge, question), null);
			expect(routing.pullDown).toBeNull();
			if (routing.pullUp) pulled[row.id] = `${routing.pullUp.from}->${routing.pullUp.to}`;
		}
		expect(pulled).toEqual({ LensAbolishedSeat: "standard->deep", LedgerThirdParty: "standard->deep" });
	});

	test("an unrecorded brief never reaches a live judge", async () => {
		await expect(classify("a brief nobody recorded", recordedJudge(rows), question)).rejects.toThrow(
			"no recorded classifier response",
		);
	});
});
