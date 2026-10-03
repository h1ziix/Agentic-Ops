import "server-only";
import { z } from "zod";
import { createRuntimeClient } from "@/lib/supabase/admin";
import type { AutomationContext, AutomationClaim, AutomationJob } from "@/types/automation";
import { AutomationRepository, AUTOMATION_JOB_COLUMNS } from "../repositories/automation-repository";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { ExecutionRepository } from "../repositories/execution-repository";
import { AppError } from "../errors";
import { IntegrationError } from "../integrations/http";
import { requireAutomation } from "./config";
import { automationRuntime } from "./runtime-factory";
import { TriggerJobScheduler, type JobScheduler } from "./scheduler";
import { runClaimedJob } from "./job-runner";
import { prepareFollowup, monitorFollowup } from "./followup-handler";
import { createReplyScheduleStore, discoverReplyContexts, scheduleReplyChecks } from "./reply-scheduler";
import { automationJobRowSchema } from "@/lib/validation/automation";
import { recoverWorkflowHealth, reconcileAutomationCandidate, type RecoveryRun } from "./health-recovery";
import { resolveFollowupActor } from "./followup-actor";

export async function authorizeAutomation(context: AutomationContext) {
  const { data, error } = await createRuntimeClient().from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).eq("user_id", context.userId).maybeSingle();
  if (error || !data) throw new AppError("unauthorized");
}
export async function dispatchJob(job: AutomationJob, repository: AutomationRepository, scheduler: JobScheduler = new TriggerJobScheduler()) {
  if (!["scheduled", "queued", "retry_scheduled"].includes(job.status) || job.provider_job_id) return job;
  const context = { workspaceId: job.workspace_id, userId: job.actor_id };
  try { return await repository.bindProvider(context, job.id, await scheduler.scheduleJob(job)); }
  catch { return await repository.dispatchFailed(context, job.id); }
}
async function executeJob(job: AutomationClaim, context: AutomationContext): Promise<NonNullable<AutomationJob["result"]>> {
  const db = createRuntimeClient(); const workflows = new WorkflowRepository(db); const repository = new AutomationRepository(db);
  const workflow = await workflows.getWorkflowById(context.workspaceId, job.workflow_id);
  if (!workflow || workflow.status === "cancelled") throw new AppError("invalid_transition");
  if (job.job_type === "followup_due") return prepareFollowup(db, context, job);
  if (job.job_type === "reply_check") {
    if (!job.follow_up_plan_id) throw new AppError("validation");
    const result = await monitorFollowup(db, context, job.follow_up_plan_id);
    if (!result.monitored) throw new AppError("execution_blocked", "Gmail read access is required for reply monitoring.");
    return result;
  }
  if (job.job_type === "workflow_health_check" || job.job_type === "stale_run_recovery") {
    await new ExecutionRepository(db).recover({ ...context, workflowId: workflow.id });
    const current = await workflows.getWorkflowById(context.workspaceId, workflow.id);
    if (!current) throw new AppError("not_found");
    const scheduler = new TriggerJobScheduler();
    return recoverWorkflowHealth(context, current, job.id, {
      listJobs: async () => {
        const result = await db.from("automation_jobs").select(`${AUTOMATION_JOB_COLUMNS},lease_until`).eq("workspace_id", context.workspaceId).eq("workflow_id", workflow.id)
          .in("status", ["scheduled", "queued", "running", "retry_scheduled"]).order("scheduled_for").limit(100);
        if (result.error) throw new AppError("database");
        return z.array(automationJobRowSchema.extend({ lease_until: z.string().nullable() })).parse(result.data);
      },
      listRuns: async (): Promise<RecoveryRun[]> => {
        const result = await db.from("agent_runs").select("id,agent_type,status,started_at").eq("workspace_id", context.workspaceId).eq("workflow_id", workflow.id)
          .eq("status", "running").neq("agent_type", "executor").order("started_at", { ascending: false }).limit(20);
        if (result.error) throw new AppError("database");
        return z.array(z.object({ id: z.uuid(), agent_type: z.string(), status: z.string(), started_at: z.string().nullable() })).parse(result.data);
      },
      recover: repository.recover.bind(repository), reconcileProvider: repository.reconcileProvider.bind(repository),
      get: repository.get.bind(repository), schedule: repository.schedule.bind(repository),
    }, scheduler.getJobStatus.bind(scheduler), authorizeAutomation, (saved) => dispatchJob(saved, repository, scheduler));
  }
  if (job.job_type === "external_action_retry") {
    if (!job.proposed_action_id || !job.input.expectedSnapshotId) throw new AppError("validation");
    const attempt = await automationRuntime(db, context.workspaceId).executeAction({ ...context, workflowId: workflow.id,
      actionId: job.proposed_action_id, expectedSnapshotId: job.input.expectedSnapshotId, retry: true });
    // The executor has persisted the provider disposition. Exceptions never authorize resend.
    if (attempt.status === "failed_retryable" && attempt.retry_eligible) throw new IntegrationError(attempt.safe_error_code ?? "execution_retryable", "retryable",
      attempt.next_retry_at ? Math.max(0, Math.ceil((Date.parse(attempt.next_retry_at) - Date.now()) / 1000)) : 0);
    if (attempt.status !== "succeeded") throw new IntegrationError(attempt.safe_error_code ?? "execution_attention",
      attempt.status === "outcome_unknown" ? "unknown" : "blocked");
    return { attemptId: attempt.id, executionStatus: attempt.status };
  }
  const planning = workflow.status === "planning" || (workflow.status === "failed" && job.input.scope === "planning");
  if (!planning && workflow.status !== "running") return { stopped: true, workflowStatus: workflow.status };
  const runtime = automationRuntime(db, context.workspaceId, planning ? "planning" : "research");
  const request = { ...context, workflowId: workflow.id };
  const result = planning ? await runtime.planWorkflow(request) : await runtime.researchWorkflow({ ...request,
    retry: job.job_type === "research_retry" || job.input.retry === true || job.attempt_count > 1 });
  if (result.status === "failed") throw new AppError("invalid_transition", "Research requires an explicit recovery decision.");
  const saved = await workflows.getWorkflowById(context.workspaceId, workflow.id);
  return { stepStatus: result.status, continue: Boolean(saved && ["planning", "running"].includes(saved.status)),
    scope: saved?.status === "planning" ? "planning" : "research", inProgress: result.status === "in_progress" };
}
export async function runAutomationJob(jobId: string, providerRunId: string) {
  requireAutomation(); const repository = new AutomationRepository(createRuntimeClient());
  const saved = await repository.get(z.uuid().parse(jobId));
  if (saved.provider_job_id && saved.provider_job_id !== providerRunId) throw new AppError("unauthorized");
  const result = await runClaimedJob(saved.id, repository, authorizeAutomation, executeJob);
  const pending = (await repository.list(saved.workspace_id, saved.workflow_id)).jobs.filter((entry) => ["scheduled", "retry_scheduled"].includes(entry.status) && !entry.provider_job_id);
  for (const job of pending.slice(0, 10)) await dispatchJob(job, repository);
  return { id: result.id, status: result.status };
}
export async function sweepAutomation() {
  requireAutomation(); const db = createRuntimeClient(); const repository = new AutomationRepository(db);
  const candidates = await db.from("automation_jobs").select(`${AUTOMATION_JOB_COLUMNS},lease_until`).in("status", ["scheduled", "queued", "retry_scheduled", "running"])
    .or(`provider_job_id.is.null,scheduled_for.lte.${new Date().toISOString()}`).order("updated_at").limit(40);
  if (candidates.error) throw new AppError("database");
  const rows = z.array(automationJobRowSchema.extend({ lease_until: z.string().nullable() })).parse(candidates.data);
  const contexts = new Map(rows.map((row) => [`${row.workspace_id}:${row.actor_id}`, { workspaceId: row.workspace_id, userId: row.actor_id }]));
  // Saved approved plans form an outbox even when the request died before its job was scheduled.
  const plansResponse = await db.from("follow_up_plans").select("workspace_id,snapshot_id").eq("status", "planned").eq("automation_status", "inactive").order("created_at").limit(20);
  if (plansResponse.error) throw new AppError("database");
  const plans = z.array(z.object({ workspace_id: z.uuid(), snapshot_id: z.uuid() })).parse(plansResponse.data);
  if (plans.length) {
    const snapshots = await db.from("action_approval_snapshots").select("id,workspace_id,approved_by").in("id", plans.map((plan) => plan.snapshot_id));
    if (snapshots.error) throw new AppError("database");
    for (const snapshot of z.array(z.object({ id: z.uuid(), workspace_id: z.uuid(), approved_by: z.uuid() })).parse(snapshots.data))
      if (plans.some((plan) => plan.workspace_id === snapshot.workspace_id && plan.snapshot_id === snapshot.id))
        contexts.set(`${snapshot.workspace_id}:${snapshot.approved_by}`, { workspaceId: snapshot.workspace_id, userId: snapshot.approved_by });
  }
  for (const context of await discoverReplyContexts(db)) contexts.set(`${context.workspaceId}:${context.userId}`, context);
  let processed = 0; let replyChecksScheduled = 0; const scheduler = new TriggerJobScheduler(); const checkedPlans = new Set<string>();
  for (const context of contexts.values()) {
    try { await authorizeAutomation(context); }
    catch { continue; }
    for (const job of rows.filter((entry) => entry.workspace_id === context.workspaceId && entry.actor_id === context.userId)) {
      const result = await reconcileAutomationCandidate(job, repository, scheduler.getJobStatus.bind(scheduler));
      if (result.protectedWorker) continue;
      await dispatchJob(result.job, repository, scheduler); processed++;
    }
    for (const plan of await repository.duePlans(context.workspaceId)) {
      if (checkedPlans.has(plan.id)) continue;
      checkedPlans.add(plan.id);
      const actor = await resolveFollowupActor(db, plan);
      if (!actor) continue;
      const existing = (await repository.list(context.workspaceId, plan.workflow_id)).jobs.some((job) => job.follow_up_plan_id === plan.id && job.job_type === "followup_due");
      if (!existing) await dispatchJob(await repository.schedule({ ...actor, workflowId: plan.workflow_id, followUpPlanId: plan.id,
        leadId: plan.lead_id ?? undefined, jobType: "followup_due", scheduledFor: plan.due_at, idempotencyKey: `followup:${plan.id}:v1`, input: { planId: plan.id } }), repository);
    }
    const replyChecks = await scheduleReplyChecks(context, createReplyScheduleStore(db, repository), (job) => dispatchJob(job, repository, scheduler));
    replyChecksScheduled += replyChecks.scheduled;
  }
  return { processed, replyChecksScheduled };
}
