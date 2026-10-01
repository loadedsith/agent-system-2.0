// The one definition of "a test run" the P-11 rows share: row 3 reads a bash command against it
// before it believes "tests pass", and row 8 counts only an artifact-tree record whose command
// matches it as evidence for a push (wl-muptjioqjtvthc PLAN.md § 2).

/** A command that runs a test suite: one of the common runners, anywhere in the command line. */
export const TEST_RUN = /\b(bun\s+test|npm\s+(?:run\s+)?test|pnpm\s+(?:run\s+)?test|yarn\s+test|vitest|jest|pytest|go\s+test|cargo\s+test|just\s+[\w-]*test[\w-]*)\b/;
