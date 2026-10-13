#!/usr/bin/env bun
// bin/as2's reader of the clean-shell switch (gates/src/clean-shell.ts), so the launcher reads it the
// way the gates do (bun's YAML, config.yml else config.yaml) rather than with its own shell parser.
//
//   bun gates/scripts/clean-shell.ts orchestrator <agentDir>
//     exit 0 when the switch in the profile at <agentDir> is on for the orchestrator (only under
//     "all": it has no workload id), else 1. Unreadable or malformed is off (1), as for the gates.
import { cleanShellOn, readCleanShell } from "../src/clean-shell";

export function main(argv: readonly string[]): number {
	const [cmd, ...rest] = argv;
	if (cmd === "orchestrator" && rest.length === 1) return cleanShellOn(readCleanShell(rest[0]!), undefined) ? 0 : 1;
	process.stderr.write("usage: bun gates/scripts/clean-shell.ts orchestrator <agentDir>\n");
	return 2;
}

if (import.meta.main) process.exit(main(process.argv.slice(2)));
