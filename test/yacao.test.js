import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
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
