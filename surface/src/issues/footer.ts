// The machinery's `Closes #N` footer on a PR body (PLAN wl-mv66ylim0gahog § 5). The issues tick
// (and publishEntry's create) are its only writers; the model never writes it. The marker line lets
// the scan tell its own footer from a closing keyword a person typed.

/** `\n\n<!-- as2 -->\nCloses #<n>`, appended to a PR body. */
export function closesFooter(n: number): string {
	return `\n\n<!-- as2 -->\nCloses #${n}`;
}

/** Whether `body` already carries the footer for issue `n` (GitHub may store the line break as CRLF). */
export function hasFooter(body: string, n: number): boolean {
	return new RegExp(`<!-- as2 -->\\r?\\nCloses #${n}(?!\\d)`).test(body);
}
