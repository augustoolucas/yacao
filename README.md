<h1 align="center">YACAO - Yet Another Coding Agent Orchestrator</h1>

<p align="center">
  <strong>You already use Plan and Build Modes. You probably review your changes too.</strong><br>
  YACAO just connects the dots, so you don't have to.
</p>

<p align="center">
  <a href="./docs/opencode.md"><img src="https://img.shields.io/badge/OpenCode-V1%20%7C%20V2-6d5dfc?style=flat-square&amp;logo=opencode&amp;logoColor=white" alt="OpenCode V1 | V2"></a>
  <a href="./docs/claude-code.md"><img src="https://img.shields.io/badge/Claude_Code-D97757?style=flat-square&amp;logo=claude&amp;logoColor=white" alt="Claude Code"></a>
  <a href="./docs/antigravity.md"><img src="https://img.shields.io/badge/Antigravity_CLI-experimental-4285F4?style=flat-square" alt="Antigravity CLI (experimental)"></a>
  <a href="https://github.com/augustoolucas/yacao/releases/latest"><img src="https://img.shields.io/github/v/release/augustoolucas/yacao?style=flat-square&amp;label=YACAO" alt="YACAO version"></a>
  <a href="https://github.com/augustoolucas/yacao/blob/main/LICENSE"><img src="https://img.shields.io/github/license/augustoolucas/yacao?style=flat-square" alt="MIT License"></a>
  <a href="https://github.com/augustoolucas/yacao/stargazers"><img src="https://img.shields.io/github/stars/augustoolucas/yacao?style=flat-square" alt="GitHub stars"></a>
</p>

<p align="center">
  <a href="#what-is-yacao">What is YACAO?</a> ·
  <a href="#why-yacao">Why YACAO?</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#install">Install</a> ·
  <a href="#development">Development</a> ·
  <a href="#license">License</a>
</p>

## What is YACAO?

YACAO is a truly minimal multi-agent workflow: just 2 agents and 3 skills to handle all planning, building, and reviewing.

The main orchestrator agent handles code exploration, implementation planning, and review. Each workflow phase has specific guidance defined as skills, loaded on demand. Implementation is delegated to the builder agent.

The goal is to streamline the natural coding-agent workflow, with little to no learning curve. There is no need to learn and memorize a bunch of commands, fancily named agents and skills. Work the same way you already do, without manually switching between planning and implementation.

YACAO is intended for small, incremental tasks built through iterative processes rather than single-shotting entire solutions, although it can handle those too. It is not necessarily better, cheaper, or more effective than your harness's native workflow. It is simply more practical.

## Why YACAO?

Most "slim" or "minimal" multi-agent frameworks still feel too bloated for my taste, packed with too many agents and commands and skills and whatever. So I decided to build my own version, and it has been working well for my use case so far.

When using coding agents, I used to discuss ideas in the built-in Plan Mode, plan solutions, then manually switch to Edit Mode to implement them, and go back to Plan Mode to review the changes, which often led to further adjustments.

With YACAO, the workflow is fundamentally the same but feels much more natural: the orchestrator kicks off implementation once the idea is solid, reviews the result upon completion, and automatically instructs the builder to fix issues if needed.

## How it works

TL;DR: the orchestrator receives your prompt. Questions and discussions are answered directly after exploring if needed. For change requests, the orchestrator asks clarifying questions until the goal is well defined, then:

- small changes go straight to the builder and back for review;
- larger changes get a written plan you approve first, then implementation and review proceed sequentially, task by task.
- by default the approved work stays uncommitted; you can ask for a commit after each approved task, or for a single commit at the end;
- each task is still reviewed before the next one starts, and a task that needs fixes gets at most two adjustment rounds before it comes back to you.

The three skills - planning, implementation and review - own the detailed mechanics behind this behavior.

## Install

<details>
<summary><strong>OpenCode</strong> (V1 / V2)</summary>

OpenCode V1 (requires OpenCode 1.18.29 or newer):

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git"]
}
```

OpenCode V2:

```jsonc
{
  "plugins": ["yacao@git+https://github.com/augustoolucas/yacao.git"],
  "default_agent": "orchestrator"
}
```

Then restart OpenCode.

Full guide: [docs/opencode.md](./docs/opencode.md).

</details>

<details>
<summary><strong>Claude Code</strong></summary>

Requires Node.js 22 or newer on `PATH`.

```text
/plugin marketplace add augustoolucas/yacao#v0.7.0
/plugin install yacao@yacao
```

Then start a new session from your project directory:

```sh
claude --agent yacao:orchestrator
```

Full guide: [docs/claude-code.md](./docs/claude-code.md).

</details>

<details>
<summary><strong>Antigravity CLI</strong> (experimental)</summary>

```sh
agy plugin install https://github.com/augustoolucas/yacao/tree/main/integrations/antigravity
agy --agent yacao-orchestrator
```

Full guide: [docs/antigravity.md](./docs/antigravity.md).

</details>

## Development

I personally use YACAO daily, so I am constantly fine tuning and adjusting it.

Contributions are very welcome.

## License

MIT - see [LICENSE](./LICENSE)
