#!/usr/bin/env node
// Build the YACAO plugin bundle for Antigravity CLI from the canonical sources.
//
// The canonical sources are the OpenCode artifacts only:
//   - package.json (version and description)
//   - agents/<agent>.json and the prompt file its "prompt" field references
//   - skills/yacao-<skill>/SKILL.md
//
// The generated bundle at integrations/antigravity/ is committed, so this
// script must stay deterministic and dependency-free (Node >= 22 built-ins
// only). It never scans directories and never imports the OpenCode runtime.
//
// This adapter deliberately has no hooks, permission translation or policy
// machinery: roles are governed by the generated prompts and by the host's
// native user permissions.
//
// Usage:
//   node scripts/build-antigravity.mjs                write the bundle
//   node scripts/build-antigravity.mjs --check        verify without writing
//   node scripts/build-antigravity.mjs --root <dir>   run against another checkout

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLUGIN_ROOT = "integrations/antigravity";

export const PLUGIN_NAME = "yacao";

// The complete, closed set of files the generator may write.
export const OUTPUT_PATHS = Object.freeze([
  "plugin.json",
  "agents/yacao-orchestrator.md",
  "agents/yacao-builder.md",
  "skills/yacao-planning/SKILL.md",
  "skills/yacao-implementation/SKILL.md",
  "skills/yacao-review/SKILL.md",
]);

const AGENT_SPECS = [
  {
    source: "orchestrator",
    name: "yacao-orchestrator",
    mode: "primary",
    mainAgent: true,
    subagent: false,
    tools: Object.freeze([
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
    ]),
  },
  {
    source: "builder",
    name: "yacao-builder",
    mode: "subagent",
    mainAgent: false,
    subagent: true,
    tools: Object.freeze([
      "read_file",
      "edit_file",
      "write_file",
      "run_command",
      "manage_task",
      "search_web",
      "send_message",
    ]),
  },
];

const SKILL_SPECS = [
  { name: "planning", source: "skills/yacao-planning/SKILL.md", output: "skills/yacao-planning/SKILL.md" },
  {
    name: "implementation",
    source: "skills/yacao-implementation/SKILL.md",
    output: "skills/yacao-implementation/SKILL.md",
  },
  { name: "review", source: "skills/yacao-review/SKILL.md", output: "skills/yacao-review/SKILL.md" },
];

const AGENT_FIELDS = new Set(["description", "mode", "temperature", "permission", "prompt"]);
const SKILL_FIELDS = new Set(["name", "description"]);

// The Antigravity dispatch guidance inserted once into the generated
// implementation skill. The canonical source stays host-neutral; the generator
// fails if the insertion anchor is gone so source drift cannot pass silently.
const DISPATCH_PARAGRAPH =
  "> **Dispatch and continuation.** Dispatch implementation with the `invoke_subagent` tool in the current workspace - never a branch or worktree. The observed per-call fields are `{Prompt,Role,TypeName}`: set `TypeName` to `yacao-builder`, give a descriptive `Role`, and put the current task in `Prompt` as a self-contained contract. The actual tool schema is authoritative; do not add unsupported `model` or `Workspace` parameters, and do not bake in an unverified outer `Subagents` JSON envelope. Record the real child conversation ID returned by the call; never invent one. Continue that same child with `send_message` using `{Recipient:childID,Message:current instruction}`. Wait for the child to actually complete before reviewing its work or advancing to the next task.";

const PLANNING_PATH_PARAGRAPH =
  "When working on a project below the workspace root, store its plans under `.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use `.yacao/plans/plan-<slug>/`.\nThese paths are relative to the workspace root for the current session, not the target project root; use the selected plan directory for all overview, task and contract paths in this skill.";

const BUILDER_COMMIT_RULE =
  "- Do not stage, commit or push; the yacao-orchestrator owns commit decisions and performs requested commits after review.";

const BUILDER_REPORT_PARAGRAPH =
  "Deliver the canonical STATUS/CHANGES/VERIFIED/GAPS report through `send_message` to the actual parent conversation ID supplied by the host, using `{Recipient: parentID, Message: report}`. Never fabricate a parent ID or add a configuration field for it; the normal final reply alone is not sufficient.";

const FORBIDDEN_OUTPUT = [
  { pattern: /opencode/i, reason: "an OpenCode reference" },
  { pattern: /claude/i, reason: "a Claude Code reference" },
  { pattern: /yacao:/, reason: "a Claude Code skill namespace" },
  { pattern: /\{file:/, reason: "an unresolved prompt reference" },
  { pattern: /\.\.\//, reason: "a path escaping the plugin root" },
  { pattern: /delegation tool/, reason: "pre-adaptation delegation wording" },
  { pattern: /`explore`\s+subagent/, reason: "explore-subagent guidance" },
  { pattern: /commandExecutionPolicy/, reason: "a command execution policy override" },
];

const UNQUALIFIED_ROLE = /(?<![\w-])(?:[Bb]uilder|[Oo]rchestrator)(?![\w-])/;

const defaultRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readSourceText = (root, rel) => {
  const abs = path.join(root, rel);
  if (!existsSync(abs)) throw new Error(`missing source: ${rel}`);
  return readFileSync(abs, "utf8");
};

const readSourceJson = (root, rel) => {
  const text = readSourceText(root, rel);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`unsupported source: ${rel} is not valid JSON (${error.message})`);
  }
};

const requireText = (value, what) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`unsupported source: ${what} must be a non-empty string`);
  }
  return value;
};

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Text adaptation for the generated copies: plain role names become the
// actual Antigravity agent IDs, while already-prefixed references stay intact.
const adaptRoles = (text) =>
  text.replace(/(?<![\w-])(builder|orchestrator)(?![\w-])/gi, (role) =>
    role.toLowerCase() === "builder" ? "yacao-builder" : "yacao-orchestrator",
  );

// Implementation conversations are continued by child conversation ID, not by
// an OpenCode session reference.
const adaptConversations = (text) =>
  text
    .replaceAll("session reference", "child conversation ID")
    .replaceAll("yacao-builder session", "yacao-builder conversation")
    .replaceAll("fresh session", "fresh conversation");

const replaceRequired = (text, anchor, replacement, what) => {
  if (!text.includes(anchor)) {
    throw new Error(`unsupported source: missing host-adaptation anchor ${JSON.stringify(anchor)} in ${what}`);
  }
  return text.replaceAll(anchor, replacement);
};

const insertBeforeFirstSection = (body, paragraph, what) => {
  const anchor = body.indexOf("\n## ");
  if (anchor === -1) {
    throw new Error(`unsupported source: ${what} has no section heading to anchor the host guidance`);
  }
  return `${body.slice(0, anchor)}\n${paragraph}\n${body.slice(anchor)}`;
};

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)*/;

const parseFrontmatter = (raw, rel) => {
  const match = FRONTMATTER.exec(raw);
  if (!match) throw new Error(`unsupported source: ${rel} has no YAML frontmatter`);
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const separator = line.indexOf(":");
    if (separator < 1) {
      throw new Error(`unsupported source: ${rel} frontmatter line ${JSON.stringify(line)} is not key: value`);
    }
    const key = line.slice(0, separator).trim();
    if (key in fields) throw new Error(`unsupported source: ${rel} has duplicate frontmatter field "${key}"`);
    fields[key] = line.slice(separator + 1).trim();
  }
  return { fields, body: raw.slice(match[0].length) };
};

const adaptPrompt = (spec, prompt) => {
  let text = prompt;
  if (spec.source === "orchestrator") {
    text = replaceRequired(
      text,
      "For a broad or parallelizable search, dispatch `explore` subagents instead.",
      "For a broad or parallelizable search, explore the relevant areas directly yourself.",
      "agents/prompts/orchestrator.md",
    );
    text = replaceRequired(text, ".opencode/plans", ".yacao/plans", "agents/prompts/orchestrator.md");
  } else {
    text = replaceRequired(
      text,
      "## Subagents\n\nYou may dispatch the `explore` subagent via the delegation tool to parallelize searches explicitly included in the current task. Never expand beyond the task.",
      "## Exploration\n\nYou may explore relevant code directly to support the current task. Never expand beyond the task.",
      "agents/prompts/builder.md",
    );
    text = replaceRequired(
      text,
      "- Do not apply unplanned refactor, optimization or cleanup",
      `- Do not apply unplanned refactor, optimization or cleanup\n${BUILDER_COMMIT_RULE}`,
      "agents/prompts/builder.md",
    );
    text = replaceRequired(
      text,
      "If STATUS is escalate, put the decision that must be made in GAPS.",
      `If STATUS is escalate, put the decision that must be made in GAPS.\n\n${BUILDER_REPORT_PARAGRAPH}`,
      "agents/prompts/builder.md",
    );
  }
  return adaptRoles(text);
};

const loadAgent = (root, spec) => {
  const rel = `agents/${spec.source}.json`;
  const definition = readSourceJson(root, rel);
  if (!isPlainObject(definition)) {
    throw new Error(`unsupported source: ${rel} must be a JSON object`);
  }
  for (const key of Object.keys(definition)) {
    if (!AGENT_FIELDS.has(key)) throw new Error(`unsupported field "${key}" in ${rel}`);
  }
  const description = adaptRoles(requireText(definition.description, `${rel} description`));
  if (definition.mode !== spec.mode) {
    throw new Error(
      `unsupported mode ${JSON.stringify(definition.mode)} in ${rel} (expected ${JSON.stringify(spec.mode)})`,
    );
  }
  if (definition.temperature !== undefined && typeof definition.temperature !== "number") {
    throw new Error(`unsupported temperature in ${rel}`);
  }
  if (definition.permission !== undefined && !isPlainObject(definition.permission)) {
    throw new Error(`unsupported source: ${rel} permission must be an object`);
  }
  const reference = /^\{file:(.+)\}$/.exec(requireText(definition.prompt, `${rel} prompt`));
  if (!reference) {
    throw new Error(`unsupported prompt reference ${JSON.stringify(definition.prompt)} in ${rel}`);
  }
  const promptRel = path.posix.normalize(path.posix.join(path.posix.dirname(rel), reference[1]));
  if (promptRel.startsWith("..")) {
    throw new Error(`unsupported prompt reference ${JSON.stringify(definition.prompt)} in ${rel} escapes the repository`);
  }
  const prompt = adaptPrompt(spec, readSourceText(root, promptRel));
  return { spec, description, prompt };
};

const adaptSkillBody = (name, body) => {
  let text = body;
  if (name === "planning") {
    text = replaceRequired(text, ".opencode/plans", ".yacao/plans", "skills/yacao-planning/SKILL.md");
    text = adaptRoles(text);
    return insertBeforeFirstSection(text, PLANNING_PATH_PARAGRAPH, "skills/yacao-planning/SKILL.md");
  }
  if (name === "implementation") {
    text = replaceRequired(
      text,
      "Capture the returned session reference for potential follow-up reuse.",
      "Capture the returned child conversation ID for potential follow-up reuse.",
      "skills/yacao-implementation/SKILL.md",
    );
    text = replaceRequired(text, "the delegation tool", "invoke_subagent", "skills/yacao-implementation/SKILL.md");
    text = adaptConversations(adaptRoles(text));
    return insertBeforeFirstSection(text, DISPATCH_PARAGRAPH, "skills/yacao-implementation/SKILL.md");
  }
  text = replaceRequired(text, "the delegation tool", "invoke_subagent", "skills/yacao-review/SKILL.md");
  return adaptConversations(adaptRoles(text));
};

const loadSkill = (root, spec) => {
  const raw = readSourceText(root, spec.source);
  const { fields, body } = parseFrontmatter(raw, spec.source);
  for (const key of Object.keys(fields)) {
    if (!SKILL_FIELDS.has(key)) throw new Error(`unsupported frontmatter field "${key}" in ${spec.source}`);
  }
  if (fields.name !== `yacao-${spec.name}`) {
    throw new Error(
      `unsupported skill name ${JSON.stringify(fields.name)} in ${spec.source} (expected ${JSON.stringify(`yacao-${spec.name}`)})`,
    );
  }
  const description = adaptConversations(adaptRoles(requireText(fields.description, `${spec.source} description`)));
  return { spec, description, body: adaptSkillBody(spec.name, body) };
};

const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

const withTrailingNewline = (text) => (text.endsWith("\n") ? text : `${text}\n`);

const renderMarkdown = (fields, body) => {
  const lines = fields.map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${withTrailingNewline(body)}`;
};

const assertCleanOutput = (rel, content) => {
  if (/[^\x09\x0A\x20-\x7E]/.test(content)) {
    throw new Error(`bundle file ${rel} is not ASCII-only`);
  }
  for (const { pattern, reason } of FORBIDDEN_OUTPUT) {
    const match = pattern.exec(content);
    if (match) {
      throw new Error(`bundle file ${rel} still contains ${reason}: ${JSON.stringify(match[0])}`);
    }
  }
  // The manifest description is product prose ("Yet Another Coding Agent
  // Orchestrator"); only generated role prose must use the yacao- IDs.
  const role = UNQUALIFIED_ROLE.exec(content);
  if (rel !== "plugin.json" && role) {
    throw new Error(`bundle file ${rel} still contains an unqualified role reference: ${JSON.stringify(role[0])}`);
  }
};

// Pure generation: reads the canonical sources and returns the bundle as
// { "<path relative to the plugin root>": "<content>" } without writing.
export function generatePlugin({ root = defaultRoot() } = {}) {
  const pkg = readSourceJson(root, "package.json");
  requireText(pkg.version, "package.json version");
  if (!/^\d+\.\d+\.\d+/.test(pkg.version)) {
    throw new Error(`unsupported package.json version ${JSON.stringify(pkg.version)}`);
  }
  requireText(pkg.description, "package.json description");

  const agents = AGENT_SPECS.map((spec) => loadAgent(root, spec));
  const skills = SKILL_SPECS.map((spec) => loadSkill(root, spec));

  const files = {};
  files["plugin.json"] = jsonText({
    name: PLUGIN_NAME,
    displayName: "YACAO",
    version: pkg.version,
    description: pkg.description.replace(/\bOpenCode\b/g, "Antigravity"),
    author: "augustoolucas",
  });
  for (const agent of agents) {
    files[`agents/${agent.spec.name}.md`] = renderMarkdown(
      [
        ["name", agent.spec.name],
        ["description", agent.description],
        ["model", "inherit"],
        ["mainAgent", agent.spec.mainAgent],
        ["subagent", agent.spec.subagent],
        ["tools", agent.spec.tools],
        ["inheritMcp", true],
        ["inheritCustomizations", true],
      ],
      agent.prompt,
    );
  }
  for (const skill of skills) {
    files[skill.spec.output] = renderMarkdown(
      [
        ["name", `yacao-${skill.spec.name}`],
        ["description", skill.description],
      ],
      skill.body,
    );
  }

  const emitted = Object.keys(files);
  if (emitted.length !== OUTPUT_PATHS.length || OUTPUT_PATHS.some((rel) => !(rel in files))) {
    throw new Error(`internal error: generated file set ${emitted.join(", ")} does not match the allowlist`);
  }
  for (const rel of OUTPUT_PATHS) assertCleanOutput(rel, files[rel]);
  return files;
}

// Read-only comparison of the generated bundle against the files on disk.
export function checkPlugin({ root = defaultRoot() } = {}) {
  const files = generatePlugin({ root });
  const mismatches = [];
  for (const rel of OUTPUT_PATHS) {
    const abs = path.join(root, PLUGIN_ROOT, rel);
    if (!existsSync(abs)) {
      mismatches.push({ path: rel, reason: "missing" });
    } else if (readFileSync(abs, "utf8") !== files[rel]) {
      mismatches.push({ path: rel, reason: "differs" });
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}

const USAGE = `usage: node scripts/build-antigravity.mjs [--check] [--root <dir>]

Writes the Antigravity CLI plugin bundle under ${PLUGIN_ROOT}/ from the canonical
YACAO sources. --check verifies the committed bundle (${OUTPUT_PATHS.length} generated files)
without writing or deleting anything.`;

const parseArgs = (args) => {
  const options = { check: false, help: false, root: defaultRoot() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--root") {
      const value = args[index + 1];
      if (!value) throw new Error("--root needs a directory argument");
      options.root = path.resolve(value);
      index += 1;
    } else if (arg.startsWith("--root=")) {
      options.root = path.resolve(arg.slice("--root=".length));
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
};

const runCli = (argv) => {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  try {
    if (options.check) {
      const { ok, mismatches } = checkPlugin({ root: options.root });
      if (ok) {
        console.log(`antigravity plugin is up to date (${OUTPUT_PATHS.length} files)`);
        return 0;
      }
      for (const mismatch of mismatches) {
        console.error(`${mismatch.reason}: ${path.posix.join(PLUGIN_ROOT, mismatch.path)}`);
      }
      console.error(
        `antigravity plugin is out of date (${mismatches.length} of ${OUTPUT_PATHS.length} files)`,
      );
      return 1;
    }
    const files = generatePlugin({ root: options.root });
    for (const rel of OUTPUT_PATHS) {
      const abs = path.join(options.root, PLUGIN_ROOT, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, files[rel]);
      console.log(`wrote ${path.posix.join(PLUGIN_ROOT, rel)}`);
    }
    return 0;
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 1;
  }
};

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  process.exitCode = runCli(process.argv.slice(2));
}
