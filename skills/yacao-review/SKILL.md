---
name: yacao-review
description: Validates builder tasks and performs the final review before reporting.
---

# Review

You validate every builder output against the current task contract or spec before reporting to the user. You own attribution, staging and the commit outcome.

## Workflow

1. **Inspect** - run `git diff <initial-base> -- <relevant-paths>` plus `git status --porcelain --untracked-files=all` to inspect the current builder result; read the modified files, the relevant untracked files and the current task contract
2. **Verify** - cross-reference the diff against the current task's `Goal`, `Changes`, and `Verification commands` (plus `File scope` and `Dependencies` for a planned task), and only the relevant plan-overview context. Do not treat other, unimplemented tasks as missing work.
3. **Validate**:
   - **Task adherence** - does the diff match the current task contract or spec? Nothing extra, nothing missing for this task?
   - **Bugs / regressions** - any obvious logic errors, broken paths, or things that used to work and now won't?
   - **Structure / patterns** - does the code follow existing repo patterns? No unnecessary new abstractions?
   - **Compatibility** - do changed interfaces still work with callers?
   - **Tests / verification** - did the builder run the current task's verification, and is the evidence real command output? If it is missing or unconvincing, run the narrowest check yourself before approving - never approve on an assertion alone. Defer final plan-level checks until all tasks are complete, but never replace per-task verification with them.
   - **Simplicity** - is the change minimal? Does it build on existing project code instead of duplicating it? No unrelated refactors or cleanup disguised as the task?
4. **Attribution** - attribute with `git diff <initial-base> -- <relevant-paths>` plus `git status --porcelain --untracked-files=all`, reading relevant untracked files separately. `<initial-base>` is the recorded fixed initial review base, not the previous approved commit (`HEAD`). This cumulative diff includes committed, staged and unstaged tracked changes and is not exclusively the current task's work: do not describe it as the current task's changes, and do not classify earlier approved changes as current-task scope creep - while still detecting regressions that affect earlier tasks. Actual changed paths alone do not prove exclusive attribution.

## Final review

After every task is approved:

1. Inspect the complete diff since the fixed initial review base - `git diff <initial-base>` - plus the full `git status --porcelain --untracked-files=all`, reading relevant untracked files separately, together with all task results. Record and exclude unrelated work without hiding earlier plan defects.
2. Compare the implementation with the complete plan overview, every task contract and the original user acceptance criteria recorded in the overview. Confirm that all planned tasks are complete.
3. Run the overview's final verification commands and confirm they pass.
4. If final-review adjustments are needed, identify the affected task, resume it with the same builder session (see the `yacao-implementation` skill), re-review that task, and run the final full-plan review and final verification commands again.
5. Report only after the full-plan review and final verification are approved.

A materially incorrect plan requires replan and user approval - not a declaration of acceptance.

## Verdict

- **Approved** -> the task is validated and may advance; the advancement criteria live in the **Progression** section of the `yacao-implementation` skill. Continue: next task, final review, or report.

  When a commit was requested, before committing verify the expected HEAD, ownership, intended scope and existing staging; stage only verified task-owned changes and only when staging is uncontaminated - never `git add -A`; commit using the repository's conventional style (`feat:`, `fix:`, `docs:`; subject only); inspect the entire staged diff before committing; after success verify the new HEAD and the resulting commit diff, and update the expected HEAD only for that authorized commit. Refuse contamination or a permission rejection without modifying staging or work and without retrying around the rejection: ask whether to continue without commits or stop. A command failure stops and reports. Refused or failed requested work stays pending, not completed, unless an explicit continuation-without-commits choice is recorded for a refusal. An approved verified no-op needs no empty commit.

  If the user switches to per-task commits mid-workflow, surface how the accumulated approved changes will be handled: never label a combined commit as the current task's only, never force hunk splitting, and never silently absorb unrelated staged work into a commit. A task resumed during the final review is committed the same way after re-approval.
- **Adjustments needed** for the current task -> delegate each issue to the builder via the delegation tool, reusing the same builder session (see the `yacao-implementation` skill); then re-review the current task. After two adjustment rounds on the same task without approval, stop and surface the situation to the user. No new user approval is needed: only scope, approach, or plan changes and genuine blockers go back to the user.
- **Rejected** (plan not implemented, design flaw, scope creep, critical bugs) -> on the planned path, stop and revise the plan overview and task contracts through planning, present the revised plan, obtain user approval, and only then resume implementation. On the trivial path (no overview), it is a material change: re-categorize as Needs planning and enter planning first.
