---
name: agent-delegation
description: "Use when the primary agent must decide whether to delegate via the Task tool, which subagent id to call, and how to keep child-session prompts small. Use when multiple subagents could apply, or before large read-only review, verification, security review, or external doc research."
---

# Subagent delegation (OpenCode)

Must respect `permission.task` in the active primary agent's frontmatter (`agents/<id>.md` — `build` vs `plan` vs `orchestrator` have different allowlists). (These are opencode's built-in primary agent modes, separate from the custom agents in this repo.) The **`orchestrator`** agent coordinates all subagents via Task; it does not inspect or edit repo files directly.

## Available agents

| Agent | Role | Access |
|-------|------|--------|
| `planner` | Explore codebase + write implementation plans under `.opencode/plans/` | Read-only except `.opencode/plans/` |
| `question` | Answers codebase questions by exploring code and searching the web. Read-only. | Read-only, web search allowed |
| `builder` | Implement code according to specifications | Full edit access |
| `reviewer` | Validate diffs against plans; check for bugs, regressions, and security issues | Read-only |

- Use `planner` when the task needs codebase discovery, architecture mapping, symbol location, or a written plan before implementation.
- Use `question` when the user is asking about the codebase (not requesting a change). No plan, no implementation needed.
- Use `builder` for implementing scoped coding tasks. Let it call `planner` internally when it needs exploration.
- Use `reviewer` to validate **every** diff before finalizing — never skip, regardless of task complexity. This agent reviews only — it does not write or explore.
- Security review is handled by the `reviewer` agent — no separate security agent is needed.

## Gold rule: minimal child prompt

Every Task invocation should include:

1. **Goal** in one or two sentences.
2. **Scope**: exact paths, commit/diff, or "read-only" constraints already known to the parent.
3. **Expected return shape**: use the numbered sections that agent's system prompt requires (e.g. blocking vs non-blocking lists).

Do not paste the entire parent conversation into the subagent unless necessary.

## When not to delegate

- Single trivial edit or one obvious tool call.
- User asked explicitly for a single-thread reply.
- Subagent is denied for the current primary (`permission.task`).

For `orchestrator`, "do not delegate" never means "inspect or edit repo files directly." If a trivial request needs direct coding, switch to `build`; if it needs repo facts, delegate to `planner`.

## Anti-patterns (avoid)

- Do **not** call `reviewer` until there is a **stable diff** (known paths / commit / clear scope); reviewing "what we might do" wastes context.
- Do **not** call `builder` without a clear spec or plan — it implements, it does not explore or decide.
- Do **not** chain multiple heavy subagents in parallel on the same prompt without a reason; finish one feedback cycle first.
- Do **not** use long `@` lists for subagents that are **`hidden: true`**; use **Task** instead so permissions and tool contracts stay clear.

## Definitions location

Global defaults live under `~/.config/opencode/agents/<id>.md`. Project overrides: `.opencode/agents/<id>.md`.
