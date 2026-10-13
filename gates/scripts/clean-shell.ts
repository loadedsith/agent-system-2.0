#!/usr/bin/env bun
// bin/as2's reader of the clean-shell switch (gates/src/clean-shell.ts), so the launcher reads it the
// way the gates do (bun's YAML, config.yml else config.yaml) rather than with its own shell parser.
//
//   bun gates/scripts/clean-shell.ts orchestrator <agentDir>
//     exit 0 when the switch in the profile at <agentDir> is on for the orchestrator (only under
//     "all": it has no workload id), else 1. Unreadable or malformed is off (1), as for the gates.
//
//   bun gates/scripts/clean-shell.ts verify <config> <candidate> <want-json>
//     exit 0 when <candidate>, `as2 clean-shell`'s text edit of <config>, is safe to rename into
//     place: it parses, its gates.cleanShell reads as <want-json>, and with gates.cleanShell removed
//     it is the same document as <config> with gates.cleanShell removed. Else exit 1, the reason on
//     stdout. A `gates:` the edit's line matcher does not recognise (a flow mapping, say) is how a
//     text edit drops settings (review r1 finding 3): this check is what refuses it.
import { readFileSync } from "node:fs";
import { CLEAN_SHELL_KEY, cleanShellOfConfig, cleanShellOn, readCleanShell } from "../src/clean-shell";

/** `doc` without gates.cleanShell; a `gates` left empty or null carries no setting and goes too. */
function withoutSwitch(doc: unknown): unknown {
	if (doc === null || doc === undefined) return {};
	if (typeof doc !== "object" || Array.isArray(doc) || !("gates" in doc)) return doc;
	const { gates, ...rest } = doc as Record<string, unknown>;
	if (gates === null) return rest;
	if (typeof gates !== "object" || Array.isArray(gates)) return doc;
	const { cleanShell: _, ...others } = gates as Record<string, unknown>;
	return Object.keys(others).length === 0 ? rest : { ...rest, gates: others };
}

/** Why `candidate` must not replace `original`, or null when it may. */
function editRefusal(original: string, candidate: string, want: unknown): string | null {
	const parse = (text: string, what: string): { doc: unknown } | string => {
		try {
			return { doc: Bun.YAML.parse(text) };
		} catch (err) {
			return `${what} does not parse (${(err instanceof Error ? err.message : String(err)).split("\n")[0]})`;
		}
	};
	const before = parse(original, "the current file");
	if (typeof before === "string") return before;
	const after = parse(candidate, "the edited file");
	if (typeof after === "string") return after;
	const read = cleanShellOfConfig(after.doc);
	if (!read.ok || !Bun.deepEquals(read.value, want, true)) return `the edit would read ${CLEAN_SHELL_KEY} as ${read.ok ? JSON.stringify(read.value) : read.error}, not ${JSON.stringify(want)}`;
	if (!Bun.deepEquals(withoutSwitch(before.doc), withoutSwitch(after.doc), true)) return `the edit would change settings other than ${CLEAN_SHELL_KEY} (a \`gates:\` it does not edit in place, such as a flow mapping)`;
	return null;
}

export function main(argv: readonly string[]): number {
	const [cmd, ...rest] = argv;
	if (cmd === "orchestrator" && rest.length === 1) return cleanShellOn(readCleanShell(rest[0]!), undefined) ? 0 : 1;
	if (cmd === "verify" && rest.length === 3) {
		const [config, candidate, want] = rest as [string, string, string];
		const why = editRefusal(readFileSync(config, "utf8"), readFileSync(candidate, "utf8"), JSON.parse(want));
		if (why === null) return 0;
		process.stdout.write(`${why}\n`);
		return 1;
	}
	process.stderr.write("usage: bun gates/scripts/clean-shell.ts orchestrator <agentDir> | verify <config> <candidate> <want-json>\n");
	return 2;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
