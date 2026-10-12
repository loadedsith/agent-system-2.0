// The M8 wake render (MIGRATION.md item 106; DESIGN.md § 5 in the m8-wake-render scratch dir): a
// byte-budgeted "Repo facts" block for the lane's first prompt, and the unbudgeted text the
// `lane_read_facts` tool returns. The facts come from `Ledger.facts`, the only reader of `m8-fact`
// bodies; this module renders rows and never queries the ledger itself.
import { basename } from "node:path";
import type { FactRow, Ledger } from "../../ledger/src/index";

/**
 * The whole block's budget in UTF-8 bytes, header included. Measured on Tinker's live batch:
 * 182 bytes per rendered fact, so about 44 facts fit (DESIGN.md § 5.6). Raising it is an edit
 * with a new measurement beside it (item 87's rule), not a tweak.
 */
export const FACTS_BUDGET_BYTES = 8000;

/**
 * `- <text> (<id>; <src>)`, each comma-separated src part `/abs/dir/file.md:18-33` shortened to
 * `file.md:18-33` and the parts joined with `, `; `- <text> (<id>)` when the fact has no src.
 */
export function factLine(f: FactRow): string {
	if (f.src === "") return `- ${f.text} (${f.id})`;
	const parts = f.src.split(",").map((part) => {
		const p = part.trim();
		const colon = p.lastIndexOf(":");
		return colon < 0 ? basename(p) : basename(p.slice(0, colon)) + p.slice(colon);
	});
	return `- ${f.text} (${f.id}; ${parts.join(", ")})`;
}

/**
 * The prompt's facts block: a header naming how many of the repo's facts are shown, then whole
 * fact lines in the given order while the block (header, `\n`, lines joined by `\n`) stays within
 * `budgetBytes`. The header's size is reserved as if every fact were shown (N ≤ M has no more
 * digits), and the first fact that would cross the budget ends the block: no later, smaller fact
 * is pulled forward. "" when there are no facts.
 */
export function renderFacts(repo: string, rows: readonly FactRow[], budgetBytes: number = FACTS_BUDGET_BYTES): string {
	if (rows.length === 0) return "";
	const head = `## Repo facts (${repo}): showing `;
	const tail = ` of ${rows.length} under ${budgetBytes.toLocaleString("en-US")} bytes; \`lane_read_facts\` for the rest or another repo`;
	let used = Buffer.byteLength(`${head}${rows.length}${tail}`);
	const lines: string[] = [];
	for (const f of rows) {
		const line = factLine(f);
		const size = 1 + Buffer.byteLength(line);
		if (used + size > budgetBytes) break;
		used += size;
		lines.push(line);
	}
	return [`${head}${lines.length}${tail}`, ...lines].join("\n");
}

/** `renderFacts` over the ledger's facts for `repo`; a failed read is said in the block, never a silent blank. */
export function factsBlock(ledger: Pick<Ledger, "facts">, repo: string): string {
	try {
		return renderFacts(repo, ledger.facts(repo));
	} catch (e) {
		return `## Repo facts: could not be read (${e instanceof Error ? e.message : String(e)})`;
	}
}

/**
 * The `lane_read_facts` text, with no budget: `N facts for <repo>`, or with a non-empty `match`
 * `N of M match "<match>" for <repo>` (a case-insensitive substring of a fact's text or src), then
 * every matching fact line.
 */
export function readFacts(rows: readonly FactRow[], repo: string, match?: string): string {
	if (!match) return [`${rows.length} facts for ${repo}`, ...rows.map(factLine)].join("\n");
	const needle = match.toLowerCase();
	const hits = rows.filter((f) => f.text.toLowerCase().includes(needle) || f.src.toLowerCase().includes(needle));
	return [`${hits.length} of ${rows.length} match "${match}" for ${repo}`, ...hits.map(factLine)].join("\n");
}
