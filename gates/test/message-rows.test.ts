// Rows 1 (turn shape, refused), 2 (contract injection) and 3 (receipts, flag-only).
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkTurnShape } from "../src/rows/r01-turn-shape";
import { CONTRACT_MARKER, injectContract } from "../src/rows/r02-contract";
import { checkReceipts, type HistoryEvent, historyEvent } from "../src/rows/r03-receipts";
import { tmp } from "./helpers";

const good = [
	"## Needs you",
	"**CLAIM**",
	"The gate is built.",
	"",
	"Run it with:",
	"```zsh",
	"zsh ~/agent-scratch/agent-system-2.0/run-gates.sh",
	"```",
	"**QUESTION**",
	"Ship the gates to the profile now, or wait for M5? Recommend now.",
	"<!-- output-types",
	"CLAIM: 1",
	"QUESTION: 1",
	"-->",
].join("\n");

describe("row 1: turn shape to Jo", () => {
	test("allows one closing ask, last, with a script-path command", () => {
		expect(checkTurnShape(good)).toBeNull();
		expect(checkTurnShape("**PMDW**\nDone, nothing needs you.")).toBeNull();
	});
	test("refuses two asks in one turn", () => {
		const r = checkTurnShape("**QUESTION**\nA or B?\n\n**QUESTION**\nC or D?");
		expect(r?.reason).toContain("2 QUESTIONs");
	});
	test("refuses a bare command handed to Jo", () => {
		const r = checkTurnShape("**ACTION**\nRun this:\n```bash\ngit push origin feat\n```");
		expect(r?.reason).toContain("bare command (`git push origin feat`)");
	});
	test("refuses a needs-you block that is not first, and an ask that is not last", () => {
		expect(checkTurnShape("**CLAIM**\nStuff happened.\n## Needs you\n**GUESS**\nx")?.reason).toContain("needs-you block is not first");
		expect(checkTurnShape("**QUESTION**\nA or B?\n**CLAIM**\nmore after")?.reason).toContain("closing ask is not last");
	});
	test("a non-shell code fence is not a command", () => {
		expect(checkTurnShape("**CLAIM**\n```ts\nconst x = 1;\n```")).toBeNull();
	});
});

describe("row 2: contract injected into every agent's system prompt", () => {
	test("appends the owned contract once, from the configured file", () => {
		const path = join(tmp("contract"), "output-types.md");
		writeFileSync(path, "Label every statement.");
		const env = { AGENT_SYSTEM_CONTRACT: path };
		const once = injectContract(["base prompt"], env);
		expect(once).toHaveLength(2);
		expect(once[1]).toContain("Label every statement.");
		expect(injectContract(once, env)).toBe(once);
	});
	test("a missing contract file is named in the prompt, not skipped", () => {
		const out = injectContract([], { AGENT_SYSTEM_CONTRACT: "/nonexistent/contract.md" });
		expect(out[0]).toContain(CONTRACT_MARKER);
		expect(out[0]).toContain("could not be loaded from /nonexistent/contract.md");
	});
});

describe("row 3: receipts verified (flags, never blocks)", () => {
	const dir = tmp("receipts");
	const file = join(dir, "code.ts");
	writeFileSync(file, "line one\nexport function gate() {\n  return refuse();\n}\n");

	test("a report whose receipts check out gets no flags", () => {
		const history: HistoryEvent[] = [
			{ kind: "read", path: file },
			{ kind: "fetch", url: "https://example.com/doc", finalUrl: "https://example.com/doc" },
			{ kind: "write", path: file },
			{ kind: "bash", command: "bun test gates", exitCode: 0 },
		];
		const report = [
			"**CLAIM**",
			`${file}:2 — \`export function gate() {\``,
			"**CITE**",
			"https://example.com/doc says so.",
			"**ACTION**",
			"`bun test gates` → exit 0; tests pass.",
			"<!-- output-types\nCLAIM: 1\nCITE: 1\nACTION: 1\n-->",
		].join("\n");
		expect(checkReceipts(report, history, dir)).toEqual([]);
	});

	test("flags each unverifiable receipt and returns flags rather than a refusal", () => {
		const history: HistoryEvent[] = [
			{ kind: "fetch", url: "https://example.com/old", finalUrl: "https://example.com/new" },
			{ kind: "bash", command: "bun test gates", exitCode: 1 },
			{ kind: "write", path: file },
		];
		const report = [
			"**CLAIM**",
			`${file}:2 — \`function somethingElse()\``,
			"**CLAIM**",
			`${join(dir, "missing.ts")}:3 says so.`,
			"**CITE**",
			"https://example.com/old and https://example.com/never",
			"**ACTION**",
			"`bun test gates` → exit 0",
			"All tests pass.",
			"<!-- output-types\nCLAIM: 5\n-->",
		].join("\n");
		const flags = checkReceipts(report, history, dir);
		expect(Array.isArray(flags)).toBe(true);
		const all = flags.join("\n");
		expect(all).toContain("was not read this session");
		expect(all).toContain('quote "function somethingElse()" does not match');
		expect(all).toContain("missing.ts:3, which does not exist");
		expect(all).toContain("redirected to https://example.com/new");
		expect(all).toContain("https://example.com/never was not fetched");
		expect(all).toContain("reports exit 0; the recorded run exited 1");
		expect(all).toContain("no test run is recorded after the last edit");
		expect(all).toContain("envelope says CLAIM: 5; the message has 2");
	});

	test("history is built from OMP tool_result shapes", () => {
		expect(historyEvent("read", { path: "a.ts:3-9" }, { resolvedPath: "/r/a.ts" }, false)).toEqual({ kind: "read", path: "/r/a.ts" });
		expect(historyEvent("read", { path: "https://x.dev" }, { url: "https://x.dev", finalUrl: "https://x.dev/" }, false)).toEqual({ kind: "fetch", url: "https://x.dev", finalUrl: "https://x.dev/" });
		expect(historyEvent("bash", { command: "false" }, { exitCode: 1 }, true)).toEqual({ kind: "bash", command: "false", exitCode: 1 });
		expect(historyEvent("bash", { command: "true" }, {}, false)).toEqual({ kind: "bash", command: "true", exitCode: 0 });
	});
});
