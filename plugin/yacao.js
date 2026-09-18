import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_FILES = ["orchestrator.json", "builder.json"];
const FILE_REF = /^\{file:(.+)\}$/;

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

  return {
    config: async (config) => {
      try {
        const pluginFile = fs.realpathSync(fileURLToPath(import.meta.url));
        const root = path.dirname(path.dirname(pluginFile));
        const agentsDir = path.join(root, "agents");

        config.agent ??= {};
        for (const file of AGENT_FILES) {
          const agentPath = path.join(agentsDir, file);
          const name = path.basename(file, ".json");
          const definition = resolveFileRefs(
            JSON.parse(fs.readFileSync(agentPath, "utf8")),
            path.dirname(agentPath)
          );
          config.agent[name] = { ...definition, ...(config.agent[name] ?? {}) };
        }

        const skillsDir = path.join(root, "skills");
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
  };
};
