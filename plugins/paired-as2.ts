// plugins/paired-as2.ts — as2's one seam to the vendored paired-coding OMP adapter
// (plugins/paired-coding/omp/paired-coding-omp.ts, plugins/VENDOR.md). plugins/index.ts binds the
// adapter only through bindPairedCoding, so whatever as2 hands the adapter is decided here and nowhere
// else. Today that is the upstream defaults: the environment the adapter reads its state dir
// (PAIRED_CODING_STATE_DIR) and conflicting-tool list (PAIRED_CODING_CONFLICTING_TOOLS) from, and the
// adapter's own executeVerb. The P-11 bridge (PLAN-2 D5: the trusted lifecycle-tool allowance and the
// canonical write/edit/bash view of pair mutations, gates/src/pair-call.ts) is added here by its slice.

import pairedCodingOmp, { type PiLike } from "./paired-coding/omp/paired-coding-omp.ts";

export interface PairedAs2Options {
	/** The environment the adapter reads (plugins/index.ts passes its own, default process.env). */
	env: Record<string, string | undefined>;
}

/** Bind the paired adapter onto `pi` with what as2 supplies it. */
export function bindPairedCoding(pi: PiLike, options: PairedAs2Options): void {
	pairedCodingOmp(pi, { env: options.env });
}
