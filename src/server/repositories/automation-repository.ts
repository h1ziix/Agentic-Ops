import "server-only";
import { z } from "zod";
import { automationClaimRowSchema, automationFollowUpRowSchema, automationJobRowSchema, replyObservationRowSchema, followupPublishSchema, followupFailureSchema } from "@/lib/validation/automation";
import { proposedActionRowSchema, agentRunRowSchema } from "@/lib/validation/rows";
import type { EmailEnvelope } from "@/lib/validation/execution";
import type { AutomationCompletion, AutomationContext, FollowupMetrics, ScheduleAutomationInput, AutomationSnapshot } from "@/types/automation";
import type { ServerSupabase } from "../auth/context";
import { AppError, fromDatabaseError } from "../errors";
import { parseDatabaseResult } from "./parse";

export const AUTOMATION_JOB_COLUMNS = "id,workspace_id,workflow_id,workflow_task_id,lead_id,proposed_action_id,follow_up_plan_id,actor_id,job_type,status,provider,provider_job_id,scheduled_for,started_at,completed_at,cancelled_at,attempt_count,max_attempts,idempotency_key,input,result,error_category,error_code,error_summary,retryable,next_retry_at,created_at,updated_at";
export class AutomationRepository {
  constructor(private readonly db: ServerSupabase) {}
  private async rpc(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw fromDatabaseError(name, error);
    return data as unknown;
  }
  private args(context: AutomationContext) { return { p_workspace: context.workspaceId, p_actor: context.userId }; }
  async list(workspaceId: string, workflowId?: string): Promise<AutomationSnapshot> {
    const read = async (table: string, columns: string, order: string, statuses?: string[]) => {
      let query = this.db.from(table).select(columns).eq("workspace_id", workspaceId);
      if (workflowId) query = query.eq("workflow_id", workflowId);
      if (statuses) query = query.in("status", statuses);
      const { data, error } = await query.order(order, { ascending: false }).limit(100);
      if (error) throw fromDatabaseError(`automation_${table}`, error);
      return data as unknown;
    };
    const [activeJobs, failedJobs, recentJobs, followUps, replies] = await Promise.all([
      read("automation_jobs", AUTOMATION_JOB_COLUMNS, "updated_at", ["scheduled", "queued", "running", "retry_scheduled"]),
      read("automation_jobs", AUTOMATION_JOB_COLUMNS, "updated_at", ["failed"]),
      read("automation_jobs", AUTOMATION_JOB_COLUMNS, "created_at", ["completed", "cancelled"]), read("follow_up_plans", "*", "created_at"), read("reply_observations", "*", "detected_at")]);
    return { jobs: [...parseDatabaseResult(z.array(automationJobRowSchema), activeJobs, "automation_jobs_active"), ...parseDatabaseResult(z.array(automationJobRowSchema), failedJobs, "automation_jobs_failed"),
      ...parseDatabaseResult(z.array(automationJobRowSchema), recentJobs, "automation_jobs_recent")], followUps: parseDatabaseResult(z.array(automationFollowUpRowSchema), followUps, "automation_followups"),
      replies: parseDatabaseResult(z.array(replyObservationRowSchema), replies, "automation_replies") };
  }
  async get(jobId: string, workspaceId?: string) {
    let query = this.db.from("automation_jobs").select(AUTOMATION_JOB_COLUMNS).eq("id", jobId);
    if (workspaceId) query = query.eq("workspace_id", workspaceId);
    const { data, error } = await query.maybeSingle();
    if (error) throw fromDatabaseError("automation_get", error);
    if (!data) throw new AppError("not_found");
    return parseDatabaseResult(automationJobRowSchema, data, "automation_get");
  }
  async schedule(input: ScheduleAutomationInput) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("schedule_automation_job", { ...this.args(input), p_workflow: input.workflowId,
      p_job_type: input.jobType, p_scheduled: input.scheduledFor, p_key: input.idempotencyKey, p_input: input.input ?? {}, p_task: input.workflowTaskId ?? null,
      p_lead: input.leadId ?? null, p_action: input.proposedActionId ?? null, p_plan: input.followUpPlanId ?? null, p_max_attempts: input.maxAttempts ?? 3 }), "automation_schedule");
  }
  async bindProvider(context: AutomationContext, jobId: string, providerJobId: string) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("bind_automation_provider", { ...this.args(context), p_job: jobId, p_provider_id: providerJobId }), "automation_bind");
  }
  async dispatchFailed(context: AutomationContext, jobId: string) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("mark_automation_dispatch_failure", { ...this.args(context), p_job: jobId }), "automation_dispatch_failure");
  }
  async reconcileProvider(context: AutomationContext, jobId: string, providerJobId: string, providerStatus: string) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("reconcile_automation_provider", { ...this.args(context), p_job: jobId,
      p_provider_id: providerJobId, p_provider_status: providerStatus }), "automation_provider_reconcile");
  }
  async sweepCandidates(limit = 50) {
    const { data, error } = await this.db.from("automation_jobs").select(AUTOMATION_JOB_COLUMNS).in("status", ["scheduled", "queued", "retry_scheduled"])
      .is("provider_job_id", null).order("scheduled_for").limit(Math.min(100, Math.max(1, limit)));
    if (error) throw fromDatabaseError("automation_outbox", error);
    return parseDatabaseResult(z.array(automationJobRowSchema), data, "automation_outbox");
  }
  async claim(context: AutomationContext, jobId: string, claimToken: string) {
    return parseDatabaseResult(automationClaimRowSchema, await this.rpc("claim_automation_job", { ...this.args(context), p_job: jobId, p_claim: claimToken }), "automation_claim");
  }
  async finish(context: AutomationContext, jobId: string, claimToken: string, input: AutomationCompletion) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("finish_automation_job", { ...this.args(context), p_job: jobId, p_claim: claimToken, p_status: input.status,
      p_result: input.result ?? null, p_category: input.errorCategory ?? null, p_code: input.errorCode ?? null, p_summary: input.errorSummary ?? null,
      p_retryable: input.retryable ?? false, p_retry_at: input.retryAt ?? null }), "automation_finish");
  }
  async cancel(context: AutomationContext, jobId: string) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("cancel_automation_job", { ...this.args(context), p_job: jobId }), "automation_cancel");
  }
  async retry(context: AutomationContext, jobId: string) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("retry_automation_job", { ...this.args(context), p_job: jobId }), "automation_retry");
  }
  async recover(context: AutomationContext, workflowId?: string, jobId?: string) {
    return z.number().int().parse(await this.rpc("recover_automation_jobs", { ...this.args(context), p_workflow: workflowId ?? null, p_job: jobId ?? null }));
  }
  async listFollowups(workspaceId: string, workflowId?: string) {
    let query = this.db.from("follow_up_plans").select("*").eq("workspace_id", workspaceId);
    if (workflowId) query = query.eq("workflow_id", workflowId);
    const { data, error } = await query.order("created_at", { ascending: false }).limit(100);
    if (error) throw fromDatabaseError("automation_followups", error);
    return parseDatabaseResult(z.array(automationFollowUpRowSchema), data, "automation_followups");
  }
  async getFollowup(workspaceId: string, planId: string) {
    const { data, error } = await this.db.from("follow_up_plans").select("*").eq("workspace_id", workspaceId).eq("id", planId).maybeSingle();
    if (error) throw fromDatabaseError("automation_followup_get", error);
    if (!data) throw new AppError("not_found");
    return parseDatabaseResult(automationFollowUpRowSchema, data, "automation_followup_get");
  }
  async duePlans(workspaceId: string, limit = 20) {
    const { data, error } = await this.db.from("follow_up_plans").select("*").eq("workspace_id", workspaceId).eq("status", "planned")
      .in("automation_status", ["inactive", "scheduled", "due", "failed"]).order("due_at").limit(Math.min(20, Math.max(1, limit)));
    if (error) throw fromDatabaseError("automation_due_plans", error);
    return parseDatabaseResult(z.array(automationFollowUpRowSchema), data, "automation_due_plans");
  }
  async publishFollowupDraft(context: AutomationContext, planId: string, claimToken: string, envelope: EmailEnvelope, metrics: FollowupMetrics) {
    const value = followupPublishSchema.parse({ envelope, metrics });
    return parseDatabaseResult(proposedActionRowSchema, await this.rpc("publish_followup_draft", { ...this.args(context), p_plan: planId, p_claim: claimToken,
      p_envelope: value.envelope, p_metrics: value.metrics }), "automation_publish_followup");
  }
  async markFollowup(context: AutomationContext, planId: string, claimToken: string, status: "due" | "drafting" | "failed" | "skipped_reply_detected") {
    return parseDatabaseResult(automationFollowUpRowSchema, await this.rpc("mark_automation_followup", { ...this.args(context), p_plan: planId, p_claim: claimToken, p_status: status }), "automation_mark_followup");
  }
  async recordReply(context: AutomationContext, input: { parentAttemptId: string; connectionId: string; generation: number; threadId: string; messageId: string; receivedAt: string; sender: string }) {
    return parseDatabaseResult(replyObservationRowSchema, await this.rpc("record_automation_reply", { ...this.args(context), p_parent: input.parentAttemptId,
      p_connection: input.connectionId, p_generation: input.generation, p_thread: input.threadId, p_message: input.messageId, p_received: input.receivedAt, p_sender: input.sender }), "automation_record_reply");
  }
  async failFollowupRun(context: AutomationContext, jobId: string, claimToken: string, runId: string, metrics: FollowupMetrics,
    error: { code: string; message: string; category: import("@/types/automation").AutomationErrorCategory }) {
    const value = followupFailureSchema.parse({ runId, metrics, error });
    return parseDatabaseResult(agentRunRowSchema, await this.rpc("fail_automation_followup_run", { ...this.args(context), p_job: jobId,
      p_claim: claimToken, p_run: value.runId, p_metrics: value.metrics, p_error: value.error }), "automation_fail_followup_run");
  }
  async recordReplyCheck(context: AutomationContext, planId: string, connectionId: string, generation: number) {
    return parseDatabaseResult(automationFollowUpRowSchema, await this.rpc("record_automation_reply_check", { ...this.args(context), p_plan: planId, p_connection: connectionId, p_generation: generation }), "automation_reply_check");
  }
  async scheduleFollowupTest(context: AutomationContext, planId: string) {
    return parseDatabaseResult(automationJobRowSchema, await this.rpc("schedule_automation_followup_test", { ...this.args(context), p_plan: planId }), "automation_followup_test");
  }
}
