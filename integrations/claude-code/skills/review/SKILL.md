---
name: "review"
description: "Validates yacao:builder tasks and performs the final review before reporting."
---

# Review

You validate every yacao:builder output against the current task contract or spec before reporting to the user. You own staging and the commit outcome.

## Workflow

1. **Inspect** - when a valid initial base applies, run `git diff <initial-base> -- <relevant-paths>` plus `git status --porcelain --untracked-files=all` and read the relevant untracked files separately; without Git or a base, inspect the resulting files directly - never block on absent Git. In both cases read the modified files and the current task contract.
2. **Verify** - cross-reference the result against the current task's `Goal`, `Changes`, and `Verification commands` (plus `File scope` and `Dependencies` for a planned task), and only the relevant plan-overview context. Do not treat other, unimplemented tasks as missing work.
3. **Validate**:
   - **Task adherence** - does the result match the current task contract or spec? Nothing extra, nothing missing for this task?
   - **Bugs / regressions** - any obvious logic errors, broken paths, or things that used to work and now won't?
   - **Structure / patterns** - does the code follow existing repo patterns? No unnecessary new abstractions?
   - **Compatibility** - do changed interfaces still work with callers?
   - **Tests / verification** - did the yacao:builder run the current task's verification, and is the evidence real command output? If it is missing or unconvincing, run the narrowest check yourself before approving - never approve on an assertion alone. Defer final plan-level checks until all tasks are complete, but never replace per-task verification with them.
   - **Simplicity** - is the change minimal? Does it build on existing project code instead of duplicating it? No unrelated refactors or cleanup disguised as the task?

Classify each finding before acting on it. A **mandatory** finding states the location, the concrete consequence, and the violated requirement or correctness/safety property - including a defect the plan did not anticipate. An **optional** suggestion lacks such a violation: it does not block approval, is not dispatched automatically, and does not consume a correction round; only an explicit user request makes it work, under normal scope approval. Never label a real defect optional.

The diff is cumulative, not exclusively the current task: distinguish user work and earlier approved changes from the current result, and check for regressions across tasks. Inspect the code and verification evidence rather than relying on the yacao:builder summary.

## Final review

After every task is approved:

1. Inspect the complete set of task results with the same file/diff/status method. Record and exclude unrelated work without hiding earlier plan defects.
2. Compare the implementation with the complete plan overview, every task contract and the original user acceptance criteria recorded in the overview. Confirm that all planned tasks are complete.
3. Run the overview's final verification commands and confirm they pass.
4. If final-review adjustments are needed, identify the affected task, resume it with the same yacao:builder session (see the `yacao:implementation` skill), correct it through the **Adjustments needed** route in the Verdict, and run the final full-plan review and final verification commands again.
5. Report only after the full-plan review and final verification are approved.

A materially incorrect plan requires replan and user approval - not a declaration of acceptance.

## Verdict

- **Approved** -> the task is validated; continue with the advancement rule in the `yacao:implementation` skill (next task, final review, or report).

  When a commit was requested: stage only verified task-owned changes, inspect the whole staged diff and preserve unrelated work, follow the user's instructions and the target repository's conventions, and verify the commit succeeded. A failure stops and reports. A refusal preserves the current staging as-is - not rolled back or retried - and asks whether to continue without commits or stop. Never make an empty no-op commit.
- **Adjustments needed** for the current task -> group the mandatory findings into one correction dispatch to the yacao:builder via the Agent tool, reusing the same yacao:builder session (see the `yacao:implementation` skill); the dispatch plus its re-review is one correction round. A productive initial `partial` completion handled by the Implementation flow is not a review adjustment, and a `partial` reply within a started round does not reset its count. After two unsuccessful correction rounds on the same task - counted across continuation and final review - stop and surface the situation to the user. No new user approval is needed: only scope, approach, or plan changes and genuine blockers go back to the user.
- **Rejected** (the approved plan or approach is invalid, or a scope change is required) -> stop and obtain approval for a revised plan before continuing; on the trivial path enter planning first.
