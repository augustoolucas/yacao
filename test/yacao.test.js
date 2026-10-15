import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import plugin, {
  parseSemver,
  isNewer,
  mergeDefinition,
  agentPermissionRules,
  parseModelRef,
  applyAgentDefinitions,
} from "../plugin/yacao.js";

describe("parseSemver", () => {
  test("parses a plain version", () => {
    assert.deepEqual(parseSemver("0.4.3"), { numbers: [0, 4, 3], pre: null });
  });

  test("strips the v prefix", () => {
    assert.deepEqual(parseSemver("v0.4.3"), { numbers: [0, 4, 3], pre: null });
  });

  test("captures a pre-release tag", () => {
    assert.deepEqual(parseSemver("0.3.0-rc"), { numbers: [0, 3, 0], pre: "rc" });
  });

  test("rejects invalid input", () => {
    for (const value of ["", "1.2", "1.2.3.4", "abc", "1.2.x", null]) {
      assert.equal(parseSemver(value), null);
    }
  });
});

describe("isNewer", () => {
  test("equal versions are not newer", () => {
    assert.equal(isNewer("1.2.3", "1.2.3"), false);
  });

  test("a greater version is newer", () => {
    assert.equal(isNewer("1.2.4", "1.2.3"), true);
  });

  test("a lesser version is not newer", () => {
    assert.equal(isNewer("1.2.2", "1.2.3"), false);
  });

  test("compares major and minor segments", () => {
    assert.equal(isNewer("2.0.0", "1.9.9"), true);
    assert.equal(isNewer("1.3.0", "1.2.9"), true);
  });

  test("stable beats a pre-release on an equal core", () => {
    assert.equal(isNewer("1.2.3", "1.2.3-rc"), true);
  });

  test("a pre-release is not newer than stable", () => {
    assert.equal(isNewer("1.2.3-rc", "1.2.3"), false);
  });

  test("pre-release vs pre-release on an equal core is not newer", () => {
    assert.equal(isNewer("1.2.3-rc.2", "1.2.3-rc.1"), false);
  });

  test("invalid input is never newer", () => {
    assert.equal(isNewer("garbage", "1.2.3"), false);
    assert.equal(isNewer("1.2.3", "garbage"), false);
    assert.equal(isNewer(null, "1.2.3"), false);
  });
});

describe("mergeDefinition", () => {
  test("merges nested objects", () => {
    const base = { a: { b: 1, c: 2 }, d: 3 };
    const override = { a: { c: 9 } };
    assert.deepEqual(mergeDefinition(base, override), { a: { b: 1, c: 9 }, d: 3 });
  });

  test("the override value wins", () => {
    assert.deepEqual(mergeDefinition({ a: 1, b: 2 }, { b: 5 }), { a: 1, b: 5 });
  });

  test("arrays are replaced, not merged", () => {
    assert.deepEqual(mergeDefinition({ list: [1, 2, 3] }, { list: [9] }), { list: [9] });
  });
});

describe("agentPermissionRules", () => {
  test("maps a flat value to a wildcard resource", () => {
    assert.deepEqual(agentPermissionRules({ edit: "allow" }), [
      { action: "edit", resource: "*", effect: "allow" },
    ]);
  });

  test("expands an object value in key order", () => {
    assert.deepEqual(agentPermissionRules({ edit: { "src/a": "ask", "src/b": "deny" } }), [
      { action: "edit", resource: "src/a", effect: "ask" },
      { action: "edit", resource: "src/b", effect: "deny" },
    ]);
  });

  test("renames bash to shell", () => {
    assert.deepEqual(agentPermissionRules({ bash: "allow" }), [
      { action: "shell", resource: "*", effect: "allow" },
    ]);
  });

  test("renames task to subagent", () => {
    assert.deepEqual(agentPermissionRules({ task: "deny" }), [
      { action: "subagent", resource: "*", effect: "deny" },
    ]);
  });

  test("passes an unknown action through verbatim", () => {
    assert.deepEqual(agentPermissionRules({ webfetch: "allow" }), [
      { action: "webfetch", resource: "*", effect: "allow" },
    ]);
  });
});

describe("parseModelRef", () => {
  test("parses provider and id", () => {
    assert.deepEqual(parseModelRef("openai/gpt-4o"), { providerID: "openai", id: "gpt-4o" });
  });

  test("parses a variant", () => {
    assert.deepEqual(parseModelRef("openai/gpt-4o#high"), {
      providerID: "openai",
      id: "gpt-4o",
      variant: "high",
    });
  });

  test("rejects invalid references", () => {
    for (const value of [
      "gpt-4o",
      "/gpt-4o",
      "openai/",
      "openai/gpt-4o#",
      "openai/gpt#4o#more",
      "open#ai/gpt-4o",
    ]) {
      assert.equal(parseModelRef(value), null);
    }
  });
});

const createEditor = (initial = {}) => {
  const agents = { ...initial };
  return {
    agents,
    update(id, callback) {
      agents[id] ??= {};
      callback(agents[id]);
    },
  };
};

const definitionFor = (overrides = {}) => ({
  description: "builder agent",
  prompt: "you build",
  mode: "subagent",
  model: "openai/gpt-4o",
  permission: { edit: "allow", bash: { "git status": "allow", "git push": "deny" } },
  ...overrides,
});

describe("applyAgentDefinitions", () => {
  test("registers a fresh agent", () => {
    const editor = createEditor();
    applyAgentDefinitions(editor, [{ name: "builder", definition: definitionFor() }]);
    const agent = editor.agents.builder;
    assert.equal(agent.name, "builder");
    assert.equal(agent.description, "builder agent");
    assert.equal(agent.system, "you build");
    assert.equal(agent.mode, "subagent");
    assert.deepEqual(agent.model, { providerID: "openai", id: "gpt-4o" });
    assert.deepEqual(agent.permissions, [
      { action: "edit", resource: "*", effect: "allow" },
      { action: "shell", resource: "git status", effect: "allow" },
      { action: "shell", resource: "git push", effect: "deny" },
    ]);
  });

  test("replaces the host permission scaffold", () => {
    const editor = createEditor({
      builder: {
        permissions: [
          { action: "*", resource: "*", effect: "allow" },
          { action: "webfetch", resource: "*", effect: "deny" },
        ],
      },
    });
    applyAgentDefinitions(editor, [{ name: "builder", definition: definitionFor() }]);
    assert.deepEqual(editor.agents.builder.permissions, [
      { action: "edit", resource: "*", effect: "allow" },
      { action: "shell", resource: "git status", effect: "allow" },
      { action: "shell", resource: "git push", effect: "deny" },
    ]);
  });

  test("keeps a user model and forces the definition mode", () => {
    const editor = createEditor({
      builder: { model: { providerID: "anthropic", id: "claude" }, mode: "primary" },
    });
    applyAgentDefinitions(editor, [{ name: "builder", definition: definitionFor() }]);
    const agent = editor.agents.builder;
    assert.equal(agent.mode, "subagent");
    assert.deepEqual(agent.model, { providerID: "anthropic", id: "claude" });
    assert.equal(agent.description, "builder agent");
  });

  test("fills empty description and system", () => {
    const editor = createEditor({ builder: { description: "", system: "" } });
    applyAgentDefinitions(editor, [{ name: "builder", definition: definitionFor() }]);
    assert.equal(editor.agents.builder.description, "builder agent");
    assert.equal(editor.agents.builder.system, "you build");
  });

  test("handles a missing permissions array", () => {
    const editor = createEditor({ builder: { description: "kept" } });
    applyAgentDefinitions(editor, [{ name: "builder", definition: definitionFor() }]);
    assert.ok(Array.isArray(editor.agents.builder.permissions));
    assert.equal(editor.agents.builder.permissions.length, 3);
  });

  test("replaces rules on every call (idempotent)", () => {
    const editor = createEditor();
    const definitions = [{ name: "builder", definition: definitionFor() }];
    applyAgentDefinitions(editor, definitions);
    applyAgentDefinitions(editor, definitions);
    assert.deepEqual(editor.agents.builder.permissions, [
      { action: "edit", resource: "*", effect: "allow" },
      { action: "shell", resource: "git status", effect: "allow" },
      { action: "shell", resource: "git push", effect: "deny" },
    ]);
  });
});

const readAgentPermissions = (name) =>
  JSON.parse(readFileSync(new URL(`../agents/${name}.json`, import.meta.url), "utf8")).permission;

const shellRules = (name) =>
  agentPermissionRules(readAgentPermissions(name)).filter((rule) => rule.action === "shell");

// Our reading of the documented wildcard semantics: anchored match, `*` spans
// every character, the last matching rule wins. This pins the rule order in the
// agent definitions, not the host implementation.
const toRegExp = (pattern) =>
  new RegExp(
    "^" +
      pattern
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\\\*/g, ".*")
        .replace(/\\\?/g, ".") +
      "$",
  );

const decide = (rules, command) => {
  let effect = null;
  for (const rule of rules) {
    if (toRegExp(rule.resource).test(command)) effect = rule.effect;
  }
  return effect;
};

describe("agent shell rule order", () => {
  const builder = shellRules("builder");
  const orchestrator = shellRules("orchestrator");

  test("builder denies every commit form", () => {
    for (const command of [
      "git commit",
      'git commit -m "ordinary message"',
      'git commit -m "fix push"',
      'git commit -m "stash it"',
      'git -C . commit -m "fix push"',
      'git commit -m "merge main"',
    ]) {
      assert.equal(decide(builder, command), "deny", command);
    }
  });

  test("builder asks for the gated git commands", () => {
    for (const command of [
      "git stash push -m x",
      "git merge main",
      "git cherry-pick abc123",
      "git revert HEAD",
      "git am patch",
      "git rebase main",
      "git pull origin main",
      "git reset --soft HEAD~1",
      "git reset HEAD~1",
      "git checkout -b topic",
      "git restore .",
      "git switch -c topic",
      "git push origin main",
      "git -C . push",
      "git reset --hard HEAD",
      "git clean -fd",
    ]) {
      assert.equal(decide(builder, command), "ask", command);
    }
  });

  test("builder allows routine commands", () => {
    for (const command of ["git status --porcelain", "git diff HEAD", "ls -la", "npm test", "git stash list", "git stash show -p"]) {
      assert.equal(decide(builder, command), "allow", command);
    }
  });

  test("builder denies the shell escape routes", () => {
    assert.equal(decide(builder, "command git status"), "deny");
    assert.equal(decide(builder, "env git status"), "deny");
  });

  test("orchestrator asks before commit and push", () => {
    for (const command of ["git commit -m x", "git push origin main", "git -C . push"]) {
      assert.equal(decide(orchestrator, command), "ask", command);
    }
    assert.equal(decide(orchestrator, "git status --porcelain"), "allow");
    assert.equal(decide(orchestrator, "git merge main"), "ask");
    assert.equal(decide(orchestrator, "git rebase main"), "ask");
    assert.equal(decide(orchestrator, "git stash list"), "allow");
  });

  test("builder asks for plain and prefixed switch, including forced forms", () => {
    for (const command of [
      "git switch main",
      "git switch -c topic",
      "git switch -f main",
      "git -C . switch main",
      "git -C . switch -c topic",
      "git -C . switch -f main",
    ]) {
      assert.equal(decide(builder, command), "ask", command);
    }
  });

  test("builder asks for plain and prefixed clean, including forced and exclude forms", () => {
    for (const command of [
      "git clean",
      "git clean -fd",
      "git clean -fdx",
      "git clean -e '*.log'",
      "git -C . clean",
      "git -C . clean -fd",
      "git -C . clean -fdx",
      "git -C . clean -e '*.log'",
    ]) {
      assert.equal(decide(builder, command), "ask", command);
    }
  });

  test("builder allows plain stash reads including arguments", () => {
    for (const command of [
      "git stash list",
      "git stash list --oneline",
      "git stash show",
      "git stash show -p",
      "git stash show stash@{0}",
    ]) {
      assert.equal(decide(builder, command), "allow", command);
    }
  });

  test("builder asks for prefixed stash reads", () => {
    for (const command of ["git -C . stash list", "git -C . stash show -p"]) {
      assert.equal(decide(builder, command), "ask", command);
    }
  });

  test("builder asks for plain and prefixed stash mutations", () => {
    for (const command of [
      "git stash push -m x",
      "git stash pop",
      "git -C . stash push -m x",
      "git -C . stash pop",
    ]) {
      assert.equal(decide(builder, command), "ask", command);
    }
  });

  test("builder keeps merge and stash messages mentioning stash reads as ask", () => {
    for (const command of [
      'git merge main -m "stash list docs"',
      'git stash push -m "stash list docs"',
      'git stash push -m "stash show docs"',
    ]) {
      assert.equal(decide(builder, command), "ask", command);
    }
  });

  test("builder commit denies hold over messages mentioning gated words", () => {
    for (const command of [
      'git commit -m "please switch now"',
      'git commit -m "please clean now"',
      'git commit -m "revert stash list docs"',
      'git commit -m "revert stash show docs"',
      'git -C . commit -m "please switch now"',
      'git -C . commit -m "revert stash list docs"',
    ]) {
      assert.equal(decide(builder, command), "deny", command);
    }
  });

  test("builder still allows unrelated read-only commands", () => {
    for (const command of ["git status --porcelain", "git diff HEAD", "git log --oneline", "ls -la"]) {
      assert.equal(decide(builder, command), "allow", command);
    }
  });

  test("orchestrator asks for plain and prefixed switch, including forced forms", () => {
    for (const command of [
      "git switch main",
      "git switch -c topic",
      "git switch -f main",
      "git -C . switch main",
      "git -C . switch -c topic",
      "git -C . switch -f main",
    ]) {
      assert.equal(decide(orchestrator, command), "ask", command);
    }
  });

  test("orchestrator asks for plain and prefixed clean, including forced and exclude forms", () => {
    for (const command of [
      "git clean",
      "git clean -fd",
      "git clean -fdx",
      "git clean -e '*.log'",
      "git -C . clean",
      "git -C . clean -fd",
      "git -C . clean -fdx",
      "git -C . clean -e '*.log'",
    ]) {
      assert.equal(decide(orchestrator, command), "ask", command);
    }
  });

  test("orchestrator allows plain stash reads including arguments", () => {
    for (const command of [
      "git stash list",
      "git stash list --oneline",
      "git stash show",
      "git stash show -p",
    ]) {
      assert.equal(decide(orchestrator, command), "allow", command);
    }
  });

  test("orchestrator asks for prefixed stash reads", () => {
    for (const command of ["git -C . stash list", "git -C . stash show -p"]) {
      assert.equal(decide(orchestrator, command), "ask", command);
    }
  });

  test("orchestrator asks for plain and prefixed stash mutations", () => {
    for (const command of [
      "git stash push -m x",
      "git stash pop",
      "git -C . stash push -m x",
      "git -C . stash pop",
    ]) {
      assert.equal(decide(orchestrator, command), "ask", command);
    }
  });

  test("orchestrator keeps merge and stash messages mentioning stash reads as ask", () => {
    for (const command of [
      'git merge main -m "stash list docs"',
      'git stash push -m "stash show docs"',
    ]) {
      assert.equal(decide(orchestrator, command), "ask", command);
    }
  });

  test("orchestrator commit asks hold over messages mentioning gated words", () => {
    for (const command of [
      'git commit -m "please switch now"',
      'git commit -m "please clean now"',
      'git commit -m "revert stash list docs"',
      'git commit -m "revert stash show docs"',
      'git -C . commit -m "please switch now"',
      'git -C . commit -m "revert stash list docs"',
    ]) {
      assert.equal(decide(orchestrator, command), "ask", command);
    }
  });

  test("orchestrator denies the shell escape routes", () => {
    assert.equal(decide(orchestrator, "command git status"), "deny");
    assert.equal(decide(orchestrator, "env git status"), "deny");
  });

  test("orchestrator still allows unrelated read-only commands", () => {
    for (const command of ["git status --porcelain", "git diff HEAD", "git log --oneline", "ls -la"]) {
      assert.equal(decide(orchestrator, command), "allow", command);
    }
  });
});

// ---------------------------------------------------------------------------
// Entrypoint tests: the shipped default export's setup() and server().
//
// These drive the real default export against fake editors and a fake client,
// loading the shipped agent and skill files instead of copying their content.
// A fake editor proves the registration payload and transform behavior, not real
// host config layering: this is offline unit/static evidence and does not
// establish live OpenCode layering, UI outcomes or agent compliance.
// ---------------------------------------------------------------------------

const ROOT = path.dirname(path.dirname(realpathSync(fileURLToPath(import.meta.url))));
const SHIPPED_SKILLS = ["yacao-implementation", "yacao-planning", "yacao-review"];
const SHIPPED_AGENTS = ["orchestrator", "builder"];

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/;

const readShippedSkill = (id) => {
  const raw = readFileSync(path.join(ROOT, "skills", id, "SKILL.md"), "utf8");
  const match = FRONTMATTER.exec(raw);
  assert.ok(match, `skill ${id} has frontmatter`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { fields, body: raw.slice(match[0].length) };
};

const readShippedAgent = (name) =>
  JSON.parse(readFileSync(path.join(ROOT, "agents", `${name}.json`), "utf8"));

const readShippedPrompt = (name) =>
  readFileSync(path.join(ROOT, "agents", "prompts", `${name}.md`), "utf8");

// Host scaffold: built-in primary agents carrying the blanket allow.
const HOST_BLANKET_ALLOW = [{ action: "*", resource: "*", effect: "allow" }];
const hostAgents = () => ({
  build: { name: "build", mode: "primary", permissions: structuredClone(HOST_BLANKET_ALLOW) },
  plan: { name: "plan", mode: "primary", permissions: structuredClone(HOST_BLANKET_ALLOW) },
});

const hostSkills = () => ({
  "builtin-skill": {
    id: "builtin-skill",
    name: "builtin",
    description: "host built-in skill",
    path: "/host/builtin/SKILL.md",
    content: "host body",
  },
});

const createSkillEditor = (initial = {}) => {
  const skills = new Map(Object.entries(initial));
  return {
    skills,
    add(skill) {
      skills.set(skill.id, skill);
    },
  };
};

// Captures the transform callback so a replay can be driven on a fresh editor.
const captureTransform = (editor) => {
  const state = { callback: null, calls: 0 };
  return {
    state,
    transform: async (callback) => {
      state.callback = callback;
      state.calls += 1;
      callback(editor);
    },
  };
};

const skillSnapshot = (editor) =>
  [...editor.skills.values()].sort((a, b) => a.id.localeCompare(b.id));

describe("plugin.setup - V2 skills", () => {
  test("registers the shipped skills additively with absolute paths and real bodies", async () => {
    const editor = createSkillEditor(hostSkills());
    const capture = captureTransform(editor);
    await plugin.setup({ skill: { transform: capture.transform } });

    assert.equal(capture.state.calls, 1);
    assert.equal(editor.skills.size, SHIPPED_SKILLS.length + 1);
    assert.ok(editor.skills.has("builtin-skill"), "host skill is preserved");

    for (const id of SHIPPED_SKILLS) {
      const shipped = readShippedSkill(id);
      const registered = editor.skills.get(id);
      assert.ok(registered, `${id} is registered`);
      assert.deepEqual(Object.keys(registered).sort(), [
        "content",
        "description",
        "id",
        "name",
        "path",
      ]);
      assert.equal(registered.id, id);
      assert.equal(registered.name, shipped.fields.name);
      assert.equal(registered.description, shipped.fields.description);
      assert.equal(registered.path, path.join(ROOT, "skills", id, "SKILL.md"));
      assert.ok(path.isAbsolute(registered.path));
      assert.equal(registered.content, shipped.body);
      assert.ok(registered.content.trim().length > 0);
    }
  });

  test("transform replay is stable", async () => {
    const editor = createSkillEditor(hostSkills());
    const capture = captureTransform(editor);
    await plugin.setup({ skill: { transform: capture.transform } });

    const replay = createSkillEditor(hostSkills());
    capture.state.callback(replay);
    assert.deepEqual(skillSnapshot(replay), skillSnapshot(editor));
  });

  test("a skill transform rejection is logged and does not reject setup", async () => {
    const editor = createEditor(hostAgents());
    const capture = captureTransform(editor);
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.map(String).join(" "));
    try {
      await assert.doesNotReject(
        plugin.setup({
          skill: {
            transform: async () => {
              throw new Error("registration refused");
            },
          },
          agent: { transform: capture.transform },
        }),
      );
    } finally {
      console.error = originalError;
    }
    assert.equal(errors.length, 1);
    assert.match(errors[0], /YACAO plugin failed/);
    assert.match(errors[0], /registration refused/);
    // Registration of the other capability is independent.
    assert.equal(capture.state.calls, 1);
    assert.ok(editor.agents.builder, "agents still registered after a skill failure");
  });

  test("legacy or missing V2 registration APIs no-op safely", async () => {
    await assert.doesNotReject(plugin.setup());
    await assert.doesNotReject(plugin.setup({}));
    await assert.doesNotReject(plugin.setup({ skill: {}, agent: {} }));
    await assert.doesNotReject(plugin.setup({ skill: { transform: undefined } }));
  });
});

describe("plugin.setup - V2 agents", () => {
  test("registers the shipped agents with forced mode, resolved prompts and replaced permissions", async () => {
    const editor = createEditor({
      ...hostAgents(),
      builder: { model: { providerID: "anthropic", id: "claude" } },
    });
    const capture = captureTransform(editor);
    await plugin.setup({ agent: { transform: capture.transform } });

    assert.equal(capture.state.calls, 1);
    // The host built-ins are untouched.
    assert.deepEqual(editor.agents.build.permissions, HOST_BLANKET_ALLOW);
    assert.equal(editor.agents.build.mode, "primary");

    for (const name of SHIPPED_AGENTS) {
      const shipped = readShippedAgent(name);
      const agent = editor.agents[name];
      assert.ok(agent, `${name} is registered`);
      assert.equal(agent.name, name);
      assert.equal(agent.mode, shipped.mode);
      assert.equal(agent.description, shipped.description);
      // The prompt is resolved from the {file:...} reference, not left literal.
      assert.equal(shipped.prompt, `{file:./prompts/${name}.md}`);
      assert.equal(agent.system, readShippedPrompt(name));
      assert.notEqual(agent.system, shipped.prompt);
      assert.deepEqual(agent.permissions, agentPermissionRules(shipped.permission));
    }

    // The shipped definitions carry no model, so no default is introduced.
    assert.equal("model" in readShippedAgent("orchestrator"), false);
    assert.equal(editor.agents.orchestrator.model, undefined);
    // A user-selected model survives the transform.
    assert.deepEqual(editor.agents.builder.model, { providerID: "anthropic", id: "claude" });
  });

  test("agent transform replay is stable", async () => {
    const editor = createEditor(hostAgents());
    const capture = captureTransform(editor);
    await plugin.setup({ agent: { transform: capture.transform } });

    const replay = createEditor(hostAgents());
    capture.state.callback(replay);
    for (const name of SHIPPED_AGENTS) {
      assert.deepEqual(replay.agents[name], editor.agents[name]);
    }
  });

  test("an agent transform rejection is logged and does not reject setup", async () => {
    const editor = createSkillEditor(hostSkills());
    const capture = captureTransform(editor);
    const errors = [];
    const originalError = console.error;
    console.error = (...args) => errors.push(args.map(String).join(" "));
    try {
      await assert.doesNotReject(
        plugin.setup({
          skill: { transform: capture.transform },
          agent: {
            transform: async () => {
              throw new Error("agent registration refused");
            },
          },
        }),
      );
    } finally {
      console.error = originalError;
    }
    assert.equal(errors.length, 1);
    assert.match(errors[0], /YACAO plugin failed/);
    assert.equal(capture.state.calls, 1);
    assert.ok(editor.skills.has("yacao-review"), "skills still registered after an agent failure");
  });

  test("setup without the agent transform still registers skills", async () => {
    const editor = createSkillEditor(hostSkills());
    const capture = captureTransform(editor);
    await plugin.setup({ skill: { transform: capture.transform } });
    assert.equal(capture.state.calls, 1);
    assert.ok(editor.skills.has("yacao-planning"));
  });
});

const createFakeClient = () => {
  const calls = { toasts: [], logs: [] };
  return {
    calls,
    tui: {
      showToast: async ({ body }) => {
        calls.toasts.push(body);
      },
    },
    app: {
      log: async ({ body }) => {
        calls.logs.push(body);
      },
    },
  };
};

// A fresh module instance per server test isolates the once-per-process
// `notified` flag and keeps the tests independent of each other's order.
let entrypointCase = 0;
const loadFreshPlugin = () => {
  entrypointCase += 1;
  const url = new URL("../plugin/yacao.js", import.meta.url);
  url.searchParams.set("entrypoint", String(entrypointCase));
  return import(url.href);
};

// Runs server() inside a scoped sandbox: it captures the timers server() arms so
// none stays pending, blocks and records any network call, points the update
// cache at a throwaway directory, and restores every global in a finally.
const withServerSandbox = async (serverArgs, body) => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalFetch = globalThis.fetch;
  const originalCache = process.env.XDG_CACHE_HOME;
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "yacao-test-"));
  const timers = [];
  const fetchCalls = [];
  process.env.XDG_CACHE_HOME = cacheDir;
  globalThis.setTimeout = (callback, delay, ...args) => {
    const handle = originalSetTimeout(callback, delay, ...args);
    timers.push({ callback, delay, handle });
    return handle;
  };
  globalThis.fetch = async (...args) => {
    fetchCalls.push(args);
    throw new Error("network disabled in tests");
  };
  try {
    const fresh = await loadFreshPlugin();
    const server = await fresh.default.server(serverArgs);
    return await body({ server, timers, fetchCalls, cacheDir });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.fetch = originalFetch;
    if (originalCache === undefined) delete process.env.XDG_CACHE_HOME;
    else process.env.XDG_CACHE_HOME = originalCache;
    for (const { handle } of timers) clearTimeout(handle);
    rmSync(cacheDir, { recursive: true, force: true });
  }
};

const cacheFile = (cacheDir) => path.join(cacheDir, "yacao", "last-update-check.json");

describe("plugin.server - V1 config injection", () => {
  test("injects resolved agent definitions, the skills path and the default agent", async () => {
    const client = createFakeClient();
    await withServerSandbox(
      { client, directory: "/work", worktree: "/work", options: {} },
      async ({ server, timers }) => {
        assert.equal(timers.length, 2);
        const config = {};
        await server.config(config);

        assert.deepEqual(Object.keys(config.agent).sort(), ["builder", "orchestrator"]);
        for (const name of SHIPPED_AGENTS) {
          const shipped = readShippedAgent(name);
          const injected = config.agent[name];
          assert.equal(injected.mode, shipped.mode);
          assert.equal(injected.prompt, readShippedPrompt(name));
          assert.notEqual(injected.prompt, shipped.prompt);
          assert.deepEqual(injected.permission, shipped.permission);
          assert.equal(injected.temperature, shipped.temperature);
        }
        assert.deepEqual(config.skills.paths, [path.join(ROOT, "skills")]);
        assert.equal(config.default_agent, "orchestrator");
        // The pending timers have not produced any side effect.
        assert.equal(client.calls.toasts.length, 0);
        assert.equal(client.calls.logs.length, 0);
      },
    );
  });

  test("preserves scalar and nested user overrides and dedupes the skills path", async () => {
    const client = createFakeClient();
    await withServerSandbox(
      { client, directory: "/work", worktree: "/work", options: {} },
      async ({ server }) => {
        const config = {
          agent: {
            orchestrator: {
              model: "user/model",
              temperature: 0.9,
              permission: { read: { "*.env": "deny" } },
            },
          },
          skills: { paths: ["/existing/skills"] },
          default_agent: "build",
        };
        await server.config(config);

        const orchestrator = config.agent.orchestrator;
        assert.equal(orchestrator.model, "user/model");
        assert.equal(orchestrator.temperature, 0.9);
        // Nested merge keeps the shipped sibling rules.
        assert.equal(orchestrator.permission.read["*.env"], "deny");
        assert.equal(orchestrator.permission.read["*"], "allow");
        assert.equal(orchestrator.permission.edit["*"], "deny");
        // The skills path is appended once, the existing entry is kept.
        assert.deepEqual(config.skills.paths, ["/existing/skills", path.join(ROOT, "skills")]);
        // An explicit default agent is not overwritten.
        assert.equal(config.default_agent, "build");
      },
    );
  });

  test("a repeated config invocation is stable", async () => {
    const client = createFakeClient();
    await withServerSandbox(
      { client, directory: "/work", worktree: "/work", options: {} },
      async ({ server }) => {
        const config = {};
        await server.config(config);
        const first = structuredClone(config);
        await server.config(config);
        assert.deepEqual(config, first);
        assert.equal(
          config.skills.paths.filter((entry) => entry === path.join(ROOT, "skills")).length,
          1,
        );
        assert.equal(config.default_agent, "orchestrator");
      },
    );
  });
});

describe("plugin.server - V1 timers and notification", () => {
  test("arms two timers and stays offline while they are pending", async () => {
    const client = createFakeClient();
    await withServerSandbox(
      { client, directory: "/work", worktree: "/work", options: {} },
      async ({ server, timers, fetchCalls, cacheDir }) => {
        assert.equal(timers.length, 2);
        assert.deepEqual(timers.map((timer) => timer.delay), [5000, 5000]);
        assert.equal(typeof server.event, "function");

        // No immediate side effect: no toast, no log, no request, no cache write.
        assert.equal(client.calls.toasts.length, 0);
        assert.equal(client.calls.logs.length, 0);
        assert.equal(fetchCalls.length, 0);
        assert.equal(existsSync(cacheFile(cacheDir)), false);

        // Firing the update timer (the second one armed) with autoUpdate off
        // stays offline: no request, no TTL claim, no toast.
        await timers[1].callback();
        assert.equal(fetchCalls.length, 0);
        assert.equal(existsSync(cacheFile(cacheDir)), false);
        assert.equal(client.calls.toasts.length, 0);
      },
    );
  });

  test("session.created notifies once on the fake client and clears the fallback timer", async () => {
    const client = createFakeClient();
    await withServerSandbox(
      { client, directory: "/work", worktree: "/work", options: {} },
      async ({ server, fetchCalls, cacheDir }) => {
        await server.event({ event: { type: "session.created" } });
        assert.equal(client.calls.toasts.length, 1);
        assert.equal(client.calls.toasts[0].title, "YACAO");
        assert.match(client.calls.toasts[0].message, /loaded/);
        assert.equal(client.calls.toasts[0].variant, "info");
        assert.equal(client.calls.logs.length, 1);
        assert.equal(client.calls.logs[0].service, "yacao");
        assert.equal(client.calls.logs[0].level, "info");

        // Once per module instance: a second event does not re-toast.
        await server.event({ event: { type: "session.created" } });
        assert.equal(client.calls.toasts.length, 1);
        // Unrelated events are ignored.
        await server.event({ event: { type: "session.updated" } });
        assert.equal(client.calls.toasts.length, 1);

        // The notification path stays fully offline.
        assert.equal(fetchCalls.length, 0);
        assert.equal(existsSync(cacheFile(cacheDir)), false);
      },
    );
  });
});
