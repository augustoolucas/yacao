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

Add the plugin to your `opencode.jsonc`:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git"]
}
```

Then restart OpenCode. The plugin injects the agents and registers the skills at every startup, so nothing is copied into `~/.config/opencode` and there is nothing to edit locally - updates apply whenever you restart.

OpenCode reinstalls the plugin from git on every launch. To pin a specific version instead, append a tag to the spec:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git#v0.2.0"]
}
```

## Configuration

### Make YACAO the default agent

The plugin sets `orchestrator` as the default agent automatically. To start on something else, set `"default_agent"` in `opencode.jsonc` - your value wins.

### Setup builder model

To set the builder's model, or override any other agent option, add it to `opencode.jsonc`:

```jsonc
{
  "agent": {
    "builder": {
      "model": "your-provider/your-model"
    }
  }
}
```

Plugin defaults are merged under your config, so anything you set here takes precedence.

## Development

I personally use YACAO daily at work, so I am constantly fine tuning and adjusting it. Contributions are very welcome.

### Roadmap

- I still need to figure out how to make the orchestrator more proactive without risking unwanted changes. It asks for approval for every plan before handing it to the builder.
- Splitting plans into small, individually reviewable steps. Builder currently receives and implements the entire plan at once.

## License

MIT - see [LICENSE](./LICENSE)
