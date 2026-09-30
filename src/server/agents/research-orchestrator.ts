import { createHash, randomUUID } from "node:crypto";
import type { AgentMetrics } from "@/lib/validation/agent";
import { researchInputSchema, researchOutputSchema, type ResearchInput } from "@/lib/validation/research";
import type { AgentRunService } from "../services/agent-run-service";
import type { EventService } from "../services/event-service";
import { AppError } from "../errors";
import type { AgentRuntime } from "./agent-runtime";

export class ResearchOrchestrator {
  constructor(private readonly runs: AgentRunService, private readonly events: EventService, private readonly runtime: AgentRuntime) {}

  async researchCompany(context: { userId: string; workspaceId: string; workflowId: string; companyId?: string }, input: ResearchInput, model: string) {
    const valid = researchInputSchema.parse(input);
    const requestKey = createHash("sha256").update(JSON.stringify({ input: valid, companyId: context.companyId ?? null, model, version: 1 })).digest("hex");
    const runId = randomUUID();
    const run = await this.runs.start({ ...context, runId, agentType: "researcher", model,
      input: { ...valid, companyId: context.companyId ?? null, requestKey } });
    if (run.id !== runId) {
      if (run.status === "completed") researchOutputSchema.parse(run.output);
      return { status: run.status === "completed" ? "awaiting_approval" as const : "in_progress" as const, runId: run.id };
    }
    const started = Date.now();
    const metrics: AgentMetrics = { durationMs: 0, retryCount: 0, taskCount: 0, inputTokens: null, outputTokens: null, totalTokens: null };
    try {
      const output = await this.runtime.research(valid, model, async (eventType, summary, metadata) => {
        await this.events.record({ workspaceId: context.workspaceId, workflowId: context.workflowId, agentRunId: run.id, eventType, summary, metadata });
      }, metrics);
      metrics.durationMs = Date.now() - started;
      const completed = await this.runs.complete({ runId: run.id, status: "completed", output, metrics });
      if (completed.status !== "completed") throw new AppError("invalid_transition", "Research was interrupted by a workflow status change.");
      return { status: "awaiting_approval" as const, runId: run.id };
    } catch (error) {
      metrics.durationMs = Date.now() - started;
      const safe = error instanceof AppError ? { code: error.code, message: error.message } : { code: "ai_unavailable", message: "Research failed before approval. Please retry later." };
      await this.runs.complete({ runId: run.id, status: "failed", error: safe, metrics });
      throw new AppError(error instanceof AppError ? error.code : "ai_unavailable", safe.message);
    }
  }
}
