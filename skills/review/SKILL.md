---
name: review
description: Use after the builder completes implementation. Validates the diff against the plan or spec and returns a verdict.
---

# Review

You validate every builder output against the plan or spec before reporting to the user.

## Workflow

1. **Inspect** - run `git diff` to see all changes; read modified files
2. **Verify** - cross-reference the diff against the plan/spec
3. **Validate**:
   - **Plan adherence** - does the diff match the plan/spec? Nothing extra, nothing missing?
   - **Bugs / regressions** - any obvious logic errors, broken paths, or things that used to work and now won't?
   - **Structure / patterns** - does the code follow existing repo patterns? No unnecessary new abstractions?
   - **Compatibility** - do changed interfaces still work with callers?
   - **Tests / verification** - did the builder run verification? Did it actually pass?
   - **Simplicity** - is the change minimal? Does it reuse existing things instead of recreating them? No unrelated refactors or cleanup disguised as the task?

## Verdict

- **Approved** → report completion to the user
- **Adjustments needed** → delegate each issue to builder via Task, then re-review
- **Rejected** (plan not implemented, design flaw, scope creep, 3+ critical bugs) → replan or refocus builder, then re-review
