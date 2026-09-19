---
name: yacao-planning
description: Guides the exploration of the codebase and produces a structured plan for a given request.
---

# Planning

Write a plan overview and self-contained task contracts before implementation. Make sure your plan follows the KISS, DRY and YAGNI principles.

## Workflow

1. **Explore** - use the available tools to understand the relevant code, identify affected files, and surface risks. Use web search and fetch for external information whenever you need.
2. **Write the plan** - create `.opencode/plans/plan-<slug>/plan.md` and one contract for each task under `.opencode/plans/plan-<slug>/tasks/task-XX-<name>.md`.

   The plan overview contains:
   - **Goal** - what the complete change accomplishes
   - **Scope** - files touched and boundaries
   - **Reasoning** - brief explanation for the proposed approach
   - **References** - table of relevant files and their roles
   - **Tasks** - the ordered task list with each task's dependencies
   - **Risks** - things that could go wrong and regressions to watch for
   - **Verification commands** - final checks that only make sense after all tasks complete (omit only when nothing needs to be verified)

   Each task contract is self-contained and contains only:
   - **Goal** - the independently testable increment it delivers
   - **Changes** - the precise edits for that task
   - **File scope** - files the task may touch
   - **Dependencies** - earlier tasks or state it requires
   - **Verification commands** - exact commands that prove the task works

   Keep tasks meaningful and independently testable. A plan may consist of a single task when the work does not split into verifiable increments. Order the tasks so each one can be implemented and verified before the next; per-task verification is required even when the overview also has final verification commands. Keep the complete plan in the overview, never in a task contract.
3. **Present for approval** - show a show summary to the user. One approval covers the complete plan before writing code; do not ask for approval between tasks. Wait for `Approve` or `Revise`.
4. On **Revise**: update the overview and task contracts, then re-present.
