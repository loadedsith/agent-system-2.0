// Stakes inference (SPEC-2.0.md § A1.2): throwaway / normal / production from what Jo said plus the
// target repository, branch and whether a reserved target is named. Default normal. Shown as an
// inference in the one-liner, never asked. Mode (§ B13.1) is who steers: handed over and left is
// autonomous; "with me" / "plan it" / opening the lane's session is user-driven.
import { PROTECTED_BRANCH } from "../../gates/src/types";
import type { Mode, Stakes } from "../../ledger/src/index";

export interface StakesInput {
	/** What Jo said when handing the work over. */
	said: string;
	/** The target repository path or name, when known. */
	repo?: string | null;
	/** The target branch, when known. */
	branch?: string | null;
	/** A reserved target is named (§ A4: protected branch push, deploy, spend, …). */
	reservedTarget?: boolean;
}

export interface Inferred<T> {
	value: T;
	/** One line saying what the inference rests on, for the one-liner. */
	reason: string;
}

const PRODUCTION_WORDS = /\b(production|prod|deploy|deployment|release|hotfix|customer-facing|customers?|live|outage|incident)\b/i;
const THROWAWAY_WORDS = /\b(throwaway|throw-away|scratch|experiment|experimental|prototype|spike|poc|proof of concept|try(?:ing)? out|play(?:ing)? with|just (?:try|see|check))\b/i;
const SCRATCH_REPO = /(?:^|\/)(?:agent-scratch|scratch|tmp|temp|sandbox|playground)(?:\/|$)/i;
const USER_DRIVEN_WORDS = /\b(with me|plan it|step by step|walk me through|check with me|ask me|together|pair(?:ing)?|interactive(?:ly)?|user[- ]driven)\b/i;

/** Stakes from what Jo said and where the work lands. Production wins over throwaway when both match. */
export function inferStakes(input: StakesInput): Inferred<Stakes> {
	const said = input.said ?? "";
	if (input.reservedTarget) return { value: "production", reason: "a reserved target is named" };
	if (input.branch && PROTECTED_BRANCH.test(input.branch)) return { value: "production", reason: `target branch ${input.branch} is protected` };
	const prod = PRODUCTION_WORDS.exec(said);
	if (prod) return { value: "production", reason: `you said "${prod[0]}"` };
	const scratch = input.repo ? SCRATCH_REPO.exec(input.repo) : null;
	if (scratch) return { value: "throwaway", reason: `target repository is under ${scratch[0].replace(/\//g, "")}` };
	const away = THROWAWAY_WORDS.exec(said);
	if (away) return { value: "throwaway", reason: `you said "${away[0]}"` };
	return { value: "normal", reason: "default: nothing said points at production or scratch" };
}

/** Mode from what Jo said: user-driven only when they asked to steer. */
export function inferMode(said: string): Inferred<Mode> {
	const m = USER_DRIVEN_WORDS.exec(said ?? "");
	if (m) return { value: "user-driven", reason: `you said "${m[0]}"` };
	return { value: "autonomous", reason: "handed over and left" };
}
