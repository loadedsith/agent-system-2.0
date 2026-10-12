// Fixture harness: serves a fixture directory on its fixed 127.0.0.1 port (from _serve.json), runs scripts/audit.ts
// against it as a child process (async spawn, recorded rendered DOM and LHR, no CrUX key, no network beyond loopback),
// and compares findings.json with the fixture's expected occurrences as a multiset. Expectations are split per rule
// family: test/fixtures/<name>/expect/<family>.json holds exactly the emissions of that family's rules and notes on
// that fixture, so each family test owns its own files and compares only its own emissions.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import type { Server } from "bun";
import type { Emission } from "../scripts/lib/engine.ts";

export const TEST_DIR = import.meta.dir;
export const FIXTURES_DIR = join(TEST_DIR, "fixtures");
export const AUDIT = join(TEST_DIR, "..", "scripts", "audit.ts");

export interface ServePath {
	status?: number;
	headers?: Record<string, string>;
	body?: string;
	file?: string; // a file in the fixture directory to serve as the body
	padTo?: number; // pad the body with `#` comment lines to at least this many bytes
	generate?: "urlset" | "sitemapindex"; // a generated sitemap of `count` entries
	count?: number;
	loc?: string; // generate: the loc of every sitemapindex entry; urlset entries are `${origin}/p/<n>`
}

export interface ServeConfig {
	port: number;
	tls?: boolean; // serve cert.pem/key.pem from the fixture directory; the child trusts cert.pem via NODE_EXTRA_CA_CERTS
	audit: {
		urls: string[];
		intent?: { noindex?: string[] };
		allowLocal?: string[]; // extra origins beyond the fixture's own
		noRender?: boolean;
		sample?: number;
		budget?: number;
	};
	paths?: Record<string, ServePath>;
}

// An occurrence in expect/<family>.json. `modes` says which runs must produce it: "recorded" (tests) and/or "live" (a live
// Chrome run against the same fixture); default both. `severity` is null for observations and do-not-flag notes.
export interface Occurrence {
	rule: string;
	path: string;
	locator: string;
	kind: Emission["kind"];
	severity: Emission["severity"];
	layer: Emission["layer"];
	modes?: ("recorded" | "live")[];
}

const NEVER_SERVED = /^(_serve\.json|expect.*\.json|lhr.*\.json|crux\.json|cert\.pem|key\.pem)$|^rendered(\/|$)/;

const TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".xml": "application/xml",
	".css": "text/css",
	".js": "text/javascript",
	".json": "application/json",
	".png": "image/png",
	".ico": "image/x-icon",
	".svg": "image/svg+xml",
};

export function loadServe(dir: string): ServeConfig {
	return JSON.parse(readFileSync(join(dir, "_serve.json"), "utf8")) as ServeConfig;
}

export function fixtureOrigin(cfg: ServeConfig): string {
	return `${cfg.tls ? "https" : "http"}://127.0.0.1:${cfg.port}`;
}

function pad(body: string, to: number): string {
	if (body.length >= to) return body;
	const line = `# ${"x".repeat(98)}\n`;
	return body + line.repeat(Math.ceil((to - body.length) / line.length));
}

function generate(p: ServePath, origin: string): string {
	const n = p.count ?? 0;
	const parts: string[] = [];
	if (p.generate === "urlset") {
		parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n');
		for (let i = 0; i < n; i++) parts.push(`<url><loc>${origin}/p/${i}</loc></url>\n`);
		parts.push("</urlset>\n");
	} else {
		parts.push('<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n');
		for (let i = 0; i < n; i++) parts.push(`<sitemap><loc>${p.loc ?? `${origin}/child.xml`}</loc></sitemap>\n`);
		parts.push("</sitemapindex>\n");
	}
	return parts.join("");
}

function staticFile(dir: string, pathname: string): string | null {
	const rel = normalize(decodeURIComponent(pathname)).replace(/^\/+/, "");
	if (rel.startsWith("..") || NEVER_SERVED.test(rel)) return null;
	for (const candidate of rel === "" ? ["index.html"] : [rel, `${rel}.html`, join(rel, "index.html")]) {
		const full = join(dir, candidate);
		if (existsSync(full) && statSync(full).isFile()) return full;
	}
	return null;
}

export function serveFixture(dir: string, cfg: ServeConfig = loadServe(dir)): Server<undefined> {
	const origin = fixtureOrigin(cfg);
	return Bun.serve({
		port: cfg.port,
		hostname: "127.0.0.1",
		tls: cfg.tls ? { cert: Bun.file(join(dir, "cert.pem")), key: Bun.file(join(dir, "key.pem")) } : undefined,
		fetch(req) {
			const url = new URL(req.url);
			const entry =
				cfg.paths?.[`${url.origin}${url.pathname}`] ?? cfg.paths?.[`${url.pathname}${url.search}`] ?? cfg.paths?.[url.pathname];
			if (entry) {
				let body = entry.body ?? (entry.file ? readFileSync(join(dir, entry.file), "utf8") : entry.generate ? generate(entry, origin) : "");
				if (entry.padTo) body = pad(body, entry.padTo);
				const headers: Record<string, string> = { ...entry.headers };
				const file = entry.file ?? "";
				if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type") && body)
					headers["content-type"] = TYPES[extname(file)] ?? (entry.generate ? "application/xml" : "text/plain; charset=utf-8");
				return new Response(body || null, { status: entry.status ?? 200, headers });
			}
			const file = staticFile(dir, url.pathname);
			if (!file) return new Response("not found", { status: 404, headers: { "content-type": "text/plain" } });
			return new Response(Bun.file(file), { headers: { "content-type": TYPES[extname(file)] ?? "application/octet-stream" } });
		},
	});
}

// Arguments for one audit run against a fixture. Recorded mode replays rendered/ and lhr.json; live mode renders.
export function auditArgs(dir: string, cfg: ServeConfig, out: string, mode: "recorded" | "record"): string[] {
	const args: string[] = [];
	for (const u of cfg.audit.urls) args.push("--url", u);
	for (const u of cfg.audit.intent?.noindex ?? []) args.push("--intent", `noindex=${u}`);
	for (const o of [fixtureOrigin(cfg), ...(cfg.audit.allowLocal ?? [])]) args.push("--allow-local", o);
	args.push("--budget", String(cfg.audit.budget ?? 400));
	if (cfg.audit.sample !== undefined) args.push("--sample", String(cfg.audit.sample));
	if (cfg.audit.noRender) args.push("--no-render");
	else if (mode === "record") args.push("--record-rendered", join(dir, "rendered"), "--chrome-no-sandbox");
	else args.push("--rendered-from", join(dir, "rendered"));
	if (existsSync(join(dir, "lhr.json")) && mode === "recorded") args.push("--lhr-from", join(dir, "lhr.json"));
	else args.push("--no-lighthouse");
	if (existsSync(join(dir, "crux.json"))) args.push("--crux-from", join(dir, "crux.json"));
	args.push("--out", out);
	return args;
}

export interface AuditRun {
	code: number;
	stdout: string;
	stderr: string;
	out: string;
	emissions: Emission[];
	notImplemented: string[];
	verdict: string | null;
}

// Runs scripts/audit.ts as a child process. The environment drops any CrUX key, so no run reaches the API.
export async function runAudit(args: string[], env: Record<string, string> = {}): Promise<{ code: number; stdout: string; stderr: string }> {
	const proc = Bun.spawn(["bun", AUDIT, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		env: { ...process.env, CRUX_API_KEY: "", ...env },
	});
	const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
	return { code, stdout, stderr };
}

export async function auditFixture(name: string, mode: "recorded" | "record" = "recorded"): Promise<AuditRun> {
	const dir = join(FIXTURES_DIR, name);
	const cfg = loadServe(dir);
	const server = serveFixture(dir, cfg);
	const out = mkdtempSync(join(tmpdir(), `seo-audit-${name}-`));
	try {
		const env: Record<string, string> = cfg.tls ? { NODE_EXTRA_CA_CERTS: join(dir, "cert.pem") } : {};
		const r = await runAudit(auditArgs(dir, cfg, out, mode), env);
		const findingsPath = join(out, "findings.json");
		const findings = existsSync(findingsPath)
			? (JSON.parse(readFileSync(findingsPath, "utf8")) as { emissions: Emission[]; notImplemented: string[]; verdict: { verdict: string } })
			: null;
		return {
			...r,
			out,
			emissions: findings?.emissions ?? [],
			notImplemented: findings?.notImplemented ?? [],
			verdict: findings?.verdict.verdict ?? null,
		};
	} finally {
		server.stop(true);
		if (mode === "recorded") rmSync(out, { recursive: true, force: true });
	}
}

export function occurrenceKey(o: Pick<Occurrence, "rule" | "path" | "locator" | "kind" | "severity" | "layer">): string {
	return [o.rule, o.path, o.locator, o.kind, o.severity ?? "null", o.layer].join(" | ");
}

// One family's expected occurrences on a fixture (expect/<family>.json), or every family's when `family` is omitted.
export function loadExpect(name: string, family?: string): Occurrence[] {
	const dir = join(FIXTURES_DIR, name, "expect");
	if (!existsSync(dir)) return [];
	const files = family === undefined ? [...new Bun.Glob("*.json").scanSync(dir)].sort() : [`${family}.json`];
	return files.flatMap((f) => {
		const file = join(dir, f);
		return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Occurrence[]) : [];
	});
}

// The emissions a family owns: its rules.md ids plus its do-not-flag note ids.
export function familyEmissions(run: AuditRun | undefined, owned: Record<string, true>): Emission[] {
	return (run?.emissions ?? []).filter((e) => owned[e.rule]);
}

// Multiset difference between expected occurrences (for `mode`) and actual emissions.
export function compareOccurrences(expected: Occurrence[], actual: Emission[], mode: "recorded" | "live"): { missing: string[]; unexpected: string[] } {
	const want = new Map<string, number>();
	for (const o of expected) {
		if (!(o.modes ?? ["recorded", "live"]).includes(mode)) continue;
		const k = occurrenceKey(o);
		want.set(k, (want.get(k) ?? 0) + 1);
	}
	const unexpected: string[] = [];
	for (const e of actual) {
		const k = occurrenceKey(e);
		const n = want.get(k) ?? 0;
		if (n > 0) want.set(k, n - 1);
		else unexpected.push(`${k} :: ${e.observed}`);
	}
	const missing = [...want.entries()].flatMap(([k, n]) => Array<string>(n).fill(k));
	return { missing, unexpected };
}

export function fixtureNames(): string[] {
	return [...new Bun.Glob("*/_serve.json").scanSync(FIXTURES_DIR)].map((p) => p.split("/")[0] ?? "").sort();
}
