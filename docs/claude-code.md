# YACAO for Claude Code

Tested with Claude Code CLI 2.1.301 (Linux). Requires Node.js 22 or newer on
`PATH` (used by the guard hook).

## Install

Install from the Git marketplace:

```text
/plugin marketplace add augustoolucas/yacao
/plugin install yacao@yacao
```

Then start a session from your project directory:

```sh
claude --agent yacao:orchestrator
```

To make `yacao:orchestrator` the default without passing `--agent` each time, set
`"agent": "yacao:orchestrator"` in `~/.claude/settings.json` or
`.claude/settings.json`. Installing the plugin never changes your configured
default agent.

## Configuration

Both agents use the session model by default. Pass it at launch:

```sh
claude --agent yacao:orchestrator --model sonnet
```

or switch in the running session with `/model`. There is no separate
builder-model setting, though you can ask the orchestrator to use a different
model alias (such as `sonnet` or `haiku`) when calling `yacao:builder`.

## Updating

Refreshing the marketplace and updating the installed plugin are separate steps:

```sh
claude plugin marketplace update yacao    # refresh the marketplace listing
claude plugin update yacao@yacao          # update the installed plugin
```

`/reload-plugins` applies updates in a running session, or start a new session.

## Permissions and limits

- The hook enforces YACAO rules only for `yacao:orchestrator` and
  `yacao:builder`. Other agents and `Explore` stay under native permissions.
- It is a guardrail, not a sandbox: it emits `ask` or `deny` (never `allow`),
  native permission prompts still run, and if hooks are disabled or `node` is
  missing, the rules do not run.
- Shell access, `Grep`, `Glob`, and `Explore` can reach content outside file
  rules, and the Bash guard matches raw command strings without parsing compound
  commands or shell indirection.
- Policy summary:
  - Orchestrator edits are limited to `.yacao/plans` Markdown.
  - Builder reads and edits of `.yacao/plans`, YACAO skill calls, and `git commit`/`add`/`stage` are denied.
  - Orchestrator `git commit`, pushes, mutating Git commands, and `.env` reads ask.
  - `Agent` dispatch stays native with inherited session tools and MCPs.
- Windows, macOS, IDE and cloud clients, agent teams, and non-interactive runs
  are outside the current tested scope.
