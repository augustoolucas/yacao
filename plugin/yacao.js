import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_FILES = ["orchestrator.json", "builder.json"];
const FILE_REF = /^\{file:(.+)\}$/;
const ROOT = path.dirname(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))));

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

export const YacaoPlugin = async ({ client } = {}) => {
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

  // Covers the TUI-resume case (no session.created fires). The toast is lost if
  // published before the TUI subscribes, and there is no delivery confirmation,
  // so wait for the UI to come up.
  const fallbackTimer = setTimeout(() => notify(), 5000);
  fallbackTimer.unref?.();

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
