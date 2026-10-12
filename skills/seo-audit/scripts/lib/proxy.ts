// The guard proxy (plan section 3): Chrome and Lighthouse are launched with `--proxy-server` pointing here, so every
// request they make is checked by the same Guard as the skill's own fetches. A plain HTTP request is checked by origin;
// a CONNECT tunnel by host and port after DNS resolution, and the upstream socket connects to the resolved address the
// guard approved (no second lookup). HTTPS inside a tunnel is opaque, so the enforced limits are stated in proxy terms:
// at most `maxTransactions` transactions per run (one plain request or one CONNECT establishment each) and an idle
// timeout per tunnel. The run's wall clock is enforced by the caller, which kills the browser.
import { type Server, type Socket, connect, createServer } from "node:net";
import type { Guard } from "./guard.ts";

export interface ProxyRunStats {
	label: string;
	transactions: number;
	refused: number;
}

const HEAD_LIMIT = 64 * 1024;

export class GuardProxy {
	port = 0;
	readonly runs: ProxyRunStats[] = [];
	private server: Server | null = null;
	private run: ProxyRunStats = { label: "default", transactions: 0, refused: 0 };
	private readonly sockets = new Set<Socket>();

	constructor(
		private readonly guard: Guard,
		private readonly maxTransactions = 300,
		private readonly idleMs = 30_000,
	) {
		this.runs.push(this.run);
	}

	// Starts counting a new render or Lighthouse run; the transaction cap applies per run.
	beginRun(label: string): ProxyRunStats {
		this.run = { label, transactions: 0, refused: 0 };
		this.runs.push(this.run);
		return this.run;
	}

	async start(): Promise<number> {
		const { promise, resolve, reject } = Promise.withResolvers<number>();
		const server = createServer((client) => this.onClient(client));
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const addr = server.address();
			this.port = typeof addr === "object" && addr ? addr.port : 0;
			resolve(this.port);
		});
		this.server = server;
		return promise;
	}

	async stop(): Promise<void> {
		for (const s of this.sockets) s.destroy();
		this.sockets.clear();
		const server = this.server;
		if (!server) return;
		const { promise, resolve } = Promise.withResolvers<void>();
		server.close(() => resolve());
		this.server = null;
		return promise;
	}

	private track(s: Socket): void {
		this.sockets.add(s);
		s.on("close", () => this.sockets.delete(s));
		s.on("error", () => s.destroy());
		s.setTimeout(this.idleMs, () => s.destroy());
	}

	private onClient(client: Socket): void {
		this.track(client);
		let buf = Buffer.alloc(0);
		const onData = (chunk: Buffer) => {
			buf = Buffer.concat([buf, chunk]);
			const end = buf.indexOf("\r\n\r\n");
			if (end < 0) {
				if (buf.length > HEAD_LIMIT) client.end("HTTP/1.1 431 Request Header Fields Too Large\r\n\r\n");
				return;
			}
			client.off("data", onData);
			client.pause();
			void this.handle(client, buf.subarray(0, end).toString("latin1"), buf.subarray(end + 4));
		};
		client.on("data", onData);
	}

	private deny(client: Socket, status: string, target: string, via: "proxy-http" | "proxy-connect" | "proxy-limit", reason: string): void {
		this.run.refused++;
		this.guard.refuse(target, via, reason);
		client.end(`HTTP/1.1 ${status}\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nseo-audit guard proxy: ${reason}\n`);
	}

	private async handle(client: Socket, head: string, rest: Buffer): Promise<void> {
		const lines = head.split("\r\n");
		const [method = "", target = "", version = "HTTP/1.1"] = (lines[0] ?? "").split(" ");
		this.run.transactions++;
		const via = method === "CONNECT" ? "proxy-connect" : "proxy-http";
		if (this.run.transactions > this.maxTransactions) {
			this.deny(client, "403 Forbidden", target, "proxy-limit", `transaction ${this.run.transactions} exceeds the ${this.maxTransactions} per run`);
			return;
		}
		if (method === "CONNECT") {
			const m = target.match(/^(\[[^\]]+\]|[^:]+):(\d+)$/);
			if (!m?.[1] || !m[2]) {
				this.deny(client, "400 Bad Request", target, via, "malformed CONNECT target");
				return;
			}
			const decision = await this.guard.checkHostPort(m[1], m[2], null);
			if (!decision.allowed) {
				this.deny(client, "403 Forbidden", target, via, decision.reason);
				return;
			}
			this.pipe(client, decision.addresses.length ? decision.addresses : [m[1]], Number(m[2]), "HTTP/1.1 200 Connection Established\r\n\r\n", null, rest);
			return;
		}
		let url: URL;
		try {
			url = new URL(target);
		} catch {
			this.deny(client, "400 Bad Request", target, via, "proxy request is not in absolute form");
			return;
		}
		if (url.protocol !== "http:") {
			this.deny(client, "400 Bad Request", target, via, `scheme ${url.protocol} over a plain proxy request`);
			return;
		}
		const decision = await this.guard.check(url);
		if (!decision.allowed) {
			this.deny(client, "403 Forbidden", target, via, decision.reason);
			return;
		}
		const headers = lines
			.slice(1)
			.filter((l) => !/^(proxy-connection|proxy-authorization|connection|keep-alive)\s*:/i.test(l));
		const upstreamHead = [`${method} ${url.pathname}${url.search} ${version}`, ...headers, "Connection: close", "", ""].join("\r\n");
		this.pipe(client, decision.addresses.length ? decision.addresses : [url.hostname], Number(url.port || 80), null, upstreamHead, rest);
	}

	// Connects to the approved addresses in order (e.g. ::1 then 127.0.0.1 for localhost), never to a fresh lookup.
	private pipe(client: Socket, addresses: string[], port: number, reply: string | null, upstreamHead: string | null, rest: Buffer): void {
		const [address = "", ...others] = addresses;
		const upstream = connect({ host: address, port });
		let connected = false;
		this.track(upstream);
		upstream.once("connect", () => {
			connected = true;
			if (reply) client.write(reply);
			if (upstreamHead) upstream.write(upstreamHead, "latin1");
			if (rest.length) upstream.write(rest);
			client.pipe(upstream);
			upstream.pipe(client);
			client.resume();
		});
		upstream.once("error", () => {
			if (!connected && others.length) this.pipe(client, others, port, reply, upstreamHead, rest);
			else if (!client.destroyed) client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
		});
		upstream.once("close", () => {
			if (connected) client.end();
		});
		client.once("close", () => upstream.destroy());
	}
}
