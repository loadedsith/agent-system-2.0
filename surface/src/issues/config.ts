// The `issues:` block of profile/config.yml (PLAN wl-mv66ylim0gahog § 2): which GitHub repo the
// projection writes to, Jo's login (the intake author check), and the projection's caps. Loaded the
// way `loadTestRunnerConfig` loads `testRunner:` (surface/src/close-entry.ts), with an env override
// for tests. No block means the projector serves nothing: the row never opens the sidecar and makes
// no call.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../session";

/** Replaces the checkout's profile/config.yml as the source of the `issues:` block (tests, the smoke). */
export const ISSUES_CONFIG_ENV = "AGENT_SYSTEM_ISSUES_CONFIG";

export interface IssuesConfig {
	/** GitHub `owner/repo` the issues live on; every `gh -R` names it. */
	repo: string;
	/** Jo's GitHub login: the only author intake accepts (§ 6.2 rule 1). */
	jo: string;
	/** Counted gh calls one tick may make. */
	perTick: number;
	/** Counted gh calls in any rolling hour, across processes (the sidecar's `calls` table). */
	perHour: number;
	/** Minutes between reconciler runs (§ 4). */
	reconcileEveryMin: number;
	/** Minutes between intake runs (§ 6). */
	intakeEveryMin: number;
	/** A link or a PR footer that failed this many times in a row is parked until the reconciler resets it. */
	parkAfterFails: number;
}

/** The plan's defaults (§ 2), used for a key the block leaves out. */
export const ISSUES_DEFAULTS: Omit<IssuesConfig, "repo" | "jo"> = { perTick: 20, perHour: 300, reconcileEveryMin: 60, intakeEveryMin: 5, parkAfterFails: 10 };

const OWNER_REPO = /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;

/**
 * The `issues:` block of a parsed profile config. No block (or `issues: null`) is `config: null`:
 * the projector serves nothing. A block that is present but malformed is an error, never a default.
 */
export function issuesConfig(doc: unknown): { ok: true; config: IssuesConfig | null } | { ok: false; error: string } {
	const block = doc !== null && typeof doc === "object" && "issues" in doc ? doc.issues : undefined;
	if (block === undefined || block === null) return { ok: true, config: null };
	if (typeof block !== "object" || Array.isArray(block)) return { ok: false, error: "issues is not a mapping" };
	// A non-null, non-array object from YAML: every key is read below as unknown and checked.
	const b = block as Record<string, unknown>;
	if (typeof b.repo !== "string" || !OWNER_REPO.test(b.repo)) return { ok: false, error: "issues.repo is not an owner/repo" };
	if (typeof b.jo !== "string" || !LOGIN.test(b.jo)) return { ok: false, error: "issues.jo is not a GitHub login" };
	const out: IssuesConfig = { repo: b.repo, jo: b.jo, ...ISSUES_DEFAULTS };
	for (const key of Object.keys(ISSUES_DEFAULTS) as (keyof typeof ISSUES_DEFAULTS)[]) {
		const v = b[key];
		if (v === undefined) continue;
		if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) return { ok: false, error: `issues.${key} is not a positive integer` };
		out[key] = v;
	}
	return { ok: true, config: out };
}

/** The `issues:` block from the checkout's profile/config.yml (or `$AGENT_SYSTEM_ISSUES_CONFIG`). */
export function loadIssuesConfig(env: Record<string, string | undefined>): { ok: true; config: IssuesConfig | null } | { ok: false; error: string } {
	const path = env[ISSUES_CONFIG_ENV]?.trim() || join(REPO_ROOT, "profile", "config.yml");
	let doc: unknown;
	try {
		doc = Bun.YAML.parse(readFileSync(path, "utf8"));
	} catch (err) {
		return { ok: false, error: `${path}: ${String(err instanceof Error ? err.message : err).split("\n")[0]}` };
	}
	const c = issuesConfig(doc);
	return c.ok ? c : { ok: false, error: `${path}: ${c.error}` };
}
