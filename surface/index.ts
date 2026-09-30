// The orchestrator surface (MIGRATION.md M5; SPEC-2.0.md § A1.2, § A3, § B3, § B7, § B13.1),
// loaded as one OMP extension beside the P-11 gates. Same layout as gates/: each row is its own file
// under extensions/ with pure modules under src/, so a profile lists either this file or the rows
// it wants, never both (a row loaded twice registers its handlers twice). Every row reads the role
// per session (surface/src/session.ts): only a top-level session with AGENT_SYSTEM_ROLE=orchestrator
// is a surface; lanes and hands get inert handlers — except the lane row, which is the inverse: it
// writes the lane-side signals the surface reads (claim/lease, death, leaked prompts, artifact
// outcomes; M5 fix round 1) and is inert on the orchestrator.
//
// Registration order is behaviour (OMP runs handlers in order): the input row reads Jo's one-word
// flip from the prompt and applies it first; the wake row's before_agent_start then renders the
// ledger (already reflecting the flip), injects the voice document and carries the receipt into the
// turn's context; the workload row only registers tools; the lane row registers last.
import laneRow from "./extensions/lane";
import surfaceInputRow from "./extensions/surface-input";
import wakeRow from "./extensions/wake";
import workloadRow from "./extensions/workload";
import type { SurfaceAPI } from "./src/types";

export type { SurfaceAPI } from "./src/types";

export default function orchestratorSurface(pi: SurfaceAPI, env: Record<string, string | undefined> = process.env): void {
	surfaceInputRow(pi, env);
	wakeRow(pi, env);
	workloadRow(pi, env);
	laneRow(pi, env);
}
