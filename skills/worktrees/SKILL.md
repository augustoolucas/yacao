---
name: worktrees
description: Manage Git worktrees as isolated coding lanes for complex, risky, or parallel work. Orchestrator-only protocol — the orchestrator plans, delegates, validates, integrates, and cleans up. Subagents (builder, planner) run scoped to the worktree path.
---

# Worktrees — isolated coding lanes

## Core contract

- **Orchestrator owns the entire lifecycle.** Planning, delegation, validation, integration, and cleanup stay with the orchestrator. Subagents never touch worktree management.
- **All worktrees live under `.opencode/worktrees/<slug>/`.** One directory per lane, each on a branch named `orch/<slug>`.
- **State tracked in `.opencode/worktrees.json`.** A JSON manifest that the orchestrator reads and writes: slug, branch, path, base commit, purpose, status (active/merged/pruned), creation date.

## Safety gates — always enforced

Before ANY destructive or state-changing worktree operation, the orchestrator MUST:

1. **Run the pre-flight checklist:**
   - Confirm current branch is clean (no uncommitted changes) — `git status --porcelain`
   - List existing worktrees — `git worktree list`
   - Check that the slug is not already in the manifest and no worktree exists at the target path
   - Verify the base branch/commit exists

2. **Get explicit user approval** for these operations:
   - `git worktree add` (creating a new lane)
   - `git worktree remove` (deleting a lane)
   - Merging a worktree branch into the base branch
   - Deleting a merged worktree branch (`git branch -D`)
   - Any destructive command (`git reset --hard`, `git clean -fd`)

3. **Never silently skip approval.** The orchestrator prompts with: what will happen, the exact command, and the expected outcome. User must explicitly approve.

## Ignore file setup

Add to `.gitignore` (root of the repo being worked on, NOT the opencode config repo):

```
# >>> opencode:worktrees
.opencode/worktrees/
# <<< opencode:worktrees
```

The orchestrator must verify this block exists before creating the first worktree. If absent, delegate its addition to `builder` and wait for completion before proceeding.

## Phase 1 — Plan & Setup

1. **Analyze the task.** Is it risky, multi-file, parallelizable, or experimental? If yes, propose a worktree. If it's a trivial single-file change, skip worktrees and delegate directly to `builder` in the main checkout.

2. **Choose a slug.** Short, descriptive, kebab-case. Examples: `refactor-auth`, `fix-parser-leak`, `spike-graphql`.

3. **Run pre-flight checks** (see Safety gates above).

4. **Ask for approval:**
   ```
   Create worktree lane `orch/<slug>` from `main`?
   Path: .opencode/worktrees/<slug>/
   Purpose: <one-line description>
   ```

5. **On approval**, delegate to `builder`:
   ```
   git worktree add -b orch/<slug> .opencode/worktrees/<slug> <base-branch>
   ```
   Use `workdir` parameter set to the repo root.

6. **Record in manifest.** Delegate to `builder` to create or update `.opencode/worktrees.json`:
   ```json
   {
     "lanes": {
       "<slug>": {
         "branch": "orch/<slug>",
         "path": ".opencode/worktrees/<slug>",
         "base": "<base-branch>",
         "purpose": "<description>",
         "status": "active",
         "created": "<ISO timestamp>"
       }
     }
   }
   ```

## Phase 2 — Execution & Delegation

All subagent work for this lane runs scoped to the worktree path.

1. **Exploration** — delegate to `planner` with `workdir` set to the worktree path. Keep prompts narrow: specific files, specific questions.

2. **Implementation** — delegate to `builder` with `workdir` set to the worktree path. One slice per delegation. Provide the standard 5-part spec (objective, files, interfaces, constraints, verification).

3. **Parallel work** — when multiple lanes are active and tasks are independent, spawn `builder` tasks across different worktrees in parallel. Never parallelize tasks that touch the same file or depend on each other.

4. **Verification** — after each implementation slice, delegate to `builder` scoped to the worktree: `npm run lint`, `npm test`, type-check, etc.

## Phase 3 — Integration & Validation

Once all slices in a lane are complete:

1. **Run final validation** in the worktree — full test suite, lint, build.

2. **Review the diff:**
   ```
   git diff <base-branch>...orch/<slug>
   ```
   Delegate to `reviewer` with the diff and the original plan. The reviewer checks correctness, scope creep, and regression risk.

3. **Show the diff to the user.** Summarize what changed, files touched, and the reviewer's verdict. Ask for merge approval.

## Phase 4 — Cleanup & Pruning

1. **On merge approval**, delegate to `builder` (from the main checkout, NOT the worktree):
   ```
   git merge orch/<slug>
   ```
   If there are conflicts, report them and ask the user how to proceed. Do NOT auto-resolve.

2. **Confirm merge succeeded** — verify the merge commit exists and the diff is applied.

3. **Ask for cleanup approval:**
   ```
   Lane `orch/<slug>` merged. Remove worktree and branch?
   Path: .opencode/worktrees/<slug>/
   ```

4. **On approval**, delegate to `builder`:
   ```
   git worktree remove .opencode/worktrees/<slug>
   git branch -D orch/<slug>
   ```

5. **Update manifest** — set lane status to `pruned`, record pruned timestamp.

## When to use worktrees

- Risky refactoring across multiple files
- Parallel independent tasks (different features, different files)
- Experimental spikes or proof-of-concept work
- Complex dependency upgrades
- Any task where you want the option to discard without touching main

## When NOT to use worktrees

- Single-file trivial changes — direct `builder` delegation is faster
- Repos with complex submodule states — worktrees add complexity
- Changes that require the exact main checkout environment (e.g., config that only exists there)
- Quick fixes where the overhead of lane setup exceeds the task itself

## Manifest schema

`.opencode/worktrees.json`:
```json
{
  "lanes": {
    "<slug>": {
      "branch": "orch/<slug>",
      "path": ".opencode/worktrees/<slug>",
      "base": "main",
      "purpose": "Refactor auth module",
      "status": "active|merged|pruned",
      "created": "2026-07-19T12:00:00Z",
      "pruned": "2026-07-19T14:00:00Z"
    }
  }
}
```

The orchestrator reads this file before proposing new lanes to avoid slug collisions. It updates status on merge and prune.
