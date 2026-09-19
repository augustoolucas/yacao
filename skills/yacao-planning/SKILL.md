---
name: yacao-planning
description: Use when the user's request requires a plan before implementation. Guides the exploration of the codebase and produces a structured plan for approval.
---

# Planning

Write a plan for the change before implementation. Make sure your plan follows the KISS, DRY and YAGNI principles.

## Workflow

1. **Explore** - use the available tools to understand the relevant code, identify affected files, and surface risks. Use web search for external context if needed.
2. **Write plan** - create `.opencode/plans/plan-<slug>.md` with these sections:
   - **Goal** - what the change accomplishes
   - **Scope** - files touched, boundaries
   - **Reasoning** - brief explanation for the proposed approach
   - **References** - table of relevant files and their roles
   - **Changes** - numbered steps, each actionable
   - **Risks** - things that could go wrong, regressions to watch for
   - **Verification commands** - exact commands to prove the change works (test command, lint, manual check, etc.); omit only when nothing needs to be verified
3. **Present for approval** - show a plan summary to the user (approach, scope, risks, verification). You need user approval before writing code. Wait for `Approve` or `Revise`.
4. On **Revise**: update the plan and re-present
