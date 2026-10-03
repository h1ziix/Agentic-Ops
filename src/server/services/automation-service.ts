import "server-only";
import { z } from "zod";
import { createRuntimeClient } from "@/lib/supabase/admin";
import { requireWorkspace } from "../auth/context";
import { AutomationRepository } from "../repositories/automation-repository";
import { ExecutionRepository } from "../repositories/execution-repository";
import { WorkflowRepository } from "../repositories/workflow-repository";
import { automationConfiguration, requireAutomation } from "../automation/config";
import { dispatchJob } from "../automation/worker";
import { TriggerJobScheduler } from "../automation/scheduler";
import { resolveFollowupActor } from "../automation/followup-actor";
import { AppError } from "../errors";
import { serverEnvironment } from "../config/env";

export async function listAutomation(workflowId?: string) {
  const context = await requireWorkspace();
  const id = workflowId ? z.uuid().parse(workflowId) : undefined;
  if (id && !await new WorkflowRepository(context.supabase).getWorkflowById(context.workspace.id, id)) throw new AppError("not_found");
  const { enabled, providerConfigured } = automationConfiguration();
  const env = serverEnvironment();
  return { automation: await new AutomationRepository(context.supabase).list(context.workspace.id, id), enabled, providerConfigured,
    testJobsAllowed: env.NODE_ENV === "development" && env.AUTOMATION_ALLOW_TEST_JOBS === "true" };
}
export async function scheduleWorkflowAutomation(workflowId: string, operation: "continue" | "health_check" | "recover" = "continue", retry = false) {
  requireAutomation(); const id = z.uuid().parse(workflowId); const context = await requireWorkspace();
  const workflow = await new WorkflowRepository(context.supabase).getWorkflowById(context.workspace.id, id);
  if (!workflow) throw new AppError("not_found");
  const repository = new AutomationRepository(createRuntimeClient());
  const active = (await repository.list(context.workspace.id, id)).jobs.find((job) => ["scheduled", "queued", "running", "retry_scheduled"].includes(job.status)
    && (operation === "continue" ? ["workflow_continue", "research_retry"].includes(job.job_type) : job.job_type === (operation === "recover" ? "stale_run_recovery" : "workflow_health_check")));
  if (active) return dispatchJob(active, repository);
  const job = await repository.schedule({ workspaceId: context.workspace.id, userId: context.user.id, workflowId: id,
    jobType: operation === "recover" ? "stale_run_recovery" : operation === "health_check" ? "workflow_health_check" : retry ? "research_retry" : "workflow_continue",
    scheduledFor: new Date().toISOString(), idempotencyKey: `${operation}:${id}:${workflow.updated_at}:${retry ? "retry" : "v1"}`,
    input: { retry, scope: workflow.status === "planning" || workflow.status === "failed" && !(await new WorkflowRepository(context.supabase).listWorkflowTasks(context.workspace.id, id)).length ? "planning" : "research", iteration: 0 } });
  return dispatchJob(job, repository);
}
export async function mutateAutomationJob(jobId: string, operation: "retry" | "cancel") {
  const id = z.uuid().parse(jobId); const context = await requireWorkspace(); const repository = new AutomationRepository(createRuntimeClient());
  const actor = { workspaceId: context.workspace.id, userId: context.user.id }; const saved = await repository.get(id, actor.workspaceId);
  if (operation === "retry") { requireAutomation(); return dispatchJob(await repository.retry(actor, saved.id), repository); }
  const cancelled = await repository.cancel(actor, saved.id);
  if (saved.provider_job_id) { try { await new TriggerJobScheduler().cancelJob(saved.provider_job_id); } catch { /* Database cancellation is authoritative at every claim. */ } }
  return cancelled;
}
export async function scheduleExecutionRetry(workflowId: string, actionId: string, expectedSnapshotId: string) {
  requireAutomation(); const context = await requireWorkspace(); const workflow = z.uuid().parse(workflowId);
  const action = z.uuid().parse(actionId); const snapshot = z.uuid().parse(expectedSnapshotId);
  const attempt = await new ExecutionRepository(context.supabase).getLatestAttempt(context.workspace.id, workflow, action, snapshot);
  if (!attempt || attempt.status !== "failed_retryable" || !attempt.retry_eligible || attempt.attempt_number >= 3) throw new AppError("execution_blocked");
  const repository = new AutomationRepository(createRuntimeClient());
  return dispatchJob(await repository.schedule({ workspaceId: context.workspace.id, userId: context.user.id, workflowId: workflow,
    proposedActionId: action, jobType: "external_action_retry", scheduledFor: attempt.next_retry_at ?? new Date().toISOString(),
    idempotencyKey: `execution:${snapshot}:${attempt.id}`, input: { expectedSnapshotId: snapshot, attemptId: attempt.id }, maxAttempts: 3 - attempt.attempt_number }), repository);
}
/** Backfill only plans the user already separately approved and executed in Release 0.6. */
export async function activateApprovedFollowups(workflowId?: string) {
  requireAutomation(); const context = await requireWorkspace(); const admin = createRuntimeClient(); const repository = new AutomationRepository(admin);
  const plans = (await repository.listFollowups(context.workspace.id, workflowId)).filter((plan) => plan.status === "planned" && ["inactive", "scheduled"].includes(plan.automation_status));
  const jobs = [];
  for (const plan of plans.slice(0, 20)) {
    const actor = await resolveFollowupActor(admin, plan);
    if (!actor) continue;
    jobs.push(await dispatchJob(await repository.schedule({ ...actor, workflowId: plan.workflow_id, followUpPlanId: plan.id,
      leadId: plan.lead_id ?? undefined, jobType: "followup_due", scheduledFor: plan.due_at,
      idempotencyKey: `followup:${plan.id}:v1`, input: { planId: plan.id } }), repository));
  }
  return jobs;
}
export async function mutateFollowup(planId: string, operation: "cancel" | "test_due") {
  const id = z.uuid().parse(planId); const context = await requireWorkspace(); const admin = createRuntimeClient(); const repository = new AutomationRepository(admin);
  const plan = await repository.getFollowup(context.workspace.id, id);
  if (operation === "cancel") {
    await new ExecutionRepository(context.supabase).rpc("cancel_follow_up", { p_plan: id });
    return { cancelled: true };
  }
  requireAutomation();
  const env = serverEnvironment();
  if (env.NODE_ENV !== "development" || env.AUTOMATION_ALLOW_TEST_JOBS !== "true") throw new AppError("unauthorized");
  const actor = await resolveFollowupActor(admin, plan);
  if (!actor) throw new AppError("execution_blocked", "The plan's approver must still have workspace access and owner access for reply monitoring.");
  // A near-term test advances internal draft preparation only; it cannot authorize an email.
  const old = (await repository.list(actor.workspaceId, plan.workflow_id)).jobs.find((job) => job.follow_up_plan_id === plan.id
    && job.job_type === "followup_due" && ["scheduled", "queued", "retry_scheduled"].includes(job.status));
  const job = await repository.scheduleFollowupTest(actor, plan.id);
  if (old?.provider_job_id) { try { await new TriggerJobScheduler().cancelJob(old.provider_job_id); } catch { /* Updated database claim fences old callbacks. */ } }
  return dispatchJob(job, repository);
}
