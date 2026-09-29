// P-11 row 2 (DESIGN-2.0.md:339; C4.7; build question 7 at DESIGN-2.0.md:97): the owned output-types
// contract is present in every agent's context. Injection, not a gate: the gates extension appends
// the contract to the system prompt in `before_agent_start`, which OMP fires in lanes and, because
// children re-bind the parent's extensions, in hands too. See REPORT.md "Build question 7".
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** Env var naming the owned contract file (built at M5); read at every agent start so edits land without a restart. */
export const CONTRACT_ENV = "AGENT_SYSTEM_CONTRACT";
/**
 * PLACEHOLDER until M5 builds the owned contract (Plumb's call, 2026-09-28): the default location of
 * the contract copy, relative to the repo root. M5 replaces this path; AGENT_SYSTEM_CONTRACT overrides it now.
 */
export const M5_PLACEHOLDER_CONTRACT_RELATIVE = join("contract", "output-types.md");
/** Marker that makes the injection idempotent when several prompt layers re-run. */
export const CONTRACT_MARKER = "<!-- p11-row-2: output-types contract -->";

export function contractPath(env: Record<string, string | undefined>): string {
	const override = env[CONTRACT_ENV];
	return override && override.trim() ? override : join(dirname(dirname(dirname(import.meta.dir))), M5_PLACEHOLDER_CONTRACT_RELATIVE);
}

/**
 * The system prompt with the contract appended once. A missing file is not silent: the agent gets a
 * line saying the contract could not be loaded and from where, so the gap shows in every transcript.
 */
export function injectContract(systemPrompt: string[], env: Record<string, string | undefined>): string[] {
	if (systemPrompt.some((p) => p.includes(CONTRACT_MARKER))) return systemPrompt;
	const path = contractPath(env);
	const body = existsSync(path)
		? readFileSync(path, "utf8")
		: `The owned output-types contract could not be loaded from ${path} (set ${CONTRACT_ENV}). Label every statement CLAIM, CITE, GUESS, ACTION, QUESTION or PMDW regardless.`;
	return [...systemPrompt, `${CONTRACT_MARKER}\n${body}`];
}
