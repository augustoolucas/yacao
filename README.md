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

With YACAO, the workflow is fundamentally the same but feels much more natural: the Orchestrator kicks off implementation once the idea is solid, reviews the result upon completion, and automatically instructs the builder to fix issues if needed.

## How it works

TL;DR: the orchestrator receives your prompt and routes it. Questions and discussions are answered directly after exploring the codebase if needed. Change requests are clarified until well defined, then:

- trivial changes go straight to the builder and back for review;
- larger changes get a written plan you approve first, then the builder implements it, with review and fixes until it's right.

More detailed description of YACAO in the future.

## Install

Tested only on the OpenCode CLI so far.

```bash
# 1. Clone
git clone https://github.com/augustoolucas/yacao /tmp/yacao

# 2. Create config directories
mkdir -p "$HOME/.config/opencode/agents" "$HOME/.config/opencode/skills"

# 3. Copy agents and skills
cp /tmp/yacao/agents/*.md "$HOME/.config/opencode/agents/"
cp -r /tmp/yacao/skills/. "$HOME/.config/opencode/skills/"

# 4. Clean up
rm -rf /tmp/yacao

# 5. Restart opencode
```

## Configuration

### Make YACAO the default agent

Add `"default_agent": "orchestrator"` to `opencode.jsonc`. Without it, opencode starts on `Build` and you need to select Orchestrator via Tab key.

### Setup builder model

Builder inherits the model set for Orchestrator. You need to edit `agents/builder.md` to set a different model.

## Development

I personally use YACAO daily at work, so I am constantly fine tuning and adjusting the agents and skills. Contributions are very welcome.

### Roadmap

- Orchestrator still asks for approval for every plan before handing it to builder. I still need to figure out how to make it more proactive without risking unwanted changes.
- Builder currently receives and implements the entire plan at once. Splitting plans into small, individually reviewable steps is under development.

## License

MIT - see [LICENSE](./LICENSE)
