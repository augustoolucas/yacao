# Changelog

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
