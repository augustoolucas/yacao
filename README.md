# YACAO — Yet Another Coding Agent Orchestrator

A (really) straight forward agent orchestrator workflow for [opencode](https://github.com/opencode-ai/opencode). Automatically switches between planning and building agents, and also reviews the implementation at the end.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              orchestrator (primary)                │
│    Coordinates, approves plans, delegates          │
│    Does NOT read/write repo code directly          │
└──────┬────────────┬────────────┬──────────────────┘
       │            │            │
  Task │       Task │       Task │  Task
       ▼            ▼            ▼                ▼
┌──────────┐ ┌──────────┐ ┌──────────┐    ┌──────────────┐
│  planner │ │ question │ │  builder │    │   reviewer    │
│  Explore │ │  Q&A     │ │  Implem. │    │   Validate    │
│  + plan  │ │  Answer  │ │  + verify│    │   diff vs plan│
└──────────┘ └──────────┘ └──────────┘    └──────────────┘
```

### Step 0 — Clarify

Before any planning or implementation, the orchestrator clarifies the user's request through one or more rounds of questions. Only once the request is fully understood does the orchestrator proceed to complexity routing and delegation.

### Complexity routing

After clarification, the orchestrator categorizes the task:

| Level | Criteria | Flow |
|---|---|---|
| **Question** | User is asking about the codebase, not requesting a change | Orchestrator → question agent |
| **Trivial** | Self-contained, no dependencies, no risk | Orchestrator → Builder → Reviewer |
| **Needs planning** | Everything else | Orchestrator → Planner → Approval → Builder → Reviewer |

### Phase A — Planning

**Questions** — skip Phase A and Phase B. Go straight to the question agent (see Phase Q).

**Trivial tasks** — skip Phase A. Go straight to Builder.

**Needs planning:**
1. **planner** explores the codebase and writes a plan to `.opencode/plans/plan-<slug>.md`
2. If the task is complex enough to warrant a checklist, planner also writes `.opencode/plans/checklist-<slug>.md`
3. Orchestrator presents the plan (or checklist, if generated) for user approval (`Approve` / `Revise`)
4. On Revise: re-delegate to planner with feedback

### Phase Q — Question

When the user is asking about the codebase (not requesting a change), the orchestrator routes directly to the **question** agent. The question agent explores code, searches patterns, reads files, and uses web search to answer. No plan, no implementation, no review — just an answer.

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

# 4. Clean up
rm -rf /tmp/yacao

# 5. Restart opencode
```

## Agents

| Agent         | Role | Read repo? | Write repo? | Spawns subagents? |
|---------------|------|------------|-------------|-------------------|
| **orchestrator** | Coordinates phased work. Clarifies requirements, routes to subagents, approves plans. Does not read/write repo code directly. | No | No | Yes — planner, builder, reviewer via Task |
| **planner** | Explores codebase, reads files, searches for patterns, writes structured plans to `.opencode/plans/`. | Yes | Only `.opencode/plans/` | No |
| **question** | Answers user questions about the codebase by exploring code, searching patterns, reading files, and web search. | Yes | No | No |
| **builder** | Implements scoped coding tasks from precise specs. Edits files, runs verification, reports results. Never redesigns. | Yes | Yes (full) | No |
| **reviewer** | Validates implementation diff against plan. Checks bugs, regressions, plan adherence, patterns, and simplicity. Read-only. | Yes | No | No |

## Advanced (optional)

| Skill | Purpose |
|-------|---------|
| `worktrees` | Git worktree lanes for isolated parallel work on complex or risky tasks |

## License

MIT — see [LICENSE](./LICENSE)
