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

The main orchestrator agent directly handles code exploration, implementation planning, and review. Each workflow phase has specific guidance defined as skills, loaded on demand. Implementation is delegated to the builder agent.

The goal is to streamline the natural workflow of vanilla OpenCode, with minimal to none learning curve. There is no need to learn and memorize a bunch of commands, fancily named agents and skills. Work the same way you already do, just without tabbing.

YACAO is intended for small, incremental tasks built through iterative processes, rather than single-shot entire solutions. It is not necessarily better, cheaper, or more effective than vanilla OpenCode, it's just more practical.

## Why YACAO?

Most "slim" or "minimal" multi-agent frameworks for OpenCode still feel too bloated for my taste, packed with too many agents and commands and skills and whatever. So I decided to build my own version, and it has been working well for my use case so far.

I used to discuss ideas with the built-in Plan Agent, plan solutions, then manually switch to the Build Agent to implement it, and then ask the Plan Agent to review the output, which often led to further adjustments.

With YACAO, the workflow is fundamentally the same but feels much more natural: the orchestrator kicks off implementation once the idea is solid, reviews the result upon completion, and automatically instructs the builder to fix issues if needed.

## How it works

TL;DR: the orchestrator receives your prompt and routes it. Questions and discussions are answered directly after exploring the codebase if needed. Change requests are clarified until well defined, then:

- trivial changes go straight to the builder and back for review;
- larger changes get a written plan you approve first, then the builder implements it, with review and fixes until it's right.

More detailed description of YACAO in the future.

## Install

YACAO works on OpenCode V1 and V2.

### OpenCode V1

Requires OpenCode 1.18.29 or newer.
Add the plugin to your `opencode.jsonc`:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git"]
}
```

To pin a specific version, append a tag to the spec (replace vX.Y.Z with a release tag):

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git#vX.Y.Z"]
}
```

To auto-update YACAO, enable the `autoUpdate` option:

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

To pin a specific version, append a tag to the spec (replace vX.Y.Z with a release tag):

```jsonc
{
  "plugins": ["yacao@git+https://github.com/augustoolucas/yacao.git#vX.Y.Z"],
  "default_agent": "orchestrator"
}
```

Then restart OpenCode.

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

The builder can spawn OpenCode's `general` and `explore` subagents to parallelize work inside a task.
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

### Auto-update options (OpenCode V1 Only)

- `autoUpdate` (defaults to `false`): on startup, checks the latest release and pins the plugin spec forward (`#vX.Y.Z`) when a newer version exists, so the next restart installs it.
- `updateScope` (defaults to `globalOnly`): which configs may be updated - `"globalOnly"` updates only the global config, `"all"` also updates the project's `.opencode/opencode.jsonc` or `opencode.json`.

```jsonc
{
  "plugin": [
    [
      "yacao@git+https://github.com/augustoolucas/yacao.git",
      {
        "autoUpdate": true,
        "updateScope": "all"
      }
    ]
  ]
}
```

## Development

I personally use YACAO daily at work, so I am constantly fine tuning and adjusting it.
Contributions are very welcome.

## License

MIT - see [LICENSE](./LICENSE)
