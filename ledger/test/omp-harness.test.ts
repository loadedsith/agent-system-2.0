// The OMP harness guide, its runtime companion and the start card (wl-mv8k0fby51uakg, plan D4 and D6).
// profile/OMP-HARNESS.md, profile/OMP-RUNTIME.md and profile/AGENTS.md open with the snapshot line
// `snapshot of OMP X.Y.Z, YYYY-MM-DD; drift will occur`, and X.Y.Z must equal MEASURED_HOST in
// gates/src/shell-start.ts (the OMP the suite was last measured on), so any OMP bump of that pin fails
// here until the three files are re-verified and bumped too. OMP-RUNTIME.md has one `## ` section per
// subsystem of the 2026-10-20 research audit's coverage table, each carrying an OMP source receipt or a
// pointer to an OMP-HARNESS.md section that has one. The card is the native user context OMP loads
// into every top-level session of the profile, so it stays short, carries its marker on line 2 and
// names both guides by their {repo} paths, which install/install.sh fills with the checkout's path.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MEASURED_HOST } from "../../gates/src/shell-start";

const REPO = join(import.meta.dir, "..", "..");
const GUIDE = join(REPO, "profile", "OMP-HARNESS.md");
const RUNTIME = join(REPO, "profile", "OMP-RUNTIME.md");
const CARD = join(REPO, "profile", "AGENTS.md");
const MARKER = "# OMP harness card (agent-system 2.0)";
const CARD_MAX_BYTES = 8000;
const SNAPSHOT = /^snapshot of OMP (\d+\.\d+\.\d+), (\d{4}-\d{2}-\d{2}); drift will occur$/;

// The 22 subsystems of the audit's coverage table (AUDIT.md § Coverage table), verbatim.
const SUBSYSTEMS = [
	"Built-in and dynamic slash commands",
	"Settings catalog and defaults",
	"Launch flags as2 passes",
	"Workspace dirs / pairing",
	"Profile directory scoping",
	"Session resume / selection",
	"Compaction runtime (events, stop-hook skip)",
	"MCP sources and OAuth scoping",
	"Subagent inheritance",
	"Credentials (`/login`, agent.db per profile)",
	"rpc protocol commands",
	"Tool approval policy",
	"Foreign provider opt-in",
	"Extension discovery / ordering",
	"Extension event lifecycle, fail-closed `tool_call`",
	"OTEL telemetry",
	"Plugin registry precedence",
	"Claude-plugin hooks / adapter",
	"Message delivery semantics",
	"Plugin CLI (install/upgrade, dry-run)",
	"Logs / diagnostics location",
	"Session ownership leases",
];
const RECEIPT = /pi-coding-agent@18\.8\.6|pi-utils@18\.8\.6|pi-agent-core@18\.8\.6|omp:\/\//;

/** The `## ` sections of a markdown text, heading text → body up to the next `## ` heading. */
function sections(text: string): Map<string, string> {
	const out = new Map<string, string>();
	let name: string | undefined;
	let body: string[] = [];
	for (const line of text.split("\n")) {
		if (line.startsWith("## ")) {
			if (name !== undefined) out.set(name, body.join("\n"));
			name = line.slice(3).trim();
			body = [];
		} else if (name !== undefined) body.push(line);
	}
	if (name !== undefined) out.set(name, body.join("\n"));
	return out;
}

describe("the guides and the card carry the snapshot line for the measured host", () => {
	for (const [label, path] of [
		["OMP-HARNESS.md", GUIDE],
		["OMP-RUNTIME.md", RUNTIME],
		["AGENTS.md", CARD],
	] as const) {
		test(`${label} line 1 is the snapshot line naming MEASURED_HOST`, () => {
			const first = readFileSync(path, "utf8").split("\n")[0];
			const m = SNAPSHOT.exec(first);
			expect(m).not.toBeNull();
			expect(m![1]).toBe(MEASURED_HOST);
		});
	}
});

describe("the runtime guide covers every audited subsystem with a receipt", () => {
	const runtime = sections(readFileSync(RUNTIME, "utf8"));
	const guide = sections(readFileSync(GUIDE, "utf8"));

	test("the pinned list holds the audit's 22 subsystems", () => {
		expect(new Set(SUBSYSTEMS).size).toBe(22);
	});

	for (const name of SUBSYSTEMS) {
		test(`§ ${name} exists and carries a receipt or a pointer to a guide section with one`, () => {
			const body = runtime.get(name);
			expect(body).toBeDefined();
			if (RECEIPT.test(body!)) return;
			const pointed = [...body!.matchAll(/OMP-HARNESS\.md` § ([^,.;()`]+)/g)].map((m) => m[1].trim());
			expect(pointed.some((p) => RECEIPT.test(guide.get(p) ?? ""))).toBe(true);
		});
	}
});

describe("the OMP harness card is short and names both guides", () => {
	const bytes = readFileSync(CARD);
	const text = bytes.toString("utf8");

	test(`it is at most ${CARD_MAX_BYTES} bytes`, () => {
		expect(bytes.byteLength).toBeLessThanOrEqual(CARD_MAX_BYTES);
	});

	test("its marker is on line 2", () => {
		expect(text.split("\n")[1]).toBe(MARKER);
	});

	test("it names the guide and the runtime guide by their {repo} paths", () => {
		expect(text).toContain("{repo}/profile/OMP-HARNESS.md");
		expect(text).toContain("{repo}/profile/OMP-RUNTIME.md");
	});
});
