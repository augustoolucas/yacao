// Tests for the Claude Code plugin generator (scripts/build-claude-code.mjs)
// and the bundle it produces. They drive the exported generator API and the
// CLI directly, so no Claude Code install is required.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkPlugin,
  generatePlugin,
  OUTPUT_PATHS,
  PLUGIN_ROOT,
} from "../scripts/build-claude-code.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "build-claude-code.mjs");

const SOURCE_FILES = [
  "package.json",
  "agents/orchestrator.json",
  "agents/builder.json",
  "agents/prompts/orchestrator.md",
  "agents/prompts/builder.md",
  "skills/yacao-planning/SKILL.md",
  "skills/yacao-implementation/SKILL.md",
  "skills/yacao-review/SKILL.md",
];

const createFixture = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "yacao-claude-code-"));
  for (const rel of SOURCE_FILES) {
    const destination = path.join(dir, rel);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(ROOT, rel), destination);
  }
  return dir;
};

const withFixture = (body) => {
  const dir = createFixture();
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const runCli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

const pluginFile = (root, rel) => path.join(root, PLUGIN_ROOT, rel);

const readBundle = (root) => {
  const bundle = {};
  for (const rel of OUTPUT_PATHS) bundle[rel] = readFileSync(pluginFile(root, rel), "utf8");
  return bundle;
};

const readJson = (root, rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));

const listFiles = (dir) => {
  const entries = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else entries.push(path.relative(dir, full));
    }
  };
  if (existsSync(dir)) walk(dir);
  return entries.sort();
};

const snapshotDir = (dir) => {
  const snapshot = {};
  for (const rel of listFiles(dir)) snapshot[rel] = readFileSync(path.join(dir, rel), "utf8");
  return snapshot;
};

// The generated frontmatter is JSON syntax, so every field value must parse
// with JSON.parse; the walk doubles as the "valid frontmatter" check.
const frontmatter = (content) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(content);
  assert.ok(match, "generated markdown starts with frontmatter");
  const fields = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(": ");
    assert.ok(separator > 0, `frontmatter line is key: value: ${line}`);
    fields[line.slice(0, separator)] = JSON.parse(line.slice(separator + 2));
  }
  return { fields, body: content.slice(match[0].length).replace(/^\n+/, "") };
};

// Stale OpenCode host terms that must never survive into the bundle.
const FORBIDDEN = [
  /opencode/i,
  /`Task`/,
  /task_id/,
  /sessionID/,
  /delegation tool/,
  /(?<![\w:"])[Bb]uilder\b/,
  /yacao-(?:planning|implementation|review)/,
  /\{file:/,
  /\.\.\//,
];

describe("claude-code bundle generation", () => {
  test("produces exactly the allowlisted bundle: two agents and three skills", () => {
    const files = generatePlugin({ root: ROOT });
    assert.deepEqual(Object.keys(files).sort(), [...OUTPUT_PATHS].sort());
    const agents = Object.keys(files).filter((rel) => rel.startsWith("agents/"));
    const skills = Object.keys(files).filter((rel) => rel.startsWith("skills/"));
    assert.equal(agents.length, 2);
    assert.equal(skills.length, 3);
    assert.deepEqual(agents.sort(), ["agents/builder.md", "agents/orchestrator.md"]);
    assert.deepEqual(skills.sort(), [
      "skills/implementation/SKILL.md",
      "skills/planning/SKILL.md",
      "skills/review/SKILL.md",
    ]);
  });

  test("is deterministic: two generations are byte-identical", () => {
    const first = generatePlugin({ root: ROOT });
    const second = generatePlugin({ root: ROOT });
    assert.deepEqual(second, first);
    for (const rel of OUTPUT_PATHS) assert.equal(second[rel], first[rel], rel);
  });

  test("the committed bundle matches the generator output", () => {
    assert.deepEqual(readBundle(ROOT), generatePlugin({ root: ROOT }));
  });

  test("generation leaves the canonical sources and runtime untouched", () => {
    const tracked = [...SOURCE_FILES, "index.js", "plugin/yacao.js"];
    const before = new Map(tracked.map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));
    generatePlugin({ root: ROOT });
    for (const rel of tracked) {
      assert.equal(readFileSync(path.join(ROOT, rel), "utf8"), before.get(rel), rel);
    }
  });

  test("every generated file is ASCII-only", () => {
    const files = generatePlugin({ root: ROOT });
    for (const rel of OUTPUT_PATHS) {
      assert.ok(!/[^\x09\x0A\x20-\x7E]/.test(files[rel]), `${rel} is ASCII-only`);
    }
  });
});

describe("claude-code agent and skill frontmatter", () => {
  const files = generatePlugin({ root: ROOT });

  test("agents carry canonical names and descriptions from the JSON sources", () => {
    const canonicalDescription = (name) => readJson(ROOT, `agents/${name}.json`).description;
    const orchestrator = frontmatter(files["agents/orchestrator.md"]);
    const builder = frontmatter(files["agents/builder.md"]);
    assert.equal(orchestrator.fields.name, "orchestrator");
    assert.equal(builder.fields.name, "builder");
    assert.equal(
      orchestrator.fields.description,
      canonicalDescription("orchestrator").replace("delegates to builder", "delegates to yacao:builder"),
    );
    assert.equal(builder.fields.description, canonicalDescription("builder"));
    assert.ok(Array.isArray(orchestrator.fields.tools));
    assert.ok(Array.isArray(builder.fields.tools));
  });

  test("skills carry the names Claude Code invokes as yacao:<name>", () => {
    const expected = {
      planning: "skills/planning/SKILL.md",
      implementation: "skills/implementation/SKILL.md",
      review: "skills/review/SKILL.md",
    };
    for (const [name, rel] of Object.entries(expected)) {
      const skill = frontmatter(files[rel]);
      assert.equal(skill.fields.name, name);
      assert.equal(typeof skill.fields.description, "string");
      assert.ok(skill.fields.description.length > 0);
      assert.ok(skill.body.startsWith("# "), `${rel} keeps its markdown body`);
    }
  });

  test("builder inherits the caller's model and no OpenCode fields leak", () => {
    const builder = frontmatter(files["agents/builder.md"]);
    assert.equal(builder.fields.model, "inherit");
    for (const rel of ["agents/orchestrator.md", "agents/builder.md"]) {
      const { fields } = frontmatter(files[rel]);
      for (const field of ["mode", "temperature", "provider", "permission", "permissionMode", "hooks"]) {
        assert.ok(!(field in fields), `${rel} must not declare ${field}`);
      }
    }
  });

  test("tool lists match the scoped roles", () => {
    const orchestrator = frontmatter(files["agents/orchestrator.md"]).fields.tools;
    const builder = frontmatter(files["agents/builder.md"]).fields.tools;
    assert.ok(orchestrator.includes("Agent(yacao:builder, Explore)"));
    assert.ok(orchestrator.includes("SendMessage"));
    assert.ok(orchestrator.includes("AskUserQuestion"));
    for (const tool of ["Read", "Grep", "Glob", "WebFetch", "WebSearch", "Bash", "Edit", "Write"]) {
      assert.ok(orchestrator.includes(tool), `orchestrator has ${tool}`);
    }
    assert.ok(builder.includes("Agent"));
    assert.ok(!builder.includes("AskUserQuestion"));
    for (const tool of ["Read", "Grep", "Glob", "WebFetch", "WebSearch", "Bash", "Edit", "Write"]) {
      assert.ok(builder.includes(tool), `builder has ${tool}`);
    }
    for (const tools of [orchestrator, builder]) assert.ok(!tools.includes("Skill"));
  });
});

describe("claude-code host binding", () => {
  const files = generatePlugin({ root: ROOT });

  test("no stale OpenCode host terms or paths survive", () => {
    for (const rel of OUTPUT_PATHS) {
      for (const pattern of FORBIDDEN) {
        assert.ok(!pattern.test(files[rel]), `${rel} must not match ${pattern}`);
      }
    }
  });

  test("every file path in the generated text lives under the plugin root or .yacao/plans", () => {
    const pathToken = /(?<![\w./<>*?-])((?:[\w<>.*?-]+\/)+[\w<>.*?-]+\.(?:md|json|mjs|js|ts|yml|yaml))\b/g;
    for (const rel of OUTPUT_PATHS) {
      for (const token of files[rel].match(pathToken) ?? []) {
        assert.ok(token.startsWith(".yacao/plans/"), `${rel} references ${token}, outside .yacao/plans`);
      }
      assert.ok(!/(^|\s)\/(?:home|Users|etc|var|tmp|usr)\//.test(files[rel]), `${rel} has no absolute host path`);
    }
  });

  test("skill references use the yacao namespace", () => {
    const orchestrator = files["agents/orchestrator.md"];
    for (const skill of ["yacao:planning", "yacao:implementation", "yacao:review"]) {
      assert.ok(orchestrator.includes(`\`${skill}\``), `orchestrator references ${skill}`);
    }
    assert.match(files["skills/planning/SKILL.md"], /`yacao:implementation`/);
    assert.match(files["skills/review/SKILL.md"], /`yacao:implementation`/);
    assert.match(files["skills/implementation/SKILL.md"], /`yacao:review`/);
  });

  test("agent invocations use Explore and the qualified yacao:builder", () => {
    assert.match(files["agents/orchestrator.md"], /dispatch `Explore` subagents/);
    assert.match(files["agents/builder.md"], /dispatch the `Explore` subagent via the Agent tool/);
    assert.match(files["agents/orchestrator.md"], /All code changes go through yacao:builder/);
    assert.match(files["agents/orchestrator.md"], /delegating code changes to the yacao:builder/);
  });

  test("protocol paths use .yacao/plans", () => {
    assert.match(files["agents/orchestrator.md"], /plan Markdown under `\.yacao\/plans\/`/);
    assert.match(files["skills/planning/SKILL.md"], /`\.yacao\/plans\/plan-<slug>\/plan\.md`/);
    assert.match(
      files["skills/implementation/SKILL.md"],
      /`\.yacao\/plans\/plan-<slug>\/tasks\/task-XX-<name>\.md`/,
    );
  });
});

describe("claude-code implementation skill dispatch guidance", () => {
  const content = generatePlugin({ root: ROOT })["skills/implementation/SKILL.md"];

  test("carries explicit Claude Code dispatch and continuation wording", () => {
    assert.match(content, /dispatch the explicit custom agent type `yacao:builder`/);
    assert.match(content, /never a fork or a teammate/);
    assert.match(content, /record the actual returned agent ID/);
    assert.match(content, /never fabricate one/);
    assert.match(content, /the \*\*SendMessage\*\* tool/);
    assert.match(content, /wait for the agent to actually complete before reviewing/);
    assert.ok(!/V1 exposes|V2 exposes|sessionID|task_id|delegation tool/.test(content));
  });

  test("keeps the narrow builder context and the task status rules", () => {
    assert.match(content, /Never send the full plan overview or future task contracts/);
    assert.match(content, /Start a fresh session for unrelated tasks/);
    for (const status of ["`complete`", "`partial`", "`blocked`", "`escalate`"]) {
      assert.ok(content.includes(status), status);
    }
  });
});

describe("claude-code manifest", () => {
  const manifestText = generatePlugin({ root: ROOT })[".claude-plugin/plugin.json"];
  const manifest = JSON.parse(manifestText);

  test("name, MIT license and the default agent", () => {
    assert.equal(manifest.name, "yacao");
    assert.equal(manifest.license, "MIT");
    assert.deepEqual(manifest.settings, { agent: "orchestrator" });
  });

  test("version stays in sync with package.json", () => {
    assert.equal(manifest.version, readJson(ROOT, "package.json").version);
  });

  test("description speaks for Claude Code, not OpenCode", () => {
    assert.match(manifest.description, /Yet Another Coding Agent Orchestrator/);
    assert.match(manifest.description, /Claude Code/);
    assert.ok(!/opencode/i.test(manifest.description));
  });

  test("declares no hooks, permission arrays or update callbacks", () => {
    for (const key of ["hooks", "permissions", "permission", "mcpServers", "update"]) {
      assert.ok(!(key in manifest), `manifest must not declare ${key}`);
    }
    assert.deepEqual(Object.keys(manifest.settings), ["agent"]);
  });
});

describe("claude-code guardrails adapter", () => {
  const guardrails = JSON.parse(generatePlugin({ root: ROOT })["guardrails.json"]);
  const CANONICAL_CATEGORIES = ["bash", "read", "edit", "skill", "task"];

  const adaptPattern = (pattern) =>
    pattern
      .replaceAll(".opencode/plans", ".yacao/plans")
      .replaceAll("yacao-planning", "yacao:planning")
      .replaceAll("yacao-implementation", "yacao:implementation")
      .replaceAll("yacao-review", "yacao:review")
      .replace(/^builder$/, "yacao:builder")
      .replace(/^explore$/, "Explore");

  test("uses exactly-qualified agent keys and the ordered categories", () => {
    assert.deepEqual(Object.keys(guardrails), ["yacao:orchestrator", "yacao:builder"]);
    assert.deepEqual(Object.keys(guardrails["yacao:orchestrator"]), ["bash", "read", "edit", "task"]);
    assert.deepEqual(Object.keys(guardrails["yacao:builder"]), ["bash", "read", "skill", "task"]);
  });

  test("mirrors the canonical rule order, patterns and decisions", () => {
    for (const name of ["orchestrator", "builder"]) {
      const canonical = readJson(ROOT, `agents/${name}.json`).permission;
      const role = guardrails[`yacao:${name}`];
      for (const category of CANONICAL_CATEGORIES) {
        if (!(category in canonical)) {
          assert.ok(!(category in role), `${name} has no ${category} policy`);
          continue;
        }
        const expected = Object.entries(canonical[category]).map(([pattern, decision]) => ({
          pattern: adaptPattern(pattern),
          decision,
        }));
        assert.deepEqual(role[category], expected, `${name} ${category}`);
      }
    }
  });

  test("drops OpenCode-only entries and adapts paths and names", () => {
    const text = generatePlugin({ root: ROOT })["guardrails.json"];
    assert.ok(!/external_directory|doom_loop|lsp|"question"/.test(text));
    assert.ok(!/"\*"\s*:/.test(text), "no object key is a blanket wildcard");
    assert.ok(text.includes('".yacao/plans/*.md"'));
    assert.ok(text.includes('".yacao/plans/*"'));
    assert.ok(text.includes('"yacao:builder"'));
    assert.ok(text.includes('"Explore"'));
    for (const skill of ["yacao:planning", "yacao:implementation", "yacao:review"]) {
      assert.ok(text.includes(`"${skill}"`), skill);
    }
  });
});

describe("claude-code generation failures", () => {
  test("fails on a missing source", () => {
    withFixture((dir) => {
      rmSync(path.join(dir, "skills/yacao-review/SKILL.md"));
      assert.throws(
        () => generatePlugin({ root: dir }),
        /missing source: skills\/yacao-review\/SKILL\.md/,
      );
    });
  });

  test("fails on a missing prompt referenced by an agent definition", () => {
    withFixture((dir) => {
      rmSync(path.join(dir, "agents/prompts/builder.md"));
      assert.throws(
        () => generatePlugin({ root: dir }),
        /missing source: agents\/prompts\/builder\.md/,
      );
    });
  });

  test("fails on an unsupported agent field", () => {
    withFixture((dir) => {
      const rel = path.join(dir, "agents/orchestrator.json");
      const definition = JSON.parse(readFileSync(rel, "utf8"));
      definition.model = "openai/gpt-4o";
      writeFileSync(rel, JSON.stringify(definition, null, 2));
      assert.throws(
        () => generatePlugin({ root: dir }),
        /unsupported field "model" in agents\/orchestrator\.json/,
      );
    });
  });

  test("fails on an unsupported permission key", () => {
    withFixture((dir) => {
      const rel = path.join(dir, "agents/builder.json");
      const definition = JSON.parse(readFileSync(rel, "utf8"));
      definition.permission.webfetch = "allow";
      writeFileSync(rel, JSON.stringify(definition, null, 2));
      assert.throws(
        () => generatePlugin({ root: dir }),
        /unsupported permission key "webfetch" in agents\/builder\.json/,
      );
    });
  });

  test("fails on a renamed skill", () => {
    withFixture((dir) => {
      const rel = path.join(dir, "skills/yacao-planning/SKILL.md");
      const content = readFileSync(rel, "utf8").replace(
        "name: yacao-planning",
        "name: planning",
      );
      writeFileSync(rel, content);
      assert.throws(
        () => generatePlugin({ root: dir }),
        /unsupported skill name "planning" in skills\/yacao-planning\/SKILL\.md/,
      );
    });
  });

  test("fails when the canonical terminology paragraph is gone", () => {
    withFixture((dir) => {
      const rel = path.join(dir, "skills/yacao-implementation/SKILL.md");
      const content = readFileSync(rel, "utf8");
      const stripped = content.replace(/^> \*\*Delegation tool terminology\.\*\*.*$/m, "");
      assert.notEqual(stripped, content, "fixture keeps the paragraph");
      writeFileSync(rel, stripped);
      assert.throws(() => generatePlugin({ root: dir }), /terminology paragraph/);
    });
  });
});

describe("claude-code --check mode", () => {
  test("passes on the committed bundle", () => {
    const result = runCli(["--check"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /up to date/);
  });

  test("writes exactly the allowlist and repeated builds are byte-identical", () => {
    withFixture((dir) => {
      assert.equal(runCli(["--root", dir]).status, 0);
      const pluginDir = path.join(dir, PLUGIN_ROOT);
      assert.deepEqual(listFiles(pluginDir), [...OUTPUT_PATHS].sort());
      const first = snapshotDir(pluginDir);
      const second = runCli(["--root", dir]);
      assert.equal(second.status, 0, second.stderr);
      assert.deepEqual(snapshotDir(pluginDir), first);
      assert.equal(runCli(["--check", "--root", dir]).status, 0);
    });
  });

  test("fails on a modified output without rewriting it", () => {
    withFixture((dir) => {
      assert.equal(runCli(["--root", dir]).status, 0);
      const target = pluginFile(dir, "guardrails.json");
      const modified = `${readFileSync(target, "utf8")}\n`;
      writeFileSync(target, modified);
      const pluginDir = path.join(dir, PLUGIN_ROOT);
      const before = snapshotDir(pluginDir);
      const result = runCli(["--check", "--root", dir]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /differs: integrations\/claude-code\/guardrails\.json/);
      assert.deepEqual(snapshotDir(pluginDir), before);
      assert.equal(readFileSync(target, "utf8"), modified, "the check does not rewrite the file");
    });
  });

  test("fails on a deleted output without recreating it", () => {
    withFixture((dir) => {
      assert.equal(runCli(["--root", dir]).status, 0);
      const target = pluginFile(dir, "agents/builder.md");
      rmSync(target);
      const pluginDir = path.join(dir, PLUGIN_ROOT);
      const before = snapshotDir(pluginDir);
      const result = runCli(["--check", "--root", dir]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /missing: integrations\/claude-code\/agents\/builder\.md/);
      assert.ok(!existsSync(target), "the check does not recreate the file");
      assert.deepEqual(snapshotDir(pluginDir), before);
    });
  });

  test("checkPlugin reports mismatches and never writes", () => {
    withFixture((dir) => {
      assert.equal(runCli(["--root", dir]).status, 0);
      assert.deepEqual(checkPlugin({ root: dir }), { ok: true, mismatches: [] });
      const target = pluginFile(dir, "skills/review/SKILL.md");
      writeFileSync(target, "");
      const pluginDir = path.join(dir, PLUGIN_ROOT);
      const before = snapshotDir(pluginDir);
      const result = checkPlugin({ root: dir });
      assert.equal(result.ok, false);
      assert.deepEqual(result.mismatches, [{ path: "skills/review/SKILL.md", reason: "differs" }]);
      assert.deepEqual(snapshotDir(pluginDir), before);
    });
  });
});
