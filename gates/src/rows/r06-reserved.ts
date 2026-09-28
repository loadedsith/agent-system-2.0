// P-11 row 6 (DESIGN-2.0.md:343; SPEC-2.0.md:224-242 § A4): the reserved actions are refused from
// any 2.0 agent — force-push, hard reset, branch or tag deletion, `rm -rf`, DROP/TRUNCATE,
// production database writes, infrastructure teardown, secret rotation, push to a protected branch,
// deploy. Build requirements on the gate: browser writes, and shell reached through `eval`.
// Patterns ported from the 1.x `careful-guard.mjs` DENY/ASK tables (newdle plugin 0.2.172).
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";
import { GH, GIT, normalizeCommand, parsePush, segments, segmentsWithDir, tokens } from "../shell";
import { type CallContext, PROTECTED_BRANCH, type Refusal, type ToolCall } from "../types";
import { currentBranch } from "./r09-protected-edit";

interface Rule {
	re: RegExp;
	why: string;
}

const PROTECTED = "(?<![\\w-])(main|master|production|prod|release)(?![\\w-])";

/** Matched per segment against the raw text: quote-blind by design (careful-guard.mjs:33-42). */
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
	// production database writes: a database client pointed at something named prod/production
	{ re: /\b(psql|mysql|mongosh|mongo|redis-cli|pg_restore|pg_dump\s[^\n]*--clean)\b[^\n]*\b(prod|production)\b/i, why: "a database client against a production target" },
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

/** The reserved action a shell command text reaches, or null. Quote-blind; runs per segment. */
export function reservedInShell(cmd: string): string | null {
	const c = normalizeCommand(cmd);
	if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(c)) return "fork bomb";
	for (const seg of segments(c)) {
		if (isRecursiveForceRm(seg)) return "rm -rf (recursive force-delete)";
		for (const { re, why } of RULES) if (re.test(seg)) return why;
	}
	return null;
}

/** A bare push (`git push`, `git push origin`, `git push origin HEAD`) whose source is the current, protected branch. */
function barePushOfProtected(cmd: string, cwd: string): string | null {
	for (const { seg, dir } of segmentsWithDir(cmd, cwd)) {
		const p = parsePush(seg);
		if (!p || !p.refspecs.every((s) => s === "HEAD" || s === "@")) continue;
		const branch = currentBranch(p.dirs.reduce((d, x) => resolve(d, x), dir));
		if (branch && PROTECTED_BRANCH.test(branch)) return `push to a protected branch (current branch ${branch})`;
	}
	return null;
}

const SHELLS: Record<string, true> = { bash: true, sh: true, zsh: true, ksh: true, dash: true, ash: true };
const WRAPPERS: Record<string, true> = { command: true, sudo: true, env: true, exec: true, time: true, nohup: true };

/** Body of a script the command runs (`bash x.sh`, `./x.sh`, `source x.sh`), one level deep; null otherwise. */
function scriptBodies(cmd: string, cwd: string): { path: string; body: string }[] {
	const out: { path: string; body: string }[] = [];
	for (const { seg, dir } of segmentsWithDir(cmd, cwd)) {
		const toks = tokens(seg).filter((t, i, all) => !(i < all.length - 1 && /^[A-Za-z_]\w*=/.test(t)));
		while (toks.length && WRAPPERS[basename(toks[0]!)]) toks.shift();
		const head = toks[0];
		if (!head) continue;
		let candidate: string | undefined;
		if (SHELLS[basename(head)] || head === "source" || head === ".") candidate = toks.slice(1).find((t) => !t.startsWith("-"));
		else if (head.includes("/")) candidate = head;
		if (!candidate) continue;
		const path = isAbsolute(candidate) ? candidate : resolve(dir, candidate);
		try {
			if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size > 256 * 1024) continue;
			const body = readFileSync(path, "utf8");
			if (!body.includes("\0")) out.push({ path, body });
		} catch {
			// unreadable: the command line itself was still checked
		}
	}
	return out;
}

/** Browser actions that change state outside the machine (A4 build requirement: browser writes). */
const BROWSER_WRITE_ACTION = /^(click|dblclick|type|fill|fill_form|press|press_key|type_text|select|select_option|check|uncheck|upload|upload_file|drag|submit|handle_dialog|evaluate|evaluate_script|run)$/i;
/** Browser mutation helpers called from `eval` code (`tab.click(`, `page.fill(`, …). */
const EVAL_BROWSER_WRITE = /\b(?:tab|page|browser|el|element|locator)\s*\.\s*(click|dblclick|type|fill|press|check|uncheck|selectOption|setInputFiles|dragTo|submit|evaluate|run)\s*\(/;

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
		const why = reservedInShell(cmd) ?? barePushOfProtected(cmd, ctx.cwd);
		if (why) return refuse(why, `Command: ${cmd}`);
		for (const { path, body } of scriptBodies(cmd, typeof input.cwd === "string" ? resolve(ctx.cwd, input.cwd) : ctx.cwd)) {
			const inner = reservedInShell(body);
			if (inner) return refuse(inner, `The script ${path}, which this command runs, contains it. Command: ${cmd}`);
		}
		return null;
	}
	if (toolName === "eval") {
		// Shell inside eval reaches the gate as one opaque string (§ A4): match the whole code, quote-blind,
		// and again with argv lists joined (`['terraform', 'destroy']` → `terraform destroy`).
		const code = String(input.code ?? input.cell ?? "");
		const why = reservedInShell(code) ?? reservedInShell(code.replace(/["'`]\s*,\s*["'`]/g, " "));
		if (why) return refuse(why, "Reached through eval code; eval runs shell and subprocesses the bash gate would otherwise miss.");
		const bw = EVAL_BROWSER_WRITE.exec(code);
		if (bw) return refuse(`a browser write (${bw[1]})`, "Reached through eval's browser API.");
		return null;
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
