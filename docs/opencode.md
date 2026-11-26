# YACAO for OpenCode

YACAO for OpenCode is a plugin that brings the YACAO workflow to OpenCode: an
orchestrator that plans and reviews, and a builder subagent that implements. It
ships two agents - `orchestrator` and `builder` - and three skills, and supports
both OpenCode V1 and OpenCode V2.

## Install

### OpenCode V1

Requires OpenCode 1.18.29 or newer.

Add the plugin to your `opencode.jsonc`:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git"]
}
```

To be notified when a new release is available, enable the `autoUpdate` option:

```jsonc
{
  "plugin": [
    [
      "yacao@git+https://github.com/augustoolucas/yacao.git",
      {
        "autoUpdate": true
      }
    ]
  ]
}
```

Then restart OpenCode.

### OpenCode V2

Add the plugin and set the default agent:

```jsonc
{
  "plugins": ["yacao@git+https://github.com/augustoolucas/yacao.git"],
  "default_agent": "orchestrator"
}
```

Then restart OpenCode.

## Updating

OpenCode caches the installed plugin, so a plain restart alone re-fetches
nothing.

On V1 the spec string is the cache key:

- with a pinned spec, point the tag at the new release;
- with an unpinned spec, remove only YACAO's cached package under
  `~/.cache/opencode/packages/` and restart - never clear the whole plugin
  cache.

On V2 use the native command:

```sh
opencode plugin update <configured-target>
```

Omit the target to update all outdated plugins.

This is the configured behavior from the installed CLI help and the versioned
source; it has not been exercised end to end here.

## Configuration

### Default agent

On OpenCode V1 YACAO sets `orchestrator` as the default agent automatically if
no `default_agent` is already set.

On OpenCode V2 you need to set `"default_agent": "orchestrator"`.

### Builder model

Builder inherits the model set for the Orchestrator.

On V1, to set a different model, or override any other agent option, add it to
`opencode.jsonc`:

```jsonc
{
  "agent": {
    "builder": {
      "model": "your-provider/your-model"
    }
  }
}
```

On V2, use the `agents` key:

```jsonc
{
  "agents": {
    "builder": {
      "model": "your-provider/your-model"
    }
  }
}
```

### Builder subagents

The builder can dispatch OpenCode's `explore` subagent to parallelize searches
inside a task.

OpenCode limits subagent nesting to one level by default, so raise it.

On V1, add to `opencode.jsonc`:

```jsonc
{
  "subagent_depth": 2
}
```

On V2, the key lives under `experimental`:

```jsonc
{
  "experimental": {
    "subagent_depth": 2
  }
}
```

Without this, the builder's spawn attempts fail with a subagent depth limit
error.

### Agent permissions

Permissions are guardrails against honest mistakes, not a sandbox: shell access
can bypass most of them by design.

YACAO's agents define their own permission guardrails. Your `opencode.jsonc`
entries are applied as well; on V2 they take precedence, so avoid broad global
allows (such as `edit: allow`) if you rely on YACAO's guardrails. To loosen one
of their rules, override it per agent: `agent.<name>.permission` on V1,
`agents.<name>.permissions` on V2.

These rules are limits of what the tools guard, not content isolation: the
plan-read rule restricts the read tool, not what an agent can reach through
shell; `explore` may still use shell; and the Git guards cover the common
commands, not every possible commit-producing operation. Plain stash reads are
allowed while prefixed forms ask, and a later user configuration can change the
agent mode.

### Auto-update options (OpenCode V1 only)

- `autoUpdate` (defaults to `false`): on startup, checks the latest release and
  shows a notification when a newer version exists. It never edits your
  configuration.
