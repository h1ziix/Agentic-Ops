import type { z } from "zod";
import { composeOutreach, outreachCompositionSchema, reviewerOutputSchema, validateReviewerOutput,
  type ReviewerInput, type ReviewerOutput, type verifiedRecipientSchema } from "@/lib/validation/outreach";
import type { AgentMetrics } from "@/lib/validation/agent";
import type { TokenUsage } from "./planner-agent";
import type { RuntimeEvent } from "./agent-runtime";
import { ResearchError } from "./research-budget";
import { AppError } from "../errors";
import { REVIEWER_SYSTEM_PROMPT } from "./reviewer-prompt";
import { OUTREACH_SYSTEM_PROMPT } from "./outreach-prompt";
import { recordTokenUsage } from "../observability/runtime-telemetry";

export interface StructuredPreparationProvider {
  generateStructured(schema: z.ZodType, system: string, input: unknown, model: string, timeoutMs: number):
    Promise<{ output: unknown; usage: TokenUsage | null }>;
}
class PreparationValidationError extends AppError {
  constructor(readonly usage: TokenUsage | null) {
    super("ai_invalid_output", "Preparation failed evidence validation. Other successful drafts are retained.");
  }
}
export class ReviewerAgent {
  constructor(private readonly provider: StructuredPreparationProvider) {}
  async review(input: ReviewerInput, model: string) {
    const result = await this.provider.generateStructured(reviewerOutputSchema, REVIEWER_SYSTEM_PROMPT, input, model, 50_000);
    try { return { output: validateReviewerOutput(result.output, input), usage: result.usage }; }
    catch { throw new PreparationValidationError(result.usage); }
  }
}
export class OutreachAgent {
  constructor(private readonly provider: StructuredPreparationProvider) {}
  async draft(input: ReviewerInput, review: ReviewerOutput, recipient: z.infer<typeof verifiedRecipientSchema>, model: string) {
    const result = await this.provider.generateStructured(outreachCompositionSchema, OUTREACH_SYSTEM_PROMPT,
      { goal: input.goal, companyName: input.company.name, reviewer: review, recipient }, model, 50_000);
    try { return { output: composeOutreach(result.output, input, review, recipient), usage: result.usage }; }
    catch { throw new PreparationValidationError(result.usage); }
  }
  async followup(input: ReviewerInput, review: ReviewerOutput, recipient: z.infer<typeof verifiedRecipientSchema>, model: string,
    context: { previousSubject: string; previousBody: string; sentAt: string; daysElapsed: number; replyStatus: "none_detected" | "unavailable" }) {
    const result = await this.provider.generateStructured(outreachCompositionSchema, OUTREACH_SYSTEM_PROMPT,
      { goal: input.goal, companyName: input.company.name, reviewer: review, recipient, followup: context,
        instruction: `Prepare a follow-up using accepted evidence. ${context.replyStatus === "unavailable" ? "Reply monitoring is unavailable; response status is unknown. Do not imply that the inbox was checked." : "No response has been detected."} Do not invent a reply, infer intent, or claim that the prospect ignored us.` }, model, 50_000);
    try {
      const draft = composeOutreach(result.output, input, review, recipient);
      return { output: { ...draft, subject: `Following up: ${context.previousSubject}`.slice(0, 200),
        body: draft.body.replace(/\n\nYour public materials/, "\n\nFollowing up on my previous message.\n\nYour public materials"),
        generationSummary: `Follow-up prepared ${context.daysElapsed} days after the previous message; fresh human approval required.` }, usage: result.usage };
    } catch { throw new PreparationValidationError(result.usage); }
  }
}

/** Shared bounded AgentRuntime policy; validation failures never trigger endless regeneration. */
export async function runPreparation<T>(operation: () => Promise<{ output: T; usage: TokenUsage | null }>,
  record: RuntimeEvent, metrics: AgentMetrics, wait: (ms: number) => Promise<void>, model: string): Promise<T> {
  const addUsage = (usage: TokenUsage | null) => {
    recordTokenUsage(metrics, usage, model);
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    await record("model_request_started", "Requested evidence-grounded structured preparation", { model, attempt });
    try {
      const result = await operation();
      addUsage(result.usage);
      return result.output;
    } catch (error) {
      if (error instanceof PreparationValidationError) addUsage(error.usage);
      else if (error instanceof ResearchError) addUsage(error.usage);
      if (!(error instanceof ResearchError) || !error.retryable || attempt === 2 || error.retryAfterMs > 10_000) throw error;
      metrics.retryCount = 1;
      await record("retry", "Retrying preparation after a transient model failure", { attempt: 2, error_code: error.code });
      await wait(error.retryAfterMs);
    }
  }
  throw new Error("Preparation retry budget exhausted");
}
