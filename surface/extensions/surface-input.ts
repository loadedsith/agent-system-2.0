// Jo's short inputs at the surface (SPEC-2.0.md § A1.2, § B3 item 5, § B13.1): a stakes or mode
// word, an option name, `withdraw`, `approve <id>` / `deny <id>`, `ceiling <usd> [<hours>] [wl-…]`
// (up to four words, never read as a batch), or a numbered batch answering needs-you lines by their
// session number ("1 approve, 2 deny", or one per line; MIGRATION.md § M7 follow-ups item 1). Read
// from the turn's prompt in `before_agent_start` rather than from the
// `input` event, because OMP emits `input` only from the interactive TUI
// (modes/controllers/input-controller.ts:966) and the surface has to behave the same from the TUI,
// an rpc front-end and `omp -p`. Every current answerable line is numbered first (the session's
// Numbering, surface/src/numbering.ts), so a number or a "which one?" refusal always names the row
// Jo sees. A batch of any length is checked whole and applied all-or-nothing in one transaction,
// one ledger row and one echo line per answer; a refused batch writes nothing and echoes one line
// per piece. A single word or word pair is applied as before, except that a bare answer word
// fitting more than one row, or a bare stakes, mode or `ceiling` word with more than one workload
// in view, is refused with "which one?" and writes nothing. Everything is applied
// through the ledger module as author "jo", channel "surface" (§ B5), Jo is notified at once, and
// the echo lines are queued for the wake row (registered after this one) to put in the turn's
// context, so the model's reply reflects the new state. Anything not recognised passes through
// untouched.
//
// Lane launcher (DESIGN-lane-launcher.md decisions 7 and 9): an answer or a withdrawal is a
// resolution a parked lane resumes on, so the launch trigger runs after it (once per workload for
// a batch); a flip to autonomous writes Jo's `launch-requested:` cause and runs the trigger; a flip
// to user-driven while an autonomous lane holds the workload writes the `lane-stop:` request the
// runner accepts.
import type { Ledger } from "../../ledger/src/index";
import { errorLines } from "../src/errors";
import { apply, type BatchResult, type Command, interpret, interpretBatch, parseBatch } from "../src/input";
import { heldLive, laneStopRequestBody, launchRequestedBody } from "../src/launch";
import { oneLinerCore } from "../src/render";
import { type SurfaceSession, surfaceSession } from "../src/session";
import { type Ctx, type SurfaceAPI, SURFACE_BY } from "../src/types";
import { triggerLaunch } from "./launch";

/** The workload an answer or a withdrawal resolves (a parked lane resumes on it), else null. */
const resumes = (cmd: Command): string | null => (cmd.kind === "answer" || cmd.kind === "withdraw" ? cmd.workloadId : null);

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

export default function surfaceInputRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	/** Queue the echo lines for the next turn's context, record the input once, notify each line. */
	const echo = (s: SurfaceSession, ctx: Ctx, text: string, lines: string[], level: "info" | "warning"): void => {
		s.notices.push(...lines);
		pi.appendEntry("surface-input", { text, receipt: lines.join("\n") });
		for (const l of lines) ctx.ui.notify(l, level === "warning" || l.startsWith("could not") ? "warning" : "info");
	};

	pi.on("before_agent_start", async (event, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const text = event.prompt.trim();
		// `ceiling <usd> [<hours>] [wl-…]` is the one command longer than two words (up to four), and it is never batch-parsed.
		const ceilingWord = /^ceiling\s/i.test(text);
		const maxWords = ceilingWord ? 4 : 2;
		// Prose passes through untouched, without a ledger read: only a batch-shaped prompt or a short command can be a command.
		if (!text || ((ceilingWord || parseBatch(text) === null) && text.split(/\s+/).length > maxWords)) return undefined;
		let read: { ledger: Ledger; batch: BatchResult | null };
		try {
			const l = s.ledger();
			s.numbering.assign(errorLines(l)); // D6: every answerable row has its number before a number or a "which one?" names it
			read = { ledger: l, batch: ceilingWord ? null : interpretBatch(l, s.numbering, text) };
		} catch (err) {
			echo(s, ctx, text, [`could not apply "${text}": ${String(err)}`], "warning");
			return undefined;
		}
		const { ledger, batch } = read;

		if (batch && !batch.ok) {
			echo(s, ctx, text, batch.lines, "warning");
			return undefined;
		}
		if (batch) {
			const items = batch.items;
			let lines: string[];
			try {
				// D4: all-or-nothing, one transaction; each answer through apply(), so each is its own ledger row.
				const echoes = ledger.write(() => items.map(({ n, cmd }) => ({ cmd, line: `#${n} → ${apply(ledger, cmd)}` })));
				const resumed = [...new Set(echoes.map((e) => resumes(e.cmd)).filter((wl) => wl !== null))];
				for (const wl of resumed) {
					const launched = await triggerLaunch(pi, ledger, env, wl, "jo");
					const last = echoes.findLast((e) => resumes(e.cmd) === wl)!;
					if (launched.line) last.line += `; ${launched.line}`;
				}
				lines = echoes.map((e) => e.line);
			} catch (err) {
				lines = [`could not apply "${text}": ${String(err)}`];
			}
			echo(s, ctx, text, lines, "info");
			return undefined;
		}

		if (text.split(/\s+/).length > maxWords) return undefined;
		let receipt: string;
		try {
			const cmd = interpret(ledger, text);
			if (!cmd) return undefined;
			if (cmd.kind === "ambiguous") {
				echo(s, ctx, text, [whichOne(ledger, s, cmd)], "warning");
				return undefined;
			}
			// A mode flip and the control entry it implies land in one transaction (decision 6; Codex review S3):
			// a flip to autonomous without its `launch-requested:` would leave a relaunch nothing to consume.
			receipt = ledger.write(() => {
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
			});
			if (resumes(cmd) || (cmd.kind === "mode" && cmd.mode === "autonomous")) {
				const launched = await triggerLaunch(pi, ledger, env, cmd.workloadId, "jo");
				if (launched.line) receipt += `; ${launched.line}`;
			}
		} catch (err) {
			receipt = `could not apply "${text}": ${String(err)}`;
		}
		echo(s, ctx, text, [receipt], "info");
		return undefined;
	});
}
