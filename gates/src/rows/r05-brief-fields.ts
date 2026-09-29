// P-11 row 5 (DESIGN-2.0.md:342; C3.12; SPEC-2.0.md:533-547 § B9): a dispatch carries all six
// brief fields — workload id, task, done-condition, inputs, stakes, ceiling share — refused otherwise.
import type { Refusal } from "../types";
import { dispatchItems } from "./r04-tier-name";

export const BRIEF_FIELDS = ["workload", "task", "done-condition", "inputs", "stakes", "ceiling-share"] as const;
export type BriefField = (typeof BRIEF_FIELDS)[number];

/**
 * One field line: optional list marker, optional bold around the name, a colon, a value. Shared
 * with M3's classifier, which reads `stakes` with the same syntax and the same task-then-context
 * lookup (agreed agent://M3TierClassifier, 2026-09-28).
 */
export const FIELD_LINE =
	/^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?(workload|task|done-condition|inputs|stakes|ceiling-share)(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(\S.*?)[ \t]*$/gim;

const VALUE_CHECK: Partial<Record<BriefField, { re: RegExp; want: string }>> = {
	workload: { re: /^wl-\S+$/, want: "a ledger workload id (wl-…)" },
	stakes: { re: /^(throwaway|normal|production)$/i, want: "throwaway | normal | production" },
	"ceiling-share": { re: /^\d+(?:\.\d+)?%?$/, want: "a number" },
};

/** Field values in `text`, first occurrence of each field wins. */
export function briefFields(text: string): Partial<Record<BriefField, string>> {
	const out: Partial<Record<BriefField, string>> = {};
	for (const m of text.matchAll(FIELD_LINE)) {
		const name = m[1]!.toLowerCase() as BriefField;
		out[name] ??= m[2]!;
	}
	return out;
}

/**
 * Refuses a `task` call any of whose items lacks a field (looked up in the item's task, then the
 * batch context). When the session is bound to a workload (AGENT_SYSTEM_WORKLOAD_ID), a brief whose
 * `workload:` names another one is refused too (M4 fix round 4, S6; triad #7/#12).
 */
export function checkBriefFields(input: Record<string, unknown>, boundWorkload: string | null = null): Refusal {
	const shared = briefFields(typeof input.context === "string" ? input.context : "");
	const problems: string[] = [];
	dispatchItems(input).forEach((item, i) => {
		const fields = { ...shared, ...briefFields(typeof item.task === "string" ? item.task : "") };
		for (const f of BRIEF_FIELDS) {
			const v = fields[f];
			if (v === undefined) problems.push(`item ${i}: missing "${f}:"`);
			else if (VALUE_CHECK[f] && !VALUE_CHECK[f]!.re.test(v)) problems.push(`item ${i}: "${f}: ${v}" is not ${VALUE_CHECK[f]!.want}`);
			else if (f === "workload" && boundWorkload && v !== boundWorkload) problems.push(`item ${i}: "workload: ${v}" is not this session's workload ${boundWorkload}`);
		}
	});
	if (problems.length === 0) return null;
	return {
		block: true,
		reason:
			`P-11 row 5 refused this dispatch: a slice brief carries all six § B9 fields, one per line, in the item's task or the batch context. ` +
			`${problems.join("; ")}. Shape:\nworkload: ${boundWorkload ?? "wl-…"}${boundWorkload ? " (this session's workload)" : ""}\ntask: <one paragraph>\ndone-condition: <the runtime artifact that closes the slice>\n` +
			`inputs: <paths and branch the hand may touch>\nstakes: throwaway | normal | production\nceiling-share: <number>\n` +
			`and the item's \`name\` is the slice id: [A-Za-z0-9_-]{1,48}, an existing slice of the workload.`,
	};
}
