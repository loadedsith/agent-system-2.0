// The agent channel's row (PLAN wl-mv8vx7wdj5nx1c rev 6, D1–D3, D5, D6): the inbound drain from the OMP seat mailbox
// into the ledger and into Ilex's context. Orchestrator only (an inactive surface session registers inert handlers).
// The pure half — the sender config, the envelope checks, every ledger write and read, the proposal reader and the
// `## from other agents` block — is surface/src/channel.ts.
//
// Session start reads `channel.senders` from the installed profile config (D1): no block, the channel is off and
// nothing here runs; an invalid block is refused whole, loudly, and nothing here runs either. A valid block puts the
// senders in force on the session's ledger handle (the needs-you lines and the renders read the same senders), opens
// the standing workload, drains once and then every CHANNEL_DRAIN_MS.
//
// The drain (D2) lists `<root>/inbox/ilex/` and touches only two kinds of names: `<id>.json` (claimed by rename to
// `<id>.json.claimed-ilex-<pid>`, or quarantined when the stem is not an envelope id) and `<id>.json.claimed-ilex-<pid>`
// (adopted, first, when the pid is this drain's or no longer alive). Every other name — the writer's
// `<id>.json.<pid>.<uuid>.tmp`, `.invalid` files, anything unknown — is left as it is. Entry names come from the
// directory listing, never from envelope text. Per claim, resumable from the first missing step:
//   validate → collision boundary → record (once per id) → collision boundary → inject the aside → `channel-aside:`
//   → ack (tmp + link, no replace) → archive (link, no replace) → unlink the claim.
// No step ever renames over or unlinks a file in `acks/` or `archive/`; quarantine is link + unlink, and a taken
// `.invalid` name gets `<entry>.<uuid>.invalid` instead. The next `agent_start` after an aside moves its message to
// `consumed` (the observed-turn receipt). Channel text never reaches `apply`, the typed FIFO or a Jo row (D6).
//
// The tools Ilex answers with (D4) are the tools section at the end of this file: `orchestrator_reply` writes an
// envelope from `Ilex` into a configured sender's inbox (the registry's writer format, tmp + rename), and it and
// `orchestrator_channel_done` walk the `re` messages to `acted-on`, each id checked to be that sender's own channel row
// first. At the consumed transition the `agent_start` handler also writes the registry's turn receipt,
// `acks/<id>.turn.json`, so the sender's `seat_message` reports `acted`.
import { randomUUID } from "node:crypto";
import { existsSync, linkSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Ledger } from "../../ledger/src/index";
import {
	asideText, CHANNEL_ASIDE_TYPE, CHANNEL_DRAIN_MS, CHANNEL_MSG_PREFIX, type ChannelConfig, channelIn, consumeAsides, displayName, type Envelope, hasAside, ID_COLLISION, ILEX_SLUG,
	mailboxRoot, msgIdOf, readChannelConfig, recordAside, recordMessage, recordOut, recordRefused, reRefusal, setChannelInForce, sha256, validateEnvelope,
} from "../src/channel";
import { ensureStandingWorkload } from "../src/identity";
import { surfaceSession } from "../src/session";
import { CHANNEL_DONE_TOOL, CHANNEL_REPLY_TOOL, type Ctx, type SurfaceAPI, type ToolResult } from "../src/types";

/** The claim suffix this drain writes and adopts: the registry's `.claimed-<owner>` with owner `ilex-<pid>`. */
const claimSuffix = (pid: number): string => `.claimed-${ILEX_SLUG}-${pid}`;
const CLAIMED = new RegExp(`^(.+\\.json)\\.claimed-${ILEX_SLUG}-([0-9]+)$`);
const ENVELOPE_STEM = /^[0-9]+-[0-9a-f-]+$/i;

/** The steps of one claim, in order; `DrainIO.after` sees each as it completes (the crash points a test stops at). */
export type DrainStep = "recorded" | "injected" | "aside-recorded" | "acked" | "archive-linked";

export interface DrainIO {
	ledger: Ledger;
	config: ChannelConfig;
	/** The mailbox root (`<root>/inbox/ilex`, `<root>/acks`, `<root>/archive`). */
	root: string;
	/** This drain's pid: its claims are `<id>.json.claimed-ilex-<pid>`. */
	pid: number;
	/** Is another drain's pid alive; a dead one's claims are adopted. */
	alive(pid: number): boolean;
	/** Inject the aside for one message. */
	inject(content: string, msgId: string): void;
	/** After each completed step of a claim; a throw here stops the drain there, as a crash would. */
	after?(step: DrainStep, envelopeId: string): void;
}

/** `process.kill(pid, 0)`: alive unless it fails with ESRCH (EPERM means alive, owned by someone else). */
export function pidAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err) {
		return (err as NodeJS.ErrnoException).code !== "ESRCH";
	}
}

const code = (err: unknown): string | undefined => (err as NodeJS.ErrnoException).code;

/** `link(from, to)`: false when `to` exists (never replaced), true when linked. */
function linkNoReplace(from: string, to: string): boolean {
	try {
		linkSync(from, to);
		return true;
	} catch (err) {
		if (code(err) === "EEXIST") return false;
		throw err;
	}
}

/** The file's bytes, or null when it is gone (a racing claimant took it). */
function readOrNull(path: string): Buffer | null {
	try {
		return readFileSync(path);
	} catch (err) {
		if (code(err) === "ENOENT") return null;
		throw err;
	}
}

/** Quarantine `<inbox>/<name>` as `<entry>.invalid`, else `<entry>.<uuid>.invalid`: link then unlink, so a retained `.invalid` is never overwritten. */
function quarantine(inbox: string, name: string, entry: string): void {
	const from = join(inbox, name);
	if (!linkNoReplace(from, join(inbox, `${entry}.invalid`))) linkSync(from, join(inbox, `${entry}.${randomUUID()}.invalid`));
	unlinkSync(from);
}

/** The registry's ack test: an existing ack is this drain's own when its id, from and to equal the envelope's. */
function ownAck(bytes: Buffer, e: Envelope): boolean {
	try {
		const a = JSON.parse(bytes.toString("utf8")) as { id?: unknown; from?: unknown; to?: unknown };
		return a.id === e.id && a.from === e.from && a.to === e.to;
	} catch {
		return false;
	}
}

/** A foreign file at `acks/<id>.json` or `archive/<id>.json`: present and failing the ack test or the archive's sha256 test. */
function foreignDestination(root: string, e: Envelope, sha: string): boolean {
	const ack = readOrNull(join(root, "acks", `${e.id}.json`));
	if (ack !== null && !ownAck(ack, e)) return true;
	const archived = readOrNull(join(root, "archive", `${e.id}.json`));
	return archived !== null && sha256(archived) !== sha;
}

/** One claim, from its first missing step. `name` is the claim's directory entry, `entry` the `<id>.json` it was published as. */
function processClaim(io: DrainIO, inbox: string, name: string, entry: string): void {
	const { ledger, root } = io;
	const claim = join(inbox, name);
	const bytes = readOrNull(claim);
	if (bytes === null) return;
	const v = validateEnvelope(bytes.toString("utf8"), entry, io.config);
	if (!v.ok) {
		quarantine(inbox, name, entry);
		recordRefused(ledger, entry, v.from, v.reason);
		return;
	}
	const { envelope: e, sender } = v;
	const sha = sha256(bytes);
	const msgId = msgIdOf(e.id);
	const refuse = (withdraws: boolean): void => {
		quarantine(inbox, name, entry);
		recordRefused(ledger, entry, e.from, ID_COLLISION, withdraws ? msgId : undefined);
	};
	if (ledger.message(msgId)) {
		// Resume: the row must be this envelope's own (its sender's `channel-in:` with these bytes' sha256); else a reused id, which withdraws nothing.
		const rec = channelIn(ledger, msgId, sender.id);
		if (!rec || rec.sha !== sha) return refuse(false);
	} else {
		if (foreignDestination(root, e, sha)) return refuse(false);
		recordMessage(ledger, e, sender, sha);
		io.after?.("recorded", e.id);
	}
	if (!hasAside(ledger, msgId, sender.id)) {
		if (foreignDestination(root, e, sha)) return refuse(true);
		io.inject(asideText(sender.id, msgId, e.message), msgId);
		io.after?.("injected", e.id);
		recordAside(ledger, msgId, sender.id);
		io.after?.("aside-recorded", e.id);
	}
	// Publish the ack: tmp, then link with no replace; an existing ack passes only the ack test.
	const acks = join(root, "acks");
	mkdirSync(acks, { recursive: true });
	const ackPath = join(acks, `${e.id}.json`);
	const existing = readOrNull(ackPath);
	if (existing !== null) {
		if (!ownAck(existing, e)) return refuse(true);
	} else {
		const tmp = `${ackPath}.${io.pid}.${randomUUID()}.tmp`;
		writeFileSync(tmp, `${JSON.stringify({ id: e.id, from: e.from, to: e.to, deliveredAt: new Date().toISOString() })}\n`);
		try {
			if (!linkNoReplace(tmp, ackPath) && !ownAck(readFileSync(ackPath), e)) return refuse(true);
		} finally {
			unlinkSync(tmp);
		}
	}
	io.after?.("acked", e.id);
	// Archive: link with no replace; an existing archive passes only with the recorded sha256.
	const archive = join(root, "archive");
	mkdirSync(archive, { recursive: true });
	const archivePath = join(archive, `${e.id}.json`);
	if (!linkNoReplace(claim, archivePath)) {
		const rec = channelIn(ledger, msgId, sender.id);
		if (rec === null || sha256(readFileSync(archivePath)) !== rec.sha) return refuse(true);
	}
	io.after?.("archive-linked", e.id);
	unlinkSync(claim);
}

/**
 * One pass over `<root>/inbox/ilex/`: adoptable claims first (this pid's, or a dead pid's), then published `<id>.json`
 * names, each in name order. Returns the claims it worked on. A missing inbox is an empty one.
 */
export function drainInbox(io: DrainIO): string[] {
	const inbox = join(io.root, "inbox", ILEX_SLUG);
	let names: string[];
	try {
		names = readdirSync(inbox).sort();
	} catch (err) {
		if (code(err) === "ENOENT") return [];
		throw err;
	}
	const worked: string[] = [];
	for (const name of names) {
		const m = CLAIMED.exec(name);
		if (!m) continue;
		const pid = Number(m[2]);
		if (pid !== io.pid && io.alive(pid)) continue;
		processClaim(io, inbox, name, m[1]!);
		worked.push(name);
	}
	for (const entry of names) {
		if (!entry.endsWith(".json")) continue;
		if (!ENVELOPE_STEM.test(entry.slice(0, -".json".length))) {
			const bytes = readOrNull(join(inbox, entry));
			if (bytes === null) continue;
			const v = validateEnvelope(bytes.toString("utf8"), entry, io.config);
			quarantine(inbox, entry, entry);
			recordRefused(io.ledger, entry, v.ok ? v.envelope.from : v.from, v.ok ? "bad id" : v.reason);
			continue;
		}
		const name = `${entry}${claimSuffix(io.pid)}`;
		try {
			renameSync(join(inbox, entry), join(inbox, name));
		} catch (err) {
			// A racing claimant renamed it first: the envelope is theirs.
			if (code(err) === "ENOENT") continue;
			throw err;
		}
		processClaim(io, inbox, name, entry);
		worked.push(name);
	}
	return worked;
}

/** The registry's turn-receipt shape (persistent-seat-registry.ts, its `agent_start` handler), written as Ilex. */
const TURN_SEAT = "Ilex";
const TURN_PROVEN_SEAT = "(not a launcher-started seat)";

/**
 * The observed-turn receipt the sender's `seat_message` reads as `acted`: `acks/<id>.turn.json` for each envelope whose
 * message this `agent_start` moved to consumed. Tmp then `link`, so an existing receipt is never replaced (EEXIST
 * skips it); every error is swallowed, as the registry does: a receipt must never break the turn it reports.
 */
export function writeTurnReceipts(root: string, envelopeIds: readonly string[], pid: number): void {
	const turnStartedAt = new Date().toISOString();
	const acks = join(root, "acks");
	for (const id of envelopeIds) {
		try {
			mkdirSync(acks, { recursive: true });
			const path = join(acks, `${id}.turn.json`);
			const tmp = `${path}.${pid}.${randomUUID()}.tmp`;
			writeFileSync(tmp, `${JSON.stringify({ id, seat: TURN_SEAT, provenSeat: TURN_PROVEN_SEAT, pid, turnStartedAt })}\n`);
			try {
				linkNoReplace(tmp, path);
			} finally {
				unlinkSync(tmp);
			}
		} catch {
			// Diagnostic only, as in the registry.
		}
	}
}

/** How long a reply waits for the sender's drain to ack it: the registry's `seat_message` ack deadline. */
const ACK_WAIT_MS = 3_000;

/** The registry's `waitForFile`: poll every 50 ms until `path` exists or the deadline passes; an abort stops the wait. */
async function waitForFile(path: string, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (!signal?.aborted) {
		if (existsSync(path)) return true;
		if (Date.now() >= deadline) return false;
		await Bun.sleep(50);
	}
	return existsSync(path);
}

/** A tool's `re`: absent → none; a list of strings → trimmed, deduplicated; anything else → null (refused). */
function reIds(v: unknown): string[] | null {
	if (v === undefined || v === null) return [];
	if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return null;
	return [...new Set(v.map((x: string) => x.trim()))];
}

const text = (t: string, details?: unknown): ToolResult => ({ content: [{ type: "text", text: t }], details });
const inactive = text("This session is not the orchestrator surface; nothing was written or sent.");

export default function agentChannelRow(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	/** The senders each session drains for, by its session manager; absent while the channel is off or refused. */
	const live = new WeakMap<object, ChannelConfig>();

	const drain = (ctx: Ctx, config: ChannelConfig): void => {
		const s = surfaceSession(ctx, env);
		try {
			drainInbox({
				ledger: s.ledger(),
				config,
				root: mailboxRoot(env),
				pid: process.pid,
				alive: pidAlive,
				inject: (content, msgId) => pi.sendMessage?.({ customType: CHANNEL_ASIDE_TYPE, content, display: true, details: { msgId } }, { deliverAs: "aside", triggerTurn: true }),
			});
		} catch (err) {
			// A timer callback nothing handles: the drain stops at the failing claim and the next tick resumes it.
			ctx.ui.notify(`agent channel: the drain stopped: ${err instanceof Error ? err.message : String(err)}`, "warning");
		}
	};

	pi.on("session_start", (_e, ctx) => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return undefined;
		const read = readChannelConfig(env);
		if (read.kind === "off") return undefined;
		if (read.kind === "invalid") {
			ctx.ui.notify(`agent channel refused: the profile config's \`channel\` block is invalid (${read.why}); the channel is off for this session and no mailbox is drained`, "error");
			return undefined;
		}
		const ledger = s.ledger();
		ensureStandingWorkload(ledger);
		setChannelInForce(ledger, read.config);
		live.set(ctx.sessionManager, read.config);
		drain(ctx, read.config);
		ctx.setInterval(() => drain(ctx, read.config), CHANNEL_DRAIN_MS);
		return undefined;
	});

	pi.on("agent_start", (_e, ctx) => {
		const config = live.get(ctx.sessionManager);
		if (!config) return undefined;
		let moved: string[];
		try {
			moved = consumeAsides(surfaceSession(ctx, env).ledger(), config);
		} catch (err) {
			ctx.ui.notify(`agent channel: the consumed receipt could not be written: ${err instanceof Error ? err.message : String(err)}`, "warning");
			return undefined;
		}
		writeTurnReceipts(mailboxRoot(env), moved.map((m) => m.slice(CHANNEL_MSG_PREFIX.length)), process.pid);
		return undefined;
	});

	pi.on("session_shutdown", (_e, ctx) => {
		if (!live.has(ctx.sessionManager)) return undefined;
		live.delete(ctx.sessionManager);
		setChannelInForce(surfaceSession(ctx, env).ledger(), null);
		return undefined;
	});

	// ---- tools (D4) ---------------------------------------------------------------------------------------------
	// Ilex's own acts, never the channel's input: a reply envelope from `Ilex` to a configured sender, and the walk of
	// the `re` messages to `acted-on`. Every check runs before anything is written; one failing `re` id refuses the call.
	const z = pi.zod;
	const refused = (why: string): ToolResult => text(`Refused: ${why}; nothing was written or sent.`);
	/** The session's senders and ledger, or the refusal when this is no surface or the channel is off. */
	const open = (ctx: Ctx): { ledger: Ledger; config: ChannelConfig } | ToolResult => {
		const s = surfaceSession(ctx, env);
		if (!s.active) return inactive;
		const config = live.get(ctx.sessionManager);
		if (!config) return refused("the agent channel is off in this session (no valid `channel` block in the profile config)");
		return { ledger: s.ledger(), config };
	};

	pi.registerTool({
		name: CHANNEL_REPLY_TOOL,
		loadMode: "essential",
		label: "Reply To Agent",
		description:
			"Reply to another agent's channel message: writes a seat-mailbox envelope from Ilex to the configured sender `to`, records a `channel-out:` entry, and walks each `re` message (msg-ch-…, that sender's own) to acted-on. " +
			"It carries no authority and is never Jo's word. Returns delivered when the sender's drain acknowledges within 3 s, else queued.",
		parameters: z.object({
			to: z.string().describe("The configured sender id to reply to (e.g. plumb)."),
			body: z.string().describe("The reply text."),
			re: z.array(z.string()).optional().describe("The channel messages (msg-ch-…) from `to` this reply answers; each is walked to acted-on."),
		}),
		approval: "write",
		async execute(_id, params, signal, _onUpdate, ctx) {
			const o = open(ctx);
			if (!("ledger" in o)) return o;
			const to = String(params.to ?? "").trim().toLowerCase();
			if (!o.config.senders.some((s) => s.id === to)) return refused(`${JSON.stringify(to)} is not a configured channel sender`);
			const message = String(params.body ?? "").trim();
			if (!message) return refused("the reply body is empty");
			const re = reIds(params.re);
			if (re === null) return refused("`re` must be a list of msg-ch-… ids");
			const bad = reRefusal(o.ledger, o.config, re, to);
			if (bad) return refused(bad);
			const envelope: Envelope = { id: `${Date.now()}-${randomUUID()}`, from: displayName(ILEX_SLUG), to: displayName(to), message, createdAt: new Date().toISOString() };
			const root = mailboxRoot(env);
			const inbox = join(root, "inbox", to);
			mkdirSync(inbox, { recursive: true });
			const path = join(inbox, `${envelope.id}.json`);
			const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`;
			writeFileSync(tmp, `${JSON.stringify(envelope)}\n`);
			// Published last inside the ledger transaction, once: a ledger failure before it sends nothing.
			let published = false;
			let moved: string[];
			try {
				moved = recordOut(o.ledger, re, { envelopeId: envelope.id, to }, () => {
					if (published) return;
					renameSync(tmp, path);
					published = true;
				});
			} catch (err) {
				if (!published) unlinkSync(tmp);
				const why = err instanceof Error ? err.message : String(err);
				return text(published ? `The envelope ${envelope.id} was published to ${to}, but the ledger write failed (${why}); no channel-out entry was recorded.` : `The reply failed (${why}); nothing was written or sent.`);
			}
			const status = (await waitForFile(join(root, "acks", `${envelope.id}.json`), ACK_WAIT_MS, signal)) ? "delivered" : "queued";
			const walked = moved.length > 0 ? `; walked to acted-on: ${moved.join(", ")}` : "";
			return text(`Replied to ${to}: envelope ${envelope.id}, ${status}${walked}.`, { id: envelope.id, to, status, re, moved });
		},
	});

	pi.registerTool({
		name: CHANNEL_DONE_TOOL,
		loadMode: "essential",
		label: "Mark Agent Messages Done",
		description: "Mark channel messages from other agents (msg-ch-…) as acted on, without a reply: each is walked to acted-on and leaves the `## from other agents` block.",
		parameters: z.object({
			re: z.array(z.string()).describe("The channel messages (msg-ch-…) to mark acted-on."),
		}),
		approval: "write",
		async execute(_id, params, _signal, _onUpdate, ctx) {
			const o = open(ctx);
			if (!("ledger" in o)) return o;
			const re = reIds(params.re);
			if (re === null || re.length === 0) return refused("`re` must name at least one msg-ch-… id");
			const bad = reRefusal(o.ledger, o.config, re, null);
			if (bad) return refused(bad);
			const moved = recordOut(o.ledger, re, null);
			return text(moved.length > 0 ? `Walked to acted-on: ${moved.join(", ")}.` : `Already acted-on: ${re.join(", ")}; nothing changed.`, { re, moved });
		},
	});
}
