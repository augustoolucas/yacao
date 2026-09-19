---
name: yacao-review
description: Validates builder tasks and performs the final review before reporting.
---

# Review

You validate every builder output against the current task contract or spec before reporting to the user.

## Workflow

1. **Inspect** - run `git diff` to inspect the current builder result; read the modified files and the current task contract
2. **Verify** - cross-reference the diff against the current task's `Goal`, `Changes`, and `Verification commands` (plus `File scope` and `Dependencies` for a planned task), and only the relevant plan-overview context. Do not treat other, unimplemented tasks as missing work.
3. **Validate**:
   - **Task adherence** - does the diff match the current task contract or spec? Nothing extra, nothing missing for this task?
   - **Bugs / regressions** - any obvious logic errors, broken paths, or things that used to work and now won't?
   - **Structure / patterns** - does the code follow existing repo patterns? No unnecessary new abstractions?
   - **Compatibility** - do changed interfaces still work with callers?
   - **Tests / verification** - did the builder run the current task's verification? Did it actually pass? Defer final plan-level checks until all tasks are complete, but never replace per-task verification with them.
   - **Simplicity** - is the change minimal? Does it build on existing project code instead of duplicating it? No unrelated refactors or cleanup disguised as the task? Does it follow KISS, DRY and YAGNI principles?
4. Attribute only the latest builder's additions by comparing the worktree with the state noted before dispatch, the task's `File scope`, and the builder's `CHANGES`. Do not treat `git diff HEAD` alone as the current builder result because it can include pre-existing or previously approved changes.

## Final review

After every task is approved:

1. Inspect the complete diff and all task results together.
2. Compare the implementation with the complete plan overview and every task contract. Confirm that all planned tasks are complete.
3. Run the overview's final verification commands and confirm they pass.
4. If final-review adjustments are needed, identify the affected task, resume it with its existing `task_id`, re-review that task, and run the final full-plan review and final verification commands again.
5. Report only after the full-plan review and final verification are approved.

## Verdict

- **Approved** -> mark the current task approved; the orchestrator may dispatch the next task only after this review is approved. After all tasks pass, perform the final full-plan review.
- **Adjustments needed** for the current task -> delegate each issue to the builder via Task, reusing its `task_id`; no new user approval is needed, then re-review the current task.
- **Rejected** (plan not implemented, design flaw, scope creep, critical bugs) -> stop, revise the plan overview and task contracts through planning, present the revised plan, obtain user approval, and only then resume implementation.
