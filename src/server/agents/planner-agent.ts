import { plannerInputSchema, validatedPlannerOutputSchema, type PlannerInput, type PlannerOutput } from "@/lib/validation/planner";
import { PlannerError } from "./errors";

export interface TokenUsage {
  inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  cachedInputTokens?: number | null; cacheWriteTokens?: number | null; reasoningTokens?: number | null; reasoningIncludedInOutput?: boolean;
}
export interface PlannerProviderResult { output: unknown; usage: TokenUsage | null }
export interface PlannerProvider {
  generate(input: PlannerInput, model: string, attempt: number): Promise<PlannerProviderResult>;
}

/** Pure agent: it owns the output contract and has no database or workflow access. */
export class PlannerAgent {
  constructor(private readonly provider: PlannerProvider) {}

  async plan(input: PlannerInput, model: string, attempt: number): Promise<{ plan: PlannerOutput; usage: TokenUsage | null }> {
    const result = await this.provider.generate(plannerInputSchema.parse(input), model, attempt);
    const parsed = validatedPlannerOutputSchema.safeParse(result.output);
    if (!parsed.success) throw new PlannerError("ai_invalid_output", true, result.usage);
    return { plan: parsed.data, usage: result.usage };
  }
}
