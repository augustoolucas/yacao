---
name: planning
description: Use when the user's request requires a plan before implementation. Helps you explore the codebase and produce a structured plan for approval.
---

# Planning

The orchestrator invokes this skill when the task is categorized as **"Needs planning"** - i.e., non-trivial work that needs a written plan before implementation. Trivial tasks skip this phase.

## When to invoke

- The task changes multiple files, has dependencies, or carries risk
- You need user approval before writing code

## Workflow

1. **Explore** - use **read**, **grep**, **glob**, and **bash** to understand the relevant code, identify affected files, and surface risks. Use **webfetch**/**websearch** for external context when relevant (docs, issues, APIs).
2. **Write plan** - create `.opencode/plans/plan-<slug>.md` with these sections:
   - **Goal** - what the change accomplishes
   - **Scope** - files touched, boundaries
   - **Reasoning**  - brief explanation for the proposed approach
   - **References** - table of relevant files and their roles
   - **Implementation plan** - numbered steps, each actionable
   - **Risks** - things that could go wrong, regressions to watch for
   - **Verification** - exact commands to prove the change works (test command, lint, manual check, etc.)
3. **Present for approval** - show the plan to the user. Wait for `Approve` or `Revise`.
4. On **Revise**: update the plan and re-present
