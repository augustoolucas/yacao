---
name: implementation
description: Use when delegating code changes to the builder agent. Covers how to construct the spec, capture the task_id, and handle the builder's response.
---

# Implementation

The orchestrator invokes this skill to delegate code changes to **builder** via the **Task** tool. The orchestrator does not implement code itself - it constructs the spec, hands it off, and handles the response.

## When to invoke

- Any task that needs code changes (trivial or needs-planning)
- Always after the spec is ready - never with a vague ask

## Trivial tasks

1. Task → builder with a direct spec containing:
   - **Objective** - what to accomplish
   - **Exact changes** - the precise edits
   - **Verification commands** - what to run
2. Builder returns `STATUS` / `CHANGES` / `VERIFIED` / `GAPS` - capture the `task_id` for potential follow-up reuse
3. On `complete`: proceed to review. On `partial` / `blocked` / `escalate`: handle per builder's `GAPS`

## Needs planning

1. Task → builder with `.opencode/plans/plan-<slug>.md`
2. Builder follows the plan - capture the `task_id` for potential follow-up reuse
3. On `complete`: proceed to review. On `partial` / `blocked` / `escalate`: handle per builder's `GAPS`

## Reusing the builder session

Pass the previous builder's `task_id` when the new task:

- Touches the same files the builder just modified
- Follows up on review feedback
- Continues or builds on a prior implementation

This preserves context and avoids redundant file reads.

Start a **fresh session** (no `task_id`) when the new task operates on separate parts of the codebase with no shared state or dependencies.

## Fan-out (parallel builders)

When the work partitions into independent file sets, you MAY issue multiple parallel `Task → builder` calls in the same turn instead of one. Each runs in its own session and returns independently. Rules:

- No shared files between parallel tasks. Overlap ⇒ serialize.
- One plan, several dispatches - name each branch in the plan, then dispatch each as a separate Task call.
- Review each output separately before committing. The `git diff` after parallel calls is the union; verify no conflicts.
- One commit at the end, message naming every part.

Do not fan out for trivial work or for anything with shared state.
