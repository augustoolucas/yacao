---
name: "planning"
description: "Guides the exploration of the codebase and produces a structured plan for a given request."
---

# Planning

Write a plan overview and self-contained task contracts before implementation. Make sure your plan follows the KISS, DRY and YAGNI principles.

When working on a project below the workspace root, store its plans under `.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use `.yacao/plans/plan-<slug>/`.
These paths are relative to the workspace root for the current session, not the target project root; `<plan-dir>` is the selected plan directory for all overview and task contract paths in this skill.

## Workflow

1. **Explore** - use the available tools to understand the relevant code, identify affected files, and surface risks. Use web tools when available for external information.
2. **Write the plan** - inside `<plan-dir>`, create `plan.md` and one contract for each task (`task-XX-<name>.md`) under `tasks/`.

   The plan overview contains:
   - **Goal** - what the complete change accomplishes
   - **Repository path** - the repository this plan targets
   - **Scope** - files touched and boundaries
   - **Reasoning** - brief explanation for the proposed approach
   - **References** - table of relevant files and their roles
   - **Acceptance criteria** - the original user acceptance criteria the completed work must satisfy
   - **Tasks** - the ordered task list with each task's contract path and dependencies
   - **Risks** - things that could go wrong and regressions to watch for
   - **Verification commands** - final checks that only make sense after all tasks complete (omit only when nothing needs to be verified)
   - **Implementation metadata** - the commit preference, the progress and, when Git applies, the fixed initial review base, owned and recorded as the `yacao:implementation` skill describes

   Each task contract is self-contained, without relying on other planning files, and contains only:
   - **Goal** - the independently testable increment it delivers
   - **Changes** - the precise edits for that task
   - **File scope** - files the task may touch
   - **Dependencies** - earlier tasks or state it requires
   - **Verification commands** - exact commands that prove the task works, including expected outcome when not obvious (omit only when no command applies)

   Keep tasks meaningful and independently testable. Group the setup, implementation, tests and supporting changes needed for one coherent outcome in the same task; split only when independent outcomes warrant separate reviews, not by file, layer, test phase or size. Necessary names, formats and compatibility decisions belong in that task's Changes or Dependencies; leave compatible local choices to the yacao:builder. A plan may consist of a single task when the work does not split into verifiable increments. Order the tasks by real dependencies so each one can be implemented and verified before the next; per-task verification is required whenever the task can be verified by command, even when the overview also has final verification commands. Keep the complete plan in the overview, never in a task contract.
3. **Review the plan and tasks** - Verify `plan.md` and every `task-*.md` contract against both the user's request and the actual repository files (read affected callers, tests, and config/build anchors rather than relying on memory). Confirm every edit's file is in `File scope`, every contract is self-contained, shared files between tasks are reflected in `Dependencies`, and `Verification commands` cover any affected tests. Fix errors and omissions before presenting.
4. **Present for approval** - show a summary to the user, noting the remaining risks. One approval covers the complete plan before writing code; do not ask for approval between tasks. Accept any clear approval or revision request. If the user abandons or supersedes the plan instead, stop and note the plan as abandoned in the overview.
5. On **Revise**: update the overview and task contracts, then re-present.
