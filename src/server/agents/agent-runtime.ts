import type { AgentMetrics } from "@/lib/validation/agent";
import type { PlannerInput, PlannerOutput } from "@/lib/validation/planner";
import type { AgentEventType } from "@/types/persistence";
import { PLANNER_MAX_ATTEMPTS } from "./config";
import { PlannerError } from "./errors";
import { PlannerAgent } from "./planner-agent";
import type { TokenUsage } from "./planner-agent";
import type { ResearchAgent } from "./research-agent";
import type { ResearchInput } from "@/lib/validation/research";

export type RuntimeEvent = (type: AgentEventType, summary: string, metadata: Record<string, string | number>) => Promise<void>;

/** One bounded execution policy shared by future typed agents, without a generic framework. */
export class AgentRuntime {
  constructor(private readonly planner: PlannerAgent | null, private readonly wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    private readonly researcher?: ResearchAgent) {}

  research(input: ResearchInput, model: string, record: RuntimeEvent, metrics: AgentMetrics) {
    if (!this.researcher) throw new PlannerError("ai_configuration", false);
    return this.researcher.research(input, model, record, metrics);
  }

  async plan(input: PlannerInput, model: string, record: RuntimeEvent, metrics: AgentMetrics): Promise<PlannerOutput> {
    if (!this.planner) throw new PlannerError("ai_configuration", false);
    const measure = (usage: TokenUsage | null) => {
      if (!usage) return;
      metrics.inputTokens = (metrics.inputTokens ?? 0) + usage.inputTokens;
      metrics.outputTokens = (metrics.outputTokens ?? 0) + usage.outputTokens;
      metrics.totalTokens = (metrics.totalTokens ?? 0) + usage.totalTokens;
    };
    for (let attempt = 1; attempt <= PLANNER_MAX_ATTEMPTS; attempt++) {
      metrics.retryCount = attempt - 1;
      await record("model_request_started", "Planner requested a structured execution plan", { model, attempt });
      try {
        const result = await this.planner.plan(input, model, attempt);
        measure(result.usage);
        metrics.taskCount = result.plan.tasks.length;
        return result.plan;
      } catch (error) {
        if (error instanceof PlannerError) measure(error.usage);
        if (error instanceof PlannerError && error.code === "ai_invalid_output") {
          await record("plan_validation_failed", "Planner output failed validation; no tasks were saved", { attempt });
        }
        if (!(error instanceof PlannerError) || !error.retryable || attempt === PLANNER_MAX_ATTEMPTS) throw error;
        await record("retry", "Retrying Planner after a recoverable planning error", { attempt: attempt + 1, error_code: error.code });
        await this.wait(1_000 * attempt);
      }
    }
    throw new PlannerError("ai_unavailable", false);
  }
}
