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
                       │ invokes (skill tool)
                       ▼
┌───────────────────────────────────────────────────────────┐
│                skills/<name>/SKILL.md                     │
│   planning · implementation · review                     │
│   Phase-specific workflow guidance, loaded on-demand      │
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

The orchestrator handles exploration, planning, and review directly. Phase-specific workflow guidance is loaded on-demand from `skills/` via the skill tool. Only the implementation step is delegated to builder.

### Step 0 — Clarify

Before any planning or implementation, the orchestrator clarifies the user's request through one or more rounds of questions. Only once the request is fully understood does the orchestrator proceed to complexity routing.

### Complexity routing

After clarification, the orchestrator categorizes the task:

| Level | Criteria | Flow |
|---|---|---|
| **Question or Discussion** | User is asking about the codebase, not requesting a change | Orchestrator explores and answers directly |
| **Trivial** | Self-contained, no dependencies, no risk | Orchestrator → Builder → Orchestrator reviews → Report |
| **Needs planning** | Everything else | Orchestrator explores → Plan → Approval → Builder → Orchestrator reviews → Report |

### Phase Q — Question or Discussion

When the user is asking about the codebase, requesting analysis, or wants to discuss an idea (not requesting a change), the orchestrator uses **read**, **grep**, **glob**, **bash**, and optionally **webfetch**/**websearch** to explore and answer directly. No plan, no builder, no review — just an answer.

### Phase A — Planning

The orchestrator invokes the `planning` skill. See `skills/planning/SKILL.md`.

### Phase B — Implementation

The orchestrator invokes the `implementation` skill. See `skills/implementation/SKILL.md`.

### Phase C — Review

The orchestrator invokes the `review` skill. See `skills/review/SKILL.md`. On **Approved**, the orchestrator stages and commits the change itself (`git * commit*` is `ask` — the user approves the prompt).

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

# 2. Copy agents and skills
cp /tmp/yacao/agents/*.md ~/.config/opencode/agents/
cp -r /tmp/yacao/skills/. ~/.config/opencode/skills/

# 3. Clean up
rm -rf /tmp/yacao

# 4. Restart opencode
```

### Make YACAO the default agent

Add `"default_agent": "orchestrator"` to `~/.config/opencode/opencode.jsonc`. Without it, opencode starts on `build`; the orchestrator is reachable via Tab.

## Agents

| Agent | Role | Read repo? | Write repo? | Spawns subagents? |
|---|---|---|---|---|
| **orchestrator** | Explores code, writes plans, delegates to builder, reviews diffs, and reports. All-in-one primary agent. | Yes | No (only `.opencode/plans/`) | Yes — builder via Task |
| **builder** | Implements scoped coding tasks from precise specs. Edits files, runs verification, reports results. Never redesigns. | Yes | Yes (full) | Yes — native opencode subagents (general, explore, scout) |

Permissions are guardrails against drift, not a sandbox: the orchestrator pairs `edit: deny` with broad `bash` access, so its prompt rules are what keep it from writing code.

To run the implementer on a cheaper model, set `model:` in `agents/builder.md` frontmatter (e.g. `model: provider/model-id`). Without it, builder inherits the orchestrator's model.

## Skills

Skills are reusable, on-demand workflow guides loaded by the orchestrator at each phase. The orchestrator invokes a phase-specific skill (via the skill tool) when it enters that phase — its body is not in the system prompt, only the description is.

| Skill | When invoked | Purpose |
|---|---|---|
| **`planning`** | Phase A — for "Needs planning" tasks | Explore the codebase and produce a structured plan for approval. |
| **`implementation`** | Phase B — before delegating to builder | Construct the spec, capture the `task_id`, and handle the builder's response. |
| **`review`** | Phase C — after every implementation | Validate the diff against the plan or spec across 6 dimensions and return a verdict. |

Trivial and Question or Discussion tasks don't enter Phase A (planning skill is never invoked). Review skill runs on every implementation, including trivial tasks.

## License

MIT — see [LICENSE](./LICENSE)
