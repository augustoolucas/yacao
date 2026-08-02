# YACAO - Agent Configuration Repository

## Stack

This is an **opencode agent configuration repository**. It contains:

- **Agents** (`agents/*.md`): YAML frontmatter with mode/permission declarations + markdown body with system prompts
- **Skills** (`skills/<name>/SKILL.md`): Reusable workflow guidance, loaded on-demand via the skill tool. The orchestrator invokes phase-specific skills (planning, implementation, review) when entering each phase.

There is no build step, no npm, no CLI - opencode consumes the raw files directly after installation.

## Conventions

### Agent files

Every agent under `agents/` follows this structure:

```yaml
---
description: <one-line summary>
mode: primary | subagent
temperature: <float>          # optional, builder uses 0.1
permission:
  edit: allow|deny|<pattern>
  read: allow|deny|<pattern>
  bash: allow|deny|<pattern>
  task:
    builder: allow
  # ... other permissions
---
```

- `mode: primary` for the orchestrator (the main agent users invoke)
- `mode: subagent` for builder (invoked via Task from the orchestrator)
- Permission rules follow opencode's glob-based permission model
- Every agent defines its own tool access - the orchestrator can read the full repo but can only write plan files under `.opencode/plans/`

### Model config

Both agents inherit the model from the primary agent - no `model` key or `agent` block is needed in `opencode.jsonc`. Temperature is defined in each agent's `.md` frontmatter (orchestrator: 0.25, builder: 0.1).

## Testing

### Manual restart test

After making changes, the only reliable way to verify:

1. Copy the changed agent files to `~/.config/opencode/agents/`
2. Restart opencode (totally - close the session/process, start fresh)
3. Run a simple task through the orchestrator (e.g. "write a hello world function")
4. Verify: orchestrator explores, plans, delegates to builder, reviews, and reports
5. Verify trivial-task path: orchestrator delegates directly to builder with a spec, builder implements, orchestrator reviews and reports (no plan file)
6. Verify Question or Discussion path: orchestrator explores and answers directly (no plan, no builder, no review)

### What can't be tested

- Permission boundaries (e.g., orchestrator blocked from editing source code - only `.opencode/plans/` is writable) only manifest when opencode enforces them

## Install flow (for end users, not this repo)

This repo's README describes the full install for end users. In short:

1. Clone the repo
2. Copy `agents/*.md` to `~/.config/opencode/agents/`
3. Copy `skills/<name>/SKILL.md` to `~/.config/opencode/skills/<name>/SKILL.md` (one folder per skill)
4. Restart opencode

## Contribution rules

- **Follow existing patterns.** Agents share a common structure: YAML frontmatter, role description, and workflow instructions. Most also include an explicit Rules section. Keep this structure.
- **Keep agent prompts narrow and specific.** Keep prompts focused - don't bloat them.
- **Permission changes are high-risk.** The orchestrator now has full read/grep/glob/bash for exploration and can webfetch/websearch, but can only edit plan files (`.opencode/plans/`). Do not relax these constraints without a strong reason.
- **Test after changes.** At minimum, run the manual restart test described above. If you changed permissions, verify both the allowed and denied paths.

