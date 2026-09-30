import { AppError } from "../errors";
import type { TokenUsage } from "./planner-agent";

export type PlannerErrorCode = "ai_configuration" | "ai_quota_exhausted" | "ai_unavailable" | "ai_timeout" | "ai_invalid_output" | "ai_refused";
const messages: Record<PlannerErrorCode, string> = {
  ai_configuration: "Planning is unavailable. Ask your workspace administrator to configure the server's OpenAI API key and model access, then retry planning.",
  ai_quota_exhausted: "The planning provider's API credit or spending limit has been reached. Ask your workspace administrator to check OpenAI API billing, then retry planning. No tasks were saved.",
  ai_unavailable: "The planning provider is temporarily unavailable. Please retry planning.",
  ai_timeout: "Planning timed out before a valid plan was saved. Please retry planning.",
  ai_invalid_output: "The Planner could not produce a valid execution plan. No tasks were saved. Please retry planning.",
  ai_refused: "The Planner could not process this goal. Create a workflow with a sales research goal that can be reviewed safely.",
};

export class PlannerError extends AppError {
  constructor(code: PlannerErrorCode, public readonly retryable: boolean, public readonly usage: TokenUsage | null = null) {
    super(code, messages[code]);
    this.name = "PlannerError";
  }
}

export function safePlanningError(error: unknown): { code: string; message: string } {
  if (error instanceof PlannerError) return { code: error.code, message: error.message };
  if (error instanceof AppError) return { code: error.code, message: error.message };
  return { code: "ai_unavailable", message: messages.ai_unavailable };
}
