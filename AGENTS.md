# YACAO — Agent Configuration Repository

## Stack

This is an **opencode agent configuration repository**. It contains:

- **Agents** (`agents/*.md`): YAML frontmatter with mode/permission declarations + markdown body with system prompts
- **Skills** (`skills/<name>/SKILL.md`): Reusable workflow guidance, loaded on-demand via the skill tool
- **Plugin** (`plugin-src/*.ts`): TypeScript plugins compiled and loaded by opencode at runtime
- **Config partial** (`opencode.jsonc.partial`): JSONC fragment that users merge into `~/.config/opencode/opencode.jsonc`

There is no build step, no npm, no CLI — opencode consumes the raw files directly after installation.

## Conventions

### Agent files

Every agent under `agents/` follows this structure:

```yaml
---
description: <one-line summary>
mode: primary | subagent
temperature: <float>          # optional, builder+reviewer use 0.1
permission:
  edit: allow|deny|<pattern>
  read: allow|deny|<pattern>
  bash: allow|deny|<pattern>
  task: allow|deny|<agent-list>
  # ... other permissions
---
```

- `mode: primary` for the orchestrator (the main agent users invoke)
- `mode: subagent` for planner, builder, reviewer (invoked via Task from the orchestrator)
- Permission rules follow opencode's glob-based permission model
- Every agent defines its own tool access — the orchestrator has **no** direct repo read/write/bash

### Model config

All four agents use `opencode-go/deepseek-v4-pro` as defined in `opencode.jsonc.partial`. Temperature:
- orchestrator & planner: 0.25
- builder & reviewer: 0.1

### Skills

Each skill lives in its own directory: `skills/<name>/SKILL.md`. Skills use their own YAML frontmatter with `name` and `description`. The skill body is markdown — no executable code.

### Plugin

The single plugin (`plan-post-approval.ts`) handles automated handoff after plan approval. It's TypeScript using the `@opencode-ai/plugin` API. It reads the opencode config to resolve the handoff target and can trigger session compaction + prompt injection after idle.

## Testing

### Manual restart test

After making changes, the only reliable way to verify:

1. Copy the changed agent/skill/plugin files to `~/.config/opencode/agents/`, `~/.config/opencode/skills/`, `~/.config/opencode/plugin-src/`
2. Merge any config changes from `opencode.jsonc.partial` into `~/.config/opencode/opencode.jsonc`
3. Restart opencode (totally — close the session/process, start fresh)
4. Run a simple task through the orchestrator (e.g. "write a hello world function")
5. Verify: orchestrator delegates to planner, plan appears under `.opencode/plans/`, approval flow works, builder implements, reviewer validates

### What can't be tested

- Plugin behavior is observable only in a live opencode session with real `question.asked`/`question.replied`/`session.idle` events
- The plan-post-approval handoff sequence depends on opencode's internal event loop
- Permission boundaries (e.g., orchestrator blocked from `read`) only manifest when opencode enforces them

## Install flow (for end users, not this repo)

This repo's README describes the full install for end users. In short:

1. Clone the repo
2. Copy agents/ to `~/.config/opencode/agents/`
3. Copy skills/ to `~/.config/opencode/skills/`
4. Copy plugin-src/ to `~/.config/opencode/plugin-src/`
5. Merge `opencode.jsonc.partial` into `~/.config/opencode/opencode.jsonc`
6. Restart opencode

## Contribution rules

- **Follow existing patterns.** Every agent has the same structure (YAML frontmatter + role description + workflow + rules). Keep it.
- **Keep agent prompts narrow and specific.** The orchestrator prompt is already ~100 lines — don't bloat it.
- **Permission changes are high-risk.** The orchestrator's `deny` on `read`/`bash`/`edit` is deliberate and prevents it from inspecting or modifying repo code directly. Do not relax this without a strong reason.
- **Test after changes.** At minimum, run the manual restart test described above. If you changed permissions, verify both the allowed and denied paths.
- **Skill frontmatter matters.** The `name` in a skill's YAML must match the directory name. The `description` is what opencode shows to the model when deciding whether to load the skill.
- **No code in skills.** Skills are markdown only. If you need executable behavior, it belongs in a plugin.
- **Plugin changes require restart.** opencode loads plugins at startup. Any plugin edit needs a full restart to take effect.
