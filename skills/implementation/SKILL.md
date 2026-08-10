---
name: implementation
description: Guides task-contract dispatch in sequential or parallel waves, task_id reuse, and builder response handling.
---

# Implementation

You delegate code changes to **builder** via the **Task** tool - you construct the spec, hand it off, and handle the response.

## Trivial tasks

1. Task → builder with a direct spec containing:
   - **Goal** - what to accomplish
   - **Changes** - the precise edits
   - **Verification commands** - what to run
2. Builder returns `STATUS` / `CHANGES` / `VERIFIED` / `GAPS` - capture the `task_id` for potential follow-up reuse
3. Apply the builder status routing below; the trivial path still invokes its existing review on `complete`.

## Builder status routing

For a builder response on either the trivial or Needs planning path:

- `complete` → invoke per-task review for a planned task (or the existing
  implementation review for a trivial task).
- `partial` → hold the current task, reuse the same `task_id` to complete it,
  and do not advance to another task or wave.
- `blocked` → stop the current wave, surface the blocker, and do not advance.
- `escalate` → read `GAPS`, surface the requested decision to the user, and do
  not advance.

A blocked or escalated situation may resume without a new plan approval only if
the approved task and approach remain unchanged. A material plan, approach, or
scope change requires planning to revise the overview and task contracts,
present the revised plan, and obtain user approval before implementation
resumes.

Adjustments needed for the current task reuse the same `task_id`, require no
new user approval, and return to review after the adjustment. A rejected result
or a blocker/escalation that changes the approved approach or scope stops
implementation and returns to planning for a revised, approved plan. Normal
tasks and waves do not require intermediate approvals.

## Needs planning

1. Read the approved plan overview and its ordered task list. Group only
   explicitly independent tasks with no shared files, state, or dependencies
   into the same wave. Serialize tasks whenever independence is uncertain or
   any overlap exists.
2. Read and use the current task contract at
   `.opencode/plans/plan-<slug>/tasks/task-XX-<name>.md`. Treat
   `Independence` only as orchestrator metadata for grouping waves, not builder
   input. Send the builder only `Goal`, `Changes`, `File scope`, `Dependencies`,
   and `Verification commands`. Never send the full plan overview or future
   task contracts.
3. Before each builder dispatch, note the current worktree/diff state. Then
   Task → builder once for a sequential task, or once per explicitly
   independent task in the current parallel wave. Capture one `task_id` per
   builder branch.
4. After the builder responds, compare the worktree with the state immediately
   before that builder, the task file scope, and the builder's `CHANGES` to
   attribute only the latest builder's additions. Do not treat `git diff HEAD`
   alone as the current builder result because it can include pre-existing or
   previously approved changes.
5. Apply the status routing above. Review every `complete` task result
   separately. Start the next task or wave only after
   all current-task reviews are approved.
6. After every task in every wave is approved, run the final full-plan review
   against the complete overview and all task results, then run the overview's
   final verification commands before reporting.
7. If the final full-plan review needs adjustments, identify the affected task,
   resume it with its existing `task_id`, re-review that task, and run the final
   full-plan review and final verification commands again.
8. Reuse each branch's `task_id` for related later tasks and review
   adjustments on that branch. Keep separate task sessions for independent
   parallel branches.

## Reusing the builder session (both paths)

Reuse the previous builder's `task_id` according to this policy:

- Always reuse it for corrections to the same task.
- Reuse it for related or dependent tasks when the previous context helps.
- Start a fresh session for independent tasks and parallel branches.

This preserves context and avoids redundant file reads.

Start a **fresh session** (no `task_id`) when the new task operates on separate parts of the codebase with no shared files, state, or dependencies.

## Fan-out (parallel builders)

When the approved plan overview explicitly marks tasks as independent, you MAY
issue multiple parallel `Task → builder` calls for those tasks in the same
wave.
Each runs in its own session and returns independently. Rules:

- Parallel tasks must have no shared files, state, or dependencies. Overlap or
  uncertainty ⇒ serialize.
- Name each independent task or branch in the plan overview and dispatch each as a
  separate `Task → builder` call.
- Each branch receives only its own task contract and has its own
   branch-specific `task_id`.
- Review every parallel branch separately, then wait for all task reviews to be
  approved before dispatching the next wave.
- Reuse a branch's `task_id` for related follow-up tasks or adjustments; never
  reuse one independent branch's session for another branch.

Do not fan out for trivial work or for anything with shared files, state, or
dependencies.
