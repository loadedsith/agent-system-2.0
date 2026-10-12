// Unit tests for the evidence engine's hand-written parsers and its safety boundary: the RFC 9309 robots matcher
// (against the RFC's own examples, references/research/fetch-rfc9309.md sections 2.2.1, 2.2.2 and 5), the sitemap
// XML tokenizer, the head scanner, the Link header parser, the SSRF guard, the guard proxy and the
// --chrome-no-sandbox refusal. Everything runs offline against loopback servers on ephemeral ports.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { connect } from "node:net";
import type { Server } from "bun";
import { UsageError, parseArgs } from "../scripts/audit.ts";
import { fetchChain } from "../scripts/lib/fetch.ts";
import { Budget, Guard, classifyAddress, isLoopbackFixtureOrigin } from "../scripts/lib/guard.ts";
import { scanHead } from "../scripts/lib/html.ts";
import { GuardProxy } from "../scripts/lib/proxy.ts";
import { normalisePath, parseRobots, patternMatches, robotsVerdict } from "../scripts/lib/robots.ts";
import { NS, W3C_DATETIME, XmlError, parseSitemap, parseXml } from "../scripts/lib/sitemap.ts";
import { parseLinkHeader } from "../scripts/lib/url.ts";
import { runAudit } from "./harness.ts";

describe("robots.txt matcher (RFC 9309)", () => {
	// Section 5.1, verbatim.
	const simple = parseRobots(
		[
			"User-Agent: *",
			"Disallow: *.gif$",
			"Disallow: /example/",
			"Allow: /publications/",
			"",
			"User-Agent: foobot",
			"Disallow:/",
			"Allow:/example/page.html",
			"Allow:/example/allowed.gif",
			"",
			"User-Agent: barbot",
			"User-Agent: bazbot",
			"Disallow: /example/page.html",
			"",
			"User-Agent: quxbot",
			"",
			"EOF",
		].join("\n"),
	);
	const allowed = (token: string, path: string) => robotsVerdict(simple, [token], path).allowed;

	test("5.1: the * group applies to crawlers without a group", () => {
		expect(allowed("otherbot", "/publications/a.html")).toBe(true);
		expect(allowed("otherbot", "/example/x.html")).toBe(false);
		expect(allowed("otherbot", "/images/a.gif")).toBe(false);
		expect(allowed("otherbot", "/images/a.gif?x=1")).toBe(true); // `$` anchors the end of the path and query
		expect(allowed("otherbot", "/about")).toBe(true);
	});

	test("5.1: foobot reaches only its two allowed paths", () => {
		expect(allowed("foobot", "/example/page.html")).toBe(true);
		expect(allowed("foobot", "/example/allowed.gif")).toBe(true);
		expect(allowed("foobot", "/example/other.html")).toBe(false);
		expect(allowed("foobot", "/")).toBe(false);
	});

	test("5.1: a group with two user-agent lines applies to both", () => {
		expect(allowed("barbot", "/example/page.html")).toBe(false);
		expect(allowed("bazbot", "/example/page.html")).toBe(false);
		expect(allowed("bazbot", "/example/other.html")).toBe(true);
	});

	test("5.1: an empty group at the end of the file allows everything", () => {
		expect(allowed("quxbot", "/example/page.html")).toBe(true);
		expect(robotsVerdict(simple, ["quxbot"], "/x").group).toBe("quxbot");
	});

	test("user-agent matching is case-insensitive", () => {
		expect(allowed("FooBot", "/example/other.html")).toBe(false);
	});

	test("5.2: the longest match wins", () => {
		const r = parseRobots("User-Agent: foobot\nAllow: /example/page/\nDisallow: /example/page/disallowed.gif\n");
		expect(robotsVerdict(r, ["foobot"], "/example/page/disallowed.gif").allowed).toBe(false);
		expect(robotsVerdict(r, ["foobot"], "/example/page/other.gif").allowed).toBe(true);
	});

	test("2.2.2: an allow and an equivalent disallow resolve to allow", () => {
		const r = parseRobots("User-agent: *\nDisallow: /page\nAllow: /page\n");
		expect(robotsVerdict(r, ["Googlebot"], "/page").allowed).toBe(true);
	});

	test("Figure 2: groups naming the same product token are merged", () => {
		const r = parseRobots("user-agent: ExampleBot\ndisallow: /foo\ndisallow: /bar\n\nuser-agent: ExampleBot\ndisallow: /baz\n");
		for (const p of ["/foo", "/bar", "/baz"]) expect(robotsVerdict(r, ["ExampleBot"], p).allowed).toBe(false);
		expect(robotsVerdict(r, ["ExampleBot"], "/qux").allowed).toBe(true);
	});

	test("Figure 3: without a matching group the * group applies, not another bot's", () => {
		const r = parseRobots("user-agent: *\ndisallow: /foo\ndisallow: /bar\n\nuser-agent: BazBot\ndisallow: /baz\n");
		expect(robotsVerdict(r, ["ExampleBot"], "/foo").allowed).toBe(false);
		expect(robotsVerdict(r, ["ExampleBot"], "/baz").allowed).toBe(true);
		expect(robotsVerdict(r, ["ExampleBot"], "/foo").group).toBe("*");
	});

	test("no group at all: no rules apply, and /robots.txt is implicitly allowed", () => {
		expect(robotsVerdict(parseRobots(""), ["Googlebot"], "/anything").allowed).toBe(true);
		const r = parseRobots("User-agent: *\nDisallow: /\n");
		expect(robotsVerdict(r, ["Googlebot"], "/robots.txt").allowed).toBe(true);
		expect(robotsVerdict(r, ["Googlebot"], "/index.html").allowed).toBe(false);
	});

	test("Figure 4: percent-encoding normalisation before comparison", () => {
		expect(normalisePath("/foo/bar?baz=quz")).toBe("/foo/bar?baz=quz");
		expect(normalisePath("/foo/bar/\u30c4")).toBe("/foo/bar/%E3%83%84");
		expect(normalisePath("/foo/bar/%e3%83%84")).toBe("/foo/bar/%E3%83%84");
		expect(normalisePath("/foo/bar/%62%61%7A")).toBe("/foo/bar/baz");
		expect(patternMatches("/foo/bar/%62%61%7A", "/foo/bar/baz")).toBe(true);
		expect(patternMatches("/foo/bar/\u30c4", "/foo/bar/%E3%83%84")).toBe(true);
	});

	test("matching starts at the first octet and is case-sensitive; * spans any octets", () => {
		expect(patternMatches("/fish", "/fish.html")).toBe(true);
		expect(patternMatches("/fish", "/Fish.html")).toBe(false);
		expect(patternMatches("/fish", "/catfish")).toBe(false);
		expect(patternMatches("/*.php$", "/a/b/index.php")).toBe(true);
		expect(patternMatches("/*.php$", "/index.php?x")).toBe(false);
	});

	test("the more specific token decides before the * group", () => {
		const r = parseRobots("User-agent: Googlebot-Image\nDisallow: /photos\n\nUser-agent: *\nDisallow: /\n");
		expect(robotsVerdict(r, ["Googlebot-Image", "Googlebot"], "/page").allowed).toBe(true);
		expect(robotsVerdict(r, ["Googlebot-Image", "Googlebot"], "/photos/1").allowed).toBe(false);
		expect(robotsVerdict(r, ["Googlebot"], "/page").allowed).toBe(false);
	});

	test("the parser records orphan rules, invalid paths, sitemaps and noindex lines with line numbers", () => {
		const r = parseRobots("Disallow: /early\nUser-agent: *\nDisallow: private\nNoindex: /x\nSitemap: /s.xml\n");
		expect(r.orphanRules.map((l) => l.line)).toEqual([1]);
		expect(r.invalidPaths.map((l) => [l.line, l.value])).toEqual([[3, "private"]]);
		expect(r.noindexLines.map((l) => l.line)).toEqual([4]);
		expect(r.sitemaps).toEqual([{ value: "/s.xml", line: 5 }]);
	});
});

describe("sitemap tokenizer", () => {
	test("resolves namespaces by prefix and default namespace", () => {
		const root = parseXml(
			`<?xml version="1.0"?>\n<urlset xmlns="${NS.sitemap}" xmlns:i="${NS.image}"><url><loc>http://a.test/</loc><i:image><i:loc>http://a.test/1.png</i:loc></i:image></url></urlset>`,
		);
		expect([root.ns, root.local]).toEqual([NS.sitemap, "urlset"]);
		const img = root.children[0]?.children[1];
		expect([img?.ns, img?.local]).toEqual([NS.image, "image"]);
	});

	test("decodes entities and CDATA and skips comments", () => {
		const root = parseXml(`<a><!-- note --><b>x &amp; y &#65;&#x42;<![CDATA[<raw>]]></b></a>`);
		expect(root.children[0]?.text).toBe("x & y AB<raw>");
	});

	test("reports the first well-formedness error with its line", () => {
		const cases: [string, number][] = [
			["<a>\n<b></a>", 2],
			["<a>\n\n</a><b/>", 3],
			["<a>&bogus;</a>", 1],
			["<a>\n<p:b/></a>", 2],
			["<a x='1' x='2'/>", 1],
		];
		for (const [doc, line] of cases) {
			let err: unknown = null;
			try {
				parseXml(doc);
			} catch (e) {
				err = e;
			}
			expect(err).toBeInstanceOf(XmlError);
			expect((err as XmlError).line).toBe(line);
		}
	});

	test("models urlset, sitemapindex and text sitemaps", () => {
		const set = parseSitemap(
			`<urlset xmlns="${NS.sitemap}">\n<url><loc> http://a.test/x </loc><lastmod>2024-01-02</lastmod></url>\n</urlset>`,
			"http://a.test/sitemap.xml",
		);
		expect(set.type).toBe("urlset");
		expect(set.urls[0]).toMatchObject({ loc: "http://a.test/x", lastmod: "2024-01-02", locLine: 2 });
		const index = parseSitemap(`<sitemapindex xmlns="${NS.sitemap}"><sitemap><loc>http://a.test/1.xml</loc></sitemap></sitemapindex>`, "http://a.test/i.xml");
		expect([index.type, index.sitemaps[0]?.loc]).toEqual(["sitemapindex", "http://a.test/1.xml"]);
		const text = parseSitemap("http://a.test/\n\nnot-a-url\n", "http://a.test/urls.txt");
		expect(text.type).toBe("text");
		expect(text.textLines).toEqual([
			{ line: 1, value: "http://a.test/" },
			{ line: 3, value: "not-a-url" },
		]);
		const broken = parseSitemap(`<urlset xmlns="${NS.sitemap}">\n<url><loc>x</url>`, "http://a.test/b.xml");
		expect(broken.error?.line).toBe(2);
	});

	test("W3C Datetime accepts the profile's forms only", () => {
		for (const ok of ["2024", "2024-05", "2024-05-01", "2024-05-01T10:00Z", "2024-05-01T10:00:30.5+01:00"]) expect(W3C_DATETIME.test(ok)).toBe(true);
		for (const bad of ["2024-13-01", "2024-05-01T10:00", "yesterday", "01/05/2024", "2024-05-01 10:00Z"]) expect(W3C_DATETIME.test(bad)).toBe(false);
	});
});

describe("head scanner", () => {
	test("the first element not valid in <head> ends it, and later head elements are ignored", () => {
		const s = scanHead(
			`<!doctype html>\n<html><head>\n<title>t</title>\n<link rel="canonical" href="/a">\n<div>x</div>\n<meta name="robots" content="noindex">\n</head><body><p>b</p></body></html>`,
		);
		expect(s.invalid?.name).toBe("div");
		expect(s.invalid?.line).toBe(5);
		expect(s.headEnd.reason).toBe("invalid-element");
		expect(s.ignoredAfterInvalid.map((t) => t.name)).toEqual(["meta"]);
		expect(s.tags.find((t) => t.name === "link")?.region).toBe("head");
		expect(s.tags.find((t) => t.name === "meta")?.region).toBe("body");
	});

	test("a clean head ends at </head> and keeps every element in head", () => {
		const s = scanHead(`<html><head><title>t</title><meta name="x" content="y"><script>var a="<div>";</script></head><body><div></div></body></html>`);
		expect(s.invalid).toBeNull();
		expect(s.headEnd.reason).toBe("end-tag");
		expect(s.tags.filter((t) => t.region === "head").map((t) => t.name)).toEqual(expect.arrayContaining(["title", "meta", "script"]));
		expect(s.tags.find((t) => t.name === "div")?.region).toBe("body");
	});

	test("non-whitespace text ends an implied head", () => {
		const s = scanHead(`<title>t</title>hello<link rel="canonical" href="/a">`);
		expect(s.headEnd.reason).toBe("text");
		expect(s.tags.find((t) => t.name === "link")?.region).toBe("body");
	});
});

describe("Link header parser (RFC 8288)", () => {
	test("splits entries and lowercases rel", () => {
		expect(parseLinkHeader('<https://a.test/x>; rel="Canonical", <https://a.test/de>; rel=alternate; hreflang="de"')).toEqual([
			{ href: "https://a.test/x", params: { rel: "canonical" } },
			{ href: "https://a.test/de", params: { rel: "alternate", hreflang: "de" } },
		]);
	});
	test("tolerates a missing header and commas inside the URI", () => {
		expect(parseLinkHeader(undefined)).toEqual([]);
		expect(parseLinkHeader("<https://a.test/a,b>; rel=canonical")[0]?.href).toBe("https://a.test/a,b");
	});
});

describe("SSRF guard", () => {
	test("classifies addresses", () => {
		const cases: [string, string][] = [
			["127.0.0.1", "loopback"],
			["::1", "loopback"],
			["10.1.2.3", "private"],
			["172.16.0.1", "private"],
			["172.32.0.1", "public"],
			["192.168.1.1", "private"],
			["100.64.0.1", "private"],
			["169.254.1.1", "link-local"],
			["169.254.169.254", "metadata"],
			["100.100.100.200", "metadata"],
			["fd00:ec2::254", "metadata"],
			["::ffff:169.254.169.254", "metadata"],
			["::ffff:10.0.0.1", "private"],
			["fd12:3456::1", "private"],
			["fe80::1", "link-local"],
			["0.0.0.0", "reserved"],
			["::", "reserved"],
			["8.8.8.8", "public"],
			["2001:4860:4860::8888", "public"],
		];
		for (const [ip, cls] of cases) expect(`${ip} ${classifyAddress(ip)}`).toBe(`${ip} ${cls}`);
	});

	test("refuses private, loopback and metadata targets unless --allow-local names them; metadata always", async () => {
		const resolver = async (host: string) => ({ "intranet.test": ["10.0.0.7"], "public.test": ["93.184.215.14"], "rebind.test": ["93.184.215.14", "127.0.0.1"] })[host] ?? [];
		const g = new Guard(["http://intranet.test:8080", "http://169.254.169.254"], resolver);
		expect((await g.check("http://public.test/")).allowed).toBe(true);
		expect((await g.check("http://intranet.test:8080/x")).allowed).toBe(true);
		expect((await g.check("http://intranet.test/x")).allowed).toBe(false); // other port: not the named origin
		expect((await g.check("http://rebind.test/")).reason).toContain("loopback");
		expect((await g.check("http://127.0.0.1:9/")).allowed).toBe(false);
		expect((await g.check("http://169.254.169.254/latest/meta-data/")).reason).toContain("metadata");
		expect((await g.check("http://metadata.google.internal/")).allowed).toBe(false);
		expect((await g.check("file:///etc/passwd")).allowed).toBe(false);
		expect((await g.check("http://user:pw@public.test/")).allowed).toBe(false);
	});

	test("loopback fixture origins", () => {
		for (const o of ["http://127.0.0.1:47101", "http://localhost:8080", "http://[::1]:3000", "https://127.0.0.1:47209"]) expect(isLoopbackFixtureOrigin(o)).toBe(true);
		for (const o of ["http://10.0.0.5:8080", "https://example.com", "http://127.0.0.1.nip.io", "ftp://127.0.0.1"]) expect(isLoopbackFixtureOrigin(o)).toBe(false);
	});
});

// Two loopback servers: `allowed` is named by --allow-local, `forbidden` is not. Every test below must leave the
// forbidden server's hit counter at zero.
describe("guard boundary on the wire", () => {
	let allowed: Server<undefined>;
	let forbidden: Server<undefined>;
	let forbiddenHits = 0;
	let allowedOrigin = "";
	let forbiddenOrigin = "";
	beforeAll(() => {
		forbidden = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch() {
				forbiddenHits++;
				return new Response("secret");
			},
		});
		forbiddenOrigin = `http://127.0.0.1:${forbidden.port}`;
		allowed = Bun.serve({
			port: 0,
			hostname: "127.0.0.1",
			fetch(req) {
				const path = new URL(req.url).pathname;
				if (path === "/to-forbidden") return new Response(null, { status: 302, headers: { location: `${forbiddenOrigin}/` } });
				if (path === "/to-private") return new Response(null, { status: 301, headers: { location: "http://10.255.255.1/admin" } });
				if (path === "/to-metadata") return new Response(null, { status: 301, headers: { location: "http://169.254.169.254/latest/meta-data/" } });
				return new Response("ok");
			},
		});
		allowedOrigin = `http://127.0.0.1:${allowed.port}`;
	});
	afterAll(() => {
		allowed.stop(true);
		forbidden.stop(true);
	});

	test("fetchChain refuses a redirect hop to a private address before connecting", async () => {
		const guard = new Guard([allowedOrigin]);
		const r = await fetchChain(`${allowedOrigin}/to-private`, { guard, budget: new Budget(10) });
		expect(r.hops.map((h) => h.status)).toEqual([301]);
		expect(r.refused).toContain("private");
		expect(guard.refusals[0]).toMatchObject({ target: "http://10.255.255.1/admin", via: "fetch" });
	});

	test("fetchChain refuses a redirect hop to a metadata address", async () => {
		const guard = new Guard([allowedOrigin]);
		const r = await fetchChain(`${allowedOrigin}/to-metadata`, { guard, budget: new Budget(10) });
		expect(r.refused).toContain("metadata");
	});

	test("fetchChain refuses a redirect to an unnamed loopback origin", async () => {
		const guard = new Guard([allowedOrigin]);
		const r = await fetchChain(`${allowedOrigin}/to-forbidden`, { guard, budget: new Budget(10) });
		expect(r.refused).toContain("not named by --allow-local");
		expect(r.status).toBeNull();
	});

	test("the budget stops the skill's own fetches", async () => {
		const guard = new Guard([allowedOrigin]);
		const budget = new Budget(1);
		expect((await fetchChain(`${allowedOrigin}/a`, { guard, budget })).status).toBe(200);
		const second = await fetchChain(`${allowedOrigin}/b`, { guard, budget });
		expect([second.budgetExhausted, second.status]).toEqual([true, null]);
	});

	// Sends one raw request through the proxy and returns everything the proxy answers.
	async function viaProxy(port: number, head: string): Promise<string> {
		const { promise, resolve, reject } = Promise.withResolvers<string>();
		const chunks: Buffer[] = [];
		const s = connect(port, "127.0.0.1", () => s.write(head));
		s.on("data", (c: Buffer) => chunks.push(c));
		s.on("close", () => resolve(Buffer.concat(chunks).toString("latin1")));
		s.on("error", reject);
		return promise;
	}
	const get = (url: string) => `GET ${url} HTTP/1.1\r\nHost: ${new URL(url).host}\r\nConnection: close\r\n\r\n`;

	test("the proxy forwards an allowed plain request and refuses an unnamed origin", async () => {
		const guard = new Guard([allowedOrigin]);
		const proxy = new GuardProxy(guard);
		const port = await proxy.start();
		try {
			expect(await viaProxy(port, get(`${allowedOrigin}/page`))).toMatch(/^HTTP\/1\.1 200[\s\S]*ok$/);
			expect(await viaProxy(port, get(`${forbiddenOrigin}/`))).toStartWith("HTTP/1.1 403");
			expect(await viaProxy(port, get("http://169.254.169.254/latest/meta-data/"))).toStartWith("HTTP/1.1 403");
			expect(guard.refusals.map((r) => r.via)).toEqual(["proxy-http", "proxy-http"]);
		} finally {
			await proxy.stop();
		}
	});

	test("the proxy refuses CONNECT to unnamed, private and metadata destinations", async () => {
		const guard = new Guard([allowedOrigin]);
		const proxy = new GuardProxy(guard);
		const port = await proxy.start();
		try {
			for (const target of [`127.0.0.1:${forbidden.port}`, "10.0.0.1:443", "169.254.169.254:80", "[::1]:443"]) {
				const answer = await viaProxy(port, `CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
				expect(`${target} ${answer.split("\r\n")[0]}`).toBe(`${target} HTTP/1.1 403 Forbidden`);
			}
			expect(guard.refusals.every((r) => r.via === "proxy-connect")).toBe(true);
		} finally {
			await proxy.stop();
		}
	});

	test("the proxy refuses transaction 301 of a run, and a new run starts a new count", async () => {
		const guard = new Guard([allowedOrigin]);
		const proxy = new GuardProxy(guard);
		const port = await proxy.start();
		try {
			for (let batch = 0; batch < 300; batch += 50) {
				const answers = await Promise.all(Array.from({ length: 50 }, (_, i) => viaProxy(port, get(`${allowedOrigin}/n${batch + i}`))));
				expect(answers.every((a) => a.startsWith("HTTP/1.1 200"))).toBe(true);
			}
			const over = await viaProxy(port, get(`${allowedOrigin}/n300`));
			expect(over).toStartWith("HTTP/1.1 403");
			expect(over).toContain("transaction 301 exceeds the 300 per run");
			expect(guard.refusals).toHaveLength(1);
			expect(guard.refusals[0]?.via).toBe("proxy-limit");
			proxy.beginRun("second");
			expect(await viaProxy(port, get(`${allowedOrigin}/again`))).toStartWith("HTTP/1.1 200");
		} finally {
			await proxy.stop();
		}
	});

	test("no request reached the unnamed origin", () => {
		expect(forbiddenHits).toBe(0);
	});
});

describe("--chrome-no-sandbox refusal", () => {
	const loopback = ["--url", "http://127.0.0.1:47101/", "--allow-local", "http://127.0.0.1:47101", "--chrome-no-sandbox"];

	test("parseArgs accepts it when every --url and --allow-local origin is loopback", () => {
		expect(parseArgs(loopback, {}).collect.chromeNoSandbox).toBe(true);
	});

	test("parseArgs refuses it for a public --url or a non-loopback --allow-local origin", () => {
		expect(() => parseArgs(["--url", "https://example.com/", "--chrome-no-sandbox"], {})).toThrow(UsageError);
		expect(() => parseArgs([...loopback, "--allow-local", "http://10.0.0.5:8080"], {})).toThrow(/^refused: --chrome-no-sandbox/);
		expect(() => parseArgs([...loopback, "--url", "https://example.com/"], {})).toThrow(/not loopback: https:\/\/example\.com/);
	});

	test("audit.ts exits 2 with the refusal and fetches nothing", async () => {
		const r = await runAudit(["--url", "https://example.com/", "--chrome-no-sandbox", "--no-lighthouse"]);
		expect(r.code).toBe(2);
		expect(r.stderr).toStartWith("refused: --chrome-no-sandbox");
		expect(r.stdout).toBe("");
	});
});

describe("argument parsing", () => {
	test("outputs default to $TMPDIR/seo-audit/<host>-<UTC timestamp>", () => {
		const a = parseArgs(["--url", "https://shop.example:8443/x"], { TMPDIR: "/tmp/t" }, new Date("2026-03-04T05:06:07Z"));
		expect(a.out).toMatch(/^\/tmp\/t\/seo-audit\/shop\.example_8443-20260304T050607Z$/);
	});

	test("--out inside --repo is refused", () => {
		expect(() => parseArgs(["--url", "https://a.example/", "--repo", "/tmp/proj", "--out", "/tmp/proj/out"], {})).toThrow(/inside the audited project/);
	});
});
