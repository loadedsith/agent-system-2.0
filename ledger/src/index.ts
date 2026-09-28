// agent-system 2.0 ledger: the single writer contract (SPEC-2.0.md § B2).
// Plain bun:sqlite; no OMP import, so a `bun run` script and an OMP extension use it alike.
// The rules live in ../schema.sql; this module adds ids, stamps, retries and the read queries.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assertLocalPath, defaultLedgerPath } from "./locality";

export {
	assertLocalPath,
	DEFAULT_LEDGER_RELATIVE,
	defaultLedgerPath,
	LEDGER_DB_ENV,
	LedgerLocationError,
	mountLocality,
} from "./locality";

export const SCHEMA_VERSION = 1;
export const SCHEMA_PATH = join(import.meta.dir, "..", "schema.sql");

export type Stakes = "throwaway" | "normal" | "production";
export type Mode = "autonomous" | "user-driven";
export type SliceState = "open" | "paused" | "done" | "cancelled";
export type MessageState = "held" | "delivered" | "consumed" | "acted-on";
export type QuestionState = "open" | "answered" | "withdrawn";
export type InstructionKind = "instruction" | "answer" | "withdrawal" | "mode-flip";
export type Channel = "surface" | "direct";

/** `by` on every write is the lane instance doing the write: the provenance the file demands. */
export interface Stamp {
	by: string;
}

export interface WorkloadRow {
	id: string;
	brief: string;
	stakes: Stakes;
	mode: Mode;
	status: "open" | "closed";
	holder: string | null;
	holder_lease_until: string | null;
	closed_at: string | null;
	created_by: string;
	created_at: string;
	changed_by: string;
	changed_at: string;
	rev: number;
}
export interface WorkloadStatusRow extends WorkloadRow {
	last_activity_at: string;
	open_slices: number;
	paused_slices: number;
	open_questions: number;
	held_messages: number;
	oldest_held_at: string | null;
}
export interface SliceRow {
	id: string;
	workload_id: string;
	task: string;
	done_condition: string;
	inputs: string;
	state: SliceState;
	artifact: string | null;
	created_by: string;
	created_at: string;
	changed_by: string;
	changed_at: string;
	rev: number;
}
export interface MessageRow {
	id: string;
	workload_id: string;
	slice_id: string | null;
	sender: string;
	recipient: string;
	body: string;
	state: MessageState;
	created_by: string;
	created_at: string;
	changed_by: string;
	changed_at: string;
	rev: number;
}
export interface QuestionRow {
	id: string;
	workload_id: string;
	slice_id: string;
	body: string;
	options: string;
	state: QuestionState;
	resolved_by: string | null;
	created_by: string;
	created_at: string;
	changed_by: string;
	changed_at: string;
	rev: number;
}
export interface InstructionRow {
	id: string;
	workload_id: string;
	slice_id: string | null;
	kind: InstructionKind;
	question_id: string | null;
	channel: Channel;
	author: string;
	body: string;
	created_by: string;
	created_at: string;
}
export interface ProvenanceRow {
	seq: number;
	at: string;
	workload_id: string;
	lane_instance: string;
	tbl: string;
	row_id: string;
	action: "insert" | "update";
	detail: string | null;
}
export interface OldestHeld {
	id: string;
	workload_id: string;
	enqueued_at: string;
	age_seconds: number;
}
export interface InFlightWorkload {
	workload: WorkloadStatusRow;
	slices: SliceRow[];
	openQuestions: (Omit<QuestionRow, "options"> & { options: string[] })[];
	pendingMessages: MessageRow[];
}

export interface OpenOptions {
	/** Create the file and apply the schema when missing. Default false. */
	create?: boolean;
	/** busy_timeout in ms, set before anything else on the connection. Default 5000. */
	busyTimeoutMs?: number;
	/** Extra attempts after SQLITE_BUSY on a write. Default 5. */
	busyRetries?: number;
	/** Clock for stamps; must return ISO-8601 UTC with milliseconds. Default Date#toISOString. */
	clock?: () => string;
	/** Skip the synced/network-folder refusal. Only for ":memory:"-like test paths; default false. */
	skipLocalityCheck?: boolean;
}

const ID_PREFIX = { workload: "wl", slice: "sl", message: "msg", question: "q", instruction: "in" } as const;

/** `<prefix>-<ms since epoch, base36><6 random base36>`: sortable by creation, short enough to type. */
export function newId(kind: keyof typeof ID_PREFIX): string {
	const rand = crypto.getRandomValues(new Uint32Array(2));
	const tail = ((rand[0]! * 2 ** 32 + rand[1]!) % 36 ** 6).toString(36).padStart(6, "0");
	return `${ID_PREFIX[kind]}-${Date.now().toString(36)}${tail}`;
}

export class Ledger {
	readonly db: Database;
	readonly path: string;
	private readonly clock: () => string;
	private readonly busyRetries: number;

	private constructor(db: Database, path: string, opts: OpenOptions) {
		this.db = db;
		this.path = path;
		this.clock = opts.clock ?? (() => new Date().toISOString());
		this.busyRetries = opts.busyRetries ?? 5;
	}

	/**
	 * Open the ledger at `path` (default: $AGENT_SYSTEM_LEDGER_DB or $HOME/.agent-system-2/ledger.db).
	 * Every connection: busy_timeout first, then foreign_keys, then WAL is verified.
	 */
	static open(path: string = defaultLedgerPath(), opts: OpenOptions = {}): Ledger {
		if (!opts.skipLocalityCheck) assertLocalPath(path);
		const fresh = !existsSync(path);
		if (fresh && !opts.create) throw new Error(`no ledger at ${path}; open with { create: true } or run the install script`);
		if (fresh) mkdirSync(dirname(path), { recursive: true });
		const db = new Database(path, { readwrite: true, create: !!opts.create, strict: true });
		try {
			db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.trunc(opts.busyTimeoutMs ?? 5000))}`);
			db.exec("PRAGMA foreign_keys = ON");
			const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()!.user_version;
			if (version === 0) {
				if (!opts.create) throw new Error(`ledger at ${path} has no schema; open with { create: true }`);
				db.exec(readFileSync(SCHEMA_PATH, "utf8"));
			} else if (version !== SCHEMA_VERSION) {
				throw new Error(`ledger at ${path} is schema version ${version}; this module speaks ${SCHEMA_VERSION}`);
			}
			const mode = db.query<{ journal_mode: string }, []>("PRAGMA journal_mode").get()!.journal_mode;
			if (mode !== "wal") db.exec("PRAGMA journal_mode = WAL");
		} catch (e) {
			db.close();
			throw e;
		}
		return new Ledger(db, path, opts);
	}

	close(): void {
		this.db.close();
	}

	now(): string {
		return this.clock();
	}

	/** Run `fn` in BEGIN IMMEDIATE, retrying the whole transaction on SQLITE_BUSY (BEGIN or COMMIT). */
	write<T>(fn: () => T): T {
		for (let attempt = 0; ; attempt++) {
			try {
				return this.db.transaction(fn).immediate();
			} catch (e) {
				const busy = e instanceof Error && "code" in e && typeof e.code === "string" && e.code.startsWith("SQLITE_BUSY");
				if (!busy || attempt >= this.busyRetries) throw e;
				Bun.sleepSync(Math.min(1000, 25 * 2 ** attempt));
			}
		}
	}

	// ---- workloads -------------------------------------------------------------------------

	openWorkload(input: Stamp & { brief: string; stakes: Stakes; mode: Mode; id?: string }): string {
		const id = input.id ?? newId("workload");
		const t = this.now();
		this.write(() =>
			this.db.query(
				`INSERT INTO workloads (id, brief, stakes, mode, created_by, created_at, changed_by, changed_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			).run(id, input.brief, input.stakes, input.mode, input.by, t, input.by, t),
		);
		return id;
	}

	/**
	 * Claim (or renew) the workload for `holder` with a lease of `leaseMs` (null: no expiry, e.g. Jo).
	 * Wins when the workload is open and unheld, already held by `holder`, or its lease has expired
	 * (reclaim). Otherwise returns the current holder; the file refuses a steal regardless.
	 */
	claimWorkload(id: string, input: Stamp & { holder: string; leaseMs: number | null }):
		{ won: true } | { won: false; holder: string | null; status: string | null } {
		const t = this.now();
		const until = input.leaseMs === null ? null : new Date(Date.parse(t) + input.leaseMs).toISOString();
		return this.write(() => {
			const won = this.db.query(
				`UPDATE workloads SET holder = ?, holder_lease_until = ?, changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1
				 WHERE id = ? AND status = 'open' AND (holder IS NULL OR holder = ?
				   OR (holder_lease_until IS NOT NULL AND holder_lease_until < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
				 RETURNING id`,
			).all(input.holder, until, input.by, t, id, input.holder);
			if (won.length === 1) return { won: true as const };
			const row = this.db.query<{ holder: string | null; status: string }, [string]>(
				"SELECT holder, status FROM workloads WHERE id = ?",
			).get(id);
			return { won: false as const, holder: row?.holder ?? null, status: row?.status ?? null };
		});
	}

	releaseWorkload(id: string, input: Stamp): void {
		const t = this.now();
		this.write(() => this.expectOne(
			`UPDATE workloads SET holder = NULL, holder_lease_until = NULL, changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1
			 WHERE id = ? RETURNING id`, [input.by, t, id], `workload ${id}`));
	}

	setStakes(id: string, input: Stamp & { stakes: Stakes }): void {
		const t = this.now();
		this.write(() => this.expectOne(
			`UPDATE workloads SET stakes = ?, changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1 WHERE id = ? RETURNING id`,
			[input.stakes, input.by, t, id], `workload ${id}`));
	}

	/** Flip mode: the mode-flip instruction and the flip land in one transaction (§ B13.1). */
	flipMode(id: string, input: Stamp & { mode: Mode; author: string; channel: Channel }): string {
		return this.write(() => {
			const instructionId = this.insertInstruction({
				workloadId: id, kind: "mode-flip", body: input.mode, author: input.author, channel: input.channel, by: input.by,
			});
			const t = this.now();
			this.expectOne(
				`UPDATE workloads SET mode = ?, changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1 WHERE id = ? RETURNING id`,
				[input.mode, input.by, t, id], `workload ${id}`);
			return instructionId;
		});
	}

	closeWorkload(id: string, input: Stamp): void {
		const t = this.now();
		this.write(() => this.expectOne(
			`UPDATE workloads SET status = 'closed', closed_at = max(changed_at, ?), holder = NULL, holder_lease_until = NULL,
			   changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1
			 WHERE id = ? RETURNING id`, [t, input.by, t, id], `workload ${id}`));
	}

	workload(id: string): WorkloadStatusRow | null {
		return this.db.query<WorkloadStatusRow, [string]>("SELECT * FROM workload_status WHERE id = ?").get(id);
	}

	// ---- slices ----------------------------------------------------------------------------

	addSlice(input: Stamp & { workloadId: string; task: string; doneCondition: string; inputs: string; id?: string }): string {
		const id = input.id ?? newId("slice");
		const t = this.now();
		this.write(() => this.db.query(
			`INSERT INTO slices (id, workload_id, task, done_condition, inputs, created_by, created_at, changed_by, changed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(id, input.workloadId, input.task, input.doneCondition, input.inputs, input.by, t, input.by, t));
		return id;
	}

	/** Close a slice on its runtime artifact (§ B1). */
	completeSlice(id: string, input: Stamp & { artifact: string }): void {
		this.setSliceState(id, "done", input.by, input.artifact);
	}

	cancelSlice(id: string, input: Stamp): void {
		this.setSliceState(id, "cancelled", input.by, null);
	}

	/** Replan after a withdrawal: a paused slice with no open question runs again. */
	resumeSlice(id: string, input: Stamp): void {
		this.setSliceState(id, "open", input.by, null);
	}

	slice(id: string): SliceRow | null {
		return this.db.query<SliceRow, [string]>("SELECT * FROM slices WHERE id = ?").get(id);
	}

	private setSliceState(id: string, state: SliceState, by: string, artifact: string | null): void {
		const t = this.now();
		this.write(() => this.expectOne(
			`UPDATE slices SET state = ?, artifact = ?, changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1
			 WHERE id = ? RETURNING id`, [state, artifact, by, t, id], `slice ${id}`));
	}

	// ---- messages --------------------------------------------------------------------------

	enqueue(input: Stamp & { workloadId: string; sliceId?: string | null; sender: string; recipient: string; body: string; id?: string }): string {
		const id = input.id ?? newId("message");
		const t = this.now();
		this.write(() => this.db.query(
			`INSERT INTO messages (id, workload_id, slice_id, sender, recipient, body, created_by, created_at, changed_by, changed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(id, input.workloadId, input.sliceId ?? null, input.sender, input.recipient, input.body, input.by, t, input.by, t));
		return id;
	}

	/** One step forward: held -> delivered -> consumed -> acted-on. The file refuses anything else. */
	advanceMessage(id: string, to: Exclude<MessageState, "held">, input: Stamp): void {
		const t = this.now();
		this.write(() => this.expectOne(
			`UPDATE messages SET state = ?, changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1 WHERE id = ? RETURNING id`,
			[to, input.by, t, id], `message ${id}`));
	}

	message(id: string): MessageRow | null {
		return this.db.query<MessageRow, [string]>("SELECT * FROM messages WHERE id = ?").get(id);
	}

	// ---- instructions ----------------------------------------------------------------------

	/** Jo's instruction to a lane (§ B5), from the surface or a direct session. */
	recordInstruction(input: Stamp & { workloadId: string; sliceId?: string | null; body: string; author: string; channel: Channel }): string {
		return this.write(() => this.insertInstruction({ ...input, kind: "instruction" }));
	}

	instructions(workloadId: string): InstructionRow[] {
		return this.db.query<InstructionRow, [string]>(
			"SELECT * FROM instructions WHERE workload_id = ? ORDER BY created_at, rowid").all(workloadId);
	}

	private insertInstruction(input: Stamp & {
		workloadId: string; sliceId?: string | null; kind: InstructionKind; questionId?: string | null;
		body: string; author: string; channel: Channel;
	}): string {
		const id = newId("instruction");
		const t = this.now();
		this.db.query(
			`INSERT INTO instructions (id, workload_id, slice_id, kind, question_id, channel, author, body, created_by, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(id, input.workloadId, input.sliceId ?? null, input.kind, input.questionId ?? null, input.channel,
			input.author, input.body, input.by, t);
		return id;
	}

	// ---- questions -------------------------------------------------------------------------

	/** A lane-raised question (§ B3 item 5). The file pauses its slice in the same statement. */
	raiseQuestion(input: Stamp & { workloadId: string; sliceId: string; body: string; options: string[]; id?: string }): string {
		const id = input.id ?? newId("question");
		const t = this.now();
		this.write(() => this.db.query(
			`INSERT INTO questions (id, workload_id, slice_id, body, options, created_by, created_at, changed_by, changed_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(id, input.workloadId, input.sliceId, input.body, JSON.stringify(input.options), input.by, t, input.by, t));
		return id;
	}

	/** Jo's answer: an answer instruction, then the question resolved by it; the file resumes the slice. */
	answerQuestion(questionId: string, input: Stamp & { answer: string; author: string; channel: Channel }): string {
		return this.resolveQuestion(questionId, "answer", input.answer, input);
	}

	/**
	 * Jo's withdrawal: never counts as approval. `then` says what happens to the paused slice:
	 * "cancel" closes it, "replan" lets it run again.
	 */
	withdrawQuestion(questionId: string, input: Stamp & { reason: string; author: string; channel: Channel; then: "cancel" | "replan" }): string {
		return this.write(() => {
			const instructionId = this.resolveQuestion(questionId, "withdrawal", input.reason, input);
			const sliceId = this.db.query<{ slice_id: string }, [string]>("SELECT slice_id FROM questions WHERE id = ?").get(questionId)!.slice_id;
			const stillOpen = this.db.query("SELECT 1 FROM questions WHERE slice_id = ? AND state = 'open'").get(sliceId);
			if (!stillOpen) this.setSliceState(sliceId, input.then === "cancel" ? "cancelled" : "open", input.by, null);
			return instructionId;
		});
	}

	question(id: string): QuestionRow | null {
		return this.db.query<QuestionRow, [string]>("SELECT * FROM questions WHERE id = ?").get(id);
	}

	private resolveQuestion(questionId: string, kind: "answer" | "withdrawal", body: string,
		input: Stamp & { author: string; channel: Channel }): string {
		return this.write(() => {
			const q = this.db.query<{ workload_id: string; slice_id: string }, [string]>(
				"SELECT workload_id, slice_id FROM questions WHERE id = ?").get(questionId);
			if (!q) throw new Error(`no question ${questionId}`);
			const instructionId = this.insertInstruction({
				workloadId: q.workload_id, sliceId: q.slice_id, kind, questionId, body,
				author: input.author, channel: input.channel, by: input.by,
			});
			const t = this.now();
			this.expectOne(
				`UPDATE questions SET state = ?, resolved_by = ?, changed_by = ?, changed_at = max(changed_at, ?), rev = rev + 1
				 WHERE id = ? RETURNING id`,
				[kind === "answer" ? "answered" : "withdrawn", instructionId, input.by, t, questionId], `question ${questionId}`);
			return instructionId;
		});
	}

	// ---- queries ---------------------------------------------------------------------------

	/**
	 * What is in flight (wake, § B7): every open workload with its open/paused slices, every open
	 * question (rendered regardless of any last-N window, § B3 item 5), and every message not yet
	 * acted on, oldest first.
	 */
	inFlight(): InFlightWorkload[] {
		const workloads = this.db.query<WorkloadStatusRow, []>(
			"SELECT * FROM workload_status WHERE status = 'open' ORDER BY created_at, id").all();
		return workloads.map((workload) => ({
			workload,
			slices: this.db.query<SliceRow, [string]>(
				"SELECT * FROM slices WHERE workload_id = ? AND state IN ('open', 'paused') ORDER BY created_at, id").all(workload.id),
			openQuestions: this.db.query<QuestionRow, [string]>(
				"SELECT * FROM questions WHERE workload_id = ? AND state = 'open' ORDER BY created_at, id").all(workload.id)
				.map((q) => ({ ...q, options: JSON.parse(q.options) as string[] })),
			pendingMessages: this.db.query<MessageRow, [string]>(
				"SELECT * FROM messages WHERE workload_id = ? AND state <> 'acted-on' ORDER BY created_at, id").all(workload.id),
		}));
	}

	/** The oldest held message and its age at `at` (§ B3), or null when nothing is held. */
	oldestHeld(at: string = this.now(), workloadId?: string): OldestHeld | null {
		const sql = `SELECT id, workload_id, created_at AS enqueued_at,
		               round((julianday(?1) - julianday(created_at)) * 86400.0, 3) AS age_seconds
		             FROM messages WHERE state = 'held' ${workloadId ? "AND workload_id = ?2" : ""}
		             ORDER BY created_at, id LIMIT 1`;
		const q = this.db.query<OldestHeld, [string] | [string, string]>(sql);
		return (workloadId ? q.get(at, workloadId) : q.get(at)) ?? null;
	}

	provenance(workloadId: string): ProvenanceRow[] {
		return this.db.query<ProvenanceRow, [string]>(
			"SELECT * FROM provenance WHERE workload_id = ? ORDER BY seq").all(workloadId);
	}

	/** The second copy (§ B2 prior art e): a consistent snapshot via VACUUM INTO. Never `cp` a WAL file. */
	backup(destPath: string): void {
		if (existsSync(destPath)) throw new Error(`backup target ${destPath} exists`);
		mkdirSync(dirname(destPath), { recursive: true });
		this.db.query("VACUUM INTO ?").run(destPath);
	}

	private expectOne(sql: string, params: (string | number | null)[], what: string): void {
		if (this.db.query(sql).all(...params).length !== 1) throw new Error(`no ${what}`);
	}
}
