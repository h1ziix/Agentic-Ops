import { z } from "zod";
import { followUpRowSchema, emailEnvelopeSchema } from "./execution";
import { agentMetricsSchema } from "./agent";

export const automationJobTypeSchema = z.enum(["workflow_continue", "research_retry", "external_action_retry", "followup_due", "reply_check", "workflow_health_check", "stale_run_recovery"]);
export const automationJobStatusSchema = z.enum(["scheduled", "queued", "running", "retry_scheduled", "completed", "failed", "cancelled"]);
export const automationErrorCategorySchema = z.enum(["validation", "authorization", "provider_auth", "rate_limit", "network", "timeout", "provider_error", "invalid_state", "duplicate", "unknown_execution_state", "internal"]);
export const automationInputSchema = z.object({ retry: z.boolean().optional(), expectedSnapshotId: z.uuid().optional(), attemptId: z.uuid().optional(), planId: z.uuid().optional(),
  iteration: z.number().int().min(0).max(500).optional(), developmentTest: z.literal(true).optional(), scope: z.enum(["planning", "research", "preparation", "execution"]).optional() }).strict();
const safeResultSchema = z.record(z.string().max(80), z.union([z.string().max(1000), z.number().finite(), z.boolean(), z.null()]));
export const automationJobRowSchema = z.object({
  id: z.uuid(), workspace_id: z.uuid(), workflow_id: z.uuid(), workflow_task_id: z.uuid().nullable(), lead_id: z.uuid().nullable(),
  proposed_action_id: z.uuid().nullable(), follow_up_plan_id: z.uuid().nullable(), actor_id: z.uuid(), job_type: automationJobTypeSchema,
  status: automationJobStatusSchema, provider: z.literal("trigger"), provider_job_id: z.string().nullable(), scheduled_for: z.string(),
  started_at: z.string().nullable(), completed_at: z.string().nullable(), cancelled_at: z.string().nullable(), attempt_count: z.number().int().min(0).max(5),
  max_attempts: z.number().int().min(1).max(5), idempotency_key: z.string().min(1).max(240), input: automationInputSchema,
  result: safeResultSchema.nullable(), error_category: automationErrorCategorySchema.nullable(), error_code: z.string().nullable(), error_summary: z.string().nullable(),
  retryable: z.boolean(), next_retry_at: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
});
export const automationClaimRowSchema = automationJobRowSchema.extend({ claim_token: z.uuid().nullable(), lease_until: z.string().nullable() });
export const automationFollowUpRowSchema = followUpRowSchema.extend({
  automation_status: z.enum(["inactive", "scheduled", "due", "drafting", "waiting_for_approval", "approved", "completed", "skipped_reply_detected", "failed", "cancelled"]),
  lead_id: z.uuid().nullable(), company_id: z.uuid().nullable(), draft_action_id: z.uuid().nullable(), last_reply_at: z.string().nullable(),
  last_checked_at: z.string().nullable(), completed_at: z.string().nullable(), updated_at: z.string(),
});
export const replyObservationRowSchema = z.object({ id: z.uuid(), workspace_id: z.uuid(), workflow_id: z.uuid(), lead_id: z.uuid(), parent_attempt_id: z.uuid(),
  connection_id: z.uuid(), authorization_generation: z.number().int().positive(), external_thread_id: z.string().max(240), external_message_id: z.string().max(240),
  received_at: z.string(), detected_at: z.string(), processed_at: z.string() });
export const automationSnapshotSchema = z.object({ jobs: z.array(automationJobRowSchema), followUps: z.array(automationFollowUpRowSchema), replies: z.array(replyObservationRowSchema) });
export const automationMutationSchema = z.object({ operation: z.enum(["cancel", "retry"]) }).strict();
export const followupMetricsSchema = agentMetricsSchema.omit({ taskCount: true }).extend({ model: z.string().min(1).max(200) }).strict();
export const followupFailureSchema = z.object({ runId: z.uuid(), metrics: followupMetricsSchema,
  error: z.object({ code: z.string().regex(/^[a-z_]+$/).max(100), message: z.string().min(1).max(600), category: automationErrorCategorySchema }).strict() }).strict();
export const followupPublishSchema = z.object({ envelope: emailEnvelopeSchema, metrics: followupMetricsSchema }).strict();
