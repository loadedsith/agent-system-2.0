# Plumb E — OMP_PROFILE isolation extent (settles the P-3 GUESS)

**CLAIM**
A named profile moves the whole OMP agent directory: with `OMP_PROFILE=<name>` (or `--profile`), the
agent dir is `~/.omp/profiles/<name>/agent` instead of `~/.omp/agent`
(`/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-utils/src/dirs.ts:117`, `:301`;
env read at `/Users/jowolff/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts:481`).
Everything OMP keeps under the agent dir — `config.yml`, `extensions/`, `agents/`, sessions — is
therefore per profile. A fresh profile starts with none of 1.x's six ambient extensions.

**CLAIM**
The `~/.claude` layer is a separate switch. `~/.claude` is a "foreign user source" that is opt-in
via the `enabledProviders` setting (`src/capability/index.ts:330-343`); `claude` enabled also
enables `claude-plugins` (`:340`); `CLAUDE_CONFIG_DIR` set in the env force-enables `claude`
(`:341`). `enabledProviders` is read from settings (`:370-374`; schema default empty,
`src/config/settings-schema.ts:448`) — and settings live in the profile's `config.yml`. So a
fresh profile with no `enabledProviders` loads nothing from `~/.claude` (no `CLAUDE.md`, no
plugin, no skills there), unless `CLAUDE_CONFIG_DIR` is set in the environment.

**CLAIM**
Project-level `.claude/` in the cwd is *not* gated by that switch — "Project-level (cwd) config is
unaffected" (`src/capability/index.ts:331`; `.claude/settings.json` candidates per project dir,
`src/discovery/helpers.ts:1105-1106`). A 2.0 lane checking out a repo that carries `.claude/`
would still load that repo's project-level files.

**Result for P-3**
Isolation is achievable and is two settings, not one: `OMP_PROFILE=<2.0 profile>` AND an empty
`enabledProviders` in that profile's config (and `CLAUDE_CONFIG_DIR` unset). Per-repo `.claude/`
directories are the one leak, by design; Phase 5 decides whether 2.0 repos keep them.

**GUESS (inference)**
Whether `~/.claude/plugins` marketplace hooks reach a profile through any path other than
`claude-plugins` — not traced; settle by grepping `claude-plugins` in `src/discovery/`.
