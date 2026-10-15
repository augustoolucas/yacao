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
  symlinkSync,
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
  STATIC_PATHS,
} from "../scripts/build-claude-code.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "build-claude-code.mjs");
const GUARD = path.join(ROOT, PLUGIN_ROOT, "hooks", "guard.mjs");
const HOOKS_JSON = path.join(ROOT, PLUGIN_ROOT, "hooks", "hooks.json");

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

// The hand-authored statics complete the fixture: --check requires them, and
// generation scans their text.
const STATIC_FILES = STATIC_PATHS.map((rel) => path.posix.join(PLUGIN_ROOT, rel));

const createFixture = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "yacao-claude-code-"));
  for (const rel of [...SOURCE_FILES, ...STATIC_FILES]) {
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
    const tracked = [...SOURCE_FILES, ...STATIC_FILES, "index.js", "plugin/yacao.js"];
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

  // Generated text plus the hand-authored statics: the scans cover the whole
  // bundle, not only the generated files.
  const bundleTexts = () => {
    const texts = { ...files };
    for (const rel of STATIC_PATHS) texts[rel] = readFileSync(pluginFile(ROOT, rel), "utf8");
    return texts;
  };

  test("no stale OpenCode host terms or paths survive", () => {
    const bundle = bundleTexts();
    for (const rel of Object.keys(bundle)) {
      for (const pattern of FORBIDDEN) {
        assert.ok(!pattern.test(bundle[rel]), `${rel} must not match ${pattern}`);
      }
    }
  });

  test("every file path in the bundle text lives under the plugin root or .yacao/plans", () => {
    const pathToken = /(?<![\w./<>*?-])((?:[\w<>.*?-]+\/)+[\w<>.*?-]+\.(?:md|json|mjs|js|ts|yml|yaml))\b/g;
    const bundle = bundleTexts();
    for (const rel of Object.keys(bundle)) {
      for (const token of bundle[rel].match(pathToken) ?? []) {
        assert.ok(token.startsWith(".yacao/plans/"), `${rel} references ${token}, outside .yacao/plans`);
      }
      assert.ok(!/(^|\s)\/(?:home|Users|etc|var|tmp|usr)\//.test(bundle[rel]), `${rel} has no absolute host path`);
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

  test("produces exactly the generated allowlist beside the statics, byte-identical on rebuild", () => {
    withFixture((dir) => {
      assert.equal(runCli(["--root", dir]).status, 0);
      const pluginDir = path.join(dir, PLUGIN_ROOT);
      assert.deepEqual(listFiles(pluginDir), [...OUTPUT_PATHS, ...STATIC_PATHS].sort());
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

// A throwaway project root for the file-tool cases: absolute file_path inputs
// are classified against CLAUDE_PROJECT_DIR.
const withProject = (body) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "yacao-guard-project-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Drive the hook exactly as Claude Code does: JSON on stdin, decision JSON or
// nothing on stdout, exit 0 either way. projectDir: null drops
// CLAUDE_PROJECT_DIR; CLAUDE_PLUGIN_ROOT is never set, so the packaged policy
// must be found relative to the hook itself.
const runGuard = (payload, options = {}) => {
  const env = { ...process.env };
  delete env.CLAUDE_PLUGIN_ROOT;
  if (options.projectDir === null) delete env.CLAUDE_PROJECT_DIR;
  else env.CLAUDE_PROJECT_DIR = options.projectDir ?? ROOT;
  return spawnSync(process.execPath, [options.guard ?? GUARD], {
    cwd: options.cwd ?? ROOT,
    encoding: "utf8",
    input: typeof payload === "string" ? payload : JSON.stringify(payload),
    env,
  });
};

// The full output contract: exit 0, silent stderr, and either empty stdout
// (no decision) or exactly the documented PreToolUse ask/deny object. It
// never allows, so the native gate keeps its say.
const guardDecision = (result) => {
  assert.equal(result.status, 0, `exit 0: ${result.stderr}`);
  assert.equal(result.stderr, "");
  if (result.stdout === "") return null;
  assert.ok(result.stdout.endsWith("\n"), "decision output ends with a newline");
  const parsed = JSON.parse(result.stdout);
  assert.deepEqual(Object.keys(parsed), ["hookSpecificOutput"]);
  const output = parsed.hookSpecificOutput;
  assert.deepEqual(Object.keys(output).sort(), [
    "hookEventName",
    "permissionDecision",
    "permissionDecisionReason",
  ]);
  assert.equal(output.hookEventName, "PreToolUse");
  assert.ok(["ask", "deny"].includes(output.permissionDecision), "ask or deny, never allow");
  assert.equal(typeof output.permissionDecisionReason, "string");
  assert.ok(output.permissionDecisionReason.length > 0, "a deny/ask carries a reason");
  return output;
};

const call = (role, toolName, toolInput, options) =>
  guardDecision(runGuard({ agent_type: role, tool_name: toolName, tool_input: toolInput }, options));

const bash = (role, command, options) => call(role, "Bash", { command }, options);

const noDecision = (output) => assert.equal(output, null, "falls through with no decision");

const askOrDeny = (output, decision) => {
  assert.ok(output, `a ${decision} decision is emitted`);
  assert.equal(output.permissionDecision, decision);
  return output;
};

describe("claude-code bundle statics", () => {
  test("the guard hook files are hand-authored statics outside the generated set", () => {
    assert.deepEqual([...STATIC_PATHS], ["hooks/hooks.json", "hooks/guard.mjs"]);
    for (const rel of STATIC_PATHS) {
      assert.ok(!OUTPUT_PATHS.includes(rel), `${rel} is not generated`);
      assert.deepEqual(rel, path.posix.normalize(rel), `${rel} is a plugin-root relative posix path`);
      assert.ok(existsSync(pluginFile(ROOT, rel)), `${rel} exists`);
      const text = readFileSync(pluginFile(ROOT, rel), "utf8");
      assert.ok(!/[^\x09\x0A\x20-\x7E]/.test(text), `${rel} is ASCII-only`);
      for (const pattern of FORBIDDEN) {
        assert.ok(!pattern.test(text), `${rel} must not match ${pattern}`);
      }
    }
  });

  test("hooks.json is one synchronous PreToolUse matcher over the six covered tools", () => {
    const config = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
    assert.deepEqual(Object.keys(config), ["hooks"]);
    assert.deepEqual(Object.keys(config.hooks), ["PreToolUse"]);
    const entries = config.hooks.PreToolUse;
    assert.equal(entries.length, 1);
    assert.equal(entries[0].matcher, "Bash|Read|Edit|Write|Skill|Agent");
    const hooks = entries[0].hooks;
    assert.equal(hooks.length, 1);
    assert.equal(hooks[0].type, "command");
    assert.equal(hooks[0].command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/guard.mjs"');
    assert.ok(!("async" in hooks[0]), "the matcher runs synchronously");
  });

  test("generation fails on a static that leaks forbidden host terms", () => {
    withFixture((dir) => {
      const target = pluginFile(dir, "hooks/guard.mjs");
      writeFileSync(target, `${readFileSync(target, "utf8")}\n// opencode\n`);
      assert.throws(
        () => generatePlugin({ root: dir }),
        /bundle file hooks\/guard\.mjs still contains an OpenCode reference/,
      );
    });
  });

  test("--check reports a missing static without recreating it", () => {
    withFixture((dir) => {
      assert.equal(runCli(["--root", dir]).status, 0);
      const target = pluginFile(dir, "hooks/guard.mjs");
      rmSync(target);
      const pluginDir = path.join(dir, PLUGIN_ROOT);
      const before = snapshotDir(pluginDir);
      const result = runCli(["--check", "--root", dir]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /missing: integrations\/claude-code\/hooks\/guard\.mjs/);
      assert.ok(!existsSync(target), "the check does not recreate the static");
      assert.deepEqual(snapshotDir(pluginDir), before);
    });
  });
});

describe("claude-code role guard hook", () => {
  test("only the exact qualified identities are enforced", () => {
    askOrDeny(bash("yacao:builder", "git commit -m x"), "deny");
    for (const role of [
      "builder",
      "orchestrator",
      "yacao:build",
      "yacao:builder ",
      "YACAO:BUILDER",
      "yacao:orchestrator-x",
      "",
    ]) {
      noDecision(bash(role, "git commit -m x"));
    }
    noDecision(guardDecision(runGuard({ tool_name: "Bash", tool_input: { command: "git commit -m x" } })));
    noDecision(guardDecision(runGuard({ agent_type: 7, tool_name: "Bash", tool_input: { command: "ls" } })));
    noDecision(call("yacao:builder", "WebFetch", { url: "https://example.com" }));
  });

  test("malformed or absent hook input produces no decision and exit 0", () => {
    for (const raw of ["", "not json", "null", "42", '"yacao:builder"', "[]"]) {
      noDecision(guardDecision(runGuard(raw)));
    }
    noDecision(guardDecision(runGuard({})));
    noDecision(guardDecision(runGuard({ agent_type: "yacao:builder" })));
    noDecision(guardDecision(runGuard({ agent_type: "yacao:builder", tool_name: 7, tool_input: {} })));
  });

  test("never emits allow and never rewrites tool input", () => {
    const allowed = [
      ["yacao:builder", "Bash", { command: "ls -la" }],
      ["yacao:builder", "Read", { file_path: path.join(ROOT, "index.js") }],
      ["yacao:orchestrator", "Edit", { file_path: path.join(ROOT, ".yacao", "plans", "p", "t.md") }],
      ["yacao:builder", "Skill", { skill: "anything" }],
      ["yacao:builder", "Agent", { subagent_type: "Explore" }],
    ];
    for (const [role, tool, input] of allowed) {
      const result = runGuard({ agent_type: role, tool_name: tool, tool_input: input });
      assert.equal(result.stdout, "", `${role} ${tool} falls through silently`);
      noDecision(guardDecision(result));
    }
    const denied = runGuard({
      agent_type: "yacao:builder",
      tool_name: "Bash",
      tool_input: { command: "git commit -m x" },
    });
    assert.ok(!/updatedInput/.test(denied.stdout), "the decision never rewrites input");
    assert.ok(!/"allow"/.test(denied.stdout), "the decision is never an allow");
  });

  test("plain and prefixed commits: builder denies, orchestrator asks", () => {
    for (const command of ["git commit", "git commit -m x", "git -C repo commit -m x"]) {
      askOrDeny(bash("yacao:builder", command), "deny");
      askOrDeny(bash("yacao:orchestrator", command), "ask");
    }
    const denied = askOrDeny(bash("yacao:builder", "git commit -m x"), "deny");
    assert.match(denied.permissionDecisionReason, /yacao:builder/);
    assert.match(denied.permissionDecisionReason, /git commit\*/);
    askOrDeny(bash("yacao:builder", "git push"), "ask");
    askOrDeny(bash("yacao:orchestrator", "git push origin main"), "ask");
  });

  test("command/env prefixes hit the canonical deny rules", () => {
    for (const role of ["yacao:builder", "yacao:orchestrator"]) {
      askOrDeny(bash(role, "command git status"), "deny");
      askOrDeny(bash(role, "env git status"), "deny");
    }
  });

  test("ordinary controls and the read-only stash exceptions fall through", () => {
    for (const command of ["git status", "ls -la", "grep -rn commit .", "cat package.json"]) {
      noDecision(bash("yacao:builder", command));
      noDecision(bash("yacao:orchestrator", command));
    }
    for (const command of ["git stash list", "git stash list --stat", "git stash show", "git stash show -p"]) {
      noDecision(bash("yacao:builder", command));
      noDecision(bash("yacao:orchestrator", command));
    }
    askOrDeny(bash("yacao:builder", "git stash"), "ask");
    askOrDeny(bash("yacao:builder", "git stash drop"), "ask");
    askOrDeny(bash("yacao:orchestrator", "git stash"), "ask");
  });

  test("destructive rules and argument-keyword collisions follow the ordered policy", () => {
    for (const command of ["rm -rf build", "rm -fr /tmp/x", "rm -r -f x", "rm -f -r x"]) {
      askOrDeny(bash("yacao:builder", command), "ask");
      askOrDeny(bash("yacao:orchestrator", command), "ask");
    }
    noDecision(bash("yacao:builder", "rm -rf"));
    noDecision(bash("yacao:builder", "echo rm -rf build"));
    // A keyword in argument position still matches the canonical wildcard, so
    // the builder is denied on a read-only log query - faithful to the policy.
    askOrDeny(bash("yacao:builder", "git log --grep commit"), "deny");
    askOrDeny(bash("yacao:orchestrator", "git log --grep commit"), "ask");
    noDecision(bash("yacao:builder", 'echo "git commit"'));
  });

  test("orchestrator edits may only target Markdown under .yacao/plans", () => {
    withProject((dir) => {
      const plans = path.join(dir, ".yacao", "plans");
      const options = { projectDir: dir, cwd: dir };
      const cases = [
        [path.join(plans, "plan-a", "plan.md"), null],
        [path.join(plans, "plan-a", "tasks", "task-01-x.md"), null],
        [path.join(dir, "src", "index.js"), "deny"],
        [path.join(plans, "x.js"), "deny"],
        [path.join(plans, "x.sh"), "deny"],
        [path.join(plans, "x.md.js"), "deny"],
        [path.join(plans, "..", "secrets.md"), "deny"],
        [path.join(plans, "..", "..", "outside.md"), "deny"],
        [path.join(os.tmpdir(), "yacao-guard-outside.md"), "deny"],
      ];
      for (const [filePath, expected] of cases) {
        for (const tool of ["Edit", "Write"]) {
          const output = call("yacao:orchestrator", tool, { file_path: filePath }, options);
          if (expected === null) noDecision(output);
          else askOrDeny(output, expected);
        }
      }
    });
  });

  test("read rules: .env asks, plan reads deny for the builder only", () => {
    withProject((dir) => {
      const options = { projectDir: dir, cwd: dir };
      const reads = [
        [".env", "yacao:orchestrator", "ask"],
        [".env", "yacao:builder", "ask"],
        ["config.env", "yacao:orchestrator", "ask"],
        ["config.env.local", "yacao:builder", "ask"],
        ["config.env.example", "yacao:orchestrator", null],
        ["config.env.example", "yacao:builder", null],
        ["src/index.js", "yacao:builder", null],
        ["src/index.js", "yacao:orchestrator", null],
      ];
      for (const [rel, role, expected] of reads) {
        const output = call(role, "Read", { file_path: path.join(dir, rel) }, options);
        if (expected === null) noDecision(output);
        else askOrDeny(output, expected);
      }
      const plan = path.join(dir, ".yacao", "plans", "plan-a", "tasks", "task-01-x.md");
      askOrDeny(call("yacao:builder", "Read", { file_path: plan }, options), "deny");
      noDecision(call("yacao:orchestrator", "Read", { file_path: plan }, options));
      assert.match(
        askOrDeny(call("yacao:builder", "Read", { file_path: plan }, options), "deny").permissionDecisionReason,
        /\.yacao\/plans\/\*/,
      );
      // The builder has no canonical edit policy: edits stay on the native gate.
      noDecision(call("yacao:builder", "Edit", { file_path: path.join(dir, "src", "index.js") }, options));
    });
  });

  test("file tools deny when the target cannot be classified", () => {
    askOrDeny(call("yacao:orchestrator", "Edit", {}), "deny");
    askOrDeny(call("yacao:orchestrator", "Edit", undefined), "deny");
    askOrDeny(call("yacao:orchestrator", "Edit", { file_path: "relative/path.md" }), "deny");
    askOrDeny(
      call("yacao:orchestrator", "Write", { file_path: path.join(ROOT, "x.md") }, { projectDir: null }),
      "deny",
    );
    const output = askOrDeny(call("yacao:orchestrator", "Edit", {}), "deny");
    assert.match(output.permissionDecisionReason, /"file_path"/);
  });

  test("symlinked ancestors cannot smuggle edits out of the project", () => {
    withProject((dir) => {
      const options = { projectDir: dir, cwd: dir };
      mkdirSync(path.join(dir, ".yacao"), { recursive: true });
      symlinkSync(ROOT, path.join(dir, ".yacao", "plans"));
      askOrDeny(
        call("yacao:orchestrator", "Write", { file_path: path.join(dir, ".yacao", "plans", "escape.md") }, options),
        "deny",
      );
    });
    withProject((real) => {
      const link = path.join(real, "link");
      symlinkSync(real, link);
      const target = path.join(real, ".yacao", "plans", "a.md");
      noDecision(call("yacao:orchestrator", "Edit", { file_path: target }, { projectDir: link, cwd: link }));
      noDecision(call("yacao:orchestrator", "Edit", { file_path: path.join(link, ".yacao", "plans", "a.md") }, { projectDir: real, cwd: real }));
    });
  });

  test("skill calls: YACAO skills deny for the builder, everything else falls through", () => {
    for (const skill of ["yacao:planning", "yacao:implementation", "yacao:review"]) {
      askOrDeny(call("yacao:builder", "Skill", { skill }), "deny");
      noDecision(call("yacao:orchestrator", "Skill", { skill }));
    }
    for (const skill of ["pdf", "yacao", "yacao:other", "webapp-testing"]) {
      noDecision(call("yacao:builder", "Skill", { skill }));
      noDecision(call("yacao:orchestrator", "Skill", { skill }));
    }
    askOrDeny(call("yacao:builder", "Skill", {}), "deny");
    askOrDeny(call("yacao:builder", "Skill", undefined), "deny");
    noDecision(call("yacao:orchestrator", "Skill", {}));
  });

  test("agent calls: the builder may only spawn Explore", () => {
    noDecision(call("yacao:builder", "Agent", { subagent_type: "Explore" }));
    for (const type of ["explore", "general-purpose", "yacao:builder", "fork", ""]) {
      askOrDeny(call("yacao:builder", "Agent", { subagent_type: type }), "deny");
    }
    askOrDeny(call("yacao:builder", "Agent", {}), "deny");
    askOrDeny(call("yacao:builder", "Agent", undefined), "deny");
    // The orchestrator spawn allowlist is native frontmatter; the hook stays out.
    noDecision(call("yacao:orchestrator", "Agent", { subagent_type: "general-purpose" }));
    noDecision(call("yacao:orchestrator", "Agent", { subagent_type: "Explore" }));
  });

  test("a corrupt or absent packaged policy fails closed for recognized roles", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "yacao-guard-plugin-"));
    try {
      const hooksDir = path.join(dir, "hooks");
      mkdirSync(hooksDir, { recursive: true });
      copyFileSync(GUARD, path.join(hooksDir, "guard.mjs"));
      const guard = path.join(hooksDir, "guard.mjs");
      const builder = { agent_type: "yacao:builder", tool_name: "Bash", tool_input: { command: "git commit -m x" } };
      const benign = { agent_type: "yacao:orchestrator", tool_name: "Bash", tool_input: { command: "ls" } };
      const missing = askOrDeny(guardDecision(runGuard(builder, { guard })), "deny");
      assert.match(missing.permissionDecisionReason, /guardrails\.json/);
      assert.match(missing.permissionDecisionReason, /cannot be read/);
      noDecision(guardDecision(runGuard({ ...builder, agent_type: "builder" }, { guard })));
      const policies = [
        "not json",
        "[]",
        '{"yacao:builder": {}}',
        '{"yacao:orchestrator": {}, "yacao:builder": {}}',
        '{"yacao:orchestrator": {"bash": []}, "yacao:builder": {}}',
        '{"yacao:orchestrator": {"bash": [{"pattern": "*", "decision": "maybe"}]}, "yacao:builder": {}}',
        '{"yacao:orchestrator": {"bash": {"pattern": "*"}}, "yacao:builder": {}}',
      ];
      for (const policy of policies) {
        writeFileSync(path.join(dir, "guardrails.json"), policy);
        const output = askOrDeny(guardDecision(runGuard(benign, { guard })), "deny");
        assert.match(output.permissionDecisionReason, /cannot be enforced/);
        noDecision(guardDecision(runGuard({ ...benign, agent_type: "builder" }, { guard })));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the hook never changes the filesystem", () => {
    withProject((dir) => {
      const before = snapshotDir(dir);
      const battery = [
        { agent_type: "yacao:builder", tool_name: "Bash", tool_input: { command: "git commit -m x" } },
        { agent_type: "yacao:orchestrator", tool_name: "Bash", tool_input: { command: "rm -rf /" } },
        {
          agent_type: "yacao:orchestrator",
          tool_name: "Write",
          tool_input: { file_path: path.join(dir, ".yacao", "plans", "x.md") },
        },
        {
          agent_type: "yacao:orchestrator",
          tool_name: "Write",
          tool_input: { file_path: path.join(dir, "outside.js") },
        },
        { agent_type: "yacao:builder", tool_name: "Read", tool_input: { file_path: path.join(dir, ".env") } },
      ];
      for (const payload of battery) guardDecision(runGuard(payload, { projectDir: dir, cwd: dir }));
      assert.deepEqual(snapshotDir(dir), before);
    });
    const pluginDir = path.join(ROOT, PLUGIN_ROOT);
    const before = snapshotDir(pluginDir);
    for (const payload of [
      { agent_type: "yacao:builder", tool_name: "Bash", tool_input: { command: "rm -rf /" } },
      { agent_type: "yacao:orchestrator", tool_name: "Edit", tool_input: { file_path: "relative.md" } },
    ]) {
      guardDecision(runGuard(payload));
    }
    assert.deepEqual(snapshotDir(pluginDir), before);
  });
});
