// Property test for printfOutput (M4 fix round 4, S7): over random ASCII formats and arguments drawn
// from the conversions the gate evaluates, whatever the gate computes is byte-for-byte what real
// bash's printf writes. A null from the gate (a form it does not evaluate) is the fail-closed answer
// and is not compared. The generator is seeded, so a failure reproduces.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { printfOutput } from "../src/exec";

function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

const CONVERSIONS = ["s", "b", "c", "d", "i", "o", "u", "x", "X", "%"];
// `\c` in a format is refused (bash 3.2 prints it literally), so it is exercised only inside `%b` args.
const LITERALS = ["a", "Z", " ", "-", "=", "\\n", "\\t", "\\\\", "\\101", "\\x41"];
const ARGS = ["", "word", "two words", "0", "7", "42", "-3", "'a", "\\n", "\\c", "x\\ty", "255", "abc"];

function pick<T>(r: () => number, xs: readonly T[]): T {
	return xs[Math.floor(r() * xs.length)]!;
}

function format(r: () => number): string {
	let f = "";
	const parts = 1 + Math.floor(r() * 5);
	for (let p = 0; p < parts; p++) {
		if (r() < 0.4) {
			f += pick(r, LITERALS);
			continue;
		}
		const conv = pick(r, CONVERSIONS);
		let spec = "%";
		if (conv !== "%") {
			if (r() < 0.3) spec += pick(r, ["-", "0", "-0"]);
			if (r() < 0.4) spec += r() < 0.2 ? "*" : String(Math.floor(r() * 6));
			if ((conv === "s" || conv === "b") && r() < 0.3) spec += `.${Math.floor(r() * 4)}`;
		}
		f += spec + conv;
	}
	return f;
}

function bashPrintf(args: string[]): string {
	const r = spawnSync("bash", ["-c", 'printf "$@"', "_", ...args]);
	return r.stdout.toString("latin1");
}

test("printfOutput matches bash printf on every form it evaluates", () => {
	const r = rng(20260929);
	let compared = 0;
	const mismatches: string[] = [];
	for (let n = 0; n < 600; n++) {
		const args = [format(r)];
		const count = Math.floor(r() * 4);
		for (let k = 0; k < count; k++) args.push(pick(r, ARGS));
		const gate = printfOutput(args);
		if (gate === null) continue;
		compared++;
		const bash = bashPrintf(args);
		if (gate !== bash) mismatches.push(`${JSON.stringify(args)} gate=${JSON.stringify(gate)} bash=${JSON.stringify(bash)}`);
	}
	expect(mismatches).toEqual([]);
	expect(compared).toBeGreaterThan(300);
});

test("printfOutput refuses the forms whose bash output it does not compute", () => {
	for (const args of [["% d", "0"], ["%+d", "5"], ["%#x", "255"], ["%.3d", "5"], ["%x", "-1"], ["%u", "-1"], ["%c", "é"], ["%q", "a b"], ["%f", "1.5"]]) {
		expect(printfOutput(args)).toBeNull();
	}
});
