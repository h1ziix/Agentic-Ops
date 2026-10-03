import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import type { AgentMetrics } from "@/lib/validation/agent";
import { GeminiProvider, GeminiPlannerProvider } from "../agents/gemini-provider";
import { ResearchError } from "../agents/research-budget";
import { PlannerError } from "../agents/errors";
import { observeToolEvents, recordTokenUsage } from "./runtime-telemetry";
import { examplePlannerInput } from "../agents/testing/planner-fixtures";

const metrics = (): AgentMetrics => ({ durationMs: 0, retryCount: 0, taskCount: 1, inputTokens: null, outputTokens: null, totalTokens: null });

test("runtime counts missing/partial usage and keeps unknown total cost after later observed usage", () => {
  const measured = metrics(); recordTokenUsage(measured, null, "unconfigured");
  assert.equal(measured.totalTokens, null); assert.equal(measured.estimatedCostUsd, null); assert.equal(measured.usageStatus, "unknown");
  recordTokenUsage(measured, { inputTokens: 10, outputTokens: 2, totalTokens: 12 }, "unconfigured");
  assert.equal(measured.totalTokens, 12); assert.equal(measured.usageStatus, "partial"); assert.equal(measured.usageObservationCount, 2);
  assert.equal(measured.usageMissingCount, 1); assert.equal(measured.costStatus, "unknown");
  recordTokenUsage(measured, { inputTokens: 10, outputTokens: 2, totalTokens: 12, cacheWriteTokens: 10 }, "unconfigured");
  assert.equal(measured.cacheWriteTokens, 10);
});

test("tool events record one logical correlation with bounded retries and monotonic elapsed duration", async () => {
  let now = 100; const events: { type: string; data: Record<string, string | number> }[] = [];
  const record = observeToolEvents(async (type, _summary, data) => { events.push({ type, data }); }, () => now, () => "call-id");
  await record("tool_called", "Search requested", { tool_name: "tavily_search" }); now = 500;
  await record("tool_failed", "Search timed out", { provider: "tavily", error_code: "ai_timeout" });
  await record("retry", "One bounded retry", { provider: "tavily" }); now = 1100;
  await record("tool_completed", "Search evidence collected", { source_count: 2 });
  assert.equal(events[1].data.duration_ms, 400); assert.equal(events[3].data.duration_ms, 1000);
  assert.equal(events[3].data.retry_count, 1); assert.equal(events[3].data.tool_call_id, "call-id");
});

test("Gemini absent token fields stay null; optional cached/reasoning are normalized without thoughts", async (t) => {
  const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "offline-fixture";
  t.mock.method(globalThis, "fetch", async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "must-not-render" }, { text: "{}" }] } }],
    usageMetadata: { promptTokenCount: 20, cachedContentTokenCount: 5, thoughtsTokenCount: 7 } }));
  try {
    const result = await new GeminiProvider().generateStructured(z.object({}), "fixture", {}, "gemini-fixture", 1000);
    assert.equal(result.usage?.inputTokens, 20); assert.equal(result.usage?.outputTokens, null); assert.equal(result.usage?.totalTokens, null);
    assert.equal(result.usage?.cachedInputTokens, 5); assert.equal(result.usage?.reasoningTokens, 7); assert.equal(JSON.stringify(result).includes("must-not-render"), false);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});

test("malformed Gemini output and invalid finish retain observed failure usage through Planner adapter", async (t) => {
  const previous = process.env.GEMINI_API_KEY; process.env.GEMINI_API_KEY = "offline-fixture";
  t.mock.method(globalThis, "fetch", async () => Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "not valid JSON" }] } }],
    usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 37, thoughtsTokenCount: 7 } }));
  try {
    await assert.rejects(() => new GeminiPlannerProvider().generate(examplePlannerInput, "gemini-fixture", 1),
      (error: unknown) => error instanceof PlannerError && error.usage?.totalTokens === 37);
    await assert.rejects(() => new GeminiProvider().generateStructured(z.object({}), "fixture", {}, "gemini-fixture", 1000),
      (error: unknown) => error instanceof ResearchError && error.usage?.reasoningTokens === 7);
  } finally { if (previous === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = previous; }
});
