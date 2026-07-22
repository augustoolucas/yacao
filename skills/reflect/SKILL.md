---
name: reflect
description: Review recent work, find repeated workflow patterns, and suggest reusable skills, agents, commands, config changes, or playbooks. Use when the user asks to learn from past sessions, improve recurring workflows, or identify what should be turned into reusable agent instructions.
---

# Reflect

Reflect is an orchestrator-only workflow for learning from repeated work. It looks back over recent sessions, project notes, and existing agent assets, then recommends the smallest useful improvement: a skill, custom agent, command, configuration change, prompt rule, documentation playbook, or no change.

The goal is to identify real repeated friction and suggest practical improvements with evidence.

## When to Use

Use Reflect when the user asks to:

- run `/reflect` or `/reflect <focus>`;
- run `/reflect --sessions` for session archaeology;
- learn from recent sessions or repeated workflows;
- find work they keep doing manually;
- improve their opencode setup based on actual usage;
- review whether a recurring process should become a reusable playbook;
- turn repeated workflow friction into a safer future default.

Do not use Reflect for ordinary implementation work, one-off debugging, broad architecture review, or speculative agent creation without workflow evidence.

## Session Mode

When the user includes `--sessions` in their reflect command, shift to session archaeology: analyze historical OpenCode sessions across all repos to find repeated patterns and improvement opportunities.

### Session Discovery

1. **Locate the session database.** The opencode session DB is typically at `~/.local/share/opencode/opencode.db`. Delegate to `planner` to confirm the path exists and read the schema.

2. **Query recent sessions.** Delegate to `builder` to run a SQLite query. Use Node (available via nvm) since it ships with built-in SQLite support (Node 22+):

   ```bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && \
   node -e "
   const Database = require('node:sqlite');
   const db = new Database.Sync('$HOME/.local/share/opencode/opencode.db');
   const rows = db.prepare('SELECT id, directory, title, agent, model, time_created, cost, tokens_input, tokens_output FROM session ORDER BY time_created DESC LIMIT 50').all();
   console.log(JSON.stringify(rows, null, 2));
   "
   ```
   Adjust `LIMIT 50` to `--last N` if the user specified a different count.

3. **Load session messages.** For sessions that look promising, query the message table to understand what happened:

   ```bash
   export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && \
   node -e "
   const Database = require('node:sqlite');
   const db = new Database.Sync('$HOME/.local/share/opencode/opencode.db');
   const rows = db.prepare('SELECT data FROM message WHERE session_id = ?').all('<session-id>');
   console.log(JSON.stringify(rows, null, 2));
   "
   ```

### Per-Session Analysis

For each analyzed session, produce a structured summary:

```json
{
  "session": "ses_14de9c68effegtZtlATm42wnz7",
  "project": "/home/user/projects/my-repo",
  "timestamp": "2026-06-10T15:08:45.427Z",
  "goal": "Fix CI failure",
  "success": true,
  "frictions": [
    "Repeated grep to find test file",
    "Three failed test runs before passing"
  ],
  "recommendations": [
    "Create /test-ci command"
  ],
  "duration_minutes": 18,
  "agents_used": ["orchestrator", "builder", "planner"],
  "confidence": 0.85
}
```

**Confidence scoring:**
- 0.9-1.0: Clear success/failure, obvious patterns
- 0.7-0.9: Likely outcome, patterns inferred from tool usage
- 0.5-0.7: Uncertain outcome, limited evidence
- <0.5: Skip or mark as "needs more evidence"

### Storage and Caching

Store session summaries in `~/.config/opencode/reflections/sessions/`.

**Cache logic:**
1. Check if `<session-id>.json` exists in the reflections directory
2. If yes, load it (saves tokens — avoids re-analyzing)
3. If no, analyze the session and save the summary
4. Aggregate across all summaries for the final report

### Aggregation

After analyzing all sessions, aggregate findings:

1. **Group by theme** — sessions with similar friction patterns cluster together
2. **Count frequency** — "42/50 sessions had repeated search before editing"
3. **Rank by impact** — prioritize recommendations that appear most often
4. **Filter noise** — skip one-off issues, focus on repeated patterns
5. **Cross-reference** — check if patterns correlate with specific agents or repos

**Scope categories:**
- **Global** — applies to all repos (pattern seen in >50% of repos)
- **Cross-repo** — applies to specific repos where pattern appears
- **Project-specific** — only relevant to one repo

### Output Format for Session Mode

Return a compact report with scope and confidence:

```text
Session Reflection Report
Analyzing 50 most recent sessions across 8 repos.

Repos analyzed:
- <repo> (<N> sessions)
- ...

Findings
- <pattern>: N/50 sessions across M repos.
  - Scope: global | cross-repo (<repos>) | project-specific (<repo>)
  - Confidence: 0.95
  - Impact: High | Medium | Low

Recommended changes
- <asset>: <purpose>
  - Scope: global | cross-repo (<repos>) | project-specific (<repo>)
  - Confidence: 0.97
  - Estimated time saved: High | Medium | Low

Skipped
- <candidate>: why not worth packaging now.

Needs more evidence
- <candidate>: what would make it actionable.
```

### Error Handling

- Session DB not found → "No opencode session database found at ~/.local/share/opencode/opencode.db. Run opencode in at least one repo first."
- Session DB is empty → "opencode session database is empty. No sessions to analyze."
- Session ID not loadable → Skip with warning: "Session <id> could not be loaded, skipping."
- Session has no messages → Skip: "Session <id> has no messages."
- On any failure, log it, continue with remaining sessions, report skipped count at the end.

## Core Contract

Reflect must be conservative and evidence-driven:

- Inspect existing assets before suggesting new ones
- Prefer recent, repeated, user-visible friction over isolated incidents
- Recommend the smallest useful form
- Treat "create nothing" as a successful result when evidence is weak
- Ask before changing prompts, skills, commands, agents, MCP access, or config
- Avoid duplicating existing assets
- Explain restart requirements for opencode config, prompt, agent, skill, MCP, or plugin changes

## Evidence Sources

Use available evidence in this order:

1. Current conversation and explicit user instructions
2. Project-local guidance and memories: `AGENTS.md`, `.opencode/`, notes, task progress files
3. Existing skills, commands, agents, prompt overrides, and configuration
4. Recent opencode session database if available and safe to inspect
5. External docs only when a proposed workflow depends on a third-party tool or library

Respect privacy and safety boundaries. Do not inspect unrelated personal files, credentials, or private messages.

## Workflow

Reflect can be triggered directly by the user:

```text
/reflect
/reflect release workflow and checks
/reflect --sessions
/reflect --sessions --last 100
```

With no arguments, review recent work broadly. With a focus argument, narrow the review to that workflow area while still checking for existing coverage.

### 1. Inventory Existing Assets

Before proposing anything, identify what already exists:

- installed skills under `~/.config/opencode/skills/`
- custom agents under `~/.config/opencode/agents/`
- custom commands under `~/.config/opencode/commands/`
- prompt overrides and configuration in `opencode.jsonc`
- project playbooks, docs, and local workflow notes

If an existing asset already covers the candidate, recommend extending or using that asset instead of creating a near-duplicate. Delegate the inventory to `planner` with narrow prompts per category.

### 2. Find Repeated Workflow Patterns

Look for repeated signals such as:

- the same command sequence appears across sessions
- the user repeatedly asks for the same review, setup, release, or debugging process
- the same manual research or context-gathering steps keep recurring
- the same specialist routing decision is repeatedly needed
- the same project-specific rule is repeatedly re-explained
- repeated failures happen because an agent lacks a stable instruction, tool, or permission boundary

Strong candidates usually have at least two occurrences, stable inputs, a clear output, and a clear stopping condition.

### 3. Score Candidates

For each candidate, decide:

- **Frequency:** How often has it happened?
- **Cost:** Does it waste meaningful time, context, money, or attention?
- **Risk:** Does inconsistent execution cause bugs, regressions, bad decisions, or unsafe changes?
- **Stability:** Are the inputs and desired output predictable?
- **Coverage:** Is there already an asset that handles it?

Only recommend creating or changing assets when confidence is high.

### 4. Choose the Smallest Useful Form

Pick the least powerful form that solves the repeated problem:

- **Prompt/config rule:** a small behavior change to an existing agent
- **Skill:** reusable workflow guidance for a task shape
- **Command:** a repeatable manual trigger with stable inputs
- **Custom agent:** a distinct specialist with clear delegation rules
- **MCP/tool permission change:** a safe access adjustment for an existing agent
- **Project playbook/doc:** human-readable process guidance when automation is too heavy
- **Skip:** weak, one-off, ambiguous, sensitive, or already-covered work

Avoid creating custom agents when a prompt rule or skill is enough. Avoid skills when a short project playbook is enough. Avoid config changes when the benefit is unclear.

### 5. Propose Before Changing

Unless the user explicitly requested a specific edit, present a concise proposal before writing files or changing config:

```text
Found 2 strong repeated workflows and 1 weak candidate.

Recommended:
- Add a small orchestrator prompt rule for <workflow> because <evidence>.
- Extend existing <skill> instead of creating a new one because <overlap>.

Skip:
- <candidate> because it only appeared once.

Proceed with the proposed edits?
```

When applying changes, preserve existing user settings and prefer narrow, append-only edits. Delegate all file writes to `builder`.

## Output Format

Return a compact report:

```text
Findings
- <workflow>: evidence, frequency/confidence, recommended form.

Recommended changes
- <asset/config/doc>: one-line purpose and why this is the smallest useful form.

Skipped
- <candidate>: why not worth packaging now.

Needs more evidence
- <candidate>: what would make it actionable.
```

If nothing qualifies, say:

```text
No strong repeated workflow found. I would not add or change any reusable assets yet.
```

## Guardrails

- Do not manufacture assets to justify the workflow
- Do not create overlapping skills or agents
- Do not silently change global config, prompts, or permissions
- Do not add broad instructions that make agents more eager, expensive, or invasive without a clear benefit
- Do not overfit to a single session unless the user explicitly asks for that exact reusable workflow
- Do not use private or sensitive material as examples in generated assets
- When config, prompt, agent, skill, MCP, or plugin files change, tell the user: "This should apply on the next opencode run; restart opencode if you need it immediately."
