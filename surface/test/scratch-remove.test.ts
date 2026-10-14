// The shared scratch removal (surface/src/scratch-remove.ts), used by the close, the daily sweep and the audit's
// delete: a child is removed only when it is still the real directory judged (same dev/ino) under a physical parent,
// and it is renamed to `.removing-<name>-<hex>` in the same directory and checked again before anything is deleted.
// An ancestor swapped for a symlink between the check and the rename (the `beforeRename` seam) is caught: the
// directory the rename reached elsewhere is put back and the removal refused. newestChange reads lstat mtimes of
// every descendant, links not followed.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, lutimesSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detachChild, fileIdentity, newestChange, purgeDetached, REMOVING_PREFIX, removeChild } from "../src/scratch-remove";
import { tmp } from "./helpers";

const HOUR_MS = 3_600_000;
const dirs: string[] = [];
afterAll(() => {
	for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

/** A physical parent `base` holding `wl-x/deep/f`, and an outside dir holding its own `wl-x/sentinel`. */
function place(): { top: string; parent: string; outside: string } {
	const top = realpathSync(tmp("remove"));
	dirs.push(top);
	const parent = join(top, "base");
	mkdirSync(join(parent, "wl-x", "deep"), { recursive: true });
	writeFileSync(join(parent, "wl-x", "deep", "f"), "x");
	const outside = join(top, "outside");
	mkdirSync(join(outside, "wl-x"), { recursive: true });
	writeFileSync(join(outside, "wl-x", "sentinel"), "keep");
	return { top, parent, outside };
}

describe("removeChild", () => {
	test("removes the judged real directory; no .removing-* is left behind", () => {
		const p = place();
		const r = removeChild(p.parent, "wl-x", fileIdentity(join(p.parent, "wl-x")));
		expect(r).toEqual({ kind: "removed", path: join(p.parent, "wl-x") });
		expect(readdirSync(p.parent)).toEqual([]);
	});

	test("detachChild renames the judged directory to .removing-* and removes nothing; purgeDetached removes that, and only that", () => {
		const p = place();
		const d = detachChild(p.parent, "wl-x", fileIdentity(join(p.parent, "wl-x")));
		if (d.kind !== "detached") throw new Error(`not detached: ${JSON.stringify(d)}`);
		expect(d.path).toBe(join(p.parent, "wl-x"));
		expect(readdirSync(p.parent)).toEqual([d.doomed.slice(p.parent.length + 1)]);
		expect(d.doomed.slice(p.parent.length + 1)).toMatch(/^\.removing-wl-x-[0-9a-f]{16}$/);
		expect(readFileSync(join(d.doomed, "deep", "f"), "utf8")).toBe("x");
		expect(purgeDetached(d)).toEqual({ kind: "removed", path: join(p.parent, "wl-x") });
		expect(readdirSync(p.parent)).toEqual([]);
		expect(readFileSync(join(p.outside, "wl-x", "sentinel"), "utf8")).toBe("keep");
	});

	test("R1: the parent swapped for a symlink to an outside dir between the check and the rename: the outside wl-x survives and the removal is refused", () => {
		const p = place();
		const judged = fileIdentity(join(p.parent, "wl-x"));
		const r = removeChild(p.parent, "wl-x", judged, {
			beforeRename: () => {
				renameSync(p.parent, join(p.top, "moved"));
				symlinkSync(p.outside, p.parent);
			},
		});
		expect(r.kind).toBe("refused");
		expect(readFileSync(join(p.outside, "wl-x", "sentinel"), "utf8")).toBe("keep");
		expect(readdirSync(p.outside)).toEqual(["wl-x"]); // renamed back, nothing left as .removing-*
		expect(existsSync(join(p.top, "moved", "wl-x", "deep", "f"))).toBe(true);
	});

	test("refuses a symlink, a non-directory, a bad name, a missing child, a replaced directory and a parent that is not physical", () => {
		const p = place();
		const real = fileIdentity(join(p.parent, "wl-x"));
		symlinkSync(join(p.parent, "wl-x"), join(p.parent, "wl-alias"));
		writeFileSync(join(p.parent, "file"), "f");
		const refused = (parent: string, name: string, id = real): string => {
			const r = removeChild(parent, name, id);
			return r.kind === "refused" ? r.reason : `not refused: ${JSON.stringify(r)}`;
		};
		expect(refused(p.parent, "wl-alias", fileIdentity(join(p.parent, "wl-alias")))).toContain("is a symlink");
		expect(refused(p.parent, "file", fileIdentity(join(p.parent, "file")))).toContain("is not a directory");
		expect(refused(p.parent, "..")).toContain("is not a child name");
		expect(refused(p.parent, "a/b")).toContain("is not a child name");
		expect(refused(p.parent, "wl-absent")).toContain("cannot be checked");
		symlinkSync(p.parent, join(p.top, "via-link"));
		expect(refused(join(p.top, "via-link"), "wl-x")).toContain("not the physical parent");
		rmSync(join(p.parent, "wl-x"), { recursive: true });
		mkdirSync(join(p.parent, "wl-x"));
		expect(refused(p.parent, "wl-x")).toContain("not the directory that was judged");
		expect(existsSync(join(p.parent, "wl-x"))).toBe(true);
		expect(readdirSync(p.parent).filter((n) => n.startsWith(REMOVING_PREFIX))).toEqual([]);
	});
});

describe("newestChange", () => {
	test("reads every descendant's lstat mtime: an old top level with a freshly edited nested file is recent", () => {
		const p = place();
		const old = new Date(Date.now() - 10 * HOUR_MS);
		const dir = join(p.parent, "wl-x");
		for (const q of [join(dir, "deep", "f"), join(dir, "deep"), dir]) utimesSync(q, old, old);
		expect(newestChange(dir, Date.now() - HOUR_MS)).toBeLessThan(Date.now() - 9 * HOUR_MS);
		writeFileSync(join(dir, "deep", "f"), "edited");
		utimesSync(dir, old, old);
		expect(newestChange(dir, Date.now() - HOUR_MS)).toBeGreaterThan(Date.now() - HOUR_MS);
	});

	test("does not follow links: a link to a fresh outside dir, itself old, does not count", () => {
		const p = place();
		const old = new Date(Date.now() - 10 * HOUR_MS);
		const dir = join(p.parent, "wl-x");
		symlinkSync(p.outside, join(dir, "link"));
		lutimesSync(join(dir, "link"), old, old);
		for (const q of [join(dir, "deep", "f"), join(dir, "deep"), dir]) utimesSync(q, old, old);
		expect(newestChange(dir, Date.now() - HOUR_MS)).toBeLessThan(Date.now() - 9 * HOUR_MS);
	});
});
