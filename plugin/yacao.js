import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_FILES = ["orchestrator.json", "builder.json"];
const FILE_REF = /^\{file:(.+)\}$/;
const ROOT = path.dirname(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))));

const UPDATE_ENDPOINT = "https://api.github.com/repos/augustoolucas/yacao/releases/latest";
const UPDATE_DELAY_MS = 5000;
const UPDATE_TIMEOUT_MS = 8000;
const UPDATE_TTL_MS = 60 * 60 * 1000;
// Matches a quoted YACAO git plugin spec, pinned or not, whatever the quote style.
const YACAO_SPEC = /(["'])yacao@git\+https:\/\/github\.com\/augustoolucas\/yacao\.git(?:#[^"']*)?\1/g;

let notified = false; // once per process

const resolveFileRefs = (value, baseDir) => {
  if (typeof value === "string") {
    const match = FILE_REF.exec(value);
    if (match) return fs.readFileSync(path.resolve(baseDir, match[1]), "utf8");
    return value;
  }
  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      value[key] = resolveFileRefs(value[key], baseDir);
    }
  }
  return value;
};

const notificationMessage = () => {
  try {
    const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return version ? `v${version} loaded` : "plugin loaded";
  } catch {
    return "plugin loaded";
  }
};

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const mergeDefinition = (base, override) => {
  if (!isPlainObject(base) || !isPlainObject(override)) return override;
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = mergeDefinition(base[key], value);
  }
  return result;
};

const runningVersion = () => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version ?? null;
  } catch {
    return null;
  }
};

const parseSemver = (value) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value ?? "");
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

const isNewer = (candidate, current) => {
  const next = parseSemver(candidate);
  const own = parseSemver(current);
  if (!next || !own) return false;
  for (let i = 0; i < 3; i += 1) {
    if (next[i] !== own[i]) return next[i] > own[i];
  }
  return false;
};

const normalizeTag = (tag) => (String(tag).startsWith("v") ? String(tag) : `v${tag}`);

const cacheRoot = () => process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");

// One check per hour at most. The timestamp is written before the request so a
// failed check does not retry on every startup.
const claimUpdateCheck = () => {
  const file = path.join(cacheRoot(), "yacao", "last-update-check.json");
  try {
    const { checkedAt } = JSON.parse(fs.readFileSync(file, "utf8"));
    if (typeof checkedAt === "number" && Date.now() - checkedAt < UPDATE_TTL_MS) return false;
  } catch {
    // no previous check on record
  }
  try {
    const temporary = `${file}.tmp`;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({ checkedAt: Date.now() }));
    fs.renameSync(temporary, file);
  } catch {
    // persisting the claim is best effort; the check can still run
  }
  return true;
};

const fetchLatestTag = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPDATE_TIMEOUT_MS);
  try {
    const response = await fetch(UPDATE_ENDPOINT, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "yacao" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`GitHub responded with ${response.status}`);
    const { tag_name: tag } = await response.json();
    return typeof tag === "string" ? tag : null;
  } finally {
    clearTimeout(timeout);
  }
};

const globalConfigDir = () =>
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode");

const configCandidates = (directory, includeProject) => {
  const candidates = [
    path.join(globalConfigDir(), "opencode.jsonc"),
    path.join(globalConfigDir(), "opencode.json"),
  ];
  if (includeProject && directory) {
    candidates.push(path.join(directory, ".opencode", "opencode.jsonc"));
    candidates.push(path.join(directory, ".opencode", "opencode.json"));
  }
  return candidates;
};

// Rewrites raw text instead of parsing JSON so jsonc comments and formatting
// survive; the quote style of the matched spec is preserved.
const pinConfigs = (tag, directory, includeProject) => {
  const spec = `yacao@git+https://github.com/augustoolucas/yacao.git#${normalizeTag(tag)}`;
  let updated = 0;
  for (const file of configCandidates(directory, includeProject)) {
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rewritten = raw.replace(YACAO_SPEC, (_match, quote) => `${quote}${spec}${quote}`);
    if (rewritten === raw) continue;
    try {
      const temporary = `${file}.tmp`;
      fs.writeFileSync(temporary, rewritten);
      fs.chmodSync(temporary, fs.statSync(file).mode & 0o7777);
      fs.renameSync(temporary, file);
      updated += 1;
    } catch {
      // unreadable or unwritable candidate: keep going
    }
  }
  return updated > 0;
};

export const YacaoPlugin = async ({ client, directory, worktree, options: inputOptions } = {}, pluginOptions) => {
  const options = inputOptions ?? pluginOptions ?? {};

  const logError = async (error) => {
    const message = `YACAO plugin failed: ${error?.stack ?? error}`;
    try {
      if (client?.app?.log) {
        await client.app.log({ body: { service: "yacao", level: "error", message } });
        return;
      }
    } catch {
      // fall through to console.error
    }
    console.error(message);
  };

  const notify = async () => {
    if (notified) return;
    notified = true;
    const message = notificationMessage();
    try {
      await client?.tui?.showToast({
        body: { title: "YACAO", message, variant: "info", duration: 4000 },
      });
    } catch {
      // never throw during startup
    }
    try {
      await client?.app?.log({ body: { service: "yacao", level: "info", message } });
    } catch {
      // never throw during startup
    }
  };

  const checkForUpdate = async () => {
    try {
      if (options.autoUpdate !== true) return;
      if (!claimUpdateCheck()) return;
      const tag = await fetchLatestTag();
      if (!tag || !isNewer(tag, runningVersion())) return;
      if (!pinConfigs(tag, worktree ?? directory, options.updateScope === "all")) return;
      const message = `updated to ${normalizeTag(tag)} - restart to apply`;
      try {
        await client?.tui?.showToast({
          body: { title: "YACAO", message, variant: "info", duration: 4000 },
        });
      } catch {
        // never throw during startup
      }
      try {
        await client?.app?.log({ body: { service: "yacao", level: "info", message } });
      } catch {
        // never throw during startup
      }
    } catch (error) {
      await logError(error);
    }
  };

  // Covers the TUI-resume case (no session.created fires). The toast is lost if
  // published before the TUI subscribes, and there is no delivery confirmation,
  // so wait for the UI to come up.
  const fallbackTimer = setTimeout(() => notify(), 5000);
  fallbackTimer.unref?.();

  // Runs after startup so a slow network call cannot delay plugin loading.
  const updateTimer = setTimeout(() => checkForUpdate(), UPDATE_DELAY_MS);
  updateTimer.unref?.();

  return {
    config: async (config) => {
      try {
        const agentsDir = path.join(ROOT, "agents");

        config.agent ??= {};
        for (const file of AGENT_FILES) {
          const agentPath = path.join(agentsDir, file);
          const name = path.basename(file, ".json");
          const definition = resolveFileRefs(
            JSON.parse(fs.readFileSync(agentPath, "utf8")),
            path.dirname(agentPath)
          );
          config.agent[name] = mergeDefinition(definition, config.agent[name] ?? {});
        }

        const skillsDir = path.join(ROOT, "skills");
        config.skills ??= {};
        config.skills.paths ??= [];
        if (!config.skills.paths.includes(skillsDir)) {
          config.skills.paths.push(skillsDir);
        }

        config.default_agent ??= "orchestrator";
      } catch (error) {
        await logError(error);
      }
    },
    event: async ({ event } = {}) => {
      if (event?.type !== "session.created") return;
      clearTimeout(fallbackTimer);
      await notify();
    },
  };
};
