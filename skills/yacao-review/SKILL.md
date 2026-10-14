---
name: yacao-review
description: Validates builder tasks and performs the final review before reporting.
---

# Review

You validate every builder output against the current task contract or spec before reporting to the user.

## Workflow

1. **Inspect** - run `git diff HEAD` plus `git status --porcelain` (untracked files included) to inspect the current builder result; read the modified files and the current task contract
2. **Verify** - cross-reference the diff against the current task's `Goal`, `Changes`, and `Verification commands` (plus `File scope` and `Dependencies` for a planned task), and only the relevant plan-overview context. Do not treat other, unimplemented tasks as missing work.
3. **Validate**:
   - **Task adherence** - does the diff match the current task contract or spec? Nothing extra, nothing missing for this task?
   - **Bugs / regressions** - any obvious logic errors, broken paths, or things that used to work and now won't?
   - **Structure / patterns** - does the code follow existing repo patterns? No unnecessary new abstractions?
   - **Compatibility** - do changed interfaces still work with callers?
   - **Tests / verification** - did the builder run the current task's verification, and is the evidence real command output? If it is missing or unconvincing, run the narrowest check yourself before approving - never approve on an assertion alone. Defer final plan-level checks until all tasks are complete, but never replace per-task verification with them.
   - **Simplicity** - is the change minimal? Does it build on existing project code instead of duplicating it? No unrelated refactors or cleanup disguised as the task?
4. **Attribution** - the base is the previous approved commit (`HEAD`): `git diff HEAD` plus untracked files is the current task's work. When the worktree was already dirty before the first dispatch of this plan, record `git status --porcelain` once before that dispatch and exclude unrelated paths by the task's `File scope` and the builder's `CHANGES`.

## Final review

After every task is approved:

1. Inspect the complete diff since the plan's base commit - `git diff <base>..HEAD`, where `<base>` is the `Base commit` recorded in the plan overview - together with all task results.
2. Compare the implementation with the complete plan overview and every task contract. Confirm that all planned tasks are complete.
3. Run the overview's final verification commands and confirm they pass.
4. If final-review adjustments are needed, identify the affected task, resume it with the same builder session (see the `yacao-implementation` skill), re-review that task, and run the final full-plan review and final verification commands again.
5. Report only after the full-plan review and final verification are approved.

## Verdict

- **Approved** -> stage the task's files explicitly - never `git add -A` - and commit using the repository's conventional style (`feat:`, `fix:`, `docs:`; subject only). The user approves the commit; a task resumed during the final review is committed the same way after re-approval. Then continue: next task, final review, or report.
- **Adjustments needed** for the current task -> delegate each issue to the builder via Task, reusing the same builder session (see the `yacao-implementation` skill); then re-review the current task. After two adjustment rounds on the same task without approval, stop and surface the situation to the user. No new user approval is needed: only scope, approach, or plan changes and genuine blockers go back to the user.
- **Rejected** (plan not implemented, design flaw, scope creep, critical bugs) -> on the planned path, stop and revise the plan overview and task contracts through planning, present the revised plan, obtain user approval, and only then resume implementation. On the trivial path (no overview), it is a material change: re-categorize as Needs planning and enter planning first.
