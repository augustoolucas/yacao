---
name: planning
description: Guides exploration and produces a plan overview plus self-contained task contracts for approval.
---

# Planning

Write a plan overview and self-contained task contracts before implementation.

## Workflow

1. **Explore** - use **read**, **grep**, **glob**, and **bash** to understand the relevant code, identify affected files, and surface risks. Use **webfetch**/**websearch** for external context when relevant (docs, issues, APIs).
2. **Write the plan** - create `.opencode/plans/plan-<slug>/plan.md` and one
   contract for each task under
   `.opencode/plans/plan-<slug>/tasks/task-XX-<name>.md`.

   The plan overview contains:
   - **Goal** - what the complete change accomplishes
   - **Scope** - files touched and boundaries
   - **Reasoning** - brief explanation for the proposed approach
   - **References** - table of relevant files and their roles
   - **Tasks** - an ordered task list with each task's name, dependencies,
     wave ordering, and **Independence** classification used only as
     orchestrator metadata for grouping waves
   - **Risks** - things that could go wrong and regressions to watch for
   - **Verification commands** - final checks that only make sense after all
     tasks complete

   Each task contract is self-contained and contains only:
   - **Goal** - the independently testable increment it delivers
   - **Changes** - the precise edits for that task
   - **File scope** - files the task may touch
   - **Dependencies** - earlier tasks or state it requires
   - **Verification commands** - exact commands that prove the task works

   Keep tasks meaningful and independently testable rather than splitting
   every minor edit. Mark tasks independent only when they have no shared
   files, state, or dependencies with other tasks in their wave. If
   independence is uncertain, order and serialize the tasks. Per-task
   verification is required even when the overview also has final verification
   commands. Keep dependencies, wave structure, Independence metadata, and the
   complete plan in the overview; do not put Independence metadata, future task
   contracts, or the full plan in a task contract.
3. **Present for approval** - show the complete plan overview and task
   summaries to the user. One approval covers the complete plan before writing
   code; do not ask for approval between tasks or waves. Wait for `Approve` or
   `Revise`.
4. On **Revise**: update the overview and task contracts, then re-present.
