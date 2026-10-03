import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { emailEnvelopeSchema } from "@/lib/validation/execution";
import { reviewerInputSchema, validateReviewerOutput } from "@/lib/validation/outreach";
import type { AutomationClaim, AutomationContext, AutomationJob } from "@/types/automation";
import type { AgentMetrics } from "@/lib/validation/agent";
import type { ServerSupabase } from "../auth/context";
import { AutomationRepository } from "../repositories/automation-repository";
import { ExecutionRepository } from "../repositories/execution-repository";
import { IntegrationRepository } from "../repositories/integration-repository";
import { IntegrationService } from "../services/integration-service";
import { GmailMonitor, canMonitorReplies } from "../integrations/gmail-monitor";
import { OutreachAgent, runPreparation } from "../agents/outreach-agents";
import { GeminiProvider } from "../agents/gemini-provider";
import { getOutreachModel } from "../agents/config";
import { AppError } from "../errors";
import { jobFailure } from "./retry-policy";
import { EventService } from "../services/event-service";
import { AgentEventRepository } from "../repositories/agent-repositories";

export async function followupContext(db: ServerSupabase, context: AutomationContext, planId: string) {
  const plan = await new AutomationRepository(db).getFollowup(context.workspaceId, planId);
  const execution = new ExecutionRepository(db);
  // Old approved plans remain valid after their parent's execution leaves display windows.
  const attempt = await execution.getAttempt(context.workspaceId, plan.workflow_id, plan.parent_attempt_id);
  if (!attempt || attempt.status !== "succeeded") throw new AppError("invalid_transition");
  const snapshot = await execution.getSnapshot(context.workspaceId, plan.workflow_id, attempt.snapshot_id, attempt.action_id);
  if (!snapshot) throw new AppError("invalid_transition");
  const email = emailEnvelopeSchema.parse(snapshot.envelope);
  const connection = (await new IntegrationRepository(db).list(context.workspaceId)).find((entry) => entry.id === email.connection.id);
  if (!connection || connection.status !== "connected" || connection.generation !== email.connection.generation || connection.provider_identity !== email.connection.identity)
    throw new AppError("execution_blocked", "The original Gmail connection changed. Owner review is required.");
  return { plan, attempt, email, connection };
}
export async function monitorFollowup(db: ServerSupabase, context: AutomationContext, planId: string): Promise<NonNullable<AutomationJob["result"]>> {
  const { plan, attempt, email, connection } = await followupContext(db, context, planId);
  if (plan.status !== "planned" || plan.last_reply_at || ["cancelled", "skipped_reply_detected", "executed"].includes(plan.automation_status))
    throw new AppError("invalid_transition");
  if (!canMonitorReplies(connection.scopes)) return { monitored: false, replies: 0, reason: "gmail_read_scope_required" };
  if (!attempt.result?.threadId || !attempt.result.messageId || !attempt.completed_at) return { monitored: false, replies: 0, reason: "thread_identity_unavailable" };
  const owner = await db.from("workspace_members").select("user_id").eq("workspace_id", context.workspaceId).eq("user_id", context.userId).eq("role", "owner").maybeSingle();
  if (owner.error || !owner.data) throw new AppError("unauthorized");
  const token = await new IntegrationService(new IntegrationRepository(db)).accessToken(connection, context.userId);
  const replies = await new GmailMonitor().replies(attempt.result.threadId, attempt.result.messageId, email.recipient.email,
    attempt.dispatched_at ?? attempt.completed_at, token, connection.scopes);
  await new AutomationRepository(db).recordReplyCheck(context, plan.id, connection.id, connection.generation);
  for (const reply of replies) await new AutomationRepository(db).recordReply(context, { ...reply, parentAttemptId: attempt.id, connectionId: connection.id, generation: connection.generation });
  return { monitored: true, replies: replies.length, planId: plan.id };
}
export async function prepareFollowup(db: ServerSupabase, context: AutomationContext, job: AutomationClaim): Promise<NonNullable<AutomationJob["result"]>> {
  if (!job.follow_up_plan_id || !job.claim_token) throw new AppError("validation");
  const repository = new AutomationRepository(db);
  const previous = await followupContext(db, context, job.follow_up_plan_id);
  if (previous.plan.draft_action_id) return { actionId: previous.plan.draft_action_id, reused: true };
  await repository.markFollowup(context, job.follow_up_plan_id, job.claim_token, "due");
  const monitoring = await monitorFollowup(db, context, job.follow_up_plan_id);
  const { plan, attempt, email } = await followupContext(db, context, job.follow_up_plan_id);
  if (plan.last_reply_at || Number(monitoring.replies) > 0 || plan.automation_status === "skipped_reply_detected") {
    return { skipped: true, reason: "reply_detected" };
  }
  if (plan.draft_action_id) return { actionId: plan.draft_action_id, reused: true };
  await repository.markFollowup(context, plan.id, job.claim_token, "drafting");
  const meta = email.provenance.generationMetadata;
  const workflow = await db.from("workflows").select("goal").eq("id", job.workflow_id).eq("workspace_id", context.workspaceId).single();
  if (workflow.error) throw new AppError("database");
  const input = reviewerInputSchema.parse({ workflowId: job.workflow_id, leadId: email.leadId, companyId: email.companyId, researchRunId: meta.researchRunId,
    goal: z.object({ goal: z.string() }).parse(workflow.data).goal, company: meta.company, score: meta.leadScore, scoreBreakdown: meta.scoreBreakdown,
    opportunity: meta.review.outreachAngle.primaryProblem, confidence: meta.review.confidence,
    uncertainties: meta.researchUncertainties, evidence: meta.review.usableEvidence });
  const review = validateReviewerOutput(meta.review, input);
  const recipient = { name: email.recipient.name, email: email.recipient.email, role: email.recipient.role, companyName: meta.company.name };
  const model = getOutreachModel(); const started = Date.now();
  const metrics: AgentMetrics = { durationMs: 0, retryCount: 0, taskCount: 1, inputTokens: null, outputTokens: null, totalTokens: null };
  const runId = randomUUID();
  try {
  const draft = await runPreparation(() => new OutreachAgent(new GeminiProvider()).followup(input, review, recipient, model, {
    previousSubject: email.subject, previousBody: email.body, sentAt: attempt.completed_at!,
    daysElapsed: Math.max(0, Math.floor((Date.now() - Date.parse(attempt.completed_at!)) / 86_400_000)), replyStatus: monitoring.monitored ? "none_detected" : "unavailable",
  }), async (eventType, summary, metadata) => { await new EventService(new AgentEventRepository(db)).record({ workspaceId: context.workspaceId,
    workflowId: job.workflow_id, eventType, summary, metadata: { ...metadata, job_id: job.id, followup_plan_id: plan.id } }); },
    metrics, async (ms) => { await new Promise<void>((resolve) => setTimeout(resolve, ms)); }, model);
  metrics.durationMs = Date.now() - started;
  const id = randomUUID();
  const envelope = emailEnvelopeSchema.parse({ ...email, actionId: id, snapshotId: randomUUID(), lineageId: id, revision: 1, subject: draft.subject, body: draft.body,
    provenance: { personalization: draft.personalization, evidenceReferences: draft.personalization.claimsUsed,
      generationMetadata: { ...meta, outreachRunId: runId, model, generationSummary: draft.generationSummary } } });
  const { taskCount, ...usageMetrics } = metrics; void taskCount;
  const action = await repository.publishFollowupDraft(context, plan.id, job.claim_token, envelope, { ...usageMetrics, model });
  return { actionId: action.id, approvalRequired: true, monitoringAvailable: monitoring.monitored };
  } catch (error) {
    // A publication response can be lost after the atomic draft/run transaction commits.
    // Read the saved result before reporting failure; never regenerate the paid draft here.
    try {
      const saved = await repository.getFollowup(context.workspaceId, plan.id);
      if (saved?.draft_action_id) return { actionId: saved.draft_action_id, reused: true, approvalRequired: true, monitoringAvailable: monitoring.monitored };
    } catch { /* Leave the original failure disposition available for durable recovery. */ }
    metrics.durationMs = Date.now() - started;
    const { taskCount, ...usageMetrics } = metrics; void taskCount; const failure = jobFailure(error, job.attempt_count);
    await repository.failFollowupRun(context, job.id, job.claim_token, runId, { ...usageMetrics, model },
      { code: failure.code, message: failure.summary, category: failure.category });
    throw error;
  }
}
