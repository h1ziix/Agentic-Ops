import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { plannerOutputSchema, type PlannerInput } from "@/lib/validation/planner";
import { PLANNER_MAX_OUTPUT_TOKENS, PLANNER_TIMEOUT_MS } from "./config";
import { PlannerError } from "./errors";
import type { PlannerProvider, PlannerProviderResult, TokenUsage } from "./planner-agent";
import { PLANNER_SYSTEM_PROMPT } from "./planner-prompt";

export class OpenAIPlannerProvider implements PlannerProvider {
  // Injection allows SDK transport tests without a paid request or real API key.
  constructor(private readonly client?: OpenAI) {}

  async generate(input: PlannerInput, model: string, attempt: number): Promise<PlannerProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!this.client && !apiKey) throw new PlannerError("ai_configuration", false);
    const client = this.client ?? new OpenAI({ apiKey, maxRetries: 0, timeout: PLANNER_TIMEOUT_MS });
    try {
      const response = await client.responses.parse({
        model,
        instructions: PLANNER_SYSTEM_PROMPT,
        input: JSON.stringify({ ...input, validationRetry: attempt > 1 }),
        text: { format: zodTextFormat(plannerOutputSchema, "workflow_plan") },
        max_output_tokens: PLANNER_MAX_OUTPUT_TOKENS,
        store: false,
      }, { timeout: PLANNER_TIMEOUT_MS, maxRetries: 0 });
      const usage: TokenUsage | null = response.usage ? { inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens, totalTokens: response.usage.total_tokens,
        cachedInputTokens: response.usage.input_tokens_details?.cached_tokens ?? null,
        cacheWriteTokens: response.usage.input_tokens_details?.cache_write_tokens ?? null,
        reasoningTokens: response.usage.output_tokens_details?.reasoning_tokens ?? null, reasoningIncludedInOutput: true } : null;
      if (response.output.some((item) => item.type === "message" && item.content.some((content) => content.type === "refusal"))) {
        throw new PlannerError("ai_refused", false, usage);
      }
      if (response.status !== "completed" || !response.output_parsed) throw new PlannerError("ai_invalid_output", true, usage);
      return {
        output: response.output_parsed,
        usage,
      };
    } catch (error) {
      if (error instanceof PlannerError) throw error;
      // Only bounded diagnostic fields; never log provider messages, bodies or headers.
      const quotaCodes = ["insufficient_quota", "credit_balance_exhausted", "organization_spend_limit_exceeded", "project_spend_limit_exceeded", "organization_usage_limit_exceeded"];
      const knownCodes = [...quotaCodes, "rate_limit_exceeded", "invalid_api_key", "model_not_found", "unsupported_parameter"];
      console.warn("Planner provider request failed", {
        status: error instanceof OpenAI.APIError ? error.status : undefined,
        code: error instanceof OpenAI.APIError && knownCodes.includes(error.code ?? "") ? error.code : "unknown",
        timeout: error instanceof OpenAI.APIConnectionTimeoutError,
      });
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new PlannerError("ai_timeout", true);
      if (error instanceof z.ZodError || error instanceof SyntaxError) throw new PlannerError("ai_invalid_output", true);
      if (error instanceof OpenAI.APIError && (error.type === "insufficient_quota" || quotaCodes.includes(error.code ?? ""))) throw new PlannerError("ai_quota_exhausted", false);
      if (error instanceof OpenAI.APIConnectionError || (error instanceof OpenAI.APIError && (error.status === 429 || (error.status ?? 0) >= 500))) throw new PlannerError("ai_unavailable", true);
      if (error instanceof OpenAI.APIError && [400, 401, 403, 404].includes(error.status ?? 0)) throw new PlannerError("ai_configuration", false);
      throw new PlannerError("ai_unavailable", false);
    }
  }
}
