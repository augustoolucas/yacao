---
name: planning
description: Use when the user's request requires a written plan before implementation. Helps you explore the codebase and produce a structured plan for approval.
---

# Planning

The orchestrator invokes this skill when the task is categorized as **"Needs planning"** — i.e., non-trivial work that needs a written plan before implementation. Trivial tasks skip this phase.

## When to invoke

- The task requires more than a one-line change
- It touches multiple files, has dependencies, or carries risk
- You need user approval before writing code

## Workflow

1. **Explore** — use **read**, **grep**, **glob**, and **bash** to understand the relevant code, identify affected files, and surface risks. You have full read access to the repo.
2. **Write plan** — create `.opencode/plans/plan-<slug>.md` with these sections:
   - **Goal** — what the change accomplishes
   - **Scope** — files touched, boundaries
   - **References** — table of relevant files and their roles
   - **Implementation plan** — numbered steps, each actionable
   - **Risks** — things that could go wrong, regressions to watch for
3. **Checklist** (optional) — if the task is complex, also write `.opencode/plans/checklist-<slug>.md` as a high-level TODO list
4. **Present for approval** — show the plan (or checklist) to the user. Wait for `Approve` or `Revise`.
5. On **Revise**: update the plan and re-present

## Rule

Never duplicate. If you write a checklist file, delete the inline `## Checklist` from the plan body — the checklist file is the single source of truth for the builder.
