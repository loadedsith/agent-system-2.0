// Migration items, one file each (workload wl-mv5mvvs64ahq0w): the pure half of the numbering tool.
// A new migration item is a file migration/items/<slug>.md whose header a PR writes without a number;
// after the PR merges, the `migration-number` GitHub Action (.github/workflows/migration-number.yml,
// running surface/scripts/migration-items.ts) adds `number: N` and rewrites MIGRATION.md's index.
// Nothing here touches git or the file system: the CLI reads the tree and history and hands them in.
//
// The shapes (the workload's CONTRACT.md):
// - item header: `---`, then exactly `title:`, `status:`, `workload:`, `pr:` in that order, then
//   optionally the bot's `number:` as the last key, then `---` and a free markdown body;
// - MIGRATION.md index: the lines strictly between INDEX_START and INDEX_END, a `| # | item |` table
//   with rows `| <N> | [<title>](migration/items/<slug>.md) |` sorted by number;
// - legacy items: lines `^(\d+)\. \*\*` inside the `## M7 follow-ups` section (that heading to the
//   next `## `), never numbered above LEGACY_CEILING;
// - numbering commits: author `as2-numbering`, subject `migration: number <N> <slug>[, <N> <slug>…]`;
//   `published` is the pairs those subjects carry on main's first-parent chain, never on HEAD's
//   (save `check --trust-head` with no base, which runners that predate the trusted-main tag need).

/** The highest legacy MIGRATION.md item number; every item file is numbered above it. */
export const LEGACY_CEILING = 120;

export const ITEMS_DIR = "migration/items";
export const MIGRATION_FILE = "MIGRATION.md";
export const INDEX_START = "<!-- migration-items:index:start -->";
export const INDEX_END = "<!-- migration-items:index:end -->";
export const INDEX_HEADER = ["| # | item |", "|---|---|"] as const;
export const LEGACY_SECTION = "## M7 follow-ups";
export const NUMBERING_NAME = "as2-numbering";
export const NUMBERING_EMAIL = "as2-numbering@users.noreply.github.com";
export const STATUSES = ["open", "designed", "building", "done", "superseded"] as const;
export const SLUG_MAX = 60;

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const WORKLOAD_RE = /^(wl-[a-z0-9]+|none)$/;
const PR_RE = /^([1-9][0-9]*|none)$/;
const NUMBER_RE = /^[1-9][0-9]*$/;
const HEADER_KEYS = ["title", "status", "workload", "pr"] as const;
const LEGACY_RE = /^(\d+)\. \*\*/;
const ROW_RE = /^\| ([1-9][0-9]*) \| \[(.*)\]\(migration\/items\/([^)]*)\.md\) \|$/;
const SUBJECT_PREFIX = "migration: number ";
const PAIR_RE = /^([1-9][0-9]*) ([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export type Status = (typeof STATUSES)[number];

export interface ItemHeader {
	title: string;
	status: Status;
	workload: string;
	pr: string;
	number: number | null;
}

/** One file under ITEMS_DIR as read from a tree: its file name and its text. */
export interface ItemFile {
	name: string;
	text: string;
}

export interface Pair {
	number: number;
	slug: string;
}

export interface LegacyItem {
	number: number;
	/** 1-based line in MIGRATION.md. */
	line: number;
}

export interface IndexRow {
	number: number;
	title: string;
	slug: string;
}

export function isSlug(s: string): boolean {
	return s.length <= SLUG_MAX && SLUG_RE.test(s);
}

/** The slug a file name names, or null when the name is not `<slug>.md`. */
export function slugOfName(name: string): string | null {
	if (!name.endsWith(".md")) return null;
	const slug = name.slice(0, -3);
	return isSlug(slug) ? slug : null;
}

/** The header of an item file, or the reasons it is not one. */
export function parseItem(text: string): { header: ItemHeader; errors: [] } | { header: null; errors: string[] } {
	const lines = text.split("\n");
	if (lines[0] !== "---") return { header: null, errors: ["the first line is not `---`"] };
	const close = lines.indexOf("---", 1);
	if (close === -1) return { header: null, errors: ["no closing `---` after the header"] };
	const body = lines.slice(1, close);
	const errors: string[] = [];
	const values: Record<string, string> = {};
	const keys = body.length === HEADER_KEYS.length + 1 ? [...HEADER_KEYS, "number"] : [...HEADER_KEYS];
	if (body.length !== keys.length) {
		errors.push(`the header has ${body.length} lines; it must be exactly ${HEADER_KEYS.join(", ")} (the bot alone adds number last)`);
		return { header: null, errors };
	}
	keys.forEach((key, i) => {
		const line = body[i]!;
		const prefix = `${key}: `;
		if (!line.startsWith(prefix)) errors.push(`header line ${i + 2} must be \`${key}: …\`, found \`${line}\``);
		else values[key] = line.slice(prefix.length);
	});
	if (errors.length) return { header: null, errors };
	const title = values.title!;
	if (title.trim() === "" || title !== title.trim()) errors.push("title is empty or has leading or trailing spaces");
	if (title.includes("|")) errors.push("title contains `|`");
	if (!(STATUSES as readonly string[]).includes(values.status!)) errors.push(`status \`${values.status}\` is not one of ${STATUSES.join(" | ")}`);
	if (!WORKLOAD_RE.test(values.workload!)) errors.push(`workload \`${values.workload}\` is not wl-<id> or none`);
	if (!PR_RE.test(values.pr!)) errors.push(`pr \`${values.pr}\` is not a number or none`);
	if (values.number !== undefined && !NUMBER_RE.test(values.number)) errors.push(`number \`${values.number}\` is not a positive integer`);
	if (errors.length) return { header: null, errors };
	return {
		header: {
			title,
			status: values.status as Status,
			workload: values.workload!,
			pr: values.pr!,
			number: values.number === undefined ? null : Number(values.number),
		},
		errors: [],
	};
}

/** The item text with `number: n` added as the last header line. The text must parse with no number. */
export function addNumberLine(text: string, n: number): string {
	const lines = text.split("\n");
	const close = lines.indexOf("---", 1);
	if (close === -1) throw new Error("addNumberLine: no closing `---`");
	lines.splice(close, 0, `number: ${n}`);
	return lines.join("\n");
}

/** Legacy items: numbered `N. **` lines in the M7 follow-ups section. */
export function scanLegacy(migration: string): LegacyItem[] {
	const lines = migration.split("\n");
	const out: LegacyItem[] = [];
	let inside = false;
	lines.forEach((line, i) => {
		if (line.startsWith("## ")) inside = line.startsWith(LEGACY_SECTION);
		else if (inside) {
			const m = LEGACY_RE.exec(line);
			if (m) out.push({ number: Number(m[1]), line: i + 1 });
		}
	});
	return out;
}

export function formatSubject(pairs: Pair[]): string {
	const sorted = [...pairs].sort((a, b) => a.number - b.number);
	return SUBJECT_PREFIX + sorted.map((p) => `${p.number} ${p.slug}`).join(", ");
}

/** The pairs a numbering commit's subject carries, or null when the subject is not one. */
export function parseSubject(subject: string): Pair[] | null {
	if (!subject.startsWith(SUBJECT_PREFIX)) return null;
	const parts = subject.slice(SUBJECT_PREFIX.length).split(", ");
	const pairs: Pair[] = [];
	for (const part of parts) {
		const m = PAIR_RE.exec(part);
		if (!m) return null;
		pairs.push({ number: Number(m[1]), slug: m[2]! });
	}
	return pairs;
}

/** A first-parent commit as the CLI reads it from `git log`. */
export interface LogCommit {
	authorEmail: string;
	subject: string;
}

/** Published pairs, oldest first, from first-parent commits given oldest first. */
export function publishedFrom(commits: LogCommit[]): Pair[] {
	const out: Pair[] = [];
	for (const c of commits) {
		if (c.authorEmail !== NUMBERING_EMAIL) continue;
		const pairs = parseSubject(c.subject);
		if (pairs) out.push(...pairs);
	}
	return out;
}

/** slug→number, the first published number of each slug. */
export function publishedMap(pairs: Pair[]): Map<string, number> {
	const m = new Map<string, number>();
	for (const p of pairs) if (!m.has(p.slug)) m.set(p.slug, p.number);
	return m;
}

/** The index block's position: the line indices of the two markers, or the reason it cannot be found. */
export function findIndex(migration: string): { start: number; end: number } | { error: string } {
	const lines = migration.split("\n");
	const starts = lines.flatMap((l, i) => (l === INDEX_START ? [i] : []));
	const ends = lines.flatMap((l, i) => (l === INDEX_END ? [i] : []));
	if (starts.length !== 1 || ends.length !== 1) {
		return { error: `${MIGRATION_FILE} must hold exactly one \`${INDEX_START}\` line and one \`${INDEX_END}\` line (found ${starts.length} and ${ends.length})` };
	}
	if (starts[0]! > ends[0]!) return { error: `${MIGRATION_FILE}: \`${INDEX_END}\` comes before \`${INDEX_START}\`` };
	return { start: starts[0]!, end: ends[0]! };
}

/** The lines between the markers for these rows. */
export function renderIndex(rows: IndexRow[]): string[] {
	const sorted = [...rows].sort((a, b) => a.number - b.number || a.slug.localeCompare(b.slug));
	return [...INDEX_HEADER, ...sorted.map((r) => `| ${r.number} | [${r.title}](${ITEMS_DIR}/${r.slug}.md) |`)];
}

/** MIGRATION.md with the lines strictly between the markers replaced. Throws when the markers are not found. */
export function replaceIndex(migration: string, rows: IndexRow[]): string {
	const at = findIndex(migration);
	if ("error" in at) throw new Error(at.error);
	const lines = migration.split("\n");
	return [...lines.slice(0, at.start + 1), ...renderIndex(rows), ...lines.slice(at.end)].join("\n");
}

/** The index rows and any line between the markers that is neither the table header nor a row. */
export function parseIndex(migration: string): { rows: IndexRow[]; errors: string[] } {
	const at = findIndex(migration);
	if ("error" in at) return { rows: [], errors: [at.error] };
	const lines = migration.split("\n").slice(at.start + 1, at.end);
	const errors: string[] = [];
	const rows: IndexRow[] = [];
	lines.forEach((line, i) => {
		if (i < INDEX_HEADER.length) {
			if (line !== INDEX_HEADER[i]) errors.push(`index line ${i + 1} must be \`${INDEX_HEADER[i]}\`, found \`${line}\``);
			return;
		}
		const m = ROW_RE.exec(line);
		if (m) rows.push({ number: Number(m[1]), title: m[2]!, slug: m[3]! });
		else errors.push(`index line ${i + 1} is not a row \`| <N> | [<title>](${ITEMS_DIR}/<slug>.md) |\`: \`${line}\``);
	});
	if (lines.length < INDEX_HEADER.length) errors.push("the index is missing its `| # | item |` header lines");
	return { rows, errors };
}

/** An item file as the checks see it: its slug when the name is one, its header when it parses. */
interface ReadItem {
	name: string;
	slug: string | null;
	header: ItemHeader | null;
	errors: string[];
}

function readItems(files: ItemFile[]): ReadItem[] {
	return files.map((f) => {
		const slug = slugOfName(f.name);
		const parsed = parseItem(f.text);
		const errors = [...parsed.errors];
		if (!slug) errors.unshift(`the file name is not <slug>.md with a slug matching ${SLUG_RE.source} of at most ${SLUG_MAX} characters`);
		return { name: f.name, slug, header: parsed.header, errors };
	});
}

export interface TreeInput {
	/** Files under ITEMS_DIR (names only, no subdirectories). */
	items: ItemFile[];
	/** MIGRATION.md's text. */
	migration: string;
	/** Published pairs from the base's first-parent chain, oldest first. */
	published: Pair[];
	/** The ceiling in force (LEGACY_CEILING unless a test says otherwise). */
	ceiling?: number;
}

export interface CheckOptions {
	/** Leave out the index-equals-files rule (the `number` step rewrites the index anyway). */
	skipIndexRows?: boolean;
}

/** Every rule `check` enforces on a tree; an empty list passes. */
export function checkTree(input: TreeInput, opts: CheckOptions = {}): string[] {
	const ceiling = input.ceiling ?? LEGACY_CEILING;
	const errors: string[] = [];
	const items = readItems(input.items);
	for (const it of items) for (const e of it.errors) errors.push(`${ITEMS_DIR}/${it.name}: ${e}`);

	const published = publishedMap(input.published);
	const slugNumbers = new Map<string, Set<number>>();
	for (const p of input.published) {
		const s = slugNumbers.get(p.slug) ?? new Set<number>();
		s.add(p.number);
		slugNumbers.set(p.slug, s);
	}
	for (const [slug, nums] of slugNumbers) {
		if (nums.size > 1) errors.push(`main published ${slug} under more than one number: ${[...nums].sort((a, b) => a - b).join(", ")}`);
	}

	for (const it of items) {
		if (!it.slug || !it.header || it.header.number === null) continue;
		const want = published.get(it.slug);
		if (want === undefined) {
			errors.push(`${ITEMS_DIR}/${it.name}: number ${it.header.number} was never published on main; numbers are written only by the migration-number action, so drop the \`number:\` line`);
		} else if (want !== it.header.number) {
			errors.push(`${ITEMS_DIR}/${it.name}: number ${it.header.number} differs from the number main published for it, ${want}`);
		}
	}

	const legacy = scanLegacy(input.migration);
	for (const l of legacy) {
		if (l.number > ceiling) {
			errors.push(`${MIGRATION_FILE}:${l.line}: legacy item ${l.number} is above LEGACY_CEILING ${ceiling}; a new item is a file ${ITEMS_DIR}/<slug>.md, not a numbered line`);
		}
	}

	const holders = new Map<number, Set<string>>();
	const hold = (n: number, who: string) => {
		const s = holders.get(n) ?? new Set<string>();
		s.add(who);
		holders.set(n, s);
	};
	for (const p of input.published) hold(p.number, `item ${p.slug}`);
	for (const it of items) if (it.slug && it.header?.number != null) hold(it.header.number, `item ${it.slug}`);
	for (const l of legacy) hold(l.number, `legacy item at ${MIGRATION_FILE}:${l.line}`);
	for (const [n, who] of [...holders].sort((a, b) => a[0] - b[0])) {
		const list = [...who];
		if (list.length > 1 && list.some((w) => w.startsWith("item "))) errors.push(`number ${n} is held by more than one thing: ${list.join(", ")}`);
	}

	const at = findIndex(input.migration);
	if ("error" in at) errors.push(at.error);
	else if (!opts.skipIndexRows) {
		const index = parseIndex(input.migration);
		for (const e of index.errors) errors.push(`${MIGRATION_FILE} index: ${e}`);
		const files = new Set(items.flatMap((it) => (it.slug && it.header?.number != null ? [`${it.header.number} ${it.slug}`] : [])));
		const rows = new Map<string, number>();
		for (const { number, slug } of index.rows) rows.set(`${number} ${slug}`, (rows.get(`${number} ${slug}`) ?? 0) + 1);
		for (const [r, count] of rows) {
			if (count > 1) errors.push(`${MIGRATION_FILE} index: row ${r} appears ${count} times`);
			if (!files.has(r)) errors.push(`${MIGRATION_FILE} index: row ${r} has no numbered file ${ITEMS_DIR}/${r.split(" ")[1]}.md`);
		}
		for (const f of files) if (!rows.has(f)) errors.push(`${MIGRATION_FILE} index: numbered file ${f} has no row`);
	}
	return errors;
}

export interface NumberingInput extends TreeInput {
	/**
	 * Position of each slug's adding commit on the base's first-parent history (oldest first);
	 * a slug missing here sorts after every positioned one.
	 */
	addOrder: Map<string, number>;
}

export interface NumberingPlan {
	/** Pairs written by this run: restored published numbers and new ones. */
	pairs: Pair[];
	/** Item files to rewrite, by file name. */
	files: Map<string, string>;
	/** MIGRATION.md's new text, or null when it is unchanged. */
	migration: string | null;
	/** The commit subject, or null when nothing changes. */
	subject: string | null;
}

/**
 * What `number` writes. Throws nothing: the caller runs checkTree (with skipIndexRows) first and
 * refuses on errors. A slug main already published gets that number back; the rest get
 * max(ceiling, published, legacy)+1 onward in adding order, ties by slug.
 */
export function planNumbering(input: NumberingInput): NumberingPlan {
	const ceiling = input.ceiling ?? LEGACY_CEILING;
	const published = publishedMap(input.published);
	const items = readItems(input.items).filter((it) => it.slug && it.header) as (ReadItem & { slug: string; header: ItemHeader })[];
	let next = Math.max(ceiling, ...input.published.map((p) => p.number), ...scanLegacy(input.migration).map((l) => l.number)) + 1;
	const unnumbered = items.filter((it) => it.header.number === null);
	const restored = unnumbered.filter((it) => published.has(it.slug));
	const fresh = unnumbered
		.filter((it) => !published.has(it.slug))
		.sort((a, b) => (input.addOrder.get(a.slug) ?? Infinity) - (input.addOrder.get(b.slug) ?? Infinity) || a.slug.localeCompare(b.slug));
	const pairs: Pair[] = [
		...restored.map((it) => ({ number: published.get(it.slug)!, slug: it.slug })),
		...fresh.map((it) => ({ number: next++, slug: it.slug })),
	];
	const files = new Map<string, string>();
	const textOf = new Map(input.items.map((f) => [f.name, f.text]));
	const assigned = new Map(pairs.map((p) => [p.slug, p.number]));
	for (const it of unnumbered) files.set(it.name, addNumberLine(textOf.get(it.name)!, assigned.get(it.slug)!));
	const rows: IndexRow[] = items.flatMap((it) => {
		const n = it.header.number ?? assigned.get(it.slug);
		return n === undefined ? [] : [{ number: n, title: it.header.title, slug: it.slug }];
	});
	const migration = replaceIndex(input.migration, rows);
	const changed = migration !== input.migration;
	const subject = pairs.length ? formatSubject(pairs) : changed ? "migration: index" : null;
	return { pairs, files, migration: changed ? migration : null, subject };
}

/**
 * Whether a numbering commit's change to one path stays in scope: an item file only gains its
 * `number:` line; MIGRATION.md changes only between the markers. The reason when it does not.
 */
export function numberingChangeScope(path: string, before: string, after: string): string | null {
	if (path === MIGRATION_FILE) {
		const a = findIndex(before);
		const b = findIndex(after);
		if ("error" in a || "error" in b) return `${path}: index markers missing on one side`;
		const bl = before.split("\n");
		const al = after.split("\n");
		const same = (x: string[], y: string[]) => x.length === y.length && x.every((l, i) => l === y[i]);
		if (!same(bl.slice(0, a.start + 1), al.slice(0, b.start + 1)) || !same(bl.slice(a.end), al.slice(b.end))) {
			return `${path}: changed outside the index markers`;
		}
		return null;
	}
	const dir = `${ITEMS_DIR}/`;
	if (!path.startsWith(dir) || path.slice(dir.length).includes("/") || !slugOfName(path.slice(dir.length))) {
		return `${path}: not an item file or ${MIGRATION_FILE}`;
	}
	const was = parseItem(before);
	const now = parseItem(after);
	if (!was.header || was.header.number !== null) return `${path}: was not an unnumbered item`;
	if (!now.header || now.header.number === null || addNumberLine(before, now.header.number) !== after) {
		return `${path}: changed beyond adding its \`number:\` line`;
	}
	return null;
}
