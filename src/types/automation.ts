import type { z } from "zod";
import type { automationJobRowSchema, automationClaimRowSchema, automationFollowUpRowSchema, replyObservationRowSchema, automationJobTypeSchema,
  automationInputSchema, automationErrorCategorySchema, followupMetricsSchema } from "@/lib/validation/automation";

export type AutomationJob = z.infer<typeof automationJobRowSchema>;
export type AutomationClaim = z.infer<typeof automationClaimRowSchema>;
export type AutomationJobType = z.infer<typeof automationJobTypeSchema>;
export type AutomationFollowUp = z.infer<typeof automationFollowUpRowSchema>;
export type ReplyObservation = z.infer<typeof replyObservationRowSchema>;
export type AutomationErrorCategory = z.infer<typeof automationErrorCategorySchema>;
export type FollowupMetrics = z.infer<typeof followupMetricsSchema>;
export interface AutomationContext { workspaceId: string; userId: string }
export interface ScheduleAutomationInput extends AutomationContext {
  workflowId: string; jobType: AutomationJobType; scheduledFor: string; idempotencyKey: string;
  input?: z.infer<typeof automationInputSchema>; workflowTaskId?: string; leadId?: string; proposedActionId?: string; followUpPlanId?: string; maxAttempts?: number;
}
export interface AutomationCompletion {
  status: "completed" | "failed"; result?: AutomationJob["result"]; errorCategory?: AutomationErrorCategory;
  errorCode?: string; errorSummary?: string; retryable?: boolean; retryAt?: string;
}
export interface AutomationSnapshot { jobs: AutomationJob[]; followUps: AutomationFollowUp[]; replies: ReplyObservation[] }
