# Rule modules

A rule module is a `.ts` file in this directory. The engine (`scripts/lib/engine.ts`) imports every `*.ts` file here, in name order. It skips `*.d.ts`, `*.test.ts` and names that start with `_`. Each module turns the collected evidence into hits for the `references/rules.md` rows it owns. Severity, kind, fix text and source come from the catalogue at run time, so a module never restates them.

## Interface

```ts
import type { Check } from "../lib/engine.ts";

export const rules: Record<string, Check> = {
	"CAN-006": (ctx) => ctx.audited.flatMap((p) => /* … */ []),
};
// do-not-flag.md ids, reported as dnf-note
export const notes: Record<string, Check> = {};
```

- **`Check = (ctx: RuleContext) => Hit[]`**. A hit is `{ url, locator, layer, observed }`.
- **`RuleContext`** gives a check:
  - `evidence`: the whole `Evidence` from `scripts/lib/evidence.ts`.
  - `auditTime`
  - `audited`: the pages named by `--url`.
  - `page(url)` and `site(url)`
  - `isIntentNoindex(url)`
  - `robotsAllowed(url, tokens?)`: the RFC 9309 verdict, or `null` when that origin has no usable robots.txt.
- **Module exports.** Export `rules` as a named export, and optionally `notes`. The engine rejects a module whose `rules` export is missing or holds anything other than functions.
  - A key in `rules` must be a **mechanical** rules.md id.
  - A key in `notes` must be a do-not-flag.md id.
- **The engine throws** when:
  - an id is unknown
  - an id is a judgment row
  - two modules claim the same id
  - a hit's `layer` is not one of the row's layers
- **Intent.** The engine applies intent: a `finding` row with intent-effect `observe` becomes an `observation`, with no severity, when the hit's `url` is an intent-noindex URL. Rows with intent-effect `keep` stay findings.
- **Unimplemented rows.** Every mechanical row that no module implements is listed in `findings.json` `notImplemented`, and in the report under "Not checked".

## Conventions

- **`url`** is the resource the locator points into. It is reported as `path`, which is the pathname plus the query.
  - **Page signals:** use the page's final URL (`p.fetch.finalUrl`).
  - **Status and redirect rules:** use the audited URL (`p.url`), so intent applies to it.
  - **robots.txt rules:** use the robots.txt URL.
  - **Sitemap rules:** use the sitemap's final URL.
- **`locator`** must be stable across runs, because the tests compare it. Reuse these forms:
  - HTML: `html:link[rel=canonical]`, `html:meta[name=robots]`, `html:body link[rel=canonical]`, `html:head > <tag>`, `html:<tag>#<id>` or `html:<tag>:nth(N)`, `html:a[href^="<origin>"]`, `html:meta[http-equiv=refresh]`, `html:head`
  - Headers: `header:<name>`
  - Redirect hops: `hop:N`
  - Requests: `url:<path>`
  - Lines in robots.txt or a sitemap: `line:N`
  - A rule about a page that points at a robots.txt line: `robots.txt:line:N`
  - A whole document: `doc`
- **`layer`** is one of the row's layers.
  - A rule that reads both raw and rendered HTML emits `raw-html`. It emits `rendered` only when the defect is absent from the raw HTML.
  - A rule that compares raw with rendered emits `rendered`.
- **`observed`** is the receipt: the value seen, with its line where there is one. The engine clips it to 300 characters.
- **Evidence-only.**
  - A check reads `ctx` only. It never fetches, never reads files, and never reads the clock (use `ctx.auditTime`).
  - Evidence that is missing (no render, robots.txt unreachable, a target never fetched) means no hit. It never means a guess.
- **Module ownership.**
  - `crawl-index.ts` owns rules.md categories robots, indexing, canonical, http and sitemap, plus their do-not-flag notes (DNF-07, -08, -10, -11, -16, -25, NF-BNG-1, NF-BNG-3).
  - A new family gets its own module.

## Fixtures and tests

Each fixture is a directory under `test/fixtures/<name>/`. `test/harness.ts` serves it on `127.0.0.1:<port>` and audits it with `scripts/audit.ts` as a child process.

- **`_serve.json`** holds the configuration:
  - **Audit settings:**
    - `port` (unique per fixture), optional `tls`
    - `audit.urls`, `audit.intent.noindex`
    - `audit.allowLocal`, for extra loopback origins such as `http://localhost:<port>`
    - `audit.noRender`, `audit.sample`, `audit.budget`
  - **`paths`:** per-path responses (`status`, `headers`, `body` or `file`, `padTo`, `generate: urlset|sitemapindex` with `count` and `loc`).
    - A key is a path (`/x`), a path with a query, or an origin plus a path (`http://localhost:47206/x`).
    - Any other path is served from the directory: `/` serves `index.html`, and `/x` serves `x`, `x.html` or `x/index.html`.
- **`expect.json`** is an array of `{ rule, path, locator, kind, severity, layer, modes? }`. The emissions must match it exactly, as a multiset. Severity is `null` for observations and notes.
- **`rendered/`** holds the recorded Chrome output that the tests replay. **`lhr.json`** and **`crux.json`** hold recorded Lighthouse and CrUX data, when a family needs them.
- **Tests:**
  - `test/crawl-index.test.ts` audits every fixture in parallel and compares each with its `expect.json`.
  - It asserts that every mechanical row in the five categories is planted in some `expect.json`.
  - It asserts that the controls (`control-basic`, `control-sitemap`, `control-intent`) have zero findings.
  - It asserts that the family's do-not-flag notes appear where `do-not-flag.md` says they are planted.

Re-record the rendered pages after changing a fixture's HTML. This needs system Chrome. The command launches it without its sandbox, which `audit.ts` accepts only for loopback origins:

```sh
bun skills/seo-audit/test/record-fixtures.ts [fixture …]
```

**Obligation for a new module:** its rules will also fire on the existing fixtures, for example site-wide rules on every control. Add those occurrences to the affected `expect.json` files, and keep each control free of findings unless a plant is intended. A new module brings its own fixtures, with a port that no other fixture uses (crawl/index uses 47101-47103 and 47201-47210), and its own test file.
