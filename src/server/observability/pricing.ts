import "server-only";
import { serverEnvironment } from "../config/env";
import { z } from "zod";
import type { TokenUsage } from "../agents/planner-agent";

const priceSchema = z.object({
  inputUsdPerMillion: z.number().finite().nonnegative(),
  outputUsdPerMillion: z.number().finite().nonnegative(),
  cachedInputUsdPerMillion: z.number().finite().nonnegative().optional(),
  cacheWriteUsdPerMillion: z.number().finite().nonnegative().optional(),
  // Reasoning tokens are a subset of output tokens for OpenAI, and additional for Gemini.
  reasoningUsdPerMillion: z.number().finite().nonnegative().optional(),
  version: z.string().trim().min(1).max(100),
}).strict();
export type ModelPrice = z.infer<typeof priceSchema>;
export type ModelPricing = Record<string, ModelPrice>;

/** No default prices: the operator must configure a dated, verified provider rate. */
export function parseModelPricing(raw: string | undefined): ModelPricing {
  if (!raw?.trim()) return {};
  try {
    const result = z.record(z.string().min(1).max(200), priceSchema).safeParse(JSON.parse(raw));
    return result.success ? result.data : {};
  } catch { return {}; }
}

export function estimateModelCost(model: string, usage: TokenUsage | null, pricing = parseModelPricing(serverEnvironment().AI_MODEL_PRICING_JSON)) {
  const price = pricing[model];
  if (!price || !usage || usage.inputTokens === null || usage.outputTokens === null || usage.totalTokens === null) {
    return { estimatedCostUsd: null, costStatus: "unknown" as const, pricingVersion: price?.version ?? null };
  }
  const cached = usage.cachedInputTokens ?? 0;
  const reasoning = usage.reasoningTokens ?? 0;
  const writes = usage.cacheWriteTokens ?? 0;
  if (cached + writes > usage.inputTokens || (usage.reasoningIncludedInOutput && reasoning > usage.outputTokens)
    || (cached > 0 && price.cachedInputUsdPerMillion === undefined)
    || (writes > 0 && price.cacheWriteUsdPerMillion === undefined)
    || usage.totalTokens !== usage.inputTokens + usage.outputTokens + (usage.reasoningIncludedInOutput ? 0 : reasoning)
    || (reasoning > 0 && !usage.reasoningIncludedInOutput && price.reasoningUsdPerMillion === undefined)) {
    return { estimatedCostUsd: null, costStatus: "unknown" as const, pricingVersion: price.version };
  }
  const amount = ((usage.inputTokens - cached - writes) * price.inputUsdPerMillion
    + cached * (price.cachedInputUsdPerMillion ?? 0)
    + usage.outputTokens * price.outputUsdPerMillion
    + writes * (price.cacheWriteUsdPerMillion ?? 0)
    + (usage.reasoningIncludedInOutput ? 0 : reasoning * (price.reasoningUsdPerMillion ?? 0))) / 1_000_000;
  return { estimatedCostUsd: amount, costStatus: "estimated" as const, pricingVersion: price.version };
}
