// A memory cap for the processes the gate tests spawn (workload wl-mv5lrh0drbg0zk, PLAN.md revision 8
// "Proofs": every omp the proofs spawn runs under a hard timeout and an RSS cap; the dropped live
// proof's corpus child reached 18 GB). Not a test file.
//
// A process's footprint is read through libproc `proc_pid_rusage(pid, RUSAGE_INFO_V0, &info)`
// (macOS SDK sys/resource.h `struct rusage_info_v0`: eight 8-byte fields after a 16-byte uuid, so
// `ri_resident_size` is u64 index 8 and `ri_phys_footprint` index 9), the figure Activity Monitor
// shows as Memory. It reads another process of the same user without a child process; a pid that
// is gone returns -1.
import { dlopen, FFIType, ptr } from "bun:ffi";

const RUSAGE_INFO_V0 = 0;
const PHYS_FOOTPRINT = 9;

let libproc: { symbols: { proc_pid_rusage: (pid: number, flavor: number, buffer: unknown) => number } } | null | undefined;

function lib() {
	if (libproc === undefined) {
		try {
			libproc = dlopen("/usr/lib/libSystem.B.dylib", { proc_pid_rusage: { args: [FFIType.i32, FFIType.i32, FFIType.ptr], returns: FFIType.i32 } }) as unknown as typeof libproc;
		} catch {
			libproc = null;
		}
	}
	return libproc;
}

/** The physical footprint of `pid` in bytes, or null when it cannot be read (the process is gone, or not macOS). */
export function physFootprint(pid: number): number | null {
	const l = lib();
	if (!l) return null;
	const info = new BigUint64Array(12);
	if (l.symbols.proc_pid_rusage(pid, RUSAGE_INFO_V0, ptr(info)) !== 0) return null;
	return Number(info[PHYS_FOOTPRINT]);
}

export interface RssWatch {
	pid: number;
	/** The cap in bytes: a reading above it fires `onExceed` once. */
	capBytes: number;
	intervalMs?: number;
	/** Called once with the reading that exceeded the cap; the caller kills and fails. */
	onExceed: (bytes: number) => void;
}

/**
 * Reads `pid`'s footprint every `intervalMs` (default 250) until stopped or the cap is exceeded.
 * A timer and not an event: the OS sends nothing when a process grows, so a poll is the only way to
 * see it; the interval bounds how far past the cap a fast-growing process gets before it is killed.
 * Returns the stop function.
 */
export function startRssWatchdog(w: RssWatch): () => void {
	const timer = setInterval(() => {
		const bytes = physFootprint(w.pid);
		if (bytes !== null && bytes > w.capBytes) {
			clearInterval(timer);
			w.onExceed(bytes);
		}
	}, w.intervalMs ?? 250);
	return () => clearInterval(timer);
}
