// P-11 row 1 (DESIGN-2.0.md:338; C2.1; SPEC-2.0.md § B16 items 1-2): a message addressed to Jo
// carries at most one ask/QUESTION, hands Jo a command only as a script path, and puts the needs-you
// block first and the closing ask last. Refused, not warned. Runs on a top-level session's stop
// (hands never talk to Jo; OMP never fires session_stop for subagents, omp://extensions.md:349).
import type { Refusal } from "../types";

const BLOCK_LABEL = /^\*\*(CLAIM|CITE|GUESS|ACTION|QUESTION|PMDW)\*\*\s*$/;
const SHELL_FENCE = /^(sh|bash|zsh|shell|console|terminal|shell-session)$/i;
/**
 * Fences that hold code or data, never a command handed over to run. Every other fence (untagged,
 * `text`, `plain`, an unknown tag) is checked for command-shaped lines: an untagged fence hid the
 * same `git push` a `bash` fence was refused for (astra review S1).
 */
const CODE_FENCE =
	/^(ts|tsx|typescript|js|jsx|javascript|mjs|cjs|json|jsonc|json5|yaml|yml|toml|ini|xml|html|css|scss|md|markdown|mermaid|diff|patch|py|python|rb|ruby|go|rs|rust|java|kt|kotlin|swift|c|cpp|h|hpp|cs|php|lua|sql|graphql|gql|csv|tsv|proto|dockerfile|makefile|nix|hcl|tf)$/i;
/** The first word of a line that runs something: the command heads a handed-over line starts with. */
const COMMAND_LINE =
	/^(?:\$\s+|%\s+|>\s+)?(?:sudo\s+)?(?:git|gh|npm|npx|pnpm|yarn|bun|bunx|node|deno|cd|rm|mv|cp|mkdir|rmdir|chmod|chown|ln|touch|curl|wget|brew|pip3?|python3?|uv|docker|kubectl|helm|make|just|cargo|go|ssh|scp|rsync|export|source|psql|mysql|sqlite3|terraform|tofu|echo|printf|cat|open|tar|unzip|launchctl|defaults|omp|claude|codex|vercel|netlify|fly|flyctl|aws|gcloud|supabase|doctl|heroku|wrangler|firebase|zsh|bash|sh|kill|pkill|killall|xargs|find|sed|awk)(?:\s|$)/;
/** The one form a command handed to Jo takes: run a script file (SPEC-2.0.md § B16 item 2). */
const SCRIPT_LINE = /^(?:\$\s*)?(?:zsh|bash|sh)\s+(?:~|\/)\S*\.(?:sh|zsh|bash)\s*$/;
/** After the closing ask, only its option list may follow. */
const OPTION_LINE = /^\s*(?:[-*+]|\d+[.)])\s+\S/;
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

/**
 * One line with what is not the author's own prose blanked: inline code, URLs, HTML comments,
 * quoted text (`"…"`, `“…”`, `‘…’`, `*"…"*`), and whole lines that are blockquotes, indented code or
 * `//` comments (astra review round 3, R3-S1: a quoted or commented question is evidence, not an ask).
 * The one normalization row 1 reads through: block labels, decision counting and the closing ask
 * all use it (M4 fix round 4, S3).
 */
function ownProse(line: string): string {
	if (/^(?: {4}|\t)/.test(line) || /^\s*>/.test(line) || /^\s*\/\//.test(line)) return "";
	return line
		.replace(/`[^`\n]*`/g, "")
		.replace(/\bhttps?:\/\/\S+/g, "")
		.replace(/<!--.*?-->/g, "")
		.replace(/"[^"\n]*"|“[^”\n]*”/g, "")
		.replace(/‘[^’\n]*’/g, "");
}

/** Sentence-ending question marks: a `?` followed by a space, a closing mark or the end of the line. */
const ASK_END = /\?+(?=[\s)*_\]]|$)/g;

/**
 * Where one ask's clauses split: `;`, `:`, "also", "and then", and (fix round 4, S3) a comma or a
 * bare "and". Two clauses that each carry an `or` are two decisions ("main or feature, and today
 * or tomorrow?"); a list with one `or` ("A, B or C?") stays one.
 */
const CLAUSE_SPLIT = /[;:,]|\balso\b|\band\b/i;

/** A choice between options: an ask outside the QUESTION block must not be one. */
const CHOICE = /\bor\b|\b(?:choose|pick|decide|prefer|which)\b/i;

/** Row 1 over the final text of a turn addressed to Jo. */
export function checkTurnShape(message: string): Refusal {
	const text = message.replace(ENVELOPE, "").trimEnd();
	const prose = text.replace(/^```[\s\S]*?^```\s*$/gm, "");
	const lines = prose.split("\n");
	const problems: string[] = [];

	// (a) one ask per turn, as one structured decision block (M4 fix round 3, R3-S1). A question mark
	// is not a decision by itself: quoted and code text is exempt, and a PMDW may carry one yes/no
	// check-in ("Want me to proceed?"). An assertion (CLAIM/CITE/GUESS/ACTION, or unlabeled prose)
	// asks nothing; a PMDW never offers a choice or asks twice; the one QUESTION block asks one
	// thing, in one sentence, and not two `or` choices joined in it (round 2, R2-S2; round 3, R3-S1).
	// Real output-type blocks only: a bold label alone on its line. `**QUESTION**` inside inline code
	// or a sentence is text, not a block (fix round 4, S3).
	const questionLines = lines.flatMap((l, i) => (BLOCK_LABEL.exec(l.trim())?.[1] === "QUESTION" ? [i] : []));
	const questions = questionLines.length;
	if (questions > 1) problems.push(`it carries ${questions} QUESTIONs; a turn to Jo carries one ask, the rest are held and written down`);
	let label = "";
	let checkIns = 0;
	const questionText: string[] = [];
	for (const line of lines) {
		const m = BLOCK_LABEL.exec(line.trim());
		if (m) {
			label = m[1]!;
			continue;
		}
		const own = ownProse(line);
		if (label === "QUESTION") {
			questionText.push(own);
			continue;
		}
		const asks = own.match(ASK_END) ?? [];
		if (asks.length === 0) continue;
		const sentence = own.slice(0, own.search(ASK_END)).split(/[.!:;]\s/).at(-1)!.trim();
		if (label !== "PMDW") problems.push(`${label ? `a ${label}` : "unlabeled prose"} asks something ("${sentence}?"); an assertion asks nothing, and the one ask is a structured **QUESTION** block, last`);
		else if (CHOICE.test(own)) problems.push(`a PMDW offers Jo a choice ("${sentence}?"); a choice is the one **QUESTION** block, last`);
		else checkIns += asks.length;
	}
	if (checkIns > 1) problems.push(`its PMDW asks ${checkIns} things; a turn to Jo carries at most one yes/no check-in besides the one QUESTION block`);
	if (questions === 1) {
		const block = questionText.join("\n").split("\n").filter((l) => !OPTION_LINE.test(l)).join(" ");
		const asks = block.match(ASK_END)?.length ?? 0;
		if (asks === 0) problems.push("its QUESTION block asks nothing (no question mark)");
		else if (asks > 1) problems.push(`its QUESTION block asks ${asks} things (question marks); the one ask asks one thing, the rest are held and written down`);
		else {
			const ask = block.slice(0, block.search(ASK_END));
			const choices = ask.split(CLAUSE_SPLIT).filter((clause) => /\bor\b/i.test(clause)).length;
			if (choices > 1) problems.push(`its QUESTION block joins ${choices} separate choices in one ask; the one ask asks one thing, the rest are held and written down`);
		}
	}

	// (b) commands handed to Jo are script paths, never bare. A shell fence: every line is a command.
	// Any other fence that is not code or data: every command-shaped line is.
	for (const f of fences(text)) {
		if (CODE_FENCE.test(f.lang)) continue;
		const shell = SHELL_FENCE.test(f.lang);
		const bare = f.lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && !SCRIPT_LINE.test(l) && (shell || COMMAND_LINE.test(l)));
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

	// (c) closing ask last: no labeled block follows the QUESTION, and nothing but the ask's own
	// option list follows the ask's last question line (astra review S1: trailing prose passed).
	if (questions === 1) {
		const rest = lines.slice(questionLines[0]! + 1);
		const later = rest.find((l) => BLOCK_LABEL.test(l.trim()));
		if (later) problems.push(`the closing ask is not last (a ${later.trim()} block follows the QUESTION)`);
		else {
			const askLine = rest.findIndex((l) => ownProse(l).search(ASK_END) >= 0);
			const trailing = askLine < 0 ? undefined : rest.slice(askLine + 1).find((l) => l.trim() && !OPTION_LINE.test(l));
			if (trailing) problems.push(`the closing ask is not last (prose follows it: "${trailing.trim()}")`);
		}
	}

	if (problems.length === 0) return null;
	return {
		block: true,
		reason:
			`P-11 row 1 refused this turn to Jo: ${problems.join("; ")}. ` +
			`Shape: needs-you first, body, one closing ask last (SPEC-2.0.md § B16). Rewrite the message and send it again.`,
	};
}
