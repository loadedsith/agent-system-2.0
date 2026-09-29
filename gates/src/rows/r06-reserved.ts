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
import { BROWSER_WRITE_CALL, codeFacts, opaqueSpawn } from "../eval-code";
import { type CodeFamily, type Exec, execText, expandShell, gitCall, OUTPUT_ONLY } from "../exec";
import { parseShell, type Word } from "../shell-parse";
import { type CallContext, PROTECTED_BRANCH, type Refusal, type ToolCall } from "../types";
import { currentBranch } from "./r09-protected-edit";

interface Rule {
	re: RegExp;
	why: string;
}

/** `git` plus any global flags (`-C <dir>`, `-c k=v`, `--no-pager`) up to the subcommand. */
const GIT = String.raw`\bgit(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*\s+`;
/** `gh` plus any global flags up to the subcommand. */
const GH = String.raw`\bgh(?:\s+-{1,2}\S+(?:\s+[^\s-]\S*)?)*\s+`;

const PROTECTED = "(?<![\\w-])(main|master|production|prod|release)(?![\\w-])";

/** Matched per segment of the raw text (quote-blind, careful-guard.mjs:33-42) and per parsed command. */
const RULES: Rule[] = [
	// force-push (any spelling: --force, --force-with-lease, -f in a cluster, a +refspec)
	{ re: new RegExp(`${GIT}push\\b[^\\n]*(--force(?:-with-lease|-if-includes)?\\b|\\s-[A-Za-z]*f[A-Za-z]*(?![\\w-]))`, "i"), why: "force-push" },
	{ re: new RegExp(`${GIT}push\\b[^\\n]*\\s\\+[^\\s:]*(?::\\S+)?`, "i"), why: "force-push (+refspec)" },
	// hard reset and its siblings that discard uncommitted work (careful DENY 2026-08-10 batch)
	{ re: new RegExp(`${GIT}reset\\b[^\\n]*--hard\\b`, "i"), why: "git reset --hard" },
	{ re: new RegExp(`${GIT}clean\\s+-[A-Za-z]*f`, "i"), why: "git clean -f discards untracked files" },
	{ re: new RegExp(`${GIT}checkout\\s+(--\\s+\\.|\\.)\\s*$`, "i"), why: "git checkout -- . discards working changes" },
	// branch or tag deletion, local and remote
	{ re: new RegExp(`${GIT}branch\\b[^\\n]*\\s(-[A-Za-z]*[dD][A-Za-z]*|--delete)(?![\\w-])`), why: "branch deletion" },
	{ re: new RegExp(`${GIT}tag\\b[^\\n]*\\s(-[A-Za-z]*d[A-Za-z]*|--delete)(?![\\w-])`, "i"), why: "tag deletion" },
	{ re: new RegExp(`${GIT}push\\b[^\\n]*(--delete|\\s-[A-Za-z]*d[A-Za-z]*)(?![\\w-])`, "i"), why: "remote ref deletion (git push --delete / -d)" },
	{ re: new RegExp(`${GIT}push\\b[^\\n]*\\s:\\S+`, "i"), why: "remote ref deletion (git push :ref)" },
	{ re: new RegExp(`${GIT}update-ref\\b[^\\n]*\\s-d\\b`, "i"), why: "ref deletion (git update-ref -d)" },
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
	{ re: new RegExp(`${GIT}push\\s+(heroku|dokku)\\b`, "i"), why: "deploy (git push to a deploy remote)" },
	{ re: /\b(npm|pnpm|yarn|bun)\s+publish\b/i, why: "publishes a package" },
	{ re: new RegExp(`${GH}workflow\\s+(run|enable|disable)(?![\\w-])`, "i"), why: "gh workflow run triggers a workflow (deploy path)" },
	{ re: new RegExp(`${GH}release\\s+(create|delete|edit)(?![\\w-])`, "i"), why: "gh release publishes or destroys a release" },
	{ re: new RegExp(`${GH}pr\\s+merge(?![\\w-])[^\\n]*--admin\\b`, "i"), why: "gh pr merge --admin bypasses branch protection" },
	{ re: new RegExp(`${GH}api\\b[^\\n]*(?:-X[=\\s]*|--method[=\\s]+)(POST|PUT|PATCH|DELETE)(?![\\w-])`, "i"), why: "gh api with a mutating method" },
	// push to a protected branch, spelled in the refspec
	{ re: new RegExp(`${GIT}push\\b[^\\n]*\\s(?:\\S*:)?(?:refs/heads/)?${PROTECTED}(?:\\s|$)`, "i"), why: "push to a protected branch" },
];

/** True when an `rm` carries recursive and force flags in any spelling (careful-guard.mjs isRecursiveForceRm). */
export function isRecursiveForceRm(seg: string): boolean {
	const re = /\brm\b([^\n;|&]*)/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(seg))) {
		let r = false;
		let f = false;
		for (const tok of m[1]!.trim().split(/\s+/).filter(Boolean)) {
			if (tok === "--recursive") r = true;
			else if (tok === "--force") f = true;
			else if (/^-[A-Za-z]+$/.test(tok)) {
				if (/r/i.test(tok)) r = true;
				if (/f/.test(tok)) f = true;
			}
		}
		if (r && f) return true;
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

/** True when a glob word could expand to an `rm` flag (`-[r]f`, `-?f`, a bare `*` over a file named `-rf`). */
function globCouldBeRmFlag(w: Word): boolean {
	let re = "";
	for (let i = 0; i < w.text.length; i++) {
		const c = w.text[i]!;
		if (c === "*") re += ".*";
		else if (c === "?") re += ".";
		else if (c === "[") {
			const end = w.text.indexOf("]", i + 2);
			if (end < 0) re += "\\[";
			else {
				re += `[${w.text.slice(i + 1, end).replace(/^!/, "^").replace(/\\/g, "\\\\")}]`;
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
		let r = false;
		let f = false;
		for (const w of e.argv.slice(1)) {
			if (w.text === "--") break;
			if (w.glob) continue;
			if (w.text === "--recursive") r = true;
			else if (w.text === "--force") f = true;
			else if (/^-[A-Za-z]+$/.test(w.text)) {
				if (/r/i.test(w.text)) r = true;
				if (/f/.test(w.text)) f = true;
			}
		}
		if (r && f) return "rm -rf (recursive force-delete)";
		// A word with nothing known before its unknown part could be (or expand to) `-rf`.
		if (e.argv.slice(1).some((w) => w.opaque && (w.text === "" || w.text.startsWith("-")))) return "rm with an argument not known until it runs (it could be -rf)";
		if (e.argv.slice(1).some((w) => !w.opaque && w.glob && globCouldBeRmFlag(w))) return "rm with a glob that could expand to -rf";
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
	} else if (HEAD_SENSITIVE[name] && e.argv.slice(1, 4).some(unread)) {
		return `${name} with a subcommand or target not known until it runs`;
	}
	for (const r of e.redirects) {
		if (!r.op.includes(">") || !r.target) continue;
		const m = /(?:^|\/)\.git\/(?:refs\/heads\/(\S+)|packed-refs$|HEAD$)/.exec(r.target.text);
		if (m && (!m[1] || PROTECTED_BRANCH.test(m[1]))) return "moving a git ref by writing .git internals";
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

/** Reserved actions in eval (or inline interpreter) code: its literal text, its literal argv lists, and what it spawns. */
function reservedInCode(code: string, family: CodeFamily | undefined, cwd: string, env: Record<string, string | undefined>): { why: string; detail: string } | null {
	const facts = codeFacts(code);
	for (const t of [facts.folded, facts.folded.replace(/["'`]\s*,\s*["'`]/g, " "), ...facts.literals, ...facts.argvLists]) {
		const why = reservedInShell(t);
		if (why) return { why, detail: "Reached through eval code; eval runs shell and subprocesses the bash gate would otherwise miss." };
	}
	// Literal text that is shell, read the way the shell reads it (`Bun.$\`git "reset" --hard\``).
	for (const t of [...facts.literals, ...facts.argvLists]) {
		for (const e of expandShell(t, cwd, env).commands) {
			const why = reservedInExec(e);
			if (why) return { why, detail: `Reached through eval code (the string ${JSON.stringify(t.slice(0, 120))}).` };
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
		for (const c of x.code) {
			const hit = reservedInCode(c.text, c.family, c.dir, ctx.env);
			if (hit) return refuse(hit.why, `${hit.detail} Command: ${cmd}`);
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
		return hit ? refuse(hit.why, hit.detail) : null;
	}
	if (toolName === "browser" || toolName.startsWith("mcp__chrome_devtools_") || toolName.startsWith("mcp__playwright")) {
		const action = String(input.action ?? toolName.replace(/^mcp__(chrome_devtools|playwright)_+/, ""));
		if (BROWSER_WRITE_ACTION.test(action)) return refuse(`a browser write (${action})`, `Tool: ${toolName}.`);
		return null;
	}
	if (toolName === "write" || toolName === "edit") {
		// A ref moved by writing git's own files skips every git spelling above.
		for (const p of [input.path, ...(Array.isArray(input.paths) ? input.paths : [])]) {
			if (typeof p !== "string") continue;
			const m = /(?:^|\/)\.git\/(?:refs\/heads\/(\S+)|packed-refs$|HEAD$)/.exec(p);
			if (m && (!m[1] || PROTECTED_BRANCH.test(m[1]))) return refuse("moving a git ref by writing .git internals", `Path: ${p}`);
		}
		return null;
	}
	return null;
}
