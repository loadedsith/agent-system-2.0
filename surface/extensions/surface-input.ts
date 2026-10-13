// Jo's short inputs at the surface (SPEC-2.0.md § A1.2, § B3 item 5, § B13.1): a stakes or mode
// word, an option name, `withdraw`, `approve <id>` / `deny <id>`, `ceiling <usd> [<hours>] [wl-…]`
// (up to four words, never read as a batch), `rounds <n> [wl-…]` (up to three words, never read as
// a batch), `stop-reviews [wl-… | sl-…]` (PLAN wl-mupu0sx2o046io D9, D10), or a numbered batch
// answering needs-you lines by their session number ("1 approve, 2 deny", or one per line;
// MIGRATION.md § M7 follow-ups item 1). Read
// from the turn's prompt in `before_agent_start` rather than from the
// `input` event, because OMP emits `input` only from the interactive TUI
// (modes/controllers/input-controller.ts:966) and the surface has to behave the same from the TUI,
// an rpc front-end and `omp -p`. Every current answerable line is numbered first (the session's
// Numbering, surface/src/numbering.ts), so a number or a "which one?" refusal always names the row
// Jo sees. A numbered batch of any length applies every valid piece and skips only the bad ones
// (PLAN wl-mv66ylg1op3wg0 D9): a number not given, a row no longer waiting, a word the row does not
// take, a number given twice (every piece with it). The valid pieces apply in one transaction, each
// through apply() in its own nested transaction (a savepoint), so a piece the ledger refuses rolls
// back alone and is skipped with the ledger's reason; one ledger row per applied answer. The echo is
// `#n → <receipt>` per applied piece and `#n skipped: <reason>` per skipped one, in batch order; a
// batch whose every piece is skipped writes nothing. A single word or word pair is applied as before, except that a bare answer word
// fitting more than one row, or a bare stakes, mode, `ceiling`, `rounds` or `stop-reviews` word
// with more than one workload in view, is refused with "which one?" and writes nothing. Everything is applied
// through the ledger module as author "jo", channel "surface" (§ B5), Jo is notified at once, and
// the echo lines are queued for the wake row (registered after this one) to put in the turn's
// context, so the model's reply reflects the new state. Anything not recognised passes through
// untouched.
//
// A paste of several lines (MIGRATION.md item 48; surface/src/input.ts interpretPaste): one
// command per line, each read with the rules above and applied in one transaction, in order; a
// numbered batch one per line goes this way too (the comma form on one line is item 1's batch).
// Numbered pieces follow the skip rule above, across every line of the paste, and never refuse it.
// A command line that is not numbered is checked whole with the paste: one naming an id that does
// not resolve (`approve en-nope`), an ambiguous or refused word, or a row resolved twice refuses the
// paste rather than passing as prose; a refused paste writes nothing and echoes one verdict per
// command line, naming the line's number and text, with the "which one?" wording above. Such a
// command the ledger refuses inside the transaction is named by its line the same way, and nothing
// is applied; a launch that fails
// after the commit is named after the applied lines, never as a refusal. Each plain-words run
// between commands is its own Jo input row, written with the commands: when Jo typed the whole
// paste (the rule for prose below, read once for all of it) and there is something it could answer
// or instruct, each run is written inside the paste's transaction, in paste order, as an
// `instruction` row by Jo on the standing workload, body = the run's text. Only after the commit is
// each row's `surface-jo-input` entry appended and its `in-…` id echoed, named by the run's line
// span, for orchestrator_record_instruction to spend. A refused paste, or one the ledger refuses
// inside its transaction, writes no row and names no id; a paste Jo did not type (or with nothing
// open) applies its commands and names each run with no row written. A paste with no command line
// at all is prose.
//
// Jo's prose as a receipt (Codex review of PR #55, B1; MIGRATION.md item 105 fix round 1): while an
// orchestrator question is open or a workload besides the standing one is, a prompt that applies as
// no command and that Jo typed (OMP's `input` event, source interactive or rpc — never the hidden
// session-stop continuation, an aside, or `omp -p`, which emit none) is written first as an
// `instruction` row by Jo on the standing workload, body = the prompt, and its `in-…` id is echoed
// into the turn's context. That row is the one authority orchestrator_record_instruction may
// resolve a question or record an instruction with (naming questionId or workloadId, and inputId):
// Jo's words reach the ledger from that row, never from the model's parameters. No `input` event,
// or a prompt the `input` text does not match, writes nothing: the model then has no receipt, and
// Jo answers by `<option> q-…` or instructs by a lane's word instead (fail closed).
//
// Lane launcher (DESIGN-lane-launcher.md decisions 7 and 9): an answer or a withdrawal is a
// resolution a parked lane resumes on, so the launch trigger runs after it (once per workload for
// a batch; `stop-reviews` withdraws the open review questions on its loops, so it runs it too); a
// flip to autonomous writes Jo's `launch-requested:` cause and runs the trigger; a flip
// to user-driven while an autonomous lane holds the workload writes the `lane-stop:` request the
// runner accepts.
//
// Surface words (PLAN wl-mv5msri070p0qo D1, D4), each only as the whole trimmed input: `pending`
// and `brb` are read from the `input` event and handled there, so OMP drops them and no turn starts
// (`pending` shows the block of every open answer line as a `surface-pending` message, queued for
// the next idle poll while the session streams; `brb` holds the routine needs-you pushes). `back`
// reaches the model, and the wake row reads it in its `before_agent_start`.
import type { Ledger } from "../../ledger/src/index";
import { AWAY_NOTICE, pendingText, surfaceWord } from "../src/batch";
import { errorLines } from "../src/errors";
import { ensureStandingWorkload, standingSlice } from "../src/identity";
import { apply, type BatchPiece, type Command, commandShaped, interpret, interpretBatch, interpretPaste, isSkip, type PasteInstruction } from "../src/input";
import { heldLive, laneStopRequestBody, launchRequestedBody } from "../src/launch";
import { oneLinerCore } from "../src/render";
import { type SurfaceSession, surfaceSession } from "../src/session";
import { type Ctx, RECORD_INSTRUCTION_TOOL, STANDING_WORKLOAD_ID, type SurfaceAPI, SURFACE_BY } from "../src/types";
import { triggerLaunch } from "./launch";

/** The workload an answer or a withdrawal resolves (a parked lane resumes on it), else null; `stop-reviews` withdraws the review questions on its loops. */
const resumes = (cmd: Command): string | null => (cmd.kind === "answer" || cmd.kind === "withdraw" || cmd.kind === "stop-reviews" ? cmd.workloadId : null);

/** The workload the launch trigger runs for after `cmd`: one a resolution resumes, or one a flip to autonomous hands to a lane; else null. */
const launches = (cmd: Command): string | null => resumes(cmd) ?? (cmd.kind === "mode" && cmd.mode === "autonomous" ? cmd.workloadId : null);

/** `line 5` or `lines 5–7`: the span of a paste's plain-words run. */
const span = (i: PasteInstruction): string => (i.from === i.to ? `line ${i.from}` : `lines ${i.from}–${i.to}`);

/** An error as the surface reports it: the message, without the class name a String() would prefix. */
const reason = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** A skipped numbered piece's echo line (D9). */
const skipLine = (n: number, why: string): string => `#${n} skipped: ${why}`;

/**
 * Apply one piece of a numbered batch inside the caller's `ledger.write` (D9): a skipped piece is
 * its `#n skipped: <reason>` line; a valid one goes through `apply()` in its own nested
 * transaction (a savepoint), so a ledger refusal rolls back that piece alone and skips it with the
 * ledger's message while the others stay applied. Returns the echo line and the workload the
 * launch trigger runs for (an applied piece's only).
 */
function applyPiece(ledger: Ledger, p: BatchPiece): { wl: string | null; line: string } {
	if (isSkip(p)) return { wl: null, line: skipLine(p.n, p.skip) };
	try {
		const receipt = ledger.write(() => apply(ledger, p.cmd));
		return { wl: launches(p.cmd), line: `#${p.n} → ${receipt}` };
	} catch (err) {
		return { wl: null, line: skipLine(p.n, reason(err)) };
	}
}

/** A numbered line's verdict in a refused paste: `ok, not applied` when every piece is valid, else each piece ok or skipped. */
const piecesVerdict = (pieces: readonly BatchPiece[]): string =>
	pieces.some(isSkip) ? pieces.map((p) => (isSkip(p) ? skipLine(p.n, p.skip) : `#${p.n} ok, not applied`)).join("; ") : "ok, not applied";

/** Jo typed this prompt (see the header): OMP's `input` text for the turn, outer whitespace aside, is the prompt. */
const joTyped = (typed: string | null, text: string): boolean => typed !== null && typed.trim() === text;

/**
 * What a Jo input row could answer or instruct (see the header): the ids of the standing workload's
 * open questions (empty when only a workload besides the standing one is open, to instruct), or null
 * when there is nothing and no row is written.
 */
function receivable(ledger: Ledger): string[] | null {
	const inFlight = ledger.inFlight();
	const open = inFlight.find((w) => w.workload.id === STANDING_WORKLOAD_ID)?.openQuestions.map((q) => q.id) ?? [];
	return open.length > 0 || inFlight.some((w) => w.workload.id !== STANDING_WORKLOAD_ID) ? open : null;
}

/** Write `body` as Jo's input row on the standing workload (ensured first), in the caller's transaction; returns its `in-…` id. */
function writeJoInput(ledger: Ledger, body: string): string {
	ensureStandingWorkload(ledger);
	return ledger.recordInstruction({ by: SURFACE_BY, workloadId: STANDING_WORKLOAD_ID, sliceId: standingSlice(ledger)?.id ?? null, body, author: "jo", channel: "surface" });
}

/** What the recorder does with input `id`, `open` the standing questions it could answer: the tail of every Jo-input echo line. */
function recorderTail(id: string, open: string[]): string {
	const answer = open.length > 0 ? `if they answer ${open.join(" or ")}, record that with ${RECORD_INSTRUCTION_TOOL} naming questionId and inputId ${id}; ` : "";
	return `${answer}if they instruct you about an open workload, record that with ${RECORD_INSTRUCTION_TOOL} naming workloadId and inputId ${id} (Jo's words are read from the row, never from your parameters); if they do neither, record nothing`;
}

/**
 * A paste run's echo line: `lines 4–6 are Jo's input in-…: "<text>" — <recorderTail>`, or, with no
 * row written (`input` null), the run and why: Jo did not type the paste, or (`typed`) nothing was
 * open for it to answer or instruct.
 */
function runLine(run: PasteInstruction, input: string | null, open: string[], typed: boolean): string {
	const words = run.text.replace(/\s*\n\s*/g, " ");
	if (input === null) return `${span(run)} → an instruction for you, no input row written (${typed ? "nothing open it could answer or instruct" : "this paste was not typed by Jo"}): "${words}"`;
	return `${span(run)} ${run.from === run.to ? "is" : "are"} Jo's input ${input}: "${words}" — ${recorderTail(input, open)}`;
}

/** A paste's echo line; a plain-words run carries its Jo input row's id (null: none written), its line filled in the transaction and shown only after the commit. */
type PasteEcho = { wl: string | null; line: string; run?: { item: PasteInstruction; input: string | null } };

/**
 * Apply one word command: `apply`, plus the control entry a mode flip implies, in the caller's
 * transaction (decision 6; Codex review S3): a flip to autonomous without its `launch-requested:`
 * would leave a relaunch nothing to consume; a flip to user-driven while an autonomous lane holds
 * the workload writes the `lane-stop:` request the runner accepts.
 */
function applyOne(ledger: Ledger, cmd: Command): string {
	let r = apply(ledger, cmd);
	if (cmd.kind === "mode") {
		const w = ledger.workload(cmd.workloadId);
		if (cmd.mode === "user-driven" && w && w.holder?.startsWith("lane-") && heldLive(w, ledger.now())) {
			ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: laneStopRequestBody(w.holder, "mode-flip", "jo") });
			r += `; stop requested of ${w.holder} (it accepts at its next poll)`;
		} else if (cmd.mode === "autonomous") {
			ledger.recordEntry({ by: SURFACE_BY, workloadId: cmd.workloadId, kind: "assumption", body: launchRequestedBody("jo", ledger.now(), "mode-flip") });
		}
	}
	return r;
}

/** A ledger refusal inside a paste's transaction, carrying the line it happened on. */
class LineFailure extends Error {
	constructor(
		readonly line: number,
		readonly text: string,
		readonly cause: unknown,
	) {
		super(String(cause));
	}
}

/** `body` cut to 60 characters, `…` marking the cut. */
const clip = (body: string): string => (body.length > 60 ? `${body.slice(0, 59)}…` : body);

/**
 * `which one? "approve" fits #1 (reserved en-…: push main), #2 (q-… on sl-…) — answer with the number, e.g. "1 approve"`;
 * a workload word: `which one? "production" fits wl-a (Fix the header; stakes: normal · mode: autonomous · ceiling $50 / 6h), wl-b (…) — add the id, e.g. "production wl-a"`.
 */
function whichOne(ledger: Ledger, s: SurfaceSession, cmd: Extract<Command, { kind: "ambiguous" }>): string {
	const fits = cmd.candidates.map((t) => {
		if (t.kind === "workload") {
			const w = ledger.workload(t.workloadId);
			return w ? `${t.workloadId} (${clip(w.brief.split("\n")[0]!)}; ${oneLinerCore(ledger, w)})` : t.workloadId;
		}
		const n = s.numbering.numberOf(t.rowId);
		const num = n === null ? "" : `#${n} `;
		if (t.kind === "reserved") {
			const body = ledger.entries(t.workloadId, "reserved-request").find((e) => e.id === t.rowId)?.body ?? "";
			return `${num}(reserved ${t.rowId}: ${clip(body)})`;
		}
		return `${num}(${t.rowId} on ${ledger.question(t.rowId)?.slice_id ?? "?"})`;
	});
	const rows = cmd.candidates.flatMap((t) => (t.kind === "workload" ? [] : [t]));
	if (rows.length === 0) return `which one? "${cmd.word}" fits ${fits.join(", ")} — add the id, e.g. "${cmd.word} ${cmd.candidates[0]!.workloadId}"`;
	const first = s.numbering.numberOf(rows[0]!.rowId) ?? 1;
	return `which one? "${cmd.word}" fits ${fits.join(", ")} — answer with the number, e.g. "${first} ${cmd.word}"`;
}

/** Show the `pending` block (D1): one `surface-pending` message, no turn; a ledger that cannot be read is said in its place. */
export function showPending(pi: SurfaceAPI, s: SurfaceSession): void {
	let content: string;
	try {
		content = pendingText(s.ledger());
	} catch (err) {
		content = `## pending: the ledger could not be read: ${String(err)}`;
	}
	pi.sendMessage?.({ customType: "surface-pending", content, display: true }, {});
}

export default function surfaceInputRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	/** Queue the echo lines for the next turn's context, record the input once, notify each line (a skipped number or a failure as a warning). */
	const echo = (s: SurfaceSession, ctx: Ctx, text: string, lines: string[], level: "info" | "warning"): void => {
		s.notices.push(...lines);
		pi.appendEntry("surface-input", { text, receipt: lines.join("\n") });
		for (const l of lines) ctx.ui.notify(l, level === "warning" || l.startsWith("could not") || /^#\d+ skipped: /.test(l) ? "warning" : "info");
	};

	/**
	 * The Jo-input row for a prose prompt (see the header): written only when Jo typed this prompt
	 * and there is something it could answer or instruct (an open orchestrator question, or an open
	 * workload besides the standing one), its id echoed for the recorder. `ledger` is the turn's
	 * handle when the prompt was read against the ledger already, else opened here.
	 */
	const joInputRow = (s: SurfaceSession, ctx: Ctx, text: string, typed: string | null, ledger: Ledger | null): void => {
		if (!joTyped(typed, text)) return;
		try {
			const l = ledger ?? s.ledger();
			const open = receivable(l);
			if (open === null) return;
			const id = l.write(() => writeJoInput(l, text));
			pi.appendEntry("surface-jo-input", { id });
			echo(s, ctx, text, [`Jo's words above are input ${id}: ${recorderTail(id, open)}`], "info");
		} catch (err) {
			echo(s, ctx, text, [`could not write Jo's words as an input row: ${reason(err)}`], "warning");
		}
	};

	// The surface words (PLAN wl-mv5msri070p0qo D1, D4), each only as the whole input: `pending` and `brb` are handled here and take no
	// turn (OMP drops a handled input); `back` goes on to the model and is read in the wake row's before_agent_start. Every typed input
	// moves the quiet-stretch clock, and one that ends a stretch longer than quietMs marks the turn it starts.
	pi.on("input", (event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const typed = event.source === "interactive" || event.source === "rpc";
		const prev = s.lastTypedAt;
		if (typed) s.lastTypedAt = s.now();
		const word = surfaceWord(event.text);
		if (word === "pending") {
			// While the session streams, a message without deliverAs would become a steer: the next idle poll shows it, rendered then.
			if (ctx.isIdle?.() === false) s.pendingDisplay = true;
			else showPending(pi, s);
			return { handled: true };
		}
		if (word === "brb") {
			s.away = { since: s.now() };
			ctx.ui.notify(AWAY_NOTICE, "info");
			return { handled: true };
		}
		s.typed = typed ? event.text : null;
		s.quietTurn = typed && prev !== null && Date.parse(s.lastTypedAt!) - Date.parse(prev) > s.quietMs;
		return undefined;
	});
	/** Run the launch trigger once per workload the applied commands hand on, appending its line to the last echo for that workload; a trigger that throws is named there, the commands being applied already. */
	const launchAfter = async (ledger: Ledger, echoes: { wl: string | null; line: string }[]): Promise<void> => {
		for (const wl of [...new Set(echoes.map((e) => e.wl).filter((wl) => wl !== null))]) {
			const last = echoes.findLast((e) => e.wl === wl)!;
			try {
				const launched = await triggerLaunch(pi, ledger, env, wl, "jo");
				if (launched.line) last.line += `; ${launched.line}`;
			} catch (err) {
				last.line += `; applied, but the launch on ${wl} after it failed: ${String(err)}`;
			}
		}
	};

	pi.on("before_agent_start", async (event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const text = event.prompt.trim();
		// What Jo typed for this turn, if OMP's `input` said so; taken whether or not the prompt applies as a command.
		const typed = s.typed;
		s.typed = null;
		// `back` as the whole input is a surface word (D4), read by the wake row: never an answer, a command, or Jo's receipt.
		if (surfaceWord(text) === "back") return undefined;
		// Several lines are a paste, one command per line (a numbered batch one per line included, so its refusals name their lines).
		const paste = text.includes("\n");
		// Prose passes through untouched, without a ledger read (unless it is Jo's receipt, see the header): only a batch-shaped prompt, a short command, or a paste with such a line can be a command.
		if (paste ? !text.split("\n").some((l) => commandShaped(l.trim())) : !commandShaped(text)) {
			joInputRow(s, ctx, text, typed, null);
			return undefined;
		}
		let ledger: Ledger;
		try {
			ledger = s.ledger();
			s.numbering.assign(errorLines(ledger)); // D6: every answerable row has its number before a number or a "which one?" names it
		} catch (err) {
			echo(s, ctx, text, [`could not apply "${text}": ${reason(err)}`], "warning");
			return undefined;
		}

		if (paste) {
			const r = interpretPaste(ledger, s.numbering, text);
			if (!r) {
				joInputRow(s, ctx, text, typed, ledger);
				return undefined;
			}
			/** The refusal echo: one verdict per command line, the held instructions, then the one line to fix. */
			const refuse = (verdicts: { at: number; line: string }[], held: PasteInstruction[], fix: number): void => {
				const instructions = held.map((h) => ({ at: h.from, line: `${span(h)}: an instruction for you, held with the rest; record nothing from this paste` }));
				const lines = [...verdicts, ...instructions].sort((a, b) => a.at - b.at).map((x) => x.line);
				echo(s, ctx, text, [...lines, `nothing applied: fix line ${fix} and paste all of it again`], "warning");
			};
			if (!r.ok) {
				const verdicts = r.refused.map((f) => ({
					at: f.line,
					line: `line ${f.line} "${f.text}": ${f.why !== null ? (Array.isArray(f.why) ? f.why.join("; ") : whichOne(ledger, s, f.why)) : piecesVerdict(f.pieces ?? [])}`,
				}));
				refuse(verdicts, r.held, r.refused.find((f) => f.why !== null)!.line);
				return undefined;
			}
			// Jo's input rows (see the header): the paste is authenticated once, whole.
			const byJo = joTyped(typed, text);
			let echoes: PasteEcho[];
			try {
				// One transaction, in paste order; each command through apply(), so each is its own ledger row, and each plain-words run of a paste Jo typed its own Jo input row.
				// A numbered piece is applied or skipped on its own (applyPiece, D9); a command line the ledger refuses rolls the whole paste back.
				echoes = ledger.write(() => {
					const rows = byJo && receivable(ledger) !== null;
					const out = r.items.flatMap((item): PasteEcho[] => {
						if (item.kind === "instruction") return [{ wl: null, line: "", run: { item, input: rows ? writeJoInput(ledger, item.text) : null } }];
						if (item.kind === "batch") return item.pieces.map((p) => applyPiece(ledger, p));
						try {
							return [{ wl: launches(item.cmd), line: applyOne(ledger, item.cmd) }];
						} catch (err) {
							throw new LineFailure(item.line, item.text, err);
						}
					});
					// Worded against the state the commands leave (a question a line answered is no longer one a run could answer); shown only after the commit.
					const open = receivable(ledger) ?? [];
					for (const e of out) if (e.run) e.line = runLine(e.run.item, e.run.input, open, byJo);
					return out;
				});
			} catch (err) {
				// The transaction rolled back: the ledger's refusal, on its line; every other command line stands unapplied.
				const held = r.items.filter((i): i is PasteInstruction => i.kind === "instruction");
				const failed = err instanceof LineFailure ? err : null;
				const verdicts = r.items.flatMap((i) => {
					if (i.kind === "instruction") return [];
					const why = failed?.line === i.line ? String(failed.cause) : i.kind === "batch" ? piecesVerdict(i.pieces) : "ok, not applied";
					return [{ at: i.line, line: `line ${i.line} "${i.text}": ${why}` }];
				});
				if (failed) refuse(verdicts, held, failed.line);
				else echo(s, ctx, text, [`could not apply "${text}": ${reason(err)}`], "warning");
				return undefined;
			}
			for (const e of echoes) if (e.run?.input) pi.appendEntry("surface-jo-input", { id: e.run.input });
			await launchAfter(ledger, echoes);
			echo(s, ctx, text, echoes.map((e) => e.line), "info");
			return undefined;
		}

		const batch = interpretBatch(ledger, s.numbering, text);
		if (batch && batch.every(isSkip)) {
			// Every piece skipped (D9): nothing to apply, every piece named.
			echo(s, ctx, text, batch.map((p) => skipLine(p.n, p.skip)), "warning");
			return undefined;
		}
		if (batch) {
			let lines: string[];
			try {
				// D9: the valid pieces in one transaction, each through apply() in its own savepoint (its own ledger row); the skipped ones named, in batch order.
				const echoes = ledger.write(() => batch.map((p) => applyPiece(ledger, p)));
				await launchAfter(ledger, echoes);
				lines = echoes.map((e) => e.line);
			} catch (err) {
				lines = [`could not apply "${text}": ${reason(err)}`];
			}
			echo(s, ctx, text, lines, "info");
			return undefined;
		}

		let receipt: string;
		try {
			const cmd = interpret(ledger, text);
			if (!cmd) {
				joInputRow(s, ctx, text, typed, ledger);
				return undefined;
			}
			if (cmd.kind === "ambiguous") {
				echo(s, ctx, text, [whichOne(ledger, s, cmd)], "warning");
				return undefined;
			}
			if (cmd.kind === "refused") {
				echo(s, ctx, text, [cmd.why], "warning");
				return undefined;
			}
			const echoes = [{ wl: launches(cmd), line: ledger.write(() => applyOne(ledger, cmd)) }];
			await launchAfter(ledger, echoes);
			receipt = echoes[0]!.line;
		} catch (err) {
			receipt = `could not apply "${text}": ${reason(err)}`;
		}
		echo(s, ctx, text, [receipt], "info");
		return undefined;
	});
}
