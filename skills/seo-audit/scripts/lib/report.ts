// Writes the run's three outputs: evidence.json (everything collected; long strings and arrays trimmed for size, the
// rules having already read the full values), findings.json (the engine's emissions) and report.md (the report
// contract in SKILL.md: the verdict line, findings by severity, observations, Not checked, do-not-flag notes).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Emission, EngineResult } from "./engine.ts";
import type { Evidence } from "./evidence.ts";

export interface Verdict {
	date: string;
	target: string;
	critical: number;
	high: number;
	medium: number;
	low: number;
	observations: number;
	verdict: "clean" | "findings" | "incomplete";
}

export function verdictOf(evidence: Evidence, result: EngineResult): Verdict {
	const count = (s: string) => result.emissions.filter((e) => e.kind === "finding" && e.severity === s).length;
	const findings = result.emissions.filter((e) => e.kind === "finding").length;
	return {
		date: evidence.auditTime.slice(0, 10),
		target: evidence.targets.join(" "),
		critical: count("critical"),
		high: count("high"),
		medium: count("medium"),
		low: count("low"),
		observations: result.emissions.filter((e) => e.kind === "observation").length,
		verdict: evidence.incomplete.length ? "incomplete" : findings ? "findings" : "clean",
	};
}

export function verdictLine(v: Verdict): string {
	return `<!-- seo-audit-verdict: date=${v.date} target=${v.target} critical=${v.critical} high=${v.high} medium=${v.medium} low=${v.low} observations=${v.observations} verdict=${v.verdict} -->`;
}

const STRING_CAP = 200_000;
const ARRAY_CAP = 2_000;

function trim(_key: string, value: unknown): unknown {
	if (typeof value === "string" && value.length > STRING_CAP)
		return `${value.slice(0, STRING_CAP)}… [trimmed in evidence.json: ${value.length} characters]`;
	if (Array.isArray(value) && value.length > ARRAY_CAP)
		return [...value.slice(0, ARRAY_CAP), `… [trimmed in evidence.json: ${value.length} items]`];
	return value;
}

function md(s: string): string {
	return s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function block(e: Emission): string {
	return [
		`- **${e.rule}** (${e.kind}${e.severity ? `, ${e.severity}` : ""}, layer ${e.layer}) — ${e.url}`,
		`  - locator: \`${md(e.locator)}\``,
		`  - observed: ${md(e.observed)}`,
		`  - fix: ${md(e.fix)}`,
		`  - source: ${e.sourceUrl} — "${md(e.quote)}"`,
	].join("\n");
}

export function renderReport(evidence: Evidence, result: EngineResult): string {
	const v = verdictOf(evidence, result);
	const out: string[] = [verdictLine(v), "", `# seo-audit report: ${evidence.targets.join(", ")}`, ""];
	out.push(`Audit time ${evidence.auditTime}. Mechanical rules only; the judgment rules in references/rules.md are applied by the agent (SKILL.md step 3).`, "");
	if (evidence.incomplete.length) {
		out.push("**Incomplete:** a mandatory layer failed, so the verdict cannot be clean.", "");
		for (const r of evidence.incomplete) out.push(`- ${md(r)}`);
		out.push("");
	}
	out.push("## Findings by severity", "");
	const findings = result.emissions.filter((e) => e.kind === "finding");
	if (!findings.length) out.push("No mechanical findings.", "");
	for (const sev of ["critical", "high", "medium", "low"]) {
		const list = findings.filter((e) => e.severity === sev);
		if (!list.length) continue;
		out.push(`### ${sev[0]?.toUpperCase()}${sev.slice(1)} (${list.length})`, "", ...list.map(block), "");
	}
	out.push("## Observations", "");
	const obs = result.emissions.filter((e) => e.kind === "observation");
	out.push(...(obs.length ? obs.map(block) : ["None."]), "");
	out.push("## Not checked", "");
	for (const n of evidence.notChecked) out.push(`- ${md(n.item)}: ${md(n.reason)}`);
	if (result.notImplemented.length)
		out.push(`- mechanical rules with no rule module yet (not evaluated): ${result.notImplemented.join(", ")}`);
	out.push("");
	out.push("## Do-not-flag notes that fired", "");
	const notes = result.emissions.filter((e) => e.kind === "dnf-note");
	out.push(...(notes.length ? notes.map((e) => `- **${e.rule}** — ${e.url} (\`${md(e.locator)}\`): ${md(e.observed)}. ${md(e.fix)} Source: ${e.sourceUrl} — "${md(e.quote)}"`) : ["None."]), "");
	return out.join("\n");
}

export function writeOutputs(dir: string, evidence: Evidence, result: EngineResult): { evidence: string; findings: string; report: string } {
	mkdirSync(dir, { recursive: true });
	const paths = { evidence: join(dir, "evidence.json"), findings: join(dir, "findings.json"), report: join(dir, "report.md") };
	writeFileSync(paths.evidence, `${JSON.stringify(evidence, trim, "\t")}\n`);
	const v = verdictOf(evidence, result);
	writeFileSync(
		paths.findings,
		`${JSON.stringify({ verdict: v, modules: result.modules, notImplemented: result.notImplemented, emissions: result.emissions }, null, "\t")}\n`,
	);
	writeFileSync(paths.report, renderReport(evidence, result));
	return paths;
}
