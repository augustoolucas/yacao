# YACAO - Yet Another Coding Agent Orchestrator

You already use Plan and Build. You probably review your changes too. YACAO just connects the dots, so you don't have to.

## What is YACAO?

YACAO is a truly minimal agent workflow for OpenCode: just 2 agents and 3 skills to handle all planning, building, and reviewing.

The main orchestrator agent directly handles code exploration, implementation planning and review. Each workflow phase has specific guidance defined as skills, loaded on demand. Implementation is delegated to the builder agent.

The goal is to streamline the natural workflow of vanilla OpenCode, with minimal to none learning curve. There is no need to learn and memorize a bunch of commands, fancily named agents and skills. Work the same way you already do, just without tabbing.

YACAO is intended for small, incremental tasks built through iterative processes, rather than single-shot entire solutions. It is not intended to be necessarily better, cheaper or more effective than vanilla OpenCode, it's just more practical. 

## Why YACAO?

Most "slim" or "minimal" multi-agent frameworks for OpenCode still feel too bloated for my taste, packed with too many agents and commands and skills and whatever. So I decided to build my own version, and it has been working well for my use case so far.

I used to discuss ideas with the built-in Plan Agent, plan solutions, then manually switching to the Build Agent to implement it, and then asking the Plan Agent to review the output, which often led to further adjustments. 

With YACAO, the workflow is fundamentally the same but feels much more natural: the Orchestrator kicks off implementation once the idea is solid, reviews the result upon completion, and automatically instructs the builder to fix issues if needed.

## YACAO is under active development

I personally use YACAO daily at work, so I am constantly fine tuning and adjusting the agents and skills. Contributions are very welcome.

## TODO

- Orchestrator still asks for approval for every plan before handling it to builder. I still need to figure out how to make it more proactive without risking unwanted changes.
- Builder currently receives and implements the entire plan at once. Splitting plans into small and individually reviewable steps is under development.

## Install

```bash
# 1. Clone
git clone https://github.com/augustoolucas/yacao /tmp/yacao

# 2. Copy agents and skills
cp /tmp/yacao/agents/*.md ~/.config/opencode/agents/
cp -r /tmp/yacao/skills/. ~/.config/opencode/skills/

# 3. Clean up
rm -rf /tmp/yacao

# 4. Restart opencode
```

## Optional

### Make YACAO the default agent

Add `"default_agent": "orchestrator"` to `opencode.jsonc`. Without it, opencode starts on `Build` and you need to select Orchestrator via Tab key.

### Setup builder model

Builder inherits the model set for Orchestrator, you need to edit `agents/builder.md` to set a different model.

## License

MIT - see [LICENSE](./LICENSE)
