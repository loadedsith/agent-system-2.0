// The definitions of "a test run" the P-11 rows share. Row 3 reads a bash command against TEST_RUN
// before it believes "tests pass". Row 8 counts an artifact-tree record as evidence for a push only
// when its whole command passes isTestRunCommand (wl-muptjioqjtvthc PLAN.md § 2; REVIEW.md B1): the
// recorder decides "passed" from the exit status of the whole shell line, so a pipe, `|| true` or a
// `grep 'bun test'` would otherwise turn a failing or non-test run into a passing test record.

/** A command that runs a test suite: one of the common runners, anywhere in the command line. */
export const TEST_RUN = /\b(bun\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|vitest|jest|pytest|go\s+test|cargo\s+test|just\s+[\w-]*test[\w-]*)\b/;

/** A line that starts with one of the TEST_RUN runners. */
const RUNNER_FIRST = /^(?:bun\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|(?:npx\s+|bunx\s+)?(?:vitest|jest)|pytest|go\s+test|cargo\s+test|just\s+[\w-]*test[\w-]*)(?:\s|$)/;

/** Shell syntax that chains, pipes, redirects, substitutes, quotes or comments: any of it lets the line's exit status be something other than the runner's. */
const SHELL_META = /[;&|<>`$()#\\'"\n\r]/;

/** A word that makes a runner print and exit 0 without running a test. */
const NO_RUN_WORD = /(?:^|\s)(?:-h|--help|--version)(?=\s|$)/;

/** Whether `command` is exactly one test-runner invocation: a runner first, then plain words, nothing the shell would chain, pipe or redirect. */
export function isTestRunCommand(command: string): boolean {
	const line = command.trim();
	if (SHELL_META.test(line)) return false;
	if (NO_RUN_WORD.test(line)) return false;
	return RUNNER_FIRST.test(line);
}
