import { AppError } from "../errors";
import { IntegrationError } from "../integrations/http";
import { ResearchError } from "../agents/research-budget";
import type { AutomationErrorCategory } from "@/types/automation";

export interface JobFailure { category: AutomationErrorCategory; code: string; summary: string; retryable: boolean; delayMs: number }
/** A normalized policy surrounds the existing bounded agent/provider retry policies. */
export function jobFailure(error: unknown, attempt: number, external = false): JobFailure {
  let category: AutomationErrorCategory = "internal"; let code = "job_failed"; let retryable = false;
  if (error instanceof IntegrationError) {
    code = error.code; retryable = error.disposition === "retryable";
    category = error.disposition === "unknown" ? "unknown_execution_state" : error.disposition === "blocked" ? "provider_auth"
      : error.code.includes("rate") ? "rate_limit" : "provider_error";
  } else if (error instanceof ResearchError) {
    code = error.code; retryable = error.retryable; category = error.code.includes("rate") ? "rate_limit" : error.code.includes("timeout") ? "timeout" : "provider_error";
  } else if (error instanceof AppError) {
    code = error.code; retryable = ["ai_unavailable", "ai_timeout", "database"].includes(code);
    category = code === "ai_timeout" ? "timeout" : code === "ai_unavailable" ? "provider_error" : code === "unauthenticated" || code === "unauthorized" ? "authorization"
      : ["ai_configuration", "integration_configuration", "execution_blocked"].includes(code) ? "provider_auth"
      : code === "validation" || code === "ai_invalid_output" ? "validation" : code === "invalid_transition" ? "invalid_state" : "internal";
  }
  // An exception after an external dispatch does not prove that nothing happened.
  if (external && !(error instanceof IntegrationError && error.disposition !== "unknown")) { category = "unknown_execution_state"; retryable = false; }
  return { category, code, retryable, delayMs: Math.min(3_600_000, Math.max(error instanceof IntegrationError ? error.retryAfterSeconds * 1000 : 0,
    60_000 * 2 ** Math.max(0, attempt - 1))),
    summary: category === "unknown_execution_state" ? "External result requires reconciliation. Automatic resend is blocked."
      : retryable ? "A temporary operation failure was recorded. Recovery is bounded."
      : "The operation needs attention before it can continue." };
}
export function isStaleRun(status: string, startedAt: string | null, now = Date.now(), thresholdMs = 240_000) {
  return status === "running" && startedAt !== null && Number.isFinite(Date.parse(startedAt)) && now - Date.parse(startedAt) > thresholdMs;
}
