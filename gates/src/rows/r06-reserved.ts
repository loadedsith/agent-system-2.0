// P-11 row 6 (DESIGN-2.0.md:343; SPEC-2.0.md:224-242 § A4): the reserved actions are refused from
// any 2.0 agent — force-push, hard reset, branch or tag deletion, `rm -rf`, DROP/TRUNCATE,
// production database writes, infrastructure teardown, secret rotation, push to a protected branch,
// deploy. Build requirements on the gate: browser writes, and shell reached through `eval`.
// Patterns ported from the 1.x `careful-guard.mjs` DENY/ASK tables (newdle plugin 0.2.172).
//
// Two passes over a shell command, and a refusal from either wins. The raw pass matches the rules
// against the command text, quote-blind as 1.x was, except `echo`/`printf` segments whose output
// nothing runs. The parsed pass (astra review B1) matches them
// against what the shell would actually run — quotes removed, variables expanded, wrappers
// stripped, and every command reached through `sh -c`, `eval`, heredocs, pipes into a shell,
// `xargs`, `find -exec` and scripts (src/exec.ts) — and refuses what it cannot see.
import { basename, resolve } from "node:path";
import { BROWSER_WRITE_CALL, codeFacts, opaqueSpawn, SCRIPT_SPAWN_API, SPAWN_API } from "../eval-code";
import { type CodeFamily, type Exec, execText, expandShell, gitCall, gitUnmodeled, interpreterFamily, OUTPUT_ONLY, SHELLS, writeDestinations } from "../exec";
import { gitModel, insideDotGit } from "../git-model";
import { parseShell, type Word } from "../shell-parse";
import { type CallContext, PROTECTED_BRANCH, type Refusal, type ToolCall } from "../types";
import { currentBranch } from "./r09-protected-edit";

interface Rule {
	re: RegExp;
	why: string;
}

/** `gh` plus any global flags up to the subcommand. */
const GH = String.raw`\bgh(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*\s+`;

/**
 * Matched per segment of the raw text (quote-blind, careful-guard.mjs:33-42) and per parsed command.
 * git is not here: its reserved forms come from the positive model over the parsed words
 * (src/git-model.ts, M4 fix round 5), which reads options the way git does (`--har` is `--hard`)
 * instead of matching spellings.
 */
const RULES: Rule[] = [
	// destructive SQL
	{ re: /\bDROP\s+(DATABASE|SCHEMA|TABLE|INDEX|VIEW)\b/i, why: "destructive SQL (DROP)" },
	{ re: /\bTRUNCATE\s+TABLE\b/i, why: "destructive SQL (TRUNCATE)" },
	{ re: /\bTRUNCATE\s+["'`]?[A-Za-z_]\w*(\.[A-Za-z_]\w*)?["'`]?\s*(;|$)/i, why: "destructive SQL (TRUNCATE)" },
	// production database writes: a database client pointed at something named prod/production.
	// psql is judged on its parsed argv instead (checkProductionPsql): a single read-only query passes (astra review S3).
	{ re: /\b(mysql|mongosh|mongo|redis-cli|pg_restore|pg_dump\s[^\n]*--clean)\b[^\n]*\b(prod|production)\b/i, why: "a database client against a production target" },
	{ re: /\bsupabase\b[^\n]*\b(db\s+(reset|push)|delete)\b/i, why: "writes, resets or deletes a Supabase database" },
	// infrastructure teardown
	{ re: /\bdoctl\b[^\n]*\bdelete\b/i, why: "deletes a DigitalOcean resource" },
	{ re: /\bkubectl\s+delete\b/i, why: "kubectl delete" },
	{ re: /\b(terraform|tofu|pulumi)\s+destroy\b/i, why: "infrastructure teardown (destroy)" },
	{ re: /\baws\b[^\n]*\s(delete-[\w-]+|terminate-instances|rb|rm\s[^\n]*--recursive)\b/i, why: "deletes AWS resources" },
	{ re: /\bgcloud\b[^\n]*\sdelete\b/i, why: "deletes a Google Cloud resource" },
	{ re: /\b(flyctl|fly)\s+(apps\s+)?destroy\b/i, why: "destroys a Fly app" },
	{ re: /\bheroku\s+apps:destroy\b/i, why: "destroys a Heroku app" },
	{ re: /\bdocker\s+volume\s+rm\b/i, why: "removes a docker volume (data loss)" },
	{ re: new RegExp(`${GH}repo\\s+(delete|archive|rename)(?![\\w-])`, "i"), why: "gh repo delete/archive/rename" },
	{ re: /\bmkfs[.\w]*\b/i, why: "formats a filesystem" },
	{ re: /\bdd\b[^\n]*\bof=\/dev\//i, why: "dd onto a block device" },
	// secret rotation
	{ re: new RegExp(`${GH}secret\\s+(set|delete|remove)(?![\\w-])`, "i"), why: "sets or deletes a GitHub Actions secret" },
	{ re: new RegExp(`${GH}repo\\s+deploy-key\\s+(add|delete)(?![\\w-])`, "i"), why: "adds or deletes a deploy key" },
	{ re: /\baws\s+secretsmanager\s+(rotate-secret|put-secret-value|update-secret|delete-secret)\b/i, why: "rotates or rewrites an AWS secret" },
	{ re: /\bgcloud\s+secrets\s+(versions\s+(add|destroy|disable)|delete|update)\b/i, why: "rotates a Google Cloud secret" },
	{ re: /\bvault\s+(kv\s+(put|delete|destroy|patch)|write|delete)\b/i, why: "writes or deletes a Vault secret" },
	{ re: /\b(flyctl|fly|heroku|doctl)\b[^\n]*\bsecrets?\s*[:\s](set|unset|import|update|delete)\b/i, why: "rotates a platform secret" },
	{ re: /\b(vercel|netlify)\s+env\s+(add|rm|remove|pull\s+--force)\b/i, why: "rewrites a deploy environment secret" },
	// deploy (and publishing, which is a deploy of a package)
	{ re: /\bvercel\b[^\n]*(--prod\b|\bdeploy\b)/i, why: "deploy (vercel)" },
	{ re: /\bnetlify\s+deploy\b/i, why: "deploy (netlify)" },
	{ re: /\b(flyctl|fly)\s+deploy\b/i, why: "deploy (fly)" },
	{ re: /\bdoctl\s+apps\s+(create-deployment|update)\b/i, why: "deploy (DigitalOcean App Platform)" },
	{ re: /\b(wrangler)\s+(deploy|publish)\b/i, why: "deploy (wrangler)" },
	{ re: /\bfirebase\s+deploy\b/i, why: "deploy (firebase)" },
	{ re: /\b(serverless|sls|cdk|eb)\s+deploy\b/i, why: "deploy" },
	{ re: /\bgcloud\s+(app|run|functions)\s+deploy\b/i, why: "deploy (gcloud)" },
	{ re: /\bhelm\s+(install|upgrade|uninstall)\b/i, why: "deploy (helm)" },
	{ re: /\bkubectl\s+(apply|rollout\s+restart|set\s+image|scale)\b/i, why: "deploy (kubectl)" },
	{ re: /\b(terraform|tofu)\s+apply\b|\bpulumi\s+up\b/i, why: "infrastructure change (apply/up)" },
	{ re: /\bgit(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*\s+push\s+(heroku|dokku)\b/i, why: "deploy (git push to a deploy remote)" },
	{ re: /\b(npm|pnpm|yarn|bun)\s+publish\b/i, why: "publishes a package" },
	{ re: new RegExp(`${GH}workflow\\s+(run|enable|disable)(?![\\w-])`, "i"), why: "gh workflow run triggers a workflow (deploy path)" },
	{ re: new RegExp(`${GH}release\\s+(create|delete|edit)(?![\\w-])`, "i"), why: "gh release publishes or destroys a release" },
	{ re: new RegExp(`${GH}pr\\s+merge(?![\\w-])[^\\n]*--admin\\b`, "i"), why: "gh pr merge --admin bypasses branch protection" },
	{ re: new RegExp(`${GH}api\\b[^\\n]*(?:-X[=\\s]*|--method[=\\s]+)(POST|PUT|PATCH|DELETE)(?![\\w-])`, "i"), why: "gh api with a mutating method" },
];

/** GNU coreutils rm long options (`rm --help`): a unique prefix of one is that option, as getopt_long reads it. */
const RM_LONG = ["force", "interactive", "one-file-system", "no-preserve-root", "preserve-root", "recursive", "dir", "verbose", "help", "version"];
/** Short options across GNU rm and BSD rm (macOS rm(1): -d -f -i -I -P -R -r -v -W -x). */
const RM_SHORT = /^-[dfiIPRrvWx]+$/;
/**
 * Temp paths § A4 exempts from the rm -rf reservation: something under /tmp, $TMPDIR (macOS keeps it
 * under /var/folders) or their /private spellings, with no `..` climbing back out.
 */
const TEMP_PATH = /^(?:\/private)?\/tmp\/[^/]|^(?:\/private)?\/var\/folders\/[^/]|^"?\$\{?TMPDIR\}?"?\/[^/]/;

/** One rm argument: its text, and whether its value is unknown until it runs. */
export interface RmArg {
	text: string;
	unread: boolean;
	glob?: boolean;
}

/**
 * The rm model (M4 fix round 5): options only from rm's own lists, long ones resolved by GNU prefix
 * rules (`--recu` is `--recursive`), an unknown or ambiguous one refused as unmodeled; recursive plus
 * force on any path outside the temp directories is the § A4 reserved `rm -rf`.
 */
export function rmModel(args: RmArg[]): { reserved: boolean; why: string } | null {
	let r = false;
	let f = false;
	let dashdash = false;
	const operands: RmArg[] = [];
	for (const a of args) {
		if (a.unread && (a.text === "" || a.text.startsWith("-"))) return { reserved: true, why: "rm with an argument not known until it runs (it could be -rf)" };
		if (!a.unread && a.glob && globCouldBeRmFlag(a.text)) return { reserved: true, why: "rm with a glob that could expand to -rf" };
		if (dashdash || a.text === "-" || !a.text.startsWith("-")) {
			operands.push(a);
			continue;
		}
		if (a.text === "--") {
			dashdash = true;
			continue;
		}
		if (a.text.startsWith("--")) {
			const name = a.text.slice(2).split("=")[0]!;
			const hits = RM_LONG.filter((o) => o.startsWith(name));
			const opt = RM_LONG.includes(name) ? name : hits.length === 1 ? hits[0]! : null;
			if (!opt) return { reserved: false, why: hits.length > 1 ? `rm ${a.text}, an abbreviation rm reads as ambiguous (${hits.map((h) => `--${h}`).join(", ")})` : `rm ${a.text}, an option rm does not have` };
			if (opt === "recursive") r = true;
			if (opt === "force") f = true;
			continue;
		}
		if (!RM_SHORT.test(a.text)) return { reserved: false, why: `rm ${a.text}, an option rm does not have` };
		if (/[rR]/.test(a.text)) r = true;
		if (a.text.includes("f")) f = true;
	}
	if (!r || !f) return null;
	const outside = operands.find((o) => o.unread || !TEMP_PATH.test(o.text) || o.text.split("/").includes(".."));
	return outside ? { reserved: true, why: "rm -rf (recursive force-delete) of a path outside the temp directories" } : null;
}

/**
 * True when an `rm` in raw text is the reserved recursive force-delete (careful-guard.mjs
 * isRecursiveForceRm, now through rmModel). Surrounding quotes come off a word that is quoted
 * whole (`'-rf'`, `"/home/x"`); a word that only ends in a quote (`-rf"` in `rg "rm -rf" README.md`)
 * is the end of a quoted string, not a flag, and rmModel does not read it as one.
 */
export function isRecursiveForceRm(seg: string): boolean {
	for (const m of seg.matchAll(/\brm\b([^\n;|&]*)/g)) {
		const args = m[1]!
			.trim()
			.split(/\s+/)
			.filter(Boolean)
			.map((t) => ({ text: t.startsWith("-") ? t : t.replace(/^(['"])(.*)\1$/, "$2"), unread: /`|\$\(/.test(t) }));
		if (rmModel(args)?.reserved) return true;
	}
	return false;
}

/**
 * The reserved action a shell command text reaches, or null. Quote-blind; runs per `;`/`&`/`|`/newline
 * segment. `skipPrinters` passes segments that start with `echo`/`printf`: the caller has checked
 * their output reaches nothing that runs it (astra review round 2 false positive, `printf "git reset --hard\n"`).
 */
export function reservedInShell(cmd: string, skipPrinters = false): string | null {
	const c = cmd.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").trim();
	if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(c)) return "fork bomb";
	for (const seg of c.split(/[;&|\n]+/).map((s) => s.trim()).filter(Boolean)) {
		if (skipPrinters && /^(echo|printf)(\s|$)/.test(seg)) continue;
		if (isRecursiveForceRm(seg)) return "rm -rf (recursive force-delete)";
		for (const { re, why } of RULES) if (re.test(seg)) return why;
	}
	return null;
}

/**
 * True when every `echo`/`printf` in the command only prints: the command parses cleanly, has no pipe,
 * and no printer redirects its output into a file something could run later.
 */
function printersOnlyPrint(cmd: string, cwd: string, env: Record<string, string | undefined>): boolean {
	const p = parseShell(cmd, { cwd, env });
	if (p.failures.length > 0 || p.ops.some((o) => o.startsWith("|"))) return false;
	return p.commands.every((c) => {
		const head = c.words[0];
		if (!head || head.opaque || !OUTPUT_ONLY[basename(head.text)]) return true;
		return !c.redirects.some((r) => r.op.includes(">") && r.op !== ">&");
	});
}

/** git subcommands whose reserved spellings depend on their arguments. */
const GIT_ARG_SENSITIVE: Record<string, true> = { push: true, reset: true, clean: true, checkout: true, restore: true, branch: true, tag: true, "update-ref": true };
/** Commands whose reserved spellings sit in their first words (subcommand, target). */
const HEAD_SENSITIVE: Record<string, true> = {
	gh: true, psql: true, mysql: true, mongosh: true, mongo: true, "redis-cli": true, pg_restore: true, pg_dump: true, supabase: true,
	doctl: true, kubectl: true, terraform: true, tofu: true, pulumi: true, aws: true, gcloud: true, fly: true, flyctl: true, heroku: true,
	docker: true, vault: true, vercel: true, netlify: true, wrangler: true, firebase: true, serverless: true, sls: true, cdk: true, eb: true,
	helm: true, npm: true, pnpm: true, yarn: true, bun: true, dd: true,
};

/** SQL that only reads: one SELECT/SHOW/EXPLAIN/WITH/VALUES/TABLE statement with no writing keyword or side-effecting function. */
function readOnlySql(sql: string): boolean {
	const s = sql.trim().replace(/;\s*$/, "");
	if (!s || s.includes(";") || s.includes("\\")) return false;
	if (!/^(SELECT|SHOW|EXPLAIN|WITH|VALUES|TABLE)\b/i.test(s)) return false;
	if (/\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|COPY|CALL|DO|VACUUM|REINDEX|CLUSTER|LOCK|SET|RESET|COMMENT|SECURITY|REFRESH|IMPORT|NOTIFY|PREPARE|EXECUTE|DISCARD|INTO)\b/i.test(s)) return false;
	return !/\b(pg_\w+|nextval|setval|lo_\w+|dblink\w*|set_config)\s*\(/i.test(s);
}

/**
 * psql against a production target: refused unless it runs only `-c` queries that read (astra review
 * S3: the accepted rule is production database *writes*). A script (`-f`), stdin, or an interactive
 * session could write, so each is refused.
 */
function checkProductionPsql(e: Exec): string | null {
	const args = e.argv.slice(1);
	if (!args.some((w) => w.opaque || /\b(prod|production)\b/i.test(w.text))) return null;
	const refused = "a database client against a production target (psql runs only single read-only -c queries against production)";
	if (e.source.stdinFrom || e.redirects.some((r) => r.op.startsWith("<"))) return refused;
	const queries: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const w = args[i]!;
		if (w.opaque) return refused;
		const t = w.text;
		if (t === "-c" || t === "--command") {
			const q = args[++i];
			if (!q || q.opaque) return refused;
			queries.push(q.text);
		} else if (t.startsWith("--command=")) queries.push(t.slice("--command=".length));
		else if (/^-c./.test(t)) queries.push(t.slice(2));
		else if (t === "-f" || t === "--file" || t.startsWith("--file=") || /^-f./.test(t)) return refused;
	}
	return queries.length > 0 && queries.every(readOnlySql) ? null : refused;
}

/** rm flag words a glob could expand to that make an rm recursive or forced. */
const RM_FLAG_NAMES = ["-r", "-f", "-R", "-rf", "-fr", "-Rf", "-fR", "-rfv", "-vrf", "-rF", "--recursive", "--force"];

/** True when a glob could expand to an `rm` flag (`-[r]f`, `-?f`, a bare `*` over a file named `-rf`). */
function globCouldBeRmFlag(text: string): boolean {
	let re = "";
	for (let i = 0; i < text.length; i++) {
		const c = text[i]!;
		if (c === "*") re += ".*";
		else if (c === "?") re += ".";
		else if (c === "[") {
			const end = text.indexOf("]", i + 2);
			if (end < 0) re += "\\[";
			else {
				re += `[${text.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
				i = end;
			}
		} else re += c.replace(/[.+^${}()|\\\]]/g, "\\$&");
	}
	let pattern: RegExp;
	try {
		pattern = new RegExp(`^${re}$`);
	} catch {
		return true;
	}
	return RM_FLAG_NAMES.some((n) => pattern.test(n));
}

/** The reserved action one parsed command reaches, or null. */
function reservedInExec(e: Exec): string | null {
	const name = basename(e.argv[0]!.text);
	// A word the shell expands when it runs (a substitution or a glob): its value is not known here.
	const unread = (w: Word): boolean => w.opaque || w.glob === true;
	if (name === "rm") {
		const rm = rmModel(e.argv.slice(1).map((w) => ({ text: w.text, unread: w.opaque, glob: w.glob })));
		if (rm?.reserved) return rm.why;
	}
	if (name === "psql") {
		const why = checkProductionPsql(e);
		if (why) return why;
	}
	const git = gitCall(e);
	if (git) {
		if (git.sub === null) return "git with a subcommand not known until it runs";
		if (GIT_ARG_SENSITIVE[git.sub] && git.args.some(unread)) return `git ${git.sub} with an argument not known until it runs`;
		if (git.sub === "push" && git.dir === "") return "git push from a directory not known until it runs";
		const v = gitModel(git);
		if (v?.reserved) return v.why;
	} else if (HEAD_SENSITIVE[name] && e.argv.slice(1, 4).some(unread)) {
		return `${name} with a subcommand or target not known until it runs`;
	}
	// git's own files (refs, packed-refs, HEAD, config, hooks) under any case spelling: a write there
	// moves a ref or installs a program git runs later, past every git spelling (M4 fix round 5).
	for (const w of writeDestinations(e)) {
		if (insideDotGit(resolve(e.dir, w.text))) return "writing inside a .git directory (a ref move, or config and hooks git runs later)";
	}
	// A printer's arguments are text. What it feeds (a pipe, a file) the raw pass over the whole
	// command still reads, and a shell reading its output is expanded on its own (src/exec.ts).
	if (OUTPUT_ONLY[name]) return null;
	const text = execText(e).replace(/\n/g, " ");
	for (const { re, why } of RULES) if (re.test(text)) return why;
	return null;
}

/** A bare push (`git push`, `git push origin`, `git push origin HEAD`) whose source is the current, protected branch. */
function barePushOfProtected(e: Exec): string | null {
	const git = gitCall(e);
	if (!git || git.sub !== "push" || !git.dir) return null;
	const refspecs = git.args.filter((w) => !w.text.startsWith("-")).slice(1);
	if (!refspecs.every((s) => s.text === "HEAD" || s.text === "@")) return null;
	const branch = currentBranch(git.dir);
	return branch && PROTECTED_BRANCH.test(branch) ? `push to a protected branch (current branch ${branch})` : null;
}

/**
 * Commands that reach a reserved action or run other commands: their names are modeled only as
 * literal text. Provenance (M4 fix round 4, S7): hand-derived from this gate's own code, not from an
 * external list. It is the union of (1) the names a row reads specially: `rm` and `find` here, `git`
 * in exec.ts gitUnmodeled, `sqlite3` in r10-raw-ledger.ts, `mkfs` in RULES; (2) every key of
 * exec.ts WRAPPERS, which run their arguments as a command; (3) the names the expander follows into
 * other commands: `eval`, `source`, `.`, `xargs`, `find`. Shells and interpreters are covered by
 * SHELLS and interpreterFamily beside it. Refresh: whenever a name is added to one of those three
 * places, add it here. The expanded-name check that reads this set is a second line: an expanded
 * name is still unwrapped and matched on its resolved text (probe `$'stdbuf' -o0 rm -rf …` refused
 * as rm -rf, M4 fix round 4).
 */
const RUNNERS: Record<string, true> = {
	git: true, rm: true, eval: true, exec: true, source: true, ".": true, xargs: true, find: true, env: true, sudo: true, doas: true,
	command: true, builtin: true, sqlite3: true, mkfs: true, nohup: true, timeout: true, nice: true, time: true,
	stdbuf: true, caffeinate: true, ionice: true, chronic: true,
};
/** Dash look-alikes (hyphen, en/em dash, minus, fullwidth): an `rm` operand spelled with one is not what it looks like. */
const NON_ASCII_DASH = /^[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/;

/** Programs that run a command line in a second shell somewhere the gate does not read (a remote host, a pty recorder). */
const REMOTE_SHELLS: Record<string, true> = { ssh: true, rsh: true, slogin: true, mosh: true, script: true };
/** Database clients whose target the § A4 production rule reads from their arguments. */
const DB_CLIENTS: Record<string, true> = { psql: true, mysql: true, mariadb: true, mongosh: true, mongo: true, "redis-cli": true, pg_dump: true, pg_restore: true };
/**
 * Variables a database client reads its target from (libpq PGHOST and kin, the MySQL client's
 * MYSQL_HOST, and the DATABASE_URL/MONGODB_URI convention scripts pass as an argument): a target from
 * the environment is one the gate cannot see is production.
 */
const DB_TARGET_ENV = /^(?:PG(?:HOST|HOSTADDR|SERVICE|SERVICEFILE|DATABASE|PORT)|DATABASE_URL|MYSQL_(?:HOST|TCP_PORT|UNIX_PORT)|MONGODB_URI|REDISCLI_\w+)$/;
/** Of those, the ones the clients read from the process environment on their own. */
const DB_CLIENT_ENV = /^(?:PGHOST|PGHOSTADDR|PGSERVICE|MYSQL_HOST)$/;

/** The allowed spelling for any git form the positive model or gitUnmodeled refuses without a narrower one. */
const GIT_FORM_SPELLING =
	"the git command without it: literal words, one of git's own subcommands (no alias), `-C <literal path to an existing directory>` (never with `-c`), `-c` only for user.name, user.email, color.*, advice.*, core.quotepath, init.defaultBranch, commit.gpgsign, tag.gpgsign or gc.auto (never `alias.*`), and no GIT_* variables, --git-dir, --work-tree or --config-env";

/**
 * A form the gate does not model, one command at a time, with the literal spelling to use instead
 * (M4 fix round 3: the default inverts, Jo 2026-09-29). The command may be harmless; the gate
 * cannot tell, so it refuses and names what it can read.
 */
function unmodeledInExec(e: Exec, assigned: Map<string, Word>, env: Record<string, string | undefined>): { what: string; spelling: string } | null {
	const head = e.argv[0]!;
	const name = basename(head.text);
	if (/[^\x00-\x7f]/.test(head.text)) return { what: `the command name \`${head.text}\` has characters outside ASCII`, spelling: "the command name in plain ASCII" };
	if (head.expanded && (RUNNERS[name] || SHELLS[name] || HEAD_SENSITIVE[name] || interpreterFamily(name))) {
		return { what: `the command name \`${name}\` is spelled through an expansion (a variable, \`$'…'\`, braces or a substitution)`, spelling: `\`${name}\` typed out as literal text` };
	}
	// Wrapped forms are refused (§ A4 contract; M4 fix round 5, Plumb's call under Jo's "extend"):
	// sudo, doas, nice, nohup, timeout, time, exec, stdbuf, caffeinate, ionice, chronic, builtin, a
	// bare `env cmd`. Two spellings run nothing new and stay modeled: `env NAME=value… cmd` with only
	// assignments, judged as a `NAME=value cmd` prefix, and the `command -v`/`-V` lookup. xargs and
	// find -exec are judged on what they run.
	for (const w of e.mods.wrappers) {
		const [wrapper, ...flags] = w.split(" ");
		if (wrapper === "env" && flags.length === 0 && e.mods.assigns.length > 0) continue;
		if (wrapper === "command" && flags.some((f) => /^-[pvV]*[vV]/.test(f))) continue;
		if (wrapper === "xargs" || wrapper === "find") continue;
		return {
			what: `\`${w}\` wraps the command, and the gate refuses every wrapped form (it runs the command under another user, priority, time limit or environment)`,
			spelling: `the command without \`${wrapper}\`${wrapper === "env" ? " (`env NAME=value cmd` with only assignments is modeled)" : ""}`,
		};
	}
	if (e.argv[0]!.text === "function" || (!OUTPUT_ONLY[name] && e.argv.length > 1 && e.argv[1]!.text === "{" && !e.argv[1]!.expanded)) {
		return { what: "a shell function definition (its body runs later under the function's name, which the gate does not follow)", spelling: "the commands typed out where they run, without a function" };
	}
	if (SHELLS[name] && (e.argv.slice(1).some((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w.text)) || e.mods.wrappers.some((w) => /^(?:xargs|find)\b/.test(w)))) {
		return { what: `\`${name}\` started as a second shell to run a command line`, spelling: "the command line run directly with the bash tool" };
	}
	if (REMOTE_SHELLS[name]) return { what: `\`${name}\` runs a shell (on another host or under a recorder) the gate cannot read`, spelling: "the command run directly on this machine with the bash tool" };
	if (DB_CLIENTS[name]) {
		const fromEnv = [...assigned.keys()].find((n) => DB_TARGET_ENV.test(n)) ?? Object.keys(env).find((n) => DB_CLIENT_ENV.test(n) && env[n]);
		const target = `\`${name}\` with the host, port and database typed out as literal arguments`;
		if (fromEnv) return { what: `${name} with its target taken from ${fromEnv} in the environment, which the gate cannot resolve (it could be production)`, spelling: target };
		const w = e.argv.slice(1).find((a) => a.opaque || a.expanded);
		if (w) return { what: `${name} with an argument not typed out as literal text (\`${w.text || "…"}\`): its target or query is unresolved`, spelling: target };
	}
	const git = gitUnmodeled(e, assigned);
	if (git) return { what: `${git}: a git form the gate does not model`, spelling: GIT_FORM_SPELLING };
	const call = gitCall(e);
	const model = call ? gitModel(call) : null;
	if (model && !model.reserved) return { what: `${model.why}: a git form the gate does not model`, spelling: model.spelling ?? GIT_FORM_SPELLING };
	if (name === "rm") {
		if (e.argv.slice(1).some((w) => NON_ASCII_DASH.test(w.text))) return { what: "rm with an operand that starts with a dash look-alike outside ASCII", spelling: "rm with ASCII flags" };
		const rm = rmModel(e.argv.slice(1).map((w) => ({ text: w.text, unread: w.opaque, glob: w.glob })));
		if (rm && !rm.reserved) return { what: rm.why, spelling: "rm with its own options (-r, -R, -f, -i, -d, -v, or a whole or uniquely abbreviated --recursive, --force, --interactive, --dir, --verbose)" };
	}
	if (name === "find" && e.argv.some((w) => w.text === "-delete")) {
		return { what: "find -delete, a recursive delete the gate cannot bound", spelling: "`find … -print` to list the files, then `rm` on the listed paths (never `rm -rf`)" };
	}
	return null;
}

function refuseUnmodeled(u: { what: string; spelling: string }, detail: string): Refusal {
	return {
		block: true,
		reason:
			`P-11 row 6 refused this: ${u.what}. The gate refuses every form it does not model rather than guess whether it reaches a § A4 reserved action (SPEC-2.0.md:224-242). ` +
			`Spell it as ${u.spelling}. ${detail}`,
	};
}

/** Reserved actions in eval (or inline interpreter) code: its literal text, its literal argv lists, and what it spawns. */
function reservedInCode(code: string, family: CodeFamily | undefined, cwd: string, env: Record<string, string | undefined>): { why: string; detail: string; unmodeled?: { what: string; spelling: string } } | null {
	const facts = codeFacts(code);
	for (const t of [facts.folded, facts.folded.replace(/["'`]\s*,\s*["'`]/g, " "), ...facts.literals, ...facts.argvLists]) {
		const why = reservedInShell(t);
		if (why) return { why, detail: "Reached through eval code; eval runs shell and subprocesses the bash gate would otherwise miss." };
	}
	// Literal text that is shell, read the way the shell reads it (`Bun.$\`git "reset" --hard\``).
	// Where the code starts processes, a literal is a command it may run: an unmodeled form or a
	// command the gate cannot read to its end refuses (M4 fix round 3; a parse failure is left out,
	// since most literals are not shell at all).
	const spawns = SPAWN_API.test(facts.folded) || ((family === "perl" || family === "ruby") && SCRIPT_SPAWN_API.test(facts.folded));
	for (const t of [...facts.literals, ...facts.argvLists]) {
		const x = expandShell(t, cwd, env);
		for (const e of x.commands) {
			const why = reservedInExec(e);
			if (why) return { why, detail: `Reached through eval code (the string ${JSON.stringify(t.slice(0, 120))}).` };
			const u = spawns ? unmodeledInExec(e, x.assigned, env) : null;
			if (u) return { why: u.what, detail: `Reached through eval code (the string ${JSON.stringify(t.slice(0, 120))}).`, unmodeled: u };
		}
		const blind = spawns ? x.blind.find((b) => !b.startsWith("the command could not be parsed")) : undefined;
		if (blind) {
			return {
				why: "a process started from eval with a command the gate cannot read to the end",
				detail: `${blind} (the string ${JSON.stringify(t.slice(0, 120))}). Spell the command as literal text, or run it with the bash tool, so the gate can read it.`,
			};
		}
	}
	const spawn = opaqueSpawn(facts, family);
	if (spawn) {
		return {
			why: "a process started from eval with arguments the gate cannot read",
			detail: `The code has ${spawn}. Spell the command as literal text, or run it with the bash tool, so the gate can read it.`,
		};
	}
	const bw = BROWSER_WRITE_CALL.exec(code);
	if (bw) return { why: `a browser write (${bw[1]})`, detail: "Reached through eval's browser API." };
	return null;
}

/** Browser actions that change state outside the machine (A4 build requirement: browser writes). */
const BROWSER_WRITE_ACTION = /^(click|dblclick|type|fill|fill_form|press|press_key|type_text|select|select_option|check|uncheck|upload|upload_file|drag|submit|handle_dialog|evaluate|evaluate_script|run)$/i;

function refuse(why: string, detail: string): Refusal {
	return {
		block: true,
		reason:
			`P-11 row 6 refused this: ${why} is on the § A4 reserved list (SPEC-2.0.md:224-242), which no 2.0 agent runs. ` +
			`Do not reword, script or route around it. A hand reports what it would have run and why, and stops; ` +
			`the lane raises it to Jo as a P-7b reserved item. ${detail}`,
	};
}

/**
 * Whether a command defines a shell function (`f() { …; }`, `f () ( … )`, `function f { …; }`). The
 * parser reads a definition as an ordinary command named `f` (its body words become `f`'s
 * arguments), so a body would run later under a name the gate does not follow: refused (M4 fix
 * round 5, fable's function-body probe). Quoted text, comments and heredoc bodies are not definitions.
 */
export function definesFunction(cmd: string): boolean {
	const lines = cmd.replace(/\r\n?/g, "\n").split("\n");
	const kept: string[] = [];
	let delimiter: string | null = null;
	for (const line of lines) {
		if (delimiter !== null) {
			if (line.replace(/^\t+/, "") === delimiter) delimiter = null;
			continue;
		}
		kept.push(line);
		const h = /<<-?\s*(['"]?)([\w.-]+)\1/.exec(line);
		if (h) delimiter = h[2]!;
	}
	const bare = kept
		.join("\n")
		.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, "''")
		.replace(/(^|\s)#[^\n]*/g, "$1");
	return /(?:^|[;&|\n({}]|\b(?:then|do|else))\s*(?:function\s+[^\s;&|()<>]+|[^\s;&|()<>=$'"`]+\s*\(\s*\)\s*[{(]|[^\s;&|()<>=$'"`]+\s*\(\s*\)\s*$)/m.test(bare);
}

/** Row 6 over one tool call. */
export function checkReserved(call: ToolCall, ctx: CallContext): Refusal {
	const { toolName, input } = call;
	if (toolName === "bash") {
		const cmd = String(input.command ?? "");
		const cwd = typeof input.cwd === "string" ? resolve(ctx.cwd, input.cwd) : ctx.cwd;
		const raw = reservedInShell(cmd, printersOnlyPrint(cmd, cwd, ctx.env));
		if (raw) return refuse(raw, `Command: ${cmd}`);
		const x = expandShell(cmd, cwd, ctx.env);
		for (const e of x.commands) {
			const why = reservedInExec(e) ?? barePushOfProtected(e);
			if (why) return refuse(why, `Command: ${cmd}`);
		}
		if (definesFunction(cmd)) {
			return refuseUnmodeled({ what: "a shell function definition (its body runs later under the function's name, which the gate does not follow)", spelling: "the commands typed out where they run, without a function" }, `Command: ${cmd}`);
		}
		for (const e of x.commands) {
			const u = unmodeledInExec(e, x.assigned, ctx.env);
			if (u) return refuseUnmodeled(u, `Command: ${cmd}`);
		}
		for (const c of x.code) {
			const hit = reservedInCode(c.text, c.family, c.dir, ctx.env);
			if (hit) return hit.unmodeled ? refuseUnmodeled(hit.unmodeled, `${hit.detail} Command: ${cmd}`) : refuse(hit.why, `${hit.detail} Command: ${cmd}`);
		}
		if (x.blind.length > 0) {
			return refuse(
				"a command the gate cannot read to the end",
				`${x.blind[0]}. The gate refuses what it cannot see rather than pass it; spell the command out literally. Command: ${cmd}`,
			);
		}
		return null;
	}
	if (toolName === "eval") {
		// The eval tool runs JavaScript or Python; one spawn check covers both spellings.
		const hit = reservedInCode(String(input.code ?? input.cell ?? ""), undefined, ctx.cwd, ctx.env);
		if (!hit) return null;
		return hit.unmodeled ? refuseUnmodeled(hit.unmodeled, hit.detail) : refuse(hit.why, hit.detail);
	}
	if (toolName === "browser" || toolName.startsWith("mcp__chrome_devtools_") || toolName.startsWith("mcp__playwright")) {
		const action = String(input.action ?? toolName.replace(/^mcp__(chrome_devtools|playwright)_+/, ""));
		if (BROWSER_WRITE_ACTION.test(action)) return refuse(`a browser write (${action})`, `Tool: ${toolName}.`);
		return null;
	}
	if (toolName === "write" || toolName === "edit" || toolName === "ast_edit") {
		// git's own files (refs, HEAD, config, hooks) written directly skip every git spelling above.
		for (const p of [input.path, ...(Array.isArray(input.paths) ? input.paths : [])]) {
			if (typeof p === "string" && insideDotGit(resolve(ctx.cwd, p))) return refuse("writing inside a .git directory (a ref move, or config and hooks git runs later)", `Path: ${p}`);
		}
		return null;
	}
	return null;
}
