import type { AgentEventRow, AgentRunRow } from "@/types/persistence";
import type { AgentRunObservation, ErrorCategory, ToolCallObservation, UsageAggregate, WorkspaceObservability, WorkflowObservability } from "@/types/observability";

export function normalizeErrorCategory(code: unknown): ErrorCategory {
  switch (code) {
    case "validation": case "ai_invalid_output": case "ai_refused": return "validation";
    case "unauthenticated": case "unauthorized": return "authorization";
    case "ai_configuration": case "integration_configuration": case "provider_auth": case "oauth_expired": return "provider_auth";
    case "rate_limit": case "ai_quota_exhausted": return "rate_limit";
    case "network": return "network";
    case "timeout": case "ai_timeout": return "timeout";
    case "provider_error": case "ai_unavailable": return "provider_error";
    case "invalid_state": case "invalid_transition": case "execution_blocked": return "invalid_state";
    case "duplicate": case "conflict": return "duplicate";
    case "unknown_execution_state": case "outcome_unknown": return "unknown_execution_state";
    default: return "internal";
  }
}

const number = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
const safeText = (value: unknown, fallback = "Not recorded"): string => typeof value === "string" && value.trim()
  ? value.replace(/[\u0000-\u001f]/g, " ").slice(0, 600) : fallback;
const object = (value: unknown): Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Only bounded summaries/allowlisted labels; no generic serialization of model input/output. */
function runSummary(value: unknown, fallback: string): string {
  const data = object(value);
  if (typeof data.summary === "string") return safeText(data.summary);
  if (typeof data.kind === "string") return `Task: ${safeText(data.kind).replaceAll("_", " ")}`;
  if (Array.isArray(data.tasks)) return `${data.tasks.length} planned tasks`;
  if (data.review && typeof data.review === "object") return `Evidence review: ${safeText(object(data.review).decision, "saved")}`;
  if (data.reviewInput) return "Validated company evidence and qualification";
  if (data.goal) return "Workflow goal, target criteria and approval constraints";
  return fallback;
}

export function observeToolCalls(events: AgentEventRow[]): ToolCallObservation[] {
  const calls = new Map<string, ToolCallObservation>();
  const active = new Map<string, string>();
  for (const event of [...events].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const data = event.metadata;
    const tool = typeof data.tool_name === "string" ? data.tool_name : null;
    const key = `${event.agent_run_id ?? "workspace"}:${tool ?? "unknown"}`;
    if (event.event_type === "tool_called" && tool) {
      const id = typeof data.tool_call_id === "string" ? data.tool_call_id : event.id;
      active.set(key, id);
      calls.set(id, { id, tool, status: "running", startedAt: event.created_at, completedAt: null,
        durationMs: null, retryCount: 0, inputSummary: safeText(event.summary), outputSummary: null, errorCategory: null, cached: false });
    } else if (["tool_completed", "tool_failed"].includes(event.event_type) && tool) {
      const id = typeof data.tool_call_id === "string" ? data.tool_call_id : active.get(key);
      const call = id ? calls.get(id) : undefined;
      if (!call) continue;
      call.status = event.event_type === "tool_completed" ? "completed" : "failed";
      call.completedAt = event.created_at;
      // Old records did not measure tools; timestamps are explicitly an elapsed estimate.
      call.durationMs = number(data.duration_ms) ?? Math.max(0, Date.parse(event.created_at) - Date.parse(call.startedAt));
      call.retryCount = number(data.retry_count) ?? call.retryCount;
      call.outputSummary = safeText(event.summary);
      call.errorCategory = call.status === "failed" ? normalizeErrorCategory(data.error_code) : null;
      call.cached = data.cached === 1 || data.cached === true;
      if (event.event_type === "tool_completed") active.delete(key);
    } else if (event.event_type === "retry" && data.provider === "tavily") {
      for (const [activeKey, id] of active) {
        if (activeKey.startsWith(`${event.agent_run_id ?? "workspace"}:`)) {
          const call = calls.get(id);
          if (call) call.retryCount++;
        }
      }
    }
  }
  return [...calls.values()];
}

export function observeAgentRun(run: AgentRunRow, events: AgentEventRow[] = []): AgentRunObservation {
  const ai = run.agent_type !== "executor" && run.model !== null;
  const error = object(run.error);
  const input = number(run.input_tokens), output = number(run.output_tokens), total = number(run.total_tokens);
  const tools = observeToolCalls(events.filter((event) => event.agent_run_id === run.id));
  return { id: run.id, workflowId: run.workflow_id, taskId: run.workflow_task_id, agent: run.agent_type,
    model: run.model, provider: ai ? run.model!.startsWith("gemini-") ? "gemini" : "openai" : null,
    modelCalls: ai ? run.usage_observation_count || (run.status === "queued" ? 0 : (run.retry_count ?? 0) + 1) : 0,
    status: run.status, startedAt: run.started_at, completedAt: run.completed_at,
    durationMs: number(run.duration_ms) ?? (run.started_at && run.completed_at ? Math.max(0, Date.parse(run.completed_at) - Date.parse(run.started_at)) : null),
    inputTokens: input, outputTokens: output, totalTokens: total, cachedInputTokens: number(run.cached_input_tokens), cacheWriteTokens: number(run.cache_write_tokens), reasoningTokens: number(run.reasoning_tokens),
    usageStatus: ai ? run.usage_status ?? (input !== null && output !== null && total !== null ? "complete" : total !== null ? "partial" : "unknown") : "not_applicable",
    estimatedCostUsd: ai && run.cost_status === "estimated" ? number(run.estimated_cost_usd) : null,
    costStatus: ai ? run.cost_status ?? "unknown" : "not_applicable", pricingVersion: run.pricing_version ?? null,
    retryCount: number(run.retry_count) ?? 0,
    errorCategory: run.error_category ?? (run.error ? normalizeErrorCategory(error.code) : null),
    errorSummary: run.error ? safeText(error.message, "Run failed; inspect its audit events") : null,
    inputSummary: runSummary(run.input, "No input summary saved"), outputSummary: runSummary(run.output, "No output summary saved"), toolCalls: tools };
}

/** Nullable sums retain the difference between unknown values and observed zero. */
export function aggregateUsage(runs: AgentRunObservation[]): UsageAggregate {
  const ai = runs.filter((run) => run.usageStatus !== "not_applicable");
  const sum = (values: (number | null)[]) => values.some((value) => value !== null) ? values.reduce<number>((total, value) => total + (value ?? 0), 0) : null;
  const costs = ai.filter((run) => run.costStatus === "estimated");
  const unknownCostCount = ai.filter((run) => run.costStatus !== "estimated" || run.estimatedCostUsd === null).length;
  const tools = runs.flatMap((run) => run.toolCalls);
  return { runCount: runs.length, modelCalls: ai.reduce((count, run) => count + run.modelCalls, 0),
    inputTokens: sum(ai.map((run) => run.inputTokens)), outputTokens: sum(ai.map((run) => run.outputTokens)), totalTokens: sum(ai.map((run) => run.totalTokens)),
    estimatedCostUsd: unknownCostCount ? null : sum(costs.map((run) => run.estimatedCostUsd)), knownEstimatedCostUsd: sum(costs.map((run) => run.estimatedCostUsd)),
    unknownCostCount, unknownUsageCount: ai.filter((run) => run.usageStatus !== "complete").length,
    retryCount: runs.reduce((total, run) => total + run.retryCount, 0), durationMs: sum(runs.map((run) => run.durationMs)),
    toolCalls: tools.length, failedToolCalls: tools.filter((tool) => tool.status === "failed").length, toolDurationMs: sum(tools.map((tool) => tool.durationMs)) };
}

export function summarizeWorkflowObservability(workflowId: string, runs: AgentRunObservation[]): WorkflowObservability {
  const related = runs.filter((run) => run.workflowId === workflowId);
  return { workflowId, ...aggregateUsage(related), agents: [...new Set(related.map((run) => run.agent))] };
}

export function buildWorkspaceObservability(rows: AgentRunRow[], events: AgentEventRow[], options: {
  now?: Date; timeZone?: string; workflowIds?: string[]; truncated?: boolean;
} = {}): WorkspaceObservability {
  const eventGroups = new Map<string, AgentEventRow[]>();
  for (const event of events) if (event.agent_run_id) { const grouped = eventGroups.get(event.agent_run_id) ?? []; grouped.push(event); eventGroups.set(event.agent_run_id, grouped); }
  const runs = rows.map((row) => observeAgentRun(row, eventGroups.get(row.id) ?? []));
  const createdAt = new Map(rows.map((row) => [row.id, row.created_at]));
  const timeZone = options.timeZone ?? "UTC";
  const day = (timestamp: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
  const today = day((options.now ?? new Date()).toISOString());
  const groups = (getKey: (run: AgentRunObservation) => string) => {
    const map = new Map<string, AgentRunObservation[]>();
    for (const run of runs) { const key = getKey(run); map.set(key, [...(map.get(key) ?? []), run]); }
    return [...map].map(([key, values]) => ({ key, usage: aggregateUsage(values) }));
  };
  const workflowIds = options.workflowIds ?? [...new Set(rows.map((run) => run.workflow_id))];
  return { runs, workflowMetrics: workflowIds.map((id) => summarizeWorkflowObservability(id, runs)),
    usageToday: aggregateUsage(runs.filter((run) => day(run.startedAt ?? createdAt.get(run.id)!) === today)),
    usage: aggregateUsage(runs), byModel: groups((run) => run.model ?? "No model"), byAgent: groups((run) => run.agent),
    byWorkflow: groups((run) => run.workflowId), byDay: groups((run) => day(run.startedAt ?? createdAt.get(run.id)!)), truncated: options.truncated ?? false };
}
