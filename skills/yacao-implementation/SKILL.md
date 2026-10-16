---
name: yacao-implementation
description: Guides ordered task dispatch, builder session reuse, and builder response handling.
---

# Implementation

You delegate code changes to **builder** via the delegation tool - you construct the task, hand it off, and handle the response. Capture the returned session reference for potential follow-up reuse.

## Commit preference

Leave changes uncommitted unless the user requests commits. Distinguish commits after each approved task from a single commit after final review; a request to commit when finished does not authorize intermediate commits.

## Preflight

Before the first dispatch, inspect existing work and preserve user changes and staging; clarify ambiguous overlap before proceeding. If a valid Git HEAD exists, record it as the fixed review base; otherwise review resulting files without requiring or initializing Git. Do not stage changes unless a commit was requested.

## Trivial tasks

Send the builder a direct spec containing:

- **Goal** - what to accomplish
- **Context** - useful prior decisions and relevant history
- **Changes** - the precise edits. Make sure to follow KISS, DRY and YAGNI principles.
- **File scope** - files the task may touch
- **Verification commands** - what to run (omit only when nothing needs to be verified)

## Needs planning

Follow the approved plan overview's ordered task list, one builder at a time:

1. Read the current task contract at the path listed in the approved plan overview.
2. Send the builder the task's `Goal`, `Changes`, `File scope`, `Dependencies`, and `Verification commands`, plus concise task-relevant invariants, rationale, risks and prior decisions - nothing else. Never send the full plan overview or future task contracts.
3. Review each result before advancing. Complete any requested task commit first unless the user chooses to continue without commits; final-only commits wait until the final review. After the last task, run the `yacao-review` final review.

## Builder status routing

For a builder response:

- `complete` -> invoke the `yacao-review` flow for the current task.
- `partial` -> hold the current task, reuse the same builder session to complete it, and do not advance to another task. Surface repeated lack of progress as a blocker.
- `blocked` -> stop, surface the blocker, and do not advance.
- `escalate` -> read `GAPS`; resolve it from the plan overview or codebase when you can, otherwise surface it to the user; do not advance.

A blocked or escalated task may resume without a new plan approval only if the approved task and approach remain unchanged; a material plan, approach, or scope change requires a revised, approved plan. On the trivial path, a material change becomes **Needs planning** and enters the planning flow first.

If the user abandons or supersedes the plan during execution, stop, record the plan as abandoned in the overview, and do not dispatch further tasks.

## Progress in the overview

Keep the approved tasks, useful builder session references, adjustment counts, commit preference and any review base in the existing overview so work can continue. For trivial tasks, retain this context in the conversation. Check the recorded progress against the current work before resuming; clarify uncertainty rather than inventing progress.

## Reusing the builder session

- Always reuse the builder session for corrections to the same task.
- Reuse it for related or dependent tasks when the previous context helps.
- Start a fresh session for unrelated tasks.
