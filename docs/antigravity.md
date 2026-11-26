# YACAO for Antigravity CLI (Experimental)

Tested with Antigravity CLI 1.5.7 and 1.5.8 (Linux).

## Install

Install directly from GitHub:

```sh
agy plugin install https://github.com/augustoolucas/yacao/tree/main/integrations/antigravity
```

Then start a session from your project directory:

```sh
agy --agent yacao-orchestrator
```

The plugin does not set a default agent, so pass `--agent yacao-orchestrator` (or
select it in `/agents`) when starting a session.

## Configuration

Both agents use the session model. Pass it when starting:

```sh
agy --agent yacao-orchestrator --model <model>
```

or choose it in `/model`. `yacao-builder` inherits the session model. There is no
separate builder-model setting.

## Update and removal

Reinstall with the same command used to install:

```sh
agy plugin install https://github.com/augustoolucas/yacao/tree/main/integrations/antigravity
```

Reinstalling replaces `~/.gemini/config/plugins/yacao`, so keep custom edits
outside that directory. Start a new session to load the update.

Remove the installed copy:

```sh
agy plugin uninstall yacao
```

This leaves your project files and `.yacao/plans/` artifacts untouched.

## Permissions and limits

YACAO ships no hooks for Antigravity, so the role boundaries are prompt
instructions, not technical guardrails: the orchestrator is instructed to edit
only `.yacao/plans` Markdown, and the builder is instructed not to commit or
push. Native user permissions still apply.

MCP servers and host customizations are inherited as configured.
