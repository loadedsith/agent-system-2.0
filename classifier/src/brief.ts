/**
 * Reads § B9 brief fields off a dispatch. The line syntax is shared with M4's six-field gate
 * (agreed with the M4 hand 2026-09-28) so the two never read a different value for one field:
 * a line `field: value`, optionally bulleted (`-`/`*`) and/or bold (`**field**:`), looked up in
 * the item's `task` text first, then the batch `context`; the first match wins.
 */
import { isStakes, type Stakes } from "./route";

// SPEC-2.0.md § B9: the six brief fields a slice brief carries.
export type BriefField = "workload" | "task" | "done-condition" | "inputs" | "stakes" | "ceiling-share";

const FIELD_LINE =
	/^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?(workload|task|done-condition|inputs|stakes|ceiling-share)(?:\*\*)?[ \t]*:(?:\*\*)?[ \t]*(\S.*?)[ \t]*$/gim;

/** The first value of `field` in `task`, else in `context`; `null` when neither carries it. */
export function briefField(field: BriefField, task: string | undefined, context: string | undefined): string | null {
	for (const text of [task, context]) {
		if (!text) continue;
		for (const match of text.matchAll(FIELD_LINE)) {
			if (match[1]!.toLowerCase() === field) return match[2]!;
		}
	}
	return null;
}

/**
 * SPEC-2.0.md § B9 field (5): stakes, inherited from the workload. An absent or unreadable value
 * is `null`: no cap is applied and the record says so (the refusal is M4's six-field gate).
 */
export function briefStakes(task: string | undefined, context: string | undefined): Stakes | null {
	const value = briefField("stakes", task, context)?.toLowerCase() ?? null;
	return isStakes(value) ? value : null;
}
