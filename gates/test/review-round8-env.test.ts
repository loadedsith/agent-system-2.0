// M4 fix round 8 regression tests, environment and infrastructure hand: astra-8
// (review-astra-8/REVIEW.md) B1 (a later assignment erased an earlier command's interpreter
// environment), B2 (eval's shell and subprocess boundary skipped the interpreter-environment model)
// and B3 (ordinary global options hid reserved infrastructure verbs). Every PROBES.md string this
// hand owns (P01, P04, P06's two Bun.$ strings, P09, P10, P11, P13, P15, P16, P18, P20, P21) is here
// verbatim with its verdict after this round; class variants and positive controls follow per
// finding. Every probe is inert: the gate only reads the strings; nothing here runs node, kubectl
// or any other program, and ledger paths sit under /not-real or name reviewer scratch files the
// gate never opens.
import { describe, expect, test } from "bun:test";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { checkToolCall } from "../src/gates";
import { codeInterpreterEnv } from "../src/exec";
import { checkReserved, reservedAction } from "../src/rows/r06-reserved";
import { checkRawLedgerWrite } from "../src/rows/r10-raw-ledger";
import type { CallContext, Refusal } from "../src/types";
import { git, tmp } from "./helpers";

/** An inert repository on `topic` (so row 9 has no protected-branch reason of its own). */
const repo = realpathSync(tmp("round8-env-repo"));
git(repo, "init", "-q", "-b", "main");
git(repo, "commit", "-q", "--allow-empty", "-m", "one");
git(repo, "switch", "-q", "-c", "topic");
mkdirSync(join(repo, "sub"));

const ctx: CallContext = { role: "lane", cwd: repo, env: { HOME: "/nonexistent-home", AGENT_SYSTEM_LEDGER_DB: "/not-real/ledger.db" } };
/**
 * The reviewer's scratch directory. PROBES.md spelled it under Jo's home
 * (/Users/jowolff/agent-scratch/agent-system-2.0/migration/M4/review-astra-8); the probes' point is
 * the shape (the warning file configured as the ledger), so it lives in a directory this test owns
 * and holds for any uid, including the as2test runner's, which cannot lstat Jo's home (item 24, run
 * tr-0mv0ks648wy8d2q).
 */
const SCRATCH = join(realpathSync(tmp("round8-env-scratch")), "review-astra-8");
/** P04's configuration: the reviewer's warning file configured as the ledger. */
const p04Ctx: CallContext = { ...ctx, env: { ...ctx.env, AGENT_SYSTEM_LEDGER_DB: `${SCRATCH}/warning-proof.txt` } };
/** P16's configuration. */
const p16Ctx: CallContext = { ...ctx, env: { ...ctx.env, AGENT_SYSTEM_LEDGER_DB: `${SCRATCH}/eval-warning-proof.txt` } };
/** P18/P20's `file -C` configuration: the ledger is `magic.mgc` in the working directory. */
const mgcCtx: CallContext = { ...ctx, env: { ...ctx.env, AGENT_SYSTEM_LEDGER_DB: join(repo, "magic.mgc") } };

type V = "ALLOW" | "REFUSE";
const verdict = (r: Refusal): V => (r === null ? "ALLOW" : "REFUSE");
const bash = (command: string, c: CallContext = ctx, env?: Record<string, unknown>): V => verdict(checkToolCall({ toolName: "bash", input: env ? { command, env } : { command } }, c));

// PLAN wl-muzs0ytnaet1v4 D1: eval code that starts a process is refused outright for the bash tool
// (never reserved), so the eval rows below that start one expect that refusal. The environment and
// infrastructure analysis they proved keeps its coverage through inline interpreter code: the same
// code runs as `bun -e '…'` / `python3 -c '…'` through the bash branch, with the verdict and reason
// the eval tool had before.
const D1_REASON = "eval code that starts a process";
/** The code as inline interpreter code in one bash command: single-quoted, each `'` written `'\''`. */
const inline = (language: "js" | "py", code: string): string => `${language === "js" ? "bun -e" : "python3 -c"} '${code.replace(/'/g, "'\\''")}'`;
/** The eval refused by row 6 as a process started from eval: blocked, the bash-tool text, no reserved action. */
function expectD1(language: "js" | "py", code: string, c: CallContext = ctx): void {
	expect(verdict(checkToolCall({ toolName: "eval", input: { language, code } }, c))).toBe("REFUSE");
	const r = checkReserved({ toolName: "eval", input: { language, code } }, c);
	expect(r?.reason).toContain(D1_REASON);
	expect(reservedAction(r)).toBeNull();
}
/** Eval rows below whose code starts no process: their eval verdict is unchanged. */
const STARTS_NO_PROCESS: Record<string, true> = {
	'import {Database} from "bun:sqlite"; const mem=new Database(":memory:"); const C=mem.constructor; new C("/not-real/ledger.db");': true,
	'import {Database as D} from "bun:sqlite"; const mem=new D(":memory:"); D.open("/not-real/ledger.db");': true,
	'import {Database} from "bun:sqlite"; export const mem=new Database(":memory:");': true,
	"const o = {NODE_OPTIONS: '--require=/not-real/r.js'}; console.log(o);": true,
};
/**
 * One eval row: code that starts no process keeps its eval verdict; code that starts one is refused
 * as D1, and the same code as inline interpreter code keeps the row's verdict.
 */
function expectEvalRow(language: "js" | "py", code: string, v: V, c: CallContext = ctx): void {
	if (STARTS_NO_PROCESS[code]) {
		expect(verdict(checkToolCall({ toolName: "eval", input: { language, code } }, c))).toBe(v);
		return;
	}
	expectD1(language, code, c);
	expect(bash(inline(language, code), c)).toBe(v);
}

/** [probe section or "variant", finding, command, verdict now, context]. */
const BASH_PROBES: [string, string, string, V, CallContext?][] = [
	["P01", "B1", "NODE_OPTIONS=--require=/not-real/runner.js node -e 0; NODE_OPTIONS=--no-warnings node -e 0", "REFUSE"],
	["P01", "B1", `NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 'process.emitWarning("a")'; NODE_REDIRECT_WARNINGS=/not-real/warnings.log node -e 0`, "REFUSE"],
	["P01", "B3", "kubectl --context production delete deployment app", "REFUSE"],
	["P01", "B3", "terraform -chdir=infrastructure destroy -auto-approve", "REFUSE"],
	// Node itself rejects this spelling (P03, exit 9): not reported as a gate bug, stays refused.
	["P01", "control", `NODE_OPTIONS="--max-old-space-size 4096" node -e 0`, "REFUSE"],
	["P01", "control", "git help status", "ALLOW"],
	["P01", "control", "git status --help", "ALLOW"],
	["P01", "control", "git help --man status", "REFUSE"],
	["P01", "control", "git archive --format=custom HEAD", "REFUSE"],
	["P01", "control", "git hash-object --path=foo foo", "ALLOW"],
	[
		"P04",
		"B1",
		`NODE_REDIRECT_WARNINGS=${SCRATCH}/warning-proof.txt node -e 'process.emitWarning("ROUND8_FIRST_PROCESS")'; NODE_REDIRECT_WARNINGS=${SCRATCH}/unused-warnings.txt node -e 0`,
		"REFUSE",
		p04Ctx,
	],
	["P09", "B3", "kubectl --context production delete deployment app", "REFUSE"],
	["P09", "B3", "kubectl --context production apply -f deployment.yaml", "REFUSE"],
	["P09", "B3", "docker --context production volume rm database", "REFUSE"],
	["P09", "B3", "aws --region us-east-1 secretsmanager rotate-secret --secret-id app", "REFUSE"],
	["P09", "B3", "gcloud --project production run deploy app", "REFUSE"],
	["P09", "control", "git checkout --orphan temp --no-orphan .", "REFUSE"],
	["P09", "control", "git checkout --no-orphan --orphan temp .", "ALLOW"],
	["P09", "control", "file -C -m /not-real/ledger.db", "ALLOW"],
	["P09", "control", "file --mime-type /not-real/ledger.db", "ALLOW"],
	["P09", "control", "file --exclude-quiet=compress /not-real/ledger.db", "ALLOW"],
	// P10 ran this against the real CLI to show kubectl accepts the global-option position; the gate refuses the string as `kubectl delete`.
	["P10", "B3", "kubectl --context production delete --help", "REFUSE"],
	["P18", "control", "git checkout --orphan tmp --no-orphan .", "REFUSE"],
	["P18", "control", "git checkout --no-orphan --orphan tmp .", "ALLOW"],
	["P18", "control", "git log --format=%G?", "REFUSE"],
	["P18", "control", "git verify-commit HEAD", "REFUSE"],
	["P18", "control", "git ls-remote ext::runner", "REFUSE"],
	["P18", "control", "git archive --format=custom HEAD", "REFUSE"],
	["P18", "control", "git help status", "ALLOW"],
	["P18", "control", "git status --help", "ALLOW"],
	["P18", "control", "git help -a", "ALLOW"],
	["P18", "control", "git help --web status", "REFUSE"],
	["P18", "control", "git hash-object --path=foo foo", "ALLOW"],
	["P18", "control", "NODE_OPTIONS=--require=/not-real/runner.js node -e 0", "REFUSE"],
	["P18", "control", "NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0", "REFUSE"],
	["P18", "control", "export NODE_OPTIONS=--require=/not-real/runner.js; export NODE_OPTIONS; node -e 0", "REFUSE"],
	["P18", "control", "PYTHONPATH=. python3 -m pytest", "ALLOW"],
	["P18", "control", "sort --output=/not-real/ledger.db /dev/null", "REFUSE"],
	["P18", "control", "file -C -m /not-real/ledger.db", "ALLOW"],
	["P18", "control", "file --mime-type /not-real/ledger.db", "ALLOW"],
	["P18", "control", "file --exclude-quiet=compress /not-real/ledger.db", "ALLOW"],
	["P18", "control", "file -C -m magic", "REFUSE", mgcCtx],
	["P20", "control", `NODE_OPTIONS="--redirect-warnings=/not-real/ledger.db" node -e 'process.emitWarning("x")'`, "REFUSE"],
	["P20", "control", `env NODE_OPTIONS=--redirect-warnings=/not-real/ledger.db node -e 'process.emitWarning("x")'`, "REFUSE"],
	["P20", "control", `NODE_OPTIONS="--import=data:text/javascript,console.log(%22R7_PRELOAD%22)" node -e 0`, "REFUSE"],
	["P20", "control", "git archive --format=review HEAD", "REFUSE"],
	["P20", "control", "file -C -m magic", "REFUSE", mgcCtx],
	["P20", "control", "file --compile --magic-file magic", "REFUSE", mgcCtx],
	["P21", "B3", "kubectl delete deployment app", "REFUSE"],
	["P21", "control", "kubectl --context production get pods", "ALLOW"],
	["P21", "B3", "kubectl --context production delete deployment app", "REFUSE"],
	["P21", "B3", "kubectl --context production apply -f deployment.yaml", "REFUSE"],
];

const EVAL_PROBES: [string, string, string, V, CallContext?][] = [
	["P06", "B2", "await Bun.$`NODE_OPTIONS=--require=/not-real/runner.js node -e 0`;", "REFUSE"],
	["P06", "B2", "await Bun.$`NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0`;", "REFUSE"],
	// P11's unquoted form fails Bun's own shell parse (P12, exit 1); the gate refuses it anyway.
	["P11", "B2", "await Bun.$`NODE_OPTIONS=--import=data:text/javascript,console.log(%22ROUND8_PRELOAD%22) node -e 0`;", "REFUSE"],
	["P13", "B2", 'await Bun.$`NODE_OPTIONS="--import=data:text/javascript,console.log(%22ROUND8_PRELOAD%22)" node -e 0`;', "REFUSE"],
	["P16", "B2", `await Bun.$\`NODE_REDIRECT_WARNINGS=${SCRATCH}/eval-warning-proof.txt node -e 'process.emitWarning("ROUND8_EVAL_WARNING")'\`;`, "REFUSE", p16Ctx],
	["P18", "control", 'import {Database} from "bun:sqlite"; const mem=new Database(":memory:"); const C=mem.constructor; new C("/not-real/ledger.db");', "REFUSE"],
	["P18", "control", 'import {Database as D} from "bun:sqlite"; const mem=new D(":memory:"); D.open("/not-real/ledger.db");', "REFUSE"],
	["P18", "control", 'import {Database} from "bun:sqlite"; export const mem=new Database(":memory:");', "ALLOW"],
];

/** B1: every occurrence of an assignment is judged, in every assignment form and both orders. */
const B1: [string, V][] = [
	["NODE_OPTIONS=--no-warnings node -e 0; NODE_OPTIONS=--require=/not-real/runner.js node -e 0", "REFUSE"],
	["NODE_REDIRECT_WARNINGS=/not-real/warnings.log node -e 0; NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0", "REFUSE"],
	["NODE_OPTIONS=--redirect-warnings=/not-real/ledger.db node -e 0 && NODE_OPTIONS=--no-warnings node -e 0", "REFUSE"],
	["env NODE_OPTIONS=--require=/not-real/runner.js node -e 0; env NODE_OPTIONS=--no-warnings node -e 0", "REFUSE"],
	["NODE_OPTIONS=--require=/not-real/runner.js; node -e 0; NODE_OPTIONS=--no-warnings; node -e 0", "REFUSE"],
	["export NODE_OPTIONS=--require=/not-real/runner.js; node -e 0; export NODE_OPTIONS=--no-warnings; node -e 0", "REFUSE"],
	["NODE_OPTIONS=--require=/not-real/runner.js; export NODE_OPTIONS; node -e 0; NODE_OPTIONS=--no-warnings", "REFUSE"],
	["export NODE_REDIRECT_WARNINGS=/not-real/ledger.db; node -e 0; export NODE_REDIRECT_WARNINGS=/not-real/w.log", "REFUSE"],
	["PERL5OPT=-MFoo perl -e 0; PERL5OPT=-w perl -e 0", "REFUSE"],
	["PYTHONPATH=/not-real python3 x.py; PYTHONPATH=. python3 x.py", "REFUSE"],
	// The same loss for git's environment: an earlier pager or trace file survives a later benign value.
	["GIT_PAGER=sh git log; GIT_PAGER=cat git log", "REFUSE"],
	["GIT_TRACE=/not-real/ledger.db git status; GIT_TRACE=0 git status", "REFUSE"],
	// Controls: every occurrence modeled.
	["NODE_OPTIONS=--no-warnings node -e 0; NODE_OPTIONS=--trace-warnings node -e 0", "ALLOW"],
	["NODE_REDIRECT_WARNINGS=/not-real/a.log node -e 0; NODE_REDIRECT_WARNINGS=/not-real/b.log node -e 0", "ALLOW"],
	["export NODE_OPTIONS=--no-warnings; node -e 0; export NODE_OPTIONS=--enable-source-maps; node -e 0", "ALLOW"],
	["PYTHONPATH=. python3 -m pytest; PYTHONPATH=sub python3 -m pytest", "ALLOW"],
	["GIT_PAGER=cat git log; GIT_PAGER=less git log", "ALLOW"],
];

/** B2: eval's subprocesses get the same environment model as bash, whatever API starts them. */
const B2_JS: [string, V][] = [
	["await Bun.$`NODE_OPTIONS=--redirect-warnings=/not-real/ledger.db node -e 0`;", "REFUSE"],
	["await Bun.$`env NODE_OPTIONS=--require=/not-real/runner.js node -e 0`;", "REFUSE"],
	["await Bun.$`PERL5OPT=-MFoo perl -e 0`;", "REFUSE"],
	["await Bun.$`LD_PRELOAD=/not-real/x.so ls`;", "REFUSE"],
	["await Bun.$`NODE_OPTIONS=--no-warnings node -e 0; NODE_OPTIONS=--require=/not-real/r.js node -e 0`;", "REFUSE"],
	["await Bun.$`node -e 0`.env({NODE_OPTIONS: '--require=/not-real/r.js'});", "REFUSE"],
	["await Bun.$`node -e 0`.env({...process.env, NODE_REDIRECT_WARNINGS: '/not-real/ledger.db'});", "REFUSE"],
	["import {spawnSync} from 'node:child_process'; spawnSync('node', ['-e', '0'], {env: {NODE_OPTIONS: '--require=/not-real/r.js'}});", "REFUSE"],
	["import {spawnSync} from 'node:child_process'; spawnSync('node', ['-e', '0'], {env: {'NODE_OPTIONS': '--redirect-warnings=/not-real/ledger.db'}});", "REFUSE"],
	["import {execSync} from 'node:child_process'; execSync('NODE_OPTIONS=--require=/not-real/r.js node -e 0');", "REFUSE"],
	["import {execSync} from 'node:child_process'; execSync('node -e 0', {env: {NODE_OPTIONS: opts}});", "REFUSE"],
	["process.env.NODE_OPTIONS = '--require=/not-real/r.js'; await Bun.$`node -e 0`;", "REFUSE"],
	["process.env['NODE_REDIRECT_WARNINGS'] = '/not-real/ledger.db'; await Bun.$`node -e 0`;", "REFUSE"],
	// Controls: modeled settings, and an environment name in code that starts no process.
	["await Bun.$`NODE_OPTIONS=--no-warnings node -e 0`;", "ALLOW"],
	["await Bun.$`NODE_REDIRECT_WARNINGS=/not-real/warnings.log node -e 0`;", "ALLOW"],
	["await Bun.$`node -e 0`.env({NODE_OPTIONS: '--no-warnings'});", "ALLOW"],
	// Unchanged since 4ebbb85: a spawn call carrying an object argument is refused as arguments the gate cannot read.
	["import {spawnSync} from 'node:child_process'; spawnSync('node', ['-e', '0'], {env: {NODE_ENV: 'test'}});", "REFUSE"],
	["await Bun.$`ls`;", "ALLOW"],
	["const o = {NODE_OPTIONS: '--require=/not-real/r.js'}; console.log(o);", "ALLOW"],
];

const B2_PY: [string, V][] = [
	["import subprocess\nsubprocess.run(['node', '-e', '0'], env={'NODE_OPTIONS': '--require=/not-real/r.js'})", "REFUSE"],
	["import subprocess, os\nsubprocess.run(['node', '-e', '0'], env=dict(os.environ, NODE_REDIRECT_WARNINGS='/not-real/ledger.db'))", "REFUSE"],
	["import subprocess, os\nos.environ['PYTHONSTARTUP'] = '/not-real/s.py'\nsubprocess.run(['python3', '-c', '0'])", "REFUSE"],
	["import subprocess, os\nos.putenv('LD_PRELOAD', '/not-real/x.so')\nsubprocess.run(['ls'])", "REFUSE"],
	["import subprocess\nsubprocess.run('NODE_OPTIONS=--require=/not-real/r.js node -e 0', shell=True)", "REFUSE"],
	// Unchanged since 4ebbb85: a run(…) call with an env= argument is refused as arguments the gate cannot read.
	["import subprocess\nsubprocess.run(['node', '-e', '0'], env={'NODE_OPTIONS': '--no-warnings'})", "REFUSE"],
	// Controls.
	["import subprocess\nsubprocess.run(['ls'])", "ALLOW"],
];

/**
 * astra-9 R1: an environment value counts only where code binds it to an environment-setting
 * construct, and never inside a comment. Each kept construct has a refusal control (preload value)
 * beside a modeled twin that is allowed, so the refusal is the value's, not the construct's.
 */
const R1_JS: [string, V][] = [
	// The two ordinary programs astra-9 found refused at 34e744b (allowed at 4ebbb85).
	['// NODE_OPTIONS="--require=ts-node/register";\nawait Bun.$`node -e 0`;', "ALLOW"],
	['const defaults = {NODE_OPTIONS: "--require=ts-node/register"};\nconsole.log(defaults);\nawait Bun.$`node -e 0`;', "ALLOW"],
	// The second layer astra-9 did not see (the environment reason fired first): since round 8 made
	// Bun.$ a process start, every string in the program was read as a command. Only the tagged
	// templates are commands now; any string elsewhere is data.
	['const x = "--require=ts-node/register";\nawait Bun.$`node -e 0`;', "ALLOW"],
	['const p = "src/foo.ts";\nawait Bun.$`ls`;', "ALLOW"],
	['console.log("--require=ts-node/register");\nawait Bun.$`ls`;', "ALLOW"],
	// Neither a block comment, a plain identifier, nor an unrelated object sets anything.
	['/* process.env.NODE_OPTIONS = "--require=ts-node/register"; */\nawait Bun.$`node -e 0`;', "ALLOW"],
	['let NODE_OPTIONS = "--require=ts-node/register";\nconsole.log(NODE_OPTIONS);\nawait Bun.$`node -e 0`;', "ALLOW"],
	['console.log({NODE_OPTIONS: "--require=ts-node/register"});\nawait Bun.$`node -e 0`;', "ALLOW"],
	// process.env.X = and process.env["X"] =
	["process.env.NODE_OPTIONS = '--require=/not-real/r.js'; await Bun.$`node -e 0`;", "REFUSE"],
	["process.env['NODE_OPTIONS'] = '--require=/not-real/r.js'; await Bun.$`node -e 0`;", "REFUSE"],
	["process.env.NODE_OPTIONS = '--no-warnings'; await Bun.$`node -e 0`;", "ALLOW"],
	// Bun.env is process.env.
	["Bun.env.NODE_OPTIONS = '--require=/not-real/r.js'; await Bun.$`node -e 0`;", "REFUSE"],
	["Bun.env.NODE_OPTIONS = '--no-warnings'; await Bun.$`node -e 0`;", "ALLOW"],
	// Object.assign(process.env, {…}) and a replaced process.env.
	["Object.assign(process.env, {NODE_OPTIONS: '--require=/not-real/r.js'}); await Bun.$`node -e 0`;", "REFUSE"],
	["Object.assign(process.env, {NODE_OPTIONS: '--no-warnings'}); await Bun.$`node -e 0`;", "ALLOW"],
	["process.env = {...process.env, NODE_OPTIONS: '--require=/not-real/r.js'}; await Bun.$`node -e 0`;", "REFUSE"],
	// .env({…}) on a Bun shell, inline and through a named or spread object.
	["await Bun.$`node -e 0`.env({NODE_OPTIONS: '--require=/not-real/r.js'});", "REFUSE"],
	["const e = {NODE_OPTIONS: '--require=/not-real/r.js'}; await Bun.$`node -e 0`.env(e);", "REFUSE"],
	["const e = {NODE_OPTIONS: '--no-warnings'}; await Bun.$`node -e 0`.env(e);", "ALLOW"],
	["const base = {NODE_OPTIONS: '--require=/not-real/r.js'}; await Bun.$`node -e 0`.env({...base, NODE_ENV: 'test'});", "REFUSE"],
	["const e = {}; e.NODE_OPTIONS = '--require=/not-real/r.js'; await Bun.$`node -e 0`.env(e);", "REFUSE"],
	// env: option objects passed to spawn calls, and a variable named env.
	["import {spawnSync} from 'node:child_process'; spawnSync('node', ['-e', '0'], {env: {NODE_OPTIONS: '--require=/not-real/r.js'}});", "REFUSE"],
	["const env = {NODE_OPTIONS: '--require=/not-real/r.js'}; await Bun.$`node -e 0`.env(env);", "REFUSE"],
	// Shell-prefix assignments inside a Bun.$ or execSync string.
	["await Bun.$`NODE_OPTIONS=--require=/not-real/r.js node -e 0`;", "REFUSE"],
	["import {execSync} from 'node:child_process'; execSync('NODE_OPTIONS=--require=/not-real/r.js node -e 0');", "REFUSE"],
];

const R1_PY: [string, V][] = [
	// A comment sets nothing.
	["import subprocess\n# os.environ['NODE_OPTIONS'] = '--require=ts-node/register'\nsubprocess.run(['ls'])", "ALLOW"],
	// os.environ[…] =, os.environ.update, os.environ.setdefault, os.putenv.
	["import subprocess, os\nos.environ['NODE_OPTIONS'] = '--require=/not-real/r.js'\nsubprocess.run(['ls'])", "REFUSE"],
	["import subprocess, os\nos.environ['NODE_OPTIONS'] = '--no-warnings'\nsubprocess.run(['ls'])", "ALLOW"],
	["import subprocess, os\nos.environ.update({'NODE_OPTIONS': '--require=/not-real/r.js'})\nsubprocess.run(['ls'])", "REFUSE"],
	["import subprocess, os\nos.environ.update(NODE_OPTIONS='--require=/not-real/r.js')\nsubprocess.run(['ls'])", "REFUSE"],
	["import subprocess, os\nos.environ.update(NODE_OPTIONS='--no-warnings')\nsubprocess.run(['ls'])", "ALLOW"],
	["import subprocess, os\ne = {'NODE_OPTIONS': '--require=/not-real/r.js'}\nos.environ.update(e)\nsubprocess.run(['ls'])", "REFUSE"],
	["import subprocess, os\nos.environ.setdefault('NODE_OPTIONS', '--require=/not-real/r.js')\nsubprocess.run(['ls'])", "REFUSE"],
	["import subprocess, os\nos.environ.setdefault('NODE_OPTIONS', '--no-warnings')\nsubprocess.run(['ls'])", "ALLOW"],
	["import subprocess, os\nos.putenv('NODE_OPTIONS', '--require=/not-real/r.js')\nsubprocess.run(['ls'])", "REFUSE"],
	// env= keyword objects (refused already as unreadable run(…) arguments; the reason is checked below).
	["import subprocess\nsubprocess.run(['node', '-e', '0'], env={'NODE_OPTIONS': '--require=/not-real/r.js'})", "REFUSE"],
];

/** B3: reserved verbs past each CLI's global options; read verbs through the same prefix; unknown options refused. */
const B3: [string, V][] = [
	["kubectl --context=production delete deployment app", "REFUSE"],
	["kubectl -n prod delete pod x", "REFUSE"],
	["kubectl -nprod delete pod x", "REFUSE"],
	["kubectl -n=prod delete pod x", "REFUSE"],
	["kubectl --namespace prod --kubeconfig /not-real/k scale deploy/app --replicas=0", "REFUSE"],
	["kubectl --kubeconfig=/not-real/k drain node1", "REFUSE"],
	["kubectl --context production cordon node1", "REFUSE"],
	["kubectl --context production rollout restart deploy/app", "REFUSE"],
	["kubectl rollout --context production undo deploy/app", "REFUSE"],
	["kubectl -v 6 --insecure-skip-tls-verify delete ns x", "REFUSE"],
	["kubectl --insecure-skip-tls-verify=true apply -f x.yaml", "REFUSE"],
	["doctl --context prod compute droplet delete web", "REFUSE"],
	["doctl -t tok apps create-deployment abc", "REFUSE"],
	["terraform -chdir=infra apply", "REFUSE"],
	["tofu -chdir=infra destroy", "REFUSE"],
	["helm --kube-context prod uninstall app", "REFUSE"],
	["helm -n prod upgrade app ./chart", "REFUSE"],
	["helm --namespace=prod install app ./chart", "REFUSE"],
	["aws --profile prod --region us-east-1 ec2 terminate-instances --instance-ids i-1", "REFUSE"],
	["aws --profile prod secretsmanager --region us-east-1 put-secret-value --secret-id s", "REFUSE"],
	["gcloud --project prod functions deploy fn", "REFUSE"],
	["gcloud --project=prod secrets versions add s --data-file=x", "REFUSE"],
	["gcloud run --project prod deploy app", "REFUSE"],
	["docker -c prod volume rm db", "REFUSE"],
	// Unknown global options: the verb after them cannot be found.
	["kubectl --frobnicate x get pods", "REFUSE"],
	["terraform -chdir infra plan", "REFUSE"],
	["helm --no-such-flag list", "REFUSE"],
	["docker --frob ps", "REFUSE"],
	["kubectl --context $CTX get pods", "REFUSE"],
	// Read verbs through the same prefix.
	["kubectl --context production get pods", "ALLOW"],
	["kubectl -n kube-system describe pod x", "ALLOW"],
	["kubectl --context=production logs deploy/app", "ALLOW"],
	["kubectl --context production rollout status deploy/app", "ALLOW"],
	["kubectl -nkube-system get pods", "ALLOW"],
	["terraform -chdir=infra plan", "ALLOW"],
	["tofu -chdir=infra plan", "ALLOW"],
	["helm --kube-context prod -n x list", "ALLOW"],
	["helm -n x status app", "ALLOW"],
	["doctl --context prod compute droplet list", "ALLOW"],
	["aws --profile prod --region us-east-1 s3 ls", "ALLOW"],
	["gcloud --project prod compute instances list", "ALLOW"],
	["docker --context prod ps", "ALLOW"],
];

describe("astra-8 probes owned by the environment hand, verbatim", () => {
	for (const [section, finding, command, v, c] of BASH_PROBES) {
		test(`${section} ${finding}: ${command} → ${v}`, () => {
			expect(bash(command, c ?? ctx)).toBe(v);
		});
	}
	for (const [section, finding, code, v, c] of EVAL_PROBES) {
		test(`${section} ${finding} (eval, and inline when it starts a process): ${code} → ${v}`, () => expectEvalRow("js", code, v, c ?? ctx));
	}
	test("P15: the bash tool's own env input is judged as an assignment every command reaches", () => {
		expect(bash("node -e 0", ctx, { NODE_OPTIONS: "--require=/not-real/runner.js" })).toBe("REFUSE");
		expect(bash("node -e 0", ctx, { NODE_REDIRECT_WARNINGS: "/not-real/ledger.db" })).toBe("REFUSE");
		expect(bash("node -e 0", ctx, { NODE_OPTIONS: 7 })).toBe("REFUSE");
		expect(bash("node -e 0", ctx, { NODE_OPTIONS: "--no-warnings", NODE_ENV: "test" })).toBe("ALLOW");
	});
});

describe("astra-8 B1: each assignment occurrence keeps its effect", () => {
	for (const [command, v] of B1) {
		test(`${command} → ${v}`, () => {
			expect(bash(command)).toBe(v);
		});
	}
	test("row 10 names the earlier warnings file; row 6 names the earlier preload", () => {
		const sink = "NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0; NODE_REDIRECT_WARNINGS=/not-real/w.log node -e 0";
		expect(checkRawLedgerWrite({ toolName: "bash", input: { command: sink } }, ctx)?.reason).toContain("told by its environment to write the ledger file (/not-real/ledger.db)");
		const preload = "NODE_OPTIONS=--require=/not-real/runner.js node -e 0; NODE_OPTIONS=--no-warnings node -e 0";
		expect(checkReserved({ toolName: "bash", input: { command: preload } }, ctx)?.reason).toContain("NODE_OPTIONS loading `--require=/not-real/runner.js`");
	});
});

describe("astra-8 B2: eval subprocess environment, parity with bash", () => {
	for (const [code, v] of B2_JS) {
		test(`js (eval, and inline when it starts a process): ${code} → ${v}`, () => expectEvalRow("js", code, v));
	}
	for (const [code, v] of B2_PY) {
		test(`py (eval, and inline when it starts a process): ${JSON.stringify(code)} → ${v}`, () => expectEvalRow("py", code, v));
	}
	test("row 10 alone refuses the eval warnings sink as an environment write", () => {
		const code = "await Bun.$`NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0`;";
		expect(checkRawLedgerWrite({ toolName: "eval", input: { language: "js", code } }, ctx)?.reason).toContain("told by its environment to write the ledger file");
	});
	test("row 6 alone refuses an inline preload, naming the variable; the eval is a process started from eval", () => {
		const code = "import {spawnSync} from 'node:child_process'; spawnSync('node', ['-e', '0'], {env: {NODE_OPTIONS: '--require=/not-real/r.js'}});";
		expectD1("js", code);
		expect(checkReserved({ toolName: "bash", input: { command: inline("js", code) } }, ctx)?.reason).toContain("NODE_OPTIONS loading `--require=/not-real/r.js`");
	});
	test("an inline warnings file inside .git is refused by row 6; the eval is a process started from eval", () => {
		const code = `await Bun.$\`NODE_REDIRECT_WARNINGS=${repo}/.git/hooks/pre-commit node -e 0\`;`;
		expectD1("js", code);
		expect(checkReserved({ toolName: "bash", input: { command: inline("js", code) } }, ctx)?.reason).toContain("write inside a .git directory");
	});
	test("inline interpreter code run from bash gets the same check", () => {
		expect(bash(`bun -e 'await Bun.$\`NODE_REDIRECT_WARNINGS=/not-real/ledger.db node -e 0\`'`)).toBe("REFUSE");
	});
});

describe("astra-9 R1: environment values bound to environment-setting constructs, comments excluded", () => {
	for (const [language, table] of [["js", R1_JS], ["py", R1_PY]] as const) {
		for (const [code, v] of table) {
			test(`${language} (eval, and inline): ${JSON.stringify(code)} → ${v}`, () => {
				expectEvalRow(language, code, v);
				// A refusal is row 6's environment reason, not some other row's.
				if (v === "REFUSE") expect(checkReserved({ toolName: "bash", input: { command: inline(language, code) } }, ctx)?.reason).toContain("NODE_OPTIONS loading `--require=/not-real/r.js`");
			});
		}
	}
	// Bun.$ bodies are still commands in inline code: one the gate cannot read, or one that interpolates,
	// stays refused (a respelling since PLAN wl-muzs0ytnaet1v4 D2). From eval, each is a process started from eval.
	test("a tagged template the gate cannot read is refused as blind", () => {
		const code = "await Bun.$`/not-real/tool.sh`;";
		expectD1("js", code);
		expect(checkReserved({ toolName: "bash", input: { command: inline("js", code) } }, ctx)?.reason).toContain("a command the gate cannot read to the end");
	});
	test("an interpolated tagged template is refused", () => {
		const code = "const x = 'ls'; await Bun.$`${x}`;";
		expectD1("js", code);
		expect(checkReserved({ toolName: "bash", input: { command: inline("js", code) } }, ctx)?.reason).toContain("interpolating values the gate cannot read");
	});
	test("a string in code with a spawn API is still a command, outside comments", () => {
		const spawn = "import {execSync} from 'node:child_process';\nconst c = 'NODE_OPTIONS=--require=/not-real/r.js node -e 0';\nexecSync('ls');";
		expect(checkReserved({ toolName: "bash", input: { command: inline("js", spawn) } }, ctx)?.reason).toContain("NODE_OPTIONS loading `--require=/not-real/r.js`");
		// A comment is not a command: inline, the commented-out line sets nothing; from eval, the code starts a process.
		const commented = "import {execSync} from 'node:child_process';\n// execSync('NODE_OPTIONS=--require=/not-real/r.js node -e 0');\nexecSync('ls');";
		expect(bash(inline("js", commented))).toBe("ALLOW");
		expectD1("js", commented);
	});
	// Code with a spawn API reads every string as a possible command (unchanged since 4ebbb85), so
	// these programs stay refused on that ground; the environment pass no longer sets anything for them.
	test("python data and plain identifiers are not environment settings; their bound twins are", () => {
		const pairs: [string, string][] = [
			["defaults = {'NODE_OPTIONS': '--require=/not-real/r.js'}\nprint(defaults)", "os.environ.update({'NODE_OPTIONS': '--require=/not-real/r.js'})"],
			["NODE_OPTIONS = '--require=/not-real/r.js'", "os.environ['NODE_OPTIONS'] = '--require=/not-real/r.js'"],
		];
		for (const [data, bound] of pairs) {
			expect(codeInterpreterEnv(`import subprocess, os\n${data}\nsubprocess.run(['ls'])`, "python", repo, {}).unmodeled).toBeNull();
			expect(codeInterpreterEnv(`import subprocess, os\n${bound}\nsubprocess.run(['ls'])`, "python", repo, {}).unmodeled).toContain("NODE_OPTIONS loading");
		}
	});
});

describe("astra-8 B3: reserved infrastructure verbs through global options", () => {
	for (const [command, v] of B3) {
		test(`${command} → ${v}`, () => {
			expect(bash(command)).toBe(v);
		});
	}
	test("an unknown global option is refused as unmodeled, naming the option", () => {
		expect(checkReserved({ toolName: "bash", input: { command: "kubectl --frobnicate x get pods" } }, ctx)?.reason).toContain("the global option `--frobnicate` before its subcommand");
	});
	test("inline code reaches the same model; from eval, each is a process started from eval", () => {
		const del = "await Bun.$`kubectl --context production delete deployment app`;";
		const get = "await Bun.$`kubectl --context production get pods`;";
		expect(bash(inline("js", del))).toBe("REFUSE");
		// A read-only infra verb is not reserved.
		expect(bash(inline("js", get))).toBe("ALLOW");
		expectD1("js", del);
		expectD1("js", get);
	});
});
