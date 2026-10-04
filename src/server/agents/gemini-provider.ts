import "server-only";
import { serverEnvironment } from "../config/env";
import { z } from "zod";
import type { TokenUsage, PlannerProvider } from "./planner-agent";
import { plannerOutputSchema, type PlannerInput } from "@/lib/validation/planner";
import { researchAnalysisSchema, targetProfileSchema, discoveryOutputSchema, type WorkflowResearchInput, type TargetProfile, type ResearchInput, type ResearchSource } from "@/lib/validation/research";
import { providerJson } from "./provider-http";
import { RESEARCH_LIMITS, ResearchError } from "./research-budget";
import { PLANNER_SYSTEM_PROMPT } from "./planner-prompt";
import { PlannerError } from "./errors";
import { RESEARCH_SYSTEM_PROMPT, TARGET_PROFILE_PROMPT, DISCOVERY_PROMPT, WEBSITE_RESOLUTION_PROMPT } from "./research-prompt";

const responseSchema = z.object({
  candidates: z.array(z.object({ finishReason: z.string().optional(), content: z.object({ parts: z.array(z.object({ text: z.string().optional(), thought: z.boolean().optional() })) }).optional() })).optional(),
  usageMetadata: z.object({ promptTokenCount: z.number().int().nonnegative().optional(), candidatesTokenCount: z.number().int().nonnegative().optional(), totalTokenCount: z.number().int().nonnegative().optional(),
    cachedContentTokenCount: z.number().int().nonnegative().optional(), thoughtsTokenCount: z.number().int().nonnegative().optional() }).optional(),
});

export const researchValidationReasons = ["Unsupported evidence citation", "Unknown evidence source", "Score components must sum to the score", "Unsupported employee estimate", "Invalid structured assessment"] as const;
export interface ResearchAnalysisFeedback { validationReason: typeof researchValidationReasons[number] }
export interface AnalysisProvider {
  analyze(input: ResearchInput, sources: ResearchSource[], model: string, timeoutMs: number, feedback?: ResearchAnalysisFeedback): Promise<{ output: unknown; usage: TokenUsage | null }>;
}
export interface ResearchPlanningProvider {
  profile(input: WorkflowResearchInput, model: string, timeoutMs: number): Promise<{ output: unknown; usage: TokenUsage | null }>;
  discover(input: WorkflowResearchInput, profile: TargetProfile, sources: ResearchSource[], model: string, timeoutMs: number): Promise<{ output: unknown; usage: TokenUsage | null }>;
  resolve(input: ResearchInput, sources: ResearchSource[], model: string, timeoutMs: number): Promise<{ output: unknown; usage: TokenUsage | null }>;
}

export class GeminiProvider implements AnalysisProvider, ResearchPlanningProvider {
  async generateStructured(schema: z.ZodType, system: string, input: unknown, model: string, timeoutMs: number) {
    const key = serverEnvironment().GEMINI_API_KEY?.trim();
    if (!key || !/^gemini-[a-z0-9.-]+$/.test(model)) throw new ResearchError("ai_configuration", "gemini");
    const response = await providerJson("gemini", `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(schema),
          temperature: 0.2, maxOutputTokens: RESEARCH_LIMITS.outputTokens,
          thinkingConfig: model.startsWith("gemini-3") ? { thinkingLevel: "low" } : { thinkingBudget: 1024 }, }, }),
    }, Math.min(timeoutMs, 50_000));
    const parsed = responseSchema.safeParse(response);
    const candidate = parsed.success ? parsed.data.candidates?.[0] : undefined;
    const observed = parsed.success ? parsed.data.usageMetadata : undefined;
    const usage: TokenUsage | null = observed ? { inputTokens: observed.promptTokenCount ?? null,
      outputTokens: observed.candidatesTokenCount ?? null, totalTokens: observed.totalTokenCount ?? null,
      cachedInputTokens: observed.cachedContentTokenCount ?? null, reasoningTokens: observed.thoughtsTokenCount ?? null,
      reasoningIncludedInOutput: false } : null;
    if (!parsed.success || candidate?.finishReason !== "STOP") throw new ResearchError("ai_invalid_output", "gemini", false, 1000, undefined, usage);
    const text = candidate.content?.parts.filter((part) => !part.thought).map((part) => part.text ?? "").join("");
    try {
      return { output: JSON.parse(text || "") as unknown, usage };
    } catch { throw new ResearchError("ai_invalid_output", "gemini", false, 1000, undefined, usage); }
  }

  analyze(input: ResearchInput, sources: ResearchSource[], model: string, timeoutMs: number, feedback?: ResearchAnalysisFeedback) {
    return this.generateStructured(researchAnalysisSchema, RESEARCH_SYSTEM_PROMPT, { ...input, evidence: sources, ...(feedback ? { validationFeedback: feedback } : {}) }, model, timeoutMs);
  }
  profile(input: WorkflowResearchInput, model: string, timeoutMs: number) {
    return this.generateStructured(targetProfileSchema, TARGET_PROFILE_PROMPT, input, model, timeoutMs);
  }
  discover(input: WorkflowResearchInput, profile: TargetProfile, sources: ResearchSource[], model: string, timeoutMs: number) {
    return this.generateStructured(discoveryOutputSchema, DISCOVERY_PROMPT, { ...input, profile, evidence: sources }, model, timeoutMs);
  }
  resolve(input: ResearchInput, sources: ResearchSource[], model: string, timeoutMs: number) {
    return this.generateStructured(discoveryOutputSchema, WEBSITE_RESOLUTION_PROMPT, { name: input.name, location: input.location ?? null, evidence: sources }, model, timeoutMs);
  }
}

export class GeminiPlannerProvider implements PlannerProvider {
  async generate(input: PlannerInput, model: string, attempt: number) {
    try { return await new GeminiProvider().generateStructured(plannerOutputSchema, PLANNER_SYSTEM_PROMPT, { ...input, validationRetry: attempt > 1 }, model, 50_000); }
    catch (error) {
      if (error instanceof ResearchError) throw new PlannerError(error.code === "validation" ? "ai_invalid_output" : error.code, error.retryable, error.usage);
      throw new PlannerError("ai_unavailable", false);
    }
  }
}
