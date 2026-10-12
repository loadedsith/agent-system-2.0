#!/usr/bin/env bun
// Historical proof is opt-in: archive pinned trees, never switch or reset the checkout.
// Probe diagnostics use IDs only; executable shapes live in the shared fixture.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { fixture, runProbe, type FenceModule, type GateModule, type Probe } from "../test/probe-harness";

const repo = resolve(import.meta.dir, "..", "..");

type Case = { probe: Probe; revision: string; expected: { landing: true } | { row: number }; label: string };

function git(args: string[], env: NodeJS.ProcessEnv) {
	return spawnSync("/usr/bin/git", args, { cwd: repo, env, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] });
}

export async function main(currentRef = "origin/main"): Promise<number> {
	const root = mkdtempSync(join(tmpdir(), "as2-probe-history-"));
	try {
		const home = join(root, "home");
		mkdirSync(join(home, ".agent-system-2"), { recursive: true });
		const env = {
			HOME: home,
			AGENT_SYSTEM_LEDGER_DB: join(home, ".agent-system-2", "ledger.db"),
			PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
			GIT_CONFIG_NOSYSTEM: "1",
			GIT_CONFIG_GLOBAL: "/dev/null",
			GIT_TERMINAL_PROMPT: "0",
			TMPDIR: home,
		};
		const current = git(["rev-parse", currentRef], env);
		if (current.status !== 0) {
			console.error("current: ref unavailable; fetch the default branch or supply its commit before running historical proof");
			return 2;
		}
		const runs: Case[] = [];
		for (const probe of fixture().cases) {
			runs.push({ probe, revision: probe.historicalCommit, expected: { landing: true }, label: "historical" });
			if (probe.intermediate) runs.push({ probe, revision: probe.intermediate.commit, expected: { row: probe.intermediate.firstRefusingRow }, label: "intermediate" });
			runs.push({ probe, revision: current.stdout.trim(), expected: { row: probe.refusingRow }, label: "current" });
		}
		let failed = false;
		let missing = false;
		for (const [index, run] of runs.entries()) {
			const prefix = `${run.probe.id} ${run.label}`;
			if (git(["cat-file", "-e", `${run.revision}^{commit}`], env).status !== 0) {
				console.error(`${prefix}: missing commit object; fetch the PR ref containing this commit and rerun`);
				missing = true;
				continue;
			}
			const snapshot = join(root, `snapshot-${index}`);
			mkdirSync(snapshot);
			const archive = join(root, `snapshot-${index}.tar`);
			if (git(["archive", "--format=tar", "-o", archive, run.revision], env).status !== 0 ||
				spawnSync("/usr/bin/tar", ["-xf", archive, "-C", snapshot], { env, encoding: "utf8", timeout: 30_000, stdio: ["ignore", "pipe", "pipe"] }).status !== 0) {
				console.error(`${prefix}: snapshot unpack failed`);
				failed = true;
				continue;
			}
			try {
				// Every run resolves its own unpacked tree; static imports would reuse the checkout's rows.
				const gates = await import(pathToFileURL(join(snapshot, "gates", "index.ts")).href) as GateModule;
				const fence = await import(pathToFileURL(join(snapshot, "gates", "src", "fence.ts")).href) as FenceModule;
				const result = await runProbe(run.probe.id, run.probe.command, gates, fence, run.expected);
				const expected = "landing" in run.expected ? "landed" : "refused";
				if (result.kind !== expected || ("row" in run.expected && result.row !== run.expected.row)) failed = true;
				console.log(`${prefix}: ${result.kind}${result.row === undefined ? "" : ` row ${result.row}`}`);
			} catch {
				console.error(`${prefix}: probe setup or snapshot import failed`);
				failed = true;
			}
		}
		return failed ? 1 : missing ? 2 : 0;
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	try {
		process.exit(await main());
	} catch {
		console.error("historical probe setup failed");
		process.exit(2);
	}
}
