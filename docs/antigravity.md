# YACAO for Antigravity CLI

YACAO for Antigravity CLI is an experimental plugin that brings the same
workflow to the Antigravity CLI: an orchestrator that plans and reviews, and a
builder subagent that implements. It ships two agents - `yacao-orchestrator` and
`yacao-builder` - and three skills, generated from YACAO's canonical sources
under [`integrations/antigravity/`](../integrations/antigravity).

This guide has been tested with Antigravity CLI 1.5.7 on Linux.

## Requirements

- **Antigravity CLI** with plugin and subagent support, as documented in
  [Build plugins](https://antigravity.google/docs/build-plugins/) and
  [Subagents](https://antigravity.google/docs/subagents/).
- **A local checkout** that contains `integrations/antigravity/`; see
  [Install](#install).
- **No runtime dependencies.** The six plugin files are committed and need no
  `npm install`, build step, Node.js runtime or third-party package. Node.js 22
  or newer is only needed for development.

## Install

The Antigravity bundle is not part of a tagged release yet. Use a checkout that
contains `integrations/antigravity/` - `main` once the change is published, or
the branch that carries it.

```sh
git clone https://github.com/augustoolucas/yacao.git
```

Check for a name collision before installing:

```sh
agy plugin list --json
```

If an unrelated plugin named `yacao` is already installed, resolve the collision
first; do not overwrite it. Then install from the checkout, replacing the path
with its absolute location:

```sh
agy plugin install /absolute/path/to/yacao/integrations/antigravity
```

The native installer copies and enables the plugin at
`~/.gemini/config/plugins/yacao`. YACAO does not publish a marketplace entry or
a remote install target for this bundle - install from the local checkout.

## Start and use

From the target project directory:

```sh
agy --agent yacao-orchestrator
```

`yacao-orchestrator` is the primary agent; `yacao-builder` is a subagent and is
not offered as a primary agent. The plugin does not set a default agent or merge
project configuration, so start with `--agent` in each session.

Make ordinary requests. Questions are answered directly, and the three skills
load on demand - you do not invoke them yourself. For a change request, the
orchestrator clarifies the goal first. Small changes go to the builder and come
back for review; larger changes produce a plan for your approval before any
source changes. Implementation is sequential, with each task reviewed before the
next one starts.

Plans are written under `.yacao/plans/` relative to the session workspace root,
not the target project root. For a project below the workspace root, use
`.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use
`.yacao/plans/plan-<slug>/`.

Approved work stays uncommitted by default. Ask for a commit after a task or at
the end. That default is prompt guidance and whatever native permissions you
configure - YACAO adds no hook for it. The target project does not need to be a
Git repository.

## Model

Both agents use the session model. Pass it when starting:

```sh
agy --agent yacao-orchestrator --model gemini-3.8-flash-medium
```

`yacao-builder` declares `inherit` as its model, so it follows the session
selection; there is no separate builder-model setting. In the tested 1.5.7
CLI, agent frontmatter accepts the tiers `inherit`, `flash_lite`, `flash` and
`pro`, not arbitrary full model IDs. YACAO ships `inherit` for both agents. A
per-call model override has not been verified; select the model when starting
the session.

## Update and removal

Update from a clean checkout on the appropriate branch:

```sh
git pull --ff-only
agy plugin install /absolute/path/to/yacao/integrations/antigravity
```

Reinstalling replaces the installed plugin directory as a whole. Local edits
under `~/.gemini/config/plugins/yacao` are lost, so keep custom configuration
outside that directory. Check `agy plugin list --json` before reinstalling if
another install named `yacao` could collide. Start a new session to load the
updated plugin.

Remove the installed copy:

```sh
agy plugin uninstall yacao
```

This removes the plugin from `~/.gemini/config/plugins/yacao` and leaves your
checkout, project files and `.yacao/plans/` artifacts untouched.

## Permissions and limits

YACAO ships no hooks and installs none. It does not add schedules or swarm
configuration, or change other Antigravity settings. Native hooks are documented
in [Hooks](https://antigravity.google/docs/hooks/).

The roles are prompt instructions, not technical guards. There are no YACAO
denials for orchestrator edits, builder commits, or access to plan files or
skills; native user permissions still apply. The orchestrator is instructed not to edit files
except plan Markdown, and the builder is instructed not to commit or push. This
is not a sandbox, and the Antigravity integration does not provide parity with
the OpenCode or Claude Code guardrails.

Both agents declare an explicit, finite roster of native tools. In the tested
host, an agent that omits its tool list is read-only, so the roster is required.
It is not an all-tools grant or a statement about every tool the host may expose
now or later: MCP servers and host customizations are inherited separately
through `inheritMcp` and `inheritCustomizations`, and depend on the native
configuration and grants you provide. The builder explores relevant code
directly; YACAO does not add a research subagent.

## Development

Canonical sources are `package.json`, `agents/*.json` with their
`agents/prompts/*.md` files, and the three skill sources:
`skills/yacao-planning/SKILL.md`, `skills/yacao-implementation/SKILL.md` and
`skills/yacao-review/SKILL.md`. `scripts/build-antigravity.mjs` generates the
six committed files under `integrations/antigravity/`; do not edit those
generated files by hand.

From the repository root:

```sh
npm run build:antigravity    # regenerate the bundle
npm run check:antigravity    # verify without writing
```

Node.js 22 or newer is needed for these scripts and the tests only. The installed
plugin needs no Node.js.
