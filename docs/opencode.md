# YACAO for OpenCode

## Install

### OpenCode V1

Requires OpenCode 1.18.29 or newer.

Add the plugin to your `opencode.jsonc`:

```jsonc
{
  "plugin": ["yacao@git+https://github.com/augustoolucas/yacao.git"]
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

### Auto-update notification (OpenCode V1 only)

The `autoUpdate` option defaults to `false`. When enabled, on startup it checks
the latest release and shows a notification if a newer version exists. It never
edits your configuration.

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

## Updating

OpenCode caches the installed plugin, so a plain restart alone re-fetches
nothing.

On V1 the spec string is the cache key:

- if you pinned a `#vX.Y.Z` tag in the spec, update the tag.
- otherwise remove only YACAO's cached package under
  `~/.cache/opencode/packages/` and restart - never clear the whole plugin
  cache.

On V2 use the native command:

```sh
opencode plugin update <configured-target>
```

Omit the target to update all outdated plugins.

## Permissions and limits

Permissions are guardrails against honest mistakes, not a sandbox: shell access
and `explore` can reach content outside the tool rules by design.

YACAO's agents define their own permission guardrails. Your `opencode.jsonc`
entries are applied as well. On V2 they take precedence, so avoid broad global
allows (such as `edit: allow`) if you rely on YACAO's guardrails. To loosen one
of their rules, override it per agent: `agent.<name>.permission` on V1,
`agents.<name>.permissions` on V2.
