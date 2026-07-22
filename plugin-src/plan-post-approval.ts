import type { Plugin, PluginInput } from "@opencode-ai/plugin";

const PLAN_QUESTION_HEADER = "PlanApprove";

const APPROVE_LABEL = "Approve";

const PROMPT_MAX_RETRIES = 2;
const PROMPT_BACKOFF_MS = 500;

type QuestionAskedProperties = {
  id: string;
  sessionID: string;
  questions: Array<{
    header: string;
    question: string;
  }>;
};

type QuestionEvent =
  | { type: "question.asked"; properties: QuestionAskedProperties }
  | { type: "question.rejected"; properties: { requestID: string } }
  | {
      type: "question.replied";
      properties: {
        sessionID: string;
        requestID: string;
        answers: Array<Array<string>>;
      };
    }
  | { type: "session.idle"; properties: { sessionID: string } };

type RequestMeta = {
  sessionID: string;
  planFile: string | null;
};

type QueuedHandoff = {
  planFile: string | null;
  answersJson: string;
  handoffAgent: string;
};

const DEFAULT_PLAN_HANDOFF_AGENT = "build";

function resolvePlanPostApprovalHandoffAgent(configData: unknown): string {
  if (
    !configData ||
    typeof configData !== "object" ||
    Array.isArray(configData)
  ) {
    return DEFAULT_PLAN_HANDOFF_AGENT;
  }
  const rawOrchestrator =
    configData &&
    typeof configData === "object" &&
    !Array.isArray(configData)
      ? (configData as Record<string, unknown>).agent
      : undefined;
  const orchestratorBlock =
    rawOrchestrator &&
    typeof rawOrchestrator === "object" &&
    !Array.isArray(rawOrchestrator)
      ? (rawOrchestrator as Record<string, unknown>).orchestrator
      : undefined;
  if (
    orchestratorBlock &&
    typeof orchestratorBlock === "object" &&
    !Array.isArray(orchestratorBlock)
  ) {
    const nested = (orchestratorBlock as Record<string, unknown>)
      .plan_post_approval_handoff_agent;
    if (typeof nested === "string") {
      const t = nested.trim();
      if (t) return t;
    }
  }
  const root = (configData as Record<string, unknown>)
    .plan_post_approval_handoff_agent;
  if (typeof root === "string") {
    const t = root.trim();
    if (t) return t;
  }
  return DEFAULT_PLAN_HANDOFF_AGENT;
}

function resolveHandoffFromOptions(options: unknown): string | null {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    return null;
  }
  const v = (options as Record<string, unknown>)
    .plan_post_approval_handoff_agent;
  if (typeof v === "string") {
    const t = v.trim();
    if (t) return t;
  }
  return null;
}

/** Last chronological `agent` field on user messages — typically the routing primary for that turn. */
async function lastUserRoutingAgent(
  client: PluginInput["client"],
  sessionID: string,
  directory: string,
): Promise<string | null> {
  const msgs = await client.session.messages({
    path: { id: sessionID },
    query: { directory, limit: 400 },
  });
  if (msgs.error || !msgs.data?.length) return null;
  let last: string | null = null;
  for (const m of msgs.data) {
    const info = m.info;
    if (
      "role" in info &&
      info.role === "user" &&
      "agent" in info &&
      typeof (info as { agent?: unknown }).agent === "string"
    ) {
      last = (info as { agent: string }).agent;
    }
  }
  return last;
}
function buildApprovedPlanHandoffText(input: {
  compactionNote: string;
  planPath: string;
  answersJson: string;
  handoffAgent: string;
}): string {
  const { compactionNote, planPath, answersJson, handoffAgent } = input;
  const step3 =
    handoffAgent === "orchestrator"
      ? "3. **Do not** change application code yourself. After TODOs exist, delegate each implementation slice via **Task** → `code-executor` (narrow prompts per slice). When the cumulative change set is stable, delegate **Task** → `code-reviewer` then `docs-reviewer`; use `test-verifier` and `security-reviewer` when appropriate."
      : "3. **Do not** change application code until TODOs exist; then mark the first item in progress and implement.";

  return `## Approved plan (automated handoff)

${compactionNote}

**Plan file:** ${planPath}

**Question tool answers (JSON):** ${answersJson}

### Required steps
1. Open the plan file above (or the most recent one under \`.opencode/plans/\` if needed) and treat it as the source of truth.
2. Call the **todowrite** tool to define TODOs that cover every step in the approved plan (consistent statuses).
${step3}

If the user added free-text notes in the question tool, treat them as constraints.`;
}

const requestMetaById = new Map<string, RequestMeta>();
const handoffAfterIdle = new Map<string, QueuedHandoff>();

function extractPlanFile(questionText: string): string | null {
  const normalized = questionText.replace(/\r\n/g, "\n");
  for (const line of normalized.split("\n")) {
    const stripped = line.replace(/\*\*/g, "").trim();
    const m = stripped.match(/^plan file:\s*(.+)$/i);
    if (m?.[1]) {
      let path = m[1].trim();
      if (path.startsWith("`") && path.endsWith("`")) {
        path = path.slice(1, -1).trim();
      }
      path = path.replace(/^["'(]+|[)"']+$/g, "").trim();
      return path;
    }
  }
  const inline = normalized.match(/plan file:\s*`?([^`\n]+?)`?(?:\s*$|\s*\n)/i);
  if (inline?.[1]) return inline[1].trim();
  return null;
}

function summarizeCompactionError(err: unknown): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: { message?: string } }).data;
    if (typeof data?.message === "string") return data.message;
  }
  try {
    return JSON.stringify(err).slice(0, 280);
  } catch {
    return String(err);
  }
}

type ModelPair = { providerID: string; modelID: string };

function parseProviderModel(combined: string): ModelPair | null {
  const idx = combined.indexOf("/");
  if (idx <= 0 || idx === combined.length - 1) return null;
  return {
    providerID: combined.slice(0, idx),
    modelID: combined.slice(idx + 1),
  };
}

async function resolveModelForSummarize(
  client: PluginInput["client"],
  sessionID: string,
  directory: string,
): Promise<ModelPair | null> {
  const msgs = await client.session.messages({
    path: { id: sessionID },
    query: { directory, limit: 200 },
  });
  if (!msgs.error && msgs.data?.length) {
    const list = msgs.data;
    for (let i = list.length - 1; i >= 0; i--) {
      const info = list[i]!.info;
      if (info.role === "user" && "model" in info && info.model) {
        return {
          providerID: info.model.providerID,
          modelID: info.model.modelID,
        };
      }
      if (info.role === "assistant") {
        return { providerID: info.providerID, modelID: info.modelID };
      }
    }
  }

  const cfg = await client.config.get({ query: { directory } });
  if (cfg.error || !cfg.data) return null;

  const c = cfg.data as {
    agent?: Record<string, { model?: string } | undefined>;
    mode?: { plan?: { model?: string } };
    model?: string;
    small_model?: string;
  };
  const candidates: Array<string | undefined> = [
    c.agent?.plan?.model,
    c.mode?.plan?.model,
    c.model,
    c.small_model,
  ];
  for (const m of candidates) {
    if (typeof m === "string") {
      const parsed = parseProviderModel(m);
      if (parsed) return parsed;
    }
  }
  return null;
}

function isApprove(answers: Array<Array<string>>): boolean {
  const flat = answers.flat().map((s) => s.trim().toLowerCase());
  if (flat.some((s) => s === "revise")) return false;
  return flat.some(
    (s) => s === APPROVE_LABEL.toLowerCase() || /\bapprove\b/.test(s),
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function promptWithRetry(
  client: PluginInput["client"],
  sessionID: string,
  directory: string,
  text: string,
  planPath: string,
  handoffAgent: string,
): Promise<boolean> {
  for (let attempt = 0; attempt <= PROMPT_MAX_RETRIES; attempt++) {
    try {
      const prompt = await client.session.prompt({
        path: { id: sessionID },
        query: { directory },
        body: {
          agent: handoffAgent,
          parts: [{ type: "text", text }],
        },
      });
      if (!prompt.error) {
        if (attempt > 0) {
          await client.app.log({
            query: { directory },
            body: {
              service: "plan-post-approval",
              level: "info",
              message: `session.prompt succeeded on attempt ${attempt + 1}.`,
              extra: { sessionID, planPath, handoffAgent },
            },
          });
        }
        return true;
      }

      await client.app.log({
        query: { directory },
        body: {
          service: "plan-post-approval",
          level: attempt < PROMPT_MAX_RETRIES ? "warn" : "error",
          message: `session.prompt (${handoffAgent} handoff) failed on attempt ${attempt + 1}/${PROMPT_MAX_RETRIES + 1}.`,
          extra: {
            sessionID,
            planPath,
            handoffAgent,
            detail: prompt.error,
          },
        },
      });

      if (attempt < PROMPT_MAX_RETRIES) {
        await sleep(PROMPT_BACKOFF_MS * Math.pow(2, attempt));
      }
    } catch (e) {
      await client.app.log({
        query: { directory },
        body: {
          service: "plan-post-approval",
          level: attempt < PROMPT_MAX_RETRIES ? "warn" : "error",
          message: `session.prompt (${handoffAgent} handoff) threw on attempt ${attempt + 1}/${PROMPT_MAX_RETRIES + 1}.`,
          extra: { sessionID, planPath, handoffAgent, error: String(e) },
        },
      });

      if (attempt < PROMPT_MAX_RETRIES) {
        await sleep(PROMPT_BACKOFF_MS * Math.pow(2, attempt));
      }
    }
  }
  return false;
}

const PlanPostApprovalPlugin: Plugin = async ({ client, directory }, options) => {
  return {
    event: async ({ event: raw }) => {
      const event = raw as unknown as QuestionEvent;
      if (event.type === "question.asked") {
        const props = event.properties;
        const first = props.questions[0];
        if (first?.header === PLAN_QUESTION_HEADER) {
          requestMetaById.set(props.id, {
            sessionID: props.sessionID,
            planFile: extractPlanFile(first.question),
          });
        }
        return;
      }

      if (event.type === "question.rejected") {
        const { requestID } = event.properties;
        requestMetaById.delete(requestID);
        return;
      }

      if (event.type === "question.replied") {
        const { sessionID, requestID, answers } = event.properties;
        const meta = requestMetaById.get(requestID);
        requestMetaById.delete(requestID);
        if (!meta || meta.sessionID !== sessionID) return;
        if (!isApprove(answers)) {
          try {
            await client.app.log({
              query: { directory },
              body: {
                service: "plan-post-approval",
                level: "info",
                message:
                  "Plan approval not confirmed (Revise chosen or ambiguous); skipping handoff.",
                extra: { sessionID, requestID },
              },
            });
          } catch {
            /* optional logging */
          }
          return;
        }
        const optHandoff = resolveHandoffFromOptions(options);
        const cfgOnApprove = await client.config.get({ query: { directory } });
        const cfgData = cfgOnApprove.data;
        const globalHandoff =
          optHandoff ?? resolvePlanPostApprovalHandoffAgent(cfgData);
        let routingAgent = await lastUserRoutingAgent(
          client,
          sessionID,
          directory,
        );
        if (!routingAgent && cfgData && typeof cfgData === "object" && !Array.isArray(cfgData)) {
          const d = (cfgData as Record<string, unknown>).default_agent;
          if (typeof d === "string" && d.trim()) routingAgent = d.trim();
        }
        /** Orchestrator Phase B continues in-session; queued idle prompt would duplicate automation. */
        if (
          routingAgent === "orchestrator" &&
          globalHandoff === "orchestrator"
        ) {
          try {
            await client.app.log({
              query: { directory },
              body: {
                service: "plan-post-approval",
                level: "info",
                message:
                  "Routing orchestrator + orchestrator handoff target: skipping queued session.prompt (duplicate).",
                extra: { sessionID, requestID, routingAgent, globalHandoff },
              },
            });
          } catch {
            /* optional logging */
          }
          return;
        }
        /** `plan` primary must hand off to `build`; do not reuse global orchestrator knob here. */
        const handoffTarget =
          routingAgent === "plan"
            ? DEFAULT_PLAN_HANDOFF_AGENT
            : globalHandoff;
        handoffAfterIdle.set(sessionID, {
          planFile: meta.planFile,
          answersJson: JSON.stringify(answers),
          handoffAgent: handoffTarget,
        });
        return;
      }

      if (event.type === "session.idle") {
        const { sessionID } = event.properties;
        const queued = handoffAfterIdle.get(sessionID);
        if (!queued) return;
        handoffAfterIdle.delete(sessionID);

        const planPath =
          queued.planFile ??
          "(open the latest file under .opencode/plans/ if the path is missing)";

        const handoffAgent = queued.handoffAgent;

        let compactionNote: string;
        try {
          const modelPair = await resolveModelForSummarize(
            client,
            sessionID,
            directory,
          );
          if (!modelPair) {
            compactionNote = `**Context compaction:** summarize API failed (no provider/model could be resolved for this session). Full conversation history is unchanged; run \`/compact\` manually if you need a shorter context.`;
            await client.app.log({
              query: { directory },
              body: {
                service: "plan-post-approval",
                level: "warn",
                message:
                  "session.summarize skipped: no model resolved from messages or config.",
                extra: { sessionID, planPath },
              },
            });
          } else {
            const sum = await client.session.summarize({
              path: { id: sessionID },
              query: { directory },
              body: {
                providerID: modelPair.providerID,
                modelID: modelPair.modelID,
              },
            });
            if (sum.error) {
              compactionNote = `**Context compaction:** summarize API failed (${summarizeCompactionError(sum.error)}). Full conversation history is unchanged; run \`/compact\` manually if you need a shorter context.`;
              await client.app.log({
                query: { directory },
                body: {
                  service: "plan-post-approval",
                  level: "warn",
                  message:
                    "session.summarize failed; continuing with handoff prompt.",
                  extra: {
                    sessionID,
                    planPath,
                    handoffAgent,
                    detail: sum.error,
                  },
                },
              });
            } else {
              compactionNote =
                "**Context compaction:** session summarized via API (same as manual compaction).";
            }
          }
        } catch (e) {
          compactionNote = `**Context compaction:** summarize threw (${String(e)}). Context unchanged.`;
          await client.app.log({
            query: { directory },
            body: {
              service: "plan-post-approval",
              level: "warn",
              message: "session.summarize threw; continuing with handoff prompt.",
              extra: {
                sessionID,
                planPath,
                handoffAgent,
                error: String(e),
              },
            },
          });
        }

        const text = buildApprovedPlanHandoffText({
          compactionNote,
          planPath,
          answersJson: queued.answersJson,
          handoffAgent,
        });

        const success = await promptWithRetry(
          client,
          sessionID,
          directory,
          text,
          planPath,
          handoffAgent,
        );

        if (!success) {
          await client.app.log({
            query: { directory },
            body: {
              service: "plan-post-approval",
              level: "error",
              message: `session.prompt (${handoffAgent} handoff) failed after all retries; Session may be stuck. Consider re-sending the approval or starting a new session.`,
              extra: { sessionID, planPath, handoffAgent },
            },
          });
        }
      }
    },

    "experimental.session.compacting": async (_input, output) => {
      if (!output.context) output.context = [];
      output.context.push(
        "If this session used the plan workflow, preserve paths under `.opencode/plans/`, approval choice (Approve/Revise), and any user notes from the question tool.",
      );
    },
  };
};

export { PlanPostApprovalPlugin };
export default PlanPostApprovalPlugin;