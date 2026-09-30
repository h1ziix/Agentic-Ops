// The SDK's own retries are disabled; AgentRuntime owns the bounded retry policy.
export const DEFAULT_PLANNER_MODEL = "gpt-4.1-mini";
export const PLANNER_MAX_ATTEMPTS = 2;
export const PLANNER_TIMEOUT_MS = 60_000;
export const PLANNER_MAX_OUTPUT_TOKENS = 6_000;

export function getPlannerModel(): string {
  return process.env.OPENAI_PLANNER_MODEL?.trim() || DEFAULT_PLANNER_MODEL;
}
