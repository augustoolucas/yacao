# Changelog

## v0.5.0-rc (2026-10-14)

- Commit every approved task behind your approval: the orchestrator commits, the builder
  no longer does.
- Cap the adjustment loop at two rounds per task, and require real command output as review
  evidence before approving.
- Route a rejected plan, an abandoned plan, and a refused commit back to you instead of
  letting the flow continue.
- Reword the Trivial criterion and the Clarify section of the orchestrator prompt.
- Tighten the git guards: destructive and commit-creating commands (merge, rebase,
  cherry-pick, revert, am, pull, reset) ask for approval, read-only stash commands do not,
  and the builder's commit denies always win.
- Isolate the builder: no `general` subagent, no YACAO skills, no reading plan files.
- Make the update check notify-only: it no longer edits your configuration, and a
  pre-release no longer freezes it.
- Replace the V2 permission scaffold instead of prepending to it, and always force the
  agent mode so a builder never stays primary.
- Add a zero-dependency `node --test` suite for the plugin helpers and the shell rule order.
- Document the commit flow, the per-agent permission overrides, and the guardrails caveat.

## v0.4.4 (2026-10-13)

- Keep the orchestrator focused on the question at hand: explore with the tools when that
  matters, otherwise answer from what it knows, and lead with the answer.
- A `model` declared in `agents/*.json` now reaches the agent on OpenCode V2 instead of
  being silently ignored.
- Subagent allowlists are exclusive: an agent can only dispatch the subagents it lists.
- The orchestrator can dispatch `explore` subagents for broad or parallelizable searches.

## v0.4.3 (2026-09-22)

- Rework agent permissions around the native rule idiom: the builder can now create
  commits with approval and reading `.env` files requires approval.
- Remove duplicated task-sequencing rule from the review skill.

## v0.4.2 (2026-09-20)

- Remove YACAO version from the V2 TUI plugin until OpenCode's npm/git plugin loader can load
  external Solid plugins correctly. See [OpenCode issue #33884](https://github.com/anomalyco/opencode/issues/33884).

## v0.4.1 (2026-09-20)

- Fix V2 skill loading so YACAO agents no longer request permission for
  their own skills.
- Remove the obsolete `scout` subagent permission from the builder.
- Clarify V1 and V2 installation and builder configuration.

## v0.4.0 (2026-09-20)

- Add OpenCode V2 support: the plugin exposes a dual entrypoint, registering
  agents and skills through the V2 plugin API while keeping the V1 path intact.
- Add a V2 CLI plugin that shows the YACAO version in the home footer and the
  sidebar content.
- Restrict orchestrator edits to plan markdown files.

## v0.3.0 (2026-09-20)

- Split approved plans into tasks: the builder receives one task at a
  time, each result is reviewed before the next task starts, and a final
  review runs before reporting.
- Remove policy statements duplicated between agents and skills.

## v0.2.0 (2026-09-18)

- YACAO as an OpenCode plugin: one `plugin` entry in
  `opencode.jsonc` injects the agents and registers the skills at startup.
- Agents as JSON (`agents/orchestrator.json`, `agents/builder.json`)
  with prompts in separate Markdown files.
- Show a toast with the loaded version when the plugin starts.
- Add opt-in auto-update: with `autoUpdate` enabled, check the latest GitHub
  release on startup and pin the plugin spec forward (`#vX.Y.Z`), asking for
  a restart. `updateScope` controls whether the project config is updated
  too.
- Merge user configuration recursively over plugin defaults, so overriding
  one rule no longer drops the rest.
- Resolve project configs from the git worktree root, so a project's
  `.opencode/opencode.jsonc` is found when OpenCode starts in a
  subdirectory.

## v0.1.0 (2026-09-15)

Initial release
