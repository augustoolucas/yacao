---
name: yacao-implementation
description: Guides ordered task dispatch, builder session reuse, and builder response handling.
---

# Implementation

You delegate code changes to **builder** via the delegation tool - you construct the task, hand it off, and handle the response. You own the commit preference, the preflight, dispatch, the plan overview ledger and progression. Capture the returned session reference for potential follow-up reuse.

> **Delegation tool terminology.** The delegation tool is host-specific: V1 exposes it as `Task` and returns `task_id`; V2 exposes it as `subagent` and returns `sessionID`. This skill calls it the delegation tool and its return value the session reference. Record the actual returned reference and never fabricate one.

## Commit preference

Default to leaving the builder's changes uncommitted and do not ask a preference question. Honor explicit user instructions instead:

- A per-task commit request commits each approved task.
- A final-only request commits once at the end; it never permits intermediate commits. A request to commit when finished is not authorization for intermediate commits.

A preference change needs no reapproval of an otherwise unchanged approach. Record the preference as described in **Overview ledger**.

## Preflight

Before the first dispatch, require a valid Git HEAD, then record the fixed initial review base and a separate expected HEAD (see **Overview ledger**). Reject ambiguous pre-existing changes that overlap the intended task targets when ownership is uncertain; record and exclude unrelated work.

In the default noncommit path, unrelated staged and unstaged work is permitted - never stage or commit there, and preserve user work and the index contents. Later tasks may modify already-approved dirty paths; do not re-apply a blanket clean-target gate to those approved changes.

Stop on ambiguous ownership or unexpected history movement; advance expected HEAD only for authorized commits. Never reset, unstage, stash or discard user work to repair uncertainty.

## Trivial tasks

Send the builder a direct spec containing:

- **Goal** - what to accomplish
- **Context** - useful prior decisions and relevant history
- **Changes** - the precise edits. Make sure to follow KISS, DRY and YAGNI principles.
- **File scope** - files the task may touch
- **Verification commands** - what to run (omit only when nothing needs to be verified)

## Needs planning

Follow the approved plan overview's ordered task list, one builder at a time:

1. Read the current task contract at `.opencode/plans/plan-<slug>/tasks/task-XX-<name>.md`.
2. Send the builder the task's `Goal`, `Changes`, `File scope`, `Dependencies`, and `Verification commands`, plus concise task-relevant invariants, rationale, risks and prior decisions - nothing else. Never send the full plan overview or future task contracts.
3. Keep the ledger current (see **Overview ledger**). Start the next task only after the current task's review is approved - in a new session or after compaction, reconstruct progress, the ledger and the review base from the overview and `git log --oneline`, never from memory. After the last task, run the final full-plan review (see the `yacao-review` skill).

## Builder status routing

For a builder response:

- `complete` -> invoke the `yacao-review` flow for the current task.
- `partial` -> hold the current task, reuse the same builder session to complete it, and do not advance to another task. Repeated `partial` results that bring no measurable progress are surfaced as a blocker without resetting the review-adjustment cap; a productive partial does not consume that allowance merely for being partial.
- `blocked` -> stop, surface the blocker, and do not advance.
- `escalate` -> read `GAPS`; resolve it from the plan overview or codebase when you can, otherwise surface it to the user; do not advance.

A blocked or escalated task may resume without a new plan approval only if the approved task and approach remain unchanged; a material plan, approach, or scope change goes back to planning for a revised, approved plan. On the trivial path, where no overview exists, a material change is categorized as **Needs planning** and enters the planning flow first.

If the user abandons or supersedes the plan during execution, stop, record the plan as abandoned in the overview, and do not dispatch further tasks.

## Progression

Advance only when implementation is complete, the verification evidence is satisfactory and review approves. Default approval alone permits advancing: an approved task with uncommitted changes is not a no-op. When a task commit was requested it must complete, or the user must explicitly choose to continue without commits. A final-only commit happens after full-plan approval (planned work) or after complete task review (trivial work), using the same safe-commit checks as a per-task commit.

If the user switches to per-task commits mid-workflow, the commit composition and labeling rules are in the `yacao-review` skill.

## Overview ledger

Maintain the ledger in the existing plan overview; trivial work has no ledger, so its preference, fixed initial review base and expected HEAD stay in the direct spec or conversation. Never add a new ledger, snapshots, hidden commits, stashes or a checkpoint system. Record the commit preference, the fixed initial review base and the expected HEAD, and for each task: state, the actual builder session reference, the unsuccessful review-adjustment count, the actual changed paths and the commit outcome (`not requested`, `pending`, the hash, `refused`, `failed`, `no-op`).

## Recovery

After a new session or compaction, resume an approved uncommitted task as approved: it is neither a missing commit nor a no-op. Preserve already-approved dirty paths for later tasks. Track a pending commit request, a refusal plus the user's explicit continue-without-commits or stop choice, a failure and a verified no-op distinctly. The preflight gates still apply (see **Preflight**).

## Reusing the builder session

- Always reuse the builder session for corrections to the same task.
- Reuse it for related or dependent tasks when the previous context helps.
- Start a fresh session for unrelated tasks.
