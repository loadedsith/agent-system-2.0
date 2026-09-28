/**
 * Routing step 4: tier → ordered models. The table lives in the 2.0 profile's `config.yml` only,
 * as OMP's native `task.agentModelOverrides` keyed by tier-file name (the tier files carry no
 * `model:` pin). Each row lists models in attempt order across providers; OMP uses the entries
 * after the first as the spawn's retry fallback chain (omp://extensions.md, before_subagent_spawn).
 */
import { readFileSync } from "node:fs";
import { TIERS, tierRank, type Tier } from "./route";

export type TierTable = Readonly<Record<Tier, readonly string[]>>;

/** A concrete `provider/model` selector with an optional `:thinking` suffix; no role aliases. */
const MODEL_SELECTOR = /^[a-z0-9][a-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._\/-]*(?::[a-z]+)?$/;

/** `provider/model:level` → `provider/model`: two rows naming one model at different efforts are one model. */
function modelIdentity(selector: string): string {
	return selector.replace(/:[a-z]+$/, "");
}

export class TierTableError extends Error {
	constructor(readonly problems: string[]) {
		super(`2.0 profile tier→model table is invalid:\n- ${problems.join("\n- ")}`);
	}
}

/**
 * Extract and check the table from a parsed profile config. Throws TierTableError listing every
 * problem, so a broken profile fails every dispatch closed instead of routing on a guess.
 */
export function tierTableFromConfig(config: unknown): TierTable {
	const problems: string[] = [];
	// Parsed YAML from the profile; every field below is re-checked, so the shape is only a lens.
	const root = (config ?? {}) as {
		task?: { agentModelOverrides?: Record<string, unknown> };
		retry?: { fallbackChains?: Record<string, unknown> };
	};
	const overrides = root.task?.agentModelOverrides ?? {};
	const table = {} as Record<Tier, string[]>;

	for (const tier of TIERS) {
		const raw = overrides[tier];
		const row = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
		// SPEC-2.0.md § A1.3 step 4: every tier resolves through the profile table; a tier with no
		// row would silently inherit the parent's model in OMP (task-agent-discovery.md precedence 3).
		if (row.length === 0) problems.push(`task.agentModelOverrides.${tier}: missing or empty`);
		for (const entry of row) {
			if (typeof entry !== "string" || !MODEL_SELECTOR.test(entry)) {
				problems.push(`task.agentModelOverrides.${tier}: ${JSON.stringify(entry)} is not a concrete provider/model selector`);
			}
		}
		table[tier] = row.filter((entry): entry is string => typeof entry === "string");
	}

	// DESIGN-2.0.md P-11 row 15 / SPEC-2.0.md § B11: a rate-limited provider falls to the same tier
	// on another provider, never up. A model listed in a higher tier's row, reachable as a fallback
	// from a lower row, is a pull-up and is refused.
	for (const tier of TIERS) {
		for (const entry of table[tier]) {
			for (const above of TIERS.filter(t => tierRank(t) > tierRank(tier))) {
				if (table[above].some(other => modelIdentity(other) === modelIdentity(entry))) {
					problems.push(`${entry} is in the ${tier} row and in the higher ${above} row: a fallback to it would pull up a tier`);
				}
			}
		}
	}

	// DESIGN-2.0.md P-11 row 15: OMP's global retry.fallbackChains keyed on a tier model (or its
	// provider wildcard) could move a hand off its tier row; the profile may not define one.
	const chains = root.retry?.fallbackChains ?? {};
	for (const key of Object.keys(chains)) {
		const hit = TIERS.flatMap(t => table[t]).find(
			entry => modelIdentity(entry) === modelIdentity(key) || (key.endsWith("/*") && entry.startsWith(key.slice(0, -1))),
		);
		if (hit || (TIERS as readonly string[]).includes(key)) {
			problems.push(`retry.fallbackChains.${key} can route a tier hand outside its tier row`);
		}
	}

	if (problems.length > 0) throw new TierTableError(problems);
	return table;
}

export function loadTierTable(configPath: string): TierTable {
	return tierTableFromConfig(Bun.YAML.parse(readFileSync(configPath, "utf8")));
}
