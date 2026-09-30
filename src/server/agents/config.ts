// The SDK's own retries are disabled; AgentRuntime owns the bounded retry policy.
export const DEFAULT_PLANNER_MODEL = "gpt-4.1-mini";
export const PLANNER_MAX_ATTEMPTS = 2;
export const PLANNER_TIMEOUT_MS = 60_000;
export const PLANNER_MAX_OUTPUT_TOKENS = 6_000;

export function getPlannerModel(): string {
  if (process.env.AI_PROVIDER?.trim() === "gemini") return process.env.PLANNER_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
  return process.env.PLANNER_MODEL?.trim() || process.env.OPENAI_PLANNER_MODEL?.trim() || DEFAULT_PLANNER_MODEL;
}

export function getResearchModel(): string {
  return process.env.RESEARCH_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash-lite";
}
