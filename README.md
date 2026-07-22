# YACAO — Yet Another Coding Agent Orchestrator

A (really) straight forward agent orchestrator workflow for [opencode](https://github.com/opencode-ai/opencode). Automatically switches between planning and building agents, and also reviews the implementation at the end.

## Architecture

```
┌──────────────────────────────────────────┐
│           orchestrator (primary)          │
│  Coordinates, approves plans, delegates   │
│  Does NOT read/write repo code directly   │
└──────────┬───────────┬───────────────────┘
           │           │
     Task  │     Task  │  Task
           ▼           ▼                    ▼
   ┌──────────┐ ┌──────────┐      ┌──────────────┐
   │ planner  │ │ builder  │      │  reviewer     │
   │ Explore  │ │ Implem.  │      │  Validate     │
   │ + plan   │ │ + verify │      │  diff vs plan │
   └──────────┘ └──────────┘      └──────────────┘
```

### Step 0 — Clarify

Before any planning or implementation, the orchestrator clarifies the user's request through one or more rounds of questions. Only once the request is fully understood does the orchestrator proceed to complexity routing and delegation.

### Complexity routing

After clarification, the orchestrator categorizes the task:

| Level | Criteria | Flow |
|---|---|---|
| **Trivial** | Self-contained, no dependencies, no risk | Orchestrator → Builder → Reviewer |
| **Needs planning** | Everything else | Orchestrator → Planner → Approval → Builder → Reviewer |

### Phase A — Planning

**Trivial tasks** — skip Phase A. Go straight to Builder.

**Needs planning:**
1. **planner** explores the codebase and writes a plan to `.opencode/plans/plan-<slug>.md`
2. If the task is complex enough to warrant a checklist, planner also writes `.opencode/plans/checklist-<slug>.md`
3. Orchestrator presents the plan (or checklist, if generated) for user approval (`Approve` / `Revise`)
4. On Revise: re-delegate to planner with feedback

### Phase B — Implementation

**Trivial tasks:**
1. **builder** implements directly from the orchestrator's spec

**Needs planning:**
1. **builder** receives the full checklist (if generated) and follows it autonomously, consulting `.opencode/plans/plan-<slug>.md` for details
2. Builder output format: `STATUS` (complete/partial/blocked/escalate) + `CHANGES` + `VERIFIED` + `GAPS`

### Phase C — Review

Reviewer **always** runs — never skip.

1. **reviewer** validates the full implementation diff against the plan
2. Returns a structured verdict: `Approved` / `Adjustments needed` / `Rejected`
3. Orchestrator acts on the verdict (re-delegate fixes, replan, or report completion)

## Install

### Preferred: give the repo URL to your AI agent

```
Install YACAO from https://github.com/augustoolucas/yacao
```

Your opencode agent will follow the manual steps below.

### Manual

```bash
# 1. Clone
git clone https://github.com/augustoolucas/yacao /tmp/yacao

# 2. Copy agents
cp /tmp/yacao/agents/*.md ~/.config/opencode/agents/

# 3. Copy skills
cp -r /tmp/yacao/skills/* ~/.config/opencode/skills/

# 4. Copy plugin
cp /tmp/yacao/plugin-src/*.ts ~/.config/opencode/plugin-src/

# 5. Merge config
# Open ~/.config/opencode/opencode.jsonc and merge in the contents of
# /tmp/yacao/opencode.jsonc.partial — add the "plugin" block
# alongside your existing config.

# 6. Clean up
rm -rf /tmp/yacao

# 7. Restart opencode
```

### Config merge detail

Your `~/.config/opencode/opencode.jsonc` needs these blocks added (not replaced):

```jsonc
{
  // ... your existing config ...

  "plugin": [
    ["./plugin-src/plan-post-approval.ts", { "plan_post_approval_handoff_agent": "orchestrator" }]
  ]
}
```

**Important:** Do NOT replace your entire config file. Merge this alongside your existing settings. If you already have a `"plugin"` array, append the plan-post-approval entry to it. No `"agent"` block is needed — temperature is defined in each agent's `.md` frontmatter, and subagents inherit the model from the primary agent.

## Model requirements

All four agents use **`opencode-go/deepseek-v4-pro`**. This is the only model tested. Using other models may work but YACAO's prompts and temperature settings are tuned for this provider.

> **Note:** Subagents inherit the model from the primary agent — no `"agent"` block is needed in `opencode.jsonc`. Temperature is defined in each agent's `.md` frontmatter.

| Agent         | Model                          | Temperature | Mode     |
|---------------|--------------------------------|-------------|----------|
| orchestrator  | opencode-go/deepseek-v4-pro   | 0.25        | Primary  |
| planner       | opencode-go/deepseek-v4-pro   | 0.25        | Subagent |
| builder       | opencode-go/deepseek-v4-pro   | 0.10        | Subagent |
| reviewer      | opencode-go/deepseek-v4-pro   | 0.10        | Subagent |

## Agents

| Agent         | Role | Read repo? | Write repo? | Spawns subagents? |
|---------------|------|------------|-------------|-------------------|
| **orchestrator** | Coordinates phased work. Approves plans, slices implementation, delegates everything. | No | No | Yes — planner, builder, reviewer via Task |
| **planner** | Explores codebase, reads files, searches for patterns, writes structured plans to `.opencode/plans/`. | Yes | Only `.opencode/plans/` | No |
| **builder** | Implements scoped coding tasks from precise specs. Edits files, runs verification, reports results. Never redesigns. | Yes | Yes (full) | No |
| **reviewer** | Validates implementation diff against plan. Checks bugs, regressions, plan adherence, patterns, and simplicity. Read-only. | Yes | No | No |

## Bundled skills

| Skill | Purpose |
|-------|---------|
| `agent-delegation` | Decision table for routing work to subagents and keeping child prompts minimal |
| `worktrees` | Git worktree lanes for isolated parallel work on complex or risky tasks |
| `reflect` | Session archaeology — find repeated workflow patterns and suggest reusable assets |

## What the plugin does

The bundled `plan-post-approval.ts` plugin automates the handoff after plan approval:

- When the `orchestrator` asks `PlanApprove` and the user chooses `Approve`, the plugin waits for session idle
- It compacts the conversation context (summarized by the same model) and injects a handoff prompt with the approved plan path
- If the handoff target is also `orchestrator`, it skips the automated prompt (the orchestrator continues Phase B in-session)
- If running in `plan` mode, it hands off to `build` automatically

## License

MIT — see [LICENSE](./LICENSE)
