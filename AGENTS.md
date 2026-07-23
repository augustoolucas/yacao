# YACAO — Agent Configuration Repository

## Stack

This is an **opencode agent configuration repository**. It contains:

- **Agents** (`agents/*.md`): YAML frontmatter with mode/permission declarations + markdown body with system prompts

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
  task:
    planner: allow
    builder: allow
    reviewer: allow
    question: allow
  # ... other permissions
---
```

- `mode: primary` for the orchestrator (the main agent users invoke)
- `mode: subagent` for planner, question, builder, reviewer (invoked via Task from the orchestrator)
- Permission rules follow opencode's glob-based permission model
- Every agent defines its own tool access — the orchestrator has **no** direct repo read/write/bash

### Model config

All five agents inherit the model from the primary agent — no `model` key or `agent` block is needed in `opencode.jsonc`. Temperature is defined in each agent's `.md` frontmatter (orchestrator/planner/question: 0.25, builder/reviewer: 0.1).

## Testing

### Manual restart test

After making changes, the only reliable way to verify:

1. Copy the changed agent files to `~/.config/opencode/agents/`
2. Restart opencode (totally — close the session/process, start fresh)
3. Run a simple task through the orchestrator (e.g. "write a hello world function")
4. Verify: orchestrator delegates to planner (complex tasks), plan appears under `.opencode/plans/`, approval flow works, builder implements, reviewer validates
5. Verify trivial-task path: orchestrator delegates directly to builder with a spec, builder implements, reviewer validates (no plan file)
6. Verify question path: orchestrator delegates to question agent for codebase questions, returns answer directly (no plan, no review)

### What can't be tested

- Permission boundaries (e.g., orchestrator blocked from `read`) only manifest when opencode enforces them

## Install flow (for end users, not this repo)

This repo's README describes the full install for end users. In short:

1. Clone the repo
2. Copy agents/ to `~/.config/opencode/agents/`
3. Restart opencode

## Contribution rules

- **Follow existing patterns.** Agents share a common structure: YAML frontmatter, role description, and workflow instructions. Most also include an explicit Rules section. Keep this structure.
- **Keep agent prompts narrow and specific.** The orchestrator prompt is already ~125 lines — don't bloat it.
- **Permission changes are high-risk.** The orchestrator's deny on read, grep, glob, list, bash, edit, lsp, webfetch, and websearch is deliberate — it cannot inspect or modify repo code directly. Do not relax this without a strong reason.
- **Test after changes.** At minimum, run the manual restart test described above. If you changed permissions, verify both the allowed and denied paths.

