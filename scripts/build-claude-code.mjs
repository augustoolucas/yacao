#!/usr/bin/env node
// Build the YACAO plugin bundle for Claude Code from the canonical sources.
//
// The canonical sources are the OpenCode artifacts only:
//   - package.json (name, version, description)
//   - agents/<agent>.json and the prompt file its "prompt" field references
//   - skills/yacao-<skill>/SKILL.md
//
// The generated bundle at integrations/claude-code/ is committed, so this
// script must stay deterministic and dependency-free (Node >= 22 built-ins
// only). It never scans directories and never imports the OpenCode runtime.
//
// Usage:
//   node scripts/build-claude-code.mjs                write the bundle
//   node scripts/build-claude-code.mjs --check        verify without writing
//   node scripts/build-claude-code.mjs --root <dir>   run against another checkout
//
// guardrails.json is adapter data for the Claude Code role guardrails, not
// native permission settings: per qualified agent key it lists the ordered
// policy rules of each category (bash/read/edit/skill/task), every rule
// { "pattern", "decision" } with decision allow/ask/deny; a later rule
// overrides an earlier one, like the canonical wildcard semantics.
//
// The files under the plugin's hooks/ directory are hand-authored bundle
// statics (STATIC_PATHS): generation never writes them, it scans their text
// when present, and --check reports them as missing when absent.
//
// The root marketplace (.claude-plugin/marketplace.json) registers the bundle
// for installation from this repository and is hand-authored as well: --check
// validates it (agreeing identifier names, owner metadata, one local plugin
// entry resolving to PLUGIN_ROOT and no second version) and reports it as
// missing when absent.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLUGIN_ROOT = "integrations/claude-code";

// The plugin's shipped identity: the manifest name and the marketplace name
// both derive from it.
export const PLUGIN_NAME = "yacao";

// The root marketplace that registers the plugin for installation:
//   claude plugin marketplace add <repo> && claude plugin install yacao@yacao
// It is hand-authored like the hooks statics - the generator never writes it,
// and --check validates it instead of comparing generated content.
export const MARKETPLACE_PATH = ".claude-plugin/marketplace.json";

// The complete, closed set of files the generator may write.
export const OUTPUT_PATHS = Object.freeze([
  ".claude-plugin/plugin.json",
  "agents/orchestrator.md",
  "agents/builder.md",
  "skills/planning/SKILL.md",
  "skills/implementation/SKILL.md",
  "skills/review/SKILL.md",
  "guardrails.json",
]);

// Hand-authored files that ship inside the plugin bundle but are not derived
// from the canonical sources, so the generator never writes them: the guard
// hook wiring and the guard itself. Generation scans their text like any
// generated file, and --check additionally requires them to be present.
export const STATIC_PATHS = Object.freeze([
  "hooks/hooks.json",
  "hooks/guard.mjs",
]);

// Total files --check verifies: the generated allowlist, the hand-authored
// hooks statics and the root marketplace.
const CHECKED_FILE_COUNT = OUTPUT_PATHS.length + STATIC_PATHS.length + 1;

// Claude Code agent definitions: native frontmatter fields only. The
// orchestrator may spawn only the plugin builder and the built-in explorer;
// the builder inherits the caller's model and must not ask user questions.
const AGENT_SPECS = [
  {
    name: "orchestrator",
    mode: "primary",
    tools: [
      "Agent(yacao:builder, Explore)",
      "SendMessage",
      "Skill",
      "Read",
      "Grep",
      "Glob",
      "WebFetch",
      "WebSearch",
      "Bash",
      "AskUserQuestion",
      "Edit",
      "Write",
    ],
  },
  {
    name: "builder",
    mode: "subagent",
    model: "inherit",
    tools: ["Read", "Grep", "Glob", "WebFetch", "WebSearch", "Bash", "Edit", "Write", "Agent"],
  },
];

// Skills are invoked in Claude Code as yacao:<name>, so the generated
// directory and frontmatter name drop the canonical yacao- prefix.
const SKILL_SPECS = [
  { name: "planning", source: "skills/yacao-planning/SKILL.md", output: "skills/planning/SKILL.md" },
  {
    name: "implementation",
    source: "skills/yacao-implementation/SKILL.md",
    output: "skills/implementation/SKILL.md",
  },
  { name: "review", source: "skills/yacao-review/SKILL.md", output: "skills/review/SKILL.md" },
];

const POLICY_CATEGORIES = ["bash", "read", "edit", "skill", "task"];

// Canonical permission keys that have no place in Claude Code guardrails:
// the blanket all-allow and the OpenCode-only host gates.
const HOST_ONLY_PERMISSION_KEYS = new Set([
  "*",
  "external_directory",
  "doom_loop",
  "lsp",
  "question",
]);

const AGENT_FIELDS = new Set(["description", "mode", "temperature", "permission", "prompt"]);
const SKILL_FIELDS = new Set(["name", "description"]);
const DECISIONS = new Set(["allow", "ask", "deny"]);

// The canonical host-terminology paragraph of the implementation skill. The
// generator replaces it with the Claude Code dispatch wording and fails if the
// source no longer carries it, so source drift cannot pass silently.
const TERMINOLOGY_PARAGRAPH =
  "> **Delegation tool terminology.** The delegation tool is host-specific: V1 exposes it as `Task` and returns `task_id`; V2 exposes it as `subagent` and returns `sessionID`. This skill calls it the delegation tool and its return value the session reference. Record the actual returned reference and never fabricate one.";

const DISPATCH_PARAGRAPH =
  "> **Dispatch and continuation.** In Claude Code the dispatch tool is the **Agent** tool: dispatch the explicit custom agent type `yacao:builder` - never a fork or a teammate - and record the actual returned agent ID; never fabricate one. Continue an existing task by sending a follow-up message with the **SendMessage** tool targeted at that recorded agent ID on the same dispatched agent, and wait for the agent to actually complete before reviewing its work or advancing to the next task.";

const FORBIDDEN_OUTPUT = [
  { pattern: /opencode/i, reason: "an OpenCode reference" },
  { pattern: /`Task`/, reason: "the OpenCode V1 delegation tool name" },
  { pattern: /task_id/, reason: "the OpenCode V1 return field" },
  { pattern: /sessionID/, reason: "the OpenCode V2 return field" },
  { pattern: /delegation tool/, reason: "pre-adaptation delegation wording" },
  // The quoted form "builder" is the agent's own frontmatter name; every other
  // occurrence must be the qualified yacao:builder reference.
  { pattern: /(?<![\w:"])[Bb]uilder\b/, reason: "an unqualified builder agent reference" },
  { pattern: /yacao-(?:planning|implementation|review)/, reason: "an unqualified skill reference" },
  { pattern: /\{file:/, reason: "an unresolved prompt reference" },
  { pattern: /\.\.\//, reason: "a path escaping the plugin root" },
];

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

const requireDecision = (value, what) => {
  if (!DECISIONS.has(value)) {
    throw new Error(`unsupported source: ${what} must be one of allow/ask/deny`);
  }
  return value;
};

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Host-binding text adaptation for the generated copies: namespaced skills,
// the .yacao/plans protocol path, and qualified agent references. The
// lookbehind keeps an already-qualified yacao:builder untouched.
const adaptText = (text) =>
  text
    .replaceAll("yacao-planning", "yacao:planning")
    .replaceAll("yacao-implementation", "yacao:implementation")
    .replaceAll("yacao-review", "yacao:review")
    .replaceAll(".opencode/plans", ".yacao/plans")
    .replaceAll("`explore`", "`Explore`")
    .replaceAll("the delegation tool", "the Agent tool")
    .replaceAll("a session reference", "an agent ID")
    .replaceAll("session reference", "agent ID")
    .replace(/(?<![\w:])(?:builder|Builder)\b/g, "yacao:builder");

const adaptImplementationBody = (body) => {
  if (!body.includes(TERMINOLOGY_PARAGRAPH)) {
    throw new Error(
      "unsupported source: skills/yacao-implementation/SKILL.md no longer contains the canonical delegation-terminology paragraph - update scripts/build-claude-code.mjs",
    );
  }
  return body.replace(TERMINOLOGY_PARAGRAPH, DISPATCH_PARAGRAPH);
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
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return { fields, body: raw.slice(match[0].length) };
};

const loadAgent = (root, spec) => {
  const rel = `agents/${spec.name}.json`;
  const definition = readSourceJson(root, rel);
  if (!isPlainObject(definition)) {
    throw new Error(`unsupported source: ${rel} must be a JSON object`);
  }
  for (const key of Object.keys(definition)) {
    if (!AGENT_FIELDS.has(key)) throw new Error(`unsupported field "${key}" in ${rel}`);
  }
  const description = adaptText(requireText(definition.description, `${rel} description`));
  if (definition.mode !== spec.mode) {
    throw new Error(
      `unsupported mode ${JSON.stringify(definition.mode)} in ${rel} (expected ${JSON.stringify(spec.mode)})`,
    );
  }
  if (definition.temperature !== undefined && typeof definition.temperature !== "number") {
    throw new Error(`unsupported temperature in ${rel}`);
  }
  if (!isPlainObject(definition.permission)) {
    throw new Error(`unsupported source: ${rel} permission must be an object`);
  }
  for (const key of Object.keys(definition.permission)) {
    if (!POLICY_CATEGORIES.includes(key) && !HOST_ONLY_PERMISSION_KEYS.has(key)) {
      throw new Error(`unsupported permission key "${key}" in ${rel}`);
    }
  }
  const reference = /^\{file:(.+)\}$/.exec(requireText(definition.prompt, `${rel} prompt`));
  if (!reference) {
    throw new Error(`unsupported prompt reference ${JSON.stringify(definition.prompt)} in ${rel}`);
  }
  const promptRel = path.posix.normalize(path.posix.join(path.posix.dirname(rel), reference[1]));
  if (promptRel.startsWith("..")) {
    throw new Error(`unsupported prompt reference ${JSON.stringify(definition.prompt)} in ${rel} escapes the repository`);
  }
  const prompt = adaptText(readSourceText(root, promptRel));
  return { spec, rel, definition, prompt, description };
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
  const description = adaptText(requireText(fields.description, `${spec.source} description`));
  let adapted = spec.name === "implementation" ? adaptImplementationBody(body) : body;
  if (spec.name === "planning") {
    adapted += "\nWhen working on a project below the session root, store its plans under `.yacao/plans/<project-relative-path>/plan-<slug>/`; otherwise use `.yacao/plans/plan-<slug>/`.\nThese paths are relative to the session root, not the target project root; use the selected plan directory for all overview, task and ledger paths in this skill.\n";
  }
  return { spec, description, body: adaptText(adapted) };
};

// Guardrail patterns keep the canonical wildcard syntax; only host names and
// protocol paths are adapted (agent keys and skill names become qualified).
const adaptPolicyPattern = (pattern) =>
  pattern
    .replaceAll(".opencode/plans", ".yacao/plans")
    .replaceAll("yacao-planning", "yacao:planning")
    .replaceAll("yacao-implementation", "yacao:implementation")
    .replaceAll("yacao-review", "yacao:review")
    .replace(/^builder$/, "yacao:builder")
    .replace(/^explore$/, "Explore");

const policyRules = (value, what) => {
  if (typeof value === "string") {
    return [{ pattern: "*", decision: requireDecision(value, what) }];
  }
  if (isPlainObject(value)) {
    return Object.entries(value).map(([pattern, decision]) => ({
      pattern: adaptPolicyPattern(pattern),
      decision: requireDecision(decision, `${what} rule ${JSON.stringify(pattern)}`),
    }));
  }
  throw new Error(`unsupported source: ${what} must be a decision string or a rule object`);
};

const buildGuardrails = (agents) => {
  const policy = {};
  for (const agent of agents) {
    const role = {};
    for (const category of POLICY_CATEGORIES) {
      if (!(category in agent.definition.permission)) continue;
      role[category] = policyRules(
        agent.definition.permission[category],
        `${agent.rel} permission.${category}`,
      );
    }
    policy[`yacao:${agent.spec.name}`] = role;
  }
  return policy;
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
};

// The hand-authored statics are held to the same text checks as the
// generated files. A missing static is not a generation error - the
// generator cannot recreate it; --check reports it as a mismatch instead.
const scanStaticPaths = (root) => {
  for (const rel of STATIC_PATHS) {
    const abs = path.join(root, PLUGIN_ROOT, rel);
    if (existsSync(abs)) assertCleanOutput(rel, readFileSync(abs, "utf8"));
  }
};

// Pure generation: reads the canonical sources, scans the hand-authored
// statics, and returns the bundle as
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
  files[".claude-plugin/plugin.json"] = jsonText({
    name: PLUGIN_NAME,
    description: pkg.description.replace(/\bOpenCode\b/g, "Claude Code"),
    version: pkg.version,
    license: "MIT",
    author: { name: "augustoolucas" },
    settings: { agent: "orchestrator" },
  });
  for (const agent of agents) {
    const fields = [
      ["name", agent.spec.name],
      ["description", agent.description],
      ["tools", agent.spec.tools],
    ];
    if (agent.spec.model) fields.push(["model", agent.spec.model]);
    files[`agents/${agent.spec.name}.md`] = renderMarkdown(fields, agent.prompt);
  }
  for (const skill of skills) {
    files[skill.spec.output] = renderMarkdown(
      [
        ["name", skill.spec.name],
        ["description", skill.description],
      ],
      skill.body,
    );
  }
  files["guardrails.json"] = jsonText(buildGuardrails(agents));

  const emitted = Object.keys(files);
  if (emitted.length !== OUTPUT_PATHS.length || OUTPUT_PATHS.some((rel) => !(rel in files))) {
    throw new Error(`internal error: generated file set ${emitted.join(", ")} does not match the allowlist`);
  }
  for (const rel of OUTPUT_PATHS) assertCleanOutput(rel, files[rel]);
  scanStaticPaths(root);
  return files;
}

// Read-only validation of the hand-authored root marketplace against the
// plugin it registers. Out of the marketplace repository none of this is
// generated, so any structural or containment problem is reported as
// "invalid" with a detail instead of a content diff.
export function checkMarketplace({ root = defaultRoot() } = {}) {
  const invalid = (detail) => ({
    ok: false,
    mismatches: [{ path: MARKETPLACE_PATH, reason: "invalid", detail }],
  });
  const abs = path.join(root, MARKETPLACE_PATH);
  if (!existsSync(abs)) {
    return { ok: false, mismatches: [{ path: MARKETPLACE_PATH, reason: "missing" }] };
  }
  let marketplace;
  try {
    marketplace = JSON.parse(readFileSync(abs, "utf8"));
  } catch (error) {
    return invalid(`it is not valid JSON (${error.message})`);
  }
  if (!isPlainObject(marketplace)) return invalid("it must be a JSON object");
  if ("version" in marketplace) {
    return invalid("it carries a version; the generated plugin manifest carries the only version");
  }
  if (
    typeof marketplace.name !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(marketplace.name) ||
    marketplace.name.includes("..")
  ) {
    return invalid(`the name ${JSON.stringify(marketplace.name)} is not an identifier`);
  }
  if (marketplace.name !== PLUGIN_NAME) {
    return invalid(
      `the name ${JSON.stringify(marketplace.name)} does not match the plugin name ${JSON.stringify(PLUGIN_NAME)}`,
    );
  }
  const owner = marketplace.owner;
  if (!isPlainObject(owner) || typeof owner.name !== "string" || owner.name.trim() === "") {
    return invalid("the owner must be an object with a non-empty name");
  }
  for (const field of ["email", "url"]) {
    if (field in owner && (typeof owner[field] !== "string" || owner[field].trim() === "")) {
      return invalid(`the owner ${field} must be a non-empty string`);
    }
  }
  if (!Array.isArray(marketplace.plugins) || marketplace.plugins.length !== 1) {
    return invalid("plugins must hold exactly one plugin entry");
  }
  const entry = marketplace.plugins[0];
  if (!isPlainObject(entry)) return invalid("the plugin entry must be an object");
  if ("version" in entry) {
    return invalid("the plugin entry carries a version; the generated plugin manifest carries the only version");
  }
  if (entry.name !== PLUGIN_NAME) {
    return invalid(
      `the plugin entry name ${JSON.stringify(entry.name)} does not match the plugin name ${JSON.stringify(PLUGIN_NAME)}`,
    );
  }
  if ("description" in entry && (typeof entry.description !== "string" || entry.description.trim() === "")) {
    return invalid("the plugin entry description must be a non-empty string");
  }
  const source = entry.source;
  if (typeof source !== "string" || !source.startsWith("./")) {
    return invalid(`the plugin source ${JSON.stringify(source)} must be a ./-relative path`);
  }
  const resolved = path.resolve(root, source);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return invalid(`the plugin source ${JSON.stringify(source)} escapes the repository`);
  }
  if (resolved !== path.join(root, PLUGIN_ROOT)) {
    return invalid(`the plugin source ${JSON.stringify(source)} does not resolve to ${PLUGIN_ROOT}`);
  }
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    return invalid(`the plugin source ${JSON.stringify(source)} does not exist`);
  }
  return { ok: true, mismatches: [] };
}

// Read-only comparison of the generated bundle against the files on disk,
// plus validation of the hand-authored root marketplace.
export function checkPlugin({ root = defaultRoot() } = {}) {
  const files = generatePlugin({ root });
  const mismatches = [];
  for (const rel of OUTPUT_PATHS) {
    const abs = path.join(root, PLUGIN_ROOT, rel);
    if (!existsSync(abs)) {
      mismatches.push({ path: rel, reason: "missing" });
      continue;
    }
    if (readFileSync(abs, "utf8") !== files[rel]) {
      mismatches.push({ path: rel, reason: "differs" });
    }
  }
  for (const rel of STATIC_PATHS) {
    const abs = path.join(root, PLUGIN_ROOT, rel);
    if (!existsSync(abs)) {
      mismatches.push({ path: rel, reason: "missing" });
    }
  }
  mismatches.push(...checkMarketplace({ root }).mismatches);
  return { ok: mismatches.length === 0, mismatches };
}

const USAGE = `usage: node scripts/build-claude-code.mjs [--check] [--root <dir>]

Writes the Claude Code plugin bundle under ${PLUGIN_ROOT}/ from the canonical
YACAO sources. --check verifies the committed bundle (${OUTPUT_PATHS.length} generated
files plus the ${STATIC_PATHS.length} hand-authored hooks statics) and the root
${MARKETPLACE_PATH} without writing or deleting anything.`;

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
        console.log(`claude-code plugin is up to date (${CHECKED_FILE_COUNT} files)`);
        return 0;
      }
      for (const mismatch of mismatches) {
        const display =
          mismatch.path === MARKETPLACE_PATH ? mismatch.path : path.posix.join(PLUGIN_ROOT, mismatch.path);
        console.error(`${mismatch.reason}: ${display}${mismatch.detail ? ` (${mismatch.detail})` : ""}`);
      }
      console.error(
        `claude-code plugin is out of date (${mismatches.length} of ${CHECKED_FILE_COUNT} files)`,
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
