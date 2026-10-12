// chaos-proxy: the refusing egress proxy of the nightly chaos run (the approved plan of workload
// wl-mv45yxnkw2251c, revision 4, § 2.1 "Egress proxy (enforcing)"). chaos.ts starts it in-process and
// gives every child HTTP_PROXY / HTTPS_PROXY / ALL_PROXY (and their lowercase forms) pointing here,
// with NO_PROXY=127.0.0.1,localhost so the stub stays reachable. Nothing that reaches this proxy is
// forwarded: every plain request and every CONNECT is answered 403 and closed, and its target host is
// logged in the bucket of the phase in force (`setPhase`), so the preflight's deliberate self-test
// lands in `preflight` and never counts against the measured phase.
//
//   startProxy() → { port, url, setPhase(p), phase(), attempts(phase?), stop() }
//
// A client that speaks something other than HTTP to the proxy (a SOCKS handshake, TLS) is logged as
// kind "other" with its first bytes in hex, then closed.
import type { Socket } from "bun";

export interface ProxyAttempt {
	at: number;
	phase: string;
	/** connect: a CONNECT tunnel request · http: a plain request with an absolute or Host target · other: not HTTP. */
	kind: "connect" | "http" | "other";
	method: string;
	/** The request target as sent (host:port for CONNECT, the URL otherwise; hex bytes for `other`). */
	target: string;
	/** The host the client tried to reach, lowercased, without the port; "" when it named none. */
	host: string;
}

export interface Proxy {
	port: number;
	url: string;
	setPhase(phase: string): void;
	phase(): string;
	/** Every attempt, or only those logged in `phase`. */
	attempts(phase?: string): ProxyAttempt[];
	stop(): void;
}

const REFUSAL_BODY = "chaos-proxy: egress refused\n";
const REFUSAL = `HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: ${REFUSAL_BODY.length}\r\nConnection: close\r\n\r\n${REFUSAL_BODY}`;
/** A request head larger than this without its first line is not HTTP worth reading further. */
const HEAD_LIMIT = 16 * 1024;

/** The host part of `host:port`, `[v6]:port` or a bare host. */
function hostOf(authority: string): string {
	const a = authority.trim().toLowerCase();
	if (a.startsWith("[")) return a.slice(1, a.indexOf("]") > 0 ? a.indexOf("]") : undefined);
	const colon = a.lastIndexOf(":");
	return colon > 0 && a.indexOf(":") === colon ? a.slice(0, colon) : a;
}

/** One attempt from a request head (the bytes up to the blank line, or as many as arrived). */
export function parseHead(head: Buffer): Omit<ProxyAttempt, "at" | "phase"> {
	const text = head.toString("latin1");
	const lineEnd = text.indexOf("\r\n");
	const first = lineEnd >= 0 ? text.slice(0, lineEnd) : text;
	const m = /^([A-Z]+) (\S+) HTTP\/\d(?:\.\d)?$/.exec(first);
	if (!m) return { kind: "other", method: "", target: head.subarray(0, 16).toString("hex"), host: "" };
	const method = m[1]!;
	const target = m[2]!;
	if (method === "CONNECT") return { kind: "connect", method, target, host: hostOf(target) };
	let host = "";
	try {
		host = new URL(target).hostname.toLowerCase().replace(/^\[|\]$/g, "");
	} catch {
		const h = /\r\nhost:[ \t]*([^\r\n]*)/i.exec(text);
		host = h ? hostOf(h[1]!) : "";
	}
	return { kind: "http", method, target, host };
}

export function startProxy(): Proxy {
	let currentPhase = "setup";
	const log: ProxyAttempt[] = [];
	const heads = new WeakMap<Socket<undefined>, Buffer>();
	/** Sockets already answered: whatever else they send (a request body) is not a new attempt. */
	const refused = new WeakSet<Socket<undefined>>();

	const refuse = (socket: Socket<undefined>, head: Buffer) => {
		log.push({ at: Date.now(), phase: currentPhase, ...parseHead(head) });
		heads.delete(socket);
		refused.add(socket);
		socket.write(REFUSAL);
		socket.end();
	};

	const listener = Bun.listen<undefined>({
		hostname: "127.0.0.1",
		port: 0,
		socket: {
			data(socket, chunk) {
				if (refused.has(socket)) return;
				const head = Buffer.concat([heads.get(socket) ?? Buffer.alloc(0), chunk]);
				const text = head.toString("latin1");
				// Decide on the whole head when it arrived; at once for a non-HTTP (no `METHOD ` start) or oversized client.
				if (text.includes("\r\n\r\n") || head.length >= HEAD_LIMIT || !/^[A-Z]{1,16}( |$)/.test(text.slice(0, 17))) {
					refuse(socket, head);
					return;
				}
				heads.set(socket, head);
			},
			close(socket) {
				// A client that hung up mid-head still made an attempt.
				const head = heads.get(socket);
				if (head) log.push({ at: Date.now(), phase: currentPhase, ...parseHead(head) });
				heads.delete(socket);
			},
			error(socket) {
				heads.delete(socket);
			},
		},
	});

	return {
		port: listener.port,
		url: `http://127.0.0.1:${listener.port}`,
		setPhase(phase) {
			currentPhase = phase;
		},
		phase: () => currentPhase,
		attempts: (phase) => log.filter((a) => phase === undefined || a.phase === phase).map((a) => ({ ...a })),
		stop() {
			listener.stop(true);
		},
	};
}
