---
name: yacao-implementation
description: Guides ordered task dispatch, task_id reuse, and builder response handling.
---

# Implementation

You delegate code changes to **builder** via the **Task** tool - you construct the task, hand it off, and handle the response. Before every dispatch, note the worktree/diff state, and capture the returned `task_id` for potential follow-up reuse.

## Trivial tasks

Send the builder a direct spec containing:

- **Goal** - what to accomplish
- **Context** - useful prior decisions and relevant history
- **Changes** - the precise edits. Make sure to follow KISS, DRY and YAGNI principles.
- **Verification commands** - what to run (omit only when nothing needs to be verified)

## Needs planning

Follow the approved plan overview's ordered task list, one builder at a time:

1. Read the current task contract at `.opencode/plans/plan-<slug>/tasks/task-XX-<name>.md`.
2. Send the builder the task's `Goal`, `Changes`, `File scope`, `Dependencies`, and `Verification commands`, plus any useful context from prior decisions - nothing else. Never send the full plan overview or future task contracts.
3. Start the next task only after the current task's review is approved. After the last task, run the final full-plan review (see the `yacao-review` skill).

## Builder status routing

For a builder response:

- `complete` -> invoke the `yacao-review` flow for the current task.
- `partial` -> hold the current task, reuse the same `task_id` to complete it, and do not advance to another task.
- `blocked` -> stop, surface the blocker, and do not advance.
- `escalate` -> read `GAPS`; resolve it from the plan overview or codebase when you can, otherwise surface it to the user; do not advance.

A blocked or escalated task may resume without a new plan approval only if the approved task and approach remain unchanged; a material plan, approach, or scope change goes back to planning for a revised, approved plan. On the trivial path, where no overview exists, a material change is categorized as **Needs planning** and enters the planning flow first.

## Reusing the builder session

- Always reuse the `task_id` for corrections to the same task.
- Reuse it for related or dependent tasks when the previous context helps.
- Start a fresh session for unrelated tasks.
