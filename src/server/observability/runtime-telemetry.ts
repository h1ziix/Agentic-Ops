import "server-only";
import { randomUUID } from "node:crypto";
import type { AgentMetrics } from "@/lib/validation/agent";
import type { RuntimeEvent } from "../agents/agent-runtime";
import type { TokenUsage } from "../agents/planner-agent";
import { estimateModelCost } from "./pricing";

/** Sum observed values only. Partial/absent provider usage never becomes a fake zero. */
export function recordTokenUsage(metrics: AgentMetrics, usage: TokenUsage | null, model: string) {
  metrics.usageObservationCount = (metrics.usageObservationCount ?? 0) + 1;
  const complete = usage !== null && usage.inputTokens !== null && usage.outputTokens !== null && usage.totalTokens !== null;
  metrics.usageMissingCount = (metrics.usageMissingCount ?? 0) + (complete ? 0 : 1);
  const add = (current: number | null | undefined, value: number | null | undefined) => value == null ? current ?? null : (current ?? 0) + value;
  metrics.inputTokens = add(metrics.inputTokens, usage?.inputTokens);
  metrics.outputTokens = add(metrics.outputTokens, usage?.outputTokens);
  metrics.totalTokens = add(metrics.totalTokens, usage?.totalTokens);
  metrics.cachedInputTokens = add(metrics.cachedInputTokens, usage?.cachedInputTokens);
  metrics.cacheWriteTokens = add(metrics.cacheWriteTokens, usage?.cacheWriteTokens);
  metrics.reasoningTokens = add(metrics.reasoningTokens, usage?.reasoningTokens);
  metrics.usageStatus = metrics.usageMissingCount ? [metrics.inputTokens, metrics.outputTokens, metrics.totalTokens].some((value) => value !== null) ? "partial" : "unknown" : "complete";
  const cost = estimateModelCost(model, usage);
  if (metrics.costStatus !== "unknown" && cost.costStatus === "estimated") {
    metrics.estimatedCostUsd = (metrics.estimatedCostUsd ?? 0) + cost.estimatedCostUsd!;
    metrics.costStatus = "estimated";
  } else {
    metrics.estimatedCostUsd = null;
    metrics.costStatus = "unknown";
  }
  metrics.pricingVersion = cost.pricingVersion;
}

/** Enrich the existing event stream with correlation/timings, retaining safe summaries. */
export function observeToolEvents(record: RuntimeEvent, now = Date.now, id: () => string = randomUUID): RuntimeEvent {
  let active: { id: string; started: number; tool: string; retries: number } | null = null;
  return async (type, summary, metadata) => {
    if (type === "tool_called") {
      active = { id: id(), started: now(), tool: String(metadata.tool_name ?? "unknown"), retries: 0 };
      await record(type, summary, { ...metadata, tool_call_id: active.id, retry_count: 0 });
      return;
    }
    if (type === "retry" && active && metadata.provider === "tavily") active.retries++;
    if ((type === "tool_completed" || type === "tool_failed") && active) {
      await record(type, summary, { ...metadata, tool_name: active.tool, tool_call_id: active.id,
        duration_ms: Math.max(0, now() - active.started), retry_count: active.retries });
      if (type === "tool_completed") active = null;
      return;
    }
    await record(type, summary, metadata);
  };
}
