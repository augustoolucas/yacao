#!/usr/bin/env node
// YACAO guard for Claude Code: one PreToolUse hook that applies the ordered
// per-role policy packaged in guardrails.json to the direct tool calls of the
// two plugin agents - and only to those two.
//
// Enforcement scope:
//   - Rules apply only when agent_type is exactly "yacao:orchestrator" or
//     "yacao:builder". Any other or missing identity produces no decision and
//     stays entirely under the native permission gate. Ownership is never
//     inferred from unqualified names, transcript contents or the cwd.
//   - The hook can only tighten: it emits "ask" or "deny", never "allow", and
//     never rewrites tool input. Native user, project, plugin and managed
//     rules still apply, deny still wins over ask, and a host or user can
//     disable hooks altogether - this is a guardrail, not a sandbox.
//   - It reads stdin JSON and the packaged guardrails.json and nothing else,
//     and it writes nothing: no filesystem or state changes, no network, no
//     logging. Decision reasons name the role, the tool and the matched
//     policy pattern; command text and file contents are never echoed.
//
// Coverage limits:
//   - Bash matches the whole command string against the canonical patterns
//     translated to anchored wildcards ("*" spans any characters, separators
//     and spaces included; the last matching rule wins). The command is never
//     split, rewritten or executed. Raw compound commands ("a && b", pipes,
//     substitutions), aliases, shell functions, quoting tricks and script
//     files are NOT fully covered: such a command is one opaque string here,
//     so a guarded verb hidden inside it can fall through to the native gate.
//   - Read/Edit/Write classify the absolute file_path against the project
//     root (CLAUDE_PROJECT_DIR), normalizing path separators, "." and ".."
//     and resolving symlinked ancestors, then match the root-relative path
//     against the role's read/edit rules.
//   - Skill and Agent read the documented input fields ("skill" and
//     "subagent_type"). Whether the host delivers every skill invocation as a
//     PreToolUse call for the Skill tool is a native-gate property this hook
//     cannot establish.
//
// Output contract: exit status 0 always; either a single JSON decision object
// on stdout, or empty output for "no decision" (fall through).

import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The only identities this hook speaks for: plugin-qualified agent names.
const ROLE_IDS = new Set(["yacao:orchestrator", "yacao:builder"]);

// Tools this hook is wired for in hooks.json.
const COVERED_TOOLS = new Set(["Bash", "Read", "Edit", "Write", "Skill", "Agent"]);

// The input field each covered tool must carry for its policy to be checked.
const INPUT_FIELD = {
  Bash: "command",
  Read: "file_path",
  Edit: "file_path",
  Write: "file_path",
  Skill: "skill",
  Agent: "subagent_type",
};

const DECISIONS = new Set(["allow", "ask", "deny"]);

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = path.join(PLUGIN_ROOT, "guardrails.json");

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Canonical wildcard patterns: "*" matches any span of characters (empty
// included, separators and spaces included) and the pattern is anchored to
// the whole value; everything else is literal text.
const escapeLiteral = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const compiled = new Map();
const patternToRegExp = (pattern) => {
  let matcher = compiled.get(pattern);
  if (matcher === undefined) {
    matcher = new RegExp(`^${pattern.split("*").map(escapeLiteral).join(".*")}$`);
    compiled.set(pattern, matcher);
  }
  return matcher;
};

// Ordered policy semantics: the LAST matching rule wins. Returns the winning
// rule or null when no rule matches a value.
const lastMatch = (rules, value) => {
  let winner = null;
  for (const rule of rules) {
    if (patternToRegExp(rule.pattern).test(value)) winner = rule;
  }
  return winner;
};

// Read and validate the packaged policy. Rule order and decisions are
// trusted only after this shape check; any failure is an error string, which
// a recognized role turns into an actionable deny, never a silent allow.
const loadPolicy = () => {
  let text;
  try {
    text = readFileSync(POLICY_PATH, "utf8");
  } catch (error) {
    return { error: `the packaged guardrails.json cannot be read (${error.code ?? "unknown error"})` };
  }
  let policy;
  try {
    policy = JSON.parse(text);
  } catch {
    return { error: "the packaged guardrails.json is not valid JSON" };
  }
  if (!isPlainObject(policy)) {
    return { error: "the packaged guardrails.json must be a JSON object" };
  }
  for (const roleId of ROLE_IDS) {
    if (!isPlainObject(policy[roleId])) {
      return { error: `the packaged guardrails.json has no rule object for ${roleId}` };
    }
    // A role without any rule category would silently disable enforcement.
    // (A category being absent is legitimate - the canonical roles differ -
    // but a role carrying nothing is not.)
    if (Object.keys(policy[roleId]).length === 0) {
      return { error: `the rule object for ${roleId} in guardrails.json carries no rule category` };
    }
  }
  for (const [roleId, categories] of Object.entries(policy)) {
    if (!isPlainObject(categories)) {
      return { error: `the rule object for ${roleId} in guardrails.json must be an object` };
    }
    for (const [category, rules] of Object.entries(categories)) {
      if (!Array.isArray(rules) || rules.length === 0) {
        return { error: `the rule list ${roleId}.${category} in guardrails.json must be a non-empty array` };
      }
      for (const rule of rules) {
        if (!isPlainObject(rule) || typeof rule.pattern !== "string" || rule.pattern === "") {
          return { error: `a rule in ${roleId}.${category} in guardrails.json has no pattern string` };
        }
        if (!DECISIONS.has(rule.decision)) {
          return {
            error: `the rule "${rule.pattern}" in ${roleId}.${category} in guardrails.json must decide allow, ask or deny`,
          };
        }
      }
    }
  }
  return { policy };
};

const toPosix = (value) => value.split("\\").join("/");

// Real path of the deepest existing ancestor of "absolute" with the
// non-existing remainder re-appended, so symlinked ancestors are resolved
// for targets that do not exist yet. Reads only; never changes anything.
const realpathDeepest = (absolute) => {
  let current = absolute;
  const missing = [];
  for (;;) {
    try {
      return path.join(realpathSync(current), ...missing);
    } catch (error) {
      if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
};

// Classify a file-tool target: the path relative to the project root when it
// is inside the root (the shape the read/edit policy patterns use), otherwise
// the resolved absolute path. Returns { target } or { error }.
const classifyTarget = (filePath) => {
  const rawRoot = process.env.CLAUDE_PROJECT_DIR;
  if (typeof rawRoot !== "string" || rawRoot.trim() === "") {
    return { error: "CLAUDE_PROJECT_DIR is not set" };
  }
  if (!path.isAbsolute(filePath)) {
    return { error: "the file_path input is not an absolute path" };
  }
  let root;
  try {
    root = realpathSync(rawRoot);
  } catch {
    return { error: "CLAUDE_PROJECT_DIR cannot be resolved to a real path" };
  }
  let resolved;
  try {
    resolved = realpathDeepest(path.resolve(filePath));
  } catch (error) {
    return { error: `the file_path input cannot be resolved (${error.code ?? "unknown error"})` };
  }
  const relative = path.relative(root, resolved);
  const inside =
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  return { target: toPosix(inside ? (relative === "" ? "." : relative) : resolved) };
};

// Which policy category a covered tool consults for this role, or null when
// the tool is out of hook scope for the role.
const categoryFor = (roleId, toolName) => {
  if (toolName === "Bash") return "bash";
  if (toolName === "Read") return "read";
  if (toolName === "Edit" || toolName === "Write") return "edit";
  if (toolName === "Skill") return "skill";
  // Only yacao:builder has its spawn scope enforced here: the orchestrator's
  // subagent allowlist ("yacao:builder", "Explore") is native to the Agent
  // tool frontmatter, so its task policy stays adapter data.
  if (toolName === "Agent" && roleId === "yacao:builder") return "task";
  return null;
};

const missingInputDeny = (roleId, toolName, field, why) => ({
  decision: "deny",
  reason: `YACAO guard (${roleId}): ${toolName} is not accompanied by a usable "${field}" input field (${why}), so the role policy cannot be checked; refusing the tool call.`,
});

const subjectFor = (toolName, target) => {
  if (toolName === "Bash") return "the Bash command";
  if (toolName === "Skill") return `the Skill call for "${target}"`;
  if (toolName === "Agent") return `the Agent call spawning "${target}"`;
  return `${toolName} of "${target}"`;
};

const evaluate = (policy, roleId, toolName, toolInput) => {
  const category = categoryFor(roleId, toolName);
  if (category === null) return null;
  const rules = policy[roleId][category];
  // A role that declares no rules for this tool stays on the native gate; the
  // load-time check rejects a policy whose declared rule list is empty.
  if (!Array.isArray(rules)) return null;
  const field = INPUT_FIELD[toolName];
  if (!isPlainObject(toolInput)) {
    return missingInputDeny(roleId, toolName, field, "the tool input object is absent");
  }
  const raw = toolInput[field];
  if (typeof raw !== "string" || raw.trim() === "") {
    return missingInputDeny(roleId, toolName, field, "it is missing or not a non-empty string");
  }
  let target;
  if (toolName === "Bash") {
    target = raw.trim();
  } else if (field === "file_path") {
    const classified = classifyTarget(raw);
    if (classified.error) {
      return {
        decision: "deny",
        reason: `YACAO guard (${roleId}): ${toolName} cannot be checked because ${classified.error}; refusing the tool call.`,
      };
    }
    target = classified.target;
  } else {
    target = raw;
  }
  const match = lastMatch(rules, target);
  if (match === null || match.decision === "allow") return null;
  return {
    decision: match.decision,
    reason: `YACAO guard (${roleId}): ${subjectFor(toolName, target)} matches the role policy rule "${match.pattern}" (${match.decision}); the native permission gate still applies on top.`,
  };
};

const run = (input) => {
  if (!isPlainObject(input)) return null;
  const roleId = input.agent_type;
  if (typeof roleId !== "string" || !ROLE_IDS.has(roleId)) return null;
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || !COVERED_TOOLS.has(toolName)) return null;
  const loaded = loadPolicy();
  if (loaded.error) {
    return {
      decision: "deny",
      reason: `YACAO guard (${roleId}): the role policy cannot be enforced because ${loaded.error}; refusing ${toolName} instead of allowing it unchecked.`,
    };
  }
  return evaluate(loaded.policy, roleId, toolName, input.tool_input);
};

// Hook input arrives as JSON on stdin; unparseable input has no identity, so
// it produces no decision (the native gate still applies on its own).
const readInput = () => {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const result = run(readInput());
if (result !== null) {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: result.decision,
        permissionDecisionReason: result.reason,
      },
    })}\n`,
  );
}
