// The issues projector's tick (PLAN wl-mv66ylim0gahog §§ 3, 5): one GitHub-issues projection of the
// ledger, drained only by the orchestrator surface's issues row. A tick, in order:
//
// 1. Claim: take the sidecar claim (free, expired, or already ours) or do nothing. Every counted
//    gh call fences and renews it (surface/src/issues/github.ts); it is released at the end.
// 2. Seeding (switch on, `seeded_at` unset): one ledger read transaction gives `hw = max(seq)` and
//    the open workloads of that snapshot; one sidecar transaction writes a dirty link for each on
//    the configured repo, `cursor = hw`, `intake_since` = the on entry's `created_at`, `seeded_at`.
// 3. Ingest (on or off, local, no GitHub call): every workload with provenance after the cursor
//    (lease-only renewals and wl-orchestrator excluded) is marked dirty; one without a link gets a
//    dirty link only when it is open and on the configured repo. Before seeding only the cursor moves.
// 4. Off ⇒ the tick ends here: no GitHub call.
// 5. The hourly `gh api rate_limit` read (counted); under RATE_FLOOR remaining, steps 7–9 pause.
// 6. The default branch (read once) and the projection's labels (created once).
// 7. PR scan: every open PR in the repo, mapped to a link by bound head branch or test-requested
//    number; a newly mapped PR, or a mapped PR gone from the open list, marks its link dirty.
// 8. Footers: each mapped default-base PR whose link has an issue gets `Closes #N` (re-read, then edited).
// 9. Push: dirty links by `last_seq`, rendered from the ledger now with the PR set.
// 10. Phases (`TickPhases`), in the same claim and budget.
//
// A failed gh call backs its link (or PR footer) off and ends the tick; a budget or claim stop
// (`TickStop`) ends it quietly. Errors reach the row as notice lines; the row dedups them.
import { existsSync } from "node:fs";
import type { Ledger } from "../../../ledger/src/index";
import { parseSpend } from "../ceiling";
import { repoOf } from "../decision-log";
import { ceilingOf, ceilingText } from "../input";
import { controlEntries } from "../launch";
import { ownerRepoOf } from "../test-run";
import { STANDING_WORKLOAD_ID } from "../types";
import type { IssuesConfig } from "./config";
import { closesFooter, hasFooter } from "./footer";
import { type Exec, GitHub, TickStop } from "./github";
import { type PrSet, prSources, readPrSet, scanOpenPrs } from "./prs";
import { LABEL, type PrFact, PROJECTION_LABELS, type Rendered, mergeBody, render, renderHash, stateText } from "./render";
import { INTAKE_ACCEPTED, type LinkRow, type PrRow, STATE, type Sidecar } from "./sidecar";
import { readSwitch, type SwitchState } from "./switch";

/** Pushes, the scan and footer edits pause while the hourly read says fewer core calls remain (§ 2). */
export const RATE_FLOOR = 500;
const HOUR_MS = 60 * 60_000;
const BACKOFF_BASE_MS = 60_000;
const LOCAL_MS = 15_000;
/** `links.repo` for a workload on no GitHub repo (no `repo:` entry, no origin, or not github.com): never projected. */
export const NO_REPO = "-";

/** The backoff after `fails` consecutive failures: min(60 s · 2^fails, 1 h). */
export function backoffMs(fails: number): number {
	return Math.min(BACKOFF_BASE_MS * 2 ** fails, HOUR_MS);
}

/**
 * What a phase gets (the reconcile and intake slices implement against this; the row passes them in):
 *
 *   interface TickPhases {
 *     reconcile?: (ctx: PhaseContext) => Promise<void>;
 *     intake?: (ctx: PhaseContext) => Promise<void>;
 *   }
 *
 * Phases run after the push, only while the switch is on, reconcile first, inside the tick's claim
 * and with its counted caller `gh`, so they share the tick's `perTick` and the hour's `perHour`.
 * A phase schedules itself (`reconcileEveryMin`, `intakeEveryMin`) from its own `state` keys, makes
 * every GitHub call through `ctx.gh` (never `ctx.exec` for gh), and lets `TickStop` propagate (catch,
 * record, rethrow when it must record "budget"). Any other throw is caught by the tick and becomes
 * one notice; the next phase still runs. `notice` lines reach Jo's surface once per distinct text.
 */
export interface PhaseContext {
	config: IssuesConfig;
	sidecar: Sidecar;
	/** The tick's counted gh caller. */
	gh: GitHub;
	ledger: Ledger;
	/** For local commands (git); every gh call goes through `gh`. */
	exec: Exec;
	/** Epoch ms. */
	now: () => number;
	notice: (line: string) => void;
	switchState: SwitchState;
	/** The repo's default branch, or null when it could not be read. */
	defaultBranch: string | null;
	/** The hourly rate_limit read said fewer than RATE_FLOOR calls remain: the push paused this tick. */
	rateLow: boolean;
	/** A workload's PR set through `gh` (unknown on a full branch list or any failure). */
	prSet: (workloadId: string) => Promise<PrSet>;
	/** The render of a workload from the ledger now with `prs`, or null when the ledger has no such workload. */
	renderOf: (workloadId: string, prs: readonly PrFact[]) => Rendered | null;
}

export interface TickPhases {
	reconcile?: (ctx: PhaseContext) => Promise<void>;
	intake?: (ctx: PhaseContext) => Promise<void>;
}

export interface TickOptions {
	exec: Exec;
	ledger: Ledger;
	sidecar: Sidecar;
	config: IssuesConfig;
	/** This drainer: pid + session (§ 3 claim). */
	holder: string;
	/** Epoch ms; tests move it. */
	now: () => number;
	/** One line per thing Jo should hear; the row dedups by text. */
	notice: (line: string) => void;
	phases?: TickPhases;
}

export interface TickReport {
	claimed: boolean;
	on: boolean;
	/** This tick seeded. */
	seeded: boolean;
	/** Workloads ingest touched. */
	ingested: number;
	/** Links pushed (created, adopted, edited, or found clean). */
	pushed: number;
	/** Why the tick stopped early: a budget or claim stop, a failed call, or null when it ran through. */
	stopped: "budget" | "lost" | "failed" | null;
	/** Counted gh calls made. */
	calls: number;
}

// ---- local reads ------------------------------------------------------------------------------

/**
 * The owner/repo (lower case) of the workload's `repo:` checkout's origin, NO_REPO when it has none
 * or it is not on GitHub, or null when git could not answer (resolved again later). Local only.
 */
export async function resolveRepo(exec: Exec, ledger: Ledger, workloadId: string): Promise<string | null> {
	const path = repoOf(ledger, workloadId);
	if (path === null || !existsSync(path)) return NO_REPO;
	let r: { stdout: string; code: number; killed: boolean };
	try {
		r = await exec("git", ["-C", path, "remote", "get-url", "origin"], { timeout: LOCAL_MS });
	} catch {
		return null;
	}
	if (r.killed) return null;
	// git exits 2 for "No such remote"; 128 for "not a git repository".
	if (r.code === 2 || r.code === 128) return NO_REPO;
	if (r.code !== 0) return null;
	return ownerRepoOf(r.stdout.trim())?.toLowerCase() ?? NO_REPO;
}

/** The ceiling line of the block: the ceiling in force and the newest `spend:` against it. */
function ceilingLine(ledger: Ledger, workloadId: string): string {
	const c = ceilingOf(ledger, workloadId);
	const spend = controlEntries(ledger.entries(workloadId, "assumption"))
		.flatMap((e) => {
			const p = e.prefix === "spend" ? parseSpend(e.rest) : null;
			return p ? [p] : [];
		})
		.at(-1);
	if (!spend) return `${ceilingText(c)}, nothing spent`;
	return `spent $${Number(spend.usd.toFixed(2))} of $${Number(c.usd.toFixed(2))} · ${Number(spend.wallMin.toFixed(1))} of ${c.wallMin} min`;
}

/** The render of a workload from the ledger now, or null when there is no such workload. */
export function renderWorkload(ledger: Ledger, workloadId: string, prs: readonly PrFact[], lastSeq: number): Rendered | null {
	const w = ledger.workload(workloadId);
	if (!w) return null;
	const slices = { open: 0, paused: 0, done: 0, cancelled: 0 };
	for (const s of ledger.slices(workloadId)) {
		if (s.state === "open") slices.open++;
		else if (s.state === "paused") slices.paused++;
		else if (s.state === "done") slices.done++;
		else slices.cancelled++;
	}
	const questions = ledger.questions(workloadId).filter((q) => q.state === "open").map((q) => ({ id: q.id, body: q.body }));
	return render({
		workload: { id: w.id, brief: w.brief, stakes: w.stakes, mode: w.mode, status: w.status, holder: w.holder },
		ceiling: ceilingLine(ledger, workloadId),
		slices,
		questions,
		prs,
		lastSeq,
	});
}

// ---- the tick ---------------------------------------------------------------------------------

/** A failed gh call: the tick ends after the caller backs off what it was for. */
class CallFailed extends Error {}

class Tick {
	readonly gh: GitHub;
	readonly repo: string;
	readonly report: TickReport = { claimed: true, on: false, seeded: false, ingested: 0, pushed: 0, stopped: null, calls: 0 };
	defaultBranch: string | null = null;
	rateLow = false;

	constructor(readonly o: TickOptions) {
		this.gh = new GitHub(o.exec, o.sidecar, { holder: o.holder, perTick: o.config.perTick, perHour: o.config.perHour, now: o.now });
		this.repo = o.config.repo;
	}

	get sidecar(): Sidecar {
		return this.o.sidecar;
	}
	get ledger(): Ledger {
		return this.o.ledger;
	}
	/** The configured repo as `links.repo` caches it. */
	get repoKey(): string {
		return this.repo.toLowerCase();
	}

	// ---- seeding and ingest (local) ----

	async seed(sw: SwitchState): Promise<void> {
		const snapshot = this.ledger.db.transaction(() => {
			const hw = this.ledger.db.query<{ hw: number | null }, []>("SELECT max(seq) AS hw FROM provenance").get()?.hw ?? 0;
			const open = this.ledger.db
				.query<{ id: string; seq: number | null }, [string]>(
					"SELECT w.id AS id, (SELECT max(p.seq) FROM provenance p WHERE p.workload_id = w.id) AS seq FROM workloads w WHERE w.status = 'open' AND w.id <> ? ORDER BY w.created_at, w.id",
				)
				.all(STANDING_WORKLOAD_ID);
			return { hw, open };
		})();
		const repos = new Map<string, string | null>();
		for (const w of snapshot.open) repos.set(w.id, await resolveRepo(this.o.exec, this.ledger, w.id));
		this.sidecar.immediate(() => {
			for (const w of snapshot.open) {
				const repo = repos.get(w.id) ?? null;
				this.sidecar.upsertLink(w.id, { repo, dirty: repo === null || repo === this.repoKey, lastSeq: w.seq ?? 0 });
			}
			this.sidecar.setCursor(snapshot.hw);
			this.sidecar.setState(STATE.intakeSince, sw.at ?? new Date(this.o.now()).toISOString());
			this.sidecar.setState(STATE.seededAt, new Date(this.o.now()).toISOString());
		});
		this.report.seeded = true;
	}

	async ingest(seeded: boolean): Promise<void> {
		const db = this.ledger.db;
		const max = db.query<{ m: number | null }, []>("SELECT max(seq) AS m FROM provenance").get()?.m ?? 0;
		const cursor = this.sidecar.cursor();
		if (!seeded || cursor === null) {
			this.sidecar.immediate(() => this.sidecar.setCursor(max));
			return;
		}
		if (max <= cursor) return;
		const touched = db
			.query<{ workload_id: string; seq: number }, [number, number, string]>(
				`SELECT workload_id, max(seq) AS seq FROM provenance
				  WHERE seq > ? AND seq <= ? AND workload_id <> ?
				    AND NOT (tbl = 'workloads' AND action = 'update' AND detail LIKE 'lease %')
				  GROUP BY workload_id ORDER BY seq`,
			)
			.all(cursor, max, STANDING_WORKLOAD_ID);
		const fresh = new Map<string, string | null>();
		for (const t of touched) {
			if (this.sidecar.link(t.workload_id)) continue;
			if (this.ledger.workload(t.workload_id)?.status !== "open") continue;
			fresh.set(t.workload_id, await resolveRepo(this.o.exec, this.ledger, t.workload_id));
		}
		this.sidecar.immediate(() => {
			for (const t of touched) {
				if (this.sidecar.link(t.workload_id)) {
					this.sidecar.upsertLink(t.workload_id, { repo: null, dirty: true, lastSeq: t.seq });
				} else if (fresh.has(t.workload_id)) {
					const repo = fresh.get(t.workload_id) ?? null;
					// Another repo is cached as such, never dirty, never projected.
					this.sidecar.upsertLink(t.workload_id, { repo, dirty: repo === null || repo === this.repoKey, lastSeq: t.seq });
				}
			}
			this.sidecar.setCursor(max);
		});
		this.report.ingested = touched.length;
	}

	// ---- GitHub steps ----

	/** A counted call that must succeed for the tick to go on. */
	async need(args: string[]): Promise<string> {
		const r = await this.gh.run(args);
		if (!r.ok) {
			this.o.notice(r.error);
			throw new CallFailed(r.error);
		}
		return r.out;
	}

	async rateLimit(): Promise<void> {
		const now = this.o.now();
		const checked = Number(this.sidecar.state(STATE.rateCheckedAt) ?? "0");
		if (now - checked >= HOUR_MS) {
			const out = await this.need(["api", "rate_limit", "--jq", ".resources.core.remaining"]);
			const remaining = Number.parseInt(out.trim(), 10);
			this.sidecar.immediate(() => {
				this.sidecar.setState(STATE.rateCheckedAt, String(now));
				this.sidecar.setState(STATE.rateRemaining, Number.isFinite(remaining) ? String(remaining) : null);
			});
		}
		const remaining = this.sidecar.state(STATE.rateRemaining);
		this.rateLow = remaining !== null && Number(remaining) < RATE_FLOOR;
		if (this.rateLow) this.o.notice(`GitHub rate limit low (${remaining} core calls left at the hourly read): issue pushes paused`);
	}

	async readDefaultBranch(): Promise<void> {
		const cached = this.sidecar.state(STATE.defaultBranch);
		if (cached) {
			this.defaultBranch = cached;
			return;
		}
		const out = await this.need(["repo", "view", this.repo, "--json", "defaultBranchRef"]);
		let name: unknown;
		try {
			const v: unknown = JSON.parse(out);
			name = v !== null && typeof v === "object" && "defaultBranchRef" in v && v.defaultBranchRef !== null && typeof v.defaultBranchRef === "object" && "name" in v.defaultBranchRef ? v.defaultBranchRef.name : undefined;
		} catch {
			name = undefined;
		}
		if (typeof name !== "string" || name === "") {
			const why = `gh repo view ${this.repo} printed no default branch`;
			this.o.notice(why);
			throw new CallFailed(why);
		}
		this.defaultBranch = name;
		this.sidecar.immediate(() => this.sidecar.setState(STATE.defaultBranch, name));
	}

	async ensureLabels(): Promise<void> {
		if (this.sidecar.state(STATE.labelsCreated) === "1") return;
		const out = await this.need(["label", "list", "-R", this.repo, "--json", "name", "-L", "1000"]);
		let names: string[];
		try {
			const v: unknown = JSON.parse(out);
			names = Array.isArray(v) ? v.flatMap((x) => (x !== null && typeof x === "object" && "name" in x && typeof x.name === "string" ? [x.name.toLowerCase()] : [])) : [];
		} catch {
			names = [];
		}
		for (const label of PROJECTION_LABELS) {
			if (!names.includes(label)) await this.need(["label", "create", label, "-R", this.repo]);
		}
		this.sidecar.immediate(() => this.sidecar.setState(STATE.labelsCreated, "1"));
	}

	/** § 5: map every open same-repo PR to a link, mark what changed, and settle footers already present. */
	async scan(): Promise<void> {
		const s = await scanOpenPrs(this.gh, this.repo);
		if (!s.ok) {
			this.o.notice(`PR scan: ${s.error}`);
			throw new CallFailed(s.error);
		}
		if (s.truncated) {
			this.o.notice(`PR scan: ${s.prs.length} open PRs, the scan's limit; nothing was marked from it`);
			return;
		}
		const candidates = this.sidecar.links().filter((l) => l.repo === this.repoKey && (l.pushed_state === null || l.pushed_state === "open"));
		const mapped: { pr: (typeof s.prs)[number]; link: LinkRow }[] = [];
		const taken = new Set<number>();
		for (const link of candidates) {
			if (!this.ledger.workload(link.workload_id)) continue;
			const src = prSources(this.ledger, link.workload_id);
			for (const pr of s.prs) {
				if (pr.crossRepository || taken.has(pr.number)) continue;
				if (!src.branches.includes(pr.head) && !src.requested.includes(pr.number)) continue;
				taken.add(pr.number);
				mapped.push({ pr, link });
			}
		}
		const openNumbers = new Set(s.prs.map((p) => p.number));
		this.sidecar.immediate(() => {
			const db = this.sidecar.db;
			for (const { pr, link } of mapped) {
				const row = db.query<PrRow, [string, number]>("SELECT * FROM prs WHERE workload_id = ? AND number = ?").get(link.workload_id, pr.number);
				const footed = link.issue_number !== null && hasFooter(pr.body, link.issue_number);
				if (!row) {
					const footer = pr.base !== this.defaultBranch ? "none" : footed ? "done" : "pending";
					db.query("INSERT INTO prs (workload_id, number, url, base, footer) VALUES (?, ?, ?, ?, ?)").run(link.workload_id, pr.number, pr.url, pr.base, footer);
					this.sidecar.markDirty(link.workload_id);
				} else if (row.footer === "pending" && footed) {
					db.query("UPDATE prs SET footer = 'done', fails = 0, next_try_at = 0 WHERE workload_id = ? AND number = ?").run(link.workload_id, pr.number);
				}
			}
			for (const row of this.sidecar.prs()) {
				if (openNumbers.has(row.number)) continue;
				// Merged or closed since the last scan: the push reads the PR set from GitHub's own state.
				db.query("DELETE FROM prs WHERE workload_id = ? AND number = ?").run(row.workload_id, row.number);
				this.sidecar.markDirty(row.workload_id);
			}
		});
	}

	/** Back a PR footer off; parked at `parkAfterFails` (one notice). Ends the tick. */
	failFooter(row: PrRow, n: number, why: string): never {
		const fails = row.fails + 1;
		this.sidecar.immediate(() =>
			this.sidecar.db.query("UPDATE prs SET fails = ?, next_try_at = ? WHERE workload_id = ? AND number = ?").run(fails, this.o.now() + backoffMs(fails), row.workload_id, row.number),
		);
		this.o.notice(why);
		if (fails >= this.o.config.parkAfterFails) this.o.notice(`the Closes #${n} footer on ${row.url} is parked after ${fails} failures: ${why}`);
		throw new CallFailed(why);
	}

	/** § 5 footer edits: each pending default-base PR whose link has an issue number, re-read now so a body edit since the scan is kept. */
	async footers(): Promise<void> {
		const rows = this.sidecar.db
			.query<PrRow, [number, number]>("SELECT * FROM prs WHERE footer = 'pending' AND next_try_at <= ? AND fails < ? ORDER BY workload_id, number")
			.all(this.o.now(), this.o.config.parkAfterFails);
		for (const row of rows) {
			const n = this.sidecar.link(row.workload_id)?.issue_number ?? null;
			if (n === null) continue;
			const view = await this.gh.json(["pr", "view", row.url, "--json", "body"]);
			if (!view.ok) this.failFooter(row, n, view.error);
			const v = view.value;
			if (v === null || typeof v !== "object" || !("body" in v) || typeof v.body !== "string") this.failFooter(row, n, `gh pr view ${row.url} printed no body`);
			const body = v.body;
			if (!hasFooter(body, n)) {
				const edit = await this.gh.run(["pr", "edit", row.url, "--body", body + closesFooter(n)]);
				if (!edit.ok) this.failFooter(row, n, edit.error);
			}
			this.sidecar.immediate(() =>
				this.sidecar.db.query("UPDATE prs SET footer = 'done', fails = 0, next_try_at = 0 WHERE workload_id = ? AND number = ?").run(row.workload_id, row.number),
			);
		}
	}

	// ---- push ----

	/** Back a link off; parked at `parkAfterFails` (one notice). Ends the tick when the failure was a call. */
	failLink(link: LinkRow, why: string): void {
		const fails = link.fails + 1;
		this.sidecar.immediate(() =>
			this.sidecar.db.query("UPDATE links SET fails = ?, next_try_at = ? WHERE workload_id = ?").run(fails, this.o.now() + backoffMs(fails), link.workload_id),
		);
		this.o.notice(why);
		if (fails >= this.o.config.parkAfterFails) this.o.notice(`${link.workload_id}'s issue is parked after ${fails} failed pushes: ${why}`);
	}

	/** Record a successful push: the pushed fields are the render's, the link clean. */
	pushed(workloadId: string, r: Rendered, issueNumber: number): void {
		this.sidecar.immediate(() =>
			this.sidecar.db
				.query(
					`UPDATE links SET issue_number = ?, pushed_hash = ?, pushed_title = ?, pushed_labels = ?, pushed_state = ?,
					        dirty = 0, force = 0, fails = 0, next_try_at = 0 WHERE workload_id = ?`,
				)
				.run(issueNumber, renderHash(r), r.title, JSON.stringify(r.labels), stateText(r), workloadId),
		);
		this.report.pushed++;
	}

	/** An accepted intake issue whose input id the brief quotes and no link holds yet (§ 6.2 binding). */
	boundIntake(brief: string): number | null {
		const rows = this.sidecar.db
			.query<{ issue_number: number; in_id: string }, [string]>(
				"SELECT i.issue_number, i.in_id FROM intake i WHERE i.verdict = ? AND i.in_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM links l WHERE l.issue_number = i.issue_number) ORDER BY i.issue_number",
			)
			.all(INTAKE_ACCEPTED);
		return rows.find((r) => new RegExp(`(^|[^\\w-])${r.in_id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(brief))?.issue_number ?? null;
	}

	/** The lost-create search (§ 3): an as2 issue whose title starts `<id> —`, or null. */
	async findByTitle(workloadId: string): Promise<{ ok: true; number: number | null } | { ok: false; error: string }> {
		const r = await this.gh.json(["issue", "list", "-R", this.repo, "--label", LABEL.as2, "--state", "all", "--search", `"${workloadId} —" in:title`, "--json", "number,title", "-L", "100"]);
		if (!r.ok) return r;
		if (!Array.isArray(r.value)) return { ok: false, error: "gh issue list printed no issue list" };
		for (const x of r.value) {
			if (x !== null && typeof x === "object" && "number" in x && "title" in x && typeof x.number === "number" && typeof x.title === "string" && x.title.startsWith(`${workloadId} —`)) {
				return { ok: true, number: x.number };
			}
		}
		return { ok: true, number: null };
	}

	async pushLink(start: LinkRow): Promise<void> {
		let link = start;
		const id = link.workload_id;
		if (link.repo === null) {
			const repo = await resolveRepo(this.o.exec, this.ledger, id);
			if (repo === null) {
				this.failLink(link, `${id}: git could not read its repo's origin`);
				return;
			}
			this.sidecar.immediate(() => this.sidecar.db.query("UPDATE links SET repo = ?, dirty = ? WHERE workload_id = ?").run(repo, repo === this.repoKey ? 1 : 0, id));
			if (repo !== this.repoKey) return;
			link = { ...link, repo };
		}
		const w = this.ledger.workload(id);
		if (!w) {
			this.sidecar.immediate(() => this.sidecar.deleteLink(id));
			return;
		}
		const set = await readPrSet(this.gh, this.repo, prSources(this.ledger, id));
		if (!set.known) {
			// Unknown set: no render change at all; backed off like a failure.
			this.failLink(link, `${id}: PR set unknown: ${set.why}`);
			throw new CallFailed(set.why);
		}
		const r = renderWorkload(this.ledger, id, set.prs, link.last_seq)!;
		let number = link.issue_number;
		if (number === null) {
			if (r.state === "closed") {
				// Opened and closed while never pushed: an issue is never created only to be closed.
				this.sidecar.immediate(() => this.sidecar.deleteLink(id));
				return;
			}
			let found = this.boundIntake(w.brief);
			if (found === null) {
				const search = await this.findByTitle(id);
				if (!search.ok) {
					this.failLink(link, search.error);
					throw new CallFailed(search.error);
				}
				found = search.number;
			}
			if (found === null) {
				this.gh.fence();
				const created = await this.gh.run(["issue", "create", "-R", this.repo, "--title", r.title, "--body", r.block, ...r.labels.flatMap((l) => ["--label", l])]);
				if (!created.ok) {
					this.failLink(link, created.error);
					throw new CallFailed(created.error);
				}
				const m = /\/issues\/(\d+)\s*$/.exec(created.out.trim());
				if (!m) {
					// The issue may exist: the next push's title search adopts it.
					const why = `gh issue create printed no issue url (${created.out.trim().split("\n")[0] || "no output"})`;
					this.failLink(link, why);
					throw new CallFailed(why);
				}
				this.gh.fence();
				this.pushed(id, r, Number(m[1]));
				return;
			}
			this.gh.fence();
			const adopted = found;
			this.sidecar.immediate(() => this.sidecar.db.query("UPDATE links SET issue_number = ?, force = 1 WHERE workload_id = ?").run(adopted, id));
			number = adopted;
			link = { ...link, issue_number: adopted, force: 1 };
		}
		if (!link.force && renderHash(r) === link.pushed_hash) {
			this.sidecar.immediate(() => this.sidecar.db.query("UPDATE links SET dirty = 0 WHERE workload_id = ?").run(id));
			return;
		}
		await this.edit(link, number, r);
	}

	/** Re-read the remote issue and make it match the render: one edit for fields, then the state. */
	async edit(link: LinkRow, n: number, r: Rendered): Promise<void> {
		const step = async (args: string[]): Promise<unknown> => {
			const out = args[1] === "view" ? await this.gh.json(args) : await this.gh.run(args);
			if (!out.ok) {
				this.failLink(link, out.error);
				throw new CallFailed(out.error);
			}
			return "value" in out ? out.value : out.out;
		};
		const view = await step(["issue", "view", String(n), "-R", this.repo, "--json", "title,body,labels,state,stateReason"]);
		const remote = remoteIssue(view);
		if (remote === null) {
			const why = `gh issue view ${n} printed no issue`;
			this.failLink(link, why);
			throw new CallFailed(why);
		}
		const edits: string[] = [];
		if (remote.title !== r.title) edits.push("--title", r.title);
		const body = mergeBody(remote.body, r.block);
		if (body !== remote.body) edits.push("--body", body);
		const add = r.labels.filter((l) => !remote.labels.includes(l));
		const remove = remote.labels.filter((l) => PROJECTION_LABELS.includes(l) && !r.labels.includes(l));
		if (add.length > 0) edits.push("--add-label", add.join(","));
		if (remove.length > 0) edits.push("--remove-label", remove.join(","));
		if (edits.length > 0) await step(["issue", "edit", String(n), "-R", this.repo, ...edits]);
		const close = ["issue", "close", String(n), "-R", this.repo, "-r", r.reason ?? "completed"];
		const reopen = ["issue", "reopen", String(n), "-R", this.repo];
		if (r.state === "open" && remote.state !== "OPEN") await step(reopen);
		else if (r.state === "closed" && remote.state === "OPEN") await step(close);
		else if (r.state === "closed" && remote.reason !== r.reason) {
			// Closed on both sides with another reason: reopen, then close with the rendered one (§ 3).
			await step(reopen);
			await step(close);
		}
		this.pushed(link.workload_id, r, n);
	}

	async push(): Promise<void> {
		const rows = this.sidecar.db
			.query<LinkRow, [number, number, string]>(
				"SELECT * FROM links WHERE dirty = 1 AND next_try_at <= ? AND fails < ? AND (repo = ? OR repo IS NULL) ORDER BY last_seq, workload_id",
			)
			.all(this.o.now(), this.o.config.parkAfterFails, this.repoKey);
		for (const link of rows) await this.pushLink(link);
	}

	phaseContext(sw: SwitchState): PhaseContext {
		return {
			config: this.o.config,
			sidecar: this.sidecar,
			gh: this.gh,
			ledger: this.ledger,
			exec: this.o.exec,
			now: this.o.now,
			notice: this.o.notice,
			switchState: sw,
			defaultBranch: this.defaultBranch,
			rateLow: this.rateLow,
			prSet: (workloadId) => readPrSet(this.gh, this.repo, prSources(this.ledger, workloadId)),
			renderOf: (workloadId, prs) => renderWorkload(this.ledger, workloadId, prs, this.sidecar.link(workloadId)?.last_seq ?? 0),
		};
	}
}

interface RemoteIssue {
	title: string;
	body: string;
	labels: string[];
	state: string;
	reason: string | null;
}

/** `gh issue view --json title,body,labels,state,stateReason`, or null when it does not have that shape. */
function remoteIssue(v: unknown): RemoteIssue | null {
	if (v === null || typeof v !== "object" || !("title" in v) || !("state" in v)) return null;
	if (typeof v.title !== "string" || typeof v.state !== "string") return null;
	const body = "body" in v && typeof v.body === "string" ? v.body : "";
	const labels = "labels" in v && Array.isArray(v.labels) ? v.labels.flatMap((l: unknown) => (l !== null && typeof l === "object" && "name" in l && typeof l.name === "string" ? [l.name] : [])) : [];
	const raw = "stateReason" in v && typeof v.stateReason === "string" ? v.stateReason.toUpperCase() : "";
	const reason = raw === "COMPLETED" ? "completed" : raw === "NOT_PLANNED" ? "not planned" : null;
	return { title: v.title, body, labels, state: v.state.toUpperCase(), reason };
}

/**
 * One projector tick (header). Never throws for GitHub trouble: a failed call backs off what it was
 * for and ends the tick, a budget or claim stop ends it quietly. A ledger or sidecar error throws
 * to the row, which turns it into one notice.
 */
export async function tick(o: TickOptions): Promise<TickReport> {
	if (!o.sidecar.claim(o.holder, o.now())) return { claimed: false, on: false, seeded: false, ingested: 0, pushed: 0, stopped: null, calls: 0 };
	const t = new Tick(o);
	try {
		const sw = readSwitch(o.ledger);
		t.report.on = sw.on;
		let seeded = o.sidecar.state(STATE.seededAt) !== null;
		if (sw.on && !seeded) {
			await t.seed(sw);
			seeded = true;
		}
		await t.ingest(seeded);
		if (!sw.on) return t.report;
		try {
			await t.rateLimit();
			await t.readDefaultBranch();
			await t.ensureLabels();
			if (!t.rateLow) {
				await t.scan();
				await t.footers();
				await t.push();
			}
			const ctx = t.phaseContext(sw);
			for (const [name, phase] of [["reconcile", o.phases?.reconcile], ["intake", o.phases?.intake]] as const) {
				if (!phase) continue;
				try {
					await phase(ctx);
				} catch (err) {
					if (err instanceof TickStop || err instanceof CallFailed) throw err;
					o.notice(`the ${name} phase failed: ${String(err instanceof Error ? err.message : err)}`);
				}
			}
		} catch (err) {
			if (err instanceof TickStop) t.report.stopped = err.reason;
			else if (err instanceof CallFailed) t.report.stopped = "failed";
			else throw err;
		}
		return t.report;
	} finally {
		t.report.calls = t.gh.calls;
		o.sidecar.release(o.holder);
	}
}
