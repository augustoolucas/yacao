# YACAO - Yet Another Coding Agent Orchestrator

You already use Plan and Build. You probably review your changes too. YACAO just connects the dots, so you don't have to.

## What is YACAO?

YACAO is a truly minimal agent workflow for OpenCode: just 2 agents and 3 skills to handle all planning, building, and reviewing.

The main orchestrator agent directly handles code exploration, implementation planning, and reviews. Each workflow phase has specific guidance defined as skills, loaded on demand. Implementation is delegated to the builder agent.

**Minimal learning curve:** The goal is to streamline the natural workflow of vanilla OpenCode. There is no need to learn and memorize a bunch of commands, agents, and skills. Work the same way you already do, just without tabbing.

## Why YACAO?

Most "slim" or "minimal" multi-agent frameworks for OpenCode still feel too bloated for my taste, packed with too many agents and commands and skills and whatever. So I decided to build my own version, and it has been working well for my use case so far.

YACAO is intended for small, incremental tasks through an iterative process, rather than single-shot entire solutions.

I used to discuss ideas with the built-in Plan Agent, plan solutions, then manually switching to the Build Agent to implement them, and then asking the Plan Agent to review the output, which often led to further adjustments. 

With YACAO, the workflow is fundamentally the same but feels much more natural: the Orchestrator kicks off implementation on its own once the idea is solid, reviews the result upon completion, and automatically instructs the builder to fix issues if needed.

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

### Make YACAO the default agent

Add `"default_agent": "orchestrator"` to `~/.config/opencode/opencode.jsonc`. Without it, opencode starts on `build` and you'll have to select Orchestrator via Tab key.

## License

MIT - see [LICENSE](./LICENSE)
