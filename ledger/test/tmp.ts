// Test temp dirs that are removed however the test process ends (PLAN wl-mv8mof9kktbh1c § 2).
//
// Every temp dir a test makes lives inside a run root: `<parent>/as2-test-run-<16 hex>`. A run root is
// created by its own watchdog, a detached `/bin/sh` (script W) that makes the root with an atomic mkdir,
// acks with its pid inside it, then blocks reading a pipe from this process. When this process ends for
// any reason (normal end, crash, SIGKILL, a kill of bun's process group) the kernel closes the pipe and
// the watchdog removes the root, and only a root its own mkdir created. In-process cleanup
// (cleanupTestTmp) empties the roots but never removes a root path itself, so no pathname is released
// and then deleted a second time.
//
// The preload (isolate-preload.ts) imports this module first: the main root is made at import, and
// process.env.TMPDIR points into it, so every later `tmpdir()` in the test process, and every child given
// `process.env`, lands inside it.
import type { Subprocess } from "bun";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { constants, getPriority, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

/** The watchdog script: argv `$1` is the root it creates, acks in, and removes once its stdin closes. */
export const W = 'mkdir -m 700 -- "$1" || exit 0; printf "%s\\n" "$$" > "$1/.as2-watchdog"; cat >/dev/null; rm -rf -- "$1"';

/** The ack file a watchdog writes inside its root: its pid and a newline. */
const ACK_FILE = ".as2-watchdog";
const RUN_ROOT_NAME = /^as2-test-run-[0-9a-f]{16}$/;
const ATTEMPTS = 3;
const EXIT_WAIT_MS = 5000;
const TICK_MS = 2;

// Test-only seams (ledger/test/tmp-cleanup.test.ts T11, T12): the shell, the script, the ack deadline.
const SH = process.env.AS2_TEST_TMP_SH || "/bin/sh";
const SCRIPT = process.env.AS2_TEST_TMP_WATCHDOG_SCRIPT || W;
const ACK_MS = Number(process.env.AS2_TEST_TMP_ACK_MS) > 0 ? Number(process.env.AS2_TEST_TMP_ACK_MS) : 5000;

/** Synchronous 2 ms ticks: the preload must hold the test run until the root is acked. */
const tick = new Int32Array(new SharedArrayBuffer(4));

/** Run roots by parent dir; each value is a root its own watchdog created and acked. */
const roots = new Map<string, string>();
/** Every dir tmpDir() handed out. */
const registered = new Set<string>();
/** Watchdogs whose roots are in use; held so their stdin pipes stay open for the life of the process. */
const watchdogs: Watchdog[] = [];

/**
 * A watchdog: Bun.spawn rather than node:child_process, because its stdin `end()` closes the pipe at once,
 * inside a synchronous wait; a node child's `stdin.destroy()` closes it only on a later event-loop turn.
 */
type Watchdog = Subprocess<"pipe", "ignore", "ignore">;

/**
 * Exited, as far as a synchronous wait can tell. A child this process has not reaped yet is a zombie:
 * `kill(pid, 0)` still succeeds on it, so `getpriority` (ESRCH for a zombie on macOS) is checked too.
 */
function exited(pid: number): boolean {
	for (const probe of [() => process.kill(pid, 0), () => getPriority(pid)]) {
		try {
			probe();
		} catch (e) {
			if (e instanceof Error && (("code" in e && e.code === "ESRCH") || e.message.includes("ESRCH"))) return true;
		}
	}
	return false;
}

function acked(path: string, pid: number): boolean {
	try {
		return readFileSync(join(path, ACK_FILE), "utf8") === `${pid}\n`;
	} catch {
		return false;
	}
}

/** One attempt: the acked root's watchdog, or the reason it failed (after the watchdog is done). */
function tryRoot(path: string): Watchdog | string {
	let dog: Watchdog;
	try {
		dog = Bun.spawn([SH, "-c", SCRIPT, "as2-test-tmp-watchdog", path], { detached: true, stdin: "pipe", stdout: "ignore", stderr: "ignore" });
	} catch (e) {
		return `spawn ${SH}: ${e instanceof Error ? e.message : String(e)}`;
	}
	const pid = dog.pid;
	let reason = `no ack in ${ACK_MS} ms`;
	for (const deadline = Date.now() + ACK_MS; Date.now() < deadline; Atomics.wait(tick, 0, 0, TICK_MS)) {
		if (acked(path, pid)) {
			dog.unref();
			dog.stdin.unref();
			return dog;
		}
		if (exited(pid)) {
			reason = "the watchdog exited before its ack (its mkdir failed)";
			break;
		}
	}
	// Failed init: close its stdin, never kill it. A watchdog that did create the root removes it on EOF.
	dog.stdin.end();
	dog.unref();
	let settled = false;
	for (const deadline = Date.now() + EXIT_WAIT_MS; Date.now() < deadline; Atomics.wait(tick, 0, 0, TICK_MS)) {
		if (exited(pid) && !existsSync(path)) {
			settled = true;
			break;
		}
	}
	return settled ? reason : `${reason}; the watchdog was not done ${EXIT_WAIT_MS} ms after its stdin closed`;
}

/** The run root for `parent` (one per distinct parent, cached); throws when no watched root could be made. */
export function runRoot(parent: string): string {
	const known = roots.get(parent);
	if (known) return known;
	const reasons: string[] = [];
	for (let i = 0; i < ATTEMPTS; i++) {
		const path = join(parent, `as2-test-run-${randomBytes(8).toString("hex")}`);
		const got = tryRoot(path);
		if (typeof got === "string") {
			reasons.push(got);
			continue;
		}
		watchdogs.push(got);
		roots.set(parent, path);
		return path;
	}
	throw new Error(`as2 test tmp: no watched run root (${reasons.join("; ")})`);
}

/** A fresh dir `<prefix>XXXXXX` inside a watched run root, registered for cleanup. */
export function tmpDir(prefix: string): string {
	const parent = process.env.LEDGER_TEST_TMP ? runRoot(process.env.LEDGER_TEST_TMP) : mainRoot;
	const dir = mkdtempSync(join(parent, prefix));
	registered.add(dir);
	return dir;
}

/** Empties every run root (keeping its ack file) and leaves the root dirs to their watchdogs. Idempotent. */
export function cleanupTestTmp(): void {
	for (const dir of registered) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {}
	}
	registered.clear();
	for (const root of roots.values()) {
		let names: string[];
		try {
			names = readdirSync(root);
		} catch {
			continue;
		}
		for (const name of names) {
			if (name === ACK_FILE) continue;
			try {
				rmSync(join(root, name), { recursive: true, force: true });
			} catch {}
		}
	}
}

// The main root. A startup tmpdir that is itself a live run root (a nested `bun test` given its parent's
// TMPDIR) puts this root beside it, never inside it, so ending the parent never deletes a live child's root.
const start = tmpdir();
const base = RUN_ROOT_NAME.test(basename(start)) && existsSync(join(start, ACK_FILE)) ? dirname(start) : start;
export const mainRoot = runRoot(base);
process.env.TMPDIR = mainRoot;

process.on("exit", cleanupTestTmp);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
	process.on(signal, () => {
		cleanupTestTmp();
		process.exit(128 + constants.signals[signal]);
	});
}
