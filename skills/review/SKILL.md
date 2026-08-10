---
name: review
description: Validates each builder task and performs the final full-plan review before reporting.
---

# Review

You validate every builder output against the plan or spec before reporting to the user.

## Workflow

1. **Inspect** - use the lightweight pre-dispatch worktree/diff note and run
   `git diff` to inspect the current builder result; read the modified files
   and the current task contract
2. **Verify** - cross-reference the diff against the current task's `Goal`,
   `Changes`, `File scope`, `Dependencies`, and `Verification commands`, plus
   only the relevant plan-overview context. For a parallel wave, consult the
   overview's `Independence` metadata; it is not part of the task contract or
   builder input. Do not treat other, unimplemented tasks as missing work.
3. **Validate**:
   - **Task adherence** - does the diff match the current task contract or spec? Nothing extra, nothing missing for this task?
   - **Bugs / regressions** - any obvious logic errors, broken paths, or things that used to work and now won't?
   - **Structure / patterns** - does the code follow existing repo patterns? No unnecessary new abstractions?
   - **Compatibility** - do changed interfaces still work with callers?
   - **Tests / verification** - did the builder run the current task's verification? Did it actually pass? Defer final plan-level checks until all tasks are complete, but never replace per-task verification with them.
   - **Simplicity** - is the change minimal? Does it build on existing project code instead of duplicating it? No unrelated refactors or cleanup disguised as the task?
4. For every parallel wave, review each branch separately against its own task
   contract and verify that the branches do not violate the plan overview's
   independence constraints. Do not approve the wave until every task review
   passes.
5. Attribute only the latest builder's additions by comparing the current
   worktree with the state immediately before that builder, the task file scope,
   and the builder's `CHANGES`. Do not treat `git diff HEAD` alone as the
   current builder result because it can include pre-existing or previously
   approved changes.

## Final full-plan review (Needs planning)

After every task in every wave is approved:

1. Inspect the complete diff and all task results together.
2. Compare the implementation with the complete plan overview and every task
   contract. Confirm that all planned tasks are complete without requiring a
   builder to have known the larger plan.
3. Run the overview's final verification commands and confirm they pass.
4. If final-review adjustments are needed, identify the affected task, resume
   it with its existing `task_id`, re-review that task, and run the final
   full-plan review and final verification commands again.
5. Report only after the full-plan review and final verification are approved.

## Verdict

- **Approved** → mark the current task or branch approved; the orchestrator
  may dispatch the next task or wave only after every current-wave review is
  approved. After all waves pass, perform the final full-plan review.
- **Adjustments needed** for the current task → delegate each issue to the
  same builder branch via Task, reusing its `task_id`; no new user approval is
  needed, then re-review the current task.
- **Rejected** (plan not implemented, design flaw, scope creep, critical bugs)
  or a blocker/escalation that changes the approved approach or scope → stop,
  revise the plan overview and task contracts through planning, present the
  revised plan, obtain user approval, and only then resume implementation.
- A blocker or escalation resolved without changing the approved task may
  resume with the same `task_id` and no new approval. Normal tasks and waves do
  not require intermediate approvals.
