# YACAO - Yet Another Coding Agent Orchestrator

You already use Plan and Build. You probably review your changes too. YACAO just connects the dots, so you don't have to.

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

YACAO requires OpenCode V1; V2 support is on the roadmap.

Add the plugin to your `opencode.jsonc`:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git"]
}
```

To pin a specific version, append a tag to the spec:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git#v0.2.0"]
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

## Configuration

The plugin sets `orchestrator` as the default agent automatically. To start on something else, set `"default_agent"` in `opencode.jsonc`.

### Setup builder model

Builder inherits the model set for the orchestrator. To set a different model, or override any other agent option, add it to `opencode.jsonc`:

```jsonc
{
  "agent": {
    "builder": {
      "model": "your-provider/your-model"
    }
  }
}
```

### Auto-update options

Both options are opt-in - `autoUpdate` is off by default, and `updateScope` defaults to `globalOnly`:

- `autoUpdate`: on startup, checks the latest release and pins the plugin spec forward (`#vX.Y.Z`) when a newer version exists, so the next restart installs it.
- `updateScope`: which configs may be updated - `"globalOnly"` (default) updates only the global config, `"all"` also updates the project's `.opencode/opencode.jsonc` or `opencode.json`.

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

I personally use YACAO daily at work, so I am constantly fine tuning and adjusting it. Contributions are very welcome.

### Roadmap

- OpenCode V2 support. YACAO currently targets the V1 plugin API; V2 changed the plugin API, so a port is required.

## License

MIT - see [LICENSE](./LICENSE)
