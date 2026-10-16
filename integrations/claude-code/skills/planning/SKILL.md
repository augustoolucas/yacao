---
name: "planning"
description: "Guides the exploration of the codebase and produces a structured plan for a given request."
---

# Planning

Write a plan overview and self-contained task contracts before implementation. Make sure your plan follows the KISS, DRY and YAGNI principles.

## Workflow

1. **Explore** - use the available tools to understand the relevant code, identify affected files, and surface risks. Use web search and fetch for external information whenever you need.
2. **Write the plan** - create `.yacao/plans/plan-<slug>/plan.md` and one contract for each task under `.yacao/plans/plan-<slug>/tasks/task-XX-<name>.md`.

   The plan overview contains:
   - **Goal** - what the complete change accomplishes
   - **Repository path** - the repository this plan targets
   - **Scope** - files touched and boundaries
   - **Reasoning** - brief explanation for the proposed approach
   - **References** - table of relevant files and their roles
   - **Acceptance criteria** - the original user acceptance criteria the completed work must satisfy
   - **Tasks** - the ordered task list with each task's dependencies
   - **Risks** - things that could go wrong and regressions to watch for
   - **Verification commands** - final checks that only make sense after all tasks complete (omit only when nothing needs to be verified)
   - **Implementation metadata** - the commit preference, the progress and, when Git applies, the fixed initial review base, owned and recorded as the `yacao:implementation` skill describes

   Each task contract is self-contained and contains only:
   - **Goal** - the independently testable increment it delivers
   - **Changes** - the precise edits for that task
   - **File scope** - files the task may touch
   - **Dependencies** - earlier tasks or state it requires
   - **Verification commands** - exact commands that prove the task works

   Keep tasks meaningful and independently testable. A plan may consist of a single task when the work does not split into verifiable increments. Order the tasks so each one can be implemented and verified before the next; per-task verification is required even when the overview also has final verification commands. Keep the complete plan in the overview, never in a task contract.
3. **Present for approval** - show a summary to the user. One approval covers the complete plan before writing code; do not ask for approval between tasks. An unchanged task needs no new plan approval. Accept clear approval or revision intent rather than a literal token. If the user abandons or supersedes the plan instead, stop and note the plan as abandoned in the overview.
4. On **Revise**: update the overview and task contracts, then re-present.

When working on a project below the session root, store its plans under `.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use `.yacao/plans/plan-<slug>/`.
These paths are relative to the session root, not the target project root; use the selected plan directory for all overview, task and ledger paths in this skill.
