import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const UPDATE_ENDPOINT = "https://api.github.com/repos/augustoolucas/yacao/releases/latest";
const UPDATE_TIMEOUT_MS = 8000;
const UPDATE_TTL_MS = 60 * 60 * 1000;
const ROOT = path.dirname(path.dirname(fs.realpathSync(fileURLToPath(import.meta.url))));

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

export default {
  id: "yacao.cli",

  setup(context) {
    const version = runningVersion() ?? "unknown";

    context.ui.toast.show({
      title: "YACAO",
      message: `v${version} loaded`,
      variant: "info",
      duration: 4000,
    });

    const [state, update] = context.storage.store("yacao.update", {
      initial: { checkedAt: 0, latest: null },
    });

    const status = () => (
      <text>{`YACAO v${version}${state.latest ? ` - update ${state.latest} available` : ""}`}</text>
    );

    context.ui.slot({ append: "home.footer.status", render: status });
    context.ui.slot({ append: "sidebar.content", render: status });

    // Display only: the check never rewrites configuration.
    const checkForUpdate = async () => {
      try {
        if (Date.now() - state.checkedAt < UPDATE_TTL_MS) return;
        // The timestamp is stored before the request so a failed check does not
        // retry on every startup.
        await update((draft) => {
          draft.checkedAt = Date.now();
        });
        const tag = await fetchLatestTag();
        if (!tag) return;
        await update((draft) => {
          draft.latest = isNewer(tag, version) ? normalizeTag(tag) : null;
        });
      } catch {
        // never surface update-check failures in the TUI
      }
    };

    const timer = setTimeout(() => checkForUpdate(), 0);
    timer.unref?.();

    return () => clearTimeout(timer);
  },
};
