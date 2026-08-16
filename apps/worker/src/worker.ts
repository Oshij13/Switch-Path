import { createServer } from "node:http";

import { AgentOrchestrator, UuidGenerator } from "../../../packages/agent/src/orchestrator.ts";
import { OpenAIInterventionComparator } from "../../../packages/agent/src/openai-intervention-comparator.ts";
import {
  DEFAULT_AGENT_MODEL,
  OpenAIResearchPlanner,
} from "../../../packages/agent/src/openai-planner.ts";
import { createLiveResearchExecutor } from "../../../packages/agent/src/live-research-runtime.ts";
import { createSupabaseAgentRepositoryFromEnv } from "../../../packages/database/src/supabase-agent-repository.ts";

const port = Number(process.env.PORT ?? "10000");
const host = "0.0.0.0";
createServer((_, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", role: "worker" }));
}).listen(port, host, () => {
  console.log(`[worker] Health check listener listening on http://${host}:${port}`);
});

const pollIntervalMs = positiveInteger(process.env.SWITCHPATH_WORKER_POLL_MS, 1_000);
const workspaceId = process.env.SWITCHPATH_DEMO_WORKSPACE_ID?.trim() || "00000000-0000-4000-8000-000000000001";
const processAllWorkspaces = process.env.SWITCHPATH_MULTI_USER !== "false";
const apiKey = requiredEnv("OPENAI_API_KEY");
const model = process.env.SWITCHPATH_AGENT_MODEL?.trim() || DEFAULT_AGENT_MODEL;
const reasoningEffort = parseReasoningEffort(process.env.SWITCHPATH_REASONING_EFFORT);
const repository = createSupabaseAgentRepositoryFromEnv();
const orchestrator = new AgentOrchestrator({
  repository,
  planner: new OpenAIResearchPlanner({ apiKey, model, reasoningEffort }),
  executor: createLiveResearchExecutor({ apiKey, model, reasoningEffort }),
  comparator: new OpenAIInterventionComparator({ apiKey, model, reasoningEffort }),
  ids: new UuidGenerator(),
});

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    console.log(`[worker] ${signal} received; stopping after the current safe checkpoint`);
  });
}

await repository.recoverWorkerState();
console.log(`[worker] Switchpath worker started for ${processAllWorkspaces ? "all workspaces" : `workspace ${workspaceId}`}`);

while (!stopping) {
  try {
    const run = await repository.getNextWorkerRun(processAllWorkspaces ? undefined : workspaceId);
    if (!run) {
      await delay(pollIntervalMs);
      continue;
    }

    const outcome = await orchestrator.tick(run.id);
    if (outcome !== "progressed") {
      await delay(pollIntervalMs);
    }
  } catch (error) {
    console.error(`[worker] ${errorMessage(error)}`);
    await delay(pollIntervalMs);
  }
}

console.log("[worker] Switchpath local worker stopped");

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseReasoningEffort(
  value: string | undefined,
): "low" | "medium" | "high" {
  if (!value) return "medium";
  if (value === "low" || value === "medium" || value === "high") return value;
  throw new Error("SWITCHPATH_REASONING_EFFORT must be low, medium, or high");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("SWITCHPATH_WORKER_POLL_MS must be a positive integer");
  }
  return parsed;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
