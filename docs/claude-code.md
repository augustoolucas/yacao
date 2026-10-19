# YACAO for Claude Code

**Status: experimental.** Generated from YACAO's canonical sources and usable
natively, but not fully validated on the host. The behavior described below is
the current design, not a tested contract.

## What the adapter is

A self-contained Claude Code plugin under
[`integrations/claude-code/`](../integrations/claude-code), generated from
YACAO's canonical sources ([`package.json`](../package.json),
[`agents/`](../agents), [`skills/`](../skills)):

- two agents: `yacao:orchestrator` (main) and `yacao:builder` (subagent);
- three skills: `yacao:planning`, `yacao:implementation`, `yacao:review`;
- guard handlers: [`hooks/hooks.json`](../integrations/claude-code/hooks/hooks.json)
  run one `PreToolUse` command
  (`node "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"`) for the tools
  `Bash|Read|Edit|Write|Skill`;
- the policy that hook reads,
  [`guardrails.json`](../integrations/claude-code/guardrails.json).

The bundle is designed to be self-contained: every path it references lives
inside the plugin root, and no symlinks, install hooks or network access are
involved.

**Plugin users need no build step.** The generated files are committed, so
loading the adapter runs no generator, npm install or repository dependency.
That is a property of the packaging.

### Requirements

- **Claude Code CLI**: documented target 2.1.301 on an interactive Linux
  terminal. The installed version must support `PreToolUse` command hooks as
  documented in
  [Hooks](https://code.claude.com/docs/en/hooks.md).
- **Node.js 22 or newer** on `PATH`, for two independent reasons:
  - the guard hook is a Node script that runs on every matched tool call, so
    the prerequisite applies even to plugin users who never build anything;
  - the generator/check scripts in this repository use Node 22 built-ins.
  If `node` is missing or broken, the hook cannot run and the enforcement
  described below does not happen.
- No third-party runtime dependencies: the bundle and the hook use Node
  built-ins only.

Windows, macOS, IDE and cloud clients, agent teams and non-interactive runs are
outside the current design.

## Local development

All commands run from the repository root:

```sh
npm run build:claude-code    # regenerate integrations/claude-code/ from the canonical sources
npm run check:claude-code    # verify the committed bundle without writing (10 files)
```

`--check` validates the 7 generated files, the 2 hand-authored hook files and
the root marketplace descriptor
([`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json)); it
reports drift or missing files and never rewrites them. Run it (or `npm test`)
after any change to the canonical sources.

To validate and load the updated bundle locally:

```sh
claude plugin validate ./integrations/claude-code
```

From an unrelated, disposable project, so the adapter cannot touch real work:

```sh
claude --plugin-dir /absolute/path/to/yacao/integrations/claude-code --agent yacao:orchestrator
```

- `--plugin-dir` loads the plugin for that session; no marketplace install is
  performed.
- `--agent yacao:orchestrator` starts the main conversation as the plugin's
  orchestrator agent explicitly.
- Without `--agent`, the manifest default (`settings.agent: orchestrator`) is
  documented to select the orchestrator **only when neither the user nor the
  CLI has selected another agent**. User settings and an explicit `--agent`
  override the plugin default. Enabling the plugin is not an unconditional
  takeover of the main conversation, and it never overwrites a user's
  configured default agent.

## Installing from the repository

**Available from v0.6.0.** The adapter is distributed through the Git
marketplace from v0.6.0 onward; a local checkout install remains available.

### Local

Session-scoped load (see above):

```sh
claude --plugin-dir /absolute/path/to/yacao/integrations/claude-code
```

Local marketplace install from a checkout:

```text
/plugin marketplace add /absolute/path/to/yacao
/plugin install yacao@yacao
```

The root marketplace registers exactly one plugin whose source is the local
`./integrations/claude-code` bundle, so a clone or checkout of this repository
is enough and no network publication is involved.

### Remote Git marketplace (release tag)

Install the plugin from the v0.6.1 release tag:

```text
/plugin marketplace add augustoolucas/yacao#v0.6.1
/plugin install yacao@yacao
```

The tag pins the marketplace content to that release; the unpinned form
(`/plugin marketplace add augustoolucas/yacao`) tracks the default branch
instead.

## Namespaces, paths and generated files

- Agents: `yacao:orchestrator`, `yacao:builder`.
- Skills: `yacao:planning`, `yacao:implementation`, `yacao:review`.
- Plan protocol paths are relative to the **session root**, not the target
  project root: for a project below it, use
  `.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use
  `.yacao/plans/plan-<slug>/` (plan overview, task contracts, ledger).
  The adapted planning skill adds this grouping instruction; permissions remain
  unchanged, including the Markdown-only `.yacao/plans/*.md` edit rule.
  The adapter uses `.yacao` instead of
  `.claude` to keep protocol artifacts out of Claude Code's protected
  configuration area. OpenCode paths (`.opencode/plans`) stay unchanged.
- **Generated files** (the 7 the generator writes): the plugin manifest
  `integrations/claude-code/.claude-plugin/plugin.json`, `guardrails.json`, the two agent files
  `integrations/claude-code/agents/orchestrator.md` and
  `integrations/claude-code/agents/builder.md`, and the three skill files
  `integrations/claude-code/skills/planning/SKILL.md`,
  `integrations/claude-code/skills/implementation/SKILL.md` and
  `integrations/claude-code/skills/review/SKILL.md`. These are outputs; never
  edit them by hand.
- **Hand-authored bundle files**: `hooks/hooks.json` and `hooks/guard.mjs`,
  shipped as-is; `--check` verifies they exist and stay within the bundle
  text rules.
- **Canonical sources**: `package.json`, `agents/*.json`,
  `agents/prompts/*.md`, `skills/yacao-*/SKILL.md`. Change these, then run
  `npm run build:claude-code`.

The plugin manifest version is derived from `package.json`. **Changing
canonical prompts, skills or the package version requires regenerating the
bundle and passing `npm run check:claude-code` before a release**, so the
committed bundle never drifts from the sources.

YACAO never edits a target repository's `.gitignore`, its Claude settings
files or its `CLAUDE.md` automatically. It writes its own `.yacao/plans`
artifacts and makes code changes through the builder; nothing else in the
target project is configured for you.

## Permissions and enforcement on Claude Code

The guard uses small `PreToolUse` handlers, not a port of OpenCode's permission
system. Documented differences that matter:

- **Exact agents only.** Rules apply only when the host identifies the caller
  as exactly `yacao:orchestrator` or `yacao:builder` (plugin-qualified
  `agent_type`). Other agents, bare names, `Explore` processes and unrelated
  plugins receive no decision from this hook and stay entirely under native
  permissions.
- **Tighten-only.** The hook emits `ask` or `deny`, never `allow`, and never
  rewrites tool input. It cannot grant anything beyond native or managed
  restrictions: user, project and managed rules still apply on top, and a host
  or organization policy that disables hooks or plugins overrides it.
- **Different evaluation model.** Claude Code evaluates native rules as deny,
  then ask, then allow (first match in that order), not OpenCode's ordered
  last-match-wins policy. Native settings do not universally relax a hook
  deny, and there is no YACAO mechanism to exempt one command from a broader
  native ask. The order shown in `guardrails.json` is YACAO's own evaluation
  order inside the hook, not a claim about Claude's native matching.
- **Enforcement can be reduced without notice to YACAO.** Disabled, blocked or
  broken hooks (user or managed settings), a missing or broken Node.js
  runtime, and hook startup failures all mean the YACAO rules do not run. The
  hook is a guardrail, not a sandbox.
- **No content or security isolation.** `Read`, `Edit` and `Write` paths are
  classified against the project root and checked against the role policy, but
  open shell access, `Grep`, `Glob` and `Explore` can still reach content the
  rules do not cover. Open shell access is a deliberate tradeoff, and `Explore`
  is not restricted to read-only behavior by this hook.
- **Partial Bash coverage.** The guard matches the raw command as one opaque
  string against anchored wildcards (last matching rule wins) and never parses,
  splits, rewrites or executes it. Compound commands (`a && b`, pipes, command
  substitutions) and shell indirection such as aliases, functions and scripts
  can therefore hide a guarded verb and escape the YACAO patterns - a known
  coverage gap, not a claim of safety. Native permissions and the user's own
  policy still govern on top: the hook never auto-approves, and nothing here
  promises that every commit is blocked or that native approval is automatic.
- **Native prompts remain.** When no YACAO rule matches, or the match is
  `allow`, the hook returns no decision and the native permission machinery
  still runs, including its own prompts. Falling through never means
  auto-approval.
- **Agent dispatch stays native.** The adapter emits no guardrail for the
  Agent tool: subagent selection is left to Claude Code's own permissions, so
  native helpers such as `claude-code-guide`, `statusline-setup` and `Plan`,
  the `general-purpose` agent, and user-defined agents remain available to both
  YACAO roles. The implementation skill still directs coding work to
  `yacao:builder`; that is workflow guidance, not hook enforcement.
- **Policy highlights** (generated into `guardrails.json`, offline-tested):
  orchestrator edits/writes are denied except `.yacao/plans` Markdown; builder
  reads of `.yacao/plans` are denied; builder YACAO skill use is denied;
  recognized `git commit` commands are denied for the builder and ask for the
  orchestrator, as do push and mutating Git forms; `.env` reads ask;
  `command git*` and `env git*` are denied. These are patterns, not a shell
  parser (see the bullet above).
- Permission modes, managed policy and external-directory access are native
  host concerns; the adapter neither translates nor overrides them.

## Workflow bindings

The mechanics live in the shipped skills - read them rather than relying on a
summary here: `skills/planning/SKILL.md`, `skills/implementation/SKILL.md` and
`skills/review/SKILL.md` (under `integrations/claude-code/`).

Host-specific bindings those skills rely on:

- **Custom dispatch, never a fork.** The orchestrator dispatches the explicit
  agent type `yacao:builder` with the Agent tool. A fork inherits the main
  conversation; the explicitly selected custom builder starts with fresh
  context and receives only the narrow, self-contained task contract - never
  the full plan.
- **Real agent IDs.** The skills require recording the **actual** agent ID
  returned by the dispatch; references are never fabricated, and `Explore`
  runs return no resumable ID.
- **Continuation.** Corrections and follow-ups continue the same builder via
  `SendMessage` targeted at the recorded agent ID. Tool availability is
  mode-dependent; `SubagentHandback` may be involved in report delivery under
  some modes (see the official
  [subagent documentation](https://code.claude.com/docs/en/sub-agents)).
- **Asynchronous completion.** A dispatch may complete asynchronously under
  current defaults; the orchestrator waits for the actual completion before
  reviewing or advancing.
- **No commits by default.** Approved work stays uncommitted; per-task commits
  or a single final-only commit happen only on explicit request, with the
  refusal handling described in the review skill.
- **Sequential review.** Each task is reviewed before the next begins, and the
  builder's answer to one task never substitutes for review.

Models and tools: the builder declares `model: inherit`, so it uses the model
context selected by the host and the user; the adapter pins no provider or
model and translates no temperature. The orchestrator keeps the host and user
model selection as well. Both agents inherit the tools the session offers,
including the MCP servers and native tools the user configured; the adapter
pins no tool roster and does not restrict Agent dispatch, which remains under
Claude Code's native permissions. Plugin subagents do not support `hooks`,
`mcpServers` or `permissionMode` frontmatter, and the adapter does not use
them.
