/**
 * (a) Replay of the classifier sample (research/classifier-sample.md § Re-measurement 2026-09-28)
 * through classify() and route(), answered from the recorded TypeSafe responses. Offline by
 * construction. The replay asks the question the sample was recorded with
 * (fixtures/kind-question-2026-09-28.json); the classifier's own question is gated on
 * classifier/calibration.json, not on this file.
 */
import { describe, expect, test } from "bun:test";
import { classify, loadKindQuestion, questionSha256 } from "../src/classify";
import { KIND_TIER, isKind, route, tierRank } from "../src/route";
import {
	FIXTURE_PATH_2026_09_23,
	loadSample,
	RECORDED_QUESTION_PATH_2026_09_23,
	recordedJudge,
	recordedQuestion,
} from "./helpers";

const sample = loadSample();
const { rows } = sample;
const question = recordedQuestion();

describe("classifier sample replay", () => {
	test("the fixture's recorded question is the one the sample's answers came from", () => {
		// An edit to the recorded question invalidates the recorded answers; re-record, don't patch.
		expect(questionSha256(question)).toBe(sample.questionSha256);
		expect(rows).toHaveLength(32);
		expect(rows.filter(row => row.addition).map(row => row.id)).toEqual(["AddTwoFileMechanical", "AddOneFileUncheckable"]);
	});

	test("the superseded 2026-09-23 recording still belongs to its own question", () => {
		const old = loadSample(FIXTURE_PATH_2026_09_23);
		expect(questionSha256(loadKindQuestion(RECORDED_QUESTION_PATH_2026_09_23))).toBe(old.questionSha256);
		expect(old.questionSha256).not.toBe(sample.questionSha256);
	});

	test("reproduces the sample's kind assignments, agreement and 7-of-32 flag count", async () => {
		const judge = recordedJudge(rows);
		const results = [];
		for (const row of rows) {
			const classification = await classify(row.text, judge, question);
			results.push({ row, classification, routing: route(classification, null) });
		}

		// Every brief went to the judge once, and every kind came back as recorded.
		expect(judge.calls).toHaveLength(32);
		for (const { row, classification } of results) {
			expect(classification.choice).toBe(row.response.choice);
			expect(classification.judgeModel).toBe("typesafe/jev-1.13.0");
		}

		// § Re-measurement 2026-09-28 § Agreement: 21/30 on the original thirty, 2/2 on the additions;
		// choices understand 17, change-large 5, judge 5, locate 3, change-small 2.
		const agrees = (r: (typeof results)[number]) => r.classification.choice === r.row.hand_label;
		expect(results.filter(r => !r.row.addition && agrees(r))).toHaveLength(21);
		expect(results.filter(r => r.row.addition && agrees(r))).toHaveLength(2);
		const choices: Record<string, number> = {};
		for (const r of results) choices[r.classification.choice] = (choices[r.classification.choice] ?? 0) + 1;
		expect(choices).toEqual({ understand: 17, "change-large": 5, judge: 5, locate: 3, "change-small": 2 });

		// § Threshold sweep at 0.55: 7 of 32 flagged, 2 of them disagreements.
		const flagged = results.filter(r => r.routing.lowConfidence);
		expect(flagged.map(r => r.row.id).sort()).toEqual(
			[
				"ExtSqliteTest",
				"LedgerThirdParty",
				"LensAbolishedSeat",
				"Phase5Agenda",
				"ResearchSelfImprove",
				"ScoutSeatHomes",
				"ScoutSkills",
			].sort(),
		);
		expect(flagged.filter(r => !agrees(r)).map(r => r.row.id).sort()).toEqual(["LensAbolishedSeat", "ResearchSelfImprove"]);
	});

	test("at 0.55 no brief is routed below its hand label's tier; the pull-ups are the recorded five", async () => {
		const judge = recordedJudge(rows);
		const pulled: Record<string, string> = {};
		for (const row of rows) {
			const routing = route(await classify(row.text, judge, question), null);
			expect(routing.pullDown).toBeNull();
			if (!isKind(row.hand_label)) throw new Error(`fixture hand label is not a kind: ${row.hand_label}`);
			// The threshold's job (SPEC-2.0.md § A1.3): an uncertain answer is served at the higher of
			// its top two, so a misread never lands a brief on a weaker tier than its kind needs.
			expect(tierRank(routing.tier)).toBeGreaterThanOrEqual(tierRank(KIND_TIER[row.hand_label]));
			if (routing.pullUp) pulled[row.id] = `${routing.pullUp.from}->${routing.pullUp.to}`;
		}
		expect(pulled).toEqual({
			Phase5Agenda: "standard->strong",
			LensAbolishedSeat: "standard->deep",
			ScoutSkills: "fast->strong",
			ScoutSeatHomes: "fast->strong",
			ExtSqliteTest: "standard->strong",
		});
	});

	test("an unrecorded brief never reaches a live judge", async () => {
		await expect(classify("a brief nobody recorded", recordedJudge(rows), question)).rejects.toThrow(
			"no recorded classifier response",
		);
	});
});
