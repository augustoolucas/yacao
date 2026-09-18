# Changelog

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
