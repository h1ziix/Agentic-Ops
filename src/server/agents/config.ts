import { getAIProvider, serverEnvironment } from "../config/env";

// The SDK's own retries are disabled; AgentRuntime owns the bounded retry policy.
export const DEFAULT_PLANNER_MODEL = "gpt-4.1-mini";
export const PLANNER_MAX_ATTEMPTS = 2;
export const PLANNER_TIMEOUT_MS = 60_000;
export const PLANNER_MAX_OUTPUT_TOKENS = 6_000;

export function getPlannerModel(): string {
  const env = serverEnvironment();
  if (getAIProvider() === "gemini") return env.PLANNER_MODEL?.trim() || env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  return env.PLANNER_MODEL?.trim() || env.OPENAI_PLANNER_MODEL?.trim() || DEFAULT_PLANNER_MODEL;
}

export function getResearchModel(): string {
  const env = serverEnvironment();
  return env.RESEARCH_MODEL?.trim() || env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}

export function getReviewerModel(): string {
  return serverEnvironment().REVIEWER_MODEL?.trim() || getResearchModel();
}
export function getOutreachModel(): string {
  return serverEnvironment().OUTREACH_MODEL?.trim() || getResearchModel();
}
