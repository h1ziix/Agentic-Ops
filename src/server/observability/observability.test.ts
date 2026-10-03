import assert from "node:assert/strict";
import test from "node:test";
import { aggregateUsage, buildWorkspaceObservability, normalizeErrorCategory, observeAgentRun, observeToolCalls } from "@/lib/observability";
import type { AgentRunRow, AgentEventRow } from "@/types/persistence";
import { estimateModelCost, parseModelPricing } from "./pricing";

const pricing = parseModelPricing(JSON.stringify({ "fixture-model": { inputUsdPerMillion: 2, outputUsdPerMillion: 8, cachedInputUsdPerMillion: 1, reasoningUsdPerMillion: 8, version: "test-only-rates" } }));
const row = (extra: Partial<AgentRunRow> = {}): AgentRunRow => ({ id: "run", workspace_id: "workspace", workflow_id: "workflow", workflow_task_id: null,
  agent_type: "planner", status: "completed", model: "fixture-model", input: { goal: "Read evidence", secret: "must-not-render", reasoning: "private-thought" },
  output: { summary: "Generated a validated plan", hiddenReasoning: "must-not-render" }, error: null,
  started_at: "2026-10-01T20:00:00Z", completed_at: "2026-10-01T20:00:01Z", created_at: "2026-10-01T20:00:00Z",
  duration_ms: 1000, retry_count: 0, input_tokens: 100, output_tokens: 50, total_tokens: 150, usage_status: "complete",
  estimated_cost_usd: 0.0006, cost_status: "estimated", ...extra });
const event = (type: AgentEventRow["event_type"], seconds: number, metadata: Record<string, unknown> = {}): AgentEventRow => ({ id: `${type}-${seconds}`,
  workspace_id: "workspace", workflow_id: "workflow", agent_run_id: "run", workflow_task_id: null, event_type: type, summary: "Bounded safe summary",
  metadata, created_at: `2026-10-01T20:00:0${seconds}Z` });

test("cost uses operator configured rates, distinguishes cached/reasoning conventions, and labels estimates", () => {
  const usage = { inputTokens: 1000, outputTokens: 200, totalTokens: 1200, cachedInputTokens: 500, reasoningTokens: 100, reasoningIncludedInOutput: true };
  const cost = estimateModelCost("fixture-model", usage, pricing);
  assert.equal(cost.costStatus, "estimated"); assert.equal(cost.estimatedCostUsd, 0.0031); assert.equal(cost.pricingVersion, "test-only-rates");
  assert.equal(estimateModelCost("fixture-model", { ...usage, totalTokens: 1300, reasoningIncludedInOutput: false }, pricing).estimatedCostUsd, 0.0039);
});

test("unknown model, incomplete usage and invalid pricing produce unknown cost rather than zero", () => {
  for (const cost of [estimateModelCost("unconfigured", { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, pricing),
    estimateModelCost("fixture-model", null, pricing), estimateModelCost("fixture-model", { inputTokens: 100, outputTokens: null, totalTokens: null }, pricing),
    estimateModelCost("fixture-model", { inputTokens: 10, outputTokens: 1, totalTokens: 11, cachedInputTokens: 20 }, pricing)]) {
    assert.equal(cost.estimatedCostUsd, null); assert.equal(cost.costStatus, "unknown");
  }
  assert.deepEqual(parseModelPricing("invalid-json"), {});
  assert.deepEqual(parseModelPricing('{"model":{"inputUsdPerMillion":-1}}'), {});
  const knownZero = estimateModelCost("fixture-model", { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, pricing);
  assert.equal(knownZero.estimatedCostUsd, 0); assert.equal(knownZero.costStatus, "estimated");
});

test("observed cache writes require a configured rate; accounting mismatches remain unknown", () => {
  const usage = { inputTokens: 1000, outputTokens: 200, totalTokens: 1200, cacheWriteTokens: 1000, reasoningIncludedInOutput: true };
  assert.equal(estimateModelCost("fixture-model", usage, pricing).estimatedCostUsd, null);
  const priced = { "fixture-model": { ...pricing["fixture-model"], cacheWriteUsdPerMillion: 0.5 } };
  assert.equal(estimateModelCost("fixture-model", usage, priced).estimatedCostUsd, 0.0021);
  assert.equal(estimateModelCost("fixture-model", { ...usage, totalTokens: 1230 }, priced).costStatus, "unknown");
  const observed = observeAgentRun(row({ cache_write_tokens: 1000 }));
  assert.equal(observed.cacheWriteTokens, 1000);
});

test("run summaries allowlist safe fields and deterministic Executor has no AI usage/cost", () => {
  const run = observeAgentRun(row());
  assert.ok(!JSON.stringify(run).includes("must-not-render")); assert.ok(!JSON.stringify(run).includes("private-thought"));
  const executor = observeAgentRun(row({ agent_type: "executor", model: null, input_tokens: null, output_tokens: null, total_tokens: null, estimated_cost_usd: null }));
  assert.equal(executor.usageStatus, "not_applicable"); assert.equal(executor.costStatus, "not_applicable"); assert.equal(executor.estimatedCostUsd, null);
});

test("aggregation retains observed partial totals and never presents incomplete costs as a total", () => {
  const known = observeAgentRun(row());
  const unknown = observeAgentRun(row({ id: "unknown", input_tokens: null, output_tokens: null, total_tokens: null,
    estimated_cost_usd: null, cost_status: "unknown", usage_status: "unknown" }));
  const aggregate = aggregateUsage([known, unknown]);
  assert.equal(aggregate.totalTokens, 150); assert.equal(aggregate.unknownUsageCount, 1);
  assert.equal(aggregate.estimatedCostUsd, null); assert.equal(aggregate.knownEstimatedCostUsd, 0.0006); assert.equal(aggregate.unknownCostCount, 1);
  assert.equal(aggregateUsage([unknown]).totalTokens, null); assert.equal(aggregateUsage([]).totalTokens, null);
});

test("workspace usage groups by workflow, model, agent and local day with bounded trace data", () => {
  const rows = [row(), row({ id: "run2", workflow_id: "workflow2", model: "other-model", agent_type: "researcher", started_at: "2026-10-01T18:30:00Z", total_tokens: 75 })];
  const data = buildWorkspaceObservability(rows, [], { now: new Date("2026-10-02T01:00:00Z"), timeZone: "Asia/Qyzylorda", truncated: true });
  assert.equal(data.usage.totalTokens, 225); assert.equal(data.usageToday.totalTokens, 150);
  assert.deepEqual(data.byModel.map((group) => group.key), ["fixture-model", "other-model"]);
  assert.deepEqual(data.byAgent.map((group) => group.key), ["planner", "researcher"]);
  assert.deepEqual(data.byWorkflow.map((group) => group.key), ["workflow", "workflow2"]);
  assert.equal(data.byDay.length, 2); assert.equal(data.workflowMetrics[0].durationMs, 1000); assert.equal(data.truncated, true);
});

test("tool correlation preserves retries, measured duration, cache and final status; legacy records stay inspectable", () => {
  const trace = [event("tool_called", 1, { tool_name: "tavily_search", tool_call_id: "call" }),
    event("tool_failed", 2, { tool_name: "tavily_search", tool_call_id: "call", duration_ms: 400, error_code: "ai_timeout" }),
    event("retry", 3, { provider: "tavily" }),
    event("tool_completed", 4, { tool_name: "tavily_search", tool_call_id: "call", duration_ms: 1750, retry_count: 1, cached: 0 })];
  const [call] = observeToolCalls(trace);
  assert.equal(call.status, "completed"); assert.equal(call.retryCount, 1); assert.equal(call.durationMs, 1750); assert.equal(call.errorCategory, null);
  const observed = observeAgentRun(row(), trace); const usage = aggregateUsage([observed]);
  assert.equal(usage.toolCalls, 1); assert.equal(usage.failedToolCalls, 0); assert.equal(usage.toolDurationMs, 1750);
  const [oldCall] = observeToolCalls([event("tool_called", 1, { tool_name: "search" }), event("tool_completed", 3, { tool_name: "search", cached: 1 })]);
  assert.equal(oldCall.durationMs, 2000); assert.equal(oldCall.cached, true);
  assert.equal(normalizeErrorCategory("ai_timeout"), "timeout"); assert.equal(normalizeErrorCategory("outcome_unknown"), "unknown_execution_state");
});
