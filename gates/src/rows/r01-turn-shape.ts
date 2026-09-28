// P-11 row 1 (DESIGN-2.0.md:338; C2.1; SPEC-2.0.md § B16 items 1-2): a message addressed to Jo
// carries at most one ask/QUESTION, hands Jo a command only as a script path, and puts the needs-you
// block first and the closing ask last. Refused, not warned. Runs on a top-level session's stop
// (hands never talk to Jo; OMP never fires session_stop for subagents, omp://extensions.md:349).
import type { Refusal } from "../types";

const BLOCK_LABEL = /^\*\*(CLAIM|CITE|GUESS|ACTION|QUESTION|PMDW)\*\*\s*$/;
const SHELL_FENCE = /^(sh|bash|zsh|shell|console|terminal|shell-session)$/i;
/** The one form a command handed to Jo takes: run a script file (SPEC-2.0.md § B16 item 2). */
const SCRIPT_LINE = /^(?:\$\s*)?(?:zsh|bash|sh)\s+(?:~|\/)\S*\.(?:sh|zsh|bash)\s*$/;
const NEEDS_YOU = /^\s*(?:#{1,6}\s*|\*\*)?needs you\b/i;
const ENVELOPE = /<!--\s*output-types[\s\S]*?-->/g;

interface Fence {
	lang: string;
	lines: string[];
}

function fences(text: string): Fence[] {
	const out: Fence[] = [];
	const re = /^```([^\n`]*)\n([\s\S]*?)^```\s*$/gm;
	for (const m of text.matchAll(re)) out.push({ lang: m[1]!.trim(), lines: m[2]!.split("\n") });
	return out;
}

/** Row 1 over the final text of a turn addressed to Jo. */
export function checkTurnShape(message: string): Refusal {
	const text = message.replace(ENVELOPE, "").trimEnd();
	const prose = text.replace(/^```[\s\S]*?^```\s*$/gm, "");
	const lines = prose.split("\n");
	const problems: string[] = [];

	// (a) one ask per turn: block-leading QUESTION labels, plus inline bold QUESTION labels.
	const questions = (prose.match(/\*\*QUESTION\*\*/g) ?? []).length;
	if (questions > 1) problems.push(`it carries ${questions} QUESTIONs; a turn to Jo carries one ask, the rest are held and written down`);

	// (b) commands handed to Jo are script paths, never bare.
	for (const f of fences(text)) {
		if (!SHELL_FENCE.test(f.lang)) continue;
		const bare = f.lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !SCRIPT_LINE.test(l));
		if (bare.length > 0) {
			problems.push(
				`it hands Jo a bare command (\`${bare[0]}\`); write it to a script under ~/agent-scratch/<repo>/ and hand over the one line \`zsh <path>\``,
			);
			break;
		}
	}

	// (c) needs-you block first: nothing substantive above a "Needs you" heading.
	const needsIdx = lines.findIndex((l) => NEEDS_YOU.test(l));
	if (needsIdx > 0) {
		const before = lines.slice(0, needsIdx).filter((l) => l.trim() && !/^#{1,6}\s/.test(l) && !BLOCK_LABEL.test(l.trim()));
		if (before.length > 0) problems.push(`the needs-you block is not first (${before.length} line(s) of content above it)`);
	}

	// (c) closing ask last: no labeled block follows the QUESTION.
	if (questions === 1) {
		const q = lines.findIndex((l) => l.includes("**QUESTION**"));
		const later = lines.slice(q + 1).find((l) => BLOCK_LABEL.test(l.trim()));
		if (later) problems.push(`the closing ask is not last (a ${later.trim()} block follows the QUESTION)`);
	}

	if (problems.length === 0) return null;
	return {
		block: true,
		reason:
			`P-11 row 1 refused this turn to Jo: ${problems.join("; ")}. ` +
			`Shape: needs-you first, body, one closing ask last (SPEC-2.0.md § B16). Rewrite the message and send it again.`,
	};
}
