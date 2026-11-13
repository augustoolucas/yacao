// Offline tests for the Antigravity CLI plugin generator
// (scripts/build-antigravity.mjs) and the bundle it produces. They drive the
// exported API and CLI directly; no Antigravity host or network is involved.

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
} from "../scripts/build-antigravity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "build-antigravity.mjs");

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

const createFixture = ({ bundle = true } = {}) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "yacao-antigravity-"));
  for (const rel of SOURCE_FILES) {
    const destination = path.join(dir, rel);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(ROOT, rel), destination);
  }
  if (bundle) {
    for (const rel of OUTPUT_PATHS) {
      const destination = path.join(dir, PLUGIN_ROOT, rel);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(path.join(ROOT, PLUGIN_ROOT, rel), destination);
    }
  }
  return dir;
};

const withFixture = (body, options) => {
  const dir = createFixture(options);
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const runCli = (args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

const pluginDir = (root) => path.join(root, PLUGIN_ROOT);
const pluginFile = (root, rel) => path.join(pluginDir(root), rel);

const readJson = (root, rel) => JSON.parse(readFileSync(path.join(root, rel), "utf8"));

const replaceInFile = (root, rel, from, to) => {
  const abs = path.join(root, rel);
  const text = readFileSync(abs, "utf8");
  assert.ok(text.includes(from), `${rel} contains the fixture anchor`);
  writeFileSync(abs, text.replace(from, to));
};

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

// Generated frontmatter uses JSON values, so the walk also proves each value
// parses. This mirrors the host-neutral format rather than assuming a parser
// beyond what the bundle ships.
const frontmatter = (content) => {
  const match = /^---\n([\s\S]*?)\n---\n\n/.exec(content);
  assert.ok(match, "generated markdown starts with frontmatter");
  const fields = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(": ");
    assert.ok(separator > 0, `frontmatter line is key: value: ${line}`);
    fields[line.slice(0, separator)] = JSON.parse(line.slice(separator + 2));
  }
  return { fields, body: content.slice(match[0].length) };
};

const AGENT_TOOLS = {
  "yacao-orchestrator": [
    "read_file",
    "edit_file",
    "write_file",
    "run_command",
    "manage_task",
    "search_web",
    "ask_question",
    "invoke_subagent",
    "send_message",
    "manage_subagents",
  ],
  "yacao-builder": [
    "read_file",
    "edit_file",
    "write_file",
    "run_command",
    "manage_task",
    "search_web",
    "send_message",
  ],
};

describe("antigravity bundle generation", () => {
  test("produces exactly the closed six-file allowlist", () => {
    const files = generatePlugin({ root: ROOT });
    assert.equal(PLUGIN_ROOT, "integrations/antigravity");
    assert.deepEqual(Object.keys(files).sort(), [...OUTPUT_PATHS].sort());
    assert.deepEqual(Object.keys(files).sort(), [
      "agents/yacao-builder.md",
      "agents/yacao-orchestrator.md",
      "plugin.json",
      "skills/yacao-implementation/SKILL.md",
      "skills/yacao-planning/SKILL.md",
      "skills/yacao-review/SKILL.md",
    ]);
  });

  test("generation is deterministic and the committed bundle matches it", () => {
    const first = generatePlugin({ root: ROOT });
    const second = generatePlugin({ root: ROOT });
    assert.deepEqual(second, first);
    for (const rel of OUTPUT_PATHS) {
      assert.equal(readFileSync(pluginFile(ROOT, rel), "utf8"), first[rel], rel);
    }
  });

  test("builds twice byte-identically in a fixture", () => {
    withFixture((dir) => {
      assert.equal(runCli(["--root", dir]).status, 0);
      const first = snapshotDir(pluginDir(dir));
      assert.equal(runCli(["--root", dir]).status, 0);
      assert.deepEqual(snapshotDir(pluginDir(dir)), first);
    }, { bundle: false });
  });

  test("every generated file is ASCII-only", () => {
    for (const [rel, content] of Object.entries(generatePlugin({ root: ROOT }))) {
      assert.ok(!/[^\x09\x0A\x20-\x7E]/.test(content), `${rel} is ASCII-only`);
    }
  });

  test("the API is pure: generatePlugin and checkPlugin never write", () => {
    withFixture((dir) => {
      const before = snapshotDir(dir);
      generatePlugin({ root: dir });
      checkPlugin({ root: dir });
      assert.deepEqual(snapshotDir(dir), before);
      assert.ok(!existsSync(pluginDir(dir)));
    }, { bundle: false });
  });

  test("package scripts expose the Antigravity build and check commands", () => {
    const scripts = readJson(ROOT, "package.json").scripts;
    assert.equal(scripts["build:antigravity"], "node scripts/build-antigravity.mjs");
    assert.equal(scripts["check:antigravity"], "node scripts/build-antigravity.mjs --check");
  });
});

describe("antigravity manifest", () => {
  test("carries the closed identity fields and no adapter policy files", () => {
    const manifest = JSON.parse(generatePlugin({ root: ROOT })["plugin.json"]);
    assert.deepEqual(Object.keys(manifest), ["name", "displayName", "version", "description", "author"]);
    assert.equal(manifest.name, "yacao");
    assert.equal(manifest.displayName, "YACAO");
    assert.equal(manifest.version, readJson(ROOT, "package.json").version);
    assert.equal(manifest.author, "augustoolucas");
    assert.match(manifest.description, /Yet Another Coding Agent Orchestrator/);
    assert.match(manifest.description, /Antigravity/);
    assert.ok(!/opencode/i.test(manifest.description));
    for (const field of ["license", "settings", "hooks", "mcpServers", "permissions", "defaultAgent"]) {
      assert.ok(!(field in manifest), `manifest must not declare ${field}`);
    }
    assert.ok(!OUTPUT_PATHS.some((rel) => /hooks|mcp|permission|settings/.test(rel)));
  });

  test("propagates package version and description changes", () => {
    withFixture((dir) => {
      const pkg = readJson(dir, "package.json");
      pkg.version = "9.8.7";
      pkg.description = "A fixture plugin for OpenCode.";
      writeFileSync(path.join(dir, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
      const manifest = JSON.parse(generatePlugin({ root: dir })["plugin.json"]);
      assert.equal(manifest.version, "9.8.7");
      assert.equal(manifest.description, "A fixture plugin for Antigravity.");
    });
  });
});

describe("antigravity agents", () => {
  const files = generatePlugin({ root: ROOT });

  test("use native names, primary/subagent flags, inheritance and explicit tools", () => {
    const orchestrator = frontmatter(files["agents/yacao-orchestrator.md"]).fields;
    const builder = frontmatter(files["agents/yacao-builder.md"]).fields;
    assert.deepEqual(
      [orchestrator.name, orchestrator.mainAgent, orchestrator.subagent, orchestrator.model],
      ["yacao-orchestrator", true, false, "inherit"],
    );
    assert.deepEqual(
      [builder.name, builder.mainAgent, builder.subagent, builder.model],
      ["yacao-builder", false, true, "inherit"],
    );
    assert.equal(orchestrator.inheritMcp, true);
    assert.equal(orchestrator.inheritCustomizations, true);
    assert.equal(builder.inheritMcp, true);
    assert.equal(builder.inheritCustomizations, true);
    assert.deepEqual(orchestrator.tools, AGENT_TOOLS["yacao-orchestrator"]);
    assert.deepEqual(builder.tools, AGENT_TOOLS["yacao-builder"]);
    for (const [rel, fields] of [
      ["agents/yacao-orchestrator.md", orchestrator],
      ["agents/yacao-builder.md", builder],
    ]) {
      for (const field of ["commandExecutionPolicy", "mode", "temperature", "permission", "hooks"]) {
        assert.ok(!(field in fields), `${rel} must not declare ${field}`);
      }
    }
  });

  test("adapt canonical descriptions and role references to the yacao- IDs", () => {
    const orchestrator = frontmatter(files["agents/yacao-orchestrator.md"]);
    const builder = frontmatter(files["agents/yacao-builder.md"]);
    assert.equal(
      orchestrator.fields.description,
      readJson(ROOT, "agents/orchestrator.json").description.replace("delegates to builder", "delegates to yacao-builder"),
    );
    assert.equal(builder.fields.description, readJson(ROOT, "agents/builder.json").description);
    assert.match(orchestrator.body, /\*\*`yacao-orchestrator`\*\*/);
    assert.match(orchestrator.body, /delegate implementation to yacao-builder/);
    assert.match(orchestrator.body, /All code changes go through yacao-builder/);
    assert.match(builder.body, /\*\*`yacao-builder`\*\*/);
    assert.match(builder.body, /the yacao-orchestrator owns commit decisions/);
  });

  test("replace explore-subagent dispatch with direct exploration", () => {
    assert.match(files["agents/yacao-orchestrator.md"], /explore the relevant areas directly yourself/);
    assert.match(files["agents/yacao-builder.md"], /explore relevant code directly to support the current task/);
    assert.ok(!/dispatch `explore` subagents/.test(files["agents/yacao-orchestrator.md"]));
    assert.ok(!/## Subagents/.test(files["agents/yacao-builder.md"]));
    assert.ok(!/`explore` subagent/.test(files["agents/yacao-builder.md"]));
  });
});

describe("antigravity host binding", () => {
  const files = generatePlugin({ root: ROOT });
  const text = Object.values(files).join("\n");

  test("no OpenCode or Claude namespace survives and plans use .yacao/plans", () => {
    for (const [rel, content] of Object.entries(files)) {
      assert.ok(!/opencode/i.test(content), `${rel} has no OpenCode reference`);
      assert.ok(!/claude/i.test(content), `${rel} has no Claude Code reference`);
      assert.ok(!content.includes("yacao:"), `${rel} has no Claude skill namespace`);
      assert.ok(!content.includes("delegation tool"), `${rel} has no delegation-tool wording`);
      assert.ok(!content.includes("{file:"), `${rel} has no unresolved prompt reference`);
      assert.ok(!content.includes("commandExecutionPolicy"), `${rel} has no execution policy override`);
    }
    assert.match(files["agents/yacao-orchestrator.md"], /plan Markdown under `\.yacao\/plans\/`/);
    assert.match(files["skills/yacao-planning/SKILL.md"], /`\.yacao\/plans\/plan-<slug>\/plan\.md`/);
    assert.ok(!text.includes(".opencode"));
  });

  test("skills keep canonical yacao-* IDs and folder names", () => {
    const expected = {
      "skills/yacao-planning/SKILL.md": "yacao-planning",
      "skills/yacao-implementation/SKILL.md": "yacao-implementation",
      "skills/yacao-review/SKILL.md": "yacao-review",
    };
    for (const [rel, name] of Object.entries(expected)) {
      const skill = frontmatter(files[rel]);
      assert.equal(skill.fields.name, name);
      assert.ok(skill.body.startsWith("# "), `${rel} keeps its markdown body`);
    }
    assert.match(files["agents/yacao-orchestrator.md"], /`yacao-planning`/);
    assert.match(files["agents/yacao-orchestrator.md"], /`yacao-implementation`/);
    assert.match(files["agents/yacao-orchestrator.md"], /`yacao-review`/);
  });

  test("planning groups plans by project-relative path exactly once", () => {
    const planning = files["skills/yacao-planning/SKILL.md"];
    const instruction =
      "When working on a project below the workspace root, store its plans under `.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use `.yacao/plans/plan-<slug>/`.";
    assert.equal(planning.split(instruction).length - 1, 1);
    assert.match(planning, /relative to the workspace root for the current session, not the target project root/);
  });

  test("implementation dispatches yacao-builder with the observed agy fields and continues by child ID", () => {
    const implementation = files["skills/yacao-implementation/SKILL.md"];
    for (const fragment of [
      "`invoke_subagent` tool in the current workspace - never a branch or worktree",
      "`{Prompt,Role,TypeName}`",
      "`TypeName` to `yacao-builder`",
      "descriptive `Role`",
      "put the current task in `Prompt` as a self-contained contract",
      "The actual tool schema is authoritative",
      "unsupported `model` or `Workspace` parameters",
      "outer `Subagents` JSON envelope",
      "real child conversation ID returned by the call",
      "never invent one",
      "`send_message` using `{Recipient:childID,Message:current instruction}`",
      "Wait for the child to actually complete before reviewing its work or advancing to the next task.",
    ]) {
      assert.ok(implementation.includes(fragment), fragment);
    }
    assert.ok(!/sessionID|task_id|delegation tool/.test(implementation));
    const dispatch = implementation.match(/^> \*\*Dispatch and continuation\.\*\*.*$/gm) ?? [];
    assert.equal(dispatch.length, 1);
  });

  test("builder reports to the host-supplied parent and leaves commits to the orchestrator", () => {
    const builder = files["agents/yacao-builder.md"];
    for (const fragment of [
      "STATUS/CHANGES/VERIFIED/GAPS",
      "`send_message` to the actual parent conversation ID supplied by the host",
      "`{Recipient: parentID, Message: report}`",
      "Never fabricate a parent ID or add a configuration field for it",
      "the normal final reply alone is not sufficient",
      "Do not stage, commit or push;",
      "the yacao-orchestrator owns commit decisions",
      "performs requested commits after review",
    ]) {
      assert.ok(builder.includes(fragment), fragment);
    }
    assert.ok(!/delegation tool|`explore` subagent|## Subagents/.test(builder));
  });

  test("keeps approval, review, Git and narrow-context workflow guarantees", () => {
    const planning = files["skills/yacao-planning/SKILL.md"];
    const implementation = files["skills/yacao-implementation/SKILL.md"];
    const review = files["skills/yacao-review/SKILL.md"];
    assert.match(planning, /One approval covers the complete plan/);
    assert.match(planning, /Each task contract is self-contained/);
    assert.match(implementation, /Leave changes uncommitted unless the user requests commits/);
    assert.match(implementation, /without requiring or initializing Git/);
    assert.match(implementation, /do not ask the yacao-builder to read planning files/);
    assert.match(implementation, /Never send the full plan overview or future task contracts/);
    for (const status of ["`complete`", "`partial`", "`blocked`", "`escalate`"]) {
      assert.ok(implementation.includes(status), status);
    }
    assert.match(review, /without Git or a base, inspect the resulting files directly/);
    assert.match(review, /After two unsuccessful correction rounds/);
    assert.match(review, /final full-plan review and final verification commands again/);
    assert.match(
      review,
      /one correction message with `send_message` targeting the recorded child conversation ID/,
    );
    assert.ok(!/correction[^.]*invoke_subagent/.test(review));
  });
});

describe("antigravity generation failures", () => {
  const cases = [
    {
      name: "malformed agent JSON",
      setup: (dir) => writeFileSync(path.join(dir, "agents/builder.json"), "{"),
      error: /agents\/builder\.json is not valid JSON/,
    },
    {
      name: "malformed package JSON",
      setup: (dir) => writeFileSync(path.join(dir, "package.json"), "not json"),
      error: /package\.json is not valid JSON/,
    },
    {
      name: "skill without frontmatter",
      setup: (dir) => writeFileSync(path.join(dir, "skills/yacao-planning/SKILL.md"), "# Planning\n"),
      error: /has no YAML frontmatter/,
    },
    {
      name: "renamed skill",
      setup: (dir) =>
        replaceInFile(dir, "skills/yacao-review/SKILL.md", "name: yacao-review", "name: review"),
      error: /unsupported skill name "review"/,
    },
    {
      name: "wrong agent mode",
      setup: (dir) => {
        const definition = readJson(dir, "agents/orchestrator.json");
        definition.mode = "subagent";
        writeFileSync(path.join(dir, "agents/orchestrator.json"), `${JSON.stringify(definition, null, 2)}\n`);
      },
      error: /unsupported mode "subagent" in agents\/orchestrator\.json \(expected "primary"\)/,
    },
    {
      name: "missing prompt file",
      setup: (dir) => rmSync(path.join(dir, "agents/prompts/builder.md")),
      error: /missing source: agents\/prompts\/builder\.md/,
    },
    {
      name: "invalid prompt reference",
      setup: (dir) =>
        replaceInFile(dir, "agents/builder.json", "{file:./prompts/builder.md}", "agents/prompts/builder.md"),
      error: /unsupported prompt reference "agents\/prompts\/builder\.md"/,
    },
    {
      name: "missing source skill",
      setup: (dir) => rmSync(path.join(dir, "skills/yacao-review/SKILL.md")),
      error: /missing source: skills\/yacao-review\/SKILL\.md/,
    },
    {
      name: "missing host-adaptation anchor",
      setup: (dir) =>
        replaceInFile(
          dir,
          "agents/prompts/orchestrator.md",
          "For a broad or parallelizable search, dispatch `explore` subagents instead.",
          "Search broadly.",
        ),
      error: /missing host-adaptation anchor/,
    },
  ];

  for (const item of cases) {
    test(item.name, () => {
      withFixture((dir) => {
        item.setup(dir);
        assert.throws(() => generatePlugin({ root: dir }), item.error);
      }, { bundle: false });
    });
  }
});

describe("antigravity check mode", () => {
  test("checkPlugin passes on the committed bundle without writing", () => {
    assert.deepEqual(checkPlugin({ root: ROOT }), { ok: true, mismatches: [] });
  });

  test("checkPlugin reports differing and missing outputs without rewriting or recreating them", () => {
    withFixture((dir) => {
      const pluginRoot = pluginDir(dir);
      writeFileSync(pluginFile(dir, "plugin.json"), "{}\n");
      const before = snapshotDir(pluginRoot);
      const drifted = checkPlugin({ root: dir });
      assert.equal(drifted.ok, false);
      assert.deepEqual(drifted.mismatches, [{ path: "plugin.json", reason: "differs" }]);
      assert.deepEqual(snapshotDir(pluginRoot), before);

      rmSync(pluginFile(dir, "skills/yacao-review/SKILL.md"));
      const missing = checkPlugin({ root: dir });
      assert.equal(missing.ok, false);
      assert.deepEqual(missing.mismatches, [
        { path: "plugin.json", reason: "differs" },
        { path: "skills/yacao-review/SKILL.md", reason: "missing" },
      ]);
      assert.ok(!existsSync(pluginFile(dir, "skills/yacao-review/SKILL.md")));
    });
  });

  test("a changed prompt is reported as drift until regeneration", () => {
    withFixture((dir) => {
      const prompt = path.join(dir, "agents/prompts/builder.md");
      writeFileSync(prompt, `${readFileSync(prompt, "utf8")}\nFixture change.\n`);
      const files = generatePlugin({ root: dir });
      assert.match(files["agents/yacao-builder.md"], /Fixture change\./);
      assert.deepEqual(checkPlugin({ root: dir }).mismatches, [
        { path: "agents/yacao-builder.md", reason: "differs" },
      ]);
    });
  });

  test("--check is read-only and exits nonzero on drift", () => {
    withFixture((dir) => {
      const pass = runCli(["--check", "--root", dir]);
      assert.equal(pass.status, 0, pass.stderr);
      assert.match(pass.stdout, /up to date \(6 files\)/);

      writeFileSync(pluginFile(dir, "plugin.json"), "{}\n");
      const before = snapshotDir(pluginDir(dir));
      const drift = runCli(["--check", "--root", dir]);
      assert.equal(drift.status, 1);
      assert.match(drift.stderr, /differs: integrations\/antigravity\/plugin\.json/);
      assert.match(drift.stderr, /out of date \(1 of 6 files\)/);
      assert.deepEqual(snapshotDir(pluginDir(dir)), before);
    });
  });
});

describe("antigravity CLI", () => {
  test("--help documents the supported flags", () => {
    const result = runCli(["--help"]);
    assert.equal(result.status, 0);
    for (const fragment of ["--check", "--root", PLUGIN_ROOT, "6 generated files"]) {
      assert.ok(result.stdout.includes(fragment), fragment);
    }
  });

  test("writes only the scoped outputs and preserves unrelated files", () => {
    withFixture((dir) => {
      const root = pluginDir(dir);
      mkdirSync(root, { recursive: true });
      const sentinel = path.join(root, "keep.txt");
      writeFileSync(sentinel, "unrelated\n");
      const sourcesBefore = new Map(
        SOURCE_FILES.map((rel) => [rel, readFileSync(path.join(dir, rel), "utf8")]),
      );
      const shippedBefore = snapshotDir(pluginDir(ROOT));

      const result = runCli(["--root", dir]);
      assert.equal(result.status, 0, result.stderr);
      const files = generatePlugin({ root: dir });
      for (const rel of OUTPUT_PATHS) {
        assert.equal(readFileSync(pluginFile(dir, rel), "utf8"), files[rel], rel);
      }
      assert.equal(readFileSync(sentinel, "utf8"), "unrelated\n");
      assert.deepEqual(listFiles(root), [...OUTPUT_PATHS, "keep.txt"].sort());
      for (const [rel, content] of sourcesBefore) {
        assert.equal(readFileSync(path.join(dir, rel), "utf8"), content, rel);
      }
      assert.deepEqual(snapshotDir(pluginDir(ROOT)), shippedBefore);
    }, { bundle: false });
  });

  test("rejects unknown arguments with usage", () => {
    const result = runCli(["--nope"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown argument: --nope/);
    assert.match(result.stderr, /usage: node scripts\/build-antigravity\.mjs/);
  });
});
