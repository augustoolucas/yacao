<h1 align="center">YACAO - Yet Another Coding Agent Orchestrator</h1>

<p align="center">
  <strong>You already use Plan and Build. You probably review your changes too.</strong><br>
  YACAO just connects the dots, so you don't have to.
</p>

<p align="center">
  <a href="https://opencode.ai/"><img src="https://img.shields.io/badge/OpenCode-V1%20%7C%20V2-6d5dfc?style=flat-square&amp;logo=opencode&amp;logoColor=white" alt="OpenCode V1 | V2"></a>
  <a href="https://github.com/augustoolucas/yacao/releases/latest"><img src="https://img.shields.io/github/v/release/augustoolucas/yacao?style=flat-square&amp;label=YACAO" alt="YACAO version"></a>
  <a href="https://github.com/augustoolucas/yacao/blob/main/LICENSE"><img src="https://img.shields.io/github/license/augustoolucas/yacao?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/augustoolucas/yacao/stargazers"><img src="https://img.shields.io/github/stars/augustoolucas/yacao?style=flat-square" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="#what-is-yacao">What is YACAO?</a> ·
  <a href="#why-yacao">Why YACAO?</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#install">Install</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#development">Development</a> ·
  <a href="#license">License</a>
</p>

## What is YACAO?

YACAO is a truly minimal agent workflow for OpenCode: just 2 agents and 3 skills to handle all planning, building, and reviewing.

The main orchestrator agent handles code exploration, implementation planning, and review. Each workflow phase has specific guidance defined as skills, loaded on demand. Implementation is delegated to the builder agent.

The goal is to streamline the natural workflow of vanilla OpenCode, with little to no learning curve. There is no need to learn and memorize a bunch of commands, fancily named agents and skills. Work the same way you already do, just without tabbing.

YACAO is intended for small, incremental tasks built through iterative processes rather than single-shot solutions, although it can handle those too. It is not necessarily better, cheaper, or more effective than vanilla OpenCode; it is simply more practical.

## Why YACAO?

Most "slim" or "minimal" multi-agent frameworks for OpenCode still feel too bloated for my taste, packed with too many agents and commands and skills and whatever. So I decided to build my own version, and it has been working well for my use case so far.

I used to discuss ideas with the built-in Plan Agent, plan solutions, then manually switch to the Build Agent to implement it, and then ask the Plan Agent to review the output, which often led to further adjustments.

With YACAO, the workflow is fundamentally the same but feels much more natural: the orchestrator kicks off implementation once the idea is solid, reviews the result upon completion, and automatically instructs the builder to fix issues if needed.

## How it works

TL;DR: the orchestrator receives your prompt. Questions and discussions are answered directly after exploring if needed. For change requests, the orchestrator asks clarifying questions until the goal is well defined, then:

- small changes go straight to the builder and back for review;
- larger changes get a written plan you approve first, then the builder implements it, with review and fixes until it's right.
- by default the approved work stays uncommitted; you can ask for a commit after each approved task, or for a single commit at the end;
- each task is still reviewed before the next one starts, and a task that needs fixes gets at most two adjustment rounds before it comes back to you.

The three skills - `yacao-planning`, `yacao-implementation` and `yacao-review` - own the detailed mechanics behind this behavior.

## Install

### OpenCode V1

Requires OpenCode 1.18.29 or newer.

Add the plugin to your `opencode.jsonc`:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git"]
}
```

To be notified when a new release is available, enable the `autoUpdate` option:

```jsonc
{
  "plugin": [
    [
      "yacao@git+https://github.com/augustoolucas/yacao.git",
      {
        "autoUpdate": true
      }
    ]
  ]
}
```

Then restart OpenCode.

### OpenCode V2

Add the plugin:

```jsonc
{
  "plugins": ["yacao@git+https://github.com/augustoolucas/yacao.git"],
  "default_agent": "orchestrator"
}
```

Then restart OpenCode.

### Updating YACAO

OpenCode caches the installed plugin, so a plain restart alone re-fetches nothing.

On V1 the spec string is the cache key:

- with a pinned spec, point the tag at the new release;
- with an unpinned spec, remove only YACAO's cached package under `~/.cache/opencode/packages/` and restart - never clear the whole plugin cache.

On V2 use the native command:

```sh
opencode plugin update <configured-target>
```

Omit the target to update all outdated plugins.

This is the configured behavior from the installed CLI help and the versioned source; it has not been exercised end to end here.

### Claude Code (experimental, unvalidated)

[`integrations/claude-code/`](./integrations/claude-code) ships an experimental Claude Code adapter generated from the same canonical sources: two agents (`yacao:orchestrator`, `yacao:builder`), three skills and a guard hook. A user reported an actual native session (version/mode unknown), including blocked skill calls and a compound-command commit bypass on the old hook. Fixes need runtime re-testing; full validation, default-agent/user override, workflow and copied-bundle/local-marketplace checks remain pending.

Load the committed bundle from an unrelated disposable project (no build step; Node.js 22 or newer is required for the guard hook):

```sh
claude --plugin-dir /absolute/path/to/yacao/integrations/claude-code --agent yacao:orchestrator
```

Local installation is preferred for now. A remote install has to pin the `claude-code` branch ref (`augustoolucas/yacao#claude-code`) until the adapter is validated and released; the default branch and the current release do not contain it yet. Full guide, install options and the native acceptance checklist: [`docs/claude-code.md`](./docs/claude-code.md).

## Configuration

On V1 YACAO sets `orchestrator` as the default agent automatically **if no `default_agent` is already set**.

On V2 you need to set `"default_agent": "orchestrator"`.

### Setup builder model

Builder inherits the model set for the Orchestrator.

On V1, to set a different model, or override any other agent option, add it to `opencode.jsonc`:

```jsonc
{
  "agent": {
    "builder": {
      "model": "your-provider/your-model"
    }
  }
}
```

On V2, use the `agents` key:

```jsonc
{
  "agents": {
    "builder": {
      "model": "your-provider/your-model"
    }
  }
}
```

### Setup builder subagents

The builder can dispatch OpenCode's `explore` subagent to parallelize searches inside a task.

OpenCode limits subagent nesting to one level by default, so raise it:

On V1, add to `opencode.jsonc`:

```jsonc
{
  "subagent_depth": 2
}
```

On V2, the key lives under `experimental`:

```jsonc
{
  "experimental": {
    "subagent_depth": 2
  }
}
```

Without this, the builder's spawn attempts fail with a subagent depth limit error.

### Agent permissions

Permissions are guardrails against honest mistakes, not a sandbox: shell access can bypass most of them by design.

YACAO's agents define their own permission guardrails. Your `opencode.jsonc` entries are applied as well; on V2 they take precedence, so avoid broad global allows (such as `edit: allow`) if you rely on YACAO's guardrails. To loosen one of their rules, override it per agent: `agent.<name>.permission` on V1, `agents.<name>.permissions` on V2.

These rules are limits of what the tools guard, not content isolation: the plan-read rule restricts the read tool, not what an agent can reach through shell; `explore` may still use shell; and the Git guards cover the common commands, not every possible commit-producing operation. Plain stash reads are allowed while prefixed forms ask, and a later user configuration can change the agent mode.

### Auto-update options (OpenCode V1 Only)

- `autoUpdate` (defaults to `false`): on startup, checks the latest release and shows a notification when a newer version exists. It never edits your configuration.

## Development

I personally use YACAO daily, so I am constantly fine tuning and adjusting it.

Contributions are very welcome.

## License

MIT - see [LICENSE](./LICENSE)
