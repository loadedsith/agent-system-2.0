// The positive model of `git` for row 6 (M4 fix round 5, Jo 2026-09-29: "extend"). Rounds 3-4 made
// the *form* of a git command fail closed (literal words, a builtin subcommand, modeled globals:
// exec.ts gitUnmodeled). This file does the same one level down: per subcommand, the options the lane
// may use and the shapes of their operands. Anything else is refused, as a § A4 reserved action where
// it is one and as an unmodeled form otherwise, with the allowed spelling named.
//
// Options are matched the way git matches them, never by literal text. Subcommands built on git's
// parse-options accept any unique prefix of a long option (`git reset --har` is `--hard`) and bundle
// short options (`-fd`); so each such subcommand carries its full option list and a word is resolved
// against it: exact match first, else the one option it is a prefix of. An abbreviation that resolves
// to a refused option is refused; an ambiguous or unknown one is refused as unmodeled (git would stop
// on it too). The option lists are git's own usage text, `git <sub> -h`, on git 2.50.1 (Apple
// Git-155): each `-x, --[no-]name <value>` usage line became one token (format at GIT_OPTIONS).
// Refresh: re-read `git <sub> -h` on the git a profile pins and update GIT_OPTIONS; keep any option
// git has dropped (an older git may still take it).
//
// The OPEN subcommands (reads, and writes no § A4 action names) are modeled the same way: every
// option git documents for them (OPEN_OPTIONS), anything else refused, and inside that list the
// options that run a program or write where the gate does not look are refused (OPEN_REFUSED).
// log/show/diff and the other revision-walking commands do not abbreviate (live, git 2.50.1: `git
// log --onel` → "unrecognized argument: --onel", `git log --sour` → the same, `git diff
// --outp=/dev/null` → "invalid option", `git format-patch --stdou` → "unrecognized argument"), so
// their options match exactly; the parse-options ones (status, grep, ls-remote, …) resolve a unique
// prefix, and match a refused option by prefix.
import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { resolve } from "node:path";
import type { GitCall } from "./exec";
import type { Word } from "./shell-parse";
import { PROTECTED_BRANCH } from "./types";

/** A refusal of a git form: `reserved` names a § A4 action, otherwise the form is unmodeled. */
export interface GitVerdict {
	reserved: boolean;
	why: string;
	/** The allowed spelling, for an unmodeled form. */
	spelling?: string;
}

type Value = "" | "=" | "=?";
interface Opt {
	/** Canonical key: the long name, or `-x` for a short-only option. */
	key: string;
	value: Value;
}
interface OptTable {
	long: Map<string, Opt>;
	short: Map<string, Opt>;
	/** `-<number>` is an option (`git log -5`). */
	numeric: boolean;
}

/**
 * `git <sub> -h` option lists, one token per option: `[s|][!]name[=|=?]` — `s` the short letter,
 * `!` for `--[no-]name` (both spellings), `=` a required value (attached or the next word), `=?` an
 * optional value (attached only). `s|` with no name is a short-only option. Generated (see header).
 */
const GIT_OPTIONS: Record<string, string> = {
	add: "n|!dry-run v|!verbose i|!interactive p|!patch e|!edit f|!force u|!update !renormalize N|!intent-to-add A|!all !ignore-removal= !refresh !ignore-errors !ignore-missing= !sparse !chmod= !pathspec-from-file= !pathspec-file-nul",
	commit: "q|!quiet v|!verbose F|!file= !author= !date= m|!message= c|!reedit-message= C|!reuse-message= !fixup= !squash= !reset-author trailer= s|!signoff t|!template= e|!edit !cleanup= !status S|!gpg-sign=? a|!all i|!include !interactive p|!patch o|!only n|no-verify verify !dry-run !short !branch !ahead-behind !porcelain !long z|!null !amend no-post-rewrite post-rewrite u|!untracked-files=? !pathspec-from-file= !pathspec-file-nul",
	fetch: "v|!verbose q|!quiet !all !set-upstream a|!append !atomic !upload-pack= f|!force m|!multiple t|!tags n| j|!jobs= !prefetch p|!prune P|!prune-tags= !recurse-submodules=? !dry-run !porcelain !write-fetch-head k|!keep u|!update-head-ok !progress !depth= !shallow-since= !shallow-exclude= !deepen= unshallow refetch !update-shallow= refmap= o|!server-option= 4|ipv4 6|ipv6 !negotiation-tip= !negotiate-only= !filter= !auto-maintenance !auto-gc !show-forced-updates !write-commit-graph !stdin",
	pull: "v|!verbose q|!quiet !progress !recurse-submodules=? r|!rebase=? n| !stat !log=? !signoff=? !squash !commit !edit !cleanup= !ff ff-only !verify !verify-signatures !autostash s|!strategy= X|!strategy-option= S|!gpg-sign=? !allow-unrelated-histories !all a|!append !upload-pack= f|!force t|!tags p|!prune j|!jobs=? !dry-run k|!keep !depth= !shallow-since= !shallow-exclude= !deepen= unshallow !update-shallow= refmap= o|!server-option= 4|!ipv4 6|!ipv6 !negotiation-tip= !show-forced-updates !set-upstream",
	merge: "n| !stat !summary !log=? !squash !commit e|!edit !cleanup= !ff ff-only !rerere-autoupdate !verify-signatures s|!strategy= X|!strategy-option= m|!message= F|file= !into-name= v|!verbose q|!quiet !abort !quit !continue !allow-unrelated-histories !progress S|!gpg-sign=? !autostash !overwrite-ignore !signoff no-verify verify",
	checkout: "b|= B|= l| !guess !overlay q|!quiet !recurse-submodules=? !progress m|!merge !conflict= d|!detach t|!track=? f|!force !orphan= !overwrite-ignore !ignore-other-worktrees 2|ours 3|theirs p|!patch !ignore-skip-worktree-bits !pathspec-from-file= !pathspec-file-nul",
	switch: "c|!create= C|!force-create= !guess !discard-changes q|!quiet !recurse-submodules=? !progress m|!merge !conflict= d|!detach t|!track=? f|!force !orphan= !overwrite-ignore !ignore-other-worktrees",
	restore: "s|!source= S|!staged W|!worktree !ignore-unmerged !overlay q|!quiet !recurse-submodules=? !progress m|!merge !conflict= 2|ours 3|theirs p|!patch !ignore-skip-worktree-bits !pathspec-from-file= !pathspec-file-nul",
	push: "v|!verbose q|!quiet !repo= !all !branches !mirror d|!delete !tags n|!dry-run !porcelain f|!force !force-with-lease=? !force-if-includes !recurse-submodules= !thin !receive-pack= !exec= u|!set-upstream !progress !prune no-verify verify !follow-tags !signed=? !atomic o|!push-option= 4|ipv4 6|ipv6",
	branch: "v|!verbose q|!quiet t|!track=? u|!set-upstream-to= !unset-upstream= !color=? r|remotes contains= no-contains= !abbrev=? a|all d|!delete D| m|!move M| !omit-empty c|!copy C| l|!list !show-current !create-reflog !edit-description f|!force merged= no-merged= !column=? !sort= !points-at= i|!ignore-case !recurse-submodules !format=",
	tag: "l|list n|=? d|delete v|verify a|!annotate m|message= F|!file= trailer= e|!edit s|!sign !cleanup= u|!local-user= f|!force !create-reflog !column=? contains= no-contains= merged= no-merged= !omit-empty !sort= !points-at= !format= !color=? i|!ignore-case",
	reset: "q|!quiet no-refresh refresh mixed soft hard merge keep !recurse-submodules=? p|!patch N|!intent-to-add !pathspec-from-file= !pathspec-file-nul",
	clean: "q|!quiet n|!dry-run f|!force i|!interactive d| e|exclude= x| X|",
	rebase: "!onto= !keep-base no-verify verify q|!quiet v|!verbose n|no-stat stat !signoff !committer-date-is-author-date !reset-author-date C|= !ignore-whitespace !whitespace= f|!force-rebase no-ff ff continue skip abort quit edit-todo show-current-patch apply m|merge i|interactive !rerere-autoupdate empty= !autosquash !update-refs S|!gpg-sign=? !autostash x|!exec= r|!rebase-merges=? !fork-point s|!strategy= X|!strategy-option= !root !reschedule-failed-exec !reapply-cherry-picks",
	mv: "v|!verbose n|!dry-run f|!force k| !sparse",
	rm: "n|!dry-run q|!quiet !cached f|!force r| !ignore-unmatch= !sparse !pathspec-from-file= !pathspec-file-nul",
	"cherry-pick": "quit continue abort skip !cleanup= n|no-commit commit e|!edit s|!signoff m|!mainline= !rerere-autoupdate !strategy= X|!strategy-option= S|!gpg-sign=? x| !ff !allow-empty !allow-empty-message !keep-redundant-commits empty=",
	revert: "quit continue abort skip !cleanup= n|no-commit commit e|!edit s|!signoff m|!mainline= !rerere-autoupdate !strategy= X|!strategy-option= S|!gpg-sign=? !reference",
	init: "!template= !bare shared=? q|!quiet !separate-git-dir= b|!initial-branch= !object-format= !ref-format=",
	clone: "v|!verbose q|!quiet !progress !reject-shallow= n|no-checkout checkout !bare !mirror l|!local no-hardlinks hardlinks s|!shared !recurse-submodules=? !recursive=? j|!jobs= !template= !reference= !reference-if-able= !dissociate o|!origin= b|!branch= !revision= u|!upload-pack= !depth= !shallow-since= !shallow-exclude= !single-branch !tags !shallow-submodules !separate-git-dir= !ref-format= c|!config= !server-option= 4|ipv4 6|ipv6 !filter= !also-filter-submodules !remote-submodules !sparse !bundle-uri=",
	// `git config` in its legacy (option-action) form: `git config -h` prints only the subcommand
	// usage, so this list is `git config get -h` (file, filter, display, type, other options) plus the
	// legacy actions from git-config(1) ("DEPRECATED MODES" and the action options), by hand.
	config: "!global !system !local !worktree f|!file= !blob= !all !regexp !value= !fixed-value !url= z|!null !name-only !show-origin !show-scope !show-names t|!type= bool int bool-or-int bool-or-str path expiry-date !includes !default= get get-all get-regexp get-urlmatch replace-all add unset unset-all rename-section remove-section l|list e|edit get-color get-colorbool",
};

const tables = new Map<string, OptTable>();

function table(sub: string): OptTable | null {
	const spec = GIT_OPTIONS[sub] ?? OPEN_OPTIONS[sub];
	if (spec === undefined) return null;
	let t = tables.get(sub);
	if (t) return t;
	t = { long: new Map(), short: new Map(), numeric: false };
	for (const token of spec.split(" ").filter(Boolean)) {
		if (token === "#") {
			t.numeric = true;
			continue;
		}
		const bar = token.indexOf("|");
		const short = bar === 1 ? token[0]! : "";
		let rest = bar === 1 ? token.slice(2) : token;
		const neg = rest.startsWith("!");
		if (neg) rest = rest.slice(1);
		const value: Value = rest.endsWith("=?") ? "=?" : rest.endsWith("=") ? "=" : "";
		const name = rest.slice(0, rest.length - value.length);
		const opt: Opt = { key: name || `-${short}`, value };
		if (name) t.long.set(name, opt);
		if (neg && name) t.long.set(`no-${name}`, { key: `no-${name}`, value: "" });
		if (short) t.short.set(short, opt);
	}
	tables.set(sub, t);
	return t;
}

/**
 * A long option resolved against a table the way parse-options does (parse-options.c
 * parse_long_opt): an exact name wins, else the one name the word is a prefix of. Null with a
 * reason when it is unknown or ambiguous.
 */
function resolveLong(t: OptTable, name: string): Opt | { error: string } {
	const exact = t.long.get(name);
	if (exact) return exact;
	const hits = [...t.long.entries()].filter(([n]) => n.startsWith(name));
	const keys = [...new Set(hits.map(([, o]) => o.key))];
	if (keys.length === 1) return hits[0]![1];
	if (keys.length === 0) return { error: `--${name}, an option git does not list for this subcommand` };
	return { error: `--${name}, an abbreviation git reads as ambiguous (${keys.map((k) => `--${k}`).join(", ")})` };
}

interface Parsed {
	/** Option keys present, with their value (null when none). */
	opts: Array<{ key: string; value: string | null }>;
	/** Operands before `--`. */
	operands: string[];
	/** Words after `--` (pathspecs). */
	after: string[];
	dashdash: boolean;
}

/** Split a subcommand's words by its option table; a string when a word does not resolve. */
function parse(t: OptTable, args: string[]): Parsed | string {
	const out: Parsed = { opts: [], operands: [], after: [], dashdash: false };
	for (let i = 0; i < args.length; i++) {
		const a = args[i]!;
		if (out.dashdash) {
			out.after.push(a);
			continue;
		}
		if (a === "--" || a === "--end-of-options") {
			out.dashdash = a === "--";
			if (a === "--end-of-options") {
				out.operands.push(...args.slice(i + 1));
				return out;
			}
			continue;
		}
		if (a.startsWith("--")) {
			const eq = a.indexOf("=");
			const name = eq < 0 ? a.slice(2) : a.slice(2, eq);
			const o = resolveLong(t, name);
			if ("error" in o) return o.error;
			let value: string | null = eq < 0 ? null : a.slice(eq + 1);
			if (o.value === "" && value !== null) return `--${name}=…, an option that takes no value`;
			if (o.value === "=" && value === null) {
				if (i + 1 >= args.length) return `--${name} without its value`;
				value = args[++i]!;
			}
			out.opts.push({ key: o.key, value });
			continue;
		}
		if (a.startsWith("-") && a !== "-") {
			for (let k = 1; k < a.length; k++) {
				const o = t.short.get(a[k]!);
				if (!o) return `-${a[k]}, a short option git does not list for this subcommand`;
				if (o.value === "") {
					out.opts.push({ key: o.key, value: null });
					continue;
				}
				let value: string | null = a.slice(k + 1);
				if (value === "") value = o.value === "=" ? (args[++i] ?? null) : null;
				if (o.value === "=" && value === null) return `-${a[k]} without its value`;
				out.opts.push({ key: o.key, value });
				break;
			}
			continue;
		}
		out.operands.push(a);
	}
	return out;
}

const has = (p: Parsed, ...keys: string[]): boolean => p.opts.some((o) => keys.includes(o.key));
const firstOf = (p: Parsed, keys: Record<string, string>): string | null => p.opts.find((o) => keys[o.key] !== undefined)?.key ?? null;

/** Merge strategies git ships: any other `-s <name>` runs a `git-merge-<name>` program found on PATH. */
const BUILTIN_STRATEGY = /^(?:ort|recursive|resolve|octopus|ours|subtree)$/;

const reserved = (why: string): GitVerdict => ({ reserved: true, why });
const unmodeled = (why: string, spelling: string): GitVerdict => ({ reserved: false, why, spelling });

/** Options that run a program, per subcommand: always refused, whatever else the command does. */
const RUNS_PROGRAM: Record<string, Record<string, string>> = {
	fetch: { "upload-pack": "fetch --upload-pack names a program to run" },
	pull: { "upload-pack": "pull --upload-pack names a program to run" },
	clone: { "upload-pack": "clone --upload-pack names a program to run", template: "clone --template copies hooks that run later", config: "clone -c/--config sets config (core.sshCommand, core.hooksPath, …) that runs programs" },
	init: { template: "init --template copies hooks that run later" },
	push: { "receive-pack": "push --receive-pack names a program to run", exec: "push --exec names a program to run" },
	rebase: { exec: "rebase --exec/-x runs a program after each commit" },
};

/** Options per subcommand that are § A4 reserved actions (the discard family, force-push, ref deletion). */
const RESERVED_OPTS: Record<string, Record<string, string>> = {
	reset: { hard: "git reset --hard", merge: "git reset --merge (discards working changes)", keep: "git reset --keep (moves HEAD and rewrites the work tree)" },
	checkout: { force: "git checkout --force (discards working changes)", patch: "git checkout --patch (discards working hunks)" },
	switch: { "discard-changes": "git switch --discard-changes", force: "git switch --force (discards working changes)" },
	branch: { delete: "branch deletion", "-D": "branch deletion" },
	tag: { delete: "tag deletion" },
	push: {
		force: "force-push",
		"force-with-lease": "force-push (--force-with-lease)",
		"force-if-includes": "force-push (--force-if-includes)",
		delete: "remote ref deletion (git push --delete / -d)",
		mirror: "git push --mirror (force-updates and deletes every remote ref)",
		all: "git push --all (pushes every branch, protected ones included)",
		branches: "git push --branches (pushes every branch, protected ones included)",
		prune: "git push --prune (deletes remote branches)",
	},
	pull: { force: "git pull --force (overwrites local refs)" },
};

/** Options per subcommand the gate does not model (not reserved, but not safe to pass unread). */
const UNMODELED_OPTS: Record<string, Record<string, string>> = {
	checkout: { "-B": "git checkout -B resets an existing branch", ours: "git checkout --ours overwrites paths", theirs: "git checkout --theirs overwrites paths", "pathspec-from-file": "git checkout --pathspec-from-file restores paths" },
	switch: { "force-create": "git switch -C/--force-create resets an existing branch" },
	branch: { force: "git branch -f/--force moves an existing branch", "-M": "git branch -M renames over an existing branch", "-C": "git branch -C copies over an existing branch" },
	tag: { force: "git tag -f/--force moves an existing tag" },
	mv: { force: "git mv -f/--force overwrites the destination" },
	rm: { force: "git rm -f/--force drops uncommitted changes" },
};

const WRITE_SPELLING: Record<string, string> = {
	reset: "`git reset [--soft | --mixed] [<commit>]` or `git reset [<commit>] -- <paths>` (index only)",
	checkout: "`git checkout <branch>` or `git checkout -b <new-branch> [<start>]`; never `--`, `.` or a path",
	switch: "`git switch <branch>` or `git switch -c <new-branch> [<start>]`",
	restore: "`git restore --staged <paths>` (the index only, never the work tree)",
	clean: "`git clean -n` (a dry run that lists what would go)",
	branch: "`git branch <name> [<start>]`, the list forms, `-m <old> <new>`, `-u <upstream>`",
	tag: "`git tag <name> [<commit>]`, `git tag -a <name> -m <msg>`, or `git tag --list`",
	push: "`git push [-u] [--dry-run] <remote> <branch>` to a branch that is not protected, with no force, delete, `+refspec`, `--mirror`, `--all` or `--prune`",
	rebase: "`git rebase <ref>`, or `git rebase --continue | --abort | --skip | --quit`",
	config: "`git config --get <key>`, `git config --list`/`-l`, `git config get <key>` or `git config list` (config reads only)",
	fetch: "`git fetch [<remote> [<ref>…]]` with fetch's other options",
	pull: "`git pull [<remote> [<ref>]]` without --force or --upload-pack",
	merge: "`git merge <ref>` (with a built-in strategy, if any)",
	mv: "`git mv <src> <dst>` without -f",
	rm: "`git rm <paths>` without -f",
};

/** A space-separated word list as a lookup table. */
const words = (list: string): Record<string, true> => Object.fromEntries(list.split(" ").map((k) => [k, true]));

/**
 * Commands that read, or write only what no § A4 action names (a patch file, packed objects), with
 * every option git documents for each (M4 fix round 5, Plumb's ruling: "any option not modeled →
 * refused", read commands included). Generated on git 2.50.1 (Apple Git-155) from two sources: the
 * `git <sub> -h` usage text, and the man page git-<sub>(1) shipped with that git (`man -w
 * git-<sub>`): its option lines, its synopsis forms (`git diff … --cached`), and "--x is a synonym"
 * sentences, "--heads and -h are deprecated synonyms" included. A page that defers to another page's
 * options carries that page's list too, per git's own words: whatchanged ("essentially the same as
 * git-log(1)") and show ("Some options that git log command understands can be used") take log's;
 * blame and annotate take rev-list's (`-h`: "<rev-opts> are documented in git-rev-list(1)"). Tokens as in
 * GIT_OPTIONS, plus `#` for `-<number>`. Refresh: rebuild from the same sources on the git a profile
 * pins (the generator is in the M4 fix round 5 record).
 * An option listed here can still be refused by OPEN_REFUSED.
 */
const OPEN_OPTIONS: Record<string, string> = {
	status: "!ahead-behind !branch !column=? !ignore-submodules=? !ignored=? !long !null !porcelain=? !short !show-stash !untracked-files=? !verbose M| b| find-renames=? no-ahead-behind no-column no-renames renames s| u|=? v| z|",
	log: "!decorate-refs-exclude= !decorate-refs= !mailmap !quiet !rename-empty !source !use-mailmap # B|=? C|=? D| E| F| G|= I|= L|= M|=? O|= P| R| S|= U|= W| X|=? abbrev-commit abbrev=? after= all all-match alternate-refs ancestry-path=? anchored= author-date-order author= a| basic-regexp before= binary bisect boundary branches branches=? break-rewrites=? b| cc check cherry cherry-mark cherry-pick children clear-decorations color-moved-ws= color-moved=? color-words=? color=? combined-all-paths committer= compact-summary cumulative c| date-order date= dd decorate=? default-prefix dense diff-algorithm= diff-filter= diff-merges= dirstat-by-file=? dirstat=? do-walk dst-prefix= encoding= exclude-first-parent-only exclude-hidden= exclude= expand-tabs expand-tabs= ext-diff extended-regexp find-copies-harder find-copies=? find-object= find-renames=? first-parent fixed-strings follow format= full-diff full-history full-index function-context glob= graph grep-reflog= grep= g| histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-matching-lines= ignore-missing ignore-space-at-eol ignore-space-change ignore-submodules=? indent-heuristic inter-hunk-context= invert-grep irreversible-delete ita-invisible-in-index i| left-only left-right line-prefix= log-size l|= max-count= max-parents= merge merges min-parents= minimal m| name-only name-status no-abbrev-commit no-color no-color-moved no-color-moved-ws no-decorate no-diff-merges no-expand-tabs no-ext-diff no-indent-heuristic no-max-parents no-merges no-min-parents no-notes no-patch no-prefix no-relative no-renames no-standard-notes no-textconv no-walk=? not notes=? numstat n|= oneline output-indicator-context= output-indicator-new= output-indicator-old= output= parents patch patch-with-raw patch-with-stat patience perl-regexp pickaxe-all pickaxe-regex pretty=? p| q| raw reflog regexp-ignore-case relative-date relative=? remerge-diff remotes= remotes=? remove-empty reverse right-only rotate-to= shortstat show-linear-break=? show-notes-by-default show-notes=? show-pulls show-signature simplify-by-decoration simplify-merges since-as-filter= since= single-worktree skip-to= skip= sparse src-prefix= standard-notes stat=? stdin submodule=? summary s| tags=? text textconv topo-order t| unified= until= u| walk-reflogs word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	diff: "!abbrev=? !color-moved-ws= !color-moved=? !compact-summary !exit-code !ext-diff !find-copies-harder !follow !full-index !function-context !ignore-matching-lines= !indent-heuristic !quiet !relative=? !rename-empty !text !textconv 0| 1| 2| 3| B|=? C|=? D| G|= I|= M|=? O|= R| S|= U|= W| X|=? anchored= a| base binary break-rewrites=? b| cached check color-words=? color=? cumulative default-prefix diff-algorithm= diff-filter= diff-filter=? dirstat-by-file=? dirstat=? dst-prefix= find-copies=? find-object= find-renames=? histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-space-at-eol ignore-space-change ignore-submodules=? inter-hunk-context= irreversible-delete ita-invisible-in-index ita-visible-in-index line-prefix= l|= merge-base minimal name-only name-status no-color no-color-moved no-color-moved-ws no-ext-diff no-indent-heuristic no-index no-patch no-prefix no-relative no-renames no-textconv numstat ours output-indicator-context= output-indicator-new= output-indicator-old= output= patch patch-with-raw patch-with-stat patience pickaxe-all pickaxe-regex p| raw rotate-to= shortstat skip-to= src-prefix= staged stat-count= stat-graph-width= stat-name-width= stat-width= stat=? submodule=? summary s| theirs unified= unified=? u| word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	show: "!decorate-refs-exclude= !decorate-refs= !mailmap !quiet !rename-empty !source !use-mailmap # B|=? C|=? D| E| F| G|= I|= L|= M|=? O|= P| R| S|= U|= W| X|=? abbrev-commit abbrev=? after= all all-match alternate-refs ancestry-path=? anchored= author-date-order author= a| basic-regexp before= binary bisect boundary branches branches=? break-rewrites=? b| cc check cherry cherry-mark cherry-pick children clear-decorations color-moved-ws= color-moved=? color-words=? color=? combined-all-paths committer= compact-summary cumulative c| date-order date= dd decorate=? default-prefix dense diff-algorithm= diff-filter= diff-merges= dirstat-by-file=? dirstat=? do-walk dst-prefix= encoding= exclude-first-parent-only exclude-hidden= exclude= expand-tabs expand-tabs= ext-diff extended-regexp find-copies-harder find-copies=? find-object= find-renames=? first-parent fixed-strings follow format= full-diff full-history full-index function-context glob= graph grep-reflog= grep= g| histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-matching-lines= ignore-missing ignore-space-at-eol ignore-space-change ignore-submodules=? indent-heuristic inter-hunk-context= invert-grep irreversible-delete ita-invisible-in-index i| left-only left-right line-prefix= log-size l|= max-count= max-parents= merge merges min-parents= minimal m| name-only name-status no-abbrev-commit no-color no-color-moved no-color-moved-ws no-decorate no-diff-merges no-expand-tabs no-ext-diff no-indent-heuristic no-max-parents no-merges no-min-parents no-notes no-patch no-prefix no-relative no-renames no-standard-notes no-textconv no-walk=? not notes=? numstat n|= oneline output-indicator-context= output-indicator-new= output-indicator-old= output= parents patch patch-with-raw patch-with-stat patience perl-regexp pickaxe-all pickaxe-regex pretty pretty=? p| q| raw reflog regexp-ignore-case relative-date relative=? remerge-diff remotes= remotes=? remove-empty reverse right-only rotate-to= shortstat show-linear-break=? show-notes-by-default show-notes=? show-pulls show-signature simplify-by-decoration simplify-merges since-as-filter= since= single-worktree skip-to= skip= sparse src-prefix= standard-notes stat=? stdin submodule=? summary s| tags=? text textconv topo-order t| unified= until= u| walk-reflogs word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	"rev-parse": "abbrev-ref=? absolute-git-dir after= all before= branches=? default= disambiguate= exclude-hidden= exclude= flags git-common-dir git-dir git-path= glob= is-bare-repository is-inside-git-dir is-inside-work-tree is-shallow-repository keep-dashdash local-env-vars no-flags no-revs not output-object-format= parseopt path-format= prefix= quiet q| remotes=? resolve-git-dir= revs-only shared-index-path short=? show-cdup show-object-format=? show-prefix show-ref-format show-superproject-working-tree show-toplevel since= sq sq-quote stop-at-non-option stuck-long symbolic symbolic-full-name tags=? until= verify",
	"ls-files": "!abbrev=? !cached !debug !deduplicate !deleted !directory !empty-directory !eol !error-unmatch !exclude-per-directory= !ignored !killed !modified !others !recurse-submodules !resolve-undo !sparse !stage !unmerged !with-tree= X|= c| d| exclude-from= exclude-standard exclude= format= full-name f| i| k| m| no-empty-directory o| s| t| u| v| x|= z|",
	"ls-tree": "!abbrev=? !full-name !full-tree d| format= long l| name-only name-status object-only r| t| z|",
	"ls-remote": "!branches !exit-code !get-url !quiet !refs !server-option= !sort= !symref !tags !upload-pack= b| heads h| o|= q| t|",
	blame: "!abbrev=? !color-by-age !color-lines !contents= !ignore-rev= !ignore-revs-file= !incremental !minimal !object-names !porcelain !progress !root !score-debug !show-name !show-number !show-stats # C|=? E| F| L|= M|=? P| S|= abbrev-commit abbrev= after= all all-match alternate-refs ancestry-path=? author-date-order author= basic-regexp before= bisect bisect-all bisect-vars boundary branches branches=? b| cherry cherry-mark cherry-pick children commit-header committer= count c| date-order date= dense disk-usage disk-usage= disk-usage=? do-walk encoding= exclude-first-parent-only exclude-hidden= exclude-promisor-objects exclude= expand-tabs expand-tabs= extended-regexp e| filter-print-omitted filter-provided-objects filter= first-parent fixed-strings format= full-history f| glob= graph grep-reflog= grep= g| header h| ignore-missing in-commit-order indexed-objects invert-grep i| left-only left-right line-porcelain l| max-age= max-count= max-parents= merge merges min-age= min-parents= missing= no-abbrev-commit no-commit-header no-expand-tabs no-filter no-max-parents no-merges no-min-parents no-object-names no-walk=? not n|= objects objects-edge objects-edge-aggressive oneline parents perl-regexp pretty=? progress= p| quiet reflog regexp-ignore-case relative-date remotes remotes= remotes=? remove-empty reverse reverse= right-only show-email show-linear-break=? show-pulls show-signature simplify-by-decoration simplify-merges since-as-filter= since= single-worktree skip= sparse stdin s| tags tags=? timestamp topo-order t| unpacked until= use-bitmap-index walk-reflogs w| z|",
	annotate: "!abbrev=? !color-by-age !color-lines !contents= !ignore-rev= !ignore-revs-file= !incremental !minimal !object-names !porcelain !progress !root !score-debug !show-name !show-number !show-stats # C|=? E| F| L|= M|=? P| S|= abbrev-commit after= all all-match alternate-refs ancestry-path=? author-date-order author= basic-regexp before= bisect bisect-all bisect-vars boundary branches branches=? b| cherry cherry-mark cherry-pick children commit-header committer= count c| date-order date= dense disk-usage disk-usage= disk-usage=? do-walk encoding= exclude-first-parent-only exclude-hidden= exclude-promisor-objects exclude= expand-tabs expand-tabs= extended-regexp e| filter-print-omitted filter-provided-objects filter= first-parent fixed-strings format= full-history f| glob= graph grep-reflog= grep= g| header h| ignore-missing in-commit-order indexed-objects invert-grep i| left-only left-right line-porcelain l| max-age= max-count= max-parents= merge merges min-age= min-parents= missing= no-abbrev-commit no-commit-header no-expand-tabs no-filter no-max-parents no-merges no-min-parents no-object-names no-walk=? not n|= objects objects-edge objects-edge-aggressive oneline parents perl-regexp pretty=? progress= p| quiet reflog regexp-ignore-case relative-date remotes remotes= remotes=? remove-empty reverse reverse= right-only show-linear-break=? show-pulls show-signature simplify-by-decoration simplify-merges since-as-filter= since= single-worktree skip= sparse stdin s| tags tags=? timestamp topo-order t| unpacked until= use-bitmap-index walk-reflogs w| z|",
	shortlog: "!committer !email !group= !numbered !summary # E| F| P| after= all all-match alternate-refs ancestry-path=? author= basic-regexp before= bisect boundary branches=? cherry cherry-mark cherry-pick committer= c| date= dense exclude-first-parent-only exclude-hidden= exclude= extended-regexp e| first-parent fixed-strings format=? full-history glob= grep-reflog= grep= g| ignore-missing invert-grep i| left-only max-count= max-parents= merge merges min-parents= no-max-parents no-merges no-min-parents not n|= perl-regexp pretty= reflog regexp-ignore-case remotes=? remove-empty right-only show-pulls simplify-by-decoration simplify-merges since-as-filter= since= single-worktree skip= sparse stdin s| tags=? until= walk-reflogs w|=?",
	describe: "!abbrev=? !all !always !broken=? !contains !debug !exact-match !exclude= !first-parent !long !match= !tags abbrev= candidates= dirty dirty=?",
	"cat-file": "!buffer !filter= !follow-symlinks !mailmap !unordered !use-mailmap Z| batch batch-all-objects batch-check batch-check= batch-check=? batch-command batch-command= batch-command=? batch= batch=? e| filters no-filter path= p| s| textconv t| z|",
	"show-ref": "!abbrev=? !branches !dereference !exists !head !quiet !tags !verify abbrev d| exclude-existing exclude-existing=? hash hash=? heads q| s|",
	"for-each-ref": "!count= !exclude= !format= !ignore-case !include-root-refs !omit-empty !perl !points-at= !python !shell !sort= !stdin !tcl color=? contains contains= contains=? merged merged= merged=? no-contains no-contains= no-contains=? no-merged no-merged= no-merged=? points-at p| s|",
	"merge-base": "!all a| fork-point independent is-ancestor octopus",
	"name-rev": "!all !always !exclude= !name-only !tags !undefined annotate-stdin no-undefined refs=",
	"rev-list": "!object-names # E| F| P| abbrev-commit after= all all-match alternate-refs ancestry-path=? author-date-order author= basic-regexp before= bisect bisect-all bisect-vars boundary branches branches=? cherry cherry-mark cherry-pick children commit-header committer= count date-order date= dense disk-usage disk-usage= disk-usage=? do-walk encoding= exclude-first-parent-only exclude-hidden= exclude-promisor-objects exclude= expand-tabs expand-tabs= extended-regexp filter-print-omitted filter-provided-objects filter= first-parent fixed-strings format= full-history glob= graph grep-reflog= grep= g| header ignore-missing in-commit-order indexed-objects invert-grep i| left-only left-right max-age= max-count= max-parents= merge merges min-age= min-parents= missing= no-abbrev-commit no-commit-header no-expand-tabs no-filter no-max-parents no-merges no-min-parents no-object-names no-walk=? not n|= objects objects-edge objects-edge-aggressive oneline parents perl-regexp pretty=? progress= quiet reflog regexp-ignore-case relative-date remotes remotes= remotes=? remove-empty reverse right-only show-linear-break=? show-pulls show-signature simplify-by-decoration simplify-merges since-as-filter= since= single-worktree skip= sparse stdin tags tags=? timestamp topo-order unpacked until= use-bitmap-index walk-reflogs z|",
	"check-ignore": "!non-matching !quiet !stdin !verbose index no-index n| q| v| z|",
	"check-attr": "!all !cached !source= !stdin a| source z|",
	"check-mailmap": "!mailmap-blob= !mailmap-file= !stdin",
	"check-ref-format": "!allow-onelevel branch normalize refspec-pattern",
	grep: "!all-match !basic-regexp !break !cached !column !context= !count !exclude-standard !ext-grep !extended-regexp !files-with-matches !files-without-match !fixed-strings !full-name !function-context !heading !ignore-case !invert-match !line-number !max-count= !name-only !null !only-matching !open-files-in-pager=? !perl-regexp !quiet !recurse-submodules !recursive !show-function !text !textconv !threads= !untracked !word-regexp # A|= B|= C|= E| F| G| H| I| L| O|=? P| W| after-context= and a| before-context= color=? c| e|= f|= h| index i| l| max-depth= m|= no-color no-exclude-standard no-index no-recursive no-textconv not n| or o| p| q| r| v| w| z|",
	whatchanged: "!decorate-refs-exclude= !decorate-refs= !mailmap !quiet !rename-empty !source !use-mailmap # B|=? C|=? D| E| F| G|= I|= L|= M|=? O|= P| R| S|= U|= W| X|=? abbrev-commit abbrev=? after= all all-match alternate-refs ancestry-path=? anchored= author-date-order author= a| basic-regexp before= binary bisect boundary branches branches=? break-rewrites=? b| cc check cherry cherry-mark cherry-pick children clear-decorations color-moved-ws= color-moved=? color-words=? color=? combined-all-paths committer= compact-summary cumulative c| date-order date= dd decorate=? default-prefix dense diff-algorithm= diff-filter= diff-merges= dirstat-by-file=? dirstat=? do-walk dst-prefix= encoding= exclude-first-parent-only exclude-hidden= exclude= expand-tabs expand-tabs= ext-diff extended-regexp find-copies-harder find-copies=? find-object= find-renames=? first-parent fixed-strings follow format= full-diff full-history full-index function-context glob= graph grep-reflog= grep= g| histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-matching-lines= ignore-missing ignore-space-at-eol ignore-space-change ignore-submodules=? indent-heuristic inter-hunk-context= invert-grep irreversible-delete ita-invisible-in-index i| left-only left-right line-prefix= log-size l|= max-count= max-parents= merge merges min-parents= minimal m| name-only name-status no-abbrev-commit no-color no-color-moved no-color-moved-ws no-decorate no-diff-merges no-expand-tabs no-ext-diff no-indent-heuristic no-max-parents no-merges no-min-parents no-notes no-patch no-prefix no-relative no-renames no-standard-notes no-textconv no-walk=? not notes=? numstat n|= oneline output-indicator-context= output-indicator-new= output-indicator-old= output= parents patch patch-with-raw patch-with-stat patience perl-regexp pickaxe-all pickaxe-regex pretty=? p| q| raw reflog regexp-ignore-case relative-date relative=? remerge-diff remotes= remotes=? remove-empty reverse right-only rotate-to= shortstat show-linear-break=? show-notes-by-default show-notes=? show-pulls show-signature simplify-by-decoration simplify-merges since-as-filter= since= single-worktree skip-to= skip= sparse src-prefix= standard-notes stat=? stdin submodule=? summary s| tags=? text textconv topo-order t| unified= until= u| walk-reflogs word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	"range-diff": "!abbrev=? !color-moved-ws= !color-moved=? !compact-summary !creation-factor= !diff-merges= !exit-code !ext-diff !find-copies-harder !follow !full-index !function-context !ignore-matching-lines= !indent-heuristic !left-only !notes=? !quiet !relative=? !remerge-diff !rename-empty !right-only !text !textconv B| C| D| G|= I| M| O|= R| S|= U| W| X| anchored= a| binary break-rewrites=? b| check color-words=? color= cumulative default-prefix diff-algorithm= diff-filter=? dirstat-by-file=? dirstat=? dual-color find-copies=? find-object= find-renames=? histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-space-change ignore-submodules=? inter-hunk-context= irreversible-delete ita-invisible-in-index ita-visible-in-index line-prefix= l|= minimal name-only name-status no-color no-dual-color no-patch no-prefix no-renames numstat output-indicator-context= output-indicator-new= output-indicator-old= output= patch patch-with-raw patch-with-stat patience pickaxe-all pickaxe-regex p| raw rotate-to= shortstat skip-to= stat-count= stat-graph-width= stat-name-width= stat-width= stat=? submodule=? summary s| unified=? u| word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	cherry: "!abbrev=? !verbose v|",
	"show-branch": "!all !current !independent !list !merge-base !more=? !remotes !sha1-name !sparse !topics a| color color=? date-order g| more= name no-color no-name reflog reflog=? r| topo-order",
	"count-objects": "!human-readable !verbose H| v|",
	var: "l|",
	version: "!build-options",
	help: "!aliases !external-commands !info !man !verbose !web all a| config c| developer-interfaces guides g| i| m| no-aliases no-external-commands user-interfaces v| w|",
	"diff-tree": "!rename-empty B|=? C|=? D| G|= I|= M|=? O|= R| S|= U|= W| X|=? abbrev-commit abbrev= abbrev=? always anchored= a| binary break-rewrites=? b| cc check color-moved-ws= color-moved=? color-words=? color=? combined-all-paths compact-summary cumulative c| default-prefix diff-algorithm= diff-filter= dirstat-by-file=? dirstat=? dst-prefix= encoding= exit-code expand-tabs expand-tabs= ext-diff find-copies-harder find-copies=? find-object= find-renames=? format= full-index function-context histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-matching-lines= ignore-space-at-eol ignore-space-change ignore-submodules=? indent-heuristic inter-hunk-context= irreversible-delete ita-invisible-in-index line-prefix= l|= merge-base minimal m| name-only name-status no-abbrev-commit no-color no-color-moved no-color-moved-ws no-commit-id no-expand-tabs no-ext-diff no-indent-heuristic no-notes no-patch no-prefix no-relative no-renames no-standard-notes no-textconv notes=? numstat oneline output-indicator-context= output-indicator-new= output-indicator-old= output= patch patch-with-raw patch-with-stat patience pickaxe-all pickaxe-regex pretty pretty=? p| quiet raw relative=? root rotate-to= r| shortstat show-notes-by-default show-notes=? show-signature skip-to= src-prefix= standard-notes stat stat=? stdin submodule=? summary s| text textconv t| unified= u| v| word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	"diff-index": "!rename-empty B|=? C|=? D| G|= I|= M|=? O|= R| S|= U|= W| X|=? abbrev= abbrev=? anchored= a| binary break-rewrites=? b| cached check color-moved-ws= color-moved=? color-words=? color=? compact-summary cumulative default-prefix diff-algorithm= diff-filter= dirstat-by-file=? dirstat=? dst-prefix= exit-code ext-diff find-copies-harder find-copies=? find-object= find-renames=? full-index function-context histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-matching-lines= ignore-space-at-eol ignore-space-change ignore-submodules=? indent-heuristic inter-hunk-context= irreversible-delete ita-invisible-in-index line-prefix= l|= merge-base minimal m| name-only name-status no-color no-color-moved no-color-moved-ws no-ext-diff no-indent-heuristic no-patch no-prefix no-relative no-renames no-textconv numstat output-indicator-context= output-indicator-new= output-indicator-old= output= patch patch-with-raw patch-with-stat patience pickaxe-all pickaxe-regex p| quiet raw relative=? rotate-to= shortstat skip-to= src-prefix= stat stat=? submodule=? summary s| text textconv unified= u| word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	"diff-files": "!rename-empty 0| 1| 2| 3| B|=? C|=? D| G|= I|= M|=? O|= R| S|= U|= W| X|=? abbrev= abbrev=? anchored= a| binary break-rewrites=? b| cc check color-moved-ws= color-moved=? color-words=? color=? compact-summary cumulative c| default-prefix diff-algorithm= diff-filter= dirstat-by-file=? dirstat=? dst-prefix= exit-code ext-diff find-copies-harder find-copies=? find-object= find-renames=? full-index function-context histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-matching-lines= ignore-space-at-eol ignore-space-change ignore-submodules=? indent-heuristic inter-hunk-context= irreversible-delete ita-invisible-in-index line-prefix= l|= minimal name-only name-status no-color no-color-moved no-color-moved-ws no-ext-diff no-indent-heuristic no-patch no-prefix no-relative no-renames no-textconv numstat output-indicator-context= output-indicator-new= output-indicator-old= output= patch patch-with-raw patch-with-stat patience pickaxe-all pickaxe-regex p| quiet q| raw relative=? rotate-to= shortstat skip-to= src-prefix= stat stat=? submodule=? summary s| text textconv unified= u| word-diff-regex= word-diff=? ws-error-highlight= w| z|",
	"verify-commit": "!raw !verbose v|",
	"verify-tag": "!format= !raw !verbose v|",
	apply: "!3way !allow-empty !allow-overlap !apply !build-fake-ancestor= !cached !check !directory= !ignore-space-change !ignore-whitespace !index !intent-to-add !numstat !quiet !recount !reject !reverse !stat !summary !unidiff-zero !unsafe-paths !verbose !whitespace= 3| C|= N| R| add allow-binary-replacement binary exclude= inaccurate-eof include= no-add ours p|= q| theirs union v| z|",
	"format-patch": "!add-header= !attach=? !base= !base=? !cc= !cover-from-description= !cover-letter !creation-factor= !description-file= !filename-max-length= !force-in-body-from !ignore-if-in-upstream !in-reply-to= !interdiff= !numbered !progress !quiet !range-diff= !rename-empty !reroll-count= !rfc=? !signature-file= !signature= !signoff !start-number= !stdout !suffix= !thread=? !to= !zero-commit # B|=? C|=? D| I|= M|=? N| O|= U|= W| X|=? abbrev=? always anchored= a| binary break-rewrites=? b| compact-summary cumulative default-prefix diff-algorithm= dirstat-by-file=? dirstat=? dst-prefix= encode-email-headers ext-diff find-copies-harder find-copies=? find-renames=? from from= full-index function-context histogram ignore-all-space ignore-blank-lines ignore-cr-at-eol ignore-matching-lines= ignore-space-at-eol ignore-space-change ignore-submodules=? indent-heuristic inline=? inter-hunk-context= irreversible-delete ita-invisible-in-index keep-subject k| line-prefix= l|= minimal no-attach no-binary no-encode-email-headers no-ext-diff no-indent-heuristic no-notes no-numbered no-prefix no-relative no-renames no-stat no-textconv no-thread notes=? numbered-files numstat n| output-directory output-directory= output-indicator-context= output-indicator-new= output-indicator-old= output= o|= patience p| q| relative=? root rotate-to= shortstat skip-to= src-prefix= stat=? subject-prefix= summary s| text textconv unified= v|= w|",
	gc: "!aggressive !auto !cruft !detach !expire-to= !force !keep-largest-pack !quiet max-cruft-size= no-prune prune= q|",
	fsck: "!cache !connectivity-only !dangling !full !lost-found !name-objects !progress !references !reflogs !root !strict !tags !unreachable !verbose no-reflogs v|",
	archive: "!add-file= !add-virtual-file= !format= !list !output= !prefix= !remote= !verbose !worktree-attributes # exec exec= l| mtime= o|= remote v|",
	"interpret-trailers": "!if-exists= !if-missing= !in-place !only-input !only-trailers !trailer= !trim-empty !unfold !where= divider no-divider no-if-exists no-if-missing no-where parse trailer",
	stripspace: "comment-lines c| strip-comments s|",
	"hash-object": "!literally !path= !stdin !stdin-paths filters no-filters path t|= w|",
};
/** Revision/diff commands: they do not abbreviate options (header), so these match exactly. */
const NO_ABBREV = words("log diff show whatchanged diff-tree diff-index diff-files range-diff rev-list shortlog cherry format-patch rev-parse");
/** Options of the OPEN commands that write a file where the gate does not look, or run a program. */
const OPEN_REFUSED: Record<string, Record<string, string>> = {
	"*": { output: "--output writes the output to a file (it can name .git/hooks)" },
	grep: { "open-files-in-pager": "git grep -O/--open-files-in-pager runs a program" },
	"ls-remote": { "upload-pack": "ls-remote --upload-pack names a program to run", exec: "ls-remote --exec names a program to run" },
	archive: { exec: "archive --exec names a program to run", remote: "archive --remote runs git-upload-archive elsewhere" },
	// Live, git 2.50.1: `git apply --unsafe-paths --directory=.git/hooks p.diff` wrote an executable
	// .git/hooks/pre-commit (exit 0); without --unsafe-paths git refuses "invalid path".
	apply: { "unsafe-paths": "git apply --unsafe-paths writes outside the work tree (it can write .git/hooks)" },
};
/** Short spellings of OPEN_REFUSED options, per subcommand: refused wherever the letter appears in a short-option word. */
const OPEN_REFUSED_SHORT: Record<string, Record<string, string>> = {
	grep: { O: "open-files-in-pager" },
	archive: { o: "output" },
};

/** Why an OPEN subcommand's options are refused, or null: each option word must be one git documents for it. */
function openVerdict(g: GitCall, sub: string, args: string[]): GitVerdict | null {
	const t = table(sub)!;
	const refused = { ...OPEN_REFUSED["*"], ...OPEN_REFUSED[sub] };
	const abbrev = !NO_ABBREV[sub];
	const spelling = `\`git ${sub}\` with the options git documents for it (\`git ${sub} -h\`, git-${sub}(1))`;
	for (let i = 0; i < args.length; i++) {
		const a = args[i]!;
		if (a === "--" || a === "--end-of-options") break;
		if (!a.startsWith("-") || a === "-") continue;
		if (a.startsWith("--")) {
			const name = a.slice(2).split("=")[0]!;
			for (const [opt, why] of Object.entries(refused)) {
				if (name === opt || (abbrev && name !== "" && opt.startsWith(name))) return unmodeled(why, `\`git ${sub}\` without it`);
			}
			if (t.long.has(name)) continue;
			if (abbrev) {
				const o = resolveLong(t, name);
				if (!("error" in o)) continue;
				return unmodeled(`git ${sub} ${o.error}`, spelling);
			}
			return unmodeled(`git ${sub} --${name}, an option git does not document for this subcommand (and it does not abbreviate)`, spelling);
		}
		if (t.numeric && /^-\d+$/.test(a)) continue;
		for (const [letter, opt] of Object.entries(OPEN_REFUSED_SHORT[sub] ?? {})) {
			if (a.includes(letter)) return unmodeled(refused[opt]!, `\`git ${sub}\` without -${letter}`);
		}
		for (let k = 1; k < a.length; k++) {
			const o = t.short.get(a[k]!);
			if (!o) return unmodeled(`git ${sub} -${a[k]}, a short option git does not document for this subcommand`, spelling);
			if (o.value !== "") break; // the rest of the word is its value
		}
	}
	const inPlace = args.some((a) => a.startsWith("--") && !a.includes("=") && a.length > 2 && (a === "--in-place" || "--in-place".startsWith(a)));
	if (sub === "interpret-trailers" && inPlace && (insideDotGit(g.dir ?? "") || args.some((a) => !a.startsWith("-") && insideDotGit(a)))) {
		return unmodeled("git interpret-trailers --in-place on a file inside .git rewrites git's own files", "`git interpret-trailers` on a file outside .git");
	}
	return null;
}

/** Subcommands refused outright: each rewrites history, moves refs directly, or runs a program. */
const REFUSED_SUBS: Record<string, GitVerdict> = {
	"update-ref": reserved("git update-ref moves or deletes a ref directly (a history rewrite)"),
	"filter-branch": reserved("git filter-branch rewrites history"),
	replace: reserved("git replace substitutes objects (a history rewrite)"),
	difftool: unmodeled("git difftool runs an external program (--extcmd, -x or the configured tool)", "`git diff`"),
	mergetool: unmodeled("git mergetool runs an external program", "resolving the conflict by editing the file, then `git add`"),
};

/** Is `p` a path in the work tree (it exists, or git tracks it)? `checkout <p>` would then restore it. */
function isWorkTreePath(dir: string, p: string): boolean {
	if (p === "." || p === ".." || p.startsWith(":") || p.includes("*") || p.includes("?")) return true;
	try {
		lstatSync(resolve(dir, p));
		return true;
	} catch {
		// not on disk: tracked (deleted in the work tree) is still a path
	}
	const r = spawnSync("git", ["ls-files", "--error-unmatch", "--", p], { cwd: dir, encoding: "utf8", timeout: 5000, env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } });
	return r.status === 0;
}

/** A push refspec's destination on the remote (`src:dst` → dst; a bare `src` → src). */
function pushDestination(spec: string): string {
	const s = spec.replace(/^\+/, "");
	return s.includes(":") ? s.slice(s.indexOf(":") + 1) : s;
}

/** Is a destination ref protected (`main`, `refs/heads/main`, `heads/main`, and the other PROTECTED_BRANCH names)? */
export function protectedRef(dst: string): boolean {
	const name = dst.replace(/^refs\/heads\//, "").replace(/^heads\//, "");
	return PROTECTED_BRANCH.test(name) || dst.includes("*");
}

function checkPush(p: Parsed): GitVerdict | null {
	// The first operand is the remote; every later one is a refspec.
	for (const spec of [...p.operands, ...p.after].slice(1)) {
		if (spec.startsWith("+")) return reserved("force-push (+refspec)");
		if (spec.startsWith(":")) return reserved("remote ref deletion (git push :ref)");
		if (protectedRef(pushDestination(spec))) return reserved("push to a protected branch");
	}
	return null;
}

function checkConfig(p: Parsed, args: string[]): GitVerdict | null {
	// New-style subcommands: `git config get|list` read; every other one writes.
	const first = args.find((a) => !a.startsWith("-"));
	if (first === "get" || first === "list") return null;
	const reads = ["get", "get-all", "get-regexp", "get-urlmatch", "list", "get-color", "get-colorbool"];
	const actions = p.opts.filter((o) => reads.includes(o.key) || ["replace-all", "add", "unset", "unset-all", "rename-section", "remove-section", "edit"].includes(o.key));
	if (actions.length === 1 && reads.includes(actions[0]!.key)) return null;
	// The legacy read with no action: `git config <key>`.
	if (actions.length === 0 && p.operands.length === 1) return null;
	return unmodeled("git config without --get or --list writes configuration (it can set core.hooksPath, core.sshCommand, aliases, …)", WRITE_SPELLING.config!);
}

/**
 * Why a `git` command (already a modeled form per gitUnmodeled: literal words, builtin subcommand)
 * is refused by the positive model, or null.
 */
export function gitModel(g: GitCall): GitVerdict | null {
	const sub = g.sub;
	if (!sub) return null; // bare `git`, or an unknown subcommand gitUnmodeled refuses
	const args = g.args.map((w: Word) => w.text);
	if (args.length === 1 && (args[0] === "-h" || args[0] === "--help")) return null;
	const refusedSub = REFUSED_SUBS[sub];
	if (refusedSub) return refusedSub;

	if (OPEN_OPTIONS[sub] !== undefined) return openVerdict(g, sub, args);

	switch (sub) {
		case "reflog": {
			const first = args[0];
			return first === undefined || first.startsWith("-") || ["show", "list", "exists"].includes(first) ? null : unmodeled(`git reflog ${first} rewrites the reflog`, "`git reflog [show]`");
		}
		case "stash": {
			const first = args.find((a) => !a.startsWith("-"));
			if (first === "drop" || first === "clear") return unmodeled(`git stash ${first} (discards stashed work)`, "`git stash`, `git stash list`, `show`, `push`, `pop` or `apply`");
			return null;
		}
		case "remote": {
			const first = args.find((a) => !a.startsWith("-"));
			if (first === undefined || ["show", "get-url"].includes(first)) return null;
			if (first === "add") return args.some((a) => /^--mi/.test(a)) ? unmodeled("git remote add --mirror makes every later push a mirror push", "`git remote add <name> <url>`") : null;
			if (first === "set-head" || first === "update" || first === "set-url") return null;
			return unmodeled(`git remote ${first}, which deletes or renames remote refs and config`, "`git remote -v`, `show`, `get-url`, `add`, `set-url`, `set-head`, `update`");
		}
		case "worktree": {
			const first = args[0];
			if (first === "list" || first === "lock" || first === "unlock" || first === "move") return null;
			if (first === "add") return args.includes("-B") ? unmodeled("git worktree add -B resets an existing branch", "`git worktree add <path> [<branch>]` or `-b <new-branch>`") : null;
			return unmodeled(`git worktree ${first ?? ""}, which removes or prunes work trees`.trim(), "`git worktree list` or `git worktree add <path> [<branch>]`");
		}
		case "submodule": {
			const first = args.find((a) => !a.startsWith("-"));
			if (first === "foreach") return unmodeled("git submodule foreach runs a command in every submodule", "`git submodule status`");
			if (first === "update") return args.some((a) => /^(-f|--force)$/.test(a)) ? unmodeled("git submodule update --force discards submodule work-tree changes", "`git submodule update [--init] [--recursive]`") : null;
			if (first === undefined || ["status", "summary", "init", "sync"].includes(first)) return null;
			return unmodeled(`git submodule ${first}`, "`git submodule status | summary | init | sync | update`");
		}
		case "bisect": {
			const first = args[0];
			if (first === "run") return unmodeled("git bisect run runs a program at every step", "`git bisect good|bad|skip|reset|log`");
			if (first === "visualize" || first === "view") return unmodeled(`git bisect ${first} runs gitk or a pager program`, "`git bisect log`");
			return null;
		}
		case "symbolic-ref":
			return args.filter((a) => !a.startsWith("-")).length <= 1 && !args.some((a) => /^(-d|--delete)$/.test(a)) ? null : reserved("git symbolic-ref writing or deleting HEAD (a ref move)");
		case "config": {
			const t = table("config")!;
			const p = parse(t, args[0] === "get" || args[0] === "list" ? args.slice(1) : args);
			if (typeof p === "string") return unmodeled(`git config ${p}`, WRITE_SPELLING.config!);
			return checkConfig(p, args);
		}
	}

	const t = table(sub);
	if (!t) return unmodeled(`git ${sub}, a git command the gate does not model`, "one of the modeled git commands (reads such as status, log, diff, show; writes such as add, commit, fetch, pull, rebase <ref>, merge, checkout <branch>, switch, restore --staged, stash, push)");
	const spelling = WRITE_SPELLING[sub] ?? `\`git ${sub}\` with its ordinary options`;
	const p = parse(t, args);
	if (typeof p === "string") return unmodeled(`git ${sub} ${p}`, spelling);

	const program = firstOf(p, RUNS_PROGRAM[sub] ?? {});
	if (program) return unmodeled(RUNS_PROGRAM[sub]![program]!, spelling);
	const res = firstOf(p, RESERVED_OPTS[sub] ?? {});
	if (res) return reserved(RESERVED_OPTS[sub]![res]!);
	const unm = firstOf(p, UNMODELED_OPTS[sub] ?? {});
	if (unm) return unmodeled(UNMODELED_OPTS[sub]![unm]!, spelling);
	const strategy = p.opts.find((o) => o.key === "strategy");
	if (strategy && !BUILTIN_STRATEGY.test(strategy.value ?? "")) return unmodeled(`git ${sub} -s ${strategy.value}, a merge strategy git does not ship (it runs git-merge-${strategy.value} from PATH)`, spelling);

	switch (sub) {
		case "reset":
			return null;
		case "clean":
			if (has(p, "interactive")) return reserved("git clean -i (removes untracked files)");
			return has(p, "dry-run") && !has(p, "force") ? null : reserved("git clean (removes untracked files; force in any position or spelling, or clean.requireForce off)");
		case "restore":
			return has(p, "staged") && !has(p, "worktree") ? null : reserved("git restore of the work tree (discards working changes)");
		case "checkout": {
			if (p.dashdash || p.after.length > 0) return reserved("git checkout -- <path> (discards working changes)");
			const creates = has(p, "-b", "orphan");
			if (p.operands.length > 1) return reserved("git checkout <commit> <path> (discards working changes)");
			const target = p.operands[0];
			if (!creates && target !== undefined) {
				if (!g.dir) return unmodeled("git checkout in a directory the gate cannot resolve", spelling);
				if (isWorkTreePath(g.dir, target)) return reserved(`git checkout ${target} (a path: discards working changes)`);
			}
			return null;
		}
		case "rebase":
			// History rewrites on a lane's own branch are ordinary; an interactive one runs an editor over
			// a todo list the gate cannot read (--exec is refused above as a program).
			if (has(p, "interactive", "edit-todo")) return unmodeled("git rebase -i (an interactive history rewrite through an editor)", spelling);
			return null;
		case "push":
			return checkPush(p);
	}
	return null;
}

/** Does a path, spelled any way (`.GIT`, `.Git` on a case-insensitive file system), fall inside a `.git` directory? */
export function insideDotGit(path: string): boolean {
	return path.split(/[/\\]+/).some((part) => part.toLowerCase() === ".git");
}

