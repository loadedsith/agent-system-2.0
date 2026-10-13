// install/phoenix-run.sh's bind check (wl-mv65t5d34lts00 PLAN.md § 3), against a fake Phoenix: PHOENIX_PYTHON
// is a script that runs bun on a listener binding PHOENIX_PORT and PHOENIX_GRPC_PORT the way the shim does.
// The wrapper samples Phoenix's RSS with /bin/ps every second and fails closed (exit 78) when it cannot,
// so these run only where ps works (the test runner; not inside the lane fence, which denies /bin/ps).
import { afterAll, expect, test } from "bun:test";
import { chmodSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmp } from "./helpers";

const RUN = resolve(import.meta.dir, "..", "..", "install", "phoenix-run.sh");

const psWorks = (() => {
	try {
		return Bun.spawnSync(["/bin/ps", "-o", "rss=", "-p", String(process.pid)]).exitCode === 0;
	} catch {
		return false;
	}
})();

const dir = tmp("phoenix-run");
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const listener = join(dir, "listen.ts");
writeFileSync(
	listener,
	[
		"const socket = { data() {} };",
		'Bun.listen({ hostname: "127.0.0.1", port: Number(process.env.PHOENIX_PORT), socket });',
		'Bun.listen({ hostname: process.env.FAKE_GRPC_HOST ?? "127.0.0.1", port: Number(process.env.PHOENIX_GRPC_PORT), socket });',
		"",
	].join("\n"),
);
const fakePython = join(dir, "python");
writeFileSync(fakePython, `#!/bin/sh\nexec "${process.execPath}" "${listener}"\n`);
chmodSync(fakePython, 0o755);

/** Runs the wrapper on two free ports until its log matches `until` or it exits; then stops it with TERM. */
async function runWrapper(until: RegExp, extraEnv: Record<string, string> = {}, timeoutMs = 20_000) {
	const [port, grpc] = [0, 0].map(() => {
		const s = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
		const free = s.port;
		s.stop(true);
		return free;
	});
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !k.startsWith("PHOENIX_")) env[k] = v;
	const proc = Bun.spawn(["/bin/bash", RUN], {
		env: { ...env, ...extraEnv, PHOENIX_PYTHON: fakePython, PHOENIX_PORT: String(port), PHOENIX_GRPC_PORT: String(grpc) },
		stdout: "pipe",
		stderr: "pipe",
	});
	let log = "";
	const reader = proc.stdout.getReader();
	const decoder = new TextDecoder();
	const deadline = Date.now() + timeoutMs;
	let next = reader.read();
	while (!until.test(log) && Date.now() < deadline) {
		// A real-process wait: the wrapper's log is the only signal, so each read races the deadline, never a fixed sleep.
		const chunk = await Promise.race([next, Bun.sleep(deadline - Date.now()).then(() => null)]);
		if (chunk === null || chunk.done) break;
		log += decoder.decode(chunk.value);
		next = reader.read();
	}
	if (proc.exitCode === null) proc.kill("SIGTERM");
	for (let chunk = await next; !chunk.done; chunk = await reader.read()) log += decoder.decode(chunk.value);
	return { port, grpc, log, exit: await proc.exited };
}

test.skipIf(!psWorks)("both listeners on 127.0.0.1, side by side in lsof's list, count as bound; TERM stops it with 143", async () => {
	const r = await runWrapper(/phoenix-run\[\d+\]: bound:/);
	expect(r.log).toMatch(new RegExp(`bound: (127\\.0\\.0\\.1:${r.port} 127\\.0\\.0\\.1:${r.grpc}|127\\.0\\.0\\.1:${r.grpc} 127\\.0\\.0\\.1:${r.port})\\n`));
	expect(r.log).not.toContain("bind check:");
	expect(r.exit).toBe(143);
}, 30_000);

test.skipIf(!psWorks)("a gRPC listener on every address is refused: Phoenix killed, exit 78", async () => {
	const r = await runWrapper(/bind check: Phoenix killed; exit 78/, { FAKE_GRPC_HOST: "0.0.0.0" });
	expect(r.log).toMatch(new RegExp(`listens on \\*:${r.grpc}, not 127\\.0\\.0\\.1`));
	expect(r.log).not.toContain("bound:");
	expect(r.exit).toBe(78);
}, 30_000);
