# YACAO — Yet Another Coding Agent Orchestrator

You already use plan and build. You probably review your changes too. YACAO just connects the dots — so you don't have to.

Built for [opencode](https://github.com/opencode-ai/opencode).

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                   orchestrator (primary)                  │
│   Explores code, writes plans, reviews diffs, reports     │
│   Reads everything, edits only plans (.opencode/plans/)   │
└──────────────────────┬────────────────────────────────────┘
                       │
                  Task │  (builder)
                       ▼
┌───────────────────────────────────────────────────────────┐
│                      builder (subagent)                   │
│          Implements precise specs, runs verification      │
│                Reads + writes repo code freely            │
└───────────────────────────────────────────────────────────┘
```

The orchestrator handles exploration, planning, and review directly. Only the implementation step is delegated to builder.

### Step 0 — Clarify

Before any planning or implementation, the orchestrator clarifies the user's request through one or more rounds of questions. Only once the request is fully understood does the orchestrator proceed to complexity routing.

### Complexity routing

After clarification, the orchestrator categorizes the task:

| Level | Criteria | Flow |
|---|---|---|
| **Question** | User is asking about the codebase, not requesting a change | Orchestrator explores and answers directly |
| **Trivial** | Self-contained, no dependencies, no risk | Orchestrator → Builder → Orchestrator reviews → Report |
| **Needs planning** | Everything else | Orchestrator explores → Plan → Approval → Builder → Orchestrator reviews → Report |

### Phase Q — Question

When the user is asking about the codebase (not requesting a change), the orchestrator uses **read**, **grep**, **glob**, **bash**, and optionally **webfetch**/**websearch** to explore and answer directly. No plan, no builder, no review — just an answer.

### Phase A — Planning

**Trivial tasks** — skip Phase A. Go straight to Phase B with a direct spec.

**Needs planning:**

1. **Orchestrator** explores the codebase directly (read, grep, glob, bash) and writes a plan to `.opencode/plans/plan-<slug>.md`
2. If the task is complex enough, also writes `.opencode/plans/checklist-<slug>.md`
3. Orchestrator presents the plan (or checklist) for user approval (`Approve` / `Revise`)
4. On Revise: orchestrator updates the plan and re-presents

### Phase B — Implementation

**Trivial tasks:**
1. **builder** implements directly from the orchestrator's spec

**Needs planning:**
1. **builder** receives the plan file (and checklist, if generated) and implements autonomously
2. Builder output format: `STATUS` (complete/partial/blocked/escalate) + `CHANGES` + `VERIFIED` + `GAPS`

### Phase C — Review

The orchestrator reviews every builder output directly — never skip.

1. Runs `git diff` to see all changes
2. Reads modified files and validates against the plan (or spec for trivial tasks)
3. Checks: plan adherence, bugs/regressions, structure/patterns, compatibility, verification, simplicity
4. If issues found: delegates fixes to builder and re-reviews. If clean: reports completion to user.

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

# 3. Clean up
rm -rf /tmp/yacao

# 4. Restart opencode
```

## Agents

| Agent | Role | Read repo? | Write repo? | Spawns subagents? |
|---|---|---|---|---|
| **orchestrator** | Explores code, writes plans, delegates to builder, reviews diffs, and reports. All-in-one primary agent. | Yes | No (only `.opencode/plans/`) | Yes — builder via Task |
| **builder** | Implements scoped coding tasks from precise specs. Edits files, runs verification, reports results. Never redesigns. | Yes | Yes (full) | Yes — native opencode subagents (general, explore, scout) |

## License

MIT — see [LICENSE](./LICENSE)
