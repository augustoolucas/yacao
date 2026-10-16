# YACAO for Claude Code

**Status: experimental; partial user-reported native evidence, not full
validation.** The user ran an actual Claude Code session on the `claude-code`
adapter with an explicitly selected main agent. The exact client version and
mode were not supplied. The fixes below still need a runtime re-test; this
guide does not claim the native acceptance checklist passed.

## Evidence levels

This guide distinguishes three levels of evidence:

1. **Documented APIs** - behavior described by the official Claude Code
   documentation and the published npm package metadata (checked 2026-10-15
   during design). Documented contracts are the design basis; they are not
   observed behavior.
2. **Offline tests in this repository** - `test/claude-code.test.js`
   and `npm run check:claude-code` verify the generated bundle against the
   canonical sources: file set, determinism, namespaces, drift detection, and
   the guard hook's input/output contracts against synthetic inputs shaped like
   the documented hook payloads. They prove the bundle is internally
   consistent; they prove nothing about the host.
3. **Actual host results (user-reported; version/mode unknown)** - explicit
   main-agent/session use occurred; missing `Skill` blocked skill invocations
   (tool-list fix pending re-test). With the old hook, `mkdir ... && git commit
   ...` created a commit without the expected confirmation. Plan writes were
   restricted to the session root. Continuation via `SendMessage` needed
   `SubagentHandback` to deliver the report in that session. Plugin validation
   warned about missing author metadata (now added; validation re-test pending).
   These observations do not establish full workflow, default-agent behavior,
   hook enforcement or installation support.

The documented target is **Claude Code 2.1.301** (published npm metadata and
the official changelog agree) on **interactive Linux terminals**. That is a
target, not a tested version or a compatibility floor; older and newer versions
are untested either way.

## What the adapter is

A self-contained Claude Code plugin under
[`integrations/claude-code/`](../integrations/claude-code), generated from
YACAO's canonical sources ([`package.json`](../package.json),
[`agents/`](../agents), [`skills/`](../skills)):

- two agents: `yacao:orchestrator` (main) and `yacao:builder` (subagent);
- three skills: `yacao:planning`, `yacao:implementation`, `yacao:review`;
- guard handlers: [`hooks/hooks.json`](../integrations/claude-code/hooks/hooks.json)
  preserve the base `PreToolUse` command
  (`node "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"`) for the tools
  `Bash|Read|Edit|Write|Skill|Agent`, plus conditional native Bash handlers;
- the policy that hook reads,
  [`guardrails.json`](../integrations/claude-code/guardrails.json).

The bundle is designed to be self-contained: every path it references lives
inside the plugin root, and no symlinks, install hooks or network access are
involved. Proving that a copied bundle loads is part of the pending native
checklist (item 10).

**Plugin users need no build step.** The generated files are committed, so
loading the adapter runs no generator, npm install or repository dependency.
That is a property of the packaging; copied-bundle loading is still unverified.

### Requirements

- **Claude Code CLI**: documented target 2.1.301, interactive Linux terminal
  (unvalidated). The installed version must support native hook-handler `if`
  conditions and Bash subcommand matching as documented in
  [Hooks: common fields](https://code.claude.com/docs/en/hooks.md#common-fields).
  That requirement is unvalidated on the user's installation; no version floor
  is inferred from the unknown version used in the reported session.
- **Node.js 22 or newer** on `PATH`, for two independent reasons:
  - the guard hook is a Node script that runs on every matched tool call, so
    the prerequisite applies even to plugin users who never build anything;
  - the generator/check scripts in this repository use Node 22 built-ins.
  If `node` is missing or broken, the hook cannot run and the enforcement
  described below does not happen.
- No third-party runtime dependencies: the bundle and the hook use Node
  built-ins only.

Windows, macOS, IDE and cloud clients, agent teams and non-interactive runs are
untested and outside the current design.

## Local development

All commands run from the repository root:

```sh
npm run build:claude-code    # regenerate integrations/claude-code/ from the canonical sources
npm run check:claude-code    # verify the committed bundle without writing (10 files)
```

`--check` validates the 7 generated files, the 2 hand-authored hook files and
the root marketplace descriptor
([`.claude-plugin/marketplace.json`](../.claude-plugin/marketplace.json)); it
reports drift or missing files and never rewrites them. Run it (or `npm test`)
after any change to the canonical sources.

To validate and load the updated bundle locally (documented CLI forms; fixes
pending user re-test):

```sh
claude plugin validate ./integrations/claude-code
```

From an unrelated, disposable project, so the adapter cannot touch real work:

```sh
claude --plugin-dir /absolute/path/to/yacao/integrations/claude-code --agent yacao:orchestrator
```

- `--plugin-dir` loads the plugin for that session; no marketplace install is
  performed.
- `--agent yacao:orchestrator` starts the main conversation as the plugin's
  orchestrator agent explicitly.
- Without `--agent`, the manifest default (`settings.agent: orchestrator`) is
  documented to select the orchestrator **only when neither the user nor the
  CLI has selected another agent**. User settings and an explicit `--agent`
  override the plugin default. Enabling the plugin is not an unconditional
  takeover of the main conversation, and it never overwrites a user's
  configured default agent.

## Installing from the repository

**Available remotely from the `claude-code` branch only.** The default branch
(`main`) and the current release do not contain these files, so a remote
install has to pin the branch ref. Nothing remote has been tested yet.
**Prefer local installation until the adapter is validated and released.**

### Local (recommended now)

Session-scoped load (see above):

```sh
claude --plugin-dir /absolute/path/to/yacao/integrations/claude-code
```

Local marketplace install from a checkout (documented forms; untested):

```text
/plugin marketplace add /absolute/path/to/yacao
/plugin install yacao@yacao
```

The root marketplace registers exactly one plugin whose source is the local
`./integrations/claude-code` bundle, so a clone or checkout of this repository
is enough and no network publication is involved.

### Remote Git marketplace (branch ref; unvalidated)

The adapter is not on the default branch or in a release, so the install has to
pin the `claude-code` branch ref (the documented source syntax accepts a ref):

```text
/plugin marketplace add augustoolucas/yacao#claude-code
/plugin install yacao@yacao
```

The branch ref moves as the branch is updated, so a later install can pick up
different content. Once the adapter is merged and released, the unpinned form
(`/plugin marketplace add augustoolucas/yacao`) becomes the stable one.

## Namespaces, paths and generated files

- Agents: `yacao:orchestrator`, `yacao:builder`.
- Skills: `yacao:planning`, `yacao:implementation`, `yacao:review`.
- Plan protocol paths are relative to the **session root**, not the target
  project root: for a project below it, use
  `.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use
  `.yacao/plans/plan-<slug>/` (plan overview, task contracts, ledger).
  The adapted planning skill adds this grouping instruction; permissions remain
  unchanged, including the Markdown-only `.yacao/plans/*.md` edit rule.
  The adapter uses `.yacao` instead of
  `.claude` to keep protocol artifacts out of Claude Code's protected
  configuration area. OpenCode paths (`.opencode/plans`) stay unchanged.
- **Generated files** (the 7 the generator writes): the plugin manifest
  `integrations/claude-code/.claude-plugin/plugin.json`, `guardrails.json`, the two agent files
  `integrations/claude-code/agents/orchestrator.md` and
  `integrations/claude-code/agents/builder.md`, and the three skill files
  `integrations/claude-code/skills/planning/SKILL.md`,
  `integrations/claude-code/skills/implementation/SKILL.md` and
  `integrations/claude-code/skills/review/SKILL.md`. These are outputs; never
  edit them by hand.
- **Hand-authored bundle files**: `hooks/hooks.json` and `hooks/guard.mjs`,
  shipped as-is; `--check` verifies they exist and stay within the bundle
  text rules.
- **Canonical sources**: `package.json`, `agents/*.json`,
  `agents/prompts/*.md`, `skills/yacao-*/SKILL.md`. Change these, then run
  `npm run build:claude-code`.

The plugin manifest version is derived from `package.json`. **Changing
canonical prompts, skills or the package version requires regenerating the
bundle and passing `npm run check:claude-code` before a release**, so the
committed bundle never drifts from the sources.

YACAO never edits a target repository's `.gitignore`, its Claude settings
files or its `CLAUDE.md` automatically. It writes its own `.yacao/plans`
artifacts and makes code changes through the builder; nothing else in the
target project is configured for you.

## Permissions and enforcement on Claude Code

The guard uses small `PreToolUse` handlers, not a port of OpenCode's permission
system. Documented differences that matter:

- **Exact agents only.** Rules apply only when the host identifies the caller
  as exactly `yacao:orchestrator` or `yacao:builder` (plugin-qualified
  `agent_type`). Other agents, bare names, `Explore` processes and unrelated
  plugins receive no decision from this hook and stay entirely under native
  permissions.
- **Tighten-only.** The hook emits `ask` or `deny`, never `allow`, and never
  rewrites tool input. It cannot grant anything beyond native or managed
  restrictions: user, project and managed rules still apply on top, and a host
  or organization policy that disables hooks or plugins overrides it.
- **Different evaluation model.** Claude Code evaluates native rules as deny,
  then ask, then allow (first match in that order), not OpenCode's ordered
  last-match-wins policy. Native settings do not universally relax a hook
  deny, and there is no YACAO mechanism to exempt one command from a broader
  native ask. The order shown in `guardrails.json` is YACAO's own evaluation
  order inside the hook, not a claim about Claude's native matching.
- **Enforcement can be reduced without notice to YACAO.** Disabled, blocked or
  broken hooks (user or managed settings), a missing or broken Node.js
  runtime, and hook startup failures all mean the YACAO rules do not run. The
  hook is a guardrail, not a sandbox.
- **No content or security isolation.** `Read`, `Edit` and `Write` paths are
  classified against the project root and checked against the role policy, but
  open shell access, `Grep`, `Glob` and `Explore` can still reach content the
  rules do not cover. Open shell access is a deliberate tradeoff, and `Explore`
  is not restricted to read-only behavior by this hook.
- **Partial Bash coverage.** The base handler still matches the raw command as
  one opaque string against anchored wildcards (last matching rule wins).
  Additional handlers use native `if` filters for direct and Git-option-prefixed
  commit, push, merge, cherry-pick, revert, am, rebase, pull, reset, checkout,
  restore, switch and clean commands, explicit stash mutations and recursive or
  force `rm` forms. `--native-commit` denies the builder and asks the
  orchestrator; `--native-sensitive` asks both. Both validate the exact role,
  Bash payload and packaged policy before deciding; unknown modes deny covered
  YACAO calls. Other identities receive no decision. No mode emits `allow`.
  The host's documented filter checks subcommands in `&&`, `$()` and backticks,
  but stdin remains the full original command. Modes therefore do not apply
  raw-command `lastMatch` again to decide the filtered subcommand. If multiple
  handlers fire, deny dominates ask. Offline tests verify handler output and
  wiring, not native triggering or modals; the installed host must be re-tested.
  Native matching is best-effort and can be conservative, including triggering
  argument-specific filters on unresolved substitutions or variables. It is
  not a security guarantee. Wrappers, aliases, functions, scripts, quoting and
  unlisted command forms remain limitations; the guard never parses, splits,
  rewrites or executes commands.
  Stash filters cover push/pop/apply/drop/clear/branch/store/create, explicit
  save, bare stash and option-led default-save forms, not list/show. Unlisted
  verbs, unusual option placement and implicit-save forms not starting with an
  option are not promised coverage. Git-option-prefixed filters start `git -*`,
  not `git *`, to avoid treating ordinary stash-show arguments as verbs.
  Existing raw-command wildcard collisions remain possible; conservative native
  matching can also prompt on read-only forms. Recursive/force `rm` filters
  deliberately ask even without both flags; arbitrary operand/option ordering
  is not fully covered.
- **Native prompts remain.** When no YACAO rule matches, or the match is
  `allow`, the hook returns no decision and the native permission machinery
  still runs, including its own prompts. Falling through never means
  auto-approval.
- **Policy highlights** (generated into `guardrails.json`, offline-tested):
  orchestrator edits/writes are denied except `.yacao/plans` Markdown; builder
  reads of `.yacao/plans` are denied; builder YACAO skill use is denied;
  builder Agent calls are limited to `Explore`; recognized `git commit`
  commands are denied for the builder and ask for the orchestrator, as do
  push and mutating Git forms; `.env` reads ask; `command git*` and `env git*`
  are denied. These are patterns, not a shell parser (see the bullet above).
- Permission modes, managed policy and external-directory access are native
  host concerns; the adapter neither translates nor overrides them.

## Workflow bindings

The mechanics live in the shipped skills - read them rather than relying on a
summary here: `skills/planning/SKILL.md`, `skills/implementation/SKILL.md` and
`skills/review/SKILL.md` (under `integrations/claude-code/`).

Host-specific bindings those skills rely on:

- **Custom dispatch, never a fork.** The orchestrator dispatches the explicit
  agent type `yacao:builder` with the Agent tool. A fork inherits the main
  conversation; the explicitly selected custom builder starts with fresh
  context and receives only the narrow, self-contained task contract - never
  the full plan.
- **Real agent IDs.** The skills require recording the **actual** agent ID
  returned by the dispatch; references are never fabricated, and `Explore`
  runs return no resumable ID.
- **Continuation.** Corrections and follow-ups continue the same builder via
  `SendMessage` targeted at the recorded agent ID. The user reported needing
  `SubagentHandback` to deliver a continuation report. Official
  [subagent documentation](https://code.claude.com/docs/en/sub-agents) describes
  mode-dependent tool availability; this is not an unconditional requirement
  or a reason to preload skills. Re-test report delivery in the actual mode.
- **Asynchronous completion.** A dispatch may complete asynchronously under
  current defaults; the orchestrator waits for the actual completion before
  reviewing or advancing. This scheduling behavior is unverified here.
- **No commits by default.** Approved work stays uncommitted; per-task commits
  or a single final-only commit happen only on explicit request, with the
  refusal handling described in the review skill.
- **Sequential review.** Each task is reviewed before the next begins, and the
  builder's answer to one task never substitutes for review.

Models and tools: the builder declares `model: inherit`, so it uses the model
context selected by the host and the user; the adapter pins no provider or
model and translates no temperature. The orchestrator keeps the host and user
model selection as well. Tool rosters are native frontmatter lists
(orchestrator: `Agent(yacao:builder, Explore)`, `SendMessage`, `Skill`,
read/search/web tools, `Bash`, `AskUserQuestion`, `Edit`, `Write`; builder:
read/search/web tools, `Bash`, `Edit`, `Write`, `Agent`); plugin subagents do
not support `hooks`, `mcpServers` or `permissionMode` frontmatter, and the
adapter does not use them.

## Native acceptance checklist (partial observations; re-test pending)

The observations above cover parts of items 1-4, not their full acceptance
criteria. Default-agent activation and user override remain pending, as do the
full workflow checks 6, 7 and 11 and copied bundle/local marketplace check 10.
No unchecked item is implied to have passed. Run or re-run only in a disposable
fixture (a Git repository when the checklist exercises commits) with an
isolated Claude config, only with the user's explicit approval, and record the
exact client version and mode. Do not copy
credentials, do not run destructive commands, and do not install anything into
the user's real configuration without authorization. Steps marked
**[user observation]** can only be confirmed by the user watching the session;
a child report cannot prove a modal appeared.

1. **Main activation and default override.** `claude --version`; validate the
   bundle with `claude plugin validate ./integrations/claude-code`; start the
   disposable fixture with `--plugin-dir <absolute path>` and
   `--agent yacao:orchestrator` and confirm the main identity. Then confirm
   that the plugin default activates the orchestrator when no agent is
   selected, and that a user-selected different agent still wins.
2. **Three skills.** Invoke `yacao:planning`, `yacao:implementation` and
   `yacao:review` and confirm each loads.
3. **Custom builder isolation and continuation.** Confirm a dispatch selects
   `yacao:builder` (fresh context, not a fork), returns a real agent ID, and
   that `SendMessage` to that ID continues the same builder.
4. **Role guardrails.** Orchestrator source write denied, plan Markdown
   allowed; builder plan read denied, regular read allowed; builder YACAO
   skill denied; builder `Explore` allowed, another Agent type denied; builder
   direct and prefixed commit dry-runs denied; orchestrator commit and
   mutating Git dry-runs ask **[user observation for the modals]**.
   Re-test native-filter triggering on safe compound and substitution fixtures,
   including `mkdir x && git commit ...` for both roles, Git-option-prefixed
   forms and stash list/show controls. Confirm builder deny wins if commit and
   sensitive handlers both fire. Handler-only offline tests do not prove this.
5. **Safe modal controls.** **[user observation]** Confirm the ask modals
   appear for the ask rules and decline them; verify that declining performed
   no destructive operation.
6. **Two tasks sharing one file.** Run a small two-task plan where both tasks
   touch one file; confirm sequential per-task review and that nothing was
   committed by default.
7. **Final-only commit and a refusal.** With a final-only preference, confirm
   no intermediate commits, one commit at the very end, and that a declined
   commit is not retried **[user observation]** and is reported as refused
   with the continue-without-commits or stop choice.
8. **Unrelated work preserved.** Pre-create unrelated staged and unstaged
   changes; confirm they survive untouched after the run.
9. **Native policy and unrelated agents.** Confirm YACAO decisions do not
   apply to unrelated agents, and that a native or user deny is not loosened
   by YACAO.
10. **Copied bundle and local marketplace.** Copy `integrations/claude-code/`
    outside the repository, load the copy with `--plugin-dir` and confirm it
    works without the parent sources or any build step; then add the checkout
    as a local marketplace (`/plugin marketplace add /absolute/path/to/yacao`)
    and install `yacao@yacao` under an isolated config, confirming the
    installed copy behaves the same way.
11. **No-Git path.** In a plain directory (or an unborn Git repository) with no
    baseline, run a small two-task plan where both tasks touch one file;
    confirm the workflow is not blocked, review inspects the resulting files
    instead of a diff, and no Git repository or initial commit is created
    without authorization.
