# YACAO for Claude Code

YACAO for Claude Code is a plugin that brings the same workflow to
Claude Code: an orchestrator that plans and reviews, and a builder subagent that
implements. It ships two agents - `yacao:orchestrator` and `yacao:builder` -
three skills and a guard hook, generated from YACAO's canonical sources under
[`integrations/claude-code/`](../integrations/claude-code).

This guide targets Claude Code CLI 2.1.301 on an interactive Linux terminal.

## Requirements

- **Claude Code CLI** with support for `PreToolUse` command hooks, as documented
  in [Hooks](https://code.claude.com/docs/en/hooks.md).
- **Node.js 22 or newer** on `PATH`. The guard hook is a Node script that runs
  on every matched tool call; without a working `node`, the hook cannot run.
- No third-party runtime dependencies: the plugin and hook use Node built-ins
  only.

## Install

Install from the Git marketplace at the release tag:

```text
/plugin marketplace add augustoolucas/yacao#v0.7.0
/plugin install yacao@yacao
```

The tag pins the marketplace content to v0.7.0. The unpinned form
(`/plugin marketplace add augustoolucas/yacao`) follows the default branch
instead.

Then start a new Claude Code session from your project directory:

```sh
claude --agent yacao:orchestrator
```

Starting with `--agent` is the reliable way to begin as the orchestrator. The
plugin manifest sets `settings.agent: orchestrator`, which is documented to
select the orchestrator only when neither you nor the CLI has selected another
agent; your settings and an explicit `--agent` take precedence. Installing the
plugin never overwrites your configured default agent.

## Start and use

Open Claude Code in the project directory and make an ordinary request. No
commands, skill names or workflow ceremony are involved: the orchestrator
answers questions directly, and the skills load as the work needs them.

For a change request, the orchestrator asks clarifying questions until the goal
is well defined. Small changes go straight to the builder and come back for
review. Larger changes produce a written plan under `.yacao/plans/`, which you
approve before implementation starts.

The builder implements a planned change task by task, and each task is reviewed
before the next one begins. A task that needs fixes gets at most two adjustment
rounds before it comes back to you. Approved work stays uncommitted by default;
ask for a commit after an approved task, or for one commit at the end.

Plans live relative to the session root, not the target project root. For a
project below the session root, they go in
`.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise in
`.yacao/plans/plan-<slug>/`.

## Model choice

Both agents use the model you select (see
[Model configuration](https://code.claude.com/docs/en/model-config)). Pass it at
launch:

```sh
claude --agent yacao:orchestrator --model sonnet
```

or switch in the running session with `/model`. The builder declares
`model: inherit`, so it follows that same selection; YACAO does not provide a
separate builder-model setting, and editing installed plugin files or caches is
not a supported way to change it.

## Updating

Refreshing the marketplace and updating the installed plugin are separate steps:

```sh
claude plugin marketplace update yacao    # refresh the marketplace listing
claude plugin update yacao@yacao          # update the installed plugin
```

`marketplace update` re-reads the configured source (for Git, its configured
ref) and leaves installed plugins at their current versions. `plugin update`
updates the installed plugin from that refreshed listing. A new session loads
the updated plugin; `/reload-plugins` applies it in a running session.

A tag-pinned marketplace stays on its tag: neither command moves it to another
release. To follow a different release, change the `ref` in the configured
marketplace source first - see
[Extra known marketplaces](https://code.claude.com/docs/en/settings-reference#extraknownmarketplaces) -
then update. Sessions started with `--plugin-dir` use the local checkout and are
not affected by marketplace updates.

## Limitations and permissions

The hook applies only when the host identifies the caller as exactly
`yacao:orchestrator` or `yacao:builder`. Other agents, bare names, `Explore`
processes and unrelated plugins receive no decision from it and stay under
native permissions.

It is a guardrail, not a sandbox:

- The hook emits `ask` or `deny`, never `allow`, and cannot grant anything
  beyond native or managed restrictions. If hooks are disabled, blocked or
  broken - or Node.js is missing - the YACAO rules simply do not run.
- Native permission prompts remain. When no YACAO rule matches, or the match is
  `allow`, Claude Code's own permission machinery still runs; falling through
  never means auto-approval.
- Open shell access, `Grep`, `Glob` and `Explore` can reach content the rules do
  not cover. The Bash guard also matches the raw command as one opaque string
  and never parses it, so compound commands and shell indirection can hide a
  guarded verb - a known coverage gap.
- Policy highlights: orchestrator edits and writes are denied except
  `.yacao/plans` Markdown; builder reads of `.yacao/plans` are denied;
  recognized `git commit` commands are denied for the builder and ask for the
  orchestrator, as do push and mutating Git forms; `.env` reads ask;
  `command git*` and `env git*` are denied.
- Agent dispatch stays native. Both YACAO roles inherit the tools the session
  offers, including configured MCP servers and native helpers such as
  `claude-code-guide`, `Plan` and `general-purpose`.

Installation does not change your repository's `.gitignore`, Claude settings or
`CLAUDE.md`. YACAO writes its own `.yacao/plans` artifacts and the code changes
the builder makes; ask explicitly for any other repository change.

Windows, macOS, IDE and cloud clients, agent teams and non-interactive runs are
outside the current scope.

## Development

Load the committed bundle from a checkout for a single session:

```sh
claude --plugin-dir /absolute/path/to/yacao/integrations/claude-code --agent yacao:orchestrator
```

`--plugin-dir` performs no marketplace install. To install the checkout through
a local marketplace instead:

```text
/plugin marketplace add /absolute/path/to/yacao
/plugin install yacao@yacao
```

Validate and regenerate from the repository root:

```sh
claude plugin validate ./integrations/claude-code
npm run build:claude-code    # regenerate integrations/claude-code/ from the canonical sources
npm run check:claude-code    # verify the committed bundle without writing (10 files)
```

`--check` covers the 7 generated files, the 2 hand-authored hook files and the
root marketplace descriptor
([`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json)), and
reports drift or missing files without rewriting them.

### Sources and generated files

Canonical sources are `package.json`, `agents/*.json`, `agents/prompts/*.md` and
`skills/yacao-*/SKILL.md`. Change these, then run `npm run build:claude-code`.

The generator writes the plugin manifest, `guardrails.json`, the two agent files
and the three skill files. Do not edit those generated files by hand.
`hooks/hooks.json` and `hooks/guard.mjs` are hand-authored and shipped as-is.
The plugin manifest version is derived from `package.json`, so a release needs a
regenerated bundle and a passing `npm run check:claude-code`.

### Workflow bindings

The shipped skills own the detailed mechanics:
`skills/planning/SKILL.md`, `skills/implementation/SKILL.md` and
`skills/review/SKILL.md`.

- The orchestrator dispatches the explicit `yacao:builder` agent type, so the
  builder starts with fresh context and receives only its self-contained task
  contract - never the full plan.
- The orchestrator records the real agent ID returned by the dispatch and
  continues corrections through `SendMessage`; references are never fabricated,
  and `Explore` runs return no resumable ID.
- A dispatch may complete asynchronously; the orchestrator waits for the actual
  completion before reviewing or advancing.
- Plugin subagents do not support `hooks`, `mcpServers` or `permissionMode`
  frontmatter, and the plugin does not use them.
