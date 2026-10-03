import type { AutomationJob } from "@/types/automation";

export const jobTypeLabels: Record<AutomationJob["job_type"], string> = {
  workflow_continue: "Workflow continuation",
  research_retry: "Research retry",
  external_action_retry: "Approved action retry",
  followup_due: "Follow-up preparation",
  reply_check: "Reply check",
  workflow_health_check: "Workflow health check",
  stale_run_recovery: "Stale run recovery",
};

export function canCancelJob(job: AutomationJob) { return ["queued", "scheduled", "retry_scheduled"].includes(job.status); }
export function canRetryJob(job: AutomationJob) { return job.status === "failed" && job.retryable && job.attempt_count < job.max_attempts && job.error_category !== "unknown_execution_state"; }
export function jobExplanation(job: AutomationJob) {
  if (job.job_type === "followup_due") return "Checks the saved follow-up plan and prepares a draft for a new human approval. This job does not send email.";
  if (job.job_type === "reply_check") return "Checks the known Gmail thread only when separately granted read access is available. A detected reply cancels future follow-up work.";
  if (job.job_type === "external_action_retry") return "Reuses the exact approved snapshot only after a definitive retryable failure. Unknown external outcomes remain blocked for reconciliation.";
  if (["workflow_health_check", "stale_run_recovery"].includes(job.job_type)) return "Inspects persisted run leases and recovers only operations that are safe to continue. External dispatch uncertainty is preserved.";
  return "Continues the existing workflow through bounded research and preparation tasks. Saved results and human approval gates are preserved.";
}

export function formatDuration(ms: number | null | undefined) {
  if (ms == null) return "Unknown";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function formatTokens(value: number | null | undefined) { return value == null ? "Unknown" : new Intl.NumberFormat("en-US", { notation: value >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value); }
export function formatEstimatedCost(value: number | null | undefined) { return value == null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: value > 0 && value < 0.01 ? 4 : 2, maximumFractionDigits: 4 }).format(value); }
