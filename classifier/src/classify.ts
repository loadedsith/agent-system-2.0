/**
 * Routing step 1: the brief goes to the judge as one choice question over the five kinds and comes
 * back as kind + confidence + probabilities. The question text is classifier/kind-question.json,
 * the exact question the 0.55 threshold was measured with (research/classifier-sample.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isKind, KINDS, type KindAnswer } from "./route";

export const QUESTION_PATH = join(import.meta.dir, "..", "kind-question.json");

export interface KindQuestion {
	kind: { type: "choice"; instructions: string; criteria: Record<string, string> };
}

export function loadKindQuestion(path: string = QUESTION_PATH): KindQuestion {
	const question = JSON.parse(readFileSync(path, "utf8")) as KindQuestion;
	// SPEC-2.0.md § A1.3 step 1: one choice question over the five kinds, nothing else.
	const labels = Object.keys(question.kind?.criteria ?? {});
	if (question.kind?.type !== "choice" || labels.join() !== KINDS.join()) {
		throw new Error(`${path}: expected one choice question "kind" over ${KINDS.join(", ")}; got ${labels.join(", ")}`);
	}
	return question;
}

/** What classify() needs from a judge: OMP's `judge` role in production, a recorded fixture in tests. */
export interface KindJudge {
	judge(request: { state: string; questions: KindQuestion }, options?: { signal?: AbortSignal }): Promise<{
		answers: { kind: { choice: string; confidence: number; probabilities: Record<string, number> } };
		model: string;
		provider: string;
		usage?: { cost?: { total?: number } };
	}>;
}

export interface Classification extends KindAnswer {
	/** `provider/model` that answered, e.g. `typesafe/jev-1.13.0`. */
	judgeModel: string;
	/** Dollar cost the judge reported for this call, when it reports one. */
	cost: number | null;
}

/** SPEC-2.0.md § A1.3 step 1: classify one brief. It names the kind of work only; never a model. */
export async function classify(
	brief: string,
	judge: KindJudge,
	question: KindQuestion,
	signal?: AbortSignal,
): Promise<Classification> {
	const result = await judge.judge({ state: brief, questions: question }, { signal });
	const answer = result.answers?.kind;
	if (!answer || !isKind(answer.choice)) {
		throw new Error(`classifier answered outside the five kinds: ${JSON.stringify(answer)}`);
	}
	const probabilities: Partial<Record<(typeof KINDS)[number], number>> = {};
	for (const kind of KINDS) probabilities[kind] = answer.probabilities?.[kind] ?? 0;
	return {
		choice: answer.choice,
		confidence: answer.confidence,
		probabilities,
		judgeModel: `${result.provider}/${result.model}`,
		cost: result.usage?.cost?.total ?? null,
	};
}
